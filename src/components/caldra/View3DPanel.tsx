import { Compass, Layers, Maximize2, Move, RotateCcw, Ruler, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { GeometryRef } from "@/lib/geometry/refs";
import { cn } from "@/lib/utils";
import { auditModel } from "@/lib/viz3d/audit";
import {
  DEFAULT_VIEW,
  EDGE_MODES,
  type EdgeMode,
  EXTENDED_VIEW_PRESETS,
  VIEW_PRESETS,
  type ViewPresetId,
} from "@/lib/viz3d/cameraPresets";
import type { WireModel } from "@/lib/viz3d/wire";
import { Wire3D } from "./Wire3D";

export type VisualizationMode = "2d" | "3d";

export type SelectionBinding = {
  refForEdge?: ((index: number) => GeometryRef | null) | undefined;
  refForFace?: ((index: number) => GeometryRef | null) | undefined;
  highlightRef?: GeometryRef | readonly GeometryRef[] | null | undefined;
  onSelectRef?: ((ref: GeometryRef | null) => void) | undefined;
};

type PanelProps = {
  model: WireModel;
  unfold: number;
  onUnfold: (v: number) => void;
  onPlanificar?: () => void;
  className?: string;
  selection?: SelectionBinding | undefined;
  mode?: VisualizationMode;
  onModeChange?: ((m: VisualizationMode) => void) | undefined;
};

/** Seletor segmentado [ 2D | 3D ] integrado na barra superior estruturada */
function ModeSegmentedSwitch({
  mode,
  onModeChange,
}: {
  mode: VisualizationMode;
  onModeChange?: ((m: VisualizationMode) => void) | undefined;
}) {
  if (!onModeChange) return null;
  return (
    <div
      role="tablist"
      aria-label="Alternar visualização 2D e 3D"
      className="inline-flex shrink-0 items-center rounded-lg border border-slate-400/20 bg-[#0B1120] p-0.5 font-mono text-[10px] font-bold"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "2d"}
        onClick={() => onModeChange("2d")}
        className={cn(
          "h-6 rounded-md px-2.5 transition-colors",
          mode === "2d"
            ? "bg-sky-400 text-slate-950 shadow-sm"
            : "text-slate-300 hover:text-white",
        )}
      >
        2D
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "3d"}
        onClick={() => onModeChange("3d")}
        className={cn(
          "h-6 rounded-md px-2.5 transition-colors",
          mode === "3d"
            ? "bg-sky-400 text-slate-950 shadow-sm"
            : "text-slate-300 hover:text-white",
        )}
      >
        3D
      </button>
    </div>
  );
}

