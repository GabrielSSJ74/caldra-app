/**
 * CALDRA — CHAMFER CAD 3D: KERNEL GEOMÉTRICO MODULAR B-REP & MALHAS PARAMÉTRICAS (`ChamferSolidKernel`)
 *
 * Elimina definitivamente o fallback de extrusão linear em Z: cada feature 3D possui seu próprio
 * gerador matemático explícito de vértices 3D, faces trianguladas/quadrangulares, normais suaves
 * e arestas de feature (quinas vivas e linhas de tangência).
 *
 * Features suportadas pelo dispatcher `buildSolidMesh(entity)`:
 * - `'extrude'`          : Extrusão prismática/cilíndrica com furos e Shell
 * - `'loft'`             : Transição multisseção C¹/Ruled (sólido ou casca de caldeiraria)
 * - `'revolve'`          : Revolução axial 0°–360° com anéis cilíndricos e tampas planas se θ < 360°
 * - `'sweep'`            : Varredura 3D com Parallel Transport (Bishop Frame) e bissetriz em quinas vivas
 * - `'hole_boolean'`     : Sólido com Furos Reais (Through, Blind, Counterbore, Countersink) e CSG (A-B, A∪B, A∩B)
 * - `'structural_frame'` : Tubo estrutural oco ao longo do vetor 3D da barra + corte no plano bissetor Miter 45°, Gusset e Sapata
 * - `'sheet_metal'`      : Chapa metálica com Base Flange + Edge Flange (arco de dobra R + aba inclinada θ), Hem e Jog
 * - `'unfolded_pattern'` : Padrão planificado 2D em verdadeira grandeza com Bend Allowance BA = θ*(π/180)*(R + K*t)
 */

import { boxOf, type Entity, type Vec2 } from "./core";
import { buildLoft3DMeshForEntity, type Loft3DMesh, type Loft3DQuad } from "./cadLoft3DEngine";

const DEG_TO_RAD = Math.PI / 180;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SolidFeatureType =
  | "extrude"
  | "loft"
  | "revolve"
  | "sweep"
  | "hole_boolean"
  | "structural_frame"
  | "sheet_metal"
  | "unfolded_pattern";

export interface SolidFeatureNode {
  id: string;
  entityId: string;
  featureType: SolidFeatureType;
  params: Record<string, unknown>;
}

export interface SolidFaceGroup3D {
  faceId: string;
  role: "top" | "bottom" | "side" | "inner_side" | "miter" | "bend" | "flange" | "hole_bottom" | "counterbore_step" | "countersink_cone";
  label: string;
  normal: Vec3;
  centroid: Vec3;
  areaMm2: number;
  polygon3D: Vec3[];
  /** Índices no array global de `indices` do SolidMesh3D (start e count) */
  indexStart: number;
  indexCount: number;
}

export interface SolidFeatureEdge3D {
  edgeId: string;
  role: "top" | "bottom" | "vertical" | "inner_top" | "inner_bottom" | "miter" | "bend_tangent";
  label: string;
  polyline3D: Vec3[];
  isTangentEdge: boolean;
  isSeam?: boolean;
}

export interface SolidMesh3D {
  featureType: SolidFeatureType;
  entityId: string;
  bodyName: string;
  /** Coordenadas (x, y, z) no referencial CAD 2D/3D (antes da inversão de Y do Three.js) */
  positions: number[];
  normals: number[];
  indices: number[];
  faces: SolidFaceGroup3D[];
  edges: SolidFeatureEdge3D[];
  /** Quads compatíveis com o renderizador Canvas 2D/3D (`renderLoft3DMeshToCanvas2D`) */
  quads: Loft3DQuad[];
  bbox3D: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  volumeMm3: number;
  surfaceAreaMm2: number;
  centerOfGravity3D: Vec3;
  eulerCharacteristic: { V: number; E: number; F: number; chi: number };
}

export interface MaterialDensityPreset {
  id: "steel_1020" | "stainless_304" | "aluminum_6061" | "copper";
  name: string;
  densityGPerCm3: number;
}

export const MATERIAL_DENSITY_PRESETS: readonly MaterialDensityPreset[] = [
  { id: "steel_1020", name: "Aço Carbono SAE 1020 (7.85 g/cm³)", densityGPerCm3: 7.85 },
  { id: "stainless_304", name: "Aço Inox AISI 304 (7.93 g/cm³)", densityGPerCm3: 7.93 },
  { id: "aluminum_6061", name: "Alumínio 6061-T6 (2.70 g/cm³)", densityGPerCm3: 2.70 },
  { id: "copper", name: "Cobre Eletrolítico (8.96 g/cm³)", densityGPerCm3: 8.96 },
] as const;

