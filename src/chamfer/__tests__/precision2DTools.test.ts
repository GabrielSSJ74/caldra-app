import test from "node:test";
import assert from "node:assert/strict";
import { dist, type Entity } from "../../lib/lab2d/core";
import {
  computeUniversalFillet2D,
  detectDirectFilletCorner,
} from "../tools/universalFillet2D";
import {
  buildTrimBatchPreview,
  collectTrimSubPiecesCrossedByFence,
  commitTrimBatch,
  decomposeEntityForTrim,
  hitTestTrimSubPiece,
  trimPrimitiveToSvgPath,
} from "../tools/trimEngine2D";
import {
  buildCenterRadiusLineFromParams,
  computeCenterRadiusLineGeometry,
  createPolarReferenceItem,
  detectPolarRefOrigin,
  evaluateLivePolarReference,
  findNearestPolarRefSnap,
} from "../tools/polarReferenceEngine";

test("Teste 1A (DE21): Fillet Universal R10 entre Linha Vertical e Arco R12 gera arco real sem facetamento", () => {
  // Cenário DE21: Linha vertical em x = 15 encontrando arco R12 centrado em (0, 52)
  const vLine: Extract<Entity, { type: "line" }> = {
    id: "de21-vline",
    layer: "corte",
    type: "line",
    x1: 15,
    y1: 0,
    x2: 15,
    y2: 52,
  };
  const arcR12: Extract<Entity, { type: "arc" }> = {
    id: "de21-arc12",
    layer: "corte",
    type: "arc",
    cx: 0,
    cy: 52,
    r: 12,
    a0: 0,
    a1: Math.PI,
  };

  const all: Entity[] = [vLine, arcR12];
  // Cliques próximos à região de concordância (lado inferior/direito)
  const res = computeUniversalFillet2D(
    vLine,
    { x: 15, y: 20 },
    arcR12,
    { x: 10, y: 58 },
    10,
    all,
  );

  assert.equal(res.ok, true, res.error ?? "Fillet R10 linha × arco R12 deve resolver");
  assert.ok(res.activeSolution, "Deve existir solução ativa");
  const sol = res.activeSolution!;
  assert.equal(sol.filletArc.type, "arc", "Deve criar arco geométrico real (type: 'arc')");
  assert.equal(sol.filletArc.r, 10, "Raio do arco criado deve ser exatamente R10");

  // Verifica tangência analítica exata (erro < 1e-4 mm)
  const distToLine = Math.abs(sol.arcCenter.x - 15);
  assert.ok(Math.abs(distToLine - 10) < 1e-4, `Distância do centro à linha deve ser 10 mm (obtido ${distToLine})`);

  const distToArcCenter = dist(sol.arcCenter, { x: arcR12.cx, y: arcR12.cy });
  assert.ok(
    Math.abs(distToArcCenter - (12 + 10)) < 1e-4 || Math.abs(distToArcCenter - Math.abs(12 - 10)) < 1e-4,
    `Centro do fillet deve ser tangente ao arco R12 (obtido d=${distToArcCenter})`,
  );

  // Confirma que os pontos de tangência pertencem à linha e ao arco R12
  assert.ok(Math.abs(sol.tangentA.x - 15) < 1e-4, "Tangente na linha deve estar em x = 15");
  assert.ok(
    Math.abs(dist(sol.tangentB, { x: arcR12.cx, y: arcR12.cy }) - 12) < 1e-4,
    "Tangente no arco deve estar exatamente sobre R12",
  );

  // Confirma que NÃO gerou nenhuma polilinha facetada
  const polylines = sol.updatedEntities.filter((e) => e.type === "polyline");
  assert.equal(polylines.length, 0, "Não deve gerar polilinha facetada");

  // Confirma que a linha foi aparada até tangentA
  const trimmedLine = sol.updatedEntities.find((e) => e.id === vLine.id) as Extract<Entity, { type: "line" }>;
  assert.ok(trimmedLine && trimmedLine.type === "line");
  assert.ok(
    dist({ x: trimmedLine.x1, y: trimmedLine.y1 }, sol.tangentA) < 1e-3 ||
      dist({ x: trimmedLine.x2, y: trimmedLine.y2 }, sol.tangentA) < 1e-3,
    "Linha vertical deve ser aparada exatamente no ponto de tangência",
  );
});

