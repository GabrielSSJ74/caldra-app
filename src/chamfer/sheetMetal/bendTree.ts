/**
 * CALDRA CHAMFER — ARQUITETURA "BEND TREE" PARA CHAPA METÁLICA INDUSTRIAL
 *
 * Separa 100% a Topologia Lógica da Chapa (`SheetMetalBody` + `BendTree`) da Malha Visual Three.js:
 *  - Contrato paramétrico serializável em JSON e versionado (`SheetMetalRule`, `BendNode`, `FlangeNode`, `SheetMetalBody`).
 *  - Persistência imutável de `targetAngleDeg` durante `Desdobrar (Unfold)` para garantir `Redobrar (Refold)` exato.
 *  - Operações completas: `Dobrar (Fold)`, `Desdobrar (Unfold)`, `Redobrar (Refold)`, `Trocar Face Fixa`,
 *    `Edge Flange`, `Contour Flange`, `Hem (180°)`, `Furar/Cortar` (inclusive cruzando zonas de dobra) e `Flat Pattern` + `.DXF` Inside-Out.
 *  - Mantém 100% de retrocompatibilidade com a API `SheetMetalPart` usada nos testes do oráculo existentes.
 */

import {
  computeBendDevelopment,
  validateBendInputs,
  type Vec2Tuple,
  type Vec3Tuple,
} from "./bendMath";

export type CornerReliefType = "rectangular" | "round" | "tear";
export type SheetMetalReliefType = "RECTANGULAR" | "ROUND" | "TEAR";
export type FlangeBendPosition = "inside" | "outside" | "onLine";
export type BendPositionMode = "CENTERLINE" | "MATERIAL_INSIDE" | "MATERIAL_OUTSIDE";
export type HemStyle = "closed" | "open" | "teardrop";
export type BendDirection = "UP" | "DOWN";
export type BendState = "FOLDED" | "UNFOLDED";

export interface SheetMetalRule {
  id: string;
  name: string;
  thicknessMm: number;      // T
  innerRadiusMm: number;    // R
  kFactor: number;          // K (ex.: 0.33 a 0.44)
  reliefType: SheetMetalReliefType;
  reliefWidthMm: number;
  reliefDepthMm: number;
  // Campos auxiliares industriais (retrocompatíveis)
  material: "Aço Carbono" | "Inox 304" | "Alumínio";
  gaugeLabel: string;
  cornerRelief: CornerReliefType;
  densityKgM3: number;
}

export interface BendNode {
  bendId: string;           // ID topológico persistente (ex.: "bend_01")
  parentFlangeId: string;   // Flange pai (lado fixo relativo)
  childFlangeId: string;    // Flange filho (lado que rotaciona)
  axisOriginLocal: Vec3Tuple; // Ponto no eixo da dobra (no referencial do pai)
  axisDirLocal: Vec3Tuple;    // Vetor unitário da linha de dobra (regra da mão direita)
  targetAngleDeg: number;   // Ângulo nominal real da dobra em graus (NUNCA apagado ao desdobrar!)
  angleExpression?: string; // Expressão opcional vinculada ao ParameterStore (ex.: "ang_dobra")
  direction: BendDirection; // Sentido da dobra em relação à normal da face fixa
  innerRadiusMm: number;    // R (herda da regra ou override por dobra)
  kFactor: number;          // K (herda da regra ou override por dobra)
  bendPosition: BendPositionMode;
  state: BendState;         // Estado atual da dobra (permite desdobrar só 1 dobra ou todas!)
  bendAllowanceMm: number;  // BA = thetaRad * (R + K * T)
  outsideSetbackMm: number; // OSSB = tan(thetaRad / 2) * (R + T)
  bendDeductionMm: number;  // BD = 2 * OSSB - BA
  /** Metadado opcional de aresta pai para Edge/Contour Flange e Tabela de Dobras */
  parentEdge?: "top" | "bottom" | "left" | "right" | "custom";
  bendLineLengthMm?: number;
  externalLegLengthMm?: number;
}

export interface FlangeNode {
  flangeId: string;
  name?: string;
  contour2D: Array<Vec2Tuple>; // Polígono plano no referencial local da flange
  holes2D: Array<{ id: string; contour: Array<Vec2Tuple>; cx?: number; cy?: number; diameterMm?: number }>;
  isFixedRoot: boolean;
  /** Comprimento externo nominal (para cálculo exato L_flat = soma(medidas_externas) - BD) */
  externalLengthMm?: number;
  widthMm?: number;
}

export interface CrossBendCutout {
  cutoutId: string;
  flatContour2D: Array<Vec2Tuple>;
  cx?: number;
  cy?: number;
  diameterMm?: number;
}

export interface SheetMetalBody {
  bodyId: string;
  schemaVersion: number;
  name?: string;
  rule: SheetMetalRule;
  rootFlangeId: string;
  flanges: Record<string, FlangeNode>;
  bends: Record<string, BendNode>;
  crossBendCutouts: CrossBendCutout[];
  etchTexts?: Array<{ text: string; x: number; y: number; heightMm: number }>;
}

export const SHEET_METAL_SCHEMA_VERSION = 2;

