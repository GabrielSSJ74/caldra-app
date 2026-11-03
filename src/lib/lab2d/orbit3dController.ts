/**
 * CHAMFER CAD — CONTROLADOR MATEMÁTICO UNIFICADO DE ÓRBITA 3D (2D SKETCH + CAD 3D)
 *
 * Responsável por:
 * 1. Estado compartilhado de câmera orbital (Azimute θ, Elevação φ, Preset ativo, Pivô inteligente e modo de arraste).
 * 2. Presets de Perspectiva (Superior 2D Plana, Isométricas SE/SO/NE/NO, Frontal, Traseira, Esquerda, Direita, Inferior, Livre).
 * 3. Prevenção de Gimbal Lock (clamp de elevação φ em [-89°, +89°] durante órbita livre).
 * 4. Projeção afim 3D -> 2D do plano de trabalho e desprojeção inversa exata (Ray-Plane Z=0)
 *    que preserva 100% da geometria canônica (X, Y) em milímetros.
 * 5. Interpolação suave de câmera (350ms cubic-bezier(0.22, 1, 0.36, 1)) com Zero-Idle Overhead.
 */

import type { Vec2 } from "@/lib/geometry/types";
import { bbox, boxOf, type Entity } from "./core";
import { cubicBezier022 } from "@/lib/cad/sketch/sketch3dBridge";

export type OrbitPresetId =
  | "top"
  | "iso_se"
  | "iso_sw"
  | "iso_ne"
  | "iso_nw"
  | "front"
  | "back"
  | "left"
  | "right"
  | "bottom"
  | "free";

export interface OrbitPresetDefinition {
  id: OrbitPresetId;
  label: string;
  shortLabel: string;
  description: string;
  azimuthDeg: number;
  elevationDeg: number;
  group: "planar" | "isometric" | "orthogonal" | "free";
}

export interface OrbitPivot3D {
  x: number;
  y: number;
  z: number;
  source: "selection" | "piece" | "origin";
}

export interface Orbit3DCameraState {
  /** Ângulo horizontal (azimute θ em graus) no plano XY */
  azimuthDeg: number;
  /** Ângulo vertical (elevação φ em graus, +90° = Topo 2D Plano, 35.26° = Isométrica, 0° = Horizontal) */
  elevationDeg: number;
  /** Identificador da vista predefinida ativa ou 'free' quando rotacionado manualmente */
  preset: OrbitPresetId;
  /** Indica se a ferramenta interativa de arraste de Órbita 3D está ativa */
  isOrbitToolActive: boolean;
  /** Centro inteligente da órbita (pivô 3D) */
  pivot: OrbitPivot3D;
}

export const ORBIT_TRANSITION_DURATION_MS = 350;
export const ORBIT_MIN_ELEVATION_DEG = -89;
export const ORBIT_MAX_ELEVATION_DEG = 89;
export const ISO_CANONICAL_ELEVATION_DEG = 35.26438968;

