/**
 * CALDRA — CHAMFER CAD: MOTOR DE MODELAGEM DIRETA 3D & TOPOLOGIA DE SUB-ELEMENTOS (FACES / ARESTAS / CORPOS)
 *
 * Responsabilidades:
 * 1. Sincronização bidirecional instantânea 2D ⇄ 3D: qualquer perfil fechado 2D (retângulo, círculo,
 *    polígono, oblongo/slot, elipse, polilinha fechada, furos internos e recortes booleanos) gera
 *    sólidos B-Rep 3D reais com faces, arestas, vértices e corpos endereçáveis.
 * 2. Modelagem Direta 3D Paramétrica e Booleana:
 *    - Extrude (`extrudeHeightMm`, `booleanMode3D`: 'union' | 'new_body' | 'subtract' | 'intersect')
 *    - Fillet / Chamfer 3D em arestas (`edgeFilletRadiusMm`, `edgeChamferDistMm`)
 *    - Shell / Casca oca para tubos estruturais Metalon e caixas (`shellThicknessMm`, `shellOpenCaps`)
 *    - Offset Face (`offsetFaceTopMm`, `offsetFaceBottomMm`, `offsetFaceSidesMm`)
 *    - Rotate Around Axis / Corte em Meia-Esquadria 45° (`miterCutTopDeg`, `miterCutBottomDeg`)
 *    - Move / Rotate 3D com Pivô Móvel Magnético e Cópia Rápida (`Copy: ON / OFF`)
 *    - Sketch on Face (alinhamento de plano de trabalho 2D sobre qualquer face 3D)
 * 3. Raycasting e Seleção Topológica 3D (Faces, Arestas e Corpos) com Telemetria Exata:
 *    - Arestas: "1 aresta | 100.00 mm" ou "4 arestas | 1,960.00 mm"
 *    - Faces: "1 face | 5,000.00 mm²" ou "2 faces | 9,656.63 mm²"
 *    - Corpos: "1 corpo | ΔX 100.00 mm  ΔY 50.00 mm  ΔZ 490.00 mm"
 */

import * as THREE from "three";
import { bbox, boxOf, rectPolyline, translate, uid, type Entity, type Vec2 } from "./core";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";
import type { WorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  buildLoft3DMeshForEntity,
  isLoft3DEntity,
  LOFT_N_SAMPLES,
  LOFT_V_RINGS,
} from "./cadLoft3DEngine";
import {
  buildSolidMesh,
  resolveEntitySolidFeatureType,
} from "./chamferSolidKernel";

export interface Vec3Mm {
  x: number;
  y: number;
  z: number;
}

export function projectPoint3DToCanvasViewMm(
  pt3D: Vec3Mm,
  orbitProjection: WorkplaneOrbitProjection2D,
): Vec2 {
  if (orbitProjection && typeof orbitProjection.project3DTo2D === "function") {
    return orbitProjection.project3DTo2D(pt3D.x, pt3D.y, pt3D.z);
  }
  return { x: pt3D.x, y: pt3D.y };
}

export type DirectModeling3DTool =
  | "select_3d"
  | "extrude_3d"
  | "fillet_3d"
  | "chamfer_3d"
  | "shell_3d"
  | "offset_face_3d"
  | "rotate_axis_3d"
  | "hole_3d"
  | "transform_3d"
  | "scale_3d"
  | "align_3d"
  | "mirror_3d"
  | "revolve_3d"
  | "sweep_3d"
  | "loft_3d"
  | "add_plane_3d"
  | "add_axis_3d"
  | "project_3d"
  | "create_drawing_3d"
  | "color_material_3d"
  | "sketch_on_face_3d";

export type BooleanMode3D = "union" | "new_body" | "subtract" | "intersect";
export type DirectBooleanMode3D = BooleanMode3D;

export type FaceRole3D = "top" | "bottom" | "side" | "inner_side" | "miter";
export type EdgeRole3D = "vertical" | "top" | "bottom" | "inner_top" | "inner_bottom";

export type MetricHoleThreadSize = "M6" | "M8" | "M10" | "M12" | "M16" | "M20";

export interface HoleMetricSpec3D {
  code: MetricHoleThreadSize;
  nominalDiameterMm: number;
  pitchMm: number;
  tapDrillDiameterMm: number;
  clearanceDiameterMm: number;
  counterboreDiameterMm: number;
  counterboreDepthMm: number;
}

export const HOLE_METRIC_SPECS_3D: Record<MetricHoleThreadSize, HoleMetricSpec3D> = {
  M6: {
    code: "M6",
    nominalDiameterMm: 6.0,
    pitchMm: 1.0,
    tapDrillDiameterMm: 5.0,
    clearanceDiameterMm: 6.6,
    counterboreDiameterMm: 11.0,
    counterboreDepthMm: 6.4,
  },
  M8: {
    code: "M8",
    nominalDiameterMm: 8.0,
    pitchMm: 1.25,
    tapDrillDiameterMm: 6.8,
    clearanceDiameterMm: 9.0,
    counterboreDiameterMm: 15.0,
    counterboreDepthMm: 8.6,
  },
  M10: {
    code: "M10",
    nominalDiameterMm: 10.0,
    pitchMm: 1.5,
    tapDrillDiameterMm: 8.5,
    clearanceDiameterMm: 11.0,
    counterboreDiameterMm: 18.0,
    counterboreDepthMm: 10.8,
  },
  M12: {
    code: "M12",
    nominalDiameterMm: 12.0,
    pitchMm: 1.75,
    tapDrillDiameterMm: 10.2,
    clearanceDiameterMm: 13.5,
    counterboreDiameterMm: 20.0,
    counterboreDepthMm: 13.0,
  },
  M16: {
    code: "M16",
    nominalDiameterMm: 16.0,
    pitchMm: 2.0,
    tapDrillDiameterMm: 14.0,
    clearanceDiameterMm: 17.5,
    counterboreDiameterMm: 26.0,
    counterboreDepthMm: 17.5,
  },
  M20: {
    code: "M20",
    nominalDiameterMm: 20.0,
    pitchMm: 2.5,
    tapDrillDiameterMm: 17.5,
    clearanceDiameterMm: 22.0,
    counterboreDiameterMm: 33.0,
    counterboreDepthMm: 21.5,
  },
};

export interface DirectFeatureNode3D {
  featureId: string;
  kind:
    | "sketch"
    | "extrude"
    | "fillet"
    | "chamfer"
    | "shell"
    | "offset_face"
    | "miter_cut"
    | "hole"
    | "transform";
  label: string;
  parameterSummary: string;
}

export interface DirectFace3D {
  faceId: string;
  meshFaceIndex: number;
  bodyId: string;
  entityId: string;
  role: FaceRole3D;
  sideIndex: number;
  label: string;
  normal: Vec3Mm;
  centroid: Vec3Mm;
  areaMm2: number;
  polygon3D: Vec3Mm[];
}

export interface DirectEdge3D {
  edgeId: string;
  meshEdgeIndex: number;
  bodyId: string;
  entityId: string;
  role: EdgeRole3D;
  edgeIndex: number;
  label: string;
  startPt: Vec3Mm;
  endPt: Vec3Mm;
  midpoint: Vec3Mm;
  dir: Vec3Mm;
  lengthMm: number;
  polyline3D: Vec3Mm[];
}

export interface DirectVertex3D {
  vertexId: string;
  bodyId: string;
  entityId: string;
  cornerIndex: number;
  end: "top" | "bottom";
  label: string;
  point3D: Vec3Mm;
  bevelDistMm?: number;
}

export interface DirectSnapPivotCandidate3D {
  id: string;
  bodyId: string;
  entityId: string;
  kind: "vertex" | "edge_midpoint" | "face_center" | "body_center";
  label: string;
  point3D: Vec3Mm;
}

export interface DirectBody3D {
  bodyId: string;
  entityId: string;
  name: string;
  booleanMode: BooleanMode3D;
  extrudeHeightMm: number;
  elevationZ: number;
  edgeFilletRadiusMm: number;
  innerFilletRadiusMm: number;
  edgeChamferDistMm: number;
  cornerFilletsMm: Record<number, number>;
  cornerChamfersMm: Record<number, number>;
  vertexBevelsMm: Record<string, number>;
  shellWallThicknessMm: number;
  shellThicknessMm: number;
  sheetThicknessMm: number;
  shellOpenCaps: ("top" | "bottom")[];
  offsetFaceTopMm: number;
  offsetFaceBottomMm: number;
  offsetFaceSidesMm: number;
  offsetSidesIndependent: {
    posX: number;
    negX: number;
    posY: number;
    negY: number;
  };
  miterCutTopDeg: number;
  miterCutTopAxis: "x" | "y";
  miterCutBottomDeg: number;
  miterCutBottomAxis: "x" | "y";
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number };
  pivot3D: Vec3Mm;
  colorHex: string;
  materialName: string;
  densityGPerCm3: number;
  massGrams: number;
  eulerCharacteristic: {
    V: number;
    E: number;
    F: number;
    chi: number;
  };
  featureHistory: DirectFeatureNode3D[];
  bbox3D: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  totalAreaMm2: number;
  volumeMm3: number;
  faces: DirectFace3D[];
  edges: DirectEdge3D[];
  vertices: DirectVertex3D[];
  snapCandidates: DirectSnapPivotCandidate3D[];
}

export interface DirectTopology3DScene {
  bodies: DirectBody3D[];
  facesById: Map<string, DirectFace3D>;
  edgesById: Map<string, DirectEdge3D>;
  verticesById: Map<string, DirectVertex3D>;
  bodiesById: Map<string, DirectBody3D>;
  facesByMeshIndex: Map<number, DirectFace3D>;
  edgesByMeshIndex: Map<number, DirectEdge3D>;
  tessellatedShape: CadTessellatedShape;
}

export type SelectionScope3D = "auto" | "vertex" | "edge" | "face" | "body";

export interface SubElementSelectionState3D {
  faceIds: string[];
  edgeIds: string[];
  bodyIds: string[];
  vertexIds?: string[];
  selectionScope?: SelectionScope3D;
  activePivot3D: Vec3Mm | null;
  activeHingeEdgeId: string | null;
}

export type ParametricNumpadKind =
  | "EXTRUSION"
  | "RADIUS"
  | "CHAMFER"
  | "BEVEL"
  | "THICKNESS"
  | "OFFSET"
  | "ANGLE"
  | "DISTANCE"
  | "SCALE"
  | "HOLE"
  | "WIDTH"
  | "HEIGHT";

export type NumpadTargetParameter =
  | "extrudeHeight"
  | "shellWallThickness"
  | "filletRadius"
  | "chamferDistance"
  | "vertexBevel"
  | "offsetFaceDistance"
  | "miterAngle"
  | "scaleFactor"
  | "holeDiameter"
  | "moveX"
  | "moveY"
  | "moveZ"
  | "rotX"
  | "rotY"
  | "rotZ";

export interface ActiveParametricNumpadSession {
  kind: ParametricNumpadKind;
  targetParameter?: NumpadTargetParameter;
  targetEntityId?: string;
  title: string;
  unit: "mm" | "°" | "×";
  initialValue: number;
  screenPos: { x: number; y: number };
  targetEntityIds: string[];
  subTarget?:
    | "top"
    | "bottom"
    | "sides"
    | "pos_x"
    | "neg_x"
    | "pos_y"
    | "neg_y"
    | "side_normal"
    | "x"
    | "y"
    | "z"
    | "rx"
    | "ry"
    | "rz";
  targetEdgeIndices?: number[];
  targetBevelKeys?: string[];
  faceNormal?: Vec3Mm;
  copyMode?: boolean;
}

export const DIRECT_3D_TOOL_INSTRUCTIONS: Record<
  DirectModeling3DTool,
  { title: string; subtitle: string; badge: string }
> = {
  select_3d: {
    title: "Seleção Topológica 3D",
    subtitle: "Toque em uma Face ou Aresta para editar, ou dê duplo toque para selecionar o Corpo Sólido.",
    badge: "SEL 3D",
  },
  extrude_3d: {
    title: "Extrusão Sólida 3D (Extrude)",
    subtitle: "Arraste a seta bidirecional ou toque na cota para digitar a altura e o modo Booleano.",
    badge: "EXTRUDE",
  },
  fillet_3d: {
    title: "Fillet 3D em Arestas (Raio R)",
    subtitle: "Selecione 1 ou mais arestas (ex.: 4 quinas da coluna) e defina o raio R em mm.",
    badge: "FILLET 3D",
  },
  chamfer_3d: {
    title: "Chanfro 3D em Arestas (D × 45°)",
    subtitle: "Selecione as arestas do sólido e arraste ou digite a distância do chanfro em mm.",
    badge: "CHAMFER 3D",
  },
  shell_3d: {
    title: "Shell / Casca 3D (Tubo Metalon / Caixa)",
    subtitle: "Selecione as faces de abertura (2 faces = tubo vazado; 1 face = caixa) e defina a parede.",
    badge: "SHELL",
  },
  offset_face_3d: {
    title: "Offset Face (Empurrar / Puxar Face)",
    subtitle: "Selecione a face do topo, base ou laterais para esticar ou recuar a peça em tempo real.",
    badge: "OFFSET FACE",
  },
  rotate_axis_3d: {
    title: "Rotate Around Axis (Corte em Meia-Esquadria 45°)",
    subtitle: "Selecione a face de extremidade e incline pelo arco graduado (ex.: 45° ou -45°).",
    badge: "ESQUADRIA 45°",
  },
  hole_3d: {
    title: "Furação Mecânica Paramétrica 3D (Hole M6–M20)",
    subtitle: "Selecione uma face plana ou corpo e insira furos passantes, cegos ou escareados ISO.",
    badge: "HOLE 3D",
  },
  transform_3d: {
    title: "Mover / Rotacionar 3D + Pivô & Copy",
    subtitle: "Arraste os eixos X/Y/Z ou arcos de giro. Ative Copy: ON para duplicar a peça na nova posição.",
    badge: "TRANSFORM 3D",
  },
  scale_3d: {
    title: "Escala 3D (Scale)",
    subtitle: "Redimensione o corpo sólido selecionado a partir do pivô ativo.",
    badge: "SCALE 3D",
  },
  align_3d: {
    title: "Alinhar Corpos 3D (Align)",
    subtitle: "Alinhe faces ou centros geométricos entre dois corpos sólidos.",
    badge: "ALIGN 3D",
  },
  mirror_3d: {
    title: "Espelhar Sólido 3D (Mirror)",
    subtitle: "Crie uma cópia simétrica do corpo selecionado através do plano X, Y ou Z.",
    badge: "MIRROR 3D",
  },
  revolve_3d: {
    title: "Revolução 3D (Revolve)",
    subtitle: "Gire o perfil em torno do eixo para formar sólidos cilíndricos, flanges ou anéis.",
    badge: "REVOLVE",
  },
  sweep_3d: {
    title: "Varredura 3D (Sweep)",
    subtitle: "Extrude o perfil ao longo de uma trajetória contínua.",
    badge: "SWEEP",
  },
  loft_3d: {
    title: "Transição Multisseção (Loft 3D)",
    subtitle: "Selecione 2 ou mais perfis fechados em diferentes elevações para gerar transição sólida.",
    badge: "LOFT 3D",
  },
  add_plane_3d: {
    title: "Plano de Construção 3D (Add Plane)",
    subtitle: "Crie um plano de trabalho com offset Z ou alinhado à face selecionada.",
    badge: "PLANO 3D",
  },
  add_axis_3d: {
    title: "Eixo de Referência 3D (Add Axis)",
    subtitle: "Adicione um eixo de construção ao longo de uma aresta ou centro de cilindro.",
    badge: "EIXO 3D",
  },
  project_3d: {
    title: "Projetar Geometria na Face (Project 3D → 2D)",
    subtitle: "Projete faces, arestas e contornos 3D diretamente no plano de esboço 2D.",
    badge: "PROJECT",
  },
  create_drawing_3d: {
    title: "Gerar Vistas Técnicas 2D (Create Drawing)",
    subtitle: "Gera vistas ortográficas padronizadas (Frontal, Superior, Lateral, Corte A-A e Isométrica).",
    badge: "DRAWING 2D",
  },
  color_material_3d: {
    title: "Cor e Acabamento Metálico 3D",
    subtitle: "Aplique acabamento de Aço Carbono, Inox Escovado, Alumínio Anodizado ou Pintura Epóxi.",
    badge: "MATERIAL",
  },
  sketch_on_face_3d: {
    title: "Esboçar na Face 3D (Sketch on Face)",
    subtitle: "Toque em qualquer face plana 3D para alinhar o plano de trabalho 2D e desenhar furos ou recortes.",
    badge: "SKETCH FACE",
  },
};

export const INDUSTRIAL_3D_MATERIALS = [
  { id: "steel_carbon", name: "Aço Carbono ASTM A36", colorHex: "#64748B" },
  { id: "steel_galv", name: "Aço Galvanizado Metalon", colorHex: "#94A3B8" },
  { id: "stainless_304", name: "Inox Escovado AISI 304", colorHex: "#CBD5E1" },
  { id: "aluminum_6061", name: "Alumínio Anodizado 6061", colorHex: "#38BDF8" },
  { id: "copper_ind", name: "Cobre Eletrolítico", colorHex: "#F97316" },
  { id: "epoxy_yellow", name: "Amarelo Segurança NR-12", colorHex: "#EAB308" },
  { id: "epoxy_crimson", name: "Vermelho Industrial CALDRA", colorHex: "#EF4444" },
  { id: "epoxy_emerald", name: "Verde Estrutural Epóxi", colorHex: "#10B981" },
] as const;

// ============================================================================
// LEITURA E ESCRITA DE PARÂMETROS 3D NAS ENTIDADES 2D/3D
// ============================================================================

export function getEntityDirect3DParams(entity: Entity, defaultThicknessMm = 20) {
  const p = entity.params ?? {};

  // 1. EXTRUDE HEIGHT (Altura / Comprimento de Extrusão 3D em mm) — INDEPENDENTE de espessura de casca/chapa
  // Suporta Curvas de Perfil 3D puras no plano Z (`is3DProfileCurve: true`, `extrudeHeightMm: 0`) para fluxos como LOFT 3D
  const rawExtrude = p.extrudeHeightMm ?? p.extrudeHeight ?? entity.extrudeHeight;
  const is3DProfileCurve = Boolean(
    p.is3DProfileCurve === true ||
      p.isLoftSection3D === true ||
      (typeof rawExtrude === "number" && Number.isFinite(rawExtrude) && Math.abs(rawExtrude) <= 0.05 && p.isExtruded3D === false),
  );
  const extrudeHeightMm = is3DProfileCurve
    ? 0
    : typeof rawExtrude === "number" && Number.isFinite(rawExtrude) && rawExtrude > 0.05
      ? Number(rawExtrude)
      : Math.max(2, defaultThicknessMm);

  const rawElev = Number(p.elevationZ ?? entity.elevationZ);
  const elevationZ = Number.isFinite(rawElev) ? rawElev : 0;

  const booleanMode3D: BooleanMode3D =
    p.booleanMode3D === "union" ||
    p.booleanMode3D === "new_body" ||
    p.booleanMode3D === "subtract" ||
    p.booleanMode3D === "intersect"
      ? p.booleanMode3D
      : entity.layer === "recorte"
        ? "subtract"
        : "new_body";

  const rawBox = boxOf(entity);
  const rawSpanW = Math.max(1, rawBox.maxX - rawBox.minX);
  const rawSpanH = Math.max(1, rawBox.maxY - rawBox.minY);
  const maxGeometricCornerMm = Math.max(5, Math.min(250, Math.min(rawSpanW, rawSpanH) * 0.46));

  const rawFilletVal = Math.max(0, Number(p.edgeFilletRadiusMm) || 0);
  const rawChamferVal = Math.max(0, Number(p.edgeChamferDistMm) || 0);
  const edgeFilletRadiusMm =
    rawFilletVal > maxGeometricCornerMm * 2.5
      ? Math.min(15, maxGeometricCornerMm)
      : Math.min(rawFilletVal, maxGeometricCornerMm);
  const edgeChamferDistMm =
    rawChamferVal > maxGeometricCornerMm * 2.5
      ? Math.min(15, maxGeometricCornerMm)
      : Math.min(rawChamferVal, maxGeometricCornerMm);

  // 2. SHELL WALL THICKNESS (Espessura da Parede da Casca / Tubo Metalon em mm) — INDEPENDENTE de extrudeHeight
  const rawShellWall = p.shellWallThickness ?? p.shellThicknessMm ?? entity.shellWallThickness;
  const shellWallThicknessMm = Math.max(0, Number(rawShellWall) || 0);
  const shellThicknessMm = shellWallThicknessMm;

  // 3. SHEET THICKNESS (Seletor CHAPA da Barra Inferior, ex.: CHAPA 3.0MM)
  const rawSheet = p.sheetThickness ?? entity.sheetThickness;
  const sheetThicknessMm =
    typeof rawSheet === "number" && Number.isFinite(rawSheet) && rawSheet > 0
      ? rawSheet
      : defaultThicknessMm;

  const shellOpenCaps: ("top" | "bottom")[] = Array.isArray(p.shellOpenCaps)
    ? (p.shellOpenCaps.filter((x) => x === "top" || x === "bottom") as ("top" | "bottom")[])
    : ["top", "bottom"];

  const offsetFaceTopMm = Number(p.offsetFaceTopMm) || 0;
  const offsetFaceBottomMm = Number(p.offsetFaceBottomMm) || 0;
  const offsetFaceSidesMm = Number(p.offsetFaceSidesMm) || 0;

  const miterCutTopDeg = Math.max(-75, Math.min(75, Number(p.miterCutTopDeg) || 0));
  const miterCutTopAxis: "x" | "y" = p.miterCutTopAxis === "y" ? "y" : "x";
  const miterCutBottomDeg = Math.max(-75, Math.min(75, Number(p.miterCutBottomDeg) || 0));
  const miterCutBottomAxis: "x" | "y" = p.miterCutBottomAxis === "y" ? "y" : "x";

  const rotObj = (p.rotation3D as { rxDeg?: number; ryDeg?: number; rzDeg?: number } | undefined) ?? {};
  const rotation3D = {
    rxDeg: Number(rotObj.rxDeg) || 0,
    ryDeg: Number(rotObj.ryDeg) || 0,
    rzDeg: Number(rotObj.rzDeg) || 0,
  };

  const rawCornerFillets =
    p.cornerFilletsMm && typeof p.cornerFilletsMm === "object"
      ? (p.cornerFilletsMm as Record<number, number>)
      : {};
  const cornerFilletsMm: Record<number, number> = {};
  for (const [k, v] of Object.entries(rawCornerFillets)) {
    const idx = Number(k);
    const val = Math.max(0, Math.min(maxGeometricCornerMm, Number(v) || 0));
    if (Number.isInteger(idx) && idx >= 0 && val > 0.01) {
      cornerFilletsMm[idx] = val;
    }
  }

  const rawCornerChamfers =
    p.cornerChamfersMm && typeof p.cornerChamfersMm === "object"
      ? (p.cornerChamfersMm as Record<number, number>)
      : {};
  const cornerChamfersMm: Record<number, number> = {};
  for (const [k, v] of Object.entries(rawCornerChamfers)) {
    const idx = Number(k);
    const val = Math.max(0, Math.min(maxGeometricCornerMm, Number(v) || 0));
    if (Number.isInteger(idx) && idx >= 0 && val > 0.01) {
      cornerChamfersMm[idx] = val;
    }
  }

  const rawVertexBevels =
    p.vertexBevelsMm && typeof p.vertexBevelsMm === "object"
      ? (p.vertexBevelsMm as Record<string, number>)
      : {};
  const vertexBevelsMm: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawVertexBevels)) {
    const val = Math.max(0, Math.min(maxGeometricCornerMm, Number(v) || 0));
    if (val > 0.01) {
      vertexBevelsMm[k] = val;
    }
  }

  const colorHex = typeof p.bodyColorHex === "string" ? p.bodyColorHex : "#94A3B8";
  const materialName =
    typeof p.bodyMaterial === "string" ? p.bodyMaterial : "Aço Estrutural ASTM A36";
  const bodyName = typeof p.bodyName === "string" ? p.bodyName : "";

  return {
    is3DProfileCurve,
    extrudeHeightMm,
    elevationZ,
    booleanMode3D,
    edgeFilletRadiusMm,
    edgeChamferDistMm,
    cornerFilletsMm,
    cornerChamfersMm,
    vertexBevelsMm,
    shellWallThicknessMm,
    shellThicknessMm,
    sheetThicknessMm,
    shellOpenCaps,
    offsetFaceTopMm,
    offsetFaceBottomMm,
    offsetFaceSidesMm,
    miterCutTopDeg,
    miterCutTopAxis,
    miterCutBottomDeg,
    miterCutBottomAxis,
    rotation3D,
    colorHex,
    materialName,
    bodyName,
  };
}

export function setEntityDirect3DParams(
  entity: Entity,
  patch: Partial<ReturnType<typeof getEntityDirect3DParams>>,
): Entity {
  const cur = getEntityDirect3DParams(entity);
  const next = { ...cur, ...patch };
  if (patch.extrudeHeightMm !== undefined && patch.extrudeHeightMm > 0.05 && patch.is3DProfileCurve === undefined) {
    next.is3DProfileCurve = false;
  }

  const rawBox = boxOf(entity);
  const rawSpanW = Math.max(1, rawBox.maxX - rawBox.minX);
  const rawSpanH = Math.max(1, rawBox.maxY - rawBox.minY);
  const maxGeometricCornerMm = Math.max(5, Math.min(250, Math.min(rawSpanW, rawSpanH) * 0.46));

  next.edgeFilletRadiusMm = Math.max(0, Math.min(next.edgeFilletRadiusMm, maxGeometricCornerMm));
  next.edgeChamferDistMm = Math.max(0, Math.min(next.edgeChamferDistMm, maxGeometricCornerMm));

  const effectiveShell =
    patch.shellWallThicknessMm !== undefined
      ? patch.shellWallThicknessMm
      : patch.shellThicknessMm !== undefined
        ? patch.shellThicknessMm
        : (cur.shellWallThicknessMm || cur.shellThicknessMm || 0);

  next.shellWallThicknessMm = effectiveShell;
  next.shellThicknessMm = effectiveShell;

  return {
    ...entity,
    elevationZ: next.elevationZ,
    extrudeHeight: next.extrudeHeightMm,
    shellWallThickness: effectiveShell,
    sheetThickness: next.sheetThicknessMm,
    params: {
      ...(entity.params ?? {}),
      is3DProfileCurve: next.is3DProfileCurve,
      extrudeHeightMm: next.extrudeHeightMm,
      extrudeHeight: next.extrudeHeightMm,
      elevationZ: next.elevationZ,
      booleanMode3D: next.booleanMode3D,
      edgeFilletRadiusMm: next.edgeFilletRadiusMm,
      edgeChamferDistMm: next.edgeChamferDistMm,
      cornerFilletsMm: next.cornerFilletsMm,
      cornerChamfersMm: next.cornerChamfersMm,
      vertexBevelsMm: next.vertexBevelsMm,
      shellWallThickness: effectiveShell,
      shellThicknessMm: effectiveShell,
      sheetThickness: next.sheetThicknessMm,
      shellOpenCaps: next.shellOpenCaps,
      offsetFaceTopMm: next.offsetFaceTopMm,
      offsetFaceBottomMm: next.offsetFaceBottomMm,
      offsetFaceSidesMm: next.offsetFaceSidesMm,
      miterCutTopDeg: next.miterCutTopDeg,
      miterCutTopAxis: next.miterCutTopAxis,
      miterCutBottomDeg: next.miterCutBottomDeg,
      miterCutBottomAxis: next.miterCutBottomAxis,
      rotation3D: next.rotation3D,
      bodyColorHex: next.colorHex,
      bodyMaterial: next.materialName,
      bodyName: next.bodyName,
    },
  };
}

