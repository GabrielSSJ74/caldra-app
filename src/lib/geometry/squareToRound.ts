/**
 * TRANSIÇÃO QUADRADO → REDONDO
 * Método: triangulação (radial line / triangulation development).
 *
 * Modelo geométrico
 * -----------------
 * Base retangular A × B no plano z = 0, centrada na origem.
 * Topo circular de diâmetro D no plano z = H, centro deslocado (ox, oy).
 *
 * A superfície é composta por:
 *  - 4 triângulos planos (um por lado da base), e
 *  - 4 setores cônicos oblíquos, cada um com ápice em um vértice da base
 *    e diretriz em um quarto da circunferência do topo.
 *
 * Cada setor cônico é aproximado por `n` triângulos (prática padrão de
 * caldeiraria). O desenvolvimento é obtido encadeando os triângulos no plano
 * preservando os comprimentos verdadeiros das arestas em 3D.
 *
 * Todas as unidades internas são milímetros.
 */

import type {
  CalcStep,
  DevelopmentPattern,
  GeometryResult,
  Segment2,
  ValidationIssue,
  Vec2,
  Vec3,
} from "./types";

export type SquareToRoundInput = {
  /** Lado A da base (mm) — eixo X. */
  baseA: number;
  /** Lado B da base (mm) — eixo Y. */
  baseB: number;
  /** Diâmetro do topo (mm). */
  topDiameter: number;
  /** Altura vertical entre planos (mm). */
  height: number;
  /** Excentricidade do topo em X (mm). */
  offsetX: number;
  /** Excentricidade do topo em Y (mm). */
  offsetY: number;
  /** Divisões por quadrante do círculo (12 = 48 no total). */
  divisions: number;
  /** Espessura da chapa (mm). */
  thickness: number;
  /** Densidade do material (kg/dm³). */
  density: number;
};

export const SQUARE_TO_ROUND_DEFAULTS: SquareToRoundInput = {
  baseA: 400,
  baseB: 400,
  topDiameter: 300,
  height: 500,
  offsetX: 0,
  offsetY: 0,
  divisions: 6,
  thickness: 3,
  density: 7.85,
};

export function validateSquareToRound(i: SquareToRoundInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!(i.baseA > 0)) issues.push({ field: "baseA", message: "Lado A deve ser maior que zero." });
  if (!(i.baseB > 0)) issues.push({ field: "baseB", message: "Lado B deve ser maior que zero." });
  if (!(i.topDiameter > 0))
    issues.push({ field: "topDiameter", message: "Diâmetro deve ser maior que zero." });
  if (!(i.height > 0))
    issues.push({ field: "height", message: "Altura deve ser maior que zero." });
  if (!(i.divisions >= 3 && i.divisions <= 24))
    issues.push({ field: "divisions", message: "Use entre 3 e 24 divisões por quadrante." });
  if (!(i.thickness > 0))
    issues.push({ field: "thickness", message: "Espessura deve ser maior que zero." });
  const r = i.topDiameter / 2;
  if (Math.abs(i.offsetX) + r > i.baseA / 2 + r * 2)
    issues.push({ field: "offsetX", message: "Excentricidade em X fora do intervalo utilizável." });
  if (Math.abs(i.offsetY) + r > i.baseB / 2 + r * 2)
    issues.push({ field: "offsetY", message: "Excentricidade em Y fora do intervalo utilizável." });
  return issues;
}

const dist3 = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dist2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Terceiro vértice de um triângulo no plano, conhecidos dois vértices (p, q)
 * e as distâncias verdadeiras até o ponto procurado (dp, dq).
 * `side` define de que lado da reta pq o ponto é posicionado.
 */
function triangulatePoint(p: Vec2, q: Vec2, dp: number, dq: number, side: 1 | -1): Vec2 {
  const d = dist2(p, q);
  if (d === 0) return { x: p.x + dp, y: p.y };
  const a = (dp * dp - dq * dq + d * d) / (2 * d);
  const hSq = dp * dp - a * a;
  const h = hSq > 0 ? Math.sqrt(hSq) : 0;
  const ux = (q.x - p.x) / d;
  const uy = (q.y - p.y) / d;
  const mx = p.x + a * ux;
  const my = p.y + a * uy;
  return { x: mx + side * h * uy, y: my - side * h * ux };
}

export type SquareToRoundModel = {
  corners: Vec3[];
  arcPoints: Vec3[][]; // por quadrante, inclui extremos
  circle: Vec3[]; // todos os pontos do topo, em ordem
};

