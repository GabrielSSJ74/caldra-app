/**
 * AURORA CALDRA 5.1 — Ecossistema do Fundo (Luz Viva):
 *  - COSMOS RADIAL (`"suave"`): Calibração Fina High-Energy Radial Core (6 paradas com centro 0.96,
 *    blur 34px, opacidade 0.38 -> 0.78, escala 0.78 -> 2.25, velocidades intermediárias calibradas
 *    +85% de impulso na massa prioritária, priorityPhase += 0.095 * dt, lerp 2.0 * dt, colorSpeed = 0.062 rad/s).
 *  - ORBES VIVOS (`"fluido"`): Perfil lento contemplativo preservado (5 paradas com centro 0.80,
 *    blur 42px, opacidade 0.22 -> 0.56, escala 0.72 -> 2.25, velocidades lentas +65% de impulso,
 *    priorityPhase += 0.055 * dt, lerp 1.2 * dt, colorSpeed = 0.035 rad/s).
 *
 * Arquitetura 100% Anti-Piscada Mantida:
 *  - `IsolatedAuroraViewport` com `React.memo(..., () => true)` (jamais re-renderiza pelo React).
 *  - Único loop `requestAnimationFrame` + `useRef` + Acumuladores de Fase Incremental (`deltaTime`).
 */

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useAIProcessing } from "@/lib/ai/aiProcessingContext";

/**
 * Curva de Gradiente Radial High-Energy de 6 Paradas do COSMOS RADIAL:
 * 0% (0.96) -> 18% (0.82) -> 36% (0.56) -> 58% (0.28) -> 78% (0.09) -> 100% (0.00 transparent).
 */
export const COSMOS_RADIAL_6_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.96],
  [0.18, 0.82],
  [0.36, 0.56],
  [0.58, 0.28],
  [0.78, 0.09],
  [1.0, 0.0],
];

/**
 * Decaimento Gaussiano Suave de 5 Paradas (preservado para ORBES VIVOS):
 * 0% (0.80) -> 25% (0.55) -> 50% (0.28) -> 75% (0.09) -> 100% (0.00 transparent).
 */
export const RADIAL_CORE_5_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.8],
  [0.25, 0.55],
  [0.5, 0.28],
  [0.75, 0.09],
  [1.0, 0.0],
];

/**
 * Curva Gaussiana de 10 Paradas (mantida exportada para compatibilidade):
 */
export const LIQUID_SILK_10_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 1.0],
  [0.15, 0.9],
  [0.3, 0.74],
  [0.45, 0.54],
  [0.6, 0.34],
  [0.75, 0.17],
  [0.88, 0.06],
  [0.95, 0.015],
  [0.98, 0.004],
  [1.0, 0.0],
];

export interface AutonomousColorOrbSpec {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly primaryRgb: readonly [number, number, number];
  readonly secondaryRgb: readonly [number, number, number];
  /** Velocidade angular base individual calibrada do COSMOS RADIAL no eixo X (rad/s) */
  readonly baseSpeedX: number;
  /** Velocidade angular base individual calibrada do COSMOS RADIAL no eixo Y (rad/s) */
  readonly baseSpeedY: number;
  /** Velocidade angular de transição cromática do COSMOS RADIAL (0.062 rad/s) */
  readonly colorSpeed: number;
  /** Velocidades preservadas para o modo ORBES VIVOS ("fluido") */
  readonly orbesVivosSpeedX: number;
  readonly orbesVivosSpeedY: number;
  readonly orbesVivosColorSpeed: number;
  /** Duração nominal de referência em segundos */
  readonly driftDurationSec: number;
  readonly presenceDurationSec: number;
  /** Defasagem de fase harmônica φ_k = k * (2π / 7) */
  readonly phaseRad: number;
  readonly cssClass: string;
}

const TWO_PI_OVER_7 = (Math.PI * 2) / 7;

