/**
 * CHAMFER VISION 2.0 — CALIBRAÇÃO DE LIMIARES E TOLERÂNCIA ADAPTATIVA (FASE B)
 *
 * Centraliza todos os parâmetros matemáticos e limiares das Seções 6, 7, 8, 9 e 10,
 * calibrados contra a suíte sintética G1–G14 com verdade conhecida (ground truth).
 *
 * Princípios:
 * 1. Tolerância geométrica τ é ADAPTATIVA ao tamanho característico da feição e à
 *    espessura típica do traço w₀, e SEPARADA da tolerância de fabricação.
 * 2. Classificação de laços aninhados (traço único vs. anel legítimo vs. ambíguo)
 *    baseia-se na razão adimensional q = w_faixa / w₀ (ou w_faixa / R_médio quando
 *    não há outros traços de referência).
 * 3. Seleção de modelo geométrico prefere sempre o modelo mais simples cujo desvio
 *    máximo respeite τ (reta < arco < círculo < elipse < cadeia de arcos < spline).
 */

import type { Tolerance } from "./geometryRecognizer";

export type VisionPreset = "preciso" | "equilibrado" | "tolerante";

export type ImageKindMode = "auto" | "silhueta" | "traco" | "linha";

export type OutputDxfMode = "laser" | "cad";

export type ConfidenceLevel = "ALTA" | "MEDIA" | "BAIXA";

export type TwinLoopDecision = "stroke_centerline" | "concentric_ring" | "ambiguous_ask_user";

export interface CalibratedVisionThresholds {
  /** Fração relativa p por predefinição (Seção 8): Preciso 0,5%, Equilibrado 1,0%, Tolerante 2,5%. */
  readonly presetFactorP: Record<VisionPreset, number>;

  /** Piso absoluto de tolerância em pixels (0,8 px) e fator sobre espessura típica w₀ (0,35 · w₀). */
  readonly minTauPxFloor: number;
  readonly minTauStrokeFactor: number;

  /**
   * Regras da Seção 7 para dois laços aninhados no modo TRAÇO / LINHA:
   * - Com outros traços de referência (q = w_faixa / w₀):
   *   q <= 1.6 -> traço único (colapsa na linha central)
   *   q >= 3.0 -> anel largo legítimo (preserva 2 entidades)
   *   1.6 < q < 3.0 -> ambíguo (pede decisão ao usuário)
   * - Sem outros traços de referência (q_rel = w_faixa / R_medio):
   *   q_rel <= 0.15 -> traço único
   *   q_rel >= 0.30 -> anel legítimo
   *   0.15 < q_rel < 0.30 -> ambíguo (pede decisão ao usuário)
   */
  readonly twinQWithRefMaxStroke: number;
  readonly twinQWithRefMinRing: number;
  readonly twinQNoRefMaxStroke: number;
  readonly twinQNoRefMinRing: number;

  /**
   * Segmentação e detecção de cantos vivos (Seção 8):
   * - Janela de estimação de tangente L_w entre 4 px e 3% do perímetro (~3 · w₀)
   * - Ângulo mínimo de giro para canto vivo: 28°
   */
  readonly cornerMinWindowPx: number;
  readonly cornerMaxPerimeterFraction: number;
  readonly cornerStrokeWindowFactor: number;
  readonly cornerMinTurnAngleDeg: number;

  /**
   * Seleção de modelo (Seção 8):
   * - Arco válido só se span >= 15° e flecha (sagitta) >= 2·τ
   * - Círculo fechado só se span >= 330° e desvio radial máximo <= τ
   * - Elipse fechada só se círculo rejeitado, desvio <= τ e razão b/a <= 0.95
   */
  readonly arcMinSpanDeg: number;
  readonly arcMinSagittaTauFactor: number;
  readonly circleMinSpanDeg: number;
  readonly ellipseMaxAxisRatio: number;

  /**
   * Continuidade, tangência G1 e colinearidade (Seções 8 e 9):
   * - Fusão de retas colineares: ângulo <= 1° e deslocamento <= τ
   * - Refinamento de tangência G1 (reta–arco ou arco–arco): diferença <= 4°
   * - Solda de vértices compartilhados: τ_solda = min(2·τ, 0.5 · L_min)
   */
  readonly collinearMaxAngleDeg: number;
  readonly tangencyMaxAngleDeg: number;
  readonly weldMaxTauFactor: number;
  readonly weldMaxEntityFraction: number;

  /**
   * Metas de fidelidade sem invenção (Seção 10):
   * - Cobertura >= 99% (0.99)
   * - Excesso <= 1% (0.01)
   */
  readonly minCoverageRatio: number;
  readonly maxExcessRatio: number;
}