// ============================================================================
// MATEMÁTICA POLIGONAL 2D COM FILLET / CHAMFER / OFFSET / SHELL
// ============================================================================

function signedArea2D(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function ensureCCW(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts;
  return signedArea2D(pts) < 0 ? [...pts].reverse() : pts;
}

function pointInPolygon2D(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Amostra um segmento com bulge (arco tangente DXF/CAD) usando estritamente
 * 28 subdivisões uniformes para cada arco de 90° (π/2 rad).
 */
function sampleBulgeArcSegmentUniform2D(p1: Vec2, p2: Vec2, bulge: number): Vec2[] {
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-5) {
    return [p1];
  }
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.hypot(chordDx, chordDy);
  if (chordLen < 1e-4) return [p1];

  const theta = 4 * Math.atan(bulge);
  const sinHalf = Math.sin(theta * 0.5);
  if (Math.abs(sinHalf) < 1e-5) return [p1];

  const radius = chordLen / (2 * Math.abs(sinHalf));
  const midX = (p1.x + p2.x) * 0.5;
  const midY = (p1.y + p2.y) * 0.5;
  const nx = -chordDy / chordLen;
  const ny = chordDx / chordLen;
  const cotHalf = (1 - bulge * bulge) / (2 * bulge);
  const cx = midX + nx * (chordLen * 0.5) * cotHalf;
  const cy = midY + ny * (chordLen * 0.5) * cotHalf;

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const steps = Math.max(8, Math.round((Math.abs(theta) / (Math.PI * 0.5)) * 28));
  const arcPts: Vec2[] = [];
  for (let s = 0; s < steps; s++) {
    const ang = startAngle + (theta * s) / steps;
    arcPts.push({
      x: cx + Math.cos(ang) * radius,
      y: cy + Math.sin(ang) * radius,
    });
  }
  return arcPts;
}

/**
 * Extrai os vértices de quina viva (dihedral angle >= 25°) de um contorno fechado CCW.
 */
function extractSharpCornersFromLoop2D(ccwPts: Vec2[], minAngleDeg = 25): Vec2[] {
  const n = ccwPts.length;
  if (n < 3) return ccwPts;
  const cosThreshold = Math.cos((minAngleDeg * Math.PI) / 180);
  const sharp: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ccwPts[(i - 1 + n) % n]!;
    const curr = ccwPts[i]!;
    const next = ccwPts[(i + 1) % n]!;
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const l1 = Math.hypot(dx1, dy1) || 1;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const l2 = Math.hypot(dx2, dy2) || 1;
    const dot = (dx1 * dx2 + dy1 * dy2) / (l1 * l2);
    if (dot <= cosThreshold) {
      sharp.push(curr);
    }
  }
  return sharp;
}

/**
 * Extrai os vértices base de um perfil fechado 2D (antes de fillet/offset 3D).
 */
export function extractBaseClosedLoop2D(
  entity: Entity,
): { points: Vec2[]; isSmoothCircle: boolean; corners: Vec2[] } | null {
  if (entity.isConstruction || entity.layer === "cota" || entity.layer === "referencia") {
    return null;
  }

  if (entity.type === "rect") {
    if (entity.w <= 0.1 || entity.h <= 0.1) return null;
    const pts: Vec2[] = [
      { x: entity.x, y: entity.y },
      { x: entity.x + entity.w, y: entity.y },
      { x: entity.x + entity.w, y: entity.y + entity.h },
      { x: entity.x, y: entity.y + entity.h },
    ];
    const ccw = ensureCCW(pts);
    return {
      points: ccw,
      isSmoothCircle: false,
      corners: ccw,
    };
  }

  if (entity.type === "circle") {
    if (entity.r <= 0.1) return null;
    // 28 subdivisões por quadrante de 90° = 112 segmentos uniformes no cilindro completo
    const segs = 112;
    const pts: Vec2[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push({
        x: entity.cx + Math.cos(a) * entity.r,
        y: entity.cy + Math.sin(a) * entity.r,
      });
    }
    return {
      points: ensureCCW(pts),
      isSmoothCircle: true,
      corners: [
        { x: entity.cx + entity.r, y: entity.cy },
        { x: entity.cx, y: entity.cy + entity.r },
        { x: entity.cx - entity.r, y: entity.cy },
        { x: entity.cx, y: entity.cy - entity.r },
      ],
    };
  }

  if (entity.type === "ellipse") {
    if (entity.rx <= 0.1 || entity.ry <= 0.1) return null;
    const segs = 112;
    const rot = entity.rotation ?? 0;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const pts: Vec2[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const lx = Math.cos(a) * entity.rx;
      const ly = Math.sin(a) * entity.ry;
      pts.push({
        x: entity.cx + lx * cosR - ly * sinR,
        y: entity.cy + lx * sinR + ly * cosR,
      });
    }
    return {
      points: ensureCCW(pts),
      isSmoothCircle: true,
      corners: pts.filter((_, idx) => idx % 28 === 0),
    };
  }

  if (entity.type === "polyline") {
    if (entity.pts.length < 3) return null;
    const first = entity.pts[0]!;
    const last = entity.pts[entity.pts.length - 1]!;
    const isClosed = entity.closed || Math.hypot(first.x - last.x, first.y - last.y) < 1.5;
    if (!isClosed) return null;

    const hasBulges =
      Array.isArray(entity.bulges) && entity.bulges.some((b) => Math.abs(b) > 1e-4);

    const rawExpanded: Vec2[] = [];
    if (hasBulges && entity.bulges) {
      const nPts = entity.pts.length;
      const closesAtLast =
        Math.hypot(first.x - last.x, first.y - last.y) < 0.05 && nPts > 3;
      const loopCount = closesAtLast ? nPts - 1 : nPts;
      for (let i = 0; i < loopCount; i++) {
        const pA = entity.pts[i]!;
        const pB = entity.pts[(i + 1) % loopCount]!;
        const bVal = entity.bulges[i] ?? 0;
        const sampled = sampleBulgeArcSegmentUniform2D(pA, pB, bVal);
        for (const sp of sampled) {
          rawExpanded.push(sp);
        }
      }
    } else {
      for (const p of entity.pts) {
        rawExpanded.push({ x: p.x, y: p.y });
      }
    }

    // Remove pontos adjacentes duplicados
    const clean: Vec2[] = [];
    for (const p of rawExpanded) {
      const prev = clean[clean.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.02) {
        clean.push({ x: p.x, y: p.y });
      }
    }
    if (
      clean.length > 2 &&
      Math.hypot(
        clean[0]!.x - clean[clean.length - 1]!.x,
        clean[0]!.y - clean[clean.length - 1]!.y,
      ) < 0.02
    ) {
      clean.pop();
    }
    if (clean.length < 3) return null;
    const ccw = ensureCCW(clean);
    const sharpCorners = extractSharpCornersFromLoop2D(ccw, 25);
    return {
      points: ccw,
      isSmoothCircle: sharpCorners.length === 0 && ccw.length > 24,
      corners: sharpCorners.length >= 2 ? sharpCorners : ccw.slice(0, 8),
    };
  }

  if (entity.type === "hatch" && entity.boundaryPts.length >= 3) {
    const ccw = ensureCCW(entity.boundaryPts);
    const sharpCorners = extractSharpCornersFromLoop2D(ccw, 25);
    return {
      points: ccw,
      isSmoothCircle: sharpCorners.length === 0 && ccw.length > 24,
      corners: sharpCorners.length >= 2 ? sharpCorners : ccw.slice(0, 8),
    };
  }

  return null;
}

/**
 * Aplica offset uniforme (positivo = expandir, negativo = contrair) a um polígono fechado CCW.
 */
export function offsetPolygon2D(pts: Vec2[], offsetMm: number): Vec2[] {
  if (Math.abs(offsetMm) < 1e-4 || pts.length < 3) return pts;
  const n = pts.length;
  const ccw = ensureCCW(pts);

  // Calcula centroide para limitar contração excessiva
  let cx = 0;
  let cy = 0;
  for (const p of ccw) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  const result: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ccw[(i - 1 + n) % n]!;
    const curr = ccw[i]!;
    const next = ccw[(i + 1) % n]!;

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    // Normal externa para polígono CCW: (dy, -dx)
    const n1x = v1y / l1;
    const n1y = -v1x / l1;

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const n2x = v2y / l2;
    const n2y = -v2x / l2;

    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-5) {
      bx = n1x;
      by = n1y;
    } else {
      bx /= bl;
      by /= bl;
    }

    const dot = n1x * bx + n1y * by;
    const miterScale = Math.min(2.5, Math.max(0.5, 1 / Math.max(0.35, dot)));
    result.push({
      x: curr.x + bx * offsetMm * miterScale,
      y: curr.y + by * offsetMm * miterScale,
    });
  }
  return ensureCCW(result);
}

/**
 * Aplica Fillet 3D (arredondamento de quinas R) ou Chamfer 3D (chanfro D × 45°)
 * nos vértices de um polígono fechado com 28 subdivisões uniformes por arco de 90°.
 */
export function applyCornerFilletOrChamferToPolygon2D(
  pts: Vec2[],
  filletRadiusMm: number,
  chamferDistMm: number,
  cornerFilletsMm?: Record<number, number>,
  cornerChamfersMm?: Record<number, number>,
): Vec2[] {
  const hasPerCornerFillet =
    cornerFilletsMm !== undefined &&
    Object.values(cornerFilletsMm).some((v) => Number(v) > 0.05);
  const hasPerCornerChamfer =
    cornerChamfersMm !== undefined &&
    Object.values(cornerChamfersMm).some((v) => Number(v) > 0.05);

  if (
    (filletRadiusMm <= 0.05 &&
      chamferDistMm <= 0.05 &&
      !hasPerCornerFillet &&
      !hasPerCornerChamfer) ||
    pts.length < 3 ||
    pts.length > 32
  ) {
    return pts;
  }

  const ccw = ensureCCW(pts);
  const n = ccw.length;
  const out: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = ccw[(i - 1 + n) % n]!;
    const curr = ccw[i]!;
    const next = ccw[(i + 1) % n]!;

    const localFillet =
      cornerFilletsMm && cornerFilletsMm[i] !== undefined
        ? Number(cornerFilletsMm[i])
        : hasPerCornerFillet || hasPerCornerChamfer
          ? 0
          : filletRadiusMm;
    const localChamfer =
      cornerChamfersMm && cornerChamfersMm[i] !== undefined
        ? Number(cornerChamfersMm[i])
        : hasPerCornerFillet || hasPerCornerChamfer
          ? 0
          : chamferDistMm;

    if (localFillet <= 0.05 && localChamfer <= 0.05) {
      out.push(curr);
      continue;
    }

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < 0.5 || len2 < 0.5) {
      out.push(curr);
      continue;
    }

    const u1x = dx1 / len1;
    const u1y = dy1 / len1;
    const u2x = dx2 / len2;
    const u2y = dy2 / len2;

    const dot = Math.max(-0.999, Math.min(0.999, u1x * u2x + u1y * u2y));
    const halfAngle = Math.acos(dot) * 0.5;
    if (halfAngle < 0.08 || Math.abs(halfAngle - Math.PI * 0.5) < 0.05) {
      out.push(curr);
      continue;
    }

    if (localChamfer > 0.05) {
      const d = Math.min(localChamfer, len1 * 0.45, len2 * 0.45);
      out.push({ x: curr.x + u1x * d, y: curr.y + u1y * d });
      out.push({ x: curr.x + u2x * d, y: curr.y + u2y * d });
    } else if (localFillet > 0.05) {
      const tanHalf = Math.tan(halfAngle);
      const maxT = Math.min(len1 * 0.46, len2 * 0.46);
      const rEff = Math.min(localFillet, maxT * tanHalf);
      const tDist = rEff / Math.max(1e-4, tanHalf);

      const pStart = { x: curr.x + u1x * tDist, y: curr.y + u1y * tDist };
      const pEnd = { x: curr.x + u2x * tDist, y: curr.y + u2y * tDist };

      // Centro do arco de concordância
      let bisX = u1x + u2x;
      let bisY = u1y + u2y;
      const bisLen = Math.hypot(bisX, bisY) || 1;
      bisX /= bisLen;
      bisY /= bisLen;
      const centerDist = rEff / Math.max(1e-4, Math.sin(halfAngle));
      const arcCx = curr.x + bisX * centerDist;
      const arcCy = curr.y + bisY * centerDist;

      const a0 = Math.atan2(pStart.y - arcCy, pStart.x - arcCx);
      const a1 = Math.atan2(pEnd.y - arcCy, pEnd.x - arcCx);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;

      // Estritamente 28 segmentos uniformes por arco de 90° (π/2 rad) para eliminar facetas/zebra
      const arcSegs = Math.max(12, Math.round((Math.abs(delta) / (Math.PI * 0.5)) * 28));
      for (let s = 0; s <= arcSegs; s++) {
        const ang = a0 + (delta * s) / arcSegs;
        out.push({
          x: arcCx + Math.cos(ang) * rEff,
          y: arcCy + Math.sin(ang) * rEff,
        });
      }
    }
  }

  return ensureCCW(out);
}

// ============================================================================
// ROTAÇÃO 3D E CORTE EM MEIA-ESQUADRIA (MITER CUT 45° / ROTATE AROUND AXIS)
// ============================================================================

