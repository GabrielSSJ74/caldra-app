/**
 * CALDRA CHAMFER — AUTO-PROFILE REGIONS (HALF-EDGE / DCEL) E NOVAS ENTIDADES 2D (PILAR 3)
 *
 * - Decompõe qualquer grafo planar de linhas, arcos, círculos e splines (mesmo com divisões internas
 *   cruzando um retângulo ao meio) em faces planares mínimas (regiões fechadas) via Half-Edge (DCEL),
 *   ordenando semi-arestas por ângulo (atan2) e extraindo ciclos mínimos pela regra da curva mais à esquerda.
 * - Classifica contornos externos vs. furos internos por área com sinal (Shoelace) + Point-in-Polygon.
 * - Ignora automaticamente Geometria de Construção e Linhas de Centro (nunca fecham perfil).
 * - Implementa também: Spline Cúbica por pontos de controle, Offset Associativo, Fillet/Chamfer 2D em lote
 *   (3 modos: Distância Igual, Duas Distâncias d1×d2, Distância + Ângulo) e Texto Técnico Cut vs. Etch.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type SketchProfileCurve =
  | {
      id: string;
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isConstruction?: boolean;
      isCenterline?: boolean;
    }
  | {
      id: string;
      kind: "circle";
      cx: number;
      cy: number;
      radius: number;
      isConstruction?: boolean;
      isCenterline?: boolean;
    }
  | {
      id: string;
      kind: "arc";
      cx: number;
      cy: number;
      radius: number;
      startAngle: number;
      endAngle: number;
      ccw?: boolean;
      isConstruction?: boolean;
      isCenterline?: boolean;
    }
  | {
      id: string;
      kind: "spline";
      controlPoints: Array<{ x: number; y: number; handleIn?: Vec2; handleOut?: Vec2 }>;
      closed?: boolean;
      isConstruction?: boolean;
      isCenterline?: boolean;
    };

export interface AutoProfileRegion {
  id: string;
  outerLoop: Vec2[];
  holes: Vec2[][];
  area: number;
  centroid: Vec2;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  fillRgba: string;
  sourceCurveIds: string[];
}

export interface AssociativeOffsetSpec {
  id: string;
  sourceIds: string[];
  distance: number;
  side: "left" | "right";
  associated: boolean;
}

export type Chamfer2DMode = "equal" | "twoDistances" | "distanceAngle";

export interface BatchFilletChamferOptions {
  kind: "fillet" | "chamfer";
  radius?: number;
  chamferMode?: Chamfer2DMode;
  d1?: number;
  d2?: number;
  angleDeg?: number;
}

export interface TechnicalTextPath {
  mode: "cut" | "etch";
  text: string;
  heightMm: number;
  polylines: Vec2[][];
}

const EPS = 1e-6;
const SNAP_KEY = 1e4; // 0.0001 mm vertex welding precision

export function signedPolygonArea(pts: Vec2[]): number {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return 0.5 * sum;
}

export function polygonCentroid(pts: Vec2[]): Vec2 {
  const area = signedPolygonArea(pts);
  if (Math.abs(area) < 1e-9 || pts.length === 0) {
    let sx = 0, sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / Math.max(1, pts.length), y: sy / Math.max(1, pts.length) };
  }
  let cx = 0, cy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const intersect =
      pi.y > pt.y !== pj.y > pt.y &&
      pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y + 1e-18) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Avalia Spline Cúbica por pontos de controle com alças tangentes (Catmull-Rom / Bézier cúbica).
 */
