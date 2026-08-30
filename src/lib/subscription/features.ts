/**
 * Camada central de permissões.
 *
 * Toda a checagem de acesso premium do app passa por aqui. Para trocar o
 * desbloqueio local por autenticação/assinatura real, basta substituir a
 * origem do `Plan` no provider — nenhuma tela precisa mudar.
 */

export type Plan = "free" | "mestre" | "oficina";

export type Feature =
  | "geometry.basic"
  | "geometry.advanced"
  | "calc.explanation"
  | "planification.advanced"
  | "lab2d"
  | "export.dxf"
  | "export.pdf"
  | "export.png"
  | "projects.unlimited"
  | "school.full"
  | "library.full"
  | "workshop.manage";

const MATRIX: Record<Feature, Plan[]> = {
  "geometry.basic": ["free", "mestre", "oficina"],
  "geometry.advanced": ["mestre", "oficina"],
  "calc.explanation": ["mestre", "oficina"],
  "planification.advanced": ["mestre", "oficina"],
  lab2d: ["mestre", "oficina"],
  "export.dxf": ["mestre", "oficina"],
  "export.pdf": ["mestre", "oficina"],
  "export.png": ["free", "mestre", "oficina"],
  "projects.unlimited": ["mestre", "oficina"],
  "school.full": ["mestre", "oficina"],
  "library.full": ["mestre", "oficina"],
  "workshop.manage": ["oficina"],
};

export const FREE_PROJECT_LIMIT = 2;

export function planAllows(plan: Plan, feature: Feature): boolean {
  return MATRIX[feature].includes(plan);
}

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  mestre: "Mestre",
  oficina: "Oficina",
};

/** Código de desbloqueio do protótipo. Será substituído por autenticação real. */
export const PROTOTYPE_MASTER_CODE = "DESPERTAR";
