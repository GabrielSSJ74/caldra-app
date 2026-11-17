import type { Point2D } from "./types";

export interface RotationAngleSnapResult {
  angleDeg: number;
  snapped: boolean;
  snapIncrementDeg: number;
  zone: "magnetic_15" | "step_5" | "free_1";
}

/**
 * Calcula o raio em pixels do anel da Bússola de Rotação Externa 3D
 * garantindo que envolva toda a peça selecionada sem sair da área útil do canvas.
 */
export function computeExternalCompassRadiusPx(
  firstArg: Point2D[] | Point2D,
  secondArg: Point2D | Point2D[],
  canvasWidth = 1280,
  canvasHeight = 800,
): { partRadiusPx: number; compassRadiusPx: number } {
  const projectedVerticesScreen = Array.isArray(firstArg)
    ? firstArg
    : Array.isArray(secondArg)
      ? secondArg
      : [];
  const originScreen = !Array.isArray(firstArg)
    ? firstArg
    : !Array.isArray(secondArg)
      ? secondArg
      : { x: canvasWidth * 0.5, y: canvasHeight * 0.5 };

  let maxDist = 0;
  for (const pt of projectedVerticesScreen) {
    if (!pt) continue;
    const d = Math.hypot(pt.x - originScreen.x, pt.y - originScreen.y);
    if (d > maxDist) maxDist = d;
  }

  const desired = Math.max(88, Math.min(185, maxDist + 28));
  const maxSafeX = Math.max(68, Math.min(originScreen.x - 24, canvasWidth - originScreen.x - 24));
  const maxSafeY = Math.max(68, Math.min(originScreen.y - 24, canvasHeight - originScreen.y - 24));
  const maxSafe = Math.min(185, maxSafeX, maxSafeY);
  const compassRadiusPx = Math.round(Math.max(72, Math.min(desired, maxSafe)));

  return {
    partRadiusPx: Math.round(maxDist),
    compassRadiusPx,
  };
}

/**
 * Calcula o delta angular contínuo em graus entre o ângulo inicial e o vetor atual do ponteiro,
 * com snap magnético adaptativo dependendo da distância radial do cursor ao pivô:
 * - Dentro ou próximo ao anel da bússola: trava magnética nos múltiplos de 15° (0°, 15°, 30°, 45°, 90°...)
 * - Zona intermediária: passos de 5°
 * - Fora do anel (alavanca longa): ajuste fino de 1° em 1°
 */
export function computeRotationDragAngleAndSnap(
  cursorScreen: Point2D,
  originScreen: Point2D,
  startAngleRad: number,
  compassRadiusPx: number,
  magneticToleranceDeg = 2.5,
  shiftFineMode = false,
): RotationAngleSnapResult {
  const dx = cursorScreen.x - originScreen.x;
  const dy = cursorScreen.y - originScreen.y;
  const distPx = Math.hypot(dx, dy);
  const currentRad = Math.atan2(dy, dx);

  let deltaRad = currentRad - startAngleRad;
  while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
  while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;

  const rawDeg = (deltaRad * 180) / Math.PI;

  if (shiftFineMode || distPx > compassRadiusPx + 36) {
    const deg1 = Math.round(rawDeg);
    return {
      angleDeg: deg1,
      snapped: deg1 % 15 === 0,
      snapIncrementDeg: 1,
      zone: "free_1",
    };
  }

  const nearest15 = Math.round(rawDeg / 15) * 15;
  if (Math.abs(rawDeg - nearest15) <= magneticToleranceDeg) {
    return {
      angleDeg: nearest15,
      snapped: true,
      snapIncrementDeg: 15,
      zone: "magnetic_15",
    };
  }

  if (distPx <= compassRadiusPx + 12) {
    const deg5 = Math.round(rawDeg / 5) * 5;
    return {
      angleDeg: deg5,
      snapped: deg5 % 15 === 0,
      snapIncrementDeg: 5,
      zone: "step_5",
    };
  }

  const deg1 = Math.round(rawDeg);
  return {
    angleDeg: deg1,
    snapped: deg1 % 15 === 0,
    snapIncrementDeg: 1,
    zone: "free_1",
  };
}

export const computeRotationAngleWithMagneticSnap = computeRotationDragAngleAndSnap;