test("Teste 1B (DE21): Fillet R8 nos cantos inferiores do retângulo e Fillet Arco × Arco + diagnóstico de raio impossível", () => {
  // Retângulo fechado de 60x40 (polyline fechada)
  const rect: Extract<Entity, { type: "polyline" }> = {
    id: "de21-rect",
    layer: "corte",
    type: "polyline",
    closed: true,
    pts: [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 0, y: 40 },
    ],
  };

  // Detecta canto inferior esquerdo (0, 40) com R8
  const cornerRes = detectDirectFilletCorner({ x: 0.5, y: 39.5 }, [rect], 8, 5);
  assert.ok(cornerRes && cornerRes.ok && cornerRes.activeSolution, "Deve arredondar canto do retângulo com R8");
  const arcs = cornerRes.activeSolution!.updatedEntities.filter((e) => e.type === "arc");
  assert.equal(arcs.length, 1, "Deve inserir exatamente 1 arco real R8");
  assert.equal((arcs[0] as Extract<Entity, { type: "arc" }>).r, 8);
  // Nenhuma polilinha facetada com 8+ vértices!
  const faceted = cornerRes.activeSolution!.updatedEntities.filter(
    (e) => e.type === "polyline" && e.pts.length > 4,
  );
  assert.equal(faceted.length, 0, "Retângulo filletado não pode virar polilinha facetada");

  // Diagnóstico de raio impossível (R50 em retângulo 60x40 -> máx 40)
  const impossible = detectDirectFilletCorner({ x: 0.5, y: 39.5 }, [rect], 50, 5);
  assert.ok(impossible && !impossible.ok, "Raio 50 mm em vão de 40 mm deve retornar ok=false");
  assert.ok(impossible.error?.includes("excede o limite geométrico"), "Deve informar limite geométrico");

  // Fillet Arco × Arco (dois círculos R20 separados por 50 mm, concordância R10)
  const c1: Extract<Entity, { type: "circle" }> = { id: "c1", layer: "corte", type: "circle", cx: 0, cy: 0, r: 20 };
  const c2: Extract<Entity, { type: "circle" }> = { id: "c2", layer: "corte", type: "circle", cx: 50, cy: 0, r: 20 };
  const ccRes = computeUniversalFillet2D(c1, { x: 18, y: -8 }, c2, { x: 32, y: -8 }, 10, [c1, c2]);
  assert.equal(ccRes.ok, true, ccRes.error ?? "Fillet Círculo × Círculo deve resolver");
  assert.ok(ccRes.solutions.length >= 2, "Deve expor soluções alternativas para alternância");
  const s = ccRes.activeSolution!;
  assert.equal(s.filletArc.type, "arc");
  assert.equal(s.filletArc.r, 10);
  assert.ok(Math.abs(dist(s.arcCenter, { x: 0, y: 0 }) - 30) < 1e-4);
  assert.ok(Math.abs(dist(s.arcCenter, { x: 50, y: 0 }) - 30) < 1e-4);
});

