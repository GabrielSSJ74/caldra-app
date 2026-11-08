import React, { useEffect, useRef, useState } from "react";
import { useSettings, type AccentColor } from "@/lib/settings/SettingsProvider";
import { useAIProcessing } from "@/lib/ai/aiProcessingContext";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * AURORA CALDRA 2.0 — SHADER WEBGL1 GLSL ("AURORA LÍQUIDA")
 * ============================================================================
 * - Duplo Domain Warping + FBM de 4 Oitavas com Rotação Axial (Inigo Quilez)
 * - Interpolação Quíntica C2 Contínua: f*f*f*(f*(f*6.0-15.0)+10.0)
 * - Film Grain Procedural Anti-Banding no Fragment Shader
 * - Renderização em Meia Resolução (0.5x, teto 1280px) + Degradação Adaptativa (0.35x)
 * - Trava Estrita de 30 FPS (frameInterval = 1000 / 30 = 33.33ms)
 * - Zero Alocação de Memória no Loop requestAnimationFrame
 * - Contexto WebGL1 Persistente no Shell (nunca reinicia ao trocar de aba)
 * ============================================================================
 */

export const AURORA_LIQUID_FPS_CAP = 30;
export const AURORA_LIQUID_FRAME_INTERVAL_MS = 1000 / AURORA_LIQUID_FPS_CAP; // 33.333ms
export const AURORA_LIQUID_DEFAULT_SCALE = 0.5;
export const AURORA_LIQUID_DEGRADED_SCALE = 0.35;
export const AURORA_LIQUID_MAX_BUFFER_DIM = 1280;

export const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_aiIntensity;
uniform float u_exposure;
uniform float u_isLight;

uniform vec3 u_baseA;
uniform vec3 u_baseB;
uniform vec3 u_warm;
uniform vec3 u_warmDeep;
uniform vec3 u_coreA;
uniform vec3 u_coreB;
uniform vec3 u_coolA;
uniform vec3 u_coolB;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Value Noise 2D com interpolação quíntica: f*f*f*(f*(f*6.0-15.0)+10.0)
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// FBM de 4 oitavas com matriz de rotação interna entre oitavas
const mat2 OCTAVE_ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.50;
  v += amp * noise(p);
  p = OCTAVE_ROT * p * 2.02 + vec2(13.1, 7.7);
  amp *= 0.50;

  v += amp * noise(p);
  p = OCTAVE_ROT * p * 2.03 + vec2(5.4, 19.3);
  amp *= 0.50;

  v += amp * noise(p);
  p = OCTAVE_ROT * p * 2.01 + vec2(23.8, 3.9);
  amp *= 0.50;

  v += amp * noise(p);
  return v;
}

