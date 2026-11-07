/**
 * CALDRA ACADEMIA 3.0 — MOTOR MATEMÁTICO, CURRÍCULO EM 5 TRILHAS,
 * TABELAS NORMATIVAS, GLOSSÁRIO E BUSCA UNIVERSAL.
 */

import { CURRICULUM, ALL_LESSONS, type AcademyModule, type AcademyLesson } from "./curriculum";
import { knowledgeById, formulaById } from "./knowledge";
import { LIBRARY_ITEMS, type LibraryItem } from "@/lib/library/catalog";
import type { AcademyState } from "./progress";

/* =========================================================================
   1. SIMULADORES MATEMÁTICOS E VALORES DOURADOS (PUROS & TESTÁVEIS)
   ========================================================================= */

export function calcNeutralLineVirola(dExtMm: number, thicknessMm: number) {
  const dExt = Math.max(0, Number(dExtMm) || 0);
  const t = Math.max(0, Number(thicknessMm) || 0);
  const dn = Math.max(0, dExt - t);
  const perimeter = Math.PI * dn;
  return {
    dn: Number(dn.toFixed(2)),
    perimeter: Number(perimeter.toFixed(2)),
  };
}

export function calcTruncatedCone(d1Mm: number, d2Mm: number, heightMm: number) {
  const d1 = Math.max(0, Number(d1Mm) || 0);
  const d2 = Math.max(0, Number(d2Mm) || 0);
  const h = Math.max(0, Number(heightMm) || 0);
  const r1 = d1 / 2;
  const r2 = d2 / 2;
  const deltaR = Math.abs(r1 - r2);
  const generatrix = Math.hypot(h, deltaR);
  const sectorAngleDeg = generatrix > 0 ? (180 * Math.abs(d1 - d2)) / generatrix : 0;
  const outerRadius = deltaR > 0 ? (Math.max(r1, r2) * generatrix) / deltaR : generatrix;
  return {
    generatrix: Number(generatrix.toFixed(2)),
    sectorAngleDeg: Number(sectorAngleDeg.toFixed(2)),
    outerRadius: Number(outerRadius.toFixed(2)),
  };
}

export function calcBendAllowance(
  angleDeg: number,
  innerRadiusMm: number,
  kFactor: number,
  thicknessMm: number,
) {
  const theta = Math.max(0, Number(angleDeg) || 0);
  const r = Math.max(0, Number(innerRadiusMm) || 0);
  const k = Math.max(0, Number(kFactor) || 0);
  const t = Math.max(0, Number(thicknessMm) || 0);
  const ba = theta * (Math.PI / 180) * (r + k * t);
  const outsideSetback = Math.tan(((theta / 2) * Math.PI) / 180) * (r + t);
  const bendDeduction = 2 * outsideSetback - ba;
  return {
    ba: Number(ba.toFixed(2)),
    bd: Number(bendDeduction.toFixed(2)),
  };
}

export function calcSquaringDiagonal(widthMm: number, lengthMm: number) {
  const w = Math.max(0, Number(widthMm) || 0);
  const l = Math.max(0, Number(lengthMm) || 0);
  const diagonal = Math.hypot(w, l);
  return {
    diagonal: Number(diagonal.toFixed(2)),
  };
}

export function calcSheetWeight(
  widthMm: number,
  lengthMm: number,
  thicknessMm: number,
  densityGcm3 = 7.85,
) {
  const w = Math.max(0, Number(widthMm) || 0);
  const l = Math.max(0, Number(lengthMm) || 0);
  const t = Math.max(0, Number(thicknessMm) || 0);
  const rho = Math.max(0, Number(densityGcm3) || 7.85);
  const areaM2 = (w * l) / 1_000_000;
  const weightKg = areaM2 * t * rho;
  return {
    areaM2: Number(areaM2.toFixed(2)),
    weightKg: Number(weightKg.toFixed(2)),
  };
}

export function calcTriangulation3D(dxMm: number, dyMm: number, heightMm: number) {
  const dx = Number(dxMm) || 0;
  const dy = Number(dyMm) || 0;
  const h = Number(heightMm) || 0;
  const trueLength = Math.hypot(dx, dy, h);
  return {
    trueLength: Number(trueLength.toFixed(2)),
  };
}

export function calcMiterElbowAngle(totalAngleDeg: number, segmentsCount: number) {
  const total = Math.max(0, Number(totalAngleDeg) || 0);
  const n = Math.max(2, Math.round(Number(segmentsCount) || 2));
  const halfMiter = total / (2 * (n - 1));
  const fullMiter = halfMiter * 2;
  return {
    halfMiter: Number(halfMiter.toFixed(2)),
    fullMiter: Number(fullMiter.toFixed(2)),
  };
}

export function calcArcRadiusFromChord(chordMm: number, sagittaMm: number) {
  const c = Math.max(0, Number(chordMm) || 0);
  const f = Math.max(0.001, Number(sagittaMm) || 0.001);
  const radius = (c * c) / (8 * f) + f / 2;
  return {
    radius: Number(radius.toFixed(2)),
  };
}

/* =========================================================================
   2. AS 5 TRILHAS DE ESPECIALIZAÇÃO TÉCNICA (PRESERVANDO 100% DAS 41 LIÇÕES)
   ========================================================================= */

export interface AcademyTrack {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  accentColor: "amber" | "sky" | "emerald" | "indigo" | "rose";
  moduleIds: string[];
  highlights: string[];
}

export const ACADEMY_TRACKS: AcademyTrack[] = [
  {
    id: "trilha-fundamentos",
    number: "TRILHA 01",
    title: "Fundamentos da Caldeiraria & Leitura Técnica",
    subtitle: "Chão de Fábrica, Geometria e Desenho",
    description:
      "Vocabulário de oficina (traçar, desenvolver, planificar, calandrar), diâmetro externo vs. interno vs. Linha Neutra (Dn = Dext − t), Pitágoras, trigonometria e leitura de vistas e cortes.",
    accentColor: "amber",
    moduleIds: ["fundamentos", "matematica", "desenho-tecnico"],
    highlights: ["Linha Neutra Dn = Dext − t", "Vistas e Cortes", "Pitágoras & Trigonometria"],
  },
  {
    id: "trilha-tracagem",
    number: "TRILHA 02",
    title: "Traçagem Geométrica & Planificação de Superfícies",
    subtitle: "Paralelas, Radiais e Triangulação (VG)",
    description:
      "Domínio dos 3 métodos clássicos: Linhas Paralelas (virolas, bocas inclinadas, curvas de gomos, boca de lobo), Linhas Radiais (cones e troncos) e Triangulação em Verdadeira Grandeza (quadrado para redondo e reduções excêntricas).",
    accentColor: "sky",
    moduleIds: [
      "instrumentos",
      "superficies",
      "cilindros",
      "cones",
      "reducoes",
      "curvas",
      "interseccoes",
    ],
    highlights: ["Linhas Paralelas", "Linhas Radiais", "Triangulação (VG)"],
  },
  {
    id: "trilha-estruturas",
    number: "TRILHA 03",
    title: "Criação de Estruturas Metálicas & Serralheria Industrial",
    subtitle: "Perfis, Meia-Esquadria 45°, Gussets e Esquadro",
    description:
      "Dimensionamento e montagem de metalões, perfis U/I/W e cantoneiras, cortes em meia-esquadria (45°) vs. topo (90°), mãos-francesas (gussets), sapatas de ancoragem, planta/elevação e conferência de esquadro por diagonal.",
    accentColor: "emerald",
    moduleIds: ["planta-elevacao", "fabricacao"],
    highlights: ["Meia-Esquadria 45°", "Mãos-Francesas & Sapatas", "Esquadro √(L² + C²)"],
  },
  {
    id: "trilha-conformacao",
    number: "TRILHA 04",
    title: "Conformação de Chapas, Dobradeira (Fator K) & Corte CNC",
    subtitle: "Desenvolvimento de Dobra, Matriz V e DXF",
    description:
      "Cálculo de Bend Allowance BA = θ·(π/180)·(R + K·t), dedução de dobra, escolha de matriz V (6t a 8t), alívios de canto, compensação de sangria (Kerf) e preparação de camadas CORTE e DOBRA para exportação DXF.",
    accentColor: "rose",
    moduleIds: ["dobras"],
    highlights: ["Fator K & Fibra Neutra", "Abertura de Matriz V", "Camadas CNC / DXF"],
  },
  {
    id: "trilha-tubulacoes",
    number: "TRILHA 05",
    title: "Materiais, Tubulações (NPS/Schedule), Soldagem & Tolerâncias",
    subtitle: "Séries ANSI, Isométricos, Desvios e Controle Térmico",
    description:
      "Propriedades do Aço Carbono (A36/1020), Inox (304/316) e Alumínio, leitura de tabelas NPS e séries Schedule (Sch 10, 40, 80), leitura de isométricos, cálculo de desvios/travessias e controle de contração em solda MIG/TIG/ER.",
    accentColor: "indigo",
    moduleIds: ["tubulacoes", "isometricos", "calculos-tubulacao"],
    highlights: ["NPS & Schedule 40/80", "Isométricos & Take-out", "Soldagem & Contração"],
  },
];

