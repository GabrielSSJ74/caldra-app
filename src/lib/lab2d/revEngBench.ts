/**
 * CALDRA CHAMFER CAD — MOTOR DE BANCADA MECÂNICA E METROLOGIA 2D (FASE C)
 *
 * Implementa com rigor analítico e zero simplificação:
 * 1. Furo por Paquímetro (Parede a Parede, Fora a Fora, Centro a Centro, Borda a Borda) — Teste T3
 * 2. Trilateração Analítica de 2 Furos-Base (sem medir ângulo, com duas soluções e folga) — Teste T4
 * 3. Rede de Medidas por Mínimos Quadrados (Gauss–Newton com detecção de medida suspeita) — Teste T5
 * 4. Fechamento de Cadeia de Cotas (soma parcial × total medido, distribuição explícita) — Teste T6
 * 5. Calculadora Universal de Corda e Flecha (R = c²/(8f) + f/2 + propagação de incerteza) — Teste T7
 * 6. Tabela de Ordenadas / Estações (levantamento de perfil por afastamentos)
 */

import { uid, type Entity, type Vec2 } from "./core";
import type { CapturedContourPoint, RevEngInfoStatus } from "./revEngTypes";

/* ========================================================================== */
/* 1. FURO POR PAQUÍMETRO (PAREDE A PAREDE, FORA A FORA, CENTRO A CENTRO)     */
/* ========================================================================== */

export type CaliperHoleMeasurementMode =
  | "parede_a_parede"
  | "fora_a_fora"
  | "centro_a_centro"
  | "borda_a_borda";

export interface CaliperHoleInput {
  mode: CaliperHoleMeasurementMode;
  /** Coordenada X da referência (centro do furo-base ou quina de borda) */
  refX: number;
  /** Coordenada Y da referência (centro do furo-base ou quina de borda) */
  refY: number;
  /** Diâmetro do furo de referência D_ref (mm) — usado em parede/fora/centro */
  refDiameterMm?: number;
  /** Diâmetro do novo furo D (mm) */
  targetDiameterMm: number;
  /** Medida lida no paquímetro (d_int, d_ext ou d_cc em mm) */
  measuredDistanceMm?: number;
  /** Ângulo direcional em graus a partir do furo de referência (padrão 0°) */
  angleDeg?: number;
  /** Para modo borda_a_borda: distância da borda X até a parede do furo (mm) */
  edgeDistXMm?: number;
  /** Para modo borda_a_borda: distância da borda Y até a parede do furo (mm) */
  edgeDistYMm?: number;
  /** Sinais de direção a partir do canto de referência (+1 ou -1) */
  signX?: 1 | -1;
  signY?: 1 | -1;
}

export interface CaliperHoleResult {
  valid: boolean;
  mode: CaliperHoleMeasurementMode;
  centerX: number;
  centerY: number;
  radiusMm: number;
  diameterMm: number;
  /** Distância efetiva Centro a Centro L (mm) */
  centerToCenterMm: number;
  /** Parede livre remanescente W (mm) */
  remainingWallMm: number;
  /** Medida externa equivalente Fora a Fora O (mm) */
  outsideToOutsideMm: number;
  /** Erro crítico quando parede <= 0 (furo rompe borda ou colide com furo base) */
  wallTearError?: string;
  /** Aviso quando parede é muito fina (0 < W < 1.5 mm) */
  thinWallWarning?: string;
  infoStatus: RevEngInfoStatus;
  formulaSummary: string;
}

export function computeHoleByCaliper(input: CaliperHoleInput): CaliperHoleResult {
  const D = Number(input.targetDiameterMm);
  if (!Number.isFinite(D) || D <= 0) {
    throw new Error("O diâmetro do novo furo (D) deve ser maior que zero.");
  }
  const rTarget = D / 2;

  if (input.mode === "borda_a_borda") {
    const bx = Number(input.edgeDistXMm ?? 0);
    const by = Number(input.edgeDistYMm ?? 0);
    const sx = input.signX ?? 1;
    const sy = input.signY ?? 1;
    const cx = input.refX + sx * (bx + rTarget);
    const cy = input.refY + sy * (by + rTarget);
    const minWall = Math.min(bx, by);
    const distFromCorner = Math.hypot(cx - input.refX, cy - input.refY);

    let wallTearError: string | undefined;
    let thinWallWarning: string | undefined;
    if (bx <= 0 || by <= 0) {
      wallTearError = `Furo rompe a borda externa (parede mínima ${minWall.toFixed(2)} mm ≤ 0 mm).`;
    } else if (minWall < 1.5) {
      thinWallWarning = `Parede crítica próxima à borda (${minWall.toFixed(2)} mm < 1,50 mm).`;
    }

    return {
      valid: !wallTearError,
      mode: "borda_a_borda",
      centerX: Number(cx.toFixed(4)),
      centerY: Number(cy.toFixed(4)),
      radiusMm: Number(rTarget.toFixed(4)),
      diameterMm: Number(D.toFixed(4)),
      centerToCenterMm: Number(distFromCorner.toFixed(4)),
      remainingWallMm: Number(minWall.toFixed(4)),
      outsideToOutsideMm: Number((distFromCorner + rTarget).toFixed(4)),
      wallTearError,
      thinWallWarning,
      infoStatus: "CALCULADO",
      formulaSummary: `Xc = ${input.refX} + (${bx} + ${D}/2) = ${cx.toFixed(2)} mm · Yc = ${input.refY} + (${by} + ${D}/2) = ${cy.toFixed(2)} mm`,
    };
  }

  const Dref = Number(input.refDiameterMm ?? 0);
  if (!Number.isFinite(Dref) || Dref < 0) {
    throw new Error("O diâmetro do furo de referência (D_ref) deve ser não-negativo.");
  }
  const measured = Number(input.measuredDistanceMm ?? 0);
  if (!Number.isFinite(measured) || measured <= 0) {
    throw new Error("A medida informada do paquímetro deve ser maior que zero.");
  }

  const halfSum = (Dref + D) / 2;
  let L = 0;
  let W = 0;
  let O = 0;
  let formulaSummary = "";

  if (input.mode === "parede_a_parede") {
    // L = d_int + (D_ref + D)/2
    L = measured + halfSum;
    W = measured;
    O = L + halfSum;
    formulaSummary = `L = d_int (${measured.toFixed(2)}) + (${Dref.toFixed(1)} + ${D.toFixed(1)})/2 = ${L.toFixed(3)} mm`;
  } else if (input.mode === "fora_a_fora") {
    // L = d_ext - (D_ref + D)/2
    L = measured - halfSum;
    W = L - halfSum;
    O = measured;
    formulaSummary = `L = d_ext (${measured.toFixed(2)}) − (${Dref.toFixed(1)} + ${D.toFixed(1)})/2 = ${L.toFixed(3)} mm`;
  } else {
    // centro_a_centro direto
    L = measured;
    W = L - halfSum;
    O = L + halfSum;
    formulaSummary = `L = d_cc direto = ${L.toFixed(3)} mm (Parede W = ${W.toFixed(2)} mm)`;
  }

  const angleRad = ((input.angleDeg ?? 0) * Math.PI) / 180;
  const cx = input.refX + L * Math.cos(angleRad);
  const cy = input.refY + L * Math.sin(angleRad);

  let wallTearError: string | undefined;
  let thinWallWarning: string | undefined;
  if (L <= 0) {
    wallTearError = `Distância entre centros inválida (L = ${L.toFixed(2)} mm ≤ 0). Verifique a leitura Fora a Fora.`;
  } else if (Dref > 0 && W <= 0) {
    wallTearError = `Colisão entre furos: parede remanescente W = ${W.toFixed(2)} mm ≤ 0 mm.`;
  } else if (Dref > 0 && W < 1.5) {
    thinWallWarning = `Parede estreita entre furos: W = ${W.toFixed(2)} mm (< 1,50 mm).`;
  }

  return {
    valid: !wallTearError,
    mode: input.mode,
    centerX: Number(cx.toFixed(4)),
    centerY: Number(cy.toFixed(4)),
    radiusMm: Number(rTarget.toFixed(4)),
    diameterMm: Number(D.toFixed(4)),
    centerToCenterMm: Number(L.toFixed(4)),
    remainingWallMm: Number(W.toFixed(4)),
    outsideToOutsideMm: Number(O.toFixed(4)),
    wallTearError,
    thinWallWarning,
    infoStatus: input.mode === "centro_a_centro" ? "MEDIDO" : "CALCULADO",
    formulaSummary,
  };
}

