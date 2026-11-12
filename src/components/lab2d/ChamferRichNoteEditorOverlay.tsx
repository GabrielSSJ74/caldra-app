/**
 * CALDRA CHAMFER CAD 2D — EDITOR DE ANOTAÇÕES TÉCNICAS E FÓRMULAS NATIVAS (`TEXTO / NOTA`)
 *
 * Recursos:
 *  - Edição rica por palavra / trecho selecionado (`Bold`, `Italic`, `Underline`, `Strikethrough`,
 *    `Grifado / Marca-Texto` em 4 cores, `Sobrescrito X²` e `Subscrito X₂`).
 *  - 4 Alinhamentos Reais no Canvas 2D: `Esquerda`, `Centralizado`, `Direita` e `Justificado Real`.
 *  - Barra de Símbolos de Engenharia (`Ø ± ° √ ² ³ π Δ → × ÷ ≤ ≥ ≈`) + `[ = Calcular Expressão ]`
 *    integrado ao motor seguro da Mini-Calculadora.
 *  - Alças Visuais no Canvas (`ChamferRichNoteCanvasHandles`) para redimensionar `widthMm` com reflow
 *    em tempo real, rotacionar, editar (duplo toque), duplicar e excluir.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Superscript,
  Subscript,
  Calculator,
  Check,
  X,
  Edit3,
  Copy,
  Trash2,
  RotateCw,
} from "lucide-react";
import {
  ENGINEERING_FORMULA_SYMBOLS,
  RICH_NOTE_CATEGORIES,
  RICH_NOTE_HIGHLIGHT_SWATCHES,
  applyFormattingToRunRange,
  getEntityRichNoteSpec,
  isRangeUniformlyFormatted,
  layoutRichNoteMm,
  noteLocalToWorldMm,
  runsToPlainText,
  syncPlainTextEditIntoRuns,
  type HighlightSwatchColor,
  type NoteCategoryLayer,
  type NoteTextAlign,
  type RichNoteSpec,
} from "@/lib/lab2d/chamferRichNoteEngine";
import {
  evaluateInlineNoteFormulaText,
  type AngleMode,
} from "@/lib/lab2d/chamferBenchCalculator";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import { toast } from "@/lib/lab2d/chamferNotify";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export interface RichNoteEditorSession {
  mode: "create" | "edit";
  entityId?: string;
  anchorWorld: Vec2;
  layer: string;
  initialSpec: RichNoteSpec;
}

export interface ChamferRichNoteEditorOverlayProps {
  session: RichNoteEditorSession | null;
  angleMode?: AngleMode;
  ansValue?: number;
  isDark?: boolean;
  onCancel: () => void;
  onCommit: (spec: RichNoteSpec) => void;
}

export const ChamferRichNoteEditorOverlay: React.FC<ChamferRichNoteEditorOverlayProps> = ({
  session,
  angleMode = "DEG",
  ansValue = 0,
  isDark = true,
  onCancel,
  onCommit,
}) => {
  const [spec, setSpec] = useState<RichNoteSpec>(() =>
    session
      ? session.initialSpec
      : {
          widthMm: 96,
          fontSizeMm: 6,
          rotationDeg: 0,
          textAlign: "left",
          lineHeight: 1.35,
          categoryLayer: "Observação",
          boxStyle: "card",
          isFormula: false,
          runs: [{ text: "" }],
        },
  );
  const [selRange, setSelRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!session) return;
    setSpec(session.initialSpec);
    const fullLen = runsToPlainText(session.initialSpec.runs).length;
    setSelRange({ start: 0, end: fullLen });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(fullLen, fullLen);
      }
    });
  }, [session]);

  const plainText = runsToPlainText(spec.runs);

  const syncSelectionFromDom = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setSelRange({
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? 0,
    });
  }, []);

  // Se não houver seleção explícita, formata a palavra sob o cursor ou a nota inteira
  const resolveTargetRange = useCallback((): { start: number; end: number } => {
    const el = textareaRef.current;
    const s = el ? el.selectionStart : selRange.start;
    const e = el ? el.selectionEnd : selRange.end;
    if (s !== e) return { start: Math.min(s, e), end: Math.max(s, e) };
    if (!plainText.length) return { start: 0, end: 0 };

    // Expande para a palavra atual sob o cursor se houver palavra; senão toda a nota
    let ws = s;
    let we = s;
    while (ws > 0 && !/\s/.test(plainText[ws - 1]!)) ws--;
    while (we < plainText.length && !/\s/.test(plainText[we]!)) we++;
    if (we > ws) return { start: ws, end: we };
    return { start: 0, end: plainText.length };
  }, [plainText, selRange]);

  const toggleRunProperty = (
    prop: "bold" | "italic" | "underline" | "strikethrough",
  ) => {
    triggerHaptic("selection");
    const { start, end } = resolveTargetRange();
    if (end <= start) return;
    setSpec((prev) => {
      const active = isRangeUniformlyFormatted(prev.runs, start, end, (r) => Boolean(r[prop]));
      return {
        ...prev,
        runs: applyFormattingToRunRange(prev.runs, start, end, { [prop]: !active }),
      };
    });
  };

  const toggleScriptMode = (mode: "sup" | "sub") => {
    triggerHaptic("selection");
    const { start, end } = resolveTargetRange();
    if (end <= start) return;
    setSpec((prev) => {
      const active = isRangeUniformlyFormatted(prev.runs, start, end, (r) => r.script === mode);
      return {
        ...prev,
        runs: applyFormattingToRunRange(prev.runs, start, end, {
          script: active ? "normal" : mode,
        }),
      };
    });
  };

  const applyHighlightSwatch = (hex: HighlightSwatchColor | null) => {
    triggerHaptic("selection");
    const { start, end } = resolveTargetRange();
    if (end <= start) return;
    setSpec((prev) => {
      const alreadySame =
        hex !== null &&
        isRangeUniformlyFormatted(prev.runs, start, end, (r) => r.highlightColor === hex);
      return {
        ...prev,
        runs: applyFormattingToRunRange(prev.runs, start, end, {
          highlightColor: alreadySame ? null : hex,
        }),
      };
    });
  };

  const insertSymbolAtCursor = (sym: string) => {
    triggerHaptic("selection");
    const el = textareaRef.current;
    const s = el ? el.selectionStart : plainText.length;
    const e = el ? el.selectionEnd : plainText.length;
    const nextText = plainText.slice(0, s) + sym + plainText.slice(e);
    setSpec((prev) => ({
      ...prev,
      runs: syncPlainTextEditIntoRuns(prev.runs, nextText),
    }));
    const nextCaret = s + sym.length;
    setSelRange({ start: nextCaret, end: nextCaret });
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleEvaluateFormula = () => {
    triggerHaptic("selection");
    const res = evaluateInlineNoteFormulaText(plainText, angleMode, ansValue);
    if (!res) {
      toast.error("Digite uma expressão matemática válida (ex: C = 40 * π ou hypot(300;400)).");
      return;
    }
    setSpec((prev) => ({
      ...prev,
      isFormula: true,
      categoryLayer: prev.categoryLayer === "Observação" ? "Fórmula" : prev.categoryLayer,
      runs: syncPlainTextEditIntoRuns(prev.runs, res.updatedText),
    }));
    toast.success(`Fórmula calculada: ${res.formattedValue} mm`);
  };

  const handleSubmit = () => {
    const trimmed = plainText.trim();
    if (!trimmed) {
      toast.error("Digite o conteúdo da anotação técnica antes de confirmar.");
      return;
    }
    triggerHaptic("success");
    onCommit(spec);
  };

  if (!session) return null;

  const isBoldActive = isRangeUniformlyFormatted(
    spec.runs,
    selRange.start,
    selRange.end,
    (r) => Boolean(r.bold),
  );
  const isItalicActive = isRangeUniformlyFormatted(
    spec.runs,
    selRange.start,
    selRange.end,
    (r) => Boolean(r.italic),
  );
  const isUnderlineActive = isRangeUniformlyFormatted(
    spec.runs,
    selRange.start,
    selRange.end,
    (r) => Boolean(r.underline),
  );
  const isStrikeActive = isRangeUniformlyFormatted(
    spec.runs,
    selRange.start,
    selRange.end,
    (r) => Boolean(r.strikethrough),
  );

  const preventBlur = (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
  };

  const modal = (
    <div
      data-testid="chamfer-rich-note-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 p-3"
    >
      <div
        role="dialog"
        aria-label="Editor de Anotação Técnica e Fórmulas"
        className={cn(
          "flex max-h-[88dvh] w-[min(95vw,32rem)] flex-col gap-2.5 overflow-y-auto rounded-2xl border p-3.5 shadow-2xl scrollbar-none",
          isDark
            ? "border-slate-700 bg-[#0B111E]/98 text-slate-100"
            : "border-slate-300 bg-white text-slate-900",
        )}
      >
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-extrabold text-sky-400 uppercase">
              {session.mode === "edit" ? "Editar Nota" : "Nova Nota / Fórmula"}
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              X:{session.anchorWorld.x.toFixed(1)} Y:{session.anchorWorld.y.toFixed(1)} mm
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar editor de nota"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* LINHA 1: ALINHAMENTOS (ESQUERDA, CENTRO, DIREITA, JUSTIFICADO REAL) + ESTILO DE CAIXA */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div
            role="group"
            aria-label="Alinhamento de parágrafo"
            className={cn(
              "flex items-center gap-0.5 rounded-xl border p-0.5",
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100",
            )}
          >
            {(
              [
                { id: "left", icon: AlignLeft, label: "Alinhar à Esquerda" },
                { id: "center", icon: AlignCenter, label: "Centralizar" },
                { id: "right", icon: AlignRight, label: "Alinhar à Direita" },
                { id: "justify", icon: AlignJustify, label: "Justificado Real" },
              ] as { id: NoteTextAlign; icon: typeof AlignLeft; label: string }[]
            ).map((al) => {
              const Icon = al.icon;
              const active = spec.textAlign === al.id;
              return (
                <button
                  key={al.id}
                  type="button"
                  data-testid={`rich-note-align-${al.id}`}
                  aria-label={al.label}
                  title={al.label}
                  onPointerDown={preventBlur}
                  onClick={() => setSpec((p) => ({ ...p, textAlign: al.id }))}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[9.5px] font-bold transition-colors cursor-pointer",
                    active
                      ? "bg-sky-500 text-slate-950"
                      : isDark
                        ? "text-slate-300 hover:bg-slate-800"
                        : "text-slate-700 hover:bg-white",
                  )}
                >
                  <Icon className="size-3.5" />
                  {al.id === "justify" && <span>Justif.</span>}
                </button>
              );
            })}
          </div>

          {/* CATEGORIA E ESTILO DE MOLDURA */}
          <div className="flex items-center gap-1">
            <select
              aria-label="Categoria da anotação"
              value={spec.categoryLayer}
              onChange={(e) =>
                setSpec((p) => ({
                  ...p,
                  categoryLayer: e.target.value as NoteCategoryLayer,
                  isFormula: e.target.value === "Fórmula" ? true : p.isFormula,
                }))
              }
              className={cn(
                "rounded-xl border px-2 py-1 font-mono text-[10px] font-bold outline-none cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200"
                  : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              {RICH_NOTE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="rich-note-box-style-btn"
              onClick={() =>
                setSpec((p) => ({ ...p, boxStyle: p.boxStyle === "card" ? "none" : "card" }))
              }
              className={cn(
                "rounded-xl border px-2 py-1 font-mono text-[10px] font-bold cursor-pointer",
                spec.boxStyle === "card"
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-300"
                  : isDark
                    ? "border-slate-700 bg-slate-900 text-slate-400"
                    : "border-slate-300 bg-slate-100 text-slate-600",
              )}
            >
              {spec.boxStyle === "card" ? "Card" : "Livre"}
            </button>
          </div>
        </div>

        {/* LINHA 2: FORMATAÇÃO RICA POR SELEÇÃO / PALAVRA (B, I, U, S̶, X², X₂ + MARCA-TEXTO) */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="rich-note-btn-bold"
              aria-label="Negrito na seleção"
              title="Negrito (aplica na palavra/trecho selecionado)"
              onPointerDown={preventBlur}
              onClick={() => toggleRunProperty("bold")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border cursor-pointer",
                isBoldActive
                  ? "border-sky-400 bg-sky-500 text-slate-950"
                  : isDark
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              <Bold className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="rich-note-btn-italic"
              aria-label="Itálico na seleção"
              title="Itálico"
              onPointerDown={preventBlur}
              onClick={() => toggleRunProperty("italic")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border cursor-pointer",
                isItalicActive
                  ? "border-sky-400 bg-sky-500 text-slate-950"
                  : isDark
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              <Italic className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="rich-note-btn-underline"
              aria-label="Sublinhado na seleção"
              title="Sublinhado"
              onPointerDown={preventBlur}
              onClick={() => toggleRunProperty("underline")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border cursor-pointer",
                isUnderlineActive
                  ? "border-sky-400 bg-sky-500 text-slate-950"
                  : isDark
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              <Underline className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="rich-note-btn-strike"
              aria-label="Tachado na seleção"
              title="Tachado"
              onPointerDown={preventBlur}
              onClick={() => toggleRunProperty("strikethrough")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border cursor-pointer",
                isStrikeActive
                  ? "border-sky-400 bg-sky-500 text-slate-950"
                  : isDark
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              <Strikethrough className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Sobrescrito"
              title="Sobrescrito (X²)"
              onPointerDown={preventBlur}
              onClick={() => toggleScriptMode("sup")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200"
                  : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              <Superscript className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Subscrito"
              title="Subscrito (X₂)"
              onPointerDown={preventBlur}
              onClick={() => toggleScriptMode("sub")}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200"
                  : "border-slate-300 bg-slate-50 text-slate-800",
              )}
            >
              <Subscript className="size-3.5" />
            </button>
          </div>

          {/* GRIFADO / MARCA-TEXTO EM 4 CORES + LIMPAR */}
          <div className="flex items-center gap-1">
            <Highlighter className="size-3.5 text-amber-400" />
            {RICH_NOTE_HIGHLIGHT_SWATCHES.map((sw) => (
              <button
                key={sw.hex}
                type="button"
                data-testid={`rich-note-hl-${sw.hex.slice(1).toLowerCase()}`}
                aria-label={`Grifar ${sw.label}`}
                title={`Grifar seleção (${sw.label})`}
                onPointerDown={preventBlur}
                onClick={() => applyHighlightSwatch(sw.hex)}
                style={{ backgroundColor: sw.hex }}
                className="size-5 rounded-full border border-black/30 shadow-2xs transition-transform active:scale-90 cursor-pointer"
              />
            ))}
            <button
              type="button"
              aria-label="Limpar grifo"
              title="Remover marca-texto da seleção"
              onPointerDown={preventBlur}
              onClick={() => applyHighlightSwatch(null)}
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] font-bold cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-400"
                  : "border-slate-300 bg-slate-100 text-slate-600",
              )}
            >
              Sem Grifo
            </button>
          </div>
        </div>

        {/* LINHA 3: BARRA DE SÍMBOLOS DE ENGENHARIA + BOTÃO [= CALCULAR EXPRESSÃO] */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {ENGINEERING_FORMULA_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onPointerDown={preventBlur}
                onClick={() => insertSymbolAtCursor(sym)}
                className={cn(
                  "flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-md border px-1.5 font-mono text-xs font-bold cursor-pointer",
                  isDark
                    ? "border-slate-700 bg-slate-900 text-sky-300 hover:bg-slate-800"
                    : "border-slate-200 bg-slate-50 text-sky-800 hover:bg-slate-100",
                )}
              >
                {sym}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="rich-note-eval-formula-btn"
            onPointerDown={preventBlur}
            onClick={handleEvaluateFormula}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border py-1.5 font-mono text-[10.5px] font-extrabold transition-colors cursor-pointer",
              isDark
                ? "border-amber-500/45 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                : "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
            )}
          >
            <Calculator className="size-3.5" />
            <span>= Calcular Expressão na Nota (ex: C = 40 * π)</span>
          </button>
        </div>

        {/* ÁREA DE TEXTO MULTI-LINHA + PRÉVIA RICA POR PALAVRA */}
        <textarea
          ref={textareaRef}
          data-testid="rich-note-textarea"
          rows={4}
          value={plainText}
          onChange={(e) => {
            const nextTxt = e.target.value;
            setSpec((prev) => ({
              ...prev,
              runs: syncPlainTextEditIntoRuns(prev.runs, nextTxt),
            }));
            syncSelectionFromDom();
          }}
          onSelect={syncSelectionFromDom}
          onKeyUp={syncSelectionFromDom}
          onPointerUp={syncSelectionFromDom}
          onClick={syncSelectionFromDom}
          placeholder="Digite a observação de caldeiraria, dobra, solda ou fórmula (ex: C = 40 * π)..."
          style={{ textAlign: spec.textAlign }}
          className={cn(
            "w-full resize-y rounded-xl border p-2.5 font-sans text-sm leading-relaxed outline-none",
            isDark
              ? "border-slate-700 bg-slate-950 text-slate-100 focus:border-sky-400"
              : "border-slate-300 bg-slate-50 text-slate-900 focus:border-sky-500",
          )}
        />

        {/* PRÉVIA RICA AO VIVO (MOSTRA NEGRITO, GRIFO, SUBLINHADO E TACHADO POR PALAVRA) */}
        {plainText.trim().length > 0 && (
          <div
            data-testid="rich-note-live-preview"
            style={{ textAlign: spec.textAlign }}
            className={cn(
              "max-h-24 overflow-y-auto rounded-xl border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
              isDark
                ? "border-slate-800 bg-slate-900/75 text-slate-100"
                : "border-slate-200 bg-slate-50 text-slate-900",
            )}
          >
            {spec.runs.map((r, idx) => (
              <span
                key={idx}
                style={{
                  fontWeight: r.bold ? 700 : 400,
                  fontStyle: r.italic ? "italic" : "normal",
                  textDecoration:
                    [r.underline ? "underline" : "", r.strikethrough ? "line-through" : ""]
                      .filter(Boolean)
                      .join(" ") || undefined,
                  backgroundColor: r.highlightColor ? `${r.highlightColor}66` : undefined,
                  borderRadius: r.highlightColor ? 3 : undefined,
                  padding: r.highlightColor ? "0 2px" : undefined,
                  verticalAlign:
                    r.script === "sup" ? "super" : r.script === "sub" ? "sub" : undefined,
                  fontSize: r.script && r.script !== "normal" ? "0.75em" : undefined,
                }}
              >
                {r.text}
              </span>
            ))}
          </div>
        )}

        {/* PARÂMETROS DIMENSIONAIS EM MILÍMETROS (ALTURA DA FONTE, LARGURA DA CAIXA E ROTAÇÃO) */}
        <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
          <label className="flex flex-col gap-0.5">
            <span className="text-slate-400">Fonte (mm)</span>
            <input
              type="number"
              min={1.5}
              max={80}
              step={0.5}
              value={spec.fontSizeMm}
              onChange={(e) =>
                setSpec((p) => ({
                  ...p,
                  fontSizeMm: Math.max(1.5, Number(e.target.value) || 6),
                }))
              }
              className={cn(
                "rounded-lg border px-2 py-1 font-bold outline-none",
                isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-50",
              )}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-slate-400">Largura (mm)</span>
            <input
              type="number"
              min={20}
              max={1500}
              step={5}
              value={Math.round(spec.widthMm)}
              onChange={(e) =>
                setSpec((p) => ({
                  ...p,
                  widthMm: Math.max(20, Number(e.target.value) || 90),
                }))
              }
              className={cn(
                "rounded-lg border px-2 py-1 font-bold outline-none",
                isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-50",
              )}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-slate-400">Rotação (°)</span>
            <input
              type="number"
              min={-180}
              max={180}
              step={15}
              value={Math.round(spec.rotationDeg)}
              onChange={(e) =>
                setSpec((p) => ({
                  ...p,
                  rotationDeg: Number(e.target.value) || 0,
                }))
              }
              className={cn(
                "rounded-lg border px-2 py-1 font-bold outline-none",
                isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-50",
              )}
            />
          </label>
        </div>

        {/* RODAPÉ */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "flex-1 rounded-xl border py-2 font-mono text-xs font-bold cursor-pointer",
              isDark
                ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="rich-note-commit-btn"
            onClick={handleSubmit}
            className="flex flex-[1.5] items-center justify-center gap-1.5 rounded-xl bg-sky-500 py-2 font-mono text-xs font-extrabold text-slate-950 shadow-md hover:bg-sky-400 active:scale-[0.98] cursor-pointer"
          >
            <Check className="size-4 stroke-[2.6]" />
            <span>{session.mode === "edit" ? "Salvar Alterações" : "Inserir Nota no CAD"}</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(modal, document.body);
  }
  return modal;
};

/* ============================================================================
 * ALÇAS INTERATIVAS NO CANVAS PARA NOTA TÉCNICA SELECIONADA (LARGURA + ROTAÇÃO)
 * ============================================================================ */

export interface ChamferRichNoteCanvasHandlesProps {
  entity: Entity;
  view: { k: number; tx: number; ty: number };
  isDark?: boolean;
  onLivePreviewSpec: (entityId: string, nextSpec: RichNoteSpec, nextAnchor?: Vec2) => void;
  onCommitSpec: (entityId: string, nextSpec: RichNoteSpec, nextAnchor?: Vec2) => void;
  onOpenEditor: (entity: Entity) => void;
  onDuplicate: (entity: Entity) => void;
  onDelete: (entity: Entity) => void;
}

export const ChamferRichNoteCanvasHandles: React.FC<ChamferRichNoteCanvasHandlesProps> = ({
  entity,
  view,
  isDark = true,
  onLivePreviewSpec,
  onCommitSpec,
  onOpenEditor,
  onDuplicate,
  onDelete,
}) => {
  const spec = getEntityRichNoteSpec(entity);
  const dragStateRef = useRef<{
    kind: "right" | "left" | "rotate";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    initialSpec: RichNoteSpec;
    initialAnchor: Vec2;
    latestSpec: RichNoteSpec;
    latestAnchor: Vec2;
  } | null>(null);

  if (!spec || entity.type !== "text") return null;

  const layout = layoutRichNoteMm(spec);
  const toScreen = (localPt: Vec2) => {
    const wp = noteLocalToWorldMm(localPt, entity);
    return {
      x: wp.x * view.k + view.tx,
      y: wp.y * view.k + view.ty,
    };
  };

  const leftMid = toScreen({ x: 0, y: layout.heightMm / 2 });
  const rightMid = toScreen({ x: layout.widthMm, y: layout.heightMm / 2 });
  const topMid = toScreen({ x: layout.widthMm / 2, y: 0 });
  const rotHandlePos = {
    x: topMid.x + Math.sin((spec.rotationDeg * Math.PI) / 180) * 22,
    y: topMid.y - Math.cos((spec.rotationDeg * Math.PI) / 180) * 22,
  };

  const startHandleDrag = (
    kind: "right" | "left" | "rotate",
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const anchor = { x: entity.x, y: entity.y };
    dragStateRef.current = {
      kind,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialSpec: spec,
      initialAnchor: anchor,
      latestSpec: spec,
      latestAnchor: anchor,
    };
  };

  const moveHandleDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const safeK = Math.max(1e-4, view.k);
    const dxWorld = (e.clientX - st.startClientX) / safeK;
    const dyWorld = (e.clientY - st.startClientY) / safeK;
    const rad = (st.initialSpec.rotationDeg * Math.PI) / 180;
    const axisUx = Math.cos(rad);
    const axisUy = Math.sin(rad);
    const deltaAlongWidth = dxWorld * axisUx + dyWorld * axisUy;
    const minW = Math.max(20, st.initialSpec.fontSizeMm * 3.5);

    if (st.kind === "right") {
      const nextW = Math.max(minW, st.initialSpec.widthMm + deltaAlongWidth);
      const nextSpec = { ...st.initialSpec, widthMm: Number(nextW.toFixed(2)) };
      st.latestSpec = nextSpec;
      onLivePreviewSpec(entity.id, nextSpec, st.initialAnchor);
    } else if (st.kind === "left") {
      const clampedDelta = Math.min(st.initialSpec.widthMm - minW, deltaAlongWidth);
      const nextW = Math.max(minW, st.initialSpec.widthMm - clampedDelta);
      const nextAnchor = {
        x: st.initialAnchor.x + axisUx * clampedDelta,
        y: st.initialAnchor.y + axisUy * clampedDelta,
      };
      const nextSpec = { ...st.initialSpec, widthMm: Number(nextW.toFixed(2)) };
      st.latestSpec = nextSpec;
      st.latestAnchor = nextAnchor;
      onLivePreviewSpec(entity.id, nextSpec, nextAnchor);
    } else if (st.kind === "rotate") {
      const centerWorld = noteLocalToWorldMm(
        { x: layout.widthMm / 2, y: layout.heightMm / 2 },
        entity,
      );
      const centerScreen = {
        x: centerWorld.x * view.k + view.tx,
        y: centerWorld.y * view.k + view.ty,
      };
      const angRad = Math.atan2(e.clientY - centerScreen.y, e.clientX - centerScreen.x);
      const deg = Math.round((((angRad * 180) / Math.PI + 90 + 360) % 360) * 2) / 2;
      const normalizedDeg = deg > 180 ? deg - 360 : deg;
      const nextSpec = { ...st.initialSpec, rotationDeg: normalizedDeg };
      st.latestSpec = nextSpec;
      onLivePreviewSpec(entity.id, nextSpec, st.initialAnchor);
    }
  };

  const endHandleDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStateRef.current = null;
    onCommitSpec(entity.id, st.latestSpec, st.latestAnchor);
  };

  const cycleAlignQuick = () => {
    triggerHaptic("selection");
    const order: NoteTextAlign[] = ["left", "center", "right", "justify"];
    const nextAlign = order[(order.indexOf(spec.textAlign) + 1) % order.length]!;
    onCommitSpec(entity.id, { ...spec, textAlign: nextAlign }, { x: entity.x, y: entity.y });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden select-none">
      {/* Alça Lateral Esquerda (Largura com Reflow Ao Vivo) */}
      <button
        type="button"
        data-testid="rich-note-handle-left"
        aria-label="Ajustar largura esquerda da nota"
        title="Arraste para redimensionar a largura da nota (reflow automático)"
        onPointerDown={(e) => startHandleDrag("left", e)}
        onPointerMove={moveHandleDrag}
        onPointerUp={endHandleDrag}
        onPointerCancel={endHandleDrag}
        style={{ left: leftMid.x - 15, top: leftMid.y - 14 }}
        className="pointer-events-auto absolute h-7 w-3.5 cursor-ew-resize rounded-full border border-white bg-sky-500 shadow-md touch-none"
      />

      {/* Alça Lateral Direita (Largura com Reflow Ao Vivo) */}
      <button
        type="button"
        data-testid="rich-note-handle-right"
        aria-label="Ajustar largura direita da nota"
        title="Arraste para redimensionar a largura da nota (reflow automático)"
        onPointerDown={(e) => startHandleDrag("right", e)}
        onPointerMove={moveHandleDrag}
        onPointerUp={endHandleDrag}
        onPointerCancel={endHandleDrag}
        style={{ left: rightMid.x + 1, top: rightMid.y - 14 }}
        className="pointer-events-auto absolute h-7 w-3.5 cursor-ew-resize rounded-full border border-white bg-sky-500 shadow-md touch-none"
      />

      {/* Alça Superior de Rotação */}
      <button
        type="button"
        data-testid="rich-note-handle-rotate"
        aria-label="Rotacionar nota técnica"
        title="Arraste para girar a anotação"
        onPointerDown={(e) => startHandleDrag("rotate", e)}
        onPointerMove={moveHandleDrag}
        onPointerUp={endHandleDrag}
        onPointerCancel={endHandleDrag}
        style={{ left: rotHandlePos.x - 11, top: rotHandlePos.y - 11 }}
        className="pointer-events-auto absolute flex size-[22px] cursor-grab items-center justify-center rounded-full border border-white bg-amber-400 text-slate-950 shadow-md touch-none"
      >
        <RotateCw className="size-3" />
      </button>

      {/* Pílula Contextual Rápida da Nota Selecionada */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          left: Math.max(12, topMid.x - 108),
          top: Math.max(8, rotHandlePos.y - 40),
        }}
        className={cn(
          "pointer-events-auto absolute flex items-center gap-1 rounded-xl border px-1.5 py-1 font-mono text-[9.5px] font-bold shadow-lg backdrop-blur-md",
          isDark
            ? "border-slate-700 bg-slate-900/95 text-slate-100"
            : "border-slate-300 bg-white/95 text-slate-900",
        )}
      >
        <button
          type="button"
          data-testid="rich-note-quick-edit"
          onClick={() => onOpenEditor(entity)}
          className="flex items-center gap-1 rounded-lg bg-sky-500 px-2 py-0.5 text-slate-950 font-extrabold cursor-pointer"
        >
          <Edit3 className="size-3" />
          <span>Editar</span>
        </button>
        <button
          type="button"
          onClick={cycleAlignQuick}
          title={`Alinhamento atual: ${spec.textAlign}`}
          className="rounded-lg border border-slate-700/60 px-1.5 py-0.5 uppercase cursor-pointer"
        >
          {spec.textAlign === "justify" ? "JUST" : spec.textAlign.toUpperCase()}
        </button>
        <button
          type="button"
          onClick={() => onDuplicate(entity)}
          aria-label="Duplicar nota"
          title="Duplicar nota"
          className="rounded-lg p-1 hover:bg-slate-800/60 cursor-pointer"
        >
          <Copy className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entity)}
          aria-label="Excluir nota"
          title="Excluir nota"
          className="rounded-lg p-1 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
};