export function computeTrackProgress(track: AcademyTrack, state: AcademyState) {
  const modules = track.moduleIds
    .map((id) => CURRICULUM.find((m) => m.id === id))
    .filter((m): m is AcademyModule => !!m);
  const lessons = modules.flatMap((m) => m.lessons);
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => {
    const m = state.lessons[l.id]?.mastery;
    return m === "dominado" || m === "praticado";
  }).length;
  const inProgressLessons = lessons.filter((l) => state.lessons[l.id]?.mastery === "em-estudo").length;
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const status: "Não iniciada" | "Em andamento" | "Concluída" =
    completedLessons === totalLessons && totalLessons > 0
      ? "Concluída"
      : completedLessons > 0 || inProgressLessons > 0
        ? "Em andamento"
        : "Não iniciada";

  return {
    modules,
    totalModules: modules.length,
    totalLessons,
    completedLessons,
    pct,
    status,
  };
}

/** Calcula as 3 Barras de Proficiência por Domínio na Aba Estudo */
export function computeDomainProficiencies(state: AcademyState) {
  const domains = [
    {
      id: "caldeiraria-tracagem",
      label: "Caldeiraria & Traçagem Geométrica",
      moduleIds: [
        "fundamentos",
        "instrumentos",
        "superficies",
        "cilindros",
        "cones",
        "reducoes",
        "curvas",
        "interseccoes",
      ],
    },
    {
      id: "estruturas-solda",
      label: "Estruturas Metálicas, Perfis & Solda",
      moduleIds: ["tubulacoes", "planta-elevacao", "isometricos", "calculos-tubulacao", "fabricacao"],
    },
    {
      id: "matematica-dobra",
      label: "Matemática Aplicada, Dobra & Normas",
      moduleIds: ["matematica", "desenho-tecnico", "dobras"],
    },
  ];

  return domains.map((d) => {
    const lessons = CURRICULUM.filter((m) => d.moduleIds.includes(m.id)).flatMap((m) => m.lessons);
    const done = lessons.filter((l) => {
      const m = state.lessons[l.id]?.mastery;
      return m === "dominado" || m === "praticado";
    }).length;
    const studying = lessons.filter((l) => state.lessons[l.id]?.mastery === "em-estudo").length;
    const weighted = done + studying * 0.35;
    const pct = lessons.length > 0 ? Math.min(100, Math.round((weighted / lessons.length) * 100)) : 0;
    return {
      id: d.id,
      label: d.label,
      done,
      total: lessons.length,
      pct,
    };
  });
}

/* =========================================================================
   3. FORMULÁRIO DE ENGENHARIA COM MINI-SIMULADORES AO VIVO (ABA 4)
   ========================================================================= */

export type FormulaGroupCategory =
  | "Todas"
  | "Calandragem & Linha Neutra"
  | "Cones & Traçagem"
  | "Dobra & Fator K"
  | "Arcos & Esquadro"
  | "Massa & Pesos";

export interface InteractiveFormulaSpec {
  id: string;
  code: string;
  name: string;
  category: Exclude<FormulaGroupCategory, "Todas">;
  legacyCategoryBadge: string;
  formula: string;
  unit: string;
  description: string;
  application: string;
  exampleSolved: string;
  stepByStep: string[];
  variables: { sym: string; name: string; unit: string }[];
  practicalTool: string;
  toolLabel: string;
  diagram: "cylinder" | "cone" | "transition" | "elbow" | "sheet" | "bend" | "diagonal" | "chord";
  defaultInputs: Record<string, number>;
  inputFields: { key: string; label: string; unit: string; step?: number; min?: number }[];
  compute: (inputs: Record<string, number>) => {
    primaryLabel: string;
    primaryValue: string;
    secondaryLabel?: string;
    secondaryValue?: string;
  };
}

