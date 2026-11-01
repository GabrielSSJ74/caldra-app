import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { DEFAULT_REGION, regionOf, type Region, type RegionId } from "@/lib/regional/regional";
import {
  readAppearancePreferences,
  persistAppearancePreferences,
  checkIsProFromStorage,
  resolveAccentColorTokens,
  CALDRA_ACCENT_COLOR_KEY,
  CALDRA_SETTINGS_KEY,
  type ThemeMode,
  type AccentColor,
  type AuroraStyle,
} from "./appearancePreferences";
import {
  requestThemeTransition,
  resolveEffectiveThemeId,
  resolveTokens,
  setMetaThemeColor,
  syncVisualThemeState,
  type ThemeOriginInput,
} from "./themeTransitionEngine";

export type { ThemeMode, AccentColor, AuroraStyle, ThemeOriginInput };
export type ThemeOption = ThemeMode;
export type AccentOption = AccentColor;
export type AuroraStyleOption = AuroraStyle;
export type AppLanguage = "pt" | "en" | "es";
export type Unit = "mm" | "cm" | "m" | "in";
/** APRENDIZ mostra fórmulas e dicas; MESTRE segue direto. Só apresentação. */
export type Level = "aprendiz" | "mestre";
/** Estilo do fundo AURORA: shader WebGL (fluido), Fluid Aurora luz líquida viva (suave) ou sólido (padrao). */
/** PADRÃO = nenhuma camada Aurora (fundo sólido do tema). Só por escolha explícita. */
export type AuroraStyle = "fluido" | "suave" | "padrao";

const KEY = "caldra.settings";

export const DEFAULT_CARD_OPACITY = 90;
export const DEFAULT_BUBBLE_OPACITY = 35;

export type Settings = {
  theme: ThemeMode;
  accent: AccentColor;
  language: AppLanguage;
  unit: Unit;
  precision: number;
  level: Level;
  /** Moeda, formato numérico e catálogo de chapas. */
  region: RegionId;
  /** Estilo do fundo AURORA (recurso PRO para a versão animada). */
  auroraStyle: AuroraStyle;
  /** Modo de ângulo da calculadora científica. */
  calcAngle: "RAD" | "DEG" | "GRAD";
  /** Casas decimais exibidas na calculadora científica. */
  calcPlaces: number;
  /** Opacidade da superfície dos cartões (35% a 100%). */
  cardOpacity: number;
  /** Opacidade da superfície das bolhas/círculos de ícones (20% a 100%). */
  bubbleOpacity: number;
};

const DEFAULTS: Settings = {
  theme: "light",
  accent: "blue",
  language: "pt",
  unit: "mm",
  precision: 2,
  level: "aprendiz",
  region: DEFAULT_REGION,
  auroraStyle: "padrao",
  calcAngle: "DEG",
  calcPlaces: 4,
  cardOpacity: DEFAULT_CARD_OPACITY,
  bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
};

type SettingsValue = Settings & {
  setTheme: (t: ThemeMode, origin?: ThemeOriginInput) => void;
  setAccent: (a: AccentColor) => void;
  setLanguage: (language: AppLanguage) => void;
  setUnit: (u: Unit) => void;
  setPrecision: (p: number) => void;
  setLevel: (l: Level) => void;
  setRegion: (r: RegionId) => void;
  setAuroraStyle: (s: AuroraStyle) => void;
  setCalcAngle: (a: "RAD" | "DEG" | "GRAD") => void;
  setCalcPlaces: (n: number) => void;
  setCardOpacity: (pct: number) => void;
  setBubbleOpacity: (pct: number) => void;
  resetAppearance: (origin?: ThemeOriginInput) => void;
  /** Região resolvida (nunca undefined). */
  regionConfig: Region;
  /** Alias para compatibilidade com componentes CAD 3D que leem `const { settings } = useSettings()` */
  settings: Settings;
};

const SettingsContext = createContext<SettingsValue | null>(null);

/**
 * Leitura SÍNCRONA do armazenamento — fonte única, também usada pelo script
 * pré-paint em `__root.tsx`. Sem isto o app pinta o tema padrão e depois
 * corrige (flash de tonalidade).
 */
