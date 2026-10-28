/**
 * CALDRA CHAMFER — TECLADO NUMÉRICO CAD INTEGRADO E TRAVA DIMENSIONAL REAL
 *
 * Especificação Técnica (Seções 7, 8 e 9):
 *  - NUNCA utiliza <input> focável (impede 100% a abertura do teclado virtual nativo Android/iOS);
 *  - Visor numérico próprio com valor atual, unidade (mm) e estado da restrição (LIVRE / 🔒 FIXA);
 *  - Botões táteis "0–9", separador decimal (","), inversão de sinal ("±"), apagar ("⌫") e limpar ("C");
 *  - Seletor de passo de incremento fino ("0,1 mm", "1 mm", "10 mm") com botões "−" e "+";
 *  - Prévia ao vivo ("onPreviewChange") durante a digitação, aplicando definitivamente apenas em "✓ Confirmar";
 *  - Botão funcional "🔒 Fixar Medida" que estabelece ou remove restrição dimensional geométrica real.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Check, X, Minus, Plus, Lock, Unlock, Delete, RotateCcw, ArrowLeftRight } from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { globalParametricStore } from "@/lib/lab2d/cadParametricVariables";
import { DimensionInteractionEngine } from "@/lib/lab2d/cadDimensionInteractionEngine";
import { cn } from "@/lib/utils";

export interface ChamferDirectDimensionEditorProps {
  open: boolean;
  onClose: () => void;
  screenPos: { x: number; y: number };
  currentValue: number;
  label: string;
  /** Confirmar valor e estado de fixação (🔒 Fixar Medida) */
  onConfirm: (newValue: number, lockMeasure?: boolean) => void;
  /** Atualização de prévia temporária enquanto o usuário digita */
  onPreviewChange?: (previewValue: number) => void;
  /** Indica se a medida já possui restrição dimensional ativa */
  initialLocked?: boolean;
  /** Indica se o botão "🔒 Fixar Medida" deve ser exibido */
  allowLock?: boolean;
  /** Indica se o parâmetro aceita valores negativos (ex: ΔX/ΔY relativo) */
  allowNegative?: boolean;
  allowInvert?: boolean;
  onInvertSide?: () => void;
  unit?: string;
}

type StepOption = 0.1 | 1 | 10;

