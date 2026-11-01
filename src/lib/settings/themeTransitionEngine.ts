/**
 * CALDRA — CHAMFER CAD: MOTOR PREMIUM DE TRANSIÇÃO DE TEMAS (SEAMLESS CHROMATIC MORPH)
 *
 * Arquitetura Compositor-First (View Transitions API + Web Animations API):
 * - Anima exclusivamente snapshots de GPU (`::view-transition-old(root)` / `::view-transition-new(root)`).
 * - DOM, CSS variables (`--chamfer-*`, `--bg-*`, `--cad-*`) e Canvas 2D/3D do CAD mudam UMA ÚNICA VEZ
 *   de forma síncrona no quadro de virada (`flushSync` + `bridge.applyTheme` + `bridge.renderNow`).
 * - Matriz Assimétrica de 6 Transições (`dark>light`, `light>dark`, `dark>amoled`, `amoled>dark`,
 *   `light>amoled`, `amoled>light`) com curvas `EASE_R` e `EASE_A`.
 * - Governador de Orçamento de Quadro (`cinematic` -> `standard` -> `lite` -> `instant`).
 * - Coalescência de cliques rápidos ("Último clique vence") com aceleração `updatePlaybackRate(4)`.
 * - Interrupção limpa (`vt.skipTransition()`) se o usuário iniciar desenho/pan/zoom no CAD durante a animação.
 */

import { flushSync } from "react-dom";

export type ThemeId = "light" | "dark" | "amoled";
export type Tier = "cinematic" | "standard" | "lite" | "instant";
export type Origin = { x: number; y: number; el: HTMLElement | null };

export type ThemeOriginInput =
  | MouseEvent
  | PointerEvent
  | {
      clientX?: number;
      clientY?: number;
      detail?: number;
      currentTarget?: EventTarget | null;
      target?: EventTarget | null;
      nativeEvent?: Event;
    }
  | HTMLElement
  | { x: number; y: number; el?: HTMLElement | null }
  | null
  | undefined;

export interface ThemeBridge {
  applyTheme: (theme: ThemeId, tokens: Record<string, string>) => void;
  renderNow: () => void;
}

export interface Preset {
  d: number; // duração (ms)
  feather: number; // largura relativa da penumbra (0.10–0.22)
  a0: number; // opacidade inicial do snapshot novo
  aSpan: number; // fração da duração dedicada ao ganho de opacidade
}

export const PRESETS: Record<`${ThemeId}>${ThemeId}`, Preset> = {
  "dark>light": { d: 540, feather: 0.18, a0: 0, aSpan: 0.74 },
  "light>dark": { d: 520, feather: 0.16, a0: 0, aSpan: 0.72 },
  "dark>amoled": { d: 420, feather: 0.10, a0: 0.10, aSpan: 0.88 },
  "amoled>dark": { d: 420, feather: 0.10, a0: 0.10, aSpan: 0.88 },
  "light>amoled": { d: 560, feather: 0.18, a0: 0, aSpan: 0.76 },
  "amoled>light": { d: 560, feather: 0.20, a0: 0, aSpan: 0.80 },
  "dark>dark": { d: 420, feather: 0.14, a0: 0.10, aSpan: 0.80 },
  "light>light": { d: 420, feather: 0.14, a0: 0.10, aSpan: 0.80 },
  "amoled>amoled": { d: 420, feather: 0.10, a0: 0.10, aSpan: 0.88 },
};

export const EASE_R = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_A = "cubic-bezier(0.32, 0, 0.2, 1)";