/**
 * Converte uma leitura de paquímetro (parede, fora ou centro) entre dois furos de diâmetros D1 e D2
 * para a distância efetiva Centro a Centro L.
 */
export function convertCaliperReadingToCenterDistance(
  readingMm: number,
  mode: "parede_a_parede" | "fora_a_fora" | "centro_a_centro",
  d1Mm: number,
  d2Mm: number,
): number {
  const halfSum = (Math.max(0, d1Mm) + Math.max(0, d2Mm)) / 2;
  if (mode === "parede_a_parede") return readingMm + halfSum;
  if (mode === "fora_a_fora") return readingMm - halfSum;
  return readingMm;
}

/**
 * Cria a entidade Círculo do furo + linhas de centro opcionais na camada semântica correta.
 */
export function buildHoleCadEntities(
  center: Vec2,
  diameterMm: number,
  infoStatus: RevEngInfoStatus,
  includeCenterlines = true,
  cutLayer = "recorte",
): Entity[] {
  const r = Math.max(0.1, diameterMm / 2);
  const holeId = uid();
  const holeEntity: Entity = {
    id: holeId,
    layer: cutLayer,
    type: "circle",
    cx: Number(center.x.toFixed(4)),
    cy: Number(center.y.toFixed(4)),
    r: Number(r.toFixed(4)),
    params: {
      revEngRole: "corte_interno_furos",
      revEngStatus: infoStatus,
      nominalDiameterMm: diameterMm,
    },
  };

  if (!includeCenterlines) return [holeEntity];

  const ext = Math.max(r * 1.35, r + 3);
  const hLine: Entity = {
    id: uid(),
    layer: "auxiliar",
    type: "line",
    x1: Number((center.x - ext).toFixed(4)),
    y1: Number(center.y.toFixed(4)),
    x2: Number((center.x + ext).toFixed(4)),
    y2: Number(center.y.toFixed(4)),
    isConstruction: true,
    dependencies: [holeId],
    params: {
      revEngRole: "linhas_centro",
      revEngStatus: infoStatus,
      parentHoleId: holeId,
    },
  };
  const vLine: Entity = {
    id: uid(),
    layer: "auxiliar",
    type: "line",
    x1: Number(center.x.toFixed(4)),
    y1: Number((center.y - ext).toFixed(4)),
    x2: Number(center.x.toFixed(4)),
    y2: Number((center.y + ext).toFixed(4)),
    isConstruction: true,
    dependencies: [holeId],
    params: {
      revEngRole: "linhas_centro",
      revEngStatus: infoStatus,
      parentHoleId: holeId,
    },
  };

  return [holeEntity, hLine, vLine];
}

/* ========================================================================== */
/* 2. TRILATERAÇÃO ANALÍTICA DE 2 FUROS-BASE (TESTE T4)                       */
/* ========================================================================== */

export interface TrilaterationInput {
  p1: Vec2;
  p2: Vec2;
  /** Diâmetro do furo base 1 (mm) — usado se mode1 != centro_a_centro */
  d1Mm?: number;
  /** Diâmetro do furo base 2 (mm) — usado se mode2 != centro_a_centro */
  d2Mm?: number;
  /** Diâmetro do novo furo 3 (mm) */
  targetDiameterMm: number;
  /** Distância medida a partir do furo 1 (mm) */
  reading1Mm: number;
  mode1?: "centro_a_centro" | "parede_a_parede" | "fora_a_fora";
  /** Distância medida a partir do furo 2 (mm) */
  reading2Mm: number;
  mode2?: "centro_a_centro" | "parede_a_parede" | "fora_a_fora";
}

export interface TrilaterationResult {
  valid: boolean;
  /** Distância entre as bases d = |P2 - P1| */
  baseDistanceMm: number;
  /** Raio centro-a-centro efetivo L1 */
  L1Mm: number;
  /** Raio centro-a-centro efetivo L2 */
  L2Mm: number;
  /** Projeção axial a = (L1² - L2² + d²)/(2d) */
  aMm?: number;
  /** Altura ortogonal h = sqrt(L1² - a²) */
  hMm?: number;
  /** Solução A (lado +n): P1 + a·u + h·n */
  solutionA?: Vec2;
  /** Solução B (lado -n): P1 + a·u - h·n */
  solutionB?: Vec2;
  /** Folga ou interferência em mm quando não há solução (ex.: T4 folga de 30 mm) */
  gapMm?: number;
  failureReason?: "coincident_bases" | "too_short_gap" | "contained_gap" | "invalid_radius";
  message: string;
  infoStatus: RevEngInfoStatus;
}

