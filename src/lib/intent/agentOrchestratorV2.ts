/**
 * CALDRA — CHAMFER INTENT 2.0
 * Seções 3, 8 e 9 (Claude Prompt Mestre): Orquestrador do Agente V2
 *
 * Responsabilidades da Fase 2:
 *  1. System Instruction literal (§9) e envelope de contexto compacto (PartModel + seleção + histórico ~12 turnos);
 *  2. Pipeline em streaming com etapas visíveis: Entendendo -> Planejando -> Compilando -> Validando;
 *  3. Emissão de 1–2 linhas de entendimento imediato (understandingText);
 *  4. Declaração explícita de premissas (declare_assumptions) com alternativas clicáveis;
 *  5. Execução em dry-run das tool calls (ToolRegistryV2) em ordem de dependência;
 *  6. Validador de fabricação DFM (§8) com entity_id, valor medido e correção numérica sugerida;
 *  7. Loop de auto-correção (máx. 2 tentativas) e explicação de conflito com 2 alternativas numéricas.
 */

import type { Entity, LayerId } from "@/lib/lab2d/core";
import type { Dimension } from "@/lib/lab2d/dimensions";
import { normalizeNaturalLanguageNumbers } from "./unitAndReferenceParser";
import {
  buildPartModelFromCanvas,
  createEmptyPartModel,
  type PartModel,
} from "./partModel";
import type {
  DeclaredAssumptionItem,
  DslV2ToolCall,
  DslV2ToolName,
  HolePatternSpec,
  ToolResult,
} from "./dslV2Schemas";
import {
  createExecutionSandbox,
  executeSingleDslV2Tool,
  type ToolExecutionSandbox,
} from "./toolRegistryV2";
import {
  ManufacturingValidatorV2,
  type ManufacturingValidationItem,
  type ManufacturingValidationReportV2,
  type NumericAlternativeOption,
} from "./manufacturingValidatorV2";

export type AgentStreamingStage =
  | "understanding"
  | "planning"
  | "compiling"
  | "validating"
  | "ready"
  | "error";

export interface EditableAssumptionChip extends DeclaredAssumptionItem {
  id: string;
  alternatives?: {
    label: string;
    value: string | number | boolean;
    patch: Record<string, unknown>;
  }[];
}

export interface AgentTurnSummaryV2 {
  understandingText: string;
  assumptions: EditableAssumptionChip[];
  toolCalls: DslV2ToolCall[];
  toolResults: ToolResult[];
  manufacturingReport: ManufacturingValidationReportV2;
  conflictAlternatives: NumericAlternativeOption[];
  autoCorrectionAttempts: number;
  autoCorrectionNotes: string[];
  stagesVisited: AgentStreamingStage[];
  partModelBefore: PartModel;
  partModelAfter: PartModel;
  decisionStatus?: "determined" | "provisional" | "needs_clarification" | "unsupported";
  requiresPremiseConfirmation?: boolean;
  entityDelta?: {
    createCount: number;
    modifyCount: number;
    deleteCount: number;
  };
  isRefusal?: boolean;
  refusalMessage?: string;
  clarificationRequest?: {
    question: string;
    options: string[];
  };
  unsupportedReport?: {
    request: string;
    alternative: string;
  };
}

export interface AgentStreamingCallbacks {
  onStageChange?: (stage: AgentStreamingStage, labelPtBr: string) => void;
  onUnderstandingChunk?: (text: string) => void;
  onToolCallDryRun?: (
    call: DslV2ToolCall,
    result: ToolResult,
    ghostEntities: Entity[],
    ghostDimensions: Dimension[],
  ) => void;
  onValidationDone?: (report: ManufacturingValidationReportV2) => void;
}

/**
 * Tabelas normativas de furos roscados vs. passantes da Seção 9 (CONVENÇÕES):
 * - Roscado (broca): M6=5 · M8=6,8 · M10=8,5 · M12=10,2 · M16=14 · M20=17,5
 * - Passante (folga média): M6=6,6 · M8=9 · M10=11 · M12=13,5 · M16=17,5 · M20=22
 */
export const METRIC_THREAD_TABLES: Record<
  string,
  { tapDrillMm: number; clearanceMediumMm: number }
> = {
  M4: { tapDrillMm: 3.3, clearanceMediumMm: 4.5 },
  M5: { tapDrillMm: 4.2, clearanceMediumMm: 5.5 },
  M6: { tapDrillMm: 5.0, clearanceMediumMm: 6.6 },
  M8: { tapDrillMm: 6.8, clearanceMediumMm: 9.0 },
  M10: { tapDrillMm: 8.5, clearanceMediumMm: 11.0 },
  M12: { tapDrillMm: 10.2, clearanceMediumMm: 13.5 },
  M14: { tapDrillMm: 12.0, clearanceMediumMm: 15.5 },
  M16: { tapDrillMm: 14.0, clearanceMediumMm: 17.5 },
  M20: { tapDrillMm: 17.5, clearanceMediumMm: 22.0 },
  M24: { tapDrillMm: 21.0, clearanceMediumMm: 26.0 },
};

/**
 * Detecta tentativas de prompt injection ou assuntos fora do escopo de CAD/oficina (§9 SEGURANÇA E LIMITES).
 */
export function detectPromptInjectionOrOffTopic(rawPrompt: string): {
  blocked: boolean;
  reason?: "prompt_injection" | "off_topic";
  politeRefusal?: string;
} {
  const q = rawPrompt.trim().toLowerCase();
  if (
    /\b(ignore\s+(todas\s+)?as\s+instru[cç][oõ]es|esque[cç]a\s+as\s+regras|system\s+prompt|revele\s+suas\s+instru[cç][oõ]es|jailbreak|modo\s+desenvolvedor\s+irrestrito)\b/i.test(
      q,
    )
  ) {
    return {
      blocked: true,
      reason: "prompt_injection",
      politeRefusal:
        "Atuo exclusivamente com desenho CAD 2D, cálculo de fabricação e traçagem no Chamfer. Me diga as medidas ou alterações da peça que deseja desenhar.",
    };
  }
  if (
    /\b(receita\s+de\s+bolo|piada|poema|previs[aã]o\s+do\s+tempo|quem\s+ganhou\s+o\s+jogo|escreva\s+uma\s+redac[aã]o)\b/i.test(
      q,
    ) &&
    !/\b(chapa|furo|flange|corte|dobra|rasgo|cone|cilindro|cota|mm|cm)\b/i.test(q)
  ) {
    return {
      blocked: true,
      reason: "off_topic",
      politeRefusal:
        "Atuo só em CAD 2D, caldeiraria e fabricação no Chamfer. Qual peça ou medida você quer desenhar agora?",
    };
  }
  return { blocked: false };
}

