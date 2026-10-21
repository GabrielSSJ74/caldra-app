import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Calculator,
  Compass,
  PenTool,
  ArrowRight,
  ChevronRight,
  Layers,
  SlidersHorizontal,
  FileCode,
  FolderOpen,
} from "lucide-react";
import { PART_REGISTRY } from "@/lib/library/registry";
import { listProjects as listChamferProjects } from "@/lib/lab2d/projects";
import { useProjects as useDossierProjects } from "@/lib/projects/store";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { cn } from "@/lib/utils";
import { getEngine } from "@/lib/geometry/engines";
import { buildWire, DEFAULT_PARAMS, type WireModel } from "@/lib/viz3d/wire";
import { Wire3D } from "@/components/chameleon/Wire3D";
import { NavigationAreaHeader } from "@/components/ui/NavigationAreaHeader";
import { NavigationAreaContainer } from "@/components/layout/NavigationAreaContainer";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { resolveAccentColorTokens } from "@/lib/settings/appearancePreferences";

export const Route = createFileRoute("/projetar")({
  head: () => ({
    meta: [
      { title: "Crie e Calcule — Projetar | CALDRA" },
      {
        name: "description",
        content:
          "Desenvolvimento geométrico de peças, traçagens paramétricas, ambiente CAD CHAMFER e calculadora científica.",
      },
      { property: "og:title", content: "Crie e Calcule — Projetar | CALDRA" },
      {
        property: "og:description",
        content: "Projete traçados, desenhos técnicos e cálculos geométricos de caldeiraria.",
      },
    ],
  }),
  component: ProjetarPage,
});

/* =========================================================================
   1. MINIATURAS 3D SOMBREADAS PARA OS MODELOS DE CALDEIRARIA
   ========================================================================= */

const THUMBNAIL_WIRE_CACHE = new Map<string, WireModel>();

function getPartThumbnailWireModel(slug: string): WireModel {
  const cached = THUMBNAIL_WIRE_CACHE.get(slug);
  if (cached) return cached;

  const eng = getEngine(slug);
  const baseParams =
    slug === "redondo-quadrado"
      ? { d1: 500, d2: 750, h: 480, e: 0, seg: 32, t: 6 }
      : eng
        ? { ...eng.wire(eng.defaults), seg: 32 }
        : { ...DEFAULT_PARAMS, seg: 32, divisions: 6, t: 6 };

  const model = buildWire(slug, baseParams);
  THUMBNAIL_WIRE_CACHE.set(slug, model);
  return model;
}

/** Miniatura 3D sólida sombreada e isolada correspondente à geometria da peça */
function PartThumbnail3D({ slug, className }: { slug: string; className?: string }) {
  const model = useMemo(() => getPartThumbnailWireModel(slug), [slug]);

  return (
    <div
      className={cn(
        "relative size-full flex items-center justify-center select-none pointer-events-none",
        className,
      )}
    >
      {/* Backlight radial quente e suave atrás do sólido 3D */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_55%_50%,rgba(251,191,36,0.20)_0%,rgba(245,158,11,0.07)_48%,transparent_74%)] dark:bg-[radial-gradient(circle_at_55%_50%,rgba(245,158,11,0.16)_0%,rgba(245,158,11,0.04)_50%,transparent_74%)]"
      />
      <Wire3D
        model={model}
        interactive={false}
        autoSpin={false}
        edgeMode="shaded"
        showRefLines={false}
        className="relative z-10 size-full scale-[1.14] drop-shadow-[0_6px_12px_rgba(15,23,42,0.14)] dark:drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-[1.22]"
      />
    </div>
  );
}

/* =========================================================================
   2. MODELOS TÉCNICOS EM DESTAQUE PARA O HERO CAD INTERATIVO
   ========================================================================= */

type FeaturedModel = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  norma: string;
  method: string;
  level: string;
  d1: number;
  d2: number;
  h: number;
  e: number;
};

