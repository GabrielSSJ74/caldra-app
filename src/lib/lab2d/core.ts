import type { Vec2 } from "@/lib/geometry/types";
import type { DxfDocument, DxfEntity } from "@/lib/dxf/dxfService";
import {
  flattenPath,
  mapPath,
  pathAnchors,
  pathSegments,
  samplePath,
  type BezierSeg,
} from "@/lib/lab2d/bezier";
import {
  BEND_COLOR,
  CONSTRUCTION_COLOR,
  CUT_COLOR,
  DIMENSION_COLOR,
  MARK_COLOR,
  REFERENCE_COLOR,
  techColor,
  type TechLayerId,
} from "@/lib/lab2d/technical";

export type LayerId = string;

export type Layer = {
  id: LayerId;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
};

/** Camadas técnicas com cores fixas do CALDRA (nunca derivadas do tema). */
export const DEFAULT_LAYERS: Layer[] = [
  { id: "construcao", name: "Construção", color: CONSTRUCTION_COLOR, visible: true, locked: false },
  { id: "referencia", name: "Referência", color: REFERENCE_COLOR, visible: true, locked: false },
  { id: "dobra", name: "Dobra", color: BEND_COLOR, visible: true, locked: false },
  { id: "marcacao", name: "Marcação", color: MARK_COLOR, visible: true, locked: false },
  { id: "corte", name: "Corte", color: CUT_COLOR, visible: true, locked: false },
  { id: "cota", name: "Cota", color: DIMENSION_COLOR, visible: true, locked: false },
];


type Base = { id: string; layer: LayerId; group?: string };
export type Entity =
  | (Base & { type: "line"; x1: number; y1: number; x2: number; y2: number })
  | (Base & { type: "polyline"; pts: Vec2[]; closed: boolean })
  | (Base & { type: "circle"; cx: number; cy: number; r: number })
  | (Base & { type: "arc"; cx: number; cy: number; r: number; a0: number; a1: number })
  | (Base & {
      /** Curva de Bézier cúbica — fidelidade máxima com poucos pontos. */
      type: "path";
      start: Vec2;
      segs: BezierSeg[];
      closed: boolean;
      /** Contorno interno (furo de letra) — corte com offset interno. */
      hole?: boolean;
      /** Id do contorno externo que contém este furo. */
      parent?: string;
    })
  | (Base & { type: "text"; x: number; y: number; text: string; size: number });

export type PathEntity = Extract<Entity, { type: "path" }>;

export const uid = () => Math.random().toString(36).slice(2, 9);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/* ------------------------------------------------------------------ pontos */

export function entityPoints(e: Entity): Vec2[] {
  switch (e.type) {
    case "line":
      return [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 },
      ];
    case "polyline":
      return e.pts;
    case "circle":
      return [
        { x: e.cx, y: e.cy },
        { x: e.cx + e.r, y: e.cy },
        { x: e.cx - e.r, y: e.cy },
        { x: e.cx, y: e.cy + e.r },
        { x: e.cx, y: e.cy - e.r },
      ];
    case "arc":
      return [
        { x: e.cx, y: e.cy },
        { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) },
        { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) },
      ];
    case "path":
      return pathAnchors(e.start, e.segs);
    case "text":
      return [{ x: e.x, y: e.y }];
  }
}

/** Pontos usados para enquadramento e hit-test (curvas entram amostradas). */
export function outlinePoints(e: Entity): Vec2[] {
  return e.type === "path" ? samplePath(e.start, e.segs, e.closed, 10) : entityPoints(e);
}


export type Snap = { p: Vec2; kind: "grid" | "end" | "mid" | "center" | "cross" | "near" };

export function segmentsOf(e: Entity): [Vec2, Vec2][] {
  if (e.type === "line")
    return [
      [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 },
      ],
    ];
  if (e.type === "polyline") {
    const out: [Vec2, Vec2][] = [];
    for (let i = 0; i < e.pts.length - 1; i++) out.push([e.pts[i]!, e.pts[i + 1]!]);
    if (e.closed && e.pts.length > 2) out.push([e.pts[e.pts.length - 1]!, e.pts[0]!]);
    return out;
  }
  return [];
}

