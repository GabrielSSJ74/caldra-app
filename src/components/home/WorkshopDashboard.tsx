import { useState, useEffect, useMemo, startTransition } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileSpreadsheet,
  FolderKanban,
  Layers,
  Package,
  PenTool,
  Plus,
  Ruler,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { HomeCinematicHero } from "@/components/home/HomeCinematicHero";
import {
  computeRealNestingProof,
  dismissProPromoFor7Days,
  formatCleanProjectStatus,
  formatProjectPartsSubtitle,
  formatRealHeaderProjectStatus,
  getHomeQuickShortcuts,
  getVerifiedProDeliverables,
  isProPromoDismissed,
  resolveHomeAcademyCardState,
  resolveHomeProjectsViewModel,
  type ProjectThumbnailKind,
} from "@/components/home/homeWorkshopEngine";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { MaterialManager } from "@/components/chameleon/MaterialManager";
import {
  createProject,
  useProjects,
  type NewProjectInput,
  type Project,
} from "@/lib/projects/store";
import { openPartInChamfer } from "@/lib/projects/chamfer";
import { useSubscription } from "@/lib/subscription/SubscriptionProvider";
import { useAcademy } from "@/lib/education/progress";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { resolveAccentColorTokens } from "@/lib/settings/appearancePreferences";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NavigationAreaContainer } from "@/components/layout/NavigationAreaContainer";
import { cn } from "@/lib/utils";

/* =========================================================================
   1. MINIATURAS TÉCNICAS REAIS E DIFERENCIADAS (48×48 PX, ZERO REPETIÇÃO FALSA)
   ========================================================================= */

/** Miniatura 0: Rascunho vazio (0 peças cadastradas) — Prancheta com eixo e símbolo + */
function EmptyDraftBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full select-none", className)} fill="none">
      <rect width="64" height="64" className="fill-slate-100/95 dark:fill-[#0B101B]" />
      <g stroke="#38BDF8" strokeWidth="0.45" strokeOpacity="0.22">
        <line x1="8" y1="16" x2="56" y2="16" />
        <line x1="8" y1="32" x2="56" y2="32" />
        <line x1="8" y1="48" x2="56" y2="48" />
        <line x1="16" y1="8" x2="16" y2="56" />
        <line x1="32" y1="8" x2="32" y2="56" />
        <line x1="48" y1="8" x2="48" y2="56" />
      </g>
      <rect
        x="12"
        y="12"
        width="40"
        height="40"
        rx="6"
        stroke="#94A3B8"
        strokeWidth="1.2"
        strokeDasharray="3.5 2.5"
      />
      <circle cx="32" cy="32" r="10" className="fill-amber-500/15" stroke="#F59E0B" strokeWidth="1.2" />
      <line x1="32" y1="27" x2="32" y2="37" stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="27" y1="32" x2="37" y2="32" stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Miniatura 1: Chaminé Industrial / Redução Cônica (CHA-001) */
function ChimneyConicalBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full select-none", className)} fill="none">
      <rect width="64" height="64" className="fill-slate-100/95 dark:fill-[#0B101B]" />
      <g stroke="#38BDF8" strokeWidth="0.4" strokeOpacity="0.2">
        <line x1="6" y1="16" x2="58" y2="16" />
        <line x1="6" y1="32" x2="58" y2="32" />
        <line x1="6" y1="48" x2="58" y2="48" />
        <line x1="32" y1="6" x2="32" y2="58" />
      </g>
      <line x1="32" y1="6" x2="32" y2="58" stroke="#EF4444" strokeWidth="0.65" strokeDasharray="3 1.5" strokeOpacity="0.7" />
      <rect x="23" y="10" width="18" height="12" className="fill-sky-500/15" stroke="#0284C7" strokeWidth="1.1" />
      <polygon
        points="23,22 41,22 50,42 14,42"
        className="fill-amber-500/18"
        stroke="#F59E0B"
        strokeWidth="1.2"
      />
      <line x1="27" y1="22" x2="22" y2="42" stroke="#F59E0B" strokeWidth="0.65" strokeDasharray="2 1.2" />
      <line x1="37" y1="22" x2="42" y2="42" stroke="#F59E0B" strokeWidth="0.65" strokeDasharray="2 1.2" />
      <rect x="14" y="42" width="36" height="8" className="fill-sky-500/15" stroke="#0284C7" strokeWidth="1.1" />
    </svg>
  );
}

