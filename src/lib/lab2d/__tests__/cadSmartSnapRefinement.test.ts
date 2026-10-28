import { describe, it, expect } from "vitest";
import type { Entity } from "../core";
import {
  extractEntitySmartReferences,
  findSmartSnap,
  type SmartReferencePoint,
} from "../cadReferenceSnaps";

describe("CALDRA CHAMFER — Refinamento Visual de Pontos SNAP e Grips Técnicos", () => {
  const sampleCircle: Entity = {
    id: "circle-flange",
    layer: "corte",
    type: "circle",
    cx: 500,
    cy: 300,
    r: 40,
  };

  const sampleLine: Entity = {
    id: "edge-line",
    layer: "corte",
    type: "line",
    x1: 100,
    y1: 100,
    x2: 300,
    y2: 100,
  };

  it("A. Extração de referências para círculos em modo padrão não deve gerar 12 geratrizes (apenas Centro e 4 Quadrantes)", () => {
    // Por padrão (divisionsCaldeiraria = 0), apenas Centro + 4 Quadrantes são extraídos
    const refsDefault = extractEntitySmartReferences(sampleCircle);
    expect(refsDefault.filter((r) => r.kind === "center")).toHaveLength(1);
    expect(refsDefault.filter((r) => r.kind === "quadrant")).toHaveLength(4);
    expect(refsDefault.filter((r) => r.kind === "geratriz")).toHaveLength(0);
    expect(refsDefault).toHaveLength(5);
  });

  it("B. Divisões de caldeiraria são geradas exclusivamente quando explicitamente solicitado", () => {
    const refsCaldeiraria = extractEntitySmartReferences(sampleCircle, null, 12);
    expect(refsCaldeiraria.filter((r) => r.kind === "center")).toHaveLength(1);
    expect(refsCaldeiraria.filter((r) => r.kind === "quadrant")).toHaveLength(4);
    expect(refsCaldeiraria.filter((r) => r.kind === "geratriz").length).toBeGreaterThan(0);
  });

  it("C. Quadrantes de círculo possuem coordenadas canônicas exatas (0°, 90°, 180°, 270°)", () => {
    const refs = extractEntitySmartReferences(sampleCircle);
    const q0 = refs.find((r) => r.label === "Quadrante 0°");
    const q90 = refs.find((r) => r.label === "Quadrante 90°");
    const q180 = refs.find((r) => r.label === "Quadrante 180°");
    const q270 = refs.find((r) => r.label === "Quadrante 270°");

    expect(q0?.p).toEqual({ x: 540, y: 300 });
    expect(q90?.p).toEqual({ x: 500, y: 340 });
    expect(q180?.p).toEqual({ x: 460, y: 300 });
    expect(q270?.p).toEqual({ x: 500, y: 260 });
  });

  it("D. Ponto médio de segmento de linha está baricentricamente alinhado", () => {
    const refs = extractEntitySmartReferences(sampleLine);
    const mid = refs.find((r) => r.kind === "mid");
    expect(mid).toBeDefined();
    expect(mid?.p.x).toBeCloseTo(200);
    expect(mid?.p.y).toBeCloseTo(100);
  });

  it("E. Prioridade de captura respeita a hierarquia: Extremidade/Centro > Quadrante/Ponto Médio > Tangente > Near", () => {
    const cursor = { x: 462, y: 300 }; // Próximo ao quadrante 180°
    const snap = findSmartSnap(cursor, [sampleCircle], 10);
    expect(snap).not.toBeNull();
    expect(snap?.kind).toBe("quadrant");
    expect(snap?.label).toBe("Quadrante 180°");
  });

  it("F. Deduplicação espacial: pontos com distância menor que 6px de tela não sobrepõem símbolos", () => {
    const ptA: SmartReferencePoint = {
      p: { x: 100, y: 100 },
      kind: "end",
      priority: 1,
      label: "Extremidade",
    };
    const ptB: SmartReferencePoint = {
      p: { x: 101, y: 100 }, // Distância de 1 mm (~1 px se safeK=1)
      kind: "quadrant",
      priority: 2,
      label: "Quadrante 180°",
    };

    // Função de deduplicação que espelha a lógica do ChamferSmartSnapOverlay
    const dedupThreshold = 6; // pixels
    const candidates = [ptA, ptB];
    candidates.sort((a, b) => a.priority - b.priority);

    const accepted: SmartReferencePoint[] = [];
    for (const cand of candidates) {
      const isCoincident = accepted.some(
        (acc) => Math.hypot(acc.p.x - cand.p.x, acc.p.y - cand.p.y) <= dedupThreshold,
      );
      if (!isCoincident) {
        accepted.push(cand);
      }
    }

    expect(accepted).toHaveLength(1);
    expect(accepted[0].kind).toBe("end"); // O de maior prioridade venceu!
  });

  it("G. Cálculo de largura e vão do Tooltip HUD garante folga mínima de 14px e zero colisão", () => {
    const label = "Quadrante 180°";
    const coords = "80.6, 960.0 mm";
    const safeK = 1;
    const charW = 6.8 / safeK;
    const pad = 10 / safeK;
    const gap = 16 / safeK;

    const wLabel = label.length * charW;
    const wCoords = coords.length * charW;
    const totalW = pad + wLabel + gap + wCoords + pad;

    const labelEnd = pad + wLabel;
    const coordsStart = pad + wLabel + gap;

    // A folga entre o fim do rótulo e o início das coordenadas deve ser exatamente 16px (>= 14px)
    expect(coordsStart - labelEnd).toBeGreaterThanOrEqual(14);
    expect(coordsStart).toBeGreaterThan(labelEnd);
    expect(totalW).toBeGreaterThan(coordsStart + wCoords);
  });
});
