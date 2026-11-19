/**
 * CALDRA CHAMFER — SOLVER DE RESTRIÇÕES 2D EM 2 ESTÁGIOS + DOF EXATO (PILAR 3)
 *
 * Implementação clean-room em TypeScript puro:
 * - Estágio 1: Decomposição rígida analítica (Union-Find de pontos coincidentes, fixos e travamentos H/V).
 * - Estágio 2: Levenberg-Marquardt amortecido ((J^T J + λ I) Δx = -J^T r) com Jacobiano analítico,
 *   limite de 30 iterações e convergência ||r|| < 1e-9.
 * - Posto numérico via QR com pivoteamento de colunas (tolerância 1e-7): DOF = numVariaveis - rank(J).
 * - Recusa automática de restrições redundantes ou conflitantes com identificação clara do conflito.
 * - Pílula inteligente de restrições válidas para seleção (máx. 5 chips + Mais) e Autorrestringir.
 */

export interface SketchPoint2D {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
}

export interface SketchLine2D {
  id: string;
  p1: string;
  p2: string;
  isConstruction?: boolean;
  isCenterline?: boolean;
}

export interface SketchCircle2D {
  id: string;
  center: string;
  radius: number;
  isConstruction?: boolean;
}

export interface SketchArc2D {
  id: string;
  center: string;
  start: string;
  end: string;
  radius: number;
  isConstruction?: boolean;
}

export type SketchConstraintType =
  | "coincident"
  | "pointOnCurve"
  | "horizontal"
  | "vertical"
  | "parallel"
  | "perpendicular"
  | "tangent"
  | "concentric"
  | "collinear"
  | "equal"
  | "midpoint"
  | "symmetric"
  | "fixed"
  | "distance"
  | "distanceH"
  | "distanceV"
  | "radius"
  | "diameter"
  | "angle"
  | "arcLength";

export interface SketchConstraint {
  id: string;
  type: SketchConstraintType;
  label?: string;
  /** IDs de pontos (dependendo do tipo da restrição) */
  points?: string[];
  /** IDs de linhas (para paralela, perpendicular, colinear, igual, ângulo, simetria) */
  lines?: string[];
  /** IDs de círculos/arcos */
  circles?: string[];
  /** Valor numérico alvo (mm ou graus) */
  value?: number;
  /** Para ponto fixo */
  fixedX?: number;
  fixedY?: number;
  /** Cota dirigida (somente leitura, não restringe DOF) */
  driven?: boolean;
  /** Expressão paramétrica opcional vinculada ao ParameterStore */
  expression?: string;
}

export interface ParametricSketch2D {
  points: SketchPoint2D[];
  lines: SketchLine2D[];
  circles: SketchCircle2D[];
  arcs?: SketchArc2D[];
  constraints: SketchConstraint[];
}

export type DofVisualState = "underconstrained" | "fullyDefined" | "conflict";

export interface ConstraintSolveResult {
  ok: boolean;
  converged: boolean;
  iterations: number;
  residualNorm: number;
  numVariables: number;
  rank: number;
  dof: number;
  status: DofVisualState;
  statusLabel: string;
  /** Cor visual padrão (sem sobrescrever camadas customizadas) */
  statusColorDark: string;
  statusColorLight: string;
  /** IDs das restrições em conflito/redundância se houver */
  conflictingConstraintIds: string[];
  conflictMessage?: string;
  /** Cotas dirigidas avaliadas (somente leitura) */
  drivenValues: Record<string, number>;
  /** Esboço atualizado */
  sketch: ParametricSketch2D;
}

export interface AddConstraintResult {
  accepted: boolean;
  reason?: string;
  conflictingConstraintIds: string[];
  solveResult: ConstraintSolveResult;
}

export interface SmartConstraintSuggestion {
  type: SketchConstraintType;
  label: string;
  shortLabel: string;
  icon: string;
}

export interface SmartConstraintPillModel {
  primary: SmartConstraintSuggestion[];
  more: SmartConstraintSuggestion[];
}

export interface AutoConstrainResult {
  addedConstraints: SketchConstraint[];
  previewSketch: ParametricSketch2D;
  solveResult: ConstraintSolveResult;
}

const MAX_LM_ITERATIONS = 30;
const CONVERGENCE_TOL = 1e-9;
const RANK_TOL = 1e-7;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Estágio 1 — Union-Find para colapso de coincidências e identificação de nós rigidamente fixos.
 */
