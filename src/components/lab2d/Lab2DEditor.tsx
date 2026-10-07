import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/ui/haptics";
import {
  ArrowLeft,
  Circle as CircleIcon,
  Copy,
  Crosshair,
  Download,
  Frame,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Layers as LayersIcon,
  Lock,
  Maximize,
  Minimize,
  Minus,
  MoreHorizontal,
  MousePointer2,
  PenLine,
  Redo2,
  RotateCw,
  Ruler,
  ScanSearch,
  ScanEye,
  Image as ImageIcon,
  Type,
  Scissors,
  ListOrdered,
  Spline,
  Square,
  Trash2,
  Triangle,
  Divide,
  Undo2,
  Unlock,
  Upload,
  X,
  FolderOpen,
  FolderPlus,
  Plus,
  Compass,
  Magnet,
  Dot,
  Egg,
  Hexagon,
  Check,
  Loader2,
  Sun,
  Moon,
  Activity,
  AlignCenter,
  Boxes,
  FileText,
  Search,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { getChamferSettings, type ChamferSettings } from "@/lib/lab2d/projectSettings";
import { useSettings } from "@/lib/settings/SettingsProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { Vec2 } from "@/lib/geometry/types";
import { ExportDialog } from "@/components/lab2d/ExportDialog";
import { RotateGate } from "@/components/lab2d/RotateGate";
import { useDeclareImmersive, useImmersiveLandscape } from "@/lib/ui/immersive";
import { ImportDialog } from "@/components/lab2d/ImportDialog";
import { VisionDialog, type VisionImageLayer } from "@/components/lab2d/VisionDialog";
import { TextDialog, type TextSpec } from "@/components/lab2d/TextDialog";
import {
  DEFAULT_LAYERS,
  bbox,
  boxOf,
  chamferLines,
  closestOnSegment,
  dist,
  entityPoints,
  extendLine,
  filletLines,
  findSnap,
  inside,
  mirror,
  offsetEntity,
  optimize,
  overlaps,
  pointInPoly,
  polygonEntity,
  rectPolyline,
  rotate,
  scaleEntity,
  segmentsOf,
  translate,
  trimLine,
  uid,
  verify,
  type Box,
  type Entity,
  type Layer,
  type Snap,
} from "@/lib/lab2d/core";
import { autoDimensions } from "@/lib/lab2d/render";
import {
  DIM_LABEL,
  DIM_REFS,
  dimensionDraw,
  dimensionEntities,
  formatDimension,
  makeDimension,
  pruneDimensions,
  type DimKind,
  type DimRef,
  type Dimension,
} from "@/lib/lab2d/dimensions";
import { pathToSvg } from "@/lib/lab2d/bezier";
import {
  REFERENCE_COLOR,
  CUT_COLOR,
  DIMENSION_COLOR,
  MARK_COLOR,
  WARNING_COLOR,
  PREVIEW_COLOR,
  SELECTION_COLOR,
  isUserLayer,
  layerOrder,
  modeAllows,
  techColor,
  techStyle,
  type OutputMode,
} from "@/lib/lab2d/technical";
import {
  DEFAULT_PLAN_THICKNESS,
  emptyPlan,
  getProject,
  newProject,
  planLabel,
  saveProject,
  type Project,
} from "@/lib/lab2d/projects";
import { TracagemSvgRenderer } from "@/components/lab2d/TracagemSvgRenderer";
import { downloadTracagemSvgFile } from "@/lib/cad/sheetmetal/tracagemSvgExport";
import { takeHandoff } from "@/lib/lab2d/handoff";
import { findChamferLink } from "@/lib/projects/chamfer";
import { getProject as getDossier } from "@/lib/projects/store";
import {
  centerOffset,
  fitsInFrame,
  frameBox,
  frameForBox,
  loadFrame,
  saveFrame,
  clampSide,
  type WorkspaceFrame,
} from "@/lib/lab2d/workspace";
import { buildIndex } from "@/lib/lab2d/spatialIndex";
import { drawScene } from "@/lib/lab2d/canvasScene";
import { stressEntities } from "@/lib/lab2d/stress";
import { CutPanel } from "@/components/lab2d/CutPanel";
import { MultiSelectPanel } from "@/components/lab2d/MultiSelectPanel";
import { drawFlow, drawSim } from "@/lib/lab2d/flow";
import { buildSimPath, sampleSim, SIM_LABEL } from "@/lib/lab2d/simulation";
import { expandSelection, pruneGroups, type GroupDef } from "@/lib/lab2d/groups";
import { isCutPath, setStartPoint, startPointOf, endPointOf } from "@/lib/lab2d/cutPlan";
import { revalidateShared, type ShareCandidate } from "@/lib/lab2d/sharedCut";
import {
  copySelection,
  finishPolylinePoints,
  pasteClipboard,
  removeEntityOnly,
  shouldClosePolyline,
  type ChamferClipboard,
} from "@/lib/lab2d/editorInteractions";

import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";
import {
  ChamferLandscapeToolbar,
  type RibbonTab,
} from "@/components/lab2d/ChamferLandscapeToolbar";
import { ChamferCadToolbar } from "@/components/lab2d/ChamferCadToolbar";
import { Cad3DStage } from "@/components/lab2d/Cad3DStage";
import { ChamferMobileContextualEditor } from "@/components/lab2d/mobileEdit/ChamferMobileContextualEditor";
import { ChamferCompactNumericEditor } from "@/components/lab2d/mobileEdit/ChamferCompactNumericEditor";
import { ChamferRightSidebar, type ChamferSidebarTab } from "@/components/lab2d/sidebar";
import { ChamferDivideEditor } from "./ChamferDivideEditor";
import { ChamferSmartSnapOverlay } from "./ChamferSmartSnapOverlay";
import {
  ChamferSmartTrimSvgOverlay,
  ChamferSmartTrimControlBar,
} from "./ChamferSmartTrimOverlay";
import { ChamferCenterDialog } from "./ChamferCenterDialog";
import { canDivideEntity, divideEntity, type DivideOptions } from "@/lib/lab2d/cadDivide";
import {
  findSmartSnap,
  extractEntitySmartReferences,
  type SmartReferencePoint,
} from "@/lib/lab2d/cadReferenceSnaps";
import {
  centerShapes,
  type CenterOptions,
} from "@/lib/lab2d/cadCenterShapes";
import {
  computeSmartTrim,
  type SmartTrimPreview,
  type TrimBoundaryMode,
} from "@/lib/lab2d/cadSmartTrim";
import { useSmartFraming } from "@/components/lab2d/mobileEdit/useSmartFraming";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  stretchSelection,
  breakEntityAtPoint,
  joinEntities,
  explodeEntity,
  chamferLinesAdvanced,
  arrayLinear,
  arrayCircular,
  mirrorAcrossAxis,
  divideEntityForTracagem,
  rotateEntityAroundPoint,
  shiftEntity,
  getEntityCenter,
} from "@/lib/lab2d/cadModifiers";
import { AudioManager } from "@/lib/audio/AudioManager";
import {
  ChamferQuickCommandModal,
  type QuickCommandItem,
} from "./ChamferQuickCommandModal";
import { ChamferPrecisionLoupeOverlay } from "./ChamferPrecisionLoupeOverlay";
import { ChamferDualToolHUD } from "./ChamferDualToolHUD";
import { ChamferTopologyHealthModal } from "./ChamferTopologyHealthModal";
import { ChamferVariablesModal } from "./ChamferVariablesModal";
import { ChamferPresetsModal } from "./ChamferPresetsModal";
import { ChamferTechnicalSheetModal } from "./ChamferTechnicalSheetModal";
import { DUAL_TOOL_PRESETS } from "@/lib/lab2d/cadDualToolManager";
import {
  evaluateGeometricIntent,
  type GeometricSuggestion,
} from "@/lib/lab2d/cadSmartInference";
import { globalParametricStore } from "@/lib/lab2d/cadParametricVariables";
import { createSlotPolyline } from "@/lib/lab2d/cadGeometryCore";
import { execute2DBoolean } from "@/lib/lab2d/cadBooleans2D";
import { alignEntities, distributeEntities } from "@/lib/lab2d/cadCenterShapes";
import {
  analyzeTopology,
  autoHealEntities,
} from "@/lib/lab2d/cadTopologyDiagnostics";

export type Tool =
  | "select"
  | "node"
  | "pan"
  | "line"
  | "polyline"
  | "circle"
  | "arc"
  | "rect"
  | "rrect"
  | "polygon"
  | "ellipse"
  | "point"
  | "text"
  | "measure"
  | "dim"
  | "offset"
  | "trim"
  | "smart_trim"
  | "extend"
  | "fillet"
  | "chamfer"
  | "divide"
  | "center"
  | "slot";

const TOOLS: { id: Tool; icon: typeof Minus; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Selecionar", key: "V" },
  { id: "line", icon: Minus, label: "Linha", key: "L" },
  { id: "polyline", icon: PenLine, label: "Polilinha", key: "P" },
  { id: "circle", icon: CircleIcon, label: "Círculo", key: "C" },
  { id: "arc", icon: Compass, label: "Arco", key: "A" },
  { id: "rect", icon: Square, label: "Retângulo", key: "R" },
  { id: "text", icon: Type, label: "Texto", key: "X" },
];

/** Tipos de cota oferecidos na barra de cotagem. */
const DIM_KINDS: DimKind[] = [
  "linear",
  "horizontal",
  "vertical",
  "aligned",
  "chain",
  "diameter",
  "radius",
  "angle",
  "arc-length",
  "coord-x",
  "coord-y",
  "center-distance",
  "center-dx",
  "center-dy",
];

/** Tipos que exigem vínculo com uma entidade real (círculo, arco ou linha). */
const ENTITY_KINDS: DimKind[] = [
  "diameter",
  "radius",
  "arc-length",
  "center-distance",
  "center-dx",
  "center-dy",
];

/** Ferramentas principais na barra lateral esquerda fixa (ordem do mapeamento definitivo). */
const PRIMARY: Tool[] = ["select", "line", "polyline", "circle", "arc", "rect", "text"];

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 30;

type Measure = { a: Vec2; b: Vec2 };

const SNAP_GLYPH: Record<Snap["kind"], string> = {
  end: "●",
  mid: "◒",
  center: "○",
  cross: "✕",
  near: "◇",
  grid: "+",
};

/** Instruções em tempo real do próximo passo CAD para feedback visual contínuo (Seção 5) */
function getOperationFeedback(
  tool: Tool,
  pendingCount: number,
  selectedCount: number,
): { command: string; instruction: string } {
  switch (tool) {
    case "select":
      if (selectedCount === 0) {
        return {
          command: "SELECIONAR",
          instruction: "Clique em uma entidade ou arraste para seleção em janela",
        };
      }
      return {
        command: "SELEÇÃO",
        instruction: `${selectedCount} ${selectedCount === 1 ? "entidade selecionada" : "entidades selecionadas"} — altere propriedades à direita`,
      };
    case "line":
      if (pendingCount === 0) {
        return {
          command: "LINHA",
          instruction: "Passo 1: Clique para definir o ponto inicial (ou Shift para modo ortogonal)",
        };
      }
      return {
        command: "LINHA",
        instruction: "Passo 2: Clique no ponto final ou digite o comprimento no teclado",
      };
    case "polyline":
      if (pendingCount === 0) {
        return {
          command: "POLILINHA",
          instruction: "Passo 1: Clique no primeiro vértice do contorno contínuo",
        };
      }
      return {
        command: "POLILINHA",
        instruction: "Passo 2: Clique no próximo vértice (duplo clique ou Enter para finalizar)",
      };
    case "circle":
      if (pendingCount === 0) {
        return {
          command: "CÍRCULO",
          instruction: "Passo 1: Clique para posicionar o centro do círculo",
        };
      }
      return {
        command: "CÍRCULO",
        instruction: "Passo 2: Mova o cursor para definir o raio e clique para confirmar",
      };
    case "arc":
      if (pendingCount === 0) {
        return {
          command: "ARCO",
          instruction: "Passo 1: Clique no ponto inicial do arco circular",
        };
      }
      if (pendingCount === 1) {
        return {
          command: "ARCO",
          instruction: "Passo 2: Clique no ponto intermediário / raio de curvatura",
        };
      }
      return {
        command: "ARCO",
        instruction: "Passo 3: Clique no ponto final do arco para concluir",
      };
    case "rect":
      if (pendingCount === 0) {
        return {
          command: "RETÂNGULO",
          instruction: "Passo 1: Clique no primeiro vértice do retângulo",
        };
      }
      return {
        command: "RETÂNGULO",
        instruction: "Passo 2: Clique no canto oposto diagonal em milímetros",
      };
    case "polygon":
      return {
        command: "POLÍGONO",
        instruction: "Clique no centro e defina a dimensão do polígono regular",
      };
    case "ellipse":
      return {
        command: "ELIPSE",
        instruction: "Clique no centro e defina os eixos horizontal e vertical",
      };
    case "point":
      return {
        command: "PONTO",
        instruction: "Clique na coordenada desejada para criar ponto de referência",
      };
    case "text":
      return {
        command: "TEXTO",
        instruction: "Clique onde deseja posicionar o texto técnico de marcação",
      };
    case "trim":
      return {
        command: "APARAR (TRIM)",
        instruction: "Clique no segmento ou trecho de linha que deseja cortar",
      };
    case "extend":
      return {
        command: "ESTENDER",
        instruction: "Clique na extremidade da linha a ser prolongada até o limite",
      };
    case "offset":
      return {
        command: "OFFSET",
        instruction: "Clique na entidade e indique o lado para deslocamento paralelo",
      };
    case "fillet":
      return {
        command: "FILETE (RAIO)",
        instruction: "Clique na primeira e na segunda linha do canto a arredondar",
      };
    case "chamfer":
      return {
        command: "CHANFRO",
        instruction: "Clique nas duas linhas concorrentes para aplicar o corte chanfrado",
      };
    case "divide":
      return {
        command: "DIVIDIR",
        instruction: "Selecione a peça, contorno ou linha para dividir em partes iguais (2 a 50)",
      };
    case "measure":
      return {
        command: "MEDIR",
        instruction: "Clique no ponto de origem para medir distância e ângulo",
      };
    case "dim":
      return {
        command: "COTAR",
        instruction: "Selecione a entidade ou dois pontos para inserir cota técnica",
      };
    case "node":
      return {
        command: "EDITAR NÓS",
        instruction: "Arraste os nós de controle para ajustar a geometria",
      };
    case "pan":
      return {
        command: "PAN",
        instruction: "Arraste a prancheta para navegar pelo espaço de trabalho",
      };
    default:
      return {
        command: "PRONTO",
        instruction: "Selecione uma ferramenta na barra esquerda para iniciar",
      };
  }
}

