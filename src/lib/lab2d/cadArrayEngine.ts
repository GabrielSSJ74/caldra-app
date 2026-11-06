/**
 * CALDRA / CHAMFER CAD — MOTOR GEOMÉTRICO INDUSTRIAL DE ARRAYS INTELIGENTES (MATRIZES 2D/3D)
 *
 * Suporte completo a:
 * - Detecção Topológica Real de Peça Hospedeira (Flange Concêntrico, Disco, Chapa Fechada via Ray-Casting)
 * - Níveis de Confiança Explícitos (ALTA, MÉDIA, BAIXA) com candidatos selecionáveis no canvas
 * - Padrão Linear / Retangular com os 4 Modos Matemáticos:
 *   1. Passo Fixo (fixed_step)
 *   2. Extensão Total (total_span)
 *   3. Adaptar à Peça / Auto-Fit (auto_fit)
 *   4. Preencher / Fill Automático (fill)
 * - Padrão Circular / Polar (PCD) em forma analítica fechada sem erro acumulado,
 *   suporte a arco parcial (N-1) vs círculo completo (N), centralização na aba do flange
 *   ([ ⌖ Centralizar na aba ]) e rotação rígida real de entidades não-circulares (slots, polígonos, grupos)
 * - Omissão individual de instâncias fantasma (skippedIndices com 1 toque)
 * - Diagnóstico físico em tempo real por instância (Fora da peça, Invade furo central, Colisão entre furos)
 * - Herança integral de metadados industriais (Furo Ø, Rosca M, Camada) e Reedição Associativa (arrayGroupId)
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import { uid, dist, rotate, translate, boxOf, pointInPoly, segmentsOf } from "@/lib/lab2d/core";

export const EPSILON = 1e-6;
export const CONCENTRIC_TOLERANCE_MM = 1e-3;
export const FLANGE_CENTERLINE_TOLERANCE_MM = 0.1;
export const MIN_LIGAMENT_MM = 1.5;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export type ArrayType = "linear" | "polar";

export type HostType = "flange" | "circular_plate" | "sheet" | "unknown";

export type HostConfidence = "high" | "medium" | "low";

export type HostConfidenceLabel = "ALTA" | "MÉDIA" | "BAIXA";

export type LinearDistributionMode = "fixed_step" | "total_span" | "auto_fit" | "fill";

export interface CandidateCenter {
  point: Vec2;
  label: string;
  source: "concentric_flange" | "circle_center" | "bounding_centroid" | "origin_ref";
  confidence: HostConfidence;
  rOuter?: number;
  rInner?: number;
}

export interface HostSheetBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  freeSpacePosX: number;
  freeSpaceNegX: number;
  freeSpacePosY: number;
  freeSpaceNegY: number;
  polygon?: Vec2[];
}

export interface HostDetectionResult {
  type: HostType;
  confidence: HostConfidence;
  confidenceLabel: HostConfidenceLabel;
  description: string;
  center?: Vec2;
  rInner?: number;
  rOuter?: number;
  radius?: number;
  pcd?: number;
  flangeMidRadius?: number;
  flangeMidPcd?: number;
  isOffFlangeCenterline?: boolean;
  flangeCenterlineOffsetMm?: number;
  suggestedType: ArrayType;
  sheetBounds?: HostSheetBounds;
  candidateCenters: CandidateCenter[];
  internalCutouts?: { center: Vec2; radius: number; id: string }[];
}

export type PolarLockedField = "count" | "pcd" | "radius" | "totalAngleDeg" | "startAngleDeg";
export type LinearLockedField =
  | "cols"
  | "rows"
  | "dx"
  | "dy"
  | "spanX"
  | "spanY"
  | "marginX"
  | "marginY"
  | "angleDeg";

export interface PolarArrayParams {
  center: Vec2;
  count: number;
  totalAngleDeg: number; // 360° para círculo completo; 0 < θ < 360 para arco parcial
  startAngleDeg: number; // ângulo inicial em graus (+X = 0°)
  clockwise?: boolean; // false = anti-horário (+1), true = horário (-1)
  rotateItems?: boolean; // padrão: true (gira orientação própria de slots/polígonos/grupos)
  includeOriginal?: boolean; // padrão: true (k=0 é a peça original)
  radius?: number; // PCD / 2
  repositionOriginalToPcd?: boolean; // true quando usuário aciona [ ⌖ Centralizar na aba ] ou altera PCD
  skippedIndices?: number[]; // índices k >= 1 omitidos pelo usuário no canvas
  lockedFields?: Partial<Record<PolarLockedField, boolean>>;
  autoTrim?: boolean; // [ ⚡ Auto-Trim / Unir Contorno ]
  includeAssembly?: boolean; // inclui automaticamente furos e geometrias internas conectadas
}

export interface LinearArrayParams {
  mode?: LinearDistributionMode; // "fixed_step" | "total_span" | "auto_fit" | "fill"
  modeX?: LinearDistributionMode;
  modeY?: LinearDistributionMode;
  rows: number; // N_y >= 1
  cols: number; // N_x >= 1
  dx: number; // passo X em mm (ou calculado automaticamente nos modos 2/3)
  dy: number; // passo Y em mm
  spanX?: number; // extensão total L_x (Modo 2: do 1º ao último centro)
  spanY?: number; // extensão total L_y (Modo 2: do 1º ao último centro)
  marginX?: number; // margem às bordas em X (Modos 3 e 4)
  marginY?: number; // margem às bordas em Y (Modos 3 e 4)
  dirX?: 1 | -1; // sentido no eixo X (+1 ou -1)
  dirY?: 1 | -1; // sentido no eixo Y (+1 ou -1)
  angleDeg?: number; // orientação angular do padrão (padrão: 0°)
  rotateItems?: boolean; // rotacionar itens junto com angleDeg
  includeOriginal?: boolean; // padrão: true
  skippedIndices?: number[]; // índices lineares k >= 1 omitidos pelo usuário
  lockedFields?: Partial<Record<LinearLockedField, boolean>>;
  autoTrim?: boolean; // [ ⚡ Auto-Trim / Unir Contorno ]
  includeAssembly?: boolean; // inclui automaticamente furos e geometrias internas conectadas
}

export interface ArraySpec {
  id: string;
  type: ArrayType;
  sourceEntityIds: string[];
  polar?: PolarArrayParams;
  linear?: LinearArrayParams;
  autoTrim?: boolean;
  includeAssembly?: boolean;
}

export type CollisionReasonBadge =
  | "Fora da peça"
  | "Invade furo central"
  | "Colisão entre furos"
  | "Margem estreita";

export interface SlotCollisionDiagnostic {
  index: number;
  status: "ok" | "warning" | "error";
  badge?: CollisionReasonBadge;
  message?: string;
}

export interface ArrayGhostSlot {
  index: number;
  row?: number;
  col?: number;
  center: Vec2;
  angleDeltaDeg: number;
  entities: Entity[];
  isOriginal: boolean;
  isSkipped: boolean;
}

export interface ArrayGuides {
  type: ArrayType;
  // Polar guides
  center?: Vec2;
  pcdCircle?: { cx: number; cy: number; r: number };
  radialLines?: { x1: number; y1: number; x2: number; y2: number; index: number; isSkipped?: boolean }[];
  clockwise?: boolean;
  // Linear guides
  gridBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  axes?: { x1: number; y1: number; x2: number; y2: number; axis: "x" | "y" }[];
}

export interface ComputeInstancesResult {
  instances: Entity[];
  repositionedOriginals?: Entity[];
  ghostSlots: ArrayGhostSlot[];
  guides: ArrayGuides;
  resolvedLinear?: {
    cols: number;
    rows: number;
    stepX: number;
    stepY: number;
    spanX: number;
    spanY: number;
    startOffsetX: number;
    startOffsetY: number;
  };
  resolvedPolar?: {
    count: number;
    stepAngleDeg: number;
    radius: number;
    pcd: number;
    startAngleDeg: number;
  };
}

export interface ArrayValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  minClearanceMm?: number;
  slotDiagnostics: Record<number, SlotCollisionDiagnostic>;
  collidingCount: number;
  activeCopiesCount: number;
  skippedCount: number;
  totalPositionsCount: number;
}

// -------------------------------------------------------------
// UTILITÁRIOS GEOMÉTRICOS AUXILIARES
// -------------------------------------------------------------

export function getEntityCenter(e: Entity): Vec2 {
  switch (e.type) {
    case "circle":
    case "arc":
      return { x: e.cx, y: e.cy };
    case "point":
      return { x: e.x, y: e.y };
    case "line":
      return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
    case "polyline": {
      if (e.pts.length === 0) return { x: 0, y: 0 };
      const b = boxOf(e);
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
    case "ellipse":
      return { x: e.cx, y: e.cy };
    default: {
      const b = boxOf(e);
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
  }
}

export function getGroupCenter(entities: Entity[]): Vec2 {
  if (entities.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const e of entities) {
    const b = boxOf(e);
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Estima o raio efetivo de ocupação da seleção (para checagem de inclusão, colisão e margem).
 */
