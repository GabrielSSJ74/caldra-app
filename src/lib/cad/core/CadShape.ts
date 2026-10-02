/**
 * CALDRA CAD CORE — SHAPE WRAPPER
 *
 * Encapsula a referência viva de uma forma geométrica no kernel CAD,
 * abstraindo o ponteiro/handle numérico subjacente e gerindo metadados.
 */

import type { CadBoundingBox } from "./CadTopology";

export type CadShapeType =
  | "solid"
  | "shell"
  | "face"
  | "wire"
  | "edge"
  | "vertex"
  | "compound"
  | "comp_solid";

export interface CadShape {
  /** ID único da forma na sessão CALDRA */
  readonly id: string;
  /** Nome amigável para a árvore de recursos */
  readonly name: string;
  /** Tipo topológico da forma */
  readonly type: CadShapeType;
  /** Identificador / handle numérico interno na arena do kernel */
  readonly handle: number;
  /** Bounding box cacheado (se calculado) */
  bounds?: CadBoundingBox;
  /** Volume cacheado (se sólido) em mm³ */
  volume?: number;
  /** Área superficial em mm² */
  surfaceArea?: number;
  /** Data de criação */
  readonly createdAt: number;
}

export function createCadShape(options: {
  name: string;
  type: CadShapeType;
  handle: number;
  id?: string;
  bounds?: CadBoundingBox;
  volume?: number;
  surfaceArea?: number;
}): CadShape {
  return {
    id: options.id || `shape_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: options.name,
    type: options.type,
    handle: options.handle,
    bounds: options.bounds,
    volume: options.volume,
    surfaceArea: options.surfaceArea,
    createdAt: Date.now(),
  };
}
