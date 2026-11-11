/**
 * CALDRA — CHAMFER CAD 3D
 * MOTOR UNIFICADO:
 *  1. Gerenciador de Contexto de Interação "FLUX" (4 Níveis Anti-Colisão + HUD Consolidado)
 *  2. Referenciais Geométricos WCS / OCS / UCS com Matriz 4×4 e Reindexação Global em Tempo Real
 *  3. Snap Magnético de Superfície Base (Z = 0.00 mm) com Histerese, 4 Classificações e Ecolocalização Azul
 *  4. Multi-Seleção Inteligente de Corpos, 5 Modos de Pivô, Montagem Lógica (Group) vs. União Booleana e Inspetor Misto
 */

import { translate, uid, type Entity, type Vec2 } from "./core";
import type {
  DirectBody3D,
  DirectFace3D,
  DirectTopology3DScene,
  ShellOpenCap3D,
  Vec3Mm,
} from "./cadDirectModeling3D";

// ============================================================================
// 1. GERENCIADOR DE CONTEXTO DE INTERAÇÃO "FLUX" (ANTI-COLISÃO & HIERARQUIA)
// ============================================================================

export type FluxActiveDragKind3D =
  | "none"
  | "linear_x"
  | "linear_y"
  | "linear_z"
  | "planar_xy"
  | "face_offset"
  | "rotate_x"
  | "rotate_y"
  | "rotate_z"
  | "miter_angle"
  | "edge_fillet_chamfer"
  | "vertex_bevel"
  | "pivot_drag";

export interface FluxViewportVisibilityInput3D {
  activeAxis: string | null;
  directTool: string;
  selectionKind3D: "none" | "vertex" | "face" | "edge" | "body" | "hinge";
  hasActiveSnap: boolean;
  snapSummaryLabel?: string | null;
  clearanceGapMm?: number | null;
  copyMode: boolean;
  dragDeltaValue: number;
  elevationZMm?: number;
  selectedBodyCount: number;
  gizmoOriginScreen?: Vec2 | null;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface FluxConsolidatedHudState3D {
  visible: boolean;
  /** Offset vertical seguro (mínimo 44px acima do gizmo, longe do dedo) */
  screenX: number;
  screenY: number;
  /** Linha 1 (Principal): ex. "ΔY: +369.0 mm ✎  |  Vão Livre: 242.0 mm" ou "∠ +45.0° ✎" */
  primaryLine: string;
  /** Linha 2 (Condicional Nível 2): ex. "🎯 BASE · FACE (Z = 0.00 mm)" */
  secondarySnapLine: string | null;
  accentTone: "cyan" | "emerald" | "amber";
}

export interface FluxViewportVisibilityState3D {
  dragKind: FluxActiveDragKind3D;
  isManipulating: boolean;
  // Nível 1 — Interação Ativa
  showAxisX: boolean;
  showAxisY: boolean;
  showAxisZ: boolean;
  showPlanarXY: boolean;
  showRotationHandles: boolean;
  showPivotHandle: boolean;
  // Nível 2 — Feedback Geométrico Relevante
  showAlignmentGuides: boolean;
  showBaseSnapHighlight: boolean;
  // Nível 3 — Informações Secundárias (ocultas durante o arraste, retorno suave 150ms)
  showBottomTelemetryBar: boolean;
  showBottomLeftAxesGizmo: boolean;
  showFloatingCanvasMirrorPill: boolean;
  // Nível 4 — Dicas Auxiliares
  showAuxiliaryHints: boolean;
  // HUD Consolidado Único (máx. 1 bloco acoplado flex-col gap-1)
  consolidatedHud: FluxConsolidatedHudState3D;
}

export const FLUX_SAFE_VERTICAL_OFFSET_PX = 48;
export const FLUX_RESTORE_TRANSITION_MS = 150;

export function classifyFluxDragKind3D(activeAxis: string | null): FluxActiveDragKind3D {
  switch (activeAxis) {
    case "x":
      return "linear_x";
    case "y":
      return "linear_y";
    case "z":
      return "linear_z";
    case "planar":
      return "planar_xy";
    case "extrude":
    case "face_normal":
      return "face_offset";
    case "rot_x":
      return "rotate_x";
    case "rot_y":
      return "rotate_y";
    case "rot_z":
      return "rotate_z";
    case "miter":
      return "miter_angle";
    case "edge_diagonal":
      return "edge_fillet_chamfer";
    case "vertex_bevel":
      return "vertex_bevel";
    case "pivot":
      return "pivot_drag";
    default:
      return "none";
  }
}

export function resolveFluxViewportVisibility3D(
  input: FluxViewportVisibilityInput3D,
): FluxViewportVisibilityState3D {
  const dragKind = classifyFluxDragKind3D(input.activeAxis);
  const isManipulating = dragKind !== "none";

  const isLinearAxisDrag =
    dragKind === "linear_x" || dragKind === "linear_y" || dragKind === "linear_z";
  const isPlanarDrag = dragKind === "planar_xy";
  const isRotationDrag =
    dragKind === "rotate_x" || dragKind === "rotate_y" || dragKind === "rotate_z";
  const isBodyGizmoEligible =
    input.selectionKind3D === "body" &&
    input.directTool !== "shell_3d" &&
    input.directTool !== "array_3d";

  // Regra Nível 1 vs Nível 3:
  // Durante arraste linear em X/Y/Z, oculta os outros 2 eixos inativos e oculta a roda de giro!
  // Durante rotação, oculta as 3 setas lineares!
  const showAxisX =
    isBodyGizmoEligible &&
    (!isManipulating || dragKind === "linear_x" || dragKind === "planar_xy" || dragKind === "pivot_drag");
  const showAxisY =
    isBodyGizmoEligible &&
    (!isManipulating || dragKind === "linear_y" || dragKind === "planar_xy" || dragKind === "pivot_drag");
  const showAxisZ =
    isBodyGizmoEligible &&
    (!isManipulating || dragKind === "linear_z" || dragKind === "pivot_drag");
  const showPlanarXY =
    isBodyGizmoEligible && (!isManipulating || isPlanarDrag);
  const showRotationHandles =
    isBodyGizmoEligible && (!isManipulating || isRotationDrag);
  const showPivotHandle =
    isBodyGizmoEligible && (!isManipulating || isRotationDrag || dragKind === "pivot_drag");

  // Posição segura do HUD Consolidado (mínimo 44px acima da origem do gizmo, com clamping na viewport)
  const vpW = Math.max(280, input.viewportWidth ?? 800);
  const vpH = Math.max(240, input.viewportHeight ?? 600);
  const rawOriginX = input.gizmoOriginScreen?.x ?? vpW * 0.5;
  const rawOriginY = input.gizmoOriginScreen?.y ?? vpH * 0.5;
  const clampedX = Math.max(128, Math.min(vpW - 128, rawOriginX));
  const preferredAboveY = rawOriginY - FLUX_SAFE_VERTICAL_OFFSET_PX - 18;
  const clampedY =
    preferredAboveY >= 62
      ? preferredAboveY
      : Math.min(vpH - 68, rawOriginY + FLUX_SAFE_VERTICAL_OFFSET_PX + 16);

  // Construção da Linha 1 e Linha 2 do HUD Consolidado
  let primaryLine = "";
  let accentTone: "cyan" | "emerald" | "amber" = input.copyMode ? "emerald" : "cyan";

  const copyPrefix = input.copyMode ? "⧉ " : "";
  const formattedClearance =
    typeof input.clearanceGapMm === "number" && Number.isFinite(input.clearanceGapMm)
      ? `  |  Vão Livre: ${input.clearanceGapMm.toFixed(1)} mm`
      : "";

  if (isLinearAxisDrag) {
    const axName =
      dragKind === "linear_x" ? "X" : dragKind === "linear_y" ? "Y" : "Z";
    if (dragKind === "linear_z") {
      accentTone = "amber";
    }
    const signedVal =
      input.dragDeltaValue >= 0
        ? `+${input.dragDeltaValue.toFixed(1)}`
        : input.dragDeltaValue.toFixed(1);
    primaryLine = `${copyPrefix}Δ${axName}: ${signedVal} mm ✎${formattedClearance}`;
  } else if (isPlanarDrag) {
    primaryLine = `${copyPrefix}ΔXY: ${input.dragDeltaValue.toFixed(1)} mm ✎${formattedClearance}`;
  } else if (dragKind === "face_offset") {
    const signedVal =
      input.dragDeltaValue >= 0
        ? `+${input.dragDeltaValue.toFixed(1)}`
        : input.dragDeltaValue.toFixed(1);
    primaryLine = `ΔFace: ${signedVal} mm ✎${formattedClearance}`;
  } else if (isRotationDrag || dragKind === "miter_angle") {
    accentTone = "amber";
    const signedDeg =
      input.dragDeltaValue > 0
        ? `+${input.dragDeltaValue.toFixed(1)}`
        : input.dragDeltaValue.toFixed(1);
    primaryLine = `${copyPrefix}∠ ${signedDeg}° ✎`;
  } else if (dragKind === "pivot_drag") {
    accentTone = "amber";
    primaryLine = input.snapSummaryLabel || "Pivô Personalizado (Arraste)";
  }

  const secondarySnapLine =
    isManipulating &&
    !isRotationDrag &&
    dragKind !== "pivot_drag" &&
    input.hasActiveSnap &&
    input.snapSummaryLabel
      ? input.snapSummaryLabel
      : null;

  return {
    dragKind,
    isManipulating,
    showAxisX,
    showAxisY,
    showAxisZ,
    showPlanarXY,
    showRotationHandles,
    showPivotHandle,
    showAlignmentGuides: isManipulating && !isRotationDrag && input.hasActiveSnap,
    showBaseSnapHighlight: isManipulating && input.hasActiveSnap,
    // Nível 3 oculto automaticamente durante arraste ativo!
    showBottomTelemetryBar: !isManipulating,
    showBottomLeftAxesGizmo: !isManipulating,
    // Pílula solta "Espelhar" no meio do canvas eliminada permanentemente (integrada à barra)
    showFloatingCanvasMirrorPill: false,
    // Nível 4 desaparece ao iniciar qualquer operação
    showAuxiliaryHints: !isManipulating && input.directTool === "select_3d",
    consolidatedHud: {
      visible: isManipulating && primaryLine.length > 0,
      screenX: Math.round(clampedX),
      screenY: Math.round(clampedY),
      primaryLine,
      secondarySnapLine,
      accentTone,
    },
  };
}

// ============================================================================
// 2. SISTEMAS DE REFERÊNCIA (WCS / OCS / UCS) & MATRIZ 4×4 DE NORMAIS REAIS
// ============================================================================

export type CoordinateReferenceFrame3D = "wcs" | "ocs" | "ucs";

export type LocalSemanticFaceRole3D =
  | "TOP_LOCAL"
  | "BOTTOM_LOCAL"
  | "FRONT_LOCAL"
  | "BACK_LOCAL"
  | "LEFT_LOCAL"
  | "RIGHT_LOCAL"
  | "INNER_LOCAL"
  | "MITER_LOCAL";

export type GlobalSpatialDirection3D =
  | "+Z"
  | "-Z"
  | "+X"
  | "-X"
  | "+Y"
  | "-Y"
  | "INCLINED";

export interface GlobalDirectionClassification3D {
  direction: GlobalSpatialDirection3D;
  /** Ângulo em graus em relação ao eixo global mais próximo (0° quando perfeitamente alinhada) */
  tiltAngleDeg: number;
  /** Ângulo em relação ao plano horizontal XY (+Z) para superfícies inclinadas */
  slopeFromTopDeg: number;
  labelPt: string;
}

/** Matriz 4×4 em ordem row-major (16 números: m[row * 4 + col]) */
export type Matrix4x4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export const GLOBAL_DIRECTION_TOLERANCE_DEG = 1.5;

export function normalizeVec3(v: Vec3Mm): Vec3Mm {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function dotVec3(a: Vec3Mm, b: Vec3Mm): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Constrói a matriz homogênea 4×4 M (OCS -> WCS) idêntica à ordem intrínseca
 * Rx -> Ry -> Rz em torno de `pivot3D` usada pelo motor geométrico do CHAMFER 3D.
 */
export function buildBodyTransformMatrix4x4(
  pivot3D: Vec3Mm,
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number },
  translation3D: Vec3Mm = { x: 0, y: 0, z: 0 },
  scale3D: Vec3Mm = { x: 1, y: 1, z: 1 },
): Matrix4x4 {
  const rx = ((rotation3D.rxDeg || 0) * Math.PI) / 180;
  const ry = ((rotation3D.ryDeg || 0) * Math.PI) / 180;
  const rz = ((rotation3D.rzDeg || 0) * Math.PI) / 180;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  // Composição R = Rz * Ry * Rx (pois no motor: primeiro aplica Rx, depois Ry, depois Rz)
  const r00 = cz * cy * scale3D.x;
  const r01 = (cz * sy * sx - sz * cx) * scale3D.y;
  const r02 = (cz * sy * cx + sz * sx) * scale3D.z;

  const r10 = sz * cy * scale3D.x;
  const r11 = (sz * sy * sx + cz * cx) * scale3D.y;
  const r12 = (sz * sy * cx - cz * sx) * scale3D.z;

  const r20 = -sy * scale3D.x;
  const r21 = cy * sx * scale3D.y;
  const r22 = cy * cx * scale3D.z;

  // p' = R * (p - pivot) + pivot + translation = R * p + (pivot + translation - R * pivot)
  const tx =
    pivot3D.x +
    translation3D.x -
    (r00 * pivot3D.x + r01 * pivot3D.y + r02 * pivot3D.z);
  const ty =
    pivot3D.y +
    translation3D.y -
    (r10 * pivot3D.x + r11 * pivot3D.y + r12 * pivot3D.z);
  const tz =
    pivot3D.z +
    translation3D.z -
    (r20 * pivot3D.x + r21 * pivot3D.y + r22 * pivot3D.z);

  return [
    r00, r01, r02, tx,
    r10, r11, r12, ty,
    r20, r21, r22, tz,
    0, 0, 0, 1,
  ];
}

export function transformPointByMatrix4x4(pt: Vec3Mm, m: Matrix4x4): Vec3Mm {
  return {
    x: m[0] * pt.x + m[1] * pt.y + m[2] * pt.z + m[3],
    y: m[4] * pt.x + m[5] * pt.y + m[6] * pt.z + m[7],
    z: m[8] * pt.x + m[9] * pt.y + m[10] * pt.z + m[11],
  };
}

/**
 * Calcula n_global = normalize((M^-1)^T * n_local) usando a submatriz linear 3×3
 * invertida e transposta (suporta rotações arbitrárias e escalas não-uniformes!).
 */
export function transformLocalNormalToGlobalWCS(
  localNormal: Vec3Mm,
  m: Matrix4x4,
): Vec3Mm {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  // Cofatores da 3×3 (que já correspondem a det(A) * (A^-1)^T !)
  const c00 = a11 * a22 - a12 * a21;
  const c01 = -(a10 * a22 - a12 * a20);
  const c02 = a10 * a21 - a11 * a20;

  const c10 = -(a01 * a22 - a02 * a21);
  const c11 = a00 * a22 - a02 * a20;
  const c12 = -(a00 * a21 - a01 * a20);

  const c20 = a01 * a12 - a02 * a11;
  const c21 = -(a00 * a12 - a02 * a10);
  const c22 = a00 * a11 - a01 * a10;

  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (Math.abs(det) < 1e-10) {
    return normalizeVec3(localNormal);
  }
  const invDet = 1 / det;
  const gx = (c00 * localNormal.x + c01 * localNormal.y + c02 * localNormal.z) * invDet;
  const gy = (c10 * localNormal.x + c11 * localNormal.y + c12 * localNormal.z) * invDet;
  const gz = (c20 * localNormal.x + c21 * localNormal.y + c22 * localNormal.z) * invDet;

  return normalizeVec3({ x: gx, y: gy, z: gz });
}

/**
 * Transforma um vetor direcional do mundo (WCS) de volta para o espaço intrínseco da peça (OCS):
 * d_local = R^T * d_global. Essencial para descobrir qual face/eixo local aponta atualmente para +Z, +Y, etc.!
 */
export function transformGlobalVectorToLocalOCS(
  globalVec: Vec3Mm,
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number },
): Vec3Mm {
  const m = buildBodyTransformMatrix4x4({ x: 0, y: 0, z: 0 }, rotation3D);
  // Para matriz ortogonal de rotação pura, R^-1 = R^T
  const lx = m[0] * globalVec.x + m[4] * globalVec.y + m[8] * globalVec.z;
  const ly = m[1] * globalVec.x + m[5] * globalVec.y + m[9] * globalVec.z;
  const lz = m[2] * globalVec.x + m[6] * globalVec.y + m[10] * globalVec.z;
  return normalizeVec3({ x: lx, y: ly, z: lz });
}

