/**
 * CALDRA CHAMFER CAD — SEAMLESS 2D ↔ 3D GEOMETRIC BRIDGE & MORPH CONTROLLER
 *
 * Responsabilidades:
 * 1. Analisar e validar rigorosamente as entidades reais do esboço 2D (`Entity[]`),
 *    separando contornos fechados válidos (com furos internos e múltiplos contornos)
 *    de geometrias abertas ou camadas construtivas.
 * 2. Preservar coordenadas reais 1:1 entre o canvas 2D `(x, y)` e o plano de trabalho
 *    3D XY `(X = x, Y = -y, Z = 0)`, sem recentralizar na origem nem substituir por primitivas genéricas.
 * 3. Sincronizar deterministicamente o recurso paramétrico vinculado (`feat_sketch_base_extrude`)
 *    na `CadFeatureTree`, preservando recursos 3D subsequentes (fillet, chamfer, furos) e evitando duplicação.
 * 4. Calcular a correspondência óptica exata de câmera (`match2DViewportTo3DCamera`) no quadro `t = 0`
 *    e controlar a máquina de estados e interpolação contínua `cubic-bezier(0.22, 1, 0.36, 1)`
 *    (550 ms na ida 2D -> 3D, 500 ms na volta 3D -> 2D, com reversão suave em caso de interrupção).
 */

import { outlinePoints, type Entity, type Vec2 } from "@/lib/lab2d/core";
import type { CadFeatureTree } from "../features/CadFeatureTree";
import type { ExtrudeSketchParams } from "../features/CadFeatureModel";

export const LINKED_SKETCH_FEATURE_ID = "feat_sketch_base_extrude";

export type MorphTransitionState =
  | "2D_IDLE"
  | "PREPARING_3D"
  | "TRANSITIONING_TO_3D"
  | "3D_IDLE"
  | "TRANSITIONING_TO_2D"
  | "TRANSITION_ERROR";

export type Sketch3DValidationStatus =
  | "VALID_SOLID"
  | "OPEN_OR_EMPTY_SKETCH"
  | "SELF_INTERSECTING_SKETCH"
  | "INVALID_THICKNESS";

export interface AnalyticalCircle2D {
  cx: number;
  cy: number;
  r: number;
}

export interface Sketch3DHole {
  points: Array<{ x: number; y: number }>;
  circle?: AnalyticalCircle2D;
  sourceEntityIds: string[];
}

export interface Sketch3DContour {
  points: Array<{ x: number; y: number }>;
  circle?: AnalyticalCircle2D;
  holes: Sketch3DHole[];
  area: number;
  sourceEntityIds: string[];
}

export interface Sketch3DWireframe {
  id: string;
  points: Array<{ x: number; y: number; z: number }>;
  closed: boolean;
  layer: string;
  isConstruction: boolean;
}

export interface SketchBounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface SketchBounds3D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  length: number;
  height: number;
  centerX: number;
  centerY: number;
  centerZ: number;
}

export interface Sketch3DAnalysis {
  status: Sketch3DValidationStatus;
  message?: string;
  thickness: number;
  contours: Sketch3DContour[];
  wireframes: Sketch3DWireframe[];
  bounds2D: SketchBounds2D | null;
  bounds3D: SketchBounds3D | null;
  sourceEntityIds: string[];
  fingerprint: string;
  hasOpenCutGeometry: boolean;
}

export interface CameraPose3D {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  visibleHeightMm: number;
  visibleWidthMm: number;
  phiRad: number;
  thetaRad: number;
  distance: number;
}

export interface Camera2DTo3DMatch {
  view2D: { tx: number; ty: number; k: number };
  viewport: { width: number; height: number };
  fovDeg: number;
  startPose: CameraPose3D;
  endPose: CameraPose3D;
  pose2D: CameraPose3D;
  pose3D: CameraPose3D;
}

const NON_PROFILE_LAYERS = new Set([
  "construcao",
  "construção",
  "referencia",
  "referência",
  "cota",
  "cotas",
  "anotacoes",
  "anotações",
  "auxiliar",
  "dobra",
  "marcacao",
  "marcação",
  "centro",
]);

export function isProfileCutEntity(e: Entity): boolean {
  if (e.isConstruction) return false;
  if (e.type === "text" || e.type === "point" || e.type === "hatch") return false;
  const layer = (e.layer || "corte").toLowerCase().trim();
  return !NON_PROFILE_LAYERS.has(layer);
}

export function signedPolygonArea(pts: ReadonlyArray<{ x: number; y: number }>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon2D(
  pt: { x: number; y: number },
  poly: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Remove vértices consecutivos quase idênticos para evitar arestas degeneradas no OCCT.
 */
export function cleanPolygonPoints(
  pts: ReadonlyArray<{ x: number; y: number }>,
  minSegLen = 1e-3,
): Array<{ x: number; y: number }> {
  if (pts.length === 0) return [];
  const out: Array<{ x: number; y: number }> = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = pts[i]!;
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= minSegLen) {
      out.push(cur);
    }
  }
  if (out.length > 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y) < minSegLen) {
      out.pop();
    }
  }
  return out;
}

/**
 * Verifica se um polígono fechado possui autointerseção estrita entre arestas não-adjacentes.
 */
