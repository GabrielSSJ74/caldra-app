/**
 * CALDRA CHAMFER — MOTOR DE REFERÊNCIAS INTELIGENTES E SNAPPING GEOMÉTRICO (CAD 2D)
 *
 * Reconhecimento paramétrico de pontos característicos de alta precisão:
 *  - Extremidades (Endpoints): pontas de linhas, polilinhas, arcos;
 *  - Pontos Médios (Midpoints): centro de segmentos e perímetro de arcos;
 *  - Centros (Centers): centros de círculos, arcos, elipses e centroides de contornos fechados;
 *  - Quadrantes (Quadrants): 0°, 90°, 180°, 270° de círculos e elipses;
 *  - Vértices (Vertices): vértices de polilinhas, retângulos e polígonos;
 *  - Interseções Universais (Intersections): encontros analíticos reais e projetados entre quaisquer
 *    combinações de geometrias (Reta-Reta, Reta-Círculo, Círculo-Círculo, Círculo-Arco, Arco-Arco);
 *  - Divisão Virtual de Formas no Snap (Divisão em N partes sem cortar a peça física);
 *  - Tangências (Tangents): pontos de tangência a arcos e circunferências a partir de referência ativa;
 *  - Perpendiculares (Perpendicular): pontos normais a partir do ponto base;
 *  - Geratrizes de Caldeiraria (Geratriz): divisões de boca e geratrizes cilíndricas/cônicas (12/16/24 partes);
 *  - Pontos de Construção (Construction): centros de bounding boxes e pontos de origem (0,0);
 *  - Mais Próximo (Nearest): projeção ortogonal mais próxima sobre a geometria.
 */

import type { Vec2 } from "@/lib/geometry/types";
import { dist, type Entity, segmentsOf, lineIntersection, closestOnSegment, entityPoints } from "./core";

export type SmartSnapKind =
  | "end"            // Extremidade
  | "mid"            // Ponto Médio
  | "center"         // Centro
  | "quadrant"       // Quadrante
  | "intersection"   // Interseção Real
  | "proj_inter"     // Interseção Projetada
  | "tangent"        // Tangência
  | "perp"           // Perpendicular
  | "geratriz"       // Geratriz de Caldeiraria
  | "division"       // Divisão Virtual de Snap
  | "construction"   // Ponto de Construção / Bounding Box
  | "origin"         // Origem (0, 0)
  | "geometric_mark" // Marco Geométrico Associativo (+)
  | "datum_ref"      // Referência de Datum Persistente
  | "near";          // Mais Próximo

export type CanonicalSnapResultType =
  | "endpoint"
  | "midpoint"
  | "center"
  | "intersection"
  | "perpendicular"
  | "tangent"
  | "quadrant"
  | "nearest"
  | "extension"
  | "grid"
  | "geometric_mark"
  | "datum_ref"
  | "none";

/**
 * Estrutura única e autoritativa de resultado do motor central de SNAP (Seção 6.2),
 * compartilhada entre a prancheta principal e a Lupa de Precisão sem recálculos paralelos.
 */
export interface SnapResult {
  valid: boolean;
  type: CanonicalSnapResultType;
  worldPoint: { x: number; y: number };
  screenPoint: { x: number; y: number };
  entityId?: string;
  subEntityId?: string;
  distancePx: number;
  priority: number;
  label: string;
}

export interface SmartReferencePoint {
  p: Vec2;
  kind: SmartSnapKind;
  entityId?: string;
  subEntityId?: string;
  label: string;
  desc?: string;
  priority: number;
}

export const SMART_SNAP_LABELS: Record<SmartSnapKind, string> = {
  end: "Extremidade",
  mid: "Ponto Médio",
  center: "Centro",
  quadrant: "Quadrante",
  intersection: "Interseção",
  proj_inter: "Interseção Projetada",
  tangent: "Tangência",
  perp: "Perpendicular",
  geratriz: "Geratriz",
  division: "Divisão do Snap",
  construction: "Construção",
  origin: "Origem (0,0)",
  geometric_mark: "Marco Geométrico",
  datum_ref: "Datum",
  near: "Mais Próximo",
};