export function solveTrilateration2D(input: TrilaterationInput): TrilaterationResult {
  const d1 = input.d1Mm ?? 0;
  const d2 = input.d2Mm ?? 0;
  const d3 = input.targetDiameterMm;

  const L1 = convertCaliperReadingToCenterDistance(
    input.reading1Mm,
    input.mode1 ?? "centro_a_centro",
    d1,
    d3,
  );
  const L2 = convertCaliperReadingToCenterDistance(
    input.reading2Mm,
    input.mode2 ?? "centro_a_centro",
    d2,
    d3,
  );

  const dx = input.p2.x - input.p1.x;
  const dy = input.p2.y - input.p1.y;
  const d = Math.hypot(dx, dy);

  if (d < 1e-6) {
    return {
      valid: false,
      baseDistanceMm: 0,
      L1Mm: L1,
      L2Mm: L2,
      failureReason: "coincident_bases",
      message: "Sem solução: os dois furos-base P1 e P2 têm a mesma coordenada (d = 0 mm).",
      infoStatus: "DESCONHECIDO",
    };
  }

  if (L1 <= 0 || L2 <= 0) {
    return {
      valid: false,
      baseDistanceMm: Number(d.toFixed(4)),
      L1Mm: Number(L1.toFixed(4)),
      L2Mm: Number(L2.toFixed(4)),
      failureReason: "invalid_radius",
      message: `Sem solução: distância centro-a-centro calculada não positiva (L1=${L1.toFixed(2)} mm, L2=${L2.toFixed(2)} mm).`,
      infoStatus: "DESCONHECIDO",
    };
  }

  const sumL = L1 + L2;
  const diffL = Math.abs(L1 - L2);
  const eps = 1e-6;

  // Caso 1: L1 + L2 < d (os raios não se alcançam — há uma folga de d - (L1 + L2))
  if (d > sumL + eps) {
    const gap = d - sumL;
    return {
      valid: false,
      baseDistanceMm: Number(d.toFixed(4)),
      L1Mm: Number(L1.toFixed(4)),
      L2Mm: Number(L2.toFixed(4)),
      gapMm: Number(gap.toFixed(4)),
      failureReason: "too_short_gap",
      message: `Sem solução: L1 (${L1.toFixed(1)} mm) + L2 (${L2.toFixed(1)} mm) = ${sumL.toFixed(1)} mm é menor que a distância entre as bases (${d.toFixed(1)} mm), restando uma folga de ${gap.toFixed(1)} mm. Confira as medidas no paquímetro.`,
      infoStatus: "DESCONHECIDO",
    };
  }

  // Caso 2: d < |L1 - L2| (um círculo contém o outro sem interseção)
  if (d < diffL - eps) {
    const gap = diffL - d;
    return {
      valid: false,
      baseDistanceMm: Number(d.toFixed(4)),
      L1Mm: Number(L1.toFixed(4)),
      L2Mm: Number(L2.toFixed(4)),
      gapMm: Number(gap.toFixed(4)),
      failureReason: "contained_gap",
      message: `Sem solução: |L1 − L2| (${diffL.toFixed(1)} mm) é maior que a distância entre as bases (${d.toFixed(1)} mm), com folga interna de ${gap.toFixed(1)} mm. Meça novamente.`,
      infoStatus: "DESCONHECIDO",
    };
  }

  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const hSq = Math.max(0, L1 * L1 - a * a);
  const h = Math.sqrt(hSq);

  const ux = dx / d;
  const uy = dy / d;
  // Vetor normal u girado +90°: n = (-uy, ux)
  const nx = -uy;
  const ny = ux;

  const basePtX = input.p1.x + a * ux;
  const basePtY = input.p1.y + a * uy;

  const solA: Vec2 = {
    x: Number((basePtX + h * nx).toFixed(4)),
    y: Number((basePtY + h * ny).toFixed(4)),
  };
  const solB: Vec2 = {
    x: Number((basePtX - h * nx).toFixed(4)),
    y: Number((basePtY - h * ny).toFixed(4)),
  };

  return {
    valid: true,
    baseDistanceMm: Number(d.toFixed(4)),
    L1Mm: Number(L1.toFixed(4)),
    L2Mm: Number(L2.toFixed(4)),
    aMm: Number(a.toFixed(4)),
    hMm: Number(h.toFixed(4)),
    solutionA: solA,
    solutionB: solB,
    message: `Trilateração exata: Solução A (${solA.x.toFixed(2)}; ${solA.y.toFixed(2)}) · Solução B (${solB.x.toFixed(2)}; ${solB.y.toFixed(2)}).`,
    infoStatus: "CALCULADO",
  };
}

/* ========================================================================== */
/* 3. REDE DE MEDIDAS POR MÍNIMOS QUADRADOS — GAUSS–NEWTON (TESTE T5)         */
/* ========================================================================== */

export interface HoleNetworkNode {
  id: string;
  label: string;
  diameterMm: number;
  /** Coordenada X inicial (se conhecida) ou estimada */
  x?: number;
  /** Coordenada Y inicial (se conhecida) ou estimada */
  y?: number;
}

export interface HoleNetworkEdge {
  id: string;
  fromId: string;
  toId: string;
  readingMm: number;
  mode: "centro_a_centro" | "parede_a_parede" | "fora_a_fora";
  uncertaintyMm?: number;
}

export interface HoleNetworkSolvedNode {
  id: string;
  label: string;
  diameterMm: number;
  x: number;
  y: number;
  infoStatus: RevEngInfoStatus;
}

export interface HoleNetworkEdgeResidual {
  edgeId: string;
  fromId: string;
  toId: string;
  measuredCenterDistMm: number;
  fittedCenterDistMm: number;
  residualMm: number;
  normalizedResidual: number;
  uncertaintyMm: number;
  isSuspect: boolean;
}

export type NetworkDeterminacyState =
  | "subdeterminada"
  | "determinada"
  | "sobredeterminada";

export interface HoleNetworkResult {
  valid: boolean;
  determinacy: NetworkDeterminacyState;
  degreesOfFreedom: number;
  nodes: HoleNetworkSolvedNode[];
  edgeResiduals: HoleNetworkEdgeResidual[];
  rmsResidualMm: number;
  maxAbsResidualMm: number;
  suspectEdgeId: string | null;
  iterations: number;
  message: string;
}

/**
 * Resolve uma rede de furos a partir de distâncias medidas entre pares.
 * Fixa o Nó 0 na sua posição âncora (padrão 0,0) e o Nó 1 na direção do eixo X positivo
 * (ou mantém seu ângulo de referência inicial), eliminando os 3 graus de liberdade de corpo rígido.
 * Inicializa nós sem coordenadas por trilateração sequencial e refina tudo por Gauss–Newton amortecido.
 */