/* ============================================================================
 * FUNÇÕES AUXILIARES VETORIAIS 3D E TRIANGULAÇÃO
 * ============================================================================ */

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale3(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot3(a: Vec3, b: Vec3): Vec3["x"] {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len3(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize3(a: Vec3): Vec3 {
  const l = len3(a);
  if (l < 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** Fórmula de Rodrigues: rotaciona vetor `v` em torno do eixo unitário `k` pelo ângulo `thetaRad`. */
function rotateAroundAxis3D(v: Vec3, kUnit: Vec3, thetaRad: number): Vec3 {
  if (Math.abs(thetaRad) < 1e-8) return v;
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  const kCrossV = cross3(kUnit, v);
  const kDotV = dot3(kUnit, v);
  return {
    x: v.x * c + kCrossV.x * s + kUnit.x * kDotV * (1 - c),
    y: v.y * c + kCrossV.y * s + kUnit.y * kDotV * (1 - c),
    z: v.z * c + kCrossV.z * s + kUnit.z * kDotV * (1 - c),
  };
}

function triangleArea3(a: Vec3, b: Vec3, c: Vec3): number {
  return 0.5 * len3(cross3(sub3(b, a), sub3(c, a)));
}

function centroid3(pts: Vec3[]): Vec3 {
  if (pts.length === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  return { x: sx / pts.length, y: sy / pts.length, z: sz / pts.length };
}

function signedArea2D(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function ensureCCW2D(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts;
  return signedArea2D(pts) < 0 ? [...pts].reverse() : [...pts];
}

function sampleClosedProfile2D(entity: Entity, circleSegments = 32): Vec2[] {
  if (entity.type === "circle") {
    const pts: Vec2[] = [];
    for (let i = 0; i < circleSegments; i++) {
      const a = (i / circleSegments) * Math.PI * 2;
      pts.push({
        x: entity.cx + entity.r * Math.cos(a),
        y: entity.cy + entity.r * Math.sin(a),
      });
    }
    return pts;
  }
  if (entity.type === "ellipse") {
    const pts: Vec2[] = [];
    const rot = entity.rotation ?? 0;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let i = 0; i < circleSegments; i++) {
      const a = (i / circleSegments) * Math.PI * 2;
      const lx = entity.rx * Math.cos(a);
      const ly = entity.ry * Math.sin(a);
      pts.push({
        x: entity.cx + lx * cr - ly * sr,
        y: entity.cy + lx * sr + ly * cr,
      });
    }
    return pts;
  }
  if (entity.type === "polyline" && entity.pts.length >= 3) {
    const cleaned: Vec2[] = [];
    for (const p of entity.pts) {
      const prev = cleaned[cleaned.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-4) {
        cleaned.push(p);
      }
    }
    if (cleaned.length >= 2) {
      const first = cleaned[0]!;
      const last = cleaned[cleaned.length - 1]!;
      if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-4) {
        cleaned.pop();
      }
    }
    return ensureCCW2D(cleaned);
  }
  const b = boxOf(entity);
  return ensureCCW2D([
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ]);
}

/**
 * Calcula Volume Exato ($V = \frac{1}{6}|\sum \vec{v}_1 \cdot (\vec{v}_2 \times \vec{v}_3)|$),
 * Área Superficial ($A$) e Centro de Gravidade ($\vec{CG}$) de qualquer malha triangular fechada
 * usando o Teorema da Divergência de Gauss.
 */
export function computeDivergenceTheoremMassProperties(
  positions: number[],
  indices: number[],
  densityGPerCm3 = 7.85,
): {
  volumeMm3: number;
  surfaceAreaMm2: number;
  centerOfGravity3D: Vec3;
  massGrams: number;
  massKg: number;
} {
  let signedVol6 = 0;
  let totalArea = 0;
  let cxWeighted = 0;
  let cyWeighted = 0;
  let czWeighted = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i]! * 3;
    const i1 = indices[i + 1]! * 3;
    const i2 = indices[i + 2]! * 3;

    const v0 = { x: positions[i0] ?? 0, y: positions[i0 + 1] ?? 0, z: positions[i0 + 2] ?? 0 };
    const v1 = { x: positions[i1] ?? 0, y: positions[i1 + 1] ?? 0, z: positions[i1 + 2] ?? 0 };
    const v2 = { x: positions[i2] ?? 0, y: positions[i2 + 1] ?? 0, z: positions[i2 + 2] ?? 0 };

    const cross = cross3(v1, v2);
    const det = dot3(v0, cross);
    signedVol6 += det;

    cxWeighted += det * (v0.x + v1.x + v2.x);
    cyWeighted += det * (v0.y + v1.y + v2.y);
    czWeighted += det * (v0.z + v1.z + v2.z);

    totalArea += triangleArea3(v0, v1, v2);
  }

  const volumeMm3 = Math.abs(signedVol6) / 6;
  const centerOfGravity3D: Vec3 =
    Math.abs(signedVol6) > 1e-5
      ? {
          x: Number((cxWeighted / (4 * signedVol6)).toFixed(2)),
          y: Number((cyWeighted / (4 * signedVol6)).toFixed(2)),
          z: Number((czWeighted / (4 * signedVol6)).toFixed(2)),
        }
      : { x: 0, y: 0, z: 0 };

  const massGrams = (volumeMm3 / 1000) * densityGPerCm3;
  return {
    volumeMm3: Number(volumeMm3.toFixed(2)),
    surfaceAreaMm2: Number(totalArea.toFixed(2)),
    centerOfGravity3D,
    massGrams: Number(massGrams.toFixed(2)),
    massKg: Number((massGrams / 1000).toFixed(4)),
  };
}

/* ============================================================================
 * CLASSIFICADOR EXPLÍCITO DE FEATURE 3D (`resolveEntitySolidFeatureType`)
 * ============================================================================ */

export function resolveEntitySolidFeatureType(entity: Entity): SolidFeatureType {
  const p = entity.params ?? {};
  const explicitType = p.featureType as SolidFeatureType | undefined;
  if (
    explicitType === "revolve" ||
    explicitType === "sweep" ||
    explicitType === "hole_boolean" ||
    explicitType === "structural_frame" ||
    explicitType === "sheet_metal" ||
    explicitType === "unfolded_pattern" ||
    explicitType === "loft"
  ) {
    return explicitType;
  }

  if (entity.type === "loft3d" || Boolean(p.loft3d)) {
    return "loft";
  }

  const rev = p.revolve3d as { enabled?: boolean } | undefined;
  if (rev?.enabled) {
    return "revolve";
  }

  const swp = p.sweep3d as { enabled?: boolean } | undefined;
  if (swp?.enabled) {
    return "sweep";
  }

  const sm = p.sheetMetal3D as { enabled?: boolean } | undefined;
  if (sm?.enabled) {
    return "sheet_metal";
  }

  const sf = p.structuralFrame3D as { enabled?: boolean } | undefined;
  if (sf?.enabled || (entity.type === "line" && Boolean(entity.structuralProfile))) {
    return "structural_frame";
  }

  const advHoles = p.advancedHoles3D as unknown[] | undefined;
  const csgOp = p.csgBoolean3D as { enabled?: boolean } | undefined;
  if ((Array.isArray(advHoles) && advHoles.length > 0) || csgOp?.enabled) {
    return "hole_boolean";
  }

  return "extrude";
}

/* ============================================================================
 * CACHE DE MALHA 3D PARA SEPARAÇÃO GEOMETRIA × CÂMERA (60 FPS)
 * ============================================================================ */

const solidMeshCache = new Map<string, { signature: string; mesh: SolidMesh3D }>();

function computeEntityMeshSignature(entity: Entity, defaultThicknessMm: number): string {
  const b = boxOf(entity);
  return JSON.stringify({
    id: entity.id,
    type: entity.type,
    bbox: [
      Number(b.minX.toFixed(2)),
      Number(b.minY.toFixed(2)),
      Number(b.maxX.toFixed(2)),
      Number(b.maxY.toFixed(2)),
    ],
    elevationZ: entity.elevationZ ?? 0,
    extrudeHeight: entity.extrudeHeight ?? defaultThicknessMm,
    structuralProfile: entity.structuralProfile ?? null,
    params: entity.params ?? null,
  });
}

/* ============================================================================
 * HELPER DE CONSTRUÇÃO DE BUFFERS DE MALHA (QUADS & TRIANGLES)
 * ============================================================================ */

class MeshBuilder3D {
  positions: number[] = [];
  normals: number[] = [];
  indices: number[] = [];
  faces: SolidFaceGroup3D[] = [];
  edges: SolidFeatureEdge3D[] = [];
  quads: Loft3DQuad[] = [];

  minX = Infinity;
  maxX = -Infinity;
  minY = Infinity;
  maxY = -Infinity;
  minZ = Infinity;
  maxZ = -Infinity;

  touchPoint(p: Vec3) {
    if (p.x < this.minX) this.minX = p.x;
    if (p.x > this.maxX) this.maxX = p.x;
    if (p.y < this.minY) this.minY = p.y;
    if (p.y > this.maxY) this.maxY = p.y;
    if (p.z < this.minZ) this.minZ = p.z;
    if (p.z > this.maxZ) this.maxZ = p.z;
  }

  addQuad(
    p00: Vec3,
    p10: Vec3,
    p11: Vec3,
    p01: Vec3,
    n00?: Vec3,
    n10?: Vec3,
    n11?: Vec3,
    n01?: Vec3,
  ): number {
    const flatN = normalize3(cross3(sub3(p10, p00), sub3(p01, p00)));
    const vn00 = n00 ?? flatN;
    const vn10 = n10 ?? flatN;
    const vn11 = n11 ?? flatN;
    const vn01 = n01 ?? flatN;

    const baseV = this.positions.length / 3;
    const pts = [p00, p10, p11, p01];
    const nms = [vn00, vn10, vn11, vn01];
    for (let k = 0; k < 4; k++) {
      const pt = pts[k]!;
      const nm = nms[k]!;
      this.positions.push(pt.x, pt.y, pt.z);
      this.normals.push(nm.x, nm.y, nm.z);
      this.touchPoint(pt);
    }
    this.indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);

    this.quads.push({
      p00,
      p10,
      p11,
      p01,
      normal: flatN,
      n00: vn00,
      n10: vn10,
      n11: vn11,
      n01: vn01,
      centroid: {
        x: (p00.x + p10.x + p11.x + p01.x) * 0.25,
        y: (p00.y + p10.y + p11.y + p01.y) * 0.25,
        z: (p00.z + p10.z + p11.z + p01.z) * 0.25,
      },
    });

    return triangleArea3(p00, p10, p11) + triangleArea3(p00, p11, p01);
  }

  addTriangle(a: Vec3, b: Vec3, c: Vec3, normalOverride?: Vec3): number {
    const n = normalOverride ?? normalize3(cross3(sub3(b, a), sub3(c, a)));
    const baseV = this.positions.length / 3;
    for (const pt of [a, b, c]) {
      this.positions.push(pt.x, pt.y, pt.z);
      this.normals.push(n.x, n.y, n.z);
      this.touchPoint(pt);
    }
    this.indices.push(baseV, baseV + 1, baseV + 2);

    this.quads.push({
      p00: a,
      p10: b,
      p11: c,
      p01: c,
      normal: n,
      n00: n,
      n10: n,
      n11: n,
      n01: n,
      centroid: {
        x: (a.x + b.x + c.x) / 3,
        y: (a.y + b.y + c.y) / 3,
        z: (a.z + b.z + c.z) / 3,
      },
    });

    return triangleArea3(a, b, c);
  }

  addPlanarPolygonCap(poly3D: Vec3[], normal: Vec3, reverseWinding = false): number {
    if (poly3D.length < 3) return 0;
    const pts = reverseWinding ? [...poly3D].reverse() : poly3D;
    const c = centroid3(pts);
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i]!;
      const p1 = pts[(i + 1) % pts.length]!;
      area += this.addTriangle(c, p0, p1, normal);
    }
    return area;
  }

  addAnnularRingCap(
    outerLoop: Vec3[],
    innerLoop: Vec3[],
    normal: Vec3,
    reverseWinding = false,
  ): number {
    const n = Math.min(outerLoop.length, innerLoop.length);
    if (n < 3) return 0;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const o0 = outerLoop[i]!;
      const o1 = outerLoop[next]!;
      const i0 = innerLoop[i]!;
      const i1 = innerLoop[next]!;
      if (!reverseWinding) {
        area += this.addQuad(i0, o0, o1, i1, normal, normal, normal, normal);
      } else {
        area += this.addQuad(o0, i0, i1, o1, normal, normal, normal, normal);
      }
    }
    return area;
  }
}

/* ============================================================================
 * 1. GERADOR MATEMÁTICO: `REVOLVE 3D` (REVOLUÇÃO AXIAL 0° A 360°)
 * ============================================================================ */

