export type ThemeMode = "light" | "dark" | "system" | "amoled";
export type AccentColor = "default" | "amber" | "blue" | "crimson" | "magenta";
export type AuroraStyle = "fluido" | "suave" | "padrao";
export type ExternalBgStyle = "fluid" | "default" | "smooth";

export const CALDRA_THEME_MODE_KEY = "caldra_theme_mode";
export const CALDRA_ACCENT_COLOR_KEY = "caldra_accent_color";
export const CALDRA_BG_STYLE_KEY = "caldra_bg_style";
export const CALDRA_ORBS_USE_ACCENT_KEY = "caldra_orbs_use_accent";
export const CALDRA_SETTINGS_KEY = "caldra.settings";
export const CALDRA_PLAN_KEY = "caldra.plan";
export const CALDRA_LEGACY_PLAN_KEY = "chameleon.plan";

export const CALDRA_OFFICIAL_BLUE = "#0066FF";

/**
 * 1.1. PALETA VERMELHO CARMESIM (Sólido, Intenso e Profundo)
 * - Primária: #D61818 | Intermediária: #E51A4C | Final: #C11034
 */
export const CALDRA_CRIMSON_TRIAD = {
  primary: "#D61818",
  mid: "#E51A4C",
  deep: "#C11034",
  rgb: "214, 24, 24",
  midRgb: "229, 26, 76",
  deepRgb: "193, 16, 52",
  gradient: "linear-gradient(135deg, #D61818 0%, #D61818 42%, #E51A4C 74%, #C11034 100%)",
} as const;

/**
 * 1.2. PALETA AZUL (Tecnológico, Profundo e Luminoso)
 * - Primária: #003471 | Intermediária: #00A8FF | Final: #2CA5D6
 */
export const CALDRA_BLUE_TRIAD = {
  primary: "#003471",
  light: "#00A8FF",
  reflect: "#2CA5D6",
  rgb: "0, 52, 113",
  lightRgb: "0, 168, 255",
  reflectRgb: "44, 165, 214",
  gradient: "linear-gradient(135deg, #003471 0%, #003471 45%, #00A8FF 78%, #2CA5D6 100%)",
} as const;

/**
 * 1.3. PALETA ÂMBAR (Material Translúcido Iluminado / Metal Aquecido & Mel Escuro)
 * - Primária: #D16002 | Secundária/Densidade: #8A3300 | Final/Reflexo: #F7941D
 */
export const CALDRA_AMBER_TRIAD = {
  primary: "#D16002",
  deep: "#8A3300",
  highlight: "#F7941D",
  rgb: "209, 96, 2",
  deepRgb: "138, 51, 0",
  highlightRgb: "247, 148, 29",
  gradient: "linear-gradient(135deg, #8A3300 0%, #D16002 38%, #D16002 68%, #F7941D 100%)",
} as const;

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

/**
 * Normaliza o modo de tema (Light é o padrão mandatado).
 */
export function normalizeThemeMode(raw: unknown): ThemeMode {
  if (typeof raw !== "string") return "light";
  const val = raw.trim().toLowerCase();
  if (val === "dark" || val === "system" || val === "amoled") return val;
  return "light";
}

/**
 * Normaliza a cor de destaque (Azul é o padrão mandatado).
 */
export function normalizeAccentColor(raw: unknown): AccentColor {
  if (typeof raw !== "string") return "blue";
  const val = raw.trim().toLowerCase();
  if (
    val === "blue" ||
    val === "#0066ff" ||
    val === "#003471" ||
    val === "#00a8ff" ||
    val === "#2ca5d6" ||
    val === "#007aff" ||
    val === "#00ccff" ||
    val === "azul"
  ) {
    return "blue";
  }
  if (
    val === "amber" ||
    val === "#f59e0b" ||
    val === "#d16002" ||
    val === "#8a3300" ||
    val === "#f7941d" ||
    val === "ambar"
  ) {
    return "amber";
  }
  if (
    val === "crimson" ||
    val === "magenta" ||
    val === "#b22222" ||
    val === "#d61818" ||
    val === "#e51a4c" ||
    val === "#c11034" ||
    val === "vermelho"
  ) {
    return "crimson";
  }
  if (val === "default" || val === "neutro") return "default";
  return "blue";
}