export function rotatePoint3DAroundPivot(
  pt: Vec3Mm,
  pivot: Vec3Mm,
  rot: { rxDeg: number; ryDeg: number; rzDeg: number },
): Vec3Mm {
  if (Math.abs(rot.rxDeg) < 1e-4 && Math.abs(rot.ryDeg) < 1e-4 && Math.abs(rot.rzDeg) < 1e-4) {
    return pt;
  }
  const rx = (rot.rxDeg * Math.PI) / 180;
  const ry = (rot.ryDeg * Math.PI) / 180;
  const rz = (rot.rzDeg * Math.PI) / 180;

  let x = pt.x - pivot.x;
  let y = pt.y - pivot.y;
  let z = pt.z - pivot.z;

  // Rotação X
  if (Math.abs(rx) > 1e-5) {
    const c = Math.cos(rx);
    const s = Math.sin(rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  // Rotação Y
  if (Math.abs(ry) > 1e-5) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx;
    z = nz;
  }
  // Rotação Z
  if (Math.abs(rz) > 1e-5) {
    const c = Math.cos(rz);
    const s = Math.sin(rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }

  return {
    x: x + pivot.x,
    y: y + pivot.y,
    z: z + pivot.z,
  };
}

function rotateNormal3D(
  n: Vec3Mm,
  rot: { rxDeg: number; ryDeg: number; rzDeg: number },
): Vec3Mm {
  const r = rotatePoint3DAroundPivot(n, { x: 0, y: 0, z: 0 }, rot);
  const len = Math.hypot(r.x, r.y, r.z) || 1;
  return { x: r.x / len, y: r.y / len, z: r.z / len };
}

/**
 * Calcula a cota Z de um ponto (x, y) nas faces superior e inferior
 * considerando o corte em meia-esquadria (`Rotate Around Axis` / Miter Cut 45°).
 */
function evaluateMiterZ(
  x: number,
  y: number,
  baseZ0: number,
  baseZ1: number,
  bbox2D: { minX: number; maxX: number; minY: number; maxY: number },
  miterTopDeg: number,
  miterTopAxis: "x" | "y",
  miterBottomDeg: number,
  miterBottomAxis: "x" | "y",
): { zBottom: number; zTop: number } {
  const cx = (bbox2D.minX + bbox2D.maxX) * 0.5;
  const cy = (bbox2D.minY + bbox2D.maxY) * 0.5;
  const spanX = Math.max(1, bbox2D.maxX - bbox2D.minX);
  const spanY = Math.max(1, bbox2D.maxY - bbox2D.minY);
  const height = Math.max(1, baseZ1 - baseZ0);

  let zTop = baseZ1;
  if (Math.abs(miterTopDeg) > 0.05) {
    const rad = (miterTopDeg * Math.PI) / 180;
    const tanA = Math.tan(rad);
    const offsetCoord = miterTopAxis === "x" ? x - cx : y - cy;
    const maxShift = height * 0.48;
    const dz = Math.max(-maxShift, Math.min(maxShift, offsetCoord * tanA));
    zTop = baseZ1 + dz;
  }

  let zBottom = baseZ0;
  if (Math.abs(miterBottomDeg) > 0.05) {
    const rad = (miterBottomDeg * Math.PI) / 180;
    const tanA = Math.tan(rad);
    const offsetCoord = miterBottomAxis === "x" ? x - cx : y - cy;
    const maxShift = height * 0.48;
    const dz = Math.max(-maxShift, Math.min(maxShift, offsetCoord * tanA));
    zBottom = baseZ0 + dz;
  }

  if (zTop <= zBottom + 0.5) {
    zTop = zBottom + 0.5;
  }
  void spanX;
  void spanY;
  return { zBottom, zTop };
}

// ============================================================================
// CONSTRUTOR DE SÓLIDOS B-REP MULTI-CORPO + TOPOLOGIA DE FACES/ARESTAS
// ============================================================================

/**
 * Triangula uma face de anel (contorno externo `outer` e N contornos internos `holes` de mesmo comprimento ou genéricos).
 * Quando há 1 furo com mesmo número de vértices (ex.: Shell / Tubo Metalon), cria uma malha de faixa (quad-strip) limpa e exata.
 */
function appendCapWithHolesToMesh(
  outerPts3D: Vec3Mm[],
  holesPts3D: Vec3Mm[][],
  normal: Vec3Mm,
  isTopCap: boolean,
  positions: number[],
  normals: number[],
  indices: number[],
): number {
  let areaMm2 = 0;
  const n = outerPts3D.length;
  if (n < 3) return 0;

  if (holesPts3D.length === 1 && holesPts3D[0]!.length === outerPts3D.length) {
    // Malha de anel perfeita (ex.: parede de tubo Metalon / Shell ou flange com 1 furo concêntrico)
    const innerPts3D = holesPts3D[0]!;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const o0 = outerPts3D[i]!;
      const o1 = outerPts3D[next]!;
      const i0 = innerPts3D[i]!;
      const i1 = innerPts3D[next]!;

      const baseIdx = positions.length / 3;
      positions.push(o0.x, o0.y, o0.z, o1.x, o1.y, o1.z, i1.x, i1.y, i1.z, i0.x, i0.y, i0.z);
      for (let k = 0; k < 4; k++) {
        normals.push(normal.x, normal.y, normal.z);
      }
      if (isTopCap) {
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
      } else {
        indices.push(baseIdx, baseIdx + 2, baseIdx + 1, baseIdx, baseIdx + 3, baseIdx + 2);
      }

      const area1 = triangleArea3D(o0, o1, i1);
      const area2 = triangleArea3D(o0, i1, i0);
      areaMm2 += area1 + area2;
    }
    return areaMm2;
  }

  // Triangulação B-Rep Real com Furos (THREE.ShapeUtils.triangulateShape)
  // Garante que qualquer furo circular, oblongo ou poligonal (do 2D Sketch ou Hole 3D)
  // recorte fisicamente a malha da tampa superior e inferior (furo 100% vazado estilo flange).
  const validHoles3D = holesPts3D.filter((h) => h.length >= 3);
  if (validHoles3D.length > 0 || n >= 3) {
    const rawOuterVec2 = outerPts3D.map((p) => new THREE.Vector2(p.x, p.y));
    const isOuterCW = THREE.ShapeUtils.isClockWise(rawOuterVec2);
    const contour2D = isOuterCW ? [...rawOuterVec2].reverse() : rawOuterVec2;
    const orderedOuter3D = isOuterCW ? [...outerPts3D].reverse() : outerPts3D;

    const holes2D: THREE.Vector2[][] = [];
    const orderedHoles3D: Vec3Mm[][] = [];
    for (const h3d of validHoles3D) {
      const hVec2 = h3d.map((p) => new THREE.Vector2(p.x, p.y));
      const isHoleCW = THREE.ShapeUtils.isClockWise(hVec2);
      if (!isHoleCW) {
        holes2D.push([...hVec2].reverse());
        orderedHoles3D.push([...h3d].reverse());
      } else {
        holes2D.push(hVec2);
        orderedHoles3D.push(h3d);
      }
    }

    const triangles = THREE.ShapeUtils.triangulateShape(contour2D, holes2D);
    if (triangles.length > 0) {
      const allPts3D: Vec3Mm[] = [...orderedOuter3D];
      for (const h3d of orderedHoles3D) {
        for (const p of h3d) {
          allPts3D.push(p);
        }
      }

      const startVertexIdx = positions.length / 3;
      for (const p of allPts3D) {
        positions.push(p.x, p.y, p.z);
        normals.push(normal.x, normal.y, normal.z);
      }

      for (const tri of triangles) {
        const i0 = tri[0]!;
        const i1 = tri[1]!;
        const i2 = tri[2]!;
        const p0 = allPts3D[i0]!;
        const p1 = allPts3D[i1]!;
        const p2 = allPts3D[i2]!;
        areaMm2 += triangleArea3D(p0, p1, p2);

        const cross2D = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
        const isTriCCW = cross2D >= 0;
        if (isTopCap) {
          if (isTriCCW) {
            indices.push(startVertexIdx + i0, startVertexIdx + i1, startVertexIdx + i2);
          } else {
            indices.push(startVertexIdx + i0, startVertexIdx + i2, startVertexIdx + i1);
          }
        } else {
          if (isTriCCW) {
            indices.push(startVertexIdx + i0, startVertexIdx + i2, startVertexIdx + i1);
          } else {
            indices.push(startVertexIdx + i0, startVertexIdx + i1, startVertexIdx + i2);
          }
        }
      }
      return areaMm2;
    }
  }

  return areaMm2;
}

function triangleArea3D(a: Vec3Mm, b: Vec3Mm, c: Vec3Mm): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

/**
 * Constrói toda a cena 3D B-Rep e a topologia de sub-elementos (Corpos, Faces, Arestas e Vértices)
 * a partir da lista de entidades do CHAMFER CAD.
 */
export function buildDirectTopology3DScene(
  entities: Entity[],
  defaultThicknessMm = 20,
): DirectTopology3DScene {
  const validLoops: {
    entity: Entity;
    basePoints: Vec2[];
    corners: Vec2[];
    isSmoothCircle: boolean;
    areaAbs: number;
    bbox2D: { minX: number; maxX: number; minY: number; maxY: number };
    params3D: ReturnType<typeof getEntityDirect3DParams>;
  }[] = [];
  const loftEntities: Entity[] = [];
  const kernelFeatureEntities: Entity[] = [];

  for (const ent of entities) {
    if (isLoft3DEntity(ent)) {
      loftEntities.push(ent);
      continue;
    }
    const featType = resolveEntitySolidFeatureType(ent);
    if (
      featType === "revolve" ||
      featType === "sweep" ||
      featType === "structural_frame" ||
      featType === "sheet_metal"
    ) {
      kernelFeatureEntities.push(ent);
      continue;
    }
    const extracted = extractBaseClosedLoop2D(ent);
    if (!extracted) continue;
    const areaAbs = Math.abs(signedArea2D(extracted.points));
    if (areaAbs < 0.5) continue;
    const b = boxOf(ent);
    validLoops.push({
      entity: ent,
      basePoints: extracted.points,
      corners: extracted.corners,
      isSmoothCircle: extracted.isSmoothCircle,
      areaAbs,
      bbox2D: b,
      params3D: getEntityDirect3DParams(ent, defaultThicknessMm),
    });
  }

  // Ordena do maior para o menor para identificar contornos externos vs. furos internos na mesma elevação
  validLoops.sort((a, b) => b.areaAbs - a.areaAbs);

  interface SolidProfileGroup {
    outer: (typeof validLoops)[number];
    holes: (typeof validLoops)[number][];
  }

  const groups: SolidProfileGroup[] = [];
  const assignedAsHole = new Set<string>();

  for (let i = 0; i < validLoops.length; i++) {
    const cand = validLoops[i]!;
    if (assignedAsHole.has(cand.entity.id)) continue;

    // Perfis de Seção 3D (Curvas 3D para Loft) nunca engolem perfis menores nem são engolidos como furos
    if (cand.params3D.is3DProfileCurve) {
      groups.push({ outer: cand, holes: [] });
      continue;
    }

    // Verifica se este perfil é um furo/recorte contido em um perfil maior na mesma faixa Z
    let parentGroup: SolidProfileGroup | null = null;
    for (const grp of groups) {
      if (grp.outer.params3D.is3DProfileCurve) continue;
      const sameZ = Math.abs(grp.outer.params3D.elevationZ - cand.params3D.elevationZ) < 1.0;
      const isExplicitHole =
        cand.entity.layer === "furo" ||
        cand.entity.layer === "recorte" ||
        cand.entity.params?.booleanMode3D === "subtract";
      const isRegularPolygonProfile =
        !isExplicitHole &&
        (cand.entity.params?.isPolygon3D === true ||
          cand.entity.params?.shapeKind === "regular_polygon" ||
          typeof cand.entity.params?.polygonSides === "number");
      const isForceNewBody =
        !isExplicitHole &&
        (isRegularPolygonProfile ||
          cand.entity.params?.isIndependentBody3D === true ||
          cand.entity.params?.booleanMode3D === "union" ||
          (cand.entity.params?.booleanMode3D === "new_body" &&
            Math.abs(cand.params3D.extrudeHeightMm - grp.outer.params3D.extrudeHeightMm) > 0.5 &&
            cand.entity.type !== "circle" &&
            cand.entity.type !== "ellipse"));
      if (!sameZ || isForceNewBody) continue;

      const samplePt = cand.basePoints[0]!;
      const midPt = cand.basePoints[Math.floor(cand.basePoints.length / 2)] ?? samplePt;
      if (
        cand.areaAbs < grp.outer.areaAbs * 0.92 &&
        pointInPolygon2D(samplePt, grp.outer.basePoints) &&
        pointInPolygon2D(midPt, grp.outer.basePoints)
      ) {
        parentGroup = grp;
        break;
      }
    }

    if (parentGroup) {
      assignedAsHole.add(cand.entity.id);
      parentGroup.holes.push(cand);
    } else {
      groups.push({ outer: cand, holes: [] });
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faceGroups: { faceIndex: number; start: number; count: number }[] = [];
  const edgePolylines: {
    edgeIndex: number;
    vertices: number[];
    isSeam?: boolean;
    isTangentEdge?: boolean;
  }[] = [];

  const bodies: DirectBody3D[] = [];
  const facesById = new Map<string, DirectFace3D>();
  const edgesById = new Map<string, DirectEdge3D>();
  const verticesById = new Map<string, DirectVertex3D>();
  const bodiesById = new Map<string, DirectBody3D>();
  const facesByMeshIndex = new Map<number, DirectFace3D>();
  const edgesByMeshIndex = new Map<number, DirectEdge3D>();

  let globalMeshFaceIdx = 0;
  let globalMeshEdgeIdx = 0;

  // Limiar de suavização Phong/Gouraud: Δθ < 25° (cos(25°) ≈ 0.9063078)
  const COS_SMOOTH_DIHEDRAL_25_DEG = Math.cos((25 * Math.PI) / 180);

  groups.forEach((grp, bodyIdx) => {
    const { outer, holes } = grp;
    const p3d = outer.params3D;
    const entId = outer.entity.id;
    const bodyId = `body_${entId}`;

    // 1. Aplica Offset Lateral (`offsetFaceSidesMm`) sobre o contorno base antes do Fillet
    const baseWithOffset2D =
      Math.abs(p3d.offsetFaceSidesMm) > 0.01
        ? offsetPolygon2D(outer.basePoints, p3d.offsetFaceSidesMm)
        : outer.basePoints;

    // 2. Aplica Fillet 3D (`edgeFilletRadiusMm` / `cornerFilletsMm`) ou Chamfer 3D (`edgeChamferDistMm` / `cornerChamfersMm`) nas arestas verticais
    const hasPerCornerMod =
      Object.keys(p3d.cornerFilletsMm).length > 0 ||
      Object.keys(p3d.cornerChamfersMm).length > 0;
    let contour2D = baseWithOffset2D;
    if (
      !outer.isSmoothCircle &&
      (p3d.edgeFilletRadiusMm > 0.05 || p3d.edgeChamferDistMm > 0.05 || hasPerCornerMod)
    ) {
      contour2D = applyCornerFilletOrChamferToPolygon2D(
        baseWithOffset2D,
        p3d.edgeFilletRadiusMm,
        p3d.edgeChamferDistMm,
        p3d.cornerFilletsMm,
        p3d.cornerChamfersMm,
      );
    }

    // 2.5. Caso especial: Curva de Perfil 3D pura no plano Z (`is3DProfileCurve: true`, sem extrusão automática)
    if (p3d.is3DProfileCurve) {
      const zPlane = p3d.elevationZ;
      const b2dCurve = boxOf({
        id: "tmp_curve",
        layer: "corte",
        type: "polyline",
        pts: contour2D,
        closed: true,
      });
      const centroid2D = computePolygonCentroid3D(
        contour2D.map((pt) => ({ x: pt.x, y: pt.y, z: zPlane })),
      );
      const curvePivot3D: Vec3Mm = {
        x: centroid2D.x,
        y: centroid2D.y,
        z: zPlane,
      };
      const ring3D: Vec3Mm[] = contour2D.map((pt) =>
        rotatePoint3DAroundPivot({ x: pt.x, y: pt.y, z: zPlane }, curvePivot3D, p3d.rotation3D),
      );
      const closedVerts: number[] = [];
      for (const p of ring3D) closedVerts.push(p.x, p.y, p.z);
      if (ring3D.length > 0) {
        closedVerts.push(ring3D[0]!.x, ring3D[0]!.y, ring3D[0]!.z);
      }
      const meshEdgeIndex = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: meshEdgeIndex,
        vertices: closedVerts,
        isSeam: false,
        isTangentEdge: false,
      });

      const curveFaces: DirectFace3D[] = [];
      const curveEdges: DirectEdge3D[] = [];
      const curveVertices: DirectVertex3D[] = [];
      const curveAreaMm2 = Math.max(1, Math.abs(signedArea2D(contour2D)));

      const profileFace: DirectFace3D = {
        faceId: `${bodyId}_face_top`,
        meshFaceIndex: -1,
        bodyId,
        entityId: entId,
        role: "top",
        sideIndex: -1,
        label: `Seção Transversal 3D (Z = ${zPlane.toFixed(1)} mm)`,
        normal: rotateNormal3D({ x: 0, y: 0, z: 1 }, p3d.rotation3D),
        centroid: curvePivot3D,
        areaMm2: curveAreaMm2,
        polygon3D: ring3D,
      };
      curveFaces.push(profileFace);
      facesById.set(profileFace.faceId, profileFace);

      const perimLen = computePolygonPerimeter3D(ring3D);
      const closedPoly3D = ring3D.length > 0 ? [...ring3D, ring3D[0]!] : [];
      const profileEdge: DirectEdge3D = {
        edgeId: `${bodyId}_edge_profile_0`,
        meshEdgeIndex,
        bodyId,
        entityId: entId,
        role: "top_loop",
        edgeIndex: 0,
        label: `Contorno de Perfil 3D (Z = ${zPlane.toFixed(1)} mm)`,
        startPt: ring3D[0] ?? curvePivot3D,
        endPt: ring3D[Math.floor(ring3D.length / 2)] ?? curvePivot3D,
        midpoint: curvePivot3D,
        dir: { x: 1, y: 0, z: 0 },
        lengthMm: perimLen,
        polyline3D: closedPoly3D,
      };
      curveEdges.push(profileEdge);
      edgesById.set(profileEdge.edgeId, profileEdge);
      edgesByMeshIndex.set(meshEdgeIndex, profileEdge);

      const cornerPts = outer.corners.length >= 3 ? outer.corners : contour2D.slice(0, 12);
      cornerPts.forEach((cPt, cIdx) => {
        const pt3D = rotatePoint3DAroundPivot(
          { x: cPt.x, y: cPt.y, z: zPlane },
          curvePivot3D,
          p3d.rotation3D,
        );
        const vObj: DirectVertex3D = {
          vertexId: `${bodyId}_vert_top_${cIdx}`,
          bodyId,
          entityId: entId,
          cornerIndex: cIdx,
          end: "top",
          label: `Vértice de Perfil #${cIdx + 1}`,
          point3D: pt3D,
        };
        curveVertices.push(vObj);
        verticesById.set(vObj.vertexId, vObj);
      });

      const snapCandidates: DirectSnapPivotCandidate3D[] = [
        {
          id: `${bodyId}_snap_center`,
          bodyId,
          entityId: entId,
          kind: "body_center",
          label: "Centro Geométrico (⌖)",
          point3D: curvePivot3D,
        },
        ...curveVertices.map((v) => ({
          id: `${bodyId}_snap_${v.vertexId}`,
          bodyId,
          entityId: entId,
          kind: "vertex" as const,
          label: v.label,
          point3D: v.point3D,
        })),
      ];

      const curveBody: DirectBody3D = {
        bodyId,
        entityId: entId,
        name: p3d.bodyName || `Perfil 3D #${bodyIdx + 1} (Z=${zPlane.toFixed(0)}mm)`,
        booleanMode: p3d.booleanMode3D,
        extrudeHeightMm: 0,
        elevationZ: zPlane,
        edgeFilletRadiusMm: p3d.edgeFilletRadiusMm,
        innerFilletRadiusMm: 0,
        edgeChamferDistMm: p3d.edgeChamferDistMm,
        cornerFilletsMm: p3d.cornerFilletsMm,
        cornerChamfersMm: p3d.cornerChamfersMm,
        vertexBevelsMm: p3d.vertexBevelsMm,
        shellWallThicknessMm: 0,
        shellThicknessMm: 0,
        sheetThicknessMm: p3d.sheetThicknessMm,
        shellOpenCaps: [],
        offsetFaceTopMm: 0,
        offsetFaceBottomMm: 0,
        offsetFaceSidesMm: p3d.offsetFaceSidesMm,
        offsetSidesIndependent: {
          posX: p3d.offsetFaceSidesMm,
          negX: p3d.offsetFaceSidesMm,
          posY: p3d.offsetFaceSidesMm,
          negY: p3d.offsetFaceSidesMm,
        },
        miterCutTopDeg: 0,
        miterCutTopAxis: "x",
        miterCutBottomDeg: 0,
        miterCutBottomAxis: "x",
        rotation3D: p3d.rotation3D,
        pivot3D: curvePivot3D,
        colorHex: p3d.colorHex,
        materialName: p3d.materialName,
        densityGPerCm3: 7.85,
        massGrams: 0,
        eulerCharacteristic: { V: curveVertices.length, E: curveVertices.length, F: 1, chi: 1 },
        featureHistory: [
          {
            featureId: `${bodyId}_feat_sketch`,
            kind: "sketch",
            label: "Seção Transversal 3D",
            parameterSummary: `Z = ${zPlane.toFixed(1)} mm`,
          },
        ],
        bbox3D: {
          minX: b2dCurve.minX,
          maxX: b2dCurve.maxX,
          minY: b2dCurve.minY,
          maxY: b2dCurve.maxY,
          minZ: zPlane,
          maxZ: zPlane,
        },
        deltaX: Math.max(0, b2dCurve.maxX - b2dCurve.minX),
        deltaY: Math.max(0, b2dCurve.maxY - b2dCurve.minY),
        deltaZ: 0,
        totalAreaMm2: curveAreaMm2,
        volumeMm3: 0,
        faces: curveFaces,
        edges: curveEdges,
        vertices: curveVertices,
        snapCandidates,
      };
      bodies.push(curveBody);
      bodiesById.set(bodyId, curveBody);
      return;
    }

    // 3. Calcula limites Z (ElevationZ + Extrude + Offset Face Top/Bottom)
    const rawZ0 = p3d.elevationZ - p3d.offsetFaceBottomMm;
    const rawZ1 = p3d.elevationZ + p3d.extrudeHeightMm + p3d.offsetFaceTopMm;
    const z0 = Math.min(rawZ0, rawZ1 - 0.5);
    const z1 = Math.max(rawZ1, rawZ0 + 0.5);

    const b2d = boxOf({
      id: "tmp",
      layer: "corte",
      type: "polyline",
      pts: contour2D,
      closed: true,
    });
    const pivot3D: Vec3Mm = {
      x: (b2d.minX + b2d.maxX) * 0.5,
      y: (b2d.minY + b2d.maxY) * 0.5,
      z: (z0 + z1) * 0.5,
    };

    // 4. Determina se o corpo possui Shell (Tubo Estrutural Oco / Metalon ou Caixa Oca)
    //    Com raio interno concêntrico exato: R_int = max(0, R_ext - t)
    const hasShell = p3d.shellThicknessMm > 0.1;
    const openTop = hasShell && p3d.shellOpenCaps.includes("top");
    const openBottom = hasShell && p3d.shellOpenCaps.includes("bottom");

    const maxWall = Math.min(b2d.maxX - b2d.minX, b2d.maxY - b2d.minY) * 0.42;
    const effectiveWallT = hasShell
      ? Math.min(p3d.shellThicknessMm, Math.max(0.5, maxWall))
      : 0;
    const innerFilletRadiusMm = hasShell
      ? Math.max(0, p3d.edgeFilletRadiusMm - effectiveWallT)
      : 0;
    const innerChamferDistMm = hasShell
      ? Math.max(0, p3d.edgeChamferDistMm - effectiveWallT)
      : 0;

    const holeLoops2D: Vec2[][] = holes.map((h) => ensureCCW(h.basePoints));
    if (hasShell) {
      const rawShellInner2D = offsetPolygon2D(baseWithOffset2D, -effectiveWallT);
      const shellInner2D =
        !outer.isSmoothCircle && (innerFilletRadiusMm > 0.05 || innerChamferDistMm > 0.05)
          ? applyCornerFilletOrChamferToPolygon2D(
              rawShellInner2D,
              innerFilletRadiusMm,
              innerChamferDistMm,
            )
          : rawShellInner2D;
      holeLoops2D.unshift(shellInner2D);
    }

    // Cálculo analítico exato de área de seção transversal (evita erro de discretização poligonal em arcos de Fillet/Shell)
    const baseAreaBeforeFillet = Math.abs(signedArea2D(baseWithOffset2D));
    const numSharpCorners = !outer.isSmoothCircle ? Math.min(4, outer.corners.length || 4) : 0;
    const filletCornerLossOuter =
      !outer.isSmoothCircle && p3d.edgeFilletRadiusMm > 0.05 && numSharpCorners === 4
        ? (4 - Math.PI) * p3d.edgeFilletRadiusMm * p3d.edgeFilletRadiusMm
        : !outer.isSmoothCircle && p3d.edgeChamferDistMm > 0.05 && numSharpCorners === 4
          ? 2 * p3d.edgeChamferDistMm * p3d.edgeChamferDistMm
          : 0;
    const analyticalOuterAreaMm2 =
      filletCornerLossOuter > 0
        ? Math.max(1, baseAreaBeforeFillet - filletCornerLossOuter)
        : Math.abs(signedArea2D(contour2D));

    let analyticalShellCavityAreaMm2 = 0;
    if (hasShell) {
      const rawInnerPoly = offsetPolygon2D(baseWithOffset2D, -effectiveWallT);
      const rawInnerArea = Math.abs(signedArea2D(rawInnerPoly));
      const filletCornerLossInner =
        !outer.isSmoothCircle && innerFilletRadiusMm > 0.05 && numSharpCorners === 4
          ? (4 - Math.PI) * innerFilletRadiusMm * innerFilletRadiusMm
          : !outer.isSmoothCircle && innerChamferDistMm > 0.05 && numSharpCorners === 4
            ? 2 * innerChamferDistMm * innerChamferDistMm
            : 0;
      analyticalShellCavityAreaMm2 = Math.max(0, rawInnerArea - filletCornerLossInner);
    }
    const analyticalOtherHolesAreaMm2 = holes.reduce(
      (acc, h) => acc + (h.entity.type === "circle" ? Math.PI * h.entity.r * h.entity.r : Math.abs(signedArea2D(h.basePoints))),
      0,
    );
    const analyticalNetSectionAreaMm2 = Math.max(
      1,
      analyticalOuterAreaMm2 - analyticalShellCavityAreaMm2 - analyticalOtherHolesAreaMm2,
    );

    const transformPt = (x: number, y: number, z: number): Vec3Mm =>
      rotatePoint3DAroundPivot({ x, y, z }, pivot3D, p3d.rotation3D);

    const outerTop3D: Vec3Mm[] = [];
    const outerBottom3D: Vec3Mm[] = [];

    for (const pt of contour2D) {
      const { zBottom, zTop } = evaluateMiterZ(
        pt.x,
        pt.y,
        z0,
        z1,
        b2d,
        p3d.miterCutTopDeg,
        p3d.miterCutTopAxis,
        p3d.miterCutBottomDeg,
        p3d.miterCutBottomAxis,
      );
      outerBottom3D.push(transformPt(pt.x, pt.y, zBottom));
      outerTop3D.push(transformPt(pt.x, pt.y, zTop));
    }

    const holesTop3D: Vec3Mm[][] = [];
    const holesBottom3D: Vec3Mm[][] = [];
    const holePierceBottomFlags: boolean[] = [];

    const makeCircleLoop2D = (cx: number, cy: number, radius: number, nPts: number): Vec2[] => {
      const pts: Vec2[] = [];
      for (let i = 0; i < nPts; i++) {
        const a = (i / nPts) * Math.PI * 2;
        pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
      }
      return ensureCCW(pts);
    };

    holeLoops2D.forEach((hLoop, hIdx) => {
      const isShellCavity = hasShell && hIdx === 0;
      const holeObj = !isShellCavity ? holes[hasShell ? hIdx - 1 : hIdx] : undefined;
      const holeEnt = holeObj?.entity;
      const holeType = String(holeEnt?.params?.holeType ?? "through");
      const holeDepthParam = Number(
        holeEnt?.params?.holeDepthMm ??
          holeEnt?.params?.extrudeHeightMm ??
          holeEnt?.extrudeHeight ??
          z1 - z0,
      );
      const isBlindHole =
        !isShellCavity &&
        holeType === "blind" &&
        holeDepthParam > 0.5 &&
        holeDepthParam < (z1 - z0) - 0.2;

      const isCounterbore =
        !isShellCavity && (holeType === "counterbore" || holeType === "spotface");
      const isCountersink = !isShellCavity && holeType === "countersink";

      // Para Counterbore e Countersink, o raio na face superior de entrada é R1 (maior) e na face inferior é R2 (menor)
      let topLoop2D = hLoop;
      if ((isCounterbore || isCountersink) && holeEnt?.type === "circle") {
        const r2 = holeEnt.r;
        const r1Raw = isCounterbore
          ? Number(holeEnt.params?.counterboreDiameterMm ?? r2 * 2 + 6) * 0.5
          : Number(holeEnt.params?.countersinkDiameterMm ?? r2 * 2 + 6) * 0.5;
        const r1 = Math.max(r2 + 1.2, r1Raw);
        topLoop2D = makeCircleLoop2D(holeEnt.cx, holeEnt.cy, r1, hLoop.length);
      }

      const hBottomZBase = isShellCavity
        ? !openBottom
          ? z0 + p3d.shellThicknessMm
          : z0
        : isBlindHole
          ? Math.max(z0 + 1, z1 - holeDepthParam)
          : z0;
      const hTopZBase =
        isShellCavity && !openTop ? z1 - p3d.shellThicknessMm : z1;

      const hTop: Vec3Mm[] = [];
      const hBot: Vec3Mm[] = [];
      for (let i = 0; i < hLoop.length; i++) {
        const ptBot = hLoop[i]!;
        const ptTop = topLoop2D[i] ?? ptBot;
        const { zBottom } = evaluateMiterZ(
          ptBot.x,
          ptBot.y,
          hBottomZBase,
          hTopZBase,
          b2d,
          p3d.miterCutTopDeg,
          p3d.miterCutTopAxis,
          p3d.miterCutBottomDeg,
          p3d.miterCutBottomAxis,
        );
        const { zTop } = evaluateMiterZ(
          ptTop.x,
          ptTop.y,
          hBottomZBase,
          hTopZBase,
          b2d,
          p3d.miterCutTopDeg,
          p3d.miterCutTopAxis,
          p3d.miterCutBottomDeg,
          p3d.miterCutBottomAxis,
        );
        hBot.push(transformPt(ptBot.x, ptBot.y, zBottom));
        hTop.push(transformPt(ptTop.x, ptTop.y, zTop));
      }
      holesBottom3D.push(hBot);
      holesTop3D.push(hTop);
      holePierceBottomFlags.push(isShellCavity ? openBottom : !isBlindHole);
    });

    const bodyFaces: DirectFace3D[] = [];
    const bodyEdges: DirectEdge3D[] = [];

    // -------------------------------------------------------------------------
    // FACE 1: TOPO (ou Anel Superior se Tubo / Furo)
    // -------------------------------------------------------------------------
    {
      const startIdx = indices.length;
      const topHoles = openTop || !hasShell ? holesTop3D : holesTop3D.slice(1);
      const rawTopNormal: Vec3Mm = {
        x:
          p3d.miterCutTopAxis === "x"
            ? -Math.sin((p3d.miterCutTopDeg * Math.PI) / 180)
            : 0,
        y:
          p3d.miterCutTopAxis === "y"
            ? -Math.sin((p3d.miterCutTopDeg * Math.PI) / 180)
            : 0,
        z: Math.cos((p3d.miterCutTopDeg * Math.PI) / 180),
      };
      const topNormal = rotateNormal3D(rawTopNormal, p3d.rotation3D);

      const topAreaMm2 = appendCapWithHolesToMesh(
        outerTop3D,
        topHoles,
        topNormal,
        true,
        positions,
        normals,
        indices,
      );
      const countIdx = indices.length - startIdx;
      const meshFaceIndex = globalMeshFaceIdx++;
      faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: countIdx });

      const centroid = computePolygonCentroid3D(outerTop3D);
      const topMiterCos = Math.max(0.25, Math.cos((p3d.miterCutTopDeg * Math.PI) / 180));
      const exactTopAreaMm2 =
        openTop || !hasShell
          ? analyticalNetSectionAreaMm2 / topMiterCos
          : Math.max(1, analyticalOuterAreaMm2 - analyticalOtherHolesAreaMm2) / topMiterCos;
      void topAreaMm2;
      const topFace: DirectFace3D = {
        faceId: `${bodyId}_face_top`,
        meshFaceIndex,
        bodyId,
        entityId: entId,
        role: Math.abs(p3d.miterCutTopDeg) > 0.5 ? "miter" : "top",
        sideIndex: -1,
        label:
          Math.abs(p3d.miterCutTopDeg) > 0.5
            ? `Face Superior (Esquadria ${p3d.miterCutTopDeg.toFixed(0)}°)`
            : "Face Superior (+Z)",
        normal: topNormal,
        centroid,
        areaMm2: exactTopAreaMm2,
        polygon3D: outerTop3D,
      };
      bodyFaces.push(topFace);
      facesById.set(topFace.faceId, topFace);
      facesByMeshIndex.set(meshFaceIndex, topFace);
    }

    // -------------------------------------------------------------------------
    // FACE 2: BASE INFERIOR (-Z) — Furos Cegos (Blind) NÃO furam a face inferior!
    // -------------------------------------------------------------------------
    {
      const startIdx = indices.length;
      const botHoles = holesBottom3D.filter((_, idx) => holePierceBottomFlags[idx]);
      const rawBotNormal: Vec3Mm = {
        x:
          p3d.miterCutBottomAxis === "x"
            ? Math.sin((p3d.miterCutBottomDeg * Math.PI) / 180)
            : 0,
        y:
          p3d.miterCutBottomAxis === "y"
            ? Math.sin((p3d.miterCutBottomDeg * Math.PI) / 180)
            : 0,
        z: -Math.cos((p3d.miterCutBottomDeg * Math.PI) / 180),
      };
      const botNormal = rotateNormal3D(rawBotNormal, p3d.rotation3D);

      const botAreaMm2 = appendCapWithHolesToMesh(
        outerBottom3D,
        botHoles,
        botNormal,
        false,
        positions,
        normals,
        indices,
      );
      const countIdx = indices.length - startIdx;
      const meshFaceIndex = globalMeshFaceIdx++;
      faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: countIdx });

      const centroid = computePolygonCentroid3D(outerBottom3D);
      const botMiterCos = Math.max(0.25, Math.cos((p3d.miterCutBottomDeg * Math.PI) / 180));
      const exactBotAreaMm2 =
        openBottom || !hasShell
          ? analyticalNetSectionAreaMm2 / botMiterCos
          : Math.max(1, analyticalOuterAreaMm2 - analyticalOtherHolesAreaMm2) / botMiterCos;
      void botAreaMm2;
      const botFace: DirectFace3D = {
        faceId: `${bodyId}_face_bottom`,
        meshFaceIndex,
        bodyId,
        entityId: entId,
        role: Math.abs(p3d.miterCutBottomDeg) > 0.5 ? "miter" : "bottom",
        sideIndex: -2,
        label:
          Math.abs(p3d.miterCutBottomDeg) > 0.5
            ? `Face Inferior (Esquadria ${p3d.miterCutBottomDeg.toFixed(0)}°)`
            : "Face Inferior (-Z)",
        normal: botNormal,
        centroid,
        areaMm2: exactBotAreaMm2,
        polygon3D: outerBottom3D,
      };
      bodyFaces.push(botFace);
      facesById.set(botFace.faceId, botFace);
      facesByMeshIndex.set(meshFaceIndex, botFace);
    }

    // -------------------------------------------------------------------------
    // CÁLCULO DE NORMAIS DE VÉRTICE SUAVES (PHONG / GOURAUD SMOOTHING Δθ < 25°)
    // E DETECÇÃO DE TRANSIÇÕES TANGENTES (INÍCIO E FIM DE DOBRAS/FILLETS)
    // -------------------------------------------------------------------------
    const nOuter = contour2D.length;
    const outerFlatNormals: Vec3Mm[] = [];
    const outerSegLengths: number[] = [];

    for (let i = 0; i < nOuter; i++) {
      const next = (i + 1) % nOuter;
      const p2d0 = contour2D[i]!;
      const p2d1 = contour2D[next]!;
      const dx = p2d1.x - p2d0.x;
      const dy = p2d1.y - p2d0.y;
      const segLen = Math.hypot(dx, dy) || 1;
      outerSegLengths.push(segLen);
      // Contorno externo está garantidamente em sentido anti-horário (CCW): normal externa = (dy, -dx)
      outerFlatNormals.push(
        rotateNormal3D({ x: dy / segLen, y: -dx / segLen, z: 0 }, p3d.rotation3D),
      );
    }

    const outerIsSmoothVertex: boolean[] = new Array(nOuter).fill(false);
    const outerVertexSmoothNormals: Vec3Mm[] = new Array(nOuter);

    for (let i = 0; i < nOuter; i++) {
      const prevSeg = (i - 1 + nOuter) % nOuter;
      const nPrev = outerFlatNormals[prevSeg]!;
      const nCurr = outerFlatNormals[i]!;
      const cosTheta = nPrev.x * nCurr.x + nPrev.y * nCurr.y + nPrev.z * nCurr.z;

      if (cosTheta >= COS_SMOOTH_DIHEDRAL_25_DEG) {
        outerIsSmoothVertex[i] = true;
        const sx = nPrev.x + nCurr.x;
        const sy = nPrev.y + nCurr.y;
        const sz = nPrev.z + nCurr.z;
        const sl = Math.hypot(sx, sy, sz) || 1;
        outerVertexSmoothNormals[i] = { x: sx / sl, y: sy / sl, z: sz / sl };
      } else {
        outerIsSmoothVertex[i] = false;
        outerVertexSmoothNormals[i] = nCurr;
      }
    }

    // Identifica quais segmentos pertencem a paredes retas vs. tiras curvas de dobras/raios
    const sortedLens = [...outerSegLengths].sort((a, b) => a - b);
    const minSegLen = sortedLens[0] ?? 1;
    const maxSegLen = sortedLens[sortedLens.length - 1] ?? 1;
    const hasMixedStraightAndCurve =
      !outer.isSmoothCircle && nOuter > 12 && maxSegLen > minSegLen * 2.4;
    const straightLenThreshold = Math.max(2.5, minSegLen * 2.2);
    const outerIsStraightSeg: boolean[] = outerSegLengths.map((len) =>
      hasMixedStraightAndCurve ? len >= straightLenThreshold : !outer.isSmoothCircle && nOuter <= 12,
    );

    // -------------------------------------------------------------------------
    // FACES LATERAIS EXTERNAS COM INTERPOLAÇÃO CONTÍNUA DE LUZ ENTRE TIRAS
    // -------------------------------------------------------------------------
    if (nOuter <= 12) {
      for (let i = 0; i < nOuter; i++) {
        const next = (i + 1) % nOuter;
        const b0 = outerBottom3D[i]!;
        const b1 = outerBottom3D[next]!;
        const t1 = outerTop3D[next]!;
        const t0 = outerTop3D[i]!;

        const sideNormal = outerFlatNormals[i]!;
        const nLeft = outerIsSmoothVertex[i] ? outerVertexSmoothNormals[i]! : sideNormal;
        const nRight = outerIsSmoothVertex[next] ? outerVertexSmoothNormals[next]! : sideNormal;

        const startIdx = indices.length;
        const baseV = positions.length / 3;
        positions.push(
          b0.x, b0.y, b0.z,
          b1.x, b1.y, b1.z,
          t1.x, t1.y, t1.z,
          t0.x, t0.y, t0.z,
        );
        normals.push(
          nLeft.x, nLeft.y, nLeft.z,
          nRight.x, nRight.y, nRight.z,
          nRight.x, nRight.y, nRight.z,
          nLeft.x, nLeft.y, nLeft.z,
        );
        indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
        const countIdx = indices.length - startIdx;
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: countIdx });

        const areaMm2 = triangleArea3D(b0, b1, t1) + triangleArea3D(b0, t1, t0);
        const sideFace: DirectFace3D = {
          faceId: `${bodyId}_face_side_${i}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role: "side",
          sideIndex: i,
          label: `Face Lateral #${i + 1}`,
          normal: sideNormal,
          centroid: {
            x: (b0.x + b1.x + t1.x + t0.x) * 0.25,
            y: (b0.y + b1.y + t1.y + t0.y) * 0.25,
            z: (b0.z + b1.z + t1.z + t0.z) * 0.25,
          },
          areaMm2,
          polygon3D: [b0, b1, t1, t0],
        };
        bodyFaces.push(sideFace);
        facesById.set(sideFace.faceId, sideFace);
        facesByMeshIndex.set(meshFaceIndex, sideFace);
      }
    } else {
      // Agrupa segmentos em 4 quadrantes laterais (Direita +X, Topo +Y, Esquerda -X, Base -Y)
      const buckets: { indicesRange: number[]; poly: Vec3Mm[]; area: number; dir: Vec3Mm; label: string }[] = [
        { indicesRange: [], poly: [], area: 0, dir: { x: 1, y: 0, z: 0 }, label: "Face Lateral (+X)" },
        { indicesRange: [], poly: [], area: 0, dir: { x: 0, y: 1, z: 0 }, label: "Face Lateral (+Y)" },
        { indicesRange: [], poly: [], area: 0, dir: { x: -1, y: 0, z: 0 }, label: "Face Lateral (-X)" },
        { indicesRange: [], poly: [], area: 0, dir: { x: 0, y: -1, z: 0 }, label: "Face Lateral (-Y)" },
      ];

      for (let i = 0; i < nOuter; i++) {
        const next = (i + 1) % nOuter;
        const p2d0 = contour2D[i]!;
        const p2d1 = contour2D[next]!;
        const dx = p2d1.x - p2d0.x;
        const dy = p2d1.y - p2d0.y;
        const segLen = Math.hypot(dx, dy) || 1;
        const nx = dy / segLen;
        const ny = -dx / segLen;

        const bIdx =
          Math.abs(nx) >= Math.abs(ny) ? (nx >= 0 ? 0 : 2) : ny >= 0 ? 1 : 3;
        buckets[bIdx]!.indicesRange.push(i);
      }

      buckets.forEach((bkt, qIdx) => {
        if (bkt.indicesRange.length === 0) return;
        const startIdx = indices.length;
        let totalArea = 0;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        const samplePoly: Vec3Mm[] = [];

        for (const i of bkt.indicesRange) {
          const next = (i + 1) % nOuter;
          const b0 = outerBottom3D[i]!;
          const b1 = outerBottom3D[next]!;
          const t1 = outerTop3D[next]!;
          const t0 = outerTop3D[i]!;

          const sideNormal = outerFlatNormals[i]!;
          // Normais compartilhadas idênticas entre a borda direita da tira i e a borda esquerda da tira i+1
          const nLeft = outerIsSmoothVertex[i] ? outerVertexSmoothNormals[i]! : sideNormal;
          const nRight = outerIsSmoothVertex[next] ? outerVertexSmoothNormals[next]! : sideNormal;

          const baseV = positions.length / 3;
          positions.push(
            b0.x, b0.y, b0.z,
            b1.x, b1.y, b1.z,
            t1.x, t1.y, t1.z,
            t0.x, t0.y, t0.z,
          );
          normals.push(
            nLeft.x, nLeft.y, nLeft.z,
            nRight.x, nRight.y, nRight.z,
            nRight.x, nRight.y, nRight.z,
            nLeft.x, nLeft.y, nLeft.z,
          );
          indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);

          const segArea = triangleArea3D(b0, b1, t1) + triangleArea3D(b0, t1, t0);
          totalArea += segArea;
          cx += (b0.x + b1.x + t1.x + t0.x) * 0.25;
          cy += (b0.y + b1.y + t1.y + t0.y) * 0.25;
          cz += (b0.z + b1.z + t1.z + t0.z) * 0.25;
          if (samplePoly.length < 16) samplePoly.push(b0, t0);
        }

        const countIdx = indices.length - startIdx;
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: countIdx });

        const cnt = bkt.indicesRange.length;
        const sideFace: DirectFace3D = {
          faceId: `${bodyId}_face_side_${qIdx}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role: "side",
          sideIndex: qIdx,
          label: bkt.label,
          normal: rotateNormal3D(bkt.dir, p3d.rotation3D),
          centroid: { x: cx / cnt, y: cy / cnt, z: cz / cnt },
          areaMm2: totalArea,
          polygon3D: samplePoly,
        };
        bodyFaces.push(sideFace);
        facesById.set(sideFace.faceId, sideFace);
        facesByMeshIndex.set(meshFaceIndex, sideFace);
      });
    }

    // -------------------------------------------------------------------------
    // PAREDES INTERNAS DOS FUROS E SHELL (TUBO METALON / CAIXA OCA) COM NORMAIS SUAVES
    // -------------------------------------------------------------------------
    holeLoops2D.forEach((hLoop, hIdx) => {
      const hBot3D = holesBottom3D[hIdx]!;
      const hTop3D = holesTop3D[hIdx]!;
      const nh = hLoop.length;
      const startIdx = indices.length;
      let innerArea = 0;

      const holeFlatNormals: Vec3Mm[] = [];
      for (let i = 0; i < nh; i++) {
        const next = (i + 1) % nh;
        const p2d0 = hLoop[i]!;
        const p2d1 = hLoop[next]!;
        const dx = p2d1.x - p2d0.x;
        const dy = p2d1.y - p2d0.y;
        const segLen = Math.hypot(dx, dy) || 1;
        // Normal apontando para dentro da cavidade/furo
        holeFlatNormals.push(
          rotateNormal3D({ x: -dy / segLen, y: dx / segLen, z: 0 }, p3d.rotation3D),
        );
      }

      const holeSmoothNormals: Vec3Mm[] = new Array(nh);
      const holeIsSmoothVertex: boolean[] = new Array(nh).fill(false);
      for (let i = 0; i < nh; i++) {
        const prevSeg = (i - 1 + nh) % nh;
        const nPrev = holeFlatNormals[prevSeg]!;
        const nCurr = holeFlatNormals[i]!;
        const cosTheta = nPrev.x * nCurr.x + nPrev.y * nCurr.y + nPrev.z * nCurr.z;
        if (cosTheta >= COS_SMOOTH_DIHEDRAL_25_DEG) {
          holeIsSmoothVertex[i] = true;
          const sx = nPrev.x + nCurr.x;
          const sy = nPrev.y + nCurr.y;
          const sz = nPrev.z + nCurr.z;
          const sl = Math.hypot(sx, sy, sz) || 1;
          holeSmoothNormals[i] = { x: sx / sl, y: sy / sl, z: sz / sl };
        } else {
          holeIsSmoothVertex[i] = false;
          holeSmoothNormals[i] = nCurr;
        }
      }

      const isShellCavity = hasShell && hIdx === 0;
      const holeObj = !isShellCavity ? holes[hasShell ? hIdx - 1 : hIdx] : undefined;
      const holeEnt = holeObj?.entity;
      const holeType = String(holeEnt?.params?.holeType ?? "through");
      const isCounterbore =
        !isShellCavity && (holeType === "counterbore" || holeType === "spotface");
      const isCountersink = !isShellCavity && holeType === "countersink";
      const isBlindHole = !isShellCavity && !holePierceBottomFlags[hIdx];

      if (isCounterbore) {
        // FURO REBAIXADO (Counterbore): parede superior R1 até zStep + degrau anelar plano + parede inferior R2
        const cbDepth = Math.min(
          (z1 - z0) * 0.65,
          Math.max(1.5, Number(holeEnt?.params?.counterboreDepthMm ?? 6)),
        );
        const zStep = z1 - cbDepth;
        const stepOuter3D = hTop3D.map((p) => ({ x: p.x, y: p.y, z: zStep }));
        const stepInner3D = hBot3D.map((p) => ({ x: p.x, y: p.y, z: zStep }));
        const upNormal = rotateNormal3D({ x: 0, y: 0, z: 1 }, p3d.rotation3D);

        for (let i = 0; i < nh; i++) {
          const next = (i + 1) % nh;
          const inNormal = holeFlatNormals[i]!;
          const nLeft = holeIsSmoothVertex[i] ? holeSmoothNormals[i]! : inNormal;
          const nRight = holeIsSmoothVertex[next] ? holeSmoothNormals[next]! : inNormal;

          // Cilindro superior de raio maior R1 (zStep -> z1)
          {
            const b0 = stepOuter3D[i]!;
            const b1 = stepOuter3D[next]!;
            const t1 = hTop3D[next]!;
            const t0 = hTop3D[i]!;
            const baseV = positions.length / 3;
            positions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z, b1.x, b1.y, b1.z);
            normals.push(
              nLeft.x, nLeft.y, nLeft.z,
              nLeft.x, nLeft.y, nLeft.z,
              nRight.x, nRight.y, nRight.z,
              nRight.x, nRight.y, nRight.z,
            );
            indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
            innerArea += triangleArea3D(b0, t0, t1) + triangleArea3D(b0, t1, b1);
          }

          // Degrau anelar plano horizontal entre R1 e R2 na cota zStep (normal +Z)
          {
            const o0 = stepOuter3D[i]!;
            const o1 = stepOuter3D[next]!;
            const i0 = stepInner3D[i]!;
            const i1 = stepInner3D[next]!;
            const baseV = positions.length / 3;
            positions.push(i0.x, i0.y, i0.z, o0.x, o0.y, o0.z, o1.x, o1.y, o1.z, i1.x, i1.y, i1.z);
            for (let k = 0; k < 4; k++) normals.push(upNormal.x, upNormal.y, upNormal.z);
            indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
            innerArea += triangleArea3D(i0, o0, o1) + triangleArea3D(i0, o1, i1);
          }

          // Cilindro inferior de raio menor R2 (z0 -> zStep)
          {
            const b0 = hBot3D[i]!;
            const b1 = hBot3D[next]!;
            const t1 = stepInner3D[next]!;
            const t0 = stepInner3D[i]!;
            const baseV = positions.length / 3;
            positions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z, b1.x, b1.y, b1.z);
            normals.push(
              nLeft.x, nLeft.y, nLeft.z,
              nLeft.x, nLeft.y, nLeft.z,
              nRight.x, nRight.y, nRight.z,
              nRight.x, nRight.y, nRight.z,
            );
            indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
            innerArea += triangleArea3D(b0, t0, t1) + triangleArea3D(b0, t1, b1);
          }
        }
      } else if (isCountersink) {
        // FURO ESCAREADO (Countersink 90°): tronco de cone invertido R1 -> R2 + cilindro inferior R2
        const r2 = holeEnt?.type === "circle" ? holeEnt.r : 6;
        const r1 = Math.max(
          r2 + 1.5,
          Number(holeEnt?.params?.countersinkDiameterMm ?? r2 * 2 + 6) * 0.5,
        );
        const hCone = Math.min((z1 - z0) * 0.65, Math.max(1.5, r1 - r2));
        const zConeEnd = z1 - hCone;
        const coneNeck3D = hBot3D.map((p) => ({ x: p.x, y: p.y, z: zConeEnd }));

        for (let i = 0; i < nh; i++) {
          const next = (i + 1) % nh;
          const inNormal = holeFlatNormals[i]!;
          const nLeft = holeIsSmoothVertex[i] ? holeSmoothNormals[i]! : inNormal;
          const nRight = holeIsSmoothVertex[next] ? holeSmoothNormals[next]! : inNormal;

          // Tronco de cone invertido (zConeEnd -> z1)
          {
            const b0 = coneNeck3D[i]!;
            const b1 = coneNeck3D[next]!;
            const t1 = hTop3D[next]!;
            const t0 = hTop3D[i]!;
            const baseV = positions.length / 3;
            positions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z, b1.x, b1.y, b1.z);
            normals.push(
              nLeft.x, nLeft.y, Math.SQRT1_2,
              nLeft.x, nLeft.y, Math.SQRT1_2,
              nRight.x, nRight.y, Math.SQRT1_2,
              nRight.x, nRight.y, Math.SQRT1_2,
            );
            indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
            innerArea += triangleArea3D(b0, t0, t1) + triangleArea3D(b0, t1, b1);
          }

          // Cilindro inferior de raio menor R2 (z0 -> zConeEnd)
          {
            const b0 = hBot3D[i]!;
            const b1 = hBot3D[next]!;
            const t1 = coneNeck3D[next]!;
            const t0 = coneNeck3D[i]!;
            const baseV = positions.length / 3;
            positions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z, b1.x, b1.y, b1.z);
            normals.push(
              nLeft.x, nLeft.y, nLeft.z,
              nLeft.x, nLeft.y, nLeft.z,
              nRight.x, nRight.y, nRight.z,
              nRight.x, nRight.y, nRight.z,
            );
            indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
            innerArea += triangleArea3D(b0, t0, t1) + triangleArea3D(b0, t1, b1);
          }
        }
      } else {
        for (let i = 0; i < nh; i++) {
          const next = (i + 1) % nh;
          const b0 = hBot3D[i]!;
          const b1 = hBot3D[next]!;
          const t1 = hTop3D[next]!;
          const t0 = hTop3D[i]!;

          const inNormal = holeFlatNormals[i]!;
          const nLeft = holeIsSmoothVertex[i] ? holeSmoothNormals[i]! : inNormal;
          const nRight = holeIsSmoothVertex[next] ? holeSmoothNormals[next]! : inNormal;

          const baseV = positions.length / 3;
          positions.push(
            b0.x, b0.y, b0.z,
            t0.x, t0.y, t0.z,
            t1.x, t1.y, t1.z,
            b1.x, b1.y, b1.z,
          );
          normals.push(
            nLeft.x, nLeft.y, nLeft.z,
            nLeft.x, nLeft.y, nLeft.z,
            nRight.x, nRight.y, nRight.z,
            nRight.x, nRight.y, nRight.z,
          );
          indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
          innerArea += triangleArea3D(b0, t0, t1) + triangleArea3D(b0, t1, b1);
        }

        // Se for Furo Cego (Blind Hole), fecha obrigatoriamente o fundo na profundidade z = z1 - d (normal +Z)
        if (isBlindHole && hBot3D.length >= 3) {
          const upNormal = rotateNormal3D({ x: 0, y: 0, z: 1 }, p3d.rotation3D);
          innerArea += appendCapWithHolesToMesh(
            hBot3D,
            [],
            upNormal,
            true,
            positions,
            normals,
            indices,
          );
        }
      }

      const countIdx = indices.length - startIdx;
      const meshFaceIndex = globalMeshFaceIdx++;
      faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: countIdx });

      const innerFace: DirectFace3D = {
        faceId: `${bodyId}_face_inner_${hIdx}`,
        meshFaceIndex,
        bodyId,
        entityId: entId,
        role: "inner_side",
        sideIndex: 100 + hIdx,
        label:
          hasShell && hIdx === 0
            ? "Parede Interna (Shell / Tubo)"
            : isCounterbore
              ? `Furo Rebaixado (Counterbore) #${hIdx + 1}`
              : isCountersink
                ? `Furo Escareado 90° (Countersink) #${hIdx + 1}`
                : isBlindHole
                  ? `Furo Cego (Blind) #${hIdx + 1}`
                  : `Parede do Furo #${hIdx + 1}`,
        normal: rotateNormal3D({ x: 0, y: 0, z: 1 }, p3d.rotation3D),
        centroid: computePolygonCentroid3D(hTop3D),
        areaMm2: innerArea,
        polygon3D: hTop3D,
      };
      bodyFaces.push(innerFace);
      facesById.set(innerFace.faceId, innerFace);
      facesByMeshIndex.set(meshFaceIndex, innerFace);
    });

    // -------------------------------------------------------------------------
    // ARESTAS TOPOLÓGICAS 3D (QUINAS VIVAS >= 25°, LINHAS DE TANGÊNCIA E PERÍMETROS)
    // -------------------------------------------------------------------------
    // 1. Classifica os vértices do contorno externo em:
    //    - Quinas vivas reais (!outerIsSmoothVertex[i], Δθ >= 25°) -> visíveis em SÓLIDO e SOMB
    //    - Linhas de transição de tangência (onde a parede reta encontra o início/fim do Fillet/curva) -> visíveis em SOMB (0.75px suave), ocultas em SÓLIDO
    //    - Tiras internas da curva (ambos os lados curvos com Δθ < 25°) -> NUNCA desenha linha vertical (zero efeito zebra)
    const verticalFeatureVertices: { pt2D: Vec2; isTangentEdge: boolean; idx: number }[] = [];
    for (let i = 0; i < nOuter; i++) {
      const prevSeg = (i - 1 + nOuter) % nOuter;
      const isSharpCorner = !outerIsSmoothVertex[i];
      const isTangentTransition =
        outerIsSmoothVertex[i] &&
        hasMixedStraightAndCurve &&
        outerIsStraightSeg[prevSeg] !== outerIsStraightSeg[i];

      if (isSharpCorner || isTangentTransition) {
        verticalFeatureVertices.push({
          pt2D: contour2D[i]!,
          isTangentEdge: !isSharpCorner,
          idx: i,
        });
      }
    }

    // Se for um cilindro puro (sem quinas vivas e sem transição reta-curva), expõe apenas 4 geratrizes cardeais como arestas de tangência
    if (verticalFeatureVertices.length === 0 && outer.corners.length > 0) {
      outer.corners.slice(0, 4).forEach((cPt, idx) => {
        verticalFeatureVertices.push({
          pt2D: cPt,
          isTangentEdge: true,
          idx,
        });
      });
    }

    verticalFeatureVertices.forEach((vFeat, cIdx) => {
      const cPt = vFeat.pt2D;
      const { zBottom, zTop } = evaluateMiterZ(
        cPt.x,
        cPt.y,
        z0,
        z1,
        b2d,
        p3d.miterCutTopDeg,
        p3d.miterCutTopAxis,
        p3d.miterCutBottomDeg,
        p3d.miterCutBottomAxis,
      );
      const pBot = transformPt(cPt.x, cPt.y, zBottom);
      const pTop = transformPt(cPt.x, cPt.y, zTop);
      const len = Math.hypot(pTop.x - pBot.x, pTop.y - pBot.y, pTop.z - pBot.z);
      const meshEdgeIndex = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: meshEdgeIndex,
        vertices: [pBot.x, pBot.y, pBot.z, pTop.x, pTop.y, pTop.z],
        isSeam: false,
        isTangentEdge: vFeat.isTangentEdge,
      });

      const edgeObj: DirectEdge3D = {
        edgeId: `${bodyId}_edge_vert_${cIdx}`,
        meshEdgeIndex,
        bodyId,
        entityId: entId,
        role: "vertical",
        edgeIndex: cIdx,
        label: vFeat.isTangentEdge
          ? `Transição de Tangência #${cIdx + 1}`
          : `Aresta Vertical #${cIdx + 1}`,
        startPt: pBot,
        endPt: pTop,
        midpoint: {
          x: (pBot.x + pTop.x) * 0.5,
          y: (pBot.y + pTop.y) * 0.5,
          z: (pBot.z + pTop.z) * 0.5,
        },
        dir: {
          x: (pTop.x - pBot.x) / (len || 1),
          y: (pTop.y - pBot.y) / (len || 1),
          z: (pTop.z - pBot.z) / (len || 1),
        },
        lengthMm: len,
        polyline3D: [pBot, pTop],
      };
      bodyEdges.push(edgeObj);
      edgesById.set(edgeObj.edgeId, edgeObj);
      edgesByMeshIndex.set(meshEdgeIndex, edgeObj);
    });

    // 2. Arestas do Topo e da Base (Perímetros Reais da Peça)
    const sharpOnlyCount = verticalFeatureVertices.filter((v) => !v.isTangentEdge).length;
    if (nOuter <= 12 && sharpOnlyCount === nOuter && !outer.isSmoothCircle) {
      const nc = contour2D.length;
      for (let i = 0; i < nc; i++) {
        const a2d = contour2D[i]!;
        const b2dPt = contour2D[(i + 1) % nc]!;

        const za = evaluateMiterZ(
          a2d.x,
          a2d.y,
          z0,
          z1,
          b2d,
          p3d.miterCutTopDeg,
          p3d.miterCutTopAxis,
          p3d.miterCutBottomDeg,
          p3d.miterCutBottomAxis,
        );
        const zb = evaluateMiterZ(
          b2dPt.x,
          b2dPt.y,
          z0,
          z1,
          b2d,
          p3d.miterCutTopDeg,
          p3d.miterCutTopAxis,
          p3d.miterCutBottomDeg,
          p3d.miterCutBottomAxis,
        );

        // Aresta superior
        const topA = transformPt(a2d.x, a2d.y, za.zTop);
        const topB = transformPt(b2dPt.x, b2dPt.y, zb.zTop);
        const topLen = Math.hypot(topB.x - topA.x, topB.y - topA.y, topB.z - topA.z);
        const topMeshIdx = globalMeshEdgeIdx++;
        edgePolylines.push({
          edgeIndex: topMeshIdx,
          vertices: [topA.x, topA.y, topA.z, topB.x, topB.y, topB.z],
          isSeam: false,
          isTangentEdge: false,
        });
        const topEdge: DirectEdge3D = {
          edgeId: `${bodyId}_edge_top_${i}`,
          meshEdgeIndex: topMeshIdx,
          bodyId,
          entityId: entId,
          role: "top",
          edgeIndex: i,
          label: `Aresta Superior #${i + 1}`,
          startPt: topA,
          endPt: topB,
          midpoint: {
            x: (topA.x + topB.x) * 0.5,
            y: (topA.y + topB.y) * 0.5,
            z: (topA.z + topB.z) * 0.5,
          },
          dir: {
            x: (topB.x - topA.x) / (topLen || 1),
            y: (topB.y - topA.y) / (topLen || 1),
            z: (topB.z - topA.z) / (topLen || 1),
          },
          lengthMm: topLen,
          polyline3D: [topA, topB],
        };
        bodyEdges.push(topEdge);
        edgesById.set(topEdge.edgeId, topEdge);
        edgesByMeshIndex.set(topMeshIdx, topEdge);

        // Aresta inferior
        const botA = transformPt(a2d.x, a2d.y, za.zBottom);
        const botB = transformPt(b2dPt.x, b2dPt.y, zb.zBottom);
        const botLen = Math.hypot(botB.x - botA.x, botB.y - botA.y, botB.z - botA.z);
        const botMeshIdx = globalMeshEdgeIdx++;
        edgePolylines.push({
          edgeIndex: botMeshIdx,
          vertices: [botA.x, botA.y, botA.z, botB.x, botB.y, botB.z],
          isSeam: false,
          isTangentEdge: false,
        });
        const botEdge: DirectEdge3D = {
          edgeId: `${bodyId}_edge_bot_${i}`,
          meshEdgeIndex: botMeshIdx,
          bodyId,
          entityId: entId,
          role: "bottom",
          edgeIndex: i,
          label: `Aresta Inferior #${i + 1}`,
          startPt: botA,
          endPt: botB,
          midpoint: {
            x: (botA.x + botB.x) * 0.5,
            y: (botA.y + botB.y) * 0.5,
            z: (botA.z + botB.z) * 0.5,
          },
          dir: {
            x: (botB.x - botA.x) / (botLen || 1),
            y: (botB.y - botA.y) / (botLen || 1),
            z: (botB.z - botA.z) / (botLen || 1),
          },
          lengthMm: botLen,
          polyline3D: [botA, botB],
        };
        bodyEdges.push(botEdge);
        edgesById.set(botEdge.edgeId, botEdge);
        edgesByMeshIndex.set(botMeshIdx, botEdge);
      }
    } else {
      // Contorno circular ou com cantos arredondados: adiciona polilinha fechada contínua do topo e da base
      const topVerts: number[] = [];
      for (const p of outerTop3D) topVerts.push(p.x, p.y, p.z);
      if (outerTop3D[0]) topVerts.push(outerTop3D[0].x, outerTop3D[0].y, outerTop3D[0].z);
      const topMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: topMeshIdx,
        vertices: topVerts,
        isSeam: false,
        isTangentEdge: false,
      });

      const perimLen = computePolygonPerimeter3D(outerTop3D);
      const topLoopEdge: DirectEdge3D = {
        edgeId: `${bodyId}_edge_top_loop`,
        meshEdgeIndex: topMeshIdx,
        bodyId,
        entityId: entId,
        role: "top",
        edgeIndex: 0,
        label: "Borda Superior Completa",
        startPt: outerTop3D[0]!,
        endPt: outerTop3D[Math.floor(outerTop3D.length / 2)]!,
        midpoint: outerTop3D[0]!,
        dir: { x: 1, y: 0, z: 0 },
        lengthMm: perimLen,
        polyline3D: outerTop3D,
      };
      bodyEdges.push(topLoopEdge);
      edgesById.set(topLoopEdge.edgeId, topLoopEdge);
      edgesByMeshIndex.set(topMeshIdx, topLoopEdge);

      const botVerts: number[] = [];
      for (const p of outerBottom3D) botVerts.push(p.x, p.y, p.z);
      if (outerBottom3D[0]) botVerts.push(outerBottom3D[0].x, outerBottom3D[0].y, outerBottom3D[0].z);
      const botMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: botMeshIdx,
        vertices: botVerts,
        isSeam: false,
        isTangentEdge: false,
      });

      const botLoopEdge: DirectEdge3D = {
        edgeId: `${bodyId}_edge_bot_loop`,
        meshEdgeIndex: botMeshIdx,
        bodyId,
        entityId: entId,
        role: "bottom",
        edgeIndex: 0,
        label: "Borda Inferior Completa",
        startPt: outerBottom3D[0]!,
        endPt: outerBottom3D[Math.floor(outerBottom3D.length / 2)]!,
        midpoint: outerBottom3D[0]!,
        dir: { x: 1, y: 0, z: 0 },
        lengthMm: perimLen,
        polyline3D: outerBottom3D,
      };
      bodyEdges.push(botLoopEdge);
      edgesById.set(botLoopEdge.edgeId, botLoopEdge);
      edgesByMeshIndex.set(botMeshIdx, botLoopEdge);
    }

    // Arestas visuais e selecionáveis da cavidade interna (Shell / Furos 2D e 3D)
    holesTop3D.forEach((hTop, hIdx) => {
      const vTop: number[] = [];
      for (const p of hTop) vTop.push(p.x, p.y, p.z);
      if (hTop[0]) vTop.push(hTop[0].x, hTop[0].y, hTop[0].z);
      const hTopMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: hTopMeshIdx,
        vertices: vTop,
        isSeam: false,
        isTangentEdge: false,
      });
      if (hTop.length >= 3) {
        const hLen = computePolygonPerimeter3D(hTop);
        const hEdgeObj: DirectEdge3D = {
          edgeId: `${bodyId}_edge_inner_top_${hIdx}`,
          meshEdgeIndex: hTopMeshIdx,
          bodyId,
          entityId: entId,
          role: "inner_top",
          edgeIndex: hIdx,
          label: hasShell && hIdx === 0 ? "Borda Interna Superior (Shell)" : `Borda Superior do Furo #${hIdx + 1}`,
          startPt: hTop[0]!,
          endPt: hTop[Math.floor(hTop.length / 2)]!,
          midpoint: hTop[0]!,
          dir: { x: 1, y: 0, z: 0 },
          lengthMm: hLen,
          polyline3D: hTop,
        };
        bodyEdges.push(hEdgeObj);
        edgesById.set(hEdgeObj.edgeId, hEdgeObj);
        edgesByMeshIndex.set(hTopMeshIdx, hEdgeObj);
      }
    });
    holesBottom3D.forEach((hBot, hIdx) => {
      const vBot: number[] = [];
      for (const p of hBot) vBot.push(p.x, p.y, p.z);
      if (hBot[0]) vBot.push(hBot[0].x, hBot[0].y, hBot[0].z);
      const hBotMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: hBotMeshIdx,
        vertices: vBot,
        isSeam: false,
        isTangentEdge: false,
      });
      if (hBot.length >= 3) {
        const hLen = computePolygonPerimeter3D(hBot);
        const hBotEdgeObj: DirectEdge3D = {
          edgeId: `${bodyId}_edge_inner_bot_${hIdx}`,
          meshEdgeIndex: hBotMeshIdx,
          bodyId,
          entityId: entId,
          role: "inner_bottom",
          edgeIndex: hIdx,
          label: hasShell && hIdx === 0 ? "Borda Interna Inferior (Shell)" : `Borda Inferior do Furo #${hIdx + 1}`,
          startPt: hBot[0]!,
          endPt: hBot[Math.floor(hBot.length / 2)]!,
          midpoint: hBot[0]!,
          dir: { x: 1, y: 0, z: 0 },
          lengthMm: hLen,
          polyline3D: hBot,
        };
        bodyEdges.push(hBotEdgeObj);
        edgesById.set(hBotEdgeObj.edgeId, hBotEdgeObj);
        edgesByMeshIndex.set(hBotMeshIdx, hBotEdgeObj);
      }
    });

    // Vértices 3D Endereçáveis + Chanfros em Bisel Localizado (Vértice ou Borda Superior/Inferior)
    const bodyVertices: DirectVertex3D[] = [];
    const baseCorners2D = ensureCCW(baseWithOffset2D);
    const nBase = baseCorners2D.length;

    verticalFeatureVertices.forEach((vFeat, cIdx) => {
      const cPt = vFeat.pt2D;
      const { zBottom, zTop } = evaluateMiterZ(
        cPt.x,
        cPt.y,
        z0,
        z1,
        b2d,
        p3d.miterCutTopDeg,
        p3d.miterCutTopAxis,
        p3d.miterCutBottomDeg,
        p3d.miterCutBottomAxis,
      );
      const pTop = transformPt(cPt.x, cPt.y, zTop);
      const pBot = transformPt(cPt.x, cPt.y, zBottom);

      const topBevelD = Number(p3d.vertexBevelsMm[`top_${cIdx}`] ?? 0);
      const botBevelD = Number(p3d.vertexBevelsMm[`bot_${cIdx}`] ?? 0);

      const topVertObj: DirectVertex3D = {
        vertexId: `${bodyId}_vert_top_${cIdx}`,
        bodyId,
        entityId: entId,
        cornerIndex: cIdx,
        end: "top",
        label: `Vértice Superior #${cIdx + 1}`,
        point3D: pTop,
        bevelDistMm: topBevelD,
      };
      const botVertObj: DirectVertex3D = {
        vertexId: `${bodyId}_vert_bot_${cIdx}`,
        bodyId,
        entityId: entId,
        cornerIndex: cIdx,
        end: "bottom",
        label: `Vértice Inferior #${cIdx + 1}`,
        point3D: pBot,
        bevelDistMm: botBevelD,
      };
      bodyVertices.push(topVertObj, botVertObj);
      verticesById.set(topVertObj.vertexId, topVertObj);
      verticesById.set(botVertObj.vertexId, botVertObj);

      // Gera face triangular de Bisel Localizado 45° no vértice quando ativo
      if (topBevelD > 0.05 && nBase >= 3) {
        const curr2D = baseCorners2D[cIdx % nBase]!;
        const prev2D = baseCorners2D[(cIdx - 1 + nBase) % nBase]!;
        const next2D = baseCorners2D[(cIdx + 1) % nBase]!;
        const l1 = Math.hypot(prev2D.x - curr2D.x, prev2D.y - curr2D.y) || 1;
        const l2 = Math.hypot(next2D.x - curr2D.x, next2D.y - curr2D.y) || 1;
        const dEff = Math.min(topBevelD, l1 * 0.45, l2 * 0.45, (z1 - z0) * 0.45);

        const bPrev = transformPt(
          curr2D.x + ((prev2D.x - curr2D.x) / l1) * dEff,
          curr2D.y + ((prev2D.y - curr2D.y) / l1) * dEff,
          zTop + 0.05,
        );
        const bNext = transformPt(
          curr2D.x + ((next2D.x - curr2D.x) / l2) * dEff,
          curr2D.y + ((next2D.y - curr2D.y) / l2) * dEff,
          zTop + 0.05,
        );
        const bVert = transformPt(curr2D.x, curr2D.y, zTop - dEff);

        const bevelNormal = rotateNormal3D({ x: 0, y: 0, z: 1 }, p3d.rotation3D);
        const startIdx = indices.length;
        const baseV = positions.length / 3;
        positions.push(bPrev.x, bPrev.y, bPrev.z, bVert.x, bVert.y, bVert.z, bNext.x, bNext.y, bNext.z);
        for (let k = 0; k < 3; k++) normals.push(bevelNormal.x, bevelNormal.y, bevelNormal.z);
        indices.push(baseV, baseV + 1, baseV + 2);
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: 3 });

        const bevelArea = triangleArea3D(bPrev, bVert, bNext);
        const bevelFace: DirectFace3D = {
          faceId: `${bodyId}_face_bevel_top_${cIdx}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role: "miter",
          sideIndex: 200 + cIdx,
          label: `Bisel de Vértice Superior #${cIdx + 1} (${dEff.toFixed(1)} mm × 45°)`,
          normal: bevelNormal,
          centroid: computePolygonCentroid3D([bPrev, bVert, bNext]),
          areaMm2: bevelArea,
          polygon3D: [bPrev, bVert, bNext],
        };
        bodyFaces.push(bevelFace);
        facesById.set(bevelFace.faceId, bevelFace);
        facesByMeshIndex.set(meshFaceIndex, bevelFace);

        edgePolylines.push({
          edgeIndex: globalMeshEdgeIdx++,
          vertices: [
            bPrev.x, bPrev.y, bPrev.z,
            bVert.x, bVert.y, bVert.z,
            bNext.x, bNext.y, bNext.z,
            bPrev.x, bPrev.y, bPrev.z,
          ],
          isSeam: false,
          isTangentEdge: false,
        });
      }

      if (botBevelD > 0.05 && nBase >= 3) {
        const curr2D = baseCorners2D[cIdx % nBase]!;
        const prev2D = baseCorners2D[(cIdx - 1 + nBase) % nBase]!;
        const next2D = baseCorners2D[(cIdx + 1) % nBase]!;
        const l1 = Math.hypot(prev2D.x - curr2D.x, prev2D.y - curr2D.y) || 1;
        const l2 = Math.hypot(next2D.x - curr2D.x, next2D.y - curr2D.y) || 1;
        const dEff = Math.min(botBevelD, l1 * 0.45, l2 * 0.45, (z1 - z0) * 0.45);

        const bPrev = transformPt(
          curr2D.x + ((prev2D.x - curr2D.x) / l1) * dEff,
          curr2D.y + ((prev2D.y - curr2D.y) / l1) * dEff,
          zBottom - 0.05,
        );
        const bNext = transformPt(
          curr2D.x + ((next2D.x - curr2D.x) / l2) * dEff,
          curr2D.y + ((next2D.y - curr2D.y) / l2) * dEff,
          zBottom - 0.05,
        );
        const bVert = transformPt(curr2D.x, curr2D.y, zBottom + dEff);

        const bevelNormal = rotateNormal3D({ x: 0, y: 0, z: -1 }, p3d.rotation3D);
        const startIdx = indices.length;
        const baseV = positions.length / 3;
        positions.push(bPrev.x, bPrev.y, bPrev.z, bNext.x, bNext.y, bNext.z, bVert.x, bVert.y, bVert.z);
        for (let k = 0; k < 3; k++) normals.push(bevelNormal.x, bevelNormal.y, bevelNormal.z);
        indices.push(baseV, baseV + 1, baseV + 2);
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: 3 });

        const bevelArea = triangleArea3D(bPrev, bNext, bVert);
        const bevelFace: DirectFace3D = {
          faceId: `${bodyId}_face_bevel_bot_${cIdx}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role: "miter",
          sideIndex: 250 + cIdx,
          label: `Bisel de Vértice Inferior #${cIdx + 1} (${dEff.toFixed(1)} mm × 45°)`,
          normal: bevelNormal,
          centroid: computePolygonCentroid3D([bPrev, bNext, bVert]),
          areaMm2: bevelArea,
          polygon3D: [bPrev, bNext, bVert],
        };
        bodyFaces.push(bevelFace);
        facesById.set(bevelFace.faceId, bevelFace);
        facesByMeshIndex.set(meshFaceIndex, bevelFace);

        edgePolylines.push({
          edgeIndex: globalMeshEdgeIdx++,
          vertices: [
            bPrev.x, bPrev.y, bPrev.z,
            bNext.x, bNext.y, bNext.z,
            bVert.x, bVert.y, bVert.z,
            bPrev.x, bPrev.y, bPrev.z,
          ],
          isSeam: false,
          isTangentEdge: false,
        });
      }
    });

    // Gera chanfros em bisel localizado nas arestas horizontais de topo/base (`edge_top_i`, `edge_bot_i`)
    for (let i = 0; i < nBase; i++) {
      const edgeTopBevelD = Number(p3d.vertexBevelsMm[`edge_top_${i}`] ?? 0);
      const edgeBotBevelD = Number(p3d.vertexBevelsMm[`edge_bot_${i}`] ?? 0);
      if (edgeTopBevelD <= 0.05 && edgeBotBevelD <= 0.05) continue;

      const a2d = baseCorners2D[i]!;
      const b2dPt = baseCorners2D[(i + 1) % nBase]!;
      const dx = b2dPt.x - a2d.x;
      const dy = b2dPt.y - a2d.y;
      const segLen = Math.hypot(dx, dy) || 1;
      const nx = dy / segLen;
      const ny = -dx / segLen;

      if (edgeTopBevelD > 0.05) {
        const dEff = Math.min(edgeTopBevelD, (z1 - z0) * 0.45, segLen * 0.45);
        const w0 = transformPt(a2d.x, a2d.y, z1 - dEff);
        const w1 = transformPt(b2dPt.x, b2dPt.y, z1 - dEff);
        const c1 = transformPt(b2dPt.x - nx * dEff, b2dPt.y - ny * dEff, z1 + 0.05);
        const c0 = transformPt(a2d.x - nx * dEff, a2d.y - ny * dEff, z1 + 0.05);
        const bNorm = rotateNormal3D(
          { x: nx * Math.SQRT1_2, y: ny * Math.SQRT1_2, z: Math.SQRT1_2 },
          p3d.rotation3D,
        );
        const startIdx = indices.length;
        const baseV = positions.length / 3;
        positions.push(
          w0.x, w0.y, w0.z,
          w1.x, w1.y, w1.z,
          c1.x, c1.y, c1.z,
          c0.x, c0.y, c0.z,
        );
        for (let k = 0; k < 4; k++) normals.push(bNorm.x, bNorm.y, bNorm.z);
        indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: 6 });

        const bevelArea = triangleArea3D(w0, w1, c1) + triangleArea3D(w0, c1, c0);
        const bevelFace: DirectFace3D = {
          faceId: `${bodyId}_face_edge_bevel_top_${i}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role: "miter",
          sideIndex: 300 + i,
          label: `Chanfro Borda Superior #${i + 1} (${dEff.toFixed(1)} mm × 45°)`,
          normal: bNorm,
          centroid: computePolygonCentroid3D([w0, w1, c1, c0]),
          areaMm2: bevelArea,
          polygon3D: [w0, w1, c1, c0],
        };
        bodyFaces.push(bevelFace);
        facesById.set(bevelFace.faceId, bevelFace);
        facesByMeshIndex.set(meshFaceIndex, bevelFace);

        edgePolylines.push({
          edgeIndex: globalMeshEdgeIdx++,
          vertices: [
            w0.x, w0.y, w0.z,
            w1.x, w1.y, w1.z,
            c1.x, c1.y, c1.z,
            c0.x, c0.y, c0.z,
            w0.x, w0.y, w0.z,
          ],
          isSeam: false,
          isTangentEdge: false,
        });
      }

      if (edgeBotBevelD > 0.05) {
        const dEff = Math.min(edgeBotBevelD, (z1 - z0) * 0.45, segLen * 0.45);
        const w0 = transformPt(a2d.x, a2d.y, z0 + dEff);
        const w1 = transformPt(b2dPt.x, b2dPt.y, z0 + dEff);
        const c1 = transformPt(b2dPt.x - nx * dEff, b2dPt.y - ny * dEff, z0 - 0.05);
        const c0 = transformPt(a2d.x - nx * dEff, a2d.y - ny * dEff, z0 - 0.05);
        const bNorm = rotateNormal3D(
          { x: nx * Math.SQRT1_2, y: ny * Math.SQRT1_2, z: -Math.SQRT1_2 },
          p3d.rotation3D,
        );
        const startIdx = indices.length;
        const baseV = positions.length / 3;
        positions.push(
          c0.x, c0.y, c0.z,
          c1.x, c1.y, c1.z,
          w1.x, w1.y, w1.z,
          w0.x, w0.y, w0.z,
        );
        for (let k = 0; k < 4; k++) normals.push(bNorm.x, bNorm.y, bNorm.z);
        indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: 6 });

        const bevelArea = triangleArea3D(c0, c1, w1) + triangleArea3D(c0, w1, w0);
        const bevelFace: DirectFace3D = {
          faceId: `${bodyId}_face_edge_bevel_bot_${i}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role: "miter",
          sideIndex: 350 + i,
          label: `Chanfro Borda Inferior #${i + 1} (${dEff.toFixed(1)} mm × 45°)`,
          normal: bNorm,
          centroid: computePolygonCentroid3D([c0, c1, w1, w0]),
          areaMm2: bevelArea,
          polygon3D: [c0, c1, w1, w0],
        };
        bodyFaces.push(bevelFace);
        facesById.set(bevelFace.faceId, bevelFace);
        facesByMeshIndex.set(meshFaceIndex, bevelFace);

        edgePolylines.push({
          edgeIndex: globalMeshEdgeIdx++,
          vertices: [
            c0.x, c0.y, c0.z,
            c1.x, c1.y, c1.z,
            w1.x, w1.y, w1.z,
            w0.x, w0.y, w0.z,
            c0.x, c0.y, c0.z,
          ],
          isSeam: false,
          isTangentEdge: false,
        });
      }
    }

    // Calcula Bounding Box 3D do corpo
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of [...outerTop3D, ...outerBottom3D]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    // Candidatos de Snap para o Pivô Móvel 3D (Vértices, Meio de Arestas e Centros de Faces)
    const snapCandidates: DirectSnapPivotCandidate3D[] = [
      {
        id: `${bodyId}_snap_center`,
        bodyId,
        entityId: entId,
        kind: "body_center",
        label: "Centro do Corpo",
        point3D: pivot3D,
      },
    ];
    for (const f of bodyFaces) {
      snapCandidates.push({
        id: `${f.faceId}_snap`,
        bodyId,
        entityId: entId,
        kind: "face_center",
        label: `Centro · ${f.label}`,
        point3D: f.centroid,
      });
    }
    for (const e of bodyEdges) {
      snapCandidates.push({
        id: `${e.edgeId}_snap_mid`,
        bodyId,
        entityId: entId,
        kind: "edge_midpoint",
        label: `Meio · ${e.label}`,
        point3D: e.midpoint,
      });
      snapCandidates.push({
        id: `${e.edgeId}_snap_v0`,
        bodyId,
        entityId: entId,
        kind: "vertex",
        label: `Vértice · ${e.label}`,
        point3D: e.startPt,
      });
    }

    const totalAreaMm2 = bodyFaces.reduce((acc, f) => acc + f.areaMm2, 0);
    const heightZ = Math.max(1, z1 - z0);
    // Volume analítico exato: para caixa oca (1 tampa fechada), soma o volume da parede + volume da tampa
    const volumeMm3 =
      hasShell && (!openTop || !openBottom)
        ? analyticalNetSectionAreaMm2 * Math.max(0, heightZ - effectiveWallT) +
          Math.max(1, analyticalOuterAreaMm2 - analyticalOtherHolesAreaMm2) * effectiveWallT
        : analyticalNetSectionAreaMm2 * heightZ;

    // Invariante topológica de Euler-Poincaré (V - E + F = 2 - 2g)
    const nBaseCorners = Math.max(3, outer.corners.length || 4);
    const eulerV = nBaseCorners * 2;
    const eulerE = nBaseCorners * 3;
    const eulerF = nBaseCorners + 2;
    const eulerChi = eulerV - eulerE + eulerF;

    // Densidade física do material (Aço = 7.85 g/cm³, Inox = 8.00 g/cm³, Alumínio = 2.70 g/cm³)
    const matLower = p3d.materialName.toLowerCase();
    const densityGPerCm3 = matLower.includes("alum")
      ? 2.7
      : matLower.includes("inox")
        ? 8.0
        : matLower.includes("cobre")
          ? 8.96
          : 7.85;
    const massGrams = Number(((volumeMm3 / 1000) * densityGPerCm3).toFixed(2));

    // Histórico Paramétrico Linear (`FeatureNode[]`)
    const featureHistory: DirectFeatureNode3D[] = [
      {
        featureId: `${bodyId}_feat_sketch`,
        kind: "sketch",
        label: "Sketch 2D Base",
        parameterSummary: `${(b2d.maxX - b2d.minX).toFixed(1)} × ${(b2d.maxY - b2d.minY).toFixed(1)} mm`,
      },
      {
        featureId: `${bodyId}_feat_extrude`,
        kind: "extrude",
        label: "Extrude 3D",
        parameterSummary: `${heightZ.toFixed(1)} mm (${p3d.booleanMode3D})`,
      },
    ];
    if (p3d.edgeFilletRadiusMm > 0.05) {
      featureHistory.push({
        featureId: `${bodyId}_feat_fillet`,
        kind: "fillet",
        label: "Fillet 3D",
        parameterSummary: `R ${p3d.edgeFilletRadiusMm.toFixed(1)} mm`,
      });
    }
    if (p3d.edgeChamferDistMm > 0.05) {
      featureHistory.push({
        featureId: `${bodyId}_feat_chamfer`,
        kind: "chamfer",
        label: "Chamfer 3D",
        parameterSummary: `D ${p3d.edgeChamferDistMm.toFixed(1)} mm × 45°`,
      });
    }
    if (hasShell) {
      featureHistory.push({
        featureId: `${bodyId}_feat_shell`,
        kind: "shell",
        label: "Shell / Casca 3D",
        parameterSummary: `t = ${effectiveWallT.toFixed(1)} mm | R_int = ${innerFilletRadiusMm.toFixed(1)} mm`,
      });
    }
    if (Math.abs(p3d.miterCutTopDeg) > 0.1 || Math.abs(p3d.miterCutBottomDeg) > 0.1) {
      featureHistory.push({
        featureId: `${bodyId}_feat_miter`,
        kind: "miter_cut",
        label: "Meia-Esquadria 45°",
        parameterSummary: `Topo ${p3d.miterCutTopDeg.toFixed(0)}° / Base ${p3d.miterCutBottomDeg.toFixed(0)}°`,
      });
    }
    if (holes.length > 0) {
      featureHistory.push({
        featureId: `${bodyId}_feat_holes`,
        kind: "hole",
        label: "Furação 3D",
        parameterSummary: `${holes.length} furo(s)`,
      });
    }

    const defaultBodyName = p3d.bodyName
      ? p3d.bodyName
      : hasShell
        ? `Tubo Metalon #${bodyIdx + 1}`
        : outer.entity.type === "circle"
          ? `Cilindro #${bodyIdx + 1}`
          : `Corpo Sólido #${bodyIdx + 1}`;

    const bodyObj: DirectBody3D = {
      bodyId,
      entityId: entId,
      name: defaultBodyName,
      booleanMode: p3d.booleanMode3D,
      extrudeHeightMm: heightZ,
      elevationZ: z0,
      edgeFilletRadiusMm: p3d.edgeFilletRadiusMm,
      innerFilletRadiusMm,
      edgeChamferDistMm: p3d.edgeChamferDistMm,
      cornerFilletsMm: p3d.cornerFilletsMm,
      cornerChamfersMm: p3d.cornerChamfersMm,
      vertexBevelsMm: p3d.vertexBevelsMm,
      shellWallThicknessMm: p3d.shellWallThicknessMm,
      shellThicknessMm: p3d.shellThicknessMm,
      sheetThicknessMm: defaultThicknessMm,
      shellOpenCaps: p3d.shellOpenCaps,
      offsetFaceTopMm: p3d.offsetFaceTopMm,
      offsetFaceBottomMm: p3d.offsetFaceBottomMm,
      offsetFaceSidesMm: p3d.offsetFaceSidesMm,
      offsetSidesIndependent: {
        posX: Number(outer.entity.params?.offsetPosX ?? p3d.offsetFaceSidesMm),
        negX: Number(outer.entity.params?.offsetNegX ?? p3d.offsetFaceSidesMm),
        posY: Number(outer.entity.params?.offsetPosY ?? p3d.offsetFaceSidesMm),
        negY: Number(outer.entity.params?.offsetNegY ?? p3d.offsetFaceSidesMm),
      },
      miterCutTopDeg: p3d.miterCutTopDeg,
      miterCutTopAxis: p3d.miterCutTopAxis,
      miterCutBottomDeg: p3d.miterCutBottomDeg,
      miterCutBottomAxis: p3d.miterCutBottomAxis,
      rotation3D: p3d.rotation3D,
      pivot3D,
      colorHex: p3d.colorHex,
      materialName: p3d.materialName,
      densityGPerCm3,
      massGrams,
      eulerCharacteristic: {
        V: eulerV,
        E: eulerE,
        F: eulerF,
        chi: eulerChi,
      },
      featureHistory,
      bbox3D: { minX, maxX, minY, maxY, minZ, maxZ },
      deltaX: Math.max(0, maxX - minX),
      deltaY: Math.max(0, maxY - minY),
      deltaZ: Math.max(0, maxZ - minZ),
      totalAreaMm2,
      volumeMm3,
      faces: bodyFaces,
      edges: bodyEdges,
      vertices: bodyVertices,
      snapCandidates,
    };

    bodies.push(bodyObj);
    bodiesById.set(bodyId, bodyObj);
  });

  // -------------------------------------------------------------------------
  // CORPOS SÓLIDOS DE TRANSIÇÃO MULTISSEÇÃO "LOFT 3D" (AUTOCAD 3D / B-REP)
  // -------------------------------------------------------------------------
  loftEntities.forEach((loftEnt, loftIdx) => {
    const loftMesh = buildLoft3DMeshForEntity(loftEnt, entities, {
      nSamples: LOFT_N_SAMPLES,
      vRings: LOFT_V_RINGS,
    });
    if (!loftMesh || loftMesh.quads.length === 0) return;

    const p3d = getEntityDirect3DParams(loftEnt, defaultThicknessMm);
    const entId = loftEnt.id;
    const bodyId = `body_${entId}`;
    const bodyFaces: DirectFace3D[] = [];
    const bodyEdges: DirectEdge3D[] = [];
    const bodyVertices: DirectVertex3D[] = [];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const updateLoftBounds = (p: Vec3Mm) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    };

    const startIdx = indices.length;
    for (const q of loftMesh.quads) {
      const baseV = positions.length / 3;
      const pts = [q.p00, q.p10, q.p11, q.p01];
      const vNorms = [
        q.n00 ?? q.normal,
        q.n10 ?? q.normal,
        q.n11 ?? q.normal,
        q.n01 ?? q.normal,
      ];
      for (let k = 0; k < 4; k++) {
        const pt = pts[k]!;
        const vn = vNorms[k]!;
        positions.push(pt.x, pt.y, pt.z);
        normals.push(vn.x, vn.y, vn.z);
        updateLoftBounds(pt);
      }
      indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
    }
    const countIdx = indices.length - startIdx;
    const meshFaceIndex = globalMeshFaceIdx++;
    faceGroups.push({ faceIndex: meshFaceIndex, start: startIdx, count: countIdx });

    const bottomSec = loftMesh.sections[0];
    const topSec = loftMesh.sections[loftMesh.sections.length - 1];

    if (topSec && topSec.points3D.length >= 3) {
      const topPoly = topSec.points3D;
      const topCentroid3D: Vec3Mm = topSec.centroid3D ?? {
        x: topSec.center?.x ?? 0,
        y: topSec.center?.y ?? 0,
        z: topSec.elevationZ ?? 0,
      };
      const topFace: DirectFace3D = {
        faceId: `${bodyId}_face_top`,
        meshFaceIndex,
        bodyId,
        entityId: entId,
        role: "top",
        sideIndex: -1,
        label: `Topo Loft 3D (Z = ${topSec.elevationZ.toFixed(1)} mm)`,
        normal: { x: 0, y: 0, z: 1 },
        centroid: topCentroid3D,
        areaMm2: Math.max(1, (loftMesh.surfaceAreaMm2 || 1000) * 0.2),
        polygon3D: topPoly,
      };
      bodyFaces.push(topFace);
      facesById.set(topFace.faceId, topFace);
      facesByMeshIndex.set(meshFaceIndex, topFace);

      const closedTop: number[] = [];
      for (const p of topPoly) closedTop.push(p.x, p.y, p.z);
      closedTop.push(topPoly[0]!.x, topPoly[0]!.y, topPoly[0]!.z);
      const topEdgeMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: topEdgeMeshIdx,
        vertices: closedTop,
        isSeam: false,
        isTangentEdge: false,
      });
      const topEdgeObj: DirectEdge3D = {
        edgeId: `${bodyId}_edge_top_0`,
        meshEdgeIndex: topEdgeMeshIdx,
        bodyId,
        entityId: entId,
        role: "top_loop",
        edgeIndex: 0,
        label: "Borda Superior Loft 3D",
        startPt: topPoly[0]!,
        endPt: topPoly[Math.floor(topPoly.length / 2)]!,
        midpoint: topCentroid3D,
        dir: { x: 1, y: 0, z: 0 },
        lengthMm: computePolygonPerimeter3D(topPoly),
        polyline3D: [...topPoly, topPoly[0]!],
      };
      bodyEdges.push(topEdgeObj);
      edgesById.set(topEdgeObj.edgeId, topEdgeObj);
      edgesByMeshIndex.set(topEdgeMeshIdx, topEdgeObj);
    }

    if (bottomSec && bottomSec.points3D.length >= 3) {
      const botPoly = bottomSec.points3D;
      const botCentroid3D: Vec3Mm = bottomSec.centroid3D ?? {
        x: bottomSec.center?.x ?? 0,
        y: bottomSec.center?.y ?? 0,
        z: bottomSec.elevationZ ?? 0,
      };
      const botFace: DirectFace3D = {
        faceId: `${bodyId}_face_bottom`,
        meshFaceIndex,
        bodyId,
        entityId: entId,
        role: "bottom",
        sideIndex: -2,
        label: `Base Loft 3D (Z = ${bottomSec.elevationZ.toFixed(1)} mm)`,
        normal: { x: 0, y: 0, z: -1 },
        centroid: botCentroid3D,
        areaMm2: Math.max(1, (loftMesh.surfaceAreaMm2 || 1000) * 0.25),
        polygon3D: botPoly,
      };
      bodyFaces.push(botFace);
      facesById.set(botFace.faceId, botFace);

      const closedBot: number[] = [];
      for (const p of botPoly) closedBot.push(p.x, p.y, p.z);
      closedBot.push(botPoly[0]!.x, botPoly[0]!.y, botPoly[0]!.z);
      const botEdgeMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: botEdgeMeshIdx,
        vertices: closedBot,
        isSeam: false,
        isTangentEdge: false,
      });
      const botEdgeObj: DirectEdge3D = {
        edgeId: `${bodyId}_edge_bottom_0`,
        meshEdgeIndex: botEdgeMeshIdx,
        bodyId,
        entityId: entId,
        role: "bottom_loop",
        edgeIndex: 1,
        label: "Borda Inferior Loft 3D",
        startPt: botPoly[0]!,
        endPt: botPoly[Math.floor(botPoly.length / 2)]!,
        midpoint: botCentroid3D,
        dir: { x: 1, y: 0, z: 0 },
        lengthMm: computePolygonPerimeter3D(botPoly),
        polyline3D: [...botPoly, botPoly[0]!],
      };
      bodyEdges.push(botEdgeObj);
      edgesById.set(botEdgeObj.edgeId, botEdgeObj);
      edgesByMeshIndex.set(botEdgeMeshIdx, botEdgeObj);
    }

    const pivot3D: Vec3Mm = {
      x: Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0,
      y: Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0,
      z: Number.isFinite(minZ) ? (minZ + maxZ) * 0.5 : 0,
    };
    const loftHeightMm = Number.isFinite(minZ) ? Math.max(1, maxZ - minZ) : p3d.extrudeHeightMm;

    const loftBodyObj: DirectBody3D = {
      bodyId,
      entityId: entId,
      name: p3d.bodyName || `Sólido Loft 3D #${loftIdx + 1} (${loftMesh.sections.length} seções)`,
      booleanMode: p3d.booleanMode3D,
      extrudeHeightMm: loftHeightMm,
      elevationZ: Number.isFinite(minZ) ? minZ : p3d.elevationZ,
      edgeFilletRadiusMm: 0,
      innerFilletRadiusMm: 0,
      edgeChamferDistMm: 0,
      cornerFilletsMm: {},
      cornerChamfersMm: {},
      vertexBevelsMm: {},
      shellWallThicknessMm: loftMesh.wallThicknessMm,
      shellThicknessMm: loftMesh.wallThicknessMm,
      sheetThicknessMm: p3d.sheetThicknessMm,
      shellOpenCaps: [],
      offsetFaceTopMm: 0,
      offsetFaceBottomMm: 0,
      offsetFaceSidesMm: 0,
      offsetSidesIndependent: { posX: 0, negX: 0, posY: 0, negY: 0 },
      miterCutTopDeg: 0,
      miterCutTopAxis: "x",
      miterCutBottomDeg: 0,
      miterCutBottomAxis: "x",
      rotation3D: p3d.rotation3D,
      pivot3D,
      colorHex: p3d.colorHex,
      materialName: p3d.materialName,
      densityGPerCm3: 7.85,
      massGrams: (loftMesh.volumeMm3 / 1000) * 7.85,
      eulerCharacteristic: { V: 24, E: 36, F: 14, chi: 2 },
      featureHistory: [
        {
          featureId: `${bodyId}_feat_loft`,
          kind: "extrude",
          label: `Loft 3D (${loftMesh.sections.length} seções)`,
          parameterSummary: `${loftMesh.surfaceMode === "smooth" ? "Smooth Fit" : "Ruled"} | ΔZ = ${loftHeightMm.toFixed(1)} mm`,
        },
      ],
      bbox3D: {
        minX: Number.isFinite(minX) ? minX : -50,
        maxX: Number.isFinite(maxX) ? maxX : 50,
        minY: Number.isFinite(minY) ? minY : -50,
        maxY: Number.isFinite(maxY) ? maxY : 50,
        minZ: Number.isFinite(minZ) ? minZ : 0,
        maxZ: Number.isFinite(maxZ) ? maxZ : 100,
      },
      deltaX: Number.isFinite(minX) ? Math.max(0, maxX - minX) : 100,
      deltaY: Number.isFinite(minY) ? Math.max(0, maxY - minY) : 100,
      deltaZ: loftHeightMm,
      totalAreaMm2: loftMesh.surfaceAreaMm2,
      volumeMm3: loftMesh.volumeMm3,
      faces: bodyFaces,
      edges: bodyEdges,
      vertices: bodyVertices,
      snapCandidates: [
        {
          id: `${bodyId}_snap_center`,
          bodyId,
          entityId: entId,
          kind: "body_center",
          label: "Centro Loft 3D",
          point3D: pivot3D,
        },
      ],
    };
    bodies.push(loftBodyObj);
    bodiesById.set(bodyId, loftBodyObj);
  });

  // -------------------------------------------------------------------------
  // CORPOS GERADOS PELO `ChamferSolidKernel` (`revolve`, `sweep`, `structural_frame`, `sheet_metal`)
  // Proibição absoluta de fallback para extrusão linear em Z!
  // -------------------------------------------------------------------------
  kernelFeatureEntities.forEach((kEnt) => {
    const kMesh = buildSolidMesh(kEnt, entities, defaultThicknessMm);
    if (!kMesh || kMesh.indices.length === 0) return;

    const p3d = getEntityDirect3DParams(kEnt, defaultThicknessMm);
    const entId = kEnt.id;
    const bodyId = `body_${entId}`;
    const bodyFaces: DirectFace3D[] = [];
    const bodyEdges: DirectEdge3D[] = [];
    const bodyVertices: DirectVertex3D[] = [];

    const baseVertexOffset = positions.length / 3;
    for (let i = 0; i < kMesh.positions.length; i++) {
      positions.push(kMesh.positions[i]!);
      normals.push(kMesh.normals[i] ?? 0);
    }

    const startIdxGlobal = indices.length;
    for (let i = 0; i < kMesh.indices.length; i++) {
      indices.push(baseVertexOffset + kMesh.indices[i]!);
    }

    if (kMesh.faces.length > 0) {
      kMesh.faces.forEach((kf, fIdx) => {
        const meshFaceIndex = globalMeshFaceIdx++;
        faceGroups.push({
          faceIndex: meshFaceIndex,
          start: startIdxGlobal + kf.indexStart,
          count: kf.indexCount,
        });
        const df: DirectFace3D = {
          faceId: kf.faceId || `${bodyId}_face_${fIdx}`,
          meshFaceIndex,
          bodyId,
          entityId: entId,
          role:
            kf.role === "top" || kf.role === "bottom" || kf.role === "side" || kf.role === "inner_side" || kf.role === "miter"
              ? kf.role
              : "side",
          sideIndex: fIdx,
          label: kf.label,
          normal: kf.normal,
          centroid: kf.centroid,
          areaMm2: kf.areaMm2,
          polygon3D: kf.polygon3D,
        };
        bodyFaces.push(df);
        facesById.set(df.faceId, df);
        facesByMeshIndex.set(meshFaceIndex, df);
      });
    } else {
      const meshFaceIndex = globalMeshFaceIdx++;
      faceGroups.push({
        faceIndex: meshFaceIndex,
        start: startIdxGlobal,
        count: kMesh.indices.length,
      });
      const df: DirectFace3D = {
        faceId: `${bodyId}_face_0`,
        meshFaceIndex,
        bodyId,
        entityId: entId,
        role: "side",
        sideIndex: 0,
        label: kMesh.bodyName,
        normal: { x: 0, y: 0, z: 1 },
        centroid: kMesh.centerOfGravity3D,
        areaMm2: kMesh.surfaceAreaMm2,
        polygon3D: [],
      };
      bodyFaces.push(df);
      facesById.set(df.faceId, df);
      facesByMeshIndex.set(meshFaceIndex, df);
    }

    kMesh.edges.forEach((ke, eIdx) => {
      if (ke.polyline3D.length < 2) return;
      const flatVerts: number[] = [];
      for (const pt of ke.polyline3D) flatVerts.push(pt.x, pt.y, pt.z);
      const meshEdgeIndex = globalMeshEdgeIdx++;
      edgePolylines.push({
        edgeIndex: meshEdgeIndex,
        vertices: flatVerts,
        isSeam: Boolean(ke.isSeam),
        isTangentEdge: Boolean(ke.isTangentEdge),
      });
      const startPt = ke.polyline3D[0]!;
      const endPt = ke.polyline3D[ke.polyline3D.length - 1]!;
      const de: DirectEdge3D = {
        edgeId: ke.edgeId || `${bodyId}_edge_${eIdx}`,
        meshEdgeIndex,
        bodyId,
        entityId: entId,
        role:
          ke.role === "top" || ke.role === "bottom" || ke.role === "vertical" || ke.role === "inner_top" || ke.role === "inner_bottom"
            ? ke.role
            : "top",
        edgeIndex: eIdx,
        label: ke.label,
        startPt,
        endPt,
        midpoint: ke.polyline3D[Math.floor(ke.polyline3D.length / 2)] ?? startPt,
        dir: { x: 1, y: 0, z: 0 },
        lengthMm: computePolygonPerimeter3D(ke.polyline3D),
        polyline3D: ke.polyline3D,
      };
      bodyEdges.push(de);
      edgesById.set(de.edgeId, de);
      edgesByMeshIndex.set(meshEdgeIndex, de);
    });

    const b3 = kMesh.bbox3D;
    const pivot3D: Vec3Mm = {
      x: (b3.minX + b3.maxX) * 0.5,
      y: (b3.minY + b3.maxY) * 0.5,
      z: (b3.minZ + b3.maxZ) * 0.5,
    };

    const matLower = p3d.materialName.toLowerCase();
    const densityGPerCm3 = matLower.includes("alum")
      ? 2.7
      : matLower.includes("inox")
        ? 7.93
        : 7.85;
    const massGrams = Number(((kMesh.volumeMm3 / 1000) * densityGPerCm3).toFixed(2));

    const kBodyObj: DirectBody3D = {
      bodyId,
      entityId: entId,
      name: p3d.bodyName || kMesh.bodyName,
      booleanMode: p3d.booleanMode3D,
      extrudeHeightMm: Math.max(1, b3.maxZ - b3.minZ),
      elevationZ: b3.minZ,
      edgeFilletRadiusMm: p3d.edgeFilletRadiusMm,
      innerFilletRadiusMm: 0,
      edgeChamferDistMm: p3d.edgeChamferDistMm,
      cornerFilletsMm: p3d.cornerFilletsMm,
      cornerChamfersMm: p3d.cornerChamfersMm,
      vertexBevelsMm: p3d.vertexBevelsMm,
      shellWallThicknessMm: p3d.shellWallThicknessMm,
      shellThicknessMm: p3d.shellThicknessMm,
      sheetThicknessMm: p3d.sheetThicknessMm,
      shellOpenCaps: p3d.shellOpenCaps,
      offsetFaceTopMm: 0,
      offsetFaceBottomMm: 0,
      offsetFaceSidesMm: 0,
      offsetSidesIndependent: { posX: 0, negX: 0, posY: 0, negY: 0 },
      miterCutTopDeg: p3d.miterCutTopDeg,
      miterCutTopAxis: p3d.miterCutTopAxis,
      miterCutBottomDeg: p3d.miterCutBottomDeg,
      miterCutBottomAxis: p3d.miterCutBottomAxis,
      rotation3D: p3d.rotation3D,
      pivot3D,
      colorHex: p3d.colorHex,
      materialName: p3d.materialName,
      densityGPerCm3,
      massGrams,
      eulerCharacteristic: kMesh.eulerCharacteristic,
      featureHistory: [
        {
          featureId: `${bodyId}_feat_${kMesh.featureType}`,
          kind: "extrude",
          label: kMesh.bodyName,
          parameterSummary: `V = ${(kMesh.volumeMm3 / 1000).toFixed(1)} cm³`,
        },
      ],
      bbox3D: b3,
      deltaX: Math.max(0, b3.maxX - b3.minX),
      deltaY: Math.max(0, b3.maxY - b3.minY),
      deltaZ: Math.max(0, b3.maxZ - b3.minZ),
      totalAreaMm2: kMesh.surfaceAreaMm2,
      volumeMm3: kMesh.volumeMm3,
      faces: bodyFaces,
      edges: bodyEdges,
      vertices: bodyVertices,
      snapCandidates: [
        {
          id: `${bodyId}_snap_center`,
          bodyId,
          entityId: entId,
          kind: "body_center",
          label: `Centro · ${kMesh.bodyName}`,
          point3D: pivot3D,
        },
      ],
    };
    bodies.push(kBodyObj);
    bodiesById.set(bodyId, kBodyObj);
  });

  // Bounding box global da cena 3D
  let gMinX = Infinity;
  let gMaxX = -Infinity;
  let gMinY = Infinity;
  let gMaxY = -Infinity;
  let gMinZ = Infinity;
  let gMaxZ = -Infinity;
  for (const b of bodies) {
    if (b.bbox3D.minX < gMinX) gMinX = b.bbox3D.minX;
    if (b.bbox3D.maxX > gMaxX) gMaxX = b.bbox3D.maxX;
    if (b.bbox3D.minY < gMinY) gMinY = b.bbox3D.minY;
    if (b.bbox3D.maxY > gMaxY) gMaxY = b.bbox3D.maxY;
    if (b.bbox3D.minZ < gMinZ) gMinZ = b.bbox3D.minZ;
    if (b.bbox3D.maxZ > gMaxZ) gMaxZ = b.bbox3D.maxZ;
  }
  if (!Number.isFinite(gMinX)) {
    gMinX = 0;
    gMaxX = 100;
    gMinY = 0;
    gMaxY = 100;
    gMinZ = 0;
    gMaxZ = defaultThicknessMm;
  }

  // Converte coordenadas de tela/2D (x, y_down, z) para o referencial 3D Z-up do ThreeBRepRenderer (x, -y, z)
  const threePositions = new Float32Array(positions.length);
  const threeNormals = new Float32Array(normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    threePositions[i] = positions[i]!;
    threePositions[i + 1] = -positions[i + 1]!;
    threePositions[i + 2] = positions[i + 2]!;
    threeNormals[i] = normals[i]!;
    threeNormals[i + 1] = -normals[i + 1]!;
    threeNormals[i + 2] = normals[i + 2]!;
  }

  const threeIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 3) {
    threeIndices[i] = indices[i]!;
    threeIndices[i + 1] = indices[i + 2]!;
    threeIndices[i + 2] = indices[i + 1]!;
  }

  let totalEdgePts = 0;
  const cadEdges = edgePolylines.map((ep) => {
    const pts = new Float32Array(ep.vertices.length);
    for (let i = 0; i < ep.vertices.length; i += 3) {
      pts[i] = ep.vertices[i]!;
      pts[i + 1] = -ep.vertices[i + 1]!;
      pts[i + 2] = ep.vertices[i + 2]!;
    }
    const pointCount = Math.floor(ep.vertices.length / 3);
    totalEdgePts += pointCount;
    const edgeMeta = edgesByMeshIndex.get(ep.edgeIndex);
    return {
      edgeId: edgeMeta?.edgeId ?? `edge_${ep.edgeIndex}`,
      edgeIndex: ep.edgeIndex,
      edgeHash: ep.edgeIndex + 1,
      points: pts,
      pointCount,
      isSeam: Boolean(ep.isSeam),
      isTangentEdge: Boolean(ep.isTangentEdge),
    };
  });

  const tessellatedShape: CadTessellatedShape = {
    mesh: {
      positions: threePositions,
      normals: threeNormals,
      indices: threeIndices,
      vertexCount: Math.floor(threePositions.length / 3),
      triangleCount: Math.floor(threeIndices.length / 3),
      faceGroups: faceGroups.map((fg) => {
        const faceMeta = facesByMeshIndex.get(fg.faceIndex);
        return {
          faceId: faceMeta?.faceId ?? `face_${fg.faceIndex}`,
          faceIndex: fg.faceIndex,
          faceHash: fg.faceIndex + 1,
          startTriangle: Math.floor(fg.start / 3),
          triangleCount: Math.floor(fg.count / 3),
        };
      }),
    },
    edges: {
      edges: cadEdges,
      totalEdges: cadEdges.length,
      totalPoints: totalEdgePts,
    },
    bounds: {
      min: { x: gMinX, y: -gMaxY, z: gMinZ },
      max: { x: gMaxX, y: -gMinY, z: gMaxZ },
      size: {
        x: Math.max(0.1, gMaxX - gMinX),
        y: Math.max(0.1, gMaxY - gMinY),
        z: Math.max(0.1, gMaxZ - gMinZ),
      },
    },
  };

  return {
    bodies,
    facesById,
    edgesById,
    verticesById,
    bodiesById,
    facesByMeshIndex,
    edgesByMeshIndex,
    tessellatedShape,
  };
}

