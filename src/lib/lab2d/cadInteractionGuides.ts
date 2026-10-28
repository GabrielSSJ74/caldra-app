/**
 * CALDRA CHAMFER — MOTOR DE GUIAS DE INTERAÇÃO EXCLUSIVAS:
 *  - "blue_line": Referência de Criação de Linha (Azul — ângulos livres 0° a 360°, L, ∠, ΔX, ΔY)
 *  - "purple_ref": Referência de Ponto de Encontro (Roxa — ΔX, ΔY, d e Cruz '+' roxa pontilhada adaptável)
 *  - "off": Desativadas
 * Inclui prevenção de colisão de bolhas, bloqueio multitouch, animação de fluxo direcional e restrições dimensionais reais.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "./core";

export type InteractionGuideMode = "off" | "purple_ref" | "blue_line";

export type TouchInteractionState =
  | "IDLE"
  | "SINGLE_POINTER"
  | "MULTITOUCH_NAVIGATION"
  | "POST_GESTURE_COOLDOWN";

export type ConstrainableMeasureKind =
  | "L"
  | "angle"
  | "dx"
  | "dy"
  | "d"
  | "offset"
  | "u_along"
  | "radius"
  | "diameter";

export interface DimensionalConstraints {
  lockedL?: number | null;
  lockedAngle?: number | null;
  lockedDx?: number | null;
  lockedDy?: number | null;
  lockedDist?: number | null;
  /** Sinal preservado quando ΔX ou ΔY é fixado (+1 ou -1) */
  signDx?: 1 | -1;
  signDy?: 1 | -1;
}

export interface ConstraintValidationResult {
  valid: boolean;
  conflictMessage?: string;
  updatedConstraints: DimensionalConstraints;
}

export interface GuideBubble {
  id: string;
  kind: ConstrainableMeasureKind;
  text: string;
  value: number;
  locked: boolean;
  /** Posição âncora original no mundo CAD */
  anchor: Vec2;
  /** Posição calculada livre de colisão no mundo CAD */
  pos: Vec2;
  /** Vetor normal preferencial para deslocamento externo */
  normal: Vec2;
  /** Largura estimada no espaço do mundo CAD */
  widthWorld: number;
  /** Altura estimada no espaço do mundo CAD */
  heightWorld: number;
}

const STORAGE_KEY_GUIDE_MODE = "chamfer_interaction_guide_mode";
let memoryGuideModeFallback: InteractionGuideMode = "blue_line";

export const CRIMSON_RED_CENTER = "#DC143C";
export const CRIMSON_RED_RING = "#E11D48";
export const PURPLE_GUIDE_STROKE = "#A855F7";
export const BLUE_GUIDE_STROKE = "#38BDF8";

export const GUIDE_MODE_LABELS: Record<InteractionGuideMode, string> = {
  off: "Desativadas",
  purple_ref: "Referência de Ponto de Encontro",
  blue_line: "Referência de Criação de Linha",
};

export function loadInteractionGuideMode(): InteractionGuideMode {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      const raw = localStorage.getItem(STORAGE_KEY_GUIDE_MODE);
      if (raw === "off" || raw === "purple_ref" || raw === "blue_line") {
        memoryGuideModeFallback = raw;
        return raw;
      }
    }
  } catch {
    // ignore storage errors
  }
  return memoryGuideModeFallback;
}

