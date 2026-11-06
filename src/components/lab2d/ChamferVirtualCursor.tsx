/**
 * CALDRA CHAMFER — SISTEMA AVANÇADO DE CONTROLE DE CURSOR MOBILE-FIRST
 *
 * Implementa a tríade de controle de precisão padrão Desktop no Touch:
 *  1. Cursor Técnico com Deslocamento Inteligente (Offset Anti-Oclusão de -55px e Auto-Inversão +55px no topo);
 *  2. Mira Técnica Vetorial + Crosshair Dinâmico + Haste Guia Elástica (substituindo o '+' azul básico);
 *  3. Micro-Ajuste Incremental (Nudge Direcional 0.1 / 1 / 5 / 10 mm com confirmação de ponto/entidade);
 *  4. Adaptação total aos Temas Claro, Escuro e AMOLED do CALDRA.
 */

import React, { useMemo } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Snap } from "@/lib/lab2d/core";
import type { SmartReferencePoint } from "@/lib/lab2d/cadReferenceSnaps";
import type { IsoPlane } from "@/lib/lab2d/isometricEngine";
import { useSettings, type AccentColor, type ThemeMode } from "@/lib/settings/SettingsProvider";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Check, Minimize2, Pin, PinOff } from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export const TOUCH_CURSOR_OFFSET_PX = 55;
export const TOUCH_TOP_INVERSION_THRESHOLD_PX = 120;
export const TOUCH_TOP_EDGE_THRESHOLD_PX = TOUCH_TOP_INVERSION_THRESHOLD_PX;

export const NUDGE_AUTO_REPEAT_DELAY_MS = 250;
export const NUDGE_AUTO_REPEAT_INTERVAL_MS = 70;

export type NudgeDirection = "up" | "down" | "left" | "right";
export type NudgeStepMm = 0.1 | 1 | 5 | 10;

export const NUDGE_STEP_OPTIONS: NudgeStepMm[] = [0.1, 1, 5, 10];

/**
 * Determina se a ferramenta ativa deve aplicar deslocamento vertical (-55px acima do dedo) no toque.
 * Ativo sempre que `pointerType === "touch"`, `cursorOffsetMode === "offset"` e a ferramenta não for `pan`.
 */
export function shouldUseTouchOffset(
  pointerType: string | undefined,
  tool: string,
  _isDraggingNode = false,
  _isDraggingEntity = false,
  cursorOffsetMode: "offset" | "direct" = "offset",
  _hasSelection = false,
): boolean {
  if (pointerType !== "touch") return false;
  if (cursorOffsetMode === "direct") return false;
  if (tool === "pan") return false;
  return true;
}

export interface TouchCursorCalculationInput {
  clientX: number;
  clientY: number;
  pointerType?: string;
  canvasRect: { left: number; top: number; width?: number; height?: number };
  canvasWidth?: number;
  canvasHeight?: number;
  panX: number;
  panY: number;
  zoom: number;
  offsetEnabled?: boolean;
  allowTopInversion?: boolean;
}

export interface TouchCursorCalculationResult {
  cursorScreenX: number;
  cursorScreenY: number;
  cursorWorldX: number;
  cursorWorldY: number;
  touchWorldX: number;
  touchWorldY: number;
  offsetY: number;
  isInverted: boolean;
}

/**
 * Calcula matematicamente a coordenada da Mira 55px (`touchY - 55`) e do ponto físico do dedo
 * no mundo CAD (`mm`), descontando `rect.left` e `rect.top`, aplicando a razão de escala CSS (`scaleX`, `scaleY`)
 * e convertendo pelo Pan (`panX`, `panY`) e Zoom (`zoom`).
 */
export function computeTouchCursorScreenAndWorld({
  clientX,
  clientY,
  pointerType,
  canvasRect,
  canvasWidth,
  canvasHeight,
  panX,
  panY,
  zoom,
  offsetEnabled = false,
  allowTopInversion = true,
}: TouchCursorCalculationInput): TouchCursorCalculationResult {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;
  const left = Number.isFinite(canvasRect.left) ? canvasRect.left : 0;
  const top = Number.isFinite(canvasRect.top) ? canvasRect.top : 0;

  const rectW = Number.isFinite(canvasRect.width) && (canvasRect.width ?? 0) > 0 ? canvasRect.width! : 0;
  const rectH = Number.isFinite(canvasRect.height) && (canvasRect.height ?? 0) > 0 ? canvasRect.height! : 0;
  const scaleX =
    typeof canvasWidth === "number" && canvasWidth > 0 && rectW > 0 ? canvasWidth / rectW : 1;
  const scaleY =
    typeof canvasHeight === "number" && canvasHeight > 0 && rectH > 0 ? canvasHeight / rectH : 1;

  const applyOffset = Boolean(offsetEnabled && pointerType === "touch");
  const isInverted = Boolean(applyOffset && allowTopInversion && clientY < TOUCH_TOP_INVERSION_THRESHOLD_PX);
  const offsetY = applyOffset ? (isInverted ? TOUCH_CURSOR_OFFSET_PX : -TOUCH_CURSOR_OFFSET_PX) : 0;

  const cursorScreenX = clientX;
  const cursorScreenY = clientY + offsetY;

  const touchCanvasX = (clientX - left) * scaleX;
  const touchCanvasY = (clientY - top) * scaleY;
  const cursorCanvasX = (cursorScreenX - left) * scaleX;
  const cursorCanvasY = (cursorScreenY - top) * scaleY;

  const touchWorldX = (touchCanvasX - safePanX) / safeZoom;
  const touchWorldY = (touchCanvasY - safePanY) / safeZoom;
  const cursorWorldX = (cursorCanvasX - safePanX) / safeZoom;
  const cursorWorldY = (cursorCanvasY - safePanY) / safeZoom;

  return {
    cursorScreenX,
    cursorScreenY,
    cursorWorldX,
    cursorWorldY,
    touchWorldX,
    touchWorldY,
    offsetY,
    isInverted,
  };
}

