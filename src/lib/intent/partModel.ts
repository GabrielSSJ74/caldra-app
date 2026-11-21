/**
 * CALDRA — CHAMFER INTENT 2.0 (FASE 1 — CLAUDE)
 * Módulo: PartModel — Estado Vivo Compacto e Determinístico do Desenho (§3.3)
 *
 * Responsabilidades:
 *  - Representar o estado vivo do canvas do CHAMFER CAD em um JSON compacto e determinístico;
 *  - Sincronizar automaticamente edições manuais feitas no canvas (arraste, escala, DimensionEditor);
 *  - Resolver referências contextuais (@id, "last_created", "selection", "all_holes", "outer_contour");
 *  - Comprimir desenhos grandes (> 200 entidades) agrupando entidades não selecionadas por tipo/camada
 *    e mantendo detalhe integral para entidades selecionadas e as últimas 30 criadas/modificadas.
 */

import { bbox, boxOf, type Entity, type LayerId } from "@/lib/lab2d/core";
import { formatDimension, type Dimension, type DimKind } from "@/lib/lab2d/dimensions";
import type { LengthUnit, ParametricFeatureState, ParametricSessionContext } from "./schema";

export const PART_MODEL_MAX_DETAILED_ENTITIES = 200;
export const PART_MODEL_RECENT_WINDOW = 30;

export type MaterialKind =
  | "steel_1020"
  | "steel_a36"
  | "stainless_304"
  | "stainless_316"
  | "aluminum_5052"
  | "aluminum_6061"
  | "brass"
  | "copper"
  | "galvanized";

export const MATERIAL_DENSITY_G_CM3: Record<MaterialKind, number> = {
  steel_1020: 7.85,
  steel_a36: 7.85,
  stainless_304: 7.93,
  stainless_316: 7.98,
  aluminum_5052: 2.68,
  aluminum_6061: 2.7,
  brass: 8.5,
  copper: 8.96,
  galvanized: 7.85,
};

export interface PartModelDerivedInfo {
  centers?: Array<[number, number]>;
  pitch?: number;
  pitch_x?: number;
  pitch_y?: number;
  bounding_box?: [number, number, number, number];
  edge_clearance_min?: number;
  area_mm2?: number;
  perimeter_mm?: number;
}

export interface PartModelEntitySummary {
  id: string;
  type:
    | "plate"
    | "rectangle"
    | "hole"
    | "hole_pattern"
    | "slot"
    | "flange"
    | "cutout"
    | "line"
    | "polyline"
    | "circle"
    | "arc"
    | "ellipse"
    | "polygon"
    | "point"
    | "text"
    | "hatch"
    | "path"
    | "centerline"
    | "boilermaking_development";
  params: Record<string, unknown>;
  layer: LayerId;
  parent?: string;
  derived?: PartModelDerivedInfo;
  /** IDs reais das entidades nativas no canvas do CHAMFER associadas a este recurso */
  rawEntityIds: string[];
}

export interface PartModelDimensionSummary {
  id: string;
  type: DimKind;
  from: string;
  to?: string;
  value: number;
  formatted?: string;
}

export interface PartModelOverflowGroup {
  groupId: string;
  type: Entity["type"];
  layer: LayerId;
  count: number;
  bbox: [number, number, number, number];
  sampleIds: string[];
}

export interface PartModel {
  units: LengthUnit;
  origin: [number, number];
  material: MaterialKind;
  thickness: number;
  bbox: [number, number, number, number];
  revision: number;
  selection: string[];
  entities: PartModelEntitySummary[];
  /** Presente apenas quando o desenho ultrapassa 200 entidades nativas (§3.3) */
  overflowGroups?: PartModelOverflowGroup[];
  dimensions: PartModelDimensionSummary[];
  vars: Record<string, number>;
}