export function solveHoleNetworkGaussNewton(
  nodesInput: HoleNetworkNode[],
  edgesInput: HoleNetworkEdge[],
  anchorAId?: string,
  anchorBId?: string,
): HoleNetworkResult {
  const n = nodesInput.length;
  if (n < 2) {
    throw new Error("A rede de furos precisa de pelo menos 2 furos.");
  }

  const requiredEdges = Math.max(1, 2 * n - 3);
  const m = edgesInput.length;
  const dof = m - requiredEdges;
  const determinacy: NetworkDeterminacyState =
    dof < 0 ? "subdeterminada" : dof === 0 ? "determinada" : "sobredeterminada";

  const nodeMap = new Map<string, number>();
  nodesInput.forEach((nd, idx) => nodeMap.set(nd.id, idx));

  const idxA = anchorAId && nodeMap.has(anchorAId) ? nodeMap.get(anchorAId)! : 0;
  let idxB = anchorBId && nodeMap.has(anchorBId) ? nodeMap.get(anchorBId)! : 1;
  if (idxB === idxA) idxB = idxA === 0 ? 1 : 0;

  // Converte todas as arestas para distância Centro a Centro L_k
  const convertedEdges = edgesInput.map((e) => {
    const i = nodeMap.get(e.fromId);
    const j = nodeMap.get(e.toId);
    if (i === undefined || j === undefined || i === j) {
      throw new Error(`Aresta inválida entre "${e.fromId}" e "${e.toId}".`);
    }
    const d1 = nodesInput[i]!.diameterMm;
    const d2 = nodesInput[j]!.diameterMm;
    const L = convertCaliperReadingToCenterDistance(e.readingMm, e.mode, d1, d2);
    const sigma = Math.max(0.01, e.uncertaintyMm ?? 0.1);
    return {
      ...e,
      i,
      j,
      L,
      sigma,
    };
  });

  // Inicializa posições (x, y)
  const pos: Vec2[] = nodesInput.map((nd) => ({
    x: typeof nd.x === "number" && Number.isFinite(nd.x) ? nd.x : NaN,
    y: typeof nd.y === "number" && Number.isFinite(nd.y) ? nd.y : NaN,
  }));

  // Garante âncora A em (0,0) se não informada
  if (!Number.isFinite(pos[idxA]!.x) || !Number.isFinite(pos[idxA]!.y)) {
    pos[idxA] = { x: 0, y: 0 };
  }

  // Garante âncora B no eixo X se não informada
  const edgeAB = convertedEdges.find(
    (e) => (e.i === idxA && e.j === idxB) || (e.i === idxB && e.j === idxA),
  );
  const anchorAngleRad =
    Number.isFinite(pos[idxB]!.x) && Number.isFinite(pos[idxB]!.y)
      ? Math.atan2(pos[idxB]!.y - pos[idxA]!.y, pos[idxB]!.x - pos[idxA]!.x)
      : 0;

  if (!Number.isFinite(pos[idxB]!.x) || !Number.isFinite(pos[idxB]!.y)) {
    const dAB = edgeAB ? edgeAB.L : 100;
    pos[idxB] = {
      x: pos[idxA]!.x + dAB * Math.cos(anchorAngleRad),
      y: pos[idxA]!.y + dAB * Math.sin(anchorAngleRad),
    };
  }

  // Inicializa nós restantes por trilateração a partir dos nós já posicionados
  for (let pass = 0; pass < n; pass++) {
    for (let k = 0; k < n; k++) {
      if (Number.isFinite(pos[k]!.x) && Number.isFinite(pos[k]!.y)) continue;
      // Procura duas arestas conectando k a nós já conhecidos
      const knownLinks = convertedEdges.filter(
        (e) =>
          (e.i === k && Number.isFinite(pos[e.j]!.x)) ||
          (e.j === k && Number.isFinite(pos[e.i]!.x)),
      );
      if (knownLinks.length >= 2) {
        const e1 = knownLinks[0]!;
        const e2 = knownLinks[1]!;
        const n1 = e1.i === k ? e1.j : e1.i;
        const n2 = e2.i === k ? e2.j : e2.i;
        const tri = solveTrilateration2D({
          p1: pos[n1]!,
          p2: pos[n2]!,
          targetDiameterMm: nodesInput[k]!.diameterMm,
          reading1Mm: e1.L,
          mode1: "centro_a_centro",
          reading2Mm: e2.L,
          mode2: "centro_a_centro",
        });
        if (tri.valid && tri.solutionA) {
          // Se houver uma 3ª aresta para desempate de sinal (solA vs solB), escolhe a que minimiza o erro na 3ª aresta
          if (knownLinks.length >= 3 && tri.solutionB) {
            const e3 = knownLinks[2]!;
            const n3 = e3.i === k ? e3.j : e3.i;
            const errA = Math.abs(Math.hypot(tri.solutionA.x - pos[n3]!.x, tri.solutionA.y - pos[n3]!.y) - e3.L);
            const errB = Math.abs(Math.hypot(tri.solutionB.x - pos[n3]!.x, tri.solutionB.y - pos[n3]!.y) - e3.L);
            pos[k] = errB < errA ? tri.solutionB : tri.solutionA;
          } else if (tri.solutionB && tri.solutionB.y > tri.solutionA.y) {
            pos[k] = tri.solutionB;
          } else {
            pos[k] = tri.solutionA;
          }
        }
      }
    }
  }

  // Fallback para qualquer nó ainda sem posição (rede subdeterminada)
  for (let k = 0; k < n; k++) {
    if (!Number.isFinite(pos[k]!.x) || !Number.isFinite(pos[k]!.y)) {
      pos[k] = { x: k * 30, y: (k % 2) * 30 };
    }
  }

  // Parametrização dos graus de liberdade livres:
  // - Nó idxA: fixo em (xA0, yA0)
  // - Nó idxB: move-se apenas ao longo do raio sB a partir de A no ângulo anchorAngleRad (1 parâmetro)
  // - Demais nós k: (xk, yk) livres (2 parâmetros cada)
  const anchorA0 = { ...pos[idxA]! };
  const cosAng = Math.cos(anchorAngleRad);
  const sinAng = Math.sin(anchorAngleRad);

  let sB = Math.hypot(pos[idxB]!.x - anchorA0.x, pos[idxB]!.y - anchorA0.y);
  if (sB < 1e-3) sB = edgeAB ? edgeAB.L : 50;

  const freeNodeIndices: number[] = [];
  for (let k = 0; k < n; k++) {
    if (k !== idxA && k !== idxB) freeNodeIndices.push(k);
  }

  // Vetor de estado p: [sB, x_f0, y_f0, x_f1, y_f1, ...]
  const numParams = 1 + 2 * freeNodeIndices.length;
  const params = new Array<number>(numParams).fill(0);
  params[0] = sB;
  freeNodeIndices.forEach((nodeIdx, fIdx) => {
    params[1 + 2 * fIdx] = pos[nodeIdx]!.x;
    params[1 + 2 * fIdx + 1] = pos[nodeIdx]!.y;
  });

  const unpackPositions = (pVec: number[]): Vec2[] => {
    const out: Vec2[] = new Array(n);
    out[idxA] = { x: anchorA0.x, y: anchorA0.y };
    out[idxB] = {
      x: anchorA0.x + pVec[0]! * cosAng,
      y: anchorA0.y + pVec[0]! * sinAng,
    };
    freeNodeIndices.forEach((nodeIdx, fIdx) => {
      out[nodeIdx] = {
        x: pVec[1 + 2 * fIdx]!,
        y: pVec[1 + 2 * fIdx + 1]!,
      };
    });
    return out;
  };

  const computeCost = (pVec: number[]): number => {
    const pts = unpackPositions(pVec);
    let cost = 0;
    for (const e of convertedEdges) {
      const dHat = Math.hypot(pts[e.j]!.x - pts[e.i]!.x, pts[e.j]!.y - pts[e.i]!.y);
      const r = (dHat - e.L) / e.sigma;
      cost += r * r;
    }
    return cost;
  };

  // Refinamento iterativo de Gauss–Newton com amortecimento de Levenberg–Marquardt
  let lambda = 1e-3;
  let currentCost = computeCost(params);
  let iterations = 0;

  for (let iter = 0; iter < 60; iter++) {
    iterations = iter + 1;
    const pts = unpackPositions(params);

    // Monta J^T W J (numParams x numParams) e -J^T W r (numParams)
    const A: number[][] = Array.from({ length: numParams }, () =>
      new Array<number>(numParams).fill(0),
    );
    const b: number[] = new Array<number>(numParams).fill(0);

    for (const e of convertedEdges) {
      const pi = pts[e.i]!;
      const pj = pts[e.j]!;
      const dx = pj.x - pi.x;
      const dy = pj.y - pi.y;
      const distIJ = Math.max(1e-6, Math.hypot(dx, dy));
      const ux = dx / distIJ;
      const uy = dy / distIJ;

      const res = distIJ - e.L;
      const w = 1 / (e.sigma * e.sigma);

      // Linha do Jacobiano para esta aresta
      const jRow = new Array<number>(numParams).fill(0);

      const addNodeGrad = (nodeIdx: number, sign: 1 | -1) => {
        if (nodeIdx === idxA) return;
        if (nodeIdx === idxB) {
          jRow[0]! += sign * (ux * cosAng + uy * sinAng);
          return;
        }
        const fIdx = freeNodeIndices.indexOf(nodeIdx);
        if (fIdx >= 0) {
          jRow[1 + 2 * fIdx]! += sign * ux;
          jRow[1 + 2 * fIdx + 1]! += sign * uy;
        }
      };

      addNodeGrad(e.j, 1);
      addNodeGrad(e.i, -1);

      for (let rIdx = 0; rIdx < numParams; rIdx++) {
        const jr = jRow[rIdx]!;
        if (jr === 0) continue;
        b[rIdx]! -= w * jr * res;
        for (let cIdx = 0; cIdx < numParams; cIdx++) {
          A[rIdx]![cIdx]! += w * jr * jRow[cIdx]!;
        }
      }
    }

    for (let dIdx = 0; dIdx < numParams; dIdx++) {
      A[dIdx]![dIdx] = (A[dIdx]![dIdx] || 0) + lambda * ((A[dIdx]![dIdx] || 0) + 1);
    }

    const delta = solveLinearSystem(A, b);
    if (!delta) break;

    const stepNorm = Math.sqrt(delta.reduce((acc, v) => acc + v * v, 0));
    if (stepNorm < 1e-7) break;

    const candParams = params.map((v, idx) => v + delta[idx]!);
    const candCost = computeCost(candParams);

    if (candCost < currentCost) {
      for (let idx = 0; idx < numParams; idx++) params[idx] = candParams[idx]!;
      currentCost = candCost;
      lambda = Math.max(1e-7, lambda * 0.3);
    } else {
      lambda = Math.min(1e5, lambda * 4);
    }
  }

  const finalPts = unpackPositions(params);

  // Calcula resíduos por aresta e detecta eventual medida suspeita (outlier em rede sobredeterminada)
  let sumSqRes = 0;
  let maxAbsRes = 0;
  let worstEdgeId: string | null = null;
  let worstNormRes = 0;

  const rawEdgeStats = convertedEdges.map((e) => {
    const fittedDist = Math.hypot(
      finalPts[e.j]!.x - finalPts[e.i]!.x,
      finalPts[e.j]!.y - finalPts[e.i]!.y,
    );
    const resMm = fittedDist - e.L;
    const normRes = Math.abs(resMm) / e.sigma;
    sumSqRes += resMm * resMm;
    if (Math.abs(resMm) > maxAbsRes) maxAbsRes = Math.abs(resMm);
    if (normRes > worstNormRes) {
      worstNormRes = normRes;
      worstEdgeId = e.id;
    }
    return {
      edgeId: e.id,
      fromId: e.fromId,
      toId: e.toId,
      measuredCenterDistMm: Number(e.L.toFixed(4)),
      fittedCenterDistMm: Number(fittedDist.toFixed(4)),
      residualMm: Number(resMm.toFixed(4)),
      normalizedResidual: Number(normRes.toFixed(3)),
      uncertaintyMm: e.sigma,
    };
  });

  // Detecção de medida suspeita em redes sobredeterminadas:
  // - Para GL >= 2: leave-one-out identifica a aresta cuja remoção anula o resíduo global.
  // - Para GL === 1 com 4 furos (quadrilátero completo de 6 arestas): compara as diagonais
  //   com a hipotenusa pitagórica dos lados opostos quando os lados opostos são consistentes.
  if (determinacy === "sobredeterminada" && maxAbsRes > 0.25) {
    if (dof >= 2 && convertedEdges.length >= 4) {
      let bestConsistentEdgeId: string | null = null;
      let bestDropCost = Infinity;

      for (let dropIdx = 0; dropIdx < convertedEdges.length; dropIdx++) {
        const subsetEdges = edgesInput.filter((_, idx) => idx !== dropIdx);
        try {
          const subFit = solveHoleNetworkLeaveOneOutSub(
            nodesInput,
            subsetEdges,
            anchorAId,
            anchorBId,
          );
          if (subFit.rms < bestDropCost) {
            bestDropCost = subFit.rms;
            bestConsistentEdgeId = convertedEdges[dropIdx]!.id;
          }
        } catch {
          // Ignora sub-rede desconexa
        }
      }

      if (bestConsistentEdgeId && bestDropCost < Math.sqrt(sumSqRes / Math.max(1, m)) * 0.45) {
        worstEdgeId = bestConsistentEdgeId;
      }
    } else if (dof === 1 && n === 4 && convertedEdges.length === 6) {
      // Ordena as 6 arestas por comprimento: em um retângulo, as 2 maiores são as diagonais
      const sortedByLen = [...convertedEdges].sort((a, b) => a.L - b.L);
      const short1 = sortedByLen[0]!;
      const short2 = sortedByLen[1]!;
      const mid1 = sortedByLen[2]!;
      const mid2 = sortedByLen[3]!;
      const diag1 = sortedByLen[4]!;
      const diag2 = sortedByLen[5]!;

      if (
        Math.abs(short1.L - short2.L) <= 0.5 &&
        Math.abs(mid1.L - mid2.L) <= 0.5
      ) {
        const meanH = 0.5 * (short1.L + short2.L);
        const meanW = 0.5 * (mid1.L + mid2.L);
        const expectedDiag = Math.hypot(meanW, meanH);
        const errDiag1 = Math.abs(diag1.L - expectedDiag);
        const errDiag2 = Math.abs(diag2.L - expectedDiag);
        if (Math.max(errDiag1, errDiag2) > 0.5) {
          worstEdgeId = errDiag1 >= errDiag2 ? diag1.id : diag2.id;
        }
      }
    }
  }

  const suspectEdgeId =
    worstEdgeId && (worstNormRes > 2.5 || maxAbsRes > 0.35) ? worstEdgeId : null;

  const edgeResiduals: HoleNetworkEdgeResidual[] = rawEdgeStats.map((st) => ({
    ...st,
    isSuspect: st.edgeId === suspectEdgeId,
  }));

  const rmsResidualMm = Number(Math.sqrt(sumSqRes / Math.max(1, m)).toFixed(4));

  const solvedNodes: HoleNetworkSolvedNode[] = nodesInput.map((nd, idx) => ({
    id: nd.id,
    label: nd.label,
    diameterMm: nd.diameterMm,
    x: Number(finalPts[idx]!.x.toFixed(4)),
    y: Number(finalPts[idx]!.y.toFixed(4)),
    infoStatus: determinacy === "subdeterminada" ? "ESTIMADO" : "AJUSTADO",
  }));

  let message = `Rede ${determinacy} (${m} medidas para ${n} furos · RMS ${rmsResidualMm.toFixed(3)} mm).`;
  if (suspectEdgeId) {
    const susp = edgeResiduals.find((e) => e.edgeId === suspectEdgeId);
    message += ` Atenção: medida suspeita entre ${susp?.fromId} e ${susp?.toId} (resíduo ${susp?.residualMm.toFixed(2)} mm).`;
  }

  return {
    valid: determinacy !== "subdeterminada",
    determinacy,
    degreesOfFreedom: dof,
    nodes: solvedNodes,
    edgeResiduals,
    rmsResidualMm,
    maxAbsResidualMm: Number(maxAbsRes.toFixed(4)),
    suspectEdgeId,
    iterations,
    message,
  };
}

