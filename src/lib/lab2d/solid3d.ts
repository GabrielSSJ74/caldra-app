/**
 * ESPESSURA NO CHAMFER — o desenho 2D vira SÓLIDO.
 *
 * Não existe motor 3D novo aqui: esta camada apenas converte os CONTORNOS
 * FECHADOS da camada CORTE em INSTÂNCIAS SÓLIDAS (`SolidInstance`), o mesmo
 * formato já consumido pelo motor Three.js do CALDRA. A geometria continua
 * sendo a do desenho — nada é recalculado nem inventado.
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { SolidInstance, SolidMaterial } from "@/lib/project-catalog/instances";
import { outlinePoints, type Entity } from "./core";

type Loop = { pts: Vec2[]; area: number; id: string };

const signedArea = (pts: Vec2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Contornos fechados de corte, do maior para o menor. */
function closedLoops(entities: Entity[]): Loop[] {
  const out: Loop[] = [];
  for (const e of entities) {
    if (e.layer !== "corte") continue;
    let pts: Vec2[] | null = null;
    if (e.type === "circle") {
      pts = Array.from({ length: 64 }, (_, i) => {
        const t = (i / 64) * Math.PI * 2;
        return { x: e.cx + e.r * Math.cos(t), y: e.cy + e.r * Math.sin(t) };
      });
    } else if (e.type === "polyline" && e.closed && e.pts.length > 2) {
      pts = e.pts;
    } else if (e.type === "path" && e.closed) {
      pts = outlinePoints(e);
    }
    if (!pts || pts.length < 3) continue;
    const area = Math.abs(signedArea(pts));
    if (area < 1e-3) continue;
    out.push({ pts, area, id: e.id });
  }
  return out.sort((a, b) => b.area - a.area);
}

export type SolidShape = { outline: Vec2[]; holes: Vec2[][]; entityId: string };


/** Agrupa contornos externos com seus furos (contenção geométrica). */
export function solidShapes(entities: Entity[]): SolidShape[] {
  const loops = closedLoops(entities);
  const shapes: SolidShape[] = [];
  const used = new Set<number>();
  loops.forEach((loop, i) => {
    if (used.has(i)) return;
    used.add(i);
    const holes: Vec2[][] = [];
    loops.forEach((inner, j) => {
      if (j <= i || used.has(j)) return;
      if (pointInPoly(inner.pts[0]!, loop.pts)) {
        used.add(j);
        holes.push(inner.pts);
      }
    });
    shapes.push({ outline: loop.pts, holes, entityId: loop.id });
  });
  return shapes;
}

/**
 * Instâncias sólidas do desenho atual. Y do desenho cresce para baixo;
 * no 3D o eixo Y cresce para cima, por isso o espelho em Y. O perfil é
 * guardado em coordenadas locais e a posição vai no `center` — assim vários
 * contornos convivem na mesma cena sem se sobrepor.
 */
export function planSolids(
  entities: Entity[],
  thickness: number,
  material: SolidMaterial = "aco",
): SolidInstance[] {
  const shapes = solidShapes(entities);
  const t = Math.max(0.2, thickness);
  return shapes.map((shape, i) => {
    const flip = (p: Vec2) => ({ x: p.x, y: -p.y });
    const outline = shape.outline.map(flip);
    const holes = shape.holes.map((h) => h.map(flip));
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const local = (p: Vec2) => ({ x: p.x - cx, y: p.y - cy });
    return {
      id: shape.entityId,
      partKey: shape.entityId,
      code: `C${String(i + 1).padStart(2, "0")}`,
      index: i + 1,
      label: shapes.length > 1 ? `Contorno ${i + 1}` : "Peça",
      center: { x: cx, y: cy, z: 0 },
      size: { x: maxX - minX, y: maxY - minY, z: t },
      rotZ: 0,
      material,
      assemblyKey: "chamfer",
      fabricable: true,
      shape: { outline: outline.map(local), holes: holes.map((h) => h.map(local)) },
    } satisfies SolidInstance;
  });

}

/** Área líquida (mm²) do desenho — contorno menos furos. */
export function planArea(entities: Entity[]): number {
  return solidShapes(entities).reduce(
    (acc, s) =>
      acc +
      Math.abs(signedArea(s.outline)) -
      s.holes.reduce((h, hole) => h + Math.abs(signedArea(hole)), 0),
    0,
  );
}
