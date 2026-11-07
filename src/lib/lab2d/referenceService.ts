/**
 * CALDRA CHAMFER — SERVIÇO CENTRAL UNIFICADO: MARCO GEOMÉTRICO / ÂNCORA (A–E)
 *
 * Implementa o serviço central único `ReferenceService`:
 *  - `getActive()`, `toWorld()`, `toLocal()`, `snapCandidates()`, `subscribe()`
 *  - Pilha FIFO de até 5 Marcos/Âncoras simultâneos (`A, B, C, D, E`)
 *  - Seleção Inteligente (`Smart Pick` <= 24 px) e `Ciclar` (zero marcos "ÓRFÃO" no vazio)
 *  - Referencial Local Rotacionável (X', Y') com transformação matemática oficial:
 *      world = O + R(θ) · (x', y')
 *  - Divisor Relacional de Vão A–B (÷2, ÷3, ÷4, ÷N), Ponto Médio A–B, Alinhar X' por A–B e Cotar A–B
 *  - Até 8 Guias Infinitas de Construção + Encontros Automáticos (Guia × Guia e Guia × Entidade)
 *  - Radar de Bordas (distâncias até as 4 bordas da Área de Trabalho e entidades mais próximas em X'/Y')
 *  - Eco Vivo (Espelho X', Y', X'+Y', Radial N=6 em 360° e Linear ao longo de X'/Y')
 *  - Tabela de Coordenadas e Cotas Ordenadas (`ID, X', Y', Ø`) na camada COTAS + exportação CSV
 *  - Resolução universal para `[ Usar Âncora A ]` e `CHAMFER INTENT` (`{anchor: 'A', dx, dy}` / `{anchor: 'A', r, angle}`)
 *  - Limpeza progressiva em 2 estágios (1º ESC/Limpar remove Guias/Eco/Divisões; 2º remove Âncoras A–E)
 */

import type { Vec2 } from "@/lib/geometry/types";
import {
  type Entity,
  type LayerId,
  dist,
  uid,
  segmentsOf,
  lineIntersection,
  closestOnSegment,
} from "./core";
import { isNonCutReferenceEntity } from "./cadGeometricMarks";