export function mapSmartSnapKindToCanonicalType(kind: string): CanonicalSnapResultType {
  switch (kind) {
    case "end":
    case "origin":
      return "endpoint";
    case "mid":
    case "division":
    case "geratriz":
      return "midpoint";
    case "center":
    case "construction":
      return "center";
    case "intersection":
    case "cross":
      return "intersection";
    case "proj_inter":
      return "extension";
    case "perp":
      return "perpendicular";
    case "tangent":
      return "tangent";
    case "quadrant":
      return "quadrant";
    case "geometric_mark":
      return "geometric_mark";
    case "datum_ref":
      return "datum_ref";
    case "grid":
      return "grid";
    case "near":
      return "nearest";
    default:
      return "none";
  }
}

/**
 * Constrói o `SnapResult` único e determinístico a partir do resultado do motor de SNAP central.
 */
export function buildUnifiedSnapResult(
  rawWorldCursor: Vec2,
  smartSnap: SmartReferencePoint | null | undefined,
  fallbackSnap: { p: Vec2; kind: string } | null | undefined,
  view: { k: number; tx: number; ty: number },
): SnapResult {
  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
  const toScreen = (pt: Vec2) => ({
    x: pt.x * safeK + (Number.isFinite(view.tx) ? view.tx : 0),
    y: pt.y * safeK + (Number.isFinite(view.ty) ? view.ty : 0),
  });

  if (smartSnap && Number.isFinite(smartSnap.p.x) && Number.isFinite(smartSnap.p.y)) {
    const dWorld = dist(rawWorldCursor, smartSnap.p);
    return {
      valid: true,
      type: mapSmartSnapKindToCanonicalType(smartSnap.kind),
      worldPoint: { x: smartSnap.p.x, y: smartSnap.p.y },
      screenPoint: toScreen(smartSnap.p),
      entityId: smartSnap.entityId,
      subEntityId: smartSnap.subEntityId,
      distancePx: Number((dWorld * safeK).toFixed(2)),
      priority: smartSnap.priority,
      label: smartSnap.label,
    };
  }

  if (fallbackSnap && Number.isFinite(fallbackSnap.p.x) && Number.isFinite(fallbackSnap.p.y)) {
    const dWorld = dist(rawWorldCursor, fallbackSnap.p);
    const canonType = mapSmartSnapKindToCanonicalType(fallbackSnap.kind);
    return {
      valid: true,
      type: canonType,
      worldPoint: { x: fallbackSnap.p.x, y: fallbackSnap.p.y },
      screenPoint: toScreen(fallbackSnap.p),
      distancePx: Number((dWorld * safeK).toFixed(2)),
      priority: canonType === "grid" ? 10 : 5,
      label:
        canonType === "grid"
          ? "Grade"
          : canonType === "endpoint"
            ? "Extremidade"
            : canonType === "midpoint"
              ? "Ponto Médio"
              : canonType === "center"
                ? "Centro"
                : canonType === "intersection"
                  ? "Interseção"
                  : "Snap",
    };
  }

  return {
    valid: false,
    type: "none",
    worldPoint: { x: rawWorldCursor.x, y: rawWorldCursor.y },
    screenPoint: toScreen(rawWorldCursor),
    distancePx: 0,
    priority: 999,
    label: "",
  };
}

/**
 * Normaliza um ângulo em radianos para o intervalo [0, 2π).
 */
