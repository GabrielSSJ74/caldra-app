import { translate, uid, type Entity } from "./core";
import type { DirectBody3D, DirectFace3D } from "./cadDirectModeling3D";

export type SmartArrayAxis3D = "x" | "y" | "z";
export type SmartArrayDivisionMode3D = "by_count" | "by_max_gap";
export type SmartGrilleAngleMode3D = "axial_louver" | "diagonal_span";

export const SMART_GRILLE_STEP_STORAGE_KEY = "caldra_chamfer_smart_grille_steps_v1";

export const SMART_GRILLE_COUNT_STEP_PRESETS = [1, 2, 5, 10] as const;
export const SMART_GRILLE_GAP_STEP_PRESETS_MM = [1, 5, 10, 25, 50] as const;
export const SMART_GRILLE_ANGLE_STEP_PRESETS_DEG = [1, 5, 15] as const;
export const SMART_GRILLE_ANGLE_QUICK_PRESETS_DEG = [0, 15, 30, 45, 60, -45] as const;

export interface SmartGrilleStepConfig {
  countStep: number;
  maxGapStepMm: number;
  angleStepDeg: 1 | 5 | 15;
}

export const DEFAULT_SMART_GRILLE_STEP_CONFIG: SmartGrilleStepConfig = {
  countStep: 1,
  maxGapStepMm: 10,
  angleStepDeg: 5,
};

export function sanitizeSmartGrilleStepConfig(
  raw: Partial<SmartGrilleStepConfig> | null | undefined,
): SmartGrilleStepConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SMART_GRILLE_STEP_CONFIG };
  }
  const rawCount = Math.round(Number(raw.countStep ?? 1));
  const countStep = Number.isFinite(rawCount) && rawCount >= 1 ? Math.min(50, rawCount) : 1;

  const rawGap = Number(raw.maxGapStepMm ?? 10);
  const maxGapStepMm =
    Number.isFinite(rawGap) && rawGap >= 0.5 ? Number(Math.min(500, rawGap).toFixed(2)) : 10;

  const rawAng = Number(raw.angleStepDeg ?? 5);
  const angleStepDeg: 1 | 5 | 15 = rawAng === 1 ? 1 : rawAng === 15 ? 15 : 5;

  return { countStep, maxGapStepMm, angleStepDeg };
}

export function loadSmartGrilleStepConfig(
  storage?: Pick<Storage, "getItem"> | null,
): SmartGrilleStepConfig {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : null;
    if (!targetStorage) {
      return { ...DEFAULT_SMART_GRILLE_STEP_CONFIG };
    }
    const stored = targetStorage.getItem(SMART_GRILLE_STEP_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SMART_GRILLE_STEP_CONFIG };
    return sanitizeSmartGrilleStepConfig(JSON.parse(stored) as Partial<SmartGrilleStepConfig>);
  } catch {
    return { ...DEFAULT_SMART_GRILLE_STEP_CONFIG };
  }
}

export function saveSmartGrilleStepConfig(
  config: SmartGrilleStepConfig,
  storage?: Pick<Storage, "setItem"> | null,
): SmartGrilleStepConfig {
  const clean = sanitizeSmartGrilleStepConfig(config);
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : null;
    if (targetStorage) {
      targetStorage.setItem(SMART_GRILLE_STEP_STORAGE_KEY, JSON.stringify(clean));
    }
  } catch {
    // Ignora falhas de quota / modo privado
  }
  return clean;
}

/**
 * Calcula a largura efetiva projetada de cada perfil no eixo do vão considerando
 * sua seção transversal (W × H) e o ângulo θ:
 *   W_proj(θ) = W * |cos(θ)| + H * |sin(θ)|
 */
export function computeProjectedProfileWidthMm(
  widthMm: number,
  depthMm: number,
  angleDeg: number,
): number {
  const W = Math.max(1, Number(widthMm) || 30);
  const H = Math.max(1, Number(depthMm) || W);
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  return W * Math.abs(Math.cos(rad)) + H * Math.abs(Math.sin(rad));
}

export interface SmartSpanDetection3D {
  axis: SmartArrayAxis3D;
  spanMm: number;
  startInnerCoordMm: number;
  endInnerCoordMm: number;
  tubeWidthMm: number;
  tubeDepthMm?: number;
  startBodyId: string | null;
  endBodyId: string | null;
  isAutoDetected: boolean;
  perpInnerStartMm?: number;
  perpInnerEndMm?: number;
  perpSpanMm?: number;
}

export interface SmartGrilleArrayParams3D {
  mode: SmartArrayDivisionMode3D;
  spanMm: number;
  tubeWidthMm: number;
  tubeDepthMm?: number;
  count: number;
  maxClearGapMm: number;
  startInnerCoordMm: number;
  axis: SmartArrayAxis3D;
  angleDeg?: number;
  angleMode?: SmartGrilleAngleMode3D;
  perpInnerStartMm?: number;
  perpInnerEndMm?: number;
  perpSpanMm?: number;
}

export interface SmartGrilleArrayResult3D {
  axis: SmartArrayAxis3D;
  mode: SmartArrayDivisionMode3D;
  spanMm: number;
  tubeWidthMm: number;
  tubeDepthMm: number;
  projectedTubeWidthMm: number;
  angleDeg: number;
  angleMode: SmartGrilleAngleMode3D;
  diagonalBarLengthMm?: number;
  endMiterAngleDeg: number;
  count: number;
  clearGapMm: number;
  pitchCenterToCenterMm: number;
  startInnerCoordMm: number;
  endInnerCoordMm: number;
  centerCoordsMm: number[];
  valid: boolean;
  perpInnerStartMm?: number;
  perpInnerEndMm?: number;
  perpSpanMm?: number;
}

export function getBodyIntervalAlongAxis(
  body: DirectBody3D,
  axis: SmartArrayAxis3D,
): { min: number; max: number; size: number; center: number } {
  if (axis === "x") {
    const min = body.bbox3D.minX;
    const max = body.bbox3D.maxX;
    return { min, max, size: Math.max(1, max - min), center: (min + max) * 0.5 };
  }
  if (axis === "y") {
    const min = body.bbox3D.minY;
    const max = body.bbox3D.maxY;
    return { min, max, size: Math.max(1, max - min), center: (min + max) * 0.5 };
  }
  const min = body.bbox3D.minZ;
  const max = body.bbox3D.minZ + Math.max(1, body.bbox3D.maxZ - body.bbox3D.minZ);
  return { min, max, size: Math.max(1, max - min), center: (min + max) * 0.5 };
}

/**
 * Analisa os corpos vizinhos na cena ao longo do eixo escolhido (X, Y ou Z)
 * e detecta automaticamente o Vão Livre Interno (V_vão em mm) entre a face interna
 * da primeira coluna/travessa e a face interna da coluna/travessa oposta.
 */