/**
 * Extrai os 3 eixos ortonormais do OCS da peça expressos no WCS (para o Gizmo em modo `📦 Local`).
 */
export function getBodyLocalAxesInWCS(rotation3D: {
  rxDeg: number;
  ryDeg: number;
  rzDeg: number;
}): { axisX: Vec3Mm; axisY: Vec3Mm; axisZ: Vec3Mm } {
  const m = buildBodyTransformMatrix4x4({ x: 0, y: 0, z: 0 }, rotation3D);
  return {
    axisX: normalizeVec3({ x: m[0], y: m[4], z: m[8] }),
    axisY: normalizeVec3({ x: m[1], y: m[5], z: m[9] }),
    axisZ: normalizeVec3({ x: m[2], y: m[6], z: m[10] }),
  };
}

/**
 * Classifica a direção espacial global (WCS) de uma face a partir de n_global
 * com tolerância estrita de 1.5° (cos(1.5°) ≈ 0.9996573).
 */
export function classifyGlobalSpatialDirection3D(
  globalNormal: Vec3Mm,
  toleranceDeg = GLOBAL_DIRECTION_TOLERANCE_DEG,
): GlobalDirectionClassification3D {
  const n = normalizeVec3(globalNormal);
  const cosTol = Math.cos((toleranceDeg * Math.PI) / 180);

  const candidates: Array<{
    dir: Exclude<GlobalSpatialDirection3D, "INCLINED">;
    vec: Vec3Mm;
    labelPt: string;
  }> = [
    { dir: "+Z", vec: { x: 0, y: 0, z: 1 }, labelPt: "+Z (Topo Global)" },
    { dir: "-Z", vec: { x: 0, y: 0, z: -1 }, labelPt: "-Z (Base Global)" },
    { dir: "+X", vec: { x: 1, y: 0, z: 0 }, labelPt: "+X (Direita Global)" },
    { dir: "-X", vec: { x: -1, y: 0, z: 0 }, labelPt: "-X (Esquerda Global)" },
    { dir: "+Y", vec: { x: 0, y: 1, z: 0 }, labelPt: "+Y (Frente Global)" },
    { dir: "-Y", vec: { x: 0, y: -1, z: 0 }, labelPt: "-Y (Trás Global)" },
  ];

  let best = candidates[0]!;
  let bestDot = -2;
  for (const c of candidates) {
    const d = dotVec3(n, c.vec);
    if (d > bestDot) {
      bestDot = d;
      best = c;
    }
  }

  const clampedBestDot = Math.max(-1, Math.min(1, bestDot));
  const angleFromBestDeg = Number(((Math.acos(clampedBestDot) * 180) / Math.PI).toFixed(1));
  const clampedZDot = Math.max(-1, Math.min(1, n.z));
  const slopeFromTopDeg = Number(((Math.acos(Math.abs(clampedZDot)) * 180) / Math.PI).toFixed(1));

  if (clampedBestDot >= cosTol) {
    return {
      direction: best.dir,
      tiltAngleDeg: angleFromBestDeg,
      slopeFromTopDeg,
      labelPt: best.labelPt,
    };
  }

  return {
    direction: "INCLINED",
    tiltAngleDeg: slopeFromTopDeg > 0.1 ? slopeFromTopDeg : angleFromBestDeg,
    slopeFromTopDeg,
    labelPt: `INCLINADA (∠ ${(slopeFromTopDeg > 0.1 ? slopeFromTopDeg : angleFromBestDeg).toFixed(1)}°)`,
  };
}

