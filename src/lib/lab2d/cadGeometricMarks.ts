/**
 * CALDRA CHAMFER — MARCO GEOMÉTRICO ASSOCIATIVO & DIVISOR RELACIONAL + DATUM PERSISTENTE
 *
 * Implementa:
 * 1. MARCO GEOMÉTRICO (`GeometricMark`):
 *    - Entidade técnica associativa de referência topológica em violeta (#A855F7 / #C084FC).
 *    - SEM opção de fixar/travar manual (sem cadeado).
 *    - Modo 1 (Captura Direta — 1 Toque): Vértice, Centro, Ponto Médio, Quadrante, Tangência, Interseção.
 *      Acompanha automaticamente a peça quando movida, rotacionada ou redimensionada (associatividade real).
 *      Sinaliza órfão (`isOrphan = true`) se a geometria pai for excluída.
 *    - Modo 2 (Síntese Relacional entre 2 Elementos — 2 Toques):
 *      a) Ponto Médio / Centro de Simetria entre 2 pontos, 2 furos ou 2 bordas;
 *      b) Interseção Projetada (Virtual) entre 2 segmentos/bordas não colineares que não se tocam;
 *      c) Divisão Relacional de Vão (÷N: ÷2, ÷3, ÷4, ÷5...) gerando N-1 Marcos Geométricos associativos.
 *    - Tamanho visual invariante ao zoom (calculado em pixels de tela / viewK).
 *    - Nunca exportado como linha de corte física no DXF.
 *
 * 2. DATUM PERSISTENTE (`PersistentDatum`):
 *    - Permanece visível, ativo e selecionável após soltar o dedo/ponteiro (participa do Undo/Redo e projeto).
 *    - Exibe projeção vetorial real nos dois catetos (ΔX horizontal, ΔY vertical) e hipotenusa (L e ∠).
 *    - Permite selecionar/destacar qualquer medida (ΔX, ΔY, L, ∠), editar seu valor exato via teclado numérico
 *      e converter diretamente ΔX, ΔY, L ou Catetos X+Y em entidades `LINE` reais do CAD.
 */

import type { Vec2 } from "@/lib/geometry/types";
import {
  type Entity,
  type LayerId,
  dist,
  uid,
  entityPoints,
  segmentsOf,
  lineIntersection,
  closestOnSegment,
} from "./core";

export const GEOMETRIC_MARK_VIOLET_PRIMARY = "#A855F7";
export const GEOMETRIC_MARK_VIOLET_SECONDARY = "#C084FC";
export const GEOMETRIC_MARK_VIOLET_GLOW = "rgba(168, 85, 247, 0.22)";

export type GeometricMarkReferenceType =
  | "vertex"
  | "midpoint"
  | "center"
  | "quadrant"
  | "tangent"
  | "intersection"
  | "virtual_intersection"
  | "symmetry_midpoint"
  | "span_division"
  | "free_point";

export interface GeometricMarkSpec {
  kind: "geometric_mark";
  referenceType: GeometricMarkReferenceType;
  /** ID da entidade pai principal (Modo 1 ou 1º elemento do Modo 2) */
  parentEntityId?: string;
  /** ID da segunda entidade pai (Modo 2: síntese entre 2 elementos) */
  secondaryEntityId?: string;
  /** Índice do vértice ou segmento na entidade pai */
  vertexIndex?: number;
  secondaryVertexIndex?: number;
  /** Parâmetro normalizado t in [0, 1] ao longo de segmento, arco ou vão */
  parameterT?: number;
  /** Ângulo em radianos (para quadrante/ponto em círculo ou arco) */
  angleRad?: number;
  /** Número total de divisões N quando criado por Divisão de Vão (÷N) */
  divisionTotalN?: number;
  /** Índice k (1..N-1) dentro da divisão ÷N */
  divisionStepK?: number;
  /** Coordenadas locais/âncoras de fallback caso uma das referências seja ponto livre */
  anchorA?: Vec2;
  anchorB?: Vec2;
  /** Indica se a entidade pai foi removida do desenho */
  isOrphan?: boolean;
  /** Rótulo técnico curto (ex: "MG · Centro", "MG · ÷4 (2/4)", "MG · Int. Virtual") */
  badgeLabel?: string;
}

export type DatumSelectedComponent = "dx" | "dy" | "L" | "angle" | null;
export type DatumComponentKind = "dx" | "dy" | "L" | "angle";
export type RelationalSynthesisMode =
  | "symmetry_midpoint"
  | "virtual_intersection"
  | "span_division";

export interface PersistentDatumSpec {
  id?: string;
  kind?: "persistent_datum";
  /** Ponto de origem A = (x1, y1) do DATUM */
  origin: Vec2;
  /** Ponto alvo B = (x2, y2) do DATUM */
  target: Vec2;
  /** Componente atualmente selecionada/destacada pelo usuário */
  selectedComponent?: DatumSelectedComponent;
  /** Rótulo opcional */
  label?: string;
  /** Visibilidade */
  visible?: boolean;
  createdAt?: number;
}

/** Verifica se uma entidade do CAD é um Marco Geométrico associativo. */
export function isGeometricMarkEntity(e: Entity | null | undefined): boolean {
  if (!e) return false;
  return (
    e.type === "point" &&
    (e.params?.cadSemanticKind === "geometric_mark" || e.params?.isGeometricMark === true)
  );
}

/** Verifica se uma entidade do CAD é um DATUM Persistente. */
export function isPersistentDatumEntity(e: Entity | null | undefined): boolean {
  if (!e) return false;
  return (
    e.type === "point" &&
    (e.params?.cadSemanticKind === "persistent_datum" || e.params?.isPersistentDatum === true)
  );
}

/** Verifica se uma entidade é puramente de referência auxiliar (Marco Geométrico ou Datum Persistente) e não deve ir para corte físico DXF. */
export function isNonCutReferenceEntity(e: Entity | null | undefined): boolean {
  return isGeometricMarkEntity(e) || isPersistentDatumEntity(e);
}

