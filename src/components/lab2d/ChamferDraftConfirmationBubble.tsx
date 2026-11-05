/**
 * CALDRA CHAMFER — BOLHA FLUTUANTE DE CONFIRMAÇÃO E EDIÇÃO RÁPIDA DE FORMAS (DRAFT-THEN-COMMIT)
 *  - Mantém a forma recém-desenhada em estado Pré-Confirmação Editável (Draft Pending) com grips ativos
 *  - Exibe Bolha Inteligente Glassmorphism (backdrop-filter: blur(12px), border-radius: 18px) fora da geometria
 *  - Chips de Dimensão Clicáveis com Teclado Numérico CAD integrado que redimensionam a prévia ao vivo:
 *      • Retângulo: [ L (X): ... mm ✎ ] × [ A (Y): ... mm ✎ ] | [ Raio R: ... mm ✎ ]
 *      • Círculo: [ Ø Diâm: ... mm ✎ ] | [ Raio R: ... mm ✎ ]
 *      • Linha: [ Comp. L: ... mm ✎ ] | [ Ângulo ∠: ...° ✎ ]
 *      • Polígono: [ Lados: 6 ✎ ] | [ Raio R: ... mm ✎ ] | [ Insc./Circ. ]
 *      • Arco: [ Raio R: ... mm ✎ ] | [ Δ∠: ...° ✎ ]
 *      • Elipse / Slot: [ L (X): ... mm ✎ ] | [ A (Y): ... mm ✎ ]
 *  - Botões [ ✓ Confirmar ] e [ ✕ ] + Auto-Commit ergonômico ao iniciar próximo traço ou pressionar Enter
 */

import React, { useState } from "react";
import { Check, X } from "lucide-react";
import type { Vec2 } from "@/lib/geometry/types";
import { boxOf, uid, type Entity } from "@/lib/lab2d/core";
import {
  buildParametricRectangle,
  buildPolygonParametric,
  buildMechanicalSlotAdvanced,
  type RectCreationMode,
  type PolygonCreationMode,
  type SlotCreationMode,
} from "@/lib/lab2d/cadcraftEngine";
import { ChamferDirectDimensionEditor } from "./ChamferDirectDimensionEditor";
import { triggerHaptic } from "@/lib/ui/haptics";

export type DraftShapeKind =
  | "rect"
  | "rrect"
  | "circle"
  | "line"
  | "polygon"
  | "arc"
  | "ellipse"
  | "slot";

export interface PendingDraftShapeState {
  kind: DraftShapeKind;
  entity: Entity;
  layer: string;
  /** Ponto inicial/centro usado na criação */
  p0: Vec2;
  /** Ponto final usado na criação */
  p1: Vec2;
  /** Parâmetros paramétricos preservados para edição ao vivo */
  widthMm: number;
  heightMm: number;
  filletRadiusMm: number;
  radiusMm: number;
  lengthMm: number;
  angleDeg: number;
  sweepAngleDeg: number;
  polygonSides: number;
  polygonMode: PolygonCreationMode;
  rectMode: RectCreationMode;
  slotMode: SlotCreationMode;
}

export interface DraftGripPoint {
  index: number;
  p: Vec2;
  role: "corner" | "center" | "endpoint" | "radius";
  label: string;
}

/**
 * Cria o estado PendingDraftShapeState a partir de uma entidade recém-desenhada no pointerup.
 */
