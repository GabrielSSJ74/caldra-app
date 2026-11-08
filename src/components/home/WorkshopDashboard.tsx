import { useState, useRef, useEffect, startTransition } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Calculator,
  ChevronRight,
  Compass,
  History,
  Layers,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Wrench,
  PenTool,
} from "lucide-react";
import { HomeCinematicHero } from "@/components/home/HomeCinematicHero";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import {
  createProject,
  useProjects,
  type NewProjectInput,
  type Project,
  type ProjectStatus,
} from "@/lib/projects/store";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NavigationAreaHeader } from "@/components/ui/NavigationAreaHeader";
import { NavigationAreaContainer } from "@/components/layout/NavigationAreaContainer";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { cn } from "@/lib/utils";

/* =========================================================================
   1. MINIATURAS TÉCNICAS REAIS E DIFERENCIADAS PARA "CONTINUE TRABALHANDO"
   ========================================================================= */

/** Miniatura Técnica 1: Chaminé Industrial / Redução Cônica (CHA-001) */
function ChimneyConicalBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" className="fill-slate-100/90 dark:fill-[#0C1017] transition-colors" />
      {/* Grade técnica blueprint */}
      <g stroke="#38BDF8" strokeWidth="0.3" strokeOpacity="0.2">
        <line x1="5" y1="15" x2="95" y2="15" />
        <line x1="5" y1="35" x2="95" y2="35" />
        <line x1="5" y1="55" x2="95" y2="55" />
        <line x1="20" y1="5" x2="20" y2="65" />
        <line x1="50" y1="5" x2="50" y2="65" />
        <line x1="80" y1="5" x2="80" y2="65" />
      </g>

      {/* Linha de centro vertical da chaminé */}
      <line x1="50" y1="6" x2="50" y2="64" stroke="#EF4444" strokeWidth="0.5" strokeDasharray="4 1.5 1 1.5" strokeOpacity="0.65" />

      {/* Duto cilíndrico superior (Ø 400) */}
      <rect x="38" y="10" width="24" height="16" className="fill-sky-500/10" stroke="#38BDF8" strokeWidth="0.85" />
      <line x1="36" y1="10" x2="64" y2="10" stroke="#38BDF8" strokeWidth="1.1" />

      {/* Cone de transição / redução cônica (Ø 400 -> Ø 700) */}
      <polygon
        points="38,26 62,26 74,48 26,48"
        className="fill-amber-500/12"
        stroke="#F59E0B"
        strokeWidth="0.9"
      />
      {/* Geratrizes da redução cônica */}
      <line x1="44" y1="26" x2="38" y2="48" stroke="#F59E0B" strokeWidth="0.45" strokeDasharray="2 1.2" strokeOpacity="0.75" />
      <line x1="56" y1="26" x2="62" y2="48" stroke="#F59E0B" strokeWidth="0.45" strokeDasharray="2 1.2" strokeOpacity="0.75" />

      {/* Saia / Flange de base (Ø 820) */}
      <rect x="26" y="48" width="48" height="8" className="fill-sky-500/10" stroke="#38BDF8" strokeWidth="0.8" />
      <rect x="21" y="56" width="58" height="4" className="fill-slate-400/20" stroke="#38BDF8" strokeWidth="0.9" />

      {/* Cotas técnicas laterais */}
      <line x1="78" y1="26" x2="78" y2="48" stroke="#94A3B8" strokeWidth="0.45" />
      <text x="84" y="39" fill="#38BDF8" fontSize="4.8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        Ø700
      </text>
    </svg>
  );
}