/** Extrai a especificação tipada de um Marco Geométrico a partir de uma Entity. */
export function getGeometricMarkSpec(e: Entity): (GeometricMarkSpec & {
  subType?: GeometricMarkReferenceType;
  divisionIndex?: number;
  divisionTotal?: number;
  visible?: boolean;
}) | null {
  if (!isGeometricMarkEntity(e) || e.type !== "point") return null;
  const raw = e.params?.geometricMarkSpec as GeometricMarkSpec | undefined;
  if (!raw || typeof raw !== "object") {
    return {
      kind: "geometric_mark",
      referenceType: "free_point",
      subType: "free_point",
      badgeLabel: e.label ?? "Marco Geométrico",
    };
  }
  return {
    ...raw,
    subType: raw.referenceType,
    divisionIndex: raw.divisionStepK,
    divisionTotal: raw.divisionTotalN,
  };
}

/** Extrai a especificação tipada de um DATUM Persistente a partir de uma Entity. */
export function getPersistentDatumSpec(e: Entity): PersistentDatumSpec | null {
  if (!isPersistentDatumEntity(e) || e.type !== "point") return null;
  const raw = e.params?.persistentDatumSpec as PersistentDatumSpec | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id ?? e.id,
    kind: "persistent_datum",
    origin: raw.origin ?? { x: e.x, y: e.y },
    target: raw.target ?? { x: e.x + 50, y: e.y - 40 },
    selectedComponent: raw.selectedComponent ?? null,
    label: raw.label ?? e.label ?? "DATUM",
    visible: raw.visible !== false,
  };
}

/**
 * Cria uma entidade de Marco Geométrico associativo pronta para ser inserida na lista de entidades
 * (participando nativamente de Undo/Redo, camadas e salvamento do projeto).
 */
export function createGeometricMarkEntity(
  position: Vec2,
  spec: Omit<GeometricMarkSpec, "kind">,
  layer: LayerId = "referencia",
): Entity & { type: "point"; position: Vec2; spec: GeometricMarkSpec } {
  const cleanPos = {
    x: Number(position.x.toFixed(4)),
    y: Number(position.y.toFixed(4)),
  };
  const fullSpec: GeometricMarkSpec = {
    kind: "geometric_mark",
    ...spec,
  };
  return {
    id: `gmark_${uid()}`,
    layer,
    type: "point",
    x: cleanPos.x,
    y: cleanPos.y,
    position: cleanPos,
    spec: fullSpec,
    label: fullSpec.badgeLabel ?? formatGeometricMarkLabel(fullSpec),
    isConstruction: true,
    params: {
      isGeometricMark: true,
      cadSemanticKind: "geometric_mark",
      geometricMarkSpec: fullSpec,
      excludeFromCutExport: true,
    },
  };
}

export function formatGeometricMarkLabel(spec: GeometricMarkSpec): string {
  switch (spec.referenceType) {
    case "center":
      return "Marco · Centro";
    case "vertex":
      return "Marco · Vértice";
    case "midpoint":
      return "Marco · Ponto Médio";
    case "quadrant":
      return "Marco · Quadrante";
    case "tangent":
      return "Marco · Tangência";
    case "intersection":
      return "Marco · Interseção";
    case "virtual_intersection":
      return "Marco · Interseção Virtual";
    case "symmetry_midpoint":
      return "Marco · Simetria / Meio";
    case "span_division":
      return spec.divisionTotalN
        ? `Marco · ÷${spec.divisionTotalN} (${spec.divisionStepK ?? 1}/${spec.divisionTotalN})`
        : "Marco · Divisão";
    default:
      return "Marco Geométrico";
  }
}

/**
 * Resolve analiticamente um ponto em uma entidade pai dado um tipo de referência e índices/parâmetros.
 */
export function resolvePointOnParentEntity(
  parent: Entity,
  refType: GeometricMarkReferenceType,
  vertexIndex = 0,
  parameterT = 0.5,
  angleRad = 0,
): Vec2 | null {
  if (parent.type === "circle") {
    if (refType === "center") {
      return { x: parent.cx, y: parent.cy };
    }
    if (refType === "quadrant" || refType === "tangent" || refType === "vertex") {
      return {
        x: parent.cx + parent.r * Math.cos(angleRad),
        y: parent.cy + parent.r * Math.sin(angleRad),
      };
    }
    return { x: parent.cx, y: parent.cy };
  }

  if (parent.type === "arc") {
    if (refType === "center") {
      return { x: parent.cx, y: parent.cy };
    }
    if (refType === "vertex") {
      const a = vertexIndex === 1 ? parent.a1 : parent.a0;
      return {
        x: parent.cx + parent.r * Math.cos(a),
        y: parent.cy + parent.r * Math.sin(a),
      };
    }
    if (refType === "midpoint") {
      let a0 = parent.a0;
      let a1 = parent.a1;
      if (a1 <= a0) a1 += Math.PI * 2;
      const midA = a0 + (a1 - a0) * parameterT;
      return {
        x: parent.cx + parent.r * Math.cos(midA),
        y: parent.cy + parent.r * Math.sin(midA),
      };
    }
    return {
      x: parent.cx + parent.r * Math.cos(angleRad),
      y: parent.cy + parent.r * Math.sin(angleRad),
    };
  }

  if (parent.type === "ellipse") {
    if (refType === "center") {
      return { x: parent.cx, y: parent.cy };
    }
    const rot = parent.rotation ?? 0;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const lx = parent.rx * Math.cos(angleRad);
    const ly = parent.ry * Math.sin(angleRad);
    return {
      x: parent.cx + lx * cosR - ly * sinR,
      y: parent.cy + lx * sinR + ly * cosR,
    };
  }

  if (parent.type === "line") {
    const p1 = { x: parent.x1, y: parent.y1 };
    const p2 = { x: parent.x2, y: parent.y2 };
    if (refType === "vertex") {
      return vertexIndex === 1 ? p2 : p1;
    }
    const t = Number.isFinite(parameterT) ? parameterT : 0.5;
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  }

  if (parent.type === "polyline") {
    const pts = parent.pts;
    if (pts.length === 0) return null;
    if (refType === "center") {
      let sx = 0;
      let sy = 0;
      for (const p of pts) {
        sx += p.x;
        sy += p.y;
      }
      return { x: sx / pts.length, y: sy / pts.length };
    }
    if (refType === "vertex") {
      const idx = Math.max(0, Math.min(pts.length - 1, vertexIndex));
      return { ...pts[idx]! };
    }
    const segs = segmentsOf(parent);
    if (segs.length > 0) {
      const segIdx = Math.max(0, Math.min(segs.length - 1, vertexIndex));
      const [a, b] = segs[segIdx]!;
      const t = Number.isFinite(parameterT) ? parameterT : 0.5;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }
    return { ...pts[0]! };
  }

  const pts = entityPoints(parent);
  if (pts.length > 0) {
    const idx = Math.max(0, Math.min(pts.length - 1, vertexIndex));
    return { ...pts[idx]! };
  }
  return null;
}

