/**
 * CALDRA — CHAMFER CAD & CHAMFER INTENT: SISTEMA UNIFICADO DE TEMA, APARÊNCIA E TOKENS (--chamfer-*)
 *
 * Responsabilidades:
 *  1. Ler de forma síncrona (antes do primeiro render) e reativa as preferências de aparência
 *     do usuário via `useSettings()` + fallback em `localStorage` (`caldra_theme_mode`,
 *     `caldra.settings.theme`, `caldra_bg_style`, `caldra.settings.auroraStyle`,
 *     `caldra_accent_color`, `caldra.settings.accent`, `caldra.settings.cardOpacity`,
 *     `caldra.settings.bubbleOpacity`).
 *  2. Gerar todos os tokens CSS `--chamfer-*` para barras, painéis, gavetas, popovers,
 *     pílulas flutuantes, bordas, textos, cor de destaque (`accent`), opacidade e canvas.
 *  3. Expor `themeColors` (`ChamferThemeColors`) e `themeVersion` para repintura imediata
 *     do Canvas 2D, Grid e Área de Trabalho em ambos os layouts (Paisagem e Vertical).
 *  4. Preservar total compatibilidade retroativa com `useIntentTheme()` e `displayColor()`.
 */

import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import {
  useSettings,
  type AccentOption,
  type AuroraStyleOption,
  type ThemeOption,
} from "@/lib/settings/SettingsProvider";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type IntentThemeMode = "dark" | "light" | "amoled" | "mestre";
export type ChamferResolvedThemeMode = "dark" | "light" | "amoled";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface ChamferThemeColors {
  mode: ChamferResolvedThemeMode;
  isDark: boolean;
  isAmoled: boolean;
  bgStyle: AuroraStyleOption;
  accentKey: AccentOption;
  accent: string;
  accentRgb: string;
  accentContrast: string;
  accentSoft: string;
  accentBorder: string;
  cardOpacity: number;
  panelOpacity: number;
  bubbleOpacity: number;
  // Superfícies de UI
  bgRoot: string;
  barBgSolid: string;
  barBg: string;
  surfaceElevatedSolid: string;
  surfaceElevated: string;
  popoverBgSolid: string;
  popoverBg: string;
  floatingBg: string;
  bubbleBg: string;
  border: string;
  borderStrong: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Canvas, Área de Trabalho e Grid
  canvasBg: string;
  workAreaFill: string;
  workAreaStroke: string;
  workAreaBadgeBg: string;
  workAreaBadgeBorder: string;
  workAreaBadgeText: string;
  canvasOverlayGradient: string;
  luminanceStepRatio: number;
  gridMinor: string;
  gridMajor: string;
  gridOuterMinor: string;
  gridOuterMajor: string;
  gridMinorColor: string;
  gridMajorColor: string;
  gridOuterOpacityFactor: number;
  rulerBg: string;
  rulerBorder: string;
  rulerText: string;
  rulerTickMajor: string;
  rulerTickMinor: string;
  // Dados CAD Semânticos e Status
  defaultCutStroke: string;
  axisX: string;
  axisY: string;
  originFill: string;
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  statusInfo: string;
}

export interface IntentThemeTokens {
  mode: IntentThemeMode;
  isDark: boolean;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  // Semantic CAD & UI Tokens
  background: string;
  canvas: string;
  panel: string;
  panelElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  selection: string;
  axisX: string;
  axisY: string;
  snap: string;
  dimension: string;
  warning: string;
  error: string;
  confirm: string;
  // UI Tokens
  ciBg: string;
  ciSurface: string;
  ciSurface2: string;
  ciBorder: string;
  ciText: string;
  ciTextMuted: string;
  ciAccent: string;
  ciAccentContrast: string;
  ciSuccess: string;
  ciWarning: string;
  ciDanger: string;
  // CAD Tokens
  cadCanvas: string;
  cadGridMinor: string;
  cadGridMajor: string;
  cadAxisX: string;
  cadAxisY: string;
  cadCenter: string;
  cadHidden: string;
  cadDim: string;
  cadText: string;
  cadSelection: string;
  cadProvisional: string;
  cadSheet: string;
  cadSheetInk: string;
}

const ACCENT_MAP: Record<string, { hex: string; rgb: string }> = {
  blue: { hex: "#0066FF", rgb: "0, 102, 255" },
  cyan: { hex: "#06B6D4", rgb: "6, 182, 212" },
  indigo: { hex: "#6366F1", rgb: "99, 102, 241" },
  emerald: { hex: "#10B981", rgb: "16, 185, 129" },
  amber: { hex: "#FF6B00", rgb: "255, 107, 0" },
  crimson: { hex: "#DC143C", rgb: "220, 20, 60" },
  rose: { hex: "#F43F5E", rgb: "244, 63, 94" },
  magenta: { hex: "#E6007E", rgb: "230, 0, 126" },
  violet: { hex: "#8B5CF6", rgb: "139, 92, 246" },
  default: { hex: "#3B82F6", rgb: "59, 130, 246" },
};

export const FALLBACK_DARK_TOKENS: Omit<
  IntentThemeTokens,
  "mode" | "isDark" | "prefersReducedMotion" | "prefersHighContrast"