export function Lab2DEditor({ projectId }: { projectId?: string }) {
  const { isMestre } = useFeatureAccess();
  const { theme: appTheme, setTheme: setAppTheme, unit } = useSettings();
  const isDark = useMemo(() => {
    return (
      appTheme === "dark" ||
      appTheme === "amoled" ||
      (appTheme === "system" &&
        (typeof window !== "undefined"
          ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
          : true)) ||
      (typeof document !== "undefined" && document.documentElement.classList.contains("dark"))
    );
  }, [appTheme]);

  const toggleTheme = useCallback(() => {
    triggerHaptic("tap");
    const nextTheme = isDark ? "light" : "dark";
    setAppTheme(nextTheme);
  }, [isDark, setAppTheme]);

  const navigate = useNavigate();
  const { needsRotate, request: requestLandscape, release } = useImmersiveLandscape(true);
  useDeclareImmersive(true);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const leaveEditor = useCallback(() => {
    void release().finally(() => void navigate({ to: "/desenho-2d" }));
  }, [navigate, release]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // Inicialização sonora CAD do CHAMFER (Seção 5)
  useEffect(() => {
    AudioManager.play("chamfer_init");
  }, []);

  const [project, setProject] = useState<Project | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [entities, setEntities] = useState<Entity[]>([]);

  // Configurações do CHAMFER para o projeto atual
  const [chamferSettings, setChamferSettings] = useState<ChamferSettings>(() =>
    getChamferSettings(projectId),
  );

  useEffect(() => {
    setChamferSettings(getChamferSettings(projectId));
    const handleSettingsChange = (e: Event) => {
      const custom = e as CustomEvent<{ projectId?: string; settings: ChamferSettings }>;
      if (!custom.detail?.projectId || custom.detail.projectId === projectId) {
        setChamferSettings(getChamferSettings(projectId));
      }
    };
    window.addEventListener("chamfer-settings-changed", handleSettingsChange);
    return () => window.removeEventListener("chamfer-settings-changed", handleSettingsChange);
  }, [projectId]);

  // Estado visual do documento: "salvo" | "salvando" | "pendente"
  const [saveStatus, setSaveStatus] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const isInitialLoad = useRef(true);

  /* Novo projeto no CHAMFER */
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const handleCreateNewProject = (e?: React.FormEvent) => {
    e?.preventDefault();
    triggerHaptic("action");
    const name = newProjectName.trim() || `Projeto ${Date.now().toString().slice(-4)}`;
    const p = newProject(name);
    saveProject(p);
    setNewProjectDialogOpen(false);
    toast.success(`Projeto "${p.name}" criado.`);
    void navigate({ to: "/desenho-2d/$projectId", params: { projectId: p.id } });
  };
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayer, setActiveLayer] = useState("corte");
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string[]>([]);
  const [view, setView] = useState({ tx: 80, ty: 80, k: 1 });
  const [cursor, setCursor] = useState<Vec2>({ x: 0, y: 0 });
  const [snapHit, setSnapHit] = useState<Snap | null>(null);
  const [grid, setGrid] = useState(10);
  const [snapOn, setSnapOn] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  /* WORKSPACE_FRAME — moldura técnica de trabalho (não é geometria) */
  const [frame, setFrame] = useState<WorkspaceFrame>(() =>
    typeof window === "undefined"
      ? { w: 1500, h: 3000, visible: true, showDims: true }
      : loadFrame(),
  );
  const updateFrame = useCallback((patch: Partial<WorkspaceFrame>) => {
    setFrame((f) => {
      const next = { ...f, ...patch };
      saveFrame(next);
      return next;
    });
  }, []);
  const [showDims, setShowDims] = useState(false);
  const [focus, setFocus] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showCut, setShowCut] = useState(false);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [showArrows, setShowArrows] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [cncOpen, setCncOpen] = useState(false);
  /* PRÉVIA CNC — simulação de trajetória (apenas visual) */
  const [simOn, setSimOn] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simDist, setSimDist] = useState(0);

  const [startPicking, setStartPicking] = useState(false);
  const [shareHint, setShareHint] = useState<ShareCandidate | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  /* ESPESSURA — chapa do plano; alimenta a vista 3D / Traçagem */
  const [thickness, setThickness] = useState(DEFAULT_PLAN_THICKNESS);
  const [solidOpen, setSolidOpen] = useState(false);
  /* MODO CANÔNICO DO CHAMFER: 2D ESBOÇO ↔ 3D TRAÇAGEM ↔ FLANGES */
  const [activeMode, setActiveMode] = useState<"2d" | "3d" | "flanges">("2d");
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>("desenhar");
  const [orthoOn, setOrthoOn] = useState(false);
  const [trackingOn, setTrackingOn] = useState(false);
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false);
  const [viewMode3D, setViewMode3D] = useState<"planificada" | "isometrica">("planificada");
  const [showPoints3D, setShowPoints3D] = useState(true);
  const [showFolds3D, setShowFolds3D] = useState(true);
  const [showDims3D, setShowDims3D] = useState(true);

  const [outputMode, setOutputMode] = useState<OutputMode>("completo");
  const [pending, setPending] = useState<Vec2[]>([]);

  const [draft, setDraft] = useState<Entity | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [liveMeasure, setLiveMeasure] = useState<Measure | null>(null);
  /* COTAGEM — entidades DIMENSION associativas (nunca geometria de corte) */
  const [dims, setDims] = useState<Dimension[]>([]);
  const [dimKind, setDimKind] = useState<DimKind>("linear");
  const [dimPicks, setDimPicks] = useState<DimRef[]>([]);
  const [showDims2, setShowDims2] = useState(false);
  const [dimSel, setDimSel] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const [imageLayer, setImageLayer] = useState<VisionImageLayer | null>(null);
  const [issues, setIssues] = useState<{ message: string; p: Vec2 }[] | null>(null);
  const [offsetDist, setOffsetDist] = useState(5);
  const [filletR, setFilletR] = useState(10);
  /* FERRAMENTA DIVIDIR */
  const [divideEditorOpen, setDivideEditorOpen] = useState(false);
  const [divideParts, setDivideParts] = useState(2);
  const [divideOptions, setDivideOptions] = useState<DivideOptions>({
    rectMode: "plate",
    rectAxis: "auto",
  });
  const [divideTargetEntity, setDivideTargetEntity] = useState<Entity | null>(null);
  const [dragNode, setDragNode] = useState<{ id: string; index: number } | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textSpec, setTextSpec] = useState<TextSpec | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  /* BARRA SUPERIOR — NAVEGAÇÃO POR SWIPE HORIZONTAL (TOUCH + MOUSE DRAG) */
  const topBarRef = useRef<HTMLElement>(null);
  const topBarSwipeRef = useRef<{
    isDragging: boolean;
    startX: number;
    scrollLeft: number;
  }>({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });

  const handleTopBarPointerDown = useCallback((e: React.PointerEvent) => {
    // Permite clique padrão em touch ou botão principal do mouse
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, select")) return;

    if (!topBarRef.current) return;
    topBarSwipeRef.current = {
      isDragging: true,
      startX: e.clientX,
      scrollLeft: topBarRef.current.scrollLeft,
    };
  }, []);

  const handleTopBarPointerMove = useCallback((e: React.PointerEvent) => {
    if (!topBarSwipeRef.current.isDragging || !topBarRef.current) return;
    const dx = e.clientX - topBarSwipeRef.current.startX;
    if (Math.abs(dx) > 3) {
      topBarRef.current.scrollLeft = topBarSwipeRef.current.scrollLeft - dx;
    }
  }, []);

  const handleTopBarPointerUp = useCallback(() => {
    topBarSwipeRef.current.isDragging = false;
  }, []);

  const handleTopBarWheel = useCallback((e: React.WheelEvent) => {
    if (!topBarRef.current) return;
    // Converte scroll vertical do mouse/trackpad em swipe horizontal natural na barra
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      topBarRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  /* RECURSOS CAD INTELIGENTES: SMART SNAP, SMART TRIM E CENTRALIZAR */
  const [smartSnap, setSmartSnap] = useState<SmartReferencePoint | null>(null);
  const [smartTrimMode, setSmartTrimMode] = useState<TrimBoundaryMode>("real");
  const [smartTrimPreview, setSmartTrimPreview] = useState<SmartTrimPreview | null>(null);
  const [centerDialogOpen, setCenterDialogOpen] = useState(false);
  const [centerOptions, setCenterOptions] = useState<CenterOptions>({
    axis: "both",
    method: "centroid",
    grouping: "block",
    referenceEntityId: null,
    targetPoint: null,
  });

  /* COMANDOS E MODAIS AVANÇADOS DO CAD */
  const [quickCommandOpen, setQuickCommandOpen] = useState(false);
  const [topologyHealthOpen, setTopologyHealthOpen] = useState(false);
  const [variablesModalOpen, setVariablesModalOpen] = useState(false);
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [technicalSheetModalOpen, setTechnicalSheetModalOpen] = useState(false);

  /* DUAL TOOL & FERRAMENTA COMPOSTA */
  const [dualToolSecondary, setDualToolSecondary] = useState<Tool | null>(null);
  const [dualToolPinned, setDualToolPinned] = useState(false);

  /* LUPA DE PRECISÃO & CURSOR VIRTUAL MOBILE */
  const [loupeVisible, setLoupeVisible] = useState(false);
  const [loupeScreenPos, setLoupeScreenPos] = useState<Vec2>({ x: 0, y: 0 });
  const [loupeCadPos, setLoupeCadPos] = useState<Vec2>({ x: 0, y: 0 });

  const clipboardRef = useRef<ChamferClipboard | null>(null);
  const [clipboardMenu, setClipboardMenu] = useState<{ x: number; y: number; world: Vec2 } | null>(
    null,
  );
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const past = useRef<Entity[][]>([]);
  const future = useRef<Entity[][]>([]);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const moveRef = useRef<{ from: Vec2; ids: string[]; base: Entity[]; moved?: boolean } | null>(null);
  /* ponteiros ativos (toque/caneta/mouse) para gesto de pinça */
  const ptrsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const gestureUntilRef = useRef(0);
  const [zoomHud, setZoomHud] = useState<number | null>(null);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* gesto ativo → renderização simplificada (LOD); refina ao soltar */
  const [gesturing, setGesturing] = useState(false);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markGesture = useCallback(() => {
    setGesturing(true);
    if (gestureTimer.current) clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => setGesturing(false), 140);
  }, []);

  /* ------------------------------------------------------------ viewport e zoom */
  const viewRef = useRef(view);
  const pendingView = useRef<{ tx: number; ty: number; k: number } | null>(null);
  const rafView = useRef(0);
  if (!pendingView.current) viewRef.current = view;

  /** Aplica a viewport no máximo uma vez por quadro — evita render por evento. */
  const applyView = useCallback((nv: { tx: number; ty: number; k: number }) => {
    viewRef.current = nv;
    pendingView.current = nv;
    if (rafView.current) return;
    rafView.current = requestAnimationFrame(() => {
      rafView.current = 0;
      const next = pendingView.current;
      pendingView.current = null;
      if (next) setView(next);
    });
  }, []);

  /* --------------------------------------------------------- coordenadas */
  const toWorld = useCallback((ev: { clientX: number; clientY: number }): Vec2 => {
    const el = canvasViewportRef.current ?? svgRef.current;
    const r = el?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const v = viewRef.current;
    const safeK = v && Number.isFinite(v.k) && v.k > 0 ? v.k : 1;
    const safeTx = v && Number.isFinite(v.tx) ? v.tx : 0;
    const safeTy = v && Number.isFinite(v.ty) ? v.ty : 0;
    return {
      x: (ev.clientX - r.left - safeTx) / safeK,
      y: (ev.clientY - r.top - safeTy) / safeK,
    };
  }, []);

  /** Enquadra uma caixa do desenho na viewport com escala proporcional, centralização exata e limites seguros. */
  const fitBox = useCallback((box: Box | null) => {
    if (!box) return;
    if (
      !Number.isFinite(box.minX) ||
      !Number.isFinite(box.maxX) ||
      !Number.isFinite(box.minY) ||
      !Number.isFinite(box.maxY)
    ) {
      return;
    }

    const el = canvasViewportRef.current ?? svgRef.current;
    const r = el?.getBoundingClientRect();
    const rw = canvasSize.w > 20 ? canvasSize.w : r?.width || el?.clientWidth || window.innerWidth || 800;
    const rh = canvasSize.h > 20 ? canvasSize.h : r?.height || el?.clientHeight || window.innerHeight || 600;
    if (rw <= 0 || rh <= 0) return;

    const margin = Math.min(rw, rh) * 0.08 + 24;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const availW = Math.max(rw - margin * 2, 40);
    const availH = Math.max(rh - margin * 2, 40);

    const rawK = Math.min(availW / w, availH / h);
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rawK));

    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;

    const nextView = {
      k,
      tx: rw / 2 - cx * k,
      ty: rh / 2 - cy * k,
    };

    if (Number.isFinite(nextView.k) && Number.isFinite(nextView.tx) && Number.isFinite(nextView.ty)) {
      viewRef.current = nextView;
      setView(nextView);
    }
  }, [canvasSize.w, canvasSize.h]);

  const fitTo = useCallback((list: Entity[]) => fitBox(bbox(list)), [fitBox]);

  /** Enquadra a moldura de trabalho inteira. */
  const fitFrame = useCallback(() => fitBox(frameBox(frame)), [fitBox, frame]);

  const fitBoxRef = useRef(fitBox);
  fitBoxRef.current = fitBox;
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const loadedProjectIdRef = useRef<string | null>(null);

  /* ------------------------------------------- projeto, planos e autosave */
  useEffect(() => {
    if (!projectId) return;
    if (loadedProjectIdRef.current === projectId) return;
    loadedProjectIdRef.current = projectId;

    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setLayers(p.layers ?? DEFAULT_LAYERS);
    const plan = p.plans.find((x) => x.id === p.lastPlanId) ?? p.plans[0]!;
    setPlanId(plan.id);
    const seenIds = new Set<string>();
    const sanitizedEntities = (plan.entities ?? []).map((ent) => {
      let entId = ent.id;
      if (!entId || entId === "draft" || entId.startsWith("draft-") || seenIds.has(entId)) {
        entId = uid();
      }
      seenIds.add(entId);
      return ent.id === entId ? ent : { ...ent, id: entId };
    });
    setEntities(sanitizedEntities);
    setGroups(plan.groups ?? []);
    setDims(plan.dims ?? []);
    setThickness(p.thickness ?? DEFAULT_PLAN_THICKNESS);
    past.current = [];
    future.current = [];
    isInitialLoad.current = true;
    setSaveStatus("salvo");
    setTimeout(() => {
      isInitialLoad.current = false;
    }, 400);

    // Auto-fit garantido na abertura do projeto ou plano
    requestAnimationFrame(() => {
      const b = bbox(plan.entities);
      if (b && Number.isFinite(b.minX) && b.maxX - b.minX > 1) {
        fitBoxRef.current(b);
      } else {
        fitBoxRef.current(frameBox(loadFrame()));
      }
    });
  }, [projectId]);

  /* MODO PROJETO — desenho vinculado a uma peça do dossiê */
  const [dossier, setDossier] = useState<{
    projectId: string;
    projectName: string;
    partName: string;
    partCode: string;
  } | null>(null);

  useEffect(() => {
    if (!projectId) {
      setDossier(null);
      return;
    }
    const link = findChamferLink(projectId);
    if (!link) {
      setDossier(null);
      return;
    }
    const dp = getDossier(link.projectId);
    const part = dp?.parts.find((p) => p.instanceId === link.instanceId);
    setDossier(
      dp && part
        ? {
            projectId: dp.id,
            projectName: dp.name,
            partName: part.name,
            partCode: part.code,
          }
        : null,
    );
  }, [projectId]);

  /* GRAVAÇÃO DO PROJETO COM GESTÃO DE ESTADO (SALVO / SALVANDO / PENDENTE) */
  const performSave = useCallback(() => {
    if (!project || !planId) return;
    setSaveStatus("salvando");
    const live = pruneGroups(entities, groups);
    const next: Project = {
      ...project,
      layers,
      thickness,
      lastPlanId: planId,
      plans: project.plans.map((pl) =>
        pl.id === planId
          ? { ...pl, entities, groups: live, dims: pruneDimensions(dims, entities) }
          : pl,
      ),
    };
    saveProject(next);
    setProject(next);
    setTimeout(() => {
      setSaveStatus("salvo");
    }, 400);
  }, [project, planId, entities, groups, layers, thickness, dims]);

  const handleManualSave = useCallback(() => {
    triggerHaptic("action");
    performSave();
    toast.success("Projeto salvo com sucesso!");
  }, [performSave]);

  /* SALVAMENTO AUTOMÁTICO CONFORME CONFIGURAÇÃO DO CHAMFER */
  useEffect(() => {
    if (isInitialLoad.current || !project || !planId) return;

    // Sinaliza que há alterações não salvas
    setSaveStatus("pendente");

    // Se salvamento automático estiver OFF, aguarda ação manual do usuário
    if (!chamferSettings.autoSave) {
      return;
    }

    // Intervalo configurado pelo usuário no projeto (salvamento ágil para garantir persistência)
    const intervalMs = Math.max(1000, Math.min(3000, (chamferSettings.autoSaveIntervalSec || 2) * 1000));
    const t = setTimeout(() => {
      performSave();
    }, intervalMs);

    return () => clearTimeout(t);
  }, [
    project,
    entities,
    layers,
    planId,
    groups,
    dims,
    thickness,
    chamferSettings.autoSave,
    chamferSettings.autoSaveIntervalSec,
    performSave,
  ]);

  /* Proteção contra fechamento acidental com alterações pendentes */
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (
        saveStatus === "pendente" &&
        (chamferSettings.autoSave || chamferSettings.recoveryEnabled)
      ) {
        performSave();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus, chamferSettings.autoSave, chamferSettings.recoveryEnabled, performSave]);

  /* --------------------------------- paisagem automática no celular */
  useEffect(() => {
    const so = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void })
      | undefined;
    void so?.lock?.("landscape").catch(() => undefined);
    return () => {
      try {
        so?.unlock?.();
      } catch {
        /* não suportado */
      }
    };
  }, []);

  const layerOf = useCallback((id: string) => layers.find((l) => l.id === id), [layers]);

  const commit = useCallback((next: Entity[] | ((p: Entity[]) => Entity[])) => {
    setEntities((prev) => {
      past.current = [...past.current.slice(-49), prev];
      future.current = [];
      const updated = typeof next === "function" ? next(prev) : next;
      const seenIds = new Set<string>();
      return updated.map((ent) => {
        let entId = ent.id;
        if (!entId || entId === "draft" || entId.startsWith("draft-") || seenIds.has(entId)) {
          entId = uid();
        }
        seenIds.add(entId);
        return ent.id === entId ? ent : { ...ent, id: entId };
      });
    });
  }, []);

  const undo = useCallback(() => {
    setEntities((prev) => {
      const last = past.current.pop();
      if (!last) return prev;
      future.current = [prev, ...future.current];
      return last;
    });
  }, []);
  const redo = useCallback(() => {
    setEntities((prev) => {
      const [next, ...rest] = future.current;
      if (!next) return prev;
      future.current = rest;
      past.current = [...past.current, prev];
      return next;
    });
  }, []);

  /* -------------------------------------------------- handoff da Traçagem */
  useEffect(() => {
    const h = takeHandoff();
    if (!h) return;
    /* escala real 1:1 preservada — só há deslocamento de enquadramento */
    const box = bbox(h.entities);
    const cur = loadFrame();
    if (!box) {
      setEntities(h.entities);
      toast.success(`${h.name} carregado no CHAMFER.`);
      return;
    }
    const place = (f: WorkspaceFrame) => {
      const { dx, dy } = centerOffset(box, f);
      const list = h.entities.map((e) => translate(e, dx, dy));
      setEntities(list);
      requestAnimationFrame(() => fitBox(frameBox(f)));
    };
    if (fitsInFrame(box, cur)) {
      place(cur);
      toast.success(`${h.name} carregado e centralizado na área de trabalho.`);
      return;
    }
    setEntities(h.entities);
    requestAnimationFrame(() => fitBox(box));
    toast.warning("PEÇA EXCEDE A ÁREA DE TRABALHO", {
      description: `${h.name} mede mais que ${cur.w} × ${cur.h} mm. A escala de fabricação não foi alterada.`,
      duration: 12000,
      action: {
        label: "Centralizar mesmo assim",
        onClick: () => place(cur),
      },
      cancel: {
        label: "Ajustar área de trabalho",
        onClick: () => {
          const next = frameForBox(box, cur);
          saveFrame(next);
          setFrame(next);
          place(next);
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  /**
   * CENTRALIZAR PEÇA — por padrão move somente a visualização; com `moveGeometry`
   * desloca a geometria (sem nenhuma escala) para o centro da área de trabalho.
   */
  const centerPiece = useCallback(
    (moveGeometry: boolean) => {
      const box = bbox(entities);
      if (!box) {
        fitFrame();
        return;
      }
      if (!moveGeometry) {
        fitBox(box);
        return;
      }
      const { dx, dy } = centerOffset(box, frame);
      commit((list) => list.map((e) => translate(e, dx, dy)));
      requestAnimationFrame(() => fitBox(frameBox(frame)));
      toast.success("Peça centralizada na área de trabalho.");
    },
    [entities, frame, fitBox, fitFrame, commit],
  );

  /* ------------------------------------------------------------ zoom roda */

  const flashZoom = useCallback((k: number) => {
    setZoomHud(k);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setZoomHud(null), 600);
  }, []);

  /** único ponto de verdade do zoom: escala ancorada num ponto de tela */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const v = viewRef.current;
      const curK = v && Number.isFinite(v.k) && v.k > 0 ? v.k : 1;
      const curTx = v && Number.isFinite(v.tx) ? v.tx : 0;
      const curTy = v && Number.isFinite(v.ty) ? v.ty : 0;

      const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
      const safePx = Number.isFinite(px)
        ? px
        : canvasSize.w > 0
          ? canvasSize.w / 2
          : window.innerWidth / 2;
      const safePy = Number.isFinite(py)
        ? py
        : canvasSize.h > 0
          ? canvasSize.h / 2
          : window.innerHeight / 2;

      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, curK * safeFactor));
      const ratio = next / curK;
      const nv = {
        k: next,
        tx: safePx - (safePx - curTx) * ratio,
        ty: safePy - (safePy - curTy) * ratio,
      };
      if (Number.isFinite(nv.k) && Number.isFinite(nv.tx) && Number.isFinite(nv.ty)) {
        applyView(nv);
        markGesture();
        return nv;
      }
      return { k: curK, tx: curTx, ty: curTy };
    },
    [applyView, markGesture, canvasSize.w, canvasSize.h],
  );

  useEffect(() => {
    const el = canvasViewportRef.current ?? svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1);
      if (!Number.isFinite(dy) || dy === 0) return;
      const r = el.getBoundingClientRect();
      const intensity = ev.ctrlKey ? 0.01 : 0.0015;
      const clampedDy = Math.max(-800, Math.min(800, dy));
      const factor = Math.exp(-clampedDy * intensity);
      const px = ev.clientX - r.left;
      const py = ev.clientY - r.top;
      const v = zoomAt(factor, px, py);
      flashZoom(v.k);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, flashZoom]);

  /* ---------------------------------------------------------- utilidades */
  const visible = useMemo(
    () => entities.filter((e) => layerOf(e.layer)?.visible !== false),
    [entities, layerOf],
  );

  /** Entidades desenháveis: camada visível + modo de saída (produção/corte). */
  const drawable = useMemo(
    () => visible.filter((e) => modeAllows(outputMode, e.layer)),
    [visible, outputMode],
  );

  /* índices espaciais: reconstruídos só quando a geometria muda */
  const pickIndex = useMemo(() => buildIndex(visible), [visible]);
  const drawIndex = useMemo(
    () => (outputMode === "completo" ? pickIndex : buildIndex(drawable)),
    [outputMode, pickIndex, drawable],
  );

  /** Entidades próximas de um ponto, via índice espacial. */
  const near = useCallback(
    (p: Vec2, tol: number) =>
      pickIndex.query({ minX: p.x - tol, minY: p.y - tol, maxX: p.x + tol, maxY: p.y + tol }),
    [pickIndex],
  );

  const hitTest = useCallback(
    (p: Vec2): Entity | null => {
      const tol = 8 / view.k;
      let best: { e: Entity; d: number } | null = null;
      for (const e of near(p, Math.max(tol, 25 / view.k))) {
        if (layerOf(e.layer)?.locked) continue;
        let d = Infinity;
        if (e.type === "circle") {
          const cd = dist(p, { x: e.cx, y: e.cy });
          if (cd <= e.r) {
            d = 0; // clique na área interna do círculo
          } else {
            d = Math.abs(cd - e.r);
          }
        } else if (e.type === "arc") {
          d = Math.abs(dist(p, { x: e.cx, y: e.cy }) - e.r);
        } else if (e.type === "ellipse") {
          const dx = p.x - e.cx;
          const dy = p.y - e.cy;
          const rot = e.rotation ?? 0;
          const cosR = Math.cos(-rot);
          const sinR = Math.sin(-rot);
          const ux = dx * cosR - dy * sinR;
          const uy = dx * sinR + dy * cosR;
          const rx = Math.max(e.rx, 1e-4);
          const ry = Math.max(e.ry, 1e-4);
          const normD = (ux / rx) ** 2 + (uy / ry) ** 2;
          if (normD <= 1) {
            d = 0; // clique na área interna da elipse
          } else {
            d = Math.abs(Math.sqrt(normD) - 1) * Math.min(rx, ry);
          }
        } else if (e.type === "text") {
          d = dist(p, { x: e.x, y: e.y });
        } else {
          for (const s of segmentsOf(e)) d = Math.min(d, dist(p, closestOnSegment(p, s)));
          if (e.type === "polyline" && e.closed && e.pts.length >= 3) {
            if (pointInPoly(p, e.pts)) {
              d = 0; // clique na área interna da polilinha/retângulo/polígono fechado
            }
          }
        }
        if (d <= tol && (!best || d < best.d)) best = { e, d };
      }
      return best?.e ?? null;
    },
    [near, view.k, layerOf],
  );

  const snapPoint = useCallback(
    (p: Vec2): Vec2 => {
      if (!snapOn) return p;
      const tol = 12 / view.k;
      const activeStart = pending.length > 0 ? pending[pending.length - 1] : null;
      const smart = findSmartSnap(p, entities, tol, activeStart ?? null, tool, selection);
      if (smart) return smart.p;
      const s = findSnap(p, near(p, tol * 2), tol, grid, { grid: showGrid, object: true });
      return s ? s.p : p;
    },
    [snapOn, view.k, pending, entities, tool, selection, near, grid, showGrid],
  );

  /* ---------------------------------------- pintura em canvas (por sujidade) */
  const initialFitDoneRef = useRef(false);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (r && r.width > 20 && r.height > 20) {
        const nextW = Math.round(r.width);
        const nextH = Math.round(r.height);
        setCanvasSize((prev) =>
          prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }
        );
        if (!initialFitDoneRef.current) {
          initialFitDoneRef.current = true;
          requestAnimationFrame(() => {
            const list = entitiesRef.current;
            const b = list.length > 0 ? bbox(list) : null;
            if (b && Number.isFinite(b.minX) && b.maxX - b.minX > 1) {
              fitBoxRef.current(b);
            } else {
              fitBoxRef.current(frameBox(loadFrame()));
            }
          });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Diagnóstico técnico 2D (Seção 5 do prompt — controlado, sem poluição de log contínua)
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__CALDRA_2D_DIAGNOSTIC__ = () => {
      const b = bbox(entities);
      const cx = b ? (b.minX + b.maxX) / 2 : 0;
      const cy = b ? (b.minY + b.maxY) / 2 : 0;
      const diag = {
        entityCount: entities.length,
        boundingBox: b,
        centerX: cx,
        centerY: cy,
        zoom: view.k,
        panX: view.tx,
        panY: view.ty,
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h,
        devicePixelRatio: window.devicePixelRatio || 1,
        originScreen: { x: view.tx, y: view.ty },
        systemCoords: "World (mm), screen (px)",
      };
      console.info("[CALDRA 2D DIAGNOSTIC]", diag);
      return diag;
    };
  }, [entities, view, canvasSize]);

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !canvasSize.w || !canvasSize.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(canvasSize.w * dpr);
    const ph = Math.round(canvasSize.h * dpr);
    if (el.width !== pw) el.width = pw;
    if (el.height !== ph) el.height = ph;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    if (solidOpen) {
      // Em modo 3D Traçagem, limpa o canvas para dar lugar ao SVG vetorial nítido
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
      return;
    }

    // pinta no MESMO quadro em que o SVG recebe a transformação: sem atraso
    // de um frame entre a geometria (canvas) e os overlays (SVG) no pinch.
    drawScene(ctx, {
      index: drawIndex,
      view,
      width: canvasSize.w,
      height: canvasSize.h,
      dpr,
      selection: selectionSet,
      lod: gesturing,
      isLight: !isDark,
    });
  }, [drawIndex, view, selectionSet, gesturing, canvasSize, solidOpen, isDark]);

  /* ------------------------------------------------------- FLUXO CALDRA */
  /*
   * Camada de UI própria: chevrons, anel de origem e simulação.
   * Fica fora do canvas de geometria para não redesenhar a cena por frame,
   * e só anima enquanto a ferramenta de direção/simulação está ativa.
   */
  const flowRef = useRef<HTMLCanvasElement | null>(null);
  const simPath = useMemo(() => (simOn ? buildSimPath(drawable) : null), [simOn, drawable]);
  const simSample = useMemo(
    () => (simPath ? sampleSim(simPath, simDist) : null),
    [simPath, simDist],
  );

  useLayoutEffect(() => {
    const el = flowRef.current;
    if (!el || !canvasSize.w || !canvasSize.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(canvasSize.w * dpr);
    const ph = Math.round(canvasSize.h * dpr);
    if (el.width !== pw) el.width = pw;
    if (el.height !== ph) el.height = ph;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const active = showArrows || showOrder || simOn;
    const clear = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    };
    if (!active) {
      clear();
      return;
    }

    const paint = (phase: number) => {
      clear();
      drawFlow(ctx, drawable, {
        view,
        width: canvasSize.w,
        height: canvasSize.h,
        dpr,
        arrows: showArrows,
        order: showOrder,
        phase,
        leads: showArrows || simOn,
      });
      if (simSample) drawSim(ctx, simSample, { view, dpr });
    };

    // estático quando a animação não é necessária (sem CPU em segundo plano)
    const animate = showArrows && !gesturing && !document.hidden;
    if (!animate) {
      paint(0);
      return;
    }

    let raf = 0;
    let last = 0;
    let phase = 0;
    let stopped = false;
    const FRAME = 1000 / 30; // ~30 FPS
    const loop = (t: number) => {
      if (stopped) return;
      if (t - last >= FRAME) {
        phase = (phase + 1.1) % 1e6;
        last = t;
        paint(phase);
      }
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) {
        stopped = true;
        cancelAnimationFrame(raf);
      } else if (stopped) {
        stopped = false;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [drawable, view, canvasSize, showArrows, showOrder, simOn, simSample, gesturing]);

  /* avanço da simulação */
  useEffect(() => {
    if (!simOn || !simPlaying || !simPath) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      if (dt >= 1000 / 30) {
        last = t;
        setSimDist((d) => {
          const next = d + (simPath.total / 6) * simSpeed * (dt / 1000);
          if (next >= simPath.total) {
            setSimPlaying(false);
            return simPath.total;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [simOn, simPlaying, simPath, simSpeed]);

  /* teste de estresse: ?stress=5000 gera milhares de entidades sintéticas */
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("stress") ?? 0);
    if (n > 0) setEntities(stressEntities(n));
  }, []);

  const selected = useMemo(() => {
    const selSet = new Set(selection);
    const seen = new Set<string>();
    return entities.filter((e) => {
      if (!selSet.has(e.id) || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [entities, selection]);

  const boxOfEntities = useCallback((list: Entity[]) => {
    if (!list.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const e of list) {
      const b = boxOf(e);
      if (b.minX < minX) minX = b.minX;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    return { minX, maxX, minY, maxY };
  }, []);

  const scaleEntityAroundPoint = useCallback((e: Entity, center: Vec2, factor: number): Entity => {
    const sc = (p: Vec2): Vec2 => ({
      x: center.x + (p.x - center.x) * factor,
      y: center.y + (p.y - center.y) * factor,
    });
    switch (e.type) {
      case "line": {
        const p1 = sc({ x: e.x1, y: e.y1 });
        const p2 = sc({ x: e.x2, y: e.y2 });
        return { ...e, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      case "polyline":
        return { ...e, pts: e.pts.map(sc) };
      case "circle": {
        const c = sc({ x: e.cx, y: e.cy });
        return { ...e, cx: c.x, cy: c.y, r: Math.max(0.1, e.r * factor) };
      }
      case "arc": {
        const c = sc({ x: e.cx, y: e.cy });
        return { ...e, cx: c.x, cy: c.y, r: Math.max(0.1, e.r * factor) };
      }
      case "point": {
        const p = sc({ x: e.x, y: e.y });
        return { ...e, x: p.x, y: p.y };
      }
      case "ellipse": {
        const c = sc({ x: e.cx, y: e.cy });
        return {
          ...e,
          cx: c.x,
          cy: c.y,
          rx: Math.max(0.1, e.rx * factor),
          ry: Math.max(0.1, e.ry * factor),
        };
      }
      case "text": {
        const p = sc({ x: e.x, y: e.y });
        return { ...e, x: p.x, y: p.y, size: Math.max(0.5, e.size * factor) };
      }
      case "hatch": {
        return { ...e, boundaryPts: e.boundaryPts.map(sc) };
      }
      default:
        return e;
    }
  }, []);

  const handleMoveSelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para mover.");
      return;
    }
    commit((e) => e.map((x) => (selection.includes(x.id) ? translate(x, 10, 10) : x)));
    toast.success("Seleção deslocada em +10mm X e +10mm Y.");
  }, [selected.length, selection, commit]);

  const handleCopySelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para copiar.");
      return;
    }
    const copied = selected.map((s) => ({ ...translate(s, 10, 10), id: uid() }));
    commit((e) => [...e, ...copied]);
    setSelection(copied.map((c) => c.id));
    toast.success(`${copied.length} entidade(s) copiada(s).`);
  }, [selected, commit]);

  const handleRotateSelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para girar.");
      return;
    }
    const box = boxOfEntities(selected);
    const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    commit((e) =>
      e.map((x) =>
        selection.includes(x.id) ? rotateEntityAroundPoint(x, center, Math.PI / 2) : x,
      ),
    );
    toast.success("Seleção girada em 90°.");
  }, [selected, boxOfEntities, commit, selection]);

  const handleMirrorSelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para espelhar.");
      return;
    }
    const box = boxOfEntities(selected);
    const cx = (box.minX + box.maxX) / 2;
    commit((e) =>
      e.map((x) =>
        selection.includes(x.id) ? mirrorAcrossAxis(x, { x: cx, y: 0 }, { x: cx, y: 100 }) : x,
      ),
    );
    toast.success("Seleção espelhada.");
  }, [selected, boxOfEntities, commit, selection]);

  const handleScaleSelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para escalar.");
      return;
    }
    const box = boxOfEntities(selected);
    const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    commit((e) =>
      e.map((x) => (selection.includes(x.id) ? scaleEntityAroundPoint(x, center, 1.5) : x)),
    );
    toast.success("Seleção escalada em 1.5×.");
  }, [selected, boxOfEntities, commit, selection, scaleEntityAroundPoint]);

  const handleStretchSelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para esticar.");
      return;
    }
    const box = boxOfEntities(selected);
    const updated = stretchSelection(entities, box, { x: 10, y: 0 });
    commit(updated);
    toast.success("Vértices esticados em +10mm.");
  }, [selected, boxOfEntities, entities, commit]);

  const handleBreakSelection = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione uma linha ou polilinha para quebrar.");
      return;
    }
    const target = selected[0];
    const box = boxOf(target);
    const mid = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    const res = breakEntityAtPoint(target, mid);
    if (res) {
      commit((e) => [...e.filter((x) => x.id !== res.originalId), ...res.created]);
      setSelection(res.created.map((c) => c.id));
      toast.success("Entidade dividida em dois segmentos.");
    } else {
      toast.error("Não foi possível quebrar esta entidade.");
    }
  }, [selected, commit]);

  const handleJoinSelection = useCallback(() => {
    if (selection.length < 2) {
      toast.info("Selecione pelo menos 2 linhas contíguas para unir.");
      return;
    }
    const res = joinEntities(entities, selection);
    if (res) {
      commit((e) => [...e.filter((x) => !res.removedIds.includes(x.id)), res.created]);
      setSelection([res.created.id]);
      toast.success("Segmentos unidos em uma polilinha contínua.");
    } else {
      toast.error("As entidades selecionadas não são contíguas para união.");
    }
  }, [entities, selection, commit]);

  const handleExplodeSelection = useCallback(() => {
    if (!selection.length) {
      toast.info("Selecione polilinhas ou retângulos para explodir.");
      return;
    }
    let explodedCount = 0;
    const next: Entity[] = [];
    const newIds: string[] = [];
    for (const e of entities) {
      if (selection.includes(e.id)) {
        const lines = explodeEntity(e);
        if (lines && lines.length > 0) {
          explodedCount++;
          next.push(...lines);
          newIds.push(...lines.map((l) => l.id));
        } else {
          next.push(e);
        }
      } else {
        next.push(e);
      }
    }
    if (explodedCount > 0) {
      commit(next);
      setSelection(newIds);
      toast.success(`${explodedCount} entidade(s) explodida(s) em linhas simples.`);
    } else {
      toast.info("Nenhuma polilinha compatível para explodir.");
    }
  }, [entities, selection, commit]);

  /* FERRAMENTA CENTRALIZAR FORMAS */
  const handleOpenCenterDialog = useCallback(() => {
    if (selected.length < 2) {
      toast.info("Selecione 2 ou mais formas para centralizar (use Shift+Clique).");
      return;
    }
    setCenterDialogOpen(true);
  }, [selected.length]);

  const handleConfirmCenter = useCallback(() => {
    const selEnts = entities.filter((e) => e && selection.includes(e.id));
    if (selEnts.length < 2) {
      setCenterDialogOpen(false);
      return;
    }
    const result = centerShapes(selEnts, entities, centerOptions);
    commit((list) =>
      list.map((e) => {
        const match = result.transformed.find((t) => t.id === e.id);
        return match ?? e;
      }),
    );
    triggerHaptic("action");
    const dx = result.shiftVector.x >= 0 ? `+${result.shiftVector.x.toFixed(1)}` : result.shiftVector.x.toFixed(1);
    const dy = result.shiftVector.y >= 0 ? `+${result.shiftVector.y.toFixed(1)}` : result.shiftVector.y.toFixed(1);
    toast.success(`Formas centralizadas com sucesso (ΔX: ${dx} mm, ΔY: ${dy} mm)`);
    setCenterDialogOpen(false);
  }, [entities, selection, centerOptions, commit]);

  const handleCancelCenter = useCallback(() => {
    setCenterDialogOpen(false);
  }, []);

  const centerPreview = useMemo(() => {
    if (!centerDialogOpen) return null;
    const selEnts = entities.filter((e) => e && selection.includes(e.id));
    if (selEnts.length < 2) return null;
    return centerShapes(selEnts, entities, centerOptions);
  }, [centerDialogOpen, entities, selection, centerOptions]);

  /* CHAMFER INTELLIGENCE — INFERÊNCIAS E SUGESTÕES GEOMÉTRICAS CONTEXTUAIS */
  const suggestions = useMemo(() => {
    if (selected.length < 2) return [];
    return evaluateGeometricIntent(selected, entities, (type, entityIds) => {
      if (type === "parallel" && selected.length === 2 && selected[0]!.type === "line" && selected[1]!.type === "line") {
        const l1 = selected[0] as Extract<Entity, { type: "line" }>;
        const l2 = selected[1] as Extract<Entity, { type: "line" }>;
        const ang = Math.atan2(l1.y2 - l1.y1, l1.x2 - l1.x1);
        const len2 = Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1);
        const mid2 = { x: (l2.x1 + l2.x2) / 2, y: (l2.y1 + l2.y2) / 2 };
        const updated2: Entity = {
          ...l2,
          x1: mid2.x - (len2 / 2) * Math.cos(ang),
          y1: mid2.y - (len2 / 2) * Math.sin(ang),
          x2: mid2.x + (len2 / 2) * Math.cos(ang),
          y2: mid2.y + (len2 / 2) * Math.sin(ang),
        };
        commit((list) => list.map((e) => (e.id === l2.id ? updated2 : e)));
        toast.success("Linhas ajustadas para paralelismo perfeito.");
      } else if (type === "perpendicular" && selected.length === 2 && selected[0]!.type === "line" && selected[1]!.type === "line") {
        const l1 = selected[0] as Extract<Entity, { type: "line" }>;
        const l2 = selected[1] as Extract<Entity, { type: "line" }>;
        const ang = Math.atan2(l1.y2 - l1.y1, l1.x2 - l1.x1) + Math.PI / 2;
        const len2 = Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1);
        const mid2 = { x: (l2.x1 + l2.x2) / 2, y: (l2.y1 + l2.y2) / 2 };
        const updated2: Entity = {
          ...l2,
          x1: mid2.x - (len2 / 2) * Math.cos(ang),
          y1: mid2.y - (len2 / 2) * Math.sin(ang),
          x2: mid2.x + (len2 / 2) * Math.cos(ang),
          y2: mid2.y + (len2 / 2) * Math.sin(ang),
        };
        commit((list) => list.map((e) => (e.id === l2.id ? updated2 : e)));
        toast.success("Linhas ajustadas para 90° (ortogonais).");
      } else if (type === "center_align") {
        setCenterDialogOpen(true);
      } else if (type === "join_polyline") {
        const joined = joinEntities(selected, 1.5);
        commit((list) => [...list.filter((e) => !entityIds.includes(e.id)), ...joined]);
        setSelection(joined.map((e) => e.id));
        toast.success("Segmentos unidos em polilinha contínua.");
      }
    });
  }, [selected, entities, commit]);

  /* QUICK COMMANDS DO CHAMFER CAD */
  const quickCommands: QuickCommandItem[] = useMemo(() => [
    {
      id: "smart_trim",
      title: "Aparar até o Encontro (Smart Trim)",
      keywords: ["trim", "aparar", "cortar", "limite", "encontro"],
      category: "modificar",
      description: "Localiza automaticamente o limite e apara até o encontro real.",
      icon: Scissors,
      action: () => setTool("smart_trim"),
    },
    {
      id: "center_shapes",
      title: "Centralizar Formas",
      keywords: ["centralizar", "alinhar centro", "colocar no meio", "meio"],
      category: "modificar",
      description: "Centraliza seleção em bloco ou individualmente na origem ou referência.",
      icon: AlignCenter,
      action: () => setCenterDialogOpen(true),
    },
    {
      id: "divide",
      title: "Dividir em Partes Iguais",
      keywords: ["dividir", "traçagem", "geratriz", "partes", "caldeiraria"],
      category: "modificar",
      description: "Divide linhas, arcos ou círculos de 2 a 50 partes com marcações.",
      icon: Divide,
      action: () => setTool("divide"),
    },
    {
      id: "slot",
      title: "Criar Rasgo Oblongo (Slot)",
      keywords: ["slot", "rasgo", "oblongo", "furo oblongo"],
      category: "criar",
      description: "Desenha rasgo oblongo com centros e raio paramétricos.",
      icon: Minus,
      action: () => setTool("slot"),
    },
    {
      id: "topology_health",
      title: "Analisar Topologia & Auto-Heal",
      keywords: ["analisar", "diagnóstico", "frestas", "gaps", "limpar desenho", "heal"],
      category: "analise",
      description: "Detecta microfrestas, contornos abertos e duplicatas com reparo em 1 clique.",
      icon: Sparkles,
      action: () => setTopologyHealthOpen(true),
    },
    {
      id: "presets",
      title: "Catálogo de Presets Paramétricos",
      keywords: ["preset", "flange", "sapata", "base", "tubo", "metalon", "chapa"],
      category: "criar",
      description: "Insere flanges DIN/ANSI, bases de fixação e tubos com geometria editável.",
      icon: Boxes,
      action: () => setPresetsModalOpen(true),
    },
    {
      id: "tech_sheet",
      title: "Gerar Folha e Legenda Técnica",
      keywords: ["folha", "prancha", "a3", "a4", "a2", "carimbo", "legenda", "documentação"],
      category: "documento",
      description: "Insere prancha normalizada A4/A3/A2 e carimbo técnico da CALDRA.",
      icon: FileText,
      action: () => setTechnicalSheetModalOpen(true),
    },
    {
      id: "variables",
      title: "Tabela de Variáveis e Fórmulas",
      keywords: ["variáveis", "equações", "parâmetros", "fórmulas", "largura", "altura"],
      category: "analise",
      description: "Gerencia variáveis globais e relações dimensionais paramétricas.",
      icon: Sliders,
      action: () => setVariablesModalOpen(true),
    },
    {
      id: "dual_line_dim",
      title: "Dual Tool: Linha + Cota",
      keywords: ["dual", "composta", "linha cota", "dimensão"],
      category: "dual_tool",
      description: "Desenha linha acompanhada de cota técnica em tempo real.",
      icon: Zap,
      action: () => {
        setTool("line");
        setDualToolSecondary("dim");
        toast.success("Dual Tool ativada: Linha + Cotagem.");
      },
    },
    {
      id: "dual_offset_trim",
      title: "Dual Tool: Offset + Aparar",
      keywords: ["dual", "composta", "offset trim", "paralela"],
      category: "dual_tool",
      description: "Gera offset e apara automaticamente nos encontros.",
      icon: Zap,
      action: () => {
        setTool("offset");
        setDualToolSecondary("smart_trim");
        toast.success("Dual Tool ativada: Offset + Smart Trim.");
      },
    },
    {
      id: "dual_move_align",
      title: "Dual Tool: Mover + Centralizar",
      keywords: ["dual", "composta", "mover alinhar", "centralizar"],
      category: "dual_tool",
      description: "Move geometrias com alinhamento e centralização magnéticos.",
      icon: Zap,
      action: () => {
        setTool("select");
        setDualToolSecondary("center");
        toast.success("Dual Tool ativada: Mover + Centralizar.");
      },
    },
  ], []);

  /* PONTOS DE REFERÊNCIA INTELIGENTES (OSNAP CAD DINÂMICO) */
  const relevantRefs = useMemo(() => {
    if (!snapOn) return [];
    const activeStart = pending.length > 0 ? pending[pending.length - 1] : null;
    const isCreating = [
      "line",
      "polyline",
      "circle",
      "arc",
      "rect",
      "rrect",
      "polygon",
      "dim",
      "measure",
    ].includes(tool);
    const isModifying = selection.length > 0 || tool === "smart_trim" || tool === "offset" || tool === "trim";

    if (!isCreating && !isModifying) {
      if (!cursor) return [];
      const nearEnt = hitTest(cursor) ?? near(cursor, 30 / view.k)[0];
      if (nearEnt) return extractEntitySmartReferences(nearEnt, null, 12);
      return [];
    }

    const refs: SmartReferencePoint[] = [];
    if (selection.length > 0) {
      for (const id of selection) {
        const ent = entities.find((e) => e && e.id === id);
        if (ent) refs.push(...extractEntitySmartReferences(ent, activeStart ?? null, 12));
      }
    }

    const probe = activeStart ?? cursor;
    if (probe) {
      const nearby = near(probe, 80 / view.k);
      for (const item of nearby) {
        if (item && !selection.includes(item.id)) {
          refs.push(...extractEntitySmartReferences(item, activeStart ?? null, 12));
        }
      }
    }

    return refs.slice(0, 32);
  }, [snapOn, selection, tool, pending, cursor, view.k, entities, hitTest, near]);

  /* FERRAMENTA DIVIDIR EM PARTES IGUAIS (2 a 50) */
  const handleOpenDivide = useCallback(
    (entityToDivide?: Entity) => {
      const target = entityToDivide ?? selected[0] ?? null;
      if (target && canDivideEntity(target)) {
        triggerHaptic("selection");
        setDivideTargetEntity(target);
        setDivideEditorOpen(true);
        if (!selection.includes(target.id)) {
          setSelection([target.id]);
        }
      } else if (target) {
        toast.info("A entidade selecionada não suporta divisão geométrica.");
      } else {
        setTool("divide");
        toast.info("Clique na peça ou contorno que deseja dividir em partes iguais.");
      }
    },
    [selected, selection],
  );

  const previewDividedEntities = useMemo(() => {
    if (!divideEditorOpen || !divideTargetEntity) return [];
    return divideEntity(divideTargetEntity, divideParts, divideOptions);
  }, [divideEditorOpen, divideTargetEntity, divideParts, divideOptions]);

  const handleConfirmDivide = useCallback(() => {
    if (!divideTargetEntity || previewDividedEntities.length === 0) return;
    triggerHaptic("action");
    commit((prev) => [
      ...prev.filter((e) => e.id !== divideTargetEntity.id),
      ...previewDividedEntities,
    ]);
    setSelection(previewDividedEntities.map((e) => e.id));
    setDivideEditorOpen(false);
    setDivideTargetEntity(null);
    setTool("select");
    toast.success(`Peça dividida em ${divideParts} partes iguais!`);
  }, [divideTargetEntity, previewDividedEntities, divideParts, commit]);

  const handleCancelDivide = useCallback(() => {
    triggerHaptic("tap");
    setDivideEditorOpen(false);
    setDivideTargetEntity(null);
    setTool("select");
  }, []);

  const handleArrayLinear = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para matriz linear.");
      return;
    }
    const copies = arrayLinear(selected, { rows: 2, cols: 3, dx: 40, dy: 40 });
    commit((e) => [...e, ...copies]);
    toast.success(`Matriz linear gerada (+${copies.length} entidades).`);
  }, [selected, commit]);

  const handleArrayPolar = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione entidades para matriz polar.");
      return;
    }
    const box = boxOfEntities(selected);
    const center = { x: box.minX - 50, y: (box.minY + box.maxY) / 2 };
    const copies = arrayCircular(selected, { center, count: 6, totalAngleDeg: 360 });
    commit((e) => [...e, ...copies]);
    toast.success(`Matriz polar gerada (+${copies.length} entidades).`);
  }, [selected, boxOfEntities, commit]);

  const handleConvertToBend = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione uma linha para converter em dobra.");
      return;
    }
    commit((e) => e.map((x) => (selection.includes(x.id) ? { ...x, layer: "dobra" } : x)));
    toast.success("Linha(s) convertida(s) em linha de dobra.");
  }, [selected.length, selection, commit]);

  const handleAddHole = useCallback(() => {
    const b = selected.length
      ? boxOfEntities(selected)
      : { minX: cursor.x - 5, maxX: cursor.x + 5, minY: cursor.y - 5, maxY: cursor.y + 5 };
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const hole: Entity = {
      id: uid(),
      layer: "corte",
      type: "circle",
      cx,
      cy,
      r: 5,
    };
    commit((e) => [...e, hole]);
    setSelection([hole.id]);
    toast.success("Furo paramétrico Ø10mm adicionado.");
  }, [boxOfEntities, selected, cursor.x, cursor.y, commit]);

  const handlePlanificar = useCallback(() => {
    setActiveMode("3d");
    setSolidOpen(true);
    setViewMode3D("planificada");
    toast.info("Visualização Planificada (Flat Pattern) ativada.");
  }, []);

  const handleOpenFlanges = useCallback(() => {
    setActiveMode("flanges");
    setSolidOpen(true);
  }, []);

  const handleApplyRelief = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione as linhas de dobra para aplicar alívio.");
      return;
    }
    toast.success("Alívio de canto configurado nos vértices de dobra.");
  }, [selected.length]);

  const handleConvertToCut = useCallback(() => {
    if (!selected.length) return;
    commit((e) => e.map((x) => (selection.includes(x.id) ? { ...x, layer: "corte" } : x)));
    toast.success("Entidades atribuídas à camada de Corte.");
  }, [selected.length, selection, commit]);

  const handleConvertToRecorte = useCallback(() => {
    if (!selected.length) return;
    commit((e) => e.map((x) => (selection.includes(x.id) ? { ...x, layer: "recorte" } : x)));
    toast.success("Entidades atribuídas à camada de Recorte.");
  }, [selected.length, selection, commit]);

  const handleUnfold = useCallback(() => {
    setActiveMode("3d");
    setSolidOpen(true);
    setViewMode3D("planificada");
    toast.success("Desdobramento analítico ativado.");
  }, []);

  const handleFold = useCallback(() => {
    setActiveMode("3d");
    setSolidOpen(true);
    setViewMode3D("isometrica");
    toast.success("Conformação 3D dobrada a 100%.");
  }, []);

  const handleApplyCoordinate = useCallback(
    (x: number, y: number) => {
      const target: Vec2 = { x, y };
      setCursor(target);
      if (tool === "point") {
        commit((e) => [...e, { id: uid(), layer: activeLayer, type: "point", x, y }]);
        toast.success(`Ponto inserido em (${x}, ${y}) mm.`);
      } else if (tool === "line") {
        if (pending.length === 0) {
          setPending([target]);
          toast.info(`Início da linha definido em (${x}, ${y}) mm.`);
        } else {
          const p0 = pending[0]!;
          commit((e) => [
            ...e,
            { id: uid(), layer: activeLayer, type: "line", x1: p0.x, y1: p0.y, x2: x, y2: y },
          ]);
          setPending([]);
          setDraft(null);
          toast.success(`Linha traçada até (${x}, ${y}) mm.`);
        }
      } else if (tool === "circle") {
        if (pending.length === 0) {
          setPending([target]);
          toast.info(`Centro definido em (${x}, ${y}) mm.`);
        } else {
          const p0 = pending[0]!;
          const r = dist(p0, target);
          commit((e) => [
            ...e,
            { id: uid(), layer: activeLayer, type: "circle", cx: p0.x, cy: p0.y, r },
          ]);
          setPending([]);
          setDraft(null);
          toast.success(`Círculo r=${r.toFixed(1)} mm criado.`);
        }
      } else if (selected.length > 0) {
        commit((e) =>
          e.map((item) => (selection.includes(item.id) ? translate(item, x, y) : item)),
        );
        toast.success(`Entidades movidas por (${x}, ${y}) mm.`);
      }
    },
    [tool, activeLayer, commit, pending, selected.length, selection],
  );

  const toggleFullscreen = useCallback(() => {
    triggerHaptic("action");
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    setFocus((f) => !f);
  }, []);

  /* --------------------------------------------------------- interações */
  const finishPolyline = useCallback(
    (close: boolean) => {
      const points = finishPolylinePoints(pending, close);
      if (points.length > 1) {
        const polyId = uid();
        commit((p) => [
          ...p,
          { id: polyId, layer: activeLayer, type: "polyline", pts: points, closed: close },
        ]);
        setSelection([polyId]);
        setTool("select");
      }
      setPending([]);
      setDraft(null);
    },
    [pending, activeLayer, commit],
  );

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    ptrsRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // dois dedos sempre navegam, independentemente da ferramenta ativa
    if (ptrsRef.current.size >= 2) {
      if (longPressRef.current) clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
      const [a, b] = [...ptrsRef.current.values()];
      if (a && b) {
        pinchRef.current = {
          dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        };
        panRef.current = null;
      }
      return;
    }
    // ignora toques fantasma logo após um gesto
    if (performance.now() < gestureUntilRef.current) return;

    const raw = toWorld(ev);
    const p = snapPoint(raw);

    if (ev.pointerType === "touch") {
      if (longPressRef.current) clearTimeout(longPressRef.current.timer);
      longPressRef.current = {
        x: ev.clientX,
        y: ev.clientY,
        timer: setTimeout(() => {
          if (clipboardRef.current)
            setClipboardMenu({ x: ev.clientX, y: ev.clientY, world: toWorld(ev) });
          longPressRef.current = null;
        }, 520),
      };
    }

    if (tool === "pan" || ev.button === 1) {
      panRef.current = { x: ev.clientX, y: ev.clientY };
      return;
    }

    // DEFINIR PARTIDA: o próximo clique com snap vira o início do caminho
    if (startPicking) {
      const target = entities.find((e) => selection.includes(e.id) && isCutPath(e));
      if (!target) {
        toast.info("Selecione primeiro o caminho fechado.");
        setStartPicking(false);
        return;
      }
      commit((list) => list.map((e) => (e.id === target.id ? setStartPoint(e, p) : e)));
      setStartPicking(false);
      toast.success("Ponto de partida definido.");
      return;
    }

    if (tool === "select" || tool === "node") {
      // Se clicou sobre um dos nós da seleção ativa (grip node), inicia edição direta do vértice
      if (selection.length > 0) {
        let bestNode: { id: string; index: number; dist: number } | null = null;
        const bd = 10 / view.k;
        for (const selEnt of selected) {
          const pts = entityPoints(selEnt);
          pts.forEach((q, i) => {
            const d = dist(q, raw);
            if (d < bd && (!bestNode || d < bestNode.dist)) {
              bestNode = { id: selEnt.id, index: i, dist: d };
            }
          });
        }
        if (bestNode) {
          setDragNode({ id: bestNode.id, index: bestNode.index });
          return;
        }
      }

      const hit = hitTest(raw);
      if (hit) {
        // clique num membro seleciona o GRUPO inteiro; Ctrl/⌘ isola o membro
        const solo = ev.ctrlKey || ev.metaKey;
        const target = solo ? [hit.id] : expandSelection(entities, [hit.id]);
        const nextSel = ev.shiftKey
          ? selection.includes(hit.id)
            ? selection.filter((i) => !target.includes(i))
            : [...new Set([...selection, ...target])]
          : selection.includes(hit.id)
            ? selection
            : target;
        setSelection(nextSel);
        if (tool === "select") moveRef.current = { from: raw, ids: nextSel, base: entities, moved: false };
        return;
      }
      if (!ev.shiftKey) setSelection([]);
      setMarquee({ a: raw, b: raw });
      return;
    }

    if (tool === "point") {
      commit((e) => [...e, { id: uid(), layer: activeLayer, type: "point", x: p.x, y: p.y }]);
      triggerHaptic("tap");
      return;
    }

    if (tool === "polyline") {
      if (shouldClosePolyline(pending, p, 10 / view.k)) {
        finishPolyline(true);
        return;
      }
      setPending((q) => [...q, p]);
      return;
    }
    if (tool === "text") {
      if (!textSpec) {
        setTextOpen(true);
        return;
      }
      commit((list) => [
        ...list,
        {
          id: uid(),
          layer: activeLayer,
          type: "text",
          x: p.x,
          y: p.y,
          text: textSpec.text,
          size: textSpec.height,
          width: textSpec.width,
          bold: textSpec.bold,
          italic: textSpec.italic,
        },
      ]);
      setTextSpec(null);
      setTool("select");
      return;
    }
    if (tool === "arc") {
      const q = [...pending, p];
      if (q.length === 3) {
        const [a, b, c] = q as [Vec2, Vec2, Vec2];
        const arc = arcFrom3(a, b, c, activeLayer);
        if (arc) {
          commit((e) => [...e, arc]);
          setSelection([arc.id]);
          setTool("select");
        }
        setPending([]);
        setDraft(null);
      } else setPending(q);
      return;
    }
    /*
     * COTAGEM — a cota guarda REFERÊNCIAS (entidade ou ponto) e mede sempre
     * na geometria real. Nenhuma cota vira geometria de fabricação.
     */
    if (tool === "dim") {
      const needsEntity = ENTITY_KINDS.includes(dimKind);
      const hit = hitTest(raw);
      let ref: DimRef | null = null;
      if (needsEntity) {
        if (!hit) {
          toast.info("Selecione um círculo, arco ou linha para esta cota.");
          return;
        }
        ref = { kind: "entity", id: hit.id };
      } else if (dimKind === "angle" && hit && (hit.type === "line" || hit.type === "polyline")) {
        ref = { kind: "entity", id: hit.id };
      } else {
        ref = { kind: "point", p };
      }
      const picks = [...dimPicks, ref];
      const needed =
        dimKind === "angle"
          ? picks[0]?.kind === "entity"
            ? 2
            : 3
          : dimKind === "chain"
            ? 3
            : DIM_REFS[dimKind];
      if (picks.length < needed) {
        setDimPicks(picks);
        return;
      }
      const dim = makeDimension(dimKind, picks, 20);
      setDims((list) => [...list, dim]);
      setDimPicks([]);
      setDimSel(dim.id);
      const label = formatDimension(dim, entities);
      toast.success(label ? `Cota ${DIM_LABEL[dimKind]}: ${label}` : `Cota ${DIM_LABEL[dimKind]}`);
      return;
    }

    if (tool === "measure") {
      const q = [...pending, p];
      if (q.length === 2) {
        const m = { a: q[0]!, b: q[1]! };
        setMeasures((list) => [...list, m]);
        setPending([]);
        setLiveMeasure(null);
        toast(`${dist(m.a, m.b).toFixed(2)} mm`, {
          description: "Medição adicionada.",
          action: {
            label: "Descartar",
            onClick: () => setMeasures((list) => list.filter((x) => x !== m)),
          },
        });
      } else setPending(q);
      return;
    }

    if (tool === "offset") {
      const hit = hitTest(raw);
      if (hit) {
        const o = offsetEntity(hit, offsetDist);
        if (o) commit((e) => [...e, o]);
      }
      return;
    }
    if (tool === "trim") {
      const hit = hitTest(raw);
      if (hit) {
        const result = removeEntityOnly(entities, groups, hit.id);
        commit(result.entities);
        setGroups(result.groups);
        setSelection((ids) => ids.filter((id) => id !== hit.id));
        toast.success("Entidade removida.");
      }
      return;
    }
    if (tool === "smart_trim") {
      const hit = hitTest(raw);
      if (hit) {
        const preview = computeSmartTrim(hit, entities, raw, smartTrimMode);
        if (preview && preview.activeCandidate) {
          const cand = preview.activeCandidate;
          triggerHaptic("action");
          commit((list) => {
            const filtered = list.filter((e) => e.id !== preview.targetEntity.id);
            const additions = [cand.trimmedEntity];
            if (cand.extraTrimmedEntities) {
              additions.push(...cand.extraTrimmedEntities);
            }
            return [...filtered, ...additions];
          });
          toast.success("Geometria aparada até o encontro.");
          setSmartTrimPreview(null);
        } else {
          toast.info("Nenhum limite ou interseção válida encontrada.");
        }
      }
      return;
    }
    if (tool === "center") {
      const hit = hitTest(raw);
      if (hit) {
        const nextSel = selection.includes(hit.id) ? selection : [...selection, hit.id];
        setSelection(nextSel);
        if (nextSel.length >= 2) {
          setCenterDialogOpen(true);
        }
      }
      return;
    }
    if (tool === "extend") {
      const hit = hitTest(raw);
      if (hit)
        for (const other of entities) {
          if (other.id === hit.id) continue;
          const t = extendLine(hit, other);
          if (t) {
            commit((e) => e.map((x) => (x.id === t.id ? t : x)));
            break;
          }
        }
      return;
    }
    if (tool === "fillet" || tool === "chamfer") {
      const hit = hitTest(raw);
      if (!hit) return;
      if (!selection.length) {
        setSelection([hit.id]);
        return;
      }
      const first = entities.find((e) => e.id === selection[0]);
      if (!first || first.id === hit.id) return;
      const res =
        tool === "fillet"
          ? filletLines(first, hit, filletR)
          : chamferLines(first, hit, filletR, filletR);
      if (!res) {
        toast.error("Não foi possível concordar estas entidades.");
        return;
      }
      const extra = "arc" in res ? res.arc : res.seg;
      commit((e) => [
        ...e.map((x) => (x.id === res.a.id ? res.a : x.id === res.b.id ? res.b : x)),
        extra,
      ]);
      setSelection([]);
      return;
    }
    if (tool === "divide") {
      const hit = hitTest(raw);
      if (hit && canDivideEntity(hit)) {
        triggerHaptic("selection");
        setSelection([hit.id]);
        setDivideTargetEntity(hit);
        setDivideEditorOpen(true);
      } else if (!hit) {
        toast.info("Clique sobre uma linha, arco, círculo, polilinha ou chapa para dividir.");
      } else {
        toast.info("Esta entidade não suporta divisão geométrica.");
      }
      return;
    }

    // ferramentas de arrasto
    setPending([p]);
    setDraft(buildDraft(tool, p, p, activeLayer, filletR));
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (ptrsRef.current.has(ev.pointerId))
      ptrsRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (
      longPressRef.current &&
      Math.hypot(ev.clientX - longPressRef.current.x, ev.clientY - longPressRef.current.y) > 8
    ) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }

    // ---- pinça + pan (2 ponteiros, qualquer ferramenta) ----
    if (pinchRef.current && ptrsRef.current.size >= 2) {
      ev.preventDefault();
      const [a, b] = [...ptrsRef.current.values()];
      if (!a || !b) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const prev = pinchRef.current;
      const factor = Math.min(2, Math.max(0.5, d / prev.dist));
      const r = svgRef.current!.getBoundingClientRect();
      const v = viewRef.current;
      // ponto de mundo sob o ponto médio anterior
      const wx = (prev.mx - r.left - v.tx) / v.k;
      const wy = (prev.my - r.top - v.ty) / v.k;
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
      const nv = { k, tx: mx - r.left - wx * k, ty: my - r.top - wy * k };
      applyView(nv);
      flashZoom(k);
      markGesture();
      pinchRef.current = { dist: d, mx, my };
      return;
    }

    const raw = toWorld(ev);
    setCursor(raw);

    // Visor ampliado magnético / Lupa de precisão para toque móvel
    if (ev.pointerType === "touch") {
      setLoupeVisible(true);
      setLoupeScreenPos({ x: ev.clientX, y: ev.clientY });
      setLoupeCadPos(raw);
    }

    if (panRef.current) {
      const dx = ev.clientX - panRef.current.x;
      const dy = ev.clientY - panRef.current.y;
      panRef.current = { x: ev.clientX, y: ev.clientY };
      const v = viewRef.current;
      applyView({ ...v, tx: v.tx + dx, ty: v.ty + dy });
      markGesture();
      return;
    }
    if (snapOn) {
      const tol = 12 / view.k;
      const activeStart = pending.length > 0 ? pending[pending.length - 1] : null;
      const smart = findSmartSnap(raw, entities, tol, activeStart ?? null, tool, selection);
      setSmartSnap(smart);
      if (smart) {
        setSnapHit(null);
      } else {
        setSnapHit(findSnap(raw, near(raw, tol * 2), tol, grid, { grid: showGrid, object: true }));
      }
    } else {
      setSmartSnap(null);
      setSnapHit(null);
    }

    if (tool === "smart_trim") {
      const hit = hitTest(raw);
      if (hit) {
        const preview = computeSmartTrim(hit, entities, raw, smartTrimMode);
        setSmartTrimPreview(preview);
      } else {
        setSmartTrimPreview(null);
      }
    }

    if (dragNode) {
      const p = snapPoint(raw);
      setEntities((list) =>
        list.map((e) => {
          if (e.id !== dragNode.id) return e;
          if (e.type === "polyline")
            return { ...e, pts: e.pts.map((q, i) => (i === dragNode.index ? p : q)) };
          if (e.type === "line")
            return dragNode.index === 0 ? { ...e, x1: p.x, y1: p.y } : { ...e, x2: p.x, y2: p.y };
          if (e.type === "circle")
            return dragNode.index === 0
              ? { ...e, cx: p.x, cy: p.y }
              : { ...e, r: dist(p, { x: e.cx, y: e.cy }) };
          return e;
        }),
      );
      return;
    }
    if (moveRef.current) {
      const { from, ids, base } = moveRef.current;
      const p = snapPoint(raw);
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      if (Math.hypot(dx, dy) > 0.5) {
        moveRef.current.moved = true;
        setEntities(base.map((e) => (ids.includes(e.id) ? translate(e, dx, dy) : e)));
      }
      return;
    }
    if (marquee) {
      setMarquee({ a: marquee.a, b: raw });
      return;
    }
    // prévia contínua: arco por 3 pontos e régua
    if (tool === "arc" && pending.length) {
      const p = snapPoint(raw);
      const [a, b] = pending;
      if (pending.length === 1 && a)
        setDraft({
          id: uid(),
          layer: activeLayer,
          type: "line",
          x1: a.x,
          y1: a.y,
          x2: p.x,
          y2: p.y,
        });
      else if (a && b) setDraft(arcFrom3(a, b, p, activeLayer));
      return;
    }
    if (tool === "measure" && pending.length === 1) {
      setLiveMeasure({ a: pending[0]!, b: snapPoint(raw) });
      return;
    }
    if (tool === "polyline" && pending.length) {
      let p = snapPoint(raw);
      if (orthoOn) {
        const p0 = pending[pending.length - 1]!;
        const dx = Math.abs(raw.x - p0.x);
        const dy = Math.abs(raw.y - p0.y);
        p = dx >= dy ? { x: p.x, y: p0.y } : { x: p0.x, y: p.y };
      }
      setDraft({
        id: uid(),
        layer: activeLayer,
        type: "line",
        x1: pending[pending.length - 1]!.x,
        y1: pending[pending.length - 1]!.y,
        x2: p.x,
        y2: p.y,
      });
      return;
    }
    if (pending.length === 1 && draft) {
      let targetP = snapPoint(raw);
      if (orthoOn && tool === "line") {
        const p0 = pending[0]!;
        const dx = Math.abs(raw.x - p0.x);
        const dy = Math.abs(raw.y - p0.y);
        targetP = dx >= dy ? { x: targetP.x, y: p0.y } : { x: p0.x, y: targetP.y };
      }
      setDraft(buildDraft(tool, pending[0]!, targetP, activeLayer, filletR));
    }
  };

  const onPointerUp = (ev?: React.PointerEvent) => {
    setLoupeVisible(false);
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
    if (ev) ptrsRef.current.delete(ev.pointerId);
    const wasPinching = pinchRef.current !== null;
    if (wasPinching && ptrsRef.current.size < 2) {
      pinchRef.current = null;
      gestureUntilRef.current = performance.now() + 350;
      // continua o pan com o dedo restante, sem salto
      const rest = [...ptrsRef.current.values()][0];
      panRef.current = null;
      return;
    }
    if (wasPinching) return;
    panRef.current = null;

    if (dragNode) {
      setDragNode(null);
      past.current = [...past.current, entities];
      setEntities((list) => revalidateShared(list));
      return;
    }
    if (moveRef.current) {
      const wasMoved = moveRef.current.moved;
      const base = moveRef.current.base;
      moveRef.current = null;
      if (wasMoved) {
        past.current = [...past.current, base];
        // mover pode invalidar um trecho comum ligado a peça fora do grupo
        setEntities((list) => revalidateShared(list));
      }
      return;
    }
    if (marquee) {
      const box = {
        minX: Math.min(marquee.a.x, marquee.b.x),
        maxX: Math.max(marquee.a.x, marquee.b.x),
        minY: Math.min(marquee.a.y, marquee.b.y),
        maxY: Math.max(marquee.a.y, marquee.b.y),
      };
      const crossing = marquee.b.x < marquee.a.x;
      const hits = visible
        .filter((e) => (crossing ? overlaps(boxOf(e), box) : inside(boxOf(e), box)))
        .map((e) => e.id);
      setSelection((s) => expandSelection(entities, Array.from(new Set([...s, ...hits]))));
      setMarquee(null);
      return;
    }
    if (draft && pending.length === 1) {
      const box = boxOf(draft);
      const empty = box.maxX - box.minX < 0.01 && box.maxY - box.minY < 0.01;
      if (!empty) {
        const finalEntity: Entity =
          !draft.id || draft.id === "draft" || draft.id.startsWith("draft-")
            ? { ...draft, id: uid() }
            : draft;
        commit((e) => [...e, finalEntity]);
        setSelection([finalEntity.id]);

        // INTEGRAÇÃO DUAL TOOL
        if (dualToolSecondary === "dim") {
          const dim = makeDimension("aligned", [{ kind: "entity", id: finalEntity.id }], 20);
          setDims((list) => [...list, dim]);
          toast.success("Cota técnica gerada automaticamente via Dual Tool.");
          if (!dualToolPinned) setDualToolSecondary(null);
        } else if (dualToolSecondary === "smart_trim") {
          setTool("smart_trim");
          toast.info("Dual Tool: selecione o trecho a aparar.");
        } else {
          setTool("select");
        }
      }
      setDraft(null);
      setPending([]);
    }
  };

  /* ------------------------------------------------------------ atalhos */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const meta = ev.ctrlKey || ev.metaKey;
      if ((meta && ev.key.toLowerCase() === "k") || ev.key.toLowerCase() === "q") {
        ev.preventDefault();
        setQuickCommandOpen((v) => !v);
        return;
      }
      if (meta && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (meta && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        handleManualSave();
        return;
      }
      if (meta && ev.key.toLowerCase() === "y") return redo();
      if (meta && ev.key.toLowerCase() === "d") {
        ev.preventDefault();
        commit((e) => [...e, ...selected.map((s) => ({ ...translate(s, 10, 10), id: uid() }))]);
        return;
      }
      if (meta && ev.key.toLowerCase() === "c") {
        ev.preventDefault();
        clipboardRef.current = copySelection(entities, selection, groups);
        if (clipboardRef.current)
          toast.success(`${clipboardRef.current.entities.length} objeto(s) copiado(s).`);
        return;
      }
      if (meta && ev.key.toLowerCase() === "v" && clipboardRef.current) {
        ev.preventDefault();
        const pasted = pasteClipboard(clipboardRef.current, { x: cursor.x + 10, y: cursor.y + 10 });
        commit((list) => [...list, ...pasted.entities]);
        setGroups((list) => [...list, ...pasted.groups]);
        setSelection(pasted.ids);
        return;
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selection.length) {
          commit((e) => e.filter((x) => !selection.includes(x.id)));
          setSelection([]);
        }
        return;
      }
      if (ev.key === "Escape") {
        setPending([]);
        setDraft(null);
        setSelection([]);
        setMeasures([]);
        setTool("select");
      }
      if (ev.key === "Enter" && tool === "polyline") finishPolyline(false);
      if (ev.key === "F3") {
        ev.preventDefault();
        fitTo(entities);
      }
      if (ev.key === "F4") {
        ev.preventDefault();
        setView({ tx: 80, ty: 80, k: 1 });
      }
      const map: Record<string, Tool> = {
        v: "select",
        n: "node",
        h: "pan",
        l: "line",
        p: "polyline",
        c: "circle",
        a: "arc",
        r: "rect",
        x: "text",
        g: "polygon",
        o: "offset",
        t: "trim",
        e: "extend",
        f: "fillet",
        m: "measure",
      };
      const next = map[ev.key.toLowerCase()];
      if (next && !meta) setTool(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selection,
    selected,
    commit,
    tool,
    finishPolyline,
    fitTo,
    entities,
    groups,
    cursor,
    handleManualSave,
  ]);

  /* ------------------------------------------------------------- ações */
  const applySelection = (fn: (e: Entity) => Entity) =>
    commit((list) => revalidateShared(list.map((e) => (selection.includes(e.id) ? fn(e) : e))));

  const selBox = useMemo(() => bbox(selected), [selected]);
  /* leitura fora do ciclo de render: medir nunca dispara novo render */
  const selBoxRef = useRef<Box | null>(null);
  selBoxRef.current = selBox;
  const center: Vec2 = selBox
    ? { x: (selBox.minX + selBox.maxX) / 2, y: (selBox.minY + selBox.maxY) / 2 }
    : { x: 0, y: 0 };

  const onImportConfirm = (next: Entity[]) => {
    commit((e) => [...e, ...next]);
    requestAnimationFrame(() => fitTo([...entities, ...next]));
  };

  const pickTool = useCallback(
    (id: Tool) => {
      if (id === "text") setTextOpen(true);
      if (id === "divide") {
        if (selected.length >= 1 && canDivideEntity(selected[0])) {
          setDivideTargetEntity(selected[0]);
          setDivideEditorOpen(true);
        }
      }
      setTool(id);
      setPending([]);
      setDraft(null);
    },
    [selected],
  );

  const copySelected = useCallback(() => {
    clipboardRef.current = copySelection(entities, selection, groups);
    if (clipboardRef.current)
      toast.success(`${clipboardRef.current.entities.length} objeto(s) copiado(s).`);
  }, [entities, selection, groups]);

  const selectionActions = (
    <>
      <IconBtn label="Copiar" onClick={copySelected} icon={Copy} flat />
      <IconBtn
        label="Dividir em N Partes"
        onClick={() => handleOpenDivide()}
        icon={Divide}
        flat
      />
      <IconBtn
        label="Girar 90°"
        onClick={() => applySelection((e) => rotate(e, center, 90))}
        icon={RotateCw}
        flat
      />
      <IconBtn
        label="Espelhar horizontal"
        onClick={() => applySelection((e) => mirror(e, center, "x"))}
        icon={FlipHorizontal2}
        flat
      />
      <IconBtn
        label="Espelhar vertical"
        onClick={() => applySelection((e) => mirror(e, center, "y"))}
        icon={FlipVertical2}
        flat
      />
      <IconBtn
        label="Escala +10%"
        onClick={() => applySelection((e) => scaleEntity(e, center, 1.1))}
        icon={Maximize}
        flat
      />
      <IconBtn
        label="Excluir"
        onClick={() => {
          commit((e) => e.filter((x) => !selection.includes(x.id)));
          setSelection([]);
        }}
        icon={Trash2}
        flat
      />
    </>
  );

  /** Grupo ativo na seleção (badge + botão de isolar membro). */
  const activeGroup = useMemo(() => {
    const gid = selected.find((e) => e.group)?.group;
    return gid ? (groups.find((g) => g.id === gid) ?? null) : null;
  }, [selected, groups]);

  /**
   * HIERARQUIA VISUAL DINÂMICA DO GRID (CHAMFER CAD)
   * Nível 1: GRID SECUNDÁRIO — subdivisões finas para orientação, baixa opacidade (~10-18% Dark / 10-15% Light)
   * Nível 2: GRID PRINCIPAL — divisões intermediárias regulares, ex: 50mm, opacidade ~25-35% Dark / 22-32% Light
   * Nível 3: GRID MACRO — linhas principais de referência espacial, ex: 100mm, opacidade ~35-40%
   * Nível 4: EIXOS X e Y — alinhados a (0,0), vermelho e verde técnicos com destaque 70-90%
   *
   * O SNAP preserva 100% da precisão configurada pelo usuário (independente das linhas ocultadas pelo zoom).
   */
  const gridConfig = useMemo(() => {
    const g = Math.max(0.1, grid);
    const k = view.k;

    // Escala métrica progressiva com passos harmoniosos baseados no grid ativo
    const rawSteps = [
      g * 0.1,
      g * 0.2,
      g * 0.5,
      g,
      g * 5,
      g * 10,
      g * 50,
      g * 100,
      g * 500,
      g * 1000,
      g * 5000,
    ];

    const steps = rawSteps.filter((s) => s >= 0.1);

    // Encontra o passo secundário ideal (onde o espaçamento em pixels fique entre 8px e 40px)
    let subIndex = 0;
    for (let i = 0; i < steps.length - 2; i++) {
      if (steps[i] * k >= 8) {
        subIndex = i;
        break;
      }
      subIndex = i;
    }

    const subStep = steps[subIndex];
    const majorStep = steps[subIndex + 1] ?? subStep * 5;
    const macroStep = steps[subIndex + 2] ?? majorStep * 2;

    const subPx = subStep * k;
    // Fade progressivo para o grid secundário entre 8px e 16px (evita corte abrupto ao dar zoom)
    const subFade = Math.min(1, Math.max(0, (subPx - 8) / 8));

    const majorPx = majorStep * k;
    const majorFade = Math.min(1, Math.max(0, (majorPx - 8) / 8));

    return {
      subStep,
      majorStep,
      macroStep,
      subFade,
      majorFade,
    };
  }, [grid, view.k]);

  const gridStyles = useMemo(() => {
    if (isDark) {
      // TEMA ESCURO — Fundo escuro (#0b0f17 / #090d14)
      // Paleta técnica em tons ardósia fria (slate-400/300) que evita cansaço visual
      const secOpacity = Math.max(0, Math.min(0.16, 0.14 * gridConfig.subFade));
      const majOpacity = Math.max(0, Math.min(0.32, 0.28 * gridConfig.majorFade));
      const macOpacity = 0.38;

      return {
        secondaryStroke: `rgba(148, 163, 184, ${secOpacity.toFixed(3)})`,
        secondaryWidth: 0.75,
        majorStroke: `rgba(148, 163, 184, ${majOpacity.toFixed(3)})`,
        majorWidth: 1.0,
        macroStroke: `rgba(203, 213, 225, ${macOpacity.toFixed(3)})`,
        macroWidth: 1.35,
        // Eixos do sistema CAD (X vermelho técnico, Y verde técnico, destaque 85%)
        axisX: "rgba(239, 68, 68, 0.88)",
        axisY: "rgba(34, 197, 94, 0.88)",
        axisWidth: 1.75,
        originFill: "#ef4444",
        originRing: "rgba(255, 255, 255, 0.90)",
        originText: "rgba(239, 68, 68, 0.95)",
      };
    } else {
      // TEMA CLARO — Fundo claro (#f1f5f9 / papel técnico de engenharia)
      // Linhas em ardósia neutra (slate-600/700) com contraste equilibrado sem competir com a geometria
      const secOpacity = Math.max(0, Math.min(0.14, 0.12 * gridConfig.subFade));
      const majOpacity = Math.max(0, Math.min(0.28, 0.24 * gridConfig.majorFade));
      const macOpacity = 0.34;

      return {
        secondaryStroke: `rgba(71, 85, 105, ${secOpacity.toFixed(3)})`,
        secondaryWidth: 0.75,
        majorStroke: `rgba(51, 65, 85, ${majOpacity.toFixed(3)})`,
        majorWidth: 1.0,
        macroStroke: `rgba(30, 41, 59, ${macOpacity.toFixed(3)})`,
        macroWidth: 1.35,
        // Eixos do sistema CAD (destaque 80%)
        axisX: "rgba(220, 38, 38, 0.85)",
        axisY: "rgba(22, 163, 74, 0.85)",
        axisWidth: 1.75,
        originFill: "#dc2626",
        originRing: "rgba(15, 23, 42, 0.85)",
        originText: "rgba(220, 38, 38, 0.95)",
      };
    }
  }, [isDark, gridConfig]);

  const isMobile = useIsMobile();
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== "undefined" ? window.innerWidth > window.innerHeight : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [mobileEditorOpenManual, setMobileEditorOpenManual] = useState(false);
  const [activeEditingProp, setActiveEditingProp] = useState<{
    key: string;
    label: string;
    value: number;
    unit: string;
  } | null>(null);

  // Entidade única selecionada para o editor contextual mobile
  const selectedEntity = useMemo(() => {
    if (selected.length === 1) {
      return selected[0] ?? null;
    }
    return null;
  }, [selected]);

  // Editor contextual móvel aberto quando 1 entidade está selecionada OU manualmente (Regra 2)
  const mobileEditorOpen = !solidOpen && !divideEditorOpen && (
    (selected.length === 1 && (isMobile || (typeof window !== "undefined" && window.innerWidth < 1024))) ||
    mobileEditorOpenManual
  );

  // Enquadramento Inteligente do CAD (Regra 7)
  useSmartFraming({
    isOpen: mobileEditorOpen,
    selectedEntity,
    view,
    setView,
    canvasWidth: canvasSize.w,
    canvasHeight: canvasSize.h,
  });

  // Janela lateral direita estruturada do CHAMFER (Propriedades / Camadas / Corte / Cotas)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [activeSidebarTab, setActiveSidebarTab] = useState<ChamferSidebarTab>("propriedades");

  // Contextual CAD: ao selecionar entidade(s), foca na aba Propriedades
  useEffect(() => {
    if (selected.length > 0) {
      setActiveSidebarTab((prev) => (prev === "propriedades" ? prev : "propriedades"));
    }
  }, [selected.length]);

  // A janela lateral direita do CHAMFER agora é gerenciada por ChamferRightSidebar (Região D)
  const panelOpen = false;

  const aside = panelOpen ? (
    <aside
      className={cn(
        "flex w-56 shrink-0 flex-col overflow-y-auto rounded-2xl border p-2 shadow-lg transition-colors select-none",
        isDark
          ? "border-slate-800 bg-slate-950/95 text-slate-200"
          : "border-slate-200 bg-white/95 text-slate-800 shadow-md",
      )}
    >
      <div className="mb-2 flex items-center gap-1">
        <PanelTab
          active={!showLayers && !showCut && !showDims2}
          onClick={() => {
            setShowLayers(false);
            setShowCut(false);
            setShowDims2(false);
          }}
          label="Propriedades"
        />
        <PanelTab
          active={showLayers}
          onClick={() => {
            setShowLayers(true);
            setShowCut(false);
            setShowDims2(false);
          }}
          label="Camadas"
        />
        <PanelTab
          active={showCut}
          onClick={() => {
            setShowCut(true);
            setShowLayers(false);
            setShowDims2(false);
          }}
          label="Corte"
        />
        <PanelTab
          active={showDims2}
          onClick={() => {
            setShowDims2(true);
            setShowCut(false);
            setShowLayers(false);
          }}
          label="Cotas"
        />
        <button
          aria-label="Fechar painel"
          onClick={() => {
            setShowLayers(false);
            setShowCut(false);
            setShowDims2(false);
            setSelection([]);
          }}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {showDims2 ? (
        <DimensionsPanel
          dims={dims}
          entities={entities}
          kind={dimKind}
          onKind={(k) => {
            setDimKind(k);
            setDimPicks([]);
            setTool("dim");
          }}
          selected={dimSel}
          onSelect={setDimSel}
          onChange={(d) => setDims((list) => list.map((x) => (x.id === d.id ? d : x)))}
          onDelete={(id) => {
            setDims((list) => list.filter((x) => x.id !== id));
            setDimSel(null);
          }}
        />
      ) : showCut ? (
        <CutPanel
          entities={entities}
          commit={commit}
          selection={selection}
          setSelection={setSelection}
          groups={groups}
          setGroups={setGroups}
          onHighlight={setShareHint}
          onPickStart={() => setStartPicking((s) => !s)}
          startPicking={startPicking}
        />
      ) : showLayers ? (
        <div className="space-y-0.5">
          {[...layers]
            .filter((l) => isUserLayer(l.id))
            .sort((a, b) => layerOrder(b.id) - layerOrder(a.id))
            .map((l) => (
              <div key={l.id} className="flex items-center gap-1.5 rounded-xl px-1 py-1.5">
                <button
                  onClick={() => setActiveLayer(l.id)}
                  className={cn(
                    "size-3 shrink-0 rounded-full",
                    activeLayer === l.id && "ring-2 ring-offset-1 ring-offset-background",
                  )}
                  style={{
                    background: techColor(l.id),
                    ...(activeLayer === l.id
                      ? { boxShadow: `0 0 0 2px ${SELECTION_COLOR}55` }
                      : {}),
                  }}
                  aria-label={`Camada ativa: ${l.name}`}
                />
                <span className="min-w-0 flex-1 truncate text-[11px]">{l.name}</span>
                <button
                  aria-label={l.visible ? "Ocultar" : "Mostrar"}
                  onClick={() =>
                    setLayers((ls) =>
                      ls.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)),
                    )
                  }
                  className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                >
                  {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button
                  aria-label={l.locked ? "Desbloquear" : "Bloquear"}
                  onClick={() =>
                    setLayers((ls) =>
                      ls.map((x) => (x.id === l.id ? { ...x, locked: !x.locked } : x)),
                    )
                  }
                  className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                >
                  {l.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                </button>
              </div>
            ))}
          <div className="mt-2 border-t border-line pt-2">
            <p className="tick-label mb-1 text-muted-foreground">Saída</p>
            <select
              value={outputMode}
              onChange={(ev) => setOutputMode(ev.target.value as OutputMode)}
              aria-label="Modo de saída"
              className="w-full rounded-lg border border-line bg-background/40 px-1.5 py-1 font-mono text-[10px] outline-none"
            >
              <option value="completo">Completo</option>
              <option value="producao">Produção</option>
              <option value="corte">Somente corte</option>
              <option value="corte-marcacao">Corte + marcação</option>
            </select>
          </div>
        </div>
      ) : selected.length === 1 ? (
        <DimensionEditor
          e={selected[0]!}
          onChange={(next) => commit((list) => list.map((x) => (x.id === next.id ? next : x)))}
          {...(selected[0]?.type === "text"
            ? {
                onEditText: () => {
                  const current = selected[0];
                  if (!current || current.type !== "text") return;
                  setEditingTextId(current.id);
                  setTextSpec({
                    text: current.text,
                    width:
                      current.width ??
                      Math.max(current.size, current.text.length * current.size * 0.6),
                    height: current.size,
                    bold: !!current.bold,
                    italic: !!current.italic,
                  });
                  setTextOpen(true);
                },
              }
            : {})}
          layers={layers}
          actions={selectionActions}
        />
      ) : (
        <div className="space-y-2">
          {activeGroup && (
            <div className="flex items-center gap-1">
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[9px] text-accent">
                {activeGroup.name}
              </span>
              <button
                onClick={() => setSelection(selection.slice(0, 1))}
                className="rounded-lg border border-line px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
              >
                Selecionar só este
              </button>
            </div>
          )}
          <MultiSelectPanel
            entities={entities}
            selected={selected}
            setSelection={setSelection}
            commit={commit}
            layers={layers}
            groups={groups}
            setGroups={setGroups}
            onOpenCenterDialog={handleOpenCenterDialog}
          />
          <div className="flex flex-wrap gap-1 border-t border-line pt-2">{selectionActions}</div>
        </div>
      )}
    </aside>
  ) : null;

  const selectionText = useMemo(() => {
    if (selected.length === 0) return "Nenhuma seleção";
    if (selected.length === 1) {
      const ent = selected[0];
      if (!ent) return "1 entidade selecionada";
      switch (ent.type) {
        case "line": {
          const len = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1).toFixed(1);
          return `Linha (L: ${len} mm)`;
        }
        case "circle":
          return `Círculo (Ø ${(ent.r * 2).toFixed(1)} mm)`;
        case "arc":
          return `Arco (R ${ent.r.toFixed(1)} mm)`;
        case "polyline": {
          const b = boxOf(ent);
          const w = (b.maxX - b.minX).toFixed(1);
          const h = (b.maxY - b.minY).toFixed(1);
          return ent.closed
            ? `Retângulo/Polilinha (${w} × ${h} mm)`
            : `Polilinha (${ent.pts.length} vértices)`;
        }
        case "ellipse":
          return `Elipse (${(ent.rx * 2).toFixed(1)} × ${(ent.ry * 2).toFixed(1)} mm)`;
        case "point":
          return `Ponto (${ent.x.toFixed(1)}, ${ent.y.toFixed(1)})`;
        case "text":
          return `Texto ("${ent.text}")`;
        case "path":
          return `Curva Bézier`;
        case "hatch":
          return `Hachura`;
        default:
          return "1 entidade selecionada";
      }
    }
    return `${selected.length} entidades selecionadas`;
  }, [selected]);

  const operationFeedback = useMemo(() => {
    return getOperationFeedback(tool, pending.length, selected.length);
  }, [tool, pending.length, selected.length]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "fixed inset-0 z-50 flex h-[100dvh] w-[100vw] max-w-none flex-col gap-1 overflow-hidden rounded-none p-1 transition-colors select-none",
        isDark ? "bg-[#0b0f17] text-slate-100" : "bg-[#f1f5f9] text-slate-900",
        isMestre && "glow-ring",
      )}
    >
      {needsRotate && !rotateDismissed && (
        <RotateGate
          onRetry={() => void requestLandscape()}
          onContinue={() => setRotateDismissed(true)}
          onExit={leaveEditor}
        />
      )}
      {/* REGIÃO A — HEADER SUPERIOR DEFINITIVO CAD (BARRA FIXA COM SWIPE HORIZONTAL) */}
      {!focus && (
        <header
          ref={topBarRef}
          onPointerDown={handleTopBarPointerDown}
          onPointerMove={handleTopBarPointerMove}
          onPointerUp={handleTopBarPointerUp}
          onPointerCancel={handleTopBarPointerUp}
          onWheel={handleTopBarWheel}
          className={cn(
            "flex h-10 shrink-0 w-full items-center justify-between gap-3 border-b px-2.5 shadow-xs backdrop-blur-md transition-colors select-none",
            "overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing",
            isDark
              ? "border-slate-800 bg-slate-950/95 text-slate-100"
              : "border-slate-200 bg-white/95 text-slate-800 shadow-xs",
          )}
        >
          {/* LADO ESQUERDO: [ ← VOLTAR ] + [ CHAMFER · NOME DO PROJETO ] + [ DOSSIÊ ] */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                if (
                  saveStatus === "pendente" &&
                  (chamferSettings.autoSave || chamferSettings.recoveryEnabled)
                ) {
                  performSave();
                }
                leaveEditor();
              }}
              aria-label="Voltar para a tela anterior"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors",
                isDark
                  ? "border-slate-700/80 bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900",
              )}
            >
              <ArrowLeft className="size-3.5" /> Voltar
            </button>

            <span className={cn("h-4 w-px", isDark ? "bg-slate-800" : "bg-slate-200")} />

            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold tracking-wider text-red-600">CHAMFER</span>
              {project && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    setNewProjectName(`Projeto ${Date.now().toString().slice(-4)}`);
                    setNewProjectDialogOpen(true);
                  }}
                  className={cn(
                    "hidden md:inline font-mono text-[11px] font-semibold transition-colors truncate max-w-[140px]",
                    isDark ? "text-slate-200 hover:text-white" : "text-slate-800 hover:text-slate-950",
                  )}
                  title={`Documento: ${project.name} (clique para alternar/criar)`}
                >
                  · {project.name}
                </button>
              )}
              {dossier && (
                <button
                  onClick={() =>
                    navigate({
                      to: "/projetos/$projectId",
                      params: { projectId: dossier.projectId },
                    })
                  }
                  title={`${dossier.projectName} · ${dossier.partName}`}
                  className={cn(
                    "hidden lg:inline rounded-md px-2 py-0.5 font-mono text-[9px] tracking-wider uppercase border truncate max-w-[120px]",
                    isDark
                      ? "bg-red-950/50 text-red-300 border-red-500/30"
                      : "bg-red-50 text-red-700 border-red-200",
                  )}
                >
                  {dossier.partCode || dossier.partName}
                </button>
              )}
            </div>
          </div>

          {/* REGIÃO CENTRAL: CONTROLE PRINCIPAL DE MUDANÇA DE AMBIENTE [ 2D SKETCH | 3D SÓLIDO | FLANGES ] */}
          <div className="flex shrink-0 items-center justify-center">
            <div
              className={cn(
                "flex items-center rounded-lg border p-0.5 shadow-xs",
                isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-100",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setActiveMode("2d");
                  setSolidOpen(false);
                }}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
                  activeMode === "2d"
                    ? "bg-red-600 text-white shadow-xs"
                    : isDark
                      ? "text-slate-400 hover:text-slate-200"
                      : "text-slate-600 hover:text-slate-900",
                )}
              >
                2D SKETCH
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setActiveMode("3d");
                  setSolidOpen(true);
                  if (drawable.length > 0) fitTo(drawable);
                }}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
                  activeMode === "3d"
                    ? "bg-red-600 text-white shadow-xs"
                    : isDark
                      ? "text-slate-400 hover:text-slate-200"
                      : "text-slate-600 hover:text-slate-900",
                )}
              >
                3D SÓLIDO
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setActiveMode("flanges");
                  setSolidOpen(true);
                }}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
                  activeMode === "flanges"
                    ? "bg-red-600 text-white shadow-xs"
                    : isDark
                      ? "text-slate-400 hover:text-slate-200"
                      : "text-slate-600 hover:text-slate-900",
                )}
              >
                FLANGES
              </button>
            </div>
          </div>

          {/* LADO DIREITO: HISTÓRICO + SALVAMENTO/STATUS + FERRAMENTAS GLOBAIS */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* HISTÓRICO: [ DESFAZER | REFAZER ] */}
            <div
              className={cn(
                "flex items-center rounded-lg border p-0.5",
                isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-100",
              )}
            >
              <button
                type="button"
                onClick={undo}
                title="Desfazer ação (Ctrl+Z)"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  isDark ? "text-slate-300 hover:bg-slate-800 hover:text-white" : "text-slate-700 hover:bg-slate-200 hover:text-slate-900",
                )}
              >
                <Undo2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={redo}
                title="Refazer ação (Ctrl+Y)"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  isDark ? "text-slate-300 hover:bg-slate-800 hover:text-white" : "text-slate-700 hover:bg-slate-200 hover:text-slate-900",
                )}
              >
                <Redo2 className="size-3.5" />
              </button>
            </div>

            {/* BOTÃO SALVAR E INDICADOR DE ESTADO RESPEITANDO A CONFIGURAÇÃO */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleManualSave}
                title="Salvar documento agora (Ctrl+S)"
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold transition-all shadow-xs",
                  saveStatus === "pendente"
                    ? isDark
                      ? "border-amber-500/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60"
                      : "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : isDark
                      ? "border-slate-700/80 bg-slate-900/90 text-slate-200 hover:bg-slate-800 hover:text-white"
                      : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-950",
                )}
              >
                {saveStatus === "salvando" ? (
                  <Loader2 className="size-3 animate-spin text-amber-500" />
                ) : (
                  <Check className="size-3 text-emerald-500" />
                )}
                <span>Salvar</span>
              </button>

              {/* INDICADOR DISCRETO DO ESTADO DO DOCUMENTO */}
              <span
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-mono border font-semibold uppercase tracking-wider transition-colors",
                  saveStatus === "salvo" &&
                    (isDark
                      ? "text-emerald-400 bg-emerald-950/60 border-emerald-500/30"
                      : "text-emerald-700 bg-emerald-50 border-emerald-300"),
                  saveStatus === "salvando" &&
                    (isDark
                      ? "text-amber-400 bg-amber-950/60 border-amber-500/30"
                      : "text-amber-800 bg-amber-50 border-amber-300"),
                  saveStatus === "pendente" &&
                    (isDark
                      ? "text-amber-300 bg-amber-950/60 border-amber-500/50 animate-pulse"
                      : "text-amber-900 bg-amber-100/90 border-amber-400"),
                )}
                title={
                  chamferSettings.autoSave
                    ? `Salvamento automático ativo (a cada ${chamferSettings.autoSaveIntervalSec}s)`
                    : "Salvamento manual ativado nas configurações do projeto"
                }
              >
                {saveStatus === "salvo" && (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span>Salvo</span>
                  </>
                )}
                {saveStatus === "salvando" && (
                  <>
                    <Loader2 className="size-2.5 animate-spin text-amber-500" />
                    <span>Salvando...</span>
                  </>
                )}
                {saveStatus === "pendente" && (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span className="hidden md:inline">Alterações não salvas</span>
                    <span className="md:hidden">Não salvo</span>
                  </>
                )}
              </span>
            </div>

            <span className={cn("h-4 w-px", isDark ? "bg-slate-800" : "bg-slate-200")} />

            {/* FERRAMENTAS GLOBAIS */}
            {/* CHAMFER VISION — FERRAMENTA OFICIAL DO CHAMFER COM ÍCONE OFICIAL */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("action");
                setVisionOpen(true);
              }}
              title="CHAMFER VISION — Reconhecimento e vetorização inteligente de peças"
              aria-label="Abrir CHAMFER VISION"
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold uppercase transition-all shadow-2xs",
                isDark
                  ? "border-red-500/40 bg-red-950/40 text-red-300 hover:bg-red-900/60 hover:text-white hover:border-red-400"
                  : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-950 hover:border-red-400",
              )}
            >
              <ScanEye className="size-3.5 text-red-500" />
              <span className="hidden xl:inline">CHAMFER VISION</span>
              <span className="xl:hidden">VISION</span>
            </button>
            <IconBtn
              label="Camadas"
              onClick={() => {
                if (rightSidebarOpen && activeSidebarTab === "camadas") {
                  setRightSidebarOpen(false);
                } else {
                  setActiveSidebarTab("camadas");
                  setRightSidebarOpen(true);
                }
              }}
              icon={LayersIcon}
              active={rightSidebarOpen && activeSidebarTab === "camadas"}
              title="Gerenciamento de camadas técnicas"
            />
            <IconBtn
              label="Exportar"
              onClick={() => setExportOpen(true)}
              icon={Download}
              title="Exportar DXF, SVG, PNG, PDF"
            />
            <IconBtn
              label="Corte CNC"
              onClick={() => setCncOpen(true)}
              icon={Scissors}
              title="Ferramenta de Corte e Exportação DXF CNC direta"
            />
            <IconBtn
              label="Comando (Q)"
              onClick={() => setQuickCommandOpen(true)}
              icon={Search}
              title="Busca rápida de comandos CAD (Atalho: Q ou Ctrl+K)"
            />
            <IconBtn
              label="Topologia"
              onClick={() => setTopologyHealthOpen(true)}
              icon={Activity}
              title="Auditoria de topologia e Auto-Heal (saúde do desenho)"
            />
            <IconBtn
              label="Presets"
              onClick={() => setPresetsModalOpen(true)}
              icon={Boxes}
              title="Catálogo de presets paramétricos (Flanges, tubos, sapatas)"
            />
            <div className="relative">
              <IconBtn
                label="Mais"
                onClick={() => setMoreOpen((m) => !m)}
                icon={MoreHorizontal}
                active={moreOpen}
                title="Mais opções e ferramentas avançadas"
              />
              {moreOpen && (
                <div className="metal hairline pop-in fixed top-12 right-3 z-[70] w-56 rounded-2xl p-1.5 shadow-xl">
                  <MenuItem
                    label="Folha Técnica e Legenda"
                    icon={FileText}
                    onClick={() => {
                      setMoreOpen(false);
                      setTechnicalSheetModalOpen(true);
                    }}
                  />
                  <MenuItem
                    label="Tabela de Variáveis"
                    icon={Sliders}
                    onClick={() => {
                      setMoreOpen(false);
                      setVariablesModalOpen(true);
                    }}
                  />
                  <MenuItem
                    label="Novo projeto CHAMFER"
                    icon={FolderPlus}
                    onClick={() => {
                      setMoreOpen(false);
                      setNewProjectName(`Projeto ${Date.now().toString().slice(-4)}`);
                      setNewProjectDialogOpen(true);
                    }}
                  />
                  <MenuItem
                    label="Projetos salvos"
                    icon={FolderOpen}
                    onClick={() => {
                      setMoreOpen(false);
                      leaveEditor();
                    }}
                  />
                  <div className="my-1 h-px bg-line" />
                  <MenuItem
                    label="Centralizar peça"
                    icon={Crosshair}
                    onClick={() => {
                      centerPiece(true);
                      setMoreOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Enquadrar área de trabalho"
                    icon={Frame}
                    onClick={() => {
                      fitFrame();
                      setMoreOpen(false);
                    }}
                  />
                  <div className="my-1 h-px bg-line" />
                  <div className="px-2 py-1.5">
                    <p className="tick-label mb-1 text-muted-foreground">Área de trabalho (mm)</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        aria-label="Largura da área de trabalho"
                        value={frame.w}
                        onChange={(ev) =>
                          updateFrame({ w: clampSide(Number(ev.target.value), frame.w) })
                        }
                        className="w-16 rounded-lg border border-line bg-background/40 px-1.5 py-1 text-center font-mono text-[10px] outline-none"
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">×</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        aria-label="Altura da área de trabalho"
                        value={frame.h}
                        onChange={(ev) =>
                          updateFrame({ h: clampSide(Number(ev.target.value), frame.h) })
                        }
                        className="w-16 rounded-lg border border-line bg-background/40 px-1.5 py-1 text-center font-mono text-[10px] outline-none"
                      />
                    </div>
                    <button
                      onClick={() => updateFrame({ showDims: !frame.showDims })}
                      className="mt-1.5 w-full rounded-lg border border-line px-2 py-1 font-mono text-[9px] tracking-widest text-muted-foreground uppercase hover:text-foreground"
                    >
                      {frame.showDims ? "Ocultar dimensões" : "Mostrar dimensões"}
                    </button>
                  </div>
                  <div className="my-1 h-px bg-line" />
                  <MenuItem
                    label={showDims ? "Ocultar medidas" : "Mostrar medidas"}
                    icon={Ruler}
                    onClick={() => {
                      setShowDims((s) => !s);
                      setMoreOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Verificar geometria"
                    icon={Triangle}
                    onClick={() => {
                      const found = verify(entities);
                      setIssues(found);
                      if (found.length) {
                        toast.warning(`${found.length} problemas encontrados`);
                      } else {
                        toast.success("Geometria válida");
                      }
                      setMoreOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Otimizar"
                    icon={Spline}
                    onClick={() => {
                      const res = optimize(entities);
                      commit(res.entities);
                      toast.success(`${res.removed + res.tiny} entidades limpas`);
                      setMoreOpen(false);
                    }}
                  />
                  <MenuItem
                    label={isMestre ? "CHAMFER VISION" : "CHAMFER VISION · Mestre"}
                    icon={ScanEye}
                    onClick={() => {
                      setMoreOpen(false);
                      if (!isMestre) {
                        toast.info("CHAMFER VISION é exclusivo do Modo Mestre.");
                        return;
                      }
                      setVisionOpen(true);
                    }}
                  />
                  {imageLayer && (
                    <>
                      <MenuItem
                        label={imageLayer.visible ? "Ocultar imagem" : "Mostrar imagem"}
                        icon={ImageIcon}
                        onClick={() => {
                          setImageLayer({ ...imageLayer, visible: !imageLayer.visible });
                          setMoreOpen(false);
                        }}
                      />
                      <label className="flex items-center gap-2 rounded-xl px-2 py-2 text-[11px] text-muted-foreground">
                        <ImageIcon className="size-3.5" />
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={imageLayer.opacity}
                          onChange={(ev) =>
                            setImageLayer({ ...imageLayer, opacity: Number(ev.target.value) })
                          }
                          className="w-full accent-[var(--accent)]"
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>

            <IconBtn
              label={isDark ? "Tema Claro" : "Tema Escuro"}
              onClick={toggleTheme}
              icon={isDark ? Sun : Moon}
              title={isDark ? "Mudar para Tema Claro" : "Mudar para Tema Escuro"}
            />
            <IconBtn
              label="Tela Cheia"
              onClick={toggleFullscreen}
              icon={focus ? Minimize : Maximize}
              title="Alternar modo tela cheia / foco"
            />
          </div>
        </header>
      )}

      {/* CORPO DO WORKSPACE CAD: TOOLBAR VERTICAL (ESQUERDA) + CANVAS (CENTRO) + PROPRIEDADES (DIREITA) */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-1.5 p-1 pt-0">
        {/* REGIÃO B — TOOLBAR VERTICAL ESQUERDA (8 GRUPOS CANÔNICOS CAD) */}
        {!focus && (
          <ChamferCadToolbar
            tool={tool}
            onPickTool={pickTool}
            activeMode={activeMode}
            onModeChange={(m) => {
              triggerHaptic("selection");
              setActiveMode(m);
              if (m === "3d" || m === "flanges") {
                setSolidOpen(true);
                if (drawable.length > 0) fitTo(drawable);
              } else {
                setSolidOpen(false);
              }
            }}
            hasSelection={selected.length > 0}
            selectedCount={selected.length}
            offsetDist={offsetDist}
            setOffsetDist={setOffsetDist}
            filletR={filletR}
            setFilletR={setFilletR}
            onMoveSelection={handleMoveSelection}
            onCopySelection={handleCopySelection}
            onRotateSelection={handleRotateSelection}
            onMirrorSelection={handleMirrorSelection}
            onScaleSelection={handleScaleSelection}
            onStretchSelection={handleStretchSelection}
            onBreakSelection={handleBreakSelection}
            onJoinSelection={handleJoinSelection}
            onExplodeSelection={handleExplodeSelection}
            onDivideSelection={() => handleOpenDivide()}
            onCenterSelection={handleOpenCenterDialog}
            onArrayLinear={handleArrayLinear}
            onArrayPolar={handleArrayPolar}
            onOpenQuickCommand={() => setQuickCommandOpen(true)}
            onOpenTopologyHealth={() => setTopologyHealthOpen(true)}
            onOpenPresets={() => setPresetsModalOpen(true)}
            onOpenTechnicalSheet={() => setTechnicalSheetModalOpen(true)}
            onOpenVariables={() => setVariablesModalOpen(true)}
            snapOn={snapOn}
            setSnapOn={setSnapOn}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            grid={grid}
            setGrid={setGrid}
            orthoOn={orthoOn}
            setOrthoOn={setOrthoOn}
            trackingOn={trackingOn}
            setTrackingOn={setTrackingOn}
            dimKind={dimKind}
            onPickDimKind={(k) => {
              setDimKind(k);
              setTool("dim");
            }}
            thickness={thickness}
            onThicknessChange={setThickness}
            onConvertToBend={handleConvertToBend}
            onAddHole={handleAddHole}
            onPlanificar={handlePlanificar}
            onOpenFlanges={handleOpenFlanges}
            onApplyRelief={handleApplyRelief}
            onUnfold={handleUnfold}
            onFold={handleFold}
            isDark={isDark}
          />
        )}

        {/* REGIÃO C — CANVAS CAD PRINCIPAL (DOMINANTE, OCUPANDO A MAIOR ÁREA POSSÍVEL) */}
        <div
          ref={canvasViewportRef}
          className={cn(
            "relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border shadow-inner transition-colors",
            isDark
              ? "border-slate-800 bg-[#0d121c]"
              : "border-slate-200 bg-[#ffffff]",
          )}
        >
          {solidOpen ? (
            <div className="relative size-full">
              <Cad3DStage
                open={true}
                onClose={() => {
                  setActiveMode("2d");
                  setSolidOpen(false);
                }}
                entities={drawable}
                thickness={thickness}
                onThickness={setThickness}
                title={project?.name ?? "Peça Chamfer"}
                labProjectId={projectId}
                selection={selection}
                onSelectEntity={(id) => setSelection(id ? [id] : [])}
                initialCadPanelOpen={activeMode === "flanges"}
              />
            </div>
          ) : (
            <>
              {/* GRADE CAD REAL E FUNCIONAL (ACOMPANHA ZOOM, PAN E ORIGEM DE COORDENADAS) */}
              {showGrid && !solidOpen && (
                <svg className="pointer-events-none absolute inset-0 size-full">
                  <defs>
                    {/* 1. GRID SECUNDÁRIO — subdivisões finas (10-18% Dark / 10-15% Light, adaptável ao zoom) */}
                    {gridConfig.subFade > 0.02 && (
                      <pattern
                        id="chamfer-grid-secondary"
                        width={Math.max(0.1, gridConfig.subStep * view.k)}
                        height={Math.max(0.1, gridConfig.subStep * view.k)}
                        patternUnits="userSpaceOnUse"
                        x={((view.tx % (gridConfig.subStep * view.k)) + (gridConfig.subStep * view.k)) % (gridConfig.subStep * view.k)}
                        y={((view.ty % (gridConfig.subStep * view.k)) + (gridConfig.subStep * view.k)) % (gridConfig.subStep * view.k)}
                      >
                        <path
                          d={`M ${gridConfig.subStep * view.k} 0 H 0 V ${gridConfig.subStep * view.k}`}
                          fill="none"
                          stroke={gridStyles.secondaryStroke}
                          strokeWidth={gridStyles.secondaryWidth}
                          shapeRendering="crispEdges"
                        />
                      </pattern>
                    )}

                    {/* 2. GRID PRINCIPAL — divisões intermediárias (25-35% Dark / 22-32% Light, ex: 50mm) */}
                    {gridConfig.majorFade > 0.02 && (
                      <pattern
                        id="chamfer-grid-major"
                        width={Math.max(0.1, gridConfig.majorStep * view.k)}
                        height={Math.max(0.1, gridConfig.majorStep * view.k)}
                        patternUnits="userSpaceOnUse"
                        x={((view.tx % (gridConfig.majorStep * view.k)) + (gridConfig.majorStep * view.k)) % (gridConfig.majorStep * view.k)}
                        y={((view.ty % (gridConfig.majorStep * view.k)) + (gridConfig.majorStep * view.k)) % (gridConfig.majorStep * view.k)}
                      >
                        <path
                          d={`M ${gridConfig.majorStep * view.k} 0 H 0 V ${gridConfig.majorStep * view.k}`}
                          fill="none"
                          stroke={gridStyles.majorStroke}
                          strokeWidth={gridStyles.majorWidth}
                          shapeRendering="crispEdges"
                        />
                      </pattern>
                    )}

                    {/* 3. GRID MACRO / LINHA PRINCIPAL DE REFERÊNCIA — intervalos maiores (~35-40%, ex: 100mm) */}
                    <pattern
                      id="chamfer-grid-macro"
                      width={Math.max(0.1, gridConfig.macroStep * view.k)}
                      height={Math.max(0.1, gridConfig.macroStep * view.k)}
                      patternUnits="userSpaceOnUse"
                      x={((view.tx % (gridConfig.macroStep * view.k)) + (gridConfig.macroStep * view.k)) % (gridConfig.macroStep * view.k)}
                      y={((view.ty % (gridConfig.macroStep * view.k)) + (gridConfig.macroStep * view.k)) % (gridConfig.macroStep * view.k)}
                    >
                      <path
                        d={`M ${gridConfig.macroStep * view.k} 0 H 0 V ${gridConfig.macroStep * view.k}`}
                        fill="none"
                        stroke={gridStyles.macroStroke}
                        strokeWidth={gridStyles.macroWidth}
                        shapeRendering="crispEdges"
                      />
                    </pattern>
                  </defs>

                  {/* Renderização em camadas ordenadas de profundidade e contraste */}
                  {gridConfig.subFade > 0.02 && (
                    <rect width="100%" height="100%" fill="url(#chamfer-grid-secondary)" />
                  )}
                  {gridConfig.majorFade > 0.02 && (
                    <rect width="100%" height="100%" fill="url(#chamfer-grid-major)" />
                  )}
                  {gridConfig.macroStep * view.k >= 8 && (
                    <rect width="100%" height="100%" fill="url(#chamfer-grid-macro)" />
                  )}
                </svg>
              )}
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
          {/* FLUXO CALDRA / PRÉVIA CNC — camada de UI, nunca exportada */}
          {!solidOpen && <canvas ref={flowRef} className="pointer-events-none absolute inset-0 size-full" />}

          <svg
            ref={svgRef}
            className="absolute inset-0 size-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => tool === "polyline" && finishPolyline(false)}
            role="application"
            aria-label="Prancheta vetorial"
          >
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              {/* RENDERIZADOR SVG ESTILO MODELOS DE TRAÇAGEM (Modo 3D / Planificada na mesma tela) */}
              {solidOpen && (
                <TracagemSvgRenderer
                  entities={drawable}
                  zoom={view.k}
                  thickness={thickness}
                  viewMode3D={viewMode3D}
                  showPoints={showPoints3D}
                  showFolds={showFolds3D}
                  showDims={showDims3D}
                  selectedId={selection[0] ?? null}
                  onSelect={(id) => setSelection(id ? [id] : [])}
                />
              )}

              {/* CAMADA IMAGEM — referência do CHAMFER VISION (nunca vira geometria) */}
              {imageLayer && imageLayer.visible && outputMode === "completo" && !solidOpen && (
                <image
                  href={imageLayer.src}
                  x={imageLayer.x}
                  y={imageLayer.y}
                  width={imageLayer.widthMm}
                  height={imageLayer.heightMm}
                  opacity={imageLayer.opacity}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: "none" }}
                />
              )}

              {/* Eixos do Sistema de Coordenadas CAD (alinhados a (0,0) - visíveis quando showGrid está ativo) */}
              {/* Eixos do Sistema de Coordenadas CAD (alinhados a (0,0) - visíveis quando showGrid está ativo) */}
              {!solidOpen && showGrid && (
                <g pointerEvents="none" aria-label="Eixos do sistema CAD">
                  {/* Eixo X: Vermelho técnico com destaque nítido sobre a grade */}
                  <line
                    x1={-1e5}
                    y1={0}
                    x2={1e5}
                    y2={0}
                    stroke={gridStyles.axisX}
                    strokeWidth={gridStyles.axisWidth / view.k}
                  />
                  {/* Eixo Y: Verde técnico com destaque nítido sobre a grade */}
                  <line
                    x1={0}
                    y1={-1e5}
                    x2={0}
                    y2={1e5}
                    stroke={gridStyles.axisY}
                    strokeWidth={gridStyles.axisWidth / view.k}
                  />

                  {/* Marcadores discretos de orientação positiva +X e +Y */}
                  <text
                    x={40 / view.k}
                    y={-5 / view.k}
                    fontSize={8.5 / view.k}
                    fontFamily="ui-monospace, monospace"
                    fontWeight="700"
                    fill={gridStyles.axisX}
                  >
                    +X
                  </text>
                  <text
                    x={6 / view.k}
                    y={40 / view.k}
                    fontSize={8.5 / view.k}
                    fontFamily="ui-monospace, monospace"
                    fontWeight="700"
                    fill={gridStyles.axisY}
                  >
                    +Y
                  </text>

                  {/* Ponto e Rótulo de Origem (0,0) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={3.8 / view.k}
                    fill={gridStyles.originFill}
                    stroke={gridStyles.originRing}
                    strokeWidth={1.2 / view.k}
                  />
                  <text
                    x={6 / view.k}
                    y={-6 / view.k}
                    fontSize={10 / view.k}
                    fontFamily="ui-monospace, monospace"
                    fontWeight="bold"
                    fill={gridStyles.originText}
                  >
                    (0,0)
                  </text>
                </g>
              )}

              {/* WORKSPACE_FRAME — área de trabalho (oculta no modo 3D Traçagem) */}
              {frame.visible && !solidOpen && (
                <g pointerEvents="none">
                  <rect
                    x={0}
                    y={0}
                    width={frame.w}
                    height={frame.h}
                    fill="none"
                    stroke={REFERENCE_COLOR}
                    strokeOpacity={0.85}
                    strokeWidth={1.6 / view.k}
                  />
                  {/* diagonais de canto que fecham a moldura */}
                  {(
                    [
                      [0, 0, 1, 1],
                      [frame.w, 0, -1, 1],
                      [0, frame.h, 1, -1],
                      [frame.w, frame.h, -1, -1],
                    ] as const
                  ).map(([x, y, sx, sy]) => {
                    const c = Math.min(frame.w, frame.h) * 0.06;
                    return (
                      <path
                        key={`${x}-${y}`}
                        d={`M ${x + sx * c} ${y} L ${x} ${y + sy * c}`}
                        fill="none"
                        stroke={REFERENCE_COLOR}
                        strokeOpacity={0.6}
                        strokeWidth={1 / view.k}
                      />
                    );
                  })}
                  {frame.showDims && (
                    <g
                      fill={REFERENCE_COLOR}
                      fillOpacity={0.9}
                      fontFamily="ui-monospace, monospace"
                    >
                      <text
                        x={frame.w / 2}
                        y={-8 / view.k}
                        fontSize={13 / view.k}
                        textAnchor="middle"
                      >
                        {frame.w.toFixed(2)} mm
                      </text>
                      <text
                        x={-8 / view.k}
                        y={frame.h / 2}
                        fontSize={13 / view.k}
                        textAnchor="middle"
                        transform={`rotate(-90 ${-8 / view.k} ${frame.h / 2})`}
                      >
                        {frame.h.toFixed(2)} mm
                      </text>
                      <text
                        x={6 / view.k}
                        y={18 / view.k}
                        fontSize={10 / view.k}
                        fillOpacity={0.55}
                      >
                        ÁREA DE TRABALHO
                      </text>
                    </g>
                  )}
                </g>
              )}

              {/* geometria principal: pintada no canvas sob este SVG */}

              {!solidOpen && draft && <EntityShape e={draft} k={view.k} preview />}

              {/* Pré-visualização da ferramenta DIVIDIR */}
              {!solidOpen && divideEditorOpen && previewDividedEntities.length > 0 && (
                <g className="pointer-events-none">
                  {previewDividedEntities.map((pe, idx) => (
                    <EntityShape
                      key={`preview-div-${pe.id || idx}`}
                      e={pe}
                      k={view.k}
                      preview
                    />
                  ))}
                  {/* Pontos nodais de divisão destacados */}
                  {previewDividedEntities.flatMap((pe) => entityPoints(pe)).map((pt, pIdx) => (
                    <circle
                      key={`preview-div-pt-${pIdx}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={3.8 / view.k}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth={1.4 / view.k}
                    />
                  ))}
                </g>
              )}

              {!solidOpen && pending.length > 0 && tool === "polyline" && (
                <polyline
                  points={pending.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={isDark ? PREVIEW_COLOR : "#475569"}
                  strokeWidth={1.4 / view.k}
                  strokeDasharray={`${4 / view.k} ${3 / view.k}`}
                />
              )}

              {/* nós da seleção */}
              {!solidOpen && (tool === "node" || tool === "select") &&
                selected.flatMap((e, eIdx) =>
                  entityPoints(e).map((p, i) => (
                    <circle
                      key={`node-${e.id || "ent"}-${eIdx}-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={3.2 / view.k}
                      fill={isDark ? "#090d14" : "#ffffff"}
                      stroke={isDark ? SELECTION_COLOR : "#DC2626"}
                      strokeWidth={1.5 / view.k}
                    />
                  )),
                )}

              {selBox && (
                <rect
                  x={selBox.minX}
                  y={selBox.minY}
                  width={selBox.maxX - selBox.minX}
                  height={selBox.maxY - selBox.minY}
                  fill="none"
                  stroke={isDark ? SELECTION_COLOR : "#DC2626"}
                  strokeOpacity={0.65}
                  strokeWidth={1 / view.k}
                  strokeDasharray={`${5 / view.k} ${4 / view.k}`}
                />
              )}

              {marquee && (
                <rect
                  x={Math.min(marquee.a.x, marquee.b.x)}
                  y={Math.min(marquee.a.y, marquee.b.y)}
                  width={Math.abs(marquee.b.x - marquee.a.x)}
                  height={Math.abs(marquee.b.y - marquee.a.y)}
                  fill={isDark ? SELECTION_COLOR : "#DC2626"}
                  fillOpacity={0.08}
                  stroke={isDark ? SELECTION_COLOR : "#DC2626"}
                  strokeWidth={1 / view.k}
                  strokeDasharray={
                    marquee.b.x < marquee.a.x ? `${5 / view.k} ${4 / view.k}` : undefined
                  }
                />
              )}

              {/* FEEDBACK VISUAL TEMPORÁRIO DURANTE EDIÇÃO MOBILE (REGRA 15) */}
              {activeEditingProp && selectedEntity && (
                <g pointerEvents="none" className="transition-opacity duration-150">
                  {selectedEntity.type === "circle" && (
                    <circle
                      cx={selectedEntity.cx}
                      cy={selectedEntity.cy}
                      r={selectedEntity.r}
                      fill="rgba(239, 68, 68, 0.08)"
                      stroke="#EF4444"
                      strokeWidth={2.2 / view.k}
                      strokeDasharray={`${6 / view.k} ${4 / view.k}`}
                    />
                  )}
                  {selectedEntity.type === "arc" && (
                    <circle
                      cx={selectedEntity.cx}
                      cy={selectedEntity.cy}
                      r={selectedEntity.r}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth={2.2 / view.k}
                      strokeDasharray={`${6 / view.k} ${4 / view.k}`}
                    />
                  )}
                  {selectedEntity.type === "line" && (
                    <line
                      x1={selectedEntity.x1}
                      y1={selectedEntity.y1}
                      x2={selectedEntity.x2}
                      y2={selectedEntity.y2}
                      stroke="#EF4444"
                      strokeWidth={3 / view.k}
                      strokeOpacity={0.8}
                    />
                  )}
                  <g
                    transform={`translate(${
                      selectedEntity.type === "circle"
                        ? selectedEntity.cx
                        : selectedEntity.type === "arc"
                        ? selectedEntity.cx
                        : selectedEntity.type === "line"
                        ? (selectedEntity.x1 + selectedEntity.x2) / 2
                        : selectedEntity.type === "point"
                        ? selectedEntity.x
                        : 0
                    } ${
                      selectedEntity.type === "circle"
                        ? selectedEntity.cy - selectedEntity.r - 12 / view.k
                        : selectedEntity.type === "arc"
                        ? selectedEntity.cy - selectedEntity.r - 12 / view.k
                        : selectedEntity.type === "line"
                        ? (selectedEntity.y1 + selectedEntity.y2) / 2 - 12 / view.k
                        : selectedEntity.type === "point"
                        ? selectedEntity.y - 12 / view.k
                        : 0
                    })`}
                  >
                    <rect
                      x={-45 / view.k}
                      y={-11 / view.k}
                      width={90 / view.k}
                      height={22 / view.k}
                      rx={6 / view.k}
                      fill="rgba(15, 23, 42, 0.95)"
                      stroke="#EF4444"
                      strokeWidth={1.2 / view.k}
                    />
                    <text
                      x={0}
                      y={0}
                      fontSize={9.5 / view.k}
                      fontFamily="ui-monospace, monospace"
                      fontWeight="bold"
                      fill="#FFFFFF"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {activeEditingProp.label}: {activeEditingProp.value.toFixed(2)} {activeEditingProp.unit}
                    </text>
                  </g>
                </g>
              )}

              {/* COTAS ASSOCIATIVAS — âmbar técnico, sempre medidas na geometria */}
              {dims.map((d) => {
                const draw = dimensionDraw(d, entities);
                const on = dimSel === d.id;
                return (
                  <g
                    key={d.id}
                    stroke={DIMENSION_COLOR}
                    fill={DIMENSION_COLOR}
                    strokeWidth={(on ? 1.8 : 1) / view.k}
                    opacity={on ? 1 : 0.9}
                    onPointerDown={() => setDimSel(d.id)}
                  >
                    {draw.lines.map((l, i) => (
                      <line key={`l${i}`} x1={l[0].x} y1={l[0].y} x2={l[1].x} y2={l[1].y} />
                    ))}
                    {draw.arcs.map((a, i) => (
                      <path
                        key={`a${i}`}
                        fill="none"
                        d={`M ${a.c.x + a.r * Math.cos(a.a0)} ${a.c.y + a.r * Math.sin(a.a0)} A ${a.r} ${a.r} 0 ${Math.abs(a.a1 - a.a0) > Math.PI ? 1 : 0} 1 ${a.c.x + a.r * Math.cos(a.a1)} ${a.c.y + a.r * Math.sin(a.a1)}`}
                      />
                    ))}
                    {draw.arrows.map((ar, i) => {
                      const s = d.style.arrowSize / view.k;
                      const p1 = `${ar.p.x + Math.cos(ar.angle + 0.25) * s},${ar.p.y + Math.sin(ar.angle + 0.25) * s}`;
                      const p2 = `${ar.p.x + Math.cos(ar.angle - 0.25) * s},${ar.p.y + Math.sin(ar.angle - 0.25) * s}`;
                      return (
                        <polygon
                          key={`r${i}`}
                          points={`${ar.p.x},${ar.p.y} ${p1} ${p2}`}
                          stroke="none"
                        />
                      );
                    })}
                    {draw.labels.map((l, i) => (
                      <text
                        key={`t${i}`}
                        x={l.p.x}
                        y={l.p.y - 3 / view.k}
                        fontSize={d.style.textSize / view.k}
                        textAnchor="middle"
                        stroke="none"
                        className="font-mono"
                      >
                        {l.text}
                      </text>
                    ))}
                  </g>
                );
              })}

              {/* cotas automáticas de apoio */}
              {showDims &&
                autoDimensions(drawable).map((d, i) => {
                  const mx = (d.a.x + d.b.x) / 2;
                  const my = (d.a.y + d.b.y) / 2;
                  const ang = (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
                  const flip = ang > 90 || ang < -90 ? 180 : 0;
                  return (
                    <g key={`dim-${i}`} stroke={DIMENSION_COLOR} fill={DIMENSION_COLOR}>
                      <line
                        x1={d.a.x}
                        y1={d.a.y}
                        x2={d.b.x}
                        y2={d.b.y}
                        strokeWidth={1 / view.k}
                        strokeDasharray={
                          d.kind === "radial" ? `${4 / view.k} ${3 / view.k}` : undefined
                        }
                      />
                      <text
                        x={mx}
                        y={my - 3 / view.k}
                        transform={`rotate(${ang + flip} ${mx} ${my})`}
                        fontSize={10 / view.k}
                        textAnchor="middle"
                        stroke="none"
                        className="font-mono"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}

              {[...measures, ...(liveMeasure ? [liveMeasure] : [])].map((m, i) => (
                <g key={`measure-${i}`} stroke={DIMENSION_COLOR} fill={DIMENSION_COLOR}>
                  <line
                    x1={m.a.x}
                    y1={m.a.y}
                    x2={m.b.x}
                    y2={m.b.y}
                    strokeWidth={1 / view.k}
                    strokeDasharray={
                      liveMeasure && i === measures.length
                        ? `${5 / view.k} ${4 / view.k}`
                        : undefined
                    }
                  />
                  <text
                    x={(m.a.x + m.b.x) / 2}
                    y={(m.a.y + m.b.y) / 2 - 6 / view.k}
                    fontSize={11 / view.k}
                    textAnchor="middle"
                    stroke="none"
                    className="font-mono"
                  >
                    {dist(m.a, m.b).toFixed(2)} mm ·{" "}
                    {(
                      ((Math.atan2(-(m.b.y - m.a.y), m.b.x - m.a.x) * 180) / Math.PI + 360) %
                      360
                    ).toFixed(1)}
                    °
                  </text>
                </g>
              ))}

              {issues?.map((is, i) => (
                <circle
                  key={`issue-${i}`}
                  cx={is.p.x}
                  cy={is.p.y}
                  r={6 / view.k}
                  fill="none"
                  stroke={WARNING_COLOR}
                  strokeWidth={1.5 / view.k}
                />
              ))}

              {/*
                FLUXO CALDRA e selos de sequência agora vivem no canvas de
                overlay (`flowRef`): geometria de UI, nunca exportada.
              */}

              {shareHint && (
                <line
                  x1={shareHint.p1.x}
                  y1={shareHint.p1.y}
                  x2={shareHint.p2.x}
                  y2={shareHint.p2.y}
                  stroke={SELECTION_COLOR}
                  strokeWidth={5 / view.k}
                  strokeOpacity={0.6}
                  strokeLinecap="round"
                />
              )}

              {snapHit && (
                <text
                  x={snapHit.p.x}
                  y={snapHit.p.y + 4 / view.k}
                  fontSize={12 / view.k}
                  textAnchor="middle"
                  fill={SELECTION_COLOR}
                >
                  {SNAP_GLYPH[snapHit.kind]}
                </text>
              )}

              {/* SMART SNAP OVERLAY CAD DE PRECISÃO */}
              {snapOn && (
                <ChamferSmartSnapOverlay
                  activeSnap={smartSnap}
                  referencePoints={relevantRefs}
                  viewK={view.k}
                  unit={unit}
                  isDark={isDark}
                />
              )}

              {/* SMART TRIM SVG PREVIEW */}
              {tool === "smart_trim" && (
                <ChamferSmartTrimSvgOverlay
                  preview={smartTrimPreview}
                  viewK={view.k}
                />
              )}

              {/* PRÉ-VISUALIZAÇÃO DE CENTRALIZAR FORMAS */}
              {centerDialogOpen && centerPreview && (
                <g pointerEvents="none" aria-label="Pré-visualização de centralização">
                  {centerPreview.transformed.map((e) => {
                    const segs = segmentsOf(e);
                    return segs.map((s, idx) => (
                      <line
                        key={`cprev-${e.id}-${idx}`}
                        x1={s[0].x}
                        y1={s[0].y}
                        x2={s[1].x}
                        y2={s[1].y}
                        stroke="#06b6d4"
                        strokeWidth={2 / view.k}
                        strokeDasharray={`${6 / view.k},${3 / view.k}`}
                        strokeOpacity={0.85}
                      />
                    ));
                  })}
                  {/* Centro Alvo */}
                  <circle
                    cx={centerPreview.targetCenter.x}
                    cy={centerPreview.targetCenter.y}
                    r={7 / view.k}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth={1.5 / view.k}
                  />
                  <line
                    x1={centerPreview.targetCenter.x - 10 / view.k}
                    y1={centerPreview.targetCenter.y}
                    x2={centerPreview.targetCenter.x + 10 / view.k}
                    y2={centerPreview.targetCenter.y}
                    stroke="#06b6d4"
                    strokeWidth={1.2 / view.k}
                  />
                  <line
                    x1={centerPreview.targetCenter.x}
                    y1={centerPreview.targetCenter.y - 10 / view.k}
                    x2={centerPreview.targetCenter.x}
                    y2={centerPreview.targetCenter.y + 10 / view.k}
                    stroke="#06b6d4"
                    strokeWidth={1.2 / view.k}
                  />
                </g>
              )}
            </g>
          </svg>

          <Rulers
            view={view}
            isDark={isDark}
            majorStep={gridConfig.majorStep}
            unit={unit}
            width={canvasSize.w}
            height={canvasSize.h}
          />

          {clipboardMenu && clipboardRef.current && (
            <div
              className="metal absolute z-40 min-w-40 rounded-xl border border-line p-1 shadow-lg"
              style={{
                left: Math.min(clipboardMenu.x, canvasSize.w - 180),
                top: Math.min(clipboardMenu.y, canvasSize.h - 120),
              }}
            >
              <MenuItem
                label="Colar"
                icon={Copy}
                onClick={() => {
                  const pasted = pasteClipboard(clipboardRef.current as ChamferClipboard, {
                    x: clipboardRef.current!.anchor.x + 10,
                    y: clipboardRef.current!.anchor.y + 10,
                  });
                  commit((list) => [...list, ...pasted.entities]);
                  setGroups((list) => [...list, ...pasted.groups]);
                  setSelection(pasted.ids);
                  setClipboardMenu(null);
                }}
              />
              <MenuItem
                label="Colar na posição"
                icon={Crosshair}
                onClick={() => {
                  const pasted = pasteClipboard(
                    clipboardRef.current as ChamferClipboard,
                    clipboardMenu.world,
                  );
                  commit((list) => [...list, ...pasted.entities]);
                  setGroups((list) => [...list, ...pasted.groups]);
                  setSelection(pasted.ids);
                  setClipboardMenu(null);
                }}
              />
              <MenuItem label="Cancelar" icon={X} onClick={() => setClipboardMenu(null)} />
            </div>
          )}

          {/* BARRA FLUTUANTE DE COMANDO / FEEDBACK CAD TÉCNICO (CANVAS 2D) */}
          <div
            className={cn(
              "pointer-events-none absolute bottom-3 left-4 z-20 hidden md:flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-[10px] shadow-lg backdrop-blur-md transition-colors",
              isDark
                ? "border-slate-800/80 bg-slate-950/90 text-slate-300"
                : "border-slate-200 bg-white/95 text-slate-700 shadow-md",
            )}
          >
            <span className={cn("font-bold uppercase tracking-wider", isDark ? "text-red-400" : "text-red-600")}>
              {operationFeedback.command}
            </span>
            <span className={isDark ? "text-slate-600" : "text-slate-300"}>|</span>
            <span className={isDark ? "text-slate-300" : "text-slate-700"}>{operationFeedback.instruction}</span>
          </div>

          {zoomHud !== null && (
            <div className="metal pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 font-mono text-[11px] text-accent tabular-nums">
              {Math.round(zoomHud * 100)}%
            </div>
          )}

          {focus && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              <button
                onClick={leaveEditor}
                aria-label="Sair do CHAMFER"
                className="metal flex items-center gap-1 rounded-xl px-2.5 py-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase hover:text-accent"
              >
                <ArrowLeft className="size-3.5" /> Sair
              </button>
              <button
                onClick={() => setFocus(false)}
                aria-label="Sair do foco"
                className="metal grid size-9 place-items-center rounded-xl text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* NOVO SISTEMA DE EDIÇÃO CONTEXTUAL MOBILE DO CHAMFER (REGRAS 1 A 18) */}
          {mobileEditorOpen && (
            <div
              className={cn(
                "absolute z-40 transition-all",
                isLandscape
                  ? "top-3 right-3 max-h-[calc(100%-24px)] overflow-y-auto"
                  : "bottom-3 right-3 sm:top-3 max-h-[calc(100%-24px)] overflow-y-auto"
              )}
            >
              <ChamferMobileContextualEditor
                entity={selectedEntity}
                onUpdateEntity={(updated) => {
                  commit((list) => list.map((x) => (x.id === updated.id ? updated : x)));
                }}
                onDeleteEntity={(id) => {
                  commit((list) => list.filter((x) => x.id !== id));
                  setSelection([]);
                }}
                onDuplicateEntity={(ent) => {
                  const dup = translate(ent, 10, 10);
                  const dupWithNewId = { ...dup, id: crypto.randomUUID() };
                  commit((list) => [...list, dupWithNewId]);
                  setSelection([dupWithNewId.id]);
                }}
                onClose={() => {
                  setSelection([]);
                  setMobileEditorOpenManual(false);
                }}
                layers={layers}
                projectName={project?.name ?? "Suporte lateral"}
                onUpdateProjectName={(name) => {
                  setProject((prev) => (prev ? { ...prev, name } : prev));
                }}
                material={project?.settings?.material ?? "Aço carbono (1020)"}
                onUpdateMaterial={(mat) => {
                  setProject((prev) =>
                    prev ? { ...prev, settings: { ...prev.settings, material: mat } } : prev
                  );
                }}
                thickness={thickness}
                onUpdateThickness={(th) => setThickness(th)}
                onActivePropertyChange={setActiveEditingProp}
              />
            </div>
          )}
            </>
          )}
        </div>

        {/* REGIÃO D — JANELA LATERAL DIREITA DO CHAMFER 2D (PROPRIEDADES / CAMADAS / CORTE) */}
        {!solidOpen && !focus && (
          <ChamferRightSidebar
            open={rightSidebarOpen}
            onToggleOpen={() => setRightSidebarOpen((v) => !v)}
            activeTab={activeSidebarTab}
            onTabChange={setActiveSidebarTab}
            entities={entities}
            selection={selection}
            setSelection={setSelection}
            commit={commit}
            layers={layers}
            setLayers={setLayers}
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            thickness={thickness}
            onThicknessChange={setThickness}
            projectName={project?.name ?? "Peça Chamfer"}
            onProjectNameChange={(name) => {
              setProject((prev) => (prev ? { ...prev, name } : prev));
            }}
            material={project?.settings?.material ?? "Aço carbono (1020)"}
            onMaterialChange={(mat) => {
              setProject((prev) =>
                prev ? { ...prev, settings: { ...prev.settings, material: mat } } : prev
              );
            }}
            onDivideEntity={handleOpenDivide}
            dims={dims}
            onDimsChange={setDims}
            dimKind={dimKind}
            onDimKindChange={setDimKind}
            dimSel={dimSel}
            onDimSelect={setDimSel}
            renderCotas={() => (
              <DimensionsPanel
                dims={dims}
                entities={entities}
                kind={dimKind}
                onKind={(k) => {
                  setDimKind(k);
                  setDimPicks([]);
                  setTool("dim");
                }}
                selected={dimSel}
                onSelect={setDimSel}
                onChange={(d) => setDims((list) => list.map((x) => (x.id === d.id ? d : x)))}
                onDelete={(id) => {
                  setDims((list) => list.filter((x) => x.id !== id));
                  setDimSel(null);
                }}
              />
            )}
            onHighlightCut={setShareHint}
            isDark={isDark}
          />
        )}
      </div>

      {/* REGIÃO E — STATUS BAR LANDSCAPE */}
      {!focus && (
        <footer
          aria-label="Barra de status do CHAMFER"
          className={cn(
            "flex h-7 shrink-0 items-center justify-between gap-2 border-t px-2.5 font-mono text-[10px] backdrop-blur-md select-none transition-colors",
            isDark
              ? "border-slate-800/80 bg-slate-950/90 text-slate-400"
              : "border-slate-200 bg-white/95 text-slate-600 shadow-xs",
          )}
        >
          {/* LADO ESQUERDO: PLANOS DO PROJETO + COORDENADAS REAIS */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {project?.plans.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  if (pl.id === planId) return;
                  setProject((prev) =>
                    prev
                      ? {
                          ...prev,
                          plans: prev.plans.map((x) =>
                            x.id === planId ? { ...x, entities, groups, dims } : x,
                          ),
                        }
                      : prev,
                  );
                  setPlanId(pl.id);
                  const seenPlanIds = new Set<string>();
                  const sanitizedPlanEntities = (pl.entities ?? []).map((ent) => {
                    let entId = ent.id;
                    if (!entId || entId === "draft" || entId.startsWith("draft-") || seenPlanIds.has(entId)) {
                      entId = uid();
                    }
                    seenPlanIds.add(entId);
                    return ent.id === entId ? ent : { ...ent, id: entId };
                  });
                  setEntities(sanitizedPlanEntities);
                  setGroups(pl.groups ?? []);
                  setDims(pl.dims ?? []);
                  setSelection([]);
                  past.current = [];
                  future.current = [];
                }}
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 font-bold transition-colors",
                  pl.id === planId
                    ? isDark
                      ? "bg-red-950/60 text-red-400 border border-red-500/30"
                      : "bg-red-50 text-red-600 border border-red-200"
                    : "hover:text-foreground",
                )}
              >
                {pl.name}
              </button>
            ))}
            {project && (
              <button
                type="button"
                aria-label="Novo plano de corte"
                onClick={() => {
                  const plan = emptyPlan(project.plans.length);
                  plan.name = planLabel(project.plans.length);
                  const next: Project = {
                    ...project,
                    plans: [
                      ...project.plans.map((x) =>
                        x.id === planId ? { ...x, entities, groups, dims } : x,
                      ),
                      plan,
                    ],
                    lastPlanId: plan.id,
                  };
                  saveProject(next);
                  setProject(next);
                  setPlanId(plan.id);
                  setEntities([]);
                  setGroups([]);
                  setDims([]);
                  setSelection([]);
                  toast.success(`${plan.name} criado.`);
                }}
                className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:text-accent font-bold"
                title="Adicionar novo plano de corte ao projeto"
              >
                +
              </button>
            )}

            <div className={cn("mx-1 h-3.5 w-px", isDark ? "bg-slate-800" : "bg-slate-200")} />

            {/* UNIDADE DE MEDIDA CANÔNICA */}
            <span
              className={cn(
                "flex items-center px-1.5 py-0.2 rounded border font-mono font-bold text-[9px] tracking-wider",
                isDark
                  ? "border-slate-700/80 bg-slate-900 text-slate-200"
                  : "border-slate-300 bg-slate-100 text-slate-700",
              )}
              title="Unidade de medida: Milímetros (mm)"
            >
              MM
            </span>

            {/* BOTÃO PROPRIEDADES DA PEÇA / CHAPA CONTEXTUAL (REGRAS 2 & 5) */}
            <button
              type="button"
              onClick={() => {
                setMobileEditorOpenManual((prev) => !prev);
              }}
              title="Abrir editor contextual de chapa e projeto"
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded border font-mono font-bold text-[9px] tracking-wider transition-colors cursor-pointer",
                mobileEditorOpenManual
                  ? "border-red-500 bg-red-600 text-white shadow-xs"
                  : isDark
                  ? "border-slate-700/80 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-600"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:text-slate-900"
              )}
            >
              <span>CHAPA {thickness.toFixed(1)}MM</span>
            </button>

            {/* LEITURA DE COORDENADAS */}
            <div className="flex items-center gap-1 font-mono text-[9.5px]">
              <span className={isDark ? "text-slate-500" : "text-slate-400"}>X:</span>
              <strong className={isDark ? "text-slate-200" : "text-slate-800"}>{cursor.x.toFixed(2)}</strong>
              <span className={isDark ? "text-slate-500" : "text-slate-400"}>Y:</span>
              <strong className={isDark ? "text-slate-200" : "text-slate-800"}>{cursor.y.toFixed(2)}</strong>
            </div>

            {/* HUD DE COMPRIMENTO / ÂNGULO QUANDO DESENHANDO LINHA */}
            {pending.length === 1 && (tool === "line" || tool === "polyline") && (
              <div className="flex items-center gap-1.5 rounded bg-red-950/60 border border-red-500/30 px-1.5 py-0.5 text-[9.5px] text-red-300">
                <span>
                  L: {Math.hypot(cursor.x - pending[0]!.x, cursor.y - pending[0]!.y).toFixed(1)} mm
                </span>
                <span>·</span>
                <span>
                  ∠{" "}
                  {(
                    ((Math.atan2(-(cursor.y - pending[0]!.y), cursor.x - pending[0]!.x) * 180) /
                      Math.PI +
                      360) %
                    360
                  ).toFixed(1)}
                  °
                </span>
              </div>
            )}

            <div className={cn("mx-0.5 h-3.5 w-px", isDark ? "bg-slate-800" : "bg-slate-200")} />

            {/* ESTADO DA OPERAÇÃO CAD */}
            <div className="hidden lg:flex items-center gap-1.5 text-[9.5px] truncate max-w-[260px]">
              <span className="size-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <strong className="text-red-500 uppercase">{operationFeedback.command}:</strong>
              <span className={cn("truncate", isDark ? "text-slate-400" : "text-slate-600")}>{operationFeedback.instruction}</span>
            </div>

            <div className={cn("mx-0.5 h-3.5 w-px hidden sm:block", isDark ? "bg-slate-800" : "bg-slate-200")} />

            {/* INFORMAÇÕES DA SELEÇÃO */}
            <div className="hidden sm:flex items-center gap-1 text-[9.5px]">
              <span className={isDark ? "text-slate-500" : "text-slate-400"}>SEL:</span>
              <strong className={cn(selected.length > 0 ? (isDark ? "text-cyan-400 font-bold" : "text-red-600 font-bold") : (isDark ? "text-slate-400 font-normal" : "text-slate-500 font-normal"))}>
                {selectionText}
              </strong>
            </div>
          </div>

          {/* LADO DIREITO: STATUS DE PRECISÃO, CNC E ZOOM */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSnapOn((s) => !s)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                snapOn ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-foreground",
              )}
              title="Alternar Snap Geométrico"
            >
              SNAP: {snapOn ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => setOrthoOn((o) => !o)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                orthoOn
                  ? "text-emerald-400 bg-emerald-500/15"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Modo Ortogonal (0°, 90°, 180°, 270°)"
            >
              ORTO: {orthoOn ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => setShowGrid((s) => !s)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                showGrid
                  ? isDark
                    ? "text-red-400 bg-red-950/50 border border-red-500/30"
                    : "text-red-600 bg-red-50 border border-red-300 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Alternar visibilidade da grade"
            >
              GRID: {showGrid ? `${grid}MM` : "OFF"}
            </button>

            <button
              type="button"
              onClick={() => updateFrame({ visible: !frame.visible })}
              title={`Área de trabalho ${frame.w} × ${frame.h} mm`}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                frame.visible ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-foreground",
              )}
            >
              QUADRO
            </button>

            <div className="mx-0.5 h-3.5 w-px bg-line" />

            <button
              type="button"
              onClick={() => setShowArrows((s) => !s)}
              title="Direção de corte"
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                showArrows ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-foreground",
              )}
            >
              FLUXO
            </button>

            <button
              type="button"
              onClick={() => setShowOrder((s) => !s)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                showOrder ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-foreground",
              )}
            >
              ORDEM
            </button>

            <button
              type="button"
              onClick={() => {
                setSimOn((s) => {
                  const next = !s;
                  setSimPlaying(next);
                  setSimDist(0);
                  return next;
                });
              }}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold transition-colors",
                simOn ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-foreground",
              )}
            >
              PRÉVIA CNC
            </button>

            <button
              type="button"
              onClick={() => fitTo(entities)}
              className="rounded bg-background/60 px-2 py-0.5 font-mono text-[9px] font-bold text-accent hover:bg-background transition-colors"
              title="Clique para enquadrar desenho (100%)"
            >
              {Math.round(view.k * 100)}%
            </button>
          </div>
        </footer>
      )}

      {/* PONTO ÚNICO DE EXPORTAÇÃO: DXF (três perfis), SVG, PNG e PDF. */}
      <ExportDialog
        open={exportOpen || cncOpen}
        onOpenChange={(v) => {
          if (!v) {
            setExportOpen(false);
            setCncOpen(false);
          }
        }}
        layers={layers}
        projectName={project?.name ?? "CALDRA"}
        planName={project?.plans.find((p) => p.id === planId)?.name ?? "P01"}
        thickness={thickness}
        scopes={{
          selection: selected,
          /* as cotas entram como entidades DIMENSION: o perfil LASER as descarta */
          plan: [...drawable, ...dimensionEntities(dims, entities)],
          project: project
            ? [
                ...project.plans.flatMap((p) => (p.id === planId ? drawable : p.entities)),
                ...dimensionEntities(dims, entities),
              ]
            : drawable,
        }}
      />

      {/* FERRAMENTA DIVIDIR: EDITOR COMPACTO EM N PARTES IGUAIS */}
      <ChamferDivideEditor
        open={divideEditorOpen}
        selectedEntity={divideTargetEntity}
        parts={divideParts}
        onPartsChange={setDivideParts}
        options={divideOptions}
        onOptionsChange={setDivideOptions}
        onConfirm={handleConfirmDivide}
        onCancel={handleCancelDivide}
        isDark={isDark}
      />

      {/* BARRA FLUTUANTE DE CONFIRMAÇÃO DA FERRAMENTA DIVIDIR (GARANTIA TOTAL EM MODO PAISAGEM) */}
      {divideEditorOpen && divideTargetEntity && (
        <div
          role="region"
          aria-label="Confirmar divisão geométrica"
          className={cn(
            "fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 select-none",
            isDark
              ? "border-red-600/60 bg-slate-950/95 text-white shadow-black/80"
              : "border-red-500/50 bg-white/95 text-slate-900 shadow-xl",
          )}
        >
          <div className="flex items-center gap-2 pr-2.5 border-r border-slate-700/60">
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-600/20 text-red-500">
              <Divide className="size-4 stroke-[2.5]" />
            </div>
            <div className="text-left">
              <div className="font-mono text-[11px] font-bold text-red-500 uppercase tracking-wide">
                Dividir em {divideParts} Partes
              </div>
              <div className="text-[9px] text-muted-foreground truncate max-w-[180px]">
                Enter para confirmar • Esc cancela
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCancelDivide}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer active:scale-95",
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              <X className="size-3.5" />
              <span>Cancelar</span>
            </button>
            <button
              type="button"
              onClick={handleConfirmDivide}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-red-600/40 transition-all cursor-pointer"
            >
              <Check className="size-4 stroke-[3]" />
              <span>Confirmar ({divideParts})</span>
            </button>
          </div>
        </div>
      )}

      {/* FERRAMENTA CENTRALIZAR FORMAS */}
      <ChamferCenterDialog
        open={centerDialogOpen}
        selectedEntities={entities.filter((e) => e && selection.includes(e.id))}
        allEntities={entities}
        options={centerOptions}
        onOptionsChange={setCenterOptions}
        onConfirm={handleConfirmCenter}
        onCancel={handleCancelCenter}
        isDark={isDark}
      />

      {/* CONTROLE FLUTUANTE DA FERRAMENTA APARAR ATÉ ENCONTRO */}
      {tool === "smart_trim" && (
        <ChamferSmartTrimControlBar
          preview={smartTrimPreview}
          mode={smartTrimMode}
          onToggleMode={setSmartTrimMode}
          onExit={() => {
            setTool("select");
            setSmartTrimPreview(null);
          }}
          isDark={isDark}
        />
      )}

      <ImportDialog
        open={importOpen}
        layers={layers}
        onClose={() => setImportOpen(false)}
        onConfirm={onImportConfirm}
      />
      <TextDialog
        open={textOpen}
        {...(editingTextId && textSpec ? { initial: textSpec } : {})}
        onClose={() => {
          setTextOpen(false);
          setEditingTextId(null);
          if (!textSpec) setTool("select");
        }}
        onConfirm={(spec) => {
          if (editingTextId) {
            commit((list) =>
              list.map((entity) =>
                entity.id === editingTextId && entity.type === "text"
                  ? {
                      ...entity,
                      text: spec.text,
                      size: spec.height,
                      width: spec.width,
                      bold: spec.bold,
                      italic: spec.italic,
                    }
                  : entity,
              ),
            );
            setEditingTextId(null);
            setTextSpec(null);
            setTextOpen(false);
            return;
          }
          setTextSpec(spec);
          setTextOpen(false);
          toast.info("Toque no desenho para posicionar o texto.");
        }}
      />
      <VisionDialog
        open={visionOpen}
        onOpenChange={setVisionOpen}
        onCreate={(next, image) => {
          setImageLayer(image);
          onImportConfirm(next);
        }}
      />

      {/* DIALOG: NOVO PROJETO CHAMFER A PARTIR DO EDITOR */}
      <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
        <DialogContent className="w-[min(92vw,420px)] z-[95]">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Novo Projeto CHAMFER</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateNewProject} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label htmlFor="editor-new-proj-name" className="t-eyebrow text-muted-foreground">
                Nome do projeto
              </label>
              <input
                id="editor-new-proj-name"
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Ex.: Curva 90 Graus 500mm"
                className="w-full rounded-xl border border-line bg-background/60 px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/40"
              />
            </div>

            <DialogFooter className="gap-2 pt-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewProjectDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                <Plus className="size-4" /> Criar Projeto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* COMANDOS E MODAIS AVANÇADOS DO CAD */}
      <ChamferQuickCommandModal
        open={quickCommandOpen}
        onClose={() => setQuickCommandOpen(false)}
        commands={quickCommands}
      />

      <ChamferTopologyHealthModal
        open={topologyHealthOpen}
        onClose={() => setTopologyHealthOpen(false)}
        entities={entities}
        onApplyHeal={(healed) => {
          commit(healed);
          setTopologyHealthOpen(false);
          toast.success("Correção topológica aplicada com sucesso!");
        }}
      />

      <ChamferPresetsModal
        open={presetsModalOpen}
        onClose={() => setPresetsModalOpen(false)}
        insertPosition={{ x: 0, y: 0 }}
        onInsertEntities={(newEntities) => {
          commit((prev) => [...prev, ...newEntities]);
          setSelection(newEntities.map((e) => e.id));
          toast.success(`${newEntities.length} entidade(s) inserida(s) no projeto.`);
        }}
        isDark={isDark}
      />

      <ChamferTechnicalSheetModal
        open={technicalSheetModalOpen}
        onClose={() => setTechnicalSheetModalOpen(false)}
        suggestedOrigin={{ x: 0, y: 0 }}
        onInsertSheet={(sheetEntities) => {
          commit((prev) => [...prev, ...sheetEntities]);
          toast.success("Folha técnica e legenda inseridas.");
        }}
      />

      <ChamferVariablesModal
        open={variablesModalOpen}
        onClose={() => setVariablesModalOpen(false)}
        onVariablesChange={() => {
          toast.info("Tabela de variáveis atualizada.");
        }}
      />

      {/* DUAL TOOL HUD */}
      {dualToolSecondary && (
        <ChamferDualToolHUD
          primaryTool={tool}
          secondaryTool={dualToolSecondary}
          isPinned={dualToolPinned}
          onSwapTools={() => {
            const old = tool;
            setTool(dualToolSecondary);
            setDualToolSecondary(old);
          }}
          onClearSecondary={() => setDualToolSecondary(null)}
          onTogglePin={() => setDualToolPinned((p) => !p)}
        />
      )}

      {/* CURSOR MAGNÉTICO E LUPA DE PRECISÃO TOUCH */}
      <ChamferPrecisionLoupeOverlay
        visible={loupeVisible}
        screenPos={loupeScreenPos}
        cadPos={loupeCadPos}
        isDark={isDark}
      />
    </div>
  );
}

