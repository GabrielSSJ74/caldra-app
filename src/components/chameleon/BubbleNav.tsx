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
  resolveBubbleTintTokens,
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
  const { accent, theme, cardOpacity, bubbleOpacity } = useSettings();

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

  // Trava anti-spam e deduplicação de cliques/toques repetidos (mesma aba dentro de 80ms)
  const lastNavTimeRef = useRef<number>(0);
  const lastNavIndexRef = useRef<number>(-1);

  // Resolve dinamicamente tokens visuais: Cor de Destaque, Opacidade dos Cartões e Opacidade Translúcida das Bolhas (0.10 a 0.38)
  const { navContainerStyle, activePillStyle, activeIconColor } = useMemo(() => {
    const prefersDark =
      mounted &&
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
    const isAmoled =
      theme === "amoled" ||
      (mounted && typeof document !== "undefined" && document.documentElement.classList.contains("amoled"));
    const isDark =
      isAmoled ||
      theme === "dark" ||
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

    const clampedCardAlpha = Math.min(1, Math.max(0.2, cardOpacity / 100));
    const bubbleTokens = resolveBubbleTintTokens(bubbleOpacity);

    const navBgRgb = isAmoled ? "5, 8, 12" : isDark ? "14, 20, 28" : "255, 255, 255";

    return {
      navContainerStyle: {
        "--accent-color": accentColor,
        "--accent-rgb": rgbChannels,
        "--card-opacity": clampedCardAlpha.toFixed(2),
        "--bubble-opacity": bubbleTokens.rawRatio.toFixed(2),
        "--bubble-tint-alpha": bubbleTokens.fillAlpha.toFixed(3),
        "--bubble-border-alpha": bubbleTokens.borderAlpha.toFixed(3),
        backgroundColor: `rgba(${navBgRgb}, ${Math.max(0.88, clampedCardAlpha).toFixed(2)})`,
      } as CSSProperties,
      activePillStyle: {
        backgroundColor: `rgba(${rgbChannels}, ${bubbleTokens.fillAlpha.toFixed(3)})`,
        borderColor: `rgba(${rgbChannels}, ${bubbleTokens.borderAlpha.toFixed(3)})`,
      } as CSSProperties,
      activeIconColor: accentColor,
    };
  }, [accent, theme, cardOpacity, bubbleOpacity, mounted]);

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

      const now = performance.now();
      if (now - lastNavTimeRef.current < 80 && lastNavIndexRef.current === index) return;
      lastNavTimeRef.current = now;
      lastNavIndexRef.current = index;

      // Se já estiver na mesma rota exata, apenas limpa estado otimista
      if (pathname === dest.to) {
        setOptimisticIndex(null);
        return;
      }

      // Resposta visual e tátil imediata em 0ms (sem startViewTransition nem startTransition)
      setOptimisticIndex(index);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("caldra:tab-switch", { detail: dest.to }));
      }
      triggerHaptic("selection");
      AudioManager.play("ui_nav");

      void navigate({ to: dest.to });
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
      startTransition(() => {
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
        className="caldra-floating-nav h-14 px-3 rounded-full"
        style={navContainerStyle}
      >
        <div className="relative flex h-full w-full items-center justify-between">
          {/* Cápsula Deslizante de Precisão (Sliding Pill) vinculada à Cor de Destaque + Opacidade Translúcida das Bolhas */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 z-0 flex h-full w-1/5 items-center justify-center"
            style={{
              transform: `translate3d(${resolvedActiveIndex * 100}%, 0, 0)`,
              transition: "transform 190ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
          >
            <div className="caldra-nav-sliding-pill w-12 h-10 rounded-full" style={activePillStyle} />
          </div>

          {/* 5 Botões Minimalistas Apenas Ícones (Área de toque generosa 52x44px e 0ms delay) */}
          {DESTINATIONS.map((dest, destIdx) => {
            const isCurrent = destIdx === resolvedActiveIndex;
            const Icon = dest.icon;

            return (
              <button
                key={dest.id}
                type="button"
                aria-label={dest.label}
                title={dest.label}
                aria-current={isCurrent ? "page" : undefined}
                data-active={isCurrent ? "true" : "false"}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && e.button !== 0) return;
                  navigateToDestination(destIdx);
                }}
                onPointerEnter={() => handlePointerEnter(destIdx)}
                onClick={() => {
                  navigateToDestination(destIdx);
                }}
                style={{
                  touchAction: "manipulation",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTapHighlightColor: "transparent",
                  transform: "translateZ(0)",
                  color: isCurrent ? activeIconColor : undefined,
                }}
                className="caldra-nav-item-btn min-w-[52px] h-[44px] flex items-center justify-center cursor-pointer select-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]/50 focus-visible:ring-inset"
              >
                <span
                  className="relative z-10 flex w-12 h-10 items-center justify-center rounded-full pointer-events-none"
                  style={{ transform: "translateZ(0)" }}
                >
                  <Icon
                    className="caldra-nav-item-icon size-[22px] shrink-0"
                    style={{
                      transform: "translateZ(0)",
                      color: isCurrent ? activeIconColor : undefined,
                    }}
                    strokeWidth={2}
                  />
                </span>
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
      color: "caldra-bubble-amber",
      to: "/calculadora",
    },
    {
      title: "Traçagem Paramétrica",
      desc: "Modelos 3D, planificação zero fresta e traçagem passo a passo",
      icon: DraftingCompass,
      color: "caldra-bubble-sky",
      to: "/tracagem",
    },
    {
      title: "Prancheta CAD 2D CHAMFER",
      desc: "Desenho vetorial técnico, cotas e exportação DXF",
      icon: PenTool,
      color: "caldra-bubble-amber-primary",
      to: "/desenho-2d",
    },
    {
      title: "Bancada de Chapas e Nesting",
      desc: "Aproveitamento de retalho e plano de corte na chapa",
      icon: Layers,
      color: "caldra-bubble-emerald",
      to: "/oficina",
      search: { tab: "chapa" as const },
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
