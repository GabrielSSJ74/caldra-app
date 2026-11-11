/**
 * CHAMFER CAD — INDICADOR INTERATIVO DE EIXOS 3D (GIZMO X Y Z)
 *
 * Especificação (Seção 6):
 * - Exibido em canto não intrusivo da área de desenho do CHAMFER.
 * - Eixo X: Vermelho (#ef4444)
 * - Eixo Y: Verde (#22c55e)
 * - Eixo Z: Azul/Ciano (#3b82f6 / #06b6d4)
 * - Anel orbital circular sutil ao redor dos eixos.
 * - Sincronizado em tempo real com (θ, φ).
 * - Clique em uma ponta de eixo (+X, +Y, +Z, -X, -Y, -Z) alinha suavemente a câmera.
 * - Arraste direto sobre o Gizmo rotaciona a órbita imediatamente, mesmo quando o modo
 *   ÓRBITA 3D não estiver ativo na barra superior.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  computeGizmoAxesProjection,
  getOrbitPresetDefinition,
  isFlatTop2DView,
  type OrbitPresetId,
} from "@/lib/lab2d/orbit3dController";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";

export interface ChamferAxesGizmo3DProps {
  azimuthDeg: number;
  elevationDeg: number;
  activePreset: OrbitPresetId;
  isOrbitToolActive: boolean;
  onSelectPreset: (presetId: OrbitPresetId) => void;
  onDragOrbitDelta: (deltaScreenX: number, deltaScreenY: number) => void;
  onToggleOrbitTool?: () => void;
  isDark?: boolean;
  className?: string;
}

export const ChamferAxesGizmo3D = React.memo(function ChamferAxesGizmo3D({
  azimuthDeg,
  elevationDeg,
  activePreset,
  isOrbitToolActive,
  onSelectPreset,
  onDragOrbitDelta,
  onToggleOrbitTool,
  isDark = true,
  className,
}: ChamferAxesGizmo3DProps) {
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);
  const [isFluxHidden, setIsFluxHidden] = useState(false);

  useEffect(() => {
    const onFluxDrag = (ev: Event) => {
      const active = Boolean(
        (ev as CustomEvent<{ isManipulating?: boolean }>).detail?.isManipulating,
      );
      setIsFluxHidden(active);
    };
    window.addEventListener("chamfer-flux-drag-state", onFluxDrag);
    return () => window.removeEventListener("chamfer-flux-drag-state", onFluxDrag);
  }, []);

  const axes = useMemo(
    () => computeGizmoAxesProjection(azimuthDeg, elevationDeg),
    [azimuthDeg, elevationDeg],
  );

  // Ordena hastes por profundidade Z para desenhar primeiro as que estão atrás
  const sortedEndpoints = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      isPositive: boolean;
      dx: number;
      dy: number;
      dz: number;
      color: string;
      preset: OrbitPresetId;
    }> = [];

    for (const ax of axes) {
      items.push({
        id: `+${ax.axis}`,
        label: ax.axis,
        isPositive: true,
        dx: ax.dx,
        dy: ax.dy,
        dz: ax.dz,
        color: ax.color,
        preset: ax.positivePreset,
      });
      items.push({
        id: ax.negAxis,
        label: ax.negAxis,
        isPositive: false,
        dx: -ax.dx,
        dy: -ax.dy,
        dz: -ax.dz,
        color: ax.negColor,
        preset: ax.negativePreset,
      });
    }

    return items.sort((a, b) => a.dz - b.dz);
  }, [axes]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const sess = dragSessionRef.current;
    if (!sess || sess.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - sess.lastX;
    const dy = e.clientY - sess.lastY;
    const totalDist = Math.hypot(e.clientX - sess.startX, e.clientY - sess.startY);
    if (totalDist > 3) {
      if (!sess.moved) {
        sess.moved = true;
        setIsDraggingGizmo(true);
      }
      sess.lastX = e.clientX;
      sess.lastY = e.clientY;
      onDragOrbitDelta(dx, dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const sess = dragSessionRef.current;
    if (!sess || sess.pointerId !== e.pointerId) return;
    e.stopPropagation();
    dragSessionRef.current = null;
    setIsDraggingGizmo(false);
  };

  const handleAxisClick = (e: React.MouseEvent, preset: OrbitPresetId) => {
    e.stopPropagation();
    if (dragSessionRef.current?.moved) return;
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    onSelectPreset(preset);
  };

  const isTilted = !isFlatTop2DView(azimuthDeg, elevationDeg);
  const presetDef = getOrbitPresetDefinition(activePreset);
  const center = 44;
  const axisRadius = 29;

  return (
    <div
      data-testid="chamfer-axes-gizmo-3d"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        background: isDark ? "rgba(15, 23, 42, 0.86)" : "rgba(255, 255, 255, 0.90)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: isOrbitToolActive
          ? "1px solid rgba(6, 182, 212, 0.55)"
          : isDark
            ? "1px solid rgba(148, 163, 184, 0.18)"
            : "1px solid rgba(148, 163, 184, 0.32)",
        borderRadius: "12px",
      }}
      className={cn(
        "select-none touch-none flex flex-col items-center p-1.5 shadow-xl transition-all duration-150 ease-out",
        isFluxHidden
          ? "pointer-events-none opacity-0 scale-95"
          : "pointer-events-auto opacity-100 scale-100",
        isDraggingGizmo ? "cursor-grabbing ring-1 ring-cyan-400/60" : "cursor-grab",
        className,
      )}
      title="Gizmo de Orientação 3D (X Y Z) — Arraste para orbitar ou clique em X/Y/Z para alinhar vista"
    >
      <svg
        width={88}
        height={88}
        viewBox="0 0 88 88"
        className="overflow-visible"
        aria-label="Indicador de Eixos 3D X Y Z"
      >
        {/* Anel orbital circular sutil ao redor dos eixos */}
        <circle
          cx={center}
          cy={center}
          r={axisRadius + 6}
          fill="none"
          stroke={isOrbitToolActive ? "rgba(6, 182, 212, 0.42)" : "rgba(148, 163, 184, 0.20)"}
          strokeWidth={1.1}
          strokeDasharray="3 2.5"
        />

        {/* Anel equatorial inclinado sutil */}
        <ellipse
          cx={center}
          cy={center}
          rx={axisRadius}
          ry={Math.max(4, Math.abs(Math.sin((elevationDeg * Math.PI) / 180)) * axisRadius)}
          fill="none"
          stroke="rgba(56, 189, 248, 0.14)"
          strokeWidth={0.9}
        />

        {/* Hastes e pontas ordenadas por profundidade Z */}
        {sortedEndpoints.map((ep) => {
          const x2 = center + ep.dx * axisRadius;
          const y2 = center + ep.dy * axisRadius;

          return (
            <g key={ep.id}>
              {/* Linha do centro até a extremidade */}
              <line
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke={ep.color}
                strokeWidth={ep.isPositive ? 2.1 : 1.15}
                strokeLinecap="round"
                strokeDasharray={ep.isPositive ? undefined : "2 2"}
              />

              {/* Ponta clicável do eixo */}
              <g
                role="button"
                tabIndex={-1}
                data-testid={`chamfer-gizmo-axis-${ep.id}`}
                onClick={(ev) => handleAxisClick(ev, ep.preset)}
                className="cursor-pointer group"
              >
                <title>
                  {ep.isPositive
                    ? `Alinhar ao eixo +${ep.label} (${getOrbitPresetDefinition(ep.preset).label})`
                    : `Alinhar ao eixo ${ep.label} (${getOrbitPresetDefinition(ep.preset).label})`}
                </title>
                {/* Hit target expandido invisível para toque fácil */}
                <circle cx={x2} cy={y2} r={10} fill="transparent" />

                {ep.isPositive ? (
                  <>
                    <circle
                      cx={x2}
                      cy={y2}
                      r={7.5}
                      fill={ep.color}
                      stroke={isDark ? "#0f172a" : "#ffffff"}
                      strokeWidth={1.2}
                      className="transition-transform duration-100 group-hover:scale-110"
                    />
                    <text
                      x={x2}
                      y={y2 + 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize="8.5"
                      fontFamily="ui-monospace, monospace"
                      fontWeight="800"
                      className="pointer-events-none select-none"
                    >
                      {ep.label}
                    </text>
                  </>
                ) : (
                  <circle
                    cx={x2}
                    cy={y2}
                    r={3.6}
                    fill={isDark ? "#0f172a" : "#f8fafc"}
                    stroke={ep.color.replace("0.38", "0.85")}
                    strokeWidth={1.3}
                  />
                )}
              </g>
            </g>
          );
        })}

        {/* Pivô central do Gizmo */}
        <circle
          cx={center}
          cy={center}
          r={2.8}
          fill={isDark ? "#e2e8f0" : "#1e293b"}
          stroke="#06b6d4"
          strokeWidth={1}
        />
      </svg>

      {/* Barra inferior compacta do Gizmo: vista ativa + botões rápidos ISO / 2D */}
      <div className="mt-0.5 flex w-full items-center justify-between gap-1 border-t border-slate-800/60 pt-1 px-0.5">
        <button
          type="button"
          data-testid="chamfer-gizmo-preset-pill"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic("selection");
            onSelectPreset(isTilted ? "top" : "iso_se");
          }}
          title={
            isTilted
              ? "Clique para retornar à vista Superior (2D Plana 0°)"
              : "Clique para inclinar em perspectiva Isométrica 3D"
          }
          className={cn(
            "flex-1 truncate rounded px-1.5 py-0.5 text-center font-mono text-[8.5px] font-bold uppercase transition-colors cursor-pointer",
            isTilted
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/30"
              : isDark
                ? "bg-slate-900 text-slate-300 border border-slate-800 hover:text-white"
                : "bg-slate-100 text-slate-700 border border-slate-300",
          )}
        >
          {activePreset === "free" ? (isTilted ? "LIVRE" : "SUP 2D") : presetDef.shortLabel}
        </button>

        {onToggleOrbitTool && (
          <button
            type="button"
            data-testid="chamfer-gizmo-orbit-toggle"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              onToggleOrbitTool();
            }}
            title={isOrbitToolActive ? "Desativar arraste de Órbita 3D" : "Ativar arraste de Órbita 3D"}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase transition-colors cursor-pointer",
              isOrbitToolActive
                ? "bg-cyan-500 text-slate-950"
                : isDark
                  ? "bg-slate-800/90 text-slate-400 hover:text-white"
                  : "bg-slate-200 text-slate-600 hover:text-slate-900",
            )}
          >
            ⟳
          </button>
        )}
      </div>
    </div>
  );
});