export function hasPolygonSelfIntersection(pts: ReadonlyArray<{ x: number; y: number }>): boolean {
  const n = pts.length;
  if (n < 4) return false;
  // Para polígonos densos (ex: círculos amostrados de 128+ segmentos), ignora checagem quadrática
  if (n >= 64) return false;

  const ccw = (
    A: { x: number; y: number },
    B: { x: number; y: number },
    C: { x: number; y: number },
  ) => (C.y - A.y) * (B.x - A.x) - (B.y - A.y) * (C.x - A.x);

  const segmentsProperlyIntersect = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ): boolean => {
    const d1 = ccw(p3, p4, p1);
    const d2 = ccw(p3, p4, p2);
    const d3 = ccw(p1, p2, p3);
    const d4 = ccw(p1, p2, p4);
    const eps = 1e-5;
    if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
      return true;
    }
    return false;
  };

  for (let i = 0; i < n; i++) {
    const a1 = pts[i]!;
    const a2 = pts[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // arestas adjacentes no fechamento
      const b1 = pts[j]!;
      const b2 = pts[(j + 1) % n]!;
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

interface RawClosedLoop2D {
  pts2D: Array<{ x: number; y: number }>;
  circle2D?: AnalyticalCircle2D;
  area: number;
  entityIds: string[];
}

interface ChainableSegment {
  id: string;
  pts: Array<{ x: number; y: number }>;
}

/**
 * Detecta se um polígono fechado representa um círculo discretizado (mesmo que tenha vindo
 * de polilinha de 16–64 lados) e recupera seu centro (cx, cy) e raio analítico exato R.
 */
export function detectAnalyticalCircle2D(
  pts: ReadonlyArray<{ x: number; y: number }>,
): AnalyticalCircle2D | undefined {
  const n = pts.length;
  if (n < 12) return undefined;

  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += pts[i]!.x;
    my += pts[i]!.y;
  }
  mx /= n;
  my /= n;

  let suu = 0;
  let svv = 0;
  let suv = 0;
  let ru = 0;
  let rv = 0;
  for (let i = 0; i < n; i++) {
    const u = pts[i]!.x - mx;
    const v = pts[i]!.y - my;
    const u2v2 = u * u + v * v;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    ru += 0.5 * u * u2v2;
    rv += 0.5 * v * u2v2;
  }

  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-6) return undefined;

  const cx = mx + (ru * svv - rv * suv) / det;
  const cy = my + (suu * rv - suv * ru) / det;

  let rSum = 0;
  for (let i = 0; i < n; i++) {
    rSum += Math.hypot(pts[i]!.x - cx, pts[i]!.y - cy);
  }
  const r = rSum / n;
  if (!Number.isFinite(r) || r <= 0.25) return undefined;

  const tol = Math.max(0.08, r * 0.015);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pts[i]!.x - cx, pts[i]!.y - cy);
    if (Math.abs(d - r) > tol) return undefined;
  }

  // Confirma que a área poligonal corresponde a um círculo completo de 360°
  const polyArea = Math.abs(signedPolygonArea(pts));
  const idealPolyArea = 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);
  if (Math.abs(polyArea - idealPolyArea) > idealPolyArea * 0.04) {
    return undefined;
  }

  return { cx, cy, r };
}

function sampleCirclePoints2D(cx: number, cy: number, r: number, segments = 128): Array<{ x: number; y: number }> {
  return Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  });
}

