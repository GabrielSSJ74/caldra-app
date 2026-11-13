/**
 * PROTOCOLO DE VERIFICAÇÃO — CURVA DE GOMOS (2D / 3D / PARÂMETROS)
 * Executa via node:test (npx --yes tsx --test src/lib/viz3d/curvaDeGomosRedesign.test.ts)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldMeaning } from "../education/learn";
import { getEngine } from "../geometry/engines";
import { EDGE_MODES } from "./cameraPresets";
import { buildViews } from "./views";
import { filterEdgesForMode } from "./visibility";
import { buildWire } from "./wire";

describe("Protocolo de Verificação — Curva de Gomos (Regiões A-E, 2D Sem Grid e 3D CHAMFER)", () => {
  it("Teste A: Parâmetros de referência (ØD=300, R=450, α=90°, n=4, Divisões=12) e descrições técnicas", () => {
    const engine = getEngine("curva-de-gomos");
    assert.ok(engine, "Motor curva-de-gomos deve existir");
    assert.equal(engine.defaults.d, 300);
    assert.equal(engine.defaults.r, 450);
    assert.equal(engine.defaults.ang, 90);
    assert.equal(engine.defaults.gomos, 4);
    assert.equal(engine.defaults.divisions, 12);

    const wireParams = engine.wire(engine.defaults);
    assert.equal(wireParams.d2, 300);
    assert.equal(wireParams.d1, 450);
    assert.equal(wireParams.ang, 90);
    assert.equal(wireParams.n, 4);
    assert.equal(wireParams.divisions, 12);

    assert.equal(
      fieldMeaning("d"),
      "Diâmetro da seção circular, medido de fora a fora na linha média da chapa.",
    );
    assert.equal(fieldMeaning("r"), "Raio de curvatura medido na linha de centro do tubo.");
    assert.equal(fieldMeaning("ang"), "Ângulo total de deflexão da curva.");
    assert.equal(fieldMeaning("gomos"), "Quantidade de segmentos que compõem a curva.");
  });

  it("Teste B: Projeção Técnica 2D de fonte única reage a n=4 vs n=6 e Divisões=12 vs 24", () => {
    const engine = getEngine("curva-de-gomos")!;
    const v4 = buildViews("curva-de-gomos", engine.wire({ d: 300, r: 450, ang: 90, gomos: 4, divisions: 12 }));
    const joints4 = v4.front.filter((p) => p.role === "joint");
    assert.equal(joints4.length, 4, "Deve haver exatamente 4 planos de solda oblíquos para n=4");

    const v6 = buildViews("curva-de-gomos", engine.wire({ d: 300, r: 450, ang: 90, gomos: 6, divisions: 24 }));
    const joints6 = v6.front.filter((p) => p.role === "joint");
    assert.equal(joints6.length, 6, "Deve haver exatamente 6 planos de solda oblíquos para n=6");

    const outerCircle = v4.plan.find((p) => p.k === "circle" && p.role === "outer");
    const innerCircle = v4.plan.find((p) => p.k === "circle" && p.role === "inner-circle");
    assert.ok(outerCircle && outerCircle.k === "circle" && outerCircle.r === 150);
    assert.ok(innerCircle && innerCircle.k === "circle" && innerCircle.dash === true);
  });

  it("Teste C: Modos 3D (SOMB intacto, SOMB+AR B-Rep, ARAME B-Rep sem diagonais e SOLID)", () => {
    assert.deepEqual(
      EDGE_MODES.map((m) => m.label),
      ["SOMB", "SOMB+AR", "ARAME", "SOLID"],
    );

    const model12 = buildWire("curva-de-gomos", {
      d1: 450,
      d2: 300,
      h: 450,
      ang: 90,
      n: 4,
      divisions: 12,
    });
    const somb = filterEdgesForMode(model12.edges, model12.edgeKinds, model12.edgeTags, "shaded");
    assert.equal(somb.edges.length, 0, "Modo SOMB filtra arestas internas mantendo o comportamento original");

    const sombAr = filterEdgesForMode(
      model12.edges,
      model12.edgeKinds,
      model12.edgeTags,
      "shaded-edges",
    );
    assert.ok(sombAr.edges.length > 0);
    assert.equal(
      sombAr.kinds.includes("TRIANGULATION_INTERNAL"),
      false,
      "Modo SOMB+AR não contém diagonais de triangulação",
    );

    const arame = filterEdgesForMode(
      model12.edges,
      model12.edgeKinds,
      model12.edgeTags,
      "wireframe",
    );
    assert.ok(arame.edges.length > 0);
    assert.equal(
      arame.kinds.includes("TRIANGULATION_INTERNAL"),
      false,
      "Modo ARAME Técnico B-Rep não contém diagonais de triangulação",
    );
    assert.equal(arame.kinds.includes("JOINT"), true, "Modo ARAME inclui anéis de solda dos gomos");
    assert.equal(
      arame.kinds.includes("TRANSITION_GENERATOR"),
      true,
      "Modo ARAME inclui geratrizes longitudinais",
    );

    const solid = filterEdgesForMode(model12.edges, model12.edgeKinds, model12.edgeTags, "solid");
    assert.equal(
      solid.kinds.includes("TRANSITION_GENERATOR"),
      false,
      "Modo SOLID não sobrepõe linhas de geratrizes artificiais",
    );
  });
});
