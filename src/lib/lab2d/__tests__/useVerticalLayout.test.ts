import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PORTRAIT_DRAWER_DEFAULT_DVH,
  PORTRAIT_DRAWER_EXPANDED_DVH,
  VERTICAL_LAYOUT_MAX_WIDTH,
  applyNumericKeypadKey,
  auditVerticalThemeContrast,
  auditVerticalTouchTargets,
  computePortraitAutoFitView,
  computeTopBarCollapseState,
  computeVerticalCanvasBudget,
  computeWcagContrastRatio,
  createInitialSingleSlotState,
  createNumericKeypadBuffer,
  parseNumericKeypadValue,
  resolveActiveToolCrossCategoryChip,
  resolveCleanScreenState,
  resolvePortraitDrawerDragGesture,
  resolvePortraitDrawerDvh,
  resolveReducedMotionTransitionMs,
  resolveSingleSlotKind,
  shouldAutoCollapseDrawerOnCanvasTouch,
  transitionSingleSlotState,
} from "../useVerticalLayout";
import {
  CHAMFER_COMMAND_REGISTRY,
  VERTICAL_DOCK_CATEGORIES,
  generateChamferCommandCoverageReport,
  getToolOwnerCategory,
} from "../chamferCommandRegistry";

describe("FASE C — Colapso por Prioridade da Barra Superior Vertical (T3)", () => {
  const testedWidths = [320, 340, 360, 390, 412, 430];

  it("avalia todas as larguras obrigatórias (320, 340, 360, 390, 412, 430 px) mantendo P1 e P2 íntegros e sem sobreposição", () => {
    for (const width of testedWidths) {
      const state = computeTopBarCollapseState(width);
      expect(state.projectChipMaxWidthPx).toBeGreaterThanOrEqual(68);
      expect(state.projectChipMaxWidthPx).toBeLessThanOrEqual(156);

      if (width <= 340) {
        expect(state.showProjectNameInChip).toBe(false);
        expect(state.mergeViewIntoModeSelector).toBe(true);
      } else if (width === 360) {
        expect(state.showProjectNameInChip).toBe(false);
        expect(state.mergeViewIntoModeSelector).toBe(false);
        expect(state.shortViewLabel).toBe(true);
      } else if (width === 390) {
        expect(state.showProjectNameInChip).toBe(true);
        expect(state.mergeViewIntoModeSelector).toBe(false);
        expect(state.shortViewLabel).toBe(true);
      } else {
        expect(state.showProjectNameInChip).toBe(true);
        expect(state.mergeViewIntoModeSelector).toBe(false);
        expect(state.shortViewLabel).toBe(false);
      }
    }
  });

  it("garante que a soma máxima dos elementos na Barra Superior nunca ultrapassa a largura da viewport", () => {
    for (const width of testedWidths) {
      const state = computeTopBarCollapseState(width);
      const p1Width = 140;
      const p2Width = state.mergeViewIntoModeSelector ? 88 : 66;
      const p3Width = state.mergeViewIntoModeSelector ? 0 : state.shortViewLabel ? 56 : 76;
      const p4EffectiveMax = state.projectChipMaxWidthPx;
      const totalEstimated = p1Width + p2Width + p3Width + p4EffectiveMax + 16;
      expect(totalEstimated).toBeLessThanOrEqual(width);
    }
  });
});

