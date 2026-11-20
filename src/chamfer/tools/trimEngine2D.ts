/**
 * CALDRA CHAMFER — MOTOR UNIFICADO E ANALÍTICO DE TRIM / APARAR 2D
 *
 * Características:
 *  - Elimina 100% cordas retas falsas: todo sub-trecho carrega sua primitiva geométrica real
 *    (`line` | `arc` | `circle`) para renderização animada fiel sobre a curva/linha;
 *  - Interseções analíticas exatas (tolerância 1e-6 mm):
 *      • Segmento × Segmento (incluindo toque em extremidades / T-junctions)
 *      • Segmento × Círculo / Arco (quadrática exata filtrada ao vão angular)
 *      • Círculo / Arco × Círculo / Arco (eixo radical exato filtrado ao vão angular)
 *  - Coleta todas as entidades geométricas reais (ignorando cotas não-vetoriais, pontos e textos);
 *  - Suporta marcação por Toque Direto (distância real à curva, nunca bounding box) e
 *    Arraste "Faca / Fence Swipe" (apenas sub-trechos efetivamente cruzados pela lâmina);
 *  - Suporta fila de confirmação em lote (`markedKeys`) gerando 1 único passo atômico de Undo/Redo.
 */

import { dist, segmentsOf, uid, type Entity, type Vec2 } from "@/lib/lab2d/core";

export type TrimBoundaryMode = "real" | "projected";

export type TrimGeometricPrimitive =
  | { kind: "line"; p1: Vec2; p2: Vec2 }
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number }
  | { kind: "circle"; cx: number; cy: number; r: number };

export interface TrimSubPiece {
  /** Chave determinística estável para seleção/desmarcação em fila */
  key: string;
  /** ID da entidade original à qual este sub-trecho pertence */
  entityId: string;
  /** Índice do segmento na polilinha (quando a entidade for polyline) */
  polySegIndex?: number;
  /** Índice do intervalo dentro do segmento/círculo/arco */
  intervalIndex: number;
  /** Primitiva geométrica EXATA (nunca aproximada por corda reta!) */
  primitive: TrimGeometricPrimitive;
  /** Pontos exatos de interseção que delimitam este sub-trecho */
  cutPoints: Vec2[];
  /** Se o corte envolveu projeção (modo Projetado) */
  isProjected: boolean;
  /** Entidade equivalente caso este sub-trecho seja mantido */
  asEntity: Entity | null;
}

export interface TrimEntityDecomposition {
  entity: Entity;
  subPieces: TrimSubPiece[];
}

export interface TrimBatchPreview {
  /** Sub-trechos marcados para apagar (vermelho animado exato sobre curva/linha) */
  markedCutPieces: TrimSubPiece[];
  /** Sub-trechos das mesmas entidades que VÃO PERMANECER (verde esmeralda exato) */
  keptPieces: TrimSubPiece[];
  /** Todos os pontos exatos de interseção dos trechos marcados */
  intersectionMarkers: Vec2[];
}

export interface TrimCommitResult {
  updatedEntities: Entity[];
  removedSubPiecesCount: number;
  affectedEntityIds: string[];
}

const TWO_PI = Math.PI * 2;
const GEOM_TOL = 1e-6;
const DEDUP_TOL = 1e-4;
const END_MARGIN = 1e-4;

/* ------------------------------------------------------------------ helpers */

function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

function ccwSweep(a0: number, a1: number): number {
  let s = normAngle(a1) - normAngle(a0);
  if (s <= 1e-9) s += TWO_PI;
  return s;
}

function isAngleOnArc(theta: number, a0: number, a1: number, tol = 1e-5): boolean {
  const start = normAngle(a0);
  const sweep = ccwSweep(a0, a1);
  let delta = normAngle(theta) - start;
  if (delta < -tol) delta += TWO_PI;
  return delta >= -tol && delta <= sweep + tol;
}

