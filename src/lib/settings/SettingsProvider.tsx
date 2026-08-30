import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";

export type ThemeMode = "light" | "dark" | "system";
export type Unit = "mm" | "cm" | "m" | "in";

const KEY = "chameleon.settings";

export type Settings = {
  theme: ThemeMode;
  unit: Unit;
  precision: number;
};

const DEFAULTS: Settings = { theme: "dark", unit: "mm", precision: 2 };

type SettingsValue = Settings & {
  setTheme: (t: ThemeMode) => void;
  setUnit: (u: Unit) => void;
  setPrecision: (p: number) => void;
};

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const { isMestre } = useFeatureAccess();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) });
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
    const root = document.documentElement;
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const dark = settings.theme === "dark" || (settings.theme === "system" && prefersDark);
    root.classList.toggle("dark", dark);
  }, [settings]);

  useEffect(() => {
    document.documentElement.classList.toggle("mestre", isMestre);
  }, [isMestre]);

  const value = useMemo<SettingsValue>(
    () => ({
      ...settings,
      setTheme: (theme) => setSettings((s) => ({ ...s, theme })),
      setUnit: (unit) => setSettings((s) => ({ ...s, unit })),
      setPrecision: (precision) => setSettings((s) => ({ ...s, precision })),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
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