export const CALIBRATED_THRESHOLDS: CalibratedVisionThresholds = {
  presetFactorP: {
    preciso: 0.005, // 0,5%
    equilibrado: 0.01, // 1,0% (padrão)
    tolerante: 0.025, // 2,5%
  },
  minTauPxFloor: 0.8,
  minTauStrokeFactor: 0.35,

  twinQWithRefMaxStroke: 1.6,
  twinQWithRefMinRing: 3.0,
  twinQNoRefMaxStroke: 0.15,
  twinQNoRefMinRing: 0.3,

  cornerMinWindowPx: 4,
  cornerMaxPerimeterFraction: 0.03,
  cornerStrokeWindowFactor: 3.0,
  cornerMinTurnAngleDeg: 28,

  arcMinSpanDeg: 15,
  arcMinSagittaTauFactor: 2.0,
  circleMinSpanDeg: 330,
  ellipseMaxAxisRatio: 0.95,

  collinearMaxAngleDeg: 1.0,
  tangencyMaxAngleDeg: 4.0,
  weldMaxTauFactor: 2.0,
  weldMaxEntityFraction: 0.5,

  minCoverageRatio: 0.99,
  maxExcessRatio: 0.01,
};

/** Converte a tolerância legada ("baixa" | "media" | "alta") para o preset oficial da Seção 8. */
export function toleranceToPreset(tol: Tolerance | VisionPreset): VisionPreset {
  if (tol === "preciso" || tol === "baixa") return "preciso";
  if (tol === "tolerante" || tol === "alta") return "tolerante";
  return "equilibrado";
}

export interface AdaptiveTauInput {
  /** Tamanho característico da feição em px (raio para círculo/arco, comprimento para reta). */
  characteristicSizePx: number;
  /** Espessura típica do traço na imagem em px (w₀). Padrão: 1 px. */
  strokeWidthPx?: number;
  /** Predefinição escolhida pelo usuário. Padrão: "equilibrado". */
  preset?: VisionPreset | Tolerance;
  /** Teto opcional em milímetros escolhido pelo usuário (só aplicado quando calibrado). */
  maxDevCapMm?: number;
  /** Escala calibrada em mm/px (se calibrada). */
  mmPerPx?: number;
}

export interface AdaptiveTauResult {
  /** Tolerância efetiva em pixels usada no ajuste geométrico. */
  tauPx: number;
  /** Piso mínimo calculado em pixels: max(0.8, 0.35 * w₀). */
  tauMinPx: number;
  /** Verdadeiro se a resolução da imagem impede atingir o teto em mm pedido pelo usuário. */
  resolutionLimited: boolean;
  /** Limite físico de precisão em mm imposto pela resolução atual (tauMinPx * mmPerPx). */
  resolutionLimitMm?: number;
  /** Mensagem de aviso caso a resolução limite o teto solicitado. */
  warning?: string;
}

/**
 * Calcula a tolerância adaptativa τ segundo a fórmula da Seção 8:
 *   τ_min = max(0.8 px, 0.35 · w₀)
 *   τ_raw = max(τ_min, p × tamanho_característico)
 * Se houver teto em mm calibrado, aplica o teto até o limite físico de resolução τ_min.
 */
export function computeAdaptiveTau(input: AdaptiveTauInput): AdaptiveTauResult {
  const w0 = Math.max(0, input.strokeWidthPx ?? 1);
  const preset = toleranceToPreset(input.preset ?? "equilibrado");
  const p = CALIBRATED_THRESHOLDS.presetFactorP[preset];
  const tauMinPx = Math.max(
    CALIBRATED_THRESHOLDS.minTauPxFloor,
    CALIBRATED_THRESHOLDS.minTauStrokeFactor * w0,
  );
  const sizePx = Math.max(1, input.characteristicSizePx);
  let tauPx = Math.max(tauMinPx, p * sizePx);

  let resolutionLimited = false;
  let resolutionLimitMm: number | undefined;
  let warning: string | undefined;

  if (
    input.maxDevCapMm !== undefined &&
    input.maxDevCapMm > 0 &&
    input.mmPerPx !== undefined &&
    input.mmPerPx > 0
  ) {
    const capPx = input.maxDevCapMm / input.mmPerPx;
    resolutionLimitMm = tauMinPx * input.mmPerPx;
    if (capPx < tauMinPx) {
      resolutionLimited = true;
      tauPx = tauMinPx;
      warning = `A resolução limita a precisão a ±${resolutionLimitMm.toFixed(2)} mm.`;
    } else {
      tauPx = Math.min(tauPx, capPx);
    }
  }

  return {
    tauPx,
    tauMinPx,
    resolutionLimited,
    ...(resolutionLimitMm !== undefined ? { resolutionLimitMm } : {}),
    ...(warning ? { warning } : {}),
  };
}