export function classifyLocalSemanticFaceRole3D(
  role: DirectFace3D["role"],
  localNormal: Vec3Mm,
): LocalSemanticFaceRole3D {
  if (role === "inner_side") return "INNER_LOCAL";
  if (role === "top") return "TOP_LOCAL";
  if (role === "bottom") return "BOTTOM_LOCAL";
  if (role === "miter") {
    if (Math.abs(localNormal.z) > 0.85) {
      return localNormal.z >= 0 ? "TOP_LOCAL" : "BOTTOM_LOCAL";
    }
    return "MITER_LOCAL";
  }
  const n = normalizeVec3(localNormal);
  if (Math.abs(n.z) >= Math.abs(n.x) && Math.abs(n.z) >= Math.abs(n.y)) {
    return n.z >= 0 ? "TOP_LOCAL" : "BOTTOM_LOCAL";
  }
  if (Math.abs(n.x) >= Math.abs(n.y)) {
    return n.x >= 0 ? "RIGHT_LOCAL" : "LEFT_LOCAL";
  }
  return n.y >= 0 ? "FRONT_LOCAL" : "BACK_LOCAL";
}

export function formatLocalRolePtLabel(localRole: LocalSemanticFaceRole3D): string {
  switch (localRole) {
    case "TOP_LOCAL":
      return "TOPO LOCAL";
    case "BOTTOM_LOCAL":
      return "BASE LOCAL";
    case "FRONT_LOCAL":
      return "FRENTE LOCAL";
    case "BACK_LOCAL":
      return "TRÁS LOCAL";
    case "LEFT_LOCAL":
      return "ESQ. LOCAL";
    case "RIGHT_LOCAL":
      return "DIR. LOCAL";
    case "INNER_LOCAL":
      return "PAREDE INTERNA";
    case "MITER_LOCAL":
      return "ESQUADRIA LOCAL";
  }
}

/**
 * Formata a etiqueta dupla exigida no Inspetor e HUD de Seleção:
 * Ex.: "FACE F1 · TOPO LOCAL · ORIENTAÇÃO GLOBAL +Y"
 *      "FACE F3 · DIR. LOCAL · INCLINADA (∠ 45.0°)"
 */
export function formatFaceDualOrientationHud3D(
  faceIndex1Based: number,
  localRole: LocalSemanticFaceRole3D,
  globalClass: GlobalDirectionClassification3D,
): string {
  const fCode = `FACE F${Math.max(1, faceIndex1Based)}`;
  const localTxt = formatLocalRolePtLabel(localRole);
  const globalTxt =
    globalClass.direction === "INCLINED"
      ? globalClass.labelPt
      : `ORIENTAÇÃO GLOBAL ${globalClass.direction}`;
  return `${fCode} · ${localTxt} · ${globalTxt}`;
}

export interface BodyOBBAndAABB3D {
  obbCenterLocal: Vec3Mm;
  obbHalfExtentsLocal: Vec3Mm;
  obbCornersWCS: Vec3Mm[];
  aabbWCS: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export function computeBodyOBBAndAABB3D(
  localBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  },
  matrix4x4: Matrix4x4,
): BodyOBBAndAABB3D {
  const obbCenterLocal: Vec3Mm = {
    x: (localBounds.minX + localBounds.maxX) * 0.5,
    y: (localBounds.minY + localBounds.maxY) * 0.5,
    z: (localBounds.minZ + localBounds.maxZ) * 0.5,
  };
  const obbHalfExtentsLocal: Vec3Mm = {
    x: Math.max(0, (localBounds.maxX - localBounds.minX) * 0.5),
    y: Math.max(0, (localBounds.maxY - localBounds.minY) * 0.5),
    z: Math.max(0, (localBounds.maxZ - localBounds.minZ) * 0.5),
  };

  const xs = [localBounds.minX, localBounds.maxX];
  const ys = [localBounds.minY, localBounds.maxY];
  const zs = [localBounds.minZ, localBounds.maxZ];
  const obbCornersWCS: Vec3Mm[] = [];

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const wPt = transformPointByMatrix4x4({ x, y, z }, matrix4x4);
        obbCornersWCS.push(wPt);
        if (wPt.x < minX) minX = wPt.x;
        if (wPt.x > maxX) maxX = wPt.x;
        if (wPt.y < minY) minY = wPt.y;
        if (wPt.y > maxY) maxY = wPt.y;
        if (wPt.z < minZ) minZ = wPt.z;
        if (wPt.z > maxZ) maxZ = wPt.z;
      }
    }
  }

  return {
    obbCenterLocal,
    obbHalfExtentsLocal,
    obbCornersWCS,
    aabbWCS: { minX, maxX, minY, maxY, minZ, maxZ },
  };
}

export function directionSlotToGlobalVector3D(
  slot: "top" | "bottom" | "pos_x" | "neg_x" | "pos_y" | "neg_y" | ShellOpenCap3D,
): { dir: Exclude<GlobalSpatialDirection3D, "INCLINED">; vec: Vec3Mm } {
  switch (slot) {
    case "top":
      return { dir: "+Z", vec: { x: 0, y: 0, z: 1 } };
    case "bottom":
      return { dir: "-Z", vec: { x: 0, y: 0, z: -1 } };
    case "pos_x":
    case "right":
      return { dir: "+X", vec: { x: 1, y: 0, z: 0 } };
    case "neg_x":
    case "left":
      return { dir: "-X", vec: { x: -1, y: 0, z: 0 } };
    case "pos_y":
    case "front":
      return { dir: "+Y", vec: { x: 0, y: 1, z: 0 } };
    case "neg_y":
    case "back":
      return { dir: "-Y", vec: { x: 0, y: -1, z: 0 } };
  }
}

/**
 * Busca dinamicamente a face externa do corpo que aponta para a direção global solicitada (`+Z`, `-Z`, `+X`, `-X`, `+Y`, `-Y`)
 * ou para o papel local intrínseco quando em modo `OCS` (`📦 Local`).
 */
export function findBodyFaceByReferenceFrame3D(
  body: DirectBody3D,
  slot: "top" | "bottom" | "pos_x" | "neg_x" | "pos_y" | "neg_y" | ShellOpenCap3D,
  frame: CoordinateReferenceFrame3D = "wcs",
): DirectFace3D | null {
  const outerFaces = body.faces.filter((f) => f.role !== "inner_side");
  if (outerFaces.length === 0) return null;

  if (frame === "ocs") {
    const desiredLocal: LocalSemanticFaceRole3D =
      slot === "top"
        ? "TOP_LOCAL"
        : slot === "bottom"
          ? "BOTTOM_LOCAL"
          : slot === "pos_x" || slot === "right"
            ? "RIGHT_LOCAL"
            : slot === "neg_x" || slot === "left"
              ? "LEFT_LOCAL"
              : slot === "pos_y" || slot === "front"
                ? "FRONT_LOCAL"
                : "BACK_LOCAL";
    const exactLocal = outerFaces.find((f) => f.localRole === desiredLocal);
    if (exactLocal) return exactLocal;
  }

  const { dir, vec } = directionSlotToGlobalVector3D(slot);
  // Primeiro procura correspondência exata com `globalDirection` (maior área desempata chanfros pequenos)
  const exactMatches = outerFaces
    .filter((f) => f.globalDirection === dir)
    .sort((a, b) => b.areaMm2 - a.areaMm2);
  if (exactMatches.length > 0) {
    return exactMatches[0]!;
  }

  // Fallback contínuo para peças inclinadas: escolhe a face externa com maior produto escalar na direção global pedida
  let bestFace: DirectFace3D | null = null;
  let bestScore = -Infinity;
  for (const f of outerFaces) {
    const gn = f.globalNormal ?? f.normal;
    const score = dotVec3(gn, vec);
    if (score > bestScore) {
      bestScore = score;
      bestFace = f;
    }
  }
  return bestFace;
}

/**
 * Mapeia um comando direcional global (`Topo +Z`, `Base -Z`, `Face +X/-X/+Y/-Y`) para o alvo local
 * real da entidade rotacionada (`top`, `bottom`, ou vetor normal 2D local `side_normal`), permitindo
 * que `Offset Face` e `Shell` operem no eixo global correto mesmo após girar o sólido em 90°!
 */
