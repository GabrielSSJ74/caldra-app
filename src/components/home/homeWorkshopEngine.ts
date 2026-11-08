/**
 * MOTOR PURO DE ESTADO, DADOS REAIS E REGRAS DA HOME "OFICINA DIGITAL"
 *
 * Centraliza toda a lógica determinística da primeira tela do CALDRA:
 * - Resolução do Estado do Usuário (Novo = 0 projetos vs Recorrente >= 1 projeto)
 * - Regra Anti-Duplicação entre o Hero ("Retomar Trabalho Recente") e a lista "Continue trabalhando"
 * - Classificação fiel de Miniaturas Técnicas (nunca repete cone falso para projeto com 0 peças)
 * - Contagem dinâmica real do catálogo de Traçagem Paramétrica (PART_REGISTRY)
 * - Resolução do progresso real da Academia (Aprenda & Domine)
 * - Prova de valor real calculada pelo motor de Nesting CNC (nestParts) e memória de 7 dias do card PRO
 */

import { PART_REGISTRY } from "@/lib/library/registry";
import { ALL_LESSONS } from "@/lib/education/curriculum";
import { nextLesson, type AcademyState } from "@/lib/education/progress";
import { nestParts } from "@/lib/nesting/nesting";
import { planAllows, type Plan } from "@/lib/subscription/features";
import type { Project, ProjectStatus } from "@/lib/projects/store";
import type { StorageLike } from "@/lib/settings/appearancePreferences";

export const PRO_PROMO_DISMISSED_KEY = "caldra.home.pro_promo_dismissed_at";
export const PRO_PROMO_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export type ProjectThumbnailKind =
  | "empty-draft"
  | "chimney-cone"
  | "flange-ring"
  | "cylinder-duct"
  | "transition-hopper"
  | "structural-frame";

const NON_EMPTY_FALLBACK_KINDS: ProjectThumbnailKind[] = [
  "structural-frame",
  "cylinder-duct",
  "transition-hopper",
  "flange-ring",
  "chimney-cone",
];

/**
 * Retorna a contagem dinâmica real de modelos do catálogo de Traçagem Paramétrica e CNC.
 */
export function getCatalogModelsCount(): number {
  return PART_REGISTRY.length;
}

/**
 * Formata o contador de projetos ativos no cabeçalho da Home sem inventar números fictícios.
 */
export function formatRealHeaderProjectStatus(projectCount: number): string {
  const n = Math.max(0, Math.floor(projectCount));
  if (n === 0) return "Pronto para iniciar";
  if (n === 1) return "1 projeto ativo";
  return `${n} projetos ativos`;
}

/**
 * Formata a descrição de peças de um projeto tratando explicitamente o estado de 0 peças.
 */
export function formatProjectPartsSubtitle(partsCount: number): string {
  const n = Math.max(0, Math.floor(partsCount));
  if (n === 0) {
    return "Nenhuma peça ainda • Toque para adicionar";
  }
  if (n === 1) {
    return "1 peça cadastrada";
  }
  return `${n} peças cadastradas`;
}

/**
 * Formata o status semântico do projeto para exibição limpa com alto contraste em qualquer tema.
 */
