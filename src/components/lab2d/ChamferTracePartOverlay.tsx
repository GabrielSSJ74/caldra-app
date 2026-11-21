/**
 * CALDRA CHAMFER — OVERLAY E BARRA DE CONTROLE DA FERRAMENTA "TRAÇAR PEÇA"
 * (TRIM INVERSO / PASSAR A LIMPO SOBRE GABARITOS)
 *
 * - Renderiza os sub-trechos selecionados (arcos e linhas reais, ZERO cordas falsas)
 *   iluminados em Verde Esmeralda (#10B981) com fluxo luminoso e nós exatos de interseção;
 * - Renderiza o rastro translúcido do pincel/faca durante o arraste contínuo;
 * - Barra superior compacta 100% sincronizada com `--chamfer-*`:
 *     [ ✓ Criar Peça (N) ]  [ ↩ Desmarcar ]  [ Limpar ]  [ 👁️ Ocultar Gabarito ]  [ 🧹 Apagar Gabarito ]  [ ✕ ]
 */

import React from "react";
import { Check, Eye, EyeOff, PenTool, RotateCcw, Trash2, X } from "lucide-react";
import type { Vec2 } from "@/lib/geometry/types";
import {
  trimPrimitiveToSvgPath,
  type TracePartPreview,
  type TrimSubPiece,
} from "@/chamfer/tools/tracePartEngine2D";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface ChamferTracePartSvgOverlayProps {
  preview: TracePartPreview | null;
  hoverPiece: TrimSubPiece | null;
  fenceTrail?: Vec2[];
  viewK: number;
}

