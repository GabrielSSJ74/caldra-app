/**
 * CALDRA CHAMFER — TIMELINE PARAMÉTRICA, NOMENCLATURA TOPOLÓGICA PERSISTENTE,
 * MODELAGEM 3D AVANÇADA, CONSTRUÇÃO 3D E OCORRÊNCIAS/JUNTAS (PILARES 1, 4 E 5)
 *
 * - Timeline paramétrica editável com pastas, marcador de Rollback, Supressão, Renomeação,
 *   Reordenação, Dependentes e Reconstrução Incremental por cache de hash (`nodeHash`).
 * - Nomenclatura Topológica Persistente (`feat_ext1:top`, `feat_hole3:cyl`, etc.) com normal
 *   global e alerta de referência perdida + re-associação em 1 toque.
 * - Operações 3D: Extrude, Thin Extrude (polilinha aberta -> parede sólida contínua), Press-Pull,
 *   Hole industrial (2 arestas de referência, ponta broca 118°, counterbore, countersink, roscado),
 *   Cylinder, Fillet, Chamfer, Shell, Draft, Coil, Split Body/Face, Combine, Path Pattern, Pipe.
 * - Geometria de Construção 3D (Offset Plane, Plane at Angle, Midplane, 3pts, Tangent, Plane Along Path s∈[0,1],
 *   Eixos e Pontos).
 * - Ocorrências Vinculadas (`ComponentDefinition` + `ComponentOccurrence`) e Juntas (`rigid`, `revolute`, `slider`, `cylindrical`).
 * - Registro unificado de comandos (`createChamferParametricEngine`) com Replay Determinístico (O10) e Rollback (O11).
 */

import {
  ChamferCommandEngine,
  sanitizeNumericInput,
  type ParametricCommandSpec,
} from "./commandEngine";
import { ParameterStore, type ParameterUnit } from "./parameterStore";
import { computeAssociativeOffset, signedPolygonArea, type Vec2 } from "../sketch/planarFaceExtractor";
import {
  DEFAULT_SHEET_METAL_RULES,
  addEdgeFlangeToBody,
  addHoleOrCutoutToBody,
  computeBodyFlatPattern,
  createContourFlangeBody,
  createSheetMetalBodyFromBase,
  foldSheetMetalBody,
  refoldSheetMetalBody,
  unfoldSheetMetalBody,
  type BendDirection,
  type BendPositionMode,
  type SheetMetalBody,
  type SheetMetalRule,
} from "../sheetMetal/bendTree";
import { validateBendInputs } from "../sheetMetal/bendMath";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox3D {
  min: Vec3;
  max: Vec3;
}

export interface PersistentFaceRef {
  key: string; // ex: "feat_ext1:top", "feat_ext1:side:seg_04", "feat_hole3:cyl"
  featureId: string;
  role: "top" | "bottom" | "side" | "cyl" | "bend_inner" | "bend_outer" | "fillet" | "chamfer";
  normal: Vec3;
  center: Vec3;
  areaMm2: number;
}

export interface MassProperties3D {
  volumeMm3: number;
  volumeCm3: number;
  surfaceAreaMm2: number;
  lateralAreaMm2: number;
  massGrams: number;
  massKg: number;
  densityKgM3: number;
  centerOfMass: Vec3;
  bounds: BoundingBox3D;
}

export interface SolidBodyModel {
  id: string;
  name: string;
  visible: boolean;
  kind: "box" | "cylinder" | "thinWall" | "coil" | "pipe" | "composite";
  origin: Vec3;
  /** Dimensões prismáticas para box (width=X, depth=Y, height=Z) */
  widthMm?: number;
  depthMm?: number;
  heightMm?: number;
  /** Dimensões para cilindro */
  diameterMm?: number;
  /** Polígono fechado para Thin Extrude */
  polygon2D?: Vec2[];
  /** Furos e modificadores aplicados ao corpo */
  holes: Array<{
    featureId: string;
    x: number;
    y: number;
    diameterMm: number;
    depthMm: number;
    through: boolean;
    holeType: "simple" | "drill118" | "counterbore" | "countersink" | "threaded";
    cboreDiameterMm?: number;
    cboreDepthMm?: number;
    csinkDiameterMm?: number;
    threadSpec?: string;
    edgeRef1?: { edgeKey: string; distanceMm: number; paramName?: string };
    edgeRef2?: { edgeKey: string; distanceMm: number; paramName?: string };
  }>;
  fillets: Array<{ featureId: string; radiusMm: number; edgeLengthTotalMm: number }>;
  chamfers: Array<{ featureId: string; sizeMm: number; edgeLengthTotalMm: number }>;
  shellThicknessMm?: number;
  draftAngleDeg?: number;
  /** Geometria persistente */
  faces: PersistentFaceRef[];
  massProps: MassProperties3D;
}

export interface ConstructionPlane3D {
  id: string;
  name: string;
  kind: "offset" | "angle" | "midplane" | "threePoints" | "tangent" | "alongPath";
  origin: Vec3;
  normal: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
  pathS?: number;
  visible: boolean;
}

export interface ConstructionAxis3D {
  id: string;
  name: string;
  kind: "cylinder" | "twoPoints" | "twoPlanes" | "faceNormal";
  origin: Vec3;
  direction: Vec3;
  visible: boolean;
}

export interface ConstructionPoint3D {
  id: string;
  name: string;
  position: Vec3;
  visible: boolean;
}

export type AssemblyJointType = "rigid" | "revolute" | "slider" | "cylindrical";

export interface ComponentDefinition {
  id: string;
  name: string;
  sharedGeometryKey: string;
  bodyIds: string[];
}

export interface ComponentOccurrence {
  id: string;
  name: string;
  definitionId: string;
  position: Vec3;
  rotationDeg: Vec3;
}

export interface AssemblyJoint {
  id: string;
  name: string;
  type: AssemblyJointType;
  occurrenceA: string;
  occurrenceB: string;
  axis: Vec3;
  origin: Vec3;
  /** Valor de teste de movimento (graus para revolute/cylindrical, mm para slider/cylindrical) */
  motionAngleDeg: number;
  motionOffsetMm: number;
}

export type TimelineFeatureType =
  | "sketch"
  | "extrude"
  | "thinExtrude"
  | "pressPull"
  | "cylinder"
  | "hole"
  | "fillet"
  | "chamfer"
  | "shell"
  | "draft"
  | "coil"
  | "splitBody"
  | "combine"
  | "pathPattern"
  | "pipe"
  | "constructPlane"
  | "constructAxis"
  | "constructPoint"
  | "sheetFlange"
  | "sheetBase"
  | "sheetFold"
  | "sheetEdgeFlange"
  | "sheetContourFlange"
  | "sheetUnfold"
  | "sheetRefold"
  | "sheetHole";

export interface TimelineFeatureNode {
  id: string;
  name: string;
  type: TimelineFeatureType;
  folderId?: string;
  suppressed: boolean;
  /** IDs de nós ou chaves topológicas das quais esta operação depende */
  dependsOn: string[];
  targetFaceKey?: string;
  params: Record<string, unknown>;
  /** Aviso de referência topológica perdida (não destrói a peça) */
  missingReferenceWarning?: string;
}

