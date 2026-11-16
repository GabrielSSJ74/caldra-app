/**
 * MOTOR VISUAL E SHADER "GÊNESE CALDRA" — MODO ARAME 3D (SPLASH SCREEN SHADER)
 *
 * Replica com fidelidade 1:1 a direção de arte e animação da abertura "Gênese CALDRA"
 * para qualquer peça ou montagem 3D no CHAMFER CAD e nos visualizadores 3D:
 *
 *  1. Linhas Laser Ultra-Finas (0.85px–1.15px) com Gradiente de Luminância por Altura e Ângulo:
 *     - Topo (z ≈ Z_max): Branco-Gelo Ciano Intenso (#F8FAFC -> #BAE6FD, opacity: 0.92)
 *     - Paredes Verticais de Espessura: Gradiente vertical contínuo de #BAE6FD (opacity: 0.75)
 *       no topo até Azul-Aço (#38BDF8, opacity: 0.28) na base
 *     - Base (z ≈ Z_min) e Arestas Ocultas / Traseiras (Raio-X): Linha contínua ultra-fina
 *       (NUNCA tracejada grosseira) em Azul-Safira Translúcido (#60A5FA / #38BDF8, opacity: 0.22)
 *
 *  2. Micro-Pontos de Luz nos Vértices Geométricos ("Genesis Vertex Pinpoints"):
 *     - Tamanho em espaço de tela: 2.5px a 3.5px (sizeAttenuation: false)
 *     - Núcleo Branco Puro (#FFFFFF) com halo Ciano (#38BDF8), AdditiveBlending, depthWrite: false
 *     - Vértices superiores com opacity: 0.90 e inferiores/oclusos com opacity: 0.30
 *
 *  3. Paredes de Cristal Safira Fumê com Gradiente Vertical Suave (GenesisGlassMaterial):
 *     - transparent: true, depthWrite: false, side: DoubleSide, blending: NormalBlending
 *     - Gradiente vertical + Fresnel nas paredes laterais/verticais (#1E3A5F -> #38BDF8)
 *       com opacity: 0.16 perto da aresta superior decaindo suavemente para opacity: 0.03 na base,
 *       enquanto faces horizontais planas ficam quase transparentes (opacity: 0.04), sem ruído/manchas.
 *
 *  4. Anéis de Compasso Concêntricos e Linhas de Extensão Técnica na Base da Peça:
 *     - Projetados no plano da base (z = Z_min - 0.1mm) sob o centro da peça/montagem:
 *       3 círculos concêntricos ultra-finos (#38BDF8 com opacity: 0.12, 0.08 e 0.05) +
 *       linhas de extensão tangenciais sutis (opacity: 0.09) prolongando os eixos/arestas principais.
 *
 *  5. Animação Viva "Gênese" (650ms cubic-bezier(0.16, 1, 0.3, 1) + Genesis Living Shimmer):
 *     - Construção progressiva de 650ms ao ativar ARAME (expansão dos anéis base, traçagem
 *       progressiva da base ao topo com brilho na ponta, acendimento dos vértices e fade-in do cristal)
 *     - Pulso óptico contínuo sutil (uTime) oscilando organicamente a luminância entre 0.65 e 1.0.
 */

import * as THREE from "three";

export const GENESIS_CONSTRUCTION_DURATION_MS = 650;

export const GENESIS_PALETTE = {
  obsidianBg: "#141B29",
  topIceWhiteHex: "#F1F5F9",
  topIceCyanHex: "#E2E8F0",
  steelCyanHex: "#93C5FD",
  xraySapphireHex: "#60A5FA",
  xraySteelBlueHex: "#4B83C3",
  deepSapphireWallHex: "#2B4C73",
  satinSteelWallHex: "#345B87",
  pinpointCoreHex: "#E2E8F0",
  pinpointHaloHex: "#93C5FD",
  topEdgeOpacity: 0.88,
  verticalTopOpacity: 0.72,
  verticalBottomOpacity: 0.72,
  baseAndXrayOpacity: 0.45,
  pinpointTopOpacity: 0.35,
  pinpointBottomOpacity: 0.22,
  wallSatinOpacity: 0.22,
  wallMinOpacity: 0.16,
  wallMaxOpacity: 0.26,
  flatFaceOpacity: 0.02,
  compassRingOpacities: [0.12, 0.08, 0.05] as const,
  extensionLineOpacity: 0.09,
} as const;