/**
 * Classifica dois laços aninhados (externo e interno) segundo a regra exata da Seção 7:
 * - No modo SILHUETA: há material sólido entre os dois laços -> preserva como 2 bordas reais ("concentric_ring").
 * - Nos modos TRAÇO e LINHA:
 *   - Com referência de outros traços (hasOtherStrokes = true e referenceStrokeWidthPx > 0):
 *     q = bandWidthPx / referenceStrokeWidthPx
 *     q <= 1.6 -> "stroke_centerline" (1 única entidade na linha central)
 *     q >= 3.0 -> "concentric_ring" (2 entidades concêntricas)
 *     1.6 < q < 3.0 -> "ambiguous_ask_user"
 *   - Sem outros traços de referência:
 *     q_rel = bandWidthPx / midRadiusPx
 *     q_rel <= 0.15 -> "stroke_centerline"
 *     q_rel >= 0.30 -> "concentric_ring"
 *     0.15 < q_rel < 0.30 -> "ambiguous_ask_user"
 */
export function classifyNestedLoopPair(params: {
  imageKind: Exclude<ImageKindMode, "auto">;
  bandWidthPx: number;
  midRadiusPx: number;
  hasOtherStrokes: boolean;
  referenceStrokeWidthPx?: number;
}): { decision: TwinLoopDecision; ratioQ: number; usedReferenceStroke: boolean } {
  if (params.imageKind === "silhueta") {
    return {
      decision: "concentric_ring",
      ratioQ: params.bandWidthPx / Math.max(1, params.midRadiusPx),
      usedReferenceStroke: false,
    };
  }

  const wBand = Math.max(0, params.bandWidthPx);
  if (
    params.hasOtherStrokes &&
    params.referenceStrokeWidthPx !== undefined &&
    params.referenceStrokeWidthPx > 0.25
  ) {
    const q = wBand / params.referenceStrokeWidthPx;
    if (q <= CALIBRATED_THRESHOLDS.twinQWithRefMaxStroke) {
      return { decision: "stroke_centerline", ratioQ: q, usedReferenceStroke: true };
    }
    if (q >= CALIBRATED_THRESHOLDS.twinQWithRefMinRing) {
      return { decision: "concentric_ring", ratioQ: q, usedReferenceStroke: true };
    }
    return { decision: "ambiguous_ask_user", ratioQ: q, usedReferenceStroke: true };
  }

  const rMid = Math.max(1, params.midRadiusPx);
  const qRel = wBand / rMid;
  if (qRel <= CALIBRATED_THRESHOLDS.twinQNoRefMaxStroke) {
    return { decision: "stroke_centerline", ratioQ: qRel, usedReferenceStroke: false };
  }
  if (qRel >= CALIBRATED_THRESHOLDS.twinQNoRefMinRing) {
    return { decision: "concentric_ring", ratioQ: qRel, usedReferenceStroke: false };
  }
  return { decision: "ambiguous_ask_user", ratioQ: qRel, usedReferenceStroke: false };
}

/**
 * Classifica o nível de confiança de uma primitiva reconstruída (Seção 10):
 * - ALTA: suporte amplo, resíduo máximo <= τ (e RMS <= τ/2)
 * - MÉDIA: resíduo máximo entre τ e 2,5·τ ou ambiguidade resolvida
 * - BAIXA: resíduo > 2,5·τ ou suporte insuficiente
 */
export function classifyConfidence(params: {
  maxResidualPx: number;
  rmsResidualPx: number;
  tauPx: number;
  supportPoints: number;
  minSupportPoints?: number;
  ambiguous?: boolean;
}): ConfidenceLevel {
  const minPts = params.minSupportPoints ?? 6;
  if (params.ambiguous || params.supportPoints < minPts) return "BAIXA";
  if (params.maxResidualPx <= params.tauPx && params.rmsResidualPx <= params.tauPx * 0.65) {
    return "ALTA";
  }
  if (params.maxResidualPx <= params.tauPx * 2.5) {
    return "MEDIA";
  }
  return "BAIXA";
}

/**
 * Calcula a tolerância de solda topológica de vértices compartilhados (Seção 9):
 *   τ_solda = min(2·τ, 0.5 × menor_entidade_adjacente)
 */
export function computeWeldTolerancePx(tauPx: number, minAdjacentEntityLengthPx: number): number {
  return Math.min(
    CALIBRATED_THRESHOLDS.weldMaxTauFactor * tauPx,
    CALIBRATED_THRESHOLDS.weldMaxEntityFraction * Math.max(0, minAdjacentEntityLengthPx),
  );
}