export const DEFAULT_SHEET_METAL_RULES: SheetMetalRule[] = [
  { id: "ac_18", name: "Aço Carbono #18 (1.2mm)", material: "Aço Carbono", gaugeLabel: "#18", thicknessMm: 1.2, innerRadiusMm: 1.2, kFactor: 0.33, reliefType: "ROUND", reliefWidthMm: 1.2, reliefDepthMm: 2.4, cornerRelief: "round", densityKgM3: 7850 },
  { id: "ac_16", name: "Aço Carbono #16 (1.5mm)", material: "Aço Carbono", gaugeLabel: "#16", thicknessMm: 1.5, innerRadiusMm: 1.5, kFactor: 0.33, reliefType: "ROUND", reliefWidthMm: 1.5, reliefDepthMm: 3.0, cornerRelief: "round", densityKgM3: 7850 },
  { id: "ac_14", name: "Aço Carbono #14 (2.0mm)", material: "Aço Carbono", gaugeLabel: "#14", thicknessMm: 2.0, innerRadiusMm: 2.0, kFactor: 0.40, reliefType: "ROUND", reliefWidthMm: 2.0, reliefDepthMm: 4.0, cornerRelief: "round", densityKgM3: 7850 },
  { id: "ac_12", name: "Aço Carbono #12 (2.65mm)", material: "Aço Carbono", gaugeLabel: "#12", thicknessMm: 2.65, innerRadiusMm: 2.65, kFactor: 0.38, reliefType: "RECTANGULAR", reliefWidthMm: 2.65, reliefDepthMm: 5.3, cornerRelief: "rectangular", densityKgM3: 7850 },
  { id: "ac_11", name: "Aço Carbono #11 (3.0mm)", material: "Aço Carbono", gaugeLabel: "#11", thicknessMm: 3.0, innerRadiusMm: 3.0, kFactor: 0.33, reliefType: "RECTANGULAR", reliefWidthMm: 3.0, reliefDepthMm: 6.0, cornerRelief: "rectangular", densityKgM3: 7850 },
  { id: "ac_3_16", name: "Aço Carbono 3/16\" (4.75mm)", material: "Aço Carbono", gaugeLabel: "3/16\"", thicknessMm: 4.75, innerRadiusMm: 5.0, kFactor: 0.38, reliefType: "TEAR", reliefWidthMm: 4.75, reliefDepthMm: 9.5, cornerRelief: "tear", densityKgM3: 7850 },
  { id: "ac_1_4", name: "Aço Carbono 1/4\" (6.35mm)", material: "Aço Carbono", gaugeLabel: "1/4\"", thicknessMm: 6.35, innerRadiusMm: 6.5, kFactor: 0.40, reliefType: "TEAR", reliefWidthMm: 6.35, reliefDepthMm: 12.7, cornerRelief: "tear", densityKgM3: 7850 },
  { id: "inox_304", name: "Inox 304 (1.5mm)", material: "Inox 304", gaugeLabel: "#16", thicknessMm: 1.5, innerRadiusMm: 2.0, kFactor: 0.42, reliefType: "ROUND", reliefWidthMm: 1.5, reliefDepthMm: 3.0, cornerRelief: "round", densityKgM3: 7930 },
  { id: "aluminio_2", name: "Alumínio 5052 (2.0mm)", material: "Alumínio", gaugeLabel: "2.0mm", thicknessMm: 2.0, innerRadiusMm: 2.0, kFactor: 0.36, reliefType: "ROUND", reliefWidthMm: 2.0, reliefDepthMm: 4.0, cornerRelief: "round", densityKgM3: 2700 },
];

export const EDGE_FLANGE_ANGLE_SNAPS = [30, 45, 60, 90, 120, 135, -30, -45, -60, -90, -120, -135];
export const FOLD_QUICK_ANGLE_CHIPS = [30, 45, 60, 90, 120, 135] as const;

export interface BendMathResult {
  angleDeg: number;
  angleRad: number;
  thicknessMm: number;
  innerRadiusMm: number;
  kFactor: number;
  bendAllowanceMm: number;
  outsideSetbackMm: number;
  bendDeductionMm: number;
}

