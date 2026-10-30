import { describe, it, expect } from "vitest";
import {
  CHAMFER_COMMAND_REGISTRY,
  CHAMFER_TECHNICAL_PALETTE,
  VERTICAL_DOCK_CATEGORIES,
  generateChamferCommandCoverageReport,
  getToolOwnerCategory,
  runVerticalParityMatrixAudit,
  applyColorAndLayerToEntities,
  createConcentricEyeletEntities,
  createIndustrialHoleEntity,
  createThreadedHoleEntities,
  createSerratedTeethEntities,
  createPocket2DEntity,
  createTangentBridgeEntities,
} from "../chamferCommandRegistry";
import type { Entity } from "../core";

describe("CHAMFER CAD — Registro Único de Comandos & Paridade Vertical × Paisagem 1:1 (T1–T15)", () => {
  it("possui exatamente as 5 categorias canônicas no Dock Vertical", () => {
    expect(VERTICAL_DOCK_CATEGORIES.map((c) => c.id)).toEqual([
      "desenho",
      "modificar",
      "precisao",
      "chapa_vision",
      "inspetor",
    ]);
    expect(VERTICAL_DOCK_CATEGORIES.map((c) => c.label)).toEqual([
      "Desenho",
      "Modificar",
      "Precisão",
      "Chapa & 1:1",
      "Inspetor",
    ]);
  });

  it("comprova 0 comandos órfãos, 0 IDs duplicados e 100% de paridade Vertical × Paisagem", () => {
    const report = generateChamferCommandCoverageReport();
    expect(report.totalCommands).toBeGreaterThanOrEqual(90);
    expect(report.mappedToVerticalCount).toBe(report.totalCommands);
    expect(report.orphanCommands).toEqual([]);
    expect(report.duplicateIds).toEqual([]);

    const parityReport = runVerticalParityMatrixAudit();
    expect(parityReport.rows.length).toBe(report.totalCommands);
    expect(parityReport.failedCount).toBe(0);
    expect(parityReport.rows.every((r) => r.status === "OK")).toBe(true);
  });

  it("inclui todos os comandos críticos de Criação (CRI), Detalhes (DET), Cor (COR), Modificar (MOD) e Eng. Reversa (REV)", () => {
    const requiredIds = [
      "tool.select",
      "tool.node",
      "tool.pan",
      "sel.all",
      "sel.invert",
      "tool.line",
      "tool.polyline",
      "tool.rect",
      "tool.rrect",
      "tool.circle",
      "tool.arc",
      "tool.ellipse",
      "tool.polygon",
      "tool.slot",
      "tool.spline",
      "cri.eyelet",
      "cri.ttr_bridge",
      "det.hole",
      "det.thread",
      "det.teeth",
      "det.pocket",
      "cor.palette",
      "mod.delete",
      "pre.use_edge",
      "rev.triangulator",
      "rev.chord_sagitta",
      "rev.capture_contour",
      "doc.project_sheet_chip",
      "view.ortho_2d",
      "global.export",
    ];
    for (const id of requiredIds) {
      const found = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === id);
      expect(found, `Comando canônico ausente: ${id}`).toBeDefined();
    }
  });

  it("garante que os 20+ comandos mais usados estão a <= 2 toques do canvas e os demais a <= 3 toques", () => {
    const report = generateChamferCommandCoverageReport();
    expect(report.top20FrequentCount).toBeGreaterThanOrEqual(20);
    expect(report.top20Exceeding2Touches).toEqual([]);
    expect(report.anyExceeding3Touches).toEqual([]);
  });

  it("mantém distinção explícita entre ORTO 2D (vista no topo) e ORTO ⊥ (travar eixos em Precisão)", () => {
    const viewOrtho = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "view.ortho_2d");
    const lockOrtho = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "pre.ortho_lock");

    expect(viewOrtho).toBeDefined();
    expect(viewOrtho?.verticalCategory).toBe("topbar");
    expect(viewOrtho?.label).toBe("ORTO 2D");

    expect(lockOrtho).toBeDefined();
    expect(lockOrtho?.verticalCategory).toBe("precisao");
    expect(lockOrtho?.label).toBe("ORTO ⊥");
  });

  it("identifica corretamente a categoria dona de cada ferramenta de canvas para o chip 'Ativa: <Ferramenta> ✕'", () => {
    expect(getToolOwnerCategory("line")).toEqual({ category: "desenho", label: "Linha" });
    expect(getToolOwnerCategory("trim")).toEqual({ category: "modificar", label: "Aparar" });
    expect(getToolOwnerCategory("offset")).toEqual({ category: "modificar", label: "Offset" });
    expect(getToolOwnerCategory("measure")).toEqual({ category: "precisao", label: "Medir" });
    expect(getToolOwnerCategory("dim")).toEqual({ category: "precisao", label: "Cotar" });
  });

  it("T6 — fornece paleta COR completa com Preto Técnico (#0F172A) e aplica cor + camada às entidades selecionadas", () => {
    const blackOption = CHAMFER_TECHNICAL_PALETTE.find((c) => c.id === "preto_tecnico");
    expect(blackOption).toBeDefined();
    expect(blackOption?.hex).toBe("#0F172A");
    expect(blackOption?.layer).toBe("corte");

    const sampleEntities: Entity[] = [
      { id: "e1", layer: "marcacao", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: "e2", layer: "dobra", type: "circle", cx: 50, cy: 50, r: 20 },
    ];

    const updated = applyColorAndLayerToEntities(sampleEntities, ["e1"], blackOption!);
    expect(updated[0]?.layer).toBe("corte");
    expect(updated[0]?.params?.strokeColor).toBe("#0F172A");
    expect(updated[1]?.layer).toBe("dobra");
    expect(updated[1]?.params?.strokeColor).toBeUndefined();
  });

  it("T7 — geradores compartilhados de Detalhes Mecânicos (Furo Ø, Rosca M, Olhal, Ponte TTR, Dentes, Cavidade) criam geometria 1:1 válida", () => {
    const hole = createIndustrialHoleEntity({
      cx: 100,
      cy: 100,
      diameterMm: 16,
      layer: "corte",
    });
    expect(hole.type).toBe("circle");
    if (hole.type === "circle") {
      expect(hole.r).toBe(8);
      expect(hole.cx).toBe(100);
      expect(hole.cy).toBe(100);
    }

    const threadEnts = createThreadedHoleEntities({
      cx: 200,
      cy: 200,
      nominalM: 10,
      pitchMm: 1.5,
    });
    expect(threadEnts.length).toBe(2);
    expect(threadEnts[0]?.layer).toBe("corte");
    expect(threadEnts[1]?.layer).toBe("marcacao");

    const eyeletEnts = createConcentricEyeletEntities({
      cx: 50,
      cy: 50,
      outerDiameterMm: 30,
      innerDiameterMm: 14,
      layer: "corte",
    });
    expect(eyeletEnts.length).toBe(2);

    const bridgeEnts = createTangentBridgeEntities({
      selectedEntities: [
        { id: "c1", layer: "corte", type: "circle", cx: 0, cy: 0, r: 20 },
        { id: "c2", layer: "corte", type: "circle", cx: 80, cy: 0, r: 12 },
      ],
      fallbackCx: 40,
      fallbackCy: 0,
      layer: "corte",
    });
    expect(bridgeEnts.length).toBe(2);
    expect(bridgeEnts[0]?.type).toBe("line");

    const teethEnt = createSerratedTeethEntities({
      startX: 0,
      startY: 0,
      toothCount: 10,
      pitchMm: 5,
      toothHeightMm: 4,
      layer: "corte",
    });
    expect(teethEnt.type).toBe("polyline");
    expect(teethEnt.layer).toBe("corte");

    const pocket = createPocket2DEntity({
      cx: 150,
      cy: 150,
      widthMm: 60,
      heightMm: 30,
      cornerRadiusMm: 6,
      layer: "recorte",
    });
    expect(pocket.type).toBe("polyline");
    expect(pocket.layer).toBe("recorte");
  });
});