export const AUTONOMOUS_COLOR_ORBS: ReadonlyArray<AutonomousColorOrbSpec> = [
  {
    index: 0,
    id: "crimson",
    name: "Vermelho Carmesim",
    primaryHex: "#E11D48",
    secondaryHex: "#DC2626",
    primaryRgb: [225, 29, 72],
    secondaryRgb: [220, 38, 38],
    baseSpeedX: 0.058,
    baseSpeedY: 0.049,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.032,
    orbesVivosSpeedY: 0.027,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 17,
    presenceDurationSec: 14,
    phaseRad: 0 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-1-crimson",
  },
  {
    index: 1,
    id: "magenta",
    name: "Rosa Magenta",
    primaryHex: "#EC4899",
    secondaryHex: "#DB2777",
    primaryRgb: [236, 72, 153],
    secondaryRgb: [219, 39, 119],
    baseSpeedX: 0.074,
    baseSpeedY: 0.063,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.041,
    orbesVivosSpeedY: 0.035,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 19,
    presenceDurationSec: 16,
    phaseRad: 1 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-2-magenta",
  },
  {
    index: 2,
    id: "cobalt",
    name: "Azul Técnico",
    primaryHex: "#3B82F6",
    secondaryHex: "#2563EB",
    primaryRgb: [59, 130, 246],
    secondaryRgb: [37, 99, 235],
    baseSpeedX: 0.048,
    baseSpeedY: 0.056,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.026,
    orbesVivosSpeedY: 0.031,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 23,
    presenceDurationSec: 18,
    phaseRad: 2 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-3-cobalt",
  },
  {
    index: 3,
    id: "emerald",
    name: "Verde Esmeralda",
    primaryHex: "#10B981",
    secondaryHex: "#14B8A6",
    primaryRgb: [16, 185, 129],
    secondaryRgb: [20, 184, 166],
    baseSpeedX: 0.082,
    baseSpeedY: 0.068,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.046,
    orbesVivosSpeedY: 0.038,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 29,
    presenceDurationSec: 20,
    phaseRad: 3 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-4-emerald",
  },
  {
    index: 4,
    id: "amber",
    name: "Âmbar Ouro",
    primaryHex: "#F59E0B",
    secondaryHex: "#D97706",
    primaryRgb: [245, 158, 11],
    secondaryRgb: [217, 119, 6],
    baseSpeedX: 0.052,
    baseSpeedY: 0.044,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.029,
    orbesVivosSpeedY: 0.024,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 31,
    presenceDurationSec: 22,
    phaseRad: 4 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-5-amber",
  },
  {
    index: 5,
    id: "violet",
    name: "Roxo Violeta",
    primaryHex: "#A855F7",
    secondaryHex: "#8B5CF6",
    primaryRgb: [168, 85, 247],
    secondaryRgb: [139, 92, 246],
    baseSpeedX: 0.067,
    baseSpeedY: 0.076,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.037,
    orbesVivosSpeedY: 0.042,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 37,
    presenceDurationSec: 24,
    phaseRad: 5 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-6-violet",
  },
  {
    index: 6,
    id: "cyan",
    name: "Ciano Boreal",
    primaryHex: "#06B6D4",
    secondaryHex: "#0EA5E9",
    primaryRgb: [6, 182, 212],
    secondaryRgb: [14, 165, 233],
    baseSpeedX: 0.043,
    baseSpeedY: 0.051,
    colorSpeed: 0.062,
    orbesVivosSpeedX: 0.023,
    orbesVivosSpeedY: 0.028,
    orbesVivosColorSpeed: 0.035,
    driftDurationSec: 41,
    presenceDurationSec: 26,
    phaseRad: 6 * TWO_PI_OVER_7,
    cssClass: "aurora-orb-7-cyan",
  },
];

const PALETTE_RGB: ReadonlyArray<readonly [number, number, number]> = AUTONOMOUS_COLOR_ORBS.map(
  (o) => o.primaryRgb,
);

/**
 TRÍADES TRI-TONAIS PARA O MODO OPCIONAL "USAR COR DE DESTAQUE" NOS ORBES:
 * Distribuídas ao longo das 7 massas respeitando a hierarquia física:
 * - Primária (predominante) -> Intermediária (transição/luz) -> Final (profundidade/reflexo)
 */
export const ACCENT_TRIAD_PALETTES_RGB: Record<
  "crimson" | "blue" | "amber" | "default",
  ReadonlyArray<readonly [number, number, number]>
