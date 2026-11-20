/**
 * CALDRA CHAMFER — MOTOR MATEMÁTICO DE CHAPA METÁLICA & CINEMÁTICA DA BEND TREE
 *
 * Funções puras, determinísticas e testáveis (sem dependência do DOM):
 *  - Fórmulas exatas ABNT/ISO de desenvolvimento de dobra (BA, OSSB, BD, L_flat)
 *  - Proteção defensiva contra entradas hostis (0°, negativos, NaN, Infinity, T <= 0, K fora de (0,1))
 *  - Cinemática hierárquica 3D (DFS) sobre a `BendTree`:
 *      M_child = M_parent * T(pivot) * R(axisDir, signedThetaRad) * T(-pivot)
 *  - Geração de Zona Cilíndrica 3D suave (1 segmento a cada <= 7.5°, normais suaves na curva
 *    e normais duras nas faces planas/bordas) + faixa coplanar de largura exata `BA` quando UNFOLDED
 *  - Mapeamento exato de recortes/furos que cruzam zonas de dobra (`Unfold -> Cortar/Furar -> Refold`):
 *      u ∈ [0, BA]  =>  phi = (u / BA) * signedThetaRad
 */

import type { CadTessellatedShape, CadFaceGroup, CadPolylineEdge } from "@/lib/cad/core/CadMesh";
import type { BendDirection, BendNode, FlangeNode, SheetMetalBody } from "./bendTree";

export type Vec2Tuple = [number, number];
export type Vec3Tuple = [number, number, number];
export type Mat4 = number[]; // 16 elementos, column-major (compatível com Three.js)

export interface BendMathValidationResult {
  ok: boolean;
  error?: string;
  angleDeg: number;
  thicknessMm: number;
  innerRadiusMm: number;
  kFactor: number;
}

export interface BendDevelopmentResult {
  angleDeg: number;
  thetaRad: number;
  thicknessMm: number;
  innerRadiusMm: number;
  kFactor: number;
  /** BA = thetaRad * (R + K * T) */
  bendAllowanceMm: number;
  /** OSSB = tan(thetaRad / 2) * (R + T), com limite seguro para 180° */
  outsideSetbackMm: number;
  /** BD = 2 * OSSB - BA */
  bendDeductionMm: number;
}

/**
 * Validação rigorosa contra entradas hostis ("Nunca Travar"):
 *  - 0 < targetAngleDeg <= 180
 *  - T > 0
 *  - R >= 0
 *  - 0 < K < 1
 */
export function validateBendInputs(params: {
  angleDeg: number;
  thicknessMm: number;
  innerRadiusMm: number;
  kFactor: number;
}): BendMathValidationResult {
  const { angleDeg, thicknessMm, innerRadiusMm, kFactor } = params;

  if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg > 180) {
    return {
      ok: false,
      error: `Ângulo de dobra inválido (${angleDeg}°): informe um valor entre 0.1° e 180°.`,
      angleDeg: 0,
      thicknessMm: 0,
      innerRadiusMm: 0,
      kFactor: 0,
    };
  }
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0 || thicknessMm > 1000) {
    return {
      ok: false,
      error: `Espessura de chapa inválida (${thicknessMm} mm): deve ser maior que zero.`,
      angleDeg: 0,
      thicknessMm: 0,
      innerRadiusMm: 0,
      kFactor: 0,
    };
  }
  if (!Number.isFinite(innerRadiusMm) || innerRadiusMm < 0 || innerRadiusMm > 5000) {
    return {
      ok: false,
      error: `Raio interno inválido (${innerRadiusMm} mm): deve ser >= 0.`,
      angleDeg: 0,
      thicknessMm: 0,
      innerRadiusMm: 0,
      kFactor: 0,
    };
  }
  if (!Number.isFinite(kFactor) || kFactor <= 0 || kFactor >= 1) {
    return {
      ok: false,
      error: `Fator K inválido (${kFactor}): deve estar estritamente entre 0 e 1.`,
      angleDeg: 0,
      thicknessMm: 0,
      innerRadiusMm: 0,
      kFactor: 0,
    };
  }

  return {
    ok: true,
    angleDeg,
    thicknessMm,
    innerRadiusMm,
    kFactor,
  };
}

/**
 * Calcula BA, OSSB e BD exatos com tratamento seguro do caso limite de bainha 180° (sem Infinity).
 */
export function computeBendDevelopment(
  targetAngleDeg: number,
  thicknessMm: number,
  innerRadiusMm: number,
  kFactor: number,
): BendDevelopmentResult {
  const check = validateBendInputs({
    angleDeg: targetAngleDeg,
    thicknessMm,
    innerRadiusMm,
    kFactor,
  });
  if (!check.ok) {
    throw new Error(check.error);
  }

  const thetaRad = (Math.abs(check.angleDeg) * Math.PI) / 180;
  const T = check.thicknessMm;
  const R = check.innerRadiusMm;
  const K = check.kFactor;

  const bendAllowanceMm = thetaRad * (R + K * T);
  // Para bainha 180° (theta = pi), tan(pi/2) -> Infinity; usamos limite geométrico R + T
  const outsideSetbackMm =
    check.angleDeg >= 179.999 ? R + T : Math.tan(thetaRad / 2) * (R + T);
  const bendDeductionMm = 2 * outsideSetbackMm - bendAllowanceMm;

  return {
    angleDeg: check.angleDeg,
    thetaRad,
    thicknessMm: T,
    innerRadiusMm: R,
    kFactor: K,
    bendAllowanceMm,
    outsideSetbackMm,
    bendDeductionMm,
  };
}