export interface BuildPartModelOptions {
  entities: Entity[];
  dimensions?: Dimension[];
  selectedEntityIds?: string[];
  session?: ParametricSessionContext;
  units?: LengthUnit;
  origin?: [number, number];
  material?: MaterialKind;
  thickness?: number;
  revision?: number;
  vars?: Record<string, number>;
}

/**
 * Calcula área aproximada e perímetro de uma polilinha fechada.
 */
function computePolylineMetrics(pts: Array<{ x: number; y: number }>, closed: boolean): {
  area: number;
  perimeter: number;
} {
  if (pts.length < 2) return { area: 0, perimeter: 0 };
  let perimeter = 0;
  let signedArea2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length];
    if (!b || (i === pts.length - 1 && !closed)) break;
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
    if (closed && pts.length >= 3) {
      signedArea2 += a.x * b.y - b.x * a.y;
    }
  }
  return {
    area: closed ? Math.abs(signedArea2) / 2 : 0,
    perimeter: Number(perimeter.toFixed(2)),
  };
}

/**
 * Constrói o `PartModel` vivo a partir das entidades reais do CHAMFER CAD,
 * reconciliando possíveis edições manuais feitas diretamente no canvas.
 */
export function buildPartModelFromCanvas(options: BuildPartModelOptions): PartModel {
  const {
    entities,
    dimensions = [],
    selectedEntityIds = [],
    session,
    units = "mm",
    origin = [0, 0],
    material = "steel_1020",
    thickness = 6.35,
    revision = session?.turnIndex ?? 1,
    vars = {},
  } = options;

  const overallBox = bbox(entities.filter((e) => e.layer !== "referencia" && !e.isConstruction));
  const modelBbox: [number, number, number, number] = overallBox
    ? [
        Number(overallBox.minX.toFixed(2)),
        Number(overallBox.minY.toFixed(2)),
        Number(overallBox.maxX.toFixed(2)),
        Number(overallBox.maxY.toFixed(2)),
      ]
    : [0, 0, 0, 0];

  const consumedEntityIds = new Set<string>();
  const summaries: PartModelEntitySummary[] = [];

  const activeFeature = session?.activeFeature;

  // 1. Se houver uma feature paramétrica ativa (ex: plate_1, flange_1, bracket_1),
  // verifica se suas entidades ainda existem no canvas e reconcilia suas dimensões reais
  if (activeFeature) {
    const contourEntities = entities.filter((e) =>
      activeFeature.contourEntityIds.includes(e.id),
    );
    if (contourEntities.length > 0) {
      const cBox = bbox(contourEntities);
      const liveW = cBox ? Number((cBox.maxX - cBox.minX).toFixed(2)) : activeFeature.width;
      const liveH = cBox ? Number((cBox.maxY - cBox.minY).toFixed(2)) : activeFeature.height;
      const liveX = cBox ? Number(cBox.minX.toFixed(2)) : activeFeature.origin.x;
      const liveY = cBox ? Number(cBox.minY.toFixed(2)) : activeFeature.origin.y;

      for (const ce of contourEntities) consumedEntityIds.add(ce.id);
      for (const clId of activeFeature.centerlineEntityIds) consumedEntityIds.add(clId);

      const plateFeatureId = activeFeature.partId || "plate_1";

      if (activeFeature.kind === "flange") {
        summaries.push({
          id: plateFeatureId,
          type: "flange",
          layer: activeFeature.layer,
          params: {
            outer_diameter: liveW,
            inner_diameter: activeFeature.innerDiameter ?? 0,
            center: [
              Number(((cBox ? (cBox.minX + cBox.maxX) / 2 : 0)).toFixed(2)),
              Number(((cBox ? (cBox.minY + cBox.maxY) / 2 : 0)).toFixed(2)),
            ],
          },
          derived: {
            bounding_box: cBox
              ? [
                  Number(cBox.minX.toFixed(2)),
                  Number(cBox.minY.toFixed(2)),
                  Number(cBox.maxX.toFixed(2)),
                  Number(cBox.maxY.toFixed(2)),
                ]
              : modelBbox,
          },
          rawEntityIds: [...activeFeature.contourEntityIds],
        });
      } else {
        const maxR = Math.max(
          activeFeature.cornerRadii.top_left,
          activeFeature.cornerRadii.top_right,
          activeFeature.cornerRadii.bottom_right,
          activeFeature.cornerRadii.bottom_left,
        );
        const chSize = activeFeature.cornerChamfer ?? 0;
        summaries.push({
          id: plateFeatureId,
          type: "plate",
          layer: activeFeature.layer,
          params: {
            w: liveW,
            h: liveH,
            origin: [liveX, liveY],
            corners: {
              mode: maxR > 0 ? "fillet" : chSize > 0 ? "chamfer" : "none",
              size: maxR > 0 ? maxR : chSize,
              which: activeFeature.cornerSelector,
            },
            corner_radii: activeFeature.cornerRadii,
            corner_chamfer: chSize,
            corner_selector: activeFeature.cornerSelector,
          },
          derived: {
            bounding_box: [liveX, liveY, liveX + liveW, liveY + liveH],
            area_mm2: Number((liveW * liveH).toFixed(2)),
            perimeter_mm: Number((2 * (liveW + liveH)).toFixed(2)),
          },
          rawEntityIds: [...activeFeature.contourEntityIds],
        });
      }

      // Grupos de furação vinculados à peça ativa (reconciliados com os círculos vivos no canvas)
      activeFeature.holeGroups.forEach((hg, idx) => {
        const liveHoles = entities.filter(
          (e): e is Extract<Entity, { type: "circle" }> =>
            e.type === "circle" && hg.entityIds.includes(e.id),
        );
        if (liveHoles.length > 0) {
          for (const lh of liveHoles) consumedEntityIds.add(lh.id);
          const liveDiam = Number((liveHoles[0]!.r * 2).toFixed(2));
          const centers: Array<[number, number]> = liveHoles.map((h) => [
            Number(h.cx.toFixed(2)),
            Number(h.cy.toFixed(2)),
          ]);

          summaries.push({
            id: hg.id || `holes_${idx + 1}`,
            type: "hole_pattern",
            layer: liveHoles[0]!.layer,
            parent: plateFeatureId,
            params: {
              pattern: hg.distribution,
              count: liveHoles.length,
              d: liveDiam,
              margin: hg.margin,
              pitch: hg.pitch,
              pcd: hg.pcd,
              measure_from: hg.measurementMode,
            },
            derived: {
              centers,
              pitch: hg.pitch,
            },
            rawEntityIds: liveHoles.map((h) => h.id),
          });
        }
      });

      // Grupos de rasgos oblongos vinculados à peça ativa
      activeFeature.slotGroups.forEach((sg, idx) => {
        const liveSlots = entities.filter((e) => sg.entityIds.includes(e.id));
        if (liveSlots.length > 0) {
          for (const ls of liveSlots) consumedEntityIds.add(ls.id);
          summaries.push({
            id: sg.id || `slot_${idx + 1}`,
            type: "slot",
            layer: liveSlots[0]!.layer,
            parent: plateFeatureId,
            params: {
              center: [Number(sg.center.x.toFixed(2)), Number(sg.center.y.toFixed(2))],
              length: sg.length,
              width: sg.width,
              angle_deg: sg.angleDeg,
            },
            rawEntityIds: liveSlots.map((s) => s.id),
          });
        }
      });
    }
  }

  // 2. Processa as demais entidades do canvas (com compressão automática se > 200 entidades)
  const remainingEntities = entities.filter((e) => !consumedEntityIds.has(e.id));
  const selectedSet = new Set(selectedEntityIds);

  let entitiesToDetail = remainingEntities;
  const overflowGroups: PartModelOverflowGroup[] = [];

  if (entities.length > PART_MODEL_MAX_DETAILED_ENTITIES) {
    const recentStartIdx = Math.max(0, remainingEntities.length - PART_MODEL_RECENT_WINDOW);
    const recentIds = new Set(remainingEntities.slice(recentStartIdx).map((e) => e.id));

    const detailed: Entity[] = [];
    const toGroup: Entity[] = [];

    for (const ent of remainingEntities) {
      if (selectedSet.has(ent.id) || recentIds.has(ent.id)) {
        detailed.push(ent);
      } else {
        toGroup.push(ent);
      }
    }

    entitiesToDetail = detailed;

    // Agrupa o excedente por tipo + camada
    const groupMap = new Map<string, Entity[]>();
    for (const ent of toGroup) {
      const key = `${ent.type}::${ent.layer}`;
      const list = groupMap.get(key) ?? [];
      list.push(ent);
      groupMap.set(key, list);
    }

    for (const [key, groupList] of groupMap.entries()) {
      const [type, layer] = key.split("::") as [Entity["type"], LayerId];
      const gBox = bbox(groupList) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      overflowGroups.push({
        groupId: `group_${type}_${layer}`,
        type,
        layer,
        count: groupList.length,
        bbox: [
          Number(gBox.minX.toFixed(2)),
          Number(gBox.minY.toFixed(2)),
          Number(gBox.maxX.toFixed(2)),
          Number(gBox.maxY.toFixed(2)),
        ],
        sampleIds: groupList.slice(0, 5).map((e) => e.id),
      });
    }
  }

  for (const ent of entitiesToDetail) {
    summaries.push(summarizeSingleEntity(ent));
  }

  // 3. Resumo das cotas associativas
  const dimSummaries: PartModelDimensionSummary[] = dimensions.map((d) => {
    const formatted = formatDimension(d, entities) ?? "0";
    const numericVal = parseFloat(formatted.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
    const fromRef = d.refs[0];
    const toRef = d.refs[1];
    const formatRef = (r?: Dimension["refs"][number]) => {
      if (!r) return "origin";
      if (r.kind === "entity") return r.anchor ? `${r.id}.${r.anchor}` : r.id;
      return `(${r.p.x.toFixed(1)},${r.p.y.toFixed(1)})`;
    };
    return {
      id: d.id,
      type: d.kind,
      from: formatRef(fromRef),
      to: toRef ? formatRef(toRef) : undefined,
      value: Number(numericVal.toFixed(2)),
      formatted,
    };
  });

  const model: PartModel = {
    units,
    origin,
    material,
    thickness,
    bbox: modelBbox,
    revision,
    selection: [...selectedEntityIds],
    entities: summaries,
    dimensions: dimSummaries,
    vars: { ...vars },
  };

  if (overflowGroups.length > 0) {
    model.overflowGroups = overflowGroups;
  }

  return model;
}

/**
 * Converte uma entidade nativa individual do CHAMFER em um resumo estruturado do PartModel.
 */
export function summarizeSingleEntity(ent: Entity): PartModelEntitySummary {
  const b = boxOf(ent);
  const bboxTuple: [number, number, number, number] = [
    Number(b.minX.toFixed(2)),
    Number(b.minY.toFixed(2)),
    Number(b.maxX.toFixed(2)),
    Number(b.maxY.toFixed(2)),
  ];

  if (ent.type === "line") {
    const length = Number(Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1).toFixed(2));
    return {
      id: ent.id,
      type: ent.layer === "referencia" || ent.isConstruction ? "centerline" : "line",
      layer: ent.layer,
      params: {
        from: [Number(ent.x1.toFixed(2)), Number(ent.y1.toFixed(2))],
        to: [Number(ent.x2.toFixed(2)), Number(ent.y2.toFixed(2))],
        length,
      },
      derived: { bounding_box: bboxTuple },
      rawEntityIds: [ent.id],
    };
  }

  if (ent.type === "circle") {
    return {
      id: ent.id,
      type: "circle",
      layer: ent.layer,
      parent: typeof ent.params?.parentPartId === "string" ? ent.params.parentPartId : undefined,
      params: {
        center: [Number(ent.cx.toFixed(2)), Number(ent.cy.toFixed(2))],
        d: Number((ent.r * 2).toFixed(2)),
        r: Number(ent.r.toFixed(2)),
      },
      derived: {
        centers: [[Number(ent.cx.toFixed(2)), Number(ent.cy.toFixed(2))]],
        bounding_box: bboxTuple,
        area_mm2: Number((Math.PI * ent.r * ent.r).toFixed(2)),
        perimeter_mm: Number((2 * Math.PI * ent.r).toFixed(2)),
      },
      rawEntityIds: [ent.id],
    };
  }

  if (ent.type === "arc") {
    return {
      id: ent.id,
      type: "arc",
      layer: ent.layer,
      params: {
        center: [Number(ent.cx.toFixed(2)), Number(ent.cy.toFixed(2))],
        r: Number(ent.r.toFixed(2)),
        start_deg: Number(((ent.a0 * 180) / Math.PI).toFixed(2)),
        end_deg: Number(((ent.a1 * 180) / Math.PI).toFixed(2)),
      },
      derived: { bounding_box: bboxTuple },
      rawEntityIds: [ent.id],
    };
  }

  if (ent.type === "ellipse") {
    return {
      id: ent.id,
      type: "ellipse",
      layer: ent.layer,
      params: {
        center: [Number(ent.cx.toFixed(2)), Number(ent.cy.toFixed(2))],
        rx: Number(ent.rx.toFixed(2)),
        ry: Number(ent.ry.toFixed(2)),
        angle_deg: Number((((ent.rotation ?? 0) * 180) / Math.PI).toFixed(2)),
      },
      derived: { bounding_box: bboxTuple },
      rawEntityIds: [ent.id],
    };
  }

  if (ent.type === "polyline") {
    const metrics = computePolylineMetrics(ent.pts, ent.closed);
    const isPlate = Boolean(ent.params?.isParametricPlate);
    return {
      id: ent.id,
      type: isPlate ? "plate" : "polyline",
      layer: ent.layer,
      params: isPlate
        ? {
            w: Number((b.maxX - b.minX).toFixed(2)),
            h: Number((b.maxY - b.minY).toFixed(2)),
            origin: [Number(b.minX.toFixed(2)), Number(b.minY.toFixed(2))],
            corner_radii: ent.params?.cornerRadii,
          }
        : {
            closed: ent.closed,
            vertex_count: ent.pts.length,
            w: Number((b.maxX - b.minX).toFixed(2)),
            h: Number((b.maxY - b.minY).toFixed(2)),
          },
      derived: {
        bounding_box: bboxTuple,
        area_mm2: metrics.area,
        perimeter_mm: metrics.perimeter,
      },
      rawEntityIds: [ent.id],
    };
  }

  if (ent.type === "text") {
    return {
      id: ent.id,
      type: "text",
      layer: ent.layer,
      params: {
        text: ent.text,
        at: [Number(ent.x.toFixed(2)), Number(ent.y.toFixed(2))],
        height: ent.size,
        angle_deg: ent.rotation ?? 0,
      },
      derived: { bounding_box: bboxTuple },
      rawEntityIds: [ent.id],
    };
  }

  if (ent.type === "point") {
    return {
      id: ent.id,
      type: "point",
      layer: ent.layer,
      params: {
        at: [Number(ent.x.toFixed(2)), Number(ent.y.toFixed(2))],
        label: ent.label,
      },
      derived: { bounding_box: bboxTuple },
      rawEntityIds: [ent.id],
    };
  }

  return {
    id: ent.id,
    type: ent.type,
    layer: ent.layer,
    params: {},
    derived: { bounding_box: bboxTuple },
    rawEntityIds: [ent.id],
  };
}

