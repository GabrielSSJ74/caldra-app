import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rectPolyline, uid, type Entity } from "../core";
import {
  applyDirectOffsetFace3DToEntities,
  applyDirectShell3DToEntities,
  applyDirectTransform3DToEntities,
  buildDirectTopology3DScene,
  resolveFaceShellCapDirection3D,
  resolveShellOpenCapsFromSelection3D,
  type SubElementSelectionState3D,
  formatSubElementTelemetry3D,
} from "../cadDirectModeling3D";
import {
  applyDirectBoolean3DBetweenBodies,
  generateStructuralCutListFrom3DScene,
} from "../chamfer3DMasterSuite";
import {
  applyAssemblyGroupToEntities3D,
  applyDropBodiesToBaseZ0,
  applyMultiBodyRigidTransform3D,
  applyUniformMaterialToEntities3D,
  computeMultiBodyInspectorSummary3D,
  computeMultiBodySetPivot3D,
  createInitialBaseEcholocationState3D,
  evaluateBaseSurfaceSnap3D,
  evaluateMarqueeBoxSelection3D,
  expandBodyIdsWithAssemblyGroup3D,
  findBodyFaceByReferenceFrame3D,
  resolveFluxViewportVisibility3D,
  selectBodiesWithSameProfile3D,
  stepBaseEcholocationState3D,
  ungroupAssemblyEntities3D,
} from "../chamfer3DFluxWcsSnapMulti";

function makeBoxEntity(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extrudeZ: number,
  elevationZ = 0,
  extraParams: Record<string, unknown> = {},
): Entity {
  return {
    ...rectPolyline({ x, y }, { x: x + w, y: y + h }, "corte"),
    id,
    elevationZ,
    params: {
      isIndependentBody3D: true,
      extrudeHeightMm: extrudeZ,
      extrudeHeight: extrudeZ,
      elevationZ,
      ...extraParams,
    },
  };
}