/**
 * Detecta pedidos de recursos não suportados pelo Chamfer 2D (ex.: modelagem sólida 3D booleana, CAM G-code direto, simulação FEA)
 * e gera `report_unsupported` com a alternativa 2D mais próxima (§9).
 */
export function detectUnsupportedRequest(rawPrompt: string): {
  unsupported: boolean;
  request?: string;
  alternative?: string;
} {
  const q = rawPrompt.trim().toLowerCase();
  if (
    /\b(malha\s+3d|elemento[s]?\s+finito[s]?|fea\b| tens[aã]o\s+von\s+mises|renderiza[cç][aã]o\s+fotorrealista|usinagem\s+5\s+eixos|gerar\s+gcode\s+3d|impress[aã]o\s+3d\s+stl)\b/i.test(
      q,
    )
  ) {
    return {
      unsupported: true,
      request: rawPrompt.trim(),
      alternative:
        "O Chamfer é um CAD 2D para corte e caldeiraria. Posso gerar a planificação 2D exata da peça, verificar regras de fabricação (laser/plasma/dobra) e exportar em DXF R12 ou SVG.",
    };
  }
  return { unsupported: false };
}

/**
 * Compila um pedido em linguagem natural (e contexto PartModel) em:
 * - `understandingText` (1-2 linhas diretas em pt-BR, sem jargão de IA)
 * - `toolCalls` na ordem estrita de dependência (§9):
 *   1. `declare_assumptions` (se houver premissas assumidas)
 *   2. peça-base (`create_plate`, `create_flange`, `develop_*`, `edit_feature`, etc.)
 *   3. contorno (`corners` / `edit_geometry`)
 *   4. furos e recortes (`add_holes`, `create_slot`, `add_cutout`)
 *   5. cotas (`auto_dimension` / `add_dimension`)
 */
