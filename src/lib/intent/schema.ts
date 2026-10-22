/**
 * CALDRA — CHAMFER INTENT
 * Módulo 2.2: Esquema Canônico da Representação Intermediária (CAD Intent DSL v1.0.0)
 *
 * Define o contrato formal e tipado entre o Interpretador de Intenção (NL / Gemini Structured Outputs),
 * o Compilador de Plano Paramétrico, o Motor de Validação Geométrica e o Motor de Execução CAD 2D.
 */

import type { Entity, LayerId, Vec2 } from "@/lib/lab2d/core";
import type { Dimension } from "@/lib/lab2d/dimensions";

export const CHAMFER_INTENT_SCHEMA_VERSION = "1.0.0" as const;

export type IntentCategory =
  | "create"
  | "modify"
  | "query"
  | "select"
  | "delete"
  | "undo"
  | "export";

export type ParameterProvenance =
  | "explicit"  // Informado explicitamente pelo usuário no comando
  | "inferred"  // Inferido geometricamente a partir do contexto/seleção ativa
  | "default"   // Padrão técnico explícito e seguro
  | "pending";  // Pendente de confirmação/esclarecimento do usuário

export type LengthUnit = "mm" | "cm" | "m" | "in";
export type AngleUnit = "deg" | "rad";
export type ParameterUnit = LengthUnit | AngleUnit | "count" | "none";

export type SpatialReferenceFrame =
  | "global_origin"           // Origem global (0, 0)
  | "part_origin_bottom_left" // Canto inferior esquerdo da peça ativa
  | "part_center"             // Centro geométrico (W/2, H/2) da peça ativa
  | "selected_entity"         // Entidade ou grupo atualmente selecionado
  | "edge_reference";         // Referência relativa a uma borda específica

export type DistanceMeasurementMode =
  | "center_to_edge"      // Centro do furo até a borda da chapa (padrão técnico mecânico)
  | "outer_edge_to_edge"  // Borda externa do furo até a borda da chapa (m_center = m_edge + r)
  | "center_to_center"    // Passo entre centros de furos (pitch)
  | "equal_subdivision";  // Divisão igual ao longo do comprimento total

export type CornerSelector =
  | "all"
  | "none"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | "left_two"
  | "right_two"
  | "top_two"
  | "bottom_two";

export type HoleDistributionMode =
  | "none"
  | "corner_margins"      // 4 furos nos cantos com margem X/Y
  | "linear_centerline_x" // Linha central horizontal (y = H/2)
  | "linear_centerline_y" // Linha central vertical (x = W/2)
  | "linear_custom"       // Linha customizada com eixo, início e passo
  | "circular_pcd"        // Círculo de furação (PCD - Pitch Circle Diameter)
  | "grid_4_plus_center"  // 4 nos cantos + 1 central (5 furos simétricos)
  | "single_center"       // Furo único centralizado
  | "single_offset";      // Furo único com coordenadas/margens específicas

export type LinearHoleFormulaMode =
  | "pitch_between_extremes"              // p = L / (N - 1), x_i = x_0 + i * p
  | "margin_plus_equal_pitch"             // p = (W - 2*m) / (N - 1), x_i = x_left + m + i * p
  | "equal_subdivision_including_borders";// p = W / (N + 1), x_i = x_left + (i + 1) * p

export type CadCommandType =
  // 4.1 Formas Base 2D
  | "create_line"
  | "create_polyline"
  | "create_rectangle"
  | "create_rounded_rectangle"
  | "create_regular_polygon"
  | "create_circle"
  | "create_arc"
  | "create_ring"
  | "create_oblong_slot"
  // 4.2 Operações de Modificação
  | "apply_corner_fillet"
  | "apply_corner_chamfer"
  | "apply_offset"
  | "transform_move"
  | "transform_rotate"
  | "transform_scale"
  | "transform_mirror"
  | "transform_duplicate"
  | "align_distribute"
  | "trim_extend"
  // 4.3 Recursos de Fabricação e Furação
  | "create_single_hole"
  | "create_corner_holes"
  | "create_linear_hole_pattern"
  | "create_circular_hole_pattern_pcd"
  | "create_cutout_slot"
  | "create_centerlines"
  | "create_technical_dimensions"
  // 4.4 Peças Compostas e Caldeiraria
  | "create_parametric_plate"
  | "create_circular_flange"
  | "create_slotted_bracket"
  | "create_boilermaking_square_to_round"
  | "create_boilermaking_truncated_cone"
  | "create_boilermaking_segmented_elbow"
  | "create_boilermaking_cylindrical_branch"
  // 4.5 Operações de Edição Conversacional, Consulta e Fluxo
  | "modify_active_feature"
  | "query_geometry"
  | "select_entities"
  | "delete_entities"
  | "undo_last_operation"
  | "export_drawing";

export interface TypedParameter<T = number | string | boolean> {
  key: string;
  label: string;
  value: T;
  unit: ParameterUnit;
  normalizedMm?: number;
  rawText?: string;
  provenance: ParameterProvenance;
}