export const ORBIT_PRESETS: readonly OrbitPresetDefinition[] = [
  {
    id: "top",
    label: "Superior (2D Plana)",
    shortLabel: "SUP 2D",
    description: "Vista ortogonal de topo a 0° (plano 2D padrão)",
    azimuthDeg: 0,
    elevationDeg: 90,
    group: "planar",
  },
  {
    id: "iso_se",
    label: "Isométrica (SE Padrão)",
    shortLabel: "ISO SE",
    description: "Perspectiva técnica padrão de engenharia (45° / 35.26°)",
    azimuthDeg: 45,
    elevationDeg: ISO_CANONICAL_ELEVATION_DEG,
    group: "isometric",
  },
  {
    id: "iso_sw",
    label: "Isométrica SO",
    shortLabel: "ISO SO",
    description: "Perspectiva isométrica Sudoeste (135° / 35.26°)",
    azimuthDeg: 135,
    elevationDeg: ISO_CANONICAL_ELEVATION_DEG,
    group: "isometric",
  },
  {
    id: "iso_nw",
    label: "Isométrica NO",
    shortLabel: "ISO NO",
    description: "Perspectiva isométrica Noroeste (225° / 35.26°)",
    azimuthDeg: 225,
    elevationDeg: ISO_CANONICAL_ELEVATION_DEG,
    group: "isometric",
  },
  {
    id: "iso_ne",
    label: "Isométrica NE",
    shortLabel: "ISO NE",
    description: "Perspectiva isométrica Nordeste (315° / 35.26°)",
    azimuthDeg: 315,
    elevationDeg: ISO_CANONICAL_ELEVATION_DEG,
    group: "isometric",
  },
  {
    id: "front",
    label: "Frontal",
    shortLabel: "FRONTAL",
    description: "Vista ortogonal frontal (0° / 0°)",
    azimuthDeg: 0,
    elevationDeg: 0,
    group: "orthogonal",
  },
  {
    id: "back",
    label: "Traseira",
    shortLabel: "TRASEIRA",
    description: "Vista ortogonal posterior (180° / 0°)",
    azimuthDeg: 180,
    elevationDeg: 0,
    group: "orthogonal",
  },
  {
    id: "left",
    label: "Esquerda",
    shortLabel: "ESQ",
    description: "Vista lateral esquerda (270° / 0°)",
    azimuthDeg: 270,
    elevationDeg: 0,
    group: "orthogonal",
  },
  {
    id: "right",
    label: "Direita",
    shortLabel: "DIR",
    description: "Vista lateral direita (90° / 0°)",
    azimuthDeg: 90,
    elevationDeg: 0,
    group: "orthogonal",
  },
  {
    id: "bottom",
    label: "Inferior",
    shortLabel: "INF",
    description: "Vista ortogonal inferior (0° / -90°)",
    azimuthDeg: 0,
    elevationDeg: -90,
    group: "orthogonal",
  },
  {
    id: "free",
    label: "Livre / Órbita por Toque",
    shortLabel: "LIVRE",
    description: "Rotação contínua em 360° arrastando na tela",
    azimuthDeg: 45,
    elevationDeg: ISO_CANONICAL_ELEVATION_DEG,
    group: "free",
  },
] as const;

export function getOrbitPresetDefinition(id: OrbitPresetId): OrbitPresetDefinition {
  return ORBIT_PRESETS.find((p) => p.id === id) ?? ORBIT_PRESETS[0]!;
}

/** Normaliza o ângulo de azimute θ para o intervalo [0°, 360°). */
export function normalizeAzimuthDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/** Limita a elevação φ em [-89°, +89°] durante o arraste livre para evitar Gimbal Lock. */
export function clampFreeElevationDeg(deg: number): number {
  if (!Number.isFinite(deg)) return ISO_CANONICAL_ELEVATION_DEG;
  return Math.max(ORBIT_MIN_ELEVATION_DEG, Math.min(ORBIT_MAX_ELEVATION_DEG, deg));
}

/** Limita a elevação φ em [-90°, +90°] incluindo presets polares exatos (Superior/Inferior). */
export function clampPresetElevationDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 90;
  return Math.max(-90, Math.min(90, deg));
}

/**
 * Aplica deltas de arraste de tela (Δx, Δy em pixels) aos ângulos orbitais (θ, φ).
 * - Arraste horizontal rotaciona o Azimute (θ).
 * - Arraste vertical rotaciona a Elevação (φ) com clamp em [-89°, +89°].
 */
export function applyOrbitDragDelta(
  currentAzimuthDeg: number,
  currentElevationDeg: number,
  deltaScreenX: number,
  deltaScreenY: number,
  sensitivityDegPerPx = 0.45,
): { azimuthDeg: number; elevationDeg: number; preset: OrbitPresetId } {
  const s = Number.isFinite(sensitivityDegPerPx) && sensitivityDegPerPx > 0 ? sensitivityDegPerPx : 0.45;
  const nextAzimuth = normalizeAzimuthDeg(currentAzimuthDeg - deltaScreenX * s);
  const nextElevation = clampFreeElevationDeg(currentElevationDeg + deltaScreenY * s);
  return {
    azimuthDeg: nextAzimuth,
    elevationDeg: nextElevation,
    preset: "free",
  };
}

/**
 * Verifica se a câmera está na vista Superior 2D Plana canônica (sem inclinação 3D).
 */
export function isFlatTop2DView(azimuthDeg: number, elevationDeg: number): boolean {
  const normAz = normalizeAzimuthDeg(azimuthDeg);
  const azDist = Math.min(normAz, 360 - normAz);
  return azDist < 0.15 && Math.abs(elevationDeg - 90) < 0.15;
}

/**
 * Detecta se um par (θ, φ) corresponde a alguma vista predefinida conhecida.
 */
