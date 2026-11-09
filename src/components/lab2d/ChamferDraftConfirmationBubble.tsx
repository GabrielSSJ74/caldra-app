/**
 * CALDRA CHAMFER — BARRA UNIFICADA DE MEDIDAS EM TEMPO REAL E CONFIRMAÇÃO DE ENTIDADES (60 FPS)
 *  - Atua como a ÚNICA barra de medidas e confirmação no topo do canvas:
 *      • Aparece imediatamente ao definir o 1º ponto (atualizando em tempo real a 60 FPS durante o arraste ou FINO • MIRA)
 *      • Permanece na mesma posição após soltar o dedo/mouse para ajuste por Numpad CAD, FINO • MIRA ou confirmação
 *  - Proporção compacta de engenharia (altura 24px das pílulas internas, fonte mono 11px) e posição elevada no topo
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
  type CircleCreationMode,
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
  | "construction_line"
  | "polyline"
  | "spline"
  | "polygon"
  | "arc"
  | "ellipse"
  | "slot";

export interface PendingDraftShapeState {
  kind: DraftShapeKind;
  tool: DraftShapeKind;
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
  cornerRadiusMm: number;
  radiusMm: number;
  lengthMm: number;
  chordMm: number;
  angleDeg: number;
  sweepAngleDeg: number;
  polygonSides: number;
  polygonMode: PolygonCreationMode;
  polygonAcrossFlatsMm: number;
  rectMode: RectCreationMode;
  circleMode?: CircleCreationMode;
  slotMode: SlotCreationMode;
  slotWidthMm: number;
  isLiveDraft?: boolean;
  isSelectedEntity?: boolean;
}

export interface DraftGripPoint {
  index: number;
  p: Vec2;
  role: "corner" | "center" | "endpoint" | "radius";
  label: string;
}

export interface CreatePendingDraftShapeOptions {
  layer?: string;
  filletR?: number;
  rectMode?: RectCreationMode;
  circleMode?: CircleCreationMode;
  polygonSides?: number;
  polygonMode?: PolygonCreationMode;
  polygonAcrossFlatsMm?: number;
  slotMode?: SlotCreationMode;
  slotWidthMm?: number;
  arcMidPoint?: Vec2;
  isLiveDraft?: boolean;
}

/**
 * Normaliza chamadas de 5 ou 7 argumentos de createPendingDraftShapeState.
 */
function normalizeDraftOptions(
  layerOrOpts: string | CreatePendingDraftShapeOptions,
  filletROrUndefined?: number,
  extraOpts?: CreatePendingDraftShapeOptions,
): Required<
  Pick<
    CreatePendingDraftShapeOptions,
    | "layer"
    | "filletR"
    | "rectMode"
    | "circleMode"
    | "polygonSides"
    | "polygonMode"
    | "polygonAcrossFlatsMm"
    | "slotMode"
    | "slotWidthMm"
    | "isLiveDraft"
  >
> & { arcMidPoint?: Vec2 } {
  if (typeof layerOrOpts === "string") {
    return {
      layer: layerOrOpts,
      filletR: typeof filletROrUndefined === "number" ? filletROrUndefined : 0,
      rectMode: extraOpts?.rectMode ?? "corners",
      circleMode: extraOpts?.circleMode ?? "center_radius",
      polygonSides: extraOpts?.polygonSides ?? 6,
      polygonMode: extraOpts?.polygonMode ?? "across_flats",
      polygonAcrossFlatsMm: extraOpts?.polygonAcrossFlatsMm ?? 24,
      slotMode: extraOpts?.slotMode ?? "center_to_center",
      slotWidthMm: extraOpts?.slotWidthMm ?? 12,
      arcMidPoint: extraOpts?.arcMidPoint,
      isLiveDraft: extraOpts?.isLiveDraft ?? false,
    };
  }
  return {
    layer: layerOrOpts.layer ?? "0",
    filletR: layerOrOpts.filletR ?? 0,
    rectMode: layerOrOpts.rectMode ?? "corners",
    circleMode: layerOrOpts.circleMode ?? "center_radius",
    polygonSides: layerOrOpts.polygonSides ?? 6,
    polygonMode: layerOrOpts.polygonMode ?? "across_flats",
    polygonAcrossFlatsMm: layerOrOpts.polygonAcrossFlatsMm ?? 24,
    slotMode: layerOrOpts.slotMode ?? "center_to_center",
    slotWidthMm: layerOrOpts.slotWidthMm ?? 12,
    arcMidPoint: layerOrOpts.arcMidPoint,
    isLiveDraft: layerOrOpts.isLiveDraft ?? false,
  };
}

/**
 * Cria o estado PendingDraftShapeState a partir de uma entidade em criação ao vivo (60 FPS) ou recém-desenhada no pointerup.
 */
