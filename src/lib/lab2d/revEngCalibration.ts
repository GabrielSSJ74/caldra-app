/**
 * CALDRA CHAMFER CAD — MOTOR DE CALIBRAÇÃO 1:1, MÚLTIPLAS REFERÊNCIAS,
 * HOMOGRAFIA DE 4 PONTOS E FOLHA DE CALIBRAÇÃO (Seção 4 · Testes T1, T2, T3)
 */

import type { Vec2 } from "./core";
import type {
  CalibrationReferenceLine,
  CalibrationResidualItem,
  HomographyQuadSpec,
  MultiCalibrationFitResult,
} from "./revEngTypes";

const EPS = 1e-9;

/**
 * 1. Calibração direta por 2 pontos com distância real conhecida (mm).
 */
export function calibrateByTwoPoints(
  p1Px: Vec2,
  p2Px: Vec2,
  knownLengthMm: number,
  axisHint: "free" | "horizontal" | "vertical" = "free",
): MultiCalibrationFitResult {
  const dx = p2Px.x - p1Px.x;
  const dy = p2Px.y - p1Px.y;
  const pixelDist = Math.hypot(dx, dy);

  if (!Number.isFinite(pixelDist) || pixelDist < 1e-3) {
    throw new Error("Os dois pontos de calibração são coincidentes ou inválidos.");
  }
  if (!Number.isFinite(knownLengthMm) || knownLengthMm <= 0) {
    throw new Error("A medida real informada deve ser maior que zero (mm).");
  }

  const mmPerPx = knownLengthMm / pixelDist;
  const pxPerMm = pixelDist / knownLengthMm;

  let rotationDeg = 0;
  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (axisHint === "horizontal") {
    rotationDeg = -rawAngleDeg;
  } else if (axisHint === "vertical") {
    rotationDeg = 90 - rawAngleDeg;
  }

  const residual: CalibrationResidualItem = {
    id: "ref-1",
    label: "Referência 2 Pontos",
    knownLengthMm,
    pixelDist,
    fittedLengthMm: knownLengthMm,
    errorMm: 0,
    compatible: true,
  };

  return {
    mmPerPx,
    pxPerMm,
    rotationDeg,
    rmsErrorMm: 0,
    maxErrorMm: 0,
    status: "ok",
    toleranceMm: 0.5,
    residuals: [residual],
    message: `Escala 1:1 calibrada: ${mmPerPx.toFixed(5)} mm/px (${pxPerMm.toFixed(2)} px/mm).`,
  };
}

/**
 * 2. Calibração por múltiplas referências via Mínimos Quadrados (Seção 4.2 · Testes T1 e T2).
 *
 * Minimiza a soma dos quadrados dos resíduos em milímetros:
 *   E(s) = sum_i (s * d_px,i - L_mm,i)^2
 *   dE/ds = 0  =>  s = (sum_i d_px,i * L_mm,i) / (sum_i d_px,i^2)
 */
