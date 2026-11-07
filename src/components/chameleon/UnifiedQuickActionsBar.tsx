import { useState, useRef, startTransition } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Calculator,
  ChevronRight,
  Compass,
  Layers,
  Music,
  PenTool,
  Search,
  Sliders,
  Sparkles,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
  Wrench,
} from "lucide-react";
import { useAudio } from "@/lib/audio/AudioProvider";
import { AudioManager } from "@/lib/audio/AudioManager";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { resolveEffectiveThemeId } from "@/lib/settings/themeTransitionEngine";
import { PART_REGISTRY, partHref } from "@/lib/library/registry";
import { searchParts } from "@/lib/library/search";
import { triggerHaptic } from "@/lib/ui/haptics";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const QUICK_TOOLS = [
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

/**
 * Barra Redonda Unificada de Utilidades Globais (PRO, Som, IA, Busca e Perfil).
 * Renderizada de forma idêntica no topo direito de todas as seções principais do CALDRA.
 */
export function UnifiedQuickActionsBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { theme, auroraStyle, setAuroraStyle } = useSettings();
  const effectiveTheme = resolveEffectiveThemeId(theme);
  const isLight = effectiveTheme === "light";
  const isAmoled = effectiveTheme === "amoled";
  const isAuroraActive = auroraStyle !== "padrao";

  const {
    isMuted,
    masterVolume,
    musicEnabled,
    toggleMute,
    setMasterVolume,
    toggleMusic,
    play,
  } = useAudio();

  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Superfície da cápsula externa adaptável ao tema ativo
  const capsuleSurfaceStyle = isLight
    ? {
        background: "rgba(255, 255, 255, 0.82)",
        border: "1px solid rgba(15, 23, 42, 0.09)",
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.06)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }
    : isAmoled
      ? {
          background: "rgba(9, 13, 22, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.09)",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }
      : {
          background: "rgba(15, 23, 42, 0.62)",
          border: "1px solid rgba(255, 255, 255, 0.11)",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.28)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        };

  const handleToggleFluidAurora = () => {
    triggerHaptic("selection");
    AudioManager.play("ui_pop");
    setAuroraStyle(isAuroraActive ? "padrao" : "suave");
  };

  const handleSoundPointerDown = () => {
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      triggerHaptic("selection");
      setAudioMenuOpen((o) => !o);
    }, 420);
  };

  const handleSoundPointerUpOrLeave = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSoundClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    triggerHaptic("tap");
    toggleMute();
    if (isMuted) play("ui_click");
  };

  const matchedParts = searchQuery.trim()
    ? searchParts(PART_REGISTRY, searchQuery).slice(0, 5)
    : [];

  return (
    <>
      <div
        role="toolbar"
        aria-label="Ações rápidas do sistema"
        style={{
          ...capsuleSurfaceStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 6px",
          borderRadius: "9999px",
        }}
        className={cn("relative select-none", className)}
      >
        {/* 1. Chip ✦ PRO (Integrado na Ponta Esquerda da Cápsula) */}
        <Link
          to="/pro"
          onClick={() => {
            triggerHaptic("selection");
            AudioManager.play("ui_nav");
          }}
          aria-label="CALDRA PRO"
          title="Assinatura CALDRA PRO"
          style={{
            height: "30px",
            padding: "0 10px",
            borderRadius: "9999px",
            background: "rgba(245, 158, 11, 0.14)",
            color: isLight ? "#D97706" : "#FBBF24",
            fontSize: "11px",
            fontWeight: 700,
          }}
          className="inline-flex items-center gap-1 font-mono tracking-wider uppercase transition-transform active:scale-95 hover:brightness-110 cursor-pointer shrink-0"
        >
          <span aria-hidden="true">✦</span>
          <span>PRO</span>
        </Link>

        {/* 2. Divisor Vertical Sutil (1px × 16px, opacidade 0.12) */}
        <span
          aria-hidden="true"
          style={{
            width: "1px",
            height: "16px",
            backgroundColor: isLight
              ? "rgba(15, 23, 42, 0.12)"
              : "rgba(255, 255, 255, 0.12)",
          }}
          className="mx-0.5 shrink-0"
        />

        {/* 3. Botão Som / Áudio (32px × 32px + Menu de Som Integrado) */}
        <div className="relative inline-flex items-center">
          <button
            type="button"
            onPointerDown={handleSoundPointerDown}
            onPointerUp={handleSoundPointerUpOrLeave}
            onPointerLeave={handleSoundPointerUpOrLeave}
            onClick={handleSoundClick}
            onContextMenu={(e) => {
              e.preventDefault();
              setAudioMenuOpen((o) => !o);
            }}
            aria-label={
              isMuted
                ? "Áudio silenciado (Toque para ativar, segure para opções)"
                : "Áudio ativo (Toque para silenciar, segure para opções)"
            }
            title={
              isMuted
                ? "Áudio silenciado (Toque para ativar · Clique direito ou segure para volume)"
                : `Áudio ativo ${Math.round(masterVolume * 100)}% (Toque para silenciar · Clique direito ou segure para volume)`
            }
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "9999px",
              color: isMuted ? "#F43F5E" : isLight ? "#475569" : "#CBD5E1",
            }}
            className={cn(
              "relative inline-flex items-center justify-center transition-colors active:scale-95 cursor-pointer",
              isLight ? "hover:bg-slate-900/[0.06]" : "hover:bg-white/[0.08]",
            )}
          >
            {isMuted ? (
              <VolumeX className="size-4 shrink-0" strokeWidth={1.9} />
            ) : (
              <Volume2 className="size-4 shrink-0" strokeWidth={1.9} />
            )}
          </button>

          {audioMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => setAudioMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                style={capsuleSurfaceStyle}
                className={cn(
                  "absolute top-10 right-0 z-50 flex w-60 flex-col gap-2.5 rounded-2xl p-3.5 font-mono text-[10px] shadow-2xl animate-in fade-in zoom-in-95",
                  isLight ? "text-slate-800" : "text-slate-100",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between pb-1.5 border-b",
                    isLight ? "border-slate-200/80" : "border-white/10",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                    <Sliders className="size-3 text-sky-500" />
                    Áudio CALDRA
                  </span>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase cursor-pointer",
                      isMuted
                        ? "bg-rose-500/15 text-rose-500"
                        : isLight
                          ? "bg-slate-900/10 text-slate-700"
                          : "bg-white/10 text-slate-200",
                    )}
                  >
                    {isMuted ? "Mudo" : "Ativo"}
                  </button>
                </div>

                {/* Slider Master */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9.5px]">
                    <span className={isLight ? "text-slate-500" : "text-slate-400"}>
                      Volume Geral:
                    </span>
                    <span className="font-bold">
                      {isMuted ? "0%" : `${Math.round(masterVolume * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : Math.round(masterVolume * 100)}
                    onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
                    className="h-1.5 w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                {/* Trilha Ambiente */}
                <div
                  className={cn(
                    "flex items-center justify-between pt-1.5 border-t",
                    isLight ? "border-slate-200/80" : "border-white/10",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[9.5px]",
                      isLight ? "text-slate-600" : "text-slate-300",
                    )}
                  >
                    <Music className="size-3 text-sky-500" /> Trilha Ambiente
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      toggleMusic();
                      play("ui_click");
                    }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase transition-colors cursor-pointer",
                      musicEnabled && !isMuted
                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                        : isLight
                          ? "bg-slate-900/10 text-slate-500"
                          : "bg-white/10 text-slate-400",
                    )}
                  >
                    {musicEnabled && !isMuted ? "Ligada" : "Desligada"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 4. Botão Assistente IA / Fundo Dinâmico (✨ 32px × 32px) */}
        <button
          type="button"
          aria-pressed={isAuroraActive}
          onClick={handleToggleFluidAurora}
          aria-label={isAuroraActive ? "Desativar Orbes Vivos / Aurora" : "Ativar Orbes Vivos / Aurora"}
          title={
            isAuroraActive
              ? "Fundo Dinâmico Ativo (Toque para alternar)"
              : "Ativar Fundo Dinâmico / IA Visual"
          }
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "9999px",
            color: isLight ? "#3B82F6" : "#38BDF8",
            backgroundColor: isAuroraActive
              ? isLight
                ? "rgba(59, 130, 246, 0.14)"
                : "rgba(56, 189, 248, 0.16)"
              : "transparent",
          }}
          className={cn(
            "inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0",
            isLight ? "hover:bg-slate-900/[0.06]" : "hover:bg-white/[0.08]",
          )}
        >
          <Sparkles className="size-4 shrink-0" strokeWidth={1.9} />
        </button>

        {/* 5. Botão Busca Global (🔍 32px × 32px) */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("tap");
            AudioManager.play("ui_nav");
            setSearchOpen(true);
          }}
          aria-label="Busca Global e Ferramentas"
          title="Buscar peças e ferramentas"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "9999px",
            color: isLight ? "#475569" : "#CBD5E1",
          }}
          className={cn(
            "inline-flex items-center justify-center transition-colors active:scale-95 cursor-pointer shrink-0",
            isLight ? "hover:bg-slate-900/[0.06]" : "hover:bg-white/[0.08]",
          )}
        >
          <Search className="size-4 shrink-0" strokeWidth={1.9} />
        </button>

        {/* 6. Botão Perfil / Conta (👤 32px × 32px na extremidade direita) */}
        <Link
          to="/perfil"
          onClick={() => {
            triggerHaptic("tap");
            AudioManager.play("ui_nav");
          }}
          aria-label="Perfil e Conta"
          title="Perfil, Configurações e Temas"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "9999px",
            color: isLight ? "#475569" : "#CBD5E1",
          }}
          className={cn(
            "inline-flex items-center justify-center transition-colors active:scale-95 cursor-pointer shrink-0",
            isLight ? "hover:bg-slate-900/[0.06]" : "hover:bg-white/[0.08]",
          )}
        >
          <User className="size-4 shrink-0" strokeWidth={1.9} />
        </Link>
      </div>

      {/* Modal de Busca Global & Bancada de Ferramentas */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-h-[85dvh] w-[min(92vw,480px)] overflow-y-auto border border-border bg-card p-5 text-foreground shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-500">
              <Wrench className="size-4.5" />
              <DialogTitle className="font-display text-lg font-bold text-foreground">
                Busca Rápida & Ferramentas
              </DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre rapidamente qualquer peça paramétrica ou acesse as ferramentas da oficina.
            </p>
          </DialogHeader>

          {/* Campo de busca rápida */}
          <label className="mt-2 flex items-center gap-2.5 rounded-xl border border-border bg-background/70 px-3.5 py-2 focus-within:border-sky-500/60">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar peça (cone, boca de lobo, flange...)"
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          {matchedParts.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Peças Paramétricas Encontradas
              </p>
              {matchedParts.map((part) => {
                const href = partHref(part, part.id);
                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic("tap");
                      AudioManager.play("ui_nav");
                      setSearchOpen(false);
                      setSearchQuery("");
                      startTransition(() => {
                        void navigate({
                          to: href.to,
                          params: href.params as never,
                          search: href.search as never,
                        });
                      });
                    }}
                    className="caldra-card flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:border-sky-500/45 cursor-pointer"
                  >
                    <div>
                      <p className="font-display text-xs font-bold uppercase text-foreground">
                        {part.name}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {part.family} · {part.specs[0]}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 space-y-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ferramentas Principais
            </p>
            {QUICK_TOOLS.map((t) => (
              <button
                key={t.title}
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  AudioManager.play("ui_nav");
                  setSearchOpen(false);
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
    </>
  );
}