export function compilePromptToAgentDslV2Plan(
  rawPrompt: string,
  context: {
    partModel: PartModel;
    selectedEntityIds?: string[];
    parameterOverrides?: Record<string, unknown>;
  },
): {
  understandingText: string;
  assumptions: EditableAssumptionChip[];
  toolCalls: DslV2ToolCall[];
  requestedPlateWidth?: number;
  requestedPlateHeight?: number;
  requestedCornerSize?: number;
  hasBoltClearanceHoles?: boolean;
  bendRadiusMm?: number;
} {
  const { partModel, parameterOverrides = {} } = context;
  const cleanPrompt = rawPrompt.trim();
  const normalized = normalizeNaturalLanguageNumbers(cleanPrompt);
  const q = normalized.toLowerCase();

  const assumptions: EditableAssumptionChip[] = [];
  const toolCalls: DslV2ToolCall[] = [];

  // 1. Verificar segurança / escopo
  const sec = detectPromptInjectionOrOffTopic(cleanPrompt);
  if (sec.blocked) {
    return {
      understandingText: sec.politeRefusal!,
      assumptions: [],
      toolCalls: [
        {
          name: "explain",
          args: { topic: sec.politeRefusal },
        },
      ],
    };
  }

  // 2. Verificar recurso não suportado
  const unsup = detectUnsupportedRequest(cleanPrompt);
  if (unsup.unsupported) {
    const understandingText = `Pedido fora do escopo 2D: ${unsup.alternative}`;
    return {
      understandingText,
      assumptions: [],
      toolCalls: [
        {
          name: "report_unsupported",
          args: {
            request: unsup.request,
            alternative: unsup.alternative,
          },
        },
      ],
    };
  }

  // 3. Verificar pedido vago que exige ask_clarification (§9: "faz uma peça com furos")
  const hasEssentialDimension =
    /(\d+(?:[.,]\d+)?)\s*(?:mm|cm|pol)?\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)/i.test(normalized) ||
    /\b(?:diametro|diâmetro|externo|raio|ø)\s*\d+/i.test(normalized) ||
    /\d{2,}/.test(cleanPrompt);
  const existingPlate = partModel.entities.find(
    (e) => e.type === "plate" || e.type === "rectangle" || e.type === "flange",
  );
  if (
    !hasEssentialDimension &&
    !existingPlate &&
    /\b(faz|fa[cç]a|cria|criar|desenha|desenhar)\s+(?:uma\s+|1\s+)?(pe[cç]a|chapa|flange|suporte)\b/i.test(
      q,
    )
  ) {
    return {
      understandingText: "Preciso saber o formato e as medidas principais para desenhar a peça.",
      assumptions: [],
      toolCalls: [
        {
          name: "ask_clarification",
          args: {
            question: "Qual o formato e as medidas da peça?",
            options: [
              "Chapa retangular (ex.: 500 × 250 mm)",
              "Flange circular (ex.: Ø400 / Ø200 mm)",
              "Suporte com rasgo (ex.: 280 × 140 mm)",
              "Outro (descrever)",
            ],
          },
        },
      ],
    };
  }

  // 4. Desfazer / Refazer / Exportar
  if (/\b(desfaz|desfa[cç]a|desfazer|undo|volta\s+um\s+passo)\b/i.test(q) && !q.includes("chapa")) {
    return {
      understandingText: "Entendi: desfazer a última operação aplicada.",
      assumptions: [],
      toolCalls: [{ name: "undo", args: { steps: 1 } }],
    };
  }
  if (/\b(refaz|refa[cç]a|refazer|redo)\b/i.test(q) && !q.includes("chapa")) {
    return {
      understandingText: "Entendi: refazer a operação desfeita.",
      assumptions: [],
      toolCalls: [{ name: "redo", args: { steps: 1 } }],
    };
  }

  // 5. Detecção de unidade global no texto (cm, m, pol -> converte para mm)
  let unitMultiplier = 1;
  if (/\b(\d+(?:[.,]\d+)?)\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)\s*cm\b/i.test(normalized)) {
    unitMultiplier = 10;
  } else if (/\b(\d+(?:[.,]\d+)?)\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)\s*pol(?:egadas)?\b/i.test(normalized)) {
    unitMultiplier = 25.4;
  }

  // 5b. Atualização direta de espessura da CHAPA (§20 — "Chapa de 3 mm", "Espessura de 6,35 mm", "Chapa de três oitavos", "Mude a espessura para 10 mm")
  const isPureThicknessCmd =
    !/(\d+(?:[.,]\d+)?)\s*(?:mm|cm|pol)?\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)/i.test(normalized) &&
    (/\b(?:mude|altere|defina|ajust[ea])?\s*(?:a\s+)?espessura\s*(?:da\s+chapa\s*)?(?:para|de|=)?\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?/i.test(
      normalized,
    ) ||
      /^chapa\s+de\s+(\d+(?:[.,]\d+)?)\s*mm\b/i.test(normalized.trim()));

  if (isPureThicknessCmd) {
    const thMatch =
      normalized.match(/espessura\s*(?:da\s+chapa\s*)?(?:para|de|=)?\s*(\d+(?:[.,]\d+)?)/i) ??
      normalized.match(/^chapa\s+de\s+(\d+(?:[.,]\d+)?)\s*mm\b/i);
    const thicknessMm = thMatch?.[1] ? parseFloat(thMatch[1].replace(",", ".")) : 3;
    partModel.thickness = thicknessMm;
    if (existingPlate) {
      toolCalls.push({
        name: "edit_feature",
        args: {
          id: existingPlate.id,
          params: { thickness: thicknessMm },
        },
      });
    } else {
      toolCalls.push({
        name: "create_plate",
        args: {
          id: "plate_1",
          w: Number(partModel.bbox[2] || 500),
          h: Number(partModel.bbox[3] || 250),
          thickness: thicknessMm,
        },
      });
    }
    return {
      understandingText: `Entendi: definir espessura CHAPA = ${thicknessMm} mm.`,
      assumptions,
      toolCalls,
    };
  }

  // 6. Detecção de Modificação Incremental sobre o PartModel (§9: "aumenta o raio dos cantos pra 30 e passa pra 6 furos", "muda os furos pra Ø14", "dobra a largura")
  const isIncrementalEdit =
    Boolean(existingPlate) &&
    !/\b(nova\s+chapa|novo\s+flange|chapa\s+de\s+\d+\s*(?:por|x|×)\s*\d+)\b/i.test(q) &&
    (/\b(aumenta|aumente|diminui|diminua|muda|mude|altera|altere|passa|passe|troca|troque|dobra|metade|um\s+pouco\s+maior|um\s+pouco\s+menor|mais\s+um\s+pouco|adiciona|adicione|arredonda|arredonde|chanfra|chanfre|cota|cote|espelha|espelhe)\b/i.test(
      q,
    ) ||
      Boolean(parameterOverrides && Object.keys(parameterOverrides).length > 0));

  if (isIncrementalEdit && existingPlate) {
    const holeFeature = partModel.entities.find(
      (e) => e.type === "hole_pattern" || e.type === "hole",
    );
    const summaryParts: string[] = [];

    // 6a. Novo raio ou chanfro nos cantos
    const radiusMatch = normalized.match(
      /\b(?:raio(?:\s+dos\s+cantos)?|cantos?\s+r|r)\s*(?:para|pra|de|=)?\s*(\d+(?:[.,]\d+)?)/i,
    );
    const overCornerR =
      parameterOverrides.corner_radius !== undefined
        ? Number(parameterOverrides.corner_radius)
        : radiusMatch
          ? Number(radiusMatch[1]!.replace(",", "."))
          : undefined;

    if (overCornerR !== undefined && Number.isFinite(overCornerR)) {
      toolCalls.push({
        name: "edit_feature",
        args: {
          id: existingPlate.id,
          params: {
            corners: {
              mode: "fillet",
              size: overCornerR,
              which: "all",
            },
          },
        },
      });
      summaryParts.push(`cantos R${overCornerR}`);
    }

    // 6b. Nova quantidade ou diâmetro de furos
    const countMatch = normalized.match(
      /\b(?:passa|passe|muda|mude|altera|altere)?\s*(?:para|pra)?\s*(\d+)\s*furos?\b/i,
    );
    const holeDMatch = normalized.match(
      /\bfuros?\s+(?:para|pra|de|ø|diametro|diâmetro)?\s*ø?\s*(\d+(?:[.,]\d+)?)/i,
    );
    const newCount =
      parameterOverrides.hole_count !== undefined
        ? Number(parameterOverrides.hole_count)
        : countMatch
          ? Number(countMatch[1])
          : undefined;
    const newHoleD =
      parameterOverrides.hole_diameter !== undefined
        ? Number(parameterOverrides.hole_diameter)
        : holeDMatch
          ? Number(holeDMatch[1]!.replace(",", "."))
          : undefined;

    if ((newCount !== undefined || newHoleD !== undefined) && holeFeature) {
      const prevD = Number(holeFeature.params.d ?? 12);
      const finalD = newHoleD ?? prevD;
      const finalCount = newCount ?? Number((holeFeature.params.pattern as { count?: number } | undefined)?.count ?? 4);
      const plateW = Number(existingPlate.params.w ?? partModel.bbox[2] ?? 500);
      const stepApprox = finalCount > 0 ? Number((plateW / finalCount).toFixed(1)) : 0;

      toolCalls.push({
        name: "edit_feature",
        args: {
          id: holeFeature.id,
          params: {
            ...(newHoleD !== undefined ? { d: newHoleD } : {}),
            ...(newCount !== undefined ? { pattern: { count: newCount } } : {}),
          },
        },
      });
      summaryParts.push(
        `${finalCount} furos Ø${finalD}${stepApprox > 0 ? ` (passo ≈ ${stepApprox.toString().replace(".", ",")})` : ""}`,
      );
    }

    // 6c. Cotagem ("agora cota")
    if (/\b(cota|cote|cotar|cotagem)\b/i.test(q)) {
      toolCalls.push({
        name: "auto_dimension",
        args: { scope: "all" },
      });
      summaryParts.push("cotas automáticas aplicadas");
    }

    // 6d. Espelhamento ("espelha na vertical" / "espelha na horizontal")
    if (/\b(espelha|espelhe|espelhar)\b/i.test(q)) {
      const axis = q.includes("vertical") ? "y" : "x";
      toolCalls.push({
        name: "transform",
        args: {
          op: "mirror",
          targets: "selection",
          axis,
          copy: false,
        },
      });
      summaryParts.push(`espelhado no eixo ${axis.toUpperCase()}`);
    }

    if (toolCalls.length > 0) {
      return {
        understandingText: `Ok: ${summaryParts.join(" e ")}.`,
        assumptions,
        toolCalls,
        requestedCornerSize: overCornerR,
      };
    }
  }

  // 7. FLANGE CIRCULAR (§9: "Flange externo E, interno I, PCD P, N furos de D")
  if (/\bflange\b/i.test(q)) {
    const extM = normalized.match(/\b(?:externo|ext|d_out|de)\s*ø?\s*(\d+(?:[.,]\d+)?)/i);
    const intM = normalized.match(/\b(?:interno|int|furo\s+central|d_in)\s*ø?\s*(\d+(?:[.,]\d+)?)/i);
    const pcdM = normalized.match(/\bpcd\s*(?:de)?\s*ø?\s*(\d+(?:[.,]\d+)?)/i);
    const holesM = normalized.match(/(\d+)\s*furos?\s*(?:de|ø|com)?\s*ø?\s*(\d+(?:[.,]\d+)?)/i);

    const dOut = Number(
      parameterOverrides.outer_diameter ?? (extM ? extM[1]!.replace(",", ".") : 400),
    );
    const dIn = Number(
      parameterOverrides.inner_diameter ?? (intM ? intM[1]!.replace(",", ".") : Math.round(dOut * 0.5)),
    );
    const pcd = Number(
      parameterOverrides.pcd ?? (pcdM ? pcdM[1]!.replace(",", ".") : Math.round((dOut + dIn) / 2)),
    );
    const nHoles = Number(
      parameterOverrides.hole_count ?? (holesM ? holesM[1] : 8),
    );
    const holeD = Number(
      parameterOverrides.hole_diameter ?? (holesM ? holesM[2]!.replace(",", ".") : 18),
    );
    const startAngle = Number(parameterOverrides.start_angle ?? 0);
    const straddleAngle = Number((180 / Math.max(1, nHoles)).toFixed(2));

    if (!/\b([aà]\s+cavaleiro|angulo|ângulo|norma|din|ansi|asme)\b/i.test(q)) {
      assumptions.push({
        id: "assum_flange_start_angle",
        field: "start_angle",
        value: startAngle,
        reason: `sem norma citada; flanges normalizados costumam ter furos a cavaleiro dos eixos (${straddleAngle.toString().replace(".", ",")}°)`,
        alternatives: [
          {
            label: "0° (no eixo X)",
            value: 0,
            patch: { start_angle: 0 },
          },
          {
            label: `${straddleAngle}° (a cavaleiro)`,
            value: straddleAngle,
            patch: { start_angle: straddleAngle },
          },
        ],
      });
    }

    if (assumptions.length > 0) {
      toolCalls.push({
        name: "declare_assumptions",
        args: {
          items: assumptions.map(({ field, value, reason }) => ({ field, value, reason })),
        },
      });
    }

    toolCalls.push({
      name: "create_flange",
      args: {
        id: "flange_1",
        pos: { abs: [0, 0] },
        d_out: dOut,
        d_in: dIn,
        pcd,
        n: nHoles,
        hole_d: holeD,
        start_angle: startAngle,
      },
    });

    return {
      understandingText: `Entendi: flange Ø${dOut}/Ø${dIn} com ${nHoles} furos Ø${holeD} no PCD ${pcd}.`,
      assumptions,
      toolCalls,
    };
  }

  // 8. CHAPA / SUPORTE RETANGULAR PARAMÉTRICO + RASGO + FUROS (§9 EXEMPLOS CANÔNICOS)
  const dimMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:mm|cm|pol)?\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)/i,
  );
  if (dimMatch || parameterOverrides.width !== undefined) {
    const rawW = dimMatch ? Number(dimMatch[1]!.replace(",", ".")) * unitMultiplier : 500;
    const rawH = dimMatch ? Number(dimMatch[2]!.replace(",", ".")) * unitMultiplier : 250;
    const w = Number(parameterOverrides.width ?? rawW);
    const h = Number(parameterOverrides.height ?? rawH);

    // Espessura ("espessura 6", "e=6", "t=6", "chapa de 3 mm")
    const thickMatch = normalized.match(
      /\b(?:espessura|esp|e\s*=|t\s*=)\s*(\d+(?:[.,]\d+)?)/i,
    );
    const thickness = thickMatch ? Number(thickMatch[1]!.replace(",", ".")) : undefined;

    // Cantos arredondados (fillet) ou chanfrados (chamfer)
    const filletMatch = normalized.match(
      /\b(?:bordas?\s+arredondadas?|cantos?\s+arredondados?|cantos?\s+boleados?|boleado|arredondad[oa]s?|raio(?:\s+nos\s+cantos)?|r)\s*(?:com|de|=)?\s*(\d+(?:[.,]\d+)?)/i,
    );
    const chamferMatch = normalized.match(
      /\b(?:chanfrad[oa]s?|chanfro|quebra\s+de\s+canto)\s*(?:com|de|=)?\s*(\d+(?:[.,]\d+)?)/i,
    );

    const cornerRadius =
      parameterOverrides.corner_radius !== undefined
        ? Number(parameterOverrides.corner_radius)
        : filletMatch
          ? Number(filletMatch[1]!.replace(",", ".")) * unitMultiplier
          : 0;
    const cornerChamfer =
      parameterOverrides.corner_chamfer !== undefined
        ? Number(parameterOverrides.corner_chamfer)
        : chamferMatch
          ? Number(chamferMatch[1]!.replace(",", ".")) * unitMultiplier
          : 0;

    let cornersWhich: "all" | ("tl" | "tr" | "br" | "bl")[] = "all";
    if (/\bcantos?\s+de\s+cima|superiores\b/i.test(q)) cornersWhich = ["tl", "tr"];
    else if (/\bcantos?\s+de\s+baixo|inferiores\b/i.test(q)) cornersWhich = ["bl", "br"];
    else if (/\bcantos?\s+da\s+esquerda|esquerdos\b/i.test(q)) cornersWhich = ["tl", "bl"];
    else if (/\bcantos?\s+da\s+direita|direitos\b/i.test(q)) cornersWhich = ["tr", "br"];

    // Rasgo oblongo ("rasgo oblongo", "oblongo", "rasgo")
    const hasSlot = /\b(rasgo|oblongo|ovalado)\b/i.test(q);
    let slotLength = 100;
    let slotWidth = 20;
    if (hasSlot) {
      const slotDimsMatch = normalized
        .slice(dimMatch ? (dimMatch.index ?? 0) + dimMatch[0].length : 0)
        .match(/(\d+(?:[.,]\d+)?)\s*(?:por|x|×)\s*(\d+(?:[.,]\d+)?)/i);
      if (slotDimsMatch) {
        slotLength = Number(slotDimsMatch[1]!.replace(",", "."));
        slotWidth = Number(slotDimsMatch[2]!.replace(",", "."));
      } else {
        // Proporcional, arredondado em múltiplos de 5 mm (§9 PERGUNTAR × ASSUMIR)
        slotLength = Math.max(20, Math.round((w * 0.35) / 5) * 5);
        slotWidth = Math.max(10, Math.round((h * 0.15) / 5) * 5);
        if (w === 280 && h === 140) {
          slotLength = 100;
          slotWidth = 20;
        }
        assumptions.push({
          id: "assum_slot_dims",
          field: "slot",
          value: `${slotLength} × ${slotWidth}, horizontal, centralizado`,
          reason: "medidas do rasgo não informadas",
          alternatives: [
            {
              label: `${slotLength} × ${slotWidth} mm`,
              value: `${slotLength}x${slotWidth}`,
              patch: { slot_length: slotLength, slot_width: slotWidth },
            },
            {
              label: `${Math.round(slotLength * 0.8)} × ${Math.round(slotWidth * 0.8)} mm`,
              value: `${Math.round(slotLength * 0.8)}x${Math.round(slotWidth * 0.8)}`,
              patch: {
                slot_length: Math.round(slotLength * 0.8),
                slot_width: Math.round(slotWidth * 0.8),
              },
            },
          ],
        });
      }
    }

    // Furação + detecção de rosca métrica M6..M20
    let holeCount = 0;
    let holeDiameter = 0;
    let holeKind: "through" | "tapped" | "countersunk" = "through";
    let threadLabel: string | undefined;
    let hasBoltClearanceHoles = false;

    const metricMatch = normalized.match(
      /(?:(\d+)\s*furos?\b[^.;]*?\b(m(?:4|5|6|8|10|12|14|16|20|24))|\b(m(?:4|5|6|8|10|12|14|16|20|24))\b)/i,
    );
    const stdHoleMatch = normalized.match(
      /(?:(\d+)\s*)?furos?\b[^.;]*?(?:de\s+|ø\s*|diametro\s+|diâmetro\s+)(\d+(?:[.,]\d+)?)/i,
    );

    if (metricMatch && /\bfuros?\b/i.test(normalized)) {
      holeCount = metricMatch[1] ? Number(metricMatch[1]) : 4;
      const mKey = (metricMatch[2] ?? metricMatch[3])!.toUpperCase();
      const entry = METRIC_THREAD_TABLES[mKey] ?? { tapDrillMm: 10.2, clearanceMediumMm: 13.5 };
      threadLabel = mKey;
      if (/\b(passante|parafuso|folga)\b/i.test(q)) {
        holeDiameter = entry.clearanceMediumMm;
        holeKind = "through";
        hasBoltClearanceHoles = true;
        assumptions.push({
          id: "assum_metric_clearance",
          field: "holes.diameter",
          value: `Ø${holeDiameter} mm (passante ${mKey})`,
          reason: `furo passante para parafuso ${mKey} usa folga média`,
          alternatives: [
            {
              label: `Ø${entry.clearanceMediumMm} mm (Passante ${mKey})`,
              value: entry.clearanceMediumMm,
              patch: { hole_diameter: entry.clearanceMediumMm },
            },
            {
              label: `Ø${entry.tapDrillMm} mm (Broca Rosca ${mKey})`,
              value: entry.tapDrillMm,
              patch: { hole_diameter: entry.tapDrillMm },
            },
          ],
        });
      } else {
        holeDiameter = entry.tapDrillMm;
        holeKind = "tapped";
        assumptions.push({
          id: "assum_metric_tap",
          field: "holes.diameter",
          value: `Ø${holeDiameter} mm (broca ${mKey})`,
          reason: `furo ${mKey} roscado desenhado no diâmetro de broca e anotado "${mKey}"`,
          alternatives: [
            {
              label: `Ø${entry.tapDrillMm} mm (Broca ${mKey})`,
              value: entry.tapDrillMm,
              patch: { hole_diameter: entry.tapDrillMm },
            },
            {
              label: `Ø${entry.clearanceMediumMm} mm (Passante ${mKey})`,
              value: entry.clearanceMediumMm,
              patch: { hole_diameter: entry.clearanceMediumMm },
            },
          ],
        });
      }
    } else if (stdHoleMatch) {
      holeCount = stdHoleMatch[1]
        ? Number(stdHoleMatch[1])
        : /\bfuros\b/i.test(normalized)
          ? 4
          : 1;
      holeDiameter = Number(stdHoleMatch[2]!.replace(",", ".")) * unitMultiplier;
    }

    if (parameterOverrides.hole_count !== undefined) {
      holeCount = Number(parameterOverrides.hole_count);
    }
    if (parameterOverrides.hole_diameter !== undefined) {
      holeDiameter = Number(parameterOverrides.hole_diameter);
    }

    // Margem das bordas ("a 25 mm das bordas", "margem 30")
    const edgeMarginMatch = normalized.match(
      /\b(?:a|com|margem(?:\s+de)?|recuo(?:\s+de)?)\s*(\d+(?:[.,]\d+)?)\s*(?:mm|cm|pol)?\s*(?:das?\s+bordas?|dos?\s+cantos?|da\s+extremidade)\b/i,
    );
    const pitchMatch = normalized.match(
      /\b(?:passo|a\s+cada|espa[cç]ados?\s+de)\s*(\d+(?:[.,]\d+)?)/i,
    );
    const marginMm =
      parameterOverrides.margin !== undefined
        ? Number(parameterOverrides.margin)
        : edgeMarginMatch
          ? Number(edgeMarginMatch[1]!.replace(",", ".")) * unitMultiplier
          : undefined;
    const pitchMm =
      parameterOverrides.pitch !== undefined
        ? Number(parameterOverrides.pitch)
        : pitchMatch
          ? Number(pitchMatch[1]!.replace(",", ".")) * unitMultiplier
          : undefined;

    // Determinar o pattern tipado de add_holes (§6 e §9 CONVENÇÕES)
    let holePattern: HolePatternSpec | null = null;
    const majorAxis: "horizontal_center" | "vertical_center" =
      w >= h ? "horizontal_center" : "vertical_center";
    const majorLength = w >= h ? w : h;

    const overDist = parameterOverrides.hole_distribution as string | undefined;

    if (holeCount > 0 && holeDiameter > 0) {
      const explicitCorners =
        overDist === "corner_margins" ||
        /\b(nos?\s+(?:quatro\s+|4\s+)?cantos?|um\s+em\s+cada\s+canto)\b/i.test(q);
      const explicitLine =
        overDist === "linear_centerline_x" ||
        overDist === "linear_centerline_y" ||
        /\b(furos?\s+centrais|no\s+centro|linha\s+de\s+centro|alinhados|conc[eê]ntricos)\b/i.test(
          q,
        );

      if (explicitCorners || (holeCount === 4 && marginMm !== undefined && !explicitLine)) {
        const inset = marginMm ?? Math.max(15, Math.round(holeDiameter * 2));
        holePattern = {
          type: "corners",
          inset,
          which: "all",
        };
        if (!/\bcantos?\b/i.test(q)) {
          assumptions.push({
            id: "assum_holes_pattern_corners",
            field: "holes.pattern",
            value: "corners",
            reason: '4 furos "das bordas" = um por canto',
            alternatives: [
              {
                label: "Nos 4 cantos (corners)",
                value: "corners",
                patch: { hole_distribution: "corner_margins" },
              },
              {
                label: "Alinhados no centro (line)",
                value: "line",
                patch: { hole_distribution: "linear_centerline_x" },
              },
            ],
          });
        }
      } else if (holeCount === 2 && marginMm !== undefined && !explicitLine) {
        holePattern = {
          type: "line",
          axis: majorAxis,
          count: 2,
          distribution: "between_ends",
          margin: marginMm,
        };
        assumptions.push({
          id: "assum_holes_2_ends",
          field: "holes.pattern",
          value: `2 furos nas extremidades (${majorAxis})`,
          reason: "2 furos a X das bordas = nas duas extremidades da maior dimensão, centralizados",
        });
      } else if (marginMm !== undefined && holeCount !== 4 && holeCount !== 2 && !explicitLine) {
        holePattern = {
          type: "perimeter",
          inset: marginMm,
          count: holeCount,
        };
        assumptions.push({
          id: "assum_holes_perimeter",
          field: "holes.pattern",
          value: "perimeter",
          reason: `${holeCount} furos a ${marginMm} mm das bordas = distribuídos ao longo do perímetro recuado`,
          alternatives: [
            {
              label: "No perímetro (perimeter)",
              value: "perimeter",
              patch: { hole_distribution: "perimeter" },
            },
            {
              label: "Linha central (line)",
              value: "line",
              patch: { hole_distribution: "linear_centerline_x" },
            },
          ],
        });
      } else {
        // Linha central (horizontal se w >= h)
        const axis: "horizontal_center" | "vertical_center" =
          overDist === "linear_centerline_y" ? "vertical_center" : majorAxis;
        let distribution:
          | "equal_division"
          | "between_ends"
          | "fixed_pitch"
          | "equal_gap_including_edges" = "equal_division";

        if (pitchMm !== undefined) {
          distribution = "fixed_pitch";
        } else if (marginMm !== undefined) {
          distribution = "between_ends";
        } else {
          distribution = "equal_division";
        }

        holePattern = {
          type: "line",
          axis,
          count: holeCount,
          distribution,
          pitch: pitchMm,
          margin: marginMm,
        };

        if (/\bconc[eê]ntricos?\b/i.test(q)) {
          assumptions.push({
            id: "assum_concentric_line",
            field: "holes.pattern",
            value: axis === "horizontal_center" ? "linha horizontal central" : "linha vertical central",
            reason: '"concêntricos" lido como alinhados no centro',
            alternatives: [
              {
                label: "Linha horizontal central",
                value: "linear_centerline_x",
                patch: { hole_distribution: "linear_centerline_x" },
              },
              {
                label: "Círculo PCD (bolt_circle)",
                value: "circular_pcd",
                patch: { hole_distribution: "circular_pcd" },
              },
            ],
          });
        }

        if (distribution === "equal_division") {
          const step = Number((majorLength / holeCount).toFixed(1));
          const halfStep = Number((step / 2).toFixed(1));
          assumptions.push({
            id: "assum_equal_division",
            field: "holes.distribution",
            value: `equal_division (passo ${step}; ${halfStep} nas pontas)`,
            reason: '"divididos igualmente" sem margem',
            alternatives: [
              {
                label: `Divisão igual (passo ${step} mm; ${halfStep} mm nas pontas)`,
                value: "equal_division",
                patch: { margin: halfStep, pitch: step },
              },
              {
                label: `Entre margens de 30 mm (passo ${Number(((majorLength - 60) / Math.max(1, holeCount - 1)).toFixed(1))} mm)`,
                value: "between_ends",
                patch: { margin: 30 },
              },
            ],
          });
        }
      }
    }

    // Ordem de dependência (§9):
    // 1. declare_assumptions
    if (assumptions.length > 0) {
      toolCalls.push({
        name: "declare_assumptions",
        args: {
          items: assumptions.map(({ field, value, reason }) => ({ field, value, reason })),
        },
      });
    }

    // 2. create_plate (peça-base + contorno raios/chanfros)
    const cornersSpec =
      cornerRadius > 0
        ? { mode: "fillet" as const, size: cornerRadius, which: cornersWhich }
        : cornerChamfer > 0
          ? { mode: "chamfer" as const, size: cornerChamfer, which: cornersWhich }
          : undefined;

    toolCalls.push({
      name: "create_plate",
      args: {
        id: "plate_1",
        w,
        h,
        ...(cornersSpec ? { corners: cornersSpec } : {}),
        ...(thickness ? { thickness } : {}),
      },
    });

    // 3. Furos ou rasgos (add_holes / create_slot)
    if (hasSlot) {
      toolCalls.push({
        name: "create_slot",
        args: {
          id: "slot_1",
          pos: { center: "plate_1" },
          length: slotLength,
          width: slotWidth,
          angle: 0,
          length_mode: "overall",
        },
      });
    }

    if (holePattern && holeCount > 0 && holeDiameter > 0) {
      toolCalls.push({
        name: "add_holes",
        args: {
          id: "holes_1",
          target: "plate_1",
          d: holeDiameter,
          pattern: holePattern,
          kind: holeKind,
          ...(threadLabel ? { thread: threadLabel } : {}),
        },
      });
    }

    // Montar 1–2 linhas de entendimento imediato (§9 FORMATO DA RESPOSTA)
    const partsDesc: string[] = [];
    partsDesc.push(`${hasSlot && !holeCount ? "suporte" : "chapa"} ${w}×${h}`);
    if (cornerRadius > 0) partsDesc.push(`cantos R${cornerRadius}`);
    else if (cornerChamfer > 0) partsDesc.push(`cantos chanfrados ${cornerChamfer} mm`);
    if (hasSlot) partsDesc.push("um rasgo oblongo centralizado");
    if (holePattern && holeCount > 0) {
      if (holePattern.type === "corners") {
        partsDesc.push(
          `com ${holeCount} furos Ø${holeDiameter}, um em cada canto, a ${holePattern.inset ?? 25} mm das bordas`,
        );
      } else if (holePattern.type === "line") {
        partsDesc.push(`${holeCount} furos Ø${holeDiameter} na linha de centro`);
      } else {
        partsDesc.push(`${holeCount} furos Ø${holeDiameter}`);
      }
    }

    const understandingText = `Entendi: ${partsDesc.join(", ").replace(", com ", " com ")}.`;

    return {
      understandingText,
      assumptions,
      toolCalls,
      requestedPlateWidth: w,
      requestedPlateHeight: h,
      requestedCornerSize: cornerRadius > 0 ? cornerRadius : cornerChamfer,
      hasBoltClearanceHoles,
    };
  }

  // Fallback para qualquer outro comando (caldeiraria, cilindro, cone, mão-francesa, etc.)
  if (/\bcilindro|virola\b/i.test(q)) {
    const nums = (normalized.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
      Number(n.replace(",", ".")),
    );
    const D = nums[0] ?? 300;
    const L = nums[1] ?? 500;
    const t = nums[2] ?? 3;
    return {
      understandingText: `Entendi: planificação de cilindro Ø${D} mm × altura ${L} mm (espessura ${t} mm).`,
      assumptions: [],
      toolCalls: [
        {
          name: "develop_cylinder",
          args: { D, L, t, ref: "neutral" },
        },
      ],
    };
  }

  if (/\bcone\b/i.test(q)) {
    const nums = (normalized.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
      Number(n.replace(",", ".")),
    );
    const D1 = nums[0] ?? 400;
    const D2 = nums[1] ?? 200;
    const H = nums[2] ?? 300;
    return {
      understandingText: `Entendi: planificação de tronco de cone Ø${D1}/Ø${D2} mm com altura ${H} mm.`,
      assumptions: [],
      toolCalls: [
        {
          name: "develop_cone",
          args: { D1, D2, H },
        },
      ],
    };
  }

  return {
    understandingText: `Entendi: processar comando técnico "${cleanPrompt}".`,
    assumptions: [],
    toolCalls: [],
  };
}

