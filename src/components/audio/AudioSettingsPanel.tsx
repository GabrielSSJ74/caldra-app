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
} from "lucide-react";
import { useAudio } from "@/lib/audio/AudioProvider";
import { Panel, SectionLabel } from "@/components/chameleon/ui";
import { cn } from "@/lib/utils";

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
    playMusic,
  } = useAudio();

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

      <p className="text-[12.5px] text-muted-foreground">
        Trilha sonora cinematográfica da CALDRA: instrumento híbrido acústico de cordas metálicas (assinatura sonora),
        piano de feltro, cello e contrabaixo, flauta baixa de madeira, celesta, harpa, sintetizador analógico e ressonância de aço.
        Vastidão, engenharia e serenidade.
      </p>

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
            <span className="text-muted-foreground">
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
              <Music className="size-3.5 text-accent" /> Música Ambiente
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
            <span className="text-foreground">Música ambiente</span>
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
        <span className="font-mono text-[10px] text-muted-foreground">Testar:</span>
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
        <button
          type="button"
          onClick={() => {
            play("ui_click");
            playMusic("caldra_main");
          }}
          className="rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent hover:bg-accent/20 transition-colors font-semibold"
        >
          Tocar Trilha Cinematográfica
        </button>
      </div>
    </Panel>
  );
}
