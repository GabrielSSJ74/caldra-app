/**
 * CALDRA — CHAMFER INTENT
 * Módulo de Unidades, Expressões Naturais e Referências Espaciais (Seções 5 e 7)
 *
 * Converte expressões em português técnico e coloquial para valores numéricos
 * canônicos em milímetros (mm) e graus (deg), mantendo a unidade original informada.
 */

import type {
  CornerSelector,
  DistanceMeasurementMode,
  LengthUnit,
  SpatialReferenceFrame,
} from "./schema";

export interface ParsedMeasure {
  valueMm: number;
  rawValue: number;
  unit: LengthUnit;
  rawText: string;
}

const PORTUGUESE_NUMBERS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  "vinte e cinco": 25,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
  mil: 1000,
};

/**
 * Converte um valor numérico na unidade especificada para milímetros (mm).
 */
export function toMillimeters(value: number, unit: LengthUnit = "mm"): number {
  switch (unit) {
    case "mm":
      return value;
    case "cm":
      return value * 10;
    case "m":
      return value * 1000;
    case "in":
      return value * 25.4;
    default:
      return value;
  }
}

/**
 * Converte milímetros para a unidade de exibição solicitada.
 */
export function fromMillimeters(valueMm: number, targetUnit: LengthUnit = "mm"): number {
  switch (targetUnit) {
    case "mm":
      return valueMm;
    case "cm":
      return valueMm / 10;
    case "m":
      return valueMm / 1000;
    case "in":
      return valueMm / 25.4;
    default:
      return valueMm;
  }
}

/**
 * Identifica a unidade de comprimento a partir de um sufixo textual.
 */
export function parseLengthUnit(unitStr?: string): LengthUnit {
  if (!unitStr) return "mm";
  const u = unitStr.trim().toLowerCase();
  if (
    u === "cm" ||
    u.startsWith("centimetro") ||
    u.startsWith("centímetro")
  ) {
    return "cm";
  }
  if (
    u === "m" ||
    u === "mt" ||
    u === "mts" ||
    u.startsWith("metro")
  ) {
    return "m";
  }
  if (
    u === "in" ||
    u === '"' ||
    u === "pol" ||
    u.startsWith("polegada")
  ) {
    return "in";
  }
  return "mm";
}

/**
 * Normaliza expressões coloquiais em português antes da extração numérica:
 *  - "meio metro" -> "500 mm"
 *  - "um metro e meio" -> "1500 mm"
 *  - "25 centímetros" -> "250 mm"
 *  - números escritos por extenso ("quatro furos", "furo de doze", "raio vinte")
 */