export interface GenesisBounds3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  radiusXY: number;
  radius3D: number;
}

export interface GenesisConstructionPhaseState {
  /** Progresso global normalizado [0, 1] com curva cubic-bezier(0.16, 1, 0.3, 1) */
  easedProgress: number;
  /** Expansão e fade dos anéis de compasso e linhas de extensão na base [0, 1] */
  ringsProgress: number;
  /** Traçagem progressiva das arestas da base ao topo [0, 1] */
  edgesProgress: number;
  /** Acendimento dos micro-pontos de luz nos vértices [0, 1] */
  pinpointsProgress: number;
  /** Fade-in do véu de cristal safira fumê nas paredes [0, 1] */
  glassProgress: number;
  /** Indica se a fase inicial de construção de 650ms ainda está em curso */
  isConstructing: boolean;
}

/**
 * Avalia uma curva cubic-bezier(x1, y1, x2, y2) para t ∈ [0, 1] usando Newton-Raphson.
 * Usada para a curva canônica da Gênese: cubic-bezier(0.16, 1, 0.3, 1).
 */
export function evaluateCubicBezier(
  t: number,
  x1 = 0.16,
  y1 = 1.0,
  x2 = 0.3,
  y2 = 1.0,
): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 1;

  const sampleCurveX = (u: number) =>
    ((1 - 3 * x2 + 3 * x1) * u * u * u) +
    ((3 * x2 - 6 * x1) * u * u) +
    (3 * x1 * u);
  const sampleCurveY = (u: number) =>
    ((1 - 3 * y2 + 3 * y1) * u * u * u) +
    ((3 * y2 - 6 * y1) * u * u) +
    (3 * y1 * u);
  const sampleCurveDerivativeX = (u: number) =>
    (3 * (1 - 3 * x2 + 3 * x1) * u * u) +
    (2 * (3 * x2 - 6 * x1) * u) +
    3 * x1;

  let u = clamped;
  for (let i = 0; i < 6; i++) {
    const xErr = sampleCurveX(u) - clamped;
    if (Math.abs(xErr) < 1e-5) break;
    const dx = sampleCurveDerivativeX(u);
    if (Math.abs(dx) < 1e-6) break;
    u = Math.max(0, Math.min(1, u - xErr / dx));
  }
  return Math.max(0, Math.min(1, sampleCurveY(u)));
}

/**
 * Calcula os sub-estágios da animação de construção "Gênese" (650ms, cubic-bezier(0.16, 1, 0.3, 1)).
 */
export function computeGenesisConstructionProgress(
  elapsedMs: number,
  durationMs: number = GENESIS_CONSTRUCTION_DURATION_MS,
): GenesisConstructionPhaseState {
  const safeDuration = Math.max(1, durationMs);
  const rawT = Math.max(0, Math.min(1, elapsedMs / safeDuration));
  const easedProgress = evaluateCubicBezier(rawT, 0.16, 1.0, 0.3, 1.0);

  // Sub-fases coreografadas dentro da janela de 650ms
  const ringsProgress = evaluateCubicBezier(Math.min(1, rawT / 0.65), 0.16, 1.0, 0.3, 1.0);
  const edgesProgress = evaluateCubicBezier(
    Math.max(0, Math.min(1, (rawT - 0.06) / 0.86)),
    0.16,
    1.0,
    0.3,
    1.0,
  );
  const pinpointsProgress = evaluateCubicBezier(
    Math.max(0, Math.min(1, (rawT - 0.14) / 0.82)),
    0.16,
    1.0,
    0.3,
    1.0,
  );
  const glassProgress = evaluateCubicBezier(
    Math.max(0, Math.min(1, (rawT - 0.18) / 0.82)),
    0.16,
    1.0,
    0.3,
    1.0,
  );

  return {
    easedProgress,
    ringsProgress,
    edgesProgress,
    pinpointsProgress,
    glassProgress,
    isConstructing: rawT < 1,
  };
}

/**
 * Calcula o fator de cintilação viva ("Genesis Living Shimmer") que oscila organicamente
 * entre 0.65 e 1.0 ao longo do tempo e da coordenada espacial.
 */