function sampleArcPoints2D(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segments = 128,
): Array<{ x: number; y: number }> {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const count = Math.max(16, Math.min(256, Math.ceil((sweep / (Math.PI * 2)) * segments)));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const a = a0 + (sweep * i) / count;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * Extrai todos os laços fechados 2D (em coordenadas do canvas 2D) e identifica se restaram
 * segmentos abertos não fechados nas camadas de corte.
 */
function extractClosedLoops2D(entities: Entity[]): {
  loops: RawClosedLoop2D[];
  hasOpenCutSegments: boolean;
  hasSelfIntersection: boolean;
} {
  const loops: RawClosedLoop2D[] = [];
  const chainCandidates: ChainableSegment[] = [];
  let hasOpenCutSegments = false;
  let hasSelfIntersection = false;

  for (const e of entities) {
    if (!isProfileCutEntity(e)) continue;

    if (e.type === "circle") {
      if (!Number.isFinite(e.cx) || !Number.isFinite(e.cy) || !Number.isFinite(e.r) || e.r <= 0.05) {
        continue;
      }
      const pts2D = sampleCirclePoints2D(e.cx, e.cy, e.r, 128);
      loops.push({
        pts2D,
        circle2D: { cx: e.cx, cy: e.cy, r: e.r },
        area: Math.PI * e.r * e.r,
        entityIds: [e.id],
      });
    } else if (e.type === "ellipse") {
      if (!Number.isFinite(e.cx) || !Number.isFinite(e.cy) || e.rx <= 0.05 || e.ry <= 0.05) {
        continue;
      }
      const pts2D = cleanPolygonPoints(outlinePoints(e));
      const area = Math.abs(signedPolygonArea(pts2D));
      if (pts2D.length >= 3 && area >= 1e-2) {
        loops.push({ pts2D, area, entityIds: [e.id] });
      }
    } else if (e.type === "polyline") {
      if (e.closed && e.pts.length >= 3) {
        const pts2D = cleanPolygonPoints(e.pts);
        const area = Math.abs(signedPolygonArea(pts2D));
        if (pts2D.length >= 3 && area >= 1e-2) {
          const detectedCircle = detectAnalyticalCircle2D(pts2D);
          if (detectedCircle) {
            loops.push({
              pts2D: sampleCirclePoints2D(detectedCircle.cx, detectedCircle.cy, detectedCircle.r, 128),
              circle2D: detectedCircle,
              area: Math.PI * detectedCircle.r * detectedCircle.r,
              entityIds: [e.id],
            });
          } else if (hasPolygonSelfIntersection(pts2D)) {
            hasSelfIntersection = true;
          } else {
            loops.push({ pts2D, area, entityIds: [e.id] });
          }
        }
      } else if (e.pts.length >= 2) {
        // Verifica se a polilinha aberta tem primeiro e último pontos coincidentes
        const first = e.pts[0]!;
        const last = e.pts[e.pts.length - 1]!;
        if (e.pts.length >= 4 && Math.hypot(first.x - last.x, first.y - last.y) < 1.0) {
          const pts2D = cleanPolygonPoints(e.pts.slice(0, -1));
          const area = Math.abs(signedPolygonArea(pts2D));
          if (pts2D.length >= 3 && area >= 1e-2) {
            const detectedCircle = detectAnalyticalCircle2D(pts2D);
            if (detectedCircle) {
              loops.push({
                pts2D: sampleCirclePoints2D(detectedCircle.cx, detectedCircle.cy, detectedCircle.r, 128),
                circle2D: detectedCircle,
                area: Math.PI * detectedCircle.r * detectedCircle.r,
                entityIds: [e.id],
              });
            } else if (hasPolygonSelfIntersection(pts2D)) {
              hasSelfIntersection = true;
            } else {
              loops.push({ pts2D, area, entityIds: [e.id] });
            }
          }
        } else {
          chainCandidates.push({ id: e.id, pts: e.pts });
        }
      }
    } else if (e.type === "path") {
      const sampled = outlinePoints(e);
      if (e.closed && sampled.length >= 3) {
        const pts2D = cleanPolygonPoints(sampled);
        const area = Math.abs(signedPolygonArea(pts2D));
        if (pts2D.length >= 3 && area >= 1e-2) {
          const detectedCircle = detectAnalyticalCircle2D(pts2D);
          if (detectedCircle) {
            loops.push({
              pts2D: sampleCirclePoints2D(detectedCircle.cx, detectedCircle.cy, detectedCircle.r, 128),
              circle2D: detectedCircle,
              area: Math.PI * detectedCircle.r * detectedCircle.r,
              entityIds: [e.id],
            });
          } else {
            loops.push({ pts2D, area, entityIds: [e.id] });
          }
        }
      } else if (sampled.length >= 2) {
        chainCandidates.push({ id: e.id, pts: sampled });
      }
    } else if (e.type === "line") {
      if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) >= 1e-3) {
        chainCandidates.push({
          id: e.id,
          pts: [
            { x: e.x1, y: e.y1 },
            { x: e.x2, y: e.y2 },
          ],
        });
      }
    } else if (e.type === "arc") {
      if (e.r > 0.05) {
        const arcPts = sampleArcPoints2D(e.cx, e.cy, e.r, e.a0, e.a1, 128);
        if (arcPts.length >= 2) {
          chainCandidates.push({ id: e.id, pts: arcPts });
        }
      }
    }
  }

  // Encadeamento de segmentos (linhas, arcos e polilinhas abertas conectadas)
  if (chainCandidates.length > 0) {
    const usedIndices = new Set<number>();
    const tol = 1.2;

    for (let i = 0; i < chainCandidates.length; i++) {
      if (usedIndices.has(i)) continue;
      const startSeg = chainCandidates[i]!;
      const chainPts: Array<{ x: number; y: number }> = [...startSeg.pts];
      const currentIndices = [i];
      const currentIds = [startSeg.id];
      let closed = false;

      while (!closed) {
        const tail = chainPts[chainPts.length - 1]!;
        let foundNext = false;

        for (let j = 0; j < chainCandidates.length; j++) {
          if (usedIndices.has(j) || currentIndices.includes(j)) continue;
          const cand = chainCandidates[j]!;
          const cStart = cand.pts[0]!;
          const cEnd = cand.pts[cand.pts.length - 1]!;

          if (Math.hypot(cStart.x - tail.x, cStart.y - tail.y) <= tol) {
            for (let k = 1; k < cand.pts.length; k++) {
              chainPts.push(cand.pts[k]!);
            }
            currentIndices.push(j);
            currentIds.push(cand.id);
            foundNext = true;
            break;
          } else if (Math.hypot(cEnd.x - tail.x, cEnd.y - tail.y) <= tol) {
            for (let k = cand.pts.length - 2; k >= 0; k--) {
              chainPts.push(cand.pts[k]!);
            }
            currentIndices.push(j);
            currentIds.push(cand.id);
            foundNext = true;
            break;
          }
        }

        const head = chainPts[0]!;
        const newTail = chainPts[chainPts.length - 1]!;
        if (
          chainPts.length >= 4 &&
          (currentIndices.length >= 2 || startSeg.pts.length >= 4) &&
          Math.hypot(newTail.x - head.x, newTail.y - head.y) <= tol
        ) {
          closed = true;
          currentIndices.forEach((idx) => usedIndices.add(idx));
          const cleaned = cleanPolygonPoints(chainPts.slice(0, -1));
          const area = Math.abs(signedPolygonArea(cleaned));
          if (cleaned.length >= 3 && area >= 1e-2) {
            const detectedCircle = detectAnalyticalCircle2D(cleaned);
            if (detectedCircle) {
              loops.push({
                pts2D: sampleCirclePoints2D(detectedCircle.cx, detectedCircle.cy, detectedCircle.r, 128),
                circle2D: detectedCircle,
                area: Math.PI * detectedCircle.r * detectedCircle.r,
                entityIds: currentIds,
              });
            } else if (hasPolygonSelfIntersection(cleaned)) {
              hasSelfIntersection = true;
            } else {
              loops.push({
                pts2D: cleaned,
                area,
                entityIds: currentIds,
              });
            }
          }
          break;
        }

        if (!foundNext) break;
      }
    }

    if (usedIndices.size < chainCandidates.length) {
      hasOpenCutSegments = true;
    }
  }

  loops.sort((a, b) => b.area - a.area);
  return { loops, hasOpenCutSegments, hasSelfIntersection };
}

/**
 * Extrai representações de fios 3D (no plano XY, Z = 0, com Y invertido `Y = -y2d`)
 * para todas as entidades 2D visíveis, garantindo que esboços abertos também possam
 * ser visualizados em 3D na posição exata com resolução radial de 128 segmentos.
 */