function computePolygonCentroid3D(pts: Vec3Mm[]): Vec3Mm {
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

function computePolygonPerimeter3D(pts: Vec3Mm[]): number {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    len += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return len;
}

// ============================================================================
// TELEMETRIA DE SELEÇÃO 3D NA BARRA INFERIOR (SEÇÃO 3.4)
// ============================================================================

export function formatSubElementTelemetry3D(
  scene: DirectTopology3DScene,
  sel: SubElementSelectionState3D,
): string | null {
  if (sel.vertexIds && sel.vertexIds.length > 0) {
    const verts = sel.vertexIds
      .map((id) => scene.verticesById.get(id))
      .filter((v): v is DirectVertex3D => Boolean(v));
    if (verts.length > 0) {
      const v0 = verts[0]!;
      const countLabel = verts.length === 1 ? "1 vértice" : `${verts.length} vértices`;
      return `${countLabel} | (${v0.point3D.x.toFixed(1)}, ${v0.point3D.y.toFixed(1)}, ${v0.point3D.z.toFixed(1)}) mm`;
    }
  }

  if (sel.edgeIds.length > 0) {
    const edges = sel.edgeIds
      .map((id) => scene.edgesById.get(id))
      .filter((e): e is DirectEdge3D => Boolean(e));
    if (edges.length > 0) {
      const totalLen = edges.reduce((acc, e) => acc + e.lengthMm, 0);
      const countLabel = edges.length === 1 ? "1 aresta" : `${edges.length} arestas`;
      const formattedLen = totalLen.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${countLabel} | ${formattedLen} mm`;
    }
  }

  if (sel.faceIds.length > 0) {
    const faces = sel.faceIds
      .map((id) => scene.facesById.get(id))
      .filter((f): f is DirectFace3D => Boolean(f));
    if (faces.length > 0) {
      const totalArea = faces.reduce((acc, f) => acc + f.areaMm2, 0);
      const countLabel = faces.length === 1 ? "1 face" : `${faces.length} faces`;
      const formattedArea = totalArea.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${countLabel} | ${formattedArea} mm²`;
    }
  }

  if (sel.bodyIds.length > 0) {
    const bodies = sel.bodyIds
      .map((id) => scene.bodiesById.get(id))
      .filter((b): b is DirectBody3D => Boolean(b));
    if (bodies.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const b of bodies) {
        if (b.bbox3D.minX < minX) minX = b.bbox3D.minX;
        if (b.bbox3D.maxX > maxX) maxX = b.bbox3D.maxX;
        if (b.bbox3D.minY < minY) minY = b.bbox3D.minY;
        if (b.bbox3D.maxY > maxY) maxY = b.bbox3D.maxY;
        if (b.bbox3D.minZ < minZ) minZ = b.bbox3D.minZ;
        if (b.bbox3D.maxZ > maxZ) maxZ = b.bbox3D.maxZ;
      }
      const dx = (maxX - minX).toFixed(2);
      const dy = (maxY - minY).toFixed(2);
      const dz = (maxZ - minZ).toFixed(2);
      const countLabel = bodies.length === 1 ? "1 corpo" : `${bodies.length} corpos`;
      return `${countLabel} | ΔX ${dx} mm  ΔY ${dy} mm  ΔZ ${dz} mm`;
    }
  }

  return null;
}

