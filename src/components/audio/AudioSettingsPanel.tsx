import {
  Volume2,
  VolumeX,
  Volume1,
  Music,
  Sliders,
  Sparkles,
  MousePointer,
  Crosshair,
  Volume,
  Check,
  Play,
  Pause,
  Compass,
  Disc,
} from "lucide-react";
import { useAudio } from "@/lib/audio/AudioProvider";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { cn } from "@/lib/utils";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioSettingsPanel({ className }: { className?: string }) {
  const {
    masterVolume,
    musicVolume,
    effectsVolume,
    uiVolume,
    isMuted,
    uiSoundsEnabled,
    cadEffectsEnabled,
    musicEnabled,
    selectionSoundsEnabled,
    currentMovementIndex = 0,
    currentMovementName = "Intro — Curiosidade",
    musicTimeSeconds = 0,
    totalSuiteDuration = 250,
    movements = [],
    seekMovement,
    setMasterVolume,
    setMusicVolume,
    setEffectsVolume,
    setUiVolume,
    toggleMute,
    setVolumePreset,
    toggleUiSounds,
    toggleCadEffects,
    toggleMusic,
    toggleSelectionSounds,
    play,
  } = useAudio();

  const isMusicActive = musicEnabled && !isMuted;
  const currentMovement = movements[currentMovementIndex] || movements[0];

  return (
    <Panel className={cn("space-y-4 p-4", className)}>
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <SectionLabel
          action={
            isMuted ? (
              <VolumeX className="size-4 text-destructive" />
            ) : (
              <Volume2 className="size-4 text-accent" />
            )
          }
        >
          Áudio & Identidade Sonora
        </SectionLabel>

        {/* BOTÃO MODO SILENCIOSO */}
        <button
          type="button"
          onClick={() => {
            toggleMute();
            if (isMuted) play("ui_action");
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase transition-all shadow-2xs",
            isMuted
              ? "border-destructive/40 bg-destructive/15 text-destructive"
              : "border-line bg-card hover:bg-muted text-muted-foreground",
          )}
        >
          {isMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          <span>{isMuted ? "Silencioso Ativo" : "Modo Silencioso"}</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* REPRODUTOR DA TRILHA SONORA ORIGINAL — "THE GEOMETRY OF DISCOVERY"   */}
      {/* =================================================================== */}
      <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-3.5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Disc className={cn("size-4 text-accent", isMusicActive && "animate-spin text-accent")} style={{ animationDuration: "12s" }} />
              <span className="font-semibold text-xs text-foreground tracking-tight">
                CALDRA — The Geometry of Discovery
              </span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[9.5px] font-bold text-accent">
                Original 4:10
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Suíte instrumental em 7 movimentos narrativos: Piano de Feltro, Violoncelo, Harpa, Celesta, Handpan e Eletrônica Espacial.
            </p>
          </div>

          {/* BOTÃO PLAY / PAUSE TRILHA */}
          <button
            type="button"
            onClick={() => {
              toggleMusic();
              play("ui_action");
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[11px] font-bold tracking-wider uppercase transition-all shadow-xs",
              isMusicActive
                ? "bg-accent text-accent-foreground hover:opacity-90"
                : "border border-line bg-card hover:bg-muted text-foreground",
            )}
          >
            {isMusicActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            <span>{isMusicActive ? "Pausar Trilha" : "Tocar Trilha"}</span>
          </button>
        </div>

        {/* MOVIMENTO ATUAL & TEMPO */}
        <div className="rounded-xl border border-line/80 bg-background/60 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-accent font-bold">
              <Compass className="size-3.5 text-accent" />
              <span>
                Movimento {currentMovement ? currentMovement.index + 1 : 1}/7: {currentMovementName}
              </span>
            </div>
            <span className="text-muted-foreground font-mono">
              {formatTime(musicTimeSeconds)} / {formatTime(totalSuiteDuration)}
            </span>
          </div>

          {/* BARRA DE PROGRESSO COM MARCADORES DOS 7 MOVIMENTOS */}
          <div className="relative w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, (musicTimeSeconds / totalSuiteDuration) * 100))}%`,
              }}
            />
          </div>

          {currentMovement && (
            <p className="text-[11.5px] text-muted-foreground italic">
              &ldquo;{currentMovement.description}&rdquo;
            </p>
          )}
        </div>

        {/* NAVEGAÇÃO RÁPIDA ENTRE OS 7 MOVIMENTOS NARRATIVOS */}
        <div className="space-y-1">
          <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Saltar para Movimento Narrativo:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1">
            {movements.map((mov) => {
              const isCurrent = isMusicActive && currentMovementIndex === mov.index;
              return (
                <button
                  key={mov.index}
                  type="button"
                  onClick={() => {
                    seekMovement(mov.index);
                    play("ui_click");
                  }}
                  title={`${mov.name}: ${mov.description}`}
                  className={cn(
                    "flex flex-col items-center justify-center p-1.5 rounded-lg border font-mono text-center transition-all",
                    isCurrent
                      ? "border-accent bg-accent/20 text-accent font-bold shadow-2xs scale-[1.02]"
                      : "border-line bg-card/70 hover:bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-[9px] font-bold text-accent">
                    {formatTime(mov.startTime)}
                  </span>
                  <span className="text-[9.5px] truncate max-w-full font-medium">
                    {mov.narrative}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* PRESETS DE VOLUME RÁPIDOS */}
      <div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Nível de Volume
        </span>
        <div className="grid grid-cols-4 gap-1.5 mt-1.5">
          {(
            [
              { id: "mute", label: "Mudo", icon: VolumeX },
              { id: "low", label: "Baixo (30%)", icon: Volume },
              { id: "mid", label: "Médio (65%)", icon: Volume1 },
              { id: "high", label: "Alto (100%)", icon: Volume2 },
            ] as const
          ).map((p) => {
            const isSelected =
              p.id === "mute"
                ? isMuted
                : !isMuted &&
                  ((p.id === "low" && masterVolume <= 0.4) ||
                    (p.id === "mid" && masterVolume > 0.4 && masterVolume <= 0.8) ||
                    (p.id === "high" && masterVolume > 0.8));

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setVolumePreset(p.id);
                  if (p.id !== "mute") play("ui_select");
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl border p-2 font-mono text-[10px] font-medium transition-all",
                  isSelected
                    ? "border-accent/30 bg-accent/10 text-accent font-bold shadow-2xs"
                    : "border-line text-muted-foreground hover:bg-muted/60",
                )}
              >
                <p.icon className="size-3.5" />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTROLES DESLIZANTES INDEPENDENTES */}
      <div className="space-y-3 pt-2 border-t border-line/60">
        {/* VOLUME GERAL */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <Volume2 className="size-3.5 text-accent" /> Volume Geral (SOM)
            </span>
            <span className="text-muted-foreground" suppressHydrationWarning>
              {isMuted ? "0%" : `${Math.round(masterVolume * 100)}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : Math.round(masterVolume * 100)}
            onChange={(e) => {
              setMasterVolume(Number(e.target.value) / 100);
            }}
            className="h-1.5 w-full accent-[var(--accent)] cursor-pointer"
          />
        </div>

        {/* MÚSICA AMBIENTE */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <Music className="size-3.5 text-accent" /> Trilha Sonora (Suíte)
            </span>
            <span className="text-muted-foreground">{Math.round(musicVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(musicVolume * 100)}
            onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
            className="h-1.5 w-full accent-[var(--accent)] cursor-pointer"
          />
        </div>

        {/* EFEITOS CAD */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <Crosshair className="size-3.5 text-accent" /> Efeitos CAD & Kernel
            </span>
            <span className="text-muted-foreground">{Math.round(effectsVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(effectsVolume * 100)}
            onChange={(e) => setEffectsVolume(Number(e.target.value) / 100)}
            className="h-1.5 w-full accent-[var(--accent)] cursor-pointer"
          />
        </div>

        {/* INTERFACE */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <MousePointer className="size-3.5 text-accent" /> Sons da Interface
            </span>
            <span className="text-muted-foreground">{Math.round(uiVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(uiVolume * 100)}
            onChange={(e) => setUiVolume(Number(e.target.value) / 100)}
            className="h-1.5 w-full accent-[var(--accent)] cursor-pointer"
          />
        </div>
      </div>

      {/* OPÇÕES BOOLEANAS COM CHECKBOX */}
      <div className="space-y-2 pt-2 border-t border-line/60">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Canais de Feedback
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* SONS DA INTERFACE */}
          <label className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 font-mono text-[11px] cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={uiSoundsEnabled}
              onChange={toggleUiSounds}
              className="size-4 rounded accent-[var(--accent)]"
            />
            <span className="text-foreground">Sons da interface</span>
          </label>

          {/* EFEITOS CAD */}
          <label className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 font-mono text-[11px] cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={cadEffectsEnabled}
              onChange={toggleCadEffects}
              className="size-4 rounded accent-[var(--accent)]"
            />
            <span className="text-foreground">Efeitos CAD & Kernel</span>
          </label>

          {/* MÚSICA AMBIENTE */}
          <label className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 font-mono text-[11px] cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={musicEnabled}
              onChange={toggleMusic}
              className="size-4 rounded accent-[var(--accent)]"
            />
            <span className="text-foreground">Trilha Sonora CALDRA</span>
          </label>

          {/* SONS DE SELEÇÃO */}
          <label className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 font-mono text-[11px] cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={selectionSoundsEnabled}
              onChange={toggleSelectionSounds}
              className="size-4 rounded accent-[var(--accent)]"
            />
            <span className="text-foreground">Sons de seleção (B-Rep)</span>
          </label>
        </div>
      </div>

      {/* BOTÕES DE AMOSTRA SONORA */}
      <div className="pt-2 border-t border-line/60 flex flex-wrap gap-2 items-center">
        <span className="font-mono text-[10px] text-muted-foreground">Testar Efeitos:</span>
        <button
          type="button"
          onClick={() => play("ui_click")}
          className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Click
        </button>
        <button
          type="button"
          onClick={() => play("ui_action")}
          className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Ação
        </button>
        <button
          type="button"
          onClick={() => play("handpan_ding")}
          className="rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent hover:bg-accent/20 transition-colors font-medium"
        >
          Handpan
        </button>
        <button
          type="button"
          onClick={() => play("chamfer_init")}
          className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          CHAMFER
        </button>
        <button
          type="button"
          onClick={() => play("kernel_success")}
          className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Kernel OCCT
        </button>
        <button
          type="button"
          onClick={() => play("planify_sequence")}
          className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Planificar
        </button>
      </div>
    </Panel>
  );
}

