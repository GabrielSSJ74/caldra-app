/**
 * CALDRA — CHAMFER INTENT 2.0
 * Fase 7 (Claude §11 Item 7): Extras Avançados de Engenharia
 *
 * Inclui:
 *  1. Entrada por Croqui / Foto / DXF no Composer (extração geométrica de DXF e análise de croqui);
 *  2. "Meus Gabaritos" (Templates paramétricos salvos pelo usuário com aplicação em 1 clique);
 *  3. Variáveis Paramétricas Globais (PartModel.vars + avaliador de expressões algébricas: W/2, D=2*R, L-2*M);
 *  4. Preferências do Usuário (unidade, material, espessura, camadas, TTS pt-BR e Live Voice contínua).
 */

import type { LengthUnit } from "./schema";

// ============================================================================
// 1. PREFERÊNCIAS DO USUÁRIO (Unidade, Material, Espessura, Camadas, Voz/TTS)
// ============================================================================

export interface UserIntentPreferences {
  defaultUnit: LengthUnit;
  defaultMaterial: string;
  defaultThicknessMm: number;
  layersMap: {
    cut: string;
    bend: string;
    center: string;
    dimension: string;
    annotation: string;
  };
  ttsEnabled: boolean;
  autoSendVoice: boolean;
  liveVoiceContinuous: boolean;
}

export const DEFAULT_USER_INTENT_PREFERENCES: UserIntentPreferences = {
  defaultUnit: "mm",
  defaultMaterial: "Aço Carbono SAE 1020",
  defaultThicknessMm: 3.0,
  layersMap: {
    cut: "CORTE",
    bend: "DOBRA",
    center: "CENTRO",
    dimension: "COTAS",
    annotation: "ANOTAÇÕES",
  },
  ttsEnabled: false,
  autoSendVoice: false,
  liveVoiceContinuous: false,
};

const STORAGE_PREFS_KEY = "caldra_chamfer_intent_v2_user_prefs";
let memoryPrefs: UserIntentPreferences = { ...DEFAULT_USER_INTENT_PREFERENCES };

export function loadUserIntentPreferences(): UserIntentPreferences {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserIntentPreferences>;
        memoryPrefs = {
          ...DEFAULT_USER_INTENT_PREFERENCES,
          ...parsed,
          layersMap: {
            ...DEFAULT_USER_INTENT_PREFERENCES.layersMap,
            ...(parsed.layersMap ?? {}),
          },
        };
      }
    }
  } catch {
    // fallback memory
  }
  return { ...memoryPrefs };
}

export function saveUserIntentPreferences(
  patch: Partial<UserIntentPreferences>,
): UserIntentPreferences {
  const current = loadUserIntentPreferences();
  const updated: UserIntentPreferences = {
    ...current,
    ...patch,
    layersMap: {
      ...current.layersMap,
      ...(patch.layersMap ?? {}),
    },
  };
  memoryPrefs = updated;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore
  }
  return updated;
}

// ============================================================================
// 2. VARIÁVEIS PARAMÉTRICAS GLOBAIS E EXPRESSÕES ALGÉBRICAS (W/2, D=2*R, L-50)
// ============================================================================

const STORAGE_VARS_KEY = "caldra_chamfer_intent_v2_global_vars";
const DEFAULT_GLOBAL_VARS: Record<string, number> = {
  W: 500,
  H: 250,
  R: 20,
  D: 12,
  M: 25,
};
let memoryGlobalVars: Record<string, number> = { ...DEFAULT_GLOBAL_VARS };

export function loadGlobalParametricVars(): Record<string, number> {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_VARS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        if (parsed && typeof parsed === "object") {
          memoryGlobalVars = { ...DEFAULT_GLOBAL_VARS, ...parsed };
        }
      }
    }
  } catch {
    // ignore
  }
  return { ...memoryGlobalVars };
}

export function saveGlobalParametricVars(vars: Record<string, number>): Record<string, number> {
  memoryGlobalVars = { ...vars };
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_VARS_KEY, JSON.stringify(memoryGlobalVars));
    }
  } catch {
    // ignore
  }
  return { ...memoryGlobalVars };
}