function ptOnCircle(cx: number, cy: number, r: number, a: number): Vec2 {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function isTrimEligibleEntity(e: Entity): boolean {
  if (!e) return false;
  if (e.type === "point" || e.type === "text" || e.type === "hatch") return false;
  // Ignora qualquer entidade marcada como cota/referência não-vetorial
  if (e.params?.isNonVectorRef || e.params?.isGeometricMark || e.params?.isPersistentDatum) {
    return false;
  }
  return true;
}

function getPolylineSegments(poly: Extract<Entity, { type: "polyline" }>): [Vec2, Vec2][] {
  const pts = poly.pts;
  const n = pts.length;
  if (n < 2) return [];
  const segs: [Vec2, Vec2][] = [];
  for (let i = 0; i < n - 1; i++) {
    segs.push([pts[i]!, pts[i + 1]!]);
  }
  if (poly.closed && n >= 3 && dist(pts[n - 1]!, pts[0]!) > 1e-5) {
    segs.push([pts[n - 1]!, pts[0]!]);
  }
  return segs;
}

/* ------------------------------------------------- analytical intersections */

/** Interseção Segmento A [a1, a2] × Segmento B [b1, b2] (incluindo toque em extremidades) */
export function intersectSegSegExact(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
  segmentOnlyB: boolean,
): Vec2 | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dby * dax - dbx * day;
  if (Math.abs(denom) < 1e-11) return null;

  const ua = (dbx * (a1.y - b1.y) - dby * (a1.x - b1.x)) / denom;
  const ub = (dax * (a1.y - b1.y) - day * (a1.x - b1.x)) / denom;

  if (ua < -GEOM_TOL || ua > 1 + GEOM_TOL) return null;
  if (segmentOnlyB && (ub < -GEOM_TOL || ub > 1 + GEOM_TOL)) return null;

  const cua = Math.max(0, Math.min(1, ua));
  return { x: a1.x + cua * dax, y: a1.y + cua * day };
}

/** Interseção quadrática exata Segmento [a1, a2] × Círculo (cx, cy, r) */
export function intersectSegCircleExact(
  a1: Vec2,
  a2: Vec2,
  cx: number,
  cy: number,
  r: number,
  allowExtendedSeg = false,
): Vec2[] {
  if (r <= GEOM_TOL) return [];
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return [];
  const fx = a1.x - cx;
  const fy = a1.y - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < -1e-6) return [];

  const out: Vec2[] = [];
  const pushT = (t: number) => {
    if (!allowExtendedSeg && (t < -GEOM_TOL || t > 1 + GEOM_TOL)) return;
    const ct = allowExtendedSeg ? t : Math.max(0, Math.min(1, t));
    const pt = { x: a1.x + ct * dx, y: a1.y + ct * dy };
    if (!out.some((q) => dist(q, pt) <= DEDUP_TOL)) out.push(pt);
  };

  if (Math.abs(disc) <= 1e-6) {
    pushT(-b / (2 * a));
  } else {
    const sq = Math.sqrt(Math.max(0, disc));
    pushT((-b - sq) / (2 * a));
    pushT((-b + sq) / (2 * a));
  }
  return out;
}

/** Interseção radical exata Círculo 1 × Círculo 2 */
export function intersectCircleCircleExact(
  c1x: number,
  c1y: number,
  r1: number,
  c2x: number,
  c2y: number,
  r2: number,
): Vec2[] {
  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > r1 + r2 + 1e-5 || d < Math.abs(r1 - r2) - 1e-5) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = hSq > 1e-10 ? Math.sqrt(hSq) : 0;
  const x2 = c1x + (a * dx) / d;
  const y2 = c1y + (a * dy) / d;
  if (h <= 1e-6) return [{ x: x2, y: y2 }];
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    { x: x2 + rx, y: y2 + ry },
    { x: x2 - rx, y: y2 - ry },
  ];
}

function intersectSegWithCutter(
  seg: [Vec2, Vec2],
  cutter: Entity,
  segmentOnlyCutter: boolean,
): Vec2[] {
  if (!isTrimEligibleEntity(cutter)) return [];
  if (cutter.type === "line") {
    const pt = intersectSegSegExact(
      seg[0],
      seg[1],
      { x: cutter.x1, y: cutter.y1 },
      { x: cutter.x2, y: cutter.y2 },
      segmentOnlyCutter,
    );
    return pt ? [pt] : [];
  }
  if (cutter.type === "circle") {
    return intersectSegCircleExact(seg[0], seg[1], cutter.cx, cutter.cy, cutter.r);
  }
  if (cutter.type === "arc") {
    const pts = intersectSegCircleExact(seg[0], seg[1], cutter.cx, cutter.cy, cutter.r);
    if (!segmentOnlyCutter) return pts;
    return pts.filter((pt) => {
      const th = Math.atan2(pt.y - cutter.cy, pt.x - cutter.cx);
      return isAngleOnArc(th, cutter.a0, cutter.a1, 1e-4);
    });
  }
  const out: Vec2[] = [];
  const cSegs =
    cutter.type === "polyline" ? getPolylineSegments(cutter) : segmentsOf(cutter);
  for (const cs of cSegs) {
    const pt = intersectSegSegExact(seg[0], seg[1], cs[0], cs[1], segmentOnlyCutter);
    if (pt && !out.some((q) => dist(q, pt) <= DEDUP_TOL)) out.push(pt);
  }
  return out;
}