export function buildModel(i: SquareToRoundInput): SquareToRoundModel {
  const a = i.baseA / 2;
  const b = i.baseB / 2;
  const r = i.topDiameter / 2;
  const corners: Vec3[] = [
    { x: a, y: b, z: 0 },
    { x: -a, y: b, z: 0 },
    { x: -a, y: -b, z: 0 },
    { x: a, y: -b, z: 0 },
  ];
  const arcPoints: Vec3[][] = [];
  const circle: Vec3[] = [];
  for (let k = 0; k < 4; k++) {
    const start = (k * Math.PI) / 2;
    const quadrant: Vec3[] = [];
    for (let j = 0; j <= i.divisions; j++) {
      const t = start + ((Math.PI / 2) * j) / i.divisions;
      const p = {
        x: i.offsetX + r * Math.cos(t),
        y: i.offsetY + r * Math.sin(t),
        z: i.height,
      };
      quadrant.push(p);
      if (j < i.divisions) circle.push(p);
    }
    arcPoints.push(quadrant);
  }
  return { corners, arcPoints, circle };
}

function polygonArea(points: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export function calculateSquareToRound(input: SquareToRoundInput): GeometryResult {
  const issues = validateSquareToRound(input);
  if (issues.length) throw new Error(issues[0]!.message);

  const model = buildModel(input);
  const { corners, arcPoints } = model;
  const n = input.divisions;

  // ---- desenvolvimento por encadeamento de triângulos ----
  const outlineTop: Vec2[] = [];
  const outlineBottom: Vec2[] = [];
  const foldLines: Segment2[] = [];
  const trueLengths: { id: string; length: number }[] = [];

  // Costura no vértice 0. Primeiro ponto da base na origem.
  let cornerPos: Vec2 = { x: 0, y: 0 };
  const firstArc = arcPoints[0]![0]!;
  const l0 = dist3(corners[0]!, firstArc);
  let arcPos: Vec2 = { x: 0, y: l0 };
  outlineBottom.push(cornerPos);
  outlineTop.push(arcPos);
  trueLengths.push({ id: "V0-P0", length: l0 });
  foldLines.push({ a: cornerPos, b: arcPos });

  for (let k = 0; k < 4; k++) {
    const corner3 = corners[k]!;
    const quad = arcPoints[k]!;
    // setor cônico: leque em torno do vértice k
    for (let j = 0; j < n; j++) {
      const chord = dist3(quad[j]!, quad[j + 1]!);
      const nextLen = dist3(corner3, quad[j + 1]!);
      const next = triangulatePoint(arcPos, cornerPos, chord, nextLen, 1);
      outlineTop.push(next);
      foldLines.push({ a: cornerPos, b: next });
      trueLengths.push({ id: `V${k}-P${k * n + j + 1}`, length: nextLen });
      arcPos = next;
    }
    // triângulo plano até o próximo vértice da base
    const nextCorner3 = corners[(k + 1) % 4]!;
    const baseEdge = dist3(corner3, nextCorner3);
    const diag = dist3(nextCorner3, quad[n]!);
    const nextCorner = triangulatePoint(cornerPos, arcPos, baseEdge, diag, -1);
    outlineBottom.push(nextCorner);
    foldLines.push({ a: nextCorner, b: arcPos });
    cornerPos = nextCorner;
  }

  const outline: Vec2[] = [...outlineTop, ...outlineBottom.slice().reverse()];

  const minX = Math.min(...outline.map((p) => p.x));
  const maxX = Math.max(...outline.map((p) => p.x));
  const minY = Math.min(...outline.map((p) => p.y));
  const maxY = Math.max(...outline.map((p) => p.y));

  const development: DevelopmentPattern = {
    outline,
    foldLines,
    points: outlineBottom.map((p, idx) => ({ id: `V${idx}`, p })),
    bounds: { minX, minY, maxX, maxY },
  };

  const areaMm2 = polygonArea(outline);
  const volumeDm3 = (areaMm2 * input.thickness) / 1_000_000;
  const massKg = volumeDm3 * input.density;

  const topPerimeter = Math.PI * input.topDiameter;
  const basePerimeter = 2 * (input.baseA + input.baseB);
  const developedPerimeter = outline.reduce(
    (acc, p, idx) => acc + dist2(p, outline[(idx + 1) % outline.length]!),
    0,
  );

  const metrics = [
    { label: "Perímetro da base", value: basePerimeter, unitMm: true },
    { label: "Perímetro do topo", value: topPerimeter, unitMm: true },
    { label: "Altura vertical", value: input.height, unitMm: true },
    { label: "Geratriz mínima", value: Math.min(...trueLengths.map((t) => t.length)), unitMm: true },
    { label: "Geratriz máxima", value: Math.max(...trueLengths.map((t) => t.length)), unitMm: true },
    { label: "Contorno do desenvolvimento", value: developedPerimeter, unitMm: true },
    { label: "Largura da planificação", value: maxX - minX, unitMm: true },
    { label: "Altura da planificação", value: maxY - minY, unitMm: true },
    { label: "Área desenvolvida", value: areaMm2 / 1_000_000, suffix: "m²" },
    { label: "Massa estimada", value: massKg, suffix: "kg" },
    { label: "Triângulos gerados", value: 4 * (input.divisions + 1), suffix: "un" },
  ];

  const r = input.topDiameter / 2;
  const gMax = Math.max(...trueLengths.map((t) => t.length));
  const steps: CalcStep[] = [
    {
      title: "De onde vem o perímetro do topo?",
      given: `Ø = ${input.topDiameter} mm`,
      formula: "C = π × D",
      substitution: `C = 3,141592 × ${input.topDiameter}`,
      result: `C = ${topPerimeter.toFixed(2)} mm`,
      meaning:
        "É o comprimento real da circunferência superior. No desenvolvimento ela aparece como a soma das cordas dos triângulos — por isso mais divisões aproximam melhor o arco.",
    },
    {
      title: "Como foi calculada a geratriz?",
      given: `Vértice da base (${(input.baseA / 2).toFixed(1)}; ${(input.baseB / 2).toFixed(1)}; 0) e ponto do topo em z = ${input.height} mm`,
      formula: "L = √(Δx² + Δy² + Δz²)",
      substitution: `L = √(Δx² + Δy² + ${input.height}²)`,
      result: `L(máx) = ${gMax.toFixed(2)} mm`,
      meaning:
        "A geratriz é o comprimento verdadeiro no espaço entre o vértice da base e cada ponto da circunferência. A projeção em planta nunca é o valor real: é preciso compor com a altura.",
    },
    {
      title: "Qual é o ponto de referência?",
      given: `Base ${input.baseA} × ${input.baseB} mm centrada na origem; topo Ø${input.topDiameter} com excentricidade (${input.offsetX}; ${input.offsetY}) mm`,
      formula: "P(θ) = (ox + R·cosθ ; oy + R·senθ ; H)",
      substitution: `R = ${r.toFixed(2)} mm, H = ${input.height} mm`,
      result: "Origem no centro da base; costura no vértice V0.",
      meaning:
        "Fixar a origem no centro da base mantém as quatro faces simétricas quando não há excentricidade e torna previsível o traçado na chapa.",
    },
    {
      title: "Qual método de desenvolvimento está sendo utilizado?",
      given: `${input.divisions} divisões por quadrante (${input.divisions * 4} no total)`,
      formula: "Triangulação: superfície = 4 planos + 4 setores cônicos",
      substitution: `Triângulos = 4 × (${input.divisions} + 1) = ${4 * (input.divisions + 1)}`,
      result: "Cada triângulo é rebatido no plano preservando seus três lados verdadeiros.",
      meaning:
        "Como o setor cônico oblíquo não é desenvolvível por rotação simples, a triangulação é o método correto: cada faixa é planificada pelos comprimentos verdadeiros, encadeada a partir da costura.",
    },
    {
      title: "De onde vem a massa?",
      given: `Área = ${(areaMm2 / 1_000_000).toFixed(4)} m², e = ${input.thickness} mm, ρ = ${input.density} kg/dm³`,
      formula: "m = A × e × ρ",
      substitution: `m = ${(areaMm2 / 1_000_000).toFixed(4)} × ${(input.thickness / 1000).toFixed(4)} × ${(input.density * 1000).toFixed(0)}`,
      result: `m = ${massKg.toFixed(2)} kg`,
      meaning:
        "Massa do desenvolvimento planificado, sem descontar recortes nem considerar sobremetal de solda.",
    },
  ];

  return {
    metrics,
    trueLengths,
    development,
    steps,
    areaMm2,
    method: "Triangulação — comprimentos verdadeiros",
    warnings: [
      "O arco do topo é aproximado por cordas. Aumente as divisões para reduzir o erro.",
      "O desenvolvimento é da superfície média; descontos de dobra e espessura não estão aplicados.",
    ],
  };
}
