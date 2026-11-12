/**
 * CALDRA CHAMFER CAD 2D — SISTEMA DE ANOTAÇÕES TÉCNICAS E EDITOR DE FÓRMULAS NATIVAS
 *
 * Diretrizes Arquiteturais:
 *  - Entidade vetorial 100% nativa em milímetros (`mm`) no mundo do projeto (`type: "text"` com `params.richNote`),
 *    escalando, girando e movendo junto com o desenho sem usar HTML estático permanente.
 *  - 4 Alinhamentos Reais no Canvas 2D e SVG:
 *      • Esquerda (`left`)
 *      • Centralizado (`center`)
 *      • Direita (`right`)
 *      • Justificado Real (`justify`): calcula matematicamente a sobra de cada linha quebrada dentro de `widthMm`
 *        e distribui o espaçamento entre palavras até preencher de borda a borda, mantendo a última linha do
 *        parágrafo alinhada à esquerda.
 *  - Formatação Rica por Palavra / Seleção (`runs`): Negrito, Itálico, Sublinhado, Tachado, Grifado / Marca-Texto
 *    (`#FACC15`, `#38BDF8`, `#4ADE80`, `#FB7185`) e Sobrescrito / Subscrito (`X²` / `X₂`).
 *  - Hit-Test Inteligente nos Glifos Reais: clicar no espaço em branco vazio dentro da caixa de uma nota NÃO captura
 *    o clique caso haja uma peça/linha CAD passando por baixo; só acerta nos glifos, grifos ou borda do card!
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Box, Entity } from "@/lib/lab2d/core";
import { techStyle } from "@/lib/lab2d/technical";

export type NoteTextAlign = "left" | "center" | "right" | "justify";

export type NoteCategoryLayer =
  | "Observação"
  | "Fabricação"
  | "Montagem"
  | "Fórmula"
  | "Material"
  | "Geral";

export type HighlightSwatchColor = "#FACC15" | "#38BDF8" | "#4ADE80" | "#FB7185";

export type RichScriptMode = "normal" | "sup" | "sub";

export interface RichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  highlightColor?: HighlightSwatchColor | null;
  textColor?: string | null;
  script?: RichScriptMode;
}

export interface RichNoteSpec {
  widthMm: number;
  fontSizeMm: number;
  rotationDeg: number;
  textAlign: NoteTextAlign;
  lineHeight: number;
  categoryLayer: NoteCategoryLayer;
  boxStyle: "none" | "card";
  isFormula: boolean;
  runs: RichTextRun[];
}

export const RICH_NOTE_HIGHLIGHT_SWATCHES: readonly {
  hex: HighlightSwatchColor;
  label: string;
}[] = [
  { hex: "#FACC15", label: "Amarelo Técnico" },
  { hex: "#38BDF8", label: "Azul Ciano" },
  { hex: "#4ADE80", label: "Verde Aprovado" },
  { hex: "#FB7185", label: "Alerta / Revisão" },
] as const;

export const RICH_NOTE_CATEGORIES: readonly NoteCategoryLayer[] = [
  "Observação",
  "Fabricação",
  "Montagem",
  "Fórmula",
  "Material",
  "Geral",
] as const;

export const ENGINEERING_FORMULA_SYMBOLS: readonly string[] = [
  "Ø",
  "±",
  "°",
  "√",
  "²",
  "³",
  "π",
  "Δ",
  "→",
  "×",
  "÷",
  "≤",
  "≥",
  "≈",
] as const;

/* ============================================================================
 * 1. OPERAÇÕES DE FORMATAÇÃO RICA POR SELEÇÃO / PALAVRA (`RichTextRun[]`)
 * ============================================================================ */

export function runsToPlainText(runs: readonly RichTextRun[]): string {
  return runs.map((r) => r.text).join("");
}

function areRunStylesEqual(a: RichTextRun, b: RichTextRun): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strikethrough) === Boolean(b.strikethrough) &&
    (a.highlightColor ?? null) === (b.highlightColor ?? null) &&
    (a.textColor ?? null) === (b.textColor ?? null) &&
    (a.script ?? "normal") === (b.script ?? "normal")
  );
}

export function normalizeRichRuns(runs: readonly RichTextRun[]): RichTextRun[] {
  const merged: RichTextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && areRunStylesEqual(prev, r)) {
      prev.text += r.text;
    } else {
      merged.push({
        text: r.text,
        ...(r.bold ? { bold: true } : {}),
        ...(r.italic ? { italic: true } : {}),
        ...(r.underline ? { underline: true } : {}),
        ...(r.strikethrough ? { strikethrough: true } : {}),
        ...(r.highlightColor ? { highlightColor: r.highlightColor } : {}),
        ...(r.textColor ? { textColor: r.textColor } : {}),
        ...(r.script && r.script !== "normal" ? { script: r.script } : {}),
      });
    }
  }
  return merged.length > 0 ? merged : [{ text: "" }];
}

/**
 * Aplica ou alterna formatação exclusivamente no intervalo `[startOffset, endOffset)`
 * (uma única palavra, trecho selecionado ou nota inteira) sem vazar para palavras vizinhas.
 */
