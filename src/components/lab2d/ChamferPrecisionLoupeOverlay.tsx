/**
 * CALDRA CHAMFER — LENTE ÓPTICA TRANSLÚCIDA DE PRECISÃO (SEE-THROUGH LENS 2.5x + SMART AUTO-DODGE)
 *  - Cápsula Óptica Arredondada (Squircle 136px × 116px, border-radius: 28px)
 *  - Lente Translúcida Real (alpha 0.55 no escuro / 0.62 no claro + backdrop-filter: blur(6px))
 *  - Ampliação 2.5x sincronizada em tempo real com máscara radial de vinheta suave nas bordas
 *  - HUD Minimalista Integrado na curvatura interna inferior: "X: 1120.0  Y: 370.0  •  L: 367.2  ∠ 29.4°"
 *  - Esquiva Automática Inteligente (Smart Auto-Dodge 220ms cubic-bezier) quando o dedo se aproxima do canto
 */

import React, { useEffect, useRef } from "react";
import { Pin, PinOff } from "lucide-react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity, Snap } from "@/lib/lab2d/core";
import { techStyle } from "@/lib/lab2d/technical";
import {
  mapSmartSnapKindToCanonicalType,
  type CanonicalSnapResultType,
  type SmartReferencePoint,
  type SnapResult,
} from "@/lib/lab2d/cadReferenceSnaps";
import {
  isGeometricMarkEntity,
  isPersistentDatumEntity,
  getPersistentDatumSpec,
  GEOMETRIC_MARK_VIOLET_PRIMARY,
} from "@/lib/lab2d/cadGeometricMarks";
import { ISO_PLANES, type DrawingProjectionMode, type IsoPlane } from "@/lib/lab2d/isometricEngine";
import type { TemporaryOrigin } from "@/lib/lab2d/cadCoordinateFrames";
import type { EdgeReference } from "@/lib/lab2d/cadGeometricReferences";
import { CoordinateFrameManager } from "@/lib/lab2d/cadCoordinateFrames";
import { ReferenceService, ANCHOR_CYAN_PRIMARY, ANCHOR_VIOLET_PRIMARY } from "@/lib/lab2d/referenceService";

export interface ChamferPrecisionLoupeProps {
  visible: boolean;
  /** Posição na tela (clientX, clientY) do ponteiro / toque */
  screenPos: Vec2 | null;
  /** Ponto exato no mundo CAD sob o centro do retículo */
  cadPos: Vec2 | null;
  /** Resultado único e centralizado do motor de SNAP (Seção 6.2) */
  activeSnapResult?: SnapResult | null;
  /** Snap legado opcional para retrocompatibilidade */
  activeSnap?: SmartReferencePoint | Snap | null;
  /** Ponto base do comando atual (para mostrar L e Ângulo na telemetria interna) */
  baseCadPoint?: Vec2 | null;
  /** Origem temporária ativa (Vetor Datum) */
  temporaryOrigin?: TemporaryOrigin | null;
  /** Borda de referência ativa (se houver) */
  activeEdge?: EdgeReference | null;
  /** Nível de zoom atual da câmera principal */
  cameraZoom: number;
  /** Modo de projeção ativo */
  drawingProjection: DrawingProjectionMode;
  isoPlane: IsoPlane;
  /** Entidades visíveis para renderizar ampliadas dentro da lente */
  entities: Entity[];
  /** Rascunho ativo sendo desenhado */
  draft?: Entity | null;
  /** Pontos pendentes (ex: polilinha) */
  pendingPoints?: Vec2[];
  /** Passo da grade */
  grid: number;
  showGrid: boolean;
  isDark?: boolean;
  /** Quando true, mantém a lupa ancorada no canto (com Smart Auto-Dodge automático) */
  pinned?: boolean;
  onTogglePinned?: () => void;
  /** Deslocamento direito extra quando a barra lateral de propriedades está aberta */
  rightOffset?: number;
}