export function lineIntersection(
  a: [Vec2, Vec2],
  b: [Vec2, Vec2],
  bounded = true,
): Vec2 | null {
  const [p1, p2] = a;
  const [p3, p4] = b;
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (bounded && (t < 0 || t > 1 || u < 0 || u > 1)) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

export function closestOnSegment(p: Vec2, s: [Vec2, Vec2]): Vec2 {
  const [a, b] = s;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Encontra o melhor ponto de captura próximo ao cursor. */
export function findSnap(
  cursor: Vec2,
  entities: Entity[],
  tol: number,
  grid: number,
  enabled: { grid: boolean; object: boolean },
): Snap | null {
  const cands: Snap[] = [];
  if (enabled.object) {
    const segs = entities.flatMap(segmentsOf);
    for (const e of entities) {
      if (e.type === "circle" || e.type === "arc")
        cands.push({ p: { x: e.cx, y: e.cy }, kind: "center" });
      for (const p of entityPoints(e)) if (e.type !== "circle") cands.push({ p, kind: "end" });
    }
    for (const s of segs)
      cands.push({ p: { x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 }, kind: "mid" });
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const x = lineIntersection(segs[i]!, segs[j]!);
        if (x) cands.push({ p: x, kind: "cross" });
      }
    for (const s of segs) cands.push({ p: closestOnSegment(cursor, s), kind: "near" });
  }
  if (enabled.grid)
    cands.push({
      p: { x: Math.round(cursor.x / grid) * grid, y: Math.round(cursor.y / grid) * grid },
      kind: "grid",
    });

  const rank: Record<Snap["kind"], number> = { end: 0, cross: 1, center: 2, mid: 3, near: 5, grid: 4 };
  const hit = cands
    .filter((c) => dist(c.p, cursor) <= tol)
    .sort((a, b) => rank[a.kind] - rank[b.kind] || dist(a.p, cursor) - dist(b.p, cursor));
  return hit[0] ?? null;
}

/* ------------------------------------------------------- transformações */

export function mapEntity(e: Entity, f: (p: Vec2) => Vec2, scale = 1): Entity {
  switch (e.type) {
    case "line": {
      const a = f({ x: e.x1, y: e.y1 });
      const b = f({ x: e.x2, y: e.y2 });
      return { ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "polyline":
      return { ...e, pts: e.pts.map(f) };
    case "circle": {
      const c = f({ x: e.cx, y: e.cy });
      return { ...e, cx: c.x, cy: c.y, r: e.r * Math.abs(scale) };
    }
    case "arc": {
      const c = f({ x: e.cx, y: e.cy });
      return { ...e, cx: c.x, cy: c.y, r: e.r * Math.abs(scale) };
    }
    case "text": {
      const c = f({ x: e.x, y: e.y });
      return { ...e, x: c.x, y: c.y };
    }
  }
}

export const translate = (e: Entity, dx: number, dy: number) =>
  mapEntity(e, (p) => ({ x: p.x + dx, y: p.y + dy }));

export const rotate = (e: Entity, o: Vec2, deg: number) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return mapEntity(e, (p) => ({
    x: o.x + (p.x - o.x) * c - (p.y - o.y) * s,
    y: o.y + (p.x - o.x) * s + (p.y - o.y) * c,
  }));
};

export const scaleEntity = (e: Entity, o: Vec2, k: number) =>
  mapEntity(e, (p) => ({ x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k }), k);

export const mirror = (e: Entity, o: Vec2, axis: "x" | "y") =>
  mapEntity(e, (p) =>
    axis === "x" ? { x: 2 * o.x - p.x, y: p.y } : { x: p.x, y: 2 * o.y - p.y },
  );

/* ------------------------------------------------------------ bounding box */

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export function bbox(entities: Entity[]): Box | null {
  if (!entities.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const e of entities)
    for (const p of entityPoints(e)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  return { minX, minY, maxX, maxY };
}

export function boxOf(e: Entity): Box {
  return bbox([e])!;
}

export function inside(b: Box, o: Box) {
  return b.minX >= o.minX && b.maxX <= o.maxX && b.minY >= o.minY && b.maxY <= o.maxY;
}
export function overlaps(b: Box, o: Box) {
  return !(b.minX > o.maxX || b.maxX < o.minX || b.minY > o.maxY || b.maxY < o.minY);
}

/* ------------------------------------------------------------- construção */

export const rectPolyline = (a: Vec2, b: Vec2, layer: LayerId, radius = 0): Entity => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  if (radius <= 0)
    return {
      id: uid(),
      layer,
      type: "polyline",
      closed: true,
      pts: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
    };
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  const arc = (cx: number, cy: number, s: number) =>
    Array.from({ length: 7 }, (_, i) => {
      const t = s + (i / 6) * (Math.PI / 2);
      return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
    });
  return {
    id: uid(),
    layer,
    type: "polyline",
    closed: true,
    pts: [
      ...arc(x0 + r, y0 + r, Math.PI),
      ...arc(x1 - r, y0 + r, -Math.PI / 2),
      ...arc(x1 - r, y1 - r, 0),
      ...arc(x0 + r, y1 - r, Math.PI / 2),
    ],
  };
};

export const polygonEntity = (c: Vec2, r: number, sides: number, layer: LayerId): Entity => ({
  id: uid(),
  layer,
  type: "polyline",
  closed: true,
  pts: Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  }),
});

