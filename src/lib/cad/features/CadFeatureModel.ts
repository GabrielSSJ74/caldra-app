/**
 * CALDRA CAD CORE — PARAMETRIC FEATURE TREE MODEL (SOLIDWORKS / SHAPR3D GRADE)
 *
 * Modelo de dados determinístico da árvore de recursos (Feature Tree / DAG),
 * Topologia Persistente Semântica (solução para o Topological Naming Problem),
 * Múltiplos Corpos (Multi-Body), Operações Booleanas Unificadas (NEW_BODY / ADD / CUT / INTERSECT),
 * Assistente de Furação ISO (Hole Wizard), Roscas (Cosmética vs. Helicoidal 3D),
 * Padrões Lineares/Circulares, Espelhamento e Restrições de Montagem (Mates).
 */

import type { CadShape } from "../core/CadShape";
import type { CadTessellatedShape } from "../core/CadMesh";
import type { MassProperties } from "../core/CadKernel";
import type { CadVector3D } from "../core/CadTopology";

export type CadFeatureState = "VALID" | "DIRTY" | "STALE" | "ERROR" | "SUPPRESSED";

export type CadBooleanMode = "new_body" | "union" | "cut" | "intersect";

export type CadFeatureType =
  // Referências e Esboços
  | "reference_plane"
  | "reference_axis"
  | "sketch_2d"
  // Primitivas Paramétricas Combináveis
  | "base_box"
  | "base_cylinder"
  | "base_cone"
  | "base_sphere"
  | "base_torus"
  | "base_polygon_prism"
  | "base_tube"
  // Recursos Geradores e Subtrativos (CRI)
  | "extrude_sketch"
  | "cut_extrude"
  | "revolve_feature"
  | "cut_revolve"
  | "sweep_feature"
  | "cut_sweep"
  | "loft_feature"
  // Furação, Rosca e Chaveta
  | "hole_cut"
  | "hole_wizard"
  | "thread_feature"
  | "slot_cut"
  // Acabamentos, Modificadores e Chapa (MOD)
  | "fillet"
  | "chamfer"
  | "shell"
  | "draft"
  | "rib"
  | "thicken"
  | "edge_flange"
  // Padrões, Simetria e Transformações (MOD)
  | "linear_pattern"
  | "circular_pattern"
  | "mirror_feature"
  | "transform"
  // Booleanas Explícitas entre Corpos
  | "boolean_cut"
  | "boolean_union"
  | "boolean_intersection"
  // Módulos Industriais Caldeiraria & Estruturas
  | "boilermaking_cone"
  | "boilermaking_transition"
  | "boilermaking_elbow"
  | "boilermaking_branch"
  | "boilermaking_hood"
  | "weldment_beam"
  | "weldment_frame";

// ==========================================
// TABELA VERIFICADA ISO MÉTRICA (DIN 13 / ISO 261)
// ==========================================
export type IsoThreadSize = "M3" | "M4" | "M5" | "M6" | "M8" | "M10" | "M12" | "M16" | "M20" | "M24" | "M30";

export type HoleWizardType = "simple" | "counterbore" | "countersink" | "tapped_iso";

export interface IsoMetricThreadSpec {
  designation: string;
  nominalDiameterMm: number;
  nominalDiameter: number;
  pitchMm: number;
  pitch: number;
  tapDrillDiameterMm: number;
  tapDrillDiameter: number;
  clearanceHoleMm: number;
  clearanceDiameter: number;
  counterboreDiaMm: number;
  counterboreDiameter: number;
  counterboreDepthMm: number;
  counterboreDepth: number;
}