export function normalizeNaturalLanguageNumbers(input: string): string {
  let s = input.toLowerCase();

  // Expressões compostas de metro
  s = s.replace(/\bum\s+metro\s+e\s+meio\b/gi, "1500 mm");
  s = s.replace(/\b1\s+metro\s+e\s+meio\b/gi, "1500 mm");
  s = s.replace(/\bdois\s+metros\s+e\s+meio\b/gi, "2500 mm");
  s = s.replace(/\bmeio\s+metro\b/gi, "500 mm");
  s = s.replace(/\bmeia\s+polegada\b/gi, "12.7 mm");
  s = s.replace(/\b1\/2\s*(?:pol|polegada|")\b/gi, "12.7 mm");
  s = s.replace(/\b3\/4\s*(?:pol|polegada|")\b/gi, "19.05 mm");
  s = s.replace(/\b1\/4\s*(?:pol|polegada|")\b/gi, "6.35 mm");
  s = s.replace(/\b3\/8\s*(?:pol|polegada|")\b/gi, "9.525 mm");
  s = s.replace(/\b5\/8\s*(?:pol|polegada|")\b/gi, "15.875 mm");

  // Substitui "vinte e cinco" antes das palavras individuais
  s = s.replace(/\bvinte\s+e\s+cinco\b/gi, "25");

  // Substitui palavras numéricas isoladas
  const entries = Object.entries(PORTUGUESE_NUMBERS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of entries) {
    if (word === "meia") continue;
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    s = s.replace(regex, String(num));
  }

  // Converte medidas explícitas em cm, m ou polegadas para mm mantendo rastreabilidade
  s = s.replace(
    /(\d+(?:[.,]\d+)?)\s*(cent[ií]metros?|cm|metros?|mts?|polegadas?|pol)\b/gi,
    (_match, rawNum: string, rawUnit: string) => {
      const val = parseFloat(rawNum.replace(",", "."));
      const unit = parseLengthUnit(rawUnit);
      const mmVal = toMillimeters(val, unit);
      return `${mmVal} mm`;
    },
  );

  // Caso de "1,2 m" ou "0.5 m" (onde 'm' está isolado após número, não seguido por letras)
  s = s.replace(
    /(\d+(?:[.,]\d+)?)\s*m\b(?![a-zA-Z])/gi,
    (_match, rawNum: string) => {
      const val = parseFloat(rawNum.replace(",", "."));
      return `${val * 1000} mm`;
    },
  );

  return s;
}

/**
 * Extrai uma medida individual com unidade original preservada.
 */
export function parseMeasureToken(text: string): ParsedMeasure | null {
  const t = text.trim().toLowerCase();
  if (t.includes("meio metro")) {
    return { valueMm: 500, rawValue: 0.5, unit: "m", rawText: text };
  }
  const match = t.match(
    /(\d+(?:[.,]\d+)?)\s*(mm|mil[ií]metros?|cm|cent[ií]metros?|m|metros?|pol|polegadas?|in|")?/i,
  );
  if (!match || !match[1]) return null;
  const rawValue = parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(rawValue)) return null;
  const unit = parseLengthUnit(match[2]);
  return {
    valueMm: toMillimeters(rawValue, unit),
    rawValue,
    unit,
    rawText: match[0],
  };
}

/**
 * Resolve quais cantos foram solicitados pelo comando em linguagem natural (Seção 9.3 e 10).
 */
export function parseCornerSelector(prompt: string): CornerSelector | null {
  const q = prompt.toLowerCase();

  if (
    q.includes("cantos esquerdos") ||
    q.includes("dois cantos esquerdos") ||
    q.includes("2 cantos esquerdos") ||
    q.includes("cantos da esquerda") ||
    q.includes("lado esquerdo")
  ) {
    return "left_two";
  }

  if (
    q.includes("cantos direitos") ||
    q.includes("dois cantos direitos") ||
    q.includes("2 cantos direitos") ||
    q.includes("cantos da direita") ||
    q.includes("lado direito")
  ) {
    return "right_two";
  }

  if (
    q.includes("cantos superiores") ||
    q.includes("dois cantos superiores") ||
    q.includes("2 cantos superiores") ||
    q.includes("cantos de cima") ||
    q.includes("topo")
  ) {
    return "top_two";
  }

  if (
    q.includes("cantos inferiores") ||
    q.includes("dois cantos inferiores") ||
    q.includes("2 cantos inferiores") ||
    q.includes("cantos de baixo") ||
    q.includes("base")
  ) {
    return "bottom_two";
  }

  if (q.includes("superior esquerdo") || q.includes("cima esquerdo")) {
    return "top_left";
  }
  if (q.includes("superior direito") || q.includes("cima direito")) {
    return "top_right";
  }
  if (q.includes("inferior esquerdo") || q.includes("baixo esquerdo")) {
    return "bottom_left";
  }
  if (q.includes("inferior direito") || q.includes("baixo direito")) {
    return "bottom_right";
  }

  if (
    q.includes("todos os cantos") ||
    q.includes("quatro cantos") ||
    q.includes("4 cantos") ||
    q.includes("cantos arredondados") ||
    q.includes("arredonde os cantos") ||
    q.includes("chanfre os cantos")
  ) {
    return "all";
  }

  return null;
}

/**
 * Identifica o modo de medição da distância dos furos até a borda (Seção 7):
 *  - "borda externa do furo a 25 mm da borda" -> outer_edge_to_edge
 *  - "centro do furo a 25 mm da borda" ou padrão -> center_to_edge
 */
export function parseDistanceMeasurementMode(prompt: string): DistanceMeasurementMode {
  const q = prompt.toLowerCase();
  if (
    q.includes("borda externa do furo") ||
    q.includes("borda do furo a") ||
    q.includes("parede do furo") ||
    q.includes("tangente do furo")
  ) {
    return "outer_edge_to_edge";
  }
  if (q.includes("entre centros") || q.includes("passo de") || q.includes("espaçamento de")) {
    return "center_to_center";
  }
  return "center_to_edge";
}

/**
 * Identifica o referencial espacial solicitado pelo comando (Seção 7).
 */
export function parseSpatialReferenceFrame(
  prompt: string,
  hasActiveSelection: boolean,
): SpatialReferenceFrame {
  const q = prompt.toLowerCase();
  if (q.includes("origem global") || q.includes("(0,0)") || q.includes("ponto zero")) {
    return "global_origin";
  }
  if (q.includes("centro da peça") || q.includes("centro da chapa") || q.includes("centrado")) {
    return "part_center";
  }
  if (hasActiveSelection && (q.includes("seleção") || q.includes("selecionad"))) {
    return "selected_entity";
  }
  return "part_origin_bottom_left";
}