> = {
  // 1.1 Vermelho Carmesim: #D61818 (primária) -> #E51A4C (intermediária) -> #C11034 (final denso)
  crimson: [
    [214, 24, 24], // #D61818 (Primária)
    [229, 26, 76], // #E51A4C (Intermediária)
    [214, 24, 24], // #D61818 (Primária)
    [193, 16, 52], // #C11034 (Final)
    [214, 24, 24], // #D61818 (Primária)
    [229, 26, 76], // #E51A4C (Intermediária)
    [193, 16, 52], // #C11034 (Final)
  ],
  // 1.2 Azul: #003471 (primária profunda) -> #00A8FF (intermediária luminosa) -> #2CA5D6 (final reflexo)
  blue: [
    [0, 52, 113], // #003471 (Primária)
    [0, 168, 255], // #00A8FF (Intermediária)
    [0, 52, 113], // #003471 (Primária)
    [44, 165, 214], // #2CA5D6 (Final)
    [0, 52, 113], // #003471 (Primária)
    [0, 168, 255], // #00A8FF (Intermediária)
    [44, 165, 214], // #2CA5D6 (Final)
  ],
  // 1.3 Âmbar Material: #D16002 (primária mel escuro) -> #8A3300 (densidade conhaque) -> #F7941D (reflexo dourado)
  amber: [
    [209, 96, 2], // #D16002 (Primária)
    [138, 51, 0], // #8A3300 (Secundária/Densidade)
    [209, 96, 2], // #D16002 (Primária)
    [247, 148, 29], // #F7941D (Final/Reflexo)
    [209, 96, 2], // #D16002 (Primária)
    [138, 51, 0], // #8A3300 (Secundária/Densidade)
    [247, 148, 29], // #F7941D (Final/Reflexo)
  ],
  // Neutro / Monocromático: Prata-titânio tri-tonal
  default: [
    [100, 116, 139], // #64748B
    [148, 163, 184], // #94A3B8
    [100, 116, 139], // #64748B
    [71, 85, 105], // #475569
    [100, 116, 139], // #64748B
    [148, 163, 184], // #94A3B8
    [71, 85, 105], // #475569
  ],
};

/**
 * Interpolação linear suave entre duas cores RGB (`lerpRGB`).
 */
export function lerpRGB(
  c1: readonly [number, number, number],
  c2: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * clamped),
    Math.round(c1[1] + (c2[1] - c1[1]) * clamped),
    Math.round(c1[2] + (c2[2] - c1[2]) * clamped),
  ];
}

/**
 * Resolve a cor RGB contínua ao longo do anel das 7 cores originais da paleta a partir de `colorPhase`.
 */
export function resolveContinuousPaletteRGB(colorPhase: number): [number, number, number] {
  const n = PALETTE_RGB.length;
  const wrapped = ((colorPhase % n) + n) % n;
  const idx0 = Math.floor(wrapped);
  const idx1 = (idx0 + 1) % n;
  const frac = wrapped - idx0;
  return lerpRGB(PALETTE_RGB[idx0]!, PALETTE_RGB[idx1]!, frac);
}

/**
 * Resolve a cor RGB contínua ao longo da Tríade de 3 Estágios da Cor de Destaque ativa
 * quando `useAccentInOrbs` está ativado pelo usuário.
 */
export function resolveAccentTriadContinuousRGB(
  colorPhase: number,
  accent: "blue" | "amber" | "crimson" | "magenta" | "default" = "blue",
): [number, number, number] {
  const familyKey: "crimson" | "blue" | "amber" | "default" =
    accent === "crimson" || accent === "magenta"
      ? "crimson"
      : accent === "amber"
        ? "amber"
        : accent === "default"
          ? "default"
          : "blue";
  const ring = ACCENT_TRIAD_PALETTES_RGB[familyKey];
  const n = ring.length;
  const wrapped = ((colorPhase % n) + n) % n;
  const idx0 = Math.floor(wrapped);
  const idx1 = (idx0 + 1) % n;
  const frac = wrapped - idx0;
  return lerpRGB(ring[idx0]!, ring[idx1]!, frac);
}

export interface OrbRuntimeState {
  readonly index: number;
  readonly id: string;
  readonly baseSpeedX: number;
  readonly baseSpeedY: number;
  readonly colorSpeed: number;
  readonly orbesVivosSpeedX: number;
  readonly orbesVivosSpeedY: number;
  readonly orbesVivosColorSpeed: number;
  currentSpeedX: number;
  currentSpeedY: number;
  phaseX: number;
  phaseY: number;
  priorityPhase: number;
  colorPhase: number;
  dominance: number;
  scale: number;
  opacity: number;
  xPct: number;
  yPct: number;
  r: number;
  g: number;
  b: number;
  lastStyleKey: string;
  lastColorModeKey?: string;
  fromRgb?: [number, number, number];
  modeBlend?: number;
}

/**
 * Cria o estado acumulador inicial de uma massa autônoma (calibrado por padrão para COSMOS RADIAL).
 */
