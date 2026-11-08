import { test, expect } from "vitest";
import {
  readAppearancePreferences,
  persistAppearancePreferences,
  normalizeAccentColor,
  toInternalAuroraStyle,
  toExternalBgStyle,
  resolveAccentColorTokens,
  CALDRA_THEME_MODE_KEY,
  CALDRA_ACCENT_COLOR_KEY,
  CALDRA_BG_STYLE_KEY,
  CALDRA_ORBS_USE_ACCENT_KEY,
  CALDRA_PLAN_KEY,
  CALDRA_OFFICIAL_BLUE,
  CALDRA_CRIMSON_TRIAD,
  CALDRA_BLUE_TRIAD,
  CALDRA_AMBER_TRIAD,
  type StorageLike,
} from "./appearancePreferences.ts";

function createMockStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

test("Critério 1: Primeiro acesso sem preferências inicia nativamente em Claro, Azul, Padrão (Free) e useAccentInOrbs false", () => {
  const storage = createMockStorage(); // Vazio
  const prefs = readAppearancePreferences(storage, false /* isPro = false */);

  expect(prefs.theme).toBe("light");
  expect(prefs.accent).toBe("blue");
  expect(prefs.auroraStyle).toBe("padrao");
  expect(prefs.useAccentInOrbs).toBe(false);
  expect(prefs.isProViolation).toBe(false);
});

test("Critério 1 (PRO): Primeiro acesso sem preferências com conta PRO inicia nativamente em Claro, Azul e Fluido", () => {
  const storage = createMockStorage({ [CALDRA_PLAN_KEY]: "pro" });
  const prefs = readAppearancePreferences(storage, true /* isPro = true */);

  expect(prefs.theme).toBe("light");
  expect(prefs.accent).toBe("blue");
  expect(prefs.auroraStyle).toBe("fluido");
  expect(prefs.useAccentInOrbs).toBe(false);
  expect(prefs.isProViolation).toBe(false);
});

test("Critério 2: Persistência de alterações manuais no localStorage", () => {
  const storage = createMockStorage();

  persistAppearancePreferences(storage, {
    theme: "dark",
    accent: "blue",
    auroraStyle: "padrao",
  });

  expect(storage.getItem(CALDRA_THEME_MODE_KEY)).toBe("dark");
  expect(storage.getItem(CALDRA_ACCENT_COLOR_KEY)).toBe(CALDRA_OFFICIAL_BLUE);
  expect(storage.getItem(CALDRA_BG_STYLE_KEY)).toBe("default");

  // Reabre e relê do armazenamento
  const reloaded = readAppearancePreferences(storage, false);
  expect(reloaded.theme).toBe("dark");
  expect(reloaded.accent).toBe("blue");
  expect(reloaded.auroraStyle).toBe("padrao");
});

test("Critério 3: Validação de Segurança para o Estilo Fluido em contas Não-PRO", () => {
  // Usuário não-pro tenta forçar "fluid" no localStorage
  const storage = createMockStorage({
    [CALDRA_THEME_MODE_KEY]: "light",
    [CALDRA_ACCENT_COLOR_KEY]: "#0066FF",
    [CALDRA_BG_STYLE_KEY]: "fluid",
    [CALDRA_PLAN_KEY]: "free",
  });

  const prefs = readAppearancePreferences(storage, false /* isPro = false */);

  expect(prefs.auroraStyle).toBe("padrao");
  expect(prefs.isProViolation).toBe(true);
  expect(storage.getItem(CALDRA_BG_STYLE_KEY)).toBe("default");
});

test("Normalização de cores e formatos aceita aliases amigáveis e hexadecimais das tríades", () => {
  expect(normalizeAccentColor("#0066FF")).toBe("blue");
  expect(normalizeAccentColor("#003471")).toBe("blue");
  expect(normalizeAccentColor("#00A8FF")).toBe("blue");
  expect(normalizeAccentColor("#2CA5D6")).toBe("blue");
  expect(normalizeAccentColor("blue")).toBe("blue");
  expect(normalizeAccentColor("#F59E0B")).toBe("amber");
  expect(normalizeAccentColor("#D16002")).toBe("amber");
  expect(normalizeAccentColor("#8A3300")).toBe("amber");
  expect(normalizeAccentColor("#F7941D")).toBe("amber");
  expect(normalizeAccentColor("amber")).toBe("amber");
  expect(normalizeAccentColor("#B22222")).toBe("crimson");
  expect(normalizeAccentColor("#D61818")).toBe("crimson");
  expect(normalizeAccentColor("#E51A4C")).toBe("crimson");
  expect(normalizeAccentColor("#C11034")).toBe("crimson");
  expect(normalizeAccentColor("magenta")).toBe("crimson");

  expect(toInternalAuroraStyle("fluid")).toBe("fluido");
  expect(toInternalAuroraStyle("fluido")).toBe("fluido");
  expect(toInternalAuroraStyle("default")).toBe("padrao");
  expect(toInternalAuroraStyle("padrao")).toBe("padrao");
  expect(toExternalBgStyle("fluido")).toBe("fluid");
  expect(toExternalBgStyle("padrao")).toBe("default");
});

test("Tríades cromáticas oficiais e persistência não-destrutiva de useAccentInOrbs", () => {
  expect(CALDRA_CRIMSON_TRIAD).toMatchObject({
    primary: "#D61818",
    mid: "#E51A4C",
    deep: "#C11034",
  });
  expect(CALDRA_BLUE_TRIAD).toMatchObject({
    primary: "#003471",
    light: "#00A8FF",
    reflect: "#2CA5D6",
  });
  expect(CALDRA_AMBER_TRIAD).toMatchObject({
    primary: "#D16002",
    deep: "#8A3300",
    highlight: "#F7941D",
  });

  const crimsonDark = resolveAccentColorTokens("crimson", true);
  expect(crimsonDark.accentPrimary).toBe("#D61818");
  expect(crimsonDark.accentMid).toBe("#E51A4C");
  expect(crimsonDark.accentDeep).toBe("#C11034");

  const blueDark = resolveAccentColorTokens("blue", true);
  expect(blueDark.accentPrimary).toBe("#003471");
  expect(blueDark.accentMid).toBe("#00A8FF");
  expect(blueDark.accentDeep).toBe("#2CA5D6");

  const amberLight = resolveAccentColorTokens("amber", false);
  expect(amberLight.accentPrimary).toBe("#D16002");
  expect(amberLight.accentMid).toBe("#8A3300");
  expect(amberLight.accentDeep).toBe("#F7941D");

  const storage = createMockStorage();
  persistAppearancePreferences(storage, {
    theme: "dark",
    accent: "crimson",
    auroraStyle: "suave",
    useAccentInOrbs: true,
  });

  expect(storage.getItem(CALDRA_ORBS_USE_ACCENT_KEY)).toBe("true");
  expect(readAppearancePreferences(storage, true).useAccentInOrbs).toBe(true);

  persistAppearancePreferences(storage, {
    theme: "dark",
    accent: "crimson",
    auroraStyle: "suave",
    useAccentInOrbs: false,
  });

  expect(storage.getItem(CALDRA_ORBS_USE_ACCENT_KEY)).toBe("false");
  expect(readAppearancePreferences(storage, true).useAccentInOrbs).toBe(false);
});