function Structured3DStage({
  model,
  unfold,
  onUnfold,
  selection,
  mode = "3d",
  onModeChange,
  expanded,
  onToggleExpand,
}: {
  model: WireModel;
  unfold: number;
  onUnfold: (v: number) => void;
  selection?: SelectionBinding | undefined;
  mode?: VisualizationMode;
  onModeChange?: ((m: VisualizationMode) => void) | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [view, setView] = useState<ViewPresetId>(DEFAULT_VIEW);
  const [viewNonce, setViewNonce] = useState(0);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("shaded");
  const [dragMode, setDragMode] = useState<"orbit" | "pan">("orbit");
  const [showExtendedViews, setShowExtendedViews] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [thickLayer, setThickLayer] = useState(false);

  const audit = useMemo(() => (showDiag ? auditModel(model) : null), [model, showDiag]);

  const selectView = (id: ViewPresetId) => {
    setView(id);
    setViewNonce((n) => n + 1);
  };

  const resetCamera = () => {
    setView(DEFAULT_VIEW);
    setViewNonce((n) => n + 1);
    onUnfold(0);
  };

  return (
    <div
      data-testid="viewer-3d-structured"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-400/20 bg-[#0D1322] shadow-lg",
        expanded ? "h-full w-full" : "w-full",
      )}
    >
      {/* BARRAS SUPERIORES DO VISUALIZADOR (MODO 3D) */}
      <div
        data-testid="viewer-topbar-3d"
        className="flex flex-col border-b border-slate-400/15 bg-[#11192B]"
      >
        {/* Linha 1 (Topo do Visualizador): [ ISO | FR | LAT | SUP | + ] à esquerda + [ 2D | 3D ] à direita */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-400/10 px-3 py-1.5">
          <div
            role="group"
            aria-label="Perspectivas ortográficas e isométrica"
            className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-400/15 bg-[#0B1120] p-0.5 font-mono text-[10px]"
          >
            {(showExtendedViews ? EXTENDED_VIEW_PRESETS : VIEW_PRESETS).map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectView(v.id)}
                  aria-pressed={active}
                  title={v.title}
                  className={cn(
                    "h-6 rounded-md px-2 font-bold transition-colors",
                    active
                      ? "bg-sky-400 text-slate-950"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
                  )}
                >
                  {v.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowExtendedViews((s) => !s)}
              title={showExtendedViews ? "Menos vistas" : "Todas as vistas (TRAS, DIR, ESQ, INF)"}
              className="h-6 rounded-md px-1.5 font-bold text-slate-400 hover:bg-slate-800/70 hover:text-white"
            >
              {showExtendedViews ? "−" : "+"}
            </button>
          </div>

          <ModeSegmentedSwitch mode={mode} onModeChange={onModeChange} />
        </div>

        {/* Linha 2 (Sub-barra Técnica Compacta): [ SOMB | SOMB+AR | ARAME | SOLID ] + [ Órbita | Pan | DIAG ] */}
        <div className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5">
          <div
            role="group"
            aria-label="Modos de visualização 3D"
            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-400/15 bg-[#0B1120] p-0.5 font-mono text-[9.5px]"
          >
            {EDGE_MODES.map((m) => {
              const active = edgeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEdgeMode(m.id)}
                  aria-pressed={active}
                  title={m.title}
                  className={cn(
                    "h-6 rounded-md px-1.5 font-bold transition-colors",
                    active
                      ? "bg-sky-400 text-slate-950"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Controles rápidos de interação 3D"
            className="inline-flex items-center gap-1 font-mono text-[9.5px]"
          >
            <div className="inline-flex items-center rounded-lg border border-slate-400/15 bg-[#0B1120] p-0.5">
              <button
                type="button"
                onClick={() => setDragMode("orbit")}
                aria-pressed={dragMode === "orbit"}
                title="Modo Órbita (Rotacionar 360°)"
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-semibold transition-colors",
                  dragMode === "orbit"
                    ? "bg-sky-400 text-slate-950"
                    : "text-slate-300 hover:text-white",
                )}
              >
                <Compass className="size-3" />
                <span>Órbita</span>
              </button>
              <button
                type="button"
                onClick={() => setDragMode("pan")}
                aria-pressed={dragMode === "pan"}
                title="Modo Pan (Mover peça livremente)"
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-semibold transition-colors",
                  dragMode === "pan"
                    ? "bg-sky-400 text-slate-950"
                    : "text-slate-300 hover:text-white",
                )}
              >
                <Move className="size-3" />
                <span>Pan</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDiag((d) => !d)}
              aria-pressed={showDiag}
              title="Diagnóstico geométrico da malha 3D"
              className={cn(
                "h-6 rounded-lg border px-1.5 font-bold transition-colors",
                showDiag
                  ? "border-sky-400 bg-sky-400/20 text-sky-300"
                  : "border-slate-400/15 bg-[#0B1120] text-slate-400 hover:text-slate-200",
              )}
            >
              DIAG
            </button>
          </div>
        </div>
      </div>

      {/* ÁREA ÚTIL DO CANVAS 3D (Zero Botões Flutuantes Sobre a Peça) */}
      <div
        data-testid="viewer-canvas-3d"
        className={cn(
          "relative flex w-full items-center justify-center bg-[#0D1322]",
          expanded ? "min-h-0 flex-1" : "h-[248px] sm:h-[268px]",
        )}
      >
        <Wire3D
          model={model}
          interactive
          autoSpin={false}
          mode={dragMode}
          unfold={unfold}
          view={view}
          viewNonce={viewNonce}
          edgeMode={edgeMode}
          showRefLines={thickLayer ? true : undefined}
          refForEdge={selection?.refForEdge}
          refForFace={selection?.refForFace}
          highlightRef={selection?.highlightRef}
          onSelectRef={selection?.onSelectRef}
          className="h-full w-full"
        />

        {showDiag && audit && (
          <div className="pointer-events-auto absolute top-2 left-2 z-20 max-w-[270px] rounded-xl border border-slate-400/25 bg-[#0B1120]/95 p-2.5 font-mono text-[10px] text-slate-300 shadow-xl backdrop-blur">
            <div className="mb-1 flex items-center justify-between border-b border-slate-400/20 pb-1 font-bold text-slate-100">
              <span>AUDITORIA 3D ({model.shadingStyle?.toUpperCase()})</span>
              <span
                className={
                  audit.degenerate === 0 && audit.badNormals === 0
                    ? "text-emerald-400"
                    : "text-amber-400"
                }
              >
                {audit.degenerate === 0 && audit.badNormals === 0 ? " ÍNTEGRO" : " ALERTA"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span>Faces: {audit.faces}</span>
              <span>Triâng.: {audit.triangles}</span>
              <span>Vértices: {audit.vertices}</span>
              <span>Arestas: {audit.edges}</span>
              <span>Degeneradas: {audit.degenerate}</span>
              <span>Duplicadas: {audit.duplicates}</span>
            </div>
          </div>
        )}
      </div>

      {/* BARRA INFERIOR DE RODAPÉ DO VISUALIZADOR 3D (Eliminação da colisão na barra 360°) */}
      <div
        data-testid="viewer-footer-3d"
        className="flex items-center justify-between gap-3 border-t border-slate-400/15 bg-[#11192B] px-3 py-2"
      >
        {/* Esquerda: Rótulo 360° + Slider com largura controlada (flex: 1, max-width: 52%) */}
        <div className="flex max-w-[52%] flex-1 items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] font-bold text-slate-300">
            {unfold > 0.02 ? `${Math.round(unfold * 100)}%` : "360°"}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={unfold}
            onChange={(e) => onUnfold(Number(e.target.value))}
            aria-label="Revolução 360° e abertura da peça"
            className="h-1.5 min-w-[72px] flex-1 cursor-pointer accent-sky-400"
          />
        </div>

        {/* Direita: Grupo alinhado com os 3 botões circulares (34px × 34px) */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetCamera}
            aria-label="Restaurar câmera"
            title="Restaurar câmera padrão"
            className="flex size-[34px] items-center justify-center rounded-full border border-slate-400/20 bg-[#0B1120] text-slate-300 transition-colors hover:border-sky-400/50 hover:text-white"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setThickLayer((t) => !t)}
            aria-pressed={thickLayer}
            aria-label="Camadas e parede"
            title="Alternar eixos e camadas de parede"
            className={cn(
              "flex size-[34px] items-center justify-center rounded-full border transition-colors",
              thickLayer
                ? "border-sky-400 bg-sky-400 text-slate-950"
                : "border-slate-400/20 bg-[#0B1120] text-slate-300 hover:border-sky-400/50 hover:text-white",
            )}
          >
            <Layers className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Fechar visualização expandida" : "Expandir visualizador"}
            title={expanded ? "Fechar visualização expandida (Esc)" : "Expandir visualizador"}
            className="flex size-[34px] items-center justify-center rounded-full border border-slate-400/20 bg-[#0B1120] text-slate-300 transition-colors hover:border-sky-400/50 hover:text-white"
          >
            {expanded ? <X className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Painel 3D com suporte a expansão em tela cheia.
 */
export function View3DPanel({
  model,
  unfold,
  onUnfold,
  className,
  selection,
  mode = "3d",
  onModeChange,
}: PanelProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <div className={cn("relative w-full", className)}>
        <Structured3DStage
          model={model}
          unfold={unfold}
          onUnfold={onUnfold}
          selection={selection}
          mode={mode}
          onModeChange={onModeChange}
          expanded={false}
          onToggleExpand={() => setExpanded(true)}
        />
      </div>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visualização 3D em tela cheia"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-md sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative h-[86vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Structured3DStage
              model={model}
              unfold={unfold}
              onUnfold={onUnfold}
              selection={selection}
              mode={mode}
              onModeChange={onModeChange}
              expanded
              onToggleExpand={() => setExpanded(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Região B — Card Visualizador Geométrico 2D / 3D (Zero Botões Flutuantes Sobre a Peça).
 */
export function VisualizationViewport({
  mode,
  onModeChange,
  model,
  unfold,
  onUnfold,
  onPlanificar,
  selection,
  children,
  className,
  showGeneratrices = true,
  onToggleGeneratrices,
}: {
  mode: VisualizationMode;
  onModeChange: (m: VisualizationMode) => void;
  model: WireModel;
  unfold: number;
  onUnfold: (v: number) => void;
  onPlanificar?: () => void;
  selection?: SelectionBinding | undefined;
  children?: ReactNode;
  className?: string;
  showGeneratrices?: boolean;
  onToggleGeneratrices?: () => void;
}) {
  if (mode === "3d") {
    return (
      <View3DPanel
        model={model}
        unfold={unfold}
        onUnfold={onUnfold}
        onPlanificar={onPlanificar}
        selection={selection}
        mode={mode}
        onModeChange={onModeChange}
        className={className}
      />
    );
  }

  return (
    <div
      data-testid="viewer-2d-structured"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-400/20 bg-[#0D1322] shadow-lg",
        className,
      )}
    >
      {/* BARRA SUPERIOR DO VISUALIZADOR (MODO 2D) */}
      <div
        data-testid="viewer-topbar-2d"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-400/15 bg-[#11192B] px-3 py-2"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-slate-300 uppercase">
            VISTA 2D • MM
          </span>
          {onToggleGeneratrices && (
            <button
              type="button"
              onClick={onToggleGeneratrices}
              aria-pressed={showGeneratrices}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
                showGeneratrices
                  ? "border-sky-400/60 bg-sky-400/15 text-sky-300"
                  : "border-slate-400/20 bg-[#0B1120] text-slate-400 hover:text-slate-200",
              )}
              title="Mostrar/ocultar geratrizes numeradas na projeção 2D"
            >
              <Ruler className="size-3" />
              <span>GERATRIZES</span>
            </button>
          )}
        </div>
        <ModeSegmentedSwitch mode={mode} onModeChange={onModeChange} />
      </div>

      {/* ÁREA ÚTIL DO DESENHO 2D (Fundo técnico limpo sem grid e sem botões sobrepostos) */}
      <div
        data-testid="viewer-canvas-2d"
        className="relative flex h-[248px] w-full items-center justify-center bg-[#0D1322] sm:h-[268px]"
      >
        {children}
      </div>
    </div>
  );
}