export function readStoredSettings(
  isProOverride?: boolean,
): Settings & { isProViolation?: boolean } {
  const isPro = Boolean(
    isProOverride ||
      (typeof window !== "undefined" ? checkIsProFromStorage(window.localStorage) : false),
  );

  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const appearance = readAppearancePreferences(storage, isPro);

  const baseDefaults: Settings = {
    ...DEFAULTS,
    theme: appearance.theme,
    accent: appearance.accent,
    auroraStyle: appearance.auroraStyle,
  };

  if (!storage) return { ...baseDefaults, isProViolation: false };

  try {
    const raw = storage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    const LANGUAGES: AppLanguage[] = ["pt", "en", "es"];
    const language = saved.language && LANGUAGES.includes(saved.language) ? saved.language : "pt";

    const cardOpacity =
      typeof saved.cardOpacity === "number" && !isNaN(saved.cardOpacity)
        ? Math.min(100, Math.max(20, saved.cardOpacity))
        : DEFAULT_CARD_OPACITY;
    const bubbleOpacity =
      typeof saved.bubbleOpacity === "number" && !isNaN(saved.bubbleOpacity)
        ? Math.min(100, Math.max(20, saved.bubbleOpacity))
        : DEFAULT_BUBBLE_OPACITY;

    return {
      ...baseDefaults,
      level: saved.level ?? "aprendiz",
      ...saved,
      theme: appearance.theme,
      accent: appearance.accent,
      auroraStyle: appearance.auroraStyle,
      language,
      cardOpacity,
      bubbleOpacity,
      isProViolation: appearance.isProViolation,
    };
  } catch {
    return { ...baseDefaults, isProViolation: appearance.isProViolation };
  }
}