export const ChamferTracePartSvgOverlay: React.FC<ChamferTracePartSvgOverlayProps> = ({
  preview,
  hoverPiece,
  fenceTrail = [],
  viewK,
}) => {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const hasSelected = Boolean(preview && preview.selectedPieces.length > 0);
  const hasFence = fenceTrail.length >= 2;
  if (!hasSelected && !hoverPiece && !hasFence) return null;

  const dashLen = 8 / safeK;
  const gapLen = 4 / safeK;
  const dashCycle = (dashLen + gapLen) * 2;

  return (
    <g
      className="pointer-events-none select-none"
      data-testid="chamfer-trace-part-svg-overlay"
      aria-label="Overlay da Ferramenta Traçar Peça (Passar a Limpo)"
    >
      <style>{`
        @keyframes chamferTraceGlowFlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -${dashCycle.toFixed(3)}; }
        }
      `}</style>

      {/* Prévia de hover sobre o sub-trecho exato */}
      {hoverPiece && (
        <path
          data-testid={`trace-hover-${hoverPiece.primitive.kind}`}
          d={trimPrimitiveToSvgPath(hoverPiece.primitive)}
          fill="none"
          stroke="var(--chamfer-accent, #10B981)"
          strokeWidth={3.4 / safeK}
          strokeOpacity={0.55}
          strokeLinecap="round"
        />
      )}

      {/* Sub-trechos selecionados para promover à peça real definitiva */}
      {preview?.selectedPieces.map((sp) => (
        <g key={`trace-sel-${sp.key}`} data-testid={`trace-selected-${sp.primitive.kind}`}>
          <path
            d={trimPrimitiveToSvgPath(sp.primitive)}
            fill="none"
            stroke="#10B981"
            strokeWidth={5.6 / safeK}
            strokeOpacity={0.25}
            strokeLinecap="round"
          />
          <path
            d={trimPrimitiveToSvgPath(sp.primitive)}
            fill="none"
            stroke="#10B981"
            strokeWidth={2.9 / safeK}
            strokeLinecap="round"
          />
          <path
            d={trimPrimitiveToSvgPath(sp.primitive)}
            fill="none"
            stroke="#ECFDF5"
            strokeWidth={1.3 / safeK}
            strokeDasharray={`${dashLen} ${gapLen}`}
            strokeLinecap="round"
            style={{ animation: "chamferTraceGlowFlow 0.9s linear infinite" }}
          />
        </g>
      ))}

      {/* Nós brilhantes nas interseções exatas costuradas */}
      {preview?.intersectionMarkers.map((pt, idx) => (
        <circle
          key={`trace-node-${idx}`}
          data-testid="trace-intersection-node"
          cx={pt.x}
          cy={pt.y}
          r={3.8 / safeK}
          fill="#10B981"
          stroke="#FFFFFF"
          strokeWidth={1.2 / safeK}
        />
      ))}

      {/* Rastro translúcido do pincel/faca ao arrastar o dedo */}
      {hasFence && (
        <polyline
          data-testid="trace-fence-trail"
          points={fenceTrail.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#10B981"
          strokeWidth={2.2 / safeK}
          strokeOpacity={0.65}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
};

export interface ChamferTracePartControlBarProps {
  markedCount: number;
  guideCount: number;
  guidesHidden: boolean;
  onCreatePart: () => void;
  onUnmarkLast: () => void;
  onClearMarks: () => void;
  onToggleHideGuides: () => void;
  onDeleteAllGuides: () => void;
  onExit: () => void;
  uiShellMode?: "compact" | "prumo";
}

export const ChamferTracePartControlBar: React.FC<ChamferTracePartControlBarProps> = ({
  markedCount,
  guideCount,
  guidesHidden,
  onCreatePart,
  onUnmarkLast,
  onClearMarks,
  onToggleHideGuides,
  onDeleteAllGuides,
  onExit,
  uiShellMode = "compact",
}) => {
  return (
    <div
      data-testid="chamfer-trace-part-bar"
      role="toolbar"
      aria-label="Barra da Ferramenta Traçar Peça"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        top: uiShellMode === "prumo" ? 52 : 22,
        backgroundColor: "var(--chamfer-popover-bg, rgba(10, 15, 26, 0.92))",
        borderColor: "var(--chamfer-border-strong, rgba(16, 185, 129, 0.45))",
        color: "var(--chamfer-text-primary, #f1f5f9)",
      }}
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 z-[60] flex flex-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-semibold shadow-xl backdrop-blur-xl select-none max-w-[96vw] overflow-x-auto scrollbar-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1 font-extrabold text-emerald-400 pr-1">
        <PenTool className="size-3.5" />
        <span>TRAÇAR PEÇA</span>
      </span>

      {markedCount === 0 ? (
        <span
          style={{ color: "var(--chamfer-text-secondary, #94a3b8)" }}
          className="text-[10px] px-1"
        >
          Toque ou arraste sobre os trechos do gabarito para passar a limpo
        </span>
      ) : (
        <>
          <button
            type="button"
            data-testid="trace-part-create-btn"
            onClick={() => {
              triggerHaptic("success");
              onCreatePart();
            }}
            style={{
              backgroundColor: "var(--chamfer-accent, #10B981)",
              color: "#FFFFFF",
            }}
            className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold shadow-sm cursor-pointer active:scale-95 shrink-0"
          >
            <Check className="size-3 stroke-[2.6]" />
            <span>Criar Peça ({markedCount})</span>
          </button>

          <button
            type="button"
            data-testid="trace-part-unmark-btn"
            onClick={() => {
              triggerHaptic("tap");
              onUnmarkLast();
            }}
            className="flex items-center gap-1 rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold opacity-85 hover:opacity-100 cursor-pointer shrink-0"
            title="Desmarcar último sub-trecho"
          >
            <RotateCcw className="size-3" />
            <span>Desmarcar</span>
          </button>

          <button
            type="button"
            data-testid="trace-part-clear-btn"
            onClick={() => {
              triggerHaptic("tap");
              onClearMarks();
            }}
            className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            title="Limpar seleção atual"
          >
            Limpar
          </button>
        </>
      )}

      {guideCount > 0 && (
        <>
          <span className="h-3.5 w-px bg-current opacity-20 mx-0.5" />

          <button
            type="button"
            data-testid="trace-part-toggle-guides-btn"
            onClick={() => {
              triggerHaptic("selection");
              onToggleHideGuides();
            }}
            className="flex items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[10px] font-bold opacity-85 hover:opacity-100 cursor-pointer shrink-0"
            title={guidesHidden ? "Mostrar entidades de Gabarito" : "Ocultar entidades de Gabarito"}
          >
            {guidesHidden ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            <span>{guidesHidden ? "Mostrar Gabarito" : "Ocultar Gabarito"}</span>
          </button>

          <button
            type="button"
            data-testid="trace-part-delete-guides-btn"
            onClick={() => {
              triggerHaptic("action");
              onDeleteAllGuides();
            }}
            className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 text-red-400 px-2 py-0.5 text-[10px] font-bold cursor-pointer shrink-0"
            title="Apagar todas as entidades de Gabarito em 1 passo de Undo"
          >
            <Trash2 className="size-3" />
            <span>Apagar Gabarito ({guideCount})</span>
          </button>
        </>
      )}

      <button
        type="button"
        data-testid="trace-part-exit-btn"
        onClick={() => {
          triggerHaptic("tap");
          onExit();
        }}
        className="flex size-5 items-center justify-center rounded-full hover:bg-emerald-500/20 opacity-80 hover:opacity-100 cursor-pointer shrink-0"
        title="Sair do modo Traçar Peça (Esc)"
      >
        <X className="size-3" />
      </button>
    </div>
  );
};