/** Miniatura 2: Flange Circular Furado com PCD (FLA-001) */
function FlangeCircularBlueprintGraphic({ className }: { className?: string }) {
  const holeAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full select-none", className)} fill="none">
      <rect width="64" height="64" className="fill-slate-100/95 dark:fill-[#0B101B]" />
      <line x1="32" y1="6" x2="32" y2="58" stroke="#EF4444" strokeWidth="0.6" strokeDasharray="3 1.5" strokeOpacity="0.65" />
      <line x1="6" y1="32" x2="58" y2="32" stroke="#EF4444" strokeWidth="0.6" strokeDasharray="3 1.5" strokeOpacity="0.65" />
      <circle cx="32" cy="32" r="21" className="fill-sky-500/15" stroke="#0284C7" strokeWidth="1.25" />
      <circle cx="32" cy="32" r="15.5" stroke="#F59E0B" strokeWidth="0.75" strokeDasharray="2.5 1.5" />
      <circle cx="32" cy="32" r="9" className="fill-white dark:fill-[#070A0F]" stroke="#0284C7" strokeWidth="1.1" />
      {holeAngles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const hx = Number((32 + 15.5 * Math.cos(rad)).toFixed(2));
        const hy = Number((32 + 15.5 * Math.sin(rad)).toFixed(2));
        return (
          <circle
            key={deg}
            cx={hx}
            cy={hy}
            r="1.9"
            className="fill-white dark:fill-[#070A0F]"
            stroke="#0284C7"
            strokeWidth="0.9"
          />
        );
      })}
    </svg>
  );
}

/** Miniatura 3: Duto Cilíndrico / Curva de Gomos / Tubulação */
function CylinderDuctBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full select-none", className)} fill="none">
      <rect width="64" height="64" className="fill-slate-100/95 dark:fill-[#0B101B]" />
      <ellipse cx="32" cy="15" rx="16" ry="5.5" className="fill-sky-500/20" stroke="#0284C7" strokeWidth="1.2" />
      <path
        d="M 16 15 L 16 47 A 16 5.5 0 0 0 48 47 L 48 15"
        className="fill-sky-500/12"
        stroke="#0284C7"
        strokeWidth="1.2"
      />
      <path d="M 16 26 A 16 5 0 0 0 48 26" stroke="#F59E0B" strokeWidth="0.85" strokeDasharray="2.5 1.5" />
      <path d="M 16 37 A 16 5 0 0 0 48 37" stroke="#F59E0B" strokeWidth="0.85" strokeDasharray="2.5 1.5" />
    </svg>
  );
}

/** Miniatura 4: Transição Quadrado-Redondo / Moega Piramidal */
function TransitionHopperBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full select-none", className)} fill="none">
      <rect width="64" height="64" className="fill-slate-100/95 dark:fill-[#0B101B]" />
      <polygon
        points="11,15 53,15 43,47 21,47"
        className="fill-emerald-500/15"
        stroke="#10B981"
        strokeWidth="1.2"
      />
      <ellipse cx="32" cy="15" rx="12" ry="4.2" className="fill-sky-500/20" stroke="#0284C7" strokeWidth="1.1" />
      <line x1="11" y1="15" x2="21" y2="47" stroke="#F59E0B" strokeWidth="0.8" strokeDasharray="2 1.2" />
      <line x1="53" y1="15" x2="43" y2="47" stroke="#F59E0B" strokeWidth="0.8" strokeDasharray="2 1.2" />
      <line x1="32" y1="19" x2="21" y2="47" stroke="#F59E0B" strokeWidth="0.75" strokeDasharray="2 1.2" />
      <line x1="32" y1="19" x2="43" y2="47" stroke="#F59E0B" strokeWidth="0.75" strokeDasharray="2 1.2" />
    </svg>
  );
}

/** Miniatura 5: Quadro Estrutural / Suporte / Chapa Base */
function StructuralFrameBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-full select-none", className)} fill="none">
      <rect width="64" height="64" className="fill-slate-100/95 dark:fill-[#0B101B]" />
      <rect
        x="12"
        y="14"
        width="40"
        height="36"
        rx="3"
        className="fill-indigo-500/15"
        stroke="#6366F1"
        strokeWidth="1.25"
      />
      <line x1="12" y1="14" x2="52" y2="50" stroke="#6366F1" strokeWidth="0.85" strokeDasharray="2.5 1.5" />
      <line x1="52" y1="14" x2="12" y2="50" stroke="#6366F1" strokeWidth="0.85" strokeDasharray="2.5 1.5" />
      <circle cx="18" cy="20" r="2.2" className="fill-white dark:fill-slate-950" stroke="#F59E0B" strokeWidth="1" />
      <circle cx="46" cy="20" r="2.2" className="fill-white dark:fill-slate-950" stroke="#F59E0B" strokeWidth="1" />
      <circle cx="18" cy="44" r="2.2" className="fill-white dark:fill-slate-950" stroke="#F59E0B" strokeWidth="1" />
      <circle cx="46" cy="44" r="2.2" className="fill-white dark:fill-slate-950" stroke="#F59E0B" strokeWidth="1" />
    </svg>
  );
}

export function ProjectTechnicalThumbnail({
  kind,
  className,
}: {
  kind: ProjectThumbnailKind;
  className?: string;
}) {
  switch (kind) {
    case "empty-draft":
      return <EmptyDraftBlueprintGraphic className={className} />;
    case "chimney-cone":
      return <ChimneyConicalBlueprintGraphic className={className} />;
    case "flange-ring":
      return <FlangeCircularBlueprintGraphic className={className} />;
    case "cylinder-duct":
      return <CylinderDuctBlueprintGraphic className={className} />;
    case "transition-hopper":
      return <TransitionHopperBlueprintGraphic className={className} />;
    case "structural-frame":
    default:
      return <StructuralFrameBlueprintGraphic className={className} />;
  }
}