export function formatCleanProjectStatus(status: ProjectStatus): {
  label: string;
  tone: "amber" | "sky" | "emerald" | "indigo";
  dotClass: string;
  textClass: string;
  badgeBgLight: string;
  badgeBgDark: string;
  badgeBorderLight: string;
  badgeBorderDark: string;
  badgeTextLight: string;
  badgeTextDark: string;
} {
  switch (status) {
    case "em-producao":
      return {
        label: "Em produção",
        tone: "emerald",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-700 dark:text-emerald-300",
        badgeBgLight: "rgba(16, 185, 129, 0.12)",
        badgeBgDark: "rgba(16, 185, 129, 0.16)",
        badgeBorderLight: "rgba(5, 150, 105, 0.30)",
        badgeBorderDark: "rgba(52, 211, 153, 0.32)",
        badgeTextLight: "#047857",
        badgeTextDark: "#6EE7B7",
      };
    case "concluido":
      return {
        label: "Concluído",
        tone: "emerald",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-700 dark:text-emerald-300",
        badgeBgLight: "rgba(16, 185, 129, 0.12)",
        badgeBgDark: "rgba(16, 185, 129, 0.16)",
        badgeBorderLight: "rgba(5, 150, 105, 0.30)",
        badgeBorderDark: "rgba(52, 211, 153, 0.32)",
        badgeTextLight: "#047857",
        badgeTextDark: "#6EE7B7",
      };
    case "entregue":
      return {
        label: "Entregue",
        tone: "emerald",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-700 dark:text-emerald-300",
        badgeBgLight: "rgba(16, 185, 129, 0.14)",
        badgeBgDark: "rgba(16, 185, 129, 0.18)",
        badgeBorderLight: "rgba(5, 150, 105, 0.34)",
        badgeBorderDark: "rgba(52, 211, 153, 0.35)",
        badgeTextLight: "#065F46",
        badgeTextDark: "#A7F3D0",
      };
    case "em-desenvolvimento":
      return {
        label: "Em projeto",
        tone: "sky",
        dotClass: "bg-sky-500",
        textClass: "text-sky-700 dark:text-sky-300",
        badgeBgLight: "rgba(2, 132, 199, 0.11)",
        badgeBgDark: "rgba(56, 189, 248, 0.15)",
        badgeBorderLight: "rgba(2, 132, 199, 0.28)",
        badgeBorderDark: "rgba(56, 189, 248, 0.32)",
        badgeTextLight: "#0369A1",
        badgeTextDark: "#7DD3FC",
      };
    case "parcial":
    case "rascunho":
    default:
      return {
        label: "Em projeto",
        tone: "amber",
        dotClass: "bg-amber-500",
        textClass: "text-amber-700 dark:text-amber-300",
        badgeBgLight: "rgba(217, 119, 6, 0.12)",
        badgeBgDark: "rgba(245, 158, 11, 0.16)",
        badgeBorderLight: "rgba(180, 83, 9, 0.30)",
        badgeBorderDark: "rgba(251, 191, 36, 0.34)",
        badgeTextLight: "#B45309",
        badgeTextDark: "#FCD34D",
      };
  }
}

function stableStringHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function matchThumbnailCategoryFromText(text: string): ProjectThumbnailKind | null {
  if (
    text.includes("cha-") ||
    text.includes("chamine") ||
    text.includes("tronco-de-cone") ||
    text.includes("cone") ||
    text.includes("reducao")
  ) {
    return "chimney-cone";
  }
  if (
    text.includes("flange") ||
    text.includes("fla-") ||
    text.includes("anel") ||
    text.includes("furacao") ||
    text.includes("disco")
  ) {
    return "flange-ring";
  }
  if (
    text.includes("quadrado-redondo") ||
    text.includes("redondo-quadrado") ||
    text.includes("transic") ||
    text.includes("moega") ||
    text.includes("coifa") ||
    text.includes("tremonha")
  ) {
    return "transition-hopper";
  }
  if (
    text.includes("curva") ||
    text.includes("gomo") ||
    text.includes("boca-de-lobo") ||
    text.includes("cilindro") ||
    text.includes("duto") ||
    text.includes("tubo") ||
    text.includes("virola")
  ) {
    return "cylinder-duct";
  }
  if (
    text.includes("escada") ||
    text.includes("estrutura") ||
    text.includes("suporte") ||
    text.includes("base") ||
    text.includes("esquadro") ||
    text.includes("quadro") ||
    text.includes("metalon")
  ) {
    return "structural-frame";
  }
  return null;
}

/**
 * Seleciona a categoria de miniatura técnica fiel de acordo com as peças e natureza real do projeto.
 * Projetos com 0 peças NUNCA recebem miniatura genérica de cone ("chimney-cone"); recebem "empty-draft".
 */