export function getSelectionEffectiveRadius(sourceEntities: Entity[]): number {
  if (sourceEntities.length === 0) return 0;
  if (sourceEntities.length === 1 && sourceEntities[0]!.type === "circle") {
    return sourceEntities[0]!.r;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const e of sourceEntities) {
    const b = boxOf(e);
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.max(maxX - minX, maxY - minY) / 2;
}

export function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * Reconstrói polígonos fechados a partir de polilinhas fechadas ou cadeias de linhas conectadas.
 */
export function extractClosedPolygons(entities: Entity[]): { pts: Vec2[]; area: number; bounds: { minX: number; minY: number; maxX: number; maxY: number } }[] {
  const polygons: { pts: Vec2[]; area: number; bounds: { minX: number; minY: number; maxX: number; maxY: number } }[] = [];

  const computeSignedArea = (pts: Vec2[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]!;
      const p2 = pts[(i + 1) % pts.length]!;
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(a) / 2;
  };

  const computeBounds = (pts: Vec2[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  };

  // 1. Polilinhas fechadas diretas
  for (const e of entities) {
    if (e.layer === "construcao" || e.layer === "referencia" || e.layer === "cota") continue;
    if (e.type === "polyline" && e.closed && e.pts.length >= 3) {
      const area = computeSignedArea(e.pts);
      if (area > 1) {
        polygons.push({ pts: e.pts, area, bounds: computeBounds(e.pts) });
      }
    }
  }

  // 2. Cadeias fechadas de segmentos de linha (ex: retângulo formado por 4 linhas)
  const lines = entities.filter(
    (e): e is Extract<Entity, { type: "line" }> =>
      e.type === "line" &&
      e.layer !== "construcao" &&
      e.layer !== "referencia" &&
      e.layer !== "cota",
  );

  if (lines.length >= 3) {
    const used = new Set<string>();
    const tol = 0.05;

    for (const startLine of lines) {
      if (used.has(startLine.id)) continue;
      const chain: Vec2[] = [
        { x: startLine.x1, y: startLine.y1 },
        { x: startLine.x2, y: startLine.y2 },
      ];
      used.add(startLine.id);

      let closed = false;
      let progress = true;
      while (progress && !closed) {
        progress = false;
        const tail = chain[chain.length - 1]!;
        for (const cand of lines) {
          if (used.has(cand.id)) continue;
          const p1 = { x: cand.x1, y: cand.y1 };
          const p2 = { x: cand.x2, y: cand.y2 };
          if (dist(tail, p1) <= tol) {
            used.add(cand.id);
            if (dist(p2, chain[0]!) <= tol && chain.length >= 3) {
              closed = true;
            } else {
              chain.push(p2);
            }
            progress = true;
            break;
          } else if (dist(tail, p2) <= tol) {
            used.add(cand.id);
            if (dist(p1, chain[0]!) <= tol && chain.length >= 3) {
              closed = true;
            } else {
              chain.push(p1);
            }
            progress = true;
            break;
          }
        }
      }

      if (closed && chain.length >= 3) {
        const area = computeSignedArea(chain);
        if (area > 1) {
          polygons.push({ pts: chain, area, bounds: computeBounds(chain) });
        }
      }
    }
  }

  return polygons.sort((a, b) => b.area - a.area);
}

/**
 * Distância mínima de um ponto P a qualquer aresta de um polígono fechado.
 */
export function minDistanceToPolygonEdges(p: Vec2, poly: Vec2[]): number {
  if (poly.length < 2) return Infinity;
  let minD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let proj = a;
    if (l2 > 1e-12) {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      proj = { x: a.x + t * dx, y: a.y + t * dy };
    }
    const d = dist(p, proj);
    if (d < minD) minD = d;
  }
  return minD;
}

// -------------------------------------------------------------
// 1. DETECÇÃO TOPOLÓGICA REAL DA PEÇA HOSPEDEIRA
// -------------------------------------------------------------

/**
 * Analisa matematicamente as entidades do projeto e identifica a peça hospedeira:
 * - Flange (Coroa Circular): Pares concêntricos ||C_ext - C_int|| < 1e-3 mm (ou até 0.5 mm)
 *   onde R_int + r_f <= d(C, P_f) <= R_ext - r_f.
 * - Disco Circular: Círculo externo que engloba fisicamente o furo.
 * - Chapa / Contorno Fechado: Polígono fechado testado via Ray-Casting (pointInPoly)
 *   com cálculo exato de espaço livre interno (+X, -X, +Y, -Y).
 * - Níveis de Confiança: ALTA (high), MÉDIA (medium), BAIXA (low).
 */
export function detectHostTopology(
  allEntities: Entity[],
  sourceEntities: Entity[],
  projectOrigin: Vec2 = { x: 0, y: 0 },
): HostDetectionResult {
  const candidateCenters: CandidateCenter[] = [];

  if (sourceEntities.length === 0) {
    return {
      type: "unknown",
      confidence: "low",
      confidenceLabel: "BAIXA",
      description: "Nenhuma entidade selecionada para análise.",
      suggestedType: "polar",
      candidateCenters: [],
    };
  }

  const sourceCenter = getGroupCenter(sourceEntities);
  const holeRadius = getSelectionEffectiveRadius(sourceEntities);
  const sourceIds = new Set(sourceEntities.map((e) => e.id));

  // Coleta todas as circunferências e arcos do desenho que NÃO fazem parte da seleção
  const otherCircles = allEntities.filter(
    (e) =>
      (e.type === "circle" || e.type === "arc") &&
      !sourceIds.has(e.id) &&
      e.layer !== "construcao" &&
      e.layer !== "referencia" &&
      e.layer !== "cota",
  ) as ((Entity & { type: "circle" }) | (Entity & { type: "arc" }))[];

  // 1. Procura por pares concêntricos (Flange: furo central + borda externa)
  const concentricPairs: {
    cInner: Entity & { type: "circle" | "arc" };
    cOuter: Entity & { type: "circle" | "arc" };
    center: Vec2;
    rInner: number;
    rOuter: number;
    exactConcentric: boolean;
  }[] = [];

  for (let i = 0; i < otherCircles.length; i++) {
    for (let j = i + 1; j < otherCircles.length; j++) {
      const c1 = otherCircles[i]!;
      const c2 = otherCircles[j]!;
      const dCenters = dist({ x: c1.cx, y: c1.cy }, { x: c2.cx, y: c2.cy });
      if (dCenters <= 0.5) {
        const r1 = c1.r;
        const r2 = c2.r;
        if (Math.abs(r1 - r2) > 1.0) {
          const rInner = Math.min(r1, r2);
          const rOuter = Math.max(r1, r2);
          const cInner = r1 < r2 ? c1 : c2;
          const cOuter = r1 < r2 ? c2 : c1;
          concentricPairs.push({
            cInner,
            cOuter,
            center: { x: (c1.cx + c2.cx) / 2, y: (c1.cy + c2.cy) / 2 },
            rInner,
            rOuter,
            exactConcentric: dCenters <= CONCENTRIC_TOLERANCE_MM,
          });
        }
      }
    }
  }

  // Ordena priorizando pares estritamente concêntricos (||C_ext - C_int|| < 1e-3 mm)
  concentricPairs.sort((a, b) => Number(b.exactConcentric) - Number(a.exactConcentric));

  // Filtra os pares concêntricos cuja coroa circular contém fisicamente o furo,
  // ou cujo contorno externo engloba o furo (para diagnosticar invasão do furo central)
  let matchingFlanges = concentricPairs.filter((pair) => {
    const dToCenter = dist(pair.center, sourceCenter);
    return (
      dToCenter >= pair.rInner + holeRadius - EPSILON &&
      dToCenter <= pair.rOuter - holeRadius + EPSILON
    );
  });
  if (matchingFlanges.length === 0 && concentricPairs.length > 0) {
    matchingFlanges = concentricPairs.filter((pair) => {
      const dToCenter = dist(pair.center, sourceCenter);
      return dToCenter > EPSILON && dToCenter <= pair.rOuter - holeRadius + EPSILON;
    });
  }

  // Coleta também todos os centros de círculos que englobam o furo para avaliação de ambiguidade
  const enclosingCircles = otherCircles
    .filter((c) => {
      const d = dist({ x: c.cx, y: c.cy }, sourceCenter);
      return d + holeRadius <= c.r + EPSILON && c.r > holeRadius * 1.5;
    })
    .sort((a, b) => b.r - a.r);

  if (matchingFlanges.length > 0) {
    const primaryFlange = matchingFlanges[0]!;
    const dToCenter = dist(primaryFlange.center, sourceCenter);
    const flangeMidRadius = (primaryFlange.rOuter + primaryFlange.rInner) / 2;
    const flangeMidPcd = flangeMidRadius * 2;
    const flangeCenterlineOffsetMm = Math.abs(dToCenter - flangeMidRadius);
    const isOffFlangeCenterline = flangeCenterlineOffsetMm > FLANGE_CENTERLINE_TOLERANCE_MM;

    // Adiciona centros candidatos
    for (const pair of matchingFlanges) {
      candidateCenters.push({
        point: pair.center,
        label: `Centro do Flange (Øext ${(pair.rOuter * 2).toFixed(1)} / Øint ${(pair.rInner * 2).toFixed(1)} mm)`,
        source: "concentric_flange",
        confidence: "high",
        rOuter: pair.rOuter,
        rInner: pair.rInner,
      });
    }

    // Se houver outros círculos não-concêntricos que também englobam o furo, adiciona como candidatos e reduz confiança para MÉDIA
    for (const enc of enclosingCircles) {
      const alreadyAdded = candidateCenters.some(
        (cc) => dist(cc.point, { x: enc.cx, y: enc.cy }) <= 0.5,
      );
      if (!alreadyAdded) {
        candidateCenters.push({
          point: { x: enc.cx, y: enc.cy },
          label: `Centro de Círculo (Ø ${(enc.r * 2).toFixed(1)} mm)`,
          source: "circle_center",
          confidence: "medium",
          rOuter: enc.r,
        });
      }
    }

    const isUnambiguous = candidateCenters.length === 1;
    const confidence: HostConfidence = isUnambiguous ? "high" : "medium";
    const confidenceLabel: HostConfidenceLabel = isUnambiguous ? "ALTA" : "MÉDIA";

    return {
      type: "flange",
      confidence,
      confidenceLabel,
      description: `Centro do flange detectado · Øext ${(primaryFlange.rOuter * 2).toFixed(0)} / Øint ${(primaryFlange.rInner * 2).toFixed(0)} mm`,
      center: primaryFlange.center,
      rInner: primaryFlange.rInner,
      rOuter: primaryFlange.rOuter,
      radius: primaryFlange.rOuter,
      pcd: dToCenter * 2,
      flangeMidRadius,
      flangeMidPcd,
      isOffFlangeCenterline,
      flangeCenterlineOffsetMm,
      suggestedType: "polar",
      candidateCenters,
    };
  }

  // 2. Procura por contornos fechados de chapa (polilinhas fechadas ou malha de 4+ linhas) via Ray-Casting
  const nonSourceEntities = allEntities.filter((e) => !sourceIds.has(e.id));
  const closedPolygons = extractClosedPolygons(nonSourceEntities);
  const enclosingPolygons = closedPolygons.filter((poly) =>
    pointInPoly(sourceCenter, poly.pts),
  );

  // 3. Se houver círculos englobantes (ex: disco circular ou múltiplos círculos candidatos)
  if (enclosingCircles.length > 0 && enclosingPolygons.length === 0) {
    for (const c of enclosingCircles) {
      const already = candidateCenters.some(
        (cc) => dist(cc.point, { x: c.cx, y: c.cy }) <= 0.5,
      );
      if (!already) {
        candidateCenters.push({
          point: { x: c.cx, y: c.cy },
          label: `Centro do Disco (Ø ${(c.r * 2).toFixed(1)} mm)`,
          source: "circle_center",
          confidence: enclosingCircles.length === 1 ? "high" : "medium",
          rOuter: c.r,
        });
      }
    }

    const mainCircle = enclosingCircles[0]!;
    const dToCenter = dist({ x: mainCircle.cx, y: mainCircle.cy }, sourceCenter);
    const confidence: HostConfidence = "medium";
    const confidenceLabel: HostConfidenceLabel = "MÉDIA";

    // Identifica furos internos existentes dentro do disco (exceto o próprio círculo externo)
    const internalCutouts = otherCircles
      .filter((c) => c.id !== mainCircle.id && dist({ x: mainCircle.cx, y: mainCircle.cy }, { x: c.cx, y: c.cy }) + c.r < mainCircle.r)
      .map((c) => ({ center: { x: c.cx, y: c.cy }, radius: c.r, id: c.id }));

    return {
      type: "circular_plate",
      confidence,
      confidenceLabel,
      description: `Disco circular detectado · Ø ${(mainCircle.r * 2).toFixed(0)} mm`,
      center: { x: mainCircle.cx, y: mainCircle.cy },
      rOuter: mainCircle.r,
      radius: mainCircle.r,
      pcd: dToCenter * 2,
      suggestedType: "polar",
      candidateCenters,
      internalCutouts,
    };
  }

  // 4. Se o furo estiver dentro de um polígono fechado (Chapa Metálica) via Ray-Casting
  if (enclosingPolygons.length > 0) {
    // O contorno externo da chapa é o maior polígono fechado que contém o furo
    const outerPoly = enclosingPolygons[0]!;
    const { minX, minY, maxX, maxY } = outerPoly.bounds;
    const width = maxX - minX;
    const height = maxY - minY;
    const centroid: Vec2 = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    // Círculos candidatos relevantes (cubos/furos maiores que o furo selecionado) ordenados por proximidade ao furo
    const relevantHubCircles = otherCircles
      .filter((c) => c.r > holeRadius * 1.2)
      .sort(
        (a, b) =>
          dist({ x: a.cx, y: a.cy }, sourceCenter) - dist({ x: b.cx, y: b.cy }, sourceCenter),
      );

    for (const c of relevantHubCircles) {
      const already = candidateCenters.some(
        (cc) => dist(cc.point, { x: c.cx, y: c.cy }) <= 0.5,
      );
      if (!already) {
        candidateCenters.push({
          point: { x: c.cx, y: c.cy },
          label: `Centro de Círculo (Ø ${(c.r * 2).toFixed(1)} mm)`,
          source: "circle_center",
          confidence: "medium",
          rOuter: c.r,
        });
      }
    }

    candidateCenters.push({
      point: centroid,
      label: `Centro da Chapa (${width.toFixed(0)} × ${height.toFixed(0)} mm)`,
      source: "bounding_centroid",
      confidence: relevantHubCircles.length === 0 ? "high" : "medium",
    });

    candidateCenters.push({
      point: projectOrigin,
      label: "Origem REF (0,0)",
      source: "origin_ref",
      confidence: "low",
    });

    const internalCutouts = otherCircles
      .filter((c) => pointInPoly({ x: c.cx, y: c.cy }, outerPoly.pts))
      .map((c) => ({ center: { x: c.cx, y: c.cy }, radius: c.r, id: c.id }));

    const hasAmbiguousCircles = relevantHubCircles.length >= 1;
    const confidence: HostConfidence = !hasAmbiguousCircles ? "high" : "medium";
    const confidenceLabel: HostConfidenceLabel = confidence === "high" ? "ALTA" : "MÉDIA";

    return {
      type: "sheet",
      confidence,
      confidenceLabel,
      description: hasAmbiguousCircles
        ? `Chapa com ${relevantHubCircles.length} centro(s) circular(es) candidato(s)`
        : `Chapa detectada · ${width.toFixed(0)} × ${height.toFixed(0)} mm`,
      center: candidateCenters[0]?.point ?? centroid,
      suggestedType: hasAmbiguousCircles ? "polar" : "linear",
      sheetBounds: {
        minX,
        minY,
        maxX,
        maxY,
        width,
        height,
        freeSpacePosX: Math.max(0, maxX - sourceCenter.x),
        freeSpaceNegX: Math.max(0, sourceCenter.x - minX),
        freeSpacePosY: Math.max(0, maxY - sourceCenter.y),
        freeSpaceNegY: Math.max(0, sourceCenter.y - minY),
        polygon: outerPoly.pts,
      },
      candidateCenters,
      internalCutouts,
    };
  }

  // 5. Caso haja outros círculos no desenho (mesmo que não englobem o furo), oferece como candidatos de confiança MÉDIA
  if (otherCircles.length > 0) {
    for (const c of otherCircles.slice(0, 6)) {
      const already = candidateCenters.some(
        (cc) => dist(cc.point, { x: c.cx, y: c.cy }) <= 0.5,
      );
      if (!already) {
        candidateCenters.push({
          point: { x: c.cx, y: c.cy },
          label: `Centro Ø ${(c.r * 2).toFixed(1)} mm (${c.cx.toFixed(0)}, ${c.cy.toFixed(0)})`,
          source: "circle_center",
          confidence: "medium",
          rOuter: c.r,
        });
      }
    }
  }

  candidateCenters.push({
    point: projectOrigin,
    label: "Origem REF (0,0)",
    source: "origin_ref",
    confidence: "low",
  });

  if (candidateCenters.length > 1) {
    return {
      type: "unknown",
      confidence: "medium",
      confidenceLabel: "MÉDIA",
      description: "Múltiplos centros candidatos · Toque em um centro no canvas",
      center: candidateCenters[0]!.point,
      suggestedType: "polar",
      candidateCenters,
    };
  }

  // 6. Confiança BAIXA: peça isolada sem hospedeiro detectado
  return {
    type: "unknown",
    confidence: "low",
    confidenceLabel: "BAIXA",
    description: "Sem hospedeiro detectado · Defina centro ou direção",
    suggestedType: "linear",
    candidateCenters,
  };
}

/** Alias de compatibilidade com chamadas existentes */
export const detectHostPart = detectHostTopology;

// -------------------------------------------------------------
// 2. RESOLUÇÃO MATEMÁTICA DOS 4 MODOS LINEARES
// -------------------------------------------------------------

export interface LinearAxisResolutionInput {
  mode: LinearDistributionMode;
  count: number; // N >= 1
  step: number; // passo em mm (pode ter sinal ou usar dir)
  span?: number; // extensão total L (Modo 2)
  margin?: number; // margem às bordas (Modos 3 e 4)
  dir?: 1 | -1; // sentido (+1 ou -1)
  sourceCoord?: number; // x0 ou y0
  baseCoord?: number; // alias para sourceCoord
  hostMin?: number; // borda inicial da peça hospedeira
  hostMax?: number; // borda final da peça hospedeira
}

export interface LinearAxisResolutionResult {
  count: number;
  step: number; // passo assinado (dir * |passo|)
  absStep: number;
  span: number; // distância entre a 1ª e a última instância
  startCoord: number; // coordenada da instância k=0
  startOffset: number; // deslocamento da instância k=0 em relação a sourceCoord
  positions: number[]; // coordenadas absolutas para k = 0 ... count-1
}

/**
 * Resolve analiticamente as posições de um eixo linear segundo um dos 4 modos:
 * 1. "fixed_step": pos_k = x0 + k * s * |passo|
 * 2. "total_span": passo = L / (N - 1), pos_k = x0 + k * s * passo
 * 3. "auto_fit": passo = (L_livre - 2 * margem) / (N - 1), 1ª instância em hostMin + margem
 * 4. "fill": N = floor((L_livre - 2 * margem) / |passo|) + 1, 1ª instância em hostMin + margem
 */
export function resolveLinearAxisDistribution(
  input: LinearAxisResolutionInput,
): LinearAxisResolutionResult {
  const srcCoord = input.sourceCoord ?? input.baseCoord ?? 0;
  const rawCount = Math.max(1, Math.round(input.count || 1));
  const sign: 1 | -1 = input.dir ?? (input.step < 0 ? -1 : 1);
  const absInputStep = Math.abs(input.step);
  const hasHost =
    typeof input.hostMin === "number" &&
    typeof input.hostMax === "number" &&
    Number.isFinite(input.hostMin) &&
    Number.isFinite(input.hostMax) &&
    input.hostMax > input.hostMin;
  const hostLength = hasHost ? input.hostMax! - input.hostMin! : 0;
  const margin = Math.max(0, input.margin ?? 0);

  if (rawCount === 1 && input.mode !== "fill") {
    return {
      count: 1,
      step: 0,
      absStep: 0,
      span: 0,
      startCoord: srcCoord,
      startOffset: 0,
      positions: [srcCoord],
    };
  }

  switch (input.mode) {
    case "total_span": {
      const span = Math.max(0, input.span ?? absInputStep * Math.max(1, rawCount - 1));
      const absStep = rawCount > 1 ? span / (rawCount - 1) : 0;
      const signedStep = sign * absStep;
      const positions = Array.from(
        { length: rawCount },
        (_, k) => srcCoord + k * signedStep,
      );
      return {
        count: rawCount,
        step: signedStep,
        absStep,
        span,
        startCoord: srcCoord,
        startOffset: 0,
        positions,
      };
    }

    case "auto_fit": {
      const usableLength = hasHost
        ? Math.max(0, hostLength - 2 * margin)
        : Math.max(0, (input.span ?? absInputStep * Math.max(1, rawCount - 1)));
      const absStep = rawCount > 1 ? usableLength / (rawCount - 1) : 0;
      const startCoord = hasHost
        ? sign >= 0
          ? input.hostMin! + margin
          : input.hostMax! - margin
        : srcCoord;
      const signedStep = sign * absStep;
      const positions = Array.from(
        { length: rawCount },
        (_, k) => startCoord + k * signedStep,
      );
      return {
        count: rawCount,
        step: signedStep,
        absStep,
        span: usableLength,
        startCoord,
        startOffset: startCoord - srcCoord,
        positions,
      };
    }

    case "fill": {
      const safeAbsStep = absInputStep > EPSILON ? absInputStep : 10;
      const usableLength = hasHost
        ? Math.max(0, hostLength - 2 * margin)
        : Math.max(0, input.span ?? safeAbsStep * Math.max(0, rawCount - 1));
      const computedCount =
        usableLength >= 0 ? Math.max(1, Math.floor((usableLength + EPSILON) / safeAbsStep) + 1) : 1;
      const startCoord = hasHost
        ? sign >= 0
          ? input.hostMin! + margin
          : input.hostMax! - margin
        : srcCoord;
      const signedStep = sign * safeAbsStep;
      const positions = Array.from(
        { length: computedCount },
        (_, k) => startCoord + k * signedStep,
      );
      return {
        count: computedCount,
        step: signedStep,
        absStep: safeAbsStep,
        span: (computedCount - 1) * safeAbsStep,
        startCoord,
        startOffset: startCoord - srcCoord,
        positions,
      };
    }

    case "fixed_step":
    default: {
      const signedStep = sign * absInputStep;
      const span = (rawCount - 1) * absInputStep;
      const positions = Array.from(
        { length: rawCount },
        (_, k) => srcCoord + k * signedStep,
      );
      return {
        count: rawCount,
        step: signedStep,
        absStep: absInputStep,
        span,
        startCoord: srcCoord,
        startOffset: 0,
        positions,
      };
    }
  }
}

// -------------------------------------------------------------
// 3. CÁLCULO DE INSTÂNCIAS (NÚCLEO ANALÍTICO FECHADO)
// -------------------------------------------------------------

/**
 * Clona os metadados industriais da entidade original e injeta o vínculo associativo do Array.
 */
function buildArrayInstanceEntity(
  transformed: Entity,
  orig: Entity,
  spec: ArraySpec,
  specId: string,
  meta: {
    arrayIndex: number;
    arrayRow?: number;
    arrayCol?: number;
    isOriginal?: boolean;
    slotGroupId?: string;
  },
): Entity {
  const clonedCnc = orig.cnc ? { ...orig.cnc } : undefined;
  const serializedSpec: ArraySpec = {
    id: specId,
    type: spec.type,
    sourceEntityIds: [...spec.sourceEntityIds],
    polar: spec.polar ? { ...spec.polar, center: { ...spec.polar.center } } : undefined,
    linear: spec.linear ? { ...spec.linear } : undefined,
  };

  return {
    ...transformed,
    id: meta.isOriginal ? orig.id : uid(),
    layer: orig.layer,
    group: meta.slotGroupId ?? orig.group,
    cnc: clonedCnc,
    isConstruction: orig.isConstruction,
    params: {
      ...(orig.params ? { ...orig.params } : {}),
      ...(transformed.params ? { ...transformed.params } : {}),
      arrayGroupId: specId,
      arrayPatternId: specId,
      arrayType: spec.type,
      arrayIndex: meta.arrayIndex,
      arrayRow: meta.arrayRow,
      arrayCol: meta.arrayCol,
      isArrayInstance: !meta.isOriginal,
      arraySpec: serializedSpec,
    },
  };
}

/**
 * Calcula todas as instâncias resultantes da matriz especificada (Polar ou Linear).
 * Utiliza fórmulas analíticas fechadas sem erro acumulado.
 */
export function computeInstances(
  spec: ArraySpec,
  sourceEntities: Entity[],
  host?: HostDetectionResult,
): ComputeInstancesResult {
  if (sourceEntities.length === 0) {
    return {
      instances: [],
      ghostSlots: [],
      guides: { type: spec.type },
    };
  }

  const specId = spec.id || uid();
  const baseCenter = getGroupCenter(sourceEntities);

  if (spec.type === "polar") {
    const params = spec.polar;
    if (!params) {
      return { instances: [], ghostSlots: [], guides: { type: "polar" } };
    }

    const count = Math.max(1, Math.round(params.count));
    const totalAngleDeg = Math.abs(params.totalAngleDeg ?? 360);
    const isFullCircle = Math.abs(totalAngleDeg - 360) < 1e-4;
    // Regra crítica Seção 1.3:
    // Círculo completo (360°): Δθ = 360° / N (nunca sobrepõe a última cópia sobre k=0)
    // Arco parcial (0° < θ < 360°, N >= 2): Δθ = θ / (N - 1) (inclui ambas as extremidades)
    const stepDeg = isFullCircle
      ? 360 / count
      : count > 1
        ? totalAngleDeg / (count - 1)
        : 0;

    const dir = params.clockwise ? -1 : 1;
    const rotateItems = params.rotateItems ?? true;
    const includeOriginal = params.includeOriginal ?? true;
    const center = params.center;
    const skippedSet = new Set((params.skippedIndices ?? []).filter((idx) => idx >= 1));

    const naturalRadius = dist(center, baseCenter);
    const targetRadius =
      typeof params.radius === "number" && Number.isFinite(params.radius) && params.radius >= 0
        ? params.radius
        : naturalRadius;

    // Ângulo inicial: se o usuário especificou startAngleDeg diferente do natural ou se naturalRadius > 0
    const naturalStartAngleRad =
      naturalRadius > EPSILON
        ? Math.atan2(baseCenter.y - center.y, baseCenter.x - center.x)
        : (params.startAngleDeg ?? 0) * DEG_TO_RAD;
    const startAngleDeg =
      typeof params.startAngleDeg === "number" && Number.isFinite(params.startAngleDeg)
        ? params.startAngleDeg
        : naturalStartAngleRad * RAD_TO_DEG;
    const startAngleRad = startAngleDeg * DEG_TO_RAD;

    // Posição base de k=0 sobre o círculo PCD de raio `targetRadius` e ângulo `startAngleRad`
    const k0Center: Vec2 = {
      x: center.x + targetRadius * Math.cos(startAngleRad),
      y: center.y + targetRadius * Math.sin(startAngleRad),
    };
    const radialShiftX = k0Center.x - baseCenter.x;
    const radialShiftY = k0Center.y - baseCenter.y;
    const isOriginalRepositioned =
      Math.hypot(radialShiftX, radialShiftY) > 1e-3 || Boolean(params.repositionOriginalToPcd);

    // Entidades base posicionadas em k=0 no raio alvo
    const k0Entities = sourceEntities.map((orig) =>
      Math.hypot(radialShiftX, radialShiftY) > EPSILON
        ? translate(orig, radialShiftX, radialShiftY)
        : orig,
    );

    const instances: Entity[] = [];
    const repositionedOriginals: Entity[] = [];
    const ghostSlots: ArrayGhostSlot[] = [];
    const radialLines: { x1: number; y1: number; x2: number; y2: number; index: number; isSkipped?: boolean }[] = [];

    for (let k = 0; k < count; k++) {
      // Fórmula fechada sem erro acumulado: θ_k = θ_início + s · k · Δθ
      const currentAngleDeltaDeg = dir * k * stepDeg;
      const currentAngleDeltaRad = currentAngleDeltaDeg * DEG_TO_RAD;
      const thetaKRad = startAngleRad + currentAngleDeltaRad;

      const targetCenterX = center.x + targetRadius * Math.cos(thetaKRad);
      const targetCenterY = center.y + targetRadius * Math.sin(thetaKRad);
      const isSkipped = k >= 1 && skippedSet.has(k);

      radialLines.push({
        x1: center.x,
        y1: center.y,
        x2: targetCenterX,
        y2: targetCenterY,
        index: k,
        isSkipped,
      });

      if (k === 0 && includeOriginal) {
        const origTagged = k0Entities.map((e, idx) =>
          buildArrayInstanceEntity(e, sourceEntities[idx]!, spec, specId, {
            arrayIndex: 0,
            isOriginal: true,
          }),
        );
        repositionedOriginals.push(...origTagged);
        ghostSlots.push({
          index: 0,
          center: k0Center,
          angleDeltaDeg: 0,
          entities: origTagged,
          isOriginal: true,
          isSkipped: false,
        });
        continue;
      }

      const cosDelta = Math.cos(currentAngleDeltaRad);
      const sinDelta = Math.sin(currentAngleDeltaRad);
      const slotGroupId = sourceEntities.length > 1 ? `${specId}-slot-${k}` : undefined;

      const slotEntities: Entity[] = k0Entities.map((k0Ent, idx) => {
        const orig = sourceEntities[idx]!;
        let transformed: Entity;

        if (rotateItems) {
          // Rotação de corpo rígido em torno de (Cx, Cy): gira posição e orientação interna
          transformed = rotate(k0Ent, center, currentAngleDeltaDeg);
        } else {
          // Rotaciona o centro do item em torno de (Cx, Cy), preservando a orientação interna original
          const entCenter = getEntityCenter(k0Ent);
          const newEntCenterX =
            center.x + (entCenter.x - center.x) * cosDelta - (entCenter.y - center.y) * sinDelta;
          const newEntCenterY =
            center.y + (entCenter.x - center.x) * sinDelta + (entCenter.y - center.y) * cosDelta;
          transformed = translate(k0Ent, newEntCenterX - entCenter.x, newEntCenterY - entCenter.y);
        }

        return buildArrayInstanceEntity(transformed, orig, spec, specId, {
          arrayIndex: k,
          isOriginal: false,
          slotGroupId,
        });
      });

      ghostSlots.push({
        index: k,
        center: { x: targetCenterX, y: targetCenterY },
        angleDeltaDeg: currentAngleDeltaDeg,
        entities: slotEntities,
        isOriginal: false,
        isSkipped,
      });

      if (!isSkipped) {
        instances.push(...slotEntities);
      }
    }

    const guides: ArrayGuides = {
      type: "polar",
      center,
      pcdCircle: {
        cx: center.x,
        cy: center.y,
        r: targetRadius,
      },
      radialLines,
      clockwise: Boolean(params.clockwise),
    };

    return {
      instances,
      repositionedOriginals: isOriginalRepositioned ? repositionedOriginals : undefined,
      ghostSlots,
      guides,
      resolvedPolar: {
        count,
        stepAngleDeg: stepDeg,
        radius: targetRadius,
        pcd: targetRadius * 2,
        startAngleDeg,
      },
    };
  }

  // -----------------------------------------------------------
  // PADRÃO LINEAR / RETANGULAR (4 MODOS MATEMÁTICOS)
  // -----------------------------------------------------------
  const params = spec.linear;
  if (!params) {
    return { instances: [], ghostSlots: [], guides: { type: "linear" } };
  }

  const modeX: LinearDistributionMode = params.modeX ?? params.mode ?? "fixed_step";
  const modeY: LinearDistributionMode =
    params.rows > 1 ? (params.modeY ?? params.mode ?? modeX) : "fixed_step";
  const angleDeg = params.angleDeg ?? 0;
  const angleRad = angleDeg * DEG_TO_RAD;
  const cosAng = Math.cos(angleRad);
  const sinAng = Math.sin(angleRad);
  const includeOriginal = params.includeOriginal ?? true;
  const skippedSet = new Set((params.skippedIndices ?? []).filter((idx) => idx >= 1));

  // Resolve eixo X (primário) e eixo Y (secundário) usando os 4 modos matemáticos
  const resolvedX = resolveLinearAxisDistribution({
    mode: modeX,
    count: params.cols,
    step: params.dx,
    span: params.spanX,
    margin: params.marginX,
    dir: params.dirX,
    sourceCoord: baseCenter.x,
    hostMin: host?.sheetBounds?.minX,
    hostMax: host?.sheetBounds?.maxX,
  });

  const resolvedY = resolveLinearAxisDistribution({
    mode: modeY,
    count: params.rows,
    step: params.dy,
    span: params.spanY,
    margin: params.marginY ?? params.marginX,
    dir: params.dirY,
    sourceCoord: baseCenter.y,
    hostMin: host?.sheetBounds?.minY,
    hostMax: host?.sheetBounds?.maxY,
  });

  const cols = resolvedX.count;
  const rows = resolvedY.count;

  const startOffsetX = resolvedX.startCoord - baseCenter.x;
  const startOffsetY = resolvedY.startCoord - baseCenter.y;
  const isOriginalRepositioned =
    Math.hypot(startOffsetX, startOffsetY) > 1e-3 &&
    (modeX === "auto_fit" || modeX === "fill" || modeY === "auto_fit" || modeY === "fill") &&
    Boolean(host?.sheetBounds);

  const k0Center: Vec2 = {
    x: baseCenter.x + startOffsetX,
    y: baseCenter.y + startOffsetY,
  };

  const k0Entities = sourceEntities.map((orig) =>
    isOriginalRepositioned ? translate(orig, startOffsetX, startOffsetY) : orig,
  );

  const instances: Entity[] = [];
  const repositionedOriginals: Entity[] = [];
  const ghostSlots: ArrayGhostSlot[] = [];
  const axes: { x1: number; y1: number; x2: number; y2: number; axis: "x" | "y" }[] = [];

  const totalSpanSignedX = (cols - 1) * resolvedX.step;
  const totalSpanSignedY = (rows - 1) * resolvedY.step;

  if (cols > 1 || Math.abs(totalSpanSignedX) > EPSILON) {
    axes.push({
      x1: k0Center.x,
      y1: k0Center.y,
      x2: k0Center.x + totalSpanSignedX * cosAng,
      y2: k0Center.y + totalSpanSignedX * sinAng,
      axis: "x",
    });
  }

  if (rows > 1 && Math.abs(totalSpanSignedY) > EPSILON) {
    axes.push({
      x1: k0Center.x,
      y1: k0Center.y,
      x2: k0Center.x - totalSpanSignedY * sinAng,
      y2: k0Center.y + totalSpanSignedY * cosAng,
      axis: "y",
    });
  }

  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rawX = c * resolvedX.step;
      const rawY = r * resolvedY.step;
      const shiftX = rawX * cosAng - rawY * sinAng;
      const shiftY = rawX * sinAng + rawY * cosAng;
      const slotCenter: Vec2 = {
        x: k0Center.x + shiftX,
        y: k0Center.y + shiftY,
      };
      const isSkipped = index >= 1 && skippedSet.has(index);

      if (r === 0 && c === 0 && includeOriginal) {
        const origTagged = k0Entities.map((e, idx) =>
          buildArrayInstanceEntity(e, sourceEntities[idx]!, spec, specId, {
            arrayIndex: 0,
            arrayRow: 0,
            arrayCol: 0,
            isOriginal: true,
          }),
        );
        repositionedOriginals.push(...origTagged);
        ghostSlots.push({
          index: 0,
          row: 0,
          col: 0,
          center: k0Center,
          angleDeltaDeg: angleDeg,
          entities: origTagged,
          isOriginal: true,
          isSkipped: false,
        });
        index++;
        continue;
      }

      const slotGroupId = sourceEntities.length > 1 ? `${specId}-slot-${index}` : undefined;
      const slotEntities = k0Entities.map((k0Ent, idx) => {
        const orig = sourceEntities[idx]!;
        let transformed = translate(k0Ent, shiftX, shiftY);
        if (params.rotateItems && Math.abs(angleDeg) > EPSILON) {
          transformed = rotate(transformed, slotCenter, angleDeg);
        }
        return buildArrayInstanceEntity(transformed, orig, spec, specId, {
          arrayIndex: index,
          arrayRow: r,
          arrayCol: c,
          isOriginal: false,
          slotGroupId,
        });
      });

      ghostSlots.push({
        index,
        row: r,
        col: c,
        center: slotCenter,
        angleDeltaDeg: angleDeg,
        entities: slotEntities,
        isOriginal: false,
        isSkipped,
      });

      if (!isSkipped) {
        instances.push(...slotEntities);
      }

      index++;
    }
  }

  return {
    instances,
    repositionedOriginals: isOriginalRepositioned ? repositionedOriginals : undefined,
    ghostSlots,
    guides: {
      type: "linear",
      axes,
    },
    resolvedLinear: {
      cols,
      rows,
      stepX: resolvedX.step,
      stepY: resolvedY.step,
      spanX: resolvedX.span,
      spanY: resolvedY.span,
      startOffsetX,
      startOffsetY,
    },
  };
}