class UnionFind {
  private parent = new Map<string, string>();
  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }
  find(id: string): string {
    let cur = id;
    while (this.parent.get(cur) !== cur) {
      const next = this.parent.get(cur);
      if (!next) break;
      cur = next;
    }
    let walk = id;
    while (walk !== cur) {
      const next = this.parent.get(walk)!;
      this.parent.set(walk, cur);
      walk = next;
    }
    return cur;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

interface VariableLayout {
  pointVarX: Map<string, number>;
  pointVarY: Map<string, number>;
  circleVarR: Map<string, number>;
  numVars: number;
  x: Float64Array;
}

function buildVariableLayout(sketch: ParametricSketch2D): VariableLayout {
  const pointVarX = new Map<string, number>();
  const pointVarY = new Map<string, number>();
  const circleVarR = new Map<string, number>();
  const values: number[] = [];

  for (const pt of sketch.points) {
    pointVarX.set(pt.id, values.length);
    values.push(Number.isFinite(pt.x) ? pt.x : 0);
    pointVarY.set(pt.id, values.length);
    values.push(Number.isFinite(pt.y) ? pt.y : 0);
  }
  for (const c of sketch.circles) {
    circleVarR.set(c.id, values.length);
    values.push(Number.isFinite(c.radius) && c.radius > 1e-6 ? c.radius : 10);
  }

  return {
    pointVarX,
    pointVarY,
    circleVarR,
    numVars: values.length,
    x: Float64Array.from(values),
  };
}

interface EquationRow {
  constraintId: string;
  residual: number;
  /** Mapa esparsa índice de variável -> derivada parcial */
  grad: Array<[number, number]>;
}

function resolveLineEndpoints(
  sketch: ParametricSketch2D,
  lineId: string,
): [string, string] | null {
  const line = sketch.lines.find((l) => l.id === lineId);
  return line ? [line.p1, line.p2] : null;
}

function resolveCircle(sketch: ParametricSketch2D, circleId: string): SketchCircle2D | null {
  return sketch.circles.find((c) => c.id === circleId) ?? null;
}

function resolveArc(sketch: ParametricSketch2D, arcId: string): SketchArc2D | null {
  return (sketch.arcs ?? []).find((a) => a.id === arcId) ?? null;
}

/**
 * Estágio 1: Pré-propagação analítica de pontos fixos, coincidentes e H/V acoplados a pontos fixos.
 */
function runStage1AnalyticalPrepass(
  sketch: ParametricSketch2D,
  layout: VariableLayout,
): { lockedVars: Set<number> } {
  const lockedVars = new Set<number>();
  const uf = new UnionFind(sketch.points.map((p) => p.id));

  for (const c of sketch.constraints) {
    if (c.driven) continue;
    if (c.type === "coincident" && c.points && c.points.length >= 2) {
      uf.union(c.points[0]!, c.points[1]!);
    }
  }

  // Travar coordenadas explicitamente fixas
  const fixedXByRoot = new Map<string, number>();
  const fixedYByRoot = new Map<string, number>();

  for (const pt of sketch.points) {
    if (pt.fixed) {
      const r = uf.find(pt.id);
      fixedXByRoot.set(r, pt.x);
      fixedYByRoot.set(r, pt.y);
    }
  }
  for (const c of sketch.constraints) {
    if (c.driven) continue;
    if (c.type === "fixed" && c.points && c.points[0]) {
      const pt = sketch.points.find((p) => p.id === c.points![0]);
      if (pt) {
        const r = uf.find(pt.id);
        fixedXByRoot.set(r, c.fixedX ?? pt.x);
        fixedYByRoot.set(r, c.fixedY ?? pt.y);
      }
    }
  }

  // Aplicar valores fixos e propagar coincidências
  for (const pt of sketch.points) {
    const r = uf.find(pt.id);
    const ix = layout.pointVarX.get(pt.id)!;
    const iy = layout.pointVarY.get(pt.id)!;
    if (fixedXByRoot.has(r)) {
      layout.x[ix] = fixedXByRoot.get(r)!;
      lockedVars.add(ix);
    }
    if (fixedYByRoot.has(r)) {
      layout.x[iy] = fixedYByRoot.get(r)!;
      lockedVars.add(iy);
    }
  }

  // Propagar H/V simples conectados a coordenadas já travadas (até convergência local)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const c of sketch.constraints) {
      if (c.driven) continue;
      if (c.type === "horizontal") {
        const pts = getTwoPointPair(sketch, c);
        if (!pts) continue;
        const iy1 = layout.pointVarY.get(pts[0]);
        const iy2 = layout.pointVarY.get(pts[1]);
        if (iy1 !== undefined && iy2 !== undefined) {
          if (lockedVars.has(iy1) && !lockedVars.has(iy2)) {
            layout.x[iy2] = layout.x[iy1]!;
            lockedVars.add(iy2);
            changed = true;
          } else if (lockedVars.has(iy2) && !lockedVars.has(iy1)) {
            layout.x[iy1] = layout.x[iy2]!;
            lockedVars.add(iy1);
            changed = true;
          }
        }
      } else if (c.type === "vertical") {
        const pts = getTwoPointPair(sketch, c);
        if (!pts) continue;
        const ix1 = layout.pointVarX.get(pts[0]);
        const ix2 = layout.pointVarX.get(pts[1]);
        if (ix1 !== undefined && ix2 !== undefined) {
          if (lockedVars.has(ix1) && !lockedVars.has(ix2)) {
            layout.x[ix2] = layout.x[ix1]!;
            lockedVars.add(ix2);
            changed = true;
          } else if (lockedVars.has(ix2) && !lockedVars.has(ix1)) {
            layout.x[ix1] = layout.x[ix2]!;
            lockedVars.add(ix1);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }

  return { lockedVars };
}

function getTwoPointPair(
  sketch: ParametricSketch2D,
  c: SketchConstraint,
): [string, string] | null {
  if (c.points && c.points.length >= 2) {
    return [c.points[0]!, c.points[1]!];
  }
  if (c.lines && c.lines[0]) {
    return resolveLineEndpoints(sketch, c.lines[0]);
  }
  return null;
}

/**
 * Monta o sistema completo de resíduos e Jacobiano analítico.
 */
function evaluateSystem(
  sketch: ParametricSketch2D,
  layout: VariableLayout,
  x: Float64Array,
): EquationRow[] {
  const rows: EquationRow[] = [];

  const px = (id: string) => {
    const idx = layout.pointVarX.get(id);
    return idx !== undefined ? x[idx]! : 0;
  };
  const py = (id: string) => {
    const idx = layout.pointVarY.get(id);
    return idx !== undefined ? x[idx]! : 0;
  };
  const ix = (id: string) => layout.pointVarX.get(id);
  const iy = (id: string) => layout.pointVarY.get(id);

  // Pontos marcados com pt.fixed = true diretamente na entidade
  for (const pt of sketch.points) {
    if (!pt.fixed) continue;
    const hasExplicitFixed = sketch.constraints.some(
      (c) => !c.driven && c.type === "fixed" && c.points?.[0] === pt.id,
    );
    if (hasExplicitFixed) continue;
    const vx = ix(pt.id);
    const vy = iy(pt.id);
    if (vx !== undefined && vy !== undefined) {
      rows.push({
        constraintId: `__pt_fixed_${pt.id}`,
        residual: x[vx]! - pt.x,
        grad: [[vx, 1]],
      });
      rows.push({
        constraintId: `__pt_fixed_${pt.id}`,
        residual: x[vy]! - pt.y,
        grad: [[vy, 1]],
      });
    }
  }

  for (const c of sketch.constraints) {
    if (c.driven) continue;

    switch (c.type) {
      case "fixed": {
        const pid = c.points?.[0];
        if (!pid) break;
        const pt = sketch.points.find((p) => p.id === pid);
        const vx = ix(pid);
        const vy = iy(pid);
        if (!pt || vx === undefined || vy === undefined) break;
        const tx = c.fixedX ?? pt.x;
        const ty = c.fixedY ?? pt.y;
        rows.push({ constraintId: c.id, residual: x[vx]! - tx, grad: [[vx, 1]] });
        rows.push({ constraintId: c.id, residual: x[vy]! - ty, grad: [[vy, 1]] });
        break;
      }

      case "coincident": {
        const pair = getTwoPointPair(sketch, c);
        if (!pair) break;
        const [a, b] = pair;
        const ax = ix(a), ay = iy(a), bx = ix(b), by = iy(b);
        if (ax === undefined || ay === undefined || bx === undefined || by === undefined) break;
        rows.push({
          constraintId: c.id,
          residual: x[ax]! - x[bx]!,
          grad: [[ax, 1], [bx, -1]],
        });
        rows.push({
          constraintId: c.id,
          residual: x[ay]! - x[by]!,
          grad: [[ay, 1], [by, -1]],
        });
        break;
      }

      case "horizontal": {
        const pair = getTwoPointPair(sketch, c);
        if (!pair) break;
        const [a, b] = pair;
        const ay = iy(a), by = iy(b);
        if (ay === undefined || by === undefined) break;
        rows.push({
          constraintId: c.id,
          residual: x[ay]! - x[by]!,
          grad: [[ay, 1], [by, -1]],
        });
        break;
      }

      case "vertical": {
        const pair = getTwoPointPair(sketch, c);
        if (!pair) break;
        const [a, b] = pair;
        const ax = ix(a), bx = ix(b);
        if (ax === undefined || bx === undefined) break;
        rows.push({
          constraintId: c.id,
          residual: x[ax]! - x[bx]!,
          grad: [[ax, 1], [bx, -1]],
        });
        break;
      }

      case "distanceH": {
        const pair = getTwoPointPair(sketch, c);
        if (!pair || c.value === undefined) break;
        const [a, b] = pair;
        const ax = ix(a), bx = ix(b);
        if (ax === undefined || bx === undefined) break;
        const sign = x[bx]! - x[ax]! >= 0 ? 1 : -1;
        rows.push({
          constraintId: c.id,
          residual: sign * (x[bx]! - x[ax]!) - Math.abs(c.value),
          grad: [[bx, sign], [ax, -sign]],
        });
        break;
      }

      case "distanceV": {
        const pair = getTwoPointPair(sketch, c);
        if (!pair || c.value === undefined) break;
        const [a, b] = pair;
        const ay = iy(a), by = iy(b);
        if (ay === undefined || by === undefined) break;
        const sign = x[by]! - x[ay]! >= 0 ? 1 : -1;
        rows.push({
          constraintId: c.id,
          residual: sign * (x[by]! - x[ay]!) - Math.abs(c.value),
          grad: [[by, sign], [ay, -sign]],
        });
        break;
      }

      case "distance": {
        const pair = getTwoPointPair(sketch, c);
        if (!pair || c.value === undefined) break;
        const [a, b] = pair;
        const ax = ix(a), ay = iy(a), bx = ix(b), by = iy(b);
        if (ax === undefined || ay === undefined || bx === undefined || by === undefined) break;
        const dx = x[bx]! - x[ax]!;
        const dy = x[by]! - x[ay]!;
        const dist = Math.hypot(dx, dy);
        const target = Math.abs(c.value);
        if (dist > 1e-9) {
          const ux = dx / dist;
          const uy = dy / dist;
          rows.push({
            constraintId: c.id,
            residual: dist - target,
            grad: [[bx, ux], [by, uy], [ax, -ux], [ay, -uy]],
          });
        } else {
          // Evita gradiente nulo quando pontos coincidem inicialmente
          rows.push({
            constraintId: c.id,
            residual: -target,
            grad: [[bx, 1], [ax, -1]],
          });
        }
        break;
      }

      case "parallel": {
        if (!c.lines || c.lines.length < 2) break;
        const l1 = resolveLineEndpoints(sketch, c.lines[0]!);
        const l2 = resolveLineEndpoints(sketch, c.lines[1]!);
        if (!l1 || !l2) break;
        const [a, b] = l1;
        const [d, e] = l2;
        const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!;
        const dxIdx = ix(d)!, dyIdx = iy(d)!, ex = ix(e)!, ey = iy(e)!;
        const ux = x[bx]! - x[ax]!;
        const uy = x[by]! - x[ay]!;
        const vx = x[ex]! - x[dxIdx]!;
        const vy = x[ey]! - x[dyIdx]!;
        const scale = Math.max(Math.hypot(ux, uy) * Math.hypot(vx, vy), 1);
        // (ux * vy - uy * vx) / scale = 0
        rows.push({
          constraintId: c.id,
          residual: (ux * vy - uy * vx) / scale,
          grad: mergeGrad([
            [bx, vy / scale],
            [ax, -vy / scale],
            [by, -vx / scale],
            [ay, vx / scale],
            [ey, ux / scale],
            [dyIdx, -ux / scale],
            [ex, -uy / scale],
            [dxIdx, uy / scale],
          ]),
        });
        break;
      }

      case "perpendicular": {
        if (!c.lines || c.lines.length < 2) break;
        const l1 = resolveLineEndpoints(sketch, c.lines[0]!);
        const l2 = resolveLineEndpoints(sketch, c.lines[1]!);
        if (!l1 || !l2) break;
        const [a, b] = l1;
        const [d, e] = l2;
        const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!;
        const dxIdx = ix(d)!, dyIdx = iy(d)!, ex = ix(e)!, ey = iy(e)!;
        const ux = x[bx]! - x[ax]!;
        const uy = x[by]! - x[ay]!;
        const vx = x[ex]! - x[dxIdx]!;
        const vy = x[ey]! - x[dyIdx]!;
        const scale = Math.max(Math.hypot(ux, uy) * Math.hypot(vx, vy), 1);
        // (ux * vx + uy * vy) / scale = 0
        rows.push({
          constraintId: c.id,
          residual: (ux * vx + uy * vy) / scale,
          grad: mergeGrad([
            [bx, vx / scale],
            [ax, -vx / scale],
            [by, vy / scale],
            [ay, -vy / scale],
            [ex, ux / scale],
            [dxIdx, -ux / scale],
            [ey, uy / scale],
            [dyIdx, -uy / scale],
          ]),
        });
        break;
      }

      case "collinear": {
        if (!c.lines || c.lines.length < 2) break;
        const l1 = resolveLineEndpoints(sketch, c.lines[0]!);
        const l2 = resolveLineEndpoints(sketch, c.lines[1]!);
        if (!l1 || !l2) break;
        const [a, b] = l1;
        const [d, e] = l2;
        // Ambos os pontos d e e pertencem à reta (a, b)
        for (const p of [d, e]) {
          rows.push(pointOnLineEquation(c.id, a, b, p, layout, x));
        }
        break;
      }

      case "pointOnCurve": {
        const pid = c.points?.[0];
        if (!pid) break;
        if (c.lines?.[0]) {
          const l = resolveLineEndpoints(sketch, c.lines[0]);
          if (l) rows.push(pointOnLineEquation(c.id, l[0], l[1], pid, layout, x));
        } else if (c.circles?.[0]) {
          const circ = resolveCircle(sketch, c.circles[0]);
          const rIdx = layout.circleVarR.get(c.circles[0]);
          if (circ && rIdx !== undefined) {
            const cx = ix(circ.center)!, cy = iy(circ.center)!;
            const pxIdx = ix(pid)!, pyIdx = iy(pid)!;
            const dx = x[pxIdx]! - x[cx]!;
            const dy = x[pyIdx]! - x[cy]!;
            const dist = Math.max(Math.hypot(dx, dy), 1e-9);
            rows.push({
              constraintId: c.id,
              residual: dist - x[rIdx]!,
              grad: mergeGrad([
                [pxIdx, dx / dist],
                [pyIdx, dy / dist],
                [cx, -dx / dist],
                [cy, -dy / dist],
                [rIdx, -1],
              ]),
            });
          }
        }
        break;
      }

      case "midpoint": {
        const pid = c.points?.[0];
        const l = c.lines?.[0] ? resolveLineEndpoints(sketch, c.lines[0]) : null;
        if (!pid || !l) break;
        const [a, b] = l;
        const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!, mx = ix(pid)!, my = iy(pid)!;
        rows.push({
          constraintId: c.id,
          residual: x[mx]! - 0.5 * (x[ax]! + x[bx]!),
          grad: mergeGrad([[mx, 1], [ax, -0.5], [bx, -0.5]]),
        });
        rows.push({
          constraintId: c.id,
          residual: x[my]! - 0.5 * (x[ay]! + x[by]!),
          grad: mergeGrad([[my, 1], [ay, -0.5], [by, -0.5]]),
        });
        break;
      }

      case "symmetric": {
        if (!c.points || c.points.length < 2 || !c.lines?.[0]) break;
        const [p1, p2] = [c.points[0]!, c.points[1]!];
        const axis = resolveLineEndpoints(sketch, c.lines[0]);
        if (!axis) break;
        const [a, b] = axis;
        const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!;
        const p1x = ix(p1)!, p1y = iy(p1)!, p2x = ix(p2)!, p2y = iy(p2)!;
        // 1) Ponto médio de (p1, p2) pertence ao eixo (a, b)
        const mx = 0.5 * (x[p1x]! + x[p2x]!);
        const my = 0.5 * (x[p1y]! + x[p2y]!);
        const ux = x[bx]! - x[ax]!;
        const uy = x[by]! - x[ay]!;
        const len = Math.max(Math.hypot(ux, uy), 1);
        rows.push({
          constraintId: c.id,
          residual: ((mx - x[ax]!) * uy - (my - x[ay]!) * ux) / len,
          grad: mergeGrad([
            [p1x, (0.5 * uy) / len],
            [p2x, (0.5 * uy) / len],
            [p1y, (-0.5 * ux) / len],
            [p2y, (-0.5 * ux) / len],
            [ax, (-uy + (my - x[ay]!)) / len],
            [ay, (ux - (mx - x[ax]!)) / len],
            [bx, -(my - x[ay]!) / len],
            [by, (mx - x[ax]!) / len],
          ]),
        });
        // 2) Segmento (p1, p2) é perpendicular ao eixo (a, b)
        const vx = x[p2x]! - x[p1x]!;
        const vy = x[p2y]! - x[p1y]!;
        const scale = Math.max(len * Math.hypot(vx, vy), 1);
        rows.push({
          constraintId: c.id,
          residual: (ux * vx + uy * vy) / scale,
          grad: mergeGrad([
            [p2x, ux / scale],
            [p1x, -ux / scale],
            [p2y, uy / scale],
            [p1y, -uy / scale],
            [bx, vx / scale],
            [ax, -vx / scale],
            [by, vy / scale],
            [ay, -vy / scale],
          ]),
        });
        break;
      }

      case "concentric": {
        if (!c.circles || c.circles.length < 2) break;
        const c1 = resolveCircle(sketch, c.circles[0]!);
        const c2 = resolveCircle(sketch, c.circles[1]!);
        if (!c1 || !c2) break;
        const x1 = ix(c1.center)!, y1 = iy(c1.center)!, x2 = ix(c2.center)!, y2 = iy(c2.center)!;
        rows.push({ constraintId: c.id, residual: x[x1]! - x[x2]!, grad: [[x1, 1], [x2, -1]] });
        rows.push({ constraintId: c.id, residual: x[y1]! - x[y2]!, grad: [[y1, 1], [y2, -1]] });
        break;
      }

      case "equal": {
        if (c.lines && c.lines.length >= 2) {
          const l1 = resolveLineEndpoints(sketch, c.lines[0]!);
          const l2 = resolveLineEndpoints(sketch, c.lines[1]!);
          if (!l1 || !l2) break;
          const [a, b] = l1;
          const [d, e] = l2;
          const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!;
          const dxI = ix(d)!, dyI = iy(d)!, ex = ix(e)!, ey = iy(e)!;
          const ux = x[bx]! - x[ax]!, uy = x[by]! - x[ay]!;
          const vx = x[ex]! - x[dxI]!, vy = x[ey]! - x[dyI]!;
          const len1 = Math.max(Math.hypot(ux, uy), 1e-9);
          const len2 = Math.max(Math.hypot(vx, vy), 1e-9);
          rows.push({
            constraintId: c.id,
            residual: len1 - len2,
            grad: mergeGrad([
              [bx, ux / len1],
              [ax, -ux / len1],
              [by, uy / len1],
              [ay, -uy / len1],
              [ex, -vx / len2],
              [dxI, vx / len2],
              [ey, -vy / len2],
              [dyI, vy / len2],
            ]),
          });
        } else if (c.circles && c.circles.length >= 2) {
          const r1 = layout.circleVarR.get(c.circles[0]!);
          const r2 = layout.circleVarR.get(c.circles[1]!);
          if (r1 !== undefined && r2 !== undefined) {
            rows.push({
              constraintId: c.id,
              residual: x[r1]! - x[r2]!,
              grad: [[r1, 1], [r2, -1]],
            });
          }
        }
        break;
      }

      case "radius": {
        const cid = c.circles?.[0];
        if (!cid || c.value === undefined) break;
        const rIdx = layout.circleVarR.get(cid);
        if (rIdx === undefined) break;
        rows.push({
          constraintId: c.id,
          residual: x[rIdx]! - Math.abs(c.value),
          grad: [[rIdx, 1]],
        });
        break;
      }

      case "diameter": {
        const cid = c.circles?.[0];
        if (!cid || c.value === undefined) break;
        const rIdx = layout.circleVarR.get(cid);
        if (rIdx === undefined) break;
        rows.push({
          constraintId: c.id,
          residual: 2 * x[rIdx]! - Math.abs(c.value),
          grad: [[rIdx, 2]],
        });
        break;
      }

      case "tangent": {
        if (c.lines?.[0] && c.circles?.[0]) {
          const l = resolveLineEndpoints(sketch, c.lines[0]);
          const circ = resolveCircle(sketch, c.circles[0]);
          const rIdx = layout.circleVarR.get(c.circles[0]);
          if (!l || !circ || rIdx === undefined) break;
          const [a, b] = l;
          const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!;
          const cx = ix(circ.center)!, cy = iy(circ.center)!;
          const ux = x[bx]! - x[ax]!, uy = x[by]! - x[ay]!;
          const len = Math.max(Math.hypot(ux, uy), 1e-9);
          const cross = (x[cx]! - x[ax]!) * uy - (x[cy]! - x[ay]!) * ux;
          const signedDist = cross / len;
          const sign = signedDist >= 0 ? 1 : -1;
          // dist = |cross| / len = r => sign * cross / len - r = 0
          const nx = (sign * uy) / len;
          const ny = (-sign * ux) / len;
          const dUx = -sign * ((x[cy]! - x[ay]!) / len + (cross * ux) / (len * len * len));
          const dUy = sign * ((x[cx]! - x[ax]!) / len - (cross * uy) / (len * len * len));
          rows.push({
            constraintId: c.id,
            residual: Math.abs(signedDist) - x[rIdx]!,
            grad: mergeGrad([
              [cx, nx],
              [cy, ny],
              [bx, dUx],
              [ax, -nx - dUx],
              [by, dUy],
              [ay, -ny - dUy],
              [rIdx, -1],
            ]),
          });
        } else if (c.circles && c.circles.length >= 2) {
          const c1 = resolveCircle(sketch, c.circles[0]!);
          const c2 = resolveCircle(sketch, c.circles[1]!);
          const r1 = layout.circleVarR.get(c.circles[0]!);
          const r2 = layout.circleVarR.get(c.circles[1]!);
          if (!c1 || !c2 || r1 === undefined || r2 === undefined) break;
          const x1 = ix(c1.center)!, y1 = iy(c1.center)!, x2 = ix(c2.center)!, y2 = iy(c2.center)!;
          const dx = x[x2]! - x[x1]!, dy = x[y2]! - x[y1]!;
          const dist = Math.max(Math.hypot(dx, dy), 1e-9);
          rows.push({
            constraintId: c.id,
            residual: dist - (x[r1]! + x[r2]!),
            grad: mergeGrad([
              [x2, dx / dist],
              [y2, dy / dist],
              [x1, -dx / dist],
              [y1, -dy / dist],
              [r1, -1],
              [r2, -1],
            ]),
          });
        }
        break;
      }

      case "angle": {
        if (!c.lines || c.lines.length < 2 || c.value === undefined) break;
        const l1 = resolveLineEndpoints(sketch, c.lines[0]!);
        const l2 = resolveLineEndpoints(sketch, c.lines[1]!);
        if (!l1 || !l2) break;
        const [a, b] = l1;
        const [d, e] = l2;
        const ax = ix(a)!, ay = iy(a)!, bx = ix(b)!, by = iy(b)!;
        const dxI = ix(d)!, dyI = iy(d)!, ex = ix(e)!, ey = iy(e)!;
        const ux = x[bx]! - x[ax]!, uy = x[by]! - x[ay]!;
        const vx = x[ex]! - x[dxI]!, vy = x[ey]! - x[dyI]!;
        const l1sq = Math.max(ux * ux + uy * uy, 1e-9);
        const l2sq = Math.max(vx * vx + vy * vy, 1e-9);
        const a1 = Math.atan2(uy, ux);
        const a2 = Math.atan2(vy, vx);
        let diff = a2 - a1 - c.value * DEG2RAD;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        rows.push({
          constraintId: c.id,
          residual: diff,
          grad: mergeGrad([
            [ex, -vy / l2sq],
            [dxI, vy / l2sq],
            [ey, vx / l2sq],
            [dyI, -vx / l2sq],
            [bx, uy / l1sq],
            [ax, -uy / l1sq],
            [by, -ux / l1sq],
            [ay, ux / l1sq],
          ]),
        });
        break;
      }

      case "arcLength": {
        const aid = c.circles?.[0];
        if (!aid || c.value === undefined) break;
        const arc = resolveArc(sketch, aid);
        if (!arc) break;
        const cx = px(arc.center), cy = py(arc.center);
        const sx = px(arc.start), sy = py(arc.start);
        const exVal = px(arc.end), eyVal = py(arc.end);
        const r = Math.max(Math.hypot(sx - cx, sy - cy), 1e-9);
        let sweep = Math.atan2(eyVal - cy, exVal - cx) - Math.atan2(sy - cy, sx - cx);
        if (sweep <= 0) sweep += 2 * Math.PI;
        const target = Math.abs(c.value);
        // Derivada central para comprimento de arco
        const vars = [ix(arc.center)!, iy(arc.center)!, ix(arc.start)!, iy(arc.start)!, ix(arc.end)!, iy(arc.end)!];
        const eps = 1e-6;
        const grad: Array<[number, number]> = [];
        const evalArc = (arr: Float64Array) => {
          const acx = arr[vars[0]!]!, acy = arr[vars[1]!]!;
          const asx = arr[vars[2]!]!, asy = arr[vars[3]!]!;
          const aex = arr[vars[4]!]!, aey = arr[vars[5]!]!;
          const ar = Math.hypot(asx - acx, asy - acy);
          let sw = Math.atan2(aey - acy, aex - acx) - Math.atan2(asy - acy, asx - acx);
          if (sw <= 0) sw += 2 * Math.PI;
          return ar * sw - target;
        };
        const tmp = Float64Array.from(x);
        for (const v of vars) {
          const orig = tmp[v]!;
          tmp[v] = orig + eps;
          const fp = evalArc(tmp);
          tmp[v] = orig - eps;
          const fm = evalArc(tmp);
          tmp[v] = orig;
          grad.push([v, (fp - fm) / (2 * eps)]);
        }
        rows.push({
          constraintId: c.id,
          residual: r * sweep - target,
          grad: mergeGrad(grad),
        });
        break;
      }
    }
  }

  return rows;
}

function pointOnLineEquation(
  constraintId: string,
  a: string,
  b: string,
  p: string,
  layout: VariableLayout,
  x: Float64Array,
): EquationRow {
  const ax = layout.pointVarX.get(a)!;
  const ay = layout.pointVarY.get(a)!;
  const bx = layout.pointVarX.get(b)!;
  const by = layout.pointVarY.get(b)!;
  const px = layout.pointVarX.get(p)!;
  const py = layout.pointVarY.get(p)!;

  const ux = x[bx]! - x[ax]!;
  const uy = x[by]! - x[ay]!;
  const len = Math.max(Math.hypot(ux, uy), 1);
  const res = ((x[px]! - x[ax]!) * uy - (x[py]! - x[ay]!) * ux) / len;

  return {
    constraintId,
    residual: res,
    grad: mergeGrad([
      [px, uy / len],
      [py, -ux / len],
      [bx, -(x[py]! - x[ay]!) / len],
      [by, (x[px]! - x[ax]!) / len],
      [ax, (-uy + (x[py]! - x[ay]!)) / len],
      [ay, (ux - (x[px]! - x[ax]!)) / len],
    ]),
  };
}

function mergeGrad(pairs: Array<[number, number]>): Array<[number, number]> {
  const acc = new Map<number, number>();
  for (const [idx, val] of pairs) {
    if (!Number.isFinite(val)) continue;
    acc.set(idx, (acc.get(idx) ?? 0) + val);
  }
  const out: Array<[number, number]> = [];
  for (const [idx, val] of acc.entries()) {
    if (Math.abs(val) > 1e-15) out.push([idx, val]);
  }
  return out;
}

/**
 * Resolve sistema linear simétrico positivo definido (A * dx = b) via eliminação de Gauss com pivoteamento parcial.
 */
function solveLinearSystem(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const M = Float64Array.from(A);
  const rhs = Float64Array.from(b);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotAbs = Math.abs(M[col * n + col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r * n + col]!);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivotRow = r;
      }
    }
    if (pivotAbs < 1e-14) return null;

    if (pivotRow !== col) {
      for (let c = col; c < n; c++) {
        const tmp = M[col * n + c]!;
        M[col * n + c] = M[pivotRow * n + c]!;
        M[pivotRow * n + c] = tmp;
      }
      const tmpB = rhs[col]!;
      rhs[col] = rhs[pivotRow]!;
      rhs[pivotRow] = tmpB;
    }

    const pivot = M[col * n + col]!;
    for (let r = col + 1; r < n; r++) {
      const factor = M[r * n + col]! / pivot;
      if (Math.abs(factor) < 1e-15) continue;
      for (let c = col; c < n; c++) {
        M[r * n + c] = M[r * n + c]! - factor * M[col * n + c]!;
      }
      rhs[r] = rhs[r]! - factor * rhs[col]!;
    }
  }

  const sol = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = rhs[i]!;
    for (let c = i + 1; c < n; c++) {
      sum -= M[i * n + c]! * sol[c]!;
    }
    sol[i] = sum / M[i * n + i]!;
  }
  return sol;
}