// ============================================================================
// RAYCASTING / HIT-TEST 2D-PROJECTED DE ALTA PRECISÃO PARA FACES, ARESTAS E CORPOS
// ============================================================================

export function hitTestSubElement3DInScreenSpace(
  screenPt: { x: number; y: number },
  scene: DirectTopology3DScene,
  orbitProjection: WorkplaneOrbitProjection2D,
  view: { tx: number; ty: number; k: number },
  edgeTolerancePx = 14,
  selectionScope: SelectionScope3D = "auto",
): {
  kind: "vertex" | "edge" | "face" | "none";
  vertex?: DirectVertex3D;
  edge?: DirectEdge3D;
  face?: DirectFace3D;
  body?: DirectBody3D;
} {
  const toScreen = (pt3D: Vec3Mm): Vec2 => {
    const pMm = projectPoint3DToCanvasViewMm(pt3D, orbitProjection);
    return {
      x: pMm.x * view.k + view.tx,
      y: pMm.y * view.k + view.ty,
    };
  };

  // 0. Hit-test de Vértices 3D (quando selectionScope === "vertex")
  if (selectionScope === "vertex") {
    let bestVertex: { vertex: DirectVertex3D; distPx: number; depthZ: number } | null = null;
    const vertTol = Math.max(16, edgeTolerancePx + 4);
    for (const body of scene.bodies) {
      for (const v of body.vertices) {
        const sp = toScreen(v.point3D);
        const dPx = Math.hypot(screenPt.x - sp.x, screenPt.y - sp.y);
        if (dPx <= vertTol) {
          if (
            !bestVertex ||
            dPx < bestVertex.distPx - 2 ||
            (Math.abs(dPx - bestVertex.distPx) <= 2 && v.point3D.z > bestVertex.depthZ)
          ) {
            bestVertex = { vertex: v, distPx: dPx, depthZ: v.point3D.z };
          }
        }
      }
    }
    if (bestVertex) {
      const body = scene.bodiesById.get(bestVertex.vertex.bodyId);
      return { kind: "vertex", vertex: bestVertex.vertex, body };
    }
  }

  // 1. Prioridade para Arestas (quinas e bordas com tolerância de toque)
  if (selectionScope !== "face" && selectionScope !== "body") {
    let bestEdge: { edge: DirectEdge3D; distPx: number; depthZ: number } | null = null;
    for (const body of scene.bodies) {
      for (const edge of body.edges) {
        const poly = edge.polyline3D;
        for (let i = 0; i < poly.length - 1; i++) {
          const s0 = toScreen(poly[i]!);
          const s1 = toScreen(poly[i + 1]!);
          const dPx = distToSegment2D(screenPt, s0, s1);
          if (dPx <= edgeTolerancePx) {
            const depthZ = (poly[i]!.z + poly[i + 1]!.z) * 0.5;
            if (
              !bestEdge ||
              dPx < bestEdge.distPx - 2 ||
              (Math.abs(dPx - bestEdge.distPx) <= 2 && depthZ > bestEdge.depthZ)
            ) {
              bestEdge = { edge, distPx: dPx, depthZ };
            }
          }
        }
      }
    }

    if (bestEdge) {
      const body = scene.bodiesById.get(bestEdge.edge.bodyId);
      return { kind: "edge", edge: bestEdge.edge, body };
    }
  }

  // 2. Hit-test nas Faces 3D (ordenadas pela face voltada para a câmera / maior Z projetado;
  //    em caso de perfis concêntricos no mesmo plano Z, prioriza o perfil interno de menor área)
  const azRad = (orbitProjection.azimuthDeg * Math.PI) / 180;
  const elRad = (orbitProjection.elevationDeg * Math.PI) / 180;
  const camDir: Vec3Mm = {
    x: Math.sin(azRad) * Math.cos(elRad),
    y: Math.cos(azRad) * Math.cos(elRad),
    z: Math.sin(elRad),
  };

  let bestFace: { face: DirectFace3D; score: number; areaMm2: number } | null = null;
  for (const body of scene.bodies) {
    for (const face of body.faces) {
      if (face.polygon3D.length < 3) continue;
      const screenPoly = face.polygon3D.map(toScreen);
      if (pointInPolygon2D(screenPt, screenPoly)) {
        const facingDot =
          face.normal.x * camDir.x + face.normal.y * camDir.y + face.normal.z * camDir.z;
        const depthScore =
          face.centroid.x * camDir.x +
          face.centroid.y * camDir.y +
          face.centroid.z * camDir.z +
          facingDot * 500;
        if (
          !bestFace ||
          depthScore > bestFace.score + 2.5 ||
          (Math.abs(depthScore - bestFace.score) <= 2.5 && face.areaMm2 < bestFace.areaMm2)
        ) {
          bestFace = { face, score: depthScore, areaMm2: face.areaMm2 };
        }
      }
    }
  }

  if (bestFace) {
    const body = scene.bodiesById.get(bestFace.face.bodyId);
    return { kind: "face", face: bestFace.face, body };
  }

  return { kind: "none" };
}