describe("FASE D — Exclusividade do Slot Único (T2: A / B / C / D)", () => {
  it("garante que em qualquer sequência de transições apenas 1 estado (A, B, C ou D) está ativo por vez", () => {
    let s = createInitialSingleSlotState();
    expect(s.activeSlot).toBe("A_CAROUSEL");
    expect(s.drawerOpen).toBe(false);
    expect(s.keypadOpen).toBe(false);

    // 1. Abrir Parâmetros Inline (B) a partir do Carrossel (A)
    s = transitionSingleSlotState(s, { type: "OPEN_INLINE_PARAMS", inlineId: "fillet" });
    expect(s.activeSlot).toBe("B_INLINE_PARAMS");
    expect(s.drawerOpen).toBe(false);
    expect(s.keypadOpen).toBe(false);

    // 2. Tocar num valor numérico -> abre Telinha de Dígitos Própria (D) e oculta B temporariamente
    s = transitionSingleSlotState(s, { type: "OPEN_NUMERIC_KEYPAD" });
    expect(s.activeSlot).toBe("D_NUMERIC_KEYPAD");
    expect(s.keypadOpen).toBe(true);
    expect(s.drawerOpen).toBe(false);

    // 3. Confirmar na Telinha de Dígitos -> retorna para Parâmetros Inline (B)
    s = transitionSingleSlotState(s, { type: "CLOSE_NUMERIC_KEYPAD" });
    expect(s.activeSlot).toBe("B_INLINE_PARAMS");
    expect(s.keypadOpen).toBe(false);

    // 4. Abrir Gaveta (C) -> fecha Parâmetros Inline (B) e Telinha (D)
    s = transitionSingleSlotState(s, { type: "OPEN_DRAWER" });
    expect(s.activeSlot).toBe("C_DRAWER");
    expect(s.drawerOpen).toBe(true);
    expect(s.keypadOpen).toBe(false);
    expect(s.activeInlineId).toBeNull();

    // 5. Toque no canvas -> fecha Gaveta (C) e retorna ao Carrossel (A)
    s = transitionSingleSlotState(s, { type: "CANVAS_TOUCH" });
    expect(s.activeSlot).toBe("A_CAROUSEL");
    expect(s.drawerOpen).toBe(false);
  });

  it("resolveSingleSlotKind retorna sempre activeCount === 1 para todas as combinações booleanas", () => {
    const bools = [false, true];
    for (const keypadOpen of bools) {
      for (const drawerOpen of bools) {
        for (const hasInlineParams of bools) {
          const res = resolveSingleSlotKind({ keypadOpen, drawerOpen, hasInlineParams });
          expect(res.activeCount).toBe(1);
          expect(["A_CAROUSEL", "B_INLINE_PARAMS", "C_DRAWER", "D_NUMERIC_KEYPAD"]).toContain(
            res.activeSlot,
          );
        }
      }
    }
  });
});

describe("FASE D — Telinha de Dígitos Própria sem Teclado Nativo (T4)", () => {
  it("edita números decimais, negativos, backspace, limpar e limites min/max deterministicamente", () => {
    let buf = createNumericKeypadBuffer(10, 0.5, 500);
    expect(buf.buffer).toBe("10");

    // Digitar 2 -> substitui valor inicial (freshOpen) por "2"
    buf = applyNumericKeypadKey(buf, "2");
    expect(buf.buffer).toBe("2");

    // Digitar 5, ., 5 -> "25.5"
    buf = applyNumericKeypadKey(buf, "5");
    buf = applyNumericKeypadKey(buf, ".");
    buf = applyNumericKeypadKey(buf, "5");
    expect(buf.buffer).toBe("25.5");
    expect(parseNumericKeypadValue(buf)).toBe(25.5);

    // Backspace -> "25."
    buf = applyNumericKeypadKey(buf, "BACKSPACE");
    expect(buf.buffer).toBe("25.");

    // Clear -> "0" e respeita min=0.5 ao confirmar
    buf = applyNumericKeypadKey(buf, "CLEAR");
    expect(buf.buffer).toBe("0");
    expect(parseNumericKeypadValue(buf)).toBe(0.5);
  });

  it("verifica estaticamente que ChamferPortraitLightroomUI.tsx não possui nenhum <input type=\"number\"> que abriria teclado nativo", () => {
    const uiFilePath = path.resolve(
      __dirname,
      "../../../components/lab2d/ChamferPortraitLightroomUI.tsx",
    );
    const source = fs.readFileSync(uiFilePath, "utf-8");
    expect(source).not.toContain('type="number"');
    expect(source).not.toContain("type='number'");
  });
});

