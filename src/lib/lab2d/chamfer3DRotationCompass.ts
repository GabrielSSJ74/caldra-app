export interface ScreenPt2D {
  x: number;
  y: number;
}

export interface ExternalCompassMetrics {
  partRadiusPx: number;
  compassRadiusPx: number;
}

export interface RotationSnapResult {
  rawAngleDeg: number;
  angleDeg: number;
  snapped: boolean;
  snappedKeyDeg: number | null;
  isFineOuterZone: boolean;
  currentAngleRad: number;
}

export const KEY_ROTATION_SNAP_ANGLES_DEG: readonly number[] = [
  -270, -180, -165, -150, -135, -120, -105, -90, -75, -60, -45, -30, -15, 0,
  15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 270,
];

/**
 * Calcula o raio externo dinâmico da Bússola de Rotação 3D (estilo Shapr3D),
 * garantindo que envolva toda a peça selecionada pelo lado de fora
 * com `partRadiusPx + 36px` (mínimo de 125px).
 */
export function computeExternalCompassRadiusPx(
  partPointsScreen: readonly ScreenPt2D[],
  pivotScreen: ScreenPt2D,
  viewportWidth: number,
  viewportHeight: number,
): ExternalCompassMetrics {
  let maxDistPx = 0;
  for (const pt of partPointsScreen) {
    const d = Math.hypot(pt.x - pivotScreen.x, pt.y - pivotScreen.y);
    if (Number.isFinite(d) && d > maxDistPx) {
      maxDistPx = d;
    }
  }

  const partRadiusPx = Math.round(maxDistPx);
  const desiredRadiusPx = Math.max(125, partRadiusPx + 36);

  // Limita suavemente à área visível do canvas quando o pivô está próximo das bordas,
  // mantendo sempre o mínimo de 125px.
  const marginPx = 28;
  const maxAvailX = Math.max(
    125,
    Math.min(pivotScreen.x - marginPx, viewportWidth - pivotScreen.x - marginPx),
  );
  const maxAvailY = Math.max(
    125,
    Math.min(pivotScreen.y - marginPx, viewportHeight - pivotScreen.y - marginPx),
  );
  const maxViewportRadius = Math.max(125, Math.min(maxAvailX, maxAvailY, 360));

  const compassRadiusPx = Math.max(125, Math.min(desiredRadiusPx, maxViewportRadius));

  return {
    partRadiusPx,
    compassRadiusPx: Math.round(compassRadiusPx),
  };
}

/**
 * Normaliza uma diferença angular em radianos para o intervalo [-180°, +180°].
 */