function rotateEntityAroundPivot(ent: Entity, pivot: Vec2, angleRad: number): Entity {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const rotPt = (p: Vec2): Vec2 => {
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return {
      x: Number((pivot.x + dx * cosA - dy * sinA).toFixed(4)),
      y: Number((pivot.y + dx * sinA + dy * cosA).toFixed(4)),
    };
  };
  if (ent.type === "line") {
    const p1 = rotPt({ x: ent.x1, y: ent.y1 });
    const p2 = rotPt({ x: ent.x2, y: ent.y2 });
    return { ...ent, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  if (ent.type === "circle") {
    const c = rotPt({ x: ent.cx, y: ent.cy });
    return { ...ent, cx: c.x, cy: c.y };
  }
  if (ent.type === "arc") {
    const c = rotPt({ x: ent.cx, y: ent.cy });
    return {
      ...ent,
      cx: c.x,
      cy: c.y,
      a0: ent.a0 + angleRad,
      a1: ent.a1 + angleRad,
    };
  }
  if (ent.type === "polyline") {
    return { ...ent, pts: ent.pts.map(rotPt) };
  }
  return ent;
}

export type AnchorLabel = "A" | "B" | "C" | "D" | "E";
export const ANCHOR_LABELS: readonly AnchorLabel[] = ["A", "B", "C", "D", "E"] as const;
export const MAX_ANCHORS = 5;
export const MAX_CONSTRUCTION_GUIDES = 8;
export const SMART_PICK_MAX_PX = 24;

export const ANCHOR_CYAN_PRIMARY = "#06B6D4";
export const ANCHOR_VIOLET_PRIMARY = "#A855F7";
export const ANCHOR_VIOLET_ACCENT = "#C084FC";

export type AnchorPointSymbolKind =
  | "vertex"
  | "center"
  | "midpoint"
  | "quadrant"
  | "tangent"
  | "intersection"
  | "centroid"
  | "free_point";

export interface SmartPickCandidate {
  point: Vec2;
  symbolKind: AnchorPointSymbolKind;
  label: string;
  entityId?: string;
  secondaryEntityId?: string;
  vertexIndex?: number;
  segmentIndex?: number;
  parameterT?: number;
  angleRad?: number;
  /** Ângulo sugerido em graus para alinhar automaticamente o eixo X' (ex: aresta de linha/polígono) */
  suggestedThetaDeg?: number;
  /** Braços adaptativos graduados no contexto da entidade */
  adaptiveArms?: {
    minusX: number;
    plusX: number;
    minusY: number;
    plusY: number;
    extremities: Vec2[];
  };
}

export interface GeometricAnchor {
  id: AnchorLabel;
  origin: Vec2;
  /** Ângulo de rotação do eixo local X' em graus (sentido do referencial matemático oficial) */
  thetaDeg: number;
  symbolKind: AnchorPointSymbolKind;
  badgeLabel: string;
  parentEntityId?: string;
  secondaryEntityId?: string;
  vertexIndex?: number;
  segmentIndex?: number;
  parameterT?: number;
  angleRad?: number;
  /** Índice atual do candidato no ciclo `Ciclar` da entidade pai */
  cycleIndex?: number;
  adaptiveArms?: {
    minusX: number;
    plusX: number;
    minusY: number;
    plusY: number;
    extremities: Vec2[];
  };
  createdAt: number;
}

export type ConstructionGuideKind =
  | "axis_x"
  | "axis_y"
  | "angled"
  | "parallel_offset"
  | "perpendicular"
  | "bisector";

export interface ConstructionGuideLine {
  id: string;
  anchorId: AnchorLabel;
  kind: ConstructionGuideKind;
  /** Ponto base no mundo por onde a guia infinita passa */
  origin: Vec2;
  /** Vetor diretor unitário (dx, dy) no espaço do mundo */
  direction: Vec2;
  /** Ângulo em graus no mundo */
  angleDeg: number;
  /** Offset em mm quando paralela */
  offsetMm?: number;
  label: string;
}

export interface GuideMeetingPoint {
  id: string;
  point: Vec2;
  kind: "guide_guide" | "guide_entity";
  guideIds: string[];
  entityId?: string;
  label: string;
}

export interface SpanDivisionConfig {
  fromAnchor: AnchorLabel;
  toAnchor: AnchorLabel;
  divisionsN: number;
  points: Vec2[];
}

export interface EdgeRadarChip {
  id: string;
  directionLabel: "-X'" | "+X'" | "-Y'" | "+Y'" | "BORDA ESQ" | "BORDA DIR" | "BORDA SUP" | "BORDA INF";
  kind: "workspace_edge" | "entity_edge";
  distanceMm: number;
  fromPoint: Vec2;
  toPoint: Vec2;
  targetEntityId?: string;
}

export interface EdgeRadarResult {
  anchorId: AnchorLabel;
  origin: Vec2;
  workspaceChips: EdgeRadarChip[];
  entityChips: EdgeRadarChip[];
}

export type EchoMode = "off" | "mirror_x" | "mirror_y" | "mirror_xy" | "radial" | "linear";

export interface EchoConfig {
  mode: EchoMode;
  radialCount: number;
  linearCount: number;
  linearStepMm: number;
  linearAxis: "x" | "y";
}

export interface AnchorPairMetrics {
  fromAnchor: GeometricAnchor;
  toAnchor: GeometricAnchor;
  dx: number;
  dy: number;
  distance: number;
  angleDeg: number;
  midpoint: Vec2;
}

export interface AnchorSnapCandidate {
  point: Vec2;
  kind: "anchor" | "meeting" | "span_division" | "extremity";
  label: string;
  anchorId?: AnchorLabel;
}

export interface AnchorHoleTableRow {
  id: string;
  entityId: string;
  localX: number;
  localY: number;
  worldX: number;
  worldY: number;
  diameter: number;
}

export interface ReferenceServiceSnapshot {
  anchors: GeometricAnchor[];
  activeAnchorId: AnchorLabel | null;
  guides: ConstructionGuideLine[];
  spanDivision: SpanDivisionConfig | null;
  radarEnabled: boolean;
  echo: EchoConfig;
  coordinateInputMode: "world" | "anchor";
}

export interface ReferenceServiceState extends ReferenceServiceSnapshot {
  meetings: GuideMeetingPoint[];
}

const ANGULAR_SNAP_DEGREES = [0, 15, 30, 45, 60, 75, 90, 120, 135, 150, 180, -15, -30, -45, -60, -90, -120, -135, -150];

/**
 * Transformação Matemática Oficial (Seção 4.3):
 *   world = O + R(θ) · (x', y')
 * Onde θ é dado em graus e:
 *   x_w = O_x + x' cos(θ) - y' sin(θ)
 *   y_w = O_y + x' sin(θ) + y' cos(θ)
 */
export function anchorLocalToWorld(
  localPt: Vec2,
  origin: Vec2,
  thetaDeg = 0,
): Vec2 {
  const rad = (thetaDeg * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);
  return {
    x: Number((origin.x + localPt.x * cosT - localPt.y * sinT).toFixed(4)),
    y: Number((origin.y + localPt.x * sinT + localPt.y * cosT).toFixed(4)),
  };
}

/**
 * Transformação Inversa Oficial (Seção 4.3):
 *   (x', y') = R(-θ) · (world - O)
 */
export function anchorWorldToLocal(
  worldPt: Vec2,
  origin: Vec2,
  thetaDeg = 0,
): Vec2 {
  const rad = (thetaDeg * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);
  const dx = worldPt.x - origin.x;
  const dy = worldPt.y - origin.y;
  return {
    x: Number((dx * cosT + dy * sinT).toFixed(4)),
    y: Number((-dx * sinT + dy * cosT).toFixed(4)),
  };
}

/**
 * Aplica snap angular nos ângulos notáveis (0°, 15°, 30°, 45°, 90°, etc.) dentro da tolerância.
 */
export function snapAxisAngleDeg(rawAngleDeg: number, toleranceDeg = 3.5): number {
  let norm = ((rawAngleDeg % 360) + 360) % 360;
  if (norm > 180) norm -= 360;
  for (const target of ANGULAR_SNAP_DEGREES) {
    if (Math.abs(norm - target) <= toleranceDeg) {
      return target;
    }
  }
  return Number(norm.toFixed(2));
}

/**
 * Calcula os braços adaptativos graduados e extremos de uma entidade em torno de um ponto.
 */
export function computeEntityAdaptiveArms(
  pt: Vec2,
  entity?: Entity | null,
  defaultArmWorld = 28,
): {
  minusX: number;
  plusX: number;
  minusY: number;
  plusY: number;
  extremities: Vec2[];
} {
  if (!entity) {
    return {
      minusX: defaultArmWorld,
      plusX: defaultArmWorld,
      minusY: defaultArmWorld,
      plusY: defaultArmWorld,
      extremities: [],
    };
  }

  if (entity.type === "circle" || entity.type === "arc") {
    const r = Math.max(8, entity.r);
    const quads: Vec2[] = [
      { x: entity.cx + entity.r, y: entity.cy },
      { x: entity.cx - entity.r, y: entity.cy },
      { x: entity.cx, y: entity.cy + entity.r },
      { x: entity.cx, y: entity.cy - entity.r },
    ];
    return {
      minusX: Math.max(defaultArmWorld * 0.6, Math.abs(pt.x - (entity.cx - r))),
      plusX: Math.max(defaultArmWorld * 0.6, Math.abs(entity.cx + r - pt.x)),
      minusY: Math.max(defaultArmWorld * 0.6, Math.abs(pt.y - (entity.cy - r))),
      plusY: Math.max(defaultArmWorld * 0.6, Math.abs(entity.cy + r - pt.y)),
      extremities: quads,
    };
  }

  if (entity.type === "line") {
    const p1 = { x: entity.x1, y: entity.y1 };
    const p2 = { x: entity.x2, y: entity.y2 };
    const halfLen = Math.max(defaultArmWorld * 0.7, dist(p1, p2) * 0.5);
    return {
      minusX: halfLen,
      plusX: halfLen,
      minusY: defaultArmWorld * 0.65,
      plusY: defaultArmWorld * 0.65,
      extremities: [p1, p2],
    };
  }

  if (entity.type === "polyline" && entity.pts.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of entity.pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      minusX: Math.max(defaultArmWorld * 0.6, Math.abs(pt.x - minX)),
      plusX: Math.max(defaultArmWorld * 0.6, Math.abs(maxX - pt.x)),
      minusY: Math.max(defaultArmWorld * 0.6, Math.abs(pt.y - minY)),
      plusY: Math.max(defaultArmWorld * 0.6, Math.abs(maxY - pt.y)),
      extremities: entity.pts.slice(0, 8).map((p) => ({ ...p })),
    };
  }

  return {
    minusX: defaultArmWorld,
    plusX: defaultArmWorld,
    minusY: defaultArmWorld,
    plusY: defaultArmWorld,
    extremities: [],
  };
}

/**
 * Enumera todos os candidatos ordenados de uma entidade para o botão `Ciclar` (Seção 4.2):
 *  - Círculo/Arco: centro, quadrantes (0°, 90°, 180°, 270°), extremos e meio do arco
 *  - Linha: ponto médio, extremo 1, extremo 2 (alinhando X' ao ângulo da linha)
 *  - Retângulo/Polígono/Slot: centroide, vértices, pontos médios das arestas (alinhando X' na aresta)
 */
export function listEntityCycleCandidates(entity: Entity): SmartPickCandidate[] {
  const list: SmartPickCandidate[] = [];
  const arms = computeEntityAdaptiveArms(
    entity.type === "circle" || entity.type === "arc" || entity.type === "ellipse"
      ? { x: entity.cx, y: entity.cy }
      : { x: 0, y: 0 },
    entity,
  );

  if (entity.type === "circle") {
    const center = { x: entity.cx, y: entity.cy };
    list.push({
      point: center,
      symbolKind: "center",
      label: "Centro",
      entityId: entity.id,
      suggestedThetaDeg: 0,
      adaptiveArms: computeEntityAdaptiveArms(center, entity),
    });
    const quadAngles = [
      { rad: 0, name: "Quadrante 0° (+X)" },
      { rad: Math.PI / 2, name: "Quadrante 90° (+Y)" },
      { rad: Math.PI, name: "Quadrante 180° (-X)" },
      { rad: -Math.PI / 2, name: "Quadrante 270° (-Y)" },
    ];
    for (const q of quadAngles) {
      const pt = {
        x: Number((entity.cx + entity.r * Math.cos(q.rad)).toFixed(4)),
        y: Number((entity.cy + entity.r * Math.sin(q.rad)).toFixed(4)),
      };
      list.push({
        point: pt,
        symbolKind: "quadrant",
        label: q.name,
        entityId: entity.id,
        angleRad: q.rad,
        suggestedThetaDeg: 0,
        adaptiveArms: computeEntityAdaptiveArms(pt, entity),
      });
    }
    return list;
  }

  if (entity.type === "arc") {
    const center = { x: entity.cx, y: entity.cy };
    list.push({
      point: center,
      symbolKind: "center",
      label: "Centro do Arco",
      entityId: entity.id,
      suggestedThetaDeg: 0,
      adaptiveArms: computeEntityAdaptiveArms(center, entity),
    });
    let a0 = entity.a0;
    let a1 = entity.a1;
    if (a1 <= a0) a1 += Math.PI * 2;
    const midA = a0 + (a1 - a0) * 0.5;
    const midPt = {
      x: Number((entity.cx + entity.r * Math.cos(midA)).toFixed(4)),
      y: Number((entity.cy + entity.r * Math.sin(midA)).toFixed(4)),
    };
    list.push({
      point: midPt,
      symbolKind: "midpoint",
      label: "Meio do Arco",
      entityId: entity.id,
      parameterT: 0.5,
      angleRad: midA,
      suggestedThetaDeg: Number((((midA + Math.PI / 2) * 180) / Math.PI).toFixed(2)),
      adaptiveArms: computeEntityAdaptiveArms(midPt, entity),
    });
    const p0 = {
      x: Number((entity.cx + entity.r * Math.cos(entity.a0)).toFixed(4)),
      y: Number((entity.cy + entity.r * Math.sin(entity.a0)).toFixed(4)),
    };
    const p1 = {
      x: Number((entity.cx + entity.r * Math.cos(entity.a1)).toFixed(4)),
      y: Number((entity.cy + entity.r * Math.sin(entity.a1)).toFixed(4)),
    };
    list.push(
      {
        point: p0,
        symbolKind: "vertex",
        label: "Extremo Inicial do Arco",
        entityId: entity.id,
        vertexIndex: 0,
        angleRad: entity.a0,
        suggestedThetaDeg: 0,
        adaptiveArms: computeEntityAdaptiveArms(p0, entity),
      },
      {
        point: p1,
        symbolKind: "vertex",
        label: "Extremo Final do Arco",
        entityId: entity.id,
        vertexIndex: 1,
        angleRad: entity.a1,
        suggestedThetaDeg: 0,
        adaptiveArms: computeEntityAdaptiveArms(p1, entity),
      },
    );
    return list;
  }

  if (entity.type === "line") {
    const p1 = { x: entity.x1, y: entity.y1 };
    const p2 = { x: entity.x2, y: entity.y2 };
    const mid = {
      x: Number(((p1.x + p2.x) * 0.5).toFixed(4)),
      y: Number(((p1.y + p2.y) * 0.5).toFixed(4)),
    };
    const lineAngleDeg = Number(
      ((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI).toFixed(2),
    );
    list.push(
      {
        point: mid,
        symbolKind: "midpoint",
        label: "Ponto Médio da Linha",
        entityId: entity.id,
        parameterT: 0.5,
        suggestedThetaDeg: lineAngleDeg,
        adaptiveArms: computeEntityAdaptiveArms(mid, entity),
      },
      {
        point: p1,
        symbolKind: "vertex",
        label: "Extremidade Inicial",
        entityId: entity.id,
        vertexIndex: 0,
        parameterT: 0,
        suggestedThetaDeg: lineAngleDeg,
        adaptiveArms: computeEntityAdaptiveArms(p1, entity),
      },
      {
        point: p2,
        symbolKind: "vertex",
        label: "Extremidade Final",
        entityId: entity.id,
        vertexIndex: 1,
        parameterT: 1,
        suggestedThetaDeg: lineAngleDeg,
        adaptiveArms: computeEntityAdaptiveArms(p2, entity),
      },
    );
    return list;
  }

  if (entity.type === "polyline" && entity.pts.length > 0) {
    // 1. Centroide do envelope/polígono
    let sx = 0;
    let sy = 0;
    for (const p of entity.pts) {
      sx += p.x;
      sy += p.y;
    }
    const centroid = {
      x: Number((sx / entity.pts.length).toFixed(4)),
      y: Number((sy / entity.pts.length).toFixed(4)),
    };
    list.push({
      point: centroid,
      symbolKind: "centroid",
      label: "Centroide da Peça",
      entityId: entity.id,
      suggestedThetaDeg: 0,
      adaptiveArms: computeEntityAdaptiveArms(centroid, entity),
    });

    // 2. Vértices
    const segs = segmentsOf(entity);
    for (let i = 0; i < entity.pts.length; i++) {
      const vp = entity.pts[i]!;
      const seg = segs[i % Math.max(1, segs.length)];
      const edgeAngle = seg
        ? Number(((Math.atan2(seg[1].y - seg[0].y, seg[1].x - seg[0].x) * 180) / Math.PI).toFixed(2))
        : 0;
      list.push({
        point: { x: Number(vp.x.toFixed(4)), y: Number(vp.y.toFixed(4)) },
        symbolKind: "vertex",
        label: `Vértice V${i + 1}`,
        entityId: entity.id,
        vertexIndex: i,
        suggestedThetaDeg: edgeAngle,
        adaptiveArms: computeEntityAdaptiveArms(vp, entity),
      });
    }

    // 3. Pontos médios das arestas (com alinhamento de X' na aresta)
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i]!;
      const mid = {
        x: Number(((a.x + b.x) * 0.5).toFixed(4)),
        y: Number(((a.y + b.y) * 0.5).toFixed(4)),
      };
      const edgeAngle = Number(
        ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(2),
      );
      list.push({
        point: mid,
        symbolKind: "midpoint",
        label: `Meio da Aresta ${i + 1}`,
        entityId: entity.id,
        segmentIndex: i,
        vertexIndex: i,
        parameterT: 0.5,
        suggestedThetaDeg: edgeAngle,
        adaptiveArms: computeEntityAdaptiveArms(mid, entity),
      });
    }
    return list;
  }

  return [
    {
      point: { x: 0, y: 0 },
      symbolKind: "free_point",
      label: "Ponto",
      entityId: entity.id,
      adaptiveArms: arms,
    },
  ];
}