export function applyFormattingToRunRange(
  runs: readonly RichTextRun[],
  startOffset: number,
  endOffset: number,
  patch: Partial<Omit<RichTextRun, "text">>,
): RichTextRun[] {
  const fullLen = runsToPlainText(runs).length;
  const s = Math.max(0, Math.min(fullLen, Math.min(startOffset, endOffset)));
  const e = Math.max(0, Math.min(fullLen, Math.max(startOffset, endOffset)));
  if (s === e) return normalizeRichRuns(runs);

  const nextRuns: RichTextRun[] = [];
  let cursor = 0;

  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;

    if (runEnd <= s || runStart >= e) {
      nextRuns.push({ ...run });
      continue;
    }

    if (runStart < s) {
      nextRuns.push({
        ...run,
        text: run.text.slice(0, s - runStart),
      });
    }

    const midStart = Math.max(s, runStart) - runStart;
    const midEnd = Math.min(e, runEnd) - runStart;
    nextRuns.push({
      ...run,
      ...patch,
      text: run.text.slice(midStart, midEnd),
    });

    if (runEnd > e) {
      nextRuns.push({
        ...run,
        text: run.text.slice(e - runStart),
      });
    }
  }

  return normalizeRichRuns(nextRuns);
}

/** Verifica se TODOS os caracteres visíveis no intervalo possuem uma propriedade ativa (para toggle B/I/U/S) */
export function isRangeUniformlyFormatted(
  runs: readonly RichTextRun[],
  startOffset: number,
  endOffset: number,
  predicate: (run: RichTextRun) => boolean,
): boolean {
  const fullLen = runsToPlainText(runs).length;
  let s = Math.max(0, Math.min(fullLen, Math.min(startOffset, endOffset)));
  let e = Math.max(0, Math.min(fullLen, Math.max(startOffset, endOffset)));
  if (s === e) {
    s = 0;
    e = fullLen;
  }
  if (e === 0) return false;

  let cursor = 0;
  let checkedAny = false;
  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    if (runEnd <= s || runStart >= e) continue;
    const slice = run.text.slice(Math.max(s, runStart) - runStart, Math.min(e, runEnd) - runStart);
    if (slice.length > 0) {
      checkedAny = true;
      if (!predicate(run)) return false;
    }
  }
  return checkedAny;
}

/** Sincroniza edições de texto livre (digitação/colagem/inserção de símbolo) preservando runs existentes */
export function syncPlainTextEditIntoRuns(
  prevRuns: readonly RichTextRun[],
  nextPlainText: string,
): RichTextRun[] {
  const prevPlain = runsToPlainText(prevRuns);
  if (prevPlain === nextPlainText) return normalizeRichRuns(prevRuns);
  if (!nextPlainText) return [{ text: "" }];
  if (prevPlain.length === 0) return [{ text: nextPlainText }];

  // Encontra prefixo e sufixo idênticos para preservar 100% da formatação fora do ponto editado
  let prefixLen = 0;
  const maxPrefix = Math.min(prevPlain.length, nextPlainText.length);
  while (prefixLen < maxPrefix && prevPlain[prefixLen] === nextPlainText[prefixLen]) {
    prefixLen++;
  }

  let prevSuffixIdx = prevPlain.length;
  let nextSuffixIdx = nextPlainText.length;
  while (
    prevSuffixIdx > prefixLen &&
    nextSuffixIdx > prefixLen &&
    prevPlain[prevSuffixIdx - 1] === nextPlainText[nextSuffixIdx - 1]
  ) {
    prevSuffixIdx--;
    nextSuffixIdx--;
  }

  const inserted = nextPlainText.slice(prefixLen, nextSuffixIdx);

  // Extrai estilo herdado do caractere imediatamente anterior ao ponto de inserção (ou primeiro run)
  let inheritedStyle: Omit<RichTextRun, "text"> = {};
  let c = 0;
  for (const r of prevRuns) {
    const rEnd = c + r.text.length;
    const probe = prefixLen > 0 ? prefixLen - 1 : 0;
    if (probe >= c && probe < rEnd) {
      const { text: _ignored, ...rest } = r;
      inheritedStyle = rest;
      break;
    }
    c = rEnd;
  }

  const out: RichTextRun[] = [];
  let pos = 0;
  let insertedDone = false;

  for (const r of prevRuns) {
    const rStart = pos;
    const rEnd = pos + r.text.length;
    pos = rEnd;

    // Parte antes da remoção/inserção
    if (rStart < prefixLen) {
      const takeEnd = Math.min(rEnd, prefixLen) - rStart;
      out.push({ ...r, text: r.text.slice(0, takeEnd) });
    }

    if (!insertedDone && rEnd >= prefixLen) {
      if (inserted.length > 0) {
        out.push({ ...inheritedStyle, text: inserted });
      }
      insertedDone = true;
    }

    // Parte após a remoção
    if (rEnd > prevSuffixIdx) {
      const takeStart = Math.max(rStart, prevSuffixIdx) - rStart;
      out.push({ ...r, text: r.text.slice(takeStart) });
    }
  }

  if (!insertedDone && inserted.length > 0) {
    out.push({ ...inheritedStyle, text: inserted });
  }

  return normalizeRichRuns(out);
}

/* ============================================================================
 * 2. EXTRAÇÃO E SERIALIZAÇÃO EM `Entity` (`type: "text"`)
 * ============================================================================ */

export function isRichNoteEntity(entity: Entity): boolean {
  return entity.type === "text" && Boolean(entity.params?.richNote);
}