/**
 * Converte estilo de fundo externo ('fluid' | 'default' | 'smooth') para o estilo interno ('fluido' | 'padrao' | 'suave').
 */
export function toInternalAuroraStyle(raw: unknown): AuroraStyle | null {
  if (typeof raw !== "string") return null;
  const val = raw.trim().toLowerCase();
  if (val === "fluid" || val === "fluido") return "fluido";
  if (val === "default" || val === "padrao") return "padrao";
  if (val === "smooth" || val === "suave") return "suave";
  return null;
}

/**
 * Converte estilo interno ('fluido' | 'padrao' | 'suave') para o formato externo do requisito ('fluid' | 'default' | 'smooth').
 */
export function toExternalBgStyle(style: AuroraStyle): ExternalBgStyle {
  if (style === "fluido") return "fluid";
  if (style === "suave") return "smooth";
  return "default";
}

/**
 * Converte cor interna de destaque para representação amigável ou hexadecimal oficial.
 */
export function toStoredAccentColor(accent: AccentColor): string {
  if (accent === "blue") return CALDRA_OFFICIAL_BLUE;
  if (accent === "amber") return CALDRA_AMBER_TRIAD.primary;
  if (accent === "crimson" || accent === "magenta") return CALDRA_CRIMSON_TRIAD.primary;
  return "default";
}

/**
 * Converte uma string hexadecimal (#RGB ou #RRGGBB) em canais numéricos RGB (r, g, b).
 */
export function hexToRgbChannels(hex: string): { r: number; g: number; b: number; rgb: string } | null {
  if (typeof hex !== "string") return null;
  const cleaned = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r, g, b, rgb: `${r}, ${g}, ${b}` };
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return { r, g, b, rgb: `${r}, ${g}, ${b}` };
  }
  return null;
}

export interface ResolvedAccentTriadTokens {
  accentColor: string;
  accentRgb: string;
  accentPrimary: string;
  accentMid: string;
  accentDeep: string;
  accentGradient: string;
  accentBorder: string;
  accentSurface: string;
  accentGlow: string;
}

/**
 * Resolve dinamicamente os tokens `--accent-color`, `--accent-rgb` e toda a tríade
 * de 3 estágios (`--accent-primary`, `--accent-mid`, `--accent-deep`, `--accent-gradient`)
 * para Azul (#003471 / #00A8FF / #2CA5D6), Âmbar (#D16002 / #8A3300 / #F7941D),
 * Vermelho Carmesim (#D61818 / #E51A4C / #C11034) ou Neutro.
 */
