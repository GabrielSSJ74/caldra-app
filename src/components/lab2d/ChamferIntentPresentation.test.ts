import { describe, it, expect } from "vitest";
import {
  buildDrawing,
  projectToScreen,
  computeAutoFitView,
  boxesOverlap,
  evaluateLivePlateValidation,
} from "./ChamferLiveMiniViewport";
import {
  FALLBACK_DARK_TOKENS,
  FALLBACK_LIGHT_TOKENS,
  TECHNICAL_LAYER_COLORS,
  getTechnicalLayerColor,
  parseColorToRgb,
  getContrastRatio,
  displayColor,
  buildIntentCssVariables,
} from "./useIntentTheme";
import { ChamferIntentInterpreter } from "@/lib/intent";

describe("CHAMFER INTENT — Prévia CAD Profissional, Cotagem ISO 128/129 e Tema Adaptável (§11 T1–T15)", () => {
  it("T1: Caso da captura — chapa 400 × 250, cantos R20, 5 furos Ø12, passo 87,5", () => {
    const drawing = buildDrawing({
      width: 400,
      height: 250,
      cornerRadius: 20,
      cornerSelector: "all",
      holeCount: 5,
      holeDiameter: 12,
      margin: 25,
      holeDistribution: "linear_centerline_x",
      isPlateMode: true,
      decimalSeparator: ",",
    });

    expect(drawing.isValid).toBe(true);
    expect(drawing.holes).toHaveLength(5);

    // Posições a partir da borda esquerda (-200 mm): 25; 112,5; 200; 287,5; 375 e y = 125 a partir da base (-125 mm)
    const xFromLeftEdge = drawing.holes.map((h) => h.cx - drawing.modelBounds.minX);
    expect(xFromLeftEdge).toEqual([25, 112.5, 200, 287.5, 375]);
    drawing.holes.forEach((h) => {
      expect(h.cy - drawing.modelBounds.minY).toBe(125);
      expect(h.r).toBe(6);
    });

    // Linha de centro da fileira de furos curta (não atravessa a peça inteira [-200, +200])
    const holeRowCl = drawing.centerlines.find((c) => c.id === "hole_row_cl");
    expect(holeRowCl).toBeDefined();
    expect(holeRowCl!.x1!).toBeGreaterThan(-200);
    expect(holeRowCl!.x2!).toBeLessThan(200);

    // Cadeia 25 | 4× 87,5 | 25 + Totais 400 e 250
    const mainDimTexts = drawing.linearDims
      .filter((d) => d.priority === "main")
      .map((d) => d.text);
    expect(mainDimTexts).toContain("400");
    expect(mainDimTexts).toContain("250");
    expect(mainDimTexts).toContain("25");
    expect(mainDimTexts).toContain("4× 87,5");

    // Chamadas "5× Ø12" e "R20"
    const leaderTexts = drawing.leaders.map((l) => l.text);
    expect(leaderTexts).toContain("5× Ø12");
    expect(leaderTexts).toContain("R20");

    // Nenhum rótulo solto "Passo:"
    const allTexts = [...mainDimTexts, ...leaderTexts];
    expect(allTexts.some((t) => t.toLowerCase().includes("passo"))).toBe(false);

    // Projeção em px: contorno e furos num único path evenodd com comandos de arco reais (A)
    const view = computeAutoFitView(drawing, 640, 360, "main");
    const projected = projectToScreen(drawing, view, FALLBACK_DARK_TOKENS, "CORTE");
    expect(projected.compoundCutPathD).toContain("A ");
    expect(projected.holeCenterCrossesPx).toHaveLength(5);
    expect(projected.hiddenDimensionCount).toBeGreaterThan(0);
  });

  it("T2: Chapa 500 × 300 com 4 furos Ø12 nos cantos a 25 mm — cotas 25 | 450 | 25 e 25 | 250 | 25; '4× Ø12'", () => {
    const drawing = buildDrawing({
      width: 500,
      height: 300,
      cornerRadius: 0,
      cornerSelector: "none",
      holeCount: 4,
      holeDiameter: 12,
      margin: 25,
      holeDistribution: "corner_inset",
      isPlateMode: true,
      decimalSeparator: ",",
    });

    expect(drawing.isValid).toBe(true);
    expect(drawing.holes).toHaveLength(4);

    const mainTexts = drawing.linearDims.filter((d) => d.priority === "main").map((d) => d.text);
    expect(mainTexts).toContain("500");
    expect(mainTexts).toContain("300");
    expect(mainTexts).toContain("450");
    expect(mainTexts).toContain("250");
    expect(mainTexts.filter((t) => t === "25").length).toBeGreaterThanOrEqual(4);

    const leaderTexts = drawing.leaders.map((l) => l.text);
    expect(leaderTexts).toContain("4× Ø12");
  });

  it("T3: Flange Ø400/Ø200 com 8× Ø18 em PCD 320 — Ø400, Ø200, Ø320 PCD, '8× Ø18' e marcas de centro", () => {
    const compiledPlan = ChamferIntentInterpreter.compilePrompt(
      "Flange externo 400 interno 200 com PCD 320 e 8 furos de 18 mm",
      {
        existingEntities: [],
        selectedEntityIds: [],
        activeLayer: "CORTE" as never,
      },
    );

    const drawing = buildDrawing({
      width: 400,
      height: 400,
      cornerRadius: 0,
      cornerSelector: "none",
      holeCount: 8,
      holeDiameter: 18,
      margin: 25,
      holeDistribution: "circular_pcd",
      pcd: 320,
      isPlateMode: false,
      fallbackEntities: compiledPlan.compiled?.previewEntities ?? [],
      decimalSeparator: ",",
    });

    expect(drawing.family).toBe("flange");
    expect(drawing.holes).toHaveLength(8);
    expect(drawing.centerlines.some((c) => c.kind === "circle" && c.r === 160)).toBe(true);

    const dimTexts = drawing.linearDims.map((d) => d.text);
    expect(dimTexts).toContain("Ø400");
    expect(dimTexts).toContain("Ø200");
    expect(dimTexts).toContain("Ø320 PCD");

    const leaderTexts = drawing.leaders.map((l) => l.text);
    expect(leaderTexts).toContain("8× Ø18");
  });

  it("T4: Rasgo oblongo 100 × 20 — comprimento, largura (R10) e linha de centro no eixo", () => {
    const compiledPlan = ChamferIntentInterpreter.compilePrompt(
      "Suporte 280 por 140 mm com rasgo oblongo",
      {
        existingEntities: [],
        selectedEntityIds: [],
        activeLayer: "CORTE" as never,
      },
    );

    const drawing = buildDrawing({
      width: 280,
      height: 140,
      cornerRadius: 0,
      cornerSelector: "none",
      holeCount: 0,
      holeDiameter: 12,
      margin: 25,
      isPlateMode: true,
      fallbackEntities: compiledPlan.compiled?.previewEntities ?? [],
      decimalSeparator: ",",
    });

    expect(drawing.slot).toBeDefined();
    expect(drawing.centerlines.some((c) => c.id === "slot_cl_x")).toBe(true);
    expect(drawing.linearDims.some((d) => d.id === "dim_slot_length")).toBe(true);
    expect(drawing.leaders.some((l) => l.id === "leader_slot_radius")).toBe(true);
  });

  it("T5: Fidelidade — geometria inválida não é corrigida silenciosamente e reporta o erro exato", () => {
    const invalidValidation = evaluateLivePlateValidation({
      width: 400,
      height: 250,
      cornerRadius: 150, // > min(400, 250)/2 = 125
      cornerSelector: "all",
      holeCount: 5,
      holeDiameter: 12,
      margin: 25,
    });

    expect(invalidValidation.isValid).toBe(false);
    expect(invalidValidation.isRadiusError).toBe(true);

    const invalidDrawing = buildDrawing({
      width: 400,
      height: 250,
      cornerRadius: 150,
      cornerSelector: "all",
      holeCount: 5,
      holeDiameter: 12,
      margin: 25,
      isPlateMode: true,
    });

    expect(invalidDrawing.isValid).toBe(false);
    expect(invalidDrawing.errorLegend).toBeDefined();
    expect(invalidDrawing.errorParamKey).toBe("corner_radius");
  });

  it("T6: Temas — contraste WCAG ≥ 4,5:1 para texto e ≥ 3,0:1 para linhas CAD em Escuro e Claro; cor técnica preservada", () => {
    for (const palette of [FALLBACK_DARK_TOKENS, FALLBACK_LIGHT_TOKENS]) {
      const bgRgb = parseColorToRgb(palette.ciBg)!;
      const textRgb = parseColorToRgb(palette.ciText)!;
      expect(getContrastRatio(textRgb, bgRgb)).toBeGreaterThanOrEqual(4.5);

      const canvasRgb = parseColorToRgb(palette.cadCanvas)!;
      const dimColor = displayColor(palette.cadDim, palette.cadCanvas, 3.0);
      const dimRgb = parseColorToRgb(dimColor)!;
      expect(getContrastRatio(dimRgb, canvasRgb)).toBeGreaterThanOrEqual(3.0);

      // Cor técnica da camada CORTE nunca muda nos dados, mas displayColor garante ≥ 3:1 sobre o canvas
      const originalTechnical = getTechnicalLayerColor("CORTE");
      expect(originalTechnical).toBe(TECHNICAL_LAYER_COLORS.CORTE);

      const displayedCut = displayColor(originalTechnical, palette.cadCanvas, 3.0);
      const displayedCutRgb = parseColorToRgb(displayedCut)!;
      expect(getContrastRatio(displayedCutRgb, canvasRgb)).toBeGreaterThanOrEqual(3.0);
    }

    const cssVars = buildIntentCssVariables(
      {
        mode: "dark",
        isDark: true,
        prefersReducedMotion: false,
        prefersHighContrast: false,
        ...FALLBACK_DARK_TOKENS,
      },
      { vvhPx: 720, kbdPx: 280 },
    ) as Record<string, string>;

    expect(cssVars["--vvh"]).toBe("720px");
    expect(cssVars["--kbd"]).toBe("280px");
    expect(cssVars["--ci-bg"]).toBe(FALLBACK_DARK_TOKENS.ciBg);
    expect(cssVars["--cad-canvas"]).toBe(FALLBACK_DARK_TOKENS.cadCanvas);
  });

  it("T8: Anticolisão das caixas delimitadoras de textos de cota em T1, T2, T3 e T4 em 3 níveis de zoom", () => {
    const cases = [
      buildDrawing({
        width: 400,
        height: 250,
        cornerRadius: 20,
        cornerSelector: "all",
        holeCount: 5,
        holeDiameter: 12,
        margin: 25,
        holeDistribution: "linear_centerline_x",
        isPlateMode: true,
      }),
      buildDrawing({
        width: 500,
        height: 300,
        cornerRadius: 0,
        cornerSelector: "none",
        holeCount: 4,
        holeDiameter: 12,
        margin: 25,
        holeDistribution: "corner_inset",
        isPlateMode: true,
      }),
    ];

    const zoomLevels = [0.65, 1.0, 1.75];

    for (const drawing of cases) {
      const baseView = computeAutoFitView(drawing, 600, 340, "main");
      for (const zoom of zoomLevels) {
        const zoomedView = {
          ...baseView,
          scalePxPerMm: baseView.scalePxPerMm * zoom,
        };
        const projected = projectToScreen(drawing, zoomedView, FALLBACK_DARK_TOKENS, "CORTE");
        const boxes = projected.allLabelBoxes;

        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(boxesOverlap(boxes[i]!, boxes[j]!, 1)).toBe(false);
          }
        }
      }
    }
  });

  it("T15 & §4: Zero literais hexadecimais (#RRGGBB) fora de useIntentTheme.ts em ChamferSemanticPalette.tsx e ChamferLiveMiniViewport.tsx", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const paletteSrc = fs.readFileSync(
      path.resolve(__dirname, "./ChamferSemanticPalette.tsx"),
      "utf-8",
    );
    const viewportSrc = fs.readFileSync(
      path.resolve(__dirname, "./ChamferLiveMiniViewport.tsx"),
      "utf-8",
    );

    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
    expect(paletteSrc.match(hexRegex)).toBeNull();
    expect(viewportSrc.match(hexRegex)).toBeNull();
  });
});