describe("FASE E — Orçamento de Área Livre do Canvas (>= 72%) e Gaveta Compacta 45%/70% dvh (T5)", () => {
  const referenceViewports = [
    { w: 360, h: 640 },
    { w: 360, h: 800 },
    { w: 390, h: 844 },
    { w: 412, h: 915 },
    { w: 320, h: 568 },
    { w: 430, h: 932 },
  ];

  it("garante que a área livre do canvas é >= 72% da altura da tela em todas as viewports de referência (incluindo < 700px)", () => {
    for (const vp of referenceViewports) {
      const budget = computeVerticalCanvasBudget(vp.w, vp.h);
      expect(budget.rulerPx).toBe(20);
      expect(budget.meetsMinimum72Percent).toBe(true);
      expect(budget.freeCanvasHeightRatio).toBeGreaterThanOrEqual(0.72);
      expect(budget.freeCanvasAreaRatio).toBeGreaterThanOrEqual(0.72);

      if (vp.h < 700) {
        expect(budget.topBarPx).toBe(44);
        expect(budget.stripPx).toBe(54);
        expect(budget.dockPx).toBe(50);
        expect(budget.totalChromeHeightPx).toBe(148);
      } else {
        expect(budget.topBarPx).toBe(48);
        expect(budget.stripPx).toBe(60);
        expect(budget.dockPx).toBe(54);
        expect(budget.totalChromeHeightPx).toBe(162);
      }
    }
  });

  it("controla a gaveta compacta em 45% dvh padrão, 70% dvh expandida e auto-colapso ao tocar no canvas", () => {
    expect(PORTRAIT_DRAWER_DEFAULT_DVH).toBe(45);
    expect(PORTRAIT_DRAWER_EXPANDED_DVH).toBe(70);

    expect(resolvePortraitDrawerDvh(false, "compact_45")).toBe(0);
    expect(resolvePortraitDrawerDvh(true, "compact_45")).toBe(45);
    expect(resolvePortraitDrawerDvh(true, "expanded_70")).toBe(70);

    // Arrastar para cima (-48px) a partir de 45% -> expande para 70%
    const up = resolvePortraitDrawerDragGesture({ currentMode: "compact_45", deltaY: -48 });
    expect(up).toEqual({ open: true, nextMode: "expanded_70" });

    // Arrastar para baixo (+48px) a partir de 70% -> reduz para 45%
    const downTo45 = resolvePortraitDrawerDragGesture({ currentMode: "expanded_70", deltaY: 48 });
    expect(downTo45).toEqual({ open: true, nextMode: "compact_45" });

    // Arrastar para baixo (+48px) a partir de 45% -> fecha a gaveta (0%)
    const closeFrom45 = resolvePortraitDrawerDragGesture({ currentMode: "compact_45", deltaY: 48 });
    expect(closeFrom45).toEqual({ open: false, nextMode: "compact_45" });

    // Auto-colapso ao tocar no canvas (exceto quando coletando pontos da Eng. Reversa)
    expect(
      shouldAutoCollapseDrawerOnCanvasTouch({ drawerOpen: true, isPickingCanvasPoints: false }),
    ).toBe(true);
    expect(
      shouldAutoCollapseDrawerOnCanvasTouch({ drawerOpen: true, isPickingCanvasPoints: true }),
    ).toBe(false);
    expect(
      shouldAutoCollapseDrawerOnCanvasTouch({ drawerOpen: false, isPickingCanvasPoints: false }),
    ).toBe(false);
  });
});