export function createInitialOrbRuntimeState(
  orb: AutonomousColorOrbSpec,
  styleMode: "suave" | "fluido" = "suave",
): OrbRuntimeState {
  const isCosmosRadial = styleMode === "suave";
  const initialPriorityPhase = Math.PI * 0.5 - orb.phaseRad;
  const rawDom = Math.max(0, Math.sin(initialPriorityPhase));
  const dominance = rawDom * rawDom * (3 - 2 * rawDom);

  const bx = isCosmosRadial ? orb.baseSpeedX : orb.orbesVivosSpeedX;
  const by = isCosmosRadial ? orb.baseSpeedY : orb.orbesVivosSpeedY;
  const boost = isCosmosRadial ? 0.85 : 0.65;
  const minScale = isCosmosRadial ? 0.78 : 0.72;
  const minOpacity = isCosmosRadial ? 0.38 : 0.22;
  const maxOpacity = isCosmosRadial ? 0.78 : 0.56;

  const currentSpeedX = bx * (1.0 + boost * dominance);
  const currentSpeedY = by * (1.0 + boost * dominance);
  const phaseX = orb.phaseRad + orb.index * 0.45;
  const phaseY = orb.phaseRad * 1.61803398875 + 0.85;
  const colorPhase = orb.index;
  const [r, g, b] = resolveContinuousPaletteRGB(colorPhase);
  const scale = minScale + (2.25 - minScale) * dominance;
  const opacity = minOpacity + (maxOpacity - minOpacity) * dominance;
  const xPct = 50 + 30 * Math.sin(phaseX) + 12 * Math.cos(phaseY * 0.73 + orb.index);
  const yPct = 50 + 28 * Math.cos(phaseY) + 12 * Math.sin(phaseX * 0.67 + orb.index);

  return {
    index: orb.index,
    id: orb.id,
    baseSpeedX: orb.baseSpeedX,
    baseSpeedY: orb.baseSpeedY,
    colorSpeed: orb.colorSpeed,
    orbesVivosSpeedX: orb.orbesVivosSpeedX,
    orbesVivosSpeedY: orb.orbesVivosSpeedY,
    orbesVivosColorSpeed: orb.orbesVivosColorSpeed,
    currentSpeedX,
    currentSpeedY,
    phaseX,
    phaseY,
    priorityPhase: initialPriorityPhase,
    colorPhase,
    dominance,
    scale,
    opacity,
    xPct,
    yPct,
    r,
    g,
    b,
    lastStyleKey: "",
    lastColorModeKey: "original",
    fromRgb: [r, g, b],
    modeBlend: 1,
  };
}

/**
 * Avança o estado de uma massa por um incremento `dt` (em segundos) usando exclusivamente
 * acumuladores de fase incremental (zero piscadas e zero saltos quando a velocidade muda).
 * - Quando `useAccentInOrbs === false` (padrão): usa as 7 cores originais.
 * - Quando `useAccentInOrbs === true`: usa a tríade de 3 estágios da Cor de Destaque ativa
 *   com derretimento suave (`lerpRGB`) ao alternar entre modos.
 */
