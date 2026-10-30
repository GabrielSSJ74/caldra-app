import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { DEFAULT_LAYERS, type CircleEntity, type Entity } from "@/lib/lab2d/core";
import { computeInstances, type ArraySpec } from "@/lib/lab2d/cadArrayEngine";
import { makeDimension } from "@/lib/lab2d/dimensions";
import {
  PLAYGROUND_SANDBOX_ID,
  registerPlaygroundSandboxProject,
  type Project,
} from "@/lib/lab2d/projects";
import {
  computeWorkplaneOrbitProjection2D,
  computeGizmoAxesProjection,
  interpolateOrbitAngles,
} from "@/lib/lab2d/orbit3dController";
import { getEngine } from "@/lib/geometry/engines";
import { evaluateExpression } from "@/lib/calculator/engine";
import {
  fabricationCost,
  cutTimeMinutes,
  DEFAULT_RATES,
} from "@/lib/costing/fabrication";

export type CinematicSceneId =
  | "chamfer-cad"
  | "caldeiraria-tracagem"
  | "calculos-engenharia"
  | "preparacao-fabricacao";

export interface CinematicWorkflowScene {
  id: CinematicSceneId;
  title: string;
  subtitle: string;
  ctaLabel: string;
  routeTo: "/desenho-2d" | "/tracagem" | "/calculadora" | "/oficina";
  routeSearch?: { tab: "orcamento" };
}

export const CINEMATIC_WORKFLOW_SCENES: CinematicWorkflowScene[] = [
  {
    id: "chamfer-cad",
    title: "Desenho técnico no CHAMFER",
    subtitle: "Desenhe no toque com arrays, cotas reais e vista 3D imediata",
    ctaLabel: "Abrir peça no CAD →",
    routeTo: "/desenho-2d",
  },
  {
    id: "caldeiraria-tracagem",
    title: "Caldeiraria e planificação 1:1",
    subtitle: "Do modelo 3D ao desenvolvimento plano pronto para dobrar",
    ctaLabel: "Testar planificação →",
    routeTo: "/tracagem",
  },
  {
    id: "calculos-engenharia",
    title: "Bancada de cálculos mecânicos",
    subtitle: "Descubra raios por corda/flecha, triangulação e peso de chapa",
    ctaLabel: "Abrir calculadora →",
    routeTo: "/calculadora",
  },
  {
    id: "preparacao-fabricacao",
    title: "Corte CNC, peso e orçamento",
    subtitle: "Aproveitamento de chapa, tempo de corte e custo em segundos",
    ctaLabel: "Simular orçamento →",
    routeTo: "/oficina",
    routeSearch: { tab: "orcamento" },
  },
];

/** Duração exata de 6.0 segundos por cena sincronizando Ato 1 (0%..55%) e Ato 2 (55%..100%) */
export const SCENE_DURATION_MS = 6000;

/** Limiar do Ato 2 (55% do progresso = 3.3s..6.0s) onde a peça entra em Órbita 3D Frontal e o Micro-CTA acende em Âmbar */
export const ACT2_PROGRESS_THRESHOLD = 0.55;

/** Centro único do palco cinematográfico (viewBox 420 × 210) */
export const STAGE_CENTER = { x: 210, y: 112 } as const;