function intersectCircleWithCutter(
  cx: number,
  cy: number,
  r: number,
  cutter: Entity,
  segmentOnlyCutter: boolean,
): Vec2[] {
  if (!isTrimEligibleEntity(cutter)) return [];
  if (cutter.type === "circle") {
    return intersectCircleCircleExact(cx, cy, r, cutter.cx, cutter.cy, cutter.r);
  }
  if (cutter.type === "arc") {
    const pts = intersectCircleCircleExact(cx, cy, r, cutter.cx, cutter.cy, cutter.r);
    if (!segmentOnlyCutter) return pts;
    return pts.filter((pt) => {
      const th = Math.atan2(pt.y - cutter.cy, pt.x - cutter.cx);
      return isAngleOnArc(th, cutter.a0, cutter.a1, 1e-4);
    });
  }
  if (cutter.type === "line") {
    return intersectSegCircleExact(
      { x: cutter.x1, y: cutter.y1 },
      { x: cutter.x2, y: cutter.y2 },
      cx,
      cy,
      r,
      !segmentOnlyCutter,
    );
  }
  const out: Vec2[] = [];
  const cSegs =
    cutter.type === "polyline" ? getPolylineSegments(cutter) : segmentsOf(cutter);
  for (const cs of cSegs) {
    const pts = intersectSegCircleExact(cs[0], cs[1], cx, cy, r, !segmentOnlyCutter);
    for (const pt of pts) {
      if (!out.some((q) => dist(q, pt) <= DEDUP_TOL)) out.push(pt);
    }
  }
  return out;
}

/* ----------------------------------------------------- subdivision per type */

function collectSegmentTParams(
  seg: [Vec2, Vec2],
  ownerEntity: Entity,
  allEntities: Entity[],
  mode: TrimBoundaryMode,
  selfPolySegIdx?: number,
): { ts: number[]; isProjected: boolean } {
  const [pA, pB] = seg;
  const segLen = dist(pA, pB);
  if (segLen < 1e-5) return { ts: [], isProjected: false };

  const dx = (pB.x - pA.x) / segLen;
  const dy = (pB.y - pA.y) / segLen;

  const collect = (segOnly: boolean): number[] => {
    const raw: number[] = [];
    const pushPt = (pt: Vec2) => {
      const t = ((pt.x - pA.x) * dx + (pt.y - pA.y) * dy) / segLen;
      if (t > END_MARGIN && t < 1 - END_MARGIN) {
        raw.push(t);
      }
    };

    for (const cutter of allEntities) {
      if (!cutter || cutter.id === ownerEntity.id || !isTrimEligibleEntity(cutter)) continue;
      for (const pt of intersectSegWithCutter(seg, cutter, segOnly)) {
        pushPt(pt);
      }
    }

    // Auto-interseção de polilinhas (segmentos não adjacentes)
    if (ownerEntity.type === "polyline" && typeof selfPolySegIdx === "number") {
      const selfSegs = getPolylineSegments(ownerEntity);
      for (let j = 0; j < selfSegs.length; j++) {
        if (j === selfPolySegIdx) continue;
        const pt = intersectSegSegExact(pA, pB, selfSegs[j]![0], selfSegs[j]![1], segOnly);
        if (pt) pushPt(pt);
      }
    }

    raw.sort((a, b) => a - b);
    const unique: number[] = [];
    for (const t of raw) {
      const prev = unique[unique.length - 1];
      if (prev === undefined || Math.abs(t - prev) * segLen > DEDUP_TOL) {
        unique.push(t);
      }
    }
    return unique;
  };

  const realTs = collect(true);
  if (realTs.length > 0 || mode === "real") {
    return { ts: realTs, isProjected: false };
  }
  const projTs = collect(false);
  return { ts: projTs, isProjected: projTs.length > 0 };
}