/**
 * Seleção Inteligente (`Smart Pick`) com ordem estrita de prioridade (<= 24 px):
 *  1. Ponto notável mais próximo (Centro, Ponto Médio, Vértice/Extremidade, Quadrante, Tangência)
 *  2. Encontro / Interseção (entre entidades ou guias)
 *  3. Centro / Centroide do envelope
 *  4. Ponto Livre na grade (somente se allowGridFreePoint = true)
 *
 * Proibido criar marcos "ÓRFÃO" no vazio!
 */
export function evaluateSmartPick(
  cursorWorld: Vec2,
  entities: Entity[],
  viewK = 1,
  options?: {
    maxPixelRadius?: number;
    allowGridFreePoint?: boolean;
    gridStep?: number;
    guideMeetings?: GuideMeetingPoint[];
  },
): {
  best: SmartPickCandidate | null;
  candidates: SmartPickCandidate[];
} {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const maxPx = options?.maxPixelRadius ?? SMART_PICK_MAX_PX;
  const radiusWorld = maxPx / safeK;

  const realEntities = entities.filter((e) => !isNonCutReferenceEntity(e));
  const notableCandidates: { cand: SmartPickCandidate; distWorld: number; priority: number }[] = [];

  for (const ent of realEntities) {
    const cycleList = listEntityCycleCandidates(ent);
    for (const c of cycleList) {
      const d = dist(cursorWorld, c.point);
      if (d <= radiusWorld) {
        const prio = c.symbolKind === "centroid" ? 3 : 1;
        notableCandidates.push({ cand: c, distWorld: d, priority: prio });
      }
    }

    // Se o toque estiver sobre uma aresta/borda dentro de radiusWorld mas longe dos vértices/meio,
    // adiciona o ponto projetado na aresta com alinhamento automático de X'
    if (ent.type === "line") {
      const s: [Vec2, Vec2] = [
        { x: ent.x1, y: ent.y1 },
        { x: ent.x2, y: ent.y2 },
      ];
      const cp = closestOnSegment(cursorWorld, s);
      const d = dist(cursorWorld, cp);
      if (d <= radiusWorld) {
        const len = Math.max(1e-6, dist(s[0], s[1]));
        const t = dist(s[0], cp) / len;
        const lineAngleDeg = Number(
          ((Math.atan2(s[1].y - s[0].y, s[1].x - s[0].x) * 180) / Math.PI).toFixed(2),
        );
        notableCandidates.push({
          cand: {
            point: { x: Number(cp.x.toFixed(4)), y: Number(cp.y.toFixed(4)) },
            symbolKind: Math.abs(t - 0.5) < 0.08 ? "midpoint" : "tangent",
            label: Math.abs(t - 0.5) < 0.08 ? "Ponto Médio da Linha" : "Ponto na Linha",
            entityId: ent.id,
            parameterT: t,
            suggestedThetaDeg: lineAngleDeg,
            adaptiveArms: computeEntityAdaptiveArms(cp, ent),
          },
          distWorld: d + radiusWorld * 0.25,
          priority: 1,
        });
      }
    } else if (ent.type === "circle" || ent.type === "arc") {
      const dCenter = dist(cursorWorld, { x: ent.cx, y: ent.cy });
      const dEdge = Math.abs(dCenter - ent.r);
      if (dEdge <= radiusWorld) {
        const ang = Math.atan2(cursorWorld.y - ent.cy, cursorWorld.x - ent.cx);
        const pt = {
          x: Number((ent.cx + ent.r * Math.cos(ang)).toFixed(4)),
          y: Number((ent.cy + ent.r * Math.sin(ang)).toFixed(4)),
        };
        const tangentDeg = Number((((ang + Math.PI / 2) * 180) / Math.PI).toFixed(2));
        notableCandidates.push({
          cand: {
            point: pt,
            symbolKind: "tangent",
            label: "Tangência Circular",
            entityId: ent.id,
            angleRad: ang,
            suggestedThetaDeg: tangentDeg,
            adaptiveArms: computeEntityAdaptiveArms(pt, ent),
          },
          distWorld: dEdge + radiusWorld * 0.2,
          priority: 1,
        });
      }
    }
  }

  // 2. Interseções / Encontros entre segmentos de entidades e/ou guias
  const allSegs: { seg: [Vec2, Vec2]; entityId: string }[] = [];
  for (const ent of realEntities) {
    for (const s of segmentsOf(ent)) {
      allSegs.push({ seg: s, entityId: ent.id });
    }
  }
  for (let i = 0; i < allSegs.length; i++) {
    for (let j = i + 1; j < allSegs.length; j++) {
      if (allSegs[i]!.entityId === allSegs[j]!.entityId) continue;
      const hit = lineIntersection(allSegs[i]!.seg, allSegs[j]!.seg, true);
      if (hit) {
        const d = dist(cursorWorld, hit);
        if (d <= radiusWorld) {
          notableCandidates.push({
            cand: {
              point: { x: Number(hit.x.toFixed(4)), y: Number(hit.y.toFixed(4)) },
              symbolKind: "intersection",
              label: "Encontro / Interseção",
              entityId: allSegs[i]!.entityId,
              secondaryEntityId: allSegs[j]!.entityId,
              suggestedThetaDeg: 0,
            },
            distWorld: d,
            priority: 2,
          });
        }
      }
    }
  }

  if (options?.guideMeetings) {
    for (const gm of options.guideMeetings) {
      const d = dist(cursorWorld, gm.point);
      if (d <= radiusWorld) {
        notableCandidates.push({
          cand: {
            point: { ...gm.point },
            symbolKind: "intersection",
            label: gm.label,
            entityId: gm.entityId,
            suggestedThetaDeg: 0,
          },
          distWorld: d,
          priority: 2,
        });
      }
    }
  }

  notableCandidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.distWorld - b.distWorld;
  });

  if (notableCandidates.length > 0) {
    const unique: SmartPickCandidate[] = [];
    for (const item of notableCandidates) {
      const dup = unique.some(
        (u) => dist(u.point, item.cand.point) < 1e-2 && u.symbolKind === item.cand.symbolKind,
      );
      if (!dup) unique.push(item.cand);
    }
    return {
      best: unique[0] ?? null,
      candidates: unique,
    };
  }

  if (options?.allowGridFreePoint) {
    const step = Math.max(0.1, options.gridStep ?? 10);
    const snapped = {
      x: Number((Math.round(cursorWorld.x / step) * step).toFixed(4)),
      y: Number((Math.round(cursorWorld.y / step) * step).toFixed(4)),
    };
    const freeCand: SmartPickCandidate = {
      point: snapped,
      symbolKind: "free_point",
      label: "Ponto na Grade",
      suggestedThetaDeg: 0,
    };
    return { best: freeCand, candidates: [freeCand] };
  }

  return { best: null, candidates: [] };
}

