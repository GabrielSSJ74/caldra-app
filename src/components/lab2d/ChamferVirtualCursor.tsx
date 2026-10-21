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
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Check, Crosshair, Minimize2 } from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export const TOUCH_CURSOR_OFFSET_PX = 55;
export const TOUCH_TOP_INVERSION_THRESHOLD_PX = 120;

export type NudgeDirection = "up" | "down" | "left" | "right";
export type NudgeStepMm = 0.1 | 1 | 5 | 10;

export const NUDGE_STEP_OPTIONS: NudgeStepMm[] = [0.1, 1, 5, 10];

/**
 * Determina se a ferramenta ativa deve aplicar o deslocamento anti-oclusão (55px) quando operada via toque (`touch`).
 * No uso com mouse físico (`pointerType === 'mouse'`), retorna sempre `false` (comportamento 1:1 tradicional).
 */
export function shouldUseTouchOffset(
  pointerType: string | undefined,
  tool: string,
  isDraggingNode = false,
  isDraggingEntity = false,
): boolean {
  if (pointerType !== "touch") return false;
  if (tool === "pan") return false;
  if (isDraggingNode || isDraggingEntity) return true;

  return (
    tool === "line" ||
    tool === "polyline" ||
    tool === "rect" ||
    tool === "rrect" ||
    tool === "circle" ||
    tool === "ellipse" ||
    tool === "arc" ||
    tool === "polygon" ||
    tool === "slot" ||
    tool === "point" ||
    tool === "text" ||
    tool === "dim" ||
    tool.startsWith("dim_") ||
    tool === "measure" ||
    tool === "fillet" ||
    tool === "chamfer" ||
    tool === "smart_trim" ||
    tool === "trim" ||
    tool === "extend" ||
    tool === "offset" ||
    tool === "divide" ||
    tool === "center" ||
    tool === "move" ||
    tool === "node" ||
    tool === "leader"
  );
}