export function extract3DSketchWireframes(entities: Entity[]): Sketch3DWireframe[] {
  const out: Sketch3DWireframe[] = [];
  const to3D = (p: Vec2) => ({ x: p.x, y: -p.y, z: 0 });

  for (const e of entities) {
    if (e.type === "text" || e.type === "point" || e.type === "hatch") continue;
    const isConstruction = !isProfileCutEntity(e);

    if (e.type === "line") {
      if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 1e-3) continue;
      out.push({
        id: e.id,
        points: [to3D({ x: e.x1, y: e.y1 }), to3D({ x: e.x2, y: e.y2 })],
        closed: false,
        layer: e.layer,
        isConstruction,
      });
    } else if (e.type === "polyline" && e.pts.length >= 2) {
      const detectedCircle = e.closed ? detectAnalyticalCircle2D(cleanPolygonPoints(e.pts)) : undefined;
      const pts2D = detectedCircle
        ? sampleCirclePoints2D(detectedCircle.cx, detectedCircle.cy, detectedCircle.r, 128)
        : e.pts;
      out.push({
        id: e.id,
        points: pts2D.map(to3D),
        closed: e.closed,
        layer: e.layer,
        isConstruction,
      });
    } else if (e.type === "circle" && e.r > 0) {
      const pts = sampleCirclePoints2D(e.cx, e.cy, e.r, 128).map(to3D);
      out.push({
        id: e.id,
        points: pts,
        closed: true,
        layer: e.layer,
        isConstruction,
      });
    } else if (e.type === "arc" && e.r > 0) {
      const arcPts = sampleArcPoints2D(e.cx, e.cy, e.r, e.a0, e.a1, 128).map(to3D);
      out.push({
        id: e.id,
        points: arcPts,
        closed: false,
        layer: e.layer,
        isConstruction,
      });
    } else if (e.type === "ellipse" || e.type === "path") {
      const pts = outlinePoints(e).map(to3D);
      if (pts.length >= 2) {
        out.push({
          id: e.id,
          points: pts,
          closed: e.type === "ellipse" ? true : e.closed,
          layer: e.layer,
          isConstruction,
        });
      }
    }
  }

  return out;
}

/**
 * Analisa o esboço 2D ativo e a espessura do documento, produzindo o diagnóstico
 * geométrico 1:1 para o modo CAD 3D.
 */
export function analyze2DSketchFor3D(entities: Entity[], thickness: number): Sketch3DAnalysis {
  const wireframes = extract3DSketchWireframes(entities);
  const { loops, hasOpenCutSegments, hasSelfIntersection } = extractClosedLoops2D(entities);

  // Calcula bounding box 2D de todas as entidades de esboço (fechadas ou abertas)
  let minX2D = Infinity;
  let minY2D = Infinity;
  let maxX2D = -Infinity;
  let maxY2D = -Infinity;

  for (const wf of wireframes) {
    for (const pt of wf.points) {
      const x2d = pt.x;
      const y2d = -pt.y;
      if (Number.isFinite(x2d) && Number.isFinite(y2d)) {
        minX2D = Math.min(minX2D, x2d);
        maxX2D = Math.max(maxX2D, x2d);
        minY2D = Math.min(minY2D, y2d);
        maxY2D = Math.max(maxY2D, y2d);
      }
    }
  }

  // Agrupa contornos externos e furos internos por profundidade de contenção (par = contorno externo, ímpar = furo)
  const flipY = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });
  const flipCircle = (c?: AnalyticalCircle2D): AnalyticalCircle2D | undefined =>
    c ? { cx: c.cx, cy: -c.cy, r: c.r } : undefined;

  const parentIndex = new Array<number>(loops.length).fill(-1);
  const depthLevel = new Array<number>(loops.length).fill(0);

  for (let i = 0; i < loops.length; i++) {
    const inner = loops[i]!;
    const testPt = inner.pts2D[0]!;
    let depth = 0;
    let immediateParent = -1;
    // Como loops está ordenado do maior para o menor, os candidatos a pai têm índice j < i
    for (let j = i - 1; j >= 0; j--) {
      if (pointInPolygon2D(testPt, loops[j]!.pts2D)) {
        if (immediateParent === -1) {
          immediateParent = j;
        }
        depth++;
      }
    }
    parentIndex[i] = immediateParent;
    depthLevel[i] = depth;
  }

  const contourMap = new Map<number, Sketch3DContour>();
  const allSourceIds = new Set<string>();

  for (let i = 0; i < loops.length; i++) {
    const loop = loops[i]!;
    if (depthLevel[i]! % 2 === 0) {
      // Contorno externo (nível 0, 2, ...)
      const pts3D = loop.pts2D.map(flipY);
      // Garante orientação anti-horária (CCW) no plano XY 3D para normal +Z consistente
      if (signedPolygonArea(pts3D) < 0) {
        pts3D.reverse();
      }
      loop.entityIds.forEach((id) => allSourceIds.add(id));
      contourMap.set(i, {
        points: pts3D,
        circle: flipCircle(loop.circle2D),
        holes: [],
        area: loop.area,
        sourceEntityIds: [...loop.entityIds],
      });
    } else {
      // Furo interno (nível 1, 3, ...) associado ao contorno externo pai
      const parentIdx = parentIndex[i]!;
      const parentContour = contourMap.get(parentIdx);
      if (parentContour) {
        const holePts3D = loop.pts2D.map(flipY);
        if (signedPolygonArea(holePts3D) < 0) {
          holePts3D.reverse();
        }
        loop.entityIds.forEach((id) => {
          allSourceIds.add(id);
          if (!parentContour.sourceEntityIds.includes(id)) {
            parentContour.sourceEntityIds.push(id);
          }
        });
        parentContour.holes.push({
          points: holePts3D,
          circle: flipCircle(loop.circle2D),
          sourceEntityIds: [...loop.entityIds],
        });
      }
    }
  }

  const contours = Array.from(contourMap.values());

  // Se houver contornos fechados válidos, refina os limites com base nos contornos sólidos
  if (contours.length > 0) {
    minX2D = Infinity;
    minY2D = Infinity;
    maxX2D = -Infinity;
    maxY2D = -Infinity;
    for (const c of contours) {
      for (const p of c.points) {
        const x2d = p.x;
        const y2d = -p.y;
        minX2D = Math.min(minX2D, x2d);
        maxX2D = Math.max(maxX2D, x2d);
        minY2D = Math.min(minY2D, y2d);
        maxY2D = Math.max(maxY2D, y2d);
      }
    }
  }

  const hasValidBounds =
    Number.isFinite(minX2D) &&
    Number.isFinite(maxX2D) &&
    Number.isFinite(minY2D) &&
    Number.isFinite(maxY2D);

  const bounds2D: SketchBounds2D | null = hasValidBounds
    ? {
        minX: minX2D,
        minY: minY2D,
        maxX: maxX2D,
        maxY: maxY2D,
        width: Math.max(0.1, maxX2D - minX2D),
        height: Math.max(0.1, maxY2D - minY2D),
        centerX: (minX2D + maxX2D) / 2,
        centerY: (minY2D + maxY2D) / 2,
      }
    : null;

  const validThickness = Number.isFinite(thickness) && thickness > 0;
  const effThickness = validThickness ? thickness : 0;

  const bounds3D: SketchBounds3D | null = bounds2D
    ? {
        minX: bounds2D.minX,
        maxX: bounds2D.maxX,
        minY: -bounds2D.maxY,
        maxY: -bounds2D.minY,
        minZ: 0,
        maxZ: effThickness,
        width: bounds2D.width,
        length: bounds2D.height,
        height: effThickness,
        centerX: bounds2D.centerX,
        centerY: -bounds2D.centerY,
        centerZ: effThickness / 2,
      }
    : null;

  // Fingerprint determinístico para detecção O(1) de mudanças no esboço 2D ou na espessura
  const fpParts: string[] = [`t:${Number(thickness || 0).toFixed(3)}`];
  for (const c of contours) {
    if (c.circle) {
      fpParts.push(`C:${c.circle.cx.toFixed(2)},${c.circle.cy.toFixed(2)},${c.circle.r.toFixed(2)}`);
    } else {
      const ptsSig = c.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(";");
      fpParts.push(`P:${ptsSig}`);
    }
    for (const h of c.holes) {
      if (h.circle) {
        fpParts.push(`HC:${h.circle.cx.toFixed(2)},${h.circle.cy.toFixed(2)},${h.circle.r.toFixed(2)}`);
      } else {
        const hSig = h.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(";");
        fpParts.push(`HP:${hSig}`);
      }
    }
  }
  const fingerprint = fpParts.join("|");

  if (!validThickness) {
    return {
      status: "INVALID_THICKNESS",
      message: "Espessura de chapa inválida (deve ser maior que 0 mm).",
      thickness,
      contours,
      wireframes,
      bounds2D,
      bounds3D,
      sourceEntityIds: Array.from(allSourceIds),
      fingerprint,
      hasOpenCutGeometry: hasOpenCutSegments,
    };
  }

  if (contours.length === 0) {
    if (hasSelfIntersection) {
      return {
        status: "SELF_INTERSECTING_SKETCH",
        message: "O perfil 2D possui autointerseção. Corrija o cruzamento de arestas para extrudar o sólido.",
        thickness,
        contours: [],
        wireframes,
        bounds2D,
        bounds3D,
        sourceEntityIds: [],
        fingerprint,
        hasOpenCutGeometry: true,
      };
    }
    return {
      status: "OPEN_OR_EMPTY_SKETCH",
      message:
        wireframes.length > 0
          ? "Perfil aberto no esboço 2D — exibindo geometria de referência no plano XY. Feche o contorno na camada Corte para extrudar sólido."
          : "Esboço 2D vazio — desenhe um perfil fechado no modo 2D SKETCH ou adicione uma primitiva 3D.",
      thickness,
      contours: [],
      wireframes,
      bounds2D,
      bounds3D,
      sourceEntityIds: [],
      fingerprint,
      hasOpenCutGeometry: hasOpenCutSegments || wireframes.length > 0,
    };
  }

  return {
    status: "VALID_SOLID",
    thickness,
    contours,
    wireframes,
    bounds2D,
    bounds3D,
    sourceEntityIds: Array.from(allSourceIds),
    fingerprint,
    hasOpenCutGeometry: hasOpenCutSegments,
  };
}