export function calibrateByMultipleReferences(
  references: CalibrationReferenceLine[],
  toleranceMm = 0.5,
): MultiCalibrationFitResult {
  if (!references || references.length === 0) {
    throw new Error("Forneça ao menos uma referência de calibração.");
  }

  const validRefs = references.map((ref, idx) => {
    const dx = ref.p2Px.x - ref.p1Px.x;
    const dy = ref.p2Px.y - ref.p1Px.y;
    const pixelDist = Math.hypot(dx, dy);
    if (!Number.isFinite(pixelDist) || pixelDist < 1e-3) {
      throw new Error(`Referência "${ref.label || `#${idx + 1}`}" possui pontos coincidentes.`);
    }
    if (!Number.isFinite(ref.knownLengthMm) || ref.knownLengthMm <= 0) {
      throw new Error(`Referência "${ref.label || `#${idx + 1}`}" possui medida real inválida.`);
    }
    return { ref, dx, dy, pixelDist };
  });

  if (validRefs.length === 1) {
    const single = validRefs[0]!;
    return calibrateByTwoPoints(
      single.ref.p1Px,
      single.ref.p2Px,
      single.ref.knownLengthMm,
      single.ref.axisHint ?? "free",
    );
  }

  let sumPxMm = 0;
  let sumPx2 = 0;
  for (const item of validRefs) {
    sumPxMm += item.pixelDist * item.ref.knownLengthMm;
    sumPx2 += item.pixelDist * item.pixelDist;
  }

  const mmPerPx = sumPxMm / Math.max(sumPx2, EPS);
  const pxPerMm = 1 / Math.max(mmPerPx, EPS);

  // Calcula rotação média sugerida pelas referências com orientação conhecida (horizontal/vertical)
  let rotSin = 0;
  let rotCos = 0;
  let rotCount = 0;
  for (const item of validRefs) {
    const hint = item.ref.axisHint;
    if (hint === "horizontal" || hint === "vertical") {
      const ang = Math.atan2(item.dy, item.dx);
      const target = hint === "horizontal" ? 0 : Math.PI / 2;
      const delta = target - ang;
      rotSin += Math.sin(delta);
      rotCos += Math.cos(delta);
      rotCount++;
    }
  }
  const rotationDeg = rotCount > 0 ? (Math.atan2(rotSin, rotCos) * 180) / Math.PI : 0;

  let sumSqErr = 0;
  let maxErrorMm = 0;

  const residuals: CalibrationResidualItem[] = validRefs.map(({ ref, pixelDist }) => {
    const fittedLengthMm = mmPerPx * pixelDist;
    const errorMm = fittedLengthMm - ref.knownLengthMm;
    const absErr = Math.abs(errorMm);
    sumSqErr += errorMm * errorMm;
    if (absErr > maxErrorMm) {
      maxErrorMm = absErr;
    }
    return {
      id: ref.id,
      label: ref.label,
      knownLengthMm: ref.knownLengthMm,
      pixelDist,
      fittedLengthMm,
      errorMm,
      compatible: absErr <= toleranceMm,
    };
  });

  const rmsErrorMm = Math.sqrt(sumSqErr / validRefs.length);
  const status: "ok" | "alerta" | "incompativel" =
    maxErrorMm > toleranceMm
      ? "incompativel"
      : maxErrorMm > toleranceMm * 0.5
        ? "alerta"
        : "ok";

  const message =
    status === "incompativel"
      ? `Incompatível: erro máx ${maxErrorMm.toFixed(2)} mm excede a tolerância de ${toleranceMm.toFixed(2)} mm (possível perspectiva ou erro de digitação).`
      : status === "alerta"
        ? `Calibrado com alerta: RMS ${rmsErrorMm.toFixed(2)} mm (máx ${maxErrorMm.toFixed(2)} mm).`
        : `Calibrado com alta precisão: RMS ${rmsErrorMm.toFixed(3)} mm (${mmPerPx.toFixed(5)} mm/px).`;

  return {
    mmPerPx,
    pxPerMm,
    rotationDeg,
    rmsErrorMm,
    maxErrorMm,
    status,
    toleranceMm,
    residuals,
    message,
  };
}

/**
 * 3. Calibração por Scanner 2D (DPI + cota física de confirmação obrigatória).
 */
export function calibrateByScannerDpi(
  dpi: number,
  checkKnownMm?: number,
  checkPixelSpan?: number,
  toleranceMm = 0.4,
): MultiCalibrationFitResult {
  if (!Number.isFinite(dpi) || dpi <= 10) {
    throw new Error("Informe uma resolução de scanner válida (ex.: 300 ou 600 DPI).");
  }
  const mmPerPx = 25.4 / dpi;
  const pxPerMm = dpi / 25.4;

  if (
    typeof checkKnownMm === "number" &&
    checkKnownMm > 0 &&
    typeof checkPixelSpan === "number" &&
    checkPixelSpan > 0
  ) {
    const fittedMm = checkPixelSpan * mmPerPx;
    const errMm = fittedMm - checkKnownMm;
    const absErr = Math.abs(errMm);
    const status =
      absErr > toleranceMm ? "incompativel" : absErr > toleranceMm * 0.5 ? "alerta" : "ok";

    return {
      mmPerPx,
      pxPerMm,
      rotationDeg: 0,
      rmsErrorMm: absErr,
      maxErrorMm: absErr,
      status,
      toleranceMm,
      residuals: [
        {
          id: "scanner-check",
          label: `Conferência Scanner (${dpi} DPI)`,
          knownLengthMm: checkKnownMm,
          pixelDist: checkPixelSpan,
          fittedLengthMm: fittedMm,
          errorMm: errMm,
          compatible: absErr <= toleranceMm,
        },
      ],
      message:
        status === "incompativel"
          ? `Conferência do scanner divergiu em ${absErr.toFixed(2)} mm. Verifique se houve redimensionamento no driver.`
          : `Scanner ${dpi} DPI conferido (desvio ${absErr.toFixed(2)} mm).`,
    };
  }

  return {
    mmPerPx,
    pxPerMm,
    rotationDeg: 0,
    rmsErrorMm: 0,
    maxErrorMm: 0,
    status: "alerta",
    toleranceMm,
    residuals: [],
    message: `Escala nominal de ${dpi} DPI (${mmPerPx.toFixed(5)} mm/px). Confira ao menos 1 cota física.`,
  };
}

/**
 * Resolve sistema linear A * x = b por eliminação de Gauss com pivoteamento parcial.
 */
function solveLinearSystem8x8(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r]![col]!);
      if (val > maxVal) {
        maxVal = val;
        maxRow = r;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error("Quadro de 4 pontos degenerado ou colinear para homografia.");
    }
    if (maxRow !== col) {
      const tmp = M[col]!;
      M[col] = M[maxRow]!;
      M[maxRow] = tmp;
    }

    const pivot = M[col]![col]!;
    for (let c = col; c <= n; c++) {
      M[col]![c]! /= pivot;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r]![col]!;
      if (Math.abs(factor) < 1e-15) continue;
      for (let c = col; c <= n; c++) {
        M[r]![c]! -= factor * M[col]![c]!;
      }
    }
  }

  return M.map((row) => row[n]!);
}

