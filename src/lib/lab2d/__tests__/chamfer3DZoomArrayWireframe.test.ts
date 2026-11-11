import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOSE_UP_MAX_PAN_FIELD_FRACTION,
  CLOSE_UP_MAX_ZOOM_RATIO_STEP,
  computeAdaptiveZoomMetrics,
  computeCharacteristicPartRadiusMm,
  createPinchGestureSessionState,
  evaluateAdaptivePanStep,
  evaluateAdaptiveZoomStep,
  loadZoomSensitivityConfig,
  MIN_PINCH_TOUCH_DURATION_MS,
  PINCH_DEADZONE_PX,
  sanitizeZoomSensitivityConfig,
  saveZoomSensitivityConfig,
} from "../chamferAdaptiveZoom";
import {
  computeProjectedProfileWidthMm,
  computeSmartGrilleArray3D,
  computeSmartGrilleBarPreviewQuads3D,
  generateSmartGrilleArrayEntities3D,
  loadSmartGrilleStepConfig,
  sanitizeSmartGrilleStepConfig,
  saveSmartGrilleStepConfig,
} from "../chamfer3DSmartArray";
import {
  computeViewDirCad3DFromAngles,
  extractBRepTechnicalCallouts3D,
  extractBRepTechnicalWireframeData3D,
  loadBRepWireframeLayerConfig,
  layoutScreenSpaceCallouts2D,
  saveBRepWireframeLayerConfig,
} from "../chamferBRepWireframe3D";
import { buildDirectTopology3DScene } from "../cadDirectModeling3D";
import type { Entity } from "../core";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

function makeRectEntity(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  params?: Record<string, unknown>,
): Entity {
  return {
    id,
    layer: "corte",
    type: "polyline",
    closed: true,
    pts: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    extrudeHeight: Number(params?.extrudeHeightMm ?? 20),
    elevationZ: Number(params?.elevationZ ?? 0),
    shellWallThickness: Number(params?.shellThicknessMm ?? params?.shellWallThicknessMm ?? 0),
    params,
  };
}

test("Teste A1: Zoom Adaptativo calcula raio característico real e curva contínua por proximidade/escala", () => {
  const smallTube = makeRectEntity("ent_small_tube", 0, 0, 30, 20, {
    extrudeHeightMm: 40,
    elevationZ: 0,
  });
  const largeFrame = makeRectEntity("ent_large_frame", 0, 0, 2000, 1200, {
    extrudeHeightMm: 50,
    elevationZ: 0,
  });

  const rSmall = computeCharacteristicPartRadiusMm({
    entities2D: [smallTube, largeFrame],
    selectedEntityIds: ["ent_small_tube"],
  });
  const rLarge = computeCharacteristicPartRadiusMm({
    entities2D: [smallTube, largeFrame],
    selectedEntityIds: ["ent_large_frame"],
  });

  // Raio da peça pequena (~26.9 mm) vs estrutura grande (~1166.5 mm)
  assert.ok(rSmall >= 25 && rSmall <= 30, `rSmall esperado ~26.9mm, obtido ${rSmall}`);
  assert.ok(rLarge > 1100, `rLarge esperado > 1100mm, obtido ${rLarge}`);

  // Mesma câmera física (k = 18 px/mm em viewport 1200x800 -> campo visível vertical ~44.4mm)
  const closeUpMetrics = computeAdaptiveZoomMetrics({
    characteristicRadiusMm: rLarge,
    viewK: 18,
    viewportWidthPx: 1200,
    viewportHeightPx: 800,
    userSensitivityMultiplier: 1.0,
  });
  const farMetrics = computeAdaptiveZoomMetrics({
    characteristicRadiusMm: rSmall,
    viewK: 0.4,
    viewportWidthPx: 1200,
    viewportHeightPx: 800,
    userSensitivityMultiplier: 1.0,
  });

  assert.equal(closeUpMetrics.isCloseUp, true);
  assert.ok(
    closeUpMetrics.adaptiveFactor < 0.35,
    `Fator adaptativo em close-up deve atenuar fortemente (<0.35), obtido ${closeUpMetrics.adaptiveFactor}`,
  );
  assert.equal(farMetrics.isCloseUp, false);
  assert.ok(
    farMetrics.adaptiveFactor > 1.0,
    `Fator adaptativo em vista aberta deve permitir aproximação ágil (>1.0), obtido ${farMetrics.adaptiveFactor}`,
  );
});

