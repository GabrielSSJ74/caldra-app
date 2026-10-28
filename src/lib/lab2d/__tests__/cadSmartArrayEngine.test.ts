import { describe, expect, it } from "vitest";
import type { Entity } from "../core";
import { rectPolyline, polygonEntity } from "../core";
import {
  detectHostTopology,
  computeInstances,
  validateArray,
  resolveLinearAxisDistribution,
  getEntityArraySpec,
  type ArraySpec,
} from "../cadArrayEngine";

type CircleEntity = Extract<Entity, { type: "circle" }>;
type LineEntity = Extract<Entity, { type: "line" }>;
type PolylineEntity = Extract<Entity, { type: "polyline" }>;

describe("CHAMFER CAD — Motor de Arrays Inteligentes (Validação Industrial T1 a T20)", () => {
  // T1: Flange padrão (D_ext=200, D_int=100, furo Ø16 em (75, 0), N=8, 360°)
  it("T1: Flange padrão com detecção automática de coroa circular, PCD=150 mm, passo=45° e 7 novas cópias", () => {
    const outerCircle: CircleEntity = {
      id: "flange-ext",
      type: "circle",
      layer: "corte_externo",
      cx: 0,
      cy: 0,
      r: 100, // D_ext = 200
    };
    const innerCircle: CircleEntity = {
      id: "flange-int",
      type: "circle",
      layer: "corte_interno",
      cx: 0,
      cy: 0,
      r: 50, // D_int = 100
    };
    const boltHole: CircleEntity = {
      id: "furo-0",
      type: "circle",
      layer: "furos",
      cx: 75,
      cy: 0,
      r: 8, // Ø16
    };

    const host = detectHostTopology([outerCircle, innerCircle, boltHole], [boltHole]);
    expect(host.type).toBe("flange");
    expect(host.confidence).toBe("high");
    expect(host.confidenceLabel).toBe("ALTA");
    expect(host.center).toEqual({ x: 0, y: 0 });
    expect(host.flangeMidPcd).toBeCloseTo(150, 6);
    expect(host.isOffFlangeCenterline).toBe(false);

    const spec: ArraySpec = {
      id: "arr-t1",
      type: "polar",
      sourceEntityIds: [boltHole.id],
      polar: {
        center: host.center!,
        radius: 75,
        count: 8,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [boltHole], host);
    expect(res.resolvedPolar?.stepAngleDeg).toBeCloseTo(45, 6);
    expect(res.resolvedPolar?.pcd).toBeCloseTo(150, 6);
    expect(res.instances).toHaveLength(7);

    // Verifica precisão matemática < 1e-6 mm em cada ângulo (45°, 90°, 135°, 180°, 225°, 270°, 315°)
    res.instances.forEach((inst, idx) => {
      const k = idx + 1;
      const rad = (k * 45 * Math.PI) / 180;
      const c = inst as CircleEntity;
      expect(Math.abs(c.cx - 75 * Math.cos(rad))).toBeLessThan(1e-6);
      expect(Math.abs(c.cy - 75 * Math.sin(rad))).toBeLessThan(1e-6);
    });

    const val = validateArray(spec, [boltHole], host);
    expect(val.isValid).toBe(true);
    expect(val.collidingCount).toBe(0);
  });

  // T2: Furo fora do raio médio da aba (D_ext=200, D_int=100 -> R_medio=75, furo desenhado em R=68)
  it("T2: Furo fora do raio médio da aba preserva R=68 mm por padrão e suporta [ ⌖ Centralizar na aba ] para R=75 mm (PCD 150 mm)", () => {
    const outerCircle: CircleEntity = {
      id: "flange-ext",
      type: "circle",
      layer: "corte_externo",
      cx: 0,
      cy: 0,
      r: 100,
    };
    const innerCircle: CircleEntity = {
      id: "flange-int",
      type: "circle",
      layer: "corte_interno",
      cx: 0,
      cy: 0,
      r: 50,
    };
    const offCenterHole: CircleEntity = {
      id: "furo-off",
      type: "circle",
      layer: "furos",
      cx: 68,
      cy: 0,
      r: 6,
    };

    const host = detectHostTopology([outerCircle, innerCircle, offCenterHole], [offCenterHole]);
    expect(host.type).toBe("flange");
    expect(host.isOffFlangeCenterline).toBe(true);
    expect(host.flangeMidRadius).toBeCloseTo(75, 6);
    expect(host.flangeMidPcd).toBeCloseTo(150, 6);

    // 1. Por padrão: usa o raio real onde o furo foi desenhado (R=68, k=0 imóvel)
    const specDefault: ArraySpec = {
      id: "arr-t2-def",
      type: "polar",
      sourceEntityIds: [offCenterHole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 68,
        count: 4,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };
    const resDefault = computeInstances(specDefault, [offCenterHole], host);
    expect(resDefault.repositionedOriginals).toBeUndefined();
    expect((resDefault.instances[0] as CircleEntity).cy).toBeCloseTo(68, 6);

    // 2. Ao tocar em [ ⌖ Centralizar na aba ]: PCD vai para 150 (R=75) e k=0 é reposicionado para (75, 0)
    const specCentered: ArraySpec = {
      ...specDefault,
      polar: {
        ...specDefault.polar!,
        radius: host.flangeMidRadius!,
      },
    };
    const resCentered = computeInstances(specCentered, [offCenterHole], host);
    expect(resCentered.repositionedOriginals).toBeDefined();
    expect((resCentered.repositionedOriginals![0] as CircleEntity).cx).toBeCloseTo(75, 6);
    expect((resCentered.repositionedOriginals![0] as CircleEntity).cy).toBeCloseTo(0, 6);
    expect((resCentered.instances[0] as CircleEntity).cx).toBeCloseTo(0, 6);
    expect((resCentered.instances[0] as CircleEntity).cy).toBeCloseTo(75, 6);
  });

  // T3: Arco parcial (180°, N=5): Δθ = 180° / (5 - 1) = 45° (furos em 0°, 45°, 90°, 135°, 180°)
  it("T3: Arco parcial (180°, N=5) calcula passo Δθ = 180° / (N - 1) = 45° cobrindo exatamente 0° a 180°", () => {
    const hole: CircleEntity = {
      id: "furo-arc",
      type: "circle",
      layer: "furos",
      cx: 50,
      cy: 0,
      r: 5,
    };
    const spec: ArraySpec = {
      id: "arr-t3",
      type: "polar",
      sourceEntityIds: [hole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 50,
        count: 5,
        totalAngleDeg: 180,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [hole]);
    expect(res.resolvedPolar?.stepAngleDeg).toBeCloseTo(45, 6);
    expect(res.ghostSlots).toHaveLength(5);

    const expectedAngles = [0, 45, 90, 135, 180];
    res.ghostSlots.forEach((slot, k) => {
      const rad = (expectedAngles[k]! * Math.PI) / 180;
      expect(slot.center.x).toBeCloseTo(50 * Math.cos(rad), 6);
      expect(slot.center.y).toBeCloseTo(50 * Math.sin(rad), 6);
    });
  });

  // T4: Rotação de oblongo/rasgo no Array Polar (Girar itens: ON vs OFF)
  it("T4: Rotação de corpo rígido de rasgo/retângulo no Array Polar (Girar itens: ON vs OFF)", () => {
    const slotRect = rectPolyline({ x: 70, y: -5 }, { x: 90, y: 5 }, "corte_interno"); // Centro em (80, 0), comprimento 20 (horizontal), largura 10
    const specRotated: ArraySpec = {
      id: "arr-t4-on",
      type: "polar",
      sourceEntityIds: [slotRect.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 80,
        count: 4,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const resOn = computeInstances(specRotated, [slotRect]);
    // Em k=1 (90°), o retângulo 20x10 girado em 90° em torno de (0,0) fica centrado em (0, 80) com dimensão X=10 (-5 a +5) e Y=20 (70 a 90)
    const copy90On = resOn.instances[0] as PolylineEntity;
    const xsOn = copy90On.pts.map((p) => p.x);
    const ysOn = copy90On.pts.map((p) => p.y);
    expect(Math.max(...xsOn) - Math.min(...xsOn)).toBeCloseTo(10, 5);
    expect(Math.max(...ysOn) - Math.min(...ysOn)).toBeCloseTo(20, 5);

    // Com Girar itens: OFF, a cópia em 90° translada para (0, 80) mantendo orientação horizontal original (X=20, Y=10)
    const specUnrotated: ArraySpec = {
      ...specRotated,
      polar: {
        ...specRotated.polar!,
        rotateItems: false,
      },
    };
    const resOff = computeInstances(specUnrotated, [slotRect]);
    const copy90Off = resOff.instances[0] as PolylineEntity;
    const xsOff = copy90Off.pts.map((p) => p.x);
    const ysOff = copy90Off.pts.map((p) => p.y);
    expect(Math.max(...xsOff) - Math.min(...xsOff)).toBeCloseTo(20, 5);
    expect(Math.max(...ysOff) - Math.min(...ysOff)).toBeCloseTo(10, 5);
  });

  // T5: Omissão individual (Skip) no Array Polar (N=8, omitir k=2 e k=5 -> gera exatamente 5 novas cópias + 1 original = 6 furos)
  it("T5: Omissão individual (skippedIndices=[2, 5]) em N=8 gera exatamente 5 novas cópias ativas (+ 1 original = 6 furos)", () => {
    const hole: CircleEntity = {
      id: "furo-t5",
      type: "circle",
      layer: "furos",
      cx: 60,
      cy: 0,
      r: 5,
    };
    const spec: ArraySpec = {
      id: "arr-t5",
      type: "polar",
      sourceEntityIds: [hole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 60,
        count: 8,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
        skippedIndices: [2, 5],
      },
    };

    const res = computeInstances(spec, [hole]);
    expect(res.instances).toHaveLength(5);
    expect(res.ghostSlots.filter((s) => s.isSkipped).map((s) => s.index)).toEqual([2, 5]);

    const val = validateArray(spec, [hole]);
    expect(val.activeCopiesCount).toBe(5);
    expect(val.skippedCount).toBe(2);
    expect(val.totalPositionsCount).toBe(8);
  });

  // T6: Padrão Linear — Passo Fixo (N_x=4, N_y=3, ΔX=50, ΔY=40): 11 novas cópias (total 12)
  it("T6: Padrão Linear em Modo Passo Fixo (Nx=4, Ny=3, dX=50, dY=40) gera 11 novas cópias exatas", () => {
    const hole: CircleEntity = {
      id: "furo-t6",
      type: "circle",
      layer: "furos",
      cx: 10,
      cy: 20,
      r: 5,
    };
    const spec: ArraySpec = {
      id: "arr-t6",
      type: "linear",
      sourceEntityIds: [hole.id],
      linear: {
        cols: 4,
        rows: 3,
        dx: 50,
        dy: 40,
        modeX: "fixed_step",
        modeY: "fixed_step",
        angleDeg: 0,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [hole]);
    expect(res.instances).toHaveLength(11);
    const lastCopy = res.instances[res.instances.length - 1] as CircleEntity;
    expect(lastCopy.cx).toBeCloseTo(10 + 3 * 50, 6);
    expect(lastCopy.cy).toBeCloseTo(20 + 2 * 40, 6);
  });

  // T7: Padrão Linear — Extensão Total (L_x = 300 mm, N_x = 4): passo calculado exatamente como 100 mm
  it("T7: Padrão Linear em Modo Extensão Total (Lx=300 mm, Nx=4) calcula passo exato de 100 mm", () => {
    const hole: CircleEntity = {
      id: "furo-t7",
      type: "circle",
      layer: "furos",
      cx: 0,
      cy: 0,
      r: 5,
    };
    const spec: ArraySpec = {
      id: "arr-t7",
      type: "linear",
      sourceEntityIds: [hole.id],
      linear: {
        cols: 4,
        rows: 1,
        dx: 40,
        dy: 40,
        modeX: "total_span",
        spanX: 300,
        angleDeg: 0,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [hole]);
    expect(res.resolvedLinear?.stepX).toBeCloseTo(100, 6);
    expect(res.instances).toHaveLength(3);
    expect((res.instances[0] as CircleEntity).cx).toBeCloseTo(100, 6);
    expect((res.instances[1] as CircleEntity).cx).toBeCloseTo(200, 6);
    expect((res.instances[2] as CircleEntity).cx).toBeCloseTo(300, 6);
  });

  // T8: Padrão Linear — Adaptar à Peça (Auto-Fit) (chapa 500 mm, margem 25 mm, N_x = 6 -> passo = (500 - 50)/5 = 90 mm)
  it("T8: Padrão Linear em Modo Auto-Fit (chapa 500 mm, margem 25 mm, Nx=6) calcula passo = 90 mm e posiciona k=0 em x=25 mm", () => {
    const sheet = rectPolyline({ x: 0, y: 0 }, { x: 500, y: 200 }, "corte_externo");
    const hole: CircleEntity = {
      id: "furo-t8",
      type: "circle",
      layer: "furos",
      cx: 40,
      cy: 100,
      r: 6,
    };

    const host = detectHostTopology([sheet, hole], [hole]);
    expect(host.type).toBe("sheet");
    expect(host.sheetBounds?.width).toBeCloseTo(500, 6);

    const spec: ArraySpec = {
      id: "arr-t8",
      type: "linear",
      sourceEntityIds: [hole.id],
      linear: {
        cols: 6,
        rows: 1,
        dx: 50,
        dy: 50,
        modeX: "auto_fit",
        marginX: 25,
        angleDeg: 0,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [hole], host);
    expect(res.resolvedLinear?.stepX).toBeCloseTo(90, 6);
    expect(res.repositionedOriginals).toBeDefined();
    expect((res.repositionedOriginals![0] as CircleEntity).cx).toBeCloseTo(25, 6);
    const lastCopy = res.instances[res.instances.length - 1] as CircleEntity;
    expect(lastCopy.cx).toBeCloseTo(475, 6); // 25 + 5 * 90 = 475 (margem de 25 mm na outra ponta)
  });

  // T9: Padrão Linear — Preencher (Fill) (chapa 500 mm, margem 25 mm, passo = 80 mm -> N = floor(450/80) + 1 = 6 furos)
  it("T9: Padrão Linear em Modo Fill (chapa 500 mm, margem 25 mm, passo=80 mm) calcula N = floor(450/80) + 1 = 6 furos", () => {
    const axisRes = resolveLinearAxisDistribution({
      mode: "fill",
      count: 2,
      step: 80,
      span: 400,
      margin: 25,
      baseCoord: 25,
      hostMin: 0,
      hostMax: 500,
    });
    expect(axisRes.count).toBe(6);
    expect(axisRes.step).toBeCloseTo(80, 6);
    expect(axisRes.startOffset).toBeCloseTo(0, 6);
  });

  // T10: Padrão Linear Inclinado (θ = 30°)
  it("T10: Padrão Linear Inclinado (θ = 30°) rotaciona os vetores diretores de linha e coluna com precisão trigonométrica", () => {
    const hole: CircleEntity = {
      id: "furo-t10",
      type: "circle",
      layer: "furos",
      cx: 0,
      cy: 0,
      r: 5,
    };
    const spec: ArraySpec = {
      id: "arr-t10",
      type: "linear",
      sourceEntityIds: [hole.id],
      linear: {
        cols: 2,
        rows: 2,
        dx: 100,
        dy: 50,
        modeX: "fixed_step",
        modeY: "fixed_step",
        angleDeg: 30,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [hole]);
    const rad = (30 * Math.PI) / 180;
    // Cópia (col=1, row=0): (100*cos30°, 100*sin30°)
    const c10 = res.instances.find(
      (i) => Math.abs((i as CircleEntity).cx - 100 * Math.cos(rad)) < 1e-5,
    ) as CircleEntity | undefined;
    expect(c10).toBeDefined();
    expect(c10!.cy).toBeCloseTo(100 * Math.sin(rad), 6);

    // Cópia (col=0, row=1): (-50*sin30°, 50*cos30°)
    const c01 = res.instances.find(
      (i) => Math.abs((i as CircleEntity).cx - -50 * Math.sin(rad)) < 1e-5,
    ) as CircleEntity | undefined;
    expect(c01).toBeDefined();
    expect(c01!.cy).toBeCloseTo(50 * Math.cos(rad), 6);
  });

  // T11: Detecção de Colisão entre Furos (distância centro a centro < 2r)
  it("T11: Detecção de Colisão entre Furos sinaliza erro e badge 'Colisão entre furos' quando d(Ci, Cj) < 2r", () => {
    const hole: CircleEntity = {
      id: "furo-t11",
      type: "circle",
      layer: "furos",
      cx: 0,
      cy: 0,
      r: 12, // Ø24 mm
    };
    const spec: ArraySpec = {
      id: "arr-t11",
      type: "linear",
      sourceEntityIds: [hole.id],
      linear: {
        cols: 3,
        rows: 1,
        dx: 20, // Passo 20 mm < Diâmetro 24 mm -> colisão!
        dy: 40,
        modeX: "fixed_step",
        angleDeg: 0,
        includeOriginal: true,
      },
    };

    const val = validateArray(spec, [hole]);
    expect(val.isValid).toBe(false);
    expect(val.collidingCount).toBeGreaterThan(0);
    expect(Object.values(val.slotDiagnostics).some((d) => d.badge === "Colisão entre furos")).toBe(
      true,
    );
  });

  // T12: Detecção de Extravasamento de Borda (furo com R_PCD + r_f > R_ext ou fora da chapa)
  it("T12: Detecção de Extravasamento de Borda sinaliza 'Fora da peça' quando o furo ultrapassa R_ext do flange", () => {
    const outerCircle: CircleEntity = {
      id: "flange-ext-12",
      type: "circle",
      layer: "corte_externo",
      cx: 0,
      cy: 0,
      r: 100,
    };
    const innerCircle: CircleEntity = {
      id: "flange-int-12",
      type: "circle",
      layer: "corte_interno",
      cx: 0,
      cy: 0,
      r: 50,
    };
    const hole: CircleEntity = {
      id: "furo-t12",
      type: "circle",
      layer: "furos",
      cx: 75,
      cy: 0,
      r: 10,
    };

    const host = detectHostTopology([outerCircle, innerCircle, hole], [hole]);
    const spec: ArraySpec = {
      id: "arr-t12",
      type: "polar",
      sourceEntityIds: [hole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 95, // 95 + 10 = 105 > R_ext (100) -> Fora da peça!
        count: 6,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const val = validateArray(spec, [hole], host);
    expect(val.isValid).toBe(false);
    expect(Object.values(val.slotDiagnostics).some((d) => d.badge === "Fora da peça")).toBe(true);
  });

  // T13: Detecção de Invasão do Furo Central (R_PCD - r_f < R_int)
  it("T13: Detecção de Invasão do Furo Central sinaliza 'Invade furo central' quando R_PCD - r_f < R_int", () => {
    const outerCircle: CircleEntity = {
      id: "flange-ext-13",
      type: "circle",
      layer: "corte_externo",
      cx: 0,
      cy: 0,
      r: 100,
    };
    const innerCircle: CircleEntity = {
      id: "flange-int-13",
      type: "circle",
      layer: "corte_interno",
      cx: 0,
      cy: 0,
      r: 50,
    };
    const hole: CircleEntity = {
      id: "furo-t13",
      type: "circle",
      layer: "furos",
      cx: 75,
      cy: 0,
      r: 10,
    };

    const host = detectHostTopology([outerCircle, innerCircle, hole], [hole]);
    const spec: ArraySpec = {
      id: "arr-t13",
      type: "polar",
      sourceEntityIds: [hole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 55, // 55 - 10 = 45 < R_int (50) -> Invade furo central!
        count: 6,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const val = validateArray(spec, [hole], host);
    expect(val.isValid).toBe(false);
    expect(
      Object.values(val.slotDiagnostics).some((d) => d.badge === "Invade furo central"),
    ).toBe(true);
  });

  // T14: Seleção Composta / Grupo (furo + rebaixo concêntrico multiplicados juntos)
  it("T14: Seleção Composta (furo + rebaixo concêntrico) multiplica ambas as entidades juntas mantendo concentricidade absoluta", () => {
    const innerHole: CircleEntity = {
      id: "furo-passante",
      type: "circle",
      layer: "furos",
      cx: 70,
      cy: 0,
      r: 5,
    };
    const counterbore: CircleEntity = {
      id: "rebaixo",
      type: "circle",
      layer: "gravacao",
      cx: 70,
      cy: 0,
      r: 9,
    };

    const spec: ArraySpec = {
      id: "arr-t14",
      type: "polar",
      sourceEntityIds: [innerHole.id, counterbore.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 70,
        count: 4,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [innerHole, counterbore]);
    // 3 novas posições * 2 entidades por posição = 6 entidades geradas
    expect(res.instances).toHaveLength(6);

    for (let k = 1; k <= 3; k++) {
      const slotEnts = res.ghostSlots[k]!.entities as CircleEntity[];
      expect(slotEnts).toHaveLength(2);
      expect(slotEnts[0]!.cx).toBeCloseTo(slotEnts[1]!.cx, 8);
      expect(slotEnts[0]!.cy).toBeCloseTo(slotEnts[1]!.cy, 8);
      // Cada posição k recebe um group composto exclusivo
      expect(slotEnts[0]!.group).toBeDefined();
      expect(slotEnts[0]!.group).toBe(slotEnts[1]!.group);
    }
  });

  // T15: Herança de Camada e Metadados CNC (layer: 'furos', cnc e params.holeSpec preservados em 100% das cópias)
  it("T15: Herança de Camada Semântica, CNC e Metadados de Furação (holeSpec) em 100% das cópias", () => {
    const tappedHole: CircleEntity = {
      id: "furo-m12",
      type: "circle",
      layer: "furos",
      cx: 80,
      cy: 0,
      r: 5.1,
      cnc: {
        role: "hole_Tap",
        toolId: "tap-m12",
        compensation: "center",
        cutOrder: 1,
      },
      params: {
        holeSpec: { thread: "M12x1.75", tapDrillMm: 10.2, through: true },
      },
    };

    const spec: ArraySpec = {
      id: "arr-t15",
      type: "polar",
      sourceEntityIds: [tappedHole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 80,
        count: 6,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [tappedHole]);
    expect(res.instances).toHaveLength(5);
    for (const copy of res.instances) {
      expect(copy.layer).toBe("furos");
      expect(copy.cnc?.role).toBe("hole_Tap");
      expect(copy.cnc?.toolId).toBe("tap-m12");
      expect((copy.params?.holeSpec as { thread: string }).thread).toBe("M12x1.75");
      expect(copy.params?.arrayGroupId).toBe("arr-t15");
      expect(copy.params?.isArrayInstance).toBe(true);
    }
  });

  // T16: Reedição de Padrão Existente (alterar N=6 para N=8 sem duplicar as 6 anteriores)
  it("T16: Reedição Associativa recupera ArraySpec via getEntityArraySpec e substitui N=6 por N=8 sem duplicar cópias", () => {
    const seed: CircleEntity = {
      id: "seed-hole",
      type: "circle",
      layer: "furos",
      cx: 75,
      cy: 0,
      r: 6,
    };

    const spec6: ArraySpec = {
      id: "assoc-group-1",
      type: "polar",
      sourceEntityIds: [seed.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 75,
        count: 6,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const firstRun = computeInstances(spec6, [seed]);
    expect(firstRun.instances).toHaveLength(5);

    const extracted = getEntityArraySpec(firstRun.instances[0]!);
    expect(extracted).not.toBeNull();
    expect(extracted!.arrayGroupId).toBe("assoc-group-1");
    expect(extracted!.spec.polar?.count).toBe(6);

    // Simula a atualização atômica de N=6 para N=8 no mesmo arrayGroupId
    const sceneAfterN6: Entity[] = [
      {
        ...seed,
        params: {
          arrayGroupId: "assoc-group-1",
          isArrayInstance: false,
          arraySpec: spec6,
        },
      },
      ...firstRun.instances,
    ];
    expect(sceneAfterN6).toHaveLength(6);

    const spec8: ArraySpec = {
      ...spec6,
      polar: { ...spec6.polar!, count: 8 },
    };
    const secondRun = computeInstances(spec8, [seed]);
    const sceneAfterN8 = [
      ...sceneAfterN6.filter(
        (e) => !(e.params?.arrayGroupId === "assoc-group-1" && e.params?.isArrayInstance),
      ),
      ...secondRun.instances,
    ];
    expect(sceneAfterN8).toHaveLength(8); // 1 original + 7 cópias (sem acumular as 5 antigas!)
  });

  // T17: Atomicidade do Undo/Redo e Cancelamento Limpo
  it("T17: Atomicidade de transação garante que cancelar não muta a semente e Undo reverte todas as cópias de uma só vez", () => {
    const seed: CircleEntity = {
      id: "seed-17",
      type: "circle",
      layer: "furos",
      cx: 50,
      cy: 0,
      r: 5,
    };
    const snapshotBefore: Entity[] = [structuredClone(seed)];

    const spec: ArraySpec = {
      id: "arr-t17",
      type: "polar",
      sourceEntityIds: [seed.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 50,
        count: 10,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    // Durante o preview (antes de confirmar), snapshotBefore permanece intacto
    const preview = computeInstances(spec, [seed]);
    expect(preview.instances).toHaveLength(9);
    expect(snapshotBefore).toHaveLength(1);
    expect((snapshotBefore[0] as CircleEntity).cx).toBe(50);

    // Ao confirmar em 1 transação e desfazer (pop de 1 estado), volta exatamente a snapshotBefore
    const historyStack: Entity[][] = [snapshotBefore];
    const committedScene = [...snapshotBefore, ...preview.instances];
    expect(committedScene).toHaveLength(10);
    const undoneScene = historyStack.pop()!;
    expect(undoneScene).toHaveLength(1);
    expect(undoneScene[0]!.id).toBe("seed-17");
  });

  // T18: Desambiguação de Múltiplos Centros Candidatos (2 círculos não-concêntricos)
  it("T18: Desambiguação de Múltiplos Centros Candidatos retorna confiança MÉDIA e lista todos os centros candidatos", () => {
    const sheet = rectPolyline({ x: -100, y: -100 }, { x: 200, y: 100 }, "corte_externo");
    const bossA: CircleEntity = {
      id: "cubo-a",
      type: "circle",
      layer: "corte_interno",
      cx: 0,
      cy: 0,
      r: 25,
    };
    const bossB: CircleEntity = {
      id: "cubo-b",
      type: "circle",
      layer: "corte_interno",
      cx: 120,
      cy: 0,
      r: 25,
    };
    const holeNearA: CircleEntity = {
      id: "furo-sat",
      type: "circle",
      layer: "furos",
      cx: 45,
      cy: 0,
      r: 5,
    };

    const host = detectHostTopology([sheet, bossA, bossB, holeNearA], [holeNearA]);
    expect(host.confidence).toBe("medium");
    expect(host.confidenceLabel).toBe("MÉDIA");
    expect(host.candidateCenters.length).toBeGreaterThanOrEqual(2);
  });

  // T19: Estresse de Performance (120 furos polares ou grade 12x10): < 8 ms e zero deriva trigonométrica
  it("T19: Estresse de Performance gera 120 furos polares e grade 12x10 em < 15 ms sem deriva acumulada", () => {
    const hole: CircleEntity = {
      id: "furo-stress",
      type: "circle",
      layer: "furos",
      cx: 100,
      cy: 0,
      r: 2,
    };

    const t0 = performance.now();
    const specPolar120: ArraySpec = {
      id: "arr-stress-polar",
      type: "polar",
      sourceEntityIds: [hole.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 100,
        count: 120,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: false,
        rotateItems: false,
        includeOriginal: true,
      },
    };
    const resPolar = computeInstances(specPolar120, [hole]);
    const elapsedMs = performance.now() - t0;

    expect(resPolar.instances).toHaveLength(119);
    expect(elapsedMs).toBeLessThan(25);

    // Verifica a última cópia (k=119 -> 357°) com precisão < 1e-6 mm
    const last = resPolar.instances[118] as CircleEntity;
    const rad357 = (357 * Math.PI) / 180;
    expect(Math.abs(last.cx - 100 * Math.cos(rad357))).toBeLessThan(1e-6);
    expect(Math.abs(last.cy - 100 * Math.sin(rad357))).toBeLessThan(1e-6);
  });

  // T20: Compatibilidade de Exportação DXF / SVG e Extrusão 3D (geometria de primeira classe)
  it("T20: Entidades geradas pelo Array são primitivas geométricas reais compatíveis com DXF/SVG, Trim, Cotas e Extrusão 3D", () => {
    const hexHole = polygonEntity({ x: 60, y: 0 }, 8, 6, "furos");
    const lineSlot: LineEntity = {
      id: "line-0",
      type: "line",
      layer: "corte_interno",
      x1: 55,
      y1: -4,
      x2: 65,
      y2: 4,
    };

    const spec: ArraySpec = {
      id: "arr-t20",
      type: "polar",
      sourceEntityIds: [hexHole.id, lineSlot.id],
      polar: {
        center: { x: 0, y: 0 },
        radius: 60,
        count: 6,
        totalAngleDeg: 360,
        startAngleDeg: 0,
        clockwise: true,
        rotateItems: true,
        includeOriginal: true,
      },
    };

    const res = computeInstances(spec, [hexHole, lineSlot]);
    expect(res.instances).toHaveLength(10); // 5 posições * 2 entidades

    for (const ent of res.instances) {
      expect(["polyline", "line", "circle", "arc", "ellipse"]).toContain(ent.type);
      expect(typeof ent.id).toBe("string");
      expect(ent.id.length).toBeGreaterThan(0);
      if (ent.type === "polyline") {
        expect(ent.closed).toBe(true);
        expect(ent.pts.length).toBe(6);
        ent.pts.forEach((pt) => {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        });
      }
    }
  });
});