export function mapDirectionalSlotToEntityLocalTarget3D(
  slot: "top" | "bottom" | "pos_x" | "neg_x" | "pos_y" | "neg_y",
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number },
  frame: CoordinateReferenceFrame3D,
): {
  localTarget: "top" | "bottom" | "pos_x" | "neg_x" | "pos_y" | "neg_y" | "side_normal";
  localNormal: Vec3Mm;
  localShellCap: ShellOpenCap3D;
} {
  const { vec: globalVec } = directionSlotToGlobalVector3D(slot);
  if (frame === "ocs") {
    const capMap: Record<typeof slot, ShellOpenCap3D> = {
      top: "top",
      bottom: "bottom",
      pos_x: "right",
      neg_x: "left",
      pos_y: "front",
      neg_y: "back",
    };
    return {
      localTarget: slot,
      localNormal: globalVec,
      localShellCap: capMap[slot],
    };
  }

  const localVec = transformGlobalVectorToLocalOCS(globalVec, rotation3D);
  const ax = Math.abs(localVec.x);
  const ay = Math.abs(localVec.y);
  const az = Math.abs(localVec.z);

  if (az >= ax && az >= ay && az > 0.7) {
    return localVec.z >= 0
      ? { localTarget: "top", localNormal: { x: 0, y: 0, z: 1 }, localShellCap: "top" }
      : { localTarget: "bottom", localNormal: { x: 0, y: 0, z: -1 }, localShellCap: "bottom" };
  }
  if (ax >= ay) {
    return localVec.x >= 0
      ? { localTarget: "side_normal", localNormal: { x: 1, y: 0, z: 0 }, localShellCap: "right" }
      : { localTarget: "side_normal", localNormal: { x: -1, y: 0, z: 0 }, localShellCap: "left" };
  }
  return localVec.y >= 0
    ? { localTarget: "side_normal", localNormal: { x: 0, y: 1, z: 0 }, localShellCap: "front" }
    : { localTarget: "side_normal", localNormal: { x: 0, y: -1, z: 0 }, localShellCap: "back" };
}

// ============================================================================
// 3. SNAP DE SUPERFÍCIE BASE (Z = 0.00 mm) & ECOLOCALIZAÇÃO AZUL (ONDA DE CONTATO)
// ============================================================================

export const BASE_SNAP_TIN_MM = 3.5;
export const BASE_SNAP_TOUT_MM = 5.5;
export const BASE_CONTACT_TOLERANCE_MM = 0.08;

export type BaseContactKind3D =
  | "BASE_FACE"
  | "BASE_EDGE"
  | "BASE_VERTEX"
  | "BASE_CURVED"
  | "NONE";

export interface BaseSurfaceSnapEvaluation3D {
  snapped: boolean;
  latched: boolean;
  /** Cota Z mínima bruta antes do snap */
  rawMinZMm: number;
  /** Cota Z mínima efetiva após o snap (exato `basePlaneZ` quando em snap) */
  effectiveMinZMm: number;
  /** Delta Z total ajustado pelo snap magnético */
  snappedDeltaZMm: number;
  /** Correção aplicada ao delta Z bruto (`snappedDeltaZMm - candidateDeltaZMm`) */
  snapCorrectionZMm: number;
  contactKind: BaseContactKind3D;
  /** Rótulo técnico exibido no HUD Nível 2 */
  hudBadgeLabel: string;
  /** Ponto central de contato projetado na superfície base (Xc, Yc, Z_base) */
  contactPoint3D: Vec3Mm;
  /** Raio horizontal característico da peça/conjunto para escalar as 3 ondas de ecolocalização */
  pieceHorizontalRadiusMm: number;
  /** Pontos de contato na base usados para destaque técnico */
  contactPoints3D: Vec3Mm[];
}

export interface BaseEcholocationPulse3D {
  pulseId: number;
  triggeredAtMs: number;
  contactPoint3D: Vec3Mm;
  pieceHorizontalRadiusMm: number;
  contactKind: BaseContactKind3D;
  /** Parâmetros visuais calibrados (Seção 4.2) */
  colorPrimaryHex: "#38BDF8";
  colorCoreHex: "#0EA5E9";
  ringCount: 3;
  durationMs: 520;
  staggerMs: 90;
  scaleStartFactor: 0.15;
  scaleEndFactor: 2.2;
  maxOpacity: 0.85;
}

export interface BaseEcholocationState3D {
  isInBaseContact: boolean;
  /** Só rearma quando a peça sobe acima da zona de histerese (`rawMinZ > basePlaneZ + T_out`) */
  armed: boolean;
  pulseCounter: number;
  activePulse: BaseEcholocationPulse3D | null;
}

export function createInitialBaseEcholocationState3D(): BaseEcholocationState3D {
  return {
    isInBaseContact: false,
    armed: true,
    pulseCounter: 0,
    activePulse: null,
  };
}

export function formatBaseContactKindPtLabel(
  kind: BaseContactKind3D,
  basePlaneZ = 0,
): string {
  const zStr = basePlaneZ.toFixed(2);
  switch (kind) {
    case "BASE_FACE":
      return `🎯 BASE · FACE (Z = ${zStr} mm)`;
    case "BASE_EDGE":
      return `🎯 BASE · ARESTA (Z = ${zStr} mm)`;
    case "BASE_VERTEX":
      return `🎯 BASE · VÉRTICE (Z = ${zStr} mm)`;
    case "BASE_CURVED":
      return `🎯 BASE · SUPERFÍCIE CURVA (Z = ${zStr} mm)`;
    case "NONE":
      return "";
  }
}

function isBodyCurvedForBaseContact(body: DirectBody3D, entity?: Entity): boolean {
  if (entity) {
    if (entity.type === "circle" || entity.type === "ellipse" || entity.type === "arc") {
      // Um cilindro vertical apoiado na tampa plana tem contato planar (FACE);
      // se estiver inclinado/deitado (90° em X ou Y), apoia pela geratriz curva!
      const rx = Math.abs(body.rotation3D.rxDeg % 180);
      const ry = Math.abs(body.rotation3D.ryDeg % 180);
      if (rx > 2 || ry > 2) {
        return true;
      }
    }
    const feat = String(entity.params?.solidFeature3D ?? "");
    if (feat === "revolve" || feat === "sweep") {
      return true;
    }
  }
  const nameLower = body.name.toLowerCase();
  if (
    (nameLower.includes("cilindro") || nameLower.includes("tubo redondo") || nameLower.includes("sweep")) &&
    (Math.abs(body.rotation3D.rxDeg % 180) > 2 || Math.abs(body.rotation3D.ryDeg % 180) > 2)
  ) {
    return true;
  }
  return false;
}

function deduplicateContactPointsXY(pts: Vec3Mm[], epsMm = 0.5): Vec3Mm[] {
  const unique: Vec3Mm[] = [];
  for (const p of pts) {
    const exists = unique.some(
      (u) => Math.hypot(u.x - p.x, u.y - p.y) <= epsMm,
    );
    if (!exists) {
      unique.push(p);
    }
  }
  return unique;
}

function arePoints2DNonCollinear(pts: Vec3Mm[], areaEpsMm2 = 1.0): boolean {
  if (pts.length < 3) return false;
  const p0 = pts[0]!;
  // Encontra o ponto mais distante de p0 para formar uma linha base estável
  let p1 = pts[1]!;
  let maxDist = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - p0.x, pts[i]!.y - p0.y);
    if (d > maxDist) {
      maxDist = d;
      p1 = pts[i]!;
    }
  }
  if (maxDist < 0.25) return false;

  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    const wx = p.x - p0.x;
    const wy = p.y - p0.y;
    const twiceTriangleArea = Math.abs(vx * wy - vy * wx);
    if (twiceTriangleArea > areaEpsMm2) {
      return true;
    }
  }
  return false;
}

/**
 * Avalia o Snap Magnético de Superfície Base (`Z = basePlaneZ`, padrão `0.00 mm`)
 * para 1 corpo ou N corpos simultâneos, com histerese (`T_in = 3.5mm`, `T_out = 5.5mm`)
 * e classificação geométrica real em 4 modos (`FACE`, `ARESTA`, `VÉRTICE`, `SUPERFÍCIE CURVA`).
 */