export function resolveAccentColorTokens(
  accent: AccentColor | string,
  isDark: boolean,
  customHex?: string | null,
): ResolvedAccentTriadTokens {
  const directHex =
    (typeof accent === "string" && accent.trim().startsWith("#") ? accent.trim() : null) ??
    (typeof customHex === "string" && customHex.trim().startsWith("#") ? customHex.trim() : null);

  const normalized = typeof accent === "string" ? accent.trim().toLowerCase() : "blue";

  if (
    normalized === "blue" ||
    normalized === "#0066ff" ||
    normalized === "#003471" ||
    normalized === "#00a8ff" ||
    normalized === "#2ca5d6" ||
    normalized === "azul"
  ) {
    const activeHex = isDark ? CALDRA_BLUE_TRIAD.light : CALDRA_BLUE_TRIAD.primary;
    const activeRgb = isDark ? CALDRA_BLUE_TRIAD.lightRgb : CALDRA_BLUE_TRIAD.rgb;
    return {
      accentColor: activeHex,
      accentRgb: activeRgb,
      accentPrimary: CALDRA_BLUE_TRIAD.primary,
      accentMid: CALDRA_BLUE_TRIAD.light,
      accentDeep: CALDRA_BLUE_TRIAD.reflect,
      accentGradient: CALDRA_BLUE_TRIAD.gradient,
      accentBorder: isDark ? "rgba(0, 168, 255, 0.36)" : "rgba(0, 52, 113, 0.34)",
      accentSurface: isDark ? "rgba(0, 168, 255, 0.14)" : "rgba(0, 52, 113, 0.12)",
      accentGlow: "0 8px 24px -6px rgba(0, 168, 255, 0.32), inset 0 1px 0 rgba(44, 165, 214, 0.35)",
    };
  }

  if (
    normalized === "amber" ||
    normalized === "#f59e0b" ||
    normalized === "#d16002" ||
    normalized === "#8a3300" ||
    normalized === "#f7941d" ||
    normalized === "ambar"
  ) {
    const activeHex = isDark ? CALDRA_AMBER_TRIAD.highlight : CALDRA_AMBER_TRIAD.primary;
    return {
      accentColor: activeHex,
      accentRgb: CALDRA_AMBER_TRIAD.rgb,
      accentPrimary: CALDRA_AMBER_TRIAD.primary,
      accentMid: CALDRA_AMBER_TRIAD.deep,
      accentDeep: CALDRA_AMBER_TRIAD.highlight,
      accentGradient: CALDRA_AMBER_TRIAD.gradient,
      accentBorder: isDark ? "rgba(247, 148, 29, 0.38)" : "rgba(209, 96, 2, 0.36)",
      accentSurface: isDark ? "rgba(209, 96, 2, 0.16)" : "rgba(209, 96, 2, 0.12)",
      accentGlow: "0 8px 24px -6px rgba(209, 96, 2, 0.34), inset 0 1px 0 rgba(247, 148, 29, 0.38)",
    };
  }

  if (
    normalized === "crimson" ||
    normalized === "magenta" ||
    normalized === "#b22222" ||
    normalized === "#d61818" ||
    normalized === "#e51a4c" ||
    normalized === "#c11034" ||
    normalized === "vermelho" ||
    normalized === "red"
  ) {
    const activeHex = isDark ? CALDRA_CRIMSON_TRIAD.mid : CALDRA_CRIMSON_TRIAD.primary;
    return {
      accentColor: activeHex,
      accentRgb: CALDRA_CRIMSON_TRIAD.rgb,
      accentPrimary: CALDRA_CRIMSON_TRIAD.primary,
      accentMid: CALDRA_CRIMSON_TRIAD.mid,
      accentDeep: CALDRA_CRIMSON_TRIAD.deep,
      accentGradient: CALDRA_CRIMSON_TRIAD.gradient,
      accentBorder: isDark ? "rgba(229, 26, 76, 0.38)" : "rgba(214, 24, 24, 0.34)",
      accentSurface: isDark ? "rgba(214, 24, 24, 0.16)" : "rgba(214, 24, 24, 0.12)",
      accentGlow: "0 8px 24px -6px rgba(214, 24, 24, 0.35), inset 0 1px 0 rgba(229, 26, 76, 0.32)",
    };
  }

  if (normalized === "default" || normalized === "neutro") {
    const hex = isDark ? "#F1F5F9" : "#0F172A";
    const rgb = hexToRgbChannels(hex)!;
    return {
      accentColor: hex,
      accentRgb: rgb.rgb,
      accentPrimary: hex,
      accentMid: isDark ? "#94A3B8" : "#475569",
      accentDeep: "#64748B",
      accentGradient: isDark
        ? "linear-gradient(135deg, #F1F5F9 0%, #94A3B8 60%, #64748B 100%)"
        : "linear-gradient(135deg, #0F172A 0%, #334155 60%, #64748B 100%)",
      accentBorder: `rgba(${rgb.rgb}, 0.32)`,
      accentSurface: `rgba(${rgb.rgb}, 0.12)`,
      accentGlow: `0 6px 18px -6px rgba(${rgb.rgb}, 0.25)`,
    };
  }

  if (directHex) {
    const parsed = hexToRgbChannels(directHex);
    if (parsed) {
      return {
        accentColor: directHex,
        accentRgb: parsed.rgb,
        accentPrimary: directHex,
        accentMid: directHex,
        accentDeep: directHex,
        accentGradient: `linear-gradient(135deg, ${directHex} 0%, ${directHex} 100%)`,
        accentBorder: `rgba(${parsed.rgb}, 0.34)`,
        accentSurface: `rgba(${parsed.rgb}, 0.12)`,
        accentGlow: `0 6px 18px -6px rgba(${parsed.rgb}, 0.28)`,
      };
    }
  }

  // Fallback padrão: Tríade Azul CALDRA (#003471 / #00A8FF / #2CA5D6)
  return {
    accentColor: isDark ? CALDRA_BLUE_TRIAD.light : CALDRA_BLUE_TRIAD.primary,
    accentRgb: isDark ? CALDRA_BLUE_TRIAD.lightRgb : CALDRA_BLUE_TRIAD.rgb,
    accentPrimary: CALDRA_BLUE_TRIAD.primary,
    accentMid: CALDRA_BLUE_TRIAD.light,
    accentDeep: CALDRA_BLUE_TRIAD.reflect,
    accentGradient: CALDRA_BLUE_TRIAD.gradient,
    accentBorder: isDark ? "rgba(0, 168, 255, 0.36)" : "rgba(0, 52, 113, 0.34)",
    accentSurface: isDark ? "rgba(0, 168, 255, 0.14)" : "rgba(0, 52, 113, 0.12)",
    accentGlow: "0 8px 24px -6px rgba(0, 168, 255, 0.32), inset 0 1px 0 rgba(44, 165, 214, 0.35)",
  };
}