// -------------------------------------------------------------
// 4. VALIDAÇÃO FÍSICA E DIAGNÓSTICO DE COLISÕES POR INSTÂNCIA
// -------------------------------------------------------------

/**
 * Valida a integridade física do padrão em tempo real:
 * (a) Sai para fora do contorno externo da peça hospedeira ("Fora da peça")
 * (b) Invade o furo central do flange ou recorte interno existente ("Invade furo central")
 * (c) Colide ou sobrepõe-se a outro furo do padrão ("Colisão entre furos")
 */
export function validateArray(
  spec: ArraySpec,
  sourceEntities: Entity[],
  host?: HostDetectionResult,
): ArrayValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slotDiagnostics: Record<number, SlotCollisionDiagnostic> = {};

  if (sourceEntities.length === 0) {
    errors.push("Nenhuma geometria selecionada para multiplicação.");
    return {
      isValid: false,
      errors,
      warnings,
      slotDiagnostics,
      collidingCount: 0,
      activeCopiesCount: 0,
      skippedCount: 0,
      totalPositionsCount: 0,
    };
  }

  const effRadius = getSelectionEffectiveRadius(sourceEntities);
  const holeDia = effRadius * 2;

  const computed = computeInstances(spec, sourceEntities, host);
  const { ghostSlots } = computed;
  const activeSlots = ghostSlots.filter((s) => !s.isSkipped);
  const skippedCount = ghostSlots.filter((s) => s.isSkipped).length;
  const activeCopiesCount = activeSlots.filter((s) => !s.isOriginal).length;

  // Inicializa todos os slots ativos como "ok"
  for (const slot of ghostSlots) {
    slotDiagnostics[slot.index] = {
      index: slot.index,
      status: "ok",
    };
  }

  const markSlotIssue = (
    slotIndex: number,
    status: "warning" | "error",
    badge: CollisionReasonBadge,
    message: string,
  ) => {
    const current = slotDiagnostics[slotIndex];
    if (!current || current.status === "ok" || (current.status === "warning" && status === "error")) {
      slotDiagnostics[slotIndex] = { index: slotIndex, status, badge, message };
    }
    if (status === "error") {
      if (!errors.includes(message)) errors.push(message);
    } else {
      if (!warnings.includes(message)) warnings.push(message);
    }
  };

  if (spec.type === "polar") {
    const p = spec.polar;
    if (!p || p.count < 1) {
      errors.push("Quantidade de itens deve ser no mínimo 1.");
      return {
        isValid: false,
        errors,
        warnings,
        slotDiagnostics,
        collidingCount: 0,
        activeCopiesCount,
        skippedCount,
        totalPositionsCount: ghostSlots.length,
      };
    }
  } else {
    const l = spec.linear;
    if (!l || l.rows < 1 || l.cols < 1) {
      errors.push("Quantidade de linhas e colunas deve ser maior ou igual a 1.");
      return {
        isValid: false,
        errors,
        warnings,
        slotDiagnostics,
        collidingCount: 0,
        activeCopiesCount,
        skippedCount,
        totalPositionsCount: ghostSlots.length,
      };
    }
  }

  // 1. Checagem contra a peça hospedeira (Flange, Disco ou Chapa Fechada)
  for (const slot of activeSlots) {
    const pt = slot.center;

    if (host?.type === "flange" && host.center && host.rInner !== undefined && host.rOuter !== undefined) {
      const d = dist(host.center, pt);
      const minMargin = Math.max(2, effRadius * 0.5);

      if (d - effRadius < host.rInner + EPSILON) {
        markSlotIssue(
          slot.index,
          "error",
          "Invade furo central",
          `Invade furo central (distância: ${d.toFixed(1)} mm, limite interno: ${(host.rInner + effRadius).toFixed(1)} mm).`,
        );
      } else if (d + effRadius > host.rOuter - EPSILON) {
        markSlotIssue(
          slot.index,
          "error",
          "Fora da peça",
          `Fora da peça: ultrapassa borda externa do flange (limite: ${host.rOuter.toFixed(1)} mm).`,
        );
      } else if (d + effRadius > host.rOuter - minMargin) {
        markSlotIssue(
          slot.index,
          "warning",
          "Margem estreita",
          `Margem externa estreita (< ${minMargin.toFixed(1)} mm da borda).`,
        );
      }
    } else if (host?.type === "circular_plate" && host.center && host.rOuter !== undefined) {
      const d = dist(host.center, pt);
      if (d + effRadius > host.rOuter - EPSILON) {
        markSlotIssue(
          slot.index,
          "error",
          "Fora da peça",
          `Fora da peça: ultrapassa borda do disco (Ø ${(host.rOuter * 2).toFixed(1)} mm).`,
        );
      }
    } else if (host?.type === "sheet" && host.sheetBounds) {
      const sb = host.sheetBounds;
      const outsideBox =
        pt.x - effRadius < sb.minX - EPSILON ||
        pt.x + effRadius > sb.maxX + EPSILON ||
        pt.y - effRadius < sb.minY - EPSILON ||
        pt.y + effRadius > sb.maxY + EPSILON;
      const outsidePoly = sb.polygon ? !pointInPoly(pt, sb.polygon) : false;
      const edgeClearance = sb.polygon ? minDistanceToPolygonEdges(pt, sb.polygon) : Infinity;

      if (outsideBox || outsidePoly || edgeClearance < effRadius - EPSILON) {
        markSlotIssue(
          slot.index,
          "error",
          "Fora da peça",
          `Fora da peça: instância #${slot.index + 1} sai do contorno da chapa.`,
        );
      }
    }

    // Checa colisão com recortes/furos internos pré-existentes da peça hospedeira
    if (host?.internalCutouts && host.internalCutouts.length > 0) {
      for (const cutout of host.internalCutouts) {
        const dCut = dist(pt, cutout.center);
        if (dCut < effRadius + cutout.radius - EPSILON) {
          markSlotIssue(
            slot.index,
            "error",
            "Invade furo central",
            `Invade recorte interno existente na peça.`,
          );
        }
      }
    }
  }

  // 2. Checagem par-a-par de colisão/sobreposição entre instâncias ativas do Array
  let minClearanceMm = Infinity;
  if (activeSlots.length >= 2 && effRadius > 0) {
    for (let i = 0; i < activeSlots.length; i++) {
      for (let j = i + 1; j < activeSlots.length; j++) {
        const sA = activeSlots[i]!;
        const sB = activeSlots[j]!;
        const centerDist = dist(sA.center, sB.center);
        const clearance = centerDist - holeDia;
        if (clearance < minClearanceMm) {
          minClearanceMm = clearance;
        }

        if (centerDist < holeDia - EPSILON) {
          const msg = `Colisão entre furos (furos se sobrepõem): distância centro a centro (${centerDist.toFixed(1)} mm) menor que Ø ${holeDia.toFixed(1)} mm.`;
          markSlotIssue(sA.index, "error", "Colisão entre furos", msg);
          markSlotIssue(sB.index, "error", "Colisão entre furos", msg);
        } else if (centerDist < holeDia + MIN_LIGAMENT_MM) {
          const msg = `Parede mínima estreita entre furos (${Math.max(0, clearance).toFixed(1)} mm < ${MIN_LIGAMENT_MM} mm).`;
          markSlotIssue(sA.index, "warning", "Colisão entre furos", msg);
          markSlotIssue(sB.index, "warning", "Colisão entre furos", msg);
        }
      }
    }
  }

  const collidingCount = Object.values(slotDiagnostics).filter(
    (d) => d.status === "error",
  ).length;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    minClearanceMm: Number.isFinite(minClearanceMm) ? minClearanceMm : undefined,
    slotDiagnostics,
    collidingCount,
    activeCopiesCount,
    skippedCount,
    totalPositionsCount: ghostSlots.length,
  };
}

