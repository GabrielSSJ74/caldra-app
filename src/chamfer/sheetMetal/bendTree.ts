/**
 * CALDRA CHAMFER — CHAPA METÁLICA INDUSTRIAL (BEND TREE), PLANIFICAÇÃO EXATA E DXF INSIDE-OUT (PILAR 6)
 *
 * - Regras de Chapa (Aço Carbono #18..1/4", Inox 304, Alumínio) sincronizadas com CHAPA 3.0MM.
 * - Matemática exata ABNT/ISO de desenvolvimento de dobra (θ em radianos):
 *     BA   = θ * (R + K * T)
 *     OSSB = tan(θ / 2) * (R + T)
 *     BD   = 2 * OSSB - BA
 *     L_flat = soma(medidas_externas) - BD
 * - Árvore de Flanges e Dobras (`RootFace -> BendZone -> ChildFlange`) suportando:
 *   Base Flange, Contour Flange (L/U/Z/Ômega), Edge Flange (-135°..+135°, snaps, parcial, meia-esquadria),
 *   Hem (180° fechada/aberta/gota), Fold/Unfold/Refold com projeção de furos (s, v) e Convert to Sheet Metal.
 * - Planificação (`Flat Pattern`) com entidades geométricas exatas (LINE, ARC, CIRCLE),
 *   Tabela de Dobras (CSV/JSON) e Exportação `.DXF` Laser-Ready (CypCut / HypCut) ordenando
 *   obrigatoriamente todos os contornos internos (`CUT`) ANTES do contorno externo (`OUTLINE`).
 */

export type CornerReliefType = "rectangular" | "round" | "tear";
export type FlangeBendPosition = "inside" | "outside" | "onLine";
export type HemStyle = "closed" | "open" | "teardrop";
export type BendDirection = "UP" | "DOWN";

export interface SheetMetalRule {
  id: string;
  name: string;
  material: "Aço Carbono" | "Inox 304" | "Alumínio";
  gaugeLabel: string;
  thicknessMm: number;
  innerRadiusMm: number;
  kFactor: number;
  cornerRelief: CornerReliefType;
  densityKgM3: number;
}

export const DEFAULT_SHEET_METAL_RULES: SheetMetalRule[] = [
  { id: "ac_18", name: "Aço Carbono #18 (1.2mm)", material: "Aço Carbono", gaugeLabel: "#18", thicknessMm: 1.2, innerRadiusMm: 1.2, kFactor: 0.33, cornerRelief: "round", densityKgM3: 7850 },
  { id: "ac_16", name: "Aço Carbono #16 (1.5mm)", material: "Aço Carbono", gaugeLabel: "#16", thicknessMm: 1.5, innerRadiusMm: 1.5, kFactor: 0.33, cornerRelief: "round", densityKgM3: 7850 },
  { id: "ac_14", name: "Aço Carbono #14 (2.0mm)", material: "Aço Carbono", gaugeLabel: "#14", thicknessMm: 2.0, innerRadiusMm: 2.0, kFactor: 0.40, cornerRelief: "round", densityKgM3: 7850 },
  { id: "ac_12", name: "Aço Carbono #12 (2.65mm)", material: "Aço Carbono", gaugeLabel: "#12", thicknessMm: 2.65, innerRadiusMm: 2.65, kFactor: 0.38, cornerRelief: "rectangular", densityKgM3: 7850 },
  { id: "ac_11", name: "Aço Carbono #11 (3.0mm)", material: "Aço Carbono", gaugeLabel: "#11", thicknessMm: 3.0, innerRadiusMm: 3.0, kFactor: 0.33, cornerRelief: "rectangular", densityKgM3: 7850 },
  { id: "ac_3_16", name: "Aço Carbono 3/16\" (4.75mm)", material: "Aço Carbono", gaugeLabel: "3/16\"", thicknessMm: 4.75, innerRadiusMm: 5.0, kFactor: 0.38, cornerRelief: "tear", densityKgM3: 7850 },
  { id: "ac_1_4", name: "Aço Carbono 1/4\" (6.35mm)", material: "Aço Carbono", gaugeLabel: "1/4\"", thicknessMm: 6.35, innerRadiusMm: 6.5, kFactor: 0.40, cornerRelief: "tear", densityKgM3: 7850 },
  { id: "inox_304", name: "Inox 304 (1.5mm)", material: "Inox 304", gaugeLabel: "#16", thicknessMm: 1.5, innerRadiusMm: 2.0, kFactor: 0.42, cornerRelief: "round", densityKgM3: 7930 },
  { id: "aluminio_2", name: "Alumínio 5052 (2.0mm)", material: "Alumínio", gaugeLabel: "2.0mm", thicknessMm: 2.0, innerRadiusMm: 2.0, kFactor: 0.36, cornerRelief: "round", densityKgM3: 2700 },
];