/**
 * Calcula posto numérico exato da matriz Jacobiana J (m x n) via QR de Householder com pivoteamento de colunas.
 * Também retorna quais índices de linhas (equações) são linearmente dependentes das anteriores.
 */
function computeJacobianRankAndDependencies(
  rows: EquationRow[],
  numVars: number,
): { rank: number; dependentRowIndices: number[] } {
  const m = rows.length;
  if (m === 0 || numVars === 0) return { rank: 0, dependentRowIndices: [] };

  // Transposta R = J^T (numVars x m) para detectar dependência linha-a-linha em ordem cronológica
  // usando Gram-Schmidt modificado (dupla ortogonalização para estabilidade numérica).
  const basis: Float64Array[] = [];
  const dependentRowIndices: number[] = [];

  for (let r = 0; r < m; r++) {
    const v = new Float64Array(numVars);
    for (const [col, val] of rows[r]!.grad) {
      v[col] = val;
    }
    let origNorm = 0;
    for (let i = 0; i < numVars; i++) origNorm += v[i]! * v[i]!;
    origNorm = Math.sqrt(origNorm);
    if (origNorm < RANK_TOL) {
      dependentRowIndices.push(r);
      continue;
    }

    // Dupla ortogonalização de Gram-Schmidt (estabilidade equivalente a Householder QR)
    for (let pass = 0; pass < 2; pass++) {
      for (const q of basis) {
        let dot = 0;
        for (let i = 0; i < numVars; i++) dot += v[i]! * q[i]!;
        for (let i = 0; i < numVars; i++) v[i] = v[i]! - dot * q[i]!;
      }
    }

    let remNorm = 0;
    for (let i = 0; i < numVars; i++) remNorm += v[i]! * v[i]!;
    remNorm = Math.sqrt(remNorm);

    if (remNorm > RANK_TOL * Math.max(1, origNorm)) {
      for (let i = 0; i < numVars; i++) v[i] = v[i]! / remNorm;
      basis.push(v);
    } else {
      dependentRowIndices.push(r);
    }
  }

  return { rank: basis.length, dependentRowIndices };
}