export function stepOrbRuntimeState(
  orb: OrbRuntimeState,
  rawDtSec: number,
  styleMode: "suave" | "fluido" = "suave",
  useAccentInOrbs = false,
  accentColor: "blue" | "amber" | "crimson" | "magenta" | "default" = "blue",
): OrbRuntimeState {
  const dt = Math.min(0.033, Math.max(0, rawDtSec));
  const isCosmosRadial = styleMode === "suave";

  const priorityRate = isCosmosRadial ? 0.095 : 0.055;
  const dominanceLerpRate = isCosmosRadial ? 2.0 : 1.2;
  const boostFactor = isCosmosRadial ? 0.85 : 0.65;
  const activeBaseSpeedX = isCosmosRadial ? orb.baseSpeedX : orb.orbesVivosSpeedX;
  const activeBaseSpeedY = isCosmosRadial ? orb.baseSpeedY : orb.orbesVivosSpeedY;
  const activeColorSpeed = isCosmosRadial ? orb.colorSpeed : orb.orbesVivosColorSpeed;
  const minScale = isCosmosRadial ? 0.78 : 0.72;
  const minOpacity = isCosmosRadial ? 0.38 : 0.22;
  const maxOpacity = isCosmosRadial ? 0.78 : 0.56;

  // 1. Onda de prioridade + suavização smoothstep cúbica
  orb.priorityPhase += priorityRate * dt;
  const rawDom = Math.max(0, Math.sin(orb.priorityPhase));
  const targetDominance = rawDom * rawDom * (3 - 2 * rawDom);
  orb.dominance += (targetDominance - orb.dominance) * Math.min(1, dominanceLerpRate * dt);
  orb.dominance = Math.max(0, Math.min(1, orb.dominance));

  // 2. Impulso suave na velocidade exclusiva da massa dominante (+85% no Cosmos Radial)
  orb.currentSpeedX = activeBaseSpeedX * (1.0 + boostFactor * orb.dominance);
  orb.currentSpeedY = activeBaseSpeedY * (1.0 + boostFactor * orb.dominance);

  // 3. Acumuladores de fase incremental (nunca multiplica tempoTotal * velocidadeAtual)
  orb.phaseX += orb.currentSpeedX * dt;
  orb.phaseY += orb.currentSpeedY * dt;
  orb.colorPhase += activeColorSpeed * dt;

  // 4. Escala (0.78 -> 2.25 no Cosmos Radial) e opacidade (0.38 -> 0.78 no Cosmos Radial)
  orb.scale = minScale + (2.25 - minScale) * orb.dominance;
  orb.opacity = minOpacity + (maxOpacity - minOpacity) * orb.dominance;

  // 5. Trajetória contínua de Lissajous pelo espaço profundo
  orb.xPct = 50 + 30 * Math.sin(orb.phaseX) + 12 * Math.cos(phaseYOffset(orb));
  orb.yPct = 50 + 28 * Math.cos(orb.phaseY) + 12 * Math.sin(phaseXOffset(orb));

  // 6. Transição de cor contínua (`lerpRGB`):
  //    - MODO A (useAccentInOrbs = false): Paleta original de 7 cores
  //    - MODO B (useAccentInOrbs = true): Tríade de 3 estágios da Cor de Destaque ativa
  const currentModeKey = useAccentInOrbs ? `triad:${accentColor}` : "original";
  const targetRgb = useAccentInOrbs
    ? resolveAccentTriadContinuousRGB(orb.colorPhase, accentColor)
    : resolveContinuousPaletteRGB(orb.colorPhase);

  if (orb.lastColorModeKey !== undefined && orb.lastColorModeKey !== currentModeKey) {
    orb.fromRgb = [orb.r, orb.g, orb.b];
    orb.modeBlend = 0;
    orb.lastColorModeKey = currentModeKey;
  } else if (orb.lastColorModeKey === undefined) {
    orb.lastColorModeKey = currentModeKey;
    orb.modeBlend = 1;
  }

  if (orb.modeBlend !== undefined && orb.modeBlend < 1 && orb.fromRgb) {
    orb.modeBlend = Math.min(1, orb.modeBlend + dt * 1.6);
    const tSmooth = orb.modeBlend * orb.modeBlend * (3 - 2 * orb.modeBlend);
    const [r, g, b] = lerpRGB(orb.fromRgb, targetRgb, tSmooth);
    orb.r = r;
    orb.g = g;
    orb.b = b;
  } else {
    orb.r = targetRgb[0];
    orb.g = targetRgb[1];
    orb.b = targetRgb[2];
  }

  return orb;
}

function phaseYOffset(orb: OrbRuntimeState): number {
  return orb.phaseY * 0.73 + orb.index;
}

function phaseXOffset(orb: OrbRuntimeState): number {
  return orb.phaseX * 0.67 + orb.index;
}

export type OpticalHierarchyRole = "protagonist" | "secondary" | "depth";

export interface OrbInstantHierarchyState {
  readonly role: OpticalHierarchyRole;
  readonly dominance: number;
  readonly scale: number;
  readonly opacity: number;
  readonly currentSpeedX: number;
  readonly currentSpeedY: number;
  readonly colorMix: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly xNorm: number;
  readonly yNorm: number;
}

/**
 * Função pura de inspeção para testes unitários em qualquer instante `tSec` (perfil COSMOS RADIAL por padrão).
 */
