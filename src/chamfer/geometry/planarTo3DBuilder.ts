/**
 * CALDRA CHAMFER — CONVERSOR 2D -> 3D DEFINITIVO
 * (COSTURADOR TOPOLÓGICO DE ARCOS ORIENTADOS + ÁRVORE DE CONTENÇÃO SÓLIDO/FURO)
 *
 * Pipeline determinístico de 5 estágios:
 *  ESTÁGIO 1 — Filtro Estrito de Entidades Reais (exclui `isReferenceGuide`, `isConstruction`,
 *              cotas, textos, pontos, hachuras e camadas não-cortáveis);
 *  ESTÁGIO 2 — Amostragem Canônica de Primitivas (`sampleEntityPoints`) seguindo 100% a
 *              convenção angular do renderizador 2D (`sweep = ((a1 - a0) % 2π + 2π) % 2π`,
 *              positivo CCW; travessia reversa usa SEMPRE `pts.slice().reverse()`, ZERO inversão!);
 *  ESTÁGIO 3 — Costurador Topológico de Loops (`stitchPlanarLoops2D`):
 *              • Divide interseções/T-junctions remanescentes entre primitivas;
 *              • Deduplica segmentos sobrepostos (<= 0.02 mm);
 *              • Snap de vértices (`SNAP_EPS = 0.15 mm`, fallback `0.8 mm` só para grau 1);
 *              • Extração Half-Edge / DCEL (regra de curva mínima para grau > 2);
 *              • Remove vértices colineares/duplicados (< 1e-4 mm) e loops degenerados (< 0.5 mm²);
 *  ESTÁGIO 4 — Árvore de Contenção Par-Ímpar (Even-Odd Containment Tree):
 *              • Ordena loops por área absoluta decrescente (Shoelace);
 *              • Testa ponto interno garantido com Ray-Casting de dupla precisão;
 *              • `nestingDepth % 2 === 0` -> Contorno Externo de Sólido;
 *              • `nestingDepth % 2 === 1` -> Furo Passante atribuído exclusivamente ao pai imediato;
 *              • Constrói `THREE.Shape` orientado (Externo CCW área > 0, Furos CW área < 0)
 *                e `THREE.ExtrudeGeometry({ depth: thicknessMm, bevelEnabled: false, curveSegments: 1 })`
 *                com validação estrita (`position.count > 0`);
 *  ESTÁGIO 5 — Integração com `cadDirectModeling3D.ts` e `solid3d.ts`, preservando a seleção
 *              e edição direta de Topo, Base, Faces Laterais, Túneis de Furos, Arestas e Vértices.
 */

import * as THREE from "three";
import { dist, outlinePoints, type Entity, type Vec2 } from "@/lib/lab2d/core";
import {
  intersectCircleCircleExact,
  intersectSegCircleExact,
  intersectSegSegExact,
} from "@/chamfer/tools/trimEngine2D";

const TWO_PI = Math.PI * 2;
const VALID_SOLID_LAYERS = new Set(["corte", "recorte", "furo", "contorno", "peca", ""]);

export interface PlanarStitchedLoop2D {
  id: string;
  /** Polígono fechado sem repetir o ponto inicial no fim (mínimo 3 pontos) */
  points: Vec2[];
  /** Área com sinal (Shoelace): > 0 CCW, < 0 CW */
  signedArea: number;
  /** Área absoluta em mm² */
  absArea: number;
  /** Caixa envolvente */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** Se o loop veio de um círculo puro */
  isPureCircle: boolean;
  circleCenter?: Vec2;
  circleRadius?: number;
  /** IDs das entidades 2D originais que compuseram este loop */
  sourceEntityIds: string[];
  /** Altura individual / elevação herdada das entidades */
  elevationZ: number;
  extrudeHeight?: number;
}

export interface PlanarSolidContainmentNode {
  outer: PlanarStitchedLoop2D;
  holes: PlanarStitchedLoop2D[];
  nestingDepth: number;
  netAreaMm2: number;
}

export interface PlanarTo3DBuildResult {
  /** Todos os loops fechados válidos extraídos */
  loops: PlanarStitchedLoop2D[];
  /** Sólidos independentes (profundidade par) cada um com seus furos passantes diretos (profundidade ímpar) */
  solids: PlanarSolidContainmentNode[];
  /** Quantidade de entidades filtradas/ignoradas (gabarito, construção, cota, etc.) */
  ignoredEntitiesCount: number;
  /** Quantidade de segmentos abertos soltos descartados */
  openSegmentsDiscarded: number;
}

export interface BuiltExtrudedSolid3D {
  node: PlanarSolidContainmentNode;
  shape: THREE.Shape;
  geometry: THREE.ExtrudeGeometry;
  vertexCount: number;
  triangleCount: number;
}

/* ----------------------------------------------------------- helpers gerais */

function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

/**
 * Convenção 100% idêntica ao renderizador 2D (`Lab2DEditor.tsx:19787`):
 * sweep sempre positivo em (0, 2π] de `a0` até `a1`.
 */
export function canonicalArcSweep(a0: number, a1: number): number {
  let sweep = (a1 - a0) % TWO_PI;
  while (sweep < 0) sweep += TWO_PI;
  if (sweep < 1e-9 && Math.abs(a1 - a0) > 1e-9) {
    sweep = TWO_PI;
  }
  return sweep;
}

export function signedAreaShoelace(pts: Vec2[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

export function computeBBox(pts: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
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
}

function cleanClosedPolygon(raw: Vec2[], dedupEps = 1e-4): Vec2[] {
  const out: Vec2[] = [];
  for (const p of raw) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) > dedupEps) {
      out.push({ x: p.x, y: p.y });
    }
  }
  while (out.length > 1 && dist(out[0]!, out[out.length - 1]!) <= dedupEps) {
    out.pop();
  }
  return out;
}

function ensureWinding(pts: Vec2[], wantCCW: boolean): Vec2[] {
  const area = signedAreaShoelace(pts);
  if ((wantCCW && area < 0) || (!wantCCW && area > 0)) {
    return [...pts].reverse();
  }
  return pts;
}

/* ========================================================================== *
 *  ESTÁGIO 1 — FILTRO ESTRITO DE ENTIDADES REAIS                             *
 * ========================================================================== */

