/**
 * CALDRA CHAMFER CAD 2D — MOTOR DA MINI-CALCULADORA CIENTÍFICA & METALÚRGICA DE BANCADA
 *
 * Diretrizes Arquiteturais:
 *  - Parser matemático recursivo puro (Tokenizer + Recursive Descent AST) — ZERO `eval` / `new Function`.
 *  - Paridade integral com a Calculadora Científica & Metalúrgica externa (`@/lib/calculator/engine`),
 *    adicionando redução modular exata de argumento trigonométrico:
 *      • sin(180°) = 0, cos(90°) = 0, tan(45°) = 1, sin(30°) = 0.5
 *      • sin(33,333333 grad) = 0.5
 *      • tan(90°), tan(100 grad), divisão por zero -> "Indefinido"
 *      • √(-1), asin(2) -> "Erro"
 *  - Suporte nativo a vírgula decimal pt-BR (`33,333333`, `25,4`) e ponto-e-vírgula (`hypot(300; 400)`).
 *  - Conversão instantânea `in ↔ mm (25,4)` e leitura fracionária comercial em polegadas até `1/64"`.
 *  - Ponte Bidirecional CAD: extrator real de medidas de entidades 2D e avaliador de expressões em Notas Técnicas.
 */

import {
  mmToCommercialInchFraction,
  type AngleMode,
} from "@/lib/calculator/engine";
import { dist, boxOf, type Entity } from "@/lib/lab2d/core";
import { pathLength } from "@/lib/lab2d/cutPlan";

export type { AngleMode };

export type BenchDecimalMode = "auto" | "2" | "4";
export type BenchDockMode = "docked_right" | "floating";

export interface BenchHistoryEntry {
  id: string;
  expression: string;
  result: number;
  formattedResult: string;
  inchFraction: string;
  angleMode: AngleMode;
  timestamp: number;
}

export interface BenchPersistedState {
  open: boolean;
  minimized: boolean;
  dockMode: BenchDockMode;
  floatingPos: { x: number; y: number };
  angleMode: AngleMode;
  decimalMode: BenchDecimalMode;
  expression: string;
  ans: number;
  history: BenchHistoryEntry[];
}

export const CHAMFER_BENCH_CALC_STORAGE_KEY = "caldra_chamfer_bench_calc_v1";
export const BENCH_MAX_HISTORY = 30;
export const INCH_TO_MM = 25.4;

export class BenchCalculatorError extends Error {
  public readonly kind: "undefined" | "domain" | "syntax";

  constructor(message: string, kind: "undefined" | "domain" | "syntax" = "syntax") {
    super(message);
    this.name = "BenchCalculatorError";
    this.kind = kind;
  }
}

/* ============================================================================
 * 1. ARITMÉTICA DE PRECISÃO E TRIGONOMETRIA COM REDUÇÃO MODULAR EXATA
 * ============================================================================ */

/** Elimina ruído binário IEEE-754 (ex: 0.1 + 0.2 -> 0.3) preservando 12 dígitos significativos */
export function cleanBenchFloat(value: number): number {
  if (!Number.isFinite(value)) {
    throw new BenchCalculatorError("Indefinido", "undefined");
  }
  if (Object.is(value, -0) || Math.abs(value) < 1e-13) return 0;
  return Number(value.toPrecision(12));
}

function positiveMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Normaliza qualquer ângulo para voltas unitárias [0, 1), onde:
 *  - 0.0   = 0°   = 0 grad   = 0 rad
 *  - 0.25  = 90°  = 100 grad = π/2 rad
 *  - 0.50  = 180° = 200 grad = π rad
 *  - 0.75  = 270° = 300 grad = 3π/2 rad
 */
function angleToUnitTurn(value: number, mode: AngleMode): number {
  if (!Number.isFinite(value)) {
    throw new BenchCalculatorError("Erro", "domain");
  }
  switch (mode) {
    case "DEG":
      return positiveMod(value, 360) / 360;
    case "GRAD":
      return positiveMod(value, 400) / 400;
    case "RAD":
      return positiveMod(value, Math.PI * 2) / (Math.PI * 2);
  }
}

