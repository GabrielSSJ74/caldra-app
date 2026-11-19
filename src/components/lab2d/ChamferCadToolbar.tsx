/**
 * CALDRA CHAMFER — TOOLBAR VERTICAL CAD CANÔNICA (FASE UI/UX DEFINITIVA)
 *
 * Estrutura vertical compacta organizada por função / intenção:
 * 1. SELECIONAR: Ponteiro (V), Caixa de Seleção, Nós/Vértices, Pan (Mover Tela)
 * 2. CRIAR: Linha (L), Polilinha (P), Círculo (C), Arco (A), Retângulo (R),
 *           Polígono, Elipse, Ponto, Texto, Extrude (3D), Revolve (3D)
 * 3. MODIFICAR: Mover, Copiar, Girar, Espelhar, Escalar, Offset, Aparar (Trim),
 *               Estender, Filete, Chanfro, Booleana, Esticar, Quebrar, Unir, Explodir
 * 4. PRECISÃO: Coincidente, Paralelo, Perpendicular, Tangente, Fixar, Dimensão,
 *              Snap Geométrico, Grade, Orto
 * 5. MEDIR: Régua/Distância, Cota Linear, Horizontal, Vertical, Alinhada, Angular,
 *           Raio, Diâmetro, Coordenadas
 * 6. CHAPA: Flange, Dobra, Alívio, Desdobrar, Planificação, Espessura
 * 7. ESTRUTURAS: Perfil Estrutural, Corte em Ângulo, Solda
 * 8. DETALHES: Furo, Rosca, Padrão Linear (Array), Padrão Circular (Array Polar)
 */

import React, { useState, useRef, useEffect } from "react";
import {
  MousePointer2,
  Plus,
  Scissors,
  Crosshair,
  Ruler,
  Layers,
  Boxes,
  CircleDot,
  Minus,
  PenLine,
  Circle as CircleIcon,
  Compass,
  Square,
  Hexagon,
  Egg,
  Dot,
  Type,
  Box,
  RotateCw,
  Move,
  Copy,
  ClipboardList,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  CornerDownRight,
  Maximize,
  Sparkles,
  Split,
  Combine,
  Divide,
  Grid,
  Magnet,
  Check,
  ChevronRight,
  Hammer,
  FoldHorizontal,
  ArrowRightLeft,
  X,
  Sliders,
  Disc,
  Flame,
  ShieldCheck,
  Pin,
  PinOff,
  AlignCenter,
  Search,
  FileText,
  Activity,
  Zap,
  Hand,
  Eye,
  Trash2,
} from "lucide-react";
import type { Tool } from "./Lab2DEditor";
import type { DimKind } from "@/lib/lab2d/dimensions";
import type { CursorOffsetMode, LoupeHudMode } from "@/lib/lab2d/cadInteractionHub";
import type { RevEngCategoryId, RevEngWizardStep } from "@/lib/lab2d/revEngTypes";
import type { DirectModeling3DTool } from "@/lib/lab2d/cadDirectModeling3D";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { dispatchChamferParametricPanel } from "./chamferParametricEvents";

/** Ícone vetorial minimalista de Nós / Vértices Interligados para o Micro-Dock */
function ControlNodesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 18L18 6" />
      <path d="M6 6h12" />
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
    </svg>
  );
}

export type CadCategory =
  | "none"
  | "selecionar"
  | "criar"
  | "modificar"
  | "precisao"
  | "medir"
  | "cor"
  | "chapa"
  | "estruturas"
  | "detalhes";

interface ChamferCadToolbarProps {
  tool: Tool;
  onPickTool: (tool: Tool) => void;
  activeMode: "2d" | "3d" | "flanges";
  onModeChange: (mode: "2d" | "3d" | "flanges") => void;

  // Seleção e Modificação
  hasSelection: boolean;
  selectedCount: number;
  offsetDist: number;
  setOffsetDist: (v: number) => void;
  filletR: number;
  setFilletR: (v: number) => void;

  onMoveSelection: () => void;
  onCopySelection: () => void;
  onRotateSelection: () => void;
  onMirrorSelection: () => void;
  onScaleSelection: () => void;
  onStretchSelection: () => void;
  onBreakSelection: () => void;
  onJoinSelection: () => void;
  onExplodeSelection: () => void;
  onDivideSelection?: () => void;
  onCenterSelection?: () => void;
  onDeleteSelection?: () => void;
  onArrayLinear: () => void;
  onArrayPolar: () => void;

  // Novos comandos e ferramentas profissionais
  onOpenQuickCommand?: () => void;
  onOpenTopologyHealth?: () => void;
  onOpenPresets?: () => void;
  onOpenTechnicalSheet?: () => void;
  onOpenVariables?: () => void;
  onOpenClipboard?: () => void;

  // Precisão e Modificadores Modulares (CADInteractionHub - Seção 4)
  snapOn: boolean;
  setSnapOn: (fn: (v: boolean) => boolean) => void;
  showGrid: boolean;
  setShowGrid: (fn: (v: boolean) => boolean) => void;
  grid: number;
  setGrid: (v: number) => void;
  orthoOn: boolean;
  setOrthoOn: (fn: (v: boolean) => boolean) => void;
  trackingOn: boolean;
  setTrackingOn: (fn: (v: boolean) => boolean) => void;
  cursorOffsetMode?: CursorOffsetMode;
  onToggleCursorOffsetMode?: () => void;
  loupeMode?: LoupeHudMode;
  onCycleLoupeMode?: () => void;
  nudgeHudVisible?: boolean;
  onToggleNudgeHud?: () => void;

  // Divisão do Snap, Guias de Interação Exclusivas e Visualização Global (Upgrade PRE)
  snapDivision?: number;
  onSetSnapDivision?: (n: number) => void;
  showAllSnaps?: boolean;
  onToggleShowAllSnaps?: () => void;
  interactionGuideMode?: "off" | "purple_ref" | "blue_line";
  onSetInteractionGuideMode?: (mode: "off" | "purple_ref" | "blue_line") => void;
  onStartSetReferencePoint?: () => void;
  temporaryOrigin?: { p: { x: number; y: number }; label: string } | null;
  onClearTemporaryOrigin?: () => void;

  // Medição e Cotas
  dimKind: DimKind;
  onPickDimKind: (k: DimKind) => void;

  // Chapa Metálica
  thickness: number;
  onThicknessChange: (v: number) => void;
  onConvertToBend: () => void;
  onAddHole: () => void;
  onPlanificar: () => void;
  onOpenFlanges: () => void;
  onApplyRelief: () => void;
  onUnfold: () => void;
  onFold: () => void;

  // Modo Isométrico 2D
  drawingProjection?: "orthographic" | "isometric";
  onToggleDrawingProjection?: () => void;
  isoPlane?: "top" | "left" | "right";
  onSelectIsoPlane?: (plane: "top" | "left" | "right") => void;
  onOpenPieceBuilder?: () => void;

  activeLayer?: string;
  setActiveLayer?: (l: string) => void;
  onDeactivateOrbitTool?: () => void;

  // Comandos Unificados CADCraft -> CHAMFER CAD
  onOverkillClean?: () => void;
  onBoolean2D?: (op: "union" | "subtract" | "intersect") => void;
  onCreateHatch?: () => void;
  onSetRefZero?: () => void;
  onOpenRevEngCategory?: (category: RevEngCategoryId, wizardStep?: RevEngWizardStep) => void;

  // Modelagem Direta 3D Exclusiva (Modo CAD 3D)
  activeDirect3DTool?: DirectModeling3DTool;
  selectionKind3D?: "none" | "face" | "edge" | "body";
  onSelectDirect3DTool?: (tool: DirectModeling3DTool) => void;
  onClearSelection3D?: () => void;
  onReturnToSketch2D?: () => void;

  activeStrokeColor?: string | null;
  onSelectStrokeColor?: (hex: string | null, layerId?: string) => void;
  compactMode?: boolean;
  className?: string;
  isDark?: boolean;
}

