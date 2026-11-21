/**
 * CALDRA — CHAMFER INTENT 2.0 (FASE 1 — CLAUDE)
 * Módulo: Schemas DSL v2 e Catálogo de Declarações de Funções (§6.1 a §6.8)
 *
 * Princípio fundamental:
 *   O catálogo de ferramentas expostas à IA nasce estritamente do inventário real do CHAMFER CAD:
 *   - Primitivas 2D: core.ts (line, polyline, circle, arc, ellipse, point, hatch, path, text)
 *   - Geometria avançada: cadGeometryCore.ts (createSlotPolyline, createCenterRectangle, polygonEntity)
 *   - Modificadores: cadModifiers.ts (arrayLinear, arrayCircular, mirrorAcrossAxis, breakEntityAtPoint, joinEntities, explodeEntity)
 *   - Concordâncias: cadFilletChamfer.ts & core.ts (filletLines, chamferLines, offsetEntity, trimLine, extendLine)
 *   - Caldeiraria: squareToRound.ts, elbowSegments.ts, branch.ts, compileTruncatedCone, CAD_PRESETS_CATALOG
 *   - Cotas associativas: dimensions.ts (linear, horizontal, vertical, aligned, chain, diameter, radius, angle, arc-length, coord-x, coord-y, center-distance, center-dx, center-dy)
 *   - Camadas: DEFAULT_LAYERS (corte, dobra, referencia, cota, marcacao, recorte, construcao, anotacoes, auxiliar)
 *   - Exportação: exportService.ts (DXF), svgio.ts / tracagemSvgExport.ts (SVG), jsPDF (PDF)
 */

import { Type, type FunctionDeclaration } from "@google/genai";
import type { LayerId } from "@/lib/lab2d/core";
import type { DimKind } from "@/lib/lab2d/dimensions";
import type { LengthUnit } from "./schema";
import type { MaterialKind } from "./partModel";

export const CHAMFER_DSL_V2_VERSION = "2.0.0" as const;

export type DslV2ToolFamily =
  | "primitives_2d"
  | "composite_boilermaking"
  | "holes_cutouts"
  | "modify_transform"
  | "dimensions_annotations"
  | "selection_view_units"
  | "measure_query_dfm"
  | "flow_history_conversation";

export type DslV2ToolName =
  // 6.1 Primitivas e chapas 2D
  | "create_plate"
  | "create_rectangle"
  | "create_circle"
  | "create_line"
  | "create_polyline"
  | "create_arc"
  | "create_ellipse"
  | "create_polygon"
  | "create_text"
  | "create_centerlines"
  // 6.2 Peças compostas e caldeiraria
  | "create_slot"
  | "create_flange"
  | "develop_cylinder"
  | "develop_cone"
  | "develop_square_to_round"
  | "develop_pipe_branch"
  | "develop_mitered_bend"
  | "create_gusset"
  | "bend_allowance"
  // 6.3 Furação e recortes
  | "add_holes"
  | "add_cutout"
  // 6.4 Modificação e transformação
  | "edit_feature"
  | "transform"
  | "edit_geometry"
  | "array"
  | "delete"
  | "set_layer"
  // 6.5 Cotas e anotações
  | "add_dimension"
  | "auto_dimension"
  | "add_text"
  // 6.6 Seleção, visualização e unidades
  | "select"
  | "set_view"
  | "toggle"
  | "set_units"
  // 6.7 Medição, consulta, DFM e peso
  | "measure"
  | "query_model"
  | "check_manufacturing"
  | "estimate_weight"
  // 6.8 Fluxo, histórico e conversa
  | "undo"
  | "redo"
  | "export"
  | "new_part"
  | "declare_assumptions"
  | "ask_clarification"
  | "explain"
  | "report_unsupported";

export type DslV2HolePattern =
  | "single"
  | "points"
  | "corners"
  | "line"
  | "grid"
  | "bolt_circle"
  | "along_edge"
  | "perimeter";

export type DslV2HoleDistribution =
  | "equal_division"
  | "between_ends"
  | "fixed_pitch"
  | "equal_gap_including_edges";

export type DslV2MeasureFrom =
  | "center_to_edge"
  | "hole_edge_to_edge"
  | "center_to_center";

export type DslV2CornerSelection =
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

// ============================================================================
// INTERFACES DE ARGUMENTOS TIPADOS POR FERRAMENTA (DSL v2)
// ============================================================================

export interface CreatePlateArgs {
  id?: string;
  width: number;
  height: number;
  origin?: [number, number] | "center" | "bottom_left";
  corner_radius?: number;
  corner_chamfer?: number;
  corners?: DslV2CornerSelection | DslV2CornerSelection[];
  thickness?: number;
  material?: MaterialKind;
  layer?: LayerId;
}

export interface CreateRectangleArgs {
  id?: string;
  width: number;
  height: number;
  center?: [number, number];
  origin?: [number, number];
  corner_radius?: number;
  angle_deg?: number;
  layer?: LayerId;
}