/**
 * Mapeia o slider `Opacidade das Bolhas e Badges` (20% a 100%) para uma escala
 * translúcida segura de preenchimento (0.10 a 0.38) e borda (0.22 a 0.62),
 * impedindo que bolhas e badges fiquem 100% sólidas na mesma cor do ícone/texto.
 */
export function resolveBubbleTintTokens(bubbleOpacityPct: number): {
  rawRatio: number;
  fillAlpha: number;
  borderAlpha: number;
} {
  const clampedPct =
    typeof bubbleOpacityPct === "number" && Number.isFinite(bubbleOpacityPct)
      ? Math.min(100, Math.max(20, bubbleOpacityPct))
      : 35;
  const rawRatio = Number((clampedPct / 100).toFixed(2));
  const normalized = (clampedPct - 20) / 80; // 0.0 em 20% -> 1.0 em 100%
  const fillAlpha = Number((0.10 + normalized * 0.28).toFixed(3)); // 0.10 -> 0.38
  const borderAlpha = Number(Math.min(0.62, fillAlpha * 1.35 + 0.12).toFixed(3)); // 0.255 -> 0.62
  return { rawRatio, fillAlpha, borderAlpha };
}

/**
 * Verifica se o usuário tem privilégio PRO com base no armazenamento.
 */
export function checkIsProFromStorage(storage?: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    const plan = storage.getItem(CALDRA_PLAN_KEY) ?? storage.getItem(CALDRA_LEGACY_PLAN_KEY);
    return plan?.trim().toLowerCase() === "pro";
  } catch {
    return false;
  }
}

export interface AppearancePreferences {
  theme: ThemeMode;
  accent: AccentColor;
  auroraStyle: AuroraStyle;
  useAccentInOrbs: boolean;
  isProViolation: boolean;
}

/**
 * Lê as preferências salvas no armazenamento ou gera o estado padrão inicial:
 * - Modo de Exibição: Claro ('light')
 * - Cor de Destaque: Azul ('blue')
 * - Estilo de Fundo: Condicional (isPro ? 'fluid'/'fluido' : 'default'/'padrao')
 * - Usar Cor de Destaque nos Orbes: false (preserva as 7 cores originais dos Orbes por padrão)
 */
