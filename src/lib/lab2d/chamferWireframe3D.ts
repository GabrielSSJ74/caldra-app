/**
 * CHAMFER CAD — MOTOR DE HIERARQUIA DE ARESTAS, PROFUNDIDADE ÓPTICA E WIREFRAME TÉCNICO 3D
 *
 * Implementa a especificação canônica de Representação 3D Wireframe Técnica com Profundidade Óptica:
 *  - Categoria 1 (top_primary): Face Superior / Frontal Principal (Z = +h)
 *      Cor: #F8FAFC / #FFFFFF | Opacidade: 0.98 | Espessura: 1.7px | Contínua + Micro-pontos nos vértices (1.8px)
 *  - Categoria 2 (lateral_wall): Arestas Laterais / Verticais de Altura e Espessura (Z = 0 -> Z = +h) e Geratrizes de Silhueta
 *      Cor: #91A3B8 | Opacidade: 0.68 | Espessura: 1.1px | Contínua
 *  - Categoria 3 (bottom_visible): Arestas Inferiores Visíveis (Contorno Base Frontal e Arco Inferior Visível dentro de Furos)
 *      Cor: #65758A | Opacidade: 0.50 | Espessura: 1.0px | Contínua
 *  - Categoria 4 (hidden_back): Arestas Ocultas / Traseiras (Profundidade Estrutural sob a peça)
 *      Cor: #53647B | Opacidade: 0.32 | Espessura: 0.8px | Tracejado técnico fino [3.5, 2.8]
 *  - Categoria 5 (center_axis): Linhas de Centro, Eixos de Simetria e Construção 3D
 *      Cor: #38BDF8 | Opacidade: 0.38 | Espessura: 0.75px | Traço-ponto [8, 3, 1.5, 3]
 *
 * Camadas de Véu Translúcido de Profundidade Óptica (Optical Depth Veil):
 *  - Face Superior (Z = +h): rgba(18, 33, 56, 0.24) (com recorte evenodd dos furos passantes)
 *  - Faces Laterais / Cilíndricas Externas: rgba(14, 26, 45, 0.16)
 *  - Paredes Internas de Furos / Rasgos: rgba(8, 15, 28, 0.30)
 *  - Face Base / Fundo (Z = 0): rgba(10, 18, 32, 0.10)
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "./core";
import { samplePath } from "./bezier";
import { getIsoExtrusionVector, type IsoPlane } from "./isometricEngine";
import type { WorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  analyzeEntityBarGeometry,
  getEntityStructuralProfile,
} from "./structuralProfile";
import {
  consolidateStitchedLoopsInEntities2D,
  sanitizeClosedPolygonLoop2D,
} from "./cadDirectModeling3D";

export type WireframeEdgeCategory =
  | "top_primary"
  | "lateral_wall"
  | "bottom_visible"
  | "hidden_back"
  | "center_axis";

export interface ChamferWireframe3DStyleConfig {
  /** Ativa a hierarquia de 5 níveis e o véu translúcido de profundidade óptica (Padrão: true) */
  hierarchyEnabled: boolean;
  /** Exibe arestas ocultas/traseiras tracejadas em #53647B (Padrão: true) */
  showHiddenEdges: boolean;
  /** Exibe micro-pontos nos vértices e quadrantes da face superior (Padrão: true) */
  showVertexDots: boolean;
  /** Exibe o véu translúcido azul-noturno nas faces para separação frente/fundo (Padrão: true) */
  showOpticalVeil: boolean;
}

export const DEFAULT_CHAMFER_WIREFRAME_3D_STYLE: ChamferWireframe3DStyleConfig = {
  hierarchyEnabled: true,
  showHiddenEdges: true,
  showVertexDots: true,
  showOpticalVeil: true,
};

/** Paleta canônica da Imagem 2 (Technical Wireframe CAD com Profundidade Óptica) */
export const CHAMFER_WIREFRAME_3D_PALETTE = {
  dark: {
    // 3.1 Face Superior / Frontal Principal (Z = +h)
    topPrimaryStroke: "#F8FAFC",
    topPrimaryOpacity: 0.98,
    topPrimaryWidthPx: 1.7,
    vertexDotFill: "rgba(255, 255, 255, 0.92)",
    vertexDotRadiusPx: 1.75,

    // 3.2 Arestas Laterais / Verticais de Altura e Espessura (Z = 0 -> Z = +h)
    lateralWallStroke: "rgba(145, 163, 184, 0.68)", // #91A3B8 @ 0.68
    lateralWallHex: "#91A3B8",
    lateralWallOpacity: 0.68,
    lateralWallWidthPx: 1.1,
    lateralQuadrantStroke: "rgba(145, 163, 184, 0.46)",
    lateralQuadrantWidthPx: 0.88,

    // 3.3 Arestas Inferiores Visíveis (Contorno Base Frontal / Arco Inferior Visível no Furo)
    bottomVisibleStroke: "rgba(101, 117, 138, 0.52)", // #65758A @ 0.50-0.52
    bottomVisibleHex: "#65758A",
    bottomVisibleOpacity: 0.5,
    bottomVisibleWidthPx: 1.0,

    // 3.4 Arestas Ocultas / Traseiras (Profundidade Estrutural)
    hiddenBackStroke: "rgba(83, 100, 123, 0.32)", // #53647B @ 0.32
    hiddenBackHex: "#53647B",
    hiddenBackOpacity: 0.32,
    hiddenBackWidthPx: 0.8,
    hiddenBackDashPx: [3.6, 2.8] as [number, number],

    // 3.5 Linhas de Centro, Eixos de Simetria e Construção 3D
    centerAxisStroke: "rgba(56, 189, 248, 0.38)", // #38BDF8 @ 0.38
    centerAxisHex: "#38BDF8",
    centerAxisOpacity: 0.38,
    centerAxisWidthPx: 0.75,
    centerAxisDashPx: [8, 3, 1.5, 3] as [number, number, number, number],

    // 4.1 Véu Translúcido de Face (Optical Depth Veil)
    topFaceVeil: "rgba(18, 33, 56, 0.24)",
    outerWallVeil: "rgba(14, 26, 45, 0.16)",
    holeInnerWallVeil: "rgba(8, 15, 28, 0.30)",
    bottomBaseVeil: "rgba(10, 18, 32, 0.10)",
    steppedTopFaceVeil: "rgba(24, 45, 76, 0.22)",

    // 6. Grade Base Orbital (Z = 0)
    orbitalGridLine: "rgba(83, 100, 123, 0.15)",
    orbitalGridMajor: "rgba(101, 117, 138, 0.22)",
    orbitalGridRing: "rgba(83, 100, 123, 0.16)",
  },
  light: {
    topPrimaryStroke: "#0F172A",
    topPrimaryOpacity: 0.96,
    topPrimaryWidthPx: 1.7,
    vertexDotFill: "rgba(15, 23, 42, 0.88)",
    vertexDotRadiusPx: 1.7,

    lateralWallStroke: "rgba(51, 65, 85, 0.65)",
    lateralWallHex: "#334155",
    lateralWallOpacity: 0.65,
    lateralWallWidthPx: 1.05,
    lateralQuadrantStroke: "rgba(71, 85, 105, 0.42)",
    lateralQuadrantWidthPx: 0.85,

    bottomVisibleStroke: "rgba(71, 85, 105, 0.48)",
    bottomVisibleHex: "#475569",
    bottomVisibleOpacity: 0.48,
    bottomVisibleWidthPx: 0.95,

    hiddenBackStroke: "rgba(100, 116, 139, 0.32)",
    hiddenBackHex: "#64748B",
    hiddenBackOpacity: 0.32,
    hiddenBackWidthPx: 0.78,
    hiddenBackDashPx: [3.6, 2.8] as [number, number],

    centerAxisStroke: "rgba(2, 132, 199, 0.42)",
    centerAxisHex: "#0284C7",
    centerAxisOpacity: 0.42,
    centerAxisWidthPx: 0.75,
    centerAxisDashPx: [8, 3, 1.5, 3] as [number, number, number, number],

    topFaceVeil: "rgba(14, 165, 233, 0.09)",
    outerWallVeil: "rgba(14, 165, 233, 0.06)",
    holeInnerWallVeil: "rgba(15, 23, 42, 0.10)",
    bottomBaseVeil: "rgba(15, 23, 42, 0.04)",
    steppedTopFaceVeil: "rgba(2, 132, 199, 0.12)",

    orbitalGridLine: "rgba(100, 116, 139, 0.15)",
    orbitalGridMajor: "rgba(71, 85, 105, 0.22)",
    orbitalGridRing: "rgba(100, 116, 139, 0.16)",
  },
} as const;

