/**
 * CHAMFER VISION 2.0 — FASE G (FINAL): BATERIA DE CERTIFICAÇÃO PONTA-A-PONTA S1–S12,
 * HOMOGRAFIA BILINEAR (G13), ESCALA (G14), PRESERVAÇÃO DE BULGE NO CAD E CRITÉRIOS DA SEÇÃO 18
 */

import { describe, expect, it } from "vitest";
import { exportDXF } from "@/lib/dxf/exportService";
import { importDxf } from "@/lib/dxf/dxfService";
import { createCenterRectangle, createSlotPolyline } from "@/lib/lab2d/cadGeometryCore";
import { explodeEntity, mirrorAcrossAxis } from "@/lib/lab2d/cadModifiers";
import { mirror, outlinePoints, rotate, scaleEntity, translate } from "@/lib/lab2d/core";
import { warpImageDataToRectBilinear, type Quad } from "./perspectiveCorrectionService";
import {
  certifyVisionAcceptanceSection18,
  runVisionPipelineS1ToS12,
} from "./visionEndToEndPipelineG";
import {
  createBlankImage,
  drawSyntheticCircleStroke,
  drawSyntheticFilledRingOrDisc,
} from "./visionMetricsAndHarness";
import { INITIAL_CYPCUT_VALIDATION_STATE } from "./visionReviewAndChecklist";

function drawRoundedRectPlateWithHoles(
  img: ImageData,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  rc: number,
  holes: { cx: number; cy: number; r: number }[],
): void {
  const { width: w, height: h, data } = img;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Distância assinada a retângulo arredondado
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      const qx = Math.abs(x - cx) - (rw / 2 - rc);
      const qy = Math.abs(y - cy) - (rh / 2 - rc);
      const dRect =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc;
      const inHole = holes.some((hole) => Math.hypot(x - hole.cx, y - hole.cy) <= hole.r);
      if (dRect <= 0 && !inHole) {
        const idx = (y * w + x) * 4;
        data[idx] = 20;
        data[idx + 1] = 20;
        data[idx + 2] = 20;
        data[idx + 3] = 255;
      }
    }
  }
}

