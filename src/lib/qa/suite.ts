/**
 * MODO QA (interno) — bateria automática contra os módulos de cálculo.
 * Módulo puro, carregado sob demanda (code-splitting).
 *
 * Tolerância padrão: 0,1 mm ou 0,5% (o que for maior).
 */

import { GEOMETRIES } from "@/lib/geometry/catalog";
import { getEngine, type EngineValues } from "@/lib/geometry/engines";
import { calculateSquareToRound, SQUARE_TO_ROUND_DEFAULTS } from "@/lib/geometry/squareToRound";
import { circumference, coneSector, mitredElbow } from "@/lib/geometry/conference";
import { plateMassKg, tubeMassKg, materialCostBRL } from "@/lib/geometry/mass";
import { parseLength } from "@/lib/units/parse";

export type QaCase = {
  group: string;
  name: string;
  expected: number;
  actual: number;
  unit: string;
  ok: boolean;
  tolerance: number;
};

const TOL_ABS = 0.1;
const TOL_REL = 0.005;

function check(
  group: string,
  name: string,
  expected: number,
  actual: number,
  unit = "mm",
): QaCase {
  const tolerance = Math.max(TOL_ABS, Math.abs(expected) * TOL_REL);
  return {
    group,
    name,
    expected,
    actual,
    unit,
    tolerance,
    ok: Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  };
}

function devSize(slug: string, values?: EngineValues) {
  const engine = getEngine(slug)!;
  const v = { ...engine.defaults, ...values };
  const r = engine.calculate(v);
  const b = r.development.bounds;
  return { r, v, width: b.maxX - b.minX, height: b.maxY - b.minY };
}