test("Teste 2 (DE21): TRIM Unificado sobre 3 círculos concêntricos e raios a 30° e 120° — curva exata, faca fiel e confirmação em lote", () => {
  const cx = 0;
  const cy = 0;
  const cInner: Extract<Entity, { type: "circle" }> = { id: "c-r12", layer: "corte", type: "circle", cx, cy, r: 12 };
  const cMid: Extract<Entity, { type: "circle" }> = { id: "c-r27", layer: "corte", type: "circle", cx, cy, r: 27 };
  const cOuter: Extract<Entity, { type: "circle" }> = { id: "c-r41", layer: "corte", type: "circle", cx, cy, r: 41 };

  // Linhas radiais passando pelo centro em 30° e 120° (atravessando os 3 círculos)
  const rad30 = (30 * Math.PI) / 180;
  const rad120 = (120 * Math.PI) / 180;
  const ray30: Extract<Entity, { type: "line" }> = {
    id: "ray-30",
    layer: "corte",
    type: "line",
    x1: -60 * Math.cos(rad30),
    y1: -60 * Math.sin(rad30),
    x2: 60 * Math.cos(rad30),
    y2: 60 * Math.sin(rad30),
  };
  const ray120: Extract<Entity, { type: "line" }> = {
    id: "ray-120",
    layer: "corte",
    type: "line",
    x1: -60 * Math.cos(rad120),
    y1: -60 * Math.sin(rad120),
    x2: 60 * Math.cos(rad120),
    y2: 60 * Math.sin(rad120),
  };

  const scene: Entity[] = [cInner, cMid, cOuter, ray30, ray120];

  // 1. Decomposição do círculo externo R41: deve ter exatamente 4 sub-arcos reais
  const decompOuter = decomposeEntityForTrim(cOuter, scene, "real");
  assert.ok(decompOuter && decompOuter.subPieces.length === 4, "Círculo cortado por 2 diâmetros deve ter 4 sub-arcos");
  for (const sp of decompOuter.subPieces) {
    assert.equal(sp.primitive.kind, "arc", "Cada sub-trecho de círculo DEVE ser arco real, nunca corda reta");
    const svgPath = trimPrimitiveToSvgPath(sp.primitive);
    assert.ok(svgPath.includes(" A "), "Caminho SVG da prévia animada deve usar comando de arco real 'A'");
  }

  // 2. Toque direto no sub-arco de 75° do círculo externo R41
  const touchAng = (75 * Math.PI) / 180;
  const touchPt = { x: 41 * Math.cos(touchAng), y: 41 * Math.sin(touchAng) };
  const hitTouch = hitTestTrimSubPiece(touchPt, scene, 3, "real");
  assert.ok(hitTouch && hitTouch.subPiece.entityId === "c-r41", "Toque direto deve capturar o sub-arco exato de c-r41");
  assert.equal(hitTouch.subPiece.primitive.kind, "arc");

  // 3. Arraste "Faca" cruzando APENAS o sub-arco de 75° do círculo médio R27 (sem encostar em c-r12 nem nas retas)
  const fence = [
    { x: 22 * Math.cos(touchAng), y: 22 * Math.sin(touchAng) },
    { x: 32 * Math.cos(touchAng), y: 32 * Math.sin(touchAng) },
  ];
  const fenceHits = collectTrimSubPiecesCrossedByFence(fence, scene, "real");
  assert.equal(fenceHits.length, 1, "Faca deve cruzar EXCLUSIVAMENTE 1 sub-arco (c-r27)");
  assert.equal(fenceHits[0]!.entityId, "c-r27");

  // 4. Prévia em lote antes da confirmação: nada foi apagado ainda!
  const markedKeys = [hitTouch.subPiece.key, fenceHits[0]!.key];
  const preview = buildTrimBatchPreview(scene, markedKeys, null, "real");
  assert.equal(preview.markedCutPieces.length, 2, "2 sub-arcos marcados em vermelho animado");
  assert.equal(preview.keptPieces.length, 6, "6 sub-arcos remanescentes das 2 entidades destacadas em verde");
  assert.ok(preview.markedCutPieces.every((p) => p.primitive.kind === "arc"), "Nenhum trecho curvo vira corda reta");

  // 5. Confirmação em lote (1 operação atômica): c-r12, ray30 e ray120 permanecem 100% intactos!
  const committed = commitTrimBatch(scene, markedKeys, "real");
  assert.equal(committed.removedSubPiecesCount, 2);
  assert.ok(committed.updatedEntities.some((e) => e.id === "c-r12" && e.type === "circle"), "c-r12 não tocado permanece intacto");
  const outerRemaining = committed.updatedEntities.filter((e) => e.id === "c-r41");
  assert.equal(outerRemaining.length, 1, "Os 3 sub-arcos contíguos mantidos de c-r41 devem fundir em 1 único arco limpo de 270°");
  assert.equal(outerRemaining[0]!.type, "arc");
});