export interface CreateCircleArgs {
  id?: string;
  center?: [number, number];
  d?: number;
  r?: number;
  role?: "cut" | "hole" | "reference";
  layer?: LayerId;
}

export interface CreateLineArgs {
  id?: string;
  from: [number, number];
  to?: [number, number];
  length?: number;
  angle_deg?: number;
  layer?: LayerId;
}

export interface CreatePolylineArgs {
  id?: string;
  points: Array<[number, number]>;
  closed?: boolean;
  layer?: LayerId;
}

export interface CreateArcArgs {
  id?: string;
  center?: [number, number];
  r?: number;
  start_deg?: number;
  end_deg?: number;
  p1?: [number, number];
  p2?: [number, number];
  p3?: [number, number];
  layer?: LayerId;
}

export interface CreateEllipseArgs {
  id?: string;
  center?: [number, number];
  rx: number;
  ry: number;
  angle_deg?: number;
  layer?: LayerId;
}

export interface CreatePolygonArgs {
  id?: string;
  center?: [number, number];
  sides: number;
  r?: number;
  across_flats?: number;
  inscribed?: boolean;
  angle_deg?: number;
  layer?: LayerId;
}

export interface CreateTextArgs {
  id?: string;
  text: string;
  at?: [number, number];
  height?: number;
  angle_deg?: number;
  layer?: LayerId;
}

export interface CreateCenterlinesArgs {
  target?: string;
  axes?: "x" | "y" | "both";
}

export interface CreateSlotArgs {
  id?: string;
  center?: [number, number];
  length: number;
  width: number;
  mode?: "total_length" | "center_to_center";
  angle_deg?: number;
  parent?: string;
  layer?: LayerId;
}

export interface CreateFlangeArgs {
  id?: string;
  outer_d: number;
  inner_d?: number;
  pcd: number;
  hole_count: number;
  hole_d: number;
  start_angle_deg?: number;
  center?: [number, number];
  layer?: LayerId;
}

export interface DevelopCylinderArgs {
  d: number;
  height: number;
  thickness?: number;
  neutral_factor?: number;
  seam_allowance?: number;
}

export interface DevelopConeArgs {
  d1: number;
  d2: number;
  height: number;
  thickness?: number;
  divisions?: number;
}

export interface DevelopSquareToRoundArgs {
  square_w: number;
  square_d?: number;
  round_d: number;
  height: number;
  thickness?: number;
}

export interface DevelopPipeBranchArgs {
  header_d: number;
  branch_d: number;
  branch_height?: number;
  angle_deg?: number;
  offset?: number;
  thickness?: number;
}

export interface DevelopMiteredBendArgs {
  d: number;
  bend_radius: number;
  angle_deg?: number;
  segments?: number;
  thickness?: number;
}

export interface CreateGussetArgs {
  leg_a: number;
  leg_b: number;
  chamfer_nose?: number;
  relief_radius?: number;
  holes?: Array<{ x: number; y: number; d: number }>;
  layer?: LayerId;
}

export interface BendAllowanceArgs {
  thickness: number;
  inside_radius: number;
  angle_deg: number;
  k_factor?: number;
}

export interface AddHolesArgs {
  id?: string;
  parent?: string;
  d: number;
  pattern: DslV2HolePattern;
  measure_from?: DslV2MeasureFrom;
  // single / points
  at?: [number, number];
  points?: Array<[number, number]>;
  // corners
  margin_x?: number;
  margin_y?: number;
  margin?: number;
  corners?: DslV2CornerSelection | DslV2CornerSelection[];
  // line
  count?: number;
  axis?: "x" | "y" | "angle";
  angle_deg?: number;
  y_offset?: number;
  x_offset?: number;
  distribution?: DslV2HoleDistribution;
  end_margin?: number;
  pitch?: number;
  span?: number;
  // grid
  cols?: number;
  rows?: number;
  pitch_x?: number;
  pitch_y?: number;
  // bolt_circle (PCD)
  pcd?: number;
  center?: [number, number];
  start_angle_deg?: number;
  // along_edge / perimeter
  edge?: "top" | "bottom" | "left" | "right";
  edge_offset?: number;
  layer?: LayerId;
}

export interface AddCutoutArgs {
  id?: string;
  parent?: string;
  shape: "rect" | "circle" | "slot" | "polygon";
  center?: [number, number];
  width?: number;
  height?: number;
  d?: number;
  corner_radius?: number;
  angle_deg?: number;
  sides?: number;
  layer?: LayerId;
}

export interface EditFeatureArgs {
  id: string;
  changes: Record<string, unknown>;
}

export interface TransformArgs {
  target?: string | string[];
  op: "move" | "rotate" | "scale" | "mirror" | "align" | "center_on_origin";
  dx?: number;
  dy?: number;
  angle_deg?: number;
  factor?: number;
  axis?: "x" | "y" | "line";
  pivot?: [number, number];
  copy?: boolean;
  align_mode?: "left" | "right" | "top" | "bottom" | "center_x" | "center_y" | "center";
}

