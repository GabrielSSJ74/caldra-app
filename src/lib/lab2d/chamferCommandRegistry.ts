/**
 * CALDRA / CHAMFER CAD — REGISTRO ÚNICO DE COMANDOS & RELATÓRIO DE COBERTURA (FASE B)
 *
 * Centraliza todos os comandos existentes nas barras laterais (ChamferCadToolbar,
 * ChamferRightSidebar), barra superior e barra de status do CHAMFER CAD.
 * Garante que:
 * - 1 comando = 1 ID canônico estável = 1 implementação = ponto de acesso rastreável
 * - 0 comandos órfãos entre o layout Clássico (Paisagem/Desktop) e o layout Compacto Vertical
 * - Distinção explícita entre "ORTO 2D" (vista ortogonal no topo) e "ORTO ⊥" (trava de eixos 0°/90° em Precisão)
 */

import type { Tool } from "@/components/lab2d/Lab2DEditor";
import type { DimKind } from "@/lib/lab2d/dimensions";

export type VerticalDockCategory =
  | "desenho"
  | "modificar"
  | "precisao"
  | "chapa_vision"
  | "inspetor";

export type ClassicCommandOrigin =
  | "topbar_left"
  | "topbar_center"
  | "topbar_right"
  | "left_toolbar_sel"
  | "left_toolbar_cri"
  | "left_toolbar_mod"
  | "left_toolbar_pre"
  | "left_toolbar_med"
  | "left_toolbar_chp"
  | "left_toolbar_est"
  | "left_toolbar_det"
  | "left_toolbar_cor"
  | "right_sidebar_propriedades"
  | "right_sidebar_camadas"
  | "right_sidebar_corte"
  | "right_sidebar_cotas"
  | "right_sidebar_eng_rev"
  | "statusbar_left"
  | "statusbar_right";

export type VerticalAccessSurface =
  | "topbar_p1"
  | "topbar_p2"
  | "topbar_p3"
  | "topbar_p4"
  | "topbar_more_menu"
  | "canvas_micropill"
  | "canvas_ruler_corner"
  | "strip_tool"
  | "strip_inline_slot_b"
  | "drawer_slot_c"
  | "keypad_slot_d";

export interface ChamferCommandDefinition {
  /** ID único estável */
  id: string;
  /** Rótulo curto em pt-BR (11–12 px na faixa) */
  label: string;
  /** Nome completo descritivo para aria-label / tooltip / menu */
  fullLabel: string;
  /** Origem no layout clássico (para auditoria 1:1 de zero órfãos) */
  classicOrigin: ClassicCommandOrigin;
  /** Categoria no Dock Vertical (ou "topbar" / "canvas" quando global) */
  verticalCategory: VerticalDockCategory | "topbar" | "canvas";
  /** Subgrupo dentro da categoria vertical (usado para colocar divisores na faixa) */
  verticalGroup: string;
  /** Superfície de acesso no layout vertical */
  verticalSurface: VerticalAccessSurface;
  /** Número máximo de toques a partir do canvas no layout vertical */
  maxTouchesFromCanvas: 1 | 2 | 3;
  /** Ferramenta de canvas associada (quando o comando seleciona um Tool) */
  toolId?: Tool;
  /** Subtipo de cota associado (quando tool === "dim") */
  dimKind?: DimKind;
  /** Modos suportados */
  modes: ("2d" | "3d" | "flanges")[];
  /** Se requer seleção ativa para habilitar */
  requiresSelection?: boolean;
  /** Mínimo de entidades selecionadas */
  minSelectionCount?: number;
  /** Se é um dos 20 comandos mais usados no fluxo diário de oficina */
  isTop20Frequent?: boolean;
}

/**
 * Lista canônica de categorias do Dock Principal (Nível 2 — Base).
 * Mantém exatamente os 5 modos e rótulos da especificação.
 */
export const VERTICAL_DOCK_CATEGORIES: readonly {
  id: VerticalDockCategory;
  label: string;
  fullLabel: string;
}[] = [
  { id: "desenho", label: "Desenho", fullLabel: "Desenho, Seleção e Detalhes Mecânicos" },
  { id: "modificar", label: "Modificar", fullLabel: "Modificar, Aparar, Offset e Padrões (Arrays)" },
  { id: "precisao", label: "Precisão", fullLabel: "Precisão, Snap, Orto, Referências e Medição" },
  { id: "chapa_vision", label: "Chapa & 1:1", fullLabel: "Chapa, Estruturas, Área de Trabalho e Engenharia Reversa 1:1" },
  { id: "inspetor", label: "Inspetor", fullLabel: "Inspetor de Propriedades, Camadas, Cotas e Visibilidade" },
] as const;

/**
 * REGISTRO ÚNICO CANÔNICO DE TODOS OS COMANDOS DO CHAMFER CAD
 */