function solveHoleNetworkLeaveOneOutSub(
  nodesInput: HoleNetworkNode[],
  subsetEdges: HoleNetworkEdge[],
  anchorAId?: string,
  anchorBId?: string,
): { rms: number } {
  // Execução sem recursão de leave-one-out
  const n = nodesInput.length;
  const nodeMap = new Map<string, number>();
  nodesInput.forEach((nd, idx) => nodeMap.set(nd.id, idx));
  const idxA = anchorAId && nodeMap.has(anchorAId) ? nodeMap.get(anchorAId)! : 0;
  let idxB = anchorBId && nodeMap.has(anchorBId) ? nodeMap.get(anchorBId)! : 1;
  if (idxB === idxA) idxB = idxA === 0 ? 1 : 0;

  const conv = subsetEdges.map((e) => {
    const i = nodeMap.get(e.fromId)!;
    const j = nodeMap.get(e.toId)!;
    return {
      i,
      j,
      L: convertCaliperReadingToCenterDistance(
        e.readingMm,
        e.mode,
        nodesInput[i]!.diameterMm,
        nodesInput[j]!.diameterMm,
      ),
      sigma: Math.max(0.01, e.uncertaintyMm ?? 0.1),
    };
  });

  const pos: Vec2[] = nodesInput.map((nd) => ({
    x: typeof nd.x === "number" && Number.isFinite(nd.x) ? nd.x : NaN,
    y: typeof nd.y === "number" && Number.isFinite(nd.y) ? nd.y : NaN,
  }));
  pos[idxA] = { x: 0, y: 0 };
  const edgeAB = conv.find(
    (e) => (e.i === idxA && e.j === idxB) || (e.i === idxB && e.j === idxA),
  );
  pos[idxB] = { x: edgeAB ? edgeAB.L : 100, y: 0 };

  for (let pass = 0; pass < n; pass++) {
    for (let k = 0; k < n; k++) {
      if (Number.isFinite(pos[k]!.x)) continue;
      const links = conv.filter(
        (e) =>
          (e.i === k && Number.isFinite(pos[e.j]!.x)) ||
          (e.j === k && Number.isFinite(pos[e.i]!.x)),
      );
      if (links.length >= 2) {
        const e1 = links[0]!;
        const e2 = links[1]!;
        const n1 = e1.i === k ? e1.j : e1.i;
        const n2 = e2.i === k ? e2.j : e2.i;
        const tri = solveTrilateration2D({
          p1: pos[n1]!,
          p2: pos[n2]!,
          targetDiameterMm: nodesInput[k]!.diameterMm,
          reading1Mm: e1.L,
          reading2Mm: e2.L,
        });
        if (tri.valid && tri.solutionA) {
          if (links.length >= 3 && tri.solutionB) {
            const e3 = links[2]!;
            const n3 = e3.i === k ? e3.j : e3.i;
            const errA = Math.abs(Math.hypot(tri.solutionA.x - pos[n3]!.x, tri.solutionA.y - pos[n3]!.y) - e3.L);
            const errB = Math.abs(Math.hypot(tri.solutionB.x - pos[n3]!.x, tri.solutionB.y - pos[n3]!.y) - e3.L);
            pos[k] = errB < errA ? tri.solutionB : tri.solutionA;
          } else if (tri.solutionB && tri.solutionB.y > tri.solutionA.y) {
            pos[k] = tri.solutionB;
          } else {
            pos[k] = tri.solutionA;
          }
        }
      }
    }
  }
  for (let k = 0; k < n; k++) {
    if (!Number.isFinite(pos[k]!.x)) return { rms: Infinity };
  }

  // Refinamento rápido de Gauss–Newton na sub-rede (sem recursão de leave-one-out)
  const freeNodes: number[] = [];
  for (let k = 0; k < n; k++) {
    if (k !== idxA && k !== idxB) freeNodes.push(k);
  }
  const numP = 1 + 2 * freeNodes.length;
  const p = new Array<number>(numP).fill(0);
  p[0] = Math.hypot(pos[idxB]!.x - pos[idxA]!.x, pos[idxB]!.y - pos[idxA]!.y);
  freeNodes.forEach((nIdx, fIdx) => {
    p[1 + 2 * fIdx] = pos[nIdx]!.x;
    p[1 + 2 * fIdx + 1] = pos[nIdx]!.y;
  });

  const unpack = (vec: number[]): Vec2[] => {
    const out: Vec2[] = new Array(n);
    out[idxA] = { x: 0, y: 0 };
    out[idxB] = { x: vec[0]!, y: 0 };
    freeNodes.forEach((nIdx, fIdx) => {
      out[nIdx] = { x: vec[1 + 2 * fIdx]!, y: vec[1 + 2 * fIdx + 1]! };
    });
    return out;
  };

  for (let it = 0; it < 25; it++) {
    const pts = unpack(p);
    const A: number[][] = Array.from({ length: numP }, () => new Array<number>(numP).fill(0));
    const b: number[] = new Array<number>(numP).fill(0);
    for (const e of conv) {
      const dx = pts[e.j]!.x - pts[e.i]!.x;
      const dy = pts[e.j]!.y - pts[e.i]!.y;
      const distIJ = Math.max(1e-6, Math.hypot(dx, dy));
      const ux = dx / distIJ;
      const uy = dy / distIJ;
      const res = distIJ - e.L;
      const jRow = new Array<number>(numP).fill(0);
      const addG = (nodeIdx: number, sgn: 1 | -1) => {
        if (nodeIdx === idxA) return;
        if (nodeIdx === idxB) {
          jRow[0]! += sgn * ux;
          return;
        }
        const fIdx = freeNodes.indexOf(nodeIdx);
        if (fIdx >= 0) {
          jRow[1 + 2 * fIdx]! += sgn * ux;
          jRow[1 + 2 * fIdx + 1]! += sgn * uy;
        }
      };
      addG(e.j, 1);
      addG(e.i, -1);
      for (let r = 0; r < numP; r++) {
        b[r]! -= jRow[r]! * res;
        for (let c = 0; c < numP; c++) A[r]![c]! += jRow[r]! * jRow[c]!;
      }
    }
    for (let d = 0; d < numP; d++) A[d]![d]! += 1e-3;
    const step = solveLinearSystem(A, b);
    if (!step) break;
    for (let d = 0; d < numP; d++) p[d]! += step[d]!;
  }

  const finalSubPts = unpack(p);
  let sumSq = 0;
  for (const e of conv) {
    const d = Math.hypot(
      finalSubPts[e.j]!.x - finalSubPts[e.i]!.x,
      finalSubPts[e.j]!.y - finalSubPts[e.i]!.y,
    );
    const r = d - e.L;
    sumSq += r * r;
  }
  return { rms: Math.sqrt(sumSq / Math.max(1, conv.length)) };
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, idx) => [...row, b[idx]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[pivot]![col]!)) {
        pivot = row;
      }
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const div = M[col]![col]!;
    for (let j = col; j <= n; j++) M[col]![j]! /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row]![col]!;
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        M[row]![j]! -= factor * M[col]![j]!;
      }
    }
  }

  return M.map((row) => row[n]!);
}