export function saveInteractionGuideMode(mode: InteractionGuideMode): void {
  memoryGuideModeFallback = mode;
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
      localStorage.setItem(STORAGE_KEY_GUIDE_MODE, mode);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Calcula o ângulo livre técnico em graus [0°, 360°) de basePoint (X0, Y0) para targetPoint (X, Y).
 */
export function computeGuideAngleDeg(basePoint: Vec2, targetPoint: Vec2): number {
  const dx = targetPoint.x - basePoint.x;
  const dy = targetPoint.y - basePoint.y;
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  return (((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360;
}

/**
 * Calcula o deslocamento negativo suave do tracejado (marching ants direcional)
 * para fluir continuamente no sentido de (X0, Y0) -> (X, Y).
 */
export function computeFlowDashOffset(
  timestampMs: number,
  cyclePx = 16,
  speedPxPerMs = 0.035,
): number {
  return -((timestampMs * speedPxPerMs) % cyclePx);
}

/**
 * Valida se um valor e uma trava dimensional são matematicamente compatíveis
 * com as demais restrições já fixadas.
 */
export function validateDimensionalConstraint(
  current: DimensionalConstraints,
  kind: ConstrainableMeasureKind,
  newValue: number,
  lock: boolean,
  currentDelta?: { dx: number; dy: number },
): ConstraintValidationResult {
  const strictlyPositiveKinds: ConstrainableMeasureKind[] = ["L", "d", "radius", "diameter"];
  if (strictlyPositiveKinds.includes(kind) && newValue <= 0) {
    return {
      valid: false,
      conflictMessage: `A medida ${kind.toUpperCase()} deve ser estritamente positiva (> 0 mm).`,
      updatedConstraints: current,
    };
  }

  const next: DimensionalConstraints = { ...current };

  if (!lock) {
    if (kind === "L") next.lockedL = null;
    if (kind === "angle") next.lockedAngle = null;
    if (kind === "dx") next.lockedDx = null;
    if (kind === "dy") next.lockedDy = null;
    if (kind === "d") next.lockedDist = null;
    return { valid: true, updatedConstraints: next };
  }

  if (kind === "angle") {
    const normAngle = ((newValue % 360) + 360) % 360;
    next.lockedAngle = normAngle;
    return { valid: true, updatedConstraints: next };
  }

  const absVal = Math.abs(newValue);
  const hypLocked =
    kind === "L" ? absVal : kind === "d" ? absVal : (next.lockedL ?? next.lockedDist ?? null);
  const dxLocked = kind === "dx" ? absVal : (next.lockedDx ?? null);
  const dyLocked = kind === "dy" ? absVal : (next.lockedDy ?? null);

  // Conflito 1: ΔX fixo maior que comprimento L ou distância d fixa
  if (hypLocked != null && dxLocked != null && dxLocked > hypLocked + 1e-4) {
    return {
      valid: false,
      conflictMessage: `Conflito de restrição: ΔX (${dxLocked.toFixed(1)} mm) não pode ser maior que a distância total fixa (${hypLocked.toFixed(1)} mm).`,
      updatedConstraints: current,
    };
  }

  // Conflito 2: ΔY fixo maior que comprimento L ou distância d fixa
  if (hypLocked != null && dyLocked != null && dyLocked > hypLocked + 1e-4) {
    return {
      valid: false,
      conflictMessage: `Conflito de restrição: ΔY (${dyLocked.toFixed(1)} mm) não pode ser maior que a distância total fixa (${hypLocked.toFixed(1)} mm).`,
      updatedConstraints: current,
    };
  }

  // Conflito 3: ΔX, ΔY e L/d todos fixos simultaneamente mas violando Pitágoras
  if (hypLocked != null && dxLocked != null && dyLocked != null) {
    const expectedHyp = Math.hypot(dxLocked, dyLocked);
    if (Math.abs(expectedHyp - hypLocked) > 0.05) {
      return {
        valid: false,
        conflictMessage: `Conflito de restrição: Com ΔX = ${dxLocked.toFixed(1)} mm e ΔY = ${dyLocked.toFixed(1)} mm fixos, a distância diagonal deve ser ${expectedHyp.toFixed(1)} mm.`,
        updatedConstraints: current,
      };
    }
  }

  if (kind === "L") {
    next.lockedL = absVal;
  } else if (kind === "d") {
    next.lockedDist = absVal;
  } else if (kind === "dx") {
    next.lockedDx = absVal;
    if (newValue < 0) next.signDx = -1;
    else if (currentDelta) next.signDx = currentDelta.dx >= 0 ? 1 : -1;
  } else if (kind === "dy") {
    next.lockedDy = absVal;
    if (newValue < 0) next.signDy = -1;
    else if (currentDelta) next.signDy = currentDelta.dy >= 0 ? 1 : -1;
  }

  return { valid: true, updatedConstraints: next };
}

/**
 * Aplica as restrições dimensionais ativas (L, ∠, ΔX, ΔY, d) sobre a posição atual do ponteiro
 * em relação ao ponto base (Centro de Referência Vermelho Carmesim X0, Y0 ou início da linha).
 */
export function applyDimensionalConstraintsToPoint(
  basePoint: Vec2,
  rawTarget: Vec2,
  constraints: DimensionalConstraints,
): Vec2 {
  const hasL = typeof constraints.lockedL === "number" && constraints.lockedL > 0;
  const hasD = typeof constraints.lockedDist === "number" && constraints.lockedDist > 0;
  const hasAngle =
    typeof constraints.lockedAngle === "number" && Number.isFinite(constraints.lockedAngle);
  const hasDx = typeof constraints.lockedDx === "number" && constraints.lockedDx >= 0;
  const hasDy = typeof constraints.lockedDy === "number" && constraints.lockedDy >= 0;

  if (!hasL && !hasD && !hasAngle && !hasDx && !hasDy) {
    return rawTarget;
  }

  const rawDx = rawTarget.x - basePoint.x;
  const rawDy = rawTarget.y - basePoint.y;
  const signX = rawDx !== 0 ? (rawDx >= 0 ? 1 : -1) : (constraints.signDx ?? 1);
  const signY = rawDy !== 0 ? (rawDy >= 0 ? 1 : -1) : (constraints.signDy ?? 1);

  const hyp = hasL ? constraints.lockedL! : hasD ? constraints.lockedDist! : null;

  // Caso 0: Comprimento/Distância (L ou d) e Ângulo (∠) ambos fixos
  if (hyp !== null && hasAngle) {
    const rad = (constraints.lockedAngle! * Math.PI) / 180;
    return {
      x: basePoint.x + hyp * Math.cos(rad),
      y: basePoint.y - hyp * Math.sin(rad),
    };
  }

  // Caso 1: ΔX e ΔY ambos fixos
  if (hasDx && hasDy) {
    return {
      x: basePoint.x + signX * constraints.lockedDx!,
      y: basePoint.y + signY * constraints.lockedDy!,
    };
  }

  // Caso 2: ΔX fixo e Hipotenusa (L ou d) fixa -> |ΔY| = sqrt(hyp^2 - ΔX^2)
  if (hasDx && hyp !== null) {
    const clampedDx = Math.min(constraints.lockedDx!, hyp);
    const computedDy = Math.sqrt(Math.max(0, hyp * hyp - clampedDx * clampedDx));
    return {
      x: basePoint.x + signX * clampedDx,
      y: basePoint.y + signY * computedDy,
    };
  }

  // Caso 3: ΔY fixo e Hipotenusa (L ou d) fixa -> |ΔX| = sqrt(hyp^2 - ΔY^2)
  if (hasDy && hyp !== null) {
    const clampedDy = Math.min(constraints.lockedDy!, hyp);
    const computedDx = Math.sqrt(Math.max(0, hyp * hyp - clampedDy * clampedDy));
    return {
      x: basePoint.x + signX * computedDx,
      y: basePoint.y + signY * clampedDy,
    };
  }

  // Caso 4: Apenas Ângulo (∠) fixo -> projeta o ponteiro ao longo do raio angular fixo
  if (hasAngle && !hasDx && !hasDy) {
    const rad = (constraints.lockedAngle! * Math.PI) / 180;
    const distRaw = Math.max(1, Math.hypot(rawDx, rawDy));
    return {
      x: basePoint.x + distRaw * Math.cos(rad),
      y: basePoint.y - distRaw * Math.sin(rad),
    };
  }

  // Caso 5: Apenas ΔX fixo (Y permanece livre acompanhando o ponteiro)
  if (hasDx) {
    return {
      x: basePoint.x + signX * constraints.lockedDx!,
      y: rawTarget.y,
    };
  }

  // Caso 6: Apenas ΔY fixo (X permanece livre acompanhando o ponteiro)
  if (hasDy) {
    return {
      x: rawTarget.x,
      y: basePoint.y + signY * constraints.lockedDy!,
    };
  }

  // Caso 7: Apenas comprimento L ou distância d fixos (orientação/ângulo livre)
  if (hyp !== null) {
    const distRaw = Math.hypot(rawDx, rawDy);
    const angle = distRaw > 1e-5 ? Math.atan2(rawDy, rawDx) : 0;
    return {
      x: basePoint.x + hyp * Math.cos(angle),
      y: basePoint.y + hyp * Math.sin(angle),
    };
  }

  return rawTarget;
}

/**
 * Aplica as restrições dimensionais gravadas em uma entidade (ex: linha com L fixo ou ΔX fixo)
 * durante o arraste de um de seus nós/vértices.
 */
export function applyEntityNodeConstraint(
  entity: Entity,
  nodeIndex: number,
  targetPoint: Vec2,
  referenceOrigin?: Vec2 | null,
): { constrainedPoint: Vec2; conflictMessage?: string } {
  const locked = entity.params?.lockedConstraints as DimensionalConstraints | undefined;

  if (entity.type === "line" && locked) {
    const anchor: Vec2 =
      nodeIndex === 0 ? { x: entity.x2, y: entity.y2 } : { x: entity.x1, y: entity.y1 };
    const constrained = applyDimensionalConstraintsToPoint(anchor, targetPoint, locked);
    return { constrainedPoint: constrained };
  }

  if (referenceOrigin && locked) {
    const constrained = applyDimensionalConstraintsToPoint(referenceOrigin, targetPoint, locked);
    return { constrainedPoint: constrained };
  }

  return { constrainedPoint: targetPoint };
}

/**
 * Resolve colisões entre as caixas delimitadoras das bolhas de medidas no canvas,
 * garantindo separação mínima de ~8 px (convertidos para coordenadas do mundo via viewK)
 * e posicionamento externo limpo.
 */
export function resolveBubbleCollisions(
  bubbles: GuideBubble[],
  viewK: number,
): GuideBubble[] {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const minGap = 8 / safeK;

  const placed: GuideBubble[] = bubbles.map((b) => ({
    ...b,
    pos: { ...b.pos },
  }));

  const boxesOverlap = (a: GuideBubble, b: GuideBubble): boolean => {
    const aHalfW = a.widthWorld / 2 + minGap / 2;
    const aHalfH = a.heightWorld / 2 + minGap / 2;
    const bHalfW = b.widthWorld / 2 + minGap / 2;
    const bHalfH = b.heightWorld / 2 + minGap / 2;

    return (
      Math.abs(a.pos.x - b.pos.x) < aHalfW + bHalfW &&
      Math.abs(a.pos.y - b.pos.y) < aHalfH + bHalfH
    );
  };

  // Passadas iterativas para separar bolhas concorrentes
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (!boxesOverlap(a, b)) continue;

        // 1ª tentativa (pass === 0): inverter o lado normal da segunda bolha
        if (pass === 0 && (Math.abs(b.normal.x) > 0.01 || Math.abs(b.normal.y) > 0.01)) {
          const distFromAnchor =
            Math.hypot(b.pos.x - b.anchor.x, b.pos.y - b.anchor.y) || 16 / safeK;
          const flippedPos = {
            x: b.anchor.x - b.normal.x * distFromAnchor,
            y: b.anchor.y - b.normal.y * distFromAnchor,
          };
          const candidateB = { ...b, pos: flippedPos };
          if (!boxesOverlap(a, candidateB)) {
            placed[j] = candidateB;
            continue;
          }
        }

        // 2ª tentativa: afastar verticalmente / horizontalmente preservando proximidade à linha
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const reqX = (a.widthWorld + b.widthWorld) / 2 + minGap;
        const reqY = (a.heightWorld + b.heightWorld) / 2 + minGap;

        const overlapX = reqX - Math.abs(dx);
        const overlapY = reqY - Math.abs(dy);

        if (overlapY <= overlapX) {
          const dirY = dy >= 0 ? 1 : -1;
          b.pos = {
            x: b.pos.x,
            y: b.pos.y + dirY * (overlapY + 2 / safeK),
          };
        } else {
          const dirX = dx >= 0 ? 1 : -1;
          b.pos = {
            x: b.pos.x + dirX * (overlapX + 2 / safeK),
            y: b.pos.y,
          };
        }
      }
    }
  }

  return placed;
}
