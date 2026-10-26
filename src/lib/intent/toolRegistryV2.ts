/**
 * CALDRA — CHAMFER INTENT 2.0 (FASE 1 — CLAUDE)
 * Módulo: Inventário Real do CHAMFER + Registro de Ferramentas v2 + Executor Determinístico (§2, §3.1, §3.2, §6)
 *
 * Responsabilidades:
 *  - Documentar programaticamente o Inventário Real do CHAMFER CAD (entidades, camadas, cotas, snaps,
 *    modificadores, motores de caldeiraria, histórico Undo/Redo e exportadores);
 *  - Registrar cada função do catálogo DSL v2 com adaptador determinístico para as funções nativas;
 *  - Executar chamadas de ferramentas em modo dry-run transacional sobre uma cópia do estado,
 *    retornando `ToolResult { ok, tool, created, changed, removed, warnings, errors, data }`.
 */

import {
  DEFAULT_LAYERS,
  bbox,
  boxOf,
  mirror,
  offsetEntity,
  polygonEntity,
  rectPolyline,
  rotate,
  scaleEntity,
  translate,
  uid,
  type Entity,
  type LayerId,
  type Snap,
  type Vec2,
} from "@/lib/lab2d/core";
import { createSlotPolyline } from "@/lib/lab2d/cadGeometryCore";
import {
  arrayCircular,
  arrayLinear,
  explodeEntity,
  joinEntities,
} from "@/lib/lab2d/cadModifiers";
import { DIM_LABEL, makeDimension, type Dimension, type DimKind } from "@/lib/lab2d/dimensions";
import { CAD_PRESETS_CATALOG } from "@/lib/lab2d/cadPresetsCatalog";
import { ChamferGeometricExecutionEngine } from "./geometricExecutionEngine";
import { ChamferValidationEngine, type HoleCandidate } from "./validationEngine";
import {
  MATERIAL_DENSITY_G_CM3,
  buildPartModelFromCanvas,
  resolveTargetEntityIds,
  type MaterialKind,
  type PartModel,
} from "./partModel";
import {
  CHAMFER_DSL_V2_FUNCTION_DECLARATIONS,
  type AddCutoutArgs,
  type AddDimensionArgs,
  type AddHolesArgs,
  type ArrayArgs,
  type AskClarificationArgs,
  type AutoDimensionArgs,
  type BendAllowanceArgs,
  type CheckManufacturingArgs,
  type CreateArcArgs,
  type CreateCenterlinesArgs,
  type CreateCircleArgs,
  type CreateEllipseArgs,
  type CreateFlangeArgs,
  type CreateGussetArgs,
  type CreateLineArgs,
  type CreatePlateArgs,
  type CreatePolygonArgs,
  type CreatePolylineArgs,
  type CreateRectangleArgs,
  type CreateSlotArgs,
  type CreateTextArgs,
  type DeclareAssumptionsArgs,
  type DeleteArgs,
  type DevelopConeArgs,
  type DevelopCylinderArgs,
  type DevelopMiteredBendArgs,
  type DevelopPipeBranchArgs,
  type DevelopSquareToRoundArgs,
  type DslV2CornerSelection,
  type DslV2PositionRef,
  type DslV2ToolCall,
  type DslV2ToolFamily,
  type DslV2ToolName,
  type EditFeatureArgs,
  type EditGeometryArgs,
  type EstimateWeightArgs,
  type ExplainArgs,
  type ExportArgs,
  type MeasureArgs,
  type QueryModelArgs,
  type ReportUnsupportedArgs,
  type SelectArgs,
  type SetLayerArgs,
  type SetUnitsArgs,
  type SetViewArgs,
  type ToggleArgs,
  type TransformArgs,
} from "./dslV2Schemas";
import type { CornerSelector, LengthUnit, ParametricFeatureState, ParametricHoleGroup, ParametricSessionContext } from "./schema";

// ============================================================================
// 1. INVENTÁRIO TÉCNICO REAL DO CHAMFER CAD (§0 e §2 do Claude)
// ============================================================================

export interface ChamferRealInventory {
  entityTypes: ReadonlyArray<Entity["type"]>;
  layers: ReadonlyArray<{ id: LayerId; name: string; color: string }>;
  dimensionKinds: ReadonlyArray<{ kind: DimKind; label: string }>;
  snapKinds: ReadonlyArray<Snap["kind"]>;
  modifiers: ReadonlyArray<string>;
  boilermakingGenerators: ReadonlyArray<string>;
  presetsCount: number;
  exportFormats: ReadonlyArray<"dxf" | "svg" | "pdf" | "json">;
  supportsUndoRedo: boolean;
  supports3DOrbitAndExtrusion: boolean;
}

export const CHAMFER_REAL_INVENTORY: ChamferRealInventory = {
  entityTypes: [
    "line",
    "polyline",
    "circle",
    "arc",
    "ellipse",
    "point",
    "hatch",
    "path",
    "text",
  ],
  layers: DEFAULT_LAYERS.map((l) => ({ id: l.id, name: l.name, color: l.color })),
  dimensionKinds: (Object.keys(DIM_LABEL) as DimKind[]).map((k) => ({
    kind: k,
    label: DIM_LABEL[k],
  })),
  snapKinds: [
    "end",
    "mid",
    "center",
    "quadrant",
    "cross",
    "perp",
    "tangent",
    "origin",
    "near",
    "grid",
  ],
  modifiers: [
    "translate",
    "rotate",
    "scaleEntity",
    "mirror",
    "offsetEntity",
    "trimLine",
    "extendLine",
    "filletLines",
    "chamferLines",
    "arrayLinear",
    "arrayCircular",
    "breakEntityAtPoint",
    "joinEntities",
    "explodeEntity",
    "stretchSelection",
    "divideEntity",
  ],
  boilermakingGenerators: [
    "compileParametricPlate",
    "compileCircularFlange",
    "compileSlottedBracket",
    "compileTruncatedCone",
    "compileSquareToRound",
    "compileSegmentedElbow",
    "compileCylindricalBranch",
    "developCylinderFlatPattern",
    "createGussetPlate",
    "computeBendAllowance",
  ],
  presetsCount: CAD_PRESETS_CATALOG.length,
  exportFormats: ["dxf", "svg", "pdf", "json"],
  supportsUndoRedo: true,
  supports3DOrbitAndExtrusion: true,
};

// ============================================================================
// 2. CONTRATO PADRONIZADO DE RESULTADO DE FERRAMENTA (§3.2 do Claude)
// ============================================================================

export interface ToolResult {
  ok: boolean;
  tool: DslV2ToolName;
  created: string[];
  changed: string[];
  removed: string[];
  warnings: string[];
  errors: string[];
  data?: Record<string, unknown>;
}

export interface ExecutionSandboxState {
  entities: Entity[];
  dimensions: Dimension[];
  selectedEntityIds: string[];
  activeLayer: LayerId;
  units: LengthUnit;
  material: MaterialKind;
  thickness: number;
  revision: number;
  session: ParametricSessionContext;
  partModel: PartModel;
  assumptions: DeclareAssumptionsArgs["items"];
  clarification: AskClarificationArgs | null;
  explanations: string[];
  unsupportedReports: ReportUnsupportedArgs[];
  pendingViewAction?: SetViewArgs;
  pendingExportAction?: ExportArgs;
  pendingUndoSteps?: number;
  pendingRedoSteps?: number;
}

export interface BatchExecutionReport {
  ok: boolean;
  results: ToolResult[];
  finalState: ExecutionSandboxState;
  createdEntityIds: string[];
  changedEntityIds: string[];
  removedEntityIds: string[];
  allWarnings: string[];
  allErrors: string[];
}

const DEG2RAD = Math.PI / 180;

/**
 * Inicializa uma sandbox clonada a partir do estado atual do CHAMFER CAD para execução dry-run.
 */
export type ToolExecutionSandbox = ExecutionSandboxState;

export function createExecutionSandbox(input: {
  entities?: Entity[];
  dimensions?: Dimension[];
  selectedEntityIds?: string[];
  activeLayer?: LayerId;
  units?: LengthUnit;
  material?: MaterialKind;
  thickness?: number;
  session?: ParametricSessionContext;
  partModel?: PartModel;
}): ExecutionSandboxState {
  const entities = (input.entities ?? []).map((e) => structuredClone(e));
  const dimensions = (input.dimensions ?? []).map((d) => structuredClone(d));
  const selectedEntityIds = [...(input.selectedEntityIds ?? [])];
  const activeLayer = input.activeLayer ?? "corte";
  const units = input.units ?? input.partModel?.units ?? "mm";
  const material = input.material ?? (input.partModel?.material as MaterialKind | undefined) ?? "steel_1020";
  const thickness = input.thickness ?? input.partModel?.thickness ?? 6.35;
  const session: ParametricSessionContext = input.session
    ? structuredClone(input.session)
    : {
        turnIndex: 0,
        activeFeature: null,
        featureHistory: [],
        lastPlan: null,
        conversationLog: [],
      };

  // Se entities estiver vazio mas input.partModel possuir plate_1 / holes_1, reconstrói activeFeature
  if (!session.activeFeature && input.partModel && input.partModel.entities.length > 0) {
    const pmPlate = input.partModel.entities.find((e) => e.type === "plate");
    const pmHoles = input.partModel.entities.find((e) => e.type === "hole_pattern");
    if (pmPlate) {
      const w = Number(pmPlate.params.w ?? pmPlate.params.width ?? 500);
      const h = Number(pmPlate.params.h ?? pmPlate.params.height ?? 250);
      const cObj = pmPlate.params.corners as { size?: number } | undefined;
      const rSize = Number(cObj?.size ?? pmPlate.params.corner_radius ?? 0);
      const cornerRadii = ChamferGeometricExecutionEngine.resolveCornerRadii(rSize, "all");
      const patObj = pmHoles?.params.pattern as
        | { type?: string; axis?: string; count?: number; distribution?: string; margin?: number; inset?: number }
        | undefined;
      const holeCount = Number(patObj?.count ?? pmHoles?.params.count ?? 0);
      const holeD = Number(pmHoles?.params.d ?? pmHoles?.params.diameter ?? 12);
      const holeDist =
        patObj?.type === "corners" || pmHoles?.params.pattern === "corners"
          ? "corner_margins"
          : patObj?.axis === "vertical_center"
            ? "linear_centerline_y"
            : "linear_centerline_x";
      const holeFormula =
        patObj?.distribution === "between_ends"
          ? "margin_plus_equal_pitch"
          : patObj?.distribution === "fixed_pitch"
            ? "pitch_between_extremes"
            : "equal_subdivision_including_borders";

      const rehydrated = ChamferGeometricExecutionEngine.compileParametricPlate({
        partId: pmPlate.id,
        origin: { x: 0, y: 0 },
        width: w,
        height: h,
        cornerRadii,
        cornerSelector: "all",
        holeGroup:
          holeCount > 0
            ? {
                id: pmHoles?.id ?? "holes_1",
                distribution: holeDist,
                linearFormula: holeFormula,
                measurementMode: "center_to_edge",
                count: holeCount,
                diameter: holeD,
                margin: Number(patObj?.inset ?? patObj?.margin ?? pmHoles?.params.margin ?? 25),
              }
            : undefined,
        includeDimensions: true,
        layer: activeLayer,
        turnIndex: input.partModel.revision || 1,
      });

      if (entities.length === 0) {
        entities.push(...rehydrated.entities);
      }
      session.activeFeature = rehydrated.featureState;
    }
  }

  const revision = session.turnIndex + 1;

  const partModel =
    entities.length === 0 && input.partModel
      ? structuredClone(input.partModel)
      : buildPartModelFromCanvas({
          entities,
          dimensions,
          selectedEntityIds,
          session,
          units,
          material,
          thickness,
          revision,
        });

  return {
    entities,
    dimensions,
    selectedEntityIds,
    activeLayer,
    units,
    material,
    thickness,
    revision,
    session,
    partModel,
    assumptions: [],
    clarification: null,
    explanations: [],
    unsupportedReports: [],
  };
}