export const EDGE_FLANGE_ANGLE_SNAPS = [30, 45, 60, 90, 120, 135, -30, -45, -60, -90, -120, -135];

export interface BendMathResult {
  angleDeg: number;
  angleRad: number;
  thicknessMm: number;
  innerRadiusMm: number;
  kFactor: number;
  /** BA = theta * (R + K * T) */
  bendAllowanceMm: number;
  /** OSSB = tan(theta / 2) * (R + T) */
  outsideSetbackMm: number;
  /** BD = 2 * OSSB - BA */
  bendDeductionMm: number;
}

export function computeBendMath(
  angleDeg: number,
  thicknessMm: number,
  innerRadiusMm: number,
  kFactor: number,
): BendMathResult {
  const absDeg = Math.max(0.001, Math.min(180, Math.abs(angleDeg)));
  const angleRad = (absDeg * Math.PI) / 180;
  const T = Math.max(0.1, thicknessMm);
  const R = Math.max(0, innerRadiusMm);
  const K = Math.max(0, Math.min(1, kFactor));

  const bendAllowanceMm = angleRad * (R + K * T);
  const outsideSetbackMm = absDeg >= 179.999 ? R + T : Math.tan(angleRad / 2) * (R + T);
  const bendDeductionMm = 2 * outsideSetbackMm - bendAllowanceMm;

  return {
    angleDeg: absDeg,
    angleRad,
    thicknessMm: T,
    innerRadiusMm: R,
    kFactor: K,
    bendAllowanceMm,
    outsideSetbackMm,
    bendDeductionMm,
  };
}

export function computeFlatLengthFromExternals(
  externalLegsMm: number[],
  bends: Array<{ angleDeg: number; thicknessMm: number; innerRadiusMm: number; kFactor: number }>,
): {
  totalExternalMm: number;
  totalBendDeductionMm: number;
  totalBendAllowanceMm: number;
  flatLengthMm: number;
  bendResults: BendMathResult[];
} {
  const totalExternalMm = externalLegsMm.reduce((s, v) => s + v, 0);
  const bendResults = bends.map((b) =>
    computeBendMath(b.angleDeg, b.thicknessMm, b.innerRadiusMm, b.kFactor),
  );
  const totalBendDeductionMm = bendResults.reduce((s, r) => s + r.bendDeductionMm, 0);
  const totalBendAllowanceMm = bendResults.reduce((s, r) => s + r.bendAllowanceMm, 0);
  const flatLengthMm = totalExternalMm - totalBendDeductionMm;

  return {
    totalExternalMm,
    totalBendDeductionMm,
    totalBendAllowanceMm,
    flatLengthMm,
    bendResults,
  };
}

export interface SheetHole2D {
  id: string;
  /** Coordenada local sobre o flange (ou (s, v) durante Unfold) */
  x: number;
  y: number;
  diameterMm: number;
  /** Se o furo atravessa zona de dobra, armazena coordenadas de comprimento de arco (s, v) */
  bendArcMapping?: { bendId: string; sMm: number; vMm: number };
}

export interface SheetFlangeNode {
  id: string;
  name: string;
  /** Dimensões da aba: largura ao longo da linha de dobra e comprimento externo */
  widthMm: number;
  externalLengthMm: number;
  /** Furos pertencentes a esta aba */
  holes: SheetHole2D[];
  /** Dobras filhas conectadas a arestas desta aba */
  children: SheetBendEdge[];
  /** Se é resultado de Bainha (Hem) */
  hemStyle?: HemStyle;
}

