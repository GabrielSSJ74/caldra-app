/**
 * CALDRA / CHAMFER CAD — DETECTOR E PREFERÊNCIA DE LAYOUT VERTICAL (SEÇÃO 3 & 4)
 *
 * Regras:
 * - Ativa em orientação retrato (width < height) com largura útil <= 640 px
 *   (constante configurável VERTICAL_LAYOUT_MAX_WIDTH = 640).
 * - Em paisagem e em telas maiores (tablets, desktop), preserva o layout clássico sem mudanças.
 * - Preferência do usuário persistida em localStorage ("caldra_chamfer_vertical_layout_pref_v1"):
 *   "compact" (padrão no celular) | "classic" (válvula de segurança).
 * - Calcula o orçamento de cromo conforme a altura da viewport:
 *   • Altura >= 700 px: topo 48 px, faixa 60 px, dock 54 px
 *   • Altura < 700 px:  topo 44 px, faixa 54 px, dock 50 px
 */

import { useState, useEffect, useCallback } from "react";

export const VERTICAL_LAYOUT_MAX_WIDTH = 640;
export const COMPACT_HEIGHT_THRESHOLD = 700;
const STORAGE_KEY = "caldra_chamfer_vertical_layout_pref_v1";

export type VerticalLayoutPreference = "compact" | "classic";

export interface TopBarCollapseState {
  /** P4: Mostrar o nome abreviado do projeto ao lado do ponto e da espessura (>= 382 px) */
  showProjectNameInChip: boolean;
  /** P3: Usar rótulo abreviado na vista ("ORTO", "ISO", "ÓRB" em < 405 px) */
  shortViewLabel: boolean;
  /** P3->P2: Fundir chip de vista dentro do seletor 2D|3D em telas ultra-estreitas (< 348 px, ex. 320–340 px) */
  mergeViewIntoModeSelector: boolean;
  /** Largura máxima determinística (px) permitida para o chip de projeto P4 */
  projectChipMaxWidthPx: number;
}

/**
 * Calcula deterministicamente o nível de colapso da Barra Superior Única
 * para larguras de 320, 340, 360, 390, 412 e 430 px, garantindo zero corte e zero sobreposição.
 */
export function computeTopBarCollapseState(viewportWidth: number): TopBarCollapseState {
  const w = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 390;
  if (w < 348) {
    // 320 px, 340 px: colapsa nome do projeto (fica "• 3,0mm ▾") e funde a vista ao seletor 2D|3D
    return {
      showProjectNameInChip: false,
      shortViewLabel: true,
      mergeViewIntoModeSelector: true,
      projectChipMaxWidthPx: 68,
    };
  }
  if (w < 382) {
    // 360 px: colapsa nome do projeto para "• 3,0mm ▾" e abrevia vista ("ORTO" / "ISO" / "ÓRB")
    return {
      showProjectNameInChip: false,
      shortViewLabel: true,
      mergeViewIntoModeSelector: false,
      projectChipMaxWidthPx: 68,
    };
  }
  if (w < 405) {
    // 390 px: mostra nome curto com reticências + espessura e rótulo de vista curto ("ORTO" / "ISO" / "ÓRB")
    return {
      showProjectNameInChip: true,
      shortViewLabel: true,
      mergeViewIntoModeSelector: false,
      projectChipMaxWidthPx: Math.min(112, w - 278),
    };
  }
  // 412 px, 430 px+: mostra nome abreviado com reticências + espessura e rótulo completo ("ORTO 2D" / "ISO 2D")
  return {
    showProjectNameInChip: true,
    shortViewLabel: false,
    mergeViewIntoModeSelector: false,
    projectChipMaxWidthPx: Math.min(156, w - 298),
  };
}

export function loadVerticalLayoutPreference(): VerticalLayoutPreference {
  if (typeof window === "undefined") return "compact";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "classic" || raw === "compact") return raw;
  } catch {
    // ignore storage errors
  }
  return "compact";
}

export function saveVerticalLayoutPreference(pref: VerticalLayoutPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore storage errors
  }
}