function applyToDom(s: Settings) {
  const root = document.documentElement;
  const resolvedTheme = resolveEffectiveThemeId(s.theme);
  const dark = resolvedTheme !== "light";

  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = dark ? "dark" : "light";
  root.classList.toggle("dark", dark);
  root.classList.toggle("amoled", resolvedTheme === "amoled");
  root.classList.toggle("accent-default", s.accent === "default");
  root.classList.toggle("accent-blue", s.accent === "blue");
  const isCrimson = s.accent === "crimson" || s.accent === "magenta";
  root.classList.toggle("accent-crimson", isCrimson);
  root.classList.toggle("accent-magenta", isCrimson);
  root.lang = s.language === "pt" ? "pt-BR" : s.language;

  setMetaThemeColor(resolvedTheme);
  syncVisualThemeState(resolvedTheme);

  const semanticTokens = resolveTokens(resolvedTheme);
  for (const [k, v] of Object.entries(semanticTokens)) {
    root.style.setProperty(k, v);
  }

  let storedRawHex: string | null = null;
  try {
    storedRawHex = window.localStorage?.getItem(CALDRA_ACCENT_COLOR_KEY) ?? null;
  } catch {
    storedRawHex = null;
  }
  const { accentColor, accentRgb } = resolveAccentColorTokens(s.accent, dark, storedRawHex);
  root.style.setProperty("--accent-color", accentColor);
  root.style.setProperty("--accent-rgb", accentRgb);

  const cardOp =
    Math.min(
      100,
      Math.max(20, typeof s.cardOpacity === "number" ? s.cardOpacity : DEFAULT_CARD_OPACITY),
    ) / 100;
  const bubbleOp =
    Math.min(
      100,
      Math.max(20, typeof s.bubbleOpacity === "number" ? s.bubbleOpacity : DEFAULT_BUBBLE_OPACITY),
    ) / 100;
  root.style.setProperty("--card-opacity", cardOp.toFixed(2));
  root.style.setProperty("--bubble-opacity", bubbleOp.toFixed(2));
  root.style.setProperty("--ui-opacity", cardOp.toFixed(2));
  root.setAttribute("data-bg-style", s.auroraStyle);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { isMestre } = useFeatureAccess();
  const [storagePro, setStoragePro] = useState(false);
  const isPro = isMestre || storagePro;
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;
  const hydrated = useRef(false);

  const warnProFluidViolation = useCallback(() => {
    toast.info("O estilo de fundo Fluido é exclusivo do CALDRA PRO.", {
      description:
        "Seu estilo foi revertido para Padrão. Faça upgrade para desbloquear o fundo dinâmico fluido.",
      action: {
        label: "Conhecer o PRO",
        onClick: () => {
          window.location.href = "/pro";
        },
      },
      duration: 6000,
    });
  }, []);

  const isInitialMount = useRef(true);

  /* Hidrata do armazenamento após a hidratação do React (o script pré-paint em __root.tsx já aplicou classes no DOM). */
  useEffect(() => {
    const proFromStorage =
      typeof window !== "undefined" ? checkIsProFromStorage(window.localStorage) : false;
    setStoragePro(proFromStorage);
    const effectivePro = isMestre || proFromStorage;
    const stored = readStoredSettings(effectivePro);
    applyToDom(stored);
    setSettings(stored);
    if (stored.isProViolation) {
      warnProFluidViolation();
    }
    if (typeof window !== "undefined") {
      persistAppearancePreferences(window.localStorage, stored);
    }
    hydrated.current = true;
  }, [isMestre, warnProFluidViolation]);

  // Monitora se o status PRO muda e valida permissão do estilo fluido
  useEffect(() => {
    if (!hydrated.current) return;
    if (!isPro && settings.auroraStyle === "fluido") {
      setSettings((s) => ({ ...s, auroraStyle: "padrao" }));
      if (typeof window !== "undefined") {
        persistAppearancePreferences(window.localStorage, {
          theme: settings.theme,
          accent: settings.accent,
          auroraStyle: "padrao",
        });
      }
      warnProFluidViolation();
    }
  }, [isPro, settings.auroraStyle, settings.theme, settings.accent, warnProFluidViolation]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!hydrated.current) return;
    try {
      if (typeof window !== "undefined") {
        persistAppearancePreferences(window.localStorage, settings);
        window.localStorage.setItem(KEY, JSON.stringify(settings));
      }
    } catch {
      /* ignore */
    }
  }, [settings]);

  /* Aplica tema e opacidade no DOM imediatamente após hidratação. */
  useEffect(() => {
    if (!hydrated.current) return;
    applyToDom(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.classList.toggle("mestre", isMestre);
  }, [isMestre]);

  const value = useMemo<SettingsValue>(
    () => ({
      ...settings,
      settings,
      setTheme: (theme, origin) => {
        const cur = settingsRef.current;
        const nextPreview = { ...cur, theme };
        if (typeof window !== "undefined") {
          persistAppearancePreferences(window.localStorage, nextPreview);
          try {
            window.localStorage.setItem(KEY, JSON.stringify(nextPreview));
          } catch {
            /* ignore */
          }
        }
        const nextThemeId = resolveEffectiveThemeId(theme);
        requestThemeTransition(
          nextThemeId,
          () => {
            setSettings((s) => {
              const next = { ...s, theme };
              if (typeof window !== "undefined") {
                persistAppearancePreferences(window.localStorage, next);
                applyToDom(next);
              }
              return next;
            });
          },
          origin,
        );
      },
      setAccent: (accent) => {
        setSettings((s) => {
          const next = { ...s, accent };
          if (typeof window !== "undefined") {
            persistAppearancePreferences(window.localStorage, next);
            applyToDom(next);
          }
          return next;
        });
      },
      setLanguage: (language) => setSettings((s) => ({ ...s, language })),
      setUnit: (unit) => setSettings((s) => ({ ...s, unit })),
      setPrecision: (precision) => setSettings((s) => ({ ...s, precision })),
      setLevel: (level) => setSettings((s) => ({ ...s, level })),
      setRegion: (region) => setSettings((s) => ({ ...s, region })),
      setAuroraStyle: (auroraStyle) => {
        if (auroraStyle === "fluido" && !isPro) {
          warnProFluidViolation();
          setSettings((s) => {
            const next = { ...s, auroraStyle: "padrao" as AuroraStyle };
            if (typeof window !== "undefined") {
              persistAppearancePreferences(window.localStorage, next);
              applyToDom(next);
            }
            return next;
          });
          return;
        }
        setSettings((s) => {
          const next = { ...s, auroraStyle };
          if (typeof window !== "undefined") {
            persistAppearancePreferences(window.localStorage, next);
            applyToDom(next);
          }
          return next;
        });
      },
      setCalcAngle: (calcAngle) => setSettings((s) => ({ ...s, calcAngle })),
      setCalcPlaces: (calcPlaces) => setSettings((s) => ({ ...s, calcPlaces })),
      setCardOpacity: (cardOpacity) => {
        const val = Math.min(100, Math.max(20, cardOpacity));
        setSettings((s) => {
          const next = { ...s, cardOpacity: val };
          if (typeof window !== "undefined") {
            applyToDom(next);
          }
          return next;
        });
      },
      setBubbleOpacity: (bubbleOpacity) => {
        const val = Math.min(100, Math.max(20, bubbleOpacity));
        setSettings((s) => {
          const next = { ...s, bubbleOpacity: val };
          if (typeof window !== "undefined") {
            applyToDom(next);
          }
          return next;
        });
      },
      resetAppearance: (origin) => {
        const cur = settingsRef.current;
        const nextPreview = {
          ...cur,
          theme: "light" as ThemeMode,
          accent: "blue" as AccentColor,
          auroraStyle: (isPro ? "fluido" : "padrao") as AuroraStyle,
          cardOpacity: DEFAULT_CARD_OPACITY,
          bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
        };
        if (typeof window !== "undefined") {
          persistAppearancePreferences(window.localStorage, nextPreview);
        }
        requestThemeTransition(
          "light",
          () => {
            setSettings((s) => {
              const next = {
                ...s,
                theme: "light" as ThemeMode,
                accent: "blue" as AccentColor,
                auroraStyle: (isPro ? "fluido" : "padrao") as AuroraStyle,
                cardOpacity: DEFAULT_CARD_OPACITY,
                bubbleOpacity: DEFAULT_BUBBLE_OPACITY,
              };
              if (typeof window !== "undefined") {
                persistAppearancePreferences(window.localStorage, next);
                applyToDom(next);
              }
              return next;
            });
          },
          origin,
        );
      },
      regionConfig: regionOf(settings.region),
    }),
    [settings, isPro, warnProFluidViolation],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings deve ser usado dentro de SettingsProvider");
  return ctx;
}

const FACTOR: Record<Unit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

/** Converte um valor em milímetros para a unidade escolhida. */
export function fromMm(valueMm: number, unit: Unit): number {
  return valueMm / FACTOR[unit];
}

export function formatNumber(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}
