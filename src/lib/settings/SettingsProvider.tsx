import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { DEFAULT_REGION, regionOf, type Region, type RegionId } from "@/lib/regional/regional";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "amber" | "blue" | "magenta";
export type Unit = "mm" | "cm" | "m" | "in";
/** APRENDIZ mostra fórmulas e dicas; MESTRE segue direto. Só apresentação. */
export type Level = "aprendiz" | "mestre";

const KEY = "caldra.settings";

export type Settings = {
  theme: ThemeMode;
  accent: AccentColor;
  unit: Unit;
  precision: number;
  level: Level;
  /** Moeda, formato numérico e catálogo de chapas. */
  region: RegionId;
  /** Fundo AURORA animado (recurso PRO). Desligado = estático. */
  aurora: boolean;
};

const DEFAULTS: Settings = {
  theme: "dark",
  accent: "amber",
  unit: "mm",
  precision: 2,
  level: "aprendiz",
  region: DEFAULT_REGION,
  aurora: true,
};

type SettingsValue = Settings & {
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
  setUnit: (u: Unit) => void;
  setPrecision: (p: number) => void;
  setLevel: (l: Level) => void;
  setRegion: (r: RegionId) => void;
  setAurora: (v: boolean) => void;
  /** Região resolvida (nunca undefined). */
  regionConfig: Region;
};

const SettingsContext = createContext<SettingsValue | null>(null);

function applyToDom(s: Settings) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const dark = s.theme === "dark" || (s.theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.classList.toggle("accent-blue", s.accent === "blue");
  root.classList.toggle("accent-magenta", s.accent === "magenta");
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [veil, setVeil] = useState(0);
  const { isMestre } = useFeatureAccess();
  const skin = `${settings.theme}:${settings.accent}`;
  const prevSkin = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Settings>;
        // conta já existente (sem o campo) começa em MESTRE; conta nova, APRENDIZ
        setSettings({ ...DEFAULTS, level: saved.level ?? "mestre", ...saved });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  /* troca de tema/acento com transição suave */
  useEffect(() => {
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
      setTheme: (theme) => setSettings((s) => ({ ...s, theme })),
      setAccent: (accent) => setSettings((s) => ({ ...s, accent })),
      setUnit: (unit) => setSettings((s) => ({ ...s, unit })),
      setPrecision: (precision) => setSettings((s) => ({ ...s, precision })),
      setLevel: (level) => setSettings((s) => ({ ...s, level })),
      setRegion: (region) => setSettings((s) => ({ ...s, region })),
      regionConfig: regionOf(settings.region),
    }),
    [settings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      {veil > 0 && (
        <div
          key={veil}
          aria-hidden
          className="theme-fade-veil"
          onAnimationEnd={() => setVeil(0)}
        />
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
