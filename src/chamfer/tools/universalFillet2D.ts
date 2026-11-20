/**
 * CALDRA CHAMFER — MOTOR DE FILLET 2D UNIVERSAL (ANALÍTICO EXATO)
 *
 * Resolve concordâncias tangentes exatas (arcos reais `type: "arc"`, ZERO facetamento)
 * em TODOS os contextos geométricos:
 *   1. Linha × Linha (incluindo segmentos de Retângulo ou Polilinha);
 *   2. Linha × Círculo ou Arco (concordância externa e interna);
 *   3. Círculo/Arco × Círculo/Arco (externo–externo, interno–interno, mistos);
 *   4. Seleção inteligente pelo ponto clicado + alternância de soluções (`solutionIndex`);
 *   5. Diagnóstico geométrico preciso quando R_f excede o limite viável (`maxRadiusMm`).
 */

import { dist, uid, type Entity, type Vec2 } from "@/lib/lab2d/core";

const TWO_PI = Math.PI * 2;
const EPS = 1e-6;

export type FilletPrimitive =
  | {
      kind: "line";
      entityId: string;
      layer: string;
      p1: Vec2;
      p2: Vec2;
      sourceType: "line" | "polyline";
      polylineSegIndex?: number;
      originalEntity: Entity;
    }
  | {
      kind: "circle" | "arc";
      entityId: string;
      layer: string;
      cx: number;
      cy: number;
      r: number;
      a0: number;
      a1: number;
      isFullCircle: boolean;
      originalEntity: Entity;
    };

export interface UniversalFilletSolution {
  /** Centro exato do arco de concordância */
  arcCenter: Vec2;
  /** Raio exato do arco de concordância */
  radius: number;
  /** Ângulo inicial (rad) no padrão CHAMFER (sweep positivo de a0 -> a1) */
  startAngle: number;
  /** Ângulo final (rad) no padrão CHAMFER */
  endAngle: number;
  /** Ponto de tangência exato na Entidade A */
  tangentA: Vec2;
  /** Ponto de tangência exato na Entidade B */
  tangentB: Vec2;
  /** Ponto médio real sobre o arco de concordância */
  arcMidpoint: Vec2;
  /** Tipo de concordância */
  pairKind: "line-line" | "line-circle" | "circle-circle";
  /** Entidade A já aparada/ajustada até tangentA (pode virar array se polilinha for decomposta) */
  trimmedA: Entity[];
  /** Entidade B já aparada/ajustada até tangentB */
  trimmedB: Entity[];
  /** Arco geométrico real resultante (`type: "arc"`) */
  filletArc: Extract<Entity, { type: "arc" }>;
  /** Lista completa de entidades resultante após aplicar o fillet */
  updatedEntities: Entity[];
  /** Pontuação de proximidade aos cliques do usuário (menor = melhor) */
  score: number;
  /** Descrição curta da solução (ex.: "Externa", "Interna") */
  variantLabel: string;
}

export interface UniversalFilletResult {
  ok: boolean;
  solutions: UniversalFilletSolution[];
  activeIndex: number;
  activeSolution: UniversalFilletSolution | null;
  error?: string;
  maxRadiusMm?: number;
}

export interface FilletTargetHit {
  entity: Entity;
  clickPoint: Vec2;
  primitive: FilletPrimitive;
  distance: number;
}

/* ------------------------------------------------------------------ helpers */

function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

function ccwSweep(a0: number, a1: number): number {
  let s = normAngle(a1) - normAngle(a0);
  if (s < 0) s += TWO_PI;
  return s;
}

function isAngleOnArc(theta: number, a0: number, a1: number, tol = 1e-4): boolean {
  const start = normAngle(a0);
  let end = normAngle(a1);
  if (end <= start + 1e-9) end += TWO_PI;
  let cur = normAngle(theta);
  if (cur < start - tol) cur += TWO_PI;
  return cur >= start - tol && cur <= end + tol;
}

function pointOnCircle(cx: number, cy: number, r: number, angle: number): Vec2 {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function projectPointOnInfiniteLine(p: Vec2, a: Vec2, b: Vec2): { pt: Vec2; t: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { pt: { ...a }, t: 0, len: 0 };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
  return { pt: { x: a.x + t * dx, y: a.y + t * dy }, t, len };
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const proj = projectPointOnInfiniteLine(p, a, b);
  const ct = Math.max(0, Math.min(1, proj.t));
  const q = { x: a.x + ct * (b.x - a.x), y: a.y + ct * (b.y - a.y) };
  return dist(p, q);
}

function infiniteLineIntersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

/** Interseção entre reta infinita (p1->p2) e círculo (cx, cy, r) */
function intersectInfiniteLineCircle(
  p1: Vec2,
  p2: Vec2,
  cx: number,
  cy: number,
  r: number,
): Vec2[] {
  if (r < 0) return [];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return [];
  const fx = p1.x - cx;
  const fy = p1.y - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * lenSq * c;
  if (disc < -1e-6) return [];
  if (Math.abs(disc) <= 1e-6) {
    const t = -b / (2 * lenSq);
    return [{ x: p1.x + t * dx, y: p1.y + t * dy }];
  }
  const sq = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sq) / (2 * lenSq);
  const t2 = (-b + sq) / (2 * lenSq);
  return [
    { x: p1.x + t1 * dx, y: p1.y + t1 * dy },
    { x: p1.x + t2 * dx, y: p1.y + t2 * dy },
  ];
}

/** Interseção analítica entre dois círculos */
function intersectTwoCircles(
  c1x: number,
  c1y: number,
  r1: number,
  c2x: number,
  c2y: number,
  r2: number,
): Vec2[] {
  if (r1 < 0 || r2 < 0) return [];
  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-8) return [];
  if (d > r1 + r2 + 1e-5) return [];
  if (d < Math.abs(r1 - r2) - 1e-5) return [];

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = hSq > 1e-10 ? Math.sqrt(hSq) : 0;
  const mx = c1x + (a * dx) / d;
  const my = c1y + (a * dy) / d;
  if (h <= 1e-6) return [{ x: mx, y: my }];
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    { x: mx + rx, y: my + ry },
    { x: mx - rx, y: my - ry },
  ];
}