/* ------------------------------------------------------------------ offset */

export function offsetEntity(e: Entity, d: number): Entity | null {
  if (e.type === "circle") return e.r + d > 0 ? { ...e, id: uid(), r: e.r + d } : null;
  const shift = (pts: Vec2[], closed: boolean): Vec2[] => {
    const out: Vec2[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]!;
      const cur = pts[i]!;
      const next = pts[(i + 1) % n]!;
      const nrm = (a: Vec2, b: Vec2) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        return { x: dy / l, y: -dx / l };
      };
      const n1 = i === 0 && !closed ? nrm(cur, next) : nrm(prev, cur);
      const n2 = i === n - 1 && !closed ? nrm(prev, cur) : nrm(cur, next);
      const nx = (n1.x + n2.x) / 2;
      const ny = (n1.y + n2.y) / 2;
      const l = Math.hypot(nx, ny) || 1;
      out.push({ x: cur.x + (nx / l) * d, y: cur.y + (ny / l) * d });
    }
    return out;
  };
  if (e.type === "polyline") return { ...e, id: uid(), pts: shift(e.pts, e.closed) };
  if (e.type === "line") {
    const [a, b] = [
      { x: e.x1, y: e.y1 },
      { x: e.x2, y: e.y2 },
    ];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const ox = (dy / l) * d;
    const oy = (-dx / l) * d;
    return { ...e, id: uid(), x1: a.x + ox, y1: a.y + oy, x2: b.x + ox, y2: b.y + oy };
  }
  return null;
}

/* -------------------------------------------------------- trim / extend / fillet */

/** Apara a linha `target` no cruzamento com `cutter`, removendo o lado clicado. */
export function trimLine(target: Entity, cutter: Entity, click: Vec2): Entity | null {
  if (target.type !== "line") return null;
  const ts = segmentsOf(target)[0]!;
  for (const cs of segmentsOf(cutter)) {
    const x = lineIntersection(ts, cs, true);
    if (!x) continue;
    const keepStart = dist(click, ts[0]) > dist(click, ts[1]);
    return keepStart
      ? { ...target, x2: x.x, y2: x.y }
      : { ...target, x1: x.x, y1: x.y };
  }
  return null;
}

/** Prolonga a linha até encontrar a outra geometria. */
export function extendLine(target: Entity, other: Entity): Entity | null {
  if (target.type !== "line") return null;
  const ts = segmentsOf(target)[0]!;
  for (const cs of segmentsOf(other)) {
    const x = lineIntersection(ts, cs, false);
    if (!x) continue;
    return dist(x, ts[1]) < dist(x, ts[0])
      ? { ...target, x2: x.x, y2: x.y }
      : { ...target, x1: x.x, y1: x.y };
  }
  return null;
}