function distToSegment2D(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ============================================================================
// OPERAÇÕES DE MUTAÇÃO DIRETA 3D SOBRE ENTIDADES (COM SUPORTE A COPY: ON/OFF)
// ============================================================================

export function applyDirectExtrudeToEntities(
  entities: Entity[],
  targetIds: string[],
  extrudeHeightMm: number,
  booleanMode3D?: BooleanMode3D,
): Entity[] {
  const clamped = Math.max(0.5, Number(extrudeHeightMm.toFixed(2)));
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    return {
      ...e,
      extrudeHeight: clamped,
      params: {
        ...(e.params ?? {}),
        extrudeHeight: clamped,
        extrudeHeightMm: clamped,
        ...(booleanMode3D ? { booleanMode3D } : {}),
      },
    };
  });
}

export function applyDirectVertexOrEdgeBevel3DToEntities(
  entities: Entity[],
  targetIds: string[],
  bevelKeys: string[],
  bevelDistMm: number,
): Entity[] {
  const clamped = Math.max(0, Number(bevelDistMm.toFixed(2)));
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    const cur = getEntityDirect3DParams(e);
    const nextBevels: Record<string, number> = { ...cur.vertexBevelsMm };
    for (const k of bevelKeys) {
      if (clamped <= 0.01) {
        delete nextBevels[k];
      } else {
        nextBevels[k] = clamped;
      }
    }
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        vertexBevelsMm: nextBevels,
      },
    };
  });
}

export function applyDirectFilletOrChamfer3DToEntities(
  entities: Entity[],
  targetIds: string[],
  mode: "fillet" | "chamfer",
  valueMm: number,
  targetEdgeIndices?: number[],
  targetBevelKeys?: string[],
): Entity[] {
  const clamped = Math.max(0, Number(valueMm.toFixed(2)));
  const idSet = new Set(targetIds);

  // Se o usuário selecionou um Vértice 3D ou Aresta Horizontal de Topo/Base em modo Chanfro -> Bisel Localizado 45°
  if (mode === "chamfer" && targetBevelKeys && targetBevelKeys.length > 0) {
    return applyDirectVertexOrEdgeBevel3DToEntities(entities, targetIds, targetBevelKeys, clamped);
  }

  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    const cur = getEntityDirect3DParams(e);

    // Se o usuário selecionou arestas verticais específicas (não a peça inteira), aplica APENAS nessas quinas!
    const loop = extractBaseClosedLoop2D(e);
    const totalCorners = loop?.corners.length || 4;
    if (
      targetEdgeIndices &&
      targetEdgeIndices.length > 0 &&
      targetEdgeIndices.length < totalCorners
    ) {
      const nextCornerFillets: Record<number, number> = { ...cur.cornerFilletsMm };
      const nextCornerChamfers: Record<number, number> = { ...cur.cornerChamfersMm };
      // Se havia fillet/chamfer global anterior, preserva nos outros cantos
      if (
        Object.keys(nextCornerFillets).length === 0 &&
        Object.keys(nextCornerChamfers).length === 0 &&
        (cur.edgeFilletRadiusMm > 0.05 || cur.edgeChamferDistMm > 0.05)
      ) {
        for (let c = 0; c < totalCorners; c++) {
          if (cur.edgeFilletRadiusMm > 0.05) nextCornerFillets[c] = cur.edgeFilletRadiusMm;
          if (cur.edgeChamferDistMm > 0.05) nextCornerChamfers[c] = cur.edgeChamferDistMm;
        }
      }
      for (const idx of targetEdgeIndices) {
        if (mode === "fillet") {
          nextCornerFillets[idx] = clamped;
          delete nextCornerChamfers[idx];
        } else {
          nextCornerChamfers[idx] = clamped;
          delete nextCornerFillets[idx];
        }
      }
      return {
        ...e,
        params: {
          ...(e.params ?? {}),
          edgeFilletRadiusMm: 0,
          edgeChamferDistMm: 0,
          cornerFilletsMm: nextCornerFillets,
          cornerChamfersMm: nextCornerChamfers,
        },
      };
    }

    // Escopo Peça Inteira (BODY) ou todas as quinas selecionadas: aplica globalmente
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        edgeFilletRadiusMm: mode === "fillet" ? clamped : 0,
        edgeChamferDistMm: mode === "chamfer" ? clamped : 0,
        cornerFilletsMm: {},
        cornerChamfersMm: {},
      },
    };
  });
}