export function computeGenesisShimmerFactor(timeSec: number, spatialPhase = 0): number {
  const wave =
    0.5 +
    0.35 * Math.sin(timeSec * 2.4 + spatialPhase) +
    0.15 * Math.cos(timeSec * 1.35 - spatialPhase * 0.7);
  const normalized = Math.max(0, Math.min(1, wave));
  return 0.65 + normalized * 0.35;
}

/**
 * Calcula a caixa delimitadora 3D a partir de posições de arestas [x, y, z, ...].
 */
export function computeGenesisBoundsFromPositions(
  positions: Float32Array | number[],
  fallbackRadius = 60,
): GenesisBounds3D {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX)) {
    return {
      minX: -fallbackRadius,
      minY: -fallbackRadius,
      minZ: 0,
      maxX: fallbackRadius,
      maxY: fallbackRadius,
      maxZ: 10,
      centerX: 0,
      centerY: 0,
      centerZ: 5,
      radiusXY: fallbackRadius,
      radius3D: fallbackRadius,
    };
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);
  const dz = Math.max(0.5, maxZ - minZ);
  const radiusXY = Math.max(12, Math.hypot(dx, dy) * 0.5);
  const radius3D = Math.max(12, Math.hypot(dx, dy, dz) * 0.5);

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    centerX,
    centerY,
    centerZ,
    radiusXY,
    radius3D,
  };
}

export interface GenesisEdgeVertexRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
  /** Papel topológico classificado para inspeção/testes */
  role: "top_edge" | "vertical_wall" | "base_or_xray";
}

/**
 * Calcula a cor e opacidade fiel de um vértice de segmento de aresta no modo ARAME:
 *  - Arestas do Topo (z ≈ Z_max): Branco-Prata Acetinado (#F1F5F9 / #E2E8F0, opacity: 0.88)
 *  - Arestas Verticais da Espessura (conectando topo e base): Azul-Prata Claro (#93C5FD, opacity: 0.72)
 *  - Arestas da Base (z ≈ Z_min) e Arestas Traseiras/Ocultas (Raio-X): Azul-Aço Técnico
 *    (#60A5FA / #4B83C3, opacity: 0.45)
 */
export function computeGenesisEdgeVertexRGBA(opts: {
  z: number;
  otherEndZ: number;
  zMin: number;
  zMax: number;
  radialNorm?: number;
  isXRay?: boolean;
}): GenesisEdgeVertexRGBA {
  const spanZ = Math.max(1e-3, opts.zMax - opts.zMin);
  const tZ = Math.max(0, Math.min(1, (opts.z - opts.zMin) / spanZ));
  const tOtherZ = Math.max(0, Math.min(1, (opts.otherEndZ - opts.zMin) / spanZ));
  const dzNorm = Math.abs(tZ - tOtherZ);
  const radialMix = Math.max(0, Math.min(1, opts.radialNorm ?? 0.35));

  // Cores em RGB normalizado [0, 1]
  // #F1F5F9 -> (0.945, 0.961, 0.976)
  // #E2E8F0 -> (0.886, 0.910, 0.941)
  // #93C5FD -> (0.576, 0.773, 0.992)
  // #60A5FA -> (0.376, 0.647, 0.980)
  // #4B83C3 -> (0.294, 0.514, 0.765)
  if (opts.isXRay) {
    const r = 0.294 + (0.376 - 0.294) * (0.35 + 0.65 * tZ);
    const g = 0.514 + (0.647 - 0.514) * (0.35 + 0.65 * tZ);
    const b = 0.765 + (0.980 - 0.765) * (0.35 + 0.65 * tZ);
    return {
      r,
      g,
      b,
      a: GENESIS_PALETTE.baseAndXrayOpacity,
      role: "base_or_xray",
    };
  }

  // Aresta na face superior (ambas extremidades próximas a Z_max)
  if (tZ >= 0.85 && tOtherZ >= 0.80 && dzNorm < 0.22) {
    const r = 0.945 * (1 - radialMix) + 0.886 * radialMix;
    const g = 0.961 * (1 - radialMix) + 0.910 * radialMix;
    const b = 0.976 * (1 - radialMix) + 0.941 * radialMix;
    return {
      r,
      g,
      b,
      a: GENESIS_PALETTE.topEdgeOpacity,
      role: "top_edge",
    };
  }

  // Aresta na face da base (ambas extremidades próximas a Z_min): Azul-Aço Técnico (#60A5FA / #4B83C3, opacity: 0.45)
  if (tZ <= 0.15 && tOtherZ <= 0.20 && dzNorm < 0.22) {
    const r = 0.376 * 0.65 + 0.294 * 0.35;
    const g = 0.647 * 0.65 + 0.514 * 0.35;
    const b = 0.980 * 0.65 + 0.765 * 0.35;
    return {
      r,
      g,
      b,
      a: GENESIS_PALETTE.baseAndXrayOpacity,
      role: "base_or_xray",
    };
  }

  // Arestas verticais / inclinadas da espessura conectando Topo e Base:
  // Azul-Prata Claro (#93C5FD, opacity: 0.72) com leve transição entre base e topo
  const r = 0.510 + (0.576 - 0.510) * tZ;
  const g = 0.720 + (0.773 - 0.720) * tZ;
  const b = 0.960 + (0.992 - 0.960) * tZ;

  return {
    r,
    g,
    b,
    a: GENESIS_PALETTE.verticalTopOpacity,
    role: "vertical_wall",
  };
}

