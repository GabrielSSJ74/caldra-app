/**
 * CALDRA — CHAMFER CAD (2D/3D)
 * SISTEMA DE ZOOM E PAN ADAPTATIVOS POR ESCALA E PROXIMIDADE + PROTEÇÃO ANTI-ESBARRÃO
 *
 * Responsabilidades:
 * 1. Cálculo da dimensão característica (`raioCaracteristico = Math.max(boundingSphere.radius, 10)`)
 *    da peça ativa (selecionada) ou do conjunto visível na cena.
 * 2. Distância normalizada câmera-peça (`distanciaNormalizada = d_cam / raioCaracteristico`) e curva
 *    contínua de atenuação (`fatorAdaptativo = clamp(distanciaNormalizada ^ 0.45, 0.04, 1.25)`).
 * 3. Proteção Anti-Esbarrão (Micro-Touch Deadzone de 6px e 60ms + Clamp de velocidade por frame
 *    de ±3.0% no zoom e 10% do campo visível no pan quando `distanciaNormalizada < 0.8`).
 * 4. Ancoragem focal exata no ponto médio entre 2 dedos e persistência da Sensibilidade de Zoom
 *    do usuário (`Baixa 0.6x`, `Média 1.0x`, `Alta 1.4x` e slider customizado `0.3x .. 2.0x`).
 */

import { bbox, type Entity } from "./core";
import type { DirectBody3D } from "./cadDirectModeling3D";

export const ZOOM_SENSITIVITY_STORAGE_KEY = "caldra_chamfer_zoom_sensitivity_v1";

/** Zona morta inicial de pinça em pixels CSS para ignorar micro-oscilações ao apoiar 2 dedos */
export const PINCH_DEADZONE_PX = 6;

/** Duração mínima de contato (ms) para validar início de pinça e ignorar esbarrões acidentais */
export const MIN_PINCH_TOUCH_DURATION_MS = 60;

/** Limiar de distância normalizada abaixo do qual a câmera está em Close-Up de Detalhe */
export const CLOSE_UP_NORMALIZED_DISTANCE_THRESHOLD = 0.8;

/** Variação máxima de zoom permitida por frame em Close-Up (±3.0%) */
export const CLOSE_UP_MAX_ZOOM_RATIO_STEP = 0.03;

/** Deslocamento máximo de Pan permitido por frame em Close-Up (10% do campo visível atual) */
export const CLOSE_UP_MAX_PAN_FIELD_FRACTION = 0.1;

export type ZoomSensitivityPresetId = "low" | "medium" | "high" | "custom";

export interface ZoomSensitivityConfig {
  preset: ZoomSensitivityPresetId;
  multiplier: number;
}

export const ZOOM_SENSITIVITY_PRESETS: ReadonlyArray<{
  id: Exclude<ZoomSensitivityPresetId, "custom">;
  label: string;
  shortLabel: string;
  multiplier: number;
}> = [
  { id: "low", label: "Baixa (0.6x)", shortLabel: "Baixa", multiplier: 0.6 },
  { id: "medium", label: "Média (1.0x)", shortLabel: "Média", multiplier: 1.0 },
  { id: "high", label: "Alta (1.4x)", shortLabel: "Alta", multiplier: 1.4 },
];

export const DEFAULT_ZOOM_SENSITIVITY_CONFIG: ZoomSensitivityConfig = {
  preset: "medium",
  multiplier: 1.0,
};

