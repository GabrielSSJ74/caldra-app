/**
 * AUDITOR PURO DO MODELO 3D (diagnóstico).
 *
 * Não altera nada: apenas mede topologia, normais, degenerações e limites do
 * `WireModel` para comparação antes/depois. Usado em testes e no diagnóstico
 * em desenvolvimento.
 */

import type { Vec3 } from "@/lib/geometry/types";
import type { Face, WireModel } from "@/lib/viz3d/wire";

export type MeshAudit = {
  faces: number;
  triangles: number;
  vertices: number;
  byKind: Record<string, number>;
  /** faces com menos de 3 pontos ou área praticamente nula */
  degenerate: number;
  /** faces com o mesmo conjunto de pontos (na mesma ordem) */
  duplicates: number;
  /** coordenadas não finitas encontradas */
  nonFinite: number;
  /** faces sem normal calculada ou com normal não unitária */
  badNormals: number;
  edges: number;
  refLines: number;
  size: number;
  bounds: WireModel["bounds"];
};

const EPS = 1e-6;

function key(p: Vec3): string {
  return `${p.x.toFixed(4)}|${p.y.toFixed(4)}|${p.z.toFixed(4)}`;
}

function finite(p: Vec3): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Área do polígono via somatório de Newell (robusta para polígonos planos). */
export function faceArea(face: Face): number {
  const pts = face.pts;
  if (pts.length < 3) return 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return Math.hypot(x, y, z) / 2;
}

export function auditModel(model: WireModel): MeshAudit {
  const byKind: Record<string, number> = {};
  const seen = new Set<string>();
  const verts = new Set<string>();
  let degenerate = 0;
  let duplicates = 0;
  let nonFinite = 0;
  let badNormals = 0;
  let triangles = 0;

  for (const face of model.faces) {
    byKind[face.kind] = (byKind[face.kind] ?? 0) + 1;
    triangles += Math.max(0, face.pts.length - 2);

    for (const p of face.pts) {
      if (!finite(p)) nonFinite++;
      else verts.add(key(p));
    }

    if (face.pts.length < 3 || faceArea(face) <= EPS) degenerate++;

    const sig = face.pts.map(key).join(";");
    if (seen.has(sig)) duplicates++;
    else seen.add(sig);

    const n = face.n;
    if (!n || !finite(n) || Math.abs(Math.hypot(n.x, n.y, n.z) - 1) > 1e-3) badNormals++;
  }

  return {
    faces: model.faces.length,
    triangles,
    vertices: verts.size,
    byKind,
    degenerate,
    duplicates,
    nonFinite,
    badNormals,
    edges: model.edges.length,
    refLines: model.refLines?.length ?? 0,
    size: model.size,
    bounds: model.bounds,
  };
}

/** Auditoria "limpa": sem degenerações, duplicatas, valores inválidos ou normais ruins. */
export function isHealthy(audit: MeshAudit): boolean {
  return (
    audit.faces > 0 &&
    audit.degenerate === 0 &&
    audit.duplicates === 0 &&
    audit.nonFinite === 0 &&
    audit.badNormals === 0
  );
}