export function normalizeAngleRad(angle: number): number {
  const TWO_PI = Math.PI * 2;
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Determina com tolerância angular rigorosa se um ângulo pertence a um arco definido por a0 (início) e a1 (fim).
 */
export function isAngleOnArc(angle: number, a0: number, a1: number): boolean {
  const TWO_PI = Math.PI * 2;
  const aNorm = normalizeAngleRad(angle);
  const startNorm = normalizeAngleRad(a0);
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += TWO_PI;
  while (sweep > TWO_PI) sweep -= TWO_PI;

  let diff = aNorm - startNorm;
  while (diff < 0) diff += TWO_PI;
  while (diff >= TWO_PI) diff -= TWO_PI;

  return diff <= sweep + 1e-4;
}

/**
 * Calcula o centroide / centro geométrico real de uma entidade qualquer.
 */
export function getGeometricCenter(e: Entity): Vec2 {
  if (e.type === "circle" || e.type === "arc" || e.type === "ellipse") {
    return { x: e.cx, y: e.cy };
  }
  if (e.type === "line") {
    return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
  }
  if (e.type === "point") {
    return { x: e.x, y: e.y };
  }
  if (e.type === "polyline" && e.pts.length > 0) {
    if (e.closed && e.pts.length >= 3) {
      let a = 0;
      let cx = 0;
      let cy = 0;
      const n = e.pts.length;
      for (let i = 0; i < n; i++) {
        const p1 = e.pts[i]!;
        const p2 = e.pts[(i + 1) % n]!;
        const cross = p1.x * p2.y - p2.x * p1.y;
        a += cross;
        cx += (p1.x + p2.x) * cross;
        cy += (p1.y + p2.y) * cross;
      }
      a = a * 0.5;
      if (Math.abs(a) > 1e-6) {
        return { x: cx / (6 * a), y: cy / (6 * a) };
      }
    }
    const sum = e.pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / e.pts.length, y: sum.y / e.pts.length };
  }
  if (e.type === "hatch" && e.boundaryPts.length > 0) {
    const sum = e.boundaryPts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / e.boundaryPts.length, y: sum.y / e.boundaryPts.length };
  }
  const pts = entityPoints(e);
  if (pts.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Interseção analítica exata entre segmento de reta e círculo/arco circular.
 */
export function intersectLineWithCircle(
  p1: Vec2,
  p2: Vec2,
  center: Vec2,
  radius: number,
  isArc = false,
  a0 = 0,
  a1 = 0,
): Vec2[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [];

  const fx = p1.x - center.x;
  const fy = p1.y - center.y;

  const a = len2;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  const discr = b * b - 4 * a * c;
  if (discr < -1e-7) return [];

  const sqrtD = discr < 0 ? 0 : Math.sqrt(discr);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  const results: Vec2[] = [];
  const checkT = (t: number) => {
    if (t >= -1e-4 && t <= 1 + 1e-4) {
      const clampedT = Math.max(0, Math.min(1, t));
      const pt: Vec2 = {
        x: p1.x + clampedT * dx,
        y: p1.y + clampedT * dy,
      };
      if (isArc) {
        const ang = Math.atan2(pt.y - center.y, pt.x - center.x);
        if (!isAngleOnArc(ang, a0, a1)) return;
      }
      if (!results.some((existing) => dist(existing, pt) < 1e-3)) {
        results.push(pt);
      }
    }
  };

  checkT(t1);
  if (Math.abs(t2 - t1) > 1e-6) {
    checkT(t2);
  }
  return results;
}

/**
 * Interseção analítica canônica entre dois círculos ou arcos circulares.
 */
export function intersectCircleWithCircle(
  c1: Vec2,
  r1: number,
  c2: Vec2,
  r2: number,
  arc1?: { a0: number; a1: number },
  arc2?: { a0: number; a1: number },
): Vec2[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);

  if (d < 1e-6) return []; // Círculos concêntricos
  if (d > r1 + r2 + 1e-4) return []; // Círculos separados
  if (d < Math.abs(r1 - r2) - 1e-4) return []; // Círculo totalmente contido

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = Math.max(0, r1 * r1 - a * a);
  const h = Math.sqrt(h2);

  const pmx = c1.x + (a / d) * dx;
  const pmy = c1.y + (a / d) * dy;

  const candidates: Vec2[] = [];

  if (h < 1e-6) {
    // Tangência
    candidates.push({ x: pmx, y: pmy });
  } else {
    // Dois pontos de cruzamento
    const rx = (h / d) * dy;
    const ry = (h / d) * dx;
    candidates.push({ x: pmx + rx, y: pmy - ry });
    candidates.push({ x: pmx - rx, y: pmy + ry });
  }

  const results: Vec2[] = [];
  for (const pt of candidates) {
    if (arc1) {
      const ang1 = Math.atan2(pt.y - c1.y, pt.x - c1.x);
      if (!isAngleOnArc(ang1, arc1.a0, arc1.a1)) continue;
    }
    if (arc2) {
      const ang2 = Math.atan2(pt.y - c2.y, pt.x - c2.x);
      if (!isAngleOnArc(ang2, arc2.a0, arc2.a1)) continue;
    }
    if (!results.some((existing) => dist(existing, pt) < 1e-3)) {
      results.push(pt);
    }
  }

  return results;
}

