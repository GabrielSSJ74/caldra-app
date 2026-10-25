/**
 * CALDRA CHAMFER — HUD TÉCNICO DE INSTRUMENTO DE PRECISÃO (LUPA 3X E COORDENADAS)
 *
 * Implementa um visor ampliado de alta precisão (3x sobre o zoom atual da câmera)
 * unificado em um único card técnico contínuo e adaptado dinamicamente aos temas Claro e Escuro:
 *  - Contêiner único (largura 146px, border-radius 12px, borda fina 1px, sombra discreta);
 *  - Zona Superior (~26px): status GRID / ORTHO (ou ISO) + indicador sutil de Snap/REF + botão Fixar (📌);
 *  - Zona Central (134x134px, border-radius 6px): Canvas 2D Retina 3x com retículo de metrologia fino (1px);
 *  - Zona Inferior (~24px): faixa de coordenadas monoespaçada integrada (X | Y, ΔX | ΔY ou u | v).
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity, Snap } from "@/lib/lab2d/core";
import type { SmartReferencePoint } from "@/lib/lab2d/cadReferenceSnaps";
import type { TemporaryOrigin } from "@/lib/lab2d/cadCoordinateFrames";
import type { EdgeReference } from "@/lib/lab2d/cadGeometricReferences";
import { CoordinateFrameManager } from "@/lib/lab2d/cadCoordinateFrames";
import type { IsoPlane } from "@/lib/lab2d/isometricEngine";
import { techStyle } from "@/lib/lab2d/technical";
import { useSettings, type AccentColor, type ThemeMode } from "@/lib/settings/SettingsProvider";
import { Magnet, Pin } from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export interface ChamferPrecisionLoupeOverlayProps {
  visible: boolean;
  screenPos: Vec2; // Posição de toque na tela (px)
  cadPos: Vec2;    // Coordenada geométrica no mundo CAD (mm)
  activeSnap?: Snap | SmartReferencePoint | null;
  baseCadPoint?: Vec2 | null;
  temporaryOrigin?: TemporaryOrigin | null;
  activeEdge?: EdgeReference | null;
  cameraZoom?: number;
  drawingProjection?: "orthographic" | "isometric";
  isoPlane?: IsoPlane;
  entities?: Entity[];
  draft?: Entity | null;
  pendingPoints?: Vec2[];
  grid?: number;
  showGrid?: boolean;
  isDark?: boolean;
  pinned?: boolean;
  onTogglePinned?: () => void;
  rightOffset?: number;
}

const CARD_WIDTH = 146;
const LOUPE_SIZE = 134;
const HALF_SIZE = LOUPE_SIZE / 2; // 67px

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return `rgba(0, 102, 255, ${alpha})`;
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

/** Adapta cores de camadas pensadas para fundo escuro quando o visor está no Tema Claro */
function resolveEntityStrokeForTheme(rawColor: string, dark: boolean): string {
  if (dark) return rawColor;
  const normalized = rawColor.trim().toLowerCase();
  if (
    normalized === "#ffffff" ||
    normalized === "#fff" ||
    normalized === "#f8fafc" ||
    normalized === "#f1f5f9" ||
    normalized === "#e2e8f0"
  ) {
    return "#1E293B";
  }
  if (normalized === "#38bdf8" || normalized === "#00e5ff" || normalized === "#22d3ee") {
    return "#0284C7";
  }
  if (normalized === "#facc15" || normalized === "#ffd600" || normalized === "#fbbf24") {
    return "#D97706";
  }
  return rawColor;
}