/**
 * Calcula interseções entre uma linha infinita (origin + t * dir) e uma entidade do CAD.
 */
function intersectInfiniteLineWithEntity(
  lineOrigin: Vec2,
  lineDir: Vec2,
  ent: Entity,
): Vec2[] {
  const hits: Vec2[] = [];
  const far = 50000;
  const virtualSeg: [Vec2, Vec2] = [
    { x: lineOrigin.x - lineDir.x * far, y: lineOrigin.y - lineDir.y * far },
    { x: lineOrigin.x + lineDir.x * far, y: lineOrigin.y + lineDir.y * far },
  ];

  if (ent.type === "circle" || ent.type === "arc") {
    const dx = lineDir.x;
    const dy = lineDir.y;
    const fx = lineOrigin.x - ent.cx;
    const fy = lineOrigin.y - ent.cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - ent.r * ent.r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0 && a > 1e-9) {
      const sqrtD = Math.sqrt(Math.max(0, disc));
      const t1 = (-b - sqrtD) / (2 * a);
      const t2 = (-b + sqrtD) / (2 * a);
      const pts = disc < 1e-7 ? [t1] : [t1, t2];
      for (const t of pts) {
        const px = lineOrigin.x + t * dx;
        const py = lineOrigin.y + t * dy;
        if (ent.type === "arc") {
          let ang = Math.atan2(py - ent.cy, px - ent.cx);
          let a0 = ent.a0;
          let a1 = ent.a1;
          while (ang < a0) ang += Math.PI * 2;
          while (a1 < a0) a1 += Math.PI * 2;
          if (ang > a1 + 1e-4) continue;
        }
        hits.push({ x: Number(px.toFixed(4)), y: Number(py.toFixed(4)) });
      }
    }
    return hits;
  }

  for (const seg of segmentsOf(ent)) {
    const pt = lineIntersection(virtualSeg, seg, true);
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      hits.push({ x: Number(pt.x.toFixed(4)), y: Number(pt.y.toFixed(4)) });
    }
  }
  return hits;
}

/**
 * Classe Central `ReferenceServiceManager` — Governa toda a ferramenta MARCO GEOMÉTRICO / ÂNCORA (A–E).
 */
export class ReferenceServiceManager {
  private anchors: GeometricAnchor[] = [];
  private activeAnchorId: AnchorLabel | null = null;
  private guides: ConstructionGuideLine[] = [];
  private meetings: GuideMeetingPoint[] = [];
  private spanDivision: SpanDivisionConfig | null = null;
  private radarEnabled = false;
  private echo: EchoConfig = {
    mode: "off",
    radialCount: 6,
    linearCount: 3,
    linearStepMm: 50,
    linearAxis: "x",
  };
  private coordinateInputMode: "world" | "anchor" = "anchor";
  private listeners = new Set<(state: ReferenceServiceState) => void>();

  public getActive(): GeometricAnchor | null {
    if (!this.activeAnchorId) return this.anchors[this.anchors.length - 1] ?? null;
    return (
      this.anchors.find((a) => a.id === this.activeAnchorId) ??
      this.anchors[this.anchors.length - 1] ??
      null
    );
  }

  public getAnchors(): GeometricAnchor[] {
    return [...this.anchors];
  }

  public getAnchor(id: AnchorLabel): GeometricAnchor | null {
    return this.anchors.find((a) => a.id === id) ?? null;
  }

  public setActive(id: AnchorLabel): GeometricAnchor | null {
    const found = this.anchors.find((a) => a.id === id);
    if (!found) return null;
    this.activeAnchorId = id;
    this.notify();
    return found;
  }

  public getCoordinateInputMode(): "world" | "anchor" {
    return this.coordinateInputMode;
  }

  public setCoordinateInputMode(mode: "world" | "anchor"): void {
    this.coordinateInputMode = mode;
    this.notify();
  }

  /**
   * Converte coordenadas locais (x', y') da Âncora ativa (ou informada) para o Mundo (X, Y):
   *   world = O + R(θ) · (x', y')
   */
  public toWorld(
    localPt: Vec2,
    anchorOrId?: GeometricAnchor | AnchorLabel | null,
  ): Vec2 {
    const anchor =
      typeof anchorOrId === "string"
        ? this.getAnchor(anchorOrId)
        : anchorOrId ?? this.getActive();
    if (!anchor) {
      return {
        x: Number(localPt.x.toFixed(4)),
        y: Number(localPt.y.toFixed(4)),
      };
    }
    return anchorLocalToWorld(localPt, anchor.origin, anchor.thetaDeg);
  }

  /**
   * Converte coordenadas do Mundo (X, Y) para o referencial local (x', y') da Âncora ativa:
   *   (x', y') = R(-θ) · (world - O)
   */
  public toLocal(
    worldPt: Vec2,
    anchorOrId?: GeometricAnchor | AnchorLabel | null,
  ): Vec2 {
    const anchor =
      typeof anchorOrId === "string"
        ? this.getAnchor(anchorOrId)
        : anchorOrId ?? this.getActive();
    if (!anchor) {
      return {
        x: Number(worldPt.x.toFixed(4)),
        y: Number(worldPt.y.toFixed(4)),
      };
    }
    return anchorWorldToLocal(worldPt, anchor.origin, anchor.thetaDeg);
  }

  /**
   * Interpreta entrada numérica do Numpad/campos nos modos `Mundo` ou `Âncora`:
   *  - "dx,dy" ou "@dx,dy" (ex: "100,0" ou "@100,50")
   *  - polar "d<θ" ou "@d<θ" (ex: "100<30")
   */
  public parseRelativeInput(
    rawInput: string,
    modeOverride?: "world" | "anchor",
    anchorOverride?: GeometricAnchor | null,
  ): Vec2 | null {
    const raw = rawInput.trim();
    if (!raw) return null;
    const hasAtPrefix = raw.startsWith("@");
    const clean = hasAtPrefix ? raw.slice(1).trim() : raw;
    const effectiveMode = hasAtPrefix
      ? "anchor"
      : modeOverride ?? this.coordinateInputMode;
    const anchor = anchorOverride ?? this.getActive();

    // Formato Polar: d<θ
    if (clean.includes("<")) {
      const [rStr, angStr] = clean.split("<");
      const r = Number((rStr ?? "").trim().replace(",", "."));
      const angDeg = Number((angStr ?? "").trim().replace(",", "."));
      if (!Number.isFinite(r) || !Number.isFinite(angDeg)) return null;
      const rad = (angDeg * Math.PI) / 180;
      const localPt: Vec2 = {
        x: r * Math.cos(rad),
        y: r * Math.sin(rad),
      };
      return effectiveMode === "anchor" && anchor
        ? this.toWorld(localPt, anchor)
        : {
            x: Number(localPt.x.toFixed(4)),
            y: Number(localPt.y.toFixed(4)),
          };
    }

    // Formato Cartesiano: x,y ou x;y
    const parts = clean.includes(";") ? clean.split(";") : clean.split(",");
    if (parts.length >= 2) {
      const lx = Number((parts[0] ?? "").trim().replace(",", "."));
      const ly = Number((parts[1] ?? "").trim().replace(",", "."));
      if (!Number.isFinite(lx) || !Number.isFinite(ly)) return null;
      const pt = { x: lx, y: ly };
      return effectiveMode === "anchor" && anchor
        ? this.toWorld(pt, anchor)
        : {
            x: Number(pt.x.toFixed(4)),
            y: Number(pt.y.toFixed(4)),
          };
    }

    return null;
  }