/** Miniatura Técnica 2: Flange Circular Furado com PCD (FLA-001) */
function FlangeCircularBlueprintGraphic({ className }: { className?: string }) {
  const holeAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" className="fill-slate-100/90 dark:fill-[#0C1017] transition-colors" />
      <g stroke="#38BDF8" strokeWidth="0.3" strokeOpacity="0.2">
        <line x1="5" y1="15" x2="95" y2="15" />
        <line x1="5" y1="35" x2="95" y2="35" />
        <line x1="5" y1="55" x2="95" y2="55" />
        <line x1="20" y1="5" x2="20" y2="65" />
        <line x1="50" y1="5" x2="50" y2="65" />
        <line x1="80" y1="5" x2="80" y2="65" />
      </g>

      {/* Linhas de centro de simetria */}
      <line x1="50" y1="7" x2="50" y2="63" stroke="#EF4444" strokeWidth="0.45" strokeDasharray="4 1.5 1 1.5" strokeOpacity="0.6" />
      <line x1="18" y1="35" x2="82" y2="35" stroke="#EF4444" strokeWidth="0.45" strokeDasharray="4 1.5 1 1.5" strokeOpacity="0.6" />

      {/* Diâmetro externo do flange e furo central */}
      <circle cx="50" cy="35" r="24" className="fill-sky-500/10" stroke="#38BDF8" strokeWidth="1" />
      <circle cx="50" cy="35" r="18" stroke="#F59E0B" strokeWidth="0.55" strokeDasharray="2.5 1.5" strokeOpacity="0.85" />
      <circle cx="50" cy="35" r="10.5" className="fill-slate-200/70 dark:fill-[#070A0F]" stroke="#38BDF8" strokeWidth="0.85" />

      {/* 8 furos de fixação no PCD */}
      {holeAngles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const hx = Number((50 + 18 * Math.cos(rad)).toFixed(2));
        const hy = Number((35 + 18 * Math.sin(rad)).toFixed(2));
        return (
          <circle
            key={deg}
            cx={hx}
            cy={hy}
            r="2.1"
            className="fill-slate-100 dark:fill-[#070A0F]"
            stroke="#38BDF8"
            strokeWidth="0.7"
          />
        );
      })}
    </svg>
  );
}

/** Miniatura Técnica 3: Conjunto Estrutural / Moega / Duto Industrial (para demais projetos) */
function StructuralAssemblyBlueprintGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" className="fill-slate-100/90 dark:fill-[#0C1017] transition-colors" />
      <g stroke="#38BDF8" strokeWidth="0.3" strokeOpacity="0.2">
        <line x1="5" y1="15" x2="95" y2="15" />
        <line x1="5" y1="35" x2="95" y2="35" />
        <line x1="5" y1="55" x2="95" y2="55" />
        <line x1="20" y1="5" x2="20" y2="65" />
        <line x1="50" y1="5" x2="50" y2="65" />
        <line x1="80" y1="5" x2="80" y2="65" />
      </g>
      <polygon
        points="22,16 78,16 64,46 36,46"
        className="fill-emerald-500/12"
        stroke="#10B981"
        strokeWidth="0.85"
      />
      <rect x="36" y="46" width="28" height="12" className="fill-sky-500/12" stroke="#38BDF8" strokeWidth="0.85" />
      <line x1="22" y1="16" x2="36" y2="46" stroke="#F59E0B" strokeWidth="0.6" strokeDasharray="2 1" />
      <line x1="78" y1="16" x2="64" y2="46" stroke="#F59E0B" strokeWidth="0.6" strokeDasharray="2 1" />
      <line x1="50" y1="10" x2="50" y2="62" stroke="#EF4444" strokeWidth="0.45" strokeDasharray="4 1.5 1 1.5" strokeOpacity="0.6" />
    </svg>
  );
}

/** Seleciona a miniatura técnica real correspondente ao projeto (nunca repete flange para chaminé) */
function renderProjectTechnicalThumbnail(project: Project, index: number) {
  const signature = `${project.code ?? ""} ${project.name} ${project.parts.map((p) => p.modelId).join(" ")}`.toLowerCase();

  if (
    signature.includes("cha-") ||
    signature.includes("chamine") ||
    signature.includes("chaminé") ||
    signature.includes("cone") ||
    signature.includes("redu")
  ) {
    return <ChimneyConicalBlueprintGraphic />;
  }

  if (
    signature.includes("fla-") ||
    signature.includes("flange") ||
    signature.includes("anel")
  ) {
    return <FlangeCircularBlueprintGraphic />;
  }

  if (index % 3 === 0) return <ChimneyConicalBlueprintGraphic />;
  if (index % 3 === 1) return <FlangeCircularBlueprintGraphic />;
  return <StructuralAssemblyBlueprintGraphic />;
}

