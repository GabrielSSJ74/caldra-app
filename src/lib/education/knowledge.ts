/**
 * CALDRA TECHNICAL KNOWLEDGE BASE
 *
 * Camada de CONTEÚDO TÉCNICO — sem estado de usuário, sem interface, sem
 * cálculo. Os motores matemáticos continuam em @/lib/geometry e a calculadora
 * em @/lib/calculator. Aqui mora apenas o conhecimento estruturado e a sua
 * procedência (fonte, página, seção).
 */

export type SourceId =
  | "tracagem-caldeiraria"
  | "calculos"
  | "compasso-videos"
  | "tubulacao-industrial"
  | "ebook-complementar";

export type Source = {
  id: SourceId;
  title: string;
  kind: "apostila" | "ebook" | "video";
};

export const SOURCES: Record<SourceId, Source> = {
  "tracagem-caldeiraria": { id: "tracagem-caldeiraria", title: "Traçagem de Caldeiraria", kind: "apostila" },
  calculos: { id: "calculos", title: "Cálculos", kind: "apostila" },
  "compasso-videos": { id: "compasso-videos", title: "Compasso e Vídeos", kind: "video" },
  "tubulacao-industrial": { id: "tubulacao-industrial", title: "Tubulação Industrial", kind: "apostila" },
  "ebook-complementar": { id: "ebook-complementar", title: "E-book complementar", kind: "ebook" },
};

/** Referência de origem de uma informação técnica. */
export type SourceRef = {
  sourceDocument: SourceId;
  sourcePage?: number;
  sourceSection?: string;
  sourceMethod?: string;
  sourceNotes?: string;
};

/** Estado editorial do item — impede que suposição vire regra técnica. */
export type ContentState = "verificado" | "needs-review" | "content-gap";

export type Variable = { symbol: string; meaning: string; unit?: string };

export type Formula = {
  id: string;
  category:
    | "geometria"
    | "trigonometria"
    | "arcos"
    | "cilindros"
    | "cones"
    | "reducoes"
    | "curvas"
    | "tubulacao"
    | "planificacao"
    | "desenvolvimento";
  expression: string;
  /** Expressão pronta para a Calculadora Científica, quando aplicável. */
  calculatorExpression?: string;
  computes: string;
  whenToUse: string;
  why: string;
  variables: Variable[];
  example?: string;
  sources: SourceRef[];
  state: ContentState;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  category: CompetencyId;
  concept: string;
  definition: string;
  formulas: string[];
  method?: string[];
  example?: string;
  warnings?: string[];
  commonErrors?: string[];
  prerequisites?: string[];
  relatedParts?: string[];
  relatedTools?: ("calculadora" | "tracagem" | "chamfer")[];
  sources: SourceRef[];
  state: ContentState;
};

/* ---------------------------------------------------------------- competências */

export type CompetencyId =
  | "matematica"
  | "desenho-tecnico"
  | "tracagem"
  | "planificacao"
  | "tubulacao"
  | "fabricacao";

export const COMPETENCIES: { id: CompetencyId; title: string; summary: string }[] = [
  { id: "matematica", title: "Matemática", summary: "Unidades, geometria, Pitágoras e trigonometria aplicadas." },
  { id: "desenho-tecnico", title: "Desenho técnico", summary: "Vistas, cotas, escalas e leitura de projeto." },
  { id: "tracagem", title: "Traçagem", summary: "Instrumentos, referências e transferência para a chapa." },
  { id: "planificacao", title: "Planificação", summary: "Desenvolvimento de superfícies e escolha do método." },
  { id: "tubulacao", title: "Tubulação", summary: "Planta, elevação, isométricos e cálculos de linha." },
  { id: "fabricacao", title: "Fabricação", summary: "Corte, dobra, calandra, montagem e conferência." },
];

/* ------------------------------------------------------------------- fórmulas */