export function detectInternalSpan3D(
  selectedBody: DirectBody3D | null,
  allBodies: readonly DirectBody3D[],
  axis: SmartArrayAxis3D,
  clickedFaces?: readonly DirectFace3D[],
): SmartSpanDetection3D {
  const refBody = selectedBody ?? allBodies[0] ?? null;
  const refInterval = refBody
    ? getBodyIntervalAlongAxis(refBody, axis)
    : { min: 0, max: 30, size: 30, center: 15 };
  const crossSec = extractTubeCrossSectionFromBody3D(refBody);
  const perpAxis: SmartArrayAxis3D = axis === "x" ? "y" : axis === "y" ? "x" : "y";
  const perpInterval = refBody
    ? getBodyIntervalAlongAxis(refBody, perpAxis)
    : { min: 0, max: 30, size: 30, center: 15 };
  const zSize = refBody ? Math.max(1, refBody.bbox3D.maxZ - refBody.bbox3D.minZ) : 30;
  const isVerticalColumn =
    axis !== "z" && zSize > Math.max(refInterval.size, perpInterval.size) * 1.15;

  // Se a peça selecionada for uma travessa comprida ao longo do próprio eixo `axis`, usa a bitola transversal `profileWidthMm`
  const tubeWidthMm = Math.max(
    2,
    Number(
      (refInterval.size > crossSec.profileWidthMm * 2.2
        ? crossSec.profileWidthMm
        : refInterval.size
      ).toFixed(2),
    ),
  );
  const resolvedDepthCandidate = isVerticalColumn
    ? perpInterval.size
    : crossSec.profileDepthMm || refBody?.extrudeHeightMm || tubeWidthMm;
  const tubeDepthMm = Math.max(2, Number(resolvedDepthCandidate.toFixed(2)));

  // Detecta também o vão livre perpendicular (para encaixar o comprimento das barras de grade dentro de um Quadro 45°)
  let perpInnerStartMm: number | undefined;
  let perpInnerEndMm: number | undefined;
  let perpSpanMm: number | undefined;
  if (allBodies.length >= 2) {
    const perpSorted = [...allBodies]
      .map((b) => ({ body: b, interval: getBodyIntervalAlongAxis(b, perpAxis) }))
      .sort((a, b) => a.interval.center - b.interval.center);
    let bestPerpGap = 0;
    for (let i = 0; i < perpSorted.length; i++) {
      for (let j = i + 1; j < perpSorted.length; j++) {
        const pLeft = perpSorted[i]!;
        const pRight = perpSorted[j]!;
        const pGap = pRight.interval.min - pLeft.interval.max;
        if (pGap > bestPerpGap && pGap > 15) {
          bestPerpGap = pGap;
          perpInnerStartMm = Number(pLeft.interval.max.toFixed(2));
          perpInnerEndMm = Number(pRight.interval.min.toFixed(2));
          perpSpanMm = Number(pGap.toFixed(2));
        }
      }
    }
  }

  // 1. Se o usuário clicou em duas faces para medir o vão na hora:
  if (clickedFaces && clickedFaces.length >= 2) {
    const f1 = clickedFaces[0]!;
    const f2 = clickedFaces[1]!;
    const c1 = f1.centroid[axis];
    const c2 = f2.centroid[axis];
    const startInnerCoordMm = Math.min(c1, c2);
    const endInnerCoordMm = Math.max(c1, c2);
    const spanMm = Math.max(10, Number((endInnerCoordMm - startInnerCoordMm).toFixed(2)));
    return {
      axis,
      spanMm,
      startInnerCoordMm: Number(startInnerCoordMm.toFixed(2)),
      endInnerCoordMm: Number(endInnerCoordMm.toFixed(2)),
      tubeWidthMm,
      tubeDepthMm,
      startBodyId: f1.entityId,
      endBodyId: f2.entityId,
      isAutoDetected: true,
      perpInnerStartMm,
      perpInnerEndMm,
      perpSpanMm,
    };
  }

  // 2. Se houver 2 ou mais corpos na cena, procura o par de colunas/travessas de borda
  if (allBodies.length >= 2 && refBody) {
    const sorted = [...allBodies]
      .map((b) => ({ body: b, interval: getBodyIntervalAlongAxis(b, axis) }))
      .sort((a, b) => a.interval.center - b.interval.center);

    let bestPair: {
      left: (typeof sorted)[number];
      right: (typeof sorted)[number];
      gap: number;
      tier: number;
    } | null = null;

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const left = sorted[i]!;
        const right = sorted[j]!;
        const gap = right.interval.min - left.interval.max;
        if (gap <= 15) continue;

        const involvesSelected =
          left.body.entityId === refBody.entityId || right.body.entityId === refBody.entityId;
        const selectedInsideGap =
          !involvesSelected &&
          refInterval.center >= left.interval.max - 1 &&
          refInterval.center <= right.interval.min + 1;

        if (!involvesSelected && !selectedInsideGap) continue;

        // Verifica se há outra coluna/obstáculo alinhado perpendicularmente no meio do vão
        const lPerp = getBodyIntervalAlongAxis(left.body, perpAxis);
        const rPerp = getBodyIntervalAlongAxis(right.body, perpAxis);
        const perpOverlap = Math.min(lPerp.max, rPerp.max) - Math.max(lPerp.min, rPerp.min) > -5;

        let hasIntermediateObstacle = false;
        for (let k = i + 1; k < j; k++) {
          const mid = sorted[k]!;
          if (mid.body.entityId === refBody.entityId && selectedInsideGap) continue;
          if (
            mid.interval.center > left.interval.max + 1 &&
            mid.interval.center < right.interval.min - 1
          ) {
            hasIntermediateObstacle = true;
            break;
          }
        }

        // Prioridade: 3 = envolve a coluna selecionada, sem obstáculo no meio e alinhado no eixo perpendicular;
        // 2 = envolve a coluna selecionada sem obstáculo; 1 = peça selecionada é amostra interna dentro de um quadro externo; 0 = com obstáculo
        const tier = hasIntermediateObstacle
          ? 0
          : involvesSelected
            ? perpOverlap
              ? 3
              : 2
            : 1;

        if (
          !bestPair ||
          tier > bestPair.tier ||
          (tier === bestPair.tier && gap > bestPair.gap)
        ) {
          bestPair = { left, right, gap, tier };
        }
      }
    }

    // Fallback se nenhum par envolveu diretamente o selecionado (ex.: usuário selecionou a barra inferior e pediu eixo X):
    // pega o maior vão livre entre quaisquer 2 barras opostas neste eixo
    if (!bestPair) {
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const left = sorted[i]!;
          const right = sorted[j]!;
          const gap = right.interval.min - left.interval.max;
          if (gap > 15 && (!bestPair || gap > bestPair.gap)) {
            bestPair = { left, right, gap, tier: 0 };
          }
        }
      }
    }

    if (bestPair) {
      const startInnerCoordMm = Number(bestPair.left.interval.max.toFixed(2));
      const endInnerCoordMm = Number(bestPair.right.interval.min.toFixed(2));
      const spanMm = Number(Math.max(10, endInnerCoordMm - startInnerCoordMm).toFixed(2));
      return {
        axis,
        spanMm,
        startInnerCoordMm,
        endInnerCoordMm,
        tubeWidthMm,
        tubeDepthMm,
        startBodyId: bestPair.left.body.entityId,
        endBodyId: bestPair.right.body.entityId,
        isAutoDetected: true,
        perpInnerStartMm,
        perpInnerEndMm,
        perpSpanMm,
      };
    }
  }

  // 3. Fallback padrão quando há apenas 1 peça isolada na cena (ex.: 1000 mm de vão livre a partir da face interna)
  const defaultSpanMm = 1000;
  const startInnerCoordMm = Number(refInterval.max.toFixed(2));
  return {
    axis,
    spanMm: defaultSpanMm,
    startInnerCoordMm,
    endInnerCoordMm: Number((startInnerCoordMm + defaultSpanMm).toFixed(2)),
    tubeWidthMm,
    tubeDepthMm,
    startBodyId: refBody?.entityId ?? null,
    endBodyId: null,
    isAutoDetected: false,
    perpInnerStartMm,
    perpInnerEndMm,
    perpSpanMm,
  };
}

/**
 * Calcula a distribuição exata de tubos/perfis para Grades, Venezianas e Portões (Serralheria),
 * integrando largura projetada por ângulo `W_proj(θ) = W * |cos θ| + H * |sin θ|`:
 *
 * - Modo A (`by_count`): Dividir Vão por Quantidade (N Tubos internos)
 *   Luz(θ) = (V_vão - N * W_proj(θ)) / (N + 1)
 *   Passo = W_proj(θ) + Luz(θ)
 *
 * - Modo B (`by_max_gap`): Por Passo ou Vão Máximo (mm)
 *   N = max(1, ceil((V_vão - L_max) / (W_proj(θ) + L_max)))
 */
export function computeSmartGrilleArray3D(
  params: SmartGrilleArrayParams3D,
): SmartGrilleArrayResult3D {
  const spanMm = Math.max(10, Number(params.spanMm) || 1000);
  const tubeWidthMm = Math.max(1, Number(params.tubeWidthMm) || 30);
  const tubeDepthMm = Math.max(1, Number(params.tubeDepthMm ?? tubeWidthMm) || tubeWidthMm);
  const startInnerCoordMm = Number(params.startInnerCoordMm) || 0;
  const angleMode: SmartGrilleAngleMode3D = params.angleMode ?? "axial_louver";
  const rawAngleDeg = Number(params.angleDeg ?? 0) || 0;
  // Em inclinação diagonal no plano da grade limitamos a [-75°, +75°] para evitar paralelismo singular (cos 90° = 0)
  const angleDeg =
    angleMode === "diagonal_span"
      ? Math.max(-75, Math.min(75, rawAngleDeg))
      : Math.max(-89, Math.min(89, rawAngleDeg));

  const projectedTubeWidthMm =
    Math.abs(angleDeg) < 1e-3
      ? tubeWidthMm
      : computeProjectedProfileWidthMm(tubeWidthMm, tubeDepthMm, angleDeg);

  let count = Math.max(1, Math.min(80, Math.round(params.count || 1)));
  if (params.mode === "by_max_gap") {
    const maxGap = Math.max(5, Number(params.maxClearGapMm) || 110);
    const idealCount = Math.ceil((spanMm - maxGap) / (projectedTubeWidthMm + maxGap));
    count = Math.max(1, Math.min(80, idealCount));
  }

  const clearGapMm = (spanMm - count * projectedTubeWidthMm) / (count + 1);
  const pitchCenterToCenterMm = projectedTubeWidthMm + clearGapMm;
  const endInnerCoordMm = startInnerCoordMm + spanMm;

  const centerCoordsMm: number[] = [];
  for (let i = 0; i < count; i++) {
    const centerCoord =
      startInnerCoordMm +
      clearGapMm +
      projectedTubeWidthMm * 0.5 +
      i * pitchCenterToCenterMm;
    centerCoordsMm.push(Number(centerCoord.toFixed(3)));
  }

  const perpSpan =
    typeof params.perpSpanMm === "number" && params.perpSpanMm > 10
      ? params.perpSpanMm
      : typeof params.perpInnerStartMm === "number" &&
          typeof params.perpInnerEndMm === "number" &&
          params.perpInnerEndMm - params.perpInnerStartMm > 10
        ? params.perpInnerEndMm - params.perpInnerStartMm
        : undefined;

  const cosAng = Math.max(0.2, Math.abs(Math.cos((angleDeg * Math.PI) / 180)));
  const diagonalBarLengthMm =
    angleMode === "diagonal_span" && perpSpan !== undefined
      ? Number((perpSpan / cosAng).toFixed(2))
      : perpSpan;

  const endMiterAngleDeg =
    angleMode === "diagonal_span" && Math.abs(angleDeg) >= 0.1
      ? Number(Math.abs(angleDeg).toFixed(1))
      : 90;

  return {
    axis: params.axis,
    mode: params.mode,
    spanMm: Number(spanMm.toFixed(2)),
    tubeWidthMm: Number(tubeWidthMm.toFixed(2)),
    tubeDepthMm: Number(tubeDepthMm.toFixed(2)),
    projectedTubeWidthMm: Number(projectedTubeWidthMm.toFixed(2)),
    angleDeg: Number(angleDeg.toFixed(2)),
    angleMode,
    diagonalBarLengthMm,
    endMiterAngleDeg,
    count,
    clearGapMm: Number(clearGapMm.toFixed(2)),
    pitchCenterToCenterMm: Number(pitchCenterToCenterMm.toFixed(2)),
    startInnerCoordMm: Number(startInnerCoordMm.toFixed(2)),
    endInnerCoordMm: Number(endInnerCoordMm.toFixed(2)),
    centerCoordsMm,
    valid: clearGapMm > 0,
    perpInnerStartMm: params.perpInnerStartMm,
    perpInnerEndMm: params.perpInnerEndMm,
    perpSpanMm: perpSpan,
  };
}

/**
 * Constrói as 6 faces 3D (quads) de uma barra da grade para o Ghost Preview 3D em tempo real,
 * respeitando fielmente tanto `0°` (90° reto), quanto `axial_louver` (veneziana girada no eixo)
 * e `diagonal_span` (barra inclinada diagonalmente com pontas cortadas rentes às bordas do vão).
 */
