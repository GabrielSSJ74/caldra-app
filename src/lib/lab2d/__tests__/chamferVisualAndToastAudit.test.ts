import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildChamferThemeColors,
  buildChamferCssVariables,
  computeLuminanceStepRatio,
  enforceWorkspaceLuminanceGuard,
  resolveChamferThemeMode,
  parseColorToRgb,
} from "@/components/lab2d/useIntentTheme";
import {
  TOAST_CONFIG,
  CHAMFER_TOAST_TIMING,
  notify,
  toast,
  dismissNotification,
  clearAllNotifications,
  pauseNotificationTimer,
  resumeNotificationTimer,
  getNotificationState,
  getActiveTimerCount,
  subscribeNotifications,
  parseLegacyToastMessage,
} from "@/lib/lab2d/chamferNotify";
import {
  getChamferToastVisualTokens,
  getChamferToastStatusColor,
  computeChamferToastAnchorRect,
} from "@/components/lab2d/ChamferCompactToastHost";
import { drawScene } from "@/lib/lab2d/canvasScene";

describe("CHAMFER CAD — Fases D & E: Sistema de Notificações Compactas e Auditoria Visual Completa (T1–T14)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAllNotifications();
  });

  afterEach(() => {
    clearAllNotifications();
    vi.useRealTimers();
  });

  it("T1 — Troca de Tema (Claro / Escuro / AMOLED) atualiza todos os tokens --chamfer-* em Paisagem e Vertical", () => {
    const darkColors = buildChamferThemeColors("dark", "padrao", "blue", 90, 35);
    const lightColors = buildChamferThemeColors("light", "padrao", "blue", 90, 35);
    const amoledColors = buildChamferThemeColors("amoled", "padrao", "blue", 90, 35);

    expect(darkColors.isDark).toBe(true);
    expect(darkColors.isAmoled).toBe(false);
    expect(lightColors.isDark).toBe(false);
    expect(amoledColors.isDark).toBe(true);
    expect(amoledColors.isAmoled).toBe(true);
    expect(amoledColors.canvasBg).toBe("#000000");

    const darkVars = buildChamferCssVariables(darkColors);
    const lightVars = buildChamferCssVariables(lightColors);
    const amoledVars = buildChamferCssVariables(amoledColors);

    expect(darkVars["--chamfer-canvas-bg"]).not.toBe(lightVars["--chamfer-canvas-bg"]);
    expect(darkVars["--chamfer-workarea-fill"]).not.toBe(lightVars["--chamfer-workarea-fill"]);
    expect(darkVars["--chamfer-toast-bg"]).toBe("rgba(32, 45, 59, 0.94)");
    expect(lightVars["--chamfer-toast-bg"]).toBe("rgba(255, 255, 255, 0.94)");
    expect(amoledVars["--chamfer-toast-bg"]).toBe("rgba(10, 15, 21, 0.94)");
  });

  it("T2 — Estilo de Fundo (padrao / suave / fluido) diferencia o canvas e o gradiente sem quebrar o contraste", () => {
    const padrao = buildChamferThemeColors("dark", "padrao", "blue", 90, 35);
    const suave = buildChamferThemeColors("dark", "suave", "blue", 90, 35);
    const fluido = buildChamferThemeColors("dark", "fluido", "blue", 90, 35);

    expect(padrao.canvasBg).not.toBe(suave.canvasBg);
    expect(padrao.canvasBg).not.toBe(fluido.canvasBg);
    expect(padrao.canvasOverlayGradient).toBe("none");
    expect(suave.canvasOverlayGradient).toContain("radial-gradient");
    expect(fluido.canvasOverlayGradient).toContain("radial-gradient");
  });

  it("T3 — Cor de Destaque (Accent Color) propaga para controles ativos e ícone de informação sem tingir geometria neutra", () => {
    const accents = ["blue", "amber", "crimson", "magenta", "emerald"] as const;
    const seenHex = new Set<string>();

    for (const acc of accents) {
      const colors = buildChamferThemeColors("dark", "padrao", acc, 90, 35);
      const vars = buildChamferCssVariables(colors);
      seenHex.add(colors.accent);
      expect(vars["--chamfer-accent"]).toBe(colors.accent);
      expect(vars["--chamfer-accent-primary"]).toBe(colors.accent);
      expect(vars["--chamfer-toast-info"]).toBe(colors.accent);
      expect(getChamferToastStatusColor("informacao", colors.accent)).toBe(colors.accent);
      // Geometria neutra de corte permanece neutra
      expect(colors.defaultCutStroke).toBe("#ECEFF4");
    }

    expect(seenHex.size).toBe(accents.length);
  });

  it("T4 — Controles de Opacidade (cardOpacity e bubbleOpacity) alteram apenas o alpha rgba do fundo sem afetar nitidez do texto", () => {
    const lowOpacity = buildChamferThemeColors("dark", "padrao", "blue", 40, 25);
    const highOpacity = buildChamferThemeColors("dark", "padrao", "blue", 95, 85);

    expect(lowOpacity.panelOpacity).toBeCloseTo(0.4, 2);
    expect(highOpacity.panelOpacity).toBeCloseTo(0.95, 2);
    // Piso mínimo de legibilidade de 0.32 para bolhas flutuantes
    expect(lowOpacity.bubbleOpacity).toBeGreaterThanOrEqual(0.32);
    expect(highOpacity.bubbleOpacity).toBeCloseTo(0.85, 2);

    expect(lowOpacity.barBg).toContain("0.4)");
    expect(highOpacity.barBg).toContain("0.95)");
    // Texto primário permanece 100% opaco em hex sólido
    expect(lowOpacity.textPrimary).toBe("#ECEFF4");
    expect(highOpacity.textPrimary).toBe("#ECEFF4");
  });

  it("T5 — Coerência do Canvas, Área de Trabalho e Grid em Tema Claro (proibido fundo escuro no modo claro)", () => {
    const light = buildChamferThemeColors("light", "padrao", "blue", 90, 35);
    const canvasRgb = parseColorToRgb(light.canvasBg)!;
    const sheetRgb = parseColorToRgb(light.workAreaFill)!;

    // Ambos devem ser tons claros (R, G, B > 220)
    expect(canvasRgb.r).toBeGreaterThan(220);
    expect(canvasRgb.g).toBeGreaterThan(220);
    expect(canvasRgb.b).toBeGreaterThan(220);
    expect(sheetRgb.r).toBeGreaterThan(230);
    expect(sheetRgb.g).toBeGreaterThan(230);
    expect(sheetRgb.b).toBeGreaterThan(230);
    expect(light.gridMajor).toContain("rgba(15, 23, 42");
  });

  it("T6 — Identidade Graphite Titanium e Guarda de Luminância WCAG (<= 1.25 no escuro/AMOLED e <= 1.20 no claro)", () => {
    const styles = ["padrao", "suave", "fluido"] as const;
    for (const st of styles) {
      const dark = buildChamferThemeColors("dark", st, "blue", 90, 35);
      const amoled = buildChamferThemeColors("amoled", st, "blue", 90, 35);
      const light = buildChamferThemeColors("light", st, "blue", 90, 35);

      expect(dark.luminanceStepRatio).toBeLessThanOrEqual(1.25);
      expect(amoled.luminanceStepRatio).toBeLessThanOrEqual(1.25);
      expect(light.luminanceStepRatio).toBeLessThanOrEqual(1.20);
      expect(dark.gridOuterOpacityFactor).toBeCloseTo(0.65, 2);
    }

    // Testa diretamente a guarda caso receba uma cor muito clara no escuro
    const guarded = enforceWorkspaceLuminanceGuard("#0B0D11", "#334155", true);
    expect(guarded.ratio).toBeLessThanOrEqual(1.25);
    expect(computeLuminanceStepRatio("#0B0D11", guarded.workAreaFill)).toBeLessThanOrEqual(1.25);
  });

  it("T7 — Tokens Visuais das Notificações Compactas nunca usam fundo branco no tema escuro ou AMOLED", () => {
    const darkToast = getChamferToastVisualTokens("dark");
    const amoledToast = getChamferToastToastTokensCheck("amoled");
    const lightToast = getChamferToastVisualTokens("light");

    expect(darkToast.background).toBe("rgba(32, 45, 59, 0.94)");
    expect(darkToast.textPrimary).toBe("#DCE5ED");
    expect(darkToast.textSecondary).toBe("#9AABBA");

    expect(amoledToast.background).toBe("rgba(10, 15, 21, 0.94)");
    expect(amoledToast.border).toBe("1px solid #1E2A38");
    expect(amoledToast.textPrimary).toBe("#E6EDF3");

    expect(lightToast.background).toBe("rgba(255, 255, 255, 0.94)");
    expect(lightToast.textPrimary).toBe("#0F172A");
    expect(lightToast.textSecondary).toBe("#475569");

    // Cores semânticas de status apenas nos ícones e barra lateral de 2px
    expect(getChamferToastStatusColor("sucesso")).toBe("#50C49B");
    expect(getChamferToastStatusColor("aviso")).toBe("#E4B36B");
    expect(getChamferToastStatusColor("erro")).toBe("#E66F78");
    expect(getChamferToastStatusColor("informacao", "#FF6B00")).toBe("#FF6B00");
  });

  it("T8 — Paridade de posicionamento e tokens entre Layout Paisagem e Layout Vertical", () => {
    const portraitRects = computeChamferToastAnchorRect({
      viewportWidth: 390,
      viewportHeight: 844,
      isLandscape: false,
    });
    const landscapeRects = computeChamferToastAnchorRect({
      viewportWidth: 844,
      viewportHeight: 390,
      isLandscape: true,
    });

    expect(portraitRects.rulerRect.height).toBe(20);
    expect(landscapeRects.rulerRect.height).toBe(26);
    expect(portraitRects.clearanceBelowRulerPx).toBe(8);
    expect(landscapeRects.clearanceBelowRulerPx).toBe(8);
    expect(portraitRects.overlapsTopBar).toBe(false);
    expect(landscapeRects.overlapsTopBar).toBe(false);
  });

  it("T9 — Notificações Compactas: Duração tipo Instagram, Fila Única, Deduplicação (<800ms), Prioridade (1500ms) e ARIA", () => {
    // 1. Caso específico da captura: "Padrão cancelado" (informacao -> 2000 ms)
    notify({
      tipo: "informacao",
      titulo: "Padrão cancelado",
      mensagem: "Nenhuma alteração foi gravada.",
    });

    let state = getNotificationState();
    expect(state.active).not.toBeNull();
    expect(state.active?.titulo).toBe("Padrão cancelado");
    expect(state.active?.mensagem).toBe("Nenhuma alteração foi gravada.");
    expect(state.active?.durationMs).toBe(TOAST_CONFIG.informacao);
    expect(state.active?.ariaRole).toBe("status");
    expect(state.active?.ariaLive).toBe("polite");

    vi.advanceTimersByTime(1999);
    expect(getNotificationState().active).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getNotificationState().active).toBeNull();

    // 2. Sucesso -> 1800 ms
    toast.success("Geometria válida");
    expect(getNotificationState().active?.tipo).toBe("sucesso");
    expect(getNotificationState().active?.durationMs).toBe(TOAST_CONFIG.sucesso);
    vi.advanceTimersByTime(1800);
    expect(getNotificationState().active).toBeNull();

    // 3. Disparar 5 notificações em 500 ms -> apenas 1 elemento ativo, sem empilhamento
    for (let i = 1; i <= 5; i++) {
      notify({
        tipo: "sucesso",
        titulo: `Operação ${i}`,
      });
      vi.advanceTimersByTime(100);
    }
    state = getNotificationState();
    expect(state.active?.titulo).toBe("Operação 5");
    expect(state.queuedInfo).toBeNull();
    clearAllNotifications();

    // 4. Duplicata idêntica em < 800 ms -> apenas reinicia o timer
    const firstId = notify({
      tipo: "informacao",
      titulo: "Modo Ortogonal 2D ativado",
    });
    vi.advanceTimersByTime(500);
    const secondId = notify({
      tipo: "informacao",
      titulo: "Modo Ortogonal 2D ativado",
    });
    expect(secondId).toBe(firstId);
    // Como o timer de 2000ms foi reiniciado aos 500ms, aos +1600ms ainda deve estar visível
    vi.advanceTimersByTime(1600);
    expect(getNotificationState().active).not.toBeNull();
    vi.advanceTimersByTime(400);
    expect(getNotificationState().active).toBeNull();

    // 5. Proteção de prioridade: `aviso` seguido de `informacao` em 300 ms -> `aviso` permanece até completar 1500 ms
    notify({
      tipo: "aviso",
      titulo: "2 problemas encontrados",
    });
    vi.advanceTimersByTime(300);
    notify({
      tipo: "informacao",
      titulo: "Plano Isométrico: Superior",
    });
    // Aos 300 ms, o `aviso` ainda está ativo e a `informacao` aguarda na fila de 1 posição
    expect(getNotificationState().active?.tipo).toBe("aviso");
    expect(getNotificationState().queuedInfo?.titulo).toBe("Plano Isométrico: Superior");

    // Aos 1400 ms totais (+1100 ms), o `aviso` ainda está visível
    vi.advanceTimersByTime(1100);
    expect(getNotificationState().active?.tipo).toBe("aviso");

    // Ao completar 1500 ms (+100 ms), o `aviso` cede lugar à `informacao` enfileirada
    vi.advanceTimersByTime(100);
    expect(getNotificationState().active?.tipo).toBe("informacao");
    expect(getNotificationState().active?.titulo).toBe("Plano Isométrico: Superior");

    // 6. Verificar `role="alert"` para `erro`
    notify({
      tipo: "erro",
      titulo: "Restrição dimensional incompatível.",
    });
    expect(getNotificationState().active?.ariaRole).toBe("alert");
    expect(getNotificationState().active?.ariaLive).toBe("assertive");
    expect(getNotificationState().active?.durationMs).toBe(TOAST_CONFIG.erro);
  });

  it("T10 — Não-Obstrução da Barra Superior nos 5 Viewports-Alvo e Passividade de Toque (pointer-events)", () => {
    const viewports = [
      { w: 360, h: 800, isLandscape: false },
      { w: 390, h: 844, isLandscape: false },
      { w: 412, h: 915, isLandscape: false },
      { w: 800, h: 360, isLandscape: true },
      { w: 844, h: 390, isLandscape: true },
    ];

    for (const vp of viewports) {
      const normalLayout = computeChamferToastAnchorRect({
        viewportWidth: vp.w,
        viewportHeight: vp.h,
        isLandscape: vp.isLandscape,
        hasTopCommandBanner: false,
        hasTwoLines: true,
      });
      expect(normalLayout.overlapsTopBar).toBe(false);
      expect(normalLayout.toastRect.top).toBeGreaterThanOrEqual(normalLayout.topBarRect.bottom + 4);
      expect(normalLayout.toastRect.top).toBe(normalLayout.rulerRect.bottom + 8);

      const bannerLayout = computeChamferToastAnchorRect({
        viewportWidth: vp.w,
        viewportHeight: vp.h,
        isLandscape: vp.isLandscape,
        hasTopCommandBanner: true,
        hasTwoLines: true,
      });
      expect(bannerLayout.overlapsTopBar).toBe(false);
      expect(bannerLayout.toastRect.top).toBe(bannerLayout.rulerRect.bottom + 52);
    }

    // Passividade de toque: notificações sem ação (sucesso, informacao, aviso) são passivas (interactive = false)
    notify({ tipo: "informacao", titulo: "Padrão cancelado", mensagem: "Nenhuma alteração foi gravada." });
    expect(getNotificationState().active?.interactive).toBe(false);

    // Notificações com ação ou erro são interativas (interactive = true) e pausam/retomam o timer
    notify({
      tipo: "aviso",
      titulo: "Ação necessária",
      acao: { rotulo: "Desfazer", onClick: () => {} },
    });
    expect(getNotificationState().active?.interactive).toBe(true);
    expect(getNotificationState().active?.durationMs).toBe(TOAST_CONFIG.comAcao);

    vi.advanceTimersByTime(1000);
    pauseNotificationTimer();
    expect(getNotificationState().active?.paused).toBe(true);
    // Enquanto pausado, avançar 10 segundos não fecha a notificação
    vi.advanceTimersByTime(10000);
    expect(getNotificationState().active).not.toBeNull();

    resumeNotificationTimer();
    expect(getNotificationState().active?.paused).toBe(false);
    vi.advanceTimersByTime(3100);
    expect(getNotificationState().active).toBeNull();
  });

  it("T11 — Hidratação Síncrona do Tema sem Flash e Parser de Mensagens Legadas", () => {
    expect(resolveChamferThemeMode("dark")).toBe("dark");
    expect(resolveChamferThemeMode("light")).toBe("light");
    expect(resolveChamferThemeMode("amoled")).toBe("amoled");

    const parsedCancel = parseLegacyToastMessage("Padrão cancelado. Nenhuma alteração gravada.");
    expect(parsedCancel.titulo).toBe("Padrão cancelado");
    expect(parsedCancel.mensagem).toBe("Nenhuma alteração foi gravada.");
  });

  it("T12 — Teste de Fumaça da Renderização do Canvas 2D com Tokens de Tema", () => {
    const darkColors = buildChamferThemeColors("dark", "padrao", "blue", 90, 35);
    const lightColors = buildChamferThemeColors("light", "padrao", "blue", 90, 35);

    const strokeStyles: string[] = [];
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      set strokeStyle(v: string) {
        strokeStyles.push(v);
      },
      get strokeStyle() {
        return strokeStyles[strokeStyles.length - 1] ?? "";
      },
      lineWidth: 1,
      lineCap: "round",
      lineJoin: "round",
      globalAlpha: 1,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    const sampleLine = {
      id: "ent-1",
      type: "line" as const,
      layer: "corte",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
    };
    const layerMap = new Map([
      ["corte", { id: "corte", name: "Corte", color: "#38bdf8", visible: true, locked: false }],
    ]);
    const spatialIndex = {
      query: () => [sampleLine],
    };

    drawScene(mockCtx, {
      view: { tx: 0, ty: 0, k: 1 },
      dpr: 1,
      width: 800,
      height: 600,
      index: spatialIndex as never,
      layers: layerMap as never,
      selection: new Set(),
      outputMode: "completo",
      issues: [],
      draft: null,
      pending: [],
      cursor: { x: 0, y: 0 },
      tool: "select",
      snapHit: null,
      dimPicks: [],
      box: null,
      isLight: false,
    });

    const darkStroke = strokeStyles[strokeStyles.length - 1];
    strokeStyles.length = 0;

    drawScene(mockCtx, {
      view: { tx: 0, ty: 0, k: 1 },
      dpr: 1,
      width: 800,
      height: 600,
      index: spatialIndex as never,
      layers: layerMap as never,
      selection: new Set(),
      outputMode: "completo",
      issues: [],
      draft: null,
      pending: [],
      cursor: { x: 0, y: 0 },
      tool: "select",
      snapHit: null,
      dimPicks: [],
      box: null,
      isLight: true,
    });

    const lightStroke = strokeStyles[strokeStyles.length - 1];
    expect(darkStroke).toBe("#ECEFF4");
    expect(lightStroke).toBe("#0F141A");
  });

  it("T13 — Limpeza Completa de Listeners e Timers (Zero Memory Leak em Repouso e no Unmount)", () => {
    const events: Array<string | null> = [];
    const unsubscribe = subscribeNotifications((st) => {
      events.push(st.active?.titulo ?? null);
    });

    notify({ tipo: "aviso", titulo: "Aviso temporário" });
    notify({ tipo: "informacao", titulo: "Info na fila" });
    expect(getActiveTimerCount()).toBeGreaterThan(0);

    clearAllNotifications();
    expect(getActiveTimerCount()).toBe(0);
    expect(getNotificationState().active).toBeNull();
    expect(getNotificationState().queuedInfo).toBeNull();

    unsubscribe();
    const countBefore = events.length;
    notify({ tipo: "sucesso", titulo: "Após unsubscribe" });
    expect(events.length).toBe(countBefore);

    dismissNotification();
    expect(getActiveTimerCount()).toBe(0);
  });

  it("T14 — Constantes de Tempo e Curvas Respeitam a Especificação da Fase D", () => {
    expect(TOAST_CONFIG).toEqual({
      sucesso: 1800,
      informacao: 2000,
      aviso: 3000,
      erro: 4000,
      comAcao: 4000,
    });
    expect(CHAMFER_TOAST_TIMING.entryMs).toBe(180);
    expect(CHAMFER_TOAST_TIMING.exitMs).toBe(170);
    expect(CHAMFER_TOAST_TIMING.reducedMotionMs).toBe(80);
    expect(CHAMFER_TOAST_TIMING.dedupWindowMs).toBe(800);
    expect(CHAMFER_TOAST_TIMING.priorityHoldMs).toBe(1500);
  });
});

function getChamferToastToastTokensCheck(mode: "dark" | "light" | "amoled") {
  return getChamferToastVisualTokens(mode);
}
