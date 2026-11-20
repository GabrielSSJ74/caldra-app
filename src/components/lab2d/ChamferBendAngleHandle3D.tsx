/**
 * CALDRA CHAMFER — ALÇA ANGULAR 3D ARRASTÁVEL (DOBRA INTERATIVA NO VIEWPORT)
 *
 * - Hit target >= 44px para toque confortável em celular/tablet e precisão com mouse.
 * - Usa `setPointerCapture` e `stopPropagation` para não disparar pan/órbita do canvas.
 * - Snap magnético suave a cada 5° e snap forte em 30°, 45°, 60°, 90°, 120°, 135°, 180°.
 * - 100% vinculado aos tokens dinâmicos `--chamfer-*` (zero cores hardcoded).
 */

import React, { useRef, useState } from "react";
import { RotateCw, ArrowUp, ArrowDown } from "lucide-react";
import type { BendDirection } from "@/chamfer/sheetMetal/bendTree";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface ChamferBendAngleHandle3DProps {
  visible: boolean;
  angleDeg: number;
  direction: BendDirection;
  label?: string;
  onChangeAngle: (nextAngleDeg: number) => void;
  onToggleDirection: () => void;
}

const MAGNETIC_STOPS = [30, 45, 60, 90, 120, 135, 180];

function applyMagneticAngleSnap(rawDeg: number): number {
  const clamped = Math.max(1, Math.min(180, rawDeg));
  for (const stop of MAGNETIC_STOPS) {
    if (Math.abs(clamped - stop) <= 2.4) {
      return stop;
    }
  }
  const nearest5 = Math.round(clamped / 5) * 5;
  if (Math.abs(clamped - nearest5) <= 1.2 && nearest5 >= 5 && nearest5 <= 180) {
    return nearest5;
  }
  return Math.round(clamped * 2) / 2;
}

export function ChamferBendAngleHandle3D({
  visible,
  angleDeg,
  direction,
  label = "Dobra Ativa",
  onChangeAngle,
  onToggleDirection,
}: ChamferBendAngleHandle3DProps) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; startAngle: number; lastSnap: number } | null>(null);

  if (!visible) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      startAngle: angleDeg,
      lastSnap: angleDeg,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || !startRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - startRef.current.x;
    const dy = startRef.current.y - e.clientY;
    // Arrastar para cima ou direita aumenta o ângulo; ~0.45° por pixel
    const deltaDeg = (dx * 0.45 + dy * 0.55);
    const snapped = applyMagneticAngleSnap(startRef.current.startAngle + deltaDeg);
    if (snapped !== startRef.current.lastSnap) {
      if (MAGNETIC_STOPS.includes(snapped)) {
        triggerHaptic("selection");
      }
      startRef.current.lastSnap = snapped;
      onChangeAngle(snapped);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    startRef.current = null;
  };

  // Arc visual representando o ângulo atual (1°..180°)
  const arcFraction = Math.max(0.02, Math.min(1, angleDeg / 180));
  const arcRad = arcFraction * Math.PI;
  const radius = 16;
  const endX = 22 + Math.cos(Math.PI - arcRad) * radius;
  const endY = 22 - Math.sin(Math.PI - arcRad) * radius;

  return (
    <div
      data-testid="chamfer-bend-angle-handle-3d"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        backgroundColor: "var(--chamfer-popover-bg)",
        borderColor: dragging ? "var(--chamfer-accent)" : "var(--chamfer-border-strong)",
        color: "var(--chamfer-text-primary)",
        boxShadow: "var(--chamfer-toast-shadow)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      className="fixed left-1/2 top-[104px] z-[112] flex -translate-x-1/2 items-center gap-2 rounded-2xl border px-2.5 py-1.5 select-none transition-colors"
    >
      <button
        type="button"
        aria-label="Arrastar para ajustar ângulo da dobra em 3D"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          backgroundColor: dragging ? "var(--chamfer-accent)" : "var(--chamfer-accent-soft)",
          borderColor: "var(--chamfer-accent-border)",
          color: dragging ? "var(--chamfer-accent-contrast)" : "var(--chamfer-accent)",
        }}
        className="flex min-h-[44px] min-w-[44px] cursor-ew-resize items-center justify-center rounded-xl border touch-none transition"
        title="Arraste para variar o grau (snap em 5°, 45°, 90°, 135°)"
      >
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <path
            d="M 6 22 A 16 16 0 0 1 38 22"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.28"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={`M 6 22 A 16 16 0 0 1 ${endX.toFixed(1)} ${endY.toFixed(1)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={endX} cy={endY} r="3.5" fill="currentColor" />
          <RotateCw x="16" y="23" width="12" height="12" />
        </svg>
      </button>

      <div className="flex flex-col leading-tight">
        <span
          style={{ color: "var(--chamfer-text-secondary)" }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          {label}
        </span>
        <span
          style={{ color: "var(--chamfer-accent)" }}
          className="font-mono text-sm font-bold tabular-nums"
        >
          {angleDeg.toFixed(1)}° {direction === "UP" ? "CIMA" : "BAIXO"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          triggerHaptic("selection");
          onToggleDirection();
        }}
        style={{
          backgroundColor: "var(--chamfer-surface-elevated)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-primary)",
        }}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition hover:border-[var(--chamfer-accent)] cursor-pointer"
        title="Inverter sentido da dobra (Cima / Baixo)"
      >
        {direction === "UP" ? (
          <ArrowUp style={{ color: "var(--chamfer-accent)" }} className="size-4" />
        ) : (
          <ArrowDown style={{ color: "var(--chamfer-accent)" }} className="size-4" />
        )}
      </button>
    </div>
  );
}