export function computeSmartGrilleBarPreviewQuads3D(params: {
  centerCoordMm: number;
  axis: SmartArrayAxis3D;
  barWidthMm: number;
  barHeightZMm: number;
  perpStartMm: number;
  perpEndMm: number;
  z0: number;
  z1: number;
  angleDeg: number;
  angleMode: SmartGrilleAngleMode3D;
  isHorizontalInXY: boolean;
}): Array<Array<{ x: number; y: number; z: number }>> {
  const {
    centerCoordMm,
    axis,
    barWidthMm,
    perpStartMm,
    perpEndMm,
    z0,
    z1,
    angleDeg,
    angleMode,
    isHorizontalInXY,
  } = params;

  const halfW = Math.max(1.5, barWidthMm * 0.5);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  // Caso Diagonal em Grade Horizontal XY: paralelogramo 2D com pontas cortadas rentes a perpStartMm / perpEndMm
  if (angleMode === "diagonal_span" && Math.abs(angleDeg) >= 0.1 && isHorizontalInXY && axis !== "z") {
    const perpLen = Math.max(10, perpEndMm - perpStartMm);
    const safeCos = Math.max(0.25, Math.abs(cosA));
    const halfWend = halfW / safeCos;
    const shear = perpLen * 0.5 * Math.tan(rad);

    const corners2D =
      axis === "x"
        ? [
            { x: centerCoordMm - shear - halfWend, y: perpStartMm },
            { x: centerCoordMm - shear + halfWend, y: perpStartMm },
            { x: centerCoordMm + shear + halfWend, y: perpEndMm },
            { x: centerCoordMm + shear - halfWend, y: perpEndMm },
          ]
        : [
            { x: perpStartMm, y: centerCoordMm - shear - halfWend },
            { x: perpEndMm, y: centerCoordMm + shear - halfWend },
            { x: perpEndMm, y: centerCoordMm + shear + halfWend },
            { x: perpStartMm, y: centerCoordMm - shear + halfWend },
          ];

    const top = corners2D.map((p) => ({ x: p.x, y: p.y, z: z1 }));
    const bot = corners2D.map((p) => ({ x: p.x, y: p.y, z: z0 }));
    return [
      top,
      bot,
      [bot[0]!, bot[1]!, top[1]!, top[0]!],
      [bot[1]!, bot[2]!, top[2]!, top[1]!],
      [bot[2]!, bot[3]!, top[3]!, top[2]!],
      [bot[3]!, bot[0]!, top[0]!, top[3]!],
    ];
  }

  // Caixa base da barra antes de rotação axial/diagonal
  const bxMin = axis === "x" ? centerCoordMm - halfW : perpStartMm;
  const bxMax = axis === "x" ? centerCoordMm + halfW : perpEndMm;
  const byMin =
    axis === "y"
      ? centerCoordMm - halfW
      : axis === "x"
        ? perpStartMm
        : perpStartMm;
  const byMax =
    axis === "y"
      ? centerCoordMm + halfW
      : axis === "x"
        ? perpEndMm
        : perpEndMm;
  const bzMin = axis === "z" ? centerCoordMm - halfW : z0;
  const bzMax = axis === "z" ? centerCoordMm + halfW : z1;

  const cx = (bxMin + bxMax) * 0.5;
  const cy = (byMin + byMax) * 0.5;
  const cz = (bzMin + bzMax) * 0.5;

  const rotPt = (p: { x: number; y: number; z: number }) => {
    if (Math.abs(angleDeg) < 0.1) return p;
    const lx = p.x - cx;
    const ly = p.y - cy;
    const lz = p.z - cz;

    if (angleMode === "axial_louver") {
      if (isHorizontalInXY && axis === "x") {
        // Eixo longitudinal = Y -> gira no plano XZ
        return {
          x: cx + lx * cosA + lz * sinA,
          y: p.y,
          z: cz - lx * sinA + lz * cosA,
        };
      }
      if (isHorizontalInXY && axis === "y") {
        // Eixo longitudinal = X -> gira no plano YZ
        return {
          x: p.x,
          y: cy + ly * cosA - lz * sinA,
          z: cz + ly * sinA + lz * cosA,
        };
      }
      if (axis === "z") {
        const spanX = bxMax - bxMin;
        const spanY = byMax - byMin;
        if (spanX >= spanY) {
          return {
            x: p.x,
            y: cy + ly * cosA - lz * sinA,
            z: cz + ly * sinA + lz * cosA,
          };
        }
        return {
          x: cx + lx * cosA + lz * sinA,
          y: p.y,
          z: cz - lx * sinA + lz * cosA,
        };
      }
      // Coluna vertical (eixo longitudinal = Z) -> gira no plano XY
      return {
        x: cx + lx * cosA - ly * sinA,
        y: cy + lx * sinA + ly * cosA,
        z: p.z,
      };
    }

    // Inclinação diagonal para colunas verticais (plano XZ ou YZ) com corte horizontal nas bordas z0..z1
    const safeTan = Math.tan(Math.max(-1.3, Math.min(1.3, rad)));
    if (axis === "x") {
      return { x: p.x + lz * safeTan, y: p.y, z: p.z };
    }
    if (axis === "y") {
      return { x: p.x, y: p.y + lz * safeTan, z: p.z };
    }
    return { x: p.x, y: p.y, z: p.z + lx * safeTan };
  };

  const baseQuads = [
    [
      { x: bxMin, y: byMin, z: bzMax },
      { x: bxMax, y: byMin, z: bzMax },
      { x: bxMax, y: byMax, z: bzMax },
      { x: bxMin, y: byMax, z: bzMax },
    ],
    [
      { x: bxMin, y: byMin, z: bzMin },
      { x: bxMax, y: byMin, z: bzMin },
      { x: bxMax, y: byMax, z: bzMin },
      { x: bxMin, y: byMax, z: bzMin },
    ],
    [
      { x: bxMin, y: byMin, z: bzMin },
      { x: bxMax, y: byMin, z: bzMin },
      { x: bxMax, y: byMin, z: bzMax },
      { x: bxMin, y: byMin, z: bzMax },
    ],
    [
      { x: bxMax, y: byMin, z: bzMin },
      { x: bxMax, y: byMax, z: bzMin },
      { x: bxMax, y: byMax, z: bzMax },
      { x: bxMax, y: byMin, z: bzMax },
    ],
    [
      { x: bxMax, y: byMax, z: bzMin },
      { x: bxMin, y: byMax, z: bzMin },
      { x: bxMin, y: byMax, z: bzMax },
      { x: bxMax, y: byMax, z: bzMax },
    ],
    [
      { x: bxMin, y: byMax, z: bzMin },
      { x: bxMin, y: byMin, z: bzMin },
      { x: bxMin, y: byMin, z: bzMax },
      { x: bxMin, y: byMax, z: bzMax },
    ],
  ];

  return baseQuads.map((q) => q.map(rotPt));
}

/**
 * Gera as entidades 3D reais para os N tubos internos do Array/Grade em uma única operação atômica.
 * - Em `0°` (padrão): pontas retas de 90° (`startMiterRatio = 0`, `endMiterRatio = 0`).
 * - Em `axial_louver` (`∠ θ°`): aplica giro real no próprio eixo longitudinal da barra (veneziana/aleta).
 * - Em `diagonal_span` (`∠ θ°`): inclina as barras no plano da grade, ajustando o comprimento diagonal
 *   e os cortes angulares das extremidades para encostar rente nas bordas internas do vão.
 */