/* ------------------------------------------------------------ auxiliares */

/**
 * PAINEL DE COTAS — escolha do tipo, lista e propriedades.
 * Editar propriedades aqui é SEMPRE visual: nenhuma alteração toca a
 * geometria do desenho.
 */
function DimensionsPanel({
  dims,
  entities,
  kind,
  onKind,
  selected,
  onSelect,
  onChange,
  onDelete,
}: {
  dims: Dimension[];
  entities: Entity[];
  kind: DimKind;
  onKind: (k: DimKind) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (d: Dimension) => void;
  onDelete: (id: string) => void;
}) {
  const cur = dims.find((d) => d.id === selected) ?? null;
  const field =
    "w-full rounded-lg border border-line bg-background/40 px-1.5 py-1 font-mono text-[10px] outline-none";

  const setStyle = (patch: Partial<Dimension["style"]>) =>
    cur && onChange({ ...cur, style: { ...cur.style, ...patch } });

  return (
    <div className="space-y-2 text-[11px]">
      <div>
        <p className="tick-label mb-1 text-muted-foreground">Tipo de cota</p>
        <select
          value={kind}
          onChange={(ev) => onKind(ev.target.value as DimKind)}
          aria-label="Tipo de cota"
          className={field}
        >
          {DIM_KINDS.map((k) => (
            <option key={k} value={k}>
              {DIM_LABEL[k]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Clique no desenho para marcar as referências.
        </p>
      </div>

      <div className="border-t border-line pt-2">
        <p className="tick-label mb-1 text-muted-foreground">Cotas ({dims.length})</p>
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {dims.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left",
                selected === d.id ? "bg-foreground/10" : "hover:bg-foreground/5",
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: DIMENSION_COLOR }}
              />
              <span className="min-w-0 flex-1 truncate">{DIM_LABEL[d.kind]}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatDimension(d, entities) ?? "—"}
              </span>
            </button>
          ))}
          {!dims.length && <p className="text-[10px] text-muted-foreground">Nenhuma cota.</p>}
        </div>
      </div>

      {cur && (
        <div className="space-y-1.5 border-t border-line pt-2">
          <p className="tick-label text-muted-foreground">Propriedades</p>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Precisão</span>
            <select
              value={cur.style.precision}
              onChange={(ev) => setStyle({ precision: Number(ev.target.value) })}
              className={field}
            >
              <option value={0}>0</option>
              <option value={1}>0.0</option>
              <option value={2}>0.00</option>
              <option value={3}>0.000</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Precisão angular</span>
            <select
              value={cur.style.anglePrecision}
              onChange={(ev) => setStyle({ anglePrecision: Number(ev.target.value) })}
              className={field}
            >
              <option value={0}>0°</option>
              <option value={1}>0.0°</option>
              <option value={2}>0.00°</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Unidade</span>
            <input
              value={cur.style.unit}
              onChange={(ev) => setStyle({ unit: ev.target.value })}
              className={field}
            />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Afastamento</span>
              <input
                type="number"
                value={cur.offset}
                onChange={(ev) => onChange({ ...cur, offset: Number(ev.target.value) })}
                className={field}
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Lado</span>
              <select
                value={cur.style.side}
                onChange={(ev) => setStyle({ side: Number(ev.target.value) === -1 ? -1 : 1 })}
                className={field}
              >
                <option value={1}>Positivo</option>
                <option value={-1}>Negativo</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Texto</span>
              <input
                type="number"
                value={cur.style.textSize}
                onChange={(ev) => setStyle({ textSize: Number(ev.target.value) })}
                className={field}
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Setas</span>
              <input
                type="number"
                value={cur.style.arrowSize}
                onChange={(ev) => setStyle({ arrowSize: Number(ev.target.value) })}
                className={field}
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Prefixo</span>
              <input
                value={cur.style.prefix}
                onChange={(ev) => setStyle({ prefix: ev.target.value })}
                className={field}
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Sufixo</span>
              <input
                value={cur.style.suffix}
                onChange={(ev) => setStyle({ suffix: ev.target.value })}
                className={field}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Tolerância ±</span>
            <input
              type="number"
              step="0.01"
              value={cur.style.tolerance?.plus ?? ""}
              placeholder="—"
              onChange={(ev) => {
                const v = ev.target.value;
                if (!cur) return;
                const { tolerance: _drop, ...rest } = cur.style;
                onChange({
                  ...cur,
                  style:
                    v === ""
                      ? rest
                      : { ...cur.style, tolerance: { plus: Number(v), minus: Number(v) } },
                });
              }}
              className={field}
            />
          </label>
          <button
            onClick={() => onDelete(cur.id)}
            className="w-full rounded-lg border border-line px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Excluir cota
          </button>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  icon: Icon,
  flat,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Minus;
  flat?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:text-accent",
        !flat && "bg-background/40",
        active && "bg-accent/15 text-accent",
      )}
    >
      <Icon className="size-[15px]" />
    </button>
  );
}