const FEATURED_MODELS: FeaturedModel[] = [
  {
    id: "quadrado-redondo",
    slug: "quadrado-redondo",
    title: "Quadrado → Redondo",
    subtitle: "Transição por triangulação de geratrizes",
    category: "Transições",
    norma: "DIN 2448 / ASME",
    method: "Triangulação",
    level: "Avançado",
    d1: 800,
    d2: 400,
    h: 500,
    e: 0,
  },
  {
    id: "tronco-de-cone",
    slug: "tronco-de-cone",
    title: "Tronco de Cone",
    subtitle: "Redução cônica concêntrica pelo raio verdadeiro",
    category: "Cones",
    norma: "ASME B16.9",
    method: "Radial",
    level: "Intermediário",
    d1: 900,
    d2: 450,
    h: 600,
    e: 0,
  },
  {
    id: "curva-de-gomos",
    slug: "curva-de-gomos",
    title: "Curva de Gomos 90°",
    subtitle: "Cotovelo segmentado para tubulações industriais",
    category: "Curvas",
    norma: "AWWA C208",
    method: "Projeção Cilíndrica",
    level: "Avançado",
    d1: 600,
    d2: 600,
    h: 600,
    e: 0,
  },
  {
    id: "boca-de-lobo",
    slug: "boca-de-lobo",
    title: "Boca de Lobo 90°",
    subtitle: "Interseção ortogonal de tubulações com penetração",
    category: "Interseções",
    norma: "API 5L / ASME B31.3",
    method: "Interseção 3D",
    level: "Avançado",
    d1: 500,
    d2: 350,
    h: 600,
    e: 0,
  },
  {
    id: "cone-excentrico",
    slug: "cone-excentrico",
    title: "Cone Excêntrico",
    subtitle: "Redução plana de fundo para drenos e bombas",
    category: "Cones",
    norma: "DIN EN 10253",
    method: "Radial Oblíquo",
    level: "Avançado",
    d1: 800,
    d2: 400,
    h: 550,
    e: 200,
  },
];

const HERO_WIRE_CACHE = new Map<string, WireModel>();

function getHeroWireModel(item: FeaturedModel): WireModel {
  const cached = HERO_WIRE_CACHE.get(item.id);
  if (cached) return cached;
  const built = buildWire(item.slug, {
    d1: item.d1,
    d2: item.d2,
    h: item.h,
    e: item.e,
    seg: 48,
    divisions: 6,
    t: 6,
  });
  HERO_WIRE_CACHE.set(item.id, built);
  return built;
}

/* =========================================================================
   3. CATEGORIAS DE TRAÇAGEM (CARROSSEL HORIZONTAL)
   ========================================================================= */

const TRACAGEM_CATEGORIES = [
  { id: "todas", label: "Todas as Peças", count: PART_REGISTRY.length },
  { id: "Transições", label: "Transições", count: 8 },
  { id: "Cones", label: "Cones & Reduções", count: 6 },
  { id: "Curvas", label: "Curvas de Gomos", count: 4 },
  { id: "Interseções", label: "Interseções & Tês", count: 7 },
  { id: "Cilíndricas", label: "Cilíndricas & Virolas", count: 5 },
  { id: "Flanges", label: "Flanges & Tampas", count: 6 },
];

/* =========================================================================
   COMPONENTE PRINCIPAL — PROJETAR (CRIE E CALCULE)
   ========================================================================= */