export function detectMatchingPreset(azimuthDeg: number, elevationDeg: number): OrbitPresetId {
  if (isFlatTop2DView(azimuthDeg, elevationDeg)) return "top";
  if (Math.abs(elevationDeg + 90) < 0.5) return "bottom";
  const normAz = normalizeAzimuthDeg(azimuthDeg);
  for (const preset of ORBIT_PRESETS) {
    if (preset.id === "free" || preset.id === "top" || preset.id === "bottom") continue;
    const dAz = Math.min(
      Math.abs(normAz - preset.azimuthDeg),
      360 - Math.abs(normAz - preset.azimuthDeg),
    );
    const dEl = Math.abs(elevationDeg - preset.elevationDeg);
    if (dAz <= 1.2 && dEl <= 1.2) {
      return preset.id;
    }
  }
  return "free";
}

/**
 * Calcula o Centro Inteligente da Órbita (Pivô 3D):
 * 1. Se houver seleção ativa -> centro do bounding box da seleção.
 * 2. Caso contrário, se houver entidades no desenho -> centro do bounding box geral da peça.
 * 3. Se o canvas estiver vazio -> origem (0, 0, 0) ou REF 0,0 ativa.
 */
export function computeSmartOrbitPivot(
  entities: Entity[],
  selectedIds: string[],
  temporaryOrigin?: { x: number; y: number } | null,
  sheetThickness = 0,
): OrbitPivot3D {
  const zMid = Number.isFinite(sheetThickness) && sheetThickness > 0 ? sheetThickness * 0.5 : 0;

  if (selectedIds.length > 0) {
    const selSet = new Set(selectedIds);
    const selectedEntities = entities.filter((e) => e && selSet.has(e.id));
    if (selectedEntities.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const ent of selectedEntities) {
        const b = boxOf(ent);
        if (Number.isFinite(b.minX) && b.minX < minX) minX = b.minX;
        if (Number.isFinite(b.maxX) && b.maxX > maxX) maxX = b.maxX;
        if (Number.isFinite(b.minY) && b.minY < minY) minY = b.minY;
        if (Number.isFinite(b.maxY) && b.maxY > maxY) maxY = b.maxY;
      }
      if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
        return {
          x: (minX + maxX) * 0.5,
          y: (minY + maxY) * 0.5,
          z: zMid,
          source: "selection",
        };
      }
    }
  }

  if (entities.length > 0) {
    const b = bbox(entities);
    if (
      b &&
      Number.isFinite(b.minX) &&
      Number.isFinite(b.maxX) &&
      Number.isFinite(b.minY) &&
      Number.isFinite(b.maxY)
    ) {
      return {
        x: (b.minX + b.maxX) * 0.5,
        y: (b.minY + b.maxY) * 0.5,
        z: zMid,
        source: "piece",
      };
    }
  }

  if (temporaryOrigin && Number.isFinite(temporaryOrigin.x) && Number.isFinite(temporaryOrigin.y)) {
    return {
      x: temporaryOrigin.x,
      y: temporaryOrigin.y,
      z: 0,
      source: "origin",
    };
  }

  return { x: 0, y: 0, z: 0, source: "origin" };
}

/**
 * Matriz afim 2D (a, b, c, d, e, f) que projeta o plano de trabalho 2D (X, Y)
 * em torno do pivô (pivot.x, pivot.y) segundo os ângulos de Órbita 3D (θ, φ).
 *
 * Também fornece o vetor de extrusão local (extX, extY) correspondente à espessura Z
 * da chapa na perspectiva atual, garantindo que:
 * - Em (θ=0°, φ=90°): matriz identidade (1, 0, 0, 1, 0, 0) e extrusão (0, 0).
 * - Em qualquer inclinação 3D: matriz invertível com determinante != 0.
 */
export interface WorkplaneOrbitProjection2D {
  isTilted: boolean;
  /** Ângulo de azimute θ atual em graus */
  azimuthDeg?: number;
  /** Ângulo de elevação φ atual em graus */
  elevationDeg?: number;
  /** Coeficientes da matriz 2D SVG/Canvas: [a, b, c, d, e, f] */
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  /** String pronta para atributo transform SVG: `matrix(a b c d e f)` */
  svgMatrix: string;
  /** Vetor de extrusão local (extX, extY) correspondente à espessura Z */
  localExtrusion: Vec2;
  /** Fator de encurtamento vertical efetivo (nunca zero para garantir inversibilidade) */
  effectiveSinElevation: number;
  /** Cosseno da elevação para projeção vertical do eixo Z */
  cosElevation?: number;
  /** Projeta qualquer ponto 3D (x, y, z) em milímetros para o plano projetado 2D do canvas */
  project3DTo2D?: (x: number, y: number, z?: number) => Vec2;
}