/** Concordância entre duas linhas: encurta ambas e devolve o arco de raio R. */
export function filletLines(
  a: Entity,
  b: Entity,
  r: number,
): { a: Entity; b: Entity; arc: Entity } | null {
  if (a.type !== "line" || b.type !== "line") return null;
  const sa = segmentsOf(a)[0]!;
  const sb = segmentsOf(b)[0]!;
  const x = lineIntersection(sa, sb, false);
  if (!x) return null;
  const dirTo = (s: [Vec2, Vec2]) => {
    const far = dist(x, s[0]) > dist(x, s[1]) ? s[0] : s[1];
    const l = dist(x, far) || 1;
    return { x: (far.x - x.x) / l, y: (far.y - x.y) / l };
  };
  const da = dirTo(sa);
  const db = dirTo(sb);
  const ang = Math.acos(Math.max(-1, Math.min(1, da.x * db.x + da.y * db.y)));
  if (ang < 0.05 || ang > Math.PI - 0.05) return null;
  const t = r / Math.tan(ang / 2);
  const pa = { x: x.x + da.x * t, y: x.y + da.y * t };
  const pb = { x: x.x + db.x * t, y: x.y + db.y * t };
  const bis = { x: da.x + db.x, y: da.y + db.y };
  const bl = Math.hypot(bis.x, bis.y) || 1;
  const cd = r / Math.sin(ang / 2);
  const c = { x: x.x + (bis.x / bl) * cd, y: x.y + (bis.y / bl) * cd };
  const setNear = (e: Entity, s: [Vec2, Vec2], p: Vec2): Entity => {
    if (e.type !== "line") return e;
    return dist(x, s[0]) < dist(x, s[1])
      ? { ...e, x1: p.x, y1: p.y }
      : { ...e, x2: p.x, y2: p.y };
  };
  const a0 = Math.atan2(pa.y - c.y, pa.x - c.x);
  const a1 = Math.atan2(pb.y - c.y, pb.x - c.x);
  return {
    a: setNear(a, sa, pa),
    b: setNear(b, sb, pb),
    arc: { id: uid(), layer: a.layer, type: "arc", cx: c.x, cy: c.y, r, a0, a1 },
  };
}

/** Chanfro: corta o canto entre duas linhas com um segmento reto. */
export function chamferLines(a: Entity, b: Entity, d1: number, d2: number) {
  const res = filletLines(a, b, Math.min(d1, d2));
  if (!res) return null;
  const arc = res.arc as Extract<Entity, { type: "arc" }>;
  const p1 = { x: arc.cx + arc.r * Math.cos(arc.a0), y: arc.cy + arc.r * Math.sin(arc.a0) };
  const p2 = { x: arc.cx + arc.r * Math.cos(arc.a1), y: arc.cy + arc.r * Math.sin(arc.a1) };
  return {
    a: res.a,
    b: res.b,
    seg: {
      id: uid(),
      layer: a.layer,
      type: "line",
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
    } as Entity,
  };
}

/* ------------------------------------------------------------- otimização */

export function optimize(entities: Entity[], tol = 0.05) {
  const seen = new Set<string>();
  const out: Entity[] = [];
  let removed = 0;
  let tiny = 0;
  for (const e of entities) {
    if (e.type === "line") {
      const l = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      if (l < tol) {
        tiny++;
        continue;
      }
      const key = [e.x1, e.y1, e.x2, e.y2]
        .map((n) => n.toFixed(2))
        .sort()
        .join("|");
      if (seen.has(key)) {
        removed++;
        continue;
      }
      seen.add(key);
    }
    out.push(e);
  }
  return { entities: out, removed, tiny };
}

export type Issue = { message: string; p: Vec2 };