export function generateSmartGrilleArrayEntities3D(
  entities: Entity[],
  sourceEntityId: string,
  sourceBody: DirectBody3D,
  arrayResult: SmartGrilleArrayResult3D,
  allBodies?: readonly DirectBody3D[],
): { updatedEntities: Entity[]; createdIds: string[] } {
  const sourceEntity = entities.find((e) => e.id === sourceEntityId);
  if (!sourceEntity || arrayResult.centerCoordsMm.length === 0) {
    return { updatedEntities: entities, createdIds: [] };
  }

  const sourceInterval = getBodyIntervalAlongAxis(sourceBody, arrayResult.axis);
  const sourceCenter = sourceInterval.center;
  const crossSec = extractTubeCrossSectionFromBody3D(sourceBody);
  const barWidthMm = Math.max(4, arrayResult.tubeWidthMm || crossSec.profileWidthMm || 20);
  const barHeightZMm = Math.max(4, sourceBody.extrudeHeightMm || crossSec.profileDepthMm || 20);
  const wallT = Math.max(0, Number(sourceBody.shellThicknessMm ?? sourceBody.shellWallThicknessMm ?? 0));
  const isHollow = wallT > 0.2;
  const angleDeg = Number(arrayResult.angleDeg ?? 0) || 0;
  const angleMode: SmartGrilleAngleMode3D = arrayResult.angleMode ?? "axial_louver";
  const hasAngle = Math.abs(angleDeg) >= 0.1;

  // Verifica se há vão livre perpendicular delimitado por outras barras na cena (ex.: Quadro 45°)
  const perpAxis: SmartArrayAxis3D =
    arrayResult.axis === "x" ? "y" : arrayResult.axis === "y" ? "x" : "y";
  let perpStartMm =
    perpAxis === "x" ? sourceBody.bbox3D.minX : sourceBody.bbox3D.minY;
  let perpEndMm =
    perpAxis === "x" ? sourceBody.bbox3D.maxX : sourceBody.bbox3D.maxY;

  if (
    typeof arrayResult.perpInnerStartMm === "number" &&
    typeof arrayResult.perpInnerEndMm === "number" &&
    arrayResult.perpInnerEndMm - arrayResult.perpInnerStartMm > 15
  ) {
    perpStartMm = arrayResult.perpInnerStartMm;
    perpEndMm = arrayResult.perpInnerEndMm;
  } else if (allBodies && allBodies.length >= 2) {
    const perpSpan = detectInternalSpan3D(sourceBody, allBodies, arrayResult.axis);
    if (
      typeof perpSpan.perpInnerStartMm === "number" &&
      typeof perpSpan.perpInnerEndMm === "number" &&
      perpSpan.perpInnerEndMm - perpSpan.perpInnerStartMm > 15
    ) {
      perpStartMm = perpSpan.perpInnerStartMm;
      perpEndMm = perpSpan.perpInnerEndMm;
    } else if (perpEndMm - perpStartMm <= barWidthMm * 1.5) {
      let sceneMinPerp = Infinity;
      let sceneMaxPerp = -Infinity;
      for (const b of allBodies) {
        const iv = getBodyIntervalAlongAxis(b, perpAxis);
        if (iv.min < sceneMinPerp) sceneMinPerp = iv.min;
        if (iv.max > sceneMaxPerp) sceneMaxPerp = iv.max;
      }
      if (sceneMaxPerp - sceneMinPerp > barWidthMm * 2.5) {
        perpStartMm = sceneMinPerp + barWidthMm;
        perpEndMm = sceneMaxPerp - barWidthMm;
      }
    }
  }

  const isSourceHorizontalBar = Boolean(sourceEntity.params?.isHorizontalMiterBar3D);
  const createdEntities: Entity[] = [];
  const createdIds: string[] = [];

  for (let i = 0; i < arrayResult.centerCoordsMm.length; i++) {
    const targetCenter = arrayResult.centerCoordsMm[i]!;
    const delta = targetCenter - sourceCenter;

    // Se a peça base já for uma barra perpendicular naquela exata coordenada (e sem giro angular novo), evita duplicar em cima dela
    const isSourcePerpendicularToAxis =
      arrayResult.axis === "x"
        ? sourceBody.deltaY > sourceBody.deltaX * 1.5
        : arrayResult.axis === "y"
          ? sourceBody.deltaX > sourceBody.deltaY * 1.5
          : true;
    if (!hasAngle && isSourcePerpendicularToAxis && Math.abs(delta) < 0.25) {
      continue;
    }

    const newId = uid();

    // Caso 1: Barra horizontal estrutural (originada de Quadro 45° ou de barra horizontal) em Eixo X ou Y
    if (isSourceHorizontalBar && (arrayResult.axis === "x" || arrayResult.axis === "y")) {
      const clearLenMm = Math.max(20, Number((perpEndMm - perpStartMm).toFixed(2)));
      const elevZ = Number((sourceBody.elevationZ || 0).toFixed(2));

      // 1A. Quando há ângulo configurado (`axial_louver` ou `diagonal_span`), gera corpo B-Rep paramétrico real
      //     com seção extrudada/vazada (`Shell`) e rotação axial ou geometria diagonal em meia-esquadria!
      if (hasAngle) {
        const rad = (angleDeg * Math.PI) / 180;
        const safeCos = Math.max(0.25, Math.abs(Math.cos(rad)));
        const diagLenMm = Number((clearLenMm / safeCos).toFixed(2));
        const baseParams = structuredClone(sourceEntity.params) ?? {};
        delete baseParams.isHorizontalMiterBar3D;
        delete baseParams.miterBarSpec3D;

        if (angleMode === "diagonal_span") {
          const halfWend = (barWidthMm * 0.5) / safeCos;
          const shear = clearLenMm * 0.5 * Math.tan(rad);
          const diagPts2D =
            arrayResult.axis === "x"
              ? [
                  { x: Number((targetCenter - shear - halfWend).toFixed(3)), y: Number(perpStartMm.toFixed(3)) },
                  { x: Number((targetCenter - shear + halfWend).toFixed(3)), y: Number(perpStartMm.toFixed(3)) },
                  { x: Number((targetCenter + shear + halfWend).toFixed(3)), y: Number(perpEndMm.toFixed(3)) },
                  { x: Number((targetCenter + shear - halfWend).toFixed(3)), y: Number(perpEndMm.toFixed(3)) },
                ]
              : [
                  { x: Number(perpStartMm.toFixed(3)), y: Number((targetCenter - shear - halfWend).toFixed(3)) },
                  { x: Number(perpEndMm.toFixed(3)), y: Number((targetCenter + shear - halfWend).toFixed(3)) },
                  { x: Number(perpEndMm.toFixed(3)), y: Number((targetCenter + shear + halfWend).toFixed(3)) },
                  { x: Number(perpStartMm.toFixed(3)), y: Number((targetCenter - shear + halfWend).toFixed(3)) },
                ];

          const diagEnt: Entity = {
            id: newId,
            layer: sourceEntity.layer || "corte",
            type: "polyline",
            pts: diagPts2D,
            closed: true,
            elevationZ: elevZ,
            extrudeHeight: barHeightZMm,
            shellWallThickness: isHollow ? wallT : 0,
            params: {
              ...baseParams,
              isIndependentBody3D: true,
              isSmartGrilleBar3D: true,
              booleanMode3D: "new_body",
              elevationZ: elevZ,
              extrudeHeight: barHeightZMm,
              extrudeHeightMm: barHeightZMm,
              shellWallThickness: isHollow ? wallT : 0,
              shellThicknessMm: isHollow ? wallT : 0,
              shellOpenCaps: isHollow ? ["front", "back"] : [],
              edgeFilletRadiusMm: Number(sourceBody.edgeFilletRadiusMm ?? 0),
              edgeChamferDistMm: Number(sourceBody.edgeChamferDistMm ?? 0),
              miterCutTopDeg: 0,
              miterCutBottomDeg: 0,
              rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
              grilleAngleDeg: angleDeg,
              grilleAngleMode: angleMode,
              bodyName: `Barra Diagonal #${i + 1} (${diagLenMm.toFixed(0)} mm · ∠ ${angleDeg}°)`,
              bodyColorHex: sourceBody.colorHex || "#94A3B8",
              bodyMaterial: sourceBody.materialName || "Aço Estrutural ASTM A36",
              frameMemberRole: "inner_grille",
              frameLongLengthMm: diagLenMm,
              frameShortLengthMm: clearLenMm,
            },
          };
          createdEntities.push(diagEnt);
          createdIds.push(newId);
          continue;
        }

        // `axial_louver` (Veneziana / Aleta girada no próprio eixo longitudinal X ou Y)
        const minX =
          arrayResult.axis === "x"
            ? Number((targetCenter - barWidthMm * 0.5).toFixed(2))
            : Number(perpStartMm.toFixed(2));
        const maxX =
          arrayResult.axis === "x"
            ? Number((targetCenter + barWidthMm * 0.5).toFixed(2))
            : Number(perpEndMm.toFixed(2));
        const minY =
          arrayResult.axis === "y"
            ? Number((targetCenter - barWidthMm * 0.5).toFixed(2))
            : Number(perpStartMm.toFixed(2));
        const maxY =
          arrayResult.axis === "y"
            ? Number((targetCenter + barWidthMm * 0.5).toFixed(2))
            : Number(perpEndMm.toFixed(2));

        const rectPts2D = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        const louverRot =
          arrayResult.axis === "x"
            ? { rxDeg: 0, ryDeg: angleDeg, rzDeg: 0 }
            : { rxDeg: angleDeg, ryDeg: 0, rzDeg: 0 };

        const louverEnt: Entity = {
          id: newId,
          layer: sourceEntity.layer || "corte",
          type: "polyline",
          pts: rectPts2D,
          closed: true,
          elevationZ: elevZ,
          extrudeHeight: barHeightZMm,
          shellWallThickness: isHollow ? wallT : 0,
          params: {
            ...baseParams,
            isIndependentBody3D: true,
            isSmartGrilleBar3D: true,
            booleanMode3D: "new_body",
            elevationZ: elevZ,
            extrudeHeight: barHeightZMm,
            extrudeHeightMm: barHeightZMm,
            shellWallThickness: isHollow ? wallT : 0,
            shellThicknessMm: isHollow ? wallT : 0,
            shellOpenCaps: isHollow
              ? arrayResult.axis === "x"
                ? ["front", "back"]
                : ["left", "right"]
              : [],
            edgeFilletRadiusMm: Number(sourceBody.edgeFilletRadiusMm ?? 0),
            edgeChamferDistMm: Number(sourceBody.edgeChamferDistMm ?? 0),
            miterCutTopDeg: 0,
            miterCutBottomDeg: 0,
            rotation3D: louverRot,
            grilleAngleDeg: angleDeg,
            grilleAngleMode: angleMode,
            bodyName: `Veneziana #${i + 1} (${clearLenMm.toFixed(0)} mm · ∠ ${angleDeg}°)`,
            bodyColorHex: sourceBody.colorHex || "#94A3B8",
            bodyMaterial: sourceBody.materialName || "Aço Estrutural ASTM A36",
            frameMemberRole: "inner_grille",
            frameLongLengthMm: clearLenMm,
            frameShortLengthMm: clearLenMm,
          },
        };
        createdEntities.push(louverEnt);
        createdIds.push(newId);
        continue;
      }

      // 1B. Caso padrão `0°` (90°/90° reto): preserva integralmente `isHorizontalMiterBar3D`
      const minX =
        arrayResult.axis === "x"
          ? Number((targetCenter - barWidthMm * 0.5).toFixed(2))
          : Number(perpStartMm.toFixed(2));
      const maxX =
        arrayResult.axis === "x"
          ? Number((targetCenter + barWidthMm * 0.5).toFixed(2))
          : Number(perpEndMm.toFixed(2));
      const minY =
        arrayResult.axis === "y"
          ? Number((targetCenter - barWidthMm * 0.5).toFixed(2))
          : Number(perpStartMm.toFixed(2));
      const maxY =
        arrayResult.axis === "y"
          ? Number((targetCenter + barWidthMm * 0.5).toFixed(2))
          : Number(perpEndMm.toFixed(2));

      const cornerOrigin3D = {
        x: minX,
        y: minY,
        z: elevZ,
      };
      const dirLen3D =
        arrayResult.axis === "x" ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      const dirIn3D =
        arrayResult.axis === "x" ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const dirZ3D = { x: 0, y: 0, z: 1 };

      // Pontas retas de 90° por padrão (startMiterRatio = 0, endMiterRatio = 0)
      const rectPts2D = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];

      const grilleBarEnt: Entity = {
        id: newId,
        layer: sourceEntity.layer || "corte",
        type: "polyline",
        pts: rectPts2D,
        closed: true,
        elevationZ: cornerOrigin3D.z,
        extrudeHeight: barHeightZMm,
        shellWallThickness: isHollow ? wallT : 0,
        params: {
          ...(structuredClone(sourceEntity.params) ?? {}),
          isIndependentBody3D: true,
          isSmartGrilleBar3D: true,
          booleanMode3D: "new_body",
          isHorizontalMiterBar3D: true,
          miterBarSpec3D: {
            cornerOrigin3D,
            dirLen3D,
            dirIn3D,
            dirZ3D,
            longLengthMm: clearLenMm,
            shortLengthMm: clearLenMm,
            profileWidthMm: barWidthMm,
            profileHeightZMm: barHeightZMm,
            wallThicknessMm: isHollow ? wallT : 0,
            isHollowTube: isHollow,
            cornerFilletRadiusMm: Number(sourceBody.edgeFilletRadiusMm ?? 0),
            cornerChamferDistMm: Number(sourceBody.edgeChamferDistMm ?? 0),
            startMiterRatio: 0,
            endMiterRatio: 0,
          },
          elevationZ: cornerOrigin3D.z,
          extrudeHeight: barHeightZMm,
          extrudeHeightMm: barHeightZMm,
          shellWallThickness: isHollow ? wallT : 0,
          shellThicknessMm: isHollow ? wallT : 0,
          shellOpenCaps: isHollow
            ? sourceBody.shellOpenCaps.length > 0
              ? [...sourceBody.shellOpenCaps]
              : ["top", "bottom"]
            : [],
          edgeFilletRadiusMm: Number(sourceBody.edgeFilletRadiusMm ?? 0),
          edgeChamferDistMm: Number(sourceBody.edgeChamferDistMm ?? 0),
          cornerFilletsMm: { ...(sourceBody.cornerFilletsMm ?? {}) },
          cornerChamfersMm: { ...(sourceBody.cornerChamfersMm ?? {}) },
          miterCutTopDeg: 0,
          miterCutTopAxis: arrayResult.axis === "x" ? "y" : "x",
          miterCutBottomDeg: 0,
          miterCutBottomAxis: arrayResult.axis === "x" ? "y" : "x",
          rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
          bodyName: `Barra de Grade #${i + 1} (${clearLenMm.toFixed(0)} mm · 90°/90°)`,
          bodyColorHex: sourceBody.colorHex || "#94A3B8",
          bodyMaterial: sourceBody.materialName || "Aço Estrutural ASTM A36",
          frameMemberRole: "inner_grille",
          frameLongLengthMm: clearLenMm,
          frameShortLengthMm: clearLenMm,
        },
      };
      createdEntities.push(grilleBarEnt);
      createdIds.push(newId);
      continue;
    }

    // Caso 2: Coluna/Perfil 3D vertical ou distribuição no eixo Z
    const translate2D = (ent: Entity, dx: number, dy: number): Entity => {
      if ((ent as { type: string }).type === "rect") {
        const r = ent as Entity & { x: number; y: number };
        return {
          ...structuredClone(r),
          x: Number((r.x + dx).toFixed(3)),
          y: Number((r.y + dy).toFixed(3)),
        };
      }
      return translate(structuredClone(ent), dx, dy) ?? structuredClone(ent);
    };

    const dx = arrayResult.axis === "x" ? delta : 0;
    const dy = arrayResult.axis === "y" ? delta : 0;
    const dz = arrayResult.axis === "z" ? delta : 0;

    const cloned = translate2D(sourceEntity, dx, dy);
    cloned.id = newId;
    const baseElevZ = (sourceBody.elevationZ || 0) + dz;
    const baseHeightZ = Math.max(1, Number((sourceBody.extrudeHeightMm || 20).toFixed(2)));

    let nextElevZ = Number(baseElevZ.toFixed(3));
    let nextHeightZ = baseHeightZ;
    const baseRot = {
      rxDeg: Number(sourceBody.rotation3D?.rxDeg ?? 0),
      ryDeg: Number(sourceBody.rotation3D?.ryDeg ?? 0),
      rzDeg: Number(sourceBody.rotation3D?.rzDeg ?? 0),
    };
    let nextRot = { ...baseRot };
    let nextMiterTopDeg = 0;
    let nextMiterBotDeg = 0;
    let nextMiterAxis: "x" | "y" = arrayResult.axis === "y" ? "y" : "x";

    if (hasAngle) {
      if (angleMode === "axial_louver") {
        if (arrayResult.axis === "z") {
          // Empilhado em Z: gira em torno do maior eixo horizontal (X ou Y)
          if (sourceBody.deltaX >= sourceBody.deltaY) {
            nextRot.rxDeg = Number((baseRot.rxDeg + angleDeg).toFixed(2));
          } else {
            nextRot.ryDeg = Number((baseRot.ryDeg + angleDeg).toFixed(2));
          }
        } else {
          // Coluna vertical (longitudinal em Z) ou barra 2D horizontal longa:
          const isHorizontalLongInY =
            arrayResult.axis === "x" &&
            sourceBody.deltaY > Math.max(sourceBody.deltaX, baseHeightZ) * 1.5;
          const isHorizontalLongInX =
            arrayResult.axis === "y" &&
            sourceBody.deltaX > Math.max(sourceBody.deltaY, baseHeightZ) * 1.5;
          if (isHorizontalLongInY) {
            nextRot.ryDeg = Number((baseRot.ryDeg + angleDeg).toFixed(2));
          } else if (isHorizontalLongInX) {
            nextRot.rxDeg = Number((baseRot.rxDeg + angleDeg).toFixed(2));
          } else {
            nextRot.rzDeg = Number((baseRot.rzDeg + angleDeg).toFixed(2));
          }
        }
      } else {
        // `diagonal_span` em colunas verticais (plano XZ ou YZ)
        const rad = (angleDeg * Math.PI) / 180;
        const safeCos = Math.max(0.25, Math.abs(Math.cos(rad)));
        const diagHeightZ = Number((baseHeightZ / safeCos).toFixed(2));
        nextElevZ = Number((baseElevZ - (diagHeightZ - baseHeightZ) * 0.5).toFixed(3));
        nextHeightZ = diagHeightZ;
        if (arrayResult.axis === "x") {
          nextRot.ryDeg = Number((baseRot.ryDeg + angleDeg).toFixed(2));
          nextMiterAxis = "x";
          nextMiterTopDeg = Number((-angleDeg).toFixed(1));
          nextMiterBotDeg = Number((-angleDeg).toFixed(1));
        } else if (arrayResult.axis === "y") {
          nextRot.rxDeg = Number((baseRot.rxDeg - angleDeg).toFixed(2));
          nextMiterAxis = "y";
          nextMiterTopDeg = Number((-angleDeg).toFixed(1));
          nextMiterBotDeg = Number((-angleDeg).toFixed(1));
        }
      }
    }

    cloned.elevationZ = nextElevZ;
    cloned.extrudeHeight = nextHeightZ;
    cloned.shellWallThickness = isHollow ? wallT : 0;

    const rawMiter = cloned.params?.miterBarSpec3D as
      | {
          cornerOrigin3D: { x: number; y: number; z: number };
          startMiterRatio?: number;
          endMiterRatio?: number;
        }
      | undefined;

    const baseClonedParams = structuredClone(sourceEntity.params) ?? {};
    if (hasAngle) {
      delete baseClonedParams.isHorizontalMiterBar3D;
      delete baseClonedParams.miterBarSpec3D;
    }

    cloned.params = {
      ...baseClonedParams,
      isIndependentBody3D: true,
      isSmartGrilleBar3D: true,
      booleanMode3D: "new_body",
      elevationZ: nextElevZ,
      extrudeHeight: nextHeightZ,
      extrudeHeightMm: nextHeightZ,
      shellWallThickness: isHollow ? wallT : 0,
      shellThicknessMm: isHollow ? wallT : 0,
      shellOpenCaps: isHollow
        ? sourceBody.shellOpenCaps.length > 0
          ? [...sourceBody.shellOpenCaps]
          : ["top", "bottom"]
        : [],
      edgeFilletRadiusMm: Number(sourceBody.edgeFilletRadiusMm ?? 0),
      edgeChamferDistMm: Number(sourceBody.edgeChamferDistMm ?? 0),
      cornerFilletsMm: { ...(sourceBody.cornerFilletsMm ?? {}) },
      cornerChamfersMm: { ...(sourceBody.cornerChamfersMm ?? {}) },
      miterCutTopDeg: nextMiterTopDeg,
      miterCutTopAxis: nextMiterAxis,
      miterCutBottomDeg: nextMiterBotDeg,
      miterCutBottomAxis: nextMiterAxis,
      rotation3D: nextRot,
      grilleAngleDeg: angleDeg,
      grilleAngleMode: angleMode,
      ...(!hasAngle && rawMiter && rawMiter.cornerOrigin3D
        ? {
            miterBarSpec3D: {
              ...rawMiter,
              cornerOrigin3D: {
                x: Number((rawMiter.cornerOrigin3D.x + dx).toFixed(3)),
                y: Number((rawMiter.cornerOrigin3D.y + dy).toFixed(3)),
                z: nextElevZ,
              },
              startMiterRatio: 0,
              endMiterRatio: 0,
            },
          }
        : {}),
      bodyName: hasAngle
        ? angleMode === "diagonal_span"
          ? `Barra Diagonal #${i + 1} (${nextHeightZ.toFixed(0)} mm · ∠ ${angleDeg}°)`
          : `Veneziana #${i + 1} (∠ ${angleDeg}°)`
        : `Barra de Grade #${i + 1} (90°/90°)`,
      bodyColorHex: sourceBody.colorHex || "#94A3B8",
      bodyMaterial: sourceBody.materialName || "Aço Estrutural ASTM A36",
    };

    createdEntities.push(cloned);
    createdIds.push(newId);
  }

  return {
    updatedEntities: [...entities, ...createdEntities],
    createdIds,
  };
}