const MIN_EFFECTIVE_SIN_ELEVATION = 0.14; // ~8° mínimo visual para evitar colapso degenerado do plano 2D

export function computeWorkplaneOrbitProjection2D(
  azimuthDeg: number,
  elevationDeg: number,
  pivot: { x: number; y: number },
  sheetThickness = 5,
): WorkplaneOrbitProjection2D {
  if (isFlatTop2DView(azimuthDeg, elevationDeg)) {
    return {
      isTilted: false,
      azimuthDeg,
      elevationDeg,
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      svgMatrix: "",
      localExtrusion: { x: 0, y: 0 },
      effectiveSinElevation: 1,
      cosElevation: 0,
      project3DTo2D: (x: number, y: number) => ({ x, y }),
    };
  }

  const alpha = (normalizeAzimuthDeg(azimuthDeg) * Math.PI) / 180;
  const beta = (clampPresetElevationDeg(elevationDeg) * Math.PI) / 180;

  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const rawSinB = Math.sin(beta);
  const cosB = Math.cos(beta);

  const signB = rawSinB < 0 ? -1 : 1;
  const sy = signB * Math.max(MIN_EFFECTIVE_SIN_ELEVATION, Math.abs(rawSinB));

  const px = Number.isFinite(pivot.x) ? pivot.x : 0;
  const py = Number.isFinite(pivot.y) ? pivot.y : 0;

  const a = cosA;
  const b = -sinA * sy;
  const c = sinA;
  const d = cosA * sy;
  const e = px - a * px - c * py;
  const f = py - b * px - d * py;

  const safeThickness = Number.isFinite(sheetThickness) && sheetThickness > 0 ? sheetThickness : 5;
  // Deslocamento vertical de tela para +Z é -safeThickness * cosB.
  // Mapeado de volta ao espaço local antes da matriz [a c; b d]:
  const dvLocal = (-safeThickness * cosB) / sy;
  const extX = -sinA * dvLocal;
  const extY = cosA * dvLocal;

  return {
    isTilted: true,
    azimuthDeg,
    elevationDeg,
    a,
    b,
    c,
    d,
    e,
    f,
    svgMatrix: `matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${e.toFixed(3)} ${f.toFixed(3)})`,
    localExtrusion: { x: extX, y: extY },
    effectiveSinElevation: sy,
    cosElevation: cosB,
    project3DTo2D: (x: number, y: number, z = 0) => ({
      x: a * x + c * y + e,
      y: b * x + d * y + f - (Number.isFinite(z) ? z : 0) * cosB,
    }),
  };
}

/**
 * Projeta um ponto canônico 2D (x, y) do plano de trabalho Z=0 para o espaço projetado 2D.
 */
export function projectWorkplanePointToOrbit2D(
  pt: Vec2,
  azimuthDeg: number,
  elevationDeg: number,
  pivot: { x: number; y: number },
): Vec2 {
  const proj = computeWorkplaneOrbitProjection2D(azimuthDeg, elevationDeg, pivot);
  if (!proj.isTilted) return { x: pt.x, y: pt.y };
  return {
    x: proj.a * pt.x + proj.c * pt.y + proj.e,
    y: proj.b * pt.x + proj.d * pt.y + proj.f,
  };
}

/**
 * Desprojeta um ponto do espaço visual (após pan/zoom da câmera) de volta para as
 * coordenadas canônicas reais (X, Y) no plano de trabalho Z=0.
 * Garante que desenhar ou selecionar com a vista inclinada preserve 100% da precisão métrica.
 */
export function unprojectOrbit2DToWorkplanePoint(
  projectedPt: Vec2,
  azimuthDeg: number,
  elevationDeg: number,
  pivot: { x: number; y: number },
): Vec2 {
  if (isFlatTop2DView(azimuthDeg, elevationDeg)) {
    return { x: projectedPt.x, y: projectedPt.y };
  }

  const alpha = (normalizeAzimuthDeg(azimuthDeg) * Math.PI) / 180;
  const beta = (clampPresetElevationDeg(elevationDeg) * Math.PI) / 180;
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const rawSinB = Math.sin(beta);
  const signB = rawSinB < 0 ? -1 : 1;
  const sy = signB * Math.max(MIN_EFFECTIVE_SIN_ELEVATION, Math.abs(rawSinB));

  const px = Number.isFinite(pivot.x) ? pivot.x : 0;
  const py = Number.isFinite(pivot.y) ? pivot.y : 0;

  const du = projectedPt.x - px;
  const dv = (projectedPt.y - py) / sy;

  return {
    x: px + du * cosA - dv * sinA,
    y: py + du * sinA + dv * cosA,
  };
}

