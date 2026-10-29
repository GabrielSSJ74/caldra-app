/**
 * CALDRA CHAMFER CAD — OLHAIS CONCÊNTRICOS E SOLVER DE PONTES TANGENTES (TTR) (FASE C · SEÇÃO 7 · TESTE T9)
 *
 * Implementa:
 * 1. Olhal concêntrico a partir de furo de raio r (por raio externo R ou por parede e: R = r + e),
 *    vinculado ao furo-mãe.
 * 2. Solver analítico de Ponte Tangente entre dois círculos/arcos (C1, R1) e (C2, R2):
 *    - A) Reta tangente externa (correia aberta) e interna (cruzada) — 4 soluções
 *    - B) Arco côncavo (pescoço, tangência externa): d_i = R + R_i, R_min = máx(0, (D - R1 - R2)/2)
 *    - C) Arco convexo (barriga, envolvente): d_i = R - R_i, R_min = (D + R1 + R2)/2
 *    - D) Arco misto em S: d1 = R + R1 e d2 = R - R2 (ou inverso)
 * 3. Verificação explícita de tangência a 1e-6 e cálculo de prévia de "Aparar Olhais"
 *    preservando os círculos originais como construção auxiliar (restaurável por Undo).
 */

import { uid, type Entity, type Vec2 } from "./core";
import type { RevEngInfoStatus } from "./revEngTypes";

/* ========================================================================== */
/* 1. OLHAL CONCÊNTRICO (FURO + COLAR EXTERNO VINCULADO)                      */
/* ========================================================================== */

export type ConcentricEyeSizingMode = "outer_radius" | "wall_thickness";

export interface ConcentricEyeInput {
  /** Centro do furo / olhal (mm) */
  center: Vec2;
  /** Diâmetro do furo interno Ø (mm) */
  holeDiameterMm: number;
  /** Modo de dimensionamento do olhal externo */
  sizingMode: ConcentricEyeSizingMode;
  /** Raio externo R (mm) quando sizingMode === "outer_radius" */
  outerRadiusMm?: number;
  /** Espessura de parede radial e (mm) quando sizingMode === "wall_thickness" (R = r + e) */
  wallThicknessMm?: number;
  /** ID do furo existente no plano caso já exista */
  existingHoleEntityId?: string;
  /** Camada do contorno externo (padrão "corte") */
  outerLayer?: string;
  /** Camada do furo interno (padrão "recorte") */
  holeLayer?: string;
  infoStatus?: RevEngInfoStatus;
}

export interface ConcentricEyeResult {
  valid: boolean;
  center: Vec2;
  holeRadiusMm: number;
  holeDiameterMm: number;
  outerRadiusMm: number;
  outerDiameterMm: number;
  wallThicknessMm: number;
  holeEntity: Entity;
  outerEyeEntity: Entity;
  centerlineEntities: Entity[];
  errorMessage?: string;
  summaryLabel: string;
}

