/**
 * SISTEMA DE COTAGEM DO CHAMFER — DIMENSION ENTITIES ASSOCIATIVAS.
 *
 * Arquitetura (regra absoluta do CALDRA):
 *
 *    GEOMETRIA            → fonte dos valores dimensionais
 *    MANUFACTURING ROLE   → função de fabricação
 *    DIMENSION            → informação de cotagem (nunca vira corte)
 *    GROUP                → estrutura de edição (nunca define função)
 *
 * Uma cota NÃO guarda o valor: ela guarda REFERÊNCIAS à geometria e mede a
 * cada leitura. Se a linha muda de 500 para 650 mm, a cota passa a 650 mm
 * sozinha. Editar propriedades visuais de uma cota nunca altera geometria.
 */

import type { Vec2 } from "@/lib/geometry/types";
import { lineIntersection, uid, type Entity } from "./core";

/* ------------------------------------------------------------------ modelo */

export type DimKind =
  | "linear"
  | "horizontal"
  | "vertical"
  | "aligned"
  | "chain"
  | "diameter"
  | "radius"
  | "angle"
  | "arc-length"
  | "coord-x"
  | "coord-y"
  | "center-distance"
  | "center-dx"
  | "center-dy";

export const DIM_LABEL: Record<DimKind, string> = {
  linear: "Linear",
  horizontal: "Horizontal",
  vertical: "Vertical",
  aligned: "Alinhada",
  chain: "Em cadeia",
  diameter: "Diâmetro",
  radius: "Raio",
  angle: "Ângulo",
  "arc-length": "Comprimento de arco",
  "coord-x": "Coordenada X",
  "coord-y": "Coordenada Y",
  "center-distance": "Entre centros",
  "center-dx": "Entre centros X",
  "center-dy": "Entre centros Y",
};

/** Quantidade de referências exigida por tipo (ângulo aceita 2 linhas ou 3 pontos). */
export const DIM_REFS: Record<DimKind, number> = {
  linear: 2,
  horizontal: 2,
  vertical: 2,
  aligned: 2,
  chain: 2,
  diameter: 1,
  radius: 1,
  angle: 2,
  "arc-length": 1,
  "coord-x": 1,
  "coord-y": 1,
  "center-distance": 2,
  "center-dx": 2,
  "center-dy": 2,
};

export type DimAnchor = "center" | "start" | "end" | "mid";

/** Referência: ponto livre do desenho ou vínculo real com uma entidade. */
export type DimRef =
  { kind: "point"; p: Vec2 } | { kind: "entity"; id: string; anchor?: DimAnchor };

export type DimStyle = {
  /** Casas decimais na apresentação (0–3). O valor interno mantém precisão total. */
  precision: number;
  anglePrecision: number;
  unit: string;
  textSize: number;
  arrowSize: number;
  prefix: string;
  suffix: string;
  /** Tolerância simétrica ou assimétrica, quando aplicável. */
  tolerance?: { plus: number; minus: number };
  /** Lado da linha de cota (1 / -1). */
  side: 1 | -1;
};

export const DEFAULT_DIM_STYLE: DimStyle = {
  precision: 2,
  anglePrecision: 1,
  unit: "mm",
  textSize: 11,
  arrowSize: 6,
  prefix: "",
  suffix: "",
  side: 1,
};

export type Dimension = {
  id: string;
  kind: DimKind;
  refs: DimRef[];
  /** Afastamento da linha de cota em relação à geometria (mm). */
  offset: number;
  style: DimStyle;
  /** Uma cota é SEMPRE DIMENSION. Nunca vira operação de fabricação. */
  role: "DIMENSION";
};

export const makeDimension = (
  kind: DimKind,
  refs: DimRef[],
  offset = 20,
  style: Partial<DimStyle> = {},
): Dimension => ({
  id: uid(),
  kind,
  refs,
  offset,
  style: { ...DEFAULT_DIM_STYLE, ...style },
  role: "DIMENSION",
});

/* ------------------------------------------------------------- resolução */

const findEntity = (entities: Entity[], id: string) => entities.find((e) => e.id === id) ?? null;