// ============================================================================
// GERADOR DE "QUADRO EM 45° (ESQUADRIA)" NO ARRAY 3D
// Suporta Medida Interna (Vão Livre), Média (Centro a Centro) e Externa (Fora a Fora)
// + Divisões Internas Opcionais (Tubos de Grade) + Auto-Enquadramento à Esquerda
// ============================================================================

export type SmartArrayPanelTab3D = "grille" | "frame_45";
export type SmartFrameMeasureRef3D = "inner" | "mid" | "outer";
export type SmartFramePlane3D = "xy" | "xz" | "yz";
export type SmartFrameJointMode3D = "miter_45" | "butt_90";

export interface SmartMiterFrameParams3D {
  measureRef: SmartFrameMeasureRef3D;
  widthInputMm?: number;
  heightInputMm?: number;
  inputWidthMm?: number;
  inputHeightMm?: number;
  profileWidthMm?: number;
  profileCrossSectionMm?: number;
  profileDepthMm?: number;
  wallThicknessMm?: number;
  isHollowTube?: boolean;
  cornerFilletRadiusMm?: number;
  plane?: SmartFramePlane3D;
  jointMode?: SmartFrameJointMode3D;
  innerDivisionsCount?: number;
  center3D?: { x: number; y: number; z: number };
  origin3D?: { x: number; y: number; z: number };
}

export interface SmartMiterFrameMemberSpec3D {
  role: "top" | "bottom" | "left" | "right" | "inner_grille";
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  elevationZ: number;
  extrudeHeightMm: number;
  miterCutTopDeg: number;
  miterCutBottomDeg: number;
  miterAxis: "x" | "y";
  rotation3D: { rxDeg: number; ryDeg: number; rzDeg: number };
  longLengthMm: number;
  shortLengthMm: number;
  // Vetores explícitos livres de torção para barra tubular em meia-esquadria 45°
  cornerOrigin3D: { x: number; y: number; z: number };
  dirLen3D: { x: number; y: number; z: number };
  dirIn3D: { x: number; y: number; z: number };
  dirZ3D: { x: number; y: number; z: number };
  profileWidthMm: number;
  profileHeightZMm: number;
  wallThicknessMm: number;
  isHollowTube: boolean;
  cornerFilletRadiusMm: number;
  startMiterRatio: number;
  endMiterRatio: number;
  trapezoidPts2D: { x: number; y: number }[];
}

export interface SmartMiterFrameResult3D {
  measureRef: SmartFrameMeasureRef3D;
  plane: SmartFramePlane3D;
  jointMode: SmartFrameJointMode3D;
  widthInputMm: number;
  heightInputMm: number;
  profileWidthMm: number;
  profileCrossSectionMm: number;
  profileDepthMm: number;
  wallThicknessMm: number;
  isHollowTube: boolean;
  cornerFilletRadiusMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  midWidthMm: number;
  midHeightMm: number;
  outerWidthMm: number;
  outerHeightMm: number;
  miterAngleDeg: number;
  innerDivisionsCount: number;
  innerClearGapMm: number;
  innerPitchMm: number;
  members: SmartMiterFrameMemberSpec3D[];
  bbox3D: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  valid: boolean;
}

/**
 * Extrai a seção transversal real (W x H_z), espessura de parede e raio de canto
 * do tubo/perfil selecionado, ignorando rotações parasitas para montagem de quadro.
 */
