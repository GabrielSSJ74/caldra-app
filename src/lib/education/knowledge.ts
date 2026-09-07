/**
 * CALDRA TECHNICAL KNOWLEDGE BASE
 *
 * Camada de CONTEÚDO TÉCNICO — sem estado de usuário, sem interface, sem
 * cálculo. Os motores matemáticos continuam em @/lib/geometry e a calculadora
 * em @/lib/calculator.
 */

/** Estado editorial do item. */
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
    state: "verificado",
  },
  {
    id: "escala",
    category: "geometria",
    expression: "medida real = medida do desenho × fator da escala",
    computes: "Conversão entre a medida do desenho e a medida da peça.",
    whenToUse: "Leitura de projeto em escala 1:2, 1:5, 1:10 e ampliações.",
    why: "A cota manda; a escala só existe para caber no papel. Quando falta cota, é a escala que devolve a medida real.",
    variables: [
      { symbol: "fator", meaning: "Denominador da escala (1:5 → 5)" },
    ],
    example: "Traço de 38 mm em 1:10 → 380 mm na peça.",
    state: "verificado",
  },
  {
    id: "perimetro-poligono",
    category: "geometria",
    expression: "P = n × L",
    computes: "Perímetro de um polígono regular de n lados.",
    whenToUse: "Anéis poligonais, bases quadradas e estruturas de n faces.",
    why: "É o desenvolvimento reto da peça poligonal — o mesmo papel que a circunferência tem no cilindro.",
    variables: [
      { symbol: "n", meaning: "Número de lados" },
      { symbol: "L", meaning: "Comprimento de um lado", unit: "mm" },
    ],
    state: "verificado",
  },
  {
    id: "linha-neutra",
    category: "planificacao",
    expression: "Dm = De − e",
    calculatorExpression: "De - e",
    computes: "Diâmetro médio (linha neutra) da chapa calandrada.",
    whenToUse: "Sempre que o diâmetro dado for externo e a chapa tiver espessura relevante.",
    why: "Ao calandrar, a face externa estica e a interna comprime; só a linha do meio mantém o comprimento original. É ela que vale no desenvolvimento.",
    variables: [
      { symbol: "De", meaning: "Diâmetro externo", unit: "mm" },
      { symbol: "e", meaning: "Espessura da chapa", unit: "mm" },
    ],
    example: "De 500 mm, chapa 8 mm → Dm = 492 mm.",
    state: "verificado",
  },
  {
    id: "desenvolvimento-cilindro",
    category: "cilindros",
    expression: "L = π × (De − e)",
    calculatorExpression: "pi * (De - e)",
    computes: "Comprimento da chapa plana de uma virola cilíndrica.",
    whenToUse: "Planificar tubos, virolas, anéis e costados cilíndricos.",
    why: "A virola é a circunferência da linha neutra aberta em linha reta.",
    variables: [
      { symbol: "De", meaning: "Diâmetro externo", unit: "mm" },
      { symbol: "e", meaning: "Espessura", unit: "mm" },
    ],
    example: "Tubo Ø 500 externo, chapa 8 mm → L = π × 492 ≈ 1545,7 mm.",
    state: "verificado",
  },
  {
    id: "boca-inclinada",
    category: "cilindros",
    expression: "y = h + (D / 2) × tg α × cos θ",
    computes: "Altura de cada geratriz de um cilindro cortado em ângulo.",
    whenToUse: "Boca de lobo, tubo cortado em esquadria e emenda inclinada.",
    why: "O corte inclinado vira uma senoide quando a virola é aberta: cada geratriz cresce conforme sua posição no círculo.",
    variables: [
      { symbol: "h", meaning: "Altura média do tubo", unit: "mm" },
      { symbol: "D", meaning: "Diâmetro médio", unit: "mm" },
      { symbol: "α", meaning: "Ângulo do corte com a horizontal", unit: "°" },
      { symbol: "θ", meaning: "Posição angular da geratriz", unit: "°" },
    ],
    state: "verificado",
  },
  {
    id: "cone-geratriz",
    category: "cones",
    expression: "G = √(h² + R²)",
    calculatorExpression: "sqrt(h^2 + R^2)",
    computes: "Geratriz (lado inclinado) de um cone completo.",
    whenToUse: "Planificar cones inteiros e definir o raio do setor circular.",
    why: "A geratriz é a hipotenusa do triângulo formado pela altura e pelo raio da base — e ela vira o raio do desenvolvimento.",
    variables: [
      { symbol: "h", meaning: "Altura do cone", unit: "mm" },
      { symbol: "R", meaning: "Raio da base", unit: "mm" },
    ],
    example: "h = 400, R = 300 → G = 500 mm.",
    state: "verificado",
  },
  {
    id: "cone-setor",
    category: "cones",
    expression: "α = 360° × R / G",
    calculatorExpression: "360 * R / G",
    computes: "Ângulo do setor circular que planifica o cone.",
    whenToUse: "Traçar o desenvolvimento do cone com compasso ou gerar o gabarito.",
    why: "O arco do setor precisa medir exatamente o perímetro da base; a razão R/G é o que fecha essa igualdade.",
    variables: [
      { symbol: "R", meaning: "Raio da base", unit: "mm" },
      { symbol: "G", meaning: "Geratriz", unit: "mm" },
    ],
    example: "R = 300, G = 500 → α = 216°.",
    state: "verificado",
  },
  {
    id: "tronco-geratriz",
    category: "cones",
    expression: "g = √(h² + (R − r)²)",
    calculatorExpression: "sqrt(h^2 + (R - r)^2)",
    computes: "Geratriz do tronco de cone (redução).",
    whenToUse: "Reduções concêntricas e troncos de cone em geral.",
    why: "A diferença entre os raios é o cateto horizontal do triângulo da geratriz.",
    variables: [
      { symbol: "h", meaning: "Altura do tronco", unit: "mm" },
      { symbol: "R", meaning: "Raio maior", unit: "mm" },
      { symbol: "r", meaning: "Raio menor", unit: "mm" },
    ],
    state: "verificado",
  },
  {
    id: "tronco-vertice",
    category: "cones",
    expression: "G = g × R / (R − r)",
    calculatorExpression: "g * R / (R - r)",
    computes: "Distância do vértice imaginário até a base maior.",
    whenToUse: "Traçar o tronco como diferença de dois setores circulares.",
    why: "O tronco é um cone completo com a ponta cortada; para riscar os dois arcos é preciso reconstruir o vértice.",
    variables: [
      { symbol: "g", meaning: "Geratriz do tronco", unit: "mm" },
      { symbol: "R", meaning: "Raio maior", unit: "mm" },
      { symbol: "r", meaning: "Raio menor", unit: "mm" },
    ],
    state: "verificado",
  },
  {
    id: "curva-gomos",
    category: "curvas",
    expression: "β = θ / (2 × (n − 1))",
    calculatorExpression: "theta / (2 * (n - 1))",
    computes: "Ângulo de corte de cada face dos gomos.",
    whenToUse: "Curvas de 45°, 60° e 90° feitas com gomos de tubo ou chapa calandrada.",
    why: "Os gomos das pontas são meios-gomos; por isso o total de faces de corte é 2(n−1), e cada uma leva a mesma fração do ângulo.",
    variables: [
      { symbol: "θ", meaning: "Ângulo total da curva", unit: "°" },
      { symbol: "n", meaning: "Número de gomos (contando os dois meios)" },
    ],
    example: "Curva 90° com 4 gomos → β = 15° por face.",
    state: "verificado",
  },
  {
    id: "curva-recuo",
    category: "curvas",
    expression: "s = (D / 2) × tg β",
    calculatorExpression: "(D / 2) * tan(beta)",
    computes: "Diferença entre a geratriz longa e a curta de um gomo.",
    whenToUse: "Marcar o corte do gomo diretamente no tubo ou na virola aberta.",
    why: "O corte inclinado desloca a boca do gomo; esse recuo é a amplitude da senoide traçada na chapa.",
    variables: [
      { symbol: "D", meaning: "Diâmetro médio", unit: "mm" },
      { symbol: "β", meaning: "Ângulo de corte da face", unit: "°" },
    ],
    state: "verificado",
  },
  {
    id: "raio-curva",
    category: "curvas",
    expression: "L_eixo = R × θ × π / 180",
    calculatorExpression: "R * theta * pi / 180",
    computes: "Comprimento do eixo da curva.",
    whenToUse: "Distribuir os gomos e conferir o comprimento total da curva montada.",
    why: "O eixo da curva é um arco; dividido pelos gomos, dá o comprimento de cada trecho.",
    variables: [
      { symbol: "R", meaning: "Raio da curva no eixo", unit: "mm" },
      { symbol: "θ", meaning: "Ângulo da curva", unit: "°" },
    ],
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
    state: "needs-review",
  },
  {
    id: "vistas-ortograficas",
    title: "Vistas ortográficas",
    category: "desenho-tecnico",
    concept: "Uma peça de três dimensões descrita por vistas planas relacionadas entre si.",
    definition:
      "Frontal, superior e lateral mostram a mesma peça em direções perpendiculares. Cada ponto guarda a mesma altura entre frontal e lateral, e o mesmo afastamento entre frontal e superior.",
    formulas: [],
    method: [
      "Escolha a frontal: a vista que melhor mostra o contorno da peça.",
      "Projete alturas na horizontal para a lateral.",
      "Projete larguras na vertical para a superior.",
      "Confira: toda medida deve fechar nas três vistas.",
    ],
    commonErrors: ["Ler uma face inclinada como se estivesse em verdadeira grandeza."],
    prerequisites: ["verdadeira-grandeza"],
    relatedTools: ["tracagem"],
    state: "verificado",
  },
  {
    id: "cotas-escalas",
    title: "Cotas e escalas",
    category: "desenho-tecnico",
    concept: "A cota é a lei da peça; a escala é só o tamanho do desenho.",
    definition:
      "Cota é a medida escrita no desenho e prevalece sobre qualquer medição feita no papel. Escala indica a proporção entre desenho e peça real.",
    formulas: ["escala"],
    warnings: ["Nunca meça o desenho com régua para obter medida de fabricação quando existe cota."],
    commonErrors: ["Aplicar escala em desenho impresso fora de proporção."],
    prerequisites: ["unidades-medida"],
    relatedTools: ["calculadora"],
    state: "verificado",
  },
  {
    id: "cortes-secoes",
    title: "Cortes e seções",
    category: "desenho-tecnico",
    concept: "Cortar o desenho para enxergar o que está escondido.",
    definition:
      "O corte remove imaginariamente parte da peça para revelar espessuras, furos e paredes internas; o hachurado marca o material atingido pelo plano de corte.",
    formulas: [],
    method: [
      "Localize a linha de corte e o sentido das setas.",
      "Leia a vista em corte olhando na direção das setas.",
      "Use as hachuras para separar material de vazio.",
    ],
    prerequisites: ["vistas-ortograficas"],
    state: "verificado",
  },
  {
    id: "instrumentos-tracagem",
    title: "Instrumentos de traçagem",
    category: "tracagem",
    concept: "Cada instrumento resolve um tipo de medida; a precisão da peça começa aqui.",
    definition:
      "Riscador marca a linha, compasso transfere raios e cordas, esquadro garante o ângulo reto, punção fixa centros e a trena resolve grandes distâncias.",
    formulas: [],
    method: [
      "Limpe e prepare a chapa antes de riscar.",
      "Defina uma aresta de referência e trabalhe sempre a partir dela.",
      "Punce os centros antes de abrir o compasso.",
      "Risque uma vez só: linha repetida vira erro de corte.",
    ],
    warnings: ["Riscador desgastado engorda a linha e some com a precisão."],
    relatedTools: ["tracagem"],
    state: "verificado",
  },
  {
    id: "referencias-tracagem",
    title: "Referências e conferência",
    category: "tracagem",
    concept: "Medidas acumuladas a partir de uma única referência não somam erro.",
    definition:
      "Escolhe-se uma aresta e uma linha de centro como origem de todas as cotas. A conferência final compara diagonais e simetria antes do corte.",
    formulas: ["pitagoras"],
    method: [
      "Marque a aresta de referência e a linha de centro.",
      "Cote tudo a partir dessa origem, nunca de marca em marca.",
      "Confira as diagonais: iguais, o traçado está em esquadro.",
    ],
    commonErrors: ["Medir de marca em marca e acumular folga em cada passo."],
    prerequisites: ["triangulo-retangulo"],
    relatedTools: ["tracagem", "calculadora"],
    state: "verificado",
  },
  {
    id: "divisao-circunferencia",
    title: "Divisão da circunferência",
    category: "tracagem",
    concept: "Dividir a boca da peça em partes iguais com o compasso, sem transferidor.",
    definition:
      "As geratrizes de um desenvolvimento nascem de divisões iguais da circunferência, marcadas por cordas calculadas.",
    formulas: ["corda-divisao", "circunferencia"],
    method: [
      "Defina o número de divisões (12 e 16 são os usuais).",
      "Calcule a corda e abra o compasso nela.",
      "Percorra a circunferência; o fechamento confirma o cálculo.",
    ],
    warnings: ["Se a última divisão não fecha, o erro está na abertura do compasso, não na fórmula."],
    prerequisites: ["raio-diametro-perimetro"],
    relatedTools: ["calculadora", "tracagem"],
    state: "verificado",
  },
];

export const knowledgeById = (id: string) => KNOWLEDGE.find((k) => k.id === id) ?? null;
