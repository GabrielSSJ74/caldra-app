/**
 * CALDRA CHAMFER CAD 2D — SUB-BARRA E HUD DA FERRAMENTA "DESENHO LIVRE" (`FREEHAND SKETCH`)
 *
 * Controles:
 *  - Modos de vetorização: `[ Fiel ] | [ Suave ] | [ Poligonal ]`
 *  - Tolerância de simplificação RDP: `0,5 px` a `6,0 px` (padrão `1,5 px`)
 *  - Fechamento explícito de contorno: `[ ⬠ Fechar Contorno ]`
 *  - Papel de Uso: `Uso: [ ⚙️ Geometria (Corte/3D) | 🖍️ Marcação (Rascunho) ]`
 *  - Telemetria Ao Vivo: `Desenho Livre | L Total: {perimetro} mm | ΔX: {largura} × ΔY: {altura} mm`
 *  - Sugestão Não-Intrusiva (4s): `[ 💡 Converter em Círculo / Retângulo ]`
 */

import React from "react";
import { Check, X, Sparkles, Hexagon, PenTool, Highlighter } from "lucide-react";
import type {
  FreehandLiveMetrics,
  FreehandPrimitiveSuggestion,
  FreehandSmoothingMode,
  FreehandUsageRole,
} from "@/lib/lab2d/chamferFreehandEngine";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export interface ChamferFreehandSubBarProps {
  visible: boolean;
  isDark?: boolean;
  topOffsetPx?: number;
  mode: FreehandSmoothingMode;
  onChangeMode: (m: FreehandSmoothingMode) => void;
  tolerancePx: number;
  onChangeTolerancePx: (px: number) => void;
  autoClose: boolean;
  onToggleAutoClose: () => void;
  usageRole: FreehandUsageRole;
  onChangeUsageRole: (role: FreehandUsageRole) => void;
  liveMetrics: FreehandLiveMetrics | null;
  suggestion: {
    entityId: string;
    data: FreehandPrimitiveSuggestion;
  } | null;
  onAcceptSuggestion: () => void;
  onDismissSuggestion: () => void;
  onExitTool: () => void;
}

