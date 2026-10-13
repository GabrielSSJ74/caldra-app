/**
 * CALDRA CHAMFER — SISTEMA DE DESENHO ISOMÉTRICO 2D PROFISSIONAL
 *
 * Motor geométrico de projeção isométrica 2D sem deformação arbitrária de cotas:
 * - 3 Planos Isométricos Canônicos: Superior (Isotop), Esquerdo (Isoleft), Direito (Isoright)
 * - Eixos canônicos: 30°, 90°, 150°
 * - Grade e cursor geométrico isométrico
 * - Isocírculos e furos com elipses projetadas exatas (rx = r*√1.5, ry = r*√0.5, rotações 0°, -60°, +60°)
 * - Preservação de dimensões reais (escala 1:1 ao longo dos eixos isométricos)
 * - Compatível com Command System, desfazer/refazer, cotas e ABNT NBR 17068 / 16861
 */

import type { Vec2 } from "@/lib/geometry/types";
import type { Entity, LayerId } from "@/lib/lab2d/core";
import { uid, dist } from "@/lib/lab2d/core";
import { makeDimension, type Dimension } from "@/lib/lab2d/dimensions";

export type IsoPlane = "top" | "left" | "right";
export type DrawingProjectionMode = "orthographic" | "isometric";

export interface IsoPlaneConfig {
  id: IsoPlane;
  label: string;
  name: string;
  description: string;
  /** Ângulos dos eixos no plano (graus matemáticos) */
  axisAnglesDeg: [number, number];
  /** Vetores diretores unitários no espaço 2D de tela/canvas */
  uDir: Vec2;
  vDir: Vec2;
  /** Ângulo da elipse do isocírculo (graus no SVG) */
  ellipseRotationDeg: number;
  /** Cor do plano no HUD */
  accentColor: string;
}

// Fatores canônicos de escala do isocírculo em projeção isométrica 2D
export const ISO_SQRT_1_5 = Math.sqrt(1.5); // ~1.224744871
export const ISO_SQRT_0_5 = Math.sqrt(0.5); // ~0.707106781
export const ISO_ASPECT_RATIO = Math.sqrt(1 / 3); // ~0.577350269 (ry / rx)

// Vetores canônicos dos eixos isométricos (30°, 150°, 90° vertical)
// Observação: No canvas/SVG, Y cresce para baixo (+Y = para baixo, -Y = para cima).
export const ISO_AXIS_VECTORS = {
  axis30: { x: Math.cos(Math.PI / 6), y: -Math.sin(Math.PI / 6) }, // (√3/2, -0.5)
  axis150: { x: Math.cos((5 * Math.PI) / 6), y: -Math.sin((5 * Math.PI) / 6) }, // (-√3/2, -0.5)
  axis90: { x: 0, y: -1 }, // Vertical para cima
  axis210: { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) },
  axis330: { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) },
  axis270: { x: 0, y: 1 }, // Vertical para baixo
} as const;

export const ISO_PLANES: Record<IsoPlane, IsoPlaneConfig> = {
  top: {
    id: "top",
    label: "SUPERIOR",
    name: "Plano Superior (Isotop)",
    description: "Eixos a 30° e 150° (Largura × Comprimento)",
    axisAnglesDeg: [30, 150],
    uDir: ISO_AXIS_VECTORS.axis30,
    vDir: ISO_AXIS_VECTORS.axis150,
    ellipseRotationDeg: 0,
    accentColor: "#38BDF8", // Sky/Cyan
  },
  left: {
    id: "left",
    label: "ESQUERDO",
    name: "Plano Esquerdo (Isoleft)",
    description: "Eixos a 150° e 90° (Comprimento × Altura)",
    axisAnglesDeg: [150, 90],
    uDir: ISO_AXIS_VECTORS.axis150,
    vDir: ISO_AXIS_VECTORS.axis90,
    ellipseRotationDeg: -60, // ou 120°
    accentColor: "#F59E0B", // Amber
  },
  right: {
    id: "right",
    label: "DIREITO",
    name: "Plano Direito (Isoright)",
    description: "Eixos a 30° e 90° (Largura × Altura)",
    axisAnglesDeg: [30, 90],
    uDir: ISO_AXIS_VECTORS.axis30,
    vDir: ISO_AXIS_VECTORS.axis90,
    ellipseRotationDeg: 60,
    accentColor: "#EC4899", // Rose
  },
};