const lineEnds = (e: Entity): [Vec2, Vec2] | null => {
  if (e.type === "line")
    return [
      { x: e.x1, y: e.y1 },
      { x: e.x2, y: e.y2 },
    ];
  if (e.type === "polyline" && e.pts.length >= 2) return [e.pts[0]!, e.pts[e.pts.length - 1]!];
  return null;
};

/** Ponto real de uma referência, medido na geometria canônica. */
export function resolvePoint(ref: DimRef, entities: Entity[]): Vec2 | null {
  if (ref.kind === "point") return ref.p;
  const e = findEntity(entities, ref.id);
  if (!e) return null;
  if (e.type === "circle" || e.type === "arc") return { x: e.cx, y: e.cy };
  const ends = lineEnds(e);
  if (ends) {
    if (ref.anchor === "end") return ends[1];
    if (ref.anchor === "mid")
      return { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
    return ends[0];
  }
  if (e.type === "text") return { x: e.x, y: e.y };
  return null;
}

const circleOf = (ref: DimRef, entities: Entity[]) => {
  if (ref.kind !== "entity") return null;
  const e = findEntity(entities, ref.id);
  if (!e) return null;
  if (e.type === "circle") return { c: { x: e.cx, y: e.cy }, r: e.r, a0: 0, a1: Math.PI * 2 };
  if (e.type === "arc") return { c: { x: e.cx, y: e.cy }, r: e.r, a0: e.a0, a1: e.a1 };
  return null;
};

const dirOf = (ref: DimRef, entities: Entity[]): { p: Vec2; d: Vec2 } | null => {
  if (ref.kind !== "entity") return null;
  const e = findEntity(entities, ref.id);
  if (!e) return null;
  const ends = lineEnds(e);
  if (!ends) return null;
  const dx = ends[1].x - ends[0].x;
  const dy = ends[1].y - ends[0].y;
  const l = Math.hypot(dx, dy) || 1;
  return { p: ends[0], d: { x: dx / l, y: dy / l } };
};

const sweepOf = (a0: number, a1: number) => {
  let s = a1 - a0;
  while (s <= 0) s += Math.PI * 2;
  while (s > Math.PI * 2) s -= Math.PI * 2;
  return s;
};

/* ------------------------------------------------------------- medição */

export type DimUnit = "mm" | "deg";
export type DimMeasure = { value: number; unit: DimUnit; symbol: string };

/** Mede a cota na geometria REAL. `null` quando a referência não existe mais. */
export function measureDimension(dim: Dimension, entities: Entity[]): DimMeasure | null {
  const pts = dim.refs.map((r) => resolvePoint(r, entities));
  const [p0, p1] = pts;

  switch (dim.kind) {
    case "linear":
    case "aligned":
    case "center-distance":
      if (!p0 || !p1) return null;
      return { value: Math.hypot(p1.x - p0.x, p1.y - p0.y), unit: "mm", symbol: "" };
    case "horizontal":
    case "center-dx":
      if (!p0 || !p1) return null;
      return { value: Math.abs(p1.x - p0.x), unit: "mm", symbol: "" };
    case "vertical":
    case "center-dy":
      if (!p0 || !p1) return null;
      return { value: Math.abs(p1.y - p0.y), unit: "mm", symbol: "" };
    case "chain": {
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!a || !b) return null;
        total += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return { value: total, unit: "mm", symbol: "" };
    }
    case "diameter": {
      const c = circleOf(dim.refs[0]!, entities);
      return c ? { value: c.r * 2, unit: "mm", symbol: "Ø" } : null;
    }
    case "radius": {
      const c = circleOf(dim.refs[0]!, entities);
      return c ? { value: c.r, unit: "mm", symbol: "R" } : null;
    }
    case "arc-length": {
      const c = circleOf(dim.refs[0]!, entities);
      if (!c) return null;
      const sweep = sweepOf(c.a0, c.a1);
      return { value: c.r * sweep, unit: "mm", symbol: "L" };
    }
    case "coord-x":
      return p0 ? { value: p0.x, unit: "mm", symbol: "X" } : null;
    case "coord-y":
      return p0 ? { value: p0.y, unit: "mm", symbol: "Y" } : null;
    case "angle": {
      const a = angleGeometry(dim, entities);
      return a ? { value: a.deg, unit: "deg", symbol: "" } : null;
    }
  }
}