test("Teste 3: Linha e Polilinha no modo 'Centro-Raio' (simétrica a partir do centro)", () => {
  // Centro (0, 0), R = 15 mm a 0° -> (-15, 0) até (+15, 0), L = 30.0 mm
  const sym = buildCenterRadiusLineFromParams({ x: 0, y: 0 }, 15, 0);
  assert.equal(sym.start.x, -15);
  assert.equal(sym.start.y, 0);
  assert.equal(sym.end.x, 15);
  assert.equal(sym.end.y, 0);
  assert.equal(sym.radiusMm, 15);
  assert.equal(sym.lengthMm, 30);

  // A partir do arraste do centro (10, 20) até (10, 0) (90° para cima em SVG)
  const fromDrag = computeCenterRadiusLineGeometry({ x: 10, y: 20 }, { x: 10, y: 0 });
  assert.equal(fromDrag.radiusMm, 20);
  assert.equal(fromDrag.lengthMm, 40);
  assert.equal(fromDrag.angleDeg, 90);
  assert.deepEqual(fromDrag.start, { x: 10, y: 40 });
  assert.deepEqual(fromDrag.end, { x: 10, y: 0 });

  // Editar L = 50 -> R = 25 mantendo centro (10, 20) imóvel
  const edited = buildCenterRadiusLineFromParams({ x: 10, y: 20 }, 50 / 2, 90);
  assert.equal(edited.radiusMm, 25);
  assert.equal(edited.lengthMm, 50);
  assert.equal((edited.start.x + edited.end.x) / 2, 10);
  assert.equal((edited.start.y + edited.end.y) / 2, 20);
});

test("Teste 4 (DE21): Ref. Polar não-vetorial — 52 mm a 90° do ponto médio da borda inferior, SNAP prioritário e exclusão total de entidades/3D/DXF", () => {
  const bottomEdge: Extract<Entity, { type: "line" }> = {
    id: "de21-bottom",
    layer: "corte",
    type: "line",
    x1: 0,
    y1: 100,
    x2: 80,
    y2: 100,
  };
  const entities: Entity[] = [bottomEdge];

  // 1. Detecta ponto médio da borda inferior (40, 100) + perpendicularidade automática (90°)
  const originAnchor = detectPolarRefOrigin({ x: 40.2, y: 99.8 }, entities, 5, null);
  assert.equal(originAnchor.kind, "midpoint");
  assert.equal(originAnchor.point.x, 40);
  assert.equal(originAnchor.point.y, 100);
  assert.equal(originAnchor.edgePerpAngleDeg, 90);

  // 2. Puxar d = 52 mm a ∠ 90° (para cima -> Y diminui 52 mm no espaço SVG -> (40, 48))
  const live = evaluateLivePolarReference({
    originAnchor,
    rawCursor: { x: 41, y: 48 },
    orthoOn: false,
    polarSnapOn: true,
    lockedDistanceMm: 52,
    lockedAngleDeg: 90,
  });
  assert.equal(live.distanceMm, 52);
  assert.equal(live.angleDeg, 90);
  assert.deepEqual(live.target, { x: 40, y: 48 });

  // 3. Crava a Ref. Polar não-vetorial
  const refItem = createPolarReferenceItem({
    origin: originAnchor.point,
    distanceMm: live.distanceMm,
    angleDeg: live.angleDeg,
    originLabel: originAnchor.label,
    isPerpendicularToEdge: true,
  });
  const polarRefs = [refItem];

  // 4. SNAP magnético captura o alvo P_target = (40, 48) para iniciar o círculo R12
  const snapHit = findNearestPolarRefSnap({ x: 41.2, y: 49.1 }, polarRefs, 5);
  assert.ok(snapHit, "Alvo ⊕ da Ref. Polar deve disparar SNAP magnético");
  assert.equal(snapHit.kind, "target");
  assert.deepEqual(snapHit.point, { x: 40, y: 48 });

  // 5. Confirma natureza estritamente não-vetorial: entities continua contendo APENAS a borda real
  assert.equal(entities.length, 1);
  assert.equal(entities.some((e) => e.id === refItem.id), false, "Ref. Polar NUNCA entra em entities");
});