function refreshSandboxPartModel(state: ExecutionSandboxState): void {
  state.partModel = buildPartModelFromCanvas({
    entities: state.entities,
    dimensions: state.dimensions,
    selectedEntityIds: state.selectedEntityIds,
    session: state.session,
    units: state.units,
    material: state.material,
    thickness: state.thickness,
    revision: state.revision,
  });
}

function normalizeCornerSelector(
  corners?: DslV2CornerSelection | DslV2CornerSelection[],
): CornerSelector {
  if (!corners) return "all";
  if (typeof corners === "string") return corners;
  if (corners.length === 0) return "none";
  if (corners.length >= 4 || corners.includes("all")) return "all";
  if (corners.includes("top_left") && corners.includes("bottom_left")) return "left_two";
  if (corners.includes("top_right") && corners.includes("bottom_right")) return "right_two";
  if (corners.includes("top_left") && corners.includes("top_right")) return "top_two";
  if (corners.includes("bottom_left") && corners.includes("bottom_right")) return "bottom_two";
  return corners[0]!;
}

/**
 * Resolve uma referência de posicionamento canônica `pos` (§6 do Gemini 4 Argon):
 *   - `{ abs: [x, y] }`
 *   - `{ center: id }`
 *   - `{ edge_offset: { id, side: 'left'|'right'|'top'|'bottom', dist: mm } }`
 *   - `{ from: { id, anchor: 'center'|'start'|'end'|'mid'|'tl'|'tr'|'br'|'bl'|'top'|'bottom'|'left'|'right' }, dx, dy }`
 *   - `{ polar: { center, r, angle } }`
 */