export interface TimelineFolder {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface EvaluatedFeatureSnapshot {
  nodeId: string;
  nodeHash: string;
  bodies: SolidBodyModel[];
  planes: ConstructionPlane3D[];
  axes: ConstructionAxis3D[];
  points: ConstructionPoint3D[];
  sheetMetalBody: SheetMetalBody | null;
  warnings: Record<string, string>;
}

export interface ParametricDocumentState {
  densityKgM3: number;
  parameters: Record<string, { expression: string; unit: ParameterUnit; value: number }>;
  features: TimelineFeatureNode[];
  folders: TimelineFolder[];
  /** Índice exclusivo até onde avaliar (null = avalia até o fim) */
  rollbackIndex: number | null;
  bodies: SolidBodyModel[];
  planes: ConstructionPlane3D[];
  axes: ConstructionAxis3D[];
  points: ConstructionPoint3D[];
  sheetMetalBody: SheetMetalBody | null;
  definitions: ComponentDefinition[];
  occurrences: ComponentOccurrence[];
  joints: AssemblyJoint[];
  warnings: Record<string, string>;
  totalMassProps: MassProperties3D;
}

export const STEEL_DENSITY_KG_M3 = 7850;

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function buildRightHandedFrame(normalInput: Vec3): { normal: Vec3; xAxis: Vec3; yAxis: Vec3 } {
  const normal = normalize3(normalInput);
  const ref = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const xAxis = normalize3(cross3(ref, normal));
  const yAxis = normalize3(cross3(normal, xAxis));
  return { normal, xAxis, yAxis };
}

/**
 * Gera polígono fechado contínuo com meia-esquadria (miter limit) a partir de uma polilinha aberta
 * para `Thin Extrude` (ex.: perfil em L 50+50mm com espessura t=3mm).
 */
export function buildThinExtrudePolygon(
  openPolyline: Vec2[],
  thicknessMm: number,
  side: "center" | "inside" | "outside" | "symmetric" = "center",
): Vec2[] {
  if (openPolyline.length < 2) return [];
  const t = Math.max(0.1, thicknessMm);
  let dLeft = t / 2;
  let dRight = -t / 2;
  if (side === "outside") {
    dLeft = t;
    dRight = 0;
  } else if (side === "inside") {
    dLeft = 0;
    dRight = -t;
  }
  const left = computeAssociativeOffset(openPolyline, dLeft, false);
  const right = computeAssociativeOffset(openPolyline, dRight, false).reverse();
  return [...left, ...right];
}

/**
 * Calcula `Plane Along Path` para qualquer curva/polilinha 3D em s ∈ [0, 1].
 */
export function computePlaneAlongPath(
  pathPoints: Vec3[],
  sNorm: number,
): { origin: Vec3; normal: Vec3; xAxis: Vec3; yAxis: Vec3 } {
  const s = Math.max(0, Math.min(1, sNorm));
  if (pathPoints.length < 2) {
    const o = pathPoints[0] ?? { x: 0, y: 0, z: 0 };
    return { origin: o, ...buildRightHandedFrame({ x: 0, y: 0, z: 1 }) };
  }

  const cumLen: number[] = [0];
  let total = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    const a = pathPoints[i - 1]!;
    const b = pathPoints[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    cumLen.push(total);
  }
  const targetDist = s * total;
  let segIdx = 0;
  for (let i = 0; i < cumLen.length - 1; i++) {
    if (targetDist >= cumLen[i]! && targetDist <= cumLen[i + 1]!) {
      segIdx = i;
      break;
    }
  }
  const a = pathPoints[segIdx]!;
  const b = pathPoints[segIdx + 1]!;
  const segLen = Math.max(1e-9, cumLen[segIdx + 1]! - cumLen[segIdx]!);
  const localT = Math.max(0, Math.min(1, (targetDist - cumLen[segIdx]!) / segLen));

  const origin: Vec3 = {
    x: a.x + (b.x - a.x) * localT,
    y: a.y + (b.y - a.y) * localT,
    z: a.z + (b.z - a.z) * localT,
  };
  const tangent: Vec3 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  return { origin, ...buildRightHandedFrame(tangent) };
}

/**
 * Calcula Propriedades de Massa analíticas exatas para um SolidBodyModel.
 */
export function computeBodyMassProperties(
  body: SolidBodyModel,
  densityKgM3 = STEEL_DENSITY_KG_M3,
): MassProperties3D {
  let volumeMm3 = 0;
  let surfaceAreaMm2 = 0;
  let lateralAreaMm2 = 0;
  let cx = body.origin.x;
  let cy = body.origin.y;
  let cz = body.origin.z;
  let min: Vec3 = { ...body.origin };
  let max: Vec3 = { ...body.origin };

  if (body.kind === "box") {
    const w = Math.max(0, body.widthMm ?? 0);
    const d = Math.max(0, body.depthMm ?? 0);
    const h = Math.max(0, body.heightMm ?? 0);
    volumeMm3 = w * d * h;
    lateralAreaMm2 = 2 * (w + d) * h;
    surfaceAreaMm2 = 2 * (w * d + w * h + d * h);
    cx = body.origin.x + w / 2;
    cy = body.origin.y + d / 2;
    cz = body.origin.z + h / 2;
    min = { x: body.origin.x, y: body.origin.y, z: body.origin.z };
    max = { x: body.origin.x + w, y: body.origin.y + d, z: body.origin.z + h };

    // Aplica Shell (casca) se presente
    if (body.shellThicknessMm && body.shellThicknessMm > 0) {
      const t = body.shellThicknessMm;
      const iw = Math.max(0, w - 2 * t);
      const id = Math.max(0, d - 2 * t);
      const ih = Math.max(0, h - t);
      volumeMm3 = Math.max(0, volumeMm3 - iw * id * ih);
    }

    // Aplica Draft (ângulo de saída) aproximação tronco de pirâmide
    if (body.draftAngleDeg && Math.abs(body.draftAngleDeg) > 1e-4) {
      const delta = Math.tan((body.draftAngleDeg * Math.PI) / 180) * h;
      const wTop = Math.max(1, w - 2 * delta);
      const dTop = Math.max(1, d - 2 * delta);
      const aBot = w * d;
      const aTop = wTop * dTop;
      volumeMm3 = (h / 3) * (aBot + aTop + Math.sqrt(aBot * aTop));
    }
  } else if (body.kind === "cylinder") {
    const dia = Math.max(0, body.diameterMm ?? 0);
    const r = dia / 2;
    const h = Math.max(0, body.heightMm ?? 0);
    volumeMm3 = Math.PI * r * r * h;
    lateralAreaMm2 = 2 * Math.PI * r * h;
    surfaceAreaMm2 = lateralAreaMm2 + 2 * Math.PI * r * r;
    cx = body.origin.x;
    cy = body.origin.y;
    cz = body.origin.z + h / 2;
    min = { x: body.origin.x - r, y: body.origin.y - r, z: body.origin.z };
    max = { x: body.origin.x + r, y: body.origin.y + r, z: body.origin.z + h };
  } else if (body.kind === "thinWall" && body.polygon2D && body.polygon2D.length >= 3) {
    const area2D = Math.abs(signedPolygonArea(body.polygon2D));
    const h = Math.max(0, body.heightMm ?? 0);
    volumeMm3 = area2D * h;
    let perim = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < body.polygon2D.length; i++) {
      const a = body.polygon2D[i]!;
      const b = body.polygon2D[(i + 1) % body.polygon2D.length]!;
      perim += Math.hypot(b.x - a.x, b.y - a.y);
      if (a.x < minX) minX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.x > maxX) maxX = a.x;
      if (a.y > maxY) maxY = a.y;
    }
    lateralAreaMm2 = perim * h;
    surfaceAreaMm2 = lateralAreaMm2 + 2 * area2D;
    cx = body.origin.x + (minX + maxX) / 2;
    cy = body.origin.y + (minY + maxY) / 2;
    cz = body.origin.z + h / 2;
    min = { x: body.origin.x + minX, y: body.origin.y + minY, z: body.origin.z };
    max = { x: body.origin.x + maxX, y: body.origin.y + maxY, z: body.origin.z + h };
  } else if (body.kind === "coil" || body.kind === "pipe") {
    const secDia = Math.max(0.5, body.diameterMm ?? 10);
    const rSec = secDia / 2;
    const len = Math.max(1, body.heightMm ?? 100);
    volumeMm3 = Math.PI * rSec * rSec * len;
    lateralAreaMm2 = 2 * Math.PI * rSec * len;
    surfaceAreaMm2 = lateralAreaMm2 + 2 * Math.PI * rSec * rSec;
    min = { x: body.origin.x - rSec, y: body.origin.y - rSec, z: body.origin.z };
    max = { x: body.origin.x + rSec, y: body.origin.y + rSec, z: body.origin.z + len };
    cz = body.origin.z + len / 2;
  }

  // Subtração exata de furos (Simples, Broca 118°, Counterbore, Countersink, Roscado)
  const bodyHeight = body.heightMm ?? 0;
  for (const hole of body.holes) {
    const r = Math.max(0, hole.diameterMm / 2);
    const effDepth = hole.through ? bodyHeight : Math.min(bodyHeight, Math.max(0, hole.depthMm));
    let holeVol = Math.PI * r * r * effDepth;

    if (!hole.through && hole.holeType === "drill118") {
      // Ponta cônica de broca 118° -> ângulo metade = 59°, altura do cone = r / tan(59°)
      const coneH = r / Math.tan((59 * Math.PI) / 180);
      holeVol += (Math.PI * r * r * coneH) / 3;
    } else if (hole.holeType === "counterbore" && hole.cboreDiameterMm && hole.cboreDepthMm) {
      const rCb = Math.max(r, hole.cboreDiameterMm / 2);
      const dCb = Math.min(effDepth, hole.cboreDepthMm);
      holeVol += Math.PI * (rCb * rCb - r * r) * dCb;
    } else if (hole.holeType === "countersink" && hole.csinkDiameterMm) {
      const rCs = Math.max(r, hole.csinkDiameterMm / 2);
      const hCs = rCs - r; // 90° countersink -> tan(45°) = 1
      const frustumVol = (Math.PI * hCs * (rCs * rCs + rCs * r + r * r)) / 3;
      const cylOverlap = Math.PI * r * r * hCs;
      holeVol += Math.max(0, frustumVol - cylOverlap);
    }

    volumeMm3 = Math.max(0, volumeMm3 - holeVol);
    // Área superficial: remove 2 tampas se passante (ou 1 se cego) e soma parede cilíndrica do furo
    const holeWall = 2 * Math.PI * r * effDepth;
    const capLoss = (hole.through ? 2 : 1) * Math.PI * r * r;
    surfaceAreaMm2 = Math.max(0, surfaceAreaMm2 + holeWall - capLoss);
  }

  // Subtração exata de Fillets (canto externo: área removida = (1 - pi/4) * R^2 * L)
  for (const f of body.fillets) {
    const removed = (1 - Math.PI / 4) * f.radiusMm * f.radiusMm * f.edgeLengthTotalMm;
    volumeMm3 = Math.max(0, volumeMm3 - removed);
  }

  // Subtração exata de Chanfros 45° (área removida = 0.5 * s^2 * L)
  for (const ch of body.chamfers) {
    const removed = 0.5 * ch.sizeMm * ch.sizeMm * ch.edgeLengthTotalMm;
    volumeMm3 = Math.max(0, volumeMm3 - removed);
  }

  // Massa: 1 mm³ = 1e-9 m³; massKg = volumeMm3 * 1e-9 * densityKgM3; massGrams = massKg * 1000
  const massKg = volumeMm3 * 1e-9 * densityKgM3;
  const massGrams = massKg * 1000;

  return {
    volumeMm3,
    volumeCm3: volumeMm3 / 1000,
    surfaceAreaMm2,
    lateralAreaMm2,
    massGrams,
    massKg,
    densityKgM3,
    centerOfMass: { x: cx, y: cy, z: cz },
    bounds: { min, max },
  };
}

