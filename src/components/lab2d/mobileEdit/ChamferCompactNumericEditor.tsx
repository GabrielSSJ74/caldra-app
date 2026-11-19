/**
 * CALDRA CHAMFER — EDITOR NUMÉRICO COMPACTO MOBILE (PAINÉIS 2 E 4 DA REFERÊNCIA)
 *
 * Teclado numérico próprio e integrado do CHAMFER:
 * - Modo Compacto (Stepper - Painel 2 da referência / diagrama ASCII do prompt):
 *   ┌─────────────────────────────────────┐
 *   │ Diâmetro                            │
 *   │              40,00 mm               │
 *   │       −                +             │
 *   │      0,1      1      5      10      │
 *   │                         ✓            │
 *   └─────────────────────────────────────┘
 * - Modo Teclado Completo (Painel 4 da referência):
 *   - Teclado de 4 colunas com dígitos 0-9, ponto, backspace e botão carmesim ✓
 * - Ajuste Rápido por Deslize Horizontal (Scrubber Drag):
 *   - Deslizar o dedo/cursor altera 40,00 → 40,10 → 40,20... continuamente
 * - Atualização em TEMPO REAL no canvas 2D e sólido 3D (Regra 6)
 * - Cancelamento seguro (restaura o valor inicial) e Confirmação (Regra 9)
 * - Unidades sempre visíveis (mm, °, etc. - Regra 10)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Delete, Check, Minus, Plus, Keyboard, Sliders, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import {
  CHAMFER_INJECT_CAD_VALUE_EVENT,
  type ChamferInjectCadValueDetail,
} from "@/lib/lab2d/chamferBenchCalculator";
import { chamferParameterStore, type ChamferParameter } from "@/chamfer/core/parameterStore";
import type { NumericPropertyDef } from "./types";

interface ChamferCompactNumericEditorProps {
  property: NumericPropertyDef;
  onChange: (val: number) => void;
  onConfirm: (val: number) => void;
  onCancel: () => void;
  initialMode?: "stepper" | "keypad";
  className?: string;
}

export function ChamferCompactNumericEditor({
  property,
  onChange,
  onConfirm,
  onCancel,
  initialMode = "stepper",
  className,
}: ChamferCompactNumericEditorProps) {
  // Snapshot do valor inicial para cancelamento seguro (Regra 9)
  const initialValueRef = useRef<number>(property.value);

  // Modo de visualização: Stepper ultracompacto (Painel 2) ou Teclado completo (Painel 4)
  const [mode, setMode] = useState<"stepper" | "keypad">(initialMode);

  // Passo ativo (padrão: 1 ou defaultStep)
  const steps = property.stepOptions && property.stepOptions.length > 0
    ? property.stepOptions
    : [0.1, 1, 5, 10];
  const [activeStep, setActiveStep] = useState<number>(property.defaultStep ?? 1);

  // Valor numérico em edição e buffer de texto
  const [currentValue, setCurrentValue] = useState<number>(property.value);
  const [inputBuffer, setInputBuffer] = useState<string>(
    property.value.toFixed(property.decimals ?? 2)
  );
  const [isTyping, setIsTyping] = useState<boolean>(false);
  // Expressão paramétrica no Numpad (Pilar 2 — sem abrir teclado nativo do celular)
  const [favoriteParams, setFavoriteParams] = useState<ChamferParameter[]>(() =>
    chamferParameterStore.getAll().slice(0, 8),
  );
  const [exprMode, setExprMode] = useState<boolean>(false);
  const [exprError, setExprError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const all = chamferParameterStore.getAll();
      const favs = all.filter((p) => p.favorite);
      setFavoriteParams((favs.length > 0 ? favs : all).slice(0, 8));
    };
    sync();
    return chamferParameterStore.subscribe(sync);
  }, []);

  // Estado do arraste / deslize horizontal (Scrubbing - Regra 8)
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState<number | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartValRef = useRef<number>(property.value);

  // Limites do slider
  const minVal = property.min ?? Math.max(0, property.value > 0 ? property.value * 0.1 : -1000);
  const maxVal = property.max ?? Math.max(100, property.value > 0 ? property.value * 2.5 : 1000);

  // Atualiza buffer quando o valor do modelo muda externamente
  useEffect(() => {
    if (!isTyping && !isDragging) {
      setCurrentValue(property.value);
      setInputBuffer(property.value.toFixed(property.decimals ?? 2));
    }
  }, [property.value, property.decimals, isTyping, isDragging]);

  // Disparo em tempo real (Regra 6)
  const applyValue = useCallback(
    (newVal: number) => {
      let clamped = newVal;
      if (property.min !== undefined) clamped = Math.max(property.min, clamped);
      if (property.max !== undefined) clamped = Math.min(property.max, clamped);
      const factor = Math.pow(10, property.decimals ?? 2);
      clamped = Math.round(clamped * factor) / factor;

      setCurrentValue(clamped);
      setInputBuffer(clamped.toFixed(property.decimals ?? 2));
      onChange(clamped);
    },
    [onChange, property.min, property.max, property.decimals]
  );

  // Ponte Bidirecional da Mini-Calculadora de Bancada (`[ ↳ Usar no CAD ]`)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onInject = (rawEv: Event) => {
      const ev = rawEv as CustomEvent<ChamferInjectCadValueDetail>;
      if (!ev.detail || ev.detail.handled) return;
      if (!Number.isFinite(ev.detail.value)) return;
      setIsTyping(false);
      applyValue(ev.detail.value);
      triggerHaptic("selection");
      ev.detail.handled = true;
    };
    window.addEventListener(CHAMFER_INJECT_CAD_VALUE_EVENT, onInject);
    return () => window.removeEventListener(CHAMFER_INJECT_CAD_VALUE_EVENT, onInject);
  }, [applyValue]);

  // Incremento / Decremento por passo ativo (− e +)
  const handleStepChange = (direction: -1 | 1) => {
    triggerHaptic("selection");
    setIsTyping(false);
    const next = currentValue + direction * activeStep;
    applyValue(next);
  };

  // Insere chip de parâmetro ou operador matemático na expressão sem abrir teclado nativo
  const handleInsertExprToken = (token: string) => {
    triggerHaptic("selection");
    setExprMode(true);
    setExprError(null);
    const isFresh = !isTyping && !exprMode;
    setIsTyping(true);
    const base = isFresh ? "" : inputBuffer;
    const sep = base.length > 0 && !base.endsWith(" ") && !base.endsWith("(") ? " " : "";
    const nextBuf = `${base}${sep}${token}`.trim();
    setInputBuffer(nextBuf);
    const ev = chamferParameterStore.evaluate(nextBuf);
    if (ev.ok && Number.isFinite(ev.value)) {
      let clamped = ev.value;
      if (property.min !== undefined) clamped = Math.max(property.min, clamped);
      if (property.max !== undefined) clamped = Math.min(property.max, clamped);
      setCurrentValue(clamped);
      onChange(clamped);
    }
  };

  // Salva expressão/valor atual como parâmetro do modelo ou usuário
  const handleSaveAsParameter = () => {
    triggerHaptic("heavy");
    const slug = property.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "cota";
    const res = chamferParameterStore.setParameter(slug, inputBuffer || String(currentValue), {
      unit: property.unit === "°" ? "deg" : "mm",
      favorite: true,
      kind: "user",
      description: `Salvo do Numpad (${property.label})`,
    });
    if (res.ok && res.parameter) {
      setSavedToast(`Salvo: ${res.parameter.name} = ${res.parameter.value.toFixed(2)}`);
      setTimeout(() => setSavedToast(null), 2200);
    } else {
      setExprError(res.error ?? "Erro ao salvar parâmetro");
    }
  };

  // Digitação de dígitos pelo teclado integrado do CHAMFER (sem teclado Android)
  const handleDigit = (digit: string) => {
    triggerHaptic("selection");
    setExprError(null);
    let nextBuffer: string;

    if (!isTyping) {
      setIsTyping(true);
      setExprMode(false);
      nextBuffer = digit === "." ? "0." : digit;
    } else if (exprMode) {
      if (inputBuffer.length >= 42) return;
      nextBuffer = inputBuffer + digit;
    } else {
      if (digit === "." && inputBuffer.includes(".")) return;
      if (inputBuffer.length >= 10) return;
      nextBuffer = inputBuffer + digit;
    }

    setInputBuffer(nextBuffer);
    if (exprMode || /[a-zA-Z+\-*/×÷()]/.test(nextBuffer)) {
      const ev = chamferParameterStore.evaluate(nextBuffer);
      if (ev.ok && Number.isFinite(ev.value)) {
        let clamped = ev.value;
        if (property.min !== undefined) clamped = Math.max(property.min, clamped);
        if (property.max !== undefined) clamped = Math.min(property.max, clamped);
        setCurrentValue(clamped);
        onChange(clamped);
      }
      return;
    }
    const parsed = parseFloat(nextBuffer);
    if (!isNaN(parsed)) {
      let clamped = parsed;
      if (property.min !== undefined && parsed < property.min) {
        clamped = property.min;
      }
      setCurrentValue(parsed);
      onChange(clamped);
    }
  };

  // Apagar último caractere (Backspace ⌫)
  const handleBackspace = () => {
    triggerHaptic("selection");
    if (!isTyping || inputBuffer.length <= 1) {
      setIsTyping(true);
      setExprMode(false);
      setInputBuffer("0");
      setCurrentValue(0);
      onChange(property.min ?? 0);
      return;
    }
    const next = inputBuffer.slice(0, -1).trimEnd();
    setInputBuffer(next || "0");
    if (/[a-zA-Z+\-*/×÷()]/.test(next)) {
      const ev = chamferParameterStore.evaluate(next);
      if (ev.ok && Number.isFinite(ev.value)) {
        setCurrentValue(ev.value);
        onChange(ev.value);
      }
      return;
    }
    const parsed = parseFloat(next);
    if (!isNaN(parsed)) {
      setCurrentValue(parsed);
      onChange(parsed);
    }
  };

  // Limpar campo totalmente
  const handleClear = () => {
    triggerHaptic("selection");
    setIsTyping(true);
    setInputBuffer("0");
    setCurrentValue(0);
    onChange(property.min ?? 0);
  };

  // Confirmar (✓)
  const handleConfirm = () => {
    triggerHaptic("heavy");
    onConfirm(currentValue);
  };

  // Cancelar (✕) - Restaura o valor inicial exato (Regra 9)
  const handleCancel = () => {
    triggerHaptic("warning");
    onChange(initialValueRef.current);
    onCancel();
  };

  // -------------------------------------------------------------------------
  // DESLIZE HORIZONTAL (SCRUBBING - REGRA 8)
  // Ao arrastar horizontalmente, altera 40,00 → 40,10 → 40,20...
  // -------------------------------------------------------------------------
  const handlePointerDownScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartValRef.current = currentValue;
    setDragDelta(0);
  };

  const handlePointerMoveScrub = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const diffPx = e.clientX - dragStartXRef.current;
    // A cada 12px de arrasto, incrementa ou decrementa 1 activeStep
    const stepsCount = Math.round(diffPx / 12);
    const change = stepsCount * activeStep;
    setDragDelta(change);
    const nextVal = dragStartValRef.current + change;
    applyValue(nextVal);
  };

  const handlePointerUpScrub = (e: React.PointerEvent) => {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsDragging(false);
      setDragDelta(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Editor de ${property.label}`}
      className={cn(
        "relative z-50 flex w-[280px] sm:w-[305px] flex-col rounded-2xl border border-slate-700/90 bg-slate-950/95 p-3 text-slate-100 shadow-2xl backdrop-blur-md select-none",
        "animate-in fade-in zoom-in-95 duration-150",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ---------------------------------------------------- */}
      {/* CABEÇALHO DO EDITOR                                  */}
      {/* ---------------------------------------------------- */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <div className="flex items-center gap-1.5 font-sans text-xs font-semibold text-slate-200">
          {property.symbol && (
            <span className="font-mono text-red-500 font-bold text-sm">
              {property.symbol}
            </span>
          )}
          <span>{property.label}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Alternar entre Stepper Compacto (Painel 2) e Teclado (Painel 4) */}
          <button
            type="button"
            onClick={() => setMode(mode === "stepper" ? "keypad" : "stepper")}
            title={mode === "stepper" ? "Abrir teclado numérico CAD" : "Recolher para ajuste rápido"}
            aria-label="Alternar modo de teclado"
            className="flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors border border-slate-800"
          >
            {mode === "stepper" ? (
              <>
                <Keyboard className="size-3 text-red-400" />
                <span>123</span>
              </>
            ) : (
              <>
                <ChevronDown className="size-3 text-slate-400" />
                <span>Ajuste</span>
              </>
            )}
          </button>

          {/* Cancelar (✕) - Restaura o valor original */}
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancelar alteração"
            title="Cancelar (restaurar valor anterior)"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* FAIXA DE PARÂMETROS FAVORITOS + OPERADORES (PILAR 2) */}
      {/* ---------------------------------------------------- */}
      <div
        style={{ borderColor: "var(--chamfer-border)" }}
        className="mt-1.5 flex flex-col gap-1 border-b pb-1.5"
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {favoriteParams.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => handleInsertExprToken(p.name)}
              title={`${p.name} = ${p.value.toFixed(2)} ${p.unit}`}
              style={{
                backgroundColor: "var(--chamfer-accent-soft)",
                borderColor: "var(--chamfer-accent-border)",
                color: "var(--chamfer-accent)",
              }}
              className="shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-semibold transition hover:brightness-110 active:scale-95 cursor-pointer"
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={handleSaveAsParameter}
            style={{
              backgroundColor: "var(--chamfer-accent)",
              borderColor: "var(--chamfer-accent)",
              color: "var(--chamfer-accent-contrast)",
            }}
            className="shrink-0 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold transition hover:brightness-110 active:scale-95 cursor-pointer"
          >
            fx Salvar Parâmetro
          </button>
        </div>
        <div className="flex items-center gap-1">
          {["+", "-", "×", "÷", "(", ")"].map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => handleInsertExprToken(op)}
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="flex-1 rounded-lg border py-1 font-mono text-xs font-bold transition hover:opacity-85 active:scale-95 cursor-pointer"
            >
              {op}
            </button>
          ))}
        </div>
        {(exprError || savedToast || exprMode) && (
          <div className="flex items-center justify-between px-0.5 font-mono text-[10px]">
            {exprError ? (
              <span style={{ color: "var(--chamfer-status-error)" }}>{exprError}</span>
            ) : savedToast ? (
              <span style={{ color: "var(--chamfer-status-success)" }}>{savedToast}</span>
            ) : (
              <span style={{ color: "var(--chamfer-accent)" }}>
                = {currentValue.toFixed(property.decimals ?? 2)} {property.unit ?? "mm"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* VISOR PRINCIPAL DE MEDIDA COM DESLIZE HORIZONTAL     */}
      {/* ---------------------------------------------------- */}
      <div
        onPointerDown={handlePointerDownScrub}
        onPointerMove={handlePointerMoveScrub}
        onPointerUp={handlePointerUpScrub}
        onPointerCancel={handlePointerUpScrub}
        title="Toque e arraste para deslize contínuo ou use os botões"
        className={cn(
          "my-2 flex cursor-ew-resize items-center justify-between rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 shadow-inner transition-colors touch-none",
          isDragging ? "border-red-500 bg-red-950/20" : "hover:border-slate-600"
        )}
      >
        {/* Indicador de cursor técnico / delta de arraste */}
        <div className="flex items-center gap-1">
          <span className="inline-block h-4 w-0.5 animate-pulse bg-red-500 rounded-full" />
          {dragDelta !== null && dragDelta !== 0 ? (
            <span className="font-mono text-[10px] font-bold text-red-400">
              {dragDelta > 0 ? `+${dragDelta.toFixed(property.decimals ?? 2)}` : dragDelta.toFixed(property.decimals ?? 2)}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-slate-500 tracking-wider">
              {isDragging ? "ARRASIE" : "CAD"}
            </span>
          )}
        </div>

        {/* Display do valor numérico com unidade */}
        <div className="flex items-baseline gap-1 text-right">
          <span className="font-mono text-2xl font-bold tracking-tight text-white">
            {inputBuffer}
          </span>
          {property.unit && (
            <span className="font-mono text-xs font-semibold text-slate-400">
              {property.unit}
            </span>
          )}
        </div>

        {/* Botão limpar/backspace */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          title="Limpar valor"
          aria-label="Limpar valor"
          className="ml-2 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
        >
          <Delete className="size-4" />
        </button>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SEÇÃO DE AJUSTE RÁPIDO: − / +, SLIDER E PASSOS       */}
      {/* ---------------------------------------------------- */}
      <div className="flex flex-col gap-1.5 mb-2">
        <div className="flex items-center gap-2">
          {/* Botão Decrementar (−) */}
          <button
            type="button"
            onClick={() => handleStepChange(-1)}
            aria-label="Diminuir pelo passo atual"
            className="flex h-9 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-white font-bold text-base hover:bg-slate-700 active:scale-95 transition-all shadow-xs"
          >
            <Minus className="size-4" />
          </button>

          {/* Slider contínuo de ajuste fino (Scrub Bar) */}
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min={minVal}
              max={maxVal}
              step={activeStep}
              value={currentValue}
              onChange={(e) => {
                setIsTyping(false);
                applyValue(parseFloat(e.target.value));
              }}
              aria-label="Ajuste contínuo por arraste"
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-red-600 focus:outline-none"
            />
          </div>

          {/* Botão Incrementar (+) */}
          <button
            type="button"
            onClick={() => handleStepChange(1)}
            aria-label="Aumentar pelo passo atual"
            className="flex h-9 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-white font-bold text-base hover:bg-slate-700 active:scale-95 transition-all shadow-xs"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* ---------------------------------------------------- */}
        {/* SELETOR DE PASSOS CONFIGURÁVEIS (0.1, 1, 5, 10 MM)   */}
        {/* ---------------------------------------------------- */}
        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
          {steps.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setActiveStep(st);
              }}
              className={cn(
                "rounded-lg py-1 font-mono text-[11px] font-semibold transition-all border",
                activeStep === st
                  ? "border-red-500 bg-red-600 text-white shadow-xs"
                  : "border-slate-800 bg-slate-900/90 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* MODO STEPPER (PAINEL 2): BOTÃO DE CONFIRMAR COMPACTO */}
      {/* ---------------------------------------------------- */}
      {mode === "stepper" ? (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 h-9 rounded-xl border border-slate-800 bg-slate-900 font-sans text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            aria-label="Confirmar alteração"
            className="flex-[2] h-9 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-red-900/30 transition-all cursor-pointer"
          >
            <Check className="size-4 stroke-[2.5]" />
            <span>Confirmar</span>
          </button>
        </div>
      ) : (
        /* ---------------------------------------------------- */
        /* MODO TECLADO COMPLETO (PAINEL 4): 4 COLUNAS          */
        /* ---------------------------------------------------- */
        <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-800">
          {/* Linha 1: 7, 8, 9, Backspace */}
          <button
            type="button"
            onClick={() => handleDigit("7")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleDigit("8")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleDigit("9")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            9
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Apagar último dígito"
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-300 hover:bg-slate-800 active:scale-95 transition-transform"
          >
            <Delete className="size-4" />
          </button>

          {/* Linha 2: 4, 5, 6 */}
          <button
            type="button"
            onClick={() => handleDigit("4")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleDigit("5")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleDigit("6")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            6
          </button>

          {/* Botão de Confirmação Carmesim (Ocupa a 4ª coluna das linhas 2 a 4) */}
          <button
            type="button"
            onClick={handleConfirm}
            aria-label="Confirmar e fechar"
            title="Confirmar alteração"
            className="row-span-3 flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold shadow-lg shadow-red-900/30 transition-all cursor-pointer"
          >
            <Check className="size-6 stroke-[2.5]" />
          </button>

          {/* Linha 3: 1, 2, 3 */}
          <button
            type="button"
            onClick={() => handleDigit("1")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleDigit("2")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleDigit("3")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            3
          </button>

          {/* Linha 4: 0 (span 2), Ponto (.) */}
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-10 col-span-2 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleDigit(".")}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900 font-mono text-base font-bold text-white hover:bg-slate-800 active:scale-95 transition-transform"
          >
            .
          </button>
        </div>
      )}
    </div>
  );
}
