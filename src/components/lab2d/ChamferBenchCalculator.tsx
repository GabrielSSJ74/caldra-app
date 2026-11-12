/**
 * CALDRA CHAMFER CAD 2D — MINI-CALCULADORA CIENTÍFICA & METALÚRGICA DE BANCADA (`CALC BANCADA`)
 *
 * Arquitetura:
 *  - Modo A (Padrão): Fixa à Direita (`right: 8px`, abaixo da barra superior), sobreposta sem espremer o `<canvas>`.
 *  - Modo B: Flutuante Livre (`[ ✥ Flutuar ]`), arrastável via `PointerEvents` + `setPointerCapture` com clamp de segurança.
 *  - Isolamento 100% de eventos de ponteiro/scroll (zero vazamento para o `<canvas>`).
 *  - Ponte Bidirecional CAD: `[ ↳ Usar no CAD ]`, `[ ⌖ Pegar do CAD ]` (chips reais da seleção) e `[ 📝 → Nota ]`.
 *  - Adaptação automática para Paisagem Baixa (`viewportHeight < 440px`) via abas `[ 123 ] | [ f(x) ]`.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Calculator,
  GripHorizontal,
  History,
  Minimize2,
  Maximize2,
  PanelRightClose,
  Move,
  X,
  Delete,
  CornerDownLeft,
  Crosshair,
  FileText,
} from "lucide-react";
import {
  BENCH_MAX_HISTORY,
  BenchCalculatorError,
  clampFloatingBenchPosition,
  convertBenchInchMm,
  dispatchValueToActiveCadField,
  evaluateBenchExpression,
  extractCadEntityMeasurements,
  formatBenchValue,
  formatMmToCommercialInchDisplay,
  type AngleMode,
  type BenchDecimalMode,
  type BenchHistoryEntry,
  type BenchPersistedState,
} from "@/lib/lab2d/chamferBenchCalculator";
import type { Entity } from "@/lib/lab2d/core";
import { toast } from "@/lib/lab2d/chamferNotify";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export interface ChamferBenchCalculatorProps {
  state: BenchPersistedState;
  onChangeState: React.Dispatch<React.SetStateAction<BenchPersistedState>>;
  selectedEntities: Entity[];
  isDark?: boolean;
  topOffsetPx?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  /** Callback complementar caso nenhum input/numpad CAD tenha consumido diretamente o evento global */
  onFallbackUseInCad?: (value: number, formattedPtBr: string) => boolean;
  /** Envia resultado ou memória de cálculo (`expr = resultado mm`) para Nota Técnica */
  onSendToTechnicalNote?: (payload: {
    expression: string;
    result: number;
    formattedResult: string;
    memoryLine: string;
  }) => void;
}

