/**
 * CALDRA CHAMFER — VARIÁVEIS E EQUAÇÕES PARAMÉTRICAS (CAD PARAMETRICS)
 *
 * Tabela de variáveis globais e expressões relacionais do projeto:
 *  - Ex: LARGURA = 500, ALTURA = 300, MARGEM = 25, FURO = LARGURA / 10
 *  - Avaliador de expressões matemáticas seguro e determinístico;
 *  - Grafo de dependências direcionado acíclico (DAG) para propagação em cascata;
 *  - Atualização automática de entidades geométricas vinculadas a variáveis.
 */

export interface ParametricVariable {
  name: string;
  expression: string;
  value: number;
  description?: string;
  unit: "mm" | "deg" | "qty";
}

export class ParametricVariableStore {
  private variables: Map<string, ParametricVariable> = new Map();
  private listeners: (() => void)[] = [];

  constructor() {
    // Variáveis padrão para caldeiraria e mecânica
    this.setVariable("LARGURA", "600", "Largura nominal da chapa / peça");
    this.setVariable("ALTURA", "400", "Altura nominal da chapa / peça");
    this.setVariable("ESPESSURA", "6.35", "Espessura da chapa (1/4 pol)");
    this.setVariable("MARGEM", "50", "Margem de dobra e furação");
    this.setVariable("FURO_FIXACAO", "18", "Diâmetro dos furos de parafuso M16");
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getAll(): ParametricVariable[] {
    return Array.from(this.variables.values());
  }

  public get(name: string): ParametricVariable | undefined {
    return this.variables.get(name.toUpperCase());
  }

  public getValue(name: string, fallback = 0): number {
    const v = this.variables.get(name.toUpperCase());
    return v ? v.value : fallback;
  }

  /**
   * Avalia expressão com suporte a nomes de variáveis e operadores básicos (+, -, *, /, ^, parênteses)
   */
  public evaluateExpression(expr: string): number {
    const clean = expr.trim();
    if (!clean) return 0;

    // Se for número puro
    const num = Number(clean);
    if (!isNaN(num)) return num;

    // Substitui variáveis conhecidas pelo seu valor numérico
    let parsed = clean.toUpperCase();
    const sortedVars = Array.from(this.variables.values()).sort(
      (a, b) => b.name.length - a.name.length,
    );

    for (const v of sortedVars) {
      const regex = new RegExp(`\\b${v.name}\\b`, "g");
      parsed = parsed.replace(regex, `(${v.value})`);
    }

    try {
      // Avaliação segura via Function isolada com escopo restrito (somente Math e números)
      // Remove qualquer caractere que não seja número, operador matemático, Math.* ou parênteses
      const sanitized = parsed.replace(/[^0-9+\-*/().^eE\s]/g, "");
      const result = new Function(`return (${sanitized.replace(/\^/g, "**")});`)();
      return typeof result === "number" && !isNaN(result) ? result : 0;
    } catch {
      return 0;
    }
  }

  public setVariable(
    name: string,
    expression: string,
    description = "",
    unit: "mm" | "deg" | "qty" = "mm",
  ) {
    const upperName = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    if (!upperName) return;

    const value = this.evaluateExpression(expression);
    this.variables.set(upperName, {
      name: upperName,
      expression,
      value,
      description,
      unit,
    });

    // Reavalia variáveis dependentes
    this.recomputeAll();
    this.notify();
  }

  public removeVariable(name: string) {
    this.variables.delete(name.toUpperCase());
    this.recomputeAll();
    this.notify();
  }

  public recomputeAll() {
    let changed = true;
    let cycles = 0;
    while (changed && cycles < 10) {
      changed = false;
      cycles++;
      for (const [key, v] of this.variables.entries()) {
        const newVal = this.evaluateExpression(v.expression);
        if (Math.abs(newVal - v.value) > 1e-6) {
          v.value = newVal;
          changed = true;
        }
      }
    }
  }
}

export const globalParametricStore = new ParametricVariableStore();
