/**
 * Camada central de permissões.
 *
 * Toda a checagem de acesso premium do app passa por aqui, alimentada pelo
 * plano resolvido em `entitlementService` (perfil remoto > cache local).
 * PROIBIDO espalhar if/else de plano pelas telas.
 */

export type Plan = "free" | "mestre" | "oficina";

export type Feature =
  | "geometry.basic"
  | "geometry.advanced"
  | "calc.explanation"
  | "planification.advanced"
  | "lab2d"
  | "export.dxf"
  | "export.pdf"
  | "export.png"
  | "projects.unlimited"
  | "school.full"
  | "library.full"
  | "workshop.manage"
  | "backup.import"
  | "components.library"
  | "nesting"
  | "cost.fabrication"
  | "quote.pdf"
  | "jobsheet"
  | "cloud.sync"
  | "calculator.scientific"
  | "materials.custom"
  | "vision.import"
  | "cut.plan"
  | "export.dxf.cnc"
  | "aurora.animated";

const MATRIX: Record<Feature, Plan[]> = {
  "geometry.basic": ["free", "mestre", "oficina"],
  "geometry.advanced": ["mestre", "oficina"],
  "calc.explanation": ["mestre", "oficina"],
  "planification.advanced": ["mestre", "oficina"],
  lab2d: ["mestre", "oficina"],
  "export.dxf": ["mestre", "oficina"],
  "export.pdf": ["mestre", "oficina"],
  "export.png": ["free", "mestre", "oficina"],
  "projects.unlimited": ["mestre", "oficina"],
  "school.full": ["mestre", "oficina"],
  "library.full": ["mestre", "oficina"],
  "workshop.manage": ["oficina"],
  "backup.import": ["free", "mestre", "oficina"],
  "components.library": ["mestre", "oficina"],
  nesting: ["mestre", "oficina"],
  "cost.fabrication": ["mestre", "oficina"],
  "quote.pdf": ["mestre", "oficina"],
  jobsheet: ["mestre", "oficina"],
  "cloud.sync": ["mestre", "oficina"],
  "calculator.scientific": ["free", "mestre", "oficina"],
  "materials.custom": ["free", "mestre", "oficina"],
  "vision.import": ["mestre", "oficina"],
  "cut.plan": ["mestre", "oficina"],
  "export.dxf.cnc": ["mestre", "oficina"],
  "aurora.animated": ["mestre", "oficina"],
};

export const FREE_PROJECT_LIMIT = 2;

export function planAllows(plan: Plan, feature: Feature): boolean {
  return MATRIX[feature].includes(plan);
}

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  mestre: "PRO",
  oficina: "Oficina",
};

/**
 * Convite específico por funcionalidade. O gate suave NUNCA mostra texto
 * genérico: o usuário precisa saber exatamente o que ganha ali.
 */
export const FEATURE_PITCH: Record<Feature, { title: string; benefit: string }> = {
  "geometry.basic": { title: "Traçagem", benefit: "Disponível em todos os planos." },
  "geometry.advanced": {
    title: "Peças avançadas",
    benefit: "Transições, curvas gomadas e derivações completas, com planificação pronta para a chapa.",
  },
  "calc.explanation": {
    title: "Cálculo passo a passo",
    benefit: "Veja cada fórmula com os seus números — confira o traçado antes de cortar.",
  },
  "planification.advanced": {
    title: "Planificação avançada",
    benefit: "Desenvolvimento completo com cotas de conferência para riscar direto na chapa.",
  },
  lab2d: {
    title: "CHAMFER",
    benefit: "Editor 2D com plano de corte, corte comum e ordem de execução para a máquina.",
  },
  "export.dxf": {
    title: "Exportar DXF",
    benefit: "Arquivo pronto para a máquina de corte, com camadas e ordem de corte preservadas.",
  },
  "export.pdf": {
    title: "Exportar PDF",
    benefit: "Folha técnica em alta definição para imprimir e levar ao chão de fábrica.",
  },
  "export.png": { title: "Exportar imagem", benefit: "Disponível em todos os planos." },
  "projects.unlimited": {
    title: "Projetos ilimitados",
    benefit: `No Free você guarda ${FREE_PROJECT_LIMIT} projetos. No PRO, todos os que a oficina precisar.`,
  },
  "school.full": {
    title: "Estudos completos",
    benefit: "Todas as aulas de traçagem, do risco ao acabamento.",
  },
  "library.full": {
    title: "Biblioteca completa",
    benefit: "Catálogo integral de peças e referências de fabricação.",
  },
  "workshop.manage": {
    title: "Gestão de oficina",
    benefit: "Recursos de equipe e produção do plano Oficina.",
  },
  "backup.import": { title: "Backup", benefit: "Disponível em todos os planos." },
  "components.library": {
    title: "Biblioteca de componentes",
    benefit: "Salve conjuntos de parâmetros (ex.: FLANGE DN200) e insira depois em um toque.",
  },
  nesting: {
    title: "Nesting modo CHAPA",
    benefit: "Encaixe as peças na chapa comercial, veja o aproveitamento real e quantas chapas comprar.",
  },
  "cost.fabrication": {
    title: "Custo de fabricação",
    benefit: "Corte, perfurações, dobras, solda, mão de obra e setup somados ao custo do material.",
  },
  "quote.pdf": {
    title: "Orçamento em PDF",
    benefit: "Proposta pronta para o cliente, com margem, desconto, impostos e validade.",
  },
  jobsheet: {
    title: "Ficha de produção",
    benefit: "Folha de bancada com cotas de conferência e QR de rastreio da peça.",
  },
  "cloud.sync": {
    title: "Nuvem e versões",
    benefit: "Seus projetos em todos os aparelhos, com histórico de versões para voltar atrás.",
  },
  "calculator.scientific": {
    title: "Calculadora científica",
    benefit: "Disponível em todos os planos.",
  },
  "materials.custom": {
    title: "Meus materiais",
    benefit: "Disponível em todos os planos.",
  },
  "vision.import": {
    title: "CHAMFER VISION",
    benefit: "Transforme foto, desenho ou logo em geometria vetorial pronta para editar e cortar.",
  },
  "cut.plan": {
    title: "Plano de corte",
    benefit: "Ordem de execução, sentido de corte, corte comum e entradas/saídas definidas por você.",
  },
  "export.dxf.cnc": {
    title: "DXF para CNC",
    benefit: "Camadas CUT e MARK, sequência e direção do jeito que a máquina de corte espera.",
  },
  "aurora.animated": {
    title: "Fundo AURORA animado",
    benefit: "O fundo vivo do CALDRA, com estilos Fluido e Suave. No Free ele fica parado.",
  },
};

/** Código de desbloqueio do protótipo, mantido para contas antigas. */
export const PROTOTYPE_MASTER_CODE = "DESPERTAR";