function ProjetarPage() {
  const { accent, theme } = useSettings();
  const isDarkTheme = theme === "dark" || theme === "amoled";
  const resolvedTokens = useMemo(
    () => resolveAccentColorTokens(accent, isDarkTheme),
    [accent, isDarkTheme],
  );

  // Projetos salvos no CHAMFER e no dossiê (carregados após hidratação para consistência SSR)
  const [chamferProjects, setChamferProjects] = useState<ReturnType<typeof listChamferProjects>>([]);
  useEffect(() => {
    setChamferProjects(listChamferProjects());
  }, []);
  const dossierProjects = useDossierProjects();

  // Estado do carrossel 3D infinito em exibição no Hero CAD (fluxo contínuo e tracking 1:1)
  const modelCount = FEATURED_MODELS.length;
  const [virtualIndex, setVirtualIndex] = useState(0);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [cardWidth, setCardWidth] = useState(340);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startTime: number;
    currentDeltaX: number;
    isHorizontal: boolean | null;
    width: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    currentDeltaX: 0,
    isHorizontal: null,
    width: 340,
  });

  const activeModelIndex = ((virtualIndex % modelCount) + modelCount) % modelCount;
  const activeModel = FEATURED_MODELS[activeModelIndex] ?? FEATURED_MODELS[0]!;

  // Medição responsiva da largura do card para normalização de progresso 1:1
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) {
        setCardWidth(w);
        gestureRef.current.width = w;
      }
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Prevenção de conflito de rolagem vertical durante swipe horizontal (passive: false)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeTouchMove = (e: TouchEvent) => {
      if (!gestureRef.current.active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - gestureRef.current.startX;
      const dy = t.clientY - gestureRef.current.startY;
      if (gestureRef.current.isHorizontal === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        gestureRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (gestureRef.current.isHorizontal && e.cancelable) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onNativeTouchMove);
  }, []);

  // Ciclo automático de 3000ms: desliza para a esquerda (virtualIndex + 1) continuamente sem rebobinar
  useEffect(() => {
    if (isDragging) return;
    const timer = setInterval(() => {
      setDragDeltaX(0);
      setVirtualIndex((v) => v + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, [virtualIndex, isDragging]);

  // Estado da categoria de traçagem selecionada
  const [selectedCategory, setSelectedCategory] = useState("todas");

  // Lista de peças filtradas pela categoria
  const filteredParts = useMemo(() => {
    if (selectedCategory === "todas") {
      return PART_REGISTRY.slice(0, 10);
    }
    return PART_REGISTRY.filter((p) => p.family === selectedCategory).slice(0, 8);
  }, [selectedCategory]);

  // Fase 1 — Início do Toque / Pointer
  const beginDrag = useCallback((clientX: number, clientY: number, pointerId: number | null = null) => {
    const width = viewportRef.current?.getBoundingClientRect().width || cardWidth || 340;
    gestureRef.current = {
      active: true,
      pointerId,
      startX: clientX,
      startY: clientY,
      startTime: performance.now(),
      currentDeltaX: 0,
      isHorizontal: null,
      width,
    };
    setCardWidth(width);
    setIsDragging(true);
    setDragDeltaX(0);
  }, [cardWidth]);

  // Fase 2 — Arraste Contínuo 1:1 a 60 FPS
  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const g = gestureRef.current;
    if (!g.active) return;
    const dx = clientX - g.startX;
    const dy = clientY - g.startY;

    if (g.isHorizontal === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      g.isHorizontal = Math.abs(dx) > Math.abs(dy);
    }

    if (g.isHorizontal === false) {
      return;
    }

    g.currentDeltaX = dx;
    setDragDeltaX(dx);
  }, []);

  // Fase 3 — Soltura e Snap Elástico com decisão por distância (20%) ou velocidade (0.35 px/ms)
  const endDrag = useCallback((clientX?: number) => {
    const g = gestureRef.current;
    if (!g.active) return;

    const finalDeltaX =
      typeof clientX === "number" && g.isHorizontal !== false
        ? clientX - g.startX
        : g.currentDeltaX;
    const elapsed = Math.max(1, performance.now() - g.startTime);
    const velocity = finalDeltaX / elapsed;
    const width = g.width || cardWidth || 340;

    g.active = false;
    g.pointerId = null;
    g.currentDeltaX = 0;
    g.isHorizontal = null;

    setIsDragging(false);
    setDragDeltaX(0);

    if (finalDeltaX < -width * 0.2 || velocity < -0.35) {
      // Swipe para a esquerda -> avança para a próxima peça (activeIndex + 1)
      triggerHaptic("selection");
      AudioManager.play("ui_pop");
      setVirtualIndex((v) => v + 1);
    } else if (finalDeltaX > width * 0.2 || velocity > 0.35) {
      // Swipe para a direita -> volta para a peça anterior (activeIndex - 1)
      triggerHaptic("selection");
      AudioManager.play("ui_pop");
      setVirtualIndex((v) => v - 1);
    }
  }, [cardWidth]);

  // Progresso normalizado [-1, 1] para interpolação em tempo real de escala e opacidade
  const dragProgress = useMemo(() => {
    if (!cardWidth) return 0;
    return Math.max(-1, Math.min(1, dragDeltaX / cardWidth));
  }, [dragDeltaX, cardWidth]);

  const absProgress = Math.abs(dragProgress);

  // Janela virtual [anterior (-1), atual (0), próxima (+1)] para loop infinito contínuo sem rebobinar
  const visibleSlots = useMemo(
    () => [virtualIndex - 1, virtualIndex, virtualIndex + 1],
    [virtualIndex],
  );

  return (
    <div
      className="relative w-full min-h-screen bg-transparent text-foreground overflow-x-hidden selection:bg-amber-500/30 selection:text-amber-200"
      style={
        {
          "--hero-accent-color": `var(--accent-color, ${resolvedTokens.accentColor})`,
          "--hero-accent-rgb": `var(--accent-rgb, ${resolvedTokens.accentRgb})`,
        } as React.CSSProperties
      }
    >
      <style>{`
        @keyframes caldraHeroTitleSlideLeft {
          0% {
            opacity: 0;
            transform: translate3d(14px, 0, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .caldra-hero-title-anim {
          animation: caldraHeroTitleSlideLeft 450ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          will-change: transform, opacity;
        }
        .caldra-hero-backlight {
          background: radial-gradient(
            circle at 55% 50%,
            rgba(var(--accent-rgb, 0, 102, 255), 0.20) 0%,
            rgba(var(--accent-rgb, 0, 102, 255), 0.08) 45%,
            transparent 72%
          );
          filter: blur(16px);
        }
        .dark .caldra-hero-backlight {
          background: radial-gradient(
            circle at 55% 50%,
            rgba(var(--accent-rgb, 59, 130, 246), 0.24) 0%,
            rgba(var(--accent-rgb, 59, 130, 246), 0.08) 50%,
            transparent 75%
          );
          filter: blur(20px);
        }
      `}</style>

      <NavigationAreaContainer>
        {/* =========================================================================
            CABEÇALHO DA SEÇÃO DE PROJETO
            - Identificador: "PROJETO TÉCNICO & CAD"
            ========================================================================= */}
        <NavigationAreaHeader
          badgeText="PROJETO TÉCNICO & CAD"
          badgeColor="text-sky-500"
          indicatorColor="bg-sky-500"
          secondaryBadge={
            <span className="rounded bg-sky-500/10 px-1.5 py-0.2 font-mono text-[8px] font-bold text-sky-500 border border-sky-500/30">
              CALDRA LAB
            </span>
          }
          title="Projetar"
        />

        {/* =========================================================================
            NÍVEL 1: FERRAMENTAS PRIORITÁRIAS (AÇÕES IMEDIATAS)
            1.1 FERRAMENTA COMPLEXA EM DESTAQUE (LARGURA TOTAL):
                CARROSSEL 3D CINEMATOGRÁFICO COM TRACKING 1:1 E BACKLIGHT DINÂMICO
            ========================================================================= */}
        <section
          aria-label="Ambiente CAD em Destaque"
          className="caldra-hero relative overflow-hidden rounded-2xl border border-border/80 dark:border-zinc-800/90 shadow-lg p-3 sm:p-3.5 space-y-2.5"
        >
          {/* Topo do Card: Título dinâmico da peça à esquerda + Pílula de Paginação à direita */}
          <div className="relative z-10 flex items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors"
                style={{
                  backgroundColor: "rgba(var(--accent-rgb, 0, 102, 255), 0.12)",
                  borderColor: "rgba(var(--accent-rgb, 0, 102, 255), 0.28)",
                  color: "var(--accent-color, var(--accent))",
                }}
              >
                <Compass className="size-4" strokeWidth={2} />
              </div>
              <h2
                key={`title-${activeModel.id}-${virtualIndex}`}
                className="caldra-hero-title-anim font-display text-[15px] sm:text-base font-bold text-foreground dark:text-zinc-100 truncate"
              >
                {activeModel.title}
              </h2>
            </div>

            {/* Indicador de Paginação em Pílula de Pontos (Cápsula Superior Direita) */}
            <div
              role="tablist"
              aria-label="Modelos 3D em destaque"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/75 dark:border-slate-700/75 bg-white/85 dark:bg-[rgba(30,41,59,0.85)] px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-md"
            >
              {FEATURED_MODELS.map((model, idx) => {
                const isActive = idx === activeModelIndex;
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Visualizar ${model.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const diff = idx - activeModelIndex;
                      if (diff === 0) return;
                      triggerHaptic("selection");
                      AudioManager.play("ui_pop");
                      setIsDragging(false);
                      setDragDeltaX(0);
                      setVirtualIndex((v) => v + diff);
                    }}
                    style={{
                      width: isActive ? "20px" : "6px",
                      height: "6px",
                      borderRadius: "9999px",
                      background: isActive
                        ? "var(--accent-color, var(--accent))"
                        : "rgba(148, 163, 184, 0.45)",
                      transition: "all 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className="cursor-pointer border-0 p-0 outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  />
                );
              })}
            </div>
          </div>

          {/* Viewport 3D com Arraste 1:1 em Tempo Real (60 FPS) e Deslocamento Contínuo para a Esquerda */}
          <div
            ref={viewportRef}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) beginDrag(t.clientX, t.clientY, null);
            }}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (t) moveDrag(t.clientX, t.clientY);
            }}
            onTouchEnd={(e) => {
              const t = e.changedTouches[0];
              endDrag(t?.clientX);
            }}
            onTouchCancel={() => endDrag()}
            onPointerDown={(e) => {
              if (e.pointerType === "touch") return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              beginDrag(e.clientX, e.clientY, e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.pointerType === "touch") return;
              moveDrag(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "touch") return;
              if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              endDrag(e.clientX);
            }}
            onPointerCancel={(e) => {
              if (e.pointerType === "touch") return;
              endDrag();
            }}
            className="relative my-1 flex h-44 sm:h-48 w-full items-center justify-center select-none overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing"
          >
            {/* Mancha / Aura de Fundo (Backlight) vinculada à cor de destaque ativa */}
            <div
              aria-hidden="true"
              className="caldra-hero-backlight pointer-events-none absolute inset-0 rounded-full transition-colors duration-500"
            />

            {/* Faixa Horizontal Contínua (Track 1:1 com GPU translate3d) */}
            <div
              style={{
                transform: `translate3d(calc(${-virtualIndex * 100}% + ${dragDeltaX}px), 0, 0)`,
                transition: isDragging
                  ? "none"
                  : "transform 550ms cubic-bezier(0.22, 1, 0.36, 1)",
                willChange: "transform",
              }}
              className="relative z-10 size-full"
            >
              {visibleSlots.map((slotIndex) => {
                const modelIdx = ((slotIndex % modelCount) + modelCount) % modelCount;
                const slotModel = FEATURED_MODELS[modelIdx] ?? FEATURED_MODELS[0]!;
                const slotWire = getHeroWireModel(slotModel);
                const offset = slotIndex - virtualIndex; // -1 (esquerda), 0 (centro), +1 (direita)

                const isCenter = offset === 0;
                const isIncomingNeighbor =
                  (offset === 1 && dragDeltaX < 0) || (offset === -1 && dragDeltaX > 0);

                const itemScale = isCenter
                  ? 1 - absProgress * 0.08
                  : isIncomingNeighbor
                    ? 0.92 + absProgress * 0.08
                    : 0.92;

                const itemOpacity = isCenter
                  ? 1 - absProgress * 0.35
                  : isIncomingNeighbor
                    ? 0.65 + absProgress * 0.35
                    : 0.65;

                return (
                  <div
                    key={slotIndex}
                    style={{
                      transform: `translate3d(${slotIndex * 100}%, 0, 0)`,
                      willChange: "transform",
                    }}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  >
                    <div
                      style={{
                        transform: `scale(${itemScale})`,
                        opacity: itemOpacity,
                        transition: isDragging
                          ? "none"
                          : "transform 550ms cubic-bezier(0.22, 1, 0.36, 1), opacity 550ms ease",
                        willChange: "transform, opacity",
                      }}
                      className="flex size-full items-center justify-center"
                    >
                      <Wire3D
                        model={slotWire}
                        className="size-full max-h-[172px] sm:max-h-[188px] drop-shadow-[0_10px_18px_rgba(15,23,42,0.12)] dark:drop-shadow-[0_12px_22px_rgba(0,0,0,0.45)]"
                        interactive={false}
                        autoSpin={true}
                        edgeMode="shaded"
                        showRefLines={false}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ação contextual final: Traçar Esta Peça Agora + Todas */}
          <div className="relative z-10 flex items-center gap-2 pt-1">
            <Link
              to="/tracagem/$slug"
              params={{ slug: activeModel.slug }}
              onClick={() => {
                triggerHaptic("success");
                AudioManager.play("ui_action");
              }}
              style={{
                backgroundColor: "var(--accent-color, var(--accent))",
                boxShadow: "0 6px 18px rgba(var(--accent-rgb, 0, 102, 255), 0.26)",
                color: accent === "default" && isDarkTheme ? "#0F172A" : "#FFFFFF",
              }}
              className="flex-1 flex h-10 items-center justify-center gap-2 rounded-xl hover:opacity-95 active:scale-[0.98] px-3 font-display text-xs font-bold transition-all cursor-pointer"
            >
              <Compass className="size-4" strokeWidth={2.2} />
              <span>Traçar esta peça agora</span>
              <ArrowRight className="size-3.5 ml-auto stroke-[2.5]" />
            </Link>

            <Link
              to="/tracagem"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="flex h-10 items-center justify-center rounded-xl border border-border/80 dark:border-zinc-700/80 bg-secondary/70 dark:bg-zinc-800/80 px-3 font-mono text-xs font-semibold text-foreground dark:text-zinc-300 hover:bg-secondary dark:hover:bg-zinc-700 active:scale-[0.98] transition-all cursor-pointer"
              title="Ver todas as traçagens"
            >
              <span>Todas</span>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            1.2 GRADE DE DUAS COLUNAS: FERRAMENTAS PRIORITÁRIAS (ALTURA 112–144 PX)
            - Cartões compactos com área clicável integral
            - Bolhas de 42 px e badges contextuais
            - CHAMFER 2D CAD e Calculadora Científica
            ========================================================================= */}
        <section aria-label="Ferramentas prioritárias" className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="size-1.5 rounded-full bg-amber-500" />
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Ações Rápidas de Criação
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* Ferramenta 1 — Prancheta CAD 2D CHAMFER */}
            <Link
              to="/desenho-2d"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="caldra-card group flex min-h-[118px] sm:min-h-[126px] flex-col justify-between rounded-xl p-3 sm:p-3.5 transition-all hover:border-red-500/40 active:scale-[0.98] cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="caldra-bubble-base caldra-bubble-red size-10.5">
                  <PenTool className="size-5 stroke-[1.9]" />
                </div>
                <span className="font-mono text-[7.5px] font-bold text-red-500 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded">
                  DXF · 2D
                </span>
              </div>

              <div className="my-1.5">
                <h3 className="font-display text-[13px] sm:text-[14px] font-bold text-foreground leading-tight group-hover:text-red-500 transition-colors">
                  Prancheta CAD 2D
                </h3>
                <p className="text-[9.5px] sm:text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                  Desenho vetorial de perfis, furos, chanfros e exportação DXF.
                </p>
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                <span className="truncate">
                  {chamferProjects.length > 0
                    ? `${chamferProjects.length} desenhos`
                    : "Novo traçado"}
                </span>
                <ChevronRight className="size-3 text-red-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </Link>

            {/* Ferramenta 2 — Calculadora Científica */}
            <Link
              to="/calculadora"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_pop");
              }}
              className="caldra-card group flex min-h-[118px] sm:min-h-[126px] flex-col justify-between rounded-xl p-3 sm:p-3.5 transition-all hover:border-amber-500/40 active:scale-[0.98] cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="caldra-bubble-base caldra-bubble-amber size-10.5">
                  <Calculator className="size-5 stroke-[1.9]" />
                </div>
                <span className="font-mono text-[7.5px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  TRIGONOMETRIA
                </span>
              </div>

              <div className="my-1.5">
                <h3 className="font-display text-[13px] sm:text-[14px] font-bold text-foreground leading-tight group-hover:text-amber-500 transition-colors">
                  Calculadora Científica
                </h3>
                <p className="text-[9.5px] sm:text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                  Trigonometria, arcos, cordas e fórmulas de oficina.
                </p>
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                <span className="truncate">sen • cos • tan • √</span>
                <ChevronRight className="size-3 text-amber-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            NÍVEL 2: FERRAMENTAS COMPLEMENTARES AGRUPADAS POR FINALIDADE
            2.1 BIBLIOTECA DE TRAÇAGEM PARAMÉTRICA (CARROSSEL HORIZONTAL CONFINADO)
            ========================================================================= */}
        <section aria-label="Biblioteca de Traçagem Paramétrica" className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-sky-500" />
              <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
                Modelos de Caldeiraria
              </h2>
            </div>
            <Link
              to="/tracagem"
              onClick={() => {
                triggerHaptic("tap");
                AudioManager.play("ui_nav");
              }}
              className="font-mono text-[10px] text-amber-500 hover:underline flex items-center gap-0.5"
            >
              <span>Ver todos ({PART_REGISTRY.length})</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          {/* Filtros em pílulas deslizáveis funcionais */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar overscroll-x-contain -mx-4 sm:-mx-5 px-4 sm:px-5">
            {TRACAGEM_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setSelectedCategory(cat.id);
                  }}
                  className={cn(
                    "shrink-0 min-h-[34px] rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold transition-all cursor-pointer touch-manipulation active:scale-95",
                    active
                      ? "bg-amber-500 text-black font-bold shadow-sm"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Carrossel de Peças com largura de 142–150 px */}
          <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar overscroll-x-contain snap-x snap-mandatory -mx-4 sm:-mx-5 px-4 sm:px-5">
            {filteredParts.map((part) => (
              <Link
                key={part.id}
                to="/tracagem/$slug"
                params={{ slug: part.engineSlug || "quadrado-redondo" }}
                onClick={() => {
                  triggerHaptic("selection");
                  AudioManager.play("ui_pop");
                }}
                className="caldra-card group relative flex w-[142px] xs:w-[150px] shrink-0 flex-col justify-between rounded-xl p-2.5 transition-all hover:border-amber-500/50 active:scale-[0.98] snap-start cursor-pointer text-left"
              >
                {/* Miniatura 3D sólida sombreada isolada correspondente à peça */}
                <div className="relative h-18 w-full rounded-lg overflow-hidden flex items-center justify-center p-0.5">
                  <PartThumbnail3D slug={part.engineSlug || "quadrado-redondo"} />
                  <span className="absolute bottom-1 right-1 z-20 font-mono text-[7px] text-muted-foreground bg-card/90 px-1 rounded border border-border/70">
                    {part.family}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-col min-w-0">
                  <span className="font-display text-[11px] font-bold text-foreground truncate group-hover:text-amber-500 transition-colors">
                    {part.name}
                  </span>
                  <span className="font-mono text-[8px] text-muted-foreground line-clamp-1">
                    {part.summary}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-border/60 text-[8.5px] font-mono text-amber-500">
                  <span>Traçar</span>
                  <ArrowRight className="size-2.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* =========================================================================
            2.2 GRADE DE DUAS COLUNAS: FERRAMENTAS COMPLEMENTARES DE FABRICAÇÃO
            - Planificação de Chapa (Nesting/Retalho) e Dossiê de Montagem (BOM)
            - Altura determinada pelo conteúdo (112–144 px)
            ========================================================================= */}
        <section aria-label="Ferramentas complementares" className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Planejamento & Montagem
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* Ferramenta 3 — Planificação de Chapa */}
            <Link
              to="/planificacao"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_nav");
              }}
              className="caldra-card group flex min-h-[118px] sm:min-h-[126px] flex-col justify-between rounded-xl p-3 sm:p-3.5 transition-all hover:border-sky-500/40 active:scale-[0.98] cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="caldra-bubble-base caldra-bubble-sky size-10.5">
                  <Layers className="size-5 stroke-[1.9]" />
                </div>
                <span className="font-mono text-[7.5px] font-bold text-sky-500 bg-sky-500/10 border border-sky-500/30 px-1.5 py-0.5 rounded">
                  CHAPA PLANA
                </span>
              </div>

              <div className="my-1.5">
                <h3 className="font-display text-[13px] sm:text-[14px] font-bold text-foreground leading-tight group-hover:text-sky-500 transition-colors">
                  Planificação de Chapa
                </h3>
                <p className="text-[9.5px] sm:text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                  Distribuição comercial, cálculo de retalho, sobras e massa.
                </p>
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                <span className="truncate">Aproveitamento</span>
                <ChevronRight className="size-3 text-sky-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </Link>

            {/* Ferramenta 4 — Dossiê de Projetos & Montagem */}
            <Link
              to="/projetos"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_nav");
              }}
              className="caldra-card group flex min-h-[118px] sm:min-h-[126px] flex-col justify-between rounded-xl p-3 sm:p-3.5 transition-all hover:border-emerald-500/40 active:scale-[0.98] cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="caldra-bubble-base caldra-bubble-emerald size-10.5">
                  <FolderOpen className="size-5 stroke-[1.9]" />
                </div>
                <span className="font-mono text-[7.5px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                  {dossierProjects.length > 0 ? `${dossierProjects.length} PROJ` : "MONTAGEM"}
                </span>
              </div>

              <div className="my-1.5">
                <h3 className="font-display text-[13px] sm:text-[14px] font-bold text-foreground leading-tight group-hover:text-emerald-500 transition-colors">
                  Dossiê de Projetos
                </h3>
                <p className="text-[9.5px] sm:text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                  Árvore de subconjuntos, revisão técnica e lista de corte.
                </p>
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                <span className="truncate">Conjuntos & BOM</span>
                <ChevronRight className="size-3 text-emerald-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </Link>
          </div>
        </section>

        {/* =========================================================================
            NÍVEL 3: RECURSOS AVANÇADOS DE ENGENHARIA (DESCOBERTA PROGRESSIVA)
            - Pós-Processamento CNC (G-Code) e Fator K / Compensação de Dobra
            - Grade de 2 colunas, 112–144 px
            ========================================================================= */}
        <section aria-label="Recursos avançados" className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="size-1.5 rounded-full bg-indigo-500" />
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Recursos Avançados de Fabricação
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* Recurso 1 — Pós-Processador CNC */}
            <Link
              to="/tracagem"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_nav");
              }}
              className="caldra-card group flex min-h-[114px] sm:min-h-[122px] flex-col justify-between rounded-xl p-3 sm:p-3.5 transition-all hover:border-indigo-500/40 active:scale-[0.98] cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="caldra-bubble-base caldra-bubble-indigo size-10">
                  <FileCode className="size-4.5 stroke-[1.9]" />
                </div>
                <span className="font-mono text-[7.5px] font-bold text-indigo-500 bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                  G-CODE · CNC
                </span>
              </div>

              <div className="my-1">
                <h3 className="font-display text-[12.5px] sm:text-[13px] font-bold text-foreground leading-tight group-hover:text-indigo-400 transition-colors">
                  Pós-Processador CNC
                </h3>
                <p className="text-[9px] sm:text-[9.5px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                  Trajetórias para plasma e oxicorte com compensação de raio.
                </p>
              </div>

              <div className="flex items-center justify-between text-[8.5px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                <span>Código G</span>
                <ChevronRight className="size-3 text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </Link>

            {/* Recurso 2 — Compensação de Dobra & Fator K */}
            <Link
              to="/oficina"
              search={{ tab: "chapa" }}
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_nav");
              }}
              className="caldra-card group flex min-h-[114px] sm:min-h-[122px] flex-col justify-between rounded-xl p-3 sm:p-3.5 transition-all hover:border-amber-500/40 active:scale-[0.98] cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="caldra-bubble-base caldra-bubble-amber size-10">
                  <SlidersHorizontal className="size-4.5 stroke-[1.9]" />
                </div>
                <span className="font-mono text-[7.5px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  FATOR K
                </span>
              </div>

              <div className="my-1">
                <h3 className="font-display text-[12.5px] sm:text-[13px] font-bold text-foreground leading-tight group-hover:text-amber-500 transition-colors">
                  Compensação de Dobra
                </h3>
                <p className="text-[9px] sm:text-[9.5px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                  Dedução de dobra neutra por espessura e abertura de V.
                </p>
              </div>

              <div className="flex items-center justify-between text-[8.5px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                <span>Tabelas de conformação</span>
                <ChevronRight className="size-3 text-amber-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </Link>
          </div>
        </section>

        {/* Rodapé técnico discreto */}
        <footer className="pt-2 pb-1 text-center font-mono text-[9px] text-muted-foreground/70">
          CALDRA Metal Lab Suite • Precisão Sub-Milimétrica • Offline-First
        </footer>
      </NavigationAreaContainer>
    </div>
  );
}

