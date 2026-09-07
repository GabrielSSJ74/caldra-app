/**
 * VISUALIZAÇÃO 3D COMO CAMADA, NÃO COMO ETAPA.
 *
 * O 3D deixou de ser uma aba do fluxo (Geometria → Planificação → Fabricação)
 * e virou uma alternância dentro da própria área de resultado: a mesma peça,
 * vista em 2D ou em 3D. O modelo só é carregado quando o 3D é ligado.
 */

import { Suspense, lazy } from "react";
import { Box, Square } from "lucide-react";
import type { WireModel } from "@/lib/viz3d/wire";
import { cn } from "@/lib/utils";

const Wire3D = lazy(() => import("./Wire3D").then((m) => ({ default: m.Wire3D })));

/** Bolha de alternância: mostra para onde o toque leva (3D ↔ 2D). */
export function View3DToggle({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Ver em 2D" : "Ver em 3D"}
      className={cn(
        "flex size-11 items-center justify-center rounded-full border border-accent/35 bg-accent/12 text-accent backdrop-blur transition-transform hover:scale-105 active:scale-95",
        className,
      )}
    >
      <span className="flex flex-col items-center leading-none">
        {active ? <Square className="size-3.5" /> : <Box className="size-3.5" />}
        <span className="mt-0.5 font-mono text-[9px] tracking-wider">{active ? "2D" : "3D"}</span>
      </span>
    </button>
  );
}

export function View3DPanel({
  model,
  unfold,
  onUnfold,
  onPlanificar,
}: {
  model: WireModel;
  unfold: number;
  onUnfold: (v: number) => void;
  onPlanificar: () => void;
}) {
  return (
    <div className="grid-bg-fine relative rounded-2xl border border-line bg-background/40">
      <Suspense
        fallback={
          <div className="grid h-[300px] w-full place-items-center font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase lg:h-[420px]">
            Carregando 3D…
          </div>
        }
      >
        <Wire3D
          interactive
          unfold={unfold}
          model={model}
          className="h-[300px] w-full text-foreground/80 lg:h-[420px]"
        />
      </Suspense>
      <div className="absolute inset-x-4 bottom-3 flex items-center gap-3">
        <span className="font-mono text-[9px] text-muted-foreground uppercase">3D</span>
        <input
          type="range"
          min={0}
          max={100}
          value={unfold * 100}
          onChange={(e) => onUnfold(Number(e.target.value) / 100)}
          aria-label="Abrir peça"
          className="h-1 flex-1 accent-[var(--accent)]"
        />
        <button onClick={onPlanificar} className="font-mono text-[9px] text-accent uppercase">
          Planificar
        </button>
      </div>
    </div>
  );
}