  /**
   * Adiciona ou atualiza um Marco/Âncora na pilha FIFO (máximo de 5: A, B, C, D, E).
   */
  public upsertAnchor(
    candidateInput: SmartPickCandidate | { best: SmartPickCandidate | null },
    preferredLabel?: AnchorLabel | unknown,
    cycleIndex = 0,
  ): GeometricAnchor {
    const candidate: SmartPickCandidate =
      "best" in candidateInput && candidateInput.best
        ? candidateInput.best
        : (candidateInput as SmartPickCandidate);
    const validPreferredLabel: AnchorLabel | undefined =
      typeof preferredLabel === "string" &&
      (ANCHOR_LABELS as readonly string[]).includes(preferredLabel)
        ? (preferredLabel as AnchorLabel)
        : undefined;

    // Se já existir âncora exatamente no mesmo ponto/entidade e preferredLabel não foi forçado, atualiza-a
    const existingSameIdx = !validPreferredLabel
      ? this.anchors.findIndex(
          (a) =>
            dist(a.origin, candidate.point) < 1e-3 &&
            a.parentEntityId === candidate.entityId,
        )
      : -1;

    if (existingSameIdx >= 0) {
      const current = this.anchors[existingSameIdx]!;
      const updated: GeometricAnchor = {
        ...current,
        origin: { ...candidate.point },
        thetaDeg: candidate.suggestedThetaDeg ?? current.thetaDeg,
        symbolKind: candidate.symbolKind,
        badgeLabel: candidate.label,
        parentEntityId: candidate.entityId,
        secondaryEntityId: candidate.secondaryEntityId,
        vertexIndex: candidate.vertexIndex,
        segmentIndex: candidate.segmentIndex,
        parameterT: candidate.parameterT,
        angleRad: candidate.angleRad,
        cycleIndex,
        adaptiveArms: candidate.adaptiveArms,
      };
      this.anchors[existingSameIdx] = updated;
      this.activeAnchorId = updated.id;
      this.notify();
      return updated;
    }

    let label: AnchorLabel;
    if (validPreferredLabel) {
      label = validPreferredLabel;
      this.anchors = this.anchors.filter((a) => a.id !== validPreferredLabel);
    } else if (this.anchors.length < MAX_ANCHORS) {
      const used = new Set(this.anchors.map((a) => a.id));
      label = ANCHOR_LABELS.find((l) => !used.has(l)) ?? "A";
    } else {
      // Fila FIFO quando já há 5 âncoras (A–E): remove a mais antiga e reutiliza seu rótulo
      const oldest = this.anchors.shift()!;
      label = oldest.id;
    }

    const created: GeometricAnchor = {
      id: label,
      origin: {
        x: Number(candidate.point.x.toFixed(4)),
        y: Number(candidate.point.y.toFixed(4)),
      },
      thetaDeg: candidate.suggestedThetaDeg ?? 0,
      symbolKind: candidate.symbolKind,
      badgeLabel: candidate.label,
      parentEntityId: candidate.entityId,
      secondaryEntityId: candidate.secondaryEntityId,
      vertexIndex: candidate.vertexIndex,
      segmentIndex: candidate.segmentIndex,
      parameterT: candidate.parameterT,
      angleRad: candidate.angleRad,
      cycleIndex,
      adaptiveArms: candidate.adaptiveArms,
      createdAt: Date.now(),
    };

    this.anchors.push(created);
    this.activeAnchorId = created.id;
    this.notify();
    return created;
  }

  /**
   * Percorre os candidatos da entidade vinculada ao Marco/Âncora ativo (`Ciclar`, Seção 4.2).
   */
  public cycleActiveAnchor(entities: Entity[]): GeometricAnchor | null {
    const active = this.getActive();
    if (!active) return null;
    const parent = active.parentEntityId
      ? entities.find((e) => e.id === active.parentEntityId)
      : entities.find((e) => !isNonCutReferenceEntity(e));
    if (!parent) return null;

    const candidates = listEntityCycleCandidates(parent);
    if (candidates.length === 0) return null;
    const nextIdx = ((active.cycleIndex ?? 0) + 1) % candidates.length;
    const cand = candidates[nextIdx]!;

    const updated: GeometricAnchor = {
      ...active,
      origin: { ...cand.point },
      thetaDeg: cand.suggestedThetaDeg ?? active.thetaDeg,
      symbolKind: cand.symbolKind,
      badgeLabel: cand.label,
      parentEntityId: parent.id,
      vertexIndex: cand.vertexIndex,
      segmentIndex: cand.segmentIndex,
      parameterT: cand.parameterT,
      angleRad: cand.angleRad,
      cycleIndex: nextIdx,
      adaptiveArms: cand.adaptiveArms,
    };

    this.anchors = this.anchors.map((a) => (a.id === active.id ? updated : a));
    this.recomputeGuideMeetings(entities);
    this.notify();
    return updated;
  }

  /**
   * Atualiza a rotação do eixo X' do Marco/Âncora ativo (`Alinhar`, Seção 4.3).
   */
  public setActiveAnchorAngle(
    thetaDeg: number,
    withAngularSnap = false,
    entities: Entity[] = [],
  ): GeometricAnchor | null {
    const active = this.getActive();
    if (!active) return null;
    const finalTheta = withAngularSnap
      ? snapAxisAngleDeg(thetaDeg)
      : Number(thetaDeg.toFixed(2));
    const updated: GeometricAnchor = {
      ...active,
      thetaDeg: finalTheta,
    };
    this.anchors = this.anchors.map((a) => (a.id === active.id ? updated : a));
    this.recomputeGuideMeetings(entities);
    this.notify();
    return updated;
  }

  /**
   * Alinha o eixo X' tocando em uma aresta ou segmento (p1 -> p2).
   */
  public alignActiveAnchorToSegment(
    p1: Vec2,
    p2: Vec2,
    entities: Entity[] = [],
  ): GeometricAnchor | null {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (Math.hypot(dx, dy) < 1e-6) return this.getActive();
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return this.setActiveAnchorAngle(deg, false, entities);
  }