export function evaluateCubicControlSpline(
  controlPoints: Array<{ x: number; y: number; handleIn?: Vec2; handleOut?: Vec2 }>,
  samplesPerSegment = 16,
  closed = false,
): Vec2[] {
  const n = controlPoints.length;
  if (n < 2) return controlPoints.map((p) => ({ x: p.x, y: p.y }));

  const out: Vec2[] = [];
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const p0 = controlPoints[i]!;
    const p3 = controlPoints[(i + 1) % n]!;
    const prev = controlPoints[(i - 1 + n) % n]!;
    const next = controlPoints[(i + 2) % n]!;

    const c1: Vec2 = p0.handleOut
      ? { x: p0.x + p0.handleOut.x, y: p0.y + p0.handleOut.y }
      : {
          x: p0.x + (p3.x - (i === 0 && !closed ? p0.x : prev.x)) / 6,
          y: p0.y + (p3.y - (i === 0 && !closed ? p0.y : prev.y)) / 6,
        };
    const c2: Vec2 = p3.handleIn
      ? { x: p3.x + p3.handleIn.x, y: p3.y + p3.handleIn.y }
      : {
          x: p3.x - ((i === segCount - 1 && !closed ? p3.x : next.x) - p0.x) / 6,
          y: p3.y - ((i === segCount - 1 && !closed ? p3.y : next.y) - p0.y) / 6,
        };

    const steps = Math.max(4, samplesPerSegment);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0.x +
        3 * mt * mt * t * c1.x +
        3 * mt * t * t * c2.x +
        t * t * t * p3.x;
      const y =
        mt * mt * mt * p0.y +
        3 * mt * mt * t * c1.y +
        3 * mt * t * t * c2.y +
        t * t * t * p3.y;
      out.push({ x, y });
    }
  }
  if (!closed) {
    const last = controlPoints[n - 1]!;
    out.push({ x: last.x, y: last.y });
  }
  return out;
}

interface RawSegment {
  a: Vec2;
  b: Vec2;
  curveId: string;
}

function segmentIntersectionParams(s1: RawSegment, s2: RawSegment): [number, number] | null {
  const dx1 = s1.b.x - s1.a.x;
  const dy1 = s1.b.y - s1.a.y;
  const dx2 = s2.b.x - s2.a.x;
  const dy2 = s2.b.y - s2.a.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;

  const rx = s2.a.x - s1.a.x;
  const ry = s2.a.y - s1.a.y;
  const t = (rx * dy2 - ry * dx2) / denom;
  const u = (rx * dy1 - ry * dx1) / denom;

  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))];
  }
  return null;
}

function splitAtIntersections(rawSegments: RawSegment[]): RawSegment[] {
  const splitParams: number[][] = rawSegments.map(() => [0, 1]);

  for (let i = 0; i < rawSegments.length; i++) {
    for (let j = i + 1; j < rawSegments.length; j++) {
      const hit = segmentIntersectionParams(rawSegments[i]!, rawSegments[j]!);
      if (hit) {
        splitParams[i]!.push(hit[0]);
        splitParams[j]!.push(hit[1]);
      }
    }
  }

  const out: RawSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i]!;
    const params = splitParams[i]!.sort((a, b) => a - b);
    const dedup: number[] = [params[0]!];
    for (let k = 1; k < params.length; k++) {
      if (params[k]! - dedup[dedup.length - 1]! > 1e-5) dedup.push(params[k]!);
    }
    for (let k = 0; k < dedup.length - 1; k++) {
      const t0 = dedup[k]!;
      const t1 = dedup[k + 1]!;
      const a = { x: seg.a.x + (seg.b.x - seg.a.x) * t0, y: seg.a.y + (seg.b.y - seg.a.y) * t0 };
      const b = { x: seg.a.x + (seg.b.x - seg.a.x) * t1, y: seg.a.y + (seg.b.y - seg.a.y) * t1 };
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-4) {
        out.push({ a, b, curveId: seg.curveId });
      }
    }
  }
  return out;
}

interface HalfEdge {
  id: number;
  from: number;
  to: number;
  twin: number;
  angle: number;
  curveId: string;
  next: number;
  visited: boolean;
}

/**
 * Extrai automaticamente todas as regiões fechadas (faces planares mínimas) via DCEL / Half-Edge,
 * ignorando geometria de construção e linhas de centro, e aninhando furos internos corretamente.
 */