/**
 * Extrai todos os pontos característicos de uma entidade individual para exibição dinâmica,
 * incluindo suporte a divisões virtuais de snap (N partes iguais sem alterar a peça física).
 */
export function extractEntitySmartReferences(
  e: Entity,
  activeStartPoint: Vec2 | null = null,
  divisionsCaldeiraria = 0,
  snapDivisionCount = 0,
): SmartReferencePoint[] {
  const refs: SmartReferencePoint[] = [];

  // 1. Linha simples
  if (e.type === "line") {
    refs.push(
      { p: { x: e.x1, y: e.y1 }, kind: "end", entityId: e.id, label: "Extremidade", priority: 1 },
      { p: { x: e.x2, y: e.y2 }, kind: "end", entityId: e.id, label: "Extremidade", priority: 1 },
      { p: { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }, kind: "mid", entityId: e.id, label: "Ponto Médio", priority: 2 },
    );

    // Divisão Virtual de Linha (N partes)
    if (snapDivisionCount >= 2) {
      for (let k = 1; k < snapDivisionCount; k++) {
        const t = k / snapDivisionCount;
        refs.push({
          p: { x: e.x1 + t * (e.x2 - e.x1), y: e.y1 + t * (e.y2 - e.y1) },
          kind: "division",
          entityId: e.id,
          label: `DIVISÃO ${k}/${snapDivisionCount}`,
          desc: `Divisão ${k} de ${snapDivisionCount}`,
          priority: 3,
        });
      }
    }

    // Perpendicular a partir de ponto base ativo
    if (activeStartPoint) {
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const l2 = dx * dx + dy * dy;
      if (l2 > 1e-6) {
        const t = ((activeStartPoint.x - e.x1) * dx + (activeStartPoint.y - e.y1) * dy) / l2;
        if (t >= 0 && t <= 1) {
          refs.push({
            p: { x: e.x1 + t * dx, y: e.y1 + t * dy },
            kind: "perp",
            entityId: e.id,
            label: "Perpendicular",
            priority: 4,
          });
        }
      }
    }
    return refs;
  }

  // 2. Círculo
  if (e.type === "circle") {
    // Centro
    refs.push({ p: { x: e.cx, y: e.cy }, kind: "center", entityId: e.id, label: "Centro", priority: 1 });

    // 4 Quadrantes Canônicos (0°, 90°, 180°, 270°)
    refs.push(
      { p: { x: e.cx + e.r, y: e.cy }, kind: "quadrant", entityId: e.id, label: "Quadrante 0°", priority: 2 },
      { p: { x: e.cx, y: e.cy + e.r }, kind: "quadrant", entityId: e.id, label: "Quadrante 90°", priority: 2 },
      { p: { x: e.cx - e.r, y: e.cy }, kind: "quadrant", entityId: e.id, label: "Quadrante 180°", priority: 2 },
      { p: { x: e.cx, y: e.cy - e.r }, kind: "quadrant", entityId: e.id, label: "Quadrante 270°", priority: 2 },
    );

    // Divisão Virtual de Círculo (N partes angulares nos 360°)
    if (snapDivisionCount >= 2) {
      for (let k = 0; k < snapDivisionCount; k++) {
        // Se coincidir com quadrante existente (múltiplos de 4), preserva o quadrante de prioridade 2
        const isQuad = snapDivisionCount % 4 === 0 && k % (snapDivisionCount / 4) === 0;
        if (!isQuad) {
          const ang = (2 * Math.PI * k) / snapDivisionCount;
          refs.push({
            p: { x: e.cx + e.r * Math.cos(ang), y: e.cy + e.r * Math.sin(ang) },
            kind: "division",
            entityId: e.id,
            label: `DIVISÃO ${k}/${snapDivisionCount}`,
            desc: `Circunferência: Divisão ${k}/${snapDivisionCount}`,
            priority: 3,
          });
        }
      }
    }

    // Geratrizes de caldeiraria (apenas quando solicitado)
    if (divisionsCaldeiraria > 4) {
      for (let i = 0; i < divisionsCaldeiraria; i++) {
        if (i % (divisionsCaldeiraria / 4) === 0) continue;
        const ang = (2 * Math.PI * i) / divisionsCaldeiraria;
        refs.push({
          p: { x: e.cx + e.r * Math.cos(ang), y: e.cy + e.r * Math.sin(ang) },
          kind: "geratriz",
          entityId: e.id,
          label: `Geratriz ${i + 1}/${divisionsCaldeiraria}`,
          priority: 5,
        });
      }
    }

    // Tangência a partir de ponto ativo
    if (activeStartPoint) {
      const dCenter = dist(activeStartPoint, { x: e.cx, y: e.cy });
      if (dCenter > e.r + 1e-4) {
        const baseAng = Math.atan2(e.cy - activeStartPoint.y, e.cx - activeStartPoint.x);
        const theta = Math.acos(e.r / dCenter);
        const t1 = baseAng + (Math.PI / 2 - theta);
        const t2 = baseAng - (Math.PI / 2 - theta);
        refs.push(
          { p: { x: e.cx + e.r * Math.cos(t1), y: e.cy + e.r * Math.sin(t1) }, kind: "tangent", entityId: e.id, label: "Tangente", priority: 3 },
          { p: { x: e.cx + e.r * Math.cos(t2), y: e.cy + e.r * Math.sin(t2) }, kind: "tangent", entityId: e.id, label: "Tangente", priority: 3 },
        );
      }
    }
    return refs;
  }

  // 3. Arco
  if (e.type === "arc") {
    // Centro do arco
    refs.push({ p: { x: e.cx, y: e.cy }, kind: "center", entityId: e.id, label: "Centro do Arco", priority: 1 });

    // Extremidades do arco
    const pStart = { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) };
    const pEnd = { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) };
    refs.push(
      { p: pStart, kind: "end", entityId: e.id, label: "Extremidade Inicial", priority: 1 },
      { p: pEnd, kind: "end", entityId: e.id, label: "Extremidade Final", priority: 1 },
    );

    // Ponto médio no arco (sweep angular)
    let sweep = e.a1 - e.a0;
    while (sweep <= 0) sweep += 2 * Math.PI;
    const midAngle = e.a0 + sweep / 2;
    refs.push({
      p: { x: e.cx + e.r * Math.cos(midAngle), y: e.cy + e.r * Math.sin(midAngle) },
      kind: "mid",
      entityId: e.id,
      label: "Ponto Médio do Arco",
      priority: 2,
    });

    // Divisão Virtual de Arco (N partes no sweep)
    if (snapDivisionCount >= 2) {
      for (let k = 1; k < snapDivisionCount; k++) {
        const ang = e.a0 + (k / snapDivisionCount) * sweep;
        refs.push({
          p: { x: e.cx + e.r * Math.cos(ang), y: e.cy + e.r * Math.sin(ang) },
          kind: "division",
          entityId: e.id,
          label: `DIVISÃO ${k}/${snapDivisionCount}`,
          desc: `Arco: Divisão ${k}/${snapDivisionCount}`,
          priority: 3,
        });
      }
    }

    return refs;
  }

  // 4. Polilinha / Retângulo / Contorno fechado
  if (e.type === "polyline") {
    const pts = e.pts;
    const n = pts.length;

    // Vértices
    for (let i = 0; i < n; i++) {
      refs.push({
        p: pts[i]!,
        kind: "end",
        entityId: e.id,
        label: e.closed ? `Vértice ${i + 1}` : (i === 0 || i === n - 1 ? "Extremidade" : `Vértice ${i + 1}`),
        priority: 1,
      });
    }

    // Pontos médios e divisões dos segmentos
    for (let i = 0; i < n - 1; i++) {
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      refs.push({
        p: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        kind: "mid",
        entityId: e.id,
        label: `Ponto Médio (${i + 1}-${i + 2})`,
        priority: 2,
      });

      if (snapDivisionCount >= 2) {
        for (let k = 1; k < snapDivisionCount; k++) {
          const t = k / snapDivisionCount;
          refs.push({
            p: { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) },
            kind: "division",
            entityId: e.id,
            label: `DIVISÃO ${k}/${snapDivisionCount}`,
            desc: `Aresta ${i + 1}: Divisão ${k}/${snapDivisionCount}`,
            priority: 3,
          });
        }
      }
    }

    if (e.closed && n > 2) {
      const pFirst = pts[0]!;
      const pLast = pts[n - 1]!;
      refs.push({
        p: { x: (pLast.x + pFirst.x) / 2, y: (pLast.y + pFirst.y) / 2 },
        kind: "mid",
        entityId: e.id,
        label: `Ponto Médio Fechamento`,
        priority: 2,
      });

      if (snapDivisionCount >= 2) {
        for (let k = 1; k < snapDivisionCount; k++) {
          const t = k / snapDivisionCount;
          refs.push({
            p: { x: pLast.x + t * (pFirst.x - pLast.x), y: pLast.y + t * (pFirst.y - pLast.y) },
            kind: "division",
            entityId: e.id,
            label: `DIVISÃO ${k}/${snapDivisionCount}`,
            desc: `Fechamento: Divisão ${k}/${snapDivisionCount}`,
            priority: 3,
          });
        }
      }

      // Centro geométrico / Centroide do polígono fechado
      const center = getGeometricCenter(e);
      refs.push({
        p: center,
        kind: "center",
        entityId: e.id,
        label: n === 4 ? "⌖ Centro Geométrico (Retângulo)" : "⌖ Centro Geométrico",
        priority: 1,
      });
    } else if (n >= 3) {
      const pFirst = pts[0]!;
      const pLast = pts[n - 1]!;
      if (Math.hypot(pFirst.x - pLast.x, pFirst.y - pLast.y) < 1.5) {
        const center = getGeometricCenter(e);
        refs.push({
          p: center,
          kind: "center",
          entityId: e.id,
          label: "⌖ Centro Geométrico",
          priority: 1,
        });
      }
    }
    return refs;
  }

  // 5. Elipse
  if (e.type === "ellipse") {
    refs.push({ p: { x: e.cx, y: e.cy }, kind: "center", entityId: e.id, label: "Centro da Elipse", priority: 1 });
    refs.push(
      { p: { x: e.cx + e.rx, y: e.cy }, kind: "quadrant", entityId: e.id, label: "Quadrante Maior", priority: 2 },
      { p: { x: e.cx - e.rx, y: e.cy }, kind: "quadrant", entityId: e.id, label: "Quadrante Maior", priority: 2 },
      { p: { x: e.cx, y: e.cy + e.ry }, kind: "quadrant", entityId: e.id, label: "Quadrante Menor", priority: 2 },
      { p: { x: e.cx, y: e.cy - e.ry }, kind: "quadrant", entityId: e.id, label: "Quadrante Menor", priority: 2 },
    );
    return refs;
  }

  // 6. Ponto Técnico / Marco Geométrico Associativo (+) / Datum Persistente
  if (e.type === "point") {
    const semKind = e.params?.cadSemanticKind;
    if (semKind === "geometric_mark") {
      refs.push({
        p: { x: e.x, y: e.y },
        kind: "geometric_mark",
        entityId: e.id,
        label: e.label ?? "Marco Geométrico (+)",
        priority: 0.25,
      });
      return refs;
    }
    if (semKind === "persistent_datum") {
      const datumSpec = e.params?.persistentDatumSpec as
        | { origin?: Vec2; target?: Vec2 }
        | undefined;
      const orig = datumSpec?.origin ?? { x: e.x, y: e.y };
      const targ = datumSpec?.target;
      refs.push({
        p: orig,
        kind: "datum_ref",
        entityId: e.id,
        subEntityId: "origin",
        label: "Datum · Origem A",
        priority: 0.35,
      });
      if (targ && Number.isFinite(targ.x) && Number.isFinite(targ.y)) {
        refs.push(
          {
            p: targ,
            kind: "datum_ref",
            entityId: e.id,
            subEntityId: "target",
            label: "Datum · Alvo B",
            priority: 0.35,
          },
          {
            p: { x: targ.x, y: orig.y },
            kind: "datum_ref",
            entityId: e.id,
            subEntityId: "corner",
            label: "Datum · Esquadro (ΔX/ΔY)",
            priority: 0.5,
          },
        );
      }
      return refs;
    }
    refs.push({
      p: { x: e.x, y: e.y },
      kind: "end",
      entityId: e.id,
      label: e.label ?? "Ponto",
      priority: 1,
    });
    return refs;
  }

  return refs;
}