export function isRealVectorEntityFor3D(e: Entity | null | undefined): boolean {
  if (!e) return false;
  if (e.isReferenceGuide === true) return false;
  if (e.isConstruction === true) return false;
  if (
    e.type === "point" ||
    e.type === "text" ||
    e.type === "hatch"
  ) {
    return false;
  }
  if (
    e.params?.excludeFrom3D === true ||
    e.params?.isNonVectorRef === true ||
    e.params?.isGeometricMark === true ||
    e.params?.isPersistentDatum === true ||
    e.params?.isConstructionAxis === true
  ) {
    return false;
  }
  const layerLower = (e.layer || "corte").toLowerCase();
  if (
    layerLower === "cota" ||
    layerLower === "referencia" ||
    layerLower === "anotacoes" ||
    layerLower === "auxiliar" ||
    layerLower === "eixo" ||
    layerLower === "construcao"
  ) {
    return false;
  }
  return VALID_SOLID_LAYERS.has(layerLower);
}

export function filterRealVectorEntities2D(entities: Entity[]): {
  realEntities: Entity[];
  ignoredCount: number;
} {
  const realEntities: Entity[] = [];
  let ignoredCount = 0;
  for (const e of entities) {
    if (isRealVectorEntityFor3D(e)) {
      realEntities.push(e);
    } else {
      ignoredCount++;
    }
  }
  return { realEntities, ignoredCount };
}

/* ========================================================================== *
 *  ESTÁGIO 2 — AMOSTRAGEM CANÔNICA DE PRIMITIVAS (ZERO INVERSÃO DE ARCOS)    *
 * ========================================================================== */

/**
 * Amostra um arco circular de `a0` até `a1` no sentido positivo canônico (CCW),
 * garantindo `sample(0) === ponto exato em a0`, `sample(last) === ponto exato em a1`,
 * erro de flecha <= `chordToleranceMm`, mínimo 16 passos e <= 4° por passo.
 */
export function sampleCanonicalArcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  chordToleranceMm = 0.15,
): Vec2[] {
  if (!Number.isFinite(r) || r <= 1e-5) return [];
  const sweep = canonicalArcSweep(a0, a1);
  if (sweep < 1e-6) return [];

  // Erro de flecha: tol = r * (1 - cos(dTheta / 2)) -> dTheta = 2 * acos(1 - tol / r)
  const cosVal = Math.max(-1, Math.min(1, 1 - Math.max(0.01, chordToleranceMm) / r));
  const maxStepChord = 2 * Math.acos(cosVal);
  const maxStepAngle = (4 * Math.PI) / 180; // <= 4 graus por passo
  const stepAngle = Math.max(1e-3, Math.min(maxStepChord > 1e-4 ? maxStepChord : maxStepAngle, maxStepAngle));

  const minSteps = Math.max(16, Math.ceil(sweep / stepAngle));
  const steps = Math.min(256, minSteps);

  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = i === steps ? a0 + sweep : a0 + sweep * t;
    pts.push({
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
    });
  }
  return pts;
}

/**
 * Amostra uma entidade 2D real em uma lista ordenada de pontos 2D (`Vec2[]`).
 * Para curvas fechadas (`circle`, `ellipse`, `polyline` fechada, `path` fechado),
 * retorna o anel sem repetir o último ponto (e sinaliza `isClosed: true`).
 * Para curvas abertas (`line`, `arc`, `polyline` aberta), retorna do início ao fim.
 */
export function sampleEntityPoints(
  entity: Entity,
  chordToleranceMm = 0.15,
): { points: Vec2[]; isClosed: boolean } {
  switch (entity.type) {
    case "line":
      return {
        points: [
          { x: entity.x1, y: entity.y1 },
          { x: entity.x2, y: entity.y2 },
        ],
        isClosed: false,
      };
    case "arc": {
      const pts = sampleCanonicalArcPoints(
        entity.cx,
        entity.cy,
        entity.r,
        entity.a0,
        entity.a1,
        chordToleranceMm,
      );
      return { points: pts, isClosed: false };
    }
    case "circle": {
      const cosVal = Math.max(-1, Math.min(1, 1 - Math.max(0.01, chordToleranceMm) / Math.max(1e-4, entity.r)));
      const maxStepChord = 2 * Math.acos(cosVal);
      const maxStepAngle = (4 * Math.PI) / 180;
      const stepAngle = Math.max(1e-3, Math.min(maxStepChord > 1e-4 ? maxStepChord : maxStepAngle, maxStepAngle));
      const steps = Math.min(256, Math.max(64, Math.ceil(TWO_PI / stepAngle)));
      const pts: Vec2[] = [];
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * TWO_PI;
        pts.push({
          x: entity.cx + entity.r * Math.cos(ang),
          y: entity.cy + entity.r * Math.sin(ang),
        });
      }
      return { points: pts, isClosed: true };
    }
    case "polyline": {
      const n = entity.pts.length;
      if (n < 2) return { points: [], isClosed: false };
      const bulges = entity.bulges;
      const pts: Vec2[] = [];
      const segCount = entity.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const a = entity.pts[i]!;
        const b = entity.pts[(i + 1) % n]!;
        const bulge = bulges?.[i] ?? 0;
        if (Math.abs(bulge) > 1e-5 && dist(a, b) > 1e-5) {
          // Converte bulge DXF em arco circular exato
          const chord = dist(a, b);
          const theta = 4 * Math.atan(bulge);
          const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const dx = (b.x - a.x) / chord;
          const dy = (b.y - a.y) / chord;
          const sagDist = (chord / 2) * ((1 - bulge * bulge) / (2 * bulge));
          const cx = midX - dy * sagDist;
          const cy = midY + dx * sagDist;
          const aStart = Math.atan2(a.y - cy, a.x - cx);
          const arcSteps = Math.max(12, Math.ceil(Math.abs(theta) / ((4 * Math.PI) / 180)));
          for (let s = 0; s < arcSteps; s++) {
            const ang = aStart + (theta * s) / arcSteps;
            pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
          }
        } else {
          pts.push({ x: a.x, y: a.y });
        }
      }
      if (!entity.closed) {
        const last = entity.pts[n - 1]!;
        pts.push({ x: last.x, y: last.y });
      }
      return {
        points: entity.closed ? cleanClosedPolygon(pts) : pts,
        isClosed: entity.closed,
      };
    }
    case "ellipse": {
      const rot = entity.rotation ?? 0;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const steps = 72;
      const pts: Vec2[] = [];
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * TWO_PI;
        const lx = entity.rx * Math.cos(ang);
        const ly = entity.ry * Math.sin(ang);
        pts.push({
          x: entity.cx + lx * c - ly * s,
          y: entity.cy + lx * s + ly * c,
        });
      }
      return { points: pts, isClosed: true };
    }
    case "path": {
      const raw = outlinePoints(entity);
      return {
        points: entity.closed ? cleanClosedPolygon(raw) : raw,
        isClosed: entity.closed,
      };
    }
    default:
      return { points: [], isClosed: false };
  }
}