export const FORMULAS: Formula[] = [
  {
    id: "circunferencia",
    category: "geometria",
    expression: "C = π × D",
    calculatorExpression: "π×",
    computes: "Comprimento da circunferência a partir do diâmetro.",
    whenToUse: "Desenvolvimento de cilindros, virolas, anéis e qualquer contorno circular.",
    why: "A circunferência é o próprio contorno da peça aberta: ao planificar um cilindro, esse comprimento vira o lado reto da chapa.",
    variables: [
      { symbol: "C", meaning: "Comprimento desenvolvido", unit: "mm" },
      { symbol: "D", meaning: "Diâmetro da linha média da chapa", unit: "mm" },
    ],
    example: "Ø400 → C = π × 400 = 1256,6 mm.",
    sources: [{ sourceDocument: "calculos", sourceSection: "Circunferência" }],
    state: "verificado",
  },
  {
    id: "pitagoras",
    category: "geometria",
    expression: "d = √(a² + b²)",
    calculatorExpression: "√(",
    computes: "Comprimento verdadeiro de um segmento inclinado.",
    whenToUse: "Diagonais, geratrizes e todo comprimento verdadeiro em triangulação.",
    why: "Na chapa só existem comprimentos verdadeiros. Pitágoras converte projeções (altura e afastamento) na medida real que será riscada.",
    variables: [
      { symbol: "a", meaning: "Cateto — afastamento horizontal", unit: "mm" },
      { symbol: "b", meaning: "Cateto — altura", unit: "mm" },
      { symbol: "d", meaning: "Hipotenusa — comprimento verdadeiro", unit: "mm" },
    ],
    example: "400 e 300 → d = 500 mm.",
    sources: [{ sourceDocument: "calculos", sourceSection: "Triângulo retângulo" }],
    state: "verificado",
  },
  {
    id: "corda-divisao",
    category: "arcos",
    expression: "corda = 2 × R × sen(180° / n)",
    computes: "Corda para dividir a circunferência em n partes iguais.",
    whenToUse: "Marcação de geratrizes e divisão de bocas na chapa, sem transferidor.",
    why: "O compasso mede cordas, não arcos. Dividir por cordas é o que se consegue realmente executar na chapa.",
    variables: [
      { symbol: "R", meaning: "Raio", unit: "mm" },
      { symbol: "n", meaning: "Número de divisões" },
    ],
    example: "Ø300 em 12 partes → corda 77,65 mm.",
    sources: [{ sourceDocument: "tracagem-caldeiraria", sourceSection: "Divisão da circunferência" }],
    state: "verificado",
  },
  {
    id: "arco-corda-flecha",
    category: "arcos",
    expression: "R = (c² / (8 × f)) + (f / 2)",
    computes: "Raio de um arco a partir da corda e da flecha medidas na peça.",
    whenToUse: "Conferência de calandragem e levantamento de raio em peça existente.",
    why: "Corda e flecha são as duas medidas que dá para tirar com régua na peça pronta; delas se recupera o raio real.",
    variables: [
      { symbol: "c", meaning: "Corda", unit: "mm" },
      { symbol: "f", meaning: "Flecha", unit: "mm" },
      { symbol: "R", meaning: "Raio do arco", unit: "mm" },
    ],
    sources: [{ sourceDocument: "compasso-videos", sourceSection: "Arco, corda e flecha" }],
    state: "needs-review",
  },
  {
    id: "polegada",
    category: "geometria",
    expression: "mm = polegada × 25,4",
    computes: "Conversão de polegada para milímetro.",
    whenToUse: "Chapas, tubos e acessórios especificados em polegadas.",
    why: "O traçado é executado em milímetro; misturar unidades no meio do cálculo é a origem mais comum de peça fora de medida.",
    variables: [{ symbol: "pol", meaning: "Medida em polegadas" }],
    example: '3/8" = 9,525 mm.',
    sources: [{ sourceDocument: "calculos", sourceSection: "Unidades" }],
    state: "verificado",
  },
  {
    id: "tangente-cone",
    category: "cones",
    expression: "tg α = (D − d) / (2 × h)",
    computes: "Ângulo de meia-abertura de um tronco de cone.",
    whenToUse: "Definir inclinação, gabarito e corte de troncos de cone e reduções.",
    why: "O ângulo descreve a inclinação da geratriz — é ele que governa o setor da planificação.",
    variables: [
      { symbol: "D", meaning: "Diâmetro maior", unit: "mm" },
      { symbol: "d", meaning: "Diâmetro menor", unit: "mm" },
      { symbol: "h", meaning: "Altura no eixo", unit: "mm" },
    ],
    sources: [{ sourceDocument: "tracagem-caldeiraria", sourceSection: "Tronco de cone" }],
    state: "verificado",
  },
];

export const formulaById = (id: string) => FORMULAS.find((f) => f.id === id) ?? null;

/* --------------------------------------------------------------- conhecimento */

