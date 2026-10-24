import { describe, expect, it } from "vitest";
import { rectPolyline, type Entity } from "@/lib/lab2d/core";
import { CadFeatureTree } from "@/lib/cad/features/CadFeatureTree";
import {
  analyze2DSketchFor3D,
  compute2DTo3DCameraMatch,
  cubicBezier022,
  evaluateMorphCameraPose,
  LINKED_SKETCH_FEATURE_ID,
  MorphTransitionController,
  sync2DSketchToFeatureTree,
} from "./sketch3dBridge";

describe("CHAMFER CAD — Seamless 2D <-> 3D Morph & 1:1 Geometric Sync", () => {
  it("Teste A: Retângulo horizontal com 3,0 mm preserva dimensões reais, coordenadas 1:1 e espessura exata sem substituir por cone genérico", async () => {
    const rect = rectPolyline({ x: 50, y: 100 }, { x: 250, y: 220 }, "corte");
    const entities: Entity[] = [{ ...rect, id: "rect_200x120" }];
    const thickness = 3.0;

    const analysis = analyze2DSketchFor3D(entities, thickness);
    expect(analysis.status).toBe("VALID_SOLID");
    expect(analysis.contours.length).toBe(1);
    expect(analysis.bounds2D).not.toBeNull();
    expect(analysis.bounds2D!.width).toBeCloseTo(200, 3);
    expect(analysis.bounds2D!.height).toBeCloseTo(120, 3);

    // Coordenadas 3D mapeadas 1:1 (X = x, Y = -y, Z = 0..3)
    expect(analysis.bounds3D!.minX).toBeCloseTo(50, 3);
    expect(analysis.bounds3D!.maxX).toBeCloseTo(250, 3);
    expect(analysis.bounds3D!.minY).toBeCloseTo(-220, 3);
    expect(analysis.bounds3D!.maxY).toBeCloseTo(-100, 3);
    expect(analysis.bounds3D!.minZ).toBeCloseTo(0, 3);
    expect(analysis.bounds3D!.maxZ).toBeCloseTo(3.0, 3);

    const tree = new CadFeatureTree();
    const syncRes = sync2DSketchToFeatureTree(tree, analysis);
    expect(syncRes.hasSolidFeatures).toBe(true);
    expect(tree.getFeatures().length).toBe(1);
    expect(tree.getFeatures()[0]!.id).toBe(LINKED_SKETCH_FEATURE_ID);
    expect(tree.getFeatures()[0]!.type).toBe("extrude_sketch");

    const rebuild = await tree.rebuild();
    expect(rebuild.errors).toEqual([]);
    expect(rebuild.activeShape).not.toBeNull();
    expect(rebuild.massProperties).not.toBeNull();
    expect(rebuild.tessellation).not.toBeNull();

    // Volume esperado: 200 * 120 * 3 = 72.000 mm³
    expect(rebuild.massProperties!.volume).toBeCloseTo(200 * 120 * 3, -1);
    const bounds = rebuild.tessellation!.bounds;
    expect(bounds.size.x).toBeCloseTo(200, 1);
    expect(bounds.size.y).toBeCloseTo(120, 1);
    expect(bounds.size.z).toBeCloseTo(3.0, 2);
    // Posição real preservada na malha 3D (sem recentralizar em 0,0)
    expect(bounds.min.x).toBeCloseTo(50, 1);
    expect(bounds.max.x).toBeCloseTo(250, 1);
    expect(bounds.min.y).toBeCloseTo(-220, 1);
    expect(bounds.max.y).toBeCloseTo(-100, 1);
    expect(bounds.min.z).toBeCloseTo(0, 2);
    expect(bounds.max.z).toBeCloseTo(3.0, 2);
  });

  it("Teste B: Perfil com furo circular interno subtrai volume real e múltiplas alternâncias 2D<->3D não duplicam a extrusão", async () => {
    const outerRect: Entity = {
      ...rectPolyline({ x: 0, y: 0 }, { x: 200, y: 100 }, "corte"),
      id: "outer_plate",
    };
    const innerHole: Entity = {
      id: "hole_d40",
      layer: "corte",
      type: "circle",
      cx: 100,
      cy: 50,
      r: 20,
    };
    const entities: Entity[] = [outerRect, innerHole];
    const thickness = 5.0;

    const tree = new CadFeatureTree();

    // Simula 5 ciclos consecutivos de sincronização 2D <-> 3D
    for (let i = 0; i < 5; i++) {
      const analysis = analyze2DSketchFor3D(entities, thickness);
      expect(analysis.status).toBe("VALID_SOLID");
      expect(analysis.contours.length).toBe(1);
      expect(analysis.contours[0]!.holes.length).toBe(1);
      expect(analysis.contours[0]!.holes[0]!.circle?.r).toBeCloseTo(20, 3);

      sync2DSketchToFeatureTree(tree, analysis);
      // Nunca deve duplicar o nó de extrusão base
      expect(tree.getFeatures().length).toBe(1);
      expect(tree.getFeatures()[0]!.id).toBe(LINKED_SKETCH_FEATURE_ID);
    }

    const rebuild = await tree.rebuild();
    expect(rebuild.errors).toEqual([]);
    const expectedVol = (200 * 100 - Math.PI * 20 * 20) * 5.0;
    // Tolerância para discretização de cilindro B-Rep (48 segmentos)
    expect(Math.abs(rebuild.massProperties!.volume - expectedVol) / expectedVol).toBeLessThan(0.01);
  });

  it("Teste C: Esboço aberto ou inválido nunca inventa sólido genérico, preserva linhas de esboço no plano XY e informa status técnico", async () => {
    const openLines: Entity[] = [
      { id: "l1", layer: "corte", type: "line", x1: 10, y1: 10, x2: 120, y2: 10 },
      { id: "l2", layer: "corte", type: "line", x1: 120, y1: 10, x2: 120, y2: 80 },
    ];

    const analysis = analyze2DSketchFor3D(openLines, 3.0);
    expect(analysis.status).toBe("OPEN_OR_EMPTY_SKETCH");
    expect(analysis.contours.length).toBe(0);
    expect(analysis.wireframes.length).toBe(2);
    expect(analysis.message).toContain("aberto");

    const tree = new CadFeatureTree();
    const syncRes = sync2DSketchToFeatureTree(tree, analysis);
    expect(syncRes.hasSolidFeatures).toBe(false);
    expect(tree.getFeatures().length).toBe(0);
  });

  it("Teste D: Recursos 3D adicionados na árvore (fillet, hole_cut) são preservados ao voltar ao 2D e retornar ao 3D", async () => {
    const rect: Entity = {
      ...rectPolyline({ x: 0, y: 0 }, { x: 160, y: 100 }, "corte"),
      id: "base_rect",
    };
    const tree = new CadFeatureTree();

    // 1. Primeira ida ao 3D
    const analysis1 = analyze2DSketchFor3D([rect], 6.0);
    sync2DSketchToFeatureTree(tree, analysis1);
    await tree.rebuild();

    // 2. Adiciona recursos 3D na árvore (filete de aresta + furo 3D passante)
    tree.addFeature({
      name: "Filete 3D R1.5",
      type: "fillet",
      parameters: { radius: 1.5, edgeIndices: [0] },
    });
    tree.addFeature({
      name: "Furo 3D Ø20mm",
      type: "hole_cut",
      parameters: {
        diameter: 20,
        depth: 20,
        isThrough: true,
        position: { x: 80, y: -50, z: -2 },
      },
    });
    expect(tree.getFeatures().length).toBe(3);

    // 3. Volta ao 2D, altera o retângulo para 180x100 e espessura para 8.0 mm, e retorna ao 3D
    const resizedRect: Entity = {
      ...rectPolyline({ x: 0, y: 0 }, { x: 180, y: 100 }, "corte"),
      id: "base_rect",
    };
    const analysis2 = analyze2DSketchFor3D([resizedRect], 8.0);
    const syncRes2 = sync2DSketchToFeatureTree(tree, analysis2);

    expect(syncRes2.changed).toBe(true);
    expect(syncRes2.hasSolidFeatures).toBe(true);
    // Os 3 recursos continuam na árvore na ordem correta (extrusão base + filete + furo 3D)
    expect(tree.getFeatures().map((f) => f.type)).toEqual(["extrude_sketch", "fillet", "hole_cut"]);

    const rebuild2 = await tree.rebuild();
    expect(rebuild2.errors).toEqual([]);
    expect(rebuild2.activeShape).not.toBeNull();
  });

  it("Teste E: Correspondência óptica 1:1 no quadro t=0 entre câmera 2D (tx, ty, k) e frustum 3D + interpolação suave", () => {
    const view2D = { tx: 140, ty: 90, k: 1.35 };
    const viewportW = 1280;
    const viewportH = 720;
    const fovDeg = 38;

    const rect: Entity = {
      ...rectPolyline({ x: 80, y: 60 }, { x: 320, y: 210 }, "corte"),
      id: "r1",
    };
    const analysis = analyze2DSketchFor3D([rect], 3.0);
    const match = compute2DTo3DCameraMatch(view2D, viewportW, viewportH, fovDeg, analysis.bounds3D);

    // Verifica centro exato do mundo 2D na tela:
    const expectedWorldCenterX = (viewportW * 0.5 - view2D.tx) / view2D.k;
    const expectedWorldCenterY2D = (viewportH * 0.5 - view2D.ty) / view2D.k;
    expect(match.startPose.target.x).toBeCloseTo(expectedWorldCenterX, 6);
    expect(match.startPose.target.y).toBeCloseTo(-expectedWorldCenterY2D, 6);
    expect(match.startPose.target.z).toBeCloseTo(0, 6);

    // Verifica que a altura visível do frustum 3D em Z=0 bate 1:1 com a altura visível do canvas 2D (viewportH / k)
    const dist2D = match.startPose.position.z;
    const halfFovRad = ((fovDeg * Math.PI) / 180) * 0.5;
    const visibleHeight3DAtZ0 = 2 * dist2D * Math.tan(halfFovRad);
    const visibleHeight2D = viewportH / view2D.k;
    expect(visibleHeight3DAtZ0).toBeCloseTo(visibleHeight2D, 5);

    // Verifica interpolação contínua de t=0 a t=1
    const p0 = evaluateMorphCameraPose(match, 0);
    const pMid = evaluateMorphCameraPose(match, 0.5);
    const p1 = evaluateMorphCameraPose(match, 1);

    expect(p0.phiRad).toBeCloseTo(0, 5);
    expect(p1.phiRad).toBeGreaterThan(0.5);
    expect(pMid.phiRad).toBeGreaterThan(0);
    expect(pMid.phiRad).toBeLessThan(p1.phiRad);
    expect(cubicBezier022(0)).toBe(0);
    expect(cubicBezier022(1)).toBe(1);
    expect(cubicBezier022(0.5)).toBeGreaterThan(0.5); // ease-out forte
  });

  it("Teste F: Cliques rápidos em 2D SKETCH | CAD 3D revertem suavemente a transição em andamento sem corromper estado", () => {
    const ctrl = new MorphTransitionController();
    expect(ctrl.getSnapshot().state).toBe("2D_IDLE");

    // Clique para ir ao 3D
    const req1 = ctrl.requestTo3D();
    expect(req1.state).toBe("PREPARING_3D");
    expect(ctrl.beginTransitionTo3D()).toBe("TRANSITIONING_TO_3D");

    // Avança até 45% da transição para 3D
    ctrl.updateProgress(0.45);
    expect(ctrl.getSnapshot().progress3D).toBeCloseTo(0.45, 4);

    // Usuário clica rapidamente em 2D SKETCH no meio da transição!
    const revTo2D = ctrl.requestTo2D();
    expect(revTo2D.state).toBe("TRANSITIONING_TO_2D");
    expect(revTo2D.startProgress3D).toBeCloseTo(0.45, 4);
    expect(revTo2D.durationMs).toBeLessThan(500);
    expect(revTo2D.durationMs).toBeGreaterThanOrEqual(180);

    // Avança reversão até 20% e usuário clica novamente em CAD 3D!
    ctrl.updateProgress(0.2);
    const revTo3D = ctrl.requestTo3D();
    expect(revTo3D.state).toBe("TRANSITIONING_TO_3D");
    expect(revTo3D.startProgress3D).toBeCloseTo(0.2, 4);

    // Conclui transição para 3D
    expect(ctrl.completeTransitionTo3D()).toBe("3D_IDLE");
    expect(ctrl.getSnapshot().progress3D).toBe(1);

    // Volta normal para 2D e conclui
    const back2D = ctrl.requestTo2D();
    expect(back2D.state).toBe("TRANSITIONING_TO_2D");
    expect(ctrl.completeTransitionTo2D()).toBe("2D_IDLE");
    expect(ctrl.getSnapshot().progress3D).toBe(0);
  });

  it("Testes G & H: Edição paramétrica (espessura/dimensões) e serialização da árvore preservam estado 2D+3D", async () => {
    const tree = new CadFeatureTree();
    const rect1: Entity = {
      ...rectPolyline({ x: 10, y: 20 }, { x: 110, y: 70 }, "corte"),
      id: "part_plate",
    };

    // Inicial: 100 x 50 x 3 mm
    sync2DSketchToFeatureTree(tree, analyze2DSketchFor3D([rect1], 3.0));
    const res1 = await tree.rebuild();
    expect(res1.massProperties!.volume).toBeCloseTo(100 * 50 * 3.0, -1);

    // Altera espessura para 8.0 mm e largura para 150 mm
    const rect2: Entity = {
      ...rectPolyline({ x: 10, y: 20 }, { x: 160, y: 70 }, "corte"),
      id: "part_plate",
    };
    sync2DSketchToFeatureTree(tree, analyze2DSketchFor3D([rect2], 8.0));
    const res2 = await tree.rebuild();
    expect(res2.massProperties!.volume).toBeCloseTo(150 * 50 * 8.0, -1);

    // Serializa e restaura em nova instância da árvore
    const json = tree.serializeTree();
    const restoredTree = new CadFeatureTree();
    expect(restoredTree.deserializeTree(json)).toBe(true);
    const resRestored = await restoredTree.rebuild();
    expect(resRestored.massProperties!.volume).toBeCloseTo(150 * 50 * 8.0, -1);
  });
});
