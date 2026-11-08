import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAuroraBufferDimensions,
  resolveAuroraLiquidPalette,
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  AURORA_LIQUID_FPS_CAP,
  AURORA_LIQUID_FRAME_INTERVAL_MS,
  AURORA_LIQUID_DEFAULT_SCALE,
  AURORA_LIQUID_DEGRADED_SCALE,
  AURORA_LIQUID_MAX_BUFFER_DIM,
} from "./AuroraLiquidShader";

test("AuroraLiquidShader: meia resolução (0.5x) com teto de 1280px e degradação adaptativa (0.35x)", () => {
  assert.equal(AURORA_LIQUID_FPS_CAP, 30);
  assert.ok(Math.abs(AURORA_LIQUID_FRAME_INTERVAL_MS - 33.3333) < 0.01);
  assert.equal(AURORA_LIQUID_DEFAULT_SCALE, 0.5);
  assert.equal(AURORA_LIQUID_DEGRADED_SCALE, 0.35);
  assert.equal(AURORA_LIQUID_MAX_BUFFER_DIM, 1280);

  // Viewport mobile 390x844 -> 195x422 em 0.5x
  const mobileHalf = computeAuroraBufferDimensions(390, 844, 0.5, 1280);
  assert.equal(mobileHalf.width, 195);
  assert.equal(mobileHalf.height, 422);

  // Viewport desktop 1440x900 -> 720x450 em 0.5x
  const desktopHalf = computeAuroraBufferDimensions(1440, 900, 0.5, 1280);
  assert.equal(desktopHalf.width, 720);
  assert.equal(desktopHalf.height, 450);

  // Viewport 4K 3840x2160 em 0.5x seria 1920x1080 -> limitado a 1280x720 mantendo proporção
  const ultraWide = computeAuroraBufferDimensions(3840, 2160, 0.5, 1280);
  assert.equal(ultraWide.width, 1280);
  assert.equal(ultraWide.height, 720);

  // Degradação adaptativa 0.35x em 1000x800 -> 350x280
  const degraded = computeAuroraBufferDimensions(1000, 800, 0.35, 1280);
  assert.equal(degraded.width, 350);
  assert.equal(degraded.height, 280);
});

test("AuroraLiquidShader: código GLSL contém curva quíntica, FBM de 4 oitavas rotacionadas, Duplo Domain Warping e Film Grain", () => {
  assert.ok(VERTEX_SHADER_SOURCE.includes("attribute vec2 a_position"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("f * f * f * (f * (f * 6.0 - 15.0) + 10.0)"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("mat2(0.80, 0.60, -0.60, 0.80)"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("fbm(p + vec2(0.0, 0.0) + 0.07 * t)"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("fbm(p + vec2(5.2, 1.3) - 0.06 * t)"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("fbm(p * breath + 3.8 * q + vec2(1.7, 9.2) + flow)"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("fbm(p + 3.5 * r)"));
  assert.ok(
    FRAGMENT_SHADER_SOURCE.includes(
      "fract(sin(dot(gl_FragCoord.xy + fract(u_time), vec2(12.9898, 78.233))) * 43758.5453)",
    ),
  );
});

test("AuroraLiquidShader: alterna entre Paleta Original (Âmbar/Magenta/Índigo) e Tríades (Azul, Âmbar, Carmesim)", () => {
  // Original Dark (useAccentInOrbs = false) -> warm é #F59E0B (245/255, 158/255, 11/255)
  const origDark = resolveAuroraLiquidPalette(true, false, false, "blue");
  assert.equal(origDark.isLight, 0);
  assert.ok(Math.abs(origDark.warm[0] - 245 / 255) < 0.01);
  assert.ok(Math.abs(origDark.coreA[0] - 160 / 255) < 0.01); // #A01550

  // Tríade Azul Técnico (useAccentInOrbs = true, accent = "blue") -> #003471, #00A8FF, #2CA5D6
  const blueTriad = resolveAuroraLiquidPalette(true, false, true, "blue");
  assert.ok(Math.abs(blueTriad.warmDeep[2] - 113 / 255) < 0.01); // #003471
  assert.ok(Math.abs(blueTriad.coreA[1] - 168 / 255) < 0.01); // #00A8FF

  // Tríade Vermelho Carmesim (useAccentInOrbs = true, accent = "crimson") -> #D61818, #E51A4C, #C11034
  const crimsonTriad = resolveAuroraLiquidPalette(true, false, true, "crimson");
  assert.ok(Math.abs(crimsonTriad.warmDeep[0] - 214 / 255) < 0.01); // #D61818
  assert.ok(Math.abs(crimsonTriad.coreA[0] - 229 / 255) < 0.01); // #E51A4C

  // Tema Claro (isLight = 1) -> cores atmosféricas claras com alto valor de luminância
  const lightPalette = resolveAuroraLiquidPalette(false, false, false, "blue");
  assert.equal(lightPalette.isLight, 1);
  assert.ok(lightPalette.baseA[0] > 0.9);
});