export interface SheetBendEdge {
  id: string;
  parentEdge: "top" | "bottom" | "left" | "right";
  angleDeg: number;
  direction: BendDirection;
  innerRadiusMm: number;
  kFactor: number;
  bendPosition: FlangeBendPosition;
  /** Se a dobra está temporariamente desdobrada (Unfold) */
  unfolded: boolean;
  /** Flange parcial (offset a partir do início da aresta e largura) */
  partialOffsetMm?: number;
  partialWidthMm?: number;
  /** Meia-esquadria automática nos cantos (ângulo em graus) */
  cornerMiterDeg?: number;
  child: SheetFlangeNode;
}

export interface SheetMetalPart {
  id: string;
  name: string;
  rule: SheetMetalRule;
  root: SheetFlangeNode;
  etchTexts: Array<{ text: string; x: number; y: number; heightMm: number }>;
}

export interface BendTableRow {
  order: number;
  bendId: string;
  direction: BendDirection;
  angleDeg: number;
  innerRadiusMm: number;
  bendLineLengthMm: number;
  bendAllowanceMm: number;
  bendDeductionMm: number;
  outsideSetbackMm: number;
}

export type ExactDxfEntity =
  | {
      type: "LINE";
      layer: "CUT" | "OUTLINE" | "BEND_UP" | "BEND_DOWN" | "ETCH";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      type: "CIRCLE";
      layer: "CUT" | "OUTLINE" | "ETCH";
      cx: number;
      cy: number;
      radius: number;
    }
  | {
      type: "ARC";
      layer: "CUT" | "OUTLINE" | "ETCH";
      cx: number;
      cy: number;
      radius: number;
      startAngleDeg: number;
      endAngleDeg: number;
    };

export interface FlatPatternResult {
  partId: string;
  rule: SheetMetalRule;
  flatWidthMm: number;
  flatHeightMm: number;
  /** Comprimento planificado principal (ex.: ao longo do eixo de dobra de perfil L/U/Z) */
  developedLengthMm: number;
  /** Contornos internos (furos/rasgos) — camada CUT */
  cutEntities: ExactDxfEntity[];
  /** Contorno externo — camada OUTLINE */
  outlineEntities: ExactDxfEntity[];
  /** Linhas de dobra — camadas BEND_UP / BEND_DOWN */
  bendLines: ExactDxfEntity[];
  /** Gravação a laser — camada ETCH */
  etchEntities: ExactDxfEntity[];
  bendTable: BendTableRow[];
  /** Lista final ordenada de dentro para fora (CUT -> OUTLINE -> BEND_UP -> BEND_DOWN -> ETCH) */
  orderedEntities: ExactDxfEntity[];
}

/**
 * 1) Base Flange: cria peça de chapa a partir de dimensões base e furos internos.
 */
export function createBaseFlange(params: {
  id?: string;
  name?: string;
  widthMm: number;
  lengthMm: number;
  rule: SheetMetalRule;
  holes?: SheetHole2D[];
}): SheetMetalPart {
  return {
    id: params.id ?? `sm_${Date.now()}`,
    name: params.name ?? "Chapa Base",
    rule: { ...params.rule },
    root: {
      id: "flange_root",
      name: "Base Flange",
      widthMm: Math.max(1, params.widthMm),
      externalLengthMm: Math.max(1, params.lengthMm),
      holes: (params.holes ?? []).map((h) => ({ ...h })),
      children: [],
    },
    etchTexts: [],
  };
}

/**
 * 2) Contour Flange (Especial Caldeiraria — L, U, Z, Ômega):
 * Recebe comprimentos externos das pernas e ângulos de dobra (+UP / -DOWN), gerando a árvore completa
 * já com raios internos R e externos R+T da regra ativa.
 */
export function createContourFlange(params: {
  name?: string;
  extrudeWidthMm: number;
  externalLegsMm: number[];
  bendAnglesDeg: number[];
  rule: SheetMetalRule;
  holesOnRoot?: SheetHole2D[];
}): SheetMetalPart {
  const legs = params.externalLegsMm.length > 0 ? params.externalLegsMm : [50, 50];
  const part = createBaseFlange({
    name: params.name ?? "Contour Flange",
    widthMm: params.extrudeWidthMm,
    lengthMm: legs[0]!,
    rule: params.rule,
    holes: params.holesOnRoot,
  });

  let currentNode = part.root;
  for (let i = 1; i < legs.length; i++) {
    const rawAngle = params.bendAnglesDeg[i - 1] ?? 90;
    const direction: BendDirection = rawAngle >= 0 ? "UP" : "DOWN";
    const child: SheetFlangeNode = {
      id: `flange_leg_${i}`,
      name: `Aba ${i}`,
      widthMm: params.extrudeWidthMm,
      externalLengthMm: Math.max(1, legs[i]!),
      holes: [],
      children: [],
    };
    currentNode.children.push({
      id: `bend_${i}`,
      parentEdge: "right",
      angleDeg: Math.abs(rawAngle),
      direction,
      innerRadiusMm: params.rule.innerRadiusMm,
      kFactor: params.rule.kFactor,
      bendPosition: "outside",
      unfolded: false,
      child,
    });
    currentNode = child;
  }

  return part;
}