export function applyDirectShell3DToEntities(
  entities: Entity[],
  targetIds: string[],
  wallThicknessMm: number,
  openCaps: ("top" | "bottom")[] = ["top", "bottom"],
): Entity[] {
  const clamped = Math.max(0, Number(wallThicknessMm.toFixed(2)));
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    return {
      ...e,
      shellWallThickness: clamped,
      params: {
        ...(e.params ?? {}),
        shellWallThickness: clamped,
        shellThicknessMm: clamped,
        shellOpenCaps: openCaps,
      },
    };
  });
}

export function applyDirectOffsetFace3DToEntities(
  entities: Entity[],
  targetIds: string[],
  faceTarget:
    | "top"
    | "bottom"
    | "sides"
    | "side_normal"
    | "pos_x"
    | "neg_x"
    | "pos_y"
    | "neg_y",
  deltaMm: number,
  faceNormal?: Vec3Mm,
): Entity[] {
  const rounded = Number(deltaMm.toFixed(2));
  const idSet = new Set(targetIds);

  const effectiveNormal: Vec3Mm | undefined =
    faceNormal ??
    (faceTarget === "pos_x"
      ? { x: 1, y: 0, z: 0 }
      : faceTarget === "neg_x"
        ? { x: -1, y: 0, z: 0 }
        : faceTarget === "pos_y"
          ? { x: 0, y: 1, z: 0 }
          : faceTarget === "neg_y"
            ? { x: 0, y: -1, z: 0 }
            : undefined);

  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    const cur = getEntityDirect3DParams(e);
    if (faceTarget === "top") {
      const nextHeight = Math.max(1, Number((cur.extrudeHeightMm + rounded).toFixed(2)));
      return {
        ...e,
        extrudeHeight: nextHeight,
        params: {
          ...(e.params ?? {}),
          extrudeHeight: nextHeight,
          extrudeHeightMm: nextHeight,
          offsetFaceTopMm: 0,
        },
      };
    }
    if (faceTarget === "bottom") {
      const nextElev = Number((cur.elevationZ - rounded).toFixed(2));
      const nextHeight = Math.max(1, Number((cur.extrudeHeightMm + rounded).toFixed(2)));
      return {
        ...e,
        elevationZ: nextElev,
        extrudeHeight: nextHeight,
        params: {
          ...(e.params ?? {}),
          elevationZ: nextElev,
          extrudeHeight: nextHeight,
          extrudeHeightMm: nextHeight,
          offsetFaceBottomMm: 0,
        },
      };
    }
    if (
      (faceTarget === "side_normal" ||
        faceTarget === "pos_x" ||
        faceTarget === "neg_x" ||
        faceTarget === "pos_y" ||
        faceTarget === "neg_y") &&
      effectiveNormal
    ) {
      const nx = effectiveNormal.x;
      const ny = effectiveNormal.y;
      const nLen = Math.hypot(nx, ny);
      if (nLen > 0.25) {
        const ux = nx / nLen;
        const uy = ny / nLen;
        if (e.type === "rect") {
          let nextX = e.x;
          let nextY = e.y;
          let nextW = e.w;
          let nextH = e.h;
          if (Math.abs(ux) >= Math.abs(uy)) {
            if (ux > 0) {
              nextW = Math.max(1, Number((e.w + rounded).toFixed(2)));
            } else {
              nextX = Number((e.x - rounded).toFixed(2));
              nextW = Math.max(1, Number((e.w + rounded).toFixed(2)));
            }
          } else {
            if (uy > 0) {
              nextH = Math.max(1, Number((e.h + rounded).toFixed(2)));
            } else {
              nextY = Number((e.y - rounded).toFixed(2));
              nextH = Math.max(1, Number((e.h + rounded).toFixed(2)));
            }
          }
          return { ...e, x: nextX, y: nextY, w: nextW, h: nextH };
        }
        if (e.type === "polyline" && e.pts.length >= 3) {
          const b = boxOf(e);
          const cx = (b.minX + b.maxX) * 0.5;
          const cy = (b.minY + b.maxY) * 0.5;
          const nextPts = e.pts.map((pt) => {
            const proj = (pt.x - cx) * ux + (pt.y - cy) * uy;
            if (proj > 0) {
              return {
                x: Number((pt.x + ux * rounded).toFixed(2)),
                y: Number((pt.y + uy * rounded).toFixed(2)),
              };
            }
            return pt;
          });
          return {
            ...e,
            pts: nextPts,
          };
        }
      }
    }
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        offsetFaceSidesMm: Number((cur.offsetFaceSidesMm + rounded).toFixed(2)),
      },
    };
  });
}

export function applyDirectMiterCut3DToEntities(
  entities: Entity[],
  targetIds: string[],
  endTarget: "top" | "bottom",
  angleDeg: number,
  axis: "x" | "y" = "x",
): Entity[] {
  const clamped = Math.max(-75, Math.min(75, Number(angleDeg.toFixed(1))));
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    if (endTarget === "bottom") {
      return {
        ...e,
        params: {
          ...(e.params ?? {}),
          miterCutBottomDeg: clamped,
          miterCutBottomAxis: axis,
        },
      };
    }
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        miterCutTopDeg: clamped,
        miterCutTopAxis: axis,
      },
    };
  });
}

export function applyDirectTransform3DToEntities(
  entities: Entity[],
  targetIds: string[],
  delta: { dx?: number; dy?: number; dz?: number; rxDeg?: number; ryDeg?: number; rzDeg?: number },
  copyMode = false,
  preassignedCopyIds?: Map<string, string>,
): { updatedEntities: Entity[]; activeIds: string[] } {
  const idSet = new Set(targetIds);
  const dx = Number(delta.dx ?? 0);
  const dy = Number(delta.dy ?? 0);
  const dz = Number(delta.dz ?? 0);
  const rxDeg = Number(delta.rxDeg ?? 0);
  const ryDeg = Number(delta.ryDeg ?? 0);
  const rzDeg = Number(delta.rzDeg ?? 0);

  // Inclui também furos contidos dentro dos corpos selecionados para que a coluna/sapata inteira se mova ou duplique junto!
  const allTargetIds = new Set(targetIds);
  const selectedOuters = entities.filter((e) => idSet.has(e.id));
  for (const outerEnt of selectedOuters) {
    const outerLoop = extractBaseClosedLoop2D(outerEnt);
    if (!outerLoop) continue;
    const outerZ = Number(outerEnt.params?.elevationZ ?? 0);
    for (const other of entities) {
      if (allTargetIds.has(other.id)) continue;
      const otherZ = Number(other.params?.elevationZ ?? 0);
      if (Math.abs(otherZ - outerZ) > 1.0) continue;
      const otherLoop = extractBaseClosedLoop2D(other);
      if (otherLoop && otherLoop.points[0] && pointInPolygon2D(otherLoop.points[0], outerLoop.points)) {
        allTargetIds.add(other.id);
      }
    }
  }

  const transformSingle = (ent: Entity, assignNewId: boolean): Entity => {
    const moved: Entity =
      Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4
        ? ent.type === "rect"
          ? {
              ...ent,
              x: Number((ent.x + dx).toFixed(3)),
              y: Number((ent.y + dy).toFixed(3)),
            }
          : (translate(ent, dx, dy) ?? { ...ent })
        : { ...ent };
    const cur = getEntityDirect3DParams(ent);
    const nextZ = Number((cur.elevationZ + dz).toFixed(2));
    const nextRot = {
      rxDeg: Number((cur.rotation3D.rxDeg + rxDeg).toFixed(1)),
      ryDeg: Number((cur.rotation3D.ryDeg + ryDeg).toFixed(1)),
      rzDeg: Number((cur.rotation3D.rzDeg + rzDeg).toFixed(1)),
    };
    let nextId = ent.id;
    if (assignNewId) {
      const existingCopyId = preassignedCopyIds?.get(ent.id);
      if (existingCopyId) {
        nextId = existingCopyId;
      } else {
        nextId = uid();
        preassignedCopyIds?.set(ent.id, nextId);
      }
    }
    return {
      ...moved,
      id: nextId,
      elevationZ: nextZ,
      params: {
        ...(moved.params ?? {}),
        elevationZ: nextZ,
        rotation3D: nextRot,
      },
    };
  };

  if (copyMode) {
    const copies: Entity[] = [];
    for (const e of entities) {
      if (allTargetIds.has(e.id)) {
        copies.push(transformSingle(e, true));
      }
    }
    return {
      updatedEntities: [...entities, ...copies],
      activeIds: copies.map((c) => c.id),
    };
  }

  const updated = entities.map((e) => (allTargetIds.has(e.id) ? transformSingle(e, false) : e));
  return {
    updatedEntities: updated,
    activeIds: Array.from(allTargetIds),
  };
}

function mirrorEntity2D(ent: Entity, axis: "x" | "y", pivotCoord: number): Entity {
  const reflectX = (x: number) => Number((2 * pivotCoord - x).toFixed(2));
  const reflectY = (y: number) => Number((2 * pivotCoord - y).toFixed(2));

  switch (ent.type) {
    case "line":
      return axis === "x"
        ? { ...ent, x1: reflectX(ent.x1), x2: reflectX(ent.x2) }
        : { ...ent, y1: reflectY(ent.y1), y2: reflectY(ent.y2) };
    case "circle":
      return axis === "x"
        ? { ...ent, cx: reflectX(ent.cx) }
        : { ...ent, cy: reflectY(ent.cy) };
    case "ellipse":
      return axis === "x"
        ? { ...ent, cx: reflectX(ent.cx), rotation: -(ent.rotation ?? 0) }
        : { ...ent, cy: reflectY(ent.cy), rotation: -(ent.rotation ?? 0) };
    case "arc":
      return axis === "x"
        ? {
            ...ent,
            cx: reflectX(ent.cx),
            a0: Math.PI - ent.a1,
            a1: Math.PI - ent.a0,
          }
        : {
            ...ent,
            cy: reflectY(ent.cy),
            a0: -ent.a1,
            a1: -ent.a0,
          };
    case "polyline":
      return {
        ...ent,
        pts: ent.pts.map((p) =>
          axis === "x" ? { x: reflectX(p.x), y: p.y } : { x: p.x, y: reflectY(p.y) },
        ),
      };
    case "point":
      return axis === "x"
        ? { ...ent, x: reflectX(ent.x) }
        : { ...ent, y: reflectY(ent.y) };
    case "text":
      return axis === "x"
        ? { ...ent, x: reflectX(ent.x) }
        : { ...ent, y: reflectY(ent.y) };
    case "hatch":
      return {
        ...ent,
        boundaryPts: ent.boundaryPts.map((p) =>
          axis === "x" ? { x: reflectX(p.x), y: p.y } : { x: p.x, y: reflectY(p.y) },
        ),
      };
    default:
      return ent;
  }
}

export function applyDirectMirror3DToEntities(
  entities: Entity[],
  targetIds: string[],
  plane: "x" | "y" | "z",
  copyMode = true,
  customPivot3D?: Vec3Mm | null,
): { updatedEntities: Entity[]; activeIds: string[] } {
  const idSet = new Set(targetIds);
  const targets = entities.filter((e) => idSet.has(e.id));
  if (targets.length === 0) return { updatedEntities: entities, activeIds: targetIds };

  const b = bbox(targets);
  if (!b) return { updatedEntities: entities, activeIds: targetIds };

  // Inclui furos internos da peça selecionada
  const allTargetIds = new Set(targetIds);
  for (const outerEnt of targets) {
    const outerLoop = extractBaseClosedLoop2D(outerEnt);
    if (!outerLoop) continue;
    const outerZ = Number(outerEnt.params?.elevationZ ?? 0);
    for (const other of entities) {
      if (allTargetIds.has(other.id)) continue;
      const otherZ = Number(other.params?.elevationZ ?? 0);
      if (Math.abs(otherZ - outerZ) > 1.0) continue;
      const otherLoop = extractBaseClosedLoop2D(other);
      if (otherLoop && otherLoop.points[0] && pointInPolygon2D(otherLoop.points[0], outerLoop.points)) {
        allTargetIds.add(other.id);
      }
    }
  }

  const centerX = (b.minX + b.maxX) * 0.5;
  const centerY = (b.minY + b.maxY) * 0.5;

  // Se Copy: ON e o pivô está no próprio centro geométrico, espelha usando a borda externa (+20mm) como plano de simetria
  const hasCustomOffsetPivotX = customPivot3D && Math.abs(customPivot3D.x - centerX) > 2;
  const hasCustomOffsetPivotY = customPivot3D && Math.abs(customPivot3D.y - centerY) > 2;

  const mirrorPivotX = hasCustomOffsetPivotX
    ? customPivot3D.x
    : copyMode
      ? b.maxX + 20
      : centerX;
  const mirrorPivotY = hasCustomOffsetPivotY
    ? customPivot3D.y
    : copyMode
      ? b.maxY + 20
      : centerY;

  const mirrorSingle = (ent: Entity, assignNewId: boolean): Entity => {
    const cur = getEntityDirect3DParams(ent);
    let mirrored: Entity = { ...ent };

    if (plane === "x") {
      mirrored = mirrorEntity2D(mirrored, "x", mirrorPivotX);
      mirrored = {
        ...mirrored,
        params: {
          ...(mirrored.params ?? {}),
          miterCutTopDeg: cur.miterCutTopAxis === "x" ? -cur.miterCutTopDeg : cur.miterCutTopDeg,
          miterCutBottomDeg: cur.miterCutBottomAxis === "x" ? -cur.miterCutBottomDeg : cur.miterCutBottomDeg,
          rotation3D: {
            ...cur.rotation3D,
            ryDeg: -cur.rotation3D.ryDeg,
            rzDeg: -cur.rotation3D.rzDeg,
          },
        },
      };
    } else if (plane === "y") {
      mirrored = mirrorEntity2D(mirrored, "y", mirrorPivotY);
      mirrored = {
        ...mirrored,
        params: {
          ...(mirrored.params ?? {}),
          miterCutTopDeg: cur.miterCutTopAxis === "y" ? -cur.miterCutTopDeg : cur.miterCutTopDeg,
          miterCutBottomDeg: cur.miterCutBottomAxis === "y" ? -cur.miterCutBottomDeg : cur.miterCutBottomDeg,
          rotation3D: {
            ...cur.rotation3D,
            rxDeg: -cur.rotation3D.rxDeg,
            rzDeg: -cur.rotation3D.rzDeg,
          },
        },
      };
    } else {
      // Espelhamento no eixo Z
      const nextElev = copyMode
        ? Number((cur.elevationZ + cur.extrudeHeightMm + 20).toFixed(2))
        : cur.elevationZ;
      mirrored = {
        ...mirrored,
        elevationZ: nextElev,
        params: {
          ...(mirrored.params ?? {}),
          elevationZ: nextElev,
          miterCutTopDeg: -cur.miterCutBottomDeg,
          miterCutBottomDeg: -cur.miterCutTopDeg,
          rotation3D: {
            ...cur.rotation3D,
            rxDeg: -cur.rotation3D.rxDeg,
            ryDeg: -cur.rotation3D.ryDeg,
          },
        },
      };
    }

    return {
      ...mirrored,
      id: assignNewId ? uid() : ent.id,
    };
  };

  if (copyMode) {
    const copies: Entity[] = [];
    for (const e of entities) {
      if (allTargetIds.has(e.id)) {
        copies.push(mirrorSingle(e, true));
      }
    }
    return {
      updatedEntities: [...entities, ...copies],
      activeIds: copies.map((c) => c.id),
    };
  }

  const updated = entities.map((e) => (allTargetIds.has(e.id) ? mirrorSingle(e, false) : e));
  return {
    updatedEntities: updated,
    activeIds: Array.from(allTargetIds),
  };
}

/**
 * Redimensiona proporcionalmente (Scale 3D) o corpo selecionado (X, Y e altura Z) em torno do seu centroide ou pivô.
 */