export function resolveProjectThumbnailKind(
  project: Pick<Project, "id" | "code" | "name" | "parts">,
  usedKinds?: Set<ProjectThumbnailKind>,
): ProjectThumbnailKind {
  if (!project.parts || project.parts.length === 0) {
    return "empty-draft";
  }

  const projectHeaderSig = `${project.code ?? ""} ${project.name}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const partModelsSig = project.parts
    .map((p) => `${p.modelId} ${p.name}`)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  let detected: ProjectThumbnailKind | null =
    matchThumbnailCategoryFromText(projectHeaderSig) ??
    matchThumbnailCategoryFromText(partModelsSig);

  if (!detected) {
    const hashIdx =
      stableStringHash(`${project.id}:${project.code ?? ""}:${project.name}`) %
      NON_EMPTY_FALLBACK_KINDS.length;
    detected = NON_EMPTY_FALLBACK_KINDS[hashIdx]!;
  }

  if (usedKinds && usedKinds.has(detected)) {
    const fallback = NON_EMPTY_FALLBACK_KINDS.find((k) => !usedKinds.has(k));
    if (fallback) {
      detected = fallback;
    }
  }

  usedKinds?.add(detected);
  return detected;
}

export interface HomeProjectsViewModel {
  isRecurringUser: boolean;
  totalProjectsCount: number;
  heroProject: Project | null;
  heroThumbnailKind: ProjectThumbnailKind | null;
  continueWorkingProjects: Array<{
    project: Project;
    thumbnailKind: ProjectThumbnailKind;
  }>;
  showContinueWorkingSection: boolean;
}

/**
 * Resolve o estado do Hero Adaptativo e da seção "Continue trabalhando" garantindo:
 * 1. Usuário Novo (0 projetos): heroProject = null, showContinueWorkingSection = false.
 * 2. Usuário Recorrente (>= 1 projeto): heroProject = mais recente, continueWorkingProjects = até 3 projetos seguintes SEM repetir o heroProject.
 * 3. Miniaturas técnicas diferenciadas e fiéis a cada projeto.
 */
export function resolveHomeProjectsViewModel(projects: Project[]): HomeProjectsViewModel {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const totalProjectsCount = sorted.length;

  if (totalProjectsCount === 0) {
    return {
      isRecurringUser: false,
      totalProjectsCount: 0,
      heroProject: null,
      heroThumbnailKind: null,
      continueWorkingProjects: [],
      showContinueWorkingSection: false,
    };
  }

  const usedKinds = new Set<ProjectThumbnailKind>();
  const heroProject = sorted[0]!;
  const heroThumbnailKind = resolveProjectThumbnailKind(heroProject, usedKinds);

  const remaining = sorted.slice(1, 4).map((project) => ({
    project,
    thumbnailKind: resolveProjectThumbnailKind(project, usedKinds),
  }));

  return {
    isRecurringUser: true,
    totalProjectsCount,
    heroProject,
    heroThumbnailKind,
    continueWorkingProjects: remaining,
    showContinueWorkingSection: remaining.length > 0,
  };
}

export interface HomeAcademyCardViewModel {
  hasStarted: boolean;
  completedLessons: number;
  inStudyLessons: number;
  totalLessons: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetRoute: "/aprenda";
}

/**
 * Resolve o estado real do Card Contextual da Academia ("Aprenda & Domine").
 */
export function resolveHomeAcademyCardState(
  academyState?: Partial<AcademyState> | null,
): HomeAcademyCardViewModel {
  const totalLessons = ALL_LESSONS.length;
  const lessonEntries = Object.values(academyState?.lessons ?? {});
  const completedLessons = lessonEntries.filter(
    (l) => l.mastery === "dominado" || l.mastery === "praticado",
  ).length;
  const inStudyLessons = lessonEntries.filter((l) => l.mastery === "em-estudo").length;

  const hasStarted = completedLessons > 0 || inStudyLessons > 0;

  if (hasStarted) {
    const safeState: AcademyState = {
      version: 1,
      lessons: academyState?.lessons ?? {},
    };
    const recommended = nextLesson(safeState) ?? ALL_LESSONS[0]!;
    return {
      hasStarted: true,
      completedLessons,
      inStudyLessons,
      totalLessons,
      eyebrow: `CONTINUAR ESPECIALIZAÇÃO • ${completedLessons} de ${totalLessons} lições concluídas`,
      title: recommended.lesson.title,
      subtitle: `${recommended.module.title} • ${recommended.lesson.summary}`,
      ctaLabel: "Continuar Aula →",
      targetRoute: "/aprenda",
    };
  }

  return {
    hasStarted: false,
    completedLessons: 0,
    inStudyLessons: 0,
    totalLessons,
    eyebrow: "ESPECIALIZAÇÃO • CALDEIRARIA & ESTRUTURAS",
    title: "Métodos de Traçado, Planificação e Tabelas NBR",
    subtitle: "Conformação de chapas, linha neutra, Fator K e normas técnicas de oficina.",
    ctaLabel: "Acessar Academia →",
    targetRoute: "/aprenda",
  };
}

export interface RealNestingProofResult {
  partCount: number;
  partWidthMm: number;
  partHeightMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  utilizationPctFormatted: string;
  sheetsUsed: number;
  summaryText: string;
}

/**
 * Calcula a prova real de aproveitamento de chapa usando o motor determinístico `nestParts`.
 */
export function computeRealNestingProof(): RealNestingProofResult {
  const partCount = 12;
  const partWidthMm = 620;
  const partHeightMm = 430;
  const sheetWidthMm = 3000;
  const sheetHeightMm = 1500;

  const result = nestParts(
    [
      {
        id: "home-proof-part",
        name: "Chapa Base Industrial",
        w: partWidthMm,
        h: partHeightMm,
        quantity: partCount,
        allowRotate: true,
      },
    ],
    {
      sheetW: sheetWidthMm,
      sheetH: sheetHeightMm,
      gap: 5,
      margin: 10,
      rotate: true,
    },
  );

  const pct = (result.utilization * 100).toFixed(1).replace(".", ",");
  const sheetsUsed = Math.max(1, result.sheets.length);
  const sheetLabel = sheetsUsed === 1 ? "1 chapa" : `${sheetsUsed} chapas`;

  return {
    partCount: result.placed,
    partWidthMm,
    partHeightMm,
    sheetWidthMm,
    sheetHeightMm,
    utilizationPctFormatted: `${pct}%`,
    sheetsUsed,
    summaryText: `Exemplo real: ${result.placed} peças ${partWidthMm}×${partHeightMm}mm em chapa ${sheetWidthMm}×${sheetHeightMm}mm → ${pct}% de aproveitamento (${sheetLabel})`,
  };
}

export interface ProDeliverableItem {
  id: string;
  title: string;
  subtitle: string;
  isProExclusive: boolean;
}

/**
 * Retorna os 4 entregáveis tangíveis do Caldra PRO verificados contra a matriz real de features (`features.ts`)
 * e a contagem dinâmica real do catálogo (`PART_REGISTRY.length`).
 */
export function getVerifiedProDeliverables(): ProDeliverableItem[] {
  const catalogCount = getCatalogModelsCount();
  return [
    {
      id: "dxf-cnc",
      title: "Exportação DXF 1:1 Limpa",
      subtitle: "Pronta para Laser, Plasma e CypCut",
      isProExclusive: !planAllows("free", "export.dxf.cnc") && planAllows("pro", "export.dxf.cnc"),
    },
    {
      id: "catalog-full",
      title: `Catálogo Completo (${catalogCount} Modelos 1:1)`,
      subtitle: "Cones, transições e bocas de lobo",
      isProExclusive:
        !planAllows("free", "geometry.advanced") && planAllows("pro", "geometry.advanced"),
    },
    {
      id: "nesting-cnc",
      title: "Nesting & Aproveitamento CNC",
      subtitle: "Cálculo de chapas, kerf e retalhos",
      isProExclusive: !planAllows("free", "nesting") && planAllows("pro", "nesting"),
    },
    {
      id: "quote-qr",
      title: "Orçamento PDF & Ficha QR",
      subtitle: "Custos de máquina, BDI e rastreabilidade",
      isProExclusive: !planAllows("free", "quote.pdf") && planAllows("pro", "quote.pdf"),
    },
  ];
}

/**
 * Verifica se o convite de conversão PRO foi dispensado pelo usuário nos últimos 7 dias.
 */
export function isProPromoDismissed(
  storage: StorageLike | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(PRO_PROMO_DISMISSED_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
    return nowMs - dismissedAt < PRO_PROMO_DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Registra no armazenamento local o momento em que o usuário tocou em "Agora não".
 */
export function dismissProPromoFor7Days(
  storage: StorageLike | null | undefined,
  nowMs: number = Date.now(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PRO_PROMO_DISMISSED_KEY, String(nowMs));
  } catch {
    /* ignore storage errors */
  }
}

export interface QuickShortcutSpec {
  id: "novo-projeto-cad" | "tracagem-1-1" | "bancada-chapa" | "custos-orcamento";
  title: string;
  subtitle: string;
  badge: string;
  requiresProBadge: boolean;
}

/**
 * Constrói os metadados dos 4 cartões da Grade 2x2 de Atalhos Rápidos com dados reais do sistema.
 */
export function getHomeQuickShortcuts(plan: Plan): QuickShortcutSpec[] {
  const catalogCount = getCatalogModelsCount();
  const isFreePlan = plan === "free";

  return [
    {
      id: "novo-projeto-cad",
      title: "Novo Projeto CAD",
      subtitle: "Desenhar peça ou estrutura",
      badge: "2D / 3D",
      requiresProBadge: false,
    },
    {
      id: "tracagem-1-1",
      title: "Traçagem 1:1",
      subtitle: `${catalogCount} modelos de caldeiraria`,
      badge: "PLANIFICAÇÃO",
      requiresProBadge: false,
    },
    {
      id: "bancada-chapa",
      title: "Bancada & Chapa",
      subtitle: "Nesting, lote e ficha QR",
      badge: "PRODUÇÃO",
      requiresProBadge: isFreePlan && !planAllows("free", "nesting"),
    },
    {
      id: "custos-orcamento",
      title: "Custos & Orçamento",
      subtitle: "Máquina, BDI e proposta PDF",
      badge: "COMERCIAL",
      requiresProBadge: isFreePlan && !planAllows("free", "quote.pdf"),
    },
  ];
}