/* ========================================================================== *
 *  ESTÁGIO 3 — COSTURADOR TOPOLÓGICO DE LOOPS (ARCO ORIENTADO + HALF-EDGE)   *
 * ========================================================================== */

interface OpenCurveEdge {
  id: string;
  sourceEntityId: string;
  /** Pontos amostrados estritamente do vértice inicial ao vértice final */
  points: Vec2[];
  elevationZ: number;
  extrudeHeight?: number;
}

type SplitAtom =
  | { kind: "line"; p1: Vec2; p2: Vec2; sourceEntityId: string; elevationZ: number; extrudeHeight?: number }
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; sourceEntityId: string; elevationZ: number; extrudeHeight?: number };

function isAngleStrictlyInsideArc(th: number, a0: number, sweep: number, margin = 1e-4): boolean {
  let d = normAngle(th) - normAngle(a0);
  if (d < -1e-6) d += TWO_PI;
  return d > margin && d < sweep - margin;
}

/**
 * Divide cruzamentos e T-junctions entre átomos abertos (linhas e arcos), garantindo
 * que o grafo topológico tenha vértices reais em todas as interseções.
 */
function splitCrossingAtoms(atoms: SplitAtom[]): SplitAtom[] {
  if (atoms.length <= 1) return atoms;

  const out: SplitAtom[] = [];
  const DEDUP_CUT = 1e-3;

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]!;
    if (a.kind === "line") {
      const dx = a.p2.x - a.p1.x;
      const dy = a.p2.y - a.p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const ts: number[] = [0, 1];
      const addPoint = (pt: Vec2) => {
        const t = ((pt.x - a.p1.x) * dx + (pt.y - a.p1.y) * dy) / (len * len);
        if (t > 1e-4 && t < 1 - 1e-4) {
          if (!ts.some((old) => Math.abs(old - t) * len < DEDUP_CUT)) {
            ts.push(t);
          }
        }
      };

      for (let j = 0; j < atoms.length; j++) {
        if (i === j) continue;
        const b = atoms[j]!;
        if (b.kind === "line") {
          const inter = intersectSegSegExact(a.p1, a.p2, b.p1, b.p2, true);
          if (inter) addPoint(inter);
          // T-junction: extremidades de B encostando no interior de A
          for (const ep of [b.p1, b.p2]) {
            const projT = ((ep.x - a.p1.x) * dx + (ep.y - a.p1.y) * dy) / (len * len);
            if (projT > 1e-4 && projT < 1 - 1e-4) {
              const projPt = { x: a.p1.x + projT * dx, y: a.p1.y + projT * dy };
              if (dist(ep, projPt) <= 0.12) addPoint(projPt);
            }
          }
        } else {
          const pts = intersectSegCircleExact(a.p1, a.p2, b.cx, b.cy, b.r, false);
          const swB = canonicalArcSweep(b.a0, b.a1);
          for (const pt of pts) {
            const th = Math.atan2(pt.y - b.cy, pt.x - b.cx);
            let delta = normAngle(th) - normAngle(b.a0);
            if (delta < -1e-4) delta += TWO_PI;
            if (delta >= -1e-3 && delta <= swB + 1e-3) {
              addPoint(pt);
            }
          }
        }
      }

      ts.sort((x, y) => x - y);
      for (let k = 0; k < ts.length - 1; k++) {
        const t0 = ts[k]!;
        const t1 = ts[k + 1]!;
        const p1 = { x: a.p1.x + t0 * dx, y: a.p1.y + t0 * dy };
        const p2 = { x: a.p1.x + t1 * dx, y: a.p1.y + t1 * dy };
        if (dist(p1, p2) > 1e-3) {
          out.push({ ...a, p1, p2 });
        }
      }
    } else {
      const swA = canonicalArcSweep(a.a0, a.a1);
      if (swA < 1e-5) continue;
      const a0Norm = normAngle(a.a0);
      const offsets: number[] = [0, swA];
      const addAngle = (pt: Vec2) => {
        const th = Math.atan2(pt.y - a.cy, pt.x - a.cx);
        if (!isAngleStrictlyInsideArc(th, a0Norm, swA, 1e-3)) return;
        let off = normAngle(th) - a0Norm;
        if (off < 0) off += TWO_PI;
        if (!offsets.some((o) => Math.abs(o - off) * a.r < DEDUP_CUT)) {
          offsets.push(off);
        }
      };

      for (let j = 0; j < atoms.length; j++) {
        if (i === j) continue;
        const b = atoms[j]!;
        if (b.kind === "line") {
          const pts = intersectSegCircleExact(b.p1, b.p2, a.cx, a.cy, a.r, false);
          for (const pt of pts) addAngle(pt);
        } else {
          const pts = intersectCircleCircleExact(a.cx, a.cy, a.r, b.cx, b.cy, b.r);
          const swB = canonicalArcSweep(b.a0, b.a1);
          for (const pt of pts) {
            const thB = Math.atan2(pt.y - b.cy, pt.x - b.cx);
            let dB = normAngle(thB) - normAngle(b.a0);
            if (dB < -1e-4) dB += TWO_PI;
            if (dB >= -1e-3 && dB <= swB + 1e-3) {
              addAngle(pt);
            }
          }
        }
      }

      offsets.sort((x, y) => x - y);
      for (let k = 0; k < offsets.length - 1; k++) {
        const o0 = offsets[k]!;
        const o1 = offsets[k + 1]!;
        if ((o1 - o0) * a.r > 1e-3) {
          out.push({
            ...a,
            a0: normAngle(a0Norm + o0),
            a1: normAngle(a0Norm + o1),
          });
        }
      }
    }
  }

  return out;
}

/**
 * Deduplica curvas abertas exatamente sobrepostas (<= 0.02 mm).
 */
function deduplicateOpenEdges(edges: OpenCurveEdge[], tol = 0.02): OpenCurveEdge[] {
  const unique: OpenCurveEdge[] = [];
  for (const edge of edges) {
    if (edge.points.length < 2) continue;
    const pStart = edge.points[0]!;
    const pEnd = edge.points[edge.points.length - 1]!;
    const pMid = edge.points[Math.floor(edge.points.length / 2)]!;
    const isDup = unique.some((u) => {
      const uStart = u.points[0]!;
      const uEnd = u.points[u.points.length - 1]!;
      const uMid = u.points[Math.floor(u.points.length / 2)]!;
      const sameDir = dist(pStart, uStart) <= tol && dist(pEnd, uEnd) <= tol;
      const revDir = dist(pStart, uEnd) <= tol && dist(pEnd, uStart) <= tol;
      return (sameDir || revDir) && dist(pMid, uMid) <= Math.max(tol * 2, 0.05);
    });
    if (!isDup) unique.push(edge);
  }
  return unique;
}