export interface IsoEntityMeta {
  isIso?: boolean;
  plane?: IsoPlane;
  sourceKind?: "line" | "rect" | "circle" | "hole" | "arc" | "polygon";
  realRadius?: number;
  realDiameter?: number;
  realWidth?: number;
  realHeight?: number;
  realLength?: number;
}

/**
 * Converte coordenadas locais (u, v) em milímetros de um plano isométrico para o espaço 2D do canvas.
 */
export function isoPlaneToCanvas(
  plane: IsoPlane,
  u: number,
  v: number,
  origin: Vec2 = { x: 0, y: 0 },
): Vec2 {
  const cfg = ISO_PLANES[plane];
  return {
    x: origin.x + u * cfg.uDir.x + v * cfg.vDir.x,
    y: origin.y + u * cfg.uDir.y + v * cfg.vDir.y,
  };
}

/**
 * Inverte ponto 2D do canvas para coordenadas locais (u, v) no plano isométrico especificado.
 */
export function canvasToIsoPlane(
  plane: IsoPlane,
  p: Vec2,
  origin: Vec2 = { x: 0, y: 0 },
): { u: number; v: number } {
  const cfg = ISO_PLANES[plane];
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const det = cfg.uDir.x * cfg.vDir.y - cfg.uDir.y * cfg.vDir.x;
  if (Math.abs(det) < 1e-9) return { u: dx, v: dy };
  const u = (dx * cfg.vDir.y - dy * cfg.vDir.x) / det;
  const v = (cfg.uDir.x * dy - cfg.uDir.y * dx) / det;
  return { u, v };
}

/**
 * Restringe o deslocamento do cursor aos eixos isométricos do plano ativo (Orto Isométrico / Isosnap).
 */
export function constrainToIsoAxes(from: Vec2, to: Vec2, plane: IsoPlane): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distTotal = Math.hypot(dx, dy);
  if (distTotal < 0.1) return to;

  const cfg = ISO_PLANES[plane];
  // Candidatos de eixos (ambas as direções positiva e negativa)
  const candidateDirs: Vec2[] = [
    cfg.uDir,
    { x: -cfg.uDir.x, y: -cfg.uDir.y },
    cfg.vDir,
    { x: -cfg.vDir.x, y: -cfg.vDir.y },
  ];

  let bestDir = candidateDirs[0]!;
  let bestDot = -Infinity;

  for (const dir of candidateDirs) {
    const dot = (dx * dir.x + dy * dir.y) / distTotal;
    if (dot > bestDot) {
      bestDot = dot;
      bestDir = dir;
    }
  }

  const projDist = dx * bestDir.x + dy * bestDir.y;
  return {
    x: from.x + bestDir.x * projDist,
    y: from.y + bestDir.y * projDist,
  };
}

/**
 * Snapping em grade isométrica (passos regulares ao longo dos eixos isométricos).
 */
export function snapToIsoGrid(
  cursor: Vec2,
  gridStep: number,
  plane: IsoPlane,
  origin: Vec2 = { x: 0, y: 0 },
): Vec2 {
  const g = Math.max(0.5, gridStep);
  const { u, v } = canvasToIsoPlane(plane, cursor, origin);
  const snappedU = Math.round(u / g) * g;
  const snappedV = Math.round(v / g) * g;
  return isoPlaneToCanvas(plane, snappedU, snappedV, origin);
}

/**
 * Constrói um retângulo isométrico (paralelogramo no plano ativo) a partir de 2 vértices opostos.
 */