export function computeBendMath(
  angleDeg: number,
  thicknessMm: number,
  innerRadiusMm: number,
  kFactor: number,
): BendMathResult {
  const absDeg = Math.max(0.001, Math.min(180, Math.abs(angleDeg)));
  const T = Math.max(0.1, thicknessMm);
  const R = Math.max(0, innerRadiusMm);
  const K = Math.max(0.001, Math.min(0.999, kFactor));
  const dev = computeBendDevelopment(absDeg, T, R, K);
  return {
    angleDeg: dev.angleDeg,
    angleRad: dev.thetaRad,
    thicknessMm: dev.thicknessMm,
    innerRadiusMm: dev.innerRadiusMm,
    kFactor: dev.kFactor,
    bendAllowanceMm: dev.bendAllowanceMm,
    outsideSetbackMm: dev.outsideSetbackMm,
    bendDeductionMm: dev.bendDeductionMm,
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

// ─── HELPERS DE POLÍGONO E CÍRCULO 2D ───────────────────────────────────────

export function makeRectContour2D(x0: number, y0: number, widthX: number, heightY: number): Vec2Tuple[] {
  return [
    [x0, y0],
    [x0 + widthX, y0],
    [x0 + widthX, y0 + heightY],
    [x0, y0 + heightY],
  ];
}

export function makeCircleContour2D(cx: number, cy: number, diameterMm: number, segs = 24): Vec2Tuple[] {
  const r = Math.max(0.25, diameterMm * 0.5);
  const pts: Vec2Tuple[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function rectBoundsOfContour(contour: Vec2Tuple[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of contour) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 40, minY: 0, maxY: 60 };
  return { minX, maxX, minY, maxY };
}

function nextBendId(body: SheetMetalBody): string {
  const existing = Object.keys(body.bends).length;
  let idx = existing + 1;
  while (body.bends[`bend_${String(idx).padStart(2, "0")}`]) idx++;
  return `bend_${String(idx).padStart(2, "0")}`;
}

function nextFlangeId(body: SheetMetalBody): string {
  const existing = Object.keys(body.flanges).length;
  let idx = existing + 1;
  while (body.flanges[`flange_${String(idx).padStart(2, "0")}`]) idx++;
  return `flange_${String(idx).padStart(2, "0")}`;
}

// ─── OPERAÇÕES CANÔNICAS SOBRE `SheetMetalBody` + `BendTree` ────────────────

export interface SheetMetalOpResult {
  ok: boolean;
  error?: string;
  body: SheetMetalBody;
  createdBendId?: string;
}

/**
 * Cria um `SheetMetalBody` plano (apenas a Flange Raiz) pronto para receber dobras.
 */
export function createSheetMetalBodyFromBase(params: {
  bodyId?: string;
  name?: string;
  lengthXMm: number;
  widthYMm: number;
  rule: SheetMetalRule;
  holes?: Array<{ id?: string; cx: number; cy: number; diameterMm: number }>;
}): SheetMetalBody {
  const lx = Math.max(1, Number.isFinite(params.lengthXMm) ? params.lengthXMm : 100);
  const wy = Math.max(1, Number.isFinite(params.widthYMm) ? params.widthYMm : 60);
  const rootId = "flange_root";

  const holes2D = (params.holes ?? []).map((h, i) => ({
    id: h.id ?? `hole_${i + 1}`,
    contour: makeCircleContour2D(h.cx, h.cy, h.diameterMm),
    cx: h.cx,
    cy: h.cy,
    diameterMm: h.diameterMm,
  }));

  return {
    bodyId: params.bodyId ?? `sm_body_${Date.now()}`,
    schemaVersion: SHEET_METAL_SCHEMA_VERSION,
    name: params.name ?? "Chapa Metálica",
    rule: { ...params.rule },
    rootFlangeId: rootId,
    flanges: {
      [rootId]: {
        flangeId: rootId,
        name: "Base Fixa",
        contour2D: makeRectContour2D(0, 0, lx, wy),
        holes2D,
        isFixedRoot: true,
        externalLengthMm: lx,
        widthMm: wy,
      },
    },
    bends: {},
    crossBendCutouts: [],
    etchTexts: [],
  };
}

/**
 * 1) `Dobrar (Fold)` — `sheet.fold`
 * Dobra uma flange plana ao longo de uma linha de dobra (definida por distância da borda
 * ou por dois pontos 2D) com grau explícito `targetAngleDeg` (1°..180°), sentido `UP`/`DOWN`,
 * compensação exata (`BA`, `OSSB`, `BD`) e suporte a inverter o lado fixo!
 */
export function foldSheetMetalBody(
  body: SheetMetalBody,
  params: {
    targetFlangeId?: string;
    /** Distância a partir da borda inicial da flange onde a dobra ocorre (ex.: 40 mm formando aba A=40) */
    distanceFromEdgeMm?: number;
    /** Comprimento externo desejado para a aba dobrada (se fornecido, garante aba externa exata!) */
    childExternalLegMm?: number;
    /** Opcional: linha de dobra por 2 pontos no plano local da flange */
    bendLinePoints?: [Vec2Tuple, Vec2Tuple];
    targetAngleDeg: number;
    angleExpression?: string;
    direction?: BendDirection;
    innerRadiusMm?: number;
    kFactor?: number;
    bendPosition?: BendPositionMode;
    invertFixedSide?: boolean;
    bendId?: string;
  },
): SheetMetalOpResult {
  const T = body.rule.thicknessMm;
  const R = params.innerRadiusMm ?? body.rule.innerRadiusMm;
  const K = params.kFactor ?? body.rule.kFactor;

  const check = validateBendInputs({
    angleDeg: params.targetAngleDeg,
    thicknessMm: T,
    innerRadiusMm: R,
    kFactor: K,
  });
  if (!check.ok) {
    return { ok: false, error: check.error, body };
  }

  const next = structuredClone(body);
  const parentId = params.targetFlangeId && next.flanges[params.targetFlangeId]
    ? params.targetFlangeId
    : next.rootFlangeId;
  const parentFlange = next.flanges[parentId];
  if (!parentFlange) {
    return { ok: false, error: "Flange alvo não encontrada na BendTree.", body };
  }

  const dev = computeBendDevelopment(check.angleDeg, T, R, K);
  const b = rectBoundsOfContour(parentFlange.contour2D);
  const spanX = Math.max(1, b.maxX - b.minX);
  const spanY = Math.max(1, b.maxY - b.minY);

  // Calcula posição da linha de dobra (por 2 pontos ou distância da borda)
  let splitX =
    params.distanceFromEdgeMm !== undefined && Number.isFinite(params.distanceFromEdgeMm)
      ? b.minX + params.distanceFromEdgeMm
      : b.minX + spanX * 0.5;

  let axisDirLocal: Vec3Tuple = [0, 1, 0];
  if (params.bendLinePoints) {
    const [p1, p2] = params.bendLinePoints;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    if (len > 1e-4) {
      axisDirLocal = [dx / len, dy / len, 0];
      splitX = (p1[0] + p2[0]) * 0.5;
    }
  }

  // Determina comprimentos externos exatos de A (pai) e B (filho)
  let parentExtMm =
    params.distanceFromEdgeMm !== undefined && Number.isFinite(params.distanceFromEdgeMm)
      ? Math.max(1, params.distanceFromEdgeMm)
      : Math.max(1, splitX - b.minX);

  let childExtMm =
    params.childExternalLegMm !== undefined && Number.isFinite(params.childExternalLegMm)
      ? Math.max(1, params.childExternalLegMm)
      : Math.max(1, b.maxX - splitX);

  if (params.invertFixedSide) {
    const tmp = parentExtMm;
    parentExtMm = childExtMm;
    childExtMm = tmp;
  }

  // Zonas retas planas descontando OSSB (garante que L_flat = A_ext + B_ext - BD = (A - OSSB) + BA + (B - OSSB))
  const parentFlatStraight = Math.max(0.5, parentExtMm - dev.outsideSetbackMm);
  const childFlatStraight = Math.max(0.5, childExtMm - dev.outsideSetbackMm);

  const bendPos = params.bendPosition ?? "MATERIAL_OUTSIDE";
  const direction: BendDirection = params.direction ?? "UP";
  const bendId = params.bendId ?? nextBendId(next);
  const childFlangeId = nextFlangeId(next);

  // Atualiza contorno da flange pai para a porção reta antes da zona de dobra
  const parentEndX = b.minX + parentFlatStraight;
  parentFlange.contour2D = makeRectContour2D(b.minX, b.minY, parentFlatStraight, spanY);
  parentFlange.externalLengthMm = parentExtMm;
  parentFlange.widthMm = spanY;

  // Cria flange filha no referencial imediatamente após a dobra
  const childFlange: FlangeNode = {
    flangeId: childFlangeId,
    name: `Aba ${Object.keys(next.bends).length + 1}`,
    contour2D: makeRectContour2D(parentEndX, b.minY, childFlatStraight, spanY),
    holes2D: [],
    isFixedRoot: false,
    externalLengthMm: childExtMm,
    widthMm: spanY,
  };

  const bendNode: BendNode = {
    bendId,
    parentFlangeId: parentId,
    childFlangeId,
    axisOriginLocal: [parentEndX, b.minY, 0],
    axisDirLocal,
    targetAngleDeg: dev.angleDeg,
    angleExpression: params.angleExpression,
    direction,
    innerRadiusMm: dev.innerRadiusMm,
    kFactor: dev.kFactor,
    bendPosition: bendPos,
    state: "FOLDED",
    bendAllowanceMm: Number(dev.bendAllowanceMm.toFixed(6)),
    outsideSetbackMm: Number(dev.outsideSetbackMm.toFixed(6)),
    bendDeductionMm: Number(dev.bendDeductionMm.toFixed(6)),
    parentEdge: "right",
    bendLineLengthMm: spanY,
    externalLegLengthMm: childExtMm,
  };

  next.flanges[childFlangeId] = childFlange;
  next.bends[bendId] = bendNode;

  return { ok: true, body: next, createdBendId: bendId };
}

/**
 * 2) `Edge Flange` gravando diretamente na mesma `SheetMetalBody` + `BendTree`.
 */
export function addEdgeFlangeToBody(
  body: SheetMetalBody,
  params: {
    parentFlangeId?: string;
    edge?: "right" | "left" | "top" | "bottom";
    externalLengthMm: number;
    targetAngleDeg: number;
    direction?: BendDirection;
    innerRadiusMm?: number;
    kFactor?: number;
    bendPosition?: BendPositionMode;
    angleExpression?: string;
  },
): SheetMetalOpResult {
  const T = body.rule.thicknessMm;
  const R = params.innerRadiusMm ?? body.rule.innerRadiusMm;
  const K = params.kFactor ?? body.rule.kFactor;
  const check = validateBendInputs({
    angleDeg: Math.abs(params.targetAngleDeg),
    thicknessMm: T,
    innerRadiusMm: R,
    kFactor: K,
  });
  if (!check.ok) return { ok: false, error: check.error, body };
  if (!Number.isFinite(params.externalLengthMm) || params.externalLengthMm <= 0) {
    return { ok: false, error: "Comprimento da aba deve ser maior que zero.", body };
  }

  const next = structuredClone(body);
  const parentId =
    params.parentFlangeId && next.flanges[params.parentFlangeId]
      ? params.parentFlangeId
      : next.rootFlangeId;
  const parent = next.flanges[parentId]!;
  const b = rectBoundsOfContour(parent.contour2D);
  const spanX = Math.max(1, b.maxX - b.minX);
  const spanY = Math.max(1, b.maxY - b.minY);
  const edge = params.edge ?? "right";

  const dev = computeBendDevelopment(check.angleDeg, T, R, K);
  const dir: BendDirection = params.direction ?? (params.targetAngleDeg >= 0 ? "UP" : "DOWN");
  const childFlat = Math.max(0.5, params.externalLengthMm - dev.outsideSetbackMm);

  const bendId = nextBendId(next);
  const childId = nextFlangeId(next);

  let axisOriginLocal: Vec3Tuple = [b.maxX, b.minY, 0];
  let axisDirLocal: Vec3Tuple = [0, 1, 0];
  let childContour: Vec2Tuple[] = makeRectContour2D(b.maxX, b.minY, childFlat, spanY);
  let bendLineLengthMm = spanY;

  if (edge === "left") {
    axisOriginLocal = [b.minX, b.maxY, 0];
    axisDirLocal = [0, -1, 0];
    childContour = makeRectContour2D(b.minX - childFlat, b.minY, childFlat, spanY);
    bendLineLengthMm = spanY;
  } else if (edge === "top") {
    axisOriginLocal = [b.maxX, b.maxY, 0];
    axisDirLocal = [-1, 0, 0];
    childContour = makeRectContour2D(b.minX, b.maxY, spanX, childFlat);
    bendLineLengthMm = spanX;
  } else if (edge === "bottom") {
    axisOriginLocal = [b.minX, b.minY, 0];
    axisDirLocal = [1, 0, 0];
    childContour = makeRectContour2D(b.minX, b.minY - childFlat, spanX, childFlat);
    bendLineLengthMm = spanX;
  }

  // Se o pai ainda não teve o OSSB descontado nesta borda, descontamos no comprimento reto
  if (edge === "right" && parent.externalLengthMm && Math.abs((b.maxX - b.minX) - parent.externalLengthMm) < 0.01) {
    const newParentFlat = Math.max(0.5, parent.externalLengthMm - dev.outsideSetbackMm);
    parent.contour2D = makeRectContour2D(b.minX, b.minY, newParentFlat, spanY);
    axisOriginLocal = [b.minX + newParentFlat, b.minY, 0];
    childContour = makeRectContour2D(b.minX + newParentFlat, b.minY, childFlat, spanY);
  }

  next.flanges[childId] = {
    flangeId: childId,
    name: `Edge Flange ${Object.keys(next.bends).length + 1}`,
    contour2D: childContour,
    holes2D: [],
    isFixedRoot: false,
    externalLengthMm: params.externalLengthMm,
    widthMm: bendLineLengthMm,
  };

  next.bends[bendId] = {
    bendId,
    parentFlangeId: parentId,
    childFlangeId: childId,
    axisOriginLocal,
    axisDirLocal,
    targetAngleDeg: dev.angleDeg,
    angleExpression: params.angleExpression,
    direction: dir,
    innerRadiusMm: dev.innerRadiusMm,
    kFactor: dev.kFactor,
    bendPosition: params.bendPosition ?? "MATERIAL_OUTSIDE",
    state: "FOLDED",
    bendAllowanceMm: Number(dev.bendAllowanceMm.toFixed(6)),
    outsideSetbackMm: Number(dev.outsideSetbackMm.toFixed(6)),
    bendDeductionMm: Number(dev.bendDeductionMm.toFixed(6)),
    parentEdge: edge,
    bendLineLengthMm,
    externalLegLengthMm: params.externalLengthMm,
  };

  return { ok: true, body: next, createdBendId: bendId };
}

/**
 * 3) `Contour Flange` (L / U / Z / Ômega) construindo diretamente a `SheetMetalBody` + `BendTree`.
 */
export function createContourFlangeBody(params: {
  name?: string;
  extrudeWidthMm: number;
  externalLegsMm: number[];
  bendAnglesDeg: number[]; // +UP / -DOWN
  rule: SheetMetalRule;
  holesOnRoot?: Array<{ id?: string; cx: number; cy: number; diameterMm: number }>;
}): SheetMetalBody {
  const legs = params.externalLegsMm.length > 0 ? params.externalLegsMm : [40, 30];
  let body = createSheetMetalBodyFromBase({
    name: params.name ?? "Contour Flange",
    lengthXMm: legs[0]!,
    widthYMm: params.extrudeWidthMm,
    rule: params.rule,
    holes: params.holesOnRoot,
  });

  if (legs.length === 1) return body;

  // 1ª dobra usando foldSheetMetalBody para descontar OSSB da perna base e criar a perna 2
  const firstRaw = params.bendAnglesDeg[0] ?? 90;
  const firstRes = foldSheetMetalBody(body, {
    targetFlangeId: body.rootFlangeId,
    distanceFromEdgeMm: legs[0]!,
    childExternalLegMm: legs[1]!,
    targetAngleDeg: Math.abs(firstRaw),
    direction: firstRaw >= 0 ? "UP" : "DOWN",
  });
  if (!firstRes.ok) return body;
  body = firstRes.body;

  let prevFlangeId = firstRes.createdBendId
    ? body.bends[firstRes.createdBendId]!.childFlangeId
    : body.rootFlangeId;

  for (let i = 2; i < legs.length; i++) {
    const rawAng = params.bendAnglesDeg[i - 1] ?? 90;
    const prevFlange = body.flanges[prevFlangeId];
    if (!prevFlange) break;
    // Ao conectar uma nova aba ao final da perna anterior, desconta OSSB da perna anterior também
    const dev = computeBendDevelopment(
      Math.abs(rawAng),
      body.rule.thicknessMm,
      body.rule.innerRadiusMm,
      body.rule.kFactor,
    );
    const pb = rectBoundsOfContour(prevFlange.contour2D);
    const newPrevLen = Math.max(0.5, (pb.maxX - pb.minX) - dev.outsideSetbackMm);
    prevFlange.contour2D = makeRectContour2D(pb.minX, pb.minY, newPrevLen, pb.maxY - pb.minY);

    const nextRes = addEdgeFlangeToBody(body, {
      parentFlangeId: prevFlangeId,
      edge: "right",
      externalLengthMm: legs[i]!,
      targetAngleDeg: Math.abs(rawAng),
      direction: rawAng >= 0 ? "UP" : "DOWN",
    });
    if (!nextRes.ok) break;
    body = nextRes.body;
    if (nextRes.createdBendId) {
      prevFlangeId = body.bends[nextRes.createdBendId]!.childFlangeId;
    }
  }

  return body;
}

/**
 * 4) `Desdobrar (Unfold)` — `sheet.unfold`
 * Muda `state` para `"UNFOLDED"` preservando 100% intacto o `targetAngleDeg` original!
 */
export function unfoldSheetMetalBody(
  body: SheetMetalBody,
  bendIds?: string[],
): SheetMetalBody {
  const next = structuredClone(body);
  const filter = bendIds && bendIds.length > 0 ? new Set(bendIds) : null;
  for (const bend of Object.values(next.bends)) {
    if (!filter || filter.has(bend.bendId)) {
      bend.state = "UNFOLDED";
      // targetAngleDeg NUNCA é apagado!
    }
  }
  return next;
}

/**
 * 5) `Redobrar (Refold)` — `sheet.refold`
 * Restaura `state` para `"FOLDED"` usando exatamente o `targetAngleDeg` salvo no `BendNode`!
 */
export function refoldSheetMetalBody(
  body: SheetMetalBody,
  bendIds?: string[],
): SheetMetalBody {
  const next = structuredClone(body);
  const filter = bendIds && bendIds.length > 0 ? new Set(bendIds) : null;
  for (const bend of Object.values(next.bends)) {
    if (!filter || filter.has(bend.bendId)) {
      bend.state = "FOLDED";
    }
  }
  return next;
}

/**
 * 6) Edição paramétrica de um `BendNode` (grau, direção, R, K, expressão):
 * Recalcula imediatamente BA, OSSB, BD e atualiza as zonas retas adjacentes.
 */
export function editBendNodeInBody(
  body: SheetMetalBody,
  bendId: string,
  patch: {
    targetAngleDeg?: number;
    angleExpression?: string;
    direction?: BendDirection;
    innerRadiusMm?: number;
    kFactor?: number;
    bendPosition?: BendPositionMode;
  },
): SheetMetalOpResult {
  const existing = body.bends[bendId];
  if (!existing) {
    return { ok: false, error: `Dobra '${bendId}' não encontrada.`, body };
  }

  const nextAngle = patch.targetAngleDeg ?? existing.targetAngleDeg;
  const nextR = patch.innerRadiusMm ?? existing.innerRadiusMm;
  const nextK = patch.kFactor ?? existing.kFactor;
  const T = body.rule.thicknessMm;

  const check = validateBendInputs({
    angleDeg: nextAngle,
    thicknessMm: T,
    innerRadiusMm: nextR,
    kFactor: nextK,
  });
  if (!check.ok) {
    return { ok: false, error: check.error, body };
  }

  const next = structuredClone(body);
  const bend = next.bends[bendId]!;
  const prevOssb = bend.outsideSetbackMm;
  const dev = computeBendDevelopment(check.angleDeg, T, nextR, nextK);

  bend.targetAngleDeg = dev.angleDeg;
  if (patch.angleExpression !== undefined) bend.angleExpression = patch.angleExpression;
  if (patch.direction !== undefined) bend.direction = patch.direction;
  bend.innerRadiusMm = dev.innerRadiusMm;
  bend.kFactor = dev.kFactor;
  if (patch.bendPosition !== undefined) bend.bendPosition = patch.bendPosition;
  bend.bendAllowanceMm = Number(dev.bendAllowanceMm.toFixed(6));
  bend.outsideSetbackMm = Number(dev.outsideSetbackMm.toFixed(6));
  bend.bendDeductionMm = Number(dev.bendDeductionMm.toFixed(6));

  // Ajusta o recuo (OSSB) nas zonas retas adjacentes quando o ângulo/raio muda
  const deltaOssb = dev.outsideSetbackMm - prevOssb;
  const parent = next.flanges[bend.parentFlangeId];
  const child = next.flanges[bend.childFlangeId];
  if (parent && child && Math.abs(deltaOssb) > 1e-6 && (bend.parentEdge === "right" || !bend.parentEdge)) {
    const pb = rectBoundsOfContour(parent.contour2D);
    const cb = rectBoundsOfContour(child.contour2D);
    const newParentLen = Math.max(0.5, (pb.maxX - pb.minX) - deltaOssb);
    const newChildLen = Math.max(0.5, (cb.maxX - cb.minX) - deltaOssb);
    parent.contour2D = makeRectContour2D(pb.minX, pb.minY, newParentLen, pb.maxY - pb.minY);
    const newAxisX = pb.minX + newParentLen;
    bend.axisOriginLocal = [newAxisX, bend.axisOriginLocal[1], bend.axisOriginLocal[2]];
    child.contour2D = makeRectContour2D(newAxisX, cb.minY, newChildLen, cb.maxY - cb.minY);
  }

  return { ok: true, body: next };
}

/**
 * 7) Troca a Face Fixa (`rootFlangeId`) reorientando as relações pai -> filho na `BendTree`.
 */
export function swapFixedRootFlange(
  body: SheetMetalBody,
  newRootFlangeId: string,
): SheetMetalBody {
  if (!body.flanges[newRootFlangeId] || body.rootFlangeId === newRootFlangeId) {
    return body;
  }
  const next = structuredClone(body);

  // Constrói adjacência não-direcionada para achar o caminho do root antigo até o novo
  const adj = new Map<string, Array<{ neighbor: string; bendId: string }>>();
  for (const b of Object.values(next.bends)) {
    const a1 = adj.get(b.parentFlangeId) ?? [];
    a1.push({ neighbor: b.childFlangeId, bendId: b.bendId });
    adj.set(b.parentFlangeId, a1);

    const a2 = adj.get(b.childFlangeId) ?? [];
    a2.push({ neighbor: b.parentFlangeId, bendId: b.bendId });
    adj.set(b.childFlangeId, a2);
  }

  // BFS a partir do novo root para orientar todas as arestas para fora do novo root
  const visited = new Set<string>([newRootFlangeId]);
  const queue: string[] = [newRootFlangeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const edge of adj.get(curr) ?? []) {
      if (visited.has(edge.neighbor)) continue;
      visited.add(edge.neighbor);
      const bend = next.bends[edge.bendId]!;
      if (bend.parentFlangeId !== curr) {
        bend.parentFlangeId = curr;
        bend.childFlangeId = edge.neighbor;
        bend.axisDirLocal = [-bend.axisDirLocal[0], -bend.axisDirLocal[1], -bend.axisDirLocal[2]];
      }
      queue.push(edge.neighbor);
    }
  }

  for (const f of Object.values(next.flanges)) {
    f.isFixedRoot = f.flangeId === newRootFlangeId;
  }
  next.rootFlangeId = newRootFlangeId;
  return next;
}

/**
 * 8) Adiciona furo ou recorte na chapa (se houver dobra UNFOLDED ou se cair sobre a zona de dobra,
 *    também registra em `crossBendCutouts` para deformar ao redobrar!).
 */
export function addHoleOrCutoutToBody(
  body: SheetMetalBody,
  params: {
    cutoutId?: string;
    flangeId?: string;
    cx: number;
    cy: number;
    diameterMm: number;
    acrossBend?: boolean;
  },
): SheetMetalOpResult {
  if (!Number.isFinite(params.diameterMm) || params.diameterMm <= 0) {
    return { ok: false, error: "Diâmetro do furo inválido (deve ser > 0).", body };
  }
  if (!Number.isFinite(params.cx) || !Number.isFinite(params.cy)) {
    return { ok: false, error: "Coordenadas do furo inválidas.", body };
  }

  const next = structuredClone(body);
  const id = params.cutoutId ?? `cutout_${Date.now()}_${next.crossBendCutouts.length + 1}`;
  const contour = makeCircleContour2D(params.cx, params.cy, params.diameterMm);

  const hasUnfolded = Object.values(next.bends).some((b) => b.state === "UNFOLDED");
  if (params.acrossBend || hasUnfolded) {
    next.crossBendCutouts.push({
      cutoutId: id,
      flatContour2D: contour,
      cx: params.cx,
      cy: params.cy,
      diameterMm: params.diameterMm,
    });
  }

  const targetFlangeId =
    params.flangeId && next.flanges[params.flangeId]
      ? params.flangeId
      : next.rootFlangeId;
  const target = next.flanges[targetFlangeId];
  if (target) {
    target.holes2D.push({
      id,
      contour,
      cx: params.cx,
      cy: params.cy,
      diameterMm: params.diameterMm,
    });
  }

  return { ok: true, body: next };
}

/**
 * Atualiza a regra de chapa do corpo, recalculando todas as dobras na BendTree.
 */
export function updateSheetMetalBodyRule(
  body: SheetMetalBody,
  rule: SheetMetalRule,
): SheetMetalBody {
  let next = structuredClone(body);
  next.rule = { ...rule };
  for (const bendId of Object.keys(next.bends)) {
    const res = editBendNodeInBody(next, bendId, {
      innerRadiusMm: rule.innerRadiusMm,
      kFactor: rule.kFactor,
    });
    if (res.ok) next = res.body;
  }
  return next;
}

export function serializeSheetMetalBody(body: SheetMetalBody): string {
  return JSON.stringify({ ...body, schemaVersion: SHEET_METAL_SCHEMA_VERSION }, null, 2);
}

export function deserializeSheetMetalBody(json: string): SheetMetalBody | null {
  try {
    const parsed = JSON.parse(json) as Partial<SheetMetalBody>;
    if (!parsed || !parsed.bodyId || !parsed.rootFlangeId || !parsed.flanges || !parsed.bends) {
      return null;
    }
    return {
      bodyId: parsed.bodyId,
      schemaVersion: parsed.schemaVersion ?? SHEET_METAL_SCHEMA_VERSION,
      name: parsed.name ?? "Chapa Metálica",
      rule: parsed.rule ?? DEFAULT_SHEET_METAL_RULES[4]!,
      rootFlangeId: parsed.rootFlangeId,
      flanges: parsed.flanges,
      bends: parsed.bends,
      crossBendCutouts: parsed.crossBendCutouts ?? [],
      etchTexts: parsed.etchTexts ?? [],
    };
  } catch {
    return null;
  }
}

// ─── FLAT PATTERN EXATO A PARTIR DA `SheetMetalBody` (SEM ALTERAR ESTADO 3D) ─

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
  label?: string;
}

export type ExactDxfEntity =
  | {
      type: "LINE";
      layer: "CUT" | "OUTLINE" | "BEND_UP" | "BEND_DOWN" | "ETCH";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label?: string;
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
  developedLengthMm: number;
  cutEntities: ExactDxfEntity[];
  outlineEntities: ExactDxfEntity[];
  bendLines: ExactDxfEntity[];
  etchEntities: ExactDxfEntity[];
  bendTable: BendTableRow[];
  orderedEntities: ExactDxfEntity[];
}

/**
 * Gera Planificação Exata (`Flat Pattern`) lendo 100% da `BendTree` do `SheetMetalBody`
 * SEM modificar o estado `FOLDED`/`UNFOLDED` do modelo 3D!
 */
export function computeBodyFlatPattern(body: SheetMetalBody): FlatPatternResult {
  const cutEntities: ExactDxfEntity[] = [];
  const outlineEntities: ExactDxfEntity[] = [];
  const bendLines: ExactDxfEntity[] = [];
  const etchEntities: ExactDxfEntity[] = [];
  const bendTable: BendTableRow[] = [];

  const T = body.rule.thicknessMm;
  const bendsByParent = new Map<string, BendNode[]>();
  for (const b of Object.values(body.bends)) {
    const list = bendsByParent.get(b.parentFlangeId) ?? [];
    list.push(b);
    bendsByParent.set(b.parentFlangeId, list);
  }

  const root = body.flanges[body.rootFlangeId];
  const rootB = root ? rectBoundsOfContour(root.contour2D) : { minX: 0, maxX: 100, minY: 0, maxY: 60 };
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = Math.max(1, rootB.maxY - rootB.minY);
  let order = 1;
  const seenHoles = new Set<string>();
  const visited = new Set<string>();

  const walk = (flangeId: string, xOffset: number, yOffset: number) => {
    if (visited.has(flangeId)) return;
    visited.add(flangeId);
    const flange = body.flanges[flangeId];
    if (!flange) return;

    const fb = rectBoundsOfContour(flange.contour2D);
    const flatStraightX = Math.max(0, fb.maxX - fb.minX);
    const flatSpanY = Math.max(1, fb.maxY - fb.minY);

    minX = Math.min(minX, xOffset);
    maxX = Math.max(maxX, xOffset + flatStraightX);
    minY = Math.min(minY, yOffset);
    maxY = Math.max(maxY, yOffset + flatSpanY);

    // Furos internos da flange (sempre camada CUT)
    for (const hole of flange.holes2D) {
      if (seenHoles.has(hole.id)) continue;
      seenHoles.add(hole.id);
      if (hole.cx !== undefined && hole.cy !== undefined && hole.diameterMm !== undefined) {
        cutEntities.push({
          type: "CIRCLE",
          layer: "CUT",
          cx: xOffset + (hole.cx - fb.minX),
          cy: yOffset + (hole.cy - fb.minY),
          radius: hole.diameterMm * 0.5,
        });
      }
    }

    const outgoing = bendsByParent.get(flangeId) ?? [];
    for (const bend of outgoing) {
      const dev = computeBendDevelopment(bend.targetAngleDeg, T, bend.innerRadiusMm, bend.kFactor);
      const ba = dev.bendAllowanceMm;
      const edge = bend.parentEdge ?? "right";
      const layer = bend.direction === "UP" ? "BEND_UP" : "BEND_DOWN";
      const label = `${bend.direction === "UP" ? "CIMA" : "BAIXO"} ${dev.angleDeg.toFixed(1)}° R${dev.innerRadiusMm.toFixed(1)}`;
      const lineLen = bend.bendLineLengthMm ?? flatSpanY;

      bendTable.push({
        order: order++,
        bendId: bend.bendId,
        direction: bend.direction,
        angleDeg: Number(dev.angleDeg.toFixed(4)),
        innerRadiusMm: Number(dev.innerRadiusMm.toFixed(4)),
        bendLineLengthMm: Number(lineLen.toFixed(4)),
        bendAllowanceMm: Number(dev.bendAllowanceMm.toFixed(4)),
        bendDeductionMm: Number(dev.bendDeductionMm.toFixed(4)),
        outsideSetbackMm: Number(dev.outsideSetbackMm.toFixed(4)),
        label,
      });

      if (edge === "right" || edge === "custom") {
        const xBendCenter = xOffset + flatStraightX + ba * 0.5;
        bendLines.push({
          type: "LINE",
          layer,
          x1: xBendCenter,
          y1: yOffset,
          x2: xBendCenter,
          y2: yOffset + lineLen,
          label,
        });
        walk(bend.childFlangeId, xOffset + flatStraightX + ba, yOffset);
      } else if (edge === "left") {
        const xBendCenter = xOffset - ba * 0.5;
        bendLines.push({
          type: "LINE",
          layer,
          x1: xBendCenter,
          y1: yOffset,
          x2: xBendCenter,
          y2: yOffset + lineLen,
          label,
        });
        const child = body.flanges[bend.childFlangeId];
        const cb = child ? rectBoundsOfContour(child.contour2D) : { minX: 0, maxX: 20, minY: 0, maxY: lineLen };
        walk(bend.childFlangeId, xOffset - ba - (cb.maxX - cb.minX), yOffset);
      } else if (edge === "top") {
        const yBendCenter = yOffset + flatSpanY + ba * 0.5;
        bendLines.push({
          type: "LINE",
          layer,
          x1: xOffset,
          y1: yBendCenter,
          x2: xOffset + flatStraightX,
          y2: yBendCenter,
          label,
        });
        walk(bend.childFlangeId, xOffset, yOffset + flatSpanY + ba);
      } else if (edge === "bottom") {
        const yBendCenter = yOffset - ba * 0.5;
        bendLines.push({
          type: "LINE",
          layer,
          x1: xOffset,
          y1: yBendCenter,
          x2: xOffset + flatStraightX,
          y2: yBendCenter,
          label,
        });
        const child = body.flanges[bend.childFlangeId];
        const cb = child ? rectBoundsOfContour(child.contour2D) : { minX: 0, maxX: flatStraightX, minY: 0, maxY: 20 };
        walk(bend.childFlangeId, xOffset, yOffset - ba - (cb.maxY - cb.minY));
      }
    }
  };

  walk(body.rootFlangeId, 0, 0);

  // Recortes que cruzam dobras (crossBendCutouts -> camada CUT)
  for (const cut of body.crossBendCutouts) {
    if (seenHoles.has(cut.cutoutId)) continue;
    seenHoles.add(cut.cutoutId);
    if (cut.cx !== undefined && cut.cy !== undefined && cut.diameterMm !== undefined) {
      cutEntities.push({
        type: "CIRCLE",
        layer: "CUT",
        cx: cut.cx,
        cy: cut.cy,
        radius: cut.diameterMm * 0.5,
      });
    } else if (cut.flatContour2D.length >= 3) {
      for (let i = 0; i < cut.flatContour2D.length; i++) {
        const p1 = cut.flatContour2D[i]!;
        const p2 = cut.flatContour2D[(i + 1) % cut.flatContour2D.length]!;
        cutEntities.push({
          type: "LINE",
          layer: "CUT",
          x1: p1[0],
          y1: p1[1],
          x2: p2[0],
          y2: p2[1],
        });
      }
    }
  }

  // Contorno externo (OUTLINE) com alívio de canto redondo se reliefType === "ROUND"
  const flatW = Math.max(0.1, maxX - minX);
  const flatH = Math.max(0.1, maxY - minY);
  const rCorner =
    (body.rule.reliefType === "ROUND" || body.rule.cornerRelief === "round") && bendTable.length > 0
      ? Math.min(body.rule.thicknessMm * 0.5, flatW * 0.1, flatH * 0.1)
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

  for (const t of body.etchTexts ?? []) {
    etchEntities.push({
      type: "LINE",
      layer: "ETCH",
      x1: t.x,
      y1: t.y,
      x2: t.x + Math.max(4, t.text.length * t.heightMm * 0.6),
      y2: t.y,
    });
  }

  const orderedEntities: ExactDxfEntity[] = [
    ...cutEntities,
    ...outlineEntities,
    ...bendLines,
    ...etchEntities,
  ];

  return {
    partId: body.bodyId,
    rule: body.rule,
    flatWidthMm: Number(flatW.toFixed(4)),
    flatHeightMm: Number(flatH.toFixed(4)),
    developedLengthMm: Number(flatW.toFixed(4)),
    cutEntities,
    outlineEntities,
    bendLines,
    etchEntities,
    bendTable,
    orderedEntities,
  };
}

// ─── API LEGADA RETROCOMPATÍVEL (`SheetMetalPart` usada em chamferOracle.test.ts) ─

export interface SheetHole2D {
  id: string;
  x: number;
  y: number;
  diameterMm: number;
  bendArcMapping?: { bendId: string; sMm: number; vMm: number };
}

export interface SheetFlangeNode {
  id: string;
  name: string;
  widthMm: number;
  externalLengthMm: number;
  holes: SheetHole2D[];
  children: SheetBendEdge[];
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
  unfolded: boolean;
  partialOffsetMm?: number;
  partialWidthMm?: number;
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
    angleDeg: 180,
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

export function computeFlatPattern(part: SheetMetalPart): FlatPatternResult {
  const cutEntities: ExactDxfEntity[] = [];
  const outlineEntities: ExactDxfEntity[] = [];
  const bendLines: ExactDxfEntity[] = [];
  const etchEntities: ExactDxfEntity[] = [];
  const bendTable: BendTableRow[] = [];

  const T = part.rule.thicknessMm;
  const rootW = part.root.widthMm;

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
      const label = `${rightBend.direction === "UP" ? "CIMA" : "BAIXO"} ${rightMath.angleDeg.toFixed(1)}° R${rightMath.innerRadiusMm.toFixed(1)}`;

      bendLines.push({
        type: "LINE",
        layer: lineLayer,
        x1: bendCenterX,
        y1: spanStart,
        x2: bendCenterX,
        y2: spanStart + spanLen,
        label,
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
        label,
      });

      xCursor += ba;
      processNodeLinear(rightBend.child, rightMath.outsideSetbackMm, spanStart);
    }
  };

  processNodeLinear(part.root, 0, 0);
  totalFlatX = xCursor;

  let minY = 0;
  let maxY = rootW;
  let minX = 0;
  let maxX = totalFlatX;

  for (const b of part.root.children) {
    if (b.parentEdge === "right") continue;
    const bm = computeBendMath(b.angleDeg, T, b.innerRadiusMm, b.kFactor);
    const legFlat = Math.max(0, b.child.externalLengthMm - bm.outsideSetbackMm) + bm.bendAllowanceMm;
    const lineLayer = b.direction === "UP" ? "BEND_UP" : "BEND_DOWN";
    const label = `${b.direction === "UP" ? "CIMA" : "BAIXO"} ${bm.angleDeg.toFixed(1)}° R${bm.innerRadiusMm.toFixed(1)}`;

    if (b.parentEdge === "top") {
      const yLine = rootW - bm.outsideSetbackMm + bm.bendAllowanceMm / 2;
      bendLines.push({ type: "LINE", layer: lineLayer, x1: 0, y1: yLine, x2: part.root.externalLengthMm, y2: yLine, label });
      maxY = Math.max(maxY, rootW - bm.outsideSetbackMm + legFlat);
    } else if (b.parentEdge === "bottom") {
      const yLine = bm.outsideSetbackMm - bm.bendAllowanceMm / 2;
      bendLines.push({ type: "LINE", layer: lineLayer, x1: 0, y1: yLine, x2: part.root.externalLengthMm, y2: yLine, label });
      minY = Math.min(minY, -(legFlat - bm.outsideSetbackMm));
    } else if (b.parentEdge === "left") {
      const xLine = bm.outsideSetbackMm - bm.bendAllowanceMm / 2;
      bendLines.push({ type: "LINE", layer: lineLayer, x1: xLine, y1: 0, x2: xLine, y2: rootW, label });
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
      label,
    });
  }

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