/** Subdivide uma entidade em todos os seus sub-trechos geométricos reais */
export function decomposeEntityForTrim(
  entity: Entity,
  allEntities: Entity[],
  mode: TrimBoundaryMode = "real",
): TrimEntityDecomposition | null {
  if (!isTrimEligibleEntity(entity)) return null;

  if (entity.type === "line") {
    const pA: Vec2 = { x: entity.x1, y: entity.y1 };
    const pB: Vec2 = { x: entity.x2, y: entity.y2 };
    if (dist(pA, pB) < 1e-5) return null;
    const { ts, isProjected } = collectSegmentTParams([pA, pB], entity, allEntities, mode);
    const bounds = [0, ...ts, 1];
    const subPieces: TrimSubPiece[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const t0 = bounds[i]!;
      const t1 = bounds[i + 1]!;
      const q0: Vec2 = { x: pA.x + t0 * (pB.x - pA.x), y: pA.y + t0 * (pB.y - pA.y) };
      const q1: Vec2 = { x: pA.x + t1 * (pB.x - pA.x), y: pA.y + t1 * (pB.y - pA.y) };
      if (dist(q0, q1) < 1e-5) continue;
      const cutPoints: Vec2[] = [];
      if (t0 > END_MARGIN) cutPoints.push(q0);
      if (t1 < 1 - END_MARGIN) cutPoints.push(q1);
      subPieces.push({
        key: `${entity.id}:seg:0:int:${i}`,
        entityId: entity.id,
        intervalIndex: i,
        primitive: { kind: "line", p1: q0, p2: q1 },
        cutPoints,
        isProjected,
        asEntity: {
          ...entity,
          id: i === 0 ? entity.id : uid(),
          x1: q0.x,
          y1: q0.y,
          x2: q1.x,
          y2: q1.y,
        },
      });
    }
    return { entity, subPieces };
  }

  if (entity.type === "polyline") {
    const segs = getPolylineSegments(entity);
    if (segs.length === 0) return null;
    const subPieces: TrimSubPiece[] = [];
    for (let sIdx = 0; sIdx < segs.length; sIdx++) {
      const [pA, pB] = segs[sIdx]!;
      if (dist(pA, pB) < 1e-5) continue;
      const { ts, isProjected } = collectSegmentTParams([pA, pB], entity, allEntities, mode, sIdx);
      const bounds = [0, ...ts, 1];
      for (let i = 0; i < bounds.length - 1; i++) {
        const t0 = bounds[i]!;
        const t1 = bounds[i + 1]!;
        const q0: Vec2 = { x: pA.x + t0 * (pB.x - pA.x), y: pA.y + t0 * (pB.y - pA.y) };
        const q1: Vec2 = { x: pA.x + t1 * (pB.x - pA.x), y: pA.y + t1 * (pB.y - pA.y) };
        if (dist(q0, q1) < 1e-5) continue;
        const cutPoints: Vec2[] = [];
        if (t0 > END_MARGIN) cutPoints.push(q0);
        if (t1 < 1 - END_MARGIN) cutPoints.push(q1);
        subPieces.push({
          key: `${entity.id}:seg:${sIdx}:int:${i}`,
          entityId: entity.id,
          polySegIndex: sIdx,
          intervalIndex: i,
          primitive: { kind: "line", p1: q0, p2: q1 },
          cutPoints,
          isProjected,
          asEntity: {
            id: uid(),
            layer: entity.layer,
            group: entity.group,
            type: "line",
            x1: q0.x,
            y1: q0.y,
            x2: q1.x,
            y2: q1.y,
          },
        });
      }
    }
    return { entity, subPieces };
  }

  if (entity.type === "circle") {
    if (entity.r <= 1e-5) return null;
    const collectAngles = (segOnly: boolean): number[] => {
      const angles: number[] = [];
      for (const cutter of allEntities) {
        if (!cutter || cutter.id === entity.id || !isTrimEligibleEntity(cutter)) continue;
        const pts = intersectCircleWithCutter(entity.cx, entity.cy, entity.r, cutter, segOnly);
        for (const pt of pts) {
          const ang = normAngle(Math.atan2(pt.y - entity.cy, pt.x - entity.cx));
          if (
            !angles.some(
              (a) =>
                Math.abs(a - ang) * entity.r <= DEDUP_TOL ||
                Math.abs(Math.abs(a - ang) - TWO_PI) * entity.r <= DEDUP_TOL,
            )
          ) {
            angles.push(ang);
          }
        }
      }
      angles.sort((a, b) => a - b);
      return angles;
    };

    let angles = collectAngles(true);
    let isProjected = false;
    if (angles.length < 2 && mode === "projected") {
      const proj = collectAngles(false);
      if (proj.length >= 2) {
        angles = proj;
        isProjected = true;
      }
    }

    if (angles.length < 2) {
      // Menos de 2 interseções: círculo inteiro é o único sub-trecho
      return {
        entity,
        subPieces: [
          {
            key: `${entity.id}:circle:0`,
            entityId: entity.id,
            intervalIndex: 0,
            primitive: { kind: "circle", cx: entity.cx, cy: entity.cy, r: entity.r },
            cutPoints: angles.map((a) => ptOnCircle(entity.cx, entity.cy, entity.r, a)),
            isProjected,
            asEntity: entity,
          },
        ],
      };
    }

    // >= 2 interseções: divide em N sub-arcos cíclicos [theta_k, theta_{k+1}]
    const k = angles.length;
    const subPieces: TrimSubPiece[] = [];
    for (let i = 0; i < k; i++) {
      const a0 = angles[i]!;
      const a1 = angles[(i + 1) % k]!;
      const p0 = ptOnCircle(entity.cx, entity.cy, entity.r, a0);
      const p1 = ptOnCircle(entity.cx, entity.cy, entity.r, a1);
      subPieces.push({
        key: `${entity.id}:arc:${i}`,
        entityId: entity.id,
        intervalIndex: i,
        primitive: { kind: "arc", cx: entity.cx, cy: entity.cy, r: entity.r, a0, a1 },
        cutPoints: [p0, p1],
        isProjected,
        asEntity: {
          id: i === 0 ? entity.id : uid(),
          layer: entity.layer,
          group: entity.group,
          type: "arc",
          cx: entity.cx,
          cy: entity.cy,
          r: entity.r,
          a0,
          a1,
        },
      });
    }
    return { entity, subPieces };
  }

  if (entity.type === "arc") {
    if (entity.r <= 1e-5) return null;
    const start = normAngle(entity.a0);
    const totalSweep = ccwSweep(entity.a0, entity.a1);
    if (totalSweep < 1e-5) return null;

    const toOffset = (ang: number) => {
      let d = normAngle(ang) - start;
      if (d < -1e-5) d += TWO_PI;
      return d;
    };

    const collectOffsets = (segOnly: boolean): number[] => {
      const offs: number[] = [];
      for (const cutter of allEntities) {
        if (!cutter || cutter.id === entity.id || !isTrimEligibleEntity(cutter)) continue;
        const pts = intersectCircleWithCutter(entity.cx, entity.cy, entity.r, cutter, segOnly);
        for (const pt of pts) {
          const off = toOffset(Math.atan2(pt.y - entity.cy, pt.x - entity.cx));
          if (off > 1e-4 && off < totalSweep - 1e-4) {
            if (!offs.some((o) => Math.abs(o - off) * entity.r <= DEDUP_TOL)) {
              offs.push(off);
            }
          }
        }
      }
      offs.sort((a, b) => a - b);
      return offs;
    };

    let offs = collectOffsets(true);
    let isProjected = false;
    if (offs.length === 0 && mode === "projected") {
      offs = collectOffsets(false);
      isProjected = offs.length > 0;
    }

    const bounds = [0, ...offs, totalSweep];
    const subPieces: TrimSubPiece[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const u0 = bounds[i]!;
      const u1 = bounds[i + 1]!;
      if (u1 - u0 < 1e-5) continue;
      const a0 = normAngle(start + u0);
      const a1 = normAngle(start + u1);
      const cutPoints: Vec2[] = [];
      if (u0 > 1e-4) cutPoints.push(ptOnCircle(entity.cx, entity.cy, entity.r, a0));
      if (u1 < totalSweep - 1e-4) cutPoints.push(ptOnCircle(entity.cx, entity.cy, entity.r, a1));
      subPieces.push({
        key: `${entity.id}:arc:${i}`,
        entityId: entity.id,
        intervalIndex: i,
        primitive: { kind: "arc", cx: entity.cx, cy: entity.cy, r: entity.r, a0, a1 },
        cutPoints,
        isProjected,
        asEntity: {
          ...entity,
          id: i === 0 ? entity.id : uid(),
          a0,
          a1,
        },
      });
    }
    return { entity, subPieces };
  }

  return null;
}

