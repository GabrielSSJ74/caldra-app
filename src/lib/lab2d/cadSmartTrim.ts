/**
 * CALDRA CHAMFER — FERRAMENTA "APARAR (TRIM)" E "APARAR ATÉ O ENCONTRO (SMART TRIM)"
 *
 * Motor geométrico analítico para corte parcial de entidades CAD:
 *  - Identifica todas as interseções reais (ou projetadas) ao longo do segmento/curva;
 *  - Determina exatamente o subtrecho [t_a, t_b] que contém o ponto clicado;
 *  - Remove EXCLUSIVAMENTE o subtrecho selecionado entre as interseções/vértices;
 *  - Reconstrói polilinhas fechadas (ex: retângulos, polígonos, slots) em polilinhas abertas
 *    preservando 100% dos demais lados e vértices;
 *  - Divide linhas, polilinhas abertas ou arcos em duas entidades independentes quando o
 *    trecho removido está no meio da geometria;
 *  - Suporta conversão de círculos aparados em arcos e corte parcial de arcos.
 */

import type { Vec2 } from "@/lib/geometry/types";
import { dist, segmentsOf, uid, type Entity } from "./core";

export type TrimBoundaryMode = "real" | "projected";

export interface SmartTrimCandidate {
  /** Ponto exato de interseção onde o corte ocorre */
  intersectionPoint: Vec2;
  /** Segundo ponto de interseção quando o trecho removido está entre duas interseções */
  secondIntersectionPoint?: Vec2;
  /** Entidade que funciona como faca/limite de corte */
  boundaryEntity: Entity;
  /** Nova entidade principal resultante após remover o segmento clicado */
  trimmedEntity: Entity | null;
  /** Caso o corte divida uma entidade em duas partes (ex: cortar o meio de uma linha/polilinha/arco) */
  extraTrimmedEntities?: Entity[];
  /** Lista consolidada de todas as entidades que substituem a entidade original */
  replacementEntities: Entity[];
  /** Segmento que será descartado (para preview tracejado vermelho) */
  cutSegment: [Vec2, Vec2];
  /** Segmento principal mantido (para preview sólido verde) */
  keptSegment: [Vec2, Vec2];
  /** Segmentos adicionais mantidos na mesma aresta (quando o meio é removido) */
  extraKeptSegments?: [Vec2, Vec2][];
  /** Distância do clique até a interseção */
  distanceToClick: number;
  /** Se a interseção é real ou projetada */
  isProjected: boolean;
}

export interface SmartTrimPreview {
  targetEntity: Entity;
  clickPoint: Vec2;
  activeCandidate: SmartTrimCandidate | null;
  allCandidates: SmartTrimCandidate[];
}

const EPS = 1e-4;
const DEDUP_TOL = 1e-3;
const ENDPOINT_TOUCH_TOL = 0.05;
const TWO_PI = Math.PI * 2;