/**
 * Calcula o ângulo de corte em esquadria (Miter Cut -60° a +60°) durante arraste radial/angular,
 * com snap magnético em -60°, -45°, -30°, -22.5°, -15°, 0°, +15°, +22.5°, +30°, +45°, +60°.
 */
export function computeMiterDragAngleAndSnap(
  cursorScreen: Point2D,
  originScreen: Point2D,
  startAngleRad: number,
  initialValueDeg = 0,
  magneticToleranceDeg = 2.0,
): { angleDeg: number; snapped: boolean } {
  const dx = cursorScreen.x - originScreen.x;
  const dy = cursorScreen.y - originScreen.y;
  const currentRad = Math.atan2(dy, dx);

  let deltaRad = currentRad - startAngleRad;
  while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
  while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;

  const rawDeg = Math.max(
    -60,
    Math.min(60, initialValueDeg + (deltaRad * 180) / Math.PI),
  );

  const keyMiterAngles = [-60, -45, -30, -22.5, -15, 0, 15, 22.5, 30, 45, 60];
  for (const target of keyMiterAngles) {
    if (Math.abs(rawDeg - target) <= magneticToleranceDeg) {
      return { angleDeg: target, snapped: true };
    }
  }

  return {
    angleDeg: Math.round(rawDeg * 2) / 2,
    snapped: false,
  };
}

/**
 * Constrói o SVG do arco bidirecional curvo de corte em grau (esquadria) e do plano fantasma inclinado.
 */
export function buildDoubleHeadedMiterArcSvg(
  originScreen: Point2D,
  radiusPx = 42,
  liveAngleDeg = 0,
): {
  arcPath: string;
  handlePos: Point2D;
  ghostPlanePoints: string;
} {
  const baseRad = -Math.PI * 0.5;
  const halfSpan = 0.62;
  const a1 = baseRad - halfSpan;
  const a2 = baseRad + halfSpan;

  const x1 = originScreen.x + Math.cos(a1) * radiusPx;
  const y1 = originScreen.y + Math.sin(a1) * radiusPx;
  const x2 = originScreen.x + Math.cos(a2) * radiusPx;
  const y2 = originScreen.y + Math.sin(a2) * radiusPx;

  const arcPath = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radiusPx} ${radiusPx} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;

  const handleAngle = baseRad + (Math.max(-60, Math.min(60, liveAngleDeg)) * Math.PI) / 180 * 0.45;
  const handlePos: Point2D = {
    x: originScreen.x + Math.cos(handleAngle) * radiusPx,
    y: originScreen.y + Math.sin(handleAngle) * radiusPx,
  };

  // Plano fantasma inclinado pelo ângulo atual
  const tiltRad = (liveAngleDeg * Math.PI) / 180;
  const ux = Math.cos(tiltRad) * 26;
  const uy = Math.sin(tiltRad) * 26;
  const vx = -Math.sin(tiltRad) * 14;
  const vy = Math.cos(tiltRad) * 14;

  const p1 = { x: originScreen.x - ux - vx, y: originScreen.y - uy - vy };
  const p2 = { x: originScreen.x + ux - vx, y: originScreen.y + uy - vy };
  const p3 = { x: originScreen.x + ux + vx, y: originScreen.y + uy + vy };
  const p4 = { x: originScreen.x - ux + vx, y: originScreen.y - uy + vy };

  const ghostPlanePoints = [p1, p2, p3, p4]
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return {
    arcPath,
    handlePos,
    ghostPlanePoints,
  };
}

/**
 * Posiciona a alça circular tátil "GIRAR ↻" na bissetriz do maior setor angular livre
 * entre as 3 hastes projetadas (+X, +Y, +Z), evitando qualquer colisão visual.
 */