function clampNum(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function sanitizeZoomSensitivityConfig(
  raw: Partial<ZoomSensitivityConfig> | null | undefined,
): ZoomSensitivityConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_ZOOM_SENSITIVITY_CONFIG };
  }
  const mult = clampNum(Number(raw.multiplier ?? 1.0), 0.3, 2.0);
  const presetCandidate = raw.preset;
  if (presetCandidate === "low" && Math.abs(mult - 0.6) < 0.02) {
    return { preset: "low", multiplier: 0.6 };
  }
  if (presetCandidate === "medium" && Math.abs(mult - 1.0) < 0.02) {
    return { preset: "medium", multiplier: 1.0 };
  }
  if (presetCandidate === "high" && Math.abs(mult - 1.4) < 0.02) {
    return { preset: "high", multiplier: 1.4 };
  }
  if (Math.abs(mult - 0.6) < 0.005) return { preset: "low", multiplier: 0.6 };
  if (Math.abs(mult - 1.0) < 0.005) return { preset: "medium", multiplier: 1.0 };
  if (Math.abs(mult - 1.4) < 0.005) return { preset: "high", multiplier: 1.4 };
  return {
    preset: "custom",
    multiplier: Number(mult.toFixed(2)),
  };
}

export function loadZoomSensitivityConfig(
  storage?: Pick<Storage, "getItem"> | null,
): ZoomSensitivityConfig {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : null;
    if (!targetStorage) {
      return { ...DEFAULT_ZOOM_SENSITIVITY_CONFIG };
    }
    const stored = targetStorage.getItem(ZOOM_SENSITIVITY_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_ZOOM_SENSITIVITY_CONFIG };
    const parsed = JSON.parse(stored) as Partial<ZoomSensitivityConfig>;
    return sanitizeZoomSensitivityConfig(parsed);
  } catch {
    return { ...DEFAULT_ZOOM_SENSITIVITY_CONFIG };
  }
}

export function saveZoomSensitivityConfig(
  config: ZoomSensitivityConfig,
  storage?: Pick<Storage, "setItem"> | null,
): ZoomSensitivityConfig {
  const clean = sanitizeZoomSensitivityConfig(config);
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : null;
    if (targetStorage) {
      targetStorage.setItem(ZOOM_SENSITIVITY_STORAGE_KEY, JSON.stringify(clean));
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent("chamfer-zoom-sensitivity-changed", { detail: clean }),
        );
      }
    }
  } catch {
    // Ignora falhas de quota / modo privado
  }
  return clean;
}

/**
 * Calcula o raio característico (`boundingSphere.radius` em mm, mínimo 10 mm)
 * da peça ativa (selecionada) ou do conjunto visível (3D ou 2D).
 */
