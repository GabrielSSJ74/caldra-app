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

import { bbox, boxOf, translate, uid, type Entity, type Vec2 } from "./core";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";
import type { WorkplaneOrbitProjection2D } from "./orbit3dController";

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
  | "color_material_3d"
  | "sketch_on_face_3d";

export type BooleanMode3D = "union" | "new_body" | "subtract" | "intersect";
export type DirectBooleanMode3D = BooleanMode3D;

export type FaceRole3D = "top" | "bottom" | "side" | "inner_side" | "miter";
export type EdgeRole3D = "vertical" | "top" | "bottom" | "inner_top" | "inner_bottom";

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
  edgeChamferDistMm: number;
  shellWallThicknessMm: number;
  shellThicknessMm: number;
  sheetThicknessMm: number;
  shellOpenCaps: ("top" | "bottom")[];
  offsetFaceTopMm: number;
  offsetFaceBottomMm: number;
  offsetFaceSidesMm: number;
  miterCutTopDeg: number;
  miterCutTopAxis: "x" | "y";
  miterCutBottomDeg: number;
  miterCutBottomAxis: "x" | "y";
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number };
  pivot3D: Vec3Mm;
  colorHex: string;
  materialName: string;
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
  snapCandidates: DirectSnapPivotCandidate3D[];
}

export interface DirectTopology3DScene {
  bodies: DirectBody3D[];
  facesById: Map<string, DirectFace3D>;
  edgesById: Map<string, DirectEdge3D>;
  bodiesById: Map<string, DirectBody3D>;
  facesByMeshIndex: Map<number, DirectFace3D>;
  edgesByMeshIndex: Map<number, DirectEdge3D>;
  tessellatedShape: CadTessellatedShape;
}

export interface SubElementSelectionState3D {
  faceIds: string[];
  edgeIds: string[];
  bodyIds: string[];
  activePivot3D: Vec3Mm | null;
  activeHingeEdgeId: string | null;
}

export type ParametricNumpadKind =
  | "EXTRUSION"
  | "RADIUS"
  | "CHAMFER"
  | "THICKNESS"
  | "OFFSET"
  | "ANGLE"
  | "DISTANCE"
  | "SCALE"
  | "WIDTH"
  | "HEIGHT";

export type NumpadTargetParameter =
  | "extrudeHeight"
  | "shellWallThickness"
  | "filletRadius"
  | "chamferDistance"
  | "offsetFaceDistance"
  | "miterAngle"
  | "moveX"
  | "moveY"
  | "moveZ";

export interface ActiveParametricNumpadSession {
  kind: ParametricNumpadKind;
  targetParameter?: NumpadTargetParameter;
  targetEntityId?: string;
  title: string;
  unit: "mm" | "°" | "×";
  initialValue: number;
  screenPos: { x: number; y: number };
  targetEntityIds: string[];
  subTarget?: "top" | "bottom" | "sides" | "x" | "y" | "z" | "rx" | "ry" | "rz";
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
    title: "Projetar Geometria na Face (Project)",
    subtitle: "Projete arestas e contornos 3D diretamente no plano de esboço ativo.",
    badge: "PROJECT",
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
  const rawExtrude = p.extrudeHeightMm ?? p.extrudeHeight ?? entity.extrudeHeight;
  const extrudeHeightMm =
    typeof rawExtrude === "number" && Number.isFinite(rawExtrude) && rawExtrude > 0.05
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

  const edgeFilletRadiusMm = Math.max(0, Number(p.edgeFilletRadiusMm) || 0);
  const edgeChamferDistMm = Math.max(0, Number(p.edgeChamferDistMm) || 0);

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

  const colorHex = typeof p.bodyColorHex === "string" ? p.bodyColorHex : "#94A3B8";
  const materialName =
    typeof p.bodyMaterial === "string" ? p.bodyMaterial : "Aço Estrutural ASTM A36";
  const bodyName = typeof p.bodyName === "string" ? p.bodyName : "";