export function buildIsoParallelogram(
  plane: IsoPlane,
  p1: Vec2,
  p2: Vec2,
  layer: LayerId,
): Entity {
  const { u: u1, v: v1 } = canvasToIsoPlane(plane, p1);
  const { u: u2, v: v2 } = canvasToIsoPlane(plane, p2);

  const realWidth = Math.abs(u2 - u1);
  const realHeight = Math.abs(v2 - v1);

  const corner1 = p1;
  const corner2 = isoPlaneToCanvas(plane, u2, v1);
  const corner3 = p2;
  const corner4 = isoPlaneToCanvas(plane, u1, v2);

  return {
    id: uid(),
    layer,
    type: "polyline",
    closed: true,
    pts: [corner1, corner2, corner3, corner4],
    params: {
      isIso: true,
      isoPlane: plane,
      sourceKind: "rect",
      realWidth,
      realHeight,
    },
  };
}

/**
 * Constrói um isocírculo no plano selecionado como uma elipse matematicamente exata.
 */
export function buildIsoCircle(
  plane: IsoPlane,
  center: Vec2,
  radius: number,
  layer: LayerId,
  isHole: boolean = false,
): Entity {
  const r = Math.max(0.1, radius);
  const cfg = ISO_PLANES[plane];

  const rx = r * ISO_SQRT_1_5;
  const ry = r * ISO_SQRT_0_5;

  return {
    id: uid(),
    layer,
    type: "ellipse",
    cx: center.x,
    cy: center.y,
    rx,
    ry,
    rotation: (cfg.ellipseRotationDeg * Math.PI) / 180,
    params: {
      isIso: true,
      isoPlane: plane,
      sourceKind: isHole ? "hole" : "circle",
      realRadius: r,
      realDiameter: r * 2,
      isHole,
    },
  };
}

/**
 * Constrói um furo cilíndrico isométrico com contorno frontal, profundidade e linhas de centro ABNT.
 */
export function buildIsoHoleWithDepth(
  plane: IsoPlane,
  center: Vec2,
  diameter: number,
  depth: number,
  layer: LayerId,
  refLayer: LayerId = "referencia",
): Entity[] {
  const r = Math.max(0.1, diameter / 2);
  const cfg = ISO_PLANES[plane];
  const entities: Entity[] = [];

  // 1. Elipse frontal do furo
  const frontCircle = buildIsoCircle(plane, center, r, layer, true);
  entities.push(frontCircle);

  // 2. Se houver profundidade, adiciona borda traseira deslocada pelo vetor normal do plano
  if (depth > 0) {
    const normalDir = getPlaneNormalDir(plane);
    const backCenter: Vec2 = {
      x: center.x + normalDir.x * depth,
      y: center.y + normalDir.y * depth,
    };
    const backCircle = buildIsoCircle(plane, backCenter, r, refLayer, true);
    entities.push(backCircle);
  }

  // 3. Linhas de centro isométricas cruzadas (ABNT NBR 16861:2020)
  const crossLength = r * 1.35;
  const uLineStart = {
    x: center.x - cfg.uDir.x * crossLength,
    y: center.y - cfg.uDir.y * crossLength,
  };
  const uLineEnd = {
    x: center.x + cfg.uDir.x * crossLength,
    y: center.y + cfg.uDir.y * crossLength,
  };
  const vLineStart = {
    x: center.x - cfg.vDir.x * crossLength,
    y: center.y - cfg.vDir.y * crossLength,
  };
  const vLineEnd = {
    x: center.x + cfg.vDir.x * crossLength,
    y: center.y + cfg.vDir.y * crossLength,
  };

  entities.push({
    id: uid(),
    layer: refLayer,
    type: "line",
    x1: uLineStart.x,
    y1: uLineStart.y,
    x2: uLineEnd.x,
    y2: uLineEnd.y,
    isConstruction: true,
  });

  entities.push({
    id: uid(),
    layer: refLayer,
    type: "line",
    x1: vLineStart.x,
    y1: vLineStart.y,
    x2: vLineEnd.x,
    y2: vLineEnd.y,
    isConstruction: true,
  });

  return entities;
}