/**
 * 3) Edge Flange: adiciona aba dobrada em uma aresta existente com ângulo (-135°..+135°),
 * flange parcial, posição da dobra e meia-esquadria automática quando duas abas adjacentes se encontram.
 */
export function addEdgeFlange(
  part: SheetMetalPart,
  params: {
    parentFlangeId?: string;
    edge: "top" | "bottom" | "left" | "right";
    externalLengthMm: number;
    angleDeg: number;
    bendPosition?: FlangeBendPosition;
    partialOffsetMm?: number;
    partialWidthMm?: number;
    snapAngle?: boolean;
  },
): SheetMetalPart {
  const next = structuredClone(part);
  const target = findFlange(next.root, params.parentFlangeId ?? next.root.id) ?? next.root;

  let ang = Math.max(-135, Math.min(135, params.angleDeg));
  if (params.snapAngle) {
    let best = ang;
    let bestDist = 4;
    for (const s of EDGE_FLANGE_ANGLE_SNAPS) {
      if (Math.abs(ang - s) < bestDist) {
        bestDist = Math.abs(ang - s);
        best = s;
      }
    }
    ang = best;
  }

  const direction: BendDirection = ang >= 0 ? "UP" : "DOWN";
  const edgeSpan =
    params.edge === "left" || params.edge === "right" ? target.widthMm : target.externalLengthMm;
  const widthMm = params.partialWidthMm ? Math.min(edgeSpan, Math.max(1, params.partialWidthMm)) : edgeSpan;

  // Meia-esquadria automática nos cantos se houver aba em aresta adjacente na mesma direção
  const adjacentEdges: Record<string, string[]> = {
    top: ["left", "right"],
    bottom: ["left", "right"],
    left: ["top", "bottom"],
    right: ["top", "bottom"],
  };
  let cornerMiterDeg: number | undefined;
  for (const existing of target.children) {
    if (adjacentEdges[params.edge]?.includes(existing.parentEdge) && existing.direction === direction) {
      cornerMiterDeg = 45;
      existing.cornerMiterDeg = 45;
    }
  }

  const bendIndex = countBends(next.root) + 1;
  target.children.push({
    id: `bend_${bendIndex}`,
    parentEdge: params.edge,
    angleDeg: Math.abs(ang),
    direction,
    innerRadiusMm: next.rule.innerRadiusMm,
    kFactor: next.rule.kFactor,
    bendPosition: params.bendPosition ?? "outside",
    unfolded: false,
    partialOffsetMm: params.partialOffsetMm,
    partialWidthMm: params.partialWidthMm,
    cornerMiterDeg,
    child: {
      id: `flange_${bendIndex}`,
      name: `Edge Flange ${bendIndex}`,
      widthMm,
      externalLengthMm: Math.max(1, params.externalLengthMm),
      holes: [],
      children: [],
    },
  });

  return next;
}

/**
 * 4) Hem (Bainha 180° — fechada, aberta ou gota) em 1 toque.
 */