/* ========================================================================== */
/* 4. FECHAMENTO DE CADEIA DE COTAS (TESTE T6)                                */
/* ========================================================================== */

export interface DimensionChainInput {
  /** Lista de cotas parciais em sequência (ex.: [30, 30, 35, 40, 10, 5]) */
  partialsMm: number[];
  /** Cota total aferida ponta a ponta com paquímetro/trena (ex.: 150.4 mm) */
  totalMeasuredMm?: number;
  /** Tolerância aceitável de fechamento em mm (padrão 0.20 mm) */
  closureToleranceMm?: number;
  /** Incerteza individual por leitura de instrumento (padrão 0.05 mm) */
  perStepUncertaintyMm?: number;
  /**
   * Se true, distribui proporcionalmente o erro de fechamento nas posições.
   * REGRA SEÇÃO 5: NUNCA distribuir automaticamente sem ação explícita do usuário!
   */
  distributeError?: boolean;
  /** Coordenada inicial do Datum (padrão 0) */
  datumOriginMm?: number;
}

export interface DimensionChainStepItem {
  index: number;
  nominalPartialMm: number;
  adjustedPartialMm: number;
  accumulatedRawMm: number;
  accumulatedFinalMm: number;
  correctionAppliedMm: number;
}

export interface DimensionChainEvaluation {
  partialsCount: number;
  sumPartialsMm: number;
  totalMeasuredMm: number | null;
  /** Diferença totalMeasuredMm - sumPartialsMm (ex.: 150.4 - 150.0 = +0.4 mm) */
  closureErrorMm: number;
  absClosureErrorMm: number;
  closureToleranceMm: number;
  hasClosureAlert: boolean;
  distributed: boolean;
  /** Acúmulo linear de incerteza de pior caso (± k * u) */
  worstCaseStackToleranceMm: number;
  /** Acúmulo estatístico RSS (± sqrt(k) * u) */
  rssStackToleranceMm: number;
  steps: DimensionChainStepItem[];
  infoStatus: RevEngInfoStatus;
  message: string;
}