/**
 * Retorna o vetor normal 2D ao plano isométrico (para profundidade / extrusão isométrica 2D).
 */
export function getPlaneNormalDir(plane: IsoPlane): Vec2 {
  switch (plane) {
    case "top":
      return ISO_AXIS_VECTORS.axis270; // Para baixo (vertical)
    case "left":
      return ISO_AXIS_VECTORS.axis30; // 30°
    case "right":
      return ISO_AXIS_VECTORS.axis150; // 150°
  }
}

/**
 * Gera um suporte técnico com base dobrada e furos em planos distintos.
 * Atende com precisão os critérios de aceitação do CHAMFER para validação do sistema isométrico.
 */
export function buildBentSupportPreset(params?: {
  baseWidth?: number;
  baseLength?: number;
  flangeHeight?: number;
  thickness?: number;
  holeDiameter?: number;
  origin?: Vec2;
}): { entities: Entity[]; dims: Dimension[] } {
  const w = params?.baseWidth ?? 120; // 30° axis (Largura)
  const l = params?.baseLength ?? 80; // 150° axis (Comprimento)
  const h = params?.flangeHeight ?? 60; // 90° axis (Altura vertical)
  const t = params?.thickness ?? 4; // Espessura da chapa
  const dHole = params?.holeDiameter ?? 14;
  const o = params?.origin ?? { x: 0, y: 0 };

  const entities: Entity[] = [];
  const dims: Dimension[] = [];

  // Vetores diretores
  const u30 = ISO_AXIS_VECTORS.axis30;
  const u150 = ISO_AXIS_VECTORS.axis150;
  const u90 = ISO_AXIS_VECTORS.axis90; // vertical (up)
  const uDown = ISO_AXIS_VECTORS.axis270; // vertical (down)

  // 1. BASE HORIZONTAL (Plano Superior)
  const pA = o; // Canto traseiro esquerdo
  const pB = { x: pA.x + u30.x * w, y: pA.y + u30.y * w }; // Canto traseiro direito
  const pC = { x: pB.x + u150.x * l, y: pB.y + u150.y * l }; // Canto frontal direito
  const pD = { x: pA.x + u150.x * l, y: pA.y + u150.y * l }; // Canto frontal esquerdo

  // Base externa
  entities.push({
    id: uid(),
    layer: "corte",
    type: "polyline",
    closed: true,
    pts: [pA, pB, pC, pD],
    params: { isIso: true, isoPlane: "top", sourceKind: "rect", realWidth: w, realHeight: l },
  });

  // Espessura da base (arestas inferiores verticais)
  const pC_inf = { x: pC.x + uDown.x * t, y: pC.y + uDown.y * t };
  const pD_inf = { x: pD.x + uDown.x * t, y: pD.y + uDown.y * t };
  const pB_inf = { x: pB.x + uDown.x * t, y: pB.y + uDown.y * t };

  entities.push({
    id: uid(),
    layer: "corte",
    type: "line",
    x1: pD.x,
    y1: pD.y,
    x2: pD_inf.x,
    y2: pD_inf.y,
  });
  entities.push({
    id: uid(),
    layer: "corte",
    type: "line",
    x1: pC.x,
    y1: pC.y,
    x2: pC_inf.x,
    y2: pC_inf.y,
  });
  entities.push({
    id: uid(),
    layer: "corte",
    type: "line",
    x1: pB.x,
    y1: pB.y,
    x2: pB_inf.x,
    y2: pB_inf.y,
  });
  entities.push({
    id: uid(),
    layer: "corte",
    type: "line",
    x1: pD_inf.x,
    y1: pD_inf.y,
    x2: pC_inf.x,
    y2: pC_inf.y,
  });
  entities.push({
    id: uid(),
    layer: "corte",
    type: "line",
    x1: pC_inf.x,
    y1: pC_inf.y,
    x2: pB_inf.x,
    y2: pB_inf.y,
  });

  // 2. ABA DOBRADA VERTICAL TRASEIRA (Plano Direito - eixos 30° e 90°)
  const pA_top = { x: pA.x + u90.x * h, y: pA.y + u90.y * h };
  const pB_top = { x: pB.x + u90.x * h, y: pB.y + u90.y * h };

  // Linha de dobra (ABNT NBR 16861: camada "dobra", traço-ponto)
  entities.push({
    id: uid(),
    layer: "dobra",
    type: "line",
    x1: pA.x,
    y1: pA.y,
    x2: pB.x,
    y2: pB.y,
    params: { isIso: true, isoPlane: "right", sourceKind: "line", note: "Linha de Dobra R=2mm" },
  });

  // Contorno da aba vertical
  entities.push({
    id: uid(),
    layer: "corte",
    type: "polyline",
    closed: false,
    pts: [pA, pA_top, pB_top, pB],
    params: { isIso: true, isoPlane: "right", sourceKind: "rect", realWidth: w, realHeight: h },
  });

  // Espessura da aba vertical (topo)
  const pA_top_back = { x: pA_top.x - u150.x * t, y: pA_top.y - u150.y * t };
  const pB_top_back = { x: pB_top.x - u150.x * t, y: pB_top.y - u150.y * t };

  entities.push({
    id: uid(),
    layer: "corte",
    type: "polyline",
    closed: false,
    pts: [pA_top, pA_top_back, pB_top_back, pB_top],
  });

  // 3. FUROS NA BASE (Plano Superior - 2 furos de fixação)
  const hole1Center = {
    x: pA.x + u30.x * (w * 0.25) + u150.x * (l * 0.5),
    y: pA.y + u30.y * (w * 0.25) + u150.y * (l * 0.5),
  };
  const hole2Center = {
    x: pA.x + u30.x * (w * 0.75) + u150.x * (l * 0.5),
    y: pA.y + u30.y * (w * 0.75) + u150.y * (l * 0.5),
  };

  entities.push(...buildIsoHoleWithDepth("top", hole1Center, dHole, t, "recorte"));
  entities.push(...buildIsoHoleWithDepth("top", hole2Center, dHole, t, "recorte"));

  // 4. FURO CENTRAL NA ABA VERTICAL (Plano Direito - 1 furo de articulação)
  const holeVertCenter = {
    x: pA.x + u30.x * (w * 0.5) + u90.x * (h * 0.55),
    y: pA.y + u30.y * (w * 0.5) + u90.y * (h * 0.55),
  };
  entities.push(...buildIsoHoleWithDepth("right", holeVertCenter, dHole * 1.5, t, "recorte"));

  // 5. COTAS TÉCNICAS VERIFICÁVEIS
  dims.push(
    makeDimension(
      "aligned",
      [
        { kind: "point", p: pD },
        { kind: "point", p: pC },
      ],
      22,
      { prefix: "L=" },
    ),
  );

  dims.push(
    makeDimension(
      "aligned",
      [
        { kind: "point", p: pD },
        { kind: "point", p: pA },
      ],
      -22,
      { prefix: "C=" },
    ),
  );

  dims.push(
    makeDimension(
      "aligned",
      [
        { kind: "point", p: pA },
        { kind: "point", p: pA_top },
      ],
      -25,
      { prefix: "H=" },
    ),
  );

  return { entities, dims };
}