export interface UnresolvedAmbiguityOption {
  id: string;
  label: string;
  description: string;
  patch: Record<string, unknown>;
}

export interface UnresolvedAmbiguity {
  id: string;
  parameter: string;
  reason: string;
  question: string;
  requiresNumericInput?: {
    paramKey: string;
    label: string;
    unit: LengthUnit | AngleUnit | "count";
    suggestedValues: number[];
    min?: number;
    max?: number;
  };
  options: UnresolvedAmbiguityOption[];
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  parameter?: string;
  affectedOperationId?: string;
  mathematicalConstraint?: string;
}

export interface ValidationReport {
  status: "valid" | "needs_clarification" | "invalid";
  issues: ValidationIssue[];
  checkedAt: number;
}

export interface IntentOperation {
  id: string;
  type: CadCommandType;
  targetRef?: string;
  params: Record<string, unknown>;
  dependsOn?: string[];
  layer?: LayerId;
  description: string;
}

export interface IntentConstraint {
  id: string;
  type:
    | "horizontal"
    | "vertical"
    | "concentric"
    | "symmetric"
    | "equal_radius"
    | "equal_spacing"
    | "edge_margin"
    | "tangent"
    | "inside_boundary";
  targetIds: string[];
  expression?: string;
}

export interface IntentDependency {
  fromOperationId: string;
  toOperationId: string;
  relation: "hosts_feature" | "modifies_contour" | "dimensions_target" | "patterns_feature";
}

export interface CompiledGeometryPayload {
  previewEntities: Entity[];
  finalEntities: Entity[];
  generatedDimensions: Dimension[];
  replacedEntityIds: string[];
  deletedEntityIds: string[];
  selectedEntityIds: string[];
  queryAnswer?: string;
  suggestedViewport?: { x: number; y: number; width: number; height: number };
  parametricFeatureSnapshot?: ParametricFeatureState;
}

/**
 * Representação Intermediária Canônica (DSL JSON Estruturada - Seção 6.2)
 */
export interface ChamferIntentPlan {
  plan_id: string;
  schema_version: typeof CHAMFER_INTENT_SCHEMA_VERSION;
  document_context: {
    units: LengthUnit;
    origin_mode: SpatialReferenceFrame;
    active_selection_ids: string[];
    existing_entities_count: number;
    active_part_id?: string;
  };
  intent: {
    summary: string;
    category: IntentCategory;
    raw_prompt: string;
    turn_index: number;
  };
  operations: IntentOperation[];
  parameters: Record<string, unknown>;
  typed_parameters: Record<string, TypedParameter>;
  parameter_provenance: Record<string, ParameterProvenance>;
  constraints: IntentConstraint[];
  dependencies: IntentDependency[];
  unresolved: UnresolvedAmbiguity[];
  warnings: string[];
  validation: ValidationReport;
  confirmation_required: boolean;
  response_summary: string;
  compiled?: CompiledGeometryPayload;
}

/**
 * Estado Paramétrico da Peça Ativa (Continuidade Multi-Turno - Seção 10)
 */
export interface ParametricCornerRadii {
  top_left: number;
  top_right: number;
  bottom_right: number;
  bottom_left: number;
}

export interface ParametricHoleGroup {
  id: string;
  distribution: HoleDistributionMode;
  linearFormula: LinearHoleFormulaMode;
  measurementMode: DistanceMeasurementMode;
  count: number;
  diameter: number;
  margin: number;
  marginY?: number;
  pitch?: number;
  spanLength?: number;
  pcd?: number;
  startAngleDeg?: number;
  entityIds: string[];
}

export interface ParametricSlotGroup {
  id: string;
  center: Vec2;
  length: number;
  width: number;
  angleDeg: number;
  entityIds: string[];
}

export interface ParametricFeatureState {
  partId: string;
  kind:
    | "plate"
    | "flange"
    | "bracket"
    | "circle"
    | "polygon"
    | "boilermaking_cone"
    | "boilermaking_square_to_round"
    | "boilermaking_elbow"
    | "boilermaking_branch";
  origin: Vec2;
  width: number;
  height: number;
  outerDiameter?: number;
  innerDiameter?: number;
  cornerRadii: ParametricCornerRadii;
  cornerChamfer?: number;
  cornerSelector: CornerSelector;
  decomposedContour?: boolean; // true se contorno foi decomposto em linhas + arcos tangentes
  contourEntityIds: string[];
  holeGroups: ParametricHoleGroup[];
  slotGroups: ParametricSlotGroup[];
  centerlineEntityIds: string[];
  dimensionIds: string[];
  allEntityIds: string[];
  layer: LayerId;
  lastUpdatedTurn: number;
}

export interface ParametricSessionContext {
  turnIndex: number;
  activeFeature: ParametricFeatureState | null;
  featureHistory: ParametricFeatureState[];
  lastPlan: ChamferIntentPlan | null;
  conversationLog: {
    turn: number;
    prompt: string;
    planId: string;
    summary: string;
    status: ValidationReport["status"];
    timestamp: number;
  }[];
}