// ─── ÁLGEBRA LINEAR 3D PURA (COLUMN-MAJOR MAT4) ─────────────────────────────

export function vec3Sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Scale(v: Vec3Tuple, s: number): Vec3Tuple {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vec3Dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3Len(v: Vec3Tuple): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function vec3Normalize(v: Vec3Tuple): Vec3Tuple {
  const len = vec3Len(v);
  if (len < 1e-12) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat4Translation(tx: number, ty: number, tz: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

export function mat4RotationAxis(axis: Vec3Tuple, angleRad: number): Mat4 {
  const [x, y, z] = vec3Normalize(axis);
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;

  return [
    t * x * x + c,
    t * x * y + s * z,
    t * x * z - s * y,
    0,
    t * x * y - s * z,
    t * y * y + c,
    t * y * z + s * x,
    0,
    t * x * z + s * y,
    t * y * z - s * x,
    t * z * z + c,
    0,
    0,
    0,
    0,
    1,
  ];
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row]! * b[col * 4 + 0]! +
        a[1 * 4 + row]! * b[col * 4 + 1]! +
        a[2 * 4 + row]! * b[col * 4 + 2]! +
        a[3 * 4 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

export function mat4TransformPoint(m: Mat4, p: Vec3Tuple): Vec3Tuple {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

export function mat4TransformDir(m: Mat4, d: Vec3Tuple): Vec3Tuple {
  return vec3Normalize([
    m[0]! * d[0] + m[4]! * d[1] + m[8]! * d[2],
    m[1]! * d[0] + m[5]! * d[1] + m[9]! * d[2],
    m[2]! * d[0] + m[6]! * d[1] + m[10]! * d[2],
  ]);
}

/**
 * M_child = M_parent * T(pivot) * R(axisDir, signedThetaRad) * T(-pivot)
 */
export function computeChildBendMatrix(
  parentMatrix: Mat4,
  pivotLocal: Vec3Tuple,
  axisDirLocal: Vec3Tuple,
  signedThetaRad: number,
): Mat4 {
  const tPos = mat4Translation(pivotLocal[0], pivotLocal[1], pivotLocal[2]);
  const rot = mat4RotationAxis(axisDirLocal, signedThetaRad);
  const tNeg = mat4Translation(-pivotLocal[0], -pivotLocal[1], -pivotLocal[2]);
  return mat4Multiply(parentMatrix, mat4Multiply(tPos, mat4Multiply(rot, tNeg)));
}

/**
 * Mapeia um ponto (u, v) de um recorte que cruza a zona de dobra (u ∈ [0, BA])
 * para o cilindro de dobra 3D com ângulo local phi = (u / BA) * signedThetaRad.
 */
export function mapCrossBendPointTo3D(params: {
  uMm: number;
  vMm: number;
  bendAllowanceMm: number;
  innerRadiusMm: number;
  thicknessMm: number;
  kFactor: number;
  signedThetaRad: number;
  axisOrigin: Vec3Tuple;
  axisDir: Vec3Tuple;
  direction: BendDirection;
  surface?: "neutral" | "inner" | "outer";
}): { point3D: Vec3Tuple; localAngleRad: number; normal3D: Vec3Tuple } {
  const ba = Math.max(1e-6, params.bendAllowanceMm);
  const frac = Math.max(0, Math.min(1, params.uMm / ba));
  const phi = frac * params.signedThetaRad;
  const absPhi = Math.abs(phi);

  const axis = vec3Normalize(params.axisDir);
  const nUp: Vec3Tuple = [0, 0, 1];
  // Direção perpendicular à linha de dobra avançando para a flange filha
  const tangentOut = vec3Normalize(vec3Cross(axis, nUp));

  const R = params.innerRadiusMm;
  const T = params.thicknessMm;
  const rCenter = R + T; // raio do centro de curvatura a partir da face base z = 0 se DOWN, ou R a partir de z = T se UP
  const radius =
    params.surface === "inner"
      ? R
      : params.surface === "outer"
        ? R + T
        : R + params.kFactor * T;

  const isUp = params.direction === "UP";
  // Centro do cilindro no plano (tangentOut, Z)
  const centerZ = isUp ? T + R : -R;
  const radialOut = Math.sin(absPhi) * radius;
  const zOffset = isUp ? centerZ - Math.cos(absPhi) * radius : centerZ + Math.cos(absPhi) * radius;

  const px = params.axisOrigin[0] + axis[0] * params.vMm + tangentOut[0] * radialOut;
  const py = params.axisOrigin[1] + axis[1] * params.vMm + tangentOut[1] * radialOut;
  const pz = params.axisOrigin[2] + zOffset;

  const nr = isUp ? -Math.sin(absPhi) : Math.sin(absPhi);
  const nz = isUp ? Math.cos(absPhi) : -Math.cos(absPhi);
  const normal3D = vec3Normalize([tangentOut[0] * nr, tangentOut[1] * nr, nz]);

  void rCenter;
  return {
    point3D: [px, py, pz],
    localAngleRad: phi,
    normal3D,
  };
}

// ─── AVALIADOR CINEMÁTICO COMPLETO DA BEND TREE -> MALHA 3D TESSELADA ───────

export interface EvaluatedFlange3D {
  flangeId: string;
  isFixedRoot: boolean;
  worldMatrix: Mat4;
  worldNormal: Vec3Tuple;
  contour2D: Vec2Tuple[];
  holes2D: Array<{ id: string; contour: Vec2Tuple[] }>;
  worldCenter: Vec3Tuple;
}

export interface EvaluatedBendZone3D {
  bendId: string;
  parentFlangeId: string;
  childFlangeId: string;
  state: "FOLDED" | "UNFOLDED";
  effectiveAngleDeg: number;
  targetAngleDeg: number;
  direction: BendDirection;
  bendAllowanceMm: number;
  outsideSetbackMm: number;
  bendDeductionMm: number;
  axisStartWorld: Vec3Tuple;
  axisEndWorld: Vec3Tuple;
  handleAnchorWorld: Vec3Tuple;
  mappedCrossCutouts: Array<{
    cutoutId: string;
    points3D: Vec3Tuple[];
  }>;
}

export interface EvaluatedSheetMetal3D {
  bodyId: string;
  rootFlangeId: string;
  flanges: EvaluatedFlange3D[];
  bends: EvaluatedBendZone3D[];
  tessellatedShape: CadTessellatedShape;
  unfoldedBendLinesWorld: Array<{
    bendId: string;
    direction: BendDirection;
    targetAngleDeg: number;
    start: Vec3Tuple;
    end: Vec3Tuple;
  }>;
  totalFlatLengthMm: number;
  totalAreaMm2: number;
  volumeMm3: number;
  massKg: number;
}

interface MeshBuilderState {
  positions: number[];
  normals: number[];
  indices: number[];
  faceGroups: CadFaceGroup[];
  edges: CadPolylineEdge[];
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pushQuad(
  builder: MeshBuilderState,
  p0: Vec3Tuple,
  p1: Vec3Tuple,
  p2: Vec3Tuple,
  p3: Vec3Tuple,
  n0?: Vec3Tuple,
  n1?: Vec3Tuple,
  n2?: Vec3Tuple,
  n3?: Vec3Tuple,
) {
  const baseIdx = builder.positions.length / 3;
  const e1 = vec3Sub(p1, p0);
  const e2 = vec3Sub(p2, p0);
  const flatN = vec3Normalize(vec3Cross(e1, e2));
  const vn0 = n0 ?? flatN;
  const vn1 = n1 ?? flatN;
  const vn2 = n2 ?? flatN;
  const vn3 = n3 ?? flatN;

  builder.positions.push(...p0, ...p1, ...p2, ...p3);
  builder.normals.push(...vn0, ...vn1, ...vn2, ...vn3);
  builder.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
}

function pushPolyEdge(
  builder: MeshBuilderState,
  edgeId: string,
  pts: Vec3Tuple[],
  opts?: { isSeam?: boolean; isTangentEdge?: boolean },
) {
  if (pts.length < 2) return;
  const arr = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    arr[i * 3] = pts[i]![0];
    arr[i * 3 + 1] = pts[i]![1];
    arr[i * 3 + 2] = pts[i]![2];
  }
  const edgeIndex = builder.edges.length;
  builder.edges.push({
    edgeId,
    edgeIndex,
    edgeHash: hashString(edgeId),
    points: arr,
    pointCount: pts.length,
    isSeam: opts?.isSeam,
    isTangentEdge: opts?.isTangentEdge,
  });
}

function polygonBounds2D(poly: Vec2Tuple[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 40, minY: 0, maxY: 60 };
  return { minX, maxX, minY, maxY };
}

function polygonArea2D(poly: Vec2Tuple[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) * 0.5;
}

/**
 * Triangulação simples por ear-clipping para polígonos convexos/côncavos sem auto-interseção.
 */
function triangulatePolygon2D(poly: Vec2Tuple[]): Array<[number, number, number]> {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  if (n === 4) return [[0, 1, 2], [0, 2, 3]];

  // Garantir orientação CCW
  let signed = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    signed += a[0] * b[1] - b[0] * a[1];
  }
  const idxs = Array.from({ length: n }, (_, i) => (signed >= 0 ? i : n - 1 - i));
  const tris: Array<[number, number, number]> = [];
  let guard = 0;

  while (idxs.length > 3 && guard < n * n + 8) {
    guard++;
    let earFound = false;
    for (let i = 0; i < idxs.length; i++) {
      const prev = idxs[(i - 1 + idxs.length) % idxs.length]!;
      const curr = idxs[i]!;
      const next = idxs[(i + 1) % idxs.length]!;
      const a = poly[prev]!;
      const b = poly[curr]!;
      const c = poly[next]!;
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 1e-9) continue;

      let containsAny = false;
      for (let j = 0; j < idxs.length; j++) {
        const k = idxs[j]!;
        if (k === prev || k === curr || k === next) continue;
        const p = poly[k]!;
        const c1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        const c2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
        const c3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
        if (c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9) {
          containsAny = true;
          break;
        }
      }
      if (!containsAny) {
        tris.push([prev, curr, next]);
        idxs.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      tris.push([idxs[0]!, idxs[1]!, idxs[2]!]);
      idxs.splice(1, 1);
    }
  }
  if (idxs.length === 3) {
    tris.push([idxs[0]!, idxs[1]!, idxs[2]!]);
  }
  return tris;
}

/**
 * Adiciona uma placa plana (FlangeNode) extrudada em espessura T no espaço 3D transformado por worldMatrix.
 * Converte coordenadas CAD (X, Y_down, Z_up) para o espaço Z-up do ThreeBRepRenderer (X, -Y, Z) se solicitado.
 */
function appendFlangeSolidToBuilder(
  builder: MeshBuilderState,
  flange: FlangeNode,
  thicknessMm: number,
  worldMatrix: Mat4,
) {
  const contour = flange.contour2D;
  if (contour.length < 3) return;
  const tris = triangulatePolygon2D(contour);
  if (tris.length === 0) return;

  const transformPt = (x: number, y: number, z: number): Vec3Tuple =>
    mat4TransformPoint(worldMatrix, [x, y, z]);
  const topNormal = mat4TransformDir(worldMatrix, [0, 0, 1]);
  const botNormal = mat4TransformDir(worldMatrix, [0, 0, -1]);

  // Face Superior (z = T)
  const topStartTri = builder.indices.length / 3;
  const topBase = builder.positions.length / 3;
  for (const [x, y] of contour) {
    builder.positions.push(...transformPt(x, y, thicknessMm));
    builder.normals.push(...topNormal);
  }
  for (const [a, b, c] of tris) {
    builder.indices.push(topBase + a, topBase + b, topBase + c);
  }
  builder.faceGroups.push({
    faceId: `${flange.flangeId}:top`,
    faceIndex: builder.faceGroups.length,
    faceHash: hashString(`${flange.flangeId}:top`),
    startTriangle: topStartTri,
    triangleCount: tris.length,
  });

  // Face Inferior (z = 0)
  const botStartTri = builder.indices.length / 3;
  const botBase = builder.positions.length / 3;
  for (const [x, y] of contour) {
    builder.positions.push(...transformPt(x, y, 0));
    builder.normals.push(...botNormal);
  }
  for (const [a, b, c] of tris) {
    builder.indices.push(botBase + a, botBase + c, botBase + b);
  }
  builder.faceGroups.push({
    faceId: `${flange.flangeId}:bottom`,
    faceIndex: builder.faceGroups.length,
    faceHash: hashString(`${flange.flangeId}:bottom`),
    startTriangle: botStartTri,
    triangleCount: tris.length,
  });

  // Paredes laterais (normais duras por segmento)
  const sideStartTri = builder.indices.length / 3;
  const topLoop: Vec3Tuple[] = [];
  const botLoop: Vec3Tuple[] = [];
  for (let i = 0; i < contour.length; i++) {
    const [x1, y1] = contour[i]!;
    const [x2, y2] = contour[(i + 1) % contour.length]!;
    const b0 = transformPt(x1, y1, 0);
    const b1 = transformPt(x2, y2, 0);
    const t1 = transformPt(x2, y2, thicknessMm);
    const t0 = transformPt(x1, y1, thicknessMm);
    pushQuad(builder, b0, b1, t1, t0);
    topLoop.push(t0);
    botLoop.push(b0);
    pushPolyEdge(builder, `${flange.flangeId}:vert_${i}`, [b0, t0]);
  }
  topLoop.push(topLoop[0]!);
  botLoop.push(botLoop[0]!);
  pushPolyEdge(builder, `${flange.flangeId}:top_loop`, topLoop);
  pushPolyEdge(builder, `${flange.flangeId}:bot_loop`, botLoop);

  builder.faceGroups.push({
    faceId: `${flange.flangeId}:sides`,
    faceIndex: builder.faceGroups.length,
    faceHash: hashString(`${flange.flangeId}:sides`),
    startTriangle: sideStartTri,
    triangleCount: contour.length * 2,
  });

  // Contornos de furos internos na flange (arestas visíveis em SOMB+AR / ARAME e paredes internas)
  for (const hole of flange.holes2D) {
    if (hole.contour.length < 3) continue;
    const hTop: Vec3Tuple[] = [];
    const hBot: Vec3Tuple[] = [];
    for (let i = 0; i < hole.contour.length; i++) {
      const [hx1, hy1] = hole.contour[i]!;
      const [hx2, hy2] = hole.contour[(i + 1) % hole.contour.length]!;
      const hb0 = transformPt(hx1, hy1, 0);
      const hb1 = transformPt(hx2, hy2, 0);
      const ht1 = transformPt(hx2, hy2, thicknessMm);
      const ht0 = transformPt(hx1, hy1, thicknessMm);
      pushQuad(builder, hb1, hb0, ht0, ht1);
      hTop.push(ht0);
      hBot.push(hb0);
    }
    hTop.push(hTop[0]!);
    hBot.push(hBot[0]!);
    pushPolyEdge(builder, `${flange.flangeId}:hole_${hole.id}_top`, hTop);
    pushPolyEdge(builder, `${flange.flangeId}:hole_${hole.id}_bot`, hBot);
  }
}

/**
 * Gera a Zona de Dobra 3D:
 *  - Se UNFOLDED: faixa plana coplanar de largura exata BA (e linha de dobra)
 *  - Se FOLDED: cilindro curvo 3D com raio interno R, externo R+T, discretizado a cada <= 7.5°
 *    com normais suaves na curva e normais duras nas tampas laterais.
 */
function appendBendZoneToBuilder(
  builder: MeshBuilderState,
  bend: BendNode,
  thicknessMm: number,
  spanStartMm: number,
  spanEndMm: number,
  parentMatrix: Mat4,
): {
  childWorldMatrix: Mat4;
  axisStartWorld: Vec3Tuple;
  axisEndWorld: Vec3Tuple;
  handleAnchorWorld: Vec3Tuple;
} {
  const T = thicknessMm;
  const R = bend.innerRadiusMm;
  const ba = bend.bendAllowanceMm;
  const isUp = bend.direction === "UP";
  const axisOrigin = bend.axisOriginLocal;
  const axisDir = vec3Normalize(bend.axisDirLocal);
  const nUp: Vec3Tuple = [0, 0, 1];
  // Direção perpendicular à linha de dobra apontando para o lado da flange filha
  const outDir = vec3Normalize(vec3Cross(axisDir, nUp));

  const toWorld = (local: Vec3Tuple) => mat4TransformPoint(parentMatrix, local);
  const dirToWorld = (local: Vec3Tuple) => mat4TransformDir(parentMatrix, local);

  const axisStartLocal = vec3Add(axisOrigin, vec3Scale(axisDir, spanStartMm));
  const axisEndLocal = vec3Add(axisOrigin, vec3Scale(axisDir, spanEndMm));
  const axisMidLocal = vec3Add(axisOrigin, vec3Scale(axisDir, (spanStartMm + spanEndMm) * 0.5));

  if (bend.state === "UNFOLDED") {
    // Faixa plana coplanar de largura exata BA mantendo continuidade da linha neutra!
    const p00 = toWorld(axisStartLocal);
    const p10 = toWorld(axisEndLocal);
    const p11 = toWorld(vec3Add(axisEndLocal, vec3Scale(outDir, ba)));
    const p01 = toWorld(vec3Add(axisStartLocal, vec3Scale(outDir, ba)));

    const t00 = toWorld(vec3Add(axisStartLocal, [0, 0, T]));
    const t10 = toWorld(vec3Add(axisEndLocal, [0, 0, T]));
    const t11 = toWorld(vec3Add(axisEndLocal, vec3Add(vec3Scale(outDir, ba), [0, 0, T])));
    const t01 = toWorld(vec3Add(axisStartLocal, vec3Add(vec3Scale(outDir, ba), [0, 0, T])));

    const startTri = builder.indices.length / 3;
    const topN = dirToWorld([0, 0, 1]);
    const botN = dirToWorld([0, 0, -1]);

    pushQuad(builder, t00, t01, t11, t10, topN, topN, topN, topN);
    pushQuad(builder, p00, p10, p11, p01, botN, botN, botN, botN);
    pushQuad(builder, p00, p01, t01, t00);
    pushQuad(builder, p10, t10, t11, p11);

    builder.faceGroups.push({
      faceId: `${bend.bendId}:unfolded_zone`,
      faceIndex: builder.faceGroups.length,
      faceHash: hashString(`${bend.bendId}:unfolded_zone`),
      startTriangle: startTri,
      triangleCount: 8,
    });

    // Linha central de dobra no estado planificado/desdobrado (como aresta visível de referência)
    const midS = toWorld(vec3Add(axisStartLocal, vec3Add(vec3Scale(outDir, ba * 0.5), [0, 0, T + 0.04])));
    const midE = toWorld(vec3Add(axisEndLocal, vec3Add(vec3Scale(outDir, ba * 0.5), [0, 0, T + 0.04])));
    pushPolyEdge(builder, `${bend.bendId}:unfolded_bendline`, [midS, midE], { isTangentEdge: true });
    pushPolyEdge(builder, `${bend.bendId}:unfolded_edge_a`, [t00, t01]);
    pushPolyEdge(builder, `${bend.bendId}:unfolded_edge_b`, [t10, t11]);

    // Flange filha transladada exatamente em `outDir * BA` (ângulo efetivo = 0°)
    const childWorldMatrix = mat4Multiply(
      parentMatrix,
      mat4Translation(outDir[0] * ba, outDir[1] * ba, outDir[2] * ba),
    );

    return {
      childWorldMatrix,
      axisStartWorld: midS,
      axisEndWorld: midE,
      handleAnchorWorld: toWorld(vec3Add(axisMidLocal, vec3Add(vec3Scale(outDir, ba + 16), [0, 0, T]))),
    };
  }

  // ESTADO FOLDED: Zona Cilíndrica 3D suavemente discretizada (<= 7.5° por segmento)
  const thetaRad = (Math.abs(bend.targetAngleDeg) * Math.PI) / 180;
  // Regra da mão direita em torno de axisDir:
  // outDir = axisDir x (0,0,1). Rotação de outDir para +Z corresponde a ângulo -theta em torno de axisDir!
  const signedThetaRad = isUp ? -thetaRad : thetaRad;
  const segments = Math.max(4, Math.ceil(Math.abs(bend.targetAngleDeg) / 7.5));

  const centerZ = isUp ? T + R : -R;
  const rInner = Math.max(0.05, R);
  const rOuter = rInner + T;

  const arcPtLocal = (s: number, angle: number, radius: number): Vec3Tuple => {
    const radial = Math.sin(angle) * radius;
    const zPos = isUp ? centerZ - Math.cos(angle) * radius : centerZ + Math.cos(angle) * radius;
    return [
      axisOrigin[0] + axisDir[0] * s + outDir[0] * radial,
      axisOrigin[1] + axisDir[1] * s + outDir[1] * radial,
      axisOrigin[2] + zPos,
    ];
  };

  const arcNormalLocal = (angle: number, isOuter: boolean): Vec3Tuple => {
    const sign = isOuter ? 1 : -1;
    const nr = Math.sin(angle) * sign;
    const nz = (isUp ? -Math.cos(angle) : Math.cos(angle)) * sign;
    return vec3Normalize([outDir[0] * nr, outDir[1] * nr, nz]);
  };

  const bendStartTri = builder.indices.length / 3;
  const outerArcStartEdge: Vec3Tuple[] = [];
  const outerArcEndEdge: Vec3Tuple[] = [];
  const innerArcStartEdge: Vec3Tuple[] = [];
  const innerArcEndEdge: Vec3Tuple[] = [];

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * thetaRad;
    const a1 = ((i + 1) / segments) * thetaRad;

    // Superfície externa cilíndrica (normais suaves!)
    const o00 = toWorld(arcPtLocal(spanStartMm, a0, rOuter));
    const o10 = toWorld(arcPtLocal(spanEndMm, a0, rOuter));
    const o11 = toWorld(arcPtLocal(spanEndMm, a1, rOuter));
    const o01 = toWorld(arcPtLocal(spanStartMm, a1, rOuter));
    const on0 = dirToWorld(arcNormalLocal(a0, true));
    const on1 = dirToWorld(arcNormalLocal(a1, true));
    pushQuad(builder, o00, o01, o11, o10, on0, on1, on1, on0);

    // Superfície interna cilíndrica (normais suaves!)
    const i00 = toWorld(arcPtLocal(spanStartMm, a0, rInner));
    const i10 = toWorld(arcPtLocal(spanEndMm, a0, rInner));
    const i11 = toWorld(arcPtLocal(spanEndMm, a1, rInner));
    const i01 = toWorld(arcPtLocal(spanStartMm, a1, rInner));
    const in0 = dirToWorld(arcNormalLocal(a0, false));
    const in1 = dirToWorld(arcNormalLocal(a1, false));
    pushQuad(builder, i00, i10, i11, i01, in0, in0, in1, in1);

    // Tampas laterais da dobra (normais duras ao longo de -axisDir e +axisDir)
    const capNegN = dirToWorld(vec3Scale(axisDir, -1));
    const capPosN = dirToWorld(axisDir);
    pushQuad(builder, i00, i01, o01, o00, capNegN, capNegN, capNegN, capNegN);
    pushQuad(builder, i10, o10, o11, i11, capPosN, capPosN, capPosN, capPosN);

    if (i === 0) {
      outerArcStartEdge.push(o00);
      outerArcEndEdge.push(o10);
      innerArcStartEdge.push(i00);
      innerArcEndEdge.push(i10);
    }
    outerArcStartEdge.push(o01);
    outerArcEndEdge.push(o11);
    innerArcStartEdge.push(i01);
    innerArcEndEdge.push(i11);
  }

  builder.faceGroups.push({
    faceId: `${bend.bendId}:bend_cylinder`,
    faceIndex: builder.faceGroups.length,
    faceHash: hashString(`${bend.bendId}:bend_cylinder`),
    startTriangle: bendStartTri,
    triangleCount: segments * 8,
  });

  // Arestas suaves dos arcos laterais (sem linhas falsas longitudinais no cilindro!)
  pushPolyEdge(builder, `${bend.bendId}:outer_arc_start`, outerArcStartEdge);
  pushPolyEdge(builder, `${bend.bendId}:outer_arc_end`, outerArcEndEdge);
  pushPolyEdge(builder, `${bend.bendId}:inner_arc_start`, innerArcStartEdge);
  pushPolyEdge(builder, `${bend.bendId}:inner_arc_end`, innerArcEndEdge);

  // Pivô da rotação rígida: centro do cilindro da dobra no espaço do pai
  const pivotLocal: Vec3Tuple = [axisOrigin[0], axisOrigin[1], axisOrigin[2] + centerZ];
  const childWorldMatrix = computeChildBendMatrix(
    parentMatrix,
    pivotLocal,
    axisDir,
    signedThetaRad,
  );

  // Alça angular 3D no ponto médio da aba dobrada (24 mm após o fim da curva)
  const endOuterMidLocal = arcPtLocal((spanStartMm + spanEndMm) * 0.5, thetaRad, rOuter);
  const handleAnchorWorld = toWorld(endOuterMidLocal);

  return {
    childWorldMatrix,
    axisStartWorld: toWorld(axisStartLocal),
    axisEndWorld: toWorld(axisEndLocal),
    handleAnchorWorld,
  };
}

/**
 * Avalia toda a `BendTree` em DFS a partir do `rootFlangeId`:
 *  - Gera malha 3D unificada (`CadTessellatedShape`)
 *  - Calcula matriz rígida de cada flange
 *  - Mapeia `crossBendCutouts` sobre o cilindro quando FOLDED ou sobre a faixa BA quando UNFOLDED
 */
export function evaluateBendTree(body: SheetMetalBody): EvaluatedSheetMetal3D {
  const builder: MeshBuilderState = {
    positions: [],
    normals: [],
    indices: [],
    faceGroups: [],
    edges: [],
  };

  const T = Math.max(0.1, body.rule.thicknessMm);
  const evaluatedFlanges: EvaluatedFlange3D[] = [];
  const evaluatedBends: EvaluatedBendZone3D[] = [];
  const unfoldedBendLinesWorld: EvaluatedSheetMetal3D["unfoldedBendLinesWorld"] = [];
  const visitedFlanges = new Set<string>();

  // Indexar dobras por parentFlangeId
  const bendsByParent = new Map<string, BendNode[]>();
  for (const bend of Object.values(body.bends)) {
    const arr = bendsByParent.get(bend.parentFlangeId) ?? [];
    arr.push(bend);
    bendsByParent.set(bend.parentFlangeId, arr);
  }

  let totalAreaMm2 = 0;
  let totalFlatLengthMm = 0;

  const visitDFS = (flangeId: string, worldMatrix: Mat4) => {
    if (visitedFlanges.has(flangeId)) return;
    visitedFlanges.add(flangeId);
    const flange = body.flanges[flangeId];
    if (!flange) return;

    appendFlangeSolidToBuilder(builder, flange, T, worldMatrix);

    const bounds2D = polygonBounds2D(flange.contour2D);
    const flangeArea = Math.max(
      0,
      polygonArea2D(flange.contour2D) -
        flange.holes2D.reduce((acc, h) => acc + polygonArea2D(h.contour), 0),
    );
    totalAreaMm2 += flangeArea;
    totalFlatLengthMm += Math.max(0, bounds2D.maxX - bounds2D.minX);

    const cx = (bounds2D.minX + bounds2D.maxX) * 0.5;
    const cy = (bounds2D.minY + bounds2D.maxY) * 0.5;

    evaluatedFlanges.push({
      flangeId: flange.flangeId,
      isFixedRoot: flange.isFixedRoot || flange.flangeId === body.rootFlangeId,
      worldMatrix,
      worldNormal: mat4TransformDir(worldMatrix, [0, 0, 1]),
      contour2D: flange.contour2D,
      holes2D: flange.holes2D,
      worldCenter: mat4TransformPoint(worldMatrix, [cx, cy, T * 0.5]),
    });

    const childBends = bendsByParent.get(flangeId) ?? [];
    for (const bend of childBends) {
      const childFlange = body.flanges[bend.childFlangeId];
      if (!childFlange) continue;

      const cBounds = polygonBounds2D(childFlange.contour2D);
      const axisDir = vec3Normalize(bend.axisDirLocal);
      // Determina extensão ao longo da linha de dobra projetando o contorno da flange filha no eixo
      let spanMin = Infinity;
      let spanMax = -Infinity;
      for (const [px, py] of childFlange.contour2D) {
        const rel: Vec3Tuple = [
          px - bend.axisOriginLocal[0],
          py - bend.axisOriginLocal[1],
          -bend.axisOriginLocal[2],
        ];
        const s = vec3Dot(rel, axisDir);
        if (s < spanMin) spanMin = s;
        if (s > spanMax) spanMax = s;
      }
      if (!Number.isFinite(spanMin) || spanMax - spanMin < 1e-3) {
        spanMin = cBounds.minY;
        spanMax = cBounds.maxY;
      }

      const zoneSpan = Math.max(1, spanMax - spanMin);
      totalAreaMm2 += bend.bendAllowanceMm * zoneSpan;
      totalFlatLengthMm += bend.bendAllowanceMm;

      const zone = appendBendZoneToBuilder(
        builder,
        bend,
        T,
        spanMin,
        spanMax,
        worldMatrix,
      );

      if (bend.state === "UNFOLDED") {
        unfoldedBendLinesWorld.push({
          bendId: bend.bendId,
          direction: bend.direction,
          targetAngleDeg: bend.targetAngleDeg,
          start: zone.axisStartWorld,
          end: zone.axisEndWorld,
        });
      }

      // Mapeia recortes que cruzam a zona de dobra (crossBendCutouts)
      const mappedCrossCutouts: EvaluatedBendZone3D["mappedCrossCutouts"] = [];
      const thetaRad = (Math.abs(bend.targetAngleDeg) * Math.PI) / 180;
      const signedThetaRad = bend.direction === "UP" ? -thetaRad : thetaRad;
      const outDir = vec3Normalize(vec3Cross(axisDir, [0, 0, 1]));

      for (const cutout of body.crossBendCutouts) {
        const pts3D: Vec3Tuple[] = [];
        let touchesZone = false;
        for (const [cx2, cy2] of cutout.flatContour2D) {
          const rel: Vec3Tuple = [
            cx2 - bend.axisOriginLocal[0],
            cy2 - bend.axisOriginLocal[1],
            0,
          ];
          const u = vec3Dot(rel, outDir);
          const v = vec3Dot(rel, axisDir);
          if (u >= -1e-3 && u <= bend.bendAllowanceMm + 1e-3 && v >= spanMin - 1 && v <= spanMax + 1) {
            touchesZone = true;
          }
          if (bend.state === "FOLDED") {
            const clampedU = Math.max(0, Math.min(bend.bendAllowanceMm, u));
            const mapped = mapCrossBendPointTo3D({
              uMm: clampedU,
              vMm: v,
              bendAllowanceMm: bend.bendAllowanceMm,
              innerRadiusMm: bend.innerRadiusMm,
              thicknessMm: T,
              kFactor: bend.kFactor,
              signedThetaRad,
              axisOrigin: bend.axisOriginLocal,
              axisDir,
              direction: bend.direction,
              surface: "outer",
            });
            pts3D.push(mat4TransformPoint(worldMatrix, mapped.point3D));
          } else {
            pts3D.push(mat4TransformPoint(worldMatrix, [cx2, cy2, T + 0.06]));
          }
        }
        if (touchesZone && pts3D.length >= 2) {
          mappedCrossCutouts.push({ cutoutId: cutout.cutoutId, points3D: pts3D });
          pushPolyEdge(builder, `${bend.bendId}:cross_cutout_${cutout.cutoutId}`, [
            ...pts3D,
            pts3D[0]!,
          ]);
        }
      }

      evaluatedBends.push({
        bendId: bend.bendId,
        parentFlangeId: bend.parentFlangeId,
        childFlangeId: bend.childFlangeId,
        state: bend.state,
        effectiveAngleDeg: bend.state === "FOLDED" ? bend.targetAngleDeg : 0,
        targetAngleDeg: bend.targetAngleDeg,
        direction: bend.direction,
        bendAllowanceMm: bend.bendAllowanceMm,
        outsideSetbackMm: bend.outsideSetbackMm,
        bendDeductionMm: bend.bendDeductionMm,
        axisStartWorld: zone.axisStartWorld,
        axisEndWorld: zone.axisEndWorld,
        handleAnchorWorld: zone.handleAnchorWorld,
        mappedCrossCutouts,
      });

      // Para que o contorno local do filho (definido a partir de axisOriginLocal no referencial da chapa)
      // encaixe na extremidade da dobra, deslocamos o filho corretamente:
      // Se FOLDED: a matriz childWorldMatrix já rotaciona o referencial do filho em torno do eixo do cilindro;
      // se UNFOLDED: childWorldMatrix já translada em outDir * BA.
      visitDFS(bend.childFlangeId, zone.childWorldMatrix);
    }
  };

  visitDFS(body.rootFlangeId, mat4Identity());

  // Calcula bounding box 3D
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < builder.positions.length; i += 3) {
    const x = builder.positions[i]!;
    const y = builder.positions[i + 1]!;
    const z = builder.positions[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX)) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 10;
  }

  const tessellatedShape: CadTessellatedShape = {
    mesh: {
      positions: new Float32Array(builder.positions),
      normals: new Float32Array(builder.normals),
      indices: new Uint32Array(builder.indices),
      vertexCount: builder.positions.length / 3,
      triangleCount: builder.indices.length / 3,
      faceGroups: builder.faceGroups,
    },
    edges: {
      edges: builder.edges,
      totalEdges: builder.edges.length,
      totalPoints: builder.edges.reduce((acc, e) => acc + e.pointCount, 0),
    },
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
  };

  const volumeMm3 = totalAreaMm2 * T;
  const densityKgM3 = body.rule.densityKgM3 ?? 7850;
  const massKg = (volumeMm3 / 1e9) * densityKgM3;

  return {
    bodyId: body.bodyId,
    rootFlangeId: body.rootFlangeId,
    flanges: evaluatedFlanges,
    bends: evaluatedBends,
    tessellatedShape,
    unfoldedBendLinesWorld,
    totalFlatLengthMm: Number(totalFlatLengthMm.toFixed(4)),
    totalAreaMm2: Number(totalAreaMm2.toFixed(4)),
    volumeMm3: Number(volumeMm3.toFixed(4)),
    massKg: Number(massKg.toFixed(6)),
  };
}