export function computeOrbOpticalHierarchyState(
  orb: AutonomousColorOrbSpec,
  tSec: number,
  styleMode: "suave" | "fluido" = "suave",
): OrbInstantHierarchyState {
  const isCosmosRadial = styleMode === "suave";
  const priorityRate = isCosmosRadial ? 0.095 : 0.055;
  const boostFactor = isCosmosRadial ? 0.85 : 0.65;
  const activeBaseSpeedX = isCosmosRadial ? orb.baseSpeedX : orb.orbesVivosSpeedX;
  const activeBaseSpeedY = isCosmosRadial ? orb.baseSpeedY : orb.orbesVivosSpeedY;
  const activeColorSpeed = isCosmosRadial ? orb.colorSpeed : orb.orbesVivosColorSpeed;
  const minScale = isCosmosRadial ? 0.78 : 0.72;
  const minOpacity = isCosmosRadial ? 0.38 : 0.22;
  const maxOpacity = isCosmosRadial ? 0.78 : 0.56;

  const priorityPhase = Math.PI * 0.5 - orb.phaseRad + priorityRate * tSec;
  const rawDom = Math.max(0, Math.sin(priorityPhase));
  const dominance = Number((rawDom * rawDom * (3 - 2 * rawDom)).toFixed(4));

  const currentSpeedX = Number((activeBaseSpeedX * (1.0 + boostFactor * dominance)).toFixed(6));
  const currentSpeedY = Number((activeBaseSpeedY * (1.0 + boostFactor * dominance)).toFixed(6));

  const scale = Number((minScale + (2.25 - minScale) * dominance).toFixed(4));
  const opacity = Number((minOpacity + (maxOpacity - minOpacity) * dominance).toFixed(4));

  let role: OpticalHierarchyRole;
  if (dominance >= 0.75) {
    role = "protagonist";
  } else if (dominance >= 0.15) {
    role = "secondary";
  } else {
    role = "depth";
  }

  const phaseX = orb.phaseRad + orb.index * 0.45 + activeBaseSpeedX * tSec;
  const phaseY = orb.phaseRad * 1.61803398875 + 0.85 + activeBaseSpeedY * tSec;
  const xPct = Number(
    (50 + 30 * Math.sin(phaseX) + 12 * Math.cos(phaseY * 0.73 + orb.index)).toFixed(3),
  );
  const yPct = Number(
    (50 + 28 * Math.cos(phaseY) + 12 * Math.sin(phaseX * 0.67 + orb.index)).toFixed(3),
  );

  const colorPhase = orb.index + activeColorSpeed * tSec;
  const [r, g, b] = resolveContinuousPaletteRGB(colorPhase);
  const colorMix = Number((colorPhase % 1).toFixed(4));

  return {
    role,
    dominance,
    scale,
    opacity,
    currentSpeedX,
    currentSpeedY,
    colorMix,
    r,
    g,
    b,
    xPct,
    yPct,
    xNorm: Number((xPct / 100).toFixed(5)),
    yNorm: Number((yPct / 100).toFixed(5)),
  };
}

function applyRadialStops(
  grad: CanvasGradient,
  stops: ReadonlyArray<readonly [number, number]>,
  r: number,
  g: number,
  b: number,
  baseAlpha: number,
) {
  for (let i = 0; i < stops.length; i++) {
    const [offset, stopAlpha] = stops[i]!;
    const a = Math.max(0, Math.min(1, baseAlpha * stopAlpha));
    grad.addColorStop(offset, `rgba(${r}, ${g}, ${b}, ${a.toFixed(5)})`);
  }
}

const ORB_SPRITE_SIZE = 340;
const veilSpriteCache = new Map<string, HTMLCanvasElement>();

let auroraSpriteHits = 0;
let auroraSpriteMisses = 0;

export function getAuroraEngineTelemetry() {
  const total = auroraSpriteHits + auroraSpriteMisses;
  return {
    spriteCacheSize: veilSpriteCache.size,
    spriteHits: auroraSpriteHits,
    spriteMisses: auroraSpriteMisses,
    hitRatePercent: total > 0 ? Math.round((auroraSpriteHits / total) * 100) : 100,
    autonomousOrbCount: AUTONOMOUS_COLOR_ORBS.length,
  };
}

function getOrCreateOrbSprite(
  r: number,
  g: number,
  b: number,
  isCosmosRadial: boolean,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const qr = Math.min(255, Math.round(r / 4) * 4);
  const qg = Math.min(255, Math.round(g / 4) * 4);
  const qb = Math.min(255, Math.round(b / 4) * 4);
  const key = `${isCosmosRadial ? "cr6" : "ov5"}:${qr},${qg},${qb}`;
  const existing = veilSpriteCache.get(key);
  if (existing) {
    auroraSpriteHits += 1;
    return existing;
  }

  if (veilSpriteCache.size > 128) {
    const firstKey = veilSpriteCache.keys().next().value;
    if (firstKey) veilSpriteCache.delete(firstKey);
  }

  auroraSpriteMisses += 1;
  const sprite = document.createElement("canvas");
  sprite.width = ORB_SPRITE_SIZE;
  sprite.height = ORB_SPRITE_SIZE;
  const sCtx = sprite.getContext("2d");
  if (!sCtx) return null;

  const half = ORB_SPRITE_SIZE * 0.5;
  const grad = sCtx.createRadialGradient(half, half, 0, half, half, half);
  const stops = isCosmosRadial ? COSMOS_RADIAL_6_STOPS : RADIAL_CORE_5_STOPS;
  applyRadialStops(grad, stops, qr, qg, qb, 1.0);
  sCtx.fillStyle = grad;
  sCtx.beginPath();
  sCtx.arc(half, half, half, 0, Math.PI * 2);
  sCtx.fill();

  veilSpriteCache.set(key, sprite);
  return sprite;
}

function drawRadialOrbOnCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  baseAlpha: number,
  isCosmosRadial: boolean,
) {
  if (baseAlpha <= 0.001 || radius <= 1) return;
  const clampedAlpha = Math.max(0, Math.min(1, baseAlpha));
  const sprite = getOrCreateOrbSprite(r, g, b, isCosmosRadial);

  ctx.save();
  ctx.translate(cx, cy);

  if (sprite && typeof ctx.drawImage === "function") {
    ctx.globalAlpha = clampedAlpha;
    ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
    ctx.restore();
    return;
  }

  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  const stops = isCosmosRadial ? COSMOS_RADIAL_6_STOPS : RADIAL_CORE_5_STOPS;
  applyRadialStops(grad, stops, r, g, b, clampedAlpha);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visible;
}

function useDarkSurface() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function useAmoledSurface() {
  const [amoled, setAmoled] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setAmoled(el.classList.contains("amoled"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return amoled;
}

/**
 * Estágio DOM + Canvas 100% isolado com `React.memo(..., () => true)`.
 * Jamais sofre re-renderização pelo React: todo o movimento e cor são aplicados
 * exclusivamente pelo motor `requestAnimationFrame` via `useRef`.
 */
const IsolatedAuroraViewport = React.memo(
  function IsolatedAuroraViewport({
    canvasRef,
    orbRefs,
  }: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    orbRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  }) {
    return (
      <>
        <canvas
          ref={canvasRef}
          className="aurora-canvas block size-full pointer-events-none"
          style={{ width: "100%", height: "100%", imageRendering: "auto" }}
        />
        <div className="aurora-autonomous-orb-stage">
          {AUTONOMOUS_COLOR_ORBS.map((orb) => (
            <div
              key={orb.id}
              ref={(el) => {
                orbRefs.current[orb.index] = el;
              }}
              data-orb-id={orb.id}
              data-orb-index={orb.index + 1}
              className={cn("aurora-autonomous-orb", orb.cssClass)}
            />
          ))}
        </div>
      </>
    );
  },
  () => true,
);

export const AuroraBackground = React.memo(function AuroraBackground({
  mode = "auto",
  active = true,
  className,
}: {
  mode?: "auto" | "always";
  active?: boolean;
  className?: string;
}) {
  const { auroraStyle, accent, useAccentInOrbs } = useSettings();
  const { isMestre } = useFeatureAccess();
  const pageVisible = usePageVisible();
  const darkSurface = useDarkSurface();
  const amoledSurface = useAmoledSurface();
  const { isProcessing, isContinuous } = useAIProcessing();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orbRefs = useRef<Array<HTMLDivElement | null>>([]);
  const orbRuntimeRef = useRef<OrbRuntimeState[]>(
    AUTONOMOUS_COLOR_ORBS.map((orb) => createInitialOrbRuntimeState(orb, "suave")),
  );

  /* Mantém qual estilo renderizar durante os 650ms de fade-out ao alternar para "padrao" */
  const [renderedStyle, setRenderedStyle] = useState<"fluido" | "suave">(
    auroraStyle === "fluido" ? "fluido" : "suave",
  );
  useEffect(() => {
    if (auroraStyle === "fluido" || auroraStyle === "suave") {
      setRenderedStyle(auroraStyle);
    }
  }, [auroraStyle]);

  /* O motor das 7 massas radiais autônomas permanece 100% intocado para COSMOS RADIAL ("suave").
     Quando AURORA LÍQUIDA ("fluido") está ativa, o shader WebGL (<AuroraLiquidShader />) assume a cena. */
  const isAuroraVisible = active && auroraStyle === "suave";
  const [pausedAfterFade, setPausedAfterFade] = useState(!isAuroraVisible);

  useEffect(() => {
    if (!active) {
      setPausedAfterFade(true);
      return;
    }
    if (isAuroraVisible) {
      setPausedAfterFade(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPausedAfterFade(true);
    }, 660);
    return () => window.clearTimeout(timer);
  }, [active, isAuroraVisible]);

  const shaderStyle = renderedStyle === "fluido";
  const aiBoostActive = isProcessing || isContinuous;
  const allowed =
    mode === "always" || isMestre || renderedStyle === "fluido" || renderedStyle === "suave";
  const animated = active && allowed && (isAuroraVisible || !pausedAfterFade) && pageVisible;

  // Referência mutável lida pelo loop único de requestAnimationFrame (evita reiniciar o loop!)
  const liveConfigRef = useRef({
    active,
    shaderStyle,
    animated,
    darkSurface,
    amoledSurface,
    aiBoostActive,
    accent,
    useAccentInOrbs,
  });
  liveConfigRef.current = {
    active,
    shaderStyle,
    animated,
    darkSurface,
    amoledSurface,
    aiBoostActive,
    accent,
    useAccentInOrbs,
  };

  // Loop único e permanente de 60 FPS: nunca reinicia nem pisca durante navegação ou carrossel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let W = Math.max(1, window.innerWidth);
    let H = Math.max(1, window.innerHeight);

    const syncCanvasResolution = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, window.innerWidth);
      H = Math.max(1, window.innerHeight);
      const targetW = Math.round(W * dpr);
      const targetH = Math.round(H * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    };

    syncCanvasResolution();

    let lastTime = performance.now();
    let rafId = 0;

    const renderFrame = (now: number) => {
      const cfg = liveConfigRef.current;
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.033, Math.max(0, rawDt));

      if (cfg.active && cfg.animated) {
        const styleMode: "suave" | "fluido" = cfg.shaderStyle ? "fluido" : "suave";
        const isCosmosRadial = styleMode === "suave";
        const effectiveDt = cfg.aiBoostActive ? Math.min(0.033, dt * 1.45) : dt;
        const orbs = orbRuntimeRef.current;

        // 1. Atualiza acumuladores de fase incremental de cada uma das 7 massas
        for (let i = 0; i < orbs.length; i++) {
          const orb = orbs[i]!;
          stepOrbRuntimeState(
            orb,
            effectiveDt,
            styleMode,
            cfg.useAccentInOrbs,
            cfg.accent,
          );

          const domEl = orbRefs.current[orb.index];
          if (domEl) {
            domEl.style.transform = `translate3d(calc(${orb.xPct.toFixed(3)}vw - 50%), calc(${orb.yPct.toFixed(3)}vh - 50%), 0) scale(${orb.scale.toFixed(4)})`;
            domEl.style.opacity = orb.opacity.toFixed(4);

            const styleKey = `${styleMode}:${orb.r},${orb.g},${orb.b}`;
            if (orb.lastStyleKey !== styleKey) {
              orb.lastStyleKey = styleKey;
              if (isCosmosRadial) {
                // COSMOS RADIAL: Curva High-Energy de 6 Paradas (0% 0.96 -> 18% 0.82 -> 36% 0.56 -> 58% 0.28 -> 78% 0.09 -> 100% transparent)
                domEl.style.background = `radial-gradient(circle at 50% 50%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.96) 0%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.82) 18%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.56) 36%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.28) 58%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.09) 78%, transparent 100%)`;
              } else {
                // ORBES VIVOS: Curva Gaussiana de 5 Paradas preservada (0% 0.80 -> 25% 0.55 -> 50% 0.28 -> 75% 0.09 -> 100% transparent)
                domEl.style.background = `radial-gradient(circle at 50% 50%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.80) 0%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.55) 25%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.28) 50%, rgba(${orb.r}, ${orb.g}, ${orb.b}, 0.09) 75%, transparent 100%)`;
              }
            }
          }
        }

        // 2. Renderiza base profunda #060911 e massas ordenadas por dominância no Canvas
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = cfg.amoledSurface ? "#020408" : cfg.darkSurface ? "#060911" : "#F3F6FC";
        ctx.fillRect(0, 0, W, H);

        ctx.globalCompositeOperation = cfg.darkSurface ? "screen" : "source-over";
        const minDim = Math.min(W, H);
        // Raio base correspondente ao diâmetro de 44vmin (raio = 22vmin)
        const baseRadius = minDim * 0.22 * (isCosmosRadial ? 1.02 : 1.04);

        const sortedOrbs = [...orbs].sort((a, b) => a.dominance - b.dominance);
        for (let i = 0; i < sortedOrbs.length; i++) {
          const orb = sortedOrbs[i]!;
          const cx = (W * orb.xPct) / 100;
          const cy = (H * orb.yPct) / 100;
          const radius = baseRadius * orb.scale;
          const alpha = orb.opacity * (isCosmosRadial ? 0.82 : 0.65);
          drawRadialOrbOnCanvas(ctx, cx, cy, radius, orb.r, orb.g, orb.b, alpha, isCosmosRadial);
        }

        ctx.globalCompositeOperation = "source-over";
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    const handleResize = () => {
      syncCanvasResolution();
    };

    window.addEventListener("resize", handleResize, { passive: true });
    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cn("aurora-root pointer-events-none fixed inset-0 z-0 overflow-hidden", className)}
      data-aurora-visible={isAuroraVisible ? "true" : "false"}
      data-animated={animated ? "on" : "off"}
      data-active={active ? "on" : "off"}
      data-style={shaderStyle ? "fluido" : "suave"}
      data-orbs-accent={useAccentInOrbs ? "true" : "false"}
      data-processing={aiBoostActive ? "active" : "idle"}
    >
      <IsolatedAuroraViewport canvasRef={canvasRef} orbRefs={orbRefs} />
    </div>
  );
});