  return {
    extrudeHeightMm,
    elevationZ,
    booleanMode3D,
    edgeFilletRadiusMm,
    edgeChamferDistMm,
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
      extrudeHeightMm: next.extrudeHeightMm,
      extrudeHeight: next.extrudeHeightMm,
      elevationZ: next.elevationZ,
      booleanMode3D: next.booleanMode3D,
      edgeFilletRadiusMm: next.edgeFilletRadiusMm,
      edgeChamferDistMm: next.edgeChamferDistMm,
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
 * Extrai os vértices base de um perfil fechado 2D (antes de fillet/offset 3D).
 */
export function extractBaseClosedLoop2D(
  entity: Entity,
): { points: Vec2[]; isSmoothCircle: boolean; corners: Vec2[] } | null {
  if (entity.isConstruction || entity.layer === "cota" || entity.layer === "referencia") {
    return null;
  }

  if (entity.type === "circle") {
    if (entity.r <= 0.1) return null;
    const segs = 48;
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
    const segs = 48;
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
      corners: pts.filter((_, idx) => idx % 12 === 0),
    };
  }

  if (entity.type === "polyline") {
    if (entity.pts.length < 3) return null;
    const first = entity.pts[0]!;
    const last = entity.pts[entity.pts.length - 1]!;
    const isClosed = entity.closed || Math.hypot(first.x - last.x, first.y - last.y) < 1.5;
    if (!isClosed) return null;

    // Remove ponto final duplicado se existir
    const clean: Vec2[] = [];
    for (const p of entity.pts) {
      const prev = clean[clean.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.05) {
        clean.push({ x: p.x, y: p.y });
      }
    }
    if (
      clean.length > 2 &&
      Math.hypot(
        clean[0]!.x - clean[clean.length - 1]!.x,
        clean[0]!.y - clean[clean.length - 1]!.y,
      ) < 0.05
    ) {
      clean.pop();
    }
    if (clean.length < 3) return null;
    const ccw = ensureCCW(clean);
    return {
      points: ccw,
      isSmoothCircle: clean.length > 24,
      corners: ccw.length <= 16 ? ccw : ccw.filter((_, idx) => idx % Math.ceil(ccw.length / 8) === 0),
    };
  }

  if (entity.type === "hatch" && entity.boundaryPts.length >= 3) {
    const ccw = ensureCCW(entity.boundaryPts);
    return {
      points: ccw,
      isSmoothCircle: ccw.length > 24,
      corners: ccw.slice(0, 8),
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
 * nos vértices de um polígono fechado.
 */
export function applyCornerFilletOrChamferToPolygon2D(
  pts: Vec2[],
  filletRadiusMm: number,
  chamferDistMm: number,
): Vec2[] {
  if ((filletRadiusMm <= 0.05 && chamferDistMm <= 0.05) || pts.length < 3 || pts.length > 24) {
    return pts;
  }

  const ccw = ensureCCW(pts);
  const n = ccw.length;
  const out: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = ccw[(i - 1 + n) % n]!;
    const curr = ccw[i]!;
    const next = ccw[(i + 1) % n]!;

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

    if (chamferDistMm > 0.05) {
      const d = Math.min(chamferDistMm, len1 * 0.45, len2 * 0.45);
      out.push({ x: curr.x + u1x * d, y: curr.y + u1y * d });
      out.push({ x: curr.x + u2x * d, y: curr.y + u2y * d });
    } else if (filletRadiusMm > 0.05) {
      const tanHalf = Math.tan(halfAngle);
      const maxT = Math.min(len1 * 0.46, len2 * 0.46);
      const rEff = Math.min(filletRadiusMm, maxT * tanHalf);
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
      let a1 = Math.atan2(pEnd.y - arcCy, pEnd.x - arcCx);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;

      const arcSegs = 6;
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

  if (holesPts3D.length === 1 && holesPts3D[0]!.length === outerPts3D.length) {
    // Malha de anel perfeita (ex.: parede de tubo Metalon / Shell ou flange com 1 furo concêntrico)
    const innerPts3D = holesPts3D[0]!;
    const n = outerPts3D.length;
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

      // Área dos 2 triângulos
      const area1 = triangleArea3D(o0, o1, i1);
      const area2 = triangleArea3D(o0, i1, i0);
      areaMm2 += area1 + area2;
    }
    return areaMm2;
  }

  // Triangulação fan a partir do centroide (descontando área dos furos)
  const n = outerPts3D.length;
  if (n < 3) return 0;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of outerPts3D) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const center: Vec3Mm = { x: cx, y: cy, z: cz };

  const centerIdx = positions.length / 3;
  positions.push(center.x, center.y, center.z);
  normals.push(normal.x, normal.y, normal.z);

  const ringStart = positions.length / 3;
  for (const p of outerPts3D) {
    positions.push(p.x, p.y, p.z);
    normals.push(normal.x, normal.y, normal.z);
  }

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const p0 = outerPts3D[i]!;
    const p1 = outerPts3D[next]!;
    areaMm2 += triangleArea3D(center, p0, p1);
    if (isTopCap) {
      indices.push(centerIdx, ringStart + i, ringStart + next);
    } else {
      indices.push(centerIdx, ringStart + next, ringStart + i);
    }
  }

  // Subtrai área geométrica dos furos internos para telemetria exata
  for (const hole of holesPts3D) {
    if (hole.length >= 3) {
      const h2d = hole.map((p) => ({ x: p.x, y: p.y }));
      areaMm2 = Math.max(0, areaMm2 - Math.abs(signedArea2D(h2d)));
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

  for (const ent of entities) {
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

    // Verifica se este perfil é um furo/recorte contido em um perfil maior na mesma faixa Z
    let parentGroup: SolidProfileGroup | null = null;
    for (const grp of groups) {
      const sameZ = Math.abs(grp.outer.params3D.elevationZ - cand.params3D.elevationZ) < 1.0;
      const isForceNewBody =
        cand.entity.params?.booleanMode3D === "new_body" ||
        cand.entity.params?.booleanMode3D === "union";
      if (!sameZ || isForceNewBody) continue;

      const samplePt = cand.basePoints[0]!;
      if (
        cand.areaAbs < grp.outer.areaAbs * 0.92 &&
        pointInPolygon2D(samplePt, grp.outer.basePoints)
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
  const edgePolylines: { edgeIndex: number; vertices: number[] }[] = [];

  const bodies: DirectBody3D[] = [];
  const facesById = new Map<string, DirectFace3D>();
  const edgesById = new Map<string, DirectEdge3D>();
  const bodiesById = new Map<string, DirectBody3D>();
  const facesByMeshIndex = new Map<number, DirectFace3D>();
  const edgesByMeshIndex = new Map<number, DirectEdge3D>();

  let globalMeshFaceIdx = 0;
  let globalMeshEdgeIdx = 0;

  groups.forEach((grp, bodyIdx) => {
    const { outer, holes } = grp;
    const p3d = outer.params3D;
    const entId = outer.entity.id;
    const bodyId = `body_${entId}`;

    // 1. Aplica Offset Lateral (`offsetFaceSidesMm`)
    let contour2D =
      Math.abs(p3d.offsetFaceSidesMm) > 0.01
        ? offsetPolygon2D(outer.basePoints, p3d.offsetFaceSidesMm)
        : outer.basePoints;

    // 2. Aplica Fillet 3D (`edgeFilletRadiusMm`) ou Chamfer 3D (`edgeChamferDistMm`) nas arestas verticais
    if (!outer.isSmoothCircle && (p3d.edgeFilletRadiusMm > 0.05 || p3d.edgeChamferDistMm > 0.05)) {
      contour2D = applyCornerFilletOrChamferToPolygon2D(
        contour2D,
        p3d.edgeFilletRadiusMm,
        p3d.edgeChamferDistMm,
      );
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
    const hasShell = p3d.shellThicknessMm > 0.1;
    const openTop = hasShell && p3d.shellOpenCaps.includes("top");
    const openBottom = hasShell && p3d.shellOpenCaps.includes("bottom");

    const holeLoops2D: Vec2[][] = holes.map((h) => ensureCCW(h.basePoints));
    if (hasShell) {
      const maxWall = Math.min(b2d.maxX - b2d.minX, b2d.maxY - b2d.minY) * 0.42;
      const wallT = Math.min(p3d.shellThicknessMm, Math.max(0.5, maxWall));
      const shellInner2D = offsetPolygon2D(contour2D, -wallT);
      holeLoops2D.unshift(shellInner2D);
    }

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

    holeLoops2D.forEach((hLoop, hIdx) => {
      const isShellCavity = hasShell && hIdx === 0;
      const hBottomZBase =
        isShellCavity && !openBottom ? z0 + p3d.shellThicknessMm : z0;
      const hTopZBase =
        isShellCavity && !openTop ? z1 - p3d.shellThicknessMm : z1;

      const hTop: Vec3Mm[] = [];
      const hBot: Vec3Mm[] = [];
      for (const pt of hLoop) {
        const { zBottom, zTop } = evaluateMiterZ(
          pt.x,
          pt.y,
          hBottomZBase,
          hTopZBase,
          b2d,
          p3d.miterCutTopDeg,
          p3d.miterCutTopAxis,
          p3d.miterCutBottomDeg,
          p3d.miterCutBottomAxis,
        );
        hBot.push(transformPt(pt.x, pt.y, zBottom));
        hTop.push(transformPt(pt.x, pt.y, zTop));
      }
      holesBottom3D.push(hBot);
      holesTop3D.push(hTop);
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
        areaMm2: topAreaMm2,
        polygon3D: outerTop3D,
      };
      bodyFaces.push(topFace);
      facesById.set(topFace.faceId, topFace);
      facesByMeshIndex.set(meshFaceIndex, topFace);
    }

    // -------------------------------------------------------------------------
    // FACE 2: BASE INFERIOR (-Z)
    // -------------------------------------------------------------------------
    {
      const startIdx = indices.length;
      const botHoles = openBottom || !hasShell ? holesBottom3D : holesBottom3D.slice(1);
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
        areaMm2: botAreaMm2,
        polygon3D: outerBottom3D,
      };
      bodyFaces.push(botFace);
      facesById.set(botFace.faceId, botFace);
      facesByMeshIndex.set(meshFaceIndex, botFace);
    }

    // -------------------------------------------------------------------------
    // FACES LATERAIS EXTERNAS: Se perfil prismático (<= 12 lados), 1 face por lado;
    // Se perfil curvo/arredondado (> 12 segmentos), agrupa em 4 faces cardeais (N, S, L, O)
    // -------------------------------------------------------------------------
    const nOuter = contour2D.length;
    if (nOuter <= 12) {
      for (let i = 0; i < nOuter; i++) {
        const next = (i + 1) % nOuter;
        const b0 = outerBottom3D[i]!;
        const b1 = outerBottom3D[next]!;
        const t1 = outerTop3D[next]!;
        const t0 = outerTop3D[i]!;

        const p2d0 = contour2D[i]!;
        const p2d1 = contour2D[next]!;
        const dx = p2d1.x - p2d0.x;
        const dy = p2d1.y - p2d0.y;
        const segLen = Math.hypot(dx, dy) || 1;
        const sideNormal = rotateNormal3D({ x: dy / segLen, y: -dx / segLen, z: 0 }, p3d.rotation3D);

        const startIdx = indices.length;
        const baseV = positions.length / 3;
        positions.push(
          b0.x, b0.y, b0.z,
          b1.x, b1.y, b1.z,
          t1.x, t1.y, t1.z,
          t0.x, t0.y, t0.z,
        );
        for (let k = 0; k < 4; k++) {
          normals.push(sideNormal.x, sideNormal.y, sideNormal.z);
        }
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
      // Agrupa segmentos suaves em 4 quadrantes laterais (Direita +X, Topo +Y, Esquerda -X, Base -Y)
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

          const p2d0 = contour2D[i]!;
          const p2d1 = contour2D[next]!;
          const dx = p2d1.x - p2d0.x;
          const dy = p2d1.y - p2d0.y;
          const segLen = Math.hypot(dx, dy) || 1;
          const sideNormal = rotateNormal3D({ x: dy / segLen, y: -dx / segLen, z: 0 }, p3d.rotation3D);

          const baseV = positions.length / 3;
          positions.push(
            b0.x, b0.y, b0.z,
            b1.x, b1.y, b1.z,
            t1.x, t1.y, t1.z,
            t0.x, t0.y, t0.z,
          );
          for (let k = 0; k < 4; k++) {
            normals.push(sideNormal.x, sideNormal.y, sideNormal.z);
          }
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
    // PAREDES INTERNAS DOS FUROS E SHELL (TUBO METALON / CAIXA OCA)
    // -------------------------------------------------------------------------
    holeLoops2D.forEach((hLoop, hIdx) => {
      const hBot3D = holesBottom3D[hIdx]!;
      const hTop3D = holesTop3D[hIdx]!;
      const nh = hLoop.length;
      const startIdx = indices.length;
      let innerArea = 0;

      for (let i = 0; i < nh; i++) {
        const next = (i + 1) % nh;
        const b0 = hBot3D[i]!;
        const b1 = hBot3D[next]!;
        const t1 = hTop3D[next]!;
        const t0 = hTop3D[i]!;

        const p2d0 = hLoop[i]!;
        const p2d1 = hLoop[next]!;
        const dx = p2d1.x - p2d0.x;
        const dy = p2d1.y - p2d0.y;
        const segLen = Math.hypot(dx, dy) || 1;
        // Normal apontando para dentro da cavidade/furo
        const inNormal = rotateNormal3D({ x: -dy / segLen, y: dx / segLen, z: 0 }, p3d.rotation3D);

        const baseV = positions.length / 3;
        positions.push(
          b0.x, b0.y, b0.z,
          t0.x, t0.y, t0.z,
          t1.x, t1.y, t1.z,
          b1.x, b1.y, b1.z,
        );
        for (let k = 0; k < 4; k++) {
          normals.push(inNormal.x, inNormal.y, inNormal.z);
        }
        indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
        innerArea += triangleArea3D(b0, t0, t1) + triangleArea3D(b0, t1, b1);
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
        label: hasShell && hIdx === 0 ? "Parede Interna (Shell / Tubo)" : `Parede do Furo #${hIdx + 1}`,
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
    // ARESTAS TOPOLÓGICAS 3D (QUINAS VERTICAIS, ARESTAS DE TOPO E ARESTAS DE BASE)
    // -------------------------------------------------------------------------
    const cornerPts2D = outer.corners.length >= 3 ? outer.corners : contour2D.slice(0, 8);
    // 1. Arestas verticais (ex.: as 4 quinas verticais de uma coluna)
    cornerPts2D.forEach((cPt, cIdx) => {
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
      });

      const edgeObj: DirectEdge3D = {
        edgeId: `${bodyId}_edge_vert_${cIdx}`,
        meshEdgeIndex,
        bodyId,
        entityId: entId,
        role: "vertical",
        edgeIndex: cIdx,
        label: `Aresta Vertical #${cIdx + 1}`,
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

    // 2. Arestas do Topo e da Base
    if (cornerPts2D.length <= 12 && !outer.isSmoothCircle) {
      const nc = cornerPts2D.length;
      for (let i = 0; i < nc; i++) {
        const a2d = cornerPts2D[i]!;
        const b2dPt = cornerPts2D[(i + 1) % nc]!;

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
      // Contorno circular ou com cantos arredondados: adiciona polilinha fechada do topo e da base
      const topVerts: number[] = [];
      for (const p of outerTop3D) topVerts.push(p.x, p.y, p.z);
      if (outerTop3D[0]) topVerts.push(outerTop3D[0].x, outerTop3D[0].y, outerTop3D[0].z);
      const topMeshIdx = globalMeshEdgeIdx++;
      edgePolylines.push({ edgeIndex: topMeshIdx, vertices: topVerts });

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
      edgePolylines.push({ edgeIndex: botMeshIdx, vertices: botVerts });

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

    // Arestas visuais da cavidade interna (Shell / Furos)
    holesTop3D.forEach((hTop) => {
      const vTop: number[] = [];
      for (const p of hTop) vTop.push(p.x, p.y, p.z);
      if (hTop[0]) vTop.push(hTop[0].x, hTop[0].y, hTop[0].z);
      edgePolylines.push({ edgeIndex: globalMeshEdgeIdx++, vertices: vTop });
    });
    holesBottom3D.forEach((hBot) => {
      const vBot: number[] = [];
      for (const p of hBot) vBot.push(p.x, p.y, p.z);
      if (hBot[0]) vBot.push(hBot[0].x, hBot[0].y, hBot[0].z);
      edgePolylines.push({ edgeIndex: globalMeshEdgeIdx++, vertices: vBot });
    });

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
    const netSectionArea = Math.max(
      1,
      Math.abs(signedArea2D(contour2D)) -
        holeLoops2D.reduce((acc, h) => acc + Math.abs(signedArea2D(h)), 0),
    );
    const volumeMm3 = netSectionArea * Math.max(1, z1 - z0);

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
      extrudeHeightMm: z1 - z0,
      elevationZ: z0,
      edgeFilletRadiusMm: p3d.edgeFilletRadiusMm,
      edgeChamferDistMm: p3d.edgeChamferDistMm,
      shellWallThicknessMm: p3d.shellWallThicknessMm,
      shellThicknessMm: p3d.shellThicknessMm,
      sheetThicknessMm: defaultThicknessMm,
      shellOpenCaps: p3d.shellOpenCaps,
      offsetFaceTopMm: p3d.offsetFaceTopMm,
      offsetFaceBottomMm: p3d.offsetFaceBottomMm,
      offsetFaceSidesMm: p3d.offsetFaceSidesMm,
      miterCutTopDeg: p3d.miterCutTopDeg,
      miterCutTopAxis: p3d.miterCutTopAxis,
      miterCutBottomDeg: p3d.miterCutBottomDeg,
      miterCutBottomAxis: p3d.miterCutBottomAxis,
      rotation3D: p3d.rotation3D,
      pivot3D,
      colorHex: p3d.colorHex,
      materialName: p3d.materialName,
      bbox3D: { minX, maxX, minY, maxY, minZ, maxZ },
      deltaX: Math.max(0, maxX - minX),
      deltaY: Math.max(0, maxY - minY),
      deltaZ: Math.max(0, maxZ - minZ),
      totalAreaMm2,
      volumeMm3,
      faces: bodyFaces,
      edges: bodyEdges,
      snapCandidates,
    };

    bodies.push(bodyObj);
    bodiesById.set(bodyId, bodyObj);
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
      isSeam: false,
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
): {
  kind: "edge" | "face" | "none";
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

  // 1. Prioridade para Arestas (quinas e bordas com tolerância de toque)
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
          if (!bestEdge || dPx < bestEdge.distPx - 2 || (Math.abs(dPx - bestEdge.distPx) <= 2 && depthZ > bestEdge.depthZ)) {
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

  // 2. Hit-test nas Faces 3D (ordenadas pela face voltada para a câmera / maior Z projetado)
  const azRad = (orbitProjection.azimuthDeg * Math.PI) / 180;
  const elRad = (orbitProjection.elevationDeg * Math.PI) / 180;
  const camDir: Vec3Mm = {
    x: Math.sin(azRad) * Math.cos(elRad),
    y: Math.cos(azRad) * Math.cos(elRad),
    z: Math.sin(elRad),
  };

  let bestFace: { face: DirectFace3D; score: number } | null = null;
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
        if (!bestFace || depthScore > bestFace.score) {
          bestFace = { face, score: depthScore };
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

export function applyDirectFilletOrChamfer3DToEntities(
  entities: Entity[],
  targetIds: string[],
  mode: "fillet" | "chamfer",
  valueMm: number,
): Entity[] {
  const clamped = Math.max(0, Number(valueMm.toFixed(2)));
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        edgeFilletRadiusMm: mode === "fillet" ? clamped : 0,
        edgeChamferDistMm: mode === "chamfer" ? clamped : 0,
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
  faceTarget: "top" | "bottom" | "sides",
  deltaMm: number,
): Entity[] {
  const rounded = Number(deltaMm.toFixed(2));
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    const cur = getEntityDirect3DParams(e);
    if (faceTarget === "top") {
      const nextHeight = Math.max(1, cur.extrudeHeightMm + rounded);
      return {
        ...e,
        params: {
          ...(e.params ?? {}),
          extrudeHeightMm: Number(nextHeight.toFixed(2)),
          offsetFaceTopMm: 0,
        },
      };
    }
    if (faceTarget === "bottom") {
      const nextElev = cur.elevationZ - rounded;
      const nextHeight = Math.max(1, cur.extrudeHeightMm + rounded);
      return {
        ...e,
        params: {
          ...(e.params ?? {}),
          elevationZ: Number(nextElev.toFixed(2)),
          extrudeHeightMm: Number(nextHeight.toFixed(2)),
          offsetFaceBottomMm: 0,
        },
      };
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
    const moved = Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4 ? translate(ent, dx, dy) : { ...ent };
    const cur = getEntityDirect3DParams(ent);
    const nextZ = Number((cur.elevationZ + dz).toFixed(2));
    const nextRot = {
      rxDeg: Number((cur.rotation3D.rxDeg + rxDeg).toFixed(1)),
      ryDeg: Number((cur.rotation3D.ryDeg + ryDeg).toFixed(1)),
      rzDeg: Number((cur.rotation3D.rzDeg + rzDeg).toFixed(1)),
    };
    return {
      ...moved,
      id: assignNewId ? uid() : ent.id,
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

export function applyDirectMirror3DToEntities(
  entities: Entity[],
  targetIds: string[],
  plane: "x" | "y" | "z",
  copyMode = true,
): { updatedEntities: Entity[]; activeIds: string[] } {
  const targets = entities.filter((e) => targetIds.includes(e.id));
  if (targets.length === 0) return { updatedEntities: entities, activeIds: targetIds };

  const b = bbox(targets);
  if (!b) return { updatedEntities: entities, activeIds: targetIds };
  const spanX = Math.max(50, b.maxX - b.minX);
  const spanY = Math.max(50, b.maxY - b.minY);

  if (plane === "x") {
    return applyDirectTransform3DToEntities(entities, targetIds, { dx: spanX + 40 }, copyMode);
  }
  if (plane === "y") {
    return applyDirectTransform3DToEntities(entities, targetIds, { dy: spanY + 40 }, copyMode);
  }
  return applyDirectTransform3DToEntities(entities, targetIds, { dz: 100 }, copyMode);
}