export function addHem(
  part: SheetMetalPart,
  params: {
    parentFlangeId?: string;
    edge: "top" | "bottom" | "left" | "right";
    hemLengthMm: number;
    style: HemStyle;
    gapMm?: number;
  },
): SheetMetalPart {
  const next = structuredClone(part);
  const target = findFlange(next.root, params.parentFlangeId ?? next.root.id) ?? next.root;
  const bendIndex = countBends(next.root) + 1;
  const innerR =
    params.style === "closed"
      ? Math.max(0.2, next.rule.thicknessMm * 0.25)
      : params.style === "open"
        ? Math.max(0.5, (params.gapMm ?? next.rule.thicknessMm) * 0.5)
        : Math.max(next.rule.innerRadiusMm, next.rule.thicknessMm);

  const edgeSpan =
    params.edge === "left" || params.edge === "right" ? target.widthMm : target.externalLengthMm;

  target.children.push({
    id: `hem_${bendIndex}`,
    parentEdge: params.edge,
    angleDeg: params.style === "teardrop" ? 180 : 180,
    direction: "UP",
    innerRadiusMm: innerR,
    kFactor: next.rule.kFactor,
    bendPosition: "outside",
    unfolded: false,
    child: {
      id: `flange_hem_${bendIndex}`,
      name: `Bainha (${params.style})`,
      widthMm: edgeSpan,
      externalLengthMm: Math.max(2, params.hemLengthMm),
      holes: [],
      children: [],
      hemStyle: params.style,
    },
  });
  return next;
}

/**
 * 5) Unfold / Refold + mapeamento (s, v) de furos que cruzam zonas de dobra.
 */
export function setBendsUnfolded(
  part: SheetMetalPart,
  unfolded: boolean,
  bendIds?: string[],
): SheetMetalPart {
  const next = structuredClone(part);
  const filter = bendIds ? new Set(bendIds) : null;
  const walk = (node: SheetFlangeNode) => {
    for (const b of node.children) {
      if (!filter || filter.has(b.id)) {
        b.unfolded = unfolded;
      }
      walk(b.child);
    }
  };
  walk(next.root);
  return next;
}

/**
 * Aplica um furo no estado desdobrado (Unfold) mapeando sua coordenada (s, v) sobre a zona de dobra
 * para preservar a deformação correta ao redobrar (Refold).
 */
export function addHoleAcrossBend(
  part: SheetMetalPart,
  bendId: string,
  sMm: number,
  vMm: number,
  diameterMm: number,
): SheetMetalPart {
  const next = structuredClone(part);
  next.root.holes.push({
    id: `hole_bend_${Date.now()}_${next.root.holes.length + 1}`,
    x: sMm,
    y: vMm,
    diameterMm: Math.max(0.5, diameterMm),
    bendArcMapping: { bendId, sMm, vMm },
  });
  return next;
}

/**
 * 6) Convert to Sheet Metal: converte bloco prismático ou Shell uniforme em peça dobrável.
 */
export function convertSolidToSheetMetal(params: {
  name: string;
  lengthMm: number;
  widthMm: number;
  wallThicknessMm: number;
  flangeHeightMm?: number;
  rule?: SheetMetalRule;
}): SheetMetalPart {
  const rule: SheetMetalRule = params.rule
    ? { ...params.rule, thicknessMm: params.wallThicknessMm }
    : {
        ...DEFAULT_SHEET_METAL_RULES[4]!,
        id: "converted_custom",
        name: `Convertida (${params.wallThicknessMm}mm)`,
        thicknessMm: Math.max(0.5, params.wallThicknessMm),
        innerRadiusMm: Math.max(0.5, params.wallThicknessMm),
      };

  let part = createBaseFlange({
    name: params.name,
    lengthMm: params.lengthMm,
    widthMm: params.widthMm,
    rule,
  });

  if (params.flangeHeightMm && params.flangeHeightMm > rule.thicknessMm) {
    part = addEdgeFlange(part, {
      edge: "right",
      externalLengthMm: params.flangeHeightMm,
      angleDeg: 90,
    });
  }
  return part;
}

/**
 * Planificação Exata (`Flat Pattern`) percorrendo a Árvore de Dobras:
 * Calcula BA, OSSB, BD exatos, posiciona linhas BEND_UP / BEND_DOWN, furos internos (CUT)
 * e contorno externo exato (OUTLINE) composto por LINE e ARC (alívio de canto redondo quando aplicável).
 */