/** Formata o status do projeto em linguagem limpa de engenharia (sem slugs crus como 'em-desenvolvimento') */
function formatCleanProjectStatus(status: ProjectStatus): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  switch (status) {
    case "em-desenvolvimento":
      return {
        label: "Em projeto",
        dotClass: "bg-sky-500",
        textClass: "text-sky-600 dark:text-sky-400",
      };
    case "em-producao":
      return {
        label: "Em produção",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-600 dark:text-emerald-400",
      };
    case "parcial":
      return {
        label: "Parcial",
        dotClass: "bg-amber-500",
        textClass: "text-amber-600 dark:text-amber-400",
      };
    case "concluido":
      return {
        label: "Concluído",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-600 dark:text-emerald-400",
      };
    case "entregue":
      return {
        label: "Entregue",
        dotClass: "bg-indigo-500",
        textClass: "text-indigo-600 dark:text-indigo-400",
      };
    case "rascunho":
    default:
      return {
        label: "Em projeto",
        dotClass: "bg-amber-500",
        textClass: "text-amber-600 dark:text-amber-400",
      };
  }
}

/** Card: CHAMFER (Chanfro usinado 45° em bloco de aço) */
function ChamferBlockGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <defs>
        <linearGradient id="ch-top-c" x1="15" y1="15" x2="85" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A4E5A" />
          <stop offset="50%" stopColor="#2D3038" />
          <stop offset="100%" stopColor="#1E2026" />
        </linearGradient>
        <linearGradient id="ch-bevel-c" x1="35" y1="28" x2="75" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CBD5E1" />
          <stop offset="45%" stopColor="#F8FAFC" />
          <stop offset="85%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="ch-front-c" x1="20" y1="40" x2="80" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1F232B" />
          <stop offset="60%" stopColor="#13151A" />
          <stop offset="100%" stopColor="#0B0C0E" />
        </linearGradient>
      </defs>
      <rect width="100" height="70" className="fill-slate-100/90 dark:fill-[#0B0D11] transition-colors" />
      <polygon points="18,30 50,12 82,30 50,48" fill="url(#ch-top-c)" stroke="#64748B" strokeWidth="0.5" />
      <polygon points="44,45 56,45 66,54 54,54" fill="url(#ch-bevel-c)" stroke="#E2E8F0" strokeWidth="0.6" />
      <polygon points="18,30 50,48 50,66 18,48" fill="url(#ch-front-c)" stroke="#475569" strokeWidth="0.5" />
      <polygon points="50,48 82,30 82,48 50,66" fill="url(#ch-front-c)" stroke="#334155" strokeWidth="0.5" />
      <line x1="50" y1="12" x2="50" y2="48" stroke="#94A3B8" strokeWidth="0.75" strokeOpacity="0.8" />
      <line x1="18" y1="30" x2="50" y2="48" stroke="#CBD5E1" strokeWidth="0.6" strokeOpacity="0.6" />
      <line x1="50" y1="48" x2="82" y2="30" stroke="#CBD5E1" strokeWidth="0.6" strokeOpacity="0.6" />
    </svg>
  );
}