export function extractAutoProfileRegions(curves: SketchProfileCurve[]): AutoProfileRegion[] {
  const activeCurves = curves.filter((c) => !c.isConstruction && !c.isCenterline);
  const rawSegments: RawSegment[] = [];
  const standaloneCircles: Array<{ id: string; poly: Vec2[]; area: number }> = [];

  for (const curve of activeCurves) {
    if (curve.kind === "line") {
      if (Math.hypot(curve.x2 - curve.x1, curve.y2 - curve.y1) > 1e-4) {
        rawSegments.push({
          a: { x: curve.x1, y: curve.y1 },
          b: { x: curve.x2, y: curve.y2 },
          curveId: curve.id,
        });
      }
    } else if (curve.kind === "circle") {
      if (curve.radius <= 1e-4) continue;
      const steps = 48;
      const poly: Vec2[] = [];
      for (let i = 0; i < steps; i++) {
        const th = (i / steps) * 2 * Math.PI;
        poly.push({
          x: curve.cx + curve.radius * Math.cos(th),
          y: curve.cy + curve.radius * Math.sin(th),
        });
      }
      // Se o círculo não intersectar nenhum segmento, mantém como ciclo isolado rápido;
      // se intersectar, decompõe no grafo planar.
      const intersectsOther = activeCurves.some(
        (other) => other.id !== curve.id && other.kind === "line" && lineMayTouchCircle(other, curve),
      );
      if (intersectsOther) {
        for (let i = 0; i < steps; i++) {
          rawSegments.push({ a: poly[i]!, b: poly[(i + 1) % steps]!, curveId: curve.id });
        }
      } else {
        standaloneCircles.push({
          id: curve.id,
          poly,
          area: Math.PI * curve.radius * curve.radius,
        });
      }
    } else if (curve.kind === "arc") {
      const steps = 24;
      let sweep = curve.endAngle - curve.startAngle;
      if (curve.ccw !== false && sweep <= 0) sweep += 2 * Math.PI;
      if (curve.ccw === false && sweep >= 0) sweep -= 2 * Math.PI;
      let prev = {
        x: curve.cx + curve.radius * Math.cos(curve.startAngle),
        y: curve.cy + curve.radius * Math.sin(curve.startAngle),
      };
      for (let i = 1; i <= steps; i++) {
        const th = curve.startAngle + (sweep * i) / steps;
        const curr = { x: curve.cx + curve.radius * Math.cos(th), y: curve.cy + curve.radius * Math.sin(th) };
        rawSegments.push({ a: prev, b: curr, curveId: curve.id });
        prev = curr;
      }
    } else if (curve.kind === "spline") {
      const pts = evaluateCubicControlSpline(curve.controlPoints, 12, curve.closed);
      for (let i = 0; i < pts.length - 1; i++) {
        rawSegments.push({ a: pts[i]!, b: pts[i + 1]!, curveId: curve.id });
      }
      if (curve.closed && pts.length >= 3) {
        rawSegments.push({ a: pts[pts.length - 1]!, b: pts[0]!, curveId: curve.id });
      }
    }
  }

  const candidateLoops: Array<{ pts: Vec2[]; area: number; curveIds: string[] }> = [];

  // 1) Processamento Half-Edge (DCEL) para segmentos e curvas divididas nas interseções
  if (rawSegments.length >= 3) {
    const split = splitAtIntersections(rawSegments);
    const vertexMap = new Map<string, number>();
    const vertices: Vec2[] = [];
    const getVertexId = (p: Vec2): number => {
      const key = `${Math.round(p.x * SNAP_KEY)},${Math.round(p.y * SNAP_KEY)}`;
      const found = vertexMap.get(key);
      if (found !== undefined) return found;
      const id = vertices.length;
      vertices.push(p);
      vertexMap.set(key, id);
      return id;
    };

    const edgeSet = new Set<string>();
    const halfEdges: HalfEdge[] = [];
    const outgoing: number[][] = [];

    for (const seg of split) {
      const u = getVertexId(seg.a);
      const v = getVertexId(seg.b);
      if (u === v) continue;
      const undirKey = u < v ? `${u}_${v}` : `${v}_${u}`;
      if (edgeSet.has(undirKey)) continue;
      edgeSet.add(undirKey);

      while (outgoing.length < vertices.length) outgoing.push([]);

      const idAB = halfEdges.length;
      const idBA = idAB + 1;
      const pu = vertices[u]!;
      const pv = vertices[v]!;

      halfEdges.push({
        id: idAB,
        from: u,
        to: v,
        twin: idBA,
        angle: Math.atan2(pv.y - pu.y, pv.x - pu.x),
        curveId: seg.curveId,
        next: -1,
        visited: false,
      });
      halfEdges.push({
        id: idBA,
        from: v,
        to: u,
        twin: idAB,
        angle: Math.atan2(pu.y - pv.y, pu.x - pv.x),
        curveId: seg.curveId,
        next: -1,
        visited: false,
      });

      outgoing[u]!.push(idAB);
      outgoing[v]!.push(idBA);
    }

    // Ordenar semi-arestas por ângulo (atan2) ao redor de cada vértice
    for (let v = 0; v < outgoing.length; v++) {
      outgoing[v]!.sort((ea, eb) => halfEdges[ea]!.angle - halfEdges[eb]!.angle);
    }

    // Regra DCEL: ao chegar em `to` pela semi-aresta `e`, a próxima semi-aresta da face mínima à esquerda
    // é a imediatamente anterior ao `twin(e)` na lista ordenada CCW em torno de `to`.
    for (const e of halfEdges) {
      const list = outgoing[e.to]!;
      if (list.length === 0) continue;
      const twinPos = list.indexOf(e.twin);
      const nextPos = (twinPos - 1 + list.length) % list.length;
      e.next = list[nextPos]!;
    }

    // Extrair ciclos mínimos
    for (const startEdge of halfEdges) {
      if (startEdge.visited || startEdge.next < 0) continue;
      const cyclePts: Vec2[] = [];
      const cIds = new Set<string>();
      let curr = startEdge.id;
      let guard = 0;
      let closedCycle = false;

      while (guard++ < halfEdges.length + 2) {
        const he = halfEdges[curr]!;
        if (he.visited) break;
        he.visited = true;
        cyclePts.push(vertices[he.from]!);
        cIds.add(he.curveId);
        curr = he.next;
        if (curr === startEdge.id) {
          closedCycle = true;
          break;
        }
      }

      if (closedCycle && cyclePts.length >= 3) {
        const sArea = signedPolygonArea(cyclePts);
        // Faces internas mínimas têm área positiva (CCW); a face infinita externa tem área negativa (CW)
        if (sArea > 1e-4) {
          candidateLoops.push({
            pts: cyclePts,
            area: sArea,
            curveIds: Array.from(cIds),
          });
        }
      }
    }
  }

  // 2) Adicionar círculos isolados como candidatos
  for (const c of standaloneCircles) {
    candidateLoops.push({
      pts: c.poly,
      area: c.area,
      curveIds: [c.id],
    });
  }

  // 3) Classificar aninhamento de ilhas e furos via Shoelace + Point-in-Polygon
  candidateLoops.sort((a, b) => b.area - a.area);

  const regions: AutoProfileRegion[] = [];
  const consumedAsHole = new Set<number>();

  for (let i = 0; i < candidateLoops.length; i++) {
    if (consumedAsHole.has(i)) continue;
    const outer = candidateLoops[i]!;
    const holes: Vec2[][] = [];
    let netArea = outer.area;
    const srcIds = new Set(outer.curveIds);

    for (let j = i + 1; j < candidateLoops.length; j++) {
      if (consumedAsHole.has(j)) continue;
      const inner = candidateLoops[j]!;
      const probe = polygonCentroid(inner.pts);
      if (pointInPolygon(probe, outer.pts)) {
        // Verifica se é filho direto (não contido em outro loop intermediário que também está dentro de outer)
        let deeperParent = false;
        for (let k = i + 1; k < j; k++) {
          if (k === j) continue;
          const mid = candidateLoops[k]!;
          if (pointInPolygon(polygonCentroid(mid.pts), outer.pts) && pointInPolygon(probe, mid.pts)) {
            deeperParent = true;
            break;
          }
        }
        if (!deeperParent) {
          holes.push([...inner.pts].reverse());
          netArea = Math.max(0, netArea - inner.area);
          for (const cid of inner.curveIds) srcIds.add(cid);
          consumedAsHole.add(j);
        }
      }
    }

    const bounds = computeBounds(outer.pts);
    regions.push({
      id: `region_${regions.length + 1}`,
      outerLoop: outer.pts,
      holes,
      area: Number(netArea.toFixed(4)),
      centroid: polygonCentroid(outer.pts),
      bounds,
      fillRgba: "rgba(56, 189, 248, 0.10)",
      sourceCurveIds: Array.from(srcIds),
    });
  }

  return regions;
}