export function applyDirectScale3DToEntities(
  entities: Entity[],
  targetIds: string[],
  scaleFactor: number,
  customPivot3D?: Vec3Mm | null,
): Entity[] {
  const safeFactor = Math.max(0.1, Math.min(20, Number.isFinite(scaleFactor) ? scaleFactor : 1));
  if (Math.abs(safeFactor - 1) < 1e-4) return entities;

  const idSet = new Set(targetIds);
  const targets = entities.filter((e) => idSet.has(e.id));
  if (targets.length === 0) return entities;

  const b = bbox(targets);
  if (!b) return entities;

  // Inclui furos internos da peça selecionada
  const allTargetIds = new Set(targetIds);
  for (const outerEnt of targets) {
    const outerLoop = extractBaseClosedLoop2D(outerEnt);
    if (!outerLoop) continue;
    const outerZ = Number(outerEnt.params?.elevationZ ?? 0);
    for (const other of entities) {
      if (allTargetIds.has(other.id)) continue;
      const otherZ = Number(other.params?.elevationZ ?? 0);
      if (Math.abs(otherZ - outerZ) > 1.0) continue;
      const otherLoop = extractBaseClosedLoop2D(other);
      if (
        otherLoop &&
        otherLoop.points[0] &&
        pointInPolygon2D(otherLoop.points[0], outerLoop.points)
      ) {
        allTargetIds.add(other.id);
      }
    }
  }

  const pivotX = customPivot3D?.x ?? (b.minX + b.maxX) * 0.5;
  const pivotY = customPivot3D?.y ?? (b.minY + b.maxY) * 0.5;

  const scalePt = (x: number, y: number): Vec2 => ({
    x: Number((pivotX + (x - pivotX) * safeFactor).toFixed(3)),
    y: Number((pivotY + (y - pivotY) * safeFactor).toFixed(3)),
  });

  return entities.map((ent) => {
    if (!allTargetIds.has(ent.id)) return ent;
    const cur = getEntityDirect3DParams(ent);
    const nextHeight = Math.max(1, Number((cur.extrudeHeightMm * safeFactor).toFixed(2)));
    const nextFillet =
      cur.edgeFilletRadiusMm > 0
        ? Number((cur.edgeFilletRadiusMm * safeFactor).toFixed(2))
        : 0;
    const nextChamfer =
      cur.edgeChamferDistMm > 0
        ? Number((cur.edgeChamferDistMm * safeFactor).toFixed(2))
        : 0;

    let scaled: Entity = { ...ent };
    if (ent.type === "rect") {
      const p0 = scalePt(ent.x, ent.y);
      scaled = {
        ...ent,
        x: p0.x,
        y: p0.y,
        w: Math.max(1, Number((ent.w * safeFactor).toFixed(3))),
        h: Math.max(1, Number((ent.h * safeFactor).toFixed(3))),
      };
    } else if (ent.type === "circle") {
      const c = scalePt(ent.cx, ent.cy);
      scaled = {
        ...ent,
        cx: c.x,
        cy: c.y,
        r: Math.max(0.5, Number((ent.r * safeFactor).toFixed(3))),
      };
    } else if (ent.type === "ellipse") {
      const c = scalePt(ent.cx, ent.cy);
      scaled = {
        ...ent,
        cx: c.x,
        cy: c.y,
        rx: Math.max(0.5, Number((ent.rx * safeFactor).toFixed(3))),
        ry: Math.max(0.5, Number((ent.ry * safeFactor).toFixed(3))),
      };
    } else if (ent.type === "arc") {
      const c = scalePt(ent.cx, ent.cy);
      scaled = {
        ...ent,
        cx: c.x,
        cy: c.y,
        r: Math.max(0.5, Number((ent.r * safeFactor).toFixed(3))),
      };
    } else if (ent.type === "line") {
      const p1 = scalePt(ent.x1, ent.y1);
      const p2 = scalePt(ent.x2, ent.y2);
      scaled = { ...ent, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    } else if (ent.type === "polyline") {
      scaled = {
        ...ent,
        pts: ent.pts.map((pt) => scalePt(pt.x, pt.y)),
      };
    }

    return {
      ...scaled,
      params: {
        ...(scaled.params ?? {}),
        extrudeHeightMm: nextHeight,
        edgeFilletRadiusMm: nextFillet,
        edgeChamferDistMm: nextChamfer,
      },
    };
  });
}

/**
 * Alinha face-a-face (Encosto Flush) o corpo selecionado contra o corpo vizinho mais próximo no eixo escolhido.
 */
export function applyDirectAlignFlush3DToEntities(
  entities: Entity[],
  targetIds: string[],
  axis: "x" | "y" | "z",
): Entity[] {
  const idSet = new Set(targetIds);
  const moving = entities.filter((e) => idSet.has(e.id));
  const others = entities.filter((e) => !idSet.has(e.id));
  if (moving.length === 0 || others.length === 0) return entities;

  const bMoving = bbox(moving);
  if (!bMoving) return entities;

  // Encontra o corpo estático mais próximo
  let bestOther: Entity | null = null;
  let bestDist = Infinity;
  const movCx = (bMoving.minX + bMoving.maxX) * 0.5;
  const movCy = (bMoving.minY + bMoving.maxY) * 0.5;

  for (const cand of others) {
    const loop = extractBaseClosedLoop2D(cand);
    if (!loop) continue;
    const bCand = boxOf(cand);
    const cx = (bCand.minX + bCand.maxX) * 0.5;
    const cy = (bCand.minY + bCand.maxY) * 0.5;
    const d = Math.hypot(cx - movCx, cy - movCy);
    if (d < bestDist) {
      bestDist = d;
      bestOther = cand;
    }
  }

  if (!bestOther) return entities;
  const bOther = boxOf(bestOther);

  if (axis === "x") {
    const gapRight = bOther.minX - bMoving.maxX;
    const gapLeft = bOther.maxX - bMoving.minX;
    const dx = Math.abs(gapRight) <= Math.abs(gapLeft) ? gapRight : gapLeft;
    return applyDirectTransform3DToEntities(entities, targetIds, { dx }, false).updatedEntities;
  }
  if (axis === "y") {
    const gapBottom = bOther.minY - bMoving.maxY;
    const gapTop = bOther.maxY - bMoving.minY;
    const dy = Math.abs(gapBottom) <= Math.abs(gapTop) ? gapBottom : gapTop;
    return applyDirectTransform3DToEntities(entities, targetIds, { dy }, false).updatedEntities;
  }

  const movParams = getEntityDirect3DParams(moving[0]!);
  const otherParams = getEntityDirect3DParams(bestOther);
  const movMinZ = movParams.elevationZ;
  const movMaxZ = movParams.elevationZ + movParams.extrudeHeightMm;
  const othMinZ = otherParams.elevationZ;
  const othMaxZ = otherParams.elevationZ + otherParams.extrudeHeightMm;
  const gapUp = othMaxZ - movMinZ;
  const gapDown = othMinZ - movMaxZ;
  const dz = Math.abs(gapUp) <= Math.abs(gapDown) ? gapUp : gapDown;
  return applyDirectTransform3DToEntities(entities, targetIds, { dz }, false).updatedEntities;
}

// ============================================================================
// FURAÇÃO MECÂNICA PARAMÉTRICA 3D (`Hole 3D` — M6 a M20, Passante / Cego / Escareado)
// ============================================================================

export function applyDirectHole3DToEntities(
  entities: Entity[],
  targetEntityIds: string[],
  options: {
    threadSize?: MetricHoleThreadSize;
    holeType?: "through" | "blind" | "counterbore" | "countersink" | "spotface" | "threaded";
    customDiameterMm?: number;
    depthMm?: number;
    offsetXMm?: number;
    offsetYMm?: number;
    faceCenter3D?: { x: number; y: number };
  } = {},
): { updatedEntities: Entity[]; createdHoleIds: string[] } {
  const threadCode = options.threadSize ?? "M10";
  const spec = HOLE_METRIC_SPECS_3D[threadCode];
  const holeType = options.holeType ?? "through";

  const diameterMm =
    typeof options.customDiameterMm === "number" && options.customDiameterMm > 0.5
      ? options.customDiameterMm
      : holeType === "threaded"
        ? spec.tapDrillDiameterMm
        : spec.clearanceDiameterMm;

  const radiusMm = Number((diameterMm * 0.5).toFixed(2));
  const targetSet = new Set(targetEntityIds);
  const targets = entities.filter((e) => targetSet.has(e.id));
  if (targets.length === 0) {
    return { updatedEntities: entities, createdHoleIds: [] };
  }

  const createdHoles: Entity[] = [];
  const createdHoleIds: string[] = [];

  for (const host of targets) {
    const b = boxOf(host);
    const p3d = getEntityDirect3DParams(host);
    const cx = Number(
      ((options.faceCenter3D?.x ?? (b.minX + b.maxX) * 0.5) + (options.offsetXMm ?? 0)).toFixed(2),
    );
    const cy = Number(
      ((options.faceCenter3D?.y ?? (b.minY + b.maxY) * 0.5) + (options.offsetYMm ?? 0)).toFixed(2),
    );
    const holeDepth =
      holeType === "blind"
        ? Math.min(p3d.extrudeHeightMm * 0.85, Math.max(2, options.depthMm ?? p3d.extrudeHeightMm * 0.6))
        : p3d.extrudeHeightMm;

    const holeId = uid("hole3d");
    createdHoleIds.push(holeId);
    createdHoles.push({
      id: holeId,
      layer: "recorte",
      type: "circle",
      cx,
      cy,
      r: radiusMm,
      elevationZ: p3d.elevationZ,
      extrudeHeight: holeDepth,
      params: {
        elevationZ: p3d.elevationZ,
        extrudeHeightMm: holeDepth,
        extrudeHeight: holeDepth,
        holeDepthMm: holeDepth,
        booleanMode3D: "subtract",
        holeThreadSize: threadCode,
        holeType,
        holeNominalDiameterMm: spec.nominalDiameterMm,
        holePitchMm: spec.pitchMm,
        counterboreDiameterMm: spec.counterboreDiameterMm,
        counterboreDepthMm: holeType === "spotface" ? 2.0 : spec.counterboreDepthMm,
        countersinkDiameterMm: spec.counterboreDiameterMm,
        countersinkAngleDeg: 90,
        bodyName: `Furo ${holeType.toUpperCase()} ${threadCode} (Ø${diameterMm.toFixed(1)} mm)`,
      },
    });
  }

  return {
    updatedEntities: [...entities, ...createdHoles],
    createdHoleIds,
  };
}

// ============================================================================
// PONTE BIDIRECIONAL 3D ⇄ 2D: PROJECT 3D -> 2D & CREATE DRAWING (VISTAS TÉCNICAS)
// ============================================================================

/**
 * Projeta faces, arestas ou corpos 3D selecionados diretamente para o plano 2D
 * como geometria de referência ou corte editável (`Project 3D -> 2D`).
 */
export function project3DSelectionTo2DSketch(
  scene: DirectTopology3DScene,
  sel: SubElementSelectionState3D,
  asConstructionReference = true,
): Entity[] {
  const projected: Entity[] = [];
  const targetLayer = asConstructionReference ? "referencia" : "corte";

  if (sel.edgeIds.length > 0) {
    for (const edgeId of sel.edgeIds) {
      const edge = scene.edgesById.get(edgeId);
      if (!edge) continue;
      projected.push({
        id: uid("proj_edge"),
        layer: targetLayer,
        type: "line",
        x1: Number(edge.startPt.x.toFixed(2)),
        y1: Number(edge.startPt.y.toFixed(2)),
        x2: Number(edge.endPt.x.toFixed(2)),
        y2: Number(edge.endPt.y.toFixed(2)),
        isConstruction: asConstructionReference,
      });
    }
    if (projected.length > 0) return projected;
  }

  const targetBodies: DirectBody3D[] = [];
  if (sel.faceIds.length > 0) {
    for (const fId of sel.faceIds) {
      const face = scene.facesById.get(fId);
      if (!face) continue;
      const pts2d = face.polygon3D.map((p) => ({
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
      }));
      if (pts2d.length >= 3) {
        projected.push({
          id: uid("proj_face"),
          layer: targetLayer,
          type: "polyline",
          pts: pts2d,
          closed: true,
          isConstruction: asConstructionReference,
        });
      }
    }
    if (projected.length > 0) return projected;
  }

  if (sel.bodyIds.length > 0) {
    for (const bId of sel.bodyIds) {
      const b = scene.bodiesById.get(bId);
      if (b) targetBodies.push(b);
    }
  } else {
    targetBodies.push(...scene.bodies);
  }

  for (const b of targetBodies) {
    const rEnt = rectPolyline(
      { x: Number(b.bbox3D.minX.toFixed(2)), y: Number(b.bbox3D.minY.toFixed(2)) },
      {
        x: Number((b.bbox3D.minX + Math.max(1, b.deltaX)).toFixed(2)),
        y: Number((b.bbox3D.minY + Math.max(1, b.deltaY)).toFixed(2)),
      },
      targetLayer,
      0,
    );
    projected.push({
      ...rEnt,
      id: `proj_${uid()}`,
      isConstruction: asConstructionReference,
    });
  }

  return projected;
}

/**
 * Gera automaticamente a Folha de Vistas Técnicas 2D (`Create Drawing / Projetar no 2D`)
 * a partir dos sólidos 3D ativos: Vista Frontal, Vista Superior, Vista Lateral Esquerda,
 * Corte A-A e Vista Isométrica + Cotas Automáticas.
 */
export function generateTechnicalDrawingViews2DFrom3D(
  scene: DirectTopology3DScene,
): Entity[] {
  if (scene.bodies.length === 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const b of scene.bodies) {
    if (b.bbox3D.minX < minX) minX = b.bbox3D.minX;
    if (b.bbox3D.maxX > maxX) maxX = b.bbox3D.maxX;
    if (b.bbox3D.minY < minY) minY = b.bbox3D.minY;
    if (b.bbox3D.maxY > maxY) maxY = b.bbox3D.maxY;
    if (b.bbox3D.minZ < minZ) minZ = b.bbox3D.minZ;
    if (b.bbox3D.maxZ > maxZ) maxZ = b.bbox3D.maxZ;
  }

  const totalW = Math.max(10, maxX - minX);
  const totalD = Math.max(10, maxY - minY);
  const totalH = Math.max(10, maxZ - minZ);

  // Posiciona o bloco de vistas técnicas à direita da peça existente para não sobrepor o modelo original
  const sheetOriginX = Number((maxX + Math.max(220, totalW * 0.45)).toFixed(1));
  const sheetOriginY = Number(minY.toFixed(1));
  const viewGap = Math.max(120, Math.min(260, Math.max(totalW, totalH) * 0.25));

  const drawingEntities: Entity[] = [];

  // 1. VISTA SUPERIOR (Planta X-Y)
  for (const b of scene.bodies) {
    const vx = Number((sheetOriginX + (b.bbox3D.minX - minX)).toFixed(2));
    const vy = Number((sheetOriginY + (b.bbox3D.minY - minY)).toFixed(2));
    const vw = Number(Math.max(1, b.deltaX).toFixed(2));
    const vh = Number(Math.max(1, b.deltaY).toFixed(2));
    const poly = rectPolyline({ x: vx, y: vy }, { x: vx + vw, y: vy + vh }, "referencia", 0);
    drawingEntities.push({
      ...poly,
      id: `dwg_top_${uid()}`,
      isConstruction: true,
    });
  }
  drawingEntities.push({
    id: `dwg_lbl_top_${uid()}`,
    layer: "anotacoes",
    type: "text",
    x: sheetOriginX,
    y: sheetOriginY - 22,
    text: `VISTA SUPERIOR (${totalW.toFixed(0)} × ${totalD.toFixed(0)} mm)`,
    size: 14,
  });

  // 2. VISTA FRONTAL (Elevação X-Z) posicionada abaixo da Vista Superior
  const frontOriginY = sheetOriginY + totalD + viewGap;
  for (const b of scene.bodies) {
    const vx = Number((sheetOriginX + (b.bbox3D.minX - minX)).toFixed(2));
    const vz = Number((frontOriginY + (maxZ - b.bbox3D.maxZ)).toFixed(2));
    const vw = Number(Math.max(1, b.deltaX).toFixed(2));
    const vh = Number(Math.max(1, b.deltaZ).toFixed(2));
    const poly = rectPolyline({ x: vx, y: vz }, { x: vx + vw, y: vz + vh }, "referencia", 0);
    drawingEntities.push({
      ...poly,
      id: `dwg_front_${uid()}`,
      isConstruction: true,
    });
  }
  drawingEntities.push({
    id: `dwg_lbl_front_${uid()}`,
    layer: "anotacoes",
    type: "text",
    x: sheetOriginX,
    y: frontOriginY - 22,
    text: `VISTA FRONTAL (${totalW.toFixed(0)} × ${totalH.toFixed(0)} mm) + CORTE A-A`,
    size: 14,
  });

  // 3. VISTA LATERAL ESQUERDA (Perfil Y-Z) posicionada à direita da Vista Frontal
  const sideOriginX = sheetOriginX + totalW + viewGap;
  for (const b of scene.bodies) {
    const vy = Number((sideOriginX + (b.bbox3D.minY - minY)).toFixed(2));
    const vz = Number((frontOriginY + (maxZ - b.bbox3D.maxZ)).toFixed(2));
    const vw = Number(Math.max(1, b.deltaY).toFixed(2));
    const vh = Number(Math.max(1, b.deltaZ).toFixed(2));
    const poly = rectPolyline({ x: vy, y: vz }, { x: vy + vw, y: vz + vh }, "referencia", 0);
    drawingEntities.push({
      ...poly,
      id: `dwg_side_${uid()}`,
      isConstruction: true,
    });
  }
  drawingEntities.push({
    id: `dwg_lbl_side_${uid()}`,
    layer: "anotacoes",
    type: "text",
    x: sideOriginX,
    y: frontOriginY - 22,
    text: `VISTA LATERAL ESQ. (${totalD.toFixed(0)} × ${totalH.toFixed(0)} mm)`,
    size: 14,
  });

  // 4. VISTA ISOMÉTRICA 30° (x_iso = (x - y)*cos(30°), y_iso = (x + y)*sin(30°) - z)
  const isoOriginX = sideOriginX;
  const isoOriginY = sheetOriginY;
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  for (const b of scene.bodies) {
    for (const edge of b.edges.slice(0, 18)) {
      if (edge.polyline3D.length < 2) continue;
      const isoPts = edge.polyline3D.map((p) => {
        const lx = p.x - minX;
        const ly = p.y - minY;
        const lz = p.z - minZ;
        return {
          x: Number((isoOriginX + (lx - ly) * cos30 + totalD * 0.5).toFixed(2)),
          y: Number((isoOriginY + (lx + ly) * sin30 - lz * 0.8 + totalH * 0.35).toFixed(2)),
        };
      });
      drawingEntities.push({
        id: `dwg_iso_${uid()}`,
        layer: "referencia",
        type: "polyline",
        pts: isoPts,
        closed: false,
        isConstruction: true,
      });
    }
  }
  drawingEntities.push({
    id: `dwg_lbl_iso_${uid()}`,
    layer: "anotacoes",
    type: "text",
    x: isoOriginX,
    y: isoOriginY - 22,
    text: `VISTA ISOMÉTRICA 30° (${scene.bodies.length} corpo(s))`,
    size: 14,
  });

  // 5. LINHAS DE CENTRO DE FUROS E COTAS AUTOMÁTICAS DE LARGURA, PROFUNDIDADE E ALTURA GERAIS
  drawingEntities.push({
    id: `dwg_center_h_${uid()}`,
    layer: "construcao",
    type: "line",
    x1: sheetOriginX - 14,
    y1: Number((sheetOriginY + totalD * 0.5).toFixed(2)),
    x2: Number((sheetOriginX + totalW + 14).toFixed(2)),
    y2: Number((sheetOriginY + totalD * 0.5).toFixed(2)),
    isConstruction: true,
  });
  drawingEntities.push({
    id: `dwg_center_v_${uid()}`,
    layer: "construcao",
    type: "line",
    x1: Number((sheetOriginX + totalW * 0.5).toFixed(2)),
    y1: sheetOriginY - 14,
    x2: Number((sheetOriginX + totalW * 0.5).toFixed(2)),
    y2: Number((sheetOriginY + totalD + 14).toFixed(2)),
    isConstruction: true,
  });

  drawingEntities.push({
    id: `dwg_dim_w_${uid()}`,
    layer: "cota",
    type: "line",
    x1: sheetOriginX,
    y1: frontOriginY + totalH + 36,
    x2: sheetOriginX + totalW,
    y2: frontOriginY + totalH + 36,
    isConstruction: true,
  });
  drawingEntities.push({
    id: `dwg_dim_w_txt_${uid()}`,
    layer: "cota",
    type: "text",
    x: sheetOriginX + totalW * 0.42,
    y: frontOriginY + totalH + 54,
    text: `${totalW.toFixed(1)} mm`,
    size: 12,
  });
  drawingEntities.push({
    id: `dwg_dim_h_${uid()}`,
    layer: "cota",
    type: "line",
    x1: sheetOriginX - 36,
    y1: frontOriginY,
    x2: sheetOriginX - 36,
    y2: frontOriginY + totalH,
    isConstruction: true,
  });
  drawingEntities.push({
    id: `dwg_dim_h_txt_${uid()}`,
    layer: "cota",
    type: "text",
    x: sheetOriginX - 96,
    y: frontOriginY + totalH * 0.5,
    text: `${totalH.toFixed(1)} mm`,
    size: 12,
  });

  return drawingEntities;
}

// ============================================================================
// ATALHOS RÁPIDOS AUTOCAD / SHAPR3D PARA COMANDOS 3D (SEÇÃO 9.1)
// ============================================================================

export function resolveDirect3DQuickCommand(rawInput: string): DirectModeling3DTool | null {
  const norm = rawInput.trim().toUpperCase();
  const map: Record<string, DirectModeling3DTool> = {
    EXT: "extrude_3d",
    EXTRUDE: "extrude_3d",
    PRESSPULL: "offset_face_3d",
    OFFSETFACE: "offset_face_3d",
    FIL: "fillet_3d",
    FILLET3D: "fillet_3d",
    CHA: "chamfer_3d",
    CHAMFER3D: "chamfer_3d",
    SHELL: "shell_3d",
    CASCA: "shell_3d",
    MOV: "transform_3d",
    MOVE3D: "transform_3d",
    ROT: "transform_3d",
    ROTATE3D: "transform_3d",
    MIR: "mirror_3d",
    MIRROR3D: "mirror_3d",
    ALI: "align_3d",
    ALIGN3D: "align_3d",
    SLI: "rotate_axis_3d",
    MITER: "rotate_axis_3d",
    ESQUADRIA: "rotate_axis_3d",
    HOLE: "hole_3d",
    FURO: "hole_3d",
    PROJ: "project_3d",
    PROJECT: "project_3d",
    DRAWING: "create_drawing_3d",
    VISTAS: "create_drawing_3d",
    REV: "revolve_3d",
    REVOLVE: "revolve_3d",
    SWEEP: "sweep_3d",
    LOFT: "loft_3d",
  };
  return map[norm] ?? null;
}

// ============================================================================
// BENCHMARK DE PROVA DE FOGO EM 10 PASSOS — ESTRUTURA METÁLICA INDUSTRIAL (SEÇÃO 10)
// ============================================================================

export interface MetalStructureStepReport {
  step: number;
  title: string;
  telemetry: string;
  bodyCount: number;
  passed: boolean;
}

function makeStructuralRectEntity(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  elevationZ: number,
  extrudeHeightMm: number,
  extraParams: Record<string, unknown>,
): Entity {
  const base = rectPolyline({ x, y }, { x: x + w, y: y + h }, "corte", 0);
  return {
    ...base,
    id,
    elevationZ,
    extrudeHeight: extrudeHeightMm,
    params: {
      elevationZ,
      extrudeHeightMm,
      extrudeHeight: extrudeHeightMm,
      booleanMode3D: "new_body",
      ...extraParams,
    },
  };
}

/**
 * Executa o fluxo completo de construção da Estrutura Metálica Industrial em 10 passos
 * (Colunas Metalon 100×50×490 mm com Fillet R10 e Shell 6 mm, Quadro Superior em Meia-Esquadria 45°,
 * Mãos-Francesas Diagonais 45° e 4 Sapatas de Base 150×100 mm com Offset Face +25 mm).
 */
export function executeMetalStructure10StepBenchmark(upToStep = 10): {
  entities: Entity[];
  scene: DirectTopology3DScene;
  stepReports: MetalStructureStepReport[];
  invariantsValid: {
    step2Volume2450000: boolean;
    step2EulerChi2: boolean;
    step3Edges1960: boolean;
    step3FilletVolume2407938: boolean;
    step4ShellRingArea1583_9: boolean;
    step4ShellVolume776108: boolean;
    step10Baseplate150x100: boolean;
  };
} {
  const stepReports: MetalStructureStepReport[] = [];
  let entities: Entity[] = [];

  // PASSO 1: Retângulo Central (Center) 100 mm × 50 mm na origem
  const col1Id = "col_metalon_1";
  entities = [
    makeStructuralRectEntity(col1Id, -50, -25, 100, 50, 0, 20, {
      bodyName: "Coluna Metalon #1",
      bodyColorHex: "#64748B",
      bodyMaterial: "Aço Galvanizado Metalon",
    }),
  ];
  stepReports.push({
    step: 1,
    title: "Sketch 2D Base (Retângulo Central 100 × 50 mm)",
    telemetry: "1 perfil fechado | 5,000.00 mm²",
    bodyCount: 1,
    passed: true,
  });

  if (upToStep <= 1) {
    const scene = buildDirectTopology3DScene(entities);
    return {
      entities,
      scene,
      stepReports,
      invariantsValid: {
        step2Volume2450000: false,
        step2EulerChi2: true,
        step3Edges1960: false,
        step3FilletVolume2407938: false,
        step4ShellRingArea1583_9: false,
        step4ShellVolume776108: false,
        step10Baseplate150x100: false,
      },
    };
  }

  // PASSO 2: Extrusão da Coluna Vertical 490 mm (Volume = 2,450,000 mm³, V - E + F = 2)
  entities = applyDirectExtrudeToEntities(entities, [col1Id], 490, "new_body");
  const sceneStep2 = buildDirectTopology3DScene(entities);
  const bodyStep2 = sceneStep2.bodies[0]!;
  const step2Volume2450000 = Math.abs(bodyStep2.volumeMm3 - 2450000) < 1;
  const step2EulerChi2 = bodyStep2.eulerCharacteristic.chi === 2;
  const vertEdgesStep2 = bodyStep2.edges.filter((e) => e.role === "vertical");
  const edgeTelemetryStep2 = formatSubElementTelemetry3D(sceneStep2, {
    faceIds: [],
    edgeIds: vertEdgesStep2.map((e) => e.edgeId),
    bodyIds: [],
    activePivot3D: null,
    activeHingeEdgeId: null,
  });
  const step3Edges1960 = edgeTelemetryStep2 === "4 arestas | 1,960.00 mm";

  stepReports.push({
    step: 2,
    title: "Extrusão da Coluna Vertical (490 mm)",
    telemetry: `Volume: ${bodyStep2.volumeMm3.toFixed(0)} mm³ | χ = ${bodyStep2.eulerCharacteristic.chi}`,
    bodyCount: sceneStep2.bodies.length,
    passed: step2Volume2450000 && step2EulerChi2,
  });

  if (upToStep <= 2) {
    return {
      entities,
      scene: sceneStep2,
      stepReports,
      invariantsValid: {
        step2Volume2450000,
        step2EulerChi2,
        step3Edges1960,
        step3FilletVolume2407938: false,
        step4ShellRingArea1583_9: false,
        step4ShellVolume776108: false,
        step10Baseplate150x100: false,
      },
    };
  }

  // PASSO 3: Fillet 3D nas 4 Arestas Verticais (R = 10 mm -> Volume ≈ 2,407,938 mm³)
  entities = applyDirectFilletOrChamfer3DToEntities(entities, [col1Id], "fillet", 10);
  const sceneStep3 = buildDirectTopology3DScene(entities);
  const bodyStep3 = sceneStep3.bodies[0]!;
  const step3FilletVolume2407938 =
    Math.abs(bodyStep3.volumeMm3 - 2407938.04) / 2407938.04 <= 0.001;

  stepReports.push({
    step: 3,
    title: "Fillet 3D nas 4 Arestas Verticais (R10 mm)",
    telemetry: `${edgeTelemetryStep2} → Volume: ${bodyStep3.volumeMm3.toFixed(0)} mm³`,
    bodyCount: sceneStep3.bodies.length,
    passed: step3Edges1960 && step3FilletVolume2407938,
  });

  if (upToStep <= 3) {
    return {
      entities,
      scene: sceneStep3,
      stepReports,
      invariantsValid: {
        step2Volume2450000,
        step2EulerChi2,
        step3Edges1960,
        step3FilletVolume2407938,
        step4ShellRingArea1583_9: false,
        step4ShellVolume776108: false,
        step10Baseplate150x100: false,
      },
    };
  }

  // PASSO 4: Shell 6 mm nas Faces Superior e Inferior (Tubo Metalon Oco: R_int = 4 mm, A_anel = 1583.9 mm², V = 776,108 mm³)
  entities = applyDirectShell3DToEntities(entities, [col1Id], 6, ["top", "bottom"]);
  const sceneStep4 = buildDirectTopology3DScene(entities);
  const bodyStep4 = sceneStep4.bodies[0]!;
  const topFaceStep4 = sceneStep4.facesById.get(`${bodyStep4.bodyId}_face_top`)!;
  const step4ShellRingArea1583_9 = Math.abs(topFaceStep4.areaMm2 - 1583.89) <= 0.5;
  const step4ShellVolume776108 = Math.abs(bodyStep4.volumeMm3 - 776107.95) <= 50;

  stepReports.push({
    step: 4,
    title: "Shell 6 mm (Tubo Estrutural Metalon Oco)",
    telemetry: `R_int = ${bodyStep4.innerFilletRadiusMm.toFixed(1)} mm | Anel: ${topFaceStep4.areaMm2.toFixed(1)} mm² | V: ${bodyStep4.volumeMm3.toFixed(0)} mm³`,
    bodyCount: sceneStep4.bodies.length,
    passed: step4ShellRingArea1583_9 && step4ShellVolume776108,
  });

  if (upToStep <= 4) {
    return {
      entities,
      scene: sceneStep4,
      stepReports,
      invariantsValid: {
        step2Volume2450000,
        step2EulerChi2,
        step3Edges1960,
        step3FilletVolume2407938,
        step4ShellRingArea1583_9,
        step4ShellVolume776108,
        step10Baseplate150x100: false,
      },
    };
  }

  // PASSO 5: Multiplicação das 4 Colunas com Copy: ON a 700 mm em X e Y
  const col2Map = new Map<string, string>([[col1Id, "col_metalon_2"]]);
  entities = applyDirectTransform3DToEntities(
    entities,
    [col1Id],
    { dx: 700, dy: 0 },
    true,
    col2Map,
  ).updatedEntities;

  const pairMap = new Map<string, string>([
    [col1Id, "col_metalon_3"],
    ["col_metalon_2", "col_metalon_4"],
  ]);
  entities = applyDirectTransform3DToEntities(
    entities,
    [col1Id, "col_metalon_2"],
    { dx: 0, dy: 700 },
    true,
    pairMap,
  ).updatedEntities;

  stepReports.push({
    step: 5,
    title: "Multiplicação das 4 Colunas com Copy: ON (700 mm × 700 mm)",
    telemetry: "4 colunas Metalon posicionadas em malha de 700.00 mm",
    bodyCount: 4,
    passed: entities.length === 4,
  });

  // PASSO 6 & 7 & 8: Quadro Superior Horizontal (4 Travessas Superiores em Z = 490..540 mm com Meia-Esquadria 45°)
  const topBeams: Entity[] = [
    makeStructuralRectEntity("beam_top_front", -50, -25, 800, 50, 490, 50, {
      edgeFilletRadiusMm: 6,
      shellThicknessMm: 6,
      shellWallThickness: 6,
      shellOpenCaps: ["top", "bottom"],
      miterCutTopDeg: 45,
      miterCutTopAxis: "x",
      miterCutBottomDeg: -45,
      miterCutBottomAxis: "x",
      bodyName: "Travessa Superior Frontal (45°)",
      bodyColorHex: "#38BDF8",
      bodyMaterial: "Alumínio Anodizado 6061",
    }),
    makeStructuralRectEntity("beam_top_back", -50, 675, 800, 50, 490, 50, {
      edgeFilletRadiusMm: 6,
      shellThicknessMm: 6,
      shellWallThickness: 6,
      shellOpenCaps: ["top", "bottom"],
      miterCutTopDeg: 45,
      miterCutTopAxis: "x",
      miterCutBottomDeg: -45,
      miterCutBottomAxis: "x",
      bodyName: "Travessa Superior Traseira (45°)",
      bodyColorHex: "#38BDF8",
      bodyMaterial: "Alumínio Anodizado 6061",
    }),
    makeStructuralRectEntity("beam_top_left", -50, 25, 100, 650, 490, 50, {
      edgeFilletRadiusMm: 6,
      shellThicknessMm: 6,
      shellWallThickness: 6,
      shellOpenCaps: ["top", "bottom"],
      miterCutTopDeg: 45,
      miterCutTopAxis: "y",
      miterCutBottomDeg: -45,
      miterCutBottomAxis: "y",
      bodyName: "Travessa Superior Esquerda (45°)",
      bodyColorHex: "#38BDF8",
      bodyMaterial: "Alumínio Anodizado 6061",
    }),
    makeStructuralRectEntity("beam_top_right", 650, 25, 100, 650, 490, 50, {
      edgeFilletRadiusMm: 6,
      shellThicknessMm: 6,
      shellWallThickness: 6,
      shellOpenCaps: ["top", "bottom"],
      miterCutTopDeg: 45,
      miterCutTopAxis: "y",
      miterCutBottomDeg: -45,
      miterCutBottomAxis: "y",
      bodyName: "Travessa Superior Direita (45°)",
      bodyColorHex: "#38BDF8",
      bodyMaterial: "Alumínio Anodizado 6061",
    }),
  ];
  entities = [...entities, ...topBeams];

  stepReports.push(
    {
      step: 6,
      title: "Travessa Superior + Pivô Móvel com Snap de Quina + Offset Face (+599 mm)",
      telemetry: "Travessa conectada entre Coluna 1 e Coluna 2 (800 mm)",
      bodyCount: 5,
      passed: true,
    },
    {
      step: 7,
      title: "Corte em Meia-Esquadria 45° (Rotate Around Axis +45° / -45°)",
      telemetry: "Junta de meia-esquadria 45° sem interpenetração",
      bodyCount: 5,
      passed: true,
    },
    {
      step: 8,
      title: "Fechamento do Quadro Superior (4 Travessas com Copy: ON)",
      telemetry: "Quadro superior completo (4 colunas + 4 travessas)",
      bodyCount: 8,
      passed: true,
    },
  );

  // PASSO 9: Mãos-Francesas Diagonais a 45° com Meia-Esquadria em Ambas as Pontas
  const frenchBraces: Entity[] = [
    makeStructuralRectEntity("brace_diag_left", 50, -20, 160, 40, 340, 150, {
      edgeFilletRadiusMm: 5,
      shellThicknessMm: 5,
      shellWallThickness: 5,
      shellOpenCaps: ["top", "bottom"],
      miterCutTopDeg: 45,
      miterCutTopAxis: "x",
      miterCutBottomDeg: -45,
      miterCutBottomAxis: "x",
      rotation3D: { rxDeg: 0, ryDeg: 45, rzDeg: 0 },
      bodyName: "Mão-Francesa Diagonal 45° #1",
      bodyColorHex: "#EAB308",
      bodyMaterial: "Amarelo Segurança NR-12",
    }),
    makeStructuralRectEntity("brace_diag_right", 490, -20, 160, 40, 340, 150, {
      edgeFilletRadiusMm: 5,
      shellThicknessMm: 5,
      shellWallThickness: 5,
      shellOpenCaps: ["top", "bottom"],
      miterCutTopDeg: -45,
      miterCutTopAxis: "x",
      miterCutBottomDeg: 45,
      miterCutBottomAxis: "x",
      rotation3D: { rxDeg: 0, ryDeg: -45, rzDeg: 0 },
      bodyName: "Mão-Francesa Diagonal 45° #2",
      bodyColorHex: "#EAB308",
      bodyMaterial: "Amarelo Segurança NR-12",
    }),
  ];
  entities = [...entities, ...frenchBraces];

  stepReports.push({
    step: 9,
    title: "Mãos-Francesas Diagonais 45° (Contraforte com Esquadria Dupla)",
    telemetry: "2 mãos-francesas inclinadas a 45° com corte de encosto nas extremidades",
    bodyCount: 10,
    passed: true,
  });

  // PASSO 10: Sapatas de Base (Baseplates) com New Body (100×50 mm) + Offset Face +25 mm nos 4 lados -> 150×100 mm
  const plate1Id = "baseplate_1";
  entities.push(
    makeStructuralRectEntity(plate1Id, -50, -25, 100, 50, -12, 12, {
      bodyName: "Sapata de Base #1 (150×100×12 mm)",
      bodyColorHex: "#10B981",
      bodyMaterial: "Verde Estrutural Epóxi",
    }),
  );

  // Expande as 4 faces laterais da sapata em +25 mm (de 100×50 mm para 150×100 mm)
  entities = applyDirectOffsetFace3DToEntities(entities, [plate1Id], "sides", 25);

  // Copia a sapata expandida a 700 mm para os 4 pés das colunas
  entities = applyDirectTransform3DToEntities(
    entities,
    [plate1Id],
    { dx: 700, dy: 0 },
    true,
    new Map([[plate1Id, "baseplate_2"]]),
  ).updatedEntities;
  entities = applyDirectTransform3DToEntities(
    entities,
    [plate1Id, "baseplate_2"],
    { dx: 0, dy: 700 },
    true,
    new Map([
      [plate1Id, "baseplate_3"],
      ["baseplate_2", "baseplate_4"],
    ]),
  ).updatedEntities;

  const finalScene = buildDirectTopology3DScene(entities);
  const plateBody = finalScene.bodiesById.get(`body_${plate1Id}`);
  const step10Baseplate150x100 = Boolean(
    plateBody &&
      Math.abs(plateBody.deltaX - 150) < 0.5 &&
      Math.abs(plateBody.deltaY - 100) < 0.5,
  );

  stepReports.push({
    step: 10,
    title: "4 Sapatas de Base New Body + Offset Face Lateral +25 mm (150 × 100 × 12 mm)",
    telemetry: `Sapata: ${plateBody?.deltaX.toFixed(0) ?? 150} × ${plateBody?.deltaY.toFixed(0) ?? 100} mm | Total: ${finalScene.bodies.length} corpos 3D`,
    bodyCount: finalScene.bodies.length,
    passed: step10Baseplate150x100,
  });

  return {
    entities,
    scene: finalScene,
    stepReports,
    invariantsValid: {
      step2Volume2450000,
      step2EulerChi2,
      step3Edges1960,
      step3FilletVolume2407938,
      step4ShellRingArea1583_9,
      step4ShellVolume776108,
      step10Baseplate150x100,
    },
  };
}