export const ChamferFreehandSubBar: React.FC<ChamferFreehandSubBarProps> = React.memo(
  function ChamferFreehandSubBar({
    visible,
    isDark = true,
    topOffsetPx = 52,
    mode,
    onChangeMode,
    tolerancePx,
    onChangeTolerancePx,
    autoClose,
    onToggleAutoClose,
    usageRole,
    onChangeUsageRole,
    liveMetrics,
    suggestion,
    onAcceptSuggestion,
    onDismissSuggestion,
    onExitTool,
  }) {
    if (!visible) return null;

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
      <div
        data-testid="chamfer-freehand-subbar"
        style={{ top: topOffsetPx }}
        onPointerDown={stop}
        onClick={stop}
        className="pointer-events-none fixed inset-x-2 z-40 flex flex-col items-center gap-1.5 select-none"
      >
        {/* BARRA CONTEXTUAL DE DESENHO LIVRE */}
        <div
          className={cn(
            "pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-1.5 font-mono text-[9.5px] font-bold shadow-xl backdrop-blur-md",
            isDark
              ? "border-slate-700/90 bg-[#0B111E]/92 text-slate-100"
              : "border-slate-300 bg-white/94 text-slate-900",
          )}
        >
          {/* Modos: Fiel | Suave | Poligonal */}
          <div
            role="group"
            aria-label="Modo de suavização do desenho livre"
            className={cn(
              "flex items-center gap-0.5 rounded-xl border p-0.5",
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100",
            )}
          >
            {(
              [
                { id: "fiel", label: "Fiel" },
                { id: "suave", label: "Suave" },
                { id: "poligonal", label: "Poligonal" },
              ] as { id: FreehandSmoothingMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`freehand-mode-${m.id}`}
                onClick={() => {
                  triggerHaptic("selection");
                  onChangeMode(m.id);
                }}
                className={cn(
                  "rounded-lg px-2 py-0.5 transition-colors cursor-pointer",
                  mode === m.id
                    ? "bg-sky-500 text-slate-950 font-extrabold"
                    : isDark
                      ? "text-slate-400 hover:text-white"
                      : "text-slate-600 hover:text-slate-950",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Tolerância RDP em pixels (0.5 .. 6.0 px) */}
          <div
            className={cn(
              "flex items-center gap-1 rounded-xl border px-2 py-0.5",
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100",
            )}
          >
            <span className="text-slate-400">Tol:</span>
            <input
              type="range"
              aria-label="Tolerância de simplificação em pixels"
              min={0.5}
              max={6.0}
              step={0.5}
              value={tolerancePx}
              onChange={(e) => onChangeTolerancePx(Number(e.target.value))}
              className="h-1.5 w-14 cursor-pointer accent-sky-500"
            />
            <span className="w-8 text-right tabular-nums text-sky-400">
              {String(tolerancePx).replace(".", ",")}px
            </span>
          </div>

          {/* Fechar Contorno */}
          <button
            type="button"
            data-testid="freehand-close-contour-toggle"
            onClick={() => {
              triggerHaptic("selection");
              onToggleAutoClose();
            }}
            title="Fechar automaticamente o contorno conectando fim ao início (permite Extrusão 3D imediata)"
            className={cn(
              "flex items-center gap-1 rounded-xl border px-2 py-1 transition-colors cursor-pointer",
              autoClose
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                : isDark
                  ? "border-slate-700 bg-slate-900 text-slate-300"
                  : "border-slate-200 bg-slate-100 text-slate-700",
            )}
          >
            <Hexagon className="size-3" />
            <span>Fechar Contorno</span>
          </button>

          {/* Papel: Geometria (Corte/3D) vs Marcação (Rascunho) */}
          <div
            role="group"
            aria-label="Papel do traço livre"
            className={cn(
              "flex items-center gap-0.5 rounded-xl border p-0.5",
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100",
            )}
          >
            <button
              type="button"
              data-testid="freehand-role-geometry"
              onClick={() => {
                triggerHaptic("selection");
                onChangeUsageRole("geometry");
              }}
              title="Entra no corte CNC (.DXF), BOM e permite Extrusão 3D quando fechado"
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-0.5 cursor-pointer",
                usageRole === "geometry"
                  ? "bg-sky-500 text-slate-950 font-extrabold"
                  : "text-slate-400",
              )}
            >
              <PenTool className="size-2.5" />
              <span>Geometria</span>
            </button>
            <button
              type="button"
              data-testid="freehand-role-markup"
              onClick={() => {
                triggerHaptic("selection");
                onChangeUsageRole("markup");
              }}
              title="Rascunho/Marcação de revisão: excluído do corte CNC (.DXF), BOM e Extrusão 3D"
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-0.5 cursor-pointer",
                usageRole === "markup"
                  ? "bg-amber-400 text-slate-950 font-extrabold"
                  : "text-slate-400",
              )}
            >
              <Highlighter className="size-2.5" />
              <span>Marcação</span>
            </button>
          </div>

          {/* Telemetria em Tempo Real do Traço */}
          <span
            data-testid="freehand-live-hud"
            className={cn(
              "rounded-lg px-1.5 py-0.5 tabular-nums",
              isDark ? "bg-slate-900/90 text-slate-300" : "bg-slate-100 text-slate-700",
            )}
          >
            {liveMetrics && liveMetrics.pointCount >= 2
              ? `L Total: ${String(liveMetrics.totalLengthMm).replace(".", ",")} mm | ΔX: ${String(liveMetrics.deltaXMm).replace(".", ",")} × ΔY: ${String(liveMetrics.deltaYMm).replace(".", ",")} mm`
              : "Arraste no canvas p/ desenhar"}
          </span>

          {/* Confirmar / Concluir ferramenta */}
          <button
            type="button"
            onClick={onExitTool}
            title="Concluir e voltar ao Ponteiro"
            aria-label="Concluir Desenho Livre"
            className="flex items-center gap-0.5 rounded-xl bg-emerald-500 px-2 py-1 text-slate-950 font-extrabold cursor-pointer"
          >
            <Check className="size-3 stroke-[2.8]" />
          </button>
          <button
            type="button"
            onClick={onExitTool}
            title="Sair da ferramenta Desenho Livre (Esc)"
            aria-label="Fechar Desenho Livre"
            className={cn(
              "rounded-xl border p-1 cursor-pointer",
              isDark ? "border-slate-700 text-slate-400 hover:text-white" : "border-slate-300 text-slate-600",
            )}
          >
            <X className="size-3" />
          </button>
        </div>

        {/* CHIP OPCIONAL NÃO-INTRUSIVO (4s): CONVERTER EM CÍRCULO OU RETÂNGULO EXATO */}
        {suggestion && (
          <div
            data-testid="freehand-primitive-suggestion-chip"
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] font-bold shadow-lg animate-in fade-in slide-in-from-top-1 duration-150",
              isDark
                ? "border-amber-400/50 bg-slate-900/95 text-amber-300"
                : "border-amber-400 bg-amber-50 text-amber-900",
            )}
          >
            <Sparkles className="size-3.5 shrink-0 text-amber-400" />
            <button
              type="button"
              onClick={onAcceptSuggestion}
              className="underline decoration-amber-400/70 underline-offset-2 hover:text-white cursor-pointer"
            >
              {suggestion.data.label}
            </button>
            <button
              type="button"
              onClick={onDismissSuggestion}
              aria-label="Manter traço livre"
              className="rounded-full p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
    );
  },
);