export function getEntityRichNoteSpec(entity: Entity): RichNoteSpec | null {
  if (entity.type !== "text") return null;
  const raw = entity.params?.richNote as Partial<RichNoteSpec> | undefined;
  if (!raw) {
    // Fallback limpo caso uma entidade de texto legado seja aberta no editor rico
    const fallbackSize = Math.max(1.5, entity.size || 6);
    const approxW = Math.max(36, (entity.width && entity.width > 0 ? entity.width : entity.text.length * fallbackSize * 0.62) + 8);
    return {
      widthMm: approxW,
      fontSizeMm: fallbackSize,
      rotationDeg: entity.rotation ?? 0,
      textAlign: "left",
      lineHeight: 1.35,
      categoryLayer: "Geral",
      boxStyle: "none",
      isFormula: false,
      runs: [
        {
          text: entity.text || "",
          ...(entity.bold ? { bold: true } : {}),
          ...(entity.italic ? { italic: true } : {}),
        },
      ],
    };
  }

  const fontSizeMm = Math.max(1.5, Number(raw.fontSizeMm) || entity.size || 6);
  const widthMm = Math.max(fontSizeMm * 3.5, Number(raw.widthMm) || 90);
  const lineHeight = Math.max(1.05, Math.min(2.4, Number(raw.lineHeight) || 1.35));
  const textAlign: NoteTextAlign =
    raw.textAlign === "center" || raw.textAlign === "right" || raw.textAlign === "justify"
      ? raw.textAlign
      : "left";
  const categoryLayer: NoteCategoryLayer = RICH_NOTE_CATEGORIES.includes(
    raw.categoryLayer as NoteCategoryLayer,
  )
    ? (raw.categoryLayer as NoteCategoryLayer)
    : "Observação";

  const runs =
    Array.isArray(raw.runs) && raw.runs.length > 0
      ? normalizeRichRuns(raw.runs)
      : [{ text: entity.text || "" }];

  return {
    widthMm,
    fontSizeMm,
    rotationDeg: Number.isFinite(raw.rotationDeg) ? Number(raw.rotationDeg) : entity.rotation ?? 0,
    textAlign,
    lineHeight,
    categoryLayer,
    boxStyle: raw.boxStyle === "card" ? "card" : "none",
    isFormula: Boolean(raw.isFormula),
    runs,
  };
}

export function buildRichNoteEntity(
  id: string,
  posMm: Vec2,
  spec: RichNoteSpec,
  layer = "anotacoes",
  existingParams?: Record<string, unknown>,
): Entity {
  const normalizedRuns = normalizeRichRuns(spec.runs);
  const plainText = runsToPlainText(normalizedRuns);
  const firstRun = normalizedRuns[0];
  const cleanSpec: RichNoteSpec = {
    ...spec,
    widthMm: Math.max(spec.fontSizeMm * 3.5, Number(spec.widthMm.toFixed(3))),
    fontSizeMm: Math.max(1.5, Number(spec.fontSizeMm.toFixed(3))),
    rotationDeg: Number((spec.rotationDeg || 0).toFixed(3)),
    runs: normalizedRuns,
  };

  return {
    id,
    layer,
    type: "text",
    x: Number(posMm.x.toFixed(4)),
    y: Number(posMm.y.toFixed(4)),
    text: plainText,
    size: cleanSpec.fontSizeMm,
    bold: Boolean(firstRun?.bold),
    italic: Boolean(firstRun?.italic),
    rotation: cleanSpec.rotationDeg,
    cnc: { role: "DIMENSION" },
    params: {
      ...(existingParams ?? {}),
      excludeFrom3D: true,
      richNote: cleanSpec,
    },
  };
}

/* ============================================================================
 * 3. MOTOR DE LAYOUT EM MM E JUSTIFICAÇÃO MATEMÁTICA REAL (`layoutRichNoteMm`)
 * ============================================================================ */

export type MeasureRichFragmentFn = (
  text: string,
  run: RichTextRun,
  effectiveFontSizeMm: number,
) => number;

/**
 * Métrica proporcional determinística em `mm` (usada em SVG, Node tests e hit-test rápido
 * quando não há CanvasRenderingContext2D acoplado).
 */
export const defaultProportionalMeasureMm: MeasureRichFragmentFn = (
  text,
  run,
  effectiveFontSizeMm,
) => {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === " ") units += 0.31;
    else if ("ilI1.,:;|!'`".includes(ch)) units += 0.3;
    else if ("mwMWØΔ%".includes(ch)) units += 0.84;
    else if ("ABCDEFGHJKLNOPQRSTUVXYZ023456789+-=×÷±≤≥≈→".includes(ch)) units += 0.62;
    else units += 0.55;
  }
  const boldFactor = run.bold ? 1.06 : 1.0;
  return units * effectiveFontSizeMm * boldFactor;
};

export interface LaidOutRichFragmentMm {
  text: string;
  isWhitespace: boolean;
  run: RichTextRun;
  xMm: number;
  yMm: number;
  baselineYMm: number;
  widthMm: number;
  heightMm: number;
  effectiveFontSizeMm: number;
  lineIndex: number;
}

export interface LaidOutHighlightRectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  color: HighlightSwatchColor;
  lineIndex: number;
}

export interface LaidOutRichLineMm {
  lineIndex: number;
  paragraphIndex: number;
  isLastLineOfParagraph: boolean;
  xStartMm: number;
  xEndMm: number;
  yTopMm: number;
  heightMm: number;
  wordCount: number;
  fragments: LaidOutRichFragmentMm[];
}