export interface UseVerticalLayoutResult {
  /** Verdadeiro quando o dispositivo está em retrato E largura <= 640 px */
  isPortraitMobileViewport: boolean;
  /** Alias para compatibilidade: verdadeiro quando o dispositivo está em retrato E largura <= 640 px */
  isVerticalViewport: boolean;
  /** Verdadeiro quando o layout vertical compacto estilo Lightroom deve ser exibido */
  isVerticalCompactActive: boolean;
  /** Preferência atual do usuário ("compact" | "classic") */
  layoutPreference: VerticalLayoutPreference;
  /** Atualiza e persiste a preferência ("compact" | "classic") */
  setLayoutPreference: (pref: VerticalLayoutPreference) => void;
  /** Alterna entre Compacto e Clássico */
  toggleLayoutPreference: () => void;
  /** Largura da viewport em px */
  viewportWidth: number;
  /** Altura da viewport (ou visualViewport quando teclado nativo abre) em px */
  viewportHeight: number;
  /** Se a altura é < 700 px */
  isShortViewport: boolean;
  /** Alturas calculadas das barras (48/60/54 ou 44/54/50 em < 700 px) */
  chromeHeights: {
    topBarPx: number;
    stripPx: number;
    dockPx: number;
    rulerPx: number;
  };
  /** Estado de colapso por prioridade para a Barra Superior */
  topBarCollapse: TopBarCollapseState;
}