/** Curva cubic-bezier(0.22, 1, 0.36, 1) suave para transições de câmera e órbita */
export function easeOutCubicBezier(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function subProgress(progress: number, start: number, end: number): number {
  if (end <= start) return progress >= end ? 1 : 0;
  return clamp01((progress - start) / (end - start));
}

/**
 * Retorna a micro-tag de Telemetria de Operação ao Vivo sincronizada com o segundo exato da cena (0.0s..6.0s).
 */
export function resolveSceneLiveTelemetry(
  sceneId: CinematicSceneId,
  progress: number,
): string {
  const sec = clamp01(progress) * (SCENE_DURATION_MS / 1000);

  switch (sceneId) {
    case "chamfer-cad":
      if (sec < 1.2) return "[ 2D SKETCH • CONTORNO Ø160.0 MM ]";
      if (sec < 2.6) return "[ ARRAY POLAR • 6x FUROS Ø18 (PCD 116) ]";
      if (sec < 3.4) return "[ COTAGEM TÉCNICA • VALIDAÇÃO OK ]";
      return "[ CAD 3D • ÓRBITA FRONTAL (CHAPA 3.0MM) ]";

    case "caldeiraria-tracagem":
      if (sec < 1.2) return "[ TRAÇAGEM • GERATRIZES 12 DIVISÕES ]";
      if (sec < 2.6) return "[ PLANIFICAÇÃO 1:1 • SETOR α 103.5° ]";
      if (sec < 3.4) return "[ CONFORMABILIDADE • RAIO R1 208.8 MM ]";
      return "[ CONE 3D • ÓRBITA FRONTAL (Ø60×Ø120×H100) ]";

    case "calculos-engenharia":
      if (sec < 1.2) return "[ CORDA c=120 MM • FLECHA f=16.08 MM ]";
      if (sec < 2.6) return "[ RAIO CALCULADO • R = 120.0 MM ]";
      if (sec < 3.4) return "[ TRIANGULAÇÃO • GERATRIZ G = 104.40 MM ]";
      return "[ CHAPA SAE 1020 • 3.0 MM (PESO REAL) ]";

    case "preparacao-fabricacao":
      if (sec < 1.2) return "[ NESTING • CHAPA 1500×3000 (SAE 1020 3MM) ]";
      if (sec < 2.6) return "[ TRAJETÓRIA CNC • PERFURAÇÃO + CORTE ]";
      if (sec < 3.4) return "[ TEMPO DE CORTE • MASSA LÍQUIDA OK ]";
      return "[ ORÇAMENTO FINAL • CUSTO EM SEGUNDOS ]";
  }
}

/* =========================================================================
   MOTORES REAIS EM SANDBOX ISOLADO (ZERO EFEITO COLATERAL NOS DADOS DO USUÁRIO)
   ========================================================================= */

export type ChamferChoreographyStepId =
  | "start_outer_profile"
  | "inner_profile_complete"
  | "polar_array_execution"
  | "dimensions_and_refs"
  | "geometry_validation_pulse"
  | "in_place_3d_extrusion"
  | "orbit_3d_frontal_hero";

export interface ChamferSandboxData {
  outerDiameterMm: number;
  innerBoreMm: number;
  hubDiameterMm: number;
  pcdMm: number;
  holeDiameterMm: number;
  holeCount: number;
  thicknessMm: number;
  /** Coordenadas calculadas pelo motor real computeInstances (cadArrayEngine.ts) */
  polarHoles: { index: number; x: number; y: number; angleDeg: number; isOriginal: boolean }[];
  stepAngleDeg: number;
}

/**
 * Executa em memória isolada (sandbox) a criação da peça real do CHAMFER CAD:
 * Flange Industrial Ø 160.0 mm, furo central Ø 60.0 mm, cubo Ø 84.0 mm,
 * Array Polar 6× Ø 18.0 mm em PCD Ø 116.0 mm (R = 58.0 mm, 360°) e Chapa 3.0 mm.
 */
export function runChamferSandboxDemo(): ChamferSandboxData {
  const outerDiameterMm = 160;
  const innerBoreMm = 60;
  const hubDiameterMm = 84;
  const pcdMm = 116;
  const holeDiameterMm = 18;
  const holeCount = 6;
  const thicknessMm = 3.0;

  // Entidade semente real do 1º furo em (x = pcd/2, y = 0) no sistema da peça (centro 0,0)
  const seedHole: CircleEntity = {
    id: "sandbox-hole-0",
    type: "circle",
    layer: "corte",
    cx: pcdMm / 2,
    cy: 0,
    r: holeDiameterMm / 2,
  };

  const spec: ArraySpec = {
    id: "sandbox-polar-spec",
    type: "polar",
    sourceEntityIds: [seedHole.id],
    polar: {
      center: { x: 0, y: 0 },
      count: holeCount,
      totalAngleDeg: 360,
      startAngleDeg: 0,
      clockwise: false,
      rotateItems: true,
      includeOriginal: true,
      radius: pcdMm / 2,
    },
  };

  const result = computeInstances(spec, [seedHole]);

  const polarHoles = result.ghostSlots.map((slot) => ({
    index: slot.index,
    x: Number(slot.center.x.toFixed(2)),
    y: Number(slot.center.y.toFixed(2)),
    angleDeg: Number(slot.angleDeltaDeg.toFixed(1)),
    isOriginal: slot.isOriginal,
  }));

  return {
    outerDiameterMm,
    innerBoreMm,
    hubDiameterMm,
    pcdMm,
    holeDiameterMm,
    holeCount: result.resolvedPolar?.count ?? holeCount,
    thicknessMm,
    polarHoles,
    stepAngleDeg: result.resolvedPolar?.stepAngleDeg ?? 60,
  };
}

/**
 * Constrói e registra em memória isolada (sandbox) o projeto completo do Flange Industrial
 * para abertura imediata no CHAMFER CAD, sem tocar ou sobrescrever os projetos salvos do usuário.
 */
export function buildChamferPlaygroundProject(
  data: ChamferSandboxData = runChamferSandboxDemo(),
): Project {
  // Centro da Área de Trabalho padrão (1500 × 1000 mm -> centro em 750, 500)
  const centerX = 750;
  const centerY = 500;
  const groupId = "playground-polar-group";

  const outerId = "playground-flange-outer";
  const innerId = "playground-flange-inner";
  const hubId = "playground-flange-hub";
  const pcdId = "playground-flange-pcd";
  const seedHoleId = "playground-hole-0";

  const seedHole: CircleEntity = {
    id: seedHoleId,
    type: "circle",
    layer: "corte",
    cx: centerX + data.pcdMm / 2,
    cy: centerY,
    r: data.holeDiameterMm / 2,
    groupId,
  };

  const arraySpec: ArraySpec = {
    id: "playground-polar-spec",
    type: "polar",
    sourceEntityIds: [seedHoleId],
    polar: {
      center: { x: centerX, y: centerY },
      count: data.holeCount,
      totalAngleDeg: 360,
      startAngleDeg: 0,
      clockwise: false,
      rotateItems: true,
      includeOriginal: true,
      radius: data.pcdMm / 2,
    },
  };

  const computedArray = computeInstances(arraySpec, [seedHole]);
  const holeEntities: Entity[] = computedArray.ghostSlots.map((slot, idx) => ({
    id: idx === 0 ? seedHoleId : `playground-hole-${idx}`,
    type: "circle",
    layer: "corte",
    cx: Number(slot.center.x.toFixed(2)),
    cy: Number(slot.center.y.toFixed(2)),
    r: data.holeDiameterMm / 2,
    groupId,
  }));

  const entities: Entity[] = [
    // Linhas de centro de simetria na camada de referência
    {
      id: "playground-centerline-h",
      type: "line",
      layer: "referencia",
      x1: centerX - 96,
      y1: centerY,
      x2: centerX + 96,
      y2: centerY,
    },
    {
      id: "playground-centerline-v",
      type: "line",
      layer: "referencia",
      x1: centerX,
      y1: centerY - 96,
      x2: centerX,
      y2: centerY + 96,
    },
    // Círculo Guia PCD Ø 116.0 mm
    {
      id: pcdId,
      type: "circle",
      layer: "referencia",
      cx: centerX,
      cy: centerY,
      r: data.pcdMm / 2,
    },
    // Anel do Cubo Ø 84.0 mm
    {
      id: hubId,
      type: "circle",
      layer: "dobra",
      cx: centerX,
      cy: centerY,
      r: data.hubDiameterMm / 2,
    },
    // Contorno Externo Ø 160.0 mm
    {
      id: outerId,
      type: "circle",
      layer: "corte",
      cx: centerX,
      cy: centerY,
      r: data.outerDiameterMm / 2,
    },
    // Furo Central Ø 60.0 mm
    {
      id: innerId,
      type: "circle",
      layer: "corte",
      cx: centerX,
      cy: centerY,
      r: data.innerBoreMm / 2,
    },
    // 6 Furos do Array Polar (6× Ø 18.0 mm em PCD 116.0 mm)
    ...holeEntities,
  ];

  const outerDim = makeDimension(
    "diameter",
    [{ type: "circle", entityId: outerId }],
    entities,
    68,
  );

  const project: Project = {
    id: PLAYGROUND_SANDBOX_ID,
    name: "Flange Industrial Ø160 (Playground)",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    thickness: data.thicknessMm,
    lastPlanId: "playground-plan-01",
    layers: DEFAULT_LAYERS,
    plans: [
      {
        id: "playground-plan-01",
        name: "P01",
        entities,
        visible: true,
        locked: false,
        groups: [
          {
            id: groupId,
            name: "Array Polar 6× Ø18 (PCD 116)",
            arraySpec,
          },
        ],
        dims: outerDim ? [outerDim] : [],
      },
    ],
  };

  return registerPlaygroundSandboxProject(project);
}

export interface ChamferStageFrame {
  stepId: ChamferChoreographyStepId;
  outerStrokeProgress: number;
  innerStrokeProgress: number;
  visibleHoleCount: number;
  pcdGuideOpacity: number;
  dimensionsOpacity: number;
  validationPulse: number;
  extrusionFactor: number;
  azimuthDeg: number;
  elevationDeg: number;
  cameraScale: number;
}

/**
 * Calcula o estado exato da coreografia de 7 etapas do CHAMFER CAD em palco único centralizado,
 * sincronizado com a janela de 6.0s (Ato 1: 0.0s..3.3s | Ato 2: 3.3s..6.0s).
 */
export function computeChamferStageFrame(progress: number): ChamferStageFrame {
  const p = clamp01(progress);

  let stepId: ChamferChoreographyStepId = "start_outer_profile";
  if (p < 0.12) stepId = "start_outer_profile";
  else if (p < 0.22) stepId = "inner_profile_complete";
  else if (p < 0.42) stepId = "polar_array_execution";
  else if (p < 0.50) stepId = "dimensions_and_refs";
  else if (p < 0.56) stepId = "geometry_validation_pulse";
  else if (p < 0.72) stepId = "in_place_3d_extrusion";
  else stepId = "orbit_3d_frontal_hero";

  const outerStrokeProgress = easeOutCubicBezier(subProgress(p, 0.0, 0.12));
  const innerStrokeProgress = easeOutCubicBezier(subProgress(p, 0.10, 0.22));

  const arrayProg = subProgress(p, 0.20, 0.41);
  const visibleHoleCount =
    p < 0.20 ? 0 : Math.min(6, Math.max(1, Math.ceil(arrayProg * 6)));
  const pcdGuideOpacity =
    p < 0.20 ? 0 : p < 0.56 ? easeOutCubicBezier(subProgress(p, 0.20, 0.28)) : 1 - 0.35 * subProgress(p, 0.56, 0.72);

  // Cotas 2D aparecem na Etapa 4 e permanecem legíveis
  const dimIn = easeOutCubicBezier(subProgress(p, 0.40, 0.50));
  const dimOut = subProgress(p, 0.58, 0.70);
  const dimensionsOpacity = Math.max(0, dimIn * (1 - dimOut * 0.55));

  // Pulso de validação na Etapa 5 (0.48 .. 0.56)
  const pulseRaw = subProgress(p, 0.48, 0.56);
  const validationPulse = Math.sin(pulseRaw * Math.PI);

  // Etapa 6: Transformação In-Place 2D -> 3D (inicia em 0.55 = 3.3s)
  const extrudeProg = easeOutCubicBezier(subProgress(p, 0.55, 0.72));

  // Etapa 7: Órbita 3D contínua (0.70 .. 0.96) até estabilizar na Vista Frontal-Oblíqua Heroica
  const orbitProg = subProgress(p, 0.70, 0.96);

  let azimuthDeg = 0;
  let elevationDeg = 90;

  if (p >= 0.55 && p < 0.70) {
    const t = subProgress(p, 0.55, 0.70);
    const interp = interpolateOrbitAngles(0, 90, -36, 46, t);
    azimuthDeg = interp.azimuthDeg;
    elevationDeg = interp.elevationDeg;
  } else if (p >= 0.70) {
    const interp = interpolateOrbitAngles(-36, 46, 14, 26, orbitProg);
    azimuthDeg = interp.azimuthDeg;
    elevationDeg = interp.elevationDeg;
  }

  const cameraScale = 1.05 - 0.05 * easeOutCubicBezier(subProgress(p, 0.1, 0.6));

  return {
    stepId,
    outerStrokeProgress,
    innerStrokeProgress,
    visibleHoleCount,
    pcdGuideOpacity,
    dimensionsOpacity,
    validationPulse,
    extrusionFactor: extrudeProg,
    azimuthDeg,
    elevationDeg,
    cameraScale,
  };
}

export interface BoilermakingSandboxData {
  d1Mm: number;
  d2Mm: number;
  heightMm: number;
  thicknessMm: number;
  divisions: number;
  slantHeightMm: number;
  sectorAngleDeg: number;
  outerRadiusMm: number;
  innerRadiusMm: number;
  areaM2: number;
  massKg: number;
}

/**
 * Executa o motor real de Caldeiraria (`getEngine("tronco-de-cone")`) em sandbox isolado.
 */
export function runBoilermakingSandboxDemo(): BoilermakingSandboxData {
  const d1Mm = 120;
  const d2Mm = 60;
  const heightMm = 100;
  const thicknessMm = 3.0;
  const divisions = 12;

  const engine = getEngine("tronco-de-cone");
  const res = engine?.calculate({
    d1: d1Mm,
    d2: d2Mm,
    h: heightMm,
    thickness: thicknessMm,
    n: divisions,
  });

  const slantHeightMm =
    res?.trueLengths[0]?.length ?? Math.hypot(heightMm, (d1Mm - d2Mm) / 2);
  const outerRadiusMm = (slantHeightMm * d1Mm) / (d1Mm - d2Mm);
  const innerRadiusMm = outerRadiusMm - slantHeightMm;
  const sectorAngleDeg = (360 * (d1Mm / 2)) / outerRadiusMm;

  const areaRow = res?.metrics.find((m) => m.label.includes("Área"));
  const massRow = res?.metrics.find((m) => m.label.includes("Massa"));

  return {
    d1Mm,
    d2Mm,
    heightMm,
    thicknessMm,
    divisions,
    slantHeightMm: Number(slantHeightMm.toFixed(2)),
    sectorAngleDeg: Number(sectorAngleDeg.toFixed(1)),
    outerRadiusMm: Number(outerRadiusMm.toFixed(1)),
    innerRadiusMm: Number(innerRadiusMm.toFixed(1)),
    areaM2: Number((areaRow?.value ?? 0.098).toFixed(3)),
    massKg: Number((massRow?.value ?? 2.31).toFixed(2)),
  };
}

export interface CalculatorSandboxData {
  chordInputMm: number;
  sagittaInputMm: number;
  radiusResultMm: number;
  expressionG: string;
  geratrizMm: number;
  angleDeg: number;
  sectorDeg: number;
  sheetMassKg: number;
}

/**
 * Executa o motor real da Calculadora Científica (`evaluateExpression`) em sandbox isolado:
 * - Raio por Corda/Flecha: c = 120 mm, f = 16.08 mm ➔ R = (c² / 8f) + (f / 2) = 120.0 mm
 * - Triangulação de Geratriz: √(100² + 30²) = 104.40 mm
 * - Peso de Chapa SAE 1020 (3.0 mm • 1500 × 3000 mm): 105.98 kg
 */
export function runCalculatorSandboxDemo(): CalculatorSandboxData {
  const chordInputMm = 120;
  const sagittaInputMm = 16.08;
  const radiusRaw = evaluateExpression(
    `(${chordInputMm}^2 / (8 * ${sagittaInputMm})) + (${sagittaInputMm} / 2)`,
    "DEG",
  );
  const geratrizMm = evaluateExpression("hypot(100; (120-60)/2)", "DEG");
  const angleDeg = evaluateExpression("atan(30/100)", "DEG");
  const sectorDeg = evaluateExpression(`360 * 60 / ${geratrizMm.toFixed(4)}`, "DEG");
  const sheetMassKg = evaluateExpression("1.5 * 3.0 * 3.0 * 7.85", "DEG");

  return {
    chordInputMm,
    sagittaInputMm,
    radiusResultMm: Number(radiusRaw.toFixed(1)),
    expressionG: "R = (c² / 8f) + (f / 2)",
    geratrizMm: Number(geratrizMm.toFixed(2)),
    angleDeg: Number(angleDeg.toFixed(2)),
    sectorDeg: Number((sectorDeg / 2).toFixed(2)),
    sheetMassKg: Number(sheetMassKg.toFixed(2)),
  };
}

export interface FabricationSandboxData {
  sheetWidthMm: number;
  sheetLengthMm: number;
  thicknessMm: number;
  quantity: number;
  cutLengthMm: number;
  pierces: number;
  cutTimeMin: number;
  totalCostBrl: number;
  perPieceBrl: number;
}

/**
 * Executa o motor real de Custos e Preparação para Fabricação (`fabricationCost` + `cutTimeMinutes`)
 * para chapa 1500 × 3000 mm (SAE 1020 • 3.0 mm).
 */
export function runFabricationSandboxDemo(): FabricationSandboxData {
  const cutLengthMm = 1480;
  const pierces = 8;
  const thicknessMm = 3.0;
  const quantity = 4;

  const breakdown = fabricationCost({
    cutLengthMm,
    pierces,
    bends: 2,
    weldLengthMm: 320,
    laborHours: 0.35,
    thicknessMm,
    quantity,
    rates: DEFAULT_RATES,
    includeSetup: true,
  });

  const cutTimeMin = cutTimeMinutes(cutLengthMm * quantity, thicknessMm);

  return {
    sheetWidthMm: 1500,
    sheetLengthMm: 3000,
    thicknessMm,
    quantity,
    cutLengthMm,
    pierces,
    cutTimeMin: Number(cutTimeMin.toFixed(1)),
    totalCostBrl: Number(breakdown.total.toFixed(2)),
    perPieceBrl: Number(breakdown.perPiece.toFixed(2)),
  };
}

/**
 * Prepara o estado temporário seguro (Instant Playground) para a cena ativa antes de navegar,
 * garantindo que o módulo de destino abra com a peça/cálculo demonstrado já carregado.
 */
export function prepareInstantPlaygroundForScene(sceneId: CinematicSceneId): {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
} {
  if (sceneId === "chamfer-cad") {
    const project = buildChamferPlaygroundProject();
    return {
      to: "/desenho-2d/$projectId",
      params: { projectId: project.id },
    };
  }

  if (sceneId === "caldeiraria-tracagem") {
    return {
      to: "/tracagem/$slug",
      params: { slug: "tronco-de-cone" },
      search: { preset: "d1:120,d2:60,h:100,thickness:3,n:12" },
    };
  }

  if (sceneId === "calculos-engenharia") {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          "caldra.playground.calculator",
          JSON.stringify({
            expression: "(120^2 / (8 * 16.08)) + (16.08 / 2)",
            lastCalculationExpr: "Corda c=120, Flecha f=16,08 → R =",
            value: 120.0,
            sheetLengthMm: "3000",
            sheetWidthMm: "1500",
            sheetThicknessMm: "3,00",
            boltDiameter: "116",
            boltHoles: "6",
          }),
        );
      } catch {
        /* sessionStorage indisponível */
      }
    }
    return {
      to: "/calculadora",
    };
  }

  // preparacao-fabricacao
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        "caldra.playground.oficina",
        JSON.stringify({
          thicknessMm: 3.0,
          parts: [
            {
              id: "pg-part-flange-160",
              name: "Flange Industrial Ø160 (PCD 116)",
              w: 160,
              h: 160,
              areaMm2: 25600,
              cutLengthMm: 1020,
              pierces: 8,
              bends: 0,
              quantity: 4,
              allowRotate: true,
            },
            {
              id: "pg-part-cone-120",
              name: "Desenvolvimento Tronco de Cone Ø120×Ø60",
              w: 380,
              h: 220,
              areaMm2: 83600,
              cutLengthMm: 1180,
              pierces: 1,
              bends: 12,
              quantity: 2,
              allowRotate: true,
            },
          ],
        }),
      );
    } catch {
      /* sessionStorage indisponível */
    }
  }
  return {
    to: "/oficina",
    search: { tab: "orcamento" },
  };
}