export const KNOWLEDGE: KnowledgeItem[] = [
  {
    id: "unidades-medida",
    title: "Unidades e conversões",
    category: "matematica",
    concept: "Toda a fabricação metálica trabalha em milímetro; polegadas aparecem em material importado e tubulação.",
    definition:
      "Milímetro é a unidade de traçagem. A polegada é convertida antes de qualquer conta, nunca depois.",
    formulas: ["polegada"],
    example: '1/2" = 12,7 mm · 3/8" = 9,525 mm',
    commonErrors: ["Converter só no final e arrastar erro de arredondamento para todas as cotas."],
    relatedTools: ["calculadora"],
    sources: [{ sourceDocument: "calculos", sourceSection: "Unidades" }],
    state: "verificado",
  },
  {
    id: "raio-diametro-perimetro",
    title: "Raio, diâmetro e perímetro",
    category: "matematica",
    concept: "As três medidas que descrevem qualquer seção circular e sustentam todo desenvolvimento.",
    definition:
      "Raio é do centro à borda; diâmetro é o dobro; perímetro é o contorno desenvolvido da seção.",
    formulas: ["circunferencia"],
    warnings: ["Use sempre o diâmetro da linha média da chapa, não o externo."],
    commonErrors: ["Usar diâmetro externo em chapa grossa e obter virola comprida demais."],
    relatedTools: ["calculadora", "tracagem"],
    sources: [{ sourceDocument: "calculos", sourceSection: "Circunferência" }],
    state: "verificado",
  },
  {
    id: "arco-corda-flecha",
    title: "Arco, corda e flecha",
    category: "matematica",
    concept: "As medidas práticas de um arco na peça real.",
    definition:
      "Corda é a reta entre as extremidades do arco; flecha é a altura do arco em relação à corda; delas se obtém o raio.",
    formulas: ["arco-corda-flecha", "corda-divisao"],
    prerequisites: ["raio-diametro-perimetro"],
    relatedTools: ["calculadora"],
    sources: [{ sourceDocument: "compasso-videos", sourceSection: "Arco, corda e flecha" }],
    state: "needs-review",
  },
  {
    id: "triangulo-retangulo",
    title: "Triângulo retângulo e Pitágoras",
    category: "matematica",
    concept: "A ferramenta que transforma projeções em comprimento verdadeiro.",
    definition: "Em todo triângulo retângulo a hipotenusa é a raiz da soma dos quadrados dos catetos.",
    formulas: ["pitagoras"],
    prerequisites: ["unidades-medida"],
    relatedTools: ["calculadora", "tracagem"],
    sources: [{ sourceDocument: "calculos", sourceSection: "Triângulo retângulo" }],
    state: "verificado",
  },
  {
    id: "trigonometria-basica",
    title: "Seno, cosseno e tangente",
    category: "matematica",
    concept: "Relações que ligam ângulos e lados — inclinações, ângulos de corte e alturas inacessíveis.",
    definition:
      "sen = cateto oposto / hipotenusa · cos = cateto adjacente / hipotenusa · tg = oposto / adjacente.",
    formulas: ["tangente-cone", "pitagoras"],
    prerequisites: ["triangulo-retangulo"],
    relatedTools: ["calculadora", "tracagem"],
    sources: [{ sourceDocument: "tracagem-caldeiraria", sourceSection: "Trigonometria aplicada" }],
    state: "verificado",
  },
  {
    id: "o-que-e-caldeiraria",
    title: "O que é caldeiraria",
    category: "fabricacao",
    concept: "Fabricar peças a partir de chapas e perfis conformados.",
    definition:
      "Traçagem, corte, calandragem, dobra, montagem e solda. O traçador converte medidas de projeto em desenvolvimento plano.",
    formulas: ["circunferencia"],
    relatedTools: ["tracagem", "chamfer"],
    sources: [{ sourceDocument: "tracagem-caldeiraria", sourceSection: "Introdução" }],
    state: "verificado",
  },
  {
    id: "verdadeira-grandeza",
    title: "Verdadeira grandeza",
    category: "desenho-tecnico",
    concept: "Só se risca na chapa aquilo que está em verdadeira grandeza.",
    definition:
      "Uma medida aparece em verdadeira grandeza quando o plano que a contém é paralelo ao plano de projeção; caso contrário está encurtada.",
    formulas: ["pitagoras"],
    prerequisites: ["triangulo-retangulo"],
    sources: [{ sourceDocument: "tracagem-caldeiraria", sourceSection: "Vistas e verdadeira grandeza" }],
    state: "needs-review",
  },
];

export const knowledgeById = (id: string) => KNOWLEDGE.find((k) => k.id === id) ?? null;