export function aggregateMassProperties(
  bodies: SolidBodyModel[],
  densityKgM3 = STEEL_DENSITY_KG_M3,
): MassProperties3D {
  const visibleBodies = bodies.filter((b) => b.visible);
  if (visibleBodies.length === 0) {
    return {
      volumeMm3: 0,
      volumeCm3: 0,
      surfaceAreaMm2: 0,
      lateralAreaMm2: 0,
      massGrams: 0,
      massKg: 0,
      densityKgM3,
      centerOfMass: { x: 0, y: 0, z: 0 },
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    };
  }

  let vol = 0, area = 0, lat = 0;
  let wCx = 0, wCy = 0, wCz = 0;
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const b of visibleBodies) {
    const mp = b.massProps;
    vol += mp.volumeMm3;
    area += mp.surfaceAreaMm2;
    lat += mp.lateralAreaMm2;
    wCx += mp.centerOfMass.x * mp.volumeMm3;
    wCy += mp.centerOfMass.y * mp.volumeMm3;
    wCz += mp.centerOfMass.z * mp.volumeMm3;
    min.x = Math.min(min.x, mp.bounds.min.x);
    min.y = Math.min(min.y, mp.bounds.min.y);
    min.z = Math.min(min.z, mp.bounds.min.z);
    max.x = Math.max(max.x, mp.bounds.max.x);
    max.y = Math.max(max.y, mp.bounds.max.y);
    max.z = Math.max(max.z, mp.bounds.max.z);
  }

  const massKg = vol * 1e-9 * densityKgM3;
  return {
    volumeMm3: vol,
    volumeCm3: vol / 1000,
    surfaceAreaMm2: area,
    lateralAreaMm2: lat,
    massGrams: massKg * 1000,
    massKg,
    densityKgM3,
    centerOfMass:
      vol > 1e-9
        ? { x: wCx / vol, y: wCy / vol, z: wCz / vol }
        : { x: 0, y: 0, z: 0 },
    bounds: { min, max },
  };
}

function buildBoxFaces(featureId: string, origin: Vec3, w: number, d: number, h: number): PersistentFaceRef[] {
  return [
    {
      key: `${featureId}:top`,
      featureId,
      role: "top",
      normal: { x: 0, y: 0, z: 1 },
      center: { x: origin.x + w / 2, y: origin.y + d / 2, z: origin.z + h },
      areaMm2: w * d,
    },
    {
      key: `${featureId}:bottom`,
      featureId,
      role: "bottom",
      normal: { x: 0, y: 0, z: -1 },
      center: { x: origin.x + w / 2, y: origin.y + d / 2, z: origin.z },
      areaMm2: w * d,
    },
    {
      key: `${featureId}:side:seg_01`,
      featureId,
      role: "side",
      normal: { x: 0, y: -1, z: 0 },
      center: { x: origin.x + w / 2, y: origin.y, z: origin.z + h / 2 },
      areaMm2: w * h,
    },
    {
      key: `${featureId}:side:seg_02`,
      featureId,
      role: "side",
      normal: { x: 1, y: 0, z: 0 },
      center: { x: origin.x + w, y: origin.y + d / 2, z: origin.z + h / 2 },
      areaMm2: d * h,
    },
    {
      key: `${featureId}:side:seg_03`,
      featureId,
      role: "side",
      normal: { x: 0, y: 1, z: 0 },
      center: { x: origin.x + w / 2, y: origin.y + d, z: origin.z + h / 2 },
      areaMm2: w * h,
    },
    {
      key: `${featureId}:side:seg_04`,
      featureId,
      role: "side",
      normal: { x: -1, y: 0, z: 0 },
      center: { x: origin.x, y: origin.y + d / 2, z: origin.z + h / 2 },
      areaMm2: d * h,
    },
  ];
}

function hashFeatureNode(node: TimelineFeatureNode, paramValues: Record<string, number>, prevHash: string): string {
  return JSON.stringify({
    prevHash,
    id: node.id,
    type: node.type,
    suppressed: node.suppressed,
    targetFaceKey: node.targetFaceKey,
    params: node.params,
    paramValues,
  });
}

