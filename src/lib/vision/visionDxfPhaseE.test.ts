/**
 * Testes da FASE E — Entidades Nativas do CHAMFER CAD, Exportação DXF com Bulge (Grupo 42),
 * Soldagem de Cadeias de Corte, Auditoria de Releitura Automática (Seção 12) e DXF-SONDA.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportDxf, importDxf } from "@/lib/dxf/dxfService";
import {
  DEFAULT_CNC_OPTIONS,
  auditDxfRoundTrip,
  buildCncDxf,
  verifyCncDxf,
  weldConnectedCutChains,
} from "@/lib/dxf/cncExport";
import { buildDxfSondaDocument, generateDxfSondaText } from "@/lib/dxf/dxfSondaGenerator";
import { previewDxfSvg } from "@/lib/dxf/previewRenderer";
import { fromDxf, rectPolyline, uid, type Entity } from "@/lib/lab2d/core";
import { createCenterRectangle, createSlotPolyline } from "@/lib/lab2d/cadGeometryCore";
import { analyzeRaster, toEntities } from "./vectorizer";
import { SyntheticSuiteB } from "./visionMetricsAndHarness";

describe("FASE E — Entidades Nativas, Exportação DXF com Bulge e Auditoria Round-Trip", () => {
  it("E1. Gera e grava public/dxf-sonda-cypcut.dxf com as 5 formas de diagnóstico e valida releitura", () => {
    const dxfText = generateDxfSondaText();
    const outPath = join(process.cwd(), "public", "dxf-sonda-cypcut.dxf");
    writeFileSync(outPath, dxfText, "utf8");

    expect(dxfText).toContain("$ACADVER\n1\nAC1018");
    expect(dxfText).toContain("$INSUNITS\n70\n4");
    expect(dxfText).toContain("AcDbCircle");
    expect(dxfText).toContain("AcDbPolyline");
    expect(dxfText).toContain("\n42\n1.000000\n");
    expect(dxfText).toContain("\n42\n0.414214\n");

    const parsed = importDxf(dxfText);
    expect(parsed.entities).toHaveLength(5);
    expect(parsed.entities[0]?.type).toBe("CIRCLE");
    expect(parsed.entities[1]?.type).toBe("LWPOLYLINE");
    if (parsed.entities[1]?.type === "LWPOLYLINE") {
      expect(parsed.entities[1].closed).toBe(true);
      expect(parsed.entities[1].points).toHaveLength(2);
      expect(parsed.entities[1].points[0]?.bulge).toBeCloseTo(1.0, 5);
      expect(parsed.entities[1].points[1]?.bulge).toBeCloseTo(1.0, 5);
    }
    if (parsed.entities[3]?.type === "LWPOLYLINE") {
      expect(parsed.entities[3].closed).toBe(true);
      expect(parsed.entities[3].points).toHaveLength(8);
      const bulges = parsed.entities[3].points.filter((p) => p.bulge !== undefined);
      expect(bulges).toHaveLength(4);
      expect(bulges[0]!.bulge).toBeCloseTo(Math.tan(Math.PI / 8), 5);
    }
    if (parsed.entities[4]?.type === "LWPOLYLINE") {
      expect(parsed.entities[4].closed).toBe(true);
      expect(parsed.entities[4].points).toHaveLength(4);
      expect(parsed.entities[4].points[1]?.bulge).toBeCloseTo(1.0, 5);
      expect(parsed.entities[4].points[3]?.bulge).toBeCloseTo(1.0, 5);
    }

    // A Sonda 3 é propositalmente um controle negativo (polígono de 24 lados sem bulge fingindo ser círculo)
    const audit = auditDxfRoundTrip(dxfText);
    expect(audit.polygonalCircularHoles).toBe(1);
    expect(audit.circlesCount).toBe(1);
    expect(audit.closedBulgePolylinesCount).toBe(3);
  });

  it("E2. Construtores CAD nativos (rectPolyline, createCenterRectangle, createSlotPolyline) usam bulge exato sem facetar", () => {
    const rRect = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 60 }, "corte", 10);
    expect(rRect.type).toBe("polyline");
    if (rRect.type === "polyline") {
      expect(rRect.pts).toHaveLength(8);
      expect(rRect.bulges).toHaveLength(8);
      expect(rRect.bulges?.filter((b) => Math.abs(b) > 0.1)).toHaveLength(4);
    }

    const cRect = createCenterRectangle({ x: 50, y: 30 }, { x: 100, y: 60 }, "corte", 10);
    expect(cRect.type).toBe("polyline");
    if (cRect.type === "polyline") {
      expect(cRect.pts).toHaveLength(8);
      expect(cRect.bulges).toHaveLength(8);
    }

    const slot = createSlotPolyline({ x: 50, y: 50 }, 60, 20, 0, "corte");
    expect(slot.type).toBe("polyline");
    if (slot.type === "polyline") {
      expect(slot.pts).toHaveLength(4);
      expect(slot.bulges).toEqual([0, 1, 0, 1]);
    }

    const doc = buildCncDxf([rRect, slot], { ...DEFAULT_CNC_OPTIONS, leads: false });
    const dxfText = exportDxf(doc);
    const check = verifyCncDxf([rRect, slot], { ...DEFAULT_CNC_OPTIONS, leads: false }, dxfText);
    expect(check.ok).toBe(true);

    // Round-trip de volta para Entity[] via fromDxf preserva bulges com sinal correto
    const roundTripped = fromDxf(importDxf(dxfText), "corte");
    expect(roundTripped).toHaveLength(2);
    expect(roundTripped[0]?.type).toBe("polyline");
    if (roundTripped[0]?.type === "polyline") {
      expect(roundTripped[0].bulges?.[0]).toBeCloseTo(Math.tan(Math.PI / 8), 5);
    }

    // Preview SVG renderiza comandos de arco "A" para LWPOLYLINE com bulge
    const preview = previewDxfSvg(doc);
    expect(preview.svg).toContain(" A ");
  });

  it("E3. Solda cadeias conexas de LINE e ARC de corte em uma única LWPOLYLINE fechada com bulge", () => {
    // 2 retas horizontais + 2 semicírculos formando um rasgo oblongo de 60x20 mm
    const entities: Entity[] = [
      { id: uid(), layer: "corte", type: "line", x1: 10, y1: 0, x2: 50, y2: 0 },
      { id: uid(), layer: "corte", type: "arc", cx: 50, cy: 10, r: 10, a0: -Math.PI / 2, a1: Math.PI / 2 },
      { id: uid(), layer: "corte", type: "line", x1: 50, y1: 20, x2: 10, y2: 20 },
      { id: uid(), layer: "corte", type: "arc", cx: 10, cy: 10, r: 10, a0: Math.PI / 2, a1: (3 * Math.PI) / 2 },
    ];

    const welded = weldConnectedCutChains(entities, 0.05);
    expect(welded).toHaveLength(1);
    expect(welded[0]?.type).toBe("polyline");
    if (welded[0]?.type === "polyline") {
      expect(welded[0].closed).toBe(true);
      expect(welded[0].pts).toHaveLength(4);
      expect(welded[0].bulges?.filter((b) => Math.abs(Math.abs(b) - 1) < 1e-4)).toHaveLength(2);
    }

    const doc = buildCncDxf(entities, { ...DEFAULT_CNC_OPTIONS, leads: false });
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0]?.type).toBe("LWPOLYLINE");
  });

  it("E4. Suporta ELLIPSE nativa no perfil técnico CAD e LWPOLYLINE de arcos tangentes no perfil Laser/CypCut", () => {
    const ellipseEnt: Entity = {
      id: uid(),
      layer: "corte",
      type: "ellipse",
      cx: 100,
      cy: 80,
      rx: 50,
      ry: 30,
      rotation: 0.25,
    };

    const cadDoc = buildCncDxf([ellipseEnt], {
      ...DEFAULT_CNC_OPTIONS,
      profileId: "tecnico",
      leads: false,
    });
    expect(cadDoc.entities).toHaveLength(1);
    expect(cadDoc.entities[0]?.type).toBe("ELLIPSE");
    const cadText = exportDxf(cadDoc);
    expect(cadText).toContain("AcDbEllipse");
    const cadBack = importDxf(cadText);
    expect(cadBack.entities[0]?.type).toBe("ELLIPSE");

    const laserDoc = buildCncDxf([ellipseEnt], {
      ...DEFAULT_CNC_OPTIONS,
      profileId: "laser-cnc",
      leads: false,
    });
    expect(laserDoc.entities).toHaveLength(1);
    expect(laserDoc.entities[0]?.type).toBe("LWPOLYLINE");
    if (laserDoc.entities[0]?.type === "LWPOLYLINE") {
      expect(laserDoc.entities[0].closed).toBe(true);
      expect(laserDoc.entities[0].points).toHaveLength(8);
      expect(laserDoc.entities[0].points.every((p) => p.bulge !== undefined && Math.abs(p.bulge) > 0.01)).toBe(
        true,
      );
    }
  });

  it("E5. Pipeline ponta-a-ponta (Imagem -> Vision 2.0 -> Entidades -> DXF -> Auditoria Seção 12) passa com 0 defeitos em Flange, Rasgo Oblongo e Traço Espesso", () => {
    const makeImage = (w: number, h: number, fn: (x: number, y: number) => boolean): ImageData => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const v = fn(x, y) ? 0 : 255;
          data[idx] = v;
          data[idx + 1] = v;
          data[idx + 2] = v;
          data[idx + 3] = 255;
        }
      }
      return { width: w, height: h, data } as ImageData;
    };

    // Caso 1: Flange circular (silhueta) R=110 com furo central R=35 e 4 furos periféricos R=14
    const imgFlange = makeImage(280, 280, (x, y) => {
      const dCenter = Math.hypot(x - 140, y - 140);
      if (dCenter > 110 || dCenter < 35) return false;
      const holeCenters = [
        [140 + 75, 140],
        [140 - 75, 140],
        [140, 140 + 75],
        [140, 140 - 75],
      ];
      for (const [hx, hy] of holeCenters) {
        if (Math.hypot(x - hx!, y - hy!) < 14) return false;
      }
      return true;
    });

    // Caso 2: Chapa retangular arredondada (silhueta) com 1 rasgo oblongo e 2 furos circulares
    const imgPlate = makeImage(320, 220, (x, y) => {
      // Retângulo 240x140 centrado em (160, 110) -> x in [40, 280], y in [40, 180]
      if (x < 40 || x > 280 || y < 40 || y > 180) return false;
      // Furos circulares em (90, 110) e (230, 110), R=18
      if (Math.hypot(x - 90, y - 110) < 18) return false;
      if (Math.hypot(x - 230, y - 110) < 18) return false;
      // Rasgo oblongo central de (140, 110) a (180, 110) com R=12
      const clampedX = Math.max(140, Math.min(180, x));
      if (Math.hypot(x - clampedX, y - 110) < 12) return false;
      return true;
    });

    // Caso 3: Desenho técnico de traço espesso w=4 px com círculo R=70 (sem gerar 2 laços concêntricos!)
    const imgStrokeCircle = makeImage(240, 240, (x, y) => {
      const d = Math.hypot(x - 120, y - 120);
      return Math.abs(d - 70) <= 2.0;
    });

    for (const img of [imgFlange, imgPlate, imgStrokeCircle]) {
      const analysis = analyzeRaster(img, {
        tolerance: "medium",
        iterativeAutoCorrect: false,
      });
      const entities = toEntities(analysis, { mmPerPx: 1, source: "manual" }, "corte");
      const doc = buildCncDxf(entities, { ...DEFAULT_CNC_OPTIONS, leads: false });
      const dxfText = exportDxf(doc);
      const audit = auditDxfRoundTrip(dxfText, { w0Mm: 4.0 });

      expect(audit.passed).toBe(true);
      expect(audit.polygonalCircularHoles).toBe(0);
      expect(audit.unconfirmedConcentricPairs).toBe(0);
      expect(audit.openCutProfiles).toBe(0);
      expect(audit.duplicateEntities).toBe(0);
      expect(audit.microSegmentsUnder005mm).toBe(0);
    }

    // Garante que buildDxfSondaDocument e SyntheticSuiteB estão acessíveis diretamente
    expect(buildDxfSondaDocument().entities).toHaveLength(5);
    expect(SyntheticSuiteB.runG2().countsByType.CIRCLE).toBe(1);
  });
});