export const ISO_METRIC_THREADS: Record<IsoThreadSize, IsoMetricThreadSpec> = {
  M3: { designation: "M3", nominalDiameterMm: 3, nominalDiameter: 3, pitchMm: 0.5, pitch: 0.5, tapDrillDiameterMm: 2.5, tapDrillDiameter: 2.5, clearanceHoleMm: 3.4, clearanceDiameter: 3.4, counterboreDiaMm: 6.0, counterboreDiameter: 6.0, counterboreDepthMm: 3.2, counterboreDepth: 3.2 },
  M4: { designation: "M4", nominalDiameterMm: 4, nominalDiameter: 4, pitchMm: 0.7, pitch: 0.7, tapDrillDiameterMm: 3.3, tapDrillDiameter: 3.3, clearanceHoleMm: 4.5, clearanceDiameter: 4.5, counterboreDiaMm: 8.0, counterboreDiameter: 8.0, counterboreDepthMm: 4.2, counterboreDepth: 4.2 },
  M5: { designation: "M5", nominalDiameterMm: 5, nominalDiameter: 5, pitchMm: 0.8, pitch: 0.8, tapDrillDiameterMm: 4.2, tapDrillDiameter: 4.2, clearanceHoleMm: 5.5, clearanceDiameter: 5.5, counterboreDiaMm: 9.5, counterboreDiameter: 9.5, counterboreDepthMm: 5.2, counterboreDepth: 5.2 },
  M6: { designation: "M6", nominalDiameterMm: 6, nominalDiameter: 6, pitchMm: 1.0, pitch: 1.0, tapDrillDiameterMm: 5.0, tapDrillDiameter: 5.0, clearanceHoleMm: 6.6, clearanceDiameter: 6.6, counterboreDiaMm: 11.0, counterboreDiameter: 11.0, counterboreDepthMm: 6.2, counterboreDepth: 6.2 },
  M8: { designation: "M8", nominalDiameterMm: 8, nominalDiameter: 8, pitchMm: 1.25, pitch: 1.25, tapDrillDiameterMm: 6.8, tapDrillDiameter: 6.8, clearanceHoleMm: 9.0, clearanceDiameter: 9.0, counterboreDiaMm: 14.5, counterboreDiameter: 14.5, counterboreDepthMm: 8.2, counterboreDepth: 8.2 },
  M10: { designation: "M10", nominalDiameterMm: 10, nominalDiameter: 10, pitchMm: 1.5, pitch: 1.5, tapDrillDiameterMm: 8.5, tapDrillDiameter: 8.5, clearanceHoleMm: 11.0, clearanceDiameter: 11.0, counterboreDiaMm: 17.5, counterboreDiameter: 17.5, counterboreDepthMm: 10.2, counterboreDepth: 10.2 },
  M12: { designation: "M12", nominalDiameterMm: 12, nominalDiameter: 12, pitchMm: 1.75, pitch: 1.75, tapDrillDiameterMm: 10.2, tapDrillDiameter: 10.2, clearanceHoleMm: 13.5, clearanceDiameter: 13.5, counterboreDiaMm: 20.0, counterboreDiameter: 20.0, counterboreDepthMm: 12.2, counterboreDepth: 12.2 },
  M16: { designation: "M16", nominalDiameterMm: 16, nominalDiameter: 16, pitchMm: 2.0, pitch: 2.0, tapDrillDiameterMm: 14.0, tapDrillDiameter: 14.0, clearanceHoleMm: 17.5, clearanceDiameter: 17.5, counterboreDiaMm: 26.0, counterboreDiameter: 26.0, counterboreDepthMm: 16.5, counterboreDepth: 16.5 },
  M20: { designation: "M20", nominalDiameterMm: 20, nominalDiameter: 20, pitchMm: 2.5, pitch: 2.5, tapDrillDiameterMm: 17.5, tapDrillDiameter: 17.5, clearanceHoleMm: 22.0, clearanceDiameter: 22.0, counterboreDiaMm: 33.0, counterboreDiameter: 33.0, counterboreDepthMm: 20.5, counterboreDepth: 20.5 },
  M24: { designation: "M24", nominalDiameterMm: 24, nominalDiameter: 24, pitchMm: 3.0, pitch: 3.0, tapDrillDiameterMm: 21.0, tapDrillDiameter: 21.0, clearanceHoleMm: 26.0, clearanceDiameter: 26.0, counterboreDiaMm: 40.0, counterboreDiameter: 40.0, counterboreDepthMm: 24.5, counterboreDepth: 24.5 },
  M30: { designation: "M30", nominalDiameterMm: 30, nominalDiameter: 30, pitchMm: 3.5, pitch: 3.5, tapDrillDiameterMm: 26.5, tapDrillDiameter: 26.5, clearanceHoleMm: 33.0, clearanceDiameter: 33.0, counterboreDiaMm: 50.0, counterboreDiameter: 50.0, counterboreDepthMm: 30.5, counterboreDepth: 30.5 },
};

