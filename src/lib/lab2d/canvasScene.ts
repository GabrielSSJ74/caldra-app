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
import { ISO_TECH_SHADING, type IsoPlane } from "./isometricEngine";
import type { WorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  buildClassifiedWireframeScene3D,
  renderClassifiedWireframeSceneToCanvas,
  resolveBaseToTopExtrusionVector,
  type ChamferWireframe3DStyleConfig,
} from "./chamferWireframe3D";
import {
  computeStructuralProfile2DInnerWallLines,
  getEntityStructuralProfile,
} from "./structuralProfile";

export type SceneView = { tx: number; ty: number; k: number };

/**
 * Interpola linearmente (lerp) duas cores hexadecimais (#RRGGBB) para a transição
 * suave de 2000ms do fundo do canvas 2D entre o Tema Claro (#FAFBFD) e o Tema Escuro (#0D1526).
 */
export function lerpHexColor(fromHex: string, toHex: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
  const parseHex = (hex: string): [number, number, number] => {
    const clean = hex.replace(/^#/, "").trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0]! + clean[0]!, 16) || 0,
        parseInt(clean[1]! + clean[1]!, 16) || 0,
        parseInt(clean[2]! + clean[2]!, 16) || 0,
      ];
    }
    const n = parseInt(clean.slice(0, 6), 16);
    if (!Number.isFinite(n)) return [13, 21, 38];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parseHex(fromHex);
  const [r2, g2, b2] = parseHex(toHex);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

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
  /** Cor interpolada do fundo do canvas (transição suave de 2000ms: #FAFBFD <-> #0D1526) */
  canvasBgColor?: string;
  /** Fator de interpolação do tema (0 = Claro #FAFBFD, 1 = Escuro #0D1526) ao longo de 2000ms */
  themeLerpT?: number;
  /** Movimento destravado via Long-Press (destaque ciano/laranja brilhante de arraste ativo) */
  isDraggingUnlocked?: boolean;
  /** Modo Isométrico (ISO 2D) ativo para renderização Isometric Wireframe Solid (X-Ray) */
  isIsometric?: boolean;
  /** Plano isométrico ativo para extrusão da espessura real da chapa */
  isoPlane?: IsoPlane;
  /** Espessura real da chapa configurada no projeto (mm) */
  sheetThickness?: number;
  /** Projeção orbital 3D ativa no modo 2D SKETCH */
  orbitProjection?: WorkplaneOrbitProjection2D;
  /** Configuração do estilo de hierarquia de arestas e profundidade óptica 3D */
  wireframe3DStyle?: Partial<ChamferWireframe3DStyleConfig>;
  /** Exibe a grade orbital no plano base Z = 0 abaixo da peça 3D */
  showGrid?: boolean;
  /** Passo principal da grade (mm) */
  gridStep?: number;
  /** Estilo de fundo ativo no CHAMFER CAD ("padrao" | "suave" | "fluido") */
  bgStyle?: "padrao" | "suave" | "fluido";
};

/**
 * Curva Senoidal de 10 Paradas (Ease-Out Scrim) para gradientes radiais em Canvas 2D High-DPI.
 * Garante acabamento de seda líquida contínua (12-bit look) sem anéis de interpolação linear.
 */
const SINUSOIDAL_10_STOPS: readonly [number, number][] = [
  [0.0, 1.0],
  [0.15, 0.92],
  [0.3, 0.78],
  [0.45, 0.58],
  [0.6, 0.38],
  [0.75, 0.2],
  [0.88, 0.07],
  [0.95, 0.02],
  [1.0, 0.0],
];