export interface GenesisPinpointData3D {
  positions: Float32Array;
  heightsNorm: Float32Array;
  baseOpacities: Float32Array;
  phases: Float32Array;
  count: number;
}

/**
 * Extrai APENAS quinas geométricas reais (onde arestas não-colineares se encontram formando
 * quina viva >= 24°, nunca pontos intermediários de curvas suaves!) para renderizar
 * micro-pontos discretos (size: 1.5px, opacity: 0.35, NormalBlending).
 */
export function extractGenesisVertexPinpoints3D(
  edgePositions: Float32Array | number[],
  bounds: GenesisBounds3D,
  maxPoints = 96,
): GenesisPinpointData3D {
  const spanZ = Math.max(1e-3, bounds.maxZ - bounds.minZ);
  const quantStep = Math.max(0.8, bounds.radiusXY * 0.045);
  const invStep = 1 / quantStep;

  interface VertexAccumulator {
    x: number;
    y: number;
    z: number;
    dirs: Array<{ dx: number; dy: number; dz: number }>;
  }

  const seen = new Map<string, VertexAccumulator>();

  const registerEndpoint = (
    x: number,
    y: number,
    z: number,
    ox: number,
    oy: number,
    oz: number,
  ) => {
    const len = Math.hypot(ox - x, oy - y, oz - z);
    if (len < 1e-4) return;
    const dx = (ox - x) / len;
    const dy = (oy - y) / len;
    const dz = (oz - z) / len;

    const qx = Math.round(x * invStep);
    const qy = Math.round(y * invStep);
    const qz = Math.round(z * (1 / Math.max(0.25, spanZ * 0.08)));
    const key = `${qx}:${qy}:${qz}`;
    const existing = seen.get(key);
    if (existing) {
      existing.dirs.push({ dx, dy, dz });
    } else {
      seen.set(key, { x, y, z, dirs: [{ dx, dy, dz }] });
    }
  };

  for (let i = 0; i + 5 < edgePositions.length; i += 6) {
    const x0 = edgePositions[i]!;
    const y0 = edgePositions[i + 1]!;
    const z0 = edgePositions[i + 2]!;
    const x1 = edgePositions[i + 3]!;
    const y1 = edgePositions[i + 4]!;
    const z1 = edgePositions[i + 5]!;
    if (
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(z0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(z1)
    ) {
      continue;
    }
    registerEndpoint(x0, y0, z0, x1, y1, z1);
    registerEndpoint(x1, y1, z1, x0, y0, z0);
  }

  // Filtra SOMENTE quinas geométricas reais (onde há mudança angular real >= 28°, excluindo segmentos suaves de curvas)
  const cosSharpLimit = Math.cos((28 * Math.PI) / 180);
  const sharpCorners: Array<{ x: number; y: number; z: number; deg: number }> = [];

  for (const v of seen.values()) {
    if (v.dirs.length < 2) continue;
    let isSharpCorner = false;
    for (let i = 0; i < v.dirs.length && !isSharpCorner; i++) {
      for (let j = i + 1; j < v.dirs.length; j++) {
        const d1 = v.dirs[i]!;
        const d2 = v.dirs[j]!;
        // Dois segmentos opostos numa curva suave têm dot ≈ -1 (absDot ≈ 1).
        // Uma quina real (ex.: 90° ou aresta vertical encontrando horizontal) tem |dot| <= cos(28°).
        const absDot = Math.abs(d1.dx * d2.dx + d1.dy * d2.dy + d1.dz * d2.dz);
        if (absDot <= cosSharpLimit) {
          isSharpCorner = true;
          break;
        }
      }
    }
    if (isSharpCorner) {
      sharpCorners.push({ x: v.x, y: v.y, z: v.z, deg: v.dirs.length });
    }
  }

  sharpCorners.sort((a, b) => {
    const aTop = a.z >= bounds.maxZ - spanZ * 0.15 ? 1 : 0;
    const bTop = b.z >= bounds.maxZ - spanZ * 0.15 ? 1 : 0;
    if (aTop !== bTop) return bTop - aTop;
    return b.deg - a.deg;
  });

  const selected = sharpCorners.slice(0, maxPoints);
  const count = selected.length;
  const positions = new Float32Array(count * 3);
  const heightsNorm = new Float32Array(count);
  const baseOpacities = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const pt = selected[i]!;
    positions[i * 3] = pt.x;
    positions[i * 3 + 1] = pt.y;
    positions[i * 3 + 2] = pt.z;

    const tZ = Math.max(0, Math.min(1, (pt.z - bounds.minZ) / spanZ));
    heightsNorm[i] = tZ;
    baseOpacities[i] =
      tZ >= 0.75
        ? GENESIS_PALETTE.pinpointTopOpacity
        : GENESIS_PALETTE.pinpointBottomOpacity +
          (GENESIS_PALETTE.pinpointTopOpacity - GENESIS_PALETTE.pinpointBottomOpacity) * tZ;
    phases[i] = ((pt.x - bounds.centerX) * 0.07 + (pt.y - bounds.centerY) * 0.11 + i * 0.53) % (Math.PI * 2);
  }

  return {
    positions,
    heightsNorm,
    baseOpacities,
    phases,
    count,
  };
}