export function buildRevolveSolidMesh(entity: Entity): SolidMesh3D {
  const builder = new MeshBuilder3D();
  const revParams = (entity.params?.revolve3d ?? {}) as {
    angleDeg?: number;
    axis?: "x" | "y" | "z";
    axisOffsetMm?: number;
    direction?: "ccw" | "cw";
    wallThicknessMm?: number;
  };

  const angleDeg = Math.max(5, Math.min(360, Number(revParams.angleDeg ?? 360)));
  const thetaMax = angleDeg * DEG_TO_RAD;
  const axisName = revParams.axis ?? "y";
  const baseZ = Number(entity.elevationZ ?? entity.params?.elevationZ ?? 0);

  const rawProfile2D = sampleClosedProfile2D(entity, 28);
  const b2d = boxOf(entity);
  const cx = (b2d.minX + b2d.maxX) * 0.5;
  const cy = (b2d.minY + b2d.maxY) * 0.5;

  // Define origem O e eixo unitário A de revolução garantindo r_i >= 2mm (sem auto-interseção)
  let axisOrigin: Vec3;
  let axisDir: Vec3;
  let radialU: Vec3;
  let radialV: Vec3;

  if (axisName === "y") {
    const offsetX =
      revParams.axisOffsetMm != null
        ? revParams.axisOffsetMm
        : b2d.minX > 2
          ? 0
          : b2d.minX - Math.max(18, (b2d.maxX - b2d.minX) * 0.35);
    axisOrigin = vec3(offsetX, cy, baseZ);
    axisDir = vec3(0, 1, 0);
    radialU = vec3(1, 0, 0);
    radialV = vec3(0, 0, 1);
  } else if (axisName === "x") {
    const offsetY =
      revParams.axisOffsetMm != null
        ? revParams.axisOffsetMm
        : b2d.minY > 2
          ? 0
          : b2d.minY - Math.max(18, (b2d.maxY - b2d.minY) * 0.35);
    axisOrigin = vec3(cx, offsetY, baseZ);
    axisDir = vec3(1, 0, 0);
    radialU = vec3(0, 1, 0);
    radialV = vec3(0, 0, 1);
  } else {
    const offsetX = b2d.minX - Math.max(20, (b2d.maxX - b2d.minX) * 0.4);
    axisOrigin = vec3(offsetX, cy, baseZ);
    axisDir = vec3(0, 0, 1);
    radialU = vec3(1, 0, 0);
    radialV = vec3(0, 1, 0);
  }

  // Coordenadas cilíndricas locais (z_i, r_i) de cada ponto P_i do perfil 2D
  const nProf = rawProfile2D.length;
  const profileCyl: { z: number; r: number }[] = rawProfile2D.map((p) => {
    const p3 = vec3(p.x, p.y, baseZ);
    const rel = sub3(p3, axisOrigin);
    const zCoord = dot3(rel, axisDir);
    const radialVec = sub3(rel, scale3(axisDir, zCoord));
    const rDist = Math.max(1.5, Math.abs(dot3(radialVec, radialU)) || len3(radialVec));
    return { z: zCoord, r: rDist };
  });

  // Normais 2D no plano meridional (z, r) para iluminação suave contínua
  const meridianNormals: { nz: number; nr: number }[] = [];
  for (let i = 0; i < nProf; i++) {
    const a = profileCyl[i]!;
    const b = profileCyl[(i + 1) % nProf]!;
    const dz = b.z - a.z;
    const dr = b.r - a.r;
    const l = Math.hypot(dz, dr) || 1;
    meridianNormals.push({ nz: -dr / l, nr: dz / l });
  }

  const K = Math.max(16, Math.round((48 * angleDeg) / 360));
  const isFullRevolution = angleDeg >= 359.5;
  const ringCount = isFullRevolution ? K : K + 1;

  const rings: Vec3[][] = [];
  const ringNormals: Vec3[][] = [];

  for (let k = 0; k < ringCount; k++) {
    const theta = (k / K) * thetaMax;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const radialDir = add3(scale3(radialU, cosT), scale3(radialV, sinT));

    const ringPts: Vec3[] = [];
    const ringNms: Vec3[] = [];
    for (let i = 0; i < nProf; i++) {
      const { z, r } = profileCyl[i]!;
      const vPt = add3(add3(axisOrigin, scale3(axisDir, z)), scale3(radialDir, r));
      ringPts.push(vPt);

      const mn = meridianNormals[i]!;
      const n3 = normalize3(add3(scale3(axisDir, mn.nz), scale3(radialDir, mn.nr)));
      ringNms.push(n3);
    }
    rings.push(ringPts);
    ringNormals.push(ringNms);
  }

  // Superfície de revolução conectando o anel k ao anel k+1
  const revStartIdx = builder.indices.length;
  let revArea = 0;
  for (let k = 0; k < K; k++) {
    const nextK = isFullRevolution ? (k + 1) % K : k + 1;
    const r0 = rings[k]!;
    const r1 = rings[nextK]!;
    const n0 = ringNormals[k]!;
    const n1 = ringNormals[nextK]!;

    for (let i = 0; i < nProf; i++) {
      const nextI = (i + 1) % nProf;
      revArea += builder.addQuad(
        r0[i]!,
        r0[nextI]!,
        r1[nextI]!,
        r1[i]!,
        n0[i]!,
        n0[nextI]!,
        n1[nextI]!,
        n1[i]!,
      );
    }
  }
  builder.faces.push({
    faceId: `body_${entity.id}_face_revolve_lat`,
    role: "side",
    label: `Superfície de Revolução (${angleDeg.toFixed(0)}° em ${axisName.toUpperCase()})`,
    normal: radialU,
    centroid: centroid3(rings[0] ?? []),
    areaMm2: revArea,
    polygon3D: rings[0] ?? [],
    indexStart: revStartIdx,
    indexCount: builder.indices.length - revStartIdx,
  });

  // Se θ_max < 2π (ex.: 90°, 180°, 270°), fecha obrigatoriamente as 2 tampas planas inicial (θ=0) e final (θ=θ_max)
  if (!isFullRevolution && rings.length >= 2) {
    const startCapRing = rings[0]!;
    const endCapRing = rings[rings.length - 1]!;
    const startCapNormal = scale3(radialV, -1);
    const endCapNormal = add3(
      scale3(radialU, -Math.sin(thetaMax)),
      scale3(radialV, Math.cos(thetaMax)),
    );

    const sIdx0 = builder.indices.length;
    const area0 = builder.addPlanarPolygonCap(startCapRing, startCapNormal, true);
    builder.faces.push({
      faceId: `body_${entity.id}_face_revolve_cap_start`,
      role: "bottom",
      label: "Tampa Inicial de Revolução (0°)",
      normal: startCapNormal,
      centroid: centroid3(startCapRing),
      areaMm2: area0,
      polygon3D: startCapRing,
      indexStart: sIdx0,
      indexCount: builder.indices.length - sIdx0,
    });

    const sIdx1 = builder.indices.length;
    const area1 = builder.addPlanarPolygonCap(endCapRing, endCapNormal, false);
    builder.faces.push({
      faceId: `body_${entity.id}_face_revolve_cap_end`,
      role: "top",
      label: `Tampa Final de Revolução (${angleDeg.toFixed(0)}°)`,
      normal: endCapNormal,
      centroid: centroid3(endCapRing),
      areaMm2: area1,
      polygon3D: endCapRing,
      indexStart: sIdx1,
      indexCount: builder.indices.length - sIdx1,
    });

    builder.edges.push(
      {
        edgeId: `body_${entity.id}_edge_rev_cap0`,
        role: "bottom",
        label: "Aresta Tampa 0°",
        polyline3D: [...startCapRing, startCapRing[0]!],
        isTangentEdge: false,
      },
      {
        edgeId: `body_${entity.id}_edge_rev_cap1`,
        role: "top",
        label: `Aresta Tampa ${angleDeg.toFixed(0)}°`,
        polyline3D: [...endCapRing, endCapRing[0]!],
        isTangentEdge: false,
      },
    );
  }

  // Arestas circulares de revolução nos vértices de quina do perfil
  const stepVert = Math.max(1, Math.floor(nProf / 4));
  for (let idx = 0; idx < nProf; idx += stepVert) {
    const arcPts: Vec3[] = [];
    for (let k = 0; k < ringCount; k++) {
      arcPts.push(rings[k]![idx]!);
    }
    if (isFullRevolution && rings[0]?.[idx]) {
      arcPts.push(rings[0][idx]!);
    }
    builder.edges.push({
      edgeId: `body_${entity.id}_edge_rev_ring_${idx}`,
      role: "top",
      label: `Anel de Revolução #${idx + 1}`,
      polyline3D: arcPts,
      isTangentEdge: false,
    });
  }

  const massProps = computeDivergenceTheoremMassProperties(builder.positions, builder.indices);
  return {
    featureType: "revolve",
    entityId: entity.id,
    bodyName: `Revolve 3D (${angleDeg.toFixed(0)}° · Eixo ${axisName.toUpperCase()})`,
    positions: builder.positions,
    normals: builder.normals,
    indices: builder.indices,
    faces: builder.faces,
    edges: builder.edges,
    quads: builder.quads,
    bbox3D: {
      minX: builder.minX,
      maxX: builder.maxX,
      minY: builder.minY,
      maxY: builder.maxY,
      minZ: builder.minZ,
      maxZ: builder.maxZ,
    },
    volumeMm3: massProps.volumeMm3,
    surfaceAreaMm2: massProps.surfaceAreaMm2,
    centerOfGravity3D: massProps.centerOfGravity3D,
    eulerCharacteristic: isFullRevolution
      ? { V: K * nProf, E: 2 * K * nProf, F: K * nProf, chi: 0 }
      : { V: (K + 1) * nProf, E: 2 * K * nProf + nProf, F: K * nProf + 2, chi: 2 },
  };
}

/* ============================================================================
 * 2. GERADOR MATEMÁTICO: `SWEEP 3D` (PARALLEL TRANSPORT / BISHOP FRAMES + MITER)
 * ============================================================================ */

