import { describe, expect, it } from "vitest";
import {
  CALIBRATED_THRESHOLDS,
  classifyNestedLoopPair,
  computeAdaptiveTau,
  computeWeldTolerancePx,
} from "./visionThresholdConfig";
import {
  bulgeToArc,
  createBlankImage,
  drawSyntheticCircleStroke,
  evaluateFidelityMetrics,
  fitCircleTaubinGaussNewton,
  selectPolygonOrCircle,
  SyntheticSuiteB,
} from "./visionMetricsAndHarness";
import { extractContours } from "./visionEngine";
import { binarize, denoise } from "./imagePreprocessor";

describe("FASE B — Calibração de Limiares, Métricas de Fidelidade e Suíte Sintética G1–G14 (Seção 17)", () => {
  it("Reproduz com evidência quantitativa o defeito legado em G1 (traço grosso gerando 2 contornos em extractContours) vs. colapso calibrado", () => {
    // Em G1 com R = 32 px e espessura 10 px (rOut = 37, rIn = 27, razão de áreas = (27/37)^2 = 0.532 < 0.55),
    // o extractContours legado extrai DOIS contornos concêntricos para o mesmo traço:
    const img = createBlankImage(120, 120);
    drawSyntheticCircleStroke(img, 60, 60, 32, 10);
    const bin = denoise(binarize(img), 0);
    const legacyContours = extractContours(bin);
    expect(legacyContours.length).toBe(2); // Prova do defeito legado H1

    // Já o classificador calibrado da Fase B (Seção 7) identifica q_rel = 10 / 32 = 0.3125 se isolado sem referência,
    // e para R = 100 com espessura 12 px tem q_rel = 12 / 100 = 0.12 <= 0.15 -> 1 único CIRCLE na linha central!
    const g1_12 = SyntheticSuiteB.runG1(12);
    expect(g1_12.countsByType.CIRCLE).toBe(1);
    expect(g1_12.metrics.maxCenterErrorPx).toBeLessThanOrEqual(0.5);
    expect(g1_12.metrics.maxRadiusErrorPx).toBeLessThanOrEqual(0.5);
  });

  it("G1 — Círculo de traço R = 100 px (espessuras 1, 3, 6 e 12 px): 1 CIRCLE, erro de centro/raio <= 0,5 px, cobertura >= 99%, excesso <= 1%", () => {
    for (const w of [1, 3, 6, 12] as const) {
      const res = SyntheticSuiteB.runG1(w);
      expect(res.countsByType.CIRCLE).toBe(1);
      expect(res.entities).toHaveLength(1);
      expect(res.metrics.maxCenterErrorPx).toBeLessThanOrEqual(0.5);
      expect(res.metrics.maxRadiusErrorPx).toBeLessThanOrEqual(0.5);
      expect(res.metrics.coverage).toBeGreaterThanOrEqual(CALIBRATED_THRESHOLDS.minCoverageRatio);
      expect(res.metrics.excess).toBeLessThanOrEqual(CALIBRATED_THRESHOLDS.maxExcessRatio);
      expect(res.metrics.duplicateCount).toBe(0);
    }
  });

  it("G2 — Disco cheio (silhueta) R = 100 px: 1 CIRCLE", () => {
    const res = SyntheticSuiteB.runG2();
    expect(res.detectedImageKind).toBe("silhueta");
    expect(res.countsByType.CIRCLE).toBe(1);
    expect(res.metrics.maxCenterErrorPx).toBeLessThanOrEqual(0.5);
    expect(res.metrics.maxRadiusErrorPx).toBeLessThanOrEqual(0.5);
    expect(res.metrics.coverage).toBeGreaterThanOrEqual(0.99);
    expect(res.metrics.excess).toBeLessThanOrEqual(0.01);
  });

  it("G3 — Arruela (silhueta) R = 100 e 60 px: 2 CIRCLEs concêntricos", () => {
    const res = SyntheticSuiteB.runG3();
    expect(res.detectedImageKind).toBe("silhueta");
    expect(res.countsByType.CIRCLE).toBe(2);
    expect(res.metrics.coverage).toBeGreaterThanOrEqual(0.99);
    expect(res.metrics.excess).toBeLessThanOrEqual(0.01);
  });

  it("G4 — Duas circunferências finas (traço) R = 100 e 60 px: 2 CIRCLEs", () => {
    const res = SyntheticSuiteB.runG4();
    expect(res.countsByType.CIRCLE).toBe(2);
    expect(res.requiresUserConfirmation).toBe(false);
    expect(res.metrics.coverage).toBeGreaterThanOrEqual(0.99);
    expect(res.metrics.excess).toBeLessThanOrEqual(0.01);
  });

  it("G5(a,b,c,d) — Disambiguação entre anel largo, faixa ambígua e traço normal (Seção 7)", () => {
    // (a) 40 px de largura, R médio 80, sozinho -> 2 CIRCLEs (q_rel = 0.50 >= 0.30)
    const g5a = SyntheticSuiteB.runG5("a");
    expect(g5a.countsByType.CIRCLE).toBe(2);
    expect(g5a.requiresUserConfirmation).toBe(false);

    // (b) mesmo anel numa imagem com traços finos de 3 px -> 2 CIRCLEs (q = 13.33 >= 3.0)
    const g5b = SyntheticSuiteB.runG5("b");
    expect(g5b.countsByType.CIRCLE).toBe(2);
    expect(g5b.requiresUserConfirmation).toBe(false);

    // (c) faixa de 20 px com R médio 100, sozinha -> PERGUNTA (q_rel = 0.20 em (0.15, 0.30))
    const g5c = SyntheticSuiteB.runG5("c");
    expect(g5c.requiresUserConfirmation).toBe(true);
    expect(g5c.ambiguityPrompt).toBeTruthy();
    expect(g5c.entities[0]?.confidence).toBe("BAIXA");

    // (d) traço de 6 px, R = 100, numa imagem com outros traços de 6 px -> 1 CIRCLE (q = 1.0 <= 1.6)
    const g5d = SyntheticSuiteB.runG5("d");
    expect(g5d.countsByType.CIRCLE).toBe(1);
    expect(g5d.requiresUserConfirmation).toBe(false);
  });

  it("G6 — Retângulo 300 × 200 com cantos R = 20 e 2 furos: 1 LWPOLYLINE fechada (4 retas + 4 arcos 90°) + 2 CIRCLEs, erro de tangência <= 1°", () => {
    const res = SyntheticSuiteB.runG6();
    expect(res.countsByType.LWPOLYLINE).toBe(1);
    expect(res.countsByType.CIRCLE).toBe(2);
    expect(res.metrics.maxTangencyErrorDeg).toBeLessThanOrEqual(1.0);
    expect(res.metrics.coverage).toBeGreaterThanOrEqual(0.99);
    expect(res.metrics.excess).toBeLessThanOrEqual(0.01);
  });

  it("G7 — Rasgo oblongo: 2 retas + 2 semicírculos (bulge ±1) em 1 LWPOLYLINE fechada", () => {
    const res = SyntheticSuiteB.runG7();
    expect(res.countsByType.LWPOLYLINE).toBe(1);
    const poly = res.entities[0]!.prim;
    expect(poly.kind).toBe("lwpolyline");
    if (poly.kind === "lwpolyline") {
      expect(poly.closed).toBe(true);
      expect(poly.vertices).toHaveLength(4);
      const bulges = poly.vertices.map((v) => Math.abs(v.bulge ?? 0));
      expect(bulges).toEqual([0, 1, 0, 1]);
    }
    expect(res.metrics.coverage).toBeGreaterThanOrEqual(0.99);
    expect(res.metrics.excess).toBeLessThanOrEqual(0.01);
  });

  it("G8 — Perfil misto reta–arco–reta tangente + cantos vivos: junções classificadas corretamente", () => {
    const res = SyntheticSuiteB.runG8();
    expect(res.countsByType.LWPOLYLINE).toBe(1);
    const junctions = res.entities[0]?.junctions ?? [];
    expect(junctions.filter((j) => j.kind === "tangent")).toHaveLength(2);
    expect(junctions.filter((j) => j.kind === "corner")).toHaveLength(3);
    expect(res.metrics.maxTangencyErrorDeg).toBeLessThanOrEqual(1.0);
  });

  it("G9 — Elipse a = 80, b = 50: ELLIPSE no modo CAD e LWPOLYLINE de arcos com desvio <= τ no modo Laser", () => {
    const cadRes = SyntheticSuiteB.runG9("cad");
    expect(cadRes.countsByType.ELLIPSE).toBe(1);
    expect(cadRes.metrics.coverage).toBeGreaterThanOrEqual(0.99);

    const laserRes = SyntheticSuiteB.runG9("laser");
    expect(laserRes.countsByType.LWPOLYLINE).toBe(1);
    expect(laserRes.countsByType.ELLIPSE).toBe(0);
    expect(laserRes.metrics.maxDeviationPx).toBeLessThanOrEqual(laserRes.tauPx);
    expect(laserRes.metrics.coverage).toBeGreaterThanOrEqual(0.99);
    expect(laserRes.metrics.excess).toBeLessThanOrEqual(0.01);
  });

  it("G10 — Hexágono (6), Octógono (8) e Polígono de 24 lados: 6 e 8 permanecem retas; 24 lados respeita o limiar τ", () => {
    const hex = SyntheticSuiteB.runG10(6, "equilibrado");
    expect(hex.countsByType.LWPOLYLINE).toBe(1);
    expect(hex.countsByType.CIRCLE).toBe(0);

    const oct = SyntheticSuiteB.runG10(8, "equilibrado");
    expect(oct.countsByType.LWPOLYLINE).toBe(1);
    expect(oct.countsByType.CIRCLE).toBe(0);

    // Em preset "preciso" (0.5%, tau = 0.8 px), o 24-gon de R=100 tem desvio radial ~0.855 px > 0.8 px -> permanece polígono!
    // Em preset "equilibrado" (1.0%, tau = 1.0 px), 0.855 px <= 1.0 px e giro 15° < 28° -> vira CIRCLE!
    const p24Preciso = SyntheticSuiteB.runG10(24, "preciso");
    expect(p24Preciso.countsByType.LWPOLYLINE).toBe(1);
    expect(p24Preciso.countsByType.CIRCLE).toBe(0);

    const p24Equilibrado = SyntheticSuiteB.runG10(24, "equilibrado");
    expect(p24Equilibrado.countsByType.CIRCLE).toBe(1);
  });

  it("G11 — Mesmo círculo desenhado duas vezes com deslocamento de 0,3 px -> 1 CIRCLE sem duplicata", () => {
    const res = SyntheticSuiteB.runG11();
    expect(res.countsByType.CIRCLE).toBe(1);
    expect(res.metrics.duplicateCount).toBe(0);
    expect(res.metrics.maxCenterErrorPx).toBeLessThanOrEqual(0.2);
  });

  it("G12, G13 e G14 — Exclusão de interface de tela, homografia com/sem referência e imagem sem calibração", () => {
    const g12 = SyntheticSuiteB.runG12();
    expect(g12.detectedImageKind).toBe("linha");
    expect(g12.excludedUiElementsCount).toBeGreaterThan(0);
    expect(g12.countsByType).toEqual({
      CIRCLE: 1,
      ARC: 0,
      LINE: 0,
      LWPOLYLINE: 1,
      ELLIPSE: 0,
      SPLINE: 0,
    });

    const g13Ref = SyntheticSuiteB.runG13(true);
    expect(g13Ref.calibrated).toBe(true);
    expect(g13Ref.perspectiveLimitationRecorded).toBe(false);

    const g13NoRef = SyntheticSuiteB.runG13(false);
    expect(g13NoRef.perspectiveLimitationRecorded).toBe(true);

    const g14 = SyntheticSuiteB.runG14();
    expect(g14.calibrated).toBe(false);
    expect(g14.unitWarning).toMatch(/Escala não calibrada/i);
  });

  it("Valida fórmulas auxiliares de tolerância adaptativa τ, aviso de limite de resolução e solda τ_solda", () => {
    const resLim = computeAdaptiveTau({
      characteristicSizePx: 100,
      strokeWidthPx: 4,
      preset: "preciso",
      maxDevCapMm: 0.05, // pede ±0.05 mm
      mmPerPx: 0.2, // mas tauMinPx = 1.4 px -> 0.28 mm!
    });
    expect(resLim.resolutionLimited).toBe(true);
    expect(resLim.warning).toContain("±0.28 mm");

    const weld = computeWeldTolerancePx(1.5, 4.0);
    expect(weld).toBe(2.0); // min(2 * 1.5 = 3.0, 0.5 * 4.0 = 2.0) = 2.0

    // Testa conversão bulge -> arco para 90° (bulge = tan(π/8))
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 10 }, Math.tan(Math.PI / 8));
    expect(arc.r).toBeCloseTo(10, 5);
  });
});