export function evaluateBaseSurfaceSnap3D(
  movingBodies: DirectBody3D[],
  candidateDeltaZMm: number,
  wasLatched: boolean,
  basePlaneZ = 0,
  entitiesById?: Map<string, Entity>,
  candidateDeltaXY: { dx: number; dy: number } = { dx: 0, dy: 0 },
): BaseSurfaceSnapEvaluation3D {
  if (movingBodies.length === 0) {
    return {
      snapped: false,
      latched: false,
      rawMinZMm: 0,
      effectiveMinZMm: 0,
      snappedDeltaZMm: candidateDeltaZMm,
      snapCorrectionZMm: 0,
      contactKind: "NONE",
      hudBadgeLabel: "",
      contactPoint3D: { x: 0, y: 0, z: basePlaneZ },
      pieceHorizontalRadiusMm: 40,
      contactPoints3D: [],
    };
  }

  // Coleta todos os vértices 3D reais (das faces e vértices) dos corpos em movimento
  const shiftedSamples: Array<{ pt: Vec3Mm; body: DirectBody3D }> = [];
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let rawMinZ = Infinity;

  for (const body of movingBodies) {
    let bodyPointCount = 0;
    for (const face of body.faces) {
      for (const p of face.polygon3D) {
        const sx = p.x + candidateDeltaXY.dx;
        const sy = p.y + candidateDeltaXY.dy;
        const sz = p.z + candidateDeltaZMm;
        shiftedSamples.push({ pt: { x: sx, y: sy, z: sz }, body });
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
        if (sz < rawMinZ) rawMinZ = sz;
        bodyPointCount++;
      }
    }
    for (const v of body.vertices ?? []) {
      const sx = v.point3D.x + candidateDeltaXY.dx;
      const sy = v.point3D.y + candidateDeltaXY.dy;
      const sz = v.point3D.z + candidateDeltaZMm;
      shiftedSamples.push({ pt: { x: sx, y: sy, z: sz }, body });
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
      if (sz < rawMinZ) rawMinZ = sz;
      bodyPointCount++;
    }
    if (bodyPointCount === 0) {
      const b = body.bbox3D;
      const corners: Vec3Mm[] = [
        { x: b.minX + candidateDeltaXY.dx, y: b.minY + candidateDeltaXY.dy, z: b.minZ + candidateDeltaZMm },
        { x: b.maxX + candidateDeltaXY.dx, y: b.minY + candidateDeltaXY.dy, z: b.minZ + candidateDeltaZMm },
        { x: b.maxX + candidateDeltaXY.dx, y: b.maxY + candidateDeltaXY.dy, z: b.minZ + candidateDeltaZMm },
        { x: b.minX + candidateDeltaXY.dx, y: b.maxY + candidateDeltaXY.dy, z: b.minZ + candidateDeltaZMm },
      ];
      for (const c of corners) {
        shiftedSamples.push({ pt: c, body });
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
        if (c.z < rawMinZ) rawMinZ = c.z;
      }
    }
  }

  const distToBase = Math.abs(rawMinZ - basePlaneZ);
  const threshold = wasLatched ? BASE_SNAP_TOUT_MM : BASE_SNAP_TIN_MM;
  const shouldSnap = distToBase <= threshold;

  const snapCorrectionZMm = shouldSnap ? basePlaneZ - rawMinZ : 0;
  const snappedDeltaZMm = Number((candidateDeltaZMm + snapCorrectionZMm).toFixed(3));
  const effectiveMinZMm = shouldSnap ? basePlaneZ : Number(rawMinZ.toFixed(3));

  const spanX = Number.isFinite(minX) ? Math.max(12, maxX - minX) : 60;
  const spanY = Number.isFinite(minY) ? Math.max(12, maxY - minY) : 60;
  const pieceHorizontalRadiusMm = Math.max(18, Math.hypot(spanX, spanY) * 0.5);

  if (!shouldSnap) {
    return {
      snapped: false,
      latched: false,
      rawMinZMm: Number(rawMinZ.toFixed(3)),
      effectiveMinZMm,
      snappedDeltaZMm: candidateDeltaZMm,
      snapCorrectionZMm: 0,
      contactKind: "NONE",
      hudBadgeLabel: "",
      contactPoint3D: {
        x: Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0,
        y: Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0,
        z: basePlaneZ,
      },
      pieceHorizontalRadiusMm,
      contactPoints3D: [],
    };
  }

  // Filtra todos os pontos que tocam o plano base (Z ≈ basePlaneZ após a correção)
  const rawContactPts: Vec3Mm[] = [];
  const contactingBodies = new Set<DirectBody3D>();
  for (const s of shiftedSamples) {
    const zAfter = s.pt.z + snapCorrectionZMm;
    if (Math.abs(zAfter - basePlaneZ) <= BASE_CONTACT_TOLERANCE_MM) {
      rawContactPts.push({ x: s.pt.x, y: s.pt.y, z: basePlaneZ });
      contactingBodies.add(s.body);
    }
  }

  const uniqueContactPts = deduplicateContactPointsXY(rawContactPts, 0.5);
  let cx = 0;
  let cy = 0;
  if (uniqueContactPts.length > 0) {
    for (const p of uniqueContactPts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= uniqueContactPts.length;
    cy /= uniqueContactPts.length;
  } else {
    cx = (minX + maxX) * 0.5;
    cy = (minY + maxY) * 0.5;
  }

  // Classificação geométrica dos 4 tipos reais de contato com a base
  let contactKind: BaseContactKind3D = "BASE_VERTEX";
  let hasCurvedContact = false;
  for (const cb of contactingBodies) {
    const ent = entitiesById?.get(cb.entityId);
    if (isBodyCurvedForBaseContact(cb, ent)) {
      hasCurvedContact = true;
      break;
    }
  }

  if (hasCurvedContact) {
    contactKind = "BASE_CURVED";
  } else if (arePoints2DNonCollinear(uniqueContactPts, 1.0)) {
    contactKind = "BASE_FACE";
  } else if (uniqueContactPts.length >= 2) {
    contactKind = "BASE_EDGE";
  } else {
    contactKind = "BASE_VERTEX";
  }

  const contactPoint3D: Vec3Mm = {
    x: Number(cx.toFixed(2)),
    y: Number(cy.toFixed(2)),
    z: basePlaneZ,
  };

  return {
    snapped: true,
    latched: true,
    rawMinZMm: Number(rawMinZ.toFixed(3)),
    effectiveMinZMm: basePlaneZ,
    snappedDeltaZMm,
    snapCorrectionZMm: Number(snapCorrectionZMm.toFixed(3)),
    contactKind,
    hudBadgeLabel: formatBaseContactKindPtLabel(contactKind, basePlaneZ),
    contactPoint3D,
    pieceHorizontalRadiusMm: Number(pieceHorizontalRadiusMm.toFixed(2)),
    contactPoints3D: uniqueContactPts,
  };
}

/**
 * Máquina de estados Edge-Triggered para a Ecolocalização Azul (Seção 4.2):
 * - Dispara 1 ÚNICA VEZ na transição Sem Contato -> Em Contato com Z=0.
 * - Deslizar horizontalmente em X/Y mantendo Z=0 NÃO re-dispara!
 * - Só rearma quando a peça sobe acima do limiar de histerese (`rawMinZ > basePlaneZ + T_out`).
 */
export function stepBaseEcholocationState3D(
  prevState: BaseEcholocationState3D,
  snapEval: BaseSurfaceSnapEvaluation3D,
  timestampMs: number,
  basePlaneZ = 0,
): { nextState: BaseEcholocationState3D; triggeredNewPulse: boolean } {
  if (snapEval.snapped) {
    if (prevState.armed && !prevState.isInBaseContact) {
      const nextCounter = prevState.pulseCounter + 1;
      const pulse: BaseEcholocationPulse3D = {
        pulseId: nextCounter,
        triggeredAtMs: timestampMs,
        contactPoint3D: snapEval.contactPoint3D,
        pieceHorizontalRadiusMm: snapEval.pieceHorizontalRadiusMm,
        contactKind: snapEval.contactKind,
        colorPrimaryHex: "#38BDF8",
        colorCoreHex: "#0EA5E9",
        ringCount: 3,
        durationMs: 520,
        staggerMs: 90,
        scaleStartFactor: 0.15,
        scaleEndFactor: 2.2,
        maxOpacity: 0.85,
      };
      return {
        nextState: {
          isInBaseContact: true,
          armed: false,
          pulseCounter: nextCounter,
          activePulse: pulse,
        },
        triggeredNewPulse: true,
      };
    }

    // Já estava em contato (ex.: deslizando em X ou Y sobre a bancada Z=0) -> não re-dispara!
    return {
      nextState: {
        ...prevState,
        isInBaseContact: true,
        armed: false,
      },
      triggeredNewPulse: false,
    };
  }

  // Fora de contato: verifica se subiu além da zona de histerese (T_out = 5.5 mm) para rearmar
  const liftedAboveRelease = snapEval.rawMinZMm - basePlaneZ > BASE_SNAP_TOUT_MM ||
    basePlaneZ - snapEval.rawMinZMm > BASE_SNAP_TOUT_MM;

  return {
    nextState: {
      ...prevState,
      isInBaseContact: false,
      armed: prevState.armed || liftedAboveRelease,
    },
    triggeredNewPulse: false,
  };
}

/**
 * Ação rápida de 1 toque `[ ⤓ Pousar na Base (Z=0) ]`:
 * Desce (ou sobe) rigidamente 1 ou N corpos selecionados até que o ponto mais baixo do conjunto
 * encoste exatamente em `Z = 0.00 mm`, preservando as distâncias relativas de uma montagem!
 */
export function applyDropBodiesToBaseZ0(
  entities: Entity[],
  targetIds: string[],
  scene: DirectTopology3DScene,
  basePlaneZ = 0,
): {
  updatedEntities: Entity[];
  deltaZAppliedMm: number;
  snapEval: BaseSurfaceSnapEvaluation3D;
} {
  const idSet = new Set(targetIds);
  const targetBodies = scene.bodies.filter((b) => idSet.has(b.entityId));
  if (targetBodies.length === 0) {
    return {
      updatedEntities: entities,
      deltaZAppliedMm: 0,
      snapEval: evaluateBaseSurfaceSnap3D([], 0, false, basePlaneZ),
    };
  }

  let globalMinZ = Infinity;
  for (const b of targetBodies) {
    if (b.bbox3D.minZ < globalMinZ) globalMinZ = b.bbox3D.minZ;
    for (const f of b.faces) {
      for (const p of f.polygon3D) {
        if (p.z < globalMinZ) globalMinZ = p.z;
      }
    }
    for (const v of b.vertices ?? []) {
      if (v.point3D.z < globalMinZ) globalMinZ = v.point3D.z;
    }
  }

  if (!Number.isFinite(globalMinZ)) {
    globalMinZ = 0;
  }

  const deltaZAppliedMm = Number((basePlaneZ - globalMinZ).toFixed(3));
  const entitiesById = new Map(entities.map((e) => [e.id, e]));
  const snapEval = evaluateBaseSurfaceSnap3D(
    targetBodies,
    deltaZAppliedMm,
    true,
    basePlaneZ,
    entitiesById,
  );

  if (Math.abs(deltaZAppliedMm) < 1e-4) {
    return { updatedEntities: entities, deltaZAppliedMm: 0, snapEval };
  }

  const res = applyMultiBodyRigidTransform3D(
    entities,
    targetIds,
    scene,
    { dz: deltaZAppliedMm },
    null,
    false,
  );

  return {
    updatedEntities: res.updatedEntities,
    deltaZAppliedMm,
    snapEval,
  };
}

// ============================================================================
// 4. MULTI-SELEÇÃO INTELIGENTE, 5 PIVÔS, MONTAGEM (GROUP) vs. BOOLEAN UNION & INSPETOR
// ============================================================================

export type MultiSelectionPivotMode3D =
  | "bbox_center"
  | "mass_centroid"
  | "primary_body"
  | "snap_point"
  | "custom_draggable";

export interface MultiPivotComputeOptions3D {
  primaryBody?: DirectBody3D | null;
  snapPoint3D?: Vec3Mm | null;
  customPivot3D?: Vec3Mm | null;
}

/**
 * Calcula o Pivô 3D do Conjunto para os 5 modos exigidos na Seção 5.2:
 *  1. `bbox_center` — Centro Geométrico (Bounding Box Total) [Padrão]
 *  2. `mass_centroid` — Centroide de Massa do Conjunto (ponderado por massa real)
 *  3. `primary_body` — Pivô do Corpo Principal
 *  4. `snap_point` — Ponto de Snap Selecionado (vértice, meio de aresta ou centro de face)
 *  5. `custom_draggable` — Pivô Personalizado Arrastável
 */
export function computeMultiBodySetPivot3D(
  selectedBodies: DirectBody3D[],
  mode: MultiSelectionPivotMode3D = "bbox_center",
  options: MultiPivotComputeOptions3D = {},
): Vec3Mm | null {
  if (selectedBodies.length === 0) return null;

  if (mode === "custom_draggable" && options.customPivot3D) {
    return options.customPivot3D;
  }
  if (mode === "snap_point" && options.snapPoint3D) {
    return options.snapPoint3D;
  }
  if (mode === "primary_body") {
    const pb = options.primaryBody ?? selectedBodies[0]!;
    return pb.pivot3D;
  }
  if (mode === "mass_centroid") {
    let totalMass = 0;
    let wx = 0;
    let wy = 0;
    let wz = 0;
    for (const b of selectedBodies) {
      const m = Math.max(0.01, b.massGrams || b.volumeMm3 * 0.00785 || 1);
      wx += b.pivot3D.x * m;
      wy += b.pivot3D.y * m;
      wz += b.pivot3D.z * m;
      totalMass += m;
    }
    if (totalMass > 0) {
      return {
        x: Number((wx / totalMass).toFixed(2)),
        y: Number((wy / totalMass).toFixed(2)),
        z: Number((wz / totalMass).toFixed(2)),
      };
    }
  }

  // Default: Centro Geométrico da Bounding Box Total do Conjunto
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const b of selectedBodies) {
    if (b.bbox3D.minX < minX) minX = b.bbox3D.minX;
    if (b.bbox3D.maxX > maxX) maxX = b.bbox3D.maxX;
    if (b.bbox3D.minY < minY) minY = b.bbox3D.minY;
    if (b.bbox3D.maxY > maxY) maxY = b.bbox3D.maxY;
    if (b.bbox3D.minZ < minZ) minZ = b.bbox3D.minZ;
    if (b.bbox3D.maxZ > maxZ) maxZ = b.bbox3D.maxZ;
  }
  return {
    x: Number(((minX + maxX) * 0.5).toFixed(2)),
    y: Number(((minY + maxY) * 0.5).toFixed(2)),
    z: Number(((minZ + maxZ) * 0.5).toFixed(2)),
  };
}