function evaluateDrivenDimensions(
  sketch: ParametricSketch2D,
  layout: VariableLayout,
  x: Float64Array,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of sketch.constraints) {
    if (!c.driven) continue;
    const pair = getTwoPointPair(sketch, c);
    if (pair && (c.type === "distance" || c.type === "distanceH" || c.type === "distanceV")) {
      const ax = x[layout.pointVarX.get(pair[0])!]!;
      const ay = x[layout.pointVarY.get(pair[0])!]!;
      const bx = x[layout.pointVarX.get(pair[1])!]!;
      const by = x[layout.pointVarY.get(pair[1])!]!;
      if (c.type === "distance") out[c.id] = Number(Math.hypot(bx - ax, by - ay).toFixed(4));
      else if (c.type === "distanceH") out[c.id] = Number(Math.abs(bx - ax).toFixed(4));
      else out[c.id] = Number(Math.abs(by - ay).toFixed(4));
    } else if ((c.type === "radius" || c.type === "diameter") && c.circles?.[0]) {
      const rIdx = layout.circleVarR.get(c.circles[0]);
      if (rIdx !== undefined) {
        const r = x[rIdx]!;
        out[c.id] = Number((c.type === "diameter" ? r * 2 : r).toFixed(4));
      }
    } else if (c.type === "angle" && c.lines && c.lines.length >= 2) {
      const l1 = resolveLineEndpoints(sketch, c.lines[0]!);
      const l2 = resolveLineEndpoints(sketch, c.lines[1]!);
      if (l1 && l2) {
        const a1 = Math.atan2(
          x[layout.pointVarY.get(l1[1])!]! - x[layout.pointVarY.get(l1[0])!]!,
          x[layout.pointVarX.get(l1[1])!]! - x[layout.pointVarX.get(l1[0])!]!,
        );
        const a2 = Math.atan2(
          x[layout.pointVarY.get(l2[1])!]! - x[layout.pointVarY.get(l2[0])!]!,
          x[layout.pointVarX.get(l2[1])!]! - x[layout.pointVarX.get(l2[0])!]!,
        );
        let deg = (a2 - a1) * RAD2DEG;
        while (deg < 0) deg += 360;
        if (deg > 180) deg = 360 - deg;
        out[c.id] = Number(deg.toFixed(4));
      }
    }
  }
  return out;
}

