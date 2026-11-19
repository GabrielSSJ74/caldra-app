/**
 * CALDRA CHAMFER — PARAMETER STORE, SAFE EXPRESSION PARSER & CONFIGURATIONS (PILAR 2)
 *
 * - Parser matemático recursivo puro (Tokenizer + Recursive Descent AST): ZERO eval / new Function.
 * - Suporte a variáveis de usuário e automáticas (d1, d2, ...), unidades (mm, cm, m, in, pol, ", deg, °, rad).
 * - Grafo Dirigido Acíclico (DAG) de dependências com detecção de ciclos via DFS.
 * - Ordenação topológica para recálculo incremental e rastreamento "Quem usa este parâmetro".
 * - Slider Sweep (min/max) e Tabela de Configurações (Família de Peças: DN50, DN100, DN150...).
 * - Importação/Exportação JSON e CSV.
 */

export type ParameterUnit = "mm" | "deg" | "qty";

export interface ChamferParameter {
  name: string;
  expression: string;
  value: number;
  unit: ParameterUnit;
  kind: "user" | "model";
  description?: string;
  favorite?: boolean;
  sweepMin?: number;
  sweepMax?: number;
  usedBy: string[];
}

export interface ParameterConfigurationRow {
  id: string;
  name: string;
  overrides: Record<string, string>;
}

export interface ExpressionEvalResult {
  ok: boolean;
  value: number;
  dependencies: string[];
  error?: string;
}

export interface ParameterMutationResult {
  ok: boolean;
  parameter?: ChamferParameter;
  affected: string[];
  error?: string;
  cyclePath?: string[];
}

const MAX_ABS_VALUE = 1e6;

export function sanitizeParameterNumber(val: number, fallback = 0): number {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  if (Math.abs(val) > MAX_ABS_VALUE) return Math.sign(val) * MAX_ABS_VALUE;
  if (Object.is(val, -0) || Math.abs(val) < 1e-12) return 0;
  return Number(val.toPrecision(12));
}

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; name: string }
  | { type: "op"; op: "+" | "-" | "*" | "/" | "^" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "sep" };

const UNIT_CONVERSIONS: Record<string, { factor: number; kind: "length" | "angle" }> = {
  mm: { factor: 1, kind: "length" },
  cm: { factor: 10, kind: "length" },
  m: { factor: 1000, kind: "length" },
  in: { factor: 25.4, kind: "length" },
  pol: { factor: 25.4, kind: "length" },
  deg: { factor: 1, kind: "angle" },
  rad: { factor: 180 / Math.PI, kind: "angle" },
};

const BUILTIN_FUNCTIONS = new Set([
  "sqrt",
  "cbrt",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "abs",
  "min",
  "max",
  "round",
  "floor",
  "ceil",
  "hypot",
]);

function normalizeRawExpression(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/√/g, "sqrt ")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/([0-9]+(?:\.[0-9]+)?)\s*"/g, "$1 in")
    .replace(/([0-9]+(?:\.[0-9]+)?)\s*°/g, "$1 deg")
    .replace(/°/g, " deg");
}

function tokenizeExpression(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === ";" || ch === ",") {
      tokens.push({ type: "sep" });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^") {
      tokens.push({ type: "op", op: ch });
      i++;
      continue;
    }

    // Number literal (with optional scientific notation)
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let hasDot = ch === ".";
      i++;
      while (i < n) {
        const c = source[i]!;
        if (/[0-9]/.test(c)) {
          i++;
        } else if (c === "." && !hasDot) {
          hasDot = true;
          i++;
        } else {
          break;
        }
      }
      if (i < n && (source[i] === "e" || source[i] === "E")) {
        const expStart = i;
        i++;
        if (i < n && (source[i] === "+" || source[i] === "-")) i++;
        if (i < n && /[0-9]/.test(source[i]!)) {
          while (i < n && /[0-9]/.test(source[i]!)) i++;
        } else {
          i = expStart;
        }
      }
      const rawNum = source.slice(start, i);
      const val = Number(rawNum);
      if (!Number.isFinite(val)) {
        throw new Error(`Número inválido: ${rawNum}`);
      }
      tokens.push({ type: "number", value: val });
      continue;
    }

    // Identifier (variable, function, constant, or unit)
    if (/[a-zA-Z_À-ÿ]/.test(ch)) {
      const start = i;
      i++;
      while (i < n && /[a-zA-Z0-9_À-ÿ]/.test(source[i]!)) i++;
      tokens.push({ type: "ident", name: source.slice(start, i) });
      continue;
    }

    throw new Error(`Caractere não suportado na expressão: "${ch}"`);
  }

  return tokens;
}