void main() {
  vec2 res = max(u_resolution, vec2(1.0));
  vec2 st = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;

  // Coordenadas normalizadas corrigidas por Aspect Ratio (escala estética unificada mobile/desktop)
  vec2 p = (st - 0.5) * vec2(aspect, 1.0) * 2.05;

  float t = u_time;

  // Camada 1 do Domain Warping
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + 0.07 * t),
    fbm(p + vec2(5.2, 1.3) - 0.06 * t)
  );

  // Camada 2 (respiração senoidal orgânica de 95% a 115% e velocidades em proporção irracional/prima)
  float breath = 1.05 + 0.10 * sin(t * 0.55);
  vec2 flow = vec2(
    0.11 * sin(t * 0.37),
    0.09 * cos(t * 0.43)
  ) * (1.0 + 0.35 * u_aiIntensity);

  vec2 r = vec2(
    fbm(p * breath + 3.8 * q + vec2(1.7, 9.2) + flow),
    fbm(p * breath + 3.8 * q + vec2(8.3, 2.8) - flow * 0.8)
  );

  // Campo escalar final deformado
  float f = fbm(p + 3.5 * r);

  // Base profunda radial (centro suavemente iluminado -> bordas profundas)
  float radialDist = length((st - vec2(0.5, 0.46)) * vec2(aspect * 0.85, 1.0));
  vec3 baseCol = mix(u_baseA, u_baseB, smoothstep(0.05, 1.15, radialDist));

  // Zona 1: Equilíbrio Periférico e Cantos Opostos (Índigo / Violeta ou Profundidade da Tríade)
  vec3 coolVeil = mix(u_coolA, u_coolB, smoothstep(0.15, 0.85, r.y));
  float coolMask = smoothstep(0.18, 0.82, length(q) * 0.78 + 0.25 * (1.0 - st.y));

  // Zona 2: Massa Quente Superior / Diagonal (Âmbar / Laranja Queimado ou Primária da Tríade)
  vec3 warmVeil = mix(u_warmDeep, u_warm, smoothstep(0.22, 0.88, f + 0.18 * r.x));
  float warmZone = smoothstep(-0.28, 0.76, (st.y - 0.15) + 0.48 * r.x - 0.32 * q.y);
  float warmMask = smoothstep(0.20, 0.86, f * 0.92 + 0.28 * warmZone);

  // Zona 3: Núcleo Central Pulsante (período ~8 a 12s — Magenta / Vinho / Fúcsia ou Luz Viva da Tríade)
  float corePulse = 0.5 + 0.5 * sin(t * (0.64 + 0.28 * u_aiIntensity) + f * 2.4);
  vec3 coreVeil = mix(u_coreA, u_coreB, smoothstep(0.15, 0.85, corePulse * 0.65 + 0.35 * r.x));
  float centerWeight = 1.0 - smoothstep(0.0, 0.95, length((st - vec2(0.5, 0.52)) * vec2(aspect * 0.72, 0.92)));
  float coreMask = smoothstep(0.24, 0.88, (f * f * 1.45 + 0.34 * r.y) * (0.55 + 0.45 * centerWeight));

  // Fusão de seda líquida sem bordas duras e com contraste AA absoluto para a interface
  vec3 silk = baseCol;
  if (u_isLight > 0.5) {
    // No Tema Claro: fusão pastel luminosa e serena (nunca escurece textos escuros)
    silk = mix(silk, coolVeil, coolMask * 0.28 * u_exposure);
    silk = mix(silk, warmVeil, warmMask * 0.25 * u_exposure);
    silk = mix(silk, coreVeil, coreMask * (0.28 + 0.08 * u_aiIntensity) * u_exposure);
    silk = mix(silk, baseCol, smoothstep(0.55, 1.35, radialDist) * 0.35);
  } else {
    // No Tema Escuro / AMOLED: fusão atmosférica profunda estilo seda líquida (#111114 <-> #18181B)
    silk = mix(silk, coolVeil, coolMask * 0.36 * u_exposure);
    silk = mix(silk, warmVeil, warmMask * 0.32 * u_exposure);
    silk = mix(silk, coreVeil, coreMask * (0.36 + 0.12 * u_aiIntensity) * u_exposure);
    // Crista sutil de concentração quando o Estado de IA está ativo
    float aiCrest = u_aiIntensity * 0.11 * smoothstep(0.45, 0.92, f + 0.30 * r.x) * smoothstep(0.2, 0.95, st.y);
    silk += coreVeil * aiCrest;
    // Vinheta atmosférica suave nas bordas para contraste AA impecável nos cartões
    silk = mix(silk, u_baseB, smoothstep(0.48, 1.32, radialDist) * 0.42);
  }

  vec3 finalColor = silk;

  // Granulação Cinematográfica Anti-Banding no próprio Fragment Shader
  float grain = (fract(sin(dot(gl_FragCoord.xy + fract(u_time), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.028;
  gl_FragColor = vec4(clamp(finalColor + grain, 0.0, 1.0), 1.0);
}
`;

export interface AuroraLiquidPaletteTarget {
  baseA: [number, number, number];
  baseB: [number, number, number];
  warm: [number, number, number];
  warmDeep: [number, number, number];
  coreA: [number, number, number];
  coreB: [number, number, number];
  coolA: [number, number, number];
  coolB: [number, number, number];
  exposure: number;
  isLight: number;
}

function hexToNormalizedVec3(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function blendTowardWhite(
  rgb: [number, number, number],
  whiteAmount: number,
): [number, number, number] {
  return [
    rgb[0] * (1 - whiteAmount) + whiteAmount,
    rgb[1] * (1 - whiteAmount) + whiteAmount,
    rgb[2] * (1 - whiteAmount) + whiteAmount,
  ];
}

/**
 * Calcula as dimensões em meia resolução (0.5x ou 0.35x degradado) com teto estrito de 1280px no maior lado.
 */
export function computeAuroraBufferDimensions(
  clientWidth: number,
  clientHeight: number,
  resolutionScale: number = AURORA_LIQUID_DEFAULT_SCALE,
  maxDimension: number = AURORA_LIQUID_MAX_BUFFER_DIM,
): { width: number; height: number } {
  const safeW = Math.max(1, Math.floor(clientWidth));
  const safeH = Math.max(1, Math.floor(clientHeight));
  const clampedScale = Math.max(0.25, Math.min(1.0, resolutionScale));

  let w = Math.max(1, Math.round(safeW * clampedScale));
  let h = Math.max(1, Math.round(safeH * clampedScale));

  const largest = Math.max(w, h);
  if (largest > maxDimension) {
    const downRatio = maxDimension / largest;
    w = Math.max(1, Math.round(w * downRatio));
    h = Math.max(1, Math.round(h * downRatio));
  }

  return { width: w, height: h };
}

/**
 * Resolve os vetores RGB normalizados (0..1) do Shader conforme:
 * - Tema (`dark`, `amoled`, `light`)
 * - Toggle `useAccentInOrbs` (`false` = Paleta Aurora Original; `true` = Tríade da Cor de Destaque ativa)
 * - Cor de Destaque (`blue`, `amber`, `crimson`, `default`)
 */
export function resolveAuroraLiquidPalette(
  isDark: boolean,
  isAmoled: boolean,
  useAccentInOrbs: boolean,
  accent: AccentColor | string,
): AuroraLiquidPaletteTarget {
  const baseDarkA = isAmoled ? hexToNormalizedVec3("#050509") : hexToNormalizedVec3("#18181B");
  const baseDarkB = isAmoled ? hexToNormalizedVec3("#010103") : hexToNormalizedVec3("#111114");
  const baseLightA = hexToNormalizedVec3("#F4F7FC");
  const baseLightB = hexToNormalizedVec3("#E8EEF7");

  const baseA = isDark ? baseDarkA : baseLightA;
  const baseB = isDark ? baseDarkB : baseLightB;
  const exposure = isAmoled ? 0.78 : isDark ? 0.92 : 0.85;
  const isLight = isDark ? 0.0 : 1.0;

  // 1. Modo Original (Quando "USAR COR DE DESTAQUE" está DESATIVADO)
  if (!useAccentInOrbs) {
    const warm = hexToNormalizedVec3("#F59E0B");
    const warmDeep = hexToNormalizedVec3("#B45309");
    const coreA = hexToNormalizedVec3("#A01550");
    const coreB = hexToNormalizedVec3("#86198F");
    const coolA = hexToNormalizedVec3("#312E81");
    const coolB = hexToNormalizedVec3("#4C1D95");

    if (!isDark) {
      return {
        baseA,
        baseB,
        warm: blendTowardWhite(warm, 0.58),
        warmDeep: blendTowardWhite(warmDeep, 0.62),
        coreA: blendTowardWhite(coreA, 0.66),
        coreB: blendTowardWhite(coreB, 0.64),
        coolA: blendTowardWhite(coolA, 0.66),
        coolB: blendTowardWhite(coolB, 0.64),
        exposure,
        isLight,
      };
    }

    return {
      baseA,
      baseB,
      warm,
      warmDeep,
      coreA,
      coreB,
      coolA,
      coolB,
      exposure,
      isLight,
    };
  }

  // 2. Modo Tríade da Cor de Destaque (Quando "USAR COR DE DESTAQUE" está ATIVADO)
  const norm = String(accent || "blue").trim().toLowerCase();

  let stage1Hex = "#003471"; // Primária / Profundidade
  let stage2Hex = "#00A8FF"; // Núcleo Luminoso
  let stage3Hex = "#2CA5D6"; // Reflexo Fluido

  if (norm === "amber" || norm === "#d16002" || norm === "#8a3300" || norm === "#f7941d" || norm === "#f59e0b") {
    // Âmbar Caldeiraria: #D16002 (mel escuro central), #8A3300 (conhaque denso), #F7941D (reflexo dourado)
    stage1Hex = "#D16002";
    stage2Hex = "#F7941D";
    stage3Hex = "#8A3300";
  } else if (
    norm === "crimson" ||
    norm === "magenta" ||
    norm === "#d61818" ||
    norm === "#e51a4c" ||
    norm === "#c11034" ||
    norm === "#b22222"
  ) {
    // Vermelho Carmesim: #D61818 (carmesim primário), #E51A4C (rubi intermediário), #C11034 (vinho denso)
    stage1Hex = "#D61818";
    stage2Hex = "#E51A4C";
    stage3Hex = "#C11034";
  } else if (norm === "default" || norm === "neutro") {
    // Neutro / Monocromático: Tons metálicos grafite/prata-titânio suaves
    stage1Hex = "#334155";
    stage2Hex = "#64748B";
    stage3Hex = "#1E293B";
  }

  const s1 = hexToNormalizedVec3(stage1Hex);
  const s2 = hexToNormalizedVec3(stage2Hex);
  const s3 = hexToNormalizedVec3(stage3Hex);

  if (!isDark) {
    return {
      baseA,
      baseB,
      warm: blendTowardWhite(s2, 0.56),
      warmDeep: blendTowardWhite(s1, 0.60),
      coreA: blendTowardWhite(s2, 0.52),
      coreB: blendTowardWhite(s3, 0.56),
      coolA: blendTowardWhite(s1, 0.62),
      coolB: blendTowardWhite(s3, 0.60),
      exposure,
      isLight,
    };
  }

  return {
    baseA,
    baseB,
    warm: s2,
    warmDeep: s1,
    coreA: s2,
    coreB: s3,
    coolA: s1,
    coolB: s3,
    exposure,
    isLight,
  };
}

function lerpVec3InPlace(
  current: Float32Array,
  target: [number, number, number],
  alpha: number,
) {
  current[0] = current[0]! + (target[0] - current[0]!) * alpha;
  current[1] = current[1]! + (target[1] - current[1]!) * alpha;
  current[2] = current[2]! + (target[2] - current[2]!) * alpha;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function useThemeSurfaceFlags() {
  const [flags, setFlags] = useState(() => {
    if (typeof document === "undefined") return { dark: false, amoled: false };
    const el = document.documentElement;
    return {
      dark: el.classList.contains("dark"),
      amoled: el.classList.contains("amoled"),
    };
  });

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => {
      setFlags({
        dark: el.classList.contains("dark"),
        amoled: el.classList.contains("amoled"),
      });
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);

  return flags;
}

function usePageVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visible;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

export const AuroraLiquidShader = React.memo(function AuroraLiquidShader({
  active = true,
  mode = "auto",
  className,
}: {
  active?: boolean;
  mode?: "auto" | "always";
  className?: string;
}) {
  const { auroraStyle, accent, useAccentInOrbs } = useSettings();
  const { isMestre } = useFeatureAccess();
  const { isProcessing, isContinuous } = useAIProcessing();
  const { dark, amoled } = useThemeSurfaceFlags();
  const pageVisible = usePageVisible();
  const reducedMotion = useReducedMotion();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);
  const [degradedScale, setDegradedScale] = useState(false);

  const isLiquidAuroraSelected =
    auroraStyle === "fluido" || (auroraStyle as string) === "fluid";
  const allowed = mode === "always" || isMestre || isLiquidAuroraSelected;
  const isVisible = active && allowed && isLiquidAuroraSelected;
  const aiActive = isProcessing || isContinuous;

  // Referência mutável lida pelo loop de 30 FPS (evita recriar contexto WebGL ou reiniciar u_time)
  const liveStateRef = useRef({
    isVisible,
    pageVisible,
    reducedMotion,
    aiActive,
    dark,
    amoled,
    useAccentInOrbs,
    accent,
    degradedScale,
  });
  liveStateRef.current = {
    isVisible,
    pageVisible,
    reducedMotion,
    aiActive,
    dark,
    amoled,
    useAccentInOrbs,
    accent,
    degradedScale,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let contextLost = false;

    // Uniform locations pré-cacheadas
    let uResolutionLoc: WebGLUniformLocation | null = null;
    let uTimeLoc: WebGLUniformLocation | null = null;
    let uAiIntensityLoc: WebGLUniformLocation | null = null;
    let uExposureLoc: WebGLUniformLocation | null = null;
    let uIsLightLoc: WebGLUniformLocation | null = null;
    let uBaseALoc: WebGLUniformLocation | null = null;
    let uBaseBLoc: WebGLUniformLocation | null = null;
    let uWarmLoc: WebGLUniformLocation | null = null;
    let uWarmDeepLoc: WebGLUniformLocation | null = null;
    let uCoreALoc: WebGLUniformLocation | null = null;
    let uCoreBLoc: WebGLUniformLocation | null = null;
    let uCoolALoc: WebGLUniformLocation | null = null;
    let uCoolBLoc: WebGLUniformLocation | null = null;

    // Buffers Float32 pré-alocados (Zero GC no loop de frame)
    const initialPalette = resolveAuroraLiquidPalette(
      liveStateRef.current.dark,
      liveStateRef.current.amoled,
      liveStateRef.current.useAccentInOrbs,
      liveStateRef.current.accent,
    );
    const curBaseA = new Float32Array(initialPalette.baseA);
    const curBaseB = new Float32Array(initialPalette.baseB);
    const curWarm = new Float32Array(initialPalette.warm);
    const curWarmDeep = new Float32Array(initialPalette.warmDeep);
    const curCoreA = new Float32Array(initialPalette.coreA);
    const curCoreB = new Float32Array(initialPalette.coreB);
    const curCoolA = new Float32Array(initialPalette.coolA);
    const curCoolB = new Float32Array(initialPalette.coolB);
    let curExposure = initialPalette.exposure;
    let curIsLight = initialPalette.isLight;
    let curAiIntensity = liveStateRef.current.aiActive ? 1.0 : 0.0;

    // Acumulador contínuo de tempo u_time (jamais zera ao trocar de aba)
    let accumulatedTime = 4.2;
    let currentScale = AURORA_LIQUID_DEFAULT_SCALE;
    let slowFrameOverrunAccumSec = 0;
    let staticFrameRendered = false;

    const initWebGL = (): boolean => {
      try {
        const contextAttrs: WebGLContextAttributes = {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
          powerPreference: "low-power",
        };
        gl =
          (canvas.getContext("webgl", contextAttrs) as WebGLRenderingContext | null) ||
          (canvas.getContext("experimental-webgl", contextAttrs) as WebGLRenderingContext | null);
        if (!gl) {
          setWebglFallback(true);
          return false;
        }

        program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
        if (!program) {
          setWebglFallback(true);
          return false;
        }

        gl.useProgram(program);

        // Triângulo full-screen único (cobre [-1, 1] x [-1, 1] sem costura diagonal)
        positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );

        const posAttr = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(posAttr);
        gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

        uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
        uTimeLoc = gl.getUniformLocation(program, "u_time");
        uAiIntensityLoc = gl.getUniformLocation(program, "u_aiIntensity");
        uExposureLoc = gl.getUniformLocation(program, "u_exposure");
        uIsLightLoc = gl.getUniformLocation(program, "u_isLight");
        uBaseALoc = gl.getUniformLocation(program, "u_baseA");
        uBaseBLoc = gl.getUniformLocation(program, "u_baseB");
        uWarmLoc = gl.getUniformLocation(program, "u_warm");
        uWarmDeepLoc = gl.getUniformLocation(program, "u_warmDeep");
        uCoreALoc = gl.getUniformLocation(program, "u_coreA");
        uCoreBLoc = gl.getUniformLocation(program, "u_coreB");
        uCoolALoc = gl.getUniformLocation(program, "u_coolA");
        uCoolBLoc = gl.getUniformLocation(program, "u_coolB");

        setWebglFallback(false);
        return true;
      } catch {
        setWebglFallback(true);
        return false;
      }
    };

    const syncResolution = () => {
      if (!gl || contextLost) return;
      const cw = window.innerWidth || canvas.clientWidth || 1;
      const ch = window.innerHeight || canvas.clientHeight || 1;
      const { width, height } = computeAuroraBufferDimensions(
        cw,
        ch,
        currentScale,
        AURORA_LIQUID_MAX_BUFFER_DIM,
      );
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    if (!initWebGL()) {
      return;
    }
    syncResolution();

    let rafId = 0;
    let lastDrawTimestamp = performance.now();
    let lastTickTimestamp = performance.now();

    const renderLoop = (now: number) => {
      const st = liveStateRef.current;

      // Se invisível, em CHAMFER CAD, em outro estilo ou aba oculta -> pausa imediatamente sem destruir contexto
      if (!st.isVisible || !st.pageVisible || contextLost || !gl || !program) {
        rafId = 0;
        return;
      }

      const elapsedMs = now - lastDrawTimestamp;
      const rawDtMs = now - lastTickTimestamp;
      lastTickTimestamp = now;

      // Trava estrita de 30 FPS (33.33ms)
      if (elapsedMs >= AURORA_LIQUID_FRAME_INTERVAL_MS || !staticFrameRendered) {
        const dtSec = Math.min(0.1, Math.max(0.001, elapsedMs / 1000));
        lastDrawTimestamp = now - (elapsedMs % AURORA_LIQUID_FRAME_INTERVAL_MS);

        // Monitoramento adaptativo: se o tempo entre ticks exceder 36ms continuamente por 2s -> reduz escala para 0.35x
        if (rawDtMs > 36 && currentScale > AURORA_LIQUID_DEGRADED_SCALE) {
          slowFrameOverrunAccumSec += rawDtMs / 1000;
          if (slowFrameOverrunAccumSec >= 2.0) {
            currentScale = AURORA_LIQUID_DEGRADED_SCALE;
            setDegradedScale(true);
            syncResolution();
          }
        } else {
          slowFrameOverrunAccumSec = Math.max(0, slowFrameOverrunAccumSec - 0.05);
        }

        // Interpolação suave do Estado de IA (0.0 <-> 1.0) e avanço contínuo de u_time
        const targetAi = st.aiActive ? 1.0 : 0.0;
        const lerpAlpha = Math.min(1.0, dtSec * 2.4);
        curAiIntensity += (targetAi - curAiIntensity) * lerpAlpha;

        const speedMultiplier = 1.0 + curAiIntensity * 0.55;
        if (!st.reducedMotion) {
          accumulatedTime += dtSec * speedMultiplier;
        }

        // Interpolação suave (lerp) da paleta alvo (Original <-> Tríade da Cor de Destaque)
        const targetPalette = resolveAuroraLiquidPalette(
          st.dark,
          st.amoled,
          st.useAccentInOrbs,
          st.accent,
        );
        const colorAlpha = staticFrameRendered ? Math.min(1.0, dtSec * 3.2) : 1.0;
        lerpVec3InPlace(curBaseA, targetPalette.baseA, colorAlpha);
        lerpVec3InPlace(curBaseB, targetPalette.baseB, colorAlpha);
        lerpVec3InPlace(curWarm, targetPalette.warm, colorAlpha);
        lerpVec3InPlace(curWarmDeep, targetPalette.warmDeep, colorAlpha);
        lerpVec3InPlace(curCoreA, targetPalette.coreA, colorAlpha);
        lerpVec3InPlace(curCoreB, targetPalette.coreB, colorAlpha);
        lerpVec3InPlace(curCoolA, targetPalette.coolA, colorAlpha);
        lerpVec3InPlace(curCoolB, targetPalette.coolB, colorAlpha);
        curExposure += (targetPalette.exposure - curExposure) * colorAlpha;
        curIsLight += (targetPalette.isLight - curIsLight) * colorAlpha;

        gl.useProgram(program);
        gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
        gl.uniform1f(uTimeLoc, accumulatedTime);
        gl.uniform1f(uAiIntensityLoc, curAiIntensity);
        gl.uniform1f(uExposureLoc, curExposure);
        gl.uniform1f(uIsLightLoc, curIsLight);

        gl.uniform3fv(uBaseALoc, curBaseA);
        gl.uniform3fv(uBaseBLoc, curBaseB);
        gl.uniform3fv(uWarmLoc, curWarm);
        gl.uniform3fv(uWarmDeepLoc, curWarmDeep);
        gl.uniform3fv(uCoreALoc, curCoreA);
        gl.uniform3fv(uCoreBLoc, curCoreB);
        gl.uniform3fv(uCoolALoc, curCoolA);
        gl.uniform3fv(uCoolBLoc, curCoolB);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        staticFrameRendered = true;

        // Se prefers-reduced-motion: reduce estiver ativo, renderiza 1 único frame rico e pausa o loop
        if (st.reducedMotion) {
          rafId = 0;
          return;
        }
      }

      rafId = window.requestAnimationFrame(renderLoop);
    };

    const startOrResumeLoop = () => {
      const st = liveStateRef.current;
      if (!st.isVisible || !st.pageVisible || contextLost || !gl || !program) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
        return;
      }
      syncResolution();
      if (!rafId) {
        lastDrawTimestamp = performance.now() - AURORA_LIQUID_FRAME_INTERVAL_MS;
        lastTickTimestamp = performance.now();
        rafId = window.requestAnimationFrame(renderLoop);
      }
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setWebglFallback(true);
    };

    const handleContextRestored = () => {
      contextLost = false;
      staticFrameRendered = false;
      if (initWebGL()) {
        syncResolution();
        startOrResumeLoop();
      }
    };

    const handleResize = () => {
      syncResolution();
      if (liveStateRef.current.reducedMotion && liveStateRef.current.isVisible) {
        staticFrameRendered = false;
        startOrResumeLoop();
      }
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
    window.addEventListener("resize", handleResize, { passive: true });

    // Expõe função de retomada no elemento canvas para sincronizar com mudanças de props sem recriar o contexto WebGL
    (canvas as HTMLCanvasElement & { __resumeAuroraLoop?: () => void }).__resumeAuroraLoop =
      () => {
        if (liveStateRef.current.reducedMotion) {
          staticFrameRendered = false;
        }
        startOrResumeLoop();
      };

    startOrResumeLoop();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      window.removeEventListener("resize", handleResize);
      if (gl) {
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (program) gl.deleteProgram(program);
      }
    };
  }, []);

  // Dispara retomada ou atualização de quadro estático sem destruir o contexto WebGL
  useEffect(() => {
    const canvas = canvasRef.current as
      | (HTMLCanvasElement & { __resumeAuroraLoop?: () => void })
      | null;
    canvas?.__resumeAuroraLoop?.();
  }, [isVisible, pageVisible, reducedMotion, dark, amoled, useAccentInOrbs, accent, aiActive]);

  return (
    <div
      aria-hidden
      data-testid="aurora-liquid-shader-root"
      data-visible={isVisible ? "true" : "false"}
      data-style={isLiquidAuroraSelected ? "fluid" : auroraStyle}
      data-orbs-accent={useAccentInOrbs ? "true" : "false"}
      data-processing={aiActive ? "active" : "idle"}
      data-resolution-scale={degradedScale ? "0.35" : "0.5"}
      data-fallback={webglFallback ? "css" : "webgl"}
      style={{
        display: isVisible ? "block" : "none",
        opacity: isVisible ? 1 : 0,
      }}
      className={cn(
        "aurora-liquid-shader-root pointer-events-none fixed inset-0 z-0 h-screen w-screen overflow-hidden transition-opacity duration-500",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        data-testid="aurora-liquid-shader-canvas"
        className={cn(
          "block h-full w-full pointer-events-none",
          webglFallback && "hidden",
        )}
        style={{ width: "100%", height: "100%" }}
      />
      {webglFallback && (
        <div
          data-testid="aurora-liquid-css-fallback"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: dark
              ? "radial-gradient(120% 100% at 50% 25%, rgba(160, 21, 80, 0.28) 0%, rgba(49, 46, 129, 0.24) 48%, #111114 100%)"
              : "radial-gradient(120% 100% at 50% 25%, rgba(251, 207, 232, 0.45) 0%, rgba(199, 210, 254, 0.38) 48%, #F4F7FC 100%)",
          }}
        />
      )}
    </div>
  );
});