// ==========================================
// DESCRITOR TOPOLÓGICO SEMÂNTICO PERSISTENTE
// ==========================================
export type CadSemanticRole =
  | "top_cap"
  | "bottom_cap"
  | "front_face"
  | "back_face"
  | "left_face"
  | "right_face"
  | "cylindrical_wall"
  | "hole_inner_cyl"
  | "inclined_face"
  | "custom_edge"
  | "datum_plane";

export interface CadSemanticTopologicalRef {
  id: string;
  kind: "face" | "edge" | "vertex" | "plane" | "axis";
  sourceFeatureId?: string;
  semanticRole: CadSemanticRole;
  fingerprint?: string;
  normal?: CadVector3D;
  centerOfMass?: CadVector3D;
  area?: number;
  length?: number;
  fallbackIndex?: number;
}

// ==========================================
// CORPOS SÓLIDOS (MULTI-BODY) & MONTAGENS (MATES)
// ==========================================
export interface CadBodyDescriptor {
  id: string;
  name: string;
  isActive: boolean;
  isVisible: boolean;
  material: string;
  color?: string;
  status: "valid" | "warning" | "error";
  featureIds: string[];
  shape?: CadShape | null;
  massProperties?: MassProperties | null;
}

export interface CadAssemblyMate {
  id: string;
  name: string;
  type: "COINCIDENT" | "CONCENTRIC" | "PARALLEL" | "PERPENDICULAR" | "DISTANCE" | "ANGLE" | "GEAR_RATIO";
  bodyAId: string;
  bodyBId: string;
  refA?: CadSemanticTopologicalRef;
  refB?: CadSemanticTopologicalRef;
  value?: number; // mm, deg ou razão Z2/Z1
  status: "SATISFIED" | "CONFLICT";
}

// ==========================================
// PARÂMETROS TIPADOS POR RECURSO
// ==========================================

export interface ReferencePlaneParams {
  basePlane: "XY" | "XZ" | "YZ" | "FACE";
  offsetMm: number;
  angleDeg?: number;
  normal?: CadVector3D;
  origin?: CadVector3D;
}

export interface ReferenceAxisParams {
  axisMode: "X" | "Y" | "Z" | "CYLINDER_CENTER" | "TWO_POINTS";
  origin: CadVector3D;
  direction: CadVector3D;
}

export interface Sketch2DParams {
  plane: "XY" | "XZ" | "YZ" | "FACE";
  profileType: "rectangle" | "circle" | "polygon" | "slot" | "l_profile" | "t_profile";
  width: number;
  height: number;
  radius?: number;
  sides?: number;
  wallThickness?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  constraintStatus?: "FULLY_CONSTRAINED" | "UNDER_CONSTRAINED" | "OVER_CONSTRAINED";
  points?: Array<{ x: number; y: number }>;
}

