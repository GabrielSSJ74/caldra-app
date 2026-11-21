/**
 * CALDRA CHAMFER — TECLADO NUMÉRICO CAD INTEGRADO E TRAVA DIMENSIONAL REAL
 *
 * Especificação Técnica:
 *  - NUNCA utiliza <input> focável (impede 100% a abertura do teclado virtual nativo Android/iOS);
 *  - Posição fixa à direita do canvas (right: 52px, centralizado verticalmente entre a barra superior e inferior, sem jamais cobri-las);
 *  - Tamanho compacto (width: 228px, padding: 10px, border-radius: 18px) e visual refinado inspirado na Lupa;
 *  - Adaptação total ao Tema (Claro, Escuro, AMOLED), Opacidade e Cor de Destaque (Accent Color);
 *  - Prévia ao vivo ("onPreviewChange") em tempo real na peça enquadrada à esquerda;
 *  - Rodapé unificado com botão compacto "🔒 Fixar", "✕ Cancelar" e "✓ Confirmar".
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X, Minus, Plus, Delete, RotateCcw, ArrowLeftRight } from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { globalParametricStore } from "@/lib/lab2d/cadParametricVariables";
import { DimensionInteractionEngine } from "@/lib/lab2d/cadDimensionInteractionEngine";
import { useSettings, type AccentColor, type ThemeMode } from "@/lib/settings/SettingsProvider";
import { resolveAccentHex, resolveAccentContrastText } from "@/components/lab2d/ChamferVirtualCursor";
import { ReferenceService } from "@/lib/lab2d/referenceService";
import { useExponentialHold } from "@/lib/lab2d/useExponentialHold";
import {
  CHAMFER_INJECT_CAD_VALUE_EVENT,
  type ChamferInjectCadValueDetail,
} from "@/lib/lab2d/chamferBenchCalculator";
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
  /** Atalhos rápidos sob demanda exibidos dentro do mini-teclado numérico (ex: N = 3, 4, 6, 8, 12, 16 ou Ângulo = 360°, 180°, 90°) */
  presets?: { label: string; value: number }[];
}

type StepOption = 0.1 | 1 | 10;