/** Verificação geométrica: contornos abertos, segmentos mínimos e duplicações. */
export function verify(entities: Entity[]): Issue[] {
  const issues: Issue[] = [];
  for (const e of entities) {
    if (e.type === "polyline" && !e.closed && e.pts.length > 2) {
      const a = e.pts[0]!;
      const b = e.pts[e.pts.length - 1]!;
      if (dist(a, b) > 0.1) issues.push({ message: "Contorno aberto", p: b });
    }
    if (e.type === "line" && Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 0.5)
      issues.push({ message: "Segmento mínimo", p: { x: e.x1, y: e.y1 } });
  }
  const keys = new Map<string, Vec2>();
  for (const e of entities) {
    if (e.type !== "line") continue;
    const key = [e.x1, e.y1, e.x2, e.y2].map((n) => n.toFixed(2)).sort().join("|");
    if (keys.has(key)) issues.push({ message: "Entidade duplicada", p: keys.get(key)! });
    else keys.set(key, { x: e.x1, y: e.y1 });
  }
  return issues;
}

/* -------------------------------------------------------------------- DXF */

/** Índice ACI aproximado por camada técnica (o hex exato vai no grupo 420). */
const DXF_ACI: Record<TechLayerId, number> = {
  corte: 1, // vermelho
  marcacao: 30, // laranja/âmbar
  dobra: 200, // violeta
  cota: 4, // ciano
  construcao: 8, // cinza
  referencia: 9, // cinza claro
};

export function toDxf(entities: Entity[], layers: Layer[]): DxfDocument {
  const out: DxfEntity[] = [];
  for (const e of entities) {
    const layer = e.layer.toUpperCase();
    if (e.type === "line")
      out.push({ type: "LINE", layer, start: { x: e.x1, y: -e.y1 }, end: { x: e.x2, y: -e.y2 } });
    if (e.type === "polyline")
      out.push({
        type: "LWPOLYLINE",
        layer,
        closed: e.closed,
        points: e.pts.map((p) => ({ x: p.x, y: -p.y })),
      });
    if (e.type === "circle")
      out.push({ type: "CIRCLE", layer, center: { x: e.cx, y: -e.cy }, radius: e.r });
    if (e.type === "arc") {
      // espelho em Y inverte o sentido: os ângulos trocam de ordem e de sinal
      const deg = (r: number) => ((-r * 180) / Math.PI + 360) % 360;
      out.push({
        type: "ARC",
        layer,
        center: { x: e.cx, y: -e.cy },
        radius: e.r,
        startAngle: deg(e.a1),
        endAngle: deg(e.a0),
      });
    }

  }
  return {
    // ACI aproximado por camada + true color com o hex técnico fixo do CHAMFER
    layers: layers.map((l, i) => {
      const hex = techColor(l.id);
      const trueColor = parseInt(hex.slice(1), 16);
      const aci = DXF_ACI[l.id as TechLayerId] ?? i + 1;
      return { name: l.name.toUpperCase(), color: aci, trueColor };
    }),
    entities: out,
  };
}

export function fromDxf(doc: DxfDocument, layer: LayerId): Entity[] {
  const out: Entity[] = [];
  for (const e of doc.entities) {
    if (e.type === "LINE")
      out.push({
        id: uid(),
        layer,
        type: "line",
        x1: e.start.x,
        y1: -e.start.y,
        x2: e.end.x,
        y2: -e.end.y,
      });
    if (e.type === "CIRCLE")
      out.push({ id: uid(), layer, type: "circle", cx: e.center.x, cy: -e.center.y, r: e.radius });
    if (e.type === "LWPOLYLINE")
      out.push({
        id: uid(),
        layer,
        type: "polyline",
        closed: !!e.closed,
        pts: e.points.map((p) => ({ x: p.x, y: -p.y })),
      });
    if (e.type === "ARC") {
      const rad = (d: number) => (-d * Math.PI) / 180;
      out.push({
        id: uid(),
        layer,
        type: "arc",
        cx: e.center.x,
        cy: -e.center.y,
        r: e.radius,
        a0: rad(e.endAngle),
        a1: rad(e.startAngle),
      });
    }
  }

  return out;
}