const LOUPE_WIDTH = 136;
const LOUPE_HEIGHT = 116;
const LOUPE_RADIUS_PX = 28;
const MAGNIFICATION_FACTOR = 2.5;

function drawSnapSymbolInLoupe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  snapType: CanonicalSnapResultType,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.65;
  ctx.setLineDash([]);

  switch (snapType) {
    case "endpoint": {
      // Quadrado técnico de extremidade
      const s = 5.5;
      ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
      break;
    }
    case "midpoint": {
      // Triângulo equilátero técnico de ponto médio
      const r = 6.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.92, cy + r * 0.72);
      ctx.lineTo(cx - r * 0.92, cy + r * 0.72);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "center": {
      // Círculo com centro marcado
      ctx.beginPath();
      ctx.arc(cx, cy, 6.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "intersection":
    case "extension": {
      // Cruz em X de interseção
      const r = 5.8;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      break;
    }
    case "tangent": {
      // Círculo com reta tangente superior
      const r = 5.2;
      ctx.beginPath();
      ctx.arc(cx, cy + 1, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - r + 1);
      ctx.lineTo(cx + 7, cy - r + 1);
      ctx.stroke();
      break;
    }
    case "quadrant": {
      // Losango (diamante) técnico de quadrante
      const r = 6.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "perpendicular": {
      // Símbolo de ângulo reto (⊥)
      const s = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s);
      ctx.lineTo(cx - s, cy - s);
      ctx.moveTo(cx - s, cy + s);
      ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + s);
      ctx.stroke();
      break;
    }
    case "geometric_mark": {
      // Cruz violeta de Marco Geométrico (+) com micro-anel central
      const arm = 7.2;
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy);
      ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm);
      ctx.lineTo(cx, cy + arm);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "datum_ref": {
      // Alvo técnico de referência do DATUM
      ctx.beginPath();
      ctx.arc(cx, cy, 6.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 8.5, cy);
      ctx.lineTo(cx + 8.5, cy);
      ctx.moveTo(cx, cy - 8.5);
      ctx.lineTo(cx, cy + 8.5);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, 5.2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

export const ChamferPrecisionLoupeOverlay: React.FC<ChamferPrecisionLoupeProps> = React.memo(
  function ChamferPrecisionLoupeOverlay({
    visible,
    screenPos,
    cadPos,
    activeSnapResult,
    activeSnap,
    baseCadPoint,
    temporaryOrigin,
    activeEdge,
    cameraZoom,
    drawingProjection,
    isoPlane,
    entities,
    draft,
    pendingPoints = [],
    grid,
    showGrid,
    isDark = true,
    pinned = true,
    onTogglePinned,
    rightOffset = 14,
  }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dodgedLeftRef = useRef<boolean>(false);

    const safeK = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
    const loupeZoom = safeK * MAGNIFICATION_FACTOR;

    // Sincronização 100% com o SnapResult central (Seção 6.3):
    // Quando valid === true, trava a câmera da lupa exatamente em worldPoint.
    // Quando valid === false, segue o centro exato da mira (cadPos) e limpa qualquer indicador residual.
    const hasValidSnapResult = Boolean(
      activeSnapResult
        ? activeSnapResult.valid
        : activeSnap && Number.isFinite(activeSnap.p.x) && Number.isFinite(activeSnap.p.y),
    );

    const resolvedSnapType: CanonicalSnapResultType = activeSnapResult
      ? activeSnapResult.valid
        ? activeSnapResult.type
        : "none"
      : activeSnap
        ? mapSmartSnapKindToCanonicalType(activeSnap.kind)
        : "none";

    const lockedCenterWorld: Vec2 | null =
      hasValidSnapResult && activeSnapResult
        ? activeSnapResult.worldPoint
        : hasValidSnapResult && activeSnap
          ? activeSnap.p
          : cadPos;

    const snapIndicatorColor =
      resolvedSnapType === "geometric_mark"
        ? GEOMETRIC_MARK_VIOLET_PRIMARY
        : resolvedSnapType === "datum_ref"
          ? "#38BDF8"
          : "#10B981";

    useEffect(() => {
      if (!visible || !lockedCenterWorld) return;
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;

      const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
      const targetW = LOUPE_WIDTH * dpr;
      const targetH = LOUPE_HEIGHT * dpr;
      if (cvs.width !== targetW || cvs.height !== targetH) {
        cvs.width = targetW;
        cvs.height = targetH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, LOUPE_WIDTH, LOUPE_HEIGHT);

      const halfW = LOUPE_WIDTH / 2;
      const halfH = LOUPE_HEIGHT / 2;

      // 1. Fundo Translúcido Controlado (See-Through Lens: alpha 0.55 escuro / 0.62 claro)
      ctx.save();
      ctx.globalAlpha = isDark ? 0.55 : 0.62;
      ctx.fillStyle = isDark ? "#0B111E" : "#F8FAFC";
      ctx.fillRect(0, 0, LOUPE_WIDTH, LOUPE_HEIGHT);
      ctx.restore();

      // 2. Transformação do mundo CAD ampliado em 2.5x centrado exatamente em lockedCenterWorld
      ctx.save();
      ctx.translate(
        halfW - lockedCenterWorld.x * loupeZoom,
        halfH - lockedCenterWorld.y * loupeZoom,
      );

      // 2a. Grade ampliada sutil
      if (showGrid && grid > 0) {
        const spanW = halfW / loupeZoom;
        const spanH = halfH / loupeZoom;
        const minX = Math.floor((lockedCenterWorld.x - spanW) / grid) * grid;
        const maxX = Math.ceil((lockedCenterWorld.x + spanW) / grid) * grid;
        const minY = Math.floor((lockedCenterWorld.y - spanH) / grid) * grid;
        const maxY = Math.ceil((lockedCenterWorld.y + spanH) / grid) * grid;

        ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(71, 85, 105, 0.14)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let x = minX; x <= maxX; x += grid) {
          ctx.moveTo(x * loupeZoom, minY * loupeZoom);
          ctx.lineTo(x * loupeZoom, maxY * loupeZoom);
        }
        for (let y = minY; y <= maxY; y += grid) {
          ctx.moveTo(minX * loupeZoom, y * loupeZoom);
          ctx.lineTo(maxX * loupeZoom, y * loupeZoom);
        }
        ctx.stroke();

        // Eixos X=0 e Y=0
        ctx.strokeStyle = isDark ? "rgba(220, 20, 60, 0.35)" : "rgba(220, 20, 60, 0.3)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, minY * loupeZoom);
        ctx.lineTo(0, maxY * loupeZoom);
        ctx.moveTo(minX * loupeZoom, 0);
        ctx.lineTo(maxX * loupeZoom, 0);
        ctx.stroke();
      }

      // 2b. Entidades visíveis do desenho ampliadas em 2.5x (incluindo Marcos Geométricos e Datums)
      const renderEntityOnLoupe = (e: Entity, isPreview: boolean) => {
        if (isGeometricMarkEntity(e) && e.type === "point") {
          const gx = e.x * loupeZoom;
          const gy = e.y * loupeZoom;
          ctx.save();
          ctx.strokeStyle = GEOMETRIC_MARK_VIOLET_PRIMARY;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(gx - 6, gy);
          ctx.lineTo(gx + 6, gy);
          ctx.moveTo(gx, gy - 6);
          ctx.lineTo(gx, gy + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = GEOMETRIC_MARK_VIOLET_PRIMARY;
          ctx.fill();
          ctx.restore();
          return;
        }

        if (isPersistentDatumEntity(e)) {
          const spec = getPersistentDatumSpec(e);
          if (spec) {
            const ox = spec.origin.x * loupeZoom;
            const oy = spec.origin.y * loupeZoom;
            const tx = spec.target.x * loupeZoom;
            const ty = spec.target.y * loupeZoom;
            ctx.save();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.78)";
            ctx.lineWidth = 1.25;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(tx, oy);
            ctx.lineTo(tx, ty);
            ctx.moveTo(ox, oy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.restore();
          }
          return;
        }

        const st = techStyle(e.layer);
        const isCutOrWhite = st.color === "#FFFFFF" || e.layer === "corte";
        ctx.strokeStyle = isPreview
          ? "#38BDF8"
          : isCutOrWhite
            ? isDark
              ? "#F1F5F9"
              : "#0F172A"
            : st.color;
        ctx.lineWidth = isPreview ? 1.9 : 1.75;
        if (isPreview) {
          ctx.setLineDash([5, 3]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        if (e.type === "line") {
          ctx.moveTo(e.x1 * loupeZoom, e.y1 * loupeZoom);
          ctx.lineTo(e.x2 * loupeZoom, e.y2 * loupeZoom);
        } else if (e.type === "circle") {
          ctx.arc(e.cx * loupeZoom, e.cy * loupeZoom, Math.max(0.5, e.r * loupeZoom), 0, Math.PI * 2);
        } else if (e.type === "arc") {
          let sweep = e.a1 - e.a0;
          while (sweep < 0) sweep += Math.PI * 2;
          ctx.arc(
            e.cx * loupeZoom,
            e.cy * loupeZoom,
            Math.max(0.5, e.r * loupeZoom),
            e.a0,
            e.a0 + sweep,
          );
        } else if (e.type === "ellipse") {
          ctx.ellipse(
            e.cx * loupeZoom,
            e.cy * loupeZoom,
            Math.max(0.5, e.rx * loupeZoom),
            Math.max(0.5, e.ry * loupeZoom),
            e.rotation || 0,
            0,
            Math.PI * 2,
          );
        } else if (e.type === "polyline" && e.pts.length >= 2) {
          ctx.moveTo(e.pts[0]!.x * loupeZoom, e.pts[0]!.y * loupeZoom);
          for (let i = 1; i < e.pts.length; i++) {
            ctx.lineTo(e.pts[i]!.x * loupeZoom, e.pts[i]!.y * loupeZoom);
          }
          if (e.closed) ctx.closePath();
        } else if (e.type === "point") {
          ctx.arc(e.x * loupeZoom, e.y * loupeZoom, 3, 0, Math.PI * 2);
        }
        ctx.stroke();
      };

      for (const ent of entities) {
        renderEntityOnLoupe(ent, false);
      }

      // 2c. Polilinha pendente e Rascunho ativo
      if (pendingPoints.length >= 2) {
        ctx.strokeStyle = "#38BDF8";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(pendingPoints[0]!.x * loupeZoom, pendingPoints[0]!.y * loupeZoom);
        for (let i = 1; i < pendingPoints.length; i++) {
          ctx.lineTo(pendingPoints[i]!.x * loupeZoom, pendingPoints[i]!.y * loupeZoom);
        }
        ctx.stroke();
      }

      if (draft) {
        renderEntityOnLoupe(draft, true);
      }

      // 2c.2 Marcos Geométricos / Âncoras (A–E), Divisores ÷N e Encontros de Guias na Lente 2.5x
      const refState = ReferenceService.getState();
      for (const anchor of refState.anchors) {
        const ax = anchor.origin.x * loupeZoom;
        const ay = anchor.origin.y * loupeZoom;
        const rad = (anchor.thetaDeg * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        ctx.save();
        ctx.strokeStyle = anchor.id === refState.activeAnchorId ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_PRIMARY;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(ax - cosA * 12, ay - sinA * 12);
        ctx.lineTo(ax + cosA * 12, ay + sinA * 12);
        ctx.moveTo(ax + sinA * 12, ay - cosA * 12);
        ctx.lineTo(ax - sinA * 12, ay + cosA * 12);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ax, ay, 3.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      for (const mt of refState.meetings) {
        const mx = mt.point.x * loupeZoom;
        const my = mt.point.y * loupeZoom;
        ctx.save();
        ctx.strokeStyle = ANCHOR_CYAN_PRIMARY;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(mx - 4, my - 4);
        ctx.lineTo(mx + 4, my + 4);
        ctx.moveTo(mx + 4, my - 4);
        ctx.lineTo(mx - 4, my + 4);
        ctx.stroke();
        ctx.restore();
      }

      // 2d. Vetor Datum / Ponto Base -> Mira
      const refVectorOrigin = baseCadPoint ?? temporaryOrigin?.p ?? null;
      if (refVectorOrigin) {
        ctx.strokeStyle = baseCadPoint ? "rgba(56, 189, 248, 0.75)" : "rgba(220, 20, 60, 0.65)";
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(refVectorOrigin.x * loupeZoom, refVectorOrigin.y * loupeZoom);
        ctx.lineTo(lockedCenterWorld.x * loupeZoom, lockedCenterWorld.y * loupeZoom);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // 3. Máscara Radial de Vinheta Suave nas bordas da cápsula óptica
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      const maxRad = Math.hypot(halfW, halfH);
      const vignette = ctx.createRadialGradient(halfW, halfH, maxRad * 0.58, halfW, halfH, maxRad * 1.02);
      vignette.addColorStop(0, "rgba(0, 0, 0, 1)");
      vignette.addColorStop(0.78, "rgba(0, 0, 0, 0.94)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.35)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, LOUPE_WIDTH, LOUPE_HEIGHT);
      ctx.restore();

      // 4. Retículo Óptico Fino no Centro da Lente + Indicador de Snap Real
      ctx.save();
      if (drawingProjection === "isometric") {
        const planeCfg = ISO_PLANES[isoPlane];
        const angles = planeCfg ? [planeCfg.angleA, planeCfg.angleB] : [30, 150];
        ctx.strokeStyle = isDark ? "rgba(56, 189, 248, 0.32)" : "rgba(2, 132, 199, 0.28)";
        ctx.lineWidth = 0.85;
        ctx.setLineDash([3, 3]);
        for (const a of angles) {
          const rad = (a * Math.PI) / 180;
          ctx.beginPath();
          ctx.moveTo(halfW - Math.cos(rad) * halfW, halfH - Math.sin(rad) * halfH);
          ctx.lineTo(halfW + Math.cos(rad) * halfW, halfH + Math.sin(rad) * halfH);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      const reticleCol = hasValidSnapResult
        ? snapIndicatorColor
        : isDark
          ? "rgba(248, 250, 252, 0.82)"
          : "rgba(15, 23, 42, 0.78)";
      ctx.strokeStyle = reticleCol;
      ctx.lineWidth = 1.05;
      const gap = hasValidSnapResult ? 7 : 5;
      const arm = 21;
      ctx.beginPath();
      ctx.moveTo(halfW - arm, halfH);
      ctx.lineTo(halfW - gap, halfH);
      ctx.moveTo(halfW + gap, halfH);
      ctx.lineTo(halfW + arm, halfH);
      ctx.moveTo(halfW, halfH - arm);
      ctx.lineTo(halfW, halfH - gap);
      ctx.moveTo(halfW, halfH + gap);
      ctx.lineTo(halfW, halfH + arm);
      ctx.stroke();

      if (hasValidSnapResult && resolvedSnapType !== "none") {
        drawSnapSymbolInLoupe(ctx, halfW, halfH, resolvedSnapType, snapIndicatorColor);
      } else {
        // Sem SNAP ativo: apenas anel micrométrico neutro
        ctx.beginPath();
        ctx.arc(halfW, halfH, 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#DC143C";
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }

      // Ponto central sub-pixel
      ctx.beginPath();
      ctx.arc(halfW, halfH, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = hasValidSnapResult ? snapIndicatorColor : "#DC143C";
      ctx.fill();

      ctx.restore();
      ctx.restore();
    }, [
      visible,
      lockedCenterWorld,
      hasValidSnapResult,
      resolvedSnapType,
      snapIndicatorColor,
      baseCadPoint,
      temporaryOrigin,
      loupeZoom,
      drawingProjection,
      isoPlane,
      entities,
      draft,
      pendingPoints,
      grid,
      showGrid,
      isDark,
    ]);

    if (!visible || !lockedCenterWorld) return null;

    const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
    const winH = typeof window !== "undefined" ? window.innerHeight : 800;

    // Smart Auto-Dodge (Esquiva Automática do Dedo)
    const effectiveRightOffset = Math.max(12, rightOffset);
    const rightDockX = Math.max(12, winW - LOUPE_WIDTH - effectiveRightOffset);
    const leftDockX = 32;
    const dockY = 32;

    if (screenPos) {
      const nearRightDock =
        screenPos.x > rightDockX - 58 &&
        screenPos.y < dockY + LOUPE_HEIGHT + 72;
      const nearLeftDock =
        screenPos.x < leftDockX + LOUPE_WIDTH + 58 &&
        screenPos.y < dockY + LOUPE_HEIGHT + 72;

      if (!dodgedLeftRef.current && nearRightDock) {
        dodgedLeftRef.current = true;
      } else if (dodgedLeftRef.current && (nearLeftDock || !nearRightDock)) {
        if (!nearRightDock) {
          dodgedLeftRef.current = false;
        }
      }
    }

    let leftPx = dodgedLeftRef.current ? leftDockX : rightDockX;
    let topPx = dockY;

    if (!pinned && screenPos) {
      const verticalOffset = LOUPE_HEIGHT + 44;
      leftPx = Math.min(Math.max(12, screenPos.x - LOUPE_WIDTH / 2), winW - LOUPE_WIDTH - 12);
      topPx = screenPos.y - verticalOffset;
      if (topPx < 30) {
        topPx = Math.min(winH - LOUPE_HEIGHT - 20, screenPos.y + 44);
      }
    }

    // Cálculo de telemetria integrada na curvatura interna inferior da lente (usando lockedCenterWorld)
    const vectorOrigin = baseCadPoint ?? temporaryOrigin?.p ?? null;
    const hasVector = vectorOrigin !== null;
    const dx = hasVector ? lockedCenterWorld.x - vectorOrigin!.x : lockedCenterWorld.x;
    const dy = hasVector ? lockedCenterWorld.y - vectorOrigin!.y : lockedCenterWorld.y;
    const distL = hasVector ? Math.hypot(dx, dy) : 0;
    const angleDeg = hasVector
      ? (((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360
      : 0;

    const snapLabel = hasValidSnapResult
      ? activeSnapResult?.label ||
        (activeSnap && "label" in activeSnap && activeSnap.label
          ? activeSnap.label
          : resolvedSnapType.toUpperCase())
      : null;

    const isVioletMark = resolvedSnapType === "geometric_mark";

    const edgeUV =
      activeEdge && lockedCenterWorld
        ? CoordinateFrameManager.worldToUV(lockedCenterWorld, activeEdge)
        : null;

    return (
      <div
        data-testid="chamfer-precision-loupe"
        className="pointer-events-none fixed z-50 select-none overflow-hidden"
        style={{
          left: Math.round(leftPx),
          top: Math.round(topPx),
          width: LOUPE_WIDTH,
          height: LOUPE_HEIGHT,
          borderRadius: LOUPE_RADIUS_PX,
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.42)" : "rgba(255, 255, 255, 0.48)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: isDark
            ? "1px solid rgba(255, 255, 255, 0.22)"
            : "1px solid rgba(15, 23, 42, 0.14)",
          boxShadow: isDark
            ? "0 8px 24px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.14)"
            : "0 8px 24px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
          transition: pinned
            ? "left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1)"
            : undefined,
        }}
      >
        {/* Lente Óptica 2.5x com Transparência e Vinheta Radial */}
        <canvas
          ref={canvasRef}
          style={{
            width: LOUPE_WIDTH,
            height: LOUPE_HEIGHT,
            display: "block",
          }}
        />

        {/* Topo Interno da Lente: Indicador de SNAP Ativo (Esquerda) + Botão Pin (Direita) */}
        <div className="pointer-events-none absolute inset-x-2.5 top-1.5 flex items-center justify-between">
          {snapLabel ? (
            <span
              data-testid="loupe-snap-badge"
              className="truncate rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-tight"
              style={{
                maxWidth: 96,
                backgroundColor: isVioletMark
                  ? isDark
                    ? "rgba(88, 28, 135, 0.78)"
                    : "rgba(243, 232, 255, 0.9)"
                  : isDark
                    ? "rgba(6, 78, 59, 0.72)"
                    : "rgba(209, 250, 229, 0.85)",
                color: isVioletMark
                  ? isDark
                    ? "#E9D5FF"
                    : "#6B21A8"
                  : isDark
                    ? "#6EE7B7"
                    : "#047857",
                border: isVioletMark
                  ? "1px solid rgba(168, 85, 247, 0.55)"
                  : "1px solid rgba(16, 185, 129, 0.4)",
              }}
            >
              ● {snapLabel}
            </span>
          ) : (
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-semibold"
              style={{
                backgroundColor: isDark ? "rgba(15, 23, 42, 0.52)" : "rgba(255, 255, 255, 0.65)",
                color: isDark ? "rgba(148, 163, 184, 0.9)" : "rgba(71, 85, 105, 0.9)",
              }}
            >
              2.5×
            </span>
          )}

          {onTogglePinned && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePinned();
              }}
              title={pinned ? "Lupa Fixa (Auto-Dodge ativo) — toque para seguir o dedo" : "Fixar Lupa no canto"}
              className="pointer-events-auto flex size-5 items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer"
              style={{
                backgroundColor: isDark ? "rgba(15, 23, 42, 0.58)" : "rgba(255, 255, 255, 0.72)",
                color: pinned ? "#38BDF8" : isDark ? "#94A3B8" : "#475569",
                border: isDark
                  ? "1px solid rgba(255, 255, 255, 0.14)"
                  : "1px solid rgba(15, 23, 42, 0.12)",
              }}
            >
              {pinned ? <Pin className="size-2.5" /> : <PinOff className="size-2.5" />}
            </button>
          )}
        </div>

        {/* Curvatura Interna Inferior da Lente: Telemetria Minimalista Integrada */}
        <div
          data-testid="loupe-coords-readout"
          className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-center rounded-full px-2 py-0.5 font-mono text-[8.5px] font-semibold tabular-nums leading-tight"
          style={{
            backgroundColor: isDark ? "rgba(9, 13, 22, 0.62)" : "rgba(255, 255, 255, 0.72)",
            color: isDark ? "#E2E8F0" : "#0F172A",
            border: isDark
              ? "1px solid rgba(255, 255, 255, 0.1)"
              : "1px solid rgba(15, 23, 42, 0.08)",
          }}
        >
          {edgeUV ? (
            <span className="truncate">
              u:{edgeUV.u.toFixed(1)} v:{edgeUV.v.toFixed(1)}
            </span>
          ) : hasVector && distL > 0.05 ? (
            <span className="truncate">
              X:{lockedCenterWorld.x.toFixed(0)} Y:{lockedCenterWorld.y.toFixed(0)}{" "}
              <span style={{ color: "#38BDF8" }}>
                • L:{distL.toFixed(1)} ∠{angleDeg.toFixed(1)}°
              </span>
            </span>
          ) : (
            <span className="truncate">
              X: {lockedCenterWorld.x.toFixed(1)} &nbsp;Y: {lockedCenterWorld.y.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    );
  },
);

