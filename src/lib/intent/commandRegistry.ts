/**
 * CALDRA — CHAMFER INTENT
 * Módulo 2.3: Catálogo Oficial de Comandos Paramétricos (CAD Command Registry)
 *
 * Define o escopo formal de operações suportadas pelo compilador geométrico,
 * com parâmetros obrigatórios/opcionais, unidades padrão e pré-condições.
 */

import type { CadCommandType, IntentCategory, ParameterUnit } from "./schema";

export interface CommandParameterSpec {
  key: string;
  label: string;
  unit: ParameterUnit;
  required: boolean;
  min?: number;
  max?: number;
  defaultValue?: number | string | boolean;
  description: string;
}

export interface CadCommandDescriptor {
  type: CadCommandType;
  category: IntentCategory;
  family: "base_2d" | "modifier" | "fabrication" | "composite_boilermaking" | "session_control";
  title: string;
  description: string;
  parameters: CommandParameterSpec[];
  requiresExistingSelection?: boolean;
  supportsLivePreview: boolean;
}

export const CHAMFER_COMMAND_REGISTRY: Record<CadCommandType, CadCommandDescriptor> = {
  create_line: {
    type: "create_line",
    category: "create",
    family: "base_2d",
    title: "Criar Linha Técnica",
    description: "Cria um segmento de reta por pontos absolutos (x1,y1)-(x2,y2) ou comprimento e ângulo.",
    supportsLivePreview: true,
    parameters: [
      { key: "x1", label: "Início X", unit: "mm", required: false, defaultValue: 0, description: "Coordenada X inicial" },
      { key: "y1", label: "Início Y", unit: "mm", required: false, defaultValue: 0, description: "Coordenada Y inicial" },
      { key: "length", label: "Comprimento", unit: "mm", required: true, min: 0.1, description: "Comprimento da linha em mm" },
      { key: "angle_deg", label: "Ângulo", unit: "deg", required: false, defaultValue: 0, description: "Inclinação em graus" },
    ],
  },
  create_polyline: {
    type: "create_polyline",
    category: "create",
    family: "base_2d",
    title: "Criar Polilinha",
    description: "Cria uma polilinha aberta ou fechada a partir de uma lista ordenada de vértices 2D.",
    supportsLivePreview: true,
    parameters: [
      { key: "closed", label: "Fechada", unit: "none", required: false, defaultValue: true, description: "Fecha o contorno automaticamente" },
    ],
  },
  create_rectangle: {
    type: "create_rectangle",
    category: "create",
    family: "base_2d",
    title: "Criar Retângulo / Chapa Plana",
    description: "Cria um contorno retangular exato por largura e altura.",
    supportsLivePreview: true,
    parameters: [
      { key: "width", label: "Largura (W)", unit: "mm", required: true, min: 1, description: "Largura horizontal da chapa/retângulo" },
      { key: "height", label: "Altura (H)", unit: "mm", required: true, min: 1, description: "Altura vertical da chapa/retângulo" },
      { key: "origin_x", label: "Origem X", unit: "mm", required: false, defaultValue: 0, description: "Coordenada X da origem" },
      { key: "origin_y", label: "Origem Y", unit: "mm", required: false, defaultValue: 0, description: "Coordenada Y da origem" },
    ],
  },
  create_rounded_rectangle: {
    type: "create_rounded_rectangle",
    category: "create",
    family: "base_2d",
    title: "Criar Retângulo com Cantos Arredondados",
    description: "Cria chapa retangular com concordância tangente (filete) uniforme ou seletiva nos cantos.",
    supportsLivePreview: true,
    parameters: [
      { key: "width", label: "Largura (W)", unit: "mm", required: true, min: 1, description: "Largura total da chapa" },
      { key: "height", label: "Altura (H)", unit: "mm", required: true, min: 1, description: "Altura total da chapa" },
      { key: "corner_radius", label: "Raio de Canto (R)", unit: "mm", required: true, min: 0, description: "Raio dos cantos arredondados" },
      { key: "corner_selector", label: "Cantos Alvo", unit: "none", required: false, defaultValue: "all", description: "Seleção de cantos (all, left_two, right_two, etc.)" },
    ],
  },
  create_regular_polygon: {
    type: "create_regular_polygon",
    category: "create",
    family: "base_2d",
    title: "Criar Polígono Regular",
    description: "Cria um polígono regular inscrito ou circunscrito (hexágono, octógono, triângulo, etc.).",
    supportsLivePreview: true,
    parameters: [
      { key: "sides", label: "Número de Lados", unit: "count", required: true, min: 3, max: 64, defaultValue: 6, description: "Quantidade de lados do polígono" },
      { key: "radius", label: "Raio", unit: "mm", required: true, min: 1, description: "Raio de construção do polígono" },
      { key: "cx", label: "Centro X", unit: "mm", required: false, defaultValue: 0, description: "Centro X" },
      { key: "cy", label: "Centro Y", unit: "mm", required: false, defaultValue: 0, description: "Centro Y" },
    ],
  },
  create_circle: {
    type: "create_circle",
    category: "create",
    family: "base_2d",
    title: "Criar Círculo / Disco",
    description: "Cria uma entidade circular exata por centro e diâmetro ou raio.",
    supportsLivePreview: true,
    parameters: [
      { key: "diameter", label: "Diâmetro (Ø)", unit: "mm", required: true, min: 0.2, description: "Diâmetro do círculo" },
      { key: "cx", label: "Centro X", unit: "mm", required: false, defaultValue: 0, description: "Coordenada X do centro" },
      { key: "cy", label: "Centro Y", unit: "mm", required: false, defaultValue: 0, description: "Coordenada Y do centro" },
    ],
  },
  create_arc: {
    type: "create_arc",
    category: "create",
    family: "base_2d",
    title: "Criar Arco Circular",
    description: "Cria um arco circular definido por centro, raio e ângulos inicial/final.",
    supportsLivePreview: true,
    parameters: [
      { key: "radius", label: "Raio (R)", unit: "mm", required: true, min: 0.5, description: "Raio do arco" },
      { key: "start_angle_deg", label: "Ângulo Inicial", unit: "deg", required: false, defaultValue: 0, description: "Ângulo inicial em graus" },
      { key: "end_angle_deg", label: "Ângulo Final", unit: "deg", required: false, defaultValue: 90, description: "Ângulo final em graus" },
    ],
  },
  create_ring: {
    type: "create_ring",
    category: "create",
    family: "base_2d",
    title: "Criar Anel / Coroa Circular",
    description: "Cria dois círculos concêntricos (diâmetro externo e furo central interno).",
    supportsLivePreview: true,
    parameters: [
      { key: "outer_diameter", label: "Diâmetro Externo (Øext)", unit: "mm", required: true, min: 2, description: "Diâmetro externo do anel" },
      { key: "inner_diameter", label: "Diâmetro Interno (Øint)", unit: "mm", required: true, min: 1, description: "Diâmetro interno do furo central" },
    ],
  },
  create_oblong_slot: {
    type: "create_oblong_slot",
    category: "create",
    family: "base_2d",
    title: "Criar Rasgo Oblongo (Slot)",
    description: "Cria um rasgo oblongo usinado definido por comprimento, largura (diâmetro) e inclinação.",
    supportsLivePreview: true,
    parameters: [
      { key: "slot_length", label: "Comprimento do Rasgo", unit: "mm", required: true, min: 2, description: "Comprimento entre centros ou total do oblongo" },
      { key: "slot_width", label: "Largura do Rasgo (Ø)", unit: "mm", required: true, min: 1, description: "Largura/diâmetro do rasgo oblongo" },
      { key: "angle_deg", label: "Ângulo", unit: "deg", required: false, defaultValue: 0, description: "Rotação do rasgo em graus" },
    ],
  },
  apply_corner_fillet: {
    type: "apply_corner_fillet",
    category: "modify",
    family: "modifier",
    title: "Arredondar Cantos (Fillet)",
    description: "Aplica concordância circular tangente de raio R em todos os cantos ou em cantos específicos da chapa.",
    supportsLivePreview: true,
    parameters: [
      { key: "corner_radius", label: "Raio (R)", unit: "mm", required: true, min: 0, description: "Raio do filete em mm" },
      { key: "corner_selector", label: "Cantos", unit: "none", required: false, defaultValue: "all", description: "Quais cantos arredondar" },
    ],
  },
  apply_corner_chamfer: {
    type: "apply_corner_chamfer",
    category: "modify",
    family: "modifier",
    title: "Chanfrar Cantos (Chamfer)",
    description: "Aplica chanfro reto nos cantos da peça ativa com distâncias d1 × d2.",
    supportsLivePreview: true,
    parameters: [
      { key: "chamfer_distance", label: "Medida do Chanfro", unit: "mm", required: true, min: 0.5, description: "Distância de recuo do chanfro" },
      { key: "corner_selector", label: "Cantos", unit: "none", required: false, defaultValue: "all", description: "Quais cantos chanfrar" },
    ],
  },
  apply_offset: {
    type: "apply_offset",
    category: "modify",
    family: "modifier",
    title: "Offset / Contorno Paralelo",
    description: "Gera entidade paralela interna ou externa com distância exata em mm.",
    supportsLivePreview: true,
    parameters: [
      { key: "offset_distance", label: "Distância Offset", unit: "mm", required: true, description: "Distância de afastamento (positivo = externo, negativo = interno)" },
    ],
  },
  transform_move: {
    type: "transform_move",
    category: "modify",
    family: "modifier",
    title: "Mover Geometria",
    description: "Desloca as entidades selecionadas ou a peça ativa por (dx, dy) mm.",
    supportsLivePreview: true,
    parameters: [
      { key: "dx", label: "Deslocamento X", unit: "mm", required: true, defaultValue: 0, description: "Delta X em mm" },
      { key: "dy", label: "Deslocamento Y", unit: "mm", required: true, defaultValue: 0, description: "Delta Y em mm" },
    ],
  },
  transform_rotate: {
    type: "transform_rotate",
    category: "modify",
    family: "modifier",
    title: "Rotacionar Geometria",
    description: "Rotaciona o conjunto em torno do seu centro geométrico ou da origem.",
    supportsLivePreview: true,
    parameters: [
      { key: "angle_deg", label: "Ângulo de Rotação", unit: "deg", required: true, description: "Ângulo em graus" },
    ],
  },
  transform_scale: {
    type: "transform_scale",
    category: "modify",
    family: "modifier",
    title: "Escalar Geometria",
    description: "Aplica fator de escala proporcional sobre o conjunto ativo.",
    supportsLivePreview: true,
    parameters: [
      { key: "scale_factor", label: "Fator de Escala", unit: "none", required: true, min: 0.01, description: "Multiplicador de escala" },
    ],
  },
  transform_mirror: {
    type: "transform_mirror",
    category: "modify",
    family: "modifier",
    title: "Espelhar Conjunto (Mirror)",
    description: "Espelha as entidades em relação ao eixo vertical ou horizontal.",
    supportsLivePreview: true,
    parameters: [
      { key: "mirror_axis", label: "Eixo de Espelhamento", unit: "none", required: true, defaultValue: "vertical", description: "Eixo vertical (X) ou horizontal (Y)" },
      { key: "keep_original", label: "Manter Original", unit: "none", required: false, defaultValue: false, description: "Cria cópia simétrica mantendo original" },
    ],
  },
  transform_duplicate: {
    type: "transform_duplicate",
    category: "modify",
    family: "modifier",
    title: "Duplicar / Copiar Conjunto",
    description: "Cria cópia deslocada das entidades selecionadas ou da peça ativa.",
    supportsLivePreview: true,
    parameters: [
      { key: "dx", label: "Passo X", unit: "mm", required: false, defaultValue: 50, description: "Deslocamento X da cópia" },
      { key: "dy", label: "Passo Y", unit: "mm", required: false, defaultValue: 0, description: "Deslocamento Y da cópia" },
    ],
  },
  align_distribute: {
    type: "align_distribute",
    category: "modify",
    family: "modifier",
    title: "Centralizar e Alinhar",
    description: "Alinha ou centraliza as entidades em relação à origem ou ao centro da folha.",
    supportsLivePreview: true,
    parameters: [
      { key: "align_mode", label: "Modo de Alinhamento", unit: "none", required: true, defaultValue: "center", description: "Modo de alinhamento" },
    ],
  },
  trim_extend: {
    type: "trim_extend",
    category: "modify",
    family: "modifier",
    title: "Aparar / Estender (Trim/Extend)",
    description: "Apara ou prolonga segmentos em interseções reais.",
    supportsLivePreview: true,
    parameters: [],
  },
  create_single_hole: {
    type: "create_single_hole",
    category: "create",
    family: "fabrication",
    title: "Inserir Furo Único",
    description: "Insere um furo circular em posição específica (centro da peça ou coordenadas/margens).",
    supportsLivePreview: true,
    parameters: [
      { key: "hole_diameter", label: "Diâmetro do Furo (Ø)", unit: "mm", required: true, min: 0.5, description: "Diâmetro do furo" },
      { key: "cx", label: "Posição X", unit: "mm", required: false, description: "Coordenada X do centro do furo" },
      { key: "cy", label: "Posição Y", unit: "mm", required: false, description: "Coordenada Y do centro do furo" },
    ],
  },
  create_corner_holes: {
    type: "create_corner_holes",
    category: "create",
    family: "fabrication",
    title: "Padrão de 4 Furos nos Cantos",
    description: "Insere 4 furos simétricos nos cantos da chapa respeitando a margem às bordas.",
    supportsLivePreview: true,
    parameters: [
      { key: "hole_diameter", label: "Diâmetro dos Furos (Ø)", unit: "mm", required: true, min: 0.5, description: "Diâmetro dos furos" },
      { key: "margin", label: "Margem da Borda", unit: "mm", required: true, min: 1, description: "Distância às bordas da chapa" },
    ],
  },
  create_linear_hole_pattern: {
    type: "create_linear_hole_pattern",
    category: "create",
    family: "fabrication",
    title: "Padrão Linear de Furos",
    description: "Distribui N furos colineares igualmente espaçados ao longo de um eixo ou linha de centro.",
    supportsLivePreview: true,
    parameters: [
      { key: "hole_count", label: "Quantidade de Furos (N)", unit: "count", required: true, min: 1, max: 200, description: "Número de furos" },
      { key: "hole_diameter", label: "Diâmetro dos Furos (Ø)", unit: "mm", required: true, min: 0.5, description: "Diâmetro de cada furo" },
      { key: "margin", label: "Margem Externa", unit: "mm", required: false, description: "Margem das extremidades" },
      { key: "pitch", label: "Passo entre Centros", unit: "mm", required: false, description: "Distância centro a centro" },
    ],
  },
  create_circular_hole_pattern_pcd: {
    type: "create_circular_hole_pattern_pcd",
    category: "create",
    family: "fabrication",
    title: "Padrão Circular de Furos (PCD)",
    description: "Distribui N furos equidistantes sobre um círculo de furação (Pitch Circle Diameter).",
    supportsLivePreview: true,
    parameters: [
      { key: "hole_count", label: "Quantidade de Furos (N)", unit: "count", required: true, min: 2, max: 360, description: "Número de furos no PCD" },
      { key: "hole_diameter", label: "Diâmetro dos Furos (Ø)", unit: "mm", required: true, min: 0.5, description: "Diâmetro de cada furo" },
      { key: "pcd", label: "Diâmetro PCD", unit: "mm", required: true, min: 5, description: "Diâmetro do círculo primitivo de furação" },
      { key: "start_angle_deg", label: "Ângulo Inicial", unit: "deg", required: false, defaultValue: 0, description: "Ângulo do primeiro furo" },
    ],
  },
  create_cutout_slot: {
    type: "create_cutout_slot",
    category: "create",
    family: "fabrication",
    title: "Recorte Interno / Rasgo",
    description: "Adiciona um rasgo oblongo ou recorte interno posicionado na peça ativa.",
    supportsLivePreview: true,
    parameters: [
      { key: "slot_length", label: "Comprimento", unit: "mm", required: true, min: 2, description: "Comprimento do recorte" },
      { key: "slot_width", label: "Largura", unit: "mm", required: true, min: 1, description: "Largura do recorte" },
    ],
  },
  create_centerlines: {
    type: "create_centerlines",
    category: "create",
    family: "fabrication",
    title: "Linhas de Centro e Simetria",
    description: "Gera linhas de centro ortogonais e círculos de referência na camada técnica de referência.",
    supportsLivePreview: true,
    parameters: [],
  },
  create_technical_dimensions: {
    type: "create_technical_dimensions",
    category: "create",
    family: "fabrication",
    title: "Cotas Técnicas Associativas",
    description: "Gera cotas lineares, radiais ou diametrais vinculadas à geometria.",
    supportsLivePreview: true,
    parameters: [],
  },
  create_parametric_plate: {
    type: "create_parametric_plate",
    category: "create",
    family: "composite_boilermaking",
    title: "Chapa Paramétrica Completa",
    description: "Constrói chapa retangular com raios/chanfros de canto, furação paramétrica, linhas de centro e cotas.",
    supportsLivePreview: true,
    parameters: [
      { key: "width", label: "Largura (W)", unit: "mm", required: true, min: 5, description: "Largura da chapa em mm" },
      { key: "height", label: "Altura (H)", unit: "mm", required: true, min: 5, description: "Altura da chapa em mm" },
      { key: "corner_radius", label: "Raio nos Cantos (R)", unit: "mm", required: false, defaultValue: 0, min: 0, description: "Raio de arredondamento dos cantos" },
      { key: "hole_count", label: "Quantidade de Furos", unit: "count", required: false, defaultValue: 0, min: 0, description: "Número de furos na chapa" },
      { key: "hole_diameter", label: "Diâmetro dos Furos (Ø)", unit: "mm", required: false, min: 0.5, description: "Diâmetro dos furos" },
      { key: "margin", label: "Margem da Borda", unit: "mm", required: false, min: 1, description: "Distância dos furos à borda" },
    ],
  },
  create_circular_flange: {
    type: "create_circular_flange",
    category: "create",
    family: "composite_boilermaking",
    title: "Flange Circular Industrial com PCD",
    description: "Constrói flange com diâmetro externo, furo central interno, círculo PCD de referência e N furos polares.",
    supportsLivePreview: true,
    parameters: [
      { key: "outer_diameter", label: "Diâmetro Externo (Øext)", unit: "mm", required: true, min: 10, description: "Diâmetro externo do flange" },
      { key: "inner_diameter", label: "Diâmetro Interno (Øint)", unit: "mm", required: false, defaultValue: 0, min: 0, description: "Diâmetro interno do flange" },
      { key: "pcd", label: "Diâmetro PCD", unit: "mm", required: true, min: 5, description: "Diâmetro do círculo de furação" },
      { key: "hole_count", label: "Número de Furos", unit: "count", required: true, min: 2, max: 120, description: "Quantidade de furos no PCD" },
      { key: "hole_diameter", label: "Diâmetro dos Furos (Ø)", unit: "mm", required: true, min: 1, description: "Diâmetro dos furos de fixação" },
    ],
  },
  create_slotted_bracket: {
    type: "create_slotted_bracket",
    category: "create",
    family: "composite_boilermaking",
    title: "Suporte Mecânico com Rasgo Oblongo e Furos",
    description: "Constrói chapa de suporte com cantos arredondados, rasgo oblongo central e furos laterais simétricos.",
    supportsLivePreview: true,
    parameters: [
      { key: "width", label: "Largura (W)", unit: "mm", required: true, min: 20, description: "Largura do suporte" },
      { key: "height", label: "Altura (H)", unit: "mm", required: true, min: 20, description: "Altura do suporte" },
      { key: "slot_length", label: "Comprimento do Rasgo", unit: "mm", required: true, min: 5, description: "Comprimento do oblongo" },
      { key: "slot_width", label: "Largura do Rasgo", unit: "mm", required: true, min: 2, description: "Largura do oblongo" },
      { key: "hole_diameter", label: "Diâmetro dos Furos (Ø)", unit: "mm", required: false, defaultValue: 16, description: "Diâmetro dos furos laterais" },
    ],
  },
  create_boilermaking_square_to_round: {
    type: "create_boilermaking_square_to_round",
    category: "create",
    family: "composite_boilermaking",
    title: "Planificação: Transição Quadrado para Redondo",
    description: "Gera o desenvolvimento planificado por triangulação com linhas de corte e geratrizes de dobra.",
    supportsLivePreview: true,
    parameters: [
      { key: "square_width", label: "Lado A da Base (W)", unit: "mm", required: true, min: 20, description: "Largura da base retangular/quadrada" },
      { key: "square_depth", label: "Lado B da Base (B)", unit: "mm", required: false, min: 20, description: "Profundidade da base" },
      { key: "round_diameter", label: "Diâmetro Redondo (Ø)", unit: "mm", required: true, min: 10, description: "Diâmetro da boca circular" },
      { key: "height", label: "Altura (H)", unit: "mm", required: true, min: 10, description: "Altura vertical da transição" },
    ],
  },
  create_boilermaking_truncated_cone: {
    type: "create_boilermaking_truncated_cone",
    category: "create",
    family: "composite_boilermaking",
    title: "Planificação: Tronco de Cone / Redução Cônica",
    description: "Gera a planificação exata de tronco de cone com arcos de desenvolvimento e geratrizes de calandragem.",
    supportsLivePreview: true,
    parameters: [
      { key: "base_diameter", label: "Diâmetro Maior (D)", unit: "mm", required: true, min: 20, description: "Diâmetro da base maior" },
      { key: "top_diameter", label: "Diâmetro Menor (d)", unit: "mm", required: true, min: 10, description: "Diâmetro da boca menor" },
      { key: "height", label: "Altura (H)", unit: "mm", required: true, min: 10, description: "Altura vertical do cone" },
    ],
  },
  create_boilermaking_segmented_elbow: {
    type: "create_boilermaking_segmented_elbow",
    category: "create",
    family: "composite_boilermaking",
    title: "Planificação: Curva de Gomos",
    description: "Gera a planificação dos gomos cilíndricos com perfil senoidal de corte e linhas de geratriz.",
    supportsLivePreview: true,
    parameters: [
      { key: "diameter", label: "Diâmetro do Tubo (Ø)", unit: "mm", required: true, min: 20, description: "Diâmetro do tubo" },
      { key: "bend_radius", label: "Raio de Curvatura (R)", unit: "mm", required: true, min: 20, description: "Raio médio da curva" },
      { key: "angle_deg", label: "Ângulo da Curva", unit: "deg", required: false, defaultValue: 90, description: "Ângulo total da curva" },
      { key: "segments", label: "Número de Gomos", unit: "count", required: false, defaultValue: 4, min: 2, description: "Quantidade de gomos" },
    ],
  },
  create_boilermaking_cylindrical_branch: {
    type: "create_boilermaking_cylindrical_branch",
    category: "create",
    family: "composite_boilermaking",
    title: "Planificação: Derivação Cilíndrica / Boca de Lobo",
    description: "Gera o desenvolvimento do ramal (boca de lobo) com curva de interseção cilindro-cilindro.",
    supportsLivePreview: true,
    parameters: [
      { key: "main_diameter", label: "Diâmetro do Coletor (D)", unit: "mm", required: true, min: 20, description: "Diâmetro do tubo principal" },
      { key: "branch_diameter", label: "Diâmetro do Ramal (d)", unit: "mm", required: true, min: 10, description: "Diâmetro do tubo de derivação" },
      { key: "branch_height", label: "Comprimento do Ramal (H)", unit: "mm", required: false, defaultValue: 250, description: "Altura do ramal" },
      { key: "angle_deg", label: "Ângulo de Inserção", unit: "deg", required: false, defaultValue: 90, description: "Ângulo entre os tubos" },
    ],
  },
  modify_active_feature: {
    type: "modify_active_feature",
    category: "modify",
    family: "session_control",
    title: "Editar Parâmetros da Peça Ativa",
    description: "Atualiza dimensões, furos, raios de canto ou espaçamento da peça paramétrica atual mantendo vínculos.",
    supportsLivePreview: true,
    parameters: [],
  },
  query_geometry: {
    type: "query_geometry",
    category: "query",
    family: "session_control",
    title: "Consultar Medidas e Propriedades",
    description: "Calcula e responde medidas exatas, área, perímetro, distância entre furos ou estado do desenho.",
    supportsLivePreview: false,
    parameters: [],
  },
  select_entities: {
    type: "select_entities",
    category: "select",
    family: "session_control",
    title: "Selecionar Entidades por Critério",
    description: "Seleciona furos, contornos externos, linhas de dobra ou entidades por diâmetro/camada.",
    supportsLivePreview: false,
    parameters: [],
  },
  delete_entities: {
    type: "delete_entities",
    category: "delete",
    family: "session_control",
    title: "Remover Entidades / Recursos",
    description: "Remove furos, raios ou entidades selecionadas com suporte a Undo.",
    supportsLivePreview: true,
    parameters: [],
  },
  undo_last_operation: {
    type: "undo_last_operation",
    category: "undo",
    family: "session_control",
    title: "Desfazer Última Alteração",
    description: "Reverte atomicamente a última operação aplicada no histórico do CHAMFER.",
    supportsLivePreview: false,
    parameters: [],
  },
  export_drawing: {
    type: "export_drawing",
    category: "export",
    family: "session_control",
    title: "Exportar Desenho Técnico",
    description: "Aciona o fluxo de exportação (DXF, SVG, PDF) do desenho ativo.",
    supportsLivePreview: false,
    parameters: [],
  },
};

export function getCommandDescriptor(type: CadCommandType): CadCommandDescriptor {
  return CHAMFER_COMMAND_REGISTRY[type];
}