export interface GeometricMarkEntityCreation {
  position: Vec2;
  spec: Omit<GeometricMarkSpec, "kind">;
}

/**
 * Infere automaticamente o melhor vínculo associativo (Modo 1) ao capturar um ponto sobre ou próximo
 * de uma entidade existente e retorna a Entity `point` associativa pronta para `commit`.
 */
export function inferAssociativeMarkFromPoint(
  point: Vec2,
  entities: Entity[],
  layerOrTolerance: LayerId | number = "referencia",
  smartSnapOrKind?: { kind?: string; entityId?: string } | string | null,
  toleranceOrEntityId?: number | string,
): Entity & { type: "point"; position: Vec2; spec: GeometricMarkSpec } {
  const layer: LayerId =
    typeof layerOrTolerance === "string" ? layerOrTolerance : "referencia";
  const toleranceWorld: number =
    typeof layerOrTolerance === "number"
      ? layerOrTolerance
      : typeof toleranceOrEntityId === "number"
        ? toleranceOrEntityId
        : 15;
  const preferredSnapKind: string | undefined =
    typeof smartSnapOrKind === "string"
      ? smartSnapOrKind
      : smartSnapOrKind && typeof smartSnapOrKind === "object"
        ? smartSnapOrKind.kind
        : undefined;
  const preferredEntityId: string | undefined =
    typeof toleranceOrEntityId === "string"
      ? toleranceOrEntityId
      : smartSnapOrKind && typeof smartSnapOrKind === "object"
        ? smartSnapOrKind.entityId
        : undefined;

  const candidates = entities.filter((e) => !isNonCutReferenceEntity(e));
  let targetEntity = preferredEntityId
    ? candidates.find((e) => e.id === preferredEntityId)
    : undefined;

  if (!targetEntity) {
    let bestD = toleranceWorld * 2.5;
    for (const ent of candidates) {
      if (ent.type === "circle" || ent.type === "arc" || ent.type === "ellipse") {
        const dCenter = dist(point, { x: ent.cx, y: ent.cy });
        if (dCenter <= bestD) {
          bestD = dCenter;
          targetEntity = ent;
        }
        if (ent.type === "circle" || ent.type === "arc") {
          const dEdge = Math.abs(dCenter - ent.r);
          if (dEdge <= bestD) {
            bestD = dEdge;
            targetEntity = ent;
          }
        }
      }
      for (const s of segmentsOf(ent)) {
        const cp = closestOnSegment(point, s);
        const dSeg = dist(point, cp);
        if (dSeg <= bestD) {
          bestD = dSeg;
          targetEntity = ent;
        }
      }
    }
  }

  if (!targetEntity) {
    return createGeometricMarkEntity(
      point,
      {
        referenceType: preferredSnapKind === "intersection" ? "intersection" : "free_point",
        badgeLabel:
          preferredSnapKind === "intersection" ? "Marco · Interseção" : "Marco Geométrico",
      },
      layer,
    );
  }

  return buildAssociativeMarkForTargetEntity(
    point,
    targetEntity,
    toleranceWorld,
    preferredSnapKind,
    layer,
  );
}

/**
 * Avalia estritamente se o ponto da Mira 55px + SNAP capturou um ponto geométrico real
 * de uma entidade existente (Centro, Vértice/Extremidade, Ponto Médio, Interseção, Quadrante, Tangência).
 * Se o toque/mira estiver no espaço vazio (sem geometria próxima), retorna `null` (JAMAIS cria marcos órfãos no vazio!).
 */
export function inferValidGeometricMarkCandidate(
  point: Vec2,
  entities: Entity[],
  layer: LayerId = "referencia",
  smartSnap?: { p?: Vec2; kind?: string; entityId?: string; secondaryEntityId?: string } | null,
  toleranceWorld = 18,
): (Entity & { type: "point"; position: Vec2; spec: GeometricMarkSpec }) | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const candidates = entities.filter((e) => !isNonCutReferenceEntity(e));
  if (candidates.length === 0) return null;

  const effectivePt =
    smartSnap?.p &&
    Number.isFinite(smartSnap.p.x) &&
    Number.isFinite(smartSnap.p.y) &&
    smartSnap.kind !== "grid"
      ? smartSnap.p
      : point;

  // Procura a entidade real mais próxima dentro do raio estrito de captura
  let bestEntity: Entity | undefined = smartSnap?.entityId
    ? candidates.find((e) => e.id === smartSnap.entityId)
    : undefined;

  let minD = Infinity;
  for (const ent of candidates) {
    if (ent.type === "circle" || ent.type === "arc" || ent.type === "ellipse") {
      const dCenter = dist(effectivePt, { x: ent.cx, y: ent.cy });
      if (dCenter < minD) {
        minD = dCenter;
        if (!bestEntity) bestEntity = ent;
      }
      if (ent.type === "circle" || ent.type === "arc") {
        const dEdge = Math.abs(dCenter - ent.r);
        if (dEdge < minD) {
          minD = dEdge;
          if (!bestEntity || dEdge < dCenter) bestEntity = ent;
        }
      }
    }
    if (ent.type === "polyline" && ent.closed && ent.pts.length >= 3) {
      let sx = 0;
      let sy = 0;
      for (const p of ent.pts) {
        sx += p.x;
        sy += p.y;
      }
      const c = { x: sx / ent.pts.length, y: sy / ent.pts.length };
      const dCentroid = dist(effectivePt, c);
      if (dCentroid < minD) {
        minD = dCentroid;
        if (!bestEntity) bestEntity = ent;
      }
    }
    for (const s of segmentsOf(ent)) {
      const cp = closestOnSegment(effectivePt, s);
      const dSeg = dist(effectivePt, cp);
      if (dSeg < minD) {
        minD = dSeg;
        bestEntity = ent;
      }
    }
  }

  // Se não há nenhuma entidade real dentro da tolerância, é espaço vazio -> retorna null!
  if (!bestEntity || minD > toleranceWorld) {
    return null;
  }

  return buildAssociativeMarkForTargetEntity(
    effectivePt,
    bestEntity,
    toleranceWorld,
    smartSnap?.kind,
    layer,
  );
}