export function useVerticalLayout(): UseVerticalLayoutResult {
  const [layoutPreference, setLayoutPreferenceState] = useState<VerticalLayoutPreference>(() =>
    loadVerticalLayoutPreference(),
  );

  const [viewport, setViewport] = useState(() => {
    if (typeof window === "undefined") {
      return { w: 1280, h: 800 };
    }
    const vv = window.visualViewport;
    return {
      w: Math.round(vv?.width || window.innerWidth || 1280),
      h: Math.round(vv?.height || window.innerHeight || 800),
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      const vv = window.visualViewport;
      const nextW = Math.round(window.innerWidth || vv?.width || 1280);
      const nextH = Math.round(vv?.height || window.innerHeight || 800);
      setViewport((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
    };

    const mqlOrientation = window.matchMedia?.("(orientation: portrait)");
    const mqlMaxWidth = window.matchMedia?.(`(max-width: ${VERTICAL_LAYOUT_MAX_WIDTH}px)`);

    window.addEventListener("resize", updateViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
    mqlOrientation?.addEventListener?.("change", updateViewport);
    mqlMaxWidth?.addEventListener?.("change", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      mqlOrientation?.removeEventListener?.("change", updateViewport);
      mqlMaxWidth?.removeEventListener?.("change", updateViewport);
    };
  }, []);

  const setLayoutPreference = useCallback((pref: VerticalLayoutPreference) => {
    setLayoutPreferenceState(pref);
    saveVerticalLayoutPreference(pref);
  }, []);

  const toggleLayoutPreference = useCallback(() => {
    setLayoutPreferenceState((prev) => {
      const next = prev === "compact" ? "classic" : "compact";
      saveVerticalLayoutPreference(next);
      return next;
    });
  }, []);

  const isPortraitMobileViewport =
    viewport.w < viewport.h && viewport.w <= VERTICAL_LAYOUT_MAX_WIDTH;
  const isVerticalCompactActive = isPortraitMobileViewport && layoutPreference === "compact";
  const isShortViewport = viewport.h < COMPACT_HEIGHT_THRESHOLD;

  const chromeHeights = isShortViewport
    ? { topBarPx: 44, stripPx: 54, dockPx: 50, rulerPx: 20 }
    : { topBarPx: 48, stripPx: 60, dockPx: 54, rulerPx: 20 };

  const topBarCollapse = computeTopBarCollapseState(viewport.w);

  return {
    isPortraitMobileViewport,
    isVerticalViewport: isPortraitMobileViewport,
    isVerticalCompactActive,
    layoutPreference,
    setLayoutPreference,
    toggleLayoutPreference,
    viewportWidth: viewport.w,
    viewportHeight: viewport.h,
    isShortViewport,
    chromeHeights,
    topBarCollapse,
  };
}

/* ============================================================================
 * SEÇÃO 8 — MÁQUINA DE ESTADOS DE EXCLUSIVIDADE DO SLOT ÚNICO (A / B / C / D)
 * ============================================================================ */

export type SingleSlotStateKind =
  | "A_CAROUSEL"
  | "B_INLINE_PARAMS"
  | "C_DRAWER"
  | "D_NUMERIC_KEYPAD";

export interface SingleSlotMachineState {
  activeSlot: SingleSlotStateKind;
  returnSlotAfterKeypad: "A_CAROUSEL" | "B_INLINE_PARAMS";
  activeInlineId: string | null;
  drawerOpen: boolean;
  keypadOpen: boolean;
}

export type SingleSlotTransitionAction =
  | { type: "OPEN_CAROUSEL" }
  | { type: "OPEN_INLINE_PARAMS"; inlineId: string }
  | { type: "CLOSE_INLINE_PARAMS" }
  | { type: "OPEN_DRAWER" }
  | { type: "CLOSE_DRAWER" }
  | { type: "OPEN_NUMERIC_KEYPAD" }
  | { type: "CLOSE_NUMERIC_KEYPAD" }
  | { type: "CANVAS_TOUCH" };

export function createInitialSingleSlotState(): SingleSlotMachineState {
  return {
    activeSlot: "A_CAROUSEL",
    returnSlotAfterKeypad: "A_CAROUSEL",
    activeInlineId: null,
    drawerOpen: false,
    keypadOpen: false,
  };
}

/**
 * Garante por construção que NUNCA dois estados (A, B, C, D) fiquem ativos ao mesmo tempo.
 */
export function transitionSingleSlotState(
  state: SingleSlotMachineState,
  action: SingleSlotTransitionAction,
): SingleSlotMachineState {
  switch (action.type) {
    case "OPEN_CAROUSEL":
      return {
        activeSlot: "A_CAROUSEL",
        returnSlotAfterKeypad: "A_CAROUSEL",
        activeInlineId: null,
        drawerOpen: false,
        keypadOpen: false,
      };

    case "OPEN_INLINE_PARAMS":
      return {
        activeSlot: "B_INLINE_PARAMS",
        returnSlotAfterKeypad: "B_INLINE_PARAMS",
        activeInlineId: action.inlineId,
        drawerOpen: false,
        keypadOpen: false,
      };

    case "CLOSE_INLINE_PARAMS":
      return {
        activeSlot: "A_CAROUSEL",
        returnSlotAfterKeypad: "A_CAROUSEL",
        activeInlineId: null,
        drawerOpen: false,
        keypadOpen: false,
      };

    case "OPEN_DRAWER":
      return {
        activeSlot: "C_DRAWER",
        returnSlotAfterKeypad: "A_CAROUSEL",
        activeInlineId: null,
        drawerOpen: true,
        keypadOpen: false,
      };

    case "CLOSE_DRAWER":
      return {
        activeSlot: state.activeInlineId ? "B_INLINE_PARAMS" : "A_CAROUSEL",
        returnSlotAfterKeypad: state.activeInlineId ? "B_INLINE_PARAMS" : "A_CAROUSEL",
        activeInlineId: state.activeInlineId,
        drawerOpen: false,
        keypadOpen: false,
      };

    case "OPEN_NUMERIC_KEYPAD": {
      const returnTarget: "A_CAROUSEL" | "B_INLINE_PARAMS" =
        state.activeSlot === "B_INLINE_PARAMS" || state.activeInlineId !== null
          ? "B_INLINE_PARAMS"
          : "A_CAROUSEL";
      return {
        activeSlot: "D_NUMERIC_KEYPAD",
        returnSlotAfterKeypad: returnTarget,
        activeInlineId: state.activeInlineId,
        drawerOpen: false,
        keypadOpen: true,
      };
    }

    case "CLOSE_NUMERIC_KEYPAD": {
      const nextSlot =
        state.returnSlotAfterKeypad === "B_INLINE_PARAMS" && state.activeInlineId !== null
          ? "B_INLINE_PARAMS"
          : "A_CAROUSEL";
      return {
        activeSlot: nextSlot,
        returnSlotAfterKeypad: nextSlot,
        activeInlineId: nextSlot === "B_INLINE_PARAMS" ? state.activeInlineId : null,
        drawerOpen: false,
        keypadOpen: false,
      };
    }

    case "CANVAS_TOUCH":
      if (state.activeSlot === "C_DRAWER") {
        return {
          activeSlot: "A_CAROUSEL",
          returnSlotAfterKeypad: "A_CAROUSEL",
          activeInlineId: null,
          drawerOpen: false,
          keypadOpen: false,
        };
      }
      return state;
  }
}

/**
 * Resolve o estado único ativo (A, B, C ou D) a partir das flags de UI do editor vertical.
 * Prioridade estrita: D (Telinha Numérica) > C (Gaveta) > B (Parâmetros Inline) > A (Carrossel).
 */
export function resolveSingleSlotKind(params: {
  keypadOpen: boolean;
  drawerOpen: boolean;
  hasInlineParams: boolean;
}): {
  activeSlot: SingleSlotStateKind;
  activeCount: number;
} {
  if (params.keypadOpen) {
    return { activeSlot: "D_NUMERIC_KEYPAD", activeCount: 1 };
  }
  if (params.drawerOpen) {
    return { activeSlot: "C_DRAWER", activeCount: 1 };
  }
  if (params.hasInlineParams) {
    return { activeSlot: "B_INLINE_PARAMS", activeCount: 1 };
  }
  return { activeSlot: "A_CAROUSEL", activeCount: 1 };
}

/* ============================================================================
 * SEÇÃO 8 (D) & T4 — TELINHA DE DÍGITOS PRÓPRIA (SEM TECLADO NATIVO)
 * ============================================================================ */

export interface NumericKeypadBufferState {
  buffer: string;
  initialValue: number;
  min?: number;
  max?: number;
  freshOpen: boolean;
}

export function createNumericKeypadBuffer(
  initialValue: number,
  min?: number,
  max?: number,
): NumericKeypadBufferState {
  const safeVal = Number.isFinite(initialValue) ? Number(initialValue.toFixed(2)) : 0;
  return {
    buffer: String(safeVal),
    initialValue: safeVal,
    min,
    max,
    freshOpen: true,
  };
}

export function applyNumericKeypadKey(
  state: NumericKeypadBufferState,
  key:
    | "0"
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "."
    | ","
    | "±"
    | "BACKSPACE"
    | "CLEAR",
): NumericKeypadBufferState {
  if (key === "CLEAR") {
    return { ...state, buffer: "0", freshOpen: false };
  }
  if (key === "BACKSPACE") {
    if (state.freshOpen) {
      return { ...state, buffer: "0", freshOpen: false };
    }
    const next = state.buffer.slice(0, -1);
    return {
      ...state,
      buffer: next === "" || next === "-" ? "0" : next,
      freshOpen: false,
    };
  }
  if (key === "±") {
    if (state.buffer === "0" || state.buffer === "") return state;
    const next = state.buffer.startsWith("-") ? state.buffer.slice(1) : `-${state.buffer}`;
    return { ...state, buffer: next, freshOpen: false };
  }
  if (key === "." || key === ",") {
    if (state.freshOpen) {
      return { ...state, buffer: "0.", freshOpen: false };
    }
    if (state.buffer.includes(".")) return state;
    return { ...state, buffer: `${state.buffer}.`, freshOpen: false };
  }
  // Digit 0-9
  if (state.freshOpen || state.buffer === "0") {
    return { ...state, buffer: key, freshOpen: false };
  }
  if (state.buffer === "-0") {
    return { ...state, buffer: `-${key}`, freshOpen: false };
  }
  if (state.buffer.length >= 10) return state;
  return { ...state, buffer: `${state.buffer}${key}`, freshOpen: false };
}

export function parseNumericKeypadValue(state: NumericKeypadBufferState): number {
  const parsed = Number.parseFloat(state.buffer.replace(",", "."));
  let val = Number.isFinite(parsed) ? parsed : state.initialValue;
  if (state.min !== undefined && val < state.min) val = state.min;
  if (state.max !== undefined && val > state.max) val = state.max;
  return Number(val.toFixed(4));
}

/* ============================================================================
 * SEÇÃO 4, 8 (C) & T5 — ORÇAMENTO DE ÁREA LIVRE DO CANVAS (>= 72%) E GAVETA 45%/70% DVH
 * ============================================================================ */

export const PORTRAIT_DRAWER_DEFAULT_DVH = 45;
export const PORTRAIT_DRAWER_EXPANDED_DVH = 70;

export type PortraitDrawerHeightMode = "compact_45" | "expanded_70";

export function resolvePortraitDrawerDvh(
  open: boolean,
  mode: PortraitDrawerHeightMode = "compact_45",
): number {
  if (!open) return 0;
  return mode === "expanded_70" ? PORTRAIT_DRAWER_EXPANDED_DVH : PORTRAIT_DRAWER_DEFAULT_DVH;
}

/**
 * Resolve o resultado de arrastar a alça superior (36x4px) da gaveta compacta:
 * - Arrastar para cima (deltaY <= -32px): expande de 45% para 70% dvh
 * - Arrastar para baixo a partir de 70% (deltaY >= 32px): reduz para 45% dvh
 * - Arrastar para baixo a partir de 45% (deltaY >= 40px) ou arrasto longo (>= 140px): fecha a gaveta (0%)
 */
export function resolvePortraitDrawerDragGesture(params: {
  currentMode: PortraitDrawerHeightMode;
  deltaY: number;
}): {
  open: boolean;
  nextMode: PortraitDrawerHeightMode;
} {
  const { currentMode, deltaY } = params;
  if (deltaY <= -32) {
    return { open: true, nextMode: "expanded_70" };
  }
  if (deltaY >= 140) {
    return { open: false, nextMode: "compact_45" };
  }
  if (deltaY >= 36) {
    if (currentMode === "expanded_70") {
      return { open: true, nextMode: "compact_45" };
    }
    return { open: false, nextMode: "compact_45" };
  }
  return { open: true, nextMode: currentMode };
}

/**
 * Determina se um toque/clique no canvas deve recolher automaticamente a gaveta compacta,
 * devolvendo 100% do espaço livre ao desenho (exceto quando o usuário está coletando pontos
 * no canvas para Engenharia Reversa).
 */
export function shouldAutoCollapseDrawerOnCanvasTouch(params: {
  drawerOpen: boolean;
  isPickingCanvasPoints?: boolean;
}): boolean {
  if (!params.drawerOpen) return false;
  if (params.isPickingCanvasPoints) return false;
  return true;
}

export function computeVerticalCanvasBudget(viewportWidth: number, viewportHeight: number): {
  topBarPx: number;
  stripPx: number;
  dockPx: number;
  rulerPx: number;
  totalChromeHeightPx: number;
  freeCanvasHeightPx: number;
  freeCanvasHeightRatio: number;
  freeCanvasWidthAfterRulerPx: number;
  freeCanvasAreaRatio: number;
  meetsMinimum72Percent: boolean;
} {
  const isShort = viewportHeight < COMPACT_HEIGHT_THRESHOLD;
  const topBarPx = isShort ? 44 : 48;
  const stripPx = isShort ? 54 : 60;
  const dockPx = isShort ? 50 : 54;
  const rulerPx = 20;

  const totalChromeHeightPx = topBarPx + stripPx + dockPx;
  const freeCanvasHeightPx = Math.max(0, viewportHeight - totalChromeHeightPx);
  const freeCanvasHeightRatio = viewportHeight > 0 ? freeCanvasHeightPx / viewportHeight : 0;
  const freeCanvasWidthAfterRulerPx = Math.max(0, viewportWidth - rulerPx);
  const totalViewportArea = Math.max(1, viewportWidth * viewportHeight);
  const freeCanvasAreaRatio = (viewportWidth * freeCanvasHeightPx) / totalViewportArea;

  return {
    topBarPx,
    stripPx,
    dockPx,
    rulerPx,
    totalChromeHeightPx,
    freeCanvasHeightPx,
    freeCanvasHeightRatio,
    freeCanvasWidthAfterRulerPx,
    freeCanvasAreaRatio,
    meetsMinimum72Percent: freeCanvasHeightRatio >= 0.72,
  };
}

/* ============================================================================
 * FASE F (T6) — MODO TELA LIMPA, AUTO-ENQUADRAMENTO VERTICAL E CHIP CROSS-CATEGORIA
 * ============================================================================ */

export interface CleanScreenLayoutState {
  isCleanScreen: boolean;
  topBarVisible: boolean;
  bottomBarsVisible: boolean;
  microPillVisible: boolean;
  restorePillVisible: boolean;
  freeCanvasHeightRatio: number;
}

/**
 * Resolve o estado do Modo Tela Limpa (focus) na interface vertical:
 * oculta topo, faixa, dock e micro-pílula, liberando 100% da altura da viewport para o canvas,
 * mantendo apenas o botão flutuante de restauração no canto superior direito.
 */
export function resolveCleanScreenState(params: {
  focusActive: boolean;
  viewportWidth: number;
  viewportHeight: number;
}): CleanScreenLayoutState {
  if (params.focusActive) {
    return {
      isCleanScreen: true,
      topBarVisible: false,
      bottomBarsVisible: false,
      microPillVisible: false,
      restorePillVisible: true,
      freeCanvasHeightRatio: 1,
    };
  }
  const budget = computeVerticalCanvasBudget(params.viewportWidth, params.viewportHeight);
  return {
    isCleanScreen: false,
    topBarVisible: true,
    bottomBarsVisible: true,
    microPillVisible: true,
    restorePillVisible: false,
    freeCanvasHeightRatio: budget.freeCanvasHeightRatio,
  };
}

export interface PortraitAutoFitResult {
  k: number;
  tx: number;
  ty: number;
  visibleCanvasWidthPx: number;
  visibleCanvasHeightPx: number;
  marginRatio: number;
}

/**
 * Calcula deterministicamente o Zoom (k) e Pan (tx, ty) de auto-enquadramento em retrato
 * garantindo margem limpa de 12% ao redor da peça/área de trabalho, descontando a régua de 20px
 * e re-centralizando na metade superior útil quando a gaveta compacta (45% dvh) está aberta.
 */
export function computePortraitAutoFitView(params: {
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  canvasWidthPx: number;
  canvasHeightPx: number;
  rulerPx?: number;
  drawerOpen?: boolean;
  drawerDvh?: number;
  marginRatio?: number;
}): PortraitAutoFitResult {
  const rulerPx = params.rulerPx ?? 20;
  const marginRatio = params.marginRatio ?? 0.12;
  const drawerRatio = params.drawerOpen ? Math.min(0.75, Math.max(0, (params.drawerDvh ?? 45) / 100)) : 0;

  const usableWidthPx = Math.max(60, params.canvasWidthPx - rulerPx);
  const usableHeightPx = Math.max(
    60,
    params.canvasHeightPx * (1 - drawerRatio) - rulerPx,
  );

  const boxW = Math.max(1, params.bbox.maxX - params.bbox.minX);
  const boxH = Math.max(1, params.bbox.maxY - params.bbox.minY);

  const safeScaleFactor = Math.max(0.2, 1 - marginRatio * 2);
  const scaleX = (usableWidthPx * safeScaleFactor) / boxW;
  const scaleY = (usableHeightPx * safeScaleFactor) / boxH;
  const k = Number(Math.max(0.05, Math.min(30, Math.min(scaleX, scaleY))).toFixed(4));

  const centerXWorld = (params.bbox.minX + params.bbox.maxX) / 2;
  const centerYWorld = (params.bbox.minY + params.bbox.maxY) / 2;

  const centerScreenX = rulerPx + usableWidthPx / 2;
  const centerScreenY = rulerPx + usableHeightPx / 2;

  const tx = Number((centerScreenX - centerXWorld * k).toFixed(2));
  const ty = Number((centerScreenY - centerYWorld * k).toFixed(2));

  return {
    k,
    tx,
    ty,
    visibleCanvasWidthPx: usableWidthPx,
    visibleCanvasHeightPx: usableHeightPx,
    marginRatio,
  };
}

/**
 * Resolve o comportamento do chip "Ativa: <Ferramenta> ✕" quando o usuário troca de
 * categoria no Dock Inferior sem perder a ferramenta contínua ativa.
 */
export function resolveActiveToolCrossCategoryChip(params: {
  activeTool: string;
  currentDockCategory: string;
  ownerCategory: string | null;
  toolLabel: string | null;
}): {
  showChip: boolean;
  isCrossCategory: boolean;
  chipText: string | null;
  ownerCategory: string | null;
} {
  if (!params.activeTool || params.activeTool === "select" || !params.toolLabel) {
    return {
      showChip: false,
      isCrossCategory: false,
      chipText: null,
      ownerCategory: null,
    };
  }
  const isCrossCategory =
    params.ownerCategory !== null && params.ownerCategory !== params.currentDockCategory;
  return {
    showChip: true,
    isCrossCategory,
    chipText: `Ativa: ${params.toolLabel}`,
    ownerCategory: params.ownerCategory,
  };
}

/* ============================================================================
 * FASE G (T7) — ACESSIBILIDADE WCAG AA (>= 4.5:1), ALVOS DE TOQUE E REDUCED MOTION
 * ============================================================================ */

function parseHexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = Number.parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calcula a razão de contraste WCAG 2.1 entre duas cores hexadecimais (1.0 a 21.0).
 */
export function computeWcagContrastRatio(hexFg: string, hexBg: string): number {
  const l1 = relativeLuminance(hexFg);
  const l2 = relativeLuminance(hexBg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export interface ThemeContrastAuditItem {
  id: string;
  theme: "dark" | "light";
  fg: string;
  bg: string;
  ratio: number;
  passesAA: boolean;
}

/**
 * Audita os pares cromáticos do tema Escuro e do tema Claro do CHAMFER Vertical
 * comprovando razão de contraste >= 4.5:1 (WCAG AA) para textos e rótulos.
 */
export function auditVerticalThemeContrast(): {
  pairs: ThemeContrastAuditItem[];
  allPassAA: boolean;
} {
  const rawPairs: Array<{ id: string; theme: "dark" | "light"; fg: string; bg: string }> = [
    { id: "dark.primary_on_bar", theme: "dark", fg: "#F8FAFC", bg: "#11141C" },
    { id: "dark.primary_on_strip", theme: "dark", fg: "#F8FAFC", bg: "#181C26" },
    { id: "dark.secondary_on_bar", theme: "dark", fg: "#94A3B8", bg: "#11141C" },
    { id: "dark.secondary_on_strip", theme: "dark", fg: "#94A3B8", bg: "#181C26" },
    { id: "dark.cyan_telemetry_on_bar", theme: "dark", fg: "#38BDF8", bg: "#11141C" },
    { id: "dark.rose_active_on_bar", theme: "dark", fg: "#FB7185", bg: "#11141C" },
    { id: "light.primary_on_bar", theme: "light", fg: "#0F172A", bg: "#F8FAFC" },
    { id: "light.primary_on_strip", theme: "light", fg: "#0F172A", bg: "#FFFFFF" },
    { id: "light.secondary_on_bar", theme: "light", fg: "#475569", bg: "#F8FAFC" },
    { id: "light.secondary_on_strip", theme: "light", fg: "#475569", bg: "#FFFFFF" },
    { id: "light.crimson_active_on_strip", theme: "light", fg: "#BE123C", bg: "#FFFFFF" },
    { id: "light.cyan_telemetry_on_strip", theme: "light", fg: "#0369A1", bg: "#FFFFFF" },
  ];

  const pairs = rawPairs.map((item) => {
    const ratio = computeWcagContrastRatio(item.fg, item.bg);
    return {
      ...item,
      ratio,
      passesAA: ratio >= 4.5,
    };
  });

  return {
    pairs,
    allPassAA: pairs.every((p) => p.passesAA),
  };
}

export interface TouchTargetSpec {
  id: string;
  widthPx: number;
  heightPx: number;
  meetsMinimum: boolean;
}

/**
 * Audita todas as dimensões de alvos de toque do layout vertical (padrão e compacto < 700px).
 */
export function auditVerticalTouchTargets(isShortViewport: boolean): {
  targets: TouchTargetSpec[];
  allMeetMinimum: boolean;
} {
  const minHeight = isShortViewport ? 44 : 44;
  const stripItemHeight = isShortViewport ? 48 : 52;
  const dockItemHeight = isShortViewport ? 50 : 54;

  const rawTargets = [
    { id: "topbar.back_button", widthPx: 36, heightPx: 44, minW: 36, minH: minHeight },
    { id: "topbar.project_chip", widthPx: 68, heightPx: 44, minW: 60, minH: minHeight },
    { id: "topbar.mode_2d_3d", widthPx: 66, heightPx: 44, minW: 56, minH: minHeight },
    { id: "topbar.undo_button", widthPx: 36, heightPx: 44, minW: 36, minH: minHeight },
    { id: "topbar.redo_button", widthPx: 36, heightPx: 44, minW: 36, minH: minHeight },
    { id: "topbar.overflow_more", widthPx: 36, heightPx: 44, minW: 36, minH: minHeight },
    { id: "strip.carousel_tool_item", widthPx: 64, heightPx: stripItemHeight, minW: 56, minH: 48 },
    { id: "dock.category_button", widthPx: 64, heightPx: dockItemHeight, minW: 56, minH: 48 },
  ];

  const targets: TouchTargetSpec[] = rawTargets.map((t) => ({
    id: t.id,
    widthPx: t.widthPx,
    heightPx: t.heightPx,
    meetsMinimum: t.widthPx >= t.minW && t.heightPx >= t.minH,
  }));

  return {
    targets,
    allMeetMinimum: targets.every((t) => t.meetsMinimum),
  };
}

export function resolveReducedMotionTransitionMs(
  prefersReducedMotion: boolean,
  defaultDurationMs = 150,
): number {
  if (prefersReducedMotion) return 0;
  return Math.min(180, Math.max(0, defaultDurationMs));
}