export function computeFlatPattern(part: SheetMetalPart): FlatPatternResult {
  const cutEntities: ExactDxfEntity[] = [];
  const outlineEntities: ExactDxfEntity[] = [];
  const bendLines: ExactDxfEntity[] = [];
  const etchEntities: ExactDxfEntity[] = [];
  const bendTable: BendTableRow[] = [];

  const T = part.rule.thicknessMm;
  const rootW = part.root.widthMm;

  // Caso linear/cadeia de abas (ex.: Contour Flange L/U/Z/Ômega ou Base + Edge Flanges no eixo X)
  // Percorre a cadeia principal ao longo de X (extensão) e Y (largura)
  let xCursor = 0;
  let totalFlatX = 0;
  let order = 1;

  const processNodeLinear = (
    node: SheetFlangeNode,
    incomingSetbackMm: number,
    yOrigin: number,
  ) => {
    const outgoingBendsRight = node.children.filter((b) => b.parentEdge === "right");
    const rightBend = outgoingBendsRight[0];
    const rightMath = rightBend
      ? computeBendMath(rightBend.angleDeg, T, rightBend.innerRadiusMm, rightBend.kFactor)
      : null;

    const flatFlatLeg = Math.max(
      0,
      node.externalLengthMm - incomingSetbackMm - (rightMath ? rightMath.outsideSetbackMm : 0),
    );

    const xStart = xCursor;
    const xEnd = xStart + flatFlatLeg;

    // Furos internos da aba (sempre camada CUT)
    for (const hole of node.holes) {
      cutEntities.push({
        type: "CIRCLE",
        layer: "CUT",
        cx: xStart + hole.x,
        cy: yOrigin + hole.y,
        radius: hole.diameterMm / 2,
      });
    }

    xCursor = xEnd;

    if (rightBend && rightMath) {
      const ba = rightMath.bendAllowanceMm;
      const bendCenterX = xCursor + ba / 2;
      const lineLayer = rightBend.direction === "UP" ? "BEND_UP" : "BEND_DOWN";
      const spanStart = yOrigin + (rightBend.partialOffsetMm ?? 0);
      const spanLen = rightBend.child.widthMm;

      bendLines.push({
        type: "LINE",
        layer: lineLayer,
        x1: bendCenterX,
        y1: spanStart,
        x2: bendCenterX,
        y2: spanStart + spanLen,
      });

      bendTable.push({
        order: order++,
        bendId: rightBend.id,
        direction: rightBend.direction,
        angleDeg: rightMath.angleDeg,
        innerRadiusMm: rightMath.innerRadiusMm,
        bendLineLengthMm: Number(spanLen.toFixed(4)),
        bendAllowanceMm: Number(rightMath.bendAllowanceMm.toFixed(4)),
        bendDeductionMm: Number(rightMath.bendDeductionMm.toFixed(4)),
        outsideSetbackMm: Number(rightMath.outsideSetbackMm.toFixed(4)),
      });

      xCursor += ba;
      processNodeLinear(rightBend.child, rightMath.outsideSetbackMm, spanStart);
    }
  };

  processNodeLinear(part.root, 0, 0);
  totalFlatX = xCursor;

  // Abas extras em top/bottom/left geram linhas de dobra e extensão correspondente
  let minY = 0;
  let maxY = rootW;
  let minX = 0;
  let maxX = totalFlatX;

  for (const b of part.root.children) {
    if (b.parentEdge === "right") continue;
    const bm = computeBendMath(b.angleDeg, T, b.innerRadiusMm, b.kFactor);
    const legFlat = Math.max(0, b.child.externalLengthMm - bm.outsideSetbackMm) + bm.bendAllowanceMm;
    const lineLayer = b.direction === "UP" ? "BEND_UP" : "BEND_DOWN";

    if (b.parentEdge === "top") {
      const yLine = rootW - bm.outsideSetbackMm + bm.bendAllowanceMm / 2;
      bendLines.push({ type: "LINE", layer: lineLayer, x1: 0, y1: yLine, x2: part.root.externalLengthMm, y2: yLine });
      maxY = Math.max(maxY, rootW - bm.outsideSetbackMm + legFlat);
    } else if (b.parentEdge === "bottom") {
      const yLine = bm.outsideSetbackMm - bm.bendAllowanceMm / 2;
      bendLines.push({ type: "LINE", layer: lineLayer, x1: 0, y1: yLine, x2: part.root.externalLengthMm, y2: yLine });
      minY = Math.min(minY, -(legFlat - bm.outsideSetbackMm));
    } else if (b.parentEdge === "left") {
      const xLine = bm.outsideSetbackMm - bm.bendAllowanceMm / 2;
      bendLines.push({ type: "LINE", layer: lineLayer, x1: xLine, y1: 0, x2: xLine, y2: rootW });
      minX = Math.min(minX, -(legFlat - bm.outsideSetbackMm));
    }

    bendTable.push({
      order: order++,
      bendId: b.id,
      direction: b.direction,
      angleDeg: bm.angleDeg,
      innerRadiusMm: bm.innerRadiusMm,
      bendLineLengthMm: Number(b.child.widthMm.toFixed(4)),
      bendAllowanceMm: Number(bm.bendAllowanceMm.toFixed(4)),
      bendDeductionMm: Number(bm.bendDeductionMm.toFixed(4)),
      outsideSetbackMm: Number(bm.outsideSetbackMm.toFixed(4)),
    });
  }

  // Contorno externo exato (LINE + ARC nos alívios de canto quando `cornerRelief === 'round'`)
  const rCorner =
    part.rule.cornerRelief === "round" && bendTable.length > 0
      ? Math.min(part.rule.thicknessMm * 0.5, (maxX - minX) * 0.1, (maxY - minY) * 0.1)
      : 0;

  if (rCorner > 0.05) {
    outlineEntities.push(
      { type: "LINE", layer: "OUTLINE", x1: minX + rCorner, y1: minY, x2: maxX - rCorner, y2: minY },
      { type: "ARC", layer: "OUTLINE", cx: maxX - rCorner, cy: minY + rCorner, radius: rCorner, startAngleDeg: 270, endAngleDeg: 360 },
      { type: "LINE", layer: "OUTLINE", x1: maxX, y1: minY + rCorner, x2: maxX, y2: maxY - rCorner },
      { type: "ARC", layer: "OUTLINE", cx: maxX - rCorner, cy: maxY - rCorner, radius: rCorner, startAngleDeg: 0, endAngleDeg: 90 },
      { type: "LINE", layer: "OUTLINE", x1: maxX - rCorner, y1: maxY, x2: minX + rCorner, y2: maxY },
      { type: "ARC", layer: "OUTLINE", cx: minX + rCorner, cy: maxY - rCorner, radius: rCorner, startAngleDeg: 90, endAngleDeg: 180 },
      { type: "LINE", layer: "OUTLINE", x1: minX, y1: maxY - rCorner, x2: minX, y2: minY + rCorner },
      { type: "ARC", layer: "OUTLINE", cx: minX + rCorner, cy: minY + rCorner, radius: rCorner, startAngleDeg: 180, endAngleDeg: 270 },
    );
  } else {
    outlineEntities.push(
      { type: "LINE", layer: "OUTLINE", x1: minX, y1: minY, x2: maxX, y2: minY },
      { type: "LINE", layer: "OUTLINE", x1: maxX, y1: minY, x2: maxX, y2: maxY },
      { type: "LINE", layer: "OUTLINE", x1: maxX, y1: maxY, x2: minX, y2: maxY },
      { type: "LINE", layer: "OUTLINE", x1: minX, y1: maxY, x2: minX, y2: minY },
    );
  }

  // Etch marks (gravação a laser)
  for (const t of part.etchTexts) {
    etchEntities.push({
      type: "LINE",
      layer: "ETCH",
      x1: t.x,
      y1: t.y,
      x2: t.x + Math.max(4, t.text.length * t.heightMm * 0.6),
      y2: t.y,
    });
  }

  // ORDEM OBRIGATÓRIA INSIDE-OUT: CUT estritamente ANTES de OUTLINE!
  const orderedEntities: ExactDxfEntity[] = [
    ...cutEntities,
    ...outlineEntities,
    ...bendLines,
    ...etchEntities,
  ];

  return {
    partId: part.id,
    rule: part.rule,
    flatWidthMm: Number((maxX - minX).toFixed(4)),
    flatHeightMm: Number((maxY - minY).toFixed(4)),
    developedLengthMm: Number((maxX - minX).toFixed(4)),
    cutEntities,
    outlineEntities,
    bendLines,
    etchEntities,
    bendTable,
    orderedEntities,
  };
}