/* ------------------------------------------- true distance & swipe crossing */

/** Distância geométrica exata de `p` até uma primitiva (ZERO bounding box!) */
export function distancePointToTrimPrimitive(p: Vec2, prim: TrimGeometricPrimitive): number {
  if (prim.kind === "line") {
    const dx = prim.p2.x - prim.p1.x;
    const dy = prim.p2.y - prim.p1.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-12) return dist(p, prim.p1);
    const t = Math.max(0, Math.min(1, ((p.x - prim.p1.x) * dx + (p.y - prim.p1.y) * dy) / l2));
    return dist(p, { x: prim.p1.x + t * dx, y: prim.p1.y + t * dy });
  }
  if (prim.kind === "circle") {
    return Math.abs(dist(p, { x: prim.cx, y: prim.cy }) - prim.r);
  }
  // Arc
  const theta = Math.atan2(p.y - prim.cy, p.x - prim.cx);
  if (isAngleOnArc(theta, prim.a0, prim.a1, 1e-4)) {
    return Math.abs(dist(p, { x: prim.cx, y: prim.cy }) - prim.r);
  }
  const p0 = ptOnCircle(prim.cx, prim.cy, prim.r, prim.a0);
  const p1 = ptOnCircle(prim.cx, prim.cy, prim.r, prim.a1);
  return Math.min(dist(p, p0), dist(p, p1));
}

