import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rectPolyline, uid, type Entity } from "../core";
import {
  applyDirectFilletOrChamfer3DToEntities,
  applyDirectHole3DToEntities,
  applyDirectMirror3DToEntities,
  applyDirectMiterCut3DToEntities,
  applyDirectOffsetFace3DToEntities,
  applyDirectScale3DToEntities,
  applyDirectShell3DToEntities,
  applyDirectTransform3DToEntities,
  buildDirectTopology3DScene,
  resolveFaceShellCapDirection3D,
  resolveShellOpenCapsFromSelection3D,
} from "../cadDirectModeling3D";
import {
  computeSmartGrilleArray3D,
  computeSmartMiterFrame3D,
  detectInternalSpan3D,
  extractTubeCrossSectionFromBody3D,
  generateSmartGrilleArrayEntities3D,
  generateSmartMiterFrameEntities3D,
} from "../chamfer3DSmartArray";

describe("CHAMFER 3D — Quadro 45°, Array Grade/Vão 90° e Shell Orientado pela Face", () => {
  it("1. Quadro 45° herda propriedades da peça base e aceita todas as ferramentas 3D nas 4 barras", () => {
    const baseTube: Entity = {
      ...rectPolyline({ x: 0, y: 0 }, { x: 50, y: 50 }, "corte"),
      id: uid("base_tube"),
      params: {
        extrudeHeightMm: 30,
        extrudeHeight: 30,
        elevationZ: 15,
        shellThicknessMm: 3,
        shellWallThickness: 3,
        shellOpenCaps: ["top", "bottom"],
        edgeFilletRadiusMm: 4,
        bodyColorHex: "#0EA5E9",
        bodyMaterial: "aluminum_brushed",
      },
    };

    const scene0 = buildDirectTopology3DScene([baseTube], 3);
    assert.equal(scene0.bodies.length, 1);
    const srcBody = scene0.bodies[0]!;

    const extracted = extractTubeCrossSectionFromBody3D(srcBody, 1000);
    assert.equal(extracted.profileWidthMm, 50);
    assert.equal(extracted.profileDepthMm, 30);
    assert.equal(extracted.wallThicknessMm, 3);
    assert.equal(extracted.cornerFilletRadiusMm, 4);

    const frameCalc = computeSmartMiterFrame3D({
      measureRef: "outer",
      inputWidthMm: 1000,
      inputHeightMm: 800,
      profileWidthMm: extracted.profileWidthMm,
      profileDepthMm: extracted.profileDepthMm,
      wallThicknessMm: extracted.wallThicknessMm,
      isHollowTube: extracted.isHollowTube,
      cornerFilletRadiusMm: extracted.cornerFilletRadiusMm,
      plane: "xy",
      jointMode: "miter_45",
      center3D: { x: 500, y: 400, z: srcBody.elevationZ },
    });

    const { updatedEntities, createdIds } = generateSmartMiterFrameEntities3D(
      [baseTube],
      baseTube.id,
      srcBody,
      frameCalc,
    );

    assert.equal(createdIds.length, 4);
    assert.equal(updatedEntities.length, 4);

    // Verifica herança de propriedades na barra Top
    for (const barEnt of updatedEntities) {
      assert.equal(barEnt.layer, "corte");
      assert.equal(barEnt.params?.extrudeHeightMm, 30);
      assert.equal(barEnt.params?.elevationZ, 15);
      assert.equal(barEnt.params?.shellThicknessMm, 3);
      assert.equal(barEnt.params?.edgeFilletRadiusMm, 4);
      assert.equal(barEnt.params?.bodyColorHex, "#0EA5E9");
      assert.equal(barEnt.params?.bodyMaterial, "aluminum_brushed");
    }

    const sceneFrame = buildDirectTopology3DScene(updatedEntities, 3);
    assert.equal(sceneFrame.bodies.length, 4);
    const seenFaceIds = new Set<string>();
    const seenEdgeIds = new Set<string>();
    const seenVertexIds = new Set<string>();
    for (const b of sceneFrame.bodies) {
      assert.ok(b.faces.length >= 6, "Cada barra do Quadro 45° deve ter faces 3D selecionáveis");
      assert.ok(b.edges.length >= 8, "Cada barra do Quadro 45° deve ter arestas 3D selecionáveis");
      assert.ok((b.vertices?.length ?? 0) >= 8, "Cada barra do Quadro 45° deve ter vértices 3D");
      for (const f of b.faces) {
        assert.equal(seenFaceIds.has(f.faceId), false, `faceId duplicado detectado: ${f.faceId}`);
        seenFaceIds.add(f.faceId);
      }
      for (const ed of b.edges) {
        assert.equal(seenEdgeIds.has(ed.edgeId), false, `edgeId duplicado detectado: ${ed.edgeId}`);
        seenEdgeIds.add(ed.edgeId);
      }
      for (const vx of b.vertices ?? []) {
        assert.equal(seenVertexIds.has(vx.vertexId), false, `vertexId duplicado detectado: ${vx.vertexId}`);
        seenVertexIds.add(vx.vertexId);
      }
    }

    const topBarId = createdIds[0]!;

    // Testa Shell 3D individual numa barra do Quadro 45°
    let ents = applyDirectShell3DToEntities(updatedEntities, [topBarId], 6, ["top"]);
    let sc = buildDirectTopology3DScene(ents, 3);
    const topBodyAfterShell = sc.bodies.find((b) => b.entityId === topBarId)!;
    assert.equal(topBodyAfterShell.shellWallThicknessMm, 6);
    assert.deepEqual(topBodyAfterShell.shellOpenCaps, ["top"]);

    // Testa Fillet / Chamfer 3D numa barra do Quadro 45°
    ents = applyDirectFilletOrChamfer3DToEntities(ents, [topBarId], "chamfer", 5);
    sc = buildDirectTopology3DScene(ents, 3);
    assert.equal(sc.bodies.find((b) => b.entityId === topBarId)!.edgeChamferDistMm, 5);

    // Testa Offset Face (+50mm no comprimento) numa barra do Quadro 45°
    const prevLen = (
      ents.find((e) => e.id === topBarId)!.params?.miterBarSpec3D as { longLengthMm: number }
    ).longLengthMm;
    ents = applyDirectOffsetFace3DToEntities(ents, [topBarId], "pos_x", 50);
    const nextLen = (
      ents.find((e) => e.id === topBarId)!.params?.miterBarSpec3D as { longLengthMm: number }
    ).longLengthMm;
    assert.equal(nextLen, prevLen + 50);

    // Testa Corte 45° / 90° (Esquadria) numa barra do Quadro 45°
    ents = applyDirectMiterCut3DToEntities(ents, [topBarId], "top", 0, "x");
    const mSpecAfterCut = ents.find((e) => e.id === topBarId)!.params?.miterBarSpec3D as {
      startMiterRatio: number;
    };
    assert.equal(mSpecAfterCut.startMiterRatio, 0);

    // Testa Furo 3D numa barra do Quadro 45°
    const holeRes = applyDirectHole3DToEntities(ents, [topBarId], 12);
    sc = buildDirectTopology3DScene(holeRes.updatedEntities, 3);
    assert.equal(sc.bodies.length, 4, "O furo deve perfurar a barra sem criar um 5º corpo solto");

    // Testa Mover / Transformar 3D numa barra do Quadro 45°
    const moveRes = applyDirectTransform3DToEntities(
      holeRes.updatedEntities,
      [topBarId],
      { dx: 0, dy: 0, dz: 40 },
      false,
    );
    sc = buildDirectTopology3DScene(moveRes.updatedEntities, 3);
    assert.equal(sc.bodies.find((b) => b.entityId === topBarId)!.elevationZ, 55);

    // Testa Espelhar (Mirror 3D) com cópia (espelha a barra e seu furo interno -> 5 corpos 3D na cena)
    const mirrorRes = applyDirectMirror3DToEntities(
      moveRes.updatedEntities,
      [topBarId],
      "x",
      true,
      { x: 500, y: 400, z: 15 },
    );
    assert.ok(mirrorRes.activeIds.length >= 1);
    assert.equal(buildDirectTopology3DScene(mirrorRes.updatedEntities, 3).bodies.length, 5);

    // Testa Escala 3D
    const scaleEnts = applyDirectScale3DToEntities(
      moveRes.updatedEntities,
      [topBarId],
      1.5,
      { x: 500, y: 400, z: 55 },
    );
    sc = buildDirectTopology3DScene(scaleEnts, 3);
    assert.equal(sc.bodies.length, 4);
  });

  it("2. Array 3D -> Grade / Vão gera barras com topo reto 90° por padrão e visibilidade imediata em 3D", () => {
    const baseTube: Entity = {
      ...rectPolyline({ x: 0, y: 0 }, { x: 40, y: 40 }, "corte"),
      id: uid("base_tube"),
      params: {
        extrudeHeightMm: 40,
        extrudeHeight: 40,
        shellThicknessMm: 2,
        shellWallThickness: 2,
      },
    };
    const scene0 = buildDirectTopology3DScene([baseTube], 2);
    const frameCalc = computeSmartMiterFrame3D({
      measureRef: "outer",
      inputWidthMm: 1000,
      inputHeightMm: 800,
      profileWidthMm: 40,
      profileDepthMm: 40,
      wallThicknessMm: 2,
      isHollowTube: true,
      plane: "xy",
      jointMode: "miter_45",
      center3D: { x: 500, y: 400, z: 0 },
    });
    const frameRes = generateSmartMiterFrameEntities3D(
      [baseTube],
      baseTube.id,
      scene0.bodies[0]!,
      frameCalc,
    );
    const frameScene = buildDirectTopology3DScene(frameRes.updatedEntities, 2);
    assert.equal(frameScene.bodies.length, 4);

    // Seleciona uma barra do quadro (que tem corte 45°) e gera Grade / Vão no eixo X
    const refBarBody = frameScene.bodies[0]!;
    const spanDet = detectInternalSpan3D(refBarBody, frameScene.bodies, "x");
    assert.equal(spanDet.isAutoDetected, true);
    assert.equal(spanDet.spanMm, 920); // 1000 - 2*40
    assert.equal(spanDet.perpSpanMm, 720); // 800 - 2*40

    const arrayCalc = computeSmartGrilleArray3D({
      mode: "by_count",
      spanMm: spanDet.spanMm,
      tubeWidthMm: spanDet.tubeWidthMm,
      count: 4,
      maxClearGapMm: 110,
      startInnerCoordMm: spanDet.startInnerCoordMm,
      axis: "x",
      perpInnerStartMm: spanDet.perpInnerStartMm,
      perpInnerEndMm: spanDet.perpInnerEndMm,
      perpSpanMm: spanDet.perpSpanMm,
    });

    const grilleRes = generateSmartGrilleArrayEntities3D(
      frameRes.updatedEntities,
      refBarBody.entityId,
      refBarBody,
      arrayCalc,
      frameScene.bodies,
    );

    assert.equal(grilleRes.createdIds.length, 4);

    // Verifica que todas as barras geradas têm pontas retas de 90° (miter = 0)
    for (const gid of grilleRes.createdIds) {
      const gent = grilleRes.updatedEntities.find((e) => e.id === gid)!;
      assert.equal(gent.params?.miterCutTopDeg, 0);
      assert.equal(gent.params?.miterCutBottomDeg, 0);
      assert.equal(gent.params?.isIndependentBody3D, true);
      assert.equal(gent.params?.isSmartGrilleBar3D, true);
      const mSpec = gent.params?.miterBarSpec3D as
        | { startMiterRatio: number; endMiterRatio: number }
        | undefined;
      if (mSpec) {
        assert.equal(mSpec.startMiterRatio, 0);
        assert.equal(mSpec.endMiterRatio, 0);
      }
    }

    // Verifica que a cena 3D contém imediatamente os 4 tubos do quadro + 4 barras da grade = 8 corpos 3D!
    const finalScene = buildDirectTopology3DScene(grilleRes.updatedEntities, 2);
    assert.equal(
      finalScene.bodies.length,
      8,
      "As 4 barras do Grade/Vão devem aparecer imediatamente como sólidos 3D independentes sem serem engolidas como furos 2D",
    );
  });

  it("3. Shell / Casca 3D respeita a face selecionada pelo usuário em Caixa (1 Face) e Tubo (2 Faces)", () => {
    const boxEnt: Entity = {
      ...rectPolyline({ x: 0, y: 0 }, { x: 200, y: 120 }, "corte"),
      id: uid("box_3d"),
      params: {
        extrudeHeightMm: 100,
        extrudeHeight: 100,
      },
    };
    const scene0 = buildDirectTopology3DScene([boxEnt], 3);
    const body0 = scene0.bodies[0]!;

    // Encontra a face lateral Direita (+X) e a face Base (-Z)
    const rightFace = body0.faces.find(
      (f) => resolveFaceShellCapDirection3D(f) === "right",
    );
    const bottomFace = body0.faces.find(
      (f) => resolveFaceShellCapDirection3D(f) === "bottom",
    );
    const frontFace = body0.faces.find(
      (f) => resolveFaceShellCapDirection3D(f) === "front",
    );
    assert.ok(rightFace, "Deve existir face +X (right)");
    assert.ok(bottomFace, "Deve existir face -Z (bottom)");
    assert.ok(frontFace, "Deve existir face +Y (front)");

    // Caso A: Caixa (1 Face) com a face Direita (+X) selecionada -> abre apenas ["right"]
    const capsRightBox = resolveShellOpenCapsFromSelection3D([rightFace!], "top_only");
    assert.deepEqual(capsRightBox, ["right"]);

    const shelledRightBoxEnts = applyDirectShell3DToEntities(
      [boxEnt],
      [boxEnt.id],
      4.75,
      capsRightBox,
    );
    const sceneRightBox = buildDirectTopology3DScene(shelledRightBoxEnts, 3);
    assert.deepEqual(sceneRightBox.bodies[0]!.shellOpenCaps, ["right"]);
    assert.ok(
      sceneRightBox.bodies[0]!.faces.some((f) => f.role === "inner_side"),
      "Caixa aberta na lateral (+X) deve gerar faces internas de cavidade 3D",
    );

    // Caso B: Tubo (2 Faces) com a face Direita (+X) selecionada -> abre ["left", "right"]
    const capsRightTube = resolveShellOpenCapsFromSelection3D([rightFace!], "both_ends");
    assert.deepEqual(capsRightTube, ["left", "right"]);

    // Caso C: Tubo (2 Faces) com a face Frente (+Y) selecionada -> abre ["front", "back"]
    const capsFrontTube = resolveShellOpenCapsFromSelection3D([frontFace!], "both_ends");
    assert.deepEqual(capsFrontTube, ["front", "back"]);

    // Caso D: Caixa (1 Face) com a face Base (-Z) selecionada -> abre apenas ["bottom"]
    const capsBottomBox = resolveShellOpenCapsFromSelection3D([bottomFace!], "top_only");
    assert.deepEqual(capsBottomBox, ["bottom"]);
  });
});