export function normalizeDeltaAngleDeg(deltaRad: number): number {
  let deg = (deltaRad * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

/**
 * Calcula o ângulo de giro em tempo real com snaps magnéticos suaves (±2.5°)
 * nos ângulos-chave (0°, ±15°, ±30°, ±45°, ±60°, ±90°, ±135°, ±180°, ±270°)
 * e rotação livre de 1° em 1° quando o dedo é afastado para fora da bússola.
 */
export function computeRotationDragAngleAndSnap(
  pointerScreen: ScreenPt2D,
  pivotScreen: ScreenPt2D,
  angleStartRad: number,
  compassRadiusPx: number,
  snapToleranceDeg = 2.5,
): RotationSnapResult {
  const dx = pointerScreen.x - pivotScreen.x;
  const dy = pointerScreen.y - pivotScreen.y;
  const pointerDistPx = Math.hypot(dx, dy);
  const currentAngleRad = Math.atan2(dy, dx);
  const rawAngleDeg = normalizeDeltaAngleDeg(currentAngleRad - angleStartRad);

  // Se o usuário afastar o dedo significativamente além da borda externa da bússola,
  // permite ajuste fino livre de 1° em 1°.
  const isFineOuterZone = pointerDistPx > compassRadiusPx + 54;

  if (!isFineOuterZone) {
    let bestSnap: number | null = null;
    let bestDiff = Infinity;
    for (const candidateDeg of KEY_ROTATION_SNAP_ANGLES_DEG) {
      const diff = Math.abs(rawAngleDeg - candidateDeg);
      if (diff <= snapToleranceDeg && diff < bestDiff) {
        bestDiff = diff;
        bestSnap = candidateDeg;
      }
    }
    if (bestSnap !== null) {
      return {
        rawAngleDeg,
        angleDeg: bestSnap,
        snapped: true,
        snappedKeyDeg: bestSnap,
        isFineOuterZone: false,
        currentAngleRad: angleStartRad + (bestSnap * Math.PI) / 180,
      };
    }
  }

  const roundedDeg = Math.round(rawAngleDeg);
  return {
    rawAngleDeg,
    angleDeg: Object.is(roundedDeg, -0) ? 0 : roundedDeg,
    snapped: false,
    snappedKeyDeg: null,
    isFineOuterZone,
    currentAngleRad: angleStartRad + (roundedDeg * Math.PI) / 180,
  };
}

/**
 * Constrói o caminho SVG (path `d`) para o setor angular preenchido e arco ativo da bússola.
 */
export function buildCompassSectorPath(
  pivotX: number,
  pivotY: number,
  radiusPx: number,
  startAngleRad: number,
  deltaAngleDeg: number,
): { sectorPath: string; arcPath: string; endPoint: ScreenPt2D; midLabelPoint: ScreenPt2D } {
  const clampedDeg = Math.max(-359.9, Math.min(359.9, deltaAngleDeg));
  const deltaRad = (clampedDeg * Math.PI) / 180;
  const endAngleRad = startAngleRad + deltaRad;

  const startX = pivotX + Math.cos(startAngleRad) * radiusPx;
  const startY = pivotY + Math.sin(startAngleRad) * radiusPx;
  const endX = pivotX + Math.cos(endAngleRad) * radiusPx;
  const endY = pivotY + Math.sin(endAngleRad) * radiusPx;

  const midAngleRad = startAngleRad + deltaRad * 0.5;
  const midLabelPoint: ScreenPt2D = {
    x: pivotX + Math.cos(midAngleRad) * (radiusPx + 26),
    y: pivotY + Math.sin(midAngleRad) * (radiusPx + 26),
  };

  if (Math.abs(clampedDeg) < 0.25) {
    return {
      sectorPath: "",
      arcPath: "",
      endPoint: { x: startX, y: startY },
      midLabelPoint: {
        x: pivotX + Math.cos(startAngleRad) * (radiusPx + 26),
        y: pivotY + Math.sin(startAngleRad) * (radiusPx + 26),
      },
    };
  }

  const largeArcFlag = Math.abs(clampedDeg) > 180 ? 1 : 0;
  const sweepFlag = clampedDeg >= 0 ? 1 : 0;

  const arcPath = `M ${startX.toFixed(1)} ${startY.toFixed(1)} A ${radiusPx} ${radiusPx} 0 ${largeArcFlag} ${sweepFlag} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  const sectorPath = `M ${pivotX.toFixed(1)} ${pivotY.toFixed(1)} L ${startX.toFixed(1)} ${startY.toFixed(1)} A ${radiusPx} ${radiusPx} 0 ${largeArcFlag} ${sweepFlag} ${endX.toFixed(1)} ${endY.toFixed(1)} Z`;

  return {
    sectorPath,
    arcPath,
    endPoint: { x: endX, y: endY },
    midLabelPoint,
  };
}

export interface NonOverlappingGizmoBadgeInput {
  origin: ScreenPt2D;
  xTip: ScreenPt2D;
  yTip: ScreenPt2D;
  zTip: ScreenPt2D;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Posiciona o badge lateral de cota (`0.0 mm` / `Espelhar ⇄`) fora do envelope das
 * 3 pontas de seta (+X, +Y, +Z), evitando qualquer sobreposição com a seta vermelha +X ou azul +Z.
 */
export function computeNonOverlappingGizmoBadgePos(
  originOrOpts: ScreenPt2D | NonOverlappingGizmoBadgeInput,
  xTipArg?: ScreenPt2D,
  yTipArg?: ScreenPt2D,
  zTipArg?: ScreenPt2D,
  viewportWidthArg?: number,
  viewportHeightArg?: number,
): { left: number; top: number } {
  const isOpts = "origin" in originOrOpts;
  const origin = isOpts ? originOrOpts.origin : originOrOpts;
  const xTip = isOpts ? originOrOpts.xTip : (xTipArg ?? origin);
  const yTip = isOpts ? originOrOpts.yTip : (yTipArg ?? origin);
  const zTip = isOpts ? originOrOpts.zTip : (zTipArg ?? origin);
  const viewportWidth = isOpts ? originOrOpts.canvasWidth : (viewportWidthArg ?? 800);
  const viewportHeight = isOpts ? originOrOpts.canvasHeight : (viewportHeightArg ?? 600);

  const maxRightX = Math.max(origin.x, xTip.x, yTip.x, zTip.x);
  const minTopY = Math.min(origin.y, xTip.y, yTip.y, zTip.y);

  // Coloca 26px à direita da ponta mais à direita (+X/+Y) e alinhado acima da origem,
  // nunca sobrepondo o círculo +Z nem a ponta vermelha +X.
  const preferredLeft = maxRightX + 26;
  const preferredTop = Math.min(origin.y - 38, minTopY + 4);

  const clampedLeft = Math.max(16, Math.min(viewportWidth - 188, Math.round(preferredLeft)));
  const clampedTop = Math.max(54, Math.min(viewportHeight - 96, Math.round(preferredTop)));

  return { left: clampedLeft, top: clampedTop };
}

export const KEY_MITER_SNAP_ANGLES_DEG: readonly number[] = [
  -45, -30, -22.5, -15, 0, 15, 22.5, 30, 45,
];

export interface MiterDragSnapResult {
  rawAngleDeg: number;
  angleDeg: number;
  snapped: boolean;
  snappedKeyDeg: number | null;
}

/**
 * Calcula o ângulo de Corte em Grau / Meia-Esquadria em tempo real durante o arraste
 * da Seta Curva Bidirecional, com snaps suaves em:
 * `-45°, -30°, -22.5°, -15°, 0°, +15°, +22.5°, +30°, +45°`
 * e limite seguro `[-60°, +60°]`.
 */
export function computeMiterDragAngleAndSnap(
  pointerScreen: ScreenPt2D,
  pivotScreen: ScreenPt2D,
  angleStartRad: number,
  initialMiterDeg = 0,
  snapToleranceDeg = 2.0,
): MiterDragSnapResult {
  const dx = pointerScreen.x - pivotScreen.x;
  const dy = pointerScreen.y - pivotScreen.y;
  const currentAngleRad = Math.atan2(dy, dx);
  const deltaDeg = normalizeDeltaAngleDeg(currentAngleRad - angleStartRad);
  const rawAngleDeg = Math.max(-60, Math.min(60, initialMiterDeg + deltaDeg));

  let bestSnap: number | null = null;
  let bestDiff = Infinity;
  for (const candidateDeg of KEY_MITER_SNAP_ANGLES_DEG) {
    const diff = Math.abs(rawAngleDeg - candidateDeg);
    if (diff <= snapToleranceDeg && diff < bestDiff) {
      bestDiff = diff;
      bestSnap = candidateDeg;
    }
  }

  if (bestSnap !== null) {
    return {
      rawAngleDeg,
      angleDeg: bestSnap,
      snapped: true,
      snappedKeyDeg: bestSnap,
    };
  }

  const rounded = Math.round(rawAngleDeg * 2) / 2;
  return {
    rawAngleDeg,
    angleDeg: Object.is(rounded, -0) ? 0 : rounded,
    snapped: false,
    snappedKeyDeg: null,
  };
}

/**
 * Constrói a geometria SVG da Seta Curva Bidirecional Interativa (Arco com pontas duplas,
 * pega circular central de arraste e plano fantasma translúcido de corte em grau).
 */
export function buildDoubleHeadedMiterArcSvg(
  origin: ScreenPt2D,
  radiusPx = 42,
  currentAngleDeg = 0,
): {
  arcPath: string;
  negTip: ScreenPt2D;
  posTip: ScreenPt2D;
  handlePos: ScreenPt2D;
  ghostPlanePoints: string;
} {
  // Arco superior de -148° a -32° (centrado em -90° / topo da face/aresta)
  const startRad = (-148 * Math.PI) / 180;
  const endRad = (-32 * Math.PI) / 180;
  const negTip: ScreenPt2D = {
    x: origin.x + Math.cos(startRad) * radiusPx,
    y: origin.y + Math.sin(startRad) * radiusPx,
  };
  const posTip: ScreenPt2D = {
    x: origin.x + Math.cos(endRad) * radiusPx,
    y: origin.y + Math.sin(endRad) * radiusPx,
  };
  const arcPath = `M ${negTip.x.toFixed(1)} ${negTip.y.toFixed(1)} A ${radiusPx} ${radiusPx} 0 0 1 ${posTip.x.toFixed(1)} ${posTip.y.toFixed(1)}`;

  // Pega circular central que desliza ao longo do arco conforme o ângulo [-60°, +60°]
  const clamped = Math.max(-60, Math.min(60, currentAngleDeg));
  const handleRad = ((-90 + (clamped / 60) * 52) * Math.PI) / 180;
  const handlePos: ScreenPt2D = {
    x: origin.x + Math.cos(handleRad) * radiusPx,
    y: origin.y + Math.sin(handleRad) * radiusPx,
  };

  // Plano fantasma translúcido inclinado pelo ângulo atual
  const tiltRad = (clamped * Math.PI) / 180;
  const halfW = 30;
  const halfH = 14;
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  const corners: ScreenPt2D[] = [
    { x: origin.x - halfW * cosT - halfH * sinT, y: origin.y - halfW * sinT + halfH * cosT },
    { x: origin.x + halfW * cosT - halfH * sinT, y: origin.y + halfW * sinT + halfH * cosT },
    { x: origin.x + halfW * cosT + halfH * sinT, y: origin.y + halfW * sinT - halfH * cosT },
    { x: origin.x - halfW * cosT + halfH * sinT, y: origin.y - halfW * sinT - halfH * cosT },
  ];
  const ghostPlanePoints = corners.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return {
    arcPath,
    negTip,
    posTip,
    handlePos,
    ghostPlanePoints,
  };
}

export interface ViewAlignedRotationHandlePlacement {
  handlePos: ScreenPt2D;
  angleRad: number;
  arcPath: string;
  startTip: ScreenPt2D;
  endTip: ScreenPt2D;
  radiusPx: number;
}

/**
 * Calcula a posição ideal anti-colisão em coordenadas de tela 2D para a alça circular tátil
 * `Girar ↻` (e seu arco de rotação) em um raio confortável (`52px–64px`), posicionando-a
 * automaticamente na bissetriz do setor angular mais aberto entre as 3 setas lineares (+X, +Y, +Z).
 * Assim, mesmo quando um eixo aponta para a câmera ou muda de quadrante, a alça de giro
 * permanece 100% visível, desobstruída e clicável.
 */
export function computeViewAlignedRotationHandlePlacement(
  origin: ScreenPt2D,
  xAxisEnd: ScreenPt2D,
  yAxisEnd: ScreenPt2D,
  zAxisEnd: ScreenPt2D,
  handleRadiusPx = 58,
): ViewAlignedRotationHandlePlacement {
  const radiusPx = Math.max(52, Math.min(64, handleRadiusPx));
  const rawEndpoints = [xAxisEnd, yAxisEnd, zAxisEnd];
  const validAngles: number[] = [];

  for (const pt of rawEndpoints) {
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    const len = Math.hypot(dx, dy);
    // Ignora eixo que aponta diretamente para a câmera (projeção 2D curta)
    if (len >= 12) {
      validAngles.push(Math.atan2(dy, dx));
    }
  }

  let bestBisectorRad = -Math.PI / 4; // Padrão ergonômico superior-direito (-45°)

  if (validAngles.length === 1) {
    // 1 único eixo visível: posiciona a 90° dele
    bestBisectorRad = validAngles[0]! - Math.PI / 2;
  } else if (validAngles.length >= 2) {
    const sorted = [...validAngles].sort((a, b) => a - b);
    let bestScore = -Infinity;

    for (let i = 0; i < sorted.length; i++) {
      const a1 = sorted[i]!;
      const a2 = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + Math.PI * 2;
      const gap = a2 - a1;
      const mid = a1 + gap * 0.5;
      const normMid = Math.atan2(Math.sin(mid), Math.cos(mid));
      // Leve preferência ergonômica para o quadrante superior-direito (-45°) em caso de empate
      const ergonomicBonus = Math.cos(normMid - -Math.PI / 4) * 0.15;
      const score = gap + ergonomicBonus;
      if (score > bestScore) {
        bestScore = score;
        bestBisectorRad = normMid;
      }
    }
  }

  const handlePos: ScreenPt2D = {
    x: origin.x + Math.cos(bestBisectorRad) * radiusPx,
    y: origin.y + Math.sin(bestBisectorRad) * radiusPx,
  };

  const halfSpanRad = (26 * Math.PI) / 180;
  const startRad = bestBisectorRad - halfSpanRad;
  const endRad = bestBisectorRad + halfSpanRad;

  const startTip: ScreenPt2D = {
    x: origin.x + Math.cos(startRad) * radiusPx,
    y: origin.y + Math.sin(startRad) * radiusPx,
  };
  const endTip: ScreenPt2D = {
    x: origin.x + Math.cos(endRad) * radiusPx,
    y: origin.y + Math.sin(endRad) * radiusPx,
  };

  const arcPath = `M ${startTip.x.toFixed(1)} ${startTip.y.toFixed(1)} A ${radiusPx} ${radiusPx} 0 0 1 ${endTip.x.toFixed(1)} ${endTip.y.toFixed(1)}`;

  return {
    handlePos,
    angleRad: bestBisectorRad,
    arcPath,
    startTip,
    endTip,
    radiusPx,
  };
}