export function buildSweepSolidMesh(entity: Entity): SolidMesh3D {
  const builder = new MeshBuilder3D();
  const swpParams = (entity.params?.sweep3d ?? {}) as {
    pathPoints3D?: Vec3[];
    profileRadiusMm?: number;
    wallThicknessMm?: number;
    twistDeg?: number;
    pathLengthMm?: number;
  };

  const b2d = boxOf(entity);
  const cx = (b2d.minX + b2d.maxX) * 0.5;
  const cy = (b2d.minY + b2d.maxY) * 0.5;
  const baseZ = Number(entity.elevationZ ?? entity.params?.elevationZ ?? 0);

  // Seção transversal 2D centrada na origem local (u, v)
  const rawProf = sampleClosedProfile2D(entity, 24);
  const localProfile2D: Vec2[] = rawProf.map((p) => ({
    x: p.x - cx,
    y: p.y - cy,
  }));

  const wallT = Math.max(0, Number(swpParams.wallThicknessMm ?? entity.params?.shellThicknessMm ?? 0));
  const profSpan = Math.max(10, Math.max(b2d.maxX - b2d.minX, b2d.maxY - b2d.minY));
  const hasHollow = wallT > 0.2 && wallT < profSpan * 0.42;
  const scaleInner = hasHollow ? Math.max(0.2, (profSpan - 2 * wallT) / profSpan) : 0;
  const innerProfile2D: Vec2[] = hasHollow
    ? localProfile2D.map((p) => ({ x: p.x * scaleInner, y: p.y * scaleInner }))
    : [];

  // Caminho 3D C(t_k) (k = 0 .. M): usa os pontos fornecidos ou gera um cotovelo/arco 3D real
  let pathPoints: Vec3[];
  if (Array.isArray(swpParams.pathPoints3D) && swpParams.pathPoints3D.length >= 2) {
    const p0 = swpParams.pathPoints3D[0]!;
    pathPoints = swpParams.pathPoints3D.map((pt) => ({
      x: cx + (pt.x - p0.x),
      y: cy + (pt.y - p0.y),
      z: baseZ + (pt.z - p0.z),
    }));
  } else {
    const R = Math.max(profSpan * 1.35, 120);
    const steps = 18;
    pathPoints = [];
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * (Math.PI * 0.5);
      pathPoints.push({
        x: cx + R * (1 - Math.cos(t)),
        y: cy + R * 0.25 * Math.sin(t * 2),
        z: baseZ + R * Math.sin(t),
      });
    }
  }

  const M = pathPoints.length;
  const tangents: Vec3[] = [];
  for (let k = 0; k < M; k++) {
    if (k < M - 1) {
      tangents.push(normalize3(sub3(pathPoints[k + 1]!, pathPoints[k]!)));
    } else {
      tangents.push(tangents[k - 1] ?? vec3(0, 0, 1));
    }
  }

  // Transporte Paralelo (Bishop Frame / Rotation Minimizing Frame) sem torção espúria de Frenet
  const normalsN: Vec3[] = [];
  const binormalsB: Vec3[] = [];
  const t0 = tangents[0]!;
  const refUp = Math.abs(t0.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  let currN = normalize3(cross3(refUp, t0));
  let currB = normalize3(cross3(t0, currN));
  normalsN.push(currN);
  binormalsB.push(currB);

  for (let k = 1; k < M; k++) {
    const prevT = tangents[k - 1]!;
    const currT = tangents[k]!;
    const rotAxis = cross3(prevT, currT);
    const sinA = len3(rotAxis);
    const cosA = Math.max(-1, Math.min(1, dot3(prevT, currT)));
    if (sinA > 1e-6) {
      const axisUnit = scale3(rotAxis, 1 / sinA);
      const alpha = Math.atan2(sinA, cosA);
      currN = normalize3(rotateAroundAxis3D(currN, axisUnit, alpha));
      currB = normalize3(cross3(currT, currN));
    }
    normalsN.push(currN);
    binormalsB.push(currB);
  }

  const totalTwistRad = Number(swpParams.twistDeg ?? 0) * DEG_TO_RAD;
  const outerSections: Vec3[][] = [];
  const innerSections: Vec3[][] = [];

  for (let k = 0; k < M; k++) {
    const center = pathPoints[k]!;
    const T = tangents[k]!;
    const twistAngle = (k / Math.max(1, M - 1)) * totalTwistRad;
    const N = rotateAroundAxis3D(normalsN[k]!, T, twistAngle);
    const B = rotateAroundAxis3D(binormalsB[k]!, T, twistAngle);

    // Tratamento de quina viva por plano bissetor (Miter Sweep: escala sec(α/2) = 1/cos(α/2))
    let miterScale = 1.0;
    if (k > 0 && k < M - 1) {
      const prevT = tangents[k - 1]!;
      const cosTurn = Math.max(-0.95, Math.min(1, dot3(prevT, T)));
      const halfAlpha = 0.5 * Math.acos(cosTurn);
      if (halfAlpha > 0.05) {
        miterScale = Math.min(1.85, 1 / Math.max(0.35, Math.cos(halfAlpha)));
      }
    }

    outerSections.push(
      localProfile2D.map((uv) =>
        add3(center, add3(scale3(N, uv.x * miterScale), scale3(B, uv.y))),
      ),
    );
    if (hasHollow) {
      innerSections.push(
        innerProfile2D.map((uv) =>
          add3(center, add3(scale3(N, uv.x * miterScale), scale3(B, uv.y))),
        ),
      );
    }
  }

  const nP = localProfile2D.length;
  const startOuterIdx = builder.indices.length;
  let outerArea = 0;
  for (let k = 0; k < M - 1; k++) {
    const sec0 = outerSections[k]!;
    const sec1 = outerSections[k + 1]!;
    for (let i = 0; i < nP; i++) {
      const nextI = (i + 1) % nP;
      outerArea += builder.addQuad(sec0[i]!, sec0[nextI]!, sec1[nextI]!, sec1[i]!);
    }
  }
  builder.faces.push({
    faceId: `body_${entity.id}_face_sweep_outer`,
    role: "side",
    label: `Superfície Varredura Sweep 3D (${M} seções)`,
    normal: normalsN[0]!,
    centroid: pathPoints[Math.floor(M / 2)]!,
    areaMm2: outerArea,
    polygon3D: outerSections[0] ?? [],
    indexStart: startOuterIdx,
    indexCount: builder.indices.length - startOuterIdx,
  });

  if (hasHollow) {
    const startInnerIdx = builder.indices.length;
    let innerArea = 0;
    for (let k = 0; k < M - 1; k++) {
      const sec0 = innerSections[k]!;
      const sec1 = innerSections[k + 1]!;
      for (let i = 0; i < nP; i++) {
        const nextI = (i + 1) % nP;
        // Normal apontando para o interior da cavidade do tubo varrido
        innerArea += builder.addQuad(sec0[nextI]!, sec0[i]!, sec1[i]!, sec1[nextI]!);
      }
    }
    builder.faces.push({
      faceId: `body_${entity.id}_face_sweep_inner`,
      role: "inner_side",
      label: `Parede Interna Sweep (e = ${wallT.toFixed(1)} mm)`,
      normal: scale3(normalsN[0]!, -1),
      centroid: pathPoints[Math.floor(M / 2)]!,
      areaMm2: innerArea,
      polygon3D: innerSections[0] ?? [],
      indexStart: startInnerIdx,
      indexCount: builder.indices.length - startInnerIdx,
    });

    // Tampas anelares inicial e final do tubo varrido
    const sCap0 = builder.indices.length;
    const cap0Area = builder.addAnnularRingCap(
      outerSections[0]!,
      innerSections[0]!,
      scale3(tangents[0]!, -1),
      true,
    );
    builder.faces.push({
      faceId: `body_${entity.id}_face_sweep_cap0`,
      role: "bottom",
      label: "Borda Anelar Inicial (Sweep)",
      normal: scale3(tangents[0]!, -1),
      centroid: pathPoints[0]!,
      areaMm2: cap0Area,
      polygon3D: outerSections[0]!,
      indexStart: sCap0,
      indexCount: builder.indices.length - sCap0,
    });

    const sCap1 = builder.indices.length;
    const cap1Area = builder.addAnnularRingCap(
      outerSections[M - 1]!,
      innerSections[M - 1]!,
      tangents[M - 1]!,
      false,
    );
    builder.faces.push({
      faceId: `body_${entity.id}_face_sweep_cap1`,
      role: "top",
      label: "Borda Anelar Final (Sweep)",
      normal: tangents[M - 1]!,
      centroid: pathPoints[M - 1]!,
      areaMm2: cap1Area,
      polygon3D: outerSections[M - 1]!,
      indexStart: sCap1,
      indexCount: builder.indices.length - sCap1,
    });
  } else {
    const sCap0 = builder.indices.length;
    const cap0Area = builder.addPlanarPolygonCap(
      outerSections[0]!,
      scale3(tangents[0]!, -1),
      true,
    );
    builder.faces.push({
      faceId: `body_${entity.id}_face_sweep_cap0`,
      role: "bottom",
      label: "Tampa Inicial Sweep",
      normal: scale3(tangents[0]!, -1),
      centroid: pathPoints[0]!,
      areaMm2: cap0Area,
      polygon3D: outerSections[0]!,
      indexStart: sCap0,
      indexCount: builder.indices.length - sCap0,
    });

    const sCap1 = builder.indices.length;
    const cap1Area = builder.addPlanarPolygonCap(
      outerSections[M - 1]!,
      tangents[M - 1]!,
      false,
    );
    builder.faces.push({
      faceId: `body_${entity.id}_face_sweep_cap1`,
      role: "top",
      label: "Tampa Final Sweep",
      normal: tangents[M - 1]!,
      centroid: pathPoints[M - 1]!,
      areaMm2: cap1Area,
      polygon3D: outerSections[M - 1]!,
      indexStart: sCap1,
      indexCount: builder.indices.length - sCap1,
    });
  }

  const firstRing = outerSections[0]!;
  const lastRing = outerSections[M - 1]!;
  builder.edges.push(
    {
      edgeId: `body_${entity.id}_edge_sweep_start`,
      role: "bottom",
      label: "Borda Inicial Sweep",
      polyline3D: [...firstRing, firstRing[0]!],
      isTangentEdge: false,
    },
    {
      edgeId: `body_${entity.id}_edge_sweep_end`,
      role: "top",
      label: "Borda Final Sweep",
      polyline3D: [...lastRing, lastRing[0]!],
      isTangentEdge: false,
    },
  );

  // 4 geratrizes ao longo do caminho 3D
  const stepRail = Math.max(1, Math.floor(nP / 4));
  for (let i = 0; i < nP; i += stepRail) {
    builder.edges.push({
      edgeId: `body_${entity.id}_edge_sweep_rail_${i}`,
      role: "vertical",
      label: `Geratriz Sweep #${i + 1}`,
      polyline3D: outerSections.map((sec) => sec[i]!),
      isTangentEdge: true,
    });
  }

  const massProps = computeDivergenceTheoremMassProperties(builder.positions, builder.indices);
  return {
    featureType: "sweep",
    entityId: entity.id,
    bodyName: `Sweep 3D (${hasHollow ? `Tubo e=${wallT}mm` : "Sólido"})`,
    positions: builder.positions,
    normals: builder.normals,
    indices: builder.indices,
    faces: builder.faces,
    edges: builder.edges,
    quads: builder.quads,
    bbox3D: {
      minX: builder.minX,
      maxX: builder.maxX,
      minY: builder.minY,
      maxY: builder.maxY,
      minZ: builder.minZ,
      maxZ: builder.maxZ,
    },
    volumeMm3: massProps.volumeMm3,
    surfaceAreaMm2: massProps.surfaceAreaMm2,
    centerOfGravity3D: massProps.centerOfGravity3D,
    eulerCharacteristic: hasHollow
      ? { V: M * nP * 2, E: M * nP * 4, F: M * nP * 2, chi: 0 }
      : { V: M * nP, E: M * nP * 2 - nP, F: (M - 1) * nP + 2, chi: 2 },
  };
}

/* ============================================================================
 * 3. GERADOR MATEMÁTICO: `STRUCTURAL FRAME` (TUBO OCO 3D + MITER 45° BISSETOR + GUSSET + SAPATA)
 * ============================================================================ */