function drawSinusoidalRadialField(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rgb: string,
  baseAlpha: number,
  scaleX = 1.0,
  scaleY = 1.0,
  rotationRad = 0,
) {
  if (radius <= 1 || baseAlpha <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (rotationRad !== 0) ctx.rotate(rotationRad);
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);

  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  for (const [stop, factor] of SINUSOIDAL_10_STOPS) {
    const alpha = Math.max(0, Math.min(1, baseAlpha * factor));
    grad.addColorStop(stop, `rgba(${rgb}, ${alpha.toFixed(5)})`);
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Renderiza o acabamento de Seda Líquida ("Fluid" / "fluido") ou Ultra-Silk Multi-Layer ("Fluid Aurora" / "suave")
 * diretamente no contexto Canvas 2D High-DPI com coordenadas em ponto flutuante escaladas por devicePixelRatio.
 */
function renderCanvasSilkBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  isLight: boolean,
  bgStyle?: "padrao" | "suave" | "fluido",
) {
  if (bgStyle !== "fluido" && bgStyle !== "suave") return;
  const maxDim = Math.max(width, height, 320);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (bgStyle === "fluido") {
    // Estilo "Fluid" (Liquid Silk Mesh): 3 campos amplos com decaimento senoidal de 10 paradas
    const rField = maxDim * 0.95;
    if (!isLight) {
      // Tema Escuro: Azul-Titânio (#1E3A5F), Índigo Profundo (#1E2648), Ciano-Ardósia Sutil (#163E52)
      drawSinusoidalRadialField(ctx, width * 0.18, height * 0.22, rField, "30, 58, 95", 0.34, 1.15, 0.95, -0.18);
      drawSinusoidalRadialField(ctx, width * 0.82, height * 0.36, rField, "30, 38, 72", 0.32, 1.1, 0.92, 0.22);
      drawSinusoidalRadialField(ctx, width * 0.46, height * 0.84, rField, "22, 62, 82", 0.30, 1.18, 0.9, -0.12);
    } else {
      // Tema Claro: Azul-Gelo (#DCE8F9), Lavanda Técnico Suave (#E8E6FA), Branco-Seda (#FFFFFF)
      drawSinusoidalRadialField(ctx, width * 0.18, height * 0.22, rField, "220, 232, 249", 0.55, 1.15, 0.95, -0.18);
      drawSinusoidalRadialField(ctx, width * 0.82, height * 0.36, rField, "232, 230, 250", 0.50, 1.1, 0.92, 0.22);
      drawSinusoidalRadialField(ctx, width * 0.46, height * 0.84, rField, "255, 255, 255", 0.62, 1.18, 0.9, -0.12);
    }
  } else if (bgStyle === "suave") {
    // Estilo "Fluid Aurora" (Ultra-Silk Multi-Layer): 4 véus elípticos inclinados sobrepostos
    const rVeil = maxDim * 0.78;
    if (!isLight) {
      // Tema Escuro: Âmbar-Dourado (0.16), Coral/Carmesim (0.13), Ciano-Boreal (0.16), Violeta/Esmeralda (0.12)
      drawSinusoidalRadialField(ctx, width * 0.18, height * 0.18, rVeil, "245, 158, 11", 0.16, 1.32, 0.82, -0.24);
      drawSinusoidalRadialField(ctx, width * 0.52, height * 0.16, rVeil, "225, 29, 72", 0.13, 1.28, 0.8, 0.21);
      drawSinusoidalRadialField(ctx, width * 0.84, height * 0.48, rVeil, "14, 165, 233", 0.16, 1.35, 0.84, -0.31);
      drawSinusoidalRadialField(ctx, width * 0.44, height * 0.86, rVeil, "99, 102, 241", 0.12, 1.38, 0.82, 0.26);
    } else {
      // Tema Claro: Pêssego-Âmbar (0.18), Rosa-Quartzo (0.14), Azul-Celeste (0.18), Lilás Suave (0.14)
      drawSinusoidalRadialField(ctx, width * 0.18, height * 0.18, rVeil, "251, 191, 36", 0.18, 1.32, 0.82, -0.24);
      drawSinusoidalRadialField(ctx, width * 0.52, height * 0.16, rVeil, "244, 114, 182", 0.14, 1.28, 0.8, 0.21);
      drawSinusoidalRadialField(ctx, width * 0.84, height * 0.48, rVeil, "56, 189, 248", 0.18, 1.35, 0.84, -0.31);
      drawSinusoidalRadialField(ctx, width * 0.44, height * 0.86, rVeil, "167, 139, 250", 0.14, 1.38, 0.82, 0.26);
    }
  }

  ctx.restore();
}

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
  const r = 1.75 * inv;
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, safeW, safeH);

  // Renderiza os gradientes de fundo de 10 paradas senoidais quando Fluid ou Fluid Aurora estão ativos
  if (opts.bgStyle === "fluido" || opts.bgStyle === "suave") {
    renderCanvasSilkBackground(ctx, safeW, safeH, !!opts.isLight, opts.bgStyle);
  }

  ctx.setTransform(safeDpr * safeK, 0, 0, safeDpr * safeK, safeDpr * safeTx, safeDpr * safeTy);
  const orbitProj = opts.orbitProjection;
  const isOrbitTilted = !!orbitProj?.isTilted;
  if (isOrbitTilted && orbitProj) {
    ctx.transform(orbitProj.a, orbitProj.b, orbitProj.c, orbitProj.d, orbitProj.e, orbitProj.f);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const rawBox = viewportBox({ k: safeK, tx: safeTx, ty: safeTy }, safeW, safeH);
  // Quando o plano 2D está inclinado em 3D, expande o box de consulta para evitar corte nas bordas rotacionadas
  const box = isOrbitTilted
    ? {
        minX: rawBox.minX - (rawBox.maxX - rawBox.minX) * 2.5 - 2000,
        maxX: rawBox.maxX + (rawBox.maxX - rawBox.minX) * 2.5 + 2000,
        minY: rawBox.minY - (rawBox.maxY - rawBox.minY) * 2.5 - 2000,
        maxY: rawBox.maxY + (rawBox.maxY - rawBox.minY) * 2.5 + 2000,
      }
    : rawBox;
  const list = paintOrder(index.query(box));
  const inv = 1 / safeK;
  const isoSheetThickness =
    typeof opts.sheetThickness === "number" && opts.sheetThickness > 0 ? opts.sheetThickness : 5;
  const is3DWireframeActive =
    (opts.isIsometric || isOrbitTilted) &&
    opts.wireframe3DStyle?.hierarchyEnabled !== false;

  // Coleta entidades planas elegíveis para o motor de Hierarquia de Arestas e Profundidade Óptica 3D
  const planarFor3D: Entity[] = [];

  // Camada 4 — Peças e Entidades do CAD (100% de Nitidez e Contraste Máximo)
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = "source-over";

  // agrupa por estilo para minimizar trocas de estado do contexto
  let currentLayer = "";
  for (const e of list) {
    if (e.type === "text") continue;
    if (lod && screenSize(index.boxOfId(e.id), view.k) < 1.2) continue;

    // 1. RENDERIZAÇÃO VOLUMÉTRICA ISOMÉTRICA EXPLÍCITA (ISOMETRIC SOLID FACES / HLR)
    if (e.params?.isIsoSolidFace) {
      currentLayer = ""; // reset layer tracking
      let fillCol = (e.params.fillColor as string) || ISO_TECH_SHADING.topFace;
      let strokeCol = (e.params.strokeColor as string) || ISO_TECH_SHADING.edgeStroke;
      if (opts.isLight) {
        if (
          strokeCol === "#E8F4FF" ||
          strokeCol === "#FFFFFF" ||
          strokeCol === "#F8FAFC" ||
          strokeCol === "#F1F5F9"
        ) {
          strokeCol = "#0F172A";
        } else if (strokeCol.includes("186, 230, 253") || strokeCol.includes("145, 163, 184")) {
          strokeCol = "rgba(15, 23, 42, 0.58)";
        } else if (strokeCol.includes("125, 211, 252") || strokeCol.includes("83, 100, 123")) {
          strokeCol = "rgba(2, 132, 199, 0.38)";
        }
        if (
          fillCol.includes("15, 34, 62") ||
          fillCol.includes("18, 40, 74") ||
          fillCol.includes("18, 33, 56") ||
          fillCol.includes("14, 26, 45")
        ) {
          fillCol = "rgba(14, 165, 233, 0.08)";
        } else if (fillCol.includes("5, 9, 20")) {
          fillCol = "rgba(241, 245, 249, 0.65)";
        }
      }
      const strokeW = (typeof e.params.strokeWidth === "number" ? e.params.strokeWidth : 2.0) * inv;
      const noStroke = !!e.params.noStroke;
      const customDash = Array.isArray(e.params.dash) ? (e.params.dash as number[]) : null;

      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = "source-over";
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

      if (!lod && e.params.vertexDots && opts.wireframe3DStyle?.showVertexDots !== false) {
        drawVertexMicroDots(ctx, collectEntityVertices(e), inv, opts.isLight);
      }
      continue;
    }

    // 2. COLETA ENTIDADES PLANAS PARA O MOTOR 3D WIREFRAME TÉCNICO COM PROFUNDIDADE ÓPTICA
    if (is3DWireframeActive && e.type !== "point") {
      planarFor3D.push(e);
      continue;
    }

    const style = techStyle(e.layer);
    const customStrokeColor =
      typeof e.params?.strokeColor === "string" && e.params.strokeColor.trim().length > 0
        ? e.params.strokeColor.trim()
        : null;
    const styleKey = `${e.layer}::${customStrokeColor ?? ""}`;
    if (styleKey !== currentLayer) {
      currentLayer = styleKey;
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = "source-over";
      const isCutOrWhite = style.color === "#FFFFFF" || e.layer === "corte";
      const lightLayerStroke =
        e.layer === "construcao" || e.layer === "referencia"
          ? "#475569"
          : e.layer === "recorte"
            ? "#B45309"
            : e.layer === "cota" || e.layer === "anotacoes"
              ? "#0284C7"
              : e.layer === "dobra"
                ? "#BE185D"
                : e.layer === "marcacao"
                  ? "#1D4ED8"
                  : e.layer === "auxiliar"
                    ? "#7E22CE"
                    : style.color;
      ctx.strokeStyle =
        customStrokeColor ??
        (isCutOrWhite
          ? typeof opts.themeLerpT === "number"
            ? lerpHexColor("#0F141A", "#ECEFF4", opts.themeLerpT)
            : opts.isLight
              ? "#0F141A"
              : "#ECEFF4"
          : opts.isLight
            ? lightLayerStroke
            : style.color);
      ctx.lineWidth = (isCutOrWhite ? Math.max(2.1, 1.65 * style.weight) : Math.max(1.6, 1.45 * style.weight)) * inv;
      const dash = !lod && style.dash(inv);
      ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);
    }
    ctx.beginPath();
    traceEntity(ctx, e, lod);
    ctx.stroke();

    // Se a entidade for um Perfil Estrutural / Metalão Oco no modo 2D SKETCH,
    // desenha as duas linhas tracejadas paralelas internas com offset = espessura da parede (e)
    if (!lod) {
      const structOverlay = computeStructuralProfile2DInnerWallLines(e);
      if (structOverlay && structOverlay.lines.length > 0) {
        ctx.save();
        ctx.setLineDash([5 * inv, 3.5 * inv]);
        ctx.lineWidth = Math.max(1.1, 1.15 * style.weight) * inv;
        ctx.strokeStyle = opts.isLight ? "rgba(8, 145, 178, 0.78)" : "rgba(56, 189, 248, 0.72)";
        ctx.beginPath();
        for (const seg of structOverlay.lines) {
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
        }
        ctx.stroke();
        ctx.restore();
        // Força reconfiguração de estilo na próxima entidade caso necessário
        currentLayer = "";
      }
    }
  }
  ctx.restore();

  // Renderiza em lote ordenado (Painter's Algorithm + 5 Categorias + Recorte Even-Odd dos Furos)
  if (planarFor3D.length > 0) {
    const classifiedScene = buildClassifiedWireframeScene3D(planarFor3D, {
      isOrbitTilted,
      orbitProjection: orbitProj,
      isIsometric: opts.isIsometric,
      isoPlane: opts.isoPlane,
      sheetThickness: isoSheetThickness,
      styleConfig: opts.wireframe3DStyle,
    });
    renderClassifiedWireframeSceneToCanvas(ctx, classifiedScene, {
      invScale: inv,
      lod,
      isLight: opts.isLight,
      styleConfig: opts.wireframe3DStyle,
    });
  }

  // halo de seleção — destaque temporário, nunca substitui a cor técnica
  if (selection.size) {
    if (opts.isDraggingUnlocked) {
      // Destaque visual ao destravar movimento: contorno laranja brilhante com dash técnico
      ctx.setLineDash([8 * inv, 4 * inv]);
      ctx.strokeStyle = "#F59E0B";
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 6 * inv;
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = opts.isLight ? "#E11D48" : SELECTION_COLOR;
      ctx.globalAlpha = opts.isLight ? 0.8 : 0.72;
      ctx.lineWidth = 4.5 * inv;
    }
    const selTopOffset = is3DWireframeActive
      ? resolveBaseToTopExtrusionVector({
          isOrbitTilted,
          orbitProjection: orbitProj,
          isIsometric: opts.isIsometric,
          isoPlane: opts.isoPlane,
          sheetThickness: isoSheetThickness,
        }).topOffset
      : { x: 0, y: 0 };

    for (const e of list) {
      if (!selection.has(e.id) || e.type === "text") continue;
      ctx.save();
      if (is3DWireframeActive && !e.params?.isIsoSolidFace) {
        const sp = getEntityStructuralProfile(e);
        const entTopOffset = sp
          ? resolveBaseToTopExtrusionVector({
              isOrbitTilted,
              orbitProjection: orbitProj,
              isIsometric: opts.isIsometric,
              isoPlane: opts.isoPlane,
              sheetThickness: sp.heightH || sp.widthB || isoSheetThickness,
            }).topOffset
          : selTopOffset;
        ctx.translate(entTopOffset.x, entTopOffset.y);
      }
      ctx.beginPath();
      traceEntity(ctx, e, lod);
      ctx.stroke();
      ctx.restore();

      // Etiqueta técnica discreta no centro da peça (apenas quando selecionada no modo 2D SKETCH): ⬜ {B}×{B}×{e}
      if (!is3DWireframeActive && !lod) {
        const structOverlay = computeStructuralProfile2DInnerWallLines(e);
        if (structOverlay) {
          ctx.save();
          const fontSize = Math.max(9.5 * inv, 11 * inv);
          ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const textMetrics = ctx.measureText(structOverlay.badgeText);
          const padX = 5 * inv;
          const padY = 2.5 * inv;
          const boxW = textMetrics.width + padX * 2;
          const boxH = fontSize + padY * 2;
          const cx = structOverlay.center.x;
          const cy = structOverlay.center.y;

          ctx.fillStyle = opts.isLight
            ? "rgba(15, 23, 42, 0.88)"
            : "rgba(9, 13, 22, 0.90)";
          ctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
          ctx.lineWidth = 1.1 * inv;
          ctx.setLineDash([]);
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 4 * inv);
          } else {
            ctx.rect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
          }
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#67E8F9";
          ctx.fillText(structOverlay.badgeText, cx, cy);
          ctx.restore();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // textos por último (custo alto por item, quantidade sempre baixa)
  ctx.setLineDash([]);
  for (const e of list) {
    if (e.type !== "text") continue;
    const rawTextColor = techStyle(e.layer).color;
    const isWhiteOrCut = rawTextColor === "#FFFFFF" || e.layer === "corte";
    ctx.fillStyle = isWhiteOrCut
      ? opts.isLight
        ? "#0F141A"
        : "#ECEFF4"
      : opts.isLight && (e.layer === "construcao" || e.layer === "referencia")
        ? "#334155"
        : opts.isLight && e.layer === "recorte"
          ? "#92400E"
          : opts.isLight && (e.layer === "cota" || e.layer === "anotacoes")
            ? "#0369A1"
            : rawTextColor;
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