/**
 * Projeta os 3 vetores unitários dos eixos 3D (+X, +Y, +Z) para coordenadas 2D do Gizmo (tela),
 * onde X_screen aponta para a direita, Y_screen aponta para baixo, e Z_depth aponta para fora da tela.
 */
export interface GizmoAxisProjection {
  axis: "X" | "Y" | "Z";
  negAxis: "-X" | "-Y" | "-Z";
  color: string;
  negColor: string;
  /** Coordenadas normalizadas [-1, 1] no plano do Gizmo (x direita, y baixo) */
  dx: number;
  dy: number;
  /** Profundidade z [-1, 1] para ordenação visual (maior = mais próximo do observador) */
  dz: number;
  /** Preset acionado ao clicar na ponta positiva do eixo */
  positivePreset: OrbitPresetId;
  /** Preset acionado ao clicar na ponta negativa do eixo */
  negativePreset: OrbitPresetId;
}

export function computeGizmoAxesProjection(
  azimuthDeg: number,
  elevationDeg: number,
): GizmoAxisProjection[] {
  const alpha = (normalizeAzimuthDeg(azimuthDeg) * Math.PI) / 180;
  const beta = (clampPresetElevationDeg(elevationDeg) * Math.PI) / 180;

  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);

  // No sistema CAD 3D (Z-up, +X direita na vista topo, +Y para cima/frente 3D):
  // Quando θ=0°, φ=90° (Topo): +X -> (+1, 0), +Y -> (0, -1) (para cima na tela), +Z -> (0, 0, +1) (saindo da tela)
  const xAxis: GizmoAxisProjection = {
    axis: "X",
    negAxis: "-X",
    color: "#ef4444",
    negColor: "rgba(239, 68, 68, 0.38)",
    dx: cosA,
    dy: -sinA * sinB,
    dz: -sinA * cosB,
    positivePreset: "right",
    negativePreset: "left",
  };

  const yAxis: GizmoAxisProjection = {
    axis: "Y",
    negAxis: "-Y",
    color: "#22c55e",
    negColor: "rgba(34, 197, 94, 0.38)",
    dx: -sinA,
    dy: -cosA * sinB,
    dz: -cosA * cosB,
  // Clicar em +Y alinha com Frontal/Traseira ortogonal
    positivePreset: "front",
    negativePreset: "back",
  };

  const zAxis: GizmoAxisProjection = {
    axis: "Z",
    negAxis: "-Z",
    color: "#3b82f6",
    negColor: "rgba(59, 130, 246, 0.38)",
    dx: 0,
    dy: -cosB,
    dz: sinB,
    positivePreset: "top",
    negativePreset: "bottom",
  };

  return [xAxis, yAxis, zAxis];
}

/**
 * Interpola suavemente dois ângulos de azimute pelo menor arco em [-180°, +180°].
 */
export function interpolateAzimuthShortestArc(
  startAzimuthDeg: number,
  endAzimuthDeg: number,
  easedT: number,
): number {
  const s = normalizeAzimuthDeg(startAzimuthDeg);
  const e = normalizeAzimuthDeg(endAzimuthDeg);
  let delta = e - s;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeAzimuthDeg(s + delta * easedT);
}

/**
 * Interpola (θ, φ) com a curva cubic-bezier(0.22, 1, 0.36, 1) (350ms).
 */
export function interpolateOrbitAngles(
  startAzimuthDeg: number,
  startElevationDeg: number,
  targetAzimuthDeg: number,
  targetElevationDeg: number,
  linearProgress: number,
): { azimuthDeg: number; elevationDeg: number; easedProgress: number } {
  const clamped = Math.max(0, Math.min(1, linearProgress));
  const eased = cubicBezier022(clamped);
  return {
    azimuthDeg: interpolateAzimuthShortestArc(startAzimuthDeg, targetAzimuthDeg, eased),
    elevationDeg: startElevationDeg + (targetElevationDeg - startElevationDeg) * eased,
    easedProgress: eased,
  };
}