/**
 * Resolve um esboço paramétrico 2D usando Solver em 2 Estágios (Rígido + Levenberg-Marquardt)
 * e calcula o DOF exato via posto numérico do Jacobiano.
 */
export function solveSketch2D(inputSketch: ParametricSketch2D): ConstraintSolveResult {
  const sketch: ParametricSketch2D = {
    points: inputSketch.points.map((p) => ({ ...p })),
    lines: inputSketch.lines.map((l) => ({ ...l })),
    circles: inputSketch.circles.map((c) => ({ ...c })),
    arcs: inputSketch.arcs ? inputSketch.arcs.map((a) => ({ ...a })) : [],
    constraints: inputSketch.constraints.map((c) => ({ ...c })),
  };

  const layout = buildVariableLayout(sketch);
  const { numVars } = layout;

  // Estágio 1: Decomposição rígida analítica
  runStage1AnalyticalPrepass(sketch, layout);

  const x = Float64Array.from(layout.x);
  let rows = evaluateSystem(sketch, layout, x);
  let residualNorm = computeResidualNorm(rows);

  // Estágio 2: Levenberg-Marquardt amortecido (máx 30 iterações)
  let lambda = 1e-4;
  let iterations = 0;

  if (numVars > 0 && rows.length > 0) {
    for (let iter = 0; iter < MAX_LM_ITERATIONS; iter++) {
      if (residualNorm < CONVERGENCE_TOL) break;
      iterations = iter + 1;

      const JTJ = new Float64Array(numVars * numVars);
      const JTr = new Float64Array(numVars);

      for (const row of rows) {
        const g = row.grad;
        const rVal = row.residual;
        for (let i = 0; i < g.length; i++) {
          const [ci, vi] = g[i]!;
          JTr[ci] = JTr[ci]! - vi * rVal;
          for (let j = i; j < g.length; j++) {
            const [cj, vj] = g[j]!;
            const prod = vi * vj;
            JTJ[ci * numVars + cj] = JTJ[ci * numVars + cj]! + prod;
            if (ci !== cj) {
              JTJ[cj * numVars + ci] = JTJ[cj * numVars + ci]! + prod;
            }
          }
        }
      }

      let acceptedStep = false;
      for (let tries = 0; tries < 8; tries++) {
        const A = Float64Array.from(JTJ);
        for (let i = 0; i < numVars; i++) {
          const diag = A[i * numVars + i]!;
          A[i * numVars + i] = diag + lambda * Math.max(1, diag);
        }

        const dx = solveLinearSystem(A, JTr, numVars);
        if (!dx) {
          lambda *= 10;
          continue;
        }

        const xTrial = Float64Array.from(x);
        let maxStep = 0;
        for (let i = 0; i < numVars; i++) {
          const step = Number.isFinite(dx[i]!) ? Math.max(-1e4, Math.min(1e4, dx[i]!)) : 0;
          xTrial[i] = x[i]! + step;
          if (Math.abs(step) > maxStep) maxStep = Math.abs(step);
        }

        // Mantém raios positivos
        for (const rIdx of layout.circleVarR.values()) {
          if (xTrial[rIdx]! < 1e-4) xTrial[rIdx] = 1e-4;
        }

        const trialRows = evaluateSystem(sketch, layout, xTrial);
        const trialNorm = computeResidualNorm(trialRows);

        if (trialNorm < residualNorm || trialNorm < CONVERGENCE_TOL) {
          x.set(xTrial);
          rows = trialRows;
          residualNorm = trialNorm;
          lambda = Math.max(1e-10, lambda * 0.3);
          acceptedStep = true;
          if (maxStep < 1e-11 && residualNorm < 1e-7) break;
          break;
        } else {
          lambda = Math.min(1e8, lambda * 5);
        }
      }

      if (!acceptedStep) break;
    }
  }

  // Atualiza coordenadas no esboço retornado
  for (const pt of sketch.points) {
    pt.x = cleanFloat(x[layout.pointVarX.get(pt.id)!]!);
    pt.y = cleanFloat(x[layout.pointVarY.get(pt.id)!]!);
  }
  for (const c of sketch.circles) {
    c.radius = Math.max(1e-4, cleanFloat(x[layout.circleVarR.get(c.id)!]!));
  }

  const finalRows = evaluateSystem(sketch, layout, x);
  const { rank, dependentRowIndices } = computeJacobianRankAndDependencies(finalRows, numVars);
  const dof = Math.max(0, numVars - rank);
  const converged = residualNorm <= 1e-5;

  const conflictingSet = new Set<string>();
  for (const idx of dependentRowIndices) {
    const cid = finalRows[idx]?.constraintId;
    if (cid && !cid.startsWith("__pt_fixed_")) conflictingSet.add(cid);
  }
  if (!converged) {
    for (const row of finalRows) {
      if (Math.abs(row.residual) > 1e-4 && !row.constraintId.startsWith("__pt_fixed_")) {
        conflictingSet.add(row.constraintId);
      }
    }
  }

  const hasConflict = !converged || conflictingSet.size > 0;
  let status: DofVisualState = "underconstrained";
  let statusLabel = `Livre (${dof} GDL)`;
  let statusColorDark = "#38BDF8";
  let statusColorLight = "#0284C7";
  let conflictMessage: string | undefined;

  if (hasConflict) {
    status = "conflict";
    statusColorDark = "#F43F5E";
    statusColorLight = "#E11D48";
    const firstId = Array.from(conflictingSet)[0];
    const ref = sketch.constraints.find((c) => c.id === firstId);
    const refName = ref ? formatConstraintDisplay(ref) : firstId ?? "restrição existente";
    conflictMessage = !converged
      ? `Conflita com ${refName} (sistema inconsistente)`
      : `Redundante / Sobre-restrito com ${refName}`;
    statusLabel = `Conflito: ${conflictMessage}`;
  } else if (dof === 0 && numVars > 0) {
    status = "fullyDefined";
    statusLabel = "✓ Totalmente Definido";
    statusColorDark = "#F8FAFC";
    statusColorLight = "#0F172A";
  }

  const drivenValues = evaluateDrivenDimensions(sketch, layout, x);

  return {
    ok: !hasConflict,
    converged,
    iterations,
    residualNorm,
    numVariables: numVars,
    rank,
    dof,
    status,
    statusLabel,
    statusColorDark,
    statusColorLight,
    conflictingConstraintIds: Array.from(conflictingSet),
    conflictMessage,
    drivenValues,
    sketch,
  };
}

