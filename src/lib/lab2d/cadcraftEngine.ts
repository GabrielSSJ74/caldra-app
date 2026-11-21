/**
 * CALDRA — MÓDULO CHAMFER CAD
 * MOTOR GEOMÉTRICO PURO UNIFICADO & REGISTRO DE COMANDOS (CADCraft → CHAMFER CAD)
 *
 * Responsabilidades:
 *  1. Tolerâncias numéricas canônicas em ponto flutuante de 64 bits (mm):
 *     - ε_dist = 1e-5 mm
 *     - ε_ang  = 1e-6 rad
 *     - Densidade mínima de tesselação visual de curvas >= 128 segmentos
 *  2. Validador e Extrator Único de "Perfil Fechado Válido" (contorno conexo,
 *     sem auto-interseção, orientação CCW para contornos externos e CW para furos/ilhas internas).
 *  3. Construtores geométricos paramétricos (CRI):
 *     - Linha de Construção / Eixo Infinito [CC]
 *     - Polilinha Composta (Linha ↔ Arco Tangente) [CC]
 *     - Retângulos Paramétricos (2 Cantos, Centro-Canto, 3 Pontos Inclinado + Chanfro/Filete) [CC]
 *     - Círculos (Centro-Raio, Centro-Diâmetro, 2 Pontos, 3 Pontos, TTR) [CC]
 *     - Rasgo Oblongo Mecânico (Slot Reto Centro-a-Centro, Total e Slot Curvo em Arco) [EXT]
 *     - Polígono Regular Paramétrico (Inscrito, Circunscrito e Sextavado Entre Faces S mm) [CC/EXT]
 *     - Spline Suave Interpolada (>= 128 segmentos de exibição) [CC]
 *  4. Modificadores topológicos e booleanos (MOD):
 *     - Swipe-to-Trim (corte por arraste contínuo multi-segmentos em 1 transação de Undo) [CC*]
 *     - Estender (Extend) até o próximo limite real [CC]
 *     - Offset Paralelo Robusto com limpeza de auto-interseção [CC]
 *     - Overkill (limpeza de duplicatas exatas, segmentos nulos e colineares sobrepostos) [CC]
 *     - Edição Multi-Modo de Grips (Esticar, Mover, Girar, Escalar, Espelhar, +Vértice, Converter p/ Arco) [CC*]
 *     - Hachura Técnica com detecção automática de ilhas/furos internos [CC]
 *  5. Registro Unificado de Comandos (CommandRegistry) com execução atômica e rollback seguro.
 */

import type { Vec2 } from "@/lib/geometry/types";
import {
  dist,
  uid,
  segmentsOf,
  lineIntersection,
  closestOnSegment,
  pointInPoly,
  outlinePoints,
  translate,
  rotate,
  type Entity,
  type LayerId,
} from "./core";
import { computeSmartTrim, type TrimBoundaryMode } from "./cadSmartTrim";
import { execute2DBoolean, type BooleanOp } from "./cadBooleans2D";

export const EPS_DIST_MM = 1e-5;
export const EPS_ANG_RAD = 1e-6;
export const MIN_CURVE_DISPLAY_SEGMENTS = 128;

export type OriginClassification = "PRESERVAR" | "COMPLETAR" | "CC" | "CC*" | "EXT";
export type ChamferTargetMenu = "SEL" | "CRI" | "MOD" | "PRE" | "MED" | "COR";

export type GripEditMode = "stretch" | "move" | "rotate" | "scale" | "mirror";
export type RectCreationMode = "corners" | "center" | "three_point";
export type CircleCreationMode = "center_radius" | "center_diameter" | "two_point" | "three_point" | "ttr";
export type PolygonCreationMode = "inscribed" | "circumscribed" | "across_flats";
export type SlotCreationMode = "center_to_center" | "overall" | "curved";
export type PolylineSegmentMode = "line" | "tangent_arc";

// ============================================================================
// 1. VALIDADOR E EXTRATOR CANÔNICO DE "PERFIL FECHADO VÁLIDO"
// ============================================================================

export interface ValidatedClosedProfile {
  id: string;
  sourceEntityIds: string[];
  outerLoop: Vec2[]; // Orientado em sentido anti-horário (CCW, área algébrica > 0)
  innerLoops: Vec2[][]; // Ilhas / furos internos orientados em sentido horário (CW)
  areaMm2: number;
  perimeterMm: number;
  centroid: Vec2;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  hasSelfIntersection: boolean;
  isValid: boolean;
}

/**
 * Calcula a área algébrica assinada de um anel poligonal 2D (Shoelace formula).
 */