export function evaluateDimensionChain(
  input: DimensionChainInput,
): DimensionChainEvaluation {
  const partials = input.partialsMm.filter((v) => Number.isFinite(v) && v > 0);
  if (partials.length === 0) {
    throw new Error("Informe pelo menos uma cota parcial positiva na cadeia.");
  }

  const origin = input.datumOriginMm ?? 0;
  const tol = Math.max(0.01, input.closureToleranceMm ?? 0.2);
  const u = Math.max(0.005, input.perStepUncertaintyMm ?? 0.05);
  const sumPartials = partials.reduce((acc, v) => acc + v, 0);

  const hasTotal =
    typeof input.totalMeasuredMm === "number" &&
    Number.isFinite(input.totalMeasuredMm) &&
    input.totalMeasuredMm > 0;

  const totalMeas = hasTotal ? input.totalMeasuredMm! : null;
  const closureError = totalMeas !== null ? totalMeas - sumPartials : 0;
  const absClosureError = Math.abs(closureError);
  const hasClosureAlert = totalMeas !== null && absClosureError > tol;
  const distribute = Boolean(input.distributeError && totalMeas !== null && sumPartials > 0);

  let accRaw = origin;
  let accFinal = origin;
  const steps: DimensionChainStepItem[] = partials.map((part, idx) => {
    const weight = part / sumPartials;
    const corr = distribute ? closureError * weight : 0;
    const adjPart = part + corr;
    accRaw += part;
    accFinal += adjPart;
    return {
      index: idx + 1,
      nominalPartialMm: Number(part.toFixed(4)),
      adjustedPartialMm: Number(adjPart.toFixed(4)),
      accumulatedRawMm: Number(accRaw.toFixed(4)),
      accumulatedFinalMm: Number(accFinal.toFixed(4)),
      correctionAppliedMm: Number(corr.toFixed(4)),
    };
  });

  const k = partials.length;
  const worstStack = Number((k * u).toFixed(4));
  const rssStack = Number((Math.sqrt(k) * u).toFixed(4));

  let message = `Soma parcial = ${sumPartials.toFixed(2)} mm (${k} cotas).`;
  if (totalMeas !== null) {
    message += ` Total medido = ${totalMeas.toFixed(2)} mm → Erro de fechamento = ${closureError >= 0 ? "+" : ""}${closureError.toFixed(2)} mm.`;
    if (distribute) {
      message += " Erro distribuído proporcionalmente (AJUSTADO).";
    } else if (hasClosureAlert) {
      message += ` Fora da tolerância (±${tol.toFixed(2)} mm) — distribuição aguarda confirmação explícita.`;
    }
  }

  return {
    partialsCount: k,
    sumPartialsMm: Number(sumPartials.toFixed(4)),
    totalMeasuredMm: totalMeas !== null ? Number(totalMeas.toFixed(4)) : null,
    closureErrorMm: Number(closureError.toFixed(4)),
    absClosureErrorMm: Number(absClosureError.toFixed(4)),
    closureToleranceMm: tol,
    hasClosureAlert,
    distributed: distribute,
    worstCaseStackToleranceMm: worstStack,
    rssStackToleranceMm: rssStack,
    steps,
    infoStatus: distribute ? "AJUSTADO" : "MEDIDO",
    message,
  };
}