export const INTERACTIVE_FORMULAS: InteractiveFormulaSpec[] = [
  {
    id: "circunferencia-neutra",
    code: "FORM-01",
    name: "Comprimento da Linha Neutra",
    category: "Calandragem & Linha Neutra",
    legacyCategoryBadge: "Calandragem & Rolos",
    formula: "Dn = Dext − t   |   P = π × (Dext − t)",
    unit: "mm",
    description:
      "Cálculo exato do desenvolvimento reto da chapa considerando a fibra neutra do material. Elimina sobra ou falta no fechamento da virola calandrada.",
    application: "Calandras mecânicas, virolas cilíndricas, tubos industriais, silos e tanques.",
    exampleSolved:
      "Para Dext = 500 mm e espessura t = 3,0 mm → Dn = 497,00 mm e Perímetro P = 1.561,37 mm.",
    stepByStep: [
      "1. Meça ou leia no projeto o diâmetro externo nominal (Dext).",
      "2. Subtraia 1 vez a espessura real da chapa (t) para encontrar o Diâmetro Neutro (Dn).",
      "3. Multiplique Dn por π (3,14159265) para obter o comprimento exato de corte (P).",
    ],
    variables: [
      { sym: "Dext", name: "Diâmetro externo nominal", unit: "mm" },
      { sym: "t", name: "Espessura da chapa", unit: "mm" },
      { sym: "Dn", name: "Diâmetro da linha neutra", unit: "mm" },
      { sym: "P", name: "Perímetro de corte planificado", unit: "mm" },
    ],
    practicalTool: "/tracagem/cilindro",
    toolLabel: "Abrir Cilindro 3D",
    diagram: "cylinder",
    defaultInputs: { dExt: 500, t: 3 },
    inputFields: [
      { key: "dExt", label: "Diâmetro Externo (Dext)", unit: "mm", step: 1, min: 1 },
      { key: "t", label: "Espessura da Chapa (t)", unit: "mm", step: 0.1, min: 0.1 },
    ],
    compute: (inp) => {
      const res = calcNeutralLineVirola(inp.dExt ?? 500, inp.t ?? 3);
      return {
        primaryLabel: "Perímetro de Corte (P)",
        primaryValue: `${res.perimeter.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
        secondaryLabel: "Diâmetro Neutro (Dn)",
        secondaryValue: `${res.dn.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
      };
    },
  },
  {
    id: "desenvolvimento-conico",
    code: "FORM-02",
    name: "Geratriz e Ângulo de Tronco de Cone",
    category: "Cones & Traçagem",
    legacyCategoryBadge: "Transição Cônica",
    formula: "G = √(H² + (R − r)²)   |   α = 180° × (D1 − D2) / G",
    unit: "mm / graus (°)",
    description:
      "Determina a geratriz real da parede inclinada e o ângulo de abertura do leque circular na chapa planificada para troncos de cone e reduções concêntricas.",
    application: "Funis de descarga, reduções concêntricas, ciclones, tremonhas e chapéus chineses.",
    exampleSolved:
      "Para D1 = 400 mm, D2 = 200 mm e H = 300 mm → Geratriz G = 316,23 mm e Ângulo do Setor α = 113,84°.",
    stepByStep: [
      "1. Converta os diâmetros maior (D1) e menor (D2) em raios (R = D1/2 e r = D2/2).",
      "2. Calcule a geratriz do tronco: G = √(H² + (R − r)²).",
      "3. Obtenha o ângulo do setor aberto: α = 180° × (D1 − D2) / G.",
    ],
    variables: [
      { sym: "D1", name: "Diâmetro da base maior", unit: "mm" },
      { sym: "D2", name: "Diâmetro da base menor", unit: "mm" },
      { sym: "H", name: "Altura vertical no eixo", unit: "mm" },
      { sym: "G", name: "Geratriz real do tronco", unit: "mm" },
      { sym: "α", name: "Ângulo do setor planificado", unit: "graus (°)" },
    ],
    practicalTool: "/tracagem/tronco-de-cone",
    toolLabel: "Abrir Tronco de Cone",
    diagram: "cone",
    defaultInputs: { d1: 400, d2: 200, h: 300 },
    inputFields: [
      { key: "d1", label: "Diâmetro Maior (D1)", unit: "mm", step: 1, min: 1 },
      { key: "d2", label: "Diâmetro Menor (D2)", unit: "mm", step: 1, min: 0 },
      { key: "h", label: "Altura Axial (H)", unit: "mm", step: 1, min: 1 },
    ],
    compute: (inp) => {
      const res = calcTruncatedCone(inp.d1 ?? 400, inp.d2 ?? 200, inp.h ?? 300);
      return {
        primaryLabel: "Geratriz Real (G)",
        primaryValue: `${res.generatrix.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
        secondaryLabel: "Ângulo do Setor (α)",
        secondaryValue: `${res.sectorAngleDeg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`,
      };
    },
  },
  {
    id: "triangulacao",
    code: "FORM-03",
    name: "Geratriz por Triangulação 3D (VG)",
    category: "Cones & Traçagem",
    legacyCategoryBadge: "Quadrado p/ Redondo",
    formula: "VG = √(Δx² + Δy² + H²)",
    unit: "mm",
    description:
      "Hipotenusa espacial usada para obter a Verdadeira Grandeza (VG) de cada segmento em transições Quadrado para Redondo e cones excêntricos.",
    application: "Transições quadrado-redondo, moegas assimétricas, coifas e dutos industriais.",
    exampleSolved:
      "Para Δx = 150 mm, Δy = 200 mm e H = 300 mm → Projeção em planta = 250 mm e VG = 390,51 mm.",
    stepByStep: [
      "1. Divida a boca circular em 12 partes iguais em planta.",
      "2. Meça os afastamentos horizontais Δx e Δy do canto do quadrado até cada ponto do círculo.",
      "3. Combine com a altura vertical (H) para obter a medida real de compasso (VG).",
    ],
    variables: [
      { sym: "Δx", name: "Projeção no eixo X", unit: "mm" },
      { sym: "Δy", name: "Projeção no eixo Y", unit: "mm" },
      { sym: "H", name: "Altura entre planos", unit: "mm" },
      { sym: "VG", name: "Verdadeira Grandeza", unit: "mm" },
    ],
    practicalTool: "/tracagem/quadrado-redondo",
    toolLabel: "Abrir Quadrado → Redondo",
    diagram: "transition",
    defaultInputs: { dx: 150, dy: 200, h: 300 },
    inputFields: [
      { key: "dx", label: "Deslocamento Δx", unit: "mm", step: 1, min: 0 },
      { key: "dy", label: "Deslocamento Δy", unit: "mm", step: 1, min: 0 },
      { key: "h", label: "Altura Vertical (H)", unit: "mm", step: 1, min: 1 },
    ],
    compute: (inp) => {
      const res = calcTriangulation3D(inp.dx ?? 150, inp.dy ?? 200, inp.h ?? 300);
      const baseProj = Math.hypot(inp.dx ?? 150, inp.dy ?? 200);
      return {
        primaryLabel: "Verdadeira Grandeza (VG)",
        primaryValue: `${res.trueLength.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
        secondaryLabel: "Projeção em Planta",
        secondaryValue: `${baseProj.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
      };
    },
  },
  {
    id: "curva-gomos",
    code: "FORM-04",
    name: "Ângulo por Gomo em Curvas Segmentadas",
    category: "Cones & Traçagem",
    legacyCategoryBadge: "Segmentos Angulares",
    formula: "α = Ângulo Total / (2 × (N − 1))",
    unit: "graus (°)",
    description:
      "Determina o ângulo de corte das extremidades (meios-gomos = α) e dos gomos centrais (2α) em curvas de gomos para tubulação industrial.",
    application: "Curvas de gomos de 45°, 60° e 90° em dutos e tubulações de grande diâmetro.",
    exampleSolved:
      "Para curva de 90° com N = 4 segmentos → Meio-gomo α = 15,00° e Gomo central 2α = 30,00°.",
    stepByStep: [
      "1. Defina o ângulo total de desvio da curva (ex.: 90°).",
      "2. Defina o número total de partes/segmentos N (contando gomos inteiros e meios-gomos).",
      "3. Calcule α = Ângulo / (2 × (N − 1)) para o plano de corte de cada emenda.",
    ],
    variables: [
      { sym: "Ângulo", name: "Curvatura total da curva", unit: "°" },
      { sym: "N", name: "Número de segmentos", unit: "un" },
      { sym: "α", name: "Ângulo do meio-gomo", unit: "°" },
    ],
    practicalTool: "/tracagem/curva-de-gomos",
    toolLabel: "Abrir Curva de Gomos",
    diagram: "elbow",
    defaultInputs: { totalAngle: 90, segments: 4 },
    inputFields: [
      { key: "totalAngle", label: "Ângulo Total da Curva", unit: "°", step: 1, min: 5 },
      { key: "segments", label: "Nº de Segmentos (N)", unit: "un", step: 1, min: 2 },
    ],
    compute: (inp) => {
      const res = calcMiterElbowAngle(inp.totalAngle ?? 90, inp.segments ?? 4);
      return {
        primaryLabel: "Meio-Gomo de Ponta (α)",
        primaryValue: `${res.halfMiter.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`,
        secondaryLabel: "Gomo Central (2α)",
        secondaryValue: `${res.fullMiter.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`,
      };
    },
  },
  {
    id: "massa-chapa",
    code: "FORM-05",
    name: "Massa e Peso de Chapa Metálica (NBR 11888)",
    category: "Massa & Pesos",
    legacyCategoryBadge: "Engenharia de Custos",
    formula: "M = (L × C / 10⁶) × e × 7,85",
    unit: "kg",
    description:
      "Calcula a área em m² e o peso líquido exato de chapas planas de aço carbono (densidade 7,85 g/cm³) para orçamento, içamento e compra de matéria-prima.",
    application: "Orçamentos de corte, plano de carga, seleção de ponte rolante e estoque de chapas.",
    exampleSolved:
      "Chapa MSG 14 (1,90 mm) de 1000 × 2000 mm → Área = 2,00 m² e Peso = 29,83 kg.",
    stepByStep: [
      "1. Multiplique Largura (mm) × Comprimento (mm) e divida por 1.000.000 para obter a área em m².",
      "2. Multiplique pela espessura nominal da chapa em milímetros (e).",
      "3. Multiplique pela massa específica do aço carbono (7,85 kg/m² por mm de espessura).",
    ],
    variables: [
      { sym: "L × C", name: "Largura × Comprimento", unit: "mm" },
      { sym: "e", name: "Espessura da chapa", unit: "mm" },
      { sym: "ρ", name: "Densidade (7,85 aço)", unit: "g/cm³" },
      { sym: "M", name: "Massa total da chapa", unit: "kg" },
    ],
    practicalTool: "/oficina",
    toolLabel: "Bancada de Chapas",
    diagram: "sheet",
    defaultInputs: { width: 1000, length: 2000, thickness: 1.9 },
    inputFields: [
      { key: "width", label: "Largura (L)", unit: "mm", step: 10, min: 1 },
      { key: "length", label: "Comprimento (C)", unit: "mm", step: 10, min: 1 },
      { key: "thickness", label: "Espessura (e)", unit: "mm", step: 0.05, min: 0.1 },
    ],
    compute: (inp) => {
      const res = calcSheetWeight(inp.width ?? 1000, inp.length ?? 2000, inp.thickness ?? 1.9, 7.85);
      return {
        primaryLabel: "Peso Total Calculado",
        primaryValue: `${res.weightKg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`,
        secondaryLabel: "Área da Chapa",
        secondaryValue: `${res.areaM2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`,
      };
    },
  },
  {
    id: "desenvolvimento-dobra",
    code: "FORM-06",
    name: "Desenvolvimento de Dobra (Bend Allowance & Fator K)",
    category: "Dobra & Fator K",
    legacyCategoryBadge: "Dobradeira & Prensa",
    formula: "BA = θ × (π / 180) × (R + K × t)",
    unit: "mm",
    description:
      "Calcula o comprimento exato da fibra neutra na região dobrada (Bend Allowance) e a dedução de dobra para perfis dobrados em prensa viradeira.",
    application: "Bandejas, perfis U/Z dobrados, gabinetes metálicos e suportes em chapa.",
    exampleSolved:
      "Para θ = 90°, raio interno R = 2,0 mm, K = 0,33 e espessura t = 2,0 mm → BA = 4,18 mm.",
    stepByStep: [
      "1. Identifique o ângulo de dobra θ (ex.: 90°) e o raio interno do punção (R).",
      "2. Adote o Fator K conforme o processo (0,33 para dobra a ar com R ≈ t).",
      "3. Calcule BA = θ × (π/180) × (R + K × t) para somar às abas retas internas.",
    ],
    variables: [
      { sym: "θ", name: "Ângulo de dobra", unit: "°" },
      { sym: "R", name: "Raio interno de dobra", unit: "mm" },
      { sym: "K", name: "Fator K da linha neutra", unit: "adim." },
      { sym: "t", name: "Espessura da chapa", unit: "mm" },
    ],
    practicalTool: "/desenho-2d",
    toolLabel: "Prancheta CHAMFER CAD",
    diagram: "bend",
    defaultInputs: { angle: 90, radius: 2, kFactor: 0.33, thickness: 2 },
    inputFields: [
      { key: "angle", label: "Ângulo (θ)", unit: "°", step: 1, min: 1 },
      { key: "radius", label: "Raio Interno (R)", unit: "mm", step: 0.5, min: 0.1 },
      { key: "kFactor", label: "Fator K", unit: "", step: 0.01, min: 0.1 },
      { key: "thickness", label: "Espessura (t)", unit: "mm", step: 0.1, min: 0.1 },
    ],
    compute: (inp) => {
      const res = calcBendAllowance(
        inp.angle ?? 90,
        inp.radius ?? 2,
        inp.kFactor ?? 0.33,
        inp.thickness ?? 2,
      );
      return {
        primaryLabel: "Desenvolvimento (BA)",
        primaryValue: `${res.ba.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
        secondaryLabel: "Dedução de Dobra (BD)",
        secondaryValue: `${res.bd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
      };
    },
  },
  {
    id: "diagonal-esquadro",
    code: "FORM-07",
    name: "Conferência de Esquadro por Diagonal (Pitágoras)",
    category: "Arcos & Esquadro",
    legacyCategoryBadge: "Estruturas & Quadros",
    formula: "D = √(L² + C²)",
    unit: "mm",
    description:
      "Garante o paralelismo e o ângulo reto (90,0°) em quadros de metalon, portões, bases de máquinas e chapas antes do ponteamento definitivo.",
    application: "Quadros estruturais, bancadas, chassis de equipamentos e conferência de chapas.",
    exampleSolved:
      "Para um quadro retangular de 3000 × 4000 mm → Diagonal exata D = 5000,00 mm (proporção 3-4-5).",
    stepByStep: [
      "1. Meça a largura externa (L) e o comprimento externo (C) do quadro.",
      "2. Calcule a diagonal teórica D = √(L² + C²).",
      "3. Cruze a trena nas duas diagonais: quando D1 = D2 = D, o quadro está 100% no esquadro.",
    ],
    variables: [
      { sym: "L", name: "Largura do quadro", unit: "mm" },
      { sym: "C", name: "Comprimento do quadro", unit: "mm" },
      { sym: "D", name: "Diagonal de esquadro", unit: "mm" },
    ],
    practicalTool: "/calculadora",
    toolLabel: "Calculadora Científica",
    diagram: "diagonal",
    defaultInputs: { width: 3000, length: 4000 },
    inputFields: [
      { key: "width", label: "Largura (L)", unit: "mm", step: 10, min: 1 },
      { key: "length", label: "Comprimento (C)", unit: "mm", step: 10, min: 1 },
    ],
    compute: (inp) => {
      const res = calcSquaringDiagonal(inp.width ?? 3000, inp.length ?? 4000);
      return {
        primaryLabel: "Diagonal Exata (D)",
        primaryValue: `${res.diagonal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
        secondaryLabel: "Tolerância de Oficina",
        secondaryValue: "± 1,0 mm entre D1 e D2",
      };
    },
  },
  {
    id: "corda-flecha-raio",
    code: "FORM-08",
    name: "Levantamento de Raio por Corda e Flecha",
    category: "Arcos & Esquadro",
    legacyCategoryBadge: "Calandragem & Arcos",
    formula: "R = (c² / (8 × f)) + (f / 2)",
    unit: "mm",
    description:
      "Determina o raio real de uma chapa calandrada, tubo curvo ou costado de tanque existente usando apenas uma régua reta (corda) e a altura central (flecha).",
    application: "Engenharia reversa de tanques, conferência de gabarito de calandra e arcos.",
    exampleSolved:
      "Para uma corda c = 600 mm e flecha f = 75 mm → Raio real R = 637,50 mm.",
    stepByStep: [
      "1. Encoste uma régua de comprimento conhecido (corda c) na parte côncava da peça.",
      "2. Meça no centro da régua o afastamento perpendicular até a chapa (flecha f).",
      "3. Aplique R = (c² / 8f) + (f / 2) para obter o raio real da superfície.",
    ],
    variables: [
      { sym: "c", name: "Comprimento da corda", unit: "mm" },
      { sym: "f", name: "Altura da flecha central", unit: "mm" },
      { sym: "R", name: "Raio recuperado do arco", unit: "mm" },
    ],
    practicalTool: "/calculadora",
    toolLabel: "Calculadora Científica",
    diagram: "chord",
    defaultInputs: { chord: 600, sagitta: 75 },
    inputFields: [
      { key: "chord", label: "Corda da Régua (c)", unit: "mm", step: 5, min: 10 },
      { key: "sagitta", label: "Flecha Central (f)", unit: "mm", step: 1, min: 1 },
    ],
    compute: (inp) => {
      const res = calcArcRadiusFromChord(inp.chord ?? 600, inp.sagitta ?? 75);
      return {
        primaryLabel: "Raio Real do Arco (R)",
        primaryValue: `${res.radius.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
        secondaryLabel: "Diâmetro Equivalente",
        secondaryValue: `${(res.radius * 2).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`,
      };
    },
  },
];

/* =========================================================================
   4. TABELAS NORMATIVAS DE OFICINA (NBR 11888, SCHEDULE 40, MATERIAIS)
   ========================================================================= */

export interface NormativeTableRow {
  spec: string;
  mm: string;
  pol: string;
  peso: string;
  numericThicknessMm?: number;
  numericDensity?: number;
  notes?: string;
}

export interface NormativeTableSpec {
  id: string;
  title: string;
  badge: string;
  code: string;
  headers: [string, string, string, string];
  data: NormativeTableRow[];
}

export const SHOP_FLOOR_TABLES: NormativeTableSpec[] = [
  {
    id: "bitolas-chapa",
    title: "Bitolas de Chapa (MSG / Polegada / mm)",
    badge: "Chapa Comercial",
    code: "NBR 11888",
    headers: ["Bitola", "Esp. (mm)", 'Pol. (")', "Peso (kg/m²)"],
    data: [
      { spec: "MSG 20", mm: "0,90 mm", pol: '0,0359"', peso: "7,07 kg/m²", numericThicknessMm: 0.9, notes: "Chapa fina a frio para dutos leves, carenagens e calhas." },
      { spec: "MSG 18", mm: "1,20 mm", pol: '0,0478"', peso: "9,42 kg/m²", numericThicknessMm: 1.2, notes: "Muito utilizada em painéis elétricos, coifas e ventilação." },
      { spec: "MSG 16", mm: "1,50 mm", pol: '0,0598"', peso: "11,78 kg/m²", numericThicknessMm: 1.5, notes: "Chapa padrão para serralheria industrial, bandejas e dutos." },
      { spec: "MSG 14", mm: "1,90 mm", pol: '0,0747"', peso: "14,92 kg/m²", numericThicknessMm: 1.9, notes: "Chapa estrutural leve de alta demanda em caldeiraria (29,83 kg em 1×2m)." },
      { spec: "MSG 12", mm: "2,65 mm", pol: '0,1046"', peso: "20,80 kg/m²", numericThicknessMm: 2.65, notes: "Transição para caldeiraria média, moegas, silos e suportes." },
      { spec: "MSG 1/8", mm: "3,18 mm", pol: '0,1250"', peso: "24,96 kg/m²", numericThicknessMm: 3.18, notes: "Chapa 1/8\" clássica para tanques, virolas e mãos-francesas." },
      { spec: "MSG 3/16", mm: "4,75 mm", pol: '0,1875"', peso: "37,29 kg/m²", numericThicknessMm: 4.75, notes: "Chapa 3/16\" para costados de reservatórios, flanges e bases." },
      { spec: "MSG 1/4", mm: "6,35 mm", pol: '0,2500"', peso: "49,85 kg/m²", numericThicknessMm: 6.35, notes: "Chapa 1/4\" estrutural pesada, sapatas de ancoragem e vasos." },
      { spec: "MSG 5/16", mm: "7,94 mm", pol: '0,3125"', peso: "62,33 kg/m²", numericThicknessMm: 7.94, notes: "Chapa 5/16\" para caldeiraria pesada, britadores e chutes de mineração." },
      { spec: "MSG 3/8", mm: "9,52 mm", pol: '0,3750"', peso: "74,73 kg/m²", numericThicknessMm: 9.52, notes: "Chapa 3/8\" para estruturas de grande porte, flanges ANSI e bases." },
    ],
  },
  {
    id: "tubos-sch40",
    title: "Tubos Schedule 40 (ASTM A53 / A106)",
    badge: "Tubulações",
    code: "ANSI B36.10",
    headers: ["Bitola NPS", "Parede (mm)", "Ø Ext. (mm)", "Peso (kg/m)"],
    data: [
      { spec: '1" (25 mm)', mm: "3,38 mm", pol: "33,4 mm", peso: "2,50 kg/m", numericThicknessMm: 3.38, notes: "Linha de utilidades, ar comprimido e água industrial." },
      { spec: '1.1/2" (40 mm)', mm: "3,68 mm", pol: "48,3 mm", peso: "4,05 kg/m", numericThicknessMm: 3.68, notes: "Tubulação secundária de processo e guarda-corpo industrial." },
      { spec: '2" (50 mm)', mm: "3,91 mm", pol: "60,3 mm", peso: "5,44 kg/m", numericThicknessMm: 3.91, notes: "Diâmetro de alta aplicação em skids e linhas de bombeamento." },
      { spec: '2.1/2" (65 mm)', mm: "5,16 mm", pol: "73,0 mm", peso: "8,63 kg/m", numericThicknessMm: 5.16, notes: "Redes de incêndio (hidrantes) e vapor saturado." },
      { spec: '3" (75 mm)', mm: "5,49 mm", pol: "88,9 mm", peso: "11,29 kg/m", numericThicknessMm: 5.49, notes: "Coletores industriais e derivações boca de lobo." },
      { spec: '4" (100 mm)', mm: "6,02 mm", pol: "114,3 mm", peso: "16,07 kg/m", numericThicknessMm: 6.02, notes: "Tronco principal de processo, recalque e manifolds." },
      { spec: '6" (150 mm)', mm: "7,11 mm", pol: "168,3 mm", peso: "28,26 kg/m", numericThicknessMm: 7.11, notes: "Adutoras industriais, curvas em gomos e coletores de vapor." },
      { spec: '8" (200 mm)', mm: "8,18 mm", pol: "219,1 mm", peso: "42,55 kg/m", numericThicknessMm: 8.18, notes: "Linhas tronco de grande vazão e chaminés tubulares." },
      { spec: '10" (250 mm)', mm: "9,27 mm", pol: "273,0 mm", peso: "60,31 kg/m", numericThicknessMm: 9.27, notes: "Tubulação pesada de processo petroquímico e siderúrgico." },
      { spec: '12" (300 mm)', mm: "10,31 mm", pol: "323,8 mm", peso: "79,73 kg/m", numericThicknessMm: 10.31, notes: "Dutos de alta capacidade e caldeiraria tubular pesada." },
    ],
  },
  {
    id: "densidade-metais",
    title: "Densidade & Massas Específicas dos Metais",
    badge: "Materiais",
    code: "DIN / ASTM",
    headers: ["Material", "Densidade", "Aplicação", "Fator vs Aço"],
    data: [
      { spec: "Aço Carbono SAE 1020", mm: "7,85 g/cm³", pol: "Estrutural", peso: "Ref. 100%", numericDensity: 7.85, notes: "Material base para caldeiraria, estruturas ASTM A36 e chapas." },
      { spec: "Aço Inox AISI 304 / 316", mm: "8,00 g/cm³", pol: "Sanitário/Quím.", peso: "+1,9%", numericDensity: 8.0, notes: "Exige Fator K específico e purga/proteção gasosa na solda TIG." },
      { spec: "Alumínio 6061 / 5052", mm: "2,70 g/cm³", pol: "Leve/Naval", peso: "-65,6%", numericDensity: 2.7, notes: "Exige raio mínimo de dobra maior (2×t) para evitar trincas." },
      { spec: "Cobre Puro Eletrolítico", mm: "8,96 g/cm³", pol: "Barramentos", peso: "+14,1%", numericDensity: 8.96, notes: "Alta condutividade térmica e elétrica." },
      { spec: "Latão Naval (Cu-Zn)", mm: "8,50 g/cm³", pol: "Usinagem", peso: "+8,3%", numericDensity: 8.5, notes: "Conexões especiais, buchas e espelhos de trocadores." },
      { spec: "Titânio Grau 2 / 5", mm: "4,51 g/cm³", pol: "Químico/Aero", peso: "-42,5%", numericDensity: 4.51, notes: "Altíssima resistência à corrosão severa." },
      { spec: "Ferro Fundido Cinzento", mm: "7,20 g/cm³", pol: "Bases/Carcaças", peso: "-8,3%", numericDensity: 7.2, notes: "Não desenvolvível; usado em flanges e bases fundidas." },
      { spec: "Bronze Fosforoso", mm: "8,80 g/cm³", pol: "Mancais", peso: "+12,1%", numericDensity: 8.8, notes: "Elementos de desgaste e guias." },
    ],
  },
];

/* =========================================================================
   5. CATÁLOGO EXPANDIDO DA BIBLIOTECA + GLOSSÁRIO DE OFICINA (ABA 3)
   ========================================================================= */

export type CatalogFilterCategory =
  | "Todos"
  | "Tubos"
  | "Chapas"
  | "Perfis"
  | "Materiais"
  | "Soldagem"
  | "Tolerâncias"
  | "Normas";

export interface ExtendedCatalogItem extends Omit<LibraryItem, "category"> {
  category: Exclude<CatalogFilterCategory, "Todos"> | string;
}

export const EXTENDED_CATALOG_ITEMS: ExtendedCatalogItem[] = [
  ...LIBRARY_ITEMS.map((item) => ({
    ...item,
    category: item.category === "Dobra" || item.category === "Conversões" ? "Tolerâncias" : item.category,
  })),
  {
    id: "perfil-w-i",
    category: "Perfis",
    title: "Perfis I / W (Aço ASTM A572 Grau 50)",
    detail: "Vigas laminadas de abas paralelas para pórticos, mezaninos e caminhos de rolamento.",
    data: [
      { label: "W 150 × 13,0", value: "h=148 mm · 13,0 kg/m" },
      { label: "W 200 × 19,3", value: "h=203 mm · 19,3 kg/m" },
      { label: "W 250 × 25,3", value: "h=257 mm · 25,3 kg/m" },
      { label: "W 310 × 32,7", value: "h=313 mm · 32,7 kg/m" },
    ],
    premium: false,
  },
  {
    id: "cantoneiras-abas-iguais",
    category: "Perfis",
    title: "Cantoneiras de Abas Iguais (L)",
    detail: "Perfis laminados para treliças, contraventamentos, suportes e mãos-francesas.",
    data: [
      { label: 'L 1" × 1/8"', value: "25,4 × 3,18 mm · 1,19 kg/m" },
      { label: 'L 1.1/2" × 3/16"', value: "38,1 × 4,76 mm · 2,68 kg/m" },
      { label: 'L 2" × 1/4"', value: "50,8 × 6,35 mm · 4,74 kg/m" },
      { label: 'L 3" × 3/8"', value: "76,2 × 9,52 mm · 10,72 kg/m" },
    ],
    premium: false,
  },
  {
    id: "tolerancias-iso2768",
    category: "Tolerâncias",
    title: "Tolerâncias Gerais ISO 2768-m / NBR",
    detail: "Desvios dimensionais admissíveis para peças de caldeiraria e corte térmico/dobra.",
    data: [
      { label: "Cotas 30 a 120 mm", value: "± 0,3 mm (usin.) / ± 1,0 mm (cald.)" },
      { label: "Cotas 120 a 400 mm", value: "± 0,5 mm (usin.) / ± 1,5 mm (cald.)" },
      { label: "Cotas 400 a 1000 mm", value: "± 0,8 mm (usin.) / ± 2,0 mm (cald.)" },
      { label: "Cotas 1000 a 2000 mm", value: "± 1,2 mm (usin.) / ± 3,0 mm (cald.)" },
    ],
    premium: false,
  },
];

export interface GlossaryTerm {
  id: string;
  term: string;
  category: string;
  summary: string;
  practicalRule: string;
}

export const GLOSSARY_ITEMS: GlossaryTerm[] = [
  {
    id: "geratriz",
    term: "Geratriz (G)",
    category: "Geometria & Cones",
    summary:
      "Segmento de reta que, ao girar ou deslizar sobre a diretriz da base, gera a superfície lateral de cilindros, cones e transições.",
    practicalRule:
      "No cone reto, a geratriz G = √(H² + R²) é o próprio raio de abertura do compasso na chapa plana.",
  },
  {
    id: "verdadeira-grandeza",
    term: "Verdadeira Grandeza (VG)",
    category: "Traçagem & Projeção",
    summary:
      "Comprimento real de uma aresta ou geratriz no espaço 3D, livre de distorção por inclinação nas vistas ortográficas.",
    practicalRule:
      "Nunca transfira para a chapa uma linha inclinada diretamente da vista frontal ou superior sem antes rebater seu triângulo de VG.",
  },
  {
    id: "linha-neutra",
    term: "Linha Neutra (Dn)",
    category: "Calandragem & Dobra",
    summary:
      "Camada interna da espessura da chapa que não sofre tração (esticamento externo) nem compressão (encolhimento interno) durante a conformação.",
    practicalRule:
      "Em virolas calandradas, o comprimento de corte é sempre calculado pelo diâmetro médio: Dn = Dext − t.",
  },
  {
    id: "fator-k",
    term: "Fator K",
    category: "Dobradeira & Prensa",
    summary:
      "Razão adimensional (K = t_neutro / t_total) que localiza a posição exata da fibra neutra dentro da espessura durante a dobra em prensa.",
    practicalRule:
      "Para aço carbono dobrado a ar com raio interno próximo à espessura, K varia tipicamente entre 0,33 e 0,44.",
  },
  {
    id: "corda",
    term: "Corda (c)",
    category: "Arcos & Divisão",
    summary:
      "Distância em linha reta entre dois pontos pertencentes a uma mesma circunferência: c = 2·R·sen(180°/n).",
    practicalRule:
      "Como as pontas do compasso medem linha reta e não curva, toda divisão de flange ou boca circular em N partes é feita por corda.",
  },
  {
    id: "flecha",
    term: "Flecha (f)",
    category: "Calandragem & Inspeção",
    summary:
      "Distância perpendicular medida entre o ponto médio de uma corda (régua) e o arco da peça calandrada.",
    practicalRule:
      "Permite descobrir o raio de qualquer virola ou tanque em campo pela relação R = (c² / 8f) + (f / 2).",
  },
  {
    id: "boca-de-lobo",
    term: "Boca de Lobo",
    category: "Interseções Tubulares",
    summary:
      "Curva de interseção geométrica formada pelo encontro de dois cilindros (ramal e tronco coletor), concêntricos, excêntricos ou inclinados.",
    practicalRule:
      "Desconte a espessura da parede do ramal quando ele apoia por dentro da furação do tubo tronco.",
  },
  {
    id: "gomo",
    term: "Gomo (Curva Segmentada)",
    category: "Tubulações & Dutos",
    summary:
      "Anel cilíndrico truncado por planos inclinados que, soldado em sequência, forma curvas de 45° ou 90° em grandes diâmetros.",
    practicalRule:
      "Toda curva de gomos possui 2 meios-gomos nas extremidades (ângulo α) e gomos inteiros no centro (ângulo 2α).",
  },
  {
    id: "meia-esquadria",
    term: "Meia-Esquadria (45°)",
    category: "Estruturas & Serralheria",
    summary:
      "Corte em ângulo bissetor (45° para cantos de 90°) executado nas extremidades de metalões e perfis para fechar quadros sem expor o topo aberto.",
    practicalRule:
      "A cota externa do quadro governa a ponta longa do corte de 45°; a face interna fica menor em 2 × largura do perfil.",
  },
  {
    id: "schedule",
    term: "Schedule (Sch)",
    category: "Tubulações ANSI/ASME",
    summary:
      "Série adimensional normativa (Sch 10, Sch 40, Sch 80, Sch 160) que define a espessura de parede de um tubo para um mesmo diâmetro externo NPS.",
    practicalRule:
      "Um tubo de 4\" Sch 40 e um de 4\" Sch 80 têm exatamente o mesmo Ø externo (114,3 mm); o que muda é a parede e o Ø interno!",
  },
  {
    id: "nps",
    term: "NPS (Nominal Pipe Size)",
    category: "Tubulações ANSI/ASME",
    summary:
      "Padrão norte-americano de designação comercial do diâmetro nominal de tubos em polegadas (de 1/8\" até 12\", o Ø externo é maior que o valor nominal).",
    practicalRule:
      "Até 12\", nunca multiplique a polegada NPS por 25,4 mm para achar o diâmetro externo; consulte sempre a tabela ANSI B36.10.",
  },
  {
    id: "msg",
    term: "Bitola MSG (Manufacturers' Standard Gauge)",
    category: "Chapas Comerciais",
    summary:
      "Escala normativa (NBR 11888) que identifica espessuras de chapas finas de aço carbono (ex.: MSG 20 = 0,90 mm, MSG 16 = 1,50 mm, MSG 14 = 1,90 mm).",
    practicalRule:
      "Quanto menor o número MSG, mais grossa e mais pesada por m² é a chapa.",
  },
  {
    id: "alivio-dobra",
    term: "Alívio de Dobra (Bend Relief)",
    category: "Conformação & Dobra",
    summary:
      "Entalhe ou furo oblongo executado na raiz de encontros de abas para evitar rasgamento e estufamento do material na prensa dobradeira.",
    practicalRule:
      "A profundidade do alívio deve ultrapassar a soma da espessura com o raio interno de dobra (≥ t + R).",
  },
  {
    id: "kerf",
    term: "Kerf (Sangria de Corte)",
    category: "Corte CNC Plasma / Laser",
    summary:
      "Largura da fenda de material vaporizado ou removido pelo feixe de laser, jato de plasma, oxicorte ou disco de serra.",
    practicalRule:
      "Em furos de precisão e encaixes tipo espiga, compense metade do Kerf para fora no contorno externo e para dentro nos furos.",
  },
];

/* =========================================================================
   6. ENRIQUECIMENTO DIDÁTICO DO LEITOR IMERSIVO (CHECKPOINT & DICA MESTRE)
   ========================================================================= */

export interface EnrichedLessonContent {
  lesson: AcademyLesson;
  module: AcademyModule;
  track: AcademyTrack;
  lessonIndexInModule: number;
  globalIndex: number;
  totalLessons: number;
  concept: string;
  definition: string;
  steps: string[];
  masterTip: string;
  solvedExample: string;
  relatedFormulaExpressions: { expr: string; meaning: string }[];
  diagramType: "cylinder" | "cone" | "transition" | "elbow" | "sheet" | "bend" | "diagonal" | "chord";
  practiceRoute: string;
  practiceLabel: string;
  checkpoint: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export function getEnrichedLessonContent(lessonId: string): EnrichedLessonContent | null {
  const globalIndex = ALL_LESSONS.findIndex((x) => x.lesson.id === lessonId);
  if (globalIndex === -1) return null;
  const { module, lesson } = ALL_LESSONS[globalIndex]!;
  const track =
    ACADEMY_TRACKS.find((t) => t.moduleIds.includes(module.id)) ?? ACADEMY_TRACKS[0]!;
  const lessonIndexInModule = module.lessons.findIndex((l) => l.id === lesson.id) + 1;

  const k = knowledgeById(lesson.knowledge[0] ?? "");
  const concept =
    k?.concept ??
    `Fundamento essencial de ${module.title.toLowerCase()} aplicado à fabricação metálica e traçagem de precisão.`;
  const definition =
    k?.definition ??
    `Compreenda as relações geométricas, descontos de material e sequência operacional de bancada para executar "${lesson.title}" sem retrabalho.`;

  const steps =
    k?.method && k.method.length > 0
      ? k.method
      : [
          "1. Verifique a cota nominal no desenho técnico e identifique se a referência é externa, interna ou de centro.",
          "2. Aplique o desconto de espessura (Linha Neutra Dn = Dext − t ou Fator K na dobra) antes de transferir para a chapa.",
          "3. Trace as linhas de referência (eixos de simetria e linha de base) e confira o esquadro pelas diagonais.",
          "4. Marque os pontos de divisão com punção leve e valide as medidas de Verdadeira Grandeza antes do corte.",
        ];

  const warnings = [...(k?.warnings ?? []), ...(k?.commonErrors ?? [])];
  const masterTip =
    warnings[0] ??
    "Sempre confira as duas diagonais da chapa bruta e desconte a espessura real medida no paquímetro antes de riscar o desenvolvimento definitivo.";

  const relatedFormulaExpressions = (k?.formulas ?? [])
    .map((fid) => formulaById(fid))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ expr: f.expression, meaning: f.computes }));

  const defaultModuleExample =
    module.id === "cones" || lesson.id.includes("cone")
      ? "Tronco de cone com base maior D1 = 400 mm, base menor D2 = 200 mm e altura H = 300 mm → Geratriz G = √(300² + 100²) = 316,23 mm e ângulo do setor α = 113,84°."
      : module.id === "dobras"
        ? "Dobra a 90° em chapa t = 2,0 mm com raio interno R = 2,0 mm e Fator K = 0,33 → Desenvolvimento da dobra BA = 90 × (π/180) × (2 + 0,33 × 2) = 4,18 mm."
        : module.id === "reducoes" || lesson.id.includes("quadrado")
          ? "Transição Quadrado → Redondo com projeções Δx = 150 mm, Δy = 200 mm e altura H = 300 mm → Projeção horizontal = 250,00 mm e Verdadeira Grandeza VG = √(250² + 300²) = 390,51 mm."
          : module.id === "curvas" || module.id === "interseccoes"
            ? "Curva de gomos a 90° com N = 4 segmentos → Divisões = 2 × (4 − 1) = 6 → Ângulo do meio-gomo α = 15,00° e gomo central 2α = 30,00°."
            : "Em uma virola cilíndrica com Ø externo Dext = 500 mm em chapa t = 3,0 mm → Diâmetro Neutro Dn = 500 − 3 = 497,00 mm e Perímetro de Corte P = π × 497 = 1.561,37 mm.";

  const solvedExample =
    k?.example && /\d/.test(k.example) ? k.example : defaultModuleExample;

  // Determina diagrama e rota de prática 1:1
  let diagramType: EnrichedLessonContent["diagramType"] = "cylinder";
  let practiceRoute = "/tracagem";
  let practiceLabel = "Praticar Peça 1:1 na Oficina";

  if (module.id === "cones" || lesson.id.includes("cone")) {
    diagramType = "cone";
    practiceRoute = "/tracagem/tronco-de-cone";
    practiceLabel = "Praticar Tronco de Cone 1:1";
  } else if (module.id === "reducoes" || lesson.id.includes("quadrado")) {
    diagramType = "transition";
    practiceRoute = "/tracagem/quadrado-redondo";
    practiceLabel = "Praticar Quadrado → Redondo 1:1";
  } else if (module.id === "curvas" || module.id === "interseccoes") {
    diagramType = "elbow";
    practiceRoute = lesson.id.includes("boca") ? "/tracagem/boca-de-lobo" : "/tracagem/curva-de-gomos";
    practiceLabel = lesson.id.includes("boca") ? "Praticar Boca de Lobo 1:1" : "Praticar Curva de Gomos 1:1";
  } else if (module.id === "dobras") {
    diagramType = "bend";
    practiceRoute = "/desenho-2d";
    practiceLabel = "Praticar no CHAMFER CAD";
  } else if (module.id === "desenho-tecnico" || module.id === "planta-elevacao") {
    diagramType = "diagonal";
    practiceRoute = "/desenho-2d";
    practiceLabel = "Abrir Prancheta CHAMFER CAD";
  } else if (lesson.id.includes("arco") || lesson.id.includes("divisao")) {
    diagramType = "chord";
    practiceRoute = "/calculadora";
    practiceLabel = "Simular na Calculadora";
  } else {
    diagramType = "cylinder";
    practiceRoute = "/tracagem/cilindro";
    practiceLabel = "Praticar Cilindro / Virola 1:1";
  }

  // Checkpoint interativo contextualizado
  const checkpoint = buildLessonCheckpoint(lesson.id, module.id);

  return {
    lesson,
    module,
    track,
    lessonIndexInModule,
    globalIndex,
    totalLessons: ALL_LESSONS.length,
    concept,
    definition,
    steps,
    masterTip,
    solvedExample,
    relatedFormulaExpressions,
    diagramType,
    practiceRoute,
    practiceLabel,
    checkpoint,
  };
}

function buildLessonCheckpoint(lessonId: string, moduleId: string) {
  if (moduleId === "cones" || lessonId.includes("cone")) {
    return {
      question:
        "Para traçar o setor planificado de um tronco de cone de D1 = 400 mm, D2 = 200 mm e altura H = 300 mm, qual é a Geratriz Real (G)?",
      options: [
        "G = √(300² + 100²) = 316,23 mm",
        "G = 300 + 100 = 400,00 mm",
        "G = √(300² + 200²) = 360,55 mm",
      ],
      correctIndex: 0,
      explanation:
        "Exato! O afastamento radial é R − r = 200 − 100 = 100 mm. Pela relação de Pitágoras, G = √(300² + 100²) = 316,23 mm.",
    };
  }
  if (moduleId === "dobras") {
    return {
      question:
        "Em uma dobra de 90° com raio interno R = 2 mm, espessura t = 2 mm e Fator K = 0,33, qual o desenvolvimento BA da dobra?",
      options: [
        "BA = 4,18 mm",
        "BA = 6,28 mm",
        "BA = 2,00 mm",
      ],
      correctIndex: 0,
      explanation:
        "Perfeito! BA = 90 × (π/180) × (2 + 0,33 × 2) = 1,5708 × 2,66 = 4,18 mm.",
    };
  }
  if (moduleId === "reducoes" || lessonId === "verdadeira-grandeza" || lessonId === "triangulo-pitagoras") {
    return {
      question:
        "Para conferir o esquadro perfeito de um quadro estrutural de 3000 mm × 4000 mm, qual deve ser a medida exata das duas diagonais?",
      options: [
        "5000,00 mm",
        "4500,00 mm",
        "3500,00 mm",
      ],
      correctIndex: 0,
      explanation:
        "Correto! Pela relação pitagórica 3-4-5, D = √(3000² + 4000²) = 5000,00 mm.",
    };
  }
  return {
    question:
      "Ao desenvolver uma virola cilíndrica de diâmetro externo Dext = 500 mm em chapa de espessura t = 3 mm, qual perímetro de corte devemos traçar?",
    options: [
      "P = π × (500 − 3) = 1.561,37 mm (pela Linha Neutra)",
      "P = π × 500 = 1.570,80 mm (pelo Diâmetro Externo)",
      "P = π × (500 + 3) = 1.580,22 mm",
    ],
    correctIndex: 0,
    explanation:
      "Correto! Na calandragem, a fibra central mantém seu comprimento. Por isso usamos Dn = Dext − t = 497 mm → P = 1.561,37 mm.",
  };
}

/* =========================================================================
   7. BUSCA UNIVERSAL INSTANTÂNEA (ACENTOS E MAIÚSCULAS/MINÚSCULAS INSENSÍVEL)
   ========================================================================= */

export function normalizeSearchText(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface UniversalSearchResults {
  lessons: { lesson: AcademyLesson; module: AcademyModule }[];
  formulas: InteractiveFormulaSpec[];
  tablesAndCatalog: {
    kind: "table" | "catalog";
    id: string;
    title: string;
    subtitle: string;
    badge: string;
    tableId?: string;
    rowIndex?: number;
    catalogItem?: ExtendedCatalogItem;
  }[];
  glossary: GlossaryTerm[];
  totalCount: number;
}

export function searchAcademyContent(rawQuery: string): UniversalSearchResults {
  const q = normalizeSearchText(rawQuery);
  if (!q) {
    return { lessons: [], formulas: [], tablesAndCatalog: [], glossary: [], totalCount: 0 };
  }

  const lessons = ALL_LESSONS.filter(({ module, lesson }) => {
    const k = knowledgeById(lesson.knowledge[0] ?? "");
    const hay = normalizeSearchText(
      `${lesson.title} ${module.title} ${module.code} ${k?.concept ?? ""} ${k?.definition ?? ""}`,
    );
    return hay.includes(q);
  });

  const formulas = INTERACTIVE_FORMULAS.filter((f) => {
    const hay = normalizeSearchText(
      `${f.code} ${f.name} ${f.category} ${f.legacyCategoryBadge} ${f.formula} ${f.description} ${f.application} ${f.variables.map((v) => `${v.sym} ${v.name}`).join(" ")}`,
    );
    return hay.includes(q);
  });

  const tablesAndCatalog: UniversalSearchResults["tablesAndCatalog"] = [];

  for (const table of SHOP_FLOOR_TABLES) {
    table.data.forEach((row, idx) => {
      const hay = normalizeSearchText(
        `${table.title} ${table.code} ${table.badge} ${row.spec} ${row.mm} ${row.pol} ${row.peso} ${row.notes ?? ""}`,
      );
      if (hay.includes(q)) {
        tablesAndCatalog.push({
          kind: "table",
          id: `${table.id}-${idx}`,
          title: `${row.spec} — ${row.mm}`,
          subtitle: `${table.title} (${table.code}) • ${row.peso}`,
          badge: table.code,
          tableId: table.id,
          rowIndex: idx,
        });
      }
    });
  }

  for (const item of EXTENDED_CATALOG_ITEMS) {
    const hay = normalizeSearchText(
      `${item.title} ${item.category} ${item.detail} ${item.data.map((d) => `${d.label} ${d.value}`).join(" ")}`,
    );
    if (hay.includes(q)) {
      tablesAndCatalog.push({
        kind: "catalog",
        id: item.id,
        title: item.title,
        subtitle: `${item.detail} (${item.data.map((d) => `${d.label}: ${d.value}`).join(" · ")})`,
        badge: item.category,
        catalogItem: item,
      });
    }
  }

  const glossary = GLOSSARY_ITEMS.filter((g) => {
    const hay = normalizeSearchText(`${g.term} ${g.category} ${g.summary} ${g.practicalRule}`);
    return hay.includes(q);
  });

  return {
    lessons,
    formulas,
    tablesAndCatalog,
    glossary,
    totalCount: lessons.length + formulas.length + tablesAndCatalog.length + glossary.length,
  };
}