export function ChamferDirectDimensionEditor({
  open,
  onClose,
  screenPos,
  currentValue,
  label,
  onConfirm,
  onPreviewChange,
  initialLocked = false,
  allowLock = true,
  allowNegative = false,
  allowInvert = false,
  onInvertSide,
  unit = "mm",
}: ChamferDirectDimensionEditorProps) {
  const formatInitial = (val: number) => {
    if (!Number.isFinite(val)) return "0";
    return String(Number(val.toFixed(4))).replace(".", ",");
  };

  const [displayStr, setDisplayStr] = useState<string>(() => formatInitial(currentValue));
  const [freshEntry, setFreshEntry] = useState<boolean>(true);
  const [stepMm, setStepMm] = useState<StepOption>(1);
  const [isLocked, setIsLocked] = useState<boolean>(initialLocked);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayStr(formatInitial(currentValue));
      setFreshEntry(true);
      setIsLocked(initialLocked);
      setErrorMsg(null);
      // Garante que qualquer elemento focado anteriormente perca o foco para nunca abrir teclado nativo
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  }, [open, currentValue, initialLocked]);

  const parseNormalized = useCallback((rawStr: string): number | null => {
    const clean = rawStr.trim().replace(/,/g, ".");
    if (!clean || clean === "-" || clean === ".") return null;
    const parsed = DimensionInteractionEngine.parseInput(clean);
    if (parsed !== null && Number.isFinite(parsed)) {
      return clean.startsWith("-") && parsed > 0 ? -parsed : parsed;
    }
    const expr = globalParametricStore.evaluateExpression(clean);
    if (typeof expr === "number" && Number.isFinite(expr)) return expr;
    const direct = Number(clean);
    return Number.isFinite(direct) ? direct : null;
  }, []);

  const notifyPreviewIfValid = useCallback(
    (nextStr: string) => {
      const val = parseNormalized(nextStr);
      if (val !== null && (allowNegative || val > 0)) {
        onPreviewChange?.(val);
      }
    },
    [parseNormalized, allowNegative, onPreviewChange],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      triggerHaptic("selection");
      setErrorMsg(null);
      const next = freshEntry || displayStr === "0" ? digit : displayStr + digit;
      setFreshEntry(false);
      setDisplayStr(next);
      notifyPreviewIfValid(next);
    },
    [freshEntry, displayStr, notifyPreviewIfValid],
  );

  const handleDecimal = useCallback(() => {
    triggerHaptic("selection");
    setErrorMsg(null);
    if (freshEntry) {
      setFreshEntry(false);
      setDisplayStr("0,");
      return;
    }
    if (displayStr.includes(",") || displayStr.includes(".")) return;
    setDisplayStr(displayStr + ",");
  }, [freshEntry, displayStr]);

  const handleBackspace = useCallback(() => {
    triggerHaptic("selection");
    setErrorMsg(null);
    setFreshEntry(false);
    if (displayStr.length <= 1 || (displayStr.length === 2 && displayStr.startsWith("-"))) {
      setDisplayStr("0");
      return;
    }
    const next = displayStr.slice(0, -1);
    setDisplayStr(next);
    notifyPreviewIfValid(next);
  }, [displayStr, notifyPreviewIfValid]);

  const handleClear = useCallback(() => {
    triggerHaptic("selection");
    setErrorMsg(null);
    setFreshEntry(true);
    setDisplayStr("0");
  }, []);

  const handleToggleSign = useCallback(() => {
    triggerHaptic("selection");
    if (!allowNegative) {
      setErrorMsg("Esta medida exige valor estritamente positivo (> 0 mm).");
      return;
    }
    setErrorMsg(null);
    setFreshEntry(false);
    if (displayStr === "0" || !displayStr) return;
    const next = displayStr.startsWith("-") ? displayStr.slice(1) : "-" + displayStr;
    setDisplayStr(next);
    notifyPreviewIfValid(next);
  }, [allowNegative, displayStr, notifyPreviewIfValid]);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      triggerHaptic("selection");
      const currentParsed = parseNormalized(displayStr) ?? currentValue;
      const candidate = Number((currentParsed + direction * stepMm).toFixed(4));
      if (!allowNegative && candidate <= 0) {
        setErrorMsg("Esta medida deve permanecer maior que 0 mm.");
        return;
      }
      setErrorMsg(null);
      setFreshEntry(false);
      const formatted = String(candidate).replace(".", ",");
      setDisplayStr(formatted);
      onPreviewChange?.(candidate);
    },
    [displayStr, currentValue, stepMm, allowNegative, parseNormalized, onPreviewChange],
  );

  const handleConfirm = useCallback(
    (overrideLock?: boolean) => {
      const evaluated = parseNormalized(displayStr);
      if (evaluated === null || !Number.isFinite(evaluated)) {
        setErrorMsg("Digite um valor numérico válido em mm.");
        return;
      }
      if (!allowNegative && evaluated <= 0) {
        setErrorMsg("O valor deve ser maior que 0 mm.");
        return;
      }
      const finalLock = typeof overrideLock === "boolean" ? overrideLock : isLocked;
      triggerHaptic("success");
      AudioManager.play("ui_select");
      onConfirm(evaluated, finalLock);
    },
    [displayStr, parseNormalized, allowNegative, isLocked, onConfirm],
  );

  const handleToggleLockButton = useCallback(() => {
    triggerHaptic("action");
    const nextLock = !isLocked;
    setIsLocked(nextLock);
    const evaluated = parseNormalized(displayStr);
    if (evaluated !== null && Number.isFinite(evaluated) && (allowNegative || evaluated > 0)) {
      AudioManager.play("ui_select");
      onConfirm(evaluated, nextLock);
    }
  }, [isLocked, displayStr, parseNormalized, allowNegative, onConfirm]);

  // Suporte opcional a teclado físico em Desktop sem qualquer <input> focável
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key >= "0" && ev.key <= "9") {
        ev.preventDefault();
        handleDigit(ev.key);
      } else if (ev.key === "," || ev.key === ".") {
        ev.preventDefault();
        handleDecimal();
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        handleBackspace();
      } else if (ev.key === "Delete") {
        ev.preventDefault();
        handleClear();
      } else if (ev.key === "-") {
        ev.preventDefault();
        handleToggleSign();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        handleConfirm();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleDigit, handleDecimal, handleBackspace, handleClear, handleToggleSign, handleConfirm, onClose]);

  if (!open) return null;

  // Posicionamento seguro dentro da viewport para nunca cortar em telas mobile
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 700;
  const cardW = 248;
  const cardH = 310;
  const posX = Math.max(cardW / 2 + 8, Math.min(vw - cardW / 2 - 8, screenPos.x));
  const posY = Math.max(cardH / 2 + 12, Math.min(vh - cardH / 2 - 12, screenPos.y));

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 -translate-y-1/2 select-none animate-in zoom-in-95 duration-100"
      style={{ left: `${posX}px`, top: `${posY}px`, width: `${cardW}px` }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-2 p-2.5 bg-[#0B1017]/98 border border-slate-700/90 shadow-[0_14px_44px_rgba(0,0,0,0.9)] rounded-2xl backdrop-blur-xl text-slate-100">
        {/* CABEÇALHO TÉCNICO: TÍTULO E ESTADO DA MEDIDA */}
        <div className="flex items-center justify-between border-b border-slate-800/90 pb-1.5">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 truncate">
              {label || "Medida CAD"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase",
                isLocked
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-slate-800 text-slate-400",
              )}
            >
              {isLocked ? "🔒 FIXA" : "LIVRE"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="size-5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              title="Cancelar"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* VISOR NUMÉRICO INTEGRADO (SEM <INPUT> FOCÁVEL — ZERO TECLADO NATIVO) */}
        <div
          role="spinbutton"
          aria-label={label}
          aria-valuenow={parseNormalized(displayStr) ?? currentValue}
          className={cn(
            "flex items-center justify-between rounded-xl px-2.5 py-1.5 bg-slate-950 border transition-colors",
            errorMsg
              ? "border-rose-500/80"
              : isLocked
                ? "border-amber-500/70"
                : "border-sky-500/60",
          )}
        >
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="size-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            title={`-${stepMm} ${unit}`}
          >
            <Minus className="size-3.5" />
          </button>

          <div className="flex flex-col items-center justify-center min-w-0 px-2">
            <div className="flex items-baseline gap-1">
              <span
                data-testid="cad-keypad-display"
                className={cn(
                  "font-mono font-bold text-base tracking-tight",
                  freshEntry ? "text-sky-300" : "text-white",
                )}
              >
                {displayStr}
              </span>
              <span className="font-mono text-[10px] text-slate-400 font-semibold">{unit}</span>
            </div>
            <span className="font-mono text-[8.5px] text-slate-500">
              Atual: {String(Number(currentValue.toFixed(2))).replace(".", ",")} {unit}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleStep(1)}
            className="size-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            title={`+${stepMm} ${unit}`}
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* MENSAGEM DE VALIDAÇÃO OU CONFLITO */}
        {errorMsg && (
          <div className="px-2 py-1 rounded-lg bg-rose-950/80 border border-rose-500/50 text-[9.5px] font-mono text-rose-200 leading-tight">
            {errorMsg}
          </div>
        )}

        {/* SELETOR DE PASSO FINO (0,1 mm | 1 mm | 10 mm) */}
        <div className="grid grid-cols-3 gap-1">
          {([0.1, 1, 10] as StepOption[]).map((s) => (
            <button
              key={`step-${s}`}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setStepMm(s);
              }}
              className={cn(
                "py-1 rounded-lg font-mono text-[9.5px] font-bold transition-colors cursor-pointer",
                stepMm === s
                  ? "bg-sky-600/30 border border-sky-500/60 text-sky-300"
                  : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200",
              )}
            >
              ±{String(s).replace(".", ",")} {unit}
            </button>
          ))}
        </div>

        {/* GRADE DO TECLADO NUMÉRICO CAD (0-9, VÍRGULA, ±, ⌫, C) */}
        <div className="grid grid-cols-4 gap-1 font-mono">
          {["7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-8 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-sky-900/50 border border-slate-800 text-xs font-bold text-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-amber-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            title="Apagar último dígito (⌫)"
          >
            <Delete className="size-3.5" />
          </button>

          {["4", "5", "6"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-8 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-sky-900/50 border border-slate-800 text-xs font-bold text-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-rose-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            title="Limpar entrada (C)"
          >
            C
          </button>

          {["1", "2", "3"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-8 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-sky-900/50 border border-slate-800 text-xs font-bold text-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleToggleSign}
            className={cn(
              "h-8 rounded-lg border text-xs font-bold flex items-center justify-center active:scale-95 transition-all cursor-pointer",
              allowNegative
                ? "bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200"
                : "bg-slate-900/40 border-slate-800/50 text-slate-600",
            )}
            title="Inverter sinal (±)"
          >
            ±
          </button>

          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="col-span-2 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-sky-900/50 border border-slate-800 text-xs font-bold text-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDecimal}
            className="h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-bold text-sky-300 active:scale-95 transition-all cursor-pointer"
            title="Separador decimal (,)"
          >
            ,
          </button>
          {allowInvert && onInvertSide ? (
            <button
              type="button"
              onClick={onInvertSide}
              className="h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Inverter Lado"
            >
              <ArrowLeftRight className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setDisplayStr(formatInitial(currentValue));
                setFreshEntry(true);
                setErrorMsg(null);
              }}
              className="h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 border border-slate-800 text-slate-400 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Restaurar valor original"
            >
              <RotateCcw className="size-3" />
            </button>
          )}
        </div>

        {/* BOTÃO FUNCIONAL: 🔒 FIXAR MEDIDA (RESTRIÇÃO DIMENSIONAL REAL) */}
        {allowLock && (
          <button
            type="button"
            onClick={handleToggleLockButton}
            className={cn(
              "w-full py-1.5 px-2.5 rounded-xl font-mono text-[10.5px] font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-98 cursor-pointer",
              isLocked
                ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-xs"
                : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300",
            )}
          >
            {isLocked ? <Unlock className="size-3.5 text-amber-300" /> : <Lock className="size-3.5 text-amber-400" />}
            <span>{isLocked ? "🔓 Destravar Medida (Restrição Ativa)" : "🔒 Fixar Medida"}</span>
          </button>
        )}

        {/* RODAPÉ: CANCELAR E ✓ CONFIRMAR */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono text-[10.5px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform cursor-pointer"
          >
            <X className="size-3.5" />
            <span>Cancelar</span>
          </button>
          <button
            type="button"
            onClick={() => handleConfirm()}
            className="py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-mono text-[10.5px] font-bold flex items-center justify-center gap-1 shadow-md shadow-sky-600/30 active:scale-95 transition-transform cursor-pointer"
          >
            <Check className="size-3.5 stroke-[2.5]" />
            <span>Confirmar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