export function ChamferPrecisionLoupeOverlay({
  visible,
  screenPos,
  cadPos,
  activeSnap,
  baseCadPoint,
  temporaryOrigin,
  activeEdge,
  cameraZoom = 1,
  drawingProjection = "orthographic",
  isoPlane = "top",
  entities = [],
  draft = null,
  pendingPoints = [],
  grid = 10,
  showGrid = true,
  isDark,
  pinned,
  onTogglePinned,
  rightOffset,
}: ChamferPrecisionLoupeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Leitura reativa do sistema de temas e cor de destaque do CALDRA
  let settingsTheme: ThemeMode = "light";
  let settingsAccent: AccentColor = "blue";
  try {
    const s = useSettings();
    settingsTheme = s.theme;
    settingsAccent = s.accent;
  } catch {
    // Fallback seguro caso renderizado isoladamente em testes
  }

  const effectiveIsDark = useMemo(() => {
    if (typeof isDark === "boolean") return isDark;
    if (settingsTheme === "dark" || settingsTheme === "amoled") return true;
    if (settingsTheme === "light") return false;
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  }, [isDark, settingsTheme]);

  const isAmoled = useMemo(() => {
    if (settingsTheme === "amoled") return true;
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("amoled");
    }
    return false;
  }, [settingsTheme]);

  const accentHex = useMemo(
    () => resolveAccentHex(settingsAccent, effectiveIsDark),
    [settingsAccent, effectiveIsDark],
  );

  // Estado de fixação (ancoragem no canto da tela vs acompanhamento do dedo)
  const [internalPinned, setInternalPinned] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("chamfer_loupe_pinned") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  const isPinned = pinned !== undefined ? pinned : internalPinned;

  const handleTogglePinned = () => {
    triggerHaptic("selection");
    if (onTogglePinned) {
      onTogglePinned();
    } else {
      setInternalPinned((prev) => {
        const next = !prev;
        try {
          localStorage.setItem("chamfer_loupe_pinned", String(next));
        } catch {
          // ignore localStorage errors in sandboxed environments
        }
        return next;
      });
    }
  };

  // Determina o ponto-alvo no espaço do mundo: se houver snap ativo, mira no snap
  const targetWorld: Vec2 = useMemo(() => {
    if (activeSnap && activeSnap.p && Number.isFinite(activeSnap.p.x) && Number.isFinite(activeSnap.p.y)) {
      return activeSnap.p;
    }
    if (cadPos && Number.isFinite(cadPos.x) && Number.isFinite(cadPos.y)) {
      return cadPos;
    }
    return { x: 0, y: 0 };
  }, [activeSnap, cadPos]);

  // Cálculo de distância e ângulo a partir do ponto base (ex: desenho de linha ou cota)
  let distMm = 0;
  let angleDeg = 0;
  if (baseCadPoint && Number.isFinite(baseCadPoint.x) && Number.isFinite(baseCadPoint.y)) {
    const dx = targetWorld.x - baseCadPoint.x;
    const dy = targetWorld.y - baseCadPoint.y;
    distMm = Math.hypot(dx, dy);
    angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
  }

  // Posicionamento inteligente do card sincronizado com o Cursor Deslocado (-55px / +55px):
  // Flutua acima da mira deslocada (offsetY = -164px). Se perto do topo (< 220px), desloca lateralmente para nunca cobrir a mira!
  const winW = typeof window !== "undefined" ? window.innerWidth : 800;
  const winH = typeof window !== "undefined" ? window.innerHeight : 600;
  const halfCardW = CARD_WIDTH / 2;
  const halfCardH = 94;

  const isTouchNearTop = screenPos && screenPos.y < 220;
  const isInvertedCursor = screenPos && screenPos.y < 120;
  const offsetX = isTouchNearTop ? ((screenPos?.x ?? 0) > winW / 2 ? -108 : 108) : 0;
  const offsetY = isTouchNearTop ? (isInvertedCursor ? 55 : -20) : -164;

  // Garante que o card nunca saia das bordas da tela no modo flutuante
  const loupeCenterX = Math.max(
    halfCardW + 10,
    Math.min(winW - halfCardW - 10, (screenPos?.x ?? halfCardW + 10) + offsetX),
  );
  const loupeCenterY = Math.max(
    halfCardH + 10,
    Math.min(winH - halfCardH - 10, (screenPos?.y ?? 150) + offsetY),
  );

  // Posição ancorada (Modo Fixo): canto superior direito, visível e fora dos menus
  const defaultRightOffset = winW >= 1024 ? 48 : 16;
  const effectiveRightOffset = rightOffset !== undefined ? rightOffset : defaultRightOffset;
  const fixedX = Math.max(16, winW - CARD_WIDTH - effectiveRightOffset);
  const fixedY = 56;

  const boxLeft = isPinned ? fixedX : loupeCenterX - halfCardW;
  const boxTop = isPinned ? fixedY : loupeCenterY - halfCardH;

  // Renderização em Canvas 2D da região ampliada (3x)
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2.5, window.devicePixelRatio || 2);
    const w = LOUPE_SIZE;
    const h = LOUPE_SIZE;

    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Fundo do Visor da Mira adaptado ao Tema (Claro vs Escuro/AMOLED)
    const viewportBg = !effectiveIsDark ? "#F8FAFC" : isAmoled ? "#05080F" : "#0F172A";
    const gridMinorColor = !effectiveIsDark ? "#E2E8F0" : "#1E293B";
    const gridMajorColor = !effectiveIsDark ? "#CBD5E1" : "#334155";

    ctx.fillStyle = viewportBg;
    ctx.fillRect(0, 0, w, h);

    // 2. Fator de ampliação adicional de 3x sobre o zoom atual da câmera
    const safeK = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
    const loupeZoom = safeK * 3;

    // Área visível em coordenadas do mundo CAD (mm)
    const halfSpanMm = HALF_SIZE / loupeZoom;
    const minWx = targetWorld.x - halfSpanMm;
    const maxWx = targetWorld.x + halfSpanMm;
    const minWy = targetWorld.y - halfSpanMm;
    const maxWy = targetWorld.y + halfSpanMm;

    // 3. Renderização da Grade Técnica Suave (Grid / IsoGrid)
    if (showGrid && grid > 0) {
      ctx.save();
      ctx.translate(HALF_SIZE, HALF_SIZE);
      ctx.scale(loupeZoom, loupeZoom);
      ctx.translate(-targetWorld.x, -targetWorld.y);

      if (drawingProjection === "isometric") {
        // Grade Isométrica com linhas finas a 30° e 150°
        ctx.strokeStyle = gridMinorColor;
        ctx.lineWidth = 0.85 / loupeZoom;
        const isoStep = grid;
        const range = Math.max(halfSpanMm * 2, 80);

        const startX = Math.floor((targetWorld.x - range) / isoStep) * isoStep;
        const endX = Math.ceil((targetWorld.x + range) / isoStep) * isoStep;

        ctx.beginPath();
        for (let gx = startX; gx <= endX; gx += isoStep) {
          const dy = range * Math.tan(Math.PI / 6);
          ctx.moveTo(gx - range, targetWorld.y - dy);
          ctx.lineTo(gx + range, targetWorld.y + dy);
          ctx.moveTo(gx - range, targetWorld.y + dy);
          ctx.lineTo(gx + range, targetWorld.y - dy);
        }
        ctx.stroke();
      } else {
        // Grade Ortogonal 2D (secundária e principal)
        const gStep = grid;
        const majorStep = gStep * 5;
        const startX = Math.floor(minWx / gStep) * gStep;
        const endX = Math.ceil(maxWx / gStep) * gStep;
        const startY = Math.floor(minWy / gStep) * gStep;
        const endY = Math.ceil(maxWy / gStep) * gStep;

        // Grade secundária
        ctx.strokeStyle = gridMinorColor;
        ctx.lineWidth = 0.8 / loupeZoom;
        ctx.beginPath();
        for (let gx = startX; gx <= endX; gx += gStep) {
          if (Math.abs(gx % majorStep) < 1e-6) continue;
          ctx.moveTo(gx, minWy);
          ctx.lineTo(gx, maxWy);
        }
        for (let gy = startY; gy <= endY; gy += gStep) {
          if (Math.abs(gy % majorStep) < 1e-6) continue;
          ctx.moveTo(minWx, gy);
          ctx.lineTo(maxWx, gy);
        }
        ctx.stroke();

        // Grade principal
        ctx.strokeStyle = gridMajorColor;
        ctx.lineWidth = 1 / loupeZoom;
        ctx.beginPath();
        for (let gx = startX; gx <= endX; gx += gStep) {
          if (Math.abs(gx % majorStep) >= 1e-6) continue;
          ctx.moveTo(gx, minWy);
          ctx.lineTo(gx, maxWy);
        }
        for (let gy = startY; gy <= endY; gy += gStep) {
          if (Math.abs(gy % majorStep) >= 1e-6) continue;
          ctx.moveTo(minWx, gy);
          ctx.lineTo(maxWx, gy);
        }
        ctx.stroke();

        // Eixos de origem principal (0,0) se visíveis
        if (minWx <= 0 && maxWx >= 0) {
          ctx.strokeStyle = hexToRgba(accentHex, effectiveIsDark ? 0.35 : 0.28);
          ctx.lineWidth = 1.15 / loupeZoom;
          ctx.beginPath();
          ctx.moveTo(0, minWy);
          ctx.lineTo(0, maxWy);
          ctx.stroke();
        }
        if (minWy <= 0 && maxWy >= 0) {
          ctx.strokeStyle = hexToRgba(accentHex, effectiveIsDark ? 0.35 : 0.28);
          ctx.lineWidth = 1.15 / loupeZoom;
          ctx.beginPath();
          ctx.moveTo(minWx, 0);
          ctx.lineTo(maxWx, 0);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 4. Renderização das Entidades Geométricas
    ctx.save();
    ctx.translate(HALF_SIZE, HALF_SIZE);
    ctx.scale(loupeZoom, loupeZoom);
    ctx.translate(-targetWorld.x, -targetWorld.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const inv = 1 / loupeZoom;

    const tracePts = (pts: Vec2[], closed?: boolean) => {
      if (!pts || pts.length === 0) return;
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      if (closed) ctx.closePath();
    };

    const visibleEntities = entities.filter((e) => {
      if (e.type === "text") return false;
      if (e.type === "line") {
        return (
          Math.min(e.x1, e.x2) <= maxWx &&
          Math.max(e.x1, e.x2) >= minWx &&
          Math.min(e.y1, e.y2) <= maxWy &&
          Math.max(e.y1, e.y2) >= minWy
        );
      }
      if (e.type === "circle") {
        return Math.hypot(e.cx - targetWorld.x, e.cy - targetWorld.y) <= e.r + halfSpanMm;
      }
      return true;
    });

    for (const e of visibleEntities) {
      if (e.params?.isIsoSolidFace) {
        const fillCol = (e.params.fillColor as string) || (effectiveIsDark ? "#323B47" : "#CBD5E1");
        const rawStrokeCol = (e.params.strokeColor as string) || (effectiveIsDark ? "#FFFFFF" : "#1E293B");
        const strokeCol = resolveEntityStrokeForTheme(rawStrokeCol, effectiveIsDark);
        const strokeW = (typeof e.params.strokeWidth === "number" ? e.params.strokeWidth : 1.6) * inv;

        ctx.save();
        ctx.beginPath();
        if (e.type === "polyline") tracePts(e.pts, !!e.closed);
        if (fillCol && fillCol !== "none") {
          ctx.fillStyle = fillCol;
          ctx.fill();
        }
        if (!e.params.noStroke && strokeCol && strokeCol !== "none") {
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = strokeW;
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      const style = techStyle(e.layer);
      ctx.strokeStyle = resolveEntityStrokeForTheme(style.color, effectiveIsDark);
      ctx.lineWidth = Math.max(1.15 * inv, style.weight * 1.35 * inv);
      const dash = style.dash(inv);
      ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);

      ctx.beginPath();
      if (e.type === "line") {
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
      } else if (e.type === "polyline") {
        tracePts(e.pts, !!e.closed);
      } else if (e.type === "circle") {
        ctx.moveTo(e.cx + e.r, e.cy);
        ctx.arc(e.cx, e.cy, e.r, 0, Math.PI * 2);
      } else if (e.type === "arc") {
        let sweep = e.a1 - e.a0;
        while (sweep < 0) sweep += Math.PI * 2;
        ctx.moveTo(e.cx + e.r * Math.cos(e.a0), e.cy + e.r * Math.sin(e.a0));
        ctx.arc(e.cx, e.cy, e.r, e.a0, e.a0 + sweep);
      } else if (e.type === "ellipse") {
        ctx.ellipse(e.cx, e.cy, e.rx, e.ry, e.rotation ?? 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // 5. Renderização do Traçado Ativo / Draft / Pontos Pendentes
    if (pendingPoints && pendingPoints.length > 0) {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.5 * inv;
      ctx.setLineDash([4 * inv, 3 * inv]);
      ctx.beginPath();
      tracePts(pendingPoints, false);
      ctx.lineTo(targetWorld.x, targetWorld.y);
      ctx.stroke();

      ctx.fillStyle = accentHex;
      ctx.setLineDash([]);
      for (const pt of pendingPoints) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5 * inv, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (draft) {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.5 * inv;
      ctx.setLineDash([3 * inv, 3 * inv]);
      ctx.beginPath();
      if (draft.type === "line") {
        ctx.moveTo(draft.x1, draft.y1);
        ctx.lineTo(draft.x2, draft.y2);
      } else if (draft.type === "polyline") {
        tracePts(draft.pts, !!draft.closed);
      } else if (draft.type === "circle") {
        ctx.arc(draft.cx, draft.cy, draft.r, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    ctx.restore(); // Restaura transform do mundo CAD

    // 6. Retículo de Metrologia Limpo (1px, sem brilho neon e sem cantoneiras)
    ctx.save();
    ctx.translate(HALF_SIZE, HALF_SIZE);
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    const reticleStroke = hexToRgba(accentHex, effectiveIsDark ? 0.62 : 0.58);
    const reticleRingStroke = hexToRgba(accentHex, effectiveIsDark ? 0.28 : 0.24);

    if (drawingProjection === "isometric") {
      ctx.lineWidth = 1;
      ctx.strokeStyle = reticleStroke;

      const arm = 44;
      const gap = 5;

      const drawIsoRay = (angleRad: number) => {
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        ctx.beginPath();
        ctx.moveTo(cos * gap, sin * gap);
        ctx.lineTo(cos * arm, sin * arm);
        ctx.stroke();
      };

      if (isoPlane === "top") {
        drawIsoRay(Math.PI / 6);
        drawIsoRay((-5 * Math.PI) / 6);
        drawIsoRay((5 * Math.PI) / 6);
        drawIsoRay(-Math.PI / 6);
      } else if (isoPlane === "left") {
        drawIsoRay(-Math.PI / 2);
        drawIsoRay(Math.PI / 2);
        drawIsoRay((5 * Math.PI) / 6);
        drawIsoRay(-Math.PI / 6);
      } else {
        drawIsoRay(-Math.PI / 2);
        drawIsoRay(Math.PI / 2);
        drawIsoRay(Math.PI / 6);
        drawIsoRay((-5 * Math.PI) / 6);
      }

      ctx.strokeStyle = reticleRingStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Mira Ortogonal 2D Fina (1px)
      ctx.lineWidth = 1;
      ctx.strokeStyle = reticleStroke;

      const arm = 48;
      const gap = 5;

      ctx.beginPath();
      // Horizontal
      ctx.moveTo(-arm, 0);
      ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0);
      ctx.lineTo(arm, 0);
      // Vertical
      ctx.moveTo(0, -arm);
      ctx.lineTo(0, -gap);
      ctx.moveTo(0, gap);
      ctx.lineTo(0, arm);
      ctx.stroke();

      // Anel central de metrologia discreto (1px)
      ctx.strokeStyle = reticleRingStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 7. Ponto de Referência Sutil / Indicador Geométrico de Snap
    if (activeSnap) {
      const snapKind = activeSnap.kind;
      ctx.strokeStyle = accentHex;
      ctx.fillStyle = hexToRgba(accentHex, effectiveIsDark ? 0.2 : 0.14);
      ctx.lineWidth = 1.35;

      ctx.beginPath();
      if (snapKind === "end") {
        ctx.rect(-4.5, -4.5, 9, 9);
      } else if (snapKind === "mid") {
        ctx.moveTo(0, -5.5);
        ctx.lineTo(5, 4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
      } else if (snapKind === "center") {
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.moveTo(-2.5, 0);
        ctx.lineTo(2.5, 0);
        ctx.moveTo(0, -2.5);
        ctx.lineTo(0, 2.5);
      } else if (snapKind === "quadrant") {
        ctx.moveTo(0, -5.5);
        ctx.lineTo(5.5, 0);
        ctx.lineTo(0, 5.5);
        ctx.lineTo(-5.5, 0);
        ctx.closePath();
      } else if (snapKind === "cross" || snapKind === "intersection") {
        ctx.moveTo(-4, -4);
        ctx.lineTo(4, 4);
        ctx.moveTo(4, -4);
        ctx.lineTo(-4, 4);
      } else if (snapKind === "perp") {
        ctx.moveTo(-4.5, -4.5);
        ctx.lineTo(-4.5, 4.5);
        ctx.lineTo(4.5, 4.5);
        ctx.moveTo(-4.5, 0);
        ctx.lineTo(0, 0);
        ctx.lineTo(0, 4.5);
      } else {
        ctx.rect(-4, -4, 8, 8);
      }
      ctx.fill();
      ctx.stroke();
    } else {
      // Ponto central sutil de referência (1.5px)
      ctx.fillStyle = hexToRgba(accentHex, 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }, [
    visible,
    targetWorld.x,
    targetWorld.y,
    cameraZoom,
    drawingProjection,
    isoPlane,
    entities,
    draft,
    pendingPoints,
    grid,
    showGrid,
    activeSnap,
    isPinned,
    effectiveIsDark,
    isAmoled,
    accentHex,
  ]);

  if (!visible) {
    return null;
  }
  if (!isPinned && (!screenPos || !Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y))) {
    return null;
  }

  // Label compacto do snap ativo
  const snapLabel =
    activeSnap && typeof activeSnap === "object"
      ? "label" in activeSnap && activeSnap.label
        ? activeSnap.label
        : activeSnap.kind.toUpperCase()
      : null;

  const modeStatusLabel =
    drawingProjection === "isometric" ? `ISO ${isoPlane.toUpperCase()}` : "GRID / ORTHO";

  return (
    <div
      className="pointer-events-none fixed z-50 select-none transition-opacity duration-150 ease-out"
      style={{
        left: `${boxLeft}px`,
        top: `${boxTop}px`,
        width: `${CARD_WIDTH}px`,
      }}
    >
      {/* CARD ÚNICO CONTÍNUO — INSTRUMENTO DE PRECISÃO INDUSTRIAL */}
      <div className="hud-loupe-card pointer-events-auto flex flex-col rounded-[12px] p-[5px]">
        {/* ZONA 1: CABEÇALHO INTEGRADO (~26px) */}
        <div className="flex h-[24px] items-center justify-between px-1.5 pb-[3px]">
          <div className="flex min-w-0 items-center gap-1.5">
            {temporaryOrigin ? (
              <>
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />
                <span
                  className="truncate font-mono text-[10px] font-semibold tracking-[0.5px] uppercase"
                  style={{ color: "var(--accent)" }}
                >
                  REF 0,0
                </span>
              </>
            ) : activeSnap ? (
              <>
                <Magnet
                  className="size-2.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <span
                  className="truncate font-mono text-[10px] font-semibold tracking-[0.5px] uppercase"
                  style={{ color: "var(--accent)" }}
                >
                  {snapLabel}
                </span>
              </>
            ) : (
              <span className="hud-loupe-muted truncate font-mono text-[10px] font-semibold tracking-[0.5px] uppercase">
                {modeStatusLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            data-active={isPinned ? "true" : "false"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePinned();
            }}
            title={
              isPinned
                ? "Desafixar Lupa (Acompanhar dedo)"
                : "Fixar Lupa no canto da tela (Modo Fixo)"
            }
            aria-label={isPinned ? "Desafixar Lupa" : "Fixar Lupa"}
            className="hud-loupe-pin-btn flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px]"
          >
            <Pin
              className={cn(
                "size-3 transition-transform duration-150",
                isPinned ? "rotate-0 fill-current" : "rotate-45",
              )}
            />
          </button>
        </div>

        {/* ZONA 2: VISOR VETORIAL DE ALTA PRECISÃO (CANVAS 3X) */}
        <div
          className="hud-loupe-viewport relative mx-auto overflow-hidden rounded-[6px]"
          style={{ width: `${LOUPE_SIZE}px`, height: `${LOUPE_SIZE}px` }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: `${LOUPE_SIZE}px`, height: `${LOUPE_SIZE}px` }}
            className="block size-full"
          />
        </div>

        {/* ZONA 3: FAIXA DE COORDENADAS INTEGRADA (~24px) */}
        <div className="flex min-h-[24px] flex-col items-center justify-center px-1 pt-[4px] pb-[1px] font-mono text-[10.5px] leading-tight tabular-nums">
          {temporaryOrigin ? (
            <div className="flex items-center justify-center gap-1 font-semibold">
              <span className="hud-loupe-muted text-[9.5px]">ΔX:</span>
              <span>
                {(targetWorld.x - temporaryOrigin.p.x >= 0 ? "+" : "") +
                  (targetWorld.x - temporaryOrigin.p.x).toFixed(1)}
              </span>
              <span className="hud-loupe-sep mx-0.5">|</span>
              <span className="hud-loupe-muted text-[9.5px]">ΔY:</span>
              <span>
                {(targetWorld.y - temporaryOrigin.p.y >= 0 ? "+" : "") +
                  (targetWorld.y - temporaryOrigin.p.y).toFixed(1)}
              </span>
            </div>
          ) : activeEdge ? (
            (() => {
              const { u, v } = CoordinateFrameManager.worldToUV(targetWorld, activeEdge);
              return (
                <div className="flex items-center justify-center gap-1 font-semibold">
                  <span className="hud-loupe-muted text-[9.5px]">u:</span>
                  <span>{u.toFixed(1)}</span>
                  <span className="hud-loupe-sep mx-0.5">|</span>
                  <span className="hud-loupe-muted text-[9.5px]">v:</span>
                  <span>{(v >= 0 ? "+" : "") + v.toFixed(1)}</span>
                </div>
              );
            })()
          ) : (
            <div className="flex items-center justify-center gap-1 font-medium">
              <span className="hud-loupe-muted text-[9.5px]">X:</span>
              <span>{targetWorld.x.toFixed(1)}</span>
              <span className="hud-loupe-sep mx-0.5">|</span>
              <span className="hud-loupe-muted text-[9.5px]">Y:</span>
              <span>{targetWorld.y.toFixed(1)}</span>
            </div>
          )}

          {baseCadPoint && distMm > 0 && (
            <div className="hud-loupe-muted mt-0.5 flex items-center justify-center gap-1 text-[9px] font-medium">
              <span>L: {distMm.toFixed(1)}</span>
              <span className="hud-loupe-sep">|</span>
              <span>∠ {angleDeg.toFixed(1)}°</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
