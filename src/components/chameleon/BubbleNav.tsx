import React, { useState, useRef, useEffect, useCallback, useMemo, startTransition, type CSSProperties } from "react";
import { useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import {
  DraftingCompass,
  Wrench,
  Home,
  BookOpen,
  User,
  Calculator,
  PenTool,
  Layers,
  ChevronRight,
} from "lucide-react";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { createProject, type NewProjectInput } from "@/lib/projects/store";
import { useSettings } from "@/lib/settings/SettingsProvider";
import {
  CALDRA_ACCENT_COLOR_KEY,
  hexToRgbChannels,
  resolveAccentColorTokens,
} from "@/lib/settings/appearancePreferences";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Helper de conversão de cor HEX (#RGB ou #RRGGBB) para canais RGB ("r, g, b")
 * para aplicação em fundos e bordas translúcidas da Cápsula Deslizante Tonal.
 */
export function hexToRgbString(hex: string, fallback = "0, 102, 255"): string {
  const parsed = hexToRgbChannels(hex);
  return parsed ? parsed.rgb : fallback;
}

interface NavDestination {
  id: string;
  label: string;
  to: string;
  icon: typeof Home;
  matches: (pathname: string) => boolean;
}

const DESTINATIONS: NavDestination[] = [
  {
    id: "projetar",
    label: "Projetar",
    to: "/projetar",
    icon: DraftingCompass,
    matches: (p) =>
      p.startsWith("/projetar") ||
      p.startsWith("/tracagem") ||
      p.startsWith("/desenho-2d") ||
      p.startsWith("/calculadora"),
  },
  {
    id: "produzir",
    label: "Produzir",
    to: "/produzir",
    icon: Wrench,
    matches: (p) =>
      p.startsWith("/produzir") ||
      p.startsWith("/projetos") ||
      p.startsWith("/oficina") ||
      p.startsWith("/planificacao"),
  },
  {
    id: "inicio",
    label: "Início",
    to: "/",
    icon: Home,
    matches: (p) => p === "/",
  },
  {
    id: "aprenda",
    label: "Aprenda",
    to: "/aprenda",
    icon: BookOpen,
    matches: (p) =>
      p.startsWith("/aprenda") ||
      p.startsWith("/escola") ||
      p.startsWith("/biblioteca"),
  },
  {
    id: "perfil",
    label: "Perfil",
    to: "/perfil",
    icon: User,
    matches: (p) =>
      p.startsWith("/perfil") ||
      p.startsWith("/conta") ||
      p.startsWith("/configuracoes") ||
      p.startsWith("/pro"),
  },
];

export function BubbleNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const { accent, theme } = useSettings();

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [optimisticIndex, setOptimisticIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sincroniza optimisticIndex quando a rota de fato conclui a mudança
  useEffect(() => {
    setOptimisticIndex(null);
  }, [pathname]);

  // Identifica o índice do destino ativo (0 a 4)
  const activeIndex = DESTINATIONS.findIndex((d) => d.matches(pathname));
  const fallbackActiveIndex = activeIndex >= 0 ? activeIndex : 2; // Default Início (centro)
  const resolvedActiveIndex = optimisticIndex ?? fallbackActiveIndex;

  // Trava anti-spam e deduplicação de cliques/toques repetidos
  const lastNavTimeRef = useRef<number>(0);
  const lastNavIndexRef = useRef<number>(-1);

  // Resolve dinamicamente a Cor de Destaque ativa (--accent-color e --accent-rgb)
  const navAccentStyle = useMemo<CSSProperties>(() => {
    const prefersDark =
      mounted &&
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
    const isDark =
      theme === "dark" ||
      theme === "amoled" ||
      (theme === "system" && prefersDark) ||
      (mounted && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

    let storedHex: string | null = null;
    if (mounted && typeof window !== "undefined") {
      try {
        storedHex = window.localStorage.getItem(CALDRA_ACCENT_COLOR_KEY);
      } catch {
        storedHex = null;
      }
    }

    const { accentColor, accentRgb } = resolveAccentColorTokens(accent, isDark, storedHex);
    const rgbChannels = accentColor.startsWith("#")
      ? hexToRgbString(accentColor, accentRgb)
      : accentRgb;

    return {
      "--accent-color": accentColor,
      "--accent-rgb": rgbChannels,
    } as CSSProperties;
  }, [accent, theme, mounted]);

  // Escuta evento personalizado para novo projeto caso disparado
  useEffect(() => {
    const handleOpenNewProject = () => setNewProjectOpen(true);
    window.addEventListener("caldra:new-project", handleOpenNewProject);
    return () => {
      window.removeEventListener("caldra:new-project", handleOpenNewProject);
    };
  }, []);

  const navigateToDestination = useCallback(
    (index: number) => {
      const dest = DESTINATIONS[index];
      if (!dest) return;

      // Previne disparos repetidos na mesma aba
      if (dest.matches(pathname)) {
        setOptimisticIndex(null);
        return;
      }

      const now = performance.now();
      if (now - lastNavTimeRef.current < 50 && lastNavIndexRef.current === index) return;
      lastNavTimeRef.current = now;
      lastNavIndexRef.current = index;

      // Resposta visual e tátil imediata no MESMO sub-frame de entrada (<2ms, 500Hz)
      setOptimisticIndex(index);
      triggerHaptic("selection");
      AudioManager.play("ui_nav");

      // Navegação sem engasgos com transição concorrente React
      React.startTransition(() => {
        void navigate({ to: dest.to });
      });
    },
    [navigate, pathname],
  );

  const handlePointerEnter = useCallback(
    (index: number) => {
      const dest = DESTINATIONS[index];
      if (dest) {
        void router.preloadRoute({ to: dest.to }).catch(() => {});
      }
    },
    [router],
  );

  const handleCreateProject = (input: NewProjectInput) => {
    try {
      const created = createProject(input);
      setNewProjectOpen(false);
      triggerHaptic("success");
      AudioManager.play("ui_pop");
      React.startTransition(() => {
        void navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
      });
    } catch (e) {
      console.error("Erro ao criar projeto:", e);
    }
  };

  return (
    <>
      <nav
        aria-label="Navegação principal da oficina digital"
        className="caldra-floating-nav"
        style={navAccentStyle}
      >
        <div className="relative flex h-full w-full items-center">
          {/* Cápsula Deslizante de Precisão (Sliding Pill) vinculada à Cor de Destaque — GPU acelerada 190ms */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 z-0 flex h-full w-1/5 items-center justify-center"
            style={{
              transform: `translate3d(${resolvedActiveIndex * 100}%, 0, 0)`,
              transition: "transform 190ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
          >
            <div className="caldra-nav-sliding-pill" />
          </div>

          {/* 5 Botões de Destino com disparo imediato em onPointerDown e feedback <2ms */}
          {DESTINATIONS.map((dest, destIdx) => {
            const isCurrent = destIdx === resolvedActiveIndex;
            const Icon = dest.icon;

            return (
              <button
                key={dest.id}
                type="button"
                aria-label={dest.label}
                aria-current={isCurrent ? "page" : undefined}
                data-active={isCurrent ? "true" : "false"}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && e.button !== 0) return;
                  e.preventDefault();
                  navigateToDestination(destIdx);
                }}
                onPointerEnter={() => handlePointerEnter(destIdx)}
                onClick={(e) => {
                  // Fallback para acessibilidade de teclado
                  if (e.detail === 0) {
                    navigateToDestination(destIdx);
                  }
                }}
                style={{
                  touchAction: "manipulation",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTapHighlightColor: "transparent",
                  willChange: "transform, opacity",
                }}
                className="caldra-nav-item-btn focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]/50 focus-visible:ring-inset"
              >
                <Icon
                  className="caldra-nav-item-icon"
                  strokeWidth={isCurrent ? 2.2 : 1.85}
                />
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modal de Criação de Projeto Operacional (Preservado) */}
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={handleCreateProject}
      />

      {/* Bancada de Ferramentas Técnicas (Preservado) */}
      <NavToolsModal open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  );
}

/** Modal de ferramentas acessível quando chamado por atalhos */
function NavToolsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      icon: DraftingCompass,
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
      search: { tab: "chapa" },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(92vw,500px)] overflow-y-auto border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500">
            <Wrench className="size-4.5" />
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Bancada de Ferramentas
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Ferramentas técnicas operacionais de cálculo, traçado e oficina metálica.
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
                if (t.search) {
                  void navigate({ to: t.to, search: t.search });
                } else {
                  void navigate({ to: t.to });
                }
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 text-left transition-all hover:border-border hover:bg-muted/60 active:scale-[0.99] cursor-pointer touch-manipulation"
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