describe("CHAMFER VISION 2.0 — FASE FINAL G: Pipeline Ponta-a-Ponta S1–S12 e Certificação Seção 18", () => {
  it("G-Final 1: Executa os 12 estágios S1 a S12 de ponta a ponta sobre chapa retangular arredondada com furos (G6 raster real -> DXF auditado)", () => {
    const img = createBlankImage(420, 300);
    drawRoundedRectPlateWithHoles(img, 60, 50, 300, 200, 24, [
      { cx: 135, cy: 150, r: 22 },
      { cx: 285, cy: 150, r: 22 },
    ]);

    const res = runVisionPipelineS1ToS12(img, {
      tolerance: "media",
      imageKind: "silhueta",
      outputMode: "laser",
      calibration: { mmPerPx: 1, method: "dimensao", label: "1 px = 1 mm (calibrado)" },
    });

    // Todos os 12 estágios registrados e aprovados
    expect(res.stageRecords).toHaveLength(12);
    expect(res.stageRecords.map((s) => s.stage)).toEqual([
      "S1_PREPROCESS_HOMOGRAPHY_SCALE",
      "S2_UI_FRAME_EXCLUSION",
      "S3_IMAGE_KIND_AND_EDT_W0",
      "S4_SUBPIXEL_BOUNDARY_SKELETON",
      "S5_TWIN_LOOP_DEDUPLICATION",
      "S6_CORNER_AND_CURVATURE_SEGMENTATION",
      "S7_ANALYTICAL_PRIMITIVE_FITTING",
      "S8_G1_TANGENCY_AND_TOPOLOGY_WELD",
      "S9_FIDELITY_VALIDATION",
      "S10_CHAMFER_NATIVE_ENTITIES",
      "S11_DXF_AC1018_GENERATION",
      "S12_ROUND_TRIP_DXF_AUDIT",
    ]);
    expect(res.stageRecords.every((s) => s.ok)).toBe(true);

    // Verifica que os 2 furos saíram como CIRCLE nativo e o perfil externo como LWPOLYLINE fechada
    expect(res.roundTripAudit.passed).toBe(true);
    expect(res.roundTripAudit.circlesCount).toBe(2);
    expect(res.roundTripAudit.polygonalCircularHoles).toBe(0);
    expect(res.roundTripAudit.unconfirmedConcentricPairs).toBe(0);
    expect(res.roundTripAudit.openCutProfiles).toBe(0);
    expect(res.roundTripAudit.duplicateEntities).toBe(0);
    expect(res.roundTripAudit.microSegmentsUnder005mm).toBe(0);

    // Status inicial honesto do CypCut (Seção 14)
    expect(res.cypcutStatus.verified).toBe(false);
    expect(res.cypcutStatus.badgeText).toBe("Validação no CypCut: não verificada");
  });

  it("G-Final 2: Executa S1 a S12 sobre círculo de traço grosso (G1 raster real w=8 px) e garante 1 único CIRCLE sem linha dupla no DXF", () => {
    const img = createBlankImage(280, 280);
    drawSyntheticCircleStroke(img, 140, 140, 85, 8);

    const res = runVisionPipelineS1ToS12(img, {
      tolerance: "media",
      imageKind: "traco",
      outputMode: "laser",
      calibration: { mmPerPx: 1, method: "medida", label: "Calibrado por régua" },
    });

    expect(res.roundTripAudit.passed).toBe(true);
    expect(res.roundTripAudit.circlesCount).toBe(1);
    expect(res.roundTripAudit.unconfirmedConcentricPairs).toBe(0);
    expect(res.roundTripAudit.polygonalCircularHoles).toBe(0);

    const parsed = importDxf(res.dxfText);
    const circles = parsed.entities.filter((e) => e.type === "CIRCLE");
    expect(circles).toHaveLength(1);
    if (circles[0]?.type === "CIRCLE") {
      expect(circles[0].radius).toBeCloseTo(85, 0);
    }
  });

  it("G-Final 3: Estágio S1 — Retificação homográfica bilinear 4-pontos (G13 com e sem referência) e alerta de escala não calibrada (G14)", () => {
    const src = createBlankImage(240, 240);
    drawSyntheticFilledRingOrDisc(src, 120, 120, 60, 0);

    // Aplica homografia identidade/recorte retangular via warpImageDataToRectBilinear
    const quad: Quad = [
      { x: 20, y: 20 },
      { x: 220, y: 20 },
      { x: 220, y: 220 },
      { x: 20, y: 220 },
    ];
    const warped = warpImageDataToRectBilinear(src, quad, { w: 200, h: 200 });
    expect(warped).not.toBeNull();
    expect(warped!.width).toBe(200);
    expect(warped!.height).toBe(200);

    // 1. G13 com referência de 4 pontos + calibrado
    const withRef = runVisionPipelineS1ToS12(src, {
      imageKind: "silhueta",
      perspectiveQuad: { quad, targetWidthPx: 200, targetHeightPx: 200 },
      calibration: { mmPerPx: 0.5, method: "dimensao", label: "0.5 mm/px" },
    });
    expect(withRef.perspective.rectified).toBe(true);
    expect(withRef.perspective.perspectiveLimitationRecorded).toBe(false);
    expect(withRef.calibrated).toBe(true);
    expect(withRef.scaleWarning).toBeUndefined();
    expect(withRef.roundTripAudit.circlesCount).toBe(1);

    // 2. G13 sem referência planar + G14 sem calibração de escala
    const withoutRefUncalibrated = runVisionPipelineS1ToS12(src, {
      imageKind: "silhueta",
      tiltedCaptureWithoutReference: true,
      calibration: { mmPerPx: 1, method: "padrao", label: "1 px = 1 mm" },
    });
    expect(withoutRefUncalibrated.perspective.rectified).toBe(false);
    expect(withoutRefUncalibrated.perspective.perspectiveLimitationRecorded).toBe(true);
    expect(withoutRefUncalibrated.perspective.warning).toContain("sem referência planar");
    expect(withoutRefUncalibrated.calibrated).toBe(false);
    expect(withoutRefUncalibrated.scaleWarning).toContain("Escala não calibrada");
  });

  it("G-Final 4: Operações de edição do CHAMFER CAD (translate, rotate, scale, mirror, mirrorAcrossAxis, explodeEntity) preservam arcos/bulge sem facetar", () => {
    const slot = createSlotPolyline({ x: 100, y: 50 }, 80, 20, 0, "corte");
    const rRect = createCenterRectangle({ x: 100, y: 50 }, { x: 160, y: 80 }, "corte", 12);

    // 1. Translação, rotação e escala preservam bulges intactos
    const moved = translate(slot, 25, -15);
    const rotated = rotate(moved, { x: 100, y: 50 }, 45);
    const scaled = scaleEntity(rotated, { x: 100, y: 50 }, 1.5);
    expect(scaled.type).toBe("polyline");
    if (scaled.type === "polyline") {
      expect(scaled.bulges).toEqual([0, 1, 0, 1]);
    }

    // 2. Espelhamento ortogonal (mirror) e por eixo livre (mirrorAcrossAxis) invertem o sinal do bulge mantendo a geometria exata
    const mirroredX = mirror(slot, { x: 100, y: 50 }, "x");
    const mirroredFree = mirrorAcrossAxis(slot, { x: 0, y: 0 }, { x: 100, y: 100 });
    if (mirroredX.type === "polyline" && mirroredFree.type === "polyline") {
      expect(mirroredX.bulges?.map((b) => Math.abs(b))).toEqual([0, 1, 0, 1]);
      expect(mirroredFree.bulges).toEqual([-0, -1, -0, -1]);
    }

    // 3. Explodir polilinha com bulge gera entidades LINE e ARC analíticas reais (nunca segmentos facetados)
    const explodedSlot = explodeEntity(slot);
    expect(explodedSlot).not.toBeNull();
    expect(explodedSlot).toHaveLength(4);
    expect(explodedSlot!.filter((e) => e.type === "line")).toHaveLength(2);
    expect(explodedSlot!.filter((e) => e.type === "arc")).toHaveLength(2);
    for (const arcEnt of explodedSlot!.filter((e) => e.type === "arc")) {
      if (arcEnt.type === "arc") {
        expect(arcEnt.r).toBeCloseTo(10, 5);
      }
    }

    // 4. Exportação DXF pelo serviço central (exportDXF) aprova todas as 7 portas da Seção 12
    const exported = exportDXF({
      geometry: [rRect, slot],
      leads: false,
    });
    expect(exported.ok).toBe(true);
    expect(exported.roundTripAudit.passed).toBe(true);
    expect(exported.roundTripAudit.closedBulgePolylinesCount).toBe(2);
    expect(exported.roundTripAudit.polygonalCircularHoles).toBe(0);

    // E outlinePoints amostra suavemente os cantos curvos para seleção/viewport
    expect(outlinePoints(rRect).length).toBeGreaterThan(20);
  });

  it("G-Final 5: Certificação completa da Seção 18 (G1 a G14 + DXF-Sonda + Rotulagem CypCut)", () => {
    const cert = certifyVisionAcceptanceSection18(INITIAL_CYPCUT_VALIDATION_STATE);

    expect(cert.allSyntheticBenchmarksG1ToG14Passed).toBe(true);
    expect(cert.zeroPolygonalCircularHolesInBenchmarks).toBe(true);
    expect(cert.zeroUnconfirmedDoubleLoopsInBenchmarks).toBe(true);
    expect(cert.zeroOpenCutLoopsInClosedShapes).toBe(true);
    expect(cert.bulgeGroup42VerifiedInLwPolylines).toBe(true);
    expect(cert.zeroSplinesInLaserMode).toBe(true);
    expect(cert.dxfSondaGeneratedAndAudited).toBe(true);
    expect(cert.cypcutVerifiedByOperator).toBe(false);
    expect(cert.cypcutValidationLabel).toBe("Validação no CypCut: não verificada");
  });
});
