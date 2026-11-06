import { describe, it } from "vitest";
import assert from "node:assert/strict";
import type { Entity } from "../types";
import {
  inferAssociativeMarkFromPoint,
  inferValidGeometricMarkCandidate,
  clearGeometricMarksFromEntities,
  buildRelationalGeometricMarks,
  syncAssociativeGeometricMarks,
  getGeometricMarkSpec,
  createPersistentDatumEntity,
  getPersistentDatumSpec,
  computePersistentDatumMetrics,
  updatePersistentDatumTargetByComponent,
  convertDatumToCadLines,
} from "../cadGeometricMarks";
import {
  TOUCH_CURSOR_OFFSET_PX,
  computeTouchCursorScreenAndWorld,
} from "../../../components/lab2d/ChamferVirtualCursor";
import {
  findEnclosedAndConnectedAssembly,
  applyArrayAutoTrim,
  computeInstances,
  detectHostPart,
  type ArraySpec,
} from "../cadArrayEngine";
import {
  findSmartSnap,
  buildUnifiedSnapResult,
} from "../cadReferenceSnaps";
import { closestOnSegment } from "../core";
import { getSilkBackgroundCacheStats } from "../canvasScene";
import {
  getAuroraEngineTelemetry,
  AUTONOMOUS_COLOR_ORBS,
  COSMOS_RADIAL_6_STOPS,
  RADIAL_CORE_5_STOPS,
  LIQUID_SILK_10_STOPS,
  lerpRGB,
  createInitialOrbRuntimeState,
  stepOrbRuntimeState,
  computeOrbOpticalHierarchyState,
} from "../../../components/chameleon/Aurora";