export const SEMANTIC_THEME_TOKENS: Record<ThemeId, Record<string, string>> = {
  dark: {
    "--bg-0": "#0B0D11",
    "--bg-1": "#0E1116",
    "--bg-2": "#11141A",
    "--bg-3": "#161A22",
    "--fg-1": "#ECEFF4",
    "--fg-2": "#9AA4B2",
    "--fg-3": "#647080",
    "--line-1": "#232A35",
    "--line-2": "#2F3847",
    "--accent": "#0066FF",
    "--accent-soft": "rgba(0, 102, 255, 0.16)",
    "--cad-canvas": "#0E1116",
    "--cad-grid-major": "rgba(148, 163, 184, 0.08)",
    "--cad-grid-minor": "rgba(148, 163, 184, 0.035)",
    "--cad-axis-x": "#D97706",
    "--cad-axis-y": "#059669",
    "--cad-selection": "#38BDF8",
    "--cad-snap": "#F59E0B",
    "--cad-dim": "#93C5FD",
    "--cad-hidden": "#64748B",
  },
  amoled: {
    "--bg-0": "#000000",
    "--bg-1": "#05070A",
    "--bg-2": "#080A0E",
    "--bg-3": "#0E1117",
    "--fg-1": "#F1F5F9",
    "--fg-2": "#94A3B8",
    "--fg-3": "#64748B",
    "--line-1": "#161C24",
    "--line-2": "#222B38",
    "--accent": "#0066FF",
    "--accent-soft": "rgba(0, 102, 255, 0.20)",
    "--cad-canvas": "#000000",
    "--cad-grid-major": "rgba(148, 163, 184, 0.075)",
    "--cad-grid-minor": "rgba(148, 163, 184, 0.03)",
    "--cad-axis-x": "#D97706",
    "--cad-axis-y": "#059669",
    "--cad-selection": "#38BDF8",
    "--cad-snap": "#F59E0B",
    "--cad-dim": "#93C5FD",
    "--cad-hidden": "#64748B",
  },
  light: {
    "--bg-0": "#EAEEF3",
    "--bg-1": "#F3F5F8",
    "--bg-2": "#F8FAFC",
    "--bg-3": "#FFFFFF",
    "--fg-1": "#0F141A",
    "--fg-2": "#4B5563",
    "--fg-3": "#6B7280",
    "--line-1": "#D5DCE4",
    "--line-2": "#B8C2CC",
    "--accent": "#0066FF",
    "--accent-soft": "rgba(0, 102, 255, 0.12)",
    "--cad-canvas": "#F3F5F8",
    "--cad-grid-major": "rgba(15, 23, 42, 0.09)",
    "--cad-grid-minor": "rgba(15, 23, 42, 0.04)",
    "--cad-axis-x": "#B45309",
    "--cad-axis-y": "#047857",
    "--cad-selection": "#0284C7",
    "--cad-snap": "#D97706",
    "--cad-dim": "#1D4ED8",
    "--cad-hidden": "#64748B",
  },
};

export interface ThemeTransitionMetrics {
  from: ThemeId;
  to: ThemeId;
  tier: Tier;
  durationMs: number;
  avgFrameMs: number;
  maxFrameMs: number;
  droppedFramesOver24ms: number;
  origin: { x: number; y: number };
  timestamp: number;
}

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone?: Promise<void>;
  skipTransition: () => void;
};

type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike;
};

const bridges = new Map<string, ThemeBridge>();

export function registerThemeBridge(id: string, bridge: ThemeBridge): () => void {
  bridges.set(id, bridge);
  return () => {
    bridges.delete(id);
  };
}

let lastInteraction: {
  x: number;
  y: number;
  isKeyboard: boolean;
  el: HTMLElement | null;
  time: number;
} | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (ev: PointerEvent) => {
      const target = ev.target instanceof HTMLElement ? ev.target : null;
      const btn = target?.closest("button, [role='button'], [role='menuitem'], a") as HTMLElement | null;
      lastInteraction = {
        x: ev.clientX,
        y: ev.clientY,
        isKeyboard: false,
        el: btn ?? target,
        time: performance.now(),
      };
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "keydown",
    (ev: KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        lastInteraction = {
          x: 0,
          y: 0,
          isKeyboard: true,
          el: active,
          time: performance.now(),
        };
      }
    },
    { capture: true, passive: true },
  );
}

let visual: ThemeId = "dark";
let running: { anims: Animation[]; vt?: ViewTransitionLike } | null = null;
let pending: { theme: ThemeId; origin: Origin; applyDomAndReact: () => void } | null = null;
let governorCap: Tier = "cinematic";
let lastMetrics: ThemeTransitionMetrics | null = null;

export function getLastThemeTransitionMetrics(): ThemeTransitionMetrics | null {
  return lastMetrics;
}