/**
 * Constrói os parâmetros tipados `ExtrudeSketchParams` para o nó vinculado `feat_sketch_base_extrude`.
 */
export function buildLinkedExtrudeParams(analysis: Sketch3DAnalysis): ExtrudeSketchParams {
  const primary = analysis.contours[0]!;
  const b3d = analysis.bounds3D;

  return {
    depth: Math.max(0.1, analysis.thickness),
    direction: "normal",
    endCondition: "blind",
    operation: "new_body",
    plane: "XY",
    width: b3d?.width ?? 100,
    length: b3d?.length ?? 100,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    isLinked2DSketch: true,
    sketchFingerprint: analysis.fingerprint,
    sourceEntityIds: analysis.sourceEntityIds,
    sketchProfile: {
      points: primary.points,
      circle: primary.circle,
      holes: primary.holes.map((h) => ({
        points: h.points,
        circle: h.circle,
      })),
      multiContours: analysis.contours.map((c) => ({
        points: c.points,
        circle: c.circle,
        holes: c.holes.map((h) => ({
          points: h.points,
          circle: h.circle,
        })),
      })),
    },
  };
}

/**
 * Sincroniza deterministicamente o esboço 2D com a `CadFeatureTree` sem duplicar features
 * e preservando operações 3D subsequentes (fillet, chamfer, furos, cortes).
 */
