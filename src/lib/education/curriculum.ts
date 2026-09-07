/**
 * CALDRA ACADEMY — currículo.
 *
 * Só ESTRUTURA + referências para a base de conhecimento. Nenhum texto técnico
 * novo mora aqui: as aulas apontam para itens de @/lib/education/knowledge.
 * Módulos ainda sem conteúdo publicado ficam "em-construcao".
 */

import type { CompetencyId } from "./knowledge";

export type LessonStatus = "disponivel" | "em-construcao";
export type SimulatorId = "triangulo" | "arco";

export type AcademyLesson = {
  id: string;
  title: string;
  minutes: number;
  free: boolean;
  status: LessonStatus;
  competency: CompetencyId;
  /** Itens da base de conhecimento que compõem a aula. */
  knowledge: string[];
  simulator?: SimulatorId;
  /** Aula longa já existente no formato anterior (rota /escola/$slug). */
  legacySlug?: string;
  prerequisites?: string[];
};

export type AcademyModule = {
  id: string;
  code: string;
  title: string;
  summary: string;
  competency: CompetencyId;
  lessons: AcademyLesson[];
};

const soon = (
  code: string,
  id: string,
  title: string,
  summary: string,
  competency: CompetencyId,
): AcademyModule => ({ id, code, title, summary, competency, lessons: [] });

