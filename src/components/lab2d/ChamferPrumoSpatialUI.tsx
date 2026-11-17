/**
 * CALDRA — CHAMFER CAD (2D SKETCH & CAD 3D)
 * INTERFACE ESPACIAL "PRUMO" (ZERO BARRAS DE FERRAMENTAS)
 *
 * Arquitetura Espacial Mobile-First com 5 Instrumentos Suspensos de Vidro Fosco:
 *  - Instrumento 1: O "Núcleo" (56×56px, área de toque 64px, anel graduado 15°/45°)
 *                   + Satélites [ ↶ ] [ ↷ ] [ ⊞ ]
 *                   + Leque Concêntrico de 2 Arcos (R1 = 112px Grupos, R2 = 182px Ferramentas)
 *  - Instrumento 2: A "Mesa de Ferramentas & Busca" (Busca + CHAMFER INTENT + ★ Favoritos + ⏱ Recentes + Grade 9 Grupos)
 *  - Instrumento 3: "Ilha de Comando" Superior Esquerda + Cartão Flutuante "✦ Hub" + "Controle de Vista" Superior Direito
 *  - Instrumento 4: "Satélite de Precisão" (Grade 2×3 "▾ Precisão") + "Cápsula Flutuante do DATUM"
 *  - Instrumento 5: Etiqueta & Chip de Medidas Ao Vivo (60 FPS + Numpad Próprio) + Menu de Contexto Inteligente por Entidade
 *  - Sistema "Respiro" (opacidade 25% nos instrumentos periféricos durante traçado/gesto no canvas, restauração em 250ms)
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  LayoutGrid,
  Sparkles,
  Compass,
  Crosshair,
  MousePointer2,
  Hand,
  Minus,
  PenLine,
  Circle as CircleIcon,
  Square,
  Hexagon,
  Egg,
  Dot,
  Type,
  Box,
  Boxes,
  RotateCw,
  Move,
  Copy,
  FlipHorizontal,
  Maximize2,
  CornerDownRight,
  Maximize,
  Split,
  Combine,
  Divide,
  Grid,
  Magnet,
  Check,
  Layers,
  FoldHorizontal,
  ArrowRightLeft,
  X,
  Sliders,
  Disc,
  Flame,
  AlignCenter,
  FileText,
  Activity,
  Eye,
  Scissors,
  Ruler,
  CircleDot,
  ScanEye,
  Download,
  Sun,
  Moon,
  Search,
  Star,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Anchor,
  ClipboardList,
  Pin,
  Calculator,
} from "lucide-react";
import type { Tool } from "./Lab2DEditor";
import type { Entity } from "@/lib/lab2d/core";
import type { Vec2 } from "@/lib/geometry/types";
import type { DimKind } from "@/lib/lab2d/dimensions";
import type { CursorOffsetMode, LoupeHudMode } from "@/lib/lab2d/cadInteractionHub";
import type { DirectModeling3DTool } from "@/lib/lab2d/cadDirectModeling3D";
import type { EdgeMode } from "@/lib/lab2d/isoViewController";
import {
  UI_NAME,
  type ChamferUiShellMode,
  type PrumoHandSide,
  PRUMO_HAND_STORAGE_KEY,
  PRUMO_FAVORITES_STORAGE_KEY,
  PRUMO_RECENTS_STORAGE_KEY,
  computePrumoCoreCenter,
  computeConcentricArcLayout,
  resolvePolarFanHit,
  resolvePrumoSelectionContextActions,
  computePrumoContextCapsulePosition,
} from "@/lib/lab2d/prumoEngine";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";

/* ============================================================================
 * ERROR BOUNDARY DA CASCA "PRUMO" (REVERSÃO AUTOMÁTICA PARA "COMPACT")
 * ============================================================================ */

interface PrumoErrorBoundaryProps {
  onFallbackToCompact: () => void;
  children: React.ReactNode;
}

interface PrumoErrorBoundaryState {
  hasError: boolean;
}

export class PrumoErrorBoundary extends React.Component<
  PrumoErrorBoundaryProps,
  PrumoErrorBoundaryState