/** Verifica se um segmento da lâmina (swipe fence `[fA, fB]`) cruza realmente a primitiva */
export function doesFenceSegCrossPrimitive(
  fA: Vec2,
  fB: Vec2,
  prim: TrimGeometricPrimitive,
): boolean {
  if (prim.kind === "line") {
    return intersectSegSegExact(fA, fB, prim.p1, prim.p2, true) !== null;
  }
  if (prim.kind === "circle") {
    return intersectSegCircleExact(fA, fB, prim.cx, prim.cy, prim.r, false).length > 0;
  }
  // Arc
  const pts = intersectSegCircleExact(fA, fB, prim.cx, prim.cy, prim.r, false);
  return pts.some((pt) => {
    const th = Math.atan2(pt.y - prim.cy, pt.x - prim.cx);
    return isAngleOnArc(th, prim.a0, prim.a1, 1e-3);
  });
}

/**
 * Toque Direto: encontra o sub-trecho exato mais próximo do ponto tocado dentro de `hitTolMm`.
 */
export function hitTestTrimSubPiece(
  point: Vec2,
  entities: Entity[],
  hitTolMm: number,
  mode: TrimBoundaryMode = "real",
): { subPiece: TrimSubPiece; decomposition: TrimEntityDecomposition; distance: number } | null {
  let best: {
    subPiece: TrimSubPiece;
    decomposition: TrimEntityDecomposition;
    distance: number;
  } | null = null;

  for (const e of entities) {
    const decomp = decomposeEntityForTrim(e, entities, mode);
    if (!decomp) continue;
    for (const sp of decomp.subPieces) {
      const d = distancePointToTrimPrimitive(point, sp.primitive);
      if (d <= hitTolMm && (!best || d < best.distance)) {
        best = { subPiece: sp, decomposition: decomp, distance: d };
      }
    }
  }
  return best;
}

/**
 * Arraste "Faca / Fence Swipe": retorna TODOS os sub-trechos efetivamente cruzados pela lâmina.
 * Nunca seleciona nenhuma entidade que o rastro do dedo não cruzou!
 */
export function collectTrimSubPiecesCrossedByFence(
  fencePolyline: Vec2[],
  entities: Entity[],
  mode: TrimBoundaryMode = "real",
): TrimSubPiece[] {
  if (fencePolyline.length < 2) return [];
  const hitKeys = new Set<string>();
  const hits: TrimSubPiece[] = [];

  for (const e of entities) {
    const decomp = decomposeEntityForTrim(e, entities, mode);
    if (!decomp) continue;
    for (const sp of decomp.subPieces) {
      if (hitKeys.has(sp.key)) continue;
      for (let i = 0; i < fencePolyline.length - 1; i++) {
        if (doesFenceSegCrossPrimitive(fencePolyline[i]!, fencePolyline[i + 1]!, sp.primitive)) {
          hitKeys.add(sp.key);
          hits.push(sp);
          break;
        }
      }
    }
  }
  return hits;
}

/* ------------------------------------------- batch preview & atomic commit */

/**
 * Constrói a prévia fiel (trechos vermelhos marcados + trechos verdes mantidos + marcadores ✕)
 * a partir da fila de chaves marcadas (`markedKeys`) e de um eventual sub-trecho em hover.
 */
