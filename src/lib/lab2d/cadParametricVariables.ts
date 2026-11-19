/**
 * CALDRA CHAMFER — VARIÁVEIS E EQUAÇÕES PARAMÉTRICAS (CAD PARAMETRICS)
 *
 * Atualizado para delegar 100% da avaliação ao parser recursivo seguro de
 * `@/chamfer/core/parameterStore` (ZERO eval / ZERO new Function, conversão automática de unidades
 * mm/cm/m/in/pol/"/°/deg/rad e detecção de ciclos via DFS), preservando integralmente
 * a API retrocompatível `ParametricVariableStore` e `globalParametricStore`.
 */

import {
  chamferParameterStore,
  evaluateSafeParameterExpression,
  extractExpressionDependencies,
} from "@/chamfer/core/parameterStore";

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
    if (v) return v.value;
    const modern = chamferParameterStore.get(name);
    return modern ? modern.value : fallback;
  }

  /**
   * Avalia expressão matemática com parser recursivo puro (zero eval / zero new Function).
   */
  public evaluateExpression(expr: string): number {
    const res = evaluateSafeParameterExpression(expr, (key) => {
      const legacy = this.variables.get(key.toUpperCase());
      if (legacy) return legacy.value;
      const modern = chamferParameterStore.get(key);
      return modern ? modern.value : undefined;
    });
    return res.ok && Number.isFinite(res.value) ? res.value : 0;
  }

  private hasCycle(targetUpper: string, candidateExpr: string): boolean {
    const deps = extractExpressionDependencies(candidateExpr).map((d) => d.toUpperCase());
    const visited = new Set<string>();
    const dfs = (cur: string): boolean => {
      const list =
        cur === targetUpper
          ? deps
          : extractExpressionDependencies(this.variables.get(cur)?.expression ?? "").map((d) =>
              d.toUpperCase(),
            );
      for (const next of list) {
        if (next === targetUpper) return true;
        if (visited.has(next)) continue;
        visited.add(next);
        if (dfs(next)) return true;
      }
      return false;
    };
    return dfs(targetUpper);
  }

  public setVariable(
    name: string,
    expression: string,
    description = "",
    unit: "mm" | "deg" | "qty" = "mm",
  ) {
    const upperName = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    if (!upperName) return;
    if (this.hasCycle(upperName, expression)) {
      return;
    }

    const value = this.evaluateExpression(expression);
    this.variables.set(upperName, {
      name: upperName,
      expression,
      value,
      description,
      unit,
    });

    // Sincroniza silenciosamente com o novo ChamferParameterStore
    chamferParameterStore.setParameter(upperName.toLowerCase(), expression, {
      unit,
      description,
      kind: "user",
    });

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
      for (const [, v] of this.variables.entries()) {
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
