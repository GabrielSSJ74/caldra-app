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
import { SELECTION_COLOR, techStyle } from "./technical";
import { viewportBox, type SpatialIndex } from "./spatialIndex";
import { getIsoExtrusionVector, ISO_TECH_SHADING, type IsoPlane } from "./isometricEngine";

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
  /** Tema claro ativo para contraste da seleção */
  isLight?: boolean;
  /** Movimento destravado via Long-Press (destaque ciano/laranja brilhante de arraste ativo) */
  isDraggingUnlocked?: boolean;
  /** Modo Isométrico (ISO 2D) ativo para renderização Isometric Wireframe Solid (X-Ray) */
  isIsometric?: boolean;
  /** Plano isométrico ativo para extrusão da espessura real da chapa */
  isoPlane?: IsoPlane;
  /** Espessura real da chapa configurada no projeto (mm) */
  sheetThickness?: number;
};

/** Ordena por camada técnica ou por profundidade Z (Painter's Algorithm para oclusão 2.5D/3D). */
function paintOrder(list: Entity[]) {
  return list.slice().sort((a, b) => {
    const aDepth = typeof a.params?.depth === "number" ? (a.params.depth as number) : null;
    const bDepth = typeof b.params?.depth === "number" ? (b.params.depth as number) : null;
    if (aDepth !== null && bDepth !== null) {
      return aDepth - bDepth; // Menor profundidade (fundo) desenhado antes, maior (frente) desenhado por cima!
    }
    if (a.params?.isIsoSolidFace && !b.params?.isIsoSolidFace) return -1;
    if (!a.params?.isIsoSolidFace && b.params?.isIsoSolidFace) return 1;
    return techStyle(a.layer).order - techStyle(b.layer).order;
  });
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
    case "ellipse": {
      ctx.ellipse(e.cx, e.cy, e.rx, e.ry, e.rotation ?? 0, 0, Math.PI * 2);
      break;
    }
    case "point": {
      ctx.moveTo(e.x + 2, e.y);
      ctx.arc(e.x, e.y, 2, 0, Math.PI * 2);
      break;
    }
    case "hatch": {
      tracePolyline(ctx, e.boundaryPts, true, 1);
      break;
    }
    case "text":
      break;
  }
}

/** Coleta vértices geométricos de uma entidade para renderizar micro-pontos de interseção (r = 1.6px) */
function collectEntityVertices(e: Entity): Vec2[] {
  switch (e.type) {
    case "line":
      return [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 },
      ];
    case "polyline":
      return e.pts.length <= 48 ? e.pts : [];
    case "arc":
      return [
        { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) },
        { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) },
      ];
    case "ellipse": {
      const rot = e.rotation ?? 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      return [
        { x: e.cx + e.rx * cosR, y: e.cy + e.rx * sinR },
        { x: e.cx - e.rx * cosR, y: e.cy - e.rx * sinR },
        { x: e.cx - e.ry * sinR, y: e.cy + e.ry * cosR },
        { x: e.cx + e.ry * sinR, y: e.cy - e.ry * cosR },
      ];
    }
    case "circle":
      return [
        { x: e.cx + e.r, y: e.cy },
        { x: e.cx - e.r, y: e.cy },
        { x: e.cx, y: e.cy + e.r },
        { x: e.cx, y: e.cy - e.r },
      ];
    default:
      return [];
  }
}

function drawVertexMicroDots(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  inv: number,
  isLight?: boolean,
) {
  if (!pts.length) return;
  const r = 1.6 * inv;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = isLight ? "#0284C7" : ISO_TECH_SHADING.vertexDotFill;
  ctx.beginPath();
  for (const pt of pts) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    ctx.moveTo(pt.x + r, pt.y);
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

const screenSize = (b: Box | undefined, k: number) =>
  b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) * k : Infinity;

