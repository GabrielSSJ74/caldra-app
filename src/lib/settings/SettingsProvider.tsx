import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { DEFAULT_REGION, regionOf, type Region, type RegionId } from "@/lib/regional/regional";

export type ThemeMode = "light" | "dark" | "system" | "amoled";
export type AccentColor = "default" | "amber" | "blue" | "crimson" | "magenta";
export type AppLanguage = "pt" | "en" | "es";
export type Unit = "mm" | "cm" | "m" | "in";
/** APRENDIZ mostra fórmulas e dicas; MESTRE segue direto. Só apresentação. */
export type Level = "aprendiz" | "mestre";
/** Estilo do fundo AURORA: shader WebGL (fluido), Fluid Aurora luz líquida viva (suave) ou sólido (padrao). */
/** PADRÃO = nenhuma camada Aurora (fundo sólido do tema). Só por escolha explícita. */
export type AuroraStyle = "fluido" | "suave" | "padrao";

const KEY = "caldra.settings";

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
};

const DEFAULTS: Settings = {
  theme: "light",
  accent: "crimson",
  language: "pt",
  unit: "mm",
  precision: 2,
  level: "aprendiz",
  region: DEFAULT_REGION,
  auroraStyle: "suave",
  calcAngle: "DEG",
  calcPlaces: 4,
};

type SettingsValue = Settings & {
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
  setLanguage: (language: AppLanguage) => void;
  setUnit: (u: Unit) => void;
  setPrecision: (p: number) => void;
  setLevel: (l: Level) => void;
  setRegion: (r: RegionId) => void;
  setAuroraStyle: (s: AuroraStyle) => void;
  setCalcAngle: (a: "RAD" | "DEG" | "GRAD") => void;
  setCalcPlaces: (n: number) => void;
  /** Região resolvida (nunca undefined). */
  regionConfig: Region;
};

const SettingsContext = createContext<SettingsValue | null>(null);

/**
 * Leitura SÍNCRONA do armazenamento — fonte única, também usada pelo script
 * pré-paint em `__root.tsx`. Sem isto o app pinta o tema padrão e depois
 * corrige (flash de tonalidade).
 */
export function readStoredSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Omit<Partial<Settings>, "auroraStyle"> & {
      aurora?: boolean;
      auroraStyle?: AuroraStyle | "estatico";
      accentAppliedCrimson?: boolean;
    };
    const VALID: AuroraStyle[] = ["fluido", "suave", "padrao"];
    const LANGUAGES: AppLanguage[] = ["pt", "en", "es"];
    const auroraStyle: AuroraStyle =
      saved.aurora === false || saved.auroraStyle === "estatico"
        ? "padrao"
        : saved.auroraStyle && VALID.includes(saved.auroraStyle)
          ? saved.theme === "light" && saved.auroraStyle === "padrao"
            ? "fluido"
            : saved.auroraStyle
          : "fluido";
    // conta já existente (sem o campo) começa em MESTRE; conta nova, APRENDIZ
    const language = saved.language && LANGUAGES.includes(saved.language) ? saved.language : "pt";

    let accent: AccentColor = (saved.accent as AccentColor) || "crimson";
    if (accent === "magenta" || !saved.accentAppliedCrimson) {
      accent = "crimson";
      saved.accent = "crimson";
      saved.accentAppliedCrimson = true;
      try {
        window.localStorage.setItem(KEY, JSON.stringify({ ...saved, accent: "crimson", accentAppliedCrimson: true }));
      } catch {
        // ignora possíveis restrições de localStorage
      }
    }

    return { ...DEFAULTS, level: saved.level ?? "mestre", ...saved, accent, language, auroraStyle };
  } catch {
    return DEFAULTS;
  }
}

function applyToDom(s: Settings) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const dark = s.theme === "dark" || s.theme === "amoled" || (s.theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.classList.toggle("amoled", s.theme === "amoled");
  root.classList.toggle("accent-default", s.accent === "default");
  root.classList.toggle("accent-blue", s.accent === "blue");
  const isCrimson = s.accent === "crimson" || s.accent === "magenta";
  root.classList.toggle("accent-crimson", isCrimson);
  root.classList.toggle("accent-magenta", isCrimson);
  root.lang = s.language === "pt" ? "pt-BR" : s.language;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const hydrated = useRef(false);
  const [veil, setVeil] = useState(0);
  const { isMestre } = useFeatureAccess();
  const skin = `${settings.theme}:${settings.accent}`;
  const prevSkin = useRef<string | null>(null);

  /* Hidrata do armazenamento antes do primeiro paint. */
  useIsoLayoutEffect(() => {
    const stored = readStoredSettings();
    // marca o skin hidratado ANTES do estado mudar: a hidratação não é uma
    // troca voluntária de tema e portanto não acende o véu.
    prevSkin.current = `${stored.theme}:${stored.accent}`;
    applyToDom(stored);
    setSettings(stored);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  /* Troca VOLUNTÁRIA de tema/acento com transição suave. A aplicação
     inicial (e a hidratação do armazenamento) nunca acende o véu. */
  useIsoLayoutEffect(() => {
    if (prevSkin.current === null || prevSkin.current === skin) {
      prevSkin.current = skin;
      applyToDom(settings);
      return;
    }
    prevSkin.current = skin;
    setVeil((v) => v + 1);
    const swap = window.setTimeout(() => applyToDom(settings), 170);
    return () => window.clearTimeout(swap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin]);

  useEffect(() => {
    document.documentElement.classList.toggle("mestre", isMestre);
  }, [isMestre]);

  const value = useMemo<SettingsValue>(
    () => ({
      ...settings,
      setTheme: (theme) =>
        setSettings((s) => ({
          ...s,
          theme,
          ...(theme === "light" ? { auroraStyle: "fluido" } : {}),
        })),
      setAccent: (accent) => setSettings((s) => ({ ...s, accent })),
      setLanguage: (language) => setSettings((s) => ({ ...s, language })),
      setUnit: (unit) => setSettings((s) => ({ ...s, unit })),
      setPrecision: (precision) => setSettings((s) => ({ ...s, precision })),
      setLevel: (level) => setSettings((s) => ({ ...s, level })),
      setRegion: (region) => setSettings((s) => ({ ...s, region })),
      setAuroraStyle: (auroraStyle) => setSettings((s) => ({ ...s, auroraStyle })),
      setCalcAngle: (calcAngle) => setSettings((s) => ({ ...s, calcAngle })),
      setCalcPlaces: (calcPlaces) => setSettings((s) => ({ ...s, calcPlaces })),
      regionConfig: regionOf(settings.region),
    }),
    [settings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      {veil > 0 && (
        <div key={veil} aria-hidden className="theme-fade-veil" onAnimationEnd={() => setVeil(0)} />
      )}
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