function radiansToAngle(rad: number, mode: AngleMode): number {
  switch (mode) {
    case "DEG":
      return (rad * 180) / Math.PI;
    case "GRAD":
      return (rad * 200) / Math.PI;
    case "RAD":
      return rad;
  }
}

const TURN_EPS = 1e-8;
/** Tolerância dedicada para dízimas digitadas manualmente (ex: 33,333333 grad ≈ 1/12 de volta = 30°) */
const SIXTH_TURN_DECIMAL_EPS = 2e-7;

export function exactSin(angle: number, mode: AngleMode): number {
  const u = angleToUnitTurn(angle, mode);
  if (Math.abs(u) < TURN_EPS || Math.abs(u - 1) < TURN_EPS || Math.abs(u - 0.5) < TURN_EPS) {
    return 0;
  }
  if (Math.abs(u - 0.25) < TURN_EPS) return 1;
  if (Math.abs(u - 0.75) < TURN_EPS) return -1;

  // Ângulos notáveis de 30° (1/12, 5/12, 7/12, 11/12 de volta) — cobre 30° e 33,333333 grad
  if (Math.abs(u - 1 / 12) < SIXTH_TURN_DECIMAL_EPS || Math.abs(u - 5 / 12) < SIXTH_TURN_DECIMAL_EPS) {
    return 0.5;
  }
  if (Math.abs(u - 7 / 12) < SIXTH_TURN_DECIMAL_EPS || Math.abs(u - 11 / 12) < SIXTH_TURN_DECIMAL_EPS) {
    return -0.5;
  }

  return cleanBenchFloat(Math.sin(u * Math.PI * 2));
}

export function exactCos(angle: number, mode: AngleMode): number {
  const u = angleToUnitTurn(angle, mode);
  if (Math.abs(u - 0.25) < TURN_EPS || Math.abs(u - 0.75) < TURN_EPS) {
    return 0;
  }
  if (Math.abs(u) < TURN_EPS || Math.abs(u - 1) < TURN_EPS) return 1;
  if (Math.abs(u - 0.5) < TURN_EPS) return -1;

  // Ângulos notáveis de 60° (1/6, 5/6 -> +0.5; 1/3, 2/3 -> -0.5)
  if (Math.abs(u - 1 / 6) < SIXTH_TURN_DECIMAL_EPS || Math.abs(u - 5 / 6) < SIXTH_TURN_DECIMAL_EPS) {
    return 0.5;
  }
  if (Math.abs(u - 1 / 3) < SIXTH_TURN_DECIMAL_EPS || Math.abs(u - 2 / 3) < SIXTH_TURN_DECIMAL_EPS) {
    return -0.5;
  }

  return cleanBenchFloat(Math.cos(u * Math.PI * 2));
}

export function exactTan(angle: number, mode: AngleMode): number {
  const u = angleToUnitTurn(angle, mode);
  // Polos assintóticos: 90° (0.25) e 270° (0.75)
  if (Math.abs(u - 0.25) < TURN_EPS || Math.abs(u - 0.75) < TURN_EPS) {
    throw new BenchCalculatorError("Indefinido", "undefined");
  }
  if (Math.abs(u) < TURN_EPS || Math.abs(u - 1) < TURN_EPS || Math.abs(u - 0.5) < TURN_EPS) {
    return 0;
  }
  // 45°, 135°, 225°, 315°
  if (Math.abs(u - 0.125) < TURN_EPS || Math.abs(u - 0.625) < TURN_EPS) return 1;
  if (Math.abs(u - 0.375) < TURN_EPS || Math.abs(u - 0.875) < TURN_EPS) return -1;

  return cleanBenchFloat(Math.tan(u * Math.PI * 2));
}

/* ============================================================================
 * 2. TOKENIZADOR E AVALIADOR RECURSIVO PURO (ZERO EVAL / NEW FUNCTION)
 * ============================================================================ */

type BenchToken =
  | { type: "number"; value: number }
  | { type: "ident"; name: string }
  | { type: "op"; op: "+" | "-" | "*" | "/" | "^" | "%" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "semi" };

const KNOWN_FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sqrt",
  "cbrt",
  "hypot",
  "abs",
  "sq",
  "cube",
]);

