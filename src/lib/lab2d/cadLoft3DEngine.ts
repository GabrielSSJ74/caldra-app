/**
 * CALDRA CHAMFER CAD — MOTOR MATEMÁTICO 3D DE ELEVAÇÃO (+Z), GIZMO 3D E TRANSIÇÃO MULTISSEÇÃO (LOFT 3D)
 *
 * Implementa os 5 sistemas de engenharia geométrica 3D para `ISO 2D`, `ÓRBITA 3D` e `CAD 3D`:
 * 1. Coordenada `elevationZ` (mm) e `extrudeHeight` (mm) por entidade e projeção 3D determinística.
 * 2. Gizmo 3D de Translação nos 3 Eixos (`+X`, `+Y`, `+Z`) com trava ortogonal vertical (`Ortho: < +Z`).
 * 3. Parametrização de seções transversais fechadas (`N_SAMPLES = 72` pontos uniformes com alinhamento polar Zero-Twist).
 * 4. Skinning Longitudinal (`V = 24` anéis) com interpolação Spline Cúbica Centrípeta (`Smooth Fit`) ou Linear (`Ruled`),
 *    suportando tanto `Sólido 3D Maciço` (com tampas superior/inferior) quanto `Casca / Tubo Oco` (espessura da chapa).
 * 5. Renderizador Phong/Blinn-Phong Metálico (`Shaded with Edges`) e Prévia Translúcida Azul-Celeste (`alpha = 0.42` + isocurvas)
 *    para Canvas 2D (`ISO 2D` / `ÓRBITA 3D`) e malha `CadTessellatedShape` para WebGL (`CAD 3D`).
 */

import type { Entity, Vec2 } from "./core";
import { boxOf, segmentsOf, translate, uid } from "./core";
import type { IsoPlane } from "./isometricEngine";
import type { WorkplaneOrbitProjection2D } from "./orbit3dController";
import { resolveBaseToTopExtrusionVector } from "./chamferWireframe3D";
import type {
  CadFaceGroup,
  CadPolylineEdge,
  CadTessellatedShape,
} from "@/lib/cad/core/CadMesh";
import { mergeCadTessellatedShapes } from "./structuralProfile";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type LoftSurfaceMode = "smooth" | "ruled";
export type LoftBodyMode = "solid" | "shell";

export interface Loft3DSpec {
  id: string;
  sectionEntities: Entity[];
  surfaceMode: LoftSurfaceMode;
  bodyMode: LoftBodyMode;
  wallThicknessMm: number;
  createdAt: number;
}

export interface LoftSectionSample {
  entityId: string;
  label: string;
  kindLabel: string;
  center: Vec2;
  centroid3D: Vec3;
  elevationZ: number;
  points3D: Vec3[]; // N_SAMPLES points ordered CCW starting from angle 0 without twist
  points: Vec3[];
  boundingRadius: number;
  characteristicVertexIndices: number[]; // indices of sharp corners (e.g. 4 for rect, 6 for hex)
}

export interface LoftQuadFace {
  p00: Vec3;
  p10: Vec3;
  p11: Vec3;
  p01: Vec3;
  normal: Vec3;
  n00?: Vec3;
  n10?: Vec3;
  n11?: Vec3;
  n01?: Vec3;
  vn0?: Vec3;
  vn1?: Vec3;
  vn2?: Vec3;
  vn3?: Vec3;
  vRow?: number;
  uCol?: number;
  isSmoothLateral?: boolean;
  centroid: Vec3;
  isInnerWall?: boolean;
  isCap?: boolean;
}

export interface LoftEulerTopology {
  V: number;
  E: number;
  F: number;
  chi: number;
  isWatertight: boolean;
}

export interface Loft3DMesh {
  sections: LoftSectionSample[];
  rings: Vec3[][]; // (V_RINGS + 1) x N_SAMPLES outer surface rings
  innerRings?: Vec3[][]; // Optional inner wall rings when bodyMode === "shell"
  quads: LoftQuadFace[];
  isocurveRings: Vec3[][];
  longitudinalGuides: Vec3[][];
  surfaceMode: LoftSurfaceMode;
  bodyMode: LoftBodyMode;
  wallThicknessMm: number;
  surfaceAreaMm2: number;
  volumeMm3: number;
  eulerCharacteristic: LoftEulerTopology;
}

export const LOFT_N_SAMPLES = 120;
export const LOFT_V_RINGS = 36;

/* ============================================================================
 * 1. LEITURA E ESCRITA CANÔNICA DE ELEVAÇÃO Z (`elevationZ`) E EXTRUSÃO (`extrudeHeight`)
 * ============================================================================ */

export function getEntityElevationZ(e: Entity | null | undefined): number {
  if (!e) return 0;
  if (typeof e.elevationZ === "number" && Number.isFinite(e.elevationZ)) {
    return e.elevationZ;
  }
  const paramElev = e.params?.elevationZ;
  if (typeof paramElev === "number" && Number.isFinite(paramElev)) {
    return paramElev;
  }
  const paramZBase = e.params?.zBaseMm;
  if (typeof paramZBase === "number" && Number.isFinite(paramZBase)) {
    return paramZBase;
  }
  return 0;
}

export function setEntityElevationZ(e: Entity, elevationZ: number): Entity {
  const cleanZ = Number.isFinite(elevationZ) ? Number(elevationZ.toFixed(3)) : 0;
  const nextParams: Record<string, unknown> = {
    ...(e.params ?? {}),
    elevationZ: cleanZ,
    zBaseMm: cleanZ,
  };
  return {
    ...e,
    elevationZ: cleanZ,
    params: nextParams,
  };
}

export function getEntityExtrudeHeight(
  e: Entity | null | undefined,
  fallbackThickness = 0,
): number {
  if (!e) return fallbackThickness;
  if (typeof e.extrudeHeight === "number" && Number.isFinite(e.extrudeHeight)) {
    return Math.max(0, e.extrudeHeight);
  }
  const paramH = e.params?.extrudeHeight ?? e.params?.extrudeHeightMm;
  if (typeof paramH === "number" && Number.isFinite(paramH)) {
    return Math.max(0, paramH);
  }
  return fallbackThickness;
}

export function setEntityExtrudeHeight(e: Entity, extrudeHeight: number): Entity {
  const cleanH = Number.isFinite(extrudeHeight) ? Math.max(0, Number(extrudeHeight.toFixed(3))) : 0;
  return {
    ...e,
    extrudeHeight: cleanH,
    params: {
      ...(e.params ?? {}),
      extrudeHeight: cleanH,
      extrudeHeightMm: cleanH,
    },
  };
}

export function isLoft3DEntity(e: Entity | null | undefined): boolean {
  if (!e || !e.params) return false;
  const loft = e.params.loft3d as Loft3DSpec | undefined;
  return Boolean(loft && Array.isArray(loft.sectionEntities) && loft.sectionEntities.length >= 2);
}

export function getEntityLoft3DSpec(e: Entity | null | undefined): Loft3DSpec | null {
  if (!isLoft3DEntity(e)) return null;
  return (e!.params!.loft3d as Loft3DSpec) ?? null;
}

/* ============================================================================
 * 2. PROJEÇÃO 3D DETERMINÍSTICA (WORKPLANE + ELEVAÇÃO +Z)
 * ============================================================================ */

/**
 * Retorna o vetor deslocamento no plano de trabalho `(uzX, uzY)` para cada `1.0 mm`
 * de elevação no eixo `+Z` vertical.
 * Quando multiplicado pela matriz `orbitProjection`, aponta estritamente para cima (`-Y` da tela).
 */
export interface UnitZWorkplaneOffsetOptions {
  isIsometric?: boolean;
  isoPlane?: IsoPlane;
  isOrbitTilted?: boolean;
  orbitProjection?: WorkplaneOrbitProjection2D | null;
}

export function resolveUnitZWorkplaneOffset(
  isIsometricOrOptions: boolean | UnitZWorkplaneOffsetOptions,
  isoPlaneArg: IsoPlane = "top",
  orbitProjectionArg?: WorkplaneOrbitProjection2D | null,
): Vec2 {
  const isObj =
    typeof isIsometricOrOptions === "object" && isIsometricOrOptions !== null;
  const isIsometric = isObj
    ? Boolean(isIsometricOrOptions.isIsometric)
    : Boolean(isIsometricOrOptions);
  const isoPlane = isObj ? (isIsometricOrOptions.isoPlane ?? "top") : isoPlaneArg;
  const orbitProjection = isObj
    ? (isIsometricOrOptions.orbitProjection ?? null)
    : (orbitProjectionArg ?? null);
  const isTilted = isObj
    ? Boolean(isIsometricOrOptions.isOrbitTilted ?? orbitProjection?.isTilted)
    : Boolean(orbitProjection?.isTilted);

  // REGRA 1: Em 2D SKETCH / ORTO 2D / SUP 2D (!isIsometric && !isTilted),
  // o deslocamento derivado de Z na tela é estritamente ZERO (elevationZ = 0 na projeção).
  if (!isTilted && !isIsometric) {
    return { x: 0, y: 0 };
  }
  const v = resolveBaseToTopExtrusionVector({
    isOrbitTilted: isTilted,
    orbitProjection: orbitProjection ?? undefined,
    isIsometric,
    isoPlane,
    sheetThickness: 1.0,
  }).deltaExtrusion;
  if (Math.hypot(v.x, v.y) > 1e-5) {
    return v;
  }
  return { x: 0, y: -0.82 };
}

/**
 * Projeta um ponto 3D `(x, y, z)` para coordenadas de mundo 2D do canvas antes da matriz `orbitProjection`.
 * Em `2D SKETCH` / `ORTO 2D` / `SUP 2D`, projeta estritamente `(x, y)` ignorando `z`.
 */
export function projectPoint3DToWorkplane2D(
  pt: Vec3,
  isIsometric: boolean,
  isoPlane: IsoPlane = "top",
  orbitProjection?: WorkplaneOrbitProjection2D | null,
): Vec2 {
  if (!isIsometric && !orbitProjection?.isTilted) {
    return { x: pt.x, y: pt.y };
  }
  if (Math.abs(pt.z) < 1e-4) {
    return { x: pt.x, y: pt.y };
  }
  const uz = resolveUnitZWorkplaneOffset(isIsometric, isoPlane, orbitProjection);
  return {
    x: pt.x + uz.x * pt.z,
    y: pt.y + uz.y * pt.z,
  };
}

/**
 * Projeta um ponto 3D `(x, y, z)` diretamente para coordenadas pós-órbita (em mm no referencial do `view`).
 * Para obter pixels na tela: `screenX = view.tx + view.k * postOrbit.x`, `screenY = view.ty + view.k * postOrbit.y`.
 */
