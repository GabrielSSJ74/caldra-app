/**
 * Tipos do modelo de fabricação usados pelo núcleo de geometria.
 * Módulo isolado para que `core.ts` não dependa de `manufacturing.ts`.
 */

export type LeadKind = "none" | "line" | "arc";

export type Lead = {
  kind: LeadKind;
  length: number;
  radius: number;
  angleDeg: number;
  side: "left" | "right";
};

/** Dados de fabricação anexos a uma entidade — nunca desenho decorativo. */
export type CncMeta = {
  contourId?: string;
  sequence?: number;
  leadIn?: Lead;
  leadOut?: Lead;
};