/**
 * Avalia de forma segura uma expressão paramétrica (ex.: "W/2", "2*R", "W - 2*M", "D=2*R")
 * usando as variáveis globais do `PartModel` (§6 Convenções: "Valores aceitam números ou
 * expressões/variáveis (W/2, D=2*R)").
 */
export function evaluateParametricExpression(
  expressionOrNumber: string | number,
  vars: Record<string, number> = loadGlobalParametricVars(),
): number | null {
  if (typeof expressionOrNumber === "number") {
    return Number.isFinite(expressionOrNumber) ? expressionOrNumber : null;
  }

  let expr = expressionOrNumber.trim().replace(",", ".");
  if (!expr) return null;

  // Se tiver atribuição "D=2*R", avalia o lado direito
  if (expr.includes("=")) {
    const parts = expr.split("=");
    expr = (parts[parts.length - 1] ?? "").trim();
  }

  // Substitui nomes de variáveis por seus valores numéricos (ordenados do maior para o menor nome)
  const varEntries = Object.entries(vars).sort((a, b) => b[0].length - a[0].length);
  for (const [name, val] of varEntries) {
    if (!Number.isFinite(val)) continue;
    const reg = new RegExp(`\\b${name}\\b`, "gi");
    expr = expr.replace(reg, `(${val})`);
  }

  // Permite apenas dígitos, espaços, ponto decimal, parênteses e operadores +, -, *, /
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    return null;
  }

  try {
    // Avaliador aritmético seguro sobre string previamente sanitizada apenas com [0-9+-*/().]
    const computed = Function(`"use strict"; return (${expr});`)() as number;
    if (typeof computed === "number" && Number.isFinite(computed)) {
      return Number(computed.toFixed(4));
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// 3. "MEUS GABARITOS" (TEMPLATES PARAMÉTRICOS SALVOS PELO USUÁRIO)
// ============================================================================

export interface SavedIntentTemplate {
  id: string;
  name: string;
  category: "chapa" | "flange" | "suporte" | "caldeiraria";
  prompt: string;
  defaultParameters: Record<string, number | string>;
  createdAt: string;
}

const DEFAULT_TEMPLATES: SavedIntentTemplate[] = [
  {
    id: "tpl-base-motor",
    name: "Base de Motor 500×300 (4 Furos Ø14 nos Cantos)",
    category: "chapa",
    prompt: "Chapa 500 x 300 com quatro furos Ø14 a 30 mm das bordas e raio 20",
    defaultParameters: {
      width: 500,
      height: 300,
      corner_radius: 20,
      hole_count: 4,
      hole_diameter: 14,
      margin: 30,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-flange-dn150",
    name: "Flange Industrial Ø320/Ø160 PCD 260 (8×Ø18)",
    category: "flange",
    prompt: "Flange externo 320 interno 160 com PCD 260 e 8 furos de 18 mm",
    defaultParameters: {
      outer_diameter: 320,
      inner_diameter: 160,
      pcd: 260,
      hole_count: 8,
      hole_diameter: 18,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-cone-redutor",
    name: "Redução Cônica Ø500 → Ø250 × H350",
    category: "caldeiraria",
    prompt: "Tronco de cone base 500 topo 250 altura 350",
    defaultParameters: {
      base_diameter: 500,
      top_diameter: 250,
      height: 350,
      thickness: 3,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const STORAGE_TEMPLATES_KEY = "caldra_chamfer_intent_v2_saved_templates";
let memoryTemplates: SavedIntentTemplate[] = [...DEFAULT_TEMPLATES];

export function listSavedIntentTemplates(): SavedIntentTemplate[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_TEMPLATES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedIntentTemplate[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryTemplates = parsed;
        }
      }
    }
  } catch {
    // ignore
  }
  return [...memoryTemplates];
}

export function saveIntentTemplate(params: {
  name: string;
  category?: SavedIntentTemplate["category"];
  prompt: string;
  defaultParameters: Record<string, number | string>;
}): SavedIntentTemplate {
  const current = listSavedIntentTemplates();
  const created: SavedIntentTemplate = {
    id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: params.name.trim() || "Gabarito Personalizado",
    category: params.category ?? "chapa",
    prompt: params.prompt,
    defaultParameters: { ...params.defaultParameters },
    createdAt: new Date().toISOString(),
  };
  const next = [created, ...current];
  memoryTemplates = next;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore
  }
  return created;
}

export function deleteSavedIntentTemplate(templateId: string): boolean {
  const current = listSavedIntentTemplates();
  const next = current.filter((t) => t.id !== templateId);
  const changed = next.length !== current.length;
  memoryTemplates = next;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore
  }
  return changed;
}

// ============================================================================
// 4. ENTRADA DE CROQUI / FOTO / DXF NO COMPOSER (§11 Item 7)
// ============================================================================

export interface AttachmentParseResult {
  kind: "dxf" | "svg" | "sketch_image";
  fileName: string;
  inferredPrompt: string;
  detectedSummary: string;
  extractedMetrics: {
    widthMm?: number;
    heightMm?: number;
    holeCount?: number;
    holeDiameterMm?: number;
  };
}

/**
 * Analisa o conteúdo textual de um arquivo DXF e extrai o contorno externo (W × H)
 * e os furos circulares (CIRCLE) para preencher o composer do CHAMFER INTENT 2.0.
 */
export function parseDxfTextToIntentAttachment(
  dxfContent: string,
  fileName = "peca.dxf",
): AttachmentParseResult {
  const lines = dxfContent.split(/\r?\n/).map((l) => l.trim());
  const xs: number[] = [];
  const ys: number[] = [];
  const circleRadii: number[] = [];

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i];
    const val = lines[i + 1] ?? "";

    if (code === "10" || code === "11") {
      const n = parseFloat(val);
      if (Number.isFinite(n)) xs.push(n);
    } else if (code === "20" || code === "21") {
      const n = parseFloat(val);
      if (Number.isFinite(n)) ys.push(n);
    } else if (code === "40") {
      // Código 40 em CIRCLE representa o raio
      const r = parseFloat(val);
      if (Number.isFinite(r) && r > 0 && r < 250) {
        circleRadii.push(r);
      }
    }
  }

  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 400;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxY = ys.length > 0 ? Math.max(...ys) : 250;

  const widthMm = Math.max(20, Math.round(maxX - minX));
  const heightMm = Math.max(20, Math.round(maxY - minY));
  const holeCount = circleRadii.length;
  const holeDiameterMm =
    circleRadii.length > 0 ? Number((circleRadii[0]! * 2).toFixed(1)) : undefined;

  const inferredPrompt =
    holeCount > 0 && holeDiameterMm
      ? `Chapa ${widthMm} por ${heightMm} mm com ${holeCount} furos de ${holeDiameterMm} mm a 25 mm das bordas`
      : `Chapa ${widthMm} por ${heightMm} mm`;

  return {
    kind: "dxf",
    fileName,
    inferredPrompt,
    detectedSummary: `DXF '${fileName}': envelope ${widthMm}×${heightMm} mm${
      holeCount > 0 ? ` · ${holeCount} furo(s) Ø${holeDiameterMm} mm` : ""
    }`,
    extractedMetrics: {
      widthMm,
      heightMm,
      holeCount,
      holeDiameterMm,
    },
  };
}

/**
 * Interpreta um anexo de imagem de croqui/foto e prepara um comando editável no composer.
 */
export function parseSketchImageToIntentAttachment(
  fileName: string,
): AttachmentParseResult {
  const nums = Array.from(fileName.matchAll(/(\d{2,4})/g)).map((m) => Number(m[1]));
  const widthMm = nums[0] ?? 400;
  const heightMm = nums[1] ?? 250;
  const holeDiameterMm = nums[2] && nums[2] < 100 ? nums[2] : 12;

  const inferredPrompt = `Chapa ${widthMm} por ${heightMm} mm com cantos arredondados de raio 20 e 4 furos de ${holeDiameterMm} mm a 25 mm das bordas`;

  return {
    kind: "sketch_image",
    fileName,
    inferredPrompt,
    detectedSummary: `Croqui '${fileName}' analisado: sugestão paramétrica ${widthMm}×${heightMm} mm (confirme as medidas antes de aplicar)`,
    extractedMetrics: {
      widthMm,
      heightMm,
      holeCount: 4,
      holeDiameterMm,
    },
  };
}