export function ChamferCadToolbar({
  tool,
  onPickTool,
  activeMode,
  onModeChange,
  hasSelection,
  selectedCount,
  offsetDist,
  setOffsetDist,
  filletR,
  setFilletR,
  onMoveSelection,
  onCopySelection,
  onRotateSelection,
  onMirrorSelection,
  onScaleSelection,
  onStretchSelection,
  onBreakSelection,
  onJoinSelection,
  onExplodeSelection,
  onDivideSelection,
  onCenterSelection,
  onDeleteSelection,
  onArrayLinear,
  onArrayPolar,
  onOpenQuickCommand,
  onOpenTopologyHealth,
  onOpenPresets,
  onOpenTechnicalSheet,
  onOpenVariables,
  onOpenClipboard,
  snapOn,
  setSnapOn,
  showGrid,
  setShowGrid,
  grid,
  setGrid,
  orthoOn,
  setOrthoOn,
  trackingOn,
  setTrackingOn,
  cursorOffsetMode = "offset",
  onToggleCursorOffsetMode,
  loupeMode = "floating",
  onCycleLoupeMode,
  nudgeHudVisible = false,
  onToggleNudgeHud,
  snapDivision = 0,
  onSetSnapDivision,
  showAllSnaps = false,
  onToggleShowAllSnaps,
  interactionGuideMode = "blue_line",
  onSetInteractionGuideMode,
  onStartSetReferencePoint,
  temporaryOrigin,
  onClearTemporaryOrigin,
  dimKind,
  onPickDimKind,
  thickness,
  onThicknessChange,
  onConvertToBend,
  onAddHole,
  onPlanificar,
  onOpenFlanges,
  onApplyRelief,
  onUnfold,
  onFold,
  activeLayer = "corte",
  setActiveLayer,
  onDeactivateOrbitTool,
  drawingProjection = "orthographic",
  onToggleDrawingProjection,
  isoPlane = "top",
  onSelectIsoPlane,
  onOpenPieceBuilder,
  onOverkillClean,
  onBoolean2D,
  onCreateHatch,
  onSetRefZero,
  onOpenRevEngCategory,
  activeDirect3DTool = "select_3d",
  selectionKind3D = "none",
  onSelectDirect3DTool,
  onClearSelection3D,
  onReturnToSketch2D,
  activeStrokeColor = null,
  onSelectStrokeColor,
  compactMode = false,
  className,
  isDark = true,
}: ChamferCadToolbarProps) {
  const [openCat, setOpenCat] = useState<CadCategory>("none");
  const [isPinned, setIsPinned] = useState(false);
  const [lastUsedTool, setLastUsedTool] = useState<Record<CadCategory, string>>({
    selecionar: "select",
    criar: "line",
    modificar: "offset",
    precisao: "snap",
    medir: "measure",
    cor: "corte",
    chapa: "flanges",
    estruturas: "profile",
    detalhes: "hole",
    none: "",
  });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Controle de Swipe Vertical para Mouse (toque utiliza touch-pan-y nativo a 120Hz)
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const isPointerDown = useRef(false);
  const isDragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Apenas captura arraste sintético se for mouse; toque móvel usa pan-y nativo
    if (e.pointerType !== "mouse") return;
    isPointerDown.current = true;
    isDragging.current = false;
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = scrollContainerRef.current?.scrollTop || 0;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current) return;
    const dy = e.clientY - dragStartY.current;
    if (Math.abs(dy) > 12) {
      isDragging.current = true;
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = dragStartScrollTop.current - dy;
    }
  };

  const handlePointerUp = () => {
    isPointerDown.current = false;
    setTimeout(() => {
      isDragging.current = false;
    }, 50);
  };

  const getFlyoutPosition = (cat: CadCategory): React.CSSProperties => {
    if (cat === "estruturas" || cat === "detalhes" || cat === "chapa" || cat === "cor") {
      return { bottom: "4px" };
    }
    if (cat === "selecionar" || cat === "criar") {
      return { top: "4px" };
    }
    return { top: "12%" };
  };

  // Fecha flyout / Micro-Dock ao tocar fora no canvas
  useEffect(() => {
    if (openCat === "none") return;
    function handlePointerOutside(e: PointerEvent | MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        if (openCat === "selecionar" || !isPinned) {
          setOpenCat("none");
        }
      }
    }
    document.addEventListener("pointerdown", handlePointerOutside, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerOutside);
  }, [isPinned, openCat]);

  const handleToggleCat = (cat: CadCategory) => {
    triggerHaptic("tap");
    onDeactivateOrbitTool?.();
    if (activeMode === "3d") {
      window.dispatchEvent(
        new CustomEvent("chamfer-3d-open-category", {
          detail: { category: cat === "precisao" ? "esboco" : cat },
        }),
      );
    }
    setOpenCat((prev) => {
      const next = prev === cat ? "none" : cat;
      AudioManager.play(next === "none" ? "ui_toggle_close" : "ui_toggle_open");
      return next;
    });
  };

  const handleSelectTool = (t: Tool, catId?: CadCategory) => {
    triggerHaptic("selection");
    onDeactivateOrbitTool?.();
    onPickTool(t);
    if (catId) {
      setLastUsedTool((prev) => ({ ...prev, [catId]: t }));
    }
    // Recolhimento automático imediato ao selecionar ferramenta em SEL, CRI ou MOD (ou quando não fixado)
    if (catId === "selecionar" || catId === "criar" || catId === "modificar" || !isPinned) {
      setOpenCat("none");
    }
  };

  // Identifica categoria da ferramenta ativa
  const isCatActive = (cat: CadCategory): boolean => {
    switch (cat) {
      case "selecionar":
        return tool === "select" || tool === "node" || tool === "pan";
      case "criar":
        return (
          tool === "line" ||
          tool === "construction_line" ||
          tool === "polyline" ||
          tool === "circle" ||
          tool === "arc" ||
          tool === "rect" ||
          tool === "rrect" ||
          tool === "polygon" ||
          tool === "ellipse" ||
          tool === "spline" ||
          tool === "freehand" ||
          tool === "slot" ||
          tool === "point" ||
          tool === "text"
        );
      case "modificar":
        return (
          tool === "offset" ||
          tool === "trim" ||
          tool === "extend" ||
          tool === "fillet" ||
          tool === "chamfer" ||
          tool === "divide"
        );
      case "precisao":
        return snapOn || orthoOn;
      case "medir":
        return tool === "measure" || tool === "dim";
      case "chapa":
        return activeMode === "flanges";
      default:
        return false;
    }
  };

  // Ícone dinâmico do botão SEL refletindo o submodo ativo (Ponteiro, Nós ou Pan)
  const selButtonIcon =
    tool === "pan" ? Hand : tool === "node" ? ControlNodesIcon : MousePointer2;

  // 8 Categorias Canônicas
  const categories = [
    {
      id: "selecionar" as const,
      label: "Selecionar",
      short: "SEL",
      icon: selButtonIcon,
      desc: "Ponteiro, vértices e navegação",
    },
    {
      id: "criar" as const,
      label: "Criar",
      short: "CRI",
      icon: Plus,
      desc: "Linha, círculo, arco, retângulo, 3D",
    },
    {
      id: "modificar" as const,
      label: "Modificar",
      short: "MOD",
      icon: Scissors,
      desc: "Área de Transferência, mover, girar, aparar, espelhar, offset",
    },
    {
      id: "precisao" as const,
      label: "Precisão",
      short: "PRE",
      icon: Crosshair,
      desc: "Snap, restrições, orto e grade",
    },
    {
      id: "medir" as const,
      label: "Medir",
      short: "MED",
      icon: Ruler,
      desc: "Régua, cotas lineares, ângulos e raios",
    },
    {
      id: "chapa" as const,
      label: "Chapa",
      short: "CHP",
      icon: Layers,
      desc: "Flange, dobras, alívios e planificação",
    },
    {
      id: "estruturas" as const,
      label: "Estruturas",
      short: "EST",
      icon: Boxes,
      desc: "Perfis, esquadrias e soldas",
    },
    {
      id: "detalhes" as const,
      label: "Detalhes",
      short: "DET",
      icon: CircleDot,
      desc: "Furos, roscas e padrões linear/circular",
    },
  ];

  const activeCategoryData = categories.find((c) => c.id === openCat);

  // Fecha qualquer flyout 2D quando alternar para o modo CAD 3D
  useEffect(() => {
    if (activeMode === "3d") {
      setOpenCat("none");
    }
  }, [activeMode]);

  const selectDirect3D = (nextTool: DirectModeling3DTool) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    onSelectDirect3DTool?.(nextTool);
    window.dispatchEvent(
      new CustomEvent("chamfer-select-direct-3d-tool", {
        detail: { tool: nextTool },
      }),
    );
    if (nextTool === "color_material_3d") {
      dispatchChamferParametricPanel("section");
    }
  };

  // BARRA VERTICAL EXCLUSIVA DE FERRAMENTAS 3D (MODO CAD 3D)
  if (activeMode === "3d") {
    const direct3DTools: {
      id: DirectModeling3DTool;
      short: string;
      label: string;
      desc: string;
      icon: typeof Box;
      matchTools?: DirectModeling3DTool[];
      compatibleWith: ("face" | "edge" | "body" | "none")[];
    }[] = [
      {
        id: "select_3d",
        short: "SEL 3D",
        label: "Selecionar 3D",
        desc: "Selecionar Corpo, Face ou Aresta (toque novamente para limpar seleção)",
        icon: MousePointer2,
        compatibleWith: ["none", "face", "edge", "body"],
      },
      {
        id: "extrude_3d",
        short: "EXTR",
        label: "Extrudar",
        desc: "Puxar/empurrar faces ou perfis (União, Novo Corpo, Subtrair, Interseção)",
        icon: Box,
        compatibleWith: ["face", "body", "none"],
      },
      {
        id: "transform_3d",
        short: "MOVER",
        label: "Mover / Girar (+Z)",
        desc: "Gizmo completo +X/+Y/+Z (Ortho < +Z), arcos de rotação, Centro Geométrico ⌖ e Copy: ON/OFF",
        icon: Move,
        compatibleWith: ["body", "face", "edge", "none"],
      },
      {
        id: "loft_3d",
        short: "LOFT",
        label: "Loft 3D (Transição Multisseção)",
        desc: "Transição suave 3D entre 2 ou mais seções transversais (ex.: Retângulo ➔ Hexágono ➔ Círculo)",
        icon: Boxes,
        compatibleWith: ["body", "face", "edge", "none"],
      },
      {
        id: "revolve_3d",
        short: "REVOL",
        label: "Revolve 3D (Revolução)",
        desc: "Revolucionar perfil fechado (0°..360°) em torno do eixo X, Y ou Z",
        icon: RotateCw,
        compatibleWith: ["body", "face", "none"],
      },
      {
        id: "sweep_3d",
        short: "SWEEP",
        label: "Sweep 3D (Varredura)",
        desc: "Varrer perfil fechado ao longo de caminho reto ou curvo (tubulações e dutos)",
        icon: ArrowRightLeft,
        compatibleWith: ["body", "face", "edge", "none"],
      },
      {
        id: "fillet_3d",
        short: "FILLET",
        label: "Fillet / Chamfer",
        desc: "Arredondar (Raio R) ou chanfrar (45°) arestas e quinas 3D",
        icon: Sparkles,
        matchTools: ["fillet_3d", "chamfer_3d"],
        compatibleWith: ["edge", "none"],
      },
      {
        id: "shell_3d",
        short: "SHELL",
        label: "Shell / Casca",
        desc: "Tubo Metalon vazado (2 faces) ou caixa oca (1 face) com parede independente",
        icon: Layers,
        compatibleWith: ["face", "body", "none"],
      },
      {
        id: "offset_face_3d",
        short: "FACE",
        label: "Offset Face",
        desc: "Puxar ou recuar qualquer face plana ou parede para alongar tubos e bases",
        icon: CornerDownRight,
        compatibleWith: ["face", "none"],
      },
      {
        id: "rotate_axis_3d",
        short: "45°",
        label: "Corte 45° / Girar Face",
        desc: "Inclinar face de extremidade em torno de uma aresta para cortes em meia-esquadria",
        icon: Compass,
        compatibleWith: ["face", "edge", "none"],
      },
      {
        id: "hole_3d",
        short: "FURO",
        label: "Furo 3D (M6–M20)",
        desc: "Inserir furação mecânica paramétrica ISO (Passante, Cego, Rebaixado, Escareado ou Roscado M6–M20)",
        icon: CircleDot,
        compatibleWith: ["face", "body", "none"],
      },
      {
        id: "array_3d",
        short: "ARRAY",
        label: "Array 3D / Grade",
        desc: "Array 3D inteligente com detecção automática de vão livre e divisão exata de tubos para grades e portões",
        icon: Grid,
        compatibleWith: ["body", "face", "none"],
      },
      {
        id: "mirror_3d",
        short: "ESPEL",
        label: "Espelhar 3D",
        desc: "Espelhar simetricamente corpos 3D nos planos X, Y, Z ou face",
        icon: FlipHorizontal,
        compatibleWith: ["body", "face", "none"],
      },
      {
        id: "scale_3d",
        short: "ESCAL",
        label: "Escalar / Alinhar / Booleana",
        desc: "Redimensionar, alinhar face-a-face ou aplicar União/Subtração/Interseção entre corpos 3D",
        icon: Maximize2,
        matchTools: ["scale_3d", "align_3d"],
        compatibleWith: ["body", "none"],
      },
      {
        id: "color_material_3d",
        short: "INSPEC",
        label: "Inspecionar / Seção / BOM",
        desc: "Corte em Seção X/Y/Z ao vivo, Lista de Corte de Perfis, BOM, Interferência e Vista Explodida",
        icon: Eye,
        compatibleWith: ["body", "face", "edge", "none"],
      },
      {
        id: "project_3d",
        short: "PROJ",
        label: "Project 3D → 2D",
        desc: "Projetar faces, arestas ou corpos 3D no esboço 2D como linhas de referência",
        icon: Layers,
        compatibleWith: ["face", "edge", "body", "none"],
      },
      {
        id: "create_drawing_3d",
        short: "VISTAS",
        label: "Create Drawing (Vistas 2D)",
        desc: "Gerar folha de vistas ortográficas 2D (Frontal, Superior, Lateral, Corte A-A) com cotas",
        icon: FileText,
        compatibleWith: ["body", "face", "none"],
      },
    ];

    const hasActive3DSelection = Boolean(hasSelection || selectionKind3D !== "none");

    return (
      <aside
        ref={toolbarRef}
        data-testid="chamfer-cad-3d-exclusive-toolbar"
        aria-label="Barra exclusiva de ferramentas CAD 3D"
        style={{
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-secondary)",
          width: compactMode ? 40 : undefined,
        }}
        className={cn(
          "relative flex h-full max-h-full shrink-0 flex-col items-center border shadow-xl backdrop-blur-md select-none z-40 transition-colors",
          compactMode ? "w-[40px] rounded-xl p-0.5" : "w-12 sm:w-13 rounded-2xl p-1",
          className,
        )}
      >
        {/* BOTÃO RÁPIDO DESELECT ALL NO TOPO QUANDO HÁ SELEÇÃO 3D ATIVA */}
        {hasActive3DSelection && (
          <div className="w-full pb-1 mb-0.5 border-b border-slate-800/80 flex flex-col items-center shrink-0">
            <button
              type="button"
              data-testid="chamfer-3d-deselect-all-btn"
              onClick={() => {
                triggerHaptic("selection");
                AudioManager.play("ui_select");
                onClearSelection3D?.();
                selectDirect3D("select_3d");
              }}
              title="Deselect All — Limpar toda a seleção 3D ativa"
              aria-label="Deselect All"
              className="group relative flex min-h-[32px] w-full flex-col items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300 transition-all hover:bg-amber-500/25 active:scale-95 cursor-pointer"
            >
              <X className="size-3" />
              <span className="text-[6.5px] font-mono font-extrabold tracking-tighter leading-none uppercase">
                LIMPAR
              </span>
            </button>
          </div>
        )}

        {/* FERRAMENTAS DE EDIÇÃO E MODIFICAÇÃO 3D — ROLÁVEL SUAVEMENTE */}
        <div
          ref={scrollContainerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex-1 w-full overflow-y-auto overscroll-contain touch-pan-y scrollbar-none py-0.5 flex flex-col items-center gap-1"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {direct3DTools.map((item) => {
            const Icon = item.icon;
            const isActive = item.matchTools
              ? item.matchTools.includes(activeDirect3DTool)
              : activeDirect3DTool === item.id;
            const isCompatible =
              selectionKind3D === "none" || item.compatibleWith.includes(selectionKind3D);
            const isRecommended =
              selectionKind3D !== "none" &&
              item.id !== "select_3d" &&
              item.compatibleWith.includes(selectionKind3D);

            return (
              <div key={item.id} className="relative w-full shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  data-testid={`chamfer-3d-tool-${item.id}`}
                  onClick={(e) => {
                    if (isDragging.current) {
                      e.stopPropagation();
                      return;
                    }
                    if (item.id === "select_3d" && activeDirect3DTool === "select_3d" && hasSelection) {
                      onClearSelection3D?.();
                    }
                    selectDirect3D(item.id);
                  }}
                  title={`${item.label} — ${item.desc}`}
                  aria-label={item.label}
                  style={
                    isActive
                      ? {
                          backgroundColor: "#00B4D8",
                          color: "#05080F",
                          borderColor: "#00E5FF",
                        }
                      : isRecommended
                        ? {
                            backgroundColor: "rgba(0, 180, 216, 0.14)",
                            color: "#38BDF8",
                            borderColor: "rgba(0, 180, 216, 0.45)",
                          }
                        : {
                            borderColor: "transparent",
                            color: "var(--chamfer-text-secondary)",
                          }
                  }
                  className={cn(
                    "group relative flex min-h-[38px] size-10 w-full flex-col items-center justify-center rounded-xl border transition-all touch-manipulation cursor-pointer",
                    isActive && "shadow-md scale-[1.02]",
                    !isCompatible && !isActive && "opacity-35",
                  )}
                >
                  {isRecommended && !isActive && (
                    <span
                      className="absolute top-1 right-1 size-1.5 rounded-full bg-[#00B4D8]"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="size-3.5 transition-transform group-hover:scale-110" />
                  <span className="text-[7px] font-mono font-bold tracking-tight mt-0.5 leading-none uppercase">
                    {item.short}
                  </span>
                </button>
              </div>
            );
          })}

          {/* 10. EXCLUIR 3D (DELETE) */}
          <div className="relative w-full shrink-0 flex items-center justify-center">
            <button
              type="button"
              data-testid="chamfer-3d-tool-delete"
              disabled={!hasSelection}
              onClick={(e) => {
                if (isDragging.current) {
                  e.stopPropagation();
                  return;
                }
                triggerHaptic("action");
                AudioManager.play("ui_select");
                onDeleteSelection?.();
              }}
              title="Excluir 3D (Delete) — Apagar corpo ou sub-elemento selecionado"
              aria-label="Excluir 3D"
              style={{
                borderColor: "transparent",
                color: hasSelection ? "#F87171" : "var(--chamfer-text-muted)",
              }}
              className={cn(
                "group relative flex min-h-[38px] size-10 w-full flex-col items-center justify-center rounded-xl border transition-all touch-manipulation",
                hasSelection
                  ? "hover:bg-rose-500/15 hover:border-rose-500/40 cursor-pointer"
                  : "opacity-40 cursor-not-allowed",
              )}
            >
              <Trash2 className="size-3.5 transition-transform group-hover:scale-110" />
              <span className="text-[7px] font-mono font-bold tracking-tight mt-0.5 leading-none uppercase">
                EXCLUIR
              </span>
            </button>
          </div>
        </div>

        {/* BOTÃO ESPECÍFICO "SKETCH 2D" NO FINAL DA BARRA ESQUERDA (RETORNO TOTAL AO 2D NORMAL) */}
        <div
          style={{ borderColor: "var(--chamfer-border)" }}
          className="w-full pt-1.5 mt-0.5 border-t flex flex-col items-center shrink-0"
        >
          <button
            type="button"
            data-testid="chamfer-3d-return-sketch-2d-btn"
            onClick={() => {
              triggerHaptic("selection");
              AudioManager.play("ui_select");
              if (onReturnToSketch2D) {
                onReturnToSketch2D();
              } else {
                onModeChange("2d");
              }
            }}
            title="Sketch 2D — Voltar para a prancheta e ferramentas normais do CAD 2D"
            aria-label="Sketch 2D"
            style={{
              backgroundColor: "var(--chamfer-accent-soft)",
              borderColor: "var(--chamfer-accent-border)",
              color: "var(--chamfer-accent)",
            }}
            className="group relative flex min-h-[42px] w-full flex-col items-center justify-center rounded-xl border px-0.5 py-1 transition-all hover:brightness-110 active:scale-95 cursor-pointer shadow-xs"
          >
            <PenLine className="size-3.5 transition-transform group-hover:scale-110" />
            <span className="text-[6.5px] font-mono font-extrabold tracking-tighter mt-0.5 leading-tight uppercase text-center">
              Sketch 2D
            </span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      ref={toolbarRef}
      data-testid="chamfer-left-rail"
      aria-label="Barra de ferramentas CAD"
      style={{
        backgroundColor: isDark ? "rgba(27, 36, 54, 0.92)" : "#FFFFFF",
        backdropFilter: isDark ? "blur(14px)" : undefined,
        WebkitBackdropFilter: isDark ? "blur(14px)" : undefined,
        borderColor: isDark ? "#2D3B55" : "#E2E8F0",
        color: isDark ? "#CBD5E1" : "#334155",
        boxShadow: isDark
          ? "0 4px 16px rgba(0, 0, 0, 0.28)"
          : "0 2px 10px rgba(15, 23, 42, 0.04)",
        width: compactMode ? 40 : undefined,
      }}
      className={cn(
        "relative flex h-full max-h-full shrink-0 flex-col items-center border backdrop-blur-md select-none z-40 transition-colors",
        compactMode
          ? "w-[40px] p-0.5 rounded-xl shadow-lg"
          : cn("w-11 sm:w-12 p-1", isDark ? "rounded-2xl shadow-xl" : "rounded-[28px]"),
        className,
      )}
    >
      {/* BOTÕES PRINCIPAIS DE FUNÇÃO (SEL, CRI, MOD, PRE, MED, CHP, EST, DET) — SUB-CONTAINER DE SCROLL VERTICAL DEDICADO ACIMA DE COR */}
      <div
        ref={scrollContainerRef}
        data-testid="chamfer-left-rail-scroll-container"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "min-h-0 flex-1 w-full overflow-y-auto overscroll-contain touch-pan-y scrollbar-none flex flex-col items-center",
          compactMode ? "py-1 gap-1" : "py-1 gap-1",
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        {categories.map((cat) => {
          const Icon = cat.icon;
          const active = isCatActive(cat.id);
          const isOpen = openCat === cat.id;

          return (
            <div key={cat.id} className="relative w-full shrink-0 flex items-center justify-center">
              <button
                type="button"
                data-testid={`chamfer-rail-cat-${cat.short.toLowerCase()}`}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && e.button !== 0) return;
                }}
                onClick={(e) => {
                  if (isDragging.current) {
                    e.stopPropagation();
                    return;
                  }
                  triggerHaptic("selection");
                  AudioManager.play("ui_select");
                  handleToggleCat(cat.id);
                }}
                title={`${cat.label} — ${cat.desc}`}
                aria-label={cat.label}
                style={
                  isOpen
                    ? isDark
                      ? {
                          backgroundColor: "rgba(14, 165, 233, 0.22)",
                          color: "#F8FAFC",
                          borderColor: "#38BDF8",
                          borderWidth: "1.5px",
                        }
                      : {
                          backgroundColor: "#FFE4E6",
                          color: "#E11D48",
                          borderColor: "#FDA4AF",
                          borderWidth: "1.5px",
                        }
                    : active
                      ? isDark
                        ? {
                            backgroundColor: "rgba(14, 165, 233, 0.22)",
                            borderColor: "#38BDF8",
                            color: "#7DD3FC",
                            borderWidth: "1.5px",
                          }
                        : {
                            backgroundColor: "#FFE4E6",
                            borderColor: "#FDA4AF",
                            color: "#E11D48",
                            borderWidth: "1.5px",
                          }
                      : {
                          borderColor: "transparent",
                          color: isDark ? "#CBD5E1" : "#334155",
                        }
                }
                className={cn(
                  "group relative flex flex-col items-center justify-center border transition-all touch-manipulation cursor-pointer shrink-0",
                  compactMode
                    ? "min-h-[34px] w-[34px] h-[34px] rounded-full"
                    : "min-h-[36px] size-9 w-full rounded-xl",
                  isOpen && (isDark ? "shadow-md scale-[1.02]" : "shadow-xs scale-[1.02]"),
                )}
              >
                <Icon className={cn(compactMode ? "size-3.5" : "size-4", "transition-transform group-hover:scale-110")} />
                <span
                  style={
                    !isOpen && !active
                      ? { color: isDark ? "#94A3B8" : "#475569" }
                      : undefined
                  }
                  className={cn(
                    "font-mono font-bold tracking-wider mt-0.5 leading-none uppercase",
                    compactMode ? "text-[6.5px]" : "text-[7px]",
                  )}
                >
                  {cat.short}
                </span>

                {/* Indicador de ferramenta ativa no grupo */}
                {active && !isOpen && (
                  <span
                    style={{ backgroundColor: isDark ? "#38BDF8" : "#E11D48" }}
                    className="absolute top-1 right-1 size-1.5 rounded-full shadow-xs animate-pulse"
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* SELETOR RÁPIDO DE CAMADA & COR TÉCNICA ATIVA (COR — FIXO NO RODAPÉ DA CÁPSULA ESQUERDA) */}
      {setActiveLayer && (
        <div
          style={{ borderColor: isDark ? "#2D3B55" : "var(--chamfer-border)" }}
          className="w-full pt-1 border-t flex flex-col items-center shrink-0"
        >
          <button
            type="button"
            data-testid="chamfer-rail-cat-cor"
            onClick={() => {
              triggerHaptic("selection");
              handleToggleCat("cor");
            }}
            title={`Cor & Camada ativa: ${activeLayer}. Toque para abrir paleta de cores e camadas.`}
            aria-label={`Cor e Camada: ${activeLayer}`}
            style={{
              backgroundColor:
                openCat === "cor"
                  ? isDark
                    ? "rgba(14, 165, 233, 0.22)"
                    : "var(--chamfer-accent-soft)"
                  : isDark
                    ? "#232E45"
                    : "var(--chamfer-surface-elevated)",
              borderColor:
                openCat === "cor"
                  ? isDark
                    ? "#38BDF8"
                    : "var(--chamfer-accent)"
                  : isDark
                    ? "#334361"
                    : "var(--chamfer-border)",
              color:
                openCat === "cor" && isDark
                  ? "#7DD3FC"
                  : isDark
                    ? "#CBD5E1"
                    : "var(--chamfer-text-secondary)",
            }}
            className={cn(
              "group relative flex flex-col items-center justify-center transition-all border cursor-pointer shrink-0",
              compactMode ? "min-h-[34px] w-[34px] h-[34px] rounded-full" : "size-9 w-full rounded-xl",
            )}
          >
            <span
              className="size-3 rounded-full border border-slate-500/50 shadow-2xs transition-transform group-hover:scale-110"
              style={{
                backgroundColor:
                  activeStrokeColor ||
                  (activeLayer === "dobra"
                    ? "#EC4899"
                    : activeLayer === "recorte"
                      ? "#F59E0B"
                      : activeLayer === "marcacao"
                        ? "#3B82F6"
                        : isDark
                          ? "#F3F4F6"
                          : "#111827"),
              }}
            />
            <span className="text-[7px] font-mono font-bold tracking-wider mt-0.5 leading-none uppercase">
              COR
            </span>
          </button>
        </div>
      )}

      {/* 1. POPOVER LATERAL COMPACTO ACOPLADO AO BOTÃO 'SEL' (SELEÇÃO 2D + FILTROS 3D) */}
      <div
        role="toolbar"
        aria-label="Modos de seleção e filtros 3D"
        aria-hidden={openCat !== "selecionar"}
        style={{
          top: "6px",
          left: "calc(100% + 6px)",
          borderRadius: "16px",
          padding: openCat === "selecionar" ? "6px 8px" : "0px",
          width: openCat === "selecionar" ? "216px" : "0px",
          maxHeight: openCat === "selecionar" ? "320px" : "0px",
          opacity: openCat === "selecionar" ? 1 : 0,
          transform:
            openCat === "selecionar"
              ? "translateX(0) scale(1)"
              : "translateX(-6px) scale(0.92)",
          pointerEvents: openCat === "selecionar" ? "auto" : "none",
          transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          backgroundColor: "var(--chamfer-popover-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-primary)",
        }}
        className={cn(
          "absolute z-50 flex flex-col gap-1.5 overflow-hidden shadow-lg select-none",
          openCat === "selecionar" ? "border" : "border-0",
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            {/* 1. Ponteiro (Seleção Geral + Fusão Gestual de Vértices) */}
            <button
              type="button"
              tabIndex={openCat === "selecionar" ? 0 : -1}
              aria-label="Ponteiro (Seleção Geral)"
              title="Ponteiro (Seleção Geral e Vértices Diretos)"
              onClick={() => handleSelectTool("select", "selecionar")}
              style={
                tool === "select"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer touch-manipulation"
            >
              <MousePointer2 className="size-3.5" />
            </button>

            {/* 2. Nós (Vértices Isolados) */}
            <button
              type="button"
              tabIndex={openCat === "selecionar" ? 0 : -1}
              aria-label="Nós (Vértices Isolados)"
              title="Nós (Vértices Isolados)"
              onClick={() => handleSelectTool("node", "selecionar")}
              style={
                tool === "node"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer touch-manipulation"
            >
              <ControlNodesIcon className="size-3.5" />
            </button>

            {/* 3. Pan (Mover Prancheta 1 Dedo) */}
            <button
              type="button"
              tabIndex={openCat === "selecionar" ? 0 : -1}
              aria-label="Pan (Mover Prancheta)"
              title="Pan (Mover Prancheta com 1 Dedo)"
              onClick={() => handleSelectTool("pan", "selecionar")}
              style={
                tool === "pan"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer touch-manipulation"
            >
              <Hand className="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            tabIndex={openCat === "selecionar" ? 0 : -1}
            onClick={() => setOpenCat("none")}
            style={{ color: "var(--chamfer-text-secondary)" }}
            className="size-5 rounded-md grid place-items-center transition-colors cursor-pointer"
            title="Fechar seleção"
          >
            <X className="size-3" />
          </button>
        </div>

        {/* Filtros de Seleção de Sub-Elementos 3D */}
        <div
          style={{ borderColor: "var(--chamfer-border-subtle)" }}
          className="border-t pt-1.5 flex flex-col gap-1"
        >
          <span
            style={{ color: "var(--chamfer-text-secondary)" }}
            className="font-mono text-[9px] font-bold uppercase tracking-wider px-0.5"
          >
            Filtro de Seleção 3D
          </span>
          <div className="grid grid-cols-2 gap-1 font-mono text-[9.5px] font-bold">
            {(
              [
                { id: "body", label: "Corpo Inteiro" },
                { id: "all_faces", label: "Faces" },
                { id: "all_edges", label: "Arestas" },
                { id: "top_face", label: "Face Topo" },
                { id: "both_faces", label: "2 Faces (Topo+Base)" },
                { id: "vertical_edges", label: "4 Arestas Verticais" },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                tabIndex={openCat === "selecionar" ? 0 : -1}
                onClick={() => {
                  triggerHaptic("selection");
                  onModeChange("3d");
                  window.dispatchEvent(
                    new CustomEvent("chamfer-3d-subselection-preset", {
                      detail: { preset: preset.id },
                    }),
                  );
                  setOpenCat("none");
                }}
                style={{
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="truncate rounded-lg border px-1.5 py-1 text-left transition-colors hover:border-cyan-500/60 hover:text-cyan-400 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FLYOUT CONTEXTUAL FLUTUANTE PARA AS DEMAIS CATEGORIAS (EXCETO 'selecionar') */}
      {openCat !== "none" && openCat !== "selecionar" && activeCategoryData && (
        <div
          className="absolute left-full ml-1.5 sm:ml-2 z-50 w-64 max-w-[calc(100vw-60px)] sm:max-w-[92vw] rounded-2xl border p-2 shadow-2xl backdrop-blur-lg animate-in fade-in zoom-in-95 duration-150 overflow-y-auto"
          style={{
            ...getFlyoutPosition(openCat),
            maxHeight: "calc(100% - 8px)",
            backgroundColor: "var(--chamfer-popover-bg)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
        >
          {/* CABEÇALHO DO FLYOUT */}
          <div
            style={{ borderColor: "var(--chamfer-border-subtle)" }}
            className="flex items-center justify-between border-b pb-1.5 mb-1.5"
          >
            <div className="flex items-center gap-1.5">
              <activeCategoryData.icon
                style={{ color: "var(--chamfer-accent)" }}
                className="size-3.5"
              />
              <span
                style={{ color: "var(--chamfer-text-primary)" }}
                className="font-mono text-xs font-bold uppercase tracking-wide"
              >
                {activeCategoryData.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  setIsPinned((p) => !p);
                }}
                style={
                  isPinned
                    ? {
                         backgroundColor: "var(--chamfer-accent)",
                         color: "var(--chamfer-accent-contrast)",
                      }
                    : { color: "var(--chamfer-text-secondary)" }
                }
                className="size-5 rounded-md grid place-items-center transition-colors cursor-pointer"
                title={
                  isPinned
                    ? "Menu fixado (clique para recolher automaticamente)"
                    : "Fixar menu aberto"
                }
              >
                {isPinned ? <Pin className="size-3" /> : <PinOff className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => setOpenCat("none")}
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="size-5 rounded-md grid place-items-center transition-colors cursor-pointer"
                title="Fechar menu"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

                {/* 2. GRUPO: CRIAR (ESBOÇO 2D + SÓLIDOS 3D) */}
                {openCat === "criar" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <p
                      style={{ color: "var(--chamfer-text-secondary)" }}
                      className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5"
                    >
                      Esboço 2D
                    </p>
                    <FlyoutItem
                      label="Linha"
                      keyLabel="L"
                      icon={Minus}
                      active={tool === "line"}
                      onClick={() => handleSelectTool("line", "criar")}
                      desc="Segmento de reta com entrada dinâmica (L, ∠)"
                    />
                    <FlyoutItem
                      label="Linha de Construção (Eixo)"
                      keyLabel="XL"
                      icon={Crosshair}
                      active={tool === "construction_line"}
                      onClick={() => handleSelectTool("construction_line", "criar")}
                      desc="Eixo infinito de centro ou referência projetada"
                    />
                    <FlyoutItem
                      label="Polilinha (Linha ↔ Arco)"
                      keyLabel="P"
                      icon={PenLine}
                      active={tool === "polyline"}
                      onClick={() => handleSelectTool("polyline", "criar")}
                      desc="Contorno contínuo alternando retas e arcos tangentes"
                    />
                    <FlyoutItem
                      label="Círculo / Furo (Centro / 2P / 3P / TTR)"
                      keyLabel="C"
                      icon={CircleIcon}
                      active={tool === "circle"}
                      onClick={() => handleSelectTool("circle", "criar")}
                      desc="Centro-Raio, Diâmetro, 2P, 3P ou Tangente-Tangente-R"
                    />
                    <FlyoutItem
                      label="Arco 3 Pontos"
                      keyLabel="A"
                      icon={Compass}
                      active={tool === "arc"}
                      onClick={() => handleSelectTool("arc", "criar")}
                      desc="Início, meio e fim de curvatura (≥128 seg)"
                    />
                    <FlyoutItem
                      label="Retângulo (2 Cantos / Centro / 3P)"
                      keyLabel="R"
                      icon={Square}
                      active={tool === "rect"}
                      onClick={() => handleSelectTool("rect", "criar")}
                      desc="2 cantos, pelo centro ou inclinado por 3 pontos"
                    />
                    <FlyoutItem
                      label="Polígono / Sextavado (S mm)"
                      icon={Hexagon}
                      active={tool === "polygon"}
                      onClick={() => handleSelectTool("polygon", "criar")}
                      desc="Inscrito, circunscrito ou medida entre faces S (mm)"
                    />
                    <FlyoutItem
                      label="Rasgo Oblongo (Slot Reto / Curvo)"
                      keyLabel="SL"
                      icon={Minus}
                      active={tool === "slot"}
                      onClick={() => handleSelectTool("slot", "criar")}
                      desc="Slot mecânico centro-a-centro, total ou em arco"
                    />
                    <FlyoutItem
                      label="Elipse Analítica"
                      icon={Egg}
                      active={tool === "ellipse"}
                      onClick={() => handleSelectTool("ellipse", "criar")}
                      desc="Centro e semieixos Rx/Ry (≥128 segmentos)"
                    />
                    <FlyoutItem
                      label="Spline Suave (Curva)"
                      keyLabel="SPL"
                      icon={Sparkles}
                      active={tool === "spline"}
                      onClick={() => handleSelectTool("spline", "criar")}
                      desc="Curva interpolada suave com ≥128 segmentos"
                    />
                    <FlyoutItem
                      label="Desenho Livre (Vetorial)"
                      keyLabel="LIV"
                      icon={PenLine}
                      active={tool === "freehand"}
                      onClick={() => handleSelectTool("freehand", "criar")}
                      desc="Traço contínuo suavizado em tempo real (Fiel, Suave ou Poligonal)"
                    />
                    <FlyoutItem
                      label="Ponto de Apoio"
                      icon={Dot}
                      active={tool === "point"}
                      onClick={() => handleSelectTool("point", "criar")}
                      desc="Referência de coordenadas CAD"
                    />
                    <FlyoutItem
                      label="Texto / Nota Técnica"
                      keyLabel="X"
                      icon={Type}
                      active={tool === "text"}
                      onClick={() => handleSelectTool("text", "criar")}
                      desc="Anotação rica justificada, fórmulas nativas ou gravação"
                    />
                    {onOpenPresets && (
                      <FlyoutItem
                        label="Presets Paramétricos"
                        icon={Boxes}
                        onClick={() => {
                          onOpenPresets();
                          setOpenCat("none");
                        }}
                        desc="Flanges DIN/ANSI, bases e tubos"
                      />
                    )}
                    {onOpenTechnicalSheet && (
                      <FlyoutItem
                        label="Folha e Legenda Técnica"
                        icon={FileText}
                        onClick={() => {
                          onOpenTechnicalSheet();
                          setOpenCat("none");
                        }}
                        desc="Prancha A4/A3/A2 com carimbo CALDRA"
                      />
                    )}
                    {onOpenPieceBuilder && (
                      <FlyoutItem
                        label="Projeção Isométrica (Converter)"
                        icon={Sparkles}
                        onClick={() => {
                          onOpenPieceBuilder();
                          setOpenCat("none");
                        }}
                        desc="Transforma a seleção ativa do documento para perspectiva isométrica analítica 2D/2.5D"
                      />
                    )}
                    {onOpenRevEngCategory && (
                      <FlyoutItem
                        label="Reconstruir Peça (Eng. Reversa)"
                        keyLabel="REV"
                        badge="1:1"
                        icon={Compass}
                        onClick={() => {
                          triggerHaptic("selection");
                          onOpenRevEngCategory("referencias", "A");
                          setOpenCat("none");
                        }}
                        desc="Assistente guiado (A→F), captura de contorno e ajuste ortogonal"
                      />
                    )}

                    <div
                      style={{ backgroundColor: "var(--chamfer-border)" }}
                      className="my-1 h-px"
                    />
                    <p
                      style={{ color: "var(--chamfer-accent)" }}
                      className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5"
                    >
                      Sólidos 3D
                    </p>

                    <FlyoutItem
                      label="Extrusão 3D (Sólido / União / Subtração)"
                      icon={Box}
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "extrude_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      badge="3D"
                      desc="Gerar sólido 3D por extrusão (Union, New Body, Subtract, Intersect)"
                    />
                    <FlyoutItem
                      label="Sketch on Face (Esboçar na Face)"
                      icon={PenLine}
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "sketch_on_face_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      badge="3D"
                      desc="Alinha o plano 2D sobre qualquer face 3D para desenhar furos ou recortes"
                    />
                    <FlyoutItem
                      label="Revolve 3D"
                      icon={RotateCw}
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "revolve_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      badge="3D"
                      desc="Revolução de perfil em torno de um eixo"
                    />
                    <FlyoutItem
                      label="Loft 3D (Transição Multisseção)"
                      keyLabel="LOFT"
                      icon={Layers}
                      active={tool === "loft_3d"}
                      onClick={() => handleSelectTool("loft_3d", "criar")}
                      badge="3D"
                      desc="Transição sólida suave entre 2+ perfis em diferentes elevações Z"
                    />
                  </div>
                )}

                {/* 3. GRUPO: MODIFICAR (EDIÇÃO 2D + MODELAGEM DIRETA 3D) */}
                {openCat === "modificar" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <p
                      style={{ color: "var(--chamfer-text-secondary)" }}
                      className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5"
                    >
                      Edição 2D
                    </p>
                    <FlyoutItem
                      label="Área de Transferência"
                      keyLabel="CLIP"
                      icon={ClipboardList}
                      onClick={() => {
                        onOpenClipboard?.();
                        setOpenCat("none");
                      }}
                      desc="Painel global: formas copiadas, itens fixados (📌) e colar"
                    />
                    <FlyoutItem
                      label="Mover"
                      keyLabel="M"
                      icon={Move}
                      disabled={!hasSelection}
                      onClick={() => {
                        onMoveSelection();
                        setOpenCat("none");
                      }}
                      desc="Transladar elementos selecionados"
                    />
                    <FlyoutItem
                      label="Copiar"
                      keyLabel="CO"
                      icon={Copy}
                      disabled={!hasSelection}
                      onClick={() => {
                        onCopySelection();
                        setOpenCat("none");
                      }}
                      desc="Copiar seleção para a Área de Transferência (Ctrl+C)"
                    />
                    <FlyoutItem
                      label="Girar"
                      keyLabel="RO"
                      icon={RotateCw}
                      disabled={!hasSelection}
                      onClick={() => {
                        onRotateSelection();
                        setOpenCat("none");
                      }}
                      desc="Rotacionar em torno do centro geométrico"
                    />
                    <FlyoutItem
                      label="Mirror 2D (Espelhar)"
                      keyLabel="MI"
                      icon={FlipHorizontal}
                      disabled={!hasSelection}
                      onClick={() => {
                        onMirrorSelection();
                        setOpenCat("none");
                      }}
                      desc="Refletir sobre o eixo central"
                    />
                    <FlyoutItem
                      label="Escalar"
                      keyLabel="SC"
                      icon={Maximize2}
                      disabled={!hasSelection}
                      onClick={() => {
                        onScaleSelection();
                        setOpenCat("none");
                      }}
                      desc="Ampliar ou reduzir proporcionalmente"
                    />

                    <div
                      style={{ backgroundColor: "var(--chamfer-border)" }}
                      className="my-1 h-px"
                    />

                    <FlyoutItem
                      label="Offset 2D (Deslocamento)"
                      keyLabel="O"
                      icon={CornerDownRight}
                      active={tool === "offset"}
                      onClick={() => handleSelectTool("offset", "modificar")}
                      desc={`Distância: ${offsetDist} mm`}
                    />
                    <FlyoutItem
                      label="Trim / Aparar"
                      keyLabel="TR"
                      icon={Scissors}
                      active={tool === "trim"}
                      onClick={() => handleSelectTool("trim", "modificar")}
                      desc="Cortar linha em interseção com outra"
                    />
                    <FlyoutItem
                      label="Aparar até Encontro"
                      keyLabel="ATE"
                      icon={Scissors}
                      active={tool === "smart_trim"}
                      onClick={() => handleSelectTool("smart_trim", "modificar")}
                      desc="Aparar direto até a primeira interseção limite"
                    />
                    <FlyoutItem
                      label="Centralizar Formas"
                      keyLabel="CTR"
                      icon={AlignCenter}
                      active={tool === "center"}
                      disabled={!hasSelection}
                      onClick={() => {
                        if (onCenterSelection) {
                          onCenterSelection();
                          setOpenCat("none");
                        } else {
                          handleSelectTool("center", "modificar");
                        }
                      }}
                      desc="Centralizar seleção por centro geométrico ou limites"
                    />
                    <FlyoutItem
                      label="Extend (Estender)"
                      keyLabel="EX"
                      icon={Maximize}
                      active={tool === "extend"}
                      onClick={() => handleSelectTool("extend", "modificar")}
                      desc="Prolongar linha até o próximo limite"
                    />
                    <FlyoutItem
                      label="Fillet 2D (Arredondamento)"
                      keyLabel="F"
                      icon={Sparkles}
                      active={tool === "fillet"}
                      onClick={() => handleSelectTool("fillet", "modificar")}
                      desc={`Raio: R${filletR} mm`}
                    />
                    <FlyoutItem
                      label="Chamfer 2D (Chanfro Angular)"
                      keyLabel="CHA"
                      icon={Sparkles}
                      active={tool === "chamfer"}
                      onClick={() => handleSelectTool("chamfer", "modificar")}
                      desc="Corte chanfrado em quinas vivas"
                    />
                    <FlyoutItem
                      label="Pattern / Array Linear"
                      icon={Grid}
                      disabled={!hasSelection}
                      onClick={() => {
                        onArrayLinear();
                        setOpenCat("none");
                      }}
                      desc="Repetição em linhas e colunas"
                    />
                    <FlyoutItem
                      label="Pattern / Array Circular"
                      icon={Disc}
                      disabled={!hasSelection}
                      onClick={() => {
                        onArrayPolar();
                        setOpenCat("none");
                      }}
                      desc="Repetição radial em torno de centro"
                    />
                    <FlyoutItem
                      label="Dividir em Partes"
                      keyLabel="DIV"
                      icon={Divide}
                      active={tool === "divide"}
                      onClick={() => {
                        if (onDivideSelection && hasSelection) {
                          onDivideSelection();
                          setOpenCat("none");
                        } else {
                          handleSelectTool("divide", "modificar");
                        }
                      }}
                      desc="Dividir peça ou contorno em N partes iguais"
                    />

                    <div
                      style={{ backgroundColor: "var(--chamfer-border)" }}
                      className="my-1 h-px"
                    />

                    <FlyoutItem
                      label="Unir (Join)"
                      icon={Combine}
                      disabled={!hasSelection}
                      onClick={() => {
                        onJoinSelection();
                        setOpenCat("none");
                      }}
                      desc="Fundir segmentos contíguos em polilinha"
                    />
                    <FlyoutItem
                      label="Quebrar (Break)"
                      icon={Split}
                      disabled={!hasSelection}
                      onClick={() => {
                        onBreakSelection();
                        setOpenCat("none");
                      }}
                      desc="Partir entidade em um ponto"
                    />
                    <FlyoutItem
                      label="Explodir (Explode)"
                      icon={Split}
                      disabled={!hasSelection}
                      onClick={() => {
                        onExplodeSelection();
                        setOpenCat("none");
                      }}
                      desc="Desmembrar polilinha ou bloco"
                    />
                    {onOverkillClean && (
                      <FlyoutItem
                        label="Overkill (Limpar Duplicatas)"
                        keyLabel="OV"
                        icon={Sparkles}
                        onClick={() => {
                          onOverkillClean();
                          setOpenCat("none");
                        }}
                        desc="Remove linhas duplicadas, nulas e sobreposições colineares"
                      />
                    )}

                    {onBoolean2D && (
                      <>
                        <div
                          style={{ backgroundColor: "var(--chamfer-border)" }}
                          className="my-1 h-px"
                        />
                        <p
                          style={{ color: "var(--chamfer-text-secondary)" }}
                          className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5"
                        >
                          Booleanas de Região 2D
                        </p>
                        <FlyoutItem
                          label="Unir Regiões (Union)"
                          keyLabel="UNI"
                          icon={Combine}
                          disabled={selectedCount < 2}
                          onClick={() => {
                            onBoolean2D("union");
                            setOpenCat("none");
                          }}
                          desc="Funde 2+ perfis fechados em contorno único"
                        />
                        <FlyoutItem
                          label="Subtrair Região (Subtract)"
                          keyLabel="SUB"
                          icon={Scissors}
                          disabled={selectedCount < 2}
                          onClick={() => {
                            onBoolean2D("subtract");
                            setOpenCat("none");
                          }}
                          desc="Recorta o 1º perfil pelo 2º perfil fechado"
                        />
                        <FlyoutItem
                          label="Interseção 2D (Intersect)"
                          keyLabel="INT"
                          icon={Boxes}
                          disabled={selectedCount < 2}
                          onClick={() => {
                            onBoolean2D("intersect");
                            setOpenCat("none");
                          }}
                          desc="Preserva apenas a área comum entre perfis"
                        />
                      </>
                    )}

                    {onCreateHatch && (
                      <FlyoutItem
                        label="Hachura Técnica (Com Ilhas)"
                        keyLabel="H"
                        icon={Layers}
                        disabled={!hasSelection}
                        onClick={() => {
                          onCreateHatch();
                          setOpenCat("none");
                        }}
                        desc="Preenche perfil fechado respeitando furos internos"
                      />
                    )}

                    {/* SEÇÃO DE MODELAGEM DIRETA 3D INTEGRADA AO MENU 'MOD' */}
                    <div
                      style={{ backgroundColor: "var(--chamfer-border)" }}
                      className="my-1 h-px"
                    />
                    <p
                      style={{ color: "var(--chamfer-accent)" }}
                      className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5"
                    >
                      Modelagem Direta 3D
                    </p>

                    <FlyoutItem
                      label="Fillet / Chamfer 3D (Arestas)"
                      icon={Sparkles}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "fillet_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Arredondamento ou chanfro 45° nas arestas 3D selecionadas"
                    />
                    <FlyoutItem
                      label="Shell / Casca (Tubo Metalon / Chapa)"
                      icon={Layers}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "shell_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Transforma sólido em tubo vazado (2 faces) ou caixa oca"
                    />
                    <FlyoutItem
                      label="Offset Face (Esticar Face)"
                      icon={CornerDownRight}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "offset_face_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Empurra ou puxa faces do sólido (+Z, -Z ou laterais)"
                    />
                    <FlyoutItem
                      label="Corte 45° (Meia-Esquadria)"
                      icon={Compass}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "rotate_axis_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Inclina a face da extremidade em torno de uma aresta (ex.: ±45°)"
                    />
                    <FlyoutItem
                      label="Move / Rotate 3D (Pivô + Copy)"
                      icon={Move}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "transform_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Translada ou gira sólidos 3D com pivô móvel e cópia rápida"
                    />
                    <FlyoutItem
                      label="Mirror 3D"
                      icon={FlipHorizontal}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "mirror_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Espelhar corpos sólidos nos planos X, Y ou Z"
                    />
                    <FlyoutItem
                      label="Material / Cor"
                      icon={Eye}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "color_material_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Aço Carbono, Inox 304, Alumínio, Galvanizado ou Corten"
                    />
                    <FlyoutItem
                      label="Loft 3D (Transição entre Seções)"
                      keyLabel="LOFT"
                      icon={Boxes}
                      active={tool === "loft_3d"}
                      onClick={() => handleSelectTool("loft_3d", "modificar")}
                      badge="3D"
                      desc="Seleciona 2+ perfis sequencialmente ([1]→[2]→[3]) com prévia 3D translúcida"
                    />
                    {onDeleteSelection && (
                      <FlyoutItem
                        label="Excluir"
                        keyLabel="DEL"
                        icon={Trash2}
                        disabled={!hasSelection}
                        onClick={() => {
                          onDeleteSelection();
                          setOpenCat("none");
                        }}
                        desc="Remover entidades ou corpos 3D selecionados"
                      />
                    )}

                    <div
                      style={{ backgroundColor: "var(--chamfer-border)" }}
                      className="my-1 h-px"
                    />

                    {onOpenTopologyHealth && (
                      <FlyoutItem
                        label="Topologia & Auto-Heal"
                        icon={Activity}
                        onClick={() => {
                          onOpenTopologyHealth();
                          setOpenCat("none");
                        }}
                        desc="Diagnóstico de frestas, aberturas e duplicatas"
                      />
                    )}
                    {onOpenVariables && (
                      <FlyoutItem
                        label="Tabela de Variáveis"
                        icon={Sliders}
                        onClick={() => {
                          onOpenVariables();
                          setOpenCat("none");
                        }}
                        desc="Fórmulas e dimensões paramétricas do projeto"
                      />
                    )}
                    {onOpenQuickCommand && (
                      <FlyoutItem
                        label="Comando Rápido"
                        keyLabel="Q"
                        icon={Search}
                        onClick={() => {
                          onOpenQuickCommand();
                          setOpenCat("none");
                        }}
                        desc="Busca instantânea de comandos e operações"
                      />
                    )}
                    {onOpenRevEngCategory && (
                      <FlyoutItem
                        label="Ajustar Contorno Medido (LSQ)"
                        keyLabel="FIT"
                        icon={Compass}
                        onClick={() => {
                          triggerHaptic("selection");
                          onOpenRevEngCategory("contorno_ajuste", "C");
                          setOpenCat("none");
                        }}
                        desc="Ajuste ortogonal de reta, círculo, arco curto e polilinha RDP"
                      />
                    )}
                  </div>
                )}

                {/* 4. GRUPO: PRECISÃO / RESTRIÇÕES */}
                {openCat === "precisao" && (
                  <div className="flex flex-col gap-1 font-mono text-xs">
                    <div className="grid grid-cols-2 gap-1 pb-0.5">
                      <button
                        type="button"
                        data-testid="chamfer-pre-constraints-btn"
                        onClick={() => {
                          triggerHaptic("selection");
                          dispatchChamferParametricPanel("constraints");
                          setOpenCat("none");
                        }}
                        style={{
                          backgroundColor: "var(--chamfer-accent-soft)",
                          borderColor: "var(--chamfer-accent-border)",
                          color: "var(--chamfer-accent)",
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition hover:brightness-110 cursor-pointer"
                        title="Abrir Gaveta de Restrições 2D, Graus de Liberdade (DOF) e Autorrestringir"
                      >
                        <Sparkles className="size-3 shrink-0" />
                        <span>Restrições 2D</span>
                      </button>
                      <button
                        type="button"
                        data-testid="chamfer-pre-params-btn"
                        onClick={() => {
                          triggerHaptic("selection");
                          dispatchChamferParametricPanel("parameters");
                          setOpenCat("none");
                        }}
                        style={{
                          backgroundColor: "var(--chamfer-surface-elevated)",
                          borderColor: "var(--chamfer-border)",
                          color: "var(--chamfer-text-primary)",
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition hover:brightness-110 cursor-pointer"
                        title="Abrir Gaveta de Parâmetros (fx), Sweep e Configurações"
                      >
                        <span style={{ color: "var(--chamfer-accent)" }}>fx</span>
                        <span>Parâmetros</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setSnapOn((s) => !s);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        snapOn ? "bg-red-950/60 border border-red-500/40 text-red-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Magnet className="size-4" />
                        <span>Snap Geométrico</span>
                      </div>
                      <span className="font-bold">{snapOn ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    {/* DIVISÃO VIRTUAL DE FORMAS NO SNAP (NÃO-DESTRUTIVA) */}
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Divide className="size-3 text-cyan-400" />
                          Divisão do Snap (Virtual)
                        </span>
                        <span className="font-mono font-bold text-cyan-400">
                          {snapDivision && snapDivision >= 2 ? `${snapDivision} partes` : "OFF"}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight">
                        Gera pontos magnéticos virtuais em N partes iguais (linhas, arcos, círculos e polígonos) sem cortar a peça.
                      </p>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {[0, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                          <button
                            key={`snap-div-${n}`}
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onSetSnapDivision?.(n);
                            }}
                            className={cn(
                              "py-1 rounded-lg font-mono text-[10px] font-bold transition-all text-center",
                              (snapDivision === n || (n === 0 && (!snapDivision || snapDivision < 2)))
                                ? "bg-cyan-600 text-white shadow-xs"
                                : "bg-slate-800 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            {n === 0 ? "OFF" : `${n}p`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* MOSTRAR TODOS OS SNAPS DA PEÇA */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onToggleShowAllSnaps?.();
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        showAllSnaps
                          ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                      title="Exibir simultaneamente todos os pontos de snap de todas as formas existentes no canvas"
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="size-4" />
                        <span>Mostrar Todos os Snaps</span>
                      </div>
                      <span className="font-bold">{showAllSnaps ? "ON" : "OFF"}</span>
                    </button>

                    {/* SELETOR EXCLUSIVO: GUIAS DE INTERAÇÃO */}
                    <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-900/95 border border-slate-800">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-200 font-bold uppercase tracking-wider">
                          MARCO GEOMÉTRICO & DATUM
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">Associativo</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {(
                          [
                            {
                              id: "off" as const,
                              label: "Desativadas",
                              activeClass: "bg-slate-700 text-white border-slate-500",
                            },
                            {
                              id: "purple_ref" as const,
                              label: "Marco Geométrico / Âncora (A–E)",
                              activeClass: "bg-cyan-950/80 text-cyan-300 border-cyan-500/60",
                            },
                            {
                              id: "blue_line" as const,
                              label: "Vetor Datum Persistente (ΔX / ΔY / ∠)",
                              activeClass: "bg-sky-950/80 text-sky-300 border-sky-500/60",
                            },
                          ]
                        ).map((opt) => {
                          const isSelected = interactionGuideMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`guide-mode-${opt.id}`}
                              onClick={() => {
                                triggerHaptic("selection");
                                onSetInteractionGuideMode?.(opt.id);
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold transition-all border text-left cursor-pointer",
                                isSelected
                                  ? opt.activeClass
                                  : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200",
                              )}
                            >
                              <span>{opt.label}</span>
                              <span
                                className={cn(
                                  "size-2.5 rounded-full border",
                                  isSelected
                                    ? opt.id === "purple_ref"
                                      ? "bg-purple-400 border-purple-200"
                                      : opt.id === "blue_line"
                                        ? "bg-sky-400 border-sky-200"
                                        : "bg-slate-200 border-white"
                                    : "border-slate-600 bg-transparent",
                                )}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* VETOR DATUM PERSISTENTE (ΔX / ΔY / ∠) */}
                    <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-sky-950/35 border border-sky-500/40">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-sky-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Crosshair className="size-3 text-rose-500" />
                          Vetor Datum Persistente
                        </span>
                        {temporaryOrigin && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onClearTemporaryOrigin?.();
                            }}
                            className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase px-1.5 py-0.5 rounded bg-red-950/60 transition-colors cursor-pointer"
                          >
                            Limpar Datum
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid="toolbar-define-datum-btn"
                        onClick={() => {
                          triggerHaptic("action");
                          if (!interactionGuideMode || interactionGuideMode === "off") {
                            onSetInteractionGuideMode?.("blue_line");
                          }
                          onStartSetReferencePoint?.();
                          setOpenCat("none");
                        }}
                        className="mt-0.5 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-mono text-[10.5px] font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <Crosshair className="size-3.5" />
                        <span>{temporaryOrigin ? "Redefinir Vetor Datum" : "Definir Vetor Datum"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setOrthoOn((o) => !o);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        orthoOn ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Crosshair className="size-4" />
                        <span>Modo Orto (0°/90°)</span>
                      </div>
                      <span className="font-bold">{orthoOn ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setTrackingOn((t) => !t);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        trackingOn ? "bg-sky-950/60 border border-sky-500/40 text-sky-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Compass className="size-4" />
                        <span>Smart Tracking (15°/30°/45°)</span>
                      </div>
                      <span className="font-bold">{trackingOn ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setShowGrid((g) => !g);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        showGrid ? "bg-red-950/60 border border-red-500/40 text-red-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Grid className="size-4" />
                        <span>Grade Espacial ({grid} mm)</span>
                      </div>
                      <span className="font-bold">{showGrid ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    {onSetRefZero && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("action");
                          onSetRefZero();
                          setOpenCat("none");
                        }}
                        className="flex items-center justify-between rounded-xl px-2.5 py-1.5 bg-amber-950/50 border border-amber-500/40 text-amber-300 hover:bg-amber-900/60 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Crosshair className="size-4" />
                          <span>Fixar Origem REF (0,0)</span>
                        </div>
                        <span className="font-bold">APLICAR</span>
                      </button>
                    )}

                    {onToggleDrawingProjection && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onToggleDrawingProjection();
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                          drawingProjection === "isometric"
                            ? "bg-red-950/60 border border-red-500/40 text-red-300"
                            : "bg-slate-900 text-slate-400 hover:text-slate-200",
                        )}
                        title="Alternar entre Desenho Ortogonal 2D e Isométrico 2D"
                      >
                        <div className="flex items-center gap-2">
                          <Box className="size-4" />
                          <span>Modo Isométrico 2D</span>
                        </div>
                        <span className="font-bold">
                          {drawingProjection === "isometric" ? "ATIVO" : "DESLIGADO"}
                        </span>
                      </button>
                    )}

                    {drawingProjection === "isometric" && onSelectIsoPlane && (
                      <div className="flex flex-col gap-1 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
                        <span className="text-[10px] text-muted-foreground font-semibold px-1">
                          Plano Isométrico (F5):
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {(["top", "left", "right"] as const).map((pId) => (
                            <button
                              key={pId}
                              type="button"
                              onClick={() => {
                                triggerHaptic("selection");
                                onSelectIsoPlane(pId);
                              }}
                              className={cn(
                                "py-1 rounded-lg text-[10px] font-bold uppercase transition-colors text-center",
                                isoPlane === pId
                                  ? "bg-red-600 text-white shadow-xs"
                                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                              )}
                            >
                              {pId === "top" ? "Superior" : pId === "left" ? "Esquerdo" : "Direito"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-800 pt-2 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                        Modificadores de Precisão (Touch)
                      </p>
                      <div className="flex flex-col gap-1">
                        {onToggleCursorOffsetMode && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onToggleCursorOffsetMode();
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                              cursorOffsetMode === "offset"
                                ? "bg-sky-950/60 border border-sky-500/40 text-sky-300"
                                : "bg-slate-900 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Crosshair className="size-3.5" />
                              <span>Mira Técnica</span>
                            </div>
                            <span className="font-bold uppercase">
                              {cursorOffsetMode === "offset" ? "OFFSET 55PX" : "DIRETA"}
                            </span>
                          </button>
                        )}

                        {onCycleLoupeMode && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onCycleLoupeMode();
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                              loupeMode !== "off"
                                ? "bg-cyan-950/60 border border-cyan-500/40 text-cyan-300"
                                : "bg-slate-900 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Eye className="size-3.5" />
                              <span>Lupa HUD</span>
                            </div>
                            <span className="font-bold uppercase">
                              {loupeMode === "pinned"
                                ? "FIXA"
                                : loupeMode === "floating"
                                  ? "FLUTUANTE"
                                  : "DESLIGADA"}
                            </span>
                          </button>
                        )}

                        {onToggleNudgeHud && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onToggleNudgeHud();
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                              nudgeHudVisible
                                ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                                : "bg-slate-900 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Sliders className="size-3.5" />
                              <span>Coordenadas / Nudge</span>
                            </div>
                            <span className="font-bold uppercase">
                              {nudgeHudVisible ? "ATIVO" : "SOB DEMANDA"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-2 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                        Restrições Geométricas
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Coincidente</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Paralelo</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Perpendicular</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Tangente</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Horizontal</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Fixar Ponto</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. GRUPO: MEDIR */}
                {openCat === "medir" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Régua / Distância Livre"
                      keyLabel="D"
                      icon={Ruler}
                      active={tool === "measure"}
                      onClick={() => handleSelectTool("measure", "medir")}
                      desc="Medir distância e ângulo entre dois cliques"
                    />

                    <div className="my-1 h-px bg-slate-800" />
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-2 py-0.5">
                      Cotas Técnicas
                    </p>

                    <FlyoutItem
                      label="Cota Alinhada"
                      icon={Ruler}
                      active={tool === "dim" && dimKind === "aligned"}
                      onClick={() => {
                        onPickDimKind("aligned");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Dimensão paralela à entidade"
                    />
                    <FlyoutItem
                      label="Cota Horizontal"
                      icon={Ruler}
                      active={tool === "dim" && dimKind === "horizontal"}
                      onClick={() => {
                        onPickDimKind("horizontal");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Projeção no eixo X"
                    />
                    <FlyoutItem
                      label="Cota Vertical"
                      icon={Ruler}
                      active={tool === "dim" && dimKind === "vertical"}
                      onClick={() => {
                        onPickDimKind("vertical");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Projeção no eixo Y"
                    />
                    <FlyoutItem
                      label="Cota de Raio (R)"
                      icon={CircleDot}
                      active={tool === "dim" && dimKind === "radius"}
                      onClick={() => {
                        onPickDimKind("radius");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Raio de arco ou círculo"
                    />
                    <FlyoutItem
                      label="Cota de Diâmetro (Ø)"
                      icon={Disc}
                      active={tool === "dim" && dimKind === "diameter"}
                      onClick={() => {
                        onPickDimKind("diameter");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Diâmetro de furos e círculos"
                    />
                    <FlyoutItem
                      label="Cota Angular (°)"
                      icon={Compass}
                      active={tool === "dim" && dimKind === "angle"}
                      onClick={() => {
                        onPickDimKind("angle");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Ângulo entre duas retas"
                    />
                    {onOpenRevEngCategory && (
                      <>
                        <div className="my-1 h-px bg-slate-800" />
                        <FlyoutItem
                          label="Caderno de Medições & Calibração 1:1"
                          keyLabel="REV"
                          badge="ENG"
                          icon={Ruler}
                          onClick={() => {
                            triggerHaptic("selection");
                            onOpenRevEngCategory("caderno", "B");
                            setOpenCat("none");
                          }}
                          desc="Paquímetro, trena, micrômetro, incerteza ±mm e calibração multi-ref"
                        />
                      </>
                    )}
                  </div>
                )}

                {/* 6. GRUPO: CHAPA METÁLICA */}
                {openCat === "chapa" && (
                  <div className="flex flex-col gap-1 font-mono text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-slate-900/90 p-2 border border-slate-800">
                      <span className="text-[11px] text-slate-300 font-bold">Espessura:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={0.1}
                          min={0.2}
                          max={30}
                          value={thickness}
                          onChange={(e) => onThicknessChange(Number(e.target.value) || 1)}
                          className="w-14 rounded-lg bg-slate-800 px-1.5 py-0.5 text-center font-bold text-red-400 outline-none"
                        />
                        <span className="text-slate-400 text-[10px]">mm</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid="chamfer-chp-parametric-sheet-btn"
                      onClick={() => {
                        triggerHaptic("selection");
                        dispatchChamferParametricPanel("sheet");
                        setOpenCat("none");
                      }}
                      style={{
                        backgroundColor: "var(--chamfer-accent)",
                        borderColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10.5px] font-bold transition hover:brightness-110 cursor-pointer"
                      title="Abrir Gaveta de Chapa Metálica (BA/OSSB/BD, Abas A/B, Tabela de Dobras e DXF Inside-Out)"
                    >
                      <Layers className="size-3.5 shrink-0" />
                      <span>Chapa & DXF Inside-Out</span>
                    </button>

                    <FlyoutItem
                      label="Modelar Flanges (Abas)"
                      icon={Layers}
                      onClick={() => {
                        onOpenFlanges();
                        setOpenCat("none");
                      }}
                      desc="Adicionar abas e dobras na borda"
                    />
                    <FlyoutItem
                      label="Converter para Linha de Dobra"
                      icon={FoldHorizontal}
                      onClick={() => {
                        onConvertToBend();
                        setOpenCat("none");
                      }}
                      desc="Transforma seleção em vinco/dobra"
                    />
                    <FlyoutItem
                      label="Aplicar Alívio de Canto"
                      icon={Sparkles}
                      onClick={() => {
                        onApplyRelief();
                        setOpenCat("none");
                      }}
                      desc="Alívio circular/retangular para prensagem"
                    />
                    <FlyoutItem
                      label="Planificação (Flat Pattern)"
                      icon={ArrowRightLeft}
                      onClick={() => {
                        onPlanificar();
                        setOpenCat("none");
                      }}
                      desc="Desenvolvimento de chapa para corte CNC"
                    />
                    <FlyoutItem
                      label="Desdobrar (Unfold)"
                      icon={FoldHorizontal}
                      onClick={() => {
                        onUnfold();
                        setOpenCat("none");
                      }}
                      desc="Visualizar peça aberta"
                    />
                    <FlyoutItem
                      label="Dobrar (Fold)"
                      icon={Layers}
                      onClick={() => {
                        onFold();
                        setOpenCat("none");
                      }}
                      desc="Recolher peça em 3D"
                    />
                    <FlyoutItem
                      label="Loft 3D (Transição Redonda/Quadrada)"
                      keyLabel="LOFT"
                      icon={Boxes}
                      active={tool === "loft_3d"}
                      onClick={() => handleSelectTool("loft_3d", "chapa")}
                      badge="3D"
                      desc="Cria transição cônica ou multisseção 3D entre perfis em diferentes Z"
                    />
                  </div>
                )}

                {/* 7. GRUPO: ESTRUTURAS / TUBOS / MODELAGEM DIRETA 3D */}
                {openCat === "estruturas" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Shell / Tubo Metalon Oco (3D)"
                      icon={Boxes}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("tap");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "shell_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Remove faces das pontas e cria tubo estrutural Metalon com parede exata"
                    />
                    <FlyoutItem
                      label="Corte em Meia-Esquadria 45° (Rotate Axis)"
                      icon={Scissors}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("tap");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "rotate_axis_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Inclina face da extremidade a 45° ou -45° para encaixe e mão-francesa"
                    />
                    <FlyoutItem
                      label="Fillet / Chamfer 3D em Arestas"
                      icon={Sparkles}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("tap");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "fillet_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Arredonda as 4 quinas verticais de colunas ou chanfra bordas 3D"
                    />
                    <FlyoutItem
                      label="Offset Face (Esticar / Expandir Face)"
                      icon={CornerDownRight}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("tap");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "offset_face_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Empurra ou puxa faces de topo, base ou expande sapatas em +25 mm"
                    />
                    <FlyoutItem
                      label="Move / Rotate 3D + Pivô & Copy: ON"
                      icon={Move}
                      badge="3D"
                      onClick={() => {
                        triggerHaptic("tap");
                        onModeChange("3d");
                        window.dispatchEvent(
                          new CustomEvent("chamfer-select-direct-3d-tool", {
                            detail: { tool: "transform_3d" },
                          }),
                        );
                        setOpenCat("none");
                      }}
                      desc="Translada/rotaciona corpos 3D com pivô móvel magnético e cópia rápida"
                    />
                    <FlyoutItem
                      label="Símbolo de Solda Industrial"
                      icon={Flame}
                      onClick={() => {
                        triggerHaptic("tap");
                        setOpenCat("none");
                      }}
                      desc="Chanfro em V, cordão contínuo ou intermitente"
                    />
                  </div>
                )}

                {/* 8. GRUPO: DETALHES */}
                {openCat === "detalhes" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Furo Industrial (Ø)"
                      icon={CircleDot}
                      onClick={() => {
                        onAddHole();
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Furo passante, cego ou escareado"
                    />
                    <FlyoutItem
                      label="Rosca Técnica (M)"
                      icon={Sliders}
                      onClick={() => {
                        triggerHaptic("tap");
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Especificação de rosca métrica"
                    />
                    <FlyoutItem
                      label="Padrão Linear (Array)"
                      icon={Copy}
                      onClick={() => {
                        onArrayLinear();
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Repetição de furos em linha X/Y"
                    />
                    <FlyoutItem
                      label="Padrão Circular (Array Polar)"
                      icon={RotateCw}
                      onClick={() => {
                        onArrayPolar();
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Furação distribuída em flange circular (PCD)"
                    />
                    {onOpenRevEngCategory && (
                      <>
                        <div className="my-1 h-px bg-slate-800" />
                        <FlyoutItem
                          label="Bancada de Furos e Cadeias (Eng. Rev.)"
                          keyLabel="PCD"
                          icon={CircleDot}
                          onClick={() => {
                            triggerHaptic("selection");
                            onOpenRevEngCategory("furos_cadeias", "D");
                            if (!isPinned) setOpenCat("none");
                          }}
                          desc="Cálculo de PCD por corda, furos por borda/parede e rasgos"
                        />
                      </>
                    )}
                  </div>
                )}
        </div>
      )}

      {/* POPOVER FLUTUANTE DE COR TÉCNICA & CAMADA (COR) */}
      {openCat === "cor" && setActiveLayer && (
        <div
          className="absolute left-full ml-1.5 sm:ml-2 bottom-2 z-50 w-56 rounded-2xl border p-2.5 shadow-2xl backdrop-blur-lg animate-in fade-in zoom-in-95 duration-150 font-mono text-xs"
          style={{
            backgroundColor: "var(--chamfer-popover-bg)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
              Cor & Camada (COR)
            </span>
            <button
              type="button"
              onClick={() => setOpenCat("none")}
              className="rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {[
              { id: "corte", label: "Corte Principal", color: isDark ? "#F8FAFC" : "#0F172A" },
              { id: "dobra", label: "Linha de Dobra", color: "#EC4899" },
              { id: "recorte", label: "Recorte Interno", color: "#F59E0B" },
              { id: "marcacao", label: "Marcação / Gravação", color: "#3B82F6" },
            ].map((lay) => {
              const isCurrent = activeLayer === lay.id && !activeStrokeColor;
              return (
                <button
                  key={lay.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setActiveLayer(lay.id);
                    onSelectStrokeColor?.(null, lay.id);
                    setOpenCat("none");
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-[10.5px] font-bold transition-colors cursor-pointer",
                    isCurrent
                      ? "border-rose-500/60 bg-rose-500/15 text-rose-300"
                      : "border-transparent bg-slate-900/70 text-slate-300 hover:bg-slate-800",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full border border-white/25"
                      style={{ backgroundColor: lay.color }}
                    />
                    <span>{lay.label}</span>
                  </div>
                  {isCurrent && <Check className="size-3.5 text-rose-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

function FlyoutItem({
  label,
  keyLabel,
  icon: Icon,
  active,
  disabled,
  badge,
  onClick,
  desc,
}: {
  label: string;
  keyLabel?: string;
  icon: typeof Minus;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
  desc?: string;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={
        disabled
          ? { color: "var(--chamfer-text-muted)" }
          : active
            ? {
                backgroundColor: "var(--chamfer-accent-soft)",
                borderColor: "var(--chamfer-accent-border)",
                color: "var(--chamfer-accent)",
              }
            : {
                borderColor: "transparent",
                color: "var(--chamfer-text-primary)",
              }
      }
      className={cn(
        "group flex w-full flex-col rounded-xl border px-2.5 py-1.5 text-left transition-colors cursor-pointer",
        disabled && "opacity-35 cursor-not-allowed",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            style={{
              color: active ? "var(--chamfer-accent)" : "var(--chamfer-text-secondary)",
            }}
            className="size-3.5"
          />
          <span className="font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              style={{
                backgroundColor: "var(--chamfer-accent-soft)",
                color: "var(--chamfer-accent)",
              }}
              className="rounded px-1 py-0.2 text-[8px] font-bold uppercase"
            >
              {badge}
            </span>
          )}
          {keyLabel && (
            <kbd
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-secondary)",
              }}
              className="rounded border px-1.5 py-0.2 text-[9px] font-bold"
            >
              {keyLabel}
            </kbd>
          )}
        </div>
      </div>
      {desc && (
        <span
          style={{ color: "var(--chamfer-text-secondary)" }}
          className="mt-0.5 text-[9px] line-clamp-1"
        >
          {desc}
        </span>
      )}
    </button>
  );
}