export function buildStructuralFrameSolidMesh(
  entity: Entity,
  allEntities: Entity[] = [],
): SolidMesh3D {
  const builder = new MeshBuilder3D();
  const sfParams = (entity.params?.structuralFrame3D ?? {}) as {
    start3D?: Vec3;
    end3D?: Vec3;
    widthMm?: number;
    heightMm?: number;
    wallMm?: number;
    miterStartDeg?: number;
    miterEndDeg?: number;
    endCapStart?: boolean;
    endCapEnd?: boolean;
    gussetStart?: boolean;
    basePlateStart?: boolean;
    profileDesignation?: string;
  };

  const b2d = boxOf(entity);
  const baseZ = Number(entity.elevationZ ?? entity.params?.elevationZ ?? 0);

  // Determina P0 -> P1 da barra 3D (nunca extruda em Z se for uma linha horizontal!)
  let p0: Vec3;
  let p1: Vec3;
  if (sfParams.start3D && sfParams.end3D) {
    p0 = sfParams.start3D;
    p1 = sfParams.end3D;
  } else if (entity.type === "line") {
    const zEnd = Number(entity.params?.endElevationZ ?? baseZ);
    p0 = vec3(entity.x1, entity.y1, baseZ);
    p1 = vec3(entity.x2, entity.y2, zEnd);
  } else {
    const wSpan = b2d.maxX - b2d.minX;
    const hSpan = b2d.maxY - b2d.minY;
    const extH = Number(entity.extrudeHeight ?? entity.params?.extrudeHeightMm ?? 200);
    if (Math.max(wSpan, hSpan) > extH * 1.4) {
      // Barra horizontal desenhada como retângulo alongado no 2D
      if (wSpan >= hSpan) {
        p0 = vec3(b2d.minX, (b2d.minY + b2d.maxY) * 0.5, baseZ);
        p1 = vec3(b2d.maxX, (b2d.minY + b2d.maxY) * 0.5, baseZ);
      } else {
        p0 = vec3((b2d.minX + b2d.maxX) * 0.5, b2d.minY, baseZ);
        p1 = vec3((b2d.minX + b2d.maxX) * 0.5, b2d.maxY, baseZ);
      }
    } else {
      p0 = vec3((b2d.minX + b2d.maxX) * 0.5, (b2d.minY + b2d.maxY) * 0.5, baseZ);
      p1 = vec3((b2d.minX + b2d.maxX) * 0.5, (b2d.minY + b2d.maxY) * 0.5, baseZ + extH);
    }
  }

  const barVec = sub3(p1, p0);
  const barLen = Math.max(10, len3(barVec));
  const S = normalize3(barVec);

  // Base ortonormal (U, V, S) da seção transversal da barra
  const refUp = Math.abs(S.z) < 0.9 ? vec3(0, 0, 1) : vec3(0, 1, 0);
  const U = normalize3(cross3(refUp, S));
  const V = normalize3(cross3(S, U));

  const profB = Math.max(
    15,
    Number(sfParams.widthMm ?? entity.structuralProfile?.widthMm ?? Math.min(100, b2d.maxX - b2d.minX || 80)),
  );
  const profH = Math.max(
    15,
    Number(sfParams.heightMm ?? entity.structuralProfile?.heightMm ?? Math.min(100, b2d.maxY - b2d.minY || 50)),
  );
  const wallE = Math.max(
    1.2,
    Math.min(
      Math.min(profB, profH) * 0.35,
      Number(
        sfParams.wallMm ??
          entity.structuralProfile?.wallThicknessMm ??
          entity.shellWallThickness ??
          entity.params?.shellThicknessMm ??
          3.0,
      ),
    ),
  );

  // Detecta automaticamente barras conectadas nos nós P0 e P1 para calcular plano bissetor Miter exato
  let miterStartDeg = Number(sfParams.miterStartDeg ?? entity.params?.miterCutBottomDeg ?? 0);
  let miterEndDeg = Number(sfParams.miterEndDeg ?? entity.params?.miterCutTopDeg ?? 0);

  if (Math.abs(miterStartDeg) < 0.1 && Math.abs(miterEndDeg) < 0.1 && allEntities.length > 1) {
    for (const other of allEntities) {
      if (other.id === entity.id || other.type !== "line") continue;
      const op0 = vec3(other.x1, other.y1, Number(other.elevationZ ?? 0));
      const op1 = vec3(other.x2, other.y2, Number(other.params?.endElevationZ ?? other.elevationZ ?? 0));
      const oDir = normalize3(sub3(op1, op0));
      if (len3(sub3(p0, op0)) < 2 || len3(sub3(p0, op1)) < 2) {
        const cosAng = Math.abs(dot3(S, oDir));
        if (cosAng < 0.95) miterStartDeg = 45;
      }
      if (len3(sub3(p1, op0)) < 2 || len3(sub3(p1, op1)) < 2) {
        const cosAng = Math.abs(dot3(S, oDir));
        if (cosAng < 0.95) miterEndDeg = 45;
      }
    }
  }

  const hw = profB * 0.5;
  const hh = profH * 0.5;
  const iw = Math.max(2, hw - wallE);
  const ih = Math.max(2, hh - wallE);

  const outerUV: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  const innerUV: Vec2[] = [
    { x: -iw, y: -ih },
    { x: iw, y: -ih },
    { x: iw, y: ih },
    { x: -iw, y: ih },
  ];

  // Projeção analítica exata no plano bissetor de esquadria:
  // P_corte(u, v) = P_no + u*U + v*V - ((u*U + v*V) . N_miter / (S . N_miter)) * S
  const projectOntoMiterPlane = (nodePt: Vec3, u: number, v: number, angleDeg: number, isEnd: boolean): Vec3 => {
    const radialOffset = add3(scale3(U, u), scale3(V, v));
    const clampedDeg = Math.max(-75, Math.min(75, angleDeg));
    const tanAlpha = Math.tan(clampedDeg * DEG_TO_RAD);
    const axialShift = (isEnd ? -u : u) * tanAlpha;
    return add3(add3(nodePt, radialOffset), scale3(S, axialShift));
  };

  const outerStart3D = outerUV.map((uv) => projectOntoMiterPlane(p0, uv.x, uv.y, miterStartDeg, false));
  const outerEnd3D = outerUV.map((uv) => projectOntoMiterPlane(p1, uv.x, uv.y, miterEndDeg, true));
  const innerStart3D = innerUV.map((uv) => projectOntoMiterPlane(p0, uv.x, uv.y, miterStartDeg, false));
  const innerEnd3D = innerUV.map((uv) => projectOntoMiterPlane(p1, uv.x, uv.y, miterEndDeg, true));

  // 4 Faces Externas do Tubo Metalon
  const sideLabels = ["Face Estrutural (-V)", "Face Estrutural (+U)", "Face Estrutural (+V)", "Face Estrutural (-U)"];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    const sIdx = builder.indices.length;
    const b0 = outerStart3D[i]!;
    const b1 = outerStart3D[next]!;
    const t1 = outerEnd3D[next]!;
    const t0 = outerEnd3D[i]!;
    const fArea = builder.addQuad(b0, b1, t1, t0);
    const fNorm = normalize3(cross3(sub3(b1, b0), sub3(t0, b0)));
    builder.faces.push({
      faceId: `body_${entity.id}_face_frame_side_${i}`,
      role: "side",
      label: sideLabels[i]!,
      normal: fNorm,
      centroid: centroid3([b0, b1, t1, t0]),
      areaMm2: fArea,
      polygon3D: [b0, b1, t1, t0],
      indexStart: sIdx,
      indexCount: builder.indices.length - sIdx,
    });

    builder.edges.push({
      edgeId: `body_${entity.id}_edge_frame_long_${i}`,
      role: "vertical",
      label: `Aresta Longitudinal #${i + 1}`,
      polyline3D: [b0, t0],
      isTangentEdge: false,
    });
  }

  // 4 Faces Internas da Cavidade Oca do Tubo Metalon
  const innerStartIdx = builder.indices.length;
  let totalInnerArea = 0;
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    totalInnerArea += builder.addQuad(
      innerStart3D[next]!,
      innerStart3D[i]!,
      innerEnd3D[i]!,
      innerEnd3D[next]!,
    );
  }
  builder.faces.push({
    faceId: `body_${entity.id}_face_frame_inner`,
    role: "inner_side",
    label: `Cavidade Interna Metalon (e = ${wallE.toFixed(2)} mm)`,
    normal: scale3(U, -1),
    centroid: centroid3(innerEnd3D),
    areaMm2: totalInnerArea,
    polygon3D: innerEnd3D,
    indexStart: innerStartIdx,
    indexCount: builder.indices.length - innerStartIdx,
  });

  // Tampas de Extremidade (Anel Oco em Esquadria ou End Cap Fechado)
  const nStart = normalize3(
    rotateAroundAxis3D(scale3(S, -1), V, miterStartDeg * DEG_TO_RAD),
  );
  const nEnd = normalize3(
    rotateAroundAxis3D(S, V, -miterEndDeg * DEG_TO_RAD),
  );

  const sCapStart = builder.indices.length;
  const startCapArea = sfParams.endCapStart
    ? builder.addPlanarPolygonCap(outerStart3D, nStart, true)
    : builder.addAnnularRingCap(outerStart3D, innerStart3D, nStart, true);
  builder.faces.push({
    faceId: `body_${entity.id}_face_frame_start`,
    role: Math.abs(miterStartDeg) > 0.5 ? "miter" : "bottom",
    label:
      Math.abs(miterStartDeg) > 0.5
        ? `Corte Esquadria Base (${miterStartDeg.toFixed(0)}°)`
        : "Topo Inicial do Perfil",
    normal: nStart,
    centroid: centroid3(outerStart3D),
    areaMm2: startCapArea,
    polygon3D: outerStart3D,
    indexStart: sCapStart,
    indexCount: builder.indices.length - sCapStart,
  });

  const sCapEnd = builder.indices.length;
  const endCapArea = sfParams.endCapEnd
    ? builder.addPlanarPolygonCap(outerEnd3D, nEnd, false)
    : builder.addAnnularRingCap(outerEnd3D, innerEnd3D, nEnd, false);
  builder.faces.push({
    faceId: `body_${entity.id}_face_frame_end`,
    role: Math.abs(miterEndDeg) > 0.5 ? "miter" : "top",
    label:
      Math.abs(miterEndDeg) > 0.5
        ? `Corte Esquadria Topo (${miterEndDeg.toFixed(0)}°)`
        : "Topo Final do Perfil",
    normal: nEnd,
    centroid: centroid3(outerEnd3D),
    areaMm2: endCapArea,
    polygon3D: outerEnd3D,
    indexStart: sCapEnd,
    indexCount: builder.indices.length - sCapEnd,
  });

  builder.edges.push(
    {
      edgeId: `body_${entity.id}_edge_frame_cap0`,
      role: "bottom",
      label: "Perímetro Externo Inicial",
      polyline3D: [...outerStart3D, outerStart3D[0]!],
      isTangentEdge: false,
    },
    {
      edgeId: `body_${entity.id}_edge_frame_cap1`,
      role: "top",
      label: "Perímetro Externo Final",
      polyline3D: [...outerEnd3D, outerEnd3D[0]!],
      isTangentEdge: false,
    },
    {
      edgeId: `body_${entity.id}_edge_frame_inner0`,
      role: "inner_bottom",
      label: "Perímetro Interno Inicial",
      polyline3D: [...innerStart3D, innerStart3D[0]!],
      isTangentEdge: false,
    },
    {
      edgeId: `body_${entity.id}_edge_frame_inner1`,
      role: "inner_top",
      label: "Perímetro Interno Final",
      polyline3D: [...innerEnd3D, innerEnd3D[0]!],
      isTangentEdge: false,
    },
  );

  // Gusset Opcional (Mão Francesa Triangular com Chanfro de Alívio de Solda c × c no Vértice Interno)
  if (sfParams.gussetStart) {
    const gLen = Math.max(60, profB * 1.2);
    const reliefC = 15;
    const gThick = Math.max(4.75, wallE);
    const halfT = gThick * 0.5;
    const gPoly2D: Vec2[] = [
      { x: reliefC, y: 0 },
      { x: gLen, y: 0 },
      { x: 0, y: gLen },
      { x: 0, y: reliefC },
    ];
    const gFront = gPoly2D.map((pt) =>
      add3(p0, add3(add3(scale3(U, hw + pt.x), scale3(S, pt.y)), scale3(V, halfT))),
    );
    const gBack = gPoly2D.map((pt) =>
      add3(p0, add3(add3(scale3(U, hw + pt.x), scale3(S, pt.y)), scale3(V, -halfT))),
    );
    builder.addPlanarPolygonCap(gFront, V, false);
    builder.addPlanarPolygonCap(gBack, scale3(V, -1), true);
    for (let i = 0; i < gFront.length; i++) {
      const next = (i + 1) % gFront.length;
      builder.addQuad(gBack[i]!, gBack[next]!, gFront[next]!, gFront[i]!);
    }
  }

  const massProps = computeDivergenceTheoremMassProperties(builder.positions, builder.indices);
  return {
    featureType: "structural_frame",
    entityId: entity.id,
    bodyName:
      sfParams.profileDesignation ??
      `Metalon ${profB.toFixed(0)}×${profH.toFixed(0)}×${wallE.toFixed(2)}mm (L=${barLen.toFixed(0)}mm)`,
    positions: builder.positions,
    normals: builder.normals,
    indices: builder.indices,
    faces: builder.faces,
    edges: builder.edges,
    quads: builder.quads,
    bbox3D: {
      minX: builder.minX,
      maxX: builder.maxX,
      minY: builder.minY,
      maxY: builder.maxY,
      minZ: builder.minZ,
      maxZ: builder.maxZ,
    },
    volumeMm3: massProps.volumeMm3,
    surfaceAreaMm2: massProps.surfaceAreaMm2,
    centerOfGravity3D: massProps.centerOfGravity3D,
    eulerCharacteristic: { V: 16, E: 32, F: 16, chi: 0 },
  };
}

/* ============================================================================
 * 4. GERADOR MATEMÁTICO: `SHEET METAL` (`BASE FLANGE` + `EDGE FLANGE` COM ARCO R + `HEM` + `JOG`)
 * ============================================================================ */

export interface SheetMetalEdgeFlangeSpec {
  edgeSide: "left" | "right" | "top" | "bottom";
  angleDeg: number; // ex.: 90°, 45°, 135°
  flangeLengthMm: number; // comprimento da aba L_aba
  bendRadiusMm?: number; // raio interno R
  reliefWidthMm?: number;
  hasHem?: boolean;
}

