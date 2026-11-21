export type ThemeMode = "light" | "dark" | "system" | "amoled";
export type AccentColor = "default" | "amber" | "blue" | "crimson" | "magenta";
export type AuroraStyle = "fluido" | "suave" | "padrao";
export type ExternalBgStyle = "fluid" | "default" | "smooth";

export const CALDRA_THEME_MODE_KEY = "caldra_theme_mode";
export const CALDRA_ACCENT_COLOR_KEY = "caldra_accent_color";
export const CALDRA_BG_STYLE_KEY = "caldra_bg_style";
export const CALDRA_SETTINGS_KEY = "caldra.settings";
export const CALDRA_PLAN_KEY = "caldra.plan";
export const CALDRA_LEGACY_PLAN_KEY = "chameleon.plan";

export const CALDRA_OFFICIAL_BLUE = "#0066FF";

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
 * Normaliza a cor de destaque (Azul '#0066FF' é o padrão mandatado).
 */
export function normalizeAccentColor(raw: unknown): AccentColor {
  if (typeof raw !== "string") return "blue";
  const val = raw.trim().toLowerCase();
  if (val === "blue" || val === "#0066ff" || val === "#007aff" || val === "#00ccff" || val === "azul") {
    return "blue";
  }
  if (val === "amber" || val === "#f59e0b" || val === "ambar") return "amber";
  if (val === "crimson" || val === "magenta" || val === "#b22222" || val === "vermelho") return "crimson";
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
  if (accent === "amber") return "#F59E0B";
  if (accent === "crimson" || accent === "magenta") return "#B22222";
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

/**
 * Resolve dinamicamente os tokens `--accent-color` (HEX) e `--accent-rgb` ("r, g, b")
 * para qualquer cor de destaque do CALDRA (Azul #0066FF, Vermelho, Âmbar, Laranja, Neutro ou HEX customizado).
 */
export function resolveAccentColorTokens(
  accent: AccentColor | string,
  isDark: boolean,
  customHex?: string | null,
): { accentColor: string; accentRgb: string } {
  // 1. Se um HEX explícito foi fornecido diretamente em `accent` ou `customHex`
  const directHex =
    (typeof accent === "string" && accent.trim().startsWith("#") ? accent.trim() : null) ??
    (typeof customHex === "string" && customHex.trim().startsWith("#") ? customHex.trim() : null);

  const normalized = typeof accent === "string" ? accent.trim().toLowerCase() : "blue";

  if (normalized === "blue" || normalized === "#0066ff" || normalized === "azul") {
    const hex = isDark ? "#3B82F6" : CALDRA_OFFICIAL_BLUE;
    const rgb = hexToRgbChannels(CALDRA_OFFICIAL_BLUE)!;
    return { accentColor: hex, accentRgb: rgb.rgb };
  }

  if (normalized === "amber" || normalized === "#f59e0b" || normalized === "ambar") {
    const hex = isDark ? "#F59E0B" : "#D97706";
    const rgb = hexToRgbChannels("#F59E0B")!;
    return { accentColor: hex, accentRgb: rgb.rgb };
  }

  if (
    normalized === "crimson" ||
    normalized === "magenta" ||
    normalized === "#b22222" ||
    normalized === "vermelho" ||
    normalized === "red"
  ) {
    const hex = isDark ? "#EF4444" : "#B22222";
    const rgb = hexToRgbChannels(hex)!;
    return { accentColor: hex, accentRgb: rgb.rgb };
  }

  if (normalized === "orange" || normalized === "laranja" || normalized === "#f97316") {
    const hex = isDark ? "#FB923C" : "#EA580C";
    const rgb = hexToRgbChannels("#F97316")!;
    return { accentColor: hex, accentRgb: rgb.rgb };
  }

  if (normalized === "default" || normalized === "neutro") {
    const hex = isDark ? "#F1F5F9" : "#0F172A";
    const rgb = hexToRgbChannels(hex)!;
    return { accentColor: hex, accentRgb: rgb.rgb };
  }

  if (directHex) {
    const parsed = hexToRgbChannels(directHex);
    if (parsed) {
      return { accentColor: directHex, accentRgb: parsed.rgb };
    }
  }

  // Fallback padrão: Azul Oficial CALDRA #0066FF
  return {
    accentColor: isDark ? "#3B82F6" : CALDRA_OFFICIAL_BLUE,
    accentRgb: "0, 102, 255",
  };
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
  isProViolation: boolean;
}

/**
 * Lê as preferências salvas no armazenamento ou gera o estado padrão inicial:
 * - Modo de Exibição: Claro ('light')
 * - Cor de Destaque: Azul ('#0066FF' / 'blue')
 * - Estilo de Fundo: Condicional (isPro ? 'fluid'/'fluido' : 'default'/'padrao')
 *
 * Também executa a validação de segurança:
 * - Se um usuário NÃO PRO tiver 'fluid'/'fluido' salvo, reverte imediatamente para 'default'/'padrao'
 *   e sinaliza `isProViolation: true`.
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
      isProViolation: false,
    };
  }

  try {
    const rawTheme = storage.getItem(CALDRA_THEME_MODE_KEY);
    const rawAccent = storage.getItem(CALDRA_ACCENT_COLOR_KEY);
    const rawBgStyle = storage.getItem(CALDRA_BG_STYLE_KEY);

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

    // Validação de Segurança para o Estilo Fluido:
    // Se o usuário não for PRO e tentar usar 'fluido', reverta para 'padrao'
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
      isProViolation,
    };
  } catch {
    return {
      theme: "light",
      accent: "blue",
      auroraStyle: defaultAurora,
      isProViolation: false,
    };
  }
}

/**
 * Persiste as preferências no localStorage sob as chaves obrigatórias
 * (`caldra_theme_mode`, `caldra_accent_color`, `caldra_bg_style` e `caldra.settings`).
 */
export function persistAppearancePreferences(
  storage: StorageLike | null,
  prefs: {
    theme: ThemeMode;
    accent: AccentColor;
    auroraStyle: AuroraStyle;
  },
): void {
  if (!storage) return;
  try {
    storage.setItem(CALDRA_THEME_MODE_KEY, prefs.theme);
    storage.setItem(CALDRA_ACCENT_COLOR_KEY, toStoredAccentColor(prefs.accent));
    storage.setItem(CALDRA_BG_STYLE_KEY, toExternalBgStyle(prefs.auroraStyle));

    // Mantém compatibilidade com outros módulos que leem caldra.settings
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
      accentAppliedCrimson: true,
    };
    storage.setItem(CALDRA_SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore localStorage exceptions */
  }
}