/**
 * Pré-normaliza símbolos visuais técnicos de oficina para tokens canônicos sem ambiguidade.
 * Vírgula `,` é sempre tratada como separador decimal pt-BR (`25,4` -> `25.4`),
 * enquanto ponto-e-vírgula `;` separa argumentos de função (`hypot(300; 400)`).
 */
function preprocessExpression(raw: string): string {
  return raw
    .trim()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/sin⁻¹/gi, "asin")
    .replace(/cos⁻¹/gi, "acos")
    .replace(/tan⁻¹/gi, "atan")
    .replace(/∛/g, "cbrt ")
    .replace(/√/g, "sqrt ")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/,/g, ".");
}

function tokenizeBenchExpression(source: string): BenchToken[] {
  const s = preprocessExpression(source);
  const rawTokens: BenchToken[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Número decimal (ex: 350, 25.4, .5, 1e-3)
    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      let dotCount = 0;
      while (i < s.length && /[0-9.]/.test(s[i]!)) {
        if (s[i] === ".") {
          dotCount++;
          if (dotCount > 1) {
            throw new BenchCalculatorError("Erro", "syntax");
          }
        }
        numStr += s[i]!;
        i++;
      }
      if (i < s.length && (s[i] === "e" || s[i] === "E")) {
        const next = s[i + 1];
        const next2 = s[i + 2];
        if (
          (next && /[0-9]/.test(next)) ||
          ((next === "+" || next === "-") && next2 && /[0-9]/.test(next2))
        ) {
          numStr += s[i]!;
          i++;
          if (s[i] === "+" || s[i] === "-") {
            numStr += s[i]!;
            i++;
          }
          while (i < s.length && /[0-9]/.test(s[i]!)) {
            numStr += s[i]!;
            i++;
          }
        }
      }
      if (numStr === ".") {
        throw new BenchCalculatorError("Erro", "syntax");
      }
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) {
        throw new BenchCalculatorError("Erro", "syntax");
      }
      rawTokens.push({ type: "number", value: parsed });
      continue;
    }

    if (ch === "π") {
      rawTokens.push({ type: "ident", name: "pi" });
      i++;
      continue;
    }

    // Ignora símbolo de grau explícito após número (ex: sin(30°) -> sin(30))
    if (ch === "°") {
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i]!)) {
        ident += s[i]!;
        i++;
      }
      rawTokens.push({ type: "ident", name: ident.toLowerCase() });
      continue;
    }

    if (ch === "(") {
      rawTokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      rawTokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === ";") {
      rawTokens.push({ type: "semi" });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "%") {
      rawTokens.push({ type: "op", op: ch });
      i++;
      continue;
    }

    throw new BenchCalculatorError("Erro", "syntax");
  }

  // Insere multiplicação implícita onde matematicamente natural:
  // ex: 350√2 -> 350 * sqrt(2), 2π -> 2 * pi, 2(3+4) -> 2 * (3+4), (2)(3) -> (2)*(3), 50% 2 -> 50% * 2
  const out: BenchToken[] = [];
  for (let idx = 0; idx < rawTokens.length; idx++) {
    const cur = rawTokens[idx]!;
    const prev = out[out.length - 1];

    if (prev) {
      const prevEndsTerm =
        prev.type === "number" ||
        prev.type === "rparen" ||
        (prev.type === "op" && prev.op === "%") ||
        (prev.type === "ident" && !KNOWN_FUNCTIONS.has(prev.name));

      const curStartsFactor =
        cur.type === "lparen" ||
        cur.type === "ident" ||
        (cur.type === "number" &&
          (prev.type === "rparen" ||
            (prev.type === "ident" && !KNOWN_FUNCTIONS.has(prev.name)) ||
            (prev.type === "op" && prev.op === "%")));

      if (prevEndsTerm && curStartsFactor) {
        out.push({ type: "op", op: "*" });
      }
    }

    out.push(cur);
  }

  return out;
}