/**
 * Tenta adicionar uma restrição ao esboço com política de recusa de redundância/conflito.
 * Se a restrição causar conflito ou sobre-restrição (posto não aumenta ou não converge),
 * recusa a adição, preserva o esboço anterior e retorna mensagem clara indicando o conflito.
 */
export function tryAddSketchConstraint(
  sketch: ParametricSketch2D,
  candidate: SketchConstraint,
): AddConstraintResult {
  const before = solveSketch2D(sketch);

  if (candidate.driven) {
    const nextSketch: ParametricSketch2D = {
      ...sketch,
      constraints: [...sketch.constraints, candidate],
    };
    return {
      accepted: true,
      conflictingConstraintIds: [],
      solveResult: solveSketch2D(nextSketch),
    };
  }

  const trialSketch: ParametricSketch2D = {
    ...sketch,
    constraints: [...sketch.constraints, candidate],
  };
  const after = solveSketch2D(trialSketch);

  const isRedundant = after.rank <= before.rank && candidate.type !== "fixed";
  const isOverconstrained = after.status === "conflict" || !after.converged || isRedundant;

  if (isOverconstrained) {
    // Descobre qual restrição anterior está diretamente envolvida no conflito
    const involved = findConflictingExistingConstraint(sketch, candidate);
    const reason = !after.converged
      ? `Restrição recusada: conflita com ${involved}`
      : `Restrição recusada (sobre-restrição / redundante com ${involved})`;
    return {
      accepted: false,
      reason,
      conflictingConstraintIds: [candidate.id, ...after.conflictingConstraintIds],
      solveResult: {
        ...before,
        conflictMessage: reason,
      },
    };
  }

  return {
    accepted: true,
    conflictingConstraintIds: [],
    solveResult: after,
  };
}