/**
 * Calcula todas as interseções reais e projetadas entre as entidades fornecidas,
 * cobrindo universalmente: Reta-Reta, Reta-Círculo, Círculo-Círculo, Círculo-Arco e Arco-Arco.
 */
export function extractIntersections(
  entities: Entity[],
  includeProjected = false,
  maxDistance = 5000,
): SmartReferencePoint[] {
  const points: SmartReferencePoint[] = [];

  // 1. Decomposição analítica em segmentos de reta
  const segsWithEntity: { seg: [Vec2, Vec2]; id: string; type: string }[] = [];
  for (const e of entities) {
    const sList = segmentsOf(e);
    for (const s of sList) {
      segsWithEntity.push({ seg: s, id: e.id, type: e.type });
    }
  }

  // 2. Decomposição analítica em primitivos circulares (Círculos e Arcos)
  interface CircularPrimitive {
    id: string;
    center: Vec2;
    r: number;
    isArc: boolean;
    a0: number;
    a1: number;
  }
  const circulars: CircularPrimitive[] = [];
  for (const e of entities) {
    if (e.type === "circle") {
      circulars.push({
        id: e.id,
        center: { x: e.cx, y: e.cy },
        r: e.r,
        isArc: false,
        a0: 0,
        a1: Math.PI * 2,
      });
    } else if (e.type === "arc") {
      circulars.push({
        id: e.id,
        center: { x: e.cx, y: e.cy },
        r: e.r,
        isArc: true,
        a0: e.a0,
        a1: e.a1,
      });
    }
  }

  const pushIntersectionPoint = (pt: Vec2, desc: string, priority = 1, isProj = false) => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    const exists = points.some((existing) => dist(existing.p, pt) < 1e-3);
    if (!exists) {
      points.push({
        p: pt,
        kind: isProj ? "proj_inter" : "intersection",
        label: isProj ? "Interseção Projetada" : "Interseção",
        desc,
        priority,
      });
    }
  };

  // A. Segmento vs Segmento (Reta com Reta)
  const nSegs = segsWithEntity.length;
  for (let i = 0; i < nSegs; i++) {
    for (let j = i + 1; j < nSegs; j++) {
      const a = segsWithEntity[i]!;
      const b = segsWithEntity[j]!;
      if (a.id === b.id) continue;

      const realX = lineIntersection(a.seg, b.seg, true);
      if (realX) {
        pushIntersectionPoint(realX, "Cruzamento entre contornos", 1, false);
      } else if (includeProjected) {
        const projX = lineIntersection(a.seg, b.seg, false);
        if (projX) {
          const dA = dist(projX, a.seg[0]);
          const dB = dist(projX, b.seg[0]);
          if (dA <= maxDistance && dB <= maxDistance) {
            pushIntersectionPoint(projX, "Encontro no prolongamento", 3, true);
          }
        }
      }
    }
  }

  // B. Segmento vs Círculo/Arco (Reta com Círculo)
  for (const s of segsWithEntity) {
    for (const c of circulars) {
      if (s.id === c.id) continue;
      const pts = intersectLineWithCircle(s.seg[0], s.seg[1], c.center, c.r, c.isArc, c.a0, c.a1);
      for (const pt of pts) {
        pushIntersectionPoint(pt, c.isArc ? "Cruzamento Reta-Arco" : "Cruzamento Reta-Círculo", 1, false);
      }
    }
  }

  // C. Círculo/Arco vs Círculo/Arco (Círculo com Círculo, Círculo com Arco, Arco com Arco)
  const nCirc = circulars.length;
  for (let i = 0; i < nCirc; i++) {
    for (let j = i + 1; j < nCirc; j++) {
      const c1 = circulars[i]!;
      const c2 = circulars[j]!;
      if (c1.id === c2.id) continue;

      const pts = intersectCircleWithCircle(
        c1.center,
        c1.r,
        c2.center,
        c2.r,
        c1.isArc ? { a0: c1.a0, a1: c1.a1 } : undefined,
        c2.isArc ? { a0: c2.a0, a1: c2.a1 } : undefined,
      );

      for (const pt of pts) {
        pushIntersectionPoint(
          pt,
          c1.isArc || c2.isArc ? "Cruzamento com Arco" : "Cruzamento Círculo-Círculo",
          1,
          false,
        );
      }
    }
  }

  return points;
}