export function sync2DSketchToFeatureTree(
  tree: CadFeatureTree,
  analysis: Sketch3DAnalysis,
): {
  changed: boolean;
  hasSolidFeatures: boolean;
  linkedFeatureId: string | null;
} {
  const features = tree.getFeatures();
  const existingLinked = features.find(
    (f) =>
      f.id === LINKED_SKETCH_FEATURE_ID ||
      Boolean((f.parameters as ExtrudeSketchParams | undefined)?.isLinked2DSketch),
  );

  // Caso 4.1: Perfil 2D fechado válido e espessura positiva
  if (analysis.status === "VALID_SOLID" && analysis.contours.length > 0) {
    const nextParams = buildLinkedExtrudeParams(analysis);

    if (existingLinked) {
      const prevParams = existingLinked.parameters as ExtrudeSketchParams;
      const sameFingerprint =
        prevParams.sketchFingerprint === analysis.fingerprint &&
        Math.abs((prevParams.depth || 0) - analysis.thickness) < 1e-4 &&
        !existingLinked.isSuppressed;

      if (sameFingerprint && existingLinked.state === "VALID" && existingLinked.cachedShape) {
        return {
          changed: false,
          hasSolidFeatures: true,
          linkedFeatureId: existingLinked.id,
        };
      }

      if (existingLinked.isSuppressed) {
        tree.setFeatureSuppression(existingLinked.id, false);
      }
      tree.updateFeature(existingLinked.id, nextParams);
      return {
        changed: true,
        hasSolidFeatures: true,
        linkedFeatureId: existingLinked.id,
      };
    }

    // Não existia extrusão base vinculada: adiciona no início da árvore (ou como primeiro sólido)
    const created = tree.addFeature({
      id: LINKED_SKETCH_FEATURE_ID,
      name: `Extrusão Base 2D (${analysis.thickness.toFixed(1)} mm)`,
      type: "extrude_sketch",
      parameters: nextParams,
      references: analysis.sourceEntityIds,
    });

    // Se havia modificadores órfãos adicionados depois, garante que a extrusão base fique na ordem 0
    if (tree.getFeatures().length > 1 && created.order > 0) {
      tree.reorderFeature(created.id, 0);
    }

    return {
      changed: true,
      hasSolidFeatures: true,
      linkedFeatureId: created.id,
    };
  }

  // Caso 4.2 / 4.3: Esboço 2D aberto ou vazio
  let changed = false;
  if (existingLinked) {
    tree.deleteFeature(existingLinked.id);
    changed = true;
  }

  const remainingSolids = tree.getFeatures().filter(
    (f) =>
      !f.isSuppressed &&
      f.type !== "reference_plane" &&
      f.type !== "reference_axis" &&
      f.type !== "sketch_2d",
  );

  return {
    changed,
    hasSolidFeatures: remainingSolids.length > 0,
    linkedFeatureId: null,
  };
}

// ============================================================================
// MATEMÁTICA DE CURVA CUBIC-BEZIER(0.22, 1, 0.36, 1) E CORRESPONDÊNCIA DE CÂMERA
// ============================================================================

/**
 * Avalia `cubic-bezier(x1, y1, x2, y2)` analiticamente via método de Newton-Raphson + bisseção.
 */
export function evaluateCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tInput: number,
): number {
  if (tInput <= 0) return 0;
  if (tInput >= 1) return 1;

  const sampleCurveX = (u: number) =>
    (((1 - 3 * x2 + 3 * x1) * u + (3 * x2 - 6 * x1)) * u + 3 * x1) * u;
  const sampleCurveY = (u: number) =>
    (((1 - 3 * y2 + 3 * y1) * u + (3 * y2 - 6 * y1)) * u + 3 * y1) * u;
  const sampleCurveDerivativeX = (u: number) =>
    (3 * (1 - 3 * x2 + 3 * x1) * u + 2 * (3 * x2 - 6 * x1)) * u + 3 * x1;

  let u = tInput;
  for (let i = 0; i < 8; i++) {
    const xErr = sampleCurveX(u) - tInput;
    if (Math.abs(xErr) < 1e-6) break;
    const dx = sampleCurveDerivativeX(u);
    if (Math.abs(dx) < 1e-6) break;
    u -= xErr / dx;
  }

  u = Math.max(0, Math.min(1, u));
  return sampleCurveY(u);
}

/**
 * Curva oficial da transição CHAMFER 2D ↔ 3D: `cubic-bezier(0.22, 1, 0.36, 1)`
 */
export function cubicBezier022(t: number): number {
  return evaluateCubicBezier(0.22, 1.0, 0.36, 1.0, t);
}

/**
 * Converte ângulos orbitais `(phiRad, thetaRad)` relativos ao plano de trabalho XY (normal +Z)
 * em vetores ortonormais de direção da câmera (`offsetDir`) e `up` sem singularidade em `phi = 0`.
 *
 * Em `phi = 0, theta = 0` (Vista Superior 2D):
 * - `offsetDir = (0, 0, 1)` (câmera no eixo +Z olhando para -Z)
 * - `up = (0, 1, 0)` (+Y para cima na tela, +X para a direita na tela)
 */
export function computeOrbitalBasisZUp(
  phiRad: number,
  thetaRad: number,
): {
  offsetDir: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
} {
  const sinPhi = Math.sin(phiRad);
  const cosPhi = Math.cos(phiRad);
  const sinTheta = Math.sin(thetaRad);
  const cosTheta = Math.cos(thetaRad);

  return {
    offsetDir: {
      x: sinTheta * sinPhi,
      y: -cosTheta * sinPhi,
      z: cosPhi,
    },
    up: {
      x: -sinTheta * cosPhi,
      y: cosTheta * cosPhi,
      z: sinPhi,
    },
  };
}

/**
 * Calcula o estado inicial (`t = 0`, idêntico ao 2D) e o estado final (`t = 1`, perspectiva 3D oblíqua)
 * da câmera 3D a partir da transformação `view = { tx, ty, k }` e dimensões do viewport 2D.
 */