export function exportBendTableCsv(rows: BendTableRow[]): string {
  const header = "Ordem,ID_Dobra,Direcao,Angulo_deg,Raio_Interno_mm,Comprimento_Linha_mm,BA_mm,BD_mm,OSSB_mm,Etiqueta";
  const lines = rows.map(
    (r) =>
      `${r.order},${r.bendId},${r.direction},${r.angleDeg.toFixed(2)},${r.innerRadiusMm.toFixed(2)},${r.bendLineLengthMm.toFixed(2)},${r.bendAllowanceMm.toFixed(4)},${r.bendDeductionMm.toFixed(4)},${r.outsideSetbackMm.toFixed(4)},"${r.label ?? `${r.direction === "UP" ? "CIMA" : "BAIXO"} ${r.angleDeg.toFixed(1)}° R${r.innerRadiusMm.toFixed(1)}`}"`,
  );
  return [header, ...lines].join("\n");
}

export function exportLaserInsideOutDxf(flat: FlatPatternResult): string {
  const out: string[] = [];
  const push = (code: number, value: string | number) => {
    out.push(String(code), String(value));
  };

  push(0, "SECTION");
  push(2, "HEADER");
  push(9, "$INSUNITS");
  push(70, 4);
  push(0, "ENDSEC");

  push(0, "SECTION");
  push(2, "TABLES");
  push(0, "TABLE");
  push(2, "LAYER");
  push(70, 5);

  const layers: Array<{ name: string; color: number; ltype: string }> = [
    { name: "CUT", color: 3, ltype: "CONTINUOUS" },
    { name: "OUTLINE", color: 7, ltype: "CONTINUOUS" },
    { name: "BEND_UP", color: 1, ltype: "DASHED" },
    { name: "BEND_DOWN", color: 5, ltype: "DASHED" },
    { name: "ETCH", color: 2, ltype: "CONTINUOUS" },
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