export const ChamferBenchCalculator: React.FC<ChamferBenchCalculatorProps> = React.memo(
  function ChamferBenchCalculator({
    state,
    onChangeState,
    selectedEntities,
    isDark = true,
    topOffsetPx = 54,
    viewportWidth = 1280,
    viewportHeight = 800,
    onFallbackUseInCad,
    onSendToTechnicalNote,
  }) {
    const [shiftOn, setShiftOn] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [pickCadOpen, setPickCadOpen] = useState(false);
    const [compactTab, setCompactTab] = useState<"123" | "fx">("123");
    const [lastConvDir, setLastConvDir] = useState<"mm_to_in" | "in_to_mm">("mm_to_in");

    const dragRef = useRef<{
      active: boolean;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
    } | null>(null);

    const isLowLandscape = viewportHeight < 440;
    const panelWidth = isLowLandscape ? 252 : 262;

    // Garante que a janela flutuante permaneça alcançável após rotação de tela ou resize
    useEffect(() => {
      if (!state.open || state.dockMode !== "floating") return;
      const clamped = clampFloatingBenchPosition(
        state.floatingPos,
        viewportWidth,
        viewportHeight,
        panelWidth,
      );
      if (clamped.x !== state.floatingPos.x || clamped.y !== state.floatingPos.y) {
        onChangeState((prev) => ({ ...prev, floatingPos: clamped }));
      }
    }, [
      state.open,
      state.dockMode,
      state.floatingPos,
      viewportWidth,
      viewportHeight,
      panelWidth,
      onChangeState,
    ]);

    // Avaliação ao vivo segura (zero eval)
    const liveEval = useMemo(() => {
      const expr = state.expression.trim();
      if (!expr) {
        return {
          status: "idle" as const,
          numericValue: state.ans,
          displayResult: formatBenchValue(state.ans, state.decimalMode),
          inchDisplay: formatMmToCommercialInchDisplay(state.ans),
          errorKind: null,
        };
      }
      try {
        const val = evaluateBenchExpression(expr, state.angleMode, state.ans);
        return {
          status: "ok" as const,
          numericValue: val,
          displayResult: formatBenchValue(val, state.decimalMode),
          inchDisplay: formatMmToCommercialInchDisplay(val),
          errorKind: null,
        };
      } catch (err) {
        const msg =
          err instanceof BenchCalculatorError && err.kind === "undefined"
            ? "Indefinido"
            : "Erro";
        return {
          status: "error" as const,
          numericValue: NaN,
          displayResult: msg,
          inchDisplay: "—",
          errorKind: err instanceof BenchCalculatorError ? err.kind : "syntax",
        };
      }
    }, [state.expression, state.angleMode, state.ans, state.decimalMode]);

    // Chips reais extraídos da seleção atual no Canvas 2D
    const cadChips = useMemo(() => {
      if (!selectedEntities.length) return [];
      return extractCadEntityMeasurements(selectedEntities[0]!);
    }, [selectedEntities]);

    const appendToken = useCallback(
      (tok: string) => {
        triggerHaptic("selection");
        onChangeState((prev) => ({
          ...prev,
          expression: prev.expression + tok,
        }));
        if (shiftOn) setShiftOn(false);
      },
      [onChangeState, shiftOn],
    );

    const handleClearAll = useCallback(() => {
      triggerHaptic("selection");
      setShiftOn(false);
      onChangeState((prev) => ({
        ...prev,
        expression: "",
      }));
    }, [onChangeState]);

    const handleBackspace = useCallback(() => {
      triggerHaptic("selection");
      onChangeState((prev) => {
        const expr = prev.expression;
        if (!expr) return prev;
        // Remove função inteira se terminar com "sin(", "hypot(", "asin(", etc.
        const fnMatch = /(?:asin|acos|atan|sin⁻¹|cos⁻¹|tan⁻¹|sin|cos|tan|hypot|cbrt|sqrt|Ans)\($/i.exec(
          expr,
        );
        if (fnMatch) {
          return { ...prev, expression: expr.slice(0, expr.length - fnMatch[0].length) };
        }
        return { ...prev, expression: expr.slice(0, -1) };
      });
    }, [onChangeState]);

    const handleEvaluateCommit = useCallback(() => {
      triggerHaptic("selection");
      const expr = state.expression.trim();
      if (!expr) return;
      try {
        const val = evaluateBenchExpression(expr, state.angleMode, state.ans);
        const formatted = formatBenchValue(val, state.decimalMode);
        const inchFrac = formatMmToCommercialInchDisplay(val);
        const entry: BenchHistoryEntry = {
          id: `bh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          expression: expr,
          result: val,
          formattedResult: formatted,
          inchFraction: inchFrac,
          angleMode: state.angleMode,
          timestamp: Date.now(),
        };
        onChangeState((prev) => ({
          ...prev,
          ans: val,
          expression: formatBenchValue(val, "auto"),
          history: [entry, ...prev.history.filter((h) => h.expression !== expr)].slice(
            0,
            BENCH_MAX_HISTORY,
          ),
        }));
      } catch (err) {
        const msg =
          err instanceof BenchCalculatorError && err.kind === "undefined"
            ? "Resultado indefinido (divisão por zero ou assíntota)."
            : "Expressão matemática inválida.";
        toast.error(msg);
      }
    }, [state.expression, state.angleMode, state.ans, state.decimalMode, onChangeState]);

    const handleInchMmConvert = useCallback(() => {
      triggerHaptic("selection");
      const sourceVal = Number.isFinite(liveEval.numericValue) ? liveEval.numericValue : state.ans;
      const direction: "mm_to_in" | "in_to_mm" = shiftOn
        ? "in_to_mm"
        : lastConvDir === "mm_to_in"
          ? "mm_to_in"
          : "in_to_mm";
      const converted = convertBenchInchMm(sourceVal, direction);
      const formatted = formatBenchValue(converted, "auto");
      const labelExpr =
        direction === "mm_to_in"
          ? `${formatBenchValue(sourceVal, "auto")} ÷ 25,4`
          : `${formatBenchValue(sourceVal, "auto")} × 25,4`;
      const entry: BenchHistoryEntry = {
        id: `bh_conv_${Date.now()}`,
        expression: labelExpr,
        result: converted,
        formattedResult: formatted,
        inchFraction: formatMmToCommercialInchDisplay(direction === "in_to_mm" ? converted : sourceVal),
        angleMode: state.angleMode,
        timestamp: Date.now(),
      };
      onChangeState((prev) => ({
        ...prev,
        ans: converted,
        expression: formatted,
        history: [entry, ...prev.history].slice(0, BENCH_MAX_HISTORY),
      }));
      setLastConvDir(direction === "mm_to_in" ? "in_to_mm" : "mm_to_in");
      if (shiftOn) setShiftOn(false);
    }, [liveEval.numericValue, state.ans, state.angleMode, shiftOn, lastConvDir, onChangeState]);

    const handleUseInCad = useCallback(
      (e: React.PointerEvent | React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const val = Number.isFinite(liveEval.numericValue) ? liveEval.numericValue : state.ans;
        if (!Number.isFinite(val)) {
          toast.error("Calcule um valor numérico válido antes de enviar ao CAD.");
          return;
        }
        triggerHaptic("success");
        const formatted = formatBenchValue(val, "4");
        const injected =
          dispatchValueToActiveCadField(val) ||
          Boolean(onFallbackUseInCad?.(val, formatted));

        if (injected) {
          toast.success(`Medida ${formatted} aplicada no campo CAD ativo.`);
        } else {
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(formatted).catch(() => {});
          }
          toast.info(`Valor ${formatted} mm copiado e pronto para colar/usar.`);
        }
      },
      [liveEval.numericValue, state.ans, onFallbackUseInCad],
    );

    const handleSendToNote = useCallback(() => {
      const val = Number.isFinite(liveEval.numericValue) ? liveEval.numericValue : state.ans;
      if (!Number.isFinite(val)) {
        toast.error("Calcule um valor válido antes de enviar para Nota Técnica.");
        return;
      }
      triggerHaptic("selection");
      const formatted = formatBenchValue(val, "2");
      const expr = state.expression.trim();
      const hasOperator = /[+\-×÷*/^;]|sin|cos|tan|hypot|√|π/i.test(expr);
      const latestHist = state.history[0];
      const matchedHistExpr =
        !hasOperator &&
        latestHist &&
        Math.abs(latestHist.result - val) < 1e-6 &&
        /[+\-×÷*/^;]|sin|cos|tan|hypot|√|π/i.test(latestHist.expression)
          ? latestHist.expression
          : null;
      const effectiveExpr = hasOperator && expr ? expr : matchedHistExpr;
      const memoryLine = effectiveExpr ? `${effectiveExpr} = ${formatted} mm` : `${formatted} mm`;
      onSendToTechnicalNote?.({
        expression: effectiveExpr || expr || formatted,
        result: val,
        formattedResult: formatted,
        memoryLine,
      });
    }, [liveEval.numericValue, state.ans, state.expression, state.history, onSendToTechnicalNote]);

    // Arraste suave do cabeçalho no modo Flutuante
    const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (state.dockMode !== "floating") return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: state.floatingPos.x,
        originY: state.floatingPos.y,
      };
    };

    const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const d = dragRef.current;
      if (!d || !d.active || d.pointerId !== e.pointerId) return;
      const nextRaw = {
        x: d.originX + (e.clientX - d.startClientX),
        y: d.originY + (e.clientY - d.startClientY),
      };
      const clamped = clampFloatingBenchPosition(
        nextRaw,
        viewportWidth,
        viewportHeight,
        panelWidth,
      );
      onChangeState((prev) => ({
        ...prev,
        floatingPos: clamped,
      }));
    };

    const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const d = dragRef.current;
      if (d && d.pointerId === e.pointerId) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        dragRef.current = null;
      }
    };

    if (!state.open) return null;

    const isFloating = state.dockMode === "floating";

    const stopAllToCanvas = (e: React.SyntheticEvent) => {
      e.stopPropagation();
    };

    const cycleDecimalMode = () => {
      const order: BenchDecimalMode[] = ["auto", "2", "4"];
      const next = order[(order.indexOf(state.decimalMode) + 1) % order.length]!;
      onChangeState((prev) => ({ ...prev, decimalMode: next }));
    };

    const decimalBadgeLabel =
      state.decimalMode === "2" ? "0,00" : state.decimalMode === "4" ? "0,0000" : "AUTO";

    const surfaceStyle: React.CSSProperties = isFloating
      ? {
          position: "fixed",
          left: state.floatingPos.x,
          top: state.floatingPos.y,
          width: panelWidth,
          maxHeight: `calc(100dvh - ${Math.max(56, state.floatingPos.y + 10)}px)`,
        }
      : {
          position: "fixed",
          right: 8,
          top: topOffsetPx,
          width: panelWidth,
          maxHeight: `calc(100dvh - ${topOffsetPx + 52}px)`,
        };

    const keyBase = isDark
      ? "border-slate-700/80 bg-slate-900/90 text-slate-100 hover:bg-slate-800 active:scale-95"
      : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100 active:scale-95";
    const keyFn = isDark
      ? "border-slate-700/70 bg-slate-800/80 text-sky-300 hover:bg-slate-800 active:scale-95"
      : "border-slate-200 bg-sky-50/70 text-sky-800 hover:bg-sky-100/80 active:scale-95";
    const keyOp = isDark
      ? "border-sky-500/35 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 active:scale-95"
      : "border-sky-300 bg-sky-100/80 text-sky-900 hover:bg-sky-200/80 active:scale-95";

    const keyH = isLowLandscape ? "h-[26px]" : "h-[30px]";

    const node = (
      <aside
        data-testid="chamfer-bench-calculator"
        data-dock-mode={state.dockMode}
        aria-label="Mini-Calculadora Científica e Metalúrgica de Bancada"
        style={surfaceStyle}
        onPointerDown={stopAllToCanvas}
        onPointerMove={stopAllToCanvas}
        onPointerUp={stopAllToCanvas}
        onWheel={stopAllToCanvas}
        onClick={stopAllToCanvas}
        onDoubleClick={stopAllToCanvas}
        className={cn(
          "z-[56] flex flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl select-none transition-[width] duration-150",
          isDark
            ? "border-slate-700/85 bg-[#0B111E]/95 text-slate-100 shadow-black/65"
            : "border-slate-300/90 bg-white/95 text-slate-900 shadow-slate-900/15",
        )}
      >
        {/* 1. CABEÇALHO ARRASTÁVEL / ANCORADO */}
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          className={cn(
            "flex shrink-0 items-center justify-between gap-1 border-b px-2.5 py-1.5",
            isFloating ? "cursor-grab active:cursor-grabbing touch-none" : "",
            isDark ? "border-slate-800 bg-slate-900/75" : "border-slate-200 bg-slate-100/80",
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {isFloating ? (
              <GripHorizontal className="size-3.5 shrink-0 text-amber-400" />
            ) : (
              <Calculator className="size-3.5 shrink-0 text-sky-400" />
            )}
            <span className="truncate font-mono text-[10px] font-extrabold tracking-wider uppercase">
              CALC BANCADA
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isFloating ? (
              <button
                type="button"
                data-testid="bench-calc-dock-right-btn"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangeState((prev) => ({
                    ...prev,
                    dockMode: "docked_right",
                    minimized: false,
                  }));
                }}
                title="Restaurar para a Posição Padrão Fixa à Direita"
                aria-label="Restaurar para a Direita"
                className={cn(
                  "flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] font-bold cursor-pointer",
                  isDark
                    ? "border-amber-500/45 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                    : "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
                )}
              >
                <PanelRightClose className="size-2.5" />
                <span>Direita</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="bench-calc-float-btn"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangeState((prev) => {
                    const startPos = clampFloatingBenchPosition(
                      prev.floatingPos.x === 84 && prev.floatingPos.y === 76
                        ? { x: Math.max(24, viewportWidth - panelWidth - 48), y: topOffsetPx + 14 }
                        : prev.floatingPos,
                      viewportWidth,
                      viewportHeight,
                      panelWidth,
                    );
                    return {
                      ...prev,
                      dockMode: "floating",
                      minimized: false,
                      floatingPos: startPos,
                    };
                  });
                }}
                title="Destacar como janela flutuante livre"
                aria-label="Flutuar Calculadora"
                className={cn(
                  "flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] font-bold cursor-pointer",
                  isDark
                    ? "border-slate-700 bg-slate-800/90 text-slate-300 hover:text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                <Move className="size-2.5" />
                <span>Flutuar</span>
              </button>
            )}

            <button
              type="button"
              data-testid="bench-calc-minimize-btn"
              onClick={() => {
                triggerHaptic("selection");
                onChangeState((prev) => ({ ...prev, minimized: !prev.minimized }));
              }}
              title={state.minimized ? "Expandir calculadora" : "Minimizar calculadora"}
              aria-label={state.minimized ? "Expandir calculadora" : "Minimizar calculadora"}
              className={cn(
                "flex size-5 items-center justify-center rounded-md border cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white"
                  : "border-slate-300 bg-white text-slate-700",
              )}
            >
              {state.minimized ? <Maximize2 className="size-2.5" /> : <Minimize2 className="size-2.5" />}
            </button>

            <button
              type="button"
              data-testid="bench-calc-close-btn"
              onClick={() => {
                triggerHaptic("selection");
                onChangeState((prev) => ({ ...prev, open: false }));
              }}
              title="Fechar calculadora"
              aria-label="Fechar calculadora"
              className={cn(
                "flex size-5 items-center justify-center rounded-md border cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-800/80 text-slate-400 hover:text-rose-400"
                  : "border-slate-300 bg-white text-slate-600 hover:text-rose-600",
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>

        {/* MODO RECOLHIDO (MINIMIZADO): EXIBE RESULTADO AO VIVO E PONTE DIRETA */}
        {state.minimized ? (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono">
            <span className="truncate text-[10px] text-slate-400">
              {state.expression || "Ans"}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold tabular-nums text-sky-400">
                {liveEval.displayResult}
              </span>
              <button
                type="button"
                onPointerDown={handleUseInCad}
                className="rounded-md bg-sky-500 px-1.5 py-0.5 text-[8.5px] font-bold text-slate-950 cursor-pointer"
              >
                ↳ CAD
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 scrollbar-none">
            {/* 2. BARRA DE MODO ANGULAR (DEG | RAD | GRAD) + CASAS DECIMAIS + HISTÓRICO */}
            <div className="flex shrink-0 items-center justify-between gap-1">
              <div
                role="group"
                aria-label="Unidade angular"
                className={cn(
                  "grid grid-cols-3 rounded-lg border p-0.5 font-mono text-[8.5px] font-bold",
                  isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100",
                )}
              >
                {(["DEG", "RAD", "GRAD"] as AngleMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`bench-angle-${m.toLowerCase()}`}
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangeState((prev) => ({ ...prev, angleMode: m }));
                    }}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 transition-colors cursor-pointer",
                      state.angleMode === m
                        ? "bg-sky-500 text-slate-950 font-extrabold"
                        : isDark
                          ? "text-slate-400 hover:text-slate-200"
                          : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={cycleDecimalMode}
                  title="Alternar arredondamento de exibição (Auto / 0,00 / 0,0000)"
                  className={cn(
                    "rounded-lg border px-1.5 py-0.5 font-mono text-[8.5px] font-bold cursor-pointer",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-slate-300"
                      : "border-slate-200 bg-slate-100 text-slate-700",
                  )}
                >
                  {decimalBadgeLabel}
                </button>

                <button
                  type="button"
                  data-testid="bench-calc-history-btn"
                  onClick={() => setHistoryOpen((v) => !v)}
                  title="Histórico das últimas 30 operações"
                  aria-label="Histórico de cálculos"
                  className={cn(
                    "flex items-center gap-0.5 rounded-lg border px-1.5 py-0.5 font-mono text-[8.5px] font-bold cursor-pointer",
                    historyOpen
                      ? "border-sky-500/60 bg-sky-500/20 text-sky-300"
                      : isDark
                        ? "border-slate-700 bg-slate-900 text-slate-300"
                        : "border-slate-200 bg-slate-100 text-slate-700",
                  )}
                >
                  <History className="size-2.5" />
                  <span>{state.history.length}</span>
                </button>
              </div>
            </div>

            {/* 3. VISOR DUPLO DE BANCADA (EXPRESSÃO + POLEGADA FRACIONÁRIA 1/64" + RESULTADO) */}
            <div
              className={cn(
                "flex shrink-0 flex-col gap-0.5 rounded-xl border px-2.5 py-1.5 font-mono",
                isDark
                  ? "border-slate-800 bg-slate-950/90"
                  : "border-slate-200 bg-slate-50",
              )}
            >
              <input
                type="text"
                data-testid="bench-calc-expr-input"
                data-bench-ignore="true"
                aria-label="Expressão matemática"
                placeholder="Ex: hypot(300;400) ou 350*√2"
                value={state.expression}
                onChange={(e) =>
                  onChangeState((prev) => ({ ...prev, expression: e.target.value }))
                }
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEvaluateCommit();
                  }
                }}
                className={cn(
                  "w-full bg-transparent text-right text-[11px] outline-none",
                  isDark ? "text-slate-300 placeholder:text-slate-600" : "text-slate-700 placeholder:text-slate-400",
                )}
              />

              <div className="flex items-baseline justify-between gap-2 pt-0.5">
                <span
                  data-testid="bench-calc-inch-readout"
                  title="Equivalente comercial em polegadas fracionárias (precisão até 1/64&quot;)"
                  className={cn(
                    "truncate text-[9.5px] font-semibold tabular-nums",
                    isDark ? "text-amber-300/90" : "text-amber-700",
                  )}
                >
                  ≈ {liveEval.inchDisplay}
                </span>

                <span
                  data-testid="bench-calc-result-readout"
                  className={cn(
                    "truncate text-[16px] font-extrabold tracking-tight tabular-nums",
                    liveEval.status === "error"
                      ? "text-rose-400"
                      : isDark
                        ? "text-sky-300"
                        : "text-sky-700",
                  )}
                >
                  {liveEval.displayResult}
                </span>
              </div>
            </div>

            {/* PAINEL EXPANSÍVEL DE HISTÓRICO (ATÉ 30 OPERAÇÕES) */}
            {historyOpen && (
              <div
                data-testid="bench-calc-history-list"
                className={cn(
                  "max-h-32 shrink-0 overflow-y-auto rounded-xl border p-1.5 font-mono text-[10px]",
                  isDark ? "border-slate-800 bg-slate-900/95" : "border-slate-200 bg-white",
                )}
              >
                {state.history.length === 0 ? (
                  <p className="py-2 text-center text-[9.5px] text-slate-500">
                    Nenhum cálculo salvo ainda (pressione =).
                  </p>
                ) : (
                  <div className="space-y-1">
                    {state.history.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center justify-between gap-1 rounded-lg border px-2 py-1",
                          isDark
                            ? "border-slate-800/90 bg-slate-950/60 hover:border-sky-500/40"
                            : "border-slate-200/80 bg-slate-50 hover:border-sky-400",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onChangeState((prev) => ({ ...prev, expression: item.expression }));
                            setHistoryOpen(false);
                          }}
                          className="min-w-0 flex-1 truncate text-left text-slate-400 hover:text-sky-300 cursor-pointer"
                          title="Reutilizar expressão completa"
                        >
                          {item.expression}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            appendToken(item.formattedResult);
                            setHistoryOpen(false);
                          }}
                          className="shrink-0 font-bold text-sky-400 hover:underline cursor-pointer"
                          title="Inserir resultado na expressão"
                        >
                          = {item.formattedResult}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. PONTE BIDIRECIONAL CAD: [ ↳ Usar no CAD ] | [ ⌖ Pegar ] | [ 📝 → Nota ] */}
            <div className="flex shrink-0 flex-col gap-1">
              <div className="grid grid-cols-3 gap-1 font-mono text-[9px] font-bold">
                <button
                  type="button"
                  data-testid="bench-bridge-use-in-cad"
                  onPointerDown={handleUseInCad}
                  title="Injeta o valor calculado diretamente no campo/teclado numérico ativo do CAD sem perder o foco"
                  className="flex items-center justify-center gap-1 rounded-lg bg-sky-500 px-1.5 py-1.5 font-extrabold text-slate-950 shadow-xs hover:bg-sky-400 active:scale-95 cursor-pointer"
                >
                  <CornerDownLeft className="size-3 shrink-0" />
                  <span>Usar CAD</span>
                </button>

                <button
                  type="button"
                  data-testid="bench-bridge-pick-from-cad"
                  onClick={() => {
                    triggerHaptic("selection");
                    if (!cadChips.length) {
                      toast.info("Selecione uma linha, círculo, arco ou polilinha no 2D para puxar medidas.");
                      return;
                    }
                    setPickCadOpen((v) => !v);
                  }}
                  title="Extrair comprimento, largura, raio, diâmetro ou ângulo da entidade selecionada no CAD"
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 cursor-pointer",
                    cadChips.length > 0
                      ? isDark
                        ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                        : "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : isDark
                        ? "border-slate-700 bg-slate-900 text-slate-400"
                        : "border-slate-200 bg-slate-100 text-slate-500",
                  )}
                >
                  <Crosshair className="size-3 shrink-0" />
                  <span>Pegar{cadChips.length ? ` (${cadChips.length})` : ""}</span>
                </button>

                <button
                  type="button"
                  data-testid="bench-bridge-send-to-note"
                  onClick={handleSendToNote}
                  title="Inserir resultado ou memória de cálculo em uma Nota Técnica no projeto"
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 cursor-pointer",
                    isDark
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                      : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
                  )}
                >
                  <FileText className="size-3 shrink-0" />
                  <span>→ Nota</span>
                </button>
              </div>

              {/* CHIPS RÁPIDOS DE MEDIDAS REAIS DA ENTIDADE SELECIONADA */}
              {(pickCadOpen || cadChips.length > 0) && cadChips.length > 0 && (
                <div
                  data-testid="bench-cad-measurement-chips"
                  className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none"
                >
                  {cadChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => appendToken(chip.formattedInsert)}
                      title={`Inserir ${chip.label}: ${chip.formattedInsert} ${chip.unit}`}
                      className={cn(
                        "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] font-bold cursor-pointer",
                        isDark
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                      )}
                    >
                      {chip.shortTag}: {chip.formattedInsert}
                      {chip.unit}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* SELETOR COMPACTO [ 123 ] | [ f(x) ] APENAS EM PAISAGEM DE ALTURA REDUZIDA (< 440px) */}
            {isLowLandscape && (
              <div
                className={cn(
                  "grid shrink-0 grid-cols-2 rounded-lg border p-0.5 font-mono text-[9px] font-bold",
                  isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100",
                )}
              >
                <button
                  type="button"
                  onClick={() => setCompactTab("123")}
                  className={cn(
                    "rounded-md py-0.5 cursor-pointer",
                    compactTab === "123" ? "bg-sky-500 text-slate-950" : "text-slate-400",
                  )}
                >
                  123 Básico
                </button>
                <button
                  type="button"
                  onClick={() => setCompactTab("fx")}
                  className={cn(
                    "rounded-md py-0.5 cursor-pointer",
                    compactTab === "fx" ? "bg-sky-500 text-slate-950" : "text-slate-400",
                  )}
                >
                  f(x) Científico
                </button>
              </div>
            )}

            {/* 5. TECLADO CIENTÍFICO & METALÚRGICO COMPACTO (5 COLUNAS) */}
            {(!isLowLandscape || compactTab === "fx") && (
              <div className="grid shrink-0 grid-cols-5 gap-1 font-mono text-[10px] font-bold">
                {/* Linha 1: SHIFT | in↔mm | hypot | AC | ⌫ */}
                <button
                  type="button"
                  data-testid="bench-key-shift"
                  onClick={() => {
                    triggerHaptic("selection");
                    setShiftOn((v) => !v);
                  }}
                  className={cn(
                    keyH,
                    "rounded-lg border text-[9px] cursor-pointer",
                    shiftOn
                      ? "border-amber-400 bg-amber-400 text-slate-950 font-extrabold"
                      : keyFn,
                  )}
                >
                  ↑SHIFT
                </button>
                <button
                  type="button"
                  data-testid="bench-key-in-mm"
                  onClick={handleInchMmConvert}
                  title="Converter entre milímetros e polegadas (fator exato 25,4)"
                  className={cn(keyH, "rounded-lg border text-[8.5px] cursor-pointer", keyFn)}
                >
                  {shiftOn ? "in→mm" : "in↔mm"}
                </button>
                <button
                  type="button"
                  data-testid="bench-key-hypot"
                  onClick={() => appendToken("hypot(")}
                  title="Hipotenusa / Diagonal de Esquadro: hypot(a;b)"
                  className={cn(keyH, "rounded-lg border text-[9px] cursor-pointer", keyFn)}
                >
                  hypot
                </button>
                <button
                  type="button"
                  data-testid="bench-key-ac"
                  onClick={handleClearAll}
                  className={cn(
                    keyH,
                    "rounded-lg border text-[9.5px] font-extrabold text-rose-400 cursor-pointer",
                    isDark ? "border-rose-500/30 bg-rose-500/10" : "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  AC
                </button>
                <button
                  type="button"
                  data-testid="bench-key-backspace"
                  onClick={handleBackspace}
                  aria-label="Apagar caractere"
                  className={cn(keyH, "flex items-center justify-center rounded-lg border cursor-pointer", keyFn)}
                >
                  <Delete className="size-3.5" />
                </button>

                {/* Linha 2: sin/asin | cos/acos | tan/atan | ( | ) */}
                <button
                  type="button"
                  onClick={() => appendToken(shiftOn ? "asin(" : "sin(")}
                  className={cn(keyH, "rounded-lg border text-[9.5px] cursor-pointer", keyFn)}
                >
                  {shiftOn ? "sin⁻¹" : "sin"}
                </button>
                <button
                  type="button"
                  onClick={() => appendToken(shiftOn ? "acos(" : "cos(")}
                  className={cn(keyH, "rounded-lg border text-[9.5px] cursor-pointer", keyFn)}
                >
                  {shiftOn ? "cos⁻¹" : "cos"}
                </button>
                <button
                  type="button"
                  onClick={() => appendToken(shiftOn ? "atan(" : "tan(")}
                  className={cn(keyH, "rounded-lg border text-[9.5px] cursor-pointer", keyFn)}
                >
                  {shiftOn ? "tan⁻¹" : "tan"}
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("(")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  (
                </button>
                <button
                  type="button"
                  onClick={() => appendToken(")")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  )
                </button>

                {/* Linha 3: x²/x³ | √x/∛x | xʸ | π | % */}
                <button
                  type="button"
                  onClick={() => appendToken(shiftOn ? "³" : "²")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  {shiftOn ? "x³" : "x²"}
                </button>
                <button
                  type="button"
                  onClick={() => appendToken(shiftOn ? "∛(" : "√(")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  {shiftOn ? "∛x" : "√x"}
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("^")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  xʸ
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("π")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  π
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("%")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  %
                </button>
              </div>
            )}

            {(!isLowLandscape || compactTab === "123") && (
              <div className="grid shrink-0 grid-cols-5 gap-1 font-mono text-[11.5px] font-bold">
                {/* Linha 4: 7 8 9 ÷ × */}
                {["7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => appendToken(d)}
                    className={cn(keyH, "rounded-lg border cursor-pointer", keyBase)}
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => appendToken("÷")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyOp)}
                >
                  ÷
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("×")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyOp)}
                >
                  ×
                </button>

                {/* Linha 5: 4 5 6 − + */}
                {["4", "5", "6"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => appendToken(d)}
                    className={cn(keyH, "rounded-lg border cursor-pointer", keyBase)}
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => appendToken("-")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyOp)}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("+")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyOp)}
                >
                  +
                </button>

                {/* Linha 6: 1 2 3 ; = */}
                {["1", "2", "3"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => appendToken(d)}
                    className={cn(keyH, "rounded-lg border cursor-pointer", keyBase)}
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => appendToken(";")}
                  title="Separador de argumentos (ex: hypot(300;400))"
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyFn)}
                >
                  ;
                </button>
                <button
                  type="button"
                  data-testid="bench-key-equals"
                  onClick={handleEvaluateCommit}
                  className={cn(
                    "row-span-2 flex items-center justify-center rounded-lg bg-sky-500 text-sm font-extrabold text-slate-950 shadow-sm hover:bg-sky-400 active:scale-95 cursor-pointer",
                  )}
                >
                  =
                </button>

                {/* Linha 7: 0 (span 2) , Ans */}
                <button
                  type="button"
                  onClick={() => appendToken("0")}
                  className={cn(keyH, "col-span-2 rounded-lg border cursor-pointer", keyBase)}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => appendToken(",")}
                  className={cn(keyH, "rounded-lg border cursor-pointer", keyBase)}
                >
                  ,
                </button>
                <button
                  type="button"
                  onClick={() => appendToken("Ans")}
                  title={`Último resultado salvo (${formatBenchValue(state.ans, "auto")})`}
                  className={cn(keyH, "rounded-lg border text-[9.5px] cursor-pointer", keyFn)}
                >
                  Ans
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    );

    if (typeof document !== "undefined" && document.body) {
      return createPortal(node, document.body);
    }
    return node;
  },
);