export interface Crosshair55OverlayOptions {
  /** Posição física do dedo em pixels CSS relativos ao canvas (touchX, touchY) */
  touchScreen: Vec2;
  /** Posição da mira 55px acima do dedo (ou cravada no SnapResult.screenPoint) em pixels CSS relativos ao canvas */
  reticleScreen?: Vec2 | null;
  /** Indica se um ponto de SNAP geométrico real está capturado */
  hasSnap?: boolean;
  /** Rótulo opcional do SNAP capturado */
  snapLabel?: string;
  /** Device Pixel Ratio do canvas */
  dpr?: number;
}

/**
 * Desenho Visual Obrigatório da Mira 55px no Final do Loop de Renderização 2D (`renderCrosshair55Overlay`):
 *  - A. Anel de Apoio do Dedo em `(touchX, touchY)` (raio 14px, `rgba(56, 189, 248, 0.45)`, `lineWidth: 1.5px`)
 *  - B. Haste Conectora Vertical de 55px ligando `(touchX, touchY - 14)` até `(touchX, touchY - 55)` (`rgba(56, 189, 248, 0.65)`)
 *  - C. Retículo Óptico Principal de Precisão em `(touchX, touchY - 55)` (ou cravado no `SnapResult.screenPoint` quando em SNAP):
 *       círculo técnico de raio 10px (`#38BDF8` ou `#10B981` quando em SNAP), 4 linhas de mira (`16px`) e ponto central de `2px`.
 */