> = {
  background: "#0B0D11",
  canvas: "#0E1116",
  panel: "#11141A",
  panelElevated: "#161A22",
  border: "#232A35",
  textPrimary: "#ECEFF4",
  textSecondary: "#9AA4B2",
  accent: "#0066FF",
  selection: "#0066FF",
  axisX: "#D97706",
  axisY: "#059669",
  snap: "#38BDF8",
  dimension: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  confirm: "#10B981",
  ciBg: "#0B0D11",
  ciSurface: "#11141A",
  ciSurface2: "#161A22",
  ciBorder: "#232A35",
  ciText: "#ECEFF4",
  ciTextMuted: "#9AA4B2",
  ciAccent: "#38BDF8",
  ciAccentContrast: "#FFFFFF",
  ciSuccess: "#10B981",
  ciWarning: "#F59E0B",
  ciDanger: "#EF4444",
  cadCanvas: "#0E1116",
  cadGridMinor: "rgba(148, 163, 184, 0.035)",
  cadGridMajor: "rgba(148, 163, 184, 0.08)",
  cadAxisX: "#D97706",
  cadAxisY: "#059669",
  cadCenter: "#64748B",
  cadHidden: "#64748B",
  cadDim: "#10B981",
  cadText: "#ECEFF4",
  cadSelection: "#38BDF8",
  cadProvisional: "#F59E0B",
  cadSheet: "#F8FAFC",
  cadSheetInk: "#1E293B",
};

export const FALLBACK_LIGHT_TOKENS: Omit<
  IntentThemeTokens,
  "mode" | "isDark" | "prefersReducedMotion" | "prefersHighContrast"
> = {
  background: "#EAEEF3",
  canvas: "#F3F5F8",
  panel: "#F8FAFC",
  panelElevated: "#FFFFFF",
  border: "#D5DCE4",
  textPrimary: "#0F141A",
  textSecondary: "#4B5563",
  accent: "#0066FF",
  selection: "#0066FF",
  axisX: "#B45309",
  axisY: "#047857",
  snap: "#0284C7",
  dimension: "#047857",
  warning: "#D97706",
  error: "#DC2626",
  confirm: "#059669",
  ciBg: "#EAEEF3",
  ciSurface: "#F8FAFC",
  ciSurface2: "#FFFFFF",
  ciBorder: "#D5DCE4",
  ciText: "#0F141A",
  ciTextMuted: "#4B5563",
  ciAccent: "#0284C7",
  ciAccentContrast: "#FFFFFF",
  ciSuccess: "#059669",
  ciWarning: "#D97706",
  ciDanger: "#DC2626",
  cadCanvas: "#F3F5F8",
  cadGridMinor: "rgba(15, 23, 42, 0.04)",
  cadGridMajor: "rgba(15, 23, 42, 0.09)",
  cadAxisX: "#B45309",
  cadAxisY: "#047857",
  cadCenter: "#475569",
  cadHidden: "#475569",
  cadDim: "#047857",
  cadText: "#0F141A",
  cadSelection: "#0284C7",
  cadProvisional: "#B45309",
  cadSheet: "#FFFFFF",
  cadSheetInk: "#0F141A",
};

export const TECHNICAL_LAYER_COLORS: Record<string, string> = {
  CORTE: "#38BDF8",
  CONTORNO: "#38BDF8",
  FUROS: "#38BDF8",
  GRAVACAO: "#F59E0B",
  DOBRA: "#A855F7",
  LINHA_CENTRO: "#64748B",
  CENTRO: "#64748B",
  COTAS: "#0284C7",
  AUXILIAR: "#94A3B8",
  CONSTRUCAO: "#64748B",
  OCULTA: "#64748B",
};

export function getTechnicalLayerColor(layerName?: string): string {
  if (!layerName) return TECHNICAL_LAYER_COLORS.CORTE;
  const normalized = layerName.trim().toUpperCase();
  return TECHNICAL_LAYER_COLORS[normalized] ?? TECHNICAL_LAYER_COLORS.CORTE;
}

export function parseColorToRgb(input: string | undefined | null): RgbColor | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b };
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b };
    }
    return null;
  }

  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, Number(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, Number(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, Number(rgbMatch[3]))),
    };
  }

  const tripletMatch = trimmed.match(/^(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})$/);
  if (tripletMatch) {
    return {
      r: Math.min(255, Math.max(0, Number(tripletMatch[1]))),
      g: Math.min(255, Math.max(0, Number(tripletMatch[2]))),
      b: Math.min(255, Math.max(0, Number(tripletMatch[3]))),
    };
  }

  return null;
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