export function resolveEffectiveThemeId(
  mode: "light" | "dark" | "system" | "amoled",
): ThemeId {
  if (mode === "amoled") return "amoled";
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

export function resolveTokens(theme: ThemeId): Record<string, string> {
  return SEMANTIC_THEME_TOKENS[theme] ?? SEMANTIC_THEME_TOKENS.dark;
}

export function setMetaThemeColor(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  const color = theme === "light" ? "#EAEEF3" : theme === "amoled" ? "#000000" : "#0B0D11";
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

export function pickTier(): Tier {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "instant";
  }
  if (
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(forced-colors: active)").matches)
  ) {
    return "instant";
  }
  const doc = document as DocumentWithVT;
  if (typeof doc.startViewTransition !== "function") {
    return "lite";
  }
  const hasMask =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    (CSS.supports("mask-size", "0 0") || CSS.supports("-webkit-mask-size", "0 0"));
  const cap: Tier = hasMask ? "cinematic" : "standard";
  const order: Tier[] = ["instant", "lite", "standard", "cinematic"];
  return order[Math.min(order.indexOf(cap), order.indexOf(governorCap))]!;
}

export function resolveOrigin(src?: ThemeOriginInput): Origin {
  if (typeof window === "undefined") {
    return { x: 0, y: 0, el: null };
  }
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  if (src && typeof src === "object" && "x" in src && "y" in src && typeof src.x === "number") {
    return { x: src.x, y: src.y, el: src.el ?? null };
  }

  if (typeof HTMLElement !== "undefined" && src instanceof HTMLElement) {
    const r = src.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) {
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: src };
    }
    return { x: cx, y: cy, el: src };
  }

  if (src && typeof src === "object" && ("clientX" in src || "currentTarget" in src || "target" in src)) {
    const ev = src as {
      clientX?: number;
      clientY?: number;
      detail?: number;
      currentTarget?: EventTarget | null;
      target?: EventTarget | null;
    };
    const rawEl =
      (ev.currentTarget instanceof HTMLElement ? ev.currentTarget : null) ??
      (ev.target instanceof HTMLElement
        ? (ev.target.closest("button, [role='button'], [role='menuitem']") as HTMLElement | null) ??
          ev.target
        : null);

    // Ativado por ponteiro real (mouse/touch)
    if (
      typeof ev.clientX === "number" &&
      typeof ev.clientY === "number" &&
      (ev.clientX !== 0 || ev.clientY !== 0) &&
      ev.detail !== 0
    ) {
      return { x: ev.clientX, y: ev.clientY, el: rawEl };
    }

    // Ativado via teclado (Enter/Space -> detail === 0) ou leitor de tela: usa centro do controle
    if (rawEl) {
      const r = rawEl.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: rawEl };
      }
    }
  }

  // Fallback automático para a última interação recente (< 350ms) capturada no documento
  if (lastInteraction && performance.now() - lastInteraction.time < 350) {
    if (!lastInteraction.isKeyboard && (lastInteraction.x !== 0 || lastInteraction.y !== 0)) {
      return { x: lastInteraction.x, y: lastInteraction.y, el: lastInteraction.el };
    }
    if (lastInteraction.el && document.contains(lastInteraction.el)) {
      const r = lastInteraction.el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: lastInteraction.el };
      }
    }
  }

  // Fallback para elemento focado se for um botão
  if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
    const active = document.activeElement;
    if (active.tagName === "BUTTON" || active.getAttribute("role") === "button") {
      const r = active.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: active };
      }
    }
  }

  return { x: cx, y: cy, el: null };
}

function pulseControl(el: HTMLElement | null, dur: number): void {
  if (!el || typeof el.animate !== "function") return;
  try {
    const pulseDur = Math.min(310, Math.max(240, Math.round(dur * 0.52)));
    el.animate(
      [
        { transform: "scale(1) rotate(0deg)", opacity: 1 },
        { transform: "scale(0.90) rotate(-12deg)", opacity: 0.84, offset: 0.38 },
        { transform: "scale(1) rotate(0deg)", opacity: 1 },
      ],
      {
        duration: pulseDur,
        easing: EASE_R,
      },
    );
  } catch {
    // Ignora caso o elemento tenha sido desmontado
  }
}