/**
 * Extrai loops simples fechados de um conjunto de curvas abertas (`OpenCurveEdge[]`)
 * usando clusterização de vértices (`SNAP_EPS = 0.15 mm` + fallback `0.8 mm` só para grau 1)
 * e travessia Half-Edge / DCEL (regra de curva mínima para nós de grau > 2).
 *
 * REGRA ANTI-INVERSÃO:
 * Quando uma aresta precisa ser percorrida no sentido reverso (vEnd -> vStart),
 * SEMPRE inverte os pontos já amostrados (`edge.points.slice().reverse()`), NUNCA
 * recalcula ângulos nem inverte `absarc`!
 */
function extractClosedLoopsFromOpenEdges(
  openEdges: OpenCurveEdge[],
  snapEps = 0.15,
  openEndFallbackEps = 0.8,
): { loops: PlanarStitchedLoop2D[]; discardedCount: number } {
  if (openEdges.length === 0) {
    return { loops: [], discardedCount: 0 };
  }

  // 1. Clusterização inicial de vértices (SNAP_EPS = 0.15 mm)
  interface NodeCluster {
    id: number;
    x: number;
    y: number;
    count: number;
  }
  const nodes: NodeCluster[] = [];
  const getOrCreateNode = (pt: Vec2, eps: number): number => {
    let bestId = -1;
    let bestD = eps;
    for (const n of nodes) {
      const d = Math.hypot(n.x - pt.x, n.y - pt.y);
      if (d <= bestD) {
        bestD = d;
        bestId = n.id;
      }
    }
    if (bestId !== -1) {
      const node = nodes[bestId]!;
      node.x = (node.x * node.count + pt.x) / (node.count + 1);
      node.y = (node.y * node.count + pt.y) / (node.count + 1);
      node.count++;
      return bestId;
    }
    const id = nodes.length;
    nodes.push({ id, x: pt.x, y: pt.y, count: 1 });
    return id;
  };

  interface GraphEdge {
    idx: number;
    u: number;
    v: number;
    edge: OpenCurveEdge;
  }

  const gEdges: GraphEdge[] = openEdges.map((edge, idx) => {
    const u = getOrCreateNode(edge.points[0]!, snapEps);
    const v = getOrCreateNode(edge.points[edge.points.length - 1]!, snapEps);
    return { idx, u, v, edge };
  });

  // 2. Fallback defensivo de 0.8 mm EXCLUSIVO para pontas soltas de grau 1
  const degree = new Map<number, number>();
  for (const ge of gEdges) {
    degree.set(ge.u, (degree.get(ge.u) ?? 0) + 1);
    degree.set(ge.v, (degree.get(ge.v) ?? 0) + 1);
  }
  const openNodeIds = [...degree.entries()].filter(([, deg]) => deg === 1).map(([id]) => id);
  const remap = new Map<number, number>();
  const resolveNode = (id: number): number => {
    let cur = id;
    while (remap.has(cur)) cur = remap.get(cur)!;
    return cur;
  };
  for (let i = 0; i < openNodeIds.length; i++) {
    const idA = resolveNode(openNodeIds[i]!);
    const nA = nodes[idA]!;
    let bestB = -1;
    let bestD = openEndFallbackEps;
    for (let j = i + 1; j < openNodeIds.length; j++) {
      const idB = resolveNode(openNodeIds[j]!);
      if (idA === idB) continue;
      const nB = nodes[idB]!;
      const d = Math.hypot(nA.x - nB.x, nA.y - nB.y);
      if (d <= bestD) {
        bestD = d;
        bestB = idB;
      }
    }
    if (bestB !== -1) {
      const nB = nodes[bestB]!;
      nA.x = (nA.x + nB.x) / 2;
      nA.y = (nA.y + nB.y) / 2;
      remap.set(bestB, idA);
    }
  }
  for (const ge of gEdges) {
    ge.u = resolveNode(ge.u);
    ge.v = resolveNode(ge.v);
  }

  // Remove iterativamente ramos mortos (grau 1) para não poluir ciclos fechados
  const active = new Array<boolean>(gEdges.length).fill(true);
  let pruned = true;
  while (pruned) {
    pruned = false;
    const deg = new Map<number, number>();
    for (const ge of gEdges) {
      if (!active[ge.idx]) continue;
      if (ge.u === ge.v) continue; // self-loop válido (ex.: arco quase 360°)
      deg.set(ge.u, (deg.get(ge.u) ?? 0) + 1);
      deg.set(ge.v, (deg.get(ge.v) ?? 0) + 1);
    }
    for (const ge of gEdges) {
      if (!active[ge.idx] || ge.u === ge.v) continue;
      if ((deg.get(ge.u) ?? 0) <= 1 || (deg.get(ge.v) ?? 0) <= 1) {
        active[ge.idx] = false;
        pruned = true;
      }
    }
  }

  const loops: PlanarStitchedLoop2D[] = [];
  const usedEdge = new Array<boolean>(gEdges.length).fill(false);

  // Self-loops diretos (u === v)
  for (const ge of gEdges) {
    if (!active[ge.idx]) continue;
    if (ge.u === ge.v) {
      usedEdge[ge.idx] = true;
      const cleaned = cleanClosedPolygon(ge.edge.points);
      const area = signedAreaShoelace(cleaned);
      if (cleaned.length >= 3 && Math.abs(area) >= 0.5) {
        loops.push({
          id: `loop-self-${ge.idx}`,
          points: cleaned,
          signedArea: area,
          absArea: Math.abs(area),
          bbox: computeBBox(cleaned),
          isPureCircle: false,
          sourceEntityIds: [ge.edge.sourceEntityId],
          elevationZ: ge.edge.elevationZ,
          extrudeHeight: ge.edge.extrudeHeight,
        });
      }
    }
  }

  // Constrói mapa de Half-Edges direcionadas para travessia DCEL (regra de menor giro à esquerda)
  interface HalfEdge {
    id: number;
    edgeIdx: number;
    from: number;
    to: number;
    reversed: boolean;
    /** Ângulo de saída no vértice `from` */
    departAngle: number;
    /** Ângulo de chegada no vértice `to` (apontando para fora de `to` de volta à aresta) */
    arriveBackAngle: number;
    points: Vec2[];
    sourceEntityId: string;
    elevationZ: number;
    extrudeHeight?: number;
  }

  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<number, HalfEdge[]>();

  const addOutgoing = (he: HalfEdge) => {
    const list = outgoing.get(he.from) ?? [];
    list.push(he);
    outgoing.set(he.from, list);
  };

  for (const ge of gEdges) {
    if (!active[ge.idx] || usedEdge[ge.idx]) continue;
    const ptsFwd = ge.edge.points;
    if (ptsFwd.length < 2) continue;
    // REGRA ANTI-INVERSÃO: reverso é SEMPRE slice().reverse() dos pontos canônicos!
    const ptsRev = ptsFwd.slice().reverse();

    const p0 = ptsFwd[0]!;
    const p1 = ptsFwd[1]!;
    const pLast = ptsFwd[ptsFwd.length - 1]!;
    const pPrev = ptsFwd[ptsFwd.length - 2]!;

    const fwd: HalfEdge = {
      id: halfEdges.length,
      edgeIdx: ge.idx,
      from: ge.u,
      to: ge.v,
      reversed: false,
      departAngle: normAngle(Math.atan2(p1.y - p0.y, p1.x - p0.x)),
      arriveBackAngle: normAngle(Math.atan2(pPrev.y - pLast.y, pPrev.x - pLast.x)),
      points: ptsFwd,
      sourceEntityId: ge.edge.sourceEntityId,
      elevationZ: ge.edge.elevationZ,
      extrudeHeight: ge.edge.extrudeHeight,
    };
    halfEdges.push(fwd);
    addOutgoing(fwd);

    const rev: HalfEdge = {
      id: halfEdges.length,
      edgeIdx: ge.idx,
      from: ge.v,
      to: ge.u,
      reversed: true,
      departAngle: normAngle(Math.atan2(pPrev.y - pLast.y, pPrev.x - pLast.x)),
      arriveBackAngle: normAngle(Math.atan2(p1.y - p0.y, p1.x - p0.x)),
      points: ptsRev,
      sourceEntityId: ge.edge.sourceEntityId,
      elevationZ: ge.edge.elevationZ,
      extrudeHeight: ge.edge.extrudeHeight,
    };
    halfEdges.push(rev);
    addOutgoing(rev);
  }

  // Primeiro: componentes simples onde todos os nós têm grau === 2 (caso mais comum em CAD limpo)
  const visitedSimpleEdge = new Set<number>();
  for (const ge of gEdges) {
    if (!active[ge.idx] || usedEdge[ge.idx] || visitedSimpleEdge.has(ge.idx)) continue;
    const degU = (outgoing.get(ge.u) ?? []).length;
    const degV = (outgoing.get(ge.v) ?? []).length;
    if (degU !== 2 || degV !== 2) continue;

    // Tenta encadear diretamente um ciclo simples de grau 2
    const chainPts: Vec2[] = [];
    const sourceIds = new Set<string>();
    let curNode = ge.u;
    let curEdgeIdx = ge.idx;
    let validSimpleCycle = true;
    let steps = 0;
    const localVisited = new Set<number>();
    let elevationZ = ge.edge.elevationZ;
    let extrudeHeight = ge.edge.extrudeHeight;

    while (steps <= gEdges.length + 2) {
      steps++;
      localVisited.add(curEdgeIdx);
      const curG = gEdges[curEdgeIdx]!;
      const forward = curG.u === curNode;
      const segPts = forward ? curG.edge.points : curG.edge.points.slice().reverse();
      sourceIds.add(curG.edge.sourceEntityId);
      if (extrudeHeight === undefined && curG.edge.extrudeHeight !== undefined) {
        extrudeHeight = curG.edge.extrudeHeight;
      }

      if (chainPts.length === 0) {
        chainPts.push(...segPts);
      } else {
        chainPts.push(...segPts.slice(1));
      }

      const nextNode = forward ? curG.v : curG.u;
      if (nextNode === ge.u) {
        break; // Fechou perfeitamente!
      }
      const outs = outgoing.get(nextNode) ?? [];
      if (outs.length !== 2) {
        validSimpleCycle = false;
        break;
      }
      const nextHe = outs.find((he) => he.edgeIdx !== curEdgeIdx);
      if (!nextHe || localVisited.has(nextHe.edgeIdx)) {
        validSimpleCycle = false;
        break;
      }
      curNode = nextNode;
      curEdgeIdx = nextHe.edgeIdx;
    }

    if (validSimpleCycle && steps <= gEdges.length + 1) {
      for (const eIdx of localVisited) {
        visitedSimpleEdge.add(eIdx);
        usedEdge[eIdx] = true;
      }
      const cleaned = cleanClosedPolygon(chainPts);
      const area = signedAreaShoelace(cleaned);
      if (cleaned.length >= 3 && Math.abs(area) >= 0.5) {
        loops.push({
          id: `loop-chain-${loops.length}`,
          points: cleaned,
          signedArea: area,
          absArea: Math.abs(area),
          bbox: computeBBox(cleaned),
          isPureCircle: false,
          sourceEntityIds: [...sourceIds],
          elevationZ,
          extrudeHeight,
        });
      }
    }
  }

  // Segundo: extração Half-Edge / DCEL para quaisquer grafos com vértices de grau > 2 (junções T / malhas)
  const visitedHalfEdge = new Set<number>();
  const rawFaces: Array<{
    points: Vec2[];
    signedArea: number;
    sourceIds: string[];
    elevationZ: number;
    extrudeHeight?: number;
  }> = [];

  for (const startHe of halfEdges) {
    if (usedEdge[startHe.edgeIdx] || visitedHalfEdge.has(startHe.id)) continue;

    const cycleHes: HalfEdge[] = [];
    let cur: HalfEdge | undefined = startHe;
    let guard = 0;

    while (cur && !visitedHalfEdge.has(cur.id) && guard < halfEdges.length + 2) {
      guard++;
      visitedHalfEdge.add(cur.id);
      cycleHes.push(cur);

      const outs = (outgoing.get(cur.to) ?? []).filter((cand) => !usedEdge[cand.edgeIdx]);
      if (outs.length === 0) {
        cur = undefined;
        break;
      }

      // Regra DCEL: próxima meia-aresta com menor giro CCW positivo após `cur.arriveBackAngle`
      let bestNext: HalfEdge | undefined;
      let bestTurn = Infinity;
      const backAng = cur.arriveBackAngle;

      for (const cand of outs) {
        // Evita voltar imediatamente pela mesma aresta se houver alternativa
        if (cand.edgeIdx === cur.edgeIdx && outs.length > 1) continue;
        let turn = normAngle(cand.departAngle - backAng);
        if (turn < 1e-6) turn += TWO_PI;
        if (turn < bestTurn) {
          bestTurn = turn;
          bestNext = cand;
        }
      }

      cur = bestNext;
      if (cur && cur.id === startHe.id) {
        // Face fechada!
        const pts: Vec2[] = [];
        const srcIds = new Set<string>();
        let elev = startHe.elevationZ;
        let extH = startHe.extrudeHeight;
        for (const he of cycleHes) {
          srcIds.add(he.sourceEntityId);
          if (extH === undefined && he.extrudeHeight !== undefined) extH = he.extrudeHeight;
          if (pts.length === 0) pts.push(...he.points);
          else pts.push(...he.points.slice(1));
        }
        const cleaned = cleanClosedPolygon(pts);
        const area = signedAreaShoelace(cleaned);
        if (cleaned.length >= 3 && Math.abs(area) >= 0.5) {
          rawFaces.push({
            points: cleaned,
            signedArea: area,
            sourceIds: [...srcIds],
            elevationZ: elev,
            extrudeHeight: extH,
          });
        }
        break;
      }
    }
  }

  // Em grafos planares DCEL, cada componente conexo produz N faces internas (área positiva) + 1 face infinita externa (área negativa).
  // Mantemos as faces internas positivas (ou, caso haja apenas 1 face negativa pura, a maior única).
  const positiveFaces = rawFaces.filter((f) => f.signedArea > 0);
  const selectedFaces = positiveFaces.length > 0 ? positiveFaces : rawFaces;
  for (const f of selectedFaces) {
    loops.push({
      id: `loop-dcel-${loops.length}`,
      points: f.points,
      signedArea: f.signedArea,
      absArea: Math.abs(f.signedArea),
      bbox: computeBBox(f.points),
      isPureCircle: false,
      sourceEntityIds: f.sourceIds,
      elevationZ: f.elevationZ,
      extrudeHeight: f.extrudeHeight,
    });
  }

  let discardedCount = 0;
  for (let i = 0; i < gEdges.length; i++) {
    if (!active[i]) discardedCount++;
  }

  return { loops, discardedCount };
}