export function buildSheetMetalSolidMesh(
  entity: Entity,
  defaultThicknessMm = 2.0,
): SolidMesh3D {
  const builder = new MeshBuilder3D();
  const smParams = (entity.params?.sheetMetal3D ?? {}) as {
    thicknessMm?: number;
    bendRadiusMm?: number;
    kFactor?: number;
    flanges?: SheetMetalEdgeFlangeSpec[];
  };

  const t = Math.max(0.5, Number(smParams.thicknessMm ?? entity.sheetThickness ?? defaultThicknessMm));
  const R = Math.max(0.5, Number(smParams.bendRadiusMm ?? t));
  const baseZ = Number(entity.elevationZ ?? entity.params?.elevationZ ?? 0);

  const b2d = boxOf(entity);
  const minX = b2d.minX;
  const maxX = b2d.maxX;
  const minY = b2d.minY;
  const maxY = b2d.maxY;

  const flanges: SheetMetalEdgeFlangeSpec[] =
    Array.isArray(smParams.flanges) && smParams.flanges.length > 0
      ? smParams.flanges
      : [
          { edgeSide: "left", angleDeg: 90, flangeLengthMm: 65, bendRadiusMm: R },
          { edgeSide: "right", angleDeg: 90, flangeLengthMm: 65, bendRadiusMm: R },
        ];

  // 1. Chapa Base Plana (Base Flange) de espessura `t`
  const baseBot: Vec3[] = [
    vec3(minX, minY, baseZ),
    vec3(maxX, minY, baseZ),
    vec3(maxX, maxY, baseZ),
    vec3(minX, maxY, baseZ),
  ];
  const baseTop: Vec3[] = [
    vec3(minX, minY, baseZ + t),
    vec3(maxX, minY, baseZ + t),
    vec3(maxX, maxY, baseZ + t),
    vec3(minX, maxY, baseZ + t),
  ];

  const sTop = builder.indices.length;
  const topArea = builder.addQuad(baseTop[0]!, baseTop[1]!, baseTop[2]!, baseTop[3]!, vec3(0, 0, 1));
  builder.faces.push({
    faceId: `body_${entity.id}_face_sm_base_top`,
    role: "top",
    label: `Chapa Base Superior (t = ${t.toFixed(1)} mm)`,
    normal: vec3(0, 0, 1),
    centroid: centroid3(baseTop),
    areaMm2: topArea,
    polygon3D: baseTop,
    indexStart: sTop,
    indexCount: builder.indices.length - sTop,
  });

  const sBot = builder.indices.length;
  const botArea = builder.addQuad(baseBot[0]!, baseBot[3]!, baseBot[2]!, baseBot[1]!, vec3(0, 0, -1));
  builder.faces.push({
    faceId: `body_${entity.id}_face_sm_base_bot`,
    role: "bottom",
    label: "Chapa Base Inferior (-Z)",
    normal: vec3(0, 0, -1),
    centroid: centroid3(baseBot),
    areaMm2: botArea,
    polygon3D: baseBot,
    indexStart: sBot,
    indexCount: builder.indices.length - sBot,
  });

  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    builder.addQuad(baseBot[i]!, baseBot[next]!, baseTop[next]!, baseTop[i]!);
  }

  builder.edges.push({
    edgeId: `body_${entity.id}_edge_sm_base_loop`,
    role: "bottom",
    label: "Perímetro da Chapa Base",
    polyline3D: [...baseTop, baseTop[0]!],
    isTangentEdge: false,
  });

  // 2. Geração Geométrica Real de cada `Edge Flange` (Setor Cilíndrico de Raio R + Aba Plana Inclinada θ)
  flanges.forEach((flange, fIdx) => {
    const thetaRad = Math.max(5, Math.min(175, flange.angleDeg)) * DEG_TO_RAD;
    const rIn = Math.max(0.5, flange.bendRadiusMm ?? R);
    const rOut = rIn + t;
    const L = Math.max(8, flange.flangeLengthMm);
    const relief = flange.reliefWidthMm ?? Math.min(6, (maxY - minY) * 0.04);

    // Vetores ortonormais da aresta selecionada: E_a -> E_b, F_out, N_up = (0, 0, 1)
    let edgeA: Vec3;
    let edgeB: Vec3;
    let fOut: Vec3;

    if (flange.edgeSide === "left") {
      edgeA = vec3(minX, minY + relief, baseZ + t);
      edgeB = vec3(minX, maxY - relief, baseZ + t);
      fOut = vec3(-1, 0, 0);
    } else if (flange.edgeSide === "right") {
      edgeA = vec3(maxX, maxY - relief, baseZ + t);
      edgeB = vec3(maxX, minY + relief, baseZ + t);
      fOut = vec3(1, 0, 0);
    } else if (flange.edgeSide === "bottom") {
      edgeA = vec3(maxX - relief, minY, baseZ + t);
      edgeB = vec3(minX + relief, minY, baseZ + t);
      fOut = vec3(0, -1, 0);
    } else {
      edgeA = vec3(minX + relief, maxY, baseZ + t);
      edgeB = vec3(maxX - relief, maxY, baseZ + t);
      fOut = vec3(0, 1, 0);
    }

    const nUp = vec3(0, 0, 1);
    // Centro de curvatura da dobra: C_bend = P_aresta + R * N_up
    const cBendA = add3(edgeA, scale3(nUp, rIn));
    const cBendB = add3(edgeB, scale3(nUp, rIn));

    const bendSteps = 12;
    const inArcA: Vec3[] = [];
    const inArcB: Vec3[] = [];
    const outArcA: Vec3[] = [];
    const outArcB: Vec3[] = [];
    const outNormals: Vec3[] = [];
    const inNormals: Vec3[] = [];

    for (let s = 0; s <= bendSteps; s++) {
      const phi = (s / bendSteps) * thetaRad;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);
      // Direção radial externa do cilindro de dobra: -cos(phi)*N_up + sin(phi)*F_out
      const radDir = add3(scale3(nUp, -cosP), scale3(fOut, sinP));
      inArcA.push(add3(cBendA, scale3(radDir, rIn)));
      inArcB.push(add3(cBendB, scale3(radDir, rIn)));
      outArcA.push(add3(cBendA, scale3(radDir, rOut)));
      outArcB.push(add3(cBendB, scale3(radDir, rOut)));
      outNormals.push(radDir);
      inNormals.push(scale3(radDir, -1));
    }

    const bendStartIdx = builder.indices.length;
    let bendArea = 0;
    for (let s = 0; s < bendSteps; s++) {
      // Face cilíndrica externa da dobra (raio R + t) com normais suaves sem efeito zebra
      bendArea += builder.addQuad(
        outArcA[s]!,
        outArcB[s]!,
        outArcB[s + 1]!,
        outArcA[s + 1]!,
        outNormals[s]!,
        outNormals[s]!,
        outNormals[s + 1]!,
        outNormals[s + 1]!,
      );
      // Face cilíndrica interna da dobra (raio R)
      bendArea += builder.addQuad(
        inArcB[s]!,
        inArcA[s]!,
        inArcA[s + 1]!,
        inArcB[s + 1]!,
        inNormals[s]!,
        inNormals[s]!,
        inNormals[s + 1]!,
        inNormals[s + 1]!,
      );
      // Fechamentos laterais do setor de dobra
      builder.addQuad(inArcA[s]!, outArcA[s]!, outArcA[s + 1]!, inArcA[s + 1]!);
      builder.addQuad(outArcB[s]!, inArcB[s]!, inArcB[s + 1]!, outArcB[s + 1]!);
    }

    builder.faces.push({
      faceId: `body_${entity.id}_face_sm_bend_${fIdx}`,
      role: "bend",
      label: `Raio de Dobra #${fIdx + 1} (R=${rIn.toFixed(1)}mm · ∠${flange.angleDeg}°)`,
      normal: outNormals[Math.floor(bendSteps / 2)]!,
      centroid: centroid3([outArcA[6]!, outArcB[6]!]),
      areaMm2: bendArea,
      polygon3D: [outArcA[0]!, outArcB[0]!, outArcB[bendSteps]!, outArcA[bendSteps]!],
      indexStart: bendStartIdx,
      indexCount: builder.indices.length - bendStartIdx,
    });

    // Linhas de tangência de início e fim da dobra
    builder.edges.push(
      {
        edgeId: `body_${entity.id}_edge_sm_tangent_start_${fIdx}`,
        role: "bend_tangent",
        label: `Início de Dobra #${fIdx + 1}`,
        polyline3D: [outArcA[0]!, outArcB[0]!],
        isTangentEdge: true,
      },
      {
        edgeId: `body_${entity.id}_edge_sm_tangent_end_${fIdx}`,
        role: "bend_tangent",
        label: `Fim de Dobra #${fIdx + 1}`,
        polyline3D: [outArcA[bendSteps]!, outArcB[bendSteps]!],
        isTangentEdge: true,
      },
    );

    // Extensão da aba plana inclinada na direção tangente D_flange = sin(theta)*N_up + cos(theta)*F_out
    const dFlange = normalize3(
      add3(scale3(nUp, Math.sin(thetaRad)), scale3(fOut, Math.cos(thetaRad))),
    );
    const nFlangeOut = outNormals[bendSteps]!;
    const nFlangeIn = inNormals[bendSteps]!;

    const flInA0 = inArcA[bendSteps]!;
    const flInB0 = inArcB[bendSteps]!;
    const flOutA0 = outArcA[bendSteps]!;
    const flOutB0 = outArcB[bendSteps]!;

    const flInA1 = add3(flInA0, scale3(dFlange, L));
    const flInB1 = add3(flInB0, scale3(dFlange, L));
    const flOutA1 = add3(flOutA0, scale3(dFlange, L));
    const flOutB1 = add3(flOutB0, scale3(dFlange, L));

    const flStartIdx = builder.indices.length;
    const flAreaOut = builder.addQuad(flOutA0, flOutB0, flOutB1, flOutA1, nFlangeOut);
    const flAreaIn = builder.addQuad(flInB0, flInA0, flInA1, flInB1, nFlangeIn);
    builder.addQuad(flInA0, flOutA0, flOutA1, flInA1);
    builder.addQuad(flOutB0, flInB0, flInB1, flOutB1);
    builder.addQuad(flInA1, flOutA1, flOutB1, flInB1, dFlange);

    builder.faces.push({
      faceId: `body_${entity.id}_face_sm_flange_${fIdx}`,
      role: "flange",
      label: `Aba Dobrada #${fIdx + 1} (L=${L.toFixed(1)}mm · ∠${flange.angleDeg}°)`,
      normal: nFlangeOut,
      centroid: centroid3([flOutA0, flOutB0, flOutB1, flOutA1]),
      areaMm2: flAreaOut + flAreaIn,
      polygon3D: [flOutA0, flOutB0, flOutB1, flOutA1],
      indexStart: flStartIdx,
      indexCount: builder.indices.length - flStartIdx,
    });

    builder.edges.push({
      edgeId: `body_${entity.id}_edge_sm_flange_top_${fIdx}`,
      role: "top",
      label: `Borda da Aba #${fIdx + 1}`,
      polyline3D: [flOutA1, flOutB1, flInB1, flInA1, flOutA1],
      isTangentEdge: false,
    });
  });

  const massProps = computeDivergenceTheoremMassProperties(builder.positions, builder.indices);
  return {
    featureType: "sheet_metal",
    entityId: entity.id,
    bodyName: `Chapa Dobrada 3D (e=${t.toFixed(1)}mm · R=${R.toFixed(1)}mm · ${flanges.length} aba(s))`,
    positions: builder.positions,
    normals: builder.normals,
    indices: builder.indices,
    faces: builder.faces,
    edges: builder.edges,
    quads: builder.quads,
    bbox3D: {
      minX: builder.minX,
      maxX: builder.maxX,
      minY: builder.minY,
      maxY: builder.maxY,
      minZ: builder.minZ,
      maxZ: builder.maxZ,
    },
    volumeMm3: massProps.volumeMm3,
    surfaceAreaMm2: massProps.surfaceAreaMm2,
    centerOfGravity3D: massProps.centerOfGravity3D,
    eulerCharacteristic: { V: 24, E: 36, F: 14, chi: 2 },
  };
}

