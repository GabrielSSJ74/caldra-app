/**
 * CALDRA CHAMFER — HUD FLUTUANTE PARA FILETE UNIVERSAL E CHANFRO (CAD 2D)
 *
 * - Suporta concordância universal Linha×Linha, Linha×Arco/Círculo e Arco×Arco;
 * - Chip `[ ⇄ Alternar Solução ]` quando há múltiplos quadrantes/soluções válidas;
 * - Botão `[ ✓ Aplicar ]` para confirmar a prévia ativa ou aplicar em múltiplos cantos;
 * - 100% sincronizado com `--chamfer-*` (Tema Claro/Escuro/AMOLED + Cor de Destaque).
 */

import React from "react";
import { Sparkles, Minus, Check, X, CornerDownRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface ChamferFilletChamferHUDProps {
  tool: "fillet" | "chamfer";
  value: number;
  onChangeValue: (v: number) => void;
  selectionCornersCount: number;
  onApplySelectionCorners: () => void;
  onClose: () => void;
  isDark?: boolean;
  /** Quantidade de soluções alternativas válidas na prévia atual do Fillet Universal */
  solutionsCount?: number;
  activeSolutionIndex?: number;
  activeSolutionLabel?: string | null;
  firstPickedLabel?: string | null;
  onCycleSolution?: () => void;
  onConfirmActiveFillet?: () => void;
  errorHint?: string | null;
}

export function ChamferFilletChamferHUD({
  tool,
  value,
  onChangeValue,
  selectionCornersCount,
  onApplySelectionCorners,
  onClose,
  solutionsCount = 0,
  activeSolutionIndex = 0,
  activeSolutionLabel = null,
  firstPickedLabel = null,
  onCycleSolution,
  onConfirmActiveFillet,
  errorHint = null,
}: ChamferFilletChamferHUDProps) {
  const isFillet = tool === "fillet";
  const PRESETS = [2, 5, 8, 10, 12, 15, 20, 30];

  return (
    <div
      role="toolbar"
      data-testid="chamfer-fillet-chamfer-hud"
      aria-label={isFillet ? "Controle do Filete Universal" : "Controle do Chanfro"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        backgroundColor: "var(--chamfer-popover-bg, rgba(10, 15, 26, 0.92))",
        borderColor: "var(--chamfer-border-strong, rgba(255, 255, 255, 0.16))",
        color: "var(--chamfer-text-primary, #f1f5f9)",
      }}
      className="pointer-events-auto fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-1.5 shadow-xl backdrop-blur-xl transition-all select-none max-w-[calc(100vw-24px)] text-xs"
    >
      {/* IDENTIFICADOR DA FERRAMENTA */}
      <div
        style={{ color: "var(--chamfer-accent, #E11D48)" }}
        className="flex items-center gap-1.5 pr-2 border-r border-current/20 font-semibold"
      >
        {isFillet ? <Sparkles className="size-3.5" /> : <Minus className="size-3.5 stroke-[3]" />}
        <span className="font-mono text-[11px] uppercase tracking-wider font-bold">
          {isFillet ? "Filete 2D" : "Chanfro"}
        </span>
      </div>

      {/* INPUT NUMÉRICO DIRETO */}
      <div className="flex items-center gap-1">
        <span
          style={{ color: "var(--chamfer-text-secondary, #94a3b8)" }}
          className="font-mono text-[10px] uppercase"
        >
          {isFillet ? "Raio R:" : "Dist:"}
        </span>
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            data-testid="fillet-radius-input"
            min={0.5}
            max={500}
            step={0.5}
            value={Number.isNaN(value) ? "" : value}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val) && val > 0) {
                onChangeValue(val);
              }
            }}
            style={{
              backgroundColor: "var(--chamfer-surface-elevated, rgba(15, 23, 42, 0.9))",
              borderColor: "var(--chamfer-border-strong, rgba(148, 163, 184, 0.35))",
              color: "var(--chamfer-accent, #E11D48)",
            }}
            className="w-14 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold outline-none"
          />
          <span
            style={{ color: "var(--chamfer-text-secondary, #94a3b8)" }}
            className="font-mono text-[10px]"
          >
            mm
          </span>
        </div>
      </div>

      {/* PRESETS RÁPIDOS */}
      <div className="hidden sm:flex items-center gap-1 pl-1">
        {PRESETS.map((p) => {
          const isActive = Math.abs(value - p) < 0.01;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onChangeValue(p);
              }}
              style={
                isActive
                  ? {
                      backgroundColor: "var(--chamfer-accent, #E11D48)",
                      borderColor: "var(--chamfer-accent, #E11D48)",
                      color: "#FFFFFF",
                    }
                  : undefined
              }
              className={cn(
                "px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-semibold transition-colors cursor-pointer",
                !isActive && "border-current/15 opacity-75 hover:opacity-100",
              )}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* ALTERNAR SOLUÇÃO QUANDO HÁ MÚLTIPLOS QUADRANTES / INTERNA vs EXTERNA */}
      {isFillet && solutionsCount > 1 && onCycleSolution && (
        <button
          type="button"
          data-testid="fillet-cycle-solution-btn"
          onClick={() => {
            triggerHaptic("selection");
            onCycleSolution();
          }}
          style={{
            borderColor: "var(--chamfer-accent, #E11D48)",
            color: "var(--chamfer-accent, #E11D48)",
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-[10px] font-bold hover:opacity-90 cursor-pointer"
          title="Alternar quadrante ou concordância externa/interna"
        >
          <RefreshCw className="size-3" />
          <span>
            ⇄ Alternar Solução ({activeSolutionIndex + 1}/{solutionsCount}
            {activeSolutionLabel ? ` • ${activeSolutionLabel}` : ""})
          </span>
        </button>
      )}

      {/* CONFIRMAR PRÉVIA ATIVA DO FILLET */}
      {isFillet && solutionsCount >= 1 && onConfirmActiveFillet && (
        <button
          type="button"
          data-testid="fillet-confirm-active-btn"
          onClick={() => {
            triggerHaptic("success");
            onConfirmActiveFillet();
          }}
          style={{
            backgroundColor: "var(--chamfer-accent, #E11D48)",
            color: "#FFFFFF",
          }}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg font-mono text-[10.5px] font-extrabold shadow-sm cursor-pointer active:scale-95"
        >
          <Check className="size-3 stroke-[2.6]" />
          <span>Aplicar R{value}</span>
        </button>
      )}

      {/* APLICAR NA SELEÇÃO SE HOUVER CANTOS IDENTIFICADOS */}
      {selectionCornersCount > 0 && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic("action");
            onApplySelectionCorners();
          }}
          style={{
            backgroundColor: "var(--chamfer-accent, #E11D48)",
            color: "#FFFFFF",
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-bold shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <CornerDownRight className="size-3" />
          <span>Aplicar nos {selectionCornersCount} cantos</span>
        </button>
      )}

      {/* STATUS / ERRO GEOMÉTRICO */}
      {errorHint ? (
        <span className="font-mono text-[10px] font-bold text-amber-400 pl-1 border-l border-current/20">
          {errorHint}
        </span>
      ) : firstPickedLabel ? (
        <span
          style={{ color: "var(--chamfer-accent, #E11D48)" }}
          className="font-mono text-[10px] font-bold pl-1 border-l border-current/20"
        >
          A: {firstPickedLabel} → toque em B (Linha / Arco / Círculo)
        </span>
      ) : (
        <span
          style={{ color: "var(--chamfer-text-secondary, #94a3b8)" }}
          className="hidden md:inline font-mono text-[9.5px] pl-1 border-l border-current/20"
        >
          {isFillet
            ? "Toque num canto ou em 2 entidades (Linha / Arco / Círculo)"
            : "Toque no canto diretamente ou selecione 2 linhas"}
        </span>
      )}

      {/* FECHAR / CONCLUIR */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic("tap");
          onClose();
        }}
        title="Concluir e voltar à seleção"
        className="flex size-6 items-center justify-center rounded-lg hover:bg-current/10 transition-colors cursor-pointer ml-1"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