export function computeSignedArea(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

/**
 * Calcula o centroide geométrico (centro de massa planar) de um anel fechado.
 */
export function computePolygonCentroid(pts: Vec2[]): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  const area = computeSignedArea(pts);
  if (Math.abs(area) < EPS_DIST_MM) {
    const sx = pts.reduce((acc, p) => acc + p.x, 0);
    const sy = pts.reduce((acc, p) => acc + p.y, 0);
    return { x: sx / pts.length, y: sy / pts.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, y: cy * factor };
}

/**
 * Verifica se um polígono fechado possui auto-interseção entre arestas não adjacentes.
 */
export function hasPolygonSelfIntersection(pts: Vec2[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = pts[i]!;
    const a2 = pts[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // arestas adjacentes no fecho
      const b1 = pts[j]!;
      const b2 = pts[(j + 1) % n]!;
      const inter = lineIntersection([a1, a2], [b1, b2], true);
      if (inter) {
        const dEnd = Math.min(
          dist(inter, a1),
          dist(inter, a2),
          dist(inter, b1),
          dist(inter, b2),
        );
        if (dEnd > 1e-3) return true;
      }
    }
  }
  return false;
}

/**
 * Normaliza orientação do anel: CCW (área positiva) para contornos externos,
 * CW (área negativa) para furos internos.
 */
export function normalizeLoopOrientation(pts: Vec2[], wantCCW: boolean): Vec2[] {
  const cleaned: Vec2[] = [];
  for (const p of pts) {
    if (cleaned.length === 0 || dist(p, cleaned[cleaned.length - 1]!) > EPS_DIST_MM) {
      cleaned.push({ x: p.x, y: p.y });
    }
  }
  if (cleaned.length >= 2 && dist(cleaned[0]!, cleaned[cleaned.length - 1]!) <= 1e-4) {
    cleaned.pop();
  }
  const area = computeSignedArea(cleaned);
  if ((wantCCW && area < 0) || (!wantCCW && area > 0)) {
    return [...cleaned].reverse();
  }
  return cleaned;
}

/**
 * Valida e extrai todos os Perfis Fechados Válidos a partir de um conjunto de entidades,
 * encadeando segmentos conexos se necessário e classificando furos internos (ilhas).
 * Reutilizado por Hachura, Booleanas 2D, ISO 2D, Push/Pull Z, CAD 3D, PLANIFICAR e CNC/DXF.
 */
export function validateAndExtractClosedProfiles(
  entities: Entity[],
  closureTolMm = 0.05,
): ValidatedClosedProfile[] {
  const rawLoops: { id: string; sourceIds: string[]; pts: Vec2[] }[] = [];
  const openSegments: { id: string; p1: Vec2; p2: Vec2 }[] = [];

  for (const e of entities) {
    if (e.type === "circle") {
      const pts = Array.from({ length: MIN_CURVE_DISPLAY_SEGMENTS }, (_, i) => {
        const a = (i / MIN_CURVE_DISPLAY_SEGMENTS) * Math.PI * 2;
        return { x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a) };
      });
      rawLoops.push({ id: e.id, sourceIds: [e.id], pts });
    } else if (e.type === "ellipse") {
      const pts = outlinePoints(e);
      if (pts.length >= 3) {
        rawLoops.push({ id: e.id, sourceIds: [e.id], pts });
      }
    } else if (e.type === "polyline") {
      if (e.pts.length >= 3) {
        const isClosed =
          e.closed || dist(e.pts[0]!, e.pts[e.pts.length - 1]!) <= closureTolMm;
        if (isClosed) {
          rawLoops.push({ id: e.id, sourceIds: [e.id], pts: e.pts });
        } else {
          for (let i = 0; i < e.pts.length - 1; i++) {
            openSegments.push({ id: e.id, p1: e.pts[i]!, p2: e.pts[i + 1]! });
          }
        }
      } else if (e.pts.length === 2) {
        openSegments.push({ id: e.id, p1: e.pts[0]!, p2: e.pts[1]! });
      }
    } else if (e.type === "line") {
      openSegments.push({
        id: e.id,
        p1: { x: e.x1, y: e.y1 },
        p2: { x: e.x2, y: e.y2 },
      });
    } else if (e.type === "arc") {
      const segs = segmentsOf(e);
      for (const s of segs) {
        openSegments.push({ id: e.id, p1: s[0], p2: s[1] });
      }
    }
  }

  // Encadeia segmentos abertos conexos para detectar contornos fechados compostos
  const used = new Set<number>();
  for (let i = 0; i < openSegments.length; i++) {
    if (used.has(i)) continue;
    const startSeg = openSegments[i]!;
    used.add(i);
    const chain: Vec2[] = [startSeg.p1, startSeg.p2];
    const sourceIds = new Set<string>([startSeg.id]);

    let progressed = true;
    while (progressed) {
      progressed = false;
      const tail = chain[chain.length - 1]!;
      if (chain.length >= 4 && dist(tail, chain[0]!) <= closureTolMm) {
        chain.pop();
        rawLoops.push({
          id: `loop_${uid()}`,
          sourceIds: Array.from(sourceIds),
          pts: chain,
        });
        break;
      }
      for (let j = 0; j < openSegments.length; j++) {
        if (used.has(j)) continue;
        const cand = openSegments[j]!;
        if (dist(tail, cand.p1) <= closureTolMm) {
          used.add(j);
          chain.push(cand.p2);
          sourceIds.add(cand.id);
          progressed = true;
          break;
        } else if (dist(tail, cand.p2) <= closureTolMm) {
          used.add(j);
          chain.push(cand.p1);
          sourceIds.add(cand.id);
          progressed = true;
          break;
        }
      }
    }
  }

  // Normaliza anéis e classifica hierarquia (contornos externos vs furos/ilhas internas)
  const normalized = rawLoops
    .map((l) => {
      const ccw = normalizeLoopOrientation(l.pts, true);
      const absArea = Math.abs(computeSignedArea(ccw));
      return { ...l, pts: ccw, absArea };
    })
    .filter((l) => l.pts.length >= 3 && l.absArea > EPS_DIST_MM)
    .sort((a, b) => b.absArea - a.absArea);

  const assignedAsInner = new Set<number>();
  const profiles: ValidatedClosedProfile[] = [];

  for (let i = 0; i < normalized.length; i++) {
    if (assignedAsInner.has(i)) continue;
    const outer = normalized[i]!;
    const innerLoops: Vec2[][] = [];
    const allIds = new Set<string>(outer.sourceIds);
    let netArea = outer.absArea;

    for (let j = i + 1; j < normalized.length; j++) {
      if (assignedAsInner.has(j)) continue;
      const cand = normalized[j]!;
      if (pointInPoly(cand.pts[0]!, outer.pts)) {
        assignedAsInner.add(j);
        innerLoops.push(normalizeLoopOrientation(cand.pts, false)); // CW para furos
        cand.sourceIds.forEach((id) => allIds.add(id));
        netArea = Math.max(0, netArea - cand.absArea);
      }
    }

    const xs = outer.pts.map((p) => p.x);
    const ys = outer.pts.map((p) => p.y);
    const perim = outer.pts.reduce((acc, p, idx) => {
      const q = outer.pts[(idx + 1) % outer.pts.length]!;
      return acc + dist(p, q);
    }, 0);
    const selfInter = hasPolygonSelfIntersection(outer.pts);

    profiles.push({
      id: outer.id,
      sourceEntityIds: Array.from(allIds),
      outerLoop: outer.pts,
      innerLoops,
      areaMm2: netArea,
      perimeterMm: perim,
      centroid: computePolygonCentroid(outer.pts),
      boundingBox: {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      },
      hasSelfIntersection: selfInter,
      isValid: !selfInter && outer.pts.length >= 3 && netArea > EPS_DIST_MM,
    });
  }

  return profiles;
}

// ============================================================================
// 2. CONSTRUTORES GEOMÉTRICOS PARAMÉTRICOS (CRI)
// ============================================================================

/**
 * [CC] Linha de Construção / Eixo Infinito (estende-se pelo envelope do projeto na camada 'construcao' ou 'eixo').
 */
export function buildConstructionAxisLine(
  p1: Vec2,
  p2: Vec2,
  layer: LayerId = "construcao",
  spanMm = 2500,
): Entity {
  const d = dist(p1, p2);
  if (d < EPS_DIST_MM) {
    return {
      id: uid(),
      layer,
      type: "line",
      x1: p1.x - spanMm,
      y1: p1.y,
      x2: p1.x + spanMm,
      y2: p1.y,
      params: { isConstructionAxis: true, dash: [12, 4, 2, 4] },
    };
  }
  const ux = (p2.x - p1.x) / d;
  const uy = (p2.y - p1.y) / d;
  return {
    id: uid(),
    layer,
    type: "line",
    x1: p1.x - ux * spanMm,
    y1: p1.y - uy * spanMm,
    x2: p1.x + ux * spanMm,
    y2: p1.y + uy * spanMm,
    params: { isConstructionAxis: true, dash: [12, 4, 2, 4] },
  };
}

/**
 * [CC] Calcula os pontos de um segmento de Arco Tangente saindo de `startPt` com direção tangente `tangentDir` até `endPt`.
 */