export function resolveCanonicalPositionRef(
  pos: DslV2PositionRef | undefined,
  state: Pick<ExecutionSandboxState, "entities" | "session" | "partModel">,
  fallback: Vec2 = { x: 0, y: 0 },
): Vec2 {
  if (!pos) return fallback;

  const extraDx = Number(pos.dx ?? pos.from?.dx ?? 0);
  const extraDy = Number(pos.dy ?? pos.from?.dy ?? 0);

  if (Array.isArray(pos.abs) && pos.abs.length >= 2) {
    return {
      x: Number(pos.abs[0]) + extraDx,
      y: Number(pos.abs[1]) + extraDy,
    };
  }

  const getReferenceBounds = (refId?: string): { minX: number; minY: number; maxX: number; maxY: number } => {
    const activePart = state.session.activeFeature;
    if (
      activePart &&
      (!refId || refId === activePart.partId || refId === "plate_1" || refId === "active_part")
    ) {
      return {
        minX: activePart.origin.x,
        minY: activePart.origin.y,
        maxX: activePart.origin.x + activePart.width,
        maxY: activePart.origin.y + activePart.height,
      };
    }
    if (refId) {
      const targetIds = resolveTargetEntityIds(refId, state.partModel, state.entities);
      const matched = state.entities.filter((e) => targetIds.includes(e.id));
      const b = bbox(matched);
      if (b) return b;
    }
    const allB = bbox(state.entities.filter((e) => e.layer !== "referencia"));
    if (allB) return allB;
    return { minX: 0, minY: 0, maxX: 400, maxY: 250 };
  };

  if (pos.center) {
    const b = getReferenceBounds(pos.center);
    return {
      x: (b.minX + b.maxX) / 2 + extraDx,
      y: (b.minY + b.maxY) / 2 + extraDy,
    };
  }

  if (pos.edge_offset) {
    const b = getReferenceBounds(pos.edge_offset.id);
    const dist = Number(pos.edge_offset.dist ?? 0);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    switch (pos.edge_offset.side) {
      case "left":
        return { x: b.minX + dist + extraDx, y: cy + extraDy };
      case "right":
        return { x: b.maxX - dist + extraDx, y: cy + extraDy };
      case "bottom":
        return { x: cx + extraDx, y: b.minY + dist + extraDy };
      case "top":
        return { x: cx + extraDx, y: b.maxY - dist + extraDy };
    }
  }

  if (pos.from) {
    const b = getReferenceBounds(pos.from.id);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    let base: Vec2 = { x: cx, y: cy };
    switch (pos.from.anchor) {
      case "center":
      case "mid":
        base = { x: cx, y: cy };
        break;
      case "start":
      case "bl":
        base = { x: b.minX, y: b.minY };
        break;
      case "end":
      case "tr":
        base = { x: b.maxX, y: b.maxY };
        break;
      case "tl":
        base = { x: b.minX, y: b.maxY };
        break;
      case "br":
        base = { x: b.maxX, y: b.minY };
        break;
      case "top":
        base = { x: cx, y: b.maxY };
        break;
      case "bottom":
        base = { x: cx, y: b.minY };
        break;
      case "left":
        base = { x: b.minX, y: cy };
        break;
      case "right":
        base = { x: b.maxX, y: cy };
        break;
    }
    return {
      x: Number((base.x + extraDx).toFixed(4)),
      y: Number((base.y + extraDy).toFixed(4)),
    };
  }

  if (pos.polar) {
    let pole: Vec2 = { x: 0, y: 0 };
    if (Array.isArray(pos.polar.center) && pos.polar.center.length >= 2) {
      pole = { x: Number(pos.polar.center[0]), y: Number(pos.polar.center[1]) };
    } else if (typeof pos.polar.center === "string") {
      const b = getReferenceBounds(pos.polar.center);
      pole = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    } else {
      const b = getReferenceBounds();
      pole = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
    const rad = Number(pos.polar.angle ?? 0) * DEG2RAD;
    const radius = Number(pos.polar.r ?? 0);
    return {
      x: Number((pole.x + radius * Math.cos(rad) + extraDx).toFixed(4)),
      y: Number((pole.y + radius * Math.sin(rad) + extraDy).toFixed(4)),
    };
  }

  return fallback;
}

/**
 * Calcula todos os centros de furação para os 8 padrões tipados de `add_holes` (§6.3 do Claude).
 */
export function normalizeHoleArgs(rawArgs: AddHolesArgs): AddHolesArgs {
  const pat = rawArgs.pattern as unknown;
  if (pat && typeof pat === "object" && !Array.isArray(pat)) {
    const pObj = pat as Record<string, unknown>;
    const pType = String(pObj.type ?? "line") as AddHolesArgs["pattern"];
    const axisRaw = String(pObj.axis ?? rawArgs.axis ?? "x");
    const axis: "x" | "y" =
      axisRaw === "vertical_center" || axisRaw === "y" ? "y" : "x";
    const marginVal =
      pObj.inset !== undefined
        ? Number(pObj.inset)
        : pObj.margin !== undefined
          ? Number(pObj.margin)
          : rawArgs.margin;
    return {
      ...rawArgs,
      pattern: pType,
      axis,
      count: pObj.count !== undefined ? Number(pObj.count) : rawArgs.count,
      distribution:
        (pObj.distribution as AddHolesArgs["distribution"]) ?? rawArgs.distribution,
      pitch: pObj.pitch !== undefined ? Number(pObj.pitch) : rawArgs.pitch,
      margin: marginVal,
      margin_x:
        pObj.inset_x !== undefined
          ? Number(pObj.inset_x)
          : pObj.margin_x !== undefined
            ? Number(pObj.margin_x)
            : marginVal,
      margin_y:
        pObj.inset_y !== undefined
          ? Number(pObj.inset_y)
          : pObj.margin_y !== undefined
            ? Number(pObj.margin_y)
            : marginVal,
      pcd: pObj.pcd !== undefined ? Number(pObj.pcd) : rawArgs.pcd,
      start_angle_deg:
        pObj.start_angle !== undefined
          ? Number(pObj.start_angle)
          : rawArgs.start_angle_deg,
      rows: pObj.rows !== undefined ? Number(pObj.rows) : rawArgs.rows,
      cols: pObj.cols !== undefined ? Number(pObj.cols) : rawArgs.cols,
      pitch_x: pObj.pitch_x !== undefined ? Number(pObj.pitch_x) : rawArgs.pitch_x,
      pitch_y: pObj.pitch_y !== undefined ? Number(pObj.pitch_y) : rawArgs.pitch_y,
    };
  }
  return rawArgs;
}

export function computeTypedHolePatternCenters(
  rawArgs: AddHolesArgs,
  hostBounds: { minX: number; minY: number; width: number; height: number },
): {
  centers: Vec2[];
  computedPitch?: number;
  computedPitchY?: number;
  warnings: string[];
  errors: string[];
} {
  const args = normalizeHoleArgs(rawArgs);
  const warnings: string[] = [];
  const errors: string[] = [];
  const d = Number(args.d);
  if (!Number.isFinite(d) || d <= 0) {
    errors.push(`Diâmetro de furo inválido (d=${args.d} mm). Deve ser > 0.`);
    return { centers: [], warnings, errors };
  }

  const r = d / 2;
  const measureFrom = args.measure_from ?? "center_to_edge";
  const rawMarginX = args.margin_x ?? args.margin ?? args.end_margin ?? 25;
  const rawMarginY = args.margin_y ?? args.margin ?? args.end_margin ?? rawMarginX;

  const effMarginX = measureFrom === "hole_edge_to_edge" ? rawMarginX + r : rawMarginX;
  const effMarginY = measureFrom === "hole_edge_to_edge" ? rawMarginY + r : rawMarginY;

  const x0 = hostBounds.minX;
  const y0 = hostBounds.minY;
  const W = hostBounds.width;
  const H = hostBounds.height;
  const cx = x0 + W / 2;
  const cy = y0 + H / 2;

  const centers: Vec2[] = [];

  switch (args.pattern) {
    case "single": {
      if (args.at && args.at.length === 2) {
        centers.push({ x: args.at[0], y: args.at[1] });
      } else {
        centers.push({ x: cx + (args.x_offset ?? 0), y: cy + (args.y_offset ?? 0) });
      }
      return { centers, warnings, errors };
    }

    case "points": {
      if (!args.points || args.points.length === 0) {
        errors.push("Padrão 'points' requer uma lista não-vazia de coordenadas [[x, y], ...].");
        return { centers: [], warnings, errors };
      }
      for (const pt of args.points) {
        if (Array.isArray(pt) && pt.length >= 2) {
          centers.push({ x: Number(pt[0]), y: Number(pt[1]) });
        }
      }
      return { centers, warnings, errors };
    }

    case "corners": {
      const sel = normalizeCornerSelector(args.corners);
      const allCorners: Record<"bottom_left" | "bottom_right" | "top_right" | "top_left", Vec2> = {
        bottom_left: { x: x0 + effMarginX, y: y0 + effMarginY },
        bottom_right: { x: x0 + W - effMarginX, y: y0 + effMarginY },
        top_right: { x: x0 + W - effMarginX, y: y0 + H - effMarginY },
        top_left: { x: x0 + effMarginX, y: y0 + H - effMarginY },
      };

      if (sel === "all") {
        centers.push(
          allCorners.bottom_left,
          allCorners.bottom_right,
          allCorners.top_right,
          allCorners.top_left,
        );
      } else if (sel === "left_two") {
        centers.push(allCorners.bottom_left, allCorners.top_left);
      } else if (sel === "right_two") {
        centers.push(allCorners.bottom_right, allCorners.top_right);
      } else if (sel === "top_two") {
        centers.push(allCorners.top_left, allCorners.top_right);
      } else if (sel === "bottom_two") {
        centers.push(allCorners.bottom_left, allCorners.bottom_right);
      } else if (sel !== "none" && allCorners[sel]) {
        centers.push(allCorners[sel]);
      }
      return {
        centers,
        computedPitch: W - 2 * effMarginX,
        computedPitchY: H - 2 * effMarginY,
        warnings,
        errors,
      };
    }

    case "line": {
      const n = Math.max(1, Math.round(args.count ?? 2));
      const axis = args.axis ?? "x";
      const distMode = args.distribution ?? (args.pitch ? "fixed_pitch" : args.end_margin !== undefined || args.margin !== undefined ? "between_ends" : "equal_division");
      const baseLineY = cy + (args.y_offset ?? 0);
      const baseLineX = cx + (args.x_offset ?? 0);

      if (axis === "angle" && args.angle_deg !== undefined) {
        const rad = args.angle_deg * DEG2RAD;
        const step = args.pitch ?? Math.min(W, H) / (n + 1);
        const totalSpan = step * (n - 1);
        const startX = baseLineX - (totalSpan / 2) * Math.cos(rad);
        const startY = baseLineY - (totalSpan / 2) * Math.sin(rad);
        for (let i = 0; i < n; i++) {
          centers.push({
            x: Number((startX + i * step * Math.cos(rad)).toFixed(4)),
            y: Number((startY + i * step * Math.sin(rad)).toFixed(4)),
          });
        }
        return { centers, computedPitch: step, warnings, errors };
      }

      const totalLength = axis === "y" ? H : W;
      const startCoord = axis === "y" ? y0 : x0;
      const marginVal = axis === "y" ? effMarginY : effMarginX;

      let positions: number[] = [];
      let pitch = 0;

      if (distMode === "fixed_pitch" && args.pitch && args.pitch > 0) {
        pitch = args.pitch;
        const span = pitch * (n - 1);
        const first = (axis === "y" ? cy : cx) - span / 2;
        positions = Array.from({ length: n }, (_, i) => first + i * pitch);
      } else if (distMode === "between_ends") {
        const res = ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(
          startCoord,
          totalLength,
          marginVal,
          n,
        );
        positions = res.positions;
        pitch = res.pitch;
      } else if (distMode === "equal_gap_including_edges") {
        // Vãos livres iguais (parede-a-parede): gap = (W - N*d) / (N + 1)
        const gap = (totalLength - n * d) / (n + 1);
        pitch = gap + d;
        positions = Array.from({ length: n }, (_, i) => startCoord + gap + r + i * pitch);
      } else {
        // equal_division (§6 do Claude): N segmentos iguais, furo no centro de cada: x_i = (i + 0.5) * L / N
        pitch = totalLength / n;
        positions = Array.from({ length: n }, (_, i) => startCoord + (i + 0.5) * pitch);
      }

      for (const pos of positions) {
        if (axis === "y") {
          centers.push({ x: Number(baseLineX.toFixed(4)), y: Number(pos.toFixed(4)) });
        } else {
          centers.push({ x: Number(pos.toFixed(4)), y: Number(baseLineY.toFixed(4)) });
        }
      }
      return { centers, computedPitch: Number(pitch.toFixed(4)), warnings, errors };
    }

    case "grid": {
      const cols = Math.max(1, Math.round(args.cols ?? 2));
      const rows = Math.max(1, Math.round(args.rows ?? 2));
      const pitchX =
        args.pitch_x ??
        (cols > 1 ? (W - 2 * effMarginX) / (cols - 1) : 0);
      const pitchY =
        args.pitch_y ??
        (rows > 1 ? (H - 2 * effMarginY) / (rows - 1) : 0);

      const startX = args.pitch_x ? cx - ((cols - 1) * pitchX) / 2 : x0 + effMarginX;
      const startY = args.pitch_y ? cy - ((rows - 1) * pitchY) / 2 : y0 + effMarginY;

      for (let rIdx = 0; rIdx < rows; rIdx++) {
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          centers.push({
            x: Number((startX + cIdx * pitchX).toFixed(4)),
            y: Number((startY + rIdx * pitchY).toFixed(4)),
          });
        }
      }
      return {
        centers,
        computedPitch: Number(pitchX.toFixed(4)),
        computedPitchY: Number(pitchY.toFixed(4)),
        warnings,
        errors,
      };
    }

    case "bolt_circle": {
      const n = Math.max(1, Math.round(args.count ?? 4));
      const pcd = args.pcd ?? Math.min(W, H) * 0.65;
      const circleCenter: Vec2 = args.center
        ? { x: args.center[0], y: args.center[1] }
        : { x: cx, y: cy };
      const pts = ChamferGeometricExecutionEngine.computeCircularPcdCenters(
        circleCenter,
        pcd,
        n,
        args.start_angle_deg ?? 0,
      );
      return { centers: pts, warnings, errors };
    }

    case "along_edge": {
      const n = Math.max(1, Math.round(args.count ?? 3));
      const edge = args.edge ?? "top";
      const offset = args.edge_offset ?? effMarginY;
      const isHorizontalEdge = edge === "top" || edge === "bottom";
      const spanLen = isHorizontalEdge ? W : H;
      const startC = isHorizontalEdge ? x0 : y0;
      const endM = args.end_margin ?? effMarginX;
      const { positions, pitch } =
        ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(
          startC,
          spanLen,
          endM,
          n,
        );
      for (const pos of positions) {
        if (edge === "top") centers.push({ x: pos, y: y0 + H - offset });
        else if (edge === "bottom") centers.push({ x: pos, y: y0 + offset });
        else if (edge === "left") centers.push({ x: x0 + offset, y: pos });
        else centers.push({ x: x0 + W - offset, y: pos });
      }
      return { centers, computedPitch: Number(pitch.toFixed(4)), warnings, errors };
    }

    case "perimeter": {
      const cols = Math.max(2, Math.round(args.cols ?? args.count ?? 3));
      const rows = Math.max(2, Math.round(args.rows ?? 3));
      const xs = ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(
        x0,
        W,
        effMarginX,
        cols,
      ).positions;
      const ys = ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(
        y0,
        H,
        effMarginY,
        rows,
      ).positions;

      const seen = new Set<string>();
      const pushUnique = (x: number, y: number) => {
        const k = `${x.toFixed(3)}_${y.toFixed(3)}`;
        if (!seen.has(k)) {
          seen.add(k);
          centers.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
        }
      };

      for (const x of xs) pushUnique(x, y0 + effMarginY);
      for (const y of ys) pushUnique(x0 + W - effMarginX, y);
      for (const x of [...xs].reverse()) pushUnique(x, y0 + H - effMarginY);
      for (const y of [...ys].reverse()) pushUnique(x0 + effMarginX, y);

      return { centers, warnings, errors };
    }

    default:
      errors.push(`Padrão de furação desconhecido: ${String(args.pattern)}`);
      return { centers: [], warnings, errors };
  }
}

// ============================================================================
// 3. EXECUTOR DETERMINÍSTICO DE FERRAMENTAS DSL v2
// ============================================================================