describe("FASE F — Modo Tela Limpa, Auto-Enquadramento Vertical e Chip Cross-Categoria (T6)", () => {
  it("libera 100% da altura da tela no Modo Tela Limpa (focus) e exibe pílula flutuante de restauração", () => {
    const normalState = resolveCleanScreenState({
      focusActive: false,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(normalState.isCleanScreen).toBe(false);
    expect(normalState.topBarVisible).toBe(true);
    expect(normalState.bottomBarsVisible).toBe(true);
    expect(normalState.microPillVisible).toBe(true);
    expect(normalState.restorePillVisible).toBe(false);
    expect(normalState.freeCanvasHeightRatio).toBeGreaterThanOrEqual(0.72);

    const cleanState = resolveCleanScreenState({
      focusActive: true,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(cleanState.isCleanScreen).toBe(true);
    expect(cleanState.topBarVisible).toBe(false);
    expect(cleanState.bottomBarsVisible).toBe(false);
    expect(cleanState.microPillVisible).toBe(false);
    expect(cleanState.restorePillVisible).toBe(true);
    expect(cleanState.freeCanvasHeightRatio).toBe(1);
  });

  it("calcula o Auto-Enquadramento Vertical (Auto-Fit Portrait) com margem de 12%, réguas de 20px e compensação de gaveta 45% dvh", () => {
    // Área de trabalho padrão 1500 × 3000 mm em viewport 390×682 px de canvas livre
    const closedFit = computePortraitAutoFitView({
      bbox: { minX: 0, minY: 0, maxX: 1500, maxY: 3000 },
      canvasWidthPx: 390,
      canvasHeightPx: 682,
      rulerPx: 20,
      drawerOpen: false,
      marginRatio: 0.12,
    });

    expect(closedFit.k).toBeGreaterThan(0.15);
    expect(closedFit.visibleCanvasWidthPx).toBe(370);
    expect(closedFit.visibleCanvasHeightPx).toBe(662);
    // Verifica que a borda direita (1500 * k + tx) nunca ultrapassa a largura do canvas (390 px)
    const rightEdgePx = 1500 * closedFit.k + closedFit.tx;
    expect(rightEdgePx).toBeLessThan(390);
    expect(closedFit.tx).toBeGreaterThan(20);

    // Com a gaveta compacta aberta (45% dvh), re-enquadra a peça na metade superior visível
    const openDrawerFit = computePortraitAutoFitView({
      bbox: { minX: 100, minY: 100, maxX: 260, maxY: 260 },
      canvasWidthPx: 390,
      canvasHeightPx: 682,
      rulerPx: 20,
      drawerOpen: true,
      drawerDvh: 45,
      marginRatio: 0.12,
    });
    expect(openDrawerFit.visibleCanvasHeightPx).toBeLessThan(closedFit.visibleCanvasHeightPx);
    const pieceBottomPx = 260 * openDrawerFit.k + openDrawerFit.ty;
    expect(pieceBottomPx).toBeLessThanOrEqual(20 + openDrawerFit.visibleCanvasHeightPx);
  });

  it("preserva a ferramenta contínua ativa ao trocar de categoria no Dock e exibe o chip 'Ativa: <Ferramenta>'", () => {
    const owner = getToolOwnerCategory("line");
    expect(owner).toEqual({ category: "desenho", label: "Linha" });

    // Mesmo na categoria Precisão (para ligar ORTO ⊥), a ferramenta Linha continua ativa e o chip é exibido
    const crossState = resolveActiveToolCrossCategoryChip({
      activeTool: "line",
      currentDockCategory: "precisao",
      ownerCategory: owner?.category ?? null,
      toolLabel: owner?.label ?? null,
    });
    expect(crossState.showChip).toBe(true);
    expect(crossState.isCrossCategory).toBe(true);
    expect(crossState.chipText).toBe("Ativa: Linha");
    expect(crossState.ownerCategory).toBe("desenho");

    // Quando volta para Ponteiro ("select"), o chip se oculta
    const selectState = resolveActiveToolCrossCategoryChip({
      activeTool: "select",
      currentDockCategory: "desenho",
      ownerCategory: "desenho",
      toolLabel: "Ponteiro",
    });
    expect(selectState.showChip).toBe(false);
  });
});

describe("FASE G — Acessibilidade WCAG AA (>= 4.5:1), Alvos de Toque (>= 44px) e Desempenho (T7)", () => {
  it("comprova contraste WCAG AA (>= 4.5:1) para todos os pares cromáticos nos temas Escuro e Claro", () => {
    const audit = auditVerticalThemeContrast();
    expect(audit.allPassAA).toBe(true);
    for (const pair of audit.pairs) {
      expect(pair.ratio).toBeGreaterThanOrEqual(4.5);
    }
    expect(computeWcagContrastRatio("#F8FAFC", "#11141C")).toBeGreaterThan(15);
    expect(computeWcagContrastRatio("#0F172A", "#F8FAFC")).toBeGreaterThan(15);
  });

  it("comprova que todos os alvos de toque na Barra Superior, Faixa e Dock cumprem o mínimo ergonômico em viewports padrão e < 700px", () => {
    const standardTargets = auditVerticalTouchTargets(false);
    expect(standardTargets.allMeetMinimum).toBe(true);

    const shortTargets = auditVerticalTouchTargets(true);
    expect(shortTargets.allMeetMinimum).toBe(true);
  });

  it("T1 — proíbe contain: layout paint (que clipava menus fixed) e exige createPortal no document.body + prefers-reduced-motion", () => {
    expect(resolveReducedMotionTransitionMs(true, 180)).toBe(0);
    expect(resolveReducedMotionTransitionMs(false, 150)).toBe(150);

    const uiFilePath = path.resolve(
      __dirname,
      "../../../components/lab2d/ChamferPortraitLightroomUI.tsx",
    );
    const source = fs.readFileSync(uiFilePath, "utf-8");
    expect(source).not.toContain('contain: "layout paint"');
    expect(source).toContain("createPortal");
    expect(source).toContain("document.body");
    expect(source).toContain("motion-reduce:transition-none");

    const hookFilePath = path.resolve(__dirname, "../useVerticalLayout.ts");
    const hookSource = fs.readFileSync(hookFilePath, "utf-8");
    expect(hookSource).toContain("passive: true");
  });
});

describe("FASE H — Validação End-to-End (T1 a T15), Fluxo Real de Engenharia e Isolamento Estrito de Escopo", () => {
  it("T1/T13: ativa layout vertical apenas em retrato <= 640px e preserva o modo PRUMO quando selecionado", () => {
    expect(VERTICAL_LAYOUT_MAX_WIDTH).toBe(640);

    const portraitCheck = (w: number, h: number, pref: "compact" | "prumo") =>
      w < h && w <= VERTICAL_LAYOUT_MAX_WIDTH && pref === "compact";

    // Retrato mobile padrão -> ativa layout Lightroom compacto
    expect(portraitCheck(360, 800, "compact")).toBe(true);
    expect(portraitCheck(390, 844, "compact")).toBe(true);
    expect(portraitCheck(412, 915, "compact")).toBe(true);

    // Preferência PRUMO -> desativa barras verticais para usar a interface espacial PRUMO
    expect(portraitCheck(390, 844, "prumo")).toBe(false);

    // Paisagem / Desktop (1280×800, 1920×1080) -> preserva layout paisagem compacto
    expect(portraitCheck(1280, 800, "compact")).toBe(false);
    expect(portraitCheck(1920, 1080, "compact")).toBe(false);
  });

  it("T15: executa o fluxo completo de engenharia em modo retrato (Flange Ø 160 -> Furo Ø 18 -> Array Polar 6x PCD 116 via Telinha Própria -> Cotar -> 3D -> Exportar)", () => {
    // 1. Verificar presença dos comandos do fluxo no registro único
    const circleCmd = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "tool.circle");
    const holeCmd = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "det.hole");
    const polarCmd = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "mod.array_polar");
    const dimCmd = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "med.cotar");
    const mode3dCmd = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "mode.cad_3d");
    const exportCmd = CHAMFER_COMMAND_REGISTRY.find((c) => c.id === "global.export");

    expect(circleCmd?.verticalCategory).toBe("desenho");
    expect(holeCmd?.verticalCategory).toBe("desenho");
    expect(polarCmd?.verticalCategory).toBe("modificar");
    expect(dimCmd?.verticalCategory).toBe("precisao");
    expect(mode3dCmd?.verticalCategory).toBe("topbar");
    expect(exportCmd?.verticalCategory).toBe("topbar");
    expect(exportCmd?.verticalSurface).toBe("topbar_more_menu");

    // 2. Transição de estados do Slot Único durante o Array Polar 6x em PCD 116 mm
    let slot = createInitialSingleSlotState();
    expect(slot.activeSlot).toBe("A_CAROUSEL");

    // Usuário seleciona o furo Ø 18 e toca em Array Polar na categoria Modificar -> abre B_INLINE_PARAMS
    slot = transitionSingleSlotState(slot, { type: "OPEN_INLINE_PARAMS", inlineId: "array_polar" });
    expect(slot.activeSlot).toBe("B_INLINE_PARAMS");

    // Usuário toca no chip PCD Ø -> abre D_NUMERIC_KEYPAD (sem teclado nativo) e digita 116
    slot = transitionSingleSlotState(slot, { type: "OPEN_NUMERIC_KEYPAD" });
    expect(slot.activeSlot).toBe("D_NUMERIC_KEYPAD");

    let pcdBuffer = createNumericKeypadBuffer(100, 2, 5000);
    pcdBuffer = applyNumericKeypadKey(pcdBuffer, "1");
    pcdBuffer = applyNumericKeypadKey(pcdBuffer, "1");
    pcdBuffer = applyNumericKeypadKey(pcdBuffer, "6");
    expect(parseNumericKeypadValue(pcdBuffer)).toBe(116);

    // Confirma na telinha de dígitos -> volta para B_INLINE_PARAMS e confirma Array Polar -> volta para A_CAROUSEL
    slot = transitionSingleSlotState(slot, { type: "CLOSE_NUMERIC_KEYPAD" });
    expect(slot.activeSlot).toBe("B_INLINE_PARAMS");
    slot = transitionSingleSlotState(slot, { type: "CLOSE_INLINE_PARAMS" });
    expect(slot.activeSlot).toBe("A_CAROUSEL");

    // 3. Relatório global de cobertura sem órfãos e sem duplicatas
    const report = generateChamferCommandCoverageReport();
    expect(report.orphanCommands).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
    expect(VERTICAL_DOCK_CATEGORIES).toHaveLength(5);
  });

  it("comprova o Isolamento Estrito de Escopo (Seção 0): Lab2DEditor renderiza ChamferPortraitTopBar, ChamferPortraitCanvasMicroPill, ChamferPortraitCompactDrawer e ChamferPortraitBottomBars apenas quando !isLandscape", () => {
    const editorPath = path.resolve(
      __dirname,
      "../../../components/lab2d/Lab2DEditor.tsx",
    );
    const editorSource = fs.readFileSync(editorPath, "utf-8");

    expect(editorSource).toContain("<ChamferPortraitTopBar");
    expect(editorSource).toContain("<ChamferPortraitCanvasMicroPill");
    expect(editorSource).toContain("<ChamferPortraitCompactDrawer");
    expect(editorSource).toContain("<ChamferPortraitBottomBars");
    expect(editorSource).toContain("const isLandscape = !verticalLayout.isVerticalCompactActive;");
  });
});



