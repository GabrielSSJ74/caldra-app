import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EDGE_MODES, EXTENDED_VIEW_PRESETS } from "@/lib/viz3d/cameraPresets";
import { buildWire } from "@/lib/viz3d/wire";
import { SchematicViews } from "./SchematicViews";
import { View3DPanel, VisualizationViewport } from "./View3DPanel";
import { Wire3D } from "./Wire3D";

const SLUGS = [
  "quadrado-redondo",
  "curva-de-gomos",
  "cone",
  "tronco-de-cone",
  "cone-excentrico",
  "boca-de-lobo",
  "y",
  "reducao-circular",
  "cilindro",
  "flanges",
  "tampas",
  "calotas",
] as const;

describe("Wire3D, View3DPanel e SchematicViews (Testes A, B e C)", () => {
  for (const slug of SLUGS) {
    it(`renders Wire3D for ${slug} across all 4 modes (SOMB, SOMB+AR, ARAME, SOLID) without crashing`, () => {
      const model = buildWire(slug, {
        d1: 450,
        d2: 300,
        h: 450,
        ang: 90,
        n: 4,
        divisions: 12,
        baseA: 400,
        baseB: 300,
        seg: 24,
      });
      for (const mode of EDGE_MODES) {
        const html = renderToString(
          React.createElement(Wire3D, {
            model,
            interactive: true,
            edgeMode: mode.id,
          }),
        );
        expect(html).toContain("<svg");
        expect(html).toContain(`data-edge-mode="${mode.id}"`);
      }
    });
  }

  it("renders Wire3D with mode='pan' and mode='orbit'", () => {
    const model = buildWire("quadrado-redondo", {
      d1: 400,
      d2: 200,
      h: 300,
      baseA: 400,
      baseB: 300,
      seg: 24,
    });
    const htmlPan = renderToString(
      React.createElement(Wire3D, {
        model,
        interactive: true,
        mode: "pan",
      }),
    );
    expect(htmlPan).toContain("cursor-move");

    const htmlOrbit = renderToString(
      React.createElement(Wire3D, {
        model,
        interactive: true,
        mode: "orbit",
      }),
    );
    expect(htmlOrbit).toContain("cursor-grab");
  });

  it("renders all extended views in Wire3D", () => {
    const model = buildWire("cone", { d1: 500, d2: 100, h: 400 });
    for (const preset of EXTENDED_VIEW_PRESETS) {
      const html = renderToString(
        React.createElement(Wire3D, {
          model,
          view: preset.id,
        }),
      );
      expect(html).toContain("<svg");
    }
  });

  it("renders View3DPanel with structured top and bottom bars (zero floating overlap)", () => {
    const model = buildWire("curva-de-gomos", {
      d1: 450,
      d2: 300,
      h: 450,
      ang: 90,
      n: 4,
      divisions: 12,
    });
    const html = renderToString(
      React.createElement(View3DPanel, {
        model,
        unfold: 0,
        onUnfold: () => {},
        onPlanificar: () => {},
      }),
    );
    expect(html).toContain("viewer-topbar-3d");
    expect(html).toContain("viewer-footer-3d");
    expect(html).toContain("SOMB");
    expect(html).toContain("SOMB+AR");
    expect(html).toContain("ARAME");
    expect(html).toContain("SOLID");
  });

  it("renders VisualizationViewport in 3D and 2D modes without crashing", () => {
    const model = buildWire("curva-de-gomos", {
      d1: 450,
      d2: 300,
      h: 450,
      ang: 90,
      n: 4,
      divisions: 12,
    });
    const html3d = renderToString(
      React.createElement(
        VisualizationViewport,
        {
          mode: "3d",
          onModeChange: () => {},
          model,
          unfold: 0,
          onUnfold: () => {},
          onPlanificar: () => {},
        },
        React.createElement("div", null, "2D View"),
      ),
    );
    expect(html3d).toContain("viewer-3d-structured");

    const html2d = renderToString(
      React.createElement(
        VisualizationViewport,
        {
          mode: "2d",
          onModeChange: () => {},
          model,
          unfold: 0,
          onUnfold: () => {},
          showGeneratrices: true,
          onToggleGeneratrices: () => {},
        },
        React.createElement(SchematicViews, {
          slug: "curva-de-gomos",
          params: { d1: 450, d2: 300, h: 450, ang: 90, n: 4, divisions: 12 },
          showGeneratrices: true,
        }),
      ),
    );
    expect(html2d).toContain("viewer-2d-structured");
    expect(html2d).toContain("VISTA 2D • MM");
    expect(html2d).toContain("GERATRIZES");
    expect(html2d).not.toContain("sv-grid-");
  });
});