export function compute2DTo3DCameraMatch(
  view2D: { tx: number; ty: number; k: number },
  viewportWidth: number,
  viewportHeight: number,
  fovDeg = 38,
  modelBounds3D?: SketchBounds3D | null,
): Camera2DTo3DMatch {
  const w = Math.max(100, Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 800);
  const h = Math.max(100, Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 600);
  const k = Number.isFinite(view2D.k) && view2D.k > 1e-4 ? view2D.k : 1;
  const tx = Number.isFinite(view2D.tx) ? view2D.tx : w / 2;
  const ty = Number.isFinite(view2D.ty) ? view2D.ty : h / 2;

  // Coordenada 2D no centro exato do viewport: screen = world * k + t => world = (screen - t) / k
  const worldCenter2DX = (w / 2 - tx) / k;
  const worldCenter2DY = (h / 2 - ty) / k;

  // No plano 3D XY (onde Y_3D = -Y_2D):
  const target0X = worldCenter2DX;
  const target0Y = -worldCenter2DY;
  const target0Z = 0;

  const visibleHeight0 = h / k;
  const visibleWidth0 = w / k;

  const halfFovRad = ((fovDeg / 2) * Math.PI) / 180;
  const tanHalfFov = Math.tan(halfFovRad) || 0.344;
  const dist0 = Math.max(10, visibleHeight0 / (2 * tanHalfFov));

  const startPose: CameraPose3D = {
    position: { x: target0X, y: target0Y, z: target0Z + dist0 },
    target: { x: target0X, y: target0Y, z: target0Z },
    up: { x: 0, y: 1, z: 0 },
    visibleHeightMm: visibleHeight0,
    visibleWidthMm: visibleWidth0,
    phiRad: 0,
    thetaRad: 0,
    distance: dist0,
  };

  // Pose 3D final (Elevação de 55° acima do plano XY => phi = 35° da normal +Z; Azimute theta = -32°)
  const phi1 = (35 * Math.PI) / 180;
  const theta1 = (-32 * Math.PI) / 180;
  const basis1 = computeOrbitalBasisZUp(phi1, theta1);

  let target1X = target0X;
  let target1Y = target0Y;
  let target1Z = modelBounds3D ? modelBounds3D.centerZ : 1.5;
  let dist1 = dist0;

  if (modelBounds3D) {
    // Se a peça estiver muito fora do centro ou se o zoom 2D for extremo, aproxima suavemente
    // o pivô em direção ao centroide da peça mantendo a continuidade visual
    const dxCenter = Math.abs(modelBounds3D.centerX - target0X);
    const dyCenter = Math.abs(modelBounds3D.centerY - target0Y);
    if (dxCenter > visibleWidth0 * 0.45 || dyCenter > visibleHeight0 * 0.45) {
      target1X = modelBounds3D.centerX;
      target1Y = modelBounds3D.centerY;
    } else {
      // Mistura sutilmente para que a rotação ocorra em torno da região da peça sem deslocá-la bruscamente
      target1X = target0X * 0.35 + modelBounds3D.centerX * 0.65;
      target1Y = target0Y * 0.35 + modelBounds3D.centerY * 0.65;
    }

    const modelSpan = Math.max(
      modelBounds3D.width,
      modelBounds3D.length,
      modelBounds3D.height * 2,
      30,
    );
    const idealDist = (modelSpan * 1.35) / (2 * tanHalfFov);
    dist1 = Math.max(idealDist * 0.65, Math.min(idealDist * 2.2, dist0 * 1.04));
  }

  const visibleHeight1 = 2 * dist1 * tanHalfFov;
  const visibleWidth1 = visibleHeight1 * (w / h);

  const endPose: CameraPose3D = {
    position: {
      x: target1X + basis1.offsetDir.x * dist1,
      y: target1Y + basis1.offsetDir.y * dist1,
      z: target1Z + basis1.offsetDir.z * dist1,
    },
    target: { x: target1X, y: target1Y, z: target1Z },
    up: basis1.up,
    visibleHeightMm: visibleHeight1,
    visibleWidthMm: visibleWidth1,
    phiRad: phi1,
    thetaRad: theta1,
    distance: dist1,
  };

  return {
    view2D: { tx, ty, k },
    viewport: { width: w, height: h },
    fovDeg,
    startPose,
    endPose,
    pose2D: startPose,
    pose3D: endPose,
  };
}

/**
 * Interpola continuamente a pose da câmera entre `startPose` (`t = 0`) e `endPose` (`t = 1`),
 * usando interpolação orbital suave sem gimbal lock.
 */
export function evaluateMorphCameraPose(
  match: Camera2DTo3DMatch,
  rawProgress01: number,
): CameraPose3D {
  const t = Math.max(0, Math.min(1, rawProgress01));
  const s = cubicBezier022(t);

  const { startPose, endPose, viewport, fovDeg } = match;
  const lerp = (a: number, b: number) => a + (b - a) * s;

  const phiRad = lerp(startPose.phiRad, endPose.phiRad);
  const thetaRad = lerp(startPose.thetaRad, endPose.thetaRad);
  const distance = lerp(startPose.distance, endPose.distance);

  const target = {
    x: lerp(startPose.target.x, endPose.target.x),
    y: lerp(startPose.target.y, endPose.target.y),
    z: lerp(startPose.target.z, endPose.target.z),
  };

  const basis = computeOrbitalBasisZUp(phiRad, thetaRad);
  const position = {
    x: target.x + basis.offsetDir.x * distance,
    y: target.y + basis.offsetDir.y * distance,
    z: target.z + basis.offsetDir.z * distance,
  };

  const halfFovRad = ((fovDeg / 2) * Math.PI) / 180;
  const visibleHeightMm = 2 * distance * (Math.tan(halfFovRad) || 0.344);
  const visibleWidthMm = visibleHeightMm * (viewport.width / Math.max(1, viewport.height));

  return {
    position,
    target,
    up: basis.up,
    visibleHeightMm,
    visibleWidthMm,
    phiRad,
    thetaRad,
    distance,
  };
}

export const MORPH_TO_3D_DURATION_MS = 550;
export const MORPH_TO_2D_DURATION_MS = 500;

/**
 * Máquina de estados determinística da transição 2D ↔ 3D com suporte a interrupção e reversão suave.
 */
export class MorphTransitionController {
  private _state: MorphTransitionState = "2D_IDLE";
  private _progress3D = 0; // 0 = 2D puro, 1 = 3D completo
  private _lastError: string | null = null;

  public static readonly FORWARD_DURATION_MS = MORPH_TO_3D_DURATION_MS;
  public static readonly REVERSE_DURATION_MS = MORPH_TO_2D_DURATION_MS;