/** Card: Traçagem (Compasso e geratrizes de planificação) */
function TracingDraftGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" className="fill-slate-100/90 dark:fill-[#0B0E14] transition-colors" />
      <g stroke="#38BDF8" strokeWidth="0.25" strokeOpacity="0.18">
        <line x1="0" y1="18" x2="100" y2="18" />
        <line x1="0" y1="36" x2="100" y2="36" />
        <line x1="0" y1="54" x2="100" y2="54" />
        <line x1="20" y1="0" x2="20" y2="70" />
        <line x1="50" y1="0" x2="50" y2="70" />
        <line x1="80" y1="0" x2="80" y2="70" />
      </g>
      <path d="M 20 54 C 30 28, 70 28, 80 54" stroke="#38BDF8" strokeWidth="0.9" strokeDasharray="2 1" />
      <path d="M 32 54 C 40 38, 60 38, 68 54" stroke="#38BDF8" strokeWidth="0.75" />
      <line x1="50" y1="10" x2="20" y2="54" stroke="#F59E0B" strokeWidth="0.5" strokeOpacity="0.7" />
      <line x1="50" y1="10" x2="50" y2="54" stroke="#F59E0B" strokeWidth="0.6" strokeOpacity="0.9" />
      <line x1="50" y1="10" x2="80" y2="54" stroke="#F59E0B" strokeWidth="0.5" strokeOpacity="0.7" />
      <polygon points="65,28 78,15 82,19 69,32" fill="#475569" stroke="#94A3B8" strokeWidth="0.5" />
      <line x1="65" y1="28" x2="62" y2="31" stroke="#1E293B" strokeWidth="1" />
      <circle cx="62" cy="31" r="1.2" fill="#38BDF8" />
    </svg>
  );
}

/** Card: Calculadora Científica */
function ScientificCalculatorGraphic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={cn("size-full select-none", className)} fill="none">
      <rect width="100" height="70" className="fill-slate-100/90 dark:fill-[#0A0B0E] transition-colors" />
      <rect x="24" y="6" width="52" height="58" rx="6" fill="#1C1E24" stroke="#374151" strokeWidth="0.75" />
      <rect x="30" y="11" width="40" height="13" rx="2.5" fill="#0D1117" stroke="#1F2937" strokeWidth="0.5" />
      <text x="34" y="17" fill="#9CA3AF" fontSize="3.8" fontFamily="monospace">sin(45°)·√2</text>
      <text x="67" y="21.5" fill="#10B981" fontSize="4.8" fontFamily="monospace" fontWeight="bold" textAnchor="end">1.0000</text>
      <g fill="#262B34" stroke="#374151" strokeWidth="0.35">
        <rect x="30" y="27" width="7" height="4.5" rx="1" />
        <rect x="38.5" y="27" width="7" height="4.5" rx="1" />
        <rect x="47" y="27" width="7" height="4.5" rx="1" />
        <rect x="55.5" y="27" width="7" height="4.5" rx="1" />
        <rect x="64" y="27" width="6" height="4.5" rx="1" fill="#E65100" />

        <rect x="30" y="34" width="8" height="5.5" rx="1.2" />
        <rect x="40.5" y="34" width="8" height="5.5" rx="1.2" />
        <rect x="51" y="34" width="8" height="5.5" rx="1.2" />
        <rect x="61.5" y="34" width="8" height="5.5" rx="1.2" />

        <rect x="30" y="42" width="8" height="5.5" rx="1.2" />
        <rect x="40.5" y="42" width="8" height="5.5" rx="1.2" />
        <rect x="51" y="42" width="8" height="5.5" rx="1.2" />
        <rect x="61.5" y="42" width="8" height="5.5" rx="1.2" />

        <rect x="30" y="50" width="8" height="5.5" rx="1.2" />
        <rect x="40.5" y="50" width="8" height="5.5" rx="1.2" />
        <rect x="51" y="50" width="8" height="5.5" rx="1.2" />
        <rect x="61.5" y="50" width="8" height="5.5" rx="1.2" fill="#F59E0B" />
      </g>
    </svg>
  );
}

/* =========================================================================
   2. BARRA INDICADORA DE ROLAGEM HORIZONTAL SINCRONIZADA
   ========================================================================= */
function ScrollProgressTrack({ scrollContainerRef }: { scrollContainerRef: React.RefObject<HTMLDivElement | null> }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) {
        setProgress(0);
        return;
      }
      const ratio = el.scrollLeft / maxScroll;
      setProgress(Math.min(1, Math.max(0, ratio)));
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef]);

  return (
    <div className="flex items-center gap-1.5 px-0.5 pt-0.5">
      <div className="relative h-0.75 w-16 overflow-hidden rounded-full bg-border">
        <div
          className="absolute top-0 h-full w-7 rounded-full bg-amber-500 transition-transform duration-75"
          style={{
            transform: `translateX(${progress * 36}px)`,
          }}
        />
      </div>
      <div className="h-0.75 w-6 rounded-full bg-border" />
      <div className="h-0.75 w-3 rounded-full bg-border" />
    </div>
  );
}

