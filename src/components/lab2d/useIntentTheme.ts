/**
 * CALDRA — CHAMFER INTENT: ADAPTADOR DE TEMA E VIEWPORT VISUAL (SOMENTE LEITURA)
 *
 * Implementa as seções §2 (Teclado virtual e layout responsivo) e §4 (Tema adaptável)
 * da especificação unificada do CHAMFER INTENT:
 *  - Observa (somente leitura) classes, atributos e variáveis CSS de `document.documentElement`
 *    via MutationObserver + matchMedia; NUNCA modifica o tema global;
 *  - Alimenta tokens semânticos escopados no elemento raiz do Intent:
 *    UI:  --ci-bg, --ci-surface, --ci-surface-2, --ci-border, --ci-text, --ci-text-muted,
 *         --ci-accent, --ci-accent-contrast, --ci-success, --ci-warning, --ci-danger
 *    CAD: --cad-canvas, --cad-grid-minor, --cad-grid-major, --cad-axis-x, --cad-axis-y,
 *         --cad-center, --cad-hidden, --cad-dim, --cad-text, --cad-selection,
 *         --cad-provisional, --cad-sheet, --cad-sheet-ink
 *  - Isola todas as paletas de contingência (hex) exclusivamente dentro deste adaptador;
 *  - Calcula `displayColor(layerTechnicalColor, canvasBg)` garantindo contraste WCAG ≥ 3:1
 *    sobre o fundo do canvas preservando o matiz original sem alterar a cor técnica da entidade;
 *  - Monitora `window.visualViewport` (resize e scroll) expondo `--vvh` e `--kbd`.
 */

import { useState, useEffect, useMemo } from "react";

export type IntentThemeMode = "dark" | "light" | "amoled" | "mestre";

export interface IntentThemeTokens {
  mode: IntentThemeMode;
  isDark: boolean;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
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

/**
 * Paletas de contingência (§4) — único local do módulo autorizado a conter literais hex.
 */
export const FALLBACK_DARK_TOKENS: Omit<
  IntentThemeTokens,
  "mode" | "isDark" | "prefersReducedMotion" | "prefersHighContrast"
> = {
  ciBg: "#060B14",
  ciSurface: "#0B1220",
  ciSurface2: "#0F172A",
  ciBorder: "#1E293B",
  ciText: "#F8FAFC",
  ciTextMuted: "#94A3B8",
  ciAccent: "#0284C7",
  ciAccentContrast: "#F8FAFC",
  ciSuccess: "#10B981",
  ciWarning: "#F59E0B",
  ciDanger: "#EF4444",
  cadCanvas: "#050912",
  cadGridMinor: "#0F172A",
  cadGridMajor: "#1E293B",
  cadAxisX: "#DC2626",
  cadAxisY: "#16A34A",
  cadCenter: "#64748B",
  cadHidden: "#64748B",
  cadDim: "#7DD3FC",
  cadText: "#E2E8F0",
  cadSelection: "#38BDF8",
  cadProvisional: "#F59E0B",
  cadSheet: "#F8FAFC",
  cadSheetInk: "#0F172A",
};

export const FALLBACK_LIGHT_TOKENS: Omit<
  IntentThemeTokens,
  "mode" | "isDark" | "prefersReducedMotion" | "prefersHighContrast"
> = {
  ciBg: "#F8FAFC",
  ciSurface: "#FFFFFF",
  ciSurface2: "#F1F5F9",
  ciBorder: "#E2E8F0",
  ciText: "#0F172A",
  ciTextMuted: "#475569",
  ciAccent: "#0284C7",
  ciAccentContrast: "#FFFFFF",
  ciSuccess: "#059669",
  ciWarning: "#D97706",
  ciDanger: "#DC2626",
  cadCanvas: "#F8FAFC",
  cadGridMinor: "#E2E8F0",
  cadGridMajor: "#CBD5E1",
  cadAxisX: "#DC2626",
  cadAxisY: "#15803D",
  cadCenter: "#64748B",
  cadHidden: "#64748B",
  cadDim: "#0284C7",
  cadText: "#0F172A",
  cadSelection: "#0284C7",
  cadProvisional: "#D97706",
  cadSheet: "#FFFFFF",
  cadSheetInk: "#0F172A",
};

/**
 * Mapa de cores técnicas de camadas CAD (CORTE, GRAVACAO, LINHA_CENTRO, etc.).
 * Preserva a cor técnica da camada e permite ajuste apenas de exibição via `displayColor`.
 */
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

/**
 * Converte string de cor (#RRGGBB, #RGB, rgb(r,g,b), ou ternário "R G B") em RGB [0..255].
 */
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