export function renderCrosshair55Overlay(
  ctx: CanvasRenderingContext2D,
  options: Crosshair55OverlayOptions,
): void {
  const { touchScreen, reticleScreen, hasSnap = false, dpr = 1 } = options;
  if (
    !touchScreen ||
    !Number.isFinite(touchScreen.x) ||
    !Number.isFinite(touchScreen.y)
  ) {
    return;
  }

  const touchX = touchScreen.x;
  const touchY = touchScreen.y;
  const targetX =
    reticleScreen && Number.isFinite(reticleScreen.x) ? reticleScreen.x : touchX;
  const targetY =
    reticleScreen && Number.isFinite(reticleScreen.y)
      ? reticleScreen.y
      : touchY - TOUCH_CURSOR_OFFSET_PX;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // A. Anel de Apoio do Dedo em (touchX, touchY) — raio 14px
  ctx.beginPath();
  ctx.arc(touchX, touchY, 14, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(touchX, touchY, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(56, 189, 248, 0.55)";
  ctx.fill();

  // B. Haste Conectora Vertical de 55px ligando (touchX, touchY - 14) até o retículo
  const stemStartX = touchX;
  const stemStartY = touchY - 14;
  const stemEndX = targetX;
  const stemEndY = targetY + 10;
  if (Math.hypot(stemEndX - stemStartX, stemEndY - stemStartY) > 4) {
    ctx.beginPath();
    ctx.moveTo(stemStartX, stemStartY);
    ctx.lineTo(stemEndX, stemEndY);
    ctx.strokeStyle = hasSnap ? "rgba(16, 185, 129, 0.78)" : "rgba(56, 189, 248, 0.65)";
    ctx.lineWidth = 1.35;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
  }

  // C. Retículo Óptico Principal de Precisão em (targetX, targetY)
  const reticleColor = hasSnap ? "#10B981" : "#38BDF8";
  ctx.setLineDash([]);

  // Halo de contraste para legibilidade em qualquer tema
  ctx.beginPath();
  ctx.arc(targetX, targetY, 10, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.72)";
  ctx.lineWidth = 3.2;
  ctx.stroke();

  // Círculo técnico de precisão (raio 10px)
  ctx.beginPath();
  ctx.arc(targetX, targetY, 10, 0, Math.PI * 2);
  if (hasSnap) {
    ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
    ctx.fill();
  }
  ctx.strokeStyle = reticleColor;
  ctx.lineWidth = 1.75;
  ctx.stroke();

  // 4 linhas de mira (crosshair hairs de 16px) cruzando o centro exato
  const hairOuter = 16;
  const hairInner = 3.5;
  ctx.beginPath();
  // Esquerda
  ctx.moveTo(targetX - hairOuter, targetY);
  ctx.lineTo(targetX - hairInner, targetY);
  // Direita
  ctx.moveTo(targetX + hairInner, targetY);
  ctx.lineTo(targetX + hairOuter, targetY);
  // Topo
  ctx.moveTo(targetX, targetY - hairOuter);
  ctx.lineTo(targetX, targetY - hairInner);
  // Base
  ctx.moveTo(targetX, targetY + hairInner);
  ctx.lineTo(targetX, targetY + hairOuter);
  ctx.strokeStyle = reticleColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ponto luminoso central de 2px
  ctx.beginPath();
  ctx.arc(targetX, targetY, 2, 0, Math.PI * 2);
  ctx.fillStyle = reticleColor;
  ctx.fill();

  ctx.restore();
}

/**
 * Calcula o incremento exato (ΔX, ΔY) em milímetros para o Micro-Ajuste Incremental (Nudge),
 * respeitando a projeção ortogonal 2D ou os eixos isométricos (30°/150°/90°).
 */
export function computeNudgeDelta(
  direction: NudgeDirection,
  stepMm: number,
  drawingProjection: "orthographic" | "isometric" = "orthographic",
  isoPlane: IsoPlane = "top",
): Vec2 {
  const s = Number.isFinite(stepMm) && stepMm > 0 ? stepMm : 1;

  if (drawingProjection === "isometric") {
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);
    if (isoPlane === "top") {
      switch (direction) {
        case "right":
          return { x: s * cos30, y: -s * sin30 };
        case "left":
          return { x: -s * cos30, y: s * sin30 };
        case "up":
          return { x: -s * cos30, y: -s * sin30 };
        case "down":
          return { x: s * cos30, y: s * sin30 };
      }
    } else if (isoPlane === "left") {
      switch (direction) {
        case "up":
          return { x: 0, y: -s };
        case "down":
          return { x: 0, y: s };
        case "left":
          return { x: -s * cos30, y: -s * sin30 };
        case "right":
          return { x: s * cos30, y: s * sin30 };
      }
    } else {
      // right isoPlane
      switch (direction) {
        case "up":
          return { x: 0, y: -s };
        case "down":
          return { x: 0, y: s };
        case "right":
          return { x: s * cos30, y: -s * sin30 };
        case "left":
          return { x: -s * cos30, y: s * sin30 };
      }
    }
  }

  switch (direction) {
    case "up":
      return { x: 0, y: -s };
    case "down":
      return { x: 0, y: s };
    case "left":
      return { x: -s, y: 0 };
    case "right":
      return { x: s, y: 0 };
  }
}

export function resolveAccentHex(accent: AccentColor, dark: boolean): string {
  switch (accent) {
    case "amber":
      return dark ? "#FF6B00" : "#EA580C";
    case "gold":
      return dark ? "#F59E0B" : "#D97706";
    case "emerald":
      return dark ? "#10B981" : "#059669";
    case "violet":
      return dark ? "#8B5CF6" : "#7C3AED";
    case "crimson":
      return dark ? "#F43F5E" : "#E11D48";
    case "magenta":
      return dark ? "#EC4899" : "#DB2777";
    case "cyan":
      return dark ? "#06B6D4" : "#0891B2";
    case "lime":
      return dark ? "#84CC16" : "#65A30D";
    case "titanium":
    case "default":
      return dark ? "#94A3B8" : "#475569";
    case "blue":
    default:
      return dark ? "#38BDF8" : "#0284C7";
  }
}

export function resolveAccentContrastText(accent: AccentColor, dark: boolean): string {
  if (!dark) return "#FFFFFF";
  switch (accent) {
    case "amber":
    case "gold":
    case "emerald":
    case "cyan":
    case "lime":
    case "blue":
    case "titanium":
    case "default":
      return "#05070B";
    case "violet":
    case "crimson":
    case "magenta":
    default:
      return "#FFFFFF";
  }
}

export interface ChamferTechnicalCursorSvgProps {
  visible: boolean;
  /** Coordenada ativa do cursor no mundo CAD (já com offset 55px se touch) */
  cursorWorld: Vec2;
  /** Coordenada física do toque do dedo no mundo CAD (para desenhar a Haste Guia Elástica) */
  touchWorld?: Vec2 | null;
  /** Se o deslocamento anti-oclusão de toque está ativo */
  touchOffsetActive?: boolean;
  /** Ponto de Snap magnético atualmente capturado (end, mid, center, grid, etc.) */
  activeSnap?: Snap | SmartReferencePoint | null;
  /** Nível de zoom atual da viewport (view.k) */
  viewK: number;
  /** Modo de projeção atual */
  drawingProjection?: "orthographic" | "isometric";
  isoPlane?: IsoPlane;
  /** Restrição ortogonal ativa */
  orthoOn?: boolean;
  /** Ponto base anterior (ex: início de linha) para realce de alinhamento */
  basePoint?: Vec2 | null;
  /** Tema escuro ativo */
  isDark?: boolean;
}

/**
 * Renderiza no espaço SVG do Canvas:
 *  - Haste Guia Elástica Discreta (ligando o ponto de contato do dedo ao centro do cursor deslocado);
 *  - Crosshair Dinâmico Estendido (guias finas de alinhamento X/Y ou Isométrico);
 *  - Mira Técnica de Precisão (retículo de metrologia 1px com reação ao Snap magnético).
 */
export function ChamferTechnicalCursorSvg({
  visible,
  cursorWorld,
  touchWorld,
  touchOffsetActive = false,
  activeSnap,
  viewK,
  drawingProjection = "orthographic",
  isoPlane = "top",
  orthoOn = false,
  basePoint,
  isDark = true,
}: ChamferTechnicalCursorSvgProps) {
  let settingsAccent: AccentColor = "blue";
  let settingsTheme: ThemeMode = "light";
  try {
    const s = useSettings();
    settingsAccent = s.accent;
    settingsTheme = s.theme;
  } catch {
    // Fallback em testes isolados
  }

  const effectiveIsDark = useMemo(() => {
    if (typeof isDark === "boolean") return isDark;
    return settingsTheme === "dark" || settingsTheme === "amoled";
  }, [isDark, settingsTheme]);

  const accentHex = useMemo(
    () => resolveAccentHex(settingsAccent, effectiveIsDark),
    [settingsAccent, effectiveIsDark],
  );

  if (!visible) return null;
  if (!cursorWorld || !Number.isFinite(cursorWorld.x) || !Number.isFinite(cursorWorld.y)) {
    return null;
  }

  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const inv = 1 / safeK;

  // Coordenada efetiva onde o cursor/mira trava: se houver snap geométrico, trava exatamente no snap!
  const target: Vec2 =
    activeSnap && activeSnap.p && Number.isFinite(activeSnap.p.x) && Number.isFinite(activeSnap.p.y)
      ? activeSnap.p
      : cursorWorld;

  const isObjectSnap = !!activeSnap && activeSnap.kind !== "grid";
  const snapLockColor = effectiveIsDark ? "#10B981" : "#059669"; // Emerald 500/600
  const primaryColor = isObjectSnap ? snapLockColor : accentHex;
  const crosshairSubtleColor = effectiveIsDark ? "rgba(148, 163, 184, 0.24)" : "rgba(71, 85, 105, 0.22)";
  const crosshairOrthoColor = effectiveIsDark ? "rgba(56, 189, 248, 0.36)" : "rgba(0, 102, 255, 0.32)";

  // Dimensões do retículo em unidades de tela convertidas para o mundo (inv = 1 / viewK)
  const gap = 3.5 * inv;
  const arm = 16 * inv;
  const crosshairSpan = 2200 * inv;
  const crosshairStart = 20 * inv;
  const ringR = 10 * inv;
  const fingerRingR = 14 * inv;

  const hasValidTouchOrigin =
    touchOffsetActive &&
    touchWorld &&
    Number.isFinite(touchWorld.x) &&
    Number.isFinite(touchWorld.y) &&
    Math.hypot(target.x - touchWorld.x, target.y - touchWorld.y) > 4 * inv;

  return (
    <g
      className="chamfer-technical-cursor pointer-events-none select-none"
      data-testid="chamfer-mira-55px-svg"
      aria-label="Mira técnica de precisão CAD 55px"
    >
      {/* 1. ANEL DE APOIO DO DEDO (14PX) + HASTE CONECTORA VERTICAL DE 55PX */}
      {hasValidTouchOrigin && touchWorld && (
        <g aria-label="Haste guia elástica anti-oclusão 55px" data-testid="chamfer-mira-55px-stem">
          {/* A. Anel de Apoio do Dedo em (touchX, touchY) de raio 14px */}
          <circle
            cx={touchWorld.x}
            cy={touchWorld.y}
            r={fingerRingR}
            fill="none"
            stroke="rgba(56, 189, 248, 0.45)"
            strokeWidth={1.5 * inv}
          />
          <circle
            cx={touchWorld.x}
            cy={touchWorld.y}
            r={2.2 * inv}
            fill="rgba(56, 189, 248, 0.55)"
          />
          {/* B. Haste Conectora Vertical de 55px ligando (touchX, touchY - 14) até o retículo */}
          <line
            x1={touchWorld.x}
            y1={touchWorld.y - fingerRingR}
            x2={target.x}
            y2={target.y + ringR}
            stroke={isObjectSnap ? "rgba(16, 185, 129, 0.78)" : "rgba(56, 189, 248, 0.65)"}
            strokeWidth={1.35 * inv}
            strokeDasharray={`${4 * inv},${3 * inv}`}
          />
        </g>
      )}

      {/* 2. CROSSHAIR DINÂMICO (LINHAS DE ALINHAMENTO TÉCNICO) */}
      {drawingProjection === "isometric" ? (
        <g>
          {(() => {
            const angles =
              isoPlane === "top"
                ? [Math.PI / 6, (-5 * Math.PI) / 6, (5 * Math.PI) / 6, -Math.PI / 6]
                : isoPlane === "left"
                  ? [-Math.PI / 2, Math.PI / 2, (5 * Math.PI) / 6, -Math.PI / 6]
                  : [-Math.PI / 2, Math.PI / 2, Math.PI / 6, (-5 * Math.PI) / 6];
            return angles.map((ang, idx) => {
              const cos = Math.cos(ang);
              const sin = Math.sin(ang);
              return (
                <line
                  key={`iso-ch-${idx}`}
                  x1={target.x + cos * crosshairStart}
                  y1={target.y + sin * crosshairStart}
                  x2={target.x + cos * crosshairSpan}
                  y2={target.y + sin * crosshairSpan}
                  stroke={orthoOn ? crosshairOrthoColor : crosshairSubtleColor}
                  strokeWidth={0.85 * inv}
                  strokeDasharray={`${6 * inv},${4 * inv}`}
                />
              );
            });
          })()}
        </g>
      ) : (
        <g>
          {/* Eixo Horizontal X do Crosshair Dinâmico (com gap central no retículo) */}
          <line
            x1={target.x - crosshairSpan}
            y1={target.y}
            x2={target.x - crosshairStart}
            y2={target.y}
            stroke={orthoOn || (basePoint && Math.abs(target.y - basePoint.y) < 0.05) ? crosshairOrthoColor : crosshairSubtleColor}
            strokeWidth={0.85 * inv}
            strokeDasharray={`${6 * inv},${4 * inv}`}
          />
          <line
            x1={target.x + crosshairStart}
            y1={target.y}
            x2={target.x + crosshairSpan}
            y2={target.y}
            stroke={orthoOn || (basePoint && Math.abs(target.y - basePoint.y) < 0.05) ? crosshairOrthoColor : crosshairSubtleColor}
            strokeWidth={0.85 * inv}
            strokeDasharray={`${6 * inv},${4 * inv}`}
          />
          {/* Eixo Vertical Y do Crosshair Dinâmico (com gap central no retículo) */}
          <line
            x1={target.x}
            y1={target.y - crosshairSpan}
            x2={target.x}
            y2={target.y - crosshairStart}
            stroke={orthoOn || (basePoint && Math.abs(target.x - basePoint.x) < 0.05) ? crosshairOrthoColor : crosshairSubtleColor}
            strokeWidth={0.85 * inv}
            strokeDasharray={`${6 * inv},${4 * inv}`}
          />
          <line
            x1={target.x}
            y1={target.y + crosshairStart}
            x2={target.x}
            y2={target.y + crosshairSpan}
            stroke={orthoOn || (basePoint && Math.abs(target.x - basePoint.x) < 0.05) ? crosshairOrthoColor : crosshairSubtleColor}
            strokeWidth={0.85 * inv}
            strokeDasharray={`${6 * inv},${4 * inv}`}
          />
        </g>
      )}

      {/* 3. C. RETÍCULO ÓPTICO PRINCIPAL DE PRECISÃO (RAIO 10PX + 4 LINHAS DE MIRA 16PX + PONTO CENTRAL 2PX) */}
      <g data-testid="chamfer-mira-55px-reticle">
        {/* Halo de contraste sutil para legibilidade absoluta em ambos os temas */}
        <circle
          cx={target.x}
          cy={target.y}
          r={ringR}
          fill="none"
          stroke={effectiveIsDark ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.85)"}
          strokeWidth={2.8 * inv}
        />

        {/* Círculo Técnico de Precisão (Raio 10px, Ciano #38BDF8 ou Verde #10B981 em SNAP) */}
        <circle
          cx={target.x}
          cy={target.y}
          r={ringR}
          fill={isObjectSnap ? (effectiveIsDark ? "rgba(16, 185, 129, 0.16)" : "rgba(5, 150, 105, 0.12)") : "none"}
          stroke={primaryColor}
          strokeWidth={(isObjectSnap ? 1.85 : 1.6) * inv}
        />

        {/* 4 Linhas de Mira (Crosshair Hairs de 16px) */}
        <line
          x1={target.x - arm}
          y1={target.y}
          x2={target.x - gap}
          y2={target.y}
          stroke={primaryColor}
          strokeWidth={1.45 * inv}
          strokeLinecap="round"
        />
        <line
          x1={target.x + gap}
          y1={target.y}
          x2={target.x + arm}
          y2={target.y}
          stroke={primaryColor}
          strokeWidth={1.45 * inv}
          strokeLinecap="round"
        />
        <line
          x1={target.x}
          y1={target.y - arm}
          x2={target.x}
          y2={target.y - gap}
          stroke={primaryColor}
          strokeWidth={1.45 * inv}
          strokeLinecap="round"
        />
        <line
          x1={target.x}
          y1={target.y + gap}
          x2={target.x}
          y2={target.y + arm}
          stroke={primaryColor}
          strokeWidth={1.45 * inv}
          strokeLinecap="round"
        />

        {/* Ponto luminoso central de 2px */}
        <circle
          cx={target.x}
          cy={target.y}
          r={2 * inv}
          fill={primaryColor}
        />
      </g>
    </g>
  );
}

export interface ChamferNudgeControlHUDProps {
  visible: boolean;
  stepMm: NudgeStepMm;
  onStepChange: (step: NudgeStepMm) => void;
  onNudge: (dir: NudgeDirection) => void;
  onConfirmPoint?: () => void;
  onSetExactCoord?: (pt: Vec2) => void;
  canConfirmPoint?: boolean;
  confirmLabel?: string;
  targetLabel?: string;
  cursorPos: Vec2;
  onClose?: () => void;
  isDark?: boolean;
  className?: string;
}

/**
 * HUD Técnico de Ajuste Fino Incremental (FINO • MIRA) — Inspirado na Lupa de Precisão
 * - Adaptação total ao Tema (Claro, Escuro, AMOLED), Opacidade e Cor de Destaque (Accent Color)
 * - Moldura translúcida com micro-grade técnica ao fundo
 * - Cabeçalho estilo Lupa com ponto luminoso na cor de destaque, botão de fixar (📌) e minimizar
 * - Seletor de passo segmentado slim (0.1 | 1 | 5 | 10)
 * - D-Pad tátil circular/anelar com repetição contínua ao segurar (250ms delay inicial + 70ms repetição)
 * - Rodapé de telemetria limpo (X: ... Y: ...) idêntico à Lupa
 */
export function ChamferNudgeControlHUD({
  visible,
  stepMm,
  onStepChange,
  onNudge,
  onConfirmPoint,
  onSetExactCoord,
  canConfirmPoint = false,
  confirmLabel = "PONTO",
  targetLabel = "MIRA",
  cursorPos,
  onClose,
  isDark: isDarkProp,
  className,
}: ChamferNudgeControlHUDProps) {
  let settingsAccent: AccentColor = "blue";
  let settingsTheme: ThemeMode = "dark";
  let settingsCardOpacity = 90;
  try {
    const s = useSettings();
    settingsAccent = s.accent;
    settingsTheme = s.theme;
    settingsCardOpacity = s.cardOpacity ?? 90;
  } catch {
    // Fallback para testes unitários isolados
  }

  const isLight = isDarkProp === false || (isDarkProp === undefined && settingsTheme === "light");
  const isAmoled = !isLight && settingsTheme === "amoled";

  const [editingCoord, setEditingCoord] = React.useState(false);
  const [xInput, setXInput] = React.useState("");
  const [yInput, setYInput] = React.useState("");
  const [isPinned, setIsPinned] = React.useState(true);
  const [activeHoldDir, setActiveHoldDir] = React.useState<NudgeDirection | null>(null);

  const onNudgeRef = React.useRef(onNudge);
  onNudgeRef.current = onNudge;

  const holdTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const suppressNextClickRef = React.useRef(false);

  const stopAutoRepeat = React.useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setActiveHoldDir(null);
  }, []);

  React.useEffect(() => {
    if (!visible) {
      setEditingCoord(false);
      stopAutoRepeat();
    }
    return () => stopAutoRepeat();
  }, [visible, stopAutoRepeat]);

  if (!visible) return null;

  const accentHex = resolveAccentHex(settingsAccent, !isLight);
  const accentContrast = resolveAccentContrastText(settingsAccent, !isLight);

  const normalizedOpacity = Math.max(0.76, Math.min(0.98, settingsCardOpacity / 100));
  const surfaceBg = isLight
    ? `rgba(255, 255, 255, ${normalizedOpacity})`
    : isAmoled
      ? `rgba(4, 6, 11, ${Math.min(0.98, normalizedOpacity + 0.04)})`
      : `rgba(11, 16, 27, ${normalizedOpacity})`;

  const innerWellBg = isLight
    ? "rgba(241, 245, 249, 0.92)"
    : isAmoled
      ? "rgba(9, 13, 22, 0.95)"
      : "rgba(15, 23, 42, 0.86)";

  const microGridLine = isLight
    ? "rgba(15, 23, 42, 0.045)"
    : "rgba(148, 163, 184, 0.06)";

  const textPrimary = isLight ? "#0F172A" : "#F8FAFC";
  const textMuted = isLight ? "#64748B" : "#94A3B8";
  const borderSubtle = isLight ? "rgba(15, 23, 42, 0.12)" : "rgba(148, 163, 184, 0.16)";

  const handleStep = (s: NudgeStepMm) => {
    triggerHaptic("selection");
    onStepChange(s);
  };

  const startDirectionPress = (dir: NudgeDirection, ev: React.PointerEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    suppressNextClickRef.current = true;
    stopAutoRepeat();
    setActiveHoldDir(dir);
    triggerHaptic("tap");
    onNudgeRef.current(dir);

    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        onNudgeRef.current(dir);
      }, NUDGE_AUTO_REPEAT_INTERVAL_MS);
    }, NUDGE_AUTO_REPEAT_DELAY_MS);
  };

  const handleDirectionClick = (dir: NudgeDirection) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    triggerHaptic("tap");
    onNudgeRef.current(dir);
  };

  const handleOpenCoordInput = () => {
    if (!onSetExactCoord) return;
    triggerHaptic("selection");
    setXInput(cursorPos.x.toFixed(1));
    setYInput(cursorPos.y.toFixed(1));
    setEditingCoord((prev) => !prev);
  };

  const handleApplyCoord = (e: React.FormEvent) => {
    e.preventDefault();
    const nx = Number(xInput.replace(",", "."));
    const ny = Number(yInput.replace(",", "."));
    if (Number.isFinite(nx) && Number.isFinite(ny) && onSetExactCoord) {
      triggerHaptic("action");
      onSetExactCoord({ x: nx, y: ny });
    }
    setEditingCoord(false);
  };

  const renderDirectionalSectorButton = (
    dir: NudgeDirection,
    Icon: typeof ArrowUp,
    posClass: string,
    ariaLabel: string,
    titleText: string,
  ) => {
    const isPressed = activeHoldDir === dir;
    return (
      <button
        type="button"
        data-testid={`chamfer-nudge-${dir}`}
        onPointerDown={(ev) => startDirectionPress(dir, ev)}
        onPointerUp={stopAutoRepeat}
        onPointerLeave={stopAutoRepeat}
        onPointerCancel={stopAutoRepeat}
        onClick={() => handleDirectionClick(dir)}
        aria-label={ariaLabel}
        title={titleText}
        style={{
          backgroundColor: isPressed
            ? accentHex
            : isLight
              ? "rgba(255, 255, 255, 0.94)"
              : "rgba(30, 41, 59, 0.88)",
          color: isPressed ? accentContrast : textPrimary,
          borderColor: isPressed ? accentHex : borderSubtle,
          boxShadow: isPressed
            ? `0 0 12px ${accentHex}66`
            : isLight
              ? "0 2px 5px rgba(15, 23, 42, 0.08)"
              : "0 2px 6px rgba(0, 0, 0, 0.38)",
        }}
        className={cn(
          "absolute flex size-8 items-center justify-center rounded-full border transition-all active:scale-92 cursor-pointer touch-none select-none",
          posClass,
        )}
      >
        <Icon className="size-3.5 stroke-[2.4]" />
      </button>
    );
  };

  return (
    <div
      role="region"
      data-testid="chamfer-nudge-hud"
      aria-label="Controle de Ajuste Fino Incremental CAD"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 156,
        borderRadius: 18,
        backgroundColor: surfaceBg,
        backgroundImage: `linear-gradient(to right, ${microGridLine} 1px, transparent 1px), linear-gradient(to bottom, ${microGridLine} 1px, transparent 1px)`,
        backgroundSize: "12px 12px",
        border: `1px solid ${accentHex}55`,
        boxShadow: isLight
          ? `0 12px 28px rgba(15, 23, 42, 0.14), 0 0 0 1px ${accentHex}22, inset 0 1px 0 rgba(255, 255, 255, 0.8)`
          : `0 14px 32px rgba(0, 0, 0, 0.58), 0 0 16px ${accentHex}1F, inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        color: textPrimary,
      }}
      className={cn(
        "pointer-events-auto fixed bottom-12 left-3 z-40 flex flex-col p-2 select-none",
        className,
      )}
    >
      {/* 1. CABEÇALHO ESTILO LUPA: PÍLULA COM PONTO LUMINOSO NA COR DE DESTAQUE + FIXAR/MINIMIZAR */}
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div
          style={{
            backgroundColor: innerWellBg,
            borderColor: `${accentHex}45`,
          }}
          className="flex items-center gap-1.5 rounded-full border px-2 py-0.5"
        >
          <span
            style={{
              backgroundColor: accentHex,
              boxShadow: `0 0 8px ${accentHex}`,
            }}
            className="size-1.5 shrink-0 rounded-full"
          />
          <span
            style={{ color: textPrimary }}
            className="font-mono text-[9px] font-bold tracking-[0.45px] uppercase truncate max-w-[82px]"
          >
            FINO · {targetLabel}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              setIsPinned((prev) => !prev);
            }}
            title={isPinned ? "Painel fixado na posição" : "Fixar painel"}
            aria-label="Fixar painel de ajuste fino"
            style={{
              backgroundColor: isPinned ? `${accentHex}24` : innerWellBg,
              borderColor: isPinned ? `${accentHex}66` : borderSubtle,
              color: isPinned ? accentHex : textMuted,
            }}
            className="flex size-5 items-center justify-center rounded-md border transition-colors cursor-pointer"
          >
            {isPinned ? <Pin className="size-2.5" /> : <PinOff className="size-2.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                onClose();
              }}
              title="Minimizar ajuste fino"
              aria-label="Ocultar painel de ajuste fino"
              style={{
                backgroundColor: innerWellBg,
                borderColor: borderSubtle,
                color: textMuted,
              }}
              className="flex size-5 items-center justify-center rounded-md border hover:opacity-90 transition-colors cursor-pointer"
            >
              <Minimize2 className="size-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. SELETOR DE PASSO SEGMENTADO SLIM (0.1 | 1 | 5 | 10 mm) */}
      <div
        style={{
          backgroundColor: innerWellBg,
          borderColor: borderSubtle,
        }}
        className="mb-2 grid grid-cols-4 gap-0.5 rounded-full border p-0.5"
      >
        {NUDGE_STEP_OPTIONS.map((opt) => {
          const active = Math.abs(stepMm - opt) < 1e-4;
          return (
            <button
              key={opt}
              type="button"
              data-testid={`chamfer-nudge-step-${opt}`}
              onClick={() => handleStep(opt)}
              style={
                active
                  ? {
                      backgroundColor: accentHex,
                      color: accentContrast,
                      boxShadow: `0 1px 6px ${accentHex}55`,
                    }
                  : {
                      color: textMuted,
                    }
              }
              className="rounded-full py-0.5 font-mono text-[9.5px] font-bold transition-all cursor-pointer"
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* 3. D-PAD TÁTIL CIRCULAR / ANELAR DE ALTA EFICIÊNCIA COM REPETIÇÃO CONTÍNUA AO SEGURAR */}
      <div className="my-0.5 flex items-center justify-center">
        <div
          style={{
            backgroundColor: innerWellBg,
            borderColor: `${accentHex}38`,
            boxShadow: isLight
              ? "inset 0 2px 6px rgba(15, 23, 42, 0.06)"
              : "inset 0 2px 8px rgba(0, 0, 0, 0.48)",
          }}
          className="relative flex size-[116px] items-center justify-center rounded-full border"
        >
          {/* Anel óptico interno sutil e eixos de referência */}
          <svg
            viewBox="0 0 116 116"
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
          >
            <circle
              cx="58"
              cy="58"
              r="41"
              fill="none"
              stroke={accentHex}
              strokeOpacity={0.22}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <line
              x1="58"
              y1="8"
              x2="58"
              y2="108"
              stroke={accentHex}
              strokeOpacity={0.14}
              strokeWidth="1"
            />
            <line
              x1="8"
              y1="58"
              x2="108"
              y2="58"
              stroke={accentHex}
              strokeOpacity={0.14}
              strokeWidth="1"
            />
          </svg>

          {/* Seta Cima (↑) */}
          {renderDirectionalSectorButton(
            "up",
            ArrowUp,
            "top-1 left-1/2 -translate-x-1/2",
            `Mover acima ${stepMm} mm`,
            `Ajuste fino +Y (${stepMm} mm) — segure para avanço contínuo`,
          )}

          {/* Seta Esquerda (←) */}
          {renderDirectionalSectorButton(
            "left",
            ArrowLeft,
            "left-1 top-1/2 -translate-y-1/2",
            `Mover à esquerda ${stepMm} mm`,
            `Ajuste fino -X (${stepMm} mm) — segure para avanço contínuo`,
          )}

          {/* NÚCLEO CENTRAL INTERATIVO (±1 mm / ✓ INÍCIO / PONTO) */}
          {canConfirmPoint && onConfirmPoint ? (
            <button
              type="button"
              data-testid="chamfer-nudge-confirm-btn"
              onClick={() => {
                triggerHaptic("action");
                onConfirmPoint();
              }}
              aria-label={`Confirmar ${confirmLabel}`}
              title={`Fixar ${confirmLabel} na coordenada exata`}
              style={{
                backgroundColor: accentHex,
                color: accentContrast,
                boxShadow: `0 0 12px ${accentHex}66`,
              }}
              className="z-10 flex size-11 flex-col items-center justify-center rounded-full font-mono text-[8px] font-extrabold uppercase transition-transform active:scale-92 cursor-pointer"
            >
              <Check className="size-3 stroke-[2.8]" />
              <span className="mt-0.5 leading-none tracking-tight">{confirmLabel}</span>
            </button>
          ) : (
            <div
              style={{
                backgroundColor: isLight ? "rgba(255, 255, 255, 0.92)" : "rgba(15, 23, 42, 0.92)",
                borderColor: `${accentHex}55`,
                color: accentHex,
              }}
              className="z-10 flex size-11 flex-col items-center justify-center rounded-full border font-mono text-[8.5px] font-bold leading-tight"
            >
              <span>±{stepMm}</span>
              <span style={{ color: textMuted }} className="text-[7px] font-semibold">
                mm
              </span>
            </div>
          )}

          {/* Seta Direita (→) */}
          {renderDirectionalSectorButton(
            "right",
            ArrowRight,
            "right-1 top-1/2 -translate-y-1/2",
            `Mover à direita ${stepMm} mm`,
            `Ajuste fino +X (${stepMm} mm) — segure para avanço contínuo`,
          )}

          {/* Seta Baixo (↓) */}
          {renderDirectionalSectorButton(
            "down",
            ArrowDown,
            "bottom-1 left-1/2 -translate-x-1/2",
            `Mover abaixo ${stepMm} mm`,
            `Ajuste fino -Y (${stepMm} mm) — segure para avanço contínuo`,
          )}
        </div>
      </div>

      {/* 4. RODAPÉ DE TELEMETRIA LIMPO (IDÊNTICO À LUPA): X: 1040.0  Y: 140.0 */}
      {editingCoord ? (
        <form
          onSubmit={handleApplyCoord}
          style={{
            backgroundColor: innerWellBg,
            borderColor: `${accentHex}55`,
          }}
          className="mt-1.5 flex items-center gap-1 rounded-full border px-1.5 py-1"
        >
          <input
            type="text"
            inputMode="decimal"
            value={xInput}
            onChange={(e) => setXInput(e.target.value)}
            aria-label="Coordenada X (mm)"
            placeholder="X"
            style={{ color: textPrimary }}
            className="w-12 bg-transparent text-center font-mono text-[9.5px] font-bold outline-none"
          />
          <span style={{ color: textMuted }} className="text-[9px]">
            |
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={yInput}
            onChange={(e) => setYInput(e.target.value)}
            aria-label="Coordenada Y (mm)"
            placeholder="Y"
            style={{ color: textPrimary }}
            className="w-12 bg-transparent text-center font-mono text-[9.5px] font-bold outline-none"
          />
          <button
            type="submit"
            title="Ir para coordenada X, Y"
            aria-label="Confirmar coordenada"
            style={{ backgroundColor: accentHex, color: accentContrast }}
            className="flex size-4 shrink-0 items-center justify-center rounded-full cursor-pointer"
          >
            <Check className="size-2.5 stroke-[2.8]" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleOpenCoordInput}
          title="Toque para digitar coordenadas X e Y exatas sob demanda"
          style={{
            backgroundColor: innerWellBg,
            borderColor: borderSubtle,
            color: textPrimary,
          }}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[9.5px] tabular-nums hover:opacity-90 transition-opacity cursor-pointer"
        >
          <span>
            <span style={{ color: accentHex }} className="font-bold">
              X:
            </span>{" "}
            <span className="font-semibold">{cursorPos.x.toFixed(1)}</span>
          </span>
          <span style={{ color: textMuted }} className="opacity-50">
            ·
          </span>
          <span>
            <span style={{ color: accentHex }} className="font-bold">
              Y:
            </span>{" "}
            <span className="font-semibold">{cursorPos.y.toFixed(1)}</span>
          </span>
        </button>
      )}
    </div>
  );
}

export interface ChamferVirtualCursorProps {
  visible?: boolean;
  screenPos?: Vec2;
  cadPos?: Vec2;
  activeSnap?: Snap | null;
  basePoint?: Vec2 | null;
  fingerOffsetEnabled?: boolean;
  fingerOffsetY?: number;
  drawingProjection?: "orthographic" | "isometric";
  isoPlane?: IsoPlane;
}

export function ChamferVirtualCursor(_props: ChamferVirtualCursorProps) {
  return null;
}
