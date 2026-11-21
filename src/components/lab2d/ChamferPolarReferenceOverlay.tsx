/**
 * CALDRA CHAMFER — OVERLAY VETORIAL E BARRA COMPACTA DE "REF. POLAR"
 * (Cota de Referência Não-Vetorial em Linha Vermelha Pontilhada)
 *
 * - Renderiza linhas vermelhas pontilhadas (#EF4444, strokeDash: 3 4, 1.25px) com cota
 *   compacta `d = 52.0 mm • ∠ 90.0°` e alvo magnético `⊕` em `P_target`;
 * - Estritamente NÃO-VETORIAL: apenas overlay visual + SNAP prioritário, sem contaminar
 *   `entities`, 3D ou exportação DXF;
 * - Barra superior compacta com chips editáveis `d` e `∠` (Numpad), trava angular polar,
 *   `✓ Fixar Ref.` e `🧹 Limpar Refs`;
 * - 100% sincronizado com `--chamfer-*` (Tema Claro/Escuro/AMOLED + Cor de Destaque).
 */

import React, { useState } from "react";
import { Check, Compass, Crosshair, Trash2, X } from "lucide-react";
import type { Vec2 } from "@/lib/geometry/types";
import type {
  PolarRefOriginAnchor,
  PolarReferenceItem,
} from "@/chamfer/tools/polarReferenceEngine";
import { ChamferDirectDimensionEditor } from "@/components/lab2d/ChamferDirectDimensionEditor";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export interface LivePolarRefPreview {
  originAnchor: PolarRefOriginAnchor;
  target: Vec2;
  distanceMm: number;
  angleDeg: number;
  snappedAngleLabel: string | null;
  isPerpendicularToEdge: boolean;
}

export interface ChamferPolarReferenceSvgOverlayProps {
  polarRefs: PolarReferenceItem[];
  livePreview: LivePolarRefPreview | null;
  hoveredOriginAnchor: PolarRefOriginAnchor | null;
  isPolarRefToolActive: boolean;
  viewK: number;
  datumOrigin?: Vec2 | null;
}