export interface TouchCursorCalculationInput {
  clientX: number;
  clientY: number;
  pointerType?: string;
  canvasRect: { left: number; top: number };
  panX: number;
  panY: number;
  zoom: number;
  offsetEnabled: boolean;
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
 * Calcula matematicamente a coordenada do cursor geométrico com compensação de zoom e auto-inversão de borda:
 *  - Mouse (`pointerType === 'mouse'` ou `offsetEnabled === false`): 1:1 direto (`offsetY = 0`)
 *  - Touch (`pointerType === 'touch'` e `offsetEnabled === true`):
 *      Projetado 55px acima do ponto de contato (`offsetY = -55`).
 *      Se `touchClientY < 120` (ou muito próximo à borda superior do canvas), inverte para `+55px` abaixo do dedo.
 */
export function computeTouchCursorScreenAndWorld({
  clientX,
  clientY,
  pointerType,
  canvasRect,
  panX,
  panY,
  zoom,
  offsetEnabled,
}: TouchCursorCalculationInput): TouchCursorCalculationResult {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;
  const left = Number.isFinite(canvasRect.left) ? canvasRect.left : 0;
  const top = Number.isFinite(canvasRect.top) ? canvasRect.top : 0;

  const isTouch = pointerType === "touch" && offsetEnabled;
  const isNearTopEdge = clientY < TOUCH_TOP_INVERSION_THRESHOLD_PX || clientY - top < 72;
  const offsetY = isTouch ? (isNearTopEdge ? TOUCH_CURSOR_OFFSET_PX : -TOUCH_CURSOR_OFFSET_PX) : 0;

  const cursorScreenX = clientX;
  const cursorScreenY = clientY + offsetY;

  const touchWorldX = (clientX - left - safePanX) / safeZoom;
  const touchWorldY = (clientY - top - safePanY) / safeZoom;

  const cursorWorldX = (cursorScreenX - left - safePanX) / safeZoom;
  const cursorWorldY = (cursorScreenY - top - safePanY) / safeZoom;

  return {
    cursorScreenX,
    cursorScreenY,
    cursorWorldX,
    cursorWorldY,
    touchWorldX,
    touchWorldY,
    offsetY,
    isInverted: isTouch && isNearTopEdge,
  };
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

function resolveAccentHex(accent: AccentColor, dark: boolean): string {
  switch (accent) {
    case "amber":
      return dark ? "#F59E0B" : "#D97706";
    case "crimson":
    case "magenta":
      return dark ? "#EF4444" : "#B22222";
    case "default":
      return dark ? "#CBD5E1" : "#334155";
    case "blue":
    default:
      return dark ? "#38BDF8" : "#0066FF";
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
  const gap = 4.5 * inv;
  const arm = 15 * inv;
  const crosshairSpan = 2200 * inv;
  const crosshairStart = 19 * inv;
  const ringR = (isObjectSnap ? 6.5 : 5.5) * inv;

  const hasValidTouchOrigin =
    touchOffsetActive &&
    touchWorld &&
    Number.isFinite(touchWorld.x) &&
    Number.isFinite(touchWorld.y) &&
    Math.hypot(target.x - touchWorld.x, target.y - touchWorld.y) > 4 * inv;

  return (
    <g
      className="chamfer-technical-cursor pointer-events-none select-none"
      aria-label="Mira técnica de precisão CAD"
    >
      {/* 1. HASTE GUIA ELÁSTICA DISCRETA (CONEXÃO TOQUE DO DEDO -> CURSOR DESLOCADO) */}
      {hasValidTouchOrigin && touchWorld && (
        <g aria-label="Haste guia elástica anti-oclusão">
          {/* Anel sutil no ponto físico de contato do dedo */}
          <circle
            cx={touchWorld.x}
            cy={touchWorld.y}
            r={4.5 * inv}
            fill="none"
            stroke={primaryColor}
            strokeWidth={1 * inv}
            strokeOpacity={effectiveIsDark ? 0.38 : 0.35}
          />
          <circle
            cx={touchWorld.x}
            cy={touchWorld.y}
            r={1.3 * inv}
            fill={primaryColor}
            fillOpacity={effectiveIsDark ? 0.45 : 0.4}
          />
          {/* Linha guia fina semitransparente pontilhada */}
          <line
            x1={touchWorld.x}
            y1={touchWorld.y}
            x2={target.x}
            y2={target.y}
            stroke={primaryColor}
            strokeWidth={1 * inv}
            strokeOpacity={effectiveIsDark ? 0.48 : 0.42}
            strokeDasharray={`${3 * inv},${3 * inv}`}
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

      {/* 3. MIRA TÉCNICA PRINCIPAL (RETÍCULO DE METROLOGIA 1PX + PICKBOX) */}
      <g>
        {/* Halo de contraste sutil para legibilidade absoluta em ambos os temas */}
        <circle
          cx={target.x}
          cy={target.y}
          r={ringR}
          fill="none"
          stroke={effectiveIsDark ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.85)"}
          strokeWidth={2.2 * inv}
        />

        {/* Anel / Pickbox Central */}
        <circle
          cx={target.x}
          cy={target.y}
          r={ringR}
          fill={isObjectSnap ? (effectiveIsDark ? "rgba(16, 185, 129, 0.14)" : "rgba(5, 150, 105, 0.12)") : "none"}
          stroke={primaryColor}
          strokeWidth={(isObjectSnap ? 1.35 : 1.05) * inv}
        />

        {/* Braços da Mira Técnica (1px) */}
        <line
          x1={target.x - arm}
          y1={target.y}
          x2={target.x - gap}
          y2={target.y}
          stroke={primaryColor}
          strokeWidth={1.15 * inv}
          strokeLinecap="round"
        />
        <line
          x1={target.x + gap}
          y1={target.y}
          x2={target.x + arm}
          y2={target.y}
          stroke={primaryColor}
          strokeWidth={1.15 * inv}
          strokeLinecap="round"
        />
        <line
          x1={target.x}
          y1={target.y - arm}
          x2={target.x}
          y2={target.y - gap}
          stroke={primaryColor}
          strokeWidth={1.15 * inv}
          strokeLinecap="round"
        />
        <line
          x1={target.x}
          y1={target.y + gap}
          x2={target.x}
          y2={target.y + arm}
          stroke={primaryColor}
          strokeWidth={1.15 * inv}
          strokeLinecap="round"
        />

        {/* Ponto de precisão exata no centro (1.4px) */}
        <circle
          cx={target.x}
          cy={target.y}
          r={1.4 * inv}
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
  canConfirmPoint?: boolean;
  confirmLabel?: string;
  targetLabel?: string;
  cursorPos: Vec2;
  onClose?: () => void;
  isDark?: boolean;
  className?: string;
}

/**
 * HUD Técnico de Ajuste Fino Incremental (Nudge — Padrão Desktop no Touch)
 * Permite deslocar o cursor geométrico, o vértice ativo ou a peça selecionada
 * em incrementos cirúrgicos (0.1mm, 1mm, 5mm, 10mm) e confirmar o ponto sem oscilação do dedo.
 */
export function ChamferNudgeControlHUD({
  visible,
  stepMm,
  onStepChange,
  onNudge,
  onConfirmPoint,
  canConfirmPoint = false,
  confirmLabel = "PONTO",
  targetLabel = "CURSOR",
  cursorPos,
  onClose,
  className,
}: ChamferNudgeControlHUDProps) {
  if (!visible) return null;

  const handleStep = (s: NudgeStepMm) => {
    triggerHaptic("selection");
    onStepChange(s);
  };

  const handleDir = (dir: NudgeDirection) => {
    triggerHaptic("tap");
    onNudge(dir);
  };

  return (
    <div
      role="region"
      aria-label="Controle de Ajuste Fino Incremental CAD"
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "hud-loupe-card pointer-events-auto fixed bottom-12 left-3 z-40 flex w-[156px] flex-col rounded-[12px] p-2 select-none",
        className,
      )}
    >
      {/* CABEÇALHO INTEGRADO: MODO + BOTÃO MINIMIZAR */}
      <div className="flex items-center justify-between pb-1.5">
        <div className="flex items-center gap-1">
          <Crosshair className="size-3 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="font-mono text-[9.5px] font-semibold tracking-[0.4px] uppercase">
            FINO · {targetLabel}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              onClose();
            }}
            title="Ocultar painel de ajuste fino"
            aria-label="Ocultar painel de ajuste fino"
            className="hud-loupe-pin-btn flex size-5 items-center justify-center rounded-[5px] cursor-pointer"
          >
            <Minimize2 className="size-3" />
          </button>
        )}
      </div>

      {/* SELETOR DE PASSO INCREMENTAL (0.1 | 1 | 5 | 10 mm) */}
      <div className="hud-loupe-viewport mb-1.5 grid grid-cols-4 gap-0.5 rounded-[7px] p-0.5">
        {NUDGE_STEP_OPTIONS.map((opt) => {
          const active = Math.abs(stepMm - opt) < 1e-4;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleStep(opt)}
              className={cn(
                "rounded-[5px] py-1 font-mono text-[9.5px] font-semibold transition-colors cursor-pointer",
                active
                  ? "bg-accent text-accent-foreground shadow-2xs"
                  : "hud-loupe-muted hover:text-foreground",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* D-PAD DIRECIONAL DE PRECISÃO + AÇÃO CENTRAL */}
      <div className="grid grid-cols-3 gap-1">
        <div />
        <button
          type="button"
          onClick={() => handleDir("up")}
          aria-label={`Mover acima ${stepMm} mm`}
          title={`Ajuste fino +Y (${stepMm} mm)`}
          className="hud-loupe-viewport flex h-8 items-center justify-center rounded-[7px] hover:border-accent active:scale-95 transition-all cursor-pointer"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <div />

        <button
          type="button"
          onClick={() => handleDir("left")}
          aria-label={`Mover à esquerda ${stepMm} mm`}
          title={`Ajuste fino -X (${stepMm} mm)`}
          className="hud-loupe-viewport flex h-8 items-center justify-center rounded-[7px] hover:border-accent active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
        </button>

        {canConfirmPoint && onConfirmPoint ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic("action");
              onConfirmPoint();
            }}
            aria-label={`Confirmar ${confirmLabel}`}
            title={`Fixar ${confirmLabel} na coordenada exata`}
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
            className="flex h-8 flex-col items-center justify-center rounded-[7px] font-mono text-[8.5px] font-bold uppercase shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Check className="size-3 stroke-[2.5]" />
            <span className="leading-none mt-0.5">{confirmLabel}</span>
          </button>
        ) : (
          <div className="hud-loupe-viewport flex h-8 flex-col items-center justify-center rounded-[7px] font-mono text-[8.5px] hud-loupe-muted">
            <span>±{stepMm}</span>
            <span className="text-[7.5px]">mm</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => handleDir("right")}
          aria-label={`Mover à direita ${stepMm} mm`}
          title={`Ajuste fino +X (${stepMm} mm)`}
          className="hud-loupe-viewport flex h-8 items-center justify-center rounded-[7px] hover:border-accent active:scale-95 transition-all cursor-pointer"
        >
          <ArrowRight className="size-3.5" />
        </button>

        <div />
        <button
          type="button"
          onClick={() => handleDir("down")}
          aria-label={`Mover abaixo ${stepMm} mm`}
          title={`Ajuste fino -Y (${stepMm} mm)`}
          className="hud-loupe-viewport flex h-8 items-center justify-center rounded-[7px] hover:border-accent active:scale-95 transition-all cursor-pointer"
        >
          <ArrowDown className="size-3.5" />
        </button>
        <div />
      </div>

      {/* RODAPÉ DE COORDENADAS ATUAIS */}
      <div className="mt-1.5 flex items-center justify-center gap-1 border-t border-line/60 pt-1 font-mono text-[9.5px] tabular-nums">
        <span className="hud-loupe-muted">X:</span>
        <span className="font-semibold">{cursorPos.x.toFixed(1)}</span>
        <span className="hud-loupe-sep mx-0.5">|</span>
        <span className="hud-loupe-muted">Y:</span>
        <span className="font-semibold">{cursorPos.y.toFixed(1)}</span>
      </div>
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
