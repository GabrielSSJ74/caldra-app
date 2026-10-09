/**
 * CALDRA CHAMFER — CURSOR CAD VIRTUAL E LUPA DE PRECISÃO (ETAPA 28)
 *
 * Exibe um visor ampliado magnético suspenso acima do dedo do operador:
 *  - Evita que o dedo obstrua a visão do snap ou da interseção geométrica;
 *  - Alvo ampliado com mira cruzada (crosshair) e ponto magnético ativo;
 *  - Leituras em tempo real: Coordenadas (X, Y) em mm, Snap ativo, Distância e Ângulo;
 *  - Badge tátil de confirmação precisa.
 */

import React from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Snap } from "@/lib/lab2d/core";
import { Crosshair, Magnet, Target } from "lucide-react";

interface ChamferPrecisionLoupeOverlayProps {
  visible: boolean;
  screenPos: Vec2; // Posição do toque do dedo na tela (px)
  cadPos: Vec2;    // Coordenada geométrica real do desenho (mm)
  activeSnap?: Snap | null;
  baseCadPoint?: Vec2 | null;
  isDark?: boolean;
}

export function ChamferPrecisionLoupeOverlay({
  visible,
  screenPos,
  cadPos,
  activeSnap,
  baseCadPoint,
}: ChamferPrecisionLoupeOverlayProps) {
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

  // Distância calculada da base (se estiver desenhando linha/arco)
  let distMm = 0;
  let angleDeg = 0;
  if (baseCadPoint) {
    const dx = cadPos.x - baseCadPoint.x;
    const dy = cadPos.y - baseCadPoint.y;
    distMm = Math.hypot(dx, dy);
    angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
  }

  // Desloca a lupa 90px para cima do toque para nunca ser coberta pelo dedo
  const loupeX = screenPos.x;
  const loupeY = Math.max(50, screenPos.y - 95);

  return (
    <div
      className="pointer-events-none fixed z-50 transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
      style={{ left: `${loupeX}px`, top: `${loupeY}px` }}
    >
      {/* Círculo da Lupa com anel metálico CALDRA Glass */}
      <div className="relative w-28 h-28 rounded-full bg-background/90 backdrop-blur-xl border-2 border-accent/70 shadow-2xl flex items-center justify-center overflow-hidden">
        {/* Mira Cruzada (Retículo CAD) */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-accent/40" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-accent/40" />

        {/* Círculos concêntricos de tolerância */}
        <div className="absolute w-12 h-12 rounded-full border border-accent/20" />
        <div className="absolute w-20 h-20 rounded-full border border-accent/15" />

        {/* Ponto central */}
        <div className="w-2.5 h-2.5 rounded-full bg-accent animate-ping opacity-60 absolute" />
        <div className="w-2 h-2 rounded-full bg-accent ring-2 ring-background z-10" />

        {/* Indicador de Snap ativo no centro */}
        {activeSnap && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent text-[9px] font-bold text-accent-foreground shadow-md uppercase tracking-wider">
            <Magnet className="w-2.5 h-2.5" />
            <span>{activeSnap.kind}</span>
          </div>
        )}
      </div>

      {/* Caixa de Leitura Técnica Digital (HUD) */}
      <div className="mt-1.5 mx-auto bg-card/95 border border-border/80 backdrop-blur-md rounded-lg px-2.5 py-1 text-center shadow-lg min-w-[120px]">
        <div className="flex items-center justify-center gap-2 font-mono text-[10px] text-foreground font-semibold">
          <span>X: {cadPos.x.toFixed(1)}</span>
          <span className="text-muted-foreground">|</span>
          <span>Y: {cadPos.y.toFixed(1)}</span>
        </div>
        {baseCadPoint && (
          <div className="flex items-center justify-center gap-2 font-mono text-[9px] text-accent mt-0.5">
            <span>L: {distMm.toFixed(1)} mm</span>
            <span>∠ {angleDeg.toFixed(1)}°</span>
          </div>
        )}
      </div>

      {/* Traço conector apontando para a ponta do dedo */}
      <div className="w-px h-6 bg-accent/50 mx-auto" />
    </div>
  );
}