export const ChamferPolarReferenceSvgOverlay: React.FC<ChamferPolarReferenceSvgOverlayProps> = ({
  polarRefs = [],
  livePreview,
  hoveredOriginAnchor,
  isPolarRefToolActive,
  viewK,
  datumOrigin,
}) => {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const dash = `${3 / safeK} ${4 / safeK}`;
  const sw = 1.25 / safeK;

  const renderRefLineAndBadge = (
    key: string,
    origin: Vec2,
    target: Vec2,
    distanceMm: number,
    angleDeg: number,
    isLive: boolean,
    isPerp?: boolean,
  ) => {
    const midX = (origin.x + target.x) / 2;
    const midY = (origin.y + target.y) / 2;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    // Desloca o badge levemente perpendicular à linha para não cobrir a linha pontilhada
    const nx = -dy / len;
    const ny = dx / len;
    const badgeOff = 14 / safeK;
    const bx = midX + nx * badgeOff;
    const by = midY + ny * badgeOff;

    const datumSuffix =
      datumOrigin && isLive
        ? ` | Δ(${(target.x - datumOrigin.x).toFixed(1)}, ${(-(target.y - datumOrigin.y)).toFixed(1)})`
        : "";
    const text = `d = ${distanceMm.toFixed(1)} mm • ∠ ${angleDeg.toFixed(1)}°${isPerp ? " ⊥" : ""}${datumSuffix}`;
    const fontSize = 9.5 / safeK;
    const charW = 5.4 / safeK;
    const padX = 6 / safeK;
    const boxW = text.length * charW + padX * 2;
    const boxH = 16 / safeK;
    const rTarget = 5.5 / safeK;

    return (
      <g key={key} data-testid={isLive ? "polar-ref-live-line" : `polar-ref-item-${key}`}>
        {/* Linha Vermelha Pontilhada Nítida (#EF4444, [3, 4], 1.25px) */}
        <line
          x1={origin.x}
          y1={origin.y}
          x2={target.x}
          y2={target.y}
          stroke="#EF4444"
          strokeWidth={isLive ? sw * 1.15 : sw}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeOpacity={isLive ? 0.98 : 0.9}
        />

        {/* Origem P_ref (micro-ponto vermelho) */}
        <circle
          cx={origin.x}
          cy={origin.y}
          r={3 / safeK}
          fill="#EF4444"
          stroke="#FFFFFF"
          strokeWidth={0.8 / safeK}
        />

        {/* Alvo Magnético ⊕ em P_target */}
        <g data-testid={isLive ? "polar-ref-live-target" : `polar-ref-target-${key}`}>
          <circle
            cx={target.x}
            cy={target.y}
            r={rTarget}
            fill="rgba(239, 68, 68, 0.16)"
            stroke="#EF4444"
            strokeWidth={1.35 / safeK}
          />
          <line
            x1={target.x - rTarget * 1.45}
            y1={target.y}
            x2={target.x + rTarget * 1.45}
            y2={target.y}
            stroke="#EF4444"
            strokeWidth={1.1 / safeK}
          />
          <line
            x1={target.x}
            y1={target.y - rTarget * 1.45}
            x2={target.x}
            y2={target.y + rTarget * 1.45}
            stroke="#EF4444"
            strokeWidth={1.1 / safeK}
          />
          <circle cx={target.x} cy={target.y} r={1.8 / safeK} fill="#FFFFFF" />
        </g>

        {/* Badge compacto de cota em vermelho técnico */}
        <g transform={`translate(${bx}, ${by})`}>
          <rect
            x={-boxW / 2}
            y={-boxH / 2}
            width={boxW}
            height={boxH}
            rx={4 / safeK}
            fill="rgba(127, 29, 29, 0.90)"
            stroke="#EF4444"
            strokeWidth={0.9 / safeK}
          />
          <text
            x={0}
            y={3.2 / safeK}
            textAnchor="middle"
            fill="#FEF2F2"
            fontSize={fontSize}
            fontWeight="700"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            {text}
          </text>
        </g>
      </g>
    );
  };

  return (
    <g
      className="pointer-events-none select-none"
      data-testid="chamfer-polar-reference-overlay"
      aria-label="Overlay de Cotas de Referência Ref. Polar (Não-Vetorial)"
    >
      {/* Referências fixadas (alvos magnéticos ⊕ de prioridade máxima) */}
      {polarRefs.map((item) =>
        renderRefLineAndBadge(
          item.id,
          item.origin,
          item.target,
          item.distanceMm,
          item.angleDeg,
          false,
          item.isPerpendicularToEdge,
        ),
      )}

      {/* Prévia ao vivo durante o arraste ou Mira 55px */}
      {livePreview &&
        renderRefLineAndBadge(
          "live",
          livePreview.originAnchor.point,
          livePreview.target,
          livePreview.distanceMm,
          livePreview.angleDeg,
          true,
          livePreview.isPerpendicularToEdge,
        )}

      {/* Prévia de ancoragem de origem antes do 1º toque */}
      {isPolarRefToolActive && !livePreview && hoveredOriginAnchor && (
        <g data-testid="polar-ref-origin-hover">
          <circle
            cx={hoveredOriginAnchor.point.x}
            cy={hoveredOriginAnchor.point.y}
            r={7 / safeK}
            fill="rgba(239, 68, 68, 0.16)"
            stroke="#EF4444"
            strokeWidth={1.3 / safeK}
            strokeDasharray={`${3 / safeK} ${2.5 / safeK}`}
          />
          <circle
            cx={hoveredOriginAnchor.point.x}
            cy={hoveredOriginAnchor.point.y}
            r={2.2 / safeK}
            fill="#EF4444"
          />
        </g>
      )}
    </g>
  );
};

export interface ChamferPolarReferenceControlBarProps {
  visible: boolean;
  livePreview: LivePolarRefPreview | null;
  polarRefsCount: number;
  lockedDistanceMm: number | null;
  lockedAngleDeg: number | null;
  polarSnapOn: boolean;
  onChangeLockedDistance: (d: number | null) => void;
  onChangeLockedAngle: (deg: number | null) => void;
  onTogglePolarSnap: () => void;
  onCommitPolarRef: (override?: { distanceMm?: number; angleDeg?: number }) => void;
  onClearAllPolarRefs: () => void;
  onExit: () => void;
  uiShellMode?: "compact" | "prumo";
  isDark?: boolean;
}