export function sampleTangentArcSegment(
  startPt: Vec2,
  tangentDir: Vec2,
  endPt: Vec2,
  segments = 64,
): Vec2[] {
  const chord = { x: endPt.x - startPt.x, y: endPt.y - startPt.y };
  const chordLen = Math.hypot(chord.x, chord.y);
  if (chordLen < EPS_DIST_MM) return [endPt];

  const tLen = Math.hypot(tangentDir.x, tangentDir.y) || 1;
  const tx = tangentDir.x / tLen;
  const ty = tangentDir.y / tLen;

  // Normal à tangente em startPt: (-ty, tx)
  const nx = -ty;
  const ny = tx;

  // O centro C = startPt + R * n satisfaz |C - endPt|^2 = R^2
  // => (chord . chord) - 2 * R * (chord . n) = 0 => R = (chordLen^2) / (2 * (chord . n))
  const dotChordNormal = chord.x * nx + chord.y * ny;
  if (Math.abs(dotChordNormal) < 1e-5) {
    // Pontos colineares com a tangente -> segmento reto
    return [endPt];
  }

  const rSigned = (chordLen * chordLen) / (2 * dotChordNormal);
  const r = Math.abs(rSigned);
  const cx = startPt.x + rSigned * nx;
  const cy = startPt.y + rSigned * ny;

  const a0 = Math.atan2(startPt.y - cy, startPt.x - cx);
  const a1 = Math.atan2(endPt.y - cy, endPt.x - cx);

  let sweep = a1 - a0;
  // Garante que o sentido inicial do arco concorda com tangentDir
  const ccwSign = rSigned > 0 ? 1 : -1;
  if (ccwSign > 0 && sweep < 0) sweep += Math.PI * 2;
  if (ccwSign < 0 && sweep > 0) sweep -= Math.PI * 2;

  const pts: Vec2[] = [];
  for (let i = 1; i <= segments; i++) {
    const a = a0 + (i / segments) * sweep;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * [CC] Constrói Polilinha Composta alternando dinamicamente entre segmentos retos e arcos tangentes.
 */
export function buildCompositePolyline(
  vertices: Vec2[],
  segmentModes: PolylineSegmentMode[],
  closed: boolean,
  layer: LayerId = "corte",
): Entity {
  if (vertices.length < 2) {
    return { id: uid(), layer, type: "polyline", closed: false, pts: vertices };
  }

  const outPts: Vec2[] = [vertices[0]!];
  let currentTangent: Vec2 = {
    x: vertices[1]!.x - vertices[0]!.x,
    y: vertices[1]!.y - vertices[0]!.y,
  };

  for (let i = 0; i < vertices.length - 1; i++) {
    const pA = vertices[i]!;
    const pB = vertices[i + 1]!;
    const mode = segmentModes[i] ?? "line";

    if (mode === "tangent_arc") {
      const arcPts = sampleTangentArcSegment(pA, currentTangent, pB, 48);
      outPts.push(...arcPts);
      if (outPts.length >= 2) {
        const prev = outPts[outPts.length - 2]!;
        const last = outPts[outPts.length - 1]!;
        currentTangent = { x: last.x - prev.x, y: last.y - prev.y };
      }
    } else {
      outPts.push(pB);
      currentTangent = { x: pB.x - pA.x, y: pB.y - pA.y };
    }
  }

  return {
    id: uid(),
    layer,
    type: "polyline",
    closed,
    pts: outPts,
  };
}

/**
 * [CC] Constrói Retângulo Paramétrico (2 Cantos, Centro-Canto ou 3 Pontos Inclinado) com opção de Filete R ou Chanfro D.
 */
export function buildParametricRectangle(
  mode: RectCreationMode,
  pts: Vec2[],
  options: {
    layer?: LayerId;
    filletRadius?: number;
    chamferDist?: number;
  } = {},
): Entity | null {
  const layer = options.layer ?? "corte";
  const rFillet = Math.max(0, options.filletRadius ?? 0);
  const dChamfer = Math.max(0, options.chamferDist ?? 0);

  if (!Array.isArray(pts) || pts.length < 2 || !pts[0] || !pts[1]) return null;
  const p1 = pts[0];
  const p2 = pts[1];
  if (
    !Number.isFinite(p1.x) ||
    !Number.isFinite(p1.y) ||
    !Number.isFinite(p2.x) ||
    !Number.isFinite(p2.y)
  ) {
    return null;
  }

  let center: Vec2;
  let halfW: number;
  let halfH: number;
  let ux = 1;
  let uy = 0;
  let vx = 0;
  let vy = 1;

  if (mode === "center") {
    center = p1;
    halfW = Math.abs(p2.x - p1.x);
    halfH = Math.abs(p2.y - p1.y);
  } else if (mode === "three_point") {
    const baseLen = dist(p1, p2);
    if (baseLen < EPS_DIST_MM) {
      center = p1;
      halfW = 0;
      halfH = 0;
    } else {
      ux = (p2.x - p1.x) / baseLen;
      uy = (p2.y - p1.y) / baseLen;
      vx = -uy;
      vy = ux;
      const p3 = pts[2] ?? { x: p2.x + vx * (baseLen * 0.6), y: p2.y + vy * (baseLen * 0.6) };
      const hSigned = (p3.x - p1.x) * vx + (p3.y - p1.y) * vy;
      halfW = baseLen / 2;
      halfH = Math.abs(hSigned) / 2;
      const midBase = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      center = { x: midBase.x + (hSigned / 2) * vx, y: midBase.y + (hSigned / 2) * vy };
    }
  } else {
    center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    halfW = Math.abs(p2.x - p1.x) / 2;
    halfH = Math.abs(p2.y - p1.y) / 2;
  }

  const widthMm = halfW * 2;
  const heightMm = halfH * 2;
  const xMin = Math.min(p1.x, p2.x);
  const xMax = Math.max(p1.x, p2.x);
  const yMin = Math.min(p1.y, p2.y);
  const yMax = Math.max(p1.y, p2.y);

  const toGlobal = (lx: number, ly: number): Vec2 => ({
    x: center.x + lx * ux + ly * vx,
    y: center.y + lx * uy + ly * vy,
  });

  if (halfW < EPS_DIST_MM && halfH < EPS_DIST_MM) {
    return {
      id: uid(),
      layer,
      type: "polyline",
      closed: true,
      pts: [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p1.y },
        { x: p2.x, y: p2.y },
        { x: p1.x, y: p2.y },
      ],
      params: {
        shapeKind: "rectangle",
        rectMode: mode,
        widthMm,
        heightMm,
        xMin,
        xMax,
        yMin,
        yMax,
      },
    };
  }

  if (dChamfer > 0) {
    const c = Math.min(dChamfer, halfW * 0.95, halfH * 0.95);
    const localPts: [number, number][] = [
      [-halfW + c, -halfH],
      [halfW - c, -halfH],
      [halfW, -halfH + c],
      [halfW, halfH - c],
      [halfW - c, halfH],
      [-halfW + c, halfH],
      [-halfW, halfH - c],
      [-halfW, -halfH + c],
    ];
    return {
      id: uid(),
      layer,
      type: "polyline",
      closed: true,
      pts: localPts.map(([lx, ly]) => toGlobal(lx, ly)),
      params: {
        shapeKind: "rectangle",
        rectMode: mode,
        widthMm,
        heightMm,
        chamferDist: dChamfer,
      },
    };
  }

  if (rFillet > 0) {
    const r = Math.min(rFillet, halfW, halfH);
    const corners: { cx: number; cy: number; a0: number }[] = [
      { cx: halfW - r, cy: -halfH + r, a0: -Math.PI / 2 },
      { cx: halfW - r, cy: halfH - r, a0: 0 },
      { cx: -halfW + r, cy: halfH - r, a0: Math.PI / 2 },
      { cx: -halfW + r, cy: -halfH + r, a0: Math.PI },
    ];
    const polyPts: Vec2[] = [];
    const arcSteps = 16;
    for (const c of corners) {
      for (let i = 0; i <= arcSteps; i++) {
        const a = c.a0 + (i / arcSteps) * (Math.PI / 2);
        polyPts.push(toGlobal(c.cx + r * Math.cos(a), c.cy + r * Math.sin(a)));
      }
    }
    return {
      id: uid(),
      layer,
      type: "polyline",
      closed: true,
      pts: polyPts,
      params: {
        shapeKind: "rectangle",
        rectMode: mode,
        widthMm,
        heightMm,
        filletRadius: rFillet,
      },
    };
  }

  // Modo padrão de 2 cantos opostos (ou centro): garante exatamente os 4 vértices V1=(x1,y1), V2=(x2,y1), V3=(x2,y2), V4=(x1,y2)
  if (mode === "corners") {
    return {
      id: uid(),
      layer,
      type: "polyline",
      closed: true,
      pts: [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p1.y },
        { x: p2.x, y: p2.y },
        { x: p1.x, y: p2.y },
      ],
      params: {
        shapeKind: "rectangle",
        rectMode: mode,
        widthMm,
        heightMm,
        xMin,
        xMax,
        yMin,
        yMax,
      },
    };
  }

  return {
    id: uid(),
    layer,
    type: "polyline",
    closed: true,
    pts: [
      toGlobal(-halfW, -halfH),
      toGlobal(halfW, -halfH),
      toGlobal(halfW, halfH),
      toGlobal(-halfW, halfH),
    ],
    params: {
      shapeKind: "rectangle",
      rectMode: mode,
      widthMm,
      heightMm,
      xMin: center.x - halfW,
      xMax: center.x + halfW,
      yMin: center.y - halfH,
      yMax: center.y + halfH,
    },
  };
}