function ToolBtn({
  t,
  active,
  onPick,
}: {
  t: { id: Tool; icon: typeof Minus; label: string; key: string };
  active: boolean;
  onPick: (id: Tool) => void;
}) {
  return (
    <button
      onClick={() => onPick(t.id)}
      title={`${t.label} · ${t.key}`}
      aria-label={t.label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl transition-all",
        active ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <t.icon className="size-[15px]" />
    </button>
  );
}

function PanelTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-2 py-1 font-mono text-[9px] tracking-[0.14em] uppercase transition-colors",
        active ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function MenuItem({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Minus;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" /> {label}
    </button>
  );
}

function buildDraft(tool: Tool, a: Vec2, b: Vec2, layer: string, radius: number): Entity | null {
  switch (tool) {
    case "line":
      return { id: uid(), layer, type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    case "rect":
      return rectPolyline(a, b, layer);
    case "rrect":
      return rectPolyline(a, b, layer, radius);
    case "circle":
      return { id: uid(), layer, type: "circle", cx: a.x, cy: a.y, r: dist(a, b) };
    case "polygon":
      return polygonEntity(a, dist(a, b), 6, layer);
    case "ellipse":
      return {
        id: uid(),
        layer,
        type: "ellipse",
        cx: a.x,
        cy: a.y,
        rx: Math.max(1, Math.abs(b.x - a.x)),
        ry: Math.max(1, Math.abs(b.y - a.y)),
        rotation: 0,
      };
    case "point":
      return { id: uid(), layer, type: "point", x: a.x, y: a.y };
    case "slot": {
      const len = dist(a, b);
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const width = Math.max(12, len / 2.5);
      return createSlotPolyline(a, len, width, angle, layer);
    }
    default:
      return null;
  }
}

function arcFrom3(a: Vec2, b: Vec2, c: Vec2, layer: string): Entity | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const ux =
    ((a.x ** 2 + a.y ** 2) * (b.y - c.y) +
      (b.x ** 2 + b.y ** 2) * (c.y - a.y) +
      (c.x ** 2 + c.y ** 2) * (a.y - b.y)) /
    d;
  const uy =
    ((a.x ** 2 + a.y ** 2) * (c.x - b.x) +
      (b.x ** 2 + b.y ** 2) * (a.x - c.x) +
      (c.x ** 2 + c.y ** 2) * (b.x - a.x)) /
    d;
  const center = { x: ux, y: uy };
  return {
    id: uid(),
    layer,
    type: "arc",
    cx: ux,
    cy: uy,
    r: dist(center, a),
    a0: Math.atan2(a.y - uy, a.x - ux),
    a1: Math.atan2(c.y - uy, c.x - ux),
  };
}

/**
 * Desenha a entidade com a linguagem técnica fixa do CALDRA.
 * A seleção adiciona apenas um halo temporário — a cor da camada não muda.
 */
export function EntityShape({
  e,
  k,
  selected,
  preview,
}: {
  e: Entity;
  k: number;
  selected?: boolean;
  preview?: boolean;
}) {
  const style = techStyle(e.layer);
  const stroke = preview ? PREVIEW_COLOR : style.color;
  const props = {
    fill: "none",
    stroke,
    strokeWidth: (1.4 * style.weight) / k,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeDasharray: preview ? `${5 / k} ${4 / k}` : style.dash(1 / k),
    vectorEffect: "non-scaling-stroke" as const,
  };
  const halo = selected
    ? {
        fill: "none",
        stroke: SELECTION_COLOR,
        strokeOpacity: 0.5,
        strokeWidth: 5 / k,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      }
    : null;

  const shape = (p: Record<string, unknown>, key?: string) => {
    if (e.type === "line") return <line key={key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...p} />;
    if (e.type === "circle") return <circle key={key} cx={e.cx} cy={e.cy} r={e.r} {...p} />;
    if (e.type === "polyline") {
      const d = e.pts.map((q) => `${q.x},${q.y}`).join(" ");
      return e.closed ? (
        <polygon key={key} points={d} {...p} />
      ) : (
        <polyline key={key} points={d} {...p} />
      );
    }
    if (e.type === "arc") {
      const p0 = { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) };
      const p1 = { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) };
      let sweep = e.a1 - e.a0;
      while (sweep < 0) sweep += Math.PI * 2;
      return (
        <path
          key={key}
          d={`M ${p0.x} ${p0.y} A ${e.r} ${e.r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p1.x} ${p1.y}`}
          {...p}
        />
      );
    }
    if (e.type === "ellipse") {
      return (
        <ellipse
          key={key}
          cx={e.cx}
          cy={e.cy}
          rx={e.rx}
          ry={e.ry}
          transform={e.rotation ? `rotate(${(e.rotation * 180) / Math.PI} ${e.cx} ${e.cy})` : undefined}
          {...p}
        />
      );
    }
    if (e.type === "point") {
      return (
        <g key={key}>
          <circle
            cx={e.x}
            cy={e.y}
            r={3.5 / k}
            fill="var(--warn, #f59e0b)"
            stroke="var(--background)"
            strokeWidth={0.8 / k}
          />
          {e.label && (
            <text
              x={e.x + 4.5 / k}
              y={e.y - 4.5 / k}
              fontSize={8.5 / k}
              fill="var(--warn, #f59e0b)"
              className="font-mono font-bold select-none pointer-events-none"
            >
              {e.label}
            </text>
          )}
        </g>
      );
    }
    if (e.type === "hatch") {
      const d = e.boundaryPts.map((q) => `${q.x},${q.y}`).join(" ");
      return (
        <polygon
          key={key}
          points={d}
          fill="var(--accent)"
          fillOpacity={0.08}
          {...p}
        />
      );
    }
    if (e.type === "path")
      return <path key={key} d={pathToSvg(e.start, e.segs, e.closed)} fill="none" {...p} />;
    return null;
  };

  if (e.type !== "text")
    return (
      <g>
        {halo && shape(halo, "halo")}
        {shape(props, "shape")}
      </g>
    );

  return (
    <text x={e.x} y={e.y} fontSize={e.size} fill={stroke} className="font-mono">
      {e.text}
    </text>
  );
}