/** Ângulo real: duas linhas (vértice = interseção) ou três pontos. */
function angleGeometry(
  dim: Dimension,
  entities: Entity[],
): { vertex: Vec2; d1: Vec2; d2: Vec2; deg: number } | null {
  let vertex: Vec2 | null = null;
  let d1: Vec2 | null = null;
  let d2: Vec2 | null = null;

  if (dim.refs.length >= 3) {
    const a = resolvePoint(dim.refs[0]!, entities);
    const v = resolvePoint(dim.refs[1]!, entities);
    const b = resolvePoint(dim.refs[2]!, entities);
    if (!a || !v || !b) return null;
    vertex = v;
    const n = (p: Vec2) => {
      const l = Math.hypot(p.x - v.x, p.y - v.y) || 1;
      return { x: (p.x - v.x) / l, y: (p.y - v.y) / l };
    };
    d1 = n(a);
    d2 = n(b);
  } else {
    const l1 = dirOf(dim.refs[0]!, entities);
    const l2 = dirOf(dim.refs[1]!, entities);
    if (!l1 || !l2) return null;
    const x = lineIntersection(
      [l1.p, { x: l1.p.x + l1.d.x, y: l1.p.y + l1.d.y }],
      [l2.p, { x: l2.p.x + l2.d.x, y: l2.p.y + l2.d.y }],
      false,
    );
    if (!x) return null;
    vertex = x;
    d1 = l1.d;
    d2 = l2.d;
  }

  const dot = Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y));
  const deg = (Math.acos(dot) * 180) / Math.PI;
  return { vertex, d1, d2, deg };
}

/* ---------------------------------------------------------- formatação */

const round = (v: number, p: number) => v.toFixed(Math.max(0, Math.min(3, Math.round(p))));

/** Texto apresentado. Arredonda SÓ na apresentação; o valor interno é íntegro. */
export function formatDimension(dim: Dimension, entities: Entity[]): string | null {
  const m = measureDimension(dim, entities);
  if (!m) return null;
  const s = dim.style;
  if (m.unit === "deg") return `${s.prefix}${round(m.value, s.anglePrecision)}°${s.suffix}`;

  const num = round(m.value, s.precision);
  const head =
    m.symbol === "Ø" || m.symbol === "R" || m.symbol === "L"
      ? `${m.symbol}${num}`
      : m.symbol === "X" || m.symbol === "Y"
        ? `${m.symbol} = ${num}`
        : num;
  const tol = s.tolerance
    ? s.tolerance.plus === s.tolerance.minus
      ? ` ±${round(s.tolerance.plus, s.precision)}`
      : ` +${round(s.tolerance.plus, s.precision)}/-${round(s.tolerance.minus, s.precision)}`
    : "";
  const unit = s.unit ? ` ${s.unit}` : "";
  return `${s.prefix}${head}${unit}${tol}${s.suffix}`;
}

/* ---------------------------------------------------------- desenho */

export type DimDraw = {
  lines: [Vec2, Vec2][];
  arcs: { c: Vec2; r: number; a0: number; a1: number }[];
  arrows: { p: Vec2; angle: number }[];
  labels: { p: Vec2; text: string; angle: number }[];
};

const EMPTY: DimDraw = { lines: [], arcs: [], arrows: [], labels: [] };

const unit = (a: Vec2, b: Vec2) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};