function lineMayTouchCircle(
  line: Extract<SketchProfileCurve, { kind: "line" }>,
  circle: Extract<SketchProfileCurve, { kind: "circle" }>,
): boolean {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return false;
  const t = Math.max(0, Math.min(1, ((circle.cx - line.x1) * dx + (circle.cy - line.y1) * dy) / lenSq));
  const px = line.x1 + t * dx;
  const py = line.y1 + t * dy;
  return Math.hypot(px - circle.cx, py - circle.cy) <= circle.radius + 1e-3;
}

function computeBounds(pts: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 1-toque dentro da região sombreada seleciona exatamente a região (respeitando furos internos).
 */
export function hitTestProfileRegion(
  regions: AutoProfileRegion[],
  x: number,
  y: number,
): AutoProfileRegion | null {
  const pt = { x, y };
  const matches = regions.filter((r) => {
    if (x < r.bounds.minX || x > r.bounds.maxX || y < r.bounds.minY || y > r.bounds.maxY) return false;
    if (!pointInPolygon(pt, r.outerLoop)) return false;
    for (const h of r.holes) {
      if (pointInPolygon(pt, h)) return false;
    }
    return true;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.area - b.area);
  return matches[0]!;
}

/**
 * Offset Associativo de polilinha aberta ou fechada com junção miter limitada.
 */
export function computeAssociativeOffset(
  polyline: Vec2[],
  distance: number,
  closed = false,
): Vec2[] {
  const n = polyline.length;
  if (n < 2 || Math.abs(distance) < 1e-9) return polyline.map((p) => ({ ...p }));

  const segNormals: Vec2[] = [];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = polyline[i]!;
    const b = polyline[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.max(Math.hypot(dx, dy), 1e-9);
    segNormals.push({ x: -dy / len, y: dx / len });
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = polyline[i]!;
    if (!closed && i === 0) {
      const n0 = segNormals[0]!;
      out.push({ x: p.x + n0.x * distance, y: p.y + n0.y * distance });
    } else if (!closed && i === n - 1) {
      const nLast = segNormals[segNormals.length - 1]!;
      out.push({ x: p.x + nLast.x * distance, y: p.y + nLast.y * distance });
    } else {
      const nPrev = segNormals[(i - 1 + segCount) % segCount]!;
      const nCurr = segNormals[i % segCount]!;
      const bx = nPrev.x + nCurr.x;
      const by = nPrev.y + nCurr.y;
      const bLen = Math.hypot(bx, by);
      if (bLen < 1e-6) {
        out.push({ x: p.x + nCurr.x * distance, y: p.y + nCurr.y * distance });
      } else {
        const ux = bx / bLen;
        const uy = by / bLen;
        const denom = Math.max(0.25, ux * nCurr.x + uy * nCurr.y);
        const miter = Math.min(Math.abs(distance) * 4, Math.abs(distance) / denom) * Math.sign(distance);
        out.push({ x: p.x + ux * miter, y: p.y + uy * miter });
      }
    }
  }
  return out;
}

/**
 * Fillet / Chamfer 2D em lote sobre vértices de uma polilinha/polígono.
 * Suporta os 3 modos de chanfro: Distância Igual, Duas Distâncias (d1×d2) e Distância + Ângulo.
 */
export function applyBatchFilletChamfer2D(
  vertices: Vec2[],
  options: BatchFilletChamferOptions,
  closed = true,
  arcSamples = 8,
): Vec2[] {
  const n = vertices.length;
  if (n < 3) return vertices.map((v) => ({ ...v }));

  const out: Vec2[] = [];
  const startIdx = closed ? 0 : 1;
  const endIdx = closed ? n - 1 : n - 2;
  if (!closed) out.push({ ...vertices[0]! });

  for (let i = startIdx; i <= endIdx; i++) {
    const prev = vertices[(i - 1 + n) % n]!;
    const curr = vertices[i]!;
    const next = vertices[(i + 1) % n]!;

    const v1x = prev.x - curr.x, v1y = prev.y - curr.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) {
      out.push({ ...curr });
      continue;
    }
    const u1x = v1x / len1, u1y = v1y / len1;
    const u2x = v2x / len2, u2y = v2y / len2;

    if (options.kind === "chamfer") {
      const mode = options.chamferMode ?? "equal";
      let d1 = Math.max(0, options.d1 ?? options.radius ?? 2);
      let d2 = d1;
      if (mode === "twoDistances") {
        d2 = Math.max(0, options.d2 ?? d1);
      } else if (mode === "distanceAngle") {
        const angRad = Math.max(5, Math.min(85, options.angleDeg ?? 45)) * (Math.PI / 180);
        d2 = d1 * Math.tan(angRad);
      }
      const c1 = Math.min(d1, len1 * 0.45);
      const c2 = Math.min(d2, len2 * 0.45);
      out.push({ x: curr.x + u1x * c1, y: curr.y + u1y * c1 });
      out.push({ x: curr.x + u2x * c2, y: curr.y + u2y * c2 });
    } else {
      const r = Math.max(0, options.radius ?? 2);
      const dot = Math.max(-0.9999, Math.min(0.9999, u1x * u2x + u1y * u2y));
      const halfAngle = Math.acos(dot) / 2;
      const tanHalf = Math.tan(halfAngle);
      if (tanHalf < 1e-4 || r < 1e-6) {
        out.push({ ...curr });
        continue;
      }
      const maxTrim = Math.min(len1, len2) * 0.45;
      const trim = Math.min(r / tanHalf, maxTrim);
      const effR = trim * tanHalf;
      const pStart = { x: curr.x + u1x * trim, y: curr.y + u1y * trim };
      const pEnd = { x: curr.x + u2x * trim, y: curr.y + u2y * trim };

      const bisX = u1x + u2x;
      const bisY = u1y + u2y;
      const bisLen = Math.max(Math.hypot(bisX, bisY), 1e-9);
      const centerDist = effR / Math.sin(halfAngle);
      const cx = curr.x + (bisX / bisLen) * centerDist;
      const cy = curr.y + (bisY / bisLen) * centerDist;

      const a0 = Math.atan2(pStart.y - cy, pStart.x - cx);
      let a1 = Math.atan2(pEnd.y - cy, pEnd.x - cx);
      let da = a1 - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;

      const steps = Math.max(2, arcSamples);
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (da * s) / steps;
        out.push({ x: cx + effR * Math.cos(a), y: cy + effR * Math.sin(a) });
      }
    }
  }

  if (!closed) out.push({ ...vertices[n - 1]! });
  return out;
}