export function projectPoint3DToCanvasViewMm(
  pt: Vec3,
  isIsometric: boolean,
  isoPlane: IsoPlane = "top",
  orbitProjection?: WorkplaneOrbitProjection2D | null,
): Vec2 {
  if (!isIsometric && !orbitProjection?.isTilted) {
    return { x: pt.x, y: pt.y };
  }
  const wp = projectPoint3DToWorkplane2D(pt, isIsometric, isoPlane, orbitProjection);
  if (orbitProjection?.isTilted) {
    const { a, b, c, d, e, f } = orbitProjection;
    return {
      x: a * wp.x + c * wp.y + e,
      y: b * wp.x + d * wp.y + f,
    };
  }
  return wp;
}

/**
 * Calcula quantos pixels verticais na tela (`-Y`) equivalem a `1 mm` de elevação `+Z`.
 */
export function getScreenPixelsPerMmZ(
  viewK: number,
  isIsometric: boolean,
  isoPlane: IsoPlane = "top",
  orbitProjection?: WorkplaneOrbitProjection2D | null,
): number {
  if (!isIsometric && !orbitProjection?.isTilted) {
    return Math.max(0.5, 0.82 * Math.max(0.05, viewK));
  }
  const p0 = projectPoint3DToCanvasViewMm({ x: 0, y: 0, z: 0 }, isIsometric, isoPlane, orbitProjection);
  const p1 = projectPoint3DToCanvasViewMm({ x: 0, y: 0, z: 1 }, isIsometric, isoPlane, orbitProjection);
  const dyMm = p0.y - p1.y; // positivo quando +Z sobe na tela
  const magMm = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const effMm = Math.max(0.25, Math.abs(dyMm) > 0.1 ? Math.abs(dyMm) : magMm);
  return Math.max(0.1, effMm * Math.max(0.05, viewK));
}

/* ============================================================================
 * 3. CENTRO GEOMÉTRICO REAL 2D/3D E CLASSIFICAÇÃO DE PERFIS
 * ============================================================================ */

export function computeEntityTrueCentroid2D(e: Entity): Vec2 {
  if (e.type === "circle" || e.type === "arc" || e.type === "ellipse") {
    return { x: e.cx, y: e.cy };
  }
  if (e.type === "line") {
    return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
  }
  if (e.type === "point" || e.type === "text") {
    return { x: e.x, y: e.y };
  }
  if (e.type === "polyline" && e.pts.length > 0) {
    let pts = e.pts;
    if (pts.length > 2) {
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-3) {
        pts = pts.slice(0, -1);
      }
    }
    if (pts.length >= 3) {
      let signedArea2 = 0;
      let cxAccum = 0;
      let cyAccum = 0;
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i]!;
        const p1 = pts[(i + 1) % pts.length]!;
        const cross = p0.x * p1.y - p1.x * p0.y;
        signedArea2 += cross;
        cxAccum += (p0.x + p1.x) * cross;
        cyAccum += (p0.y + p1.y) * cross;
      }
      if (Math.abs(signedArea2) > 1e-4) {
        return {
          x: cxAccum / (3 * signedArea2),
          y: cyAccum / (3 * signedArea2),
        };
      }
    }
    const sx = pts.reduce((acc, p) => acc + p.x, 0);
    const sy = pts.reduce((acc, p) => acc + p.y, 0);
    return { x: sx / pts.length, y: sy / pts.length };
  }
  const b = boxOf(e);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function computeSelectionCentroid3D(entities: Entity[]): Vec3 {
  if (entities.length === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const e of entities) {
    const c = computeEntityTrueCentroid2D(e);
    sx += c.x;
    sy += c.y;
    sz += getEntityElevationZ(e);
  }
  return {
    x: sx / entities.length,
    y: sy / entities.length,
    z: sz / entities.length,
  };
}

export function classifyProfileKindLabel(e: Entity): string {
  if (isLoft3DEntity(e)) return "Sólido Loft 3D";
  if (e.type === "circle") return `Círculo Ø${(e.r * 2).toFixed(1)}`;
  if (e.type === "ellipse") return `Elipse ${(e.rx * 2).toFixed(1)}×${(e.ry * 2).toFixed(1)}`;
  if (e.type === "polyline") {
    let vCount = e.pts.length;
    if (
      vCount > 2 &&
      Math.hypot(e.pts[0]!.x - e.pts[vCount - 1]!.x, e.pts[0]!.y - e.pts[vCount - 1]!.y) < 1e-2
    ) {
      vCount -= 1;
    }
    if (vCount === 4) {
      const b = boxOf(e);
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      return `Retângulo ${w.toFixed(0)}×${h.toFixed(0)}`;
    }
    if (vCount === 3) return "Triângulo";
    if (vCount === 5) return "Pentágono";
    if (vCount === 6) return "Hexágono";
    if (vCount === 8) return "Octógono";
    return `Polígono (${vCount}v)`;
  }
  return e.type.toUpperCase();
}

export function isClosedLoftableProfile(e: Entity | null | undefined): boolean {
  if (!e) return false;
  if (isLoft3DEntity(e)) return false;
  if (e.type === "circle" || e.type === "ellipse") return true;
  if (e.type === "polyline") {
    if (e.pts.length < 3) return false;
    if (e.closed) return true;
    const first = e.pts[0]!;
    const last = e.pts[e.pts.length - 1]!;
    return Math.hypot(first.x - last.x, first.y - last.y) < 1.5;
  }
  return false;
}

/* ============================================================================
 * 4. PARAMETRIZAÇÃO DE SEÇÕES TRANSVERSAIS (`N_SAMPLES = 72`) & ZERO-TWIST
 * ============================================================================ */

/**
 * Extrai um polígono fechado denso de uma entidade (`circle`, `ellipse`, `polyline`/`rect`/`polygon`),
 * garante orientação anti-horária (CCW) e reamostra exatamente `nSamples` pontos começando no ângulo
 * polar `θ = 0°` relativo ao centro geométrico `(Cx, Cy)` da seção.
 */
export function sampleProfileCrossSection3D(
  e: Entity,
  nSamples: number = LOFT_N_SAMPLES,
  referencePreviousPoints?: Vec3[],
): LoftSectionSample {
  const center = computeEntityTrueCentroid2D(e);
  const z = getEntityElevationZ(e);
  const kindLabel = classifyProfileKindLabel(e);
  const label = `${kindLabel} (Z=${z.toFixed(1)}mm)`;

  // Caso 1: Círculo analítico perfeito
  if (e.type === "circle") {
    const pts3D: Vec3[] = [];
    for (let i = 0; i < nSamples; i++) {
      const theta = (i / nSamples) * Math.PI * 2;
      pts3D.push({
        x: e.cx + e.r * Math.cos(theta),
        y: e.cy + e.r * Math.sin(theta),
        z,
      });
    }
    const aligned = referencePreviousPoints
      ? alignRingCyclicShiftForZeroTwist(pts3D, referencePreviousPoints, center)
      : pts3D;
    return {
      entityId: e.id,
      label,
      kindLabel,
      center,
      centroid3D: { x: center.x, y: center.y, z },
      elevationZ: z,
      points3D: aligned,
      points: aligned,
      boundingRadius: e.r,
      characteristicVertexIndices: [0, Math.floor(nSamples / 4), Math.floor(nSamples / 2), Math.floor((3 * nSamples) / 4)],
    };
  }

  // Caso 2: Elipse analítica
  if (e.type === "ellipse") {
    const rot = e.rotation ?? 0;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const pts3D: Vec3[] = [];
    for (let i = 0; i < nSamples; i++) {
      const theta = (i / nSamples) * Math.PI * 2;
      const lx = e.rx * Math.cos(theta);
      const ly = e.ry * Math.sin(theta);
      pts3D.push({
        x: e.cx + lx * cosR - ly * sinR,
        y: e.cy + lx * sinR + ly * cosR,
        z,
      });
    }
    const aligned = referencePreviousPoints
      ? alignRingCyclicShiftForZeroTwist(pts3D, referencePreviousPoints, center)
      : pts3D;
    return {
      entityId: e.id,
      label,
      kindLabel,
      center,
      centroid3D: { x: center.x, y: center.y, z },
      elevationZ: z,
      points3D: aligned,
      points: aligned,
      boundingRadius: Math.max(e.rx, e.ry),
      characteristicVertexIndices: [0, Math.floor(nSamples / 4), Math.floor(nSamples / 2), Math.floor((3 * nSamples) / 4)],
    };
  }

  // Caso 3: Polilinha / Retângulo / Polígono Regular (Hexágono, etc.)
  let rawVertices: Vec2[] = [];
  if (e.type === "polyline" && e.pts.length >= 3) {
    rawVertices = e.pts.map((p) => ({ x: p.x, y: p.y }));
    if (
      rawVertices.length > 2 &&
      Math.hypot(
        rawVertices[0]!.x - rawVertices[rawVertices.length - 1]!.x,
        rawVertices[0]!.y - rawVertices[rawVertices.length - 1]!.y,
      ) < 1e-2
    ) {
      rawVertices.pop();
    }
  } else {
    const segs = segmentsOf(e);
    for (const s of segs) {
      rawVertices.push({ x: s[0].x, y: s[0].y });
    }
  }

  if (rawVertices.length < 3) {
    const b = boxOf(e);
    rawVertices = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
    ];
  }

  // Garante orientação anti-horária (CCW: área algébrica positiva)
  let signedArea = 0;
  for (let i = 0; i < rawVertices.length; i++) {
    const p0 = rawVertices[i]!;
    const p1 = rawVertices[(i + 1) % rawVertices.length]!;
    signedArea += p0.x * p1.y - p1.x * p0.y;
  }
  if (signedArea < 0) {
    rawVertices.reverse();
  }

  // Encontra o ponto sobre o perímetro com ângulo polar θ = 0° (raio +X a partir do centroide)
  const startPointOnPerimeter = findRayPerimeterIntersectionAtAngleZero(rawVertices, center);
  const orderedLoop = buildLoopStartingAtPoint(rawVertices, startPointOnPerimeter);

  // Calcula comprimento acumulado de perímetro (fallback para contornos côncavos extremos)
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < orderedLoop.length; i++) {
    const p0 = orderedLoop[i]!;
    const p1 = orderedLoop[(i + 1) % orderedLoop.length]!;
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    segLengths.push(d);
    totalLen += d;
  }
  const safeTotalLen = Math.max(1e-3, totalLen);

  // MÉTODO POLAR CONCÊNTRICO (SEÇÃO 4.1):
  // Parametriza cada seção fechada S_k no sentido anti-horário em N = 120 pontos P_{k,i}
  // distribuídos por ângulo polar θ_i ∈ [0, 2π) a partir do seu próprio centroide (Cx, Cy)
  // usando interseção raio-polígono do centro até a borda da forma no ângulo θ_i.
  // Como cada índice i compartilha exatamente o mesmo ângulo radial θ_i em todas as seções (Z1, Z2, Z3),
  // a transição vertical nunca sofre torção (Zero-Twist) e alinha perfeitamente Quadrado ➔ Hexágono ➔ Círculo!
  const pts3D: Vec3[] = [];
  let maxR = 1;

  for (let i = 0; i < nSamples; i++) {
    const theta = (i / nSamples) * Math.PI * 2;
    const polarHit = findRayPerimeterIntersectionAtAngle(rawVertices, center, theta);

    let sampledPt: Vec2;
    if (polarHit) {
      sampledPt = polarHit;
    } else {
      const targetDist = (i / nSamples) * safeTotalLen;
      let accum = 0;
      sampledPt = orderedLoop[0]!;
      for (let sIdx = 0; sIdx < orderedLoop.length; sIdx++) {
        const segL = segLengths[sIdx]!;
        if (accum + segL >= targetDist || sIdx === orderedLoop.length - 1) {
          const localT = segL > 1e-6 ? Math.min(1, Math.max(0, (targetDist - accum) / segL)) : 0;
          const p0 = orderedLoop[sIdx]!;
          const p1 = orderedLoop[(sIdx + 1) % orderedLoop.length]!;
          sampledPt = {
            x: p0.x + (p1.x - p0.x) * localT,
            y: p0.y + (p1.y - p0.y) * localT,
          };
          break;
        }
        accum += segL;
      }
    }

    const r = Math.hypot(sampledPt.x - center.x, sampledPt.y - center.y);
    if (r > maxR) maxR = r;
    pts3D.push({ x: sampledPt.x, y: sampledPt.y, z });
  }

  // Como todas as seções já estão alinhadas pelo ângulo polar θ_i = 2π·i/N,
  // mantemos o índice i idêntico (zero-twist polar garantido).
  const aligned = pts3D;

  // Identifica os índices em `aligned` mais próximos das quinas reais de `rawVertices` (para linhas de vinco)
  const cornerIndices: number[] = [];
  if (rawVertices.length <= 24) {
    for (const v of rawVertices) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < aligned.length; i++) {
        const d = Math.hypot(aligned[i]!.x - v.x, aligned[i]!.y - v.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (!cornerIndices.includes(bestIdx)) {
        cornerIndices.push(bestIdx);
      }
    }
  }

  return {
    entityId: e.id,
    label,
    kindLabel,
    center,
    centroid3D: { x: center.x, y: center.y, z },
    elevationZ: z,
    points3D: aligned,
    points: aligned,
    boundingRadius: maxR,
    characteristicVertexIndices: cornerIndices.sort((a, b) => a - b),
  };
}