export function createPendingDraftShapeState(
  tool: string,
  entity: Entity,
  p0: Vec2,
  p1: Vec2,
  opts: {
    layer: string;
    filletR: number;
    rectMode: RectCreationMode;
    polygonSides: number;
    polygonMode: PolygonCreationMode;
    slotMode: SlotCreationMode;
    slotWidthMm: number;
  },
): PendingDraftShapeState | null {
  const validKinds: DraftShapeKind[] = [
    "rect",
    "rrect",
    "circle",
    "line",
    "polygon",
    "arc",
    "ellipse",
    "slot",
  ];
  if (!validKinds.includes(tool as DraftShapeKind)) return null;

  const kind = tool as DraftShapeKind;
  const box = boxOf(entity);
  const w = Math.max(0.1, Number((box.maxX - box.minX).toFixed(2)));
  const h = Math.max(0.1, Number((box.maxY - box.minY).toFixed(2)));

  if (kind === "line" && entity.type === "line") {
    const dx = entity.x2 - entity.x1;
    const dy = entity.y2 - entity.y1;
    const len = Math.max(0.1, Number(Math.hypot(dx, dy).toFixed(2)));
    const ang = Number(((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360).toFixed(2));
    return {
      kind: "line",
      entity,
      layer: opts.layer,
      p0: { x: entity.x1, y: entity.y1 },
      p1: { x: entity.x2, y: entity.y2 },
      widthMm: Math.abs(dx),
      heightMm: Math.abs(dy),
      filletRadiusMm: 0,
      radiusMm: len / 2,
      lengthMm: len,
      angleDeg: ang,
      sweepAngleDeg: 0,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      rectMode: opts.rectMode,
      slotMode: opts.slotMode,
    };
  }

  if (kind === "circle" && entity.type === "circle") {
    const r = Math.max(0.5, Number(entity.r.toFixed(2)));
    return {
      kind: "circle",
      entity,
      layer: opts.layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + r, y: entity.cy },
      widthMm: r * 2,
      heightMm: r * 2,
      filletRadiusMm: 0,
      radiusMm: r,
      lengthMm: r * 2,
      angleDeg: 0,
      sweepAngleDeg: 360,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      rectMode: opts.rectMode,
      slotMode: opts.slotMode,
    };
  }

  if (kind === "arc" && entity.type === "arc") {
    const r = Math.max(0.5, Number(entity.r.toFixed(2)));
    let sweepRad = entity.a1 - entity.a0;
    while (sweepRad < 0) sweepRad += Math.PI * 2;
    const sweepDeg = Number(((sweepRad * 180) / Math.PI).toFixed(1));
    return {
      kind: "arc",
      entity,
      layer: opts.layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + r * Math.cos(entity.a1), y: entity.cy + r * Math.sin(entity.a1) },
      widthMm: r * 2,
      heightMm: r * 2,
      filletRadiusMm: 0,
      radiusMm: r,
      lengthMm: r,
      angleDeg: Number((((entity.a0 * 180) / Math.PI + 360) % 360).toFixed(1)),
      sweepAngleDeg: sweepDeg,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      rectMode: opts.rectMode,
      slotMode: opts.slotMode,
    };
  }

  if (kind === "ellipse" && entity.type === "ellipse") {
    const lx = Math.max(1, Number((entity.rx * 2).toFixed(2)));
    const ly = Math.max(1, Number((entity.ry * 2).toFixed(2)));
    return {
      kind: "ellipse",
      entity,
      layer: opts.layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + entity.rx, y: entity.cy + entity.ry },
      widthMm: lx,
      heightMm: ly,
      filletRadiusMm: 0,
      radiusMm: Math.max(entity.rx, entity.ry),
      lengthMm: lx,
      angleDeg: 0,
      sweepAngleDeg: 360,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      rectMode: opts.rectMode,
      slotMode: opts.slotMode,
    };
  }

  if (kind === "polygon") {
    const r = Math.max(1, Number(Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(2)));
    const ang = Number(((((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return {
      kind: "polygon",
      entity,
      layer: opts.layer,
      p0,
      p1,
      widthMm: w,
      heightMm: h,
      filletRadiusMm: 0,
      radiusMm: r,
      lengthMm: r * 2,
      angleDeg: ang,
      sweepAngleDeg: 360,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      rectMode: opts.rectMode,
      slotMode: opts.slotMode,
    };
  }

  if (kind === "slot") {
    const spanLen = Math.max(2, Number(Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(2)));
    const slotW = Math.max(2, Number((opts.slotWidthMm || h).toFixed(2)));
    return {
      kind: "slot",
      entity,
      layer: opts.layer,
      p0,
      p1,
      widthMm: spanLen,
      heightMm: slotW,
      filletRadiusMm: slotW / 2,
      radiusMm: slotW / 2,
      lengthMm: spanLen,
      angleDeg: Number(((((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI) + 360) % 360).toFixed(1)),
      sweepAngleDeg: 0,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      rectMode: opts.rectMode,
      slotMode: opts.slotMode,
    };
  }

  // Retângulo ou Retângulo Arredondado
  const minX = box.minX;
  const maxX = box.maxX;
  const minY = box.minY;
  const maxY = box.maxY;
  return {
    kind,
    entity,
    layer: opts.layer,
    p0: { x: minX, y: minY },
    p1: { x: maxX, y: maxY },
    widthMm: w,
    heightMm: h,
    filletRadiusMm: kind === "rrect" ? Math.max(0.5, opts.filletR) : 0,
    radiusMm: kind === "rrect" ? Math.max(0.5, opts.filletR) : 0,
    lengthMm: w,
    angleDeg: 0,
    sweepAngleDeg: 0,
    polygonSides: opts.polygonSides,
    polygonMode: opts.polygonMode,
    rectMode: "corners",
    slotMode: opts.slotMode,
  };
}

/**
 * Reconstrói a entidade do PendingDraftShapeState após edição numérica ou arraste de grip.
 */
export function rebuildPendingDraftShape(state: PendingDraftShapeState): PendingDraftShapeState {
  const { kind, layer } = state;

  if (kind === "rect" || kind === "rrect") {
    const cx = (state.p0.x + state.p1.x) / 2;
    const cy = (state.p0.y + state.p1.y) / 2;
    const halfW = Math.max(0.5, state.widthMm / 2);
    const halfH = Math.max(0.5, state.heightMm / 2);
    const nextP0 = { x: cx - halfW, y: cy - halfH };
    const nextP1 = { x: cx + halfW, y: cy + halfH };
    const built = buildParametricRectangle("corners", [nextP0, nextP1], {
      layer,
      filletRadius: Math.max(0, state.filletRadiusMm),
    });
    if (built) {
      return {
        ...state,
        p0: nextP0,
        p1: nextP1,
        entity: { ...built, id: state.entity.id || uid() },
      };
    }
  }

  if (kind === "circle") {
    const r = Math.max(0.5, state.radiusMm);
    return {
      ...state,
      widthMm: Number((r * 2).toFixed(2)),
      heightMm: Number((r * 2).toFixed(2)),
      p1: { x: state.p0.x + r, y: state.p0.y },
      entity: {
        id: state.entity.id || uid(),
        layer,
        type: "circle",
        cx: state.p0.x,
        cy: state.p0.y,
        r,
      },
    };
  }

  if (kind === "line") {
    const len = Math.max(0.5, state.lengthMm);
    const rad = (state.angleDeg * Math.PI) / 180;
    const x2 = Number((state.p0.x + Math.cos(rad) * len).toFixed(4));
    const y2 = Number((state.p0.y - Math.sin(rad) * len).toFixed(4));
    return {
      ...state,
      p1: { x: x2, y: y2 },
      widthMm: Math.abs(x2 - state.p0.x),
      heightMm: Math.abs(y2 - state.p0.y),
      entity: {
        id: state.entity.id || uid(),
        layer,
        type: "line",
        x1: state.p0.x,
        y1: state.p0.y,
        x2,
        y2,
      },
    };
  }

  if (kind === "polygon") {
    const r = Math.max(1, state.radiusMm);
    const rad = (state.angleDeg * Math.PI) / 180;
    const targetPt: Vec2 = {
      x: state.p0.x + Math.cos(rad) * r,
      y: state.p0.y + Math.sin(rad) * r,
    };
    const sides = Math.max(3, Math.min(64, Math.round(state.polygonSides)));
    const modeForRadius: PolygonCreationMode =
      state.polygonMode === "circumscribed" ? "circumscribed" : "inscribed";
    const built = buildPolygonParametric(state.p0, targetPt, sides, modeForRadius, layer, r * 2);
    if (built) {
      return {
        ...state,
        polygonSides: sides,
        p1: targetPt,
        entity: { ...built, id: state.entity.id || uid() },
      };
    }
  }

  if (kind === "arc" && state.entity.type === "arc") {
    const r = Math.max(0.5, state.radiusMm);
    const sweepDeg = Math.max(1, Math.min(359.5, state.sweepAngleDeg));
    const a0 = state.entity.a0;
    const a1 = a0 + (sweepDeg * Math.PI) / 180;
    return {
      ...state,
      sweepAngleDeg: sweepDeg,
      p1: { x: state.p0.x + r * Math.cos(a1), y: state.p0.y + r * Math.sin(a1) },
      entity: {
        ...state.entity,
        cx: state.p0.x,
        cy: state.p0.y,
        r,
        a0,
        a1,
      },
    };
  }

  if (kind === "ellipse") {
    const rx = Math.max(0.5, state.widthMm / 2);
    const ry = Math.max(0.5, state.heightMm / 2);
    return {
      ...state,
      p1: { x: state.p0.x + rx, y: state.p0.y + ry },
      entity: {
        id: state.entity.id || uid(),
        layer,
        type: "ellipse",
        cx: state.p0.x,
        cy: state.p0.y,
        rx,
        ry,
        rotation: 0,
      },
    };
  }

  if (kind === "slot") {
    const span = Math.max(2, state.widthMm);
    const slotW = Math.max(2, state.heightMm);
    const rad = (state.angleDeg * Math.PI) / 180;
    const nextP1 = {
      x: state.p0.x + Math.cos(rad) * span,
      y: state.p0.y + Math.sin(rad) * span,
    };
    const built = buildMechanicalSlotAdvanced(state.p0, nextP1, slotW, state.slotMode, layer);
    if (built) {
      return {
        ...state,
        p1: nextP1,
        entity: { ...built, id: state.entity.id || uid() },
      };
    }
  }

  return state;
}

/**
 * Retorna os pontos de grip interativos da forma pendente para ajuste fino por arrasto no canvas.
 */
export function getPendingDraftShapeGrips(state: PendingDraftShapeState): DraftGripPoint[] {
  const { kind } = state;

  if (kind === "rect" || kind === "rrect") {
    const minX = Math.min(state.p0.x, state.p1.x);
    const maxX = Math.max(state.p0.x, state.p1.x);
    const minY = Math.min(state.p0.y, state.p1.y);
    const maxY = Math.max(state.p0.y, state.p1.y);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return [
      { index: 0, p: { x: minX, y: minY }, role: "corner", label: "Canto Sup. Esq." },
      { index: 1, p: { x: maxX, y: minY }, role: "corner", label: "Canto Sup. Dir." },
      { index: 2, p: { x: maxX, y: maxY }, role: "corner", label: "Canto Inf. Dir." },
      { index: 3, p: { x: minX, y: maxY }, role: "corner", label: "Canto Inf. Esq." },
      { index: 4, p: { x: cx, y: cy }, role: "center", label: "Centro" },
    ];
  }

  if (kind === "circle" || kind === "polygon") {
    return [
      { index: 0, p: state.p0, role: "center", label: "Centro" },
      { index: 1, p: state.p1, role: "radius", label: "Raio R" },
    ];
  }

  if (kind === "line" || kind === "slot") {
    return [
      { index: 0, p: state.p0, role: "endpoint", label: "Início" },
      { index: 1, p: state.p1, role: "endpoint", label: "Fim" },
    ];
  }

  if (kind === "arc" && state.entity.type === "arc") {
    const pStart = {
      x: state.entity.cx + state.entity.r * Math.cos(state.entity.a0),
      y: state.entity.cy + state.entity.r * Math.sin(state.entity.a0),
    };
    const pEnd = {
      x: state.entity.cx + state.entity.r * Math.cos(state.entity.a1),
      y: state.entity.cy + state.entity.r * Math.sin(state.entity.a1),
    };
    return [
      { index: 0, p: state.p0, role: "center", label: "Centro" },
      { index: 1, p: pStart, role: "endpoint", label: "Início do Arco" },
      { index: 2, p: pEnd, role: "radius", label: "Fim / Raio" },
    ];
  }

  if (kind === "ellipse") {
    return [
      { index: 0, p: state.p0, role: "center", label: "Centro" },
      { index: 1, p: { x: state.p0.x + state.widthMm / 2, y: state.p0.y }, role: "radius", label: "Raio X" },
      { index: 2, p: { x: state.p0.x, y: state.p0.y + state.heightMm / 2 }, role: "radius", label: "Raio Y" },
    ];
  }

  return [];
}

/**
 * Atualiza o PendingDraftShapeState quando o usuário arrasta um de seus grips no canvas.
 */
export function applyPendingDraftGripDrag(
  state: PendingDraftShapeState,
  gripIndex: number,
  targetWorld: Vec2,
): PendingDraftShapeState {
  const { kind } = state;

  if (kind === "rect" || kind === "rrect") {
    const minX = Math.min(state.p0.x, state.p1.x);
    const maxX = Math.max(state.p0.x, state.p1.x);
    const minY = Math.min(state.p0.y, state.p1.y);
    const maxY = Math.max(state.p0.y, state.p1.y);

    if (gripIndex === 4) {
      // Translação pelo grip central
      const halfW = state.widthMm / 2;
      const halfH = state.heightMm / 2;
      const nextP0 = { x: targetWorld.x - halfW, y: targetWorld.y - halfH };
      const nextP1 = { x: targetWorld.x + halfW, y: targetWorld.y + halfH };
      return rebuildPendingDraftShape({ ...state, p0: nextP0, p1: nextP1 });
    }

    const opp: Vec2 =
      gripIndex === 0
        ? { x: maxX, y: maxY }
        : gripIndex === 1
          ? { x: minX, y: maxY }
          : gripIndex === 2
            ? { x: minX, y: minY }
            : { x: maxX, y: minY };
    const nextMinX = Math.min(opp.x, targetWorld.x);
    const nextMaxX = Math.max(opp.x, targetWorld.x);
    const nextMinY = Math.min(opp.y, targetWorld.y);
    const nextMaxY = Math.max(opp.y, targetWorld.y);
    const nextW = Math.max(0.5, Number((nextMaxX - nextMinX).toFixed(2)));
    const nextH = Math.max(0.5, Number((nextMaxY - nextMinY).toFixed(2)));
    return rebuildPendingDraftShape({
      ...state,
      p0: { x: nextMinX, y: nextMinY },
      p1: { x: nextMaxX, y: nextMaxY },
      widthMm: nextW,
      heightMm: nextH,
    });
  }

  if (kind === "circle" || kind === "polygon") {
    if (gripIndex === 0) {
      const dx = targetWorld.x - state.p0.x;
      const dy = targetWorld.y - state.p0.y;
      return rebuildPendingDraftShape({
        ...state,
        p0: targetWorld,
        p1: { x: state.p1.x + dx, y: state.p1.y + dy },
      });
    }
    const r = Math.max(0.5, Number(Math.hypot(targetWorld.x - state.p0.x, targetWorld.y - state.p0.y).toFixed(2)));
    const ang = Number(((((Math.atan2(targetWorld.y - state.p0.y, targetWorld.x - state.p0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return rebuildPendingDraftShape({
      ...state,
      p1: targetWorld,
      radiusMm: r,
      angleDeg: ang,
    });
  }

  if (kind === "line") {
    const nextP0 = gripIndex === 0 ? targetWorld : state.p0;
    const nextP1 = gripIndex === 1 ? targetWorld : state.p1;
    const dx = nextP1.x - nextP0.x;
    const dy = nextP1.y - nextP0.y;
    const len = Math.max(0.5, Number(Math.hypot(dx, dy).toFixed(2)));
    const ang = Number(((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360).toFixed(2));
    return {
      ...state,
      p0: nextP0,
      p1: nextP1,
      lengthMm: len,
      angleDeg: ang,
      widthMm: Math.abs(dx),
      heightMm: Math.abs(dy),
      entity: {
        id: state.entity.id || uid(),
        layer: state.layer,
        type: "line",
        x1: nextP0.x,
        y1: nextP0.y,
        x2: nextP1.x,
        y2: nextP1.y,
      },
    };
  }

  if (kind === "slot") {
    const nextP0 = gripIndex === 0 ? targetWorld : state.p0;
    const nextP1 = gripIndex === 1 ? targetWorld : state.p1;
    const len = Math.max(2, Number(Math.hypot(nextP1.x - nextP0.x, nextP1.y - nextP0.y).toFixed(2)));
    const ang = Number(((((Math.atan2(nextP1.y - nextP0.y, nextP1.x - nextP0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return rebuildPendingDraftShape({
      ...state,
      p0: nextP0,
      p1: nextP1,
      widthMm: len,
      lengthMm: len,
      angleDeg: ang,
    });
  }

  if (kind === "ellipse") {
    if (gripIndex === 0) {
      return rebuildPendingDraftShape({ ...state, p0: targetWorld });
    }
    if (gripIndex === 1) {
      const nextW = Math.max(1, Number((Math.abs(targetWorld.x - state.p0.x) * 2).toFixed(2)));
      return rebuildPendingDraftShape({ ...state, widthMm: nextW });
    }
    if (gripIndex === 2) {
      const nextH = Math.max(1, Number((Math.abs(targetWorld.y - state.p0.y) * 2).toFixed(2)));
      return rebuildPendingDraftShape({ ...state, heightMm: nextH });
    }
  }

  if (kind === "arc" && state.entity.type === "arc") {
    if (gripIndex === 0) {
      return rebuildPendingDraftShape({ ...state, p0: targetWorld });
    }
    const r = Math.max(0.5, Number(Math.hypot(targetWorld.x - state.p0.x, targetWorld.y - state.p0.y).toFixed(2)));
    return rebuildPendingDraftShape({ ...state, radiusMm: r });
  }

  return state;
}

export interface ChamferDraftConfirmationBubbleProps {
  pendingShape: PendingDraftShapeState | null;
  view: { k: number; tx: number; ty: number };
  canvasWidth: number;
  canvasHeight: number;
  isDark?: boolean;
  onUpdatePendingShape: (next: PendingDraftShapeState) => void;
  onConfirmPendingShape: () => void;
  onCancelPendingShape: () => void;
}

type EditableChipField =
  | "width"
  | "height"
  | "filletRadius"
  | "diameter"
  | "radius"
  | "length"
  | "angle"
  | "sides"
  | "sweepAngle";

export const ChamferDraftConfirmationBubble: React.FC<ChamferDraftConfirmationBubbleProps> = ({
  pendingShape,
  view,
  canvasWidth,
  canvasHeight,
  isDark = true,
  onUpdatePendingShape,
  onConfirmPendingShape,
  onCancelPendingShape,
}) => {
  const [activeField, setActiveField] = useState<{
    field: EditableChipField;
    label: string;
    value: number;
    unit: string;
    screenPos: Vec2;
  } | null>(null);

  if (!pendingShape) return null;

  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
  const box = boxOf(pendingShape.entity);
  const screenMinX = box.minX * safeK + view.tx;
  const screenMaxX = box.maxX * safeK + view.tx;
  const screenMinY = box.minY * safeK + view.ty;
  const screenMaxY = box.maxY * safeK + view.ty;

  // Posiciona a bolha logo abaixo ou ao lado da forma, NUNCA cobrindo a geometria!
  const centerX = (screenMinX + screenMaxX) / 2;
  const clampedLeft = Math.min(Math.max(168, centerX), Math.max(170, canvasWidth - 168));
  let bubbleTop = screenMaxY + 18;
  if (bubbleTop > canvasHeight - 96) {
    // Se a forma estiver próxima da borda inferior, posiciona acima da forma
    bubbleTop = Math.max(60, screenMinY - 54);
  }

  const openFieldKeypad = (
    field: EditableChipField,
    label: string,
    value: number,
    unit: string,
    ev: React.MouseEvent,
  ) => {
    ev.stopPropagation();
    triggerHaptic("selection");
    setActiveField({
      field,
      label,
      value,
      unit,
      screenPos: { x: ev.clientX, y: ev.clientY },
    });
  };

  const applyFieldValue = (field: EditableChipField, newVal: number) => {
    let next = { ...pendingShape };
    if (field === "width") next.widthMm = Math.max(0.5, newVal);
    if (field === "height") next.heightMm = Math.max(0.5, newVal);
    if (field === "filletRadius") {
      next.filletRadiusMm = Math.max(0, newVal);
      next.kind = newVal > 0 ? "rrect" : "rect";
    }
    if (field === "diameter") next.radiusMm = Math.max(0.25, newVal / 2);
    if (field === "radius") next.radiusMm = Math.max(0.25, newVal);
    if (field === "length") next.lengthMm = Math.max(0.5, newVal);
    if (field === "angle") next.angleDeg = ((newVal % 360) + 360) % 360;
    if (field === "sides") next.polygonSides = Math.max(3, Math.min(64, Math.round(newVal)));
    if (field === "sweepAngle") next.sweepAngleDeg = Math.max(1, Math.min(359.5, newVal));

    next = rebuildPendingDraftShape(next);
    onUpdatePendingShape(next);
  };

  const chipStyle: React.CSSProperties = {
    backgroundColor: isDark ? "rgba(30, 41, 59, 0.82)" : "rgba(241, 245, 249, 0.92)",
    borderColor: isDark ? "rgba(56, 189, 248, 0.35)" : "rgba(2, 132, 199, 0.3)",
    color: isDark ? "#E2E8F0" : "#0F172A",
  };

  const { kind } = pendingShape;

  return (
    <>
      <div
        data-testid="chamfer-draft-confirmation-bubble"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          left: Math.round(clampedLeft),
          top: Math.round(bubbleTop),
          transform: "translateX(-50%)",
          borderRadius: 18,
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: isDark
            ? "1px solid rgba(56, 189, 248, 0.38)"
            : "1px solid rgba(2, 132, 199, 0.32)",
          boxShadow: isDark
            ? "0 10px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)"
            : "0 10px 24px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
        }}
        className="pointer-events-auto absolute z-45 flex flex-nowrap items-center gap-1.5 px-2.5 py-1.5 font-mono text-[11px] select-none whitespace-nowrap max-w-[95vw] overflow-x-auto scrollbar-none"
      >
        {/* RETÂNGULO: [ L (X): 367.2 mm ✎ ] × [ A (Y): 210.0 mm ✎ ] e [ Raio R: 0 mm ✎ ] */}
        {(kind === "rect" || kind === "rrect") && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("width", "Largura L (X) do Retângulo", pendingShape.widthMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">L (X):</span>
              <span>{pendingShape.widthMm.toFixed(1)} mm</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <span className="text-slate-400 font-bold text-[10px]">×</span>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("height", "Altura A (Y) do Retângulo", pendingShape.heightMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">A (Y):</span>
              <span>{pendingShape.heightMm.toFixed(1)} mm</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) =>
                openFieldKeypad("filletRadius", "Raio de Canto R do Retângulo", pendingShape.filletRadiusMm, "mm", ev)
              }
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-amber-400 font-bold">Raio R:</span>
              <span>{pendingShape.filletRadiusMm.toFixed(0)} mm</span>
              <span className="text-amber-400 text-[10px]">✎</span>
            </button>
          </>
        )}

        {/* CÍRCULO: [ Ø Diâm: 100.0 mm ✎ ] | [ Raio R: 50.0 mm ✎ ] */}
        {kind === "circle" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("diameter", "Diâmetro Ø do Círculo", pendingShape.radiusMm * 2, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">Ø Diâm:</span>
              <span>{(pendingShape.radiusMm * 2).toFixed(1)} mm</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("radius", "Raio R do Círculo", pendingShape.radiusMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-amber-400 font-bold">Raio R:</span>
              <span>{pendingShape.radiusMm.toFixed(1)} mm</span>
              <span className="text-amber-400 text-[10px]">✎</span>
            </button>
          </>
        )}

        {/* LINHA: [ Comp. L: 367.2 mm ✎ ] | [ Ângulo ∠: 330.6° ✎ ] */}
        {kind === "line" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("length", "Comprimento L da Linha", pendingShape.lengthMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">Comp. L:</span>
              <span>{pendingShape.lengthMm.toFixed(1)} mm</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("angle", "Ângulo ∠ da Linha", pendingShape.angleDeg, "°", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-amber-400 font-bold">Ângulo ∠:</span>
              <span>{pendingShape.angleDeg.toFixed(1)}°</span>
              <span className="text-amber-400 text-[10px]">✎</span>
            </button>
          </>
        )}

        {/* POLÍGONO: [ Lados: 6 ✎ ] | [ Raio R: 80.0 mm ✎ ] | [ Insc./Circ. ] */}
        {kind === "polygon" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("sides", "Número de Lados do Polígono", pendingShape.polygonSides, "", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">Lados:</span>
              <span>{pendingShape.polygonSides}</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("radius", "Raio R do Polígono", pendingShape.radiusMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-amber-400 font-bold">Raio R:</span>
              <span>{pendingShape.radiusMm.toFixed(1)} mm</span>
              <span className="text-amber-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                const nextMode: PolygonCreationMode =
                  pendingShape.polygonMode === "inscribed" ? "circumscribed" : "inscribed";
                onUpdatePendingShape(rebuildPendingDraftShape({ ...pendingShape, polygonMode: nextMode }));
              }}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-emerald-400 font-bold">
                {pendingShape.polygonMode === "circumscribed" ? "Circ." : "Insc."}
              </span>
            </button>
          </>
        )}

        {/* ARCO: [ Raio R: 120.0 mm ✎ ] | [ Δ∠: 90.0° ✎ ] */}
        {kind === "arc" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("radius", "Raio R do Arco", pendingShape.radiusMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">Raio R:</span>
              <span>{pendingShape.radiusMm.toFixed(1)} mm</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("sweepAngle", "Ângulo de Abertura Δ∠ do Arco", pendingShape.sweepAngleDeg, "°", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-amber-400 font-bold">Δ∠:</span>
              <span>{pendingShape.sweepAngleDeg.toFixed(1)}°</span>
              <span className="text-amber-400 text-[10px]">✎</span>
            </button>
          </>
        )}

        {/* ELIPSE / OBLONGO (SLOT): [ L (X) ✎ ] | [ A (Y) ✎ ] */}
        {(kind === "ellipse" || kind === "slot") && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("width", "Comprimento L (X)", pendingShape.widthMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-sky-400 font-bold">L (X):</span>
              <span>{pendingShape.widthMm.toFixed(1)} mm</span>
              <span className="text-sky-400 text-[10px]">✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("height", "Largura / Altura A (Y)", pendingShape.heightMm, "mm", ev)}
              style={chipStyle}
              className="flex items-center gap-1 rounded-xl border px-2 py-1 font-semibold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <span className="text-amber-400 font-bold">A (Y):</span>
              <span>{pendingShape.heightMm.toFixed(1)} mm</span>
              <span className="text-amber-400 text-[10px]">✎</span>
            </button>
          </>
        )}

        {/* BOTÃO DE AÇÃO RÁPIDA: [ ✓ Confirmar ] */}
        <button
          type="button"
          data-testid="chamfer-draft-confirm-btn"
          onClick={() => {
            triggerHaptic("action");
            onConfirmPendingShape();
          }}
          className="ml-0.5 flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition-all cursor-pointer"
          title="Confirmar forma e gravar no desenho (Enter)"
        >
          <Check className="size-3.5 stroke-[2.8]" />
          <span>Confirmar</span>
        </button>

        {/* BOTÃO SUTIL DE DESCARTE: [ ✕ ] */}
        <button
          type="button"
          data-testid="chamfer-draft-cancel-btn"
          onClick={() => {
            triggerHaptic("tap");
            onCancelPendingShape();
          }}
          className="flex size-6 items-center justify-center rounded-xl bg-slate-800/80 hover:bg-red-900/75 text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Descartar rascunho pendente (Esc)"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Teclado Numérico CAD Integrado ao clicar em qualquer chip de dimensão da bolha */}
      {activeField && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => setActiveField(null)}
          screenPos={activeField.screenPos}
          currentValue={activeField.value}
          label={activeField.label}
          unit={activeField.unit}
          allowNegative={activeField.field === "angle"}
          onPreviewChange={(previewVal) => {
            applyFieldValue(activeField.field, previewVal);
          }}
          onConfirm={(finalVal) => {
            applyFieldValue(activeField.field, finalVal);
            setActiveField(null);
            triggerHaptic("success");
          }}
        />
      )}
    </>
  );
};