export interface BaseBoxParams {
  width: number; // X (mm)
  length: number; // Y (mm)
  height: number; // Z (mm)
  centered: boolean;
  operation?: CadBooleanMode;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

export interface BaseCylinderParams {
  radius: number; // mm
  height: number; // mm
  centered: boolean;
  operation?: CadBooleanMode;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

export interface BaseConeParams {
  radiusBottom: number;
  radiusTop: number;
  height: number;
  operation?: CadBooleanMode;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

export interface BaseSphereParams {
  radius: number;
  operation?: CadBooleanMode;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

export interface BaseTorusParams {
  majorRadius: number;
  minorRadius: number;
  operation?: CadBooleanMode;
  offsetZ?: number;
}

export interface BasePolygonPrismParams {
  sides: number; // ex: 6 para sextavado
  acrossFlatsOrRadius: number; // mm
  height: number; // mm
  operation?: CadBooleanMode;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

export interface BaseTubeParams {
  outerDiameter: number;
  wallThickness: number;
  height: number;
  operation?: CadBooleanMode;
  offsetZ?: number;
}

export interface ExtrudeSketchParams {
  depth: number; // mm
  symmetric?: boolean;
  direction?: "normal" | "inverted";
  endCondition?: "blind" | "midplane" | "through_all" | "up_to_face";
  draftAngleDeg?: number;
  thinWallThickness?: number;
  operation: CadBooleanMode;
  profileType?: "rectangle" | "circle" | "polygon" | "slot" | "l_profile";
  width?: number;
  length?: number;
  radius?: number;
  sides?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  plane?: "XY" | "XZ" | "YZ";
  isLinked2DSketch?: boolean;
  sketchFingerprint?: string;
  sourceEntityIds?: string[];
  sketchProfile?: {
    points: { x: number; y: number }[];
    circle?: { cx: number; cy: number; r: number };
    holes?: Array<{
      points: { x: number; y: number }[];
      circle?: { cx: number; cy: number; r: number };
    }>;
    multiContours?: Array<{
      points: { x: number; y: number }[];
      circle?: { cx: number; cy: number; r: number };
      holes?: Array<{
        points: { x: number; y: number }[];
        circle?: { cx: number; cy: number; r: number };
      }>;
    }>;
  };
}

export interface RevolveFeatureParams {
  profileType: "rectangle" | "circle" | "stepped_shaft" | "flange_section" | " pulley_groove";
  width: number; // espessura radial (mm)
  height: number; // altura axial (mm)
  innerRadius: number; // distância ao eixo de revolução (0 = sólido maciço)
  angleDeg: number; // 0 a 360°
  axis: "X" | "Y" | "Z";
  operation: CadBooleanMode;
  offsetZ?: number;
}

export interface SweepFeatureParams {
  profileShape: "circle" | "rectangle" | "polygon";
  profileRadiusOrWidth: number;
  profileHeight?: number;
  pathType: "line_arc_l" | "helix" | "s_curve";
  pathLengthOrRadius: number;
  pathHeightOrPitch?: number;
  turns?: number;
  operation: CadBooleanMode;
}

export interface LoftFeatureParams {
  bottomProfile: "rectangle" | "circle" | "polygon";
  bottomWidthOrDia: number;
  bottomLength?: number;
  topProfile: "circle" | "rectangle" | "polygon";
  topWidthOrDia: number;
  topLength?: number;
  height: number;
  ruled: boolean;
  operation: CadBooleanMode;
}

export interface HoleCutParams {
  holeType?: "simple" | "counterbore" | "countersink" | "tapped_iso";
  isoSize?: string; // "M3" .. "M30"
  diameter: number; // mm
  depth: number; // mm
  isThrough: boolean;
  bottomTipAngleDeg?: 118 | 180; // 118° ponta de broca ou 180° fundo reto
  counterboreDiameter?: number;
  counterboreDepth?: number;
  countersinkDiameter?: number;
  countersinkAngleDeg?: 82 | 90 | 100;
  threadMode?: "none" | "cosmetic" | "modeled";
  threadPitch?: number;
  position: { x: number; y: number; z?: number };
  positions?: Array<{ x: number; y: number; z?: number }>;
  axis?: "Z" | "X" | "Y";
  targetFaceIndex?: number;
  targetFaceFingerprint?: string;
}

export interface ThreadFeatureParams {
  mode: "cosmetic" | "modeled";
  isInternal: boolean;
  isoDesignation: string; // ex: "M12"
  nominalDiameter: number; // mm
  pitch: number; // mm
  length: number; // mm
  leftHanded?: boolean;
  positionZ?: number;
}

export interface SlotCutParams {
  slotType: "oblong_through" | "keyway_external" | "keyway_internal";
  width: number; // largura da chaveta/rasgo b (mm)
  length: number; // comprimento entre centros L (mm)
  depth: number; // profundidade t (mm)
  position: { x: number; y: number; z: number };
  axis?: "X" | "Y" | "Z";
}

export interface FilletParams {
  radius: number; // mm
  edgeIndices: number[];
  edgeFingerprints?: string[];
}

export interface ChamferParams {
  distance: number; // mm
  distance2?: number; // mm (para modo two_distances)
  angleDeg?: number; // graus (para modo distance_angle)
  chamferMode?: "symmetric" | "two_distances" | "distance_angle";
  edgeIndices: number[];
  edgeFingerprints?: string[];
}

export interface ShellParams {
  thickness: number; // mm
  faceIndices: number[];
  direction?: "inward" | "outward";
}

export interface RibParams {
  thickness: number; // espessura da nervura (mm)
  width: number; // extensão horizontal (mm)
  height: number; // extensão vertical (mm)
  plane: "XZ" | "YZ";
  offset: number; // deslocamento em relação à origem (mm)
}

export interface DraftParams {
  angleDeg: number;
  faceIndices?: number[];
  pullDirection?: "Z" | "X" | "Y";
}

export interface ThickenParams {
  thickness: number; // mm
}

export interface EdgeFlangeParams {
  edgePosition: "front" | "back" | "left" | "right";
  flangeLength: number; // mm
  angleDeg: number; // ex: 90°
  thickness: number; // mm
  bendRadius: number; // mm
  kFactor: number; // ex: 0.44
}

export interface LinearPatternParams {
  targetFeatureId?: string;
  direction1: { x: number; y: number; z: number };
  count1: number;
  spacing1: number; // mm
  direction2?: { x: number; y: number; z: number };
  count2?: number;
  spacing2?: number; // mm
  skipInstances?: number[];
}

export interface CircularPatternParams {
  targetFeatureId?: string;
  axis: "Z" | "X" | "Y";
  center: { x: number; y: number; z: number };
  count: number;
  totalAngleDeg: number; // ex: 360°
  equalSpacing: boolean;
  radiusOffset?: number;
}

export interface MirrorFeatureParams {
  targetFeatureId?: string;
  mirrorEntireBody?: boolean;
  mirrorPlane: "YZ" | "XZ" | "XY";
  planeOffset?: number;
  mergeSolids: boolean;
}

export interface TransformParams {
  dx: number;
  dy: number;
  dz: number;
  rx?: number; // deg
  ry?: number;
  rz?: number;
}

export interface WeldmentBeamParams {
  profileDesignation: string;
  profileType: "I_BEAM" | "U_CHANNEL" | "L_ANGLE" | "RECT_TUBE" | "ROUND_TUBE" | "FLAT_BAR";
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  linearMassKgM: number;
  miterLeftDeg?: number;
  miterRightDeg?: number;
}

export interface WeldmentFrameParams {
  frameName: string;
  profileDesignation: string;
  frameWidthMm: number;
  frameLengthMm: number;
  frameHeightMm?: number;
  cornerTreatment: "MITER" | "BUTT_1" | "BUTT_2";
  totalMassKg?: number;
}

export interface BoilermakingConeParams {
  D: number;
  d: number;
  height: number;
  thickness: number;
  ex?: number;
  ey?: number;
  material?: string;
}

export interface BoilermakingTransitionParams {
  width: number;
  length: number;
  diameter: number;
  height: number;
  thickness: number;
  ex?: number;
  ey?: number;
  material?: string;
}

export interface BoilermakingElbowParams {
  diameter: number;
  radius: number;
  angleDeg: number;
  segments: number;
  thickness: number;
  material?: string;
}

export interface BoilermakingBranchParams {
  mainDiameter: number;
  branchDiameter: number;
  mainLength: number;
  branchHeight: number;
  thickness: number;
  material?: string;
}

export interface BoilermakingHoodParams {
  baseDiameter: number;
  topDiameter: number;
  height: number;
  thickness: number;
  material?: string;
}

export type CadFeatureParams =
  | ReferencePlaneParams
  | ReferenceAxisParams
  | Sketch2DParams
  | BaseBoxParams
  | BaseCylinderParams
  | BaseConeParams
  | BaseSphereParams
  | BaseTorusParams
  | BasePolygonPrismParams
  | BaseTubeParams
  | ExtrudeSketchParams
  | RevolveFeatureParams
  | SweepFeatureParams
  | LoftFeatureParams
  | HoleCutParams
  | ThreadFeatureParams
  | SlotCutParams
  | FilletParams
  | ChamferParams
  | ShellParams
  | RibParams
  | DraftParams
  | ThickenParams
  | EdgeFlangeParams
  | LinearPatternParams
  | CircularPatternParams
  | MirrorFeatureParams
  | TransformParams
  | WeldmentBeamParams
  | WeldmentFrameParams
  | BoilermakingConeParams
  | BoilermakingTransitionParams
  | BoilermakingElbowParams
  | BoilermakingBranchParams
  | BoilermakingHoodParams
  | Record<string, unknown>;

export interface CadFeatureInput {
  id?: string;
  name: string;
  type: CadFeatureType;
  parameters: CadFeatureParams;
  bodyId?: string;
  dependencies?: string[];
  dependsOn?: string[];
  references?: string[];
  semanticReferences?: CadSemanticTopologicalRef[];
  semanticRefs?: any[];
  isSuppressed?: boolean;
}

export interface CadFeatureNode {
  id: string;
  name: string;
  type: CadFeatureType;
  order: number;
  state: CadFeatureState;
  status?: CadFeatureState;
  isSuppressed: boolean;
  bodyId?: string;
  parameters: CadFeatureParams;