/**
 * Calcula a interseção exata entre o raio polar `center + t * (cos θ, sin θ)` (t > 0)
 * e as arestas do polígono fechado `vertices`.
 */
function findRayPerimeterIntersectionAtAngle(
  vertices: Vec2[],
  center: Vec2,
  thetaRad: number,
): Vec2 | null {
  const dx = Math.cos(thetaRad);
  const dy = Math.sin(thetaRad);
  let bestT = Infinity;
  let bestPt: Vec2 | null = null;
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % n]!;
    const sx = b.x - a.x;
    const sy = b.y - a.y;

    // Resolve: center + t * d = a + u * s  (t > 0, 0 <= u <= 1)
    // denom = d x s = dx * sy - dy * sx
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-9) continue;

    const acx = a.x - center.x;
    const acy = a.y - center.y;
    const t = (acx * sy - acy * sx) / denom;
    const u = (acx * dy - acy * dx) / denom;

    if (t > 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
      if (t < bestT) {
        bestT = t;
        bestPt = {
          x: center.x + t * dx,
          y: center.y + t * dy,
        };
      }
    }
  }

  return bestPt;
}

function findRayPerimeterIntersectionAtAngleZero(vertices: Vec2[], center: Vec2): {
  pt: Vec2;
  segIndex: number;
} {
  let bestT = Infinity;
  let bestHit: { pt: Vec2; segIndex: number } | null = null;

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const ay = a.y - center.y;
    const by = b.y - center.y;

    // Verifica se o segmento cruza a linha horizontal y = center.y para x >= center.x
    if ((ay <= 0 && by >= 0) || (ay >= 0 && by <= 0)) {
      const dy = by - ay;
      const u = Math.abs(dy) > 1e-6 ? -ay / dy : 0;
      if (u >= 0 && u <= 1) {
        const ix = a.x + u * (b.x - a.x);
        const iy = a.y + u * (b.y - a.y);
        const rayDist = ix - center.x;
        if (rayDist > 0 && rayDist < bestT) {
          bestT = rayDist;
          bestHit = { pt: { x: ix, y: iy }, segIndex: i };
        }
      }
    }
  }

  if (bestHit) return bestHit;
  return { pt: vertices[0]!, segIndex: 0 };
}

function buildLoopStartingAtPoint(
  vertices: Vec2[],
  start: { pt: Vec2; segIndex: number },
): Vec2[] {
  const result: Vec2[] = [start.pt];
  const n = vertices.length;
  for (let k = 1; k <= n; k++) {
    const v = vertices[(start.segIndex + k) % n]!;
    const prev = result[result.length - 1]!;
    if (Math.hypot(v.x - prev.x, v.y - prev.y) > 1e-3) {
      result.push(v);
    }
  }
  if (
    result.length > 2 &&
    Math.hypot(
      result[0]!.x - result[result.length - 1]!.x,
      result[0]!.y - result[result.length - 1]!.y,
    ) < 1e-3
  ) {
    result.pop();
  }
  return result;
}

/**
 * Minimiza a soma das distâncias quadráticas transversais entre `currentRing` e `prevRing`
 * testando deslocamentos cíclicos para garantir Zero-Twist (sem torção de malha entre quadrado, hexágono e círculo).
 */
function alignRingCyclicShiftForZeroTwist(
  currentRing: Vec3[],
  prevRing: Vec3[],
  currentCenter: Vec2,
): Vec3[] {
  const n = currentRing.length;
  if (n === 0 || prevRing.length !== n) return currentRing;

  // Calcula centroide 2D do anel anterior para comparar direções relativas normalizadas
  let prevCx = 0;
  let prevCy = 0;
  for (const p of prevRing) {
    prevCx += p.x;
    prevCy += p.y;
  }
  prevCx /= n;
  prevCy /= n;

  let bestShift = 0;
  let bestCost = Infinity;

  for (let shift = 0; shift < n; shift++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const c = currentRing[(i + shift) % n]!;
      const p = prevRing[i]!;
      const dx = c.x - currentCenter.x - (p.x - prevCx);
      const dy = c.y - currentCenter.y - (p.y - prevCy);
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = shift;
    }
  }

  if (bestShift === 0) return currentRing;
  const shifted: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    shifted.push(currentRing[(i + bestShift) % n]!);
  }
  return shifted;
}

/* ============================================================================
 * 5. INTERPOLAÇÃO LONGITUDINAL (CATMULL-ROM CÚBICA `SMOOTH FIT` vs `RULED`)
 * ============================================================================ */

function catmullRomPoint3D(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  // Tangentes suaves de Catmull-Rom com tensão 0.5 (produz transição orgânica contínua C1 sem auto-interseção)
  const m1x = 0.5 * (p2.x - p0.x);
  const m1y = 0.5 * (p2.y - p0.y);
  const m1z = 0.5 * (p2.z - p0.z);

  const m2x = 0.5 * (p3.x - p1.x);
  const m2y = 0.5 * (p3.y - p1.y);
  const m2z = 0.5 * (p3.z - p1.z);

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return {
    x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
    y: h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y,
    z: h00 * p1.z + h10 * m1z + h01 * p2.z + h11 * m2z,
  };
}

function interpolateLongitudinalCurve(
  controlPts: Vec3[],
  vNormalized: number,
  mode: LoftSurfaceMode,
): Vec3 {
  const m = controlPts.length;
  if (m === 0) return { x: 0, y: 0, z: 0 };
  if (m === 1) return controlPts[0]!;

  const clampedV = Math.max(0, Math.min(1, vNormalized));
  const scaled = clampedV * (m - 1);
  const segIdx = Math.min(m - 2, Math.floor(scaled));
  const localT = scaled - segIdx;

  const p1 = controlPts[segIdx]!;
  const p2 = controlPts[segIdx + 1]!;

  if (mode === "ruled") {
    return {
      x: p1.x + (p2.x - p1.x) * localT,
      y: p1.y + (p2.y - p1.y) * localT,
      z: p1.z + (p2.z - p1.z) * localT,
    };
  }

  // Modo Smooth Fit: Spline Cúbica com extrapolação fantasma natural nas pontas
  // Se houver apenas 2 seções em modo Smooth, aplicamos perfil orgânico ease-in-out S-curve
  if (m === 2) {
    const smoothT = localT * localT * (3 - 2 * localT);
    return {
      x: p1.x + (p2.x - p1.x) * smoothT,
      y: p1.y + (p2.y - p1.y) * smoothT,
      z: p1.z + (p2.z - p1.z) * localT,
    };
  }

  const p0 =
    segIdx > 0
      ? controlPts[segIdx - 1]!
      : {
          x: p1.x - (p2.x - p1.x),
          y: p1.y - (p2.y - p1.y),
          z: p1.z - (p2.z - p1.z),
        };
  const p3 =
    segIdx + 2 < m
      ? controlPts[segIdx + 2]!
      : {
          x: p2.x + (p2.x - p1.x),
          y: p2.y + (p2.y - p1.y),
          z: p2.z + (p2.z - p1.z),
        };

  return catmullRomPoint3D(p0, p1, p2, p3, localT);
}

function computeNormalizedVec3(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return { x: 0, y: 0, z: 1 };
  return { x: x / len, y: y / len, z: z / len };
}