function sampleFrames(
  dur: number,
  meta: { from: ThemeId; to: ThemeId; tier: Tier; origin: { x: number; y: number } },
): Promise<void> {
  return new Promise((res) => {
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
      res();
      return;
    }
    const dts: number[] = [];
    const t0 = performance.now();
    let prev = t0;
    const step = (now: number) => {
      dts.push(now - prev);
      prev = now;
      if (now - t0 < dur) {
        requestAnimationFrame(step);
      } else {
        const avg = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length);
        const max = dts.length > 0 ? Math.max(...dts) : 0;
        const slow = dts.filter((d) => d > 24).length;
        if (avg > 20 && governorCap === "cinematic") {
          governorCap = "standard";
        } else if (avg > 28) {
          governorCap = "lite";
        }
        lastMetrics = {
          from: meta.from,
          to: meta.to,
          tier: meta.tier,
          durationMs: dur,
          avgFrameMs: Number(avg.toFixed(2)),
          maxFrameMs: Number(max.toFixed(2)),
          droppedFramesOver24ms: slow,
          origin: meta.origin,
          timestamp: Date.now(),
        };
        res();
      }
    };
    requestAnimationFrame(step);
  });
}

function notifyBridgesSynchronously(next: ThemeId): void {
  const tokens = resolveTokens(next);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(k, v);
  }
  for (const bridge of bridges.values()) {
    try {
      bridge.applyTheme(next, tokens);
      bridge.renderNow();
    } catch {
      // Protege contra falha isolada em algum bridge
    }
  }
}

function runLite(next: ThemeId, applyDomAndReact: () => void, dur = 180): void {
  const root = document.documentElement;
  if (typeof root.animate !== "function") {
    applyNow(next, applyDomAndReact);
    return;
  }
  const fadeOut = root.animate([{ opacity: 1 }, { opacity: 0.92 }], {
    duration: Math.round(dur * 0.35),
    easing: EASE_A,
  });
  fadeOut.onfinish = () => {
    applyNow(next, applyDomAndReact);
    root.animate([{ opacity: 0.92 }, { opacity: 1 }], {
      duration: Math.round(dur * 0.65),
      easing: EASE_R,
    });
  };
}

function applyNow(next: ThemeId, applyDomAndReact: () => void): void {
  try {
    flushSync(() => {
      applyDomAndReact();
    });
  } catch {
    applyDomAndReact();
  }
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = next;
    root.classList.toggle("dark", next !== "light");
    root.classList.toggle("amoled", next === "amoled");
    root.style.colorScheme = next === "light" ? "light" : "dark";
    setMetaThemeColor(next);
    notifyBridgesSynchronously(next);
  }
  visual = next;
}

export function syncVisualThemeState(current: ThemeId): void {
  visual = current;
}

export function requestThemeTransition(
  next: ThemeId,
  applyDomAndReact: () => void,
  src?: ThemeOriginInput,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    applyDomAndReact();
    return;
  }

  const root = document.documentElement;
  const currentDomTheme = (root.dataset.theme as ThemeId | undefined) || visual;
  if (currentDomTheme === "light" || currentDomTheme === "dark" || currentDomTheme === "amoled") {
    visual = currentDomTheme;
  }

  const origin = resolveOrigin(src);

  // Coalescência: se já estiver animando, agenda no slot `pending` e acelera a animação atual (4x)
  if (running) {
    pending = { theme: next, origin, applyDomAndReact };
    running.anims.forEach((a) => {
      try {
        a.updatePlaybackRate(4);
      } catch {
        // ignore
      }
    });
    return;
  }

  if (next === visual) {
    applyNow(next, applyDomAndReact);
    return;
  }

  void runTransition(visual, next, origin, applyDomAndReact, 1);
}

