import { describe, expect, it } from "vitest";
import { analyzeRaster, toEntities } from "./vectorizer";
import {
  CYPCUT_CHECKLIST_ITEMS,
  INITIAL_CYPCUT_VALIDATION_STATE,
  computeVisionDiagnostics,
  deletePrimAtIndex,
  getCypCutValidationStatusLabel,
  isCypCutValidationComplete,
  refitFromCachedContoursS6ToS12,
  togglePrimCircleOrPolyline,
  updatePrimGeometry,
  type CypCutValidationState,
} from "./visionReviewAndChecklist";
import type { Prim } from "./geometryRecognizer";

function makeSolidPlateWithHoleRaster(w = 240, h = 160): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inPlate = x >= 30 && x <= 210 && y >= 25 && y <= 135;
      const dx = x - 120;
      const dy = y - 80;
      const inHole = Math.hypot(dx, dy) <= 28;
      const fg = inPlate && !inHole;
      const v = fg ? 20 : 245;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { data, width: w, height: h } as ImageData;
}

describe("CHAMFER VISION 2.0 — FASE F: Prévia, Revisão, Cache S1–S5 e Roteiro CypCut (Seções 13 e 14)", () => {
  it("F1 — Cache S1–S5 preserva contornos extraídos e permite reajustar S6–S12 em poucos ms sem reexecutar binarização/EDT", () => {
    const img = makeSolidPlateWithHoleRaster(240, 160);
    const baseAnalysis = analyzeRaster(img, {
      imageKind: "silhueta",
      tolerance: "media",
      outputMode: "laser",
      regularize: true,
    });

    expect(baseAnalysis.cachedContours).toBeDefined();
    expect(baseAnalysis.cachedContours!.length).toBeGreaterThanOrEqual(2);
    expect(baseAnalysis.stageTimingsMs).toBeDefined();
    expect(baseAnalysis.stageTimingsMs!.s1ToS5Ms).toBeGreaterThanOrEqual(0);

    // Reexecuta somente S6–S12 mudando tolerância, teto (mm) e modo de saída
    const t0 = performance.now();
    const refittedFine = refitFromCachedContoursS6ToS12(baseAnalysis, {
      tolerance: "alta",
      outputMode: "cad",
      alignAxes: true,
      maxCapMm: 0.25,
      mmPerPx: 1,
    });
    const elapsedMs = performance.now() - t0;

    // Preserva exatamente a mesma referência de contornos S1–S5 em cache
    expect(refittedFine.cachedContours).toBe(baseAnalysis.cachedContours);
    expect(refittedFine.stats.circles).toBeGreaterThanOrEqual(1);
    expect(elapsedMs).toBeLessThan(150);
  });

  it("F2 — Resolução de ambiguidade Traço (1 caminho) vs Anel (2 caminhos) via refitFromCachedContoursS6ToS12", () => {
    const img = makeSolidPlateWithHoleRaster(200, 140);
    const base = analyzeRaster(img, {
      imageKind: "silhueta",
      tolerance: "media",
      outputMode: "laser",
    });

    // Simula um par ambíguo detectado na faixa [1.6 * w0, 3.0 * w0]
    const makeCirclePts = (r: number) =>
      Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return { x: 100 + r * Math.cos(a), y: 70 + r * Math.sin(a) };
      });

    const makeExtracted = (id: string, r: number, hole: boolean) => ({
      id,
      pts: makeCirclePts(r),
      closed: true,
      area: Math.PI * r * r,
      hole,
      bbox: { x: 100 - r, y: 70 - r, w: r * 2, h: r * 2 },
      depth: hole ? 1 : 0,
      localWidthPx: 2.2,
      confidence: "MEDIA" as const,
      provenance: {
        contourId: id,
        sourceComponentId: 1,
        bbox: { x: 100 - r, y: 70 - r, w: r * 2, h: r * 2 },
        pixelSupportCount: 48,
        meanStrokeWidthPx: 2.2,
        hierarchyRole: hole ? ("hole" as const) : ("outer" as const),
      },
    });

    const analysisWithAmbiguity = {
      ...base,
      cachedContours: [],
      ambiguousTwins: [
        {
          id: "amb-ring-1",
          outerContour: makeExtracted("amb-outer", 42, false),
          innerContour: makeExtracted("amb-inner", 36, true),
          centerlineOption: makeExtracted("amb-center", 39, false),
          q: 2.2,
          bandWidthPx: 6.0,
          typicalStrokeWidthPx: 2.7,
          promptPtBr: "Isto é 1 traço (1 caminho) ou 1 anel com espessura (2 caminhos)?",
        },
      ],
    };

    // 1. Escolhendo "traco" -> exatamente 1 círculo central (R ~ 39)
    const asStroke = refitFromCachedContoursS6ToS12(analysisWithAmbiguity, {
      tolerance: "media",
      outputMode: "laser",
      alignAxes: true,
      ambiguousResolutions: { "amb-ring-1": "traco" },
    });
    expect(asStroke.stats.circles).toBe(1);
    const cStroke = asStroke.prims.find((p) => p.kind === "circle");
    expect(cStroke && cStroke.kind === "circle" ? cStroke.r : 0).toBeCloseTo(39, 0);

    // 2. Escolhendo "anel" -> 2 círculos concêntricos (R ~ 42 e R ~ 36)
    const asRing = refitFromCachedContoursS6ToS12(analysisWithAmbiguity, {
      tolerance: "media",
      outputMode: "laser",
      alignAxes: true,
      ambiguousResolutions: { "amb-ring-1": "anel" },
    });
    expect(asRing.stats.circles).toBe(2);
  });

  it("F3 — Ferramentas de correção manual (deletePrimAtIndex, togglePrimCircleOrPolyline, updatePrimGeometry)", () => {
    // Cria uma polilinha facetada de 16 lados aproximando um círculo de raio 30 em (100, 100)
    const polyPts = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return { x: 100 + 30 * Math.cos(a), y: 100 + 30 * Math.sin(a) };
    });
    const polyPrim: Prim = {
      kind: "polyline",
      closed: true,
      pts: polyPts,
      confidence: "MEDIA",
    };

    // Alterna Polilinha -> Círculo nativo
    const convertedCircle = togglePrimCircleOrPolyline(polyPrim);
    expect(convertedCircle.kind).toBe("circle");
    if (convertedCircle.kind === "circle") {
      expect(convertedCircle.cx).toBeCloseTo(100, 1);
      expect(convertedCircle.cy).toBeCloseTo(100, 1);
      expect(convertedCircle.r).toBeCloseTo(30, 1);
      expect(convertedCircle.confidence).toBe("ALTA");
      expect(convertedCircle.source).toBe("convertida");
    }

    // Ajusta raio manualmente para 32.5
    const adjustedCircle = updatePrimGeometry(convertedCircle, { r: 32.5 });
    expect(adjustedCircle.kind).toBe("circle");
    if (adjustedCircle.kind === "circle") {
      expect(adjustedCircle.r).toBe(32.5);
    }

    // Alterna Círculo -> Polilinha fechada com bulge (2 semicírculos tangentes)
    const backToBulgePoly = togglePrimCircleOrPolyline(adjustedCircle);
    expect(backToBulgePoly.kind).toBe("polyline");
    if (backToBulgePoly.kind === "polyline") {
      expect(backToBulgePoly.closed).toBe(true);
      expect(backToBulgePoly.bulges).toEqual([1, 1]);
    }

    // Remove primitiva duplicada pelo índice
    const list = [convertedCircle, adjustedCircle];
    const afterDelete = deletePrimAtIndex(list, 0);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]).toBe(adjustedCircle);
  });

  it("F4 — Painel de diagnóstico computa contagens 100% reais (Seção 13)", () => {
    const img = makeSolidPlateWithHoleRaster(240, 160);
    const analysis = analyzeRaster(img, {
      imageKind: "silhueta",
      tolerance: "media",
      outputMode: "laser",
    });
    const entities = toEntities(
      analysis,
      { mmPerPx: 1, method: "padrao", label: "1 px = 1 mm" },
      "corte",
    );

    const diag = computeVisionDiagnostics(analysis, entities);
    expect(diag.circles).toBeGreaterThanOrEqual(1);
    expect(diag.closedContours).toBeGreaterThanOrEqual(2);
    expect(diag.openContours).toBe(0);
    expect(diag.splines).toBe(0);
    expect(diag.coveragePct).toBeGreaterThan(95);
    expect(diag.excessPct).toBeLessThan(5);
  });

  it("F5 — Roteiro de Validação no CypCut (Seção 14) exige os 6 itens + 2 cotas medidas para liberar status verificado", () => {
    expect(CYPCUT_CHECKLIST_ITEMS).toHaveLength(6);

    // Estado inicial deve sempre declarar "Validação no CypCut: não verificada"
    const initialStatus = getCypCutValidationStatusLabel(INITIAL_CYPCUT_VALIDATION_STATE);
    expect(initialStatus.verified).toBe(false);
    expect(initialStatus.badgeText).toBe("Validação no CypCut: não verificada");

    // Todos os 6 itens marcados, mas sem as 2 distâncias medidas -> ainda NÃO verificada
    const allCheckedNoDistances: CypCutValidationState = {
      checked: {
        smoothHolesHighZoom: true,
        noDoubleLinesOrNestedLoops: true,
        singleClosedPathNoLooseEnds: true,
        sparseDirectionArrows: true,
        dimensionsMatchChamfer: true,
        sondaDxfReadAsExpected: true,
      },
      measuredDistance1Mm: "",
      measuredDistance2Mm: "",
    };
    expect(isCypCutValidationComplete(allCheckedNoDistances)).toBe(false);
    expect(getCypCutValidationStatusLabel(allCheckedNoDistances).badgeText).toBe(
      "Validação no CypCut: não verificada",
    );

    // Todos os 6 itens marcados + 2 distâncias medidas positivas -> validado
    const completeState: CypCutValidationState = {
      ...allCheckedNoDistances,
      measuredDistance1Mm: "200.0",
      measuredDistance2Mm: "56.0",
    };
    expect(isCypCutValidationComplete(completeState)).toBe(true);
    const finalStatus = getCypCutValidationStatusLabel(completeState);
    expect(finalStatus.verified).toBe(true);
    expect(finalStatus.completedCount).toBe(6);
  });
});