export function evaluateBenchExpression(
  expression: string,
  angleMode: AngleMode = "DEG",
  ansValue = 0,
): number {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new BenchCalculatorError("Expressão vazia", "syntax");
  }

  const tokens = tokenizeBenchExpression(trimmed);
  if (tokens.length === 0) {
    throw new BenchCalculatorError("Expressão vazia", "syntax");
  }

  let pos = 0;
  const peek = (): BenchToken | undefined => tokens[pos];
  const consume = (): BenchToken => {
    const t = tokens[pos];
    if (!t) throw new BenchCalculatorError("Erro", "syntax");
    pos++;
    return t;
  };

  // Gramática com precedência algébrica canônica:
  // Expr    := AddSub
  // AddSub  := MulDiv (('+' | '-') MulDiv)*
  // MulDiv  := Unary (('*' | '/') Unary)*
  // Unary   := ('+' | '-') Unary | Power
  // Power   := Postfix ('^' Unary)?
  // Postfix := Primary ('%')*
  const parseExpr = (): number => parseAddSub();

  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (true) {
      const t = peek();
      if (t && t.type === "op" && (t.op === "+" || t.op === "-")) {
        consume();
        const right = parseMulDiv();
        left = t.op === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseMulDiv = (): number => {
    let left = parseUnary();
    while (true) {
      const t = peek();
      if (t && t.type === "op" && (t.op === "*" || t.op === "/")) {
        consume();
        const right = parseUnary();
        if (t.op === "*") {
          left = left * right;
        } else {
          if (Math.abs(right) < 1e-15) {
            throw new BenchCalculatorError("Indefinido", "undefined");
          }
          left = left / right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parseUnary = (): number => {
    const t = peek();
    if (t && t.type === "op" && (t.op === "+" || t.op === "-")) {
      consume();
      const val = parseUnary();
      return t.op === "-" ? -val : val;
    }
    return parsePower();
  };

  const parsePower = (): number => {
    const base = parsePostfix();
    const t = peek();
    if (t && t.type === "op" && t.op === "^") {
      consume();
      const exp = parseUnary();
      if (base < 0 && !Number.isInteger(exp)) {
        throw new BenchCalculatorError("Erro", "domain");
      }
      if (base === 0 && exp < 0) {
        throw new BenchCalculatorError("Indefinido", "undefined");
      }
      return Math.pow(base, exp);
    }
    return base;
  };

  const parsePostfix = (): number => {
    let val = parsePrimary();
    while (true) {
      const t = peek();
      if (t && t.type === "op" && t.op === "%") {
        consume();
        val = val / 100;
      } else {
        break;
      }
    }
    return val;
  };

  const parsePrimary = (): number => {
    const t = peek();
    if (!t) throw new BenchCalculatorError("Erro", "syntax");

    if (t.type === "number") {
      consume();
      return t.value;
    }

    if (t.type === "lparen") {
      consume();
      const inner = parseExpr();
      const next = peek();
      // Permite parêntese final omitido durante preview ao vivo ou exige fechamento se houver token inválido
      if (next && next.type === "rparen") {
        consume();
      } else if (next) {
        throw new BenchCalculatorError("Erro", "syntax");
      }
      return inner;
    }

    if (t.type === "ident") {
      consume();
      if (t.name === "pi") return Math.PI;
      if (t.name === "e") return Math.E;
      if (t.name === "ans") return ansValue;

      if (KNOWN_FUNCTIONS.has(t.name)) {
        const args: number[] = [];
        const next = peek();
        if (next && next.type === "lparen") {
          consume();
          if (peek()?.type !== "rparen") {
            args.push(parseExpr());
            while (peek()?.type === "semi") {
              consume();
              args.push(parseExpr());
            }
          }
          if (peek()?.type === "rparen") {
            consume();
          } else if (peek() !== undefined) {
            throw new BenchCalculatorError("Erro", "syntax");
          }
        } else {
          // Suporte ergonômico a √2 -> sqrt 2 sem parênteses explícitos
          args.push(parseUnary());
        }
        return applyBenchFunction(t.name, args, angleMode);
      }

      throw new BenchCalculatorError("Erro", "syntax");
    }

    throw new BenchCalculatorError("Erro", "syntax");
  };

  const rawResult = parseExpr();
  if (pos < tokens.length) {
    throw new BenchCalculatorError("Erro", "syntax");
  }
  return cleanBenchFloat(rawResult);
}

function applyBenchFunction(name: string, args: number[], angleMode: AngleMode): number {
  if (name === "hypot") {
    if (args.length < 2) {
      throw new BenchCalculatorError("Erro", "syntax");
    }
    return cleanBenchFloat(Math.hypot(...args));
  }

  if (args.length !== 1) {
    throw new BenchCalculatorError("Erro", "syntax");
  }
  const x = args[0]!;

  switch (name) {
    case "sin":
      return exactSin(x, angleMode);
    case "cos":
      return exactCos(x, angleMode);
    case "tan":
      return exactTan(x, angleMode);
    case "asin": {
      if (x < -1 || x > 1) throw new BenchCalculatorError("Erro", "domain");
      return cleanBenchFloat(radiansToAngle(Math.asin(x), angleMode));
    }
    case "acos": {
      if (x < -1 || x > 1) throw new BenchCalculatorError("Erro", "domain");
      return cleanBenchFloat(radiansToAngle(Math.acos(x), angleMode));
    }
    case "atan":
      return cleanBenchFloat(radiansToAngle(Math.atan(x), angleMode));
    case "sqrt": {
      if (x < 0) throw new BenchCalculatorError("Erro", "domain");
      return cleanBenchFloat(Math.sqrt(x));
    }
    case "cbrt":
      return cleanBenchFloat(Math.cbrt(x));
    case "abs":
      return cleanBenchFloat(Math.abs(x));
    case "sq":
      return cleanBenchFloat(x * x);
    case "cube":
      return cleanBenchFloat(x * x * x);
    default:
      throw new BenchCalculatorError("Erro", "syntax");
  }
}

/* ============================================================================
 * 3. FORMATAÇÃO PT-BR, POLEGADAS FRACIONÁRIAS (1/64") E CONVERSÃO IN ↔ MM
 * ============================================================================ */

export function formatBenchValue(
  value: number,
  decimalMode: BenchDecimalMode = "auto",
): string {
  if (!Number.isFinite(value)) return "Indefinido";
  const cleaned = cleanBenchFloat(value);

  if (Math.abs(cleaned) >= 1e12 || (Math.abs(cleaned) > 0 && Math.abs(cleaned) < 1e-7)) {
    return cleaned.toExponential(6).replace(".", ",");
  }

  if (decimalMode === "2") {
    const rounded = Number(cleaned.toFixed(2));
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  }

  if (decimalMode === "4") {
    const rounded = Number(cleaned.toFixed(4));
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  }

  // Modo "auto": até 12 dígitos significativos sem zeros à direita
  return String(cleaned).replace(".", ",");
}

export function formatMmToCommercialInchDisplay(mm: number): string {
  if (!Number.isFinite(mm)) return '0"';
  if (Math.abs(mm) < 1e-6) return '0"';
  const res = mmToCommercialInchFraction(mm, 64);
  return typeof res === "string" ? res : res.formatted;
}

export function convertBenchInchMm(
  value: number,
  direction: "mm_to_in" | "in_to_mm",
): number {
  if (!Number.isFinite(value)) {
    throw new BenchCalculatorError("Erro", "domain");
  }
  return direction === "mm_to_in"
    ? cleanBenchFloat(value / INCH_TO_MM)
    : cleanBenchFloat(value * INCH_TO_MM);
}

/* ============================================================================
 * 4. RESGATE DETERMINÍSTICO E PERSISTÊNCIA SEGURA DA MINI-CALCULADORA
 * ============================================================================ */

export const DEFAULT_BENCH_CALC_STATE: BenchPersistedState = {
  open: false,
  minimized: false,
  dockMode: "docked_right",
  floatingPos: { x: 84, y: 76 },
  angleMode: "DEG",
  decimalMode: "auto",
  expression: "",
  ans: 0,
  history: [],
};

/**
 * Regra determinística do botão `[ 🧮 Calc ]` (Seção 2.2):
 *  1. Se estiver oculta -> abre na Posição Padrão Fixa à Direita;
 *  2. Se estiver flutuando (mesmo longe/minimizada) -> resgata imediatamente para a Posição Padrão Fixa à Direita,
 *     restaurando tamanho padrão e preservando 100% da expressão, Ans e histórico;
 *  3. Se já estiver visível na Posição Padrão Fixa à Direita:
 *     - se estiver minimizada -> expande;
 *     - se estiver expandida -> fecha suavemente.
 */
export function applyDeterministicBenchRescueToggle(
  prev: BenchPersistedState,
): BenchPersistedState {
  if (!prev.open) {
    return {
      ...prev,
      open: true,
      minimized: false,
      dockMode: "docked_right",
    };
  }

  if (prev.dockMode === "floating") {
    return {
      ...prev,
      open: true,
      minimized: false,
      dockMode: "docked_right",
    };
  }

  if (prev.minimized) {
    return {
      ...prev,
      minimized: false,
    };
  }

  return {
    ...prev,
    open: false,
    minimized: false,
  };
}

/** Garante que ao menos 48px do cabeçalho permaneçam dentro do viewport após rotação/resize */
export function clampFloatingBenchPosition(
  pos: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  panelWidth = 264,
): { x: number; y: number } {
  const safeW = Math.max(320, viewportWidth || 1280);
  const safeH = Math.max(320, viewportHeight || 800);
  const minVisiblePx = 48;

  const minX = Math.min(8, safeW - panelWidth);
  const maxX = Math.max(8, safeW - Math.max(minVisiblePx, Math.min(panelWidth, 140)));
  const minY = 44;
  const maxY = Math.max(minY, safeH - minVisiblePx - 12);

  return {
    x: Math.round(Math.min(maxX, Math.max(minX, pos.x))),
    y: Math.round(Math.min(maxY, Math.max(minY, pos.y))),
  };
}

export function loadPersistedBenchCalcState(): BenchPersistedState {
  if (typeof window === "undefined") return { ...DEFAULT_BENCH_CALC_STATE };
  try {
    const raw = window.localStorage.getItem(CHAMFER_BENCH_CALC_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BENCH_CALC_STATE };
    const parsed = JSON.parse(raw) as Partial<BenchPersistedState>;
    const angleMode: AngleMode =
      parsed.angleMode === "RAD" || parsed.angleMode === "GRAD" ? parsed.angleMode : "DEG";
    const decimalMode: BenchDecimalMode =
      parsed.decimalMode === "2" || parsed.decimalMode === "4" ? parsed.decimalMode : "auto";
    const dockMode: BenchDockMode =
      parsed.dockMode === "floating" ? "floating" : "docked_right";

    return {
      open: Boolean(parsed.open),
      minimized: Boolean(parsed.minimized),
      dockMode,
      floatingPos:
        parsed.floatingPos &&
        Number.isFinite(parsed.floatingPos.x) &&
        Number.isFinite(parsed.floatingPos.y)
          ? parsed.floatingPos
          : { ...DEFAULT_BENCH_CALC_STATE.floatingPos },
      angleMode,
      decimalMode,
      expression: typeof parsed.expression === "string" ? parsed.expression : "",
      ans: typeof parsed.ans === "number" && Number.isFinite(parsed.ans) ? parsed.ans : 0,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, BENCH_MAX_HISTORY) : [],
    };
  } catch {
    return { ...DEFAULT_BENCH_CALC_STATE };
  }
}

export function savePersistedBenchCalcState(state: BenchPersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CHAMFER_BENCH_CALC_STORAGE_KEY,
      JSON.stringify({
        ...state,
        history: state.history.slice(0, BENCH_MAX_HISTORY),
      }),
    );
  } catch {
    // Ignora falha de quota em modo privado
  }
}

/* ============================================================================
 * 5. PONTE BIDIRECIONAL CAD: EXTRATOR DE MEDIDAS REAIS & AVALIADOR EM NOTAS
 * ============================================================================ */

export interface CadMeasurementChip {
  key: string;
  label: string;
  shortTag: string;
  value: number;
  unit: "mm" | "°";
  formattedInsert: string;
}

export function extractCadEntityMeasurements(entity: Entity): CadMeasurementChip[] {
  const chips: CadMeasurementChip[] = [];
  const pushChip = (
    key: string,
    label: string,
    shortTag: string,
    rawVal: number,
    unit: "mm" | "°" = "mm",
  ) => {
    if (!Number.isFinite(rawVal) || Math.abs(rawVal) < 1e-6) return;
    const rounded = Number(rawVal.toFixed(4));
    chips.push({
      key,
      label,
      shortTag,
      value: rounded,
      unit,
      formattedInsert: String(rounded).replace(".", ","),
    });
  };

  if (entity.type === "line") {
    const len = dist({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
    const dx = Math.abs(entity.x2 - entity.x1);
    const dy = Math.abs(entity.y2 - entity.y1);
    const angleDeg = (((Math.atan2(-(entity.y2 - entity.y1), entity.x2 - entity.x1) * 180) / Math.PI) + 360) % 360;
    pushChip("len", "Comprimento L", "L", len, "mm");
    if (dx > 1e-3 && dy > 1e-3) {
      pushChip("dx", "Largura ΔX", "ΔX", dx, "mm");
      pushChip("dy", "Altura ΔY", "ΔY", dy, "mm");
    }
    pushChip("ang", "Ângulo ∠", "∠", angleDeg === 0 ? 0.0001 : angleDeg, "°");
    if (angleDeg === 0 && chips[chips.length - 1]?.key === "ang") {
      chips[chips.length - 1] = {
        key: "ang",
        label: "Ângulo ∠",
        shortTag: "∠",
        value: 0,
        unit: "°",
        formattedInsert: "0",
      };
    }
    return chips;
  }

  if (entity.type === "circle") {
    pushChip("dia", "Diâmetro Ø", "Ø", entity.r * 2, "mm");
    pushChip("rad", "Raio R", "R", entity.r, "mm");
    pushChip("perim", "Perímetro", "P", 2 * Math.PI * entity.r, "mm");
    return chips;
  }

  if (entity.type === "arc") {
    let sweep = entity.a1 - entity.a0;
    while (sweep <= 0) sweep += Math.PI * 2;
    const sweepDeg = (sweep * 180) / Math.PI;
    pushChip("rad", "Raio R", "R", entity.r, "mm");
    pushChip("dia", "Diâmetro Ø", "Ø", entity.r * 2, "mm");
    pushChip("len", "Comprimento L", "L", entity.r * sweep, "mm");
    pushChip("ang", "Ângulo ∠", "∠", sweepDeg, "°");
    return chips;
  }

  if (entity.type === "ellipse") {
    pushChip("w", "Largura 2a", "L", entity.rx * 2, "mm");
    pushChip("h", "Altura 2b", "A", entity.ry * 2, "mm");
    pushChip("perim", "Perímetro", "P", pathLength(entity), "mm");
    return chips;
  }

  if (entity.type === "polyline") {
    const bb = boxOf(entity);
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    const perim = pathLength(entity);
    if (entity.closed) {
      pushChip("w", "Largura", "L", w, "mm");
      pushChip("h", "Altura", "A", h, "mm");
      pushChip("perim", "Perímetro", "P", perim, "mm");
    } else {
      pushChip("len", "Comprimento L", "L", perim, "mm");
      pushChip("w", "Largura ΔX", "ΔX", w, "mm");
      pushChip("h", "Altura ΔY", "ΔY", h, "mm");
    }
    return chips;
  }

  if (entity.type !== "text" && entity.type !== "point") {
    const bb = boxOf(entity);
    pushChip("len", "Perímetro", "P", pathLength(entity), "mm");
    pushChip("w", "Largura", "L", bb.maxX - bb.minX, "mm");
    pushChip("h", "Altura", "A", bb.maxY - bb.minY, "mm");
  }

  return chips;
}

/**
 * Avalia expressões matemáticas embutidas em uma Anotação Técnica (`[ = Calcular Expressão ]`).
 * Exemplos suportados:
 *  - `"C = 40 * π"`         -> `"C = 40 * π = 125,66 mm"`
 *  - `"hypot(300; 400)"`    -> `"hypot(300; 400) = 500 mm"`
 *  - `"Dobra: 250 + 85,5 ="` -> `"Dobra: 250 + 85,5 = 335,5 mm"`
 */
export function evaluateInlineNoteFormulaText(
  noteOrSlice: string,
  angleMode: AngleMode = "DEG",
  ansValue = 0,
): { updatedText: string; evaluatedValue: number; formattedValue: string } | null {
  const lines = noteOrSlice.split("\n");
  for (let idx = lines.length - 1; idx >= 0; idx--) {
    const rawLine = lines[idx]!;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Remove sufixo "= <valor> mm" anterior caso o usuário esteja recalculando a linha
    const cleanedLine = trimmed.replace(/\s*=\s*[-+]?[0-9.,]+(?:\s*(?:mm|°|"))?\s*$/i, (match, offset) => {
      // Só remove se houver outro "=" antes (ex: "C = 40 * π = 125,66 mm")
      const prefix = trimmed.slice(0, offset);
      return prefix.includes("=") ? "" : match;
    });

    // Extrai candidato a expressão após ":" ou "=" inicial (ex: "C = 40 * π" -> "40 * π")
    let exprCandidate = cleanedLine.replace(/=\s*$/, "").trim();
    const eqIdx = exprCandidate.indexOf("=");
    if (eqIdx >= 0) {
      exprCandidate = exprCandidate.slice(eqIdx + 1).trim();
    } else {
      const colonIdx = exprCandidate.indexOf(":");
      if (colonIdx >= 0) {
        exprCandidate = exprCandidate.slice(colonIdx + 1).trim();
      }
    }

    // Remove unidade "mm" ao final dos termos caso digitada (ex: "300 mm + 150 mm")
    const sanitizedExpr = exprCandidate.replace(/(\d)\s*mm\b/gi, "$1").trim();
    if (!sanitizedExpr) continue;

    try {
      const val = evaluateBenchExpression(sanitizedExpr, angleMode, ansValue);
      // Formata com até 2 casas decimais enxutas para notas de fabricação (ex: 125,66 / 500)
      const formatted = formatBenchValue(val, "2");
      const baseWithoutTrailingEq = cleanedLine.replace(/\s*=\s*$/, "");
      lines[idx] = `${baseWithoutTrailingEq} = ${formatted} mm`;
      return {
        updatedText: lines.join("\n"),
        evaluatedValue: val,
        formattedValue: formatted,
      };
    } catch {
      // Tenta linha anterior
    }
  }
  return null;
}

/* ============================================================================
 * 6. EVENTO GLOBAL DA PONTE DE INJEÇÃO DIRETA NO CAD (`[ ↳ Usar no CAD ]`)
 * ============================================================================ */

export const CHAMFER_INJECT_CAD_VALUE_EVENT = "chamfer:inject-cad-value";

export interface ChamferInjectCadValueDetail {
  value: number;
  formattedPtBr: string;
  handled: boolean;
}

/**
 * Dispara o valor calculado para qualquer editor numérico CAD atualmente aberto
 * (`ChamferDirectDimensionEditor`, `ChamferCompactNumericEditor` ou `<input>` dimensional focado),
 * retornando `true` se algum campo ativo consumiu o valor em tempo real.
 */
export function dispatchValueToActiveCadField(value: number): boolean {
  if (typeof window === "undefined" || !Number.isFinite(value)) return false;
  const formattedPtBr = formatBenchValue(value, "4");

  // 1. Verifica se há um <input> HTML numérico focado no DOM (ex: largura/altura/offset)
  if (typeof document !== "undefined" && document.activeElement instanceof HTMLInputElement) {
    const inp = document.activeElement;
    if (!inp.readOnly && !inp.disabled && inp.dataset.benchIgnore !== "true") {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      const strForInput = inp.type === "number" ? String(Number(value.toFixed(4))) : formattedPtBr;
      if (nativeValueSetter) {
        nativeValueSetter.call(inp, strForInput);
      } else {
        inp.value = strForInput;
      }
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  // 2. Dispara evento síncrono para os teclados numéricos próprios do CHAMFER
  const detail: ChamferInjectCadValueDetail = {
    value: Number(value.toFixed(4)),
    formattedPtBr,
    handled: false,
  };
  window.dispatchEvent(
    new CustomEvent<ChamferInjectCadValueDetail>(CHAMFER_INJECT_CAD_VALUE_EVENT, {
      detail,
    }),
  );
  return detail.handled;
}
