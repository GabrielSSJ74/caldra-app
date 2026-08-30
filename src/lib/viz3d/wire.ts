import type { Vec2, Vec3 } from "@/lib/geometry/types";

export type Edge = [Vec3, Vec3];
export type Face = Vec3[];
export type WireModel = { edges: Edge[]; faces: Face[]; size: number };

export type WireParams = {
  /** diâmetro / lado maior (base) */
  d1: number;
  /** diâmetro / lado menor (topo) */
  d2: number;
  /** altura */
  h: number;
  /** excentricidade / offset */
  e?: number;
  /** número de divisões da revolução */
  seg?: number;
};

export const DEFAULT_PARAMS: WireParams = { d1: 300, d2: 160, h: 260, e: 0, seg: 24 };

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function ring(r: number, y: number, seg: number, cx = 0, cz = 0): Vec3[] {
  return Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return v(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
  });
}

function square(side: number, y: number): Vec3[] {
  const s = side / 2;
  return [v(-s, y, -s), v(s, y, -s), v(s, y, s), v(-s, y, s)];
}

function loopEdges(pts: Vec3[]): Edge[] {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]!] as Edge);
}

function skin(a: Vec3[], b: Vec3[], step = 1): { edges: Edge[]; faces: Face[] } {
  const n = Math.max(a.length, b.length);
  const edges: Edge[] = [];
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = a[i % a.length]!;
    const b0 = b[Math.round((i * b.length) / n) % b.length]!;
    if (i % step === 0) edges.push([a0, b0]);
    const a1 = a[(i + 1) % a.length]!;
    const b1 = b[Math.round(((i + 1) * b.length) / n) % b.length]!;
    faces.push([a0, a1, b1, b0]);
  }
  return { edges, faces };
}

function build(parts: { edges?: Edge[]; faces?: Face[] }[], size: number): WireModel {
  return {
    edges: parts.flatMap((p) => p.edges ?? []),
    faces: parts.flatMap((p) => p.faces ?? []),
    size,
  };
}