/* =========================================================================
   CENAS CINEMATOGRÁFICAS EM PALCO ÚNICO CENTRALIZADO (100% DO CARTÃO)
   ========================================================================= */

/**
 * CENA 1 — "Desenho técnico no CHAMFER"
 */
function SceneChamferCadUnified({
  progress,
  data,
}: {
  progress: number;
  data: ChamferSandboxData;
}) {
  const frame = computeChamferStageFrame(progress);
  const cx = STAGE_CENTER.x;
  const cy = STAGE_CENTER.y + 4;

  // Escala visual: 1 mm = 0.64 px no palco central (Ø 160 mm -> R = 51.2 px)
  const scaleMmToPx = 0.64;
  const rOuterPx = Number(((data.outerDiameterMm / 2) * scaleMmToPx).toFixed(2));
  const rHubPx = Number(((data.hubDiameterMm / 2) * scaleMmToPx).toFixed(2));
  const rInnerPx = Number(((data.innerBoreMm / 2) * scaleMmToPx).toFixed(2));
  const rPcdPx = Number(((data.pcdMm / 2) * scaleMmToPx).toFixed(2));
  const rHolePx = Number(((data.holeDiameterMm / 2) * scaleMmToPx).toFixed(2));

  const orbitProj = computeWorkplaneOrbitProjection2D(
    frame.azimuthDeg,
    frame.elevationDeg,
    { x: cx, y: cy },
    data.thicknessMm * 4 * frame.extrusionFactor,
  );
  const gizmoAxes = computeGizmoAxesProjection(frame.azimuthDeg, frame.elevationDeg);

  const plateDepthPx = Number((12 * frame.extrusionFactor).toFixed(2));
  const neckHeightPx = Number((20 * frame.extrusionFactor).toFixed(2));

  const outerCircumference = Number((2 * Math.PI * rOuterPx).toFixed(1));
  const innerCircumference = Number((2 * Math.PI * rInnerPx).toFixed(1));
  const outerDashOffset = Number(
    (outerCircumference * (1 - frame.outerStrokeProgress)).toFixed(1),
  );
  const innerDashOffset = Number(
    (innerCircumference * (1 - frame.innerStrokeProgress)).toFixed(1),
  );

  const cursorAngleRad =
    frame.stepId === "start_outer_profile"
      ? frame.outerStrokeProgress * Math.PI * 2 - Math.PI / 2
      : frame.innerStrokeProgress * Math.PI * 2 - Math.PI / 2;
  const cursorRadius =
    frame.stepId === "start_outer_profile" ? rOuterPx : rInnerPx;
  const cursorX = Number((cx + cursorRadius * Math.cos(cursorAngleRad)).toFixed(2));
  const cursorY = Number((cy + cursorRadius * Math.sin(cursorAngleRad)).toFixed(2));
  const showDrawingCursor =
    frame.stepId === "start_outer_profile" || frame.stepId === "inner_profile_complete";

  return (
    <svg
      viewBox="0 0 420 210"
      preserveAspectRatio="xMidYMid meet"
      className="size-full select-none pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Régua Superior e Régua Lateral Esquerda do CHAMFER CAD */}
      <rect
        x="0"
        y="0"
        width="420"
        height="14"
        className="fill-slate-200/80 dark:fill-slate-900/90"
      />
      <rect
        x="0"
        y="14"
        width="18"
        height="196"
        className="fill-slate-200/80 dark:fill-slate-900/90"
      />
      <line
        x1="0"
        y1="14"
        x2="420"
        y2="14"
        className="stroke-slate-300 dark:stroke-slate-800"
        strokeWidth="0.8"
      />
      <line
        x1="18"
        y1="14"
        x2="18"
        y2="210"
        className="stroke-slate-300 dark:stroke-slate-800"
        strokeWidth="0.8"
      />

      {/* Marcações da Régua Horizontal */}
      {[36, 94, 152, 210, 268, 326, 384].map((rx, i) => (
        <g key={rx}>
          <line
            x1={rx}
            y1="8.5"
            x2={rx}
            y2="14"
            className="stroke-slate-400 dark:stroke-slate-600"
            strokeWidth="0.8"
          />
          <text
            x={rx + 3}
            y="10.5"
            className={cn(
              "font-mono text-[5.8px] font-semibold",
              i === 3
                ? "fill-[#DC143C]"
                : "fill-slate-500 dark:fill-slate-400",
            )}
          >
            {(i - 3) * 80}
          </text>
        </g>
      ))}

      {/* Área de Trabalho Centralizada (Palco Único) */}
      <rect
        x="32"
        y="28"
        width="368"
        height="166"
        rx="5"
        className="fill-[#FAFBFD] dark:fill-[#0D1526] stroke-[#0284C7] dark:stroke-[#38BDF8]"
        strokeWidth="1.25"
      />

      {/* Grade Técnica da Área de Trabalho */}
      <g className="stroke-slate-400/20 dark:stroke-slate-600/30" strokeWidth="0.5">
        {[56, 86, 116, 146, 174].map((gy) => (
          <line key={gy} x1="32" y1={gy} x2="400" y2={gy} />
        ))}
        {[74, 119, 164, 210, 256, 301, 346].map((gx) => (
          <line key={gx} x1={gx} y1="28" x2={gx} y2="194" />
        ))}
      </g>

      {/* Vetores de Origem (0,0) no canto da Área de Trabalho */}
      <g>
        <line x1="32" y1="28" x2="64" y2="28" stroke="#E11D48" strokeWidth="1.6" />
        <polygon points="68,28 62.5,26 62.5,30" fill="#E11D48" />
        <line
          x1="32"
          y1="28"
          x2="32"
          y2="60"
          className="stroke-[#059669] dark:stroke-[#10B981]"
          strokeWidth="1.6"
        />
        <polygon
          points="32,64 30,58.5 34,58.5"
          className="fill-[#059669] dark:fill-[#10B981]"
        />
        <circle cx="32" cy="28" r="2.4" fill="#DC143C" />
      </g>

      {/* PALCO CENTRAL COM ENQUADRAMENTO DINÂMICO DE CÂMERA */}
      <g
        transform={`translate(${cx} ${cy}) scale(${frame.cameraScale.toFixed(3)}) translate(${-cx} ${-cy})`}
      >
        {/* Linhas de centro de simetria no centro do palco */}
        <g opacity={Number((0.35 + 0.55 * frame.outerStrokeProgress).toFixed(2))}>
          <line
            x1={cx - 72}
            y1={cy}
            x2={cx + 72}
            y2={cy}
            stroke="#DC143C"
            strokeWidth="0.7"
            strokeDasharray="6 2.5 1.5 2.5"
          />
          <line
            x1={cx}
            y1={cy - 68}
            x2={cx}
            y2={cy + 68}
            stroke="#DC143C"
            strokeWidth="0.7"
            strokeDasharray="6 2.5 1.5 2.5"
          />
        </g>

        {/* Pulso de validação da geometria fechada (Etapa 5) */}
        {frame.validationPulse > 0.02 && (
          <circle
            cx={cx}
            cy={cy}
            r={Number((rOuterPx + 6 * frame.validationPulse).toFixed(2))}
            stroke="#10B981"
            strokeWidth="1.8"
            strokeOpacity={Number((0.75 * frame.validationPulse).toFixed(2))}
          />
        )}

        {/* CAMADA DE VOLUME 3D IN-PLACE (Etapas 6 e 7: Sólido Extrudado sob o Plano Projetado) */}
        {frame.extrusionFactor > 0.01 && (
          <g opacity={Number(frame.extrusionFactor.toFixed(2))}>
            <g transform={`translate(0 ${plateDepthPx})`}>
              <g transform={orbitProj.svgMatrix || undefined}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={rOuterPx}
                  className="fill-slate-400/35 dark:fill-slate-800/85 stroke-slate-600 dark:stroke-slate-400"
                  strokeWidth="1.35"
                />
              </g>
            </g>

            <line
              x1={Number((cx - rOuterPx * Math.hypot(orbitProj.a, orbitProj.c) * 0.72).toFixed(2))}
              y1={cy}
              x2={Number((cx - rOuterPx * Math.hypot(orbitProj.a, orbitProj.c) * 0.72).toFixed(2))}
              y2={Number((cy + plateDepthPx).toFixed(2))}
              className="stroke-slate-600 dark:stroke-slate-400"
              strokeWidth="1.2"
            />
            <line
              x1={Number((cx + rOuterPx * Math.hypot(orbitProj.a, orbitProj.c) * 0.72).toFixed(2))}
              y1={cy}
              x2={Number((cx + rOuterPx * Math.hypot(orbitProj.a, orbitProj.c) * 0.72).toFixed(2))}
              y2={Number((cy + plateDepthPx).toFixed(2))}
              className="stroke-slate-600 dark:stroke-slate-400"
              strokeWidth="1.2"
            />
          </g>
        )}

        {/* PLANO PRINCIPAL DA PEÇA (2D -> 3D ORBITAL IN-PLACE NO MESMO CENTRO) */}
        <g transform={orbitProj.svgMatrix || undefined}>
          {frame.extrusionFactor > 0.01 && (
            <circle
              cx={cx}
              cy={cy}
              r={rOuterPx}
              fillOpacity={Number((0.88 * frame.extrusionFactor).toFixed(2))}
              className="fill-slate-200 dark:fill-[#111C33]"
            />
          )}

          {/* Etapa 1: Contorno Circular Externo Ø 160.0 mm */}
          <circle
            cx={cx}
            cy={cy}
            r={rOuterPx}
            className={cn(
              frame.extrusionFactor > 0.3
                ? "stroke-[#0284C7] dark:stroke-[#38BDF8]"
                : "stroke-slate-900 dark:stroke-slate-100",
            )}
            strokeWidth="2"
            strokeDasharray={outerCircumference}
            strokeDashoffset={outerDashOffset}
          />

          {/* Etapa 2: Base do Cubo Central Ø 84.0 mm + Furo Interno Ø 60.0 mm */}
          {frame.innerStrokeProgress > 0.01 && (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={rHubPx}
                className="stroke-slate-500/70 dark:stroke-slate-400/70"
                strokeWidth="1.1"
                strokeDasharray="3.5 2"
                strokeOpacity={Number(frame.innerStrokeProgress.toFixed(2))}
              />
              <circle
                cx={cx}
                cy={cy}
                r={rInnerPx}
                className="fill-sky-500/[0.10] dark:fill-slate-950/90 stroke-slate-900 dark:stroke-slate-100"
                strokeWidth="1.75"
                strokeDasharray={innerCircumference}
                strokeDashoffset={innerDashOffset}
              />
            </>
          )}

          {/* Etapa 3: Círculo Guia PCD Ø 116.0 mm + 6 Furos do Array Polar Real */}
          {frame.pcdGuideOpacity > 0.01 && (
            <circle
              cx={cx}
              cy={cy}
              r={rPcdPx}
              className="stroke-[#0284C7] dark:stroke-[#38BDF8]"
              strokeWidth="1"
              strokeDasharray="4 2.5"
              strokeOpacity={Number(frame.pcdGuideOpacity.toFixed(2))}
            />
          )}

          {data.polarHoles.slice(0, frame.visibleHoleCount).map((hole) => {
            const hx = Number((cx + hole.x * scaleMmToPx).toFixed(2));
            const hy = Number((cy + hole.y * scaleMmToPx).toFixed(2));
            const isSeed = hole.isOriginal && frame.extrusionFactor < 0.4;
            return (
              <g key={hole.index}>
                {frame.extrusionFactor < 0.35 && (
                  <line
                    x1={cx}
                    y1={cy}
                    x2={hx}
                    y2={hy}
                    stroke={isSeed ? "#F59E0B" : "#0284C7"}
                    strokeWidth="0.65"
                    strokeDasharray="2 2"
                    strokeOpacity="0.45"
                  />
                )}
                <circle
                  cx={hx}
                  cy={hy}
                  r={rHolePx}
                  className={cn(
                    isSeed
                      ? "fill-amber-500/25 stroke-amber-500"
                      : "fill-sky-500/20 dark:fill-slate-950 stroke-[#0284C7] dark:stroke-[#38BDF8]",
                  )}
                  strokeWidth="1.4"
                />
                {isSeed && (
                  <rect
                    x={Number((hx - 4.2).toFixed(2))}
                    y={Number((hy - 4.2).toFixed(2))}
                    width="8.4"
                    height="8.4"
                    stroke="#F59E0B"
                    strokeWidth="1.1"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* RESSALTO CILÍNDRICO SUPERIOR 3D (COLARINHO CHANFRADO ELEVADO NA ETAPA 6 E 7) */}
        {frame.extrusionFactor > 0.05 && (
          <g
            transform={`translate(0 ${-neckHeightPx})`}
            opacity={Number(frame.extrusionFactor.toFixed(2))}
          >
            <g transform={orbitProj.svgMatrix || undefined}>
              <circle
                cx={cx}
                cy={cy}
                r={Number((rHubPx * 0.88).toFixed(2))}
                className="fill-slate-100/95 dark:fill-slate-900/95 stroke-[#0284C7] dark:stroke-[#38BDF8]"
                strokeWidth="1.5"
              />
              <circle
                cx={cx}
                cy={cy}
                r={rInnerPx}
                className="fill-slate-800 dark:fill-black stroke-slate-500 dark:stroke-slate-400"
                strokeWidth="1.2"
              />
            </g>
          </g>
        )}

        {/* Mira Dinâmica de Construção CAD (Etapas 1 e 2) */}
        {showDrawingCursor && (
          <g transform={`translate(${cursorX} ${cursorY})`}>
            <circle r="4.5" stroke="#F59E0B" strokeWidth="1.2" />
            <line x1="-7" y1="0" x2="7" y2="0" stroke="#F59E0B" strokeWidth="0.9" />
            <line x1="0" y1="-7" x2="0" y2="7" stroke="#F59E0B" strokeWidth="0.9" />
          </g>
        )}

        {/* Etapa 4: Cotas Diametrais Reais (Ø 160.0 mm • PCD 116 (6x Ø18)) */}
        {frame.dimensionsOpacity > 0.02 && (
          <g opacity={Number(frame.dimensionsOpacity.toFixed(2))}>
            <g className="stroke-[#0284C7] dark:stroke-[#38BDF8]" strokeWidth="0.9">
              <line x1={cx - rOuterPx} y1={cy} x2={cx - rOuterPx} y2={cy + 61} strokeOpacity="0.6" />
              <line x1={cx + rOuterPx} y1={cy} x2={cx + rOuterPx} y2={cy + 61} strokeOpacity="0.6" />
              <line x1={cx - rOuterPx} y1={cy + 57} x2={cx + rOuterPx} y2={cy + 57} />
              <polygon
                points={`${cx - rOuterPx},${cy + 57} ${cx - rOuterPx + 4.5},${cy + 55.4} ${cx - rOuterPx + 4.5},${cy + 58.6}`}
                className="fill-[#0284C7] dark:fill-[#38BDF8]"
              />
              <polygon
                points={`${cx + rOuterPx},${cy + 57} ${cx + rOuterPx - 4.5},${cy + 55.4} ${cx + rOuterPx - 4.5},${cy + 58.6}`}
                className="fill-[#0284C7] dark:fill-[#38BDF8]"
              />
            </g>
            <text
              x={cx}
              y={cy + 53.5}
              textAnchor="middle"
              className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[8px] font-bold"
            >
              Ø {data.outerDiameterMm.toFixed(1)} mm • PCD {data.pcdMm} ({data.holeCount}x Ø{data.holeDiameterMm})
            </text>
          </g>
        )}
      </g>

      {/* Gizmo 3D X-Y-Z real (computeGizmoAxesProjection) */}
      <g
        transform="translate(372, 152)"
        opacity={Number((0.25 + 0.75 * frame.extrusionFactor).toFixed(2))}
      >
        {gizmoAxes.map((ax) => (
          <line
            key={ax.axis}
            x1="0"
            y1="0"
            x2={Number((ax.dx * 15).toFixed(2))}
            y2={Number((ax.dy * 15).toFixed(2))}
            stroke={ax.color}
            strokeWidth="1.5"
          />
        ))}
        <circle cx="0" cy="0" r="2.2" fill="#DC143C" />
      </g>
    </svg>
  );
}

/**
 * CENA 2 — "Caldeiraria e planificação 1:1"
 */
function SceneBoilermakingUnified({
  progress,
  data,
}: {
  progress: number;
  data: BoilermakingSandboxData;
}) {
  const p = clamp01(progress);
  const cx = STAGE_CENTER.x;

  const devTraceProg = easeOutCubicBezier(subProgress(p, 0.0, 0.36));
  const foldMorphProg = easeOutCubicBezier(subProgress(p, 0.48, 0.76));
  const orbit3dProg = easeOutCubicBezier(subProgress(p, 0.70, 0.96));

  const apexY = Number((54 + 16 * foldMorphProg).toFixed(2));
  const halfSpreadDeg = Number((52 * (1 - 0.68 * foldMorphProg)).toFixed(2));
  const rInnerPx = Number((40 * (1 - 0.45 * foldMorphProg)).toFixed(2));
  const rOuterPx = Number((108 * (1 - 0.32 * foldMorphProg)).toFixed(2));

  const aStart = ((-halfSpreadDeg + 90) * Math.PI) / 180;
  const aEnd = ((halfSpreadDeg + 90) * Math.PI) / 180;

  const p1In = {
    x: Number((cx + rInnerPx * Math.cos(aStart)).toFixed(2)),
    y: Number((apexY + rInnerPx * Math.sin(aStart)).toFixed(2)),
  };
  const p2In = {
    x: Number((cx + rInnerPx * Math.cos(aEnd)).toFixed(2)),
    y: Number((apexY + rInnerPx * Math.sin(aEnd)).toFixed(2)),
  };
  const p1Out = {
    x: Number((cx + rOuterPx * Math.cos(aStart)).toFixed(2)),
    y: Number((apexY + rOuterPx * Math.sin(aStart)).toFixed(2)),
  };
  const p2Out = {
    x: Number((cx + rOuterPx * Math.cos(aEnd)).toFixed(2)),
    y: Number((apexY + rOuterPx * Math.sin(aEnd)).toFixed(2)),
  };

  const sectorPath = `M ${p1In.x} ${p1In.y} A ${rInnerPx} ${rInnerPx} 0 0 1 ${p2In.x} ${p2In.y} L ${p2Out.x} ${p2Out.y} A ${rOuterPx} ${rOuterPx} 0 0 0 ${p1Out.x} ${p1Out.y} Z`;

  const divisionFractions = [-1, -0.667, -0.333, 0, 0.333, 0.667, 1];
  const visibleDivisions = Math.ceil(devTraceProg * divisionFractions.length);

  const tiltRyTop = Number((10.5 - 4.2 * orbit3dProg).toFixed(2));
  const tiltRyBot = Number((19.5 - 8.0 * orbit3dProg).toFixed(2));
  const topY = 68;
  const botY = 148;
  const topRx = 30;
  const botRx = 60;

  return (
    <svg
      viewBox="0 0 420 210"
      preserveAspectRatio="xMidYMid meet"
      className="size-full select-none pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="c3-cone-steel" x1={cx - 60} y1={topY} x2={cx + 60} y2={botY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="24%" stopColor="#94A3B8" />
          <stop offset="46%" stopColor="#F1F5F9" />
          <stop offset="68%" stopColor="#475569" />
          <stop offset="90%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
      </defs>

      <g
        className="stroke-slate-400/20 dark:stroke-slate-700/35"
        strokeWidth="0.5"
        strokeDasharray="2.5 2.5"
      >
        {[46, 86, 126, 166].map((gy) => (
          <line key={gy} x1="20" y1={gy} x2="400" y2={gy} />
        ))}
        {[70, 140, 210, 280, 350].map((gx) => (
          <line key={gx} x1={gx} y1="26" x2={gx} y2="192" />
        ))}
      </g>

      {/* MOMENTO 1: DESENVOLVIMENTO PLANO 1:1 */}
      {foldMorphProg < 0.95 && (
        <g opacity={Number((1 - foldMorphProg * 0.92).toFixed(2))}>
          <path
            d={sectorPath}
            className="fill-sky-500/[0.12] dark:fill-sky-400/[0.15] stroke-[#0284C7] dark:stroke-[#38BDF8]"
            strokeWidth="1.65"
          />

          {divisionFractions.slice(0, visibleDivisions).map((frac, idx) => {
            const deg = frac * halfSpreadDeg;
            const rad = ((deg + 90) * Math.PI) / 180;
            const xIn = Number((cx + rInnerPx * Math.cos(rad)).toFixed(2));
            const yIn = Number((apexY + rInnerPx * Math.sin(rad)).toFixed(2));
            const xOut = Number((cx + rOuterPx * Math.cos(rad)).toFixed(2));
            const yOut = Number((apexY + rOuterPx * Math.sin(rad)).toFixed(2));
            return (
              <g key={idx}>
                <line
                  x1={xIn}
                  y1={yIn}
                  x2={xOut}
                  y2={yOut}
                  stroke={idx === 3 ? "#DC143C" : "#F59E0B"}
                  strokeWidth={idx === 3 ? "1.1" : "0.75"}
                  strokeDasharray={idx === 3 ? "5 2" : "2.5 2"}
                />
                <circle
                  cx={xOut}
                  cy={yOut}
                  r="1.9"
                  className="fill-[#0284C7] dark:fill-[#38BDF8]"
                />
              </g>
            );
          })}

          <circle cx={cx} cy={apexY} r="2.8" fill="#DC143C" />
          <text
            x={cx}
            y={Number((apexY + 26).toFixed(2))}
            textAnchor="middle"
            className="fill-amber-600 dark:fill-amber-400 font-mono text-[8px] font-bold"
          >
            α = {data.sectorAngleDeg}° • R1 = {data.outerRadiusMm} mm • {data.divisions} div
          </text>
        </g>
      )}

      {/* MOMENTO 2: TRONCO DE CONE 3D COM ÓRBITA FRONTAL */}
      {foldMorphProg > 0.12 && (
        <g opacity={Number(clamp01((foldMorphProg - 0.12) / 0.65).toFixed(2))}>
          <line
            x1={cx}
            y1="44"
            x2={cx}
            y2="174"
            stroke="#DC143C"
            strokeWidth="0.8"
            strokeDasharray="6 2 1.5 2"
          />

          <path
            d={`M ${cx - topRx} ${topY} L ${cx + topRx} ${topY} L ${cx + botRx} ${botY} A ${botRx} ${tiltRyBot} 0 0 1 ${cx - botRx} ${botY} Z`}
            fill="url(#c3-cone-steel)"
            className="stroke-slate-700 dark:stroke-slate-200"
            strokeWidth="1.2"
          />

          <ellipse
            cx={cx}
            cy={botY}
            rx={botRx}
            ry={tiltRyBot}
            className="fill-slate-400/20 dark:fill-slate-900/40 stroke-[#0284C7] dark:stroke-[#38BDF8]"
            strokeWidth="1.2"
            strokeDasharray="4 2"
          />

          {[-0.65, -0.25, 0.25, 0.65].map((gFrac, idx) => {
            const shift = (orbit3dProg - 0.5) * 0.18;
            const f = Math.max(-0.9, Math.min(0.9, gFrac + shift));
            const xT = Number((cx + topRx * f).toFixed(2));
            const xB = Number((cx + botRx * f).toFixed(2));
            const yB = Number((botY + tiltRyBot * Math.sqrt(Math.max(0, 1 - f * f)) * 0.65).toFixed(2));
            return (
              <line
                key={idx}
                x1={xT}
                y1={topY}
                x2={xB}
                y2={yB}
                stroke="#F59E0B"
                strokeWidth="0.75"
                strokeOpacity="0.75"
                strokeDasharray="3 2"
              />
            );
          })}

          <ellipse
            cx={cx}
            cy={topY}
            rx={topRx}
            ry={tiltRyTop}
            className="fill-slate-800 dark:fill-slate-950 stroke-[#0284C7] dark:stroke-[#38BDF8]"
            strokeWidth="1.35"
          />
          <ellipse
            cx={cx}
            cy={topY}
            rx={Number((topRx * 0.68).toFixed(2))}
            ry={Number((tiltRyTop * 0.68).toFixed(2))}
            className="fill-slate-950 dark:fill-black stroke-slate-600"
            strokeWidth="0.8"
          />

          <g opacity={Number(orbit3dProg.toFixed(2))}>
            <line x1={cx - topRx} y1="52" x2={cx + topRx} y2="52" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="0.85" />
            <text x={cx} y="47" textAnchor="middle" className="fill-slate-900 dark:fill-slate-100 font-mono text-[8px] font-bold">
              Ø {data.d2Mm} mm
            </text>

            <line x1={cx - botRx} y1="168" x2={cx + botRx} y2="168" className="stroke-[#0284C7] dark:stroke-[#38BDF8]" strokeWidth="0.95" />
            <text x={cx} y="177" textAnchor="middle" className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[8px] font-bold">
              Ø {data.d1Mm} mm • G = {data.slantHeightMm} mm
            </text>

            <line x1={cx + botRx + 14} y1={topY} x2={cx + botRx + 14} y2={botY} stroke="#F59E0B" strokeWidth="0.9" />
            <text
              x={cx + botRx + 22}
              y={(topY + botY) / 2 + 3}
              className="fill-amber-600 dark:fill-amber-400 font-mono text-[8px] font-bold"
            >
              H {data.heightMm}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/**
 * CENA 3 — "Bancada de cálculos mecânicos"
 * Raio por Corda/Flecha (c = 120 mm, f = 16.08 mm -> R = 120.0 mm), Triangulação e Peso de Chapa SAE 1020 • 3.0 mm.
 */
function SceneEngineeringCalcUnified({
  progress,
  data,
}: {
  progress: number;
  data: CalculatorSandboxData;
}) {
  const p = clamp01(progress);

  const calcProg = easeOutCubicBezier(subProgress(p, 0.0, 0.45));
  const presentProg = easeOutCubicBezier(subProgress(p, 0.45, 0.85));

  const liveRadius = (data.radiusResultMm * calcProg).toFixed(1);

  return (
    <svg
      viewBox="0 0 420 210"
      preserveAspectRatio="xMidYMid meet"
      className="size-full select-none pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g className="stroke-slate-400/20 dark:stroke-slate-700/35" strokeWidth="0.5">
        {[50, 90, 130, 170].map((gy) => (
          <line key={gy} x1="20" y1={gy} x2="400" y2={gy} />
        ))}
        {[70, 140, 210, 280, 350].map((gx) => (
          <line key={gx} x1={gx} y1="28" x2={gx} y2="190" />
        ))}
      </g>

      {/* PALCO CENTRAL UNIFICADO DE CÁLCULO E GEOMETRIA */}
      <g transform="translate(56, 40)">
        <rect
          x="0"
          y="0"
          width="308"
          height="132"
          rx="10"
          className="fill-white/95 dark:fill-[#0D1526]/95 stroke-[#0284C7] dark:stroke-[#38BDF8]"
          strokeWidth="1.3"
        />

        {/* Visor de Expressão Matemática Real no Topo Central */}
        <rect
          x="12"
          y="10"
          width="284"
          height="38"
          rx="6"
          className="fill-slate-100 dark:fill-[#070B12] stroke-slate-300 dark:stroke-slate-800"
          strokeWidth="0.9"
        />
        <text
          x="20"
          y="24"
          className="fill-slate-500 dark:fill-slate-400 font-mono text-[8px]"
        >
          Corda c={data.chordInputMm} • Flecha f={data.sagittaInputMm} • {data.expressionG}
        </text>
        <text
          x="286"
          y="40"
          textAnchor="end"
          className="fill-[#059669] dark:fill-[#10B981] font-mono text-[13px] font-bold"
        >
          R = {liveRadius} mm
        </text>

        {/* Arco por Corda/Flecha + Triangulação no Centro */}
        <g transform="translate(22, 56)">
          <path
            d="M 8 52 A 64 64 0 0 1 116 52"
            className="fill-sky-500/15 stroke-[#0284C7] dark:stroke-[#38BDF8]"
            strokeWidth="1.8"
          />
          <line
            x1="8"
            y1="52"
            x2="116"
            y2="52"
            stroke="#F59E0B"
            strokeWidth="1.2"
            strokeDasharray="4 2"
          />
          <line
            x1="62"
            y1="26"
            x2="62"
            y2="52"
            stroke="#DC143C"
            strokeWidth="1.3"
          />
          <text
            x="62"
            y="21"
            textAnchor="middle"
            className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[7.5px] font-bold"
          >
            f = {data.sagittaInputMm} mm
          </text>
          <text
            x="62"
            y="64"
            textAnchor="middle"
            className="fill-slate-600 dark:fill-slate-300 font-mono text-[7.5px] font-bold"
          >
            c = {data.chordInputMm} mm • G = {data.geratrizMm}
          </text>
        </g>

        {/* Cartões de Resultado Consolidado (Triangulação + Peso de Chapa SAE 1020 3.0mm) */}
        <g
          transform="translate(168, 54)"
          opacity={Number((0.35 + 0.65 * presentProg).toFixed(2))}
          fontFamily='"JetBrains Mono", monospace'
        >
          <rect
            x="0"
            y="0"
            width="128"
            height="32"
            rx="5"
            className="fill-slate-100 dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-800"
            strokeWidth="0.85"
          />
          <text x="8" y="12" className="fill-slate-500 dark:fill-slate-400 text-[6.8px]">
            TRIANGULAÇÃO GERATRIZ
          </text>
          <text x="8" y="24" className="fill-[#0284C7] dark:fill-[#38BDF8] text-[9.5px] font-bold">
            G = {data.geratrizMm} mm ({data.angleDeg}°)
          </text>

          <rect
            x="0"
            y="36"
            width="128"
            height="32"
            rx="5"
            className="fill-amber-500/15 dark:fill-amber-500/20 stroke-amber-500/60"
            strokeWidth="0.9"
          />
          <text x="8" y="48" className="fill-amber-700 dark:fill-amber-300 text-[6.8px] font-bold">
            CHAPA SAE 1020 • 3.0 MM
          </text>
          <text x="8" y="60" className="fill-amber-600 dark:fill-amber-400 text-[9.5px] font-bold">
            {data.sheetMassKg} kg (1.5×3.0m)
          </text>
        </g>
      </g>
    </svg>
  );
}

/**
 * CENA 4 — "Corte CNC, peso e orçamento"
 */
function SceneManufacturingPrepUnified({
  progress,
  data,
}: {
  progress: number;
  data: FabricationSandboxData;
}) {
  const p = clamp01(progress);

  const scanProg = easeOutCubicBezier(subProgress(p, 0.0, 0.56));
  const summaryProg = easeOutCubicBezier(subProgress(p, 0.52, 0.9));

  const laserX = Number((54 + 312 * scanProg).toFixed(2));
  const liftY = Number((-4 * summaryProg).toFixed(2));

  return (
    <svg
      viewBox="0 0 420 210"
      preserveAspectRatio="xMidYMid meet"
      className="size-full select-none pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Mesa de Corte CNC Centralizada (Chapa 1500 × 3000 mm • SAE 1020 3.0 mm) */}
      <rect
        x="42"
        y="40"
        width="336"
        height="104"
        rx="6"
        className="fill-[#FAFBFD] dark:fill-[#0D1526] stroke-[#0284C7] dark:stroke-[#38BDF8]"
        strokeWidth="1.35"
      />

      <g className="stroke-slate-300/60 dark:stroke-slate-800/85" strokeWidth="0.6">
        {[66, 92, 118].map((gy) => (
          <line key={gy} x1="42" y1={gy} x2="378" y2={gy} />
        ))}
        {[98, 154, 210, 266, 322].map((gx) => (
          <line key={gx} x1={gx} y1="40" x2={gx} y2="144" />
        ))}
      </g>

      <g transform={`translate(0 ${liftY})`}>
        <g
          className="fill-emerald-500/[0.16] stroke-[#059669] dark:stroke-[#10B981]"
          strokeWidth="1.35"
        >
          <circle cx="84" cy="74" r="22" />
          <circle cx="84" cy="74" r="8" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
          <circle cx="138" cy="74" r="22" />
          <circle cx="138" cy="74" r="8" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
          <rect x="60" y="104" width="102" height="28" rx="3" />
          <circle cx="76" cy="118" r="4" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
          <circle cx="146" cy="118" r="4" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
        </g>

        <g
          className="fill-sky-500/[0.16] stroke-[#0284C7] dark:stroke-[#38BDF8]"
          strokeWidth="1.35"
        >
          <path d="M 180 56 C 216 44, 268 44, 304 56 L 288 96 C 260 88, 224 88, 196 96 Z" />
          <rect x="178" y="104" width="60" height="28" rx="3" />
          <rect x="246" y="104" width="58" height="28" rx="3" />
        </g>

        <g
          className="fill-amber-500/[0.18] stroke-amber-600 dark:stroke-amber-400"
          strokeWidth="1.35"
        >
          <polygon points="314,50 366,50 366,94 328,94 314,80" />
          <rect x="314" y="104" width="52" height="28" rx="3" />
        </g>
      </g>

      <g>
        <line
          x1={laserX}
          y1="40"
          x2={laserX}
          y2="144"
          stroke="#DC143C"
          strokeWidth="1.4"
          strokeDasharray="4 2"
        />
        <circle cx={laserX} cy="80" r="3.8" fill="#DC143C" />
        <circle cx={laserX} cy="80" r="7" stroke="#F59E0B" strokeWidth="1" strokeOpacity="0.8" />
      </g>

      {/* Painel compacto de resumo de corte e orçamento */}
      <g
        transform="translate(42, 149)"
        opacity={Number((0.4 + 0.6 * summaryProg).toFixed(2))}
      >
        <rect
          x="0"
          y="0"
          width="336"
          height="24"
          rx="5"
          className="fill-white/95 dark:fill-slate-900/95 stroke-slate-300 dark:stroke-slate-700"
          strokeWidth="1"
        />
        <text
          x="10"
          y="15"
          className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[8px] font-bold"
        >
          {data.sheetWidthMm}×{data.sheetLengthMm} (#{data.thicknessMm.toFixed(1)}mm) • CORTE {(data.cutLengthMm * data.quantity / 1000).toFixed(2)}m ({data.cutTimeMin} min)
        </text>
        <text
          x="326"
          y="15.5"
          textAnchor="end"
          className="fill-[#059669] dark:fill-[#10B981] font-mono text-[9.5px] font-bold"
        >
          R$ {data.totalCostBrl.toFixed(2)}
        </text>
      </g>
    </svg>
  );
}

/* =========================================================================
   COMPONENTE PRINCIPAL — LIVE ENGINEERING PLAYGROUND & MICRO-HUD DE CONVERSÃO
   ========================================================================= */

interface HomeCinematicHeroProps {
  onNewProject?: () => void;
  onOpenTools?: () => void;
  className?: string;
}

export function HomeCinematicHero({ className }: HomeCinematicHeroProps) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [isInViewport, setIsInViewport] = useState(true);
  const [isDocVisible, setIsDocVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const containerRef = useRef<HTMLElement | null>(null);
  const sceneStartRef = useRef<number>(0);

  // Calcula os dados de demonstração em sandbox isolado uma única vez (Zero Overhead por quadro)
  const chamferSandbox = useMemo(() => runChamferSandboxDemo(), []);
  const boilermakingSandbox = useMemo(() => runBoilermakingSandboxDemo(), []);
  const calculatorSandbox = useMemo(() => runCalculatorSandboxDemo(), []);
  const fabricationSandbox = useMemo(() => runFabricationSandboxDemo(), []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisChange = () => {
      setIsDocVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInViewport(entry.isIntersecting);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isRunning = isInViewport && isDocVisible;

  // Loop contínuo de 60 FPS sincronizando progresso interno da cena (6.0s) e avanço automático
  useEffect(() => {
    if (!isRunning) return;
    if (prefersReducedMotion) {
      setSceneProgress(0.88);
      const slowTimer = window.setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % CINEMATIC_WORKFLOW_SCENES.length);
      }, SCENE_DURATION_MS);
      return () => window.clearInterval(slowTimer);
    }

    let rafId = 0;
    sceneStartRef.current = performance.now() - sceneProgress * SCENE_DURATION_MS;

    const tick = (now: number) => {
      const elapsed = now - sceneStartRef.current;
      if (elapsed >= SCENE_DURATION_MS) {
        sceneStartRef.current = now;
        setSceneProgress(0);
        setActiveIndex((prev) => (prev + 1) % CINEMATIC_WORKFLOW_SCENES.length);
      } else {
        const rawP = elapsed / SCENE_DURATION_MS;
        const quantized = Math.round(rawP * 100) / 100;
        setSceneProgress((prev) => (Math.abs(prev - quantized) >= 0.01 ? quantized : prev));
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, prefersReducedMotion, activeIndex]);

  const currentScene =
    CINEMATIC_WORKFLOW_SCENES[activeIndex] ?? CINEMATIC_WORKFLOW_SCENES[0]!;

  const liveTelemetryText = useMemo(
    () => resolveSceneLiveTelemetry(currentScene.id, sceneProgress),
    [currentScene.id, sceneProgress],
  );

  const isAct2 = sceneProgress >= ACT2_PROGRESS_THRESHOLD;

  // Selecionar diretamente um dos 4 segmentos de progresso na base (sem navegar para fora da Home)
  const handleSelectSceneSegment = useCallback(
    (index: number, e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      triggerHaptic("tap");
      sceneStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
      setSceneProgress(0);
      setActiveIndex(index);
    },
    [],
  );

  // Toque no cartão ou no Micro-CTA abre o Instant Playground com a peça pré-carregada em sandbox
  const handleCardActivation = useCallback(() => {
    triggerHaptic("selection");
    AudioManager.play("ui_pop");

    const target = prepareInstantPlaygroundForScene(currentScene.id);

    startTransition(() => {
      void navigate(target as any);
    });
  }, [currentScene.id, navigate]);

  return (
    <section
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-label={`${currentScene.title} — ${currentScene.ctaLabel}`}
      data-testid="home-cinematic-hero"
      data-active-scene={currentScene.id}
      onClick={handleCardActivation}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardActivation();
        }
      }}
      className={cn(
        "caldra-hero group relative w-full h-[200px] xs:h-[210px] sm:h-[220px] min-h-[192px] max-h-[228px] overflow-hidden rounded-2xl p-0 shadow-xl transition-transform active:scale-[0.99] cursor-pointer select-none touch-pan-y focus-visible:ring-2 focus-visible:ring-amber-500/60",
        className,
      )}
    >
      {/* PALCO CINEMATOGRÁFICO EM 100% DA SUPERFÍCIE INTERNA DO CARTÃO */}
      <div className="relative inset-0 size-full overflow-hidden">
        {CINEMATIC_WORKFLOW_SCENES.map((scene, idx) => {
          const isActive = idx === activeIndex;
          const activeProg = isActive ? sceneProgress : 0;
          return (
            <div
              key={scene.id}
              aria-hidden={!isActive}
              className={cn(
                "absolute inset-0 size-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity]",
                isActive
                  ? "opacity-100 scale-100 z-10"
                  : "opacity-0 scale-[1.02] pointer-events-none z-0",
              )}
            >
              {scene.id === "chamfer-cad" && (
                <SceneChamferCadUnified progress={activeProg} data={chamferSandbox} />
              )}
              {scene.id === "caldeiraria-tracagem" && (
                <SceneBoilermakingUnified progress={activeProg} data={boilermakingSandbox} />
              )}
              {scene.id === "calculos-engenharia" && (
                <SceneEngineeringCalcUnified progress={activeProg} data={calculatorSandbox} />
              )}
              {scene.id === "preparacao-fabricacao" && (
                <SceneManufacturingPrepUnified progress={activeProg} data={fabricationSandbox} />
              )}
            </div>
          );
        })}

        {/* Tratamento localizado de contraste no topo e na base para leitura cristalina do Micro-HUD */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-white/90 via-white/60 to-transparent dark:from-[#090D16]/90 dark:via-[#090D16]/60 dark:to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-white/85 via-white/35 to-transparent dark:from-[#090D16]/90 dark:via-[#090D16]/40 dark:to-transparent"
        />

        {/* 2.1 CABEÇALHO DUPLO DE ALTO IMPACTO (TÍTULO 15PX + SUBTÍTULO DE VALOR 11.5PX) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col px-3.5 pt-2 sm:px-4 sm:pt-2.5">
          <h1
            key={`scene-title-${currentScene.id}`}
            data-testid="home-cinematic-title"
            className="font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-tight truncate"
          >
            {currentScene.title}
          </h1>
          <p
            key={`scene-subtitle-${currentScene.id}`}
            data-testid="home-cinematic-subtitle"
            className="mt-0.5 truncate text-[11.5px] font-normal leading-tight text-[#475569] dark:text-[#94A3B8]"
          >
            {currentScene.subtitle}
          </p>
        </div>

        {/* 2.2 TELEMETRIA DE OPERAÇÃO AO VIVO (CANTO INFERIOR ESQUERDO) */}
        <div
          data-testid="home-cinematic-telemetry"
          className="pointer-events-none absolute bottom-[14px] left-[14px] z-30 max-w-[56%] truncate rounded-md border border-slate-700/80 bg-[rgba(15,23,42,0.75)] px-2 py-1 font-mono text-[9.5px] sm:text-[10px] font-medium tracking-tight text-sky-300 backdrop-blur-sm"
        >
          {liveTelemetryText}
        </div>

        {/* 3. MICRO-CTA FLUTUANTE COM PULSO SINCRONIZADO AO ATO 2 (CANTO INFERIOR DIREITO) */}
        <div
          data-testid="home-cinematic-cta"
          data-cta-act={isAct2 ? "act2" : "act1"}
          className={cn(
            "pointer-events-none absolute bottom-[14px] right-[14px] z-30 inline-flex h-[30px] items-center justify-center rounded-full px-3 text-[11.5px] font-semibold tracking-tight transition-all duration-300",
            isAct2
              ? "border border-amber-300 bg-[#F59E0B] text-[#0F172A] shadow-[0_0_16px_rgba(245,158,11,0.45)]"
              : "border border-[rgba(245,158,11,0.35)] bg-[rgba(15,23,42,0.75)] text-slate-100 backdrop-blur-sm",
          )}
        >
          {currentScene.ctaLabel}
        </div>

        {/* 4. BARRA DE PROGRESSO SEGMENTADA DE 4 ETAPAS NA BASE (HEIGHT: 2.5PX, HIT-AREA: 28PX) */}
        <div
          data-testid="home-cinematic-progress-bar"
          className="absolute inset-x-3.5 bottom-0 z-40 flex items-end gap-[6px]"
          onClick={(e) => e.stopPropagation()}
        >
          {CINEMATIC_WORKFLOW_SCENES.map((scene, idx) => {
            const isSegmentActive = idx === activeIndex;
            const isSegmentCompleted = idx < activeIndex;
            const fillPct = isSegmentActive
              ? Math.round(clamp01(sceneProgress) * 100)
              : isSegmentCompleted
                ? 100
                : 0;

            return (
              <button
                key={scene.id}
                type="button"
                aria-label={`Ir para demonstração: ${scene.title}`}
                data-testid={`home-cinematic-segment-${idx}`}
                onClick={(e) => handleSelectSceneSegment(idx, e)}
                className="group/seg relative flex h-[28px] flex-1 items-end pb-[3px] cursor-pointer focus:outline-none"
              >
                <span className="relative block h-[2.5px] w-full overflow-hidden rounded-full bg-slate-400/35 dark:bg-slate-700/60">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-75",
                      isSegmentActive
                        ? "bg-[#F59E0B]"
                        : isSegmentCompleted
                          ? "bg-amber-500/70"
                          : "bg-transparent",
                    )}
                    style={{ width: `${fillPct}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