/**
 * Extrai uma assinatura normalizada de seção transversal do corpo (ex.: todas as barras de 20×20mm
 * parede 2mm de uma grade ou quadro compartilham a mesma assinatura, mesmo com comprimentos ou eixos diferentes!).
 */
export function extractNormalizedProfileSignature3D(
  body: DirectBody3D,
  entity?: Entity,
): {
  kind: "round" | "box";
  dimSmallMm: number;
  dimMidMm: number;
  wallMm: number;
  signature: string;
} {
  const wallMm = Number(
    (body.shellWallThicknessMm || body.shellThicknessMm || 0).toFixed(1),
  );
  if (entity?.type === "circle") {
    const diam = Number((entity.r * 2).toFixed(1));
    return {
      kind: "round",
      dimSmallMm: diam,
      dimMidMm: diam,
      wallMm,
      signature: `round:${diam}:w${wallMm}`,
    };
  }

  const mSpec = entity?.params?.miterBarSpec3D as
    | { profileWidthMm?: number; profileHeightZMm?: number; wallThicknessMm?: number }
    | undefined;
  if (mSpec && Number(mSpec.profileWidthMm) > 0) {
    const w = Number(mSpec.profileWidthMm);
    const h = Number(mSpec.profileHeightZMm || w);
    const small = Number(Math.min(w, h).toFixed(1));
    const mid = Number(Math.max(w, h).toFixed(1));
    const effWall = Number((mSpec.wallThicknessMm ?? wallMm).toFixed(1));
    return {
      kind: "box",
      dimSmallMm: small,
      dimMidMm: mid,
      wallMm: effWall,
      signature: `box:${small}x${mid}:w${effWall}`,
    };
  }

  // Ordena as 3 dimensões (ΔX, ΔY, ΔZ): as 2 menores são a seção transversal do tubo/barra; a maior é o comprimento!
  const dims = [body.deltaX, body.deltaY, body.deltaZ].sort((a, b) => a - b);
  const small = Number((dims[0] ?? 0).toFixed(1));
  const mid = Number((dims[1] ?? 0).toFixed(1));

  return {
    kind: "box",
    dimSmallMm: small,
    dimMidMm: mid,
    wallMm,
    signature: `box:${small}x${mid}:w${wallMm}`,
  };
}

/**
 * Atalho de 1 toque `[ ≈ Mesmo Perfil ]`: seleciona todos os corpos da cena com a mesma
 * seção transversal do corpo principal (tolerância industrial de 0.6 mm).
 */
export function selectBodiesWithSameProfile3D(
  primaryBody: DirectBody3D,
  allBodies: DirectBody3D[],
  entitiesById?: Map<string, Entity>,
  toleranceMm = 0.6,
): DirectBody3D[] {
  const refProf = extractNormalizedProfileSignature3D(
    primaryBody,
    entitiesById?.get(primaryBody.entityId),
  );
  const matched: DirectBody3D[] = [primaryBody];
  for (const candidate of allBodies) {
    if (candidate.bodyId === primaryBody.bodyId) continue;
    const candProf = extractNormalizedProfileSignature3D(
      candidate,
      entitiesById?.get(candidate.entityId),
    );
    if (
      candProf.kind === refProf.kind &&
      Math.abs(candProf.dimSmallMm - refProf.dimSmallMm) <= toleranceMm &&
      Math.abs(candProf.dimMidMm - refProf.dimMidMm) <= toleranceMm &&
      Math.abs(candProf.wallMm - refProf.wallMm) <= 0.35
    ) {
      matched.push(candidate);
    }
  }
  return matched;
}

/**
 * Seleção por Caixa (Marquee 3D Projetada):
 *  - Esquerda -> Direita (`end.x >= start.x`): modo `"window"` (borda contínua azul) — exige corpo 100% contido.
 *  - Direita -> Esquerda (`end.x < start.x`): modo `"crossing"` (borda tracejada ciano) — qualquer corpo tocado entra.
 */
export function evaluateMarqueeBoxSelection3D(
  startPx: Vec2,
  endPx: Vec2,
  bodies: DirectBody3D[],
  toScreen: (pt3D: Vec3Mm) => Vec2,
): {
  mode: "window" | "crossing";
  rect: { minX: number; minY: number; maxX: number; maxY: number };
  matchedBodyIds: string[];
  matchedEntityIds: string[];
} {
  const mode: "window" | "crossing" = endPx.x >= startPx.x ? "window" : "crossing";
  const rect = {
    minX: Math.min(startPx.x, endPx.x),
    minY: Math.min(startPx.y, endPx.y),
    maxX: Math.max(startPx.x, endPx.x),
    maxY: Math.max(startPx.y, endPx.y),
  };

  const matchedBodyIds: string[] = [];
  const matchedEntityIds: string[] = [];

  for (const body of bodies) {
    const samplePts2D: Vec2[] = [];
    for (const f of body.faces) {
      for (const p of f.polygon3D) {
        samplePts2D.push(toScreen(p));
      }
    }
    for (const v of body.vertices ?? []) {
      samplePts2D.push(toScreen(v.point3D));
    }
    if (samplePts2D.length === 0) {
      samplePts2D.push(toScreen(body.pivot3D));
    }

    let bMinX = Infinity, bMaxX = -Infinity;
    let bMinY = Infinity, bMaxY = -Infinity;
    let allInside = true;
    let anyInside = false;

    for (const sp of samplePts2D) {
      if (sp.x < bMinX) bMinX = sp.x;
      if (sp.x > bMaxX) bMaxX = sp.x;
      if (sp.y < bMinY) bMinY = sp.y;
      if (sp.y > bMaxY) bMaxY = sp.y;
      const inside =
        sp.x >= rect.minX &&
        sp.x <= rect.maxX &&
        sp.y >= rect.minY &&
        sp.y <= rect.maxY;
      if (inside) anyInside = true;
      else allInside = false;
    }

    const boxesOverlap =
      bMaxX >= rect.minX &&
      bMinX <= rect.maxX &&
      bMaxY >= rect.minY &&
      bMinY <= rect.maxY;

    if (mode === "window" ? allInside : anyInside || boxesOverlap) {
      matchedBodyIds.push(body.bodyId);
      matchedEntityIds.push(body.entityId);
    }
  }

  return { mode, rect, matchedBodyIds, matchedEntityIds };
}

// ============================================================================
// AGRUPAR (MONTAGEM LÓGICA — ASSEMBLY GROUP) vs. UNIR (BOOLEAN UNION)
// ============================================================================

export function getEntityAssemblyGroupId(entity?: Entity | null): string | null {
  const g = entity?.params?.assemblyGroupId;
  return typeof g === "string" && g.trim().length > 0 ? g.trim() : null;
}

/**
 * `AGRUPAR (Montagem Lógica)`: vincula N corpos sob um `assemblyGroupId` compartilhado.
 * Cada peça preserva 100% seu próprio `entity.id`, `BodyId`, geometria independente, material e
 * linha individual na Lista de Corte / BOM!
 */
