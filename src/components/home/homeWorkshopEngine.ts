import type { Project } from "@/lib/projects/ProjectsProvider";

export type ProjectThumbnailKind =
  | "empty-draft"
  | "chimney-cone"
  | "flange-ring"
  | "cylinder-duct"
  | "transition-hopper"
  | "structural-frame";

const PRO_PROMO_DISMISSED_KEY = "caldra_pro_promo_dismissed_until_v1";

export function isProPromoDismissed(storage?: Storage): boolean {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!target) return false;
    const raw = target.getItem(PRO_PROMO_DISMISSED_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function dismissProPromoFor7Days(storage?: Storage): void {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!target) return;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    target.setItem(PRO_PROMO_DISMISSED_KEY, String(Date.now() + sevenDaysMs));
  } catch {
    // ignore storage errors
  }
}

export function formatCleanProjectStatus(status?: string): {
  label: string;
  textClass: string;
  dotClass: string;
} {
  switch (status) {
    case "pronto":
    case "concluido":
      return {
        label: "Pronto p/ Corte",
        textClass: "text-emerald-600 dark:text-emerald-400",
        dotClass: "bg-emerald-500",
      };
    case "em_producao":
    case "producao":
      return {
        label: "Em Produção",
        textClass: "text-cyan-600 dark:text-cyan-400",
        dotClass: "bg-cyan-500",
      };
    case "orcamento":
      return {
        label: "Em Orçamento",
        textClass: "text-amber-600 dark:text-amber-400",
        dotClass: "bg-amber-500",
      };
    default:
      return {
        label: "Em Edição",
        textClass: "text-amber-600 dark:text-amber-400",
        dotClass: "bg-amber-500",
      };
  }
}

export function formatProjectPartsSubtitle(partsCount: number): string {
  if (!Number.isFinite(partsCount) || partsCount <= 0) {
    return "Rascunho • 0 peças";
  }
  return partsCount === 1 ? "1 peça" : `${partsCount} peças`;
}

export function formatRealHeaderProjectStatus(totalProjectsCount: number): string {
  if (!Number.isFinite(totalProjectsCount) || totalProjectsCount <= 0) {
    return "NENHUM PROJETO SALVO";
  }
  return totalProjectsCount === 1
    ? "1 PROJETO NA OFICINA"
    : `${totalProjectsCount} PROJETOS NA OFICINA`;
}

function inferProjectThumbnailKind(project: Project): ProjectThumbnailKind {
  const partsCount = project.parts?.length ?? 0;
  if (partsCount === 0) return "empty-draft";

  const text = `${project.name ?? ""} ${project.description ?? ""} ${project.parts
    .map((p) => `${p.name ?? ""} ${p.templateSlug ?? ""}`)
    .join(" ")}`.toLowerCase();

  if (text.includes("flange") || text.includes("anel") || text.includes("disco")) {
    return "flange-ring";
  }
  if (text.includes("quadro") || text.includes("grade") || text.includes("estrutura") || text.includes("portao")) {
    return "structural-frame";
  }
  if (text.includes("transi") || text.includes(" quadrado") || text.includes("moega") || text.includes("coifa")) {
    return "transition-hopper";
  }
  if (text.includes("cilindr") || text.includes("duto") || text.includes("tubo") || text.includes("virola")) {
    return "cylinder-duct";
  }
  return "chimney-cone";
}

export function resolveHomeProjectsViewModel(projects: Project[]): {
  totalProjectsCount: number;
  isRecurringUser: boolean;
  heroProject: Project | null;
  heroThumbnailKind: ProjectThumbnailKind | null;
  showContinueWorkingSection: boolean;
  continueWorkingProjects: Array<{
    project: Project;
    thumbnailKind: ProjectThumbnailKind;
  }>;
} {
  const list = Array.isArray(projects) ? [...projects] : [];
  list.sort((a, b) => {
    const ta = new Date(a.updatedAt ?? 0).getTime();
    const tb = new Date(b.updatedAt ?? 0).getTime();
    return tb - ta;
  });

  const totalProjectsCount = list.length;
  const heroProject = list[0] ?? null;
  const heroThumbnailKind = heroProject ? inferProjectThumbnailKind(heroProject) : null;

  const secondary = list.slice(1, 5).map((project) => ({
    project,
    thumbnailKind: inferProjectThumbnailKind(project),
  }));

  return {
    totalProjectsCount,
    isRecurringUser: totalProjectsCount > 0,
    heroProject,
    heroThumbnailKind,
    showContinueWorkingSection: secondary.length > 0,
    continueWorkingProjects: secondary,
  };
}