function findConflictingExistingConstraint(
  sketch: ParametricSketch2D,
  candidate: SketchConstraint,
): string {
  const candPts = new Set(candidate.points ?? []);
  const candLines = new Set(candidate.lines ?? []);
  const candCircles = new Set(candidate.circles ?? []);

  for (let i = sketch.constraints.length - 1; i >= 0; i--) {
    const c = sketch.constraints[i]!;
    if (c.driven) continue;
    const sharesPt = (c.points ?? []).some((p) => candPts.has(p));
    const sharesLine = (c.lines ?? []).some((l) => candLines.has(l));
    const sharesCirc = (c.circles ?? []).some((ci) => candCircles.has(ci));
    if (sharesPt || sharesLine || sharesCirc) {
      return formatConstraintDisplay(c);
    }
  }
  const last = sketch.constraints[sketch.constraints.length - 1];
  return last ? formatConstraintDisplay(last) : "restrição anterior";
}

function formatConstraintDisplay(c: SketchConstraint): string {
  const names: Record<SketchConstraintType, string> = {
    coincident: "Coincidente",
    pointOnCurve: "Ponto na Curva",
    horizontal: "Horizontal",
    vertical: "Vertical",
    parallel: "Paralela",
    perpendicular: "Perpendicular",
    tangent: "Tangente",
    concentric: "Concêntrica",
    collinear: "Colinear",
    equal: "Igual (=)",
    midpoint: "Ponto Médio",
    symmetric: "Simetria",
    fixed: "Fixo",
    distance: "Cota Distância",
    distanceH: "Cota Horizontal",
    distanceV: "Cota Vertical",
    radius: "Cota Raio",
    diameter: "Cota Diâmetro",
    angle: "Cota Ângulo",
    arcLength: "Comprimento de Arco",
  };
  return `${c.label ?? names[c.type]} #${c.id}`;
}

function computeResidualNorm(rows: EquationRow[]): number {
  let sumSq = 0;
  for (const r of rows) sumSq += r.residual * r.residual;
  return Math.sqrt(sumSq);
}

function cleanFloat(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (Math.abs(v) < 1e-12) return 0;
  return Number(v.toPrecision(12));
}

/**
 * Pílula Inteligente de Restrições Mobile:
 * Dada a seleção atual (pontos, linhas, círculos), retorna apenas as restrições matematicamente válidas
 * (máximo 5 chips principais + `more`).
 */