export function buildTrimBatchPreview(
  entities: Entity[],
  markedKeys: string[],
  hoverPiece: TrimSubPiece | null,
  mode: TrimBoundaryMode = "real",
): TrimBatchPreview {
  const keySet = new Set<string>(markedKeys);
  if (hoverPiece) keySet.add(hoverPiece.key);

  if (keySet.size === 0) {
    return { markedCutPieces: [], keptPieces: [], intersectionMarkers: [] };
  }

  const affectedEntityIds = new Set<string>();
  for (const key of keySet) {
    const entityId = key.split(":")[0];
    if (entityId) affectedEntityIds.add(entityId);
  }

  const markedCutPieces: TrimSubPiece[] = [];
  const keptPieces: TrimSubPiece[] = [];
  const intersectionMarkers: Vec2[] = [];

  for (const e of entities) {
    if (!affectedEntityIds.has(e.id)) continue;
    const decomp = decomposeEntityForTrim(e, entities, mode);
    if (!decomp) continue;
    for (const sp of decomp.subPieces) {
      if (keySet.has(sp.key)) {
        markedCutPieces.push(sp);
        for (const cp of sp.cutPoints) {
          if (!intersectionMarkers.some((m) => dist(m, cp) <= 1e-3)) {
            intersectionMarkers.push(cp);
          }
        }
      } else {
        keptPieces.push(sp);
      }
    }
  }

  return { markedCutPieces, keptPieces, intersectionMarkers };
}

/**
 * Reconstrói cadeias contíguas de segmentos retos de uma polilinha aparada em
 * polilinhas abertas limpas (ou linhas se apenas 1 segmento sobrar), preservando
 * 100% dos demais lados e vértices intactos!
 */
function rebuildPolylineRemainingEntities(
  poly: Extract<Entity, { type: "polyline" }>,
  keptPieces: TrimSubPiece[],
): Entity[] {
  if (keptPieces.length === 0) return [];
  const segs: [Vec2, Vec2][] = keptPieces
    .filter((p) => p.primitive.kind === "line")
    .map((p) => {
      const lp = p.primitive as Extract<TrimGeometricPrimitive, { kind: "line" }>;
      return [lp.p1, lp.p2] as [Vec2, Vec2];
    });

  if (segs.length === 0) return [];

  // Agrupa segmentos consecutivos que compartilham extremidade
  const used = new Array<boolean>(segs.length).fill(false);
  const chains: Vec2[][] = [];

  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const pts: Vec2[] = [segs[i]![0], segs[i]![1]];

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const [a, b] = segs[j]!;
        const head = pts[0]!;
        const tail = pts[pts.length - 1]!;
        if (dist(tail, a) <= 1e-3) {
          pts.push(b);
          used[j] = true;
          extended = true;
        } else if (dist(tail, b) <= 1e-3) {
          pts.push(a);
          used[j] = true;
          extended = true;
        } else if (dist(head, b) <= 1e-3) {
          pts.unshift(a);
          used[j] = true;
          extended = true;
        } else if (dist(head, a) <= 1e-3) {
          pts.unshift(b);
          used[j] = true;
          extended = true;
        }
      }
    }
    chains.push(pts);
  }

  return chains.map((pts, idx): Entity => {
    if (pts.length === 2) {
      return {
        id: idx === 0 ? poly.id : uid(),
        layer: poly.layer,
        group: poly.group,
        type: "line",
        x1: pts[0]!.x,
        y1: pts[0]!.y,
        x2: pts[1]!.x,
        y2: pts[1]!.y,
      };
    }
    return {
      ...poly,
      id: idx === 0 ? poly.id : uid(),
      closed: false,
      pts,
    };
  });
}

/**
 * Funde sub-arcos contíguos remanescentes de um mesmo círculo ou arco em arcos contínuos limpos
 * (ex.: se um círculo com 4 interseções teve apenas 1 quadrante removido, devolve 1 único arco de 270°,
 * e NÃO 3 arcos fragmentados!).
 */
