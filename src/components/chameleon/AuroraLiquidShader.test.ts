import test from "node:test";
import assert from "node:assert/strict";
import {
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  PALETTE_DARK,
  PALETTE_LIGHT,
  PALETTE_AMOLED,
  resolveAuroraEnginePalette,
  AURORA_LIQUID_TARGET_FPS,
} from "./AuroraLiquidShader";
import { HEX } from "@/lib/aurora/auroraEngine";

test("FLUIDO (Caldra-Code auroraEngine): 60 FPS nativos e shader FBM Domain Warping original sem grid", () => {
  assert.equal(AURORA_LIQUID_TARGET_FPS, 60);
  assert.ok(VERTEX_SHADER_SOURCE.includes("attribute vec2 a_pos;"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("float breath = 1.0 + 0.08 * sin(t * 0.082) + 0.04 * sin(t * 0.124 + 1.7);"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("fbm(pw + 3.8 * q + vec2(1.7, 9.2) + vec2(t * 0.022, t * 0.016))"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("float f = fbm(pw + 4.0 * r);"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("float vigDark = 1.0 - 0.25 * smoothstep(0.55, 1.25, rad);"));
  assert.ok(FRAGMENT_SHADER_SOURCE.includes("vec3 lightResult = mix(col, u_baseB, 0.16 * smoothstep(0.55, 1.25, rad));"));
});

test("FLUIDO (Caldra-Code auroraEngine): preserva exatamente PALETTE_LIGHT, PALETTE_DARK e PALETTE_AMOLED originais do repositório", () => {
  assert.deepEqual(PALETTE_LIGHT.u_baseA, HEX("#ffffff"));
  assert.deepEqual(PALETTE_LIGHT.u_baseB, HEX("#f1f5f9"));
  assert.deepEqual(PALETTE_LIGHT.u_warm, HEX("#f59e0b"));
  assert.deepEqual(PALETTE_LIGHT.u_warmDeep, HEX("#fb923c"));
  assert.deepEqual(PALETTE_LIGHT.u_magenta, HEX("#f43f5e"));
  assert.deepEqual(PALETTE_LIGHT.u_wine, HEX("#e11d48"));
  assert.deepEqual(PALETTE_LIGHT.u_fuchsia, HEX("#d946ef"));
  assert.deepEqual(PALETTE_LIGHT.u_indigo, HEX("#4f46e5"));
  assert.deepEqual(PALETTE_LIGHT.u_violet, HEX("#7c3aed"));

  assert.deepEqual(PALETTE_DARK.u_baseA, HEX("#18181b"));
  assert.deepEqual(PALETTE_DARK.u_baseB, HEX("#111114"));
  assert.deepEqual(PALETTE_DARK.u_warm, HEX("#f59e0b"));
  assert.deepEqual(PALETTE_DARK.u_warmDeep, HEX("#b45309"));
  assert.deepEqual(PALETTE_DARK.u_magenta, HEX("#b22222"));
  assert.deepEqual(PALETTE_DARK.u_wine, HEX("#7a103c"));
  assert.deepEqual(PALETTE_DARK.u_fuchsia, HEX("#86198f"));
  assert.deepEqual(PALETTE_DARK.u_indigo, HEX("#312e81"));
  assert.deepEqual(PALETTE_DARK.u_violet, HEX("#4c1d95"));

  assert.deepEqual(resolveAuroraEnginePalette(false, false, false, "blue"), PALETTE_LIGHT);
  assert.deepEqual(resolveAuroraEnginePalette(true, false, false, "blue"), PALETTE_DARK);
  assert.deepEqual(resolveAuroraEnginePalette(true, true, false, "blue"), PALETTE_AMOLED);
});
