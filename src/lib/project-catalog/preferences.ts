import { useEffect, useState, useSyncExternalStore } from "react";
const KEY = "caldra.project-catalog.preferences.v1";
type State = { favorites: string[]; recent: string[] };
const EMPTY: State = { favorites: [], recent: [] };
let state = EMPTY,
  loaded = false,
  catalogGlobalHydrated = false;
const ls = new Set<() => void>();
function load() {
  if (loaded) return state;
  loaded = true;
  try {
    state = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    state = EMPTY;
  }
  return state;
}
function commit(n: State) {
  state = n;
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    // ignore localStorage errors
  }
  ls.forEach((l) => l());
}
export function toggleFavorite(slug: string) {
  const s = load();
  commit({
    ...s,
    favorites: s.favorites.includes(slug)
      ? s.favorites.filter((x) => x !== slug)
      : [...s.favorites, slug],
  });
}
export function markRecent(slug: string) {
  const s = load();
  commit({ ...s, recent: [slug, ...s.recent.filter((x) => x !== slug)].slice(0, 8) });
}
const snapshot = (): State =>
  !catalogGlobalHydrated || typeof window === "undefined" ? EMPTY : load();
const getServerSnapshot = (): State => EMPTY;

export function useCatalogPreferences(): State {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!catalogGlobalHydrated) {
      catalogGlobalHydrated = true;
      load();
      ls.forEach((l) => l());
    }
    setMounted(true);
  }, []);
  const s = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    snapshot,
    getServerSnapshot,
  );
  return mounted ? s : EMPTY;
}