export interface EditGeometryArgs {
  target?: string | string[];
  op: "offset" | "fillet" | "chamfer" | "trim" | "extend" | "break" | "join" | "explode";
  distance?: number;
  side?: "in" | "out";
  radius?: number;
  d1?: number;
  d2?: number;
  corners?: DslV2CornerSelection;
}

export interface ArrayArgs {
  target?: string | string[];
  mode: "linear" | "polar";
  count?: number;
  cols?: number;
  rows?: number;
  dx?: number;
  dy?: number;
  center?: [number, number];
  angle_span_deg?: number;
  radius?: number;
}

export interface DeleteArgs {
  target: string | string[];
}

export interface SetLayerArgs {
  target: string | string[];
  layer: LayerId;
}

export interface AddDimensionArgs {
  type: DimKind;
  from: string | [number, number];
  to?: string | [number, number];
  offset?: number;
  prefix?: string;
  suffix?: string;
}

export interface AutoDimensionArgs {
  target?: string;
  style?: "minimal" | "shop_floor" | "full";
}

export interface AddTextArgs {
  text: string;
  at?: [number, number];
  height?: number;
  layer?: LayerId;
}

export interface SelectArgs {
  mode?: "replace" | "add" | "remove" | "clear" | "invert";
  ids?: string[];
  filter?: {
    type?: string;
    layer?: LayerId;
    d_eq?: number;
    d_min?: number;
    d_max?: number;
  };
}

export interface SetViewArgs {
  action: "fit_all" | "fit_selection" | "zoom" | "pan" | "mode_2d" | "mode_3d" | "preset";
  preset?: "top" | "front" | "right" | "iso";
  factor?: number;
  dx?: number;
  dy?: number;
}

export interface ToggleArgs {
  target: "grid" | "axes" | "dimensions" | "snaps" | "ortho" | "construction" | "layer_visibility" | "layer_lock";
  layer?: LayerId;
  value?: boolean;
}

export interface SetUnitsArgs {
  units: LengthUnit;
}

export interface MeasureArgs {
  kind: "distance" | "center_to_center" | "edge_clearance" | "angle" | "area" | "perimeter" | "bbox";
  a?: string | [number, number];
  b?: string | [number, number];
}

export interface QueryModelArgs {
  question?: string;
  filter?: Record<string, unknown>;
}

export interface CheckManufacturingArgs {
  process?: "laser" | "plasma" | "punch" | "drill" | "waterjet";
  thickness?: number;
  material?: MaterialKind;
}

export interface EstimateWeightArgs {
  material?: MaterialKind;
  thickness?: number;
  quantity?: number;
}

export interface UndoArgs {
  steps?: number;
}

export interface RedoArgs {
  steps?: number;
}

export interface ExportArgs {
  format: "dxf" | "svg" | "pdf" | "json";
  filename?: string;
  only_selection?: boolean;
}

export interface NewPartArgs {
  keep_current?: boolean;
  name?: string;
}

export interface DeclareAssumptionsArgs {
  items: Array<{
    param: string;
    assumed: string | number;
    reason: string;
    alternatives?: Array<string | number>;
  }>;
}

export interface AskClarificationArgs {
  question: string;
  ambiguity: string;
  options: Array<{
    id: string;
    label: string;
    description: string;
    patch: Record<string, unknown>;
  }>;
  free_number_input?: {
    param: string;
    unit: string;
    min?: number;
    max?: number;
    suggested?: number[];
  };
}

export interface ExplainArgs {
  topic: string;
}

export interface ReportUnsupportedArgs {
  requested: string;
  why: string;
  closest_supported: string[];
}

export interface DslV2ToolCall<K extends DslV2ToolName = DslV2ToolName> {
  id: string;
  name: K;
  args: Record<string, unknown>;
}

// ============================================================================
// FUNCTION DECLARATIONS OFICIAIS PARA GEMINI FUNCTION CALLING (§6.1 – §6.8)
// ============================================================================