export const CHAMFER_COMMAND_REGISTRY: readonly ChamferCommandDefinition[] = [
  /* ==========================================================================
   * 1. TOPO GLOBAL & MICRO-PÍLULA DO CANVAS
   * ========================================================================== */
  {
    id: "nav.exit",
    label: "Sair",
    fullLabel: "Sair do editor e voltar aos Projetos",
    classicOrigin: "topbar_left",
    verticalCategory: "topbar",
    verticalGroup: "nav",
    verticalSurface: "topbar_p1",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d", "flanges"],
    isTop20Frequent: true,
  },
  {
    id: "doc.project_sheet_chip",
    label: "Projeto & Chapa",
    fullLabel: "Seletor rápido de Folhas (P01, P02, +), Nome do Projeto e Espessura CHAPA",
    classicOrigin: "topbar_left",
    verticalCategory: "topbar",
    verticalGroup: "doc",
    verticalSurface: "topbar_p4",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d", "flanges"],
    isTop20Frequent: true,
  },
  {
    id: "doc.switch_plan",
    label: "Alternar Folha (P01/P02)",
    fullLabel: "Alternar entre planos de corte do projeto (P01, P02...)",
    classicOrigin: "statusbar_left",
    verticalCategory: "topbar",
    verticalGroup: "doc",
    verticalSurface: "topbar_p4",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "doc.create_plan",
    label: "+ Plano",
    fullLabel: "Criar novo plano de corte no projeto",
    classicOrigin: "statusbar_left",
    verticalCategory: "topbar",
    verticalGroup: "doc",
    verticalSurface: "topbar_p4",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "mode.2d_sketch",
    label: "2D",
    fullLabel: "Alternar para ambiente 2D Sketch",
    classicOrigin: "topbar_center",
    verticalCategory: "topbar",
    verticalGroup: "mode",
    verticalSurface: "topbar_p2",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d", "flanges"],
    isTop20Frequent: true,
  },
  {
    id: "mode.cad_3d",
    label: "3D",
    fullLabel: "Alternar para ambiente CAD 3D Sólido",
    classicOrigin: "topbar_center",
    verticalCategory: "topbar",
    verticalGroup: "mode",
    verticalSurface: "topbar_p2",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d", "flanges"],
    isTop20Frequent: true,
  },
  {
    id: "view.ortho_2d",
    label: "ORTO 2D",
    fullLabel: "Vista de Projeção Ortogonal 2D (Eixos X/Y a 0°)",
    classicOrigin: "topbar_center",
    verticalCategory: "topbar",
    verticalGroup: "view",
    verticalSurface: "topbar_p3",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d"],
  },
  {
    id: "view.iso_2d",
    label: "ISO 2D",
    fullLabel: "Vista de Projeção Isométrica 2D (30°/90°/150°)",
    classicOrigin: "topbar_center",
    verticalCategory: "topbar",
    verticalGroup: "view",
    verticalSurface: "topbar_p3",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "view.iso_plane_f5",
    label: "Plano ISO (Sup/Esq/Dir)",
    fullLabel: "Selecionar Plano Isométrico ativo (Superior, Esquerdo ou Direito — F5)",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "topbar",
    verticalGroup: "view",
    verticalSurface: "topbar_p3",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "view.orbit_3d",
    label: "ÓRBITA 3D",
    fullLabel: "Ativar Órbita 3D e Perspectivas Canônicas",
    classicOrigin: "topbar_center",
    verticalCategory: "topbar",
    verticalGroup: "view",
    verticalSurface: "topbar_p3",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d"],
  },
  {
    id: "view.style_3d",
    label: "Estilo 3D (Sólido/Somb/Arame)",
    fullLabel: "Alternar representação 3D entre Sólido com Arestas, Sombreado e Arame",
    classicOrigin: "topbar_center",
    verticalCategory: "topbar",
    verticalGroup: "view",
    verticalSurface: "topbar_p3",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d"],
  },
  {
    id: "history.undo",
    label: "Desfazer",
    fullLabel: "Desfazer última ação (Ctrl+Z)",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "history",
    verticalSurface: "topbar_p1",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d", "flanges"],
    isTop20Frequent: true,
  },
  {
    id: "history.redo",
    label: "Refazer",
    fullLabel: "Refazer ação desfeita (Ctrl+Y)",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "history",
    verticalSurface: "topbar_p1",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d", "flanges"],
    isTop20Frequent: true,
  },
  {
    id: "doc.save",
    label: "Salvar",
    fullLabel: "Salvar projeto imediatamente (Ctrl+S)",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "global.vision",
    label: "VISION (1:1)",
    fullLabel: "Abrir CHAMFER VISION — Engenharia Reversa 1:1 por Foto",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "global.intent",
    label: "INTENT (IA)",
    fullLabel: "Abrir CHAMFER INTENT — Compilador Geométrico e Busca de Comandos (Q)",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "global.workshop_bom",
    label: "CORTE/BOM",
    fullLabel: "Abrir Oficina Digital Integrada (Corte 6m, BOM e Orçamento)",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "global.export",
    label: "Exportar DXF/PDF",
    fullLabel: "Exportar desenho em DXF, SVG, PNG ou PDF",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "global.cnc_direct",
    label: "Corte CNC Direto",
    fullLabel: "Abrir exportação e plano de corte CNC direto",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "view.fit_piece",
    label: "Enquadrar Peça",
    fullLabel: "Enquadrar peça desenhada na área visível da tela",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "view.fit_workspace",
    label: "Enquadrar Área",
    fullLabel: "Enquadrar a Área de Trabalho completa na tela",
    classicOrigin: " canvas_ruler_corner" as ClassicCommandOrigin,
    verticalCategory: "canvas",
    verticalGroup: "ruler",
    verticalSurface: "canvas_ruler_corner",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "view.center_piece_in_workspace",
    label: "Centralizar na Área",
    fullLabel: "Mover e centralizar a peça dentro da Área de Trabalho",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "ui.layout_mode_toggle",
    label: "Layout (Compacta | PRUMO)",
    fullLabel: "Alternar preferência de interface entre Compacta (Padrão) e PRUMO (Espacial Zero Barras)",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "ui.theme_toggle",
    label: "Tema Claro / Escuro",
    fullLabel: "Alternar entre Tema Claro e Tema Escuro",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "ui.fullscreen_toggle",
    label: "Tela Cheia / Foco",
    fullLabel: "Alternar modo tela cheia",
    classicOrigin: "topbar_right",
    verticalCategory: "topbar",
    verticalGroup: "more",
    verticalSurface: "topbar_more_menu",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "canvas.coords_micropill",
    label: "Pílula P01 • X/Y • SNAP",
    fullLabel: "Leitura viva de coordenadas X/Y, folha ativa e botão rápido de SNAP no canvas",
    classicOrigin: "statusbar_left",
    verticalCategory: "canvas",
    verticalGroup: "hud",
    verticalSurface: "canvas_micropill",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },

  /* ==========================================================================
   * 2. CATEGORIA 1 DO DOCK: DESENHO (SEL | CRI | DET)
   * ========================================================================== */
  {
    id: "tool.select",
    label: "Ponteiro",
    fullLabel: "Ponteiro de Seleção Geral, Janela e Múltipla (V)",
    classicOrigin: "left_toolbar_sel",
    verticalCategory: "desenho",
    verticalGroup: "sel",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "select",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.node",
    label: "Nós",
    fullLabel: "Edição direta de Nós e Vértices Isolados",
    classicOrigin: "left_toolbar_sel",
    verticalCategory: "desenho",
    verticalGroup: "sel",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "node",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.pan",
    label: "Pan",
    fullLabel: "Mover prancheta com 1 dedo (Pan)",
    classicOrigin: "left_toolbar_sel",
    verticalCategory: "desenho",
    verticalGroup: "sel",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "pan",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.line",
    label: "Linha",
    fullLabel: "Criar Segmento de Linha com comprimento e ângulo (L)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "line",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.polyline",
    label: "Polilinha",
    fullLabel: "Criar Polilinha contínua alternando Linha e Arco Tangente (P)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "polyline",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.rect",
    label: "Retângulo",
    fullLabel: "Criar Retângulo por 2 cantos, centro ou 3 pontos (R)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "rect",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.rrect",
    label: "Ret. Arred.",
    fullLabel: "Criar Retângulo com Cantos Arredondados (RRect)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "rrect",
    modes: ["2d"],
  },
  {
    id: "tool.circle",
    label: "Círculo",
    fullLabel: "Criar Círculo por Centro-Raio, 2P, 3P ou TTR (C)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "circle",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.arc",
    label: "Arco 3P",
    fullLabel: "Criar Arco por 3 pontos (A)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "arc",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "tool.ellipse",
    label: "Elipse",
    fullLabel: "Criar Elipse analítica por centro e semieixos",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "ellipse",
    modes: ["2d"],
  },
  {
    id: "tool.polygon",
    label: "Polígono",
    fullLabel: "Criar Polígono / Sextavado inscrito, circunscrito ou entre faces S (mm)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "polygon",
    modes: ["2d"],
  },
  {
    id: "tool.slot",
    label: "Rasgo",
    fullLabel: "Criar Rasgo Oblongo (Slot reto ou em arco)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "slot",
    modes: ["2d"],
  },
  {
    id: "tool.construction_line",
    label: "Eixo XL",
    fullLabel: "Criar Linha de Construção / Eixo Infinito (XL)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "construction_line",
    modes: ["2d"],
  },
  {
    id: "tool.spline",
    label: "Spline",
    fullLabel: "Criar Curva Spline Suave interpolada",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "spline",
    modes: ["2d"],
  },
  {
    id: "tool.point",
    label: "Ponto",
    fullLabel: "Inserir Ponto de Apoio / Coordenada CAD",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "point",
    modes: ["2d"],
  },
  {
    id: "tool.text",
    label: "Texto",
    fullLabel: "Inserir Texto Técnico / Gravação CNC",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    toolId: "text",
    modes: ["2d"],
  },
  {
    id: "sel.all",
    label: "Sel. Tudo",
    fullLabel: "Selecionar todas as entidades visíveis (Ctrl+A)",
    classicOrigin: "left_toolbar_sel",
    verticalCategory: "desenho",
    verticalGroup: "sel",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "sel.invert",
    label: "Inv. Sel.",
    fullLabel: "Inverter seleção atual no canvas",
    classicOrigin: "left_toolbar_sel",
    verticalCategory: "desenho",
    verticalGroup: "sel",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "cri.eyelet",
    label: "Olhal",
    fullLabel: "Criar Olhal Concêntrico (Anel / Bucha com Ø Interno e Ø Externo)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "cri.ttr_bridge",
    label: "Ponte TTR",
    fullLabel: "Criar Ponte Tangente (TTR) entre 2 círculos ou arcos selecionados",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "cri",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "det.hole",
    label: "Furo Ø",
    fullLabel: "Inserir Furo Industrial Passante/Escareado com diâmetro configurável",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "det.thread",
    label: "Rosca M",
    fullLabel: "Inserir Rosca Técnica Métrica (M3 a M36 com pré-furo + anel de rosca)",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "det.teeth",
    label: "Dentes",
    fullLabel: "Gerador de Dentes / Serrilhado Técnico (Cremalheira ou Engate)",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "det.pocket",
    label: "Cavidade",
    fullLabel: "Inserir Cavidade 2D Retangular com cantos arredondados (Pocket CNC)",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "det.presets",
    label: "Presets",
    fullLabel: "Abrir Catálogo de Presets Paramétricos (Flanges, Sapatas, Tubos)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
  },
  {
    id: "det.extrude_3d",
    label: "Extrude 3D",
    fullLabel: "Gerar Sólido 3D por Extrusão do Perfil",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d"],
  },
  {
    id: "det.revolve_3d",
    label: "Revolve 3D",
    fullLabel: "Gerar Sólido 3D por Revolução em torno de Eixo",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "desenho",
    verticalGroup: "det",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d", "3d"],
  },
  {
    id: "cor.palette",
    label: "Cor / Preto",
    fullLabel: "Selecionar Cor Técnica (incluindo Preto #0F172A) e Camada Ativa ou da Seleção",
    classicOrigin: "left_toolbar_cor",
    verticalCategory: "desenho",
    verticalGroup: "cor",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
    isTop20Frequent: true,
  },

  /* ==========================================================================
   * 3. CATEGORIA 2 DO DOCK: MODIFICAR (MOD | PADRÕES | BOOLEANAS)
   * ========================================================================== */
  {
    id: "mod.trim",
    label: "Aparar",
    fullLabel: "Aparar segmento em interseção (Trim)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_cut",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    toolId: "trim",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "mod.smart_trim",
    label: "Até Encontro",
    fullLabel: "Aparar direto até a primeira interseção limite",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_cut",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    toolId: "smart_trim",
    modes: ["2d"],
  },
  {
    id: "mod.extend",
    label: "Estender",
    fullLabel: "Estender linha até o próximo limite (Extend)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_cut",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    toolId: "extend",
    modes: ["2d"],
  },
  {
    id: "mod.offset",
    label: "Offset",
    fullLabel: "Deslocamento paralelo com distância exata em mm (Offset)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_param",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    toolId: "offset",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "mod.fillet",
    label: "Filete R",
    fullLabel: "Arredondamento de quina com raio R em mm (Fillet)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_param",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    toolId: "fillet",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "mod.chamfer",
    label: "Chanfro",
    fullLabel: "Chanfro angular em quina viva",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_param",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    toolId: "chamfer",
    modes: ["2d"],
  },
  {
    id: "mod.array_polar",
    label: "Array Polar",
    fullLabel: "Padrão Circular (Array Polar — N cópias, PCD, Ângulo)",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "modificar",
    verticalGroup: "mod_array",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "mod.array_linear",
    label: "Array Linear",
    fullLabel: "Padrão Linear em grade X/Y (Linhas, Colunas, Passo)",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "modificar",
    verticalGroup: "mod_array",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "mod.move",
    label: "Mover",
    fullLabel: "Mover entidades selecionadas (M)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "mod.copy",
    label: "Copiar",
    fullLabel: "Copiar seleção para a Área de Transferência",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.clipboard",
    label: "Colar/Clip",
    fullLabel: "Abrir Área de Transferência Global e Itens Fixados",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "mod.rotate",
    label: "Girar",
    fullLabel: "Girar seleção em torno do centro geométrico",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.mirror",
    label: "Espelhar",
    fullLabel: "Espelhar seleção sobre eixo",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.scale",
    label: "Escalar",
    fullLabel: "Escalar seleção proporcionalmente",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.stretch",
    label: "Esticar",
    fullLabel: "Esticar geometria selecionada",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.center",
    label: "Centralizar",
    fullLabel: "Centralizar formas selecionadas",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_transform",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.divide",
    label: "Dividir N",
    fullLabel: "Dividir entidade em N partes iguais",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_topology",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    toolId: "divide",
    modes: ["2d"],
  },
  {
    id: "mod.join",
    label: "Unir",
    fullLabel: "Fundir segmentos contíguos em polilinha",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_topology",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.break",
    label: "Quebrar",
    fullLabel: "Quebrar entidade em um ponto",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_topology",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.explode",
    label: "Explodir",
    fullLabel: "Desmembrar polilinha ou grupo em entidades simples",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_topology",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.delete",
    label: "Apagar",
    fullLabel: "Excluir entidades selecionadas (Delete / Backspace)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_topology",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.boolean_2d",
    label: "Booleana 2D",
    fullLabel: "Operações Booleanas 2D (União, Subtração, Interseção)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_boolean",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    minSelectionCount: 2,
    modes: ["2d"],
  },
  {
    id: "mod.hatch",
    label: "Hachura",
    fullLabel: "Criar Hachura Técnica com detecção de ilhas",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_boolean",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "mod.overkill",
    label: "Overkill",
    fullLabel: "Limpar linhas duplicadas e sobreposições colineares",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_boolean",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "mod.fit_lsq",
    label: "Ajuste LSQ",
    fullLabel: "Ajustar Contorno Medido (Mínimos Quadrados LSQ / RDP)",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "modificar",
    verticalGroup: "mod_boolean",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },

  /* ==========================================================================
   * 4. CATEGORIA 3 DO DOCK: PRECISÃO (PRE | MED | GRID)
   * ========================================================================== */
  {
    id: "pre.snap_toggle",
    label: "Snap",
    fullLabel: "Ligar ou desligar Snap Geométrico Magnético",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "precisao",
    verticalGroup: "pre_snap",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 1,
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "pre.snap_division",
    label: "Div. Snap",
    fullLabel: "Divisão Virtual do Snap (OFF, 2p, 3p, 4p, 6p, 8p, 12p, 16p)",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "precisao",
    verticalGroup: "pre_snap",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.show_all_snaps",
    label: "Ver Snaps",
    fullLabel: "Mostrar simultaneamente todos os pontos de snap (interseção, centro, meio, extremidade)",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "precisao",
    verticalGroup: "pre_snap",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.ortho_lock",
    label: "ORTO ⊥",
    fullLabel: "Travar direção de desenho nos eixos ortogonais 0°/90° (distinto da vista ORTO 2D)",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "precisao",
    verticalGroup: "pre_constraints",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "pre.smart_tracking",
    label: "Tracking",
    fullLabel: "Guias angulares Smart Tracking (15°/30°/45°)",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "precisao",
    verticalGroup: "pre_constraints",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.interaction_guides",
    label: "Guias",
    fullLabel: "Alternar Guias de Interação (Linha Azul, Ponto de Encontro Roxo ou Desativadas)",
    classicOrigin: "left_toolbar_pre",
    verticalCategory: "precisao",
    verticalGroup: "pre_constraints",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.ref_origin",
    label: "REF 0,0",
    fullLabel: "Definir ou limpar Ponto de Referência Temporário REF (0,0)",
    classicOrigin: "statusbar_left",
    verticalCategory: "precisao",
    verticalGroup: "pre_ref",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.use_edge",
    label: "Usar Borda",
    fullLabel: "Selecionar borda de referência (u/v) para criar linha de marcação ou dobra paralela",
    classicOrigin: "statusbar_left",
    verticalCategory: "precisao",
    verticalGroup: "pre_ref",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "pre.nudge_dpad",
    label: "Ajuste Fino",
    fullLabel: "Ativar D-Pad de Ajuste Fino Milimétrico (Nudge)",
    classicOrigin: "statusbar_right",
    verticalCategory: "precisao",
    verticalGroup: "pre_touch",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.cursor_offset",
    label: "Mira 55px",
    fullLabel: "Alternar Mira Técnica entre Deslocada (55px acima do dedo) e Direta",
    classicOrigin: "statusbar_right",
    verticalCategory: "precisao",
    verticalGroup: "pre_touch",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "pre.loupe_hud",
    label: "Lupa HUD",
    fullLabel: "Alternar Lupa de Precisão (Flutuante, Fixa ou Desligada)",
    classicOrigin: "statusbar_right",
    verticalCategory: "precisao",
    verticalGroup: "pre_touch",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "med.measure",
    label: "Medir",
    fullLabel: "Régua de Medição Livre (distância, ΔX, ΔY e ângulo entre 2 pontos)",
    classicOrigin: "left_toolbar_med",
    verticalCategory: "precisao",
    verticalGroup: "med",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    toolId: "measure",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "med.cotar",
    label: "Cotar",
    fullLabel: "Inserir Cota Associativa (Alinhada, Horizontal, Vertical, Raio R, Diâmetro Ø, Angular °)",
    classicOrigin: "left_toolbar_med",
    verticalCategory: "precisao",
    verticalGroup: "med",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    toolId: "dim",
    modes: ["2d"],
    isTop20Frequent: true,
  },
  {
    id: "grid.settings",
    label: "Grade",
    fullLabel: "Configurar Visibilidade e Passo da Grade Espacial (1, 5, 10, 25, 50, 100 mm)",
    classicOrigin: "statusbar_right",
    verticalCategory: "precisao",
    verticalGroup: "grid",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },

  /* ==========================================================================
   * 5. CATEGORIA 4 DO DOCK: CHAPA & 1:1 (CHAPA & MESA | CHP & EST | SAÍDA & 1:1)
   * ========================================================================== */
  {
    id: "chp.thickness",
    label: "Chapa mm",
    fullLabel: "Definir Espessura da Chapa em mm (com teclado numérico próprio)",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chapa_mesa",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "chp.workspace_area",
    label: "Área Trab.",
    fullLabel: "Personalizar Área de Trabalho (1500×3000, Presets, X/Y via teclado próprio, Cadeado 🔒)",
    classicOrigin: "statusbar_right",
    verticalCategory: "chapa_vision",
    verticalGroup: "chapa_mesa",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "chp.flanges",
    label: "Flanges",
    fullLabel: "Modelar Flanges e Abas Dobradas",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chp_dobras",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "chp.convert_bend",
    label: "Linha Dobra",
    fullLabel: "Converter linha selecionada para Linha de Dobra",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chp_dobras",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    requiresSelection: true,
    modes: ["2d"],
  },
  {
    id: "chp.corner_relief",
    label: "Alívio Canto",
    fullLabel: "Aplicar Alívio de Canto para Prensagem",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chp_dobras",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "chp.flat_pattern",
    label: "Planificar",
    fullLabel: "Calcular Planificação (Flat Pattern) para Corte CNC",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chp_dobras",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "chp.unfold",
    label: "Desdobrar",
    fullLabel: "Desdobrar chapa (Unfold)",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chp_dobras",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "chp.fold",
    label: "Dobrar 3D",
    fullLabel: "Dobrar chapa em 3D (Fold)",
    classicOrigin: "left_toolbar_chp",
    verticalCategory: "chapa_vision",
    verticalGroup: "chp_dobras",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d", "flanges"],
  },
  {
    id: "est.structural_profile",
    label: "Perfil/Tubo",
    fullLabel: "Perfis Estruturais (Vigas I/U, Tubos Redondos e Metalon)",
    classicOrigin: "left_toolbar_est",
    verticalCategory: "chapa_vision",
    verticalGroup: "est",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "est.miter_cut",
    label: "Esquadria 45°",
    fullLabel: "Corte em Ângulo / Meia-Esquadria 45° para Soldagem",
    classicOrigin: "left_toolbar_est",
    verticalCategory: "chapa_vision",
    verticalGroup: "est",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "est.weld_symbol",
    label: "Solda",
    fullLabel: "Inserir Símbolo de Solda Industrial",
    classicOrigin: "left_toolbar_est",
    verticalCategory: "chapa_vision",
    verticalGroup: "est",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "est.iso_converter",
    label: "Projeção ISO",
    fullLabel: "Converter seleção para Projeção Isométrica 2D/2.5D",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "chapa_vision",
    verticalGroup: "est",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.vision_photo",
    label: "Vision 1:1",
    fullLabel: "CHAMFER VISION — Captura e Vetorização 1:1",
    classicOrigin: "topbar_right",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.caliper_notebook",
    label: "Calibração 1:1",
    fullLabel: "Caderno de Medições, Paquímetro e Calibração 1:1 Multi-Referência",
    classicOrigin: "left_toolbar_med",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.Wizard_reconstruct",
    label: "Assistente 1:1",
    fullLabel: "Reconstruir Peça Guiada (Passos A→F de Engenharia Reversa)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.holes_pcd",
    label: "Furos & PCD",
    fullLabel: "Bancada de Furos e Cadeias (Cálculo de PCD por corda e parede)",
    classicOrigin: "left_toolbar_det",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.cavities_teeth",
    label: "Cavidades",
    fullLabel: "Bancada de Cavidades, Encaixes e Dentes",
    classicOrigin: "right_sidebar_eng_rev",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.triangulator",
    label: "Triangulador",
    fullLabel: "Triangulador de Furos por distâncias A-B, B-C e A-C",
    classicOrigin: "left_toolbar_med",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.chord_sagitta",
    label: "Corda/Flecha",
    fullLabel: "Calculadora de Raio por Corda (C) e Flecha (F)",
    classicOrigin: "left_toolbar_med",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "rev.capture_contour",
    label: "Capt. Contorno",
    fullLabel: "Capturar Contorno Medido ponto a ponto",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "chapa_vision",
    verticalGroup: "rev_1to1",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "out.technical_sheet",
    label: "Prancha 2D",
    fullLabel: "Folha e Legenda Técnica (A4/A3/A2 com carimbo CALDRA)",
    classicOrigin: "left_toolbar_cri",
    verticalCategory: "chapa_vision",
    verticalGroup: "saida_cnc",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d", "3d"],
  },
  {
    id: "out.cnc_sim",
    label: "Simular CNC",
    fullLabel: "Simular Caminho de Corte CNC no Canvas",
    classicOrigin: "statusbar_right",
    verticalCategory: "chapa_vision",
    verticalGroup: "saida_cnc",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "out.cnc_arrows",
    label: "Fluxo CNC",
    fullLabel: "Mostrar/Ocultar Setas de Sentido de Corte CNC",
    classicOrigin: "statusbar_right",
    verticalCategory: "chapa_vision",
    verticalGroup: "saida_cnc",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "out.cnc_order",
    label: "Ordem CNC",
    fullLabel: "Mostrar/Ocultar Numeração da Ordem de Corte CNC",
    classicOrigin: "statusbar_right",
    verticalCategory: "chapa_vision",
    verticalGroup: "saida_cnc",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },

  /* ==========================================================================
   * 6. CATEGORIA 5 DO DOCK: INSPETOR (SELEÇÃO & CAMADAS | LISTAS | VISIBILIDADE)
   * ========================================================================== */
  {
    id: "insp.properties",
    label: "Propriedades",
    fullLabel: "Propriedades Geométricas e Físicas da Seleção (Gaveta Slot C)",
    classicOrigin: "right_sidebar_propriedades",
    verticalCategory: "inspetor",
    verticalGroup: "insp_main",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.layers_drawer",
    label: "Camadas",
    fullLabel: "Gerenciador de Camadas Semânticas (Corte, Dobra, Recorte, Marcação)",
    classicOrigin: "right_sidebar_camadas",
    verticalCategory: "inspetor",
    verticalGroup: "insp_main",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.active_layer_color",
    label: "Cor / Preto",
    fullLabel: "Alternar rapidamente a Cor Técnica (Preto #0F172A, Branco, Camadas) e Camada Ativa",
    classicOrigin: "left_toolbar_cor",
    verticalCategory: "inspetor",
    verticalGroup: "insp_main",
    verticalSurface: "strip_inline_slot_b",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.cotas_list",
    label: "Lista Cotas",
    fullLabel: "Lista de Cotas Associativas e Tolerâncias (Editar / Excluir)",
    classicOrigin: "right_sidebar_cotas",
    verticalCategory: "inspetor",
    verticalGroup: "insp_lists",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.cut_entities_list",
    label: "Entidades/CNC",
    fullLabel: "Lista de Entidades e Plano de Corte CNC",
    classicOrigin: "right_sidebar_corte",
    verticalCategory: "inspetor",
    verticalGroup: "insp_lists",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.rev_eng_drawer",
    label: "Painel 1:1",
    fullLabel: "Gaveta Completa de Engenharia Reversa 1:1",
    classicOrigin: "right_sidebar_eng_rev",
    verticalCategory: "inspetor",
    verticalGroup: "insp_lists",
    verticalSurface: "drawer_slot_c",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.topology_health",
    label: "Topologia",
    fullLabel: "Auditoria de Topologia & Auto-Heal",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "inspetor",
    verticalGroup: "insp_diag",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.variables",
    label: "Variáveis",
    fullLabel: "Tabela de Variáveis e Fórmulas Paramétricas",
    classicOrigin: "left_toolbar_mod",
    verticalCategory: "inspetor",
    verticalGroup: "insp_diag",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.verify_geometry",
    label: "Verificar",
    fullLabel: "Verificar integridade geométrica das entidades para CNC",
    classicOrigin: "topbar_right",
    verticalCategory: "inspetor",
    verticalGroup: "insp_diag",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.optimize_vectors",
    label: "Otimizar",
    fullLabel: "Otimizar vetores e remover micro-segmentos redundantes",
    classicOrigin: "topbar_right",
    verticalCategory: "inspetor",
    verticalGroup: "insp_diag",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.toggle_support_dims",
    label: "Medidas Apoio",
    fullLabel: "Mostrar ou ocultar medidas automáticas de apoio no canvas",
    classicOrigin: "topbar_right",
    verticalCategory: "inspetor",
    verticalGroup: "insp_vis",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.toggle_workspace_dims",
    label: "Cotas Área",
    fullLabel: "Mostrar ou ocultar cotas externas da Área de Trabalho (1500 × 3000 mm)",
    classicOrigin: "statusbar_right",
    verticalCategory: "inspetor",
    verticalGroup: "insp_vis",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
  {
    id: "insp.toggle_workspace_frame",
    label: "Quadro Área",
    fullLabel: "Mostrar ou ocultar moldura da Área de Trabalho",
    classicOrigin: "statusbar_right",
    verticalCategory: "inspetor",
    verticalGroup: "insp_vis",
    verticalSurface: "strip_tool",
    maxTouchesFromCanvas: 2,
    modes: ["2d"],
  },
] as const;

/* ============================================================================
 * PALETA TÉCNICA UNIFICADA DO CHAMFER CAD (INCLUINDO PRETO TÉCNICO #0F172A)
 * ============================================================================ */

export interface ChamferTechnicalColorOption {
  id: string;
  label: string;
  shortLabel: string;
  hex: string;
  layer: string;
  description: string;
}

export const CHAMFER_TECHNICAL_PALETTE: readonly ChamferTechnicalColorOption[] = [
  {
    id: "preto_tecnico",
    label: "Preto Técnico (#0F172A)",
    shortLabel: "Preto",
    hex: "#0F172A",
    layer: "corte",
    description: "Traço preto nanquim de alto contraste (Corte Principal)",
  },
  {
    id: "branco_tecnico",
    label: "Branco Técnico (#F8FAFC)",
    shortLabel: "Branco",
    hex: "#F8FAFC",
    layer: "corte",
    description: "Traço branco técnico luminoso (Corte em fundo escuro)",
  },
  {
    id: "carmim_caldra",
    label: "Carmesim CALDRA (#E11D48)",
    shortLabel: "Carmesim",
    hex: "#E11D48",
    layer: "corte",
    description: "Destaque técnico carmesim de alta visibilidade",
  },
  {
    id: "dobra_rosa",
    label: "Rosa Dobra (#EC4899)",
    shortLabel: "Dobra",
    hex: "#EC4899",
    layer: "dobra",
    description: "Camada semântica de Linha de Dobra (Prensagem)",
  },
  {
    id: "recorte_ambar",
    label: "Âmbar Recorte (#F59E0B)",
    shortLabel: "Recorte",
    hex: "#F59E0B",
    layer: "recorte",
    description: "Camada semântica de Recorte Interno / Furo",
  },
  {
    id: "marcacao_azul",
    label: "Azul Marcação (#3B82F6)",
    shortLabel: "Marcação",
    hex: "#3B82F6",
    layer: "marcacao",
    description: "Camada semântica de Gravação / Marcação CNC",
  },
  {
    id: "verde_esmeralda",
    label: "Verde Esmeralda (#10B981)",
    shortLabel: "Verde",
    hex: "#10B981",
    layer: "corte",
    description: "Traço técnico verde esmeralda",
  },
  {
    id: "roxo_referencia",
    label: "Roxo Referência (#A855F7)",
    shortLabel: "Roxo",
    hex: "#A855F7",
    layer: "marcacao",
    description: "Traço roxo para eixos e referências auxiliares",
  },
] as const;

/* ============================================================================
 * GERADORES GEOMÉTRICOS COMPARTILHADOS (1 COMANDO = 1 IMPLEMENTAÇÃO)
 * Usados identicamente pela Paisagem e pelo Retrato
 * ============================================================================ */

import type { Entity } from "./core";
import { uid } from "./core";

/**
 * Gera um Olhal Concêntrico (anel com círculo externo + furo interno concêntrico)
 */
export function createConcentricEyeletEntities(params: {
  cx: number;
  cy: number;
  innerDiameterMm: number;
  outerDiameterMm: number;
  layer?: string;
  strokeColor?: string | null;
}): Entity[] {
  const rInner = Math.max(0.5, params.innerDiameterMm / 2);
  const rOuter = Math.max(rInner + 1, params.outerDiameterMm / 2);
  const baseLayer = params.layer || "corte";
  const customParams = params.strokeColor ? { strokeColor: params.strokeColor } : undefined;
  return [
    {
      id: uid(),
      layer: baseLayer,
      type: "circle",
      cx: params.cx,
      cy: params.cy,
      r: rOuter,
      params: { ...customParams, featureKind: "eyelet_outer" },
    },
    {
      id: uid(),
      layer: "recorte",
      type: "circle",
      cx: params.cx,
      cy: params.cy,
      r: rInner,
      params: { ...customParams, featureKind: "eyelet_inner" },
    },
  ];
}

/**
 * Gera Furo Industrial com diâmetro exato em mm
 */
export function createIndustrialHoleEntity(params: {
  cx: number;
  cy: number;
  diameterMm: number;
  layer?: string;
  strokeColor?: string | null;
}): Entity {
  const r = Math.max(0.25, params.diameterMm / 2);
  return {
    id: uid(),
    layer: params.layer || "corte",
    type: "circle",
    cx: params.cx,
    cy: params.cy,
    r,
    params: {
      ...(params.strokeColor ? { strokeColor: params.strokeColor } : {}),
      featureKind: "industrial_hole",
      nominalDiameterMm: params.diameterMm,
    },
  };
}

/**
 * Gera Rosca Técnica Métrica M (furo de broca interno na camada corte + arco 270° ISO de rosca na camada marcação)
 */
export function createThreadedHoleEntities(params: {
  cx: number;
  cy: number;
  nominalM: number; // ex.: 6 para M6, 8 para M8, 10 para M10, 12 para M12
  pitchMm?: number;
  strokeColor?: string | null;
}): Entity[] {
  const nominal = Math.max(2, params.nominalM);
  const pitch =
    params.pitchMm ??
    (nominal <= 3
      ? 0.5
      : nominal <= 4
        ? 0.7
        : nominal <= 5
          ? 0.8
          : nominal <= 6
            ? 1.0
            : nominal <= 8
              ? 1.25
              : nominal <= 10
                ? 1.5
                : nominal <= 12
                  ? 1.75
                  : 2.0);
  const minorDiameter = Math.max(1.2, nominal - 1.0825 * pitch);
  const rMinor = minorDiameter / 2;
  const rMajor = nominal / 2;

  return [
    {
      id: uid(),
      layer: "corte",
      type: "circle",
      cx: params.cx,
      cy: params.cy,
      r: rMinor,
      params: {
        ...(params.strokeColor ? { strokeColor: params.strokeColor } : {}),
        featureKind: "thread_minor_drill",
        threadSpec: `M${nominal}x${pitch}`,
      },
    },
    {
      id: uid(),
      layer: "marcacao",
      type: "arc",
      cx: params.cx,
      cy: params.cy,
      r: rMajor,
      a0: 0,
      a1: (3 * Math.PI) / 2,
      params: {
        featureKind: "thread_major_iso_arc",
        threadSpec: `M${nominal}x${pitch}`,
      },
    },
  ];
}

/**
 * Gera Cremalheira / Dentes / Serrilhado Técnico (polilinha denteada parametrizada)
 */
export function createSerratedTeethEntities(params: {
  startX: number;
  startY: number;
  toothCount: number;
  pitchMm: number;
  toothHeightMm: number;
  layer?: string;
  strokeColor?: string | null;
}): Entity {
  const count = Math.max(2, Math.min(120, Math.round(params.toothCount)));
  const pitch = Math.max(1, params.pitchMm);
  const h = Math.max(0.5, params.toothHeightMm);
  const pts: { x: number; y: number }[] = [{ x: params.startX, y: params.startY }];
  for (let i = 0; i < count; i++) {
    const xBase = params.startX + i * pitch;
    pts.push({ x: xBase + pitch * 0.25, y: params.startY - h });
    pts.push({ x: xBase + pitch * 0.75, y: params.startY - h });
    pts.push({ x: xBase + pitch, y: params.startY });
  }
  return {
    id: uid(),
    layer: params.layer || "corte",
    type: "polyline",
    closed: false,
    pts,
    params: {
      ...(params.strokeColor ? { strokeColor: params.strokeColor } : {}),
      featureKind: "serrated_teeth",
      toothCount: count,
      pitchMm: pitch,
      toothHeightMm: h,
    },
  };
}

/**
 * Gera Cavidade 2D Retangular com cantos arredondados (Pocket CNC)
 */
export function createPocket2DEntity(params: {
  cx: number;
  cy: number;
  widthMm: number;
  heightMm: number;
  cornerRadiusMm?: number;
  layer?: string;
  strokeColor?: string | null;
}): Entity {
  const w = Math.max(4, params.widthMm);
  const h = Math.max(4, params.heightMm);
  const r = Math.min(Math.max(0, params.cornerRadiusMm ?? 4), Math.min(w, h) / 2 - 0.1);
  const hw = w / 2;
  const hh = h / 2;
  const pts: { x: number; y: number }[] = [];

  if (r <= 0.05) {
    pts.push(
      { x: params.cx - hw, y: params.cy - hh },
      { x: params.cx + hw, y: params.cy - hh },
      { x: params.cx + hw, y: params.cy + hh },
      { x: params.cx - hw, y: params.cy + hh },
    );
  } else {
    const corners = [
      { cx: params.cx + hw - r, cy: params.cy - hh + r, a0: -Math.PI / 2, a1: 0 },
      { cx: params.cx + hw - r, cy: params.cy + hh - r, a0: 0, a1: Math.PI / 2 },
      { cx: params.cx - hw + r, cy: params.cy + hh - r, a0: Math.PI / 2, a1: Math.PI },
      { cx: params.cx - hw + r, cy: params.cy - hh + r, a0: Math.PI, a1: (3 * Math.PI) / 2 },
    ];
    const segs = 6;
    for (const c of corners) {
      for (let i = 0; i <= segs; i++) {
        const a = c.a0 + ((c.a1 - c.a0) * i) / segs;
        pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
      }
    }
  }

  return {
    id: uid(),
    layer: params.layer || "recorte",
    type: "polyline",
    closed: true,
    pts,
    params: {
      ...(params.strokeColor ? { strokeColor: params.strokeColor } : {}),
      featureKind: "pocket_2d",
      widthMm: w,
      heightMm: h,
      cornerRadiusMm: r,
    },
  };
}

/**
 * Gera Ponte Tangente (TTR / Tangentes Externas) entre 2 círculos ou em torno do ponto atual
 */
export function createTangentBridgeEntities(params: {
  selectedEntities: Entity[];
  fallbackCx: number;
  fallbackCy: number;
  layer?: string;
  strokeColor?: string | null;
}): Entity[] {
  const circles = params.selectedEntities.filter(
    (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle",
  );
  const baseLayer = params.layer || "corte";
  const customParams = params.strokeColor ? { strokeColor: params.strokeColor } : {};

  if (circles.length >= 2) {
    const c1 = circles[0]!;
    const c2 = circles[1]!;
    const dx = c2.cx - c1.cx;
    const dy = c2.cy - c1.cy;
    const d = Math.hypot(dx, dy);
    if (d > Math.abs(c1.r - c2.r) + 1e-3) {
      const baseAngle = Math.atan2(dy, dx);
      const offsetAngle = Math.acos(Math.max(-1, Math.min(1, (c1.r - c2.r) / d)));
      const aTop = baseAngle + offsetAngle;
      const aBot = baseAngle - offsetAngle;
      return [
        {
          id: uid(),
          layer: baseLayer,
          type: "line",
          x1: c1.cx + c1.r * Math.cos(aTop),
          y1: c1.cy + c1.r * Math.sin(aTop),
          x2: c2.cx + c2.r * Math.cos(aTop),
          y2: c2.cy + c2.r * Math.sin(aTop),
          params: { ...customParams, featureKind: "tangent_bridge_top" },
        },
        {
          id: uid(),
          layer: baseLayer,
          type: "line",
          x1: c1.cx + c1.r * Math.cos(aBot),
          y1: c1.cy + c1.r * Math.sin(aBot),
          x2: c2.cx + c2.r * Math.cos(aBot),
          y2: c2.cy + c2.r * Math.sin(aBot),
          params: { ...customParams, featureKind: "tangent_bridge_bottom" },
        },
      ];
    }
  }

  // Fallback se o usuário tocar sem 2 círculos selecionados: cria par de olhais ligados por ponte tangente
  const r1 = 15;
  const r2 = 10;
  const span = 60;
  const x1 = params.fallbackCx - span / 2;
  const y1 = params.fallbackCy;
  const x2 = params.fallbackCx + span / 2;
  const y2 = params.fallbackCy;
  const offsetAngle = Math.acos((r1 - r2) / span);
  return [
    {
      id: uid(),
      layer: baseLayer,
      type: "circle",
      cx: x1,
      cy: y1,
      r: r1,
      params: { ...customParams, featureKind: "ttr_circle_1" },
    },
    {
      id: uid(),
      layer: baseLayer,
      type: "circle",
      cx: x2,
      cy: y2,
      r: r2,
      params: { ...customParams, featureKind: "ttr_circle_2" },
    },
    {
      id: uid(),
      layer: baseLayer,
      type: "line",
      x1: x1 + r1 * Math.cos(offsetAngle),
      y1: y1 + r1 * Math.sin(offsetAngle),
      x2: x2 + r2 * Math.cos(offsetAngle),
      y2: y2 + r2 * Math.sin(offsetAngle),
      params: { ...customParams, featureKind: "tangent_bridge_top" },
    },
    {
      id: uid(),
      layer: baseLayer,
      type: "line",
      x1: x1 + r1 * Math.cos(-offsetAngle),
      y1: y1 + r1 * Math.sin(-offsetAngle),
      x2: x2 + r2 * Math.cos(-offsetAngle),
      y2: y2 + r2 * Math.sin(-offsetAngle),
      params: { ...customParams, featureKind: "tangent_bridge_bottom" },
    },
  ];
}

/**
 * Aplica uma cor técnica (ex.: Preto #0F172A) e camada às entidades selecionadas
 */
export function applyColorAndLayerToEntities(
  entities: Entity[],
  selectedIds: readonly string[],
  option: { hex: string; layer?: string },
): Entity[] {
  if (!selectedIds.length) return entities;
  const selSet = new Set(selectedIds);
  return entities.map((ent) => {
    if (!selSet.has(ent.id)) return ent;
    return {
      ...ent,
      layer: option.layer ?? ent.layer,
      params: {
        ...(ent.params ?? {}),
        strokeColor: option.hex,
      },
    };
  });
}

export interface CommandCoverageReport {
  totalCommands: number;
  mappedToVerticalCount: number;
  orphanCommands: string[];
  duplicateIds: string[];
  top20FrequentCount: number;
  top20Exceeding2Touches: string[];
  anyExceeding3Touches: string[];
  byCategory: Record<VerticalDockCategory | "topbar" | "canvas", number>;
}

/**
 * Gera automaticamente o Relatório de Cobertura de Comandos (T4),
 * comprovando 0 comandos órfãos, 0 IDs duplicados, os 20 comandos mais usados
 * a <= 2 toques do canvas e todos os demais a <= 3 toques.
 */
export function generateChamferCommandCoverageReport(): CommandCoverageReport {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const orphanCommands: string[] = [];
  const top20Exceeding2Touches: string[] = [];
  const anyExceeding3Touches: string[] = [];

  const byCategory: Record<VerticalDockCategory | "topbar" | "canvas", number> = {
    topbar: 0,
    canvas: 0,
    desenho: 0,
    modificar: 0,
    precisao: 0,
    chapa_vision: 0,
    inspetor: 0,
  };

  let top20FrequentCount = 0;

  for (const cmd of CHAMFER_COMMAND_REGISTRY) {
    if (seenIds.has(cmd.id)) {
      duplicateIds.push(cmd.id);
    }
    seenIds.add(cmd.id);

    if (!cmd.verticalCategory || !cmd.verticalSurface || !cmd.verticalGroup) {
      orphanCommands.push(cmd.id);
    } else {
      byCategory[cmd.verticalCategory] = (byCategory[cmd.verticalCategory] ?? 0) + 1;
    }

    if (cmd.isTop20Frequent) {
      top20FrequentCount += 1;
      if (cmd.maxTouchesFromCanvas > 2) {
        top20Exceeding2Touches.push(cmd.id);
      }
    }

    if (cmd.maxTouchesFromCanvas > 3) {
      anyExceeding3Touches.push(cmd.id);
    }
  }

  return {
    totalCommands: CHAMFER_COMMAND_REGISTRY.length,
    mappedToVerticalCount: CHAMFER_COMMAND_REGISTRY.length - orphanCommands.length,
    orphanCommands,
    duplicateIds,
    top20FrequentCount,
    top20Exceeding2Touches,
    anyExceeding3Touches,
    byCategory,
  };
}

/**
 * Retorna a categoria do Dock à qual pertence uma ferramenta (`Tool`) ativa,
 * usado para exibir o chip compacto "Ativa: <Ferramenta> ✕" quando o usuário
 * navega para outra categoria do Dock sem cancelar a ferramenta ativa.
 */
export function getToolOwnerCategory(tool: Tool): {
  category: VerticalDockCategory;
  label: string;
} {
  const found = CHAMFER_COMMAND_REGISTRY.find((c) => c.toolId === tool);
  if (found && found.verticalCategory !== "topbar" && found.verticalCategory !== "canvas") {
    return {
      category: found.verticalCategory,
      label: found.label,
    };
  }
  return { category: "desenho", label: "Ponteiro" };
}

/* ============================================================================
 * DIAGNÓSTICO DE PARIDADE VERTICAL × PAISAGEM (MATRIZ AUTOMÁTICA)
 * ============================================================================ */

export interface ParityAuditRow {
  cmdId: string;
  label: string;
  category: string;
  surface: string;
  status: "OK" | "FALHA";
  detail: string;
}

export interface VerticalParityDiagnosticReport {
  timestampIso: string;
  viewport: { width: number; height: number };
  totalChecked: number;
  passedCount: number;
  failedCount: number;
  rows: ParityAuditRow[];
  summaryText: string;
}

export function runVerticalParityMatrixAudit(
  domRoot?: ParentNode | null,
): VerticalParityDiagnosticReport {
  const coverage = generateChamferCommandCoverageReport();
  const rows: ParityAuditRow[] = [];

  for (const cmd of CHAMFER_COMMAND_REGISTRY) {
    const hasValidMapping =
      Boolean(cmd.id) &&
      Boolean(cmd.verticalCategory) &&
      Boolean(cmd.verticalSurface) &&
      cmd.maxTouchesFromCanvas <= 3;

    let domMountedInfo = "Mapeado no barramento único";
    if (domRoot && typeof domRoot.querySelector === "function") {
      const el = domRoot.querySelector(`[data-cmd-id="${cmd.id}"]`);
      if (el) {
        domMountedInfo = "DOM ativo ([data-cmd-id] visível)";
      }
    }

    rows.push({
      cmdId: cmd.id,
      label: cmd.label,
      category: cmd.verticalCategory,
      surface: cmd.verticalSurface,
      status: hasValidMapping ? "OK" : "FALHA",
      detail: hasValidMapping ? domMountedInfo : "Comando sem superfície vertical válida",
    });
  }

  const passedCount = rows.filter((r) => r.status === "OK").length;
  const failedCount = rows.length - passedCount;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;

  const summaryText = [
    `=== CHAMFER CAD — RELATÓRIO DE PARIDADE VERTICAL × PAISAGEM ===`,
    `Data/Hora: ${new Date().toISOString()}`,
    `Viewport: ${vw}×${vh} px`,
    `Comandos Auditados: ${rows.length} | Aprovados: ${passedCount} | Falhas: ${failedCount}`,
    `Órfãos: ${coverage.orphanCommands.length} | Duplicados: ${coverage.duplicateIds.length}`,
    `Top-20 Frequentes (<= 2 toques): ${coverage.top20FrequentCount - coverage.top20Exceeding2Touches.length}/${coverage.top20FrequentCount}`,
    `Paleta COR (Preto #0F172A incluído): SIM (${CHAMFER_TECHNICAL_PALETTE.length} cores técnicas)`,
    `--------------------------------------------------------------`,
    ...rows.map(
      (r) => `[${r.status}] ${r.cmdId.padEnd(28, " ")} | ${r.category.padEnd(12, " ")} | ${r.label} (${r.detail})`,
    ),
  ].join("\n");

  return {
    timestampIso: new Date().toISOString(),
    viewport: { width: vw, height: vh },
    totalChecked: rows.length,
    passedCount,
    failedCount,
    rows,
    summaryText,
  };
}