export interface ClassifiedEdgeSegment3D {
  id: string;
  category: WireframeEdgeCategory;
  kind: "segment" | "arc" | "ellipse_arc" | "polyline";
  /** Ordem de pintura (menor = fundo, maior = frente) */
  paintDepth: number;
  /** Pontos para kind === "segment" | "polyline" */
  pts?: Vec2[];
  closed?: boolean;
  /** Dados para kind === "arc" */
  cx?: number;
  cy?: number;
  r?: number;
  a0?: number;
  a1?: number;
  /** Dados para kind === "ellipse_arc" */
  rx?: number;
  ry?: number;
  rotation?: number;
  /** Sub-estilo para geratriz auxiliar de quadrante */
  isQuadrantGeneratrix?: boolean;
}

export interface ClassifiedOpticalFace3D {
  id: string;
  role: "base_veil" | "outer_wall" | "hole_wall" | "top_veil" | "stepped_top_veil";
  paintDepth: number;
  /** Loops externos e furos internos (renderizados com fill("evenodd")) */
  outerLoop: Vec2[];
  holeLoops: Vec2[][];
}

export interface ClassifiedWireframeScene3D {
  /** Vetor de extrusão local da Base (Z = 0) para o Topo (Z = +h) */
  extrusionVector: Vec2;
  /** Faces ópticas translúcidas ordenadas de trás para frente */
  opticalFaces: ClassifiedOpticalFace3D[];
  /** Arestas classificadas e deduplicadas ordenadas estritamente de trás para frente */
  edges: ClassifiedEdgeSegment3D[];
  /** Micro-pontos nos vértices e interseções da Face Superior (Z = +h) */
  topVertexDots: Vec2[];
  /** Contagem por categoria para auditoria e testes automatizados */
  stats: Record<WireframeEdgeCategory, number>;
}

/**
 * Calcula o vetor de extrusão local que vai SEMPRE da Base (Z = 0, plano da grade)
 * para a Face Superior (Z = +h, topo elevado da peça).
 *
 * Garante coerência entre ÓRBITA 3D e ISO 2D:
 * - Em ÓRBITA 3D: `orbitProj.localExtrusion` já aponta na direção +Z (para cima na tela quando cos(phi) > 0).
 * - Em ISO 2D: o plano "top" extruda para cima (-Y na tela = +Z), de modo que Z = 0 fique na base e Z = +h no topo.
 */
export function resolveBaseToTopExtrusionVector(opts: {
  isOrbitTilted: boolean;
  orbitProjection?: WorkplaneOrbitProjection2D;
  isIsometric?: boolean;
  isoPlane?: IsoPlane;
  sheetThickness: number;
  zBaseRatio?: number;
  zTopRatio?: number;
}): { baseOffset: Vec2; topOffset: Vec2; deltaExtrusion: Vec2 } {
  const safeThickness =
    Number.isFinite(opts.sheetThickness) && opts.sheetThickness > 0 ? opts.sheetThickness : 5;
  const z0 = typeof opts.zBaseRatio === "number" ? opts.zBaseRatio : 0;
  const z1 = typeof opts.zTopRatio === "number" ? opts.zTopRatio : 1;

  let fullPositiveZ: Vec2;
  if (opts.isOrbitTilted && opts.orbitProjection && !opts.isIsometric) {
    fullPositiveZ = {
      x: opts.orbitProjection.localExtrusion.x,
      y: opts.orbitProjection.localExtrusion.y,
    };
  } else {
    // Em ISO 2D, getIsoExtrusionVector("top", h) retorna (0, +h) (para baixo, -Z).
    // Portanto invertemos para obter o vetor Base (Z=0) -> Topo (Z=+h) apontando para +Z (para cima na tela).
    const isoDown = getIsoExtrusionVector(opts.isoPlane ?? "top", safeThickness);
    fullPositiveZ = { x: -isoDown.x, y: -isoDown.y };
  }

  const baseOffset: Vec2 = {
    x: fullPositiveZ.x * z0 || 0,
    y: fullPositiveZ.y * z0 || 0,
  };
  const topOffset: Vec2 = {
    x: fullPositiveZ.x * z1 || 0,
    y: fullPositiveZ.y * z1 || 0,
  };
  const deltaExtrusion: Vec2 = {
    x: topOffset.x - baseOffset.x || 0,
    y: topOffset.y - baseOffset.y || 0,
  };

  return { baseOffset, topOffset, deltaExtrusion };
}

/**
 * Extrai a relação de cota Z de uma entidade (suporta peças com múltiplos níveis de altura,
 * degraus, rebaixos, canais e abas).
 */
export function resolveEntityZRatios(
  e: Entity,
  sheetThickness: number,
): { z0: number; z1: number; isRecessOrGroove: boolean } {
  const safeH = sheetThickness > 0 ? sheetThickness : 5;
  const params = e.params ?? {};

  const rawZ0 =
    typeof e.elevationZ === "number"
      ? e.elevationZ
      : typeof params.elevationZ === "number"
        ? (params.elevationZ as number)
        : typeof params.zBaseMm === "number"
          ? (params.zBaseMm as number)
          : undefined;
  const rawH =
    typeof e.extrudeHeight === "number"
      ? e.extrudeHeight
      : typeof params.extrudeHeight === "number"
        ? (params.extrudeHeight as number)
        : typeof params.extrudeHeightMm === "number"
          ? (params.extrudeHeightMm as number)
          : undefined;

  if (typeof rawZ0 === "number" || typeof rawH === "number") {
    const zBaseMm = typeof rawZ0 === "number" && Number.isFinite(rawZ0) ? rawZ0 : 0;
    const defaultH = Math.abs(zBaseMm) > 0.01 ? 0.15 : safeH;
    const hMm =
      typeof rawH === "number" && Number.isFinite(rawH) ? Math.max(0.1, rawH) : defaultH;
    return {
      z0: zBaseMm / safeH,
      z1: (zBaseMm + hMm) / safeH,
      isRecessOrGroove: hMm !== safeH || zBaseMm !== 0,
    };
  }

  if (typeof params.stepRatio === "number" && params.stepRatio > 0 && params.stepRatio < 1) {
    return {
      z0: 1 - params.stepRatio,
      z1: 1,
      isRecessOrGroove: true,
    };
  }

  if (e.layer === "marcacao" || e.layer === "gravacao") {
    // Rebaixo/canal superficial no topo da peça (ex.: 22% da espessura no topo Z = +h)
    return {
      z0: 0.78,
      z1: 1.0,
      isRecessOrGroove: true,
    };
  }

  return { z0: 0, z1: 1, isRecessOrGroove: false };
}

/** Converte entidade fechada em polígono amostrado para análise topológica (Outer vs Hole) */
export function sampleClosedEntityLoop(e: Entity, sampleSteps = 48): Vec2[] | null {
  if (e.type === "rect" && e.w > 0.1 && e.h > 0.1) {
    return [
      { x: e.x, y: e.y },
      { x: e.x + e.w, y: e.y },
      { x: e.x + e.w, y: e.y + e.h },
      { x: e.x, y: e.y + e.h },
    ];
  }
  if (e.type === "polyline" && e.pts.length >= 3) {
    const first = e.pts[0]!;
    const last = e.pts[e.pts.length - 1]!;
    if (e.closed || Math.hypot(first.x - last.x, first.y - last.y) <= 2.05) {
      const clean = sanitizeClosedPolygonLoop2D(e.pts, 2.05);
      return clean.length >= 3 ? clean : null;
    }
  }
  if (e.type === "circle" && e.r > 0) {
    const pts: Vec2[] = [];
    for (let i = 0; i < sampleSteps; i++) {
      const a = (i / sampleSteps) * Math.PI * 2;
      pts.push({ x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a) });
    }
    return pts;
  }
  if (e.type === "ellipse" && e.rx > 0 && e.ry > 0) {
    const pts: Vec2[] = [];
    const rot = e.rotation ?? 0;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    for (let i = 0; i < sampleSteps; i++) {
      const a = (i / sampleSteps) * Math.PI * 2;
      const lx = e.rx * Math.cos(a);
      const ly = e.ry * Math.sin(a);
      pts.push({
        x: e.cx + lx * cosR - ly * sinR,
        y: e.cy + lx * sinR + ly * cosR,
      });
    }
    return pts;
  }
  if (e.type === "path" && e.closed) {
    const pts = samplePath(e.start, e.segs, !!e.closed, 16);
    return pts.length >= 3 ? pts : null;
  }
  return null;
}

export function polygonSignedArea2D(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return 0.5 * s;
}