  // Dependências no grafo DAG
  dependencies: string[]; // IDs de features anteriores das quais esta depende
  dependents?: string[]; // IDs de features posteriores que dependem desta
  references: string[]; // Fingerprints ou referências topológicas
  semanticReferences?: CadSemanticTopologicalRef[];

  // Metadados cosméticos (ex: indicação de rosca ISO para Prancha 2D / Inspeção)
  cosmeticMetadata?: {
    threadDesignation?: string;
    threadPitchMm?: number;
    threadLengthMm?: number;
    isInternalThread?: boolean;
  };

  // Cache intermediário do resultado avaliado pelo Kernel OCCT
  cachedShape?: CadShape;
  cachedToolShape?: CadShape; // Sólido ferramental individual (usado por Linear/Circular Pattern e Mirror)
  cachedTessellation?: CadTessellatedShape;
  cachedMass?: MassProperties;
  errorMessage?: string;
  warningMessage?: string;
  executionTimeMs?: number;
}

export interface CadTreeRebuildResult {
  success: boolean;
  activeShape: CadShape | null;
  tessellation: CadTessellatedShape | null;
  massProperties: MassProperties | null;
  features: CadFeatureNode[];
  bodies?: CadBodyDescriptor[];
  mates?: CadAssemblyMate[];
  rebuiltCount: number;
  recomputedCount: number;
  cachedCount: number;
  durationMs: number;
  totalExecutionTimeMs: number;
  error?: string;
  errors: string[];
}