/** Escolhe o menor arco (<= PI) entre dois pontos de tangência sobre círculo (center, r) */
function buildMinorArcAngles(
  center: Vec2,
  r: number,
  tA: Vec2,
  tB: Vec2,
  biasPoint?: Vec2,
): { startAngle: number; endAngle: number; midpoint: Vec2; sweep: number } {
  const angA = normAngle(Math.atan2(tA.y - center.y, tA.x - center.x));
  const angB = normAngle(Math.atan2(tB.y - center.y, tB.x - center.x));
  const sAB = ccwSweep(angA, angB);
  const sBA = ccwSweep(angB, angA);

  const midAB = pointOnCircle(center.x, center.y, r, angA + sAB / 2);
  const midBA = pointOnCircle(center.x, center.y, r, angB + sBA / 2);

  // Se forem aproximadamente semi-círculo (PI), usa biasPoint
  if (Math.abs(sAB - Math.PI) < 1e-3 && biasPoint) {
    if (dist(midAB, biasPoint) <= dist(midBA, biasPoint)) {
      return { startAngle: angA, endAngle: angB, midpoint: midAB, sweep: sAB };
    }
    return { startAngle: angB, endAngle: angA, midpoint: midBA, sweep: sBA };
  }

  if (sAB <= sBA) {
    return { startAngle: angA, endAngle: angB, midpoint: midAB, sweep: sAB };
  }
  return { startAngle: angB, endAngle: angA, midpoint: midBA, sweep: sBA };
}

/* ----------------------------------------------------- primitive extraction */

export function getPolylineSegmentsWithIndex(
  poly: Extract<Entity, { type: "polyline" }>,
): { index: number; p1: Vec2; p2: Vec2 }[] {
  const pts = poly.pts;
  const n = pts.length;
  if (n < 2) return [];
  const out: { index: number; p1: Vec2; p2: Vec2 }[] = [];
  for (let i = 0; i < n - 1; i++) {
    out.push({ index: i, p1: pts[i]!, p2: pts[i + 1]! });
  }
  if (poly.closed && n >= 3 && dist(pts[n - 1]!, pts[0]!) > 1e-5) {
    out.push({ index: n - 1, p1: pts[n - 1]!, p2: pts[0]! });
  }
  return out;
}

/** Extrai a primitiva geométrica mais próxima do ponto clicado para uma entidade */
export function extractFilletPrimitive(
  entity: Entity,
  clickPoint: Vec2,
): FilletTargetHit | null {
  if (entity.type === "line") {
    const p1 = { x: entity.x1, y: entity.y1 };
    const p2 = { x: entity.x2, y: entity.y2 };
    if (dist(p1, p2) < 1e-4) return null;
    return {
      entity,
      clickPoint,
      distance: distToSegment(clickPoint, p1, p2),
      primitive: {
        kind: "line",
        entityId: entity.id,
        layer: entity.layer,
        p1,
        p2,
        sourceType: "line",
        originalEntity: entity,
      },
    };
  }
  if (entity.type === "circle") {
    if (entity.r <= 1e-4) return null;
    const d = Math.abs(dist(clickPoint, { x: entity.cx, y: entity.cy }) - entity.r);
    return {
      entity,
      clickPoint,
      distance: d,
      primitive: {
        kind: "circle",
        entityId: entity.id,
        layer: entity.layer,
        cx: entity.cx,
        cy: entity.cy,
        r: entity.r,
        a0: 0,
        a1: TWO_PI,
        isFullCircle: true,
        originalEntity: entity,
      },
    };
  }
  if (entity.type === "arc") {
    if (entity.r <= 1e-4) return null;
    const theta = Math.atan2(clickPoint.y - entity.cy, clickPoint.x - entity.cx);
    let d: number;
    if (isAngleOnArc(theta, entity.a0, entity.a1, 1e-3)) {
      d = Math.abs(dist(clickPoint, { x: entity.cx, y: entity.cy }) - entity.r);
    } else {
      const p0 = pointOnCircle(entity.cx, entity.cy, entity.r, entity.a0);
      const p1 = pointOnCircle(entity.cx, entity.cy, entity.r, entity.a1);
      d = Math.min(dist(clickPoint, p0), dist(clickPoint, p1));
    }
    return {
      entity,
      clickPoint,
      distance: d,
      primitive: {
        kind: "arc",
        entityId: entity.id,
        layer: entity.layer,
        cx: entity.cx,
        cy: entity.cy,
        r: entity.r,
        a0: entity.a0,
        a1: entity.a1,
        isFullCircle: false,
        originalEntity: entity,
      },
    };
  }
  if (entity.type === "polyline") {
    const segs = getPolylineSegmentsWithIndex(entity);
    if (segs.length === 0) return null;
    let bestSeg = segs[0]!;
    let bestD = Infinity;
    for (const seg of segs) {
      if (dist(seg.p1, seg.p2) < 1e-4) continue;
      const d = distToSegment(clickPoint, seg.p1, seg.p2);
      if (d < bestD) {
        bestD = d;
        bestSeg = seg;
      }
    }
    if (!Number.isFinite(bestD)) return null;
    return {
      entity,
      clickPoint,
      distance: bestD,
      primitive: {
        kind: "line",
        entityId: entity.id,
        layer: entity.layer,
        p1: bestSeg.p1,
        p2: bestSeg.p2,
        sourceType: "polyline",
        polylineSegIndex: bestSeg.index,
        originalEntity: entity,
      },
    };
  }
  return null;
}

/** Localiza a entidade clicável de fillet mais próxima de `clickPoint` */
export function findFilletTargetAtPoint(
  clickPoint: Vec2,
  entities: Entity[],
  tol: number,
  excludeEntityId?: string,
): FilletTargetHit | null {
  let best: FilletTargetHit | null = null;
  for (const e of entities) {
    if (excludeEntityId && e.id === excludeEntityId) continue;
    const hit = extractFilletPrimitive(e, clickPoint);
    if (!hit) continue;
    if (hit.distance <= tol && (!best || hit.distance < best.distance)) {
      best = hit;
    }
  }
  return best;
}

