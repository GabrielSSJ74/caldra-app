/**
 * SISTEMA TÉCNICO DE CORES DO CALDRA — INDEPENDENTE DO TEMA DA INTERFACE.
 *
 * Estas cores representam a linguagem de fabricação (corte, dobra, marcação,
 * construção, referência e cotas) e NUNCA devem variar com o tema claro,
 * escuro, acento ou Modo Mestre. A interface possui seus próprios tokens.
 *
 * Proibido: drawingColor = theme.primaryColor
 */

export const CUT_COLOR = "#9A0526"; // vermelho escuro — corte
export const BEND_COLOR = "#A78BFA"; // violeta técnico — dobra
export const MARK_COLOR = "#F59E0B"; // âmbar técnico — marcação
export const CONSTRUCTION_COLOR = "#9AA4B0"; // cinza técnico claro — construção
export const REFERENCE_COLOR = "#6B7480"; // cinza discreto — referência
export const DIMENSION_COLOR = "#00CCFF"; // azul técnico fixo — cotas
export const AXIS_COLOR = "#5A636E"; // cinza discreto — eixos
export const SELECTION_COLOR = "#22D3EE"; // destaque temporário de seleção
export const PREVIEW_COLOR = "#7DD3FC"; // destaque temporário de criação

export type TechLayerId = "corte" | "dobra" | "marcacao" | "construcao" | "referencia" | "cota";

/** Estilo técnico completo de cada camada (cor + traço + espessura relativa). */
export const TECHNICAL_STYLE: Record<
  TechLayerId,
  { color: string; dash: (s: number) => string | undefined; weight: number; order: number }
> = {
  construcao: { color: CONSTRUCTION_COLOR, dash: (s) => `${2 * s} ${2 * s}`, weight: 0.7, order: 0 },
  referencia: {
    color: REFERENCE_COLOR,
    dash: (s) => `${8 * s} ${2 * s} ${1.5 * s} ${2 * s}`,
    weight: 0.7,
    order: 1,
  },
  dobra: { color: BEND_COLOR, dash: (s) => `${7 * s} ${2.5 * s} ${1.5 * s} ${2.5 * s}`, weight: 1, order: 2 },
  marcacao: { color: MARK_COLOR, dash: (s) => `${4 * s} ${2.5 * s}`, weight: 1, order: 3 },
  corte: { color: CUT_COLOR, dash: () => undefined, weight: 1.4, order: 4 },
  cota: { color: DIMENSION_COLOR, dash: () => undefined, weight: 0.8, order: 5 },
};

const FALLBACK = TECHNICAL_STYLE.corte;

export const techStyle = (layerId: string) =>
  TECHNICAL_STYLE[layerId as TechLayerId] ?? FALLBACK;

export const techColor = (layerId: string) => techStyle(layerId).color;

/** Ordem de pintura: construção → referência → dobra → marcação → corte → cotas. */
export const layerOrder = (layerId: string) => techStyle(layerId).order;

/** Modos de saída para fabricação. */
export type OutputMode = "completo" | "producao" | "corte" | "corte-marcacao";

export const MODE_LAYERS: Record<OutputMode, TechLayerId[] | null> = {
  completo: null,
  producao: ["corte", "dobra", "marcacao"],
  corte: ["corte"],
  "corte-marcacao": ["corte", "marcacao"],
};

export function modeAllows(mode: OutputMode, layerId: string): boolean {
  const allowed = MODE_LAYERS[mode];
  return !allowed || allowed.includes(layerId as TechLayerId);
}