/** Redesenha a cena inteira. Chamado apenas quando algo sujou (rAF). */
export function drawScene(ctx: CanvasRenderingContext2D, opts: SceneOptions) {
  const { view, width, height, dpr, index, selection, lod } = opts;

  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
  const safeTx = Number.isFinite(view.tx) ? view.tx : 0;
  const safeTy = Number.isFinite(view.ty) ? view.ty : 0;
  const safeW = Number.isFinite(width) && width > 0 ? width : 800;
  const safeH = Number.isFinite(height) && height > 0 ? height : 600;
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

  ctx.setTransform(safeDpr, 0, 0, safeDpr, 0, 0);
  ctx.clearRect(0, 0, safeW, safeH);
  ctx.setTransform(safeDpr * safeK, 0, 0, safeDpr * safeK, safeDpr * safeTx, safeDpr * safeTy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const box = viewportBox({ k: safeK, tx: safeTx, ty: safeTy }, safeW, safeH);
  const list = paintOrder(index.query(box));
  const inv = 1 / safeK;
  const isoSheetThickness =
    typeof opts.sheetThickness === "number" && opts.sheetThickness > 0 ? opts.sheetThickness : 5;

  // agrupa por estilo para minimizar trocas de estado do contexto
  let currentLayer = "";
  for (const e of list) {
    if (e.type === "text") continue;
    if (lod && screenSize(index.boxOfId(e.id), view.k) < 1.2) continue;

    // 1. RENDERIZAÇÃO VOLUMÉTRICA ISOMÉTRICA (ISOMETRIC WIREFRAME SOLID / X-RAY)
    if (e.params?.isIsoSolidFace) {
      currentLayer = ""; // reset layer tracking
      let fillCol = (e.params.fillColor as string) || ISO_TECH_SHADING.topFace;
      let strokeCol = (e.params.strokeColor as string) || ISO_TECH_SHADING.edgeStroke;
      if (opts.isLight) {
        if (strokeCol === "#E8F4FF" || strokeCol === "#FFFFFF" || strokeCol === "#F8FAFC") {
          strokeCol = "#0F172A";
        } else if (strokeCol.includes("186, 230, 253")) {
          strokeCol = "rgba(15, 23, 42, 0.58)";
        } else if (strokeCol.includes("125, 211, 252")) {
          strokeCol = "rgba(2, 132, 199, 0.38)";
        }
        if (fillCol.includes("15, 34, 62") || fillCol.includes("18, 40, 74") || fillCol.includes("24, 52, 92")) {
          fillCol = "rgba(14, 165, 233, 0.08)";
        } else if (fillCol.includes("5, 9, 20")) {
          fillCol = "rgba(241, 245, 249, 0.65)";
        }
      }
      const strokeW = (typeof e.params.strokeWidth === "number" ? e.params.strokeWidth : 1.4) * inv;
      const noStroke = !!e.params.noStroke;
      const customDash = Array.isArray(e.params.dash) ? (e.params.dash as number[]) : null;

      ctx.save();
      if (!lod && customDash && customDash.length > 0) {
        ctx.setLineDash(customDash.map((d) => d * inv));
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      traceEntity(ctx, e, lod);

      if (fillCol && fillCol !== "none" && fillCol !== "transparent") {
        ctx.fillStyle = fillCol;
        ctx.fill();
      }

      if (!noStroke && strokeCol && strokeCol !== "none" && strokeCol !== "transparent") {
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = strokeW;
        ctx.stroke();
      }
      ctx.restore();

      if (!lod && e.params.vertexDots) {
        drawVertexMicroDots(ctx, collectEntityVertices(e), inv, opts.isLight);
      }
      continue;
    }

    // 2. PASSAGEM VOLUMÉTRICA EM TEMPO REAL (ISO 2D WIREFRAME SOLID) PARA ENTIDADES PLANAS
    if (
      opts.isIsometric &&
      !e.isConstruction &&
      e.layer !== "centro" &&
      e.layer !== "referencia" &&
      e.layer !== "dobra" &&
      e.type !== "point"
    ) {
      currentLayer = "";
      const entPlane = ((e.params?.isoPlane as IsoPlane) || opts.isoPlane || "top") as IsoPlane;
      const ext = getIsoExtrusionVector(entPlane, isoSheetThickness);
      const isHole = e.layer === "furo" || e.type === "ellipse" || e.type === "circle";

      const backStroke = opts.isLight ? "rgba(2, 132, 199, 0.35)" : ISO_TECH_SHADING.backEdgeStroke;
      const wallStroke = opts.isLight ? "rgba(15, 23, 42, 0.55)" : ISO_TECH_SHADING.internalEdgeStroke;
      const frontStroke = opts.isLight ? "#0F172A" : ISO_TECH_SHADING.edgeStroke;
      const faceFill = opts.isLight
        ? isHole
          ? "rgba(241, 245, 249, 0.55)"
          : "rgba(14, 165, 233, 0.08)"
        : isHole
          ? ISO_TECH_SHADING.holeBottomVoid
          : entPlane === "left"
            ? ISO_TECH_SHADING.leftFace
            : entPlane === "right"
              ? ISO_TECH_SHADING.rightFace
              : ISO_TECH_SHADING.topFace;
      const wallFill = opts.isLight ? "rgba(14, 165, 233, 0.10)" : ISO_TECH_SHADING.wallFace;

      ctx.save();
      // 2a. Contorno traseiro em X-Ray (deslocado por ext)
      ctx.save();
      ctx.translate(ext.x, ext.y);
      ctx.beginPath();
      traceEntity(ctx, e, lod);
      ctx.setLineDash(!lod ? [3 * inv, 2.5 * inv] : []);
      ctx.strokeStyle = backStroke;
      ctx.lineWidth = 0.75 * inv;
      ctx.stroke();
      ctx.restore();

      // 2b. Paredes laterais de espessura (V_i -> V'_i) e geratrizes tangentes
      if (!lod) {
        ctx.setLineDash([]);
        ctx.strokeStyle = wallStroke;
        ctx.lineWidth = 0.95 * inv;
        if (e.type === "polyline" && e.pts.length >= 2) {
          const n = e.pts.length;
          const limit = e.closed ? n : n - 1;
          for (let i = 0; i < limit; i++) {
            const p0 = e.pts[i]!;
            const p1 = e.pts[(i + 1) % n]!;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p1.x + ext.x, p1.y + ext.y);
            ctx.lineTo(p0.x + ext.x, p0.y + ext.y);
            ctx.closePath();
            ctx.fillStyle = wallFill;
            ctx.fill();
            ctx.stroke();
          }
        } else if (e.type === "line") {
          ctx.beginPath();
          ctx.moveTo(e.x1, e.y1);
          ctx.lineTo(e.x2, e.y2);
          ctx.lineTo(e.x2 + ext.x, e.y2 + ext.y);
          ctx.lineTo(e.x1 + ext.x, e.y1 + ext.y);
          ctx.closePath();
          ctx.fillStyle = wallFill;
          ctx.fill();
          ctx.stroke();
        } else if (e.type === "ellipse") {
          const rot = e.rotation ?? 0;
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const t1 = { x: e.cx + e.rx * cosR, y: e.cy + e.rx * sinR };
          const t2 = { x: e.cx - e.rx * cosR, y: e.cy - e.rx * sinR };
          ctx.beginPath();
          ctx.moveTo(t1.x, t1.y);
          ctx.lineTo(t1.x + ext.x, t1.y + ext.y);
          ctx.moveTo(t2.x, t2.y);
          ctx.lineTo(t2.x + ext.x, t2.y + ext.y);
          ctx.stroke();
        } else if (e.type === "circle") {
          const extLen = Math.hypot(ext.x, ext.y);
          const nx = extLen > 1e-6 ? -ext.y / extLen : 1;
          const ny = extLen > 1e-6 ? ext.x / extLen : 0;
          ctx.beginPath();
          ctx.moveTo(e.cx + nx * e.r, e.cy + ny * e.r);
          ctx.lineTo(e.cx + nx * e.r + ext.x, e.cy + ny * e.r + ext.y);
          ctx.moveTo(e.cx - nx * e.r, e.cy - ny * e.r);
          ctx.lineTo(e.cx - nx * e.r + ext.x, e.cy - ny * e.r + ext.y);
          ctx.stroke();
        }
      }

      // 2c. Face frontal translúcida + Aresta principal nítida (1.4px)
      ctx.setLineDash([]);
      ctx.beginPath();
      traceEntity(ctx, e, lod);
      if (
        (e.type === "polyline" && e.closed) ||
        e.type === "circle" ||
        e.type === "ellipse" ||
        (e.type === "path" && e.closed)
      ) {
        ctx.fillStyle = faceFill;
        ctx.fill();
      }
      ctx.strokeStyle = frontStroke;
      ctx.lineWidth = 1.4 * inv;
      ctx.stroke();
      ctx.restore();

      if (!lod) {
        drawVertexMicroDots(ctx, collectEntityVertices(e), inv, opts.isLight);
      }
      continue;
    }

    const style = techStyle(e.layer);
    if (e.layer !== currentLayer) {
      currentLayer = e.layer;
      const isCutOrWhite = style.color === "#FFFFFF" || e.layer === "corte";
      ctx.strokeStyle = opts.isLight && isCutOrWhite ? "#0F172A" : style.color;
      ctx.lineWidth = 1.4 * style.weight * inv;
      const dash = !lod && style.dash(inv);
      ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);
    }
    ctx.beginPath();
    traceEntity(ctx, e, lod);
    ctx.stroke();
  }

  // halo de seleção — destaque temporário, nunca substitui a cor técnica
  if (selection.size) {
    if (opts.isDraggingUnlocked) {
      // Destaque visual ao destravar movimento: contorno laranja brilhante com dash técnico
      ctx.setLineDash([8 * inv, 4 * inv]);
      ctx.strokeStyle = "#FF8800";
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 6 * inv;
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = opts.isLight ? "#DC2626" : SELECTION_COLOR;
      ctx.globalAlpha = opts.isLight ? 0.75 : 0.65;
      ctx.lineWidth = 4.5 * inv;
    }
    for (const e of list) {
      if (!selection.has(e.id) || e.type === "text") continue;
      ctx.beginPath();
      traceEntity(ctx, e, lod);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // textos por último (custo alto por item, quantidade sempre baixa)
  ctx.setLineDash([]);
  for (const e of list) {
    if (e.type !== "text") continue;
    ctx.fillStyle = techStyle(e.layer).color;
    ctx.font = `${e.italic ? "italic " : ""}${e.bold ? "700 " : "400 "}${e.size}px var(--font-display-family), ui-sans-serif, system-ui`;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.rotation) ctx.rotate((e.rotation * Math.PI) / 180);
    const natural = Math.max(ctx.measureText(e.text).width, 0.01);
    if (e.width && e.width > 0) ctx.scale(e.width / natural, 1);
    ctx.fillText(e.text, 0, 0);
    ctx.restore();
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