export function buildConcentricEye(input: ConcentricEyeInput): ConcentricEyeResult {
  const holeD = Number(input.holeDiameterMm);
  const r = holeD / 2;
  if (!Number.isFinite(r) || r <= 0) {
    throw new Error("O diâmetro do furo interno do olhal deve ser maior que zero.");
  }

  let R = 0;
  let e = 0;
  if (input.sizingMode === "outer_radius") {
    R = Number(input.outerRadiusMm ?? 0);
    e = R - r;
  } else {
    e = Number(input.wallThicknessMm ?? 0);
    R = r + e;
  }

  const status: RevEngInfoStatus = input.infoStatus ?? "CALCULADO";
  const holeId = input.existingHoleEntityId || `hole-${uid()}`;
  const eyeId = `eye-${uid()}`;

  const holeEntity: Entity = {
    id: holeId,
    layer: input.holeLayer ?? "recorte",
    type: "circle",
    cx: Number(input.center.x.toFixed(4)),
    cy: Number(input.center.y.toFixed(4)),
    r: Number(r.toFixed(4)),
    params: {
      revEngRole: "corte_interno_furos",
      revEngStatus: status,
      nominalDiameterMm: Number(holeD.toFixed(4)),
    },
  };

  const outerEyeEntity: Entity = {
    id: eyeId,
    layer: input.outerLayer ?? "corte",
    type: "circle",
    cx: Number(input.center.x.toFixed(4)),
    cy: Number(input.center.y.toFixed(4)),
    r: Number(Math.max(0.1, R).toFixed(4)),
    dependencies: [holeId],
    params: {
      revEngRole: "corte_externo",
      revEngStatus: status,
      parentHoleId: holeId,
      isConcentricEye: true,
      outerRadiusMm: Number(R.toFixed(4)),
      wallThicknessMm: Number(e.toFixed(4)),
    },
  };

  const ext = Math.max(R * 1.25, R + 4);
  const centerlineEntities: Entity[] = [
    {
      id: uid(),
      layer: "auxiliar",
      type: "line",
      x1: Number((input.center.x - ext).toFixed(4)),
      y1: Number(input.center.y.toFixed(4)),
      x2: Number((input.center.x + ext).toFixed(4)),
      y2: Number(input.center.y.toFixed(4)),
      isConstruction: true,
      dependencies: [holeId, eyeId],
      params: { revEngRole: "linhas_centro", parentHoleId: holeId },
    },
    {
      id: uid(),
      layer: "auxiliar",
      type: "line",
      x1: Number(input.center.x.toFixed(4)),
      y1: Number((input.center.y - ext).toFixed(4)),
      x2: Number(input.center.x.toFixed(4)),
      y2: Number((input.center.y + ext).toFixed(4)),
      isConstruction: true,
      dependencies: [holeId, eyeId],
      params: { revEngRole: "linhas_centro", parentHoleId: holeId },
    },
  ];

  if (e <= 0 || R <= r) {
    return {
      valid: false,
      center: input.center,
      holeRadiusMm: r,
      holeDiameterMm: holeD,
      outerRadiusMm: R,
      outerDiameterMm: 2 * R,
      wallThicknessMm: e,
      holeEntity,
      outerEyeEntity,
      centerlineEntities,
      errorMessage: `Sem solução: o raio externo do olhal (R = ${R.toFixed(2)} mm) deve ser maior que o raio do furo (r = ${r.toFixed(2)} mm). Parede atual e = ${e.toFixed(2)} mm ≤ 0.`,
      summaryLabel: `Olhal Inválido (R${R.toFixed(1)} ≤ r${r.toFixed(1)})`,
    };
  }

  return {
    valid: true,
    center: input.center,
    holeRadiusMm: Number(r.toFixed(4)),
    holeDiameterMm: Number(holeD.toFixed(4)),
    outerRadiusMm: Number(R.toFixed(4)),
    outerDiameterMm: Number((2 * R).toFixed(4)),
    wallThicknessMm: Number(e.toFixed(4)),
    holeEntity,
    outerEyeEntity,
    centerlineEntities,
    summaryLabel: `Olhal R${R.toFixed(1)} mm (Furo Ø${holeD.toFixed(1)} · Parede e=${e.toFixed(1)} mm)`,
  };
}

/* ========================================================================== */
/* 2. SOLVER ANALÍTICO DE PONTES TANGENTES TTR (SEÇÃO 7 · TESTE T9)           */
/* ========================================================================== */

export type TangentBridgeKind =
  | "line_external"
  | "line_internal"
  | "arc_concave"
  | "arc_convex"
  | "arc_s_12"
  | "arc_s_21";

export const TANGENT_BRIDGE_KIND_LABELS: Record<
  TangentBridgeKind,
  { label: string; shortLabel: string; description: string }