export interface GenesisCompassRingSpec3D {
  radius: number;
  opacity: number;
  positions: Float32Array;
}

export interface GenesisBaseReticleData3D {
  baseZ: number;
  centerX: number;
  centerY: number;
  rings: [GenesisCompassRingSpec3D, GenesisCompassRingSpec3D, GenesisCompassRingSpec3D];
  extensionLinesPositions: Float32Array;
  extensionLinesOpacity: number;
}

/**
 * Constrói os 3 Anéis de Compasso Concêntricos (opacity: 0.12, 0.08 e 0.05) e as
 * Linhas de Extensão Tangenciais/Isométricas (opacity: 0.09) no plano da base da peça
 * (z = Z_min - 0.1mm).
 */
export function buildGenesisBaseReticleData3D(
  bounds: GenesisBounds3D,
  ringSegments = 96,
): GenesisBaseReticleData3D {
  const baseZ = bounds.minZ - 0.1;
  const cx = bounds.centerX;
  const cy = bounds.centerY;
  const baseR = Math.max(18, bounds.radiusXY);

  const ringMultipliers = [0.92, 1.14, 1.38] as const;
  const ringOpacities = GENESIS_PALETTE.compassRingOpacities;

  const makeRingPositions = (radius: number): Float32Array => {
    const arr = new Float32Array(ringSegments * 6);
    let ptr = 0;
    for (let i = 0; i < ringSegments; i++) {
      const a0 = (i / ringSegments) * Math.PI * 2;
      const a1 = ((i + 1) / ringSegments) * Math.PI * 2;
      arr[ptr++] = cx + Math.cos(a0) * radius;
      arr[ptr++] = cy + Math.sin(a0) * radius;
      arr[ptr++] = baseZ;
      arr[ptr++] = cx + Math.cos(a1) * radius;
      arr[ptr++] = cy + Math.sin(a1) * radius;
      arr[ptr++] = baseZ;
    }
    return arr;
  };

  const rings: [GenesisCompassRingSpec3D, GenesisCompassRingSpec3D, GenesisCompassRingSpec3D] = [
    {
      radius: baseR * ringMultipliers[0],
      opacity: ringOpacities[0],
      positions: makeRingPositions(baseR * ringMultipliers[0]),
    },
    {
      radius: baseR * ringMultipliers[1],
      opacity: ringOpacities[1],
      positions: makeRingPositions(baseR * ringMultipliers[1]),
    },
    {
      radius: baseR * ringMultipliers[2],
      opacity: ringOpacities[2],
      positions: makeRingPositions(baseR * ringMultipliers[2]),
    },
  ];

  const extR = baseR * 1.62;
  const halfW = Math.max(8, (bounds.maxX - bounds.minX) * 0.5);
  const halfH = Math.max(8, (bounds.maxY - bounds.minY) * 0.5);

  const segs: number[] = [];
  const pushLine = (x1: number, y1: number, x2: number, y2: number) => {
    segs.push(x1, y1, baseZ, x2, y2, baseZ);
  };

  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  pushLine(cx - extR, cy, cx + extR, cy);
  pushLine(cx, cy - extR, cx, cy + extR);
  pushLine(cx - extR * cos30, cy - extR * sin30, cx + extR * cos30, cy + extR * sin30);
  pushLine(cx - extR * cos30, cy + extR * sin30, cx + extR * cos30, cy - extR * sin30);

  const tangReach = baseR * 1.44;
  pushLine(cx - tangReach, bounds.minY, cx + tangReach, bounds.minY);
  pushLine(cx - tangReach, bounds.maxY, cx + tangReach, bounds.maxY);
  pushLine(bounds.minX, cy - tangReach, bounds.minX, cy + tangReach);
  pushLine(bounds.maxX, cy - tangReach, bounds.maxX, cy + tangReach);

  const diagReach = Math.max(halfW, halfH) * 1.35;
  pushLine(
    bounds.minX - diagReach * 0.4,
    bounds.minY + diagReach * 0.4,
    bounds.minX + diagReach * 0.4,
    bounds.minY - diagReach * 0.4,
  );
  pushLine(
    bounds.maxX - diagReach * 0.4,
    bounds.maxY + diagReach * 0.4,
    bounds.maxX + diagReach * 0.4,
    bounds.maxY - diagReach * 0.4,
  );

  return {
    baseZ,
    centerX: cx,
    centerY: cy,
    rings,
    extensionLinesPositions: new Float32Array(segs),
    extensionLinesOpacity: GENESIS_PALETTE.extensionLineOpacity,
  };
}