export interface RichNoteLayoutResultMm {
  boxXMm: number;
  boxYMm: number;
  widthMm: number;
  heightMm: number;
  padXMm: number;
  padYMm: number;
  headerHeightMm: number;
  innerWidthMm: number;
  lines: LaidOutRichLineMm[];
  fragments: LaidOutRichFragmentMm[];
  highlights: LaidOutHighlightRectMm[];
}

interface StyledAtom {
  text: string;
  run: RichTextRun;
  effectiveFontSizeMm: number;
  widthMm: number;
}

interface WordOrSpaceToken {
  isWhitespace: boolean;
  atoms: StyledAtom[];
  widthMm: number;
}

/**
 * Calcula o layout exato da Nota Técnica em milímetros no referencial local da nota:
 *  - Origem `(0, 0)` da nota corresponde ao canto superior esquerdo da caixa (`boxXMm = 0, boxYMm = 0`),
 *    facilitando redimensionamento lateral `widthMm` previsível sem deslocar a âncora esquerda.
 */
export function layoutRichNoteMm(
  spec: RichNoteSpec,
  measureFn: MeasureRichFragmentFn = defaultProportionalMeasureMm,
): RichNoteLayoutResultMm {
  const baseFontMm = Math.max(1.5, spec.fontSizeMm || 6);
  const isCard = spec.boxStyle === "card";
  const padXMm = isCard ? Math.max(2.2, baseFontMm * 0.55) : Math.max(0.8, baseFontMm * 0.15);
  const padYMm = isCard ? Math.max(2.0, baseFontMm * 0.45) : Math.max(0.6, baseFontMm * 0.12);
  const headerHeightMm = isCard ? Math.max(3.4, baseFontMm * 0.78) : 0;

  const totalWidthMm = Math.max(baseFontMm * 3.5, spec.widthMm);
  const innerWidthMm = Math.max(baseFontMm * 2.2, totalWidthMm - padXMm * 2);
  const lineStepMm = baseFontMm * Math.max(1.08, spec.lineHeight || 1.35);

  // 1. Divide `runs` em parágrafos explícitos por `\n` preservando estilos intra-palavra (ex: H₂O, mm²)
  const paragraphs: RichTextRun[][] = [[]];
  for (const run of spec.runs) {
    const parts = run.text.split("\n");
    for (let pIdx = 0; pIdx < parts.length; pIdx++) {
      if (pIdx > 0) paragraphs.push([]);
      const segText = parts[pIdx]!;
      if (segText.length > 0) {
        paragraphs[paragraphs.length - 1]!.push({ ...run, text: segText });
      }
    }
  }

  const lines: LaidOutRichLineMm[] = [];
  const allFragments: LaidOutRichFragmentMm[] = [];
  const allHighlights: LaidOutHighlightRectMm[] = [];

  let globalLineIdx = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paraRuns = paragraphs[pIdx]!;

    // Tokeniza o parágrafo em palavras contínuas e espaços contínuos
    const tokens: WordOrSpaceToken[] = [];
    for (const run of paraRuns) {
      const script = run.script ?? "normal";
      const effFont = script === "normal" ? baseFontMm : baseFontMm * 0.66;
      const chunks = run.text.match(/(\s+|\S+)/g) ?? [];

      for (const chText of chunks) {
        const isWs = /^\s+$/.test(chText);
        const w = Math.max(0.01, measureFn(chText, run, effFont));
        const atom: StyledAtom = {
          text: chText,
          run,
          effectiveFontSizeMm: effFont,
          widthMm: w,
        };
        const prevTok = tokens[tokens.length - 1];
        if (prevTok && prevTok.isWhitespace === isWs) {
          prevTok.atoms.push(atom);
          prevTok.widthMm += w;
        } else {
          tokens.push({
            isWhitespace: isWs,
            atoms: [atom],
            widthMm: w,
          });
        }
      }
    }

    // Quebra palavras individualmente caso uma palavra única seja maior que `innerWidthMm`
    const normalizedTokens: WordOrSpaceToken[] = [];
    for (const tok of tokens) {
      if (tok.isWhitespace || tok.widthMm <= innerWidthMm) {
        normalizedTokens.push(tok);
        continue;
      }
      // Subdivide átomo por caractere quando ultrapassa innerWidthMm
      let curAtoms: StyledAtom[] = [];
      let curW = 0;
      for (const atom of tok.atoms) {
        for (const ch of atom.text) {
          const cw = Math.max(0.01, measureFn(ch, atom.run, atom.effectiveFontSizeMm));
          if (curW + cw > innerWidthMm && curAtoms.length > 0) {
            normalizedTokens.push({ isWhitespace: false, atoms: curAtoms, widthMm: curW });
            curAtoms = [];
            curW = 0;
          }
          const lastA = curAtoms[curAtoms.length - 1];
          if (lastA && areRunStylesEqual(lastA.run, atom.run)) {
            lastA.text += ch;
            lastA.widthMm += cw;
          } else {
            curAtoms.push({
              text: ch,
              run: atom.run,
              effectiveFontSizeMm: atom.effectiveFontSizeMm,
              widthMm: cw,
            });
          }
          curW += cw;
        }
      }
      if (curAtoms.length > 0) {
        normalizedTokens.push({ isWhitespace: false, atoms: curAtoms, widthMm: curW });
      }
    }

    // Agrupa tokens em linhas quebradas dentro de `innerWidthMm`
    const rawLines: WordOrSpaceToken[][] = [];
    let currentLine: WordOrSpaceToken[] = [];
    let currentLineW = 0;

    for (const tok of normalizedTokens) {
      if (currentLine.length === 0 && tok.isWhitespace) {
        // Ignora espaços sobrando no início de linha quebrada
        continue;
      }
      if (currentLineW + tok.widthMm <= innerWidthMm + 1e-5 || currentLine.length === 0) {
        currentLine.push(tok);
        currentLineW += tok.widthMm;
      } else {
        // Remove espaço final da linha fechada
        while (currentLine.length > 0 && currentLine[currentLine.length - 1]!.isWhitespace) {
          currentLine.pop();
        }
        rawLines.push(currentLine);
        currentLine = tok.isWhitespace ? [] : [tok];
        currentLineW = tok.isWhitespace ? 0 : tok.widthMm;
      }
    }

    while (currentLine.length > 0 && currentLine[currentLine.length - 1]!.isWhitespace) {
      currentLine.pop();
    }
    rawLines.push(currentLine);

    for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
      const lineTokens = rawLines[lIdx]!;
      const isLastInPara = lIdx === rawLines.length - 1;
      const yTopMm = padYMm + headerHeightMm + globalLineIdx * lineStepMm;
      const baselineBaseYMm = yTopMm + baseFontMm * 0.84;

      const wordTokens = lineTokens.filter((t) => !t.isWhitespace);
      const spaceTokens = lineTokens.filter((t) => t.isWhitespace);
      const sumWordsMm = wordTokens.reduce((acc, t) => acc + t.widthMm, 0);
      const sumSpacesMm = spaceTokens.reduce((acc, t) => acc + t.widthMm, 0);
      const naturalWidthMm = sumWordsMm + sumSpacesMm;

      let cursorXMm = padXMm;
      let extraPerSpaceTokenMm = 0;

      if (spec.textAlign === "center") {
        cursorXMm = padXMm + Math.max(0, (innerWidthMm - naturalWidthMm) / 2);
      } else if (spec.textAlign === "right") {
        cursorXMm = padXMm + Math.max(0, innerWidthMm - naturalWidthMm);
      } else if (
        spec.textAlign === "justify" &&
        !isLastInPara &&
        spaceTokens.length >= 1 &&
        wordTokens.length >= 2
      ) {
        cursorXMm = padXMm;
        extraPerSpaceTokenMm = Math.max(0, innerWidthMm - naturalWidthMm) / spaceTokens.length;
      }

      const lineStartXMm = cursorXMm;
      const lineFragments: LaidOutRichFragmentMm[] = [];

      for (const tok of lineTokens) {
        if (tok.isWhitespace) {
          const totalWsW = tok.widthMm + extraPerSpaceTokenMm;
          const firstAtom = tok.atoms[0];
          if (firstAtom) {
            const frag: LaidOutRichFragmentMm = {
              text: tok.atoms.map((a) => a.text).join(""),
              isWhitespace: true,
              run: firstAtom.run,
              xMm: cursorXMm,
              yMm: yTopMm,
              baselineYMm: baselineBaseYMm,
              widthMm: totalWsW,
              heightMm: baseFontMm * 1.12,
              effectiveFontSizeMm: baseFontMm,
              lineIndex: globalLineIdx,
            };
            lineFragments.push(frag);
            allFragments.push(frag);
          }
          cursorXMm += totalWsW;
        } else {
          for (const atom of tok.atoms) {
            const script = atom.run.script ?? "normal";
            const scriptYOffset =
              script === "sup"
                ? -baseFontMm * 0.32
                : script === "sub"
                  ? baseFontMm * 0.2
                  : 0;
            const frag: LaidOutRichFragmentMm = {
              text: atom.text,
              isWhitespace: false,
              run: atom.run,
              xMm: cursorXMm,
              yMm: yTopMm + (script === "sub" ? baseFontMm * 0.24 : 0),
              baselineYMm: baselineBaseYMm + scriptYOffset,
              widthMm: atom.widthMm,
              heightMm:
                script === "normal" ? baseFontMm * 1.12 : atom.effectiveFontSizeMm * 1.15,
              effectiveFontSizeMm: atom.effectiveFontSizeMm,
              lineIndex: globalLineIdx,
            };
            lineFragments.push(frag);
            allFragments.push(frag);
            cursorXMm += atom.widthMm;
          }
        }
      }

      // Constrói retângulos de Grifado (Marca-Texto) mesclando fragmentos adjacentes da mesma cor na linha
      for (const frag of lineFragments) {
        const hl = frag.run.highlightColor;
        if (!hl) continue;
        const padHlX = baseFontMm * 0.08;
        const hlY = yTopMm + baseFontMm * 0.04;
        const hlH = baseFontMm * 1.08;
        const prevHl = allHighlights[allHighlights.length - 1];
        if (
          prevHl &&
          prevHl.lineIndex === globalLineIdx &&
          prevHl.color === hl &&
          Math.abs(prevHl.xMm + prevHl.widthMm - (frag.xMm - padHlX)) <= baseFontMm * 0.35
        ) {
          prevHl.widthMm = frag.xMm + frag.widthMm + padHlX - prevHl.xMm;
        } else {
          allHighlights.push({
            xMm: frag.xMm - padHlX,
            yMm: hlY,
            widthMm: frag.widthMm + padHlX * 2,
            heightMm: hlH,
            color: hl,
            lineIndex: globalLineIdx,
          });
        }
      }

      lines.push({
        lineIndex: globalLineIdx,
        paragraphIndex: pIdx,
        isLastLineOfParagraph: isLastInPara,
        xStartMm: lineStartXMm,
        xEndMm: cursorXMm,
        yTopMm,
        heightMm: lineStepMm,
        wordCount: wordTokens.length,
        fragments: lineFragments,
      });

      globalLineIdx++;
    }
  }

  const contentHeightMm = Math.max(baseFontMm * 1.25, lines.length * lineStepMm);
  const totalHeightMm = padYMm * 2 + headerHeightMm + contentHeightMm;

  return {
    boxXMm: 0,
    boxYMm: 0,
    widthMm: totalWidthMm,
    heightMm: totalHeightMm,
    padXMm,
    padYMm,
    headerHeightMm,
    innerWidthMm,
    lines,
    fragments: allFragments,
    highlights: allHighlights,
  };
}