/* ----------------------------------------------------- trimming helpers */

/**
 * Apara (ou estende) uma linha até o ponto de tangência `tangentPt`,
 * preservando o lado onde o usuário clicou (`keepSidePt`).
 */
function trimLinePrimitive(
  prim: Extract<FilletPrimitive, { kind: "line" }>,
  tangentPt: Vec2,
  keepSidePt: Vec2,
): Entity[] {
  const projKeep = projectPointOnInfiniteLine(keepSidePt, prim.p1, prim.p2).t;
  const projTan = projectPointOnInfiniteLine(tangentPt, prim.p1, prim.p2).t;

  // Escolhe qual extremidade manter com base no lado clicado pelo usuário relativo a tangentPt
  let keptEnd: Vec2;
  if (Math.abs(projKeep - projTan) > 1e-4) {
    keptEnd = projKeep < projTan ? prim.p1 : prim.p2;
  } else {
    keptEnd = dist(keepSidePt, prim.p1) <= dist(keepSidePt, prim.p2) ? prim.p1 : prim.p2;
  }

  const trimmedSeg: [Vec2, Vec2] =
    keptEnd === prim.p1 ? [prim.p1, tangentPt] : [tangentPt, prim.p2];

  if (prim.sourceType === "line") {
    const orig = prim.originalEntity as Extract<Entity, { type: "line" }>;
    if (dist(trimmedSeg[0], trimmedSeg[1]) < 1e-4) return [];
    return [
      {
        ...orig,
        x1: trimmedSeg[0].x,
        y1: trimmedSeg[0].y,
        x2: trimmedSeg[1].x,
        y2: trimmedSeg[1].y,
      },
    ];
  }

  // Polilinha: substitui apenas o segmento envolvido preservando os demais lados como linhas/polilinha limpa
  const poly = prim.originalEntity as Extract<Entity, { type: "polyline" }>;
  const segs = getPolylineSegmentsWithIndex(poly);
  const segIdx = prim.polylineSegIndex ?? 0;
  const out: Entity[] = [];
  for (const s of segs) {
    if (s.index === segIdx) {
      if (dist(trimmedSeg[0], trimmedSeg[1]) > 1e-4) {
        out.push({
          id: poly.id,
          layer: poly.layer,
          group: poly.group,
          type: "line",
          x1: trimmedSeg[0].x,
          y1: trimmedSeg[0].y,
          x2: trimmedSeg[1].x,
          y2: trimmedSeg[1].y,
        });
      }
    } else if (dist(s.p1, s.p2) > 1e-4) {
      out.push({
        id: uid(),
        layer: poly.layer,
        group: poly.group,
        type: "line",
        x1: s.p1.x,
        y1: s.p1.y,
        x2: s.p2.x,
        y2: s.p2.y,
      });
    }
  }
  return out;
}

/**
 * Apara um arco ou círculo exatamente no ponto de tangência `tangentPt`,
 * mantendo o lado onde o usuário clicou (`keepSidePt`).
 * - Para `circle`: mantém o círculo intacto se apenas 1 ponto de tangência (ou se houver 2 cortes no futuro pelo TRIM);
 *   melhor ainda: para concordância em círculo completo, mantém o círculo se não há outro ponto de corte,
 *   OU se o usuário clicou em um arco, apara o arco exatamente até `tangentPt` mantendo o lado clicado!
 */
function trimCircleOrArcPrimitive(
  prim: Extract<FilletPrimitive, { kind: "circle" | "arc" }>,
  tangentPt: Vec2,
  keepSidePt: Vec2,
): Entity[] {
  const tanAngle = normAngle(Math.atan2(tangentPt.y - prim.cy, tangentPt.x - prim.cx));

  if (prim.isFullCircle) {
    // Um círculo fechado sem outro ponto de corte só pode ser mantido fechado (1 ponto não corta círculo em 2),
    // preservando integridade geométrica para o usuário aparar a sobra se desejar.
    return [prim.originalEntity];
  }

  const orig = prim.originalEntity as Extract<Entity, { type: "arc" }>;
  const start = normAngle(orig.a0);
  const totalSweep = ccwSweep(orig.a0, orig.a1);
  if (totalSweep < 1e-4) return [orig];

  const toOffset = (ang: number) => {
    let d = normAngle(ang) - start;
    if (d < -1e-5) d += TWO_PI;
    return d;
  };

  const tanOff = toOffset(tanAngle);
  const clickAng = normAngle(Math.atan2(keepSidePt.y - prim.cy, keepSidePt.x - prim.cx));
  const clickOff = toOffset(clickAng);

  // Se o ponto de tangência está dentro do arco, corta o lado oposto ao clique
  if (tanOff > 1e-4 && tanOff < totalSweep - 1e-4) {
    const keepFirstHalf =
      clickOff <= totalSweep + 0.5
        ? clickOff <= tanOff
        : dist(keepSidePt, pointOnCircle(prim.cx, prim.cy, prim.r, orig.a0)) <=
          dist(keepSidePt, pointOnCircle(prim.cx, prim.cy, prim.r, orig.a1));

    if (keepFirstHalf) {
      return [
        {
          ...orig,
          a0: start,
          a1: tanAngle,
        },
      ];
    }
    return [
      {
        ...orig,
        a0: tanAngle,
        a1: normAngle(orig.a1),
      },
    ];
  }

  // Se o ponto de tangência cai fora do arco atual, estende a extremidade mais próxima até tanAngle
  const p0 = pointOnCircle(prim.cx, prim.cy, prim.r, orig.a0);
  const p1 = pointOnCircle(prim.cx, prim.cy, prim.r, orig.a1);
  if (dist(tangentPt, p0) <= dist(tangentPt, p1)) {
    return [{ ...orig, a0: tanAngle, a1: normAngle(orig.a1) }];
  }
  return [{ ...orig, a0: start, a1: tanAngle }];
}