export const ChamferPolarReferenceControlBar: React.FC<ChamferPolarReferenceControlBarProps> = ({
  visible,
  livePreview,
  polarRefsCount,
  lockedDistanceMm,
  lockedAngleDeg,
  polarSnapOn,
  onChangeLockedDistance,
  onChangeLockedAngle,
  onTogglePolarSnap,
  onCommitPolarRef,
  onClearAllPolarRefs,
  onExit,
  uiShellMode = "compact",
  isDark = true,
}) => {
  // INTEGRAÇÃO EXCLUSIVA AO NUMPAD PRÓPRIO DO CHAMFER (ZERO <input> NATIVO!)
  const [numpadField, setNumpadField] = useState<"dist" | "angle" | null>(null);
  const [numpadScreenPos, setNumpadScreenPos] = useState<{ x: number; y: number }>({
    x: 240,
    y: 120,
  });

  if (!visible && polarRefsCount === 0) return null;

  const currentDist = lockedDistanceMm ?? livePreview?.distanceMm ?? 0;
  const currentAng = lockedAngleDeg ?? livePreview?.angleDeg ?? 90;

  const openChamferNumpad = (
    field: "dist" | "angle",
    ev: React.MouseEvent<HTMLButtonElement>,
  ) => {
    ev.stopPropagation();
    ev.preventDefault();
    const rect = ev.currentTarget.getBoundingClientRect();
    setNumpadScreenPos({
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.bottom + 14),
    });
    setNumpadField(field);
    triggerHaptic("selection");
  };

  // Quando a ferramenta não está ativa, mas existem Ref. Polar fixadas, exibe apenas um micro-chip discreto para limpar
  if (!visible && polarRefsCount > 0) {
    return (
      <div
        data-testid="polar-ref-active-count-chip"
        style={{
          top: uiShellMode === "prumo" ? 52 : 22,
          backgroundColor: "var(--chamfer-popover-bg, rgba(15, 23, 42, 0.9))",
          borderColor: "rgba(239, 68, 68, 0.45)",
          color: "var(--chamfer-text-primary, #f1f5f9)",
        }}
        className="pointer-events-auto absolute right-3 z-35 flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold shadow-md backdrop-blur-md select-none"
      >
        <Crosshair className="size-3 text-red-500" />
        <span>Ref. Polar ({polarRefsCount})</span>
        <button
          type="button"
          data-testid="polar-ref-quick-clear-btn"
          onClick={() => {
            triggerHaptic("action");
            onClearAllPolarRefs();
          }}
          className="rounded-full bg-red-500/20 hover:bg-red-500/35 text-red-400 px-1.5 py-0.5 cursor-pointer transition-colors"
          title="Limpar todas as cotas de referência Ref. Polar"
        >
          🧹 Limpar Refs
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        data-testid="chamfer-polar-ref-bar"
        role="toolbar"
        aria-label="Barra da Ferramenta Ref. Polar"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          top: uiShellMode === "prumo" ? 52 : 22,
          backgroundColor: "var(--chamfer-popover-bg, rgba(10, 15, 26, 0.92))",
          borderColor: "var(--chamfer-border-strong, rgba(239, 68, 68, 0.45))",
          color: "var(--chamfer-text-primary, #f1f5f9)",
        }}
        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 z-[60] flex flex-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-semibold shadow-xl backdrop-blur-xl select-none max-w-[95vw] overflow-x-auto scrollbar-none whitespace-nowrap"
      >
        <span className="flex items-center gap-1 font-extrabold text-red-500 pr-1">
          <Crosshair className="size-3.5" />
          <span>REF. POLAR</span>
        </span>

        {!livePreview ? (
          <span
            style={{ color: "var(--chamfer-text-secondary, #94a3b8)" }}
            className="text-[10px] px-1"
          >
            Toque na borda, vértice, centro ou DATUM
          </span>
        ) : (
          <>
            {/* Chip Distância d (aciona exclusivamente o Numpad próprio do CHAMFER — ZERO teclado nativo) */}
            <button
              type="button"
              data-testid="polar-ref-dist-chip"
              onClick={(e) => openChamferNumpad("dist", e)}
              style={
                numpadField === "dist"
                  ? {
                      backgroundColor: "var(--chamfer-accent, #EF4444)",
                      borderColor: "var(--chamfer-accent, #EF4444)",
                      color: "#FFFFFF",
                    }
                  : undefined
              }
              className={cn(
                "rounded-full border px-2 py-0.5 cursor-pointer shrink-0 transition-colors",
                numpadField !== "dist" &&
                  "border-red-500/45 bg-red-500/15 hover:bg-red-500/25 text-red-400",
              )}
              title="Abrir Numpad CHAMFER para digitar distância exata (mm)"
            >
              d = {currentDist.toFixed(1)} mm ✎
            </button>

            {/* Chip Ângulo ∠ (aciona exclusivamente o Numpad próprio do CHAMFER — ZERO teclado nativo) */}
            <button
              type="button"
              data-testid="polar-ref-angle-chip"
              onClick={(e) => openChamferNumpad("angle", e)}
              style={
                numpadField === "angle"
                  ? {
                      backgroundColor: "var(--chamfer-accent, #EF4444)",
                      borderColor: "var(--chamfer-accent, #EF4444)",
                      color: "#FFFFFF",
                    }
                  : undefined
              }
              className={cn(
                "rounded-full border px-2 py-0.5 cursor-pointer shrink-0 transition-colors",
                numpadField !== "angle" &&
                  "border-red-500/45 bg-red-500/15 hover:bg-red-500/25 text-red-400",
              )}
              title="Abrir Numpad CHAMFER para digitar ângulo exato (°)"
            >
              ∠ {currentAng.toFixed(1)}° ✎
            </button>

            {/* Presets angulares rápidos (0°, 30°, 45°, 90°, 120°) */}
            <div className="hidden sm:flex items-center gap-0.5">
              {[0, 30, 45, 90, 120].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangeLockedAngle(lockedAngleDeg === deg ? null : deg);
                  }}
                  style={
                    lockedAngleDeg === deg
                      ? {
                          backgroundColor: "var(--chamfer-accent, #E11D48)",
                          color: "#FFFFFF",
                        }
                      : undefined
                  }
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold cursor-pointer transition-colors",
                    lockedAngleDeg !== deg && "opacity-75 hover:opacity-100",
                  )}
                >
                  {deg}°
                </button>
              ))}
            </div>

            <button
              type="button"
              data-testid="polar-ref-confirm-btn"
              onClick={() => {
                setNumpadField(null);
                triggerHaptic("success");
                onCommitPolarRef();
              }}
              style={{
                backgroundColor: "var(--chamfer-accent, #E11D48)",
                color: "#FFFFFF",
              }}
              className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold shadow-sm cursor-pointer active:scale-95 shrink-0"
            >
              <Check className="size-3 stroke-[2.6]" />
              <span>Fixar ⊕</span>
            </button>
          </>
        )}

        {/* Toggle Snap Polar */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            onTogglePolarSnap();
          }}
          style={
            polarSnapOn
              ? {
                  borderColor: "var(--chamfer-accent, #E11D48)",
                  color: "var(--chamfer-accent, #E11D48)",
                }
              : undefined
          }
          className="flex items-center gap-0.5 rounded-full border border-current/25 px-2 py-0.5 text-[10px] font-bold cursor-pointer shrink-0"
          title="Trava angular polar (0°, 30°, 45°, 60°, 90°, 120°...)"
        >
          <Compass className="size-3" />
          <span>Polar {polarSnapOn ? "ON" : "OFF"}</span>
        </button>

        {/* Limpar todas as referências */}
        {polarRefsCount > 0 && (
          <button
            type="button"
            data-testid="polar-ref-clear-all-btn"
            onClick={() => {
              setNumpadField(null);
              triggerHaptic("action");
              onClearAllPolarRefs();
            }}
            className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 text-red-400 px-2 py-0.5 text-[10px] font-bold cursor-pointer shrink-0"
            title="Limpar todas as cotas de referência Ref. Polar"
          >
            <Trash2 className="size-3" />
            <span>Limpar ({polarRefsCount})</span>
          </button>
        )}

        {/* Fechar */}
        <button
          type="button"
          onClick={() => {
            setNumpadField(null);
            triggerHaptic("tap");
            onExit();
          }}
          className="flex size-5 items-center justify-center rounded-full hover:bg-red-500/20 opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          title="Sair do modo Ref. Polar (Esc)"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* NUMPAD PRÓPRIO DO CHAMFER PARA DISTÂNCIA (d) E ÂNGULO (∠) — PROIBIDO TECLADO NATIVO */}
      {numpadField && livePreview && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => setNumpadField(null)}
          screenPos={numpadScreenPos}
          currentValue={numpadField === "dist" ? currentDist : currentAng}
          label={numpadField === "dist" ? "Ref. Polar — Distância (d)" : "Ref. Polar — Ângulo (∠)"}
          unit={numpadField === "dist" ? "mm" : "°"}
          allowNegative={numpadField === "angle"}
          presets={
            numpadField === "dist"
              ? [
                  { label: "10", value: 10 },
                  { label: "25", value: 25 },
                  { label: "40", value: 40 },
                  { label: "50", value: 50 },
                  { label: "100", value: 100 },
                ]
              : [
                  { label: "0°", value: 0 },
                  { label: "30°", value: 30 },
                  { label: "45°", value: 45 },
                  { label: "90°", value: 90 },
                  { label: "120°", value: 120 },
                  { label: "180°", value: 180 },
                ]
          }
          onPreviewChange={(val) => {
            if (!Number.isFinite(val)) return;
            if (numpadField === "dist") {
              if (val > 0) onChangeLockedDistance(val);
            } else {
              onChangeLockedAngle(((val % 360) + 360) % 360);
            }
          }}
          onConfirm={(val) => {
            if (Number.isFinite(val)) {
              if (numpadField === "dist" && val > 0) {
                onChangeLockedDistance(val);
                onCommitPolarRef({ distanceMm: val, angleDeg: currentAng });
              } else if (numpadField === "angle") {
                const normAng = ((val % 360) + 360) % 360;
                onChangeLockedAngle(normAng);
              }
            }
            setNumpadField(null);
          }}
        />
      )}
    </>
  );
};