async function runTransition(
  from: ThemeId,
  to: ThemeId,
  o: Origin,
  applyDomAndReact: () => void,
  speedFactor: number,
): Promise<void> {
  const tier = pickTier();
  const p = PRESETS[`${from}>${to}`] ?? PRESETS["dark>light"];
  const dur = Math.round(p.d * speedFactor);

  pulseControl(o.el, dur);

  if (tier === "instant") {
    applyNow(to, applyDomAndReact);
    return;
  }

  if (tier === "lite") {
    runLite(to, applyDomAndReact, Math.min(200, dur));
    return;
  }

  const root = document.documentElement;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const R = Math.hypot(Math.max(o.x, W - o.x), Math.max(o.y, H - o.y)) * 1.02;

  root.dataset.vtTier = tier;
  root.style.setProperty("--vt-x", `${o.x}px`);
  root.style.setProperty("--vt-y", `${o.y}px`);
  root.style.setProperty("--vt-feather", String(p.feather));

  const doc = document as DocumentWithVT;
  let vt: ViewTransitionLike;
  try {
    vt = doc.startViewTransition!(() => {
      applyNow(to, applyDomAndReact);
    });
  } catch {
    delete root.dataset.vtTier;
    applyNow(to, applyDomAndReact);
    return;
  }

  // Se o usuário iniciar um gesto de desenho/pan/zoom no workspace CAD durante a transição,
  // encerra imediatamente o efeito visual sem perder o input
  const abortOnWorkspaceGesture = (ev: Event) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (
      t.closest("[data-chamfer-workspace]") ||
      t.tagName === "CANVAS" ||
      t.closest("svg[role='application']")
    ) {
      try {
        vt.skipTransition();
      } catch {
        // ignore
      }
    }
  };

  window.addEventListener("pointerdown", abortOnWorkspaceGesture, { capture: true, passive: true });
  window.addEventListener("wheel", abortOnWorkspaceGesture, { capture: true, passive: true });

  try {
    await vt.ready;
    const pseudo = "::view-transition-new(root)";
    const anims: Animation[] = [];

    if (tier === "cinematic") {
      const D = R * 2.9;
      try {
        anims.push(
          root.animate(
            {
              maskSize: ["0px 0px", `${D}px ${D}px`],
              maskPosition: [`${o.x}px ${o.y}px`, `${o.x - D / 2}px ${o.y - D / 2}px`],
            },
            { duration: dur, easing: EASE_R, fill: "forwards", pseudoElement: pseudo },
          ),
        );
      } catch {
        // Fallback automático para clipPath caso maskSize em pseudoElement não seja suportado
        root.dataset.vtTier = "standard";
        anims.push(
          root.animate(
            { clipPath: [`circle(0px at ${o.x}px ${o.y}px)`, `circle(${R}px at ${o.x}px ${o.y}px)`] },
            { duration: dur, easing: EASE_R, fill: "forwards", pseudoElement: pseudo },
          ),
        );
      }
    } else {
      anims.push(
        root.animate(
          { clipPath: [`circle(0px at ${o.x}px ${o.y}px)`, `circle(${R}px at ${o.x}px ${o.y}px)`] },
          { duration: dur, easing: EASE_R, fill: "forwards", pseudoElement: pseudo },
        ),
      );
    }

    anims.push(
      root.animate(
        { opacity: [p.a0, 1] },
        {
          duration: Math.round(dur * p.aSpan),
          easing: EASE_A,
          fill: "forwards",
          pseudoElement: pseudo,
        },
      ),
    );

    running = { anims, vt };
    await Promise.all([
      vt.finished,
      sampleFrames(dur, { from, to, tier, origin: { x: o.x, y: o.y } }),
    ]);
  } catch {
    // Transição pulada ou interrompida; o estado já foi aplicado em applyNow()
  } finally {
    window.removeEventListener("pointerdown", abortOnWorkspaceGesture, { capture: true });
    window.removeEventListener("wheel", abortOnWorkspaceGesture, { capture: true });
    running = null;
    delete root.dataset.vtTier;
    root.style.removeProperty("--vt-x");
    root.style.removeProperty("--vt-y");
    root.style.removeProperty("--vt-feather");

    if (pending) {
      const q = pending;
      pending = null;
      if (q.theme !== visual) {
        await runTransition(visual, q.theme, q.origin, q.applyDomAndReact, 0.75);
      } else {
        applyNow(q.theme, q.applyDomAndReact);
      }
    }
  }
}