/**
 * Executa os Estágios 1, 2 e 3: filtra entidades reais, amostra curvas canonicamente,
 * divide interseções/T-junctions e costura todos os loops simples fechados.
 */
export function stitchPlanarLoops2D(
  entities: Entity[],
  chordToleranceMm = 0.15,
): {
  loops: PlanarStitchedLoop2D[];
  ignoredEntitiesCount: number;
  openSegmentsDiscarded: number;
} {
  const { realEntities, ignoredCount } = filterRealVectorEntities2D(entities);

  const closedLoops: PlanarStitchedLoop2D[] = [];
  const openAtoms: SplitAtom[] = [];
  const rawOpenEdges: OpenCurveEdge[] = [];

  for (const e of realEntities) {
    const elevationZ = typeof e.elevationZ === "number" && Number.isFinite(e.elevationZ) ? e.elevationZ : 0;
    const extrudeHeight =
      typeof e.extrudeHeight === "number" && Number.isFinite(e.extrudeHeight) && e.extrudeHeight > 0
        ? e.extrudeHeight
        : undefined;

    if (e.type === "circle") {
      const sampled = sampleEntityPoints(e, chordToleranceMm);
      const cleaned = cleanClosedPolygon(sampled.points);
      const area = signedAreaShoelace(cleaned);
      if (cleaned.length >= 3 && Math.abs(area) >= 0.5) {
        closedLoops.push({
          id: `loop-circle-${e.id}`,
          points: cleaned,
          signedArea: area,
          absArea: Math.abs(area),
          bbox: computeBBox(cleaned),
          isPureCircle: true,
          circleCenter: { x: e.cx, y: e.cy },
          circleRadius: e.r,
          sourceEntityIds: [e.id],
          elevationZ,
          extrudeHeight,
        });
      }
      continue;
    }

    if (e.type === "ellipse" || (e.type === "polyline" && e.closed) || (e.type === "path" && e.closed)) {
      const sampled = sampleEntityPoints(e, chordToleranceMm);
      const cleaned = cleanClosedPolygon(sampled.points);
      const area = signedAreaShoelace(cleaned);
      if (cleaned.length >= 3 && Math.abs(area) >= 0.5) {
        closedLoops.push({
          id: `loop-closed-${e.id}`,
          points: cleaned,
          signedArea: area,
          absArea: Math.abs(area),
          bbox: computeBBox(cleaned),
          isPureCircle: false,
          sourceEntityIds: [e.id],
          elevationZ,
          extrudeHeight,
        });
      }
      continue;
    }

    if (e.type === "line") {
      if (dist({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }) > 1e-4) {
        openAtoms.push({
          kind: "line",
          p1: { x: e.x1, y: e.y1 },
          p2: { x: e.x2, y: e.y2 },
          sourceEntityId: e.id,
          elevationZ,
          extrudeHeight,
        });
      }
      continue;
    }

    if (e.type === "arc") {
      if (e.r > 1e-4 && canonicalArcSweep(e.a0, e.a1) > 1e-5) {
        openAtoms.push({
          kind: "arc",
          cx: e.cx,
          cy: e.cy,
          r: e.r,
          a0: e.a0,
          a1: e.a1,
          sourceEntityId: e.id,
          elevationZ,
          extrudeHeight,
        });
      }
      continue;
    }

    if (e.type === "polyline" && !e.closed) {
      const sampled = sampleEntityPoints(e, chordToleranceMm);
      if (sampled.points.length >= 2) {
        // Se uma polilinha marcada como aberta tem primeiro e último ponto colados, fecha direto
        const pFirst = sampled.points[0]!;
        const pLast = sampled.points[sampled.points.length - 1]!;
        if (sampled.points.length >= 4 && dist(pFirst, pLast) <= 0.15) {
          const cleaned = cleanClosedPolygon(sampled.points);
          const area = signedAreaShoelace(cleaned);
          if (cleaned.length >= 3 && Math.abs(area) >= 0.5) {
            closedLoops.push({
              id: `loop-openpoly-closed-${e.id}`,
              points: cleaned,
              signedArea: area,
              absArea: Math.abs(area),
              bbox: computeBBox(cleaned),
              isPureCircle: false,
              sourceEntityIds: [e.id],
              elevationZ,
              extrudeHeight,
            });
            continue;
          }
        }
        for (let i = 0; i < sampled.points.length - 1; i++) {
          const p1 = sampled.points[i]!;
          const p2 = sampled.points[i + 1]!;
          if (dist(p1, p2) > 1e-4) {
            openAtoms.push({
              kind: "line",
              p1,
              p2,
              sourceEntityId: e.id,
              elevationZ,
              extrudeHeight,
            });
          }
        }
      }
      continue;
    }

    if (e.type === "path" && !e.closed) {
      const sampled = sampleEntityPoints(e, chordToleranceMm);
      if (sampled.points.length >= 2) {
        rawOpenEdges.push({
          id: `edge-path-${e.id}`,
          sourceEntityId: e.id,
          points: sampled.points,
          elevationZ,
          extrudeHeight,
        });
      }
    }
  }

  // Divide cruzamentos/T-junctions entre átomos abertos (linhas e arcos)
  const splitAtoms = splitCrossingAtoms(openAtoms);
  for (let i = 0; i < splitAtoms.length; i++) {
    const atom = splitAtoms[i]!;
    if (atom.kind === "line") {
      rawOpenEdges.push({
        id: `edge-line-${i}`,
        sourceEntityId: atom.sourceEntityId,
        points: [atom.p1, atom.p2],
        elevationZ: atom.elevationZ,
        extrudeHeight: atom.extrudeHeight,
      });
    } else {
      const pts = sampleCanonicalArcPoints(
        atom.cx,
        atom.cy,
        atom.r,
        atom.a0,
        atom.a1,
        chordToleranceMm,
      );
      if (pts.length >= 2) {
        rawOpenEdges.push({
          id: `edge-arc-${i}`,
          sourceEntityId: atom.sourceEntityId,
          points: pts,
          elevationZ: atom.elevationZ,
          extrudeHeight: atom.extrudeHeight,
        });
      }
    }
  }

  const dedupedEdges = deduplicateOpenEdges(rawOpenEdges, 0.02);
  const { loops: stitchedFromOpen, discardedCount } = extractClosedLoopsFromOpenEdges(
    dedupedEdges,
    0.15,
    0.8,
  );

  // Deduplica loops idênticos (mesmo centroide + área)
  const allLoops = [...closedLoops, ...stitchedFromOpen];
  const uniqueLoops: PlanarStitchedLoop2D[] = [];
  for (const loop of allLoops) {
    const cx = (loop.bbox.minX + loop.bbox.maxX) * 0.5;
    const cy = (loop.bbox.minY + loop.bbox.maxY) * 0.5;
    const isDup = uniqueLoops.some((u) => {
      const ux = (u.bbox.minX + u.bbox.maxX) * 0.5;
      const uy = (u.bbox.minY + u.bbox.maxY) * 0.5;
      return (
        Math.abs(u.absArea - loop.absArea) <= Math.max(0.5, loop.absArea * 0.005) &&
        Math.hypot(cx - ux, cy - uy) <= 0.25 &&
        Math.abs(u.elevationZ - loop.elevationZ) <= 0.1
      );
    });
    if (!isDup) uniqueLoops.push(loop);
  }

  return {
    loops: uniqueLoops,
    ignoredEntitiesCount: ignoredCount,
    openSegmentsDiscarded: discardedCount,
  };
}

