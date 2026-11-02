import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Compass, Flame, Zap } from "lucide-react";
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

/**
 * VITRINE INTERATIVA DOS 3 PILARES DO CALDRA (Zona A, Zona B e Zona C sem colisão)
 */
export interface CaldraHeroPillar {
  id: CinematicSceneId;
  tabNumber: string;
  tabLabel: string;
  title: string;
  subtitle: string;
  telemetryPill: string;
  ctaLabel: string;
  routeTo: "/desenho-2d" | "/tracagem" | "/oficina";
  routeSearch?: { tab: "orcamento" };
}

export const PILLAR_DURATION_MS = 5500;

export const CALDRA_THREE_PILLARS: CaldraHeroPillar[] = [
  {
    id: "chamfer-cad",
    tabNumber: "1.",
    tabLabel: "CAD 2D/3D",
    title: "CHAMFER CAD 2D & 3D",
    subtitle: "Desenho técnico no toque, arrays, engenharia reversa 1:1 e órbita 3D.",
    telemetryPill: "Ø160 • 6x Ø18 • 3D OK",
    ctaLabel: "Abrir no CAD →",
    routeTo: "/desenho-2d",
  },
  {
    id: "caldeiraria-tracagem",
    tabNumber: "2.",
    tabLabel: "Caldeiraria",
    title: "Traçagem e Planificação 1:1",
    subtitle: "Desenvolva cones, transições, curvas de gomos e chapas dobradas.",
    telemetryPill: "CONE Ø120×60 • PLANIFICADO",
    ctaLabel: "Traçar peça →",
    routeTo: "/tracagem",
  },
  {
    id: "preparacao-fabricacao",
    tabNumber: "3.",
    tabLabel: "Corte & Custo",
    title: "Corte CNC, Peso e Orçamento",
    subtitle: "Aproveitamento de chapa, tempo de laser, peso e custo imediato.",
    telemetryPill: "CORTE 5.92m • R$ 433,56",
    ctaLabel: "Simular custo →",
    routeTo: "/oficina",
    routeSearch: { tab: "orcamento" },
  },
];

/** Duração padrão de 6.0 segundos por cena para compatibilidade de testes do motor */
export const SCENE_DURATION_MS = 6000;

/** Limiar do Ato 2 (55% do progresso) onde a peça entra em Órbita 3D Frontal */
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
 * Retorna a micro-tag de Telemetria de Operação ao Vivo sincronizada com o segundo exato da cena.
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
    {
      id: pcdId,
      type: "circle",
      layer: "referencia",
      cx: centerX,
      cy: centerY,
      r: data.pcdMm / 2,
    },
    {
      id: hubId,
      type: "circle",
      layer: "dobra",
      cx: centerX,
      cy: centerY,
      r: data.hubDiameterMm / 2,
    },
    {
      id: outerId,
      type: "circle",
      layer: "corte",
      cx: centerX,
      cy: centerY,
      r: data.outerDiameterMm / 2,
    },
    {
      id: innerId,
      type: "circle",
      layer: "corte",
      cx: centerX,
      cy: centerY,
      r: data.innerBoreMm / 2,
    },
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
 * Calcula o estado exato da coreografia de 7 etapas do CHAMFER CAD em palco único centralizado.
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

  const dimIn = easeOutCubicBezier(subProgress(p, 0.40, 0.50));
  const dimOut = subProgress(p, 0.58, 0.70);
  const dimensionsOpacity = Math.max(0, dimIn * (1 - dimOut * 0.55));

  const pulseRaw = subProgress(p, 0.48, 0.56);
  const validationPulse = Math.sin(pulseRaw * Math.PI);

  const extrudeProg = easeOutCubicBezier(subProgress(p, 0.55, 0.72));
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
 * Executa o motor real da Calculadora Científica (`evaluateExpression`) em sandbox isolado.
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
   CENAS TÉCNICAS VETORIAIS DA VITRINE DOS 3 PILARES (ZONA B)
   ========================================================================= */