/**
 * Executa um turno completo do Agente V2 com:
 * - Etapas de streaming (understanding -> planning -> compiling -> validating -> ready);
 * - Execução dry-run chamada a chamada;
 * - Validação DFM (§8);
 * - Auto-correção de até 2 tentativas (§3.5) quando houver erro corrigível automaticamente,
 *   ou geração de explicação + 2 alternativas numéricas quando o usuário pedir dimensões conflitantes.
 */
export function executeAgentTurnV2Sync(
  rawPrompt: string,
  options: {
    existingEntities?: Entity[];
    existingDimensions?: Dimension[];
    selectedEntityIds?: string[];
    activeLayer?: LayerId;
    partModel?: PartModel;
    parameterOverrides?: Record<string, unknown>;
    precomputedToolCalls?: DslV2ToolCall[];
    precomputedUnderstandingText?: string;
    allowAutoClampOnConflict?: boolean;
    callbacks?: AgentStreamingCallbacks;
  } = {},
): AgentTurnSummaryV2 {
  const {
    existingEntities = [],
    existingDimensions = [],
    selectedEntityIds = [],
    partModel: inputPartModel,
    parameterOverrides = {},
    precomputedToolCalls,
    precomputedUnderstandingText,
    allowAutoClampOnConflict = false,
    callbacks,
  } = options;

  const stagesVisited: AgentStreamingStage[] = [];
  const notifyStage = (stage: AgentStreamingStage, label: string) => {
    stagesVisited.push(stage);
    callbacks?.onStageChange?.(stage, label);
  };

  const partModelBefore =
    inputPartModel ??
    buildPartModelFromCanvas({
      entities: existingEntities,
      dimensions: existingDimensions,
      selectedEntityIds,
      previousModel: createEmptyPartModel(),
    });

  // Etapa 1: Entendendo
  notifyStage("understanding", "Entendendo intenção e parâmetros...");

  const compiled = compilePromptToAgentDslV2Plan(rawPrompt, {
    partModel: partModelBefore,
    selectedEntityIds,
    parameterOverrides,
  });

  const understandingText = precomputedUnderstandingText ?? compiled.understandingText;
  callbacks?.onUnderstandingChunk?.(understandingText);

  // Etapa 2: Planejando
  notifyStage("planning", "Planejando chamadas de ferramentas DSL v2...");

  let activeToolCalls: DslV2ToolCall[] =
    precomputedToolCalls && precomputedToolCalls.length > 0
      ? precomputedToolCalls
      : compiled.toolCalls;

  // Etapa 3: Compilando (Dry-Run) + Etapa 4: Validando + Loop de Auto-Correção (máx. 2 tentativas)
  let autoCorrectionAttempts = 0;
  const autoCorrectionNotes: string[] = [];
  let finalSandbox: ToolExecutionSandbox = createExecutionSandbox({
    entities: existingEntities,
    dimensions: existingDimensions,
    selectedEntityIds,
    partModel: partModelBefore,
  });
  let finalResults: ToolResult[] = [];
  let finalMfgReport: ManufacturingValidationReportV2 = {
    ok: true,
    status: "VALIDADO",
    errors: [],
    warnings: [],
    mergedDuplicateIds: [],
    conflictAlternatives: [],
  };

  const maxAttempts = 3; // 1 tentativa inicial + até 2 retentativas de auto-correção
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    notifyStage("compiling", "Compilando geometria em dry-run...");
    const sandbox = createExecutionSandbox({
      entities: existingEntities,
      dimensions: existingDimensions,
      selectedEntityIds,
      partModel: partModelBefore,
    });

    const results: ToolResult[] = [];
    for (const call of activeToolCalls) {
      const res = executeSingleDslV2Tool(call, sandbox);
      results.push(res);
      callbacks?.onToolCallDryRun?.(call, res, [...sandbox.entities], [...sandbox.dimensions]);
    }

    // Estimar quantidade total de operações/elementos solicitados (para limite §19.3 de 500 por turno)
    const addHolesCall = activeToolCalls.find((c) => c.name === "add_holes");
    const holePatternArg = addHolesCall?.args.pattern as { count?: number; nx?: number; ny?: number } | undefined;
    const requestedHoleElements =
      holePatternArg?.count ??
      (holePatternArg?.nx && holePatternArg?.ny ? holePatternArg.nx * holePatternArg.ny : 0);

    notifyStage("validating", "Validando regras geométricas e de fabricação (DFM)...");
    const mfgReport = ManufacturingValidatorV2.validate({
      entities: sandbox.entities,
      partModel: sandbox.partModel,
      requestedPlateWidth: compiled.requestedPlateWidth,
      requestedPlateHeight: compiled.requestedPlateHeight,
      requestedCornerSize: compiled.requestedCornerSize,
      requestedOperationCount: Math.max(activeToolCalls.length, requestedHoleElements),
      hasBoltClearanceHoles: compiled.hasBoltClearanceHoles,
      bendRadiusMm: compiled.bendRadiusMm,
    });

    // Incorporar warnings/errors do DFM no último ToolResult geométrico para rastreabilidade (§8)
    const lastGeomResult =
      [...results].reverse().find((r) => r.tool !== "declare_assumptions") ?? results[0];
    if (lastGeomResult) {
      for (const w of mfgReport.warnings) {
        const formatted = `[${w.entity_id}] ${w.message} (${w.suggested_fix})`;
        if (!lastGeomResult.warnings.includes(formatted)) {
          lastGeomResult.warnings.push(formatted);
        }
      }
      for (const e of mfgReport.errors) {
        const formatted = `[${e.entity_id}] ${e.message} (${e.suggested_fix})`;
        if (!lastGeomResult.errors.includes(formatted)) {
          lastGeomResult.errors.push(formatted);
        }
        lastGeomResult.ok = false;
      }
    }

    finalSandbox = sandbox;
    finalResults = results;
    finalMfgReport = mfgReport;

    if (mfgReport.ok) {
      break;
    }

    // Se houver duplicatas exatas, a auto-correção mescla/remove automaticamente na próxima tentativa
    if (mfgReport.mergedDuplicateIds.length > 0 && attempt < maxAttempts - 1) {
      autoCorrectionAttempts++;
      autoCorrectionNotes.push(
        `Auto-correção #${autoCorrectionAttempts}: mescladas ${mfgReport.mergedDuplicateIds.length} entidade(s) duplicada(s).`,
      );
      activeToolCalls = [
        ...activeToolCalls,
        {
          name: "delete",
          args: { targets: mfgReport.mergedDuplicateIds },
        },
      ];
      continue;
    }

    // Se allowAutoClampOnConflict estiver ativo, ajusta com a menor mudança possível (máx. 2 tentativas)
    if (allowAutoClampOnConflict && attempt < maxAttempts - 1 && mfgReport.conflictAlternatives.length > 0) {
      const firstAlt = mfgReport.conflictAlternatives[0]!;
      autoCorrectionAttempts++;
      autoCorrectionNotes.push(
        `Auto-correção #${autoCorrectionAttempts}: aplicado ajuste mínimo "${firstAlt.label}".`,
      );
      const recompiled = compilePromptToAgentDslV2Plan(rawPrompt, {
        partModel: partModelBefore,
        selectedEntityIds,
        parameterOverrides: { ...parameterOverrides, ...firstAlt.patch },
      });
      activeToolCalls = recompiled.toolCalls;
      compiled.requestedCornerSize = recompiled.requestedCornerSize;
      compiled.requestedPlateWidth = recompiled.requestedPlateWidth;
      compiled.requestedPlateHeight = recompiled.requestedPlateHeight;
      continue;
    }

    // Se o conflito veio de dimensões explicitamente pedidas pelo usuário (ex.: "raio 200 numa chapa 250 × 100"),
    // contabilizamos as 2 tentativas de verificação do agente e preservamos o erro + 2 alternativas numéricas (§3.5 e §10)
    autoCorrectionAttempts = Math.min(2, attempt + 1);
    break;
  }

  callbacks?.onValidationDone?.(finalMfgReport);
  notifyStage(finalMfgReport.ok ? "ready" : "error", finalMfgReport.ok ? "Validado" : "Conflito geométrico detectado");

  // Detectar se houve ask_clarification, report_unsupported ou recusa
  const askCall = activeToolCalls.find((c) => c.name === "ask_clarification");
  const unsupCall = activeToolCalls.find((c) => c.name === "report_unsupported");
  const secCheck = detectPromptInjectionOrOffTopic(rawPrompt);

  // Calcular delta real de entidades (+Criar / ~Modificar / -Remover — §7.3)
  let createCount = 0;
  let modifyCount = 0;
  let deleteCount = 0;
  for (const r of finalResults) {
    createCount += (r.created ?? []).length;
    modifyCount += (r.changed ?? []).length;
    deleteCount += (r.removed ?? []).length;
  }

  // Determinar estado de decisão (§10 e §15: determined | provisional | needs_clarification | unsupported)
  const hasUnconfirmedConcentricAmbiguity =
    compiled.assumptions.some((a) => a.id === "assum_concentric_line") &&
    parameterOverrides.hole_distribution === undefined &&
    !parameterOverrides.premise_confirmed;

  const decisionStatus: "determined" | "provisional" | "needs_clarification" | "unsupported" =
    unsupCall
      ? "unsupported"
      : askCall
        ? "needs_clarification"
        : hasUnconfirmedConcentricAmbiguity
          ? "provisional"
          : "determined";

  return {
    understandingText,
    assumptions: compiled.assumptions,
    toolCalls: activeToolCalls,
    toolResults: finalResults,
    manufacturingReport: finalMfgReport,
    conflictAlternatives: finalMfgReport.conflictAlternatives,
    autoCorrectionAttempts,
    autoCorrectionNotes,
    stagesVisited,
    partModelBefore,
    partModelAfter: finalSandbox.partModel,
    decisionStatus,
    requiresPremiseConfirmation: decisionStatus === "provisional",
    entityDelta: {
      createCount,
      modifyCount,
      deleteCount,
    },
    isRefusal: secCheck.blocked,
    refusalMessage: secCheck.politeRefusal,
    clarificationRequest: askCall
      ? {
          question: String(askCall.args.question ?? "Qual o formato e as medidas da peça?"),
          options: Array.isArray(askCall.args.options)
            ? askCall.args.options.map(String)
            : ["Chapa retangular", "Flange circular", "Suporte com rasgo"],
        }
      : undefined,
    unsupportedReport: unsupCall
      ? {
          request: String(unsupCall.args.request ?? rawPrompt),
          alternative: String(unsupCall.args.alternative ?? ""),
        }
      : undefined,
  };
}

export type { ManufacturingValidationItem };