export function applyAssemblyGroupToEntities3D(
  entities: Entity[],
  targetEntityIds: string[],
  customGroupName?: string,
): { updatedEntities: Entity[]; groupId: string; memberEntityIds: string[] } {
  const idSet = new Set(targetEntityIds);
  const groupId = `asm_grp_${uid()}`;
  const groupLabel = customGroupName || `Montagem (${targetEntityIds.length} pçs)`;
  const memberEntityIds: string[] = [];

  const updatedEntities = entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    memberEntityIds.push(e.id);
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        assemblyGroupId: groupId,
        assemblyGroupLabel: groupLabel,
      },
    };
  });

  return { updatedEntities, groupId, memberEntityIds };
}

/**
 * `DESAGRUPAR`: dissolve a montagem lógica das entidades selecionadas (e de todos os membros do mesmo grupo),
 * mantendo todas as peças na posição atual como corpos individuais livres.
 */
export function ungroupAssemblyEntities3D(
  entities: Entity[],
  targetEntityIds: string[],
): { updatedEntities: Entity[]; ungroupedEntityIds: string[] } {
  const idSet = new Set(targetEntityIds);
  const groupIdsToDissolve = new Set<string>();
  for (const e of entities) {
    if (idSet.has(e.id)) {
      const gid = getEntityAssemblyGroupId(e);
      if (gid) groupIdsToDissolve.add(gid);
    }
  }

  const ungroupedEntityIds: string[] = [];
  const updatedEntities = entities.map((e) => {
    const gid = getEntityAssemblyGroupId(e);
    if (!idSet.has(e.id) && (!gid || !groupIdsToDissolve.has(gid))) {
      return e;
    }
    ungroupedEntityIds.push(e.id);
    const nextParams = { ...(e.params ?? {}) };
    delete nextParams.assemblyGroupId;
    delete nextParams.assemblyGroupLabel;
    return {
      ...e,
      params: nextParams,
    };
  });

  return { updatedEntities, ungroupedEntityIds };
}

/**
 * Ao clicar em qualquer peça que pertence a uma Montagem Lógica (`assemblyGroupId`),
 * expande automaticamente a seleção para incluir todos os membros do grupo!
 */
export function expandBodyIdsWithAssemblyGroup3D(
  bodyIds: string[],
  scene: DirectTopology3DScene,
  entities: Entity[],
): { bodyIds: string[]; entityIds: string[]; hasAssemblyGroup: boolean; groupIds: string[] } {
  const entitiesById = new Map(entities.map((e) => [e.id, e]));
  const activeGroupIds = new Set<string>();

  for (const bId of bodyIds) {
    const b = scene.bodiesById.get(bId);
    if (!b) continue;
    const gid = getEntityAssemblyGroupId(entitiesById.get(b.entityId));
    if (gid) activeGroupIds.add(gid);
  }

  if (activeGroupIds.size === 0) {
    const entityIds = bodyIds
      .map((bId) => scene.bodiesById.get(bId)?.entityId)
      .filter((id): id is string => Boolean(id));
    return { bodyIds, entityIds, hasAssemblyGroup: false, groupIds: [] };
  }

  const orderedBodyIds = [...bodyIds];
  for (const b of scene.bodies) {
    const gid = getEntityAssemblyGroupId(entitiesById.get(b.entityId));
    if (gid && activeGroupIds.has(gid) && !orderedBodyIds.includes(b.bodyId)) {
      orderedBodyIds.push(b.bodyId);
    }
  }

  const entityIds = orderedBodyIds
    .map((bId) => scene.bodiesById.get(bId)?.entityId)
    .filter((id): id is string => Boolean(id));

  return {
    bodyIds: orderedBodyIds,
    entityIds,
    hasAssemblyGroup: true,
    groupIds: Array.from(activeGroupIds),
  };
}

// ============================================================================
// TRANSFORMAÇÃO RÍGIDA CONJUNTA DE N CORPOS (TRANSLAÇÃO + ROTAÇÃO EM TORNO DE PIVÔ + COPY)
// ============================================================================

function rotateVecAroundPivot3D(
  pt: Vec3Mm,
  pivot: Vec3Mm,
  rot: { rxDeg: number; ryDeg: number; rzDeg: number },
): Vec3Mm {
  const m = buildBodyTransformMatrix4x4(pivot, rot);
  return transformPointByMatrix4x4(pt, m);
}

function rotate2DPointAround(pt: Vec2, center: Vec2, angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: Number((center.x + dx * c - dy * s).toFixed(3)),
    y: Number((center.y + dx * s + dy * c).toFixed(3)),
  };
}

/**
 * Transforma rigidamente 1 ou N corpos simultaneamente (translação X/Y/Z ou local OCS + rotação orbital
 * em torno de `setPivot3D`), preservando 100% as distâncias e ângulos relativos entre as peças!
 * Quando `copyMode === true`, cria N cópias independentes (e renova `assemblyGroupId` se agrupadas).
 */
