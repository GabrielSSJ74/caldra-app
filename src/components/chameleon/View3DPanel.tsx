/**
 * VISUALIZAÇÃO 3D COMO CAMADA, NÃO COMO ETAPA.
 *
 * O 3D deixou de ser uma aba do fluxo (Geometria → Planificação → Fabricação)
 * e virou uma alternância dentro da própria área de resultado: a mesma peça,
 * vista em 2D ou em 3D. O modelo só é carregado quando o 3D é ligado.
 */

import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import type { WireModel } from "@/lib/viz3d/wire";
import {
  DEFAULT_VIEW,
  EDGE_MODES,
  VIEW_PRESETS,
  type EdgeMode,
  type ViewPresetId,
} from "@/lib/viz3d/cameraPresets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const Wire3D = lazy(() => import("./Wire3D").then((m) => ({ default: m.Wire3D })));

export type VisualizationMode = "2d" | "3d";

/**
 * Área principal única da Traçagem. O 3D é montado somente no primeiro uso e
 * depois permanece vivo, preservando câmera, zoom e orientação ao voltar ao 2D.
 */
export function VisualizationViewport({
  mode,
  onModeChange,
  model,
  unfold,
  onUnfold,
  onPlanificar,
  allow3d = true,
  children,
}: {
  mode: VisualizationMode;
  onModeChange: (mode: VisualizationMode) => void;
  model: WireModel;
  unfold: number;
  onUnfold: (value: number) => void;
  onPlanificar: () => void;
  allow3d?: boolean;
  children: ReactNode;
}) {
  const [mounted3d, setMounted3d] = useState(mode === "3d");

  useEffect(() => {
    if (mode === "3d") setMounted3d(true);
  }, [mode]);

  const activeMode: VisualizationMode = allow3d ? mode : "2d";

  return (
    <div className="grid-bg relative h-[300px] overflow-hidden rounded-xl border border-line bg-background/40 lg:h-[420px]">
      <div className={cn("size-full", activeMode !== "2d" && "invisible absolute inset-0")}>
        {children}
      </div>
      {mounted3d && allow3d && (
        <div className={cn("size-full", activeMode !== "3d" && "invisible absolute inset-0")}>
          <View3DPanel
            model={model}
            unfold={unfold}
            onUnfold={onUnfold}
            onPlanificar={onPlanificar}
          />
        </div>
      )}
      {allow3d && (
        <div
          className="absolute top-2 right-2 z-20 flex rounded-md border border-line bg-background/85 p-0.5 shadow-sm backdrop-blur"
          role="group"
          aria-label="Modo de visualização"
        >
          {(["2d", "3d"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={activeMode === item}
              onClick={() => onModeChange(item)}
              className={cn(
                "h-7 min-w-11 px-2 font-mono text-[10px] uppercase shadow-none",
                activeMode === item && "bg-accent/15 text-accent",
              )}
            >
              {item.toUpperCase()}
            </Button>
          ))}
        </div>
      )}
    </div>
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
  const [view, setView] = useState<ViewPresetId>(DEFAULT_VIEW);
  const [viewNonce, setViewNonce] = useState(0);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("shaded-edges");

  return (
    <div className="grid-bg-fine relative size-full">
      <Suspense
        fallback={
          <div className="grid size-full place-items-center font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            Carregando 3D…
          </div>
        }
      >
        <Wire3D
          interactive
          unfold={unfold}
          model={model}
          view={view}
          viewNonce={viewNonce}
          edgeMode={edgeMode}
          className="size-full text-foreground/80"
        />
      </Suspense>
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        <div className="flex rounded-md border border-line bg-background/85 p-0.5 shadow-sm backdrop-blur" role="group" aria-label="Vistas padrão">
          {VIEW_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="ghost"
              title={preset.title}
              aria-pressed={view === preset.id}
              onClick={() => {
                setView(preset.id);
                setViewNonce((n) => n + 1);
              }}
              className={cn(
                "h-6 min-w-8 px-1.5 font-mono text-[9px] uppercase shadow-none",
                view === preset.id && "bg-accent/15 text-accent",
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="flex rounded-md border border-line bg-background/85 p-0.5 shadow-sm backdrop-blur" role="group" aria-label="Modo de aresta">
          {EDGE_MODES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant="ghost"
              title={item.title}
              aria-pressed={edgeMode === item.id}
              onClick={() => setEdgeMode(item.id)}
              className={cn(
                "h-6 px-1.5 font-mono text-[9px] uppercase shadow-none",
                edgeMode === item.id && "bg-accent/15 text-accent",
              )}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

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
        <Button type="button" size="sm" variant="ghost" onClick={onPlanificar} className="h-7 px-2 font-mono text-[9px] text-accent uppercase shadow-none">
          Planificar
        </Button>
      </div>
    </div>
  );
}