/**
 * Avalia uma expressão matemática pura sem eval/new Function, resolvendo variáveis e unidades.
 */
export function evaluateSafeParameterExpression(
  expression: string,
  lookupVar: (canonicalName: string) => number | undefined,
): ExpressionEvalResult {
  const cleaned = normalizeRawExpression(expression);
  if (!cleaned) {
    return { ok: false, value: 0, dependencies: [], error: "Expressão vazia" };
  }

  let tokens: Token[];
  try {
    tokens = tokenizeExpression(cleaned);
  } catch (err) {
    return {
      ok: false,
      value: 0,
      dependencies: [],
      error: err instanceof Error ? err.message : "Erro de sintaxe",
    };
  }

  if (tokens.length === 0) {
    return { ok: false, value: 0, dependencies: [], error: "Expressão vazia" };
  }

  const dependencies = new Set<string>();
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => tokens[pos++]!;

  const parseExpression = (): number => {
    let left = parseTerm();
    while (true) {
      const tok = peek();
      if (tok && tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
        consume();
        const right = parseTerm();
        left = tok.op === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parsePower();
    while (true) {
      const tok = peek();
      if (tok && tok.type === "op" && (tok.op === "*" || tok.op === "/")) {
        consume();
        const right = parsePower();
        if (tok.op === "/") {
          if (Math.abs(right) < 1e-12) {
            throw new Error("Divisão por zero");
          }
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parsePower = (): number => {
    let base = parseUnary();
    const tok = peek();
    if (tok && tok.type === "op" && tok.op === "^") {
      consume();
      const exp = parsePower();
      base = Math.pow(base, exp);
    }
    return base;
  };

  const parseUnary = (): number => {
    const tok = peek();
    if (tok && tok.type === "op" && tok.op === "+") {
      consume();
      return parseUnary();
    }
    if (tok && tok.type === "op" && tok.op === "-") {
      consume();
      return -parseUnary();
    }
    return parsePostfixUnit();
  };

  const parsePostfixUnit = (): number => {
    let val = parsePrimary();
    const next = peek();
    if (next && next.type === "ident") {
      const lower = next.name.toLowerCase();
      const unitInfo = UNIT_CONVERSIONS[lower];
      if (unitInfo) {
        consume();
        val = val * unitInfo.factor;
      }
    }
    return val;
  };

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) {
      throw new Error("Fim inesperado da expressão");
    }

    if (tok.type === "number") {
      consume();
      return tok.value;
    }

    if (tok.type === "lparen") {
      consume();
      const inner = parseExpression();
      const close = peek();
      if (!close || close.type !== "rparen") {
        throw new Error("Parêntese ')' ausente");
      }
      consume();
      return inner;
    }

    if (tok.type === "ident") {
      consume();
      const lower = tok.name.toLowerCase();
      if (lower === "pi") return Math.PI;
      if (lower === "e") return Math.E;

      // Function call
      const after = peek();
      if (after && after.type === "lparen" && BUILTIN_FUNCTIONS.has(lower)) {
        consume();
        const args: number[] = [];
        if (peek()?.type !== "rparen") {
          args.push(parseExpression());
          while (peek()?.type === "sep") {
            consume();
            args.push(parseExpression());
          }
        }
        if (peek()?.type !== "rparen") {
          throw new Error(`Parêntese ')' ausente na função ${lower}()`);
        }
        consume();
        return evalBuiltinFn(lower, args);
      }

      // Variable lookup (case-insensitive canonical lowercase key)
      const canonical = normalizeParamKey(tok.name);
      dependencies.add(canonical);
      const resolved = lookupVar(canonical);
      if (resolved === undefined) {
        throw new Error(`Parâmetro desconhecido: "${tok.name}"`);
      }
      return resolved;
    }

    throw new Error("Token inesperado na expressão");
  };

  try {
    const result = parseExpression();
    if (pos < tokens.length) {
      throw new Error("Tokens extras no final da expressão");
    }
    if (!Number.isFinite(result)) {
      throw new Error("Resultado não finito (NaN ou Infinito)");
    }
    if (Math.abs(result) > MAX_ABS_VALUE) {
      throw new Error(`Valor fora do limite de segurança (±${MAX_ABS_VALUE} mm)`);
    }
    return {
      ok: true,
      value: sanitizeParameterNumber(result),
      dependencies: Array.from(dependencies),
    };
  } catch (err) {
    return {
      ok: false,
      value: 0,
      dependencies: Array.from(dependencies),
      error: err instanceof Error ? err.message : "Erro ao avaliar expressão",
    };
  }
}

function evalBuiltinFn(fn: string, args: number[]): number {
  const a0 = args[0] ?? 0;
  const a1 = args[1] ?? 0;
  const DEG = Math.PI / 180;
  switch (fn) {
    case "sqrt":
      if (a0 < 0) throw new Error("Raiz quadrada de número negativo");
      return Math.sqrt(a0);
    case "cbrt":
      return Math.cbrt(a0);
    case "sin":
      return Math.sin(a0 * DEG);
    case "cos":
      return Math.cos(a0 * DEG);
    case "tan":
      return Math.tan(a0 * DEG);
    case "asin":
      if (a0 < -1 || a0 > 1) throw new Error("asin fora do domínio [-1, 1]");
      return Math.asin(a0) / DEG;
    case "acos":
      if (a0 < -1 || a0 > 1) throw new Error("acos fora do domínio [-1, 1]");
      return Math.acos(a0) / DEG;
    case "atan":
      return Math.atan(a0) / DEG;
    case "atan2":
      return Math.atan2(a0, a1) / DEG;
    case "abs":
      return Math.abs(a0);
    case "min":
      return args.length > 0 ? Math.min(...args) : 0;
    case "max":
      return args.length > 0 ? Math.max(...args) : 0;
    case "round":
      return Math.round(a0);
    case "floor":
      return Math.floor(a0);
    case "ceil":
      return Math.ceil(a0);
    case "hypot":
      return Math.hypot(...args);
    default:
      throw new Error(`Função desconhecida: ${fn}`);
  }
}

export function normalizeParamKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

/**
 * Extrai dependências (nomes de variáveis) de uma expressão sem precisar que todas existam.
 */
export function extractExpressionDependencies(expression: string): string[] {
  const cleaned = normalizeRawExpression(expression);
  if (!cleaned) return [];
  try {
    const tokens = tokenizeExpression(cleaned);
    const deps = new Set<string>();
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "ident") continue;
      const lower = tok.name.toLowerCase();
      if (lower === "pi" || lower === "e") continue;
      if (UNIT_CONVERSIONS[lower]) continue;
      const next = tokens[i + 1];
      if (next && next.type === "lparen" && BUILTIN_FUNCTIONS.has(lower)) continue;
      const key = normalizeParamKey(tok.name);
      if (key) deps.add(key);
    }
    return Array.from(deps);
  } catch {
    return [];
  }
}

export interface ParameterStoreSnapshot {
  parameters: ChamferParameter[];
  configurations: ParameterConfigurationRow[];
  activeConfigurationId: string | null;
  autoDimCounter: number;
}

/**
 * Store paramétrico com DAG de dependências, detecção de ciclos via DFS,
 * ordenação topológica, Slider Sweep e Configurações de Família de Peças.
 */
export class ChamferParameterStore {
  private params = new Map<string, ChamferParameter>();
  private deps = new Map<string, Set<string>>(); // node -> set of nodes it depends on
  private dependents = new Map<string, Set<string>>(); // node -> set of nodes depending on it
  private configurations: ParameterConfigurationRow[] = [];
  private activeConfigurationId: string | null = null;
  private autoDimCounter = 0;
  private listeners = new Set<() => void>();

  constructor(seedDefaults = true) {
    if (seedDefaults) {
      this.setParameter("largura", "400 mm", {
        unit: "mm",
        kind: "user",
        favorite: true,
        description: "Largura nominal da peça",
        sweepMin: 40,
        sweepMax: 1200,
      });
      this.setParameter("altura", "250 mm", {
        unit: "mm",
        kind: "user",
        favorite: true,
        description: "Altura nominal da peça",
        sweepMin: 40,
        sweepMax: 1000,
      });
      this.setParameter("chapa", "3.0 mm", {
        unit: "mm",
        kind: "user",
        favorite: true,
        description: "Espessura padrão da chapa",
        sweepMin: 0.8,
        sweepMax: 25,
      });
      this.setParameter("angulo", "90°", {
        unit: "deg",
        kind: "user",
        favorite: false,
        description: "Ângulo padrão de dobra/corte",
        sweepMin: 15,
        sweepMax: 175,
      });
      this.setParameter("furo_x", "largura / 4", {
        unit: "mm",
        kind: "user",
        favorite: false,
        description: "Posição X paramétrica do furo",
      });

      // Configurações de exemplo para família de peças industriais
      this.configurations = [
        {
          id: "cfg_dn50",
          name: "Flange DN50",
          overrides: { largura: "165 mm", altura: "165 mm", chapa: "12 mm" },
        },
        {
          id: "cfg_dn100",
          name: "Flange DN100",
          overrides: { largura: "220 mm", altura: "220 mm", chapa: "16 mm" },
        },
        {
          id: "cfg_dn150",
          name: "Flange DN150",
          overrides: { largura: "285 mm", altura: "285 mm", chapa: "19 mm" },
        },
      ];
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb());
  }

  public getAll(): ChamferParameter[] {
    return Array.from(this.params.values()).map((p) => ({ ...p, usedBy: [...p.usedBy] }));
  }

  public getFavorites(): ChamferParameter[] {
    return this.getAll().filter((p) => p.favorite);
  }

  public get(name: string): ChamferParameter | undefined {
    const key = normalizeParamKey(name);
    const p = this.params.get(key);
    return p ? { ...p, usedBy: [...p.usedBy] } : undefined;
  }

  public getValue(name: string, fallback = 0): number {
    const key = normalizeParamKey(name);
    return this.params.get(key)?.value ?? fallback;
  }

  public evaluate(expression: string): ExpressionEvalResult {
    return evaluateSafeParameterExpression(expression, (k) => this.params.get(k)?.value);
  }

  /**
   * Aloca automaticamente um parâmetro de modelo (d1, d2, d3...) ao criar cota 2D/3D.
   */
  public allocateModelDimension(
    expression: string,
    unit: ParameterUnit = "mm",
    usedByFeatureId?: string,
  ): ParameterMutationResult {
    this.autoDimCounter += 1;
    let name = `d${this.autoDimCounter}`;
    while (this.params.has(name)) {
      this.autoDimCounter += 1;
      name = `d${this.autoDimCounter}`;
    }
    return this.setParameter(name, expression, {
      unit,
      kind: "model",
      usedBy: usedByFeatureId ? [usedByFeatureId] : [],
    });
  }

  /**
   * Detecta ciclos no grafo de dependências via DFS (Depth-First Search) ANTES de mutar o estado.
   * Retorna o caminho exato do ciclo se houver (ex.: ["a", "b", "a"]).
   */
  private detectCycleWithCandidate(candidateKey: string, candidateDeps: string[]): string[] | null {
    const visited = new Set<string>();
    const stack: string[] = [candidateKey];

    const dfs = (current: string): string[] | null => {
      const nextDeps =
        current === candidateKey
          ? candidateDeps
          : Array.from(this.deps.get(current) ?? []);

      for (const dep of nextDeps) {
        if (dep === candidateKey) {
          return [...stack, dep];
        }
        if (visited.has(dep)) continue;
        visited.add(dep);
        stack.push(dep);
        const found = dfs(dep);
        if (found) return found;
        stack.pop();
      }
      return null;
    };

    return dfs(candidateKey);
  }

  /**
   * Define ou atualiza um parâmetro com detecção de ciclo DFS e propagação topológica no DAG.
   */
  public setParameter(
    rawName: string,
    expression: string,
    options?: {
      unit?: ParameterUnit;
      kind?: "user" | "model";
      description?: string;
      favorite?: boolean;
      sweepMin?: number;
      sweepMax?: number;
      usedBy?: string[];
    },
  ): ParameterMutationResult {
    const key = normalizeParamKey(rawName);
    if (!key) {
      return { ok: false, affected: [], error: "Nome de parâmetro inválido" };
    }
    if (BUILTIN_FUNCTIONS.has(key) || UNIT_CONVERSIONS[key] || key === "pi" || key === "e") {
      return {
        ok: false,
        affected: [],
        error: `"${key}" é uma palavra reservada de função ou unidade`,
      };
    }

    const candidateDeps = extractExpressionDependencies(expression);
    const cyclePath = this.detectCycleWithCandidate(key, candidateDeps);
    if (cyclePath) {
      return {
        ok: false,
        affected: [],
        cyclePath,
        error: `Referência circular detectada: ${cyclePath.join(" → ")}`,
      };
    }

    const evalRes = this.evaluate(expression);
    if (!evalRes.ok) {
      return {
        ok: false,
        affected: [],
        error: evalRes.error || "Expressão inválida",
      };
    }

    const existing = this.params.get(key);
    const nextParam: ChamferParameter = {
      name: key,
      expression: expression.trim(),
      value: evalRes.value,
      unit: options?.unit ?? existing?.unit ?? "mm",
      kind: options?.kind ?? existing?.kind ?? "user",
      description: options?.description ?? existing?.description ?? "",
      favorite: options?.favorite ?? existing?.favorite ?? false,
      sweepMin: options?.sweepMin ?? existing?.sweepMin ?? Math.max(0.1, evalRes.value * 0.2),
      sweepMax: options?.sweepMax ?? existing?.sweepMax ?? Math.max(10, evalRes.value * 2.5),
      usedBy: options?.usedBy ?? existing?.usedBy ?? [],
    };

    // Update DAG edges cleanly
    const prevDeps = this.deps.get(key);
    if (prevDeps) {
      for (const oldDep of prevDeps) {
        this.dependents.get(oldDep)?.delete(key);
      }
    }
    const newDepSet = new Set(candidateDeps);
    this.deps.set(key, newDepSet);
    for (const d of newDepSet) {
      if (!this.dependents.has(d)) this.dependents.set(d, new Set());
      this.dependents.get(d)!.add(key);
    }

    this.params.set(key, nextParam);

    // Topological recompute of downstream affected parameters only
    const affected = this.recomputeDownstream(key);
    this.emit();
    return { ok: true, parameter: { ...nextParam }, affected };
  }

  /**
   * Ordenação topológica restrita ao subgrafo alcançável a partir de `rootKey`.
   */
  private recomputeDownstream(rootKey: string): string[] {
    const reachable = new Set<string>();
    const collect = (k: string) => {
      for (const dep of this.dependents.get(k) ?? []) {
        if (!reachable.has(dep)) {
          reachable.add(dep);
          collect(dep);
        }
      }
    };
    collect(rootKey);

    if (reachable.size === 0) return [rootKey];

    // Kahn's algorithm on reachable subgraph
    const inDegree = new Map<string, number>();
    for (const node of reachable) {
      let deg = 0;
      for (const d of this.deps.get(node) ?? []) {
        if (reachable.has(d)) deg++;
      }
      inDegree.set(node, deg);
    }

    const queue: string[] = [];
    for (const [node, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(node);
    }

    const ordered: string[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      ordered.push(cur);
      for (const child of this.dependents.get(cur) ?? []) {
        if (!reachable.has(child)) continue;
        const nextDeg = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, nextDeg);
        if (nextDeg === 0) queue.push(child);
      }
    }

    for (const nodeKey of ordered) {
      const p = this.params.get(nodeKey);
      if (!p) continue;
      const res = this.evaluate(p.expression);
      if (res.ok) {
        p.value = res.value;
      }
    }

    return [rootKey, ...ordered];
  }

  public removeParameter(rawName: string): { ok: boolean; error?: string } {
    const key = normalizeParamKey(rawName);
    const depsOfThis = this.dependents.get(key);
    if (depsOfThis && depsOfThis.size > 0) {
      return {
        ok: false,
        error: `Parâmetro "${key}" é usado por: ${Array.from(depsOfThis).join(", ")}`,
      };
    }
    const prevDeps = this.deps.get(key);
    if (prevDeps) {
      for (const d of prevDeps) {
        this.dependents.get(d)?.delete(key);
      }
    }
    this.deps.delete(key);
    this.dependents.delete(key);
    this.params.delete(key);
    this.emit();
    return { ok: true };
  }

  public toggleFavorite(rawName: string): void {
    const key = normalizeParamKey(rawName);
    const p = this.params.get(key);
    if (!p) return;
    p.favorite = !p.favorite;
    this.emit();
  }

  public registerUsage(rawName: string, consumerLabel: string): void {
    const key = normalizeParamKey(rawName);
    const p = this.params.get(key);
    if (!p) return;
    if (!p.usedBy.includes(consumerLabel)) {
      p.usedBy.push(consumerLabel);
      this.emit();
    }
  }

  public getUsersOf(rawName: string): string[] {
    const key = normalizeParamKey(rawName);
    const p = this.params.get(key);
    const paramDependents = Array.from(this.dependents.get(key) ?? []).map((d) => `fx:${d}`);
    return [...(p?.usedBy ?? []), ...paramDependents];
  }

  // ---- CONFIGURATIONS (FAMÍLIA DE PEÇAS) ----

  public getConfigurations(): ParameterConfigurationRow[] {
    return this.configurations.map((c) => ({ ...c, overrides: { ...c.overrides } }));
  }

  public getActiveConfigurationId(): string | null {
    return this.activeConfigurationId;
  }

  public saveConfiguration(name: string, overrides?: Record<string, string>): ParameterConfigurationRow {
    const cleanName = name.trim() || `Variante ${this.configurations.length + 1}`;
    const resolvedOverrides: Record<string, string> = overrides
      ? { ...overrides }
      : Object.fromEntries(
          this.getAll()
            .filter((p) => p.kind === "user")
            .map((p) => [p.name, p.expression]),
        );
    const existing = this.configurations.find(
      (c) => c.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing) {
      existing.overrides = resolvedOverrides;
      this.emit();
      return { ...existing, overrides: { ...existing.overrides } };
    }
    const row: ParameterConfigurationRow = {
      id: `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      overrides: resolvedOverrides,
    };
    this.configurations.push(row);
    this.emit();
    return { ...row, overrides: { ...row.overrides } };
  }

  public applyConfiguration(configId: string): { ok: boolean; affected: string[]; error?: string } {
    const cfg = this.configurations.find((c) => c.id === configId);
    if (!cfg) return { ok: false, affected: [], error: "Configuração não encontrada" };
    const affected = new Set<string>();
    for (const [k, expr] of Object.entries(cfg.overrides)) {
      const res = this.setParameter(k, expr);
      if (res.ok) {
        res.affected.forEach((a) => affected.add(a));
      }
    }
    this.activeConfigurationId = cfg.id;
    this.emit();
    return { ok: true, affected: Array.from(affected) };
  }

  public deleteConfiguration(configId: string): void {
    this.configurations = this.configurations.filter((c) => c.id !== configId);
    if (this.activeConfigurationId === configId) this.activeConfigurationId = null;
    this.emit();
  }

  // ---- IMPORT / EXPORT JSON & CSV ----

  public exportJSON(): string {
    return JSON.stringify(this.createSnapshot(), null, 2);
  }

  public exportCSV(): string {
    const header = "name,expression,value,unit,kind,description";
    const rows = this.getAll().map((p) =>
      [
        p.name,
        `"${p.expression.replace(/"/g, '""')}"`,
        p.value.toFixed(4),
        p.unit,
        p.kind,
        `"${(p.description ?? "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    return [header, ...rows].join("\n");
  }

  public importJSON(jsonText: string): { ok: boolean; importedCount: number; error?: string } {
    try {
      const parsed = JSON.parse(jsonText) as Partial<ParameterStoreSnapshot>;
      if (!parsed || !Array.isArray(parsed.parameters)) {
        return { ok: false, importedCount: 0, error: "JSON de parâmetros inválido" };
      }
      let count = 0;
      for (const p of parsed.parameters) {
        if (typeof p?.name === "string" && typeof p?.expression === "string") {
          const res = this.setParameter(p.name, p.expression, {
            unit: p.unit,
            kind: p.kind,
            description: p.description,
            favorite: p.favorite,
            sweepMin: p.sweepMin,
            sweepMax: p.sweepMax,
          });
          if (res.ok) count++;
        }
      }
      if (Array.isArray(parsed.configurations)) {
        for (const c of parsed.configurations) {
          if (c?.name && c?.overrides) {
            this.saveConfiguration(c.name, c.overrides);
          }
        }
      }
      return { ok: true, importedCount: count };
    } catch {
      return { ok: false, importedCount: 0, error: "Falha ao ler JSON de parâmetros" };
    }
  }

  public importCSV(csvText: string): { ok: boolean; importedCount: number; error?: string } {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return { ok: false, importedCount: 0, error: "CSV vazio ou sem linhas de dados" };
    }
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]!.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      const [name, expr, , unitRaw, kindRaw, desc] = parts;
      if (!name || !expr) continue;
      const unit: ParameterUnit = unitRaw === "deg" ? "deg" : unitRaw === "qty" ? "qty" : "mm";
      const kind: "user" | "model" = kindRaw === "model" ? "model" : "user";
      const res = this.setParameter(name, expr, { unit, kind, description: desc ?? "" });
      if (res.ok) count++;
    }
    return { ok: true, importedCount: count };
  }

  public getValueMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, p] of this.params.entries()) {
      out[k] = p.value;
    }
    return out;
  }

  public createSnapshot(): ParameterStoreSnapshot {
    return {
      parameters: this.getAll(),
      configurations: this.getConfigurations(),
      activeConfigurationId: this.activeConfigurationId,
      autoDimCounter: this.autoDimCounter,
    };
  }

  public restoreSnapshot(snap: ParameterStoreSnapshot): void {
    this.params.clear();
    this.deps.clear();
    this.dependents.clear();
    this.autoDimCounter = snap.autoDimCounter ?? 0;
    for (const p of snap.parameters) {
      this.params.set(p.name, { ...p, usedBy: [...p.usedBy] });
      const dList = extractExpressionDependencies(p.expression);
      this.deps.set(p.name, new Set(dList));
      for (const d of dList) {
        if (!this.dependents.has(d)) this.dependents.set(d, new Set());
        this.dependents.get(d)!.add(p.name);
      }
    }
    this.configurations = snap.configurations.map((c) => ({ ...c, overrides: { ...c.overrides } }));
    this.activeConfigurationId = snap.activeConfigurationId;
    this.emit();
  }
}

export const ParameterStore = ChamferParameterStore;
export const chamferParameterStore = new ChamferParameterStore(true);