/* =========================================================================
   2. COMPONENTE PRINCIPAL — HOME "OFICINA DIGITAL" (7 BLOCOS COORDENADOS)
   ========================================================================= */
export function WorkshopDashboard() {
  const navigate = useNavigate();
  const projects = useProjects();
  const { plan, requirePro } = useSubscription();
  const academyState = useAcademy();
  const { accentColor, theme } = useSettings();
  const isDark = theme === "dark";

  const triad = useMemo(
    () => resolveAccentColorTokens(accentColor, isDark),
    [accentColor, isDark],
  );

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isProPromoDismissed(window.localStorage);
  });

  // Pré-aquecimento em segundo plano (Warm-up Silencioso) do CHAMFER CAD
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (typeof window === "undefined") return;
    const prewarm = () => {
      void import("@/components/lab2d/Lab2DEditor");
      void import("@/routes/desenho-2d.index");
      void import("@/lib/lab2d/projects");
      void import("@/lib/lab2d/spatialIndex");
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(prewarm, { timeout: 1500 });
      return () => win.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(prewarm, 200);
    return () => window.clearTimeout(timer);
  }, []);

  // Modelos de estado reais e determinísticos da Home
  const projectsViewModel = useMemo(
    () => resolveHomeProjectsViewModel(projects),
    [projects],
  );
  const quickShortcuts = useMemo(() => getHomeQuickShortcuts(plan), [plan]);
  const academyCard = useMemo(
    () => resolveHomeAcademyCardState(academyState),
    [academyState],
  );
  const proDeliverables = useMemo(() => getVerifiedProDeliverables(), []);
  const realNestingProof = useMemo(() => computeRealNestingProof(), []);

  const headerProjectStatusText = formatRealHeaderProjectStatus(
    projectsViewModel.totalProjectsCount,
  );

  const handleCreateProject = (input: NewProjectInput) => {
    try {
      const created = createProject(input);
      setNewProjectOpen(false);
      triggerHaptic("success");
      AudioManager.play("ui_pop");
      startTransition(() => {
        void navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
      });
    } catch (e) {
      console.error("Falha ao criar projeto:", e);
    }
  };

  const handleOpenProjectInCad = (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    triggerHaptic("selection");
    AudioManager.play("ui_pop");
    const firstPart = project.parts[0];
    if (firstPart) {
      const chamferId = openPartInChamfer(project, firstPart);
      startTransition(() => {
        void navigate({
          to: "/desenho-2d/$projectId",
          params: { projectId: chamferId },
        });
      });
      return;
    }
    startTransition(() => {
      void navigate({
        to: "/projetos/$projectId",
        params: { projectId: project.id },
      });
    });
  };

  const handleDismissProPromo = () => {
    triggerHaptic("tap");
    if (typeof window !== "undefined") {
      dismissProPromoFor7Days(window.localStorage);
    }
    setPromoDismissed(true);
  };

  const handleUnlockProCta = () => {
    triggerHaptic("selection");
    AudioManager.play("ui_pop");
    requirePro("export.dxf.cnc");
  };

  return (
    <div
      data-testid="home-oficina-digital"
      className="relative w-full min-h-screen text-foreground overflow-x-hidden"
    >
      {/* Container principal com margens horizontais seguras de 20px (px-5) e área segura inferior generosa */}
      <NavigationAreaContainer className="pb-[calc(140px+env(safe-area-inset-bottom,24px))] space-y-4">
        {/* =========================================================================
            BLOCO 1 — CABEÇALHO & PROPOSTA DE VALOR ("OFICINA DIGITAL")
            ========================================================================= */}
        <header className="pt-2 sm:pt-3 pb-1 space-y-1.5" data-testid="home-block-header">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  backgroundColor: triad.accentColor,
                  boxShadow: `0 0 8px ${triad.accentGlow}`,
                }}
              />
              <span className="font-mono text-[10.5px] sm:text-[11px] font-bold tracking-[0.07em] uppercase text-amber-600 dark:text-amber-400 leading-tight break-words">
                COMANDO &amp; ENGENHARIA INDUSTRIAL
              </span>
            </div>

            <div className="inline-flex flex-wrap items-center gap-1.5">
              <span
                style={{
                  borderColor: triad.accentBorder,
                  backgroundColor: triad.accentSurface,
                  color: triad.accentColor,
                }}
                className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wider uppercase border whitespace-nowrap shrink-0"
              >
                CALDRA HUB
              </span>
              <span
                data-testid="home-header-project-counter"
                suppressHydrationWarning
                className="inline-flex items-center rounded-md border border-slate-900/12 dark:border-white/12 bg-slate-900/[0.04] dark:bg-white/[0.05] px-2 py-0.5 font-mono text-[9.5px] font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
              >
                {headerProjectStatusText}
              </span>
            </div>
          </div>

          <div>
            <h1 className="font-display text-[26px] sm:text-[28px] font-extrabold tracking-tight text-slate-950 dark:text-white leading-[1.1] break-words">
              Oficina Digital
            </h1>
            <p className="mt-1 text-[12.5px] sm:text-[13px] font-normal text-slate-600 dark:text-slate-300 leading-[1.4] max-w-2xl break-words">
              Do desenho técnico e da planificação 1:1 ao plano de corte CNC e ao orçamento comercial.
            </p>
          </div>
        </header>

        {/* =========================================================================
            BLOCO 2 — HERO ADAPTATIVO: "RETOMAR TRABALHO RECENTE" (ESTADO A)
                      OU "COMECE SEU PRIMEIRO PROJETO" (ESTADO B)
            ========================================================================= */}
        {projectsViewModel.isRecurringUser && projectsViewModel.heroProject ? (
          (() => {
            const heroProj = projectsViewModel.heroProject;
            const heroThumb = projectsViewModel.heroThumbnailKind ?? "chimney-cone";
            const statusInfo = formatCleanProjectStatus(heroProj.status);
            const partsSubtitle = formatProjectPartsSubtitle(heroProj.parts.length);

            return (
              <section
                aria-label="Retomar trabalho recente"
                data-testid="home-hero-recurring"
                data-hero-project-id={heroProj.id}
                style={{
                  borderColor: triad.accentBorder,
                }}
                className="relative overflow-hidden rounded-[22px] border bg-white/88 dark:bg-slate-900/75 backdrop-blur-xl px-4 py-3.5 shadow-sm transition-all"
              >
                {/* Linha superior do Hero: Eyebrow + Código + Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: triad.accentColor,
                        boxShadow: `0 0 8px ${triad.accentGlow}`,
                      }}
                    />
                    <span className="font-mono text-[10.5px] font-bold tracking-[0.07em] uppercase text-slate-700 dark:text-slate-300">
                      RETOMAR TRABALHO RECENTE
                    </span>
                    {heroProj.code && (
                      <span className="rounded-md border border-slate-900/12 dark:border-white/12 bg-slate-900/[0.05] dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                        {heroProj.code}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-slate-900/10 dark:border-white/10 bg-slate-900/[0.04] dark:bg-white/[0.05] px-2.5 py-0.5 font-mono text-[10px] font-bold",
                      statusInfo.textClass,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", statusInfo.dotClass)} />
                    {statusInfo.label}
                  </span>
                </div>

                {/* Corpo do Hero: Miniatura 48x48 + Nome completo + Contagem de peças + Ações */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <Link
                    to="/projetos/$projectId"
                    params={{ projectId: heroProj.id }}
                    onClick={() => {
                      triggerHaptic("tap");
                      AudioManager.play("ui_nav");
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 group/herolink text-left"
                  >
                    <div
                      data-testid="home-hero-thumbnail"
                      data-thumbnail-kind={heroThumb}
                      className="size-[48px] shrink-0 overflow-hidden rounded-[12px] border border-slate-900/15 dark:border-white/15 bg-slate-100 dark:bg-slate-950 shadow-inner"
                    >
                      <ProjectTechnicalThumbnail kind={heroThumb} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-[16px] font-bold text-slate-950 dark:text-white leading-snug break-words group-hover/herolink:underline">
                        {heroProj.name}
                      </h2>
                      <p className="mt-0.5 font-mono text-[11.5px] text-slate-600 dark:text-slate-300 leading-snug break-words">
                        {partsSubtitle}
                      </p>
                    </div>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      to="/projetos/$projectId"
                      params={{ projectId: heroProj.id }}
                      onClick={() => {
                        triggerHaptic("tap");
                        AudioManager.play("ui_nav");
                      }}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-900/15 dark:border-white/15 bg-slate-900/[0.04] dark:bg-white/[0.05] px-3 font-mono text-[11.5px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] transition-all"
                    >
                      Ficha da Obra
                    </Link>

                    <button
                      type="button"
                      data-testid="home-hero-open-cad-cta"
                      onClick={(e) => handleOpenProjectInCad(heroProj, e)}
                      style={{
                        background: triad.accentGradient,
                        borderColor: triad.accentBorder,
                        boxShadow: `0 6px 18px -4px ${triad.accentGlow}`,
                      }}
                      className="inline-flex flex-1 sm:flex-initial min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-4 font-display text-[12.5px] font-bold text-white active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <span>Abrir no CAD</span>
                      <ArrowRight className="size-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </section>
            );
          })()
        ) : (
          /* ESTADO B — USUÁRIO NOVO (0 PROJETOS SALVOS) */
          <section
            aria-label="Comece seu primeiro projeto"
            data-testid="home-hero-new-user"
            style={{
              borderColor: triad.accentBorder,
            }}
            className="relative overflow-hidden rounded-[22px] border bg-white/88 dark:bg-slate-900/75 backdrop-blur-xl px-4 py-3.5 shadow-sm"
          >
            <div className="flex items-center gap-1.5 pb-1">
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  backgroundColor: triad.accentColor,
                  boxShadow: `0 0 8px ${triad.accentGlow}`,
                }}
              />
              <span className="font-mono text-[10.5px] font-bold tracking-[0.07em] uppercase text-slate-700 dark:text-slate-300">
                COMECE SEU PRIMEIRO PROJETO
              </span>
            </div>

            <h2 className="font-display text-[15.5px] font-bold text-slate-950 dark:text-white leading-snug">
              Escolha por onde iniciar na sua oficina:
            </h2>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Link
                to="/desenho-2d"
                data-testid="home-new-user-cta-cad"
                onClick={() => {
                  triggerHaptic("selection");
                  AudioManager.play("ui_pop");
                }}
                style={{
                  background: triad.accentGradient,
                  borderColor: triad.accentBorder,
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 font-display text-[13px] font-bold text-white shadow-sm active:scale-[0.98] transition-all"
              >
                <PenTool className="size-4 shrink-0" />
                <span>Desenhar no CAD</span>
              </Link>

              <Link
                to="/tracagem"
                data-testid="home-new-user-cta-tracagem"
                onClick={() => {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-900/15 dark:border-white/15 bg-slate-900/[0.04] dark:bg-white/[0.06] px-3.5 py-2.5 font-display text-[13px] font-bold text-slate-900 dark:text-white hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] transition-all"
              >
                <Compass className="size-4 shrink-0 text-amber-500" />
                <span>Traçar Peça 1:1</span>
              </Link>

              <Link
                to="/oficina"
                search={{ tab: "orcamento" }}
                data-testid="home-new-user-cta-orcamento"
                onClick={() => {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-900/15 dark:border-white/15 bg-slate-900/[0.04] dark:bg-white/[0.06] px-3.5 py-2.5 font-display text-[13px] font-bold text-slate-900 dark:text-white hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] transition-all"
              >
                <Calculator className="size-4 shrink-0 text-emerald-500" />
                <span>Calcular Orçamento</span>
              </Link>
            </div>
          </section>
        )}

        {/* =========================================================================
            BLOCO 3 — VITRINE INTERATIVA DOS 3 PILARES ("VEJA O CALDRA EM AÇÃO")
            ========================================================================= */}
        <HomeCinematicHero
          onNewProject={() => setNewProjectOpen(true)}
          onOpenTools={() => setToolsOpen(true)}
        />

        {/* =========================================================================
            BLOCO 4 — CENTRAL DE ATALHOS RÁPIDOS (GRADE 2×2 VERTICAL SEM RETICÊNCIAS
                      + FAIXA DE UTILIDADES DIRETAS)
            ========================================================================= */}
        <section
          aria-label="Acesso rápido às ferramentas de oficina"
          data-testid="home-block-shortcuts"
          className="space-y-3"
        >
          <div className="flex items-center gap-1.5 px-0.5">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: triad.accentColor }}
            />
            <h2 className="font-mono text-[11.5px] font-bold tracking-[0.06em] uppercase text-slate-700 dark:text-slate-300">
              ACESSO RÁPIDO ÀS FERRAMENTAS DE OFICINA
            </h2>
          </div>

          {/* Grade 2x2 com Layout Interno Vertical (Zero text-overflow: ellipsis / Zero truncate) */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {quickShortcuts.map((card) => {
              const handleCardAction = () => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
                if (card.id === "novo-projeto-cad") {
                  setNewProjectOpen(true);
                  return;
                }
                if (card.id === "tracagem-1-1") {
                  startTransition(() => {
                    void navigate({ to: "/tracagem" });
                  });
                  return;
                }
                if (card.id === "bancada-chapa") {
                  startTransition(() => {
                    void navigate({ to: "/oficina", search: { tab: "chapa" } });
                  });
                  return;
                }
                if (card.id === "custos-orcamento") {
                  startTransition(() => {
                    void navigate({ to: "/oficina", search: { tab: "orcamento" } });
                  });
                }
              };

              return (
                <button
                  key={card.id}
                  type="button"
                  data-testid={`home-shortcut-${card.id}`}
                  onClick={handleCardAction}
                  className="group flex min-h-[112px] flex-col justify-between gap-[10px] rounded-[20px] border border-slate-900/10 dark:border-white/10 bg-white/88 dark:bg-slate-900/75 backdrop-blur-xl p-[14px] text-left shadow-sm transition-all hover:border-slate-900/25 dark:hover:border-white/25 active:scale-[0.98] cursor-pointer"
                >
                  {/* Topo do Cartão: Ícone 36x36px à esquerda + Badge técnico curto à direita */}
                  <div className="flex w-full flex-wrap items-start justify-between gap-1.5">
                    <div
                      className={cn(
                        "flex size-[36px] shrink-0 items-center justify-center rounded-[11px] border",
                        card.id === "novo-projeto-cad" &&
                          "border-rose-500/30 bg-rose-500/12 text-rose-600 dark:text-rose-400",
                        card.id === "tracagem-1-1" &&
                          "border-sky-500/30 bg-sky-500/12 text-sky-600 dark:text-sky-400",
                        card.id === "bancada-chapa" &&
                          "border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-400",
                        card.id === "custos-orcamento" &&
                          "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {card.id === "novo-projeto-cad" && <Plus className="size-4.5 stroke-[2.4]" />}
                      {card.id === "tracagem-1-1" && <Compass className="size-4.5 stroke-[2.1]" />}
                      {card.id === "bancada-chapa" && <Layers className="size-4.5 stroke-[2.1]" />}
                      {card.id === "custos-orcamento" && (
                        <Calculator className="size-4.5 stroke-[2.1]" />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <span className="rounded-md border border-slate-900/10 dark:border-white/12 bg-slate-900/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wider uppercase text-slate-600 dark:text-slate-300">
                        {card.badge}
                      </span>
                      {card.requiresProBadge && (
                        <span
                          data-testid={`home-shortcut-pro-badge-${card.id}`}
                          className="rounded-md border border-amber-500/35 bg-amber-500/12 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-300"
                        >
                          ✦ PRO
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Base do Cartão (100% da largura interna, zero reticências) */}
                  <div className="w-full">
                    <span className="block font-display text-[14px] sm:text-[14.5px] font-bold text-slate-950 dark:text-white leading-[1.2] break-words">
                      {card.title}
                    </span>
                    <span className="mt-1 block font-sans text-[12px] text-slate-600 dark:text-slate-300 leading-[1.3] break-words">
                      {card.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Faixa de Utilidades Diretas (Pílulas flex-wrap sem rolagem lateral oculta e sem reticências) */}
          <div
            aria-label="Utilidades diretas da oficina"
            data-testid="home-utility-pills"
            className="flex flex-wrap items-center gap-[8px] pt-0.5"
          >
            <Link
              to="/projetos"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-900/12 dark:border-white/12 bg-white/85 dark:bg-slate-900/70 px-[12px] py-1 font-mono text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-900/25 dark:hover:border-white/25 active:scale-95 transition-all"
            >
              <FolderKanban className="size-3.5 shrink-0 text-sky-500" />
              <span suppressHydrationWarning>
                Meus Projetos ({projectsViewModel.totalProjectsCount})
              </span>
            </Link>

            <Link
              to="/calculadora"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-900/12 dark:border-white/12 bg-white/85 dark:bg-slate-900/70 px-[12px] py-1 font-mono text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-900/25 dark:hover:border-white/25 active:scale-95 transition-all"
            >
              <Calculator className="size-3.5 shrink-0 text-amber-500" />
              <span>Calculadora</span>
            </Link>

            <Link
              to="/escola/modulo/dobras"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-900/12 dark:border-white/12 bg-white/85 dark:bg-slate-900/70 px-[12px] py-1 font-mono text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-900/25 dark:hover:border-white/25 active:scale-95 transition-all"
            >
              <Ruler className="size-3.5 shrink-0 text-rose-500" />
              <span>Fator K &amp; Dobra</span>
            </Link>

            <Link
              to="/biblioteca"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-900/12 dark:border-white/12 bg-white/85 dark:bg-slate-900/70 px-[12px] py-1 font-mono text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-900/25 dark:hover:border-white/25 active:scale-95 transition-all"
            >
              <FileSpreadsheet className="size-3.5 shrink-0 text-emerald-500" />
              <span>Tabelas NBR</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
                setMaterialsOpen(true);
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-900/12 dark:border-white/12 bg-white/85 dark:bg-slate-900/70 px-[12px] py-1 font-mono text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-900/25 dark:hover:border-white/25 active:scale-95 transition-all cursor-pointer"
            >
              <Package className="size-3.5 shrink-0 text-indigo-500" />
              <span>Meus Materiais</span>
            </button>
          </div>
        </section>

        {/* =========================================================================
            BLOCO 5 — SEÇÃO "CONTINUE TRABALHANDO" (LISTA VERTICAL COMPACTA COM
                      MINIATURAS TÉCNICAS REAIS E ZERO DUPLICAÇÃO DO HERO)
            ========================================================================= */}
        {projectsViewModel.showContinueWorkingSection && (
          <section
            aria-label="Continue trabalhando"
            data-testid="home-block-continue-working"
            className="space-y-2.5"
            suppressHydrationWarning
          >
            <div className="flex items-center justify-between px-0.5">
              <h2 className="font-display text-[15px] sm:text-[16px] font-bold text-slate-950 dark:text-white tracking-tight">
                Continue trabalhando
              </h2>
              <Link
                to="/projetos"
                onClick={() => {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }}
                aria-label="Ver todos os projetos"
                className="inline-flex items-center gap-1 font-mono text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors"
              >
                <span>Ver todos ({projectsViewModel.totalProjectsCount})</span>
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            <div className="flex flex-col gap-[10px]">
              {projectsViewModel.continueWorkingProjects.map(({ project: proj, thumbnailKind }) => {
                const statusBadge = formatCleanProjectStatus(proj.status);
                const partsSubtitle = formatProjectPartsSubtitle(proj.parts.length);

                return (
                  <Link
                    key={proj.id}
                    to="/projetos/$projectId"
                    params={{ projectId: proj.id }}
                    data-testid={`home-continue-project-${proj.id}`}
                    data-thumbnail-kind={thumbnailKind}
                    onClick={() => {
                      triggerHaptic("tap");
                      AudioManager.play("ui_nav");
                    }}
                    className="group flex min-h-[68px] items-center gap-[12px] rounded-[18px] border border-slate-900/10 dark:border-white/10 bg-white/88 dark:bg-slate-900/75 backdrop-blur-xl px-[12px] py-[10px] shadow-sm transition-all hover:border-slate-900/25 dark:hover:border-white/25 active:scale-[0.99] text-left"
                  >
                    {/* Esquerda: Miniatura técnica quadrada 48x48px fiel à categoria */}
                    <div className="size-[48px] shrink-0 overflow-hidden rounded-[12px] border border-slate-900/15 dark:border-white/15 bg-slate-100 dark:bg-slate-950">
                      <ProjectTechnicalThumbnail kind={thumbnailKind} />
                    </div>

                    {/* Centro: Nome completo (até 2 linhas sem reticências) + Contagem/instrução de peças */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-display text-[14px] font-bold text-slate-950 dark:text-white leading-snug break-words">
                          {proj.name}
                        </h3>
                        {proj.code && (
                          <span className="rounded border border-slate-900/10 dark:border-white/12 bg-slate-900/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-600 dark:text-slate-300">
                            {proj.code}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 leading-snug break-words">
                        {partsSubtitle}
                      </p>
                    </div>

                    {/* Direita: Badge semântico de status + seta */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border border-slate-900/10 dark:border-white/10 bg-slate-900/[0.04] dark:bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] font-bold",
                          statusBadge.textClass,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", statusBadge.dotClass)} />
                        {statusBadge.label}
                      </span>
                      <ChevronRight className="size-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* =========================================================================
            BLOCO 6 — CARD CONTEXTUAL DA ACADEMIA ("APRENDA & DOMINE")
            ========================================================================= */}
        <section
          aria-label="Especialização e Academia Técnica"
          data-testid="home-block-academy"
          className="rounded-[20px] border border-slate-900/10 dark:border-white/10 bg-white/88 dark:bg-slate-900/75 backdrop-blur-xl p-[14px] shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/12 text-indigo-600 dark:text-indigo-400">
                <BookOpen className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 break-words">
                  {academyCard.eyebrow}
                </div>
                <h2 className="mt-0.5 font-display text-[14px] sm:text-[15px] font-bold text-slate-950 dark:text-white leading-snug break-words">
                  {academyCard.title}
                </h2>
                <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300 leading-snug break-words">
                  {academyCard.subtitle}
                </p>
              </div>
            </div>

            <Link
              to={academyCard.targetRoute}
              data-testid="home-academy-cta"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_nav");
              }}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/12 px-4 font-mono text-[11.5px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500 hover:text-slate-950 active:scale-95 transition-all"
            >
              <span>{academyCard.ctaLabel}</span>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            BLOCO 7 — CONVERSÃO ÉTICA "CALDRA PRO" (OU STATUS VIP PARA ASSINANTES)
            ========================================================================= */}
        {plan === "free" ? (
          !promoDismissed && (
            <section
              aria-label="Caldra PRO Engenharia de Produção"
              data-testid="home-block-pro-conversion"
              style={{
                borderColor: triad.accentBorder,
              }}
              className="relative overflow-hidden rounded-[24px] border bg-white/92 dark:bg-slate-900/82 backdrop-blur-xl p-[18px] shadow-md space-y-3.5"
            >
              {/* Topo: Selo Caldra PRO + Botão "Agora não" com memória de 7 dias */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  style={{
                    borderColor: triad.accentBorder,
                    backgroundColor: triad.accentSurface,
                    color: triad.accentColor,
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase"
                >
                  <Sparkles className="size-3 shrink-0" />
                  <span>✦ CALDRA PRO • ENGENHARIA DE PRODUÇÃO</span>
                </span>

                <button
                  type="button"
                  data-testid="home-pro-dismiss-btn"
                  onClick={handleDismissProPromo}
                  className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Agora não
                </button>
              </div>

              {/* Título e Subtítulo de Valor */}
              <div>
                <h2 className="font-display text-[18px] font-bold text-slate-950 dark:text-white leading-snug">
                  Precisão de Engenharia do Traçado ao Corte CNC
                </h2>
                <p className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Menos retrabalho na chapa, melhor aproveitamento de matéria-prima e orçamentos profissionais em segundos.
                </p>
              </div>

              {/* Grade de 4 Entregáveis Tangíveis verificados no código */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {proDeliverables.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 rounded-2xl border border-slate-900/10 dark:border-white/10 bg-slate-900/[0.03] dark:bg-white/[0.04] p-3"
                  >
                    <CheckCircle2
                      className="size-4 shrink-0 mt-0.5"
                      style={{ color: triad.accentColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[13px] font-bold text-slate-950 dark:text-white leading-snug">
                        {item.title}
                      </h3>
                      <p className="mt-0.5 text-[11.5px] text-slate-600 dark:text-slate-300 leading-snug">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Faixa de Prova Real calculada pelo motor nestParts */}
              <div
                data-testid="home-pro-real-nesting-proof"
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 leading-snug"
              >
                {realNestingProof.summaryText}
              </div>

              {/* Rodapé de Ação: CTA Primário + Link Secundário */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
                <button
                  type="button"
                  data-testid="home-pro-unlock-cta"
                  onClick={handleUnlockProCta}
                  style={{
                    background: triad.accentGradient,
                    borderColor: triad.accentBorder,
                    boxShadow: `0 8px 22px -4px ${triad.accentGlow}`,
                  }}
                  className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] border px-5 font-display text-[13.5px] font-bold text-white active:scale-[0.99] transition-all cursor-pointer"
                >
                  <span>✦ Desbloquear Caldra PRO →</span>
                </button>

                <Link
                  to="/pro"
                  data-testid="home-pro-compare-link"
                  onClick={() => {
                    triggerHaptic("tap");
                    AudioManager.play("ui_nav");
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center px-3 font-mono text-[11.5px] font-bold text-slate-700 dark:text-slate-300 underline underline-offset-4 hover:text-slate-950 dark:hover:text-white transition-colors"
                >
                  Ver comparativo de planos
                </Link>
              </div>
            </section>
          )
        ) : (
          /* Assinante PRO / Mestre: Faixa compacta de status ativo */
          <section
            aria-label="Status Caldra PRO Ativo"
            data-testid="home-block-pro-active"
            className="rounded-[20px] border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 font-mono text-[11.5px] font-bold text-emerald-800 dark:text-emerald-300 leading-snug"
          >
            ✦ Caldra PRO Ativo • Todos os motores de exportação DXF 1:1, Nesting CNC e Orçamentos PDF liberados
          </section>
        )}

        {/* =========================================================================
            MODAIS E DIÁLOGOS INTEGRADOS (100% FUNCIONAIS)
            ========================================================================= */}
        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          onCreate={handleCreateProject}
        />

        <TechnicalToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} />

        <Dialog open={materialsOpen} onOpenChange={setMaterialsOpen}>
          <DialogContent className="max-h-[88dvh] w-[min(95vw,680px)] overflow-y-auto border border-border bg-card p-4 text-foreground shadow-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-base font-bold text-foreground">
                Meus Materiais &amp; Ligas Metálicas
              </DialogTitle>
            </DialogHeader>
            <MaterialManager />
          </DialogContent>
        </Dialog>
      </NavigationAreaContainer>
    </div>
  );
}

/** Modal da Bancada de Ferramentas Técnicas */
function TechnicalToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  if (!open) return null;

  const tools = [
    {
      title: "Calculadora Científica",
      desc: "Trigonometria, caldeiraria e conversões angulares",
      icon: Calculator,
      color: "caldra-bubble-amber text-amber-500",
      to: "/calculadora",
    },
    {
      title: "Traçagem Paramétrica",
      desc: "Modelos 3D, planificação zero fresta e traçagem passo a passo",
      icon: Compass,
      color: "caldra-bubble-sky text-sky-500",
      to: "/tracagem",
    },
    {
      title: "Prancheta CAD 2D CHAMFER",
      desc: "Desenho vetorial técnico, cotas e exportação DXF",
      icon: PenTool,
      color: "caldra-bubble-red text-red-500",
      to: "/desenho-2d",
    },
    {
      title: "Bancada de Chapas e Nesting",
      desc: "Aproveitamento de retalho e plano de corte na chapa",
      icon: Layers,
      color: "caldra-bubble-emerald text-emerald-500",
      to: "/oficina",
      search: { tab: "chapa" as const },
    },
    {
      title: "Tarifas de Máquina e Custos",
      desc: "Cálculo de corte por metro, perfuração e dobra",
      icon: TrendingUp,
      color: "caldra-bubble-indigo text-indigo-500",
      to: "/oficina",
      search: { tab: "custo" as const },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,480px)] overflow-y-auto border border-border bg-card p-5 text-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500">
            <Wrench className="size-4.5" />
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Bancada de Ferramentas
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Acesso rápido a todos os recursos técnicos de cálculo, desenho e fabricação.
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-2">
          {tools.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
                onClose();
                startTransition(() => {
                  if (t.search) {
                    void navigate({ to: t.to, search: t.search });
                  } else {
                    void navigate({ to: t.to });
                  }
                });
              }}
              className="caldra-card flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left transition-all hover:border-amber-500/50 active:scale-[0.99] cursor-pointer touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className={cn("caldra-bubble-base size-10 shrink-0", t.color)}>
                  <t.icon className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                  <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