export function executeSingleDslV2Tool(
  call: DslV2ToolCall,
  state: ExecutionSandboxState,
): ToolResult {
  const { name, args } = call;
  const created: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    switch (name) {
      // ----------------------------------------------------------------------
      // 6.1 PRIMITIVAS E CHAPAS 2D
      // ----------------------------------------------------------------------
      case "create_plate": {
        const a = args as unknown as CreatePlateArgs & {
          w?: number;
          h?: number;
          corners?:
            | DslV2CornerSelection
            | DslV2CornerSelection[]
            | { mode?: "none" | "fillet" | "chamfer"; size?: number; which?: DslV2CornerSelection | DslV2CornerSelection[] };
        };
        const width = Number(a.width ?? a.w);
        const height = Number(a.height ?? a.h);
        const cornerObj =
          a.corners && typeof a.corners === "object" && !Array.isArray(a.corners)
            ? a.corners
            : undefined;
        const cornerRadius = Number(
          a.corner_radius ?? (cornerObj?.mode === "fillet" ? cornerObj.size : 0) ?? 0,
        );
        const cornerChamfer = Number(
          a.corner_chamfer ?? (cornerObj?.mode === "chamfer" ? cornerObj.size : 0) ?? 0,
        );
        const cornerSelector = normalizeCornerSelector(
          cornerObj ? cornerObj.which : (a.corners as DslV2CornerSelection | DslV2CornerSelection[] | undefined),
        );
        const layer = a.layer ?? state.activeLayer;

        if (a.thickness && a.thickness > 0) state.thickness = Number(a.thickness);
        if (a.material) state.material = a.material;

        const origin: Vec2 =
          a.origin === "center"
            ? { x: -width / 2, y: -height / 2 }
            : Array.isArray(a.origin) && a.origin.length === 2
              ? { x: Number(a.origin[0]), y: Number(a.origin[1]) }
              : { x: 0, y: 0 };

        const cornerRadii = ChamferGeometricExecutionEngine.resolveCornerRadii(
          cornerRadius,
          cornerSelector,
        );

        const validation = ChamferValidationEngine.validatePlate({
          width,
          height,
          origin,
          cornerRadii,
          cornerChamfer,
          holes: [],
        });

        for (const issue of validation.issues) {
          if (issue.severity === "error") errors.push(issue.message);
          else warnings.push(issue.message);
        }
        if (errors.length > 0) {
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }

        const partId = a.id ?? `plate_${state.revision}`;
        const compiled = ChamferGeometricExecutionEngine.compileParametricPlate({
          partId,
          origin,
          width,
          height,
          cornerRadii,
          cornerChamfer,
          cornerSelector,
          includeDimensions: true,
          layer,
          turnIndex: state.revision,
        });

        state.entities.push(...compiled.entities);
        state.dimensions.push(...compiled.dimensions);
        state.selectedEntityIds = compiled.entities.map((e) => e.id);
        state.session.activeFeature = compiled.featureState;
        state.session.featureHistory.push(compiled.featureState);
        created.push(partId, ...compiled.entities.map((e) => e.id));

        refreshSandboxPartModel(state);
        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: { partId, width, height, cornerRadius, cornerSelector },
        };
      }

      case "create_rectangle": {
        const a = args as unknown as CreateRectangleArgs;
        const w = Number(a.width);
        const h = Number(a.height);
        if (w <= 0 || h <= 0) {
          errors.push("Largura e altura do retângulo devem ser maiores que zero.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const resolvedPos = a.pos ? resolveCanonicalPositionRef(a.pos, state) : null;
        const x0 = a.center
          ? a.center[0] - w / 2
          : resolvedPos
            ? resolvedPos.x - w / 2
            : a.origin
              ? a.origin[0]
              : 0;
        const y0 = a.center
          ? a.center[1] - h / 2
          : resolvedPos
            ? resolvedPos.y - h / 2
            : a.origin
              ? a.origin[1]
              : 0;
        let ent = rectPolyline(
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 + h },
          a.layer ?? state.activeLayer,
          Number(a.corner_radius ?? 0),
        );
        if (a.id) ent = { ...ent, id: a.id };
        if (a.angle_deg) {
          ent = rotate(ent, { x: x0 + w / 2, y: y0 + h / 2 }, Number(a.angle_deg));
        }
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_circle": {
        const a = args as unknown as CreateCircleArgs;
        const r = a.r !== undefined ? Number(a.r) : a.d !== undefined ? Number(a.d) / 2 : 0;
        if (!Number.isFinite(r) || r <= 0) {
          errors.push("Círculo requer diâmetro (d > 0) ou raio (r > 0).");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const resolvedCircleCenter = a.center
          ? { x: Number(a.center[0]), y: Number(a.center[1]) }
          : resolveCanonicalPositionRef(a.pos, state, { x: 0, y: 0 });
        const cx = resolvedCircleCenter.x;
        const cy = resolvedCircleCenter.y;
        const layer =
          a.layer ?? (a.role === "reference" ? "referencia" : state.activeLayer);
        const ent: Entity = {
          id: a.id ?? uid(),
          layer,
          type: "circle",
          cx,
          cy,
          r,
          isConstruction: a.role === "reference",
        };
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_line": {
        const a = args as unknown as CreateLineArgs;
        const x1 = a.from?.[0] ?? 0;
        const y1 = a.from?.[1] ?? 0;
        let x2 = a.to?.[0];
        let y2 = a.to?.[1];
        if (x2 === undefined || y2 === undefined) {
          const len = Number(a.length ?? 100);
          const ang = Number(a.angle_deg ?? 0) * DEG2RAD;
          x2 = Number((x1 + len * Math.cos(ang)).toFixed(4));
          y2 = Number((y1 + len * Math.sin(ang)).toFixed(4));
        }
        if (Math.hypot(x2 - x1, y2 - y1) < 1e-4) {
          errors.push("Linha degenerada com comprimento zero.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const ent: Entity = {
          id: a.id ?? uid(),
          layer: a.layer ?? state.activeLayer,
          type: "line",
          x1,
          y1,
          x2,
          y2,
        };
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_polyline": {
        const a = args as unknown as CreatePolylineArgs;
        if (!Array.isArray(a.points) || a.points.length < 2) {
          errors.push("Polilinha requer ao menos 2 vértices [x, y].");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const pts: Vec2[] = a.points.map((p) => ({ x: Number(p[0]), y: Number(p[1]) }));
        const ent: Entity = {
          id: a.id ?? uid(),
          layer: a.layer ?? state.activeLayer,
          type: "polyline",
          closed: a.closed ?? true,
          pts,
        };
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_arc": {
        const a = args as unknown as CreateArcArgs;
        const r = Number(a.r ?? 50);
        if (r <= 0) {
          errors.push("Raio do arco deve ser positivo.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const ent: Entity = {
          id: a.id ?? uid(),
          layer: a.layer ?? state.activeLayer,
          type: "arc",
          cx: a.center?.[0] ?? 0,
          cy: a.center?.[1] ?? 0,
          r,
          a0: Number(a.start_deg ?? 0) * DEG2RAD,
          a1: Number(a.end_deg ?? 90) * DEG2RAD,
        };
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_ellipse": {
        const a = args as unknown as CreateEllipseArgs;
        const rx = Number(a.rx);
        const ry = Number(a.ry);
        if (rx <= 0 || ry <= 0) {
          errors.push("Raios rx e ry da elipse devem ser maiores que zero.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const ent: Entity = {
          id: a.id ?? uid(),
          layer: a.layer ?? state.activeLayer,
          type: "ellipse",
          cx: a.center?.[0] ?? 0,
          cy: a.center?.[1] ?? 0,
          rx,
          ry,
          rotation: Number(a.angle_deg ?? 0) * DEG2RAD,
        };
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_polygon": {
        const a = args as unknown as CreatePolygonArgs;
        const sides = Math.max(3, Math.round(Number(a.sides ?? 6)));
        let r = Number(a.r ?? 50);
        if (a.across_flats && a.across_flats > 0) {
          r = Number(a.across_flats) / (2 * Math.cos(Math.PI / sides));
        } else if (a.inscribed === false && r > 0) {
          r = r / Math.cos(Math.PI / sides);
        }
        const center: Vec2 = { x: a.center?.[0] ?? 0, y: a.center?.[1] ?? 0 };
        let ent = polygonEntity(center, r, sides, a.layer ?? state.activeLayer);
        if (a.id) ent = { ...ent, id: a.id };
        if (a.angle_deg) ent = rotate(ent, center, Number(a.angle_deg));
        state.entities.push(ent);
        state.selectedEntityIds = [ent.id];
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_text":
      case "add_text": {
        const a = args as unknown as CreateTextArgs;
        const ent: Entity = {
          id: a.id ?? uid(),
          layer: a.layer ?? "anotacoes",
          type: "text",
          text: String(a.text ?? ""),
          x: a.at?.[0] ?? 0,
          y: a.at?.[1] ?? 0,
          size: Number(a.height ?? 12),
          rotation: Number(a.angle_deg ?? 0),
        };
        state.entities.push(ent);
        created.push(ent.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_centerlines": {
        const a = args as unknown as CreateCenterlinesArgs;
        const b = bbox(state.entities.filter((e) => e.layer !== "referencia"));
        const minX = b ? b.minX : 0;
        const minY = b ? b.minY : 0;
        const maxX = b ? b.maxX : 400;
        const maxY = b ? b.maxY : 250;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const axes = a.axes ?? "both";

        if (axes === "x" || axes === "both") {
          const clH: Entity = {
            id: uid(),
            layer: "referencia",
            type: "line",
            x1: minX - 15,
            y1: cy,
            x2: maxX + 15,
            y2: cy,
            isConstruction: true,
          };
          state.entities.push(clH);
          created.push(clH.id);
        }
        if (axes === "y" || axes === "both") {
          const clV: Entity = {
            id: uid(),
            layer: "referencia",
            type: "line",
            x1: cx,
            y1: minY - 15,
            x2: cx,
            y2: maxY + 15,
            isConstruction: true,
          };
          state.entities.push(clV);
          created.push(clV.id);
        }
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      // ----------------------------------------------------------------------
      // 6.2 PEÇAS COMPOSTAS E CALDEIRARIA
      // ----------------------------------------------------------------------
      case "create_slot": {
        const a = args as unknown as CreateSlotArgs;
        const width = Number(a.width);
        const rawLength = Number(a.length);
        if (width <= 0 || rawLength <= 0) {
          errors.push("Comprimento e largura do rasgo oblongo devem ser positivos.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const mode = a.mode ?? "total_length";
        const centerToCenterLen =
          mode === "total_length" ? Math.max(0, rawLength - width) : rawLength;

        const hostPart = state.session.activeFeature;
        const defaultSlotCenter: Vec2 = hostPart
          ? {
              x: hostPart.origin.x + hostPart.width / 2,
              y: hostPart.origin.y + hostPart.height / 2,
            }
          : { x: 0, y: 0 };
        const center: Vec2 = a.center
          ? { x: Number(a.center[0]), y: Number(a.center[1]) }
          : resolveCanonicalPositionRef(a.pos, state, defaultSlotCenter);

        let slotEnt = createSlotPolyline(
          center,
          centerToCenterLen,
          width,
          Number(a.angle_deg ?? 0),
          a.layer ?? state.activeLayer,
        );
        if (a.id) slotEnt = { ...slotEnt, id: a.id };

        state.entities.push(slotEnt);
        state.selectedEntityIds = [slotEnt.id];
        created.push(slotEnt.id);

        if (hostPart) {
          hostPart.slotGroups.push({
            id: a.id ?? `slot_${hostPart.slotGroups.length + 1}`,
            center,
            length: rawLength,
            width,
            angleDeg: Number(a.angle_deg ?? 0),
            entityIds: [slotEnt.id],
          });
          hostPart.allEntityIds.push(slotEnt.id);
        }

        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_flange": {
        const a = args as unknown as CreateFlangeArgs & {
          d_out?: number;
          d_in?: number;
          n?: number;
          start_angle?: number;
          pos?: { abs?: [number, number] };
        };
        const outerDiameter = Number(a.outer_d ?? a.d_out);
        const innerDiameter = Number(a.inner_d ?? a.d_in ?? 0);
        const pcd = Number(a.pcd);
        const holeCount = Math.round(Number(a.hole_count ?? a.n));
        const holeDiameter = Number(a.hole_d);

        const validation = ChamferValidationEngine.validateFlange({
          outerDiameter,
          innerDiameter,
          pcd,
          holeCount,
          holeDiameter,
        });
        for (const issue of validation.issues) {
          if (issue.severity === "error") errors.push(issue.message);
          else warnings.push(issue.message);
        }
        if (errors.length > 0) {
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }

        const flangeCenter = a.center
          ? { x: a.center[0], y: a.center[1] }
          : a.pos?.abs
            ? { x: a.pos.abs[0], y: a.pos.abs[1] }
            : { x: 0, y: 0 };

        const compiled = ChamferGeometricExecutionEngine.compileCircularFlange({
          partId: a.id ?? `flange_${state.revision}`,
          center: flangeCenter,
          outerDiameter,
          innerDiameter,
          pcd,
          holeCount,
          holeDiameter,
          startAngleDeg: Number(a.start_angle_deg ?? a.start_angle ?? 0),
          layer: a.layer ?? state.activeLayer,
          turnIndex: state.revision,
        });

        state.entities.push(...compiled.entities);
        state.dimensions.push(...compiled.dimensions);
        state.selectedEntityIds = compiled.entities.map((e) => e.id);
        state.session.activeFeature = compiled.featureState;
        state.session.featureHistory.push(compiled.featureState);
        created.push(compiled.featureState.partId, ...compiled.entities.map((e) => e.id));

        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "develop_cylinder": {
        const a = args as unknown as DevelopCylinderArgs;
        const d = Number(a.d);
        const h = Number(a.height);
        const t = Number(a.thickness ?? state.thickness);
        const kNeutral = Number(a.neutral_factor ?? 0.5);
        const seam = Number(a.seam_allowance ?? 0);
        if (d <= 0 || h <= 0) {
          errors.push("Diâmetro e altura da virola cilíndrica devem ser positivos.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const neutralDiameter = d - t + 2 * kNeutral * t;
        const developedLength = Number((Math.PI * neutralDiameter + seam).toFixed(2));
        const plateEnt = rectPolyline(
          { x: 0, y: 0 },
          { x: developedLength, y: h },
          "corte",
          0,
        );
        state.entities.push(plateEnt);
        state.selectedEntityIds = [plateEnt.id];
        created.push(plateEnt.id);
        refreshSandboxPartModel(state);
        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: { developedLength, height: h, neutralDiameter },
        };
      }

      case "develop_cone": {
        const a = args as unknown as DevelopConeArgs;
        const d1 = Number(a.d1);
        const d2 = Number(a.d2);
        const h = Number(a.height);
        if (d1 <= 0 || d2 <= 0 || h <= 0 || Math.abs(d1 - d2) < 1e-3) {
          errors.push("Tronco de cone requer d1 != d2 > 0 e height > 0.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const compiled = ChamferGeometricExecutionEngine.compileTruncatedCone({
          baseDiameter: Math.max(d1, d2),
          topDiameter: Math.min(d1, d2),
          height: h,
          divisions: a.divisions ?? 12,
        });
        state.entities.push(...compiled.entities);
        state.selectedEntityIds = compiled.entities.map((e) => e.id);
        created.push(...compiled.entities.map((e) => e.id));
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "develop_square_to_round": {
        const a = args as unknown as DevelopSquareToRoundArgs;
        const compiled = ChamferGeometricExecutionEngine.compileSquareToRound({
          squareWidth: Number(a.square_w),
          squareDepth: Number(a.square_d ?? a.square_w),
          roundDiameter: Number(a.round_d),
          height: Number(a.height),
          thickness: Number(a.thickness ?? state.thickness),
        });
        state.entities.push(...compiled.entities);
        state.selectedEntityIds = compiled.entities.map((e) => e.id);
        created.push(...compiled.entities.map((e) => e.id));
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "develop_pipe_branch": {
        const a = args as unknown as DevelopPipeBranchArgs;
        if (Number(a.branch_d) > Number(a.header_d)) {
          errors.push(
            `O diâmetro do ramal (${a.branch_d} mm) não pode exceder o diâmetro do coletor (${a.header_d} mm).`,
          );
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const compiled = ChamferGeometricExecutionEngine.compileCylindricalBranch({
          mainDiameter: Number(a.header_d),
          branchDiameter: Number(a.branch_d),
          branchHeight: Number(a.branch_height ?? 250),
          angleDeg: Number(a.angle_deg ?? 90),
        });
        state.entities.push(...compiled.entities);
        state.selectedEntityIds = compiled.entities.map((e) => e.id);
        created.push(...compiled.entities.map((e) => e.id));
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "develop_mitered_bend": {
        const a = args as unknown as DevelopMiteredBendArgs;
        const compiled = ChamferGeometricExecutionEngine.compileSegmentedElbow({
          diameter: Number(a.d),
          bendRadius: Number(a.bend_radius),
          angleDeg: Number(a.angle_deg ?? 90),
          segments: Number(a.segments ?? 4),
        });
        state.entities.push(...compiled.entities);
        state.selectedEntityIds = compiled.entities.map((e) => e.id);
        created.push(...compiled.entities.map((e) => e.id));
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "create_gusset": {
        const a = args as unknown as CreateGussetArgs;
        const legA = Number(a.leg_a);
        const legB = Number(a.leg_b);
        const nose = Math.max(0, Number(a.chamfer_nose ?? 15));
        if (legA <= nose || legB <= nose) {
          errors.push("Os catetos da mão-francesa devem ser maiores que o recorte de alívio.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }
        const pts: Vec2[] =
          nose > 0
            ? [
                { x: nose, y: 0 },
                { x: legA, y: 0 },
                { x: 0, y: legB },
                { x: 0, y: nose },
              ]
            : [
                { x: 0, y: 0 },
                { x: legA, y: 0 },
                { x: 0, y: legB },
              ];
        const gussetEnt: Entity = {
          id: uid(),
          layer: a.layer ?? state.activeLayer,
          type: "polyline",
          closed: true,
          pts,
        };
        state.entities.push(gussetEnt);
        created.push(gussetEnt.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "bend_allowance": {
        const a = args as unknown as BendAllowanceArgs;
        const t = Number(a.thickness);
        const rIn = Number(a.inside_radius);
        const ang = Number(a.angle_deg);
        const k = Number(a.k_factor ?? 0.44);
        const ba = Number(((Math.PI * (rIn + k * t) * ang) / 180).toFixed(3));
        const outsideSetback = Number((Math.tan((ang * DEG2RAD) / 2) * (rIn + t)).toFixed(3));
        const bendDeduction = Number((2 * outsideSetback - ba).toFixed(3));
        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: {
            bendAllowanceMm: ba,
            bendDeductionMm: bendDeduction,
            outsideSetbackMm: outsideSetback,
            kFactor: k,
          },
        };
      }

      // ----------------------------------------------------------------------
      // 6.3 FURAÇÃO TIPADA E RECORTES
      // ----------------------------------------------------------------------
      case "add_holes": {
        const rawA = args as unknown as AddHolesArgs;
        const a = normalizeHoleArgs(rawA);
        const activePart = state.session.activeFeature;
        const overallB = bbox(state.entities.filter((e) => e.layer !== "referencia"));

        const hostBounds = activePart
          ? {
              minX: activePart.origin.x,
              minY: activePart.origin.y,
              width: activePart.width,
              height: activePart.height,
            }
          : overallB
            ? {
                minX: overallB.minX,
                minY: overallB.minY,
                width: Math.max(10, overallB.maxX - overallB.minX),
                height: Math.max(10, overallB.maxY - overallB.minY),
              }
            : { minX: 0, minY: 0, width: 400, height: 250 };

        const computed = computeTypedHolePatternCenters(a, hostBounds);
        warnings.push(...computed.warnings);
        errors.push(...computed.errors);
        if (errors.length > 0) {
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }

        const r = Number(a.d) / 2;
        const existingHoles: HoleCandidate[] = state.entities
          .filter(
            (e): e is Extract<Entity, { type: "circle" }> =>
              e.type === "circle" && e.layer !== "referencia" && !e.isConstruction,
          )
          .map((c) => ({ id: c.id, cx: c.cx, cy: c.cy, r: c.r }));

        const newCandidates: HoleCandidate[] = computed.centers.map((pt) => ({
          id: uid(),
          cx: pt.x,
          cy: pt.y,
          r,
        }));

        // Valida limites da chapa hospedeira e colisões entre furos
        const validation = ChamferValidationEngine.validatePlate({
          width: hostBounds.width,
          height: hostBounds.height,
          origin: { x: hostBounds.minX, y: hostBounds.minY },
          cornerRadii: activePart?.cornerRadii ?? {
            top_left: 0,
            top_right: 0,
            bottom_right: 0,
            bottom_left: 0,
          },
          holes: [...existingHoles, ...newCandidates],
        });

        for (const issue of validation.issues) {
          if (issue.severity === "error") errors.push(issue.message);
          else warnings.push(issue.message);
        }
        if (errors.length > 0) {
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }

        const groupId = a.id ?? `holes_${(activePart?.holeGroups.length ?? 0) + 1}`;
        const layer = a.layer ?? state.activeLayer;
        const holeEntityIds: string[] = [];

        for (const cand of newCandidates) {
          const holeEnt: Entity = {
            id: cand.id,
            layer,
            type: "circle",
            cx: cand.cx,
            cy: cand.cy,
            r: cand.r,
            params: {
              isParametricHole: true,
              parentPartId: activePart?.partId ?? a.parent,
              holeGroupId: groupId,
              diameter: a.d,
            },
          };
          state.entities.push(holeEnt);
          holeEntityIds.push(holeEnt.id);
          created.push(holeEnt.id);
        }

        if (activePart) {
          const mappedDist: ParametricHoleGroup["distribution"] =
            a.pattern === "corners"
              ? "corner_margins"
              : a.pattern === "bolt_circle"
                ? "circular_pcd"
                : a.pattern === "single"
                  ? "single_center"
                  : a.axis === "y"
                    ? "linear_centerline_y"
                    : "linear_centerline_x";

          activePart.holeGroups.push({
            id: groupId,
            distribution: mappedDist,
            linearFormula:
              a.distribution === "between_ends"
                ? "margin_plus_equal_pitch"
                : a.distribution === "fixed_pitch"
                  ? "pitch_between_extremes"
                  : "equal_subdivision_including_borders",
            measurementMode:
              a.measure_from === "hole_edge_to_edge"
                ? "outer_edge_to_edge"
                : a.measure_from === "center_to_center"
                  ? "center_to_center"
                  : "center_to_edge",
            count: newCandidates.length,
            diameter: Number(a.d),
            margin: Number(a.margin ?? a.margin_x ?? a.end_margin ?? 25),
            marginY: a.margin_y !== undefined ? Number(a.margin_y) : undefined,
            pitch: computed.computedPitch,
            pcd: a.pcd !== undefined ? Number(a.pcd) : undefined,
            startAngleDeg: a.start_angle_deg ?? 0,
            entityIds: holeEntityIds,
          });
          activePart.allEntityIds.push(...holeEntityIds);
        }

        state.selectedEntityIds = holeEntityIds;
        refreshSandboxPartModel(state);
        return {
          ok: true,
          tool: name,
          created: [groupId, ...holeEntityIds],
          changed,
          removed,
          warnings,
          errors,
          data: {
            groupId,
            count: newCandidates.length,
            centers: newCandidates.map((c) => [c.cx, c.cy]),
            pitch: computed.computedPitch,
          },
        };
      }

      case "add_cutout":
      case "create_cutout": {
        const a = args as unknown as AddCutoutArgs;
        const activePart = state.session.activeFeature;
        const fallbackCenter: Vec2 = activePart
          ? {
              x: activePart.origin.x + activePart.width / 2,
              y: activePart.origin.y + activePart.height / 2,
            }
          : { x: 200, y: 125 };
        const center: Vec2 = a.center
          ? { x: Number(a.center[0]), y: Number(a.center[1]) }
          : resolveCanonicalPositionRef(a.pos, state, fallbackCenter);

        const layer = a.layer ?? "recorte";
        let cutoutEnt: Entity;

        if (a.shape === "circle") {
          const r = Number(a.d ?? a.width ?? a.w ?? 40) / 2;
          cutoutEnt = { id: a.id ?? uid(), layer, type: "circle", cx: center.x, cy: center.y, r };
        } else if (a.shape === "slot") {
          const w = Number(a.height ?? a.h ?? 20);
          const l = Math.max(0, Number(a.width ?? a.w ?? 80) - w);
          cutoutEnt = createSlotPolyline(center, l, w, Number(a.angle_deg ?? 0), layer);
        } else if (a.shape === "polygon") {
          const r = Number(a.d ?? a.width ?? a.w ?? 50) / 2;
          cutoutEnt = polygonEntity(center, r, Number(a.sides ?? 6), layer);
        } else {
          const w = Number(a.width ?? a.w ?? 80);
          const h = Number(a.height ?? a.h ?? 50);
          cutoutEnt = rectPolyline(
            { x: center.x - w / 2, y: center.y - h / 2 },
            { x: center.x + w / 2, y: center.y + h / 2 },
            layer,
            Number(a.corner_radius ?? 0),
          );
        }

        // Verifica se o recorte cabe dentro da chapa hospedeira
        if (activePart) {
          const cb = boxOf(cutoutEnt);
          if (
            cb.minX < activePart.origin.x ||
            cb.maxX > activePart.origin.x + activePart.width ||
            cb.minY < activePart.origin.y ||
            cb.maxY > activePart.origin.y + activePart.height
          ) {
            errors.push("O recorte interno ultrapassa as bordas externas da chapa hospedeira.");
            return { ok: false, tool: name, created, changed, removed, warnings, errors };
          }
          activePart.allEntityIds.push(cutoutEnt.id);
        }

        state.entities.push(cutoutEnt);
        state.selectedEntityIds = [cutoutEnt.id];
        created.push(cutoutEnt.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      // ----------------------------------------------------------------------
      // 6.4 MODIFICAÇÃO E TRANSFORMAÇÃO
      // ----------------------------------------------------------------------
      case "edit_feature": {
        const a = args as unknown as EditFeatureArgs & {
          params?: Record<string, unknown>;
        };
        const rawChanges = (a.changes ?? a.params ?? {}) as Record<string, unknown>;
        const activePart = state.session.activeFeature;

        // Se o alvo é um grupo de furos ou "all_holes", atualiza os furos e recompila se mudou count
        if (
          a.id === "all_holes" ||
          a.id.startsWith("holes") ||
          a.id.startsWith("hg_")
        ) {
          const patObj = rawChanges.pattern as { count?: number; pitch?: number } | undefined;
          const newCount =
            patObj?.count !== undefined
              ? Number(patObj.count)
              : rawChanges.count !== undefined
                ? Number(rawChanges.count)
                : rawChanges.hole_count !== undefined
                  ? Number(rawChanges.hole_count)
                  : undefined;
          const newD =
            rawChanges.d !== undefined
              ? Number(rawChanges.d)
              : rawChanges.hole_diameter !== undefined
                ? Number(rawChanges.hole_diameter)
                : undefined;

          if (activePart && activePart.kind === "plate" && activePart.holeGroups[0]) {
            const hg0 = activePart.holeGroups[0];
            const updatedGroup: ParametricHoleGroup = {
              ...hg0,
              count: newCount ?? hg0.count,
              diameter: newD ?? hg0.diameter,
            };
            const compiled = ChamferGeometricExecutionEngine.compileParametricPlate({
              partId: activePart.partId,
              origin: activePart.origin,
              width: activePart.width,
              height: activePart.height,
              cornerRadii: activePart.cornerRadii,
              cornerChamfer: activePart.cornerChamfer ?? 0,
              cornerSelector: activePart.cornerSelector,
              holeGroup: updatedGroup,
              includeCenterlines: activePart.centerlineEntityIds.length > 0,
              includeDimensions: true,
              layer: activePart.layer,
              turnIndex: state.revision,
            });
            const oldSet = new Set(activePart.allEntityIds);
            state.entities = [
              ...state.entities.filter((e) => !oldSet.has(e.id)),
              ...compiled.entities,
            ];
            state.session.activeFeature = compiled.featureState;
            changed.push(a.id, ...compiled.entities.map((e) => e.id));
            refreshSandboxPartModel(state);
            return { ok: true, tool: name, created, changed, removed, warnings, errors };
          }

          if (newD !== undefined && newD > 0) {
            const targetIds = resolveTargetEntityIds(a.id, state.partModel, state.entities);
            const targetSet = new Set(targetIds);
            state.entities = state.entities.map((e) => {
              if (e.type === "circle" && (targetSet.has(e.id) || targetIds.length === 0)) {
                changed.push(e.id);
                return { ...e, r: newD / 2 };
              }
              return e;
            });
          }
          refreshSandboxPartModel(state);
          return { ok: true, tool: name, created, changed, removed, warnings, errors };
        }

        if (activePart && activePart.kind === "plate") {
          const nextWidth = Number(rawChanges.width ?? rawChanges.w ?? activePart.width);
          const nextHeight = Number(rawChanges.height ?? rawChanges.h ?? activePart.height);
          const currentMaxR = Math.max(
            activePart.cornerRadii.top_left,
            activePart.cornerRadii.top_right,
            activePart.cornerRadii.bottom_right,
            activePart.cornerRadii.bottom_left,
          );
          const cornerObj =
            rawChanges.corners && typeof rawChanges.corners === "object" && !Array.isArray(rawChanges.corners)
              ? (rawChanges.corners as { size?: number; which?: DslV2CornerSelection })
              : undefined;
          const nextRadius = Number(
            rawChanges.corner_radius ?? rawChanges.r ?? cornerObj?.size ?? currentMaxR,
          );
          const nextCornerSel = normalizeCornerSelector(
            (cornerObj?.which ?? rawChanges.corners ?? rawChanges.corner_selector ?? activePart.cornerSelector) as DslV2CornerSelection,
          );
          const nextCornerRadii = ChamferGeometricExecutionEngine.resolveCornerRadii(
            nextRadius,
            nextCornerSel,
            activePart.cornerRadii,
          );
          const nextChamfer = Number(
            rawChanges.corner_chamfer ?? activePart.cornerChamfer ?? 0,
          );

          const hg0 = activePart.holeGroups[0];
          const holeGroupSpec = hg0
            ? {
                ...hg0,
                count: Number(rawChanges.hole_count ?? rawChanges.count ?? hg0.count),
                diameter: Number(rawChanges.hole_diameter ?? rawChanges.d ?? hg0.diameter),
                margin: Number(rawChanges.margin ?? hg0.margin),
              }
            : undefined;

          const compiled = ChamferGeometricExecutionEngine.compileParametricPlate({
            partId: activePart.partId,
            origin: activePart.origin,
            width: nextWidth,
            height: nextHeight,
            cornerRadii: nextCornerRadii,
            cornerChamfer: nextChamfer,
            cornerSelector: nextCornerSel,
            holeGroup: holeGroupSpec,
            includeCenterlines: activePart.centerlineEntityIds.length > 0,
            includeDimensions: true,
            layer: activePart.layer,
            turnIndex: state.revision,
          });

          const validation = ChamferValidationEngine.validatePlate({
            width: nextWidth,
            height: nextHeight,
            origin: activePart.origin,
            cornerRadii: nextCornerRadii,
            cornerChamfer: nextChamfer,
            holes: compiled.holes,
          });

          for (const issue of validation.issues) {
            if (issue.severity === "error") errors.push(issue.message);
            else warnings.push(issue.message);
          }
          if (errors.length > 0) {
            return { ok: false, tool: name, created, changed, removed, warnings, errors };
          }

          const oldSet = new Set(activePart.allEntityIds);
          state.entities = [
            ...state.entities.filter((e) => !oldSet.has(e.id)),
            ...compiled.entities,
          ];
          state.session.activeFeature = compiled.featureState;
          changed.push(activePart.partId, ...compiled.entities.map((e) => e.id));
          refreshSandboxPartModel(state);
          return { ok: true, tool: name, created, changed, removed, warnings, errors };
        }

        errors.push(`Recurso '${a.id}' não encontrado para edição.`);
        return { ok: false, tool: name, created, changed, removed, warnings, errors };
      }

      case "transform": {
        const a = args as unknown as TransformArgs;
        const targetIds = resolveTargetEntityIds(a.target, state.partModel, state.entities);
        const targetSet = new Set(targetIds);
        const pool = state.entities.filter((e) => targetSet.has(e.id));
        if (pool.length === 0) {
          errors.push("Nenhuma entidade encontrada para transformar.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }

        const b = bbox(pool) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        const pivot: Vec2 = a.pivot
          ? { x: a.pivot[0], y: a.pivot[1] }
          : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };

        const transformOne = (ent: Entity): Entity => {
          switch (a.op) {
            case "move":
              return translate(ent, Number(a.dx ?? 0), Number(a.dy ?? 0));
            case "rotate":
              return rotate(ent, pivot, Number(a.angle_deg ?? 90));
            case "scale":
              return scaleEntity(ent, pivot, Number(a.factor ?? 1));
            case "mirror":
              return mirror(ent, pivot, a.axis === "y" ? "y" : "x");
            case "center_on_origin":
            case "align":
              return translate(ent, -pivot.x, -pivot.y);
            default:
              return ent;
          }
        };

        if (a.copy) {
          const copies = pool.map((e) => ({ ...transformOne(e), id: uid() }));
          state.entities.push(...copies);
          created.push(...copies.map((c) => c.id));
        } else {
          state.entities = state.entities.map((e) => {
            if (targetSet.has(e.id)) {
              changed.push(e.id);
              return transformOne(e);
            }
            return e;
          });
        }

        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "edit_geometry": {
        const a = args as unknown as EditGeometryArgs;
        const targetIds = resolveTargetEntityIds(a.target, state.partModel, state.entities);
        const targetSet = new Set(targetIds);
        const pool = state.entities.filter((e) => targetSet.has(e.id));

        if (a.op === "offset") {
          const distVal = Number(a.distance ?? 10) * (a.side === "in" ? -1 : 1);
          for (const ent of pool) {
            const off = offsetEntity(ent, distVal);
            if (off) {
              state.entities.push(off);
              created.push(off.id);
            }
          }
          refreshSandboxPartModel(state);
          return { ok: true, tool: name, created, changed, removed, warnings, errors };
        }

        if (a.op === "fillet" || a.op === "chamfer") {
          // Delega para edit_feature na peça ativa quando aplicável
          if (state.session.activeFeature?.kind === "plate") {
            return executeSingleDslV2Tool(
              {
                id: call.id,
                name: "edit_feature",
                args: {
                  id: state.session.activeFeature.partId,
                  changes:
                    a.op === "fillet"
                      ? { corner_radius: Number(a.radius ?? 20), corners: a.corners ?? "all" }
                      : { corner_chamfer: Number(a.d1 ?? 15), corners: a.corners ?? "all" },
                },
              },
              state,
            );
          }
        }

        if (a.op === "explode") {
          for (const ent of pool) {
            const parts = explodeEntity(ent);
            if (parts.length > 0) {
              state.entities = state.entities.filter((e) => e.id !== ent.id);
              state.entities.push(...parts);
              removed.push(ent.id);
              created.push(...parts.map((p) => p.id));
            }
          }
          refreshSandboxPartModel(state);
          return { ok: true, tool: name, created, changed, removed, warnings, errors };
        }

        if (a.op === "join") {
          const joined = joinEntities(pool);
          if (joined.length > 0) {
            state.entities = [
              ...state.entities.filter((e) => !targetSet.has(e.id)),
              ...joined,
            ];
            removed.push(...targetIds);
            created.push(...joined.map((j) => j.id));
          }
          refreshSandboxPartModel(state);
          return { ok: true, tool: name, created, changed, removed, warnings, errors };
        }

        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "array": {
        const a = args as unknown as ArrayArgs;
        const targetIds = resolveTargetEntityIds(a.target, state.partModel, state.entities);
        const pool = state.entities.filter((e) => targetIds.includes(e.id));
        if (pool.length === 0) {
          errors.push("Nenhuma entidade selecionada para repetir em array.");
          return { ok: false, tool: name, created, changed, removed, warnings, errors };
        }

        if (a.mode === "polar") {
          const center: Vec2 = a.center
            ? { x: a.center[0], y: a.center[1] }
            : { x: 0, y: 0 };
          const copies = arrayCircular(
            pool,
            center,
            Math.max(2, Number(a.count ?? 4)),
            Number(a.angle_span_deg ?? 360),
          );
          state.entities.push(...copies);
          created.push(...copies.map((c) => c.id));
        } else {
          const cols = Math.max(1, Number(a.cols ?? a.count ?? 2));
          const rows = Math.max(1, Number(a.rows ?? 1));
          const copies = arrayLinear(
            pool,
            rows,
            cols,
            Number(a.dx ?? 50),
            Number(a.dy ?? 50),
          );
          state.entities.push(...copies);
          created.push(...copies.map((c) => c.id));
        }

        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "delete": {
        const a = args as unknown as DeleteArgs;
        const targetIds = resolveTargetEntityIds(a.target, state.partModel, state.entities);
        const toRemoveSet = new Set(targetIds);
        state.entities = state.entities.filter((e) => !toRemoveSet.has(e.id));
        removed.push(...targetIds);
        if (state.session.activeFeature) {
          state.session.activeFeature.holeGroups = state.session.activeFeature.holeGroups
            .map((hg) => ({
              ...hg,
              entityIds: hg.entityIds.filter((id) => !toRemoveSet.has(id)),
              count: hg.entityIds.filter((id) => !toRemoveSet.has(id)).length,
            }))
            .filter((hg) => hg.count > 0);
        }
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "set_layer": {
        const a = args as unknown as SetLayerArgs;
        const targetIds = resolveTargetEntityIds(a.target, state.partModel, state.entities);
        const targetSet = new Set(targetIds);
        state.entities = state.entities.map((e) => {
          if (targetSet.has(e.id)) {
            changed.push(e.id);
            return { ...e, layer: a.layer };
          }
          return e;
        });
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      // ----------------------------------------------------------------------
      // 6.5 COTAS E ANOTAÇÕES
      // ----------------------------------------------------------------------
      case "add_dimension": {
        const a = args as unknown as AddDimensionArgs;
        const parseRef = (ref: string | [number, number]): Dimension["refs"][number] => {
          if (Array.isArray(ref)) {
            return { kind: "point", p: { x: Number(ref[0]), y: Number(ref[1]) } };
          }
          return { kind: "entity", id: String(ref) };
        };
        const refs = a.to ? [parseRef(a.from), parseRef(a.to)] : [parseRef(a.from)];
        const dim = makeDimension(a.type, refs, Number(a.offset ?? 25), {
          prefix: a.prefix ?? "",
          suffix: a.suffix ?? " mm",
        });
        state.dimensions.push(dim);
        created.push(dim.id);
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "auto_dimension": {
        const _a = args as unknown as AutoDimensionArgs;
        const b = bbox(state.entities.filter((e) => e.layer !== "referencia"));
        if (b) {
          const dH = makeDimension(
            "horizontal",
            [
              { kind: "point", p: { x: b.minX, y: b.minY } },
              { kind: "point", p: { x: b.maxX, y: b.minY } },
            ],
            28,
            { suffix: " mm" },
          );
          const dV = makeDimension(
            "vertical",
            [
              { kind: "point", p: { x: b.minX, y: b.minY } },
              { kind: "point", p: { x: b.minX, y: b.maxY } },
            ],
            28,
            { suffix: " mm" },
          );
          state.dimensions.push(dH, dV);
          created.push(dH.id, dV.id);
        }
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      // ----------------------------------------------------------------------
      // 6.6 SELEÇÃO, VISUALIZAÇÃO E UNIDADES
      // ----------------------------------------------------------------------
      case "select": {
        const a = args as unknown as SelectArgs;
        let matchedIds: string[] = [];
        if (a.ids && a.ids.length > 0) {
          matchedIds = resolveTargetEntityIds(a.ids, state.partModel, state.entities);
        } else if (a.filter) {
          matchedIds = state.entities
            .filter((e) => {
              if (a.filter?.type && e.type !== a.filter.type) return false;
              if (a.filter?.layer && e.layer !== a.filter.layer) return false;
              if (e.type === "circle") {
                const d = e.r * 2;
                if (a.filter?.d_eq !== undefined && Math.abs(d - a.filter.d_eq) > 1e-2)
                  return false;
                if (a.filter?.d_min !== undefined && d < a.filter.d_min) return false;
                if (a.filter?.d_max !== undefined && d > a.filter.d_max) return false;
              }
              return true;
            })
            .map((e) => e.id);
        }

        const mode = a.mode ?? "replace";
        if (mode === "clear") state.selectedEntityIds = [];
        else if (mode === "add")
          state.selectedEntityIds = Array.from(new Set([...state.selectedEntityIds, ...matchedIds]));
        else if (mode === "remove")
          state.selectedEntityIds = state.selectedEntityIds.filter((id) => !matchedIds.includes(id));
        else if (mode === "invert")
          state.selectedEntityIds = state.entities
            .map((e) => e.id)
            .filter((id) => !state.selectedEntityIds.includes(id));
        else state.selectedEntityIds = matchedIds;

        refreshSandboxPartModel(state);
        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: { selectedIds: state.selectedEntityIds, count: state.selectedEntityIds.length },
        };
      }

      case "set_view": {
        const a = args as unknown as SetViewArgs;
        state.pendingViewAction = a;
        return { ok: true, tool: name, created, changed, removed, warnings, errors, data: { ...a } };
      }

      case "toggle": {
        const a = args as unknown as ToggleArgs;
        return { ok: true, tool: name, created, changed, removed, warnings, errors, data: { ...a } };
      }

      case "set_units": {
        const a = args as unknown as SetUnitsArgs;
        state.units = a.units;
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors, data: { units: a.units } };
      }

      // ----------------------------------------------------------------------
      // 6.7 MEDIÇÃO, CONSULTA, DFM E PESO
      // ----------------------------------------------------------------------
      case "measure": {
        const a = args as unknown as MeasureArgs;
        const b = bbox(state.entities.filter((e) => e.layer !== "referencia"));
        const width = b ? Number((b.maxX - b.minX).toFixed(2)) : 0;
        const height = b ? Number((b.maxY - b.minY).toFixed(2)) : 0;
        const holes = state.entities.filter(
          (e): e is Extract<Entity, { type: "circle" }> =>
            e.type === "circle" && e.layer !== "referencia",
        );

        let minClearance = Infinity;
        if (b && holes.length > 0) {
          for (const h of holes) {
            const cl = Math.min(
              h.cx - h.r - b.minX,
              b.maxX - (h.cx + h.r),
              h.cy - h.r - b.minY,
              b.maxY - (h.cy + h.r),
            );
            if (cl < minClearance) minClearance = cl;
          }
        }

        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: {
            kind: a.kind,
            width,
            height,
            holeCount: holes.length,
            minEdgeClearanceMm: Number.isFinite(minClearance) ? Number(minClearance.toFixed(2)) : null,
          },
        };
      }

      case "query_model": {
        const a = args as unknown as QueryModelArgs;
        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: {
            question: a.question,
            partModel: state.partModel,
          },
        };
      }

      case "check_manufacturing": {
        const a = args as unknown as CheckManufacturingArgs;
        const t = Number(a.thickness ?? state.thickness);
        const process = a.process ?? "laser";
        const b = bbox(state.entities.filter((e) => e.layer !== "referencia"));
        const holes = state.entities.filter(
          (e): e is Extract<Entity, { type: "circle" }> =>
            e.type === "circle" && e.layer !== "referencia" && !e.isConstruction,
        );

        const dfmWarnings: string[] = [];
        for (let i = 0; i < holes.length; i++) {
          const h = holes[i]!;
          const d = h.r * 2;
          if ((process === "laser" || process === "punch") && d < t) {
            dfmWarnings.push(
              `DFM [${process.toUpperCase()}]: Furo #${i + 1} (Ø${d} mm) é menor que a espessura da chapa (${t} mm).`,
            );
          }
          if (b) {
            const wallEdge = Math.min(
              h.cx - h.r - b.minX,
              b.maxX - (h.cx + h.r),
              h.cy - h.r - b.minY,
              b.maxY - (h.cy + h.r),
            );
            if (wallEdge < Math.max(1.5 * t, 3)) {
              dfmWarnings.push(
                `DFM: Parede residual furo-borda (${wallEdge.toFixed(1)} mm) inferior ao recomendado (${Math.max(1.5 * t, 3).toFixed(1)} mm).`,
              );
            }
          }
          for (let j = i + 1; j < holes.length; j++) {
            const h2 = holes[j]!;
            const wall = Math.hypot(h.cx - h2.cx, h.cy - h2.cy) - (h.r + h2.r);
            if (wall < Math.max(1.5 * t, 3)) {
              dfmWarnings.push(
                `DFM: Parede entre furos #${i + 1} e #${j + 1} (${wall.toFixed(1)} mm) estreita para espessura ${t} mm.`,
              );
            }
          }
        }
        warnings.push(...dfmWarnings);
        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: { process, thickness: t, dfmWarnings },
        };
      }

      case "estimate_weight": {
        const a = args as unknown as EstimateWeightArgs;
        const mat = a.material ?? state.material;
        const t = Number(a.thickness ?? state.thickness);
        const qty = Math.max(1, Number(a.quantity ?? 1));
        const density = MATERIAL_DENSITY_G_CM3[mat] ?? 7.85;

        const b = bbox(state.entities.filter((e) => e.layer !== "referencia"));
        const w = b ? b.maxX - b.minX : 0;
        const h = b ? b.maxY - b.minY : 0;
        const grossAreaMm2 = w * h;

        const holes = state.entities.filter(
          (e): e is Extract<Entity, { type: "circle" }> =>
            e.type === "circle" && e.layer !== "referencia" && !e.isConstruction,
        );
        const holesAreaMm2 = holes.reduce((acc, c) => acc + Math.PI * c.r * c.r, 0);
        const netAreaMm2 = Math.max(0, grossAreaMm2 - holesAreaMm2);

        // Massa em kg: Volume (mm³) * densidade (g/cm³) * 1e-6
        const unitWeightKg = Number(((netAreaMm2 * t * density) / 1_000_000).toFixed(3));
        const totalWeightKg = Number((unitWeightKg * qty).toFixed(3));
        const cutPerimeterMm = Number(
          (2 * (w + h) + holes.reduce((acc, c) => acc + 2 * Math.PI * c.r, 0)).toFixed(1),
        );

        return {
          ok: true,
          tool: name,
          created,
          changed,
          removed,
          warnings,
          errors,
          data: {
            material: mat,
            densityGCm3: density,
            thicknessMm: t,
            grossAreaMm2: Number(grossAreaMm2.toFixed(1)),
            netAreaMm2: Number(netAreaMm2.toFixed(1)),
            cutPerimeterMm,
            unitWeightKg,
            totalWeightKg,
            quantity: qty,
          },
        };
      }

      // ----------------------------------------------------------------------
      // 6.8 FLUXO, HISTÓRICO E CONVERSA
      // ----------------------------------------------------------------------
      case "undo": {
        state.pendingUndoSteps = Number((args as { steps?: number }).steps ?? 1);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "redo": {
        state.pendingRedoSteps = Number((args as { steps?: number }).steps ?? 1);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "export": {
        const a = args as unknown as ExportArgs;
        state.pendingExportAction = a;
        return { ok: true, tool: name, created, changed, removed, warnings, errors, data: { ...a } };
      }

      case "new_part": {
        const a = args as unknown as NewPartArgs;
        if (!a.keep_current) {
          removed.push(...state.entities.map((e) => e.id));
          state.entities = [];
          state.dimensions = [];
          state.selectedEntityIds = [];
          state.session.activeFeature = null;
        }
        refreshSandboxPartModel(state);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "declare_assumptions": {
        const a = args as unknown as DeclareAssumptionsArgs;
        if (Array.isArray(a.items)) {
          state.assumptions.push(...a.items);
        }
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "ask_clarification": {
        const a = args as unknown as AskClarificationArgs;
        state.clarification = a;
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "explain": {
        const a = args as unknown as ExplainArgs;
        state.explanations.push(a.topic);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      case "report_unsupported": {
        const a = args as unknown as ReportUnsupportedArgs;
        state.unsupportedReports.push(a);
        return { ok: true, tool: name, created, changed, removed, warnings, errors };
      }

      default:
        errors.push(`Ferramenta '${String(name)}' não registrada no catálogo do CHAMFER.`);
        return { ok: false, tool: name, created, changed, removed, warnings, errors };
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, tool: name, created, changed, removed, warnings, errors };
  }
}

/**
 * Executa um lote ordenado de chamadas de ferramentas DSL v2 em modo dry-run transacional.
 */
export function executeDslV2ToolCallsBatch(
  calls: DslV2ToolCall[],
  initialState: ExecutionSandboxState,
): BatchExecutionReport {
  const workingState = structuredClone(initialState);
  const results: ToolResult[] = [];
  const createdEntityIds: string[] = [];
  const changedEntityIds: string[] = [];
  const removedEntityIds: string[] = [];
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  for (const call of calls) {
    const res = executeSingleDslV2Tool(call, workingState);
    results.push(res);
    createdEntityIds.push(...res.created);
    changedEntityIds.push(...res.changed);
    removedEntityIds.push(...res.removed);
    allWarnings.push(...res.warnings);
    allErrors.push(...res.errors);
    if (!res.ok) {
      return {
        ok: false,
        results,
        finalState: workingState,
        createdEntityIds,
        changedEntityIds,
        removedEntityIds,
        allWarnings,
        allErrors,
      };
    }
  }

  return {
    ok: true,
    results,
    finalState: workingState,
    createdEntityIds,
    changedEntityIds,
    removedEntityIds,
    allWarnings,
    allErrors,
  };
}

// ============================================================================
// 4. REGISTRO FORMAL DE METADADOS DO CATÁLOGO DSL v2
// ============================================================================

export interface ToolRegistryV2Entry {
  name: DslV2ToolName;
  family: DslV2ToolFamily;
  description: string;
  mutatesGeometry: boolean;
}

export const CHAMFER_TOOL_REGISTRY_V2: Record<DslV2ToolName, ToolRegistryV2Entry> =
  Object.fromEntries(
    CHAMFER_DSL_V2_FUNCTION_DECLARATIONS.map((decl) => {
      const name = decl.name as DslV2ToolName;
      const nonMutating: DslV2ToolName[] = [
        "select",
        "set_view",
        "toggle",
        "set_units",
        "measure",
        "query_model",
        "check_manufacturing",
        "estimate_weight",
        "bend_allowance",
        "declare_assumptions",
        "ask_clarification",
        "explain",
        "report_unsupported",
      ];
      let family: DslV2ToolFamily = "primitives_2d";
      if (
        [
          "create_slot",
          "create_flange",
          "develop_cylinder",
          "develop_cone",
          "develop_square_to_round",
          "develop_pipe_branch",
          "develop_mitered_bend",
          "create_gusset",
          "bend_allowance",
        ].includes(name)
      ) {
        family = "composite_boilermaking";
      } else if (["add_holes", "add_cutout", "create_cutout"].includes(name)) {
        family = "holes_cutouts";
      } else if (
        ["edit_feature", "transform", "edit_geometry", "array", "delete", "set_layer"].includes(name)
      ) {
        family = "modify_transform";
      } else if (["add_dimension", "auto_dimension", "add_text"].includes(name)) {
        family = "dimensions_annotations";
      } else if (["select", "set_view", "toggle", "set_units"].includes(name)) {
        family = "selection_view_units";
      } else if (
        ["measure", "query_model", "check_manufacturing", "estimate_weight"].includes(name)
      ) {
        family = "measure_query_dfm";
      } else if (
        [
          "undo",
          "redo",
          "export",
          "new_part",
          "declare_assumptions",
          "ask_clarification",
          "explain",
          "report_unsupported",
        ].includes(name)
      ) {
        family = "flow_history_conversation";
      }

      return [
        name,
        {
          name,
          family,
          description: decl.description ?? "",
          mutatesGeometry: !nonMutating.includes(name),
        },
      ];
    }),
  ) as Record<DslV2ToolName, ToolRegistryV2Entry>;
