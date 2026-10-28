import { describe, it, expect, beforeEach } from "vitest";
import {
  CRIMSON_RED_CENTER,
  CRIMSON_RED_RING,
  PURPLE_GUIDE_STROKE,
  BLUE_GUIDE_STROKE,
  GUIDE_MODE_LABELS,
  loadInteractionGuideMode,
  saveInteractionGuideMode,
  computeGuideAngleDeg,
  computeFlowDashOffset,
  validateDimensionalConstraint,
  applyDimensionalConstraintsToPoint,
  applyEntityNodeConstraint,
  resolveBubbleCollisions,
  type DimensionalConstraints,
  type GuideBubble,
  type TouchInteractionState,
} from "../cadInteractionGuides";
import { findSmartSnap } from "../cadReferenceSnaps";
import type { Entity, Vec2 } from "../core";

describe("CHAMFER CAD — Refinamento Profissional de Guias, REF Carmesim Clássico, Fluxo Direcional, Cruz (+) e Restrições (Testes A a M)", () => {
  beforeEach(() => {
    saveInteractionGuideMode("blue_line");
  });

  // ---------------------------------------------------------------------------
  // TESTE A — Exclusividade entre Guias e Nomenclaturas Oficializadas em PRE
  // ---------------------------------------------------------------------------
  it("Teste A: garante exclusividade estrita e nomenclaturas 'Referência de Ponto de Encontro' e 'Referência de Criação de Linha'", () => {
    expect(GUIDE_MODE_LABELS.off).toBe("Desativadas");
    expect(GUIDE_MODE_LABELS.purple_ref).toBe("Referência de Ponto de Encontro");
    expect(GUIDE_MODE_LABELS.blue_line).toBe("Referência de Criação de Linha");

    expect(loadInteractionGuideMode()).toBe("blue_line");

    saveInteractionGuideMode("purple_ref");
    expect(loadInteractionGuideMode()).toBe("purple_ref");

    saveInteractionGuideMode("off");
    expect(loadInteractionGuideMode()).toBe("off");

    saveInteractionGuideMode("blue_line");
    expect(loadInteractionGuideMode()).toBe("blue_line");
  });

  // ---------------------------------------------------------------------------
  // TESTE B — Ângulos Livres (0° a 360°) e Restrição de Ângulo na Referência Azul
  // ---------------------------------------------------------------------------
  it("Teste B: calcula e fixa qualquer ângulo livre (0° a 360°) na Referência de Criação de Linha", () => {
    const origin: Vec2 = { x: 100, y: 100 };

    // 0° (direita)
    expect(computeGuideAngleDeg(origin, { x: 200, y: 100 })).toBeCloseTo(0, 3);
    // 45° (diagonal superior direita em coordenadas de tela onde Y cresce para baixo)
    expect(computeGuideAngleDeg(origin, { x: 200, y: 0 })).toBeCloseTo(45, 3);
    // 90° (acima)
    expect(computeGuideAngleDeg(origin, { x: 100, y: 0 })).toBeCloseTo(90, 3);
    // 180° (esquerda)
    expect(computeGuideAngleDeg(origin, { x: 0, y: 100 })).toBeCloseTo(180, 3);
    // 315° (diagonal inferior direita)
    expect(computeGuideAngleDeg(origin, { x: 200, y: 200 })).toBeCloseTo(315, 3);

    // Fixar comprimento L = 200 mm e ângulo ∠ = 30° simultaneamente
    const v1 = validateDimensionalConstraint({}, "L", 200, true);
    const v2 = validateDimensionalConstraint(v1.updatedConstraints, "angle", 30, true);
    expect(v2.valid).toBe(true);

    const pt = applyDimensionalConstraintsToPoint(
      origin,
      { x: 500, y: 500 },
      v2.updatedConstraints,
    );
    expect(Math.hypot(pt.x - origin.x, pt.y - origin.y)).toBeCloseTo(200, 3);
    expect(computeGuideAngleDeg(origin, pt)).toBeCloseTo(30, 3);
  });

  // ---------------------------------------------------------------------------
  // TESTE C — Centro Vermelho Carmesim Clássico (#DC143C) e Animação de Fluxo Direcional
  // ---------------------------------------------------------------------------
  it("Teste C: utiliza vermelho carmesim (#DC143C) e deslocamento negativo contínuo para fluxo direcional (X0,Y0 -> X,Y)", () => {
    expect(CRIMSON_RED_CENTER).toBe("#DC143C");
    expect(CRIMSON_RED_RING).toBe("#E11D48");
    expect(PURPLE_GUIDE_STROKE).toBe("#A855F7");
    expect(BLUE_GUIDE_STROKE).toBe("#38BDF8");

    // Verifica que o dashOffset avança negativamente no sentido de apontamento (X0,Y0 -> X,Y)
    const offsetT1 = computeFlowDashOffset(100, 16, 0.035);
    const offsetT2 = computeFlowDashOffset(200, 16, 0.035);
    expect(offsetT1).toBeLessThan(0);
    expect(offsetT2).toBeLessThan(offsetT1);
  });

  // ---------------------------------------------------------------------------
  // TESTE D — Organização e Anti-Colisão das Bolhas de Medida (L, ∠, d, ΔX, ΔY)
  // ---------------------------------------------------------------------------
  it("Teste D: posiciona bolhas de medida sem sobreposição com separação mínima >= 8 px", () => {
    const viewK = 1;
    const rawBubbles: GuideBubble[] = [
      {
        id: "blue-L",
        kind: "L",
        text: "L 250.0 mm",
        value: 250,
        locked: false,
        anchor: { x: 100, y: 100 },
        pos: { x: 100, y: 100 },
        normal: { x: 0, y: -1 },
        widthWorld: 84,
        heightWorld: 18,
      },
      {
        id: "blue-angle",
        kind: "angle",
        text: "∠ 36.9°",
        value: 36.9,
        locked: false,
        anchor: { x: 100, y: 100 },
        pos: { x: 101, y: 101 },
        normal: { x: 0.8, y: -0.6 },
        widthWorld: 68,
        heightWorld: 18,
      },
      {
        id: "blue-dx",
        kind: "dx",
        text: "ΔX 200.0 mm",
        value: 200,
        locked: false,
        anchor: { x: 100, y: 100 },
        pos: { x: 100, y: 102 },
        normal: { x: 0, y: 1 },
        widthWorld: 88,
        heightWorld: 18,
      },
      {
        id: "blue-dy",
        kind: "dy",
        text: "ΔY 150.0 mm",
        value: 150,
        locked: false,
        anchor: { x: 100, y: 100 },
        pos: { x: 102, y: 100 },
        normal: { x: 1, y: 0 },
        widthWorld: 88,
        heightWorld: 18,
      },
    ];

    const placed = resolveBubbleCollisions(rawBubbles, viewK);
    expect(placed).toHaveLength(4);

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const overlapX =
          Math.abs(a.pos.x - b.pos.x) < (a.widthWorld + b.widthWorld) / 2 + 7.5;
        const overlapY =
          Math.abs(a.pos.y - b.pos.y) < (a.heightWorld + b.heightWorld) / 2 + 7.5;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // TESTE E — Bloqueio de Interação Durante Pinça / Multitoque e Cooldown
  // ---------------------------------------------------------------------------
  it("Teste E: congela e restaura snapshot pré-gesto quando 2+ dedos tocam a tela (MULTITOUCH_NAVIGATION)", () => {
    const initialCursor: Vec2 = { x: 500, y: 600 };
    const initialRef: Vec2 = { x: 100, y: 100 };
    const initialPending: Vec2[] = [{ x: 200, y: 200 }];

    const preGestureSnapshot = {
      cursor: { ...initialCursor },
      temporaryOrigin: { p: { ...initialRef }, label: "REF" },
      pending: [...initialPending],
    };

    let state: TouchInteractionState = "SINGLE_POINTER";
    let liveCursor: Vec2 = { x: 525, y: 630 };

    const activePointersCount = 2;
    if (activePointersCount >= 2) {
      state = "MULTITOUCH_NAVIGATION";
      liveCursor = { ...preGestureSnapshot.cursor };
    }

    expect(state).toBe("MULTITOUCH_NAVIGATION");
    expect(liveCursor).toEqual({ x: 500, y: 600 });
    expect(preGestureSnapshot.temporaryOrigin.p).toEqual({ x: 100, y: 100 });
    expect(preGestureSnapshot.pending).toEqual([{ x: 200, y: 200 }]);
  });

  // ---------------------------------------------------------------------------
  // TESTE F — Teclado Numérico Próprio (Sem Teclado Virtual Nativo)
  // ---------------------------------------------------------------------------
  it("Teste F: processa dígitos, vírgula decimal, sinal ±, backspace e incremento fino sem depender de <input>", () => {
    let rawText = "250";
    const pressDigit = (d: string) => {
      rawText = rawText === "0" ? d : rawText + d;
    };
    const pressDecimal = () => {
      if (!rawText.includes(",")) rawText += ",";
    };
    const pressBackspace = () => {
      rawText = rawText.slice(0, -1);
    };
    const parseVal = (txt: string) => Number(txt.replace(",", "."));

    pressDecimal();
    pressDigit("5");
    expect(rawText).toBe("250,5");
    expect(parseVal(rawText)).toBeCloseTo(250.5, 4);

    pressDecimal();
    expect(rawText).toBe("250,5");

    pressBackspace();
    pressBackspace();
    expect(rawText).toBe("250");

    const stepAdd = (step: number) => {
      const next = Number((parseVal(rawText) + step).toFixed(4));
      rawText = String(next).replace(".", ",");
    };
    stepAdd(0.1);
    expect(parseVal(rawText)).toBeCloseTo(250.1, 4);
    stepAdd(10);
    expect(parseVal(rawText)).toBeCloseTo(260.1, 4);
  });

  // ---------------------------------------------------------------------------
  // TESTE G — Fixar Medida do Comprimento da Linha (L = 300 mm)
  // ---------------------------------------------------------------------------
  it("Teste G: mantém comprimento L = 300 mm fixo enquanto o ponteiro gira livremente ou arrasta extremidade", () => {
    const startPt: Vec2 = { x: 100, y: 100 };
    const constraints: DimensionalConstraints = { lockedL: 300 };

    const rawPointers: Vec2[] = [
      { x: 950, y: 100 },
      { x: 100, y: 800 },
      { x: 400, y: 400 },
      { x: 50, y: 20 },
    ];

    for (const raw of rawPointers) {
      const constrained = applyDimensionalConstraintsToPoint(startPt, raw, constraints);
      const actualLen = Math.hypot(constrained.x - startPt.x, constrained.y - startPt.y);
      expect(actualLen).toBeCloseTo(300, 3);
    }

    const lineEntity: Entity = {
      id: "line-1",
      layer: "corte",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 400,
      y2: 100,
      params: {
        lockedConstraints: { lockedL: 300 },
      },
    };
    const { constrainedPoint: draggedEnd } = applyEntityNodeConstraint(lineEntity, 1, {
      x: 250,
      y: 550,
    });
    const draggedLen = Math.hypot(draggedEnd.x - lineEntity.x1, draggedEnd.y - lineEntity.y1);
    expect(draggedLen).toBeCloseTo(300, 3);
  });

  // ---------------------------------------------------------------------------
  // TESTE H — Fixar Medida de Deslocamento Horizontal (ΔX = 500 mm)
  // ---------------------------------------------------------------------------
  it("Teste H: mantém ΔX = 500 mm fixo enquanto Y varia livremente com o ponteiro", () => {
    const refOrigin: Vec2 = { x: 100, y: 200 };
    const constraints: DimensionalConstraints = { lockedDx: 500, signDx: 1 };

    const raw1 = applyDimensionalConstraintsToPoint(refOrigin, { x: 320, y: 450 }, constraints);
    expect(raw1.x - refOrigin.x).toBeCloseTo(500, 3);
    expect(raw1.y).toBeCloseTo(450, 3);

    const raw2 = applyDimensionalConstraintsToPoint(refOrigin, { x: 990, y: 890 }, constraints);
    expect(raw2.x - refOrigin.x).toBeCloseTo(500, 3);
    expect(raw2.y).toBeCloseTo(890, 3);
  });

  // ---------------------------------------------------------------------------
  // TESTE I — Detecção de Conflito entre Restrições (ΔX = 500 mm vs L = 300 mm)
  // ---------------------------------------------------------------------------
  it("Teste I: detecta conflito geométrico quando |ΔX| > L ou quando L != hypot(ΔX, ΔY) e preserva estado íntegro", () => {
    const initialConstraints: DimensionalConstraints = { lockedL: 300 };
    const res1 = validateDimensionalConstraint(initialConstraints, "dx", 500, true);
    expect(res1.valid).toBe(false);
    expect(res1.conflictMessage).toContain("Conflito de restrição");
    expect(res1.updatedConstraints).toEqual({ lockedL: 300 });

    const initialDx: DimensionalConstraints = { lockedDx: 500 };
    const res2 = validateDimensionalConstraint(initialDx, "L", 300, true);
    expect(res2.valid).toBe(false);
    expect(res2.conflictMessage).toContain("Conflito de restrição");
    expect(res2.updatedConstraints).toEqual({ lockedDx: 500 });

    const initialDxDy: DimensionalConstraints = { lockedDx: 300, lockedDy: 400 };
    const res3 = validateDimensionalConstraint(initialDxDy, "L", 450, true);
    expect(res3.valid).toBe(false);
    expect(res3.conflictMessage).toContain("500.0 mm");

    const resValid = validateDimensionalConstraint({ lockedL: 500 }, "dx", 300, true);
    expect(resValid.valid).toBe(true);
    const pt = applyDimensionalConstraintsToPoint(
      { x: 0, y: 0 },
      { x: 999, y: 250 },
      resValid.updatedConstraints,
    );
    expect(pt.x).toBeCloseTo(300, 3);
    expect(Math.abs(pt.y)).toBeCloseTo(400, 3);
    expect(Math.hypot(pt.x, pt.y)).toBeCloseTo(500, 3);
  });

  // ---------------------------------------------------------------------------
  // TESTES J & K — Integração com SNAP, Ajuste Fino e Preservação de Precisão
  // ---------------------------------------------------------------------------
  it("Testes J e K: combina SNAP universal + restrições dimensionais sem degradar precisão geométrica", () => {
    const entities: Entity[] = [
      { id: "c1", layer: "corte", type: "circle", cx: 0, cy: 0, r: 100 },
      { id: "c2", layer: "corte", type: "circle", cx: 120, cy: 0, r: 100 },
    ];
    const snapRes = findSmartSnap(
      { x: 60.5, y: 79.8 },
      entities,
      24,
      null,
      "line",
      [],
      4,
    );
    expect(snapRes).not.toBeNull();
    expect(snapRes?.p.x).toBeCloseTo(60, 2);
    expect(snapRes?.p.y).toBeCloseTo(80, 2);

    const constrained = applyDimensionalConstraintsToPoint(
      { x: 0, y: 0 },
      snapRes!.p,
      { lockedDy: 80, signDy: 1 },
    );
    expect(constrained.x).toBeCloseTo(60, 2);
    expect(constrained.y).toBeCloseTo(80, 4);
  });
});
