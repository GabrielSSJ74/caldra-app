/**
 * CALDRA CHAMFER — OVERLAY E BARRA DE CONFIRMAÇÃO DO TRIM / APARAR UNIFICADO
 *
 * - Animação real sobre a curva/linha exata (`trimPrimitiveToSvgPath`):
 *     • ZERO cordas retas falsas sobre círculos e arcos!
 *     • Trechos marcados para apagar em Vermelho Vivo (#EF4444) tracejado com animação contínua
 *       (`strokeDashoffset` fluindo suavemente) + marcadores `✕` nas interseções exatas;
 *     • Trechos remanescentes da mesma entidade destacados em Verde Esmeralda (#10B981, 0.90);
 *     • Rastro translúcido da "Faca / Fence Swipe" durante o arraste com o dedo.
 * - Barra de confirmação obrigatória (modo Instantâneo DESLIGADO por padrão):
 *     • [ ✓ Confirmar Corte (N) ]  [ ↩ Desmarcar Último ]  [ Limpar ]  [ ⚡ Instantâneo ]  [ ✕ ]
 * - 100% sincronizado com `--chamfer-*` (Tema Claro/Escuro/AMOLED + Cor de Destaque).
 */

import React from "react";
import type { Vec2 } from "@/lib/geometry/types";
import {
  trimPrimitiveToSvgPath,
  type TrimBatchPreview,
  type TrimBoundaryMode,
} from "@/chamfer/tools/trimEngine2D";
import { Scissors, Check, X, RotateCcw, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface ChamferUnifiedTrimSvgOverlayProps {
  preview: TrimBatchPreview | null;
  fenceTrail?: Vec2[];
  viewK: number;
}

export function ChamferSmartTrimSvgOverlay({
  preview,
  fenceTrail = [],
  viewK,
}: ChamferUnifiedTrimSvgOverlayProps) {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const hasPreview =
    preview && (preview.markedCutPieces.length > 0 || preview.keptPieces.length > 0);
  const hasFence = fenceTrail.length >= 2;

  if (!hasPreview && !hasFence) return null;

  const dashLen = 6 / safeK;
  const gapLen = 4 / safeK;
  const dashCycle = (dashLen + gapLen) * 2;

  return (
    <g
      className="pointer-events-none select-none"
      data-testid="chamfer-unified-trim-svg-overlay"
      aria-label="Pré-visualização do Trim Unificado"
    >
      <style>{`
        @keyframes chamferTrimFlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -${dashCycle.toFixed(3)}; }
        }
      `}</style>

      {/* 1. Trechos da mesma entidade que VÃO PERMANECER (Verde Esmeralda Limpo, exato sobre a curva/linha) */}
      {preview?.keptPieces.map((sp) => (
        <path
          key={`trim-kept-${sp.key}`}
          data-testid={`trim-kept-${sp.primitive.kind}`}
          d={trimPrimitiveToSvgPath(sp.primitive)}
          fill="none"
          stroke="#10B981"
          strokeWidth={3.1 / safeK}
          strokeOpacity={0.9}
          strokeLinecap="round"
        />
      ))}

      {/* 2. Trechos MARCADOS PARA APAGAR (Vermelho Vivo tracejado animado exatamente sobre a curva/linha) */}
      {preview?.markedCutPieces.map((sp) => (
        <g key={`trim-cut-${sp.key}`} data-testid={`trim-cut-${sp.primitive.kind}`}>
          {/* Halo suave vermelho para contraste em qualquer tema */}
          <path
            d={trimPrimitiveToSvgPath(sp.primitive)}
            fill="none"
            stroke="#EF4444"
            strokeWidth={5.2 / safeK}
            strokeOpacity={0.22}
            strokeLinecap="round"
          />
          {/* Traço animado sobre a primitiva real (arco ou linha) */}
          <path
            d={trimPrimitiveToSvgPath(sp.primitive)}
            fill="none"
            stroke="#EF4444"
            strokeWidth={2.7 / safeK}
            strokeDasharray={`${dashLen} ${gapLen}`}
            strokeLinecap="round"
            style={{ animation: "chamferTrimFlow 0.75s linear infinite" }}
          />
        </g>
      ))}

      {/* 3. Micro-marcadores ✕ brilhando exatamente nas interseções de corte */}
      {preview?.intersectionMarkers.map((pt, idx) => (
        <g key={`trim-x-${idx}`} data-testid="trim-intersection-marker">
          <circle
            cx={pt.x}
            cy={pt.y}
            r={4.8 / safeK}
            fill="rgba(239, 68, 68, 0.28)"
            stroke="#EF4444"
            strokeWidth={1.35 / safeK}
          />
          <line
            x1={pt.x - 3.3 / safeK}
            y1={pt.y - 3.3 / safeK}
            x2={pt.x + 3.3 / safeK}
            y2={pt.y + 3.3 / safeK}
            stroke="#FFFFFF"
            strokeWidth={1.25 / safeK}
            strokeLinecap="round"
          />
          <line
            x1={pt.x + 3.3 / safeK}
            y1={pt.y - 3.3 / safeK}
            x2={pt.x - 3.3 / safeK}
            y2={pt.y + 3.3 / safeK}
            stroke="#FFFFFF"
            strokeWidth={1.25 / safeK}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* 4. Rastro fino translúcido da Lâmina ("Faca / Fence Swipe") */}
      {hasFence && (
        <polyline
          data-testid="trim-fence-blade-trail"
          points={fenceTrail.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#EF4444"
          strokeWidth={2.2 / safeK}
          strokeOpacity={0.62}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

export interface ChamferUnifiedTrimControlBarProps {
  markedCount: number;
  mode: TrimBoundaryMode;
  instantMode: boolean;
  onToggleMode: (m: TrimBoundaryMode) => void;
  onToggleInstantMode: () => void;
  onConfirmCut: () => void;
  onUnmarkLast: () => void;
  onClearMarks: () => void;
  onExit: () => void;
  uiShellMode?: "compact" | "prumo";
}

export function ChamferSmartTrimControlBar({
  markedCount,
  mode,
  instantMode,
  onToggleMode,
  onToggleInstantMode,
  onConfirmCut,
  onUnmarkLast,
  onClearMarks,
  onExit,
  uiShellMode = "compact",
}: ChamferUnifiedTrimControlBarProps) {
  return (
    <div
      role="toolbar"
      data-testid="chamfer-unified-trim-bar"
      aria-label="Barra de Controle do Aparar (Trim)"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        top: uiShellMode === "prumo" ? 52 : 22,
        backgroundColor: "var(--chamfer-popover-bg, rgba(10, 15, 26, 0.92))",
        borderColor: "var(--chamfer-border-strong, rgba(255, 255, 255, 0.16))",
        color: "var(--chamfer-text-primary, #f1f5f9)",
      }}
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 z-40 flex flex-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-semibold shadow-xl backdrop-blur-xl select-none max-w-[96vw] overflow-x-auto scrollbar-none whitespace-nowrap"
    >
      <span
        style={{ color: "var(--chamfer-accent, #E11D48)" }}
        className="flex items-center gap-1 font-extrabold pr-1 shrink-0"
      >
        <Scissors className="size-3.5" />
        <span>APARAR</span>
      </span>

      {/* Botão principal: ✓ Confirmar Corte (N) */}
      {!instantMode && (
        <button
          type="button"
          data-testid="trim-confirm-cut-btn"
          disabled={markedCount === 0}
          onClick={() => {
            triggerHaptic("success");
            onConfirmCut();
          }}
          style={
            markedCount > 0
              ? {
                  backgroundColor: "var(--chamfer-accent, #E11D48)",
                  color: "#FFFFFF",
                }
              : undefined
          }
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold transition-all shrink-0",
            markedCount > 0
              ? "shadow-sm cursor-pointer active:scale-95"
              : "opacity-45 cursor-not-allowed border border-current/20",
          )}
          title="Aplicar todos os cortes marcados em 1 único passo de Undo/Redo"
        >
          <Check className="size-3 stroke-[2.8]" />
          <span>Confirmar Corte ({markedCount})</span>
        </button>
      )}

      {/* Desmarcar Último */}
      {!instantMode && markedCount > 0 && (
        <button
          type="button"
          data-testid="trim-unmark-last-btn"
          onClick={() => {
            triggerHaptic("tap");
            onUnmarkLast();
          }}
          className="flex items-center gap-1 rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold opacity-85 hover:opacity-100 cursor-pointer shrink-0"
          title="Desmarcar o último trecho selecionado"
        >
          <RotateCcw className="size-3" />
          <span>Desmarcar</span>
        </button>
      )}

      {/* Limpar fila */}
      {!instantMode && markedCount > 0 && (
        <button
          type="button"
          data-testid="trim-clear-marks-btn"
          onClick={() => {
            triggerHaptic("tap");
            onClearMarks();
          }}
          className="flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-0.5 text-[10px] font-bold cursor-pointer shrink-0"
          title="Limpar todos os trechos marcados"
        >
          <Trash2 className="size-3" />
          <span>Limpar</span>
        </button>
      )}

      {/* Toggle Real / Projetado */}
      <button
        type="button"
        data-testid="trim-boundary-mode-btn"
        onClick={() => {
          triggerHaptic("selection");
          onToggleMode(mode === "real" ? "projected" : "real");
        }}
        className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold opacity-85 hover:opacity-100 cursor-pointer shrink-0"
        title="Alternar entre interseções físicas reais e encontros projetados"
      >
        {mode === "real" ? "Real" : "Projetado"}
      </button>

      {/* Toggle discreto ⚡ Instantâneo (DESLIGADO por padrão) */}
      <button
        type="button"
        data-testid="trim-instant-toggle-btn"
        onClick={() => {
          triggerHaptic("selection");
          onToggleInstantMode();
        }}
        style={
          instantMode
            ? {
                borderColor: "var(--chamfer-accent, #E11D48)",
                color: "var(--chamfer-accent, #E11D48)",
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer shrink-0 transition-colors",
          instantMode ? "bg-current/10" : "border-current/20 opacity-75 hover:opacity-100",
        )}
        title="Quando desligado (padrão), exige clicar em Confirmar Corte antes de apagar"
      >
        <Zap className="size-3" />
        <span>Instantâneo</span>
      </button>

      {/* Sair */}
      <button
        type="button"
        data-testid="trim-exit-btn"
        onClick={() => {
          triggerHaptic("tap");
          onExit();
        }}
        className="flex size-5 items-center justify-center rounded-full hover:bg-red-500/20 opacity-80 hover:opacity-100 cursor-pointer shrink-0"
        title="Sair do Aparar (Esc)"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