export function computeViewAlignedRotationHandlePlacement(
  origin: Point2D,
  xTip: Point2D,
  yTip: Point2D,
  zTip: Point2D,
  radiusPx = 58,
): {
  bisectorRad: number;
  handlePos: Point2D;
  startTip: Point2D;
  endTip: Point2D;
  arcPath: string;
} {
  const angles = [
    Math.atan2(xTip.y - origin.y, xTip.x - origin.x),
    Math.atan2(yTip.y - origin.y, yTip.x - origin.x),
    Math.atan2(zTip.y - origin.y, zTip.x - origin.x),
  ].sort((a, b) => a - b);

  let bestGap = -1;
  let bestBisector = -Math.PI * 0.25;

  for (let i = 0; i < angles.length; i++) {
    const a1 = angles[i]!;
    const a2 = i === angles.length - 1 ? angles[0]! + Math.PI * 2 : angles[i + 1]!;
    const gap = a2 - a1;
    if (gap > bestGap) {
      bestGap = gap;
      bestBisector = a1 + gap * 0.5;
    }
  }

  const halfSpan = Math.min(0.38, Math.max(0.22, bestGap * 0.22));
  const aStart = bestBisector - halfSpan;
  const aEnd = bestBisector + halfSpan;

  const handlePos: Point2D = {
    x: origin.x + Math.cos(bestBisector) * radiusPx,
    y: origin.y + Math.sin(bestBisector) * radiusPx,
  };
  const startTip: Point2D = {
    x: origin.x + Math.cos(aStart) * radiusPx,
    y: origin.y + Math.sin(aStart) * radiusPx,
  };
  const endTip: Point2D = {
    x: origin.x + Math.cos(aEnd) * radiusPx,
    y: origin.y + Math.sin(aEnd) * radiusPx,
  };

  const arcPath = `M ${startTip.x.toFixed(1)} ${startTip.y.toFixed(1)} A ${radiusPx} ${radiusPx} 0 0 1 ${endTip.x.toFixed(1)} ${endTip.y.toFixed(1)}`;

  return {
    bisectorRad: bestBisector,
    handlePos,
    startTip,
    endTip,
    arcPath,
  };
}

/**
 * Posiciona o badge flutuante de cota/dimensão ao lado do Gizmo sem sobrepor
 * as pontas +X, +Y ou +Z.
 */
export function computeNonOverlappingGizmoBadgePos(input: {
  origin: Point2D;
  xTip: Point2D;
  yTip: Point2D;
  zTip: Point2D;
  canvasWidth: number;
  canvasHeight: number;
}): { left: number; top: number } {
  const { origin, xTip, yTip, zTip, canvasWidth, canvasHeight } = input;
  const candidates: Array<{ left: number; top: number }> = [
    { left: origin.x + 68, top: origin.y + 38 },
    { left: origin.x - 185, top: origin.y + 38 },
    { left: origin.x + 68, top: origin.y - 68 },
    { left: origin.x - 185, top: origin.y - 68 },
  ];

  const tips = [xTip, yTip, zTip];
  let best = candidates[0]!;
  let bestMinDist = -1;

  for (const c of candidates) {
    const center = { x: c.left + 60, y: c.top + 16 };
    let minD = Infinity;
    for (const t of tips) {
      const d = Math.hypot(center.x - t.x, center.y - t.y);
      if (d < minD) minD = d;
    }
    if (minD > bestMinDist) {
      bestMinDist = minD;
      best = c;
    }
  }

  return {
    left: Math.round(Math.max(12, Math.min(canvasWidth - 190, best.left))),
    top: Math.round(Math.max(54, Math.min(canvasHeight - 96, best.top))),
  };
}

/**
 * Constrói o caminho SVG (`<path d="...">`) do setor angular varrido entre 0° e Δ°.
 */
export function buildCompassSectorPath(
  cx: number,
  cy: number,
  radius: number,
  startAngleRad: number,
  deltaDeg: number,
): { sectorPath: string } {
  if (!Number.isFinite(deltaDeg) || Math.abs(deltaDeg) < 0.5) {
    return { sectorPath: "" };
  }

  const clampedDeg = Math.max(-359.5, Math.min(359.5, deltaDeg));
  const endAngleRad = startAngleRad + (clampedDeg * Math.PI) / 180;

  const x1 = cx + Math.cos(startAngleRad) * radius;
  const y1 = cy + Math.sin(startAngleRad) * radius;
  const x2 = cx + Math.cos(endAngleRad) * radius;
  const y2 = cy + Math.sin(endAngleRad) * radius;

  const largeArcFlag = Math.abs(clampedDeg) > 180 ? 1 : 0;
  const sweepFlag = clampedDeg >= 0 ? 1 : 0;

  const sectorPath = [
    `M ${cx.toFixed(1)} ${cy.toFixed(1)}`,
    `L ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 ${largeArcFlag} ${sweepFlag} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    "Z",
  ].join(" ");

  return { sectorPath };
}