/**
 * Extrai a especificação associativa de Array (`ArraySpec`) se a entidade selecionada
 * fizer parte de um padrão previamente confirmado.
 */
export function getEntityArraySpec(entity: Entity | undefined | null): {
  arrayGroupId: string;
  spec: ArraySpec;
} | null {
  if (!entity?.params) return null;
  const groupId =
    (entity.params.arrayGroupId as string | undefined) ??
    (entity.params.arrayPatternId as string | undefined);
  const spec = entity.params.arraySpec as ArraySpec | undefined;
  if (!groupId || !spec || typeof spec !== "object") return null;
  return { arrayGroupId: groupId, spec };
}

// -------------------------------------------------------------
// 5. DETECÇÃO AUTOMÁTICA DE CONJUNTO GEOMÉTRICO (SEÇÃO 2.2)
// -------------------------------------------------------------

/**
 * Quando o usuário seleciona um contorno fechado principal (chapa retangular, polilinha fechada,
 * contorno de linhas ou círculo externo), identifica automaticamente todos os elementos geométricos
 * contidos ou conectados a ele:
 * - Furos internos e círculos concêntricos
 * - Rasgos, oblongos, polilinhas internas e subcontornos conectados
 * - Linhas de construção vinculadas que estejam dentro do contorno
 */