export function getValidConstraintsForSelection(selection: {
  pointIds: string[];
  lineIds: string[];
  circleIds: string[];
}): SmartConstraintPillModel {
  const p = selection.pointIds.length;
  const l = selection.lineIds.length;
  const c = selection.circleIds.length;
  const all: SmartConstraintSuggestion[] = [];

  if (p === 1 && l === 0 && c === 0) {
    all.push({ type: "fixed", label: "Fixar Ponto", shortLabel: "Fixo", icon: "🔒" });
  } else if (p === 2 && l === 0 && c === 0) {
    all.push(
      { type: "coincident", label: "Coincidente", shortLabel: "Coinc.", icon: "◎" },
      { type: "horizontal", label: "Horizontal", shortLabel: "Horiz.", icon: "─" },
      { type: "vertical", label: "Vertical", shortLabel: "Vert.", icon: "│" },
      { type: "distance", label: "Distância", shortLabel: "Dist.", icon: "↔" },
      { type: "distanceH", label: "Distância H", shortLabel: "Dist. H", icon: "⬌" },
      { type: "distanceV", label: "Distância V", shortLabel: "Dist. V", icon: "⬍" },
    );
  } else if (p === 0 && l === 1 && c === 0) {
    all.push(
      { type: "horizontal", label: "Horizontal", shortLabel: "Horiz.", icon: "─" },
      { type: "vertical", label: "Vertical", shortLabel: "Vert.", icon: "│" },
      { type: "distance", label: "Comprimento", shortLabel: "Comp.", icon: "↔" },
      { type: "fixed", label: "Fixar", shortLabel: "Fixo", icon: "🔒" },
    );
  } else if (p === 0 && l === 2 && c === 0) {
    all.push(
      { type: "parallel", label: "Paralela", shortLabel: "Paral.", icon: "∥" },
      { type: "perpendicular", label: "Perpendicular", shortLabel: "Perp.", icon: "⊥" },
      { type: "equal", label: "Igual (=)", shortLabel: "Igual", icon: "=" },
      { type: "collinear", label: "Colinear", shortLabel: "Colin.", icon: "┈" },
      { type: "angle", label: "Ângulo", shortLabel: "Ângulo", icon: "∠" },
    );
  } else if (p === 1 && l === 1 && c === 0) {
    all.push(
      { type: "pointOnCurve", label: "Ponto na Linha", shortLabel: "Na Linha", icon: "⟀" },
      { type: "midpoint", label: "Ponto Médio", shortLabel: "Médio", icon: "△" },
    );
  } else if (p === 2 && l === 1 && c === 0) {
    all.push({ type: "symmetric", label: "Simetria", shortLabel: "Simetria", icon: "⧓" });
  } else if (p === 0 && l === 0 && c === 1) {
    all.push(
      { type: "diameter", label: "Diâmetro (Ø)", shortLabel: "Ø Diâm.", icon: "Ø" },
      { type: "radius", label: "Raio (R)", shortLabel: "R Raio", icon: "R" },
    );
  } else if (p === 0 && l === 0 && c === 2) {
    all.push(
      { type: "concentric", label: "Concêntrica", shortLabel: "Conc.", icon: "◎" },
      { type: "equal", label: "Raio Igual", shortLabel: "Igual", icon: "=" },
      { type: "tangent", label: "Tangente", shortLabel: "Tang.", icon: "◒" },
    );
  } else if (p === 0 && l === 1 && c === 1) {
    all.push({ type: "tangent", label: "Tangente", shortLabel: "Tang.", icon: "◒" });
  } else if (p === 1 && l === 0 && c === 1) {
    all.push({ type: "pointOnCurve", label: "Ponto no Círculo", shortLabel: "Na Curva", icon: "⟀" });
  }

  return {
    primary: all.slice(0, 5),
    more: all.slice(5),
  };
}

/**
 * Comando [ ✨ Autorrestringir ]:
 * Infere suavemente restrições H/V dentro de ±3°, comprimentos iguais (±0.5mm) e fixa âncora se livre,
 * validando cada restrição com `tryAddSketchConstraint` para nunca causar sobre-restrição.
 */
export function autoConstrainSketch(
  inputSketch: ParametricSketch2D,
  angleTolDeg = 3,
): AutoConstrainResult {
  let working: ParametricSketch2D = {
    points: inputSketch.points.map((p) => ({ ...p })),
    lines: inputSketch.lines.map((l) => ({ ...l })),
    circles: inputSketch.circles.map((c) => ({ ...c })),
    arcs: inputSketch.arcs ? inputSketch.arcs.map((a) => ({ ...a })) : [],
    constraints: inputSketch.constraints.map((c) => ({ ...c })),
  };
  const added: SketchConstraint[] = [];
  let seq = 1;
  const ptMap = new Map(working.points.map((p) => [p.id, p]));

  // 1) H/V dentro de ±3°
  for (const line of working.lines) {
    const a = ptMap.get(line.p1);
    const b = ptMap.get(line.p2);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const angleDeg = Math.abs((Math.atan2(dy, dx) * RAD2DEG) % 180);
    const distToH = Math.min(angleDeg, 180 - angleDeg);
    const distToV = Math.abs(90 - angleDeg);

    if (distToH <= angleTolDeg) {
      const cand: SketchConstraint = {
        id: `auto_h_${seq++}`,
        type: "horizontal",
        lines: [line.id],
      };
      const res = tryAddSketchConstraint(working, cand);
      if (res.accepted) {
        working = res.solveResult.sketch;
        added.push(cand);
      }
    } else if (distToV <= angleTolDeg) {
      const cand: SketchConstraint = {
        id: `auto_v_${seq++}`,
        type: "vertical",
        lines: [line.id],
      };
      const res = tryAddSketchConstraint(working, cand);
      if (res.accepted) {
        working = res.solveResult.sketch;
        added.push(cand);
      }
    }
  }

  // 2) Se ainda houver DOF e nenhum ponto fixo, fixa o primeiro ponto na sua posição atual
  let current = solveSketch2D(working);
  if (current.dof >= 2 && working.points.length > 0) {
    const hasFixed = working.points.some((p) => p.fixed) || working.constraints.some((c) => c.type === "fixed");
    if (!hasFixed) {
      const first = working.points[0]!;
      const cand: SketchConstraint = {
        id: `auto_fix_${seq++}`,
        type: "fixed",
        points: [first.id],
        fixedX: first.x,
        fixedY: first.y,
      };
      const res = tryAddSketchConstraint(working, cand);
      if (res.accepted) {
        working = res.solveResult.sketch;
        added.push(cand);
        current = res.solveResult;
      }
    }
  }

  return {
    addedConstraints: added,
    previewSketch: working,
    solveResult: current,
  };
}

/**
 * Orçamento mobile: executa o solver limitado a <= 30 Hz durante arraste de dedo,
 * retornando o último resultado válido sem travar o frame.
 */
export function createMobileThrottledSolver(maxHz = 30) {
  const minIntervalMs = 1000 / Math.max(1, maxHz);
  let lastRunAt = 0;
  let lastResult: ConstraintSolveResult | null = null;

  return {
    solveInteractive(sketch: ParametricSketch2D, nowMs = performance.now()): ConstraintSolveResult {
      if (lastResult && nowMs - lastRunAt < minIntervalMs) {
        return lastResult;
      }
      lastRunAt = nowMs;
      lastResult = solveSketch2D(sketch);
      return lastResult;
    },
    solveFinal(sketch: ParametricSketch2D): ConstraintSolveResult {
      lastRunAt = performance.now();
      lastResult = solveSketch2D(sketch);
      return lastResult;
    },
  };
}