/**
 * Caso especial: dois segmentos adjacentes da MESMA polilinha (ex.: canto de Retângulo R8).
 * Decompõe a polilinha em segmentos limpos + ARCO REAL (`type: "arc"`), ZERO facetamento!
 */
function solveSamePolylineCornerFillet(
  poly: Extract<Entity, { type: "polyline" }>,
  segIdxA: number,
  segIdxB: number,
  radius: number,
  allEntities: Entity[],
): UniversalFilletResult {
  const segs = getPolylineSegmentsWithIndex(poly);
  const m = segs.length;
  if (m < 2 || segIdxA === segIdxB) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Selecione dois lados distintos do contorno.",
    };
  }

  const sA = segs.find((s) => s.index === segIdxA);
  const sB = segs.find((s) => s.index === segIdxB);
  if (!sA || !sB) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Segmentos da polilinha não encontrados.",
    };
  }

  // Identifica vértice compartilhado (ou interseção)
  let corner: Vec2 | null = null;
  let farA: Vec2 = sA.p1;
  let farB: Vec2 = sB.p2;
  const tol = 1e-3;
  if (dist(sA.p2, sB.p1) <= tol) {
    corner = { x: (sA.p2.x + sB.p1.x) / 2, y: (sA.p2.y + sB.p1.y) / 2 };
    farA = sA.p1;
    farB = sB.p2;
  } else if (dist(sA.p1, sB.p2) <= tol) {
    corner = { x: (sA.p1.x + sB.p2.x) / 2, y: (sA.p1.y + sB.p2.y) / 2 };
    farA = sA.p2;
    farB = sB.p1;
  } else if (dist(sA.p1, sB.p1) <= tol) {
    corner = { x: (sA.p1.x + sB.p1.x) / 2, y: (sA.p1.y + sB.p1.y) / 2 };
    farA = sA.p2;
    farB = sB.p2;
  } else if (dist(sA.p2, sB.p2) <= tol) {
    corner = { x: (sA.p2.x + sB.p2.x) / 2, y: (sA.p2.y + sB.p2.y) / 2 };
    farA = sA.p1;
    farB = sB.p1;
  }

  if (!corner) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Os lados selecionados da polilinha não formam uma quina adjacente.",
    };
  }

  const lenA = dist(corner, farA);
  const lenB = dist(corner, farB);
  const dirA = { x: (farA.x - corner.x) / lenA, y: (farA.y - corner.y) / lenA };
  const dirB = { x: (farB.x - corner.x) / lenB, y: (farB.y - corner.y) / lenB };
  const dot = Math.max(-1, Math.min(1, dirA.x * dirB.x + dirA.y * dirB.y));
  const alpha = Math.acos(dot);
  if (alpha < 0.02 || alpha > Math.PI - 0.02) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Lados colineares não permitem concordância.",
    };
  }

  const tanHalf = Math.tan(alpha / 2);
  const sinHalf = Math.sin(alpha / 2);
  const maxR = Number((Math.min(lenA, lenB) * tanHalf).toFixed(2));
  const tDist = radius / tanHalf;
  if (tDist > Math.min(lenA, lenB) + 1e-4) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      maxRadiusMm: maxR,
      error: `Raio R${radius} excede o limite geométrico (máx. ~${maxR} mm)`,
    };
  }

  const tA: Vec2 = { x: corner.x + dirA.x * tDist, y: corner.y + dirA.y * tDist };
  const tB: Vec2 = { x: corner.x + dirB.x * tDist, y: corner.y + dirB.y * tDist };
  const bis = { x: dirA.x + dirB.x, y: dirA.y + dirB.y };
  const bisLen = Math.hypot(bis.x, bis.y) || 1;
  const centerDist = radius / sinHalf;
  const arcCenter: Vec2 = {
    x: corner.x + (bis.x / bisLen) * centerDist,
    y: corner.y + (bis.y / bisLen) * centerDist,
  };
  const arcInfo = buildMinorArcAngles(arcCenter, radius, tA, tB, corner);

  const filletArc: Extract<Entity, { type: "arc" }> = {
    id: uid(),
    layer: poly.layer,
    group: poly.group,
    type: "arc",
    cx: arcCenter.x,
    cy: arcCenter.y,
    r: radius,
    a0: arcInfo.startAngle,
    a1: arcInfo.endAngle,
  };

  // Decompõe apenas em segmentos retos exatos + arco real (sem polilinha facetada!)
  const replacementLines: Entity[] = [];
  for (const s of segs) {
    let p1 = s.p1;
    let p2 = s.p2;
    if (s.index === segIdxA) {
      p1 = dist(s.p1, corner) < dist(s.p2, corner) ? tA : s.p1;
      p2 = dist(s.p1, corner) < dist(s.p2, corner) ? s.p2 : tA;
    } else if (s.index === segIdxB) {
      p1 = dist(s.p1, corner) < dist(s.p2, corner) ? tB : s.p1;
      p2 = dist(s.p1, corner) < dist(s.p2, corner) ? s.p2 : tB;
    }
    if (dist(p1, p2) > 1e-4) {
      replacementLines.push({
        id: replacementLines.length === 0 ? poly.id : uid(),
        layer: poly.layer,
        group: poly.group,
        type: "line",
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      });
    }
  }

  const updatedEntities: Entity[] = [];
  for (const e of allEntities) {
    if (e.id === poly.id) {
      updatedEntities.push(...replacementLines, filletArc);
    } else {
      updatedEntities.push(e);
    }
  }

  const sol: UniversalFilletSolution = {
    arcCenter,
    radius,
    startAngle: arcInfo.startAngle,
    endAngle: arcInfo.endAngle,
    tangentA: tA,
    tangentB: tB,
    arcMidpoint: arcInfo.midpoint,
    pairKind: "line-line",
    trimmedA: replacementLines,
    trimmedB: [],
    filletArc,
    updatedEntities,
    score: 0,
    variantLabel: "Canto Interno",
  };

  return {
    ok: true,
    solutions: [sol],
    activeIndex: 0,
    activeSolution: sol,
  };
}

/* --------------------------------------------------- core analytical solvers */