/**
 * Cria uma geometria de segmentos de arestas enriquecida com atributos de cor/opacidade
 * por vértice (`aGenesisColor`, `aGenesisAlpha`, `aHeightNorm`, `aPhase`) para o shader ARAME 3D.
 */
export function createGenesisLaserEdgesGeometry(
  positions: Float32Array | number[],
  bounds: GenesisBounds3D,
  isXRay = false,
): THREE.BufferGeometry {
  const posArr = positions instanceof Float32Array ? positions : new Float32Array(positions);
  const vertexCount = Math.floor(posArr.length / 3);
  const colors = new Float32Array(vertexCount * 3);
  const alphas = new Float32Array(vertexCount);
  const heightsNorm = new Float32Array(vertexCount);
  const phases = new Float32Array(vertexCount);

  const spanZ = Math.max(1e-3, bounds.maxZ - bounds.minZ);
  const invRadius = 1 / Math.max(1, bounds.radiusXY);

  for (let i = 0; i + 1 < vertexCount; i += 2) {
    const x0 = posArr[i * 3]!;
    const y0 = posArr[i * 3 + 1]!;
    const z0 = posArr[i * 3 + 2]!;

    const x1 = posArr[(i + 1) * 3]!;
    const y1 = posArr[(i + 1) * 3 + 1]!;
    const z1 = posArr[(i + 1) * 3 + 2]!;

    const r0 = Math.hypot(x0 - bounds.centerX, y0 - bounds.centerY) * invRadius;
    const r1 = Math.hypot(x1 - bounds.centerX, y1 - bounds.centerY) * invRadius;

    const c0 = computeGenesisEdgeVertexRGBA({
      z: z0,
      otherEndZ: z1,
      zMin: bounds.minZ,
      zMax: bounds.maxZ,
      radialNorm: r0,
      isXRay,
    });
    const c1 = computeGenesisEdgeVertexRGBA({
      z: z1,
      otherEndZ: z0,
      zMin: bounds.minZ,
      zMax: bounds.maxZ,
      radialNorm: r1,
      isXRay,
    });

    colors[i * 3] = c0.r;
    colors[i * 3 + 1] = c0.g;
    colors[i * 3 + 2] = c0.b;
    alphas[i] = c0.a;
    heightsNorm[i] = Math.max(0, Math.min(1, (z0 - bounds.minZ) / spanZ));
    phases[i] = (x0 - bounds.centerX) * 0.04 + (y0 - bounds.centerY) * 0.06;

    colors[(i + 1) * 3] = c1.r;
    colors[(i + 1) * 3 + 1] = c1.g;
    colors[(i + 1) * 3 + 2] = c1.b;
    alphas[i + 1] = c1.a;
    heightsNorm[i + 1] = Math.max(0, Math.min(1, (z1 - bounds.minZ) / spanZ));
    phases[i + 1] = (x1 - bounds.centerX) * 0.04 + (y1 - bounds.centerY) * 0.06;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geom.setAttribute("aGenesisColor", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("aGenesisAlpha", new THREE.BufferAttribute(alphas, 1));
  geom.setAttribute("aHeightNorm", new THREE.BufferAttribute(heightsNorm, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  return geom;
}

/**
 * ShaderMaterial para as Linhas Contínuas Finas e Raio-X Contínuo do modo ARAME.
 * Usa THREE.NormalBlending para nunca estourar em branco neon quando linhas se cruzam.
 */
export function createGenesisLaserEdgesMaterial(opts?: {
  isXRay?: boolean;
}): THREE.ShaderMaterial {
  const isXRay = Boolean(opts?.isXRay);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBuildProgress: { value: 1.0 },
      uOpacityScale: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aGenesisColor;
      attribute float aGenesisAlpha;
      attribute float aHeightNorm;
      attribute float aPhase;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vHeightNorm;
      varying float vPhase;

      void main() {
        vColor = aGenesisColor;
        vAlpha = aGenesisAlpha;
        vHeightNorm = aHeightNorm;
        vPhase = aPhase;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBuildProgress;
      uniform float uOpacityScale;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vHeightNorm;
      varying float vPhase;

      void main() {
        // Revelação progressiva da base (0.0) ao topo (1.0) durante os 650ms iniciais
        float revealEdge = clamp(uBuildProgress * 1.18, 0.0, 1.18);
        float revealMask = 1.0 - smoothstep(revealEdge - 0.14, revealEdge + 0.02, vHeightNorm);
        if (revealMask <= 0.005) discard;

        // Variação muito sutil e controlada sem estourar brilho
        float shimmerWave = 0.5 + 0.5 * sin(uTime * 1.8 + vPhase + vHeightNorm * 1.5);
        float shimmer = 0.94 + clamp(shimmerWave, 0.0, 1.0) * 0.06;

        float finalAlpha = clamp(vAlpha * shimmer * revealMask * uOpacityScale, 0.0, 1.0);
        gl_FragColor = vec4(vColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    depthFunc: isXRay ? THREE.GreaterDepth : THREE.LessEqualDepth,
    blending: THREE.NormalBlending,
  });
}

/**
 * Cria a geometria e o ShaderMaterial para os Micro-Pontos Discretos nos Vértices Geométricos Reais:
 *  - Quase imperceptíveis (size: 1.5px, opacity: 0.35, THREE.NormalBlending)
 *  - Posicionados somente nas quinas geométricas reais (nunca em pontos intermediários de curvas)
 */
export function createGenesisVertexPinpointsObject(
  pinpointData: GenesisPinpointData3D,
  dpr = 1,
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pinpointData.positions, 3));
  geom.setAttribute("aHeightNorm", new THREE.BufferAttribute(pinpointData.heightsNorm, 1));
  geom.setAttribute("aBaseOpacity", new THREE.BufferAttribute(pinpointData.baseOpacities, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(pinpointData.phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBuildProgress: { value: 1.0 },
      uDpr: { value: Math.max(1, Math.min(2.0, dpr)) },
    },
    vertexShader: /* glsl */ `
      attribute float aHeightNorm;
      attribute float aBaseOpacity;
      attribute float aPhase;

      uniform float uTime;
      uniform float uBuildProgress;
      uniform float uDpr;

      varying float vOpacity;

      void main() {
        float reveal = smoothstep(aHeightNorm - 0.12, aHeightNorm + 0.08, uBuildProgress * 1.08);
        vOpacity = min(0.35, aBaseOpacity) * reveal;

        // Micro-ponto discreto de 1.5px em espaço de tela
        gl_PointSize = 1.5 * uDpr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vOpacity;

      void main() {
        if (vOpacity <= 0.01) discard;
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;

        float mask = 1.0 - smoothstep(0.35, 1.0, r);
        vec3 col = vec3(0.886, 0.910, 0.941); // #E2E8F0 Branco-Prata Acetinado
        gl_FragColor = vec4(col, clamp(vOpacity * mask, 0.0, 0.35));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geom, mat);
  points.renderOrder = 14;
  points.frustumCulled = false;
  return points;
}

/**
 * Cria o ShaderMaterial para a Espessura da Peça (GenesisGlassMaterial):
 *  - Faces Horizontais (Topo +Z e Base -Z, onde |normal.z| > 0.75):
 *    Quase 100% transparentes (opacity: 0.02), sem névoa leitosa, permitindo ver perfeitamente
 *    o interior e as linhas da base da peça.
 *  - Paredes Verticais / Laterais da Espessura (onde |normal.z| <= 0.75, incluindo paredes externas
 *    e paredes internas de furos/recortes):
 *    Preenchidas com Azul-Aço Petróleo Acetinado (#2B4C73 / #345B87, opacity: 0.22,
 *    THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide) com sombreamento direcional
 *    sutil (opacity variando entre 0.16 e 0.26).
 */
export function createGenesisGlassMaterial(bounds: GenesisBounds3D): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZMin: { value: bounds.minZ },
      uZMax: { value: Math.max(bounds.minZ + 0.5, bounds.maxZ) },
      uBuildProgress: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewPos;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uZMin;
      uniform float uZMax;
      uniform float uBuildProgress;
      uniform float uTime;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewPos;

      void main() {
        vec3 N = normalize(vWorldNormal);
        float absNz = abs(N.z);

        // Sombreamento direcional sutil nas paredes laterais
        vec3 lightDir = normalize(vec3(-0.55, -0.65, 0.52));
        float dirShade = clamp(0.5 + 0.5 * dot(N, lightDir), 0.0, 1.0);

        // Azul-Aço Petróleo Acetinado: #2B4C73 (0.169, 0.298, 0.451) <-> #345B87 (0.204, 0.357, 0.529)
        vec3 steelBlueDark = vec3(0.169, 0.298, 0.451); // #2B4C73
        vec3 steelBlueMid  = vec3(0.204, 0.357, 0.529); // #345B87
        vec3 wallColor = mix(steelBlueDark, steelBlueMid, dirShade);

        if (absNz > 0.75) {
          // Faces Horizontais (Topo +Z e Base -Z): quase 100% transparentes (opacity: 0.02)
          gl_FragColor = vec4(wallColor, 0.02 * uBuildProgress);
        } else {
          // Paredes Verticais / Laterais da Espessura: opacity: 0.22 (variando entre 0.16 e 0.26)
          float wallOpacity = mix(0.16, 0.26, dirShade) * uBuildProgress;
          gl_FragColor = vec4(wallColor, wallOpacity);
        }
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

/**
 * Constrói o grupo Three.js com os 3 Anéis de Compasso Concêntricos e as Linhas de Extensão
 * Tangenciais na base da peça (usado apenas na Splash / referências externas com NormalBlending).
 */
export function createGenesisBaseCompassGroup(
  reticle: GenesisBaseReticleData3D,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "genesis-base-compass-reticle";

  reticle.rings.forEach((ring, idx) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(ring.positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: ring.opacity,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const line = new THREE.LineSegments(geom, mat);
    line.name = `genesis-compass-ring-${idx}`;
    line.userData.baseOpacity = ring.opacity;
    line.renderOrder = 2;
    group.add(line);
  });

  const extGeom = new THREE.BufferGeometry();
  extGeom.setAttribute("position", new THREE.BufferAttribute(reticle.extensionLinesPositions, 3));
  const extMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: reticle.extensionLinesOpacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
  const extLines = new THREE.LineSegments(extGeom, extMat);
  extLines.name = "genesis-compass-extensions";
  extLines.userData.baseOpacity = reticle.extensionLinesOpacity;
  extLines.renderOrder = 1;
  group.add(extLines);

  return group;
}