function normalizeAngle(a: number): number {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Verifica se um ângulo `theta` pertence ao vão angular CCW de `a0` até `a1`.
 */
function isAngleOnArcCCW(theta: number, a0: number, a1: number, tol = 1e-4): boolean {
  const start = normalizeAngle(a0);
  let end = normalizeAngle(a1);
  if (end <= start + 1e-9) end += TWO_PI;
  let cur = normalizeAngle(theta);
  if (cur < start - tol) cur += TWO_PI;
  return cur >= start - tol && cur <= end + tol;
}

/**
 * Interseção entre o segmento alvo A=[a1, a2] e o segmento cortante B=[b1, b2].
 * O ponto deve estar sempre dentro do segmento alvo A (t in [0, 1]).
 * Se `segmentOnlyB` for true, também exige u in [0, 1] no segmento cortante B.
 */
function intersectSegSeg(
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
  if (Math.abs(denom) < 1e-10) return null; // Paralelas ou colineares

  const ua = (dbx * (a1.y - b1.y) - dby * (a1.x - b1.x)) / denom;
  const ub = (dax * (a1.y - b1.y) - day * (a1.x - b1.x)) / denom;

  const tol = 1e-5;
  // Deve estar sempre sobre o segmento alvo A
  if (ua < -tol || ua > 1 + tol) return null;
  // Se modo real, deve estar também sobre o segmento cortante B
  if (segmentOnlyB && (ub < -tol || ub > 1 + tol)) return null;

  const clampedUa = Math.max(0, Math.min(1, ua));
  return {
    x: a1.x + clampedUa * dax,
    y: a1.y + clampedUa * day,
  };
}

/**
 * Interseção analítica exata entre o segmento alvo A=[a1, a2] e um círculo (cx, cy, r).
 */
function intersectSegCircle(
  a1: Vec2,
  a2: Vec2,
  cx: number,
  cy: number,
  r: number,
): Vec2[] {
  if (r <= 0) return [];
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const fx = a1.x - cx;
  const fy = a1.y - cy;

  const a = dx * dx + dy * dy;
  if (a < 1e-12) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const disc = b * b - 4 * a * c;
  if (disc < -1e-7) return [];

  const tol = 1e-5;
  const out: Vec2[] = [];

  if (Math.abs(disc) <= 1e-7) {
    const t = -b / (2 * a);
    if (t >= -tol && t <= 1 + tol) {
      const ct = Math.max(0, Math.min(1, t));
      out.push({ x: a1.x + ct * dx, y: a1.y + ct * dy });
    }
    return out;
  }

  const sqrtDisc = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  if (t1 >= -tol && t1 <= 1 + tol) {
    const ct = Math.max(0, Math.min(1, t1));
    out.push({ x: a1.x + ct * dx, y: a1.y + ct * dy });
  }
  if (t2 >= -tol && t2 <= 1 + tol) {
    const ct = Math.max(0, Math.min(1, t2));
    const pt = { x: a1.x + ct * dx, y: a1.y + ct * dy };
    if (out.length === 0 || dist(out[0]!, pt) > DEDUP_TOL) {
      out.push(pt);
    }
  }

  return out;
}

/**
 * Interseção analítica entre dois círculos (c1, r1) e (c2, r2).
 */
function intersectCircleCircle(
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
  if (d < 1e-9 || d > r1 + r2 + 1e-5 || d < Math.abs(r1 - r2) - 1e-5) {
    return [];
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = hSq > 0 ? Math.sqrt(hSq) : 0;

  const x2 = c1x + (a * dx) / d;
  const y2 = c1y + (a * dy) / d;

  if (h < 1e-6) {
    return [{ x: x2, y: y2 }];
  }

  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;

  return [
    { x: x2 + rx, y: y2 + ry },
    { x: x2 - rx, y: y2 - ry },
  ];
}

/**
 * Projeta ponto `p` sobre o segmento `seg = [a, b]` retornando a distância `t` em `[0, len]`.
 */
function projectOnSegT(p: Vec2, seg: [Vec2, Vec2]): number {
  const [a, b] = seg;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return 0;
  const dot = (p.x - a.x) * (dx / len) + (p.y - a.y) * (dy / len);
  return Math.max(0, Math.min(len, dot));
}

function pointAtSegT(seg: [Vec2, Vec2], t: number, len: number): Vec2 {
  if (len < 1e-9) return { x: seg[0].x, y: seg[0].y };
  const r = Math.max(0, Math.min(1, t / len));
  return {
    x: seg[0].x + (seg[1].x - seg[0].x) * r,
    y: seg[0].y + (seg[1].y - seg[0].y) * r,
  };
}

function distToSeg(p: Vec2, seg: [Vec2, Vec2]): number {
  const [a, b] = seg;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Distância mínima de um ponto `p` a qualquer entidade `cutter`.
 */
function distPointToEntity(p: Vec2, cutter: Entity): number {
  if (cutter.type === "circle") {
    return Math.abs(dist(p, { x: cutter.cx, y: cutter.cy }) - cutter.r);
  }
  if (cutter.type === "arc") {
    const theta = Math.atan2(p.y - cutter.cy, p.x - cutter.cx);
    if (isAngleOnArcCCW(theta, cutter.a0, cutter.a1)) {
      return Math.abs(dist(p, { x: cutter.cx, y: cutter.cy }) - cutter.r);
    }
    const p0 = { x: cutter.cx + cutter.r * Math.cos(cutter.a0), y: cutter.cy + cutter.r * Math.sin(cutter.a0) };
    const p1 = { x: cutter.cx + cutter.r * Math.cos(cutter.a1), y: cutter.cy + cutter.r * Math.sin(cutter.a1) };
    return Math.min(dist(p, p0), dist(p, p1));
  }
  let best = Infinity;
  for (const s of segmentsOf(cutter)) {
    best = Math.min(best, distToSeg(p, s));
  }
  return best;
}

/**
 * Encontra todos os pontos de interseção entre um segmento linear `seg` e uma entidade `cutter`.
 */
function intersectSegmentWithEntity(
  seg: [Vec2, Vec2],
  cutter: Entity,
  segmentOnlyCutter: boolean,
): Vec2[] {
  if (cutter.type === "point" || cutter.type === "text") return [];

  if (cutter.type === "circle") {
    return intersectSegCircle(seg[0], seg[1], cutter.cx, cutter.cy, cutter.r);
  }

  if (cutter.type === "arc") {
    const circlePts = intersectSegCircle(seg[0], seg[1], cutter.cx, cutter.cy, cutter.r);
    if (!segmentOnlyCutter) return circlePts;
    return circlePts.filter((pt) => {
      const theta = Math.atan2(pt.y - cutter.cy, pt.x - cutter.cx);
      return isAngleOnArcCCW(theta, cutter.a0, cutter.a1);
    });
  }

  if (cutter.type === "line") {
    const pt = intersectSegSeg(
      seg[0],
      seg[1],
      { x: cutter.x1, y: cutter.y1 },
      { x: cutter.x2, y: cutter.y2 },
      segmentOnlyCutter,
    );
    return pt ? [pt] : [];
  }

  // Para polilinhas (incluindo retângulos fechados), elipses, paths, hachuras:
  const pts: Vec2[] = [];
  const cutterSegs = segmentsOf(cutter);
  for (const cs of cutterSegs) {
    const pt = intersectSegSeg(seg[0], seg[1], cs[0], cs[1], segmentOnlyCutter);
    if (pt) {
      if (!pts.some((existing) => dist(existing, pt) <= DEDUP_TOL)) {
        pts.push(pt);
      }
    }
  }
  return pts;
}

interface SegmentIntersectionHit {
  t: number;
  point: Vec2;
  cutter: Entity;
  isProjected: boolean;
}

/**
 * Coleta e ordena todas as interseções no interior (0 < t < L) de um segmento `seg = [pA, pB]`.
 */
function collectInteriorIntersectionsOnSegment(
  seg: [Vec2, Vec2],
  segLen: number,
  target: Entity,
  allEntities: Entity[],
  mode: TrimBoundaryMode,
  selfExcludeSegIdx?: number,
): SegmentIntersectionHit[] {
  const endMargin = Math.min(1e-2, segLen * 1e-3);
  const rawHits: SegmentIntersectionHit[] = [];

  const addHits = (segmentOnlyCutter: boolean, isProjected: boolean) => {
    for (const cutter of allEntities) {
      if (!cutter || cutter.id === target.id) continue;
      if (cutter.type === "point" || cutter.type === "text") continue;

      const pts = intersectSegmentWithEntity(seg, cutter, segmentOnlyCutter);
      for (const pt of pts) {
        if (distToSeg(pt, seg) > 1e-2) continue;
        const t = projectOnSegT(pt, seg);
        if (t > endMargin && t < segLen - endMargin) {
          rawHits.push({
            t,
            point: pointAtSegT(seg, t, segLen),
            cutter,
            isProjected,
          });
        }
      }
    }

    // Auto-interseção de polilinhas (segmentos não adjacentes da própria polilinha)
    if (target.type === "polyline" && typeof selfExcludeSegIdx === "number") {
      const selfSegs = getPolylineSegments(target);
      const total = selfSegs.length;
      for (let j = 0; j < total; j++) {
        if (j === selfExcludeSegIdx) continue;
        const pt = intersectSegSeg(seg[0], seg[1], selfSegs[j]![0], selfSegs[j]![1], segmentOnlyCutter);
        if (pt && distToSeg(pt, seg) <= 1e-2) {
          const t = projectOnSegT(pt, seg);
          if (t > endMargin && t < segLen - endMargin) {
            rawHits.push({
              t,
              point: pointAtSegT(seg, t, segLen),
              cutter: target,
              isProjected,
            });
          }
        }
      }
    }
  };

  // 1. Interseções físicas reais têm prioridade absoluta
  addHits(true, false);

  // 2. Se modo projetado estiver ativo e não houver interseções reais, busca prolongamentos
  if (rawHits.length === 0 && mode === "projected") {
    addHits(false, true);
  }

  // Ordena por t crescente e remove duplicatas muito próximas
  rawHits.sort((a, b) => a.t - b.t);
  const uniqueHits: SegmentIntersectionHit[] = [];
  for (const h of rawHits) {
    const prev = uniqueHits[uniqueHits.length - 1];
    if (!prev || Math.abs(h.t - prev.t) > DEDUP_TOL) {
      uniqueHits.push(h);
    }
  }

  return uniqueHits;
}

/**
 * Extrai os segmentos de uma polilinha respeitando `closed: true` (inclui o segmento de fechamento).
 */
function getPolylineSegments(poly: Extract<Entity, { type: "polyline" }>): [Vec2, Vec2][] {
  const pts = poly.pts;
  const n = pts.length;
  if (n < 2) return [];
  const segs: [Vec2, Vec2][] = [];
  for (let i = 0; i < n - 1; i++) {
    segs.push([pts[i]!, pts[i + 1]!]);
  }
  if (poly.closed && n >= 3) {
    const first = pts[0]!;
    const last = pts[n - 1]!;
    if (dist(last, first) > EPS) {
      segs.push([last, first]);
    }
  }
  return segs;
}

/**
 * Converte uma cadeia contínua de segmentos `[A_0, B_0], [A_1, B_1], ...` em uma lista de vértices `Vec2[]`.
 */
function chainSegmentsToPoints(chain: [Vec2, Vec2][]): Vec2[] {
  if (chain.length === 0) return [];
  const pts: Vec2[] = [{ x: chain[0]![0].x, y: chain[0]![0].y }];
  for (const seg of chain) {
    const end = seg[1];
    const last = pts[pts.length - 1]!;
    if (dist(last, end) > EPS) {
      pts.push({ x: end.x, y: end.y });
    }
  }
  return pts;
}

/**
 * Constrói uma entidade `polyline` aberta a partir de uma cadeia de segmentos.
 */
function buildOpenPolylineFromChain(
  chain: [Vec2, Vec2][],
  template: Extract<Entity, { type: "polyline" }>,
  keepOriginalId: boolean,
): Entity | null {
  const pts = chainSegmentsToPoints(chain);
  if (pts.length < 2) return null;
  return {
    ...template,
    id: keepOriginalId ? template.id : uid(),
    type: "polyline",
    closed: false,
    pts,
  };
}

/**
 * Calcula o corte exato para uma entidade `line` simples.
 */
function computeSmartTrimForLine(
  target: Extract<Entity, { type: "line" }>,
  allEntities: Entity[],
  click: Vec2,
  mode: TrimBoundaryMode,
): SmartTrimPreview | null {
  const pA: Vec2 = { x: target.x1, y: target.y1 };
  const pB: Vec2 = { x: target.x2, y: target.y2 };
  const seg: [Vec2, Vec2] = [pA, pB];
  const segLen = dist(pA, pB);
  if (segLen < EPS) return null;

  const hits = collectInteriorIntersectionsOnSegment(seg, segLen, target, allEntities, mode);
  if (hits.length === 0) {
    return null;
  }

  const clickT = projectOnSegT(click, seg);

  // Particiona [0, segLen] usando todas as interseções ordenadas
  const boundsT: number[] = [0, ...hits.map((h) => h.t), segLen];
  let intervalIdx = 0;
  for (let i = 0; i < boundsT.length - 1; i++) {
    if (clickT >= boundsT[i]! - EPS && clickT <= boundsT[i + 1]! + EPS) {
      intervalIdx = i;
      break;
    }
  }

  const uA = boundsT[intervalIdx]!;
  const uB = boundsT[intervalIdx + 1]!;
  const ptA = pointAtSegT(seg, uA, segLen);
  const ptB = pointAtSegT(seg, uB, segLen);

  const hasBefore = uA > EPS;
  const hasAfter = segLen - uB > EPS;

  const replacementEntities: Entity[] = [];
  const keptSegments: [Vec2, Vec2][] = [];

  if (hasBefore) {
    replacementEntities.push({
      ...target,
      id: target.id,
      x1: pA.x,
      y1: pA.y,
      x2: ptA.x,
      y2: ptA.y,
    });
    keptSegments.push([pA, ptA]);
  }

  if (hasAfter) {
    const idForAfter = replacementEntities.length === 0 ? target.id : uid();
    replacementEntities.push({
      ...target,
      id: idForAfter,
      x1: ptB.x,
      y1: ptB.y,
      x2: pB.x,
      y2: pB.y,
    });
    keptSegments.push([ptB, pB]);
  }

  // Identifica os pontos de interseção que delimitam o corte
  const leftHit = intervalIdx > 0 ? hits[intervalIdx - 1]! : null;
  const rightHit = intervalIdx < hits.length ? hits[intervalIdx]! : null;
  const primaryHit =
    leftHit && rightHit
      ? Math.abs(clickT - leftHit.t) <= Math.abs(clickT - rightHit.t)
        ? leftHit
        : rightHit
      : (leftHit ?? rightHit)!;
  const secondaryHit = leftHit && rightHit ? (primaryHit === leftHit ? rightHit : leftHit) : null;

  const candidate: SmartTrimCandidate = {
    intersectionPoint: primaryHit.point,
    secondIntersectionPoint: secondaryHit?.point,
    boundaryEntity: primaryHit.cutter,
    trimmedEntity: replacementEntities[0] ?? null,
    extraTrimmedEntities: replacementEntities.length > 1 ? replacementEntities.slice(1) : undefined,
    replacementEntities,
    cutSegment: [ptA, ptB],
    keptSegment: keptSegments[0] ?? [primaryHit.point, primaryHit.point],
    extraKeptSegments: keptSegments.length > 1 ? keptSegments.slice(1) : undefined,
    distanceToClick: dist(click, primaryHit.point),
    isProjected: primaryHit.isProjected,
  };

  return {
    targetEntity: target,
    clickPoint: click,
    activeCandidate: candidate,
    allCandidates: [candidate],
  };
}

/**
 * Calcula o corte exato para uma `polyline` (aberta ou fechada, ex: Retângulo, Polígono, Slot).
 */
function computeSmartTrimForPolyline(
  target: Extract<Entity, { type: "polyline" }>,
  allEntities: Entity[],
  click: Vec2,
  mode: TrimBoundaryMode,
): SmartTrimPreview | null {
  const polySegs = getPolylineSegments(target);
  const M = polySegs.length;
  if (M === 0) return null;

  // Ordena os segmentos da polilinha pela distância ao clique
  const rankedSegs = polySegs
    .map((seg, idx) => ({
      idx,
      seg,
      len: dist(seg[0], seg[1]),
      d: distToSeg(click, seg),
    }))
    .filter((item) => item.len > EPS)
    .sort((a, b) => a.d - b.d);

  if (rankedSegs.length === 0) return null;

  // Avalia o segmento clicado (e caso o clique tenha sido exatamente num vértice/quina onde
  // um segmento não tem interseção mas o segmento vizinho no mesmo vértice tem, permite testar o vizinho próximo)
  const maxAltDist = rankedSegs[0]!.d + 4;

  for (const item of rankedSegs) {
    if (item.d > maxAltDist && item !== rankedSegs[0]) break;

    const segIdx = item.idx;
    const seg = item.seg;
    const segLen = item.len;
    const [pA, pB] = seg;

    const hits = collectInteriorIntersectionsOnSegment(
      seg,
      segLen,
      target,
      allEntities,
      mode,
      segIdx,
    );

    let uA = 0;
    let uB = segLen;
    let primaryPoint: Vec2 | null = null;
    let secondaryPoint: Vec2 | undefined = undefined;
    let boundaryEntity: Entity | null = null;
    let isProjected = false;

    if (hits.length > 0) {
      const clickT = projectOnSegT(click, seg);
      const boundsT: number[] = [0, ...hits.map((h) => h.t), segLen];
      let intervalIdx = 0;
      for (let i = 0; i < boundsT.length - 1; i++) {
        if (clickT >= boundsT[i]! - EPS && clickT <= boundsT[i + 1]! + EPS) {
          intervalIdx = i;
          break;
        }
      }

      uA = boundsT[intervalIdx]!;
      uB = boundsT[intervalIdx + 1]!;

      const leftHit = intervalIdx > 0 ? hits[intervalIdx - 1]! : null;
      const rightHit = intervalIdx < hits.length ? hits[intervalIdx]! : null;
      const primaryHit =
        leftHit && rightHit
          ? Math.abs(clickT - leftHit.t) <= Math.abs(clickT - rightHit.t)
            ? leftHit
            : rightHit
          : (leftHit ?? rightHit)!;
      const secondaryHit =
        leftHit && rightHit ? (primaryHit === leftHit ? rightHit : leftHit) : null;

      primaryPoint = primaryHit.point;
      secondaryPoint = secondaryHit?.point;
      boundaryEntity = primaryHit.cutter;
      isProjected = primaryHit.isProjected;
    } else if (M >= 2) {
      // Sem interseções no interior de `seg`.
      // Verifica se uma das extremidades (pA ou pB) já toca uma entidade cortante externa
      // (por exemplo, um trecho residual após um corte anterior ou uma linha/círculo passando pelo vértice).
      let endpointCutter: Entity | null = null;
      let endpointTouchPt: Vec2 | null = null;
      let bestEndpointDist = Infinity;

      for (const cutter of allEntities) {
        if (!cutter || cutter.id === target.id) continue;
        if (cutter.type === "point" || cutter.type === "text") continue;

        const dA = distPointToEntity(pA, cutter);
        const dB = distPointToEntity(pB, cutter);
        if (dA <= ENDPOINT_TOUCH_TOL && dA < bestEndpointDist) {
          bestEndpointDist = dA;
          endpointCutter = cutter;
          endpointTouchPt = pA;
        }
        if (dB <= ENDPOINT_TOUCH_TOL && dB < bestEndpointDist) {
          bestEndpointDist = dB;
          endpointCutter = cutter;
          endpointTouchPt = pB;
        }
      }

      if (!endpointCutter || !endpointTouchPt) {
        // Esta aresta não possui interseção alguma com outras entidades -> tenta próxima ou aborta
        continue;
      }

      uA = 0;
      uB = segLen;
      primaryPoint = endpointTouchPt;
      boundaryEntity = endpointCutter;
      isProjected = false;
    } else {
      continue;
    }

    const ptA = pointAtSegT(seg, uA, segLen);
    const ptB = pointAtSegT(seg, uB, segLen);

    const beforeSeg: [Vec2, Vec2] | null = uA > EPS ? [pA, ptA] : null;
    const afterSeg: [Vec2, Vec2] | null = segLen - uB > EPS ? [ptB, pB] : null;

    const replacementEntities: Entity[] = [];

    if (target.closed) {
      // Polilinha fechada (ex: Retângulo):
      // Remover um único intervalo [uA, uB] abre o loop fechado numa cadeia contínua aberta:
      // afterSeg -> S_{(segIdx+1)%M} -> ... -> S_{(segIdx+M-1)%M} -> beforeSeg
      const openChain: [Vec2, Vec2][] = [];
      if (afterSeg) openChain.push(afterSeg);
      for (let step = 1; step < M; step++) {
        openChain.push(polySegs[(segIdx + step) % M]!);
      }
      if (beforeSeg) openChain.push(beforeSeg);

      const rebuilt = buildOpenPolylineFromChain(openChain, target, true);
      if (rebuilt) {
        replacementEntities.push(rebuilt);
      }
    } else {
      // Polilinha aberta:
      // Pode resultar em 1 ou 2 cadeias abertas:
      // Cadeia 1: S_0 .. S_{segIdx-1} + beforeSeg
      // Cadeia 2: afterSeg + S_{segIdx+1} .. S_{M-1}
      const chain1: [Vec2, Vec2][] = [];
      for (let i = 0; i < segIdx; i++) {
        chain1.push(polySegs[i]!);
      }
      if (beforeSeg) chain1.push(beforeSeg);

      const chain2: [Vec2, Vec2][] = [];
      if (afterSeg) chain2.push(afterSeg);
      for (let i = segIdx + 1; i < M; i++) {
        chain2.push(polySegs[i]!);
      }

      if (chain1.length > 0) {
        const ent1 = buildOpenPolylineFromChain(chain1, target, true);
        if (ent1) replacementEntities.push(ent1);
      }
      if (chain2.length > 0) {
        const ent2 = buildOpenPolylineFromChain(
          chain2,
          target,
          replacementEntities.length === 0,
        );
        if (ent2) replacementEntities.push(ent2);
      }
    }

    const keptSegments: [Vec2, Vec2][] = [];
    if (beforeSeg) keptSegments.push(beforeSeg);
    if (afterSeg) keptSegments.push(afterSeg);
    if (keptSegments.length === 0 && M >= 2) {
      const nextSeg = polySegs[(segIdx + 1) % M]!;
      keptSegments.push(nextSeg);
    }

    const candidate: SmartTrimCandidate = {
      intersectionPoint: primaryPoint!,
      secondIntersectionPoint: secondaryPoint,
      boundaryEntity: boundaryEntity!,
      trimmedEntity: replacementEntities[0] ?? null,
      extraTrimmedEntities:
        replacementEntities.length > 1 ? replacementEntities.slice(1) : undefined,
      replacementEntities,
      cutSegment: [ptA, ptB],
      keptSegment: keptSegments[0] ?? [primaryPoint!, primaryPoint!],
      extraKeptSegments: keptSegments.length > 1 ? keptSegments.slice(1) : undefined,
      distanceToClick: dist(click, primaryPoint!),
      isProjected,
    };

    return {
      targetEntity: target,
      clickPoint: click,
      activeCandidate: candidate,
      allCandidates: [candidate],
    };
  }

  return null;
}

/**
 * Coleta todas as interseções de um círculo (cx, cy, r) com as demais entidades.
 */
function collectCircleIntersections(
  cx: number,
  cy: number,
  r: number,
  targetId: string,
  allEntities: Entity[],
): { angle: number; point: Vec2; cutter: Entity }[] {
  const hits: { angle: number; point: Vec2; cutter: Entity }[] = [];

  for (const cutter of allEntities) {
    if (!cutter || cutter.id === targetId) continue;
    if (cutter.type === "point" || cutter.type === "text") continue;

    let pts: Vec2[] = [];
    if (cutter.type === "circle") {
      pts = intersectCircleCircle(cx, cy, r, cutter.cx, cutter.cy, cutter.r);
    } else if (cutter.type === "arc") {
      pts = intersectCircleCircle(cx, cy, r, cutter.cx, cutter.cy, cutter.r).filter((p) => {
        const th = Math.atan2(p.y - cutter.cy, p.x - cutter.cx);
        return isAngleOnArcCCW(th, cutter.a0, cutter.a1);
      });
    } else {
      for (const s of segmentsOf(cutter)) {
        pts.push(...intersectSegCircle(s[0], s[1], cx, cy, r));
      }
    }

    for (const pt of pts) {
      const angle = normalizeAngle(Math.atan2(pt.y - cy, pt.x - cx));
      if (!hits.some((h) => Math.abs(h.angle - angle) < 1e-3 || Math.abs(Math.abs(h.angle - angle) - TWO_PI) < 1e-3)) {
        hits.push({ angle, point: pt, cutter });
      }
    }
  }

  hits.sort((a, b) => a.angle - b.angle);
  return hits;
}

/**
 * Calcula o corte para um `circle` (converte o círculo em `arc` removendo o arco clicado entre duas interseções).
 */
function computeSmartTrimForCircle(
  target: Extract<Entity, { type: "circle" }>,
  allEntities: Entity[],
  click: Vec2,
): SmartTrimPreview | null {
  const hits = collectCircleIntersections(target.cx, target.cy, target.r, target.id, allEntities);
  // Um círculo fechado precisa de pelo menos 2 interseções distintas para destacar um arco
  if (hits.length < 2) return null;

  const clickAngle = normalizeAngle(Math.atan2(click.y - target.cy, click.x - target.cx));
  const k = hits.length;

  let intervalIdx = k - 1;
  for (let i = 0; i < k - 1; i++) {
    if (clickAngle >= hits[i]!.angle && clickAngle <= hits[i + 1]!.angle) {
      intervalIdx = i;
      break;
    }
  }

  const startHit = hits[intervalIdx]!;
  const endHit = hits[(intervalIdx + 1) % k]!;

  // O trecho clicado vai de startHit.angle (CCW) até endHit.angle.
  // O arco mantido é o complementar: de endHit.angle (CCW) até startHit.angle!
  const remainingArc: Entity = {
    id: target.id,
    layer: target.layer,
    group: target.group,
    params: target.params,
    type: "arc",
    cx: target.cx,
    cy: target.cy,
    r: target.r,
    a0: endHit.angle,
    a1: startHit.angle,
    ccw: true,
  };

  const dStart = dist(click, startHit.point);
  const dEnd = dist(click, endHit.point);
  const primaryHit = dStart <= dEnd ? startHit : endHit;
  const secondaryHit = dStart <= dEnd ? endHit : startHit;

  const candidate: SmartTrimCandidate = {
    intersectionPoint: primaryHit.point,
    secondIntersectionPoint: secondaryHit.point,
    boundaryEntity: primaryHit.cutter,
    trimmedEntity: remainingArc,
    replacementEntities: [remainingArc],
    cutSegment: [startHit.point, endHit.point],
    keptSegment: [endHit.point, startHit.point],
    distanceToClick: Math.min(dStart, dEnd),
    isProjected: false,
  };

  return {
    targetEntity: target,
    clickPoint: click,
    activeCandidate: candidate,
    allCandidates: [candidate],
  };
}

/**
 * Calcula o corte para um `arc`.
 */
function computeSmartTrimForArc(
  target: Extract<Entity, { type: "arc" }>,
  allEntities: Entity[],
  click: Vec2,
): SmartTrimPreview | null {
  const startAngle = normalizeAngle(target.a0);
  let endAngle = normalizeAngle(target.a1);
  if (endAngle <= startAngle + 1e-9) endAngle += TWO_PI;
  const totalSweep = endAngle - startAngle;
  if (totalSweep < 1e-4) return null;

  const toOffset = (angle: number): number => {
    let a = normalizeAngle(angle);
    if (a < startAngle - 1e-5) a += TWO_PI;
    return a - startAngle;
  };

  const rawHits = collectCircleIntersections(target.cx, target.cy, target.r, target.id, allEntities);
  const arcHits = rawHits
    .map((h) => ({ ...h, offset: toOffset(h.angle) }))
    .filter((h) => h.offset > 1e-3 && h.offset < totalSweep - 1e-3)
    .sort((a, b) => a.offset - b.offset);

  if (arcHits.length === 0) return null;

  const clickOffset = Math.max(0, Math.min(totalSweep, toOffset(Math.atan2(click.y - target.cy, click.x - target.cx))));
  const bounds: number[] = [0, ...arcHits.map((h) => h.offset), totalSweep];

  let intervalIdx = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (clickOffset >= bounds[i]! - 1e-4 && clickOffset <= bounds[i + 1]! + 1e-4) {
      intervalIdx = i;
      break;
    }
  }

  const uA = bounds[intervalIdx]!;
  const uB = bounds[intervalIdx + 1]!;
  const hasBefore = uA > 1e-3;
  const hasAfter = totalSweep - uB > 1e-3;

  const replacementEntities: Entity[] = [];
  if (hasBefore) {
    replacementEntities.push({
      ...target,
      id: target.id,
      a0: normalizeAngle(startAngle),
      a1: normalizeAngle(startAngle + uA),
      ccw: true,
    });
  }
  if (hasAfter) {
    replacementEntities.push({
      ...target,
      id: replacementEntities.length === 0 ? target.id : uid(),
      a0: normalizeAngle(startAngle + uB),
      a1: normalizeAngle(startAngle + totalSweep),
      ccw: true,
    });
  }

  const ptAtOffset = (off: number): Vec2 => ({
    x: target.cx + target.r * Math.cos(startAngle + off),
    y: target.cy + target.r * Math.sin(startAngle + off),
  });

  const ptA = ptAtOffset(uA);
  const ptB = ptAtOffset(uB);
  const pStart = ptAtOffset(0);
  const pEnd = ptAtOffset(totalSweep);

  const leftHit = intervalIdx > 0 ? arcHits[intervalIdx - 1]! : null;
  const rightHit = intervalIdx < arcHits.length ? arcHits[intervalIdx]! : null;
  const primaryHit =
    leftHit && rightHit
      ? Math.abs(clickOffset - leftHit.offset) <= Math.abs(clickOffset - rightHit.offset)
        ? leftHit
        : rightHit
      : (leftHit ?? rightHit)!;
  const secondaryHit = leftHit && rightHit ? (primaryHit === leftHit ? rightHit : leftHit) : null;

  const keptSegments: [Vec2, Vec2][] = [];
  if (hasBefore) keptSegments.push([pStart, ptA]);
  if (hasAfter) keptSegments.push([ptB, pEnd]);

  const candidate: SmartTrimCandidate = {
    intersectionPoint: primaryHit.point,
    secondIntersectionPoint: secondaryHit?.point,
    boundaryEntity: primaryHit.cutter,
    trimmedEntity: replacementEntities[0] ?? null,
    extraTrimmedEntities:
      replacementEntities.length > 1 ? replacementEntities.slice(1) : undefined,
    replacementEntities,
    cutSegment: [ptA, ptB],
    keptSegment: keptSegments[0] ?? [primaryHit.point, primaryHit.point],
    extraKeptSegments: keptSegments.length > 1 ? keptSegments.slice(1) : undefined,
    distanceToClick: dist(click, primaryHit.point),
    isProjected: false,
  };

  return {
    targetEntity: target,
    clickPoint: click,
    activeCandidate: candidate,
    allCandidates: [candidate],
  };
}

/**
 * Calcula o corte inteligente (Trim / Smart Trim) para uma entidade alvo clicada em `clickPoint`.
 */
export function computeSmartTrim(
  target: Entity,
  allEntities: Entity[],
  clickPoint: Vec2,
  mode: TrimBoundaryMode = "real",
): SmartTrimPreview | null {
  if (target.type === "line") {
    return computeSmartTrimForLine(target, allEntities, clickPoint, mode);
  }
  if (target.type === "polyline") {
    return computeSmartTrimForPolyline(target, allEntities, clickPoint, mode);
  }
  if (target.type === "circle") {
    return computeSmartTrimForCircle(target, allEntities, clickPoint);
  }
  if (target.type === "arc") {
    return computeSmartTrimForArc(target, allEntities, clickPoint);
  }
  return null;
}
