/**
 * POLÍTICAS DE VISIBILIDADE DO WIRE3D.
 *
 * Esta camada recebe somente projeções da geometria existente. Ela nunca move,
 * cria ou remove entidades canônicas. A segmentação existe exclusivamente para
 * desenhar a parte visível de uma linha quando a oclusão espacial é solicitada.
 */

import type { Vec3 } from "@/lib/geometry/types";
import type { Camera, Edge } from "./wire";

export type RenderCategory =
  | "surface"
  | "edge"
  | "technical"
  | "reference"
  | "dimension"
  | "selection";

export type VisibilityPolicy = "surface-depth" | "real-occlusion" | "technical-persistent" | "overlay";

export const VISIBILITY_POLICY: Readonly<Record<RenderCategory, VisibilityPolicy>> = {
  surface: "surface-depth",
  edge: "technical-persistent",
  technical: "technical-persistent",
  reference: "technical-persistent",
  dimension: "overlay",
  selection: "overlay",
};

export type CameraPoint = Vec3;
export type ProjectedLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  z1: number;
  z2: number;
};
export type ProjectedTriangle = {
  id: string;
  pts: readonly [CameraPoint, CameraPoint, CameraPoint];
  minDepth: number;
  maxDepth: number;
  centerDepth: number;
  priority: number;
};

export function toCameraPoint(p: Vec3, cam: Camera): CameraPoint {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  return {
    x: x1,
    y: p.y * cp - z1 * sp,
    z: p.y * sp + z1 * cp,
  };
}

export function projectLine(id: string, edge: Edge, project: (p: Vec3) => CameraPoint, scale: number): ProjectedLine {
  const a = project(edge[0]);
  const b = project(edge[1]);
  return {
    id,
    x1: a.x * scale,
    y1: -a.y * scale,
    x2: b.x * scale,
    y2: -b.y * scale,
    z1: a.z,
    z2: b.z,
  };
}

/**
 * Painter estável para superfícies SVG. Intervalos separados são resolvidos
 * exatamente; somente intervalos sobrepostos recorrem ao centro, seguido por
 * prioridade técnica e ID estável. A profundidade média nunca decide sozinha.
 */
export function compareSurfaceDepth(a: ProjectedTriangle, b: ProjectedTriangle): number {
  if (a.maxDepth < b.minDepth) return -1;
  if (b.maxDepth < a.minDepth) return 1;
  return a.centerDepth - b.centerDepth || a.priority - b.priority || a.id.localeCompare(b.id);
}

const AREA_EPSILON = 1e-8;

function depthAtPoint(x: number, y: number, triangle: ProjectedTriangle): number | undefined {
  const [a, b, c] = triangle.pts;
  const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(den) <= AREA_EPSILON) return undefined;
  const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den;
  const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den;
  const wc = 1 - wa - wb;
  const epsilon = -1e-7;
  if (wa < epsilon || wb < epsilon || wc < epsilon) return undefined;
  return wa * a.z + wb * b.z + wc * c.z;
}

function interpolate(line: ProjectedLine, t: number): { x: number; y: number; z: number } {
  return {
    x: line.x1 + (line.x2 - line.x1) * t,
    y: line.y1 + (line.y2 - line.y1) * t,
    z: line.z1 + (line.z2 - line.z1) * t,
  };
}

function occludedAt(
  point: { x: number; y: number; z: number },
  triangles: readonly ProjectedTriangle[],
  depthEpsilon: number,
): boolean {
  for (const triangle of triangles) {
    if (triangle.maxDepth <= point.z + depthEpsilon) continue;
    const surfaceDepth = depthAtPoint(point.x, point.y, triangle);
    if (surfaceDepth !== undefined && surfaceDepth > point.z + depthEpsilon) return true;
  }
  return false;
}

/**
 * Segmentação adaptativa e limitada. No padrão técnico devolve exatamente um
 * segmento, independentemente de orientação, comprimento aparente ou depth.
 */
export function visibleLineSegments(
  line: ProjectedLine,
  policy: VisibilityPolicy,
  triangles: readonly ProjectedTriangle[],
  depthEpsilon: number,
): ProjectedLine[] {
  if (policy !== "real-occlusion") return [line];

  const screenLength = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  const depthTravel = Math.abs(line.z2 - line.z1);
  const count = Math.max(1, Math.min(32, Math.ceil(Math.max(screenLength / 7, depthTravel / 24))));
  const visible = Array.from({ length: count }, (_, index) => {
    const t = (index + 0.5) / count;
    return !occludedAt(interpolate(line, t), triangles, depthEpsilon);
  });

  const out: ProjectedLine[] = [];
  let start = -1;
  for (let index = 0; index <= count; index++) {
    if (index < count && visible[index]) {
      if (start < 0) start = index;
      continue;
    }
    if (start < 0) continue;
    const a = interpolate(line, start / count);
    const b = interpolate(line, index / count);
    out.push({ id: `${line.id}:${start}-${index}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, z1: a.z, z2: b.z });
    start = -1;
  }
  return out;
}