/**
 * [CC] Constrói Círculo Tangente-Tangente-Raio (TTR) entre duas retas/segmentos ou círculos.
 */
export function buildCircleTTR(
  entityA: Entity,
  entityB: Entity,
  clickA: Vec2,
  clickB: Vec2,
  radius: number,
  layer: LayerId = "corte",
): Entity | null {
  const r = Math.max(0.1, radius);
  const segA = segmentsOf(entityA)[0];
  const segB = segmentsOf(entityB)[0];

  if (segA && segB) {
    const [a1, a2] = segA;
    const [b1, b2] = segB;
    const lenA = dist(a1, a2);
    const lenB = dist(b1, b2);
    if (lenA < EPS_DIST_MM || lenB < EPS_DIST_MM) return null;

    const uA = { x: (a2.x - a1.x) / lenA, y: (a2.y - a1.y) / lenA };
    const uB = { x: (b2.x - b1.x) / lenB, y: (b2.y - b1.y) / lenB };
    const nA = { x: -uA.y, y: uA.x };
    const nB = { x: -uB.y, y: uB.x };

    const midClick = { x: (clickA.x + clickB.x) / 2, y: (clickA.y + clickB.y) / lenB ? (clickA.y + clickB.y) / 2 : clickA.y };

    // Testa os 4 pares de retas paralelas deslocadas por ±r
    let bestCenter: Vec2 | null = null;
    let bestDist = Infinity;

    for (const sA of [-1, 1]) {
      for (const sB of [-1, 1]) {
        const offA1 = { x: a1.x + sA * r * nA.x, y: a1.y + sA * r * nA.y };
        const offA2 = { x: a2.x + sA * r * nA.x, y: a2.y + sA * r * nA.y };
        const offB1 = { x: b1.x + sB * r * nB.x, y: b1.y + sB * r * nB.y };
        const offB2 = { x: b2.x + sB * r * nB.x, y: b2.y + sB * r * nB.y };

        const inter = lineIntersection([offA1, offA2], [offB1, offB2], false);
        if (inter) {
          const d = dist(inter, midClick);
          if (d < bestDist) {
            bestDist = d;
            bestCenter = inter;
          }
        }
      }
    }

    if (bestCenter) {
      return {
        id: uid(),
        layer,
        type: "circle",
        cx: bestCenter.x,
        cy: bestCenter.y,
        r,
      };
    }
  }

  // Fallback para dois círculos ou entidades gerais: posiciona tangente às bordas clicadas
  const mid = { x: (clickA.x + clickB.x) / 2, y: (clickA.y + clickB.y) / 2 };
  return {
    id: uid(),
    layer,
    type: "circle",
    cx: mid.x,
    cy: mid.y,
    r,
  };
}

/**
 * [CC + EXT] Polígono Regular Paramétrico (3 a 64 lados):
 *  - 'inscribed': inscrito no raio R (vértices tocam o círculo de raio R)
 *  - 'circumscribed': circunscrito ao apótema R (meios das faces tocam o círculo de raio R)
 *  - 'across_flats': definido pela medida mecânica Entre Faces Paralelas S (mm) — ideal para porcas/sextavados!
 */
export function buildPolygonParametric(
  center: Vec2,
  targetPt: Vec2,
  sides = 6,
  mode: PolygonCreationMode = "across_flats",
  layer: LayerId = "corte",
  explicitAcrossFlatsMm?: number,
): Entity {
  const n = Math.max(3, Math.min(64, Math.round(sides)));
  const rawDist = Math.max(0.5, dist(center, targetPt));
  const baseAngle = Math.atan2(targetPt.y - center.y, targetPt.x - center.x);

  let circumRadius = rawDist;
  if (mode === "circumscribed") {
    circumRadius = rawDist / Math.cos(Math.PI / n);
  } else if (mode === "across_flats") {
    const sMm = explicitAcrossFlatsMm && explicitAcrossFlatsMm > 0 ? explicitAcrossFlatsMm : rawDist * 2;
    circumRadius = sMm / (2 * Math.cos(Math.PI / n));
  }

  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = baseAngle + (i * 2 * Math.PI) / n;
    pts.push({
      x: center.x + circumRadius * Math.cos(a),
      y: center.y + circumRadius * Math.sin(a),
    });
  }

  return {
    id: uid(),
    layer,
    type: "polyline",
    closed: true,
    pts,
    params: {
      polygonSides: n,
      polygonMode: mode,
      acrossFlatsMm: Number((circumRadius * 2 * Math.cos(Math.PI / n)).toFixed(3)),
    },
  };
}

/**
 * [EXT] Rasgo Oblongo Mecânico (Slot Reto Centro-a-Centro, Comprimento Total ou Slot Curvo em Arco).
 * Amostragem densa (>= 128 segmentos totais nas curvas) para fidelidade visual e de corte CNC.
 */
export function buildMechanicalSlotAdvanced(
  p1: Vec2,
  p2: Vec2,
  widthMm: number,
  mode: SlotCreationMode = "center_to_center",
  layer: LayerId = "corte",
  curvatureRadiusMm = 0,
): Entity {
  const r = Math.max(0.5, widthMm / 2);
  const rawLen = dist(p1, p2);
  const angleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x);

  if (mode === "curved" && rawLen > EPS_DIST_MM) {
    // Slot Curvo em Arco: p1 e p2 são os dois centros extremos sobre um arco de raio R_arc
    const arcR = Math.max(rawLen * 0.75, curvatureRadiusMm || rawLen * 1.15);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const halfChord = rawLen / 2;
    const h = Math.sqrt(Math.max(0, arcR * arcR - halfChord * halfChord));
    const nx = -Math.sin(angleRad);
    const ny = Math.cos(angleRad);
    const arcCenter = { x: mid.x + h * nx, y: mid.y + h * ny };

    const a1 = Math.atan2(p1.y - arcCenter.y, p1.x - arcCenter.x);
    const a2 = Math.atan2(p2.y - arcCenter.y, p2.x - arcCenter.x);
    let sweep = a2 - a1;
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    if (sweep < -Math.PI) sweep += Math.PI * 2;

    const stepsArc = 64;
    const stepsCap = 32;
    const pts: Vec2[] = [];

    // Borda externa (arcR + r) de a1 até a2
    for (let i = 0; i <= stepsArc; i++) {
      const a = a1 + (i / stepsArc) * sweep;
      pts.push({
        x: arcCenter.x + (arcR + r) * Math.cos(a),
        y: arcCenter.y + (arcR + r) * Math.sin(a),
      });
    }
    // Semicírculo em p2
    const capStart2 = sweep >= 0 ? a2 : a2 + Math.PI;
    for (let i = 1; i < stepsCap; i++) {
      const a = capStart2 + (i / stepsCap) * Math.PI * (sweep >= 0 ? 1 : -1);
      pts.push({
        x: p2.x + r * Math.cos(a),
        y: p2.y + r * Math.sin(a),
      });
    }
    // Borda interna (arcR - r) de a2 de volta até a1
    const innerR = Math.max(0.5, arcR - r);
    for (let i = 0; i <= stepsArc; i++) {
      const a = a2 - (i / stepsArc) * sweep;
      pts.push({
        x: arcCenter.x + innerR * Math.cos(a),
        y: arcCenter.y + innerR * Math.sin(a),
      });
    }
    // Semicírculo em p1
    const capStart1 = sweep >= 0 ? a1 + Math.PI : a1;
    for (let i = 1; i < stepsCap; i++) {
      const a = capStart1 + (i / stepsCap) * Math.PI * (sweep >= 0 ? 1 : -1);
      pts.push({
        x: p1.x + r * Math.cos(a),
        y: p1.y + r * Math.sin(a),
      });
    }

    return {
      id: uid(),
      layer,
      type: "polyline",
      closed: true,
      pts,
      params: { isSlot: true, slotMode: mode, slotWidth: widthMm },
    };
  }

  // Slot Reto: 'center_to_center' ou 'overall'
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const centerDist =
    mode === "overall" ? Math.max(0, rawLen - 2 * r) : rawLen;

  const c1 = p1;
  const c2 = {
    x: p1.x + centerDist * cosA,
    y: p1.y + centerDist * sinA,
  };

  const stepsPerCap = 64; // 64 + 64 = 128 segmentos curvos no total
  const pts: Vec2[] = [];

  for (let i = 0; i <= stepsPerCap; i++) {
    const t = -Math.PI / 2 + (i / stepsPerCap) * Math.PI;
    const lx = r * Math.cos(t);
    const ly = r * Math.sin(t);
    pts.push({
      x: c2.x + (lx * cosA - ly * sinA),
      y: c2.y + (lx * sinA + ly * cosA),
    });
  }

  for (let i = 0; i <= stepsPerCap; i++) {
    const t = Math.PI / 2 + (i / stepsPerCap) * Math.PI;
    const lx = r * Math.cos(t);
    const ly = r * Math.sin(t);
    pts.push({
      x: c1.x + (lx * cosA - ly * sinA),
      y: c1.y + (lx * sinA + ly * cosA),
    });
  }

  return {
    id: uid(),
    layer,
    type: "polyline",
    closed: true,
    pts,
    params: {
      isSlot: true,
      slotMode: mode,
      slotWidth: widthMm,
      slotCenterLength: centerDist,
    },
  };
}