export function extractTubeCrossSectionFromBody3D(
  body: DirectBody3D | null | undefined,
  maxFrameRefDimMm?: number,
): {
  profileWidthMm: number;
  profileDepthMm: number;
  wallThicknessMm: number;
  isHollowTube: boolean;
  cornerFilletRadiusMm: number;
} {
  if (!body) {
    return {
      profileWidthMm: 20,
      profileDepthMm: 20,
      wallThicknessMm: 2.0,
      isHollowTube: true,
      cornerFilletRadiusMm: 1.5,
    };
  }
  const dx = Math.max(4, Math.abs(body.bbox3D.maxX - body.bbox3D.minX));
  const dy = Math.max(4, Math.abs(body.bbox3D.maxY - body.bbox3D.minY));
  const dz = Math.max(4, Math.abs(body.bbox3D.maxZ - body.bbox3D.minZ));
  let w = Math.min(dx, dy);
  let hz = dz > Math.max(dx, dy) * 1.8 ? Math.max(dx, dy) : dz;

  // Se a peça base era um bloco largo cujas dimensões excedem 35% do quadro desejado,
  // adapta proporcionalmente a bitola para manter um quadro tubular válido (ex.: 20x20mm ou 40x40mm)
  if (maxFrameRefDimMm && maxFrameRefDimMm > 20 && w > maxFrameRefDimMm * 0.35) {
    const adapted = Math.max(10, Math.min(50, Math.round(maxFrameRefDimMm * 0.1)));
    w = adapted;
    if (hz > maxFrameRefDimMm * 0.35) {
      hz = adapted;
    }
  }

  const rawShellT = Number(body.shellThicknessMm ?? body.shellWallThicknessMm ?? 0);
  const isHollowTube = rawShellT > 0.2;
  const wallThicknessMm = isHollowTube
    ? Math.max(0.8, Math.min(Math.min(w, hz) * 0.4, rawShellT))
    : Math.max(1.2, Math.min(Math.min(w, hz) * 0.25, 2.0));
  const cornerFilletRadiusMm = Math.max(
    0,
    Math.min(Math.min(w, hz) * 0.35, Number(body.edgeFilletRadiusMm ?? 0)),
  );

  return {
    profileWidthMm: Number(w.toFixed(2)),
    profileDepthMm: Number(hz.toFixed(2)),
    wallThicknessMm: Number(wallThicknessMm.toFixed(2)),
    isHollowTube,
    cornerFilletRadiusMm: Number(cornerFilletRadiusMm.toFixed(2)),
  };
}

function evalMiterBarPoint3D(
  origin: { x: number; y: number; z: number },
  dirLen: { x: number; y: number; z: number },
  dirIn: { x: number; y: number; z: number },
  dirZ: { x: number; y: number; z: number },
  sAlongLen: number,
  uAcrossIn: number,
  zHeight: number,
): { x: number; y: number; z: number } {
  return {
    x: origin.x + sAlongLen * dirLen.x + uAcrossIn * dirIn.x + zHeight * dirZ.x,
    y: origin.y + sAlongLen * dirLen.y + uAcrossIn * dirIn.y + zHeight * dirZ.y,
    z: origin.z + sAlongLen * dirLen.z + uAcrossIn * dirIn.z + zHeight * dirZ.z,
  };
}

export function computeSmartMiterFrame3D(
  params: SmartMiterFrameParams3D,
): SmartMiterFrameResult3D {
  const rawW = Math.max(20, Number(params.widthInputMm ?? params.inputWidthMm ?? 1000) || 1000);
  const rawH = Math.max(20, Number(params.heightInputMm ?? params.inputHeightMm ?? 1000) || 1000);
  const minInputDim = Math.min(rawW, rawH);

  const rawD = params.profileWidthMm ?? params.profileCrossSectionMm ?? 20;
  let d = Math.max(5, Number(rawD) || 20);
  let depth = Math.max(5, Number(params.profileDepthMm ?? d) || d);

  // Garante que em modo Externa ou Média a bitola W nunca engula o vão livre (L - 2*W >= 4mm)
  if (params.measureRef === "outer" && d * 2 >= minInputDim - 4) {
    d = Math.max(5, Math.min(40, Math.floor((minInputDim * 0.2) * 10) / 10));
    depth = Math.min(depth, d);
  } else if (params.measureRef === "mid" && d >= minInputDim - 4) {
    d = Math.max(5, Math.min(40, Math.floor((minInputDim * 0.2) * 10) / 10));
    depth = Math.min(depth, d);
  }

  const L = rawW;
  const A = rawH;
  const wallT = Math.max(0.8, Math.min(Math.min(d, depth) * 0.4, Number(params.wallThicknessMm) || 2.0));
  const isHollowTube = params.isHollowTube ?? true;
  const cornerFilletRadiusMm = Math.max(
    0,
    Math.min(Math.min(d, depth) * 0.35, Number(params.cornerFilletRadiusMm ?? 0)),
  );
  const plane: SmartFramePlane3D = params.plane ?? "xy";
  const jointMode: SmartFrameJointMode3D = params.jointMode ?? "miter_45";
  const miterAngleDeg = jointMode === "miter_45" ? 45 : 0;
  const miterRatio = jointMode === "miter_45" ? 1 : 0;

  let innerWidthMm = L;
  let innerHeightMm = A;
  let midWidthMm = L + d;
  let midHeightMm = A + d;
  let outerWidthMm = L + 2 * d;
  let outerHeightMm = A + 2 * d;

  if (params.measureRef === "inner") {
    innerWidthMm = L;
    innerHeightMm = A;
    midWidthMm = L + d;
    midHeightMm = A + d;
    outerWidthMm = L + 2 * d;
    outerHeightMm = A + 2 * d;
  } else if (params.measureRef === "mid") {
    midWidthMm = L;
    midHeightMm = A;
    outerWidthMm = L + d;
    outerHeightMm = A + d;
    innerWidthMm = Math.max(2, L - d);
    innerHeightMm = Math.max(2, A - d);
  } else {
    outerWidthMm = L;
    outerHeightMm = A;
    midWidthMm = Math.max(d, L - d);
    midHeightMm = Math.max(d, A - d);
    innerWidthMm = Math.max(2, L - 2 * d);
    innerHeightMm = Math.max(2, A - 2 * d);
  }

  const cx = params.center3D?.x ?? 0;
  const cy = params.center3D?.y ?? 0;
  const cz = params.center3D?.z ?? 0;

  const halfOutW = outerWidthMm * 0.5;
  const halfOutH = outerHeightMm * 0.5;
  const halfInW = innerWidthMm * 0.5;

  const nDiv = Math.max(0, Math.min(60, Math.round(params.innerDivisionsCount ?? 0)));
  const grilleRes =
    nDiv > 0 && innerWidthMm > d
      ? computeSmartGrilleArray3D({
          mode: "by_count",
          spanMm: innerWidthMm,
          tubeWidthMm: d,
          count: nDiv,
          maxClearGapMm: 110,
          startInnerCoordMm: cx - halfInW,
          axis: "x",
        })
      : null;

  const innerClearGapMm = grilleRes ? grilleRes.clearGapMm : Number(innerWidthMm.toFixed(2));
  const innerPitchMm = grilleRes ? grilleRes.pitchCenterToCenterMm : 0;

  // Sistema de eixos do plano do quadro (U = Largura L_ext, V = Altura A_ext, N = Espessura H_z)
  let frameOrigin3D = { x: cx - halfOutW, y: cy - halfOutH, z: Math.max(0, cz) };
  let axisU = { x: 1, y: 0, z: 0 };
  let axisV = { x: 0, y: 1, z: 0 };
  let axisN = { x: 0, y: 0, z: 1 };

  if (plane === "xz") {
    frameOrigin3D = { x: cx - halfOutW, y: cy - depth * 0.5, z: Math.max(0, cz) };
    axisU = { x: 1, y: 0, z: 0 };
    axisV = { x: 0, y: 0, z: 1 };
    axisN = { x: 0, y: 1, z: 0 };
  } else if (plane === "yz") {
    frameOrigin3D = { x: cx - depth * 0.5, y: cy - halfOutW, z: Math.max(0, cz) };
    axisU = { x: 0, y: 1, z: 0 };
    axisV = { x: 0, y: 0, z: 1 };
    axisN = { x: 1, y: 0, z: 0 };
  }

  const makeBarSpec = (
    role: "bottom" | "right" | "top" | "left" | "inner_grille",
    label: string,
    cornerOrigin3D: { x: number; y: number; z: number },
    dirLen3D: { x: number; y: number; z: number },
    dirIn3D: { x: number; y: number; z: number },
    longLengthMm: number,
    shortLengthMm: number,
    startMiter: number,
    endMiter: number,
    miterAxis: "x" | "y",
  ): SmartMiterFrameMemberSpec3D => {
    const p00 = evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, 0, 0, 0);
    const p10 = evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, longLengthMm, 0, 0);
    const p11 = evalMiterBarPoint3D(
      cornerOrigin3D,
      dirLen3D,
      dirIn3D,
      axisN,
      longLengthMm - endMiter * d,
      d,
      0,
    );
    const p01 = evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, startMiter * d, d, 0);
    const topCorners = [
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, 0, 0, depth),
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, longLengthMm, 0, depth),
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, longLengthMm - endMiter * d, d, depth),
      evalMiterBarPoint3D(cornerOrigin3D, dirLen3D, dirIn3D, axisN, startMiter * d, d, depth),
    ];
    const allPts = [p00, p10, p11, p01, ...topCorners];
    let bMinX = Infinity;
    let bMaxX = -Infinity;
    let bMinY = Infinity;
    let bMaxY = -Infinity;
    let bMinZ = Infinity;
    let bMaxZ = -Infinity;
    for (const p of allPts) {
      if (p.x < bMinX) bMinX = p.x;
      if (p.x > bMaxX) bMaxX = p.x;
      if (p.y < bMinY) bMinY = p.y;
      if (p.y > bMaxY) bMaxY = p.y;
      if (p.z < bMinZ) bMinZ = p.z;
      if (p.z > bMaxZ) bMaxZ = p.z;
    }

    return {
      role,
      label,
      minX: Number(bMinX.toFixed(3)),
      maxX: Number(bMaxX.toFixed(3)),
      minY: Number(bMinY.toFixed(3)),
      maxY: Number(bMaxY.toFixed(3)),
      elevationZ: Number(bMinZ.toFixed(3)),
      extrudeHeightMm: Number(Math.max(1, bMaxZ - bMinZ).toFixed(3)),
      miterCutTopDeg: startMiter > 0 ? miterAngleDeg : 0,
      miterCutBottomDeg: endMiter > 0 ? -miterAngleDeg : 0,
      miterAxis,
      rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      longLengthMm: Number(longLengthMm.toFixed(2)),
      shortLengthMm: Number(shortLengthMm.toFixed(2)),
      cornerOrigin3D,
      dirLen3D,
      dirIn3D,
      dirZ3D: axisN,
      profileWidthMm: Number(d.toFixed(2)),
      profileHeightZMm: Number(depth.toFixed(2)),
      wallThicknessMm: Number(wallT.toFixed(2)),
      isHollowTube,
      cornerFilletRadiusMm,
      startMiterRatio: startMiter,
      endMiterRatio: endMiter,
      trapezoidPts2D: [
        { x: Number(p00.x.toFixed(2)), y: Number(p00.y.toFixed(2)) },
        { x: Number(p10.x.toFixed(2)), y: Number(p10.y.toFixed(2)) },
        { x: Number(p11.x.toFixed(2)), y: Number(p11.y.toFixed(2)) },
        { x: Number(p01.x.toFixed(2)), y: Number(p01.y.toFixed(2)) },
      ],
    };
  };

  // As 4 barras do Quadro 45° percorrendo o perímetro em sentido anti-horário sem nenhuma torção:
  // 1. Barra Frontal / Inferior (Comp = L_ext): Origem (0, 0), dir_len = +U, dir_in = +V
  const originBottom = { ...frameOrigin3D };
  // 2. Barra Direita (Comp = A_ext): Origem (L_ext, 0), dir_len = +V, dir_in = -U
  const originRight = {
    x: frameOrigin3D.x + outerWidthMm * axisU.x,
    y: frameOrigin3D.y + outerWidthMm * axisU.y,
    z: frameOrigin3D.z + outerWidthMm * axisU.z,
  };
  // 3. Barra Traseira / Superior (Comp = L_ext): Origem (L_ext, A_ext), dir_len = -U, dir_in = -V
  const originTop = {
    x: frameOrigin3D.x + outerWidthMm * axisU.x + outerHeightMm * axisV.x,
    y: frameOrigin3D.y + outerWidthMm * axisU.y + outerHeightMm * axisV.y,
    z: frameOrigin3D.z + outerWidthMm * axisU.z + outerHeightMm * axisV.z,
  };
  // 4. Barra Esquerda (Comp = A_ext): Origem (0, A_ext), dir_len = -V, dir_in = +U
  const originLeft = {
    x: frameOrigin3D.x + outerHeightMm * axisV.x,
    y: frameOrigin3D.y + outerHeightMm * axisV.y,
    z: frameOrigin3D.z + outerHeightMm * axisV.z,
  };

  const members: SmartMiterFrameMemberSpec3D[] = [
    makeBarSpec(
      "bottom",
      `Barra Frontal/Inferior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originBottom,
      axisU,
      axisV,
      outerWidthMm,
      innerWidthMm,
      miterRatio,
      miterRatio,
      "x",
    ),
    makeBarSpec(
      "right",
      `Barra Direita (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originRight,
      axisV,
      { x: -axisU.x, y: -axisU.y, z: -axisU.z },
      outerHeightMm,
      innerHeightMm,
      miterRatio,
      miterRatio,
      "y",
    ),
    makeBarSpec(
      "top",
      `Barra Traseira/Superior (${outerWidthMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originTop,
      { x: -axisU.x, y: -axisU.y, z: -axisU.z },
      { x: -axisV.x, y: -axisV.y, z: -axisV.z },
      outerWidthMm,
      innerWidthMm,
      miterRatio,
      miterRatio,
      "x",
    ),
    makeBarSpec(
      "left",
      `Barra Esquerda (${outerHeightMm.toFixed(0)} mm · ${miterAngleDeg}°/${miterAngleDeg}°)`,
      originLeft,
      { x: -axisV.x, y: -axisV.y, z: -axisV.z },
      axisU,
      outerHeightMm,
      innerHeightMm,
      miterRatio,
      miterRatio,
      "y",
    ),
  ];

  if (grilleRes && grilleRes.valid) {
    grilleRes.centerCoordsMm.forEach((xCenter, idx) => {
      const offsetAlongU = xCenter - (cx - halfOutW) - d * 0.5;
      const grilleOrigin = {
        x: frameOrigin3D.x + offsetAlongU * axisU.x + d * axisV.x,
        y: frameOrigin3D.y + offsetAlongU * axisU.y + d * axisV.y,
        z: frameOrigin3D.z + offsetAlongU * axisU.z + d * axisV.z,
      };
      members.push(
        makeBarSpec(
          "inner_grille",
          `Tubo Interno #${idx + 1} (${innerHeightMm.toFixed(0)} mm)`,
          grilleOrigin,
          axisV,
          axisU,
          Math.max(10, innerHeightMm),
          Math.max(10, innerHeightMm),
          0,
          0,
          "y",
        ),
      );
    });
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const m of members) {
    if (m.minX < minX) minX = m.minX;
    if (m.maxX > maxX) maxX = m.maxX;
    if (m.minY < minY) minY = m.minY;
    if (m.maxY > maxY) maxY = m.maxY;
    if (m.elevationZ < minZ) minZ = m.elevationZ;
    if (m.elevationZ + m.extrudeHeightMm > maxZ) maxZ = m.elevationZ + m.extrudeHeightMm;
  }

  return {
    measureRef: params.measureRef,
    plane,
    jointMode,
    widthInputMm: Number(L.toFixed(2)),
    heightInputMm: Number(A.toFixed(2)),
    profileWidthMm: Number(d.toFixed(2)),
    profileCrossSectionMm: Number(d.toFixed(2)),
    profileDepthMm: Number(depth.toFixed(2)),
    wallThicknessMm: Number(wallT.toFixed(2)),
    isHollowTube,
    cornerFilletRadiusMm,
    innerWidthMm: Number(innerWidthMm.toFixed(2)),
    innerHeightMm: Number(innerHeightMm.toFixed(2)),
    midWidthMm: Number(midWidthMm.toFixed(2)),
    midHeightMm: Number(midHeightMm.toFixed(2)),
    outerWidthMm: Number(outerWidthMm.toFixed(2)),
    outerHeightMm: Number(outerHeightMm.toFixed(2)),
    miterAngleDeg,
    innerDivisionsCount: nDiv,
    innerClearGapMm: Number(innerClearGapMm.toFixed(2)),
    innerPitchMm: Number(innerPitchMm.toFixed(2)),
    members,
    bbox3D: {
      minX: Number.isFinite(minX) ? minX : -halfOutW,
      maxX: Number.isFinite(maxX) ? maxX : halfOutW,
      minY: Number.isFinite(minY) ? minY : -halfOutH,
      maxY: Number.isFinite(maxY) ? maxY : halfOutH,
      minZ: Number.isFinite(minZ) ? minZ : 0,
      maxZ: Number.isFinite(maxZ) ? maxZ : depth,
    },
    valid: innerWidthMm >= 2 && innerHeightMm >= 2 && (nDiv === 0 || Boolean(grilleRes?.valid)),
  };
}