function linearDraw(a: Vec2, b: Vec2, kind: DimKind, dim: Dimension, text: string): DimDraw {
  const off = dim.offset * dim.style.side;
  let p1 = a;
  let p2 = b;
  let u: Vec2;

  if (kind === "horizontal" || kind === "center-dx") {
    const y = Math.max(a.y, b.y) + off;
    p1 = { x: a.x, y };
    p2 = { x: b.x, y };
    u = { x: 1, y: 0 };
  } else if (kind === "vertical" || kind === "center-dy") {
    const x = Math.max(a.x, b.x) + off;
    p1 = { x, y: a.y };
    p2 = { x, y: b.y };
    u = { x: 0, y: 1 };
  } else {
    u = unit(a, b);
    const n = { x: -u.y, y: u.x };
    p1 = { x: a.x + n.x * off, y: a.y + n.y * off };
    p2 = { x: b.x + n.x * off, y: b.y + n.y * off };
  }

  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  return {
    lines: [
      [p1, p2],
      [a, p1],
      [b, p2],
    ],
    arcs: [],
    arrows: [
      { p: p1, angle: ang },
      { p: p2, angle: ang + Math.PI },
    ],
    labels: [{ p: mid, text, angle: ang }],
  };
}

/** Geometria de apresentação da cota, derivada da geometria real. */
export function dimensionDraw(dim: Dimension, entities: Entity[]): DimDraw {
  const text = formatDimension(dim, entities);
  if (text === null) return EMPTY;
  const pts = dim.refs.map((r) => resolvePoint(r, entities));

  switch (dim.kind) {
    case "linear":
    case "aligned":
    case "horizontal":
    case "vertical":
    case "center-distance":
    case "center-dx":
    case "center-dy": {
      const [a, b] = pts;
      if (!a || !b) return EMPTY;
      return linearDraw(a, b, dim.kind, dim, text);
    }
    case "chain": {
      const out: DimDraw = { lines: [], arcs: [], arrows: [], labels: [] };
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!a || !b) continue;
        const seg = makeDimension(
          "aligned",
          [
            { kind: "point", p: a },
            { kind: "point", p: b },
          ],
          dim.offset,
          dim.style,
        );
        const d = dimensionDraw(seg, entities);
        out.lines.push(...d.lines);
        out.arrows.push(...d.arrows);
        out.labels.push(...d.labels);
      }
      return out;
    }
    case "diameter": {
      const c = circleOf(dim.refs[0]!, entities);
      if (!c) return EMPTY;
      const a = Math.PI / 4;
      const p1 = { x: c.c.x - c.r * Math.cos(a), y: c.c.y - c.r * Math.sin(a) };
      const p2 = { x: c.c.x + c.r * Math.cos(a), y: c.c.y + c.r * Math.sin(a) };
      const tip = { x: p2.x + Math.cos(a) * dim.offset, y: p2.y + Math.sin(a) * dim.offset };
      return {
        lines: [
          [p1, p2],
          [p2, tip],
        ],
        arcs: [],
        arrows: [
          { p: p1, angle: a },
          { p: p2, angle: a + Math.PI },
        ],
        labels: [{ p: tip, text, angle: 0 }],
      };
    }
    case "radius": {
      const c = circleOf(dim.refs[0]!, entities);
      if (!c) return EMPTY;
      const a = c.a1 === Math.PI * 2 ? Math.PI / 4 : c.a0 + sweepOf(c.a0, c.a1) / 2;
      const edge = { x: c.c.x + c.r * Math.cos(a), y: c.c.y + c.r * Math.sin(a) };
      const tip = { x: edge.x + Math.cos(a) * dim.offset, y: edge.y + Math.sin(a) * dim.offset };
      return {
        lines: [
          [c.c, edge],
          [edge, tip],
        ],
        arcs: [],
        arrows: [{ p: edge, angle: a + Math.PI }],
        labels: [{ p: tip, text, angle: 0 }],
      };
    }
    case "arc-length": {
      const c = circleOf(dim.refs[0]!, entities);
      if (!c) return EMPTY;
      const r = c.r + dim.offset * dim.style.side;
      const sweep = sweepOf(c.a0, c.a1);
      const mid = c.a0 + sweep / 2;
      return {
        lines: [
          [c.c, { x: c.c.x + r * Math.cos(c.a0), y: c.c.y + r * Math.sin(c.a0) }],
          [c.c, { x: c.c.x + r * Math.cos(c.a1), y: c.c.y + r * Math.sin(c.a1) }],
        ],
        arcs: [{ c: c.c, r, a0: c.a0, a1: c.a0 + sweep }],
        arrows: [],
        labels: [
          {
            p: { x: c.c.x + (r + 6) * Math.cos(mid), y: c.c.y + (r + 6) * Math.sin(mid) },
            text,
            angle: 0,
          },
        ],
      };
    }
    case "coord-x":
    case "coord-y": {
      const p = pts[0];
      if (!p) return EMPTY;
      const tip =
        dim.kind === "coord-x"
          ? { x: p.x, y: p.y - dim.offset * dim.style.side }
          : { x: p.x + dim.offset * dim.style.side, y: p.y };
      return {
        lines: [[p, tip]],
        arcs: [],
        arrows: [{ p, angle: Math.atan2(tip.y - p.y, tip.x - p.x) + Math.PI }],
        labels: [{ p: tip, text, angle: 0 }],
      };
    }
    case "angle": {
      const g = angleGeometry(dim, entities);
      if (!g) return EMPTY;
      const r = Math.max(5, dim.offset);
      const a0 = Math.atan2(g.d1.y, g.d1.x);
      const a1 = Math.atan2(g.d2.y, g.d2.x);
      const mid = a0 + ((g.deg * Math.PI) / 180) * 0.5 * (sweepOf(a0, a1) > Math.PI ? -1 : 1);
      return {
        lines: [
          [g.vertex, { x: g.vertex.x + g.d1.x * r * 1.2, y: g.vertex.y + g.d1.y * r * 1.2 }],
          [g.vertex, { x: g.vertex.x + g.d2.x * r * 1.2, y: g.vertex.y + g.d2.y * r * 1.2 }],
        ],
        arcs: [{ c: g.vertex, r, a0: Math.min(a0, a1), a1: Math.max(a0, a1) }],
        arrows: [],
        labels: [
          {
            p: {
              x: g.vertex.x + (r + 8) * Math.cos(mid),
              y: g.vertex.y + (r + 8) * Math.sin(mid),
            },
            text,
            angle: 0,
          },
        ],
      };
    }
  }
}