function resolveNumericParam(
  raw: unknown,
  paramValues: Record<string, number>,
  fallback = 0,
): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed in paramValues) return paramValues[trimmed]!;
    const n = Number(trimmed.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Avaliador Incremental da Timeline Paramétrica (Pilar 4):
 * Mantém cache de snapshots por `nodeId` + `nodeHash`.
 * Ao editar o nó `k`, salta todos os nós `< k` com hash inalterado e reconstrói apenas de `k` até `rollbackIndex`.
 */
export class ParametricTimelineEvaluator {
  private cache = new Map<string, EvaluatedFeatureSnapshot>();
  public lastRebuiltNodeIds: string[] = [];
  public lastCacheHitNodeIds: string[] = [];

  public evaluate(state: ParametricDocumentState): ParametricDocumentState {
    const store = new ParameterStore(false);
    for (const [name, p] of Object.entries(state.parameters)) {
      store.setParameter(name, p.expression, { unit: p.unit, kind: "user" });
    }
    const paramValues = store.getValueMap();

    const limit =
      state.rollbackIndex === null
        ? state.features.length
        : Math.max(0, Math.min(state.features.length, state.rollbackIndex));

    let bodies: SolidBodyModel[] = [];
    let planes: ConstructionPlane3D[] = [];
    let axes: ConstructionAxis3D[] = [];
    let points: ConstructionPoint3D[] = [];
    const sheetHolder: { current: SheetMetalBody | null } = { current: null };
    let warnings: Record<string, string> = {};
    let prevHash = `density:${state.densityKgM3}`;

    this.lastRebuiltNodeIds = [];
    this.lastCacheHitNodeIds = [];

    for (let i = 0; i < limit; i++) {
      const node = state.features[i]!;
      const nodeHash = hashFeatureNode(node, paramValues, prevHash);
      const cached = this.cache.get(node.id);

      if (cached && cached.nodeHash === nodeHash) {
        bodies = structuredClone(cached.bodies);
        planes = structuredClone(cached.planes);
        axes = structuredClone(cached.axes);
        points = structuredClone(cached.points);
        sheetHolder.current = cached.sheetMetalBody ? structuredClone(cached.sheetMetalBody) : null;
        warnings = { ...cached.warnings };
        prevHash = nodeHash;
        this.lastCacheHitNodeIds.push(node.id);
        continue;
      }

      this.lastRebuiltNodeIds.push(node.id);

      if (!node.suppressed) {
        this.applyFeature(
          node,
          paramValues,
          state.densityKgM3,
          bodies,
          planes,
          axes,
          points,
          sheetHolder,
          warnings,
        );
      }

      this.cache.set(node.id, {
        nodeId: node.id,
        nodeHash,
        bodies: structuredClone(bodies),
        planes: structuredClone(planes),
        axes: structuredClone(axes),
        points: structuredClone(points),
        sheetMetalBody: sheetHolder.current ? structuredClone(sheetHolder.current) : null,
        warnings: { ...warnings },
      });
      prevHash = nodeHash;
    }

    const updatedFeatures = state.features.map((f) => ({
      ...f,
      missingReferenceWarning: warnings[f.id],
    }));

    let totalMassProps = aggregateMassProperties(bodies, state.densityKgM3);
    if (bodies.length === 0 && sheetHolder.current) {
      const flat = computeBodyFlatPattern(sheetHolder.current);
      const t = sheetHolder.current.rule.thicknessMm;
      const rootW = sheetHolder.current.flanges[sheetHolder.current.rootFlangeId]?.widthMm ?? 60;
      const volMm3 = Math.max(0, flat.developedLengthMm * rootW * t);
      const volCm3 = volMm3 / 1000;
      const massKg = (volMm3 * 1e-9) * state.densityKgM3;
      totalMassProps = {
        volumeMm3: volMm3,
        volumeCm3: volCm3,
        surfaceAreaMm2: 2 * flat.developedLengthMm * rootW + 2 * (flat.developedLengthMm + rootW) * t,
        lateralAreaMm2: 2 * (flat.developedLengthMm + rootW) * t,
        massGrams: massKg * 1000,
        massKg,
        densityKgM3: state.densityKgM3,
        centerOfMass: { x: flat.developedLengthMm / 2, y: rootW / 2, z: t / 2 },
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: flat.developedLengthMm, y: rootW, z: t },
        },
      };
    }

    return {
      ...state,
      features: updatedFeatures,
      bodies,
      planes,
      axes,
      points,
      sheetMetalBody: sheetHolder.current,
      warnings,
      totalMassProps,
    };
  }

  public getDependents(state: ParametricDocumentState, nodeId: string): string[] {
    const out: string[] = [];
    for (const f of state.features) {
      if (
        f.dependsOn.includes(nodeId) ||
        (f.targetFaceKey && f.targetFaceKey.startsWith(`${nodeId}:`)) ||
        f.params.targetBodyId === nodeId
      ) {
        out.push(f.id);
      }
    }
    return out;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private applyFeature(
    node: TimelineFeatureNode,
    paramValues: Record<string, number>,
    densityKgM3: number,
    bodies: SolidBodyModel[],
    planes: ConstructionPlane3D[],
    axes: ConstructionAxis3D[],
    points: ConstructionPoint3D[],
    sheetHolder: { current: SheetMetalBody | null },
    warnings: Record<string, string>,
  ): void {
    const p = node.params;
    const findBody = (id?: string) =>
      (id ? bodies.find((b) => b.id === id) : bodies[bodies.length - 1]) ?? null;

    const verifyFaceReference = (): SolidBodyModel | null => {
      if (!node.targetFaceKey) return findBody(p.targetBodyId as string | undefined);
      for (const b of bodies) {
        if (b.faces.some((f) => f.key === node.targetFaceKey)) {
          return b;
        }
      }
      warnings[node.id] = `⚠️ Referência perdida: face "${node.targetFaceKey}" não encontrada. Toque para re-associar.`;
      return null;
    };

    switch (node.type) {
      case "extrude": {
        const w = resolveNumericParam(p.widthMm, paramValues, 100);
        const d = resolveNumericParam(p.depthMm, paramValues, 50);
        const h = resolveNumericParam(p.heightMm, paramValues, 10);
        const ox = resolveNumericParam(p.originX, paramValues, 0);
        const oy = resolveNumericParam(p.originY, paramValues, 0);
        const oz = resolveNumericParam(p.originZ, paramValues, 0);
        const origin = { x: ox, y: oy, z: oz };

        const body: SolidBodyModel = {
          id: (p.bodyId as string) ?? node.id,
          name: node.name,
          visible: true,
          kind: "box",
          origin,
          widthMm: w,
          depthMm: d,
          heightMm: h,
          holes: [],
          fillets: [],
          chamfers: [],
          faces: buildBoxFaces(node.id, origin, w, d, h),
          massProps: {} as MassProperties3D,
        };
        body.massProps = computeBodyMassProperties(body, densityKgM3);
        bodies.push(body);
        break;
      }

      case "thinExtrude": {
        const rawPath = (p.polyline as Vec2[]) ?? [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
        ];
        const thickness = resolveNumericParam(p.thicknessMm, paramValues, 3);
        const height = resolveNumericParam(p.heightMm, paramValues, 40);
        const side = (p.side as "center" | "inside" | "outside" | "symmetric") ?? "center";
        const poly = buildThinExtrudePolygon(rawPath, thickness, side);
        const origin = { x: 0, y: 0, z: 0 };

        const body: SolidBodyModel = {
          id: (p.bodyId as string) ?? node.id,
          name: node.name,
          visible: true,
          kind: "thinWall",
          origin,
          heightMm: height,
          polygon2D: poly,
          holes: [],
          fillets: [],
          chamfers: [],
          faces: [
            {
              key: `${node.id}:top`,
              featureId: node.id,
              role: "top",
              normal: { x: 0, y: 0, z: 1 },
              center: { x: 0, y: 0, z: height },
              areaMm2: Math.abs(signedPolygonArea(poly)),
            },
            {
              key: `${node.id}:bottom`,
              featureId: node.id,
              role: "bottom",
              normal: { x: 0, y: 0, z: -1 },
              center: { x: 0, y: 0, z: 0 },
              areaMm2: Math.abs(signedPolygonArea(poly)),
            },
          ],
          massProps: {} as MassProperties3D,
        };
        body.massProps = computeBodyMassProperties(body, densityKgM3);
        bodies.push(body);
        break;
      }

      case "pressPull": {
        const target = verifyFaceReference();
        if (!target) break;
        const delta = resolveNumericParam(p.deltaMm, paramValues, 0);
        const faceRole = node.targetFaceKey?.split(":")[1] ?? "top";
        if (target.kind === "box") {
          if (faceRole === "top" || faceRole === "bottom") {
            target.heightMm = Math.max(0.1, (target.heightMm ?? 0) + delta);
          } else {
            target.widthMm = Math.max(0.1, (target.widthMm ?? 0) + delta);
          }
          target.faces = buildBoxFaces(
            target.id,
            target.origin,
            target.widthMm ?? 0,
            target.depthMm ?? 0,
            target.heightMm ?? 0,
          );
        } else {
          target.heightMm = Math.max(0.1, (target.heightMm ?? 0) + delta);
        }
        target.massProps = computeBodyMassProperties(target, densityKgM3);
        break;
      }

      case "cylinder": {
        const dia = resolveNumericParam(p.diameterMm, paramValues, 50);
        const h = resolveNumericParam(p.heightMm, paramValues, 100);
        const ox = resolveNumericParam(p.originX, paramValues, 0);
        const oy = resolveNumericParam(p.originY, paramValues, 0);
        const oz = resolveNumericParam(p.originZ, paramValues, 0);
        const r = dia / 2;
        const origin = { x: ox, y: oy, z: oz };

        const body: SolidBodyModel = {
          id: (p.bodyId as string) ?? node.id,
          name: node.name,
          visible: true,
          kind: "cylinder",
          origin,
          diameterMm: dia,
          heightMm: h,
          holes: [],
          fillets: [],
          chamfers: [],
          faces: [
            {
              key: `${node.id}:top`,
              featureId: node.id,
              role: "top",
              normal: { x: 0, y: 0, z: 1 },
              center: { x: ox, y: oy, z: oz + h },
              areaMm2: Math.PI * r * r,
            },
            {
              key: `${node.id}:bottom`,
              featureId: node.id,
              role: "bottom",
              normal: { x: 0, y: 0, z: -1 },
              center: { x: ox, y: oy, z: oz },
              areaMm2: Math.PI * r * r,
            },
            {
              key: `${node.id}:cyl`,
              featureId: node.id,
              role: "cyl",
              normal: { x: 1, y: 0, z: 0 },
              center: { x: ox + r, y: oy, z: oz + h / 2 },
              areaMm2: 2 * Math.PI * r * h,
            },
          ],
          massProps: {} as MassProperties3D,
        };
        body.massProps = computeBodyMassProperties(body, densityKgM3);
        bodies.push(body);
        break;
      }

      case "hole": {
        const target = verifyFaceReference();
        if (!target) break;
        const dia = resolveNumericParam(p.diameterMm, paramValues, 10);
        const depth = resolveNumericParam(p.depthMm, paramValues, target.heightMm ?? 10);
        const through = p.through !== false;
        const x = resolveNumericParam(p.x, paramValues, (target.widthMm ?? 0) / 2);
        const y = resolveNumericParam(p.y, paramValues, (target.depthMm ?? 0) / 2);
        const holeType = (p.holeType as SolidBodyModel["holes"][number]["holeType"]) ?? "simple";

        target.holes.push({
          featureId: node.id,
          x,
          y,
          diameterMm: dia,
          depthMm: depth,
          through,
          holeType,
          cboreDiameterMm: p.cboreDiameterMm ? resolveNumericParam(p.cboreDiameterMm, paramValues) : undefined,
          cboreDepthMm: p.cboreDepthMm ? resolveNumericParam(p.cboreDepthMm, paramValues) : undefined,
          csinkDiameterMm: p.csinkDiameterMm ? resolveNumericParam(p.csinkDiameterMm, paramValues) : undefined,
          threadSpec: p.threadSpec as string | undefined,
        });
        target.faces.push({
          key: `${node.id}:cyl`,
          featureId: node.id,
          role: "cyl",
          normal: { x: 0, y: 0, z: 1 },
          center: { x: target.origin.x + x, y: target.origin.y + y, z: target.origin.z + (target.heightMm ?? 0) / 2 },
          areaMm2: Math.PI * dia * (through ? (target.heightMm ?? depth) : depth),
        });
        target.massProps = computeBodyMassProperties(target, densityKgM3);
        break;
      }

      case "fillet": {
        const target = verifyFaceReference();
        if (!target) break;
        const r = resolveNumericParam(p.radiusMm, paramValues, 2);
        const edgeLen =
          resolveNumericParam(p.edgeLengthTotalMm, paramValues, 0) ||
          (target.kind === "box" ? 2 * ((target.widthMm ?? 0) + (target.depthMm ?? 0)) : 100);
        target.fillets.push({ featureId: node.id, radiusMm: r, edgeLengthTotalMm: edgeLen });
        target.massProps = computeBodyMassProperties(target, densityKgM3);
        break;
      }

      case "chamfer": {
        const target = verifyFaceReference();
        if (!target) break;
        const sz = resolveNumericParam(p.sizeMm, paramValues, 2);
        const edgeLen =
          resolveNumericParam(p.edgeLengthTotalMm, paramValues, 0) ||
          (target.kind === "box" ? 2 * ((target.widthMm ?? 0) + (target.depthMm ?? 0)) : 100);
        target.chamfers.push({ featureId: node.id, sizeMm: sz, edgeLengthTotalMm: edgeLen });
        target.massProps = computeBodyMassProperties(target, densityKgM3);
        break;
      }

      case "shell": {
        const target = verifyFaceReference();
        if (!target) break;
        target.shellThicknessMm = resolveNumericParam(p.thicknessMm, paramValues, 2);
        target.massProps = computeBodyMassProperties(target, densityKgM3);
        break;
      }

      case "draft": {
        const target = verifyFaceReference();
        if (!target) break;
        target.draftAngleDeg = resolveNumericParam(p.angleDeg, paramValues, 5);
        target.massProps = computeBodyMassProperties(target, densityKgM3);
        break;
      }

      case "coil": {
        const coilDia = resolveNumericParam(p.diameterMm, paramValues, 40);
        const pitch = resolveNumericParam(p.pitchMm, paramValues, 10);
        const turns = resolveNumericParam(p.turns, paramValues, 5);
        const wireDia = resolveNumericParam(p.sectionDiameterMm, paramValues, 4);
        const helixLen = turns * Math.hypot(Math.PI * coilDia, pitch);
        const body: SolidBodyModel = {
          id: node.id,
          name: node.name,
          visible: true,
          kind: "coil",
          origin: { x: 0, y: 0, z: 0 },
          diameterMm: wireDia,
          heightMm: helixLen,
          holes: [],
          fillets: [],
          chamfers: [],
          faces: [],
          massProps: {} as MassProperties3D,
        };
        body.massProps = computeBodyMassProperties(body, densityKgM3);
        bodies.push(body);
        break;
      }

      case "pipe": {
        const path = (p.path as Vec3[]) ?? [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }];
        const dia = resolveNumericParam(p.diameterMm, paramValues, 25);
        let len = 0;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!, b = path[i]!;
          len += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        }
        const body: SolidBodyModel = {
          id: node.id,
          name: node.name,
          visible: true,
          kind: "pipe",
          origin: path[0] ?? { x: 0, y: 0, z: 0 },
          diameterMm: dia,
          heightMm: Math.max(1, len),
          holes: [],
          fillets: [],
          chamfers: [],
          faces: [],
          massProps: {} as MassProperties3D,
        };
        body.massProps = computeBodyMassProperties(body, densityKgM3);
        bodies.push(body);
        break;
      }

      case "splitBody": {
        const target = findBody(p.targetBodyId as string | undefined);
        if (!target || target.kind !== "box") break;
        const splitX = resolveNumericParam(p.splitOffsetMm, paramValues, (target.widthMm ?? 100) / 2);
        const origW = target.widthMm ?? 100;
        if (splitX > 1 && splitX < origW - 1) {
          target.widthMm = splitX;
          target.massProps = computeBodyMassProperties(target, densityKgM3);
          const second: SolidBodyModel = {
            ...structuredClone(target),
            id: `${target.id}_split_b`,
            name: `${target.name} (Parte B)`,
            origin: { x: target.origin.x + splitX, y: target.origin.y, z: target.origin.z },
            widthMm: origW - splitX,
          };
          second.massProps = computeBodyMassProperties(second, densityKgM3);
          bodies.push(second);
        }
        break;
      }

      case "combine": {
        const op = (p.operation as "union" | "subtract" | "intersect") ?? "union";
        const keepTool = Boolean(p.keepTool);
        if (bodies.length >= 2) {
          const base = bodies[0]!;
          const tool = bodies[bodies.length - 1]!;
          if (op === "subtract" && !keepTool) {
            const idx = bodies.indexOf(tool);
            if (idx > 0) bodies.splice(idx, 1);
          } else if (op === "union" && !keepTool) {
            base.massProps = aggregateMassProperties([base, tool], densityKgM3);
            const idx = bodies.indexOf(tool);
            if (idx > 0) bodies.splice(idx, 1);
          }
        }
        break;
      }

      case "pathPattern": {
        const source = findBody(p.targetBodyId as string | undefined);
        const path = (p.path as Vec3[]) ?? [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }];
        const count = Math.max(2, Math.min(50, Math.round(resolveNumericParam(p.count, paramValues, 3))));
        if (!source) break;
        for (let k = 1; k < count; k++) {
          const s = k / (count - 1);
          const frame = computePlaneAlongPath(path, s);
          const clone = structuredClone(source);
          clone.id = `${source.id}_pat_${k}`;
          clone.name = `${source.name} #${k + 1}`;
          clone.origin = { ...frame.origin };
          clone.massProps = computeBodyMassProperties(clone, densityKgM3);
          bodies.push(clone);
        }
        break;
      }

      case "constructPlane": {
        const kind = (p.kind as ConstructionPlane3D["kind"]) ?? "offset";
        let origin: Vec3 = { x: 0, y: 0, z: resolveNumericParam(p.offsetMm, paramValues, 20) };
        let frame = buildRightHandedFrame({ x: 0, y: 0, z: 1 });
        let pathS: number | undefined;
        if (kind === "alongPath" && Array.isArray(p.path)) {
          pathS = resolveNumericParam(p.s, paramValues, 0.5);
          const along = computePlaneAlongPath(p.path as Vec3[], pathS);
          origin = along.origin;
          frame = { normal: along.normal, xAxis: along.xAxis, yAxis: along.yAxis };
        } else if (kind === "threePoints" && Array.isArray(p.points) && p.points.length >= 3) {
          const [a, b, c] = p.points as Vec3[];
          origin = a!;
          const v1 = { x: b!.x - a!.x, y: b!.y - a!.y, z: b!.z - a!.z };
          const v2 = { x: c!.x - a!.x, y: c!.y - a!.y, z: c!.z - a!.z };
          frame = buildRightHandedFrame(cross3(v1, v2));
        } else if (kind === "angle") {
          const ang = (resolveNumericParam(p.angleDeg, paramValues, 45) * Math.PI) / 180;
          frame = buildRightHandedFrame({ x: 0, y: -Math.sin(ang), z: Math.cos(ang) });
        }
        planes.push({
          id: node.id,
          name: node.name,
          kind,
          origin,
          normal: frame.normal,
          xAxis: frame.xAxis,
          yAxis: frame.yAxis,
          pathS,
          visible: true,
        });
        break;
      }

      case "constructAxis": {
        const origin = (p.origin as Vec3) ?? { x: 0, y: 0, z: 0 };
        const dir = normalize3((p.direction as Vec3) ?? { x: 0, y: 0, z: 1 });
        axes.push({
          id: node.id,
          name: node.name,
          kind: (p.kind as ConstructionAxis3D["kind"]) ?? "twoPoints",
          origin,
          direction: dir,
          visible: true,
        });
        break;
      }

      case "constructPoint": {
        points.push({
          id: node.id,
          name: node.name,
          position: (p.position as Vec3) ?? { x: 0, y: 0, z: 0 },
          visible: true,
        });
        break;
      }

      case "sheetBase": {
        const rule = (p.rule as SheetMetalRule) ?? {
          ...(DEFAULT_SHEET_METAL_RULES[4]!),
          thicknessMm: resolveNumericParam(p.thicknessMm, paramValues, 3),
          innerRadiusMm: resolveNumericParam(p.innerRadiusMm, paramValues, 3),
          kFactor: resolveNumericParam(p.kFactor, paramValues, 0.33),
        };
        const lengthMm = resolveNumericParam(p.lengthMm, paramValues, 100);
        const widthMm = resolveNumericParam(p.widthMm, paramValues, 60);
        sheetHolder.current = createSheetMetalBodyFromBase({
          bodyId: (p.bodyId as string) ?? node.id,
          name: node.name,
          lengthXMm: lengthMm,
          widthYMm: widthMm,
          rule,
        });
        break;
      }

      case "sheetContourFlange": {
        const rule = (p.rule as SheetMetalRule) ?? {
          ...(DEFAULT_SHEET_METAL_RULES[4]!),
          thicknessMm: resolveNumericParam(p.thicknessMm, paramValues, 3),
          innerRadiusMm: resolveNumericParam(p.innerRadiusMm, paramValues, 3),
          kFactor: resolveNumericParam(p.kFactor, paramValues, 0.33),
        };
        const legs = Array.isArray(p.externalLegsMm)
          ? (p.externalLegsMm as unknown[]).map((v) => resolveNumericParam(v, paramValues, 40))
          : [40, 30];
        const rawAngles = Array.isArray(p.bendAnglesDeg)
          ? (p.bendAnglesDeg as unknown[]).map((v) => resolveNumericParam(v, paramValues, 90))
          : [90];
        const dirs = Array.isArray(p.bendDirections)
          ? (p.bendDirections as BendDirection[])
          : undefined;
        const signedAngles = rawAngles.map((a, idx) =>
          dirs && dirs[idx] === "DOWN" ? -Math.abs(a) : a,
        );
        const widthMm = resolveNumericParam(p.extrudeWidthMm, paramValues, 80);
        sheetHolder.current = createContourFlangeBody({
          name: node.name,
          extrudeWidthMm: widthMm,
          externalLegsMm: legs,
          bendAnglesDeg: signedAngles,
          rule,
        });
        break;
      }

      case "sheetFold": {
        if (!sheetHolder.current) {
          sheetHolder.current = createSheetMetalBodyFromBase({
            name: "Chapa Base",
            lengthXMm: resolveNumericParam(p.initialLengthMm, paramValues, 100),
            widthYMm: resolveNumericParam(p.initialWidthMm, paramValues, 60),
            rule: (p.rule as SheetMetalRule) ?? DEFAULT_SHEET_METAL_RULES[4]!,
          });
        }
        const angleExpr = typeof p.angleExpression === "string" ? p.angleExpression.trim() : undefined;
        const resolvedAngle = angleExpr
          ? resolveNumericParam(angleExpr, paramValues, resolveNumericParam(p.targetAngleDeg, paramValues, 90))
          : resolveNumericParam(p.targetAngleDeg, paramValues, 90);
        const res = foldSheetMetalBody(sheetHolder.current, {
          bendId: (p.bendId as string) ?? node.id,
          targetFlangeId: p.flangeId as string | undefined,
          distanceFromEdgeMm: resolveNumericParam(p.distanceFromEdgeMm, paramValues, 40),
          childExternalLegMm:
            p.childExternalLegMm !== undefined
              ? resolveNumericParam(p.childExternalLegMm, paramValues, 30)
              : undefined,
          targetAngleDeg: resolvedAngle,
          angleExpression: angleExpr,
          direction: (p.direction as BendDirection) ?? "UP",
          innerRadiusMm:
            p.innerRadiusMm !== undefined
              ? resolveNumericParam(p.innerRadiusMm, paramValues, sheetHolder.current.rule.innerRadiusMm)
              : undefined,
          kFactor:
            p.kFactor !== undefined
              ? resolveNumericParam(p.kFactor, paramValues, sheetHolder.current.rule.kFactor)
              : undefined,
          bendPosition: (p.bendPosition as BendPositionMode) ?? "MATERIAL_INSIDE",
          invertFixedSide: Boolean(p.invertFixedSide),
        });
        if (res.ok) sheetHolder.current = res.body;
        break;
      }

      case "sheetEdgeFlange": {
        if (!sheetHolder.current) {
          sheetHolder.current = createSheetMetalBodyFromBase({
            name: "Chapa Base",
            lengthXMm: 100,
            widthYMm: 60,
            rule: (p.rule as SheetMetalRule) ?? DEFAULT_SHEET_METAL_RULES[4]!,
          });
        }
        const angleExpr = typeof p.angleExpression === "string" ? p.angleExpression.trim() : undefined;
        const resolvedAngle = angleExpr
          ? resolveNumericParam(angleExpr, paramValues, resolveNumericParam(p.targetAngleDeg, paramValues, 90))
          : resolveNumericParam(p.targetAngleDeg, paramValues, 90);
        const res = addEdgeFlangeToBody(sheetHolder.current, {
          parentFlangeId: p.parentFlangeId as string | undefined,
          externalLengthMm: resolveNumericParam(p.externalLengthMm, paramValues, 30),
          targetAngleDeg: resolvedAngle,
          angleExpression: angleExpr,
          direction: (p.direction as BendDirection) ?? "UP",
          innerRadiusMm:
            p.innerRadiusMm !== undefined
              ? resolveNumericParam(p.innerRadiusMm, paramValues, sheetHolder.current.rule.innerRadiusMm)
              : undefined,
          kFactor:
            p.kFactor !== undefined
              ? resolveNumericParam(p.kFactor, paramValues, sheetHolder.current.rule.kFactor)
              : undefined,
        });
        if (res.ok) sheetHolder.current = res.body;
        break;
      }

      case "sheetUnfold": {
        if (!sheetHolder.current) break;
        const bendIds = Array.isArray(p.bendIds) ? (p.bendIds as string[]) : undefined;
        sheetHolder.current = unfoldSheetMetalBody(sheetHolder.current, bendIds);
        break;
      }

      case "sheetRefold": {
        if (!sheetHolder.current) break;
        const bendIds = Array.isArray(p.bendIds) ? (p.bendIds as string[]) : undefined;
        sheetHolder.current = refoldSheetMetalBody(sheetHolder.current, bendIds);
        break;
      }

      case "sheetHole": {
        if (!sheetHolder.current) break;
        const res = addHoleOrCutoutToBody(sheetHolder.current, {
          cutoutId: (p.holeId as string) ?? node.id,
          flangeId: p.flangeId as string | undefined,
          cx: resolveNumericParam(p.x, paramValues, 20),
          cy: resolveNumericParam(p.y, paramValues, 30),
          diameterMm: resolveNumericParam(p.diameterMm, paramValues, 10),
          acrossBend: Boolean(p.acrossBend || p.bendId),
        });
        if (res.ok) sheetHolder.current = res.body;
        break;
      }
    }
  }
}

