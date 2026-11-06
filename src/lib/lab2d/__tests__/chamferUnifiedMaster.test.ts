import { describe, it } from "vitest";
import assert from "node:assert/strict";
import type { Entity } from "../types";
import {
  inferAssociativeMarkFromPoint,
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
});