/**
 * Gera os loops 2D (externo e interno se vazado) da seção transversal (u, z) em [0..W] x [0..H_z]
 * e projeta sem torção nos planos de meia-esquadria 45° inicial e final:
 * P_inicio(u, z) = Origem + (startMiterRatio * u) * dir_len + u * dir_in + z * dir_z
 * P_fim(u, z)    = Origem + (Comp - endMiterRatio * u) * dir_len + u * dir_in + z * dir_z
 */
export function buildHorizontalMiterBar3DPolygons(member: {
  cornerOrigin3D: { x: number; y: number; z: number };
  dirLen3D: { x: number; y: number; z: number };
  dirIn3D: { x: number; y: number; z: number };
  dirZ3D: { x: number; y: number; z: number };
  longLengthMm: number;
  profileWidthMm: number;
  profileHeightZMm: number;
  wallThicknessMm?: number;
  isHollowTube?: boolean;
  startMiterRatio?: number;
  endMiterRatio?: number;
}): {
  outerStartLoop3D: { x: number; y: number; z: number }[];
  outerEndLoop3D: { x: number; y: number; z: number }[];
  innerStartLoop3D: { x: number; y: number; z: number }[] | null;
  innerEndLoop3D: { x: number; y: number; z: number }[] | null;
  quads3D: {
    id: string;
    kind: "top" | "bottom" | "outer_side" | "inner_side" | "inner_wall" | "miter_cap";
    vertices3D: { x: number; y: number; z: number }[];
    normal3D: { x: number; y: number; z: number };
  }[];
  featureLines3D: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ][];
} {
  const W = Math.max(4, member.profileWidthMm);
  const Hz = Math.max(4, member.profileHeightZMm);
  const Comp = Math.max(W * 1.05, member.longLengthMm);
  const sRatio = member.startMiterRatio ?? 1;
  const eRatio = member.endMiterRatio ?? 1;
  const rawT = Number(member.wallThicknessMm ?? 0);
  const isHollow = (member.isHollowTube ?? rawT > 0.2) && rawT > 0.2 && rawT < Math.min(W, Hz) * 0.46;
  const t = isHollow ? rawT : 0;

  // Seção transversal retangular (u, z):
  // 0: (0, 0) [Inferior Externo]
  // 1: (W, 0) [Inferior Interno]
  // 2: (W, Hz) [Superior Interno]
  // 3: (0, Hz) [Superior Externo]
  const outerProfileUZ = [
    { u: 0, z: 0 },
    { u: W, z: 0 },
    { u: W, z: Hz },
    { u: 0, z: Hz },
  ];

  const evalStart = (u: number, z: number) =>
    evalMiterBarPoint3D(
      member.cornerOrigin3D,
      member.dirLen3D,
      member.dirIn3D,
      member.dirZ3D,
      sRatio * u,
      u,
      z,
    );
  const evalEnd = (u: number, z: number) =>
    evalMiterBarPoint3D(
      member.cornerOrigin3D,
      member.dirLen3D,
      member.dirIn3D,
      member.dirZ3D,
      Comp - eRatio * u,
      u,
      z,
    );

  const outerStartLoop3D = outerProfileUZ.map((p) => evalStart(p.u, p.z));
  const outerEndLoop3D = outerProfileUZ.map((p) => evalEnd(p.u, p.z));

  const innerProfileUZ = isHollow
    ? [
        { u: t, z: t },
        { u: W - t, z: t },
        { u: W - t, z: Hz - t },
        { u: t, z: Hz - t },
      ]
    : null;

  const innerStartLoop3D = innerProfileUZ
    ? innerProfileUZ.map((p) => evalStart(p.u, p.z))
    : null;
  const innerEndLoop3D = innerProfileUZ
    ? innerProfileUZ.map((p) => evalEnd(p.u, p.z))
    : null;

  const computeNormal = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
  ) => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  };

  const quads3D: {
    id: string;
    kind: "top" | "bottom" | "outer_side" | "inner_side" | "inner_wall" | "miter_cap";
    vertices3D: { x: number; y: number; z: number }[];
    normal3D: { x: number; y: number; z: number };
  }[] = [];

  // 4 faces longitudinais externas conectando diretamente o índice i -> i+1 de P_inicio a P_fim:
  // i=0 (0->1): face inferior (z=0)
  // i=1 (1->2): face lateral interna (u=W)
  // i=2 (2->3): face superior (z=Hz)
  // i=3 (3->0): face lateral externa (u=0)
  const sideKinds: ("bottom" | "inner_side" | "top" | "outer_side")[] = [
    "bottom",
    "inner_side",
    "top",
    "outer_side",
  ];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    const v0 = outerStartLoop3D[i];
    const v1 = outerEndLoop3D[i];
    const v2 = outerEndLoop3D[next];
    const v3 = outerStartLoop3D[next];
    quads3D.push({
      id: `outer-${i}`,
      kind: sideKinds[i],
      vertices3D: [v0, v1, v2, v3],
      normal3D: computeNormal(v0, v1, v2),
    });
  }

  // Se o tubo é vazado, adiciona as 4 paredes longitudinais internas + anéis de topo nas 2 bocas em 45°
  if (innerStartLoop3D && innerEndLoop3D) {
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const v0 = innerStartLoop3D[next];
      const v1 = innerEndLoop3D[next];
      const v2 = innerEndLoop3D[i];
      const v3 = innerStartLoop3D[i];
      quads3D.push({
        id: `inner-${i}`,
        kind: "inner_wall",
        vertices3D: [v0, v1, v2, v3],
        normal3D: computeNormal(v0, v1, v2),
      });
      // Anel de fechamento da parede na boca inicial (45°)
      const s0 = outerStartLoop3D[i];
      const s1 = outerStartLoop3D[next];
      const s2 = innerStartLoop3D[next];
      const s3 = innerStartLoop3D[i];
      quads3D.push({
        id: `cap-start-${i}`,
        kind: "miter_cap",
        vertices3D: [s0, s3, s2, s1],
        normal3D: computeNormal(s0, s3, s2),
      });
      // Anel de fechamento da parede na boca final (45°)
      const e0 = outerEndLoop3D[i];
      const e1 = outerEndLoop3D[next];
      const e2 = innerEndLoop3D[next];
      const e3 = innerEndLoop3D[i];
      quads3D.push({
        id: `cap-end-${i}`,
        kind: "miter_cap",
        vertices3D: [e0, e1, e2, e3],
        normal3D: computeNormal(e0, e1, e2),
      });
    }
  } else {
    // Barra maciça: tampas completas nas duas extremidades 45°
    quads3D.push({
      id: "cap-start-solid",
      kind: "miter_cap",
      vertices3D: [
        outerStartLoop3D[0],
        outerStartLoop3D[3],
        outerStartLoop3D[2],
        outerStartLoop3D[1],
      ],
      normal3D: computeNormal(outerStartLoop3D[0], outerStartLoop3D[3], outerStartLoop3D[2]),
    });
    quads3D.push({
      id: "cap-end-solid",
      kind: "miter_cap",
      vertices3D: [
        outerEndLoop3D[0],
        outerEndLoop3D[1],
        outerEndLoop3D[2],
        outerEndLoop3D[3],
      ],
      normal3D: computeNormal(outerEndLoop3D[0], outerEndLoop3D[1], outerEndLoop3D[2]),
    });
  }

  // Arestas vivas (incluindo as linhas diagonais de corte 45° nos cantos!)
  const featureLines3D: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ][] = [];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    // Aresta longitudinal externa i
    featureLines3D.push([outerStartLoop3D[i], outerEndLoop3D[i]]);
    // Aresta do corte 45° inicial (incluindo a diagonal na face superior e inferior!)
    featureLines3D.push([outerStartLoop3D[i], outerStartLoop3D[next]]);
    // Aresta do corte 45° final
    featureLines3D.push([outerEndLoop3D[i], outerEndLoop3D[next]]);
  }

  return {
    outerStartLoop3D,
    outerEndLoop3D,
    innerStartLoop3D,
    innerEndLoop3D,
    quads3D,
    featureLines3D,
  };
}