export function computeCharacteristicPartRadiusMm(params: {
  bodies3D?: readonly DirectBody3D[];
  selectedBodyIds?: readonly string[];
  entities2D?: readonly Entity[];
  selectedEntityIds?: readonly string[];
  defaultThicknessMm?: number;
}): number {
  const {
    bodies3D,
    selectedBodyIds,
    entities2D,
    selectedEntityIds,
    defaultThicknessMm = 20,
  } = params;

  // 1. Prioridade para Corpos 3D reais quando presentes
  if (bodies3D && bodies3D.length > 0) {
    const selSet =
      selectedBodyIds && selectedBodyIds.length > 0 ? new Set(selectedBodyIds) : null;
    const targetBodies = selSet
      ? bodies3D.filter((b) => selSet.has(b.bodyId) || selSet.has(b.entityId))
      : bodies3D;
    const list = targetBodies.length > 0 ? targetBodies : bodies3D;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const b of list) {
      if (b.bbox3D.minX < minX) minX = b.bbox3D.minX;
      if (b.bbox3D.maxX > maxX) maxX = b.bbox3D.maxX;
      if (b.bbox3D.minY < minY) minY = b.bbox3D.minY;
      if (b.bbox3D.maxY > maxY) maxY = b.bbox3D.maxY;
      if (b.bbox3D.minZ < minZ) minZ = b.bbox3D.minZ;
      if (b.bbox3D.maxZ > maxZ) maxZ = b.bbox3D.maxZ;
    }

    if (Number.isFinite(minX) && Number.isFinite(maxX)) {
      const dx = Math.max(0, maxX - minX);
      const dy = Math.max(0, maxY - minY);
      const dz = Math.max(0, maxZ - minZ);
      const radius = 0.5 * Math.hypot(dx, dy, dz);
      return Math.max(radius, 10);
    }
  }

  // 2. Entidades 2D + espessura/extrusão quando em Sketch 2D ou cena 2D/3D unificada
  if (entities2D && entities2D.length > 0) {
    const selEntSet =
      selectedEntityIds && selectedEntityIds.length > 0 ? new Set(selectedEntityIds) : null;
    const filtered = selEntSet
      ? entities2D.filter((e) => selEntSet.has(e.id))
      : entities2D;
    const targetEnts = filtered.length > 0 ? filtered : entities2D;
    const b2 = bbox(targetEnts as Entity[]);
    if (b2) {
      const dx = Math.max(0, b2.maxX - b2.minX);
      const dy = Math.max(0, b2.maxY - b2.minY);
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const e of targetEnts) {
        const ez = Number(e.elevationZ ?? e.params?.elevationZ ?? 0) || 0;
        const eh =
          Number(
            e.extrudeHeight ??
              e.params?.extrudeHeightMm ??
              e.params?.extrudeHeight ??
              defaultThicknessMm,
          ) || defaultThicknessMm;
        if (ez < minZ) minZ = ez;
        if (ez + eh > maxZ) maxZ = ez + eh;
      }
      const dz = Number.isFinite(minZ) && Number.isFinite(maxZ) ? Math.max(0, maxZ - minZ) : defaultThicknessMm;
      const radius = 0.5 * Math.hypot(dx, dy, dz);
      return Math.max(radius, 10);
    }
  }

  // Fallback seguro quando o canvas está vazio (ex.: folha 200mm -> raio ~100mm)
  return 100;
}

export interface AdaptiveZoomMetrics {
  characteristicRadiusMm: number;
  cameraDistanceMm: number;
  visibleWidthMm: number;
  visibleHeightMm: number;
  normalizedDistance: number;
  adaptiveFactor: number;
  userSensitivityMultiplier: number;
  effectiveMultiplier: number;
  isCloseUp: boolean;
}

/**
 * Calcula `distanciaNormalizada = d_cam / raioCaracteristico` e
 * `fatorAdaptativo = clamp(Math.pow(distanciaNormalizada, 0.45), 0.04, 1.25)`.
 */
export function computeAdaptiveZoomMetrics(params: {
  characteristicRadiusMm: number;
  viewK?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
  directCameraDistanceMm?: number;
  fovDeg?: number;
  userSensitivityMultiplier?: number;
}): AdaptiveZoomMetrics {
  const characteristicRadiusMm = Math.max(params.characteristicRadiusMm || 10, 10);
  const wPx = Math.max(10, params.viewportWidthPx ?? 800);
  const hPx = Math.max(10, params.viewportHeightPx ?? 600);
  const safeK = Math.max(1e-4, params.viewK ?? 1);
  const fovDeg = clampNum(params.fovDeg ?? 38, 10, 120);

  const visibleWidthMm = Math.max(0.1, wPx / safeK);
  const visibleHeightMm = Math.max(0.1, hPx / safeK);

  const halfFovRad = (fovDeg * Math.PI) / 360;
  const orthoEquivalentCamDistMm =
    (visibleHeightMm * 0.5) / Math.max(0.05, Math.tan(halfFovRad));

  const cameraDistanceMm = Math.max(
    0.05,
    params.directCameraDistanceMm !== undefined && Number.isFinite(params.directCameraDistanceMm)
      ? params.directCameraDistanceMm
      : orthoEquivalentCamDistMm,
  );

  const normalizedDistance = cameraDistanceMm / characteristicRadiusMm;
  const adaptiveFactor = clampNum(
    Math.pow(Math.max(1e-6, normalizedDistance), 0.45),
    0.04,
    1.25,
  );
  const userSensitivityMultiplier = clampNum(params.userSensitivityMultiplier ?? 1.0, 0.3, 2.0);
  const effectiveMultiplier = clampNum(
    adaptiveFactor * userSensitivityMultiplier,
    0.012,
    2.5,
  );
  const isCloseUp = normalizedDistance < CLOSE_UP_NORMALIZED_DISTANCE_THRESHOLD;

  return {
    characteristicRadiusMm,
    cameraDistanceMm,
    visibleWidthMm,
    visibleHeightMm,
    normalizedDistance,
    adaptiveFactor,
    userSensitivityMultiplier,
    effectiveMultiplier,
    isCloseUp,
  };
}