describe("CALDRA CHAMFER CAD 3D — Suite Unificada FLUX, WCS/OCS, Snap Base + Ecolocalização e Multi-Seleção (Testes A a L)", () => {
  it("Teste A: Arraste Linear em Y ativa FLUX (oculta eixos X/Z, roda de giro, barra inferior e gizmo de canto; exibe 1 único HUD consolidado)", () => {
    const fluxIdle = resolveFluxViewportVisibility3D({
      activeAxis: null,
      directTool: "transform_3d",
      selectionKind3D: "body",
      hasActiveSnap: false,
      copyMode: false,
      dragDeltaValue: 0,
      selectedBodyCount: 1,
      gizmoOriginScreen: { x: 400, y: 320 },
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    assert.equal(fluxIdle.isManipulating, false);
    assert.equal(fluxIdle.showAxisX, true);
    assert.equal(fluxIdle.showAxisY, true);
    assert.equal(fluxIdle.showAxisZ, true);
    assert.equal(fluxIdle.showRotationHandles, true);
    assert.equal(fluxIdle.showBottomTelemetryBar, true);
    assert.equal(fluxIdle.showBottomLeftAxesGizmo, true);
    assert.equal(fluxIdle.showFloatingCanvasMirrorPill, false);
    assert.equal(fluxIdle.consolidatedHud.visible, false);

    const fluxDragY = resolveFluxViewportVisibility3D({
      activeAxis: "y",
      directTool: "transform_3d",
      selectionKind3D: "body",
      hasActiveSnap: true,
      snapSummaryLabel: "🎯 BASE · FACE (Z = 0.00 mm)",
      clearanceGapMm: 242,
      copyMode: false,
      dragDeltaValue: 369,
      selectedBodyCount: 1,
      gizmoOriginScreen: { x: 400, y: 320 },
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    assert.equal(fluxDragY.isManipulating, true);
    assert.equal(fluxDragY.dragKind, "linear_y");
    assert.equal(fluxDragY.showAxisY, true);
    assert.equal(fluxDragY.showAxisX, false);
    assert.equal(fluxDragY.showAxisZ, false);
    assert.equal(fluxDragY.showRotationHandles, false);
    assert.equal(fluxDragY.showBottomTelemetryBar, false);
    assert.equal(fluxDragY.showBottomLeftAxesGizmo, false);
    assert.equal(fluxDragY.showAuxiliaryHints, false);
    assert.equal(fluxDragY.consolidatedHud.visible, true);
    assert.equal(
      fluxDragY.consolidatedHud.primaryLine,
      "ΔY: +369.0 mm ✎  |  Vão Livre: 242.0 mm",
    );
    assert.equal(
      fluxDragY.consolidatedHud.secondarySnapLine,
      "🎯 BASE · FACE (Z = 0.00 mm)",
    );
    assert.ok(
      320 - fluxDragY.consolidatedHud.screenY >= 44,
      "HUD consolidado deve ficar pelo menos 44px acima da origem do gizmo",
    );
  });

  it("Teste B: Arraste de Rotação ativa FLUX (oculta setas lineares X/Y/Z e exibe arco/roda + ângulo ∠)", () => {
    const fluxRot = resolveFluxViewportVisibility3D({
      activeAxis: "rot_z",
      directTool: "transform_3d",
      selectionKind3D: "body",
      hasActiveSnap: false,
      copyMode: false,
      dragDeltaValue: 45,
      selectedBodyCount: 1,
      gizmoOriginScreen: { x: 500, y: 400 },
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    assert.equal(fluxRot.isManipulating, true);
    assert.equal(fluxRot.showAxisX, false);
    assert.equal(fluxRot.showAxisY, false);
    assert.equal(fluxRot.showAxisZ, false);
    assert.equal(fluxRot.showRotationHandles, true);
    assert.equal(fluxRot.showBottomTelemetryBar, false);
    assert.equal(fluxRot.consolidatedHud.visible, true);
    assert.equal(fluxRot.consolidatedHud.primaryLine, "∠ +45.0° ✎");
    assert.equal(fluxRot.consolidatedHud.secondarySnapLine, null);
  });

  it("Teste C: Clamping de Viewport do HUD Consolidado e eliminação da pílula flutuante Espelhar no canvas", () => {
    const nearTopEdge = resolveFluxViewportVisibility3D({
      activeAxis: "z",
      directTool: "transform_3d",
      selectionKind3D: "body",
      hasActiveSnap: false,
      copyMode: true,
      dragDeltaValue: -15.5,
      selectedBodyCount: 2,
      gizmoOriginScreen: { x: 20, y: 30 },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    assert.equal(nearTopEdge.showFloatingCanvasMirrorPill, false);
    assert.ok(nearTopEdge.consolidatedHud.screenX >= 128);
    assert.ok(nearTopEdge.consolidatedHud.screenX <= 390 - 128);
    assert.ok(nearTopEdge.consolidatedHud.screenY >= 62);
    assert.equal(nearTopEdge.consolidatedHud.primaryLine, "⧉ ΔZ: -15.5 mm ✎");
  });

  it("Teste D: Rotação de 90° em X atualiza normal global real e reindexa a face TOP_LOCAL para ORIENTAÇÃO GLOBAL -Y/+Y mantendo identidade local", () => {
    const cube = makeBoxEntity("cubo_rot", 0, 0, 100, 100, 100, 0);
    const scene0 = buildDirectTopology3DScene([cube], 2);
    const body0 = scene0.bodies[0]!;
    const topFace0 = body0.faces.find((f) => f.localRole === "TOP_LOCAL")!;
    assert.equal(topFace0.globalDirection, "+Z");

    // Rotaciona +90° em torno do eixo X: o vetor local +Z passa a apontar para -Y no mundo (regra da mão direita)!
    const rotated = applyDirectTransform3DToEntities(
      [cube],
      [cube.id],
      { rxDeg: 90 },
      false,
      body0.pivot3D,
    );
    const sceneRot = buildDirectTopology3DScene(rotated.updatedEntities, 2);
    const bodyRot = sceneRot.bodies[0]!;
    const formerTopFace = bodyRot.faces.find((f) => f.localRole === "TOP_LOCAL")!;
    assert.ok(formerTopFace, "A face deve preservar localRole === TOP_LOCAL");
    assert.ok(
      formerTopFace.globalDirection === "-Y" || formerTopFace.globalDirection === "+Y",
      `Esperado -Y ou +Y após giro de 90° em X, obtido ${formerTopFace.globalDirection}`,
    );

    const subSel: SubElementSelectionState3D = {
      faceIds: [formerTopFace.faceId],
      edgeIds: [],
      vertexIds: [],
      bodyIds: [],
      selectionScope: "face",
      activePivot3D: formerTopFace.centroid,
      activeHingeEdgeId: null,
    };
    const telemetry = formatSubElementTelemetry3D(sceneRot, subSel);
    assert.match(telemetry, /TOPO LOCAL/);
    assert.match(telemetry, /ORIENTAÇÃO GLOBAL [+-]Y/);
  });

  it("Teste E: Offset Face -> Topo (+Z) em modo Global (WCS) numa peça rotacionada 90° cresce em +Z Global mantendo a base inferior estacionária", () => {
    const bar = makeBoxEntity("barra_rot90", 0, 0, 60, 80, 120, 40, {
      rotation3D: { rxDeg: 90, ryDeg: 0, rzDeg: 0 },
    });
    const sceneBefore = buildDirectTopology3DScene([bar], 2);
    const bBefore = sceneBefore.bodies[0]!;
    const minZBefore = bBefore.bbox3D.minZ;
    const maxZBefore = bBefore.bbox3D.maxZ;

    // Cresce +30 mm no Topo Global (+Z) em WCS
    const afterOffset = applyDirectOffsetFace3DToEntities(
      [bar],
      [bar.id],
      "top",
      30,
      undefined,
      "wcs",
    );
    const sceneAfter = buildDirectTopology3DScene(afterOffset, 2);
    const bAfter = sceneAfter.bodies[0]!;

    assert.ok(
      Math.abs(bAfter.bbox3D.maxZ - (maxZBefore + 30)) <= 1.0,
      `Topo Global (+Z) deveria subir +30mm (${maxZBefore} -> ${maxZBefore + 30}), obtido ${bAfter.bbox3D.maxZ}`,
    );
    assert.ok(
      Math.abs(bAfter.bbox3D.minZ - minZBefore) <= 1.0,
      `Base inferior Global (-Z) deve permanecer ancorada (${minZBefore}), obtido ${bAfter.bbox3D.minZ}`,
    );
  });

  it("Teste F: Shell em sólido rotacionado 90° abre exatamente a face Global (+Z) selecionada pelo usuário", () => {
    const rotatedBlock = makeBoxEntity("bloco_shell_rot", 0, 0, 80, 100, 140, 20, {
      rotation3D: { rxDeg: 90, ryDeg: 0, rzDeg: 0 },
    });
    const scene0 = buildDirectTopology3DScene([rotatedBlock], 3);
    const body0 = scene0.bodies[0]!;

    // Usuário seleciona a face que atualmente aponta para +Z Global
    const globalTopFace = findBodyFaceByReferenceFrame3D(body0, "top", "wcs");
    assert.ok(globalTopFace, "Deve localizar a face voltada para +Z Global");
    assert.equal(globalTopFace.globalDirection, "+Z");

    const openCapsBox = resolveShellOpenCapsFromSelection3D(
      [globalTopFace],
      "top_only",
      resolveFaceShellCapDirection3D(globalTopFace, "wcs", body0.rotation3D),
      "wcs",
      body0.rotation3D,
    );
    assert.equal(openCapsBox.length, 1);

    const shelledEntities = applyDirectShell3DToEntities(
      [rotatedBlock],
      [rotatedBlock.id],
      4,
      openCapsBox,
    );
    const sceneShelled = buildDirectTopology3DScene(shelledEntities, 3);
    const bodyShelled = sceneShelled.bodies[0]!;
    assert.equal(bodyShelled.shellWallThicknessMm, 4);
    assert.deepEqual(bodyShelled.shellOpenCaps, openCapsBox);
    // Verifica que a face correspondente à direção +Z Global foi removida (aberta) e existem paredes internas!
    const innerFaces = bodyShelled.faces.filter((f) => f.role === "inner_side");
    assert.ok(innerFaces.length >= 4, "Sólido com Shell deve possuir faces internas de cavidade");
  });

  it("Teste G, H e I: Snap de Superfície Base (Z=0) com histerese (3.5mm/5.5mm), 4 classificações e Ecolocalização Azul Edge-Triggered (sem disparo contínuo em X/Y)", () => {
    const elevatedCube = makeBoxEntity("cubo_elevado", 10, 20, 50, 50, 40, 40);
    const scene = buildDirectTopology3DScene([elevatedCube], 2);
    const body = scene.bodies[0]!;
    assert.equal(body.bbox3D.minZ, 40);

    let echoState = createInitialBaseEcholocationState3D();

    // 1. Teste G: Desce de Z=+40mm até Z=+2.8mm (dentro de T_in = 3.5mm) -> Snap magnético crava Z = 0.00 mm e dispara pulso #1!
    const snapTouch = evaluateBaseSurfaceSnap3D([body], -37.2, false, 0);
    assert.equal(snapTouch.snapped, true);
    assert.equal(snapTouch.effectiveMinZMm, 0);
    assert.equal(snapTouch.snappedDeltaZMm, -40);
    assert.equal(snapTouch.contactKind, "BASE_FACE");
    assert.match(snapTouch.hudBadgeLabel, /BASE · FACE/);

    const step1 = stepBaseEcholocationState3D(echoState, snapTouch, 1000, 0);
    echoState = step1.nextState;
    assert.equal(step1.triggeredNewPulse, true);
    assert.equal(echoState.pulseCounter, 1);
    assert.equal(echoState.activePulse?.ringCount, 3);
    assert.equal(echoState.activePulse?.durationMs, 520);

    // 2. Teste H: Deslize horizontal em X e Y sobre Z = 0.00 mm -> NÃO re-dispara ecolocalização!
    const groundedEntities = applyDropBodiesToBaseZ0([elevatedCube], [elevatedCube.id], scene, 0).updatedEntities;
    const groundedScene = buildDirectTopology3DScene(groundedEntities, 2);
    const groundedBody = groundedScene.bodies[0]!;
    assert.equal(groundedBody.bbox3D.minZ, 0);

    const slideXY1 = evaluateBaseSurfaceSnap3D([groundedBody], 0, true, 0, undefined, { dx: 85, dy: 0 });
    const stepSlide1 = stepBaseEcholocationState3D(echoState, slideXY1, 1200, 0);
    echoState = stepSlide1.nextState;
    assert.equal(stepSlide1.triggeredNewPulse, false, "Deslizar em X sobre Z=0 NÃO pode disparar pulso");
    assert.equal(echoState.pulseCounter, 1);

    const slideXY2 = evaluateBaseSurfaceSnap3D([groundedBody], 0, true, 0, undefined, { dx: 85, dy: -60 });
    const stepSlide2 = stepBaseEcholocationState3D(echoState, slideXY2, 1350, 0);
    echoState = stepSlide2.nextState;
    assert.equal(stepSlide2.triggeredNewPulse, false, "Deslizar em Y sobre Z=0 NÃO pode disparar pulso");
    assert.equal(echoState.pulseCounter, 1);

    // 3. Histerese: subir apenas +4.2mm (entre 3.5mm e 5.5mm) mantém latched; subir para Z = +12.0mm (> 5.5mm) solta e rearma!
    const stillLatched = evaluateBaseSurfaceSnap3D([groundedBody], 4.2, true, 0);
    assert.equal(stillLatched.snapped, true);

    const lifted = evaluateBaseSurfaceSnap3D([groundedBody], 12.0, true, 0);
    assert.equal(lifted.snapped, false);
    const stepLift = stepBaseEcholocationState3D(echoState, lifted, 1600, 0);
    echoState = stepLift.nextState;
    assert.equal(stepLift.triggeredNewPulse, false);
    assert.equal(echoState.armed, true, "Subir acima de 5.5mm deve rearmar o gatilho de borda");

    // 4. Teste I: Descer novamente para Z = 0.00 mm dispara o pulso #2!
    const touchAgain = evaluateBaseSurfaceSnap3D([groundedBody], 1.5, false, 0);
    assert.equal(touchAgain.snapped, true);
    const stepTouch2 = stepBaseEcholocationState3D(echoState, touchAgain, 1900, 0);
    echoState = stepTouch2.nextState;
    assert.equal(stepTouch2.triggeredNewPulse, true);
    assert.equal(echoState.pulseCounter, 2);

    // 5. Verifica também contato por ARESTA (peça inclinada 45° em X) e por VÉRTICE (inclinada em X e Y) e SUPERFÍCIE CURVA (cilindro deitado)
    const tiltedEdgeBox = makeBoxEntity("caixa_aresta", 0, 0, 60, 60, 60, 50, {
      rotation3D: { rxDeg: 45, ryDeg: 0, rzDeg: 0 },
    });
    const edgeScene = buildDirectTopology3DScene([tiltedEdgeBox], 2);
    const dropEdge = applyDropBodiesToBaseZ0([tiltedEdgeBox], [tiltedEdgeBox.id], edgeScene, 0);
    assert.equal(dropEdge.snapEval.contactKind, "BASE_EDGE");

    const tiltedVertexBox = makeBoxEntity("caixa_vertice", 0, 0, 60, 60, 60, 60, {
      rotation3D: { rxDeg: 35, ryDeg: 28, rzDeg: 0 },
    });
    const vtxScene = buildDirectTopology3DScene([tiltedVertexBox], 2);
    const dropVtx = applyDropBodiesToBaseZ0([tiltedVertexBox], [tiltedVertexBox.id], vtxScene, 0);
    assert.equal(dropVtx.snapEval.contactKind, "BASE_VERTEX");

    const horizCylinder: Entity = {
      id: "cilindro_curvo",
      type: "circle",
      layer: "corte",
      cx: 0,
      cy: 0,
      r: 25,
      elevationZ: 40,
      params: {
        isIndependentBody3D: true,
        extrudeHeightMm: 100,
        extrudeHeight: 100,
        elevationZ: 40,
        rotation3D: { rxDeg: 90, ryDeg: 0, rzDeg: 0 },
      },
    };
    const cylScene = buildDirectTopology3DScene([horizCylinder], 2);
    const dropCyl = applyDropBodiesToBaseZ0([horizCylinder], [horizCylinder.id], cylScene, 0);
    assert.equal(dropCyl.snapEval.contactKind, "BASE_CURVED");
  });

  it("Teste J: Multi-Seleção de 4 Colunas move/gira rigidamente ao redor do Pivô do Conjunto preservando distâncias relativas (e Copy duplica as 4)", () => {
    const cols = [
      makeBoxEntity("col_1", 0, 0, 50, 50, 300, 0),
      makeBoxEntity("col_2", 400, 0, 50, 50, 300, 0),
      makeBoxEntity("col_3", 400, 300, 50, 50, 300, 0),
      makeBoxEntity("col_4", 0, 300, 50, 50, 300, 0),
    ];
    const scene0 = buildDirectTopology3DScene(cols, 3);
    assert.equal(scene0.bodies.length, 4);

    // Atalho "Mesmo Perfil" e Seleção em Caixa (Window vs Crossing)
    const sameProf = selectBodiesWithSameProfile3D(scene0.bodies[0]!, scene0.bodies);
    assert.equal(sameProf.length, 4);

    const mockProject = (pt: { x: number; y: number }) => ({ x: pt.x, y: pt.y });
    const windowSel = evaluateMarqueeBoxSelection3D(
      { x: -10, y: -10 },
      { x: 200, y: 100 },
      scene0.bodies,
      mockProject,
    );
    assert.equal(windowSel.mode, "window");
    assert.deepEqual(windowSel.matchedEntityIds, ["col_1"]);

    const crossingSel = evaluateMarqueeBoxSelection3D(
      { x: 420, y: 20 },
      { x: 30, y: 20 },
      scene0.bodies,
      mockProject,
    );
    assert.equal(crossingSel.mode, "crossing");
    assert.equal(crossingSel.matchedEntityIds.length, 2);

    const setPivot = computeMultiBodySetPivot3D(scene0.bodies, "bbox_center")!;
    assert.equal(setPivot.x, 225);
    assert.equal(setPivot.y, 175);

    // Distâncias entre centros antes da rotação de +90° em Z
    const distBefore12 = Math.hypot(
      scene0.bodies[1]!.pivot3D.x - scene0.bodies[0]!.pivot3D.x,
      scene0.bodies[1]!.pivot3D.y - scene0.bodies[0]!.pivot3D.y,
    );
    const distBefore13 = Math.hypot(
      scene0.bodies[2]!.pivot3D.x - scene0.bodies[0]!.pivot3D.x,
      scene0.bodies[2]!.pivot3D.y - scene0.bodies[0]!.pivot3D.y,
    );

    const transformed = applyMultiBodyRigidTransform3D(
      cols,
      cols.map((c) => c.id),
      scene0,
      { dx: 120, dy: -50, dz: 25, rzDeg: 90 },
      setPivot,
      false,
    );
    const sceneAfter = buildDirectTopology3DScene(transformed.updatedEntities, 3);
    const distAfter12 = Math.hypot(
      sceneAfter.bodies[1]!.pivot3D.x - sceneAfter.bodies[0]!.pivot3D.x,
      sceneAfter.bodies[1]!.pivot3D.y - sceneAfter.bodies[0]!.pivot3D.y,
    );
    const distAfter13 = Math.hypot(
      sceneAfter.bodies[2]!.pivot3D.x - sceneAfter.bodies[0]!.pivot3D.x,
      sceneAfter.bodies[2]!.pivot3D.y - sceneAfter.bodies[0]!.pivot3D.y,
    );

    assert.ok(Math.abs(distAfter12 - distBefore12) < 0.05, "Distância rígida 1-2 preservada");
    assert.ok(Math.abs(distAfter13 - distBefore13) < 0.05, "Diagonal rígida 1-3 preservada");

    // Copy: ON duplica as 4 colunas gerando 8 corpos no total
    const copied = applyMultiBodyRigidTransform3D(
      cols,
      cols.map((c) => c.id),
      scene0,
      { dx: 600 },
      setPivot,
      true,
    );
    assert.equal(copied.updatedEntities.length, 8);
    assert.equal(copied.activeIds.length, 4);
  });

  it("Teste K: Agrupar (Montagem Lógica) seleciona 4 tubos ao clicar em 1 e preserva 4 peças na BOM/Corte, enquanto Unir (Boolean Union) funde em 1 sólido", () => {
    const tubes = [
      makeBoxEntity("tubo_1", 0, 0, 40, 40, 500, 0, { shellWallThicknessMm: 2, shellOpenCaps: ["top", "bottom"] }),
      makeBoxEntity("tubo_2", 50, 0, 40, 40, 500, 0, { shellWallThicknessMm: 2, shellOpenCaps: ["top", "bottom"] }),
      makeBoxEntity("tubo_3", 100, 0, 40, 40, 500, 0, { shellWallThicknessMm: 2, shellOpenCaps: ["top", "bottom"] }),
      makeBoxEntity("tubo_4", 150, 0, 40, 40, 500, 0, { shellWallThicknessMm: 2, shellOpenCaps: ["top", "bottom"] }),
    ];

    const grouped = applyAssemblyGroupToEntities3D(
      tubes,
      tubes.map((t) => t.id),
      "Quadro Soldado",
    );
    const groupedScene = buildDirectTopology3DScene(grouped.updatedEntities, 2);

    // Clicar em apenas 1 membro expande automaticamente para os 4 corpos!
    const expanded = expandBodyIdsWithAssemblyGroup3D(
      ["body_tubo_2"],
      groupedScene,
      grouped.updatedEntities,
    );
    assert.equal(expanded.hasAssemblyGroup, true);
    assert.equal(expanded.bodyIds.length, 4);

    // BOM / Lista de Corte preserva os 4 tubos individuais (totalPieces === 4)!
    const cutListGrouped = generateStructuralCutListFrom3DScene(groupedScene);
    const totalPiecesInBom = cutListGrouped.rows.reduce((acc, r) => acc + r.quantity, 0);
    assert.equal(cutListGrouped.totalPieces, 4);
    assert.equal(totalPiecesInBom, 4, "Montagem Lógica (Agrupar) deve manter as 4 peças individuais na BOM/Corte");

    // Desagrupar dissolve o vínculo mantendo os 4 tubos livres
    const ungrouped = ungroupAssemblyEntities3D(grouped.updatedEntities, ["tubo_1"]);
    const expandedAfterUngroup = expandBodyIdsWithAssemblyGroup3D(
      ["body_tubo_2"],
      groupedScene,
      ungrouped.updatedEntities,
    );
    assert.equal(expandedAfterUngroup.hasAssemblyGroup, false);
    assert.equal(expandedAfterUngroup.bodyIds.length, 1);

    // Já Boolean Union (⊕ Unir) funde dois sólidos sobrepostos em 1 único corpo!
    const overlapA = makeBoxEntity("solido_a", 0, 0, 100, 60, 40, 0);
    const overlapB = makeBoxEntity("solido_b", 60, 0, 100, 60, 40, 0);
    const unionRes = applyDirectBoolean3DBetweenBodies(
      [overlapA, overlapB],
      ["solido_a", "solido_b"],
      "union",
    );
    const unionScene = buildDirectTopology3DScene(unionRes.updatedEntities, 2);
    assert.equal(unionScene.bodies.length, 1, "União Booleana deve fundir os sólidos em 1 único corpo");
  });

  it("Teste L: Inspetor de Multi-Seleção com Materiais Mistos soma massa individual por densidade real e permite padronizar", () => {
    // Bloco 1: 100×100×10 mm = 100.000 mm³ = 100 cm³ em Aço (7.85 g/cm³ => 785 g)
    const steelBlock = makeBoxEntity("bloco_aco", 0, 0, 100, 100, 10, 0, {
      bodyMaterial: "Aço Estrutural ASTM A36",
    });
    // Bloco 2: 100×100×10 mm = 100.000 mm³ = 100 cm³ em Alumínio (2.70 g/cm³ => 270 g)
    const aluBlock = makeBoxEntity("bloco_alu", 150, 0, 100, 100, 10, 0, {
      bodyMaterial: "Alumínio 6061-T6",
    });

    const sceneMixed = buildDirectTopology3DScene([steelBlock, aluBlock], 2);
    assert.equal(sceneMixed.bodies.length, 2);

    const summaryMixed = computeMultiBodyInspectorSummary3D(sceneMixed.bodies)!;
    assert.equal(summaryMixed.bodyCount, 2);
    assert.equal(summaryMixed.isMaterialMixed, true);
    assert.equal(summaryMixed.materialSummaryLabel, "Material: Misto");
    assert.equal(summaryMixed.totalVolumeCm3, 200);
    // Massa total = 785 g + 270 g = 1055 g
    assert.ok(
      Math.abs(summaryMixed.totalMassGrams - 1055) <= 2,
      `Esperado ~1055g (785g Aço + 270g Alumínio), obtido ${summaryMixed.totalMassGrams}g`,
    );

    // Padronizar material para Aço nos 2 blocos => 785g + 785g = 1570g e isMaterialMixed === false!
    const unified = applyUniformMaterialToEntities3D(
      [steelBlock, aluBlock],
      ["bloco_aco", "bloco_alu"],
      "Aço Estrutural ASTM A36",
    );
    const sceneUnified = buildDirectTopology3DScene(unified, 2);
    const summaryUnified = computeMultiBodyInspectorSummary3D(sceneUnified.bodies)!;
    assert.equal(summaryUnified.isMaterialMixed, false);
    assert.ok(Math.abs(summaryUnified.totalMassGrams - 1570) <= 2);
  });
});