export function pointInPolygon2D(p: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Classifica um conjunto de entidades 2D em:
 *  - Contornos externos ou ressaltos/canais em múltiplos níveis Z (`outerEntityIds`)
 *  - Furos/recortes passantes internos (`holeEntityIds`) contidos dentro de um contorno externo
 *  - Mapa de contornos externos para seus furos filhos (`outerToHolesMap`)
 */
export interface ClassifiedOuterAndHoleResult {
  outerEntityIds: Set<string>;
  holeEntityIds: Set<string>;
  outerToHolesMap: Map<string, Entity[]>;
  sampledLoops: Map<string, Vec2[]>;
  entityById: Map<string, Entity>;
}

let cachedClassifiedEntitiesRef: Entity[] | null = null;
let cachedClassifiedSnapshot: Entity[] = [];
let cachedClassifiedResult: ClassifiedOuterAndHoleResult | null = null;
let wireframeCacheHits = 0;
let wireframeCacheMisses = 0;

export function getWireframe3DCacheStats(): {
  hits: number;
  misses: number;
  hitRatePercent: number;
} {
  const total = wireframeCacheHits + wireframeCacheMisses;
  return {
    hits: wireframeCacheHits,
    misses: wireframeCacheMisses,
    hitRatePercent: total > 0 ? Math.round((wireframeCacheHits / total) * 1000) / 10 : 100,
  };
}

/**
 * Classifica um conjunto de entidades 2D em:
 *  - Contornos externos ou ressaltos/canais em múltiplos níveis Z (`outerEntityIds`)
 *  - Furos/recortes passantes internos (`holeEntityIds`) contidos dentro de um contorno externo
 *  - Mapa de contornos externos para seus furos filhos (`outerToHolesMap`)
 *
 * Otimizado com memoização por referência de array e verificação rasa O(N) das entidades,
 * eliminando a re-amostragem de polígonos de 48 pontos e o teste O(M²) pointInPolygon2D
 * durante os 60fps da Órbita 3D (onde apenas ângulos θ, φ mudam).
 */
export function classifyOuterAndHoleEntities(rawEntities: Entity[]): ClassifiedOuterAndHoleResult {
  if (
    cachedClassifiedResult &&
    (cachedClassifiedEntitiesRef === rawEntities ||
      (cachedClassifiedSnapshot.length === rawEntities.length &&
        rawEntities.every((e, idx) => cachedClassifiedSnapshot[idx] === e)))
  ) {
    wireframeCacheHits++;
    return cachedClassifiedResult;
  }

  wireframeCacheMisses++;
  const { entities } = consolidateStitchedLoopsInEntities2D(rawEntities, 2.0);
  const closedCandidates: { entity: Entity; loop: Vec2[]; absArea: number }[] = [];
  const sampledLoops = new Map<string, Vec2[]>();
  const entityById = new Map<string, Entity>();

  for (const e of entities) {
    entityById.set(e.id, e);
    if (
      e.isConstruction ||
      e.params?.isLoft3DSolid ||
      e.params?.loft3d ||
      e.layer === "centro" ||
      e.layer === "referencia" ||
      e.layer === "dobra" ||
      e.type === "text" ||
      e.type === "point"
    ) {
      continue;
    }
    const loop = sampleClosedEntityLoop(e, 48);
    if (!loop || loop.length < 3) continue;
    const absArea = Math.abs(polygonSignedArea2D(loop));
    if (absArea < 1e-3) continue;
    sampledLoops.set(e.id, loop);
    closedCandidates.push({ entity: e, loop, absArea });
  }

  // Ordena do maior para o menor
  closedCandidates.sort((a, b) => b.absArea - a.absArea);

  const outerEntityIds = new Set<string>();
  const holeEntityIds = new Set<string>();
  const outerToHolesMap = new Map<string, Entity[]>();

  for (let i = 0; i < closedCandidates.length; i++) {
    const item = closedCandidates[i]!;
    const ent = item.entity;
    const elevZ =
      typeof ent.elevationZ === "number"
        ? ent.elevationZ
        : typeof ent.params?.elevationZ === "number"
          ? (ent.params.elevationZ as number)
          : typeof ent.params?.zBaseMm === "number"
            ? (ent.params.zBaseMm as number)
            : 0;
    const hasCustomZFeature =
      Math.abs(elevZ) > 0.01 ||
      typeof ent.extrudeHeight === "number" ||
      typeof ent.params?.extrudeHeight === "number" ||
      typeof ent.params?.extrudeHeightMm === "number" ||
      typeof ent.params?.stepRatio === "number" ||
      ent.layer === "marcacao" ||
      ent.layer === "gravacao";

    if (hasCustomZFeature && ent.layer !== "furo") {
      outerEntityIds.add(ent.id);
      if (!outerToHolesMap.has(ent.id)) {
        outerToHolesMap.set(ent.id, []);
      }
      continue;
    }

    const testPt = item.loop[0]!;
    let parentOuterId: string | null = null;
    let depthCount = 0;

    for (let j = 0; j < i; j++) {
      const parent = closedCandidates[j]!;
      if (pointInPolygon2D(testPt, parent.loop)) {
        depthCount++;
        if (outerEntityIds.has(parent.entity.id)) {
          parentOuterId = parent.entity.id;
        }
      }
    }

    // Se explicitamente na camada "furo" ou contido em nível ímpar dentro de um contorno externo
    if ((depthCount % 2 === 1 && parentOuterId) || (ent.layer === "furo" && parentOuterId)) {
      holeEntityIds.add(ent.id);
      const list = outerToHolesMap.get(parentOuterId) ?? [];
      list.push(ent);
      outerToHolesMap.set(parentOuterId, list);
    } else if (ent.layer === "furo" && closedCandidates.length > 1 && i > 0) {
      const fallbackOuter = closedCandidates[0]!.entity.id;
      holeEntityIds.add(ent.id);
      const list = outerToHolesMap.get(fallbackOuter) ?? [];
      list.push(ent);
      outerToHolesMap.set(fallbackOuter, list);
    } else {
      outerEntityIds.add(ent.id);
      if (!outerToHolesMap.has(ent.id)) {
        outerToHolesMap.set(ent.id, []);
      }
    }
  }

  const result: ClassifiedOuterAndHoleResult = {
    outerEntityIds,
    holeEntityIds,
    outerToHolesMap,
    sampledLoops,
    entityById,
  };
  cachedClassifiedEntitiesRef = rawEntities;
  cachedClassifiedSnapshot = rawEntities.slice();
  cachedClassifiedResult = result;
  return result;
}

/**
 * Calcula analiticamente a divisão do contorno inferior (Z = 0) de um círculo (externo ou furo)
 * em arcos visíveis (Categoria 3.3: `bottom_visible`, #65758A contínuo) e arcos ocultos
 * (Categoria 3.4: `hidden_back`, #53647B tracejado), além das geratrizes tangentes de silhueta (Categoria 3.2).
 */
export function computeCircle3DWireframeDecomposition(
  cx: number,
  cy: number,
  r: number,
  baseOffset: Vec2,
  topOffset: Vec2,
  isHole: boolean,
): {
  topCircle: { cx: number; cy: number; r: number };
  bottomVisibleArcs: { cx: number; cy: number; r: number; a0: number; a1: number }[];
  bottomHiddenArcs: { cx: number; cy: number; r: number; a0: number; a1: number }[];
  silhouetteGeneratrices: { pBase: Vec2; pTop: Vec2 }[];
  quadrantGeneratrices: { pBase: Vec2; pTop: Vec2 }[];
  topQuadrantVertices: Vec2[];
} {
  const baseCx = cx + baseOffset.x;
  const baseCy = cy + baseOffset.y;
  const topCx = cx + topOffset.x;
  const topCy = cy + topOffset.y;
  const extX = topCx - baseCx;
  const extY = topCy - baseCy;
  const extLen = Math.hypot(extX, extY);

  const alphaE = extLen > 1e-6 ? Math.atan2(extY, extX) : -Math.PI / 2;
  const tanAngle1 = alphaE - Math.PI / 2;
  const tanAngle2 = alphaE + Math.PI / 2;

  // 2 Geratrizes tangentes extremas de silhueta (Categoria 3.2)
  const silhouetteGeneratrices: { pBase: Vec2; pTop: Vec2 }[] = [];
  if (extLen > 1e-4) {
    for (const ang of [tanAngle1, tanAngle2]) {
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      silhouetteGeneratrices.push({
        pBase: { x: baseCx + r * cosA, y: baseCy + r * sinA },
        pTop: { x: topCx + r * cosA, y: topCy + r * sinA },
      });
    }
  }

  // 4 Geratrizes de quadrantes cardeais (0°, 90°, 180°, 270°) para cilindros e furos maiores
  const quadrantGeneratrices: { pBase: Vec2; pTop: Vec2 }[] = [];
  const topQuadrantVertices: Vec2[] = [];
  const cardinalAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (const ang of cardinalAngles) {
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    topQuadrantVertices.push({ x: topCx + r * cosA, y: topCy + r * sinA });
    // Evita duplicar se já coincidir quase exatamente com a geratriz tangente de silhueta
    const diff1 = Math.abs(Math.atan2(Math.sin(ang - tanAngle1), Math.cos(ang - tanAngle1)));
    const diff2 = Math.abs(Math.atan2(Math.sin(ang - tanAngle2), Math.cos(ang - tanAngle2)));
    if (extLen > 1e-4 && diff1 > 0.18 && diff2 > 0.18) {
      quadrantGeneratrices.push({
        pBase: { x: baseCx + r * cosA, y: baseCy + r * sinA },
        pTop: { x: topCx + r * cosA, y: topCy + r * sinA },
      });
    }
  }

  const bottomVisibleArcs: { cx: number; cy: number; r: number; a0: number; a1: number }[] = [];
  const bottomHiddenArcs: { cx: number; cy: number; r: number; a0: number; a1: number }[] = [];

  if (extLen <= 1e-4) {
    return {
      topCircle: { cx: topCx, cy: topCy, r },
      bottomVisibleArcs,
      bottomHiddenArcs,
      silhouetteGeneratrices,
      quadrantGeneratrices,
      topQuadrantVertices,
    };
  }

  if (!isHole) {
    // CONTORNO CILÍNDRICO EXTERNO:
    // - Metade frontal/inferior (no sentido oposto a +E, de alphaE + pi/2 até alphaE + 3*pi/2) é VISÍVEL (Categoria 3.3)
    // - Metade traseira/superior (no sentido +E, de alphaE - pi/2 até alphaE + pi/2) é OCULTA sob o corpo da peça (Categoria 3.4)
    bottomVisibleArcs.push({
      cx: baseCx,
      cy: baseCy,
      r,
      a0: alphaE + Math.PI / 2,
      a1: alphaE + (3 * Math.PI) / 2,
    });
    bottomHiddenArcs.push({
      cx: baseCx,
      cy: baseCy,
      r,
      a0: alphaE - Math.PI / 2,
      a1: alphaE + Math.PI / 2,
    });
  } else {
    // FURO CILÍNDRICO INTERNO:
    // Um ponto Q no círculo base (Z=0) é visível por dentro da abertura superior Disk(C_top, r)
    // se e somente se ||Q - C_top|| < r  <=>  cos(theta - alphaE) > ||E|| / (2r).
    const ratio = extLen / (2 * Math.max(1e-6, r));
    if (ratio < 0.998) {
      const thetaCut = Math.acos(Math.max(-1, Math.min(1, ratio)));
      // Arco visível através da boca do furo (Categoria 3.3)
      bottomVisibleArcs.push({
        cx: baseCx,
        cy: baseCy,
        r,
        a0: alphaE - thetaCut,
        a1: alphaE + thetaCut,
      });
      // Restante do círculo inferior oculto sob a parede da chapa (Categoria 3.4)
      bottomHiddenArcs.push({
        cx: baseCx,
        cy: baseCy,
        r,
        a0: alphaE + thetaCut,
        a1: alphaE + Math.PI * 2 - thetaCut,
      });
    } else {
      // Furo profundo ou estreito: todo o anel inferior está oculto sob a espessura da chapa (Categoria 3.4)
      bottomHiddenArcs.push({
        cx: baseCx,
        cy: baseCy,
        r,
        a0: 0,
        a1: Math.PI * 2,
      });
    }
  }

  return {
    topCircle: { cx: topCx, cy: topCy, r },
    bottomVisibleArcs,
    bottomHiddenArcs,
    silhouetteGeneratrices,
    quadrantGeneratrices,
    topQuadrantVertices,
  };
}

/**
 * Classifica cada segmento da base (Z = 0) de um polígono em:
 *  - `bottom_visible` (Categoria 3.3, #65758A contínuo): aresta frontal/inferior cujo vetor normal externo
 *    aponta no sentido oposto à extrusão (para fora da silhueta da face superior), ou aresta interna visível no furo.
 *  - `hidden_back` (Categoria 3.4, #53647B tracejado): aresta traseira coberta pelo corpo da peça.
 */
export function classifyPolygonBaseEdgeVisibility(
  p0Base: Vec2,
  p1Base: Vec2,
  topPolygonLoop: Vec2[],
  isHole: boolean,
): "bottom_visible" | "hidden_back" {
  const midBase: Vec2 = {
    x: 0.5 * (p0Base.x + p1Base.x),
    y: 0.5 * (p0Base.y + p1Base.y),
  };
  const insideTop = pointInPolygon2D(midBase, topPolygonLoop);
  if (isHole) {
    // Em um furo poligonal/rasgo, o trecho da base que cai DENTRO da abertura superior é visível;
    // o trecho fora está oculto sob a chapa.
    return insideTop ? "bottom_visible" : "hidden_back";
  }
  // Em um contorno externo poligonal, o trecho da base que cai DENTRO da projeção da face superior
  // está oculto pela face superior; o trecho fora é a borda inferior frontal visível!
  return insideTop ? "hidden_back" : "bottom_visible";
}

/**
 * Chave canônica para deduplicação de segmentos lineares 2D projetados (evita dupla renderização de arestas).
 */
function canonicalSegmentKey(a: Vec2, b: Vec2): string {
  const ax = Math.round(a.x * 20);
  const ay = Math.round(a.y * 20);
  const bx = Math.round(b.x * 20);
  const by = Math.round(b.y * 20);
  if (ax < bx || (ax === bx && ay <= by)) {
    return `${ax},${ay}->${bx},${by}`;
  }
  return `${bx},${by}->${ax},${ay}`;
}

/**
 * Constrói a cena 3D completa classificada nas 5 categorias de hierarquia de arestas
 * e 4 camadas de véu óptico translúcido, ordenada estritamente de trás para frente.
 */
export function buildClassifiedWireframeScene3D(
  entities: Entity[],
  opts: {
    isOrbitTilted: boolean;
    orbitProjection?: WorkplaneOrbitProjection2D;
    isIsometric?: boolean;
    isoPlane?: IsoPlane;
    sheetThickness: number;
    styleConfig?: Partial<ChamferWireframe3DStyleConfig>;
  },
): ClassifiedWireframeScene3D {
  const style: ChamferWireframe3DStyleConfig = {
    ...DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
    ...(opts.styleConfig ?? {}),
  };

  const { baseOffset, topOffset, deltaExtrusion } = resolveBaseToTopExtrusionVector({
    isOrbitTilted: opts.isOrbitTilted,
    orbitProjection: opts.orbitProjection,
    isIsometric: opts.isIsometric,
    isoPlane: opts.isoPlane,
    sheetThickness: opts.sheetThickness,
  });

  const { holeEntityIds, outerToHolesMap, sampledLoops, entityById } =
    classifyOuterAndHoleEntities(entities);

  const opticalFaces: ClassifiedOpticalFace3D[] = [];
  const edges: ClassifiedEdgeSegment3D[] = [];
  const topVertexDots: Vec2[] = [];
  const seenVertices = new Set<string>();
  const seenLateralKeys = new Set<string>();
  const seenTopKeys = new Set<string>();
  const seenBottomKeys = new Set<string>();

  const pushVertexDot = (pt: Vec2) => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    const key = `${Math.round(pt.x * 10)},${Math.round(pt.y * 10)}`;
    if (seenVertices.has(key)) return;
    seenVertices.add(key);
    topVertexDots.push(pt);
  };

  const extLen = Math.hypot(deltaExtrusion.x, deltaExtrusion.y);
  const extDir: Vec2 =
    extLen > 1e-6
      ? { x: deltaExtrusion.x / extLen, y: deltaExtrusion.y / extLen }
      : { x: 0, y: -1 };

  // Projeta profundidade ao longo do sentido de observação (da frente para o fundo)
  const screenDepthMetric = (pt: Vec2, zLevel: number): number => {
    // Pontos mais na direção -extDir (mais abaixo na tela) estão mais próximos da câmera
    const alongCamera = -(pt.x * extDir.x + pt.y * extDir.y) * 0.001;
    return zLevel * 100 + alongCamera;
  };

  // 1. Véus translúcidos das faces superiores e bases dos contornos externos (com recorte evenodd dos furos)
  for (const [outerId, childHoles] of outerToHolesMap.entries()) {
    const outerEnt = entityById.get(outerId);
    const rawOuterLoop = sampledLoops.get(outerId);
    if (!outerEnt || !rawOuterLoop) continue;

    const outerSp = getEntityStructuralProfile(outerEnt);
    const outerEffectiveThickness = outerSp
      ? outerSp.heightH || outerSp.widthB || opts.sheetThickness
      : opts.sheetThickness;
    const { z0, z1, isRecessOrGroove } = resolveEntityZRatios(outerEnt, outerEffectiveThickness);
    const entVectors = resolveBaseToTopExtrusionVector({
      isOrbitTilted: opts.isOrbitTilted,
      orbitProjection: opts.orbitProjection,
      isIsometric: opts.isIsometric,
      isoPlane: opts.isoPlane,
      sheetThickness: outerEffectiveThickness,
      zBaseRatio: z0,
      zTopRatio: z1,
    });

    const baseLoop = rawOuterLoop.map((p) => ({
      x: p.x + entVectors.baseOffset.x,
      y: p.y + entVectors.baseOffset.y,
    }));
    const topLoop = rawOuterLoop.map((p) => ({
      x: p.x + entVectors.topOffset.x,
      y: p.y + entVectors.topOffset.y,
    }));

    const baseHoleLoops: Vec2[][] = [];
    const topHoleLoops: Vec2[][] = [];
    for (const hEnt of childHoles) {
      const hRaw = sampledLoops.get(hEnt.id);
      if (!hRaw) continue;
      baseHoleLoops.push(
        hRaw.map((p) => ({
          x: p.x + entVectors.baseOffset.x,
          y: p.y + entVectors.baseOffset.y,
        })),
      );
      topHoleLoops.push(
        hRaw.map((p) => ({
          x: p.x + entVectors.topOffset.x,
          y: p.y + entVectors.topOffset.y,
        })),
      );
    }

    if (style.showOpticalVeil) {
      // Face Base (Z = 0): rgba(10, 18, 32, 0.10)
      opticalFaces.push({
        id: `veil_base_${outerId}`,
        role: "base_veil",
        paintDepth: 10 + z0 * 10,
        outerLoop: baseLoop,
        holeLoops: baseHoleLoops,
      });

      // Face Superior (Z = +h): rgba(18, 33, 56, 0.24) com recorte evenodd dos furos!
      opticalFaces.push({
        id: `veil_top_${outerId}`,
        role: isRecessOrGroove ? "stepped_top_veil" : "top_veil",
        paintDepth: 75 + z1 * 10,
        outerLoop: topLoop,
        holeLoops: topHoleLoops,
      });
    }
  }

  // 2. Processa cada entidade individualmente para classificar todas as suas arestas nas 5 categorias
  for (const e of entities) {
    if (e.type === "text" || e.type === "point" || e.params?.isIsoSolidFace) continue;

    // CATEGORIA 3.5: Linhas de Centro, Eixos de Simetria e Construção 3D
    if (
      e.isConstruction ||
      e.layer === "centro" ||
      e.layer === "referencia" ||
      e.layer === "dobra"
    ) {
      if (e.type === "line") {
        edges.push({
          id: `axis_${e.id}`,
          category: "center_axis",
          kind: "segment",
          paintDepth: 88,
          pts: [
            { x: e.x1 + topOffset.x, y: e.y1 + topOffset.y },
            { x: e.x2 + topOffset.x, y: e.y2 + topOffset.y },
          ],
        });
      } else if (e.type === "circle") {
        edges.push({
          id: `axis_circle_${e.id}`,
          category: "center_axis",
          kind: "arc",
          paintDepth: 88,
          cx: e.cx + topOffset.x,
          cy: e.cy + topOffset.y,
          r: e.r,
          a0: 0,
          a1: Math.PI * 2,
        });
      } else if (e.type === "polyline" && e.pts.length >= 2) {
        edges.push({
          id: `axis_poly_${e.id}`,
          category: "center_axis",
          kind: "polyline",
          paintDepth: 88,
          closed: !!e.closed,
          pts: e.pts.map((p) => ({ x: p.x + topOffset.x, y: p.y + topOffset.y })),
        });
      }
      continue;
    }

    const isHole = holeEntityIds.has(e.id) || e.layer === "furo";
    const entSp = getEntityStructuralProfile(e);
    const effectiveThickness = entSp
      ? entSp.heightH || entSp.widthB || opts.sheetThickness
      : opts.sheetThickness;
    const { z0, z1 } = resolveEntityZRatios(e, effectiveThickness);
    const entVec = resolveBaseToTopExtrusionVector({
      isOrbitTilted: opts.isOrbitTilted,
      orbitProjection: opts.orbitProjection,
      isIsometric: opts.isIsometric,
      isoPlane: opts.isoPlane,
      sheetThickness: effectiveThickness,
      zBaseRatio: z0,
      zTopRatio: z1,
    });

    // CASO A: CÍRCULO (Flange externa, cilindro ou furo circular passante/rebaixo)
    if (e.type === "circle" && e.r > 0) {
      const decomp = computeCircle3DWireframeDecomposition(
        e.cx,
        e.cy,
        e.r,
        entVec.baseOffset,
        entVec.topOffset,
        isHole,
      );

      // Véu óptico da parede cilíndrica (interna do furo ou lateral externa)
      if (style.showOpticalVeil && decomp.silhouetteGeneratrices.length === 2) {
        const g0 = decomp.silhouetteGeneratrices[0]!;
        const g1 = decomp.silhouetteGeneratrices[1]!;
        const wallPoly: Vec2[] = [];
        const steps = 28;
        const aStart = Math.atan2(g0.pTop.y - decomp.topCircle.cy, g0.pTop.x - decomp.topCircle.cx);
        const aEnd = aStart + Math.PI;
        for (let i = 0; i <= steps; i++) {
          const a = aStart + ((aEnd - aStart) * i) / steps;
          wallPoly.push({
            x: decomp.topCircle.cx + e.r * Math.cos(a),
            y: decomp.topCircle.cy + e.r * Math.sin(a),
          });
        }
        for (let i = steps; i >= 0; i--) {
          const a = aStart + ((aEnd - aStart) * i) / steps;
          wallPoly.push({
            x: e.cx + entVec.baseOffset.x + e.r * Math.cos(a),
            y: e.cy + entVec.baseOffset.y + e.r * Math.sin(a),
          });
        }
        opticalFaces.push({
          id: `veil_cyl_wall_${e.id}`,
          role: isHole ? "hole_wall" : "outer_wall",
          paintDepth: isHole ? 42 : 45,
          outerLoop: wallPoly,
          holeLoops: [],
        });
      }

      // 3.4 Arestas Ocultas / Traseiras na base Z = 0 (#53647B tracejado)
      if (style.showHiddenEdges) {
        for (let i = 0; i < decomp.bottomHiddenArcs.length; i++) {
          const arc = decomp.bottomHiddenArcs[i]!;
          edges.push({
            id: `circle_hid_${e.id}_${i}`,
            category: "hidden_back",
            kind: "arc",
            paintDepth: 20 + z0 * 5,
            cx: arc.cx,
            cy: arc.cy,
            r: arc.r,
            a0: arc.a0,
            a1: arc.a1,
          });
        }
      }

      // 3.3 Arestas Inferiores Visíveis na base Z = 0 (#65758A contínuo)
      for (let i = 0; i < decomp.bottomVisibleArcs.length; i++) {
        const arc = decomp.bottomVisibleArcs[i]!;
        edges.push({
          id: `circle_bot_vis_${e.id}_${i}`,
          category: "bottom_visible",
          kind: "arc",
          paintDepth: 34 + z0 * 5,
          cx: arc.cx,
          cy: arc.cy,
          r: arc.r,
          a0: arc.a0,
          a1: arc.a1,
        });
      }

      // 3.2 Geratrizes de Silhueta Tangentes (Z = 0 -> Z = +h) em #91A3B8 contínuo
      for (let i = 0; i < decomp.silhouetteGeneratrices.length; i++) {
        const gen = decomp.silhouetteGeneratrices[i]!;
        const key = canonicalSegmentKey(gen.pBase, gen.pTop);
        if (!seenLateralKeys.has(key)) {
          seenLateralKeys.add(key);
          edges.push({
            id: `circle_sil_${e.id}_${i}`,
            category: "lateral_wall",
            kind: "segment",
            paintDepth: 55 + screenDepthMetric(gen.pTop, 0.5 * (z0 + z1)),
            pts: [gen.pBase, gen.pTop],
          });
        }
      }

      // 3.2 Geratrizes de Quadrantes Cardeais (0°, 90°, 180°, 270°) para leitura estrutural de cilindros/furos
      for (let i = 0; i < decomp.quadrantGeneratrices.length; i++) {
        const gen = decomp.quadrantGeneratrices[i]!;
        const key = canonicalSegmentKey(gen.pBase, gen.pTop);
        if (!seenLateralKeys.has(key)) {
          seenLateralKeys.add(key);
          edges.push({
            id: `circle_quad_${e.id}_${i}`,
            category: "lateral_wall",
            kind: "segment",
            paintDepth: 52 + screenDepthMetric(gen.pTop, 0.5 * (z0 + z1)),
            pts: [gen.pBase, gen.pTop],
            isQuadrantGeneratrix: true,
          });
        }
      }

      // 3.1 Contorno Superior Principal (Z = +h) em #F8FAFC / #FFFFFF nítido (1.7px contínuo)
      edges.push({
        id: `circle_top_${e.id}`,
        category: "top_primary",
        kind: "arc",
        paintDepth: 90 + z1 * 10,
        cx: decomp.topCircle.cx,
        cy: decomp.topCircle.cy,
        r: decomp.topCircle.r,
        a0: 0,
        a1: Math.PI * 2,
      });

      // Micro-pontos nos quadrantes da face superior
      for (const qPt of decomp.topQuadrantVertices) {
        pushVertexDot(qPt);
      }
      continue;
    }

    // CASO B: ELIPSE (Isocírculo em ISO 2D)
    if (e.type === "ellipse" && e.rx > 0 && e.ry > 0) {
      const rot = e.rotation ?? 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const baseCx = e.cx + entVec.baseOffset.x;
      const baseCy = e.cy + entVec.baseOffset.y;
      const topCx = e.cx + entVec.topOffset.x;
      const topCy = e.cy + entVec.topOffset.y;

      // 3.4 Base oculta tracejada
      if (style.showHiddenEdges) {
        edges.push({
          id: `ellipse_hid_${e.id}`,
          category: "hidden_back",
          kind: "ellipse_arc",
          paintDepth: 20 + z0 * 5,
          cx: baseCx,
          cy: baseCy,
          rx: e.rx,
          ry: e.ry,
          rotation: rot,
          a0: Math.PI,
          a1: Math.PI * 2,
        });
      }
      // 3.3 Base frontal visível
      edges.push({
        id: `ellipse_bot_vis_${e.id}`,
        category: "bottom_visible",
        kind: "ellipse_arc",
        paintDepth: 34 + z0 * 5,
        cx: baseCx,
        cy: baseCy,
        rx: e.rx,
        ry: e.ry,
        rotation: rot,
        a0: 0,
        a1: Math.PI,
      });

      // 3.2 Geratrizes tangentes da elipse
      const t1Base = { x: baseCx + e.rx * cosR, y: baseCy + e.rx * sinR };
      const t1Top = { x: topCx + e.rx * cosR, y: topCy + e.rx * sinR };
      const t2Base = { x: baseCx - e.rx * cosR, y: baseCy - e.rx * sinR };
      const t2Top = { x: topCx - e.rx * cosR, y: topCy - e.rx * sinR };
      edges.push(
        {
          id: `ellipse_sil1_${e.id}`,
          category: "lateral_wall",
          kind: "segment",
          paintDepth: 55,
          pts: [t1Base, t1Top],
        },
        {
          id: `ellipse_sil2_${e.id}`,
          category: "lateral_wall",
          kind: "segment",
          paintDepth: 55,
          pts: [t2Base, t2Top],
        },
      );

      // 3.1 Contorno superior principal (Z = +h)
      edges.push({
        id: `ellipse_top_${e.id}`,
        category: "top_primary",
        kind: "ellipse_arc",
        paintDepth: 90 + z1 * 10,
        cx: topCx,
        cy: topCy,
        rx: e.rx,
        ry: e.ry,
        rotation: rot,
        a0: 0,
        a1: Math.PI * 2,
      });

      pushVertexDot(t1Top);
      pushVertexDot(t2Top);
      pushVertexDot({ x: topCx - e.ry * sinR, y: topCy + e.ry * cosR });
      pushVertexDot({ x: topCx + e.ry * sinR, y: topCy - e.ry * cosR });
      continue;
    }

    // CASO C: ARCO CIRCULAR
    if (e.type === "arc" && e.r > 0) {
      let sweep = e.a1 - e.a0;
      while (sweep < 0) sweep += Math.PI * 2;
      const baseCx = e.cx + entVec.baseOffset.x;
      const baseCy = e.cy + entVec.baseOffset.y;
      const topCx = e.cx + entVec.topOffset.x;
      const topCy = e.cy + entVec.topOffset.y;

      edges.push({
        id: `arc_bot_${e.id}`,
        category: "bottom_visible",
        kind: "arc",
        paintDepth: 34 + z0 * 5,
        cx: baseCx,
        cy: baseCy,
        r: e.r,
        a0: e.a0,
        a1: e.a0 + sweep,
      });

      for (const ang of [e.a0, e.a0 + sweep]) {
        const pBase = { x: baseCx + e.r * Math.cos(ang), y: baseCy + e.r * Math.sin(ang) };
        const pTop = { x: topCx + e.r * Math.cos(ang), y: topCy + e.r * Math.sin(ang) };
        const key = canonicalSegmentKey(pBase, pTop);
        if (!seenLateralKeys.has(key)) {
          seenLateralKeys.add(key);
          edges.push({
            id: `arc_lat_${e.id}_${ang.toFixed(3)}`,
            category: "lateral_wall",
            kind: "segment",
            paintDepth: 55,
            pts: [pBase, pTop],
          });
        }
        pushVertexDot(pTop);
      }

      edges.push({
        id: `arc_top_${e.id}`,
        category: "top_primary",
        kind: "arc",
        paintDepth: 90 + z1 * 10,
        cx: topCx,
        cy: topCy,
        r: e.r,
        a0: e.a0,
        a1: e.a0 + sweep,
      });
      continue;
    }

    // CASO D: POLILINHA, LINHA OU PATH
    const rawPts: Vec2[] =
      e.type === "polyline"
        ? e.pts
        : e.type === "line"
          ? [
              { x: e.x1, y: e.y1 },
              { x: e.x2, y: e.y2 },
            ]
          : e.type === "path"
            ? samplePath(e.start, e.segs, !!e.closed, 14)
            : [];
    const isClosed =
      (e.type === "polyline" && !!e.closed) || (e.type === "path" && !!e.closed);

    if (rawPts.length >= 2) {
      const basePts = rawPts.map((p) => ({
        x: p.x + entVec.baseOffset.x,
        y: p.y + entVec.baseOffset.y,
      }));
      const topPts = rawPts.map((p) => ({
        x: p.x + entVec.topOffset.x,
        y: p.y + entVec.topOffset.y,
      }));

      const n = rawPts.length;
      const segLimit = isClosed ? n : n - 1;

      for (let i = 0; i < segLimit; i++) {
        const b0 = basePts[i]!;
        const b1 = basePts[(i + 1) % n]!;
        const t0 = topPts[i]!;
        const t1 = topPts[(i + 1) % n]!;

        // Classificação da aresta inferior (3.3 bottom_visible vs 3.4 hidden_back)
        const baseCat: WireframeEdgeCategory =
          isClosed && topPts.length >= 3
            ? classifyPolygonBaseEdgeVisibility(b0, b1, topPts, isHole)
            : "bottom_visible";

        const botKey = canonicalSegmentKey(b0, b1);
        if (!seenBottomKeys.has(botKey)) {
          if (baseCat === "bottom_visible" || style.showHiddenEdges) {
            seenBottomKeys.add(botKey);
            edges.push({
              id: `poly_base_${e.id}_${i}`,
              category: baseCat,
              kind: "segment",
              paintDepth:
                (baseCat === "hidden_back" ? 20 : 34) +
                screenDepthMetric(
                  { x: 0.5 * (b0.x + b1.x), y: 0.5 * (b0.y + b1.y) },
                  z0,
                ),
              pts: [b0, b1],
            });
          }
        }

        // Véu óptico de parede lateral visível
        if (style.showOpticalVeil && baseCat === "bottom_visible") {
          opticalFaces.push({
            id: `veil_wall_${e.id}_${i}`,
            role: isHole ? "hole_wall" : "outer_wall",
            paintDepth:
              (isHole ? 42 : 45) +
              screenDepthMetric({ x: 0.5 * (t0.x + t1.x), y: 0.5 * (t0.y + t1.y) }, 0.5 * (z0 + z1)),
            outerLoop: [b0, b1, t1, t0],
            holeLoops: [],
          });
        }

        // 3.1 Aresta Superior Principal (Z = +h) deduplicada
        const topKey = canonicalSegmentKey(t0, t1);
        if (!seenTopKeys.has(topKey)) {
          seenTopKeys.add(topKey);
          edges.push({
            id: `poly_top_${e.id}_${i}`,
            category: "top_primary",
            kind: "segment",
            paintDepth:
              90 +
              screenDepthMetric({ x: 0.5 * (t0.x + t1.x), y: 0.5 * (t0.y + t1.y) }, z1),
            pts: [t0, t1],
          });
        }
      }

      // 3.2 Arestas verticais/laterais (Z = 0 -> Z = +h) apenas em Quinas Vivas (Δθ >= 25°)
      // ou Linhas de Transição de Tangência (início/fim de dobra), nunca no interior de curvas suaves
      const cosSharpCorner = Math.cos((25 * Math.PI) / 180);
      const cosFlatWall = Math.cos((2.0 * Math.PI) / 180);
      const segDirs: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const pA = rawPts[i]!;
        const pB = rawPts[(i + 1) % n]!;
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const len = Math.hypot(dx, dy) || 1;
        segDirs.push({ x: dx / len, y: dy / len });
      }
      const isCurvedStrip = (idx: number): boolean => {
        if (!isClosed && (idx <= 0 || idx >= n - 1)) return false;
        const dPrev = segDirs[(idx - 1 + n) % n]!;
        const dCurr = segDirs[idx]!;
        const dNext = segDirs[(idx + 1) % n]!;
        const dotL = dPrev.x * dCurr.x + dPrev.y * dCurr.y;
        const dotR = dCurr.x * dNext.x + dCurr.y * dNext.y;
        return (
          (dotL < cosFlatWall && dotL >= cosSharpCorner) ||
          (dotR < cosFlatWall && dotR >= cosSharpCorner)
        );
      };

      for (let i = 0; i < n; i++) {
        if (isClosed && n >= 3) {
          const dPrev = segDirs[(i - 1 + n) % n]!;
          const dCurr = segDirs[i]!;
          const dotCorner = dPrev.x * dCurr.x + dPrev.y * dCurr.y;
          const isSharp = dotCorner < cosSharpCorner;
          const isTangentTransition =
            !isSharp && isCurvedStrip((i - 1 + n) % n) !== isCurvedStrip(i);
          if (!isSharp && !isTangentTransition) {
            continue;
          }
        }
        const bPt = basePts[i]!;
        const tPt = topPts[i]!;
        const latKey = canonicalSegmentKey(bPt, tPt);
        if (!seenLateralKeys.has(latKey)) {
          seenLateralKeys.add(latKey);
          edges.push({
            id: `poly_lat_${e.id}_${i}`,
            category: "lateral_wall",
            kind: "segment",
            paintDepth: 55 + screenDepthMetric(tPt, 0.5 * (z0 + z1)),
            pts: [bPt, tPt],
          });
        }
        if (rawPts.length <= 48) {
          pushVertexDot(tPt);
        }
      }

      // 3.5 Se a polilinha/linha for um Perfil Estrutural Tubular Oco (Metalão Quadrado / Retangular / Tubo),
      //     desenha as duas bocas ocas nas extremidades (s = -L/2 e s = +L/2) com espessura real `e`
      //     e as 4 arestas longitudinais internas da cavidade vazada!
      if (
        entSp &&
        (entSp.kind === "metalon_quadrado" ||
          entSp.kind === "metalon_retangular" ||
          entSp.kind === "tubo_redondo")
      ) {
        const barGeom = analyzeEntityBarGeometry(e);
        if (barGeom) {
          const B = Math.max(2, barGeom.drawnWidthB || entSp.widthB);
          const H = Math.max(2, effectiveThickness);
          const wallE = Math.max(0.8, Math.min(entSp.wallThicknessE || 2.0, Math.min(B, H) * 0.42));
          const halfL = barGeom.lengthL / 2;
          const halfInB = Math.max(0.5, B / 2 - wallE);
          const zLowRatio = Math.min(0.45, wallE / H);
          const zHighRatio = Math.max(0.55, (H - wallE) / H);

          const offsetAtZRatio = (ratio: number): Vec2 => ({
            x: entVec.baseOffset.x + (entVec.topOffset.x - entVec.baseOffset.x) * ratio,
            y: entVec.baseOffset.y + (entVec.topOffset.y - entVec.baseOffset.y) * ratio,
          });

          const offLow = offsetAtZRatio(zLowRatio);
          const offHigh = offsetAtZRatio(zHighRatio);

          const projectTubePt = (s: number, v: number, zOff: Vec2): Vec2 => ({
            x: barGeom.center.x + barGeom.axisU.x * s + barGeom.axisV.x * v + zOff.x,
            y: barGeom.center.y + barGeom.axisU.y * s + barGeom.axisV.y * v + zOff.y,
          });

          // Quatro cantos da cavidade interna na Boca Inicial (s = -halfL)
          const s0 = projectTubePt(-halfL, -halfInB, offLow);
          const s1 = projectTubePt(-halfL, +halfInB, offLow);
          const s2 = projectTubePt(-halfL, +halfInB, offHigh);
          const s3 = projectTubePt(-halfL, -halfInB, offHigh);

          // Quatro cantos da cavidade interna na Boca Final (s = +halfL)
          const f0 = projectTubePt(+halfL, -halfInB, offLow);
          const f1 = projectTubePt(+halfL, +halfInB, offLow);
          const f2 = projectTubePt(+halfL, +halfInB, offHigh);
          const f3 = projectTubePt(+halfL, -halfInB, offHigh);

          // Véu escuro da cavidade oca nas duas bocas do tubo para leitura imediata do furo passante
          if (style.showOpticalVeil) {
            opticalFaces.push(
              {
                id: `veil_tube_mouth_start_${e.id}`,
                role: "hole_wall",
                paintDepth: 86,
                outerLoop: [s0, s1, s2, s3],
                holeLoops: [],
              },
              {
                id: `veil_tube_mouth_end_${e.id}`,
                role: "hole_wall",
                paintDepth: 86,
                outerLoop: [f0, f1, f2, f3],
                holeLoops: [],
              },
            );
          }

          // Contorno interno visível das duas bocas ocas (mostrando a espessura da parede `e`)
          const mouthPairs: Array<[Vec2, Vec2, string, number]> = [
            [s0, s1, "s_bot", 88],
            [s1, s2, "s_rgt", 89],
            [s2, s3, "s_top", 92],
            [s3, s0, "s_lft", 89],
            [f0, f1, "f_bot", 88],
            [f1, f2, "f_rgt", 89],
            [f2, f3, "f_top", 92],
            [f3, f0, "f_lft", 89],
          ];
          for (const [pA, pB, tag, depth] of mouthPairs) {
            edges.push({
              id: `tube_mouth_${e.id}_${tag}`,
              category: tag.endsWith("top") ? "top_primary" : "lateral_wall",
              kind: "segment",
              paintDepth: depth,
              pts: [pA, pB],
            });
          }

          // 4 arestas longitudinais internas tracejadas ao longo do interior do tubo
          if (style.showHiddenEdges) {
            const innerLongPairs: Array<[Vec2, Vec2, string]> = [
              [s0, f0, "in_bl"],
              [s1, f1, "in_br"],
              [s2, f2, "in_tr"],
              [s3, f3, "in_tl"],
            ];
            for (const [pA, pB, tag] of innerLongPairs) {
              edges.push({
                id: `tube_inner_long_${e.id}_${tag}`,
                category: "hidden_back",
                kind: "segment",
                paintDepth: 48,
                pts: [pA, pB],
              });
            }
          }
        }
      }
    }
  }

  // Ordena faces e arestas estritamente por profundidade de pintura (Painter's Algorithm)
  opticalFaces.sort((a, b) => a.paintDepth - b.paintDepth);
  edges.sort((a, b) => a.paintDepth - b.paintDepth);

  const stats: Record<WireframeEdgeCategory, number> = {
    top_primary: 0,
    lateral_wall: 0,
    bottom_visible: 0,
    hidden_back: 0,
    center_axis: 0,
  };
  for (const edge of edges) {
    stats[edge.category]++;
  }

  return {
    extrusionVector: deltaExtrusion,
    opticalFaces,
    edges,
    topVertexDots,
    stats,
  };
}