/* ------------------------------------------------- cotas → entidades DXF */

/**
 * Converte as cotas em entidades de desenho com papel DIMENSION explícito.
 * Usado pelo DXF TÉCNICO e pela prévia. O perfil LASER CNC descarta DIMENSION,
 * portanto uma cota NUNCA aparece na layer CUT.
 */
export function dimensionEntities(dims: Dimension[], entities: Entity[]): Entity[] {
  const out: Entity[] = [];
  const meta = { role: "DIMENSION" as const };
  for (const d of dims) {
    const draw = dimensionDraw(d, entities);
    for (const [a, b] of draw.lines)
      out.push({
        id: uid(),
        layer: "cota",
        cnc: meta,
        type: "line",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      });
    for (const arc of draw.arcs)
      out.push({
        id: uid(),
        layer: "cota",
        cnc: meta,
        type: "arc",
        cx: arc.c.x,
        cy: arc.c.y,
        r: arc.r,
        a0: arc.a0,
        a1: arc.a1,
      });
    for (const ar of draw.arrows) {
      const s = d.style.arrowSize;
      const back = (sign: number) => ({
        x: ar.p.x + Math.cos(ar.angle + sign * 0.25) * s,
        y: ar.p.y + Math.sin(ar.angle + sign * 0.25) * s,
      });
      out.push({
        id: uid(),
        layer: "cota",
        cnc: meta,
        type: "polyline",
        closed: true,
        pts: [ar.p, back(1), back(-1)],
      });
    }
    for (const l of draw.labels)
      out.push({
        id: uid(),
        layer: "cota",
        cnc: meta,
        type: "text",
        x: l.p.x,
        y: l.p.y,
        text: l.text,
        size: d.style.textSize,
      });
  }
  return out;
}

/** Remove cotas cujas referências deixaram de existir no desenho. */
export const pruneDimensions = (dims: Dimension[], entities: Entity[]) =>
  dims.filter((d) =>
    d.refs.every((r) => r.kind === "point" || entities.some((e) => e.id === r.id)),
  );