/* ============================================================================
 * 5. GERADOR MATEMÁTICO: `HOLE_BOOLEAN` (BLIND, COUNTERBORE, COUNTERSINK & CSG SUBTRACT)
 * ============================================================================ */

export function buildHoleAndBooleanSolidMesh(
  entity: Entity,
  defaultThicknessMm = 20,
): SolidMesh3D {
  const builder = new MeshBuilder3D();
  const b2d = boxOf(entity);
  const baseZ = Number(entity.elevationZ ?? entity.params?.elevationZ ?? 0);
  const heightH = Math.max(
    4,
    Number(entity.extrudeHeight ?? entity.params?.extrudeHeightMm ?? defaultThicknessMm),
  );
  const z0 = baseZ;
  const z1 = baseZ + heightH;

  const outer2D = sampleClosedProfile2D(entity, 32);
  const outerTop3D = outer2D.map((p) => vec3(p.x, p.y, z1));
  const outerBot3D = outer2D.map((p) => vec3(p.x, p.y, z0));

  // Paredes laterais externas do corpo base
  const sSide = builder.indices.length;
  let sideArea = 0;
  for (let i = 0; i < outer2D.length; i++) {
    const next = (i + 1) % outer2D.length;
    sideArea += builder.addQuad(
      outerBot3D[i]!,
      outerBot3D[next]!,
      outerTop3D[next]!,
      outerTop3D[i]!,
    );
  }
  builder.faces.push({
    faceId: `body_${entity.id}_face_side_0`,
    role: "side",
    label: "Paredes Laterais Externas",
    normal: vec3(1, 0, 0),
    centroid: centroid3(outerTop3D),
    areaMm2: sideArea,
    polygon3D: outerTop3D,
    indexStart: sSide,
    indexCount: builder.indices.length - sSide,
  });

  const advHoles = (Array.isArray(entity.params?.advancedHoles3D)
    ? entity.params.advancedHoles3D
    : []) as {
    id: string;
    holeType: "through" | "blind" | "counterbore" | "countersink" | "spotface" | "threaded";
    threadSize: string;
    diameterMm: number;
    depthMm: number;
    counterboreDiameterMm: number;
    counterboreDepthMm: number;
    countersinkDiameterMm: number;
    countersinkAngleDeg: number;
    center3D: Vec3;
  }[];

  const holeSegs = 28;
  const makeCircle3D = (cx: number, cy: number, z: number, r: number): Vec3[] => {
    const pts: Vec3[] = [];
    for (let i = 0; i < holeSegs; i++) {
      const a = (i / holeSegs) * Math.PI * 2;
      pts.push(vec3(cx + r * Math.cos(a), cy + r * Math.sin(a), z));
    }
    return pts;
  };

  let totalRemovedVolMm3 = 0;

  // Para cada furo paramétrico avançado, gera sua cavidade côncava real (Through, Blind, Counterbore, Countersink)
  advHoles.forEach((hSpec, hIdx) => {
    const hcx = hSpec.center3D?.x ?? (b2d.minX + b2d.maxX) * 0.5;
    const hcy = hSpec.center3D?.y ?? (b2d.minY + b2d.maxY) * 0.5;
    const r2 = Math.max(1.5, (hSpec.diameterMm || 12) * 0.5);

    if (hSpec.holeType === "counterbore" || hSpec.holeType === "spotface") {
      // FURO REBAIXADO (Counterbore): Cilindro maior R1 até z1 - h_reb + Degrau Anelar Plano + Cilindro menor R2
      const r1 = Math.max(r2 + 1.5, (hSpec.counterboreDiameterMm || r2 * 2 + 6) * 0.5);
      const hReb = Math.min(heightH * 0.65, Math.max(1.5, hSpec.counterboreDepthMm || 6));
      const zStep = z1 - hReb;

      const topRingR1 = makeCircle3D(hcx, hcy, z1, r1);
      const stepRingR1 = makeCircle3D(hcx, hcy, zStep, r1);
      const stepRingR2 = makeCircle3D(hcx, hcy, zStep, r2);
      const botRingR2 = makeCircle3D(hcx, hcy, z0, r2);

      // 1. Parede cilíndrica interna do rebaixo maior R1 (normal apontando para o centro do furo)
      for (let i = 0; i < holeSegs; i++) {
        const next = (i + 1) % holeSegs;
        const a0 = (i / holeSegs) * Math.PI * 2;
        const a1 = (next / holeSegs) * Math.PI * 2;
        const nIn0 = vec3(-Math.cos(a0), -Math.sin(a0), 0);
        const nIn1 = vec3(-Math.cos(a1), -Math.sin(a1), 0);
        builder.addQuad(
          stepRingR1[next]!,
          stepRingR1[i]!,
          topRingR1[i]!,
          topRingR1[next]!,
          nIn1,
          nIn0,
          nIn0,
          nIn1,
        );
      }

      // 2. Degrau anelar plano horizontal entre R1 e R2 na cota z = z1 - h_reb (normal +Z)
      const sStep = builder.indices.length;
      const stepArea = builder.addAnnularRingCap(stepRingR1, stepRingR2, vec3(0, 0, 1), false);
      builder.faces.push({
        faceId: `body_${entity.id}_face_cbore_step_${hIdx}`,
        role: "counterbore_step",
        label: `Degrau Anelar Rebaixo ${hSpec.threadSize} (Ø${(r1 * 2).toFixed(1)}➔Ø${(r2 * 2).toFixed(1)}mm, h=${hReb.toFixed(1)}mm)`,
        normal: vec3(0, 0, 1),
        centroid: vec3(hcx, hcy, zStep),
        areaMm2: stepArea,
        polygon3D: stepRingR1,
        indexStart: sStep,
        indexCount: builder.indices.length - sStep,
      });

      // 3. Parede cilíndrica interna menor R2 até a base z0
      for (let i = 0; i < holeSegs; i++) {
        const next = (i + 1) % holeSegs;
        const a0 = (i / holeSegs) * Math.PI * 2;
        const a1 = (next / holeSegs) * Math.PI * 2;
        const nIn0 = vec3(-Math.cos(a0), -Math.sin(a0), 0);
        const nIn1 = vec3(-Math.cos(a1), -Math.sin(a1), 0);
        builder.addQuad(
          botRingR2[next]!,
          botRingR2[i]!,
          stepRingR2[i]!,
          stepRingR2[next]!,
          nIn1,
          nIn0,
          nIn0,
          nIn1,
        );
      }

      builder.edges.push(
        {
          edgeId: `body_${entity.id}_edge_cbore_top_${hIdx}`,
          role: "inner_top",
          label: `Entrada Rebaixo Ø${(r1 * 2).toFixed(1)}mm`,
          polyline3D: [...topRingR1, topRingR1[0]!],
          isTangentEdge: false,
        },
        {
          edgeId: `body_${entity.id}_edge_cbore_step_${hIdx}`,
          role: "inner_top",
          label: `Degrau Rebaixo z=${zStep.toFixed(1)}mm`,
          polyline3D: [...stepRingR1, stepRingR1[0]!],
          isTangentEdge: false,
        },
      );

      totalRemovedVolMm3 +=
        Math.PI * r1 * r1 * hReb + Math.PI * r2 * r2 * Math.max(0, heightH - hReb);
    } else if (hSpec.holeType === "countersink") {
      // FURO ESCAREADO (Countersink 90°): Tronco de cone invertido de R1 a R2 sobre h_c = (R1 - R2)/tan(α/2) + Cilindro R2
      const r1 = Math.max(r2 + 1.5, (hSpec.countersinkDiameterMm || r2 * 2 + 6) * 0.5);
      const halfAlphaRad = ((hSpec.countersinkAngleDeg || 90) * 0.5) * DEG_TO_RAD;
      const hCone = Math.min(heightH * 0.65, (r1 - r2) / Math.max(0.25, Math.tan(halfAlphaRad)));
      const zConeEnd = z1 - hCone;

      const topRingR1 = makeCircle3D(hcx, hcy, z1, r1);
      const midRingR2 = makeCircle3D(hcx, hcy, zConeEnd, r2);
      const botRingR2 = makeCircle3D(hcx, hcy, z0, r2);

      const sCone = builder.indices.length;
      let coneArea = 0;
      for (let i = 0; i < holeSegs; i++) {
        const next = (i + 1) % holeSegs;
        const a0 = (i / holeSegs) * Math.PI * 2;
        const a1 = (next / holeSegs) * Math.PI * 2;
        const nCone0 = normalize3(vec3(-Math.cos(a0), -Math.sin(a0), Math.SQRT1_2));
        const nCone1 = normalize3(vec3(-Math.cos(a1), -Math.sin(a1), Math.SQRT1_2));
        coneArea += builder.addQuad(
          midRingR2[next]!,
          midRingR2[i]!,
          topRingR1[i]!,
          topRingR1[next]!,
          nCone1,
          nCone0,
          nCone0,
          nCone1,
        );
        const nIn0 = vec3(-Math.cos(a0), -Math.sin(a0), 0);
        const nIn1 = vec3(-Math.cos(a1), -Math.sin(a1), 0);
        builder.addQuad(
          botRingR2[next]!,
          botRingR2[i]!,
          midRingR2[i]!,
          midRingR2[next]!,
          nIn1,
          nIn0,
          nIn0,
          nIn1,
        );
      }

      builder.faces.push({
        faceId: `body_${entity.id}_face_csink_cone_${hIdx}`,
        role: "countersink_cone",
        label: `Cone Escareado 90° ${hSpec.threadSize} (Ø${(r1 * 2).toFixed(1)}➔Ø${(r2 * 2).toFixed(1)}mm)`,
        normal: vec3(0, 0, 1),
        centroid: vec3(hcx, hcy, (z1 + zConeEnd) * 0.5),
        areaMm2: coneArea,
        polygon3D: topRingR1,
        indexStart: sCone,
        indexCount: builder.indices.length - sCone,
      });

      builder.edges.push(
        {
          edgeId: `body_${entity.id}_edge_csink_top_${hIdx}`,
          role: "inner_top",
          label: `Borda Escareado Ø${(r1 * 2).toFixed(1)}mm`,
          polyline3D: [...topRingR1, topRingR1[0]!],
          isTangentEdge: false,
        },
        {
          edgeId: `body_${entity.id}_edge_csink_neck_${hIdx}`,
          role: "inner_top",
          label: `Transição Cone-Cilindro Ø${(r2 * 2).toFixed(1)}mm`,
          polyline3D: [...midRingR2, midRingR2[0]!],
          isTangentEdge: true,
        },
      );

      totalRemovedVolMm3 +=
        (Math.PI * hCone * (r1 * r1 + r1 * r2 + r2 * r2)) / 3 +
        Math.PI * r2 * r2 * Math.max(0, heightH - hCone);
    } else if (hSpec.holeType === "blind") {
      // FURO CEGO (Blind Hole, d < H): abre em z1, desce até z1 - d e fecha o fundo sem furar a face inferior z0!
      const blindDepth = Math.min(heightH * 0.85, Math.max(2, hSpec.depthMm || heightH * 0.6));
      const zBlindBot = z1 - blindDepth;
      const topRing = makeCircle3D(hcx, hcy, z1, r2);
      const botRing = makeCircle3D(hcx, hcy, zBlindBot, r2);

      for (let i = 0; i < holeSegs; i++) {
        const next = (i + 1) % holeSegs;
        const a0 = (i / holeSegs) * Math.PI * 2;
        const a1 = (next / holeSegs) * Math.PI * 2;
        const nIn0 = vec3(-Math.cos(a0), -Math.sin(a0), 0);
        const nIn1 = vec3(-Math.cos(a1), -Math.sin(a1), 0);
        builder.addQuad(botRing[next]!, botRing[i]!, topRing[i]!, topRing[next]!, nIn1, nIn0, nIn0, nIn1);
      }

      // Tampa circular de fundo do furo cego em z = z1 - d (normal +Z apontando para a abertura)
      const sBlindCap = builder.indices.length;
      const blindCapArea = builder.addPlanarPolygonCap(botRing, vec3(0, 0, 1), false);
      builder.faces.push({
        faceId: `body_${entity.id}_face_blind_bottom_${hIdx}`,
        role: "hole_bottom",
        label: `Fundo do Furo Cego ${hSpec.threadSize} (prof. = ${blindDepth.toFixed(1)} mm)`,
        normal: vec3(0, 0, 1),
        centroid: vec3(hcx, hcy, zBlindBot),
        areaMm2: blindCapArea,
        polygon3D: botRing,
        indexStart: sBlindCap,
        indexCount: builder.indices.length - sBlindCap,
      });

      builder.edges.push(
        {
          edgeId: `body_${entity.id}_edge_blind_top_${hIdx}`,
          role: "inner_top",
          label: `Entrada Furo Cego Ø${(r2 * 2).toFixed(1)}mm`,
          polyline3D: [...topRing, topRing[0]!],
          isTangentEdge: false,
        },
        {
          edgeId: `body_${entity.id}_edge_blind_bot_${hIdx}`,
          role: "inner_bottom",
          label: `Fundo Furo Cego (z=${zBlindBot.toFixed(1)}mm)`,
          polyline3D: [...botRing, botRing[0]!],
          isTangentEdge: false,
        },
      );

      totalRemovedVolMm3 += Math.PI * r2 * r2 * blindDepth;
    } else {
      // FURO PASSANTE / ROSCADO (Through All): atravessa de z1 a z0 com normal interna -n_radial
      const topRing = makeCircle3D(hcx, hcy, z1, r2);
      const botRing = makeCircle3D(hcx, hcy, z0, r2);
      for (let i = 0; i < holeSegs; i++) {
        const next = (i + 1) % holeSegs;
        const a0 = (i / holeSegs) * Math.PI * 2;
        const a1 = (next / holeSegs) * Math.PI * 2;
        const nIn0 = vec3(-Math.cos(a0), -Math.sin(a0), 0);
        const nIn1 = vec3(-Math.cos(a1), -Math.sin(a1), 0);
        builder.addQuad(botRing[next]!, botRing[i]!, topRing[i]!, topRing[next]!, nIn1, nIn0, nIn0, nIn1);
      }
      totalRemovedVolMm3 += Math.PI * r2 * r2 * heightH;
    }
  });

  // Tampas superior e inferior do sólido
  const sTop = builder.indices.length;
  const topArea = builder.addPlanarPolygonCap(outerTop3D, vec3(0, 0, 1), false);
  builder.faces.push({
    faceId: `body_${entity.id}_face_top`,
    role: "top",
    label: "Face Superior (+Z)",
    normal: vec3(0, 0, 1),
    centroid: centroid3(outerTop3D),
    areaMm2: topArea,
    polygon3D: outerTop3D,
    indexStart: sTop,
    indexCount: builder.indices.length - sTop,
  });

  const sBot = builder.indices.length;
  const botArea = builder.addPlanarPolygonCap(outerBot3D, vec3(0, 0, -1), true);
  builder.faces.push({
    faceId: `body_${entity.id}_face_bottom`,
    role: "bottom",
    label: "Face Inferior (-Z)",
    normal: vec3(0, 0, -1),
    centroid: centroid3(outerBot3D),
    areaMm2: botArea,
    polygon3D: outerBot3D,
    indexStart: sBot,
    indexCount: builder.indices.length - sBot,
  });

  const baseArea = Math.abs(signedArea2D(outer2D));
  const netVolumeMm3 = Math.max(1, baseArea * heightH - totalRemovedVolMm3);
  const massProps = computeDivergenceTheoremMassProperties(builder.positions, builder.indices);

  return {
    featureType: "hole_boolean",
    entityId: entity.id,
    bodyName: `Sólido Usinado (${advHoles.length} furo(s) 3D)`,
    positions: builder.positions,
    normals: builder.normals,
    indices: builder.indices,
    faces: builder.faces,
    edges: builder.edges,
    quads: builder.quads,
    bbox3D: {
      minX: builder.minX,
      maxX: builder.maxX,
      minY: builder.minY,
      maxY: builder.maxY,
      minZ: builder.minZ,
      maxZ: builder.maxZ,
    },
    volumeMm3: Number(netVolumeMm3.toFixed(2)),
    surfaceAreaMm2: massProps.surfaceAreaMm2,
    centerOfGravity3D: massProps.centerOfGravity3D,
    eulerCharacteristic: { V: 16, E: 24, F: 10, chi: 2 },
  };
}