/**
 * Gera os corpos 3D das 4 barras do Quadro em 45° (Esquadria) + N divisões internas opcionais.
 */
export function generateSmartMiterFrameEntities3D(
  entities: Entity[],
  sourceEntityId: string | null,
  sourceBodyOrFrameResult: DirectBody3D | SmartMiterFrameResult3D | null,
  maybeFrameResult?: SmartMiterFrameResult3D,
): { updatedEntities: Entity[]; createdIds: string[] } {
  const is3ArgCall =
    maybeFrameResult === undefined &&
    sourceBodyOrFrameResult !== null &&
    "members" in sourceBodyOrFrameResult;
  const sourceBody: DirectBody3D | null = is3ArgCall
    ? null
    : (sourceBodyOrFrameResult as DirectBody3D | null);
  const frameResult: SmartMiterFrameResult3D = is3ArgCall
    ? (sourceBodyOrFrameResult as SmartMiterFrameResult3D)
    : maybeFrameResult!;

  const createdEntities: Entity[] = [];
  const createdIds: string[] = [];

  const srcEnt = sourceEntityId ? entities.find((e) => e.id === sourceEntityId) : null;
  const srcParams = (srcEnt?.params ?? {}) as Record<string, unknown>;
  const wallT =
    sourceBody?.shellWallThicknessMm ||
    sourceBody?.shellThicknessMm ||
    srcEnt?.shellWallThickness ||
    Number(srcParams.shellThicknessMm ?? 0) ||
    frameResult.wallThicknessMm ||
    2.0;
  const isHollowTube =
    sourceBody !== null
      ? (sourceBody.shellThicknessMm ?? sourceBody.shellWallThicknessMm ?? 0) > 0.2 || frameResult.isHollowTube
      : frameResult.isHollowTube;
  const inheritedOpenCaps =
    sourceBody && sourceBody.shellOpenCaps.length > 0
      ? [...sourceBody.shellOpenCaps]
      : Array.isArray(srcParams.shellOpenCaps) && srcParams.shellOpenCaps.length > 0
        ? [...(srcParams.shellOpenCaps as string[])]
        : ["top", "bottom"];
  const inheritedFilletR = Number(
    sourceBody?.edgeFilletRadiusMm ?? srcParams.edgeFilletRadiusMm ?? frameResult.cornerFilletRadiusMm ?? 0,
  );
  const inheritedChamferD = Number(
    sourceBody?.edgeChamferDistMm ?? srcParams.edgeChamferDistMm ?? 0,
  );
  const inheritedCornerFillets =
    sourceBody?.cornerFilletsMm && Object.keys(sourceBody.cornerFilletsMm).length > 0
      ? { ...sourceBody.cornerFilletsMm }
      : {};
  const inheritedCornerChamfers =
    sourceBody?.cornerChamfersMm && Object.keys(sourceBody.cornerChamfersMm).length > 0
      ? { ...sourceBody.cornerChamfersMm }
      : {};
  const colorHex =
    sourceBody?.colorHex ||
    (typeof srcParams.bodyColorHex === "string" ? srcParams.bodyColorHex : "#94A3B8");
  const materialName =
    sourceBody?.materialName ||
    (typeof srcParams.bodyMaterial === "string" ? srcParams.bodyMaterial : "Aço Estrutural ASTM A36");
  const targetLayer = srcEnt?.layer || "corte";

  for (const m of frameResult.members) {
    const newId = uid();
    const pts =
      m.trapezoidPts2D && m.trapezoidPts2D.length >= 4
        ? m.trapezoidPts2D
        : [
            { x: Number(m.minX.toFixed(2)), y: Number(m.minY.toFixed(2)) },
            { x: Number(m.maxX.toFixed(2)), y: Number(m.minY.toFixed(2)) },
            { x: Number(m.maxX.toFixed(2)), y: Number(m.maxY.toFixed(2)) },
            { x: Number(m.minX.toFixed(2)), y: Number(m.maxY.toFixed(2)) },
          ];
    const ent: Entity = {
      id: newId,
      layer: targetLayer,
      type: "polyline",
      pts,
      closed: true,
      elevationZ: Number(m.elevationZ.toFixed(2)),
      extrudeHeight: Number(m.extrudeHeightMm.toFixed(2)),
      shellWallThickness: isHollowTube ? wallT : 0,
      params: {
        isIndependentBody3D: true,
        booleanMode3D: "new_body",
        isHorizontalMiterBar3D: true,
        miterBarSpec3D: {
          cornerOrigin3D: m.cornerOrigin3D,
          dirLen3D: m.dirLen3D,
          dirIn3D: m.dirIn3D,
          dirZ3D: m.dirZ3D,
          longLengthMm: m.longLengthMm,
          shortLengthMm: m.shortLengthMm,
          profileWidthMm: m.profileWidthMm,
          profileHeightZMm: m.profileHeightZMm,
          wallThicknessMm: isHollowTube ? wallT : 0,
          isHollowTube,
          cornerFilletRadiusMm: inheritedFilletR,
          cornerChamferDistMm: inheritedChamferD,
          startMiterRatio: m.startMiterRatio,
          endMiterRatio: m.endMiterRatio,
        },
        elevationZ: Number(m.elevationZ.toFixed(2)),
        extrudeHeight: Number(m.extrudeHeightMm.toFixed(2)),
        extrudeHeightMm: Number(m.extrudeHeightMm.toFixed(2)),
        shellWallThickness: isHollowTube ? wallT : 0,
        shellThicknessMm: isHollowTube ? wallT : 0,
        shellOpenCaps: isHollowTube ? inheritedOpenCaps : [],
        edgeFilletRadiusMm: inheritedFilletR,
        edgeChamferDistMm: inheritedChamferD,
        cornerFilletsMm: inheritedCornerFillets,
        cornerChamfersMm: inheritedCornerChamfers,
        miterCutTopDeg: m.miterCutTopDeg,
        miterCutTopAxis: m.miterAxis,
        miterCutBottomDeg: m.miterCutBottomDeg,
        miterCutBottomAxis: m.miterAxis,
        rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
        bodyName: m.label,
        bodyColorHex: colorHex,
        bodyMaterial: materialName,
        frameMemberRole: m.role,
        frameLongLengthMm: m.longLengthMm,
        frameShortLengthMm: m.shortLengthMm,
      },
    };
    createdEntities.push(ent);
    createdIds.push(newId);
  }

  // Substitui a peça base selecionada pelas 4 barras reais do quadro em meia-esquadria 45°
  const baseEntities = sourceEntityId
    ? entities.filter((e) => e.id !== sourceEntityId)
    : entities;

  return {
    updatedEntities: [...baseEntities, ...createdEntities],
    createdIds,
  };
}


