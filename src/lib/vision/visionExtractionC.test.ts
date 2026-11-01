import { describe, expect, it } from "vitest";
import { binarize, denoise } from "./imagePreprocessor";
import {
  detectAndExcludeScreenUI,
  runExtractionPipelineS2ToS5,
} from "./imageExtractionPipeline";
import { extractContoursLegacy } from "./visionEngine";
import {
  createBlankImage,
  drawSyntheticCircleStroke,
  drawSyntheticFilledRingOrDisc,
  fitCircleTaubinGaussNewton,
} from "./visionMetricsAndHarness";
import { analyzeRaster } from "./vectorizer";

function drawLineStroke(
  img: ImageData,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidthPx: number,
  color: [number, number, number] = [20, 20, 20],
): void {
  const { width: w, height: h, data } = img;
  const half = strokeWidthPx / 2;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - half - 2));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x1, x2) + half + 2));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - half - 2));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y1, y2) + half + 2));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = lenSq > 1e-9 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq)) : 0;
      const dist = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (dist <= half) {
        const idx = (y * w + x) * 4;
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
      }
    }
  }
}

describe("FASE C — Extração por Tipo de Imagem, Sub-pixel Marching Squares e Deduplicação de Laços Gêmeos (Seções 5, 6 e 7)", () => {
  it("S3/S4 — G1 em máscara raster real: colapsa as 2 bordas do traço (w = 1, 3, 6 e 12 px) em 1 único contorno sub-pixel com erro de raio <= 0,35 px", () => {
    for (const w of [1, 3, 6, 12] as const) {
      const img = createBlankImage(280, 280);
      drawSyntheticCircleStroke(img, 140, 140, 100, w);
      const bin = denoise(binarize(img), 0);

      const res = runExtractionPipelineS2ToS5(bin, { imageKind: "auto" });
      expect(res.classification.effectiveKind).toBe("traco");
      expect(res.contours).toHaveLength(1);
      expect(res.fusionLog.length).toBeGreaterThanOrEqual(1);
      expect(res.fusionLog[0]!.reason).toBe("twin_stroke_band");

      const fit = fitCircleTaubinGaussNewton(res.contours[0]!.pts)!;
      expect(fit).not.toBeNull();
      expect(Math.hypot(fit.cx - 140, fit.cy - 140)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(fit.r - 100)).toBeLessThanOrEqual(0.35);
    }
  });

  it("Prova de eliminação do furo duplo (Fotos 1 e 2 do CypCut): placa com 2 furos de R = 20 px e traço w = 6 px gera 6 contornos no legado, mas exatos 3 contornos na Fase C", () => {
    const img = createBlankImage(360, 260);
    // Contorno externo retangular desenhado com traço w = 6 px
    drawLineStroke(img, 30, 30, 330, 30, 6);
    drawLineStroke(img, 330, 30, 330, 230, 6);
    drawLineStroke(img, 330, 230, 30, 230, 6);
    drawLineStroke(img, 30, 230, 30, 30, 6);
    // Dois furos redondos R = 20 px desenhados com o mesmo traço w = 6 px
    drawSyntheticCircleStroke(img, 110, 130, 20, 6);
    drawSyntheticCircleStroke(img, 250, 130, 20, 6);

    const bin = denoise(binarize(img), 0);

    // No extrator legado (corte fixo area/parent.area > 0.55 sem contenção espacial nem w₀):
    // cada furo R=20, w=6 tem (17/23)^2 = 0.546 <= 0.55 e gera DOIS contornos concêntricos!
    const legacy = extractContoursLegacy(bin);
    expect(legacy.length).toBeGreaterThanOrEqual(5);

    // No extrator da Fase C (com EDT w₀ = 6 px e contenção espacial real pointInPolygon):
    // q = w_faixa / w₀ ≈ 1.0 <= 1.6 -> cada traço colapsa em 1 única linha central!
    const phaseC = runExtractionPipelineS2ToS5(bin, { imageKind: "auto" });
    expect(phaseC.classification.effectiveKind).toBe("traco");
    expect(phaseC.contours).toHaveLength(3); // 1 contorno externo + 2 furos únicos
    expect(phaseC.fusionLog).toHaveLength(3);

    // Verifica que os 2 furos extraídos têm raio sub-pixel exato R ≈ 20 px
    const holeContours = phaseC.contours.filter((c) => c.area < 5000);
    expect(holeContours).toHaveLength(2);
    for (const hc of holeContours) {
      const fit = fitCircleTaubinGaussNewton(hc.pts)!;
      expect(Math.abs(fit.r - 20)).toBeLessThanOrEqual(0.4);
    }
  });

  it("S3/S4 — G2 (disco cheio) e G3 (arruela sólida): classifica como SILHUETA e preserva 1 contorno em G2 e 2 contornos em G3", () => {
    // G2: Disco sólido R = 100
    const imgG2 = createBlankImage(260, 260);
    drawSyntheticFilledRingOrDisc(imgG2, 130, 130, 100, 0, [20, 20, 20]);
    const binG2 = denoise(binarize(imgG2), 0);
    const resG2 = runExtractionPipelineS2ToS5(binG2, { imageKind: "auto" });
    expect(resG2.classification.effectiveKind).toBe("silhueta");
    expect(resG2.contours).toHaveLength(1);
    const fitG2 = fitCircleTaubinGaussNewton(resG2.contours[0]!.pts)!;
    expect(Math.abs(fitG2.r - 100)).toBeLessThanOrEqual(0.45);

    // G3: Arruela sólida R_out = 100, R_in = 60
    const imgG3 = createBlankImage(260, 260);
    drawSyntheticFilledRingOrDisc(imgG3, 130, 130, 100, 60, [20, 20, 20]);
    const binG3 = denoise(binarize(imgG3), 0);
    const resG3 = runExtractionPipelineS2ToS5(binG3, { imageKind: "auto" });
    expect(resG3.classification.effectiveKind).toBe("silhueta");
    expect(resG3.contours).toHaveLength(2);
    expect(resG3.contours[0]!.hole).toBe(false);
    expect(resG3.contours[1]!.hole).toBe(true);
  });

  it("S4/S5 — G4 (duas circunferências finas concêntricas R = 100 e R = 60, w = 3 px): preserva os 2 círculos colapsando cada traço em sua linha central", () => {
    const imgG4 = createBlankImage(260, 260);
    drawSyntheticCircleStroke(imgG4, 130, 130, 100, 3);
    drawSyntheticCircleStroke(imgG4, 130, 130, 60, 3);
    const binG4 = denoise(binarize(imgG4), 0);

    const resG4 = runExtractionPipelineS2ToS5(binG4, { imageKind: "auto" });
    expect(resG4.classification.effectiveKind).toBe("traco");
    expect(resG4.contours).toHaveLength(2);
    expect(resG4.fusionLog).toHaveLength(2);

    const radii = resG4.contours
      .map((c) => fitCircleTaubinGaussNewton(c.pts)!.r)
      .sort((a, b) => b - a);
    expect(Math.abs(radii[0]! - 100)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(radii[1]! - 60)).toBeLessThanOrEqual(0.35);
  });

  it("S4/S5 — G5(a,b,c,d) em máscaras raster reais: distingue anel largo (2), faixa ambígua (pergunta + override) e traço normal (1)", () => {
    // G5(a): largura 40 px, R_médio = 80 (R_out = 100, R_in = 60) em modo "traco" forçado -> 2 contornos
    const imgA = createBlankImage(260, 260);
    drawSyntheticCircleStroke(imgA, 130, 130, 80, 40);
    const binA = denoise(binarize(imgA), 0);
    const resA = runExtractionPipelineS2ToS5(binA, { imageKind: "traco" });
    expect(resA.contours).toHaveLength(2);

    // G5(b): anel de largura 12 px (R_médio = 70) numa imagem com outros traços finos de w₀ = 3 px -> 2 contornos para o anel + 2 para os traços finos
    const imgB = createBlankImage(320, 260);
    drawSyntheticCircleStroke(imgB, 120, 130, 70, 12);
    drawSyntheticCircleStroke(imgB, 260, 70, 30, 3);
    drawSyntheticCircleStroke(imgB, 260, 190, 30, 3);
    const binB = denoise(binarize(imgB), 0);
    const resB = runExtractionPipelineS2ToS5(binB, { imageKind: "traco" });
    expect(resB.contours).toHaveLength(4);

    // G5(c): faixa de 20 px com R_médio = 90 sozinha (q_rel = 20/90 = 0.222 ∈ (0.15, 0.30)) -> sinaliza ambiguidade e aceita decisão manual
    const imgC = createBlankImage(260, 260);
    drawSyntheticCircleStroke(imgC, 130, 130, 90, 20);
    const binC = denoise(binarize(imgC), 0);
    const resC = runExtractionPipelineS2ToS5(binC, { imageKind: "traco" });
    expect(resC.ambiguousTwins).toHaveLength(1);
    expect(resC.ambiguousTwins[0]!.promptPtBr).toContain("ambígua");

    // Se o usuário escolher "ring" (anel -> 2 entidades):
    const resCRing = runExtractionPipelineS2ToS5(binC, {
      imageKind: "traco",
      twinOverrides: { loop_1: "ring" },
    });
    expect(resCRing.contours).toHaveLength(2);

    // Se o usuário escolher "stroke" (traço -> 1 entidade):
    const resCStroke = runExtractionPipelineS2ToS5(binC, {
      imageKind: "traco",
      twinOverrides: { loop_1: "stroke" },
    });
    expect(resCStroke.contours).toHaveLength(1);
  });

  it("S2 — Exclusão de interface de tela (G12): remove grade fraca, seta colorida isolada e moldura extrema, permitindo reinclusão pelo usuário", () => {
    const W = 240,
      H = 200;
    const img = createBlankImage(W, H, [18, 22, 28, 255]); // fundo escuro de tela CAD
    // Grade fraca no fundo (cinza escuro RGB 45, 50, 58)
    for (let x = 20; x < W; x += 20) {
      drawLineStroke(img, x, 0, x, H - 1, 1, [45, 50, 58]);
    }
    // Moldura na borda extrema (x=0..W-1, y=0..H-1)
    drawLineStroke(img, 0, 0, W - 1, 0, 1, [120, 120, 120]);
    drawLineStroke(img, 0, H - 1, W - 1, H - 1, 1, [120, 120, 120]);
    drawLineStroke(img, 0, 0, 0, H - 1, 1, [120, 120, 120]);
    drawLineStroke(img, W - 1, 0, W - 1, H - 1, 1, [120, 120, 120]);
    // Pequeno marcador colorido de seta verde isolado (raio 4 px)
    drawSyntheticFilledRingOrDisc(img, 35, 35, 4, 0, [0, 240, 60]);
    // Peça principal: círculo brilhante R = 55 px com traço de 2 px
    drawSyntheticCircleStroke(img, 120, 100, 55, 2, [245, 245, 250]);

    const rawBin = binarize(img, true);
    const s2 = detectAndExcludeScreenUI(img, rawBin);
    expect(s2.excludedUiElements.length).toBeGreaterThanOrEqual(2);

    const s2s5 = runExtractionPipelineS2ToS5(img, { invert: true });
    expect(s2s5.classification.effectiveKind).toBe("linha");
    expect(s2s5.contours).toHaveLength(1);
    const fit = fitCircleTaubinGaussNewton(s2s5.contours[0]!.pts)!;
    expect(Math.abs(fit.r - 55)).toBeLessThanOrEqual(0.5);
  });

  it("Integração ponta a ponta com analyzeRaster (Consensus Engine sem sobreposição entre tipos): 1 círculo de traço produz exatamente 1 primitiva CIRCLE e 0 polilinhas/linhas parasitas", () => {
    const img = createBlankImage(260, 260);
    drawSyntheticCircleStroke(img, 130, 130, 80, 6);

    const analysis = analyzeRaster(img, {
      tolerance: "media",
      iterativeAutoCorrect: true,
    });

    expect(analysis.stats.circles).toBe(1);
    expect(analysis.stats.polylines).toBe(0);
    expect(analysis.stats.lines).toBe(0);
    expect(analysis.prims).toHaveLength(1);
    expect(analysis.prims[0]!.kind).toBe("circle");
    if (analysis.prims[0]!.kind === "circle") {
      expect(Math.abs(analysis.prims[0]!.r - 80)).toBeLessThanOrEqual(0.5);
    }
  });
});