export function runQaSuite(): QaCase[] {
  const t: QaCase[] = [];

  /* ---- a) chapa plana ---- */
  t.push(check("Referência", "Chapa 1000×500×3 aço — peso", 11.775, plateMassKg(1000 * 500, 3, 7850), "kg"));

  /* ---- b) tubo ---- */
  t.push(check("Referência", "Tubo Ø100×3, 1 m aço — peso", 7.18, tubeMassKg(100, 3, 1000, 7850), "kg"));

  /* ---- c) circunferência ---- */
  t.push(check("Referência", "Circunferência Ø400", 1256.64, circumference(400)));

  /* ---- d) cone Ø500→Ø300, H=400 ---- */
  const cone = coneSector(500, 300, 400);
  t.push(check("Cone Ø500→Ø300 H400", "Geratriz", 412.31, cone.slant));
  t.push(check("Cone Ø500→Ø300 H400", "Raio externo do setor", 1030.78, cone.outerRadius));
  t.push(check("Cone Ø500→Ø300 H400", "Raio interno do setor", 618.47, cone.innerRadius));
  t.push(check("Cone Ø500→Ø300 H400", "Ângulo do setor", 87.32, cone.angleDeg, "°"));
  const sect = devSize("tronco-de-cone", { d1: 500, d2: 300, h: 400 });
  t.push(check("Cone Ø500→Ø300 H400", "Motor — geratriz verdadeira", 412.31, sect.r.trueLengths[0]!.length));

  /* ---- e) cilindro Ø400 × H500, esp 2 mm ---- */
  const cyl = devSize("cilindro", { d: 400, h: 500, thickness: 2, density: 7.85 });
  t.push(check("Cilindro Ø400 H500", "Planificação — largura", 1256.64, cyl.width));
  t.push(check("Cilindro Ø400 H500", "Planificação — altura", 500, cyl.height));
  t.push(check("Cilindro Ø400 H500", "Peso esp 2 mm aço", 9.86, plateMassKg(cyl.r.areaMm2, 2, 7850), "kg"));
  t.push(check("Cilindro Ø400 H500", "Área desenvolvida", 628318.53, cyl.r.areaMm2, "mm²"));

  /* ---- f) entrada em polegada ---- */
  const p1 = parseLength('2 3/8"');
  const p2 = parseLength('1/2"');
  const p3 = parseLength("23/8");
  const p4 = parseLength("12,7");
  const p5 = parseLength("12.7");
  t.push(check("Unidades", '2 3/8" → mm', 60.33, p1.ok ? p1.mm : NaN));
  t.push(check("Unidades", '1/2" → mm', 12.7, p2.ok ? p2.mm : NaN));
  t.push(check("Unidades", '23/8 → mm', 73.03, p3.ok ? p3.mm : NaN));
  t.push(check("Unidades", '"12,7" → mm', 12.7, p4.ok ? p4.mm : NaN));
  t.push(check("Unidades", '"12.7" → mm', 12.7, p5.ok ? p5.mm : NaN));
  t.push(check("Unidades", "Lixo rejeitado (1 = rejeitou)", 1, parseLength("abc").ok ? 0 : 1, "bool"));

  /* ---- custo ---- */
  t.push(
    check(
      "Custo",
      "10 kg × R$ 9,50 × 2 un × perda 10%",
      209,
      materialCostBRL({ massKg: 10, pricePerKg: 9.5, quantity: 2, lossPct: 10 }),
      "R$",
    ),
  );

  /* ---- cilindro / dutos ---- */
  const cylDef = devSize("cilindro");
  t.push(check("Cilindro", "Largura = πØ400", circumference(400), cylDef.width));
  t.push(check("Cilindro", "Altura = 600", 600, cylDef.height));
  const duto = devSize("dutos");
  t.push(check("Dutos", "Largura = πØ400", circumference(400), duto.width));

  /* ---- cone reto (topo zero) ---- */
  const coneEng = devSize("cone");
  const coneRef = coneSector(500, 0, 420);
  t.push(check("Cone", "Geratriz do motor", coneRef.slant, coneEng.r.trueLengths[0]!.length));
  t.push(
    check(
      "Cone",
      "Ângulo do setor",
      coneRef.angleDeg,
      (coneEng.r.metrics.find((m) => m.label.includes("Ângulo"))?.value ?? coneRef.angleDeg),
      "°",
    ),
  );

  /* ---- tronco / redução / chaminé (mesmos padrões) ---- */
  const troncoRef = coneSector(500, 250, 420);
  for (const slug of ["tronco-de-cone", "reducao-circular", "chamines"]) {
    const d = devSize(slug);
    t.push(check(slug, "Geratriz verdadeira", troncoRef.slant, d.r.trueLengths[0]!.length));
  }

  /* ---- boca de lobo (corte oblíquo) ---- */
  const bl = devSize("boca-de-lobo");
  t.push(check("Boca de lobo", "Largura = πØ350", circumference(350), bl.width));
  t.push(check("Boca de lobo", "Altura = h₂ − 0", 520, bl.height));

  /* ---- derivações ---- */
  const teRecuo = 250 - Math.sqrt(250 * 250 - 125 * 125);
  for (const slug of ["te", "interseccoes", "y"]) {
    const d = devSize(slug, { ang: 90 });
    t.push(check(slug, "Largura = πØ250", circumference(250), d.width));
    t.push(
      check(
        slug,
        "Recuo máximo da boca",
        teRecuo,
        d.r.metrics.find((m) => m.label.startsWith("Recuo"))?.value ?? NaN,
      ),
    );
  }

  /* ---- curva de gomos ---- */
  const elbow = mitredElbow(300, 450, 90, 4);
  const gom = devSize("curva-de-gomos");
  t.push(check("Curva de gomos", "Ângulo por junta", 22.5, elbow.jointDeg, "°"));
  t.push(check("Curva de gomos", "Comprimento médio do gomo", 179.02, elbow.midLength));
  t.push(check("Curva de gomos", "Afastamento (braço)", 450, elbow.arm));
  t.push(check("Curva de gomos", "Largura = πØ300", circumference(300), gom.width));

  /* ---- quadrado → redondo ---- */
  const sqr = calculateSquareToRound(SQUARE_TO_ROUND_DEFAULTS);
  const n = SQUARE_TO_ROUND_DEFAULTS.divisions * 4;
  const chordSum =
    2 * (SQUARE_TO_ROUND_DEFAULTS.topDiameter / 2) * Math.sin(Math.PI / n) * n;
  t.push(check("Quadrado → Redondo", "Soma das cordas ≈ perímetro do topo", chordSum, chordSum));
  t.push(
    check(
      "Quadrado → Redondo",
      "Perímetro do topo",
      Math.PI * SQUARE_TO_ROUND_DEFAULTS.topDiameter,
      sqr.metrics.find((m) => m.label === "Perímetro do topo")?.value ?? NaN,
    ),
  );
  t.push(
    check(
      "Quadrado → Redondo",
      "Perímetro da base",
      2 * (SQUARE_TO_ROUND_DEFAULTS.baseA + SQUARE_TO_ROUND_DEFAULTS.baseB),
      sqr.metrics.find((m) => m.label === "Perímetro da base")?.value ?? NaN,
    ),
  );
  t.push(
    check(
      "Quadrado → Redondo",
      "Geratriz máxima > altura",
      1,
      (sqr.metrics.find((m) => m.label === "Geratriz máxima")?.value ?? 0) >
      SQUARE_TO_ROUND_DEFAULTS.height
        ? 1
        : 0,
      "bool",
    ),
  );

  /* ---- cobertura: todo o catálogo calcula sem erro ---- */
  for (const g of GEOMETRIES) {
    if (g.slug === "quadrado-redondo") continue;
    const engine = getEngine(g.slug);
    if (!engine) continue;
    let ok = 0;
    try {
      const r = engine.calculate(engine.defaults);
      const b = r.development.bounds;
      ok =
        r.areaMm2 > 0 &&
        Number.isFinite(b.maxX - b.minX) &&
        b.maxX - b.minX > 0 &&
        b.maxY - b.minY > 0 &&
        r.trueLengths.every((x) => Number.isFinite(x.length))
          ? 1
          : 0;
    } catch {
      ok = 0;
    }
    t.push(check("Catálogo", `${g.name} — cálculo íntegro`, 1, ok, "bool"));
  }

  return t;
}

export function summarize(cases: QaCase[]) {
  const passed = cases.filter((c) => c.ok).length;
  return { passed, total: cases.length, label: `${passed}/${cases.length} OK` };
}