describe("CHAMFER CAD — Prompt Mestre Unificado (Pure Logic Verification)", () => {
  describe("Seção 2 / Teste 2: Array Inteligente de Conjuntos Geométricos + Auto-Trim", () => {
    it("inclui automaticamente furos internos e sub-geometrias contidas ao selecionar o contorno fechado principal", () => {
      const plate: Entity = {
        id: "plate-1",
        layer: "corte",
        type: "polyline",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 0, y: 100 },
        ],
      };
      const hole1: Entity = {
        id: "hole-1",
        layer: "corte",
        type: "circle",
        cx: 40,
        cy: 50,
        r: 10,
      };
      const hole2: Entity = {
        id: "hole-2",
        layer: "corte",
        type: "circle",
        cx: 160,
        cy: 50,
        r: 10,
      };
      const outsideCircle: Entity = {
        id: "outside-1",
        layer: "corte",
        type: "circle",
        cx: 350,
        cy: 50,
        r: 15,
      };

      const assembly = findEnclosedAndConnectedAssembly(
        [plate, hole1, hole2, outsideCircle],
        [plate],
      );
      const ids = assembly.map((e) => e.id);
      assert.ok(ids.includes("plate-1"), "Deve conter a chapa principal");
      assert.ok(ids.includes("hole-1"), "Deve incluir automaticamente o furo interno 1");
      assert.ok(ids.includes("hole-2"), "Deve incluir automaticamente o furo interno 2");
      assert.ok(!ids.includes("outside-1"), "Não deve incluir geometria externa desconectada");
    });

    it("executa Auto-Trim analítico em Array Polar de círculos que cruzam a borda de um círculo base", () => {
      const baseCircle: Entity = {
        id: "base-flange",
        layer: "corte",
        type: "circle",
        cx: 0,
        cy: 0,
        r: 100,
      };
      // Círculo posicionado na borda (r=100) que cruza o contorno do círculo base
      const toothCircle: Entity = {
        id: "notch-0",
        layer: "corte",
        type: "circle",
        cx: 100,
        cy: 0,
        r: 20,
      };

      const allEntities: Entity[] = [baseCircle, toothCircle];
      const host = detectHostPart(allEntities, [toothCircle], { x: 0, y: 0 });
      const spec: ArraySpec = {
        id: "polar-trim-test",
        type: "polar",
        sourceEntityIds: [toothCircle.id],
        polar: {
          center: { x: 0, y: 0 },
          radius: 100,
          startAngleDeg: 0,
          count: 4,
          totalAngleDeg: 360,
          direction: "ccw",
          rotateItems: true,
          autoTrim: true,
        },
      };

      const { instances } = computeInstances(spec, [toothCircle], host);
      assert.equal(instances.length, 3, "Deve gerar 3 cópias adicionais para totalizar 4");

      const trimResult = applyArrayAutoTrim(allEntities, instances, [toothCircle]);
      assert.ok(trimResult.trimmedCount > 0, "Deve detectar e aparar interseções reais");
      const arcs = trimResult.entities.filter((e) => e.type === "arc");
      assert.ok(
        arcs.length >= 4,
        "Os círculos sobrepostos e o contorno base devem ser aparados em arcos limpos",
      );
    });
  });

  describe("Seção 3 / Teste 3: DATUM Persistente nos Dois Catetos (ΔX, ΔY) e Conversão Direta em LINE", () => {
    it("cria Datum Persistente com métricas exatas nos dois catetos (ΔX, ΔY) e hipotenusa (L, ∠)", () => {
      const datumEnt = createPersistentDatumEntity(
        { x: 10, y: 20 },
        { x: 40, y: 60 },
        "corte",
      );
      const spec = getPersistentDatumSpec(datumEnt);
      assert.ok(spec, "Deve conter PersistentDatumSpec válido");

      const metrics = computePersistentDatumMetrics(spec);
      assert.equal(metrics.dx, 30);
      assert.equal(metrics.dy, 40);
      assert.equal(metrics.L, 50);
      assert.deepEqual(metrics.cornerX, { x: 40, y: 20 });
    });

    it("atualiza o ponto alvo B ao editar ΔX, ΔY, L ou ∠ e gera entidades LINE reais para cada cateto", () => {
      const datumEnt = createPersistentDatumEntity(
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        "corte",
      );
      const spec = getPersistentDatumSpec(datumEnt)!;

      const updatedDx = updatePersistentDatumTargetByComponent(spec, "dx", 80);
      assert.equal(updatedDx.target.x, 80);
      assert.equal(updatedDx.target.y, 40);

      const lineDx = convertDatumToCadLines(spec, "dx", "corte");
      assert.equal(lineDx.length, 1);
      assert.equal(lineDx[0]!.x1, 0);
      assert.equal(lineDx[0]!.y1, 0);
      assert.equal(lineDx[0]!.x2, 30);
      assert.equal(lineDx[0]!.y2, 0);

      const lineDy = convertDatumToCadLines(spec, "dy", "corte");
      assert.equal(lineDy.length, 1);
      assert.equal(lineDy[0]!.x1, 30);
      assert.equal(lineDy[0]!.y1, 0);
      assert.equal(lineDy[0]!.x2, 30);
      assert.equal(lineDy[0]!.y2, 40);

      const bothLegs = convertDatumToCadLines(spec, "both_legs", "corte");
      assert.equal(bothLegs.length, 2, "Deve criar simultaneamente os 2 catetos ortogonais em esquadro");
    });
  });

  describe("Seção 4 / Teste 4: MARCO GEOMÉTRICO Associativo e Divisor Relacional ÷N", () => {
    it("Modo 1 (1 Toque): cria Marco Geométrico associativo que acompanha o movimento da entidade pai", () => {
      const circle: Entity = {
        id: "c-parent",
        layer: "corte",
        type: "circle",
        cx: 50,
        cy: 50,
        r: 25,
      };
      const mark = inferAssociativeMarkFromPoint(
        { x: 50, y: 50 },
        [circle],
        "corte",
        null,
        15,
      );
      const spec = getGeometricMarkSpec(mark);
      assert.ok(spec);
      assert.equal(spec.parentEntityId, "c-parent");
      assert.equal(spec.referenceType, "center");

      // Move o círculo pai para (120, 180)
      const movedCircle: Entity = { ...circle, cx: 120, cy: 180 };
      const synced = syncAssociativeGeometricMarks([movedCircle, mark]);
      const syncedMark = synced.find((e) => e.id === mark.id);
      assert.ok(syncedMark && syncedMark.type === "point");
      assert.equal(syncedMark.x, 120);
      assert.equal(syncedMark.y, 180);
    });

    it("Modo 2 (2 Toques): sintetiza Ponto Médio, Interseção Virtual Projetada e Divisão de Vão ÷4", () => {
      const lineA: Entity = {
        id: "l-a",
        layer: "corte",
        type: "line",
        x1: 0,
        y1: 0,
        x2: 40,
        y2: 0,
      };
      const lineB: Entity = {
        id: "l-b",
        layer: "corte",
        type: "line",
        x1: 100,
        y1: 50,
        x2: 100,
        y2: 20,
      };

      // Interseção virtual projetada entre lineA (y=0) e lineB (x=100) => (100, 0)
      const vIntMarks = buildRelationalGeometricMarks(
        { x: 40, y: 0 },
        { x: 100, y: 20 },
        lineA,
        lineB,
        "virtual_intersection",
        "corte",
      );
      assert.equal(vIntMarks.length, 1);
      assert.equal(vIntMarks[0]!.x, 100);
      assert.equal(vIntMarks[0]!.y, 0);

      // Divisão de vão de 100 mm em ÷4 partes iguais => 3 Marcos Geométricos internos (25, 50, 75)
      const divMarks = buildRelationalGeometricMarks(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        lineA,
        lineB,
        "span_division",
        "corte",
        4,
      );
      assert.equal(divMarks.length, 3);
      assert.deepEqual(
        divMarks.map((m) => ({ x: m.x, y: m.y })),
        [
          { x: 25, y: 0 },
          { x: 50, y: 0 },
          { x: 75, y: 0 },
        ],
      );
    });
  });

  describe("Seção 6 / Teste 6: Lupa Sincronizada com SnapResult Centralizado", () => {
    it("produz SnapResult unificado para Marco Geométrico e limpa quando não há SNAP", () => {
      const mark = inferAssociativeMarkFromPoint(
        { x: 80, y: 90 },
        [],
        "corte",
        null,
        10,
      );
      const view = { k: 2, tx: 100, ty: 50 };
      const smart = findSmartSnap({ x: 81, y: 90.5 }, [mark], 10);
      assert.ok(smart, "O motor central de SNAP deve capturar o Marco Geométrico");
      assert.equal(smart.kind, "geometric_mark");

      const snapResult = buildUnifiedSnapResult({ x: 81, y: 90.5 }, smart, null, view);
      assert.equal(snapResult.valid, true);
      assert.equal(snapResult.type, "geometric_mark");
      assert.deepEqual(snapResult.worldPoint, { x: 80, y: 90 });
      assert.deepEqual(snapResult.screenPoint, { x: 80 * 2 + 100, y: 90 * 2 + 50 });

      const emptyResult = buildUnifiedSnapResult({ x: 300, y: 400 }, null, null, view);
      assert.equal(emptyResult.valid, false);
      assert.equal(emptyResult.type, "none");
      assert.deepEqual(emptyResult.worldPoint, { x: 300, y: 400 });
    });
  });

  describe("Correção Mobile: Proibição de Marcos 'ÓRFÃO' no Vazio e Restauração da Mira 55px", () => {
    it("inferValidGeometricMarkCandidate retorna null no espaço vazio (nunca cria marco ÓRFÃO) e captura apenas entidades reais", () => {
      const circle: Entity = {
        id: "hole-main",
        layer: "corte",
        type: "circle",
        cx: 100,
        cy: 100,
        r: 20,
      };

      // Toque no espaço vazio longe da geometria -> deve retornar null (proibido criar "ÓRFÃO")
      const emptyTap = inferValidGeometricMarkCandidate(
        { x: 400, y: 400 },
        [circle],
        "corte",
        null,
        15,
      );
      assert.equal(emptyTap, null, "Toque no fundo vazio do canvas não deve gerar nenhum marco");

      // Toque com Mira 55px sobre o centro real do círculo -> deve retornar candidato válido não-órfão
      const centerTap = inferValidGeometricMarkCandidate(
        { x: 101, y: 99.5 },
        [circle],
        "corte",
        null,
        15,
      );
      assert.ok(centerTap, "Deve capturar o centro real do círculo");
      const spec = getGeometricMarkSpec(centerTap);
      assert.ok(spec);
      assert.equal(Boolean(spec.isOrphan), false);
      assert.equal(spec.parentEntityId, "hole-main");
      assert.equal(spec.referenceType, "center");
    });

    it("clearGeometricMarksFromEntities limpa marcos geométricos existentes em 1 clique", () => {
      const circle: Entity = {
        id: "hole-1",
        layer: "corte",
        type: "circle",
        cx: 50,
        cy: 50,
        r: 10,
      };
      const validMark = inferValidGeometricMarkCandidate(
        { x: 50, y: 50 },
        [circle],
        "corte",
        null,
        12,
      )!;
      const res = clearGeometricMarksFromEntities([circle, validMark], false);
      assert.equal(res.removedCount, 1);
      assert.equal(res.cleaned.length, 1);
      assert.equal(res.cleaned[0]!.id, "hole-1");
    });

    it("Mira 55px desloca a coordenada da mira exatamente 55px acima do dedo (touchY - 55)", () => {
      assert.equal(TOUCH_CURSOR_OFFSET_PX, 55);
      const res = computeTouchCursorScreenAndWorld({
        clientX: 200,
        clientY: 300,
        pointerType: "touch",
        canvasRect: { left: 0, top: 0 },
        panX: 0,
        panY: 0,
        zoom: 1,
        offsetEnabled: true,
      });
      assert.equal(res.offsetY, -55);
      assert.equal(res.cursorScreenX, 200);
      assert.equal(res.cursorScreenY, 245);
      assert.equal(res.cursorWorldX, 200);
      assert.equal(res.cursorWorldY, 245);
    });
  });

  describe("Estabilidade de HitTest (closestOnSegment) e Telemetria Fluid Aurora", () => {
    it("closestOnSegment aceita tanto tupla [a, b] quanto objeto { a, b } sem lançar TypeError: s is not iterable", () => {
      const p = { x: 50, y: 15 };
      const fromTuple = closestOnSegment(p, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);
      const fromObject = closestOnSegment(p, {
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
      });
      assert.deepEqual(fromTuple, { x: 50, y: 0 });
      assert.deepEqual(fromObject, { x: 50, y: 0 });
    });

    it("expõe telemetria de cache Offscreen High-DPI para Fluid Aurora e Sprites LUT com 0 regressões", () => {
      const silkStats = getSilkBackgroundCacheStats();
      assert.equal(typeof silkStats.hitRatePercent, "number");
      assert.ok(silkStats.hitRatePercent >= 0 && silkStats.hitRatePercent <= 100);

      const auroraTelemetry = getAuroraEngineTelemetry();
      assert.equal(typeof auroraTelemetry.spriteCacheSize, "number");
      assert.equal(auroraTelemetry.autonomousOrbCount, 7);
      assert.ok(auroraTelemetry.hitRatePercent >= 0 && auroraTelemetry.hitRatePercent <= 100);
    });

    it("implementa a Calibração Fina do COSMOS RADIAL (High-Energy 6-Stops 0.96, velocidades meio-termo, +85% impulso dominante, scale 0.78->2.25, opacity 0.38->0.78) e preserva ORBES VIVOS", () => {
      assert.equal(AUTONOMOUS_COLOR_ORBS.length, 7);
      assert.deepEqual(
        AUTONOMOUS_COLOR_ORBS.map((o) => o.primaryHex),
        ["#E11D48", "#EC4899", "#3B82F6", "#10B981", "#F59E0B", "#A855F7", "#06B6D4"],
      );
      assert.deepEqual(
        AUTONOMOUS_COLOR_ORBS.map((o) => o.baseSpeedX),
        [0.058, 0.074, 0.048, 0.082, 0.052, 0.067, 0.043],
      );
      assert.deepEqual(
        AUTONOMOUS_COLOR_ORBS.map((o) => o.baseSpeedY),
        [0.049, 0.063, 0.056, 0.068, 0.044, 0.076, 0.051],
      );
      assert.deepEqual(
        AUTONOMOUS_COLOR_ORBS.map((o) => o.colorSpeed),
        [0.062, 0.062, 0.062, 0.062, 0.062, 0.062, 0.062],
      );

      // Curva High-Energy de 6 paradas do COSMOS RADIAL: 0% (0.96), 18% (0.82), 36% (0.56), 58% (0.28), 78% (0.09), 100% (0.00)
      assert.deepEqual(COSMOS_RADIAL_6_STOPS, [
        [0.0, 0.96],
        [0.18, 0.82],
        [0.36, 0.56],
        [0.58, 0.28],
        [0.78, 0.09],
        [1.0, 0.0],
      ]);
      assert.equal(RADIAL_CORE_5_STOPS.length, 5);
      assert.equal(LIQUID_SILK_10_STOPS.length, 10);

      // Interpolação RGB linear suave (lerpRGB)
      assert.deepEqual(lerpRGB([225, 29, 72], [236, 72, 153], 0), [225, 29, 72]);
      assert.deepEqual(lerpRGB([225, 29, 72], [236, 72, 153], 1), [236, 72, 153]);

      // COSMOS RADIAL ("suave"): Acumulador de fase incremental (dt <= 0.033s) + impulso de +85% na massa dominante
      const cosmosOrb = createInitialOrbRuntimeState(AUTONOMOUS_COLOR_ORBS[0]!, "suave");
      assert.equal(cosmosOrb.dominance, 1);
      assert.equal(Number(cosmosOrb.scale.toFixed(2)), 2.25);
      assert.equal(Number(cosmosOrb.opacity.toFixed(2)), 0.78);
      assert.equal(Number(cosmosOrb.currentSpeedX.toFixed(5)), Number((0.058 * 1.85).toFixed(5)));
      assert.equal(Number(cosmosOrb.currentSpeedY.toFixed(5)), Number((0.049 * 1.85).toFixed(5)));

      const prevPhaseX = cosmosOrb.phaseX;
      stepOrbRuntimeState(cosmosOrb, 0.016, "suave");
      assert.ok(cosmosOrb.phaseX > prevPhaseX, "Acumulador de fase deve avançar suavemente com dt");

      // Verifica extremos de dominância no COSMOS RADIAL: Secundária (dominance = 0 -> scale 0.78, opacity 0.38)
      // e Prioritária Máxima (dominance = 1 -> scale 2.25, opacity 0.78)
      const statesAtT0 = AUTONOMOUS_COLOR_ORBS.map((orb) =>
        computeOrbOpticalHierarchyState(orb, 0, "suave"),
      );
      const maxDomState = statesAtT0[0]!;
      assert.equal(maxDomState.dominance, 1);
      assert.equal(maxDomState.scale, 2.25);
      assert.equal(maxDomState.opacity, 0.78);

      const secondaryStates = statesAtT0.filter((s) => s.dominance === 0);
      assert.ok(secondaryStates.length >= 3);
      for (const s of secondaryStates) {
        assert.equal(s.scale, 0.78);
        assert.equal(s.opacity, 0.38);
      }

      // Verifica preservação do modo ORBES VIVOS ("fluido"): scale 0.72 -> 2.25, opacity 0.22 -> 0.56
      const orbesVivosMax = computeOrbOpticalHierarchyState(AUTONOMOUS_COLOR_ORBS[0]!, 0, "fluido");
      assert.equal(orbesVivosMax.scale, 2.25);
      assert.equal(orbesVivosMax.opacity, 0.56);
    });
  });
});