export function getHomeQuickShortcuts(plan: string): Array<{
  id: "novo-projeto-cad" | "tracagem-1-1" | "bancada-chapa" | "custos-orcamento";
  title: string;
  subtitle: string;
  badge: string;
  requiresProBadge: boolean;
}> {
  const isFree = plan === "free";
  return [
    {
      id: "novo-projeto-cad",
      title: "CHAMFER CAD 2D/3D",
      subtitle: "Desenho técnico, dobra, esquadria 45° e sólido 3D",
      badge: "CAD 3D",
      requiresProBadge: false,
    },
    {
      id: "tracagem-1-1",
      title: "Traçagem de Caldeiraria",
      subtitle: "Cone, transição quadrado-redondo, curva de gomos e boca de lobo",
      badge: "1:1 DXF",
      requiresProBadge: false,
    },
    {
      id: "bancada-chapa",
      title: "Bancada & Nesting",
      subtitle: "Aproveitamento real de chapa, Kerf CNC e fator K de dobra",
      badge: isFree ? "PRO" : "NESTING",
      requiresProBadge: isFree,
    },
    {
      id: "custos-orcamento",
      title: "Oficina, Custos & PCP",
      subtitle: "Ordens de serviço, lista de corte 6m, orçamento e QR Code",
      badge: "CALDRA OPS",
      requiresProBadge: false,
    },
  ];
}

export function resolveHomeAcademyCardState(academyState: {
  lessonsCompleted?: string[];
  quizScores?: Record<string, number>;
  streakDays?: number;
}): {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetRoute: string;
} {
  const completedCount = academyState?.lessonsCompleted?.length ?? 0;
  if (completedCount === 0) {
    return {
      eyebrow: "ACADEMIA INDUSTRIAL • TRILHA INICIAL",
      title: "Leitura de Desenho Técnico, Fator K & Planificação",
      subtitle:
        "Domine trigonometria aplicada, desconto de dobra e traçagem de caldeiraria no chão de fábrica.",
      ctaLabel: "Iniciar Aula 1",
      targetRoute: "/aprender",
    };
  }

  return {
    eyebrow: `ACADEMIA INDUSTRIAL • ${completedCount} AULA(S) CONCLUÍDA(S)`,
    title: "Continue sua Trilha de Caldeiraria & Soldagem",
    subtitle:
      "Avance para o próximo módulo prático de planificação, simbologia AWS e cálculo de massa.",
    ctaLabel: "Continuar Trilha",
    targetRoute: "/aprender",
  };
}

export function getVerifiedProDeliverables(): Array<{
  id: string;
  title: string;
  subtitle: string;
}> {
  return [
    {
      id: "dxf-cnc",
      title: "Exportação DXF 1:1 pronta para Plasma, Laser e Router CNC",
      subtitle: "Camadas técnicas CORTE_EXTERNO, CORTE_INTERNO e LINHA_DOBRA homologadas.",
    },
    {
      id: "nesting-sheet",
      title: "Nesting Industrial em Chapa + Otimizador de Barras 6m",
      subtitle: "Reduza retalhos com cálculo automático de Kerf, espaçamento e perda.",
    },
    {
      id: "pdf-dossier",
      title: "Dossiê Técnico ABNT + Orçamento Comercial em PDF",
      subtitle: "Folha A4 com carimbo NBR, vistas cotadas, BOM e composição de BDI.",
    },
  ];
}

export function computeRealNestingProof(): {
  summaryText: string;
  yieldPct: number;
  perSheet: number;
} {
  const sheetW = 1200;
  const sheetH = 3000;
  const partW = 380;
  const partH = 480;
  const kerf = 4;

  const cols = Math.floor((sheetW + kerf) / (partW + kerf));
  const rows = Math.floor((sheetH + kerf) / (partH + kerf));
  const perSheet = Math.max(1, cols * rows);
  const usedArea = perSheet * partW * partH;
  const totalArea = sheetW * sheetH;
  const yieldPct = Math.round((usedArea / totalArea) * 1000) / 10;

  return {
    summaryText: `Exemplo real em chapa 1200×3000 mm: ${perSheet} peças alocadas com ${yieldPct}% de aproveitamento útil.`,
    yieldPct,
    perSheet,
  };
}