export interface AdaptiveZoomStepEvaluation {
  appliedZoomRatio: number;
  blockedByDeadzone: boolean;
  unlockedNow: boolean;
  clampedByCloseUp: boolean;
}

/**
 * Avalia um passo multiplicativo de Zoom (`rawZoomRatio`) aplicando:
 * 1. Zona morta de micro-toque (`< 6px` ou `< 60ms`) antes do destravamento da pinça;
 * 2. Modulação exponencial contínua por `fatorAdaptativo * multiplicadorSensibilidadeUsuario`;
 * 3. Clamp de velocidade máxima por frame (`±3.0%`) quando `distanciaNormalizada < 0.8`.
 */
export function evaluateAdaptiveZoomStep(params: {
  rawZoomRatio: number;
  metrics: AdaptiveZoomMetrics;
  isPinchGesture?: boolean;
  pinchDeltaPxFromStart?: number;
  touchElapsedMs?: number;
  pinchUnlocked?: boolean;
}): AdaptiveZoomStepEvaluation {
  const {
    rawZoomRatio,
    metrics,
    isPinchGesture = false,
    pinchDeltaPxFromStart,
    touchElapsedMs,
    pinchUnlocked = true,
  } = params;

  if (!Number.isFinite(rawZoomRatio) || rawZoomRatio <= 0) {
    return {
      appliedZoomRatio: 1.0,
      blockedByDeadzone: false,
      unlockedNow: pinchUnlocked,
      clampedByCloseUp: false,
    };
  }

  // 1. Proteção Anti-Esbarrão: Zona Morta de Micro-Toque na Pinça
  if (isPinchGesture && !pinchUnlocked) {
    const tooFast = touchElapsedMs !== undefined && touchElapsedMs < MIN_PINCH_TOUCH_DURATION_MS;
    const withinDeadzone =
      pinchDeltaPxFromStart !== undefined && Math.abs(pinchDeltaPxFromStart) < PINCH_DEADZONE_PX;
    if (tooFast || withinDeadzone) {
      return {
        appliedZoomRatio: 1.0,
        blockedByDeadzone: true,
        unlockedNow: false,
        clampedByCloseUp: false,
      };
    }
  }

  // 2. Modulação exponencial proporcional à escala e proximidade da peça
  const safeRaw = clampNum(rawZoomRatio, 0.2, 5.0);
  let adaptedRatio = Math.exp(Math.log(safeRaw) * metrics.effectiveMultiplier);

  // 3. Clamp de velocidade máxima por frame em Close-Up (< 0.8x raio característico)
  let clampedByCloseUp = false;
  if (metrics.isCloseUp) {
    const minClose = 1 - CLOSE_UP_MAX_ZOOM_RATIO_STEP; // 0.97
    const maxClose = 1 + CLOSE_UP_MAX_ZOOM_RATIO_STEP; // 1.03
    if (adaptedRatio < minClose || adaptedRatio > maxClose) {
      clampedByCloseUp = true;
      adaptedRatio = clampNum(adaptedRatio, minClose, maxClose);
    }
  } else {
    adaptedRatio = clampNum(adaptedRatio, 0.5, 2.0);
  }

  return {
    appliedZoomRatio: adaptedRatio,
    blockedByDeadzone: false,
    unlockedNow: true,
    clampedByCloseUp,
  };
}