export function getRelativeLuminance(rgb: RgbColor): number {
  const transform = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = transform(rgb.r);
  const G = transform(rgb.g);
  const B = transform(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function getContrastRatio(fg: RgbColor, bg: RgbColor): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calcula a razão de degrau de luminância WCAG `(Lmax + 0.05) / (Lmin + 0.05)`
 * entre `canvasBg` (exterior da prancheta) e `workAreaFill` (interior da Área de Trabalho).
 */
export function computeLuminanceStepRatio(hexA: string, hexB: string): number {
  const rgbA = parseColorToRgb(hexA) ?? { r: 11, g: 13, b: 17 };
  const rgbB = parseColorToRgb(hexB) ?? { r: 14, g: 17, b: 22 };
  return getContrastRatio(rgbA, rgbB);
}

/**
 * Guarda de Luminância da Área de Trabalho (Seção 6.4):
 * Garante que o degrau de luminância entre `canvasBg` e `workAreaFill` permaneça discreto
 * e confortável à vista (nunca ultrapassando 1.25 no tema escuro/AMOLED ou 1.20 no tema claro).
 */
export function enforceWorkspaceLuminanceGuard(
  canvasBgHex: string,
  workAreaFillHex: string,
  isDark: boolean,
): { workAreaFill: string; ratio: number } {
  const maxRatio = isDark ? 1.25 : 1.20;
  let currentFill = workAreaFillHex;
  let ratio = computeLuminanceStepRatio(canvasBgHex, currentFill);

  if (ratio > maxRatio) {
    for (let step = 1; step <= 25; step++) {
      const candidate = lerpHexColor(currentFill, canvasBgHex, step / 25);
      const candRatio = computeLuminanceStepRatio(canvasBgHex, candidate);
      if (candRatio <= maxRatio) {
        currentFill = candidate;
        ratio = candRatio;
        break;
      }
    }
  }

  return { workAreaFill: currentFill, ratio: Number(ratio.toFixed(4)) };
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = parseColorToRgb(hex);
  const clamped = Math.max(0, Math.min(1, alpha));
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number(clamped.toFixed(3))})`;
}

export function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const a = parseColorToRgb(hexA) ?? { r: 0, g: 0, b: 0 };
  const b = parseColorToRgb(hexB) ?? { r: 0, g: 0, b: 0 };
  return rgbToHex({
    r: a.r + (b.r - a.r) * clamped,
    g: a.g + (b.g - a.g) * clamped,
    b: a.b + (b.b - a.b) * clamped,
  });
}

export function displayColor(
  layerColor: string,
  canvasBg: string,
  minContrast = 3.0,
): string {
  const fgRgb = parseColorToRgb(layerColor) ?? parseColorToRgb(TECHNICAL_LAYER_COLORS.CORTE)!;
  const bgRgb = parseColorToRgb(canvasBg) ?? parseColorToRgb(FALLBACK_DARK_TOKENS.cadCanvas)!;

  if (getContrastRatio(fgRgb, bgRgb) >= minContrast) {
    return rgbToHex(fgRgb);
  }

  const bgLum = getRelativeLuminance(bgRgb);
  const hsl = rgbToHsl(fgRgb);
  const shouldLighten = bgLum < 0.42;

  let bestRgb = fgRgb;
  let bestContrast = getContrastRatio(fgRgb, bgRgb);

  for (let step = 1; step <= 40; step++) {
    const delta = (step / 40) * 0.85;
    const candidateL = shouldLighten
      ? Math.min(0.94, hsl.l + delta * (1 - hsl.l))
      : Math.max(0.12, hsl.l - delta * hsl.l);
    const candidateS = Math.max(0.55, hsl.s);
    const candidateRgb = hslToRgb({ h: hsl.h, s: candidateS, l: candidateL });
    const ratio = getContrastRatio(candidateRgb, bgRgb);
    if (ratio > bestContrast) {
      bestContrast = ratio;
      bestRgb = candidateRgb;
    }
    if (ratio >= minContrast) {
      return rgbToHex(candidateRgb);
    }
  }

  return rgbToHex(bestRgb);
}

/**
 * Resolve o modo de tema real ("light" | "dark" | "amoled") de forma síncrona
 * antes do primeiro render, respeitando `SettingsProvider` e `localStorage`.
 */
export function resolveChamferThemeMode(themeOption?: ThemeOption): ChamferResolvedThemeMode {
  let raw: string | null = themeOption ?? null;
  if (!raw && typeof window !== "undefined") {
    try {
      raw =
        window.localStorage.getItem("caldra.settings.theme") ||
        window.localStorage.getItem("caldra_theme_mode");
    } catch {
      raw = null;
    }
  }
  if (raw === "amoled") return "amoled";
  if (raw === "dark") return "dark";
  if (raw === "light") return "light";
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

export interface BuildChamferThemeParams {
  mode: ChamferResolvedThemeMode;
  bgStyle: AuroraStyleOption;
  accentKey: AccentOption;
  cardOpacityPct: number;
  bubbleOpacityPct: number;
}

/**
 * Constrói o conjunto de cores e tokens (`ChamferThemeColors`) com a identidade
 * GRAPHITE TITANIUM (Escuro), PAPEL TÉCNICO MATE (Claro) e PRETO PURO (AMOLED),
 * aplicando Estilo de Fundo (`padrao` | `suave` | `fluido`), Cor de Destaque (`accent`),
 * Opacidade (`cardOpacity` e `bubbleOpacity`), Guarda de Luminância WCAG e Grade Externa a 65%.
 */
export function buildChamferThemeColors(
  modeOrParams: ChamferResolvedThemeMode | BuildChamferThemeParams,
  bgStyleArg?: AuroraStyleOption,
  accentKeyArg?: AccentOption,
  cardOpacityArg?: number,
  bubbleOpacityArg?: number,
): ChamferThemeColors {
  const normalized: BuildChamferThemeParams =
    typeof modeOrParams === "object" && modeOrParams !== null
      ? modeOrParams
      : {
          mode: modeOrParams ?? "dark",
          bgStyle: bgStyleArg ?? "padrao",
          accentKey: accentKeyArg ?? "blue",
          cardOpacityPct: typeof cardOpacityArg === "number" ? cardOpacityArg : 90,
          bubbleOpacityPct: typeof bubbleOpacityArg === "number" ? bubbleOpacityArg : 35,
        };

  const { mode, bgStyle, accentKey, cardOpacityPct, bubbleOpacityPct } = normalized;
  const isDark = mode !== "light";
  const isAmoled = mode === "amoled";

  const accentEntry = ACCENT_MAP[accentKey] ?? ACCENT_MAP.blue;
  const accent = accentEntry.hex;
  const accentRgb = accentEntry.rgb;
  const parsedAccent = parseColorToRgb(accent) ?? { r: 0, g: 102, b: 255 };
  const accentContrast = getRelativeLuminance(parsedAccent) > 0.44 ? "#0F141A" : "#FFFFFF";
  const accentSoft = hexWithAlpha(accent, isDark ? 0.18 : 0.12);
  const accentBorder = hexWithAlpha(accent, isDark ? 0.55 : 0.45);

  const panelOpacity = Math.max(0.25, Math.min(1, (Number(cardOpacityPct) || 90) / 100));
  const rawBubble = Math.max(0.2, Math.min(1, (Number(bubbleOpacityPct) || 35) / 100));
  const bubbleOpacity = Math.max(0.32, Math.min(0.98, rawBubble));

  // 6.1 GRAPHITE TITANIUM (Escuro) | 6.2 PAPEL TÉCNICO MATE (Claro) | 6.3 AMOLED (Preto Puro)
  let canvasBg: string;
  let rawWorkAreaFill: string;
  let workAreaStroke: string;
  let barBgSolid: string;
  let surfaceElevatedSolid: string;
  let popoverBgSolid: string;
  let border: string;
  let borderStrong: string;
  let borderSubtle: string;
  let textPrimary: string;
  let textSecondary: string;
  let textMuted: string;
  let gridMajor: string;
  let gridMinor: string;
  let gridOuterMajor: string;
  let gridOuterMinor: string;
  let axisX: string;
  let axisY: string;
  let statusSuccess: string;
  let statusWarning: string;
  let statusError: string;
  let statusInfo: string;

  if (isAmoled) {
    // 6.3 Tema AMOLED (Preto Puro)
    canvasBg =
      bgStyle === "suave"
        ? "#060911"
        : bgStyle === "fluido"
          ? "#070B13"
          : "#000000";
    rawWorkAreaFill =
      bgStyle === "suave"
        ? "#0A0F1A"
        : bgStyle === "fluido"
          ? "#0D1420"
          : "#05070A";
    workAreaStroke = "#1F2630";
    barBgSolid = "#080A0E";
    surfaceElevatedSolid = "#0E1117";
    popoverBgSolid = "#12161E";
    border = "#1A2029";
    borderStrong = "#262F3D";
    borderSubtle = "rgba(255, 255, 255, 0.06)";
    textPrimary = "#ECEFF4";
    textSecondary = "#9AA4B2";
    textMuted = "#647080";
    gridMajor = "rgba(148, 163, 184, 0.075)";
    gridMinor = "rgba(148, 163, 184, 0.032)";
    // 65% da opacidade da grade interna
    gridOuterMajor = "rgba(148, 163, 184, 0.049)";
    gridOuterMinor = "rgba(148, 163, 184, 0.021)";
    axisX = "#D97706";
    axisY = "#059669";
    statusSuccess = "#10B981";
    statusWarning = "#F59E0B";
    statusError = "#EF4444";
    statusInfo = "#3B82F6";
  } else if (isDark) {
    // 6.1 Paleta Graphite Titanium / Liquid Silk & Fluid Aurora (Tema Escuro)
    canvasBg =
      bgStyle === "suave"
        ? "#0A0F1A"
        : bgStyle === "fluido"
          ? "#0D1420"
          : "#0B0D11";
    rawWorkAreaFill =
      bgStyle === "suave"
        ? "#0F1624"
        : bgStyle === "fluido"
          ? "#111927"
          : "#0E1116";
    workAreaStroke = "#2B3442";
    barBgSolid = "#11141A";
    surfaceElevatedSolid = "#161A22";
    popoverBgSolid = "#1A1F29";
    border = "#232A35";
    borderStrong = "#2F3847";
    borderSubtle = "rgba(255, 255, 255, 0.07)";
    textPrimary = "#ECEFF4";
    textSecondary = "#9AA4B2";
    textMuted = "#647080";
    gridMajor = "rgba(148, 163, 184, 0.08)";
    gridMinor = "rgba(148, 163, 184, 0.035)";
    // 65% da opacidade da grade interna (0.08 * 0.65 = 0.052; 0.035 * 0.65 = 0.023)
    gridOuterMajor = "rgba(148, 163, 184, 0.052)";
    gridOuterMinor = "rgba(148, 163, 184, 0.023)";
    axisX = "#D97706";
    axisY = "#059669";
    statusSuccess = "#10B981";
    statusWarning = "#F59E0B";
    statusError = "#EF4444";
    statusInfo = "#3B82F6";
  } else {
    // 6.2 Tema Claro (Alabastro Luminoso #F6F8FC em Fluid Aurora / Pérola #F2F6FC em Fluid)
    canvasBg =
      bgStyle === "suave"
        ? "#EEF3FA"
        : bgStyle === "fluido"
          ? "#E9F0FA"
          : "#EAEEF3";
    rawWorkAreaFill =
      bgStyle === "suave"
        ? "#F6F8FC"
        : bgStyle === "fluido"
          ? "#F2F6FC"
          : "#F3F5F8";
    workAreaStroke = "#B8C2CC";
    barBgSolid = "#F8FAFC";
    surfaceElevatedSolid = "#FFFFFF";
    popoverBgSolid = "#FFFFFF";
    border = "#D5DCE4";
    borderStrong = "#B8C2CC";
    borderSubtle = "rgba(15, 23, 42, 0.08)";
    textPrimary = "#0F141A";
    textSecondary = "#4B5563";
    textMuted = "#6B7280";
    gridMajor = "rgba(15, 23, 42, 0.09)";
    gridMinor = "rgba(15, 23, 42, 0.04)";
    // 65% da opacidade da grade interna (0.09 * 0.65 = 0.0585; 0.04 * 0.65 = 0.026)
    gridOuterMajor = "rgba(15, 23, 42, 0.058)";
    gridOuterMinor = "rgba(15, 23, 42, 0.026)";
    axisX = "#B45309";
    axisY = "#047857";
    statusSuccess = "#059669";
    statusWarning = "#D97706";
    statusError = "#DC2626";
    statusInfo = "#2563EB";
  }

  // 6.4 Guarda de Luminância WCAG entre o fundo externo e a Área de Trabalho
  const guarded = enforceWorkspaceLuminanceGuard(canvasBg, rawWorkAreaFill, isDark);
  const workAreaFill = guarded.workAreaFill;
  const luminanceStepRatio = guarded.ratio;
  const bgRoot = canvasBg;

  const workAreaBadgeBg = hexWithAlpha(surfaceElevatedSolid, panelOpacity);
  const workAreaBadgeBorder = borderStrong;
  const workAreaBadgeText = textPrimary;

  // Curva Senoidal de 10 Paradas (Ease-Out Scrim) para eliminar totalmente color banding e anéis:
  // 0% (1.00), 15% (0.92), 30% (0.78), 45% (0.58), 60% (0.38), 75% (0.20), 88% (0.07), 95% (0.02), 100% (0.00)
  const buildSinusoidalRadial = (pos: string, rgb: string, baseAlpha: number, shape = "circle") => {
    const s = [
      [0, 1.0],
      [15, 0.92],
      [30, 0.78],
      [45, 0.58],
      [60, 0.38],
      [75, 0.2],
      [88, 0.07],
      [95, 0.02],
      [100, 0.0],
    ]
      .map(([pct, factor]) => `rgba(${rgb}, ${(baseAlpha * factor!).toFixed(4)}) ${pct}%`)
      .join(", ");
    return `radial-gradient(${shape} at ${pos}, ${s})`;
  };

  const canvasOverlayGradient =
    bgStyle === "fluido"
      ? isDark
        ? [
            buildSinusoidalRadial("22% 24%", "30, 58, 95", 0.42),
            buildSinusoidalRadial("78% 36%", "30, 38, 72", 0.38),
            buildSinusoidalRadial("46% 80%", "22, 62, 82", 0.36),
          ].join(", ")
        : [
            buildSinusoidalRadial("22% 24%", "220, 232, 249", 0.68),
            buildSinusoidalRadial("78% 36%", "232, 230, 250", 0.62),
            buildSinusoidalRadial("48% 78%", "255, 255, 255", 0.75),
          ].join(", ")
      : bgStyle === "suave"
        ? isDark
          ? [
              buildSinusoidalRadial("18% 18%", "245, 158, 11", 0.16, "ellipse 75% 55%"),
              buildSinusoidalRadial("52% 16%", "225, 29, 72", 0.13, "ellipse 70% 52%"),
              buildSinusoidalRadial("82% 48%", "14, 165, 233", 0.16, "ellipse 75% 58%"),
              buildSinusoidalRadial("44% 84%", "99, 102, 241", 0.12, "ellipse 80% 56%"),
            ].join(", ")
          : [
              buildSinusoidalRadial("18% 18%", "251, 191, 36", 0.18, "ellipse 75% 55%"),
              buildSinusoidalRadial("52% 16%", "244, 114, 182", 0.14, "ellipse 70% 52%"),
              buildSinusoidalRadial("82% 48%", "56, 189, 248", 0.18, "ellipse 75% 58%"),
              buildSinusoidalRadial("44% 84%", "167, 139, 250", 0.14, "ellipse 80% 56%"),
            ].join(", ")
        : "none";

  // Superfícies com opacidade real controlada por cardOpacity e bubbleOpacity
  const barBg = hexWithAlpha(barBgSolid, panelOpacity);
  const surfaceElevated = hexWithAlpha(surfaceElevatedSolid, panelOpacity);
  const popoverBg = hexWithAlpha(popoverBgSolid, panelOpacity);
  const floatingBg = hexWithAlpha(surfaceElevatedSolid, panelOpacity);
  const bubbleBg = hexWithAlpha(surfaceElevatedSolid, bubbleOpacity);

  return {
    mode,
    isDark,
    isAmoled,
    bgStyle,
    accentKey,
    accent,
    accentRgb,
    accentContrast,
    accentSoft,
    accentBorder,
    cardOpacity: panelOpacity,
    panelOpacity,
    bubbleOpacity,
    bgRoot,
    barBgSolid,
    barBg,
    surfaceElevatedSolid,
    surfaceElevated,
    popoverBgSolid,
    popoverBg,
    floatingBg,
    bubbleBg,
    border,
    borderStrong,
    borderSubtle,
    textPrimary,
    textSecondary,
    textMuted,
    canvasBg,
    workAreaFill,
    workAreaStroke,
    workAreaBadgeBg,
    workAreaBadgeBorder,
    workAreaBadgeText,
    canvasOverlayGradient,
    luminanceStepRatio,
    gridMinor,
    gridMajor,
    gridOuterMinor,
    gridOuterMajor,
    gridMinorColor: gridMinor,
    gridMajorColor: gridMajor,
    gridOuterOpacityFactor: 0.65,
    rulerBg: barBg,
    rulerBorder: border,
    rulerText: textPrimary,
    rulerTickMajor: textSecondary,
    rulerTickMinor: borderStrong,
    defaultCutStroke: isDark ? "#ECEFF4" : "#0F141A",
    axisX,
    axisY,
    originFill: "#DC143C",
    statusSuccess,
    statusWarning,
    statusError,
    statusInfo,
  };
}

/**
 * Gera o mapa de variáveis CSS `--chamfer-*` para injeção no container raiz do CHAMFER CAD
 * e espelhamento para Portals.
 */
export function buildChamferCssVariables(colors: ChamferThemeColors): Record<string, string> {
  const toastBg =
    colors.mode === "amoled"
      ? "rgba(10, 15, 21, 0.94)"
      : colors.isDark
        ? "rgba(32, 45, 59, 0.94)"
        : "rgba(255, 255, 255, 0.94)";
  const toastBorder =
    colors.mode === "amoled"
      ? "#1E2A38"
      : colors.isDark
        ? "#344456"
        : "rgba(15, 23, 42, 0.10)";
  const toastTextPrimary =
    colors.mode === "amoled"
      ? "#E6EDF3"
      : colors.isDark
        ? "#DCE5ED"
        : "#0F172A";
  const toastTextSecondary =
    colors.mode === "amoled"
      ? "#9AABBA"
      : colors.isDark
        ? "#9AABBA"
        : "#475569";
  const toastShadow =
    colors.mode === "amoled"
      ? "0 6px 22px rgba(0, 0, 0, 0.65)"
      : colors.isDark
        ? "0 6px 20px rgba(6, 10, 17, 0.42)"
        : "0 4px 16px rgba(15, 23, 42, 0.08)";

  return {
    "--chamfer-bg-root": colors.bgRoot,
    "--chamfer-bar-bg-solid": colors.barBgSolid,
    "--chamfer-bar-bg": colors.barBg,
    "--chamfer-surface-elevated-solid": colors.surfaceElevatedSolid,
    "--chamfer-surface-elevated": colors.surfaceElevated,
    "--chamfer-surface-2": toastBg,
    "--chamfer-popover-bg-solid": colors.popoverBgSolid,
    "--chamfer-popover-bg": colors.popoverBg,
    "--chamfer-floating-bg": colors.floatingBg,
    "--chamfer-bubble-bg": colors.bubbleBg,
    "--chamfer-border": colors.border,
    "--chamfer-border-strong": colors.borderStrong,
    "--chamfer-border-subtle": colors.borderSubtle,
    "--chamfer-text-primary": colors.textPrimary,
    "--chamfer-text-secondary": colors.textSecondary,
    "--chamfer-text-muted": colors.textMuted,
    "--chamfer-accent": colors.accent,
    "--chamfer-accent-primary": colors.accent,
    "--chamfer-accent-rgb": colors.accentRgb,
    "--chamfer-accent-contrast": colors.accentContrast,
    "--chamfer-accent-soft": colors.accentSoft,
    "--chamfer-accent-border": colors.accentBorder,
    "--chamfer-card-opacity": String(colors.panelOpacity),
    "--chamfer-panel-opacity": String(colors.panelOpacity),
    "--chamfer-bubble-opacity": String(colors.bubbleOpacity),
    "--chamfer-canvas-bg": colors.canvasBg,
    "--chamfer-work-area-fill": colors.workAreaFill,
    "--chamfer-workarea-fill": colors.workAreaFill,
    "--chamfer-work-area-stroke": colors.workAreaStroke,
    "--chamfer-workarea-stroke": colors.workAreaStroke,
    "--chamfer-workarea-badge-bg": colors.workAreaBadgeBg,
    "--chamfer-workarea-badge-border": colors.workAreaBadgeBorder,
    "--chamfer-workarea-badge-text": colors.workAreaBadgeText,
    "--chamfer-canvas-overlay-gradient": colors.canvasOverlayGradient,
    "--chamfer-canvas-overlay": colors.canvasOverlayGradient,
    "--chamfer-grid-minor": colors.gridMinor,
    "--chamfer-grid-major": colors.gridMajor,
    "--chamfer-grid-outer-minor": colors.gridOuterMinor,
    "--chamfer-grid-outer-major": colors.gridOuterMajor,
    "--chamfer-axis-x": colors.axisX,
    "--chamfer-axis-y": colors.axisY,
    "--chamfer-status-success": colors.statusSuccess,
    "--chamfer-status-warning": colors.statusWarning,
    "--chamfer-status-error": colors.statusError,
    "--chamfer-status-info": colors.statusInfo,
    "--chamfer-ruler-bg": colors.rulerBg,
    "--chamfer-ruler-border": colors.rulerBorder,
    "--chamfer-ruler-text": colors.rulerText,
    "--chamfer-toast-bg": toastBg,
    "--chamfer-toast-border": toastBorder,
    "--chamfer-toast-text": toastTextPrimary,
    "--chamfer-toast-text-secondary": toastTextSecondary,
    "--chamfer-toast-shadow": toastShadow,
    "--chamfer-toast-success": "#50C49B",
    "--chamfer-toast-warning": "#E4B36B",
    "--chamfer-toast-error": "#E66F78",
    "--chamfer-toast-info": colors.accent,
  };
}

/**
 * Hook principal de aparência do CHAMFER CAD: conecta `SettingsProvider` (tema, estilo de fundo,
 * cor de destaque, opacidade de cartões e opacidade de bolhas) aos tokens `--chamfer-*`,
 * `themeColors` e `themeVersion`.
 */
export function useChamferAppearance() {
  const settings = useSettings();
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (ev: MediaQueryListEvent) => setSystemDark(ev.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const resolvedMode: ChamferResolvedThemeMode = useMemo(() => {
    if (settings.theme === "amoled") return "amoled";
    if (settings.theme === "dark") return "dark";
    if (settings.theme === "light") return "light";
    return systemDark ? "dark" : "light";
  }, [settings.theme, systemDark]);

  const themeColors = useMemo(
    () =>
      buildChamferThemeColors({
        mode: resolvedMode,
        bgStyle: settings.auroraStyle,
        accentKey: settings.accent,
        cardOpacityPct: settings.cardOpacity,
        bubbleOpacityPct: settings.bubbleOpacity,
      }),
    [
      resolvedMode,
      settings.auroraStyle,
      settings.accent,
      settings.cardOpacity,
      settings.bubbleOpacity,
    ],
  );

  const cssVariablesMap = useMemo(
    () => buildChamferCssVariables(themeColors),
    [themeColors],
  );

  const cssVariables = useMemo(
    () => cssVariablesMap as unknown as React.CSSProperties,
    [cssVariablesMap],
  );

  // Espelha as variáveis escopadas `--chamfer-*` no document.documentElement de forma síncrona (layout)
  // para que o View Transitions API e Portals capturem o novo tema no mesmo quadro de flushSync.
  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [key, val] of Object.entries(cssVariablesMap)) {
      root.style.setProperty(key, val);
    }
  }, [cssVariablesMap]);

  const themeVersion = useMemo(
    () =>
      `${themeColors.mode}|${themeColors.bgStyle}|${themeColors.accentKey}|${themeColors.panelOpacity}|${themeColors.bubbleOpacity}`,
    [themeColors],
  );

  return {
    themeColors,
    cssVariables,
    themeVersion,
    resolvedMode,
    isDark: themeColors.isDark,
    isAmoled: themeColors.isAmoled,
    bgStyle: settings.auroraStyle,
    accentKey: settings.accent,
    cardOpacity: settings.cardOpacity,
    bubbleOpacity: settings.bubbleOpacity,
    settings,
  };
}

export function resolveIntentThemeFromDom(rootEl?: HTMLElement | null): IntentThemeTokens {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      mode: "dark",
      isDark: true,
      prefersReducedMotion: false,
      prefersHighContrast: false,
      ...FALLBACK_DARK_TOKENS,
    };
  }

  const docEl = rootEl ?? document.documentElement;
  const classList = docEl.classList;
  const dataTheme = (docEl.getAttribute("data-theme") ?? "").toLowerCase();

  const style = window.getComputedStyle(docEl);
  const rawBg =
    style.getPropertyValue("--chamfer-bg-root").trim() ||
    style.getPropertyValue("--background").trim() ||
    style.backgroundColor;
  const rawFg =
    style.getPropertyValue("--chamfer-text-primary").trim() ||
    style.getPropertyValue("--foreground").trim() ||
    style.color;
  const rawCard =
    style.getPropertyValue("--chamfer-bar-bg-solid").trim() ||
    style.getPropertyValue("--card").trim();
  const rawBorder =
    style.getPropertyValue("--chamfer-border").trim() ||
    style.getPropertyValue("--border").trim();
  const rawAccent =
    style.getPropertyValue("--chamfer-accent").trim() ||
    style.getPropertyValue("--accent-color").trim() ||
    style.getPropertyValue("--accent").trim() ||
    style.getPropertyValue("--accent-rgb").trim();

  const bgRgb = parseColorToRgb(rawBg);
  const fgRgb = parseColorToRgb(rawFg);
  const cardRgb = parseColorToRgb(rawCard);
  const borderRgb = parseColorToRgb(rawBorder);
  const accentRgb = parseColorToRgb(rawAccent);

  let mode: IntentThemeMode = "dark";
  if (classList.contains("amoled") || dataTheme === "amoled") {
    mode = "amoled";
  } else if (classList.contains("mestre") || dataTheme === "mestre") {
    mode = "mestre";
  } else if (classList.contains("dark") || dataTheme === "dark") {
    mode = "dark";
  } else if (classList.contains("light") || dataTheme === "light") {
    mode = "light";
  } else if (bgRgb) {
    const lum = getRelativeLuminance(bgRgb);
    mode = lum > 0.45 ? "light" : "dark";
  } else {
    const resolved = resolveChamferThemeMode();
    mode = resolved;
  }

  const isDark = mode !== "light";
  const base = isDark ? FALLBACK_DARK_TOKENS : FALLBACK_LIGHT_TOKENS;

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prefersHighContrast =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-contrast: more)").matches;

  const ciBg =
    mode === "amoled"
      ? "#000000"
      : bgRgb
        ? rgbToHex(bgRgb)
        : base.ciBg;

  const ciSurface =
    mode === "amoled"
      ? "#080C14"
      : cardRgb
        ? rgbToHex(cardRgb)
        : base.ciSurface;

  const ciText = fgRgb ? rgbToHex(fgRgb) : base.ciText;
  const ciBorder = borderRgb ? rgbToHex(borderRgb) : base.ciBorder;

  const resolvedAccent = accentRgb ? rgbToHex(accentRgb) : base.accent;
  const ciAccent = displayColor(resolvedAccent, ciSurface, 3.0);

  const accentFinalRgb = parseColorToRgb(ciAccent) ?? parseColorToRgb(base.ciAccent)!;
  const ciAccentContrast =
    getRelativeLuminance(accentFinalRgb) > 0.42 ? "#0F172A" : "#FFFFFF";

  const cadCanvas =
    mode === "amoled"
      ? "#02050A"
      : style.getPropertyValue("--chamfer-workarea-fill").trim() || base.cadCanvas;

  return {
    mode,
    isDark,
    prefersReducedMotion,
    prefersHighContrast,
    background: ciBg,
    canvas: cadCanvas,
    panel: ciSurface,
    panelElevated: base.panelElevated,
    border: ciBorder,
    textPrimary: ciText,
    textSecondary: base.textSecondary,
    accent: resolvedAccent,
    selection: resolvedAccent,
    axisX: base.axisX,
    axisY: base.axisY,
    snap: base.snap,
    dimension: base.dimension,
    warning: base.warning,
    error: base.error,
    confirm: base.confirm,
    ciBg,
    ciSurface,
    ciSurface2: base.ciSurface2,
    ciBorder,
    ciText,
    ciTextMuted: base.ciTextMuted,
    ciAccent,
    ciAccentContrast,
    ciSuccess: base.ciSuccess,
    ciWarning: base.ciWarning,
    ciDanger: base.ciDanger,
    cadCanvas,
    cadGridMinor: base.cadGridMinor,
    cadGridMajor: base.cadGridMajor,
    cadAxisX: base.cadAxisX,
    cadAxisY: base.cadAxisY,
    cadCenter: base.cadCenter,
    cadHidden: base.cadHidden,
    cadDim: displayColor(base.cadDim, cadCanvas, 3.5),
    cadText: displayColor(base.cadText, cadCanvas, 4.5),
    cadSelection: displayColor(resolvedAccent, cadCanvas, 3.5),
    cadProvisional: displayColor(base.cadProvisional, cadCanvas, 3.2),
    cadSheet: base.cadSheet,
    cadSheetInk: base.cadSheetInk,
  };
}

export function buildIntentCssVariables(
  tokens: IntentThemeTokens,
  viewportVars?: { vvhPx?: number; kbdPx?: number },
): React.CSSProperties {
  const vars: Record<string, string> = {
    "--cad-token-background": tokens.background,
    "--cad-token-canvas": tokens.canvas,
    "--cad-token-panel": tokens.panel,
    "--cad-token-panel-elevated": tokens.panelElevated,
    "--cad-token-border": tokens.border,
    "--cad-token-text-primary": tokens.textPrimary,
    "--cad-token-text-secondary": tokens.textSecondary,
    "--cad-token-accent": tokens.accent,
    "--cad-token-selection": tokens.selection,
    "--cad-token-axis-x": tokens.axisX,
    "--cad-token-axis-y": tokens.axisY,
    "--cad-token-snap": tokens.snap,
    "--cad-token-dimension": tokens.dimension,
    "--cad-token-warning": tokens.warning,
    "--cad-token-error": tokens.error,
    "--cad-token-confirm": tokens.confirm,
    "--ci-bg": tokens.ciBg,
    "--ci-surface": tokens.ciSurface,
    "--ci-surface-2": tokens.ciSurface2,
    "--ci-border": tokens.ciBorder,
    "--ci-text": tokens.ciText,
    "--ci-text-muted": tokens.ciTextMuted,
    "--ci-accent": tokens.ciAccent,
    "--ci-accent-contrast": tokens.ciAccentContrast,
    "--ci-success": tokens.ciSuccess,
    "--ci-warning": tokens.ciWarning,
    "--ci-danger": tokens.ciDanger,
    "--cad-canvas": tokens.cadCanvas,
    "--cad-grid-minor": tokens.cadGridMinor,
    "--cad-grid-major": tokens.cadGridMajor,
    "--cad-axis-x": tokens.cadAxisX,
    "--cad-axis-y": tokens.cadAxisY,
    "--cad-center": tokens.cadCenter,
    "--cad-hidden": tokens.cadHidden,
    "--cad-dim": tokens.cadDim,
    "--cad-text": tokens.cadText,
    "--cad-selection": tokens.cadSelection,
    "--cad-provisional": tokens.cadProvisional,
    "--cad-sheet": tokens.cadSheet,
    "--cad-sheet-ink": tokens.cadSheetInk,
  };

  if (viewportVars?.vvhPx && viewportVars.vvhPx > 0) {
    vars["--vvh"] = `${Math.round(viewportVars.vvhPx)}px`;
  }
  if (typeof viewportVars?.kbdPx === "number" && viewportVars.kbdPx >= 0) {
    vars["--kbd"] = `${Math.round(viewportVars.kbdPx)}px`;
  }

  return vars as unknown as React.CSSProperties;
}

export function useIntentTheme(): {
  tokens: IntentThemeTokens;
  cssVariables: React.CSSProperties;
} {
  const [tokens, setTokens] = useState<IntentThemeTokens>(() => resolveIntentThemeFromDom());

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const refreshTheme = () => {
      setTokens(resolveIntentThemeFromDom(document.documentElement));
    };

    refreshTheme();

    const observer = new MutationObserver(() => {
      refreshTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-bg-style", "style"],
    });

    const handleStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key.includes("theme") ||
        e.key.includes("accent") ||
        e.key.includes("opacity") ||
        e.key.includes("bg_style") ||
        e.key.includes("aurora")
      ) {
        refreshTheme();
      }
    };
    window.addEventListener("storage", handleStorage);

    const mqDark =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const mqMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const mqContrast =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-contrast: more)")
        : null;

    mqDark?.addEventListener?.("change", refreshTheme);
    mqMotion?.addEventListener?.("change", refreshTheme);
    mqContrast?.addEventListener?.("change", refreshTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", handleStorage);
      mqDark?.removeEventListener?.("change", refreshTheme);
      mqMotion?.removeEventListener?.("change", refreshTheme);
      mqContrast?.removeEventListener?.("change", refreshTheme);
    };
  }, []);

  const cssVariables = useMemo(() => buildIntentCssVariables(tokens), [tokens]);

  return { tokens, cssVariables };
}

export interface VisualViewportState {
  vvhPx: number;
  vwPx: number;
  kbdPx: number;
  isKeyboardOpen: boolean;
  layoutMode: "compact" | "medium" | "expanded";
}

export function useVisualViewportState(enabled = true): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => {
    if (typeof window === "undefined") {
      return {
        vvhPx: 800,
        vwPx: 390,
        kbdPx: 0,
        isKeyboardOpen: false,
        layoutMode: "compact",
      };
    }
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vvh = window.visualViewport?.height ?? window.innerHeight;
    const layoutH = window.innerHeight;
    const kbd = Math.max(0, layoutH - vvh);
    const isLandscapeMobile = vw >= 560 && vw < 1024 && layoutH <= 500;
    const layoutMode: "compact" | "medium" | "expanded" =
      vw >= 1024 ? "expanded" : vw >= 640 || isLandscapeMobile ? "medium" : "compact";
    return {
      vvhPx: vvh,
      vwPx: vw,
      kbdPx: kbd,
      isKeyboardOpen: kbd > 110,
      layoutMode,
    };
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let rafId: number | null = null;
    const update = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        const vw = vv?.width ?? window.innerWidth;
        const vvh = vv?.height ?? window.innerHeight;
        const layoutH = Math.max(window.innerHeight, vvh);
        const offsetTop = vv?.offsetTop ?? 0;
        const kbd = Math.max(0, layoutH - vvh - offsetTop);
        const isKeyboardOpen = kbd > 110;
        const isLandscapeMobile = vw >= 560 && vw < 1024 && layoutH <= 500;
        const layoutMode: "compact" | "medium" | "expanded" =
          vw >= 1024 ? "expanded" : vw >= 640 || isLandscapeMobile ? "medium" : "compact";

        setState((prev) => {
          if (
            Math.abs(prev.vvhPx - vvh) < 1 &&
            Math.abs(prev.vwPx - vw) < 1 &&
            Math.abs(prev.kbdPx - kbd) < 1 &&
            prev.isKeyboardOpen === isKeyboardOpen &&
            prev.layoutMode === layoutMode
          ) {
            return prev;
          }
          return { vvhPx: vvh, vwPx: vw, kbdPx: kbd, isKeyboardOpen, layoutMode };
        });
      });
    };

    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [enabled]);

  return state;
}