function mergeContiguousKeptArcs(
  original: Extract<Entity, { type: "circle" | "arc" }>,
  keptPieces: TrimSubPiece[],
): Entity[] {
  if (keptPieces.length === 0) return [];
  if (keptPieces.length === 1 && keptPieces[0]!.primitive.kind === "circle") {
    return [original];
  }

  const arcs = keptPieces
    .filter((p) => p.primitive.kind === "arc")
    .map((p) => p.primitive as Extract<TrimGeometricPrimitive, { kind: "arc" }>)
    .map((a) => ({ a0: normAngle(a.a0), a1: normAngle(a.a1) }));

  if (arcs.length === 0) return [];

  // Funde arcos onde prev.a1 === next.a0 (mod 2PI)
  let changed = true;
  while (changed && arcs.length > 1) {
    changed = false;
    for (let i = 0; i < arcs.length; i++) {
      for (let j = 0; j < arcs.length; j++) {
        if (i === j) continue;
        const diff = Math.abs(normAngle(arcs[i]!.a1 - arcs[j]!.a0));
        if (diff < 1e-4 || Math.abs(diff - TWO_PI) < 1e-4) {
          // Funde j ao final de i
          const combinedSweep = ccwSweep(arcs[i]!.a0, arcs[i]!.a1) + ccwSweep(arcs[j]!.a0, arcs[j]!.a1);
          if (combinedSweep >= TWO_PI - 1e-4) {
            return [
              {
                id: original.id,
                layer: original.layer,
                group: original.group,
                type: "circle",
                cx: original.cx,
                cy: original.cy,
                r: original.r,
              },
            ];
          }
          arcs[i] = { a0: arcs[i]!.a0, a1: arcs[j]!.a1 };
          arcs.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return arcs.map((a, idx) => ({
    id: idx === 0 ? original.id : uid(),
    layer: original.layer,
    group: original.group,
    type: "arc" as const,
    cx: original.cx,
    cy: original.cy,
    r: original.r,
    a0: a.a0,
    a1: a.a1,
  }));
}

/**
 * Consolida TODOS os sub-trechos marcados (`markedKeys`) em uma única operação atômica
 * (ideal para 1 único passo de Undo/Redo).
 */
export function commitTrimBatch(
  entities: Entity[],
  markedKeys: string[],
  mode: TrimBoundaryMode = "real",
): TrimCommitResult {
  const keySet = new Set<string>(markedKeys);
  if (keySet.size === 0) {
    return { updatedEntities: entities, removedSubPiecesCount: 0, affectedEntityIds: [] };
  }

  const affectedIds = new Set<string>();
  for (const k of keySet) {
    const id = k.split(":")[0];
    if (id) affectedIds.add(id);
  }

  const updatedEntities: Entity[] = [];
  let removedCount = 0;
  const actuallyAffected: string[] = [];

  for (const e of entities) {
    if (!affectedIds.has(e.id)) {
      updatedEntities.push(e);
      continue;
    }

    const decomp = decomposeEntityForTrim(e, entities, mode);
    if (!decomp) {
      updatedEntities.push(e);
      continue;
    }

    const kept = decomp.subPieces.filter((sp) => !keySet.has(sp.key));
    const removed = decomp.subPieces.length - kept.length;
    if (removed === 0) {
      updatedEntities.push(e);
      continue;
    }

    removedCount += removed;
    actuallyAffected.push(e.id);

    if (kept.length === 0) {
      // Todos os sub-trechos desta entidade foram marcados -> entidade removida
      continue;
    }

    if (e.type === "polyline") {
      updatedEntities.push(...rebuildPolylineRemainingEntities(e, kept));
    } else if (e.type === "circle" || e.type === "arc") {
      updatedEntities.push(...mergeContiguousKeptArcs(e, kept));
    } else if (e.type === "line") {
      // Funde sub-segmentos contíguos se houver
      for (let i = 0; i < kept.length; i++) {
        const ent = kept[i]!.asEntity;
        if (ent) {
          updatedEntities.push({ ...ent, id: i === 0 ? e.id : uid() });
        }
      }
    }
  }

  return {
    updatedEntities,
    removedSubPiecesCount: removedCount,
    affectedEntityIds: actuallyAffected,
  };
}

/**
 * Converte uma primitiva de Trim em caminho SVG real (sem cordas retas falsas!)
 */
export function trimPrimitiveToSvgPath(prim: TrimGeometricPrimitive): string {
  const f = (n: number) => n.toFixed(3);
  if (prim.kind === "line") {
    return `M ${f(prim.p1.x)} ${f(prim.p1.y)} L ${f(prim.p2.x)} ${f(prim.p2.y)}`;
  }
  if (prim.kind === "circle") {
    return (
      `M ${f(prim.cx - prim.r)} ${f(prim.cy)} ` +
      `A ${f(prim.r)} ${f(prim.r)} 0 1 0 ${f(prim.cx + prim.r)} ${f(prim.cy)} ` +
      `A ${f(prim.r)} ${f(prim.r)} 0 1 0 ${f(prim.cx - prim.r)} ${f(prim.cy)} Z`
    );
  }
  const p0 = ptOnCircle(prim.cx, prim.cy, prim.r, prim.a0);
  const p1 = ptOnCircle(prim.cx, prim.cy, prim.r, prim.a1);
  const sweep = ccwSweep(prim.a0, prim.a1);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${f(p0.x)} ${f(p0.y)} A ${f(prim.r)} ${f(prim.r)} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`;
}
