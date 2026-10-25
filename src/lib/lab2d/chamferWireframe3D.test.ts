import { describe, expect, it } from "vitest";
import type { Entity } from "./core";
import { computeWorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  CHAMFER_WIREFRAME_3D_PALETTE,
  DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
  buildClassifiedWireframeScene3D,
  classifyOuterAndHoleEntities,
  computeCircle3DWireframeDecomposition,
  resolveBaseToTopExtrusionVector,
} from "./chamferWireframe3D";

describe("CHAMFER CAD — Hierarquia de Arestas, Profundidade Óptica e Wireframe Técnico 3D", () => {
  // Constrói a flange circular exata da Imagem 1 / Imagem 2:
  // Disco externo Ø240mm (R=120), furo central Ø90mm (R=45) e 8 furos periféricos Ø22mm (R=11) no PCD Ø176mm (R=88)
  function buildReferenceFlangeEntities(): Entity[] {
    const entities: Entity[] = [
      {
        id: "flange_outer",
        layer: "corte",
        type: "circle",
        cx: 0,
        cy: 0,
        r: 120,
      },
      {
        id: "flange_center_bore",
        layer: "furo",
        type: "circle",
        cx: 0,
        cy: 0,
        r: 45,
      },
      // Linhas de centro de simetria
      {
        id: "axis_x",
        layer: "centro",
        type: "line",
        x1: -135,
        y1: 0,
        x2: 135,
        y2: 0,
        isConstruction: true,
      },
      {
        id: "axis_y",
        layer: "centro",
        type: "line",
        x1: 0,
        y1: -135,
        x2: 0,
        y2: 135,
        isConstruction: true,
      },
    ];

    const boltCircleR = 88;
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      entities.push({
        id: `bolt_hole_${i + 1}`,
        layer: "furo",
        type: "circle",
        cx: boltCircleR * Math.cos(ang),
        cy: boltCircleR * Math.sin(ang),
        r: 11,
      });
    }

    return entities;
  }

  it("Teste A — Flange Circular com Furo Central e 8 Furos Periféricos (Imagem 1 vs. Imagem 2: θ=55°, φ=-37°, CHAPA 50.0MM)", () => {
    const entities = buildReferenceFlangeEntities();
    const orbitProj = computeWorkplaneOrbitProjection2D(55, -37, { x: 0, y: 0 }, 50);
    expect(orbitProj.isTilted).toBe(true);

    // Verifica que a extrusão Base (Z=0) -> Topo (Z=+50mm) projeta a face superior PARA CIMA na tela (dy < 0)
    const { baseOffset, topOffset, deltaExtrusion } = resolveBaseToTopExtrusionVector({
      isOrbitTilted: true,
      orbitProjection: orbitProj,
      sheetThickness: 50,
    });
    expect(baseOffset).toEqual({ x: 0, y: 0 });
    const screenDx = orbitProj.a * topOffset.x + orbitProj.c * topOffset.y;
    const screenDy = orbitProj.b * topOffset.x + orbitProj.d * topOffset.y;
    expect(Math.abs(screenDx)).toBeLessThan(1e-6);
    expect(screenDy).toBeLessThan(-10); // Face Superior (Z=+h) está acima da Base (Z=0) na tela!
    expect(Math.hypot(deltaExtrusion.x, deltaExtrusion.y)).toBeGreaterThan(10);

    // Classifica topologia: 1 contorno externo + 9 furos (1 central + 8 periféricos)
    const topo = classifyOuterAndHoleEntities(entities);
    expect(topo.outerEntityIds.has("flange_outer")).toBe(true);
    expect(topo.holeEntityIds.size).toBe(9);
    expect(topo.outerToHolesMap.get("flange_outer")?.length).toBe(9);

    const scene = buildClassifiedWireframeScene3D(entities, {
      isOrbitTilted: true,
      orbitProjection: orbitProj,
      sheetThickness: 50,
    });

    // Todas as 5 categorias devem estar presentes na flange
    expect(scene.stats.top_primary).toBe(10); // 1 externo + 1 central + 8 periféricos na face superior
    expect(scene.stats.lateral_wall).toBeGreaterThanOrEqual(20); // geratrizes tangentes + quadrantes
    expect(scene.stats.bottom_visible).toBeGreaterThanOrEqual(2); // base frontal do disco + arco inferior do furo central
    expect(scene.stats.hidden_back).toBeGreaterThanOrEqual(9); // arcos traseiros ocultos na base
    expect(scene.stats.center_axis).toBe(2); // eixos X e Y na face superior

    // Véu óptico da face superior possui exatamente 9 furos vazados para recorte even-odd
    const topVeil = scene.opticalFaces.find((f) => f.role === "top_veil");
    expect(topVeil).toBeDefined();
    expect(topVeil?.holeLoops.length).toBe(9);

    // Micro-pontos de vértice presentes nos quadrantes da face superior
    expect(scene.topVertexDots.length).toBeGreaterThanOrEqual(40);
  });

  it("Teste B — Chapa Retangular com Furos e Rasgos Internos", () => {
    const rectEntities: Entity[] = [
      {
        id: "plate_outer",
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: [
          { x: -100, y: -60 },
          { x: 100, y: -60 },
          { x: 100, y: 60 },
          { x: -100, y: 60 },
        ],
      },
      {
        id: "inner_slot",
        layer: "furo",
        type: "polyline",
        closed: true,
        pts: [
          { x: -40, y: -15 },
          { x: 40, y: -15 },
          { x: 40, y: 15 },
          { x: -40, y: 15 },
        ],
      },
      {
        id: "inner_hole",
        layer: "furo",
        type: "circle",
        cx: 70,
        cy: 0,
        r: 12,
      },
    ];

    const orbitProj = computeWorkplaneOrbitProjection2D(35, 35.264, { x: 0, y: 0 }, 20);
    const scene = buildClassifiedWireframeScene3D(rectEntities, {
      isOrbitTilted: true,
      orbitProjection: orbitProj,
      sheetThickness: 20,
    });

    expect(scene.stats.top_primary).toBeGreaterThanOrEqual(9); // 4 lados externos + 4 lados rasgo + 1 círculo
    expect(scene.stats.lateral_wall).toBeGreaterThanOrEqual(10); // 4 cantos externos + 4 cantos rasgo + geratrizes furo
    expect(scene.stats.bottom_visible).toBeGreaterThanOrEqual(2); // bordas frontais inferiores visíveis
    expect(scene.stats.hidden_back).toBeGreaterThanOrEqual(2); // bordas traseiras ocultas sob a chapa

    const topVeil = scene.opticalFaces.find((f) => f.role === "top_veil");
    expect(topVeil?.holeLoops.length).toBe(2);
  });

  it("Teste C — Peça com Múltiplas Alturas, Degraus e Canais", () => {
    const steppedEntities: Entity[] = [
      {
        id: "base_block",
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: [
          { x: -80, y: -50 },
          { x: 80, y: -50 },
          { x: 80, y: 50 },
          { x: -80, y: 50 },
        ],
      },
      {
        id: "raised_boss",
        layer: "corte",
        type: "circle",
        cx: 0,
        cy: 0,
        r: 30,
        params: {
          zBaseMm: 20,
          extrudeHeightMm: 15,
        },
      },
      {
        id: "top_channel",
        layer: "marcacao",
        type: "polyline",
        closed: true,
        pts: [
          { x: -60, y: -10 },
          { x: 60, y: -10 },
          { x: 60, y: 10 },
          { x: -60, y: 10 },
        ],
      },
    ];

    const orbitProj = computeWorkplaneOrbitProjection2D(45, 35, { x: 0, y: 0 }, 20);
    const scene = buildClassifiedWireframeScene3D(steppedEntities, {
      isOrbitTilted: true,
      orbitProjection: orbitProj,
      sheetThickness: 20,
    });

    const steppedVeil = scene.opticalFaces.find((f) => f.role === "stepped_top_veil");
    expect(steppedVeil).toBeDefined();
    expect(scene.stats.top_primary).toBeGreaterThanOrEqual(9);
    expect(scene.stats.lateral_wall).toBeGreaterThanOrEqual(10);
  });

  it("Teste D — Cilindro / Tubo / Bucha Concêntrica", () => {
    const decompOuter = computeCircle3DWireframeDecomposition(
      0,
      0,
      60,
      { x: 0, y: 0 },
      { x: 0, y: -40 },
      false,
    );
    expect(decompOuter.silhouetteGeneratrices.length).toBe(2);
    expect(decompOuter.bottomVisibleArcs.length).toBe(1);
    expect(decompOuter.bottomHiddenArcs.length).toBe(1);

    const decompInnerBore = computeCircle3DWireframeDecomposition(
      0,
      0,
      35,
      { x: 0, y: 0 },
      { x: 0, y: -40 },
      true,
    );
    expect(decompInnerBore.silhouetteGeneratrices.length).toBe(2);
    // Como ||E|| = 40 < 2*r = 70, o fundo do furo é parcialmente visível através da abertura!
    expect(decompInnerBore.bottomVisibleArcs.length).toBe(1);
    expect(decompInnerBore.bottomHiddenArcs.length).toBe(1);
  });

  it("Teste E — Rotação Orbital Contínua e Ordenação Estrita de Profundidade (Painter's Algorithm)", () => {
    const entities = buildReferenceFlangeEntities();
    const angles: [number, number][] = [
      [-45, 35.264], // Isométrica
      [0, 20], // Frontal
      [90, 20], // Direita
      [-90, 20], // Esquerda
      [55, -37], // Livre inclinada (Imagem 1 / Imagem 2)
    ];

    for (const [az, el] of angles) {
      const proj = computeWorkplaneOrbitProjection2D(az, el, { x: 0, y: 0 }, 50);
      const scene = buildClassifiedWireframeScene3D(entities, {
        isOrbitTilted: proj.isTilted,
        orbitProjection: proj,
        sheetThickness: 50,
      });

      // Verifica ordenação monotônica de paintDepth nas faces e arestas
      for (let i = 1; i < scene.opticalFaces.length; i++) {
        expect(scene.opticalFaces[i]!.paintDepth).toBeGreaterThanOrEqual(
          scene.opticalFaces[i - 1]!.paintDepth,
        );
      }
      for (let i = 1; i < scene.edges.length; i++) {
        expect(scene.edges[i]!.paintDepth).toBeGreaterThanOrEqual(
          scene.edges[i - 1]!.paintDepth,
        );
      }

      // Arestas ocultas (hidden_back) sempre têm paintDepth menor que top_primary
      const maxHiddenDepth = Math.max(
        ...scene.edges.filter((e) => e.category === "hidden_back").map((e) => e.paintDepth),
      );
      const minTopDepth = Math.min(
        ...scene.edges.filter((e) => e.category === "top_primary").map((e) => e.paintDepth),
      );
      expect(maxHiddenDepth).toBeLessThan(minTopDepth);
    }
  });

  it("Teste F & G — Coerência 2D ↔ 3D, Preservação de Dados e Controles de Estilo (Arestas Ocultas ON/OFF)", () => {
    const entities = buildReferenceFlangeEntities();
    const snapshotBefore = JSON.stringify(entities);

    const proj = computeWorkplaneOrbitProjection2D(55, -37, { x: 0, y: 0 }, 50);
    const sceneWithHidden = buildClassifiedWireframeScene3D(entities, {
      isOrbitTilted: true,
      orbitProjection: proj,
      sheetThickness: 50,
      styleConfig: { ...DEFAULT_CHAMFER_WIREFRAME_3D_STYLE, showHiddenEdges: true },
    });
    expect(sceneWithHidden.stats.hidden_back).toBeGreaterThan(0);

    const sceneWithoutHidden = buildClassifiedWireframeScene3D(entities, {
      isOrbitTilted: true,
      orbitProjection: proj,
      sheetThickness: 50,
      styleConfig: { ...DEFAULT_CHAMFER_WIREFRAME_3D_STYLE, showHiddenEdges: false },
    });
    expect(sceneWithoutHidden.stats.hidden_back).toBe(0);
    expect(sceneWithoutHidden.stats.top_primary).toBe(sceneWithHidden.stats.top_primary);

    // Ao retornar para ORTO 2D (0°, 90°), isTilted é false e os dados 2D originais permanecem 100% intactos
    const flatProj = computeWorkplaneOrbitProjection2D(0, 90, { x: 0, y: 0 }, 50);
    expect(flatProj.isTilted).toBe(false);
    expect(JSON.stringify(entities)).toBe(snapshotBefore);
    expect(CHAMFER_WIREFRAME_3D_PALETTE.dark.topPrimaryWidthPx).toBeGreaterThanOrEqual(1.5);
    expect(CHAMFER_WIREFRAME_3D_PALETTE.dark.lateralWallHex).toBe("#91A3B8");
    expect(CHAMFER_WIREFRAME_3D_PALETTE.dark.bottomVisibleHex).toBe("#65758A");
    expect(CHAMFER_WIREFRAME_3D_PALETTE.dark.hiddenBackHex).toBe("#53647B");
  });
});