function buildUpdatedEntitiesList(
  allEntities: Entity[],
  idA: string,
  trimmedA: Entity[],
  idB: string,
  trimmedB: Entity[],
  filletArc: Extract<Entity, { type: "arc" }>,
): Entity[] {
  const out: Entity[] = [];
  for (const e of allEntities) {
    if (e.id === idA) {
      out.push(...trimmedA);
    } else if (e.id === idB) {
      out.push(...trimmedB);
    } else {
      out.push(e);
    }
  }
  out.push(filletArc);
  return out;
}

/** Caso 1: Linha × Linha */
function solveLineLineFillet(
  primA: Extract<FilletPrimitive, { kind: "line" }>,
  primB: Extract<FilletPrimitive, { kind: "line" }>,
  clickA: Vec2,
  clickB: Vec2,
  radius: number,
  allEntities: Entity[],
): UniversalFilletResult {
  // Se forem dois lados da mesma polilinha
  if (primA.entityId === primB.entityId && primA.sourceType === "polyline") {
    return solveSamePolylineCornerFillet(
      primA.originalEntity as Extract<Entity, { type: "polyline" }>,
      primA.polylineSegIndex ?? 0,
      primB.polylineSegIndex ?? 0,
      radius,
      allEntities,
    );
  }

  const inter = infiniteLineIntersection(primA.p1, primA.p2, primB.p1, primB.p2);
  if (!inter) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "As duas linhas são paralelas e não possuem interseção.",
    };
  }

  // Direção escolhida em cada linha a partir da interseção rumo ao clique (ou extremidade mais longa)
  const dirFromInter = (p1: Vec2, p2: Vec2, click: Vec2): { dir: Vec2; farEnd: Vec2; len: number } => {
    const d1 = dist(inter, p1);
    const d2 = dist(inter, p2);
    // Verifica se o clique está de um lado claro da interseção
    const uLine = {
      x: (p2.x - p1.x) / (dist(p1, p2) || 1),
      y: (p2.y - p1.y) / (dist(p1, p2) || 1),
    };
    const clickDot = (click.x - inter.x) * uLine.x + (click.y - inter.y) * uLine.y;
    const p1Dot = (p1.x - inter.x) * uLine.x + (p1.y - inter.y) * uLine.y;
    const p2Dot = (p2.x - inter.x) * uLine.x + (p2.y - inter.y) * uLine.y;

    let farEnd: Vec2;
    if (Math.abs(clickDot) > 0.5) {
      if (clickDot > 0) {
        farEnd = p2Dot > p1Dot ? p2 : p1;
      } else {
        farEnd = p1Dot < p2Dot ? p1 : p2;
      }
      // Se o farEnd selecionado coincide com a interseção, pega o outro lado
      if (dist(inter, farEnd) < 1e-3) {
        farEnd = farEnd === p1 ? p2 : p1;
      }
    } else {
      farEnd = d1 >= d2 ? p1 : p2;
    }

    const len = dist(inter, farEnd);
    const dir = { x: (farEnd.x - inter.x) / (len || 1), y: (farEnd.y - inter.y) / (len || 1) };
    return { dir, farEnd, len };
  };

  const legA = dirFromInter(primA.p1, primA.p2, clickA);
  const legB = dirFromInter(primB.p1, primB.p2, clickB);

  const dot = Math.max(-1, Math.min(1, legA.dir.x * legB.dir.x + legA.dir.y * legB.dir.y));
  const alpha = Math.acos(dot);
  if (alpha < 0.02 || alpha > Math.PI - 0.02) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Linhas colineares não permitem concordância.",
    };
  }

  const tanHalf = Math.tan(alpha / 2);
  const sinHalf = Math.sin(alpha / 2);
  const maxR = Number((Math.min(legA.len, legB.len) * tanHalf).toFixed(2));
  const tDist = radius / tanHalf;

  if (tDist > Math.min(legA.len, legB.len) + 1e-4) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      maxRadiusMm: maxR,
      error: `Raio R${radius} excede o limite geométrico (máx. ~${maxR} mm)`,
    };
  }

  const tA: Vec2 = { x: inter.x + legA.dir.x * tDist, y: inter.y + legA.dir.y * tDist };
  const tB: Vec2 = { x: inter.x + legB.dir.x * tDist, y: inter.y + legB.dir.y * tDist };
  const bis = { x: legA.dir.x + legB.dir.x, y: legA.dir.y + legB.dir.y };
  const bisLen = Math.hypot(bis.x, bis.y) || 1;
  const centerDist = radius / sinHalf;
  const arcCenter: Vec2 = {
    x: inter.x + (bis.x / bisLen) * centerDist,
    y: inter.y + (bis.y / bisLen) * centerDist,
  };
  const arcInfo = buildMinorArcAngles(arcCenter, radius, tA, tB, inter);

  const filletArc: Extract<Entity, { type: "arc" }> = {
    id: uid(),
    layer: primA.layer,
    type: "arc",
    cx: arcCenter.x,
    cy: arcCenter.y,
    r: radius,
    a0: arcInfo.startAngle,
    a1: arcInfo.endAngle,
  };

  // Para trim exato: mantém a extremidade `farEnd` em cada linha!
  const trimmedA = trimLinePrimitive(primA, tA, legA.farEnd);
  const trimmedB = trimLinePrimitive(primB, tB, legB.farEnd);
  const updatedEntities = buildUpdatedEntitiesList(
    allEntities,
    primA.entityId,
    trimmedA,
    primB.entityId,
    trimmedB,
    filletArc,
  );

  const sol: UniversalFilletSolution = {
    arcCenter,
    radius,
    startAngle: arcInfo.startAngle,
    endAngle: arcInfo.endAngle,
    tangentA: tA,
    tangentB: tB,
    arcMidpoint: arcInfo.midpoint,
    pairKind: "line-line",
    trimmedA,
    trimmedB,
    filletArc,
    updatedEntities,
    score: dist(tA, clickA) + dist(tB, clickB),
    variantLabel: "Quadrante Ativo",
  };

  return {
    ok: true,
    solutions: [sol],
    activeIndex: 0,
    activeSolution: sol,
  };
}