/* ========================================================================== *
 *  ESTÁGIO 4 — ÁRVORE DE CONTENÇÃO PAR-ÍMPAR + CONSTRUTOR THREE.JS           *
 * ========================================================================== */

/**
 * Ray-casting de dupla precisão (par-ímpar) para testar se `pt` está estritamente dentro do polígono.
 */
export function pointInPolygonRayCast(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calcula um ponto garantidamente interno ao polígono (mesmo para polígonos côncavos como rasgo curvo!)
 * usando interseção de linha de varredura horizontal pelo centro vertical da bbox.
 */
export function computeGuaranteedInteriorPoint(polygon: Vec2[]): Vec2 {
  const n = polygon.length;
  if (n < 3) return polygon[0] ?? { x: 0, y: 0 };

  // 1. Tenta o centroide simples primeiro (funciona na maioria dos furos convexos e círculos)
  let cx = 0;
  let cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  const centroid = { x: cx / n, y: cy / n };
  if (pointInPolygonRayCast(centroid, polygon)) return centroid;

  // 2. Varredura horizontal em múltiplas alturas (funciona 100% em rasgos curvos em "banana" / côncavos!)
  const bbox = computeBBox(polygon);
  const scanFractions = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];
  for (const frac of scanFractions) {
    const y = bbox.minY + (bbox.maxY - bbox.minY) * frac;
    const xs: number[] = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = polygon[j]!;
      const b = polygon[i]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const midX = (xs[k]! + xs[k + 1]!) * 0.5;
      const cand = { x: midX, y };
      if (pointInPolygonRayCast(cand, polygon)) return cand;
    }
  }

  return polygon[0]!;
}

