/**
 * CALDRA CHAMFER — DIÁLOGO E PAINEL DA FERRAMENTA CENTRALIZAR FORMAS (CAD 2D)
 *
 * Interface compacta e precisa para centralização e alinhamento geométrico:
 *  - Eixos: Horizontal ↔, Vertical ↕, Ambos (X+Y) ⊕;
 *  - Método: Centro Geométrico Real (Centroide) vs Bounding Box;
 *  - Modo de Distribuição: Em Bloco (preserva posições relativas) vs Individual;
 *  - Referência: Centro do Conjunto vs Origem (0, 0) vs Peça Mestre.
 */

import React from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Boxes,
  Compass,
  Check,
  X,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { CenterAxis, CenterMethod, CenterGrouping, CenterOptions } from "@/lib/lab2d/cadCenterShapes";
import type { Entity } from "@/lib/lab2d/core";

interface ChamferCenterDialogProps {
  open: boolean;
  selectedEntities: Entity[];
  allEntities: Entity[];
  options: CenterOptions;
  onOptionsChange: (opts: CenterOptions) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isDark?: boolean;
}

export function ChamferCenterDialog({
  open,
  selectedEntities,
  options,
  onOptionsChange,
  onConfirm,
  onCancel,
  isDark = true,
}: ChamferCenterDialogProps) {
  if (!open || selectedEntities.length < 2) return null;

  const count = selectedEntities.length;

  const setAxis = (axis: CenterAxis) => {
    triggerHaptic("selection");
    onOptionsChange({ ...options, axis });
  };

  const setMethod = (method: CenterMethod) => {
    triggerHaptic("selection");
    onOptionsChange({ ...options, method });
  };

  const setGrouping = (grouping: CenterGrouping) => {
    triggerHaptic("selection");
    onOptionsChange({ ...options, grouping });
  };

  return (
    <div
      role="dialog"
      aria-labelledby="chamfer-center-title"
      className={cn(
        "pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col rounded-2xl border shadow-2xl backdrop-blur-xl transition-all select-none",
        "w-[340px] sm:w-[380px] max-w-[calc(100vw-20px)]",
        isDark
          ? "border-red-900/60 bg-slate-950/95 text-slate-100 shadow-black/80"
          : "border-slate-300 bg-white/95 text-slate-800 shadow-slate-400/50",
      )}
    >
      {/* CABEÇALHO COMPACTO */}
      <div
        className={cn(
          "flex items-center justify-between border-b px-3.5 py-2",
          isDark ? "border-slate-800/80 bg-slate-900/70" : "border-slate-200 bg-slate-100/80",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-red-600/20 text-red-500">
            <AlignCenter className="size-3.5 stroke-[2.5]" />
          </div>
          <div>
            <h2 id="chamfer-center-title" className="text-[11px] font-bold uppercase tracking-wider text-red-500 leading-tight">
              Centralizar Formas
            </h2>
            <p className="text-[9px] text-muted-foreground leading-tight">
              {count} formas selecionadas para alinhamento
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic("tap");
            onCancel();
          }}
          className={cn(
            "flex size-6 items-center justify-center rounded-lg transition-colors cursor-pointer",
            isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-600 hover:bg-slate-200",
          )}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* CORPO DE OPÇÕES */}
      <div className="p-3 space-y-2.5 text-xs">
        {/* 1. SELETOR DE EIXO DE ALINHAMENTO */}
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Eixo de Centralização
          </span>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setAxis("both")}
              className={cn(
                "flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border font-mono text-[10px] font-semibold transition-all cursor-pointer",
                options.axis === "both"
                  ? "border-red-500/60 bg-red-600/20 text-red-400 font-bold"
                  : isDark
                    ? "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              <AlignCenter className="size-3 text-red-400" />
              Ambos (X+Y)
            </button>
            <button
              type="button"
              onClick={() => setAxis("horizontal")}
              className={cn(
                "flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border font-mono text-[10px] font-semibold transition-all cursor-pointer",
                options.axis === "horizontal"
                  ? "border-red-500/60 bg-red-600/20 text-red-400 font-bold"
                  : isDark
                    ? "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              <AlignHorizontalJustifyCenter className="size-3 text-red-400" />
              Horizontal ↔
            </button>
            <button
              type="button"
              onClick={() => setAxis("vertical")}
              className={cn(
                "flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border font-mono text-[10px] font-semibold transition-all cursor-pointer",
                options.axis === "vertical"
                  ? "border-red-500/60 bg-red-600/20 text-red-400 font-bold"
                  : isDark
                    ? "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              <AlignVerticalJustifyCenter className="size-3 text-red-400" />
              Vertical ↕
            </button>
          </div>
        </div>

        {/* 2. REFERÊNCIA GEOMÉTRICA (CENTROIDE VS BOUNDING BOX) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Cálculo do Centro
            </span>
            <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
              <button
                type="button"
                onClick={() => setMethod("centroid")}
                className={cn(
                  "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                  options.method === "centroid"
                    ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                    : isDark
                      ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                      : "border-slate-200 bg-slate-100 text-slate-600",
                )}
                title="Centro geométrico real / Centroide"
              >
                Centroide
              </button>
              <button
                type="button"
                onClick={() => setMethod("bbox")}
                className={cn(
                  "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                  options.method === "bbox"
                    ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                    : isDark
                      ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                      : "border-slate-200 bg-slate-100 text-slate-600",
                )}
                title="Centro dos limites extremos (Bounding Box)"
              >
                Limites (Box)
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Distribuição
            </span>
            <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
              <button
                type="button"
                onClick={() => setGrouping("block")}
                className={cn(
                  "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                  options.grouping === "block"
                    ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                    : isDark
                      ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                      : "border-slate-200 bg-slate-100 text-slate-600",
                )}
                title="Move o conjunto mantendo as distâncias relativas entre peças"
              >
                Em Bloco
              </button>
              <button
                type="button"
                onClick={() => setGrouping("individual")}
                className={cn(
                  "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                  options.grouping === "individual"
                    ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                    : isDark
                      ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                      : "border-slate-200 bg-slate-100 text-slate-600",
                )}
                title="Alinha cada forma individualmente ao mesmo centro"
              >
                Individual
              </button>
            </div>
          </div>
        </div>

        {/* 3. ALVO / REFERÊNCIA DO ALINHAMENTO */}
        <div className="space-y-1">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
            Referência de Destino
          </span>
          <div className="grid grid-cols-3 gap-1 font-mono text-[9px]">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onOptionsChange({ ...options, referenceEntityId: null, targetPoint: null });
              }}
              className={cn(
                "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                !options.referenceEntityId && !options.targetPoint
                  ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                  : isDark
                    ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                    : "border-slate-200 bg-slate-100 text-slate-600",
              )}
              title="Centraliza em relação ao centro comum do conjunto"
            >
              Conjunto
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onOptionsChange({ ...options, referenceEntityId: null, targetPoint: { x: 0, y: 0 } });
              }}
              className={cn(
                "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                options.targetPoint && options.targetPoint.x === 0 && options.targetPoint.y === 0
                  ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                  : isDark
                    ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                    : "border-slate-200 bg-slate-100 text-slate-600",
              )}
              title="Centraliza na Origem do CAD (0, 0)"
            >
              Origem (0,0)
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                const firstId = selectedEntities[0]?.id ?? null;
                onOptionsChange({ ...options, referenceEntityId: firstId, targetPoint: null });
              }}
              className={cn(
                "py-1 px-1 rounded-md border text-center transition-colors cursor-pointer",
                options.referenceEntityId
                  ? "border-red-500 bg-red-500/20 text-red-300 font-bold"
                  : isDark
                    ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                    : "border-slate-200 bg-slate-100 text-slate-600",
              )}
              title="Centraliza a seleção em relação à primeira entidade de referência"
            >
              Peça Mestre
            </button>
          </div>
        </div>
      </div>

      {/* RODAPÉ COM CONFIRMAR E CANCELAR */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-t",
          isDark ? "border-slate-800/80 bg-slate-950" : "border-slate-200 bg-slate-50",
        )}
      >
        <button
          type="button"
          onClick={() => {
            triggerHaptic("tap");
            onCancel();
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer",
            isDark
              ? "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
              : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
          )}
        >
          <X className="size-3.5" />
          Cancelar
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic("action");
            onConfirm();
          }}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-98 text-white text-xs font-bold shadow-md shadow-red-600/30 transition-all cursor-pointer"
        >
          <Check className="size-4 stroke-[3]" />
          Confirmar
        </button>
      </div>
    </div>
  );
}
