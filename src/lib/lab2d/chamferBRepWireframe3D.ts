/**
 * CALDRA — CHAMFER CAD 3D
 * MOTOR DE DECOMPOSIÇÃO TOPOLÓGICA "ARAME TÉCNICO B-REP" + COTAS DE ESPESSURA EM ESPAÇO DE TELA
 *
 * Responsabilidades:
 * 1. Decompor corpos B-Rep (`DirectTopology3DScene` + `Entity[]`) em 5 camadas semânticas de arestas
 *    100% livres de diagonais de triangulação em faces planas:
 *    - Camada 1: Contornos Externos Primários e Silhuetas (`outerContourPositions`, ~2.0px CSS)
 *    - Camada 2: Arestas Visíveis de Feature e Espessura Física (`featureThicknessPositions`, ~1.35px CSS),
 *      incluindo obrigatoriamente 4 Geratrizes Axiais Cardeais (0°, 90°, 180°, 270°) + 2 Geratrizes de
 *      Silhueta Lateral dependentes de vista para TODOS os cilindros, flanges e furos circulares, além
 *      das paredes internas verticais de `Shell` (Metalon) e costuras de `Corte 45°`.
 *    - Camada 3: Arestas Internas de Detalhe / Escareados / Rebaixos (`internalDetailPositions`, ~0.95px CSS)
 *    - Camada 4: Arestas Ocultas / Traseiras Raio-X (`allOccludablePositions`, ~1.0px CSS tracejada via GreaterDepth)
 *    - Camada 5: Linhas de Centro e Eixos de Furos/Cilindros (`centerlineAxisPositions`, ~0.85px CSS traço-ponto + cruz `+`)
 * 2. Extrair Cotas Técnicas Seletivas (`extractBRepTechnicalCallouts3D`) diretamente da geometria real
 *    (espessura física `e = {h} mm` / `Parede t = {t} mm`, envelope `L × A × H` / `Ø`, e furos `N × Ø {d} mm`)
 *    com layout anti-colisão em espaço de tela (`11px` mono `tabular-nums`).
 * 3. Persistir os filtros rápidos de camadas do modo `ARAME` em `localStorage`.
 */

import type { Entity } from "./core";
import type {
  DirectBody3D,
  DirectEdge3D,
  DirectTopology3DScene,
  Vec3Mm,
} from "./cadDirectModeling3D";

export interface BRepWireframeLayerConfig {
  showContours: boolean;
  showHiddenXRay: boolean;
  showAxesCenters: boolean;
  showDimensions: boolean;
}

export const DEFAULT_BREP_WIREFRAME_LAYER_CONFIG: BRepWireframeLayerConfig = {
  showContours: true,
  showHiddenXRay: true,
  showAxesCenters: true,
  showDimensions: true,
};

export const BREP_WIREFRAME_LAYERS_STORAGE_KEY = "caldra_chamfer_brep_arame_layers_v2";