/* =========================================================================
   3. COMPONENTE PRINCIPAL — WORKSHOP DASHBOARD HOME
   ========================================================================= */
export function WorkshopDashboard() {
  const navigate = useNavigate();
  const projects = useProjects();
  const { auroraStyle, setAuroraStyle } = useSettings();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // Pré-aquecimento em segundo plano (Warm-up Silencioso) do CHAMFER CAD e módulos matemáticos
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

  const scrollRefTrabalhando = useRef<HTMLDivElement>(null);

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

  const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const projectCountText =
    projects.length === 0
      ? "2 projetos ativos"
      : projects.length === 1
        ? "1 projeto ativo"
        : `${projects.length} projetos ativos`;

  return (
    <div className="relative w-full min-h-screen text-foreground overflow-x-hidden">
      <NavigationAreaContainer className="pb-[110px] space-y-3.5">
        {/* =========================================================================
            1. CABEÇALHO COMPACTO EM LINHA ÚNICA (FIM DO DESPERDÍCIO VERTICAL + ACESSO PRO)
            - Na esquerda: "● SUA OFICINA DIGITAL" + badge "CALDRA" acima de "Início"
            - Na direita (mesma linha de "Início"): chip [ ✦ PRO ] + botões circulares ✦, 🔍 e 👤
            ========================================================================= */}
        <NavigationAreaHeader
          badgeText="COMANDO & PROJETOS ATIVOS"
          badgeColor="text-amber-500"
          indicatorColor="bg-amber-500"
          secondaryBadge={
            <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wider uppercase text-amber-500 border border-amber-500/30 whitespace-nowrap shrink-0">
              CALDRA HUB
            </span>
          }
          title="Oficina Digital"
        />

        {/* =========================================================================
            2. VITRINE INTERATIVA DOS 3 PILARES DO CALDRA (ZERO SOBREPOSIÇÃO)
            ========================================================================= */}
        <HomeCinematicHero
          onNewProject={() => setNewProjectOpen(true)}
          onOpenTools={() => setToolsOpen(true)}
        />

        {/* =========================================================================
            3. GRADE 2×2 COMPACTA E ELEGANTE DE ACESSO RÁPIDO
            - 4 Cartões Horizontais Compactos (height: 76px, flex, gap: 12px, padding: 12px 14px)
            ========================================================================= */}
        <section aria-label="Atalhos principais" className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Atalho 1 — Novo projeto */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_pop");
              setNewProjectOpen(true);
            }}
            className="caldra-card group flex h-[76px] items-center gap-[12px] rounded-xl px-[14px] py-[12px] transition-all hover:border-red-500/40 active:scale-[0.98] cursor-pointer text-left"
          >
            <div className="caldra-bubble-base caldra-bubble-red size-10 shrink-0">
              <Plus className="size-4.5 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-display text-[13px] sm:text-[14px] font-bold text-foreground block leading-tight group-hover:text-red-500 transition-colors truncate">
                Novo projeto
              </span>
              <span className="text-[10.5px] sm:text-[11px] text-muted-foreground block mt-0.5 font-mono truncate">
                Criar do zero
              </span>
            </div>
          </button>

          {/* Atalho 2 — Projetos */}
          <Link
            to="/projetos"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="caldra-card group flex h-[76px] items-center gap-[12px] rounded-xl px-[14px] py-[12px] transition-all hover:border-sky-500/40 active:scale-[0.98] cursor-pointer text-left"
          >
            <div className="caldra-bubble-base caldra-bubble-sky size-10 shrink-0">
              <Layers className="size-4.5 stroke-[2]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-display text-[13px] sm:text-[14px] font-bold text-foreground block leading-tight group-hover:text-sky-500 transition-colors truncate">
                Projetos
              </span>
              <span className="text-[10.5px] sm:text-[11px] text-muted-foreground block mt-0.5 font-mono truncate" suppressHydrationWarning>
                {projectCountText}
              </span>
            </div>
          </Link>

          {/* Atalho 3 — Ferramentas */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
              setToolsOpen(true);
            }}
            className="caldra-card group flex h-[76px] items-center gap-[12px] rounded-xl px-[14px] py-[12px] transition-all hover:border-amber-500/40 active:scale-[0.98] cursor-pointer text-left"
          >
            <div className="caldra-bubble-base caldra-bubble-amber size-10 shrink-0">
              <Wrench className="size-4.5 stroke-[2]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-display text-[13px] sm:text-[14px] font-bold text-foreground block leading-tight group-hover:text-amber-500 transition-colors truncate">
                Ferramentas
              </span>
              <span className="text-[10.5px] sm:text-[11px] text-muted-foreground block mt-0.5 font-mono truncate">
                Bancada CAD
              </span>
            </div>
          </button>

          {/* Atalho 4 — Orçamentos */}
          <Link
            to="/oficina"
            search={{ tab: "orcamento" }}
            onClick={() => {
              triggerHaptic("tap");
              AudioManager.play("ui_nav");
            }}
            className="caldra-card group flex h-[76px] items-center gap-[12px] rounded-xl px-[14px] py-[12px] transition-all hover:border-emerald-500/40 active:scale-[0.98] cursor-pointer text-left"
          >
            <div className="caldra-bubble-base caldra-bubble-emerald size-10 shrink-0">
              <Calculator className="size-4.5 stroke-[2]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-display text-[13px] sm:text-[14px] font-bold text-foreground block leading-tight group-hover:text-emerald-500 transition-colors truncate">
                Orçamentos
              </span>
              <span className="text-[10.5px] sm:text-[11px] text-muted-foreground block mt-0.5 font-mono truncate">
                Custos & chapa
              </span>
            </div>
          </Link>
        </section>

        {/* =========================================================================
            4. FAIXA HORIZONTAL DE ESPECIALIZAÇÃO E PRODUTIVIDADE
            - Sem texto truncado e com botão "Acessar →" alinhado à direita
            ========================================================================= */}
        <section
          aria-label="Faixa de Especialização"
          className="caldra-specialization rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 group transition-all"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="caldra-bubble-base caldra-bubble-indigo size-9 shrink-0">
              <Sparkles className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-mono text-[8.5px] font-bold tracking-wider text-amber-500 uppercase">
                <span>ESPECIALIZAÇÃO</span>
                <span aria-hidden className="opacity-50">•</span>
                <span>CALDEIRARIA</span>
              </div>
              <h2 className="font-display text-[12px] sm:text-[13px] font-bold text-foreground leading-snug">
                Métodos de Traçado e Planificação
              </h2>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-snug mt-0.5">
                Conformação de chapas, ângulos e normas técnicas de caldeiraria.
              </p>
            </div>
          </div>

          <Link
            to="/aprenda"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_nav");
            }}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 font-mono text-[10px] font-bold text-amber-500 hover:bg-amber-500 hover:text-black active:scale-95 transition-all cursor-pointer"
          >
            <span>Acessar</span>
            <ArrowRight className="size-3 stroke-[2.5]" />
          </Link>
        </section>

        {/* =========================================================================
            5. CONTINUE TRABALHANDO (MINIATURAS TÉCNICAS DIFERENCIADAS + STATUS LIMPO)
            ========================================================================= */}
        <section aria-label="Continue trabalhando" className="space-y-2 pb-2" suppressHydrationWarning>
          <div className="flex items-center justify-between px-0.5">
            <h2 className="font-display text-sm font-bold text-foreground tracking-tight sm:text-base">
              Continue trabalhando
            </h2>
            <Link
              to="/projetos"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              aria-label="Ver todos os trabalhos"
              className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Ver todos</span>
              <ChevronRight className="size-3.5" />
            </Link>
          </div>

          {/* Trilho horizontal independente: cartões de 156–168 px com o próximo visível */}
          <div
            ref={scrollRefTrabalhando}
            className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-none snap-x snap-mandatory -mx-5 sm:-mx-6 px-5 sm:px-6"
          >
            {sortedProjects.length > 0 ? (
              sortedProjects.slice(0, 4).map((proj, idx) => {
                const statusBadge = formatCleanProjectStatus(proj.status);
                return (
                  <Link
                    key={proj.id}
                    to="/projetos/$projectId"
                    params={{ projectId: proj.id }}
                    onClick={() => {
                      triggerHaptic("tap");
                      AudioManager.play("ui_nav");
                    }}
                    className="caldra-card group relative flex w-[156px] xs:w-[162px] sm:w-[168px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl border border-border/80 p-2 transition-all hover:border-amber-500/60 active:scale-[0.98] cursor-pointer text-left"
                  >
                    <div className="relative h-[80px] w-full overflow-hidden rounded-lg border border-border/60 bg-slate-100/80 dark:bg-black/50">
                      {renderProjectTechnicalThumbnail(proj, idx)}
                      <div className="caldra-bubble-base caldra-bubble-amber absolute top-1.5 left-1.5 size-5">
                        <History className="size-3" />
                      </div>
                      {proj.code && (
                        <span className="absolute top-1.5 right-1.5 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[8px] font-bold text-muted-foreground border border-border/50">
                          {proj.code}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 px-0.5">
                      <h3 className="font-display text-[12px] font-bold text-foreground leading-tight group-hover:text-amber-500 truncate">
                        {proj.name}
                      </h3>
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-mono leading-none truncate">
                        <span className="text-muted-foreground shrink-0">
                          {proj.parts.length} {proj.parts.length === 1 ? "peça" : "peças"}
                        </span>
                        <span className="text-muted-foreground/60 shrink-0">•</span>
                        <span className={cn("font-semibold truncate", statusBadge.textClass)}>
                          {statusBadge.label}
                        </span>
                      </p>
                    </div>
                  </Link>
                );
              })
            ) : (
              /* Estado vazio útil */
              <button
                type="button"
                onPointerDown={(e) => {
                  if (e.button === 0) {
                    triggerHaptic("selection");
                    AudioManager.play("ui_pop");
                    setNewProjectOpen(true);
                  }
                }}
                onClick={(e) => {
                  if (e.detail === 0) {
                    setNewProjectOpen(true);
                  }
                }}
                className="caldra-card group relative flex w-[156px] xs:w-[162px] sm:w-[168px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl border border-dashed border-amber-500/50 p-2 transition-all hover:border-amber-500 active:scale-[0.98] cursor-pointer text-left select-none touch-manipulation"
              >
                <div className="relative h-[80px] w-full overflow-hidden rounded-lg border border-border/40 bg-slate-100/60 dark:bg-black/40 flex flex-col items-center justify-center gap-1.5 p-2">
                  <div className="caldra-bubble-base caldra-bubble-red size-7.5">
                    <Plus className="size-4 stroke-[2.5]" />
                  </div>
                  <span className="font-mono text-[8.5px] font-bold text-amber-500 tracking-wider">
                    NOVO PROJETO
                  </span>
                </div>
                <div className="mt-2 px-0.5">
                  <h3 className="font-display text-[12px] font-bold text-foreground leading-tight group-hover:text-amber-500 truncate">
                    Iniciar projeto
                  </h3>
                  <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate leading-none">
                    Comece do zero
                  </p>
                </div>
              </button>
            )}

            {/* Ferramenta 1 — CHAMFER CAD */}
            <Link
              to="/desenho-2d"
              onPointerDown={(e) => {
                if (e.button === 0) {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                  startTransition(() => {
                    void navigate({ to: "/desenho-2d" });
                  });
                }
              }}
              onClick={(e) => {
                if (e.detail === 0) {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }
              }}
              className="caldra-card group relative flex w-[156px] xs:w-[162px] sm:w-[168px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl p-2 transition-all hover:border-amber-500/50 active:scale-[0.98] cursor-pointer text-left select-none touch-manipulation"
            >
              <div className="relative h-[80px] w-full overflow-hidden rounded-lg border border-border/60 bg-slate-100/80 dark:bg-black/50">
                <ChamferBlockGraphic />
                <div className="caldra-bubble-base caldra-bubble-amber absolute top-1.5 left-1.5 size-5">
                  <TrendingUp className="size-3" />
                </div>
              </div>
              <div className="mt-2 px-0.5">
                <h3 className="font-display text-[12px] font-bold text-foreground leading-tight group-hover:text-amber-500 truncate">
                  CHAMFER CAD
                </h3>
                <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate leading-none">
                  Prancheta 2D & Cotas
                </p>
              </div>
            </Link>

            {/* Ferramenta 2 — Traçagem */}
            <Link
              to="/tracagem"
              onPointerDown={(e) => {
                if (e.button === 0) {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                  startTransition(() => {
                    void navigate({ to: "/tracagem" });
                  });
                }
              }}
              onClick={(e) => {
                if (e.detail === 0) {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }
              }}
              className="caldra-card group relative flex w-[156px] xs:w-[162px] sm:w-[168px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl p-2 transition-all hover:border-amber-500/50 active:scale-[0.98] cursor-pointer text-left select-none touch-manipulation"
            >
              <div className="relative h-[80px] w-full overflow-hidden rounded-lg border border-border/60 bg-slate-100/80 dark:bg-black/50">
                <TracingDraftGraphic />
                <div className="caldra-bubble-base caldra-bubble-amber absolute top-1.5 left-1.5 size-5">
                  <Compass className="size-3" />
                </div>
              </div>
              <div className="mt-2 px-0.5">
                <h3 className="font-display text-[12px] font-bold text-foreground leading-tight group-hover:text-amber-500 truncate">
                  Traçagem 3D
                </h3>
                <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate leading-none">
                  Planificação Zero Fresta
                </p>
              </div>
            </Link>

            {/* Ferramenta 3 — Calculadora Científica */}
            <Link
              to="/calculadora"
              onPointerDown={(e) => {
                if (e.button === 0) {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                  startTransition(() => {
                    void navigate({ to: "/calculadora" });
                  });
                }
              }}
              onClick={(e) => {
                if (e.detail === 0) {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                }
              }}
              className="caldra-card group relative flex w-[156px] xs:w-[162px] sm:w-[168px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl p-2 transition-all hover:border-amber-500/50 active:scale-[0.98] cursor-pointer text-left select-none touch-manipulation"
            >
              <div className="relative h-[80px] w-full overflow-hidden rounded-lg border border-border/60 bg-slate-100/80 dark:bg-black/50">
                <ScientificCalculatorGraphic />
                <div className="caldra-bubble-base caldra-bubble-amber absolute top-1.5 left-1.5 size-5">
                  <Calculator className="size-3" />
                </div>
              </div>
              <div className="mt-2 px-0.5">
                <h3 className="font-display text-[12px] font-bold text-foreground leading-tight group-hover:text-amber-500 truncate">
                  Calculadora Científica
                </h3>
                <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate leading-none">
                  Trigonometria & Ângulos
                </p>
              </div>
            </Link>
          </div>

          {/* Indicador de rolagem âmbar sincronizado */}
          <ScrollProgressTrack scrollContainerRef={scrollRefTrabalhando} />
        </section>

        {/* =========================================================================
            MODAIS E DIÁLOGOS INTEGRADOS (100% Funcionais)
            ========================================================================= */}
        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          onCreate={handleCreateProject}
        />

        <TechnicalToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} />
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
              onPointerDown={(e) => {
                if (e.button === 0) {
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
                }
              }}
              onClick={(e) => {
                if (e.detail === 0) {
                  onClose();
                  if (t.search) {
                    void navigate({ to: t.to, search: t.search });
                  } else {
                    void navigate({ to: t.to });
                  }
                }
              }}
              style={{
                touchAction: "manipulation",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTapHighlightColor: "transparent",
                willChange: "transform, opacity",
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