/**
 * Remove todos os Marcos Geométricos (ou apenas os órfãos) da lista de entidades.
 */
export function clearGeometricMarksFromEntities(
  entities: Entity[],
  onlyOrphans = false,
): { cleaned: Entity[]; removedCount: number } {
  let removedCount = 0;
  const cleaned = entities.filter((e) => {
    if (!isGeometricMarkEntity(e)) return true;
    if (onlyOrphans) {
      const spec = getGeometricMarkSpec(e);
      if (spec?.isOrphan || !spec?.parentEntityId) {
        removedCount += 1;
        return false;
      }
      return true;
    }
    removedCount += 1;
    return false;
  });
  return { cleaned, removedCount };
}

function buildAssociativeMarkForTargetEntity(
  point: Vec2,
  targetEntity: Entity,
  toleranceWorld: number,
  preferredSnapKind: string | undefined,
  layer: LayerId,
): Entity & { type: "point"; position: Vec2; spec: GeometricMarkSpec } {

  if (targetEntity.type === "circle") {
    const dCenter = dist(point, { x: targetEntity.cx, y: targetEntity.cy });
    if (dCenter <= toleranceWorld * 1.5 || preferredSnapKind === "center") {
      return createGeometricMarkEntity(
        { x: targetEntity.cx, y: targetEntity.cy },
        {
          referenceType: "center",
          parentEntityId: targetEntity.id,
          badgeLabel: "Marco · Centro",
        },
        layer,
      );
    }
    const angleRad = Math.atan2(point.y - targetEntity.cy, point.x - targetEntity.cx);
    const isQuad =
      preferredSnapKind === "quadrant" ||
      Math.abs(Math.abs(angleRad) % (Math.PI / 2)) < 0.08 ||
      Math.abs((Math.abs(angleRad) % (Math.PI / 2)) - Math.PI / 2) < 0.08;
    const pos = {
      x: targetEntity.cx + targetEntity.r * Math.cos(angleRad),
      y: targetEntity.cy + targetEntity.r * Math.sin(angleRad),
    };
    return createGeometricMarkEntity(
      pos,
      {
        referenceType: isQuad ? "quadrant" : "tangent",
        parentEntityId: targetEntity.id,
        angleRad,
        badgeLabel: isQuad ? "Marco · Quadrante" : "Marco · Borda Circular",
      },
      layer,
    );
  }

  if (targetEntity.type === "arc") {
    const dCenter = dist(point, { x: targetEntity.cx, y: targetEntity.cy });
    if (dCenter <= toleranceWorld * 1.5 || preferredSnapKind === "center") {
      return createGeometricMarkEntity(
        { x: targetEntity.cx, y: targetEntity.cy },
        {
          referenceType: "center",
          parentEntityId: targetEntity.id,
          badgeLabel: "Marco · Centro de Arco",
        },
        layer,
      );
    }
    const p0 = {
      x: targetEntity.cx + targetEntity.r * Math.cos(targetEntity.a0),
      y: targetEntity.cy + targetEntity.r * Math.sin(targetEntity.a0),
    };
    const p1 = {
      x: targetEntity.cx + targetEntity.r * Math.cos(targetEntity.a1),
      y: targetEntity.cy + targetEntity.r * Math.sin(targetEntity.a1),
    };
    if (dist(point, p0) <= toleranceWorld) {
      return createGeometricMarkEntity(
        p0,
        {
          referenceType: "vertex",
          parentEntityId: targetEntity.id,
          vertexIndex: 0,
          badgeLabel: "Marco · Vértice",
        },
        layer,
      );
    }
    if (dist(point, p1) <= toleranceWorld) {
      return createGeometricMarkEntity(
        p1,
        {
          referenceType: "vertex",
          parentEntityId: targetEntity.id,
          vertexIndex: 1,
          badgeLabel: "Marco · Vértice",
        },
        layer,
      );
    }
    const angleRad = Math.atan2(point.y - targetEntity.cy, point.x - targetEntity.cx);
    return createGeometricMarkEntity(
      {
        x: targetEntity.cx + targetEntity.r * Math.cos(angleRad),
        y: targetEntity.cy + targetEntity.r * Math.sin(angleRad),
      },
      {
        referenceType: "midpoint",
        parentEntityId: targetEntity.id,
        parameterT: 0.5,
        angleRad,
        badgeLabel: "Marco · Arco",
      },
      layer,
    );
  }

  if (targetEntity.type === "line") {
    const p1 = { x: targetEntity.x1, y: targetEntity.y1 };
    const p2 = { x: targetEntity.x2, y: targetEntity.y2 };
    if (dist(point, p1) <= toleranceWorld * 1.2) {
      return createGeometricMarkEntity(
        p1,
        {
          referenceType: "vertex",
          parentEntityId: targetEntity.id,
          vertexIndex: 0,
          badgeLabel: "Marco · Vértice",
        },
        layer,
      );
    }
    if (dist(point, p2) <= toleranceWorld * 1.2) {
      return createGeometricMarkEntity(
        p2,
        {
          referenceType: "vertex",
          parentEntityId: targetEntity.id,
          vertexIndex: 1,
          badgeLabel: "Marco · Vértice",
        },
        layer,
      );
    }
    const lenSq = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
    const rawT =
      lenSq > 1e-8
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / lenSq,
            ),
          )
        : 0.5;
    const t = Math.abs(rawT - 0.5) < 0.08 ? 0.5 : rawT;
    const pos = {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
    return createGeometricMarkEntity(
      pos,
      {
        referenceType: Math.abs(t - 0.5) < 1e-3 ? "midpoint" : "vertex",
        parentEntityId: targetEntity.id,
        parameterT: t,
        badgeLabel: Math.abs(t - 0.5) < 1e-3 ? "Marco · Ponto Médio" : "Marco · Segmento",
      },
      layer,
    );
  }

  if (targetEntity.type === "polyline") {
    for (let i = 0; i < targetEntity.pts.length; i++) {
      const vp = targetEntity.pts[i]!;
      if (dist(point, vp) <= toleranceWorld * 1.25) {
        return createGeometricMarkEntity(
          { ...vp },
          {
            referenceType: "vertex",
            parentEntityId: targetEntity.id,
            vertexIndex: i,
            badgeLabel: "Marco · Vértice",
          },
          layer,
        );
      }
    }
    if (targetEntity.closed && targetEntity.pts.length >= 3) {
      let sx = 0;
      let sy = 0;
      for (const p of targetEntity.pts) {
        sx += p.x;
        sy += p.y;
      }
      const center = { x: sx / targetEntity.pts.length, y: sy / targetEntity.pts.length };
      if (dist(point, center) <= toleranceWorld * 1.5 || preferredSnapKind === "center") {
        return createGeometricMarkEntity(
          center,
          {
            referenceType: "center",
            parentEntityId: targetEntity.id,
            badgeLabel: "Marco · Centro",
          },
          layer,
        );
      }
    }
    const segs = segmentsOf(targetEntity);
    let bestSegIdx = 0;
    let bestT = 0.5;
    let bestDist = Infinity;
    let bestPos = point;
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i]!;
      const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const rawT =
        lenSq > 1e-8
          ? Math.max(
              0,
              Math.min(
                1,
                ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lenSq,
              ),
            )
          : 0.5;
      const t = Math.abs(rawT - 0.5) < 0.08 ? 0.5 : rawT;
      const proj = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const d = dist(point, proj);
      if (d < bestDist) {
        bestDist = d;
        bestSegIdx = i;
        bestT = t;
        bestPos = proj;
      }
    }
    return createGeometricMarkEntity(
      bestPos,
      {
        referenceType: "midpoint",
        parentEntityId: targetEntity.id,
        vertexIndex: bestSegIdx,
        parameterT: bestT,
        badgeLabel: Math.abs(bestT - 0.5) < 1e-3 ? "Marco · Ponto Médio" : "Marco · Borda",
      },
      layer,
    );
  }

  return createGeometricMarkEntity(
    point,
    {
      referenceType: "free_point",
      parentEntityId: targetEntity.id,
      badgeLabel: "Marco Geométrico",
    },
    layer,
  );
}