> {
  constructor(props: PrumoErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PrumoErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[CHAMFER ${UI_NAME}] Revertendo automaticamente para Compacta:`, error);
    this.props.onFallbackToCompact();
  }

  override render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

/* ============================================================================
 * CATÁLOGO COMPLETO DE GRUPOS E FERRAMENTAS (100% PARIDADE — ZERO ÓRFÃOS)
 * ============================================================================ */

export type PrumoGroupId =
  | "fav"
  | "selecionar"
  | "criar"
  | "modificar"
  | "precisao"
  | "medir"
  | "chapa"
  | "estruturas"
  | "detalhes"
  | "cor";

export interface PrumoToolItem {
  id: string;
  code3: string;
  label: string;
  groupId: Exclude<PrumoGroupId, "fav">;
  icon: typeof Minus;
  shortcut?: string;
  colorHex?: string;
  action: () => void;
  isActive?: boolean;
}

export interface ChamferPrumoSpatialUIProps {
  isDark: boolean;
  viewportWidth: number;
  viewportHeight: number;
  isLandscape: boolean;
  uiShellMode: ChamferUiShellMode;
  onChangeUiShellMode: (mode: ChamferUiShellMode) => void;

  // Identidade e Projeto
  projectName: string;
  saveStatus: "salvo" | "pendente" | "salvando" | "erro";
  onManualSave: () => void;
  onLeaveEditor: () => void;

  // Ambiente 2D / 3D e Vista
  activeMode: "2d" | "3d" | "flanges";
  onSelect2D: () => void;
  onSelect3D: () => void;
  drawingProjection: "orthographic" | "isometric";
  onSetDrawingProjection: (mode: "orthographic" | "isometric") => void;
  isOrbitToolActive: boolean;
  isOrbitTilted: boolean;
  onToggleOrbitTool: (next?: boolean) => void;
  onSelectViewPreset: (preset: "top" | "front" | "right" | "iso") => void;
  renderStyle3D: EdgeMode;
  onChangeRenderStyle3D: (style: EdgeMode) => void;
  onFitView: () => void;
  onFitWorkspace: () => void;

  // Ferramenta Ativa & Histórico
  tool: Tool;
  onPickTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  // Seleção e Ações de Modificação 2D
  selectedEntities: Entity[];
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onMoveSelection: () => void;
  onCopySelection: () => void;
  onRotateSelection: () => void;
  onMirrorSelection: () => void;
  onScaleSelection: () => void;
  onStretchSelection: () => void;
  onBreakSelection: () => void;
  onJoinSelection: () => void;
  onExplodeSelection: () => void;
  onDivideSelection: () => void;
  onCenterSelection: () => void;
  onArrayLinear: () => void;
  onArrayPolar: () => void;
  onOverkillClean: () => void;
  onBoolean2D: (op: "union" | "subtract" | "intersect") => void;
  onCreateHatch: () => void;

  // Precisão, DATUM, Âncora/Marcos, Mira e Lupa
  cursor: Vec2;
  basePoint: Vec2 | null;
  pendingCount: number;
  snapOn: boolean;
  onToggleSnap: () => void;
  orthoOn: boolean;
  onToggleOrtho: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  grid: number;
  onChangeGrid: (mm: number) => void;
  thickness: number;
  onChangeThickness: (mm: number) => void;
  cursorOffsetMode: CursorOffsetMode;
  onToggleCursorOffsetMode: () => void;
  loupeMode: LoupeHudMode;
  onCycleLoupeMode: () => void;
  interactionGuideMode: "off" | "purple_ref" | "blue_line";
  onToggleAnchorReferenceMode: () => void;
  temporaryOrigin: { p: Vec2; label: string } | null;
  onSetDatumAtCursor: () => void;
  onClearDatum: () => void;
  onCreateDatumLineDelta: (axis: "dx" | "dy") => void;

  // Medição, Chapa, Estruturas, Detalhes e Cor/Camada
  dimKind: DimKind;
  onPickDimKind: (k: DimKind) => void;
  onConvertToBend: () => void;
  onAddHole: () => void;
  onPlanificar: () => void;
  onOpenFlanges: () => void;
  onApplyRelief: () => void;
  onUnfold: () => void;
  onFold: () => void;
  onOpenPieceBuilder: () => void;
  activeLayer: string;
  activeStrokeColor: string | null;
  onSelectColorAndLayer: (hex: string | null, layerId?: string) => void;

  // Ações de Hub (VISION, INTENT, CORTE/BOM, Exportar, Camadas, Inspetor, Tema, Foco)
  onOpenVision: () => void;
  onOpenIntent: (initialPrompt?: string) => void;
  onOpenBom: () => void;
  onOpenExport: () => void;
  onOpenLayers: () => void;
  onOpenInspector: () => void;
  onToggleTheme: () => void;
  focus: boolean;
  onToggleFocus: () => void;
  onToggleBenchCalc?: () => void;
  isBenchCalcOpen?: boolean;
  isBenchCalcFloating?: boolean;

  // Modelagem Direta 3D (quando activeMode === "3d")
  activeDirect3DTool?: DirectModeling3DTool;
  onSelectDirect3DTool?: (tool: DirectModeling3DTool) => void;

  // Criação / Edição Numérica Ao Vivo (60 FPS) & Estado "Respiro"
  view: { k: number; tx: number; ty: number };
  isDrawingOrGesturing: boolean;
  onCommitNumericInput: (params: {
    lengthMm?: number | undefined;
    angleDeg?: number | undefined;
    widthMm?: number | undefined;
    heightMm?: number | undefined;
    radiusMm?: number | undefined;
    diameterMm?: number | undefined;
    editSelectedEntity?: boolean | undefined;
  }) => void;
  /** Quando true, anima o retorno de PRUMO -> COMPACTA (Ancoragem de Bancada, 380ms) */
  isExitingToCompact?: boolean;
}

const TOOL_SHORT_CODES: Record<string, string> = {
  select: "SEL",
  node: "NÓS",
  pan: "PAN",
  line: "LIN",
  construction_line: "INF",
  polyline: "POL",
  circle: "CIR",
  arc: "ARC",
  rect: "RET",
  rrect: "RND",
  polygon: "HEX",
  ellipse: "ELI",
  spline: "SPL",
  freehand: "LIV",
  slot: "OBL",
  point: "PTO",
  text: "TXT",
  offset: "OFS",
  trim: "TRM",
  smart_trim: "TRM",
  extend: "EXT",
  fillet: "FIL",
  chamfer: "CHF",
  divide: "DIV",
  measure: "MED",
  dim: "COT",
  loft_3d: "LFT",
};

export function ChamferPrumoSpatialUI({
  isDark,
  viewportWidth,
  viewportHeight,
  isLandscape,
  uiShellMode,
  onChangeUiShellMode,
  projectName,
  saveStatus,
  onManualSave,
  onLeaveEditor,
  activeMode,
  onSelect2D,
  onSelect3D,
  drawingProjection,
  onSetDrawingProjection,
  isOrbitToolActive,
  isOrbitTilted,
  onToggleOrbitTool,
  onSelectViewPreset,
  renderStyle3D,
  onChangeRenderStyle3D,
  onFitView,
  onFitWorkspace,
  tool,
  onPickTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedEntities,
  onClearSelection,
  onDeleteSelection,
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
  onArrayLinear,
  onArrayPolar,
  onOverkillClean,
  onBoolean2D,
  onCreateHatch,
  cursor,
  basePoint,
  pendingCount,
  snapOn,
  onToggleSnap,
  orthoOn,
  onToggleOrtho,
  showGrid,
  onToggleGrid,
  grid,
  onChangeGrid,
  thickness,
  onChangeThickness,
  cursorOffsetMode,
  onToggleCursorOffsetMode,
  loupeMode,
  onCycleLoupeMode,
  interactionGuideMode,
  onToggleAnchorReferenceMode,
  temporaryOrigin,
  onSetDatumAtCursor,
  onClearDatum,
  onCreateDatumLineDelta,
  dimKind,
  onPickDimKind,
  onConvertToBend,
  onAddHole,
  onPlanificar,
  onOpenFlanges,
  onApplyRelief,
  onUnfold,
  onFold,
  onOpenPieceBuilder,
  activeLayer,
  activeStrokeColor,
  onSelectColorAndLayer,
  onOpenVision,
  onOpenIntent,
  onOpenBom,
  onOpenExport,
  onOpenLayers,
  onOpenInspector,
  onToggleTheme,
  focus,
  onToggleFocus,
  onToggleBenchCalc,
  isBenchCalcOpen = false,
  isBenchCalcFloating = false,
  activeDirect3DTool = "select_3d",
  onSelectDirect3DTool,
  view,
  isDrawingOrGesturing,
  onCommitNumericInput,
  isExitingToCompact = false,
}: ChamferPrumoSpatialUIProps) {
  // 1. Posição do Polegar (Esquerda padrão em Paisagem, Direita padrão em Retrato, com override manual)
  const [handOverride, setHandOverride] = useState<PrumoHandSide | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem(PRUMO_HAND_STORAGE_KEY);
      if (saved === "left" || saved === "right") return saved;
    } catch {
      // ignore
    }
    return null;
  });

  const effectiveHandSide: PrumoHandSide =
    handOverride ?? (isLandscape ? "left" : "right");

  const handleSetHandSide = (side: PrumoHandSide) => {
    triggerHaptic("selection");
    setHandOverride(side);
    try {
      window.localStorage.setItem(PRUMO_HAND_STORAGE_KEY, side);
    } catch {
      // ignore
    }
  };

  // 2. Estado do Leque Concêntrico de 2 Arcos, Mesa de Ferramentas, Hub, Vista e Satélite
  const [fanOpen, setFanOpen] = useState(false);
  const [fanCollapsing, setFanCollapsing] = useState(false);
  const [choreoEntered, setChoreoEntered] = useState(false);
  const [ringRotated45, setRingRotated45] = useState(false);
  const [calibrationPulseActive, setCalibrationPulseActive] = useState(false);

  // Coreografia de entrada COMPACTA -> PRUMO (380ms cubic-bezier(0.22, 1, 0.36, 1) + giro de 45° do anel + pulso óptico #38BDF8 de 28px em 350ms)
  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      setChoreoEntered(true);
    });
    const settleTimer = window.setTimeout(() => {
      setRingRotated45(true);
      setCalibrationPulseActive(true);
    }, 320);
    const pulseEndTimer = window.setTimeout(() => {
      setCalibrationPulseActive(false);
    }, 700);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      window.clearTimeout(pulseEndTimer);
    };
  }, []);

  // Se PRUMO estiver saindo para COMPACTA e o Leque estiver aberto, recolhe em 140ms para o Núcleo
  useEffect(() => {
    if (isExitingToCompact && fanOpen) {
      setFanCollapsing(true);
      const t = window.setTimeout(() => {
        setFanOpen(false);
        setFanCollapsing(false);
      }, 140);
      return () => window.clearTimeout(t);
    }
  }, [isExitingToCompact, fanOpen]);

  const handleRequestSwitchToCompact = () => {
    triggerHaptic("selection");
    setHubOpen(false);
    setViewPopoverOpen(false);
    setPrecisionGridOpen(false);
    if (fanOpen) {
      setFanCollapsing(true);
      window.setTimeout(() => {
        setFanOpen(false);
        setFanCollapsing(false);
        onChangeUiShellMode("compact");
      }, 140);
    } else {
      onChangeUiShellMode("compact");
    }
  };

  const [activeGroupId, setActiveGroupId] = useState<PrumoGroupId>("criar");
  const [innerScrollRad, setInnerScrollRad] = useState(0);
  const [outerScrollRad, setOuterScrollRad] = useState(0);
  const [highlightedInnerIdx, setHighlightedInnerIdx] = useState<number | null>(null);
  const [highlightedOuterIdx, setHighlightedOuterIdx] = useState<number | null>(null);

  const [toolTableOpen, setToolTableOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hubOpen, setHubOpen] = useState(false);
  const [viewPopoverOpen, setViewPopoverOpen] = useState(false);
  const [precisionGridOpen, setPrecisionGridOpen] = useState(false);

  // 3. Favoritos (★) e Recentes (⏱ últimas 4 ferramentas)
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return ["line", "rect", "circle", "trim", "offset", "dim"];
    try {
      const raw = window.localStorage.getItem(PRUMO_FAVORITES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return ["line", "rect", "circle", "trim", "offset", "dim"];
  });

  const [recentIds, setRecentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return ["line", "rect", "circle", "trim"];
    try {
      const raw = window.localStorage.getItem(PRUMO_RECENTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4);
      }
    } catch {
      // ignore
    }
    return ["line", "rect", "circle", "trim"];
  });

  const lastUsedToolRef = useRef<Tool>("line");

  const recordToolUsage = (itemId: string, toolVal?: Tool) => {
    if (toolVal && toolVal !== "select") {
      lastUsedToolRef.current = toolVal;
    }
    setRecentIds((prev) => {
      const next = [itemId, ...prev.filter((x) => x !== itemId)].slice(0, 4);
      try {
        window.localStorage.setItem(PRUMO_RECENTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const toggleFavoriteTool = (itemId: string) => {
    triggerHaptic("selection");
    setFavoriteIds((prev) => {
      const exists = prev.includes(itemId);
      const next = exists ? prev.filter((x) => x !== itemId) : [...prev, itemId];
      try {
        window.localStorage.setItem(PRUMO_FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 4. Sistema "Respiro" (opacidade 25% ao desenhar/arrastar no canvas, restaurando 250ms após soltar)
  const [respiroActive, setRespiroActive] = useState(false);
  const respiroTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isDrawingOrGesturing) {
      if (respiroTimerRef.current) {
        window.clearTimeout(respiroTimerRef.current);
        respiroTimerRef.current = null;
      }
      setRespiroActive(true);
      setFanOpen(false);
      setHubOpen(false);
      setViewPopoverOpen(false);
      setPrecisionGridOpen(false);
    } else if (respiroActive) {
      respiroTimerRef.current = window.setTimeout(() => {
        setRespiroActive(false);
        respiroTimerRef.current = null;
      }, 250);
    }
    return () => {
      if (respiroTimerRef.current) {
        window.clearTimeout(respiroTimerRef.current);
      }
    };
  }, [isDrawingOrGesturing, respiroActive]);

  // 5. Teclado Numérico Próprio (Numpad do PRUMO para Medidas Ao Vivo e Edição de Entidade)
  const [numpadState, setNumpadState] = useState<{
    open: boolean;
    field: "length" | "angle" | "width" | "height" | "radius" | "diameter";
    label: string;
    buffer: string;
    fresh: boolean;
    editSelected: boolean;
  }>({
    open: false,
    field: "length",
    label: "Comprimento L (mm)",
    buffer: "100",
    fresh: true,
    editSelected: false,
  });

  const openPrumoNumpad = (
    field: "length" | "angle" | "width" | "height" | "radius" | "diameter",
    label: string,
    initialValue: number,
    editSelected = false,
  ) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    setNumpadState({
      open: true,
      field,
      label,
      buffer: String(Number((Number.isFinite(initialValue) ? initialValue : 10).toFixed(2))),
      fresh: true,
      editSelected,
    });
  };

  const handleNumpadKey = (key: string) => {
    triggerHaptic("tap");
    setNumpadState((prev) => {
      if (key === "CLEAR") return { ...prev, buffer: "0", fresh: false };
      if (key === "BACK") {
        if (prev.fresh) return { ...prev, buffer: "0", fresh: false };
        const next = prev.buffer.slice(0, -1);
        return { ...prev, buffer: next === "" || next === "-" ? "0" : next, fresh: false };
      }
      if (key === "±") {
        if (prev.buffer === "0" || prev.buffer === "") return prev;
        return {
          ...prev,
          buffer: prev.buffer.startsWith("-") ? prev.buffer.slice(1) : `-${prev.buffer}`,
          fresh: false,
        };
      }
      if (key === "." || key === ",") {
        if (prev.fresh) return { ...prev, buffer: "0.", fresh: false };
        if (prev.buffer.includes(".")) return prev;
        return { ...prev, buffer: `${prev.buffer}.`, fresh: false };
      }
      if (prev.fresh || prev.buffer === "0") {
        return { ...prev, buffer: key, fresh: false };
      }
      return { ...prev, buffer: `${prev.buffer}${key}`, fresh: false };
    });
  };

  const handleConfirmNumpad = () => {
    const val = Number.parseFloat(numpadState.buffer.replace(",", "."));
    if (Number.isFinite(val)) {
      triggerHaptic("success");
      AudioManager.play("ui_select");
      onCommitNumericInput({
        lengthMm: numpadState.field === "length" ? Math.max(0.1, val) : undefined,
        angleDeg: numpadState.field === "angle" ? val : undefined,
        widthMm: numpadState.field === "width" ? Math.max(0.1, val) : undefined,
        heightMm: numpadState.field === "height" ? Math.max(0.1, val) : undefined,
        radiusMm: numpadState.field === "radius" ? Math.max(0.1, val) : undefined,
        diameterMm: numpadState.field === "diameter" ? Math.max(0.2, val) : undefined,
        editSelectedEntity: numpadState.editSelected,
      });
    }
    setNumpadState((prev) => ({ ...prev, open: false }));
  };

  // 6. Catálogo Completo de Grupos e Ferramentas Reais (SEL · CRI · MOD · PRE · MED · CHP · EST · DET · COR)
  const allToolsCatalog: PrumoToolItem[] = useMemo(() => {
    const activate2DTool = (t: Tool, id: string) => {
      triggerHaptic("selection");
      AudioManager.play("ui_select");
      onPickTool(t);
      recordToolUsage(id, t);
      window.setTimeout(() => setFanOpen(false), 180);
      setToolTableOpen(false);
    };

    const runAction = (id: string, fn: () => void) => {
      triggerHaptic("action");
      AudioManager.play("ui_select");
      fn();
      recordToolUsage(id);
      window.setTimeout(() => setFanOpen(false), 180);
      setToolTableOpen(false);
    };

    return [
      // GRUPO 1: SELECIONAR (SEL)
      {
        id: "select",
        code3: "SEL",
        label: "Selecionar (Ponteiro)",
        groupId: "selecionar",
        icon: MousePointer2,
        shortcut: "V",
        isActive: tool === "select",
        action: () => activate2DTool("select", "select"),
      },
      {
        id: "node",
        code3: "NÓS",
        label: "Editar Nós / Vértices",
        groupId: "selecionar",
        icon: Crosshair,
        shortcut: "N",
        isActive: tool === "node",
        action: () => activate2DTool("node", "node"),
      },
      {
        id: "pan",
        code3: "PAN",
        label: "Mover Tela (Pan)",
        groupId: "selecionar",
        icon: Hand,
        shortcut: "H",
        isActive: tool === "pan",
        action: () => activate2DTool("pan", "pan"),
      },
      {
        id: "clear_sel",
        code3: "LMP",
        label: "Limpar Seleção",
        groupId: "selecionar",
        icon: X,
        shortcut: "ESC",
        action: () => runAction("clear_sel", onClearSelection),
      },

      // GRUPO 2: CRIAR (CRI)
      {
        id: "line",
        code3: "LIN",
        label: "Linha Técnica",
        groupId: "criar",
        icon: Minus,
        shortcut: "L",
        isActive: tool === "line",
        action: () => activate2DTool("line", "line"),
      },
      {
        id: "polyline",
        code3: "POL",
        label: "Polilinha Composta",
        groupId: "criar",
        icon: PenLine,
        shortcut: "P",
        isActive: tool === "polyline",
        action: () => activate2DTool("polyline", "polyline"),
      },
      {
        id: "rect",
        code3: "RET",
        label: "Retângulo Paramétrico",
        groupId: "criar",
        icon: Square,
        shortcut: "R",
        isActive: tool === "rect",
        action: () => activate2DTool("rect", "rect"),
      },
      {
        id: "circle",
        code3: "CIR",
        label: "Círculo Técnico",
        groupId: "criar",
        icon: CircleIcon,
        shortcut: "C",
        isActive: tool === "circle",
        action: () => activate2DTool("circle", "circle"),
      },
      {
        id: "arc",
        code3: "ARC",
        label: "Arco 3 Pontos",
        groupId: "criar",
        icon: Compass,
        shortcut: "A",
        isActive: tool === "arc",
        action: () => activate2DTool("arc", "arc"),
      },
      {
        id: "polygon",
        code3: "HEX",
        label: "Polígono / Sextavado",
        groupId: "criar",
        icon: Hexagon,
        shortcut: "G",
        isActive: tool === "polygon",
        action: () => activate2DTool("polygon", "polygon"),
      },
      {
        id: "slot",
        code3: "OBL",
        label: "Rasgo Oblongo (Slot)",
        groupId: "criar",
        icon: Disc,
        isActive: tool === "slot",
        action: () => activate2DTool("slot", "slot"),
      },
      {
        id: "ellipse",
        code3: "ELI",
        label: "Elipse",
        groupId: "criar",
        icon: Egg,
        isActive: tool === "ellipse",
        action: () => activate2DTool("ellipse", "ellipse"),
      },
      {
        id: "spline",
        code3: "SPL",
        label: "Curva Suave (Spline)",
        groupId: "criar",
        icon: Activity,
        isActive: tool === "spline",
        action: () => activate2DTool("spline", "spline"),
      },
      {
        id: "freehand",
        code3: "LIV",
        label: "Desenho Livre (Vetorial)",
        groupId: "criar",
        icon: PenLine,
        isActive: tool === "freehand",
        action: () => activate2DTool("freehand", "freehand"),
      },
      {
        id: "construction_line",
        code3: "INF",
        label: "Linha Infinita (XLine)",
        groupId: "criar",
        icon: ArrowRightLeft,
        isActive: tool === "construction_line",
        action: () => activate2DTool("construction_line", "construction_line"),
      },
      {
        id: "point",
        code3: "PTO",
        label: "Ponto de Punção",
        groupId: "criar",
        icon: Dot,
        isActive: tool === "point",
        action: () => activate2DTool("point", "point"),
      },
      {
        id: "text",
        code3: "TXT",
        label: "Texto / Nota Técnica",
        groupId: "criar",
        icon: Type,
        shortcut: "T",
        isActive: tool === "text",
        action: () => activate2DTool("text", "text"),
      },

      // GRUPO 3: MODIFICAR (MOD)
      {
        id: "trim",
        code3: "TRM",
        label: "Aparar Inteligente (Trim)",
        groupId: "modificar",
        icon: Scissors,
        shortcut: "TR",
        isActive: tool === "trim" || tool === "smart_trim",
        action: () => activate2DTool("trim", "trim"),
      },
      {
        id: "extend",
        code3: "EXT",
        label: "Estender até Aresta",
        groupId: "modificar",
        icon: CornerDownRight,
        shortcut: "EX",
        isActive: tool === "extend",
        action: () => activate2DTool("extend", "extend"),
      },
      {
        id: "offset",
        code3: "OFS",
        label: "Deslocamento Paralelo (Offset)",
        groupId: "modificar",
        icon: Copy,
        shortcut: "O",
        isActive: tool === "offset",
        action: () => activate2DTool("offset", "offset"),
      },
      {
        id: "fillet",
        code3: "FIL",
        label: "Raio de Canto (Fillet)",
        groupId: "modificar",
        icon: Sparkles,
        shortcut: "F",
        isActive: tool === "fillet",
        action: () => activate2DTool("fillet", "fillet"),
      },
      {
        id: "chamfer",
        code3: "CHF",
        label: "Chanfro Técnico (Chamfer)",
        groupId: "modificar",
        icon: Split,
        shortcut: "CH",
        isActive: tool === "chamfer",
        action: () => activate2DTool("chamfer", "chamfer"),
      },
      {
        id: "move_sel",
        code3: "MOV",
        label: "Mover Seleção",
        groupId: "modificar",
        icon: Move,
        shortcut: "M",
        action: () => runAction("move_sel", onMoveSelection),
      },
      {
        id: "copy_sel",
        code3: "COP",
        label: "Copiar Seleção",
        groupId: "modificar",
        icon: Copy,
        shortcut: "CO",
        action: () => runAction("copy_sel", onCopySelection),
      },
      {
        id: "rotate_sel",
        code3: "GIR",
        label: "Girar Seleção",
        groupId: "modificar",
        icon: RotateCw,
        shortcut: "RO",
        action: () => runAction("rotate_sel", onRotateSelection),
      },
      {
        id: "mirror_sel",
        code3: "ESP",
        label: "Espelhar Seleção",
        groupId: "modificar",
        icon: FlipHorizontal,
        shortcut: "MI",
        action: () => runAction("mirror_sel", onMirrorSelection),
      },
      {
        id: "scale_sel",
        code3: "ESC",
        label: "Escalar Seleção",
        groupId: "modificar",
        icon: Maximize2,
        shortcut: "SC",
        action: () => runAction("scale_sel", onScaleSelection),
      },
      {
        id: "stretch_sel",
        code3: "EST",
        label: "Esticar (Stretch)",
        groupId: "modificar",
        icon: ArrowRightLeft,
        action: () => runAction("stretch_sel", onStretchSelection),
      },
      {
        id: "join_sel",
        code3: "UNI",
        label: "Unir Polilinhas (Join)",
        groupId: "modificar",
        icon: Combine,
        shortcut: "J",
        action: () => runAction("join_sel", onJoinSelection),
      },
      {
        id: "break_sel",
        code3: "QBR",
        label: "Quebrar Segmento",
        groupId: "modificar",
        icon: Split,
        action: () => runAction("break_sel", onBreakSelection),
      },
      {
        id: "explode_sel",
        code3: "EXP",
        label: "Explodir Contorno",
        groupId: "modificar",
        icon: Boxes,
        shortcut: "X",
        action: () => runAction("explode_sel", onExplodeSelection),
      },
      {
        id: "overkill",
        code3: "OVK",
        label: "Limpar Linhas Duplicadas",
        groupId: "modificar",
        icon: Check,
        action: () => runAction("overkill", onOverkillClean),
      },

      // GRUPO 4: PRECISÃO (PRE)
      {
        id: "snap_toggle",
        code3: "SNP",
        label: `Snap Magnético (${snapOn ? "ON" : "OFF"})`,
        groupId: "precisao",
        icon: Magnet,
        shortcut: "F3",
        isActive: snapOn,
        action: () => runAction("snap_toggle", onToggleSnap),
      },
      {
        id: "ortho_toggle",
        code3: "ORT",
        label: `Trava Ortogonal (${orthoOn ? "ON" : "OFF"})`,
        groupId: "precisao",
        icon: Crosshair,
        shortcut: "F8",
        isActive: orthoOn,
        action: () => runAction("ortho_toggle", onToggleOrtho),
      },
      {
        id: "grid_toggle",
        code3: "GRD",
        label: `Grade ${grid}mm (${showGrid ? "ON" : "OFF"})`,
        groupId: "precisao",
        icon: Grid,
        shortcut: "F7",
        isActive: showGrid,
        action: () => runAction("grid_toggle", onToggleGrid),
      },
      {
        id: "datum_set",
        code3: "DTM",
        label: "Fixar DATUM [0,0] no Cursor",
        groupId: "precisao",
        icon: Pin,
        isActive: Boolean(temporaryOrigin),
        action: () => runAction("datum_set", onSetDatumAtCursor),
      },
      {
        id: "anchor_ref",
        code3: "ÂNC",
        label: "Âncora (X',Y') & Marcos A–E",
        groupId: "precisao",
        icon: Anchor,
        isActive: interactionGuideMode === "purple_ref",
        action: () => runAction("anchor_ref", onToggleAnchorReferenceMode),
      },
      {
        id: "mira_offset",
        code3: "MIR",
        label: `Mira Deslocada 55px (${cursorOffsetMode === "offset" ? "ON" : "OFF"})`,
        groupId: "precisao",
        icon: Crosshair,
        isActive: cursorOffsetMode === "offset",
        action: () => runAction("mira_offset", onToggleCursorOffsetMode),
      },
      {
        id: "loupe_cycle",
        code3: "LUP",
        label: `Lupa de Precisão (${loupeMode.toUpperCase()})`,
        groupId: "precisao",
        icon: Search,
        isActive: loupeMode !== "off",
        action: () => runAction("loupe_cycle", onCycleLoupeMode),
      },
      {
        id: "center_sel",
        code3: "CNT",
        label: "Centralizar Peça na Chapa",
        groupId: "precisao",
        icon: AlignCenter,
        action: () => runAction("center_sel", onCenterSelection),
      },

      // GRUPO 5: MEDIR (MED)
      {
        id: "measure",
        code3: "MED",
        label: "Trena / Medir Distância e Ângulo",
        groupId: "medir",
        icon: Ruler,
        shortcut: "DI",
        isActive: tool === "measure",
        action: () => activate2DTool("measure", "measure"),
      },
      {
        id: "dim_aligned",
        code3: "COT",
        label: "Cota Linear Alinhada",
        groupId: "medir",
        icon: Ruler,
        shortcut: "D",
        isActive: tool === "dim" && dimKind === "aligned",
        action: () =>
          runAction("dim_aligned", () => {
            onPickDimKind("aligned");
          }),
      },
      {
        id: "dim_horiz",
        code3: "CTH",
        label: "Cota Horizontal",
        groupId: "medir",
        icon: ArrowRightLeft,
        isActive: tool === "dim" && dimKind === "horizontal",
        action: () =>
          runAction("dim_horiz", () => {
            onPickDimKind("horizontal");
          }),
      },
      {
        id: "dim_vert",
        code3: "CTV",
        label: "Cota Vertical",
        groupId: "medir",
        icon: Ruler,
        isActive: tool === "dim" && dimKind === "vertical",
        action: () =>
          runAction("dim_vert", () => {
            onPickDimKind("vertical");
          }),
      },
      {
        id: "dim_radius",
        code3: "CTR",
        label: "Cota de Raio (R)",
        groupId: "medir",
        icon: CircleDot,
        isActive: tool === "dim" && dimKind === "radius",
        action: () =>
          runAction("dim_radius", () => {
            onPickDimKind("radius");
          }),
      },
      {
        id: "dim_diam",
        code3: "CTØ",
        label: "Cota de Diâmetro (Ø)",
        groupId: "medir",
        icon: CircleIcon,
        isActive: tool === "dim" && dimKind === "diameter",
        action: () =>
          runAction("dim_diam", () => {
            onPickDimKind("diameter");
          }),
      },
      {
        id: "dim_angle",
        code3: "CT∠",
        label: "Cota Angular (°)",
        groupId: "medir",
        icon: Compass,
        isActive: tool === "dim" && dimKind === "angle",
        action: () =>
          runAction("dim_angle", () => {
            onPickDimKind("angle");
          }),
      },

      // GRUPO 6: CHAPA (CHP)
      {
        id: "flanges",
        code3: "FLG",
        label: "Abas e Flanges de Chapa",
        groupId: "chapa",
        icon: Layers,
        action: () => runAction("flanges", onOpenFlanges),
      },
      {
        id: "bend_line",
        code3: "DOB",
        label: "Converter Linha em Dobra",
        groupId: "chapa",
        icon: FoldHorizontal,
        action: () => runAction("bend_line", onConvertToBend),
      },
      {
        id: "relief",
        code3: "ALV",
        label: "Alívio de Canto (Corner Relief)",
        groupId: "chapa",
        icon: Scissors,
        action: () => runAction("relief", onApplyRelief),
      },
      {
        id: "unfold",
        code3: "DSD",
        label: "Desdobrar Chapa (Unfold)",
        groupId: "chapa",
        icon: Maximize2,
        action: () => runAction("unfold", onUnfold),
      },
      {
        id: "fold",
        code3: "DBR",
        label: "Dobrar em 3D (Fold)",
        groupId: "chapa",
        icon: Box,
        action: () => runAction("fold", onFold),
      },
      {
        id: "planificar",
        code3: "PLN",
        label: "Planificar Chapa (Fator K)",
        groupId: "chapa",
        icon: FileText,
        action: () => runAction("planificar", onPlanificar),
      },

      // GRUPO 7: ESTRUTURAS (EST)
      {
        id: "piece_builder",
        code3: "PRF",
        label: "Perfis Tubulares e Metalon",
        groupId: "estruturas",
        icon: Boxes,
        action: () => runAction("piece_builder", onOpenPieceBuilder),
      },
      {
        id: "bool_union",
        code3: "UNI",
        label: "União Booleana de Perfis",
        groupId: "estruturas",
        icon: Combine,
        action: () => runAction("bool_union", () => onBoolean2D("union")),
      },
      {
        id: "bool_sub",
        code3: "SUB",
        label: "Subtração Booleana / Recorte",
        groupId: "estruturas",
        icon: Split,
        action: () => runAction("bool_sub", () => onBoolean2D("subtract")),
      },
      {
        id: "cad_3d_enter",
        code3: "3D",
        label: "Modelagem Direta CAD 3D",
        groupId: "estruturas",
        icon: Box,
        action: () => runAction("cad_3d_enter", onSelect3D),
      },
      {
        id: "bom_corte",
        code3: "BOM",
        label: "Lista de Corte & BOM Estrutural",
        groupId: "estruturas",
        icon: ClipboardList,
        action: () => runAction("bom_corte", onOpenBom),
      },

      // GRUPO 8: DETALHES (DET)
      {
        id: "hole_add",
        code3: "FUR",
        label: "Inserir Furo / Furação ISO",
        groupId: "detalhes",
        icon: CircleDot,
        action: () => runAction("hole_add", onAddHole),
      },
      {
        id: "array_linear",
        code3: "ARL",
        label: "Padrão Linear (Array Retangular)",
        groupId: "detalhes",
        icon: Grid,
        action: () => runAction("array_linear", onArrayLinear),
      },
      {
        id: "array_polar",
        code3: "ARP",
        label: "Padrão Circular (Array Polar)",
        groupId: "detalhes",
        icon: Disc,
        action: () => runAction("array_polar", onArrayPolar),
      },
      {
        id: "divide_seg",
        code3: "DIV",
        label: "Dividir Vão em N Partes",
        groupId: "detalhes",
        icon: Divide,
        action: () => runAction("divide_seg", onDivideSelection),
      },
      {
        id: "hatch_create",
        code3: "HAC",
        label: "Hachura Técnica ABNT",
        groupId: "detalhes",
        icon: Layers,
        action: () => runAction("hatch_create", onCreateHatch),
      },

      // GRUPO 9: COR & CAMADAS (COR)
      {
        id: "cor_corte",
        code3: "CRT",
        label: "Camada Corte Externo",
        groupId: "cor",
        icon: Flame,
        colorHex: isDark ? "#F8FAFC" : "#0F172A",
        isActive: activeLayer === "corte" && !activeStrokeColor,
        action: () => runAction("cor_corte", () => onSelectColorAndLayer(null, "corte")),
      },
      {
        id: "cor_recorte",
        code3: "REC",
        label: "Camada Recorte Interno (Âmbar)",
        groupId: "cor",
        icon: Scissors,
        colorHex: "#F59E0B",
        isActive: activeLayer === "recorte",
        action: () => runAction("cor_recorte", () => onSelectColorAndLayer("#F59E0B", "recorte")),
      },
      {
        id: "cor_dobra",
        code3: "DOB",
        label: "Camada Linha de Dobra (Magenta)",
        groupId: "cor",
        icon: FoldHorizontal,
        colorHex: "#EC4899",
        isActive: activeLayer === "dobra",
        action: () => runAction("cor_dobra", () => onSelectColorAndLayer("#EC4899", "dobra")),
      },
      {
        id: "cor_marcacao",
        code3: "MRC",
        label: "Camada Marcação / Gravação (Azul)",
        groupId: "cor",
        icon: PenLine,
        colorHex: "#3B82F6",
        isActive: activeLayer === "marcacao",
        action: () => runAction("cor_marcacao", () => onSelectColorAndLayer("#3B82F6", "marcacao")),
      },
      {
        id: "cor_construcao",
        code3: "AUX",
        label: "Camada Construção / Guia (Ciano)",
        groupId: "cor",
        icon: Compass,
        colorHex: "#06B6D4",
        isActive: activeLayer === "construcao",
        action: () => runAction("cor_construcao", () => onSelectColorAndLayer("#06B6D4", "construcao")),
      },
      {
        id: "layers_panel",
        code3: "CAM",
        label: "Gerenciador de Camadas",
        groupId: "cor",
        icon: Layers,
        action: () => runAction("layers_panel", onOpenLayers),
      },
    ];
  }, [
    tool,
    snapOn,
    orthoOn,
    showGrid,
    grid,
    temporaryOrigin,
    interactionGuideMode,
    cursorOffsetMode,
    loupeMode,
    dimKind,
    activeLayer,
    activeStrokeColor,
    isDark,
  ]);

  // Grupos Canônicos do Arco Interno (★ Recentes/Favoritos + SEL · CRI · MOD · PRE · MED · CHP · EST · DET · COR)
  const innerGroups: {
    id: PrumoGroupId;
    short: string;
    label: string;
    icon: typeof Minus;
  }[] = useMemo(
    () => [
      { id: "fav", short: "★", label: "Favoritos & Recentes", icon: Star },
      { id: "selecionar", short: "SEL", label: "Selecionar", icon: MousePointer2 },
      { id: "criar", short: "CRI", label: "Criar", icon: PenLine },
      { id: "modificar", short: "MOD", label: "Modificar", icon: Scissors },
      { id: "precisao", short: "PRE", label: "Precisão", icon: Crosshair },
      { id: "medir", short: "MED", label: "Medir & Cotar", icon: Ruler },
      { id: "chapa", short: "CHP", label: "Chapa Metálica", icon: Layers },
      { id: "estruturas", short: "EST", label: "Estruturas", icon: Boxes },
      { id: "detalhes", short: "DET", label: "Detalhes & Furos", icon: CircleDot },
      { id: "cor", short: "COR", label: "Cores & Camadas", icon: Flame },
    ],
    [],
  );

  // Ferramentas exibidas no Arco Externo para o grupo ativo no Arco Interno
  const activeOuterTools: PrumoToolItem[] = useMemo(() => {
    if (activeMode === "3d" && onSelectDirect3DTool) {
      const direct3DItems: PrumoToolItem[] = [
        {
          id: "3d_select",
          code3: "SEL",
          label: "Selecionar 3D",
          groupId: "selecionar",
          icon: MousePointer2,
          isActive: activeDirect3DTool === "select_3d",
          action: () => {
            onSelectDirect3DTool("select_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_extrude",
          code3: "EXT",
          label: "Extrudar 3D",
          groupId: "criar",
          icon: Box,
          isActive: activeDirect3DTool === "extrude_3d",
          action: () => {
            onSelectDirect3DTool("extrude_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_move",
          code3: "MOV",
          label: "Mover / Girar 3D",
          groupId: "modificar",
          icon: Move,
          isActive: activeDirect3DTool === "transform_3d",
          action: () => {
            onSelectDirect3DTool("transform_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_fillet",
          code3: "FIL",
          label: "Fillet / Chamfer 3D",
          groupId: "modificar",
          icon: Sparkles,
          isActive: activeDirect3DTool === "fillet_3d" || activeDirect3DTool === "chamfer_3d",
          action: () => {
            onSelectDirect3DTool("fillet_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_shell",
          code3: "SHL",
          label: "Shell / Casca 3D",
          groupId: "chapa",
          icon: Layers,
          isActive: activeDirect3DTool === "shell_3d",
          action: () => {
            onSelectDirect3DTool("shell_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_array",
          code3: "ARR",
          label: "Array 3D / Quadro 45°",
          groupId: "estruturas",
          icon: Grid,
          isActive: activeDirect3DTool === "array_3d",
          action: () => {
            onSelectDirect3DTool("array_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_hole",
          code3: "FUR",
          label: "Furo 3D ISO",
          groupId: "detalhes",
          icon: CircleDot,
          isActive: activeDirect3DTool === "hole_3d",
          action: () => {
            onSelectDirect3DTool("hole_3d");
            setFanOpen(false);
          },
        },
        {
          id: "3d_offset_face",
          code3: "FAC",
          label: "Offset Face 3D",
          groupId: "modificar",
          icon: CornerDownRight,
          isActive: activeDirect3DTool === "offset_face_3d",
          action: () => {
            onSelectDirect3DTool("offset_face_3d");
            setFanOpen(false);
          },
        },
      ];
      if (activeGroupId === "fav") return direct3DItems;
    }

    if (activeGroupId === "fav") {
      const combinedIds = Array.from(new Set([...recentIds, ...favoriteIds]));
      const items = combinedIds
        .map((id) => allToolsCatalog.find((t) => t.id === id))
        .filter((x): x is PrumoToolItem => Boolean(x));
      return items.length > 0 ? items : allToolsCatalog.slice(0, 6);
    }
    return allToolsCatalog.filter((t) => t.groupId === activeGroupId);
  }, [activeGroupId, activeMode, activeDirect3DTool, allToolsCatalog, favoriteIds, recentIds]);

  // Reseta rolagem do arco externo ao trocar de grupo
  useEffect(() => {
    setOuterScrollRad(0);
  }, [activeGroupId]);

  // 7. Cálculos Trigonométricos do Núcleo e dos 2 Arcos Concêntricos
  const coreCenter = useMemo(
    () =>
      computePrumoCoreCenter({
        viewportWidth,
        viewportHeight,
        handSide: effectiveHandSide,
        coreSizePx: 56,
        marginPx: 20,
      }),
    [viewportWidth, viewportHeight, effectiveHandSide],
  );

  const innerArcLayout = useMemo(
    () =>
      computeConcentricArcLayout({
        centerX: coreCenter.x,
        centerY: coreCenter.y,
        handSide: effectiveHandSide,
        viewportWidth,
        viewportHeight,
        arcKind: "inner",
        itemCount: innerGroups.length,
        scrollAngleRad: innerScrollRad,
      }),
    [coreCenter.x, coreCenter.y, effectiveHandSide, viewportWidth, viewportHeight, innerGroups.length, innerScrollRad],
  );

  const outerArcLayout = useMemo(
    () =>
      computeConcentricArcLayout({
        centerX: coreCenter.x,
        centerY: coreCenter.y,
        handSide: effectiveHandSide,
        viewportWidth,
        viewportHeight,
        arcKind: "outer",
        itemCount: activeOuterTools.length,
        scrollAngleRad: outerScrollRad,
      }),
    [coreCenter.x, coreCenter.y, effectiveHandSide, viewportWidth, viewportHeight, activeOuterTools.length, outerScrollRad],
  );

  // 8. Gesto do Núcleo (Toque Simples, Duplo Toque, Toque Longo 500ms e Gesto de Especialista Pressionar-Deslizar-Soltar)
  const coreGestureRef = useRef<{
    isDown: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    hasDraggedOut: boolean;
    longPressTriggered: boolean;
    longPressTimer: number | null;
    lastTapTimestamp: number;
  }>({
    isDown: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    hasDraggedOut: false,
    longPressTriggered: false,
    longPressTimer: null,
    lastTapTimestamp: 0,
  });

  const handleCorePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const g = coreGestureRef.current;
    if (g.longPressTimer) window.clearTimeout(g.longPressTimer);

    g.isDown = true;
    g.pointerId = e.pointerId;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.hasDraggedOut = false;
    g.longPressTriggered = false;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    g.longPressTimer = window.setTimeout(() => {
      if (g.isDown && !g.hasDraggedOut) {
        g.longPressTriggered = true;
        triggerHaptic("action");
        AudioManager.play("ui_toggle_open");
        setFanOpen(false);
        setToolTableOpen(true);
      }
    }, 500);
  };

  const handleCorePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = coreGestureRef.current;
    if (!g.isDown) return;

    const distFromStart = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
    if (distFromStart > 14 && !g.longPressTriggered) {
      if (g.longPressTimer) {
        window.clearTimeout(g.longPressTimer);
        g.longPressTimer = null;
      }
      if (!g.hasDraggedOut) {
        g.hasDraggedOut = true;
        if (!fanOpen) {
          setFanOpen(true);
          triggerHaptic("selection");
        }
      }

      const hit = resolvePolarFanHit({
        centerX: coreCenter.x,
        centerY: coreCenter.y,
        pointerX: e.clientX,
        pointerY: e.clientY,
        handSide: effectiveHandSide,
        innerArc: innerArcLayout,
        outerArc: outerArcLayout,
      });

      if (hit.zone === "inner_arc" && hit.matchedIndex !== null) {
        const grp = innerGroups[hit.matchedIndex];
        if (grp && grp.id !== activeGroupId) {
          triggerHaptic("tap");
          setActiveGroupId(grp.id);
        }
        setHighlightedInnerIdx(hit.matchedIndex);
        setHighlightedOuterIdx(null);
      } else if (hit.zone === "outer_arc" && hit.matchedIndex !== null) {
        if (highlightedOuterIdx !== hit.matchedIndex) {
          triggerHaptic("tap");
        }
        setHighlightedOuterIdx(hit.matchedIndex);
      } else {
        setHighlightedOuterIdx(null);
      }
    }
  };

  const handleCorePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const g = coreGestureRef.current;
    if (g.longPressTimer) {
      window.clearTimeout(g.longPressTimer);
      g.longPressTimer = null;
    }

    try {
      if (g.pointerId !== null && e.currentTarget.hasPointerCapture(g.pointerId)) {
        e.currentTarget.releasePointerCapture(g.pointerId);
      }
    } catch {
      // ignore
    }

    if (!g.isDown) return;
    g.isDown = false;

    if (g.longPressTriggered) {
      setHighlightedInnerIdx(null);
      setHighlightedOuterIdx(null);
      return;
    }

    if (g.hasDraggedOut) {
      // Se soltou sobre uma ferramenta do Arco Externo, ativa imediatamente e recolhe o Leque!
      if (highlightedOuterIdx !== null && activeOuterTools[highlightedOuterIdx]) {
        activeOuterTools[highlightedOuterIdx]!.action();
      }
      setHighlightedInnerIdx(null);
      setHighlightedOuterIdx(null);
      return;
    }

    // Verifica Duplo Toque Rápido (< 280ms) para repetir a última ferramenta utilizada
    const now = performance.now();
    if (now - g.lastTapTimestamp < 280) {
      g.lastTapTimestamp = 0;
      triggerHaptic("action");
      AudioManager.play("ui_select");
      onPickTool(lastUsedToolRef.current);
      setFanOpen(false);
      return;
    }

    g.lastTapTimestamp = now;
    triggerHaptic("tap");
    setFanOpen((prev) => !prev);
  };

  // Arraste de Rolagem Orbital nos Arcos (Interno e Externo)
  const arcScrollDragRef = useRef<{
    arc: "inner" | "outer" | null;
    startAngleRad: number;
    initialScrollRad: number;
    hasMoved: boolean;
  }>({
    arc: null,
    startAngleRad: 0,
    initialScrollRad: 0,
    hasMoved: false,
  });

  const computePointerPolarAngle = (clientX: number, clientY: number) => {
    const sx = effectiveHandSide === "left" ? 1 : -1;
    const dx = (clientX - coreCenter.x) * sx;
    const dy = coreCenter.y - clientY;
    return Math.atan2(dy, dx);
  };

  const handleArcScrollPointerDown = (
    arc: "inner" | "outer",
    e: React.PointerEvent<HTMLElement>,
  ) => {
    e.stopPropagation();
    arcScrollDragRef.current = {
      arc,
      startAngleRad: computePointerPolarAngle(e.clientX, e.clientY),
      initialScrollRad: arc === "inner" ? innerScrollRad : outerScrollRad,
      hasMoved: false,
    };
  };

  const handleArcScrollPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = arcScrollDragRef.current;
    if (!d.arc) return;
    const currentAngle = computePointerPolarAngle(e.clientX, e.clientY);
    const deltaAngle = currentAngle - d.startAngleRad;
    if (Math.abs(deltaAngle) > 0.04) {
      d.hasMoved = true;
      const nextScroll = d.initialScrollRad - deltaAngle;
      if (d.arc === "inner") {
        setInnerScrollRad(Math.max(0, Math.min(innerArcLayout.maxScrollAngleRad, nextScroll)));
      } else {
        setOuterScrollRad(Math.max(0, Math.min(outerArcLayout.maxScrollAngleRad, nextScroll)));
      }
    }
  };

  const handleArcScrollPointerUp = () => {
    arcScrollDragRef.current.arc = null;
  };

  // 9. Estética de Vidro Fosco Fiel aos Temas Claro e Escuro (Seção 4.3 — Ardósia Acetinado no Modo Escuro)
  const glassSurfaceStyle: React.CSSProperties = isDark
    ? {
        backgroundColor: "rgba(27, 36, 54, 0.92)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderColor: "#2D3B55",
        color: "#E2E8F0",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.28)",
      }
    : {
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: "#CBD5E1",
        color: "#0F172A",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.10)",
      };

  const accentHex = activeStrokeColor || (isDark ? "#38BDF8" : "#0284C7");

  // Ícone e código de 3 letras da ferramenta ativa no centro do Núcleo
  const activeCatalogItem =
    allToolsCatalog.find((t) => t.id === tool) ?? allToolsCatalog[0]!;
  const ActiveToolIcon = activeCatalogItem.icon;
  const activeCode3 = TOOL_SHORT_CODES[tool] ?? activeCatalogItem.code3;

  // Rótulo compacto de vista no Controle Superior Direito
  const viewBadgeLabel =
    activeMode === "3d"
      ? renderStyle3D === "wireframe"
        ? "3D Arame"
        : "3D Sólido"
      : isOrbitToolActive || isOrbitTilted
        ? "Órbita 3D"
        : drawingProjection === "isometric"
          ? "Iso 2D"
          : "Sup 2D";

  // Medidas Ao Vivo (60 FPS) durante criação ou seleção
  const liveMetrics = useMemo(() => {
    if (pendingCount > 0 && basePoint) {
      const dx = cursor.x - basePoint.x;
      const dy = cursor.y - basePoint.y;
      const len = Math.hypot(dx, dy);
      const ang = (((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360;
      return {
        active: true,
        tag: activeCode3,
        len,
        dx: Math.abs(dx),
        dy: Math.abs(dy),
        ang,
      };
    }
    return null;
  }, [pendingCount, basePoint, cursor.x, cursor.y, activeCode3]);

  // Menu de Contexto Inteligente junto à Seleção
  const selectionContext = useMemo(() => {
    if (selectedEntities.length === 0 || pendingCount > 0) return null;
    const resolved = resolvePrumoSelectionContextActions(selectedEntities);
    const pos = computePrumoContextCapsulePosition({
      selectedEntities,
      view,
      viewportWidth,
      viewportHeight,
    });
    return {
      ...resolved,
      pos,
    };
  }, [selectedEntities, pendingCount, view, viewportWidth, viewportHeight]);

  const isNarrowScreen = viewportWidth < 370;
  const isCollapsedState = !choreoEntered || isExitingToCompact;
  const peripheralOpacityStyle: React.CSSProperties = {
    opacity: isExitingToCompact ? 0 : respiroActive ? 0.25 : choreoEntered ? 1 : 0,
    pointerEvents: respiroActive || isExitingToCompact ? "none" : "auto",
    transition:
      "opacity 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
  };

  // Modo Foco Total (⛶ Foco): esconde todos os instrumentos exceto o botão discreto de restauração (44px) no canto do Núcleo
  if (focus) {
    return (
      <div
        data-testid="chamfer-prumo-focus-restore-layer"
        className="pointer-events-none absolute inset-0 z-50 overflow-hidden select-none"
      >
        <button
          type="button"
          data-testid="chamfer-prumo-focus-restore-btn"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic("selection");
            onToggleFocus();
          }}
          style={{
            ...glassSurfaceStyle,
            left: effectiveHandSide === "left" ? 16 : undefined,
            right: effectiveHandSide === "right" ? 16 : undefined,
            bottom: 16,
          }}
          aria-label="Restaurar instrumentos da interface PRUMO"
          title="Sair do Modo Foco e restaurar instrumentos PRUMO"
          className="pointer-events-auto absolute flex size-11 items-center justify-center rounded-full border cursor-pointer active:scale-95 transition-transform"
        >
          <Maximize className="size-4 text-rose-500" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="chamfer-prumo-spatial-shell"
      data-ui-shell={UI_NAME}
      data-respiro={respiroActive ? "true" : "false"}
      data-choreo-state={isExitingToCompact ? "exiting" : choreoEntered ? "settled" : "entering"}
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden select-none"
    >
      {/* Keyframes da Onda de Calibração Óptica do Núcleo PRUMO (expande 28px em 350ms e desaparece) */}
      <style>{`
        @keyframes prumoOpticalCalibrationWave {
          0% {
            transform: scale(1);
            opacity: 0.92;
          }
          100% {
            transform: scale(2.0);
            opacity: 0;
          }
        }
      `}</style>

      {/* =====================================================================
          INSTRUMENTO 3.1 — ILHA DE COMANDO SUPERIOR ESQUERDA + CARTÃO "✦ HUB"
          top: 10px, left: 22px, height: 34px, max-width <= 55%
          ===================================================================== */}
      <div
        data-testid="prumo-top-left-island"
        style={{
          ...glassSurfaceStyle,
          ...peripheralOpacityStyle,
          top: 10,
          left: 22,
          height: 34,
          maxWidth: isNarrowScreen ? "58%" : "55%",
          transformOrigin: "left center",
          transform: isCollapsedState
            ? "translate3d(24px, -8px, 0) scaleX(1.12) scaleY(0.94)"
            : "translate3d(0, 0, 0) scaleX(1) scaleY(1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute flex items-center gap-1 rounded-full border px-2 font-mono text-[10px] overflow-x-auto scrollbar-none whitespace-nowrap"
      >
        {/* [ ← ] Sair */}
        <button
          type="button"
          data-testid="prumo-island-exit-btn"
          onClick={onLeaveEditor}
          aria-label="Sair do CHAMFER CAD"
          title="Voltar aos projetos"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-slate-500/15 cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
        </button>

        {/* ● Projeto (ponto verde = salvo; tocar salva na hora) */}
        <button
          type="button"
          data-testid="prumo-island-save-project-btn"
          onClick={() => {
            triggerHaptic("action");
            onManualSave();
          }}
          title={`Projeto: ${projectName} — Toque para salvar agora`}
          className="flex h-7 shrink-0 items-center gap-1 rounded-full px-1.5 font-bold hover:bg-slate-500/15 cursor-pointer"
        >
          <span
            className={cn(
              "size-2 rounded-full shrink-0",
              saveStatus === "erro"
                ? "bg-red-500"
                : saveStatus === "pendente" || saveStatus === "salvando"
                  ? "bg-amber-400"
                  : "bg-emerald-500",
            )}
          />
          {!isNarrowScreen && (
            <span className="max-w-[78px] truncate">{projectName}</span>
          )}
        </button>

        {/* [ 2D | 3D ] */}
        <div
          className={cn(
            "flex h-6 shrink-0 items-center rounded-full p-0.5 border",
            isDark ? "border-[#334361] bg-[#232E45]" : "border-slate-300 bg-slate-100",
          )}
        >
          <button
            type="button"
            data-testid="prumo-island-2d-btn"
            onClick={onSelect2D}
            className={cn(
              "h-5 rounded-full px-1.5 text-[9.5px] font-extrabold cursor-pointer transition-colors",
              activeMode === "2d"
                ? isDark
                  ? "bg-[rgba(14,165,233,0.22)] border border-[#38BDF8] text-[#F8FAFC]"
                  : "bg-rose-600 text-white"
                : isDark
                  ? "text-[#CBD5E1]"
                  : "text-slate-700",
            )}
          >
            2D
          </button>
          <button
            type="button"
            data-testid="prumo-island-3d-btn"
            onClick={onSelect3D}
            className={cn(
              "h-5 rounded-full px-1.5 text-[9.5px] font-extrabold cursor-pointer transition-colors",
              activeMode === "3d"
                ? isDark
                  ? "bg-[rgba(14,165,233,0.22)] border border-[#38BDF8] text-[#F8FAFC]"
                  : "bg-rose-600 text-white"
                : isDark
                  ? "text-[#CBD5E1]"
                  : "text-slate-700",
            )}
          >
            3D
          </button>
        </div>

        {/* [ ◫ Compacta ] — Volta para a UI Compacta com 1 toque e coreografia suave */}
        <button
          type="button"
          data-testid="prumo-island-switch-compact-btn"
          onClick={handleRequestSwitchToCompact}
          title="Voltar para a Interface Compacta com 1 toque"
          className={cn(
            "flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[9.5px] font-bold cursor-pointer transition-colors",
            isDark
              ? "border-[#334361] bg-[#232E45] text-[#E2E8F0] hover:border-[#38BDF8]"
              : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200",
          )}
        >
          <span>◫</span>
          <span className="hidden sm:inline">Compacta</span>
        </button>

        {/* [ 🧮 Calc ] — Mini-Calculadora de Bancada com Resgate Determinístico */}
        {activeMode === "2d" && onToggleBenchCalc && (
          <button
            type="button"
            data-testid="prumo-island-calc-btn"
            onClick={() => {
              triggerHaptic("selection");
              onToggleBenchCalc();
            }}
            title={
              isBenchCalcFloating
                ? "Resgatar Calculadora Flutuante para a Direita"
                : "Abrir / Fechar Mini-Calculadora Científica & Metalúrgica"
            }
            className={cn(
              "relative flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[9.5px] font-bold cursor-pointer transition-colors",
              isBenchCalcOpen
                ? isDark
                  ? "border-[#38BDF8] bg-[rgba(14,165,233,0.24)] text-[#7DD3FC]"
                  : "border-sky-600 bg-sky-600 text-white"
                : isDark
                  ? "border-[#334361] bg-[#232E45] text-[#E2E8F0] hover:border-[#38BDF8]"
                  : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200",
            )}
          >
            <Calculator className="size-3" />
            <span>Calc</span>
            {isBenchCalcOpen && isBenchCalcFloating && (
              <span className="size-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        )}

        {/* [ ✦ Hub ] */}
        <button
          type="button"
          data-testid="prumo-island-hub-btn"
          onClick={() => {
            triggerHaptic("selection");
            setHubOpen((v) => !v);
            setViewPopoverOpen(false);
            setPrecisionGridOpen(false);
          }}
          aria-expanded={hubOpen}
          title="Abrir Cartão Flutuante ✦ Hub (VISION, INTENT, CORTE/BOM, Exportar, Camadas, Tema, Mão)"
          className={cn(
            "flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[9.5px] font-extrabold cursor-pointer transition-colors",
            hubOpen
              ? isDark
                ? "border-[#38BDF8] bg-[rgba(14,165,233,0.22)] text-[#F8FAFC]"
                : "border-rose-500 bg-rose-600 text-white"
              : isDark
                ? "border-[#38BDF8] bg-[rgba(14,165,233,0.22)] text-[#7DD3FC] hover:brightness-110"
                : "border-sky-600/40 bg-sky-500/10 text-sky-800 hover:bg-sky-500/20",
          )}
        >
          <span>✦ Hub</span>
        </button>
      </div>

      {/* CARTÃO FLUTUANTE "✦ HUB" */}
      {hubOpen && (
        <div
          data-testid="prumo-hub-floating-card"
          style={{
            ...glassSurfaceStyle,
            top: 48,
            left: 22,
            width: Math.min(284, viewportWidth - 36),
            maxHeight: "calc(100vh - 102px)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-50 flex flex-col gap-1.5 overflow-y-auto scrollbar-none rounded-2xl border p-2.5 font-mono text-[10px]"
        >
          <div className="flex items-center justify-between border-b border-slate-500/20 pb-1.5">
            <span className="font-extrabold tracking-wider text-rose-500">
              ✦ CHAMFER {UI_NAME} HUB
            </span>
            <button
              type="button"
              onClick={() => setHubOpen(false)}
              className="rounded-lg p-1 hover:bg-slate-500/15 cursor-pointer"
              aria-label="Fechar Hub"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Seletor Instantâneo [ Compacta | PRUMO ] */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] opacity-80">Interface:</span>
            <div
              className={cn(
                "flex items-center rounded-lg border p-0.5",
                isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-100",
              )}
            >
              <button
                type="button"
                data-testid="prumo-hub-select-compact"
                onClick={handleRequestSwitchToCompact}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-bold cursor-pointer",
                  uiShellMode === "compact"
                    ? "bg-rose-600 text-white"
                    : " opacity-75 hover:opacity-100",
                )}
              >
                Compacta
              </button>
              <button
                type="button"
                data-testid="prumo-hub-select-prumo"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangeUiShellMode("prumo");
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-extrabold cursor-pointer",
                  uiShellMode === "prumo"
                    ? "bg-rose-600 text-white"
                    : "opacity-75 hover:opacity-100",
                )}
              >
                {UI_NAME}
              </button>
            </div>
          </div>

          {/* Posição do Polegar (Mão: Esquerda | Direita) */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] opacity-80">Mão (Núcleo):</span>
            <div
              className={cn(
                "flex items-center rounded-lg border p-0.5",
                isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-100",
              )}
            >
              <button
                type="button"
                data-testid="prumo-hub-hand-left"
                onClick={() => handleSetHandSide("left")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-bold cursor-pointer",
                  effectiveHandSide === "left"
                    ? "bg-sky-600 text-white"
                    : "opacity-75 hover:opacity-100",
                )}
              >
                Esquerda
              </button>
              <button
                type="button"
                data-testid="prumo-hub-hand-right"
                onClick={() => handleSetHandSide("right")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-bold cursor-pointer",
                  effectiveHandSide === "right"
                    ? "bg-sky-600 text-white"
                    : "opacity-75 hover:opacity-100",
                )}
              >
                Direita
              </button>
            </div>
          </div>

          {/* Módulos Inteligentes (VISION, INTENT, CORTE/BOM) */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              data-testid="prumo-hub-vision-btn"
              onClick={() => {
                setHubOpen(false);
                onOpenVision();
              }}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/15 py-2 text-[9.5px] font-bold text-sky-400 hover:bg-sky-500/25 cursor-pointer"
            >
              <ScanEye className="size-4" />
              <span>VISION</span>
            </button>
            <button
              type="button"
              data-testid="prumo-hub-intent-btn"
              onClick={() => {
                setHubOpen(false);
                onOpenIntent();
              }}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 py-2 text-[9.5px] font-bold text-amber-400 hover:bg-amber-500/25 cursor-pointer"
            >
              <Sparkles className="size-4" />
              <span>INTENT</span>
            </button>
            <button
              type="button"
              data-testid="prumo-hub-bom-btn"
              onClick={() => {
                setHubOpen(false);
                onOpenBom();
              }}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2 text-[9.5px] font-bold text-emerald-400 hover:bg-emerald-500/25 cursor-pointer"
            >
              <ClipboardList className="size-4" />
              <span>CORTE/BOM</span>
            </button>
          </div>

          {activeMode === "2d" && onToggleBenchCalc && (
            <button
              type="button"
              data-testid="prumo-hub-calc-btn"
              onClick={() => {
                setHubOpen(false);
                onToggleBenchCalc();
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 py-2 text-[9.5px] font-bold text-cyan-300 hover:bg-cyan-500/25 cursor-pointer"
            >
              <Calculator className="size-3.5" />
              <span>
                {isBenchCalcFloating
                  ? "Resgatar Calculadora de Bancada"
                  : "Calculadora Científica & Metalúrgica"}
              </span>
            </button>
          )}

          {/* Ações Rápidas do Hub */}
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              data-testid="prumo-hub-export-btn"
              onClick={() => {
                setHubOpen(false);
                onOpenExport();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900/70 hover:bg-slate-800"
                  : "border-slate-300 bg-slate-100 hover:bg-slate-200",
              )}
            >
              <Download className="size-3.5 text-sky-400 shrink-0" />
              <span>Exportar DXF</span>
            </button>
            <button
              type="button"
              data-testid="prumo-hub-layers-btn"
              onClick={() => {
                setHubOpen(false);
                onOpenLayers();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900/70 hover:bg-slate-800"
                  : "border-slate-300 bg-slate-100 hover:bg-slate-200",
              )}
            >
              <Layers className="size-3.5 text-purple-400 shrink-0" />
              <span>Camadas</span>
            </button>
            <button
              type="button"
              data-testid="prumo-hub-inspector-btn"
              onClick={() => {
                setHubOpen(false);
                onOpenInspector();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900/70 hover:bg-slate-800"
                  : "border-slate-300 bg-slate-100 hover:bg-slate-200",
              )}
            >
              <Sliders className="size-3.5 text-emerald-400 shrink-0" />
              <span>Inspetor Prop</span>
            </button>
            <button
              type="button"
              data-testid="prumo-hub-theme-btn"
              onClick={() => {
                onToggleTheme();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-900/70 hover:bg-slate-800"
                  : "border-slate-300 bg-slate-100 hover:bg-slate-200",
              )}
            >
              {isDark ? (
                <Sun className="size-3.5 text-amber-400 shrink-0" />
              ) : (
                <Moon className="size-3.5 text-slate-700 shrink-0" />
              )}
              <span>{isDark ? "Tema Claro" : "Tema Escuro"}</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="prumo-hub-focus-btn"
            onClick={() => {
              setHubOpen(false);
              onToggleFocus();
            }}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-[10px] font-bold cursor-pointer",
              isDark
                ? "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                : "border-rose-500/40 bg-rose-50 text-rose-700 hover:bg-rose-100",
            )}
          >
            <Maximize className="size-3.5" />
            <span>⛶ Modo Foco Total (100% Canvas)</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          INSTRUMENTO 3.2 — CONTROLE DE VISTA SUPERIOR DIREITO
          top: 10px, right: 14px, height: 34px: [ 🧭 Sup 2D ▾ | ⌖ ]
          ===================================================================== */}
      <div
        data-testid="prumo-top-right-view-pill"
        style={{
          ...glassSurfaceStyle,
          ...peripheralOpacityStyle,
          top: 10,
          right: 16,
          height: 34,
          transformOrigin: "right center",
          transform: isCollapsedState
            ? "translate3d(-24px, -8px, 0) scaleX(1.12) scaleY(0.94)"
            : "translate3d(0, 0, 0) scaleX(1) scaleY(1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute flex items-center gap-1 rounded-full border px-2 font-mono text-[10px]"
      >
        <button
          type="button"
          data-testid="prumo-view-dropdown-trigger"
          onClick={() => {
            triggerHaptic("tap");
            setViewPopoverOpen((v) => !v);
            setHubOpen(false);
            setPrecisionGridOpen(false);
          }}
          aria-expanded={viewPopoverOpen}
          title="Alternar Vista e Projeção (ORTO 2D, ISO 2D, ÓRBITA 3D, Vistas e Estilo)"
          className="flex h-7 items-center gap-1 rounded-full px-1.5 font-bold hover:bg-slate-500/15 cursor-pointer whitespace-nowrap"
        >
          <Compass className="size-3.5 text-sky-400 shrink-0" />
          <span>{viewBadgeLabel}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>

        <span className="h-3.5 w-px bg-slate-500/30" />

        <button
          type="button"
          data-testid="prumo-view-fit-btn"
          onClick={() => {
            triggerHaptic("action");
            onFitView();
          }}
          aria-label="Enquadrar peça na tela (Zoom Fit)"
          title="Enquadrar peça na tela (Zoom Fit)"
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-500/15 cursor-pointer"
        >
          <Crosshair className="size-3.5 text-emerald-400" />
        </button>
      </div>

      {/* POPOVER DE VISTA & PROJEÇÃO (ORTO 2D, ISO 2D, ÓRBITA 3D, Superior, Frontal, Lateral, Isométrica, Sólido/Arame) */}
      {viewPopoverOpen && (
        <div
          data-testid="prumo-view-popover"
          style={{
            ...glassSurfaceStyle,
            top: 50,
            right: 16,
            width: 236,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-50 flex flex-col gap-2 rounded-2xl border p-2.5 font-mono text-[10px]"
        >
          <div className="text-[9.5px] font-bold uppercase opacity-70">Projeção & Órbita</div>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => {
                onSetDrawingProjection("orthographic");
                onToggleOrbitTool(false);
                setViewPopoverOpen(false);
              }}
              className={cn(
                "rounded-lg border py-1.5 font-bold cursor-pointer",
                drawingProjection === "orthographic" && !isOrbitToolActive && !isOrbitTilted
                  ? "border-sky-400 bg-sky-500/20 text-sky-300"
                  : "border-slate-500/25 hover:bg-slate-500/10",
              )}
            >
              ORTO 2D
            </button>
            <button
              type="button"
              onClick={() => {
                onSetDrawingProjection("isometric");
                setViewPopoverOpen(false);
              }}
              className={cn(
                "rounded-lg border py-1.5 font-bold cursor-pointer",
                drawingProjection === "isometric"
                  ? "border-sky-400 bg-sky-500/20 text-sky-300"
                  : "border-slate-500/25 hover:bg-slate-500/10",
              )}
            >
              ISO 2D
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleOrbitTool(!isOrbitToolActive);
                setViewPopoverOpen(false);
              }}
              className={cn(
                "rounded-lg border py-1.5 font-bold cursor-pointer",
                isOrbitToolActive || isOrbitTilted
                  ? "border-rose-400 bg-rose-500/20 text-rose-300"
                  : "border-slate-500/25 hover:bg-slate-500/10",
              )}
            >
              ÓRBITA 3D
            </button>
          </div>

          <div className="text-[9.5px] font-bold uppercase opacity-70">Vistas Padrão</div>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ["top", "Superior"],
                ["front", "Frontal"],
                ["right", "Lateral"],
                ["iso", "Isométrica"],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelectViewPreset(id);
                  setViewPopoverOpen(false);
                }}
                className="rounded-lg border border-slate-500/25 py-1.5 font-bold hover:bg-slate-500/15 cursor-pointer"
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="text-[9.5px] font-bold uppercase opacity-70">Estilo 3D</div>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => {
                onChangeRenderStyle3D("shaded");
                setViewPopoverOpen(false);
              }}
              className={cn(
                "rounded-lg border py-1.5 font-mono text-[10px] font-bold uppercase cursor-pointer",
                renderStyle3D === "shaded"
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-500/25 hover:bg-slate-500/10",
              )}
            >
              SOMB
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeRenderStyle3D("shaded-edges");
                setViewPopoverOpen(false);
              }}
              className={cn(
                "rounded-lg border py-1.5 font-mono text-[10px] font-bold uppercase cursor-pointer",
                renderStyle3D === "shaded-edges"
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-500/25 hover:bg-slate-500/10",
              )}
            >
              SOMB+AR
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeRenderStyle3D("wireframe");
                setViewPopoverOpen(false);
              }}
              className={cn(
                "rounded-lg border py-1.5 font-mono text-[10px] font-bold uppercase cursor-pointer",
                renderStyle3D === "wireframe"
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-500/25 hover:bg-slate-500/10",
              )}
            >
              ARAME
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onFitWorkspace();
              setViewPopoverOpen(false);
            }}
            className="mt-0.5 rounded-lg border border-sky-500/40 bg-sky-500/15 py-1.5 font-bold text-sky-400 hover:bg-sky-500/25 cursor-pointer"
          >
            ⌖ Enquadrar Chapa Inteira
          </button>
        </div>
      )}

      {/* =====================================================================
          INSTRUMENTO 5.1 — ETIQUETA DE COMANDO & CHIP DE MEDIDAS AO VIVO (60 FPS)
          Sempre 100% nítido (mesmo durante o efeito Respiro!)
          ===================================================================== */}
      {liveMetrics && (
        <div
          data-testid="prumo-live-measurement-chip"
          style={{
            ...glassSurfaceStyle,
            top: 10,
            height: 26,
            fontSize: 11,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-full border px-3 font-mono font-bold tabular-nums whitespace-nowrap"
        >
          <span className="text-rose-500 font-extrabold">{liveMetrics.tag}</span>
          <span className="opacity-40">|</span>
          <button
            type="button"
            data-testid="prumo-live-length-btn"
            onClick={() => openPrumoNumpad("length", "Comprimento L (mm)", liveMetrics.len, false)}
            className="rounded px-1 hover:bg-sky-500/20 text-sky-400 cursor-pointer"
            title="Toque para digitar o comprimento exato no Numpad"
          >
            L:{liveMetrics.len.toFixed(1)}mm
          </button>
          <button
            type="button"
            data-testid="prumo-live-angle-btn"
            onClick={() => openPrumoNumpad("angle", "Ângulo ∠ (°)", liveMetrics.ang, false)}
            className="rounded px-1 hover:bg-amber-500/20 text-amber-400 cursor-pointer"
            title="Toque para digitar o ângulo exato no Numpad"
          >
            ∠:{liveMetrics.ang.toFixed(1)}°
          </button>
          <span className="hidden sm:inline opacity-75">
            ΔX:{liveMetrics.dx.toFixed(1)} ΔY:{liveMetrics.dy.toFixed(1)}
          </span>
        </div>
      )}

      {/* =====================================================================
          INSTRUMENTO 5.2 — MENU DE CONTEXTO INTELIGENTE JUNTO À SELEÇÃO
          Específico por tipo de geometria (Círculo/Arco, Retângulo/Polilinha, Linha)
          ===================================================================== */}
      {selectionContext && !respiroActive && (
        <div
          data-testid="prumo-selection-context-capsule"
          data-geometry-kind={selectionContext.geometryKind}
          style={{
            ...glassSurfaceStyle,
            left: selectionContext.pos.left,
            top: selectionContext.pos.top,
            height: 34,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-45 flex max-w-[calc(100vw-32px)] items-center gap-1 overflow-x-auto scrollbar-none rounded-full border px-2 font-mono text-[10px] font-bold whitespace-nowrap"
        >
          {selectionContext.actions.map((act) => (
            <button
              key={act.id}
              type="button"
              data-testid={`prumo-context-action-${act.id}`}
              onClick={() => {
                triggerHaptic("action");
                if (act.id === "edit_dim") {
                  const first = selectedEntities[0];
                  if (first?.type === "circle" || first?.type === "arc") {
                    openPrumoNumpad("diameter", "Diâmetro Ø (mm)", first.r * 2, true);
                  } else if (first?.type === "line") {
                    const len = Math.hypot(first.x2 - first.x1, first.y2 - first.y1);
                    openPrumoNumpad("length", "Comprimento L (mm)", len, true);
                  } else {
                    openPrumoNumpad("width", "Largura L (mm)", 100, true);
                  }
                } else if (act.id === "move") {
                  onMoveSelection();
                } else if (act.id === "copy") {
                  onCopySelection();
                } else if (act.id === "rotate") {
                  onRotateSelection();
                } else if (act.id === "mirror") {
                  onMirrorSelection();
                } else if (act.id === "trim") {
                  onPickTool("trim");
                } else if (act.id === "offset") {
                  onPickTool("offset");
                } else if (act.id === "array") {
                  onArrayLinear();
                } else if (act.id === "prop") {
                  onOpenInspector();
                } else if (act.id === "delete") {
                  onDeleteSelection();
                } else if (act.id === "clear") {
                  onClearSelection();
                }
              }}
              className={cn(
                "flex h-7 shrink-0 items-center rounded-full px-2 transition-colors cursor-pointer",
                act.id === "edit_dim"
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
                  : act.id === "prop"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : act.id === "delete"
                      ? "hover:bg-rose-500/20 text-rose-400"
                      : "hover:bg-slate-500/15",
              )}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}

      {/* =====================================================================
          INSTRUMENTO 4 — SATÉLITE DE PRECISÃO & CÁPSULA FLUTUANTE DO DATUM
          Canto inferior oposto ao Núcleo (bottom: 14px, guarda >= 16px)
          ===================================================================== */}
      {temporaryOrigin && (
        <div
          data-testid="prumo-datum-floating-capsule"
          style={{
            ...glassSurfaceStyle,
            ...peripheralOpacityStyle,
            bottom: 54,
            left: effectiveHandSide === "right" ? 16 : undefined,
            right: effectiveHandSide === "left" ? 16 : undefined,
            maxWidth: "calc(100vw - 32px)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute flex h-8 items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border px-2.5 font-mono text-[10px] font-bold tabular-nums whitespace-nowrap"
        >
          <span className="text-emerald-400 font-extrabold">DATUM [0,0]</span>
          <span>ΔX:{(cursor.x - temporaryOrigin.p.x).toFixed(1)}</span>
          <span>ΔY:{(cursor.y - temporaryOrigin.p.y).toFixed(1)}</span>
          <span>
            L:{Math.hypot(cursor.x - temporaryOrigin.p.x, cursor.y - temporaryOrigin.p.y).toFixed(1)}
          </span>
          <span>
            ∠:
            {(
              (((Math.atan2(
                -(cursor.y - temporaryOrigin.p.y),
                cursor.x - temporaryOrigin.p.x,
              ) *
                180) /
                Math.PI) +
                360) %
              360
            ).toFixed(0)}
            °
          </span>
          <button
            type="button"
            data-testid="prumo-datum-pin-btn"
            onClick={onSetDatumAtCursor}
            className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
            title="Reancorar DATUM na posição atual"
          >
            📌 Fixar
          </button>
          <button
            type="button"
            data-testid="prumo-datum-line-dx-btn"
            onClick={() => onCreateDatumLineDelta("dx")}
            className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-sky-300 hover:bg-sky-500/30 cursor-pointer"
          >
            + Linha ΔX
          </button>
          <button
            type="button"
            data-testid="prumo-datum-line-dy-btn"
            onClick={() => onCreateDatumLineDelta("dy")}
            className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-sky-300 hover:bg-sky-500/30 cursor-pointer"
          >
            + Linha ΔY
          </button>
          <button
            type="button"
            data-testid="prumo-datum-clear-btn"
            onClick={onClearDatum}
            className="rounded-full px-1 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
            title="Remover DATUM"
          >
            ✕
          </button>
        </div>
      )}

      {/* SATÉLITE DE TELEMETRIA E PRECISÃO (bottom: 14px, canto oposto ao Núcleo) */}
      <div
        data-testid="prumo-precision-satellite"
        style={{
          ...glassSurfaceStyle,
          ...peripheralOpacityStyle,
          bottom: 14,
          left: effectiveHandSide === "right" ? 16 : undefined,
          right: effectiveHandSide === "left" ? 16 : undefined,
          height: 32,
          maxWidth: isNarrowScreen ? "calc(100vw - 180px)" : "calc(100vw - 210px)",
          transformOrigin: effectiveHandSide === "left" ? "right bottom" : "left bottom",
          transform: isCollapsedState
            ? "translate3d(0, 14px, 0) scaleX(1.12) scaleY(0.9)"
            : "translate3d(0, 0, 0) scaleX(1) scaleY(1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute flex items-center gap-1 overflow-x-auto scrollbar-none rounded-full border px-2.5 font-mono text-[10px] tabular-nums whitespace-nowrap"
      >
        {!isNarrowScreen && (
          <>
            <span className={cn("font-bold", isDark ? "text-[#F1F5F9]" : "opacity-90")}>
              X:{cursor.x.toFixed(1)} Y:{cursor.y.toFixed(1)}
            </span>
            <span className="opacity-30">|</span>
          </>
        )}

        <button
          type="button"
          data-testid="prumo-satellite-snap-btn"
          onClick={() => {
            triggerHaptic("selection");
            onToggleSnap();
          }}
          className={cn(
            "flex h-6 items-center gap-1 rounded-full px-2 font-bold cursor-pointer border",
            snapOn
              ? isDark
                ? "bg-[rgba(14,165,233,0.22)] border-[#38BDF8] text-[#7DD3FC]"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
              : isDark
                ? "bg-[#232E45] border-[#334361] text-[#E2E8F0] opacity-75"
                : "border-transparent opacity-50",
          )}
        >
          <span>SNAP</span>
          <span className={cn("size-1.5 rounded-full", snapOn ? (isDark ? "bg-[#38BDF8]" : "bg-emerald-500") : "bg-slate-500")} />
        </button>

        <button
          type="button"
          data-testid="prumo-satellite-ortho-btn"
          onClick={() => {
            triggerHaptic("selection");
            onToggleOrtho();
          }}
          className={cn(
            "flex h-6 items-center rounded-full px-2 font-bold cursor-pointer border",
            orthoOn
              ? isDark
                ? "bg-[rgba(14,165,233,0.22)] border-[#38BDF8] text-[#7DD3FC]"
                : "border-sky-500/40 bg-sky-500/10 text-sky-600"
              : isDark
                ? "bg-[#232E45] border-[#334361] text-[#E2E8F0]"
                : "border-transparent opacity-50",
          )}
        >
          ORTO
        </button>

        <button
          type="button"
          data-testid="prumo-satellite-precision-btn"
          onClick={() => {
            triggerHaptic("selection");
            setPrecisionGridOpen((v) => !v);
            setHubOpen(false);
            setViewPopoverOpen(false);
          }}
          aria-expanded={precisionGridOpen}
          className={cn(
            "flex h-6 items-center gap-0.5 rounded-full border px-2 font-bold cursor-pointer",
            precisionGridOpen
              ? isDark
                ? "border-[#38BDF8] bg-[rgba(14,165,233,0.22)] text-[#7DD3FC]"
                : "border-rose-500 bg-rose-600 text-white"
              : isDark
                ? "border-[#334361] bg-[#232E45] text-[#E2E8F0] hover:border-[#38BDF8]/60"
                : "border-slate-500/30 hover:bg-slate-500/15",
          )}
        >
          <span>▾ Precisão</span>
        </button>
      </div>

      {/* GRADE EXPANSÍVEL 2×3 "▾ PRECISÃO" */}
      {precisionGridOpen && (
        <div
          data-testid="prumo-precision-2x3-popover"
          style={{
            ...glassSurfaceStyle,
            bottom: 54,
            left: effectiveHandSide === "right" ? 16 : undefined,
            right: effectiveHandSide === "left" ? 16 : undefined,
            width: Math.min(300, viewportWidth - 32),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute z-50 grid grid-cols-3 gap-1.5 rounded-2xl border p-2.5 font-mono text-[9.5px] font-bold"
        >
          <button
            type="button"
            data-testid="prumo-prec-grid-btn"
            onClick={() => {
              const steps = [1, 5, 10, 25, 50];
              const next = steps[(steps.indexOf(grid) + 1) % steps.length] ?? 10;
              onChangeGrid(next);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border py-2 cursor-pointer",
              showGrid ? "border-sky-500/45 bg-sky-500/15 text-sky-300" : "border-slate-500/25",
            )}
          >
            <Grid className="size-3.5" />
            <span>GRID ({grid}mm)</span>
          </button>

          <button
            type="button"
            data-testid="prumo-prec-datum-btn"
            onClick={() => {
              if (temporaryOrigin) {
                onClearDatum();
              } else {
                onSetDatumAtCursor();
              }
              setPrecisionGridOpen(false);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border py-2 cursor-pointer",
              temporaryOrigin
                ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                : "border-slate-500/25",
            )}
          >
            <Pin className="size-3.5" />
            <span>+ DATUM</span>
          </button>

          <button
            type="button"
            data-testid="prumo-prec-sheet-btn"
            onClick={() => {
              const gauges = [1.0, 1.5, 2.0, 3.0, 4.75, 6.35, 9.5, 12.7];
              const idx = gauges.findIndex((g) => Math.abs(g - thickness) < 0.1);
              const next = gauges[(idx + 1) % gauges.length] ?? 3.0;
              onChangeThickness(next);
            }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 py-2 text-amber-300 cursor-pointer"
          >
            <Layers className="size-3.5" />
            <span>CHAPA ({thickness.toFixed(1)}mm)</span>
          </button>

          <button
            type="button"
            data-testid="prumo-prec-mira-btn"
            onClick={onToggleCursorOffsetMode}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border py-2 cursor-pointer",
              cursorOffsetMode === "offset"
                ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-300"
                : "border-slate-500/25",
            )}
          >
            <Crosshair className="size-3.5" />
            <span>Mira 55px</span>
          </button>

          <button
            type="button"
            data-testid="prumo-prec-loupe-btn"
            onClick={onCycleLoupeMode}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border py-2 cursor-pointer",
              loupeMode !== "off"
                ? "border-purple-500/45 bg-purple-500/15 text-purple-300"
                : "border-slate-500/25",
            )}
          >
            <Search className="size-3.5" />
            <span>Lupa ({loupeMode})</span>
          </button>

          <button
            type="button"
            data-testid="prumo-prec-anchor-btn"
            onClick={() => {
              onToggleAnchorReferenceMode();
              setPrecisionGridOpen(false);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border py-2 cursor-pointer",
              interactionGuideMode === "purple_ref"
                ? "border-purple-400 bg-purple-500/25 text-purple-200"
                : "border-slate-500/25",
            )}
          >
            <Anchor className="size-3.5" />
            <span>⚓ Âncora / A-E</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          INSTRUMENTO 1 — O "NÚCLEO" (56×56px), SATÉLITES [ ↶ ] [ ↷ ] [ ⊞ ]
          E O LEQUE CONCÊNTRICO DE 2 ARCOS (R1 = 112px, R2 = 182px)
          ===================================================================== */}

      {/* LEQUE CONCÊNTRICO DE 2 ARCOS (Renderizado quando fanOpen === true; recolhe em 140ms para o Núcleo ao sair) */}
      {fanOpen && !respiroActive && (
        <div
          data-testid="prumo-concentric-fan"
          data-r1={innerArcLayout.radiusPx}
          data-r2={outerArcLayout.radiusPx}
          style={{
            transformOrigin: `${coreCenter.x}px ${coreCenter.y}px`,
            transform: fanCollapsing || isExitingToCompact ? "scale(0.18)" : "scale(1)",
            opacity: fanCollapsing || isExitingToCompact ? 0 : 1,
            transition:
              "transform 140ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          onPointerMove={handleArcScrollPointerMove}
          onPointerUp={handleArcScrollPointerUp}
          onPointerCancel={handleArcScrollPointerUp}
          className="pointer-events-none absolute inset-0 z-35"
        >
          {/* Guias Ópticas Graduadas dos 2 Arcos Concêntricos (SVG) */}
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <circle
              cx={coreCenter.x}
              cy={coreCenter.y}
              r={innerArcLayout.radiusPx}
              fill="none"
              stroke={isDark ? "rgba(56, 189, 248, 0.22)" : "rgba(2, 132, 199, 0.24)"}
              strokeWidth={1.25}
              strokeDasharray="3 4"
            />
            <circle
              cx={coreCenter.x}
              cy={coreCenter.y}
              r={outerArcLayout.radiusPx}
              fill="none"
              stroke={isDark ? "rgba(225, 29, 72, 0.24)" : "rgba(2, 132, 199, 0.28)"}
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />
          </svg>

          {/* ARCO INTERNO — GRUPOS (R1 = 112px, d = 42px, g = 4px) */}
          {innerArcLayout.items.map((slot) => {
            if (!slot.visible) return null;
            const grp = innerGroups[slot.index]!;
            const GrpIcon = grp.icon;
            const isSelected = activeGroupId === grp.id || highlightedInnerIdx === slot.index;

            return (
              <button
                key={grp.id}
                type="button"
                data-testid={`prumo-fan-group-${grp.id}`}
                onPointerDown={(e) => handleArcScrollPointerDown("inner", e)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (arcScrollDragRef.current.hasMoved) return;
                  triggerHaptic("selection");
                  setActiveGroupId(grp.id);
                }}
                style={{
                  ...glassSurfaceStyle,
                  width: innerArcLayout.diameterPx,
                  height: innerArcLayout.diameterPx,
                  left: slot.x - innerArcLayout.diameterPx / 2,
                  top: slot.y - innerArcLayout.diameterPx / 2,
                  opacity: slot.opacity,
                  backgroundColor: isSelected
                    ? isDark
                      ? "rgba(14, 165, 233, 0.22)"
                      : accentHex
                    : glassSurfaceStyle.backgroundColor,
                  color: isSelected
                    ? isDark
                      ? "#7DD3FC"
                      : "#FFFFFF"
                    : isDark
                      ? "#CBD5E1"
                      : glassSurfaceStyle.color,
                  borderColor: isSelected
                    ? isDark
                      ? "#38BDF8"
                      : accentHex
                    : glassSurfaceStyle.borderColor,
                  borderWidth: isSelected ? "1.5px" : "1px",
                }}
                title={`Grupo: ${grp.label} (deslize no arco para girar)`}
                className="pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border font-mono transition-transform active:scale-95 cursor-pointer"
              >
                <GrpIcon className="size-3.5 shrink-0" />
                <span
                  style={!isSelected && isDark ? { color: "#94A3B8" } : undefined}
                  className="mt-0.5 text-[8px] font-extrabold leading-none"
                >
                  {grp.short}
                </span>
              </button>
            );
          })}

          {/* Setas de Continuação de Rolagem do Arco Interno */}
          {(innerArcLayout.canScrollPrev || innerArcLayout.canScrollNext) && (
            <button
              type="button"
              data-testid="prumo-fan-inner-scroll-next"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("tap");
                setInnerScrollRad((prev) =>
                  prev + innerArcLayout.stepAngleRad * 2 > innerArcLayout.maxScrollAngleRad + 0.05
                    ? 0
                    : Math.min(innerArcLayout.maxScrollAngleRad, prev + innerArcLayout.stepAngleRad * 2),
                );
              }}
              style={{
                ...glassSurfaceStyle,
                left:
                  effectiveHandSide === "left"
                    ? coreCenter.x + 8
                    : coreCenter.x - 42,
                top: coreCenter.y - innerArcLayout.radiusPx - 36,
              }}
              title="Girar grupos do Arco Interno"
              className="pointer-events-auto absolute flex h-6 items-center gap-0.5 rounded-full border px-2 font-mono text-[8.5px] font-bold text-sky-400 cursor-pointer"
            >
              <span>↻ Grupos</span>
            </button>
          )}

          {/* ARCO EXTERNO — FERRAMENTAS DO GRUPO ATIVO (R2 = 182px, d = 46px, g = 4px) */}
          {outerArcLayout.items.map((slot) => {
            if (!slot.visible) return null;
            const item = activeOuterTools[slot.index];
            if (!item) return null;
            const ItemIcon = item.icon;
            const isHighlighted = item.isActive || highlightedOuterIdx === slot.index;

            return (
              <button
                key={item.id}
                type="button"
                data-testid={`prumo-fan-tool-${item.id}`}
                onPointerDown={(e) => handleArcScrollPointerDown("outer", e)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (arcScrollDragRef.current.hasMoved) return;
                  item.action();
                }}
                style={{
                  ...glassSurfaceStyle,
                  width: outerArcLayout.diameterPx,
                  height: outerArcLayout.diameterPx,
                  left: slot.x - outerArcLayout.diameterPx / 2,
                  top: slot.y - outerArcLayout.diameterPx / 2,
                  opacity: slot.opacity,
                  backgroundColor: isHighlighted
                    ? isDark
                      ? "rgba(14, 165, 233, 0.22)"
                      : accentHex
                    : glassSurfaceStyle.backgroundColor,
                  color: isHighlighted
                    ? isDark
                      ? "#7DD3FC"
                      : "#FFFFFF"
                    : isDark
                      ? "#CBD5E1"
                      : glassSurfaceStyle.color,
                  borderColor: isHighlighted
                    ? isDark
                      ? "#38BDF8"
                      : accentHex
                    : glassSurfaceStyle.borderColor,
                  borderWidth: isHighlighted ? "1.5px" : "1px",
                }}
                title={item.label}
                className="pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border font-mono transition-transform active:scale-95 cursor-pointer"
              >
                {item.colorHex ? (
                  <span
                    style={{ backgroundColor: item.colorHex }}
                    className="size-3.5 rounded-full border border-white/40"
                  />
                ) : (
                  <ItemIcon className="size-4 shrink-0" />
                )}
                <span
                  style={!isHighlighted && isDark ? { color: "#94A3B8" } : undefined}
                  className="mt-0.5 text-[8.5px] font-extrabold leading-none"
                >
                  {item.code3}
                </span>
              </button>
            );
          })}

          {/* Botão de Rolagem Orbital do Arco Externo quando o grupo tem > 6 ferramentas */}
          {(outerArcLayout.canScrollPrev || outerArcLayout.canScrollNext) && (
            <button
              type="button"
              data-testid="prumo-fan-outer-scroll-next"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("tap");
                setOuterScrollRad((prev) =>
                  prev + outerArcLayout.stepAngleRad * 2 > outerArcLayout.maxScrollAngleRad + 0.05
                    ? 0
                    : Math.min(outerArcLayout.maxScrollAngleRad, prev + outerArcLayout.stepAngleRad * 2),
                );
              }}
              style={{
                ...glassSurfaceStyle,
                left:
                  effectiveHandSide === "left"
                    ? coreCenter.x + 8
                    : coreCenter.x - 58,
                top: coreCenter.y - outerArcLayout.radiusPx - 44,
              }}
              title="Girar mais ferramentas no Arco Externo"
              className="pointer-events-auto absolute flex h-6 items-center gap-0.5 rounded-full border px-2 font-mono text-[9px] font-bold text-rose-400 cursor-pointer"
            >
              <span>↻ Mais ({activeOuterTools.length})</span>
            </button>
          )}
        </div>
      )}

      {/* O NÚCLEO (56×56px, área de toque 64px) + SATÉLITES [ ↶ ] [ ↷ ] [ ⊞ ] */}
      <div
        data-testid="prumo-core-cluster"
        style={{
          opacity: peripheralOpacityStyle.opacity,
          transformOrigin: `${coreCenter.x}px ${coreCenter.y}px`,
          transform: isCollapsedState
            ? `translate3d(${effectiveHandSide === "left" ? "-18px" : "18px"}, -110px, 0) scale(0.76)`
            : "translate3d(0, 0, 0) scale(1)",
          transition:
            "opacity 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
          pointerEvents: "none",
        }}
        className="pointer-events-none absolute inset-0 z-45"
      >
        {/* Onda fina azul-ciano (#38BDF8) de calibração óptica que expande 28px (de r=28px para r=56px) e desaparece em 350ms */}
        {calibrationPulseActive && (
          <div
            data-testid="prumo-core-calibration-pulse"
            style={{
              width: 56,
              height: 56,
              left: coreCenter.x - 28,
              top: coreCenter.y - 28,
              borderColor: "#38BDF8",
              borderWidth: "1.5px",
              boxShadow: "0 0 12px rgba(56, 189, 248, 0.55)",
              animation: "prumoOpticalCalibrationWave 350ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
            }}
            className="pointer-events-none absolute rounded-full border"
          />
        )}

        {/* Botão Principal do Núcleo (Calibre Óptico com Anel Graduado 15° / 45°) */}
        <button
          type="button"
          data-testid="prumo-core-button"
          aria-label={`Núcleo PRUMO — Ferramenta ativa ${activeCode3}. Toque para abrir o Leque, duplo toque para repetir, segure para abrir a Mesa de Ferramentas.`}
          aria-expanded={fanOpen}
          onPointerDown={handleCorePointerDown}
          onPointerMove={handleCorePointerMove}
          onPointerUp={handleCorePointerUp}
          style={{
            ...glassSurfaceStyle,
            width: 64,
            height: 64,
            left: coreCenter.x - 32,
            top: coreCenter.y - 32,
          }}
          className="pointer-events-auto absolute flex items-center justify-center rounded-full border-0 bg-transparent p-1 cursor-pointer touch-none"
        >
          <div
            style={{
              ...glassSurfaceStyle,
              width: 56,
              height: 56,
              borderColor: fanOpen ? accentHex : glassSurfaceStyle.borderColor,
            }}
            className="relative flex flex-col items-center justify-center rounded-full border shadow-xl transition-transform active:scale-95"
          >
            {/* Anel Graduado com Marcações a cada 15° (Maiores a cada 45°) — gira 45° com inércia suave ao assentar */}
            <svg
              viewBox="0 0 56 56"
              style={{
                transform: ringRotated45 ? "rotate(45deg)" : "rotate(0deg)",
                transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden="true"
            >
              {Array.from({ length: 24 }, (_, idx) => {
                const deg = idx * 15;
                const isMajor = deg % 45 === 0;
                const rad = (deg * Math.PI) / 180;
                const rOuter = 26;
                const rInner = isMajor ? 21.5 : 23.5;
                const x1 = 28 + rInner * Math.cos(rad);
                const y1 = 28 + rInner * Math.sin(rad);
                const x2 = 28 + rOuter * Math.cos(rad);
                const y2 = 28 + rOuter * Math.sin(rad);
                return (
                  <line
                    key={deg}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={accentHex}
                    strokeWidth={isMajor ? 1.5 : 0.9}
                    strokeOpacity={isMajor ? 0.9 : 0.45}
                  />
                );
              })}
            </svg>

            <ActiveToolIcon className="size-4 shrink-0" style={{ color: accentHex }} />
            <span className="mt-0.5 font-mono text-[9px] font-extrabold tracking-wider">
              {activeCode3}
            </span>
          </div>
        </button>

        {/* 3 Satélites ao lado do Núcleo: [ ↶ ] Desfazer, [ ↷ ] Refazer, [ ⊞ ] Mesa de Ferramentas (ocultos enquanto o leque estiver aberto para zero sobreposição com o slot de 180°) */}
        {!fanOpen &&
          (
            [
              {
                id: "undo",
                testId: "prumo-satellite-undo-btn",
                label: "Desfazer (Ctrl+Z)",
                icon: Undo2,
                disabled: !canUndo,
                onClick: onUndo,
                offsetPx: 46,
              },
              {
                id: "redo",
                testId: "prumo-satellite-redo-btn",
                label: "Refazer (Ctrl+Y)",
                icon: Redo2,
                disabled: !canRedo,
                onClick: onRedo,
                offsetPx: 88,
              },
              {
                id: "table",
                testId: "prumo-satellite-table-btn",
                label: "Abrir Mesa Completa de Ferramentas & Busca",
                icon: LayoutGrid,
                disabled: false,
                onClick: () => {
                  triggerHaptic("selection");
                  setFanOpen(false);
                  setToolTableOpen((v) => !v);
                },
                offsetPx: 130,
              },
            ] as const
          ).map((sat) => {
            const SatIcon = sat.icon;
            const sx = effectiveHandSide === "left" ? 1 : -1;
            const satCenterX = coreCenter.x + sx * sat.offsetPx;
            const satCenterY = coreCenter.y;

            return (
              <button
                key={sat.id}
                type="button"
                data-testid={sat.testId}
                disabled={sat.disabled}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  sat.onClick();
                }}
                aria-label={sat.label}
                title={sat.label}
                style={{
                  width: 44,
                  height: 44,
                  left: satCenterX - 22,
                  top: satCenterY - 22,
                  opacity: sat.disabled ? 0.4 : 1,
                }}
                className="pointer-events-auto absolute flex items-center justify-center rounded-full cursor-pointer"
              >
                <span
                  style={glassSurfaceStyle}
                  className="flex size-9 items-center justify-center rounded-full border transition-transform active:scale-95"
                >
                  <SatIcon className="size-4" />
                </span>
              </button>
            );
          })}
      </div>

      {/* =====================================================================
          INSTRUMENTO 2 — A "MESA DE FERRAMENTAS & BUSCA" ([ ⊞ ])
          Acesso instantâneo a 100% dos comandos + Busca + CHAMFER INTENT + ★ Favoritos + ⏱ Recentes
          ===================================================================== */}
      {toolTableOpen && (
        <div
          data-testid="prumo-tool-table-modal"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setToolTableOpen(false)}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-xs"
        >
          <div
            style={{
              ...glassSurfaceStyle,
              maxWidth: "min(94vw, 760px)",
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[86dvh] w-full flex-col gap-3 overflow-hidden rounded-3xl border p-4 font-mono shadow-2xl"
          >
            {/* Cabeçalho + Busca Instantânea */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LayoutGrid className="size-4 text-rose-500" />
                <span className="text-xs font-extrabold tracking-wider uppercase">
                  Mesa de Ferramentas & Busca — {UI_NAME}
                </span>
              </div>
              <button
                type="button"
                data-testid="prumo-tool-table-close-btn"
                onClick={() => setToolTableOpen(false)}
                className="rounded-full p-1.5 hover:bg-slate-500/15 cursor-pointer"
                aria-label="Fechar Mesa de Ferramentas"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Campo de Busca Instantânea + CHAMFER INTENT */}
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2",
                  isDark ? "border-slate-700 bg-slate-900/90" : "border-slate-300 bg-slate-100",
                )}
              >
                <Search className="size-4 opacity-60 shrink-0" />
                <input
                  type="text"
                  data-testid="prumo-tool-table-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ferramenta (ex.: Linha, Trim, Dobra, Furo) ou descrever peça..."
                  className="w-full bg-transparent text-xs outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="opacity-60 hover:opacity-100 cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  data-testid="prumo-ask-chamfer-intent-btn"
                  onClick={() => {
                    const q = searchQuery.trim();
                    setToolTableOpen(false);
                    onOpenIntent(q);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/45 bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-400 hover:bg-amber-500/25 cursor-pointer"
                >
                  <Sparkles className="size-4 shrink-0" />
                  <span>✨ Perguntar ao CHAMFER INTENT: &ldquo;{searchQuery.trim()}&rdquo;</span>
                </button>
              )}
            </div>

            {/* Corpo Rolável: ★ Favoritos + ⏱ Recentes + Grade Completa dos 9 Grupos */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
              {/* Faixa ★ Favoritos e ⏱ Recentes */}
              {!searchQuery.trim() && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    className={cn(
                      "rounded-2xl border p-2.5",
                      isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-400">
                      <Star className="size-3.5 fill-amber-400" />
                      <span>★ Favoritos</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {favoriteIds.map((fId) => {
                        const item = allToolsCatalog.find((x) => x.id === fId);
                        if (!item) return null;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={item.action}
                            className={cn(
                              "flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer",
                              isDark
                                ? "border-slate-700 bg-slate-800/80 hover:bg-slate-700"
                                : "border-slate-300 bg-white hover:bg-slate-100",
                            )}
                          >
                            <Icon className="size-3 text-amber-400" />
                            <span>{item.code3}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "rounded-2xl border p-2.5",
                      isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-sky-400">
                      <Clock className="size-3.5" />
                      <span>⏱ Recentes (Últimas 4)</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {recentIds.map((rId) => {
                        const item = allToolsCatalog.find((x) => x.id === rId);
                        if (!item) return null;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={item.action}
                            className={cn(
                              "flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer",
                              isDark
                                ? "border-slate-700 bg-slate-800/80 hover:bg-slate-700"
                                : "border-slate-300 bg-white hover:bg-slate-100",
                            )}
                          >
                            <Icon className="size-3 text-sky-400" />
                            <span>{item.code3}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Grade Completa dos 9 Grupos (SEL, CRI, MOD, PRE, MED, CHP, EST, DET, COR) */}
              {innerGroups
                .filter((g) => g.id !== "fav")
                .map((grp) => {
                  const q = searchQuery.trim().toLowerCase();
                  const groupTools = allToolsCatalog.filter(
                    (t) =>
                      t.groupId === grp.id &&
                      (!q ||
                        t.label.toLowerCase().includes(q) ||
                        t.code3.toLowerCase().includes(q) ||
                        (t.shortcut && t.shortcut.toLowerCase().includes(q))),
                  );
                  if (groupTools.length === 0) return null;

                  return (
                    <div key={grp.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider opacity-75">
                        <span className="text-rose-500">{grp.short}</span>
                        <span>·</span>
                        <span>{grp.label}</span>
                      </div>
                      <div
                        className="grid gap-2"
                        style={{
                          gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))",
                        }}
                      >
                        {groupTools.map((item) => {
                          const Icon = item.icon;
                          const isFav = favoriteIds.includes(item.id);
                          return (
                            <div
                              key={item.id}
                              style={{ padding: "10px 12px" }}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-2xl border transition-colors",
                                item.isActive
                                  ? "border-rose-500 bg-rose-500/15"
                                  : isDark
                                    ? "border-slate-800 bg-slate-900/60 hover:bg-slate-800/80"
                                    : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                              )}
                            >
                              <button
                                type="button"
                                data-testid={`prumo-table-tool-${item.id}`}
                                onClick={item.action}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                              >
                                <div
                                  className={cn(
                                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                                    item.isActive
                                      ? "bg-rose-500/20 text-rose-400"
                                      : isDark
                                        ? "bg-slate-800/90 text-sky-400"
                                        : "bg-sky-50 text-sky-600",
                                  )}
                                >
                                  {item.colorHex ? (
                                    <span
                                      style={{ backgroundColor: item.colorHex }}
                                      className="size-3.5 rounded-full border border-white/40"
                                    />
                                  ) : (
                                    <Icon className="size-4 shrink-0" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="text-[12px] font-bold leading-[1.22] text-balance break-words"
                                    style={{ whiteSpace: "normal" }}
                                  >
                                    {item.label}
                                  </div>
                                  <div className="mt-0.5 text-[10.5px] font-semibold opacity-65">
                                    {item.code3}
                                    {item.shortcut ? ` • [${item.shortcut}]` : ""}
                                  </div>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleFavoriteTool(item.id)}
                                aria-label={`Favoritar ${item.label}`}
                                className="flex size-6 shrink-0 items-center justify-center rounded-lg p-0 hover:bg-slate-500/15 cursor-pointer"
                              >
                                <Star
                                  className={cn(
                                    "size-3.5",
                                    isFav ? "fill-amber-400 text-amber-400" : "opacity-35",
                                  )}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TECLADO NUMÉRICO PRÓPRIO (NUMPAD) DO PRUMO (ZERO TECLADO NATIVO)
          ===================================================================== */}
      {numpadState.open && (
        <div
          data-testid="prumo-custom-numpad-modal"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setNumpadState((p) => ({ ...p, open: false }))}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-xs"
        >
          <div
            style={glassSurfaceStyle}
            onClick={(e) => e.stopPropagation()}
            className="flex w-72 flex-col gap-2.5 rounded-3xl border p-4 font-mono shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-sky-400">{numpadState.label}</span>
              <button
                type="button"
                onClick={() => setNumpadState((p) => ({ ...p, open: false }))}
                className="rounded-lg p-1 hover:bg-slate-500/15 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div
              data-testid="prumo-numpad-display"
              className={cn(
                "flex h-11 items-center justify-end rounded-xl border px-3 text-lg font-extrabold tabular-nums",
                isDark ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-slate-100",
              )}
            >
              {numpadState.buffer}
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {["7", "8", "9", "BACK", "4", "5", "6", "CLEAR", "1", "2", "3", "±", "0", ".", ","].map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleNumpadKey(k)}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-xl border text-xs font-extrabold cursor-pointer active:scale-95",
                      isDark
                        ? "border-slate-700 bg-slate-900 hover:bg-slate-800"
                        : "border-slate-300 bg-white hover:bg-slate-100",
                    )}
                  >
                    {k === "BACK" ? "⌫" : k === "CLEAR" ? "C" : k}
                  </button>
                ),
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                data-testid="prumo-numpad-cancel-btn"
                onClick={() => setNumpadState((p) => ({ ...p, open: false }))}
                className="flex h-10 items-center justify-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 text-xs font-bold text-rose-400 hover:bg-rose-500/25 cursor-pointer"
              >
                ✕ Cancelar
              </button>
              <button
                type="button"
                data-testid="prumo-numpad-confirm-btn"
                onClick={handleConfirmNumpad}
                className="flex h-10 items-center justify-center gap-1 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
              >
                ✓ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