> = {
  arc_concave: {
    label: "Arco Côncavo (Pescoço)",
    shortLabel: "Côncavo",
    description: "Tangência externa (d_i = R + R_i). Forma pescoço acinturado entre olhais.",
  },
  arc_convex: {
    label: "Arco Convexo (Barriga)",
    shortLabel: "Convexo",
    description: "Tangência envolvente (d_i = R − R_i). Envolve os dois olhais por fora.",
  },
  line_external: {
    label: "Reta Tangente Externa",
    shortLabel: "Reta Ext",
    description: "Reta tangente externa (correia aberta) ligando os dois olhais.",
  },
  line_internal: {
    label: "Reta Tangente Interna (Cruzada)",
    shortLabel: "Reta Int",
    description: "Reta tangente interna cruzando entre os dois centros.",
  },
  arc_s_12: {
    label: "Arco Misto em S (+R1 / −R2)",
    shortLabel: "Curva S (1→2)",
    description: "Tangente externa ao Olhal 1 (d1 = R + R1) e envolvente ao Olhal 2 (d2 = R − R2).",
  },
  arc_s_21: {
    label: "Arco Misto em S (−R1 / +R2)",
    shortLabel: "Curva S (2→1)",
    description: "Tangente envolvente ao Olhal 1 (d1 = R − R1) e externa ao Olhal 2 (d2 = R + R2).",
  },
};

export interface TangentBridgeCircleInput {
  id?: string;
  center: Vec2;
  radiusMm: number;
}

export interface TangentBridgeInput {
  circle1: TangentBridgeCircleInput;
  circle2: TangentBridgeCircleInput;
  kind: TangentBridgeKind;
  /** Raio da ponte R (mm) — obrigatório para modos em arco */
  bridgeRadiusMm?: number;
  /** Camada CAD de destino (padrão "corte") */
  layer?: string;
}

export interface TangentBridgeBranchSolution {
  branchId: "A" | "B";
  label: string;
  /** Centro do arco de ponte Cc (apenas para modos de arco) */
  arcCenter?: Vec2;
  /** Ponto exato de tangência T1 sobre o Círculo 1 */
  t1: Vec2;
  /** Ponto exato de tangência T2 sobre o Círculo 2 */
  t2: Vec2;
  /** Erro numérico máximo de tangência (verificado < 1e-6) */
  tangencyErrorMm: number;
  /** Entidade CAD pronta (type: "arc" ou type: "line" estritamente entre T1 e T2) */
  bridgeEntity: Entity;
}

export interface TangentBridgeResult {
  valid: boolean;
  kind: TangentBridgeKind;
  centerDistanceMm: number;
  r1Mm: number;
  r2Mm: number;
  bridgeRadiusMm?: number;
  /** Raio mínimo admissível para o modo escolhido */
  minRadiusMm: number;
  /** Raio mínimo côncavo de referência: máx(0, (D - R1 - R2)/2) */
  minConcaveRadiusMm: number;
  /** Raio mínimo convexo de referência: (D + R1 + R2)/2 */
  minConvexRadiusMm: number;
  solutions: TangentBridgeBranchSolution[];
  reasonIfInvalid?: string;
  suggestedRadiusMm?: number;
}

/**
 * Constrói uma entidade `type: "arc"` entre T1 e T2 de centro Cc e raio R,
 * escolhendo o arco menor (< 180°) que conecta T1 e T2 suavemente.
 */
function buildMinorArcEntityBetweenTangents(
  center: Vec2,
  radius: number,
  t1: Vec2,
  t2: Vec2,
  layer: string,
  metaParams: Record<string, unknown>,
): Entity {
  const a0Raw = Math.atan2(t1.y - center.y, t1.x - center.x);
  const a1Raw = Math.atan2(t2.y - center.y, t2.x - center.x);

  let dTheta = a1Raw - a0Raw;
  while (dTheta <= -Math.PI) dTheta += 2 * Math.PI;
  while (dTheta > Math.PI) dTheta -= 2 * Math.PI;

  const a0 = dTheta >= 0 ? a0Raw : a1Raw;
  const a1 = dTheta >= 0 ? a1Raw : a0Raw;

  return {
    id: uid(),
    layer,
    type: "arc",
    cx: Number(center.x.toFixed(6)),
    cy: Number(center.y.toFixed(6)),
    r: Number(radius.toFixed(6)),
    a0: Number(a0.toFixed(6)),
    a1: Number(a1.toFixed(6)),
    params: metaParams,
  };
}