export function loadBRepWireframeLayerConfig(
  storage?: Pick<Storage, "getItem"> | null,
): BRepWireframeLayerConfig {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : null;
  if (!targetStorage) return { ...DEFAULT_BREP_WIREFRAME_LAYER_CONFIG };
  try {
    const raw = targetStorage.getItem(BREP_WIREFRAME_LAYERS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BREP_WIREFRAME_LAYER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<BRepWireframeLayerConfig>;
    return {
      showContours:
        typeof parsed.showContours === "boolean"
          ? parsed.showContours
          : DEFAULT_BREP_WIREFRAME_LAYER_CONFIG.showContours,
      showHiddenXRay:
        typeof parsed.showHiddenXRay === "boolean"
          ? parsed.showHiddenXRay
          : DEFAULT_BREP_WIREFRAME_LAYER_CONFIG.showHiddenXRay,
      showAxesCenters:
        typeof parsed.showAxesCenters === "boolean"
          ? parsed.showAxesCenters
          : DEFAULT_BREP_WIREFRAME_LAYER_CONFIG.showAxesCenters,
      showDimensions:
        typeof parsed.showDimensions === "boolean"
          ? parsed.showDimensions
          : DEFAULT_BREP_WIREFRAME_LAYER_CONFIG.showDimensions,
    };
  } catch {
    return { ...DEFAULT_BREP_WIREFRAME_LAYER_CONFIG };
  }
}

export function saveBRepWireframeLayerConfig(
  config: BRepWireframeLayerConfig,
  storage?: Pick<Storage, "setItem"> | null,
): BRepWireframeLayerConfig {
  const normalized: BRepWireframeLayerConfig = {
    showContours: Boolean(config.showContours),
    showHiddenXRay: Boolean(config.showHiddenXRay),
    showAxesCenters: Boolean(config.showAxesCenters),
    showDimensions: Boolean(config.showDimensions),
  };
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : null;
  if (targetStorage) {
    try {
      targetStorage.setItem(BREP_WIREFRAME_LAYERS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignora indisponibilidade de storage em modo restrito
    }
  }
  return normalized;
}

export interface BRepTechnicalWireframeDiagnostics {
  bodyCount: number;
  outerContourSegmentCount: number;
  featureThicknessSegmentCount: number;
  internalDetailSegmentCount: number;
  occludableSegmentCount: number;
  centerlineSegmentCount: number;
  circularFeatureCount: number;
  holeFeatureCount: number;
  cardinalGeneratrixCount: number;
  silhouetteGeneratrixCount: number;
  shellVerticalEdgeCount: number;
  /** Garantido zero: nenhuma diagonal de triangulação de malha plana é emitida */
  flatFaceDiagonalCount: 0;
}

export interface BRepTechnicalWireframeData3D {
  /** Pares [x1,y1,z1, x2,y2,z2, ...] de Contornos Externos Primários e Silhuetas (~2.0px CSS) */
  outerContourPositions: Float32Array;
  /** Pares [x1,y1,z1, x2,y2,z2, ...] de Features Visíveis, Paredes Shell e Geratrizes de Espessura (~1.35px CSS) */
  featureThicknessPositions: Float32Array;
  /** Pares [x1,y1,z1, x2,y2,z2, ...] de Detalhes Internos, Escareados e Rebaixos (~0.95px CSS) */
  internalDetailPositions: Float32Array;
  /** Pares [x1,y1,z1, x2,y2,z2, ...] para o passe Raio-X traseiro (`GreaterDepth`, ~1.0px tracejado) */
  allOccludablePositions: Float32Array;
  /** Pares [x1,y1,z1, x2,y2,z2, ...] de Eixos Axiais e Cruzes de Centro `+` (~0.85px traço-ponto) */
  centerlineAxisPositions: Float32Array;
  /** Métricas analíticas determinísticas para auditoria e testes unitários */
  diagnostics: BRepTechnicalWireframeDiagnostics;
}

export interface ExtractBRepWireframeOptions {
  /**
   * Vetor unitário da direção de visão (do alvo em direção à câmera) no espaço CAD `(x, y_down, z)`.
   * Usado para posicionar com exatidão as 2 geratrizes laterais de silhueta em cilindros e furos.
   */
  viewDirCad3D?: Vec3Mm;
  /**
   * Quando `true` (padrão para `ThreeBRepRenderer`), converte `y -> -y` nos Float32Arrays de saída
   * para alinhamento 1:1 com o buffer de profundidade Z-up do Three.js.
   */
  convertToThreeZUp?: boolean;
  /** Limiar de vinco diedral em graus (padrão 18°) */
  creaseAngleThresholdDeg?: number;
}

export type BRepTechnicalCalloutKind = "thickness" | "envelope" | "holes";

export interface BRepTechnicalCallout3D {
  id: string;
  bodyId: string;
  kind: BRepTechnicalCalloutKind;
  text: string;
  /** Ponto de ancoragem 3D exato sobre a aresta/face real da peça (espaço CAD `x, y_down, z`) */
  anchor3D: Vec3Mm;
  /** Direção preferencial de puxada (leader) no espaço 3D */
  leaderDir3D: Vec3Mm;
}

export interface ScreenSpaceCalloutLayoutItem extends BRepTechnicalCallout3D {
  anchorPx: { x: number; y: number };
  elbowPx: { x: number; y: number };
  labelPx: { x: number; y: number };
  widthPx: number;
  heightPx: number;
  align: "left" | "right";
}

/* -------------------------------------------------------------------------- */
/* Helpers Geométricos Puros 3D                                               */
/* -------------------------------------------------------------------------- */

function sub3(a: Vec3Mm, b: Vec3Mm): Vec3Mm {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add3(a: Vec3Mm, b: Vec3Mm): Vec3Mm {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale3(v: Vec3Mm, s: number): Vec3Mm {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot3(a: Vec3Mm, b: Vec3Mm): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3Mm, b: Vec3Mm): Vec3Mm {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len3(v: Vec3Mm): number {
  return Math.hypot(v.x, v.y, v.z);
}

function norm3(v: Vec3Mm, fallback: Vec3Mm = { x: 0, y: 0, z: 1 }): Vec3Mm {
  const l = len3(v);
  if (l < 1e-8 || !Number.isFinite(l)) return fallback;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function rotatePointAroundPivotCad3D(
  pt: Vec3Mm,
  pivot: Vec3Mm,
  rot: { rxDeg: number; ryDeg: number; rzDeg: number },
): Vec3Mm {
  let x = pt.x - pivot.x;
  let y = pt.y - pivot.y;
  let z = pt.z - pivot.z;

  if (Math.abs(rot.rxDeg) > 1e-6) {
    const r = (rot.rxDeg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  if (Math.abs(rot.ryDeg) > 1e-6) {
    const r = (rot.ryDeg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx;
    z = nz;
  }
  if (Math.abs(rot.rzDeg) > 1e-6) {
    const r = (rot.rzDeg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }

  return { x: pivot.x + x, y: pivot.y + y, z: pivot.z + z };
}

function rotateDirCad3D(
  dir: Vec3Mm,
  rot: { rxDeg: number; ryDeg: number; rzDeg: number },
): Vec3Mm {
  return norm3(rotatePointAroundPivotCad3D(dir, { x: 0, y: 0, z: 0 }, rot), dir);
}

function cleanClosedLoopPoints3D(pts: Vec3Mm[]): Vec3Mm[] {
  if (pts.length < 3) return pts;
  const out: Vec3Mm[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const prev = out[out.length - 1];
    if (!prev || len3(sub3(p, prev)) > 1e-4) {
      out.push(p);
    }
  }
  if (out.length >= 2 && len3(sub3(out[0]!, out[out.length - 1]!)) <= 1e-3) {
    out.pop();
  }
  return out;
}

interface LoopCircleAnalysis3D {
  isCircular: boolean;
  center: Vec3Mm;
  radiusMm: number;
  normal: Vec3Mm;
}

function analyzeClosedLoopCircularity3D(rawPts: Vec3Mm[]): LoopCircleAnalysis3D {
  const pts = cleanClosedLoopPoints3D(rawPts);
  if (pts.length < 3) {
    const fallbackC = pts[0] ?? { x: 0, y: 0, z: 0 };
    return {
      isCircular: false,
      center: fallbackC,
      radiusMm: 0,
      normal: { x: 0, y: 0, z: 1 },
    };
  }

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const center: Vec3Mm = {
    x: sx / pts.length,
    y: sy / pts.length,
    z: sz / pts.length,
  };

  // Normal de Newell do anel 3D
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!;
    const nxt = pts[(i + 1) % pts.length]!;
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const normal = norm3({ x: nx, y: ny, z: nz }, { x: 0, y: 0, z: 1 });

  let rSum = 0;
  let rMin = Infinity;
  let rMax = -Infinity;
  for (const p of pts) {
    const r = len3(sub3(p, center));
    rSum += r;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
  }
  const avgR = rSum / pts.length;
  const relSpread = avgR > 1e-4 ? (rMax - rMin) / avgR : 1;

  // Anel circular suave: >= 12 amostras e variação radial < 9%
  const isCircular = pts.length >= 12 && avgR > 0.25 && relSpread < 0.09;

  return {
    isCircular,
    center,
    radiusMm: avgR,
    normal,
  };
}

function closestLoopPointInDirection3D(
  loopPts: Vec3Mm[],
  center: Vec3Mm,
  dirUnit: Vec3Mm,
  fallbackRadius: number,
): Vec3Mm {
  const pts = cleanClosedLoopPoints3D(loopPts);
  if (pts.length === 0) {
    return add3(center, scale3(dirUnit, fallbackRadius));
  }
  let bestPt = pts[0]!;
  let bestScore = -Infinity;
  for (const p of pts) {
    const rel = norm3(sub3(p, center), dirUnit);
    const score = dot3(rel, dirUnit);
    if (score > bestScore) {
      bestScore = score;
      bestPt = p;
    }
  }
  return bestPt;
}

function extractSharpCornerIndicesFromLoop3D(
  rawPts: Vec3Mm[],
  creaseAngleDeg = 18,
): number[] {
  const pts = cleanClosedLoopPoints3D(rawPts);
  const n = pts.length;
  if (n < 3) return [];
  const cosThreshold = Math.cos((creaseAngleDeg * Math.PI) / 180);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const curr = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const d1 = norm3(sub3(curr, prev));
    const d2 = norm3(sub3(next, curr));
    const cosAngle = dot3(d1, d2);
    if (cosAngle <= cosThreshold) {
      indices.push(i);
    }
  }
  return indices;
}


function appendSegment3D(
  bucket: number[],
  a: Vec3Mm,
  b: Vec3Mm,
  convertToThreeZUp: boolean,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  if (dx * dx + dy * dy + dz * dz < 1e-7) return false;
  if (convertToThreeZUp) {
    bucket.push(a.x, -a.y, a.z, b.x, -b.y, b.z);
  } else {
    bucket.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return true;
}

function appendPolylineSegments3D(
  bucket: number[],
  pts: Vec3Mm[],
  closed: boolean,
  convertToThreeZUp: boolean,
): number {
  if (pts.length < 2) return 0;
  let added = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (appendSegment3D(bucket, pts[i]!, pts[i + 1]!, convertToThreeZUp)) {
      added++;
    }
  }
  if (closed && pts.length >= 3) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (len3(sub3(first, last)) > 1e-3) {
      if (appendSegment3D(bucket, last, first, convertToThreeZUp)) {
        added++;
      }
    }
  }
  return added;
}

function buildCircleRingPoints3D(
  center: Vec3Mm,
  uAxis: Vec3Mm,
  vAxis: Vec3Mm,
  radiusMm: number,
  segments = 36,
): Vec3Mm[] {
  const pts: Vec3Mm[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a) * radiusMm;
    const sa = Math.sin(a) * radiusMm;
    pts.push({
      x: center.x + uAxis.x * ca + vAxis.x * sa,
      y: center.y + uAxis.y * ca + vAxis.y * sa,
      z: center.z + uAxis.z * ca + vAxis.z * sa,
    });
  }
  return pts;
}

/* -------------------------------------------------------------------------- */
/* Extrator Principal: Decomposição B-Rep em 5 Camadas Semânticas             */
/* -------------------------------------------------------------------------- */

export function computeViewDirCad3DFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
): Vec3Mm {
  const alpha = (azimuthDeg * Math.PI) / 180;
  const beta = (Math.max(-90, Math.min(90, elevationDeg)) * Math.PI) / 180;
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);
  // No ThreeBRepRenderer (Z-up): outDirThree = (-sinA*cosB, -cosA*cosB, sinB), onde Y_three = -Y_cad.
  // Portanto, em coordenadas CAD (x, y_down, z), Y_cad = -Y_three = +cosA*cosB:
  return norm3({
    x: -sinA * cosB,
    y: cosA * cosB,
    z: sinB,
  });
}

interface HoleParamEntry3D {
  id?: string;
  holeId?: string;
  x?: number;
  y?: number;
  center2D?: { x: number; y: number };
  diameterMm?: number;
  depthMm?: number;
  throughAll?: boolean;
  mode?: string;
  holeType?: "simple" | "counterbore" | "countersink" | "threaded";
  counterboreDiameterMm?: number;
  counterboreDepthMm?: number;
  countersinkDiameterMm?: number;
  countersinkAngleDeg?: number;
}

export function extractBRepTechnicalWireframeData3D(
  scene: DirectTopology3DScene,
  entities: Entity[],
  options: ExtractBRepWireframeOptions = {},
): BRepTechnicalWireframeData3D {
  const convertToThreeZUp = options.convertToThreeZUp ?? true;
  const creaseDeg = options.creaseAngleThresholdDeg ?? 12;
  const viewDir = norm3(
    options.viewDirCad3D ?? computeViewDirCad3DFromAngles(35, 32),
    { x: -0.47, y: 0.69, z: 0.53 },
  );

  const outerContourArr: number[] = [];
  const featureThicknessArr: number[] = [];
  const internalDetailArr: number[] = [];
  const occludableArr: number[] = [];
  const centerlineArr: number[] = [];

  let circularFeatureCount = 0;
  let holeFeatureCount = 0;
  let cardinalGeneratrixCount = 0;
  let silhouetteGeneratrixCount = 0;
  let shellVerticalEdgeCount = 0;

  const entitiesById = new Map<string, Entity>();
  for (const e of entities) entitiesById.set(e.id, e);

  for (const body of scene.bodies) {
    const srcEntity = entitiesById.get(body.entityId);
    const rot = body.rotation3D ?? { rxDeg: 0, ryDeg: 0, rzDeg: 0 };
    const uBody = rotateDirCad3D({ x: 1, y: 0, z: 0 }, rot);
    const vBody = rotateDirCad3D({ x: 0, y: 1, z: 0 }, rot);

    const hasShell =
      (body.shellWallThicknessMm ?? 0) > 0.05 || (body.shellThicknessMm ?? 0) > 0.05;

    const topLoopEdge = body.edges.find((e) => e.edgeId.endsWith("_edge_top_loop"));
    const botLoopEdge = body.edges.find((e) => e.edgeId.endsWith("_edge_bot_loop"));

    // 1. Classifica arestas explícitas existentes no DirectBody3D
    const innerTopByIdx = new Map<number, DirectEdge3D>();
    const innerBotByIdx = new Map<number, DirectEdge3D>();

    for (const edge of body.edges) {
      if (edge.role === "inner_top") {
        innerTopByIdx.set(edge.edgeIndex, edge);
      } else if (edge.role === "inner_bottom") {
        innerBotByIdx.set(edge.edgeIndex, edge);
      }
    }

    for (const edge of body.edges) {
      const pts = edge.polyline3D;
      if (!pts || pts.length < 2) continue;

      const isClosedLoop =
        edge.edgeId.endsWith("_loop") ||
        edge.role === "inner_top" ||
        edge.role === "inner_bottom";

      if (edge.role === "top" || edge.role === "bottom") {
        // Borda externa superior/inferior: Contorno Primário (2.0px) + Ocluível (Raio-X)
        appendPolylineSegments3D(outerContourArr, pts, isClosedLoop, convertToThreeZUp);
        appendPolylineSegments3D(occludableArr, pts, isClosedLoop, convertToThreeZUp);
      } else if (edge.role === "vertical") {
        // Quinas verticais vivas (ou costuras de esquadria): Contorno Primário (2.0px) + Ocluível
        appendPolylineSegments3D(outerContourArr, pts, false, convertToThreeZUp);
        appendPolylineSegments3D(occludableArr, pts, false, convertToThreeZUp);
      } else if (edge.role === "inner_top" || edge.role === "inner_bottom") {
        // Bordas superiores/inferiores de cavidades Shell e Furos: Feature/Espessura (1.35px) + Ocluível
        appendPolylineSegments3D(featureThicknessArr, pts, true, convertToThreeZUp);
        appendPolylineSegments3D(occludableArr, pts, true, convertToThreeZUp);
      } else {
        appendPolylineSegments3D(internalDetailArr, pts, isClosedLoop, convertToThreeZUp);
        appendPolylineSegments3D(occludableArr, pts, isClosedLoop, convertToThreeZUp);
      }
    }

    // Helper para emitir Geratrizes Cardeais (0°, 90°, 180°, 270°) + 2 Geratrizes de Silhueta + Eixo Central
    const emitCylinderOrHoleGeneratricesAndAxis = (
      topLoop: Vec3Mm[],
      botLoop: Vec3Mm[],
      topCircle: LoopCircleAnalysis3D,
      botCircle: LoopCircleAnalysis3D,
      isOuterCylinder: boolean,
    ) => {
      const cTop = topCircle.center;
      const cBot = botCircle.center;
      const axisVec = sub3(cTop, cBot);
      const heightMm = len3(axisVec);
      if (heightMm < 0.05) return;

      const axisUnit = norm3(axisVec, { x: 0, y: 0, z: 1 });
      // Base radial ortonormal alinhada aos quadrantes cardeais da peça
      let radU = sub3(uBody, scale3(axisUnit, dot3(uBody, axisUnit)));
      if (len3(radU) < 1e-4) {
        radU = sub3(vBody, scale3(axisUnit, dot3(vBody, axisUnit)));
      }
      radU = norm3(radU, { x: 1, y: 0, z: 0 });
      const radV = norm3(cross3(axisUnit, radU), { x: 0, y: 1, z: 0 });

      const rTop = Math.max(0.2, topCircle.radiusMm);
      const rBot = Math.max(0.2, botCircle.radiusMm);

      circularFeatureCount++;
      if (!isOuterCylinder) {
        holeFeatureCount++;
      }

      // 4 Geratrizes Axiais Cardeais: 0° (+U), 90° (+V), 180° (-U), 270° (-V)
      const cardinalDirs: Vec3Mm[] = [
        radU,
        radV,
        scale3(radU, -1),
        scale3(radV, -1),
      ];
      for (const dir of cardinalDirs) {
        const pTop = closestLoopPointInDirection3D(topLoop, cTop, dir, rTop);
        const pBot = closestLoopPointInDirection3D(botLoop, cBot, dir, rBot);
        if (appendSegment3D(featureThicknessArr, pBot, pTop, convertToThreeZUp)) {
          cardinalGeneratrixCount++;
        }
        appendSegment3D(occludableArr, pBot, pTop, convertToThreeZUp);
      }

      // 2 Geratrizes de Silhueta Lateral Dependentes da Vista (tangent = normalize(viewDir × axisUnit))
      const silCross = cross3(viewDir, axisUnit);
      if (len3(silCross) > 1e-3) {
        const silDirPos = norm3(silCross);
        const silDirNeg = scale3(silDirPos, -1);
        for (const sDir of [silDirPos, silDirNeg]) {
          // Evita duplicar exatamente em cima de uma geratriz cardeal se coincidirem (< 3°)
          const overlapsCardinal = cardinalDirs.some((cd) => dot3(cd, sDir) > 0.9985);
          const pTop = closestLoopPointInDirection3D(topLoop, cTop, sDir, rTop);
          const pBot = closestLoopPointInDirection3D(botLoop, cBot, sDir, rBot);
          const targetArr = isOuterCylinder ? outerContourArr : featureThicknessArr;
          if (!overlapsCardinal || isOuterCylinder) {
            if (appendSegment3D(targetArr, pBot, pTop, convertToThreeZUp)) {
              silhouetteGeneratrixCount++;
            }
            appendSegment3D(occludableArr, pBot, pTop, convertToThreeZUp);
          } else {
            silhouetteGeneratrixCount++;
          }
        }
      }

      // Linha de Centro Axial + Marca de Cruz `+` no Plano Superior (Camada 5: Eixos/Centros)
      const extMm = Math.min(8, Math.max(2, heightMm * 0.22));
      const axisStart = add3(cBot, scale3(axisUnit, -extMm));
      const axisEnd = add3(cTop, scale3(axisUnit, extMm));
      appendSegment3D(centerlineArr, axisStart, axisEnd, convertToThreeZUp);

      const crossArmMm = Math.min(Math.max(2.5, rTop * 0.34), Math.max(3, rTop * 0.78));
      appendSegment3D(
        centerlineArr,
        add3(cTop, scale3(radU, -crossArmMm)),
        add3(cTop, scale3(radU, crossArmMm)),
        convertToThreeZUp,
      );
      appendSegment3D(
        centerlineArr,
        add3(cTop, scale3(radV, -crossArmMm)),
        add3(cTop, scale3(radV, crossArmMm)),
        convertToThreeZUp,
      );
    };

    // 2. Cilindro / Flange Externo (quando possui _edge_top_loop e _edge_bot_loop)
    if (topLoopEdge && botLoopEdge) {
      const topC = analyzeClosedLoopCircularity3D(topLoopEdge.polyline3D);
      const botC = analyzeClosedLoopCircularity3D(botLoopEdge.polyline3D);
      if (topC.isCircular && botC.isCircular) {
        emitCylinderOrHoleGeneratricesAndAxis(
          topLoopEdge.polyline3D,
          botLoopEdge.polyline3D,
          topC,
          botC,
          true,
        );
      } else {
        // Garante que todas as quinas vivas (>= 12°) do contorno tenham sua aresta vertical de espessura conectando base e topo
        const tClean = cleanClosedLoopPoints3D(topLoopEdge.polyline3D);
        const bClean = cleanClosedLoopPoints3D(botLoopEdge.polyline3D);
        if (tClean.length === bClean.length && tClean.length >= 3) {
          const existingVertEdges = body.edges.filter((e) => e.role === "vertical");
          const sharpIdx = extractSharpCornerIndicesFromLoop3D(tClean, creaseDeg);
          for (const idx of sharpIdx) {
            const pT = tClean[idx]!;
            const pB = bClean[idx]!;
            const alreadyEmitted = existingVertEdges.some((ve) => {
              const v0 = ve.polyline3D[0];
              const v1 = ve.polyline3D[ve.polyline3D.length - 1];
              if (!v0 || !v1) return false;
              return (
                (len3(sub3(v0, pB)) < 0.25 && len3(sub3(v1, pT)) < 0.25) ||
                (len3(sub3(v0, pT)) < 0.25 && len3(sub3(v1, pB)) < 0.25)
              );
            });
            if (!alreadyEmitted) {
              appendSegment3D(featureThicknessArr, pB, pT, convertToThreeZUp);
              appendSegment3D(occludableArr, pB, pT, convertToThreeZUp);
            }
          }
        }
      }
    } else if (srcEntity?.type === "circle" && body.edges.length >= 2) {
      // Fallback para cilindros vindos do kernel paramétrico (Revolve / Cilindro)
      const topEdges = body.edges.filter((e) => e.role === "top" && e.polyline3D.length >= 8);
      const botEdges = body.edges.filter((e) => e.role === "bottom" && e.polyline3D.length >= 8);
      if (topEdges[0] && botEdges[0]) {
        const topC = analyzeClosedLoopCircularity3D(topEdges[0].polyline3D);
        const botC = analyzeClosedLoopCircularity3D(botEdges[0].polyline3D);
        if (topC.isCircular && botC.isCircular) {
          emitCylinderOrHoleGeneratricesAndAxis(
            topEdges[0].polyline3D,
            botEdges[0].polyline3D,
            topC,
            botC,
            true,
          );
        }
      }
    }

    // 3. Cavidades Internas Pareadas (`inner_top` <-> `inner_bottom`): Furos Passantes e Paredes Shell
    const processedInnerCenters2D: Array<{ x: number; y: number; r: number }> = [];
    for (const [hIdx, iTopEdge] of innerTopByIdx.entries()) {
      const iBotEdge = innerBotByIdx.get(hIdx);
      if (!iBotEdge) continue;

      const topC = analyzeClosedLoopCircularity3D(iTopEdge.polyline3D);
      const botC = analyzeClosedLoopCircularity3D(iBotEdge.polyline3D);

      if (topC.isCircular && botC.isCircular) {
        const isShellTubeInner = hasShell && hIdx === 0 && srcEntity?.type === "circle";
        emitCylinderOrHoleGeneratricesAndAxis(
          iTopEdge.polyline3D,
          iBotEdge.polyline3D,
          topC,
          botC,
          false,
        );
        if (isShellTubeInner) {
          shellVerticalEdgeCount += 4;
        }
        processedInnerCenters2D.push({
          x: topC.center.x,
          y: topC.center.y,
          r: topC.radiusMm,
        });
      } else {
        // Cavidade prismática/poligonal (ex.: Shell de Tubo Metalon retangular ou rasgo quadrado):
        // Conecta todas as quinas vivas correspondentes entre o topo interno e a base interna!
        const tPts = cleanClosedLoopPoints3D(iTopEdge.polyline3D);
        const bPts = cleanClosedLoopPoints3D(iBotEdge.polyline3D);
        const nMin = Math.min(tPts.length, bPts.length);
        if (nMin >= 3) {
          const cornerIndices =
            nMin <= 12
              ? Array.from({ length: nMin }, (_, k) => k)
              : extractSharpCornerIndicesFromLoop3D(tPts, creaseDeg);
          for (const k of cornerIndices) {
            if (appendSegment3D(featureThicknessArr, bPts[k]!, tPts[k]!, convertToThreeZUp)) {
              shellVerticalEdgeCount++;
            }
            appendSegment3D(occludableArr, bPts[k]!, tPts[k]!, convertToThreeZUp);
          }
        }
      }
    }

    // 4. Degraus Internos de Furos 3D Paramétricos (Rebaixo Counterbore, Escareado Countersink e Furos Cegos)
    const rawHoles = Array.isArray(srcEntity?.params?.holes3D)
      ? (srcEntity.params.holes3D as HoleParamEntry3D[])
      : [];
    if (rawHoles.length > 0) {
      const zTopLocal = body.elevationZ + body.extrudeHeightMm;
      const zBotLocal = body.elevationZ;
      const axisUnit = rotateDirCad3D({ x: 0, y: 0, z: 1 }, rot);

      for (const h of rawHoles) {
        const hx = Number(h.x ?? h.center2D?.x);
        const hy = Number(h.y ?? h.center2D?.y);
        const diam = Number(h.diameterMm ?? 0);
        if (!Number.isFinite(hx) || !Number.isFinite(hy) || diam <= 0.2) continue;
        const rMain = diam * 0.5;

        const cTopWorld = rotatePointAroundPivotCad3D(
          { x: hx, y: hy, z: zTopLocal },
          body.pivot3D,
          rot,
        );

        const alreadyMatchedThrough = processedInnerCenters2D.some(
          (pc) => Math.hypot(pc.x - cTopWorld.x, pc.y - cTopWorld.y) < Math.max(1.5, rMain * 0.35),
        );

        // Se for furo cego não capturado como par inner_top/inner_bottom:
        if (!alreadyMatchedThrough) {
          const depth =
            h.throughAll === false && Number.isFinite(Number(h.depthMm))
              ? Math.min(body.extrudeHeightMm, Math.max(0.5, Number(h.depthMm)))
              : body.extrudeHeightMm;
          const zFloorLocal = Math.max(zBotLocal, zTopLocal - depth);
          const cFloorWorld = rotatePointAroundPivotCad3D(
            { x: hx, y: hy, z: zFloorLocal },
            body.pivot3D,
            rot,
          );
          const topRing = buildCircleRingPoints3D(cTopWorld, uBody, vBody, rMain, 32);
          const botRing = buildCircleRingPoints3D(cFloorWorld, uBody, vBody, rMain, 32);

          appendPolylineSegments3D(featureThicknessArr, topRing, true, convertToThreeZUp);
          appendPolylineSegments3D(occludableArr, topRing, true, convertToThreeZUp);
          appendPolylineSegments3D(internalDetailArr, botRing, true, convertToThreeZUp);
          appendPolylineSegments3D(occludableArr, botRing, true, convertToThreeZUp);

          emitCylinderOrHoleGeneratricesAndAxis(
            topRing,
            botRing,
            { isCircular: true, center: cTopWorld, radiusMm: rMain, normal: axisUnit },
            { isCircular: true, center: cFloorWorld, radiusMm: rMain, normal: axisUnit },
            false,
          );
        }

        // Anel de degrau para Counterbore / Countersink (Camada 3: Detalhe Interno 0.95px)
        if (h.holeType === "counterbore" && Number(h.counterboreDiameterMm) > diam) {
          const rCb = Number(h.counterboreDiameterMm) * 0.5;
          const dCb = Math.min(
            body.extrudeHeightMm * 0.9,
            Math.max(0.5, Number(h.counterboreDepthMm ?? rMain * 0.8)),
          );
          const cCbTop = cTopWorld;
          const cCbStep = rotatePointAroundPivotCad3D(
            { x: hx, y: hy, z: zTopLocal - dCb },
            body.pivot3D,
            rot,
          );
          const cbTopRing = buildCircleRingPoints3D(cCbTop, uBody, vBody, rCb, 32);
          const cbStepRing = buildCircleRingPoints3D(cCbStep, uBody, vBody, rCb, 32);
          appendPolylineSegments3D(internalDetailArr, cbTopRing, true, convertToThreeZUp);
          appendPolylineSegments3D(internalDetailArr, cbStepRing, true, convertToThreeZUp);
          appendPolylineSegments3D(occludableArr, cbStepRing, true, convertToThreeZUp);
        } else if (h.holeType === "countersink" && Number(h.countersinkDiameterMm) > diam) {
          const rCs = Number(h.countersinkDiameterMm) * 0.5;
          const csTopRing = buildCircleRingPoints3D(cTopWorld, uBody, vBody, rCs, 32);
          appendPolylineSegments3D(internalDetailArr, csTopRing, true, convertToThreeZUp);
        }
      }
    }

    // 5. Arestas de Corte 45° (Meia-Esquadria) se presentes nas faces `role === "miter"`
    for (const face of body.faces) {
      if (face.role === "miter" && face.polygon3D.length >= 3) {
        appendPolylineSegments3D(featureThicknessArr, face.polygon3D, true, convertToThreeZUp);
        appendPolylineSegments3D(occludableArr, face.polygon3D, true, convertToThreeZUp);
      }
    }
  }

  return {
    outerContourPositions: new Float32Array(outerContourArr),
    featureThicknessPositions: new Float32Array(featureThicknessArr),
    internalDetailPositions: new Float32Array(internalDetailArr),
    allOccludablePositions: new Float32Array(occludableArr),
    centerlineAxisPositions: new Float32Array(centerlineArr),
    diagnostics: {
      bodyCount: scene.bodies.length,
      outerContourSegmentCount: Math.floor(outerContourArr.length / 6),
      featureThicknessSegmentCount: Math.floor(featureThicknessArr.length / 6),
      internalDetailSegmentCount: Math.floor(internalDetailArr.length / 6),
      occludableSegmentCount: Math.floor(occludableArr.length / 6),
      centerlineSegmentCount: Math.floor(centerlineArr.length / 6),
      circularFeatureCount,
      holeFeatureCount,
      cardinalGeneratrixCount,
      silhouetteGeneratrixCount,
      shellVerticalEdgeCount,
      flatFaceDiagonalCount: 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Extrator de Cotas Técnicas Seletivas em Espaço de Tela (Modo ARAME)        */
/* -------------------------------------------------------------------------- */

function formatCadMm(val: number): string {
  const rounded1 = Math.round(val * 10) / 10;
  if (Math.abs(rounded1 - Math.round(rounded1)) < 0.05) {
    return `${Math.round(rounded1)}`;
  }
  return rounded1.toFixed(1);
}

export function extractBRepTechnicalCallouts3D(
  scene: DirectTopology3DScene,
  entities: Entity[],
  focusedBodyIds?: string[],
): BRepTechnicalCallout3D[] {
  if (scene.bodies.length === 0) return [];

  const entitiesById = new Map<string, Entity>();
  for (const e of entities) entitiesById.set(e.id, e);

  const focusedSet =
    focusedBodyIds && focusedBodyIds.length > 0 ? new Set(focusedBodyIds) : null;

  // Se houver seleção ativa, cota os corpos selecionados (até 3); caso contrário, cota a peça principal (até 2)
  const targetBodies: DirectBody3D[] = focusedSet
    ? scene.bodies.filter((b) => focusedSet.has(b.bodyId)).slice(0, 3)
    : scene.bodies.slice(0, 2);

  const callouts: BRepTechnicalCallout3D[] = [];

  for (const body of targetBodies) {
    const srcEntity = entitiesById.get(body.entityId);
    const b = body.bbox3D;
    const center: Vec3Mm = {
      x: (b.minX + b.maxX) * 0.5,
      y: (b.minY + b.maxY) * 0.5,
      z: (b.minZ + b.maxZ) * 0.5,
    };

    const shellT = Math.max(body.shellWallThicknessMm ?? 0, body.shellThicknessMm ?? 0);
    const hasShell = shellT > 0.05;

    // Detecta se é cilindro/flange circular
    const topLoop = body.edges.find((e) => e.edgeId.endsWith("_edge_top_loop"));
    const outerCircle = topLoop ? analyzeClosedLoopCircularity3D(topLoop.polyline3D) : null;
    const isCircularBody =
      Boolean(outerCircle?.isCircular) || srcEntity?.type === "circle";

    // Analisa furos circulares internos (excluindo parede interna de Shell tubular)
    const innerTopEdges = body.edges.filter((e) => e.role === "inner_top");
    const holeDiameters: Array<{ diamMm: number; anchor: Vec3Mm }> = [];
    for (const ie of innerTopEdges) {
      if (hasShell && ie.edgeIndex === 0) continue;
      const cInfo = analyzeClosedLoopCircularity3D(ie.polyline3D);
      if (cInfo.isCircular && cInfo.radiusMm > 0.25) {
        holeDiameters.push({
          diamMm: cInfo.radiusMm * 2,
          anchor: ie.polyline3D[0] ?? cInfo.center,
        });
      }
    }
    const rawParamHoles = Array.isArray(srcEntity?.params?.holes3D)
      ? (srcEntity.params.holes3D as HoleParamEntry3D[])
      : [];
    for (const ph of rawParamHoles) {
      const hx = Number(ph.x ?? ph.center2D?.x);
      const hy = Number(ph.y ?? ph.center2D?.y);
      const diam = Number(ph.diameterMm ?? 0);
      if (!Number.isFinite(hx) || !Number.isFinite(hy) || diam <= 0.2) continue;
      const alreadyListed = holeDiameters.some(
        (hd) =>
          Math.abs(hd.diamMm - diam) < 0.5 &&
          Math.hypot(hd.anchor.x - hx, hd.anchor.y - hy) <= diam,
      );
      if (!alreadyListed) {
        holeDiameters.push({
          diamMm: diam,
          anchor: { x: hx + diam * 0.5, y: hy, z: b.maxZ },
        });
      }
    }

    // 1. Cota de Espessura Física (`e = {h} mm` ou `Parede t = {t} mm`)
    if (hasShell) {
      const innerEdge = body.edges.find((e) => e.role === "inner_top");
      const anchor = innerEdge?.midpoint ?? {
        x: b.maxX,
        y: center.y,
        z: b.maxZ,
      };
      callouts.push({
        id: `${body.bodyId}_callout_wall`,
        bodyId: body.bodyId,
        kind: "thickness",
        text: `Parede t = ${formatCadMm(shellT)} mm`,
        anchor3D: anchor,
        leaderDir3D: norm3({ x: 0.7, y: -0.5, z: 0.5 }),
      });
    } else {
      const dims = [
        { val: body.deltaX, axis: "x" as const },
        { val: body.deltaY, axis: "y" as const },
        { val: body.deltaZ, axis: "z" as const },
      ].filter((d) => d.val > 0.05);
      const minDim = dims.reduce(
        (acc, cur) => (cur.val < acc.val ? cur : acc),
        { val: body.extrudeHeightMm, axis: "z" as const },
      );
      const thicknessVal = isCircularBody ? body.extrudeHeightMm : minDim.val;
      const vertEdge = body.edges.find((e) => e.role === "vertical");
      const thicknessAnchor: Vec3Mm = vertEdge
        ? vertEdge.midpoint
        : {
            x: b.maxX,
            y: center.y,
            z: (b.minZ + b.maxZ) * 0.5,
          };
      callouts.push({
        id: `${body.bodyId}_callout_thickness`,
        bodyId: body.bodyId,
        kind: "thickness",
        text: `e = ${formatCadMm(thicknessVal)} mm`,
        anchor3D: thicknessAnchor,
        leaderDir3D: norm3({ x: 0.85, y: 0.25, z: 0.35 }),
      });
    }

    // 2. Cota de Dimensões Principais / Envelope (`Ø Ext` ou `L × A × H`)
    if (isCircularBody) {
      const outerDiam =
        outerCircle && outerCircle.radiusMm > 0
          ? outerCircle.radiusMm * 2
          : Math.max(body.deltaX, body.deltaY);
      const envAnchor: Vec3Mm = topLoop?.polyline3D[Math.floor((topLoop.polyline3D.length || 4) / 4)] ?? {
        x: center.x,
        y: b.minY,
        z: b.maxZ,
      };
      callouts.push({
        id: `${body.bodyId}_callout_envelope`,
        bodyId: body.bodyId,
        kind: "envelope",
        text: hasShell
          ? `Ø ${formatCadMm(outerDiam)} × ${formatCadMm(body.extrudeHeightMm)} mm`
          : `Ø ${formatCadMm(outerDiam)} mm`,
        anchor3D: envAnchor,
        leaderDir3D: norm3({ x: -0.75, y: -0.55, z: 0.35 }),
      });
    } else {
      const sortedDims = [body.deltaX, body.deltaY, body.deltaZ].sort((a, c) => c - a);
      const topEdge = body.edges.find((e) => e.role === "top");
      const envAnchor: Vec3Mm = topEdge?.midpoint ?? {
        x: b.minX,
        y: b.minY,
        z: b.maxZ,
      };
      callouts.push({
        id: `${body.bodyId}_callout_envelope`,
        bodyId: body.bodyId,
        kind: "envelope",
        text: `${formatCadMm(sortedDims[0] ?? 0)} × ${formatCadMm(sortedDims[1] ?? 0)} × ${formatCadMm(sortedDims[2] ?? 0)} mm`,
        anchor3D: envAnchor,
        leaderDir3D: norm3({ x: -0.7, y: -0.6, z: 0.4 }),
      });
    }

    // 3. Cota de Furos (`N × Ø {d} mm`) agrupados por diâmetro real
    if (holeDiameters.length > 0) {
      const groups: Array<{ diamMm: number; count: number; anchor: Vec3Mm }> = [];
      for (const h of holeDiameters) {
        const existing = groups.find((g) => Math.abs(g.diamMm - h.diamMm) <= 0.2);
        if (existing) {
          existing.count += 1;
        } else {
          groups.push({ diamMm: h.diamMm, count: 1, anchor: h.anchor });
        }
      }
      // Exibe até 2 famílias distintas de furos por peça (ex.: furo central + furos de fixação)
      groups
        .sort((a, c) => c.count - a.count || c.diamMm - a.diamMm)
        .slice(0, 2)
        .forEach((grp, gIdx) => {
          const label =
            grp.count > 1
              ? `${grp.count} × Ø ${formatCadMm(grp.diamMm)} mm`
              : `Ø ${formatCadMm(grp.diamMm)} mm`;
          callouts.push({
            id: `${body.bodyId}_callout_holes_${gIdx}`,
            bodyId: body.bodyId,
            kind: "holes",
            text: label,
            anchor3D: grp.anchor,
            leaderDir3D: norm3({
              x: gIdx % 2 === 0 ? 0.72 : -0.72,
              y: gIdx % 2 === 0 ? -0.58 : 0.58,
              z: 0.38,
            }),
          });
        });
    }
  }

  return callouts;
}

/**
 * Posiciona os rótulos de cota em espaço de tela (`11px` mono) com linha de chamada (leader line)
 * e repulsão vertical determinística anti-colisão para nunca sobrepor textos nem sair da tela.
 */
export function layoutScreenSpaceCallouts2D(
  callouts: BRepTechnicalCallout3D[],
  project3DToScreenPx: (pt: Vec3Mm) => { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
): ScreenSpaceCalloutLayoutItem[] {
  if (callouts.length === 0 || viewportWidth < 120 || viewportHeight < 120) return [];

  const marginX = 14;
  const marginTop = 58;
  const marginBottom = 72;
  const placedBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const out: ScreenSpaceCalloutLayoutItem[] = [];

  callouts.forEach((c, idx) => {
    const anchorPx = project3DToScreenPx(c.anchor3D);
    if (
      !Number.isFinite(anchorPx.x) ||
      !Number.isFinite(anchorPx.y) ||
      anchorPx.x < -80 ||
      anchorPx.x > viewportWidth + 80 ||
      anchorPx.y < -80 ||
      anchorPx.y > viewportHeight + 80
    ) {
      return;
    }

    const dirSamplePx = project3DToScreenPx(add3(c.anchor3D, scale3(c.leaderDir3D, 20)));
    let dx = dirSamplePx.x - anchorPx.x;
    let dy = dirSamplePx.y - anchorPx.y;
    const dLen = Math.hypot(dx, dy);
    if (dLen < 2) {
      const angle = ((idx * 115 - 35) * Math.PI) / 180;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    } else {
      dx /= dLen;
      dy /= dLen;
    }

    const widthPx = Math.max(76, Math.round(c.text.length * 6.9 + 16));
    const heightPx = 22;
    const leaderLen = 28 + (idx % 2) * 10;

    let rawX = anchorPx.x + dx * leaderLen;
    let rawY = anchorPx.y + dy * leaderLen;

    const align: "left" | "right" = dx >= 0 ? "left" : "right";
    let boxLeft = align === "left" ? rawX + 8 : rawX - 8 - widthPx;
    let boxTop = rawY - heightPx * 0.5;

    // Clamping nas bordas úteis do viewport
    boxLeft = Math.max(marginX, Math.min(viewportWidth - marginX - widthPx, boxLeft));
    boxTop = Math.max(marginTop, Math.min(viewportHeight - marginBottom - heightPx, boxTop));

    // Resolução iterativa anti-colisão vertical entre cotas
    for (let iter = 0; iter < 8; iter++) {
      const hit = placedBoxes.find(
        (b) =>
          boxLeft < b.right + 6 &&
          boxLeft + widthPx > b.left - 6 &&
          boxTop < b.bottom + 5 &&
          boxTop + heightPx > b.top - 5,
      );
      if (!hit) break;
      const pushDown = hit.bottom + 6;
      const pushUp = hit.top - heightPx - 6;
      if (pushDown + heightPx <= viewportHeight - marginBottom) {
        boxTop = pushDown;
      } else if (pushUp >= marginTop) {
        boxTop = pushUp;
      } else {
        boxTop = Math.max(marginTop, Math.min(viewportHeight - marginBottom - heightPx, boxTop + 24));
      }
    }

    const finalCenterY = boxTop + heightPx * 0.5;
    const elbowX = align === "left" ? boxLeft - 6 : boxLeft + widthPx + 6;

    placedBoxes.push({
      left: boxLeft,
      top: boxTop,
      right: boxLeft + widthPx,
      bottom: boxTop + heightPx,
    });

    out.push({
      ...c,
      anchorPx,
      elbowPx: { x: elbowX, y: finalCenterY },
      labelPx: { x: boxLeft, y: boxTop },
      widthPx,
      heightPx,
      align,
    });
  });

  return out;
}