/**
 * Gera caminhos vetoriais de Texto Técnico para Laser:
 * - `etch`: traço simples (single-stroke) para gravação rápida a laser (camada ETCH).
 * - `cut`: contorno fechado espessado pronto para corte/extrusão (camada CUT).
 */
export function generateTechnicalTextPaths(
  text: string,
  heightMm: number,
  mode: "cut" | "etch",
  origin: Vec2 = { x: 0, y: 0 },
): TechnicalTextPath {
  const h = Math.max(2, Math.min(500, heightMm));
  const w = h * 0.62;
  const spacing = h * 0.82;
  const polylines: Vec2[][] = [];
  const clean = (text || "").toUpperCase();

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    const ox = origin.x + i * spacing;
    const oy = origin.y;
    const strokes = getVectorGlyphStrokes(ch);
    for (const stroke of strokes) {
      const pts = stroke.map(([nx, ny]) => ({ x: ox + nx * w, y: oy + ny * h }));
      if (mode === "etch") {
        polylines.push(pts);
      } else {
        // Contorno fechado (espessura = 12% da altura) para corte/extrusão
        const halfThick = Math.max(0.4, h * 0.06);
        const left = computeAssociativeOffset(pts, halfThick, false);
        const right = computeAssociativeOffset(pts, -halfThick, false).reverse();
        polylines.push([...left, ...right, left[0]!]);
      }
    }
  }

  return { mode, text: clean, heightMm: h, polylines };
}