/**
 * Exportação Tabela de Dobras (CSV e JSON).
 */
export function exportBendTableCsv(rows: BendTableRow[]): string {
  const header = "Ordem,ID_Dobra,Direcao,Angulo_deg,Raio_Interno_mm,Comprimento_Linha_mm,BA_mm,BD_mm,OSSB_mm";
  const lines = rows.map(
    (r) =>
      `${r.order},${r.bendId},${r.direction},${r.angleDeg.toFixed(2)},${r.innerRadiusMm.toFixed(2)},${r.bendLineLengthMm.toFixed(2)},${r.bendAllowanceMm.toFixed(4)},${r.bendDeductionMm.toFixed(4)},${r.outsideSetbackMm.toFixed(4)}`,
  );
  return [header, ...lines].join("\n");
}

/**
 * Exportação `.DXF` Laser-Ready (CypCut / HypCut) Inside-Out:
 * - Emite obrigatoriamente TODAS as entidades da camada `CUT` ANTES de `OUTLINE`.
 * - Usa exclusivamente primitivas geométricas exatas (`LINE`, `ARC`, `CIRCLE`).
 * - Separa camadas `CUT`, `OUTLINE`, `BEND_UP` (vermelho = 1), `BEND_DOWN` (azul = 5), `ETCH` (amarelo = 2).
 */