export function solveTangentBridge(input: TangentBridgeInput): TangentBridgeResult {
  const C1 = input.circle1.center;
  const C2 = input.circle2.center;
  const R1 = Number(input.circle1.radiusMm);
  const R2 = Number(input.circle2.radiusMm);
  const layer = input.layer ?? "corte";

  if (!Number.isFinite(R1) || R1 <= 0 || !Number.isFinite(R2) || R2 <= 0) {
    throw new Error("Os raios R1 e R2 dos círculos/olhais devem ser maiores que zero.");
  }

  const dx = C2.x - C1.x;
  const dy = C2.y - C1.y;
  const D = Math.hypot(dx, dy);

  const minConcave = Math.max(0, (D - R1 - R2) / 2);
  const minConvex = (D + R1 + R2) / 2;

  if (D < 1e-6) {
    return {
      valid: false,
      kind: input.kind,
      centerDistanceMm: 0,
      r1Mm: R1,
      r2Mm: R2,
      minRadiusMm: minConvex,
      minConcaveRadiusMm: Number(minConcave.toFixed(4)),
      minConvexRadiusMm: Number(minConvex.toFixed(4)),
      solutions: [],
      reasonIfInvalid: "Sem solução: os dois olhais são concêntricos (D = 0 mm). Não há ponte tangente distinta.",
    };
  }

  const ux = dx / D;
  const uy = dy / D;
  const nx = -uy;
  const ny = ux;

  // =========================================================================
  // MODO A1: RETA TANGENTE EXTERNA (CORREIA ABERTA)
  // =========================================================================
  if (input.kind === "line_external") {
    const diffR = Math.abs(R1 - R2);
    if (D < diffR - 1e-6) {
      return {
        valid: false,
        kind: input.kind,
        centerDistanceMm: Number(D.toFixed(4)),
        r1Mm: R1,
        r2Mm: R2,
        minRadiusMm: 0,
        minConcaveRadiusMm: Number(minConcave.toFixed(4)),
        minConvexRadiusMm: Number(minConvex.toFixed(4)),
        solutions: [],
        reasonIfInvalid: `Sem solução para reta tangente externa: um olhal está contido dentro do outro (D = ${D.toFixed(2)} mm < |R1 − R2| = ${diffR.toFixed(2)} mm).`,
      };
    }

    const cosAlpha = Math.max(-1, Math.min(1, (R1 - R2) / D));
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

    const buildLineExtBranch = (sign: 1 | -1, branchId: "A" | "B", label: string): TangentBridgeBranchSolution => {
      const mx = cosAlpha * ux + sign * sinAlpha * nx;
      const my = cosAlpha * uy + sign * sinAlpha * ny;
      const t1: Vec2 = {
        x: Number((C1.x + R1 * mx).toFixed(6)),
        y: Number((C1.y + R1 * my).toFixed(6)),
      };
      const t2: Vec2 = {
        x: Number((C2.x + R2 * mx).toFixed(6)),
        y: Number((C2.y + R2 * my).toFixed(6)),
      };
      // Verifica erro de tangência: distância de T_i a C_i menos R_i + ortogonalidade
      const err1 = Math.abs(Math.hypot(t1.x - C1.x, t1.y - C1.y) - R1);
      const err2 = Math.abs(Math.hypot(t2.x - C2.x, t2.y - C2.y) - R2);
      const segLen = Math.max(1e-6, Math.hypot(t2.x - t1.x, t2.y - t1.y));
      const dotOrtho = Math.abs(((t2.x - t1.x) * mx + (t2.y - t1.y) * my) / segLen);
      const tangencyErrorMm = Number(Math.max(err1, err2, dotOrtho).toFixed(8));

      return {
        branchId,
        label,
        t1,
        t2,
        tangencyErrorMm,
        bridgeEntity: {
          id: uid(),
          layer,
          type: "line",
          x1: t1.x,
          y1: t1.y,
          x2: t2.x,
          y2: t2.y,
          dependencies: [input.circle1.id, input.circle2.id].filter(Boolean) as string[],
          params: {
            revEngRole: "corte_externo",
            revEngStatus: "CALCULADO",
            bridgeKind: "line_external",
            branchId,
          },
        },
      };
    };

    return {
      valid: true,
      kind: input.kind,
      centerDistanceMm: Number(D.toFixed(4)),
      r1Mm: R1,
      r2Mm: R2,
      minRadiusMm: 0,
      minConcaveRadiusMm: Number(minConcave.toFixed(4)),
      minConvexRadiusMm: Number(minConvex.toFixed(4)),
      solutions: [
        buildLineExtBranch(1, "A", "Reta Externa Superior (Lado A)"),
        buildLineExtBranch(-1, "B", "Reta Externa Inferior (Lado B)"),
      ],
    };
  }

  // =========================================================================
  // MODO A2: RETA TANGENTE INTERNA (CORREIA CRUZADA)
  // =========================================================================
  if (input.kind === "line_internal") {
    const sumR = R1 + R2;
    if (D < sumR - 1e-6) {
      return {
        valid: false,
        kind: input.kind,
        centerDistanceMm: Number(D.toFixed(4)),
        r1Mm: R1,
        r2Mm: R2,
        minRadiusMm: 0,
        minConcaveRadiusMm: Number(minConcave.toFixed(4)),
        minConvexRadiusMm: Number(minConvex.toFixed(4)),
        solutions: [],
        reasonIfInvalid: `Sem solução para reta tangente interna (cruzada): os dois olhais se interceptam ou se tocam (D = ${D.toFixed(2)} mm < R1 + R2 = ${sumR.toFixed(2)} mm).`,
      };
    }

    const cosAlpha = Math.max(-1, Math.min(1, sumR / D));
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

    const buildLineIntBranch = (sign: 1 | -1, branchId: "A" | "B", label: string): TangentBridgeBranchSolution => {
      const mx = cosAlpha * ux + sign * sinAlpha * nx;
      const my = cosAlpha * uy + sign * sinAlpha * ny;
      const t1: Vec2 = {
        x: Number((C1.x + R1 * mx).toFixed(6)),
        y: Number((C1.y + R1 * my).toFixed(6)),
      };
      const t2: Vec2 = {
        x: Number((C2.x - R2 * mx).toFixed(6)),
        y: Number((C2.y - R2 * my).toFixed(6)),
      };
      const err1 = Math.abs(Math.hypot(t1.x - C1.x, t1.y - C1.y) - R1);
      const err2 = Math.abs(Math.hypot(t2.x - C2.x, t2.y - C2.y) - R2);
      const segLen = Math.max(1e-6, Math.hypot(t2.x - t1.x, t2.y - t1.y));
      const dotOrtho = Math.abs(((t2.x - t1.x) * mx + (t2.y - t1.y) * my) / segLen);
      const tangencyErrorMm = Number(Math.max(err1, err2, dotOrtho).toFixed(8));

      return {
        branchId,
        label,
        t1,
        t2,
        tangencyErrorMm,
        bridgeEntity: {
          id: uid(),
          layer,
          type: "line",
          x1: t1.x,
          y1: t1.y,
          x2: t2.x,
          y2: t2.y,
          dependencies: [input.circle1.id, input.circle2.id].filter(Boolean) as string[],
          params: {
            revEngRole: "corte_externo",
            revEngStatus: "CALCULADO",
            bridgeKind: "line_internal",
            branchId,
          },
        },
      };
    };

    return {
      valid: true,
      kind: input.kind,
      centerDistanceMm: Number(D.toFixed(4)),
      r1Mm: R1,
      r2Mm: R2,
      minRadiusMm: 0,
      minConcaveRadiusMm: Number(minConcave.toFixed(4)),
      minConvexRadiusMm: Number(minConvex.toFixed(4)),
      solutions: [
        buildLineIntBranch(1, "A", "Reta Cruzada Diagonal A"),
        buildLineIntBranch(-1, "B", "Reta Cruzada Diagonal B"),
      ],
    };
  }

  // =========================================================================
  // MODOS EM ARCO: B) CÔNCAVO, C) CONVEXO, D) MISTO EM S
  // =========================================================================
  const R = Number(input.bridgeRadiusMm ?? 0);
  if (!Number.isFinite(R) || R <= 0) {
    throw new Error("O raio da ponte em arco (R) deve ser maior que zero.");
  }

  let d1 = 0;
  let d2 = 0;
  let modeMinR = 0;

  if (input.kind === "arc_concave") {
    d1 = R + R1;
    d2 = R + R2;
    modeMinR = minConcave;
    if (R < modeMinR - 1e-6) {
      const suggested = Number(Math.ceil(modeMinR * 2) / 2);
      return {
        valid: false,
        kind: input.kind,
        centerDistanceMm: Number(D.toFixed(4)),
        r1Mm: R1,
        r2Mm: R2,
        bridgeRadiusMm: R,
        minRadiusMm: Number(modeMinR.toFixed(4)),
        minConcaveRadiusMm: Number(minConcave.toFixed(4)),
        minConvexRadiusMm: Number(minConvex.toFixed(4)),
        solutions: [],
        suggestedRadiusMm: Math.max(modeMinR, suggested),
        reasonIfInvalid: `SEM SOLUÇÃO: Para ponte côncava entre R1=${R1.toFixed(1)} e R2=${R2.toFixed(1)} a D=${D.toFixed(1)} mm, o raio mínimo é R_mín = ${modeMinR.toFixed(2)} mm (informado R = ${R.toFixed(2)} mm). Sugestão: R ≥ ${Math.max(modeMinR, suggested).toFixed(1)} mm.`,
      };
    }
  } else if (input.kind === "arc_convex") {
    d1 = R - R1;
    d2 = R - R2;
    modeMinR = Math.max(R1, R2, minConvex);
    if (R < modeMinR - 1e-6) {
      const suggested = Number(Math.ceil(modeMinR * 2) / 2);
      return {
        valid: false,
        kind: input.kind,
        centerDistanceMm: Number(D.toFixed(4)),
        r1Mm: R1,
        r2Mm: R2,
        bridgeRadiusMm: R,
        minRadiusMm: Number(modeMinR.toFixed(4)),
        minConcaveRadiusMm: Number(minConcave.toFixed(4)),
        minConvexRadiusMm: Number(minConvex.toFixed(4)),
        solutions: [],
        suggestedRadiusMm: Math.max(modeMinR, suggested),
        reasonIfInvalid: `SEM SOLUÇÃO: Para ponte convexa (envolvente) entre R1=${R1.toFixed(1)} e R2=${R2.toFixed(1)} a D=${D.toFixed(1)} mm, o raio mínimo é R_mín = (D + R1 + R2)/2 = ${modeMinR.toFixed(2)} mm (informado R = ${R.toFixed(2)} mm). Sugestão: R ≥ ${Math.max(modeMinR, suggested).toFixed(1)} mm.`,
      };
    }
  } else if (input.kind === "arc_s_12") {
    d1 = R + R1;
    d2 = R - R2;
    modeMinR = Math.max(R2, (D - R1 + R2) / 2);
  } else {
    // arc_s_21
    d1 = R - R1;
    d2 = R + R2;
    modeMinR = Math.max(R1, (D + R1 - R2) / 2);
  }

  // Condição geral de existência de interseção dos círculos auxiliares (C1, d1) e (C2, d2):
  // d1 >= 0, d2 >= 0 e |d1 - d2| <= D <= d1 + d2
  const eps = 1e-6;
  if (d1 < -eps || d2 < -eps || D > d1 + d2 + eps || D < Math.abs(d1 - d2) - eps) {
    const suggested = Number(Math.ceil(modeMinR * 2) / 2);
    return {
      valid: false,
      kind: input.kind,
      centerDistanceMm: Number(D.toFixed(4)),
      r1Mm: R1,
      r2Mm: R2,
      bridgeRadiusMm: R,
      minRadiusMm: Number(modeMinR.toFixed(4)),
      minConcaveRadiusMm: Number(minConcave.toFixed(4)),
      minConvexRadiusMm: Number(minConvex.toFixed(4)),
      solutions: [],
      suggestedRadiusMm: Math.max(modeMinR, suggested),
      reasonIfInvalid: `SEM SOLUÇÃO: A condição triangular |d1 − d2| ≤ D ≤ d1 + d2 não é satisfeita para R = ${R.toFixed(2)} mm (R_mín = ${modeMinR.toFixed(2)} mm). Sugestão: use R ≥ ${Math.max(modeMinR, suggested).toFixed(1)} mm.`,
    };
  }

  const a = (d1 * d1 - d2 * d2 + D * D) / (2 * D);
  const hSq = Math.max(0, d1 * d1 - a * a);
  const h = Math.sqrt(hSq);

  const buildArcBranch = (sign: 1 | -1, branchId: "A" | "B", label: string): TangentBridgeBranchSolution => {
    const ccX = C1.x + a * ux + sign * h * nx;
    const ccY = C1.y + a * uy + sign * h * ny;
    const Cc: Vec2 = {
      x: Number(ccX.toFixed(6)),
      y: Number(ccY.toFixed(6)),
    };

    // Ponto de tangência universal (Seção 7): T_i = Cc + R * (C_i - Cc) / ||C_i - Cc||
    const distCc1 = Math.hypot(C1.x - ccX, C1.y - ccY);
    const distCc2 = Math.hypot(C2.x - ccX, C2.y - ccY);

    const u1x = distCc1 > 1e-9 ? (C1.x - ccX) / distCc1 : ux;
    const u1y = distCc1 > 1e-9 ? (C1.y - ccY) / distCc1 : uy;
    const u2x = distCc2 > 1e-9 ? (C2.x - ccX) / distCc2 : -ux;
    const u2y = distCc2 > 1e-9 ? (C2.y - ccY) / distCc2 : -uy;

    const t1: Vec2 = {
      x: Number((ccX + R * u1x).toFixed(6)),
      y: Number((ccY + R * u1y).toFixed(6)),
    };
    const t2: Vec2 = {
      x: Number((ccX + R * u2x).toFixed(6)),
      y: Number((ccY + R * u2y).toFixed(6)),
    };

    // Verificação rigorosa de tangência a 1e-6:
    // | ||T1 - C1|| - R1 |, | ||T2 - C2|| - R2 |, | ||T1 - Cc|| - R |, | ||T2 - Cc|| - R |
    const errC1 = Math.abs(Math.hypot(t1.x - C1.x, t1.y - C1.y) - R1);
    const errC2 = Math.abs(Math.hypot(t2.x - C2.x, t2.y - C2.y) - R2);
    const errCc1 = Math.abs(Math.hypot(t1.x - ccX, t1.y - ccY) - R);
    const errCc2 = Math.abs(Math.hypot(t2.x - ccX, t2.y - ccY) - R);
    const tangencyErrorMm = Number(Math.max(errC1, errC2, errCc1, errCc2).toFixed(8));

    const bridgeEntity = buildMinorArcEntityBetweenTangents(Cc, R, t1, t2, layer, {
      revEngRole: "corte_externo",
      revEngStatus: "CALCULADO",
      bridgeKind: input.kind,
      bridgeRadiusMm: R,
      branchId,
      t1,
      t2,
    });
    bridgeEntity.dependencies = [input.circle1.id, input.circle2.id].filter(Boolean) as string[];

    return {
      branchId,
      label,
      arcCenter: Cc,
      t1,
      t2,
      tangencyErrorMm,
      bridgeEntity,
    };
  };

  return {
    valid: true,
    kind: input.kind,
    centerDistanceMm: Number(D.toFixed(4)),
    r1Mm: R1,
    r2Mm: R2,
    bridgeRadiusMm: R,
    minRadiusMm: Number(modeMinR.toFixed(4)),
    minConcaveRadiusMm: Number(minConcave.toFixed(4)),
    minConvexRadiusMm: Number(minConvex.toFixed(4)),
    solutions: [
      buildArcBranch(1, "A", "Solução A (Lado Superior / +n)"),
      buildArcBranch(-1, "B", "Solução B (Lado Inferior / −n)"),
    ],
  };
}