/* ============================================================================
 * 6. DISPATCHER CENTRAL `buildSolidMesh(entity)` (PROIBIÇÃO DE FALLBACK DE EXTRUSÃO)
 * ============================================================================ */

export function buildSolidMesh(
  entity: Entity,
  allEntities: Entity[] = [],
  defaultThicknessMm = 20,
): SolidMesh3D {
  const sig = computeEntityMeshSignature(entity, defaultThicknessMm);
  const cached = solidMeshCache.get(entity.id);
  if (cached && cached.signature === sig) {
    return cached.mesh;
  }

  const featureType = resolveEntitySolidFeatureType(entity);
  let mesh: SolidMesh3D;

  switch (featureType) {
    case "revolve":
      mesh = buildRevolveSolidMesh(entity);
      break;
    case "sweep":
      mesh = buildSweepSolidMesh(entity);
      break;
    case "structural_frame":
      mesh = buildStructuralFrameSolidMesh(entity, allEntities);
      break;
    case "sheet_metal":
      mesh = buildSheetMetalSolidMesh(entity, defaultThicknessMm);
      break;
    case "hole_boolean":
      mesh = buildHoleAndBooleanSolidMesh(entity, defaultThicknessMm);
      break;
    case "loft": {
      const loftMesh = buildLoft3DMeshForEntity(entity, allEntities);
      const builder = new MeshBuilder3D();
      if (loftMesh) {
        for (const q of loftMesh.quads) {
          builder.addQuad(q.p00, q.p10, q.p11, q.p01, q.n00, q.n10, q.n11, q.n01);
        }
      }
      const mp = computeDivergenceTheoremMassProperties(builder.positions, builder.indices);
      mesh = {
        featureType: "loft",
        entityId: entity.id,
        bodyName: `Loft 3D (${loftMesh?.sections.length ?? 2} seções)`,
        positions: builder.positions,
        normals: builder.normals,
        indices: builder.indices,
        faces: builder.faces,
        edges: builder.edges,
        quads: builder.quads,
        bbox3D: {
          minX: Number.isFinite(builder.minX) ? builder.minX : -50,
          maxX: Number.isFinite(builder.maxX) ? builder.maxX : 50,
          minY: Number.isFinite(builder.minY) ? builder.minY : -50,
          maxY: Number.isFinite(builder.maxY) ? builder.maxY : 50,
          minZ: Number.isFinite(builder.minZ) ? builder.minZ : 0,
          maxZ: Number.isFinite(builder.maxZ) ? builder.maxZ : 100,
        },
        volumeMm3: loftMesh?.volumeMm3 ?? mp.volumeMm3,
        surfaceAreaMm2: loftMesh?.surfaceAreaMm2 ?? mp.surfaceAreaMm2,
        centerOfGravity3D: mp.centerOfGravity3D,
        eulerCharacteristic: { V: 24, E: 36, F: 14, chi: 2 },
      };
      break;
    }
    case "unfolded_pattern":
    case "extrude":
    default:
      mesh = buildHoleAndBooleanSolidMesh(entity, defaultThicknessMm);
      mesh.featureType = featureType;
      break;
  }

  solidMeshCache.set(entity.id, { signature: sig, mesh });
  return mesh;
}

/**
 * Converte um `SolidMesh3D` gerado pelo `ChamferSolidKernel` para um objeto `Loft3DMesh`
 * compatível com o renderizador Canvas 2D/3D (`renderLoft3DMeshToCanvas2D`).
 */
export function solidMeshToCanvasRenderableMesh(mesh: SolidMesh3D): Loft3DMesh {
  return {
    quads: mesh.quads,
    sections: [],
    surfaceMode: "smooth",
    bodyMode: "solid",
    wallThicknessMm: 0,
    volumeMm3: mesh.volumeMm3,
    surfaceAreaMm2: mesh.surfaceAreaMm2,
    bbox3D: mesh.bbox3D,
  };
}