export type EnclosedAssemblyResult = Entity[] & {
  assemblyEntities: Entity[];
  autoAddedEntities: Entity[];
  autoAddedIds: string[];
};

export function findEnclosedAndConnectedAssembly(
  allEntities: Entity[],
  primarySelected: Entity[],
): EnclosedAssemblyResult {
  const makeResult = (
    assemblyEntities: Entity[],
    autoAddedEntities: Entity[],
    autoAddedIds: string[],
  ): EnclosedAssemblyResult => {
    const arr = [...assemblyEntities] as EnclosedAssemblyResult;
    arr.assemblyEntities = assemblyEntities;
    arr.autoAddedEntities = autoAddedEntities;
    arr.autoAddedIds = autoAddedIds;
    return arr;
  };

  if (primarySelected.length === 0) {
    return makeResult([], [], []);
  }

  const selectedIds = new Set(primarySelected.map((e) => e.id));
  const autoAddedEntities: Entity[] = [];
  const autoAddedIds: string[] = [];

  // Identifica se a seleção principal contém contornos fechados (polilinha fechada ou círculo externo)
  const closedPolys: Vec2[][] = [];
  const outerCircles: { cx: number; cy: number; r: number; id: string }[] = [];

  for (const e of primarySelected) {
    if (e.type === "polyline" && e.closed && e.pts.length >= 3) {
      closedPolys.push(e.pts);
    } else if (e.type === "circle") {
      // Verifica se este círculo engloba alguma outra entidade do projeto
      const hasInnerEntity = allEntities.some((other) => {
        if (other.id === e.id || other.layer === "cota") return false;
        const c = getEntityCenter(other);
        const rOther = other.type === "circle" || other.type === "arc" ? other.r : 0;
        return dist({ x: e.cx, y: e.cy }, c) + rOther <= e.r + 0.5 && rOther < e.r - 0.1;
      });
      if (hasInnerEntity) {
        outerCircles.push({ cx: e.cx, cy: e.cy, r: e.r, id: e.id });
      }
    }
  }

  // Também reconstrói polígono fechado caso o usuário tenha selecionado as linhas de um contorno fechado
  if (closedPolys.length === 0) {
    const extracted = extractClosedPolygons(primarySelected);
    for (const poly of extracted) {
      closedPolys.push(poly.pts);
    }
  }

  if (closedPolys.length === 0 && outerCircles.length === 0) {
    return makeResult(primarySelected, [], []);
  }

  const isPointInsideAnyPrimaryContour = (pt: Vec2, radiusMargin = 0): boolean => {
    for (const oc of outerCircles) {
      if (dist({ x: oc.cx, y: oc.cy }, pt) + radiusMargin <= oc.r + 0.25) {
        return true;
      }
    }
    for (const poly of closedPolys) {
      if (pointInPoly(pt, poly)) {
        if (radiusMargin <= 0) return true;
        const edgeDist = minDistanceToPolygonEdges(pt, poly);
        if (edgeDist + 0.25 >= radiusMargin) return true;
      }
    }
    return false;
  };

  for (const cand of allEntities) {
    if (selectedIds.has(cand.id)) continue;
    if (cand.layer === "cota") continue;
    // Ignora marcos geométricos e datums independentes
    const semKind = cand.params?.cadSemanticKind;
    if (semKind === "geometric_mark" || semKind === "persistent_datum") continue;

    let isContainedOrConnected = false;

    if (cand.type === "circle" || cand.type === "arc") {
      isContainedOrConnected = isPointInsideAnyPrimaryContour(
        { x: cand.cx, y: cand.cy },
        cand.r * 0.5,
      );
    } else if (cand.type === "line") {
      const p1 = { x: cand.x1, y: cand.y1 };
      const p2 = { x: cand.x2, y: cand.y2 };
      const mid = { x: (cand.x1 + cand.x2) / 2, y: (cand.y1 + cand.y2) / 2 };
      isContainedOrConnected =
        isPointInsideAnyPrimaryContour(mid) &&
        (isPointInsideAnyPrimaryContour(p1) || isPointInsideAnyPrimaryContour(p2));
    } else if (cand.type === "polyline") {
      if (cand.pts.length > 0) {
        const center = getEntityCenter(cand);
        const insideCount = cand.pts.filter((p) => isPointInsideAnyPrimaryContour(p)).length;
        isContainedOrConnected =
          isPointInsideAnyPrimaryContour(center) &&
          insideCount >= Math.ceil(cand.pts.length * 0.5);
      }
    } else if (cand.type === "point" || cand.type === "ellipse") {
      const center = getEntityCenter(cand);
      isContainedOrConnected = isPointInsideAnyPrimaryContour(center);
    }

    if (isContainedOrConnected) {
      selectedIds.add(cand.id);
      autoAddedEntities.push(cand);
      autoAddedIds.push(cand.id);
    }
  }

  return makeResult([...primarySelected, ...autoAddedEntities], autoAddedEntities, autoAddedIds);
}