export function createPendingDraftShapeState(
  tool: string,
  entity: Entity,
  p0: Vec2,
  p1: Vec2,
  layerOrOpts: string | CreatePendingDraftShapeOptions,
  filletROrUndefined?: number,
  extraOpts?: CreatePendingDraftShapeOptions,
): PendingDraftShapeState | null {
  const validKinds: DraftShapeKind[] = [
    "rect",
    "rrect",
    "circle",
    "line",
    "construction_line",
    "polyline",
    "spline",
    "polygon",
    "arc",
    "ellipse",
    "slot",
  ];
  if (!validKinds.includes(tool as DraftShapeKind)) return null;

  const opts = normalizeDraftOptions(layerOrOpts, filletROrUndefined, extraOpts);
  const kind = tool as DraftShapeKind;
  const minVal = opts.isLiveDraft ? 0 : 0.1;
  const box = boxOf(entity);
  const w = Math.max(minVal, Number((box.maxX - box.minX).toFixed(2)));
  const h = Math.max(minVal, Number((box.maxY - box.minY).toFixed(2)));

  if (
    (kind === "line" ||
      kind === "construction_line" ||
      kind === "polyline" ||
      kind === "spline") &&
    entity.type === "line"
  ) {
    const dx = entity.x2 - entity.x1;
    const dy = entity.y2 - entity.y1;
    const len = Math.max(minVal, Number(Math.hypot(dx, dy).toFixed(2)));
    const ang =
      Math.hypot(dx, dy) < 1e-6
        ? 0
        : Number(((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360).toFixed(2));
    return {
      kind,
      tool: kind,
      entity,
      layer: opts.layer,
      p0: { x: entity.x1, y: entity.y1 },
      p1: { x: entity.x2, y: entity.y2 },
      widthMm: Math.abs(dx),
      heightMm: Math.abs(dy),
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: len / 2,
      lengthMm: len,
      chordMm: len,
      angleDeg: ang,
      sweepAngleDeg: 0,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
      rectMode: opts.rectMode,
      circleMode: opts.circleMode,
      slotMode: opts.slotMode,
      slotWidthMm: opts.slotWidthMm,
      isLiveDraft: opts.isLiveDraft,
    };
  }

  if (kind === "circle" && entity.type === "circle") {
    const r = Math.max(opts.isLiveDraft ? 0 : 0.5, Number(entity.r.toFixed(2)));
    return {
      kind: "circle",
      tool: "circle",
      entity,
      layer: opts.layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + r, y: entity.cy },
      widthMm: r * 2,
      heightMm: r * 2,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: r,
      lengthMm: r * 2,
      chordMm: r * 2,
      angleDeg: 0,
      sweepAngleDeg: 360,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
      rectMode: opts.rectMode,
      circleMode: opts.circleMode,
      slotMode: opts.slotMode,
      slotWidthMm: opts.slotWidthMm,
      isLiveDraft: opts.isLiveDraft,
    };
  }

  if (kind === "arc") {
    if (entity.type === "arc") {
      const r = Math.max(opts.isLiveDraft ? 0 : 0.5, Number(entity.r.toFixed(2)));
      let sweepRad = entity.a1 - entity.a0;
      while (sweepRad < 0) sweepRad += Math.PI * 2;
      const sweepDeg = Number(((sweepRad * 180) / Math.PI).toFixed(1));
      const chord = Number((2 * r * Math.sin(sweepRad / 2)).toFixed(2));
      return {
        kind: "arc",
        tool: "arc",
        entity,
        layer: opts.layer,
        p0: { x: entity.cx, y: entity.cy },
        p1: { x: entity.cx + r * Math.cos(entity.a1), y: entity.cy + r * Math.sin(entity.a1) },
        widthMm: r * 2,
        heightMm: r * 2,
        filletRadiusMm: 0,
        cornerRadiusMm: 0,
        radiusMm: r,
        lengthMm: r,
        chordMm: Math.max(0, chord),
        angleDeg: Number((((entity.a0 * 180) / Math.PI + 360) % 360).toFixed(1)),
        sweepAngleDeg: sweepDeg,
        polygonSides: opts.polygonSides,
        polygonMode: opts.polygonMode,
        polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
        rectMode: opts.rectMode,
        circleMode: opts.circleMode,
        slotMode: opts.slotMode,
        slotWidthMm: opts.slotWidthMm,
        isLiveDraft: opts.isLiveDraft,
      };
    }
    // Durante o 1º segmento do arco (definindo a corda antes do 3º ponto)
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const chord = Math.max(minVal, Number(Math.hypot(dx, dy).toFixed(2)));
    const ang =
      chord < 1e-6
        ? 0
        : Number(((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return {
      kind: "arc",
      tool: "arc",
      entity,
      layer: opts.layer,
      p0,
      p1,
      widthMm: chord,
      heightMm: chord,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: Number((chord / 2).toFixed(2)),
      lengthMm: chord,
      chordMm: chord,
      angleDeg: ang,
      sweepAngleDeg: ang,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
      rectMode: opts.rectMode,
      circleMode: opts.circleMode,
      slotMode: opts.slotMode,
      slotWidthMm: opts.slotWidthMm,
      isLiveDraft: opts.isLiveDraft,
    };
  }

  if (kind === "ellipse" && entity.type === "ellipse") {
    const lx = Math.max(minVal, Number((entity.rx * 2).toFixed(2)));
    const ly = Math.max(minVal, Number((entity.ry * 2).toFixed(2)));
    return {
      kind: "ellipse",
      tool: "ellipse",
      entity,
      layer: opts.layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + entity.rx, y: entity.cy + entity.ry },
      widthMm: lx,
      heightMm: ly,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: Math.max(entity.rx, entity.ry),
      lengthMm: lx,
      chordMm: lx,
      angleDeg: 0,
      sweepAngleDeg: 360,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
      rectMode: opts.rectMode,
      circleMode: opts.circleMode,
      slotMode: opts.slotMode,
      slotWidthMm: opts.slotWidthMm,
      isLiveDraft: opts.isLiveDraft,
    };
  }

  if (kind === "polygon") {
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const r = Math.max(opts.isLiveDraft ? 0 : 1, Number(dist.toFixed(2)));
    const ang =
      dist < 1e-6
        ? 0
        : Number(((((Math.atan2(-(p1.y - p0.y), p1.x - p0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return {
      kind: "polygon",
      tool: "polygon",
      entity,
      layer: opts.layer,
      p0,
      p1,
      widthMm: w,
      heightMm: h,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: r,
      lengthMm: r * 2,
      chordMm: r * 2,
      angleDeg: ang,
      sweepAngleDeg: 360,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
      rectMode: opts.rectMode,
      circleMode: opts.circleMode,
      slotMode: opts.slotMode,
      slotWidthMm: opts.slotWidthMm,
      isLiveDraft: opts.isLiveDraft,
    };
  }

  if (kind === "slot") {
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const spanLen = Math.max(opts.isLiveDraft ? 0 : 2, Number(dist.toFixed(2)));
    const slotW = Math.max(2, Number((opts.slotWidthMm || h || 12).toFixed(2)));
    const ang =
      dist < 1e-6
        ? 0
        : Number(((((Math.atan2(-(p1.y - p0.y), p1.x - p0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return {
      kind: "slot",
      tool: "slot",
      entity,
      layer: opts.layer,
      p0,
      p1,
      widthMm: spanLen,
      heightMm: slotW,
      filletRadiusMm: slotW / 2,
      cornerRadiusMm: slotW / 2,
      radiusMm: slotW / 2,
      lengthMm: spanLen,
      chordMm: spanLen,
      angleDeg: ang,
      sweepAngleDeg: 0,
      polygonSides: opts.polygonSides,
      polygonMode: opts.polygonMode,
      polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
      rectMode: opts.rectMode,
      circleMode: opts.circleMode,
      slotMode: opts.slotMode,
      slotWidthMm: slotW,
      isLiveDraft: opts.isLiveDraft,
    };
  }

  // Retângulo ou Retângulo Arredondado (2 Cantos, Centro ou 3 Pontos)
  let rectW = w;
  let rectH = h;
  let rectAng = 0;
  if (
    opts.rectMode === "three_point" &&
    entity.type === "polyline" &&
    entity.pts.length >= 4
  ) {
    const v0 = entity.pts[0]!;
    const v1 = entity.pts[1]!;
    const v2 = entity.pts[2]!;
    rectW = Math.max(minVal, Number(Math.hypot(v1.x - v0.x, v1.y - v0.y).toFixed(2)));
    rectH = Math.max(minVal, Number(Math.hypot(v2.x - v1.x, v2.y - v1.y).toFixed(2)));
    rectAng =
      rectW < 1e-6
        ? 0
        : Number(((((Math.atan2(-(v1.y - v0.y), v1.x - v0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
  }

  const cornerR = kind === "rrect" ? Math.max(0.5, opts.filletR) : 0;

  return {
    kind,
    tool: kind,
    entity,
    layer: opts.layer,
    p0: { x: box.minX, y: box.minY },
    p1: { x: box.maxX, y: box.maxY },
    widthMm: rectW,
    heightMm: rectH,
    filletRadiusMm: cornerR,
    cornerRadiusMm: cornerR,
    radiusMm: cornerR,
    lengthMm: rectW,
    chordMm: rectW,
    angleDeg: rectAng,
    sweepAngleDeg: 0,
    polygonSides: opts.polygonSides,
    polygonMode: opts.polygonMode,
    polygonAcrossFlatsMm: opts.polygonAcrossFlatsMm,
    rectMode: opts.rectMode,
    circleMode: opts.circleMode,
    slotMode: opts.slotMode,
    slotWidthMm: opts.slotWidthMm,
    isLiveDraft: opts.isLiveDraft,
  };
}

/**
 * Converte uma peça existente selecionada no canvas em um PendingDraftShapeState
 * (`isSelectedEntity: true`) para exibir e editar suas medidas reais na Barra Superior Compacta.
 */
export function createSelectedEntityDraftState(
  entity: Entity | null | undefined,
): PendingDraftShapeState | null {
  if (!entity) return null;
  const layer = entity.layer || "0";

  if (entity.type === "circle") {
    const r = Math.max(0.1, Number(entity.r.toFixed(2)));
    return {
      kind: "circle",
      tool: "circle",
      entity,
      layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + r, y: entity.cy },
      widthMm: Number((r * 2).toFixed(2)),
      heightMm: Number((r * 2).toFixed(2)),
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: r,
      lengthMm: Number((r * 2).toFixed(2)),
      chordMm: Number((r * 2).toFixed(2)),
      angleDeg: 0,
      sweepAngleDeg: 360,
      polygonSides: 6,
      polygonMode: "inscribed",
      polygonAcrossFlatsMm: Number((r * 2).toFixed(2)),
      rectMode: "corners",
      circleMode: "center_radius",
      slotMode: "center_to_center",
      slotWidthMm: 12,
      isSelectedEntity: true,
    };
  }

  if (entity.type === "line") {
    const dx = entity.x2 - entity.x1;
    const dy = entity.y2 - entity.y1;
    const len = Math.max(0.1, Number(Math.hypot(dx, dy).toFixed(2)));
    const ang =
      len < 1e-6
        ? 0
        : Number(((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return {
      kind: "line",
      tool: "line",
      entity,
      layer,
      p0: { x: entity.x1, y: entity.y1 },
      p1: { x: entity.x2, y: entity.y2 },
      widthMm: Number(Math.abs(dx).toFixed(2)),
      heightMm: Number(Math.abs(dy).toFixed(2)),
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: Number((len / 2).toFixed(2)),
      lengthMm: len,
      chordMm: len,
      angleDeg: ang,
      sweepAngleDeg: 0,
      polygonSides: 6,
      polygonMode: "inscribed",
      polygonAcrossFlatsMm: 24,
      rectMode: "corners",
      circleMode: "center_radius",
      slotMode: "center_to_center",
      slotWidthMm: 12,
      isSelectedEntity: true,
    };
  }

  if (entity.type === "arc") {
    const r = Math.max(0.1, Number(entity.r.toFixed(2)));
    let sweepRad = entity.a1 - entity.a0;
    while (sweepRad < 0) sweepRad += Math.PI * 2;
    const sweepDeg = Number(((sweepRad * 180) / Math.PI).toFixed(1));
    const chord = Number((2 * r * Math.sin(sweepRad / 2)).toFixed(2));
    return {
      kind: "arc",
      tool: "arc",
      entity,
      layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + r * Math.cos(entity.a1), y: entity.cy + r * Math.sin(entity.a1) },
      widthMm: Number((r * 2).toFixed(2)),
      heightMm: Number((r * 2).toFixed(2)),
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: r,
      lengthMm: r,
      chordMm: Math.max(0.1, chord),
      angleDeg: Number((((entity.a0 * 180) / Math.PI + 360) % 360).toFixed(1)),
      sweepAngleDeg: sweepDeg,
      polygonSides: 6,
      polygonMode: "inscribed",
      polygonAcrossFlatsMm: 24,
      rectMode: "corners",
      circleMode: "center_radius",
      slotMode: "center_to_center",
      slotWidthMm: 12,
      isSelectedEntity: true,
    };
  }

  if (entity.type === "ellipse") {
    const lx = Math.max(0.1, Number((entity.rx * 2).toFixed(2)));
    const ly = Math.max(0.1, Number((entity.ry * 2).toFixed(2)));
    return {
      kind: "ellipse",
      tool: "ellipse",
      entity,
      layer,
      p0: { x: entity.cx, y: entity.cy },
      p1: { x: entity.cx + entity.rx, y: entity.cy + entity.ry },
      widthMm: lx,
      heightMm: ly,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: Math.max(entity.rx, entity.ry),
      lengthMm: lx,
      chordMm: lx,
      angleDeg: 0,
      sweepAngleDeg: 360,
      polygonSides: 6,
      polygonMode: "inscribed",
      polygonAcrossFlatsMm: 24,
      rectMode: "corners",
      circleMode: "center_radius",
      slotMode: "center_to_center",
      slotWidthMm: 12,
      isSelectedEntity: true,
    };
  }

  if (entity.type === "rect") {
    const w = Math.max(0.1, Number(Math.abs(entity.w).toFixed(2)));
    const h = Math.max(0.1, Number(Math.abs(entity.h).toFixed(2)));
    return {
      kind: "rect",
      tool: "rect",
      entity,
      layer,
      p0: { x: entity.x, y: entity.y },
      p1: { x: entity.x + entity.w, y: entity.y + entity.h },
      widthMm: w,
      heightMm: h,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: 0,
      lengthMm: w,
      chordMm: w,
      angleDeg: 0,
      sweepAngleDeg: 0,
      polygonSides: 6,
      polygonMode: "inscribed",
      polygonAcrossFlatsMm: 24,
      rectMode: "corners",
      circleMode: "center_radius",
      slotMode: "center_to_center",
      slotWidthMm: 12,
      isSelectedEntity: true,
    };
  }

  if (entity.type === "polyline" && entity.pts.length >= 2) {
    const box = boxOf(entity);
    const w = Math.max(0.1, Number((box.maxX - box.minX).toFixed(2)));
    const h = Math.max(0.1, Number((box.maxY - box.minY).toFixed(2)));

    if (!entity.closed) {
      const pStart = entity.pts[0]!;
      const pEnd = entity.pts[entity.pts.length - 1]!;
      let totalLen = 0;
      for (let i = 1; i < entity.pts.length; i++) {
        totalLen += Math.hypot(
          entity.pts[i]!.x - entity.pts[i - 1]!.x,
          entity.pts[i]!.y - entity.pts[i - 1]!.y,
        );
      }
      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      const ang =
        Math.hypot(dx, dy) < 1e-6
          ? 0
          : Number(((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360).toFixed(1));
      return {
        kind: "polyline",
        tool: "polyline",
        entity,
        layer,
        p0: pStart,
        p1: pEnd,
        widthMm: w,
        heightMm: h,
        filletRadiusMm: 0,
        cornerRadiusMm: 0,
        radiusMm: Number((totalLen / 2).toFixed(2)),
        lengthMm: Math.max(0.1, Number(totalLen.toFixed(2))),
        chordMm: Math.max(0.1, Number(Math.hypot(dx, dy).toFixed(2))),
        angleDeg: ang,
        sweepAngleDeg: 0,
        polygonSides: 6,
        polygonMode: "inscribed",
        polygonAcrossFlatsMm: 24,
        rectMode: "corners",
        circleMode: "center_radius",
        slotMode: "center_to_center",
        slotWidthMm: 12,
        isSelectedEntity: true,
      };
    }

    // Polígono regular fechado (3 a 16 vértices equidistantes do centroide e lados iguais, exceto retângulo 4 cantos não quadrado)
    if (entity.pts.length >= 3 && entity.pts.length <= 16 && entity.pts.length !== 4) {
      const n = entity.pts.length;
      const cx = entity.pts.reduce((s, p) => s + p.x, 0) / n;
      const cy = entity.pts.reduce((s, p) => s + p.y, 0) / n;
      const radii = entity.pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
      const avgR = radii.reduce((s, r) => s + r, 0) / n;
      const maxRadialDiff = Math.max(...radii.map((r) => Math.abs(r - avgR)));
      if (avgR > 0.5 && maxRadialDiff <= avgR * 0.04) {
        const v0 = entity.pts[0]!;
        const ang = Number(
          ((((Math.atan2(-(v0.y - cy), v0.x - cx) * 180) / Math.PI) + 360) % 360).toFixed(1),
        );
        return {
          kind: "polygon",
          tool: "polygon",
          entity,
          layer,
          p0: { x: cx, y: cy },
          p1: v0,
          widthMm: w,
          heightMm: h,
          filletRadiusMm: 0,
          cornerRadiusMm: 0,
          radiusMm: Number(avgR.toFixed(2)),
          lengthMm: Number((avgR * 2).toFixed(2)),
          chordMm: Number((avgR * 2).toFixed(2)),
          angleDeg: ang,
          sweepAngleDeg: 360,
          polygonSides: n,
          polygonMode: "inscribed",
          polygonAcrossFlatsMm: Number((avgR * 2).toFixed(2)),
          rectMode: "corners",
          circleMode: "center_radius",
          slotMode: "center_to_center",
          slotWidthMm: 12,
          isSelectedEntity: true,
        };
      }
    }

    // Retângulo (4 vértices ou retângulo com cantos boleados / polilinha fechada)
    let rectW = w;
    let rectH = h;
    let rectAng = 0;
    let rectMode: RectCreationMode = "corners";
    if (entity.pts.length === 4) {
      const v0 = entity.pts[0]!;
      const v1 = entity.pts[1]!;
      const v2 = entity.pts[2]!;
      const edge0 = Math.hypot(v1.x - v0.x, v1.y - v0.y);
      const edge1 = Math.hypot(v2.x - v1.x, v2.y - v1.y);
      const ang0 = (((Math.atan2(-(v1.y - v0.y), v1.x - v0.x) * 180) / Math.PI) + 360) % 360;
      const isAxisAligned =
        Math.abs(ang0 % 90) < 0.5 || Math.abs((ang0 % 90) - 90) < 0.5;
      if (!isAxisAligned && edge0 > 0.1 && edge1 > 0.1) {
        rectW = Number(edge0.toFixed(2));
        rectH = Number(edge1.toFixed(2));
        rectAng = Number(ang0.toFixed(1));
        rectMode = "three_point";
      }
    }

    return {
      kind: "rect",
      tool: "rect",
      entity,
      layer,
      p0: { x: box.minX, y: box.minY },
      p1: { x: box.maxX, y: box.maxY },
      widthMm: rectW,
      heightMm: rectH,
      filletRadiusMm: 0,
      cornerRadiusMm: 0,
      radiusMm: 0,
      lengthMm: rectW,
      chordMm: rectW,
      angleDeg: rectAng,
      sweepAngleDeg: 0,
      polygonSides: 6,
      polygonMode: "inscribed",
      polygonAcrossFlatsMm: 24,
      rectMode,
      circleMode: "center_radius",
      slotMode: "center_to_center",
      slotWidthMm: 12,
      isSelectedEntity: true,
    };
  }

  return null;
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
    const r = Math.max(0, state.filletRadiusMm);
    const built = buildParametricRectangle("corners", [nextP0, nextP1], {
      layer,
      filletRadius: r,
    });
    if (built) {
      return {
        ...state,
        cornerRadiusMm: r,
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
      lengthMm: Number((r * 2).toFixed(2)),
      chordMm: Number((r * 2).toFixed(2)),
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

  if (
    kind === "line" ||
    kind === "construction_line" ||
    kind === "polyline" ||
    kind === "spline"
  ) {
    const len = Math.max(0.5, state.lengthMm);
    const rad = (state.angleDeg * Math.PI) / 180;
    const x2 = Number((state.p0.x + Math.cos(rad) * len).toFixed(4));
    const y2 = Number((state.p0.y - Math.sin(rad) * len).toFixed(4));
    return {
      ...state,
      p1: { x: x2, y: y2 },
      chordMm: len,
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
    const rad = (-state.angleDeg * Math.PI) / 180;
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
        polygonAcrossFlatsMm: Number((r * 2).toFixed(2)),
        p1: targetPt,
        entity: { ...built, id: state.entity.id || uid() },
      };
    }
  }

  if (kind === "arc" && state.entity.type === "arc") {
    const r = Math.max(0.5, state.radiusMm);
    const sweepDeg = Math.max(1, Math.min(359.5, state.sweepAngleDeg));
    const sweepRad = (sweepDeg * Math.PI) / 180;
    const a0 = state.entity.a0;
    const a1 = a0 + sweepRad;
    const chord = Number((2 * r * Math.sin(sweepRad / 2)).toFixed(2));
    return {
      ...state,
      radiusMm: r,
      sweepAngleDeg: sweepDeg,
      chordMm: Math.max(0.1, chord),
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
    const rad = (-state.angleDeg * Math.PI) / 180;
    const nextP1 = {
      x: state.p0.x + Math.cos(rad) * span,
      y: state.p0.y + Math.sin(rad) * span,
    };
    const built = buildMechanicalSlotAdvanced(state.p0, nextP1, slotW, state.slotMode, layer);
    if (built) {
      return {
        ...state,
        slotWidthMm: slotW,
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

  if (
    kind === "line" ||
    kind === "construction_line" ||
    kind === "polyline" ||
    kind === "spline" ||
    kind === "slot"
  ) {
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
    const ang = Number(((((Math.atan2(-(targetWorld.y - state.p0.y), targetWorld.x - state.p0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
    return rebuildPendingDraftShape({
      ...state,
      p1: targetWorld,
      radiusMm: r,
      angleDeg: ang,
    });
  }

  if (
    kind === "line" ||
    kind === "construction_line" ||
    kind === "polyline" ||
    kind === "spline"
  ) {
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
      chordMm: len,
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
    const ang = Number(((((Math.atan2(-(nextP1.y - nextP0.y), nextP1.x - nextP0.x) * 180) / Math.PI) + 360) % 360).toFixed(1));
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
  /** Indica se a barra fina de sub-opções (ex.: "RET: 2 Cantos | Centro | 3 Pontos") está visível no topo */
  hasSubmodeBar?: boolean;
  /** Quando true, usa posicionamento relativo dentro do Flex Column Stack superior (Seção 5.1) */
  stackedInTopContainer?: boolean;
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
  | "chord"
  | "angle"
  | "sides"
  | "sweepAngle";

export const ChamferDraftConfirmationBubble: React.FC<ChamferDraftConfirmationBubbleProps> = ({
  pendingShape,
  isDark = true,
  hasSubmodeBar,
  stackedInTopContainer = false,
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
    snapshotShape: PendingDraftShapeState;
  } | null>(null);

  if (!pendingShape) return null;

  const { kind } = pendingShape;

  // Verifica se a ferramenta possui barra de sub-opções ativa em top: 22px (altura 26px -> base 48px)
  const effectiveHasSubmodeBar =
    typeof hasSubmodeBar === "boolean"
      ? hasSubmodeBar
      : kind === "rect" ||
        kind === "circle" ||
        kind === "polygon" ||
        kind === "slot" ||
        kind === "polyline" ||
        kind === "spline" ||
        kind === "construction_line";

  // Posição fixa elevada no topo do canvas (4px abaixo da barra de sub-opções ou 4px abaixo da régua superior)
  const elevatedTopPx = effectiveHasSubmodeBar ? 52 : 26;

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
      snapshotShape: pendingShape,
    });
  };

  const applyFieldValue = (field: EditableChipField, newVal: number) => {
    let next: PendingDraftShapeState = { ...pendingShape, isLiveDraft: false };
    if (field === "width") next.widthMm = Math.max(0.5, newVal);
    if (field === "height") next.heightMm = Math.max(0.5, newVal);
    if (field === "filletRadius") {
      const r = Math.max(0, newVal);
      next.filletRadiusMm = r;
      next.cornerRadiusMm = r;
      next.kind = r > 0 ? "rrect" : "rect";
    }
    if (field === "diameter") next.radiusMm = Math.max(0.25, newVal / 2);
    if (field === "radius") next.radiusMm = Math.max(0.25, newVal);
    if (field === "length") next.lengthMm = Math.max(0.5, newVal);
    if (field === "chord") {
      const nextChord = Math.max(0.5, newVal);
      next.chordMm = nextChord;
      if (next.kind === "arc" && next.entity.type === "arc") {
        const sweepRad = Math.max(0.05, (next.sweepAngleDeg * Math.PI) / 180);
        const halfSin = Math.sin(sweepRad / 2);
        if (Math.abs(halfSin) > 1e-4) {
          next.radiusMm = Math.max(0.5, Number((nextChord / (2 * Math.abs(halfSin))).toFixed(2)));
        }
      } else {
        next.lengthMm = nextChord;
      }
    }
    if (field === "angle") next.angleDeg = ((newVal % 360) + 360) % 360;
    if (field === "sides") next.polygonSides = Math.max(3, Math.min(64, Math.round(newVal)));
    if (field === "sweepAngle") next.sweepAngleDeg = Math.max(1, Math.min(359.5, newVal));

    next = rebuildPendingDraftShape(next);
    onUpdatePendingShape(next);
  };

  // Estilos semânticos compactos (altura 24px, padding 0 8px, fonte 11px, peso 600, border-radius 9999px)
  const basePillStyle: React.CSSProperties = {
    height: 24,
    padding: "0 8px",
    borderRadius: 9999,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  };

  const cyanPillStyle: React.CSSProperties = {
    ...basePillStyle,
    backgroundColor: isDark ? "rgba(14, 116, 144, 0.25)" : "#E0F2FE",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: isDark ? "rgba(56, 189, 248, 0.35)" : "#7DD3FC",
    color: isDark ? "#E0F2FE" : "#0C4A6E",
  };

  const emeraldPillStyle: React.CSSProperties = {
    ...basePillStyle,
    backgroundColor: isDark ? "rgba(16, 185, 129, 0.20)" : "#DCFCE7",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: isDark ? "rgba(16, 185, 129, 0.35)" : "#86EFAC",
    color: isDark ? "#34D399" : "#15803D",
  };

  const amberPillStyle: React.CSSProperties = {
    ...basePillStyle,
    backgroundColor: isDark ? "rgba(180, 83, 9, 0.22)" : "#FEF3C7",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: isDark ? "rgba(251, 191, 36, 0.35)" : "#FCD34D",
    color: isDark ? "#FEF3C7" : "#92400E",
  };

  const cyanLabelColor = isDark ? "#38BDF8" : "#0284C7";
  const amberLabelColor = isDark ? "#FBBF24" : "#D97706";
  const emeraldLabelColor = isDark ? "#34D399" : "#15803D";

  return (
    <>
      <div
        data-testid="chamfer-draft-confirmation-bubble"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...(stackedInTopContainer
            ? {}
            : {
                left: "50%",
                top: elevatedTopPx,
                transform: "translateX(-50%)",
              }),
          padding: "3px 6px",
          borderRadius: 9999,
          gap: 5,
          backgroundColor: isDark ? "rgba(10, 15, 26, 0.88)" : "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: isDark ? "rgba(56, 189, 248, 0.22)" : "#CBD5E1",
          boxShadow: isDark
            ? "0 6px 20px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.08)"
            : "0 4px 16px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
        }}
        className={`pointer-events-auto ${stackedInTopContainer ? "relative" : "absolute"} z-45 flex flex-nowrap items-center font-mono select-none whitespace-nowrap max-w-[96vw] overflow-x-auto scrollbar-none`}
      >
        {/* RETÂNGULO (2 Cantos, Centro, 3 Pontos): [ L (X): ... mm ✎ ] × [ A (Y): ... mm ✎ ] [ ∠ ...° ✎ ] [ Raio R: ... mm ✎ ] */}
        {(kind === "rect" || kind === "rrect") && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("width", "Largura L (X) do Retângulo", pendingShape.widthMm, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>L (X):</span>
              <span>{pendingShape.widthMm.toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <span className="text-slate-400 font-bold text-[10px] shrink-0">×</span>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("height", "Altura A (Y) do Retângulo", pendingShape.heightMm, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>A (Y):</span>
              <span>{pendingShape.heightMm.toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            {(pendingShape.rectMode === "three_point" || Math.abs(pendingShape.angleDeg) > 0.05) && (
              <button
                type="button"
                onClick={(ev) => openFieldKeypad("angle", "Ângulo ∠ do Retângulo", pendingShape.angleDeg, "°", ev)}
                style={emeraldPillStyle}
                className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
              >
                <span>∠ {pendingShape.angleDeg.toFixed(1)}°</span>
                <span style={{ color: emeraldLabelColor, fontSize: "10px" }}>✎</span>
              </button>
            )}
            <button
              type="button"
              onClick={(ev) =>
                openFieldKeypad("filletRadius", "Raio de Canto R do Retângulo", pendingShape.filletRadiusMm, "mm", ev)
              }
              style={amberPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: amberLabelColor }}>Raio R:</span>
              <span>{pendingShape.filletRadiusMm.toFixed(0)} mm</span>
              <span style={{ color: amberLabelColor, fontSize: "10px" }}>✎</span>
            </button>
          </>
        )}

        {/* LINHA / POLILINHA / LINHA DE CONSTRUÇÃO / SPLINE: [ L = {comprimento} mm ✎ ] [ ∠ {ângulo}° ✎ ] */}
        {(kind === "line" ||
          kind === "construction_line" ||
          kind === "polyline" ||
          kind === "spline") && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("length", "Comprimento L", pendingShape.lengthMm, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>L =</span>
              <span>{pendingShape.lengthMm.toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("angle", "Ângulo Polar ∠", pendingShape.angleDeg, "°", ev)}
              style={emeraldPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span>∠ {pendingShape.angleDeg.toFixed(1)}°</span>
              <span style={{ color: emeraldLabelColor, fontSize: "10px" }}>✎</span>
            </button>
          </>
        )}

        {/* CÍRCULO: [ Ø {diâmetro} mm ✎ ] [ R {raio} mm ✎ ] */}
        {kind === "circle" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("diameter", "Diâmetro Ø do Círculo", pendingShape.radiusMm * 2, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>Ø</span>
              <span>{(pendingShape.radiusMm * 2).toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("radius", "Raio R do Círculo", pendingShape.radiusMm, "mm", ev)}
              style={amberPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: amberLabelColor }}>R</span>
              <span>{pendingShape.radiusMm.toFixed(1)} mm</span>
              <span style={{ color: amberLabelColor, fontSize: "10px" }}>✎</span>
            </button>
          </>
        )}

        {/* ARCO: [ R {raio} mm ✎ ] [ ∠ {ângulo}° ✎ ] [ Corda {corda} mm ✎ ] */}
        {kind === "arc" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("radius", "Raio R do Arco", pendingShape.radiusMm, "mm", ev)}
              style={amberPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: amberLabelColor }}>R</span>
              <span>{pendingShape.radiusMm.toFixed(1)} mm</span>
              <span style={{ color: amberLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("sweepAngle", "Ângulo ∠ do Arco", pendingShape.sweepAngleDeg, "°", ev)}
              style={emeraldPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span>∠ {pendingShape.sweepAngleDeg.toFixed(1)}°</span>
              <span style={{ color: emeraldLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("chord", "Corda do Arco", pendingShape.chordMm, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>Corda</span>
              <span>{pendingShape.chordMm.toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
          </>
        )}

        {/* POLÍGONO: [ Lados: {n} ✎ ] [ R {raio} mm ✎ ] [ ∠ {ângulo}° ✎ ] [ Insc./Circ. ] */}
        {kind === "polygon" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("sides", "Número de Lados do Polígono", pendingShape.polygonSides, "", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>Lados:</span>
              <span>{pendingShape.polygonSides}</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("radius", "Raio R do Polígono", pendingShape.radiusMm, "mm", ev)}
              style={amberPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: amberLabelColor }}>R</span>
              <span>{pendingShape.radiusMm.toFixed(1)} mm</span>
              <span style={{ color: amberLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("angle", "Ângulo ∠ do Polígono", pendingShape.angleDeg, "°", ev)}
              style={emeraldPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span>∠ {pendingShape.angleDeg.toFixed(1)}°</span>
              <span style={{ color: emeraldLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                const nextMode: PolygonCreationMode =
                  pendingShape.polygonMode === "inscribed" ? "circumscribed" : "inscribed";
                onUpdatePendingShape(rebuildPendingDraftShape({ ...pendingShape, polygonMode: nextMode }));
              }}
              style={emeraldPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
              title="Alternar Inscrito / Circunscrito"
            >
              <span>{pendingShape.polygonMode === "circumscribed" ? "Circ." : "Insc."}</span>
            </button>
          </>
        )}

        {/* OBLONGO (SLOT): [ L (X): ... mm ✎ ] [ A (Y): ... mm ✎ ] [ ∠ ...° ✎ ] */}
        {kind === "slot" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("width", "Comprimento L (X) do Slot", pendingShape.widthMm, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>L (X):</span>
              <span>{pendingShape.widthMm.toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("height", "Largura A (Y) do Slot", pendingShape.heightMm, "mm", ev)}
              style={amberPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: amberLabelColor }}>A (Y):</span>
              <span>{pendingShape.heightMm.toFixed(1)} mm</span>
              <span style={{ color: amberLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("angle", "Ângulo ∠ do Slot", pendingShape.angleDeg, "°", ev)}
              style={emeraldPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span>∠ {pendingShape.angleDeg.toFixed(1)}°</span>
              <span style={{ color: emeraldLabelColor, fontSize: "10px" }}>✎</span>
            </button>
          </>
        )}

        {/* ELIPSE: [ L (X): ... mm ✎ ] [ A (Y): ... mm ✎ ] */}
        {kind === "ellipse" && (
          <>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("width", "Eixo L (X) da Elipse", pendingShape.widthMm, "mm", ev)}
              style={cyanPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: cyanLabelColor }}>L (X):</span>
              <span>{pendingShape.widthMm.toFixed(1)} mm</span>
              <span style={{ color: cyanLabelColor, fontSize: "10px" }}>✎</span>
            </button>
            <button
              type="button"
              onClick={(ev) => openFieldKeypad("height", "Eixo A (Y) da Elipse", pendingShape.heightMm, "mm", ev)}
              style={amberPillStyle}
              className="flex items-center gap-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              <span style={{ color: amberLabelColor }}>A (Y):</span>
              <span>{pendingShape.heightMm.toFixed(1)} mm</span>
              <span style={{ color: amberLabelColor, fontSize: "10px" }}>✎</span>
            </button>
          </>
        )}

        {/* BOTÃO DE AÇÃO RÁPIDA: [ ✓ Confirmar ] — exibido apenas na criação de nova entidade, omitido quando inspecionando peça já criada */}
        {!pendingShape.isSelectedEntity && (
          <>
            <button
              type="button"
              data-testid="chamfer-draft-confirm-btn"
              onClick={() => {
                triggerHaptic("action");
                onConfirmPendingShape();
              }}
              style={{
                height: 24,
                padding: "0 10px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: 9999,
                backgroundColor: "#10B981",
                color: "#FFFFFF",
              }}
              className="flex items-center gap-1 shadow-xs transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
              title="Confirmar forma e gravar no desenho (Enter)"
            >
              <Check className="size-3 stroke-[2.8]" />
              <span>Confirmar</span>
            </button>

            <button
              type="button"
              data-testid="chamfer-draft-cancel-btn"
              onClick={() => {
                triggerHaptic("tap");
                onCancelPendingShape();
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 9999,
                fontSize: "11px",
                backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#F1F5F9",
                color: isDark ? "#CBD5E1" : "#64748B",
              }}
              className="flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-colors cursor-pointer shrink-0"
              title="Descartar rascunho pendente (Esc)"
            >
              <X className="size-3" />
            </button>
          </>
        )}
      </div>

      {/* Teclado Numérico CAD Integrado ao clicar em qualquer chip de dimensão da barra */}
      {activeField && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => {
            onUpdatePendingShape(activeField.snapshotShape);
            setActiveField(null);
          }}
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

