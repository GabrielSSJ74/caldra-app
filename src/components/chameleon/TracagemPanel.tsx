import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pause, Play, RotateCcw, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { GeometryResult } from "@/lib/geometry/types";
import { buildTraceSequence, TOOL_LABEL, type TraceStep } from "@/lib/tracagem/steps";
import type { HighlightState } from "@/lib/geometry/refs";
import { formatNumber, useSettings } from "@/lib/settings/SettingsProvider";
import { cn } from "@/lib/utils";
import { DevelopmentView } from "./DevelopmentView";
import { BenchTools } from "./BenchTools";

type Props = {
  slug: string;
  result: GeometryResult;
  /** Etapa sugerida por um parâmetro em foco (vínculo parâmetro ↔ traçagem). */
  focusStepId?: string | null;
};

/**
 * TRAÇAGEM GUIADA — mostra, passo a passo, como riscar o desenvolvimento
 * direto na chapa. Consome a MESMA geometria do resultado, 2D, 3D e CHAMFER.
 */
export function TracagemPanel({ slug, result, focusStepId }: Props) {
  const { precision } = useSettings();
  const steps = useMemo<TraceStep[]>(() => buildTraceSequence(slug, result), [slug, result]);
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [hideText, setHideText] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [intensity, setIntensity] = useState(1);

  /* Geometria mudou → sequência regenerada e leitura reiniciada. */
  useEffect(() => setIndex(0), [steps]);

  useEffect(() => {
    if (!focusStepId) return;
    const i = steps.findIndex((s) => s.id === focusStepId);
    if (i >= 0) setIndex(i);
  }, [focusStepId, steps]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= steps.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 3200);
    return () => window.clearInterval(id);
  }, [playing, steps.length]);

  const step = steps[Math.min(index, steps.length - 1)]!;

  const highlight: HighlightState = showAll
    ? { refs: [], level: "normal" }
    : { refs: step.geometryRefs, level: "isolated", intensity, label: `${step.order}. ${step.title}` };

  return (
    <div className="space-y-3">
      <div className="grid-bg-fine relative rounded-xl border border-line bg-background/40 p-3">
        <div className="h-[300px] lg:h-[420px]">
          <DevelopmentView pattern={result.development} highlight={highlight} />
        </div>
        <span className="absolute top-2 left-3 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
          Chapa · vista superior · mm
        </span>
      </div>

      {/* CONTROLES */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Ctrl onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <ChevronLeft className="size-3.5" /> Anterior
        </Ctrl>
        <Ctrl
          onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
          disabled={index >= steps.length - 1}
        >
          Próximo <ChevronRight className="size-3.5" />
        </Ctrl>
        <Ctrl onClick={() => setIndex(0)}>
          <RotateCcw className="size-3.5" /> Repetir
        </Ctrl>
        <Ctrl onClick={() => setShowAll((v) => !v)} active={showAll}>
          <Layers className="size-3.5" /> Mostrar tudo
        </Ctrl>
        <Ctrl onClick={() => setHideText((v) => !v)} active={hideText}>
          {hideText ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} Instruções
        </Ctrl>
        <Ctrl onClick={() => setPlaying((v) => !v)} active={playing}>
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} Automático
        </Ctrl>
        <label className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          Destaque
          <input
            type="range"
            min={1}
            max={3}
            step={0.5}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="h-1 w-20 accent-[var(--accent)]"
            aria-label="Intensidade do destaque"
          />
        </label>
      </div>

      {/* PASSOS */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-current={i === index}
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors",
              i === index
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-line text-muted-foreground hover:text-foreground",
            )}
          >
            {s.order}. {s.title}
          </button>
        ))}
      </div>

      {!hideText && (
        <div className="fade-up rounded-xl border border-accent/25 bg-accent/[0.05] p-3">
          <p className="font-mono text-[10px] tracking-[0.16em] text-accent uppercase">
            Passo {step.order} de {steps.length} · {TOOL_LABEL[step.tool]}
          </p>
          <p className="mt-1 text-sm font-medium">{step.title}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{step.instruction}</p>

          {step.measurements.length > 0 && (
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {step.measurements.map((m) => (
                <div
                  key={`${m.label}-${m.value}`}
                  className="rounded-lg border border-line bg-background/50 px-2.5 py-1.5"
                >
                  <p className="font-mono text-[10px] text-muted-foreground">{m.label}</p>
                  <p className="font-mono text-[12px]">
                    {formatNumber(m.value, m.unit === "un" ? 0 : precision)}{" "}
                    <span className="text-muted-foreground">{m.unit}</span>
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground/80">{m.origin}</p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            <span className="text-accent">Conferência:</span> {step.validation}
          </p>
        </div>
      )}

      <BenchTools tool={step.tool} />
    </div>
  );
}

function Ctrl({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors disabled:opacity-40",
        active
          ? "border-accent/60 bg-accent/10 text-accent"
          : "border-line text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