export function createEmptyParametricDocument(
  densityKgM3 = STEEL_DENSITY_KG_M3,
): ParametricDocumentState {
  return {
    densityKgM3,
    parameters: {},
    features: [],
    folders: [],
    rollbackIndex: null,
    bodies: [],
    planes: [],
    axes: [],
    points: [],
    sheetMetalBody: null,
    definitions: [],
    occurrences: [],
    joints: [],
    warnings: {},
    totalMassProps: aggregateMassProperties([], densityKgM3),
  };
}

/**
 * Cria o Motor de Comandos Paramétrico completo do CHAMFER (`sketch.*`, `solid.*`, `sheet.*`,
 * `construct.*`, `inspect.*`, `timeline.*`, `parameters.*`) com replay determinístico e guarda atômico.
 */
export function createChamferParametricEngine(
  initialState: ParametricDocumentState = createEmptyParametricDocument(),
) {
  const evaluator = new ParametricTimelineEvaluator();

  const validateState = (s: ParametricDocumentState) => {
    if (!Number.isFinite(s.totalMassProps.volumeMm3) || s.totalMassProps.volumeMm3 < 0) {
      return { ok: false, error: "Volume inválido ou negativo detectado pelo kernel" };
    }
    return { ok: true };
  };

  const rawEngine = new ChamferCommandEngine<ParametricDocumentState>({ validator: validateState });
  let currentState = initialState;

  const rebuild = (s: ParametricDocumentState) => evaluator.evaluate(s);

  const commands: ParametricCommandSpec<ParametricDocumentState>[] = [
    {
      id: "parameters.set",
      label: "Definir Parâmetro",
      group: "parameters",
      schema: [
        { name: "name", type: "string", required: true },
        { name: "expression", type: "string", required: true },
        { name: "unit", type: "enum", options: ["mm", "deg", "qty"], defaultValue: "mm" },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const store = new ParameterStore(false);
        for (const [k, v] of Object.entries(state.parameters)) {
          store.setParameter(k, v.expression, { unit: v.unit, kind: "user" });
        }
        const res = store.setParameter(
          String(params.name),
          String(params.expression),
          { unit: (params.unit as ParameterUnit) ?? "mm", kind: "user" },
        );
        if (!res.ok) throw new Error(res.error ?? "Erro ao definir parâmetro");
        const nextParams: ParametricDocumentState["parameters"] = {};
        for (const p of store.getAll()) {
          nextParams[p.name] = { expression: p.expression, unit: p.unit, value: p.value };
        }
        return rebuild({ ...state, parameters: nextParams });
      },
    },
    {
      id: "solid.extrude",
      label: "Extrusão Sólida",
      group: "solid",
      schema: [
        { name: "id", type: "string" },
        { name: "name", type: "string", defaultValue: "Extrusão" },
        { name: "widthMm", type: "number", positiveOnly: true, required: true },
        { name: "depthMm", type: "number", positiveOnly: true, required: true },
        { name: "heightMm", type: "number", positiveOnly: true, required: true },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const id = (params.id as string) || `feat_ext_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Extrusão ${state.features.length + 1}`,
          type: "extrude",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "solid.thinExtrude",
      label: "Extrusão Fina (Parede)",
      group: "solid",
      schema: [
        { name: "id", type: "string" },
        { name: "name", type: "string", defaultValue: "Extrusão Fina" },
        { name: "polyline", type: "array", required: true },
        { name: "thicknessMm", type: "number", positiveOnly: true, required: true },
        { name: "heightMm", type: "number", positiveOnly: true, required: true },
        { name: "side", type: "enum", options: ["center", "inside", "outside", "symmetric"], defaultValue: "center" },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const id = (params.id as string) || `feat_thin_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Extrusão Fina ${state.features.length + 1}`,
          type: "thinExtrude",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "solid.pressPull",
      label: "Press-Pull (Face)",
      group: "solid",
      schema: [
        { name: "id", type: "string" },
        { name: "targetFaceKey", type: "string", required: true },
        { name: "deltaMm", type: "number", required: true },
      ],
      enabled: (s) => s.bodies.length > 0,
      execute: (state, params) => {
        const id = (params.id as string) || `feat_pp_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: `Press-Pull (${params.deltaMm}mm)`,
          type: "pressPull",
          suppressed: false,
          dependsOn: [String(params.targetFaceKey).split(":")[0] ?? ""],
          targetFaceKey: String(params.targetFaceKey),
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "solid.cylinder",
      label: "Cilindro Sólido",
      group: "solid",
      schema: [
        { name: "id", type: "string" },
        { name: "name", type: "string", defaultValue: "Cilindro" },
        { name: "diameterMm", type: "number", positiveOnly: true, required: true },
        { name: "heightMm", type: "number", positiveOnly: true, required: true },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const id = (params.id as string) || `feat_cyl_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Cilindro ${state.features.length + 1}`,
          type: "cylinder",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "solid.hole",
      label: "Furo Industrial",
      group: "solid",
      schema: [
        { name: "id", type: "string" },
        { name: "diameterMm", type: "number", positiveOnly: true, required: true },
        { name: "depthMm", type: "number", positiveOnly: true },
        { name: "through", type: "boolean", defaultValue: true },
        { name: "holeType", type: "enum", options: ["simple", "drill118", "counterbore", "countersink", "threaded"], defaultValue: "simple" },
        { name: "targetFaceKey", type: "string" },
        { name: "targetBodyId", type: "string" },
      ],
      enabled: (s) => s.bodies.length > 0,
      execute: (state, params) => {
        const id = (params.id as string) || `feat_hole_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: `Furo Ø${params.diameterMm}mm`,
          type: "hole",
          suppressed: false,
          dependsOn: params.targetBodyId ? [String(params.targetBodyId)] : [],
          targetFaceKey: params.targetFaceKey as string | undefined,
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "solid.fillet",
      label: "Fillet (Raio)",
      group: "solid",
      schema: [
        { name: "id", type: "string" },
        { name: "radiusMm", type: "number", positiveOnly: true, required: true },
        { name: "edgeLengthTotalMm", type: "number", positiveOnly: true },
        { name: "targetBodyId", type: "string" },
      ],
      enabled: (s) => s.bodies.length > 0,
      execute: (state, params) => {
        const id = (params.id as string) || `feat_fil_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: `Fillet R${params.radiusMm}`,
          type: "fillet",
          suppressed: false,
          dependsOn: params.targetBodyId ? [String(params.targetBodyId)] : [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "construct.plane",
      label: "Plano de Construção",
      group: "construct",
      schema: [
        { name: "id", type: "string" },
        { name: "name", type: "string", defaultValue: "Plano Auxiliar" },
        { name: "kind", type: "enum", options: ["offset", "angle", "midplane", "threePoints", "tangent", "alongPath"], defaultValue: "offset" },
        { name: "offsetMm", type: "number", defaultValue: 20 },
        { name: "s", type: "number", min: 0, max: 1, defaultValue: 0.5 },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const id = (params.id as string) || `plane_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Plano (${params.kind})`,
          type: "constructPlane",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.base",
      label: "Chapa Base",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "name", type: "string", defaultValue: "Chapa Base" },
        { name: "lengthMm", type: "number", positiveOnly: true, required: true },
        { name: "widthMm", type: "number", positiveOnly: true, required: true },
        { name: "thicknessMm", type: "number", positiveOnly: true },
        { name: "innerRadiusMm", type: "number", min: 0 },
        { name: "kFactor", type: "number", positiveOnly: true },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const t = Number(params.thicknessMm ?? (params.rule as SheetMetalRule | undefined)?.thicknessMm ?? 3);
        const r = Number(params.innerRadiusMm ?? (params.rule as SheetMetalRule | undefined)?.innerRadiusMm ?? t);
        const k = Number(params.kFactor ?? (params.rule as SheetMetalRule | undefined)?.kFactor ?? 0.33);
        const check = validateBendInputs({
          angleDeg: 90,
          thicknessMm: t,
          innerRadiusMm: r,
          kFactor: k,
        });
        if (!check.ok) throw new Error(check.error);
        const id = (params.id as string) || `sheet_base_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Chapa Base ${params.lengthMm}×${params.widthMm}`,
          type: "sheetBase",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.contourFlange",
      label: "Contour Flange (L / U / Z)",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "name", type: "string", defaultValue: "Contour Flange" },
        { name: "extrudeWidthMm", type: "number", positiveOnly: true, required: true },
        { name: "externalLegsMm", type: "array", required: true },
        { name: "bendAnglesDeg", type: "array", required: true },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const rule = (params.rule as SheetMetalRule | undefined) ?? DEFAULT_SHEET_METAL_RULES[4]!;
        const angles = (params.bendAnglesDeg as number[]) ?? [];
        for (const a of angles) {
          const check = validateBendInputs({
            angleDeg: Math.abs(Number(a)),
            thicknessMm: rule.thicknessMm,
            innerRadiusMm: rule.innerRadiusMm,
            kFactor: rule.kFactor,
          });
          if (!check.ok) throw new Error(check.error);
        }
        const id = (params.id as string) || `sheet_cf_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Contour Flange ${state.features.length + 1}`,
          type: "sheetContourFlange",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.fold",
      label: "Dobrar Chapa (Fold)",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "bendId", type: "string" },
        { name: "targetAngleDeg", type: "number", required: true },
        { name: "distanceFromEdgeMm", type: "number", positiveOnly: true },
        { name: "childExternalLegMm", type: "number", positiveOnly: true },
        { name: "direction", type: "enum", options: ["UP", "DOWN"], defaultValue: "UP" },
        { name: "innerRadiusMm", type: "number", min: 0 },
        { name: "kFactor", type: "number", positiveOnly: true },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const rule = state.sheetMetalBody?.rule ?? (params.rule as SheetMetalRule | undefined) ?? DEFAULT_SHEET_METAL_RULES[4]!;
        const check = validateBendInputs({
          angleDeg: Number(params.targetAngleDeg),
          thicknessMm: rule.thicknessMm,
          innerRadiusMm: Number(params.innerRadiusMm ?? rule.innerRadiusMm),
          kFactor: Number(params.kFactor ?? rule.kFactor),
        });
        if (!check.ok) throw new Error(check.error);
        const id = (params.id as string) || `sheet_fold_${state.features.length + 1}`;
        const dir = (params.direction as BendDirection) ?? "UP";
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Dobrar ${Number(params.targetAngleDeg).toFixed(1)}° ${dir === "UP" ? "CIMA" : "BAIXO"}`,
          type: "sheetFold",
          suppressed: false,
          dependsOn: [],
          params: { ...params, bendId: (params.bendId as string) || id },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.edgeFlange",
      label: "Edge Flange (Aba de Borda)",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "externalLengthMm", type: "number", positiveOnly: true, required: true },
        { name: "targetAngleDeg", type: "number", required: true },
        { name: "direction", type: "enum", options: ["UP", "DOWN"], defaultValue: "UP" },
      ],
      enabled: () => true,
      execute: (state, params) => {
        const rule = state.sheetMetalBody?.rule ?? DEFAULT_SHEET_METAL_RULES[4]!;
        const check = validateBendInputs({
          angleDeg: Number(params.targetAngleDeg),
          thicknessMm: rule.thicknessMm,
          innerRadiusMm: Number(params.innerRadiusMm ?? rule.innerRadiusMm),
          kFactor: Number(params.kFactor ?? rule.kFactor),
        });
        if (!check.ok) throw new Error(check.error);
        const id = (params.id as string) || `sheet_ef_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Aba ${params.externalLengthMm}mm (${params.targetAngleDeg}°)`,
          type: "sheetEdgeFlange",
          suppressed: false,
          dependsOn: [],
          params: { ...params, bendId: (params.bendId as string) || id },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.unfold",
      label: "Desdobrar Chapa (Unfold)",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "bendIds", type: "array" },
      ],
      enabled: (s) => Boolean(s.sheetMetalBody && Object.keys(s.sheetMetalBody.bends).length > 0),
      execute: (state, params) => {
        const id = (params.id as string) || `sheet_unfold_${state.features.length + 1}`;
        const bendIds = Array.isArray(params.bendIds) ? (params.bendIds as string[]) : undefined;
        const node: TimelineFeatureNode = {
          id,
          name:
            (params.name as string) ||
            (bendIds && bendIds.length > 0 ? `Desdobrar (${bendIds.length})` : "Desdobrar Todas"),
          type: "sheetUnfold",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.refold",
      label: "Redobrar Chapa (Refold)",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "bendIds", type: "array" },
      ],
      enabled: (s) =>
        Boolean(
          s.sheetMetalBody &&
            Object.values(s.sheetMetalBody.bends).some((b) => b.state === "UNFOLDED"),
        ),
      execute: (state, params) => {
        const id = (params.id as string) || `sheet_refold_${state.features.length + 1}`;
        const bendIds = Array.isArray(params.bendIds) ? (params.bendIds as string[]) : undefined;
        const node: TimelineFeatureNode = {
          id,
          name:
            (params.name as string) ||
            (bendIds && bendIds.length > 0 ? `Redobrar (${bendIds.length})` : "Redobrar Todas"),
          type: "sheetRefold",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "sheet.hole",
      label: "Furo na Chapa",
      group: "sheet",
      schema: [
        { name: "id", type: "string" },
        { name: "diameterMm", type: "number", positiveOnly: true, required: true },
        { name: "x", type: "number" },
        { name: "y", type: "number" },
      ],
      enabled: (s) => Boolean(s.sheetMetalBody),
      execute: (state, params) => {
        const id = (params.id as string) || `sheet_hole_${state.features.length + 1}`;
        const node: TimelineFeatureNode = {
          id,
          name: (params.name as string) || `Furo Chapa Ø${params.diameterMm}mm`,
          type: "sheetHole",
          suppressed: false,
          dependsOn: [],
          params: { ...params },
        };
        return rebuild({ ...state, features: [...state.features, node] });
      },
    },
    {
      id: "timeline.edit",
      label: "Editar Etapa da Timeline",
      group: "timeline",
      schema: [
        { name: "nodeId", type: "string", required: true },
        { name: "patchParams", type: "array" },
        { name: "heightMm", type: "number", positiveOnly: true },
        { name: "widthMm", type: "number", positiveOnly: true },
        { name: "depthMm", type: "number", positiveOnly: true },
        { name: "radiusMm", type: "number", positiveOnly: true },
        { name: "diameterMm", type: "number", positiveOnly: true },
        { name: "targetAngleDeg", type: "number" },
        { name: "innerRadiusMm", type: "number", min: 0 },
        { name: "kFactor", type: "number", positiveOnly: true },
        { name: "distanceFromEdgeMm", type: "number", positiveOnly: true },
        { name: "childExternalLegMm", type: "number", positiveOnly: true },
        { name: "externalLengthMm", type: "number", positiveOnly: true },
      ],
      enabled: (s) => s.features.length > 0,
      execute: (state, params) => {
        const nodeId = String(params.nodeId);
        const found = state.features.some((f) => f.id === nodeId);
        if (!found) throw new Error(`Etapa ${nodeId} não encontrada na timeline`);
        const rule = state.sheetMetalBody?.rule ?? DEFAULT_SHEET_METAL_RULES[4]!;
        if (
          params.targetAngleDeg !== undefined ||
          params.innerRadiusMm !== undefined ||
          params.kFactor !== undefined
        ) {
          const check = validateBendInputs({
            angleDeg: Number(params.targetAngleDeg ?? 90),
            thicknessMm: rule.thicknessMm,
            innerRadiusMm: Number(params.innerRadiusMm ?? rule.innerRadiusMm),
            kFactor: Number(params.kFactor ?? rule.kFactor),
          });
          if (!check.ok) throw new Error(check.error);
        }
        const nextFeatures = state.features.map((f) => {
          if (f.id !== nodeId) return f;
          const nextParams = { ...f.params };
          for (const key of [
            "heightMm",
            "widthMm",
            "depthMm",
            "radiusMm",
            "diameterMm",
            "distanceFromEdgeMm",
            "childExternalLegMm",
            "externalLengthMm",
          ]) {
            if (params[key] !== undefined) {
              const check = sanitizeNumericInput(params[key], { positiveOnly: true, label: key });
              if (!check.ok) throw new Error(check.error);
              nextParams[key] = check.value;
            }
          }
          if (params.targetAngleDeg !== undefined) {
            nextParams.targetAngleDeg = Number(params.targetAngleDeg);
          }
          if (params.innerRadiusMm !== undefined) {
            nextParams.innerRadiusMm = Number(params.innerRadiusMm);
          }
          if (params.kFactor !== undefined) {
            nextParams.kFactor = Number(params.kFactor);
          }
          if (params.direction === "UP" || params.direction === "DOWN") {
            nextParams.direction = params.direction;
          }
          if (typeof params.angleExpression === "string") {
            nextParams.angleExpression = params.angleExpression;
          }
          const nextName =
            (f.type === "sheetFold" || f.type === "sheetEdgeFlange") && params.targetAngleDeg !== undefined
              ? `${f.type === "sheetFold" ? "Dobrar" : "Aba"} ${Number(params.targetAngleDeg).toFixed(1)}° ${((nextParams.direction as string) ?? "UP") === "UP" ? "CIMA" : "BAIXO"}`
              : f.name;
          return { ...f, name: nextName, params: nextParams };
        });
        return rebuild({ ...state, features: nextFeatures });
      },
    },
    {
      id: "timeline.suppress",
      label: "Suprimir / Reativar Etapa",
      group: "timeline",
      schema: [
        { name: "nodeId", type: "string", required: true },
        { name: "suppressed", type: "boolean", required: true },
      ],
      enabled: (s) => s.features.length > 0,
      execute: (state, params) => {
        const nodeId = String(params.nodeId);
        const nextFeatures = state.features.map((f) =>
          f.id === nodeId ? { ...f, suppressed: Boolean(params.suppressed) } : f,
        );
        return rebuild({ ...state, features: nextFeatures });
      },
    },
    {
      id: "timeline.rollback",
      label: "Mover Marcador de Rollback",
      group: "timeline",
      schema: [{ name: "rollbackIndex", type: "number", min: 0 }],
      enabled: () => true,
      execute: (state, params) => {
        const idx = params.rollbackIndex === undefined ? null : Math.round(Number(params.rollbackIndex));
        return rebuild({ ...state, rollbackIndex: idx });
      },
    },
    {
      id: "timeline.reattachReference",
      label: "Re-associar Referência Topológica",
      group: "timeline",
      schema: [
        { name: "nodeId", type: "string", required: true },
        { name: "newFaceKey", type: "string", required: true },
      ],
      enabled: (s) => s.features.length > 0,
      execute: (state, params) => {
        const nodeId = String(params.nodeId);
        const newFaceKey = String(params.newFaceKey);
        const nextFeatures = state.features.map((f) =>
          f.id === nodeId ? { ...f, targetFaceKey: newFaceKey, missingReferenceWarning: undefined } : f,
        );
        return rebuild({ ...state, features: nextFeatures });
      },
    },
  ];

  for (const cmd of commands) {
    rawEngine.register(cmd);
  }

  const engine = {
    raw: rawEngine,
    getState: () => currentState,
    getCommandLog: () => rawEngine.getLog(),
    listCommands: (group?: Parameters<typeof rawEngine.listCommands>[0]) => rawEngine.listCommands(group),
    runSafeCommand: (commandId: string, params: Record<string, unknown>) => {
      const res = rawEngine.runSafeCommand(currentState, commandId, params);
      currentState = res.state;
      return res;
    },
    replayProject: (
      log: ReturnType<typeof rawEngine.getLog>,
      emptyState: ParametricDocumentState = createEmptyParametricDocument(currentState.densityKgM3),
    ) => {
      evaluator.clearCache();
      const res = rawEngine.replayProject(emptyState, log);
      if (res.ok) currentState = res.state;
      return { ...res, replayedCount: res.appliedCount };
    },
    undo: () => {
      const prev = rawEngine.undo(currentState);
      if (prev) currentState = prev;
      return prev;
    },
    redo: () => {
      const next = rawEngine.redo(currentState);
      if (next) currentState = next;
      return next;
    },
    createCheckpoint: (name: string) => rawEngine.createCheckpoint(name, currentState),
    listCheckpoints: () => rawEngine.listCheckpoints(),
    restoreCheckpoint: (id: string) => {
      const snap = rawEngine.restoreCheckpoint(id);
      if (snap) currentState = snap;
      return snap;
    },
    exportRecipeJSON: () => rawEngine.exportRecipeJSON(),
    parseRecipeJSON: (json: string) => rawEngine.parseRecipeJSON(json),
  };

  return { engine, evaluator };
}