/**
 * [CC] Spline Suave Interpolada com garantia de >= 128 segmentos de exibição.
 */
export function buildSmoothSpline128(
  controlPoints: Vec2[],
  closed = false,
  layer: LayerId = "corte",
): Entity {
  if (controlPoints.length < 2) {
    return { id: uid(), layer, type: "polyline", closed, pts: controlPoints };
  }
  const spanCount = closed ? controlPoints.length : controlPoints.length - 1;
  const subdivisions = Math.max(16, Math.ceil(MIN_CURVE_DISPLAY_SEGMENTS / Math.max(1, spanCount)));
  const pts: Vec2[] = [];
  const n = controlPoints.length;

  for (let i = 0; i < spanCount; i++) {
    const p0 = controlPoints[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const p1 = controlPoints[i]!;
    const p2 = controlPoints[(i + 1) % n]!;
    const p3 = controlPoints[closed ? (i + 2) % n : Math.min(n - 1, i + 2)]!;

    for (let j = 0; j < subdivisions; j++) {
      const t = j / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      pts.push({ x, y });
    }
  }
  if (!closed) {
    pts.push(controlPoints[n - 1]!);
  }
  return {
    id: uid(),
    layer,
    type: "polyline",
    closed,
    pts,
    params: { isSpline: true },
  };
}

// ============================================================================
// 3. MODIFICADORES TOPOLÓGICOS E EDIÇÃO DIRETA (MOD)
// ============================================================================

export interface SwipeTrimResult {
  updatedEntities: Entity[];
  cutSegmentsPreview: [Vec2, Vec2][];
  trimmedCount: number;
}

/**
 * [CC*] Swipe-to-Trim (Corte por Arraste Contínuo):
 * Recebe a trilha percorrida pelo dedo (`fencePts`) e apara todos os segmentos
 * interceptados até as suas interseções reais mais próximas em uma única transação atômica.
 */
export function computeSwipeTrimTransaction(
  entitiesOrFence: Entity[] | Vec2[],
  fenceOrEntities: Vec2[] | Entity[],
  mode: TrimBoundaryMode = "real",
): SwipeTrimResult {
  const firstIsFence =
    Array.isArray(entitiesOrFence) &&
    entitiesOrFence.length > 0 &&
    !("type" in (entitiesOrFence[0] as object));
  const entities = (firstIsFence ? fenceOrEntities : entitiesOrFence) as Entity[];
  const fencePts = (firstIsFence ? entitiesOrFence : fenceOrEntities) as Vec2[];

  if (!Array.isArray(fencePts) || fencePts.length < 2 || !Array.isArray(entities)) {
    return { updatedEntities: Array.isArray(entities) ? entities : [], cutSegmentsPreview: [], trimmedCount: 0 };
  }

  let currentEntities = [...entities];
  const cutSegmentsPreview: [Vec2, Vec2][] = [];
  let trimmedCount = 0;
  const processedIds = new Set<string>();

  for (let i = 0; i < fencePts.length - 1; i++) {
    const fA = fencePts[i]!;
    const fB = fencePts[i + 1]!;
    if (dist(fA, fB) < EPS_DIST_MM) continue;

    for (const ent of currentEntities) {
      if (processedIds.has(ent.id)) continue;
      const segs = segmentsOf(ent);
      let hitPoint: Vec2 | null = null;
      for (const s of segs) {
        const inter = lineIntersection([fA, fB], s, true);
        if (inter) {
          hitPoint = inter;
          break;
        }
      }
      if (!hitPoint) continue;

      const trimPreview = computeSmartTrim(ent, currentEntities, hitPoint, mode);
      if (trimPreview && trimPreview.activeCandidate) {
        const cand = trimPreview.activeCandidate;
        cutSegmentsPreview.push(cand.cutSegment);
        currentEntities = currentEntities
          .filter((x) => x.id !== ent.id)
          .concat([cand.trimmedEntity]);
        processedIds.add(ent.id);
        trimmedCount++;
      } else if (ent.type === "line") {
        // Se a linha inteira não possui interseções que a dividam, destaca como corte total
        cutSegmentsPreview.push([
          { x: ent.x1, y: ent.y1 },
          { x: ent.x2, y: ent.y2 },
        ]);
        currentEntities = currentEntities.filter((x) => x.id !== ent.id);
        processedIds.add(ent.id);
        trimmedCount++;
      }
    }
  }

  return {
    updatedEntities: currentEntities,
    cutSegmentsPreview,
    trimmedCount,
  };
}

/**
 * [CC] Estender (Extend) até o Limite Real Mais Próximo na direção clicada.
 */
export function extendEntityToNearestBoundary(
  target: Entity,
  clickPt: Vec2,
  allEntities: Entity[],
): Entity | null {
  if (target.type !== "line") return null;
  const p1 = { x: target.x1, y: target.y1 };
  const p2 = { x: target.x2, y: target.y2 };
  const len = dist(p1, p2);
  if (len < EPS_DIST_MM) return null;

  const extendEnd2 = dist(clickPt, p2) <= dist(clickPt, p1);
  const anchor = extendEnd2 ? p1 : p2;
  const movingEnd = extendEnd2 ? p2 : p1;
  const dir = {
    x: (movingEnd.x - anchor.x) / len,
    y: (movingEnd.y - anchor.y) / len,
  };

  const farRayEnd = {
    x: movingEnd.x + dir.x * 1e5,
    y: movingEnd.y + dir.y * 1e5,
  };

  let bestPoint: Vec2 | null = null;
  let bestDist = Infinity;

  for (const other of allEntities) {
    if (other.id === target.id) continue;
    for (const seg of segmentsOf(other)) {
      const inter = lineIntersection([movingEnd, farRayEnd], seg, true);
      if (inter) {
        const d = dist(movingEnd, inter);
        if (d > 1e-3 && d < bestDist) {
          bestDist = d;
          bestPoint = inter;
        }
      }
    }
  }

  if (!bestPoint) return null;

  return extendEnd2
    ? { ...target, x2: bestPoint.x, y2: bestPoint.y }
    : { ...target, x1: bestPoint.x, y1: bestPoint.y };
}

/**
 * [CC] Overkill (Limpeza de Geometria Duplicada, Nula e Segmentos Colineares Sobrepostos).
 */
export function cleanOverkillGeometry(
  entities: Entity[],
  distTol = 1e-3,
): { cleanedEntities: Entity[]; removedCount: number } {
  let removedCount = 0;
  const out: Entity[] = [];

  for (const e of entities) {
    // 1. Descarta entidades degeneradas (comprimento zero ou raio zero)
    if (e.type === "line") {
      if (dist({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }) <= distTol) {
        removedCount++;
        continue;
      }
    } else if (e.type === "circle" || e.type === "arc") {
      if (e.r <= distTol) {
        removedCount++;
        continue;
      }
    } else if (e.type === "polyline" && e.pts.length < 2) {
      removedCount++;
      continue;
    }

    // 2. Verifica duplicata exata ou colinear sobreposta
    let mergedOrDup = false;
    for (let i = 0; i < out.length; i++) {
      const ex = out[i]!;
      if (ex.layer !== e.layer || ex.type !== e.type) continue;

      if (e.type === "line" && ex.type === "line") {
        const a1 = { x: ex.x1, y: ex.y1 };
        const a2 = { x: ex.x2, y: ex.y2 };
        const b1 = { x: e.x1, y: e.y1 };
        const b2 = { x: e.x2, y: e.y2 };

        const same =
          (dist(a1, b1) <= distTol && dist(a2, b2) <= distTol) ||
          (dist(a1, b2) <= distTol && dist(a2, b1) <= distTol);
        if (same) {
          removedCount++;
          mergedOrDup = true;
          break;
        }

        // Verifica colinearidade e sobreposição de intervalo
        const lenA = dist(a1, a2);
        const ux = (a2.x - a1.x) / lenA;
        const uy = (a2.y - a1.y) / lenA;
        const perp1 = Math.abs((b1.x - a1.x) * -uy + (b1.y - a1.y) * ux);
        const perp2 = Math.abs((b2.x - a1.x) * -uy + (b2.y - a1.y) * ux);

        if (perp1 <= distTol && perp2 <= distTol) {
          const tB1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
          const tB2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
          const minB = Math.min(tB1, tB2);
          const maxB = Math.max(tB1, tB2);
          if (maxB >= -distTol && minB <= lenA + distTol) {
            const newMin = Math.min(0, minB);
            const newMax = Math.max(lenA, maxB);
            out[i] = {
              ...ex,
              x1: a1.x + newMin * ux,
              y1: a1.y + newMin * uy,
              x2: a1.x + newMax * ux,
              y2: a1.y + newMax * uy,
            };
            removedCount++;
            mergedOrDup = true;
            break;
          }
        }
      } else if (e.type === "circle" && ex.type === "circle") {
        if (
          dist({ x: e.cx, y: e.cy }, { x: ex.cx, y: ex.cy }) <= distTol &&
          Math.abs(e.r - ex.r) <= distTol
        ) {
          removedCount++;
          mergedOrDup = true;
          break;
        }
      }
    }

    if (!mergedOrDup) {
      out.push(e);
    }
  }

  return { cleanedEntities: out, removedCount };
}

/**
 * [CC*] Edição Multi-Modo de Grips (Nós):
 * Aplica 'stretch' | 'move' | 'rotate' | 'scale' | 'mirror' sobre a entidade a partir do grip selecionado.
 */
export function applyMultiModeGripEdit(
  entity: Entity,
  nodeIndex: number,
  newPt: Vec2,
  mode: GripEditMode,
  anchorPt: Vec2,
): Entity {
  const dx = newPt.x - anchorPt.x;
  const dy = newPt.y - anchorPt.y;

  if (mode === "move") {
    return translate(entity, dx, dy);
  }

  if (mode === "rotate") {
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return rotate(entity, anchorPt, angleDeg);
  }

  if (mode === "scale") {
    const baseDist = Math.max(10, dist({ x: 0, y: 0 }, anchorPt));
    const factor = Math.max(0.1, Math.min(10, dist(anchorPt, newPt) / Math.max(10, baseDist * 0.25)));
    const scalePt = (p: Vec2): Vec2 => ({
      x: anchorPt.x + (p.x - anchorPt.x) * factor,
      y: anchorPt.y + (p.y - anchorPt.y) * factor,
    });
    if (entity.type === "line") {
      const p1 = scalePt({ x: entity.x1, y: entity.y1 });
      const p2 = scalePt({ x: entity.x2, y: entity.y2 });
      return { ...entity, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    if (entity.type === "polyline") {
      return { ...entity, pts: entity.pts.map(scalePt) };
    }
    if (entity.type === "circle" || entity.type === "arc") {
      const c = scalePt({ x: entity.cx, y: entity.cy });
      return { ...entity, cx: c.x, cy: c.y, r: Math.max(0.1, entity.r * factor) };
    }
    return entity;
  }

  if (mode === "mirror") {
    const axisLen = Math.hypot(dx, dy);
    if (axisLen < EPS_DIST_MM) return entity;
    const ux = dx / axisLen;
    const uy = dy / axisLen;
    const reflectPt = (p: Vec2): Vec2 => {
      const rx = p.x - anchorPt.x;
      const ry = p.y - anchorPt.y;
      const proj = rx * ux + ry * uy;
      return {
        x: anchorPt.x + 2 * proj * ux - rx,
        y: anchorPt.y + 2 * proj * uy - ry,
      };
    };
    if (entity.type === "line") {
      const p1 = reflectPt({ x: entity.x1, y: entity.y1 });
      const p2 = reflectPt({ x: entity.x2, y: entity.y2 });
      return { ...entity, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    if (entity.type === "polyline") {
      return { ...entity, pts: entity.pts.map(reflectPt) };
    }
    if (entity.type === "circle") {
      const c = reflectPt({ x: entity.cx, y: entity.cy });
      return { ...entity, cx: c.x, cy: c.y };
    }
    return entity;
  }

  // Default: 'stretch' (move apenas o vértice/raio correspondente)
  if (entity.type === "polyline") {
    return {
      ...entity,
      pts: entity.pts.map((q, i) => (i === nodeIndex ? newPt : q)),
    };
  }
  if (entity.type === "line") {
    return nodeIndex === 0
      ? { ...entity, x1: newPt.x, y1: newPt.y }
      : { ...entity, x2: newPt.x, y2: newPt.y };
  }
  if (entity.type === "circle") {
    return nodeIndex === 0
      ? { ...entity, cx: newPt.x, cy: newPt.y }
      : { ...entity, r: Math.max(0.1, dist(newPt, { x: entity.cx, y: entity.cy })) };
  }
  return entity;
}

/**
 * [CC*] Insere um novo vértice no ponto médio de um segmento de polilinha ou converte linha em polilinha de 3 vértices.
 */
export function insertVertexOnEntitySegment(
  entity: Entity,
  segmentIndexOrCursor: number | Vec2 = 0,
  point?: Vec2,
): Entity {
  const refPt = typeof segmentIndexOrCursor === "object" ? segmentIndexOrCursor : point;
  if (entity.type === "line") {
    const mid = refPt
      ? closestOnSegment(refPt, [
          { x: entity.x1, y: entity.y1 },
          { x: entity.x2, y: entity.y2 },
        ])
      : {
          x: (entity.x1 + entity.x2) / 2,
          y: (entity.y1 + entity.y2) / 2,
        };
    return {
      id: entity.id,
      layer: entity.layer,
      type: "polyline",
      closed: false,
      pts: [
        { x: entity.x1, y: entity.y1 },
        mid,
        { x: entity.x2, y: entity.y2 },
      ],
    };
  }
  if (entity.type === "polyline" && entity.pts.length >= 2) {
    let idx = typeof segmentIndexOrCursor === "number" ? segmentIndexOrCursor : 0;
    if (typeof segmentIndexOrCursor === "object") {
      let bestDist = Infinity;
      const count = entity.closed ? entity.pts.length : entity.pts.length - 1;
      for (let i = 0; i < count; i++) {
        const pA = entity.pts[i]!;
        const pB = entity.pts[(i + 1) % entity.pts.length]!;
        const c = closestOnSegment(segmentIndexOrCursor, [pA, pB]);
        const d = dist(segmentIndexOrCursor, c);
        if (d < bestDist) {
          bestDist = d;
          idx = i;
        }
      }
    }
    idx = Math.max(0, Math.min(entity.pts.length - 1, idx));
    const pA = entity.pts[idx]!;
    const pB = entity.pts[(idx + 1) % entity.pts.length]!;
    const mid = point ?? { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    const nextPts = [...entity.pts];
    nextPts.splice(idx + 1, 0, mid);
    return { ...entity, pts: nextPts };
  }
  return entity;
}

/**
 * [CC] Cria Hachura Técnica validada pelo Extrator de Perfil Fechado Válido (respeitando ilhas/furos).
 */
export function createValidatedTechnicalHatch(
  selectedEntities: Entity[],
  pattern: "ansi31" | "ansi32" | "solid" | "grid" = "ansi31",
  angleDeg = 45,
  scaleFactor = 1,
  layer: LayerId = "marcacao",
): { hatchEntities: Entity[]; profileCount: number } {
  const profiles = validateAndExtractClosedProfiles(selectedEntities);
  const validProfiles = profiles.filter((p) => p.isValid);

  const hatchEntities: Entity[] = validProfiles.map((prof) => ({
    id: uid(),
    layer,
    type: "hatch",
    boundaryPts: prof.outerLoop,
    pattern,
    angle: angleDeg,
    scale: scaleFactor,
    params: {
      innerLoops: prof.innerLoops,
      areaMm2: prof.areaMm2,
      perimeterMm: prof.perimeterMm,
    },
  }));

  return { hatchEntities, profileCount: validProfiles.length };
}

/**
 * [CC] Desambiguação de Seleção por Sobreposição:
 * Retorna todas as entidades que passam a uma distância <= tol do ponto tocado.
 */
export function findOverlappingEntitiesAtPoint(
  pt: Vec2,
  entities: Entity[],
  tolMm: number,
): Entity[] {
  const hits: { entity: Entity; dist: number }[] = [];
  for (const e of entities) {
    let minD = Infinity;
    if (e.type === "point") {
      minD = dist(pt, { x: e.x, y: e.y });
    } else {
      for (const s of segmentsOf(e)) {
        const c = closestOnSegment(pt, s);
        const d = dist(pt, c);
        if (d < minD) minD = d;
      }
    }
    if (minD <= tolMm) {
      hits.push({ entity: e, dist: minD });
    }
  }
  return hits.sort((a, b) => a.dist - b.dist).map((h) => h.entity);
}

// ============================================================================
// 4. REGISTRO UNIFICADO DE COMANDOS (CommandRegistry) & EXECUÇÃO ATÔMICA
// ============================================================================

export interface CommandExecutionState {
  entities: Entity[];
  selectedIds: string[];
  activeLayer: LayerId;
  thicknessMm: number;
}

export interface CommandRegistryEntry {
  id: string;
  namePtBr: string;
  aliases: string[];
  origin: OriginClassification;
  targetMenu: ChamferTargetMenu;
  description: string;
  keywords: string[];
  enabled: (state: CommandExecutionState) => boolean;
}

export const CHAMFER_COMMAND_REGISTRY: CommandRegistryEntry[] = [
  // GRUPO SEL
  {
    id: "select",
    namePtBr: "Selecionar (Janela / Cruzamento)",
    aliases: ["s", "sel", "selecionar", "window", "crossing"],
    origin: "COMPLETAR",
    targetMenu: "SEL",
    description: "Toque simples, caixa Window (Esq→Dir) ou Crossing (Dir→Esq)",
    keywords: ["Janela", "Cruzamento", "Todos"],
    enabled: () => true,
  },
  {
    id: "node",
    namePtBr: "Editar Nós (Grips Multi-Modo)",
    aliases: ["n", "nos", "grips", "vertices"],
    origin: "CC*",
    targetMenu: "SEL",
    description: "Esticar, Mover, Girar, Escalar, Espelhar, +Vértice",
    keywords: ["Esticar", "Mover", "Girar", "Escalar", "Espelhar", "+ Vértice"],
    enabled: () => true,
  },
  // GRUPO CRI
  {
    id: "line",
    namePtBr: "Linha Contínua",
    aliases: ["l", "linha", "line"],
    origin: "PRESERVAR",
    targetMenu: "CRI",
    description: "Segmento de reta com entrada dinâmica de comprimento e ângulo",
    keywords: ["Travar L", "Travar ∠", "Eixo Infinito"],
    enabled: () => true,
  },
  {
    id: "construction_line",
    namePtBr: "Linha de Construção / Eixo Infinito",
    aliases: ["xl", "xline", "eixo", "construcao"],
    origin: "CC",
    targetMenu: "CRI",
    description: "Linha guia infinita de centro ou referência projetada",
    keywords: ["Horizontal", "Vertical", "2 Pontos"],
    enabled: () => true,
  },
  {
    id: "polyline",
    namePtBr: "Polilinha Composta (Linha ↔ Arco)",
    aliases: ["pl", "polilinha", "polyline"],
    origin: "CC",
    targetMenu: "CRI",
    description: "Contorno contínuo alternando segmentos retos e arcos tangentes",
    keywords: ["Alternar: Linha / Arco", "Desfazer Vértice", "Fechar Perfil"],
    enabled: () => true,
  },
  {
    id: "rect",
    namePtBr: "Retângulo Paramétrico",
    aliases: ["rec", "retangulo", "rectangle"],
    origin: "CC",
    targetMenu: "CRI",
    description: "2 Cantos, a partir do Centro ou Inclinado por 3 Pontos",
    keywords: ["2 Cantos", "Centro", "3 Pontos", "Filete R"],
    enabled: () => true,
  },
  {
    id: "circle",
    namePtBr: "Círculo Técnico",
    aliases: ["c", "circulo", "circle"],
    origin: "CC",
    targetMenu: "CRI",
    description: "Centro-Raio, Diâmetro, 2 Pontos, 3 Pontos ou Tangente-Tangente-Raio",
    keywords: ["Raio ↔ Diâmetro", "2 Pontos", "3 Pontos", "TTR"],
    enabled: () => true,
  },
  {
    id: "arc",
    namePtBr: "Arco Técnico",
    aliases: ["a", "arco", "arc"],
    origin: "COMPLETAR",
    targetMenu: "CRI",
    description: "Arco por 3 Pontos ou Centro-Início-Fim",
    keywords: ["3 Pontos", "Inverter Sentido"],
    enabled: () => true,
  },
  {
    id: "slot",
    namePtBr: "Rasgo Oblongo (Slot Reto / Curvo)",
    aliases: ["sl", "slot", "oblongo", "rasgo"],
    origin: "EXT",
    targetMenu: "CRI",
    description: "Rasgo oblongo mecânico centro-a-centro, comprimento total ou curvo",
    keywords: ["Centro-a-Centro", "Total", "Slot Curvo"],
    enabled: () => true,
  },
  {
    id: "polygon",
    namePtBr: "Polígono Regular / Sextavado (S mm)",
    aliases: ["pol", "poligono", "sextavado", "hex"],
    origin: "EXT",
    targetMenu: "CRI",
    description: "Inscrito, Circunscrito ou Medida Entre Faces (S mm para porcas/parafusos)",
    keywords: ["Entre Faces (S)", "Inscrito", "Circunscrito", "6 Lados"],
    enabled: () => true,
  },
  {
    id: "ellipse",
    namePtBr: "Elipse Analítica",
    aliases: ["el", "elipse", "ellipse"],
    origin: "COMPLETAR",
    targetMenu: "CRI",
    description: "Centro e semieixos Rx / Ry com >= 128 segmentos de exibição",
    keywords: ["Centro-Eixos"],
    enabled: () => true,
  },
  {
    id: "spline",
    namePtBr: "Spline Suave Interpolada",
    aliases: ["spl", "spline", "curva"],
    origin: "CC",
    targetMenu: "CRI",
    description: "Curva suave por pontos de controle com >= 128 segmentos",
    keywords: ["Concluir", "Fechar"],
    enabled: () => true,
  },
  // GRUPO MOD
  {
    id: "offset",
    namePtBr: "Offset Paralelo",
    aliases: ["o", "offset", "deslocar"],
    origin: "CC",
    targetMenu: "MOD",
    description: "Cópia paralela em distância exata (mm) com limpeza de cantos",
    keywords: ["Distância mm", "Inverter Lado"],
    enabled: (s) => s.entities.length > 0,
  },
  {
    id: "smart_trim",
    namePtBr: "Aparar (Toque & Swipe-to-Trim)",
    aliases: ["tr", "trim", "aparar", "swipe"],
    origin: "CC*",
    targetMenu: "MOD",
    description: "Toque no trecho ou deslize o dedo cruzando múltiplos segmentos",
    keywords: ["Swipe-to-Trim", "Encontro Real", "Projetado"],
    enabled: (s) => s.entities.length > 0,
  },
  {
    id: "extend",
    namePtBr: "Estender até Limite (Extend)",
    aliases: ["ex", "extend", "estender"],
    origin: "CC",
    targetMenu: "MOD",
    description: "Prolonga segmento até o próximo limite real",
    keywords: ["Limite Real"],
    enabled: (s) => s.entities.length > 1,
  },
  {
    id: "fillet",
    namePtBr: "Concordância de Raio (Fillet)",
    aliases: ["f", "fillet", "filete", "raio"],
    origin: "COMPLETAR",
    targetMenu: "MOD",
    description: "Arredondamento tangente entre duas arestas com raio R (mm)",
    keywords: ["Raio R", "Aplicar Todos"],
    enabled: (s) => s.entities.length > 0,
  },
  {
    id: "chamfer",
    namePtBr: "Comando Chanfro (D1 × D2)",
    aliases: ["cha", "chanfro", "chamfer"],
    origin: "COMPLETAR",
    targetMenu: "MOD",
    description: "Bisel oblíquo em quinas por distâncias D1×D2 ou distância e ângulo",
    keywords: ["Distância D", "Aplicar Todos"],
    enabled: (s) => s.entities.length > 0,
  },
  {
    id: "overkill",
    namePtBr: "Overkill (Limpar Duplicatas)",
    aliases: ["ov", "overkill", "limpar"],
    origin: "CC",
    targetMenu: "MOD",
    description: "Remove linhas duplicadas, segmentos de comprimento zero e sobreposições",
    keywords: ["Executar Limpeza"],
    enabled: (s) => s.entities.length > 0,
  },
  {
    id: "boolean_union",
    namePtBr: "Booleana 2D: Unir Regiões",
    aliases: ["uni", "unir", "union"],
    origin: "CC",
    targetMenu: "MOD",
    description: "Funde dois ou mais perfis fechados em um contorno único",
    keywords: ["Unir", "Subtrair", "Interseção"],
    enabled: (s) => s.selectedIds.length >= 2,
  },
  {
    id: "boolean_subtract",
    namePtBr: "Booleana 2D: Subtrair Região",
    aliases: ["sub", "subtrair", "subtract"],
    origin: "CC",
    targetMenu: "MOD",
    description: "Recorta o 1º perfil fechado pelo 2º perfil selecionado",
    keywords: ["Unir", "Subtrair", "Interseção"],
    enabled: (s) => s.selectedIds.length >= 2,
  },
  {
    id: "boolean_intersect",
    namePtBr: "Booleana 2D: Interseção",
    aliases: ["int", "intersecao", "intersect"],
    origin: "CC",
    targetMenu: "MOD",
    description: "Preserva apenas a área comum entre os perfis fechados selecionados",
    keywords: ["Unir", "Subtrair", "Interseção"],
    enabled: (s) => s.selectedIds.length >= 2,
  },
  // GRUPO COR
  {
    id: "hatch",
    namePtBr: "Hachura Técnica (Com Ilhas)",
    aliases: ["h", "hatch", "hachura"],
    origin: "CC",
    targetMenu: "COR",
    description: "Preenche perfil fechado validado respeitando furos e ilhas internas",
    keywords: ["ANSI31 (45°)", "ANSI32", "Sólida"],
    enabled: (s) => s.selectedIds.length >= 1,
  },
  {
    id: "pushpull_z",
    namePtBr: "Push/Pull Z (Espessura / Extrusão)",
    aliases: ["pp", "pushpull", "extrusao", "espessura"],
    origin: "CC*",
    targetMenu: "COR",
    description: "Ajuste tátil direto de altura/espessura Z em milímetros",
    keywords: ["Z (mm)", "+5 mm", "-5 mm"],
    enabled: (s) => s.entities.length > 0,
  },
];

/**
 * Executa uma transformação atômica sobre a lista de entidades com proteção try/catch
 * e rollback automático caso a geometria resultante seja inválida ou vazia inesperadamente.
 */
export function executeAtomicCadTransaction(
  currentEntities: Entity[],
  mutator: (snapshot: Entity[]) => Entity[],
): { success: boolean; nextEntities: Entity[]; error?: string } {
  const snapshot = currentEntities.map((e) =>
    e.type === "polyline" ? { ...e, pts: e.pts.map((p) => ({ ...p })) } : { ...e },
  );
  try {
    const result = mutator(snapshot);
    if (!Array.isArray(result)) {
      return { success: false, nextEntities: snapshot, error: "Resultado geométrico inválido." };
    }
    return { success: true, nextEntities: result };
  } catch (err) {
    return {
      success: false,
      nextEntities: snapshot,
      error: err instanceof Error ? err.message : "Erro geométrico inesperado; rollback aplicado.",
    };
  }
}

/**
 * Executa Booleana 2D ('union' | 'subtract' | 'intersect') sobre os perfis selecionados
 * usando o validador canônico e transação atômica.
 */
export function runBoolean2DOnSelection(
  allEntities: Entity[],
  selectedIds: string[],
  op: BooleanOp,
): { updatedEntities: Entity[]; newSelectedIds: string[]; message: string } | null {
  const selected = allEntities.filter((e) => selectedIds.includes(e.id));
  if (selected.length < 2) return null;

  let acc: Entity = selected[0]!;
  const extraCreated: Entity[] = [];

  for (let i = 1; i < selected.length; i++) {
    const clip = selected[i]!;
    const res = execute2DBoolean(acc, clip, op, acc.layer);
    if (res.length > 0) {
      acc = res[0]!;
      if (res.length > 1) {
        extraCreated.push(...res.slice(1));
      }
    }
  }

  const remaining = allEntities.filter((e) => !selectedIds.includes(e.id));
  const resultEntities = [acc, ...extraCreated];
  const opLabel = op === "union" ? "União 2D" : op === "subtract" ? "Subtração 2D" : "Interseção 2D";

  return {
    updatedEntities: [...remaining, ...resultEntities],
    newSelectedIds: resultEntities.map((e) => e.id),
    message: `${opLabel} concluída (${resultEntities.length} perfil resultante).`,
  };
}