/**
 * Localiza o melhor ponto de referência sob o cursor com snap magnético.
 */
export function findSmartSnap(
  cursor: Vec2,
  entities: Entity[],
  tol: number,
  activeStartPoint: Vec2 | null = null,
  activeTool?: string,
  selectedEntityIds?: string[],
  snapDivisionCount = 0,
): SmartReferencePoint | null {
  const candidates: SmartReferencePoint[] = [];

  // Origem do plano
  candidates.push({ p: { x: 0, y: 0 }, kind: "origin", label: "Origem (0, 0)", priority: 7 });

  // 1. Pontos característicos de cada entidade relevante
  const divisions = activeTool === "divide" || activeTool === "caldeiraria_div" ? 12 : 0;
  for (const e of entities) {
    const isSelected = selectedEntityIds?.includes(e.id);
    const refs = extractEntitySmartReferences(e, activeStartPoint, divisions, snapDivisionCount);
    for (const r of refs) {
      if (isSelected) {
        candidates.push({ ...r, priority: r.priority - 0.5 });
      } else {
        candidates.push(r);
      }
    }
  }

  // 2. Interseções analíticas universais entre geometrias
  const inters = extractIntersections(entities, false);
  candidates.push(...inters);

  // 3. Projeção "Mais Próximo" (Near) sobre qualquer segmento
  const allSegs = entities.flatMap(segmentsOf);
  for (const seg of allSegs) {
    const nearPt = closestOnSegment(cursor, seg);
    if (dist(nearPt, cursor) <= tol) {
      candidates.push({
        p: nearPt,
        kind: "near",
        label: "Mais Próximo",
        priority: 9,
      });
    }
  }

  // Filtra por tolerância de captura e ordena por prioridade e distância
  const inRange = candidates.filter((c) => dist(c.p, cursor) <= tol);
  if (inRange.length === 0) return null;

  inRange.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return dist(a.p, cursor) - dist(b.p, cursor);
  });

  return inRange[0] ?? null;
}
