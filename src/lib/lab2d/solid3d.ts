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
import type { Entity } from "./core";
import {
  buildPlanarSolidsFromEntities2D,
  signedAreaShoelace,
} from "@/chamfer/geometry/planarTo3DBuilder";

const signedArea = signedAreaShoelace;

export type SolidShape = { outline: Vec2[]; holes: Vec2[][]; entityId: string };

/**
 * Agrupa contornos externos com seus furos usando o Costurador Topológico Canônico
 * (`planarTo3DBuilder.ts`) — suporta linhas + arcos orientados, rasgos curvos,
 * Árvore de Contenção Par-Ímpar e exclui 100% entidades de Gabarito (`isReferenceGuide`) e Construção.
 */
export function solidShapes(entities: Entity[]): SolidShape[] {
  const { solids } = buildPlanarSolidsFromEntities2D(entities, 0.15);
  return solids.map((s) => ({
    outline: s.outer.points,
    holes: s.holes.map((h) => h.points),
    entityId: s.outer.sourceEntityIds[0] ?? s.outer.id,
  }));
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