/**
 * Calcula matriz de homografia 3x3 (9 elementos) que leva srcQuad -> dstQuad.
 */
export function computeHomographyMatrix3x3(
  srcQuad: [Vec2, Vec2, Vec2, Vec2],
  dstQuad: [Vec2, Vec2, Vec2, Vec2],
): number[] {
  // Verifica se não há 3 pontos colineares no quadrilátero de entrada
  const crossArea = (a: Vec2, b: Vec2, c: Vec2) =>
    Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (
    crossArea(srcQuad[0], srcQuad[1], srcQuad[2]) < 1e-2 ||
    crossArea(srcQuad[0], srcQuad[2], srcQuad[3]) < 1e-2 ||
    crossArea(srcQuad[1], srcQuad[2], srcQuad[3]) < 1e-2
  ) {
    throw new Error("Os 4 pontos de homografia não formam um quadrilátero válido (pontos colineares).");
  }

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = srcQuad[i]!;
    const { x: u, y: v } = dstQuad[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem8x8(A, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

/**
 * Aplica uma matriz de homografia 3x3 H a um ponto 2D.
 */
export function applyHomographyToPoint(H: number[], pt: Vec2): Vec2 {
  const denom = H[6]! * pt.x + H[7]! * pt.y + H[8]!;
  const safeDenom = Math.abs(denom) < 1e-12 ? (denom >= 0 ? 1e-12 : -1e-12) : denom;
  return {
    x: (H[0]! * pt.x + H[1]! * pt.y + H[2]!) / safeDenom,
    y: (H[3]! * pt.x + H[4]! * pt.y + H[5]!) / safeDenom,
  };
}

/**
 * 4. Retificação de Perspectiva por Homografia de 4 Pontos (Seção 4.2 · Teste T3).
 *
 * Mapeia os 4 cantos medidos em pixels para o retângulo físico exato
 * [(0,0), (W,0), (W,H), (0,H)] em milímetros e calcula o erro residual.
 */
export function computeRectifiedHomography(
  cornersPx: [Vec2, Vec2, Vec2, Vec2],
  realWidthMm: number,
  realHeightMm: number,
  verificationPairs?: { srcPx: Vec2; expectedMm: Vec2 }[],
): HomographyQuadSpec & { matrixH: number[]; inverseMatrixH: number[] } {
  if (!Number.isFinite(realWidthMm) || realWidthMm <= 0 || !Number.isFinite(realHeightMm) || realHeightMm <= 0) {
    throw new Error("As dimensões reais do retângulo de homografia devem ser positivas (mm).");
  }

  const dstQuadMm: [Vec2, Vec2, Vec2, Vec2] = [
    { x: 0, y: 0 },
    { x: realWidthMm, y: 0 },
    { x: realWidthMm, y: realHeightMm },
    { x: 0, y: realHeightMm },
  ];

  const matrixH = computeHomographyMatrix3x3(cornersPx, dstQuadMm);
  const inverseMatrixH = computeHomographyMatrix3x3(dstQuadMm, cornersPx);

  const testSamples = [
    ...cornersPx.map((srcPx, i) => ({ srcPx, expectedMm: dstQuadMm[i]! })),
    ...(verificationPairs ?? []),
  ];

  let sumSq = 0;
  let maxCornerErrorMm = 0;

  for (const sample of testSamples) {
    const projectedMm = applyHomographyToPoint(matrixH, sample.srcPx);
    const err = Math.hypot(
      projectedMm.x - sample.expectedMm.x,
      projectedMm.y - sample.expectedMm.y,
    );
    sumSq += err * err;
    if (err > maxCornerErrorMm) {
      maxCornerErrorMm = err;
    }
  }

  const residualRmsMm = Math.sqrt(sumSq / testSamples.length);

  return {
    id: `homog-${Date.now()}`,
    cornersPx,
    realWidthMm,
    realHeightMm,
    residualRmsMm,
    maxCornerErrorMm,
    matrixH,
    inverseMatrixH,
  };
}

/**
 * 5. Gerador da Folha de Calibração CHAMFER 1:1 (SVG imprimível com marcas fiduciais).
 *
 * Contém:
 * - Quadro fiducial externo de 170.0 × 250.0 mm com 4 alvos de canto (C1..C4)
 * - Barra de escala primária de 100.0 mm horizontais e 100.0 mm verticais
 * - Instruções de impressão em escala 100% (1:1 real)
 */
export function generateCalibrationSheetSvg(options?: {
  sheetTitle?: string;
  quadWidthMm?: number;
  quadHeightMm?: number;
  barLengthMm?: number;
}): {
  svgContent: string;
  quadWidthMm: number;
  quadHeightMm: number;
  barLengthMm: number;
  fiducialCentersMm: [Vec2, Vec2, Vec2, Vec2];
} {
  const pageW = 210; // A4 mm
  const pageH = 297; // A4 mm
  const quadW = options?.quadWidthMm ?? 170;
  const quadH = options?.quadHeightMm ?? 240;
  const barLen = options?.barLengthMm ?? 100;
  const title = options?.sheetTitle ?? "FOLHA DE CALIBRAÇÃO CHAMFER CAD 1:1";

  const x0 = (pageW - quadW) / 2; // 20 mm
  const y0 = 24;
  const x1 = x0 + quadW; // 190 mm
  const y1 = y0 + quadH; // 264 mm

  const fiducialCentersMm: [Vec2, Vec2, Vec2, Vec2] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];

  const renderTargetCross = (cx: number, cy: number, code: string) => `
    <g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)})">
      <circle cx="0" cy="0" r="6" fill="none" stroke="#000000" stroke-width="0.45" />
      <circle cx="0" cy="0" r="2.5" fill="none" stroke="#000000" stroke-width="0.35" />
      <line x1="-9" y1="0" x2="9" y2="0" stroke="#000000" stroke-width="0.4" />
      <line x1="0" y1="-9" x2="0" y2="9" stroke="#000000" stroke-width="0.4" />
      <text x="7.5" y="-5.5" font-family="monospace" font-size="3.2" font-weight="bold" fill="#000000">${code} (${cx.toFixed(0)},${cy.toFixed(0)})</text>
    </g>
  `;

  // Ticks para a barra de 100 mm
  const barX = x0 + 15;
  const barY = y1 - 18;
  const ticks: string[] = [];
  for (let mm = 0; mm <= barLen; mm += 1) {
    const is10 = mm % 10 === 0;
    const is5 = mm % 5 === 0;
    const h = is10 ? 5.5 : is5 ? 3.8 : 2.2;
    const sw = is10 ? 0.45 : 0.25;
    const tx = barX + mm;
    ticks.push(
      `<line x1="${tx.toFixed(2)}" y1="${barY.toFixed(2)}" x2="${tx.toFixed(2)}" y2="${(barY - h).toFixed(2)}" stroke="#000000" stroke-width="${sw}" />`,
    );
    if (is10) {
      ticks.push(
        `<text x="${tx.toFixed(2)}" y="${(barY + 4.2).toFixed(2)}" text-anchor="middle" font-family="monospace" font-size="2.8" font-weight="bold" fill="#000000">${mm}</text>`,
      );
    }
  }

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#FFFFFF" />
  
  <!-- Cabeçalho -->
  <text x="${pageW / 2}" y="12" text-anchor="middle" font-family="monospace" font-size="4.5" font-weight="bold" fill="#000000">${title}</text>
  <text x="${pageW / 2}" y="17" text-anchor="middle" font-family="monospace" font-size="2.8" fill="#334155">IMPRIMIR EM ESCALA REAL 100% (SEM AJUSTAR À PÁGINA) · QUADRO FIDUCIAL ${quadW.toFixed(1)} × ${quadH.toFixed(1)} MM</text>

  <!-- Retângulo Fiducial de Homografia -->
  <rect x="${x0}" y="${y0}" width="${quadW}" height="${quadH}" fill="none" stroke="#000000" stroke-width="0.35" stroke-dasharray="3,2" />

  <!-- 4 Alvos Fiduciais nos Cantos -->
  ${renderTargetCross(x0, y0, "C1")}
  ${renderTargetCross(x1, y0, "C2")}
  ${renderTargetCross(x1, y1, "C3")}
  ${renderTargetCross(x0, y1, "C4")}

  <!-- Área Central Livre para Apoiar a Peça -->
  <text x="${pageW / 2}" y="${(y0 + y1) / 2 - 4}" text-anchor="middle" font-family="monospace" font-size="4" font-weight="bold" fill="#94A3B8">POSICIONE A PEÇA MECÂNICA DENTRO DESTE QUADRO</text>
  <text x="${pageW / 2}" y="${(y0 + y1) / 2 + 2}" text-anchor="middle" font-family="monospace" font-size="2.8" fill="#94A3B8">Fotografe mantendo os 4 alvos C1–C4 visíveis para retificação automática de perspectiva</text>

  <!-- Barra de Calibração Linear Exata (${barLen} mm) -->
  <g>
    <line x1="${barX}" y1="${barY}" x2="${barX + barLen}" y2="${barY}" stroke="#000000" stroke-width="0.6" />
    ${ticks.join("\n    ")}
    <text x="${barX + barLen / 2}" y="${barY - 7.5}" text-anchor="middle" font-family="monospace" font-size="3.2" font-weight="bold" fill="#000000">BARRA DE AFERIÇÃO: ${barLen.toFixed(1)} MM EXATOS (CONFIRA COM PAQUÍMETRO APÓS IMPRIMIR)</text>
  </g>

  <!-- Rodapé Técnico -->
  <text x="${pageW / 2}" y="${pageH - 8}" text-anchor="middle" font-family="monospace" font-size="2.6" fill="#475569">CALDRA CHAMFER CAD · ENGENHARIA REVERSA DE PRECISÃO · UNIDADE: MILÍMETROS (MM)</text>
</svg>`;

  return {
    svgContent,
    quadWidthMm: quadW,
    quadHeightMm: quadH,
    barLengthMm: barLen,
    fiducialCentersMm,
  };
}