// -------------------------------------------------------------
// 6. AUTO-TRIM / UNIÃO ANALÍTICA DE CONTORNOS EM ARRAY (SEÇÃO 2.4)
// -------------------------------------------------------------

function intersectTwoCirclesAnalytical(
  c1: { cx: number; cy: number; r: number },
  c2: { cx: number; cy: number; r: number },
): Vec2[] {
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);
  if (d > c1.r + c2.r - 1e-5 || d < Math.abs(c1.r - c2.r) + 1e-5 || d < 1e-6) {
    return [];
  }
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h2 = c1.r * c1.r - a * a;
  if (h2 <= 1e-8) return [];
  const h = Math.sqrt(h2);
  const mx = c1.cx + (a * dx) / d;
  const my = c1.cy + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    { x: mx + rx, y: my + ry },
    { x: mx - rx, y: my - ry },
  ];
}

function intersectSegmentWithCircleAnalytical(
  p1: Vec2,
  p2: Vec2,
  c: { cx: number; cy: number; r: number },
): { t: number; point: Vec2 }[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - c.cx;
  const fy = p1.y - c.cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return [];
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc <= 1e-8) return [];
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  const hits: { t: number; point: Vec2 }[] = [];
  if (t1 > 1e-4 && t1 < 1 - 1e-4) {
    hits.push({ t: t1, point: { x: p1.x + t1 * dx, y: p1.y + t1 * dy } });
  }
  if (t2 > 1e-4 && t2 < 1 - 1e-4) {
    hits.push({ t: t2, point: { x: p1.x + t2 * dx, y: p1.y + t2 * dy } });
  }
  return hits;
}