  get state(): MorphTransitionState {
    return this._state;
  }

  get progress3D(): number {
    return this._progress3D;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  public getSnapshot(): {
    state: MorphTransitionState;
    progress3D: number;
    lastError: string | null;
  } {
    return {
      state: this._state,
      progress3D: this._progress3D,
      lastError: this._lastError,
    };
  }

  /**
   * Solicita entrada no modo 3D (2D -> 3D).
   * Se estiver voltando para 2D (`TRANSITIONING_TO_2D`), inverte imediatamente a partir do progresso atual.
   */
  public requestEnter3D(): {
    nextState: MorphTransitionState;
    state: MorphTransitionState;
    startProgress: number;
    startProgress3D: number;
    durationMs: number;
  } {
    this._lastError = null;
    if (this._state === "3D_IDLE" || this._state === "TRANSITIONING_TO_3D") {
      const durationMs = Math.max(
        120,
        Math.round((1 - this._progress3D) * MorphTransitionController.FORWARD_DURATION_MS),
      );
      return {
        nextState: this._state,
        state: this._state,
        startProgress: this._progress3D,
        startProgress3D: this._progress3D,
        durationMs,
      };
    }

    if (this._state === "TRANSITIONING_TO_2D") {
      // Reversão no meio da volta para o 2D
      this._state = "TRANSITIONING_TO_3D";
      const remaining = Math.max(0.15, 1 - this._progress3D);
      const durationMs = Math.max(
        180,
        Math.round(remaining * MorphTransitionController.FORWARD_DURATION_MS),
      );
      return {
        nextState: this._state,
        state: this._state,
        startProgress: this._progress3D,
        startProgress3D: this._progress3D,
        durationMs,
      };
    }

    this._state = "PREPARING_3D";
    this._progress3D = 0;
    return {
      nextState: "PREPARING_3D",
      state: "PREPARING_3D",
      startProgress: 0,
      startProgress3D: 0,
      durationMs: MorphTransitionController.FORWARD_DURATION_MS,
    };
  }

  public requestTo3D() {
    return this.requestEnter3D();
  }

  /**
   * Chamado quando o Quadro 0 do 3D está pronto e alinhado opticamente com o 2D.
   */
  public beginForwardMorph(): {
    nextState: MorphTransitionState;
    durationMs: number;
  } {
    if (this._state !== "PREPARING_3D" && this._state !== "TRANSITIONING_TO_3D") {
      return { nextState: this._state, durationMs: 0 };
    }
    this._state = "TRANSITIONING_TO_3D";
    const remaining = Math.max(0.15, 1 - this._progress3D);
    return {
      nextState: "TRANSITIONING_TO_3D",
      durationMs: Math.round(remaining * MorphTransitionController.FORWARD_DURATION_MS),
    };
  }

  public beginTransitionTo3D(): MorphTransitionState {
    return this.beginForwardMorph().nextState;
  }

  /**
   * Atualiza o progresso contínuo `[0..1]` durante a animação.
   */
  public setProgress3D(p: number): void {
    this._progress3D = Math.max(0, Math.min(1, p));
  }

  public updateProgress(p: number): void {
    this.setProgress3D(p);
  }

  /**
   * Conclui a transição de ida para 3D.
   */
  public completeEnter3D(): MorphTransitionState {
    this._progress3D = 1;
    this._state = "3D_IDLE";
    return this._state;
  }

  public completeTransitionTo3D(): MorphTransitionState {
    return this.completeEnter3D();
  }

  /**
   * Solicita retorno ao modo 2D (3D -> 2D).
   * Se estiver em `PREPARING_3D`, cancela imediatamente (0 ms).
   * Se estiver em `TRANSITIONING_TO_3D`, inverte suavemente a partir do ponto atual.
   */
  public requestReturn2D(): {
    nextState: MorphTransitionState;
    state: MorphTransitionState;
    startProgress: number;
    startProgress3D: number;
    durationMs: number;
  } {
    if (this._state === "2D_IDLE") {
      return {
        nextState: "2D_IDLE",
        state: "2D_IDLE",
        startProgress: 0,
        startProgress3D: 0,
        durationMs: 0,
      };
    }

    if (this._state === "PREPARING_3D" || this._state === "TRANSITION_ERROR") {
      this._state = "2D_IDLE";
      this._progress3D = 0;
      return {
        nextState: "2D_IDLE",
        state: "2D_IDLE",
        startProgress: 0,
        startProgress3D: 0,
        durationMs: 0,
      };
    }

    if (this._state === "TRANSITIONING_TO_3D") {
      this._state = "TRANSITIONING_TO_2D";
      const remaining = Math.max(0.15, this._progress3D);
      const durationMs = Math.max(
        180,
        Math.round(remaining * MorphTransitionController.REVERSE_DURATION_MS),
      );
      return {
        nextState: "TRANSITIONING_TO_2D",
        state: "TRANSITIONING_TO_2D",
        startProgress: this._progress3D,
        startProgress3D: this._progress3D,
        durationMs,
      };
    }

    this._state = "TRANSITIONING_TO_2D";
    this._progress3D = 1;
    return {
      nextState: "TRANSITIONING_TO_2D",
      state: "TRANSITIONING_TO_2D",
      startProgress: 1,
      startProgress3D: 1,
      durationMs: MorphTransitionController.REVERSE_DURATION_MS,
    };
  }

  public requestTo2D() {
    return this.requestReturn2D();
  }

  /**
   * Conclui o retorno ao modo 2D.
   */
  public completeReturn2D(): MorphTransitionState {
    this._progress3D = 0;
    this._state = "2D_IDLE";
    return this._state;
  }

  public completeTransitionTo2D(): MorphTransitionState {
    return this.completeReturn2D();
  }

  /**
   * Registra erro técnico e preserva estado seguro.
   */
  public failTransition(reason: string): MorphTransitionState {
    this._lastError = reason;
    this._state = "TRANSITION_ERROR";
    return this._state;
  }
}
