/**
 * Camada de DESENHO do CHAMFER em canvas 2D.
 *
 * O modelo de geometria e as ferramentas continuam idênticos: aqui só muda
 * como os pixels aparecem. Aplica culling pelo índice espacial, LOD durante
 * gestos e mantém rigorosamente as cores técnicas fixas do CALDRA.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Box, Entity } from "./core";
import { samplePath } from "./bezier";
import { SELECTION_COLOR, bendEdgeMarks, techStyle } from "./technical";
import { viewportBox, type SpatialIndex } from "./spatialIndex";

export type SceneView = { tx: number; ty: number; k: number };

export type SceneOptions = {
  index: SpatialIndex;
  view: SceneView;
  width: number;
  height: number;
  dpr: number;
  selection: Set<string>;
  /** Durante pan/zoom: versão simplificada (sem tracejado, sem detalhes < 1px). */
  lod: boolean;
};

/** Ordena por camada técnica sem alocar novos objetos de entidade. */
function paintOrder(list: Entity[]) {
  return list.slice().sort((a, b) => techStyle(a.layer).order - techStyle(b.layer).order);
}

function tracePolyline(ctx: CanvasRenderingContext2D, pts: Vec2[], closed: boolean, step: number) {
  if (!pts.length) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = step; i < pts.length; i += step) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last.x, last.y);
  if (closed) ctx.closePath();
}

function traceEntity(ctx: CanvasRenderingContext2D, e: Entity, lod: boolean) {
  switch (e.type) {
    case "line":
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      break;
    case "polyline":
      tracePolyline(ctx, e.pts, !!e.closed, lod && e.pts.length > 64 ? 3 : 1);
      break;
    case "circle":
      ctx.moveTo(e.cx + e.r, e.cy);
      ctx.arc(e.cx, e.cy, e.r, 0, Math.PI * 2);
      break;
    case "arc": {
      let sweep = e.a1 - e.a0;
      while (sweep < 0) sweep += Math.PI * 2;
      ctx.moveTo(e.cx + e.r * Math.cos(e.a0), e.cy + e.r * Math.sin(e.a0));
      ctx.arc(e.cx, e.cy, e.r, e.a0, e.a0 + sweep);
      break;
    }
    case "path": {
      ctx.moveTo(e.start.x, e.start.y);
      for (const s of e.segs)
        if (s.line) ctx.lineTo(s.p.x, s.p.y);
        else ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p.x, s.p.y);
      if (e.closed) ctx.closePath();
      break;
    }
    case "text":
      break;
  }
}

const screenSize = (b: Box | undefined, k: number) =>
  b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) * k : Infinity;

/** Redesenha a cena inteira. Chamado apenas quando algo sujou (rAF). */
export function drawScene(ctx: CanvasRenderingContext2D, opts: SceneOptions) {
  const { view, width, height, dpr, index, selection, lod } = opts;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const box = viewportBox(view, width, height);
  const list = paintOrder(index.query(box));
  const inv = 1 / view.k;

  // agrupa por estilo para minimizar trocas de estado do contexto
  let currentLayer = "";
  for (const e of list) {
    if (e.type === "text") continue;
    if (lod && screenSize(index.boxOfId(e.id), view.k) < 1.2) continue;

    const style = techStyle(e.layer);
    if (e.layer !== currentLayer) {
      currentLayer = e.layer;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 1.4 * style.weight * inv;
      const dash = !lod && style.dash(inv);
      ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);
    }
    // DOBRA: duas marcas curtas nas extremidades. A entidade inteira permanece
    // no modelo para hit-test, seleção, grupos e exportação.
    if (e.layer === "dobra" && e.type === "line") {
      const marks = bendEdgeMarks(e, 12 * inv);
      ctx.setLineDash([]);
      for (const mark of marks) {
        ctx.beginPath();
        ctx.moveTo(mark.x1, mark.y1);
        ctx.lineTo(mark.x2, mark.y2);
        ctx.stroke();
      }
      currentLayer = ""; // força re-aplicação do traço da camada
      continue;
    }
    ctx.beginPath();
    traceEntity(ctx, e, lod);
    ctx.stroke();
  }

  // halo de seleção — destaque temporário, nunca substitui a cor técnica
  if (selection.size) {
    ctx.setLineDash([]);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 5 * inv;
    for (const e of list) {
      if (!selection.has(e.id) || e.type === "text") continue;
      ctx.beginPath();
      traceEntity(ctx, e, lod);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // textos por último (custo alto por item, quantidade sempre baixa)
  ctx.setLineDash([]);
  for (const e of list) {
    if (e.type !== "text") continue;
    ctx.fillStyle = techStyle(e.layer).color;
    ctx.font = `${e.size}px ui-monospace, monospace`;
    ctx.fillText(e.text, e.x, e.y);
  }
}

/** Prévia de criação (draft) desenhada acima da cena, sem sujar o modelo. */
export function drawDraft(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  view: SceneView,
  color: string,
) {
  const inv = 1 / view.k;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 * inv;
  ctx.setLineDash([5 * inv, 4 * inv]);
  ctx.beginPath();
  if (e.type === "path") {
    const pts = samplePath(e.start, e.segs, e.closed, 12);
    tracePolyline(ctx, pts, !!e.closed, 1);
  } else traceEntity(ctx, e, false);
  ctx.stroke();
  ctx.setLineDash([]);
}