export function applyMultiBodyRigidTransform3D(
  entities: Entity[],
  targetIds: string[],
  scene: DirectTopology3DScene,
  delta: {
    dx?: number;
    dy?: number;
    dz?: number;
    rxDeg?: number;
    ryDeg?: number;
    rzDeg?: number;
  },
  setPivot3D: Vec3Mm | null = null,
  copyMode = false,
  preassignedCopyIds?: Map<string, string>,
): { updatedEntities: Entity[]; activeIds: string[] } {
  const dx = Number(delta.dx ?? 0);
  const dy = Number(delta.dy ?? 0);
  const dz = Number(delta.dz ?? 0);
  const rxDeg = Number(delta.rxDeg ?? 0);
  const ryDeg = Number(delta.ryDeg ?? 0);
  const rzDeg = Number(delta.rzDeg ?? 0);
  const hasRot =
    Math.abs(rxDeg) > 1e-4 || Math.abs(ryDeg) > 1e-4 || Math.abs(rzDeg) > 1e-4;

  const targetBodies = scene.bodies.filter((b) => targetIds.includes(b.entityId));
  const effectivePivot: Vec3Mm =
    setPivot3D ??
    computeMultiBodySetPivot3D(targetBodies, "bbox_center") ?? { x: 0, y: 0, z: 0 };

  // Inclui furos 2D contidos dentro das peças selecionadas
  const allTargetIds = new Set(targetIds);
  const bodyByEntityId = new Map<string, DirectBody3D>();
  for (const b of scene.bodies) {
    bodyByEntityId.set(b.entityId, b);
  }

  for (const outerEnt of entities) {
    if (!allTargetIds.has(outerEnt.id)) continue;
    const outerBody = bodyByEntityId.get(outerEnt.id);
    if (!outerBody) continue;
    for (const other of entities) {
      if (allTargetIds.has(other.id)) continue;
      if (
        other.params?.isIndependentBody3D === true ||
        other.params?.isHorizontalMiterBar3D === true
      ) {
        continue;
      }
      if (bodyByEntityId.has(other.id)) continue;
      const otherZ = Number(other.params?.elevationZ ?? 0);
      if (Math.abs(otherZ - outerBody.elevationZ) <= 1.0 && other.type === "circle") {
        if (
          other.cx >= outerBody.bbox3D.minX &&
          other.cx <= outerBody.bbox3D.maxX &&
          other.cy >= outerBody.bbox3D.minY &&
          other.cy <= outerBody.bbox3D.maxY
        ) {
          allTargetIds.add(other.id);
        }
      }
    }
  }

  // Mapa para clonar `assemblyGroupId` em novas cópias independentes
  const copiedGroupMap = new Map<string, string>();
  const resolveCopiedGroupId = (oldGroupId: string | null): string | undefined => {
    if (!oldGroupId) return undefined;
    const existing = copiedGroupMap.get(oldGroupId);
    if (existing) return existing;
    const fresh = preassignedCopyIds?.get(`grp:${oldGroupId}`) ?? `asm_grp_${uid()}`;
    preassignedCopyIds?.set(`grp:${oldGroupId}`, fresh);
    copiedGroupMap.set(oldGroupId, fresh);
    return fresh;
  };

  const transformOneEntity = (ent: Entity, assignNewId: boolean): Entity => {
    const body = bodyByEntityId.get(ent.id);
    const bodyCenter: Vec3Mm = body?.pivot3D ?? effectivePivot;

    // Deslocamento orbital rígido do centro desta peça quando girando em conjunto ao redor de `effectivePivot`
    let orbitalDx = 0;
    let orbitalDy = 0;
    let orbitalDz = 0;
    if (hasRot) {
      const rotatedCenter = rotateVecAroundPivot3D(bodyCenter, effectivePivot, {
        rxDeg,
        ryDeg,
        rzDeg,
      });
      orbitalDx = rotatedCenter.x - bodyCenter.x;
      orbitalDy = rotatedCenter.y - bodyCenter.y;
      orbitalDz = rotatedCenter.z - bodyCenter.z;
    }

    const totalDx = dx + orbitalDx;
    const totalDy = dy + orbitalDy;
    const totalDz = dz + orbitalDz;

    const mSpec = ent.params?.miterBarSpec3D as
      | {
          cornerOrigin3D: Vec3Mm;
          dirLen3D: Vec3Mm;
          dirIn3D: Vec3Mm;
          longLengthMm: number;
          profileWidthMm: number;
          profileHeightZMm: number;
          startMiterRatio?: number;
          endMiterRatio?: number;
          [k: string]: unknown;
        }
      | undefined;

    let moved: Entity = { ...ent };
    let nextMSpec = mSpec ? { ...mSpec } : undefined;

    if (mSpec && Math.abs(rzDeg) > 1e-4 && Math.abs(rxDeg) < 1e-4 && Math.abs(ryDeg) < 1e-4) {
      // Rotação rígida exata de barras horizontais de Quadro 45° no plano XY ao redor de `effectivePivot`!
      const rotCorner2D = rotate2DPointAround(
        { x: mSpec.cornerOrigin3D.x, y: mSpec.cornerOrigin3D.y },
        { x: effectivePivot.x, y: effectivePivot.y },
        rzDeg,
      );
      const rotDirLen = rotate2DPointAround(
        { x: mSpec.dirLen3D.x, y: mSpec.dirLen3D.y },
        { x: 0, y: 0 },
        rzDeg,
      );
      const rotDirIn = rotate2DPointAround(
        { x: mSpec.dirIn3D.x, y: mSpec.dirIn3D.y },
        { x: 0, y: 0 },
        rzDeg,
      );
      nextMSpec = {
        ...mSpec,
        cornerOrigin3D: {
          x: Number((rotCorner2D.x + dx).toFixed(3)),
          y: Number((rotCorner2D.y + dy).toFixed(3)),
          z: Number((mSpec.cornerOrigin3D.z + totalDz).toFixed(3)),
        },
        dirLen3D: { x: rotDirLen.x, y: rotDirLen.y, z: mSpec.dirLen3D.z },
        dirIn3D: { x: rotDirIn.x, y: rotDirIn.y, z: mSpec.dirIn3D.z },
      };
      if (ent.type === "polyline") {
        moved = {
          ...ent,
          pts: ent.pts.map((p) => {
            const rp = rotate2DPointAround(
              p,
              { x: effectivePivot.x, y: effectivePivot.y },
              rzDeg,
            );
            return {
              x: Number((rp.x + dx).toFixed(3)),
              y: Number((rp.y + dy).toFixed(3)),
            };
          }),
        };
      }
    } else {
      if (Math.abs(totalDx) > 1e-4 || Math.abs(totalDy) > 1e-4) {
        moved =
          ent.type === "rect"
            ? {
                ...ent,
                x: Number((ent.x + totalDx).toFixed(3)),
                y: Number((ent.y + totalDy).toFixed(3)),
              }
            : (translate(ent, totalDx, totalDy) ?? { ...ent });
      }
      if (mSpec) {
        nextMSpec = {
          ...mSpec,
          cornerOrigin3D: {
            x: Number((mSpec.cornerOrigin3D.x + totalDx).toFixed(3)),
            y: Number((mSpec.cornerOrigin3D.y + totalDy).toFixed(3)),
            z: Number((mSpec.cornerOrigin3D.z + totalDz).toFixed(3)),
          },
        };
      }
    }

    const curElev = Number(ent.params?.elevationZ ?? ent.elevationZ ?? 0);
    const nextZ = Number((curElev + totalDz).toFixed(3));
    const curRot = (ent.params?.rotation3D as
      | { rxDeg?: number; ryDeg?: number; rzDeg?: number }
      | undefined) ?? { rxDeg: 0, ryDeg: 0, rzDeg: 0 };

    const isPureZRotatedMiterBar =
      Boolean(mSpec) &&
      Math.abs(rzDeg) > 1e-4 &&
      Math.abs(rxDeg) < 1e-4 &&
      Math.abs(ryDeg) < 1e-4;

    const nextRot = {
      rxDeg: Number(((curRot.rxDeg ?? 0) + rxDeg).toFixed(2)),
      ryDeg: Number(((curRot.ryDeg ?? 0) + ryDeg).toFixed(2)),
      rzDeg: Number(
        ((curRot.rzDeg ?? 0) + (isPureZRotatedMiterBar ? 0 : rzDeg)).toFixed(2),
      ),
    };

    let nextId = ent.id;
    if (assignNewId) {
      const existing = preassignedCopyIds?.get(ent.id);
      if (existing) {
        nextId = existing;
      } else {
        nextId = uid();
        preassignedCopyIds?.set(ent.id, nextId);
      }
    }

    const oldGroupId = getEntityAssemblyGroupId(ent);
    const nextGroupId = assignNewId ? resolveCopiedGroupId(oldGroupId) : oldGroupId;

    return {
      ...moved,
      id: nextId,
      elevationZ: nextZ,
      params: {
        ...(moved.params ?? {}),
        elevationZ: nextZ,
        rotation3D: nextRot,
        ...(nextMSpec ? { miterBarSpec3D: nextMSpec } : {}),
        ...(nextGroupId ? { assemblyGroupId: nextGroupId } : {}),
      },
    };
  };

  if (copyMode) {
    const copies: Entity[] = [];
    for (const e of entities) {
      if (allTargetIds.has(e.id)) {
        copies.push(transformOneEntity(e, true));
      }
    }
    return {
      updatedEntities: [...entities, ...copies],
      activeIds: copies.map((c) => c.id),
    };
  }

  const updatedEntities = entities.map((e) =>
    allTargetIds.has(e.id) ? transformOneEntity(e, false) : e,
  );
  return {
    updatedEntities,
    activeIds: Array.from(allTargetIds),
  };
}

// ============================================================================
// INSPETOR DE PROPRIEDADES MISTAS & MASSA TOTAL DA MULTI-SELEÇÃO (SEÇÃO 5.5)
// ============================================================================

export interface MultiBodyInspectorSummary3D {
  bodyCount: number;
  deltaXMm: number;
  deltaYMm: number;
  deltaZMm: number;
  totalVolumeMm3: number;
  totalVolumeCm3: number;
  totalMassGrams: number;
  totalMassKg: number;
  isMaterialMixed: boolean;
  materialSummaryLabel: string;
  isWallThicknessMixed: boolean;
  wallThicknessSummaryLabel: string;
  formattedBarText: string;
}

export function computeMultiBodyInspectorSummary3D(
  selectedBodies: DirectBody3D[],
): MultiBodyInspectorSummary3D | null {
  if (selectedBodies.length === 0) return null;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let totalVolumeMm3 = 0;
  let totalMassGrams = 0;

  const materials = new Set<string>();
  const walls = new Set<string>();

  for (const b of selectedBodies) {
    if (b.bbox3D.minX < minX) minX = b.bbox3D.minX;
    if (b.bbox3D.maxX > maxX) maxX = b.bbox3D.maxX;
    if (b.bbox3D.minY < minY) minY = b.bbox3D.minY;
    if (b.bbox3D.maxY > maxY) maxY = b.bbox3D.maxY;
    if (b.bbox3D.minZ < minZ) minZ = b.bbox3D.minZ;
    if (b.bbox3D.maxZ > maxZ) maxZ = b.bbox3D.maxZ;

    const volMm3 = Math.max(0, b.volumeMm3);
    const dens = b.densityGPerCm3 > 0 ? b.densityGPerCm3 : 7.85;
    const massG = b.massGrams > 0 ? b.massGrams : (volMm3 / 1000) * dens;

    totalVolumeMm3 += volMm3;
    totalMassGrams += massG;

    materials.add((b.materialName || "Aço Carbono").trim());
    const w = b.shellWallThicknessMm || b.shellThicknessMm || 0;
    walls.add(w > 0.05 ? `${w.toFixed(2)} mm` : "Maciço");
  }

  const deltaXMm = Number(Math.max(0, maxX - minX).toFixed(1));
  const deltaYMm = Number(Math.max(0, maxY - minY).toFixed(1));
  const deltaZMm = Number(Math.max(0, maxZ - minZ).toFixed(1));
  const totalVolumeCm3 = Number((totalVolumeMm3 / 1000).toFixed(1));
  const totalMassKg = Number((totalMassGrams / 1000).toFixed(3));

  const isMaterialMixed = materials.size > 1;
  const materialSummaryLabel = isMaterialMixed
    ? "Material: Misto"
    : `Material: ${Array.from(materials)[0] ?? "Aço Carbono"}`;

  const isWallThicknessMixed = walls.size > 1;
  const wallThicknessSummaryLabel = isWallThicknessMixed
    ? "Espessuras: Diferentes"
    : `Parede: ${Array.from(walls)[0] ?? "Maciço"}`;

  const massStr =
    totalMassGrams >= 1000
      ? `${(totalMassGrams / 1000).toFixed(2)} kg`
      : `${totalMassGrams.toFixed(0)} g`;

  const formattedBarText =
    selectedBodies.length === 1
      ? `1 CORPO | ${deltaXMm}×${deltaYMm}×${deltaZMm} mm | ${totalVolumeCm3} cm³ | ${massStr}`
      : `${selectedBodies.length} CORPOS SELECIONADOS | ${deltaXMm}×${deltaYMm}×${deltaZMm} mm | ${totalVolumeCm3} cm³ | ${massStr}`;

  return {
    bodyCount: selectedBodies.length,
    deltaXMm,
    deltaYMm,
    deltaZMm,
    totalVolumeMm3: Number(totalVolumeMm3.toFixed(1)),
    totalVolumeCm3,
    totalMassGrams: Number(totalMassGrams.toFixed(2)),
    totalMassKg,
    isMaterialMixed,
    materialSummaryLabel,
    isWallThicknessMixed,
    wallThicknessSummaryLabel,
    formattedBarText,
  };
}

/**
 * Sobrescreve de forma uniforme o material e densidade em todos os N corpos selecionados
 * (quando o inspetor exibe `Material: Misto` e o usuário escolhe padronizar).
 */
export function applyUniformMaterialToEntities3D(
  entities: Entity[],
  targetIds: string[],
  materialName: string,
  colorHex?: string,
): Entity[] {
  const idSet = new Set(targetIds);
  return entities.map((e) => {
    if (!idSet.has(e.id)) return e;
    return {
      ...e,
      params: {
        ...(e.params ?? {}),
        bodyMaterial: materialName,
        materialName,
        ...(colorHex ? { bodyColorHex: colorHex, colorHex } : {}),
      },
    };
  });
}