/**
 * Gera Flange Circular em Projeção Isométrica 2D (Plano Superior ou Direito)
 * com furo central, furação polar PCD, espessura da chapa e cotas técnicas associativas.
 */
export function buildIsoFlangePreset(params?: {
  plane?: IsoPlane;
  outerDia?: number;
  innerDia?: number;
  boltCircleDia?: number;
  numHoles?: number;
  holeDia?: number;
  thickness?: number;
  origin?: Vec2;
}): { entities: Entity[]; dims: Dimension[] } {
  const plane = params?.plane ?? "top";
  const outerDia = params?.outerDia ?? 180;
  const innerDia = params?.innerDia ?? 80;
  const boltCircleDia = params?.boltCircleDia ?? 135;
  const numHoles = params?.numHoles ?? 6;
  const holeDia = params?.holeDia ?? 14;
  const thickness = params?.thickness ?? 12;
  const origin = params?.origin ?? { x: 0, y: 0 };

  const entities: Entity[] = [];
  const dims: Dimension[] = [];
  const cfg = ISO_PLANES[plane];
  const normal = getPlaneNormalDir(plane);

  // 1. Círculo Externo no Plano Isométrico
  const outerCircle = buildIsoCircle(plane, origin, outerDia / 2, "corte", false);
  entities.push(outerCircle);

  // Espessura / Borda inferior (se thickness > 0)
  if (thickness > 0) {
    const bottomOrigin = {
      x: origin.x + normal.x * thickness,
      y: origin.y + normal.y * thickness,
    };
    const bottomOuter = buildIsoCircle(plane, bottomOrigin, outerDia / 2, "corte", false);
    entities.push(bottomOuter);

    // Linhas tangentes conectando as bordas
    const rScaled = (outerDia / 2) * ISO_SQRT_1_5;
    const tangentL1 = {
      x1: origin.x - cfg.uDir.x * rScaled,
      y1: origin.y - cfg.uDir.y * rScaled,
      x2: bottomOrigin.x - cfg.uDir.x * rScaled,
      y2: bottomOrigin.y - cfg.uDir.y * rScaled,
    };
    const tangentL2 = {
      x1: origin.x + cfg.uDir.x * rScaled,
      y1: origin.y + cfg.uDir.y * rScaled,
      x2: bottomOrigin.x + cfg.uDir.x * rScaled,
      y2: bottomOrigin.y + cfg.uDir.y * rScaled,
    };

    entities.push({ id: uid(), layer: "corte", type: "line", ...tangentL1 });
    entities.push({ id: uid(), layer: "corte", type: "line", ...tangentL2 });
  }

  // 2. Furo Central
  if (innerDia > 0) {
    entities.push(...buildIsoHoleWithDepth(plane, origin, innerDia, thickness, "recorte"));
  }

  // 3. Furação Polar (PCD)
  if (numHoles > 0 && boltCircleDia > 0) {
    const pcdRadius = boltCircleDia / 2;
    // Círculo PCD tracejado de referência
    const pcdCircle = buildIsoCircle(plane, origin, pcdRadius, "construcao", false);
    pcdCircle.isConstruction = true;
    entities.push(pcdCircle);

    for (let i = 0; i < numHoles; i++) {
      const angleRad = (i * 2 * Math.PI) / numHoles;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const hCenter = {
        x: origin.x + cfg.uDir.x * (cosA * pcdRadius) + cfg.vDir.x * (sinA * pcdRadius),
        y: origin.y + cfg.uDir.y * (cosA * pcdRadius) + cfg.vDir.y * (sinA * pcdRadius),
      };
      entities.push(...buildIsoHoleWithDepth(plane, hCenter, holeDia, thickness, "recorte"));
    }
  }

  // Cotas
  dims.push(
    makeDimension("diameter", [{ kind: "entity", id: outerCircle.id }], 25, {
      prefix: "OD ",
    }),
  );

  return { entities, dims };
}