/**
 * Resolve seletores contextuais (@id, "selection", "last_created", "all_holes", "outer_contour")
 * para os IDs reais das entidades nativas do CHAMFER CAD.
 */
export function resolveTargetEntityIds(
  targetSpec: string | string[] | undefined,
  partModel: PartModel,
  rawEntities: Entity[],
): string[] {
  if (!targetSpec) {
    if (partModel.selection.length > 0) return [...partModel.selection];
    const lastFeature = partModel.entities[partModel.entities.length - 1];
    return lastFeature ? [...lastFeature.rawEntityIds] : rawEntities.map((e) => e.id);
  }

  const specs = Array.isArray(targetSpec) ? targetSpec : [targetSpec];
  const resolved = new Set<string>();

  for (const rawToken of specs) {
    const token = rawToken.trim().replace(/^@/, "");

    if (token === "selection" || token === "selected") {
      for (const id of partModel.selection) resolved.add(id);
      continue;
    }

    if (token === "last_created" || token === "last" || token === "active_part") {
      const lastSummary = partModel.entities[partModel.entities.length - 1];
      if (lastSummary) {
        for (const id of lastSummary.rawEntityIds) resolved.add(id);
      }
      continue;
    }

    if (token === "all_holes" || token === "holes") {
      for (const summary of partModel.entities) {
        if (
          summary.type === "hole_pattern" ||
          (summary.type === "circle" && summary.layer !== "referencia")
        ) {
          for (const id of summary.rawEntityIds) resolved.add(id);
        }
      }
      for (const ent of rawEntities) {
        if (ent.type === "circle" && ent.layer !== "referencia" && !ent.isConstruction) {
          resolved.add(ent.id);
        }
      }
      continue;
    }

    if (token === "outer_contour" || token === "plate" || token === "contour") {
      const plateSummary = partModel.entities.find(
        (s) => s.type === "plate" || s.type === "flange" || s.type === "polyline",
      );
      if (plateSummary) {
        for (const id of plateSummary.rawEntityIds) resolved.add(id);
      }
      continue;
    }

    if (token === "all") {
      for (const ent of rawEntities) resolved.add(ent.id);
      continue;
    }

    // Procura nos summaries do PartModel (ex: "plate_1", "holes_1")
    const summaryMatch = partModel.entities.find((s) => s.id === token);
    if (summaryMatch) {
      for (const id of summaryMatch.rawEntityIds) resolved.add(id);
      continue;
    }

    // Procura diretamente nas entidades nativas por ID
    const directMatch = rawEntities.find((e) => e.id === token);
    if (directMatch) {
      resolved.add(directMatch.id);
    }
  }

  return Array.from(resolved);
}