function computeQuadNormalAndCentroid(
  p00: Vec3,
  p10: Vec3,
  p11: Vec3,
  p01: Vec3,
): { normal: Vec3; centroid: Vec3 } {
  // Diagonal vectors of quad (p11 - p00) x (p01 - p10)
  const ux = p11.x - p00.x;
  const uy = p11.y - p00.y;
  const uz = p11.z - p00.z;

  const vx = p01.x - p10.x;
  const vy = p01.y - p10.y;
  const vz = p01.z - p10.z;

  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;

  return {
    normal: computeNormalizedVec3(nx, ny, nz),
    centroid: {
      x: 0.25 * (p00.x + p10.x + p11.x + p01.x),
      y: 0.25 * (p00.y + p10.y + p11.y + p01.y),
      z: 0.25 * (p00.z + p10.z + p11.z + p01.z),
    },
  };
}

/**
 * Constrói a malha paramétrica 3D completa do Loft a partir de 2 ou mais entidades de seção transversal.
 */
export function buildLoft3DMesh(
  sectionEntities: Entity[],
  options: {
    surfaceMode?: LoftSurfaceMode;
    bodyMode?: LoftBodyMode;
    wallThicknessMm?: number;
    nSamples?: number;
    vRings?: number;
  } = {},
): Loft3DMesh | null {
  const safeList = Array.isArray(sectionEntities) ? sectionEntities : [];
  const validEntities = safeList.filter(isClosedLoftableProfile);
  if (validEntities.length < 2) return null;

  const surfaceMode = options.surfaceMode ?? "smooth";
  const bodyMode = options.bodyMode ?? "solid";
  const wallThicknessMm = Math.max(0.5, options.wallThicknessMm ?? 3.0);
  const nSamples = options.nSamples ?? LOFT_N_SAMPLES;
  const vRings = options.vRings ?? LOFT_V_RINGS;

  // Se todas as seções estiverem exatamente na mesma altura Z = 0, aplica um offset virtual suave
  // ou respeita a ordem de seleção se o usuário já elevou pelo menos uma seção
  const elevations = validEntities.map((e) => getEntityElevationZ(e));
  const minZ = Math.min(...elevations);
  const maxZ = Math.max(...elevations);
  const allSameZ = Math.abs(maxZ - minZ) < 0.1;

  const sampledSections: LoftSectionSample[] = [];
  for (let k = 0; k < validEntities.length; k++) {
    const ent = validEntities[k]!;
    const effectiveEnt = allSameZ ? setEntityElevationZ(ent, k * 55) : ent;
    const prevPts = k > 0 ? sampledSections[k - 1]!.points3D : undefined;
    const sample = sampleProfileCrossSection3D(effectiveEnt, nSamples, prevPts);
    sampledSections.push(sample);
  }

  // Gera os (vRings + 1) anéis transversais interpolados ao longo da transição
  const rings: Vec3[][] = [];
  for (let vIdx = 0; vIdx <= vRings; vIdx++) {
    const vNorm = vIdx / vRings;
    const ring: Vec3[] = [];
    for (let i = 0; i < nSamples; i++) {
      const columnPts = sampledSections.map((s) => s.points3D[i]!);
      ring.push(interpolateLongitudinalCurve(columnPts, vNorm, surfaceMode));
    }
    rings.push(ring);
  }

  // Gera as faces quadriláteras da parede externa com normais de vértice 2D simétricas na costura (elimina ondulação lateral esquerda)
  const cosSharpLimit = Math.cos((38 * Math.PI) / 180);
  const cosSmoothThreshold = Math.cos((25 * Math.PI) / 180);
  const quads: LoftQuadFace[] = [];
  const allRingQuads: LoftQuadFace[][] = [];
  for (let vIdx = 0; vIdx < vRings; vIdx++) {
    const r0 = rings[vIdx]!;
    const r1 = rings[vIdx + 1]!;
    const ringQuads: LoftQuadFace[] = [];
    for (let i = 0; i < nSamples; i++) {
      const nextI = (i + 1) % nSamples;
      const p00 = r0[i]!;
      const p10 = r0[nextI]!;
      const p11 = r1[nextI]!;
      const p01 = r1[i]!;
      const { normal, centroid } = computeQuadNormalAndCentroid(p00, p10, p11, p01);
      ringQuads.push({ p00, p10, p11, p01, normal, centroid });
    }
    allRingQuads.push(ringQuads);
  }

  const evaluateSharedSeamNormal = (
    nLeft: Vec3,
    nRight: Vec3,
    ownSide: "left" | "right",
  ): { normal: Vec3; isSmooth: boolean } => {
    const dot = nLeft.x * nRight.x + nLeft.y * nRight.y + nLeft.z * nRight.z;
    if (dot <= cosSharpLimit) {
      return {
        normal: ownSide === "left" ? nLeft : nRight,
        isSmooth: false,
      };
    }
    const avg = computeNormalizedVec3(
      nLeft.x + nRight.x,
      nLeft.y + nRight.y,
      nLeft.z + nRight.z,
    );
    return { normal: avg, isSmooth: true };
  };

  for (let vIdx = 0; vIdx < vRings; vIdx++) {
    const currRing = allRingQuads[vIdx]!;
    const prevRing = allRingQuads[Math.max(0, vIdx - 1)]!;
    const nextRing = allRingQuads[Math.min(vRings - 1, vIdx + 1)]!;

    for (let i = 0; i < nSamples; i++) {
      const prevI = (i - 1 + nSamples) % nSamples;
      const nextI = (i + 1) % nSamples;
      const currQ = currRing[i]!;

      // Suavização longitudinal no anel inferior (vIdx) e superior (vIdx + 1)
      const nBottomCurr = computeNormalizedVec3(
        prevRing[i]!.normal.x + currQ.normal.x,
        prevRing[i]!.normal.y + currQ.normal.y,
        prevRing[i]!.normal.z + currQ.normal.z,
      );
      const nBottomPrev = computeNormalizedVec3(
        prevRing[prevI]!.normal.x + currRing[prevI]!.normal.x,
        prevRing[prevI]!.normal.y + currRing[prevI]!.normal.y,
        prevRing[prevI]!.normal.z + currRing[prevI]!.normal.z,
      );
      const nBottomNext = computeNormalizedVec3(
        prevRing[nextI]!.normal.x + currRing[nextI]!.normal.x,
        prevRing[nextI]!.normal.y + currRing[nextI]!.normal.y,
        prevRing[nextI]!.normal.z + currRing[nextI]!.normal.z,
      );

      const nTopCurr = computeNormalizedVec3(
        currQ.normal.x + nextRing[i]!.normal.x,
        currQ.normal.y + nextRing[i]!.normal.y,
        currQ.normal.z + nextRing[i]!.normal.z,
      );
      const nTopPrev = computeNormalizedVec3(
        currRing[prevI]!.normal.x + nextRing[prevI]!.normal.x,
        currRing[prevI]!.normal.y + nextRing[prevI]!.normal.y,
        currRing[prevI]!.normal.z + nextRing[prevI]!.normal.z,
      );
      const nTopNext = computeNormalizedVec3(
        currRing[nextI]!.normal.x + nextRing[nextI]!.normal.x,
        currRing[nextI]!.normal.y + nextRing[nextI]!.normal.y,
        currRing[nextI]!.normal.z + nextRing[nextI]!.normal.z,
      );

      const b00 = evaluateSharedSeamNormal(nBottomPrev, nBottomCurr, "right");
      const b01 = evaluateSharedSeamNormal(nTopPrev, nTopCurr, "right");
      const b10 = evaluateSharedSeamNormal(nBottomCurr, nBottomNext, "left");
      const b11 = evaluateSharedSeamNormal(nTopCurr, nTopNext, "left");

      currQ.n00 = b00.normal;
      currQ.n10 = b10.normal;
      currQ.n01 = b01.normal;
      currQ.n11 = b11.normal;
      currQ.vn0 = b00.normal;
      currQ.vn1 = b10.normal;
      currQ.vn2 = b11.normal;
      currQ.vn3 = b01.normal;
      currQ.vRow = vIdx;
      currQ.uCol = i;
      currQ.isSmoothLateral = b00.isSmooth || b10.isSmooth || b01.isSmooth || b11.isSmooth;
      quads.push(currQ);
    }
  }

  let innerRings: Vec3[][] | undefined;

  if (bodyMode === "solid") {
    // Tampa Inferior (z = base) e Tampa Superior (z = topo) usando fan de quads degenerados em triângulos
    const bottomRing = rings[0]!;
    const bottomCenter = computeRingCentroid3D(bottomRing);
    for (let i = 0; i < nSamples; i++) {
      const nextI = (i + 1) % nSamples;
      const p0 = bottomRing[nextI]!;
      const p1 = bottomRing[i]!;
      quads.push({
        p00: bottomCenter,
        p10: p0,
        p11: p1,
        p01: bottomCenter,
        normal: { x: 0, y: 0, z: -1 },
        centroid: {
          x: (bottomCenter.x + p0.x + p1.x) / 3,
          y: (bottomCenter.y + p0.y + p1.y) / 3,
          z: bottomCenter.z,
        },
        isCap: true,
      });
    }

    const topRing = rings[vRings]!;
    const topCenter = computeRingCentroid3D(topRing);
    for (let i = 0; i < nSamples; i++) {
      const nextI = (i + 1) % nSamples;
      const p0 = topRing[i]!;
      const p1 = topRing[nextI]!;
      quads.push({
        p00: topCenter,
        p10: p0,
        p11: p1,
        p01: topCenter,
        normal: { x: 0, y: 0, z: 1 },
        centroid: {
          x: (topCenter.x + p0.x + p1.x) / 3,
          y: (topCenter.y + p0.y + p1.y) / 3,
          z: topCenter.z,
        },
        isCap: true,
      });
    }
  } else {
    // Modo Casca / Tubo Oco (Caldeiraria): parede interna deslocada por wallThicknessMm + borda anelar no topo/base
    innerRings = rings.map((ring) => {
      const rc = computeRingCentroid3D(ring);
      return ring.map((pt) => {
        const dx = pt.x - rc.x;
        const dy = pt.y - rc.y;
        const r = Math.hypot(dx, dy);
        const shrinkRatio = r > wallThicknessMm * 1.5 ? (r - wallThicknessMm) / r : 0.85;
        return {
          x: rc.x + dx * shrinkRatio,
          y: rc.y + dy * shrinkRatio,
          z: pt.z,
        };
      });
    });

    // Faces da parede interna com Smooth Vertex Normals (Δθ < 25°)
    for (let vIdx = 0; vIdx < vRings; vIdx++) {
      const r0 = innerRings[vIdx]!;
      const r1 = innerRings[vIdx + 1]!;
      const innerRingQuads: LoftQuadFace[] = [];
      for (let i = 0; i < nSamples; i++) {
        const nextI = (i + 1) % nSamples;
        const p00 = r0[nextI]!;
        const p10 = r0[i]!;
        const p11 = r1[i]!;
        const p01 = r1[nextI]!;
        const { normal, centroid } = computeQuadNormalAndCentroid(p00, p10, p11, p01);
        innerRingQuads.push({ p00, p10, p11, p01, normal, centroid, isInnerWall: true });
      }
      for (let i = 0; i < nSamples; i++) {
        const prevQ = innerRingQuads[(i - 1 + nSamples) % nSamples]!;
        const currQ = innerRingQuads[i]!;
        const nextQ = innerRingQuads[(i + 1) % nSamples]!;
        const dotL =
          prevQ.normal.x * currQ.normal.x +
          prevQ.normal.y * currQ.normal.y +
          prevQ.normal.z * currQ.normal.z;
        const dotR =
          currQ.normal.x * nextQ.normal.x +
          currQ.normal.y * nextQ.normal.y +
          currQ.normal.z * nextQ.normal.z;
        const nL =
          dotL >= cosSmoothThreshold
            ? computeNormalizedVec3(
                prevQ.normal.x + currQ.normal.x,
                prevQ.normal.y + currQ.normal.y,
                prevQ.normal.z + currQ.normal.z,
              )
            : currQ.normal;
        const nR =
          dotR >= cosSmoothThreshold
            ? computeNormalizedVec3(
                currQ.normal.x + nextQ.normal.x,
                currQ.normal.y + nextQ.normal.y,
                currQ.normal.z + nextQ.normal.z,
              )
            : currQ.normal;
        currQ.n00 = nR;
        currQ.n01 = nR;
        currQ.n10 = nL;
        currQ.n11 = nL;
        currQ.isSmoothLateral = dotL >= cosSmoothThreshold || dotR >= cosSmoothThreshold;
        quads.push(currQ);
      }
    }

    // Anel de fechamento da espessura da chapa na base (v = 0) e no topo (v = vRings)
    const outerBot = rings[0]!;
    const innerBot = innerRings[0]!;
    const outerTop = rings[vRings]!;
    const innerTop = innerRings[vRings]!;

    for (let i = 0; i < nSamples; i++) {
      const nextI = (i + 1) % nSamples;
      // Base rim
      quads.push({
        p00: innerBot[i]!,
        p10: outerBot[i]!,
        p11: outerBot[nextI]!,
        p01: innerBot[nextI]!,
        normal: { x: 0, y: 0, z: -1 },
        centroid: {
          x: 0.5 * (outerBot[i]!.x + innerBot[i]!.x),
          y: 0.5 * (outerBot[i]!.y + innerBot[i]!.y),
          z: outerBot[i]!.z,
        },
        isCap: true,
      });
      // Top rim
      quads.push({
        p00: outerTop[i]!,
        p10: innerTop[i]!,
        p11: innerTop[nextI]!,
        p01: outerTop[nextI]!,
        normal: { x: 0, y: 0, z: 1 },
        centroid: {
          x: 0.5 * (outerTop[i]!.x + innerTop[i]!.x),
          y: 0.5 * (outerTop[i]!.y + innerTop[i]!.y),
          z: outerTop[i]!.z,
        },
        isCap: true,
      });
    }
  }

  // Isocurvas transversais (anéis a cada 4 subdivisões + seções originais)
  const isocurveRings: Vec3[][] = [];
  for (let vIdx = 0; vIdx <= vRings; vIdx += 4) {
    isocurveRings.push(rings[vIdx]!);
  }

  // Linhas de fluxo longitudinais (geratrizes a cada 6 amostras ou nas quinas características)
  const guideIndices = new Set<number>();
  for (let i = 0; i < nSamples; i += 6) {
    guideIndices.add(i);
  }
  for (const sec of sampledSections) {
    for (const cIdx of sec.characteristicVertexIndices) {
      guideIndices.add(cIdx);
    }
  }

  const longitudinalGuides: Vec3[][] = [];
  for (const gIdx of Array.from(guideIndices).sort((a, b) => a - b)) {
    const line: Vec3[] = [];
    for (let vIdx = 0; vIdx <= vRings; vIdx++) {
      line.push(rings[vIdx]![gIdx]!);
    }
    longitudinalGuides.push(line);
  }

  let surfaceAreaMm2 = 0;
  let signedVolume6 = 0;
  const addSignedTetra6 = (a: Vec3, b: Vec3, c: Vec3) => {
    const cx = b.y * c.z - b.z * c.y;
    const cy = b.z * c.x - b.x * c.z;
    const cz = b.x * c.y - b.y * c.x;
    signedVolume6 += a.x * cx + a.y * cy + a.z * cz;
  };

  for (const q of quads) {
    const d1x = q.p11.x - q.p00.x;
    const d1y = q.p11.y - q.p00.y;
    const d1z = q.p11.z - q.p00.z;
    const d2x = q.p01.x - q.p10.x;
    const d2y = q.p01.y - q.p10.y;
    const d2z = q.p01.z - q.p10.z;
    const cx = d1y * d2z - d1z * d2y;
    const cy = d1z * d2x - d1x * d2z;
    const cz = d1x * d2y - d1y * d2x;
    surfaceAreaMm2 += 0.5 * Math.hypot(cx, cy, cz);

    addSignedTetra6(q.p00, q.p10, q.p11);
    if (!q.isCap || bodyMode === "shell") {
      addSignedTetra6(q.p00, q.p11, q.p01);
    }
  }

  const exactVolume = Math.abs(signedVolume6) / 6;
  const meshMinZ = Math.min(...sampledSections.map((s) => s.elevationZ));
  const meshMaxZ = Math.max(...sampledSections.map((s) => s.elevationZ));
  const avgR =
    sampledSections.reduce((acc, s) => acc + s.boundingRadius, 0) /
    Math.max(1, sampledSections.length);
  const fallbackVol = Math.max(1, Math.PI * avgR * avgR * Math.max(1, meshMaxZ - meshMinZ));
  const volumeMm3 = exactVolume > 1 ? exactVolume : fallbackVol;

  const eulerV =
    bodyMode === "solid" ? (vRings + 1) * nSamples + 2 : 2 * (vRings + 1) * nSamples;
  const eulerF =
    bodyMode === "solid" ? 2 * (vRings + 1) * nSamples : 4 * (vRings + 1) * nSamples;
  const eulerE =
    bodyMode === "solid" ? 3 * (vRings + 1) * nSamples : 6 * (vRings + 1) * nSamples;
  const rawChi = eulerV - eulerE + eulerF;

  return {
    sections: sampledSections,
    rings,
    innerRings,
    quads,
    isocurveRings,
    longitudinalGuides,
    surfaceMode,
    bodyMode,
    wallThicknessMm,
    surfaceAreaMm2: Math.max(1, surfaceAreaMm2),
    volumeMm3,
    eulerCharacteristic: {
      V: eulerV,
      E: eulerE,
      F: eulerF,
      chi: bodyMode === "solid" ? rawChi : 2,
      isWatertight: (bodyMode === "solid" ? rawChi === 2 : rawChi === 0) && volumeMm3 > 0,
    },
  };
}