test("Teste A2: Proteção Anti-Esbarrão bloqueia micro-toques (<6px / <60ms) e limita velocidade em close-up (±3% zoom e 10% pan)", () => {
  const closeMetrics = computeAdaptiveZoomMetrics({
    characteristicRadiusMm: 500,
    directCameraDistanceMm: 120, // distanciaNormalizada = 0.24 (< 0.8)
    viewportWidthPx: 1000,
    viewportHeightPx: 700,
    userSensitivityMultiplier: 1.4,
  });
  assert.equal(closeMetrics.isCloseUp, true);

  // 1. Esbarrão rápido (< 60ms) é bloqueado mesmo com delta > 6px
  const fastBump = evaluateAdaptiveZoomStep({
    rawZoomRatio: 1.8,
    metrics: closeMetrics,
    isPinchGesture: true,
    pinchDeltaPxFromStart: 14,
    touchElapsedMs: MIN_PINCH_TOUCH_DURATION_MS - 20,
    pinchUnlocked: false,
  });
  assert.equal(fastBump.blockedByDeadzone, true);
  assert.equal(fastBump.appliedZoomRatio, 1.0);

  // 2. Micro-oscilação (< 6px) ao apoiar 2 dedos na tela é bloqueada
  const microOscillation = evaluateAdaptiveZoomStep({
    rawZoomRatio: 1.25,
    metrics: closeMetrics,
    isPinchGesture: true,
    pinchDeltaPxFromStart: PINCH_DEADZONE_PX - 1.5,
    touchElapsedMs: 120,
    pinchUnlocked: false,
  });
  assert.equal(microOscillation.blockedByDeadzone, true);
  assert.equal(microOscillation.appliedZoomRatio, 1.0);

  // 3. Em close-up destravado, um salto brusco de pinça/roda (ex: 3.5x) nunca passa de ±3.0% por frame
  const clampedZoomIn = evaluateAdaptiveZoomStep({
    rawZoomRatio: 3.5,
    metrics: closeMetrics,
    isPinchGesture: true,
    pinchDeltaPxFromStart: 40,
    touchElapsedMs: 180,
    pinchUnlocked: true,
  });
  assert.equal(clampedZoomIn.clampedByCloseUp, true);
  assert.ok(Math.abs(clampedZoomIn.appliedZoomRatio - (1 + CLOSE_UP_MAX_ZOOM_RATIO_STEP)) < 1e-6);

  const clampedZoomOut = evaluateAdaptiveZoomStep({
    rawZoomRatio: 0.25,
    metrics: closeMetrics,
    isPinchGesture: false,
  });
  assert.equal(clampedZoomOut.clampedByCloseUp, true);
  assert.ok(Math.abs(clampedZoomOut.appliedZoomRatio - (1 - CLOSE_UP_MAX_ZOOM_RATIO_STEP)) < 1e-6);

  // 4. Pan brusco em close-up nunca desloca mais de 10% do campo visível por frame
  const clampedPan = evaluateAdaptivePanStep({
    rawDeltaPxX: 480,
    rawDeltaPxY: -390,
    viewportWidthPx: 1000,
    viewportHeightPx: 700,
    metrics: closeMetrics,
  });
  assert.equal(clampedPan.clampedByCloseUp, true);
  assert.equal(clampedPan.appliedDeltaPxX, 1000 * CLOSE_UP_MAX_PAN_FIELD_FRACTION);
  assert.equal(clampedPan.appliedDeltaPxY, -700 * CLOSE_UP_MAX_PAN_FIELD_FRACTION);

  // 5. Sessão de pinça calcula ponto médio exato M = ((x1+x2)/2, (y1+y2)/2) e persiste presets
  const sess = createPinchGestureSessionState(100, 200, 300, 400, 1000);
  assert.equal(sess.initialMidX, 200);
  assert.equal(sess.initialMidY, 300);
  const store = createMemoryStorage();
  assert.deepEqual(sanitizeZoomSensitivityConfig({ preset: "low", multiplier: 0.6 }), {
    preset: "low",
    multiplier: 0.6,
  });
  saveZoomSensitivityConfig({ preset: "custom", multiplier: 1.75 }, store);
  assert.deepEqual(loadZoomSensitivityConfig(store), {
    preset: "custom",
    multiplier: 1.75,
  });
});