/**
 * Subtrai de uma circunferência `targetCircle` todos os sub-arcos cujo ponto médio
 * caia estritamente dentro de qualquer um dos `cutterCircles` ou dentro de um polígono fechado.
 * Retorna os arcos sobreviventes (ou a circunferência original caso não tenha sofrido cortes).
 */
function splitAndFilterCircleArcs(
  targetCircle: Extract<Entity, { type: "circle" }>,
  cutPoints: Vec2[],
  isMidpointTrimmed: (midPt: Vec2) => boolean,
): { survivingEntities: Entity[]; wasTrimmed: boolean } {
  if (cutPoints.length < 2) {
    return { survivingEntities: [targetCircle], wasTrimmed: false };
  }

  // Converte pontos de corte em ângulos ordenados em [0, 360)
  const rawAngles = cutPoints.map((pt) => {
    const rad = Math.atan2(pt.y - targetCircle.cy, pt.x - targetCircle.cx);
    let deg = rad * RAD_TO_DEG;
    if (deg < 0) deg += 360;
    return deg;
  });
  rawAngles.sort((a, b) => a - b);

  // Remove ângulos duplicados muito próximos (< 0.1°)
  const uniqueAngles: number[] = [];
  for (const ang of rawAngles) {
    if (
      uniqueAngles.length === 0 ||
      Math.abs(ang - uniqueAngles[uniqueAngles.length - 1]!) > 0.1
    ) {
      uniqueAngles.push(ang);
    }
  }
  if (
    uniqueAngles.length >= 2 &&
    360 - uniqueAngles[uniqueAngles.length - 1]! + uniqueAngles[0]! <= 0.1
  ) {
    uniqueAngles.pop();
  }

  if (uniqueAngles.length < 2) {
    return { survivingEntities: [targetCircle], wasTrimmed: false };
  }

  // Constrói intervalos circulares consecutivos
  const intervals: { start: number; end: number; kept: boolean }[] = [];
  let anyTrimmed = false;

  for (let i = 0; i < uniqueAngles.length; i++) {
    const a1 = uniqueAngles[i]!;
    const a2 = uniqueAngles[(i + 1) % uniqueAngles.length]!;
    const span = a2 > a1 ? a2 - a1 : 360 - a1 + a2;
    const midDeg = (a1 + span / 2) % 360;
    const midRad = midDeg * DEG_TO_RAD;
    const midPt: Vec2 = {
      x: targetCircle.cx + targetCircle.r * Math.cos(midRad),
      y: targetCircle.cy + targetCircle.r * Math.sin(midRad),
    };
    const trimmed = isMidpointTrimmed(midPt);
    if (trimmed) anyTrimmed = true;
    intervals.push({ start: a1, end: a2, kept: !trimmed });
  }

  if (!anyTrimmed) {
    return { survivingEntities: [targetCircle], wasTrimmed: false };
  }

  // Funde intervalos adjacentes que foram mantidos (kept === true)
  const keptIntervals = intervals.filter((iv) => iv.kept);
  if (keptIntervals.length === 0) {
    return { survivingEntities: [], wasTrimmed: true };
  }

  const merged: { start: number; end: number }[] = [];
  for (const iv of intervals) {
    if (!iv.kept) continue;
    const last = merged[merged.length - 1];
    if (last && Math.abs(((last.end - iv.start + 540) % 360) - 180) < 0.15) {
      last.end = iv.end;
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  // Fusão wrap-around entre o último e o primeiro intervalo
  if (
    merged.length >= 2 &&
    Math.abs(((merged[merged.length - 1]!.end - merged[0]!.start + 540) % 360) - 180) < 0.15
  ) {
    merged[0]!.start = merged[merged.length - 1]!.start;
    merged.pop();
  }

  const arcs: Entity[] = merged.map((iv, idx) => ({
    id: idx === 0 ? targetCircle.id : uid(),
    type: "arc",
    layer: targetCircle.layer,
    cx: targetCircle.cx,
    cy: targetCircle.cy,
    r: targetCircle.r,
    a0: Number((iv.start * DEG_TO_RAD).toFixed(6)),
    a1: Number((iv.end * DEG_TO_RAD).toFixed(6)),
    start: Number(iv.start.toFixed(4)),
    end: Number(iv.end.toFixed(4)),
    ccw: true,
    group: targetCircle.group,
    cnc: targetCircle.cnc ? { ...targetCircle.cnc } : undefined,
    params: targetCircle.params ? { ...targetCircle.params, autoTrimmed: true } : { autoTrimmed: true },
  }));

  return { survivingEntities: arcs, wasTrimmed: true };
}

/**
 * Executa o Auto-Trim analítico das geometrias geradas pelo Array contra o contorno base
 * (círculo maior de base, polilinha fechada ou círculos sobrepostos do próprio Array),
 * eliminando automaticamente os segmentos internos sobrepostos em uma única operação transacional.
 */
export function applyArrayAutoTrim(
  existingEntities: Entity[],
  arrayNewInstances: Entity[],
  sourceEntities: Entity[],
): {
  entities: Entity[];
  trimmedCount: number;
} {
  // Conjunto total de entidades do padrão (originais + novas cópias)
  const sourceIds = new Set(sourceEntities.map((e) => e.id));
  const patternCircles = [
    ...existingEntities.filter(
      (e): e is Extract<Entity, { type: "circle" }> =>
        e.type === "circle" && sourceIds.has(e.id),
    ),
    ...arrayNewInstances.filter(
      (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle",
    ),
  ];

  // Se não houver círculos no padrão, retorna lista padrão combinada
  if (patternCircles.length === 0) {
    return {
      entities: [...existingEntities, ...arrayNewInstances],
      trimmedCount: 0,
    };
  }

  const patternCircleIds = new Set(patternCircles.map((c) => c.id));

  // Círculos de base candidatos (que não fazem parte do padrão repetido e interceptam círculos do padrão)
  const baseCircles = existingEntities.filter(
    (e): e is Extract<Entity, { type: "circle" }> =>
      e.type === "circle" &&
      !patternCircleIds.has(e.id) &&
      e.layer !== "construcao" &&
      e.layer !== "referencia" &&
      e.layer !== "cota",
  );

  // Polilinhas fechadas de base (ex: chapa retangular cuja borda é cruzada pelos círculos do array)
  const baseClosedPolys = existingEntities.filter(
    (e): e is Extract<Entity, { type: "polyline" }> =>
      e.type === "polyline" &&
      Boolean(e.closed) &&
      e.pts.length >= 3 &&
      !sourceIds.has(e.id),
  );

  let trimmedCount = 0;
  const replacementMap = new Map<string, Entity[]>();

  // 1. Auto-Trim de cada círculo do padrão (contra círculos de base, outros círculos do padrão e polilinhas de base)
  for (const pCircle of patternCircles) {
    const cutPoints: Vec2[] = [];
    const intersectingBaseCircles: Extract<Entity, { type: "circle" }>[] = [];
    const intersectingPeerCircles: Extract<Entity, { type: "circle" }>[] = [];
    const intersectingPolys: Extract<Entity, { type: "polyline" }>[] = [];

    for (const bCircle of baseCircles) {
      const pts = intersectTwoCirclesAnalytical(pCircle, bCircle);
      if (pts.length >= 2) {
        cutPoints.push(...pts);
        intersectingBaseCircles.push(bCircle);
      }
    }

    for (const peer of patternCircles) {
      if (peer.id === pCircle.id) continue;
      const pts = intersectTwoCirclesAnalytical(pCircle, peer);
      if (pts.length >= 2) {
        cutPoints.push(...pts);
        intersectingPeerCircles.push(peer);
      }
    }

    for (const poly of baseClosedPolys) {
      let hitPoly = false;
      for (let i = 0; i < poly.pts.length; i++) {
        const a = poly.pts[i]!;
        const b = poly.pts[(i + 1) % poly.pts.length]!;
        const hits = intersectSegmentWithCircleAnalytical(a, b, pCircle);
        if (hits.length > 0) {
          hitPoly = true;
          cutPoints.push(...hits.map((h) => h.point));
        }
      }
      if (hitPoly) intersectingPolys.push(poly);
    }

    if (cutPoints.length >= 2) {
      const { survivingEntities, wasTrimmed } = splitAndFilterCircleArcs(
        pCircle,
        cutPoints,
        (midPt) => {
          // Remove o arco interno que cai dentro do círculo base, dentro de outro círculo do array ou dentro da chapa
          for (const bc of intersectingBaseCircles) {
            if (dist(midPt, { x: bc.cx, y: bc.cy }) < bc.r - 1e-3) return true;
          }
          for (const pc of intersectingPeerCircles) {
            if (dist(midPt, { x: pc.cx, y: pc.cy }) < pc.r - 1e-3) return true;
          }
          for (const poly of intersectingPolys) {
            if (pointInPoly(midPt, poly.pts)) return true;
          }
          return false;
        },
      );
      if (wasTrimmed) {
        replacementMap.set(pCircle.id, survivingEntities);
        trimmedCount++;
      }
    }
  }

  // 2. Auto-Trim dos círculos de base que foram cruzados pelos círculos do Array
  for (const bCircle of baseCircles) {
    const cutPoints: Vec2[] = [];
    const cutters: Extract<Entity, { type: "circle" }>[] = [];

    for (const pCircle of patternCircles) {
      const pts = intersectTwoCirclesAnalytical(bCircle, pCircle);
      if (pts.length >= 2) {
        cutPoints.push(...pts);
        cutters.push(pCircle);
      }
    }

    if (cutPoints.length >= 2) {
      const { survivingEntities, wasTrimmed } = splitAndFilterCircleArcs(
        bCircle,
        cutPoints,
        (midPt) =>
          cutters.some((cutter) => dist(midPt, { x: cutter.cx, y: cutter.cy }) < cutter.r - 1e-3),
      );
      if (wasTrimmed) {
        replacementMap.set(bCircle.id, survivingEntities);
        trimmedCount++;
      }
    }
  }

  // 3. Reconstrói a lista unificada substituindo as entidades aparadas pelos arcos resultantes
  const combinedInput = [...existingEntities, ...arrayNewInstances];
  if (trimmedCount === 0) {
    return { entities: combinedInput, trimmedCount: 0 };
  }

  const finalEntities: Entity[] = [];
  for (const ent of combinedInput) {
    const replaced = replacementMap.get(ent.id);
    if (replaced !== undefined) {
      finalEntities.push(...replaced);
    } else {
      finalEntities.push(ent);
    }
  }

  return { entities: finalEntities, trimmedCount };
}