export function ChamferDirectDimensionEditor({
  open,
  onClose,
  currentValue,
  label,
  onConfirm,
  onPreviewChange,
  initialLocked = false,
  allowNegative = false,
  allowInvert = false,
  onInvertSide,
  unit = "mm",
  presets,
}: ChamferDirectDimensionEditorProps) {
  let settingsAccent: AccentColor = "blue";
  let settingsTheme: ThemeMode = "dark";
  let settingsCardOpacity = 92;
  try {
    const s = useSettings();
    settingsAccent = s.accent;
    settingsTheme = s.theme;
    settingsCardOpacity = s.cardOpacity ?? 92;
  } catch {
    // Fallback para testes unitários isolados
  }

  const isLight = settingsTheme === "light";
  const isAmoled = settingsTheme === "amoled";
  const accentHex = resolveAccentHex(settingsAccent, !isLight);
  const accentContrast = resolveAccentContrastText(settingsAccent, !isLight);

  const allowZero =
    allowNegative ||
    currentValue === 0 ||
    /raio de canto|chanfro|offset|ângulo|angulo/i.test(label || "");

  const formatInitial = (val: number) => {
    if (!Number.isFinite(val)) return "0";
    return String(Number(val.toFixed(4))).replace(".", ",");
  };

  const [displayStr, setDisplayStr] = useState<string>(() => formatInitial(currentValue));
  const displayStrRef = useRef<string>(displayStr);
  displayStrRef.current = displayStr;
  const [freshEntry, setFreshEntry] = useState<boolean>(true);
  const [stepMm, setStepMm] = useState<StepOption>(1);
  const [isLocked, setIsLocked] = useState<boolean>(initialLocked);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const next = formatInitial(currentValue);
      displayStrRef.current = next;
      setDisplayStr(next);
      setFreshEntry(true);
      setIsLocked(initialLocked);
      setErrorMsg(null);
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  }, [open, currentValue, initialLocked]);

  // Dispara evento de visibilidade para o Auto-Enquadramento Fluido da Peça à Esquerda (Seção 4)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (open) {
      window.dispatchEvent(
        new CustomEvent("chamfer:measure-editor-state", { detail: { open: true, label } }),
      );
      return () => {
        window.dispatchEvent(
          new CustomEvent("chamfer:measure-editor-state", { detail: { open: false, label } }),
        );
      };
    }
    return undefined;
  }, [open, label]);

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

  const isValuePermitted = useCallback(
    (val: number) => {
      if (allowNegative) return true;
      if (allowZero) return val >= 0;
      return val > 0;
    },
    [allowNegative, allowZero],
  );

  const notifyPreviewIfValid = useCallback(
    (nextStr: string) => {
      const val = parseNormalized(nextStr);
      if (val !== null && isValuePermitted(val)) {
        onPreviewChange?.(val);
      }
    },
    [parseNormalized, isValuePermitted, onPreviewChange],
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
      if (allowZero) {
        onPreviewChange?.(0);
      }
      return;
    }
    const next = displayStr.slice(0, -1);
    setDisplayStr(next);
    notifyPreviewIfValid(next);
  }, [displayStr, allowZero, onPreviewChange, notifyPreviewIfValid]);

  const handleClear = useCallback(() => {
    triggerHaptic("selection");
    setErrorMsg(null);
    setFreshEntry(true);
    setDisplayStr("0");
    if (allowZero) {
      onPreviewChange?.(0);
    }
  }, [allowZero, onPreviewChange]);

  const handleToggleSign = useCallback(() => {
    triggerHaptic("selection");
    if (!allowNegative) {
      setErrorMsg("Esta medida exige valor positivo.");
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
    (direction: 1 | -1, multiplier = 1) => {
      triggerHaptic("selection");
      const currentParsed = parseNormalized(displayStrRef.current) ?? currentValue;
      const candidate = Number((currentParsed + direction * stepMm * multiplier).toFixed(4));
      if (!isValuePermitted(candidate)) {
        setErrorMsg(allowZero ? "Valor mínimo: 0." : "A medida deve ser > 0.");
        return;
      }
      const formatted = String(candidate).replace(".", ",");
      displayStrRef.current = formatted;
      setDisplayStr(formatted);
      setErrorMsg(null);
      setFreshEntry(false);
      onPreviewChange?.(candidate);
    },
    [currentValue, stepMm, allowZero, isValuePermitted, parseNormalized, onPreviewChange],
  );

  const minusHoldProps = useExponentialHold((mult) => handleStep(-1, mult));
  const plusHoldProps = useExponentialHold((mult) => handleStep(1, mult));

  const handleConfirm = useCallback(
    (overrideLock?: boolean) => {
      const evaluated = parseNormalized(displayStr);
      if (evaluated === null || !Number.isFinite(evaluated)) {
        setErrorMsg("Digite um valor numérico válido.");
        return;
      }
      if (!isValuePermitted(evaluated)) {
        setErrorMsg(allowZero ? "O valor deve ser ≥ 0." : "O valor deve ser > 0.");
        return;
      }
      const finalLock = typeof overrideLock === "boolean" ? overrideLock : isLocked;
      triggerHaptic("success");
      AudioManager.play("ui_select");
      onConfirm(evaluated, finalLock);
    },
    [displayStr, parseNormalized, isValuePermitted, allowZero, isLocked, onConfirm],
  );

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

  // Ponte Bidirecional da Mini-Calculadora de Bancada (`[ ↳ Usar no CAD ]`)
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onInject = (rawEv: Event) => {
      const ev = rawEv as CustomEvent<ChamferInjectCadValueDetail>;
      if (!ev.detail || ev.detail.handled) return;
      const incoming = ev.detail.value;
      if (!Number.isFinite(incoming)) return;
      if (!isValuePermitted(incoming)) {
        setErrorMsg(allowZero ? "O valor deve ser ≥ 0." : "Esta medida exige valor > 0.");
        ev.detail.handled = true;
        return;
      }
      const formatted = String(Number(incoming.toFixed(4))).replace(".", ",");
      setDisplayStr(formatted);
      setFreshEntry(false);
      setErrorMsg(null);
      onPreviewChange?.(incoming);
      triggerHaptic("selection");
      ev.detail.handled = true;
    };
    window.addEventListener(CHAMFER_INJECT_CAD_VALUE_EVENT, onInject);
    return () => window.removeEventListener(CHAMFER_INJECT_CAD_VALUE_EVENT, onInject);
  }, [open, isValuePermitted, allowZero, onPreviewChange]);

  if (!open) return null;

  const normalizedOpacity = Math.max(0.82, Math.min(0.98, settingsCardOpacity / 100));
  const surfaceBg = isLight
    ? `rgba(255, 255, 255, ${normalizedOpacity})`
    : isAmoled
      ? `rgba(4, 6, 11, ${Math.min(0.98, normalizedOpacity + 0.04)})`
      : `rgba(11, 16, 27, ${normalizedOpacity})`;

  const innerWellBg = isLight
    ? "rgba(241, 245, 249, 0.94)"
    : isAmoled
      ? "rgba(9, 13, 22, 0.96)"
      : "rgba(15, 23, 42, 0.88)";

  const keyBg = isLight
    ? "rgba(248, 250, 252, 0.96)"
    : isAmoled
      ? "rgba(10, 14, 24, 0.96)"
      : "rgba(15, 23, 42, 0.92)";

  const microGridLine = isLight
    ? "rgba(15, 23, 42, 0.04)"
    : "rgba(148, 163, 184, 0.055)";

  const textPrimary = isLight ? "#0F172A" : "#F8FAFC";
  const textMuted = isLight ? "#64748B" : "#94A3B8";
  const borderSubtle = isLight ? "rgba(15, 23, 42, 0.12)" : "rgba(148, 163, 184, 0.16)";

  const hasPresets = Boolean(presets && presets.length > 0);
  const keyButtonHeight = hasPresets ? 25 : 29;

  const panelNode = (
    <div
      data-testid="chamfer-direct-dim-editor"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        right: 52,
        top: "50%",
        transform: "translateY(-50%)",
        width: 228,
        maxHeight: "calc(100dvh - 96px)",
        padding: "8px 10px",
        borderRadius: 18,
        backgroundColor: surfaceBg,
        backgroundImage: `linear-gradient(to right, ${microGridLine} 1px, transparent 1px), linear-gradient(to bottom, ${microGridLine} 1px, transparent 1px)`,
        backgroundSize: "12px 12px",
        border: `1px solid ${accentHex}55`,
        boxShadow: isLight
          ? `0 14px 34px rgba(15, 23, 42, 0.16), 0 0 0 1px ${accentHex}22, inset 0 1px 0 rgba(255, 255, 255, 0.85)`
          : `0 16px 38px rgba(0, 0, 0, 0.68), 0 0 18px ${accentHex}22, inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        color: textPrimary,
      }}
      className="z-[90] flex flex-col gap-1 overflow-y-auto scrollbar-none select-none animate-in fade-in zoom-in-95 duration-150"
    >
      {/* 1. CABEÇALHO ENXUTO: TÍTULO CURTO COM TRUNCAMENTO + BADGE LIVRE / 🔒 FIXO + BOTÃO ✕ */}
      <div
        style={{ borderColor: borderSubtle }}
        className="flex shrink-0 items-center justify-between gap-1 border-b pb-1"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            style={{
              backgroundColor: accentHex,
              boxShadow: `0 0 8px ${accentHex}`,
            }}
            className="size-1.5 shrink-0 rounded-full"
          />
          <span
            style={{ color: accentHex }}
            className="truncate font-mono text-[9.5px] font-bold tracking-wider uppercase"
            title={label || "Medida CAD"}
          >
            {label || "Medida CAD"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="numpad-coord-mode-toggle"
            onClick={() => {
              triggerHaptic("selection");
              const next =
                ReferenceService.getCoordinateInputMode() === "anchor" ? "world" : "anchor";
              ReferenceService.setCoordinateInputMode(next);
            }}
            style={
              ReferenceService.getActive() &&
              ReferenceService.getCoordinateInputMode() === "anchor"
                ? {
                    backgroundColor: `${accentHex}22`,
                    borderColor: `${accentHex}66`,
                    color: accentHex,
                  }
                : {
                    backgroundColor: innerWellBg,
                    borderColor: borderSubtle,
                    color: textMuted,
                  }
            }
            className="rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase leading-none cursor-pointer"
            title="Alternar referencial entre Mundo (X, Y) e Âncora ativa (X', Y')"
          >
            {ReferenceService.getActive() &&
            ReferenceService.getCoordinateInputMode() === "anchor"
              ? `ÂNCORA ${ReferenceService.getActive()!.id}`
              : "MUNDO"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: innerWellBg,
              borderColor: borderSubtle,
              color: textMuted,
            }}
            className="flex size-5 items-center justify-center rounded-md border hover:opacity-90 transition-opacity cursor-pointer"
            title="Cancelar"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* 2. VISOR INTEGRADO (HEIGHT: 42PX): BOTÃO '-' À ESQUERDA, VALOR NO CENTRO + ATUAL ABAIXO, BOTÃO '+' À DIREITA */}
      <div
        role="spinbutton"
        aria-label={label}
        aria-valuenow={parseNormalized(displayStr) ?? currentValue}
        style={{
          height: hasPresets ? 38 : 42,
          backgroundColor: innerWellBg,
          borderColor: errorMsg ? "#EF4444" : `${accentHex}88`,
          boxShadow: errorMsg ? "none" : `inset 0 0 12px ${accentHex}14`,
        }}
        className="flex shrink-0 items-center justify-between rounded-xl border px-2 transition-colors"
      >
        <button
          type="button"
          data-testid="cad-keypad-minus-btn"
          {...minusHoldProps}
          style={{
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: textPrimary,
          }}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border active:scale-92 transition-transform cursor-pointer select-none"
          title={`-${stepMm} ${unit} (segure para acelerar)`}
        >
          <Minus className="size-3.5" />
        </button>

        <div className="flex min-w-0 flex-col items-center justify-center px-1.5 leading-none">
          <div className="flex items-baseline gap-1">
            <span
              data-testid="cad-keypad-display"
              style={{ color: freshEntry ? accentHex : textPrimary }}
              className="font-mono text-[15px] font-extrabold tracking-tight tabular-nums"
            >
              {displayStr}
            </span>
            {unit && (
              <span style={{ color: textMuted }} className="font-mono text-[9.5px] font-semibold">
                {unit}
              </span>
            )}
          </div>
          <span style={{ color: textMuted }} className="mt-0.5 font-mono text-[8px] tabular-nums">
            Atual: {String(Number((Number.isFinite(currentValue) ? currentValue : 0).toFixed(2))).replace(".", ",")}{" "}
            {unit}
          </span>
        </div>

        <button
          type="button"
          data-testid="cad-keypad-plus-btn"
          {...plusHoldProps}
          style={{
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: textPrimary,
          }}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border active:scale-92 transition-transform cursor-pointer select-none"
          title={`+${stepMm} ${unit} (segure para acelerar)`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* MENSAGEM DE VALIDAÇÃO COMPACTA */}
      {errorMsg && (
        <div className="shrink-0 rounded-lg border border-red-500/50 bg-red-500/15 px-2 py-0.5 font-mono text-[8.5px] text-red-400 leading-tight">
          {errorMsg}
        </div>
      )}

      {/* ATALHOS RÁPIDOS SOB DEMANDA EM LINHA COMPACTA (QUANDO DISPONÍVEIS) */}
      {presets && presets.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
          {presets.map((p) => {
            const curNum = parseNormalized(displayStr) ?? currentValue;
            const isActive = Math.abs(curNum - p.value) < 1e-3;
            return (
              <button
                key={`preset-${p.label}-${p.value}`}
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  const formatted = String(p.value).replace(".", ",");
                  setDisplayStr(formatted);
                  setFreshEntry(false);
                  setErrorMsg(null);
                  onPreviewChange?.(p.value);
                }}
                style={
                  isActive
                    ? {
                        backgroundColor: accentHex,
                        color: accentContrast,
                        borderColor: accentHex,
                      }
                    : {
                        backgroundColor: keyBg,
                        borderColor: borderSubtle,
                        color: textPrimary,
                      }
                }
                className="shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[8px] font-bold transition-all active:scale-95 cursor-pointer"
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. PÍLULAS RÁPIDAS DE INCREMENTO (±0,1 | ±1 | ±10 — HEIGHT: 26PX) */}
      <div
        style={{
          height: hasPresets ? 24 : 26,
          backgroundColor: innerWellBg,
          borderColor: borderSubtle,
        }}
        className="grid shrink-0 grid-cols-3 gap-0.5 rounded-full border p-0.5"
      >
        {([0.1, 1, 10] as StepOption[]).map((s) => {
          const active = stepMm === s;
          return (
            <button
              key={`step-${s}`}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setStepMm(s);
              }}
              style={
                active
                  ? {
                      backgroundColor: accentHex,
                      color: accentContrast,
                      boxShadow: `0 1px 6px ${accentHex}55`,
                    }
                  : {
                      color: textMuted,
                    }
              }
              className="flex items-center justify-center rounded-full font-mono text-[9px] font-bold leading-none transition-all cursor-pointer"
            >
              ±{String(s).replace(".", ",")} {unit}
            </button>
          );
        })}
      </div>

      {/* 4. GRADE NUMÉRICA COMPACTA (4x4, HEIGHT: 32PX, GAP: 5PX) */}
      <div style={{ gap: hasPresets ? 4 : 5 }} className="grid shrink-0 grid-cols-4 font-mono">
        {["7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleDigit(d)}
            style={{
              height: keyButtonHeight,
              backgroundColor: keyBg,
              borderColor: borderSubtle,
              color: textPrimary,
            }}
            className="rounded-lg border text-[11.5px] font-bold active:scale-95 transition-transform cursor-pointer"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={handleBackspace}
          style={{
            height: keyButtonHeight,
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: accentHex,
          }}
          className="flex items-center justify-center rounded-lg border text-xs font-bold active:scale-95 transition-transform cursor-pointer"
          title="Apagar último dígito (⌫)"
        >
          <Delete className="size-3.5" />
        </button>

        {["4", "5", "6"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleDigit(d)}
            style={{
              height: keyButtonHeight,
              backgroundColor: keyBg,
              borderColor: borderSubtle,
              color: textPrimary,
            }}
            className="rounded-lg border text-[11.5px] font-bold active:scale-95 transition-transform cursor-pointer"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={handleClear}
          style={{
            height: keyButtonHeight,
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: "#FB7185",
          }}
          className="flex items-center justify-center rounded-lg border text-[10.5px] font-bold active:scale-95 transition-transform cursor-pointer"
          title="Limpar entrada (C)"
        >
          C
        </button>

        {["1", "2", "3"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleDigit(d)}
            style={{
              height: keyButtonHeight,
              backgroundColor: keyBg,
              borderColor: borderSubtle,
              color: textPrimary,
            }}
            className="rounded-lg border text-[11.5px] font-bold active:scale-95 transition-transform cursor-pointer"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={handleToggleSign}
          style={{
            height: keyButtonHeight,
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: allowNegative ? textPrimary : textMuted,
            opacity: allowNegative ? 1 : 0.45,
          }}
          className="flex items-center justify-center rounded-lg border text-xs font-bold active:scale-95 transition-transform cursor-pointer"
          title="Inverter sinal (±)"
        >
          ±
        </button>

        <button
          type="button"
          onClick={() => handleDigit("0")}
          style={{
            height: keyButtonHeight,
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: textPrimary,
          }}
          className="col-span-2 rounded-lg border text-[11.5px] font-bold active:scale-95 transition-transform cursor-pointer"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleDecimal}
          style={{
            height: keyButtonHeight,
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: accentHex,
          }}
          className="rounded-lg border text-sm font-bold active:scale-95 transition-transform cursor-pointer"
          title="Separador decimal (,)"
        >
          ,
        </button>
        {allowInvert && onInvertSide ? (
          <button
            type="button"
            onClick={onInvertSide}
            style={{
              height: keyButtonHeight,
              backgroundColor: `${accentHex}22`,
              borderColor: `${accentHex}66`,
              color: accentHex,
            }}
            className="flex items-center justify-center rounded-lg border active:scale-95 transition-transform cursor-pointer"
            title="Inverter Lado"
          >
            <ArrowLeftRight className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              const formatted = formatInitial(currentValue);
              setDisplayStr(formatted);
              setFreshEntry(true);
              setErrorMsg(null);
              onPreviewChange?.(currentValue);
            }}
            style={{
              height: keyButtonHeight,
              backgroundColor: keyBg,
              borderColor: borderSubtle,
              color: textMuted,
            }}
            className="flex items-center justify-center rounded-lg border active:scale-95 transition-transform cursor-pointer"
            title="Restaurar valor original"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </div>

      {/* 5. RODAPÉ UNIFICADO: '✕ CANCELAR' + '✓ CONFIRMAR' (SEM CADEADO/TRAVA) */}
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 28,
            backgroundColor: keyBg,
            borderColor: borderSubtle,
            color: textPrimary,
          }}
          className="flex w-1/2 items-center justify-center gap-1 rounded-xl border px-2 font-mono text-[9px] font-bold active:scale-95 transition-transform cursor-pointer"
          title="Cancelar edição"
        >
          <X className="size-3 shrink-0" />
          <span>Cancelar</span>
        </button>

        <button
          type="button"
          onClick={() => handleConfirm(false)}
          style={{
            height: 28,
            backgroundColor: accentHex,
            color: accentContrast,
            boxShadow: `0 2px 10px ${accentHex}44`,
          }}
          className="flex w-1/2 items-center justify-center gap-1 rounded-xl px-2 font-mono text-[9px] font-extrabold active:scale-95 transition-transform cursor-pointer"
          title="Confirmar medida"
        >
          <Check className="size-3 shrink-0 stroke-[2.8]" />
          <span>Confirmar</span>
        </button>
      </div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(panelNode, document.body);
  }
  return panelNode;
}