export function readAppearancePreferences(
  storage: StorageLike | null,
  isProOverride?: boolean,
): AppearancePreferences {
  const isPro = Boolean(isProOverride || checkIsProFromStorage(storage));
  const defaultAurora: AuroraStyle = isPro ? "fluido" : "padrao";

  if (!storage) {
    return {
      theme: "light",
      accent: "blue",
      auroraStyle: defaultAurora,
      useAccentInOrbs: false,
      isProViolation: false,
    };
  }

  try {
    const rawTheme = storage.getItem(CALDRA_THEME_MODE_KEY);
    const rawAccent = storage.getItem(CALDRA_ACCENT_COLOR_KEY);
    const rawBgStyle = storage.getItem(CALDRA_BG_STYLE_KEY);
    const rawOrbsAccent = storage.getItem(CALDRA_ORBS_USE_ACCENT_KEY);

    let parsedSettings: Record<string, unknown> = {};
    const rawSettings = storage.getItem(CALDRA_SETTINGS_KEY);
    if (rawSettings) {
      try {
        parsedSettings = JSON.parse(rawSettings) || {};
      } catch {
        parsedSettings = {};
      }
    }

    // 1. Tema
    const themeCandidate = rawTheme ?? (parsedSettings.theme as string | undefined);
    const theme = normalizeThemeMode(themeCandidate);

    // 2. Cor de destaque
    const accentCandidate = rawAccent ?? (parsedSettings.accent as string | undefined);
    const accent = normalizeAccentColor(accentCandidate);

    // 3. Estilo de fundo (Aurora)
    let styleCandidate: AuroraStyle | null = null;
    if (rawBgStyle) {
      styleCandidate = toInternalAuroraStyle(rawBgStyle);
    } else if (typeof parsedSettings.auroraStyle === "string") {
      styleCandidate = toInternalAuroraStyle(parsedSettings.auroraStyle);
    } else if (parsedSettings.aurora === false || parsedSettings.auroraStyle === "estatico") {
      styleCandidate = "padrao";
    }

    let auroraStyle = styleCandidate ?? defaultAurora;
    let isProViolation = false;

    // 4. Usar Cor de Destaque nos Orbes (padrão false para preservar as 7 cores originais)
    const useAccentInOrbs =
      rawOrbsAccent === "true" ||
      (rawOrbsAccent === null && parsedSettings.useAccentInOrbs === true);

    if (auroraStyle === "fluido" && !isPro) {
      auroraStyle = "padrao";
      isProViolation = true;
      try {
        storage.setItem(CALDRA_BG_STYLE_KEY, "default");
        if (rawSettings) {
          storage.setItem(
            CALDRA_SETTINGS_KEY,
            JSON.stringify({ ...parsedSettings, auroraStyle: "padrao" }),
          );
        }
      } catch {
        /* ignore */
      }
    }

    return {
      theme,
      accent,
      auroraStyle,
      useAccentInOrbs,
      isProViolation,
    };
  } catch {
    return {
      theme: "light",
      accent: "blue",
      auroraStyle: defaultAurora,
      useAccentInOrbs: false,
      isProViolation: false,
    };
  }
}

/**
 * Persiste as preferências no localStorage sob as chaves obrigatórias
 * (`caldra_theme_mode`, `caldra_accent_color`, `caldra_bg_style`, `caldra_orbs_use_accent` e `caldra.settings`).
 */
export function persistAppearancePreferences(
  storage: StorageLike | null,
  prefs: {
    theme: ThemeMode;
    accent: AccentColor;
    auroraStyle: AuroraStyle;
    useAccentInOrbs?: boolean;
  },
): void {
  if (!storage) return;
  try {
    storage.setItem(CALDRA_THEME_MODE_KEY, prefs.theme);
    storage.setItem(CALDRA_ACCENT_COLOR_KEY, toStoredAccentColor(prefs.accent));
    storage.setItem(CALDRA_BG_STYLE_KEY, toExternalBgStyle(prefs.auroraStyle));
    if (typeof prefs.useAccentInOrbs === "boolean") {
      storage.setItem(CALDRA_ORBS_USE_ACCENT_KEY, prefs.useAccentInOrbs ? "true" : "false");
    }

    let parsedSettings: Record<string, unknown> = {};
    const raw = storage.getItem(CALDRA_SETTINGS_KEY);
    if (raw) {
      try {
        parsedSettings = JSON.parse(raw) || {};
      } catch {
        parsedSettings = {};
      }
    }
    const updated = {
      ...parsedSettings,
      theme: prefs.theme,
      accent: prefs.accent,
      auroraStyle: prefs.auroraStyle,
      ...(typeof prefs.useAccentInOrbs === "boolean"
        ? { useAccentInOrbs: prefs.useAccentInOrbs }
        : {}),
      accentAppliedCrimson: true,
    };
    storage.setItem(CALDRA_SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore localStorage exceptions */
  }
}