export interface AdaptivePanStepEvaluation {
  appliedDeltaPxX: number;
  appliedDeltaPxY: number;
  clampedByCloseUp: boolean;
}

/**
 * Avalia um deslocamento de Pan em pixels aplicando atenuação suave em close-up
 * e limitando o salto máximo por frame a 10% do campo visível atual quando `distanciaNormalizada < 0.8`.
 */
export function evaluateAdaptivePanStep(params: {
  rawDeltaPxX: number;
  rawDeltaPxY: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  metrics: AdaptiveZoomMetrics;
  modulateByAdaptiveFactor?: boolean;
}): AdaptivePanStepEvaluation {
  const {
    rawDeltaPxX,
    rawDeltaPxY,
    viewportWidthPx,
    viewportHeightPx,
    metrics,
    modulateByAdaptiveFactor = false,
  } = params;

  const wPx = Math.max(10, viewportWidthPx || 800);
  const hPx = Math.max(10, viewportHeightPx || 600);

  // No Pan 1:1 com o dedo em vista aberta mantemos aderência natural ao dedo, mas em close-up
  // ou quando solicitado modulamos suavemente para impedir que um esbarrão lance a peça para fora da tela
  const panScale = modulateByAdaptiveFactor
    ? clampNum(metrics.effectiveMultiplier, 0.15, 1.35)
    : metrics.isCloseUp
      ? clampNum(0.35 + 0.65 * metrics.adaptiveFactor, 0.25, 1.0) *
        clampNum(metrics.userSensitivityMultiplier, 0.5, 1.5)
      : 1.0;

  let dx = (Number.isFinite(rawDeltaPxX) ? rawDeltaPxX : 0) * panScale;
  let dy = (Number.isFinite(rawDeltaPxY) ? rawDeltaPxY : 0) * panScale;

  let clampedByCloseUp = false;
  if (metrics.isCloseUp) {
    const maxDx = wPx * CLOSE_UP_MAX_PAN_FIELD_FRACTION;
    const maxDy = hPx * CLOSE_UP_MAX_PAN_FIELD_FRACTION;
    if (Math.abs(dx) > maxDx || Math.abs(dy) > maxDy) {
      clampedByCloseUp = true;
      dx = clampNum(dx, -maxDx, maxDx);
      dy = clampNum(dy, -maxDy, maxDy);
    }
  }

  return {
    appliedDeltaPxX: dx,
    appliedDeltaPxY: dy,
    clampedByCloseUp,
  };
}

export interface PinchGestureSessionState {
  initialDist: number;
  prevDist: number;
  initialMidX: number;
  initialMidY: number;
  prevMidX: number;
  prevMidY: number;
  startTimeMs: number;
  unlockedZoom: boolean;
  unlockedPan: boolean;
}

export function createPinchGestureSessionState(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  nowMs: number,
): PinchGestureSessionState {
  const d = Math.hypot(bx - ax, by - ay) || 1;
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  return {
    initialDist: d,
    prevDist: d,
    initialMidX: mx,
    initialMidY: my,
    prevMidX: mx,
    prevMidY: my,
    startTimeMs: nowMs,
    unlockedZoom: false,
    unlockedPan: false,
  };
}

/**
 * Verifica se um elemento DOM pertence a controles/barras de HUD flutuantes,
 * impedindo que toques em menus/cards/botões vazem para o zoom/pan do canvas.
 */
export function isHudInteractiveElement(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as Element;
  return Boolean(
    el.closest(
      'button, input, select, textarea, a, label, [role="button"], [role="dialog"], [role="menu"], [role="slider"], [data-chamfer-hud="true"], [data-testid*="popover"], [data-testid*="panel"], [data-testid*="quick-bar"]',
    ),
  );
}