/**
 * PILAR 1 — "CHAMFER CAD 2D & 3D"
 * Construção do Flange (Ø 160.0 mm • PCD 116 • 6x Ø18) no centro da Área de Trabalho com transição in-place para vista 3D orbital frontal.
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
  const cy = STAGE_CENTER.y - 2;

  const scaleMmToPx = 0.62;
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
  const neckHeightPx = Number((18 * frame.extrusionFactor).toFixed(2));

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
      viewBox="0 0 420 185"
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
        height="13"
        className="fill-slate-200/80 dark:fill-slate-900/90"
      />
      <rect
        x="0"
        y="13"
        width="16"
        height="172"
        className="fill-slate-200/80 dark:fill-slate-900/90"
      />
      <line
        x1="0"
        y1="13"
        x2="420"
        y2="13"
        className="stroke-slate-300 dark:stroke-slate-800"
        strokeWidth="0.8"
      />
      <line
        x1="16"
        y1="13"
        x2="16"
        y2="185"
        className="stroke-slate-300 dark:stroke-slate-800"
        strokeWidth="0.8"
      />

      {/* Marcações da Régua Horizontal */}
      {[36, 94, 152, 210, 268, 326, 384].map((rx, i) => (
        <g key={rx}>
          <line
            x1={rx}
            y1="8"
            x2={rx}
            y2="13"
            className="stroke-slate-400 dark:stroke-slate-600"
            strokeWidth="0.8"
          />
          <text
            x={rx + 3}
            y="10"
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

      {/* Área de Trabalho Centralizada */}
      <rect
        x="26"
        y="20"
        width="380"
        height="156"
        rx="5"
        className="fill-[#FAFBFD] dark:fill-[#0D1526] stroke-[#0284C7] dark:stroke-[#38BDF8]"
        strokeWidth="1.2"
      />

      {/* Grade Técnica da Área de Trabalho */}
      <g className="stroke-slate-400/20 dark:stroke-slate-600/30" strokeWidth="0.5">
        {[50, 80, 110, 140, 166].map((gy) => (
          <line key={gy} x1="26" y1={gy} x2="406" y2={gy} />
        ))}
        {[74, 119, 164, 210, 256, 301, 346].map((gx) => (
          <line key={gx} x1={gx} y1="20" x2={gx} y2="176" />
        ))}
      </g>

      {/* Vetores de Origem (0,0) */}
      <g>
        <line x1="26" y1="20" x2="56" y2="20" stroke="#E11D48" strokeWidth="1.5" />
        <polygon points="60,20 54.5,18 54.5,22" fill="#E11D48" />
        <line
          x1="26"
          y1="20"
          x2="26"
          y2="50"
          className="stroke-[#059669] dark:stroke-[#10B981]"
          strokeWidth="1.5"
        />
        <polygon
          points="26,54 24,48.5 28,48.5"
          className="fill-[#059669] dark:fill-[#10B981]"
        />
        <circle cx="26" cy="20" r="2.2" fill="#DC143C" />
      </g>

      {/* PALCO CENTRAL COM ENQUADRAMENTO DINÂMICO DE CÂMERA */}
      <g
        transform={`translate(${cx} ${cy - 10}) scale(${frame.cameraScale.toFixed(3)}) translate(${-cx} ${-cy})`}
      >
        <g opacity={Number((0.35 + 0.55 * frame.outerStrokeProgress).toFixed(2))}>
          <line
            x1={cx - 68}
            y1={cy}
            x2={cx + 68}
            y2={cy}
            stroke="#DC143C"
            strokeWidth="0.7"
            strokeDasharray="6 2.5 1.5 2.5"
          />
          <line
            x1={cx}
            y1={cy - 64}
            x2={cx}
            y2={cy + 64}
            stroke="#DC143C"
            strokeWidth="0.7"
            strokeDasharray="6 2.5 1.5 2.5"
          />
        </g>

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
              </g>
            );
          })}
        </g>

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

        {showDrawingCursor && (
          <g transform={`translate(${cursorX} ${cursorY})`}>
            <circle r="4.5" stroke="#F59E0B" strokeWidth="1.2" />
            <line x1="-7" y1="0" x2="7" y2="0" stroke="#F59E0B" strokeWidth="0.9" />
            <line x1="0" y1="-7" x2="0" y2="7" stroke="#F59E0B" strokeWidth="0.9" />
          </g>
        )}

        {/* Cota Diametral Real sempre legível */}
        <g opacity={Number(Math.max(0.65, frame.dimensionsOpacity).toFixed(2))}>
          <text
            x={cx}
            y={cy + 64}
            textAnchor="middle"
            className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[8px] font-bold"
          >
            Ø {data.outerDiameterMm.toFixed(1)} mm • PCD {data.pcdMm} • {data.holeCount}x Ø{data.holeDiameterMm}
          </text>
        </g>
      </g>

      {/* Gizmo 3D X-Y-Z real */}
      <g
        transform="translate(382, 152)"
        opacity={Number((0.35 + 0.65 * frame.extrusionFactor).toFixed(2))}
      >
        {gizmoAxes.map((ax) => (
          <line
            key={ax.axis}
            x1="0"
            y1="0"
            x2={Number((ax.dx * 14).toFixed(2))}
            y2={Number((ax.dy * 14).toFixed(2))}
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
 * PILAR 2 — "Traçagem e Planificação 1:1"
 * Mostra simultaneamente e de forma animada a relação direta entre o Tronco de Cone 3D metálico (Ø 120 × Ø 60 × H 100 mm)
 * e a sua chapa aberta planificada com geratrizes (α = 103.5° • R1 = 208.8 mm).
 */
function SceneBoilermakingUnified({
  progress,
  data,
}: {
  progress: number;
  data: BoilermakingSandboxData;
}) {
  const p = clamp01(progress);

  const traceProg = easeOutCubicBezier(subProgress(p, 0.0, 0.55));
  const highlightPulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 2);

  // Esquerda: Modelo 3D Metálico do Tronco de Cone (cx = 114)
  const coneCx = 112;
  const topY = 48;
  const botY = 134;
  const topRx = 26;
  const botRx = 52;
  const tiltRyTop = 7.5;
  const tiltRyBot = 14;

  // Direita: Chapa Aberta Planificada 1:1 com Geratrizes (cx = 304)
  const flatCx = 304;
  const apexY = 26;
  const rInnerPx = 44;
  const rOuterPx = 114;
  const halfSpreadDeg = 48;

  const aStart = ((-halfSpreadDeg + 90) * Math.PI) / 180;
  const aEnd = ((halfSpreadDeg + 90) * Math.PI) / 180;

  const p1In = {
    x: Number((flatCx + rInnerPx * Math.cos(aStart)).toFixed(2)),
    y: Number((apexY + rInnerPx * Math.sin(aStart)).toFixed(2)),
  };
  const p2In = {
    x: Number((flatCx + rInnerPx * Math.cos(aEnd)).toFixed(2)),
    y: Number((apexY + rInnerPx * Math.sin(aEnd)).toFixed(2)),
  };
  const p1Out = {
    x: Number((flatCx + rOuterPx * Math.cos(aStart)).toFixed(2)),
    y: Number((apexY + rOuterPx * Math.sin(aStart)).toFixed(2)),
  };
  const p2Out = {
    x: Number((flatCx + rOuterPx * Math.cos(aEnd)).toFixed(2)),
    y: Number((apexY + rOuterPx * Math.sin(aEnd)).toFixed(2)),
  };

  const sectorPath = `M ${p1In.x} ${p1In.y} A ${rInnerPx} ${rInnerPx} 0 0 1 ${p2In.x} ${p2In.y} L ${p2Out.x} ${p2Out.y} A ${rOuterPx} ${rOuterPx} 0 0 0 ${p1Out.x} ${p1Out.y} Z`;
  const divisionFractions = [-1, -0.667, -0.333, 0, 0.333, 0.667, 1];
  const visibleDivisions = Math.max(2, Math.ceil(traceProg * divisionFractions.length));

  return (
    <svg
      viewBox="0 0 420 185"
      preserveAspectRatio="xMidYMid meet"
      className="size-full select-none pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="pillar2-cone-steel"
          x1={coneCx - 52}
          y1={topY}
          x2={coneCx + 52}
          y2={botY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#334155" />
          <stop offset="24%" stopColor="#94A3B8" />
          <stop offset="48%" stopColor="#F1F5F9" />
          <stop offset="70%" stopColor="#475569" />
          <stop offset="90%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
      </defs>

      {/* Grade técnica de fundo */}
      <g
        className="stroke-slate-400/20 dark:stroke-slate-700/35"
        strokeWidth="0.5"
        strokeDasharray="2.5 2.5"
      >
        {[38, 76, 114, 152].map((gy) => (
          <line key={gy} x1="16" y1={gy} x2="404" y2={gy} />
        ))}
        {[70, 140, 210, 280, 350].map((gx) => (
          <line key={gx} x1={gx} y1="14" x2={gx} y2="172" />
        ))}
      </g>

      {/* LADO ESQUERDO: TRONCO DE CONE 3D METÁLICO (Ø 120 × Ø 60 × H 100 mm) */}
      <g>
        <line
          x1={coneCx}
          y1="26"
          x2={coneCx}
          y2="156"
          stroke="#DC143C"
          strokeWidth="0.75"
          strokeDasharray="5 2 1.5 2"
        />

        <path
          d={`M ${coneCx - topRx} ${topY} L ${coneCx + topRx} ${topY} L ${coneCx + botRx} ${botY} A ${botRx} ${tiltRyBot} 0 0 1 ${coneCx - botRx} ${botY} Z`}
          fill="url(#pillar2-cone-steel)"
          className="stroke-slate-700 dark:stroke-slate-200"
          strokeWidth="1.2"
        />

        {/* Geratrizes no Cone 3D */}
        {[-0.65, -0.22, 0.22, 0.65].map((f, idx) => {
          const xT = Number((coneCx + topRx * f).toFixed(2));
          const xB = Number((coneCx + botRx * f).toFixed(2));
          const yB = Number((botY + tiltRyBot * Math.sqrt(Math.max(0, 1 - f * f)) * 0.7).toFixed(2));
          return (
            <line
              key={idx}
              x1={xT}
              y1={topY}
              x2={xB}
              y2={yB}
              stroke="#F59E0B"
              strokeWidth="0.75"
              strokeOpacity="0.8"
              strokeDasharray="2.5 1.8"
            />
          );
        })}

        <ellipse
          cx={coneCx}
          cy={topY}
          rx={topRx}
          ry={tiltRyTop}
          className="fill-slate-800 dark:fill-slate-950 stroke-[#0284C7] dark:stroke-[#38BDF8]"
          strokeWidth="1.25"
        />
        <ellipse
          cx={coneCx}
          cy={topY}
          rx={Number((topRx * 0.65).toFixed(2))}
          ry={Number((tiltRyTop * 0.65).toFixed(2))}
          className="fill-slate-950 dark:fill-black stroke-slate-500"
          strokeWidth="0.75"
        />

        {/* Cotas 3D: Ø 60, Ø 120, H 100 */}
        <text
          x={coneCx}
          y="34"
          textAnchor="middle"
          className="fill-slate-800 dark:fill-slate-200 font-mono text-[7.5px] font-bold"
        >
          Ø {data.d2Mm} mm
        </text>
        <text
          x={coneCx}
          y="162"
          textAnchor="middle"
          className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[8px] font-bold"
        >
          Ø {data.d1Mm} × H {data.heightMm} mm
        </text>
      </g>

      {/* SETA DE PROJEÇÃO / PLANIFICAÇÃO 1:1 NO CENTRO */}
      <g transform="translate(182, 86)">
        <line
          x1="0"
          y1="8"
          x2="32"
          y2="8"
          stroke="#F59E0B"
          strokeWidth="1.4"
          strokeDasharray="3 2"
        />
        <polygon points="36,8 30,5 30,11" fill="#F59E0B" />
        <text
          x="18"
          y="2"
          textAnchor="middle"
          className="fill-amber-600 dark:fill-amber-400 font-mono text-[6.8px] font-bold"
        >
          1:1
        </text>
      </g>

      {/* LADO DIREITO: CHAPA ABERTA PLANIFICADA COM GERATRIZES */}
      <g>
        <path
          d={sectorPath}
          className="fill-sky-500/[0.14] dark:fill-sky-400/[0.16] stroke-[#0284C7] dark:stroke-[#38BDF8]"
          strokeWidth="1.6"
        />

        {divisionFractions.slice(0, visibleDivisions).map((frac, idx) => {
          const deg = frac * halfSpreadDeg;
          const rad = ((deg + 90) * Math.PI) / 180;
          const xIn = Number((flatCx + rInnerPx * Math.cos(rad)).toFixed(2));
          const yIn = Number((apexY + rInnerPx * Math.sin(rad)).toFixed(2));
          const xOut = Number((flatCx + rOuterPx * Math.cos(rad)).toFixed(2));
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
                strokeDasharray={idx === 3 ? "4 2" : "2.5 2"}
              />
              <circle
                cx={xOut}
                cy={yOut}
                r="1.8"
                className="fill-[#0284C7] dark:fill-[#38BDF8]"
              />
            </g>
          );
        })}

        {/* Linhas de raio de traçagem do vértice */}
        <line
          x1={flatCx}
          y1={apexY}
          x2={p1In.x}
          y2={p1In.y}
          stroke="#94A3B8"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <line
          x1={flatCx}
          y1={apexY}
          x2={p2In.x}
          y2={p2In.y}
          stroke="#94A3B8"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <circle
          cx={flatCx}
          cy={apexY}
          r={Number((2.4 + 0.8 * highlightPulse).toFixed(2))}
          fill="#DC143C"
        />

        <text
          x={flatCx}
          y="162"
          textAnchor="middle"
          className="fill-amber-600 dark:fill-amber-400 font-mono text-[8px] font-bold"
        >
          α = {data.sectorAngleDeg}° • G = {data.slantHeightMm} mm ({data.divisions}x)
        </text>
      </g>
    </svg>
  );
}

/**
 * PILAR 3 — "Corte CNC, Peso e Orçamento"
 * Animação do plano de corte (1500 × 3000 mm • #3.0mm) com a cabeça laser percorrendo as peças e consolidando o custo (R$ 433,56).
 */
function SceneManufacturingPrepUnified({
  progress,
  data,
}: {
  progress: number;
  data: FabricationSandboxData;
}) {
  const p = clamp01(progress);

  const scanProg = easeOutCubicBezier(subProgress(p, 0.0, 0.65));
  const summaryProg = easeOutCubicBezier(subProgress(p, 0.35, 0.85));

  const laserX = Number((46 + 324 * scanProg).toFixed(2));
  const laserY = Number((72 + 22 * Math.sin(scanProg * Math.PI * 3)).toFixed(2));

  return (
    <svg
      viewBox="0 0 420 185"
      preserveAspectRatio="xMidYMid meet"
      className="size-full select-none pointer-events-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Mesa de Corte CNC Centralizada (Chapa 1500 × 3000 mm • #3.0mm) */}
      <rect
        x="34"
        y="22"
        width="352"
        height="112"
        rx="6"
        className="fill-[#FAFBFD] dark:fill-[#0D1526] stroke-[#0284C7] dark:stroke-[#38BDF8]"
        strokeWidth="1.35"
      />

      <g className="stroke-slate-300/60 dark:stroke-slate-800/85" strokeWidth="0.6">
        {[50, 78, 106].map((gy) => (
          <line key={gy} x1="34" y1={gy} x2="386" y2={gy} />
        ))}
        {[92, 150, 210, 270, 328].map((gx) => (
          <line key={gx} x1={gx} y1="22" x2={gx} y2="134" />
        ))}
      </g>

      {/* Peças aninhadas (Nesting) na chapa */}
      <g>
        <g
          className="fill-emerald-500/[0.16] stroke-[#059669] dark:stroke-[#10B981]"
          strokeWidth="1.35"
        >
          <circle cx="78" cy="58" r="23" />
          <circle cx="78" cy="58" r="8.5" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
          <circle cx="134" cy="58" r="23" />
          <circle cx="134" cy="58" r="8.5" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
          <rect x="52" y="92" width="108" height="30" rx="3" />
          <circle cx="68" cy="107" r="4.2" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
          <circle cx="144" cy="107" r="4.2" className="fill-[#FAFBFD] dark:fill-[#0D1526]" />
        </g>

        <g
          className="fill-sky-500/[0.16] stroke-[#0284C7] dark:stroke-[#38BDF8]"
          strokeWidth="1.35"
        >
          <path d="M 176 40 C 214 27, 268 27, 306 40 L 290 82 C 260 73, 222 73, 192 82 Z" />
          <rect x="174" y="92" width="62" height="30" rx="3" />
          <rect x="244" y="92" width="60" height="30" rx="3" />
        </g>

        <g
          className="fill-amber-500/[0.18] stroke-amber-600 dark:stroke-amber-400"
          strokeWidth="1.35"
        >
          <polygon points="316,34 372,34 372,80 332,80 316,66" />
          <rect x="316" y="92" width="56" height="30" rx="3" />
        </g>
      </g>

      {/* Cabeçote Laser CNC Percorrendo a Chapa */}
      <g>
        <line
          x1={laserX}
          y1="22"
          x2={laserX}
          y2="134"
          stroke="#DC143C"
          strokeWidth="1.4"
          strokeDasharray="4 2"
        />
        <circle cx={laserX} cy={laserY} r="4" fill="#DC143C" />
        <circle cx={laserX} cy={laserY} r="7.5" stroke="#F59E0B" strokeWidth="1.1" strokeOpacity="0.85" />
      </g>

      {/* Barra consolidada de Chapa + Custo dentro do palco */}
      <g
        transform="translate(34, 142)"
        opacity={Number((0.55 + 0.45 * summaryProg).toFixed(2))}
      >
        <rect
          x="0"
          y="0"
          width="352"
          height="28"
          rx="5"
          className="fill-white/95 dark:fill-slate-900/95 stroke-slate-300 dark:stroke-slate-700"
          strokeWidth="1"
        />
        <text
          x="10"
          y="17.5"
          className="fill-[#0284C7] dark:fill-[#38BDF8] font-mono text-[8.5px] font-bold"
        >
          {data.sheetWidthMm} × {data.sheetLengthMm} mm • #{data.thicknessMm.toFixed(1)}mm • TEMPO {data.cutTimeMin} min
        </text>
        <text
          x="342"
          y="18"
          textAnchor="end"
          className="fill-[#059669] dark:fill-[#10B981] font-mono text-[10px] font-bold"
        >
          R$ {data.totalCostBrl.toFixed(2).replace(".", ",")}
        </text>
      </g>
    </svg>
  );
}

/* =========================================================================
   COMPONENTE PRINCIPAL — VITRINE INTERATIVA DOS 3 PILARES DO CALDRA
   3 Zonas Empilhadas com Separação Flexível Estrita (Zero Sobreposição)
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
  const [isTabLayerVisible, setIsTabLayerVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const containerRef = useRef<HTMLElement | null>(null);
  const sceneStartRef = useRef<number>(0);

  // Calcula os dados de demonstração em sandbox isolado uma única vez
  const chamferSandbox = useMemo(() => runChamferSandboxDemo(), []);
  const boilermakingSandbox = useMemo(() => runBoilermakingSandboxDemo(), []);
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
    if (!el || typeof document === "undefined") return;

    const checkTabLayerVisibility = () => {
      const tabLayer = el.closest("#tab-layer-inicio") as HTMLElement | null;
      const keepAliveRoot = el.closest("#caldra-main-tabs-keepalive") as HTMLElement | null;
      const tabVisible = !tabLayer || tabLayer.getAttribute("data-visible") !== "false";
      const rootVisible = !keepAliveRoot || keepAliveRoot.getAttribute("data-visible") !== "false";
      setIsTabLayerVisible(tabVisible && rootVisible);
    };

    checkTabLayerVisibility();

    if (typeof MutationObserver !== "undefined") {
      const tabLayer = el.closest("#tab-layer-inicio");
      const keepAliveRoot = el.closest("#caldra-main-tabs-keepalive");
      const mutObs = new MutationObserver(checkTabLayerVisibility);
      if (tabLayer) {
        mutObs.observe(tabLayer, { attributes: true, attributeFilter: ["data-visible", "style", "data-active"] });
      }
      if (keepAliveRoot) {
        mutObs.observe(keepAliveRoot, { attributes: true, attributeFilter: ["data-visible", "style", "aria-hidden"] });
      }
      return () => mutObs.disconnect();
    }
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

  const isRunning = isInViewport && isDocVisible && isTabLayerVisible;

  // Loop contínuo sincronizando progresso de 5.5s por pilar e avanço automático
  useEffect(() => {
    if (!isRunning) return;
    if (prefersReducedMotion) {
      setSceneProgress(0.88);
      const slowTimer = window.setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % CALDRA_THREE_PILLARS.length);
      }, PILLAR_DURATION_MS);
      return () => window.clearInterval(slowTimer);
    }

    let rafId = 0;
    sceneStartRef.current = performance.now() - sceneProgress * PILLAR_DURATION_MS;

    const tick = (now: number) => {
      const elapsed = now - sceneStartRef.current;
      if (elapsed >= PILLAR_DURATION_MS) {
        sceneStartRef.current = now;
        setSceneProgress(0);
        setActiveIndex((prev) => (prev + 1) % CALDRA_THREE_PILLARS.length);
      } else {
        const rawP = elapsed / PILLAR_DURATION_MS;
        const quantized = Math.round(rawP * 100) / 100;
        setSceneProgress((prev) => (Math.abs(prev - quantized) >= 0.01 ? quantized : prev));
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, prefersReducedMotion, activeIndex]);

  const currentPillar =
    CALDRA_THREE_PILLARS[activeIndex] ?? CALDRA_THREE_PILLARS[0]!;

  // Selecionar diretamente um dos 3 Pilares no topo (Zona A)
  const handleSelectPillar = useCallback(
    (index: number, e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      triggerHaptic("tap");
      sceneStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
      setSceneProgress(0);
      setActiveIndex(index);
    },
    [],
  );

  // Acionamento do CTA ou do Palco abre o módulo real correspondente com a peça demonstrada
  const handlePillarCtaActivation = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();
      triggerHaptic("selection");
      AudioManager.play("ui_pop");

      const target = prepareInstantPlaygroundForScene(currentPillar.id);

      startTransition(() => {
        void navigate(target as any);
      });
    },
    [currentPillar.id, navigate],
  );

  return (
    <section
      ref={containerRef}
      aria-label={`${currentPillar.title} — ${currentPillar.ctaLabel}`}
      data-testid="home-cinematic-hero"
      data-active-scene={currentPillar.id}
      className={cn(
        "caldra-hero relative flex w-full flex-col justify-between overflow-hidden rounded-2xl p-3 sm:p-3.5 shadow-xl select-none",
        className,
      )}
    >
      {/* =====================================================================
          ZONA A — SELETOR SUPERIOR DOS 3 PILARES (IDENTIDADE IMEDIATA DO APP)
          Avança automaticamente a cada 5.5s com barra fina de progresso
          ===================================================================== */}
      <div
        role="tablist"
        aria-label="Pilares do CALDRA"
        className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-300/70 dark:border-slate-800/90 bg-slate-200/75 dark:bg-[#080C14]/90 p-1"
      >
        {CALDRA_THREE_PILLARS.map((pillar, idx) => {
          const isActive = idx === activeIndex;
          const isCompleted = idx < activeIndex;
          const fillPct = isActive
            ? Math.round(clamp01(sceneProgress) * 100)
            : isCompleted
              ? 100
              : 0;

          return (
            <button
              key={pillar.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`home-pillar-tab-${idx}`}
              onClick={(e) => handleSelectPillar(idx, e)}
              className={cn(
                "relative flex flex-col justify-between overflow-hidden rounded-lg px-2 pt-1.5 pb-2 text-left transition-all cursor-pointer focus:outline-none",
                isActive
                  ? "bg-white dark:bg-[#131C2E] text-slate-950 dark:text-white shadow-sm border border-amber-500/40"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent",
              )}
            >
              <span className="flex items-center justify-center gap-1 font-mono text-[10px] sm:text-[11px] font-bold tracking-tight whitespace-nowrap">
                {idx === 0 && (
                  <Compass
                    className={cn(
                      "size-3 shrink-0",
                      isActive ? "text-sky-500" : "text-slate-400 dark:text-slate-500",
                    )}
                  />
                )}
                {idx === 1 && (
                  <Flame
                    className={cn(
                      "size-3 shrink-0",
                      isActive ? "text-amber-500" : "text-slate-400 dark:text-slate-500",
                    )}
                  />
                )}
                {idx === 2 && (
                  <Zap
                    className={cn(
                      "size-3 shrink-0",
                      isActive ? "text-emerald-500" : "text-slate-400 dark:text-slate-500",
                    )}
                  />
                )}
                <span>
                  {pillar.tabNumber} {pillar.tabLabel}
                </span>
              </span>

              {/* Barra fina de progresso de 5.5s embutida na base da aba */}
              <span className="absolute inset-x-1.5 bottom-0.5 h-[2px] overflow-hidden rounded-full bg-slate-300/60 dark:bg-slate-800">
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-75",
                    isActive
                      ? "bg-[#F59E0B]"
                      : isCompleted
                        ? "bg-amber-500/50"
                        : "bg-transparent",
                  )}
                  style={{ width: `${fillPct}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          ZONA B — CABEÇALHO COMPLETO (SEM TRUNCAMENTO) + PALCO TÉCNICO CENTRAL
          ===================================================================== */}
      <div
        role="button"
        tabIndex={0}
        onClick={handlePillarCtaActivation}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlePillarCtaActivation(e);
          }
        }}
        className="mt-2.5 flex flex-col cursor-pointer group/stage focus:outline-none"
      >
        {/* Título e Subtítulo completos (sem cortar com ...) */}
        <div className="px-0.5 pb-2">
          <h2
            data-testid="home-cinematic-title"
            className="font-display text-[15px] sm:text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight"
          >
            {currentPillar.title}
          </h2>
          <p
            data-testid="home-cinematic-subtitle"
            className="mt-0.5 text-[11.5px] sm:text-[12px] font-normal leading-snug text-slate-600 dark:text-slate-300"
          >
            {currentPillar.subtitle}
          </p>
        </div>

        {/* Palco Gráfico Vetorial Limpo */}
        <div className="relative h-[148px] xs:h-[156px] sm:h-[168px] w-full overflow-hidden rounded-xl border border-slate-300/75 dark:border-slate-800/90 bg-slate-100/75 dark:bg-[#080D18]">
          {CALDRA_THREE_PILLARS.map((pillar, idx) => {
            const isActive = idx === activeIndex;
            const activeProg = isActive ? sceneProgress : 0;
            return (
              <div
                key={pillar.id}
                aria-hidden={!isActive}
                className={cn(
                  "absolute inset-0 size-full transition-all duration-300 ease-out",
                  isActive
                    ? "opacity-100 scale-100 z-10"
                    : "opacity-0 scale-[1.01] pointer-events-none z-0",
                )}
              >
                {pillar.id === "chamfer-cad" && (
                  <SceneChamferCadUnified progress={activeProg} data={chamferSandbox} />
                )}
                {pillar.id === "caldeiraria-tracagem" && (
                  <SceneBoilermakingUnified progress={activeProg} data={boilermakingSandbox} />
                )}
                {pillar.id === "preparacao-fabricacao" && (
                  <SceneManufacturingPrepUnified progress={activeProg} data={fabricationSandbox} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          ZONA C — RODAPÉ TÉCNICO BIPARTIDO (FLEXBOX ANTI-COLISÃO — ZERO SOBREPOSIÇÃO)
          display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px
          ===================================================================== */}
      <div className="flex items-center justify-between gap-[10px] pt-[10px]">
        {/* Lado Esquerdo (flex: 1; min-width: 0): Pílula técnica escura/translúcida em 1 linha */}
        <div
          data-testid="home-cinematic-telemetry"
          className="flex-1 min-w-0 truncate rounded-lg border border-slate-300/80 dark:border-slate-700/80 bg-slate-900/90 dark:bg-[#0B1120]/95 px-2.5 py-1.5 font-mono text-[10px] sm:text-[11px] font-semibold tracking-tight text-sky-300"
        >
          {currentPillar.telemetryPill}
        </div>

        {/* Lado Direito (flex-shrink: 0): Botão CTA Âmbar de alta conversão (height: 36px, padding: 0 14px, border-radius: 999px) */}
        <button
          type="button"
          data-testid="home-cinematic-cta"
          onClick={handlePillarCtaActivation}
          className="shrink-0 inline-flex h-[36px] items-center justify-center rounded-full border border-amber-300/80 bg-[#F59E0B] px-[14px] font-display text-[12px] font-bold tracking-tight text-[#0F172A] shadow-[0_0_14px_rgba(245,158,11,0.35)] hover:bg-amber-400 active:scale-95 transition-all cursor-pointer"
        >
          {currentPillar.ctaLabel}
        </button>
      </div>
    </section>
  );
}