/**
 * Renderiza a cena 3D classificada no contexto Canvas 2D seguindo rigorosamente a ordem de pintura:
 *   1. Véu da Base (Z = 0)
 *   2. Arestas Ocultas / Traseiras (Categoria 3.4: #53647B tracejado)
 *   3. Arestas Inferiores Visíveis (Categoria 3.3: #65758A contínuo)
 *   4. Véu das Paredes Laterais + Arestas Laterais / Geratrizes (Categoria 3.2: #91A3B8 contínuo)
 *   5. Véu da Face Superior (com recorte evenodd dos furos) + Face Superior Principal (Categoria 3.1: #F8FAFC 1.7px) + Micro-pontos (#FFFFFF)
 */
export function renderClassifiedWireframeSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  scene: ClassifiedWireframeScene3D,
  opts: {
    invScale: number;
    lod: boolean;
    isLight?: boolean;
    styleConfig?: Partial<ChamferWireframe3DStyleConfig>;
  },
): void {
  const inv = opts.invScale;
  const pal = opts.isLight ? CHAMFER_WIREFRAME_3D_PALETTE.light : CHAMFER_WIREFRAME_3D_PALETTE.dark;
  const style: ChamferWireframe3DStyleConfig = {
    ...DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
    ...(opts.styleConfig ?? {}),
  };

  const traceFacePath = (face: ClassifiedOpticalFace3D) => {
    ctx.beginPath();
    if (face.outerLoop.length >= 3) {
      ctx.moveTo(face.outerLoop[0]!.x, face.outerLoop[0]!.y);
      for (let i = 1; i < face.outerLoop.length; i++) {
        ctx.lineTo(face.outerLoop[i]!.x, face.outerLoop[i]!.y);
      }
      ctx.closePath();
    }
    for (const hole of face.holeLoops) {
      if (hole.length < 3) continue;
      ctx.moveTo(hole[0]!.x, hole[0]!.y);
      for (let i = 1; i < hole.length; i++) {
        ctx.lineTo(hole[i]!.x, hole[i]!.y);
      }
      ctx.closePath();
    }
  };

  const traceEdgeGeometry = (edge: ClassifiedEdgeSegment3D) => {
    ctx.beginPath();
    if (edge.kind === "segment" && edge.pts && edge.pts.length >= 2) {
      ctx.moveTo(edge.pts[0]!.x, edge.pts[0]!.y);
      ctx.lineTo(edge.pts[1]!.x, edge.pts[1]!.y);
    } else if (edge.kind === "polyline" && edge.pts && edge.pts.length >= 2) {
      ctx.moveTo(edge.pts[0]!.x, edge.pts[0]!.y);
      for (let i = 1; i < edge.pts.length; i++) {
        ctx.lineTo(edge.pts[i]!.x, edge.pts[i]!.y);
      }
      if (edge.closed) ctx.closePath();
    } else if (
      edge.kind === "arc" &&
      typeof edge.cx === "number" &&
      typeof edge.cy === "number" &&
      typeof edge.r === "number"
    ) {
      const a0 = edge.a0 ?? 0;
      const a1 = edge.a1 ?? Math.PI * 2;
      ctx.arc(edge.cx, edge.cy, edge.r, a0, a1);
    } else if (
      edge.kind === "ellipse_arc" &&
      typeof edge.cx === "number" &&
      typeof edge.cy === "number" &&
      typeof edge.rx === "number" &&
      typeof edge.ry === "number"
    ) {
      ctx.ellipse(
        edge.cx,
        edge.cy,
        edge.rx,
        edge.ry,
        edge.rotation ?? 0,
        edge.a0 ?? 0,
        edge.a1 ?? Math.PI * 2,
      );
    }
  };

  ctx.save();

  // CAMADA 1: Véu translúcido da Face Base (Z = 0)
  if (style.showOpticalVeil && !opts.lod) {
    for (const face of scene.opticalFaces) {
      if (face.role !== "base_veil") continue;
      traceFacePath(face);
      ctx.fillStyle = pal.bottomBaseVeil;
      ctx.fill("evenodd");
    }
  }

  // CAMADA 2: Arestas Ocultas / Traseiras (Categoria 3.4: #53647B @ 0.32, 0.8px, tracejado técnico)
  if (style.showHiddenEdges) {
    ctx.strokeStyle = pal.hiddenBackStroke;
    ctx.lineWidth = pal.hiddenBackWidthPx * inv;
    ctx.setLineDash(
      !opts.lod ? [pal.hiddenBackDashPx[0] * inv, pal.hiddenBackDashPx[1] * inv] : [],
    );
    for (const edge of scene.edges) {
      if (edge.category !== "hidden_back") continue;
      traceEdgeGeometry(edge);
      ctx.stroke();
    }
  }

  // CAMADA 3: Arestas Inferiores Visíveis (Categoria 3.3: #65758A @ 0.50, 1.0px, contínua)
  ctx.setLineDash([]);
  ctx.strokeStyle = pal.bottomVisibleStroke;
  ctx.lineWidth = pal.bottomVisibleWidthPx * inv;
  for (const edge of scene.edges) {
    if (edge.category !== "bottom_visible") continue;
    traceEdgeGeometry(edge);
    ctx.stroke();
  }

  // CAMADA 4A: Véu translúcido das Paredes Laterais e Paredes Internas de Furos
  if (style.showOpticalVeil && !opts.lod) {
    for (const face of scene.opticalFaces) {
      if (face.role !== "outer_wall" && face.role !== "hole_wall") continue;
      traceFacePath(face);
      ctx.fillStyle = face.role === "hole_wall" ? pal.holeInnerWallVeil : pal.outerWallVeil;
      ctx.fill("evenodd");
    }
  }

  // CAMADA 4B: Arestas Laterais / Verticais de Altura e Espessura e Geratrizes (Categoria 3.2: #91A3B8 @ 0.68, 1.1px)
  if (!opts.lod) {
    ctx.setLineDash([]);
    for (const edge of scene.edges) {
      if (edge.category !== "lateral_wall") continue;
      ctx.strokeStyle = edge.isQuadrantGeneratrix
        ? pal.lateralQuadrantStroke
        : pal.lateralWallStroke;
      ctx.lineWidth =
        (edge.isQuadrantGeneratrix ? pal.lateralQuadrantWidthPx : pal.lateralWallWidthPx) * inv;
      traceEdgeGeometry(edge);
      ctx.stroke();
    }
  }

  // CAMADA 5A: Véu translúcido da Face Superior (Z = +h) com recorte evenodd dos furos passantes
  if (style.showOpticalVeil) {
    for (const face of scene.opticalFaces) {
      if (face.role !== "top_veil" && face.role !== "stepped_top_veil") continue;
      traceFacePath(face);
      ctx.fillStyle =
        face.role === "stepped_top_veil" ? pal.steppedTopFaceVeil : pal.topFaceVeil;
      ctx.fill("evenodd");
    }
  }

  // CAMADA 5B: Linhas de Centro, Eixos de Simetria e Construção 3D (Categoria 3.5: #38BDF8 @ 0.38, traço-ponto)
  ctx.strokeStyle = pal.centerAxisStroke;
  ctx.lineWidth = pal.centerAxisWidthPx * inv;
  ctx.setLineDash(
    !opts.lod
      ? [
          pal.centerAxisDashPx[0] * inv,
          pal.centerAxisDashPx[1] * inv,
          pal.centerAxisDashPx[2] * inv,
          pal.centerAxisDashPx[3] * inv,
        ]
      : [],
  );
  for (const edge of scene.edges) {
    if (edge.category !== "center_axis") continue;
    traceEdgeGeometry(edge);
    ctx.stroke();
  }

  // CAMADA 5C: Face Superior / Frontal Principal (Categoria 3.1: #F8FAFC / #FFFFFF, 1.7px, contínua)
  ctx.setLineDash([]);
  ctx.strokeStyle = pal.topPrimaryStroke;
  ctx.lineWidth = pal.topPrimaryWidthPx * inv;
  for (const edge of scene.edges) {
    if (edge.category !== "top_primary") continue;
    traceEdgeGeometry(edge);
    ctx.stroke();
  }

  // CAMADA 5D: Micro-pontos de vértice (1.75px em #FFFFFF @ 0.92) na Face Superior
  if (style.showVertexDots && !opts.lod && scene.topVertexDots.length > 0) {
    const rDot = pal.vertexDotRadiusPx * inv;
    ctx.fillStyle = pal.vertexDotFill;
    ctx.beginPath();
    for (const pt of scene.topVertexDots) {
      ctx.moveTo(pt.x + rDot, pt.y);
      ctx.arc(pt.x, pt.y, rDot, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renderiza a Grade Base Orbital e Eixos no Plano Z = 0 (Camada 1 do Painter's Algorithm,
 * estritamente ABAIXO da peça 3D), incluindo:
 *  - Linhas ortogonais e diagonais suaves em rgba(83, 100, 123, 0.15) (0.75px)
 *  - Anéis orbitais concêntricos discretos centrados no pivô da peça no plano Z = 0
 */
export function renderBaseOrbitalGridToCanvas(
  _ctx: CanvasRenderingContext2D,
  _opts: {
    pivot: Vec2;
    gridStep: number;
    invScale: number;
    isLight?: boolean;
    pieceRadiusHint?: number;
  },
): void {
  // Grid 3D de chão desativado conforme especificação (peça 3D orbita sobre fundo limpo)
  return;
}