/**
 * Gera Perfil U (Canal Dobrado) em Projeção Isométrica 2D
 * com alma, abas dobradas, espessura e furação na alma.
 */
export function buildIsoChannelPreset(params?: {
  webWidth?: number;
  flangeHeight?: number;
  length?: number;
  thickness?: number;
  holeDia?: number;
  origin?: Vec2;
}): { entities: Entity[]; dims: Dimension[] } {
  const w = params?.webWidth ?? 100; // Largura da alma (30°)
  const h = params?.flangeHeight ?? 50; // Altura das abas (90°)
  const l = params?.length ?? 180; // Comprimento longitudinal (150°)
  const t = params?.thickness ?? 4; // Espessura
  const dHole = params?.holeDia ?? 14;
  const o = params?.origin ?? { x: 0, y: 0 };

  const entities: Entity[] = [];
  const dims: Dimension[] = [];

  const u30 = ISO_AXIS_VECTORS.axis30;
  const u150 = ISO_AXIS_VECTORS.axis150;
  const u90 = ISO_AXIS_VECTORS.axis90;

  // Alma inferior (Plano Superior)
  const pA = o;
  const pB = { x: pA.x + u30.x * w, y: pA.y + u30.y * w };
  const pC = { x: pB.x + u150.x * l, y: pB.y + u150.y * l };
  const pD = { x: pA.x + u150.x * l, y: pA.y + u150.y * l };

  entities.push({
    id: uid(),
    layer: "corte",
    type: "polyline",
    closed: true,
    pts: [pA, pB, pC, pD],
    params: { isIso: true, isoPlane: "top", sourceKind: "rect", realWidth: w, realHeight: l },
  });

  // Linhas de dobra das abas
  entities.push({
    id: uid(),
    layer: "dobra",
    type: "line",
    x1: pA.x,
    y1: pA.y,
    x2: pD.x,
    y2: pD.y,
    params: { isIso: true, note: "Linha de Dobra Aba Esquerda" },
  });
  entities.push({
    id: uid(),
    layer: "dobra",
    type: "line",
    x1: pB.x,
    y1: pB.y,
    x2: pC.x,
    y2: pC.y,
    params: { isIso: true, note: "Linha de Dobra Aba Direita" },
  });

  // Aba vertical esquerda (Plano Esquerdo - eixos 150° e 90°)
  const pA_top = { x: pA.x + u90.x * h, y: pA.y + u90.y * h };
  const pD_top = { x: pD.x + u90.x * h, y: pD.y + u90.y * h };
  entities.push({
    id: uid(),
    layer: "corte",
    type: "polyline",
    closed: false,
    pts: [pA, pA_top, pD_top, pD],
  });

  // Aba vertical direita (Plano Esquerdo)
  const pB_top = { x: pB.x + u90.x * h, y: pB.y + u90.y * h };
  const pC_top = { x: pC.x + u90.x * h, y: pC.y + u90.y * h };
  entities.push({
    id: uid(),
    layer: "corte",
    type: "polyline",
    closed: false,
    pts: [pB, pB_top, pC_top, pC],
  });

  // Furos na alma
  if (dHole > 0) {
    const h1 = {
      x: pA.x + u30.x * (w * 0.5) + u150.x * (l * 0.25),
      y: pA.y + u30.y * (w * 0.5) + u150.y * (l * 0.25),
    };
    const h2 = {
      x: pA.x + u30.x * (w * 0.5) + u150.x * (l * 0.75),
      y: pA.y + u30.y * (w * 0.5) + u150.y * (l * 0.75),
    };
    entities.push(...buildIsoHoleWithDepth("top", h1, dHole, t, "recorte"));
    entities.push(...buildIsoHoleWithDepth("top", h2, dHole, t, "recorte"));
  }

  // Cotas
  dims.push(
    makeDimension(
      "aligned",
      [
        { kind: "point", p: pA },
        { kind: "point", p: pB },
      ],
      18,
      { prefix: "W=" },
    ),
  );
  dims.push(
    makeDimension(
      "aligned",
      [
        { kind: "point", p: pA },
        { kind: "point", p: pD },
      ],
      -18,
      { prefix: "L=" },
    ),
  );
  dims.push(
    makeDimension(
      "aligned",
      [
        { kind: "point", p: pA },
        { kind: "point", p: pA_top },
      ],
      -20,
      { prefix: "H=" },
    ),
  );

  return { entities, dims };
}