function getVectorGlyphStrokes(ch: string): Array<Array<[number, number]>> {
  const glyphs: Record<string, Array<Array<[number, number]>>> = {
    A: [[[0, 0], [0.5, 1], [1, 0]], [[0.2, 0.35], [0.8, 0.35]]],
    B: [[[0, 0], [0, 1], [0.7, 1], [0.9, 0.8], [0.7, 0.5], [0, 0.5]], [[0.7, 0.5], [0.95, 0.25], [0.7, 0], [0, 0]]],
    C: [[[1, 0.85], [0.7, 1], [0.25, 1], [0, 0.7], [0, 0.3], [0.25, 0], [0.7, 0], [1, 0.15]]],
    D: [[[0, 0], [0, 1], [0.65, 1], [1, 0.65], [1, 0.35], [0.65, 0], [0, 0]]],
    E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.5], [0.75, 0.5]]],
    F: [[[1, 1], [0, 1], [0, 0]], [[0, 0.5], [0.75, 0.5]]],
    H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    I: [[[0.5, 0], [0.5, 1]], [[0.2, 1], [0.8, 1]], [[0.2, 0], [0.8, 0]]],
    L: [[[0, 1], [0, 0], [1, 0]]],
    M: [[[0, 0], [0, 1], [0.5, 0.45], [1, 1], [1, 0]]],
    N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
    O: [[[0.2, 0], [0.8, 0], [1, 0.25], [1, 0.75], [0.8, 1], [0.2, 1], [0, 0.75], [0, 0.25], [0.2, 0]]],
    P: [[[0, 0], [0, 1], [0.75, 1], [1, 0.75], [0.75, 0.5], [0, 0.5]]],
    R: [[[0, 0], [0, 1], [0.75, 1], [1, 0.75], [0.75, 0.5], [0, 0.5]], [[0.55, 0.5], [1, 0]]],
    S: [[[1, 0.85], [0.75, 1], [0.25, 1], [0, 0.75], [0.25, 0.5], [0.75, 0.5], [1, 0.25], [0.75, 0], [0.25, 0], [0, 0.15]]],
    T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
    U: [[[0, 1], [0, 0.25], [0.25, 0], [0.75, 0], [1, 0.25], [1, 1]]],
    V: [[[0, 1], [0.5, 0], [1, 1]]],
    X: [[[0, 0], [1, 1]], [[0, 1], [1, 0]]],
    "0": [[[0.2, 0], [0.8, 0], [1, 0.25], [1, 0.75], [0.8, 1], [0.2, 1], [0, 0.75], [0, 0.25], [0.2, 0]], [[0.15, 0.15], [0.85, 0.85]]],
    "1": [[[0.25, 0.75], [0.55, 1], [0.55, 0]], [[0.2, 0], [0.9, 0]]],
    "2": [[[0, 0.75], [0.25, 1], [0.75, 1], [1, 0.75], [0, 0], [1, 0]]],
    "3": [[[0, 0.85], [0.25, 1], [0.75, 1], [1, 0.75], [0.7, 0.5], [1, 0.25], [0.75, 0], [0.25, 0], [0, 0.15]]],
    "4": [[[0.75, 0], [0.75, 1], [0, 0.35], [1, 0.35]]],
    "5": [[[1, 1], [0, 1], [0, 0.55], [0.75, 0.55], [1, 0.3], [0.75, 0], [0.2, 0], [0, 0.15]]],
    "-": [[[0.15, 0.5], [0.85, 0.5]]],
    ".": [[[0.45, 0], [0.55, 0], [0.55, 0.1], [0.45, 0.1], [0.45, 0]]],
  };
  return glyphs[ch] ?? (ch === " " ? [] : [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]);
}