/* ============================================================================
 * 4. BOUNDING BOX E HIT-TEST INTELIGENTE NOS GLIFOS REAIS (ZERO CAPTURA NO VAZIO)
 * ============================================================================ */

export function worldPointToNoteLocalMm(pointWorld: Vec2, entity: Entity): Vec2 {
  if (entity.type !== "text") return pointWorld;
  const dx = pointWorld.x - entity.x;
  const dy = pointWorld.y - entity.y;
  const rotRad = -((entity.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: dx * c - dy * s,
    y: dx * s + dy * c,
  };
}

export function noteLocalToWorldMm(localPt: Vec2, entity: Entity): Vec2 {
  if (entity.type !== "text") return localPt;
  const rotRad = ((entity.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: entity.x + localPt.x * c - localPt.y * s,
    y: entity.y + localPt.x * s + localPt.y * c,
  };
}

export function computeRichNoteWorldBox(entity: Entity): Box | null {
  if (entity.type !== "text" || !isRichNoteEntity(entity)) return null;
  const spec = getEntityRichNoteSpec(entity);
  if (!spec) return null;
  const layout = layoutRichNoteMm(spec);
  const cornersLocal: Vec2[] = [
    { x: 0, y: 0 },
    { x: layout.widthMm, y: 0 },
    { x: layout.widthMm, y: layout.heightMm },
    { x: 0, y: layout.heightMm },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const lc of cornersLocal) {
    const wc = noteLocalToWorldMm(lc, entity);
    if (wc.x < minX) minX = wc.x;
    if (wc.y < minY) minY = wc.y;
    if (wc.x > maxX) maxX = wc.x;
    if (wc.y > maxY) maxY = wc.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Hit-test inteligente no mundo (`mm`):
 *  - Retorna `true` SOMENTE se o ponteiro atingir:
 *    1) Um glifo/palavra real não-vazia (`!frag.isWhitespace`),
 *    2) Um trecho grifado (`highlights`),
 *    3) A moldura ou cabeçalho de categoria quando `boxStyle === "card"`.
 *  - Clicar no espaço vazio dentro de uma caixa larga retorna `false`, permitindo selecionar
 *    livremente qualquer linha/arco/peça CAD que passe por trás!
 */
export function hitTestRichNoteGlyphsMm(
  pointWorld: Vec2,
  entity: Entity,
  tolMm: number,
): boolean {
  if (entity.type !== "text") return false;
  const spec = getEntityRichNoteSpec(entity);
  if (!spec) return false;

  const layout = layoutRichNoteMm(spec);
  const local = worldPointToNoteLocalMm(pointWorld, entity);
  const safeTol = Math.max(0.4, tolMm);

  // Rejeição rápida fora do envelope expandido
  if (
    local.x < -safeTol ||
    local.x > layout.widthMm + safeTol ||
    local.y < -safeTol ||
    local.y > layout.heightMm + safeTol
  ) {
    return false;
  }

  // 1. Moldura ou faixa superior de título se `boxStyle === "card"`
  if (spec.boxStyle === "card") {
    const nearLeft = Math.abs(local.x) <= safeTol;
    const nearRight = Math.abs(local.x - layout.widthMm) <= safeTol;
    const nearTop = Math.abs(local.y) <= safeTol;
    const nearBottom = Math.abs(local.y - layout.heightMm) <= safeTol;
    if (nearLeft || nearRight || nearTop || nearBottom) return true;
    if (
      local.x >= 0 &&
      local.x <= layout.widthMm &&
      local.y >= 0 &&
      local.y <= layout.padYMm + layout.headerHeightMm
    ) {
      return true;
    }
  }

  // 2. Trechos grifados com marca-texto
  for (const hl of layout.highlights) {
    if (
      local.x >= hl.xMm - safeTol * 0.6 &&
      local.x <= hl.xMm + hl.widthMm + safeTol * 0.6 &&
      local.y >= hl.yMm - safeTol * 0.6 &&
      local.y <= hl.yMm + hl.heightMm + safeTol * 0.6
    ) {
      return true;
    }
  }

  // 3. Glifos/palavras reais (ignora espaços em branco!)
  for (const frag of layout.fragments) {
    if (frag.isWhitespace) continue;
    if (
      local.x >= frag.xMm - safeTol &&
      local.x <= frag.xMm + frag.widthMm + safeTol &&
      local.y >= frag.yMm - safeTol &&
      local.y <= frag.yMm + frag.heightMm + safeTol
    ) {
      return true;
    }
  }

  return false;
}

/* ============================================================================
 * 5. RENDERIZAÇÃO NATIVA NO CANVAS 2D E EXPORTAÇÃO VETORIAL SVG (1:1)
 * ============================================================================ */

function resolveDefaultNoteTextColor(entity: Entity, isLight?: boolean): string {
  const rawLayerColor = techStyle(entity.layer).color;
  const isWhiteOrCut = rawLayerColor === "#FFFFFF" || entity.layer === "corte";
  if (isWhiteOrCut) {
    return isLight ? "#0F172A" : "#F1F5F9";
  }
  if (isLight && (entity.layer === "cota" || entity.layer === "anotacoes")) {
    return "#0369A1";
  }
  if (isLight && (entity.layer === "construcao" || entity.layer === "referencia")) {
    return "#334155";
  }
  return rawLayerColor;
}

function buildCanvasFontString(run: RichTextRun, fontSizeMm: number): string {
  const italic = run.italic ? "italic " : "";
  const weight = run.bold ? "700 " : "400 ";
  return `${italic}${weight}${fontSizeMm}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
}

export function drawRichNoteOnCanvas2D(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  opts: {
    invScale: number;
    isLight?: boolean;
    isSelected?: boolean;
  },
): void {
  if (entity.type !== "text") return;
  const spec = getEntityRichNoteSpec(entity);
  if (!spec) return;

  const FONT_OVERSAMPLE = 10;
  const measureWithCtx: MeasureRichFragmentFn = (text, run, effFontSizeMm) => {
    ctx.font = buildCanvasFontString(run, effFontSizeMm * FONT_OVERSAMPLE);
    return Math.max(0.01, ctx.measureText(text).width / FONT_OVERSAMPLE);
  };

  const layout = layoutRichNoteMm(spec, measureWithCtx);
  const baseTextColor = resolveDefaultNoteTextColor(entity, opts.isLight);
  const inv = opts.invScale;

  ctx.save();
  ctx.translate(entity.x, entity.y);
  if (spec.rotationDeg) {
    ctx.rotate((spec.rotationDeg * Math.PI) / 180);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.setLineDash([]);

  // 1. Caixa Técnica opcional ("card")
  if (spec.boxStyle === "card") {
    const r = Math.min(2.4, spec.fontSizeMm * 0.35);
    ctx.fillStyle = opts.isLight ? "rgba(248, 250, 252, 0.92)" : "rgba(11, 17, 30, 0.88)";
    ctx.strokeStyle = opts.isSelected
      ? opts.isLight
        ? "#E11D48"
        : "#F43F5E"
      : opts.isLight
        ? "rgba(2, 132, 199, 0.45)"
        : "rgba(56, 189, 248, 0.42)";
    ctx.lineWidth = Math.max(1.2 * inv, spec.fontSizeMm * 0.045);

    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, 0, layout.widthMm, layout.heightMm, r);
    } else {
      ctx.rect(0, 0, layout.widthMm, layout.heightMm);
    }
    ctx.fill();
    ctx.stroke();

    // Etiqueta superior discreta da Categoria Técnica (oversample 10x para precisão sub-milimétrica)
    const badgeFont = Math.max(1.4, spec.fontSizeMm * 0.48);
    const headerLabel = spec.isFormula
      ? `∑ ${spec.categoryLayer.toUpperCase()}`
      : spec.categoryLayer.toUpperCase();
    ctx.save();
    ctx.translate(layout.padXMm, layout.padYMm + badgeFont * 0.82);
    ctx.scale(1 / FONT_OVERSAMPLE, 1 / FONT_OVERSAMPLE);
    ctx.font = `700 ${badgeFont * FONT_OVERSAMPLE}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = opts.isLight ? "#0284C7" : "#38BDF8";
    ctx.fillText(headerLabel, 0, 0);
    ctx.restore();

    ctx.strokeStyle = opts.isLight ? "rgba(15, 23, 42, 0.10)" : "rgba(148, 163, 184, 0.16)";
    ctx.lineWidth = Math.max(0.8 * inv, spec.fontSizeMm * 0.025);
    ctx.beginPath();
    ctx.moveTo(layout.padXMm, layout.padYMm + layout.headerHeightMm - badgeFont * 0.15);
    ctx.lineTo(
      layout.widthMm - layout.padXMm,
      layout.padYMm + layout.headerHeightMm - badgeFont * 0.15,
    );
    ctx.stroke();
  }

  // 2. Moldura sutil de seleção quando selecionada sem card
  if (opts.isSelected && spec.boxStyle === "none") {
    ctx.save();
    ctx.setLineDash([4 * inv, 3 * inv]);
    ctx.strokeStyle = opts.isLight ? "#E11D48" : "#38BDF8";
    ctx.lineWidth = 1.35 * inv;
    ctx.strokeRect(0, 0, layout.widthMm, layout.heightMm);
    ctx.restore();
  }

  // 3. Retângulos arredondados translúcidos de Grifado (Marca-Texto) ATRÁS das letras
  for (const hl of layout.highlights) {
    ctx.save();
    ctx.globalAlpha = opts.isLight ? 0.42 : 0.34;
    ctx.fillStyle = hl.color;
    const hr = Math.min(1.2, hl.heightMm * 0.22);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(hl.xMm, hl.yMm, hl.widthMm, hl.heightMm, hr);
    } else {
      ctx.rect(hl.xMm, hl.yMm, hl.widthMm, hl.heightMm);
    }
    ctx.fill();
    ctx.restore();
  }

  // 4. Glifos formatados, Sublinhado e Tachado
  for (const frag of layout.fragments) {
    const fgColor =
      frag.run.textColor && frag.run.textColor.trim().length > 0
        ? frag.run.textColor
        : frag.run.highlightColor && !opts.isLight
          ? "#F8FAFC"
          : baseTextColor;

    if (!frag.isWhitespace) {
      ctx.save();
      ctx.translate(frag.xMm, frag.baselineYMm);
      ctx.scale(1 / FONT_OVERSAMPLE, 1 / FONT_OVERSAMPLE);
      ctx.font = buildCanvasFontString(frag.run, frag.effectiveFontSizeMm * FONT_OVERSAMPLE);
      ctx.fillStyle = fgColor;
      ctx.fillText(frag.text, 0, 0);
      ctx.restore();
    }

    const decoStrokeW = Math.max(0.95 * inv, frag.effectiveFontSizeMm * 0.068);
    if (frag.run.underline) {
      ctx.strokeStyle = fgColor;
      ctx.lineWidth = decoStrokeW;
      const uy = frag.baselineYMm + frag.effectiveFontSizeMm * 0.13;
      ctx.beginPath();
      ctx.moveTo(frag.xMm, uy);
      ctx.lineTo(frag.xMm + frag.widthMm, uy);
      ctx.stroke();
    }

    if (frag.run.strikethrough) {
      ctx.strokeStyle = fgColor;
      ctx.lineWidth = decoStrokeW;
      const sy = frag.baselineYMm - frag.effectiveFontSizeMm * 0.3;
      ctx.beginPath();
      ctx.moveTo(frag.xMm, sy);
      ctx.lineTo(frag.xMm + frag.widthMm, sy);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Exportação vetorial 1:1 para SVG / Prancha Técnica / PDF */
export function renderRichNoteToSvgMarkup(
  entity: Entity,
  defaultStrokeColor: string,
): string {
  if (entity.type !== "text") return "";
  const spec = getEntityRichNoteSpec(entity);
  if (!spec) return "";

  const layout = layoutRichNoteMm(spec, defaultProportionalMeasureMm);
  const rotAttr = spec.rotationDeg ? ` rotate(${spec.rotationDeg.toFixed(2)})` : "";
  const parts: string[] = [];

  parts.push(`<g transform="translate(${entity.x.toFixed(3)} ${entity.y.toFixed(3)})${rotAttr}">`);

  if (spec.boxStyle === "card") {
    const r = Math.min(2.4, spec.fontSizeMm * 0.35).toFixed(2);
    parts.push(
      `<rect x="0" y="0" width="${layout.widthMm.toFixed(3)}" height="${layout.heightMm.toFixed(3)}" rx="${r}" fill="rgba(248,250,252,0.92)" stroke="#0284C7" stroke-width="${Math.max(0.25, spec.fontSizeMm * 0.045).toFixed(3)}"/>`,
    );
    const badgeFont = Math.max(1.4, spec.fontSizeMm * 0.48);
    const headerLabel = spec.isFormula
      ? `∑ ${spec.categoryLayer.toUpperCase()}`
      : spec.categoryLayer.toUpperCase();
    parts.push(
      `<text x="${layout.padXMm.toFixed(3)}" y="${(layout.padYMm + badgeFont * 0.82).toFixed(3)}" fill="#0284C7" font-size="${badgeFont.toFixed(3)}" font-family="ui-monospace, monospace" font-weight="700">${escapeXml(headerLabel)}</text>`,
    );
  }

  for (const hl of layout.highlights) {
    const hr = Math.min(1.2, hl.heightMm * 0.22).toFixed(2);
    parts.push(
      `<rect x="${hl.xMm.toFixed(3)}" y="${hl.yMm.toFixed(3)}" width="${hl.widthMm.toFixed(3)}" height="${hl.heightMm.toFixed(3)}" rx="${hr}" fill="${hl.color}" fill-opacity="0.38"/>`,
    );
  }

  for (const frag of layout.fragments) {
    const fg = frag.run.textColor || defaultStrokeColor;
    const decoW = Math.max(0.18, frag.effectiveFontSizeMm * 0.068).toFixed(3);

    if (!frag.isWhitespace) {
      const weight = frag.run.bold ? "700" : "400";
      const style = frag.run.italic ? "italic" : "normal";
      parts.push(
        `<text x="${frag.xMm.toFixed(3)}" y="${frag.baselineYMm.toFixed(3)}" fill="${fg}" font-size="${frag.effectiveFontSizeMm.toFixed(3)}" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="${weight}" font-style="${style}">${escapeXml(frag.text)}</text>`,
      );
    }

    if (frag.run.underline) {
      const uy = (frag.baselineYMm + frag.effectiveFontSizeMm * 0.13).toFixed(3);
      parts.push(
        `<line x1="${frag.xMm.toFixed(3)}" y1="${uy}" x2="${(frag.xMm + frag.widthMm).toFixed(3)}" y2="${uy}" stroke="${fg}" stroke-width="${decoW}"/>`,
      );
    }

    if (frag.run.strikethrough) {
      const sy = (frag.baselineYMm - frag.effectiveFontSizeMm * 0.3).toFixed(3);
      parts.push(
        `<line x1="${frag.xMm.toFixed(3)}" y1="${sy}" x2="${(frag.xMm + frag.widthMm).toFixed(3)}" y2="${sy}" stroke="${fg}" stroke-width="${decoW}"/>`,
      );
    }
  }

  parts.push(`</g>`);
  return parts.join("");
}