function Rulers({
  view,
  isDark,
  majorStep,
  unit = "mm",
  width,
  height,
}: {
  view: { tx: number; ty: number; k: number };
  isDark: boolean;
  majorStep: number;
  unit?: string;
  width: number;
  height: number;
}) {
  const vw = width || (typeof window !== "undefined" ? window.innerWidth : 1920);
  const vh = height || (typeof window !== "undefined" ? window.innerHeight : 1080);

  // Passo dos rótulos numéricos principais (ex: 50, 100, 200, 500...)
  // Mantém rótulos espaçados por no mínimo 65 pixels para evitar aglomeração de texto
  let labelStep = Math.max(1, majorStep);
  while (labelStep * view.k < 65) {
    labelStep *= 2;
  }

  // Subdivisão intermediária de entalhes (notches de 3px)
  const tickStep = labelStep / 5;

  // Limites em coordenadas mundiais (CAD mm) visíveis na tela
  const minWorldX = -view.tx / view.k;
  const maxWorldX = (vw - view.tx) / view.k;
  const minWorldY = -view.ty / view.k;
  const maxWorldY = (vh - view.ty) / view.k;

  const startTickX = Math.floor(minWorldX / tickStep) * tickStep;
  const endTickX = Math.ceil(maxWorldX / tickStep) * tickStep;

  const startTickY = Math.floor(minWorldY / tickStep) * tickStep;
  const endTickY = Math.ceil(maxWorldY / tickStep) * tickStep;

  const ticksX: { val: number; isMajor: boolean; screenX: number }[] = [];
  for (let x = startTickX; x <= endTickX; x += tickStep) {
    const screenX = view.tx + x * view.k;
    if (screenX >= 20 && screenX <= vw) {
      const isMajor = Math.abs(Math.round(x / labelStep) * labelStep - x) < 0.001;
      ticksX.push({ val: Math.round(x), isMajor, screenX });
    }
  }

  const ticksY: { val: number; isMajor: boolean; screenY: number }[] = [];
  for (let y = startTickY; y <= endTickY; y += tickStep) {
    const screenY = view.ty + y * view.k;
    if (screenY >= 20 && screenY <= vh) {
      const isMajor = Math.abs(Math.round(y / labelStep) * labelStep - y) < 0.001;
      ticksY.push({ val: Math.round(y), isMajor, screenY });
    }
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Canto superior esquerdo: badge técnico de unidade */}
      <div
        className={cn(
          "absolute left-0 top-0 z-10 flex size-5 items-center justify-center border-b border-r font-mono text-[8px] font-bold uppercase",
          isDark
            ? "border-slate-800 bg-slate-950/80 text-slate-400"
            : "border-slate-300 bg-slate-100/90 text-slate-600"
        )}
      >
        {unit}
      </div>

      {/* Régua Horizontal Superior */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-5 border-b backdrop-blur-sm",
          isDark
            ? "border-slate-800/80 bg-slate-950/60 text-slate-400"
            : "border-slate-300/80 bg-slate-100/75 text-slate-600"
        )}
      >
        {ticksX.map((t, idx) => (
          <div
            key={`rx-${idx}-${t.val}`}
            style={{ left: t.screenX }}
            className="absolute bottom-0 flex flex-col items-center"
          >
            {/* Notch / Entalhe */}
            <div
              className={cn(
                "w-px",
                t.isMajor
                  ? isDark ? "h-2.5 bg-slate-400" : "h-2.5 bg-slate-600"
                  : isDark ? "h-1 bg-slate-700" : "h-1 bg-slate-300"
              )}
            />
            {/* Rótulo Numérico nas Divisões Principais */}
            {t.isMajor && (
              <span
                style={{ transform: "translateX(-50%)" }}
                className={cn(
                  "absolute top-0.5 font-mono text-[7.5px] tracking-tight",
                  t.val === 0
                    ? isDark ? "text-red-400 font-bold" : "text-red-600 font-bold"
                    : isDark ? "text-slate-400" : "text-slate-600"
                )}
              >
                {t.val}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Régua Vertical Esquerda */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-5 border-r backdrop-blur-sm",
          isDark
            ? "border-slate-800/80 bg-slate-950/60 text-slate-400"
            : "border-slate-300/80 bg-slate-100/75 text-slate-600"
        )}
      >
        {ticksY.map((t, idx) => (
          <div
            key={`ry-${idx}-${t.val}`}
            style={{ top: t.screenY }}
            className="absolute right-0 flex items-center"
          >
            {/* Rótulo Numérico */}
            {t.isMajor && (
              <span
                style={{ transform: "translateY(-50%)" }}
                className={cn(
                  "absolute right-3 font-mono text-[7.5px] tracking-tight",
                  t.val === 0
                    ? isDark ? "text-green-400 font-bold" : "text-green-600 font-bold"
                    : isDark ? "text-slate-400" : "text-slate-600"
                )}
              >
                {t.val}
              </span>
            )}
            {/* Notch / Entalhe */}
            <div
              className={cn(
                "h-px",
                t.isMajor
                  ? isDark ? "w-2.5 bg-slate-400" : "w-2.5 bg-slate-600"
                  : isDark ? "w-1 bg-slate-700" : "w-1 bg-slate-300"
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<Entity["type"], string> = {
  line: "Linha",
  polyline: "Polilinha",
  circle: "Círculo",
  arc: "Arco",
  path: "Curva",
  text: "Texto",
  point: "Ponto Técnico",
  ellipse: "Elipse",
  hatch: "Hachura",
};

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

function DimensionNumberField({
  label,
  value,
  onChange,
  unit = "mm",
  min,
  allowZero = false,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  min?: number;
  allowZero?: boolean;
}) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="relative py-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] text-muted-foreground uppercase">{label}</span>
        <button
          type="button"
          onClick={() => setEditorOpen((prev) => !prev)}
          title={`Editar medida de ${label}`}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold transition-colors cursor-pointer",
            editorOpen
              ? "border-red-500 bg-red-950/30 text-white ring-1 ring-red-500"
              : "border-line bg-background/60 text-foreground hover:border-accent hover:bg-background"
          )}
        >
          <span>{Number.isFinite(value) ? value.toFixed(2) : "0.00"}</span>
          {unit && <span className="text-[9px] text-muted-foreground font-normal">{unit}</span>}
        </button>
      </div>

      {editorOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50">
          <ChamferCompactNumericEditor
            property={{
              key: label,
              label,
              value: Number.isFinite(value) ? value : 0,
              unit: (unit as any) ?? "mm",
              min: allowZero ? 0 : min,
            }}
            onChange={(newVal) => onChange(newVal)}
            onConfirm={(finalVal) => {
              onChange(finalVal);
              setEditorOpen(false);
            }}
            onCancel={() => setEditorOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * DimensionEditor — painel universal de propriedades e dimensões.
 * Funciona para qualquer entidade: edição numérica atualiza a geometria na hora sem perda.
 */
function DimensionEditor({
  e,
  onChange,
  layers,
  actions,
  onEditText,
}: {
  e: Entity;
  onChange: (e: Entity) => void;
  layers: Layer[];
  actions?: React.ReactNode;
  onEditText?: () => void;
}) {
  const field = (
    label: string,
    value: number,
    set: (n: number) => void,
    unit?: string,
    min?: number,
    allowZero = false,
  ) => (
    <DimensionNumberField
      key={label}
      label={label}
      value={value}
      onChange={set}
      unit={unit}
      min={min}
      allowZero={allowZero}
    />
  );

  const info = (text: string, key?: string) => (
    <p key={key ?? text} className="font-mono text-[10px] text-muted-foreground">{text}</p>
  );

  const body: React.ReactNode[] = [];

  if (e.type === "circle") {
    body.push(
      field("X", e.cx, (n) => onChange({ ...e, cx: n }), "mm", undefined, true),
      field("Y", e.cy, (n) => onChange({ ...e, cy: n }), "mm", undefined, true),
      field("R", e.r, (n) => { if (n > 0.05) onChange({ ...e, r: n }); }, "mm", 0.1),
      field("Ø", e.r * 2, (n) => { if (n > 0.1) onChange({ ...e, r: n / 2 }); }, "mm", 0.2),
    );
  }

  if (e.type === "line") {
    const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
    const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
    const setPolar = (l: number, a: number) =>
      onChange({ ...e, x2: e.x1 + l * Math.cos(a), y2: e.y1 + l * Math.sin(a) });
    body.push(
      field("X1", e.x1, (n) => onChange({ ...e, x1: n }), "mm", undefined, true),
      field("Y1", e.y1, (n) => onChange({ ...e, y1: n }), "mm", undefined, true),
      field("X2", e.x2, (n) => onChange({ ...e, x2: n }), "mm", undefined, true),
      field("Y2", e.y2, (n) => onChange({ ...e, y2: n }), "mm", undefined, true),
      field("Compr.", len, (n) => { if (n > 0.05) setPolar(n, ang); }, "mm", 0.1),
      field("Ângulo", deg(ang), (n) => setPolar(len, rad(n)), "°", undefined, true),
    );
  }

  if (e.type === "arc") {
    let sweep = e.a1 - e.a0;
    while (sweep < 0) sweep += Math.PI * 2;
    body.push(
      field("X", e.cx, (n) => onChange({ ...e, cx: n }), "mm", undefined, true),
      field("Y", e.cy, (n) => onChange({ ...e, cy: n }), "mm", undefined, true),
      field("R", e.r, (n) => { if (n > 0.05) onChange({ ...e, r: n }); }, "mm", 0.1),
      field("Ø", e.r * 2, (n) => { if (n > 0.1) onChange({ ...e, r: n / 2 }); }, "mm", 0.2),
      field("Âng. ini.", deg(e.a0), (n) => onChange({ ...e, a0: rad(n) }), "°", undefined, true),
      field("Âng. fim", deg(e.a1), (n) => onChange({ ...e, a1: rad(n) }), "°", undefined, true),
      info(`Arco ${(e.r * sweep).toFixed(2)} mm · ${deg(sweep).toFixed(1)}°`),
    );
  }

  if (e.type === "polyline" && e.pts.length) {
    const xs = e.pts.map((p) => p.x);
    const ys = e.pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const perim = e.pts.reduce((acc, p, i) => {
      const q = e.pts[i + 1] ?? (e.closed ? e.pts[0] : undefined);
      return q ? acc + Math.hypot(q.x - p.x, q.y - p.y) : acc;
    }, 0);
    const area = e.closed
      ? Math.abs(
          e.pts.reduce((acc, p, i) => {
            const q = e.pts[(i + 1) % e.pts.length]!;
            return acc + (p.x * q.y - q.x * p.y);
          }, 0) / 2,
        )
      : 0;
    const scaleTo = (sx: number, sy: number) => {
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return;
      onChange({
        ...e,
        pts: e.pts.map((p) => ({ x: minX + (p.x - minX) * sx, y: minY + (p.y - minY) * sy })),
      });
    };
    const moveTo = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      onChange({ ...e, pts: e.pts.map((p) => ({ x: p.x - minX + x, y: p.y - minY + y })) });
    };
    const rotateBy = (angleRad: number) => {
      const cx = minX + w / 2;
      const cy = minY + h / 2;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      onChange({
        ...e,
        pts: e.pts.map((p) => ({
          x: cx + (p.x - cx) * cosA - (p.y - cy) * sinA,
          y: cy + (p.x - cx) * sinA + (p.y - cy) * cosA,
        })),
      });
    };
    body.push(
      field("X", minX, (n) => moveTo(n, minY), "mm", undefined, true),
      field("Y", minY, (n) => moveTo(minX, n), "mm", undefined, true),
      field("Largura", w, (n) => {
        if (n > 0.05 && w > 0.001) scaleTo(n / w, 1);
      }, "mm", 0.1),
      field("Altura", h, (n) => {
        if (n > 0.05 && h > 0.001) scaleTo(1, n / h);
      }, "mm", 0.1),
      <div key="girar-btns" className="flex items-center justify-between gap-1 py-1">
        <span className="font-mono text-[9px] text-muted-foreground uppercase">Girar</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => rotateBy(-Math.PI / 2)}
            className="rounded border border-line bg-background/50 px-2 py-0.5 font-mono text-[9.5px] hover:bg-muted"
            title="Girar 90° anti-horário"
          >
            -90°
          </button>
          <button
            type="button"
            onClick={() => rotateBy(Math.PI / 2)}
            className="rounded border border-line bg-background/50 px-2 py-0.5 font-mono text-[9.5px] hover:bg-muted"
            title="Girar 90° horário"
          >
            +90°
          </button>
        </div>
      </div>,
      info(
        `${e.pts.length} vértices · ${e.closed ? "fechada" : "aberta"} · ${perim.toFixed(1)} mm` +
          (area ? ` · ${(area / 100).toFixed(1)} cm²` : ""),
      ),
    );
  }

  if (e.type === "ellipse") {
    body.push(
      field("Centro X", e.cx, (n) => onChange({ ...e, cx: n }), "mm", undefined, true),
      field("Centro Y", e.cy, (n) => onChange({ ...e, cy: n }), "mm", undefined, true),
      field("Raio X (Rx)", e.rx, (n) => { if (n > 0.05) onChange({ ...e, rx: n }); }, "mm", 0.1),
      field("Raio Y (Ry)", e.ry, (n) => { if (n > 0.05) onChange({ ...e, ry: n }); }, "mm", 0.1),
      field("Diâmetro X", e.rx * 2, (n) => { if (n > 0.1) onChange({ ...e, rx: n / 2 }); }, "mm", 0.2),
      field("Diâmetro Y", e.ry * 2, (n) => { if (n > 0.1) onChange({ ...e, ry: n / 2 }); }, "mm", 0.2),
      field("Rotação", ((e.rotation ?? 0) * 180) / Math.PI, (n) => onChange({ ...e, rotation: (n * Math.PI) / 180 }), "°", undefined, true),
    );
  }

  if (e.type === "point") {
    body.push(
      field("X", e.x, (n) => onChange({ ...e, x: n }), "mm", undefined, true),
      field("Y", e.y, (n) => onChange({ ...e, y: n }), "mm", undefined, true),
    );
  }

  if (e.type === "text") {
    body.push(
      field("X", e.x, (n) => onChange({ ...e, x: n }), "mm", undefined, true),
      field("Y", e.y, (n) => onChange({ ...e, y: n }), "mm", undefined, true),
      field("Altura", e.size, (n) => { if (n > 0.1) onChange({ ...e, size: n }); }, "mm", 0.5),
      field(
        "Largura",
        e.width ?? Math.max(e.size, e.text.length * e.size * 0.6),
        (n) => { if (n > 0.1) onChange({ ...e, width: n }); },
        "mm",
        0.5,
      ),
      field("Rotação", e.rotation ?? 0, (n) => onChange({ ...e, rotation: n }), "°", undefined, true),
      <button
        key="editar-texto"
        onClick={onEditText}
        className="w-full rounded-lg border border-line px-2 py-1.5 text-[10px] text-foreground hover:border-accent"
      >
        Editar texto e estilo
      </button>,
    );
  }

  if (e.type === "path") {
    body.push(
      field("Início X", e.start.x, (n) => onChange({ ...e, start: { ...e.start, x: n } }), "mm", undefined, true),
      field("Início Y", e.start.y, (n) => onChange({ ...e, start: { ...e.start, y: n } }), "mm", undefined, true),
      info(`Curva Bézier (${e.segs.length} segmentos · ${e.closed ? "fechada" : "aberta"})`),
    );
  }

  if (e.type === "hatch") {
    body.push(
      field("Ângulo", e.angle, (n) => onChange({ ...e, angle: n }), "°", undefined, true),
      field("Escala", e.scale, (n) => { if (n > 0.01) onChange({ ...e, scale: n }); }, "", 0.1),
      info(`Hachura ${e.pattern} (${e.boundaryPts.length} vértices)`),
    );
  }

  const isRect = e.type === "polyline" && e.closed && e.pts.length === 4;
  const typeTitle = isRect ? "Retângulo" : (TYPE_LABEL[e.type] ?? e.type);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: techColor(e.layer) }}
          aria-hidden
        />
        <p className="font-mono text-[9px] tracking-[0.2em] text-foreground uppercase">
          {typeTitle}
        </p>
      </div>
      <div className="rounded-xl bg-background/30 p-1.5">{body}</div>
      <select
        value={e.layer}
        onChange={(ev) => onChange({ ...e, layer: ev.target.value })}
        aria-label="Camada"
        className="w-full rounded-lg border border-line bg-background/40 px-1.5 py-1.5 font-mono text-[10px] outline-none"
      >
        {layers
          .filter((l) => isUserLayer(l.id) || l.id === e.layer)
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
      </select>
      {actions && <div className="flex flex-wrap gap-0.5 pt-1">{actions}</div>}
    </div>
  );
}