/** Constrói o wireframe técnico da geometria a partir dos parâmetros. */
export function buildWire(slug: string, p: WireParams): WireModel {
  const seg = p.seg ?? 24;
  const h = p.h;
  const r1 = p.d1 / 2;
  const r2 = p.d2 / 2;
  const e = p.e ?? 0;
  const y0 = -h / 2;
  const y1 = h / 2;
  const size = Math.max(p.d1, p.d2, h) * 1.15;

  const cyl = (ra: number, rb: number, ex = 0) => {
    const a = ring(ra, y0, seg);
    const b = ring(rb, y1, seg, ex, 0);
    return build([{ edges: loopEdges(a) }, { edges: loopEdges(b) }, skin(a, b, 3)], size);
  };

  switch (slug) {
    case "cilindro":
    case "dutos":
      return cyl(r1, r1);
    case "cone": {
      const a = ring(r1, y0, seg);
      const apex = v(0, y1, 0);
      return build(
        [
          { edges: loopEdges(a) },
          {
            edges: a.filter((_, i) => i % 3 === 0).map((q) => [q, apex] as Edge),
            faces: a.map((q, i) => [q, a[(i + 1) % a.length]!, apex]),
          },
        ],
        size,
      );
    }
    case "tronco-de-cone":
    case "reducao-circular":
      return cyl(r1, r2);
    case "cone-excentrico":
      return cyl(r1, r2, r1 - r2);
    case "quadrado-redondo": {
      const a = square(p.d1, y0);
      const b = ring(r2, y1, seg, e, 0);
      const dense = a.flatMap((q, i) => {
        const n = a[(i + 1) % a.length]!;
        return Array.from({ length: seg / 4 }, (_, k) => {
          const t = k / (seg / 4);
          return v(q.x + (n.x - q.x) * t, y0, q.z + (n.z - q.z) * t);
        });
      });
      return build([{ edges: loopEdges(a) }, { edges: loopEdges(b) }, skin(dense, b, 2)], size);
    }
    case "redondo-quadrado":
    case "transicoes": {
      const a = ring(r1, y0, seg);
      const b = square(p.d2, y1);
      const dense = b.flatMap((q, i) => {
        const n = b[(i + 1) % b.length]!;
        return Array.from({ length: seg / 4 }, (_, k) => {
          const t = k / (seg / 4);
          return v(q.x + (n.x - q.x) * t, y1, q.z + (n.z - q.z) * t);
        });
      });
      return build([{ edges: loopEdges(a) }, { edges: loopEdges(b) }, skin(a, dense, 2)], size);
    }
    case "boca-de-lobo": {
      const base = ring(r1, y0, seg);
      const top = base.map((q) => v(q.x, y0 + h * (0.45 + 0.45 * (q.z / r1 + 1) * 0.5), q.z));
      return build([{ edges: loopEdges(base) }, { edges: loopEdges(top) }, skin(base, top, 2)], size);
    }
    case "te":
    case "interseccoes": {
      const main = cyl(r1, r1);
      const bx = ring(r2, 0, seg).map((q) => v(q.z, q.x, 0));
      const bx2 = bx.map((q) => v(q.x, q.y, r1 + h * 0.4));
      return build(
        [main, { edges: loopEdges(bx) }, { edges: loopEdges(bx2) }, skin(bx, bx2, 3)],
        size,
      );
    }
    case "y": {
      const base = ring(r1, y0, seg);
      const mid = ring(r1, 0, seg);
      const armA = ring(r2, y1, seg, -r1 * 0.8);
      const armB = ring(r2, y1, seg, r1 * 0.8);
      return build(
        [
          { edges: loopEdges(base) },
          { edges: loopEdges(mid) },
          { edges: loopEdges(armA) },
          { edges: loopEdges(armB) },
          skin(base, mid, 4),
          skin(mid, armA, 4),
          skin(mid, armB, 4),
        ],
        size,
      );
    }
    case "curva-de-gomos": {
      const gomos = 5;
      const R = p.d1;
      const parts: { edges: Edge[]; faces?: Face[] }[] = [];
      let prev: Vec3[] | null = null;
      for (let i = 0; i <= gomos; i++) {
        const a = (i / gomos) * (Math.PI / 2);
        const cx = R * Math.sin(a) - R / 2;
        const cy = -R * Math.cos(a) + R / 2;
        const rr = ring(r2, 0, seg).map((q) =>
          v(cx + q.x * Math.cos(a), cy + q.x * Math.sin(a), q.z),
        );
        parts.push({ edges: loopEdges(rr) });
        if (prev) parts.push(skin(prev, rr, 3));
        prev = rr;
      }
      return build(parts, R * 1.6);
    }
    case "flanges": {
      const outer = ring(r1, 0, seg);
      const inner = ring(r2, 0, seg);
      const holes = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const cx = (r1 + r2) / 2;
        return ring(r1 * 0.08, 0, 10, cx * Math.cos(a), cx * Math.sin(a));
      });
      const thick = (pts: Vec3[]) => pts.map((q) => v(q.x, q.y + h * 0.12, q.z));
      return build(
        [
          { edges: loopEdges(outer), faces: [outer] },
          { edges: loopEdges(inner) },
          { edges: loopEdges(thick(outer)) },
          { edges: loopEdges(thick(inner)) },
          skin(outer, thick(outer), 4),
          ...holes.map((hh) => ({ edges: loopEdges(hh) })),
        ],
        p.d1 * 1.25,
      );
    }
    case "tampas": {
      const rim = ring(r1, y0, seg);
      const lip = ring(r1, y0 + h * 0.15, seg);
      return build([{ edges: loopEdges(rim), faces: [rim] }, { edges: loopEdges(lip) }, skin(rim, lip, 3)], size);
    }
    case "calotas": {
      const layers = 6;
      const parts: { edges: Edge[]; faces?: Face[] }[] = [];
      let prev: Vec3[] | null = null;
      for (let i = 0; i <= layers; i++) {
        const t = i / layers;
        const a = (t * Math.PI) / 2;
        const rr = ring(r1 * Math.cos(a), y0 + h * Math.sin(a), seg);
        parts.push({ edges: loopEdges(rr) });
        if (prev) parts.push(skin(prev, rr, 3));
        prev = rr;
      }
      return build(parts, size);
    }
    case "chamines": {
      const a = ring(r1, y0, seg);
      const b = ring(r1 * 0.85, 0, seg);
      const c = ring(r2, y1, seg);
      return build(
        [
          { edges: loopEdges(a) },
          { edges: loopEdges(b) },
          { edges: loopEdges(c) },
          skin(a, b, 3),
          skin(b, c, 3),
        ],
        size,
      );
    }
    default:
      return cyl(r1, r2);
  }
}

export type Camera = { yaw: number; pitch: number; zoom: number };

/** Projeção ortográfica com rotação yaw/pitch. Retorna coordenadas de tela. */
export function project(pt: Vec3, cam: Camera, scale: number): Vec2 & { depth: number } {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const x1 = pt.x * cy - pt.z * sy;
  const z1 = pt.x * sy + pt.z * cy;
  const y1 = pt.y * cp - z1 * sp;
  const z2 = pt.y * sp + z1 * cp;
  const k = scale * cam.zoom;
  return { x: x1 * k, y: -y1 * k, depth: z2 };
}