export const CURRICULUM: AcademyModule[] = [
  {
    id: "fundamentos",
    code: "01",
    title: "Fundamentos da caldeiraria",
    summary: "O que é traçar, desenvolver e planificar — e o vocabulário do chão de fábrica.",
    competency: "fabricacao",
    lessons: [
      {
        id: "o-que-e-caldeiraria",
        title: "O que é caldeiraria",
        minutes: 8,
        free: true,
        status: "disponivel",
        competency: "fabricacao",
        knowledge: ["o-que-e-caldeiraria"],
        legacySlug: "o-que-e-caldeiraria",
      },
      {
        id: "medidas-fundamentais",
        title: "Raio, diâmetro e perímetro",
        minutes: 10,
        free: true,
        status: "disponivel",
        competency: "matematica",
        knowledge: ["raio-diametro-perimetro"],
      },
      {
        id: "verdadeira-grandeza",
        title: "Verdadeira grandeza",
        minutes: 12,
        free: true,
        status: "disponivel",
        competency: "desenho-tecnico",
        knowledge: ["verdadeira-grandeza"],
        prerequisites: ["triangulo-pitagoras"],
      },
    ],
  },
  {
    id: "matematica",
    code: "02",
    title: "Matemática aplicada",
    summary: "Unidades, geometria, Pitágoras e trigonometria a serviço da traçagem.",
    competency: "matematica",
    lessons: [
      {
        id: "unidades",
        title: "Unidades e conversões",
        minutes: 8,
        free: true,
        status: "disponivel",
        competency: "matematica",
        knowledge: ["unidades-medida"],
        legacySlug: "unidades",
      },
      {
        id: "triangulo-pitagoras",
        title: "Triângulo retângulo e Pitágoras",
        minutes: 14,
        free: true,
        status: "disponivel",
        competency: "matematica",
        knowledge: ["triangulo-retangulo"],
        simulator: "triangulo",
        prerequisites: ["unidades"],
      },
      {
        id: "arco-corda-flecha",
        title: "Arco, corda e flecha",
        minutes: 14,
        free: true,
        status: "disponivel",
        competency: "matematica",
        knowledge: ["arco-corda-flecha"],
        simulator: "arco",
        prerequisites: ["triangulo-pitagoras"],
      },
      {
        id: "trigonometria",
        title: "Seno, cosseno e tangente",
        minutes: 18,
        free: false,
        status: "disponivel",
        competency: "matematica",
        knowledge: ["trigonometria-basica"],
        simulator: "triangulo",
        legacySlug: "trigonometria",
        prerequisites: ["triangulo-pitagoras"],
      },
    ],
  },
  {
    id: "desenho-tecnico",
    code: "03",
    title: "Desenho técnico",
    summary: "Vistas, cortes, cotas, escalas e simbologia.",
    competency: "desenho-tecnico",
    lessons: [
      {
        id: "vistas",
        title: "Vistas ortográficas",
        minutes: 14,
        free: true,
        status: "disponivel",
        competency: "desenho-tecnico",
        knowledge: ["vistas-ortograficas"],
        prerequisites: ["verdadeira-grandeza"],
      },
      {
        id: "cotas-escalas",
        title: "Cotas e escalas",
        minutes: 10,
        free: true,
        status: "disponivel",
        competency: "desenho-tecnico",
        knowledge: ["cotas-escalas"],
        prerequisites: ["unidades"],
      },
      {
        id: "cortes",
        title: "Cortes e seções",
        minutes: 12,
        free: false,
        status: "disponivel",
        competency: "desenho-tecnico",
        knowledge: ["cortes-secoes"],
        prerequisites: ["vistas"],
      },
    ],
  },
  {
    id: "instrumentos",
    code: "04",
    title: "Instrumentos e traçagem",
    summary: "Compasso, riscador, punção, referências e conferência.",
    competency: "tracagem",
    lessons: [
      {
        id: "instrumentos",
        title: "Instrumentos de traçagem",
        minutes: 12,
        free: true,
        status: "disponivel",
        competency: "tracagem",
        knowledge: ["instrumentos-tracagem"],
      },
      {
        id: "referencias",
        title: "Referências e conferência",
        minutes: 12,
        free: true,
        status: "disponivel",
        competency: "tracagem",
        knowledge: ["referencias-tracagem"],
        prerequisites: ["triangulo-pitagoras"],
      },
      {
        id: "divisao-circunferencia",
        title: "Divisão da circunferência",
        minutes: 15,
        free: false,
        status: "disponivel",
        competency: "tracagem",
        knowledge: ["divisao-circunferencia"],
        simulator: "arco",
        prerequisites: ["medidas-fundamentais"],
      },
    ],
  },
  {
    id: "superficies",
    code: "05",
    title: "Desenvolvimento de superfícies",
    summary: "Superfícies desenvolvíveis, os três métodos e o papel da espessura.",
    competency: "planificacao",
    lessons: [
      {
        id: "superficies-desenvolviveis",
        title: "Superfícies desenvolvíveis",
        minutes: 10,
        free: true,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["superficies-desenvolviveis"],
        prerequisites: ["verdadeira-grandeza"],
      },
      {
        id: "metodos-planificacao",
        title: "Os três métodos",
        minutes: 14,
        free: true,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["metodos-planificacao"],
        prerequisites: ["superficies-desenvolviveis"],
      },
      {
        id: "linha-neutra",
        title: "Linha neutra e espessura",
        minutes: 10,
        free: false,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["linha-neutra-espessura"],
        prerequisites: ["medidas-fundamentais"],
      },
    ],
  },
  {
    id: "cilindros",
    code: "06",
    title: "Cilindros",
    summary: "Virolas, bocas inclinadas e casamento de emendas.",
    competency: "planificacao",
    lessons: [
      {
        id: "virola",
        title: "Virola cilíndrica",
        minutes: 12,
        free: true,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["virola-cilindrica"],
        prerequisites: ["linha-neutra"],
      },
      {
        id: "boca-inclinada",
        title: "Cilindro com boca inclinada",
        minutes: 18,
        free: false,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["cilindro-boca-inclinada"],
        simulator: "arco",
        prerequisites: ["virola", "divisao-circunferencia"],
      },
      {
        id: "emendas",
        title: "Emendas e casamento de virolas",
        minutes: 8,
        free: false,
        status: "disponivel",
        competency: "fabricacao",
        knowledge: ["emendas-virolas"],
        prerequisites: ["virola"],
      },
    ],
  },
  {
    id: "cones",
    code: "07",
    title: "Cones e troncos",
    summary: "Geratriz, setor circular, vértice imaginário e gabarito.",
    competency: "planificacao",
    lessons: [
      {
        id: "cone-completo",
        title: "Cone completo",
        minutes: 16,
        free: true,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["cone-completo"],
        simulator: "triangulo",
        prerequisites: ["metodos-planificacao", "triangulo-pitagoras"],
      },
      {
        id: "tronco-cone",
        title: "Tronco de cone",
        minutes: 18,
        free: false,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["tronco-cone"],
        prerequisites: ["cone-completo"],
      },
      {
        id: "gabarito-cone",
        title: "Gabarito e conferência",
        minutes: 8,
        free: false,
        status: "disponivel",
        competency: "tracagem",
        knowledge: ["gabarito-cone"],
        prerequisites: ["cone-completo"],
      },
    ],
  },
  {
    id: "reducoes",
    code: "08",
    title: "Reduções e transições",
    summary: "Concêntrica, excêntrica e quadrado → redondo por triangulação.",
    competency: "planificacao",
    lessons: [
      {
        id: "reducao-concentrica",
        title: "Redução concêntrica",
        minutes: 12,
        free: true,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["reducao-concentrica"],
        prerequisites: ["tronco-cone"],
      },
      {
        id: "reducao-excentrica",
        title: "Redução excêntrica",
        minutes: 18,
        free: false,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["reducao-excentrica"],
        prerequisites: ["reducao-concentrica", "verdadeira-grandeza"],
      },
      {
        id: "quadrado-redondo",
        title: "Quadrado → redondo",
        minutes: 20,
        free: false,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["quadrado-redondo"],
        prerequisites: ["reducao-excentrica"],
      },
    ],
  },
  {
    id: "curvas",
    code: "09",
    title: "Curvas e gomos",
    summary: "Ângulo de corte, recuo do gomo e traçado da curva de 90°.",
    competency: "planificacao",
    lessons: [
      {
        id: "curva-gomos",
        title: "Curva em gomos",
        minutes: 16,
        free: true,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["curva-gomos-conceito"],
        prerequisites: ["boca-inclinada"],
      },
      {
        id: "curva-90",
        title: "Traçado da curva de 90°",
        minutes: 20,
        free: false,
        status: "disponivel",
        competency: "planificacao",
        knowledge: ["curva-90-pratica"],
        prerequisites: ["curva-gomos"],
      },
    ],
  },
  soon("10", "interseccoes", "Interseções", "Penetrações, boca de lobo e derivações.", "planificacao"),
  soon("11", "tubulacoes", "Tubulações", "Acessórios, schedule e identificação de linhas.", "tubulacao"),
  soon("12", "planta-elevacao", "Planta e elevação", "Leitura e conversão entre vistas.", "tubulacao"),
  soon("13", "isometricos", "Isométricos", "Leitura e montagem de isométricos.", "tubulacao"),
  soon("14", "calculos-tubulacao", "Cálculos de tubulação", "Niples, deslocamentos e travessias.", "tubulacao"),
  soon("15", "dobras", "Dobras e descontos", "Fator K, bend allowance e bend deduction.", "fabricacao"),
  soon("16", "fabricacao", "Fabricação e aplicação", "Corte, calandra, montagem e conferência.", "fabricacao"),
];

export const ALL_LESSONS: { module: AcademyModule; lesson: AcademyLesson }[] = CURRICULUM.flatMap(
  (module) => module.lessons.map((lesson) => ({ module, lesson })),
);

export const findModule = (id: string) => CURRICULUM.find((m) => m.id === id) ?? null;
export const findAcademyLesson = (id: string) => ALL_LESSONS.find((x) => x.lesson.id === id) ?? null;