/**
 * MODO 2 — Síntese Relacional entre 2 Elementos / Referências:
 *  - "symmetry_midpoint": Ponto Médio / Centro de Simetria exato entre Ref A e Ref B
 *  - "virtual_intersection": Interseção Projetada (Virtual) entre 2 segmentos/bordas não paralelos
 *  - "span_division": Divisão Relacional de Vão em N partes iguais (gera N-1 Marcos Geométricos associativos)
 */
export interface RelationalReferencePick {
  point: Vec2;
  entityId?: string;
  vertexIndex?: number;
  parameterT?: number;
  segment?: [Vec2, Vec2];
  label?: string;
}

export function computeRelationalVirtualIntersection(
  arg1: RelationalReferencePick | Entity | null | undefined,
  arg2: RelationalReferencePick | Entity | null | undefined,
  arg3?: Entity[] | Vec2,
  arg4?: Vec2,
): Vec2 | null {
  let segA: [Vec2, Vec2] | null = null;
  let segB: [Vec2, Vec2] | null = null;

  if (Array.isArray(arg3)) {
    const pickA = arg1 as RelationalReferencePick;
    const pickB = arg2 as RelationalReferencePick;
    segA = pickA?.segment ?? (pickA ? findClosestSegmentForPick(pickA, arg3) : null);
    segB = pickB?.segment ?? (pickB ? findClosestSegmentForPick(pickB, arg3) : null);
  } else {
    const entA = arg1 as Entity | null | undefined;
    const entB = arg2 as Entity | null | undefined;
    const pA = (arg3 as Vec2 | undefined) ?? { x: 0, y: 0 };
    const pB = arg4 ?? { x: 0, y: 0 };
    if (entA) {
      const segs = segmentsOf(entA);
      if (segs.length === 1) segA = segs[0]!;
      else if (segs.length > 1) {
        let best = segs[0]!;
        let bestD = Infinity;
        for (const s of segs) {
          const d = dist(pA, closestOnSegment(pA, s));
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        segA = best;
      }
    }
    if (entB) {
      const segs = segmentsOf(entB);
      if (segs.length === 1) segB = segs[0]!;
      else if (segs.length > 1) {
        let best = segs[0]!;
        let bestD = Infinity;
        for (const s of segs) {
          const d = dist(pB, closestOnSegment(pB, s));
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        segB = best;
      }
    }
  }

  if (!segA || !segB) return null;
  const hit = lineIntersection(segA, segB, false);
  if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return null;
  return hit;
}

function findClosestSegmentForPick(
  pick: RelationalReferencePick,
  entities: Entity[],
): [Vec2, Vec2] | null {
  if (pick.entityId) {
    const ent = entities.find((e) => e.id === pick.entityId);
    if (ent) {
      const segs = segmentsOf(ent);
      if (segs.length === 1) return segs[0]!;
      if (segs.length > 1) {
        let best = segs[0]!;
        let bestD = Infinity;
        for (const s of segs) {
          const d = dist(pick.point, closestOnSegment(pick.point, s));
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        return best;
      }
    }
  }
  return null;
}

/**
 * Gera os Marcos Geométricos do Modo 2 (Síntese Relacional entre 2 Elementos):
 * Aceita tanto `(pA, pB, entA, entB, mode, layer, divN)` quanto `(pickA, pickB, mode, entities, divN, layer)`.
 */
export function buildRelationalGeometricMarks(
  arg1: Vec2 | RelationalReferencePick,
  arg2: Vec2 | RelationalReferencePick,
  arg3: Entity | null | undefined | RelationalSynthesisMode,
  arg4?: Entity | null | undefined | Entity[],
  arg5?: RelationalSynthesisMode | number,
  arg6?: LayerId,
  arg7?: number,
): (Entity & { type: "point" })[] {
  let pA: Vec2;
  let pB: Vec2;
  let entA: Entity | null | undefined;
  let entB: Entity | null | undefined;
  let mode: RelationalSynthesisMode;
  let layer: LayerId = "referencia";
  let divisionN = 2;

  if ("point" in arg1 && "point" in arg2) {
    pA = arg1.point;
    pB = arg2.point;
    mode = arg3 as RelationalSynthesisMode;
    const ents = Array.isArray(arg4) ? arg4 : [];
    entA = arg1.entityId ? ents.find((e) => e.id === arg1.entityId) : null;
    entB = arg2.entityId ? ents.find((e) => e.id === arg2.entityId) : null;
    divisionN = typeof arg5 === "number" ? arg5 : 2;
    layer = arg6 ?? "referencia";
  } else {
    pA = arg1 as Vec2;
    pB = arg2 as Vec2;
    entA = arg3 as Entity | null | undefined;
    entB = arg4 as Entity | null | undefined;
    mode = (arg5 as RelationalSynthesisMode) ?? "symmetry_midpoint";
    layer = arg6 ?? "referencia";
    divisionN = typeof arg7 === "number" ? arg7 : 2;
  }

  if (mode === "symmetry_midpoint") {
    const mid: Vec2 = {
      x: (pA.x + pB.x) / 2,
      y: (pA.y + pB.y) / 2,
    };
    return [
      createGeometricMarkEntity(
        mid,
        {
          referenceType: "symmetry_midpoint",
          parentEntityId: entA?.id,
          secondaryEntityId: entB?.id,
          parameterT: 0.5,
          anchorA: { ...pA },
          anchorB: { ...pB },
          badgeLabel: "Marco · Centro de Simetria",
        },
        layer,
      ),
    ];
  }

  if (mode === "virtual_intersection") {
    const vInt = computeRelationalVirtualIntersection(entA, entB, pA, pB);
    if (!vInt) return [];
    return [
      createGeometricMarkEntity(
        vInt,
        {
          referenceType: "virtual_intersection",
          parentEntityId: entA?.id,
          secondaryEntityId: entB?.id,
          anchorA: { ...pA },
          anchorB: { ...pB },
          badgeLabel: "Marco · Interseção Virtual",
        },
        layer,
      ),
    ];
  }

  const safeN = Math.max(2, Math.min(32, Math.round(divisionN)));
  const marks: (Entity & { type: "point" })[] = [];
  for (let k = 1; k < safeN; k++) {
    const t = k / safeN;
    const pt: Vec2 = {
      x: pA.x + (pB.x - pA.x) * t,
      y: pA.y + (pB.y - pA.y) * t,
    };
    marks.push(
      createGeometricMarkEntity(
        pt,
        {
          referenceType: "span_division",
          parentEntityId: entA?.id,
          secondaryEntityId: entB?.id,
          parameterT: t,
          divisionTotalN: safeN,
          divisionStepK: k,
          anchorA: { ...pA },
          anchorB: { ...pB },
          badgeLabel: `Marco · ÷${safeN} (${k}/${safeN})`,
        },
        layer,
      ),
    );
  }
  return marks;
}

/**
 * Recalcula associativamente a posição de todos os Marcos Geométricos na lista de entidades
 * sempre que qualquer peça pai for movida, rotacionada, redimensionada ou excluída.
 */
export function syncAssociativeGeometricMarks(entities: Entity[]): Entity[] {
  const hasMarks = entities.some(isGeometricMarkEntity);
  if (!hasMarks) return entities;

  const byId = new Map<string, Entity>();
  for (const e of entities) {
    if (!isGeometricMarkEntity(e)) {
      byId.set(e.id, e);
    }
  }

  let changed = false;
  const next = entities.map((ent) => {
    if (!isGeometricMarkEntity(ent) || ent.type !== "point") return ent;
    const spec = getGeometricMarkSpec(ent);
    if (!spec) return ent;

    if (
      spec.referenceType === "symmetry_midpoint" ||
      spec.referenceType === "span_division" ||
      spec.referenceType === "virtual_intersection"
    ) {
      const parentA = spec.parentEntityId ? byId.get(spec.parentEntityId) : undefined;
      const parentB = spec.secondaryEntityId ? byId.get(spec.secondaryEntityId) : undefined;
      const orphanA = Boolean(spec.parentEntityId && !parentA);
      const orphanB = Boolean(spec.secondaryEntityId && !parentB);
      const isOrphan = orphanA || orphanB;

      if (spec.referenceType === "virtual_intersection") {
        if (parentA && parentB) {
          const segsA = segmentsOf(parentA);
          const segsB = segmentsOf(parentB);
          const sA = segsA[Math.min(segsA.length - 1, spec.vertexIndex ?? 0)];
          const sB = segsB[Math.min(segsB.length - 1, spec.secondaryVertexIndex ?? 0)];
          if (sA && sB) {
            const hit = lineIntersection(sA, sB, false);
            if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
              const nx = Number(hit.x.toFixed(4));
              const ny = Number(hit.y.toFixed(4));
              if (
                Math.abs(nx - ent.x) > 1e-4 ||
                Math.abs(ny - ent.y) > 1e-4 ||
                spec.isOrphan !== isOrphan
              ) {
                changed = true;
                return {
                  ...ent,
                  x: nx,
                  y: ny,
                  params: {
                    ...ent.params,
                    geometricMarkSpec: { ...spec, isOrphan },
                  },
                };
              }
            }
          }
        }
      } else {
        const ptA = parentA
          ? resolvePointOnParentEntity(
              parentA,
              parentA.type === "circle" ? "center" : "vertex",
              spec.vertexIndex ?? 0,
              0.5,
            ) ?? spec.anchorA
          : spec.anchorA;
        const ptB = parentB
          ? resolvePointOnParentEntity(
              parentB,
              parentB.type === "circle" ? "center" : "vertex",
              spec.secondaryVertexIndex ?? 0,
              0.5,
            ) ?? spec.anchorB
          : spec.anchorB;

        if (ptA && ptB) {
          const t = spec.parameterT ?? 0.5;
          const nx = Number((ptA.x + (ptB.x - ptA.x) * t).toFixed(4));
          const ny = Number((ptA.y + (ptB.y - ptA.y) * t).toFixed(4));
          if (
            Math.abs(nx - ent.x) > 1e-4 ||
            Math.abs(ny - ent.y) > 1e-4 ||
            spec.isOrphan !== isOrphan
          ) {
            changed = true;
            return {
              ...ent,
              x: nx,
              y: ny,
              params: {
                ...ent.params,
                geometricMarkSpec: {
                  ...spec,
                  anchorA: ptA,
                  anchorB: ptB,
                  isOrphan,
                },
              },
            };
          }
        }
      }

      if (spec.isOrphan !== isOrphan) {
        changed = true;
        return {
          ...ent,
          params: {
            ...ent.params,
            geometricMarkSpec: { ...spec, isOrphan },
          },
        };
      }
      return ent;
    }

    if (spec.parentEntityId) {
      const parent = byId.get(spec.parentEntityId);
      if (!parent) {
        if (!spec.isOrphan) {
          changed = true;
          return {
            ...ent,
            params: {
              ...ent.params,
              geometricMarkSpec: { ...spec, isOrphan: true },
            },
          };
        }
        return ent;
      }

      const resolved = resolvePointOnParentEntity(
        parent,
        spec.referenceType,
        spec.vertexIndex ?? 0,
        spec.parameterT ?? 0.5,
        spec.angleRad ?? 0,
      );
      if (resolved) {
        const nx = Number(resolved.x.toFixed(4));
        const ny = Number(resolved.y.toFixed(4));
        if (Math.abs(nx - ent.x) > 1e-4 || Math.abs(ny - ent.y) > 1e-4 || spec.isOrphan) {
          changed = true;
          return {
            ...ent,
            x: nx,
            y: ny,
            params: {
              ...ent.params,
              geometricMarkSpec: { ...spec, isOrphan: false },
            },
          };
        }
      }
    }

    return ent;
  });

  return changed ? next : entities;
}

/* ============================================================================
   DATUM PERSISTENTE — VETOR (A -> B), PROJEÇÃO NOS DOIS CATETOS (ΔX, ΔY) E LINHAS
   ============================================================================ */

export interface PersistentDatumMetrics {
  origin: Vec2;
  target: Vec2;
  corner: Vec2;
  cornerX: Vec2;
  dx: number;
  dy: number;
  absDx: number;
  absDy: number;
  L: number;
  length: number;
  lengthL: number;
  angleDeg: number;
}

export function computePersistentDatumMetrics(
  originOrSpec: Vec2 | PersistentDatumSpec,
  maybeTarget?: Vec2,
): PersistentDatumMetrics {
  const origin: Vec2 =
    "origin" in originOrSpec ? originOrSpec.origin : originOrSpec;
  const target: Vec2 =
    "target" in originOrSpec
      ? originOrSpec.target
      : maybeTarget ?? { x: origin.x, y: origin.y };

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const lengthL = Math.hypot(dx, dy);
  const angleDeg =
    lengthL > 1e-6 ? (((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360 : 0;
  const corner: Vec2 = { x: target.x, y: origin.y };

  return {
    origin,
    target,
    corner,
    cornerX: corner,
    dx,
    dy,
    absDx,
    absDy,
    L: lengthL,
    length: lengthL,
    lengthL,
    angleDeg,
  };
}

/**
 * Cria uma entidade de DATUM Persistente (participa do Undo/Redo e é salva no projeto).
 */
export function createPersistentDatumEntity(
  origin: Vec2,
  target: Vec2,
  layerOrComp: LayerId | DatumSelectedComponent = "referencia",
  maybeLayer?: LayerId,
): Entity & { type: "point" } {
  const layer: LayerId =
    maybeLayer ??
    (layerOrComp === "dx" ||
    layerOrComp === "dy" ||
    layerOrComp === "L" ||
    layerOrComp === "angle" ||
    layerOrComp === null
      ? "referencia"
      : layerOrComp);
  const selectedComponent: DatumSelectedComponent =
    layerOrComp === "dx" ||
    layerOrComp === "dy" ||
    layerOrComp === "L" ||
    layerOrComp === "angle"
      ? layerOrComp
      : null;

  const cleanOrigin = {
    x: Number(origin.x.toFixed(4)),
    y: Number(origin.y.toFixed(4)),
  };
  const cleanTarget = {
    x: Number(target.x.toFixed(4)),
    y: Number(target.y.toFixed(4)),
  };
  const id = `datum_${uid()}`;
  const spec: PersistentDatumSpec = {
    id,
    kind: "persistent_datum",
    origin: cleanOrigin,
    target: cleanTarget,
    selectedComponent,
    label: "DATUM",
    visible: true,
    createdAt: Date.now(),
  };
  return {
    id,
    layer,
    type: "point",
    x: cleanOrigin.x,
    y: cleanOrigin.y,
    label: "DATUM",
    isConstruction: true,
    params: {
      isPersistentDatum: true,
      cadSemanticKind: "persistent_datum",
      persistentDatumSpec: spec,
      excludeFromCutExport: true,
    },
  };
}

/**
 * Atualiza o ponto alvo B = (x2, y2) de um DATUM a partir da edição numérica de uma de suas componentes.
 */
export function updatePersistentDatumTargetByComponent(
  originOrSpec: Vec2 | PersistentDatumSpec,
  targetOrComponent: Vec2 | Exclude<DatumSelectedComponent, null>,
  componentOrValue: Exclude<DatumSelectedComponent, null> | number,
  maybeValue?: number,
): PersistentDatumSpec & Vec2 {
  const isSpecCall = "origin" in originOrSpec && "target" in originOrSpec;
  const origin: Vec2 = isSpecCall
    ? (originOrSpec as PersistentDatumSpec).origin
    : (originOrSpec as Vec2);
  const currentTarget: Vec2 = isSpecCall
    ? (originOrSpec as PersistentDatumSpec).target
    : (targetOrComponent as Vec2);
  const component = (
    isSpecCall ? targetOrComponent : componentOrValue
  ) as Exclude<DatumSelectedComponent, null>;
  const newValue = (
    isSpecCall ? componentOrValue : maybeValue ?? 0
  ) as number;

  const metrics = computePersistentDatumMetrics(origin, currentTarget);
  let nextTarget: Vec2;
  if (component === "dx") {
    const signX = newValue < 0 ? -1 : metrics.dx >= 0 ? 1 : -1;
    nextTarget = {
      x: Number((origin.x + signX * Math.abs(newValue)).toFixed(4)),
      y: currentTarget.y,
    };
  } else if (component === "dy") {
    const signY = newValue < 0 ? -1 : metrics.dy >= 0 ? 1 : -1;
    nextTarget = {
      x: currentTarget.x,
      y: Number((origin.y + signY * Math.abs(newValue)).toFixed(4)),
    };
  } else if (component === "L") {
    const safeL = Math.max(0.1, Math.abs(newValue));
    const rad = (metrics.angleDeg * Math.PI) / 180;
    nextTarget = {
      x: Number((origin.x + safeL * Math.cos(rad)).toFixed(4)),
      y: Number((origin.y - safeL * Math.sin(rad)).toFixed(4)),
    };
  } else {
    const normDeg = ((newValue % 360) + 360) % 360;
    const rad = (normDeg * Math.PI) / 180;
    const len = Math.max(1, metrics.lengthL);
    nextTarget = {
      x: Number((origin.x + len * Math.cos(rad)).toFixed(4)),
      y: Number((origin.y - len * Math.sin(rad)).toFixed(4)),
    };
  }

  const baseSpec: PersistentDatumSpec = isSpecCall
    ? (originOrSpec as PersistentDatumSpec)
    : { kind: "persistent_datum", origin, target: nextTarget };

  return {
    ...baseSpec,
    origin,
    target: nextTarget,
    x: nextTarget.x,
    y: nextTarget.y,
  };
}

export type DatumLineConversionMode = "dx" | "dy" | "L" | "both_legs";

/**
 * Converte diretamente as projeções do DATUM em entidade(s) `LINE` real(is) do CAD:
 *  - "dx": Cateto Horizontal de (x1, y1) até (x2, y1)
 *  - "dy": Cateto Vertical de (x2, y1) até (x2, y2)
 *  - "L": Hipotenusa / Vetor Direto de (x1, y1) até (x2, y2)
 *  - "both_legs": Cria simultaneamente os dois catetos ortogonais em esquadro (ΔX + ΔY)
 */
export function convertDatumToCadLines(
  originOrSpec: Vec2 | PersistentDatumSpec,
  targetOrMode: Vec2 | DatumLineConversionMode,
  modeOrLayer: DatumLineConversionMode | LayerId,
  maybeLayer?: LayerId,
): (Entity & { type: "line" })[] {
  const isSpecCall = "origin" in originOrSpec && "target" in originOrSpec;
  const origin: Vec2 = isSpecCall
    ? (originOrSpec as PersistentDatumSpec).origin
    : (originOrSpec as Vec2);
  const target: Vec2 = isSpecCall
    ? (originOrSpec as PersistentDatumSpec).target
    : (targetOrMode as Vec2);
  const mode = (
    isSpecCall ? targetOrMode : modeOrLayer
  ) as DatumLineConversionMode;
  const layer = (
    isSpecCall ? modeOrLayer : maybeLayer ?? "corte"
  ) as LayerId;

  const { corner, absDx, absDy, lengthL } = computePersistentDatumMetrics(origin, target);
  const out: (Entity & { type: "line" })[] = [];

  if ((mode === "dx" || mode === "both_legs") && absDx >= 0.05) {
    out.push({
      id: uid(),
      layer,
      type: "line",
      x1: Number(origin.x.toFixed(4)),
      y1: Number(origin.y.toFixed(4)),
      x2: Number(corner.x.toFixed(4)),
      y2: Number(corner.y.toFixed(4)),
    });
  }

  if ((mode === "dy" || mode === "both_legs") && absDy >= 0.05) {
    out.push({
      id: uid(),
      layer,
      type: "line",
      x1: Number(corner.x.toFixed(4)),
      y1: Number(corner.y.toFixed(4)),
      x2: Number(target.x.toFixed(4)),
      y2: Number(target.y.toFixed(4)),
    });
  }

  if (mode === "L" && lengthL >= 0.05) {
    out.push({
      id: uid(),
      layer,
      type: "line",
      x1: Number(origin.x.toFixed(4)),
      y1: Number(origin.y.toFixed(4)),
      x2: Number(target.x.toFixed(4)),
      y2: Number(target.y.toFixed(4)),
    });
  }

  return out;
}

export {
  ReferenceService,
  anchorLocalToWorld,
  anchorWorldToLocal,
  evaluateSmartPick,
  listEntityCycleCandidates,
  computeEntityAdaptiveArms,
  snapAxisAngleDeg,
  ANCHOR_LABELS,
  ANCHOR_CYAN_PRIMARY,
  ANCHOR_VIOLET_PRIMARY,
  ANCHOR_VIOLET_ACCENT,
  type AnchorLabel,
  type AnchorPointSymbolKind,
  type GeometricAnchor,
  type SmartPickCandidate,
  type ConstructionGuide,
  type ConstructionGuideKind,
  type GuideMeetingPoint,
  type SpanDivisionGroup,
  type EdgeRadarChip,
  type EchoMode,
  type EchoConfig,
  type AnchorCoordinateTableRow,
  type ReferenceServiceState,
} from "./referenceService";