/* ========================================================================== */
/* 3. APARAR OLHAIS COM PRÉVIA DAS PARTES REMOVIDAS (SEÇÃO 7 · TESTE T9)      */
/* ========================================================================== */

export interface EyeTrimPreviewResult {
  eyeEntityId: string;
  center: Vec2;
  radiusMm: number;
  /** Arco externo mantido (contorno final) */
  keptOuterArc: Entity;
  /** Arco interno removido (exibido em tracejado vermelho na prévia antes de confirmar) */
  removedInnerArc: Entity;
  /** Círculo original reclassificado como construção auxiliar */
  auxiliaryOriginalCircle: Entity;
}

/**
 * Dado um olhal circular (C, R) e dois pontos de tangência T_a e T_b sobre seu perímetro
 * (vindos de duas pontes conectadas ao olhal, p.ex. ponte superior e ponte inferior),
 * divide o círculo no arco externo mantido (que aponta para fora do outro olhal)
 * e no arco interno removido (voltado para o interior entre os dois olhais).
 */
export function computeEyeTrimPreview(
  eyeCircle: Extract<Entity, { type: "circle" }>,
  tangentA: Vec2,
  tangentB: Vec2,
  otherEyeCenter: Vec2,
): EyeTrimPreviewResult {
  const cx = eyeCircle.cx;
  const cy = eyeCircle.cy;
  const r = eyeCircle.r;

  const angA = Math.atan2(tangentA.y - cy, tangentA.x - cx);
  const angB = Math.atan2(tangentB.y - cy, tangentB.x - cx);

  const normPos = (a: number) => {
    let x = a % (2 * Math.PI);
    if (x < 0) x += 2 * Math.PI;
    return x;
  };

  // Testa qual dos dois arcos (angA -> angB CCW vs angB -> angA CCW) tem seu ponto médio
  // mais próximo do outro olhal (esse é o arco INTERNO a ser aparado!)
  const spanAB = normPos(angB - angA);
  const midAB = angA + spanAB / 2;
  const ptMidAB: Vec2 = { x: cx + r * Math.cos(midAB), y: cy + r * Math.sin(midAB) };

  const spanBA = 2 * Math.PI - spanAB;
  const midBA = angB + spanBA / 2;
  const ptMidBA: Vec2 = { x: cx + r * Math.cos(midBA), y: cy + r * Math.sin(midBA) };

  const distAB = Math.hypot(ptMidAB.x - otherEyeCenter.x, ptMidAB.y - otherEyeCenter.y);
  const distBA = Math.hypot(ptMidBA.x - otherEyeCenter.x, ptMidBA.y - otherEyeCenter.y);

  const isABInner = distAB <= distBA;

  const innerA0 = isABInner ? angA : angB;
  const innerA1 = isABInner ? angA + spanAB : angB + spanBA;

  const outerA0 = isABInner ? angB : angA;
  const outerA1 = isABInner ? angB + spanBA : angA + spanAB;

  const keptOuterArc: Entity = {
    id: uid(),
    layer: eyeCircle.layer,
    type: "arc",
    cx,
    cy,
    r,
    a0: Number(outerA0.toFixed(6)),
    a1: Number(outerA1.toFixed(6)),
    dependencies: eyeCircle.dependencies,
    params: {
      ...eyeCircle.params,
      revEngRole: "corte_externo",
      trimmedFromCircleId: eyeCircle.id,
    },
  };

  const removedInnerArc: Entity = {
    id: uid(),
    layer: "referencia",
    type: "arc",
    cx,
    cy,
    r,
    a0: Number(innerA0.toFixed(6)),
    a1: Number(innerA1.toFixed(6)),
    isConstruction: true,
    params: {
      revEngRole: "ref_hipoteses",
      isRemovedTrimPreview: true,
    },
  };

  const auxiliaryOriginalCircle: Entity = {
    ...eyeCircle,
    layer: "construcao",
    isConstruction: true,
    params: {
      ...eyeCircle.params,
      revEngRole: "ref_hipoteses",
      preservedOriginalEye: true,
    },
  };

  return {
    eyeEntityId: eyeCircle.id,
    center: { x: cx, y: cy },
    radiusMm: r,
    keptOuterArc,
    removedInnerArc,
    auxiliaryOriginalCircle,
  };
}