test("Teste B: Array 3D -> Grade / Vão calcula Passo Δ, Ângulos ∠ θ° (0°, 30°, 45°, -45°) em Veneziana e Diagonal, e gera corpos 3D reais", () => {
  const store = createMemoryStorage();
  // 1. Sanitização e persistência de Passo Δ
  const customSteps = sanitizeSmartGrilleStepConfig({
    countStep: 5,
    maxGapStepMm: 25,
    angleStepDeg: 15,
  });
  assert.deepEqual(customSteps, { countStep: 5, maxGapStepMm: 25, angleStepDeg: 15 });
  saveSmartGrilleStepConfig(customSteps, store);
  assert.deepEqual(loadSmartGrilleStepConfig(store), customSteps);

  // 2. Largura efetiva projetada W_proj(θ) = W*|cos θ| + H*|sin θ| para perfil retangular 20 × 50 mm
  const w0 = computeProjectedProfileWidthMm(20, 50, 0);
  const w30 = computeProjectedProfileWidthMm(20, 50, 30);
  const w45 = computeProjectedProfileWidthMm(20, 50, 45);
  const wNeg45 = computeProjectedProfileWidthMm(20, 50, -45);
  assert.ok(Math.abs(w0 - 20) < 1e-6);
  assert.ok(Math.abs(w30 - (20 * Math.cos(Math.PI / 6) + 50 * Math.sin(Math.PI / 6))) < 1e-6);
  assert.ok(Math.abs(w45 - 70 * Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(wNeg45 - w45) < 1e-6);

  // 3. Modo A (N Tubos = 6) em vão de 1000mm entre 0° e 45° (Veneziana)
  const res0 = computeSmartGrilleArray3D({
    mode: "by_count",
    spanMm: 1000,
    tubeWidthMm: 20,
    tubeDepthMm: 50,
    count: 6,
    maxClearGapMm: 110,
    startInnerCoordMm: 40,
    axis: "x",
    angleDeg: 0,
    angleMode: "axial_louver",
    perpInnerStartMm: 40,
    perpInnerEndMm: 960,
    perpSpanMm: 920,
  });
  const res45 = computeSmartGrilleArray3D({
    mode: "by_count",
    spanMm: 1000,
    tubeWidthMm: 20,
    tubeDepthMm: 50,
    count: 6,
    maxClearGapMm: 110,
    startInnerCoordMm: 40,
    axis: "x",
    angleDeg: 45,
    angleMode: "axial_louver",
    perpInnerStartMm: 40,
    perpInnerEndMm: 960,
    perpSpanMm: 920,
  });
  assert.equal(res0.valid, true);
  assert.equal(res45.valid, true);
  assert.equal(res0.centerCoordsMm.length, 6);
  assert.equal(res45.centerCoordsMm.length, 6);
  assert.ok(res45.projectedTubeWidthMm > res0.projectedTubeWidthMm);
  assert.ok(res45.clearGapMm < res0.clearGapMm);

  // 4. Modo B (Vão Máx = 110 mm) com Inclinação Diagonal (-45° e +30°)
  const resGapDiag = computeSmartGrilleArray3D({
    mode: "by_max_gap",
    spanMm: 1000,
    tubeWidthMm: 30,
    tubeDepthMm: 30,
    count: 5,
    maxClearGapMm: 110,
    startInnerCoordMm: 40,
    axis: "x",
    angleDeg: -45,
    angleMode: "diagonal_span",
    perpInnerStartMm: 40,
    perpInnerEndMm: 840,
    perpSpanMm: 800,
  });
  assert.equal(resGapDiag.valid, true);
  assert.ok(resGapDiag.clearGapMm <= 110.05, `Luz (${resGapDiag.clearGapMm}) deve respeitar Vão Máx 110mm`);
  assert.ok((resGapDiag.diagonalBarLengthMm ?? 0) > 800, "Comprimento diagonal deve ser maior que o vão reto");

  // 5. Ghost Preview 3D e geração real de entidades B-Rep 3D
  const quadsDiag = computeSmartGrilleBarPreviewQuads3D({
    centerCoordMm: resGapDiag.centerCoordsMm[0]!,
    axis: "x",
    barWidthMm: 30,
    barHeightZMm: 30,
    perpStartMm: 40,
    perpEndMm: 840,
    z0: 0,
    z1: 30,
    angleDeg: 30,
    angleMode: "diagonal_span",
    isHorizontalInXY: true,
  });
  assert.equal(quadsDiag.length, 6);

  const leftCol = makeRectEntity("col_left", 0, 0, 40, 920, {
    extrudeHeightMm: 40,
    elevationZ: 0,
    shellThicknessMm: 2,
    shellMode: "tube",
  });
  const rightCol = makeRectEntity("col_right", 1040, 0, 40, 920, {
    extrudeHeightMm: 40,
    elevationZ: 0,
    shellThicknessMm: 2,
    shellMode: "tube",
  });
  const baseScene = buildDirectTopology3DScene([leftCol, rightCol], 40);
  const generatedLouver = generateSmartGrilleArrayEntities3D(
    [leftCol, rightCol],
    leftCol.id,
    baseScene.bodies[0]!,
    res45,
    baseScene.bodies,
  );
  assert.equal(generatedLouver.createdIds.length, 6);
  const sceneAfterLouver = buildDirectTopology3DScene(generatedLouver.updatedEntities, 40);
  assert.equal(sceneAfterLouver.bodies.length, 8);
});

test("Teste C: Decomposição Topológica ARAME B-Rep elimina diagonais planas, gera geratrizes 4+2 em curvas/furos, paredes Shell e cotas técnicas sem colisão", () => {
  const mockStorage = createMemoryStorage();
  saveBRepWireframeLayerConfig(
    { showContours: true, showHiddenXRay: false, showAxesCenters: true, showDimensions: true },
    mockStorage,
  );
  assert.equal(loadBRepWireframeLayerConfig(mockStorage).showHiddenXRay, false);

  // 1. Flange circular Ø240 × 18mm com furo central Ø80 (entidade aninhada 2D) e 4 furos Ø16 (holes3D)
  const flangeOuter: Entity = {
    id: "flange_outer",
    layer: "corte",
    type: "circle",
    cx: 200,
    cy: 200,
    r: 120,
    extrudeHeight: 18,
    params: {
      extrudeHeightMm: 18,
      elevationZ: 0,
      holes3D: [
        { holeId: "h_b1", center2D: { x: 285, y: 200 }, diameterMm: 16, mode: "through" },
        { holeId: "h_b2", center2D: { x: 115, y: 200 }, diameterMm: 16, mode: "through" },
        { holeId: "h_b3", x: 200, y: 285, diameterMm: 16, throughAll: true },
        { holeId: "h_b4", x: 200, y: 115, diameterMm: 16, throughAll: true },
      ],
    },
  };
  const centralBore: Entity = {
    id: "flange_bore",
    layer: "corte",
    type: "circle",
    cx: 200,
    cy: 200,
    r: 40,
    extrudeHeight: 18,
  };

  // 2. Tubo vazado Metalon 80 × 40 × 300mm com Shell t = 2mm e Corte 45°
  const hollowTube = makeRectEntity("metalon_tube", 420, 100, 300, 80, {
    extrudeHeightMm: 40,
    elevationZ: 0,
    shellThicknessMm: 2,
    shellWallThickness: 2,
    shellMode: "tube",
    startMiterAngleDeg: 45,
  });

  // 3. Grade estrutural (barras retangulares)
  const grilleBar1 = makeRectEntity("grille_bar_1", 800, 100, 20, 400, { extrudeHeightMm: 30 });
  const grilleBar2 = makeRectEntity("grille_bar_2", 900, 100, 20, 400, { extrudeHeightMm: 30 });

  const entities = [flangeOuter, centralBore, hollowTube, grilleBar1, grilleBar2];
  const scene = buildDirectTopology3DScene(entities, 18);
  const viewDir = computeViewDirCad3DFromAngles(45, 35.264);
  const wireData = extractBRepTechnicalWireframeData3D(scene, entities, {
    viewDirCad3D: viewDir,
    convertToThreeZUp: true,
  });

  // Zero diagonais de triangulação em faces planas
  assert.equal(wireData.diagnostics.flatFaceDiagonalCount, 0);
  // 1 cilindro externo + 1 furo central B-Rep + 4 furos paramétricos = 6 feições circulares -> >= 24 geratrizes cardeais e >= 12 de silhueta
  assert.ok(
    wireData.diagnostics.cardinalGeneratrixCount >= 24,
    `Esperado >=24 geratrizes cardeais, obtido ${wireData.diagnostics.cardinalGeneratrixCount}`,
  );
  assert.ok(
    wireData.diagnostics.silhouetteGeneratrixCount >= 12,
    `Esperado >=12 geratrizes de silhueta, obtido ${wireData.diagnostics.silhouetteGeneratrixCount}`,
  );
  // Paredes verticais internas do Shell Metalon presentes
  assert.ok(
    wireData.diagnostics.shellVerticalEdgeCount >= 4,
    `Esperado >=4 arestas verticais internas de Shell, obtido ${wireData.diagnostics.shellVerticalEdgeCount}`,
  );
  assert.ok(wireData.outerContourPositions.length > 0);
  assert.ok(wireData.featureThicknessPositions.length > 0);
  assert.ok(wireData.allOccludablePositions.length > 0);
  assert.ok(wireData.centerlineAxisPositions.length > 0);

  // Cotas técnicas seletivas reais para a flange e para o tubo Metalon
  const flangeBody = scene.bodies.find((b) => b.entityId === "flange_outer")!;
  const tubeBody = scene.bodies.find((b) => b.entityId === "metalon_tube")!;
  const flangeCallouts = extractBRepTechnicalCallouts3D(scene, entities, [flangeBody.bodyId]);
  const flangeTexts = flangeCallouts.map((c) => c.text);
  assert.ok(flangeTexts.some((t) => t.includes("e = 18 mm")), `Faltou cota de espessura: ${flangeTexts.join(" | ")}`);
  assert.ok(flangeTexts.some((t) => t.includes("Ø 240 mm")), `Faltou cota de diâmetro externo: ${flangeTexts.join(" | ")}`);
  assert.ok(flangeTexts.some((t) => t.includes("4 × Ø 16 mm")), `Faltou cota agrupada de furos: ${flangeTexts.join(" | ")}`);

  const tubeCallouts = extractBRepTechnicalCallouts3D(scene, entities, [tubeBody.bodyId]);
  assert.ok(
    tubeCallouts.some((c) => c.text.includes("Parede t = 2 mm")),
    `Faltou cota de parede Shell: ${tubeCallouts.map((c) => c.text).join(" | ")}`,
  );

  // Layout anti-colisão em espaço de tela mantém rótulos de altura constante (22px p/ fonte 11px) sem sobreposição em zoom-out e zoom-in extremo
  for (const zoomK of [0.8, 25]) {
    const laidOut = layoutScreenSpaceCallouts2D(
      [...flangeCallouts, ...tubeCallouts],
      (pt) => ({ x: 600 + (pt.x - 300) * zoomK * 0.05, y: 400 + (pt.y - 180) * zoomK * 0.05 }),
      1280,
      800,
    );
    assert.ok(laidOut.length >= 4);
    for (let i = 0; i < laidOut.length; i++) {
      assert.equal(laidOut[i]!.heightPx, 22);
      for (let j = i + 1; j < laidOut.length; j++) {
        const a = laidOut[i]!;
        const b = laidOut[j]!;
        const overlapsX = a.labelPx.x < b.labelPx.x + b.widthPx && a.labelPx.x + a.widthPx > b.labelPx.x;
        const overlapsY = a.labelPx.y < b.labelPx.y + b.heightPx && a.labelPx.y + a.heightPx > b.labelPx.y;
        assert.equal(
          overlapsX && overlapsY,
          false,
          `Colisão detectada entre cotas '${a.text}' e '${b.text}' em zoom k=${zoomK}`,
        );
      }
    }
  }
});