/**
 * Testa de forma robusta se `inner` está geometricamente contido em `outer`.
 */
function isLoopInsideLoop(inner: PlanarStitchedLoop2D, outer: PlanarStitchedLoop2D): boolean {
  if (inner.absArea >= outer.absArea - 1e-3) return false;
  if (Math.abs(inner.elevationZ - outer.elevationZ) > 0.2) return false;

  // Pré-filtro rápido de BBox (com margem pequena)
  const eps = 0.05;
  if (
    inner.bbox.minX < outer.bbox.minX - eps ||
    inner.bbox.maxX > outer.bbox.maxX + eps ||
    inner.bbox.minY < outer.bbox.minY - eps ||
    inner.bbox.maxY > outer.bbox.maxY + eps
  ) {
    return false;
  }

  // Testa ponto garantidamente interno ao `inner` + amostras de vértices afastados
  const interiorPt = computeGuaranteedInteriorPoint(inner.points);
  if (pointInPolygonRayCast(interiorPt, outer.points)) {
    return true;
  }
  const n = inner.points.length;
  let hits = 0;
  const sampleCount = Math.min(n, 5);
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.floor((i * n) / sampleCount);
    if (pointInPolygonRayCast(inner.points[idx]!, outer.points)) hits++;
  }
  return hits >= Math.ceil(sampleCount * 0.6);
}

/**
 * Constrói a Árvore de Contenção Par-Ímpar (Even-Odd Containment Tree):
 *  - Profundidade 0, 2, 4... -> Sólido Independente (contorno externo CCW);
 *  - Profundidade 1, 3, 5... -> Furo Passante atribuído exclusivamente ao seu pai imediato (CW).
 */