  /**
   * Calcula os dados relacionais entre 2 Marcos/Âncoras (ex.: A -> B: ΔX, ΔY, d, ∠, Ponto Médio).
   */
  public computeAnchorPairMetrics(
    fromId?: AnchorLabel,
    toId?: AnchorLabel,
  ): AnchorPairMetrics | null {
    if (this.anchors.length < 2) return null;
    const a = (fromId ? this.getAnchor(fromId) : null) ?? this.anchors[0]!;
    const b =
      (toId ? this.getAnchor(toId) : null) ??
      this.anchors.find((x) => x.id !== a.id) ??
      this.anchors[1]!;
    const dx = Number((b.origin.x - a.origin.x).toFixed(4));
    const dy = Number((b.origin.y - a.origin.y).toFixed(4));
    const distance = Number(Math.hypot(dx, dy).toFixed(4));
    const angleDeg =
      distance > 1e-6
        ? Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2))
        : 0;
    const midpoint: Vec2 = {
      x: Number(((a.origin.x + b.origin.x) * 0.5).toFixed(4)),
      y: Number(((a.origin.y + b.origin.y) * 0.5).toFixed(4)),
    };
    return {
      fromAnchor: a,
      toAnchor: b,
      dx,
      dy,
      distance,
      angleDeg,
      midpoint,
    };
  }

  /**
   * 4.4.1 — Cria um Marco/Âncora exatamente no Ponto Médio A–B.
   */
  public createMidpointBetweenAnchors(
    fromId?: AnchorLabel,
    toId?: AnchorLabel,
  ): GeometricAnchor | null {
    const metrics = this.computeAnchorPairMetrics(fromId, toId);
    if (!metrics) return null;
    return this.upsertAnchor({
      point: metrics.midpoint,
      symbolKind: "midpoint",
      label: `Meio ${metrics.fromAnchor.id}–${metrics.toAnchor.id}`,
      entityId: metrics.fromAnchor.parentEntityId,
      secondaryEntityId: metrics.toAnchor.parentEntityId,
      parameterT: 0.5,
      suggestedThetaDeg: metrics.angleDeg,
    });
  }

  /**
   * 4.4.2 — Alinha o eixo X' pelo vetor A -> B (ex: θ ≈ 53.13° para ΔX=300, ΔY=400).
   */
  public alignAxisByAnchors(
    fromId?: AnchorLabel,
    toId?: AnchorLabel,
    entities: Entity[] = [],
  ): number | null {
    const metrics = this.computeAnchorPairMetrics(fromId, toId);
    if (!metrics) return null;
    this.anchors = this.anchors.map((a) =>
      a.id === metrics.fromAnchor.id || a.id === this.activeAnchorId
        ? { ...a, thetaDeg: metrics.angleDeg }
        : a,
    );
    this.recomputeGuideMeetings(entities);
    this.notify();
    return metrics.angleDeg;
  }

  /**
   * 4.4.3 — Dividir Vão A–B (÷2, ÷3, ÷4, ÷N): posiciona N-1 pontos de snap equidistantes entre A e B.
   */
  public divideSpanBetweenAnchors(
    divisionsN: number,
    fromId?: AnchorLabel,
    toId?: AnchorLabel,
  ): SpanDivisionConfig | null {
    const metrics = this.computeAnchorPairMetrics(fromId, toId);
    if (!metrics) return null;
    const safeN = Math.max(2, Math.min(64, Math.round(divisionsN)));
    const pts: Vec2[] = [];
    for (let k = 1; k < safeN; k++) {
      const t = k / safeN;
      pts.push({
        x: Number((metrics.fromAnchor.origin.x + metrics.dx * t).toFixed(4)),
        y: Number((metrics.fromAnchor.origin.y + metrics.dy * t).toFixed(4)),
      });
    }
    this.spanDivision = {
      fromAnchor: metrics.fromAnchor.id,
      toAnchor: metrics.toAnchor.id,
      divisionsN: safeN,
      points: pts,
    };
    this.notify();
    return this.spanDivision;
  }

  public getSpanDivision(): SpanDivisionConfig | null {
    return this.spanDivision;
  }

  /**
   * 4.5.1 — Cria Guias Infinitas de Construção (máx 8) e recalcula Encontros (`Guia × Guia` e `Guia × Entidade`).
   */
  public addConstructionGuide(
    kind: ConstructionGuideKind,
    options?: {
      angleDeg?: number;
      offsetMm?: number;
      anchorId?: AnchorLabel;
      entities?: Entity[];
    },
  ): ConstructionGuideLine | null {
    const active = options?.anchorId
      ? this.getAnchor(options.anchorId)
      : this.getActive();
    if (!active) return null;

    let guideAngleDeg = active.thetaDeg;
    let origin = { ...active.origin };
    let label = `Guia X' (${active.id})`;

    if (kind === "axis_x") {
      guideAngleDeg = active.thetaDeg;
      label = `Guia X' (${active.id})`;
    } else if (kind === "axis_y") {
      guideAngleDeg = active.thetaDeg + 90;
      label = `Guia Y' (${active.id})`;
    } else if (kind === "perpendicular") {
      guideAngleDeg = active.thetaDeg + 90;
      label = `Guia ⊥ (${active.id})`;
    } else if (kind === "bisector") {
      guideAngleDeg = active.thetaDeg + 45;
      label = `Bissetriz 45° (${active.id})`;
    } else if (kind === "angled") {
      guideAngleDeg = active.thetaDeg + (options?.angleDeg ?? 30);
      label = `Guia ∠${(options?.angleDeg ?? 30).toFixed(0)}° (${active.id})`;
    } else if (kind === "parallel_offset") {
      const offset = options?.offsetMm ?? 25;
      guideAngleDeg = active.thetaDeg;
      origin = anchorLocalToWorld({ x: 0, y: offset }, active.origin, active.thetaDeg);
      label = `Paralela d=${offset}mm (${active.id})`;
    }

    const rad = (guideAngleDeg * Math.PI) / 180;
    const direction: Vec2 = {
      x: Number(Math.cos(rad).toFixed(6)),
      y: Number(Math.sin(rad).toFixed(6)),
    };

    if (this.guides.length >= MAX_CONSTRUCTION_GUIDES) {
      this.guides.shift();
    }

    const guide: ConstructionGuideLine = {
      id: `guide_${uid()}`,
      anchorId: active.id,
      kind,
      origin,
      direction,
      angleDeg: Number(guideAngleDeg.toFixed(2)),
      offsetMm: options?.offsetMm,
      label,
    };

    this.guides.push(guide);
    this.recomputeGuideMeetings(options?.entities ?? []);
    this.notify();
    return guide;
  }

  /**
   * Atalho de 1 toque para alternar o par de guias ortogonais (X' + Y') na Âncora ativa.
   */
  public toggleOrthogonalGuidesOnActive(entities: Entity[] = []): boolean {
    const active = this.getActive();
    if (!active) return false;
    const hasForActive = this.guides.some((g) => g.anchorId === active.id);
    if (hasForActive && this.guides.length >= 2) {
      this.guides = this.guides.filter((g) => g.anchorId !== active.id);
      this.recomputeGuideMeetings(entities);
      this.notify();
      return false;
    }
    this.addConstructionGuide("axis_x", { anchorId: active.id, entities });
    this.addConstructionGuide("axis_y", { anchorId: active.id, entities });
    return true;
  }

  public getGuides(): ConstructionGuideLine[] {
    return [...this.guides];
  }

  public getMeetings(): GuideMeetingPoint[] {
    return [...this.meetings];
  }

  /**
   * Recalcula todos os Encontros automáticos (`Guia × Guia` e `Guia × Entidade`).
   */
  public recomputeGuideMeetings(entities: Entity[] = []): GuideMeetingPoint[] {
    const nextMeetings: GuideMeetingPoint[] = [];
    const realEntities = entities.filter((e) => !isNonCutReferenceEntity(e));
    const far = 50000;

    // 1. Guia × Guia
    for (let i = 0; i < this.guides.length; i++) {
      const g1 = this.guides[i]!;
      const seg1: [Vec2, Vec2] = [
        { x: g1.origin.x - g1.direction.x * far, y: g1.origin.y - g1.direction.y * far },
        { x: g1.origin.x + g1.direction.x * far, y: g1.origin.y + g1.direction.y * far },
      ];
      for (let j = i + 1; j < this.guides.length; j++) {
        const g2 = this.guides[j]!;
        const seg2: [Vec2, Vec2] = [
          { x: g2.origin.x - g2.direction.x * far, y: g2.origin.y - g2.direction.y * far },
          { x: g2.origin.x + g2.direction.x * far, y: g2.origin.y + g2.direction.y * far },
        ];
        const hit = lineIntersection(seg1, seg2, false);
        if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
          nextMeetings.push({
            id: `meet_gg_${g1.id}_${g2.id}`,
            point: { x: Number(hit.x.toFixed(4)), y: Number(hit.y.toFixed(4)) },
            kind: "guide_guide",
            guideIds: [g1.id, g2.id],
            label: "Encontro Guia×Guia",
          });
        }
      }

      // 2. Guia × Entidade
      for (const ent of realEntities) {
        const hits = intersectInfiniteLineWithEntity(g1.origin, g1.direction, ent);
        for (let k = 0; k < hits.length; k++) {
          const hp = hits[k]!;
          nextMeetings.push({
            id: `meet_ge_${g1.id}_${ent.id}_${k}`,
            point: hp,
            kind: "guide_entity",
            guideIds: [g1.id],
            entityId: ent.id,
            label: "Encontro Guia×Peça",
          });
        }
      }
    }

    this.meetings = nextMeetings;
    return nextMeetings;
  }

  /**
   * Sincroniza associativamente todos os Marcos/Âncoras (`A–E`) quando qualquer entidade vinculada se move ou muda de dimensão.
   */
  public syncWithEntities(entities: Entity[]): void {
    if (this.anchors.length === 0) return;
    const byId = new Map<string, Entity>();
    for (const e of entities) {
      if (!isNonCutReferenceEntity(e)) byId.set(e.id, e);
    }

    let changed = false;
    this.anchors = this.anchors.map((anchor) => {
      if (!anchor.parentEntityId) return anchor;
      const parent = byId.get(anchor.parentEntityId);
      if (!parent) return anchor;

      const candidates = listEntityCycleCandidates(parent);
      const matched =
        (typeof anchor.cycleIndex === "number" && candidates[anchor.cycleIndex]) ||
        candidates.find((c) => c.symbolKind === anchor.symbolKind) ||
        candidates[0];

      if (!matched) return anchor;
      if (
        dist(matched.point, anchor.origin) > 1e-4 ||
        (matched.suggestedThetaDeg !== undefined &&
          Math.abs(matched.suggestedThetaDeg - anchor.thetaDeg) > 1e-3 &&
          anchor.symbolKind === "midpoint")
      ) {
        changed = true;
        return {
          ...anchor,
          origin: { ...matched.point },
          adaptiveArms: matched.adaptiveArms,
        };
      }
      return anchor;
    });

    if (this.guides.length > 0) {
      // Atualiza origens das guias de eixo X'/Y' associadas às âncoras movidas
      this.guides = this.guides.map((g) => {
        const a = this.getAnchor(g.anchorId);
        if (!a) return g;
        if (g.kind === "axis_x" || g.kind === "axis_y" || g.kind === "perpendicular" || g.kind === "bisector") {
          return { ...g, origin: { ...a.origin } };
        }
        return g;
      });
      this.recomputeGuideMeetings(entities);
      changed = true;
    }

    if (changed) {
      this.notify();
    }
  }

  /**
   * 4.5.2 — Radar de Bordas: calcula as distâncias do Marco/Âncora ativo até as 4 bordas da Área de Trabalho
   * e até a entidade mais próxima em cada direção local X'/Y'.
   */
  public setRadarEnabled(enabled: boolean): void {
    this.radarEnabled = enabled;
    this.notify();
  }

  public isRadarEnabled(): boolean {
    return this.radarEnabled;
  }

  public computeEdgeRadar(
    entities: Entity[],
    workspaceBounds = { x: 0, y: 0, w: 1500, h: 1000 },
    anchorOverride?: GeometricAnchor | null,
  ): EdgeRadarResult | null {
    const active = anchorOverride ?? this.getActive();
    if (!active) return null;
    const o = active.origin;
    const minX = workspaceBounds.x;
    const maxX = workspaceBounds.x + workspaceBounds.w;
    const minY = workspaceBounds.y;
    const maxY = workspaceBounds.y + workspaceBounds.h;

    const workspaceChips: EdgeRadarChip[] = [
      {
        id: "radar_ws_left",
        directionLabel: "BORDA ESQ",
        kind: "workspace_edge",
        distanceMm: Number(Math.abs(o.x - minX).toFixed(2)),
        fromPoint: o,
        toPoint: { x: minX, y: o.y },
      },
      {
        id: "radar_ws_right",
        directionLabel: "BORDA DIR",
        kind: "workspace_edge",
        distanceMm: Number(Math.abs(maxX - o.x).toFixed(2)),
        fromPoint: o,
        toPoint: { x: maxX, y: o.y },
      },
      {
        id: "radar_ws_top",
        directionLabel: "BORDA SUP",
        kind: "workspace_edge",
        distanceMm: Number(Math.abs(o.y - minY).toFixed(2)),
        fromPoint: o,
        toPoint: { x: o.x, y: minY },
      },
      {
        id: "radar_ws_bottom",
        directionLabel: "BORDA INF",
        kind: "workspace_edge",
        distanceMm: Number(Math.abs(maxY - o.y).toFixed(2)),
        fromPoint: o,
        toPoint: { x: o.x, y: maxY },
      },
    ];

    const dirs: { label: "+X'" | "-X'" | "+Y'" | "-Y'"; localDir: Vec2 }[] = [
      { label: "+X'", localDir: { x: 1, y: 0 } },
      { label: "-X'", localDir: { x: -1, y: 0 } },
      { label: "+Y'", localDir: { x: 0, y: 1 } },
      { label: "-Y'", localDir: { x: 0, y: -1 } },
    ];

    const entityChips: EdgeRadarChip[] = [];
    const realEntities = entities.filter(
      (e) => !isNonCutReferenceEntity(e) && e.id !== active.parentEntityId,
    );

    for (const d of dirs) {
      const worldTip = anchorLocalToWorld(d.localDir, o, active.thetaDeg);
      const rayDir = { x: worldTip.x - o.x, y: worldTip.y - o.y };
      let bestDist = Infinity;
      let bestHit: Vec2 | null = null;
      let bestEntId: string | undefined;

      for (const ent of realEntities) {
        const hits = intersectInfiniteLineWithEntity(o, rayDir, ent);
        for (const hp of hits) {
          const dot = (hp.x - o.x) * rayDir.x + (hp.y - o.y) * rayDir.y;
          if (dot <= 0.1) continue;
          const distHit = dist(o, hp);
          if (distHit > 0.1 && distHit < bestDist) {
            bestDist = distHit;
            bestHit = hp;
            bestEntId = ent.id;
          }
        }
      }

      if (bestHit && Number.isFinite(bestDist)) {
        entityChips.push({
          id: `radar_ent_${d.label}`,
          directionLabel: d.label,
          kind: "entity_edge",
          distanceMm: Number(bestDist.toFixed(2)),
          fromPoint: o,
          toPoint: bestHit,
          targetEntityId: bestEntId,
        });
      }
    }

    return {
      anchorId: active.id,
      origin: o,
      workspaceChips,
      entityChips,
    };
  }

  /**
   * 4.5.3 — Eco (Simetria e Repetição Vivas ancoradas no Marco/Âncora ativo).
   */
  public getEchoConfig(): EchoConfig {
    return { ...this.echo };
  }

  public setEchoConfig(partial: Partial<EchoConfig>): EchoConfig {
    this.echo = { ...this.echo, ...partial };
    this.notify();
    return { ...this.echo };
  }

  /**
   * Transforma uma entidade refletindo-a sobre o eixo X' ou Y' da Âncora ativa.
   */
  public reflectEntityAcrossAnchor(
    ent: Entity,
    axis: "x" | "y" | "xy",
    anchorOverride?: GeometricAnchor | null,
  ): Entity {
    const active = anchorOverride ?? this.getActive();
    if (!active) return ent;

    const mapPoint = (worldPt: Vec2): Vec2 => {
      const loc = anchorWorldToLocal(worldPt, active.origin, active.thetaDeg);
      const reflectedLocal: Vec2 = {
        x: axis === "y" || axis === "xy" ? -loc.x : loc.x,
        y: axis === "x" || axis === "xy" ? -loc.y : loc.y,
      };
      return anchorLocalToWorld(reflectedLocal, active.origin, active.thetaDeg);
    };

    if (ent.type === "line") {
      const p1 = mapPoint({ x: ent.x1, y: ent.y1 });
      const p2 = mapPoint({ x: ent.x2, y: ent.y2 });
      return {
        ...ent,
        id: `${ent.id}_echo_${axis}_${uid()}`,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      };
    }

    if (ent.type === "circle") {
      const c = mapPoint({ x: ent.cx, y: ent.cy });
      return {
        ...ent,
        id: `${ent.id}_echo_${axis}_${uid()}`,
        cx: c.x,
        cy: c.y,
      };
    }

    if (ent.type === "arc") {
      const c = mapPoint({ x: ent.cx, y: ent.cy });
      const p0 = mapPoint({
        x: ent.cx + ent.r * Math.cos(ent.a0),
        y: ent.cy + ent.r * Math.sin(ent.a0),
      });
      const p1 = mapPoint({
        x: ent.cx + ent.r * Math.cos(ent.a1),
        y: ent.cy + ent.r * Math.sin(ent.a1),
      });
      const a0 = Math.atan2(p0.y - c.y, p0.x - c.x);
      const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
      return {
        ...ent,
        id: `${ent.id}_echo_${axis}_${uid()}`,
        cx: c.x,
        cy: c.y,
        a0: axis === "xy" ? a0 : a1,
        a1: axis === "xy" ? a1 : a0,
      };
    }

    if (ent.type === "polyline") {
      return {
        ...ent,
        id: `${ent.id}_echo_${axis}_${uid()}`,
        pts: ent.pts.map(mapPoint),
      };
    }

    return ent;
  }

  /**
   * Gera as entidades de prévia ou confirmação do modo `Eco` ativo.
   */
  public computeEchoEntities(
    sourceEntities: Entity[],
    anchorOverride?: GeometricAnchor | null,
    configOverride?: EchoConfig,
  ): Entity[] {
    const active = anchorOverride ?? this.getActive();
    const cfg = configOverride ?? this.echo;
    if (!active || cfg.mode === "off" || sourceEntities.length === 0) return [];

    const result: Entity[] = [];
    for (const src of sourceEntities) {
      if (isNonCutReferenceEntity(src)) continue;
      if (cfg.mode === "mirror_x") {
        result.push(this.reflectEntityAcrossAnchor(src, "x", active));
      } else if (cfg.mode === "mirror_y") {
        result.push(this.reflectEntityAcrossAnchor(src, "y", active));
      } else if (cfg.mode === "mirror_xy") {
        result.push(
          this.reflectEntityAcrossAnchor(src, "x", active),
          this.reflectEntityAcrossAnchor(src, "y", active),
          this.reflectEntityAcrossAnchor(src, "xy", active),
        );
      } else if (cfg.mode === "radial") {
        const n = Math.max(2, Math.min(36, Math.round(cfg.radialCount || 6)));
        for (let i = 1; i < n; i++) {
          const angleRad = (i * 2 * Math.PI) / n;
          const rotated = rotateEntityAroundPivot(src, active.origin, angleRad);
          if (rotated) {
            result.push({
              ...rotated,
              id: `${src.id}_echo_rad_${i}_${uid()}`,
            });
          }
        }
      } else if (cfg.mode === "linear") {
        const count = Math.max(2, Math.min(32, Math.round(cfg.linearCount || 3)));
        const step = cfg.linearStepMm || 50;
        for (let i = 1; i < count; i++) {
          const offsetLocal: Vec2 =
            cfg.linearAxis === "x"
              ? { x: i * step, y: 0 }
              : { x: 0, y: i * step };
          const worldTarget = anchorLocalToWorld(offsetLocal, active.origin, active.thetaDeg);
          const dx = worldTarget.x - active.origin.x;
          const dy = worldTarget.y - active.origin.y;
          if (src.type === "line") {
            result.push({
              ...src,
              id: `${src.id}_echo_lin_${i}_${uid()}`,
              x1: Number((src.x1 + dx).toFixed(4)),
              y1: Number((src.y1 + dy).toFixed(4)),
              x2: Number((src.x2 + dx).toFixed(4)),
              y2: Number((src.y2 + dy).toFixed(4)),
            });
          } else if (src.type === "circle" || src.type === "arc") {
            result.push({
              ...src,
              id: `${src.id}_echo_lin_${i}_${uid()}`,
              cx: Number((src.cx + dx).toFixed(4)),
              cy: Number((src.cy + dy).toFixed(4)),
            });
          } else if (src.type === "polyline") {
            result.push({
              ...src,
              id: `${src.id}_echo_lin_${i}_${uid()}`,
              pts: src.pts.map((p) => ({
                x: Number((p.x + dx).toFixed(4)),
                y: Number((p.y + dy).toFixed(4)),
              })),
            });
          }
        }
      }
    }
    return result;
  }

  /**
   * 4.5.4 — Tabela de Coordenadas e Cotas Ordenadas a partir da Âncora (ID, X', Y', Ø) na camada COTAS + CSV.
   */
  public generateAnchorCoordinateTable(
    entities: Entity[],
    selectedIds: string[] = [],
    anchorOverride?: GeometricAnchor | null,
    layer: LayerId = "cotas",
  ): {
    rows: AnchorHoleTableRow[];
    csv: string;
    cadEntities: Entity[];
  } {
    const active = anchorOverride ?? this.getActive();
    const origin = active?.origin ?? { x: 0, y: 0 };
    const thetaDeg = active?.thetaDeg ?? 0;

    const selectedSet = new Set(selectedIds);
    const circles = entities.filter(
      (e): e is Entity & { type: "circle" } =>
        e.type === "circle" &&
        !isNonCutReferenceEntity(e) &&
        (selectedSet.size === 0 || selectedSet.has(e.id)),
    );

    const rows: AnchorHoleTableRow[] = circles.map((c, idx) => {
      const loc = anchorWorldToLocal({ x: c.cx, y: c.cy }, origin, thetaDeg);
      return {
        id: `F${idx + 1}`,
        entityId: c.id,
        localX: Number(loc.x.toFixed(2)),
        localY: Number(loc.y.toFixed(2)),
        worldX: Number(c.cx.toFixed(2)),
        worldY: Number(c.cy.toFixed(2)),
        diameter: Number((c.r * 2).toFixed(2)),
      };
    });

    const csvLines = [
      `ID,X' (mm),Y' (mm),Diametro (mm),Ancora,Angulo Eixo X' (deg)`,
      ...rows.map(
        (r) =>
          `${r.id},${r.localX.toFixed(2)},${r.localY.toFixed(2)},${r.diameter.toFixed(2)},${active?.id ?? "0"},${thetaDeg.toFixed(2)}`,
      ),
    ];

    const cadEntities: Entity[] = [];
    for (const r of rows) {
      cadEntities.push({
        id: `ord_label_${r.id}_${uid()}`,
        layer,
        type: "text",
        x: r.worldX + 8,
        y: r.worldY - 8,
        text: `${r.id}: X'=${r.localX.toFixed(1)} Y'=${r.localY.toFixed(1)} Ø${r.diameter.toFixed(1)}`,
        size: 11,
        params: {
          isAnchorCoordinateTableItem: true,
          anchorId: active?.id ?? "A",
          excludeFromCutExport: true,
        },
      });
    }

    return {
      rows,
      csv: csvLines.join("\n"),
      cadEntities,
    };
  }

  /**
   * 4.5.5 — Retorna todos os candidatos de Snap Magnético (`snapCandidates()`) gerados pelas Âncoras A–E,
   * pelos Encontros (`Guia × Guia` e `Guia × Entidade`) e pelo Divisor de Vão (`÷N`).
   */
  public snapCandidates(entities?: Entity[]): AnchorSnapCandidate[] {
    if (entities && this.guides.length > 0) {
      this.recomputeGuideMeetings(entities);
    }
    const list: AnchorSnapCandidate[] = [];

    for (const a of this.anchors) {
      list.push({
        point: { ...a.origin },
        kind: "anchor",
        label: `Âncora ${a.id} (${a.badgeLabel})`,
        anchorId: a.id,
      });
      if (a.adaptiveArms?.extremities) {
        for (const ext of a.adaptiveArms.extremities) {
          list.push({
            point: { ...ext },
            kind: "extremity",
            label: `Extremo ${a.id}`,
            anchorId: a.id,
          });
        }
      }
    }

    if (this.spanDivision) {
      this.spanDivision.points.forEach((pt, idx) => {
        list.push({
          point: { ...pt },
          kind: "span_division",
          label: `Divisão ${this.spanDivision!.fromAnchor}–${this.spanDivision!.toAnchor} ÷${this.spanDivision!.divisionsN} (${idx + 1}/${this.spanDivision!.divisionsN})`,
        });
      });
    }

    for (const m of this.meetings) {
      list.push({
        point: { ...m.point },
        kind: "meeting",
        label: m.label,
      });
    }

    return list;
  }

  /**
   * 4.5.5 — Resolve referências do `CHAMFER INTENT`:
   *   `{ anchor: 'A', dx, dy }` ou `{ anchor: 'A', r, angle }`
   */
  public resolveIntentAnchorReference(spec: {
    anchor?: AnchorLabel;
    dx?: number;
    dy?: number;
    r?: number;
    angle?: number;
  }): Vec2 | null {
    const anchor = spec.anchor ? this.getAnchor(spec.anchor) : this.getActive();
    if (!anchor) return null;

    if (typeof spec.r === "number" && Number.isFinite(spec.r)) {
      const angRad = ((spec.angle ?? 0) * Math.PI) / 180;
      const localPt = {
        x: spec.r * Math.cos(angRad),
        y: spec.r * Math.sin(angRad),
      };
      return this.toWorld(localPt, anchor);
    }

    const localPt = {
      x: spec.dx ?? 0,
      y: spec.dy ?? 0,
    };
    return this.toWorld(localPt, anchor);
  }

  /**
   * Limpeza em 2 estágios (Seção 4.5.5):
   *  - 1º ESC / Limpar: remove Guias, Encontros, Divisão ÷N, Radar e Eco
   *  - 2º ESC / Limpar: remove todos os Marcos/Âncoras (A–E)
   */
  public handleProgressiveClear(): "cleared_aux" | "cleared_anchors" | "empty" {
    const hasAux =
      this.guides.length > 0 ||
      this.spanDivision !== null ||
      this.radarEnabled ||
      this.echo.mode !== "off";

    if (hasAux) {
      this.guides = [];
      this.meetings = [];
      this.spanDivision = null;
      this.radarEnabled = false;
      this.echo = { ...this.echo, mode: "off" };
      this.notify();
      return "cleared_aux";
    }

    if (this.anchors.length > 0) {
      this.anchors = [];
      this.activeAnchorId = null;
      this.notify();
      return "cleared_anchors";
    }

    return "empty";
  }

  public clearAll(): void {
    this.anchors = [];
    this.activeAnchorId = null;
    this.guides = [];
    this.meetings = [];
    this.spanDivision = null;
    this.radarEnabled = false;
    this.echo = {
      mode: "off",
      radialCount: 6,
      linearCount: 3,
      linearStepMm: 50,
      linearAxis: "x",
    };
    this.notify();
  }

  public getSnapshot(): ReferenceServiceSnapshot {
    return {
      anchors: this.anchors.map((a) => ({ ...a, origin: { ...a.origin } })),
      activeAnchorId: this.activeAnchorId,
      guides: this.guides.map((g) => ({
        ...g,
        origin: { ...g.origin },
        direction: { ...g.direction },
      })),
      spanDivision: this.spanDivision
        ? {
            ...this.spanDivision,
            points: this.spanDivision.points.map((p) => ({ ...p })),
          }
        : null,
      radarEnabled: this.radarEnabled,
      echo: { ...this.echo },
      coordinateInputMode: this.coordinateInputMode,
    };
  }

  public restoreSnapshot(
    snapshot: ReferenceServiceSnapshot,
    entities: Entity[] = [],
  ): void {
    this.anchors = snapshot.anchors.map((a) => ({ ...a, origin: { ...a.origin } }));
    this.activeAnchorId = snapshot.activeAnchorId;
    this.guides = snapshot.guides.map((g) => ({
      ...g,
      origin: { ...g.origin },
      direction: { ...g.direction },
    }));
    this.spanDivision = snapshot.spanDivision
      ? {
          ...snapshot.spanDivision,
          points: snapshot.spanDivision.points.map((p) => ({ ...p })),
        }
      : null;
    this.radarEnabled = snapshot.radarEnabled;
    this.echo = { ...snapshot.echo };
    this.coordinateInputMode = snapshot.coordinateInputMode;
    this.recomputeGuideMeetings(entities);
    this.notify();
  }

  public getState(): ReferenceServiceState {
    return {
      ...this.getSnapshot(),
      meetings: [...this.meetings],
    };
  }

  public subscribe(listener: (state: ReferenceServiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

export const ReferenceService = new ReferenceServiceManager();
