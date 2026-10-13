/**
 * CALDRA CHAMFER — CURSOR GEOMÉTRICO VIRTUAL TOUCH (SEÇÃO 11)
 *
 * Elimina a dependência de cursores de mouse convencionais em dispositivos móveis:
 *  - Aplica deslocamento (finger offset) configurável para não ocluir o ponto de mira com o dedo;
 *  - Retículo de mira cruzada com anéis de captura milimétrica;
 *  - HUD flutuante com coordenadas (X, Y) em mm;
 *  - Distância e ângulo instantâneos em relação ao ponto de referência;
 *  - Identificador visual do snap ativo (extremidade, ponto médio, centro, interseção, tangência);
 *  - Confirmação tátil sob demanda.
 */

import React from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Snap } from "@/lib/lab2d/core";
import { Crosshair, Magnet, Box } from "lucide-react";
import { canvasToIsoPlane, type IsoPlane } from "@/lib/lab2d/isometricEngine";

export interface ChamferVirtualCursorProps {
  visible: boolean;
  screenPos: Vec2;       // Posição de tela do toque (px)
  cadPos: Vec2;          // Coordenadas mundiais em mm
  activeSnap: Snap | null;
  basePoint?: Vec2 | null;
  fingerOffsetEnabled?: boolean;
  fingerOffsetY?: number; // Deslocamento vertical padrão em px (ex: -65px)
  drawingProjection?: "orthographic" | "isometric";
  isoPlane?: IsoPlane;
}

export function ChamferVirtualCursor({
  visible,
  screenPos,
  cadPos,
  activeSnap,
  basePoint,
  fingerOffsetEnabled = true,
  fingerOffsetY = -65,
  drawingProjection = "orthographic",
  isoPlane = "top",
}: ChamferVirtualCursorProps) {
  if (
    !visible ||
    !screenPos ||
    !cadPos ||
    !Number.isFinite(screenPos.x) ||
    !Number.isFinite(screenPos.y) ||
    !Number.isFinite(cadPos.x) ||
    !Number.isFinite(cadPos.y)
  ) {
    return null;
  }

  // Posição do retículo com compensação de oclusão do dedo
  const targetX = screenPos.x;
  const targetY = fingerOffsetEnabled ? screenPos.y + fingerOffsetY : screenPos.y;

  // Coordenadas no plano isométrico (quando ativo)
  const isIso = drawingProjection === "isometric";
  const isoCoords = isIso ? canvasToIsoPlane(isoPlane, cadPos) : null;

  // Distância e ângulo em relação à base
  let distMm = 0;
  let angleDeg = 0;
  if (basePoint) {
    const dx = cadPos.x - basePoint.x;
    const dy = cadPos.y - basePoint.y;
    distMm = Math.hypot(dx, dy);
    angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
  }

  return (
    <div
      className="fixed z-40 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 select-none"
      style={{ left: `${targetX}px`, top: `${targetY}px` }}
    >
      {/* Retículo Circular de Precisão CAD */}
      <div className="relative size-14 rounded-full border border-accent/60 bg-accent/5 backdrop-blur-xs flex items-center justify-center">
        {/* Cruz de Alinhamento */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-accent/50" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-accent/50" />

        {/* Ponto de Mira Central */}
        <div className="size-2 rounded-full bg-accent shadow-sm ring-2 ring-background z-10" />

        {/* Snap Ativo */}
        {activeSnap && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent text-[9px] font-bold text-accent-foreground shadow-md uppercase tracking-wider whitespace-nowrap">
            <Magnet className="size-2.5" />
            <span>{activeSnap.kind}</span>
          </div>
        )}
      </div>

      {/* Caixa de Leitura Digital Numérica */}
      <div className="mt-1 mx-auto bg-card/95 border border-border/80 backdrop-blur-md rounded-lg px-2.5 py-1 text-center shadow-lg w-max max-w-[180px]">
        {isIso && isoCoords ? (
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-foreground font-semibold">
              <span>U: {isoCoords.u.toFixed(1)}</span>
              <span className="text-muted-foreground">·</span>
              <span>V: {isoCoords.v.toFixed(1)}</span>
            </div>
            <span className="font-mono text-[8px] uppercase tracking-wider text-accent font-bold">
              ISO {isoPlane.toUpperCase()}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-foreground font-semibold">
            <span>X: {cadPos.x.toFixed(1)}</span>
            <span className="text-muted-foreground">·</span>
            <span>Y: {cadPos.y.toFixed(1)}</span>
          </div>
        )}
        {basePoint && (
          <div className="flex items-center justify-center gap-2 font-mono text-[9px] text-accent mt-0.5">
            <span>{distMm.toFixed(1)} mm</span>
            <span>{angleDeg.toFixed(1)}°</span>
          </div>
        )}
      </div>

      {/* Linha guia conectora para o ponto onde o dedo toca na tela */}
      {fingerOffsetEnabled && (
        <div
          className="w-px bg-accent/30 mx-auto"
          style={{ height: `${Math.abs(fingerOffsetY) - 20}px` }}
        />
      )}
    </div>
  );
}