export function exportLaserInsideOutDxf(flat: FlatPatternResult): string {
  const out: string[] = [];
  const push = (code: number, value: string | number) => {
    out.push(String(code), String(value));
  };

  push(0, "SECTION");
  push(2, "HEADER");
  push(9, "$INSUNITS");
  push(70, 4); // Milímetros
  push(0, "ENDSEC");

  // Tabela de camadas padronizada laser industrial
  push(0, "SECTION");
  push(2, "TABLES");
  push(0, "TABLE");
  push(2, "LAYER");
  push(70, 5);

  const layers: Array<{ name: string; color: number; ltype: string }> = [
    { name: "CUT", color: 3, ltype: "CONTINUOUS" }, // Verde (cortes internos)
    { name: "OUTLINE", color: 7, ltype: "CONTINUOUS" }, // Branco (contorno externo)
    { name: "BEND_UP", color: 1, ltype: "DASHED" }, // Vermelho (dobra para cima)
    { name: "BEND_DOWN", color: 5, ltype: "DASHED" }, // Azul (dobra para baixo)
    { name: "ETCH", color: 2, ltype: "CONTINUOUS" }, // Amarelo (gravação)
  ];

  for (const l of layers) {
    push(0, "LAYER");
    push(2, l.name);
    push(70, 0);
    push(62, l.color);
    push(6, l.ltype);
  }

  push(0, "ENDTAB");
  push(0, "ENDSEC");

  // Entidades em ordem estrita Inside-Out
  push(0, "SECTION");
  push(2, "ENTITIES");

  const emitEntity = (e: ExactDxfEntity) => {
    if (e.type === "LINE") {
      push(0, "LINE");
      push(8, e.layer);
      push(10, e.x1.toFixed(6));
      push(20, e.y1.toFixed(6));
      push(30, "0.0");
      push(11, e.x2.toFixed(6));
      push(21, e.y2.toFixed(6));
      push(31, "0.0");
    } else if (e.type === "CIRCLE") {
      push(0, "CIRCLE");
      push(8, e.layer);
      push(10, e.cx.toFixed(6));
      push(20, e.cy.toFixed(6));
      push(30, "0.0");
      push(40, e.radius.toFixed(6));
    } else if (e.type === "ARC") {
      push(0, "ARC");
      push(8, e.layer);
      push(10, e.cx.toFixed(6));
      push(20, e.cy.toFixed(6));
      push(30, "0.0");
      push(40, e.radius.toFixed(6));
      push(50, e.startAngleDeg.toFixed(6));
      push(51, e.endAngleDeg.toFixed(6));
    }
  };

  // 1º CUT (furos/rasgos internos)
  for (const e of flat.cutEntities) emitEntity(e);
  // 2º OUTLINE (contorno externo)
  for (const e of flat.outlineEntities) emitEntity(e);
  // 3º BEND_UP / BEND_DOWN
  for (const e of flat.bendLines) emitEntity(e);
  // 4º ETCH
  for (const e of flat.etchEntities) emitEntity(e);

  push(0, "ENDSEC");
  push(0, "EOF");

  return out.join("\n");
}

function findFlange(node: SheetFlangeNode, id: string): SheetFlangeNode | null {
  if (node.id === id) return node;
  for (const b of node.children) {
    const found = findFlange(b.child, id);
    if (found) return found;
  }
  return null;
}

function countBends(node: SheetFlangeNode): number {
  let c = node.children.length;
  for (const b of node.children) c += countBends(b.child);
  return c;
}