/**
 * Cria um PartModel inicial vazio (convenções padrão §7: units='mm', origin=[0,0], revision=0).
 */
export function createEmptyPartModel(): PartModel {
  return {
    units: "mm",
    origin: [0, 0],
    material: "steel_1020",
    thickness: 3,
    bbox: [0, 0, 0, 0],
    revision: 0,
    selection: [],
    entities: [],
    overflowGroups: [],
    dimensions: [],
    vars: {},
  };
}

/**
 * Serializa o PartModel de forma compacta para envio no contexto do turno (§7).
 */
export function serializePartModelForContext(partModel: PartModel): string {
  return JSON.stringify({
    units: partModel.units,
    material: partModel.material,
    thickness: partModel.thickness,
    bbox: partModel.bbox,
    revision: partModel.revision,
    selection: partModel.selection,
    entities: partModel.entities.map((e) => ({
      id: e.id,
      type: e.type,
      params: e.params,
      layer: e.layer,
      ...(e.parent ? { parent: e.parent } : {}),
      ...(e.derived ? { derived: e.derived } : {}),
    })),
    ...(partModel.overflowGroups && partModel.overflowGroups.length > 0
      ? { overflowGroups: partModel.overflowGroups }
      : {}),
    ...(partModel.dimensions.length > 0 ? { dimensions: partModel.dimensions } : {}),
    ...(Object.keys(partModel.vars).length > 0 ? { vars: partModel.vars } : {}),
  });
}