/** Caso 2: Linha × Círculo ou Arco */
function solveLineCircleFillet(
  linePrim: Extract<FilletPrimitive, { kind: "line" }>,
  circPrim: Extract<FilletPrimitive, { kind: "circle" | "arc" }>,
  lineClick: Vec2,
  circClick: Vec2,
  radius: number,
  allEntities: Entity[],
  lineWasFirst: boolean,
): UniversalFilletResult {
  const dx = linePrim.p2.x - linePrim.p1.x;
  const dy = linePrim.p2.y - linePrim.p1.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Segmento de linha degenerado.",
    };
  }

  // Normal unitária à reta L
  const nx = -dy / len;
  const ny = dx / len;

  // Distância perpendicular do centro do círculo até a reta infinita L
  const projCenter = projectPointOnInfiniteLine({ x: circPrim.cx, y: circPrim.cy }, linePrim.p1, linePrim.p2);
  const distCenterToLine = dist({ x: circPrim.cx, y: circPrim.cy }, projCenter.pt);

  // Construção dos lugares geométricos:
  // L_plus = L + R_f * n, L_minus = L - R_f * n
  // C_ext = raio (R_c + R_f), C_int = raio |R_c - R_f|
  const lineOffsets: { sign: number; p1: Vec2; p2: Vec2; tag: string }[] = [
    {
      sign: 1,
      p1: { x: linePrim.p1.x + nx * radius, y: linePrim.p1.y + ny * radius },
      p2: { x: linePrim.p2.x + nx * radius, y: linePrim.p2.y + ny * radius },
      tag: "+N",
    },
    {
      sign: -1,
      p1: { x: linePrim.p1.x - nx * radius, y: linePrim.p1.y - ny * radius },
      p2: { x: linePrim.p2.x - nx * radius, y: linePrim.p2.y - ny * radius },
      tag: "-N",
    },
  ];

  const locusRadii: { rLocus: number; isInternal: boolean; label: string }[] = [
    { rLocus: circPrim.r + radius, isInternal: false, label: "Externa" },
  ];
  if (Math.abs(circPrim.r - radius) > 1e-4) {
    locusRadii.push({
      rLocus: Math.abs(circPrim.r - radius),
      isInternal: true,
      label: "Interna",
    });
  }

  const candidates: UniversalFilletSolution[] = [];
  const seenCenters: Vec2[] = [];

  for (const lo of lineOffsets) {
    for (const lr of locusRadii) {
      const centers = intersectInfiniteLineCircle(
        lo.p1,
        lo.p2,
        circPrim.cx,
        circPrim.cy,
        lr.rLocus,
      );

      for (const center of centers) {
        if (seenCenters.some((c) => dist(c, center) < 1e-3)) continue;

        // 1. Ponto de tangência exato na reta: projeção ortogonal de center sobre L
        const projTLine = projectPointOnInfiniteLine(center, linePrim.p1, linePrim.p2);
        const tLine = projTLine.pt;
        // Verifica erro de tangência à reta
        if (Math.abs(dist(center, tLine) - radius) > 1e-2) continue;

        // 2. Ponto de tangência exato no círculo/arco
        const vcx = center.x - circPrim.cx;
        const vcy = center.y - circPrim.cy;
        const vLen = Math.hypot(vcx, vcy);
        if (vLen < 1e-7) continue;

        // Para concordância externa (center fora do círculo, dist = R_c + R_f):
        //   T_arc está na direção +(center - C_c) * R_c
        // Para concordância interna:
        //   - Se R_c > R_f (fillet cabe dentro do círculo, dist = R_c - R_f): T_arc está em +(center - C_c) * R_c
        //   - Se R_f > R_c (círculo cabe dentro do fillet, dist = R_f - R_c): T_arc está em -(center - C_c) * R_c
        const signRadial = lr.isInternal && radius > circPrim.r ? -1 : 1;
        const tArc: Vec2 = {
          x: circPrim.cx + signRadial * (vcx / vLen) * circPrim.r,
          y: circPrim.cy + signRadial * (vcy / vLen) * circPrim.r,
        };

        // Verifica erro de tangência ao círculo/arco
        if (Math.abs(dist(center, tArc) - radius) > 1e-2) continue;
        if (dist(tLine, tArc) < 1e-3) continue;

        seenCenters.push(center);

        const clickMid = {
          x: (lineClick.x + circClick.x) / 2,
          y: (lineClick.y + circClick.y) / 2,
        };
        const arcInfo = buildMinorArcAngles(center, radius, tLine, tArc, clickMid);

        // Penaliza soluções cujo ponto de tangência cai muito longe do arco ou fora do segmento de linha
        let penalty = 0;
        if (projTLine.t < -0.25 || projTLine.t > 1.25) {
          penalty += 1000 + Math.abs(projTLine.t - 0.5) * 100;
        }
        if (!circPrim.isFullCircle) {
          const tanAngle = Math.atan2(tArc.y - circPrim.cy, tArc.x - circPrim.cx);
          if (!isAngleOnArc(tanAngle, circPrim.a0, circPrim.a1, 0.12)) {
            penalty += 600;
          }
        }
        // Pequena preferência para concordância externa (padrão industrial para encontro linha-arco)
        // quando as distâncias aos cliques são idênticas
        if (lr.isInternal) penalty += 1.5;

        const score =
          dist(tLine, lineClick) +
          dist(tArc, circClick) +
          0.7 * dist(arcInfo.midpoint, clickMid) +
          penalty;

        const filletArc: Extract<Entity, { type: "arc" }> = {
          id: uid(),
          layer: lineWasFirst ? linePrim.layer : circPrim.layer,
          type: "arc",
          cx: center.x,
          cy: center.y,
          r: radius,
          a0: arcInfo.startAngle,
          a1: arcInfo.endAngle,
        };

        const trimmedLine = trimLinePrimitive(linePrim, tLine, lineClick);
        const trimmedCirc = trimCircleOrArcPrimitive(circPrim, tArc, circClick);

        const trimmedA = lineWasFirst ? trimmedLine : trimmedCirc;
        const trimmedB = lineWasFirst ? trimmedCirc : trimmedLine;
        const idA = lineWasFirst ? linePrim.entityId : circPrim.entityId;
        const idB = lineWasFirst ? circPrim.entityId : linePrim.entityId;

        const updatedEntities = buildUpdatedEntitiesList(
          allEntities,
          idA,
          trimmedA,
          idB,
          trimmedB,
          filletArc,
        );

        candidates.push({
          arcCenter: center,
          radius,
          startAngle: arcInfo.startAngle,
          endAngle: arcInfo.endAngle,
          tangentA: lineWasFirst ? tLine : tArc,
          tangentB: lineWasFirst ? tArc : tLine,
          arcMidpoint: arcInfo.midpoint,
          pairKind: "line-circle",
          trimmedA,
          trimmedB,
          filletArc,
          updatedEntities,
          score,
          variantLabel: `${lr.label} (${lo.tag})`,
        });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  if (candidates.length === 0) {
    // Se a reta está longe demais do círculo, informa o raio mínimo ou máximo geométrico
    const gap = Math.max(0, distCenterToLine - circPrim.r);
    const maxGeom = Number(Math.max(0.5, gap > 0 ? gap * 0.5 : circPrim.r).toFixed(2));
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      maxRadiusMm: maxGeom,
      error: `Raio R${radius} excede o limite geométrico (máx. ~${maxGeom} mm)`,
    };
  }

  return {
    ok: true,
    solutions: candidates,
    activeIndex: 0,
    activeSolution: candidates[0]!,
  };
}

/** Caso 3: Círculo/Arco × Círculo/Arco */
function solveCircleCircleFillet(
  primA: Extract<FilletPrimitive, { kind: "circle" | "arc" }>,
  primB: Extract<FilletPrimitive, { kind: "circle" | "arc" }>,
  clickA: Vec2,
  clickB: Vec2,
  radius: number,
  allEntities: Entity[],
): UniversalFilletResult {
  const combos: {
    r1: number;
    r2: number;
    intA: boolean;
    intB: boolean;
    label: string;
  }[] = [
    {
      r1: primA.r + radius,
      r2: primB.r + radius,
      intA: false,
      intB: false,
      label: "Externa–Externa",
    },
    {
      r1: Math.abs(primA.r - radius),
      r2: Math.abs(primB.r - radius),
      intA: true,
      intB: true,
      label: "Interna–Interna",
    },
    {
      r1: primA.r + radius,
      r2: Math.abs(primB.r - radius),
      intA: false,
      intB: true,
      label: "Externa–Interna",
    },
    {
      r1: Math.abs(primA.r - radius),
      r2: primB.r + radius,
      intA: true,
      intB: false,
      label: "Interna–Externa",
    },
  ];

  const candidates: UniversalFilletSolution[] = [];
  const seenCenters: Vec2[] = [];
  const clickMid = { x: (clickA.x + clickB.x) / 2, y: (clickA.y + clickB.y) / 2 };

  for (const combo of combos) {
    if (combo.r1 < 1e-4 || combo.r2 < 1e-4) continue;
    const centers = intersectTwoCircles(
      primA.cx,
      primA.cy,
      combo.r1,
      primB.cx,
      primB.cy,
      combo.r2,
    );

    for (const center of centers) {
      if (seenCenters.some((c) => dist(c, center) < 1e-3)) continue;

      const vAx = center.x - primA.cx;
      const vAy = center.y - primA.cy;
      const lenA = Math.hypot(vAx, vAy);
      const vBx = center.x - primB.cx;
      const vBy = center.y - primB.cy;
      const lenB = Math.hypot(vBx, vBy);
      if (lenA < 1e-7 || lenB < 1e-7) continue;

      const signA = combo.intA && radius > primA.r ? -1 : 1;
      const signB = combo.intB && radius > primB.r ? -1 : 1;

      const tA: Vec2 = {
        x: primA.cx + signA * (vAx / lenA) * primA.r,
        y: primA.cy + signA * (vAy / lenA) * primA.r,
      };
      const tB: Vec2 = {
        x: primB.cx + signB * (vBx / lenB) * primB.r,
        y: primB.cy + signB * (vBy / lenB) * primB.r,
      };

      if (Math.abs(dist(center, tA) - radius) > 1e-2) continue;
      if (Math.abs(dist(center, tB) - radius) > 1e-2) continue;
      if (dist(tA, tB) < 1e-3) continue;

      seenCenters.push(center);

      const arcInfo = buildMinorArcAngles(center, radius, tA, tB, clickMid);

      let penalty = 0;
      if (!primA.isFullCircle) {
        const thA = Math.atan2(tA.y - primA.cy, tA.x - primA.cx);
        if (!isAngleOnArc(thA, primA.a0, primA.a1, 0.12)) penalty += 600;
      }
      if (!primB.isFullCircle) {
        const thB = Math.atan2(tB.y - primB.cy, tB.x - primB.cx);
        if (!isAngleOnArc(thB, primB.a0, primB.a1, 0.12)) penalty += 600;
      }

      const score =
        dist(tA, clickA) +
        dist(tB, clickB) +
        0.7 * dist(arcInfo.midpoint, clickMid) +
        penalty;

      const filletArc: Extract<Entity, { type: "arc" }> = {
        id: uid(),
        layer: primA.layer,
        type: "arc",
        cx: center.x,
        cy: center.y,
        r: radius,
        a0: arcInfo.startAngle,
        a1: arcInfo.endAngle,
      };

      const trimmedA = trimCircleOrArcPrimitive(primA, tA, clickA);
      const trimmedB = trimCircleOrArcPrimitive(primB, tB, clickB);
      const updatedEntities = buildUpdatedEntitiesList(
        allEntities,
        primA.entityId,
        trimmedA,
        primB.entityId,
        trimmedB,
        filletArc,
      );

      candidates.push({
        arcCenter: center,
        radius,
        startAngle: arcInfo.startAngle,
        endAngle: arcInfo.endAngle,
        tangentA: tA,
        tangentB: tB,
        arcMidpoint: arcInfo.midpoint,
        pairKind: "circle-circle",
        trimmedA,
        trimmedB,
        filletArc,
        updatedEntities,
        score,
        variantLabel: combo.label,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  if (candidates.length === 0) {
    const centerDist = dist({ x: primA.cx, y: primA.cy }, { x: primB.cx, y: primB.cy });
    const maxR = Number(Math.max(0.5, (centerDist + primA.r + primB.r) / 2).toFixed(2));
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      maxRadiusMm: maxR,
      error: `Raio R${radius} excede o limite geométrico (máx. ~${maxR} mm)`,
    };
  }

  return {
    ok: true,
    solutions: candidates,
    activeIndex: 0,
    activeSolution: candidates[0]!,
  };
}

/* ----------------------------------------------------- public entry points */

/**
 * Resolve o Fillet 2D Universal entre duas entidades (ou dois lados de uma polilinha)
 * com raio exato `radiusMm`. Suporta alternar entre soluções válidas via `solutionIndex`.
 */
export function computeUniversalFillet2D(
  entityA: Entity,
  clickA: Vec2,
  entityB: Entity,
  clickB: Vec2,
  radiusMm: number,
  allEntities: Entity[],
  solutionIndex = 0,
): UniversalFilletResult {
  if (!Number.isFinite(radiusMm) || radiusMm <= 0.01) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Informe um raio de concordância maior que 0 mm.",
    };
  }

  const hitA = extractFilletPrimitive(entityA, clickA);
  const hitB = extractFilletPrimitive(entityB, clickB);
  if (!hitA || !hitB) {
    return {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Entidades selecionadas não suportam concordância 2D.",
    };
  }

  const pA = hitA.primitive;
  const pB = hitB.primitive;

  let res: UniversalFilletResult;
  if (pA.kind === "line" && pB.kind === "line") {
    res = solveLineLineFillet(pA, pB, clickA, clickB, radiusMm, allEntities);
  } else if (pA.kind === "line" && (pB.kind === "circle" || pB.kind === "arc")) {
    res = solveLineCircleFillet(pA, pB, clickA, clickB, radiusMm, allEntities, true);
  } else if ((pA.kind === "circle" || pA.kind === "arc") && pB.kind === "line") {
    res = solveLineCircleFillet(pB, pA, clickB, clickA, radiusMm, allEntities, false);
  } else if (
    (pA.kind === "circle" || pA.kind === "arc") &&
    (pB.kind === "circle" || pB.kind === "arc")
  ) {
    res = solveCircleCircleFillet(pA, pB, clickA, clickB, radiusMm, allEntities);
  } else {
    res = {
      ok: false,
      solutions: [],
      activeIndex: 0,
      activeSolution: null,
      error: "Combinação geométrica não suportada.",
    };
  }

  if (res.ok && res.solutions.length > 0) {
    const idx = ((solutionIndex % res.solutions.length) + res.solutions.length) % res.solutions.length;
    res.activeIndex = idx;
    res.activeSolution = res.solutions[idx]!;
  }
  return res;
}

/**
 * Tenta detectar um canto direto de 1 clique próximo a `point` (entre 2 linhas,
 * canto de polilinha/retângulo, ou encontro próximo de linha × arco/círculo).
 */
export function detectDirectFilletCorner(
  point: Vec2,
  entities: Entity[],
  radiusMm: number,
  tol: number,
): UniversalFilletResult | null {
  // 1. Verifica vértice de polilinha/retângulo próximo a `point`
  for (const e of entities) {
    if (e.type !== "polyline") continue;
    const segs = getPolylineSegmentsWithIndex(e);
    const m = segs.length;
    if (m < 2) continue;
    for (let i = 0; i < m; i++) {
      const sA = segs[i]!;
      const nextIdx = (i + 1) % m;
      if (!e.closed && i === m - 1) continue;
      const sB = segs[nextIdx]!;
      const corner = sA.p2;
      if (dist(point, corner) <= tol && dist(sA.p2, sB.p1) <= 1.0) {
        const res = solveSamePolylineCornerFillet(e, sA.index, sB.index, radiusMm, entities);
        if (res.ok || res.maxRadiusMm !== undefined) return res;
      }
    }
  }

  // 2. Verifica encontro de 2 entidades distintas próximas a `point`
  const nearHits: FilletTargetHit[] = [];
  for (const e of entities) {
    const hit = extractFilletPrimitive(e, point);
    if (hit && hit.distance <= tol * 1.4) {
      nearHits.push(hit);
    }
  }
  nearHits.sort((a, b) => a.distance - b.distance);

  if (nearHits.length >= 2) {
    const hA = nearHits[0]!;
    const hB = nearHits[1]!;
    // Escolhe pontos de referência ligeiramente afastados do ponto de encontro ao longo de cada entidade
    const biasPoint = (prim: FilletPrimitive): Vec2 => {
      if (prim.kind === "line") {
        return dist(point, prim.p1) >= dist(point, prim.p2)
          ? { x: (point.x + prim.p1.x) / 2, y: (point.y + prim.p1.y) / 2 }
          : { x: (point.x + prim.p2.x) / 2, y: (point.y + prim.p2.y) / 2 };
      }
      return point;
    };
    const res = computeUniversalFillet2D(
      hA.entity,
      biasPoint(hA.primitive),
      hB.entity,
      biasPoint(hB.primitive),
      radiusMm,
      entities,
      0,
    );
    if (res.ok || res.maxRadiusMm !== undefined) return res;
  }

  return null;
}

/**
 * Converte um arco analítico em caminho SVG (`d` attribute) seguindo o padrão CHAMFER.
 */
export function filletArcToSvgPath(
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const f = (n: number) => n.toFixed(3);
  const p0 = pointOnCircle(center.x, center.y, radius, startAngle);
  const p1 = pointOnCircle(center.x, center.y, radius, endAngle);
  const sweep = ccwSweep(startAngle, endAngle);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${f(p0.x)} ${f(p0.y)} A ${f(radius)} ${f(radius)} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`;
}