export function buildContainmentTree2D(
  loops: PlanarStitchedLoop2D[],
): PlanarSolidContainmentNode[] {
  if (loops.length === 0) return [];

  // Ordena por área absoluta decrescente (do maior para o menor)
  const sorted = [...loops].sort((a, b) => b.absArea - a.absArea);
  const parentIdx = new Array<number>(sorted.length).fill(-1);
  const depth = new Array<number>(sorted.length).fill(0);

  for (let i = 0; i < sorted.length; i++) {
    const child = sorted[i]!;
    // Como `sorted` está em ordem decrescente de área, o ÚLTIMO ancestral `j < i`
    // que contém `child` é garantidamente o pai imediato (menor área que contém `child`)!
    let immediateParent = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (isLoopInsideLoop(child, sorted[j]!)) {
        immediateParent = j;
        break;
      }
    }
    parentIdx[i] = immediateParent;
    depth[i] = immediateParent === -1 ? 0 : depth[immediateParent]! + 1;
  }

  const solidMap = new Map<number, PlanarSolidContainmentNode>();

  for (let i = 0; i < sorted.length; i++) {
    const d = depth[i]!;
    const loop = sorted[i]!;
    if (d % 2 === 0) {
      const orientedOuter: PlanarStitchedLoop2D = {
        ...loop,
        points: ensureWinding(loop.points, true),
        signedArea: Math.abs(loop.signedArea),
      };
      solidMap.set(i, {
        outer: orientedOuter,
        holes: [],
        nestingDepth: d,
        netAreaMm2: orientedOuter.absArea,
      });
    } else {
      const pIdx = parentIdx[i]!;
      const parentSolid = solidMap.get(pIdx);
      if (parentSolid) {
        const orientedHole: PlanarStitchedLoop2D = {
          ...loop,
          points: ensureWinding(loop.points, false),
          signedArea: -Math.abs(loop.signedArea),
        };
        parentSolid.holes.push(orientedHole);
        parentSolid.netAreaMm2 = Math.max(0, parentSolid.netAreaMm2 - orientedHole.absArea);
      }
    }
  }

  return [...solidMap.values()];
}

/**
 * Pipeline completo 2D -> Árvore Topológica de Sólidos e Furos.
 */
export function buildPlanarSolidsFromEntities2D(
  entities: Entity[],
  chordToleranceMm = 0.15,
): PlanarTo3DBuildResult {
  const { loops, ignoredEntitiesCount, openSegmentsDiscarded } = stitchPlanarLoops2D(
    entities,
    chordToleranceMm,
  );
  const solids = buildContainmentTree2D(loops);
  return {
    loops,
    solids,
    ignoredEntitiesCount,
    openSegmentsDiscarded,
  };
}

/**
 * Constrói `THREE.Shape` + `THREE.ExtrudeGeometry` matematicamente válidos e orientados
 * a partir da árvore de contenção (Externo CCW + Furos CW, `curveSegments: 1`, sem bevel).
 */
export function buildThreeExtrudedSolids(
  solids: PlanarSolidContainmentNode[],
  defaultThicknessMm: number,
  options?: { flipY?: boolean },
): BuiltExtrudedSolid3D[] {
  const flipY = options?.flipY ?? false;
  const mapPt = (p: Vec2): Vec2 => ({ x: p.x, y: flipY ? -p.y : p.y });
  const results: BuiltExtrudedSolid3D[] = [];

  for (const node of solids) {
    const outerPts = ensureWinding(node.outer.points.map(mapPt), true);
    if (outerPts.length < 3) continue;

    const shape = new THREE.Shape();
    shape.moveTo(outerPts[0]!.x, outerPts[0]!.y);
    for (let i = 1; i < outerPts.length; i++) {
      shape.lineTo(outerPts[i]!.x, outerPts[i]!.y);
    }
    shape.closePath();

    for (const hole of node.holes) {
      const holePts = ensureWinding(hole.points.map(mapPt), false);
      if (holePts.length < 3) continue;
      const holePath = new THREE.Path();
      holePath.moveTo(holePts[0]!.x, holePts[0]!.y);
      for (let i = 1; i < holePts.length; i++) {
        holePath.lineTo(holePts[i]!.x, holePts[i]!.y);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    }

    const depth = Math.max(0.2, node.outer.extrudeHeight ?? defaultThicknessMm);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    });
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const posAttr = geometry.getAttribute("position");
    const vertexCount = posAttr ? posAttr.count : 0;
    if (vertexCount <= 0) {
      geometry.dispose();
      continue;
    }

    const triangleCount = geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor(vertexCount / 3);

    results.push({
      node,
      shape,
      geometry,
      vertexCount,
      triangleCount,
    });
  }

  return results;
}

/**
 * Converte a saída da Árvore Topológica em entidades `polyline` fechadas limpas
 * (ou `circle` para furos circulares puros) preservando todos os atributos `elevationZ`
 * e `extrudeHeight` para integração imediata com `cadDirectModeling3D.ts` (Estágio 5).
 */
export function buildConsolidatedEntitiesForDirect3D(rawEntities: Entity[]): Entity[] {
  const { realEntities } = filterRealVectorEntities2D(rawEntities);
  const { loops } = stitchPlanarLoops2D(realEntities, 0.15);

  if (loops.length === 0) {
    return realEntities;
  }

  // Preserva metadados importantes (como structuralProfile / shellWallThickness) quando 1 loop vem de 1 entidade
  const entityById = new Map<string, Entity>();
  for (const e of realEntities) entityById.set(e.id, e);

  const out: Entity[] = [];
  for (let i = 0; i < loops.length; i++) {
    const loop = loops[i]!;
    const singleOrig =
      loop.sourceEntityIds.length === 1 ? entityById.get(loop.sourceEntityIds[0]!) : undefined;

    if (loop.isPureCircle && singleOrig && singleOrig.type === "circle") {
      out.push(singleOrig);
      continue;
    }

    // Se a entidade original já era uma polilinha fechada intacta (retângulo / polígono), preserva-a
    if (singleOrig && singleOrig.type === "polyline" && singleOrig.closed && !(singleOrig.bulges && singleOrig.bulges.some((b) => Math.abs(b) > 1e-4))) {
      out.push(singleOrig);
      continue;
    }

    out.push({
      id: singleOrig ? singleOrig.id : `stitched-loop-${i}-${loop.sourceEntityIds[0] ?? "0"}`,
      layer: singleOrig?.layer ?? "corte",
      group: singleOrig?.group,
      elevationZ: loop.elevationZ,
      extrudeHeight: loop.extrudeHeight,
      shellWallThickness: singleOrig?.shellWallThickness,
      sheetThickness: singleOrig?.sheetThickness,
      structuralProfile: singleOrig?.structuralProfile,
      type: "polyline",
      pts: loop.points,
      closed: true,
      params: {
        ...(singleOrig?.params ?? {}),
        stitchedFromIds: loop.sourceEntityIds,
        planarTo3DCanonical: true,
      },
    });
  }

  return out;
}