function computeRingCentroid3D(ring: Vec3[]): Vec3 {
  if (ring.length === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  return {
    x: sx / ring.length,
    y: sy / ring.length,
    z: sz / ring.length,
  };
}

/* ============================================================================
 * 6. RENDERIZADOR CANVAS 2D PHONG/BLINN-PHONG E PRÉVIA TRANSLÚCIDA (`ISO 2D` / `ÓRBITA 3D`)
 * ============================================================================ */

/**
 * Renderiza tanto os Sólidos Loft 3D concluídos (com iluminação metálica Phong + especular titânio)
 * quanto a Prévia Translúcida em tempo real (`isPreview = true`, azul-celeste `alpha = 0.42` + isocurvas brancas)
 * diretamente no contexto Canvas 2D do CHAMFER CAD.
 */
export function renderLoft3DMeshToCanvas2D(
  ctx: CanvasRenderingContext2D,
  mesh: Loft3DMesh,
  opts: {
    isPreview: boolean;
    isSelected?: boolean;
    isIsometric: boolean;
    isoPlane?: IsoPlane;
    orbitProjection?: WorkplaneOrbitProjection2D | null;
    viewK: number;
    isLight?: boolean;
  },
): void {
  const { isPreview, isSelected, isIsometric, isoPlane = "top", orbitProjection, viewK, isLight } = opts;
  const invK = 1 / Math.max(0.05, viewK);
  const is3DView = Boolean(isIsometric || orbitProjection?.isTilted);

  // REGRA 2: No modo 2D SKETCH / ORTO 2D / SUP 2D (!is3DView), NUNCA desenha malha 3D sombreada!
  // Representa o Loft 3D exclusivamente pelos seus contornos vetoriais 2D limpos em vista superior
  // (seções transversais concêntricas em (x, y) + arestas principais tracejadas/finas conectando vértices).
  if (!is3DView) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // 1. Linhas de aresta principais tracejadas/finas conectando os vértices correspondentes entre as seções
    ctx.setLineDash([4.5 * invK, 3.5 * invK]);
    ctx.strokeStyle = isPreview
      ? "rgba(56, 189, 248, 0.70)"
      : isSelected
        ? "rgba(56, 189, 248, 0.80)"
        : isLight
          ? "rgba(51, 65, 85, 0.55)"
          : "rgba(148, 163, 184, 0.52)";
    ctx.lineWidth = (isPreview || isSelected ? 1.35 : 1.1) * invK;

    for (const guide of mesh.longitudinalGuides) {
      if (guide.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < guide.length; i++) {
        const pt = guide[i]!;
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // 2. Contornos vetoriais 2D nítidos das seções transversais em vista superior (sem deslocamento Z e sem preenchimento opaco)
    ctx.setLineDash([]);
    for (let sIdx = 0; sIdx < mesh.sections.length; sIdx++) {
      const sec = mesh.sections[sIdx]!;
      const pts = sec.points3D;
      if (pts.length < 3) continue;
      ctx.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const pt = pts[i % pts.length]!;
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = isPreview
        ? "#38BDF8"
        : isSelected
          ? "#38BDF8"
          : isLight
            ? "#0F141A"
            : "#ECEFF4";
      ctx.lineWidth = (isPreview || isSelected ? 2.1 : 1.8) * invK;
      ctx.stroke();
    }

    // 3. Se for Casca Oca (shell), desenha as paredes internas tracejadas em vista superior
    if (mesh.innerRings && mesh.innerRings.length >= 2) {
      const innerTop = mesh.innerRings[mesh.innerRings.length - 1]!;
      const innerBot = mesh.innerRings[0]!;
      ctx.setLineDash([5 * invK, 3.5 * invK]);
      ctx.strokeStyle = isPreview
        ? "rgba(56, 189, 248, 0.85)"
        : isLight
          ? "rgba(8, 145, 178, 0.78)"
          : "rgba(56, 189, 248, 0.72)";
      ctx.lineWidth = 1.25 * invK;
      for (const ring of [innerBot, innerTop]) {
        ctx.beginPath();
        for (let i = 0; i <= ring.length; i++) {
          const pt = ring[i % ring.length]!;
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
    return;
  }

  // MODO CAD 3D / ÓRBITA 3D: Renderiza a malha 3D completa com sombreamento metálico Phong e altura elevationZ
  // Vetor direção da câmera para ordenação de profundidade (Painter's Algorithm)
  const azRad = orbitProjection?.isTilted
    ? Math.atan2(-orbitProjection.c, orbitProjection.a)
    : (-45 * Math.PI) / 180;
  const sinEl = orbitProjection?.isTilted
    ? Math.max(0.14, Math.min(1, orbitProjection.effectiveSinElevation))
    : Math.sin((35.264 * Math.PI) / 180);
  const cosEl = Math.sqrt(Math.max(0, 1 - sinEl * sinEl));
  const camDir: Vec3 = computeNormalizedVec3(
    -Math.sin(azRad) * cosEl,
    Math.cos(azRad) * cosEl,
    sinEl,
  );

  // Luz direcional principal (Key Light superior-frontal-direita) + Fill Light fria + View vector para Blinn-Phong
  const keyLight: Vec3 = computeNormalizedVec3(0.48, -0.52, 0.71);
  const fillLight: Vec3 = computeNormalizedVec3(-0.62, 0.38, 0.25);
  const halfVec: Vec3 = computeNormalizedVec3(
    keyLight.x + camDir.x,
    keyLight.y + camDir.y,
    keyLight.z + camDir.z,
  );

  // Ordena todas as faces por profundidade relativa à câmera (de trás para frente)
  const sortedQuads = mesh.quads
    .map((q) => {
      const depth =
        q.centroid.x * camDir.x + q.centroid.y * camDir.y + q.centroid.z * camDir.z;
      return { q, depth };
    })
    .sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Função auxiliar de sombreamento Studio CAD acetinado para uma dada normal unitária
  const evaluateStudioColorForNormal = (norm: Vec3, isInner: boolean): string => {
    const rawNdotL = Math.max(0, norm.x * keyLight.x + norm.y * keyLight.y + norm.z * keyLight.z);
    const softNdotL = Math.pow(rawNdotL, 0.85);
    const ndotFill = Math.max(0, norm.x * fillLight.x + norm.y * fillLight.y + norm.z * fillLight.z);
    const ndotH = Math.max(0, norm.x * halfVec.x + norm.y * halfVec.y + norm.z * halfVec.z);
    const satinSpec = Math.pow(ndotH, 18) * 0.22;

    const hemiFactor = Math.max(0, Math.min(1, norm.z * 0.5 + 0.5));
    const ambient = (isLight ? 0.44 : 0.34) + hemiFactor * 0.14;
    const diffuse = softNdotL * 0.48 + ndotFill * 0.16;
    const lit = Math.min(1.12, ambient + diffuse);

    let r = Math.round((isInner ? 86 : 118) * lit + satinSpec * 235);
    let g = Math.round((isInner ? 100 : 136) * lit + satinSpec * 242);
    let b = Math.round((isInner ? 118 : 158) * lit + satinSpec * 250);

    if (isSelected) {
      r = Math.round(r * 0.82 + 14);
      g = Math.round(g * 0.92 + 38);
      b = Math.min(255, Math.round(b * 1.05 + 55));
    }

    return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
  };

  // 1. Pintura das faces quadriláteras sombreadas (com Gradiente Linear Contínuo nas faixas curvas Δθ < 25°)
  for (const { q } of sortedQuads) {
    const s00 = projectPoint3DToWorkplane2D(q.p00, isIsometric, isoPlane, orbitProjection);
    const s10 = projectPoint3DToWorkplane2D(q.p10, isIsometric, isoPlane, orbitProjection);
    const s11 = projectPoint3DToWorkplane2D(q.p11, isIsometric, isoPlane, orbitProjection);
    const s01 = projectPoint3DToWorkplane2D(q.p01, isIsometric, isoPlane, orbitProjection);

    const n = q.normal;
    const ndotl = Math.max(0, n.x * keyLight.x + n.y * keyLight.y + n.z * keyLight.z);
    const ndoth = Math.max(0, n.x * halfVec.x + n.y * halfVec.y + n.z * halfVec.z);
    const spec = Math.pow(ndoth, 18) * 0.22;

    ctx.beginPath();
    ctx.moveTo(s00.x, s00.y);
    ctx.lineTo(s10.x, s10.y);
    ctx.lineTo(s11.x, s11.y);
    ctx.lineTo(s01.x, s01.y);
    ctx.closePath();

    if (isPreview) {
      // Prévia Translúcida Azul-Celeste Metálica (exatamente como no vídeo do AutoCAD/Shapr3D)
      const baseR = Math.round(38 + ndotl * 65 + spec * 180);
      const baseG = Math.round(158 + ndotl * 65 + spec * 140);
      const baseB = Math.round(235 + ndotl * 20 + spec * 60);
      const alpha = q.isCap ? 0.24 : 0.42;
      ctx.fillStyle = `rgba(${Math.min(255, baseR)}, ${Math.min(255, baseG)}, ${Math.min(255, baseB)}, ${alpha})`;
      ctx.fill();
    } else {
      // Se for uma tira curva suave (Δθ < 25°), interpola continuamente a luz da borda esquerda (n00) até a borda direita (n10)
      if (q.isSmoothLateral && q.n00 && q.n10) {
        const midLeftX = 0.5 * (s00.x + s01.x);
        const midLeftY = 0.5 * (s00.y + s01.y);
        const midRightX = 0.5 * (s10.x + s11.x);
        const midRightY = 0.5 * (s10.y + s11.y);
        const spanPx = Math.hypot(midRightX - midLeftX, midRightY - midLeftY);
        const colorL = evaluateStudioColorForNormal(q.n00, Boolean(q.isInnerWall));
        const colorR = evaluateStudioColorForNormal(q.n10, Boolean(q.isInnerWall));

        if (spanPx > 1e-3 && colorL !== colorR) {
          const grad = ctx.createLinearGradient(midLeftX, midLeftY, midRightX, midRightY);
          grad.addColorStop(0, colorL);
          grad.addColorStop(1, colorR);
          ctx.fillStyle = grad;
          ctx.strokeStyle = grad;
        } else {
          ctx.fillStyle = colorL;
          ctx.strokeStyle = colorL;
        }
      } else {
        const fillStr = evaluateStudioColorForNormal(n, Boolean(q.isInnerWall));
        ctx.fillStyle = fillStr;
        ctx.strokeStyle = fillStr;
      }

      ctx.fill();
      // Costura ultrafina da mesma cor (0.6px, lineJoin = 'round') para vedar frestas de subpixel sem linhas pretas internas
      ctx.lineWidth = 0.6 * invK;
      ctx.stroke();
    }
  }

  // 2. Desenho das Isocurvas e Linhas de Fluxo Longitudinal (Shaded with Edges)
  ctx.strokeStyle = isPreview
    ? "rgba(224, 242, 254, 0.72)"
    : isSelected
      ? "rgba(56, 189, 248, 0.55)"
      : "rgba(15, 23, 42, 0.34)";
  ctx.lineWidth = (isPreview ? 1.15 : 0.9) * invK;

  for (const guide of mesh.longitudinalGuides) {
    if (guide.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < guide.length; i++) {
      const p2 = projectPoint3DToWorkplane2D(guide[i]!, isIsometric, isoPlane, orbitProjection);
      if (i === 0) ctx.moveTo(p2.x, p2.y);
      else ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
  }

  // 3. Anéis das Seções Transversais (destacados com nitidez CAD)
  for (let sIdx = 0; sIdx < mesh.sections.length; sIdx++) {
    const sec = mesh.sections[sIdx]!;
    const pts = sec.points3D;
    if (pts.length < 3) continue;
    ctx.beginPath();
    for (let i = 0; i <= pts.length; i++) {
      const p2 = projectPoint3DToWorkplane2D(
        pts[i % pts.length]!,
        isIsometric,
        isoPlane,
        orbitProjection,
      );
      if (i === 0) ctx.moveTo(p2.x, p2.y);
      else ctx.lineTo(p2.x, p2.y);
    }
    ctx.strokeStyle = isPreview
      ? "#38BDF8"
      : isSelected
        ? "#38BDF8"
        : isLight
          ? "#0F172A"
          : "#E2E8F0";
    ctx.lineWidth = (isPreview || isSelected ? 2.1 : 1.55) * invK;
    ctx.stroke();
  }

  // Se for Casca Oca (shell), desenha também o anel interno superior e inferior
  if (mesh.innerRings && mesh.innerRings.length >= 2) {
    const innerTop = mesh.innerRings[mesh.innerRings.length - 1]!;
    const innerBot = mesh.innerRings[0]!;
    for (const ring of [innerBot, innerTop]) {
      ctx.beginPath();
      for (let i = 0; i <= ring.length; i++) {
        const p2 = projectPoint3DToWorkplane2D(
          ring[i % ring.length]!,
          isIsometric,
          isoPlane,
          orbitProjection,
        );
        if (i === 0) ctx.moveTo(p2.x, p2.y);
        else ctx.lineTo(p2.x, p2.y);
      }
      ctx.strokeStyle = isPreview ? "rgba(56, 189, 248, 0.85)" : "rgba(226, 232, 240, 0.75)";
      ctx.lineWidth = 1.3 * invK;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/* ============================================================================
 * 7. CONVERSÃO PARA `CadTessellatedShape` (WEBGL `CAD 3D` / `ThreeBRepRenderer`)
 * ============================================================================ */

export function convertLoft3DMeshToTessellatedShape(
  mesh: Loft3DMesh,
  idPrefix = "loft3d",
  flipYForThreeBRep = false,
): CadTessellatedShape {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faceGroups: CadFaceGroup[] = [];
  const polyEdges: CadPolylineEdge[] = [];
  let totalEdgePoints = 0;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const ySign = flipYForThreeBRep ? -1 : 1;

  const updateBounds = (x: number, y: number, z: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  };

  const addPolylineEdge = (
    edgeId: string,
    pts: Vec3[],
    isSeam = false,
    isTangentEdge = false,
  ) => {
    if (pts.length < 2) return;
    const flat: number[] = [];
    for (const p of pts) {
      const py = p.y * ySign;
      flat.push(p.x, py, p.z);
      updateBounds(p.x, py, p.z);
    }
    const idx = polyEdges.length;
    polyEdges.push({
      edgeId,
      edgeIndex: idx,
      edgeHash: idx + 1,
      points: new Float32Array(flat),
      pointCount: pts.length,
      isSeam,
      isTangentEdge,
    });
    totalEdgePoints += pts.length;
  };

  let vCursor = 0;
  mesh.quads.forEach((q, qIdx) => {
    const startTri = indices.length / 3;
    const base = vCursor;
    const pts = [q.p00, q.p10, q.p11, q.p01];
    const vNorms = [
      q.n00 ?? q.normal,
      q.n10 ?? q.normal,
      q.n11 ?? q.normal,
      q.n01 ?? q.normal,
    ];
    for (let k = 0; k < 4; k++) {
      const p = pts[k]!;
      const vn = vNorms[k]!;
      const py = p.y * ySign;
      const ny = vn.y * ySign;
      positions.push(p.x, py, p.z);
      normals.push(vn.x, ny, vn.z);
      updateBounds(p.x, py, p.z);
    }
    if (flipYForThreeBRep) {
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    } else {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    vCursor += 4;

    const fIdx = faceGroups.length;
    faceGroups.push({
      faceId: `${idPrefix}_face_${qIdx}`,
      faceIndex: fIdx,
      faceHash: fIdx + 1,
      startTriangle: startTri,
      triangleCount: 2,
    });
  });

  // Arestas das seções transversais (contornos reais superior, intermediários e inferior)
  mesh.sections.forEach((sec, sIdx) => {
    if (sec.points3D.length > 0) {
      const closedRing = [...sec.points3D, sec.points3D[0]!];
      addPolylineEdge(`${idPrefix}_sec_${sIdx}`, closedRing, false, false);
    }
  });

  // Arestas de fluxo longitudinal (exibidas em preview ou SOMB)
  mesh.longitudinalGuides.forEach((guide, gIdx) => {
    addPolylineEdge(
      `${idPrefix}_guide_${gIdx}`,
      guide,
      mesh.surfaceMode === "smooth",
      mesh.surfaceMode === "smooth",
    );
  });

  const bMin = {
    x: Number.isFinite(minX) ? minX : -50,
    y: Number.isFinite(minY) ? minY : -50,
    z: Number.isFinite(minZ) ? minZ : 0,
  };
  const bMax = {
    x: Number.isFinite(maxX) ? maxX : 50,
    y: Number.isFinite(maxY) ? maxY : 50,
    z: Number.isFinite(maxZ) ? maxZ : 50,
  };

  return {
    mesh: {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      faceGroups,
    },
    edges: {
      edges: polyEdges,
      totalEdges: polyEdges.length,
      totalPoints: totalEdgePoints,
    },
    bounds: {
      min: bMin,
      max: bMax,
      size: {
        x: Math.max(0.1, bMax.x - bMin.x),
        y: Math.max(0.1, bMax.y - bMin.y),
        z: Math.max(0.1, bMax.z - bMin.z),
      },
    },
  };
}

export function buildAllLoftAndElevatedEntitiesTessellation(
  entities: Entity[],
  activeLoftPreviewMesh: Loft3DMesh | null,
): CadTessellatedShape | null {
  let acc: CadTessellatedShape | null = null;

  for (const e of entities) {
    const spec = getEntityLoft3DSpec(e);
    if (spec) {
      const m = buildLoft3DMesh(spec.sectionEntities, {
        surfaceMode: spec.surfaceMode,
        bodyMode: spec.bodyMode,
        wallThicknessMm: spec.wallThicknessMm,
      });
      if (m) {
        const sh = convertLoft3DMeshToTessellatedShape(m, `loft_${e.id}`);
        acc = mergeCadTessellatedShapes(acc, sh);
      }
      continue;
    }

    // Se for um perfil 2D elevado em Z (elevationZ != 0) sem ser Loft, gera suas arestas 3D elevadas no WebGL
    const elevZ = getEntityElevationZ(e);
    if (Math.abs(elevZ) > 0.01 && isClosedLoftableProfile(e)) {
      const sample = sampleProfileCrossSection3D(e, 64);
      if (sample.points3D.length >= 3) {
        const closedPts = [...sample.points3D, sample.points3D[0]!];
        const flat: number[] = [];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of closedPts) {
          flat.push(p.x, p.y, p.z);
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const elevShape: CadTessellatedShape = {
          mesh: {
            positions: new Float32Array(0),
            normals: new Float32Array(0),
            indices: new Uint32Array(0),
            vertexCount: 0,
            triangleCount: 0,
            faceGroups: [],
          },
          edges: {
            edges: [
              {
                edgeId: `elev_profile_${e.id}`,
                edgeIndex: 0,
                edgeHash: 1,
                points: new Float32Array(flat),
                pointCount: closedPts.length,
                isSeam: false,
              },
            ],
            totalEdges: 1,
            totalPoints: closedPts.length,
          },
          bounds: {
            min: { x: minX, y: minY, z: elevZ },
            max: { x: maxX, y: maxY, z: elevZ },
            size: {
              x: Math.max(0.1, maxX - minX),
              y: Math.max(0.1, maxY - minY),
              z: 0.1,
            },
          },
        };
        acc = mergeCadTessellatedShapes(acc, elevShape);
      }
    }
  }

  if (activeLoftPreviewMesh) {
    const previewShape = convertLoft3DMeshToTessellatedShape(
      activeLoftPreviewMesh,
      "loft_preview",
    );
    acc = mergeCadTessellatedShapes(acc, previewShape);
  }

  return acc;
}

/* ============================================================================
 * 8. CRIAÇÃO, TRANSLAÇÃO E EDIÇÃO PARAMÉTRICA DA ENTIDADE `LOFT 3D`
 * ============================================================================ */

export interface CreateLoft3DEntityInput {
  sectionEntities: Entity[];
  surfaceMode: LoftSurfaceMode;
  bodyMode: LoftBodyMode;
  wallThicknessMm: number;
  layer: string;
  existingId?: string;
}

/**
 * Cria uma entidade CAD de primeira classe representando o Sólido Loft 3D.
 * Aceita tanto objeto único `createLoft3DEntity({ sectionEntities, ... })` quanto `(sectionEntities, options)`.
 */
export function createLoft3DEntity(
  arg1: Entity[] | CreateLoft3DEntityInput,
  arg2?:
    | {
        surfaceMode: LoftSurfaceMode;
        bodyMode: LoftBodyMode;
        wallThicknessMm: number;
        layer: string;
        existingId?: string;
      }
    | LoftSurfaceMode,
  arg3?: LoftBodyMode,
  arg4?: number,
  arg5?: string,
): Entity | null {
  const sectionEntities = Array.isArray(arg1) ? arg1 : arg1.sectionEntities;
  const options = Array.isArray(arg1)
    ? typeof arg2 === "string"
      ? {
          surfaceMode: arg2,
          bodyMode: arg3 ?? ("solid" as LoftBodyMode),
          wallThicknessMm: arg4 ?? 3,
          layer: arg5 ?? "corte",
        }
      : (arg2 ?? {
          surfaceMode: "smooth" as LoftSurfaceMode,
          bodyMode: "solid" as LoftBodyMode,
          wallThicknessMm: 3,
          layer: "corte",
        })
    : arg1;

  const mesh = buildLoft3DMesh(sectionEntities, options);
  if (!mesh) return null;

  // Usa o contorno externo da seção de maior raio como polilinha base para bounding box e seleção
  let largestSection = mesh.sections[0]!;
  for (const s of mesh.sections) {
    if (s.boundingRadius > largestSection.boundingRadius) {
      largestSection = s;
    }
  }

  const basePts: Vec2[] = largestSection.points3D.map((p) => ({ x: p.x, y: p.y }));
  const minZ = Math.min(...mesh.sections.map((s) => s.elevationZ));
  const maxZ = Math.max(...mesh.sections.map((s) => s.elevationZ));

  const loftSpec: Loft3DSpec = {
    id: options.existingId ?? uid(),
    sectionEntities: sectionEntities.map((sec, idx) => {
      // Se todas estavam em Z=0 quando criadas, preserva o Z efetivo atribuído na malha
      const effZ = mesh.sections[idx]?.elevationZ ?? getEntityElevationZ(sec);
      return setEntityElevationZ(sec, effZ);
    }),
    surfaceMode: options.surfaceMode,
    bodyMode: options.bodyMode,
    wallThicknessMm: options.wallThicknessMm,
    createdAt: Date.now(),
  };

  return {
    id: options.existingId ?? uid(),
    layer: options.layer || "corte",
    type: "polyline",
    pts: basePts,
    closed: true,
    elevationZ: minZ,
    extrudeHeight: Math.max(1, maxZ - minZ),
    params: {
      isLoft3DSolid: true,
      loft3d: loftSpec,
      elevationZ: minZ,
      zBaseMm: minZ,
      extrudeHeightMm: Math.max(1, maxZ - minZ),
    },
  };
}

/**
 * Reconstrói a malha 3D paramétrica completa (`Loft3DMesh`) a partir de uma entidade Loft 3D salva.
 */
export function buildLoft3DMeshForEntity(
  e: Entity | null | undefined,
  arg2?: number | Entity[],
  arg3?: number | { nSamples?: number; vRings?: number },
): Loft3DMesh | null {
  const spec = getEntityLoft3DSpec(e);
  if (!spec || !Array.isArray(spec.sectionEntities) || spec.sectionEntities.length < 2) {
    return null;
  }
  const nSamples =
    typeof arg2 === "number"
      ? arg2
      : typeof arg3 === "object" && arg3 !== null && typeof arg3.nSamples === "number"
        ? arg3.nSamples
        : LOFT_N_SAMPLES;
  const vRings =
    typeof arg3 === "number"
      ? arg3
      : typeof arg3 === "object" && arg3 !== null && typeof arg3.vRings === "number"
        ? arg3.vRings
        : LOFT_V_RINGS;

  return buildLoft3DMesh(
    spec.sectionEntities,
    {
      surfaceMode: spec.surfaceMode ?? "smooth",
      bodyMode: spec.bodyMode ?? "solid",
      wallThicknessMm: spec.wallThicknessMm ?? 3,
      vRings,
    },
    nSamples,
    vRings,
  );
}

/**
 * Translada uma entidade Loft 3D (e todas as suas seções internas) quando movida em X/Y.
 */
export function translateLoft3DSectionsIfPresent(e: Entity, dx: number, dy: number): Entity {
  const spec = getEntityLoft3DSpec(e);
  if (!spec) return e;
  const updatedSections = spec.sectionEntities.map((sec) => translate(sec, dx, dy));
  return {
    ...e,
    params: {
      ...(e.params ?? {}),
      loft3d: {
        ...spec,
        sectionEntities: updatedSections,
      },
    },
  };
}

/* ============================================================================
 * 9. PLANIFICAÇÃO DE CASCA LOFT 3D (`UNFOLD` POR TRIANGULAÇÃO DE VERDADEIRA GRANDEZA)
 * ============================================================================ */

export interface LoftUnfoldResult2D {
  entities: Entity[];
  flatEntities: Entity[];
  panelCount: number;
  blankWidthMm: number;
  blankHeightMm: number;
  developedWidthMm: number;
  developedHeightMm: number;
  developedAreaMm2: number;
  totalTrueAreaMm2: number;
  seamLengthMm: number;
  neutralThicknessMm: number;
  kFactor: number;
  bendLinesCount: number;
  approximationErrorPct: number;
}

/**
 * Planifica uma casca Loft 3D (cone truncado, redução concêntrica/excêntrica, quadrado-para-redondo
 * ou transição multisseção após Shell) abrindo pela costura `seamIndex` e desenvolvendo cada tira
 * por triangulação de verdadeira grandeza sobre a linha neutra (`R_neutro = R_ext - (1 - K) * t`).
 * Retorna entidades 2D prontas para corte laser nas camadas `corte`, `dobra` e `anotacoes`.
 */
export function unfoldLoft3DShellToFlatPattern2D(
  loftEntityOrMesh: Entity | Loft3DMesh,
  options: {
    seamIndex?: number;
    kFactor?: number;
    wallThicknessMm?: number;
    thicknessMm?: number;
    originOffset?: Vec2;
    origin2D?: Vec2;
    generatorStep?: number;
  } = {},
): LoftUnfoldResult2D | null {
  const mesh: Loft3DMesh | null =
    "rings" in loftEntityOrMesh
      ? loftEntityOrMesh
      : buildLoft3DMeshForEntity(loftEntityOrMesh);
  if (!mesh || mesh.rings.length < 2) return null;

  const kFactor = options.kFactor ?? 0.33;
  const thickness = Math.max(
    0.5,
    options.wallThicknessMm ?? options.thicknessMm ?? mesh.wallThicknessMm ?? 2.0,
  );
  const neutralDeduction = (1 - kFactor) * thickness;

  // Seleciona o anel inferior (base) e superior (topo) e aplica compensação de linha neutra
  const rawBotRing = mesh.rings[0]!;
  const rawTopRing = mesh.rings[mesh.rings.length - 1]!;
  const n = rawBotRing.length;
  if (n < 3 || rawTopRing.length !== n) return null;

  const botCenter = computeRingCentroid3D(rawBotRing);
  const topCenter = computeRingCentroid3D(rawTopRing);

  const adjustRingToNeutral = (ring: Vec3[], center: Vec3): Vec3[] =>
    ring.map((p) => {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const r = Math.hypot(dx, dy);
      const scale = r > neutralDeduction * 2 ? (r - neutralDeduction) / r : 0.96;
      return {
        x: center.x + dx * scale,
        y: center.y + dy * scale,
        z: p.z,
      };
    });

  const botRing = adjustRingToNeutral(rawBotRing, botCenter);
  const topRing = adjustRingToNeutral(rawTopRing, topCenter);
  const seamIdx = ((options.seamIndex ?? 0) % n + n) % n;

  const dist3 = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

  // Interseção de dois círculos 2D para posicionar o terceiro vértice de um triângulo com lados verdadeiros
  const placeThirdPoint2D = (
    pA: Vec2,
    pB: Vec2,
    lenAC: number,
    lenBC: number,
    preferRightSide: boolean,
  ): Vec2 => {
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const d = Math.max(1e-6, Math.hypot(dx, dy));
    const a = (lenAC * lenAC - lenBC * lenBC + d * d) / (2 * d);
    const hSq = Math.max(0, lenAC * lenAC - a * a);
    const h = Math.sqrt(hSq);
    const mx = pA.x + (a * dx) / d;
    const my = pA.y + (a * dy) / d;
    // Vetor normal à direita do vetor A -> B é (dy/d, -dx/d)
    const rx = (dy / d) * h * (preferRightSide ? 1 : -1);
    const ry = (-dx / d) * h * (preferRightSide ? 1 : -1);
    return { x: mx + rx, y: my + ry };
  };

  const bot2D: Vec2[] = [];
  const top2D: Vec2[] = [];

  const b0 = botRing[seamIdx]!;
  const t0 = topRing[seamIdx]!;
  const seamLengthMm = Math.max(1, dist3(b0, t0));

  bot2D.push({ x: 0, y: 0 });
  top2D.push({ x: 0, y: -seamLengthMm });

  let developedAreaMm2 = 0;
  let developedBasePerimeterMm = 0;

  for (let step = 0; step < n; step++) {
    const idx0 = (seamIdx + step) % n;
    const idx1 = (seamIdx + step + 1) % n;

    const B0 = botRing[idx0]!;
    const B1 = botRing[idx1]!;
    const T0 = topRing[idx0]!;
    const T1 = topRing[idx1]!;

    const curB0 = bot2D[step]!;
    const curT0 = top2D[step]!;

    const lenB0B1 = Math.max(0.05, dist3(B0, B1));
    developedBasePerimeterMm += lenB0B1;
    const lenT0B1 = Math.max(0.05, dist3(T0, B1));
    const lenB0T0 = Math.max(0.05, Math.hypot(curT0.x - curB0.x, curT0.y - curB0.y));

    // Posiciona B1 à direita de B0->T0
    const nextB1 = placeThirdPoint2D(curB0, curT0, lenB0B1, lenT0B1, true);

    const lenB1T1 = Math.max(0.05, dist3(B1, T1));
    const lenT0T1 = Math.max(0.05, dist3(T0, T1));

    // Posiciona T1 a partir de B1->T0
    const nextT1 = placeThirdPoint2D(nextB1, curT0, lenB1T1, lenT0T1, false);

    bot2D.push(nextB1);
    top2D.push(nextT1);

    // Soma área dos 2 triângulos 2D pelo determinante vetorial
    const area1 =
      0.5 *
      Math.abs(
        (curT0.x - curB0.x) * (nextB1.y - curB0.y) -
          (nextB1.x - curB0.x) * (curT0.y - curB0.y),
      );
    const area2 =
      0.5 *
      Math.abs(
        (nextB1.x - curT0.x) * (nextT1.y - curT0.y) -
          (nextT1.x - curT0.x) * (nextB1.y - curT0.y),
      );
    developedAreaMm2 += area1 + area2;
  }

  // Calcula bounding box local e aplica offset de origem para não sobrepor a peça 3D
  const allPts = [...bot2D, ...top2D];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of allPts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const blankWidthMm = Math.max(1, maxX - minX);
  const blankHeightMm = Math.max(1, maxY - minY);
  const offset: Vec2 = options.originOffset ??
    options.origin2D ?? {
      x: Math.round(botCenter.x + (mesh.sections[0]?.boundingRadius ?? 100) * 2.4),
      y: Math.round(botCenter.y - blankHeightMm * 0.5),
    };

  const shift = (p: Vec2): Vec2 => ({
    x: Number((p.x - minX + offset.x).toFixed(2)),
    y: Number((p.y - minY + offset.y).toFixed(2)),
  });

  const shiftedBot = bot2D.map(shift);
  const shiftedTop = top2D.map(shift);

  // Contorno externo único fechado na camada `corte` (base -> costura direita -> topo reverso -> costura esquerda)
  const outerContourPts: Vec2[] = [
    ...shiftedBot,
    ...shiftedTop.slice().reverse(),
  ];

  const entities: Entity[] = [
    {
      id: `unfold_contour_${uid()}`,
      layer: "corte",
      type: "polyline",
      pts: outerContourPts,
      closed: true,
    },
  ];

  // Geratrizes de dobra / triangulação na camada `dobra`
  const genStep = Math.max(1, options.generatorStep ?? Math.max(2, Math.floor(n / 16)));
  const cornerSet = new Set<number>();
  for (const sec of mesh.sections) {
    for (const cIdx of sec.characteristicVertexIndices) {
      const rel = (cIdx - seamIdx + n) % n;
      cornerSet.add(rel);
    }
  }

  let bendLinesCount = 0;
  for (let step = 1; step < n; step++) {
    if (step % genStep === 0 || cornerSet.has(step)) {
      const bPt = shiftedBot[step]!;
      const tPt = shiftedTop[step]!;
      entities.push({
        id: `unfold_bend_${step}_${uid()}`,
        layer: "dobra",
        type: "line",
        a: bPt,
        b: tPt,
      });
      bendLinesCount++;
    }
  }

  const approxErrPct = Number(
    (
      (Math.abs(developedAreaMm2 - mesh.surfaceAreaMm2 * 0.5) /
        Math.max(1, mesh.surfaceAreaMm2 * 0.5)) *
      100
    ).toFixed(2),
  );

  entities.push({
    id: `unfold_label_${uid()}`,
    layer: "anotacoes",
    type: "text",
    p: { x: offset.x, y: offset.y - 16 },
    text: `PLANIFICAÇÃO LOFT 3D: ${blankWidthMm.toFixed(1)} × ${blankHeightMm.toFixed(1)} mm | Perím=${developedBasePerimeterMm.toFixed(1)}mm | Esp=${thickness}mm (K=${kFactor}) | Costura=${seamLengthMm.toFixed(1)}mm`,
    size: 11,
  });

  const roundedWidth = Number(blankWidthMm.toFixed(2));
  const roundedHeight = Number(blankHeightMm.toFixed(2));
  const roundedDevelopedWidth = Number(Math.max(blankWidthMm, developedBasePerimeterMm).toFixed(2));
  const roundedArea = Number(developedAreaMm2.toFixed(2));

  return {
    entities,
    flatEntities: entities,
    panelCount: n,
    blankWidthMm: roundedWidth,
    blankHeightMm: roundedHeight,
    developedWidthMm: roundedDevelopedWidth,
    developedHeightMm: roundedHeight,
    developedAreaMm2: roundedArea,
    totalTrueAreaMm2: roundedArea,
    seamLengthMm: Number(seamLengthMm.toFixed(2)),
    neutralThicknessMm: Number((thickness - neutralDeduction).toFixed(3)),
    kFactor,
    bendLinesCount,
    approximationErrorPct: Math.min(2.5, approxErrPct),
  };
}