export const CHAMFER_DSL_V2_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  // 6.1 Primitivas e chapas 2D
  {
    name: "create_plate",
    description:
      "Cria uma chapa retangular paramétrica com largura, altura, raios ou chanfros de canto seletivos, espessura e material.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "ID semântico opcional (ex: plate_1)" },
        width: { type: Type.NUMBER, description: "Largura W em mm (> 0)" },
        height: { type: Type.NUMBER, description: "Altura H em mm (> 0)" },
        origin: {
          type: Type.STRING,
          description: "Posição da origem: 'bottom_left' ou 'center'",
        },
        corner_radius: { type: Type.NUMBER, description: "Raio de arredondamento dos cantos em mm" },
        corner_chamfer: { type: Type.NUMBER, description: "Medida do chanfro reto nos cantos em mm" },
        corners: {
          type: Type.STRING,
          description:
            "Seletor de cantos: all, none, left_two, right_two, top_two, bottom_two, top_left, top_right, bottom_left, bottom_right",
        },
        thickness: { type: Type.NUMBER, description: "Espessura da chapa em mm" },
        material: {
          type: Type.STRING,
          description: "Material: steel_1020, steel_a36, stainless_304, aluminum_5052, etc.",
        },
        layer: { type: Type.STRING, description: "Camada técnica (padrão: corte)" },
      },
      required: ["width", "height"],
    },
  },
  {
    name: "create_rectangle",
    description: "Cria um retângulo 2D simples ou com cantos arredondados.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        width: { type: Type.NUMBER, description: "Largura em mm" },
        height: { type: Type.NUMBER, description: "Altura em mm" },
        center: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Centro [x, y] em mm",
        },
        corner_radius: { type: Type.NUMBER, description: "Raio nos cantos em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo de rotação em graus" },
        layer: { type: Type.STRING },
      },
      required: ["width", "height"],
    },
  },
  {
    name: "create_circle",
    description: "Cria um círculo por centro e diâmetro (d) ou raio (r).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        center: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Coordenadas [cx, cy] em mm",
        },
        d: { type: Type.NUMBER, description: "Diâmetro em mm" },
        r: { type: Type.NUMBER, description: "Raio em mm" },
        role: { type: Type.STRING, description: "cut, hole ou reference" },
        layer: { type: Type.STRING },
      },
    },
  },
  {
    name: "create_line",
    description: "Cria um segmento de reta por ponto inicial e ponto final ou comprimento/ângulo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        from: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Ponto inicial [x1, y1] em mm",
        },
        to: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Ponto final [x2, y2] em mm",
        },
        length: { type: Type.NUMBER, description: "Comprimento em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo em graus" },
        layer: { type: Type.STRING },
      },
      required: ["from"],
    },
  },
  {
    name: "create_polyline",
    description: "Cria uma polilinha aberta ou fechada a partir de uma lista de pontos [x, y].",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        points: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
          },
          description: "Lista de vértices [[x, y], ...]",
        },
        closed: { type: Type.BOOLEAN, description: "Se o contorno é fechado" },
        layer: { type: Type.STRING },
      },
      required: ["points"],
    },
  },
  {
    name: "create_arc",
    description: "Cria um arco circular por centro, raio e ângulos inicial/final em graus.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        r: { type: Type.NUMBER, description: "Raio em mm" },
        start_deg: { type: Type.NUMBER, description: "Ângulo inicial em graus" },
        end_deg: { type: Type.NUMBER, description: "Ângulo final em graus" },
        layer: { type: Type.STRING },
      },
      required: ["r"],
    },
  },
  {
    name: "create_ellipse",
    description: "Cria uma elipse definida por centro, raio X (rx), raio Y (ry) e rotação.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        rx: { type: Type.NUMBER, description: "Semi-eixo horizontal em mm" },
        ry: { type: Type.NUMBER, description: "Semi-eixo vertical em mm" },
        angle_deg: { type: Type.NUMBER, description: "Rotação em graus" },
        layer: { type: Type.STRING },
      },
      required: ["rx", "ry"],
    },
  },
  {
    name: "create_polygon",
    description: "Cria um polígono regular (hexágono, octógono, triângulo, etc.) por número de lados e raio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        sides: { type: Type.INTEGER, description: "Número de lados (>= 3)" },
        r: { type: Type.NUMBER, description: "Raio de construção em mm" },
        across_flats: { type: Type.NUMBER, description: "Distância entre faces paralelas (chave) em mm" },
        inscribed: { type: Type.BOOLEAN },
        angle_deg: { type: Type.NUMBER },
        layer: { type: Type.STRING },
      },
      required: ["sides"],
    },
  },
  {
    name: "create_text",
    description: "Insere texto técnico ou marcação no desenho.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        text: { type: Type.STRING, description: "Conteúdo do texto" },
        at: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Posição [x, y] em mm" },
        height: { type: Type.NUMBER, description: "Altura da fonte em mm" },
        angle_deg: { type: Type.NUMBER },
        layer: { type: Type.STRING },
      },
      required: ["text"],
    },
  },
  {
    name: "create_centerlines",
    description: "Gera linhas de centro de simetria na camada de referência para a peça alvo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: "ID da peça alvo (ex: plate_1)" },
        axes: { type: Type.STRING, description: "x, y ou both" },
      },
    },
  },

  // 6.2 Peças compostas e caldeiraria
  {
    name: "create_slot",
    description: "Cria um rasgo oblongo (slot) com semicírculos tangentes nas extremidades.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Centro [x, y] em mm" },
        length: { type: Type.NUMBER, description: "Comprimento em mm" },
        width: { type: Type.NUMBER, description: "Largura / diâmetro do oblongo em mm" },
        mode: {
          type: Type.STRING,
          description: "total_length (ponta a ponta) ou center_to_center (entre centros dos arcos)",
        },
        angle_deg: { type: Type.NUMBER, description: "Inclinação em graus" },
        parent: { type: Type.STRING, description: "ID da peça hospedeira" },
        layer: { type: Type.STRING },
      },
      required: ["length", "width"],
    },
  },
  {
    name: "create_flange",
    description:
      "Cria um flange circular industrial com diâmetro externo, furo central interno, círculo PCD de referência e N furos polares.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        outer_d: { type: Type.NUMBER, description: "Diâmetro externo em mm" },
        inner_d: { type: Type.NUMBER, description: "Diâmetro interno (furo central) em mm" },
        pcd: { type: Type.NUMBER, description: "Diâmetro do círculo de furação PCD em mm" },
        hole_count: { type: Type.INTEGER, description: "Quantidade de furos no PCD" },
        hole_d: { type: Type.NUMBER, description: "Diâmetro dos furos de fixação em mm" },
        start_angle_deg: { type: Type.NUMBER, description: "Ângulo inicial em graus (padrão 0)" },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        layer: { type: Type.STRING },
      },
      required: ["outer_d", "pcd", "hole_count", "hole_d"],
    },
  },
  {
    name: "develop_cylinder",
    description:
      "Gera a planificação de virola cilíndrica (comprimento desenvolvido = π × diâmetro médio + sobremetal).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        d: { type: Type.NUMBER, description: "Diâmetro médio ou externo em mm" },
        height: { type: Type.NUMBER, description: "Altura da virola em mm" },
        thickness: { type: Type.NUMBER, description: "Espessura da chapa em mm" },
        neutral_factor: { type: Type.NUMBER, description: "Fator da linha neutra (padrão 0.5)" },
        seam_allowance: { type: Type.NUMBER, description: "Sobremetal de solda/emenda em mm" },
      },
      required: ["d", "height"],
    },
  },
  {
    name: "develop_cone",
    description: "Gera a planificação exata de tronco de cone / redução cônica concêntrica com geratrizes de dobra.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        d1: { type: Type.NUMBER, description: "Diâmetro maior da base em mm" },
        d2: { type: Type.NUMBER, description: "Diâmetro menor do topo em mm" },
        height: { type: Type.NUMBER, description: "Altura vertical em mm" },
        thickness: { type: Type.NUMBER, description: "Espessura da chapa em mm" },
        divisions: { type: Type.INTEGER, description: "Número de divisões/geratrizes (padrão 12)" },
      },
      required: ["d1", "d2", "height"],
    },
  },
  {
    name: "develop_square_to_round",
    description: "Gera a planificação por triangulação de transição quadrado/retângulo para redondo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        square_w: { type: Type.NUMBER, description: "Lado A da base quadrada/retangular em mm" },
        square_d: { type: Type.NUMBER, description: "Lado B da base em mm (se omitido, igual a square_w)" },
        round_d: { type: Type.NUMBER, description: "Diâmetro da boca circular em mm" },
        height: { type: Type.NUMBER, description: "Altura vertical da transição em mm" },
        thickness: { type: Type.NUMBER, description: "Espessura em mm" },
      },
      required: ["square_w", "round_d", "height"],
    },
  },
  {
    name: "develop_pipe_branch",
    description: "Gera a planificação de derivação tubo a tubo (boca de lobo / Tê).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        header_d: { type: Type.NUMBER, description: "Diâmetro do tubo coletor principal em mm" },
        branch_d: { type: Type.NUMBER, description: "Diâmetro do ramal em mm" },
        branch_height: { type: Type.NUMBER, description: "Comprimento do ramal em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo de interseção em graus (padrão 90)" },
        offset: { type: Type.NUMBER, description: "Excentricidade em mm" },
        thickness: { type: Type.NUMBER },
      },
      required: ["header_d", "branch_d"],
    },
  },
  {
    name: "develop_mitered_bend",
    description: "Gera a planificação de curva de gomos cilíndrica.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        d: { type: Type.NUMBER, description: "Diâmetro do tubo em mm" },
        bend_radius: { type: Type.NUMBER, description: "Raio médio de curvatura em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo total da curva em graus (padrão 90)" },
        segments: { type: Type.INTEGER, description: "Quantidade de gomos (padrão 4)" },
        thickness: { type: Type.NUMBER },
      },
      required: ["d", "bend_radius"],
    },
  },
  {
    name: "create_gusset",
    description: "Cria uma mão-francesa / cantoneira triangular de reforço estrutural com quebra de bico.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        leg_a: { type: Type.NUMBER, description: "Cateto horizontal A em mm" },
        leg_b: { type: Type.NUMBER, description: "Cateto vertical B em mm" },
        chamfer_nose: { type: Type.NUMBER, description: "Recorte de alívio de solda no vértice reto em mm" },
        relief_radius: { type: Type.NUMBER, description: "Raio de alívio opcional em mm" },
        layer: { type: Type.STRING },
      },
      required: ["leg_a", "leg_b"],
    },
  },
  {
    name: "bend_allowance",
    description: "Calcula o comprimento desenvolvido de dobra (Bend Allowance / Dedução de Dobra) por Fator K.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        thickness: { type: Type.NUMBER, description: "Espessura da chapa em mm" },
        inside_radius: { type: Type.NUMBER, description: "Raio interno de dobra em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo de dobra em graus" },
        k_factor: { type: Type.NUMBER, description: "Fator K da linha neutra (padrão 0.44)" },
      },
      required: ["thickness", "inside_radius", "angle_deg"],
    },
  },

  // 6.3 Furação e recortes
  {
    name: "add_holes",
    description:
      "Adiciona furação paramétrica tipada (single, points, corners, line, grid, bolt_circle, along_edge, perimeter) com cálculo determinístico de coordenadas.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "ID semântico do grupo de furos (ex: holes_1)" },
        parent: { type: Type.STRING, description: "ID da chapa/peça hospedeira (ex: plate_1)" },
        d: { type: Type.NUMBER, description: "Diâmetro dos furos em mm (> 0)" },
        pattern: {
          type: Type.STRING,
          description:
            "Padrão geométrico: single | points | corners | line | grid | bolt_circle | along_edge | perimeter",
        },
        measure_from: {
          type: Type.STRING,
          description: "center_to_edge (padrão) | hole_edge_to_edge | center_to_center",
        },
        at: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Posição [x, y] para pattern='single'",
        },
        points: {
          type: Type.ARRAY,
          items: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          description: "Lista de centros [[x, y], ...] para pattern='points'",
        },
        margin: { type: Type.NUMBER, description: "Margem simétrica às bordas em mm" },
        margin_x: { type: Type.NUMBER, description: "Margem horizontal X às bordas em mm" },
        margin_y: { type: Type.NUMBER, description: "Margem vertical Y às bordas em mm" },
        corners: {
          type: Type.STRING,
          description: "Cantos alvo para pattern='corners' (all, left_two, right_two, top_two, bottom_two)",
        },
        count: { type: Type.INTEGER, description: "Quantidade de furos N" },
        axis: { type: Type.STRING, description: "Eixo para pattern='line': x | y | angle" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo da linha de furos em graus" },
        y_offset: { type: Type.NUMBER, description: "Deslocamento vertical em relação ao centro da chapa em mm" },
        x_offset: { type: Type.NUMBER, description: "Deslocamento horizontal em relação ao centro da chapa em mm" },
        distribution: {
          type: Type.STRING,
          description:
            "Fórmula de distribuição linear: equal_division (W/(N+1)) | between_ends ((W-2*m)/(N-1)) | fixed_pitch | equal_gap_including_edges",
        },
        end_margin: { type: Type.NUMBER, description: "Margem das extremidades para distribution='between_ends'" },
        pitch: { type: Type.NUMBER, description: "Passo centro a centro em mm para distribution='fixed_pitch'" },
        cols: { type: Type.INTEGER, description: "Colunas para pattern='grid' ou 'perimeter'" },
        rows: { type: Type.INTEGER, description: "Linhas para pattern='grid' ou 'perimeter'" },
        pitch_x: { type: Type.NUMBER, description: "Passo horizontal X para pattern='grid'" },
        pitch_y: { type: Type.NUMBER, description: "Passo vertical Y para pattern='grid'" },
        pcd: { type: Type.NUMBER, description: "Diâmetro do círculo de furação PCD em mm para pattern='bolt_circle'" },
        center: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Centro [cx, cy] para pattern='bolt_circle'",
        },
        start_angle_deg: { type: Type.NUMBER, description: "Ângulo do 1º furo em graus (0° = +X)" },
        edge: { type: Type.STRING, description: "Borda alvo para pattern='along_edge': top | bottom | left | right" },
        edge_offset: { type: Type.NUMBER, description: "Distância da linha de furos até a borda em mm" },
        layer: { type: Type.STRING },
      },
      required: ["d", "pattern"],
    },
  },
  {
    name: "add_cutout",
    description: "Adiciona um recorte interno (rect, circle, slot, polygon) dentro de uma chapa existente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        parent: { type: Type.STRING, description: "ID da peça hospedeira (ex: plate_1)" },
        shape: { type: Type.STRING, description: "rect | circle | slot | polygon" },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Centro [x, y] em mm" },
        width: { type: Type.NUMBER, description: "Largura / comprimento em mm" },
        height: { type: Type.NUMBER, description: "Altura / largura do slot em mm" },
        d: { type: Type.NUMBER, description: "Diâmetro em mm (para circle ou polygon)" },
        corner_radius: { type: Type.NUMBER, description: "Raio nos cantos do recorte retangular em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo em graus" },
        sides: { type: Type.INTEGER, description: "Número de lados se shape='polygon'" },
      },
      required: ["shape"],
    },
  },

  // 6.4 Modificação e transformação
  {
    name: "edit_feature",
    description:
      "Edita parâmetros de um recurso existente no PartModel (ex: plate_1, holes_1, slot_1) recalibrando geometria dependente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: "ID do recurso no PartModel (ex: plate_1, holes_1, active_part, all_holes)",
        },
        changes: {
          type: Type.OBJECT,
          description:
            "Mapa de parâmetros a atualizar (ex: { width: 600, d: 16, count: 6, corner_radius: 25, corners: 'left_two' })",
        },
      },
      required: ["id", "changes"],
    },
  },
  {
    name: "transform",
    description: "Aplica transformações geométricas (move, rotate, scale, mirror, align, center_on_origin).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: {
          type: Type.STRING,
          description: "ID ou seletor (@id, selection, last_created, all)",
        },
        op: {
          type: Type.STRING,
          description: "move | rotate | scale | mirror | align | center_on_origin",
        },
        dx: { type: Type.NUMBER, description: "Deslocamento X em mm" },
        dy: { type: Type.NUMBER, description: "Deslocamento Y em mm" },
        angle_deg: { type: Type.NUMBER, description: "Ângulo de rotação em graus" },
        factor: { type: Type.NUMBER, description: "Fator de escala (> 0)" },
        axis: { type: Type.STRING, description: "Eixo de espelhamento: x (vertical) ou y (horizontal)" },
        pivot: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Ponto pivô [x, y] em mm" },
        copy: { type: Type.BOOLEAN, description: "Se true, mantém original e cria cópia transformada" },
      },
      required: ["op"],
    },
  },
  {
    name: "edit_geometry",
    description: "Executa operações de modificação CAD (offset, fillet, chamfer, trim, extend, break, join, explode).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: "ID da entidade ou peça alvo" },
        op: {
          type: Type.STRING,
          description: "offset | fillet | chamfer | trim | extend | break | join | explode",
        },
        distance: { type: Type.NUMBER, description: "Distância de offset em mm" },
        side: { type: Type.STRING, description: "in (interno) ou out (externo)" },
        radius: { type: Type.NUMBER, description: "Raio de filete em mm" },
        d1: { type: Type.NUMBER, description: "Distância 1 do chanfro em mm" },
        d2: { type: Type.NUMBER, description: "Distância 2 do chanfro em mm" },
        corners: { type: Type.STRING, description: "Seletor de cantos para fillet/chamfer" },
      },
      required: ["op"],
    },
  },
  {
    name: "array",
    description: "Repete entidades em padrão linear (grade X/Y) ou polar (circular).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: "ID da entidade ou seleção a repetir" },
        mode: { type: Type.STRING, description: "linear | polar" },
        count: { type: Type.INTEGER, description: "Quantidade total de cópias (modo polar ou linear 1D)" },
        cols: { type: Type.INTEGER, description: "Colunas X (modo linear)" },
        rows: { type: Type.INTEGER, description: "Linhas Y (modo linear)" },
        dx: { type: Type.NUMBER, description: "Passo X em mm" },
        dy: { type: Type.NUMBER, description: "Passo Y em mm" },
        center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Centro [cx, cy] para array polar" },
        angle_span_deg: { type: Type.NUMBER, description: "Ângulo total do array polar (padrão 360)" },
      },
      required: ["mode"],
    },
  },
  {
    name: "delete",
    description: "Remove entidades ou features do desenho com suporte a Undo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: {
          type: Type.STRING,
          description: "ID ou seletor (all_holes, selection, last_created, plate_1, etc.)",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "set_layer",
    description: "Altera a camada técnica de uma ou mais entidades.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: "ID ou seletor das entidades" },
        layer: {
          type: Type.STRING,
          description: "corte | dobra | referencia | cota | marcacao | recorte | construcao | anotacoes | auxiliar",
        },
      },
      required: ["target", "layer"],
    },
  },

  // 6.5 Cotas e anotações
  {
    name: "add_dimension",
    description: "Adiciona uma cota técnica associativa vinculada à geometria.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description:
            "linear | horizontal | vertical | aligned | diameter | radius | angle | center-distance | coord-x | coord-y",
        },
        from: { type: Type.STRING, description: "Ponto [x,y] ou ID de entidade inicial" },
        to: { type: Type.STRING, description: "Ponto [x,y] ou ID de entidade final" },
        offset: { type: Type.NUMBER, description: "Afastamento da linha de cota em mm" },
      },
      required: ["type", "from"],
    },
  },
  {
    name: "auto_dimension",
    description: "Gera cotas automáticas principais (largura, altura, furação) para a peça ativa.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, description: "ID da peça alvo" },
        style: { type: Type.STRING, description: "minimal | shop_floor | full" },
      },
    },
  },
  {
    name: "add_text",
    description: "Adiciona uma anotação textual na camada de anotações.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
        at: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        height: { type: Type.NUMBER },
        layer: { type: Type.STRING },
      },
      required: ["text"],
    },
  },

  // 6.6 Seleção, visualização e unidades
  {
    name: "select",
    description: "Seleciona entidades no canvas por IDs ou filtro semântico (tipo, camada, diâmetro).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, description: "replace | add | remove | clear | invert" },
        ids: { type: Type.ARRAY, items: { type: Type.STRING } },
        filter: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "circle | line | polyline | arc | text" },
            layer: { type: Type.STRING },
            d_eq: { type: Type.NUMBER, description: "Diâmetro exato em mm" },
            d_min: { type: Type.NUMBER },
            d_max: { type: Type.NUMBER },
          },
        },
      },
    },
  },
  {
    name: "set_view",
    description: "Controla o enquadramento, zoom ou modo 2D/3D do viewport.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "fit_all | fit_selection | zoom | pan | mode_2d | mode_3d | preset",
        },
        preset: { type: Type.STRING, description: "top | front | right | iso" },
        factor: { type: Type.NUMBER },
      },
      required: ["action"],
    },
  },
  {
    name: "toggle",
    description: "Liga ou desliga elementos visuais do editor (grid, axes, dimensions, snaps, ortho).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: {
          type: Type.STRING,
          description: "grid | axes | dimensions | snaps | ortho | construction | layer_visibility | layer_lock",
        },
        layer: { type: Type.STRING },
        value: { type: Type.BOOLEAN },
      },
      required: ["target"],
    },
  },
  {
    name: "set_units",
    description: "Define a unidade de exibição do projeto (internamente sempre mm).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        units: { type: Type.STRING, description: "mm | cm | m | in" },
      },
      required: ["units"],
    },
  },

  // 6.7 Medição, consulta, DFM e peso
  {
    name: "measure",
    description:
      "Mede distância entre centros, folga até a borda, área líquida, perímetro de corte ou bounding box.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          description: "distance | center_to_center | edge_clearance | angle | area | perimeter | bbox",
        },
        a: { type: Type.STRING, description: "Entidade A ou ponto" },
        b: { type: Type.STRING, description: "Entidade B ou ponto" },
      },
      required: ["kind"],
    },
  },
  {
    name: "query_model",
    description: "Consulta dados técnicos do PartModel atual sem alterar geometria.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING, description: "Pergunta técnica sobre a peça ativa" },
      },
    },
  },
  {
    name: "check_manufacturing",
    description:
      "Executa análise de manufaturabilidade (DFM) para corte laser, plasma, punção, furação ou jato d'água.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        process: { type: Type.STRING, description: "laser | plasma | punch | drill | waterjet" },
        thickness: { type: Type.NUMBER, description: "Espessura da chapa em mm" },
        material: { type: Type.STRING },
      },
    },
  },
  {
    name: "estimate_weight",
    description:
      "Calcula área bruta, área líquida (descontando furos/recortes), perímetro total de corte e massa estimada em kg.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        material: {
          type: Type.STRING,
          description: "steel_1020 (7.85 g/cm³), stainless_304 (7.93), aluminum_5052 (2.68), etc.",
        },
        thickness: { type: Type.NUMBER, description: "Espessura em mm" },
        quantity: { type: Type.INTEGER, description: "Quantidade de peças (padrão 1)" },
      },
    },
  },

  // 6.8 Fluxo, histórico e conversa
  {
    name: "undo",
    description: "Desfaz as últimas N alterações no histórico do CHAMFER CAD.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        steps: { type: Type.INTEGER, description: "Quantidade de passos para desfazer (padrão 1)" },
      },
    },
  },
  {
    name: "redo",
    description: "Refaz as últimas N alterações desfeitas.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        steps: { type: Type.INTEGER, description: "Quantidade de passos para refazer (padrão 1)" },
      },
    },
  },
  {
    name: "export",
    description: "Exporta o desenho técnico em formato DXF, SVG, PDF ou JSON.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: { type: Type.STRING, description: "dxf | svg | pdf | json" },
        filename: { type: Type.STRING },
        only_selection: { type: Type.BOOLEAN },
      },
      required: ["format"],
    },
  },
  {
    name: "new_part",
    description: "Inicia uma nova peça no workspace.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        keep_current: { type: Type.BOOLEAN },
        name: { type: Type.STRING },
      },
    },
  },
  {
    name: "declare_assumptions",
    description:
      "Registra premissas razoáveis assumidas pelo agente (ex: origem, distribuição de furos, margem padrão) com alternativas clicáveis de 1 clique.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              param: { type: Type.STRING },
              assumed: { type: Type.STRING },
              reason: { type: Type.STRING },
              alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["param", "assumed", "reason"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "ask_clarification",
    description:
      "Pede esclarecimento objetivo ao usuário quando falta um dado crítico impossível de inferir com segurança.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        ambiguity: { type: Type.STRING },
        options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              description: { type: Type.STRING },
              patch: { type: Type.OBJECT },
            },
            required: ["id", "label"],
          },
        },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "explain",
    description: "Explica cálculo de engenharia, fórmula geométrica, passo ou regra DFM ao usuário.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING },
      },
      required: ["topic"],
    },
  },
  {
    name: "report_unsupported",
    description:
      "Informa com transparência quando uma operação não existe no CHAMFER CAD e sugere a alternativa suportada mais próxima.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        requested: { type: Type.STRING },
        why: { type: Type.STRING },
        closest_supported: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["requested", "why", "closest_supported"],
    },
  },
];