/* ========================================================================== */
/* 5. CALCULADORA UNIVERSAL DE CORDA E FLECHA (TESTE T7)                      */
/* ========================================================================== */

export interface ChordSagittaInput {
  /** Comprimento da corda c (mm) */
  chordMm: number;
  /** Flecha / sagita f (mm) */
  sagittaMm: number;
  /** Incerteza opcional da medição da corda ±σ_c (mm) */
  chordUncertaintyMm?: number;
  /** Incerteza opcional da medição da flecha ±σ_f (mm) */
  sagittaUncertaintyMm?: number;
}

export interface ChordSagittaResult {
  valid: boolean;
  chordMm: number;
  sagittaMm: number;
  /** Raio calculado R = c²/(8f) + f/2 (mm) */
  radiusMm: number;
  /** Diâmetro equivalente Ø = 2R (mm) */
  diameterMm: number;
  /** Ângulo central do arco em graus */
  sweepAngleDeg: number;
  /** Comprimento desenvolvido do arco s = R * θ (mm) */
  arcLengthMm: number;
  /** Incerteza propagada no raio ±σ_R (mm) */
  radiusUncertaintyMm: number;
  /** Sensibilidade ∂R/∂f mostrando amplificação em arcos rasos */
  sensitivityDrDf: number;
  shallowWarning?: string;
  infoStatus: RevEngInfoStatus;
  formulaSummary: string;
}

export function computeRadiusFromChordSagitta(
  input: ChordSagittaInput,
): ChordSagittaResult {
  const c = Number(input.chordMm);
  const f = Number(input.sagittaMm);

  if (!Number.isFinite(c) || c <= 0) {
    throw new Error("A corda (c) deve ser maior que zero (c > 0 mm).");
  }
  if (!Number.isFinite(f) || f <= 0) {
    throw new Error("A flecha / sagita (f) deve ser estritamente maior que zero (f > 0 mm).");
  }

  // R = c² / (8f) + f / 2
  const R = (c * c) / (8 * f) + f / 2;
  const D = 2 * R;

  // Derivadas parciais para propagação de incerteza:
  // dR/dc = c / (4f)
  // dR/df = -c² / (8f²) + 1/2
  const dRdc = c / (4 * f);
  const dRdf = -(c * c) / (8 * f * f) + 0.5;

  const sigmaC = Math.max(0, input.chordUncertaintyMm ?? 0.05);
  const sigmaF = Math.max(0, input.sagittaUncertaintyMm ?? 0.05);
  const sigmaR = Math.sqrt(Math.pow(dRdc * sigmaC, 2) + Math.pow(dRdf * sigmaF, 2));

  // Ângulo central
  const halfChordRatio = Math.min(1, c / (2 * R));
  let sweepRad = 2 * Math.asin(halfChordRatio);
  if (f > R) {
    sweepRad = 2 * Math.PI - sweepRad;
  }
  const sweepDeg = (sweepRad * 180) / Math.PI;
  const arcLen = R * sweepRad;

  const shallowWarning =
    f / c < 0.04
      ? `Arco muito raso (f/c = ${(f / c).toFixed(3)}): cada ±0,05 mm na flecha altera o raio em ±${Math.abs(dRdf * 0.05).toFixed(2)} mm.`
      : undefined;

  return {
    valid: true,
    chordMm: Number(c.toFixed(4)),
    sagittaMm: Number(f.toFixed(4)),
    radiusMm: Number(R.toFixed(4)),
    diameterMm: Number(D.toFixed(4)),
    sweepAngleDeg: Number(sweepDeg.toFixed(3)),
    arcLengthMm: Number(arcLen.toFixed(4)),
    radiusUncertaintyMm: Number(sigmaR.toFixed(4)),
    sensitivityDrDf: Number(Math.abs(dRdf).toFixed(3)),
    shallowWarning,
    infoStatus: "CALCULADO",
    formulaSummary: `R = ${c.toFixed(2)}² / (8 × ${f.toFixed(3)}) + ${f.toFixed(3)}/2 = ${R.toFixed(2)} mm (±${sigmaR.toFixed(2)} mm)`,
  };
}

/* ========================================================================== */
/* 6. TABELA DE ORDENADAS / ESTAÇÕES (SEÇÃO 5)                                */
/* ========================================================================== */

export interface OrdinateStationInput {
  /** Origem da linha de base (mm) */
  origin: Vec2;
  /** Ângulo da linha de base em graus (0° = eixo X) */
  axisAngleDeg: number;
  /** Espaçamento constante entre estações Δs (mm) */
  stationSpacingMm: number;
  /** Afastamentos medidos (y_0, y_1, ..., y_n) em cada estação (mm) */
  offsetsMm: number[];
  /** Incerteza do instrumento (mm) */
  uncertaintyMm?: number;
}

export function generateOrdinateStationPoints(
  input: OrdinateStationInput,
): CapturedContourPoint[] {
  const spacing = Number(input.stationSpacingMm);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error("O espaçamento entre estações deve ser maior que zero.");
  }
  const rad = ((input.axisAngleDeg || 0) * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;
  const unc = Math.max(0.01, input.uncertaintyMm ?? 0.05);

  return input.offsetsMm.map((offset, idx) => {
    const s = idx * spacing;
    const x = input.origin.x + s * ux + offset * nx;
    const y = input.origin.y + s * uy + offset * ny;
    return {
      id: `ord-${uid()}-${idx}`,
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      source: "caliper_ordinate" as const,
      uncertaintyMm: unc,
    };
  });
}