  const tripletMatch = trimmed.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
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
  const hn = ((h % 360) + 360) % 360 / 360;
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

/**
 * Luminância relativa WCAG 2.1 (0.0 = preto a 1.0 = branco).
 */
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

/**
 * Razão de contraste WCAG 2.1 (1.0 a 21.0).
 */
export function getContrastRatio(fg: RgbColor, bg: RgbColor): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ajusta apenas a cor de EXIBIÇÃO da camada técnica (`layerColor`) sobre `canvasBg`
 * preservando o matiz (H) e garantindo razão de contraste ≥ `minContrast` (padrão 3.0:1).
 * A cor técnica subjacente da camada NUNCA é mutada nos dados ou na exportação.
 */
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
 * Lê de forma pura (somente leitura) o tema ativo no documento (`<html>` / `document.documentElement`)
 * e deriva os tokens `--ci-*` e `--cad-*`.
 */
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
  const rawBg = style.getPropertyValue("--background").trim() || style.backgroundColor;
  const rawFg = style.getPropertyValue("--foreground").trim() || style.color;
  const rawCard = style.getPropertyValue("--card").trim();
  const rawBorder = style.getPropertyValue("--border").trim();
  const rawAccent =
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
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem("caldra-theme") : null;
    if (stored === "light") mode = "light";
    else if (stored === "amoled") mode = "amoled";
    else if (stored === "mestre") mode = "mestre";
    else mode = "dark";
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

  // Cor de destaque: evita vermelho como cor de botão Enviar se o tema não for erro,
  // ou garante contraste adequado sobre o superfície.
  let ciAccent = accentRgb ? rgbToHex(accentRgb) : base.ciAccent;
  const parsedAccent = parseColorToRgb(ciAccent);
  if (parsedAccent) {
    const hslAccent = rgbToHsl(parsedAccent);
    // §1.f & §3: "Vermelho só para erro ou ação destrutiva: o selo DSL e o botão de enviar usam tons neutros e a cor de destaque do tema"
    // Se o tema usar vermelho puro (hue ~0..15 ou 345..360) que pareça estado de erro no enviar, usamos azul técnico industrial
    if ((hslAccent.h <= 14 || hslAccent.h >= 346) && hslAccent.s > 0.6) {
      ciAccent = base.ciAccent;
    } else {
      ciAccent = displayColor(ciAccent, ciSurface, 3.0);
    }
  }

  const accentFinalRgb = parseColorToRgb(ciAccent) ?? parseColorToRgb(base.ciAccent)!;
  const ciAccentContrast =
    getRelativeLuminance(accentFinalRgb) > 0.42 ? "#0F172A" : "#FFFFFF";

  const cadCanvas =
    mode === "amoled"
      ? "#02050A"
      : isDark
        ? base.cadCanvas
        : base.cadCanvas;

  return {
    mode,
    isDark,
    prefersReducedMotion,
    prefersHighContrast,
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
    cadSelection: displayColor(base.cadSelection, cadCanvas, 3.5),
    cadProvisional: displayColor(base.cadProvisional, cadCanvas, 3.2),
    cadSheet: base.cadSheet,
    cadSheetInk: base.cadSheetInk,
  };
}

/**
 * Converte `IntentThemeTokens` em mapa de variáveis CSS para aplicar no container raiz do Intent.
 */
export function buildIntentCssVariables(
  tokens: IntentThemeTokens,
  viewportVars?: { vvhPx?: number; kbdPx?: number },
): React.CSSProperties {
  const vars: Record<string, string> = {
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

/**
 * Hook reativo somente-leitura que sincroniza o tema do CHAMFER INTENT com o tema global do CALDRA.
 */
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
      attributeFilter: ["class", "data-theme", "style"],
    });

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes("theme") || e.key.includes("accent")) {
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

/**
 * Hook que acompanha `window.visualViewport` (resize e scroll) para adaptação
 * exata ao teclado virtual no Android/iOS e cálculo do breakpoint responsivo (§2).
 */
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
