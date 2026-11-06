import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { toast, notify } from "@/lib/lab2d/chamferNotify";
import { ChamferCompactToastHost } from "@/components/lab2d/ChamferCompactToastHost";
import { triggerHaptic } from "@/lib/ui/haptics";
import {
  ArrowLeft,
  ArrowLeftRight,
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
  Box as BoxIcon,
  Boxes,
  Ungroup,
  FileText,
  Search,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { getChamferSettings, type ChamferSettings } from "@/lib/lab2d/projectSettings";
import { useSettings } from "@/lib/settings/SettingsProvider";
import {
  registerThemeBridge,
  type ThemeOriginInput,
} from "@/lib/settings/themeTransitionEngine";
import {
  useChamferAppearance,
  buildChamferThemeColors,
} from "@/components/lab2d/useIntentTheme";
import { ChamferProjectSettingsDialog } from "@/components/lab2d/ChamferProjectSettingsDialog";
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
import { useDeclareImmersive } from "@/lib/ui/immersive";
import type { VisionImageLayer } from "@/components/lab2d/VisionDialog";
import { TextDialog, type TextSpec } from "@/components/lab2d/TextDialog";

const ExportDialog = lazy(() =>
  import("@/components/lab2d/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);
const ImportDialog = lazy(() =>
  import("@/components/lab2d/ImportDialog").then((m) => ({ default: m.ImportDialog })),
);
const VisionDialog = lazy(() =>
  import("@/components/lab2d/VisionDialog").then((m) => ({ default: m.VisionDialog })),
);
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
  WORKSPACE_INDUSTRIAL_PRESETS,
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
import {
  DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
  type ChamferWireframe3DStyleConfig,
} from "@/lib/lab2d/chamferWireframe3D";
import { drawFlow, drawSim } from "@/lib/lab2d/flow";
import { buildSimPath, sampleSim, SIM_LABEL } from "@/lib/lab2d/simulation";
import { createGroup, dissolveGroup, expandSelection, pruneGroups, type GroupDef } from "@/lib/lab2d/groups";
import { isCutPath, setStartPoint, startPointOf, endPointOf } from "@/lib/lab2d/cutPlan";
import { revalidateShared, type ShareCandidate } from "@/lib/lab2d/sharedCut";
import {
  copySelection,
  finishPolylinePoints,
  pasteClipboard,
  projectOrthoSegment,
  removeEntityOnly,
  shouldClosePolyline,
  type ChamferClipboard,
} from "@/lib/lab2d/editorInteractions";

import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";
import { type RibbonTab } from "@/components/lab2d/ChamferLandscapeToolbar";
import { ChamferCadToolbar } from "@/components/lab2d/ChamferCadToolbar";
import { ChamferMobileContextualEditor } from "@/components/lab2d/mobileEdit/ChamferMobileContextualEditor";
import { ChamferCompactNumericEditor } from "@/components/lab2d/mobileEdit/ChamferCompactNumericEditor";
import { ChamferRightSidebar, type ChamferSidebarTab } from "@/components/lab2d/sidebar";
import { ChamferDivideEditor } from "./ChamferDivideEditor";
import { ChamferSmartSnapOverlay } from "./ChamferSmartSnapOverlay";
import {
  ChamferSmartTrimSvgOverlay,
  ChamferSmartTrimControlBar,
} from "./ChamferSmartTrimOverlay";
import { ChamferFilletChamferHUD } from "./ChamferFilletChamferHUD";
import { ChamferArrayHUD } from "./ChamferArrayHUD";
import {
  ChamferPortraitTopBar,
  ChamferPortraitCanvasMicroPill,
  ChamferPortraitCompactDrawer,
  ChamferPortraitBottomBars,
} from "@/components/lab2d/ChamferPortraitLightroomUI";
import {
  createConcentricEyeletEntities,
  createIndustrialHoleEntity,
  createThreadedHoleEntities,
  createSerratedTeethEntities,
  createPocket2DEntity,
  createTangentBridgeEntities,
  applyColorAndLayerToEntities,
  type ChamferTechnicalColorOption,
} from "@/lib/lab2d/chamferCommandRegistry";
import {
  shouldAutoCollapseDrawerOnCanvasTouch,
  useVerticalLayout,
} from "@/lib/lab2d/useVerticalLayout";
import {
  detectHostPart,
  computeInstances,
  validateArray,
  getGroupCenter,
  getEntityArraySpec,
  findEnclosedAndConnectedAssembly,
  applyArrayAutoTrim,
  type ArrayType,
  type PolarArrayParams,
  type LinearArrayParams,
  type HostDetectionResult,
  type ArraySpec,
} from "@/lib/lab2d/cadArrayEngine";
import {
  inferAssociativeMarkFromPoint,
  inferValidGeometricMarkCandidate,
  clearGeometricMarksFromEntities,
  isGeometricMarkEntity,
  getGeometricMarkSpec,
  buildRelationalGeometricMarks,
  syncAssociativeGeometricMarks,
  createPersistentDatumEntity,
  convertDatumToCadLines,
  isPersistentDatumEntity,
  getPersistentDatumSpec,
  type RelationalSynthesisMode,
  type PersistentDatumSpec,
} from "@/lib/lab2d/cadGeometricMarks";
import type { RelationalPickItem } from "./ChamferLiveDimensionsOverlay";

import {
  MorphTransitionController,
  MORPH_TO_3D_DURATION_MS,
  MORPH_TO_2D_DURATION_MS,
  type MorphTransitionState,
} from "@/lib/cad/sketch/sketch3dBridge";

const Cad3DStage = lazy(() =>
  import("@/components/lab2d/Cad3DStage").then((m) => ({ default: m.Cad3DStage })),
);
const ChamferCenterDialog = lazy(() =>
  import("./ChamferCenterDialog").then((m) => ({ default: m.ChamferCenterDialog })),
);
const ChamferScaleDialog = lazy(() =>
  import("./ChamferScaleDialog").then((m) => ({ default: m.ChamferScaleDialog })),
);
import {
  findCornerAtPoint,
  findAllCornersInEntities,
  applyFilletToCorner,
  applyChamferToCorner,
  calculateFillet,
  calculateChamfer,
  type DetectedCorner,
  type FilletCalculation,
  type ChamferCalculation,
} from "@/lib/lab2d/cadFilletChamfer";
import { canDivideEntity, divideEntity, type DivideOptions } from "@/lib/lab2d/cadDivide";
import {
  findSmartSnap,
  extractEntitySmartReferences,
  extractIntersections,
  buildUnifiedSnapResult,
  type SmartReferencePoint,
} from "@/lib/lab2d/cadReferenceSnaps";
import {
  CRIMSON_RED_CENTER,
  CRIMSON_RED_RING,
  computeFlowDashOffset,
  loadInteractionGuideMode,
  saveInteractionGuideMode,
  validateDimensionalConstraint,
  applyDimensionalConstraintsToPoint,
  applyEntityNodeConstraint,
  type InteractionGuideMode,
  type TouchInteractionState,
  type DimensionalConstraints,
  type ConstrainableMeasureKind,
} from "@/lib/lab2d/cadInteractionGuides";
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
import type { QuickCommandItem } from "./ChamferQuickCommandModal";
import {
  ChamferTransactionManager,
  ChamferIntentInterpreter,
  type ChamferIntentPlan,
  type ParametricSessionContext,
} from "@/lib/intent";
import {
  copyToGlobalClipboard,
  loadGlobalClipboard,
  instantiateClipboardItemAt,
  type GlobalClipboardItem,
} from "@/lib/lab2d/globalClipboard";
import { ChamferDirectDimensionEditor } from "./ChamferDirectDimensionEditor";
import { ChamferPrecisionLoupeOverlay } from "./ChamferPrecisionLoupeOverlay";
import {
  ChamferDraftConfirmationBubble,
  createPendingDraftShapeState,
  getPendingDraftShapeGrips,
  applyPendingDraftGripDrag,
  type PendingDraftShapeState,
} from "./ChamferDraftConfirmationBubble";
import { ChamferOrbit3DPopover } from "./ChamferOrbit3DPopover";
import { ChamferAxesGizmo3D } from "./ChamferAxesGizmo3D";
import type { EdgeMode } from "@/lib/viz3d/cameraPresets";

const ChamferUnified3DViewport = lazy(() =>
  import("./ChamferUnified3DViewport").then((m) => ({ default: m.ChamferUnified3DViewport })),
);
import {
  buildDirectTopology3DScene,
  formatSubElementTelemetry3D,
  hitTestSubElement3DInScreenSpace,
  type DirectModeling3DTool,
  type SubElementSelectionState3D,
  type DirectFace3D,
} from "@/lib/lab2d/cadDirectModeling3D";
import {
  applyOrbitDragDelta,
  computeSmartOrbitPivot,
  computeWorkplaneOrbitProjection2D,
  detectMatchingPreset,
  getOrbitPresetDefinition,
  interpolateOrbitAngles,
  isFlatTop2DView,
  ISO_CANONICAL_ELEVATION_DEG,
  ORBIT_TRANSITION_DURATION_MS,
  unprojectOrbit2DToWorkplanePoint,
  type OrbitPresetId,
} from "@/lib/lab2d/orbit3dController";
import {
  ChamferTechnicalCursorSvg,
  ChamferNudgeControlHUD,
  TOUCH_CURSOR_OFFSET_PX,
  shouldUseTouchOffset,
  computeTouchCursorScreenAndWorld,
  renderCrosshair55Overlay,
  computeNudgeDelta,
  type NudgeDirection,
  type NudgeStepMm,
} from "./ChamferVirtualCursor";
import {
  globalCADInteractionHub,
  loadCursorOffsetMode,
  saveCursorOffsetMode,
  loadLoupeHudMode,
  saveLoupeHudMode,
  cycleLoupeHudMode,
  type CursorOffsetMode,
  type LoupeHudMode,
} from "@/lib/lab2d/cadInteractionHub";
import { ChamferDualToolHUD } from "./ChamferDualToolHUD";
import { GeometricReferenceEngine, type EdgeReference } from "@/lib/lab2d/cadGeometricReferences";
import { CoordinateFrameManager, type TemporaryOrigin } from "@/lib/lab2d/cadCoordinateFrames";
import { DynamicDimensionInteraction, DimensionInteractionEngine, type LiveDimension } from "@/lib/lab2d/cadDynamicDimensions";
import { GeometricConstraintResolver } from "@/lib/lab2d/cadConstraintResolver";
import { ChamferLiveDimensionsOverlay } from "./ChamferLiveDimensionsOverlay";
import {
  createDefaultRevEngPlanData,
  sanitizeRevEngPlanData,
  type RevEngPlanData,
  type RevEngCategoryId,
  type RevEngWizardStep,
  type RevEngCanvasInteractionMode,
  type FittedPrimitiveCandidate,
} from "@/lib/lab2d/revEngTypes";
import { ChamferRevEngTab } from "./sidebar/ChamferRevEngTab";
import {
  type IsoPlane,
  type DrawingProjectionMode,
  ISO_PLANES,
  ISO_AXIS_VECTORS,
  constrainToIsoAxes,
  snapToIsoGrid,
  buildIsoParallelogram,
  buildIsoCircle,
  unprojectPointFromIsoPlane,
  ISO_SQRT_1_5,
  ISO_SQRT_0_5,
} from "@/lib/lab2d/isometricEngine";
import { ChamferIsoPlaneHUD } from "./ChamferIsoPlaneHUD";

const loadChamferSemanticPalette = () =>
  import("./ChamferSemanticPalette").then((m) => ({ default: m.ChamferSemanticPalette }));
const ChamferSemanticPalette = lazy(loadChamferSemanticPalette);
const ChamferClipboardModal = lazy(() =>
  import("./ChamferClipboardModal").then((m) => ({ default: m.ChamferClipboardModal })),
);
const ChamferFabricationPassportModal = lazy(() =>
  import("./ChamferFabricationPassportModal").then((m) => ({
    default: m.ChamferFabricationPassportModal,
  })),
);
const ChamferTopologyHealthModal = lazy(() =>
  import("./ChamferTopologyHealthModal").then((m) => ({ default: m.ChamferTopologyHealthModal })),
);
const ChamferVariablesModal = lazy(() =>
  import("./ChamferVariablesModal").then((m) => ({ default: m.ChamferVariablesModal })),
);
const ChamferPresetsModal = lazy(() =>
  import("./ChamferPresetsModal").then((m) => ({ default: m.ChamferPresetsModal })),
);
const ChamferTechnicalSheetModal = lazy(() =>
  import("./ChamferTechnicalSheetModal").then((m) => ({ default: m.ChamferTechnicalSheetModal })),
);
const CaldraIntegratedWorkshopModal = lazy(() =>
  import("./CaldraIntegratedWorkshopModal").then((m) => ({
    default: m.CaldraIntegratedWorkshopModal,
  })),
);
const ChamferIsoConvertModal = lazy(() =>
  import("./ChamferIsoConvertModal").then((m) => ({ default: m.ChamferIsoConvertModal })),
);
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
import {
  validateAndExtractClosedProfiles,
  buildConstructionAxisLine,
  buildCompositePolyline,
  buildParametricRectangle,
  buildPolygonParametric,
  buildMechanicalSlotAdvanced,
  buildSmoothSpline128,
  computeSwipeTrimTransaction,
  extendEntityToNearestBoundary,
  cleanOverkillGeometry,
  applyMultiModeGripEdit,
  insertVertexOnEntitySegment,
  createValidatedTechnicalHatch,
  findOverlappingEntitiesAtPoint,
  runBoolean2DOnSelection,
  type GripEditMode,
  type PolylineSegmentMode,
  type RectCreationMode,
  type CircleCreationMode,
  type PolygonCreationMode,
  type SlotCreationMode,
} from "@/lib/lab2d/cadcraftEngine";
import {
  ChamferTouchDynamicHud,
  type LockedDimensionsState,
} from "./ChamferTouchDynamicHud";
import { Chamfer3DGizmoAndLoftOverlay } from "./Chamfer3DGizmoAndLoftOverlay";
import {
  buildLoft3DMesh,
  createLoft3DEntity,
  getEntityElevationZ,
  getEntityExtrudeHeight,
  getEntityLoft3DSpec,
  isClosedLoftableProfile,
  isLoft3DEntity,
  resolveUnitZWorkplaneOffset,
  setEntityElevationZ,
  type LoftBodyMode,
  type LoftSurfaceMode,
} from "@/lib/lab2d/cadLoft3DEngine";

export type Tool =
  | "select"
  | "node"
  | "pan"
  | "line"
  | "construction_line"
  | "polyline"
  | "circle"
  | "arc"
  | "rect"
  | "rrect"
  | "polygon"
  | "ellipse"
  | "spline"
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
  | "slot"
  | "loft_3d";

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
  const { setTheme: setAppTheme, unit } = useSettings();
  const {
    isDark,
    isAmoled,
    bgStyle,
    accentKey,
    cardOpacity,
    bubbleOpacity,
    themeColors,
    cssVariables,
    themeVersion,
  } = useChamferAppearance();

  const canvasBgColor = themeColors.workAreaFill;
  const canvasOuterBgColor = themeColors.canvasBg;

  const toggleTheme = useCallback(
    (origin?: ThemeOriginInput) => {
      triggerHaptic("tap");
      const nextTheme = isDark ? "light" : "dark";
      setAppTheme(nextTheme, origin);
    },
    [isDark, setAppTheme],
  );

  const navigate = useNavigate();
  useDeclareImmersive(true);
  const leaveEditor = useCallback(() => {
    void navigate({ to: "/desenho-2d" });
  }, [navigate]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

  // Estratégia de Inicialização em 3 Fases do CHAMFER CAD:
  // Quadro 1 (Imediato / 0ms): Renderiza as barras de controle, títulos e status sem congelar a UI
  // Quadro 2 (rAF / microtask): Inicializa o contexto gráfico do Canvas 2D e o viewport
  // Quadro 3 (Idle / rIC): Carrega entidades geométricas, malha e árvore de cotas
  const [cadPhase, setCadPhase] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    // Transiciona para o Quadro 2 no próximo requestAnimationFrame
    const raf = requestAnimationFrame(() => {
      setCadPhase(2);

      const triggerPhase3 = () => setCadPhase(3);

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        const id = (window as any).requestIdleCallback(triggerPhase3, { timeout: 80 });
        return () => (window as any).cancelIdleCallback?.(id);
      } else {
        const t = setTimeout(triggerPhase3, 16);
        return () => clearTimeout(t);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  // Carregamento síncrono e instantâneo do projeto (Quadro Zero sem tela preta ou atraso)
  const initialProj = useMemo(() => (projectId ? getProject(projectId) : null), [projectId]);
  const initialPlan = useMemo(() => {
    if (!initialProj) return null;
    return (
      initialProj.plans.find((x) => x.id === initialProj.lastPlanId) ??
      initialProj.plans[0] ??
      null
    );
  }, [initialProj]);
  const initialEntities = useMemo(() => {
    if (!initialPlan?.entities) return [];
    return initialPlan.entities;
  }, [initialPlan]);

  const [canvasSize, setCanvasSize] = useState(() =>
    typeof window !== "undefined"
      ? { w: Math.max(320, window.innerWidth - 48), h: Math.max(320, window.innerHeight - 80) }
      : { w: 0, h: 0 },
  );

  // Inicialização sonora CAD em background para não bloquear o primeiro quadro
  useEffect(() => {
    const t = window.setTimeout(() => {
      AudioManager.play("chamfer_init");
    }, 120);
    return () => window.clearTimeout(t);
  }, []);

  const [project, setProject] = useState<Project | null>(() => initialProj);
  const [planId, setPlanId] = useState<string>(() => initialPlan?.id ?? "");
  const [entities, setEntities] = useState<Entity[]>(() => initialEntities);

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
  const [layers, setLayers] = useState<Layer[]>(() => initialProj?.layers ?? DEFAULT_LAYERS);
  const [activeLayer, setActiveLayer] = useState("corte");
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string[]>([]);
  const [view, setView] = useState({ tx: 80, ty: 80, k: 1 });
  const [cursor, setCursor] = useState<Vec2>({ x: 0, y: 0 });
  const cursorRef = useRef<Vec2>({ x: 0, y: 0 });
  cursorRef.current = cursor;
  const [snapHit, setSnapHit] = useState<Snap | null>(null);
  const [grid, setGrid] = useState(10);
  const [snapOn, setSnapOn] = useState<boolean>(() => chamferSettings.snapOnLoad ?? true);
  const [showGrid, setShowGrid] = useState<boolean>(() => chamferSettings.showGridOnLoad ?? true);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  /* WORKSPACE_FRAME — moldura técnica de trabalho (não é geometria) */
  const [frame, setFrame] = useState<WorkspaceFrame>(() =>
    typeof window === "undefined"
      ? { w: 1500, h: 1000, visible: true, showDims: true, locked: false }
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
  const [groups, setGroups] = useState<GroupDef[]>(() => initialPlan?.groups ?? []);
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
  const landscapeMoreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const landscapeMoreMenuRef = useRef<HTMLDivElement | null>(null);
  const [landscapeMoreCoords, setLandscapeMoreCoords] = useState<{ top: number; right: number }>({
    top: 52,
    right: 12,
  });

  const updateLandscapeMorePosition = useCallback(() => {
    if (typeof window === "undefined" || !landscapeMoreTriggerRef.current) return;
    const rect = landscapeMoreTriggerRef.current.getBoundingClientRect();
    setLandscapeMoreCoords({
      top: Math.max(48, Math.round(rect.bottom + 6)),
      right: Math.max(8, Math.round(window.innerWidth - rect.right)),
    });
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const handleOutsideClick = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (landscapeMoreTriggerRef.current && landscapeMoreTriggerRef.current.contains(target)) {
        return; // Não executa o fechar se o clique foi no próprio botão
      }
      if (landscapeMoreMenuRef.current && landscapeMoreMenuRef.current.contains(target)) {
        return;
      }
      setMoreOpen(false);
    };
    const handleResize = () => updateLandscapeMorePosition();
    document.addEventListener("pointerdown", handleOutsideClick);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      window.removeEventListener("resize", handleResize);
    };
  }, [moreOpen, updateLandscapeMorePosition]);
  const [statusWorkspaceMenuOpen, setStatusWorkspaceMenuOpen] = useState(false);
  const [workspaceKeypadEditor, setWorkspaceKeypadEditor] = useState<{
    axis: "w" | "h";
    currentValue: number;
    screenPos: { x: number; y: number };
  } | null>(null);
  const [statusPrecisionMenuOpen, setStatusPrecisionMenuOpen] = useState(false);
  const [statusCncMenuOpen, setStatusCncMenuOpen] = useState(false);
  /* PRECISÃO AVANÇADA, GUIAS DE INTERAÇÃO EXCLUSIVAS E RESTRIÇÕES DIMENSIONAIS REAIS */
  const [snapDivision, setSnapDivision] = useState<number>(0);
  const [showAllSnaps, setShowAllSnaps] = useState<boolean>(false);
  const [isSettingReferencePoint, setIsSettingReferencePoint] = useState<boolean>(false);
  const [interactionGuideMode, setInteractionGuideModeState] = useState<InteractionGuideMode>(() =>
    loadInteractionGuideMode(),
  );
  const [lockedConstraints, setLockedConstraints] = useState<DimensionalConstraints>({});
  const [touchInteractionState, setTouchInteractionState] = useState<TouchInteractionState>("IDLE");
  const touchInteractionStateRef = useRef<TouchInteractionState>("IDLE");
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preGestureSnapshotRef = useRef<{
    cursor: Vec2;
    temporaryOrigin: TemporaryOrigin | null;
    pending: Vec2[];
    draft: Entity | null;
    selection: string[];
  } | null>(null);
  const preEditKeypadSnapshotRef = useRef<{
    cursor: Vec2;
    draft: Entity | null;
  } | null>(null);
  /* ESPESSURA — chapa do plano; alimenta a vista 3D / Traçagem */
  const [thickness, setThickness] = useState<number>(() => initialProj?.thickness ?? DEFAULT_PLAN_THICKNESS);
  const [cad3dTreeJson, setCad3dTreeJson] = useState<string | undefined>(() => initialPlan?.cad3dTreeJson);
  const [solidOpen, setSolidOpen] = useState(false);
  /* MODO CANÔNICO DO CHAMFER: 2D ESBOÇO ↔ 3D TRAÇAGEM ↔ FLANGES */
  const [activeMode, setActiveMode] = useState<"2d" | "3d" | "flanges">("2d");
  const morphControllerRef = useRef<MorphTransitionController>(new MorphTransitionController());
  const [morphState, setMorphState] = useState<MorphTransitionState>("2D_IDLE");
  const [morphDirection, setMorphDirection] = useState<"to3d" | "to2d" | null>(null);
  const [morphDurationMs, setMorphDurationMs] = useState<number>(MORPH_TO_3D_DURATION_MS);
  const [morphStartProgress3D, setMorphStartProgress3D] = useState<number | undefined>(undefined);

  const handleMorphFrame0Ready = useCallback(() => {
    const nextState = morphControllerRef.current.beginTransitionTo3D();
    setMorphState(nextState);
  }, []);

  const handleMorphProgress = useCallback((progress3D: number) => {
    morphControllerRef.current.updateProgress(progress3D);
  }, []);

  const handleMorphComplete = useCallback((dir: "to3d" | "to2d") => {
    if (dir === "to3d") {
      const nextState = morphControllerRef.current.completeTransitionTo3D();
      setMorphState(nextState);
      setMorphDirection(null);
      setMorphStartProgress3D(undefined);
    } else {
      const nextState = morphControllerRef.current.completeTransitionTo2D();
      setMorphState(nextState);
      setMorphDirection(null);
      setMorphStartProgress3D(undefined);
      setSolidOpen(false);
    }
  }, []);

  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>("desenhar");
  const [orthoOn, setOrthoOn] = useState(false);
  const [trackingOn, setTrackingOn] = useState(false);
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false);
  const [viewMode3D, setViewMode3D] = useState<"planificada" | "isometrica">("planificada");
  const [showPoints3D, setShowPoints3D] = useState(true);
  const [showFolds3D, setShowFolds3D] = useState(true);
  const [showDims3D, setShowDims3D] = useState(true);

  /* MODO DE DESENHO ORTOGONAL 2D (FALLBACK AUTOMÁTICO DE SEGURANÇA CONTRA ISO 2D) */
  const [drawingProjectionState, setDrawingProjectionState] =
    useState<DrawingProjectionMode>("orthographic");
  const drawingProjection: DrawingProjectionMode =
    drawingProjectionState === "isometric" ? "orthographic" : drawingProjectionState;
  const setDrawingProjection = useCallback(
    (_next: DrawingProjectionMode | "iso2d" | "ISO_2D" | "ortho" | ((prev: DrawingProjectionMode) => DrawingProjectionMode)) => {
      setDrawingProjectionState("orthographic");
    },
    [],
  );
  const [isoPlane, setIsoPlane] = useState<IsoPlane>("top");
  const [isoOrtho, setIsoOrtho] = useState<boolean>(true);
  const [isoPieceBuilderOpen, setIsoPieceBuilderOpen] = useState<boolean>(false);
  const [isoPreview, setIsoPreview] = useState<{ entities: Entity[]; dims: Dimension[] } | null>(null);

  /* FERRAMENTA DE ÓRBITA 3D UNIFICADA (2D SKETCH INCLINADO + CAD 3D IN-PLACE) */
  const [orbitAzimuthDeg, setOrbitAzimuthDeg] = useState<number>(0);
  const [orbitElevationDeg, setOrbitElevationDeg] = useState<number>(90);

  /* SUB-MODOS PARAMÉTRICOS E MOBILE TOUCH (CADCraft -> CHAMFER CAD) */
  const [polylineSegMode, setPolylineSegMode] = useState<PolylineSegmentMode>("line");
  const polylineSegModesRef = useRef<PolylineSegmentMode[]>([]);
  const [rectMode, setRectMode] = useState<RectCreationMode>("corners");
  const [circleMode, setCircleMode] = useState<CircleCreationMode>("center_radius");
  const [polygonMode, setPolygonMode] = useState<PolygonCreationMode>("across_flats");
  const [polygonSides, setPolygonSides] = useState<number>(6);
  const [polygonAcrossFlatsMm, setPolygonAcrossFlatsMm] = useState<number>(24);
  const [slotMode, setSlotMode] = useState<SlotCreationMode>("center_to_center");
  const [slotWidthMm, setSlotWidthMm] = useState<number>(14);
  const [gripMode, setGripMode] = useState<GripEditMode>("stretch");
  const [lockedDims, setLockedDims] = useState<LockedDimensionsState>({
    lockedLengthMm: null,
    lockedAngleDeg: null,
  });
  const [overlappingCandidates, setOverlappingCandidates] = useState<Entity[]>([]);
  const swipeTrimFenceRef = useRef<Vec2[]>([]);
  const [swipeTrimCutPreview, setSwipeTrimCutPreview] = useState<[Vec2, Vec2][]>([]);
  const [orbitPreset, setOrbitPreset] = useState<OrbitPresetId>("top");
  const [isOrbitToolActive, setIsOrbitToolActive] = useState<boolean>(false);
  const [renderStyle3D, setRenderStyle3D] = useState<EdgeMode>("wireframe");
  const [wireframe3DStyle, setWireframe3DStyle] = useState<ChamferWireframe3DStyleConfig>(() => ({
    ...DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
  }));
  const [orbitCommand3D, setOrbitCommand3D] = useState<{
    azimuthDeg: number;
    elevationDeg: number;
    pivot: { x: number; y: number; z: number };
    animate: boolean;
    nonce: number;
  } | null>(null);
  const orbitAzimuthRef = useRef<number>(0);
  const orbitElevationRef = useRef<number>(90);
  orbitAzimuthRef.current = orbitAzimuthDeg;
  orbitElevationRef.current = orbitElevationDeg;
  const orbitAnimRafRef = useRef<number | null>(null);
  const orbitDragRef = useRef<{ x: number; y: number } | null>(null);
  const orbitStartClientRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const last3DTapRef = useRef<{ x: number; y: number; time: number; faceId?: string } | null>(null);
  const [subSelection3D, setSubSelection3D] = useState<SubElementSelectionState3D>({
    faceIds: [],
    edgeIds: [],
    bodyIds: [],
    activePivot3D: null,
    activeHingeEdgeId: null,
  });
  const [activeDirect3DTool, setActiveDirect3DTool] =
    useState<DirectModeling3DTool>("select_3d");

  const [outputMode, setOutputMode] = useState<OutputMode>("completo");
  const [pending, setPending] = useState<Vec2[]>([]);

  const [draft, setDraftState] = useState<Entity | null>(null);
  const draftRef = useRef<Entity | null>(null);
  const setDraft = useCallback((next: Entity | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  /* ESTADO PRÉ-CONFIRMAÇÃO EDITÁVEL (DRAFT-THEN-COMMIT) & ÚLTIMO VÉRTICE CRIADO */
  const [pendingDraftShape, setPendingDraftShapeState] = useState<PendingDraftShapeState | null>(null);
  const pendingDraftShapeRef = useRef<PendingDraftShapeState | null>(null);
  const setPendingDraftShape = useCallback((next: PendingDraftShapeState | null) => {
    pendingDraftShapeRef.current = next;
    setPendingDraftShapeState(next);
  }, []);
  const [draggingDraftGripIndex, setDraggingDraftGripIndex] = useState<number | null>(null);
  const lastCreatedVertexRef = useRef<Vec2>({ x: 0, y: 0 });
  const pointerMoveRafRef = useRef<number | null>(null);
  const pendingPointerMoveRef = useRef<{
    clientX: number;
    clientY: number;
    pointerType: string;
  } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [liveMeasure, setLiveMeasure] = useState<Measure | null>(null);
  /* COTAGEM — entidades DIMENSION associativas (nunca geometria de corte) */
  const [dims, setDims] = useState<Dimension[]>(() => initialPlan?.dims ?? []);
  const [dimKind, setDimKind] = useState<DimKind>("linear");
  const [dimPicks, setDimPicks] = useState<DimRef[]>([]);
  const [showDims2, setShowDims2] = useState(false);
  const [dimSel, setDimSel] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const [imageLayer, setImageLayer] = useState<VisionImageLayer | null>(null);
  /* ENGENHARIA REVERSA E BANCADA MECÂNICA (FASE B — PERSISTIDO POR PLANO) */
  const [revEngData, setRevEngData] = useState<RevEngPlanData>(() =>
    sanitizeRevEngPlanData(initialPlan?.revEng),
  );
  const [revEngCanvasMode, setRevEngCanvasMode] = useState<RevEngCanvasInteractionMode>("none");
  const [revEngPickPoints, setRevEngPickPoints] = useState<Vec2[]>([]);
  const [revEngFittedPreview, setRevEngFittedPreview] = useState<FittedPrimitiveCandidate | null>(null);
  const [issues, setIssues] = useState<{ message: string; p: Vec2 }[] | null>(null);
  const [offsetDist, setOffsetDist] = useState(5);
  const [filletR, setFilletR] = useState(10);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [filletPreview, setFilletPreview] = useState<{
    corner: DetectedCorner;
    calc: FilletCalculation;
  } | null>(null);
  const [chamferPreview, setChamferPreview] = useState<{
    corner: DetectedCorner;
    calc: ChamferCalculation;
  } | null>(null);

  /* FERRAMENTAS DE ARRAYS INTELIGENTES (POLAR E LINEAR) */
  const [activeArrayType, setActiveArrayType] = useState<ArrayType | null>(null);
  const [editingArrayGroupId, setEditingArrayGroupId] = useState<string | null>(null);
  const isDraggingArrayCenterRef = useRef<boolean>(false);
  const [arrayAnimNowMs, setArrayAnimNowMs] = useState<number>(0);
  const [arrayPolarParams, setArrayPolarParams] = useState<PolarArrayParams>({
    center: { x: 0, y: 0 },
    count: 6,
    totalAngleDeg: 360,
    startAngleDeg: 0,
    clockwise: false,
    rotateItems: true,
    includeOriginal: true,
    skippedIndices: [],
  });
  const [arrayLinearParams, setArrayLinearParams] = useState<LinearArrayParams>({
    rows: 2,
    cols: 3,
    dx: 40,
    dy: 40,
    modeX: "fixed_step",
    modeY: "fixed_step",
    spanX: 80,
    spanY: 40,
    marginX: 15,
    marginY: 15,
    angleDeg: 0,
    includeOriginal: true,
    skippedIndices: [],
  });
  const [arrayHostInfo, setArrayHostInfo] = useState<HostDetectionResult>({
    type: "unknown",
    confidence: "low",
    description: "",
    suggestedType: "polar",
    candidateCenters: [],
  });
  const [isArrayPickingCenter, setIsArrayPickingCenter] = useState<boolean>(false);

  // Animação direcional de lineDashOffset no círculo PCD e eixos do Array (Zero-Idle quando fechado)
  useEffect(() => {
    if (activeArrayType === null) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last >= 33) {
        last = t;
        setArrayAnimNowMs(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activeArrayType]);

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

  /* MOTOR LOFT 3D MULTISSEÇÃO E ELEVAÇÃO +Z (GIZMO 3D) */
  const [loftSectionIds, setLoftSectionIds] = useState<string[]>([]);
  const [loftSurfaceMode, setLoftSurfaceMode] = useState<LoftSurfaceMode>("smooth");
  const [loftBodyMode, setLoftBodyMode] = useState<LoftBodyMode>("solid");
  const [elevationKeypadState, setElevationKeypadState] = useState<{
    open: boolean;
    initialZ: number;
  }>({ open: false, initialZ: 0 });

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

  /* COMANDOS E MODAIS AVANÇADOS DO CAD & CHAMFER INTENT */
  const [quickCommandOpen, setQuickCommandOpen] = useState(false);
  const [intentPreviewPlan, setIntentPreviewPlan] = useState<ChamferIntentPlan | null>(null);
  const intentTxManagerRef = useRef<ChamferTransactionManager>(new ChamferTransactionManager());
  const [intentSession, setIntentSession] = useState<ParametricSessionContext>(() =>
    ChamferIntentInterpreter.createInitialSessionContext(),
  );
  const [topologyHealthOpen, setTopologyHealthOpen] = useState(false);
  const [variablesModalOpen, setVariablesModalOpen] = useState(false);
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [technicalSheetModalOpen, setTechnicalSheetModalOpen] = useState(false);

  /* DUAL TOOL & FERRAMENTA COMPOSTA */
  const [dualToolSecondary, setDualToolSecondary] = useState<Tool | null>(null);
  const [dualToolPinned, setDualToolPinned] = useState(false);

  /* LUPA DE PRECISÃO MOBILE & SISTEMA MODULAR DE CONTROLE DE CURSOR (CADInteractionHub) */
  const [loupeVisible, setLoupeVisible] = useState(false);
  const [loupeScreenPos, setLoupeScreenPos] = useState<Vec2>({ x: 0, y: 0 });
  const [loupeCadPos, setLoupeCadPos] = useState<Vec2>({ x: 0, y: 0 });
  const lastPointerTypeRef = useRef<string>("mouse");
  const [activePointerType, setActivePointerType] = useState<string>("mouse");
  const [touchWorldPos, setTouchWorldPos] = useState<Vec2 | null>(null);
  const [touchOffsetActive, setTouchOffsetActive] = useState<boolean>(false);
  const [nudgeStepMm, setNudgeStepMm] = useState<NudgeStepMm>(1);
  const [nudgeHudVisible, setNudgeHudVisible] = useState<boolean>(false);
  const [cursorOffsetMode, setCursorOffsetMode] = useState<CursorOffsetMode>(() =>
    loadCursorOffsetMode(),
  );
  const [loupeMode, setLoupeMode] = useState<LoupeHudMode>(() => loadLoupeHudMode());
  const loupePinned = loupeMode === "pinned";

  const toggleCursorOffsetMode = useCallback(() => {
    setCursorOffsetMode((prev) => {
      const next: CursorOffsetMode = prev === "offset" ? "direct" : "offset";
      saveCursorOffsetMode(next);
      globalCADInteractionHub.toggleModifier("cursor_offset", next === "offset");
      toast.info(
        next === "offset"
          ? "Mira Técnica: Offset 55px (Anti-Oclusão)"
          : "Mira Técnica: Direta 1:1 (Sob o dedo / Stylus)",
      );
      return next;
    });
  }, []);

  const handleCycleLoupeMode = useCallback(() => {
    setLoupeMode((prev) => {
      const next = cycleLoupeHudMode(prev);
      saveLoupeHudMode(next);
      globalCADInteractionHub.toggleModifier("loupe_hud", next !== "off");
      if (next === "off") {
        setLoupeVisible(false);
        toast.info("Lupa HUD: Desligada (Zero consumo em repouso)");
      } else if (next === "pinned") {
        toast.info("Lupa HUD: Fixa no canto superior");
      } else {
        toast.info("Lupa HUD: Flutuante (Acompanha o toque)");
      }
      return next;
    });
  }, []);

  const toggleLoupePinned = useCallback(() => {
    setLoupeMode((prev) => {
      const next: LoupeHudMode = prev === "pinned" ? "floating" : "pinned";
      saveLoupeHudMode(next);
      globalCADInteractionHub.toggleModifier("loupe_hud", true);
      toast.info(
        next === "pinned"
          ? "Lupa Fixada no canto (Modo Fixo)"
          : "Lupa Flutuante (Acompanha o dedo)",
      );
      return next;
    });
  }, []);

  // Sincroniza a ferramenta ativa e o ciclo de vida Zero-Idle com o CADInteractionHub
  useEffect(() => {
    const hubId = tool === "select" ? "pointer" : tool === "node" ? "nodes" : tool;
    if (!globalCADInteractionHub.getModule(hubId)) {
      globalCADInteractionHub.registerModule({
        id: hubId,
        type: "tool",
        label: hubId,
        active: false,
        activate: () => {},
        deactivate: () => {},
        cleanup: () => {},
      });
    }
    globalCADInteractionHub.activateModule(hubId);
  }, [tool]);

  useEffect(() => {
    return () => {
      globalCADInteractionHub.cleanupAll();
    };
  }, []);

  const lastEntityTapRef = useRef<{ id: string; time: number } | null>(null);

  /* ÁREA DE TRANSFERÊNCIA GLOBAL DO CAD (SEÇÃO 17) */
  const [clipboardModalOpen, setClipboardModalOpen] = useState(false);
  const [clipboardAnchorWorld, setClipboardAnchorWorld] = useState<Vec2 | null>(null);

  /* PASSAPORTE DE FABRICAÇÃO (SEÇÕES 34 & 35) */
  const [fabricationPassportOpen, setFabricationPassportOpen] = useState(false);
  const [integratedWorkshopOpen, setIntegratedWorkshopOpen] = useState(false);

  /* EDIÇÃO DIRETA DE COTAS NO CANVAS (SEÇÃO 14) */
  const [directDimEditor, setDirectDimEditor] = useState<{
    open: boolean;
    dimId: string;
    pos: { x: number; y: number };
    value: number;
    label: string;
  } | null>(null);

  /* SISTEMA UNIFICADO DE REFERÊNCIAS GEOMÉTRICAS, REF 0,0 E AFASTAMENTO DE BORDAS */
  const [temporaryOrigin, setTemporaryOrigin] = useState<TemporaryOrigin | null>(null);
  const [activeEdge, setActiveEdge] = useState<EdgeReference | null>(null);
  const [activeEdgeSide, setActiveEdgeSide] = useState<1 | -1>(1);
  const [activeEdgeOffset, setActiveEdgeOffset] = useState<number>(40);
  const [liveDimensions, setLiveDimensions] = useState<LiveDimension[]>([]);
  const [liveDimEditor, setLiveDimEditor] = useState<{
    dim: LiveDimension;
    screenPos: Vec2;
    currentValue: number;
    label: string;
    allowInvert?: boolean;
    measureKind?: ConstrainableMeasureKind;
    initialLocked?: boolean;
  } | null>(null);

  const [pinnedMeetingPoints, setPinnedMeetingPoints] = useState<Vec2[]>([]);
  const [relationalPicks, setRelationalPicks] = useState<RelationalPickItem[]>([]);
  const [previewGeometricMarkCandidate, setPreviewGeometricMarkCandidate] = useState<
    (Entity & { type: "point" }) | null
  >(null);
  const previewGeometricMarkCandidateRef = useRef<(Entity & { type: "point" }) | null>(null);
  const [pendingGeometricMarkConfirmation, setPendingGeometricMarkConfirmation] = useState<
    (Entity & { type: "point" }) | null
  >(null);
  const isMultiTouchGestureRef = useRef<boolean>(false);
  const gestureCooldownUntilRef = useRef<number>(0);
  const wasCameraPannedRef = useRef<boolean>(false);
  const pointerDownClientRef = useRef<Vec2 | null>(null);
  const [activeTouchScreenPos, setActiveTouchScreenPos] = useState<Vec2 | null>(null);
  const activeTouchScreenPosRef = useRef<Vec2 | null>(null);

  const [activeDatumComponent, setActiveDatumComponent] = useState<{
    datumId: string;
    component: "dx" | "dy" | "L" | "angle";
  } | null>(null);

  // Remove automaticamente quaisquer marcos "ÓRFÃO" antigos que tenham ficado salvos sem entidade-mãe
  useEffect(() => {
    setEntities((prev) => {
      const hasOrphans = prev.some((e) => {
        if (!isGeometricMarkEntity(e)) return false;
        const spec = getGeometricMarkSpec(e);
        return Boolean(
          spec?.isOrphan ||
            (!spec?.parentEntityId &&
              !spec?.secondaryEntityId &&
              !(spec?.anchorA && spec?.anchorB) &&
              spec?.referenceType !== "intersection"),
        );
      });
      if (!hasOrphans) return prev;
      return clearGeometricMarksFromEntities(prev, true).cleaned;
    });
  }, []);

  const handleSetInteractionGuideMode = useCallback(
    (nextMode: InteractionGuideMode) => {
      setInteractionGuideModeState(nextMode);
      saveInteractionGuideMode(nextMode);
      setLiveDimEditor(null);
      setLiveDimensions([]);
      setIsSettingReferencePoint(false);
      setRelationalPicks([]);
      previewGeometricMarkCandidateRef.current = null;
      setPreviewGeometricMarkCandidate(null);
      setPendingGeometricMarkConfirmation(null);

      if (nextMode !== "off") {
        const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
        const viewportCenter: Vec2 = {
          x: Number(((canvasSize.w / 2 - view.tx) / safeK).toFixed(2)),
          y: Number(((canvasSize.h / 2 - view.ty) / safeK).toFixed(2)),
        };
        const currentOrigin =
          temporaryOrigin?.p ??
          (pending.length > 0 ? pending[pending.length - 1]! : viewportCenter);

        if (!temporaryOrigin && nextMode === "blue_line") {
          setTemporaryOrigin({
            id: "ref_origin",
            p: currentOrigin,
            label: "REF 0,0",
          });
        }

        // Garante que o ponto final (X, Y) esteja deslocado de (X0, Y0) para aparição imediata no canvas
        const cur = cursorRef.current;
        if (Math.hypot(cur.x - currentOrigin.x, cur.y - currentOrigin.y) < 8 / safeK) {
          const initialTarget: Vec2 = {
            x: Number((currentOrigin.x + 120 / safeK).toFixed(2)),
            y: Number((currentOrigin.y - 80 / safeK).toFixed(2)),
          };
          cursorRef.current = initialTarget;
          setCursor(initialTarget);
        }
      }
    },
    [view.k, view.tx, view.ty, canvasSize.w, canvasSize.h, temporaryOrigin, pending],
  );
  const [showGlobalCoordsPeek, setShowGlobalCoordsPeek] = useState<boolean>(false);

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
  /* Sessão de arraste determinístico com Snapshot Inicial e Delta Absoluto no Espaço do Mundo */
  const dragEntityRef = useRef<{
    pointerId: number;
    startClient: Vec2;
    startWorld: Vec2;
    ids: string[];
    initialEntitiesSnapshot: Entity[];
    moved: boolean;
    effectiveDelta: Vec2;
    unlocked?: boolean;
  } | null>(null);
  const isDraggingEntityRef = useRef<boolean>(false);
  const [isDraggingUnlocked, setIsDraggingUnlocked] = useState<boolean>(false);
  const dragCooldownUntilRef = useRef<number>(0);
  const dragLongPressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    pointerId: number;
    startClient: Vec2;
    startWorld: Vec2;
    ids: string[];
    initialEntitiesSnapshot: Entity[];
  } | null>(null);
  const pendingDragEntitiesRef = useRef<Entity[] | null>(null);
  const dragRafRef = useRef<number | null>(null);
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

  /* PIVÔ INTELIGENTE DA ÓRBITA E PROJEÇÃO 3D DO PLANO DE TRABALHO 2D */
  const smartOrbitPivot = useMemo(
    () => computeSmartOrbitPivot(entities, selection, temporaryOrigin?.p ?? null, thickness),
    [entities, selection, temporaryOrigin, thickness],
  );
  const smartOrbitPivotRef = useRef(smartOrbitPivot);
  smartOrbitPivotRef.current = smartOrbitPivot;

  const orbitProjection2D = useMemo(
    () =>
      computeWorkplaneOrbitProjection2D(
        orbitAzimuthDeg,
        orbitElevationDeg,
        smartOrbitPivot,
        thickness,
      ),
    [orbitAzimuthDeg, orbitElevationDeg, smartOrbitPivot, thickness],
  );
  const orbitProjection2DRef = useRef(orbitProjection2D);
  orbitProjection2DRef.current = orbitProjection2D;

  useEffect(() => {
    return () => {
      if (orbitAnimRafRef.current) {
        cancelAnimationFrame(orbitAnimRafRef.current);
        orbitAnimRafRef.current = null;
      }
    };
  }, []);

  const animateOrbitTo = useCallback(
    (targetAzimuthDeg: number, targetElevationDeg: number, nextPreset: OrbitPresetId) => {
      if (orbitAnimRafRef.current) {
        cancelAnimationFrame(orbitAnimRafRef.current);
        orbitAnimRafRef.current = null;
      }

      const startAz = orbitAzimuthRef.current;
      const startEl = orbitElevationRef.current;
      const startTime = performance.now();

      setOrbitPreset(nextPreset);
      setOrbitCommand3D({
        azimuthDeg: targetAzimuthDeg,
        elevationDeg: targetElevationDeg,
        pivot: smartOrbitPivotRef.current,
        animate: true,
        nonce: startTime,
      });

      const step = (now: number) => {
        const rawT = Math.min(1, (now - startTime) / ORBIT_TRANSITION_DURATION_MS);
        const interp = interpolateOrbitAngles(
          startAz,
          startEl,
          targetAzimuthDeg,
          targetElevationDeg,
          rawT,
        );
        orbitAzimuthRef.current = interp.azimuthDeg;
        orbitElevationRef.current = interp.elevationDeg;
        setOrbitAzimuthDeg(interp.azimuthDeg);
        setOrbitElevationDeg(interp.elevationDeg);

        if (rawT < 1) {
          orbitAnimRafRef.current = requestAnimationFrame(step);
        } else {
          orbitAnimRafRef.current = null;
        }
      };

      orbitAnimRafRef.current = requestAnimationFrame(step);
    },
    [],
  );

  // Motor Sólido 3D In-Place ativo no canvas unificado quando em vista 3D e modo SÓLIDO / SOMB
  const isInPlaceSolid3DActive =
    !solidOpen &&
    (activeMode === "3d" || orbitProjection2D.isTilted || isOrbitToolActive) &&
    renderStyle3D !== "wireframe";

  const transitionTo3D = useCallback(
    (targetMode: "3d" | "flanges" = "3d") => {
      setActiveMode(targetMode);
      setSolidOpen(false);
      setIsOrbitToolActive(true);
      if (targetMode === "3d") {
        // Desativa ferramentas de desenho/modificação 2D ao entrar no CAD 3D
        setTool("select");
        setPending([]);
        setDraft(null);
        setPortraitDrawerOpen(false);
        setDivideEditorOpen(false);
        setMobileEditorOpenManual(false);
        setActiveArrayType(null);
        setRenderStyle3D((prev) => (prev === "wireframe" ? "shaded-edges" : prev));
        setSelection((prevSel) => {
          if (prevSel.length > 0) return prevSel;
          const firstDrawable = entities.find((e) => e.type !== "point" && e.type !== "text");
          return firstDrawable ? [firstDrawable.id] : prevSel;
        });
      }
      if (isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
        animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
      }
    },
    [animateOrbitTo, entities],
  );

  useEffect(() => {
    const handleSelectDirect3DTool = (ev: Event) => {
      const custom = ev as CustomEvent<{
        tool?: DirectModeling3DTool;
        tool3D?: DirectModeling3DTool;
      }>;
      const nextTool = custom.detail?.tool ?? custom.detail?.tool3D;
      if (!nextTool) return;
      setTool("select");
      setPending([]);
      setDraft(null);
      setActiveDirect3DTool(nextTool);
      setActiveMode("3d");
      setSolidOpen(false);
      setIsOrbitToolActive(true);
      setRenderStyle3D((prev) => (prev === "wireframe" ? "shaded-edges" : prev));
      if (isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
        animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
      }
    };
    window.addEventListener("chamfer-select-direct-3d-tool", handleSelectDirect3DTool);
    return () =>
      window.removeEventListener("chamfer-select-direct-3d-tool", handleSelectDirect3DTool);
  }, [animateOrbitTo]);

  const transitionTo2D = useCallback(() => {
    if (orbitAnimRafRef.current) {
      cancelAnimationFrame(orbitAnimRafRef.current);
      orbitAnimRafRef.current = null;
    }
    setActiveMode("2d");
    setActiveDirect3DTool("select_3d");
    setSubSelection3D({
      faceIds: [],
      edgeIds: [],
      bodyIds: [],
      activePivot3D: null,
      activeHingeEdgeId: null,
    });
    setDrawingProjection("orthographic");
    setSolidOpen(false);
    setMorphDirection(null);
    setMorphState("2D_IDLE");
    setIsOrbitToolActive(false);
    orbitDragRef.current = null;
    orbitAzimuthRef.current = 0;
    orbitElevationRef.current = 90;
    setOrbitAzimuthDeg(0);
    setOrbitElevationDeg(90);
    setOrbitPreset("top");
    setOrbitCommand3D({
      azimuthDeg: 0,
      elevationDeg: 90,
      pivot: smartOrbitPivotRef.current,
      animate: false,
      nonce: performance.now(),
    });
  }, [setDrawingProjection]);

  const handleSelectOrbitPreset = useCallback(
    (presetId: OrbitPresetId) => {
      if (presetId === "free") {
        setIsOrbitToolActive(true);
        setOrbitPreset("free");
        toast.info("Órbita 3D Livre ativada — arraste na tela para rotacionar a perspectiva.");
        return;
      }
      if (presetId === "top") {
        transitionTo2D();
        toast.info("Perspectiva: Superior (2D)");
        return;
      }
      setIsOrbitToolActive(true);
      const def = getOrbitPresetDefinition(presetId);
      animateOrbitTo(def.azimuthDeg, def.elevationDeg, presetId);
      toast.info(`Perspectiva: ${def.label}`);
    },
    [animateOrbitTo, transitionTo2D],
  );

  const handleDragOrbitDelta = useCallback((dx: number, dy: number) => {
    if (orbitAnimRafRef.current) {
      cancelAnimationFrame(orbitAnimRafRef.current);
      orbitAnimRafRef.current = null;
    }
    const next = applyOrbitDragDelta(
      orbitAzimuthRef.current,
      orbitElevationRef.current,
      dx,
      dy,
    );
    orbitAzimuthRef.current = next.azimuthDeg;
    orbitElevationRef.current = next.elevationDeg;
    setOrbitAzimuthDeg(next.azimuthDeg);
    setOrbitElevationDeg(next.elevationDeg);
    setOrbitPreset("free");
    setOrbitCommand3D({
      azimuthDeg: next.azimuthDeg,
      elevationDeg: next.elevationDeg,
      pivot: smartOrbitPivotRef.current,
      animate: false,
      nonce: performance.now(),
    });
  }, []);

  const handleOrbitAnglesFrom3D = useCallback(
    (angles: { azimuthDeg: number; elevationDeg: number }) => {
      orbitAzimuthRef.current = angles.azimuthDeg;
      orbitElevationRef.current = angles.elevationDeg;
      setOrbitAzimuthDeg(angles.azimuthDeg);
      setOrbitElevationDeg(angles.elevationDeg);
      setOrbitPreset(detectMatchingPreset(angles.azimuthDeg, angles.elevationDeg));
    },
    [],
  );

  /* --------------------------------------------------------- coordenadas */
  const getTouchCanvasScreenPos = useCallback(
    (ev: {
      clientX?: number;
      clientY?: number;
      touches?: ArrayLike<{ clientX: number; clientY: number }>;
      changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
    }): Vec2 => {
      const el = svgRef.current ?? canvasViewportRef.current ?? canvasRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };

      const touchPt =
        ev.touches && ev.touches.length > 0
          ? ev.touches[0]
          : ev.changedTouches && ev.changedTouches.length > 0
            ? ev.changedTouches[0]
            : null;
      const rawClientX = touchPt ? touchPt.clientX : (ev.clientX ?? 0);
      const rawClientY = touchPt ? touchPt.clientY : (ev.clientY ?? 0);

      const scaleX =
        canvasSize.w > 0 && rect.width > 0 ? canvasSize.w / rect.width : 1;
      const scaleY =
        canvasSize.h > 0 && rect.height > 0 ? canvasSize.h / rect.height : 1;

      return {
        x: (rawClientX - rect.left) * scaleX,
        y: (rawClientY - rect.top) * scaleY,
      };
    },
    [canvasSize.w, canvasSize.h],
  );

  const toWorld = useCallback(
    (
      ev: {
        clientX?: number;
        clientY?: number;
        pointerType?: string;
        touches?: ArrayLike<{ clientX: number; clientY: number }>;
        changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
      },
      forceDirect = false,
    ): Vec2 => {
      const el = svgRef.current ?? canvasViewportRef.current ?? canvasRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };

      const touchPt =
        ev.touches && ev.touches.length > 0
          ? ev.touches[0]
          : ev.changedTouches && ev.changedTouches.length > 0
            ? ev.changedTouches[0]
            : null;
      const rawClientX = touchPt ? touchPt.clientX : (ev.clientX ?? 0);
      const rawClientY = touchPt ? touchPt.clientY : (ev.clientY ?? 0);

      const scaleX =
        canvasSize.w > 0 && rect.width > 0 ? canvasSize.w / rect.width : 1;
      const scaleY =
        canvasSize.h > 0 && rect.height > 0 ? canvasSize.h / rect.height : 1;

      const touchX = (rawClientX - rect.left) * scaleX;
      const touchY = (rawClientY - rect.top) * scaleY;

      const isTouchOrActiveMira55 =
        !forceDirect &&
        cursorOffsetMode === "offset" &&
        tool !== "pan" &&
        (ev.pointerType === "touch" ||
          Boolean(touchPt) ||
          lastPointerTypeRef.current === "touch" ||
          (ptrsRef.current.size === 1 && !panRef.current));

      // Coordenada Real da Mira (55px Acima do Toque): crosshairScreenY = touchY - 55
      const crosshairScreenX = touchX;
      const crosshairScreenY = isTouchOrActiveMira55
        ? touchY - TOUCH_CURSOR_OFFSET_PX
        : touchY;

      const v = viewRef.current;
      const safeK = v && Number.isFinite(v.k) && v.k > 0 ? v.k : 1;
      const safeTx = v && Number.isFinite(v.tx) ? v.tx : 0;
      const safeTy = v && Number.isFinite(v.ty) ? v.ty : 0;

      const projectedPt: Vec2 = {
        x: (crosshairScreenX - safeTx) / safeK,
        y: (crosshairScreenY - safeTy) / safeK,
      };

      if (!solidOpen && orbitProjection2DRef.current.isTilted) {
        return unprojectOrbit2DToWorkplanePoint(
          projectedPt,
          orbitAzimuthRef.current,
          orbitElevationRef.current,
          smartOrbitPivotRef.current,
        );
      }
      return projectedPt;
    },
    [canvasSize.w, canvasSize.h, solidOpen, cursorOffsetMode, tool],
  );

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

    const isPortraitViewport = rw < rh;
    const rulerLeft = isPortraitViewport ? 20 : 30;
    const rulerTop = isPortraitViewport ? 20 : 26;
    const usableW = Math.max(rw - rulerLeft, 40);
    const usableH = Math.max(rh - rulerTop, 40);

    // Em tela vertical (Portrait), usa margem limpa de 12% e reserva folga superior/esquerda
    // para o selo "⬚ ÁREA DE TRABALHO • 1500 × 3000 mm" e as cotas externas sem qualquer corte.
    const marginX = isPortraitViewport ? Math.max(usableW * 0.12, 28) : Math.min(usableW, usableH) * 0.08 + 24;
    const marginY = isPortraitViewport ? Math.max(usableH * 0.10, 32) : Math.min(usableW, usableH) * 0.08 + 24;
    const topBadgeAllowance = isPortraitViewport ? 56 : 42;
    const leftDimAllowance = isPortraitViewport ? 24 : 18;

    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const availW = Math.max(usableW - marginX * 2 - leftDimAllowance, 40);
    const availH = Math.max(usableH - marginY * 2 - topBadgeAllowance, 40);

    const rawK = Math.min(availW / w, availH / h);
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rawK));

    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.minY + h) / 2;

    const centerScreenX = rulerLeft + leftDimAllowance * 0.5 + usableW / 2;
    const centerScreenY = rulerTop + topBadgeAllowance * 0.45 + usableH / 2;

    const nextView = {
      k,
      tx: centerScreenX - cx * k,
      ty: centerScreenY - cy * k,
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
  const loadedProjectIdRef = useRef<string | null>(initialProj?.id ?? null);

  // Auto-fit progressivo no Quadro 3 (quando a geometria é carregada sem congelar a UI no Quadro 1)
  useEffect(() => {
    if (cadPhase >= 3 && initialEntities.length > 0) {
      const b = bbox(initialEntities);
      if (b && Number.isFinite(b.minX) && b.maxX - b.minX > 1) {
        fitBoxRef.current(b);
      }
    }
  }, [cadPhase, initialEntities]);

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
    setCad3dTreeJson(plan.cad3dTreeJson);
    setRevEngData(sanitizeRevEngPlanData(plan.revEng));
    setRevEngCanvasMode("none");
    setRevEngPickPoints([]);
    setRevEngFittedPreview(null);
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
          ? {
              ...pl,
              entities,
              groups: live,
              dims: pruneDimensions(dims, entities),
              cad3dTreeJson,
              revEng: revEngData,
            }
          : pl,
      ),
    };
    saveProject(next);
    setProject(next);
    setTimeout(() => {
      setSaveStatus("salvo");
    }, 400);
  }, [project, planId, entities, groups, layers, thickness, dims, cad3dTreeJson, revEngData]);

  const handleManualSave = useCallback(() => {
    triggerHaptic("action");
    performSave();
    toast.success("Projeto salvo com sucesso!");
  }, [performSave]);

  /* SALVAMENTO AUTOMÁTICO CONFORME CONFIGURAÇÃO DO CHAMFER */
  useEffect(() => {
    if (isInitialLoad.current || !project || !planId || isDraggingEntityRef.current) return;

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

  /* Orientação livre (Portrait e Landscape) — sem bloqueio forçado de tela */

  const [activeStrokeColor, setActiveStrokeColor] = useState<string | null>(null);
  const activeStrokeColorRef = useRef<string | null>(null);
  useEffect(() => {
    activeStrokeColorRef.current = activeStrokeColor;
  }, [activeStrokeColor]);

  const layerOf = useCallback((id: string) => layers.find((l) => l.id === id), [layers]);

  const commit = useCallback((next: Entity[] | ((p: Entity[]) => Entity[])) => {
    setEntities((prev) => {
      past.current = [...past.current.slice(-49), prev];
      future.current = [];
      setHistoryState({ canUndo: past.current.length > 0, canRedo: false });
      const updated = typeof next === "function" ? next(prev) : next;
      const seenIds = new Set<string>();
      const prevIds = new Set(prev.map((e) => e.id));
      const strokeOverride = activeStrokeColorRef.current;
      const normalizedList = updated.map((ent) => {
        let entId = ent.id;
        const isBrandNew =
          !entId || entId === "draft" || entId.startsWith("draft-") || !prevIds.has(entId);
        if (!entId || entId === "draft" || entId.startsWith("draft-") || seenIds.has(entId)) {
          entId = uid();
        }
        seenIds.add(entId);
        let nextEnt = ent.id === entId ? ent : { ...ent, id: entId };
        if (isBrandNew && strokeOverride && !nextEnt.params?.strokeColor) {
          nextEnt = {
            ...nextEnt,
            params: {
              ...(nextEnt.params ?? {}),
              strokeColor: strokeOverride,
            },
          };
        }
        return nextEnt;
      });
      return syncAssociativeGeometricMarks(normalizedList);
    });
  }, []);

  const commitPendingDraftShape = useCallback(
    (shapeOverride?: PendingDraftShapeState | null) => {
      const target = shapeOverride ?? pendingDraftShapeRef.current;
      if (!target) return;
      const hasAnyLockedConstraint =
        lockedConstraints.lockedL != null ||
        lockedConstraints.lockedDx != null ||
        lockedConstraints.lockedDy != null ||
        lockedConstraints.lockedDist != null;
      const baseFinal: Entity =
        !target.entity.id ||
        target.entity.id === "draft" ||
        target.entity.id.startsWith("draft-")
          ? { ...target.entity, id: uid() }
          : target.entity;
      const finalEntity: Entity = hasAnyLockedConstraint
        ? {
            ...baseFinal,
            params: {
              ...baseFinal.params,
              lockedConstraints: { ...lockedConstraints },
            },
          }
        : baseFinal;
      commit((e) => [...e, finalEntity]);
      lastCreatedVertexRef.current = target.p1;
      setPendingDraftShape(null);
      setDraggingDraftGripIndex(null);
      setSelection([]);
      setMobileEditorOpenManual(false);

      if (dualToolSecondary === "dim") {
        const dim = makeDimension("aligned", [{ kind: "entity", id: finalEntity.id }], 20);
        setDims((list) => [...list, dim]);
        toast.success("Cota técnica gerada automaticamente via Dual Tool.");
        if (!dualToolPinned) setDualToolSecondary(null);
      } else if (dualToolSecondary === "smart_trim") {
        setTool("smart_trim");
        toast.info("Dual Tool: selecione o trecho a aparar.");
      }
    },
    [
      commit,
      dualToolPinned,
      dualToolSecondary,
      lockedConstraints,
      setPendingDraftShape,
    ],
  );

  const undo = useCallback(() => {
    if (pendingDraftShapeRef.current) {
      setPendingDraftShape(null);
      setDraggingDraftGripIndex(null);
      triggerHaptic("selection");
      toast.info("Forma em pré-confirmação descartada.");
      return;
    }
    // Se houver desenho em progresso (pontos de polilinha, draft, etc.), cancela o rascunho primeiro
    if (pending.length > 0) {
      setPending([]);
      setDraft(null);
      triggerHaptic("selection");
      toast.info("Rascunho atual cancelado.");
      return;
    }
    if (liveMeasure) {
      setLiveMeasure(null);
      return;
    }
    const last = past.current.pop();
    if (!last) return;
    setEntities((prev) => {
      future.current = [prev, ...future.current];
      return last;
    });
    setHistoryState({ canUndo: past.current.length > 0, canRedo: future.current.length + 1 > 0 });
    triggerHaptic("medium");
    toast.success("Ação desfeita");
  }, [pending.length, liveMeasure]);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (!next) return;
    future.current = rest;
    setEntities((prev) => {
      past.current = [...past.current, prev];
      return next;
    });
    setHistoryState({ canUndo: true, canRedo: rest.length > 0 });
    triggerHaptic("medium");
    toast.success("Ação refeita");
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
  const activeEntities = useMemo(
    () => (cadPhase >= 3 ? entities : []),
    [cadPhase, entities],
  );

  const visible = useMemo(
    () => activeEntities.filter((e) => Boolean(e && e.id) && layerOf(e.layer)?.visible !== false),
    [activeEntities, layerOf],
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
      // Raio de Captura da Mira: 55px na tela convertido para 55 / zoom em coordenadas de mundo (Seção 5.2 / 5.3)
      // Avalia a distância perpendicular exata às arestas/contornos ao redor do centro real do retículo (cx, cy)
      const tol = 55 / view.k;
      const candidates: { e: Entity; d: number }[] = [];

      for (const e of near(p, Math.max(tol, 55 / view.k))) {
        if (layerOf(e.layer)?.locked) continue;
        let d = Infinity;
        if (e.type === "circle") {
          // Interior 100% vazado: calcula estritamente a distância matemática ao contorno/traço
          const cd = dist(p, { x: e.cx, y: e.cy });
          d = Math.abs(cd - e.r);
        } else if (e.type === "arc") {
          // Mede a distância ao arco no seu vão angular ou às pontas
          const cd = dist(p, { x: e.cx, y: e.cy });
          const twoPi = Math.PI * 2;
          const norm = (a: number) => ((a % twoPi) + twoPi) % twoPi;
          const a0 = norm(e.a0);
          let a1 = norm(e.a1);
          if (a1 <= a0) a1 += twoPi;
          let cur = norm(Math.atan2(p.y - e.cy, p.x - e.cx));
          if (cur < a0) cur += twoPi;
          if (cur <= a1) {
            d = Math.abs(cd - e.r);
          } else {
            const p0 = { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) };
            const p1 = { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) };
            d = Math.min(dist(p, p0), dist(p, p1));
          }
        } else if (e.type === "ellipse") {
          // Interior 100% vazado: calcula distância ao perímetro elíptico
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
          d = Math.abs(Math.sqrt(normD) - 1) * Math.min(rx, ry);
        } else if (e.type === "text") {
          d = dist(p, { x: e.x, y: e.y });
        } else if (e.type === "point") {
          if (isPersistentDatumEntity(e)) {
            const spec = getPersistentDatumSpec(e);
            if (spec) {
              const corner = { x: spec.target.x, y: spec.origin.y };
              d = Math.min(
                dist(p, spec.origin),
                dist(p, spec.target),
                dist(p, closestOnSegment(p, [spec.origin, spec.target])),
                dist(p, closestOnSegment(p, [spec.origin, corner])),
                dist(p, closestOnSegment(p, [corner, spec.target])),
              );
            } else {
              d = dist(p, { x: e.x, y: e.y });
            }
          } else {
            d = dist(p, { x: e.x, y: e.y });
          }
        } else {
          // Linhas e polilinhas (abertas ou fechadas / retângulos / polígonos):
          // Mede estritamente a distância matemática às arestas/traços reais.
          // Sem captura de área interna vazia (nunca bloqueia entidades de baixo)!
          for (const s of segmentsOf(e)) {
            d = Math.min(d, dist(p, closestOnSegment(p, s)));
          }
        }

        if (d <= tol) {
          candidates.push({ e, d });
        }
      }

      if (
        drawingProjection === "isometric" ||
        orbitProjection2D.isTilted
      ) {
        const uz = resolveUnitZWorkplaneOffset(
          drawingProjection === "isometric",
          isoPlane,
          orbitProjection2D,
        );

        const measureEntityDistanceAtPoint = (ent: Entity, pt: Vec2): number => {
          if (ent.type === "circle") {
            return Math.abs(dist(pt, { x: ent.cx, y: ent.cy }) - ent.r);
          }
          if (ent.type === "arc") {
            const cd = dist(pt, { x: ent.cx, y: ent.cy });
            const twoPi = Math.PI * 2;
            const norm = (a: number) => ((a % twoPi) + twoPi) % twoPi;
            const a0 = norm(ent.a0);
            let a1 = norm(ent.a1);
            if (a1 <= a0) a1 += twoPi;
            let cur = norm(Math.atan2(pt.y - ent.cy, pt.x - ent.cx));
            if (cur < a0) cur += twoPi;
            if (cur <= a1) return Math.abs(cd - ent.r);
            const p0 = { x: ent.cx + ent.r * Math.cos(ent.a0), y: ent.cy + ent.r * Math.sin(ent.a0) };
            const p1 = { x: ent.cx + ent.r * Math.cos(ent.a1), y: ent.cy + ent.r * Math.sin(ent.a1) };
            return Math.min(dist(pt, p0), dist(pt, p1));
          }
          let best = Infinity;
          for (const s of segmentsOf(ent)) {
            best = Math.min(best, dist(pt, closestOnSegment(pt, s)));
          }
          return best;
        };

        for (const e of visible) {
          if (layerOf(e.layer)?.locked) continue;
          const elevZ = getEntityElevationZ(e);
          const extH = getEntityExtrudeHeight(e, thickness);
          const loftSpec = getEntityLoft3DSpec(e);
          if (Math.abs(elevZ) <= 0.01 && extH <= 0.01 && !loftSpec) continue;

          const pAtBaseZ = { x: p.x - uz.x * elevZ, y: p.y - uz.y * elevZ };
          let d = measureEntityDistanceAtPoint(e, pAtBaseZ);

          if (extH > 0.01) {
            const topZ = elevZ + extH;
            const pAtTopZ = { x: p.x - uz.x * topZ, y: p.y - uz.y * topZ };
            d = Math.min(d, measureEntityDistanceAtPoint(e, pAtTopZ));
          }

          if (loftSpec && Array.isArray(loftSpec.sectionEntities)) {
            for (const sec of loftSpec.sectionEntities) {
              const secZ = getEntityElevationZ(sec);
              const pSec = { x: p.x - uz.x * secZ, y: p.y - uz.y * secZ };
              d = Math.min(d, measureEntityDistanceAtPoint(sec, pSec));
            }
          }

          if (d <= tol * 1.35) {
            const existing = candidates.find((c) => c.e.id === e.id);
            if (existing) {
              existing.d = Math.min(existing.d, d);
            } else {
              candidates.push({ e, d });
            }
          }
        }
      }

      if (candidates.length === 0) return null;
      // Ordena por menor distância matemática à aresta
      candidates.sort((a, b) => a.d - b.d);
      if (candidates.length === 1) return candidates[0].e;

      // Alternância / ciclo entre entidades sobrepostas ao tocar repetidamente no mesmo ponto
      const selIdx = candidates.findIndex((c) => selection.includes(c.e.id));
      if (selIdx >= 0 && candidates.length > 1) {
        return candidates[(selIdx + 1) % candidates.length].e;
      }

      return candidates[0].e;
    },
    [near, view.k, layerOf, selection, drawingProjection, orbitProjection2D, isoPlane, visible, thickness],
  );

  const snapPoint = useCallback(
    (p: Vec2): Vec2 => {
      if (!snapOn) return p;
      const tol = (nudgeHudVisible ? 6 : 12) / view.k;

      // Prioridade máxima para Pontos de Encontro Roxos (+) confirmados
      for (const mp of pinnedMeetingPoints) {
        if (dist(p, mp) <= tol * 1.35) {
          return { x: mp.x, y: mp.y };
        }
      }

      const activeStart = pending.length > 0 ? pending[pending.length - 1] : null;
      const smart = findSmartSnap(p, entities, tol, activeStart ?? null, tool, selection, snapDivision);
      if (smart) return smart.p;

      // Snapping prioritário à grade isométrica quando em modo isométrico
      if (drawingProjection === "isometric" && showGrid) {
        const isoG = snapToIsoGrid(p, grid, isoPlane);
        if (dist(p, isoG) <= tol * 1.5) return isoG;
      }

      const s = findSnap(p, near(p, tol * 2), tol, grid, { grid: showGrid, object: true });
      return s ? s.p : p;
    },
    [snapOn, view.k, pinnedMeetingPoints, pending, entities, tool, selection, snapDivision, nudgeHudVisible, near, grid, showGrid, drawingProjection, isoPlane],
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
        setCanvasSize((prev) => {
          if (prev.w === nextW && prev.h === nextH) return prev;
          const prevPortrait = prev.w > 20 && prev.h > 20 && prev.w < prev.h;
          const nextPortrait = nextW < nextH;
          if (
            initialFitDoneRef.current &&
            prev.w > 20 &&
            prev.h > 20 &&
            arrayFrameAnimRafRef.current === null
          ) {
            if (prevPortrait !== nextPortrait) {
              // Auto-Fit Portrait: ao alternar entre Paisagem e Retrato, recalcula o bounding box
              // das peças (ou da Área de Trabalho) com 12% de margem limpa sem cortar cotas/selo
              requestAnimationFrame(() => {
                const list = entitiesRef.current;
                const b = list.length > 0 ? bbox(list) : null;
                if (b && Number.isFinite(b.minX) && b.maxX - b.minX > 1) {
                  fitBoxRef.current(b);
                } else {
                  fitBoxRef.current(frameBox(loadFrame()));
                }
              });
            } else {
              const dw = (nextW - prev.w) / 2;
              const dh = (nextH - prev.h) / 2;
              const curV = viewRef.current;
              if (
                curV &&
                Number.isFinite(curV.tx) &&
                Number.isFinite(curV.ty) &&
                Number.isFinite(curV.k)
              ) {
                const adjusted = { k: curV.k, tx: curV.tx + dw, ty: curV.ty + dh };
                viewRef.current = adjusted;
                setView(adjusted);
              }
            }
          }
          return { w: nextW, h: nextH };
        });
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

  const activeLoftPreviewMesh = useMemo(() => {
    if ((tool !== "loft_3d" && activeDirect3DTool !== "loft_3d") || loftSectionIds.length < 2) {
      return null;
    }
    const sectionEntities = loftSectionIds
      .map((id) => entities.find((e) => e.id === id))
      .filter((e): e is Entity => Boolean(e));
    if (sectionEntities.length < 2) return null;
    return buildLoft3DMesh(sectionEntities, {
      surfaceMode: loftSurfaceMode,
      bodyMode: loftBodyMode,
      wallThicknessMm: thickness,
    });
  }, [tool, activeDirect3DTool, loftSectionIds, entities, loftSurfaceMode, loftBodyMode, thickness]);

  const handleConfirmLoft3D = useCallback(() => {
    const sectionEntities = loftSectionIds
      .map((id) => entities.find((e) => e.id === id))
      .filter((e): e is Entity => Boolean(e));
    if (sectionEntities.length < 2) {
      toast.error("Selecione pelo menos 2 seções transversais fechadas para criar o Loft 3D.");
      return;
    }
    const loftEntity = createLoft3DEntity({
      sectionEntities,
      surfaceMode: loftSurfaceMode,
      bodyMode: loftBodyMode,
      wallThicknessMm: thickness,
      layer: activeLayer,
    });
    if (!loftEntity) {
      toast.error("Não foi possível gerar a malha 3D do Loft para os perfis selecionados.");
      return;
    }
    triggerHaptic("action");
    const consumedSet = new Set(loftSectionIds);
    commit((list) => [...list.filter((e) => !consumedSet.has(e.id)), loftEntity]);
    setSelection([loftEntity.id]);
    setSubSelection3D({
      faceIds: [],
      edgeIds: [],
      vertexIds: [],
      bodyIds: [`body_${loftEntity.id}`],
      selectionScope: "body",
      activePivot3D: null,
      activeHingeEdgeId: null,
    });
    setLoftSectionIds([]);
    setTool("select");
    setActiveDirect3DTool("select_3d");
    toast.success(
      `✓ Sólido Loft 3D criado com ${sectionEntities.length} seções (${
        loftSurfaceMode === "smooth" ? "Suave / Smooth Fit" : "Reto / Ruled"
      }).`,
    );
  }, [loftSectionIds, entities, loftSurfaceMode, loftBodyMode, thickness, activeLayer, commit]);

  const render2DSceneForMode = useCallback(
    (targetMode: "light" | "dark" | "amoled") => {
      if (cadPhase < 2) return;
      const el = canvasRef.current;
      if (!el || !canvasSize.w || !canvasSize.h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(canvasSize.w * dpr);
      const ph = Math.round(canvasSize.h * dpr);
      if (el.width !== pw) el.width = pw;
      if (el.height !== ph) el.height = ph;
      const ctx = el.getContext("2d");
      if (!ctx) return;

      if (solidOpen || isInPlaceSolid3DActive) {
        // Em modo 3D Sólido In-Place ou Traçagem, limpa o canvas 2D para exibir o sólido B-Rep sem duplicação
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
        return;
      }

      const modeIsDark = targetMode !== "light";
      const palette = buildChamferThemeColors(
        targetMode,
        bgStyle,
        accentKey,
        cardOpacity,
        bubbleOpacity,
      );
      const hasIsoSolidFaces = entities.some((e) => e.params?.isIsoSolidFace);
      const isIsoView = drawingProjection === "isometric" || hasIsoSolidFaces;

      drawScene(ctx, {
        index: drawIndex,
        view,
        width: canvasSize.w,
        height: canvasSize.h,
        dpr,
        selection: selectionSet,
        lod: gesturing,
        isLight: !modeIsDark,
        canvasBgColor: palette.workAreaFill,
        themeLerpT: modeIsDark ? 1 : 0,
        isDraggingUnlocked,
        isIsometric: isIsoView,
        isoPlane,
        sheetThickness: thickness,
        orbitProjection: orbitProjection2D,
        wireframe3DStyle,
        showGrid,
        gridStep: Math.max(15, grid * 2.5),
        bgStyle,
        activeLoftPreviewMesh,
      });

      // Renderiza a Mira 55px no final do loop 2D do <canvas> (Seção 3.2):
      // A. Anel de Apoio do Dedo em (touchX, touchY) (raio 14px)
      // B. Haste Conectora Vertical de 55px (tracejada)
      // C. Retículo Óptico Principal de Precisão em (touchX, touchY - 55) ou travado no SNAP
      if (
        cursorOffsetMode === "offset" &&
        tool !== "pan" &&
        !isMultiTouchGestureRef.current &&
        touchInteractionState !== "MULTITOUCH_NAVIGATION" &&
        activeTouchScreenPos
      ) {
        const activeSnapObj = smartSnap ?? snapHit;
        const snapScreenPt = activeSnapObj
          ? {
              x: activeSnapObj.p.x * view.k + view.tx,
              y: activeSnapObj.p.y * view.k + view.ty,
            }
          : {
              x: activeTouchScreenPos.x,
              y: activeTouchScreenPos.y - TOUCH_CURSOR_OFFSET_PX,
            };

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderCrosshair55Overlay(ctx, {
          touchScreen: activeTouchScreenPos,
          reticleScreen: snapScreenPt,
          hasSnap: Boolean(activeSnapObj),
          snapLabel:
            smartSnap?.label ??
            (snapHit
              ? snapHit.kind === "end"
                ? "Vértice"
                : snapHit.kind === "mid"
                  ? "Ponto Médio"
                  : snapHit.kind === "center"
                    ? "Centro"
                    : "Grade"
              : null),
        });
        ctx.restore();
      }
    },
    [
      cadPhase,
      canvasSize.w,
      canvasSize.h,
      solidOpen,
      isInPlaceSolid3DActive,
      bgStyle,
      accentKey,
      cardOpacity,
      bubbleOpacity,
      entities,
      drawingProjection,
      drawIndex,
      view,
      selectionSet,
      gesturing,
      isDraggingUnlocked,
      isoPlane,
      thickness,
      orbitProjection2D,
      wireframe3DStyle,
      showGrid,
      grid,
      activeLoftPreviewMesh,
      cursorOffsetMode,
      tool,
      touchInteractionState,
      activeTouchScreenPos,
      smartSnap,
      snapHit,
    ],
  );

  useLayoutEffect(() => {
    const activeThemeMode: "light" | "dark" | "amoled" = !isDark
      ? "light"
      : isAmoled
        ? "amoled"
        : "dark";
    render2DSceneForMode(activeThemeMode);
  }, [render2DSceneForMode, isDark, isAmoled, canvasBgColor, themeVersion]);

  const activeBridgeModeRef = useRef<"light" | "dark" | "amoled">(
    !isDark ? "light" : isAmoled ? "amoled" : "dark",
  );
  activeBridgeModeRef.current = !isDark ? "light" : isAmoled ? "amoled" : "dark";
  const render2DSceneForModeRef = useRef(render2DSceneForMode);
  render2DSceneForModeRef.current = render2DSceneForMode;

  useEffect(() => {
    return registerThemeBridge("chamfer-2d-canvas", {
      applyTheme: (nextTheme) => {
        activeBridgeModeRef.current = nextTheme;
      },
      renderNow: () => {
        render2DSceneForModeRef.current(activeBridgeModeRef.current);
      },
    });
  }, []);

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
    if (cadPhase < 2) return;
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
  }, [cadPhase, drawable, view, canvasSize, showArrows, showOrder, simOn, simSample, gesturing]);

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
      if (!e || !e.id || !selSet.has(e.id) || seen.has(e.id)) return false;
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
    if (!selection.length) {
      toast.info("Selecione entidades para copiar.");
      return;
    }
    const item = copyToGlobalClipboard(entities, selection, groups, dims);
    clipboardRef.current = copySelection(entities, selection, groups);
    setTool("select");
    triggerHaptic("action");
    if (item) {
      toast.success(`✓ "${item.title}" copiado para a Área de Transferência.`);
    } else if (clipboardRef.current) {
      toast.success(`${clipboardRef.current.entities.length} objeto(s) copiado(s).`);
    }
  }, [entities, selection, groups, dims]);

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
    setScaleDialogOpen(true);
  }, [selected.length]);

  const handleConfirmScale = useCallback(
    (factor: number, basePointType: ScaleBasePointType) => {
      if (!selected.length) {
        setScaleDialogOpen(false);
        return;
      }
      const box = boxOfEntities(selected);
      let basePoint: Vec2;
      switch (basePointType) {
        case "origin":
          basePoint = { x: 0, y: 0 };
          break;
        case "min":
          basePoint = { x: box.minX, y: box.minY };
          break;
        case "max":
          basePoint = { x: box.maxX, y: box.maxY };
          break;
        case "center":
        default:
          basePoint = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
          break;
      }

      commit((list) =>
        list.map((x) =>
          selection.includes(x.id) ? scaleEntityAroundPoint(x, basePoint, factor) : x,
        ),
      );
      triggerHaptic("action");
      toast.success(`Seleção escalada em ${factor.toFixed(2)}×.`);
      setScaleDialogOpen(false);
    },
    [selected, boxOfEntities, commit, selection, scaleEntityAroundPoint],
  );

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

  const handleGroupSelection = useCallback(() => {
    if (selection.length < 2) {
      toast.info("Selecione 2 ou mais entidades para agrupar (via seleção por janela ou Shift+Toque).");
      return;
    }
    const res = createGroup(entities, selection, groups);
    if (!res) return;
    commit(res.entities);
    setGroups(res.groups);
    setSelection(expandSelection(res.entities, selection));
    triggerHaptic("action");
    AudioManager.play("ui_select");
    toast.success("Peças agrupadas como uma unidade única.");
  }, [selection, entities, groups, commit]);

  const handleUngroupSelection = useCallback(() => {
    const targetGroups = new Set(
      selection.map((id) => entities.find((e) => e.id === id)?.group).filter(Boolean) as string[],
    );
    if (!targetGroups.size) {
      toast.info("Nenhuma peça agrupada na seleção atual.");
      return;
    }
    let nextEntities = entities;
    let nextGroups = groups;
    for (const gid of targetGroups) {
      const res = dissolveGroup(nextEntities, nextGroups, gid);
      nextEntities = res.entities;
      nextGroups = res.groups;
    }
    commit(nextEntities);
    setGroups(nextGroups);
    triggerHaptic("action");
    AudioManager.play("ui_select");
    toast.success("Peça desagrupada com sucesso.");
  }, [selection, entities, groups, commit]);

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

  /* CANTOS IDENTIFICADOS NA SELEÇÃO PARA FILETE E CHANFRO */
  const selectedCorners = useMemo(() => {
    if (!selected.length) return [];
    return findAllCornersInEntities(selected);
  }, [selected]);

  const handleApplyAllSelectionCorners = useCallback(() => {
    if (!selectedCorners.length) {
      toast.info("Nenhum canto detectado nas formas selecionadas.");
      return;
    }
    let currentEntities = [...entities];
    let appliedCount = 0;

    for (const c of selectedCorners) {
      if (tool === "fillet") {
        const res = applyFilletToCorner(c, filletR, currentEntities);
        if (res.success) {
          currentEntities = res.updatedEntities;
          appliedCount++;
        }
      } else if (tool === "chamfer") {
        const res = applyChamferToCorner(c, filletR, filletR, currentEntities);
        if (res.success) {
          currentEntities = res.updatedEntities;
          appliedCount++;
        }
      }
    }

    if (appliedCount > 0) {
      commit(currentEntities);
      triggerHaptic("action");
      toast.success(
        tool === "fillet"
          ? `Filete R${filletR} mm aplicado em ${appliedCount} cantos!`
          : `Chanfro ${filletR} mm aplicado em ${appliedCount} cantos!`,
      );
      setFilletPreview(null);
      setChamferPreview(null);
    } else {
      toast.info("Não foi possível concordar os cantos selecionados.");
    }
  }, [selectedCorners, entities, tool, filletR, commit]);

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
    {
      id: "fabrication_passport",
      title: "Passaporte da Peça e Tabela de Furações",
      keywords: ["passaporte", "fabricação", "peso", "massa", "furos", "tabela", "cnc", "bom"],
      category: "documento",
      description: "Gera especificações de corte, peso calculado e coordenadas dos furos para CNC.",
      icon: FileText,
      action: () => setFabricationPassportOpen(true),
    },
    {
      id: "iso_convert",
      title: "Projeção Isométrica (Converter Seleção)",
      keywords: ["isométrico", "isometrico", "iso", "3d", "2.5d", "converter", "perspectiva", "top", "left", "right", "projeção"],
      category: "modificar",
      description: "Transforma a seleção ativa do documento para perspectiva isométrica analítica nos planos Superior, Esquerdo ou Direito.",
      icon: BoxIcon,
      action: () => setIsoPieceBuilderOpen(true),
    },
    {
      id: "iso_toggle_mode",
      title: "Alternar Modo de Desenho Isométrico 2D",
      keywords: ["desenho isometrico", "grade isometrica", "isocírculo", "isocirculo", "orto iso", "eixos 30"],
      category: "criar",
      description: "Alterna a projeção do canvas para desenho isométrico 2D com eixos a 30°, 90° e 150°.",
      icon: BoxIcon,
      action: () => {
        const next = drawingProjection === "isometric" ? "orthographic" : "isometric";
        setDrawingProjection(next);
        if (next === "isometric") {
          toast.info(`Modo Isométrico 2D ativado (Plano ${ISO_PLANES[isoPlane].label} · F5 para alternar)`);
        } else {
          toast.info("Modo Ortogonal 2D ativado");
        }
      },
    },
  ], [isoPlane, drawingProjection]);

  const handlePasteClipboardItem = useCallback(
    (item: GlobalClipboardItem, targetPos?: Vec2 | null) => {
      const target =
        targetPos && Number.isFinite(targetPos.x) && Number.isFinite(targetPos.y)
          ? targetPos
          : {
              x: (canvasSize.w / 2 - view.tx) / view.k,
              y: (canvasSize.h / 2 - view.ty) / view.k,
            };

      const result = instantiateClipboardItemAt(item, target, groups);
      commit((list) => [...list, ...result.newEntities]);
      setGroups(result.newGroups);
      setSelection(result.newIds);
      triggerHaptic("action");
      toast.success(`✓ Colado: ${item.title}`);
    },
    [canvasSize, view, groups, commit],
  );

  const handleDirectDimUpdate = (newVal: number) => {
    if (!directDimEditor) return;
    const { dimId } = directDimEditor;
    const dim = dims.find((d) => d.id === dimId);
    if (!dim) return;

    const entRef = dim.refs.find((r) => r.kind === "entity");
    if (entRef && entRef.kind === "entity") {
      const entId = entRef.id;
      commit((prev) =>
        prev.map((e) => {
          if (e.id !== entId) return e;
          if (e.type === "circle") {
            const newR = dim.kind === "diameter" ? newVal / 2 : newVal;
            return {
              ...e,
              r: newR,
              params: {
                ...e.params,
                realRadius: newR,
                realDiameter: newR * 2,
              },
            };
          }
          if (e.type === "ellipse") {
            const newR = dim.kind === "diameter" ? newVal / 2 : newVal;
            return {
              ...e,
              rx: newR * ISO_SQRT_1_5,
              ry: newR * ISO_SQRT_0_5,
              params: {
                ...e.params,
                realRadius: newR,
                realDiameter: newR * 2,
              },
            };
          }
          if (e.type === "line") {
            const curLen = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
            const factor = newVal / curLen;
            return {
              ...e,
              x2: e.x1 + (e.x2 - e.x1) * factor,
              y2: e.y1 + (e.y2 - e.y1) * factor,
              params: {
                ...e.params,
                realLength: newVal,
              },
            };
          }
          return e;
        }),
      );
    } else {
      // Se a cota tem referências de ponto (ex: p0 e p1)
      const pt0 = dim.refs[0]?.kind === "point" ? dim.refs[0].p : null;
      const pt1 = dim.refs[1]?.kind === "point" ? dim.refs[1].p : null;
      if (pt0 && pt1) {
        commit((prev) =>
          prev.map((e) => {
            if (e.type === "line") {
              const d0 = Math.hypot(e.x1 - pt0.x, e.y1 - pt0.y);
              const d1 = Math.hypot(e.x2 - pt1.x, e.y2 - pt1.y);
              if (d0 < 1 && d1 < 1) {
                const curLen = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
                const factor = newVal / curLen;
                const newX2 = e.x1 + (e.x2 - e.x1) * factor;
                const newY2 = e.y1 + (e.y2 - e.y1) * factor;
                return { ...e, x2: newX2, y2: newY2 };
              }
            }
            return e;
          }),
        );
      }
    }

    setDims((prev) =>
      prev.map((d) => (d.id === dimId ? { ...d, label: `${newVal.toFixed(2)} mm` } : d)),
    );
    toast.success(`Cota atualizada para ${newVal.toFixed(2)} mm e geometria recalculada.`);
    setDirectDimEditor(null);
  };

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

    const caldDivs = tool === "caldeiraria_div" || tool === "divide" ? 12 : 0;

    // Se "Exibir Todos os Snaps da Peça" estiver ATIVO, gera todos os snaps de todas as entidades
    if (showAllSnaps) {
      const all: SmartReferencePoint[] = [];
      for (const ent of entities) {
        if (ent) all.push(...extractEntitySmartReferences(ent, activeStart ?? null, caldDivs, snapDivision));
      }
      all.push(...extractIntersections(entities));
      return all;
    }

    if (!isCreating && !isModifying) {
      if (!cursor) return [];
      const nearEnt = hitTest(cursor) ?? near(cursor, 30 / view.k)[0];
      if (nearEnt) return extractEntitySmartReferences(nearEnt, null, caldDivs, snapDivision);
      return [];
    }

    const refs: SmartReferencePoint[] = [];
    if (selection.length > 0) {
      for (const id of selection) {
        const ent = entities.find((e) => e && e.id === id);
        if (ent) refs.push(...extractEntitySmartReferences(ent, activeStart ?? null, caldDivs, snapDivision));
      }
    }

    const probe = activeStart ?? cursor;
    const consideredEntities: Entity[] = [];
    if (probe) {
      const nearby = near(probe, 80 / view.k);
      for (const item of nearby) {
        if (item) {
          consideredEntities.push(item);
          if (!selection.includes(item.id)) {
            refs.push(...extractEntitySmartReferences(item, activeStart ?? null, caldDivs, snapDivision));
          }
        }
      }
    }

    if (consideredEntities.length > 1) {
      refs.push(...extractIntersections(consideredEntities));
    }

    return refs.slice(0, 64);
  }, [snapOn, showAllSnaps, snapDivision, selection, tool, pending, cursor, view.k, entities, hitTest, near]);

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

  const arrayFrameAnimRafRef = useRef<number | null>(null);
  const lastFramedArrayBoxRef = useRef<{
    type: ArrayType | null;
    w: number;
    h: number;
    cx: number;
    cy: number;
  } | null>(null);

  const fitArrayAndHostToVisibleCanvas = useCallback(
    (
      seedEntities: Entity[],
      previewEntities: Entity[],
      polarCenter?: Vec2 | null,
      polarRadius?: number,
      hostBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null,
    ) => {
      const allToFrame: Entity[] = [
        ...entities,
        ...seedEntities,
        ...previewEntities,
      ];
      const baseBox = bbox(allToFrame);
      let minX = baseBox ? baseBox.minX : Infinity;
      let minY = baseBox ? baseBox.minY : Infinity;
      let maxX = baseBox ? baseBox.maxX : -Infinity;
      let maxY = baseBox ? baseBox.maxY : -Infinity;

      if (hostBounds) {
        minX = Math.min(minX, hostBounds.minX);
        minY = Math.min(minY, hostBounds.minY);
        maxX = Math.max(maxX, hostBounds.maxX);
        maxY = Math.max(maxY, hostBounds.maxY);
      }

      if (
        polarCenter &&
        Number.isFinite(polarCenter.x) &&
        Number.isFinite(polarCenter.y)
      ) {
        const r =
          typeof polarRadius === "number" && Number.isFinite(polarRadius) && polarRadius > 0
            ? polarRadius
            : 20;
        minX = Math.min(minX, polarCenter.x - r);
        minY = Math.min(minY, polarCenter.y - r);
        maxX = Math.max(maxX, polarCenter.x + r);
        maxY = Math.max(maxY, polarCenter.y + r);
      }

      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)
      ) {
        return;
      }

      const el = canvasViewportRef.current ?? svgRef.current;
      const rect = el?.getBoundingClientRect();
      const screenW = typeof window !== "undefined" ? window.innerWidth : 1024;
      const leftBarW = rect ? Math.max(0, rect.left) : 64;
      const panelEl =
        typeof document !== "undefined"
          ? document.getElementById("chamfer-array-right-panel")
          : null;
      const rightPanelW = panelEl
        ? panelEl.getBoundingClientRect().width
        : screenW >= 640
          ? 310
          : 285;

      // X_centro_útil = W_barra_esquerda + (W_tela - W_barra_esquerda - W_painel_direito) / 2
      const usableW = Math.max(140, screenW - leftBarW - rightPanelW);
      const usableH = Math.max(
        120,
        rect?.height || canvasSize.h || (typeof window !== "undefined" ? window.innerHeight - 96 : 500),
      );
      const localCenterX = usableW / 2;
      const localCenterY = usableH / 2;

      const geomW = Math.max(maxX - minX, 15);
      const geomH = Math.max(maxY - minY, 15);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      // 20% de margem de respiro ao redor (fator útil = 0.78)
      const rawK = Math.min((usableW * 0.78) / geomW, (usableH * 0.78) / geomH);
      const targetK = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rawK));
      const targetTx = localCenterX - cx * targetK;
      const targetTy = localCenterY - cy * targetK;

      if (
        !Number.isFinite(targetK) ||
        !Number.isFinite(targetTx) ||
        !Number.isFinite(targetTy)
      ) {
        return;
      }

      if (arrayFrameAnimRafRef.current !== null) {
        cancelAnimationFrame(arrayFrameAnimRafRef.current);
        arrayFrameAnimRafRef.current = null;
      }

      const startView = viewRef.current ?? { k: 1, tx: 0, ty: 0 };
      const startTime = performance.now();
      const durationMs = 300;

      // Aproximação precisa de cubic-bezier(0.22, 1, 0.36, 1)
      const easeOutCubicBezier = (t: number) => 1 - Math.pow(1 - t, 3.2);

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));
        const eased = easeOutCubicBezier(progress);

        const nextView = {
          k: startView.k + (targetK - startView.k) * eased,
          tx: startView.tx + (targetTx - startView.tx) * eased,
          ty: startView.ty + (targetTy - startView.ty) * eased,
        };
        viewRef.current = nextView;
        setView(nextView);

        if (progress < 1) {
          arrayFrameAnimRafRef.current = requestAnimationFrame(step);
        } else {
          arrayFrameAnimRafRef.current = null;
        }
      };

      arrayFrameAnimRafRef.current = requestAnimationFrame(step);
    },
    [entities, canvasSize.h],
  );

  const applyArraySmartFraming = useCallback(
    (targetEntities: Entity[], pivotCenter?: Vec2 | null) => {
      fitArrayAndHostToVisibleCanvas(
        targetEntities,
        [],
        pivotCenter,
        pivotCenter && targetEntities.length > 0
          ? dist(pivotCenter, getGroupCenter(targetEntities))
          : undefined,
        arrayHostInfo.sheetBounds,
      );
    },
    [fitArrayAndHostToVisibleCanvas, arrayHostInfo.sheetBounds],
  );

  const initializeArrayFromEntities = useCallback(
    (targetEntities: Entity[], preferredType?: ArrayType, existingGroupId?: string | null) => {
      const hostContextEntities = existingGroupId
        ? entities.filter(
            (e) => !(e.params?.arrayGroupId === existingGroupId && e.params?.isArrayInstance),
          )
        : entities;
      const host = detectHostPart(
        hostContextEntities,
        targetEntities,
        temporaryOrigin?.p ?? { x: 0, y: 0 },
      );
      setArrayHostInfo(host);

      const baseCenter = getGroupCenter(targetEntities);
      const chosenCenter =
        host.center ??
        (temporaryOrigin ? temporaryOrigin.p : { x: baseCenter.x - 50, y: baseCenter.y });
      const radius = dist(chosenCenter, baseCenter);
      const startAngleDeg =
        Math.atan2(baseCenter.y - chosenCenter.y, baseCenter.x - chosenCenter.x) * (180 / Math.PI);

      setArrayPolarParams((prev) => ({
        ...prev,
        center: chosenCenter,
        radius,
        startAngleDeg,
        count: prev.count || 6,
        skippedIndices: [],
      }));

      if (host.sheetBounds) {
        const stepX = Math.min(60, Math.max(20, Math.round(host.sheetBounds.width / 5)));
        const stepY = Math.min(60, Math.max(20, Math.round(host.sheetBounds.height / 5)));
        setArrayLinearParams((prev) => ({
          ...prev,
          dx: prev.dx || stepX,
          dy: prev.dy || stepY,
          spanX: Math.max(40, Math.round(host.sheetBounds!.width * 0.7)),
          spanY: Math.max(40, Math.round(host.sheetBounds!.height * 0.7)),
          skippedIndices: [],
        }));
      } else {
        setArrayLinearParams((prev) => ({
          ...prev,
          skippedIndices: [],
        }));
      }

      if (preferredType) {
        setActiveArrayType(preferredType);
      } else {
        setActiveArrayType(host.suggestedType);
      }
      lastFramedArrayBoxRef.current = null;
      applyArraySmartFraming(targetEntities, chosenCenter);
    },
    [entities, temporaryOrigin, applyArraySmartFraming],
  );

  const handleStartArray = useCallback(
    (type: ArrayType) => {
      setEditingArrayGroupId(null);
      setIsArrayPickingCenter(false);
      lastFramedArrayBoxRef.current = null;
      if (!selected.length) {
        toast.info("Toque no furo ou geometria que deseja multiplicar.");
        setActiveArrayType(type);
        fitArrayAndHostToVisibleCanvas([], []);
        return;
      }

      // Se a entidade selecionada já pertence a um Array associativo, abre diretamente em modo de reedição
      const existing = getEntityArraySpec(selected[0]);
      if (existing) {
        const { arrayGroupId, spec } = existing;
        const seedEntities = entities.filter(
          (e) => e.params?.arrayGroupId === arrayGroupId && !e.params?.isArrayInstance,
        );
        const targetSeeds = seedEntities.length > 0 ? seedEntities : [selected[0]!];
        setSelection(targetSeeds.map((e) => e.id));
        setEditingArrayGroupId(arrayGroupId);
        const hostContextEntities = entities.filter(
          (e) => !(e.params?.arrayGroupId === arrayGroupId && e.params?.isArrayInstance),
        );
        const host = detectHostPart(
          hostContextEntities,
          targetSeeds,
          temporaryOrigin?.p ?? { x: 0, y: 0 },
        );
        setArrayHostInfo(host);
        if (spec.polar) setArrayPolarParams(spec.polar);
        if (spec.linear) setArrayLinearParams(spec.linear);
        setActiveArrayType(type);
        applyArraySmartFraming(targetSeeds, spec.polar?.center ?? host.center);
        triggerHaptic("selection");
        return;
      }

      initializeArrayFromEntities(selected, type, null);
      triggerHaptic("selection");
    },
    [selected, entities, temporaryOrigin, initializeArrayFromEntities, applyArraySmartFraming, fitArrayAndHostToVisibleCanvas],
  );

  const handleEditExistingArray = useCallback(
    (targetEntity: Entity) => {
      const existing = getEntityArraySpec(targetEntity);
      if (!existing) return;
      const { arrayGroupId, spec } = existing;
      const seedEntities = entities.filter(
        (e) => e.params?.arrayGroupId === arrayGroupId && !e.params?.isArrayInstance,
      );
      const targetSeeds = seedEntities.length > 0 ? seedEntities : [targetEntity];
      setSelection(targetSeeds.map((e) => e.id));
      setEditingArrayGroupId(arrayGroupId);
      setIsArrayPickingCenter(false);
      lastFramedArrayBoxRef.current = null;

      const hostContextEntities = entities.filter(
        (e) => !(e.params?.arrayGroupId === arrayGroupId && e.params?.isArrayInstance),
      );
      const host = detectHostPart(
        hostContextEntities,
        targetSeeds,
        temporaryOrigin?.p ?? { x: 0, y: 0 },
      );
      setArrayHostInfo(host);
      if (spec.polar) setArrayPolarParams(spec.polar);
      if (spec.linear) setArrayLinearParams(spec.linear);
      setActiveArrayType(spec.type);
      applyArraySmartFraming(targetSeeds, spec.polar?.center ?? host.center);
      triggerHaptic("selection");
      toast.info("Editando padrão existente em tempo real.");
    },
    [entities, temporaryOrigin, applyArraySmartFraming],
  );

  const handleArrayLinear = useCallback(() => {
    handleStartArray("linear");
  }, [handleStartArray]);

  const handleArrayPolar = useCallback(() => {
    handleStartArray("polar");
  }, [handleStartArray]);

  const arraySourceAssembly = useMemo(() => {
    if (!activeArrayType || selected.length === 0) return selected;
    const includeAssembly =
      activeArrayType === "polar"
        ? arrayPolarParams.includeAssembly !== false
        : arrayLinearParams.includeAssembly !== false;
    if (!includeAssembly) return selected;
    return findEnclosedAndConnectedAssembly(entities, selected);
  }, [activeArrayType, selected, entities, arrayPolarParams.includeAssembly, arrayLinearParams.includeAssembly]);

  const arrayPreview = useMemo(() => {
    if (!activeArrayType || arraySourceAssembly.length === 0) return null;
    const spec: ArraySpec = {
      id: editingArrayGroupId ?? "preview-spec",
      type: activeArrayType,
      sourceEntityIds: arraySourceAssembly.map((e) => e.id),
      polar: activeArrayType === "polar" ? arrayPolarParams : undefined,
      linear: activeArrayType === "linear" ? arrayLinearParams : undefined,
    };
    return computeInstances(spec, arraySourceAssembly, arrayHostInfo);
  }, [activeArrayType, editingArrayGroupId, arraySourceAssembly, arrayPolarParams, arrayLinearParams, arrayHostInfo]);

  // Auto-Frame on Open e quando as dimensões do Array mudarem significativamente
  useEffect(() => {
    if (!activeArrayType) {
      lastFramedArrayBoxRef.current = null;
      return;
    }
    if (isDraggingArrayCenterRef.current) return;

    const previewEnts = arrayPreview ? arrayPreview.ghostSlots.flatMap((s) => s.entities) : [];
    const combinedBox = bbox([...entities, ...arraySourceAssembly, ...previewEnts]);
    if (!combinedBox) return;

    const w = Math.max(10, combinedBox.maxX - combinedBox.minX);
    const h = Math.max(10, combinedBox.maxY - combinedBox.minY);
    const cx = (combinedBox.minX + combinedBox.maxX) / 2;
    const cy = (combinedBox.minY + combinedBox.maxY) / 2;

    const prev = lastFramedArrayBoxRef.current;
    const shouldReFrame =
      !prev ||
      prev.type !== activeArrayType ||
      Math.abs(w - prev.w) / prev.w > 0.16 ||
      Math.abs(h - prev.h) / prev.h > 0.16 ||
      Math.hypot(cx - prev.cx, cy - prev.cy) > Math.max(w, h) * 0.15;

    if (shouldReFrame) {
      lastFramedArrayBoxRef.current = { type: activeArrayType, w, h, cx, cy };
      fitArrayAndHostToVisibleCanvas(
        arraySourceAssembly,
        previewEnts,
        activeArrayType === "polar" ? arrayPolarParams.center : null,
        activeArrayType === "polar" ? arrayPolarParams.radius : undefined,
        arrayHostInfo.sheetBounds,
      );
    }
  }, [
    activeArrayType,
    arrayPreview,
    entities,
    arraySourceAssembly,
    arrayPolarParams.center,
    arrayPolarParams.radius,
    arrayHostInfo.sheetBounds,
    fitArrayAndHostToVisibleCanvas,
  ]);

  const arrayValidation = useMemo(() => {
    if (!activeArrayType || arraySourceAssembly.length === 0) {
      return {
        isValid: true,
        errors: [],
        warnings: [],
        slotDiagnostics: {},
        collidingCount: 0,
        activeCopiesCount: 0,
        skippedCount: 0,
        totalPositionsCount: 0,
      };
    }
    const spec: ArraySpec = {
      id: editingArrayGroupId ?? "validation-spec",
      type: activeArrayType,
      sourceEntityIds: arraySourceAssembly.map((e) => e.id),
      polar: activeArrayType === "polar" ? arrayPolarParams : undefined,
      linear: activeArrayType === "linear" ? arrayLinearParams : undefined,
    };
    return validateArray(spec, arraySourceAssembly, arrayHostInfo);
  }, [activeArrayType, editingArrayGroupId, arraySourceAssembly, arrayPolarParams, arrayLinearParams, arrayHostInfo]);

  const handleCommitArray = useCallback(() => {
    if (!activeArrayType || arraySourceAssembly.length === 0) return;
    const specId = editingArrayGroupId ?? uid();
    const spec: ArraySpec = {
      id: specId,
      type: activeArrayType,
      sourceEntityIds: arraySourceAssembly.map((e) => e.id),
      polar: activeArrayType === "polar" ? arrayPolarParams : undefined,
      linear: activeArrayType === "linear" ? arrayLinearParams : undefined,
    };
    const { instances, repositionedOriginals } = computeInstances(spec, arraySourceAssembly, arrayHostInfo);
    if (instances.length === 0 && !repositionedOriginals) {
      toast.info("Nenhuma cópia gerada.");
      return;
    }

    const selectedIdSet = new Set(arraySourceAssembly.map((e) => e.id));
    const repoMap = new Map<string, Entity>();
    if (repositionedOriginals) {
      for (const ro of repositionedOriginals) {
        repoMap.set(ro.id, ro);
      }
    }

    const shouldAutoTrim =
      activeArrayType === "polar" ? Boolean(arrayPolarParams.autoTrim) : Boolean(arrayLinearParams.autoTrim);

    let trimmedCount = 0;
    commit((prev) => {
      // Se estiver reeditando um Array associativo, substitui as cópias anteriores daquele grupo
      const cleaned = editingArrayGroupId
        ? prev.filter(
            (e) => !(e.params?.arrayGroupId === editingArrayGroupId && e.params?.isArrayInstance),
          )
        : prev;

      const updatedOriginals = cleaned.map((e) => {
        if (!selectedIdSet.has(e.id)) return e;
        const baseEnt = repoMap.get(e.id) ?? e;
        return {
          ...baseEnt,
          params: {
            ...(baseEnt.params ?? {}),
            arrayGroupId: specId,
            isArrayInstance: false,
            arrayIndex: 0,
            arraySpec: spec,
          },
        };
      });

      if (shouldAutoTrim) {
        const res = applyArrayAutoTrim(updatedOriginals, instances, arraySourceAssembly);
        trimmedCount = res.trimmedCount;
        return res.entities;
      }

      return [...updatedOriginals, ...instances];
    });

    setActiveArrayType(null);
    setEditingArrayGroupId(null);
    setIsArrayPickingCenter(false);
    isDraggingArrayCenterRef.current = false;
    setSelection([...arraySourceAssembly.map((e) => e.id), ...instances.map((e) => e.id)]);
    triggerHaptic("success");
    AudioManager.play("ui_select");
    toast.success(
      shouldAutoTrim && trimmedCount > 0
        ? `Array aplicado com Auto-Trim (${trimmedCount} interseções aparadas no contorno).`
        : activeArrayType === "polar"
          ? `Padrão circular aplicado (+${instances.length} cópias, PCD ${((arrayPolarParams.radius ?? 0) * 2).toFixed(1)} mm).`
          : `Padrão linear aplicado (+${instances.length} cópias).`,
    );
  }, [activeArrayType, editingArrayGroupId, arraySourceAssembly, arrayPolarParams, arrayLinearParams, arrayHostInfo, commit]);

  const handleCancelArray = useCallback(() => {
    setActiveArrayType(null);
    setEditingArrayGroupId(null);
    setIsArrayPickingCenter(false);
    isDraggingArrayCenterRef.current = false;
    triggerHaptic("tap");
    notify({
      tipo: "informacao",
      titulo: "Padrão cancelado",
      mensagem: "Nenhuma alteração foi gravada.",
    });
  }, []);

  const handleConvertToBend = useCallback(() => {
    if (!selected.length) {
      toast.info("Selecione uma linha para converter em dobra.");
      return;
    }
    commit((e) => e.map((x) => (selection.includes(x.id) ? { ...x, layer: "dobra" } : x)));
    toast.success("Linha(s) convertida(s) em linha de dobra.");
  }, [selected.length, selection, commit]);

  const handleAddHole = useCallback(
    (diameterMm = 10) => {
      const b = selected.length
        ? boxOfEntities(selected)
        : { minX: cursor.x - 5, maxX: cursor.x + 5, minY: cursor.y - 5, maxY: cursor.y + 5 };
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const hole = createIndustrialHoleEntity({
        cx,
        cy,
        diameterMm,
        layer: "corte",
        strokeColor: activeStrokeColorRef.current,
      });
      commit((e) => [...e, hole]);
      setSelection([hole.id]);
      setMobileEditorOpenManual(false);
      toast.success(`Furo industrial Ø${diameterMm}mm adicionado em (${cx.toFixed(1)}, ${cy.toFixed(1)}) mm.`);
    },
    [boxOfEntities, selected, cursor.x, cursor.y, commit],
  );

  const handleAddThread = useCallback(
    (nominalDiaMm: number, pitchMm: number) => {
      const b = selected.length
        ? boxOfEntities(selected)
        : { minX: cursor.x - 5, maxX: cursor.x + 5, minY: cursor.y - 5, maxY: cursor.y + 5 };
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const threadEnts = createThreadedHoleEntities({
        cx,
        cy,
        nominalM: nominalDiaMm,
        pitchMm,
        strokeColor: activeStrokeColorRef.current,
      });
      commit((e) => [...e, ...threadEnts]);
      setSelection(threadEnts.map((x) => x.id));
      setMobileEditorOpenManual(false);
      toast.success(
        `Rosca métrica M${nominalDiaMm}×${pitchMm} (furo Ø${Math.max(1, nominalDiaMm - pitchMm).toFixed(1)}mm) inserida.`,
      );
    },
    [boxOfEntities, selected, cursor.x, cursor.y, commit],
  );

  const handleAddEyelet = useCallback(
    (outerDiaMm: number, innerDiaMm: number) => {
      const b = selected.length
        ? boxOfEntities(selected)
        : { minX: cursor.x - 5, maxX: cursor.x + 5, minY: cursor.y - 5, maxY: cursor.y + 5 };
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const eyeletEnts = createConcentricEyeletEntities({
        cx,
        cy,
        outerDiameterMm: outerDiaMm,
        innerDiameterMm: innerDiaMm,
        layer: activeLayer,
        strokeColor: activeStrokeColorRef.current,
      });
      commit((e) => [...e, ...eyeletEnts]);
      setSelection(eyeletEnts.map((x) => x.id));
      toast.success(`Olhal concêntrico Ø${outerDiaMm}/Ø${innerDiaMm} mm inserido.`);
    },
    [boxOfEntities, selected, cursor.x, cursor.y, activeLayer, commit],
  );

  const handleAddTangentBridge = useCallback(() => {
    const bridgeEnts = createTangentBridgeEntities({
      selectedEntities: selected.length >= 2 ? selected : entities,
      fallbackCx: cursor.x,
      fallbackCy: cursor.y,
      layer: activeLayer,
      strokeColor: activeStrokeColorRef.current,
    });
    commit((e) => [...e, ...bridgeEnts]);
    setSelection(bridgeEnts.map((x) => x.id));
    toast.success("Ponte tangente (TTR) gerada.");
  }, [selected, entities, activeLayer, cursor.x, cursor.y, commit]);

  const handleAddSerratedTeeth = useCallback(
    (toothHeightMm: number, toothPitchMm: number) => {
      const targetLine = selected.find(
        (e): e is Extract<Entity, { type: "line" }> => e.type === "line",
      );
      const startX = targetLine ? targetLine.x1 : cursor.x - 40;
      const startY = targetLine ? targetLine.y1 : cursor.y;
      const totalSpan = targetLine
        ? Math.max(10, Math.hypot(targetLine.x2 - targetLine.x1, targetLine.y2 - targetLine.y1))
        : 80;
      const toothCount = Math.max(3, Math.round(totalSpan / Math.max(1, toothPitchMm)));
      const teethEnt = createSerratedTeethEntities({
        startX,
        startY,
        toothCount,
        pitchMm: toothPitchMm,
        toothHeightMm,
        layer: activeLayer,
        strokeColor: activeStrokeColorRef.current,
      });
      commit((e) => [
        ...(targetLine ? e.filter((x) => x.id !== targetLine.id) : e),
        teethEnt,
      ]);
      setSelection([teethEnt.id]);
      toast.success(`Perfil serrilhado (${toothCount} dentes · passo ${toothPitchMm}mm × h ${toothHeightMm}mm) gerado.`);
    },
    [selected, cursor.x, cursor.y, activeLayer, commit],
  );

  const handleAddPocket2D = useCallback(
    (widthMm: number, heightMm: number, cornerRadiusMm: number) => {
      const b = selected.length
        ? boxOfEntities(selected)
        : { minX: cursor.x - 5, maxX: cursor.x + 5, minY: cursor.y - 5, maxY: cursor.y + 5 };
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const pocket = createPocket2DEntity({
        cx,
        cy,
        widthMm,
        heightMm,
        cornerRadiusMm,
        layer: "recorte",
        strokeColor: activeStrokeColorRef.current,
      });
      commit((e) => [...e, pocket]);
      setSelection([pocket.id]);
      toast.success(`Cavidade 2D ${widthMm}×${heightMm}mm (R${cornerRadiusMm}) inserida.`);
    },
    [boxOfEntities, selected, cursor.x, cursor.y, commit],
  );

  const handleSelectColorAndLayer = useCallback(
    (opt: ChamferTechnicalColorOption) => {
      setActiveLayer(opt.layer);
      setActiveStrokeColor(opt.hex);
      activeStrokeColorRef.current = opt.hex;
      if (selection.length > 0) {
        commit((list) => applyColorAndLayerToEntities(list, selection, opt));
        toast.success(
          `Cor "${opt.label}" (${opt.hex}) e camada [${opt.layer.toUpperCase()}] aplicadas a ${selection.length} peça(s).`,
        );
      } else {
        toast.success(
          `Cor ativa: ${opt.label} (${opt.hex}) • Camada: ${opt.layer.toUpperCase()}`,
        );
      }
    },
    [selection, commit],
  );

  const handleDeleteSelection = useCallback(() => {
    if (!selection.length) {
      toast.info("Selecione uma ou mais entidades para apagar.");
      return;
    }
    const count = selection.length;
    commit((list) => list.filter((x) => !selection.includes(x.id)));
    setSelection([]);
    triggerHaptic("action");
    toast.success(`${count} entidade(s) removida(s).`);
  }, [selection, commit]);

  const handleUseSelectedEdge = useCallback(() => {
    const sourceEntities =
      selection.length > 0 ? entities.filter((e) => selection.includes(e.id)) : entities;
    const edges = GeometricReferenceEngine.extractEdges(sourceEntities);
    if (edges.length > 0) {
      const bestEdge =
        GeometricReferenceEngine.findNearestEdge(cursor, edges, 1000)?.edge ?? edges[0]!;
      setActiveEdge(bestEdge);
      triggerHaptic("action");
      toast.success(`✓ Borda de referência ativa: ${bestEdge.label} (${bestEdge.length.toFixed(1)} mm)`);
    } else {
      toast.info("Nenhuma borda linear encontrada. Desenhe ou selecione uma peça com aresta reta.");
    }
  }, [selection, entities, cursor]);

  const handlePlanificar = useCallback(() => {
    transitionTo3D("3d");
    setViewMode3D("planificada");
    toast.info("Visualização Planificada (Flat Pattern) ativada.");
  }, [transitionTo3D]);

  const handleOpenFlanges = useCallback(() => {
    transitionTo3D("flanges");
  }, [transitionTo3D]);

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
    transitionTo3D("3d");
    setViewMode3D("planificada");
    toast.success("Desdobramento analítico ativado.");
  }, [transitionTo3D]);

  const handleFold = useCallback(() => {
    transitionTo3D("3d");
    setViewMode3D("isometrica");
    toast.success("Conformação 3D dobrada a 100%.");
  }, [transitionTo3D]);

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
      if (tool === "spline") {
        if (pending.length >= 2) {
          const spl = buildSmoothSpline128(pending, close, activeLayer);
          commit((p) => [...p, spl]);
          setSelection([]);
          setMobileEditorOpenManual(false);
        }
        setPending([]);
        setDraft(null);
        polylineSegModesRef.current = [];
        return;
      }

      const hasArcSegs = polylineSegModesRef.current.some((m) => m === "tangent_arc");
      if (hasArcSegs && pending.length >= 2) {
        const comp = buildCompositePolyline(pending, polylineSegModesRef.current, close, activeLayer);
        commit((p) => [...p, comp]);
        setSelection([]);
        setMobileEditorOpenManual(false);
      } else {
        const points = finishPolylinePoints(pending, close);
        if (points.length > 1) {
          const polyId = uid();
          commit((p) => [
            ...p,
            { id: polyId, layer: activeLayer, type: "polyline", pts: points, closed: close },
          ]);
          setSelection([]);
          setMobileEditorOpenManual(false);
        }
      }
      setPending([]);
      setDraft(null);
      polylineSegModesRef.current = [];
    },
    [pending, activeLayer, commit, tool],
  );

  const handleOverkillClean = useCallback(() => {
    const { cleanedEntities, removedCount } = cleanOverkillGeometry(entities);
    if (removedCount > 0) {
      commit(cleanedEntities);
      triggerHaptic("success");
      toast.success(`Overkill: ${removedCount} entidade(s) duplicada(s)/nula(s) removida(s).`);
    } else {
      toast.info("Overkill: nenhuma geometria duplicada ou nula encontrada.");
    }
  }, [entities, commit]);

  const handleBoolean2D = useCallback(
    (op: "union" | "subtract" | "intersect") => {
      const res = runBoolean2DOnSelection(entities, selection, op);
      if (!res) {
        toast.info("Selecione pelo menos 2 perfis fechados para operação booleana 2D.");
        return;
      }
      commit(res.updatedEntities);
      setSelection(res.newSelectedIds);
      triggerHaptic("success");
      toast.success(res.message);
    },
    [entities, selection, commit],
  );

  const handleCreateHatch = useCallback(() => {
    const targetEnts = selected.length > 0 ? selected : entities;
    const { hatchEntities, profileCount } = createValidatedTechnicalHatch(
      targetEnts,
      "ansi31",
      45,
      1,
      "marcacao",
    );
    if (profileCount === 0) {
      toast.info("Nenhum Perfil Fechado Válido encontrado na seleção para hachurar.");
      return;
    }
    commit((prev) => [...prev, ...hatchEntities]);
    triggerHaptic("success");
    toast.success(`Hachura técnica aplicada em ${profileCount} perfil(is) fechado(s) com detecção de ilhas.`);
  }, [selected, entities, commit]);

  const cancelOrFinalizeEntityDrag = useCallback(() => {
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (!dragEntityRef.current) return;
    const drag = dragEntityRef.current;
    const wasMoved = drag.moved;
    const baseSnapshot = drag.initialEntitiesSnapshot;
    const finalDelta = drag.effectiveDelta;
    const ids = drag.ids;
    dragEntityRef.current = null;
    isDraggingEntityRef.current = false;
    pendingDragEntitiesRef.current = null;

    if (wasMoved && Math.hypot(finalDelta.x, finalDelta.y) > 0.01) {
      past.current = [...past.current.slice(-49), baseSnapshot];
      future.current = [];
      setHistoryState({ canUndo: true, canRedo: false });
      const finalEntities = baseSnapshot.map((e) => {
        if (!ids.includes(e.id)) return e;
        const translated = translate(e, finalDelta.x, finalDelta.y);
        if (translated.params?.canonical2D && typeof translated.params.canonical2D === "object") {
          const entPlane = (translated.params.isoPlane as IsoPlane) || isoPlane;
          const canDelta = unprojectPointFromIsoPlane(
            { x: finalDelta.x, y: finalDelta.y },
            entPlane,
            { x: 0, y: 0 },
          );
          const origCan =
            (baseSnapshot.find((orig) => orig.id === e.id)?.params?.canonical2D as Entity) ??
            translated.params.canonical2D;
          translated.params = {
            ...translated.params,
            canonical2D: translate(origCan, canDelta.x, canDelta.y),
          };
        }
        return translated;
      });
      setEntities(revalidateShared(finalEntities));
    }
  }, [isoPlane]);

  const abortForMultiTouchGesture = useCallback(() => {
    isMultiTouchGestureRef.current = true;
    touchInteractionStateRef.current = "MULTITOUCH_NAVIGATION";
    setTouchInteractionState("MULTITOUCH_NAVIGATION");
    setLoupeVisible(false);
    setIsDraggingUnlocked(false);
    setDragNode(null);
    setTouchOffsetActive(false);
    setTouchWorldPos(null);
    activeTouchScreenPosRef.current = null;
    setActiveTouchScreenPos(null);

    // Descarta instantaneamente qualquer prévia ou confirmação pendente do Marco Geométrico
    previewGeometricMarkCandidateRef.current = null;
    setPreviewGeometricMarkCandidate(null);
    setPendingGeometricMarkConfirmation(null);

    if (pointerMoveRafRef.current !== null) {
      cancelAnimationFrame(pointerMoveRafRef.current);
      pointerMoveRafRef.current = null;
    }
    pendingPointerMoveRef.current = null;

    if (dragLongPressRef.current) {
      clearTimeout(dragLongPressRef.current.timer);
      dragLongPressRef.current = null;
    }
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }

    if (dragEntityRef.current) {
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      setEntities(dragEntityRef.current.initialEntitiesSnapshot);
      dragEntityRef.current = null;
      isDraggingEntityRef.current = false;
      pendingDragEntitiesRef.current = null;
    }

    if (preGestureSnapshotRef.current) {
      const snap = preGestureSnapshotRef.current;
      cursorRef.current = snap.cursor;
      setCursor(snap.cursor);
      setTemporaryOrigin(snap.temporaryOrigin);
      setPending(snap.pending);
      setDraft(snap.draft);
      setSelection(snap.selection);
    } else {
      setDraft(null);
      setPending([]);
    }

    setMarquee(null);
    swipeTrimFenceRef.current = [];
    setSwipeTrimCutPreview([]);
    setOverlappingCandidates([]);

    const now = performance.now();
    gestureCooldownUntilRef.current = Math.max(gestureCooldownUntilRef.current, now + 150);
    dragCooldownUntilRef.current = Math.max(dragCooldownUntilRef.current, now + 200);
    gestureUntilRef.current = Math.max(gestureUntilRef.current, now + 200);
  }, []);

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    ptrsRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // 1. BLINDAGEM GLOBAL DE GESTOS MULTITOQUE: 2 ou mais dedos bloqueiam e abortam imediatamente qualquer ferramenta
    if (ptrsRef.current.size >= 2) {
      abortForMultiTouchGesture();

      const [a, b] = [...ptrsRef.current.values()];
      if (a && b) {
        pinchRef.current = {
          dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        };
        panRef.current = null;
        orbitDragRef.current = null;
      }
      return;
    }

    // 2. Trava pós-gesto (Gesture Cooldown >= 120ms): ignora qualquer toque fantasma durante ou logo após pinça/zoom
    if (
      isMultiTouchGestureRef.current ||
      touchInteractionStateRef.current === "MULTITOUCH_NAVIGATION" ||
      touchInteractionStateRef.current === "POST_GESTURE_COOLDOWN" ||
      performance.now() <
        Math.max(
          gestureCooldownUntilRef.current,
          gestureUntilRef.current,
          dragCooldownUntilRef.current,
        )
    ) {
      return;
    }

    // Salva snapshot estável no início da interação com 1 ponteiro (para restaurar se o 2º dedo tocar)
    preGestureSnapshotRef.current = {
      cursor: { ...cursor },
      temporaryOrigin: temporaryOrigin ? { ...temporaryOrigin, p: { ...temporaryOrigin.p } } : null,
      pending: pending.map((pt) => ({ ...pt })),
      draft: draftRef.current ? { ...draftRef.current } : null,
      selection: [...selection],
    };
    pointerDownClientRef.current = { x: ev.clientX, y: ev.clientY };
    wasCameraPannedRef.current = false;
    touchInteractionStateRef.current = "SINGLE_POINTER";
    setTouchInteractionState("SINGLE_POINTER");

    // Se o modo ÓRBITA 3D estiver ativo na barra superior, 1 dedo / botão esquerdo rotaciona a órbita
    // (impedindo seleção acidental ou traçado de linhas durante a rotação 3D)
    if (isOrbitToolActive && ptrsRef.current.size === 1 && ev.button !== 1) {
      setLoupeVisible(false);
      setTouchOffsetActive(false);
      setTouchWorldPos(null);
      activeTouchScreenPosRef.current = null;
      setActiveTouchScreenPos(null);
      orbitStartClientRef.current = {
        x: ev.clientX,
        y: ev.clientY,
        time: performance.now(),
      };
      orbitDragRef.current = { x: ev.clientX, y: ev.clientY };
      return;
    }

    const pType = ev.pointerType || "mouse";
    lastPointerTypeRef.current = pType;
    setActivePointerType(pType);

    const touchCanvasPt = getTouchCanvasScreenPos(ev);
    const raw = toWorld(ev);
    const directTouchWorld = toWorld(ev, true);
    let p = snapPoint(raw);

    if (isSettingReferencePoint) {
      setTemporaryOrigin({
        id: "ref_origin",
        p,
        label: "REF 0,0",
        sourceEntityId: undefined,
      });
      setIsSettingReferencePoint(false);
      if (interactionGuideMode === "off") {
        setInteractionGuideModeState("purple_ref");
        saveInteractionGuideMode("purple_ref");
      }
      const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
      const displacedCursor: Vec2 = {
        x: Number((p.x + 100 / safeK).toFixed(2)),
        y: Number((p.y - 70 / safeK).toFixed(2)),
      };
      cursorRef.current = displacedCursor;
      setCursor(displacedCursor);
      triggerHaptic("action");
      toast.success(`Ponto de Referência fixado: (${p.x.toFixed(2)}, ${p.y.toFixed(2)} mm)`);
      return;
    }

    // Aplica restrições dimensionais reais se houver medidas fixas ativas
    const constraintBase =
      interactionGuideMode === "blue_line"
        ? pending.length > 0
          ? pending[pending.length - 1]!
          : temporaryOrigin?.p ?? null
        : interactionGuideMode === "purple_ref" && temporaryOrigin
          ? temporaryOrigin.p
          : null;
    if (constraintBase) {
      p = applyDimensionalConstraintsToPoint(constraintBase, p, lockedConstraints);
    }
    setCursor(p);

    // Se houver uma forma em estado Pré-Confirmação Editável (Draft Pending):
    // 1. Tocar em um de seus grips permite arrastar e ajustar a forma ao vivo
    // 2. Iniciar novo arrasto em área vazia confirma automaticamente a forma anterior (Fluxo Contínuo)
    if (pendingDraftShapeRef.current) {
      const grips = getPendingDraftShapeGrips(pendingDraftShapeRef.current);
      const safeK = Math.max(0.05, view.k);
      const gripTol = 18 / safeK;
      const hitGrip = grips.find((g) => Math.hypot(g.p.x - raw.x, g.p.y - raw.y) <= gripTol);
      if (hitGrip) {
        setDraggingDraftGripIndex(hitGrip.index);
        triggerHaptic("selection");
        return;
      }
      commitPendingDraftShape(pendingDraftShapeRef.current);
    }

    const useOffsetHere =
      cursorOffsetMode === "offset" &&
      tool !== "pan" &&
      (pType === "touch" ||
        shouldUseTouchOffset(
          pType,
          tool,
          dragNode !== null,
          isDraggingEntityRef.current || !!dragEntityRef.current?.unlocked,
          cursorOffsetMode,
          selection.length > 0,
        ));
    globalCADInteractionHub.beginActiveInteraction({
      directWorld: directTouchWorld,
      cursorWorld: raw,
      cursorScreen: { x: ev.clientX, y: ev.clientY },
      appliedOffsetY: useOffsetHere ? -TOUCH_CURSOR_OFFSET_PX : 0,
      invertedTopEdge: false,
    });
    if (useOffsetHere) {
      activeTouchScreenPosRef.current = touchCanvasPt;
      setActiveTouchScreenPos(touchCanvasPt);
      setTouchWorldPos(directTouchWorld);
      setTouchOffsetActive(true);
      if (pType === "touch" && tool !== "select") {
        setNudgeHudVisible(true);
      }
    } else {
      activeTouchScreenPosRef.current = null;
      setActiveTouchScreenPos(null);
      setTouchOffsetActive(false);
      setTouchWorldPos(null);
    }

    const isDrawingOrEditingTool = (
      tool === "line" ||
      tool === "construction_line" ||
      tool === "polyline" ||
      tool === "spline" ||
      tool === "rect" ||
      tool === "circle" ||
      tool === "ellipse" ||
      tool === "arc" ||
      tool.startsWith("dim_") ||
      tool === "measure" ||
      tool === "fillet" ||
      tool === "chamfer" ||
      tool === "smart_trim" ||
      tool === "trim" ||
      tool === "move" ||
      tool === "node" ||
      tool === "leader" ||
      interactionGuideMode === "purple_ref" ||
      dragNode !== null ||
      dragEntityRef.current !== null
    );

    if (
      loupeMode !== "off" &&
      ptrsRef.current.size === 1 &&
      tool !== "pan" &&
      (loupeMode === "pinned" || isDrawingOrEditingTool)
    ) {
      setLoupeVisible(true);
      setLoupeScreenPos({ x: ev.clientX, y: ev.clientY });
      setLoupeCadPos(p);
    }

    if (
      loupeMode !== "off" &&
      ev.pointerType === "touch" &&
      (loupeMode === "pinned" || isDrawingOrEditingTool)
    ) {
      setLoupeScreenPos({ x: ev.clientX, y: ev.clientY });
      setLoupeCadPos(p);
    }

    if (tool === "pan" || ev.button === 1) {
      if (dragEntityRef.current) {
        cancelOrFinalizeEntityDrag();
      }
      panRef.current = { x: ev.clientX, y: ev.clientY };
      return;
    }

    // CAPTURA DE PONTOS E CALIBRAÇÃO DA ENGENHARIA REVERSA (FASE B)
    if (revEngCanvasMode !== "none") {
      if (revEngCanvasMode === "capture_contour_pts") {
        const ptIdx = revEngData.capturedPoints.length + 1;
        setRevEngData((prev) => ({
          ...prev,
          capturedPoints: [
            ...prev.capturedPoints,
            {
              id: uid(),
              x: Number(p.x.toFixed(3)),
              y: Number(p.y.toFixed(3)),
              source: "manual_touch",
              uncertaintyMm: 0.1,
            },
          ],
        }));
        triggerHaptic("selection");
        toast.success(`✓ Ponto P${ptIdx} capturado (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm`);
        return;
      }

      if (revEngCanvasMode === "pick_cal_2pt" || revEngCanvasMode === "pick_cal_multiref") {
        const next = revEngPickPoints.length >= 2 ? [p] : [...revEngPickPoints, p];
        setRevEngPickPoints(next);
        triggerHaptic("selection");
        if (next.length === 1) {
          toast.info("1º ponto de referência marcado — toque no 2º ponto da cota conhecida.");
        } else {
          toast.success(
            `✓ 2º ponto marcado (distância: ${dist(next[0]!, next[1]!).toFixed(2)} unid.) — informe o comprimento real em mm na aba ENG. REV.`,
          );
        }
        return;
      }

      if (revEngCanvasMode === "pick_homography_4pt") {
        const next = revEngPickPoints.length >= 4 ? [p] : [...revEngPickPoints, p];
        setRevEngPickPoints(next);
        triggerHaptic("selection");
        if (next.length < 4) {
          toast.info(`Canto C${next.length}/4 marcado — toque no canto C${next.length + 1}.`);
        } else {
          toast.success("✓ 4 cantos C1–C4 marcados! Clique em Retificar Perspectiva na aba ENG. REV.");
        }
        return;
      }
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

    // INTERAÇÕES DIRETAS DO MOTOR DE ARRAYS INTELIGENTES (PIVO ARRASTÁVEL, SELEÇÃO DE FURO, OMITIR CÓPIAS)
    if (activeArrayType !== null) {
      // 1. Se nenhuma peça foi selecionada antes de abrir o Array, o 1º toque seleciona o furo/entidade
      if (selected.length === 0) {
        const hit = hitTest(raw) ?? hitTest(directTouchWorld);
        if (hit) {
          const nextIds = expandSelection(entities, [hit.id]);
          const nextEnts = entities.filter((e) => nextIds.includes(e.id));
          setSelection(nextIds);
          initializeArrayFromEntities(nextEnts, activeArrayType, null);
          triggerHaptic("selection");
        }
        return;
      }

      // 2. Modo Polar: Toque ou arraste no Pivô Central Vermelho Carmesim (#DC143C) ou modo "Escolher Centro"
      if (activeArrayType === "polar") {
        const pivotTol = (pType === "touch" ? 22 : 16) / view.k;
        const distToPivot = Math.min(
          dist(raw, arrayPolarParams.center),
          dist(directTouchWorld, arrayPolarParams.center),
        );

        if (isArrayPickingCenter || distToPivot <= pivotTol) {
          isDraggingArrayCenterRef.current = true;
          const nextCenter = isArrayPickingCenter ? p : arrayPolarParams.center;
          if (isArrayPickingCenter) {
            setArrayPolarParams((prev) => {
              const baseCenter = selected.length > 0 ? getGroupCenter(selected) : nextCenter;
              const radius = dist(nextCenter, baseCenter);
              return {
                ...prev,
                center: nextCenter,
                radius,
                startAngleDeg:
                  Math.atan2(baseCenter.y - nextCenter.y, baseCenter.x - nextCenter.x) *
                  (180 / Math.PI),
              };
            });
            setIsArrayPickingCenter(false);
            toast.success(
              `Centro do padrão fixado em (${nextCenter.x.toFixed(1)}, ${nextCenter.y.toFixed(1)}) mm`,
            );
          }
          triggerHaptic("selection");
          return;
        }

        // 2b. Toque em um centro candidato (quando confiança MÉDIA / múltiplos centros candidatos)
        if (arrayHostInfo.candidateCenters.length > 1) {
          for (const cand of arrayHostInfo.candidateCenters) {
            if (
              Math.min(dist(raw, cand.point), dist(directTouchWorld, cand.point)) <=
              (pType === "touch" ? 20 : 14) / view.k
            ) {
              setArrayPolarParams((prev) => {
                const baseCenter = selected.length > 0 ? getGroupCenter(selected) : cand.point;
                const radius = dist(cand.point, baseCenter);
                return {
                  ...prev,
                  center: cand.point,
                  radius,
                  startAngleDeg:
                    Math.atan2(baseCenter.y - cand.point.y, baseCenter.x - cand.point.x) *
                    (180 / Math.PI),
                };
              });
              triggerHaptic("action");
              toast.success(`Centro selecionado: ${cand.label}`);
              return;
            }
          }
        }
      }

      // 3. Toque em qualquer instância fantasma (k >= 1) para Omitir / Restaurar cópia individual (skippedIndices)
      if (arrayPreview?.ghostSlots) {
        const baseBox = bbox(selected);
        const entRadius = baseBox
          ? Math.max(8 / view.k, Math.hypot(baseBox.maxX - baseBox.minX, baseBox.maxY - baseBox.minY) / 2)
          : 14 / view.k;
        const slotHitTol = Math.max((pType === "touch" ? 18 : 14) / view.k, entRadius);

        let bestSlot: { index: number; isSkipped: boolean; d: number } | null = null;
        for (const slot of arrayPreview.ghostSlots) {
          if (slot.isOriginal || slot.index < 1) continue;
          const d = Math.min(dist(raw, slot.center), dist(directTouchWorld, slot.center));
          if (d <= slotHitTol && (!bestSlot || d < bestSlot.d)) {
            bestSlot = { index: slot.index, isSkipped: slot.isSkipped, d };
          }
        }

        if (bestSlot) {
          const targetIdx = bestSlot.index;
          if (activeArrayType === "polar") {
            setArrayPolarParams((prev) => {
              const cur = prev.skippedIndices ?? [];
              const exists = cur.includes(targetIdx);
              return {
                ...prev,
                skippedIndices: exists ? cur.filter((k) => k !== targetIdx) : [...cur, targetIdx],
              };
            });
          } else {
            setArrayLinearParams((prev) => {
              const cur = prev.skippedIndices ?? [];
              const exists = cur.includes(targetIdx);
              return {
                ...prev,
                skippedIndices: exists ? cur.filter((k) => k !== targetIdx) : [...cur, targetIdx],
              };
            });
          }
          triggerHaptic("selection");
          toast.info(
            bestSlot.isSkipped
              ? `Posição #${targetIdx + 1} restaurada no padrão.`
              : `Posição #${targetIdx + 1} omitida do padrão (toque novamente para restaurar).`,
          );
          return;
        }
      }
    }

    if (tool === "select" || tool === "node") {
      // 1. Fusão Gestual Inteligente (Seção 3.2):
      // Ao aproximar o cursor (com offset 55px ou direto) de qualquer vértice de uma peça selecionada,
      // o Snap magnético trava nele e permite arrastar o nó diretamente no modo Ponteiro!
      let bestNode: { id: string; index: number; dist: number; pt: Vec2 } | null = null;
      if (selection.length > 0) {
        const bd = (pType === "touch" ? 16 : 12) / view.k;
        for (const selEnt of selected) {
          const pts = entityPoints(selEnt);
          pts.forEach((q, i) => {
            const d = Math.min(dist(q, raw), dist(q, directTouchWorld));
            if (d < bd && (!bestNode || d < bestNode.dist)) {
              bestNode = { id: selEnt.id, index: i, dist: d, pt: q };
            }
          });
        }
      }

      // 2. Teste de colisão estritamente a partir do centro real do retículo (cx, cy) com raio de captura 55px / zoom (Seção 5.2)
      const hit = hitTest(raw);
      const targetEntity = hit;

      // Modo MARCO GEOMÉTRICO (interactionGuideMode === "purple_ref"):
      // PROIBIDO criar ou comitar entidade no pointerdown / touchstart e PROIBIDO gerar marcos "ÓRFÃO" no vazio!
      // No início do toque (1 dedo), apenas atualiza a prévia pulsante se houver um ponto SNAP válido real.
      if (interactionGuideMode === "purple_ref" && !bestNode) {
        const validCandidate = inferValidGeometricMarkCandidate(
          p,
          entities,
          activeLayer,
          smartSnap,
          55 / view.k,
        );
        previewGeometricMarkCandidateRef.current = validCandidate;
        setPreviewGeometricMarkCandidate(validCandidate);
      }

      // =========================================================================
      // MÁQUINA DE ESTADOS BASEADA NO ALVO DO TOQUE (HIT-TEST CONTEXT)
      // =========================================================================

      // CASO A: O toque começou em cima de uma Forma Geométrica ou Vértice (targetEntity != null || bestNode != null)
      if (targetEntity || bestNode) {
        // Se clicou/mirou sobre um vértice de peça selecionada, inicia edição direta do nó (Fusão Gestual)
        if (bestNode) {
          setDragNode({ id: bestNode.id, index: bestNode.index });
          if (ev.pointerType === "touch" && cursorOffsetMode === "offset") {
            setTouchWorldPos(directTouchWorld);
            setTouchOffsetActive(true);
          }
          if (loupeMode !== "off") {
            setLoupeVisible(true);
            setLoupeScreenPos({ x: ev.clientX, y: ev.clientY });
            setLoupeCadPos(bestNode.pt);
          }
          triggerHaptic("selection");
          return;
        }

        // Prioridade para o Long-Press de Arraste (320ms) / Seleção / Referência:
        // O tempo de pressão serve exclusivamente para destravar o movimento da peça ou acionar menus contextuais específicos da geometria.
        if (hit) {
          // Desambiguação de Sobreposição no Toque quando >= 2 entidades competem pelo ponto
          const overlapsHere = findOverlappingEntitiesAtPoint(raw, visible, (pType === "touch" ? 12 : 8) / view.k);
          if (overlapsHere.length >= 2) {
            setOverlappingCandidates(overlapsHere);
          } else {
            setOverlappingCandidates([]);
          }

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

          // Selecionar ou clicar na entidade JAMAIS abre automaticamente o painel lateral direito (Seção 1.3)
          const now = performance.now();
          lastEntityTapRef.current = { id: hit.id, time: now };

          if (tool === "select") {
            const inCooldown = performance.now() < Math.max(gestureUntilRef.current, dragCooldownUntilRef.current);
            if (!inCooldown && ptrsRef.current.size === 1) {
              const canvasRect = (canvasViewportRef.current ?? svgRef.current)?.getBoundingClientRect();
              const v = viewRef.current;
              const zoom = v && Number.isFinite(v.k) && v.k > 0 ? v.k : 1;
              const panX = v && Number.isFinite(v.tx) ? v.tx : 0;
              const panY = v && Number.isFinite(v.ty) ? v.ty : 0;
              const left = canvasRect?.left ?? 0;
              const top = canvasRect?.top ?? 0;

              const startWorldX = (ev.clientX - left - panX) / zoom;
              const startWorldY = (ev.clientY - top - panY) / zoom;

              // Snapshot Imutável de todas as entidades
              const initialEntitiesSnapshot: Entity[] = entities.map((e) => {
                if (e.type === "polyline") {
                  return { ...e, pts: e.pts.map((pt) => ({ ...pt })) };
                }
                return { ...e };
              });

              // REGRA 1.1: BLOQUEIO DE MOVIMENTO IMEDIATO (Exigir Segurar por 320ms)
              // Uma peça NUNCA deve começar a se mover no instante do toque!
              if (dragLongPressRef.current) {
                clearTimeout(dragLongPressRef.current.timer);
                dragLongPressRef.current = null;
              }
              if (dragEntityRef.current) {
                dragEntityRef.current = null;
                isDraggingEntityRef.current = false;
              }
              setIsDraggingUnlocked(false);

              const clientX = ev.clientX;
              const clientY = ev.clientY;
              const pointerId = ev.pointerId;

              const timer = setTimeout(() => {
                if (ptrsRef.current.size !== 1) return;
                if (performance.now() < dragCooldownUntilRef.current) return;

                // Destrava movimento da peça após 320ms parado
                setIsDraggingUnlocked(true);
                isDraggingEntityRef.current = true;
                dragEntityRef.current = {
                  pointerId,
                  startClient: { x: clientX, y: clientY },
                  startWorld: { x: startWorldX, y: startWorldY },
                  ids: nextSel,
                  initialEntitiesSnapshot,
                  moved: false,
                  effectiveDelta: { x: 0, y: 0 },
                  unlocked: true,
                };

                // Feedback ao destravar: vibração curta (15ms) + ativação da Bolha Quadrada de Zoom
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  try {
                    navigator.vibrate(15);
                  } catch {
                    // ignorar se vibração não suportada
                  }
                }
                triggerHaptic("action");
                AudioManager.play("ui_select");

                setLoupeVisible(true);
                setLoupeScreenPos({ x: clientX, y: clientY });
                setLoupeCadPos({ x: startWorldX, y: startWorldY });

                if (longPressRef.current) {
                  clearTimeout(longPressRef.current.timer);
                  longPressRef.current = null;
                }
              }, 320);

              dragLongPressRef.current = {
                timer,
                pointerId,
                startClient: { x: clientX, y: clientY },
                startWorld: { x: startWorldX, y: startWorldY },
                ids: nextSel,
                initialEntitiesSnapshot,
              };
            }
          }
        }
        return;
      }

      // =========================================================================
      // CASO B: O toque começou em um Espaço Vazio do Canvas (targetEntity == null)
      // =========================================================================

      // 1. Desativar Arraste e Referência de Peça:
      // Como não há nenhuma entidade embaixo do dedo, ignore interações de mover formas ou capturar pontos de referência da peça.
      if (dragLongPressRef.current) {
        clearTimeout(dragLongPressRef.current.timer);
        dragLongPressRef.current = null;
      }
      if (dragEntityRef.current) {
        dragEntityRef.current = null;
        isDraggingEntityRef.current = false;
      }
      setIsDraggingUnlocked(false);

      if (!ev.shiftKey) setSelection([]);
      setOverlappingCandidates([]);

      // Inicia retângulo de seleção por janela (Esq->Dir Azul) ou captura (Dir->Esq Verde Tracejado) no vazio
      setMarquee({ a: raw, b: raw });
      return;
    }

    if (tool === "point") {
      commit((e) => [...e, { id: uid(), layer: activeLayer, type: "point", x: p.x, y: p.y }]);
      triggerHaptic("tap");
      return;
    }

    if (tool === "polyline" || tool === "spline") {
      let nextPoint = p;
      if (pending.length > 0) {
        const lastPoint = pending[pending.length - 1]!;
        const hasLockedLen =
          typeof lockedDims.lockedLengthMm === "number" &&
          Number.isFinite(lockedDims.lockedLengthMm) &&
          lockedDims.lockedLengthMm > 0;
        const hasLockedAng =
          typeof lockedDims.lockedAngleDeg === "number" &&
          Number.isFinite(lockedDims.lockedAngleDeg);
        if (hasLockedLen || hasLockedAng) {
          const curLen = hasLockedLen ? lockedDims.lockedLengthMm! : dist(lastPoint, nextPoint);
          const curAngRad = hasLockedAng
            ? (lockedDims.lockedAngleDeg! * Math.PI) / 180
            : Math.atan2(nextPoint.y - lastPoint.y, nextPoint.x - lastPoint.x);
          nextPoint = {
            x: lastPoint.x + Math.cos(curAngRad) * curLen,
            y: lastPoint.y + Math.sin(curAngRad) * curLen,
          };
        } else if (drawingProjection === "isometric" && (isoOrtho || orthoOn)) {
          nextPoint = constrainToIsoAxes(lastPoint, nextPoint, isoPlane);
        } else if (orthoOn && tool === "polyline" && polylineSegMode === "line") {
          nextPoint = projectOrthoSegment(lastPoint, nextPoint);
        }
      }

      if (shouldClosePolyline(pending, nextPoint, 10 / view.k)) {
        finishPolyline(true);
        return;
      }
      if (pending.length > 0) {
        polylineSegModesRef.current.push(polylineSegMode);
      }
      setPending((q) => [...q, nextPoint]);
      setDraft({
        id: uid(),
        layer: activeLayer,
        type: "line",
        x1: nextPoint.x,
        y1: nextPoint.y,
        x2: nextPoint.x,
        y2: nextPoint.y,
      });
      triggerHaptic("tap");
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
          const draftState = createPendingDraftShapeState(
            "arc",
            arc,
            a,
            c,
            activeLayer,
            filletR,
            {
              rectMode,
              circleMode,
              polygonMode,
              polygonSides,
              polygonAcrossFlatsMm,
              slotMode,
              slotWidthMm,
              arcMidPoint: b,
            },
          );
          if (draftState) {
            setPendingDraftShape(draftState);
            lastCreatedVertexRef.current = c;
          } else {
            commit((e) => [...e, arc]);
          }
          setSelection([]);
          setMobileEditorOpenManual(false);
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

    if (tool === "loft_3d") {
      const hit = hitTest(raw);
      if (!hit) {
        toast.info("Toque em um perfil fechado (Retângulo, Polígono ou Círculo) para adicionar à transição Loft 3D.");
        return;
      }
      if (!isClosedLoftableProfile(hit)) {
        toast.warning("Para o Loft 3D, selecione um perfil fechado (Retângulo, Polígono, Círculo ou Polilinha fechada).");
        return;
      }
      triggerHaptic("selection");
      setLoftSectionIds((prev) => {
        if (prev.includes(hit.id)) {
          return prev.filter((id) => id !== hit.id);
        }
        const next = [...prev, hit.id];
        if (
          next.length === 2 &&
          drawingProjection !== "isometric" &&
          !orbitProjection2D.isTilted
        ) {
          // Inclina suavemente para perspectiva isométrica 3D para revelar a prévia translúcida
          animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
        }
        return next;
      });
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
      swipeTrimFenceRef.current = [raw];
      setSwipeTrimCutPreview([]);
      const hit = hitTest(raw);
      if (hit) {
        const result = removeEntityOnly(entities, groups, hit.id);
        commit(result.entities);
        setGroups(result.groups);
        setSelection((ids) => ids.filter((id) => id !== hit.id));
        toast.success("Entidade removida.");
        swipeTrimFenceRef.current = [];
      }
      return;
    }
    if (tool === "smart_trim") {
      swipeTrimFenceRef.current = [raw];
      setSwipeTrimCutPreview([]);
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
          swipeTrimFenceRef.current = [];
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
      if (hit) {
        const extended = extendEntityToNearestBoundary(hit, raw, entities);
        if (extended) {
          commit((e) => e.map((x) => (x.id === extended.id ? extended : x)));
          triggerHaptic("action");
          toast.success("Entidade estendida até a fronteira mais próxima.");
          return;
        }
        for (const other of entities) {
          if (other.id === hit.id) continue;
          const t = extendLine(hit, other);
          if (t) {
            commit((e) => e.map((x) => (x.id === t.id ? t : x)));
            break;
          }
        }
      }
      return;
    }
    if (tool === "fillet" || tool === "chamfer") {
      const tol = 16 / view.k;
      const corner = findCornerAtPoint(raw, entities, tol);
      if (corner) {
        if (tool === "fillet") {
          const res = applyFilletToCorner(corner, filletR, entities);
          if (res.success) {
            commit(res.updatedEntities);
            triggerHaptic("action");
            toast.success(`Filete R${filletR} mm aplicado no canto.`);
            setFilletPreview(null);
            setSelection([]);
            return;
          }
        } else {
          const res = applyChamferToCorner(corner, filletR, filletR, entities);
          if (res.success) {
            commit(res.updatedEntities);
            triggerHaptic("action");
            toast.success(`Chanfro ${filletR} mm aplicado no canto.`);
            setChamferPreview(null);
            setSelection([]);
            return;
          }
        }
      }

      // Permite também seleção sequencial de 2 linhas concorrentes
      const hit = hitTest(raw);
      if (!hit) return;
      if (!selection.length) {
        setSelection([hit.id]);
        toast.info("1ª linha selecionada. Clique na 2ª linha do canto.");
        return;
      }
      const first = entities.find((e) => e.id === selection[0]);
      if (!first || first.id === hit.id) return;

      if (first.type === "line" && hit.type === "line") {
        const cornerLines = findCornerAtPoint(raw, [first, hit], 1000) ?? {
          kind: "lines" as const,
          corner: { x: first.x1, y: first.y1 },
          entityA: first,
          entityB: hit,
          farA: { x: first.x2, y: first.y2 },
          farB: { x: hit.x2, y: hit.y2 },
        };

        if (tool === "fillet") {
          const res = applyFilletToCorner(cornerLines, filletR, entities);
          if (res.success) {
            commit(res.updatedEntities);
            triggerHaptic("action");
            toast.success(`Filete R${filletR} mm aplicado entre as linhas.`);
            setSelection([]);
            setFilletPreview(null);
            return;
          }
        } else {
          const res = applyChamferToCorner(cornerLines, filletR, filletR, entities);
          if (res.success) {
            commit(res.updatedEntities);
            triggerHaptic("action");
            toast.success(`Chanfro ${filletR} mm aplicado entre as linhas.`);
            setSelection([]);
            setChamferPreview(null);
            return;
          }
        }
      }

      toast.error("Não foi possível concordar estas entidades.");
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

    // ferramentas de arrasto 2D (bloqueadas enquanto estiver no modo CAD 3D)
    if (activeMode === "3d") return;
    setPending([p]);
    setDraft(
      buildDraft(tool, p, p, activeLayer, filletR, drawingProjection, isoPlane, {
        rectMode,
        circleMode,
        polygonMode,
        polygonSides,
        polygonAcrossFlatsMm,
        slotMode,
        slotWidthMm,
      }),
    );
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (ptrsRef.current.has(ev.pointerId))
      ptrsRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // Multi-Touch Guard: se 2 ou mais dedos estiverem no canvas, bloqueia e aborta qualquer ferramenta imediatamente
    if (ptrsRef.current.size >= 2 || isMultiTouchGestureRef.current) {
      abortForMultiTouchGesture();
    }

    // REGRA 1.1: Tolerância de oscilação de 8px antes de completar os 320ms
    if (dragLongPressRef.current && !dragEntityRef.current?.unlocked) {
      const lp = dragLongPressRef.current;
      const oscDist = Math.hypot(ev.clientX - lp.startClient.x, ev.clientY - lp.startClient.y);
      if (oscDist > 8) {
        clearTimeout(lp.timer);
        dragLongPressRef.current = null;
        // Gesto cancelado para movimentação da peça (tratado apenas como navegação ou marquee)
      }
    }

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
      wasCameraPannedRef.current = true;
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
      orbitDragRef.current = null;
      return;
    }

    if (isMultiTouchGestureRef.current || ptrsRef.current.size >= 2) {
      return;
    }

    // ---- arraste livre de Órbita 3D (1 dedo ou mouse quando ÓRBITA 3D ativo) ----
    if (orbitDragRef.current && ptrsRef.current.size === 1) {
      ev.preventDefault();
      const dx = ev.clientX - orbitDragRef.current.x;
      const dy = ev.clientY - orbitDragRef.current.y;
      orbitDragRef.current = { x: ev.clientX, y: ev.clientY };
      if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
        wasCameraPannedRef.current = true;
        handleDragOrbitDelta(dx, dy);
        markGesture();
      }
      return;
    }

    const pType = ev.pointerType || lastPointerTypeRef.current || "mouse";
    lastPointerTypeRef.current = pType;
    if (activePointerType !== pType) setActivePointerType(pType);

    if (panRef.current) {
      const dx = ev.clientX - panRef.current.x;
      const dy = ev.clientY - panRef.current.y;
      if (Math.hypot(dx, dy) > 1.5) {
        wasCameraPannedRef.current = true;
      }
      panRef.current = { x: ev.clientX, y: ev.clientY };
      const v = viewRef.current;
      applyView({ ...v, tx: v.tx + dx, ty: v.ty + dy });
      markGesture();
      return;
    }

    if ((tool === "smart_trim" || tool === "trim") && swipeTrimFenceRef.current.length > 0 && ptrsRef.current.size === 1) {
      // Suporte imediato a getCoalescedEvents?.() para não perder interseções em swipes rápidos
      const nativeEv = ev.nativeEvent as PointerEvent;
      const coalesced = typeof nativeEv.getCoalescedEvents === "function" ? nativeEv.getCoalescedEvents() : [];
      if (coalesced.length > 0) {
        for (const ce of coalesced) {
          const pt = toWorld({
            clientX: ce.clientX,
            clientY: ce.clientY,
            pointerType: ce.pointerType,
          });
          const lastFence = swipeTrimFenceRef.current[swipeTrimFenceRef.current.length - 1];
          if (!lastFence || dist(lastFence, pt) > 1.5 / view.k) {
            swipeTrimFenceRef.current.push(pt);
          }
        }
      } else {
        const rawPt = toWorld(ev);
        const lastFence = swipeTrimFenceRef.current[swipeTrimFenceRef.current.length - 1];
        if (!lastFence || dist(lastFence, rawPt) > 1.5 / view.k) {
          swipeTrimFenceRef.current.push(rawPt);
        }
      }
    }

    if (dragEntityRef.current && dragEntityRef.current.unlocked && (!ev.pointerId || dragEntityRef.current.pointerId === ev.pointerId)) {
      const drag = dragEntityRef.current;
      const canvasRect = (canvasViewportRef.current ?? svgRef.current)?.getBoundingClientRect();
      const v = viewRef.current;
      const zoom = v && Number.isFinite(v.k) && v.k > 0 ? v.k : 1;
      const panX = v && Number.isFinite(v.tx) ? v.tx : 0;
      const panY = v && Number.isFinite(v.ty) ? v.ty : 0;
      const left = canvasRect?.left ?? 0;
      const top = canvasRect?.top ?? 0;

      const currentWorldX = (ev.clientX - left - panX) / zoom;
      const currentWorldY = (ev.clientY - top - panY) / zoom;

      let totalDeltaX = currentWorldX - drag.startWorld.x;
      let totalDeltaY = currentWorldY - drag.startWorld.y;

      drag.moved = true;
      isDraggingEntityRef.current = true;
      if (longPressRef.current) {
        clearTimeout(longPressRef.current.timer);
        longPressRef.current = null;
      }

      // Mantém a Bolha Quadrada de Zoom sincronizada com o arraste da peça
      setLoupeVisible(true);
      setLoupeScreenPos({ x: ev.clientX, y: ev.clientY });
      setLoupeCadPos({ x: currentWorldX, y: currentWorldY });

      // Restrições ortogonais e isométricas
      if (drawingProjection === "isometric" && (isoOrtho || orthoOn)) {
        const constrained = constrainToIsoAxes(
          drag.startWorld,
          { x: drag.startWorld.x + totalDeltaX, y: drag.startWorld.y + totalDeltaY },
          isoPlane,
        );
        totalDeltaX = constrained.x - drag.startWorld.x;
        totalDeltaY = constrained.y - drag.startWorld.y;
      } else if (orthoOn) {
        const adx = Math.abs(totalDeltaX);
        const ady = Math.abs(totalDeltaY);
        if (adx >= ady) {
          totalDeltaY = 0;
        } else {
          totalDeltaX = 0;
        }
      }

      let effectiveDeltaX = totalDeltaX;
      let effectiveDeltaY = totalDeltaY;

      if (snapOn) {
        const targetWorldPos = {
          x: drag.startWorld.x + totalDeltaX,
          y: drag.startWorld.y + totalDeltaY,
        };
        // Exclui as entidades selecionadas da lista de snap para eliminar feedback loop oscilatório
        const otherEntities = drag.initialEntitiesSnapshot.filter((e) => !drag.ids.includes(e.id));
        const tol = 12 / zoom;

        let snappedPos: Vec2 | null = null;
        if (drawingProjection === "isometric" && showGrid) {
          const isoG = snapToIsoGrid(targetWorldPos, grid, isoPlane);
          if (dist(targetWorldPos, isoG) <= tol * 1.5) {
            snappedPos = isoG;
          }
        }
        if (!snappedPos) {
          const smart = findSmartSnap(targetWorldPos, otherEntities, tol, null, "select", []);
          if (smart) {
            snappedPos = smart.p;
          } else {
            const s = findSnap(targetWorldPos, otherEntities, tol, grid, { grid: showGrid, object: true });
            if (s) snappedPos = s.p;
          }
        }

        if (snappedPos) {
          effectiveDeltaX = snappedPos.x - drag.startWorld.x;
          effectiveDeltaY = snappedPos.y - drag.startWorld.y;
        }
      }

      drag.effectiveDelta = { x: effectiveDeltaX, y: effectiveDeltaY };

      // REGRA DE OURO: Calcular nova posição estritamente a partir do Snapshot Inicial (sem acumulação)
      const updated = drag.initialEntitiesSnapshot.map((e) => {
        if (!drag.ids.includes(e.id)) return e;
        const translated = translate(e, effectiveDeltaX, effectiveDeltaY);
        // Compatibilidade com Modo Isométrico: converter delta usando a Matriz Isométrica Inversa
        if (translated.params?.canonical2D && typeof translated.params.canonical2D === "object") {
          const entPlane = (translated.params.isoPlane as IsoPlane) || isoPlane;
          const canDelta = unprojectPointFromIsoPlane(
            { x: effectiveDeltaX, y: effectiveDeltaY },
            entPlane,
            { x: 0, y: 0 },
          );
          const origCan =
            (drag.initialEntitiesSnapshot.find((orig) => orig.id === e.id)?.params?.canonical2D as Entity) ??
            translated.params.canonical2D;
          translated.params = {
            ...translated.params,
            canonical2D: translate(origCan, canDelta.x, canDelta.y),
          };
        }
        return translated;
      });

      // Throttle via RAF para 60fps macio e proteção contra sobrecarga de CPU/memória
      pendingDragEntitiesRef.current = updated;
      if (!dragRafRef.current) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          if (pendingDragEntitiesRef.current) {
            setEntities(pendingDragEntitiesRef.current);
          }
        });
      }
      return;
    }

    // Throttle via requestAnimationFrame (máx. 1 atualização de estado por quadro = 60 FPS estável sem lag)
    pendingPointerMoveRef.current = {
      clientX: ev.clientX,
      clientY: ev.clientY,
      pointerType: pType,
    };

    if (pointerMoveRafRef.current !== null) return;

    pointerMoveRafRef.current = requestAnimationFrame(() => {
      pointerMoveRafRef.current = null;
      const moveEv = pendingPointerMoveRef.current;
      if (!moveEv) return;
      pendingPointerMoveRef.current = null;
      flushPointerMoveFrame(moveEv.clientX, moveEv.clientY, moveEv.pointerType);
    });
  };

  const flushPointerMoveFrame = (clientX: number, clientY: number, pType: string) => {
    if (
      isMultiTouchGestureRef.current ||
      touchInteractionStateRef.current === "MULTITOUCH_NAVIGATION" ||
      touchInteractionStateRef.current === "POST_GESTURE_COOLDOWN" ||
      ptrsRef.current.size >= 2 ||
      pinchRef.current !== null
    ) {
      return;
    }

    const touchCanvasPt = getTouchCanvasScreenPos({ clientX, clientY });
    const raw = toWorld({ clientX, clientY, pointerType: pType });
    const directTouchWorld = toWorld({ clientX, clientY, pointerType: pType }, true);

    const useOffsetMove =
      cursorOffsetMode === "offset" &&
      tool !== "pan" &&
      !panRef.current &&
      ptrsRef.current.size <= 1 &&
      (pType === "touch" ||
        ptrsRef.current.size === 1 ||
        shouldUseTouchOffset(
          pType,
          tool,
          dragNode !== null || isDraggingArrayCenterRef.current || isArrayPickingCenter,
          isDraggingEntityRef.current || !!dragEntityRef.current?.unlocked,
          cursorOffsetMode,
          selection.length > 0,
        ));
    if (useOffsetMove) {
      activeTouchScreenPosRef.current = touchCanvasPt;
      setActiveTouchScreenPos(touchCanvasPt);
      setTouchWorldPos(directTouchWorld);
      setTouchOffsetActive(true);
    } else if (ptrsRef.current.size >= 2 || panRef.current || !useOffsetMove) {
      activeTouchScreenPosRef.current = null;
      setActiveTouchScreenPos(null);
      setTouchOffsetActive(false);
      setTouchWorldPos(null);
    }

    // Visor ampliado magnético / Lupa de precisão técnica (3x)
    const isDrawingOrEditingToolMove = (
      tool === "line" ||
      tool === "construction_line" ||
      tool === "polyline" ||
      tool === "spline" ||
      tool === "rect" ||
      tool === "rrect" ||
      tool === "circle" ||
      tool === "polygon" ||
      tool === "slot" ||
      tool === "ellipse" ||
      tool === "arc" ||
      tool.startsWith("dim_") ||
      tool === "measure" ||
      tool === "fillet" ||
      tool === "chamfer" ||
      tool === "smart_trim" ||
      tool === "trim" ||
      tool === "move" ||
      tool === "node" ||
      tool === "leader" ||
      interactionGuideMode === "purple_ref" ||
      dragNode !== null ||
      dragEntityRef.current !== null ||
      (tool === "select" && (isDraggingEntityRef.current || selection.length > 0 || marquee !== null))
    );

    if (
      loupeMode !== "off" &&
      ptrsRef.current.size === 1 &&
      (loupeMode === "pinned" || isDrawingOrEditingToolMove) &&
      !panRef.current &&
      tool !== "pan"
    ) {
      setLoupeVisible(true);
      setLoupeScreenPos({ x: clientX, y: clientY });
      setLoupeCadPos(raw);
    } else if (loupeMode === "off" || ptrsRef.current.size !== 1 || panRef.current || tool === "pan") {
      setLoupeVisible(false);
    }

    let currentSnapPt = raw;
    if (snapOn) {
      const tol = (nudgeHudVisible ? 6 : 12) / view.k;
      const hysteresisTol = smartSnap ? tol * 1.35 : tol;

      // Verifica primeiro os Pontos de Encontro Roxos (+) confirmados
      let matchedPinned: Vec2 | null = null;
      for (const mp of pinnedMeetingPoints) {
        if (dist(raw, mp) <= hysteresisTol) {
          matchedPinned = mp;
          break;
        }
      }

      if (matchedPinned) {
        setSmartSnap({
          p: matchedPinned,
          kind: "intersection",
          label: "Ponto de Encontro (+)",
          priority: 100,
        });
        setSnapHit(null);
        currentSnapPt = matchedPinned;
      } else {
        const activeStart = pending.length > 0 ? pending[pending.length - 1] : null;
        const smart = findSmartSnap(raw, entities, hysteresisTol, activeStart ?? null, tool, selection, snapDivision);
        setSmartSnap(smart);
        if (smart) {
          setSnapHit(null);
          currentSnapPt = smart.p;
        } else {
          if (drawingProjection === "isometric" && showGrid) {
            const isoG = snapToIsoGrid(raw, grid, isoPlane);
            if (dist(raw, isoG) <= tol * 1.5) {
              currentSnapPt = isoG;
            }
          }
          const sh = findSnap(raw, near(raw, tol * 2), tol, grid, { grid: showGrid, object: true });
          setSnapHit(sh);
          if (sh) currentSnapPt = sh.p;
        }
      }
    } else {
      setSmartSnap(null);
      setSnapHit(null);
    }

    // Aplica restrições dimensionais reais (L, ∠, ΔX, ΔY, d) se ativas no modo atual
    const constraintBase =
      interactionGuideMode === "blue_line"
        ? pending.length > 0
          ? pending[pending.length - 1]!
          : temporaryOrigin?.p ?? null
        : interactionGuideMode === "purple_ref" && temporaryOrigin
          ? temporaryOrigin.p
          : null;
    if (constraintBase) {
      currentSnapPt = applyDimensionalConstraintsToPoint(constraintBase, currentSnapPt, lockedConstraints);
    }

    cursorRef.current = currentSnapPt;
    setCursor(currentSnapPt);

    // Prévia ao Vivo do Marco Geométrico (Seção 2.3):
    // Enquanto o dedo desliza com Marco Geométrico ativo, exibe a prévia pulsante somente se capturar um ponto SNAP geométrico real!
    if (interactionGuideMode === "purple_ref") {
      const activeSmart =
        smartSnap && dist(currentSnapPt, smartSnap.p) <= 1e-3 ? smartSnap : null;
      const validCand = inferValidGeometricMarkCandidate(
        currentSnapPt,
        entities,
        activeLayer,
        activeSmart,
        55 / view.k,
      );
      previewGeometricMarkCandidateRef.current = validCand;
      setPreviewGeometricMarkCandidate(validCand);
    }

    // Atualização em tempo real apenas das Cotas Vivas de Borda Ativa (evita duplicação com guias azuis/roxas)
    if (activeEdge) {
      const dims = DynamicDimensionInteraction.generateEdgeOffsetDimensions(currentSnapPt, activeEdge, activeEdgeSide);
      setLiveDimensions(dims);
    } else if (liveDimensions.length > 0) {
      setLiveDimensions([]);
    }

    if (tool === "smart_trim" || tool === "trim") {
      if (swipeTrimFenceRef.current.length >= 2) {
        const tx = computeSwipeTrimTransaction(swipeTrimFenceRef.current, entities);
        setSwipeTrimCutPreview(tx.cutSegmentsPreview);
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
    }

    if (tool === "fillet" || tool === "chamfer") {
      const tol = 16 / view.k;
      const corner = findCornerAtPoint(raw, entities, tol);
      if (corner) {
        if (tool === "fillet") {
          const calc = calculateFillet(corner.corner, corner.farA, corner.farB, filletR);
          setFilletPreview(calc ? { corner, calc } : null);
          setChamferPreview(null);
        } else {
          const calc = calculateChamfer(corner.corner, corner.farA, corner.farB, filletR, filletR);
          setChamferPreview(calc ? { corner, calc } : null);
          setFilletPreview(null);
        }
      } else {
        setFilletPreview(null);
        setChamferPreview(null);
      }
    }

    if (isDraggingArrayCenterRef.current && activeArrayType === "polar") {
      const p = currentSnapPt;
      setArrayPolarParams((prev) => {
        const baseCenter = selected.length > 0 ? getGroupCenter(selected) : p;
        const radius = dist(p, baseCenter);
        return {
          ...prev,
          center: p,
          radius,
          startAngleDeg: Math.atan2(baseCenter.y - p.y, baseCenter.x - p.x) * (180 / Math.PI),
        };
      });
      return;
    }

    if (draggingDraftGripIndex !== null && pendingDraftShapeRef.current) {
      const nextPending = applyPendingDraftGripDrag(
        pendingDraftShapeRef.current,
        draggingDraftGripIndex,
        currentSnapPt,
      );
      setPendingDraftShape(nextPending);
      lastCreatedVertexRef.current = nextPending.p1;
      return;
    }

    if (dragNode) {
      const p = currentSnapPt;
      setEntities((list) =>
        list.map((e) => {
          if (e.id !== dragNode.id) return e;
          const { constrainedPoint } = applyEntityNodeConstraint(
            e,
            dragNode.index,
            p,
            temporaryOrigin?.p ?? null,
          );
          const pts = entityPoints(e);
          const origPt = pts[dragNode.index] ?? constrainedPoint;
          return applyMultiModeGripEdit(e, dragNode.index, constrainedPoint, gripMode, origPt);
        }),
      );
      return;
    }
    if (marquee) {
      setMarquee({ a: marquee.a, b: raw });
      return;
    }
    // prévia contínua: arco por 3 pontos e régua
    if (tool === "arc" && pending.length) {
      const p = currentSnapPt;
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
      setLiveMeasure({ a: pending[0]!, b: currentSnapPt });
      return;
    }
    if ((tool === "polyline" || tool === "spline") && pending.length) {
      const lastPoint = pending[pending.length - 1]!;
      let pt = currentSnapPt;
      const hasLockedLen =
        typeof lockedDims.lockedLengthMm === "number" &&
        Number.isFinite(lockedDims.lockedLengthMm) &&
        lockedDims.lockedLengthMm > 0;
      const hasLockedAng =
        typeof lockedDims.lockedAngleDeg === "number" &&
        Number.isFinite(lockedDims.lockedAngleDeg);
      if (hasLockedLen || hasLockedAng) {
        const curLen = hasLockedLen ? lockedDims.lockedLengthMm! : dist(lastPoint, pt);
        const curAngRad = hasLockedAng
          ? (lockedDims.lockedAngleDeg! * Math.PI) / 180
          : Math.atan2(pt.y - lastPoint.y, pt.x - lastPoint.x);
        pt = {
          x: lastPoint.x + Math.cos(curAngRad) * curLen,
          y: lastPoint.y + Math.sin(curAngRad) * curLen,
        };
      } else if (drawingProjection === "isometric" && (isoOrtho || orthoOn)) {
        pt = constrainToIsoAxes(lastPoint, pt, isoPlane);
      } else if (orthoOn && tool === "polyline" && polylineSegMode === "line") {
        pt = projectOrthoSegment(lastPoint, pt);
      }
      setLoupeCadPos(pt);
      setDraft({
        id: uid(),
        layer: activeLayer,
        type: "line",
        x1: lastPoint.x,
        y1: lastPoint.y,
        x2: pt.x,
        y2: pt.y,
      });
      return;
    }
    if (pending.length === 1 && draftRef.current) {
      let targetP = currentSnapPt;
      const p0 = pending[0]!;
      const hasLockedLen =
        typeof lockedDims.lockedLengthMm === "number" &&
        Number.isFinite(lockedDims.lockedLengthMm) &&
        lockedDims.lockedLengthMm > 0;
      const hasLockedAng =
        typeof lockedDims.lockedAngleDeg === "number" &&
        Number.isFinite(lockedDims.lockedAngleDeg);

      // Travamento polar (L, ∠) e restrição ORTO aplicam-se EXCLUSIVAMENTE a ferramentas lineares vetoriais
      if ((hasLockedLen || hasLockedAng) && (tool === "line" || tool === "construction_line")) {
        const curLen = hasLockedLen ? lockedDims.lockedLengthMm! : dist(p0, targetP);
        const curAngRad = hasLockedAng
          ? (lockedDims.lockedAngleDeg! * Math.PI) / 180
          : Math.atan2(targetP.y - p0.y, targetP.x - p0.x);
        targetP = {
          x: p0.x + Math.cos(curAngRad) * curLen,
          y: p0.y + Math.sin(curAngRad) * curLen,
        };
      } else if (orthoOn && (tool === "line" || tool === "construction_line")) {
        const dx = Math.abs(raw.x - p0.x);
        const dy = Math.abs(raw.y - p0.y);
        targetP = dx >= dy ? { x: targetP.x, y: p0.y } : { x: p0.x, y: targetP.y };
      }

      const activeLockedRadius =
        hasLockedLen && (tool === "circle" || tool === "polygon")
          ? lockedDims.lockedLengthMm!
          : undefined;

      if (drawingProjection === "isometric") {
        if ((isoOrtho || orthoOn) && (tool === "line" || tool === "construction_line")) {
          targetP = constrainToIsoAxes(p0, targetP, isoPlane);
        }
        if (tool === "rect") {
          setDraft(buildIsoParallelogram(isoPlane, p0, targetP, activeLayer));
          return;
        }
        if (tool === "circle" || tool === "ellipse") {
          const r = activeLockedRadius ?? dist(p0, targetP);
          setDraft(buildIsoCircle(isoPlane, p0, r, activeLayer));
          return;
        }
      }
      setDraft(
        buildDraft(tool, p0, targetP, activeLayer, filletR, drawingProjection, isoPlane, {
          rectMode,
          circleMode,
          polygonMode,
          polygonSides,
          polygonAcrossFlatsMm,
          slotMode,
          slotWidthMm,
          lockedRadiusMm: activeLockedRadius,
        }),
      );
    }
  };

  const onPointerUp = (ev?: React.PointerEvent) => {
    // Cancela imediatamente qualquer quadro de pointerMove pendente
    if (pointerMoveRafRef.current !== null) {
      cancelAnimationFrame(pointerMoveRafRef.current);
      pointerMoveRafRef.current = null;
    }
    const isMultitouchNow =
      isMultiTouchGestureRef.current ||
      touchInteractionStateRef.current === "MULTITOUCH_NAVIGATION" ||
      touchInteractionStateRef.current === "POST_GESTURE_COOLDOWN" ||
      pinchRef.current !== null ||
      ptrsRef.current.size >= 2;

    if (isMultitouchNow) {
      pendingPointerMoveRef.current = null;
    } else if (pendingPointerMoveRef.current) {
      const pendingEv = pendingPointerMoveRef.current;
      pendingPointerMoveRef.current = null;
      flushPointerMoveFrame(pendingEv.clientX, pendingEv.clientY, pendingEv.pointerType);
    } else if (ev && pending.length === 1 && draftRef.current && !panRef.current && !orbitDragRef.current) {
      flushPointerMoveFrame(ev.clientX, ev.clientY, ev.pointerType || lastPointerTypeRef.current || "mouse");
    }

    setLoupeVisible(false);
    setIsDraggingUnlocked(false);
    setTouchOffsetActive(false);
    setTouchWorldPos(null);
    activeTouchScreenPosRef.current = null;
    setActiveTouchScreenPos(null);
    // Regra Zero-Idle (Seção 2.2): libera listeners e animações transitórias ao soltar o toque
    globalCADInteractionHub.enterIdleState();

    if (dragLongPressRef.current) {
      clearTimeout(dragLongPressRef.current.timer);
      dragLongPressRef.current = null;
    }
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
    if (ev) ptrsRef.current.delete(ev.pointerId);

    const wasMultitouch =
      isMultiTouchGestureRef.current ||
      pinchRef.current !== null ||
      touchInteractionStateRef.current === "MULTITOUCH_NAVIGATION" ||
      touchInteractionStateRef.current === "POST_GESTURE_COOLDOWN";
    if (wasMultitouch) {
      previewGeometricMarkCandidateRef.current = null;
      setPreviewGeometricMarkCandidate(null);
      setPendingGeometricMarkConfirmation(null);
      setMarquee(null);

      if (ptrsRef.current.size < 2) {
        pinchRef.current = null;
      }
      panRef.current = null;
      orbitDragRef.current = null;

      // Mantenha o bloqueio até TODOS os dedos saírem da tela + janela de segurança (>= 120ms)
      if (ptrsRef.current.size === 0) {
        touchInteractionStateRef.current = "POST_GESTURE_COOLDOWN";
        setTouchInteractionState("POST_GESTURE_COOLDOWN");
        const now = performance.now();
        gestureCooldownUntilRef.current = now + 150;
        gestureUntilRef.current = now + 200;
        dragCooldownUntilRef.current = now + 200;
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => {
          isMultiTouchGestureRef.current = false;
          touchInteractionStateRef.current = "IDLE";
          setTouchInteractionState("IDLE");
        }, 160);
      }
      return;
    }

    if (ptrsRef.current.size === 0 && touchInteractionStateRef.current === "SINGLE_POINTER") {
      touchInteractionStateRef.current = "IDLE";
      setTouchInteractionState("IDLE");
    }

    // 3. Filtro de Arraste de Câmera (Pan Threshold):
    // Se houve movimento de câmera (pan / pinça), nenhum clique de ferramenta ou Marco Geométrico pode ser disparado
    if (wasCameraPannedRef.current) {
      wasCameraPannedRef.current = false;
      panRef.current = null;
      orbitDragRef.current = null;
      previewGeometricMarkCandidateRef.current = null;
      setPreviewGeometricMarkCandidate(null);
      setMarquee(null);
      return;
    }

    panRef.current = null;
    if (orbitDragRef.current) {
      const startPt = orbitStartClientRef.current;
      orbitDragRef.current = null;
      orbitStartClientRef.current = null;

      // Se foi um toque/clique curto sem arrasto (< 7px) em vista 3D, executa Raycasting 3D de Sub-Elementos (Faces / Arestas / Corpos)
      if (
        ev &&
        startPt &&
        Math.hypot(ev.clientX - startPt.x, ev.clientY - startPt.y) < 7 &&
        (activeMode === "3d" || orbitProjection2D.isTilted) &&
        svgRef.current
      ) {
        const rect = svgRef.current.getBoundingClientRect();
        const localPt = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const topoScene = buildDirectTopology3DScene(drawable, thickness);
        const hit = hitTestSubElement3DInScreenSpace(
          localPt,
          topoScene,
          orbitProjection2D,
          view,
          18,
          subSelection3D.selectionScope ?? "auto",
        );
        const now = performance.now();
        const isDoubleTap =
          last3DTapRef.current !== null &&
          now - last3DTapRef.current.time < 360 &&
          Math.hypot(localPt.x - last3DTapRef.current.x, localPt.y - last3DTapRef.current.y) < 24;

        if (hit.kind !== "none" && hit.body) {
          const hitBody = hit.body;
          if (activeDirect3DTool === "loft_3d" || tool === "loft_3d") {
            triggerHaptic("selection");
            setLoftSectionIds((prev) =>
              prev.includes(hitBody.entityId)
                ? prev.filter((id) => id !== hitBody.entityId)
                : [...prev, hitBody.entityId],
            );
            setSelection([hitBody.entityId]);
            return;
          }
          if (
            isDoubleTap ||
            hitBody.extrudeHeightMm <= 0.05 ||
            activeDirect3DTool === "transform_3d" ||
            hit.kind === "body" ||
            subSelection3D.selectionScope === "body"
          ) {
            let nextBodyIds: string[] = [hitBody.bodyId];
            setSubSelection3D((prev) => {
              const currentBodies = prev.bodyIds;
              if (
                ev.shiftKey ||
                (activeDirect3DTool === "transform_3d" &&
                  !isDoubleTap &&
                  currentBodies.length > 0)
              ) {
                nextBodyIds = currentBodies.includes(hitBody.bodyId)
                  ? currentBodies.length > 1
                    ? currentBodies.filter((id) => id !== hitBody.bodyId)
                    : currentBodies
                  : [...currentBodies, hitBody.bodyId];
              } else {
                nextBodyIds = [hitBody.bodyId];
              }
              return {
                faceIds: [],
                edgeIds: [],
                bodyIds: nextBodyIds,
                vertexIds: [],
                selectionScope: prev.selectionScope ?? "body",
                activePivot3D: hitBody.pivot3D,
                activeHingeEdgeId: null,
              };
            });
            setSelection(nextBodyIds);
            if (
              activeDirect3DTool !== "fillet_3d" &&
              activeDirect3DTool !== "chamfer_3d" &&
              activeDirect3DTool !== "shell_3d" &&
              activeDirect3DTool !== "hole_3d"
            ) {
              setActiveDirect3DTool("transform_3d");
            }
            triggerHaptic("action");
            last3DTapRef.current = null;
          } else if (hit.kind === "vertex" && hit.vertex) {
            const vertexId = hit.vertex.vertexId;
            setSubSelection3D((prev) => {
              const sameBodyVertices = (prev.vertexIds ?? []).filter((vid) =>
                vid.startsWith(hitBody.bodyId),
              );
              const exists = sameBodyVertices.includes(vertexId);
              let nextVertices: string[];
              if (ev.shiftKey) {
                nextVertices = exists
                  ? sameBodyVertices.filter((id) => id !== vertexId)
                  : [...sameBodyVertices, vertexId];
                if (nextVertices.length === 0) nextVertices = [vertexId];
              } else {
                nextVertices = [vertexId];
              }
              return {
                faceIds: [],
                edgeIds: [],
                bodyIds: [],
                vertexIds: nextVertices,
                selectionScope: prev.selectionScope ?? "vertex",
                activePivot3D: hit.vertex!.position,
                activeHingeEdgeId: null,
              };
            });
            setSelection([hitBody.entityId]);
            setActiveDirect3DTool("chamfer_3d");
            triggerHaptic("selection");
            last3DTapRef.current = { x: localPt.x, y: localPt.y, time: now };
          } else if (hit.kind === "edge" && hit.edge) {
            const edgeId = hit.edge.edgeId;
            const hasFaceOnSameBody =
              subSelection3D.faceIds.length > 0 &&
              subSelection3D.faceIds.some((fid) => fid.startsWith(hitBody.bodyId));

            if (hasFaceOnSameBody && subSelection3D.edgeIds.length === 0 && !ev.shiftKey) {
              setSubSelection3D((prev) => ({
                ...prev,
                edgeIds: [edgeId],
                bodyIds: [],
                vertexIds: [],
                activePivot3D: hit.edge!.midpoint,
                activeHingeEdgeId: edgeId,
              }));
              setActiveDirect3DTool("rotate_axis_3d");
            } else {
              setSubSelection3D((prev) => {
                const sameBodyEdges = prev.edgeIds.filter((eid) =>
                  eid.startsWith(hitBody.bodyId),
                );
                const exists = sameBodyEdges.includes(edgeId);
                let nextEdges: string[];
                if (ev.shiftKey) {
                  nextEdges = exists
                    ? sameBodyEdges.filter((id) => id !== edgeId)
                    : [...sameBodyEdges, edgeId];
                  if (nextEdges.length === 0) nextEdges = [edgeId];
                } else {
                  nextEdges = [edgeId];
                }
                return {
                  faceIds: [],
                  edgeIds: nextEdges,
                  bodyIds: [],
                  vertexIds: [],
                  selectionScope: prev.selectionScope ?? "auto",
                  activePivot3D: hit.edge!.midpoint,
                  activeHingeEdgeId: null,
                };
              });
              if (
                activeDirect3DTool !== "fillet_3d" &&
                activeDirect3DTool !== "chamfer_3d"
              ) {
                setActiveDirect3DTool("fillet_3d");
              }
            }
            setSelection([hitBody.entityId]);
            triggerHaptic("selection");
            last3DTapRef.current = { x: localPt.x, y: localPt.y, time: now };
          } else if (hit.kind === "face" && hit.face) {
            const faceId = hit.face.faceId;
            setSubSelection3D((prev) => {
              const sameBody = prev.faceIds.some((fid) => fid.startsWith(hitBody.bodyId));
              const exists = prev.faceIds.includes(faceId);
              let nextFaces: string[];
              if (ev.shiftKey || (activeDirect3DTool === "shell_3d" && sameBody)) {
                nextFaces = exists
                  ? prev.faceIds.filter((id) => id !== faceId)
                  : [...prev.faceIds, faceId];
                if (nextFaces.length === 0) nextFaces = [faceId];
              } else {
                nextFaces = [faceId];
              }
              return {
                faceIds: nextFaces,
                edgeIds: [],
                bodyIds: [],
                vertexIds: [],
                selectionScope: prev.selectionScope ?? "auto",
                activePivot3D: hit.face!.centroid,
                activeHingeEdgeId: null,
              };
            });
            setSelection([hitBody.entityId]);
            if (
              activeDirect3DTool !== "shell_3d" &&
              activeDirect3DTool !== "rotate_axis_3d"
            ) {
              setActiveDirect3DTool(
                hitBody.extrudeHeightMm <= sheetThickness + 0.5
                  ? "extrude_3d"
                  : "offset_face_3d",
              );
            }
            triggerHaptic("selection");
            last3DTapRef.current = { x: localPt.x, y: localPt.y, time: now, faceId };
          }
        } else {
          setSubSelection3D({
            faceIds: [],
            edgeIds: [],
            bodyIds: [],
            vertexIds: [],
            selectionScope: "auto",
            activePivot3D: null,
            activeHingeEdgeId: null,
          });
          setSelection([]);
          setActiveDirect3DTool("select_3d");
          last3DTapRef.current = null;
        }
      }
      return;
    }

    if (isDraggingArrayCenterRef.current) {
      isDraggingArrayCenterRef.current = false;
      setIsArrayPickingCenter(false);
      triggerHaptic("action");
      return;
    }

    if (dragNode) {
      setDragNode(null);
      past.current = [...past.current, entities];
      setEntities((list) => syncAssociativeGeometricMarks(revalidateShared(list)));
      return;
    }
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (dragEntityRef.current) {
      const drag = dragEntityRef.current;
      const wasMoved = drag.moved && drag.unlocked;
      const baseSnapshot = drag.initialEntitiesSnapshot;
      const finalDelta = drag.effectiveDelta;
      const ids = drag.ids;
      dragEntityRef.current = null;
      isDraggingEntityRef.current = false;
      pendingDragEntitiesRef.current = null;

      if (wasMoved && Math.hypot(finalDelta.x, finalDelta.y) > 0.01) {
        past.current = [...past.current.slice(-49), baseSnapshot];
        future.current = [];
        setHistoryState({ canUndo: true, canRedo: false });
        const finalEntities = baseSnapshot.map((e) => {
          if (!ids.includes(e.id)) return e;
          const translated = translate(e, finalDelta.x, finalDelta.y);
          if (translated.params?.canonical2D && typeof translated.params.canonical2D === "object") {
            const entPlane = (translated.params.isoPlane as IsoPlane) || isoPlane;
            const canDelta = unprojectPointFromIsoPlane(
              { x: finalDelta.x, y: finalDelta.y },
              entPlane,
              { x: 0, y: 0 },
            );
            const origCan =
              (baseSnapshot.find((orig) => orig.id === e.id)?.params?.canonical2D as Entity) ??
              translated.params.canonical2D;
            translated.params = {
              ...translated.params,
              canonical2D: translate(origCan, canDelta.x, canDelta.y),
            };
          }
          return translated;
        });
        setEntities(syncAssociativeGeometricMarks(revalidateShared(finalEntities)));
        toast.success("Peça posicionada com sucesso.");
        triggerHaptic("tap");
        return;
      }
    }
    // Finaliza Swipe-to-Trim se o usuário arrastou uma cerca de corte sobre segmentos
    if ((tool === "smart_trim" || tool === "trim") && swipeTrimFenceRef.current.length >= 2) {
      const tx = computeSwipeTrimTransaction(swipeTrimFenceRef.current, entities);
      swipeTrimFenceRef.current = [];
      setSwipeTrimCutPreview([]);
      if (tx.trimmedCount > 0) {
        commit(tx.updatedEntities);
        triggerHaptic("action");
        toast.success(`Swipe-to-Trim: ${tx.trimmedCount} trecho(s) aparado(s) em 1 operação Undo.`);
        setSmartTrimPreview(null);
        return;
      }
    }
    swipeTrimFenceRef.current = [];
    setSwipeTrimCutPreview([]);

    // Fluxo de Toque com Prévia + Confirmação Explícita do MARCO GEOMÉTRICO (Seção 2.3):
    // Ao soltar o dedo sobre um ponto SNAP geométrico válido, exibe a Mini-Bolha de Confirmação
    // ([ ✓ Inserir Marco ] | [ ÷N Entre 2 Pontos ] | [ ✕ ]).
    // Se soltar no vazio (sem ponto SNAP de entidade real), NADA é criado!
    if (interactionGuideMode === "purple_ref" && (tool === "select" || tool === "node")) {
      const activeSmart =
        smartSnap && dist(cursorRef.current, smartSnap.p) <= 1e-3 ? smartSnap : null;
      const validCandidate =
        previewGeometricMarkCandidateRef.current ??
        inferValidGeometricMarkCandidate(
          cursorRef.current,
          entities,
          activeLayer,
          activeSmart,
          55 / view.k,
        );
      previewGeometricMarkCandidateRef.current = null;
      setPreviewGeometricMarkCandidate(null);

      if (validCandidate) {
        setMarquee(null);
        setPendingGeometricMarkConfirmation(validCandidate);
        triggerHaptic("selection");
        return;
      }
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
    if (draggingDraftGripIndex !== null) {
      setDraggingDraftGripIndex(null);
      triggerHaptic("tap");
      return;
    }

    const activeDraft = draftRef.current ?? draft;
    if (activeDraft && pending.length === 1 && tool !== "polyline" && tool !== "spline") {
      const box = boxOf(activeDraft);
      const empty = box.maxX - box.minX < 0.01 && box.maxY - box.minY < 0.01;
      if (!empty) {
        const p0 = pending[0]!;
        const p1 = cursorRef.current;
        const draftState =
          drawingProjection !== "isometric"
            ? createPendingDraftShapeState(tool, activeDraft, p0, p1, activeLayer, filletR, {
                rectMode,
                circleMode,
                polygonMode,
                polygonSides,
                polygonAcrossFlatsMm,
                slotMode,
                slotWidthMm,
              })
            : null;

        if (draftState) {
          setPendingDraftShape(draftState);
          lastCreatedVertexRef.current = draftState.p1;
          setSelection([]);
          setMobileEditorOpenManual(false);
          triggerHaptic("tap");
        } else {
          const hasAnyLockedConstraint =
            lockedConstraints.lockedL != null ||
            lockedConstraints.lockedDx != null ||
            lockedConstraints.lockedDy != null ||
            lockedConstraints.lockedDist != null;
          const baseFinal: Entity =
            !activeDraft.id || activeDraft.id === "draft" || activeDraft.id.startsWith("draft-")
              ? { ...activeDraft, id: uid() }
              : activeDraft;
          const finalEntity: Entity = hasAnyLockedConstraint
            ? {
                ...baseFinal,
                params: {
                  ...baseFinal.params,
                  lockedConstraints: { ...lockedConstraints },
                },
              }
            : baseFinal;
          commit((e) => [...e, finalEntity]);
          lastCreatedVertexRef.current = p1;
          setSelection([]);
          setMobileEditorOpenManual(false);

          if (dualToolSecondary === "dim") {
            const dim = makeDimension("aligned", [{ kind: "entity", id: finalEntity.id }], 20);
            setDims((list) => [...list, dim]);
            toast.success("Cota técnica gerada automaticamente via Dual Tool.");
            if (!dualToolPinned) setDualToolSecondary(null);
          } else if (dualToolSecondary === "smart_trim") {
            setTool("smart_trim");
            toast.info("Dual Tool: selecione o trecho a aparar.");
          }
        }
      }
      setDraft(null);
      setPending([]);
    }
  };

  /* ---------------------------------------------- micro-ajuste incremental (nudge) */
  const handleNudge = useCallback(
    (dir: NudgeDirection, customStep?: number) => {
      const step = customStep ?? nudgeStepMm;
      const delta = computeNudgeDelta(dir, step, drawingProjection, isoPlane);

      // 1. Se houver peças selecionadas na ferramenta Selecionar sem traço pendente, move as peças selecionadas
      if (tool === "select" && selection.length > 0 && pending.length === 0) {
        commit((list) =>
          revalidateShared(
            list.map((e) => {
              if (!selection.includes(e.id)) return e;
              const translated = translate(e, delta.x, delta.y);
              if (translated.params?.canonical2D && typeof translated.params.canonical2D === "object") {
                const entPlane = (translated.params.isoPlane as IsoPlane) || isoPlane;
                const canDelta = unprojectPointFromIsoPlane(delta, entPlane, { x: 0, y: 0 });
                translated.params = {
                  ...translated.params,
                  canonical2D: translate(translated.params.canonical2D as Entity, canDelta.x, canDelta.y),
                };
              }
              return translated;
            }),
          ),
        );
        const nextC = {
          x: Number((cursor.x + delta.x).toFixed(4)),
          y: Number((cursor.y + delta.y).toFixed(4)),
        };
        setCursor(nextC);
        setLoupeCadPos(nextC);
        return;
      }

      // 2. Desloca o cursor ativo com precisão cirúrgica e atualiza o draft/cotas em tempo real
      const basePt = (smartSnap ?? snapHit)?.p ?? cursor;
      const rawNextCursor = {
        x: Number((basePt.x + delta.x).toFixed(4)),
        y: Number((basePt.y + delta.y).toFixed(4)),
      };
      const anchorForConstraint =
        interactionGuideMode === "purple_ref" && temporaryOrigin
          ? temporaryOrigin.p
          : pending.length > 0
            ? pending[pending.length - 1]!
            : null;
      const nextCursor = anchorForConstraint
        ? applyDimensionalConstraintsToPoint(
            anchorForConstraint,
            rawNextCursor,
            lockedConstraints,
          )
        : rawNextCursor;
      setSmartSnap(null);
      setSnapHit(null);
      setCursor(nextCursor);
      setLoupeCadPos(nextCursor);

      if (activeEdge) {
        setLiveDimensions(DynamicDimensionInteraction.generateEdgeOffsetDimensions(nextCursor, activeEdge, activeEdgeSide));
      } else {
        setLiveDimensions([]);
      }

      if (tool === "polyline" && pending.length > 0) {
        const lastPoint = pending[pending.length - 1]!;
        setDraft({
          id: uid(),
          layer: activeLayer,
          type: "line",
          x1: lastPoint.x,
          y1: lastPoint.y,
          x2: nextCursor.x,
          y2: nextCursor.y,
        });
      } else if (tool === "arc" && pending.length > 0) {
        const [a, b] = pending;
        if (pending.length === 1 && a) {
          setDraft({
            id: uid(),
            layer: activeLayer,
            type: "line",
            x1: a.x,
            y1: a.y,
            x2: nextCursor.x,
            y2: nextCursor.y,
          });
        } else if (a && b) {
          setDraft(arcFrom3(a, b, nextCursor, activeLayer));
        }
      } else if (tool === "measure" && pending.length === 1) {
        setLiveMeasure({ a: pending[0]!, b: nextCursor });
      } else if (pending.length === 1) {
        setDraft(buildDraft(tool, pending[0]!, nextCursor, activeLayer, filletR, drawingProjection, isoPlane));
      }
    },
    [
      nudgeStepMm,
      drawingProjection,
      isoPlane,
      tool,
      selection,
      pending,
      commit,
      cursor,
      smartSnap,
      snapHit,
      activeEdge,
      activeEdgeSide,
      temporaryOrigin,
      activeLayer,
      filletR,
      interactionGuideMode,
      lockedConstraints,
    ],
  );

  const handleConfirmNudgePoint = useCallback(() => {
    const p = (smartSnap ?? snapHit)?.p ?? cursor;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;

    if (tool === "point") {
      commit((e) => [...e, { id: uid(), layer: activeLayer, type: "point", x: p.x, y: p.y }]);
      toast.success(`Ponto fixado em (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm`);
      return;
    }

    if (tool === "polyline") {
      if (shouldClosePolyline(pending, p, 10 / view.k)) {
        finishPolyline(true);
        return;
      }
      setPending((q) => [...q, p]);
      setDraft({
        id: uid(),
        layer: activeLayer,
        type: "line",
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
      });
      return;
    }

    if (tool === "arc") {
      const q = [...pending, p];
      if (q.length === 3) {
        const [a, b, c] = q as [Vec2, Vec2, Vec2];
        const arc = arcFrom3(a, b, c, activeLayer);
        if (arc) commit((e) => [...e, arc]);
        setPending([]);
        setDraft(null);
      } else {
        setPending(q);
      }
      return;
    }

    if (tool === "measure") {
      const q = [...pending, p];
      if (q.length === 2) {
        const m = { a: q[0]!, b: q[1]! };
        setMeasures((list) => [...list, m]);
        setPending([]);
        setLiveMeasure(null);
      } else {
        setPending(q);
      }
      return;
    }

    if (
      tool === "line" ||
      tool === "rect" ||
      tool === "rrect" ||
      tool === "circle" ||
      tool === "ellipse" ||
      tool === "polygon" ||
      tool === "slot"
    ) {
      if (pending.length === 0) {
        setPending([p]);
        setDraft(buildDraft(tool, p, p, activeLayer, filletR, drawingProjection, isoPlane));
        toast.info(`Origem fixada em (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm. Ajuste o ponto final.`);
      } else {
        const built = buildDraft(tool, pending[0]!, p, activeLayer, filletR, drawingProjection, isoPlane);
        if (built) {
          const box = boxOf(built);
          const empty = box.maxX - box.minX < 0.01 && box.maxY - box.minY < 0.01;
          if (!empty) {
            commit((e) => [...e, { ...built, id: uid() }]);
          }
        }
        setPending([]);
        setDraft(null);
      }
    }
  }, [
    smartSnap,
    snapHit,
    cursor,
    tool,
    commit,
    activeLayer,
    pending,
    view.k,
    finishPolyline,
    filletR,
    drawingProjection,
    isoPlane,
  ]);

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
        copySelected();
        return;
      }
      if (meta && ev.key.toLowerCase() === "g") {
        ev.preventDefault();
        if (ev.shiftKey) {
          handleUngroupSelection();
        } else {
          handleGroupSelection();
        }
        return;
      }
      if (meta && ev.key.toLowerCase() === "v") {
        ev.preventDefault();
        const items = loadGlobalClipboard();
        if (items.length > 0) {
          const item = items[0];
          const cur = cursorRef.current;
          const target =
            Number.isFinite(cur.x) && Number.isFinite(cur.y)
              ? { x: cur.x, y: cur.y }
              : {
                  x: (canvasSize.w / 2 - view.tx) / view.k,
                  y: (canvasSize.h / 2 - view.ty) / view.k,
                };
          const result = instantiateClipboardItemAt(item, target, groups);
          commit((list) => [...list, ...result.newEntities]);
          setGroups(result.newGroups);
          setSelection(result.newIds);
          triggerHaptic("action");
          toast.success(`✓ Colado: ${item.title}`);
        } else if (clipboardRef.current) {
          const cur = cursorRef.current;
          const pasted = pasteClipboard(clipboardRef.current, { x: cur.x + 10, y: cur.y + 10 });
          commit((list) => [...list, ...pasted.entities]);
          setGroups((list) => [...list, ...pasted.groups]);
          setSelection(pasted.ids);
          toast.success("✓ Objeto colado.");
        }
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
        if (pendingDraftShapeRef.current) {
          setPendingDraftShape(null);
          setDraggingDraftGripIndex(null);
          triggerHaptic("tap");
          toast.info("Forma pendente descartada.");
          return;
        }
        setPending([]);
        setDraft(null);
        setSelection([]);
        setMeasures([]);
        setFilletPreview(null);
        setChamferPreview(null);
        setScaleDialogOpen(false);
        setCenterDialogOpen(false);
        setIsOrbitToolActive(false);
        setActiveArrayType(null);
        setIsArrayPickingCenter(false);
        setTool("select");
      }
      if (ev.key === "Enter" && pendingDraftShapeRef.current) {
        ev.preventDefault();
        commitPendingDraftShape(pendingDraftShapeRef.current);
        triggerHaptic("success");
        return;
      }
      if (tool === "polyline") {
        if (ev.key === "Enter") {
          ev.preventDefault();
          finishPolyline(false);
          return;
        }
        if (ev.key.toLowerCase() === "c" && pending.length >= 3) {
          ev.preventDefault();
          finishPolyline(true);
          return;
        }
      }
      if (ev.key === "F3") {
        ev.preventDefault();
        fitTo(entities);
      }
      if (ev.key === "F4") {
        ev.preventDefault();
        setView({ tx: 80, ty: 80, k: 1 });
      }
      if (ev.key === "F5" || (ev.ctrlKey && ev.key.toLowerCase() === "e")) {
        ev.preventDefault();
        setDrawingProjection("orthographic");
        transitionTo2D();
        return;
      }
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        const dir: NudgeDirection =
          ev.key === "ArrowUp"
            ? "up"
            : ev.key === "ArrowDown"
              ? "down"
              : ev.key === "ArrowLeft"
                ? "left"
                : "right";
        const step = ev.shiftKey ? 10 : ev.altKey ? 0.1 : nudgeStepMm;
        handleNudge(dir, step);
        return;
      }
      if (ev.key === "Enter" && tool !== "polyline" && tool !== "select") {
        ev.preventDefault();
        handleConfirmNudgePoint();
        return;
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
    nudgeStepMm,
    handleNudge,
    handleConfirmNudgePoint,
    handleManualSave,
    handleGroupSelection,
    handleUngroupSelection,
  ]);

  /* ------------------------------------------------------------- ações */
  const applySelection = (fn: (e: Entity) => Entity) =>
    commit((list) => revalidateShared(list.map((e) => (selection.includes(e.id) ? fn(e) : e))));

  const selBox = useMemo(() => bbox(selected), [selected]);
  /* leitura fora do ciclo de render: medir nunca dispara novo render */
  const selBoxRef = useRef<Box | null>(null);
  selBoxRef.current = selBox;
  const center: Vec2 =
    selBox &&
    Number.isFinite(selBox.minX) &&
    Number.isFinite(selBox.maxX) &&
    Number.isFinite(selBox.minY) &&
    Number.isFinite(selBox.maxY)
      ? { x: (selBox.minX + selBox.maxX) / 2, y: (selBox.minY + selBox.maxY) / 2 }
      : { x: 0, y: 0 };

  const onImportConfirm = (next: Entity[]) => {
    commit((e) => [...e, ...next]);
    requestAnimationFrame(() => fitTo([...entities, ...next]));
  };

  const pickTool = useCallback(
    (id: Tool) => {
      // Desativa o modo de arraste de Órbita 3D ao escolher qualquer ferramenta na barra lateral,
      // mantendo a perspectiva 3D escolhida na tela (Seção 5.3)
      setIsOrbitToolActive(false);
      orbitDragRef.current = null;
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

  const copySelected = handleCopySelection;

  /** Grupo ativo na seleção (badge + botão de isolar membro). */
  const activeGroup = useMemo(() => {
    const gid = selected.find((e) => e.group)?.group;
    return gid ? (groups.find((g) => g.id === gid) ?? null) : null;
  }, [selected, groups]);

  const selectionActions = (
    <>
      {selection.length >= 2 && (
        <IconBtn
          label="Agrupar Peça (Ctrl+G)"
          onClick={handleGroupSelection}
          icon={Boxes}
          flat
        />
      )}
      {(activeGroup || selected.some((e) => e.group)) && (
        <IconBtn
          label="Desagrupar (Ctrl+Shift+G)"
          onClick={handleUngroupSelection}
          icon={Ungroup}
          flat
        />
      )}
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
    const parseRgbaColor = (
      colorStr: string | undefined | null,
      fallbackRgb: [number, number, number],
      fallbackAlpha: number,
    ): { rgb: [number, number, number]; alpha: number } => {
      if (!colorStr || typeof colorStr !== "string") {
        return { rgb: fallbackRgb, alpha: fallbackAlpha };
      }
      const m = colorStr.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i,
      );
      if (m) {
        const a = m[4] !== undefined ? Number(m[4]) : fallbackAlpha;
        return {
          rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
          alpha: Number.isFinite(a) ? a : fallbackAlpha,
        };
      }
      const clean = colorStr.replace(/^#/, "").trim();
      if (clean.length === 6) {
        const n = parseInt(clean, 16);
        if (Number.isFinite(n)) {
          return {
            rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255],
            alpha: fallbackAlpha,
          };
        }
      }
      return { rgb: fallbackRgb, alpha: fallbackAlpha };
    };

    const minorParsed = parseRgbaColor(
      themeColors.gridMinor,
      isDark ? [148, 163, 184] : [15, 23, 42],
      isDark ? 0.035 : 0.04,
    );
    const majorParsed = parseRgbaColor(
      themeColors.gridMajor,
      isDark ? [148, 163, 184] : [15, 23, 42],
      isDark ? 0.08 : 0.09,
    );
    const outerMinorParsed = parseRgbaColor(
      themeColors.gridOuterMinor,
      minorParsed.rgb,
      minorParsed.alpha * 0.65,
    );
    const outerMajorParsed = parseRgbaColor(
      themeColors.gridOuterMajor,
      majorParsed.rgb,
      majorParsed.alpha * 0.65,
    );

    const intSecOpacity = Math.max(0, minorParsed.alpha * gridConfig.subFade);
    const intMajOpacity = Math.max(0, majorParsed.alpha * gridConfig.majorFade);
    const intMacOpacity = Math.min(0.16, majorParsed.alpha * 1.25);

    // Seção 6.4: Grade externa com opacidade fixa em 65% da grade interna
    const outerFactor = themeColors.gridOuterOpacityFactor ?? 0.65;
    const extSecOpacity = intSecOpacity * outerFactor;
    const extMajOpacity = intMajOpacity * outerFactor;
    const extMacOpacity = intMacOpacity * outerFactor;

    return {
      secondaryStroke: `rgba(${minorParsed.rgb[0]}, ${minorParsed.rgb[1]}, ${minorParsed.rgb[2]}, ${intSecOpacity.toFixed(4)})`,
      secondaryWidth: 0.75,
      majorStroke: `rgba(${majorParsed.rgb[0]}, ${majorParsed.rgb[1]}, ${majorParsed.rgb[2]}, ${intMajOpacity.toFixed(4)})`,
      majorWidth: 1.0,
      macroStroke: `rgba(${majorParsed.rgb[0]}, ${majorParsed.rgb[1]}, ${majorParsed.rgb[2]}, ${intMacOpacity.toFixed(4)})`,
      macroWidth: 1.15,
      extSecondaryStroke: `rgba(${outerMinorParsed.rgb[0]}, ${outerMinorParsed.rgb[1]}, ${outerMinorParsed.rgb[2]}, ${extSecOpacity.toFixed(4)})`,
      extMajorStroke: `rgba(${outerMajorParsed.rgb[0]}, ${outerMajorParsed.rgb[1]}, ${outerMajorParsed.rgb[2]}, ${extMajOpacity.toFixed(4)})`,
      extMacroStroke: `rgba(${outerMajorParsed.rgb[0]}, ${outerMajorParsed.rgb[1]}, ${outerMajorParsed.rgb[2]}, ${extMacOpacity.toFixed(4)})`,
      axisX: themeColors.axisX,
      axisY: themeColors.axisY,
      axisInfinite: isDark ? "rgba(148, 163, 184, 0.11)" : "rgba(15, 23, 42, 0.12)",
      axisWidth: 1.75,
      originFill: "#DC143C",
      originRing: isDark ? "rgba(236, 239, 244, 0.92)" : "rgba(15, 20, 26, 0.88)",
      originText: "#DC143C",
    };
  }, [isDark, gridConfig, themeColors, themeVersion]);

  const isMobile = useIsMobile();
  const verticalLayout = useVerticalLayout();
  const isLandscape = !verticalLayout.isVerticalCompactActive;

  // Janela lateral direita estruturada do CHAMFER (Propriedades / Camadas / Corte / Cotas)
  // Inicia sempre recolhida (open = false) para preservar área máxima de desenho; abre exclusivamente pela seta (<) ou botões da doca (Seção 1.3)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<ChamferSidebarTab>("propriedades");
  // Bottom Sheet Compacto em modo retrato para painéis longos (Propriedades, Camadas, Corte, Cotas, Eng. Reversa)
  const [portraitDrawerOpen, setPortraitDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isLandscape) {
      setRightSidebarOpen(false);
    } else {
      setPortraitDrawerOpen(false);
    }
  }, [isLandscape]);

  const [mobileEditorOpenManual, setMobileEditorOpenManual] = useState(false);
  const [activeEditingProp, setActiveEditingProp] = useState<{
    key: string;
    label: string;
    value: number;
    unit: string;
  } | null>(null);

  // Entidade única selecionada
  const selectedEntity = useMemo(() => {
    if (selected.length === 1) {
      return selected[0] ?? null;
    }
    return null;
  }, [selected]);

  // Card flutuante grande sobre o meio do canvas desativado (Seção 1.2):
  // Todas as propriedades foram unificadas no painel lateral direito PROPRIEDADES, mantendo no canvas apenas a pílula rápida horizontal de seleção.
  const mobileEditorOpen = false;

  // Enquadramento Inteligente do CAD (Regra 7)
  useSmartFraming({
    isOpen: mobileEditorOpen,
    selectedEntity,
    view,
    setView,
    canvasWidth: canvasSize.w,
    canvasHeight: canvasSize.h,
  });

  // Contextual CAD: ao selecionar entidade(s), foca na aba Propriedades (exceto se o usuário estiver na bancada ENG. REV.)
  useEffect(() => {
    if (selected.length > 0) {
      setActiveSidebarTab((prev) =>
        prev === "propriedades" || prev === "eng_rev" ? prev : "propriedades",
      );
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
            <div className="flex items-center justify-between gap-1 p-1 bg-cyan-950/40 border border-cyan-500/30 rounded-lg">
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] text-cyan-300 font-bold flex items-center gap-1">
                <Boxes className="size-3" />
                {activeGroup.name}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUngroupSelection}
                  className="rounded-lg bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 font-mono text-[9px] text-amber-300 hover:bg-amber-900/80 transition-colors font-semibold"
                  title="Desagrupar peça (Ctrl+Shift+G)"
                >
                  Desagrupar
                </button>
                <button
                  type="button"
                  onClick={() => setSelection(selection.slice(0, 1))}
                  className="rounded-lg border border-line px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
                >
                  Isolar
                </button>
              </div>
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
            onOpenIsoConvert={() => setIsoPieceBuilderOpen(true)}
          />
          <div className="flex flex-wrap gap-1 border-t border-line pt-2">{selectionActions}</div>
        </div>
      )}
    </aside>
  ) : null;

  const topologyScene3D = useMemo(
    () => buildDirectTopology3DScene(drawable, thickness),
    [drawable, thickness],
  );

  const selectionText = useMemo(() => {
    if (
      (activeMode === "3d" || orbitProjection2D.isTilted) &&
      (subSelection3D.edgeIds.length > 0 ||
        subSelection3D.faceIds.length > 0 ||
        subSelection3D.bodyIds.length > 0)
    ) {
      const telemetry3D = formatSubElementTelemetry3D(topologyScene3D, subSelection3D);
      if (telemetry3D) return telemetry3D;
    }
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
  }, [
    activeMode,
    orbitProjection2D.isTilted,
    subSelection3D,
    topologyScene3D,
    selected,
  ]);

  const operationFeedback = useMemo(() => {
    if (activeArrayType === "polar") {
      return {
        command: "PADRÃO CIRCULAR (POLAR)",
        instruction: isArrayPickingCenter
          ? "Toque no canvas para definir o centro do padrão polar (PCD)"
          : `${arrayPolarParams.count} furos em ${arrayPolarParams.totalAngleDeg}° — altere valores no topo ou clique em Aplicar`,
      };
    }
    if (activeArrayType === "linear") {
      return {
        command: "PADRÃO LINEAR (ARRAY)",
        instruction: `Grade ${arrayLinearParams.cols}×${arrayLinearParams.rows} (passo ${arrayLinearParams.dx}×${arrayLinearParams.dy} mm) — altere valores ou clique em Aplicar`,
      };
    }
    return getOperationFeedback(tool, pending.length, selected.length);
  }, [activeArrayType, isArrayPickingCenter, arrayPolarParams, arrayLinearParams, tool, pending.length, selected.length]);

  // Pré-aquece o chunk do CHAMFER INTENT e do CAD 3D Stage em background após o canvas 2D estar interativo
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChamferSemanticPalette();
      void import("@/components/lab2d/Cad3DStage");
    }, 180);
    return () => window.clearTimeout(timer);
  }, []);

  // Memoiza a geometria calculada das cotas associativas e automáticas (evita recálculo a 60Hz no pointermove)
  const drawnDims = useMemo(
    () => dims.map((d) => ({ d, draw: dimensionDraw(d, entities) })),
    [dims, entities],
  );

  const autoDimsList = useMemo(
    () => (showDims ? autoDimensions(drawable) : []),
    [showDims, drawable],
  );

  const pendingShapeSpec = useMemo(() => {
    const activeDraft = draftRef.current ?? draft;
    if (activeDraft && pending.length > 0) {
      if (activeDraft.type === "circle") {
        return { type: "circle", center: { x: activeDraft.cx, y: activeDraft.cy }, r: activeDraft.r };
      }
      if (activeDraft.type === "rect") {
        return {
          type: "rect",
          width: Math.abs(activeDraft.x2 - activeDraft.x1),
          height: Math.abs(activeDraft.y2 - activeDraft.y1),
        };
      }
    }
    return null;
  }, [draft, pending]);

  return (
    <div
      ref={wrapRef}
      style={{
        ...cssVariables,
        backgroundColor: "var(--chamfer-bg-root)",
        color: "var(--chamfer-text-primary)",
      }}
      className={cn(
        "chamfer-theme-fade-root chamfer-theme-fade-2s fixed inset-0 z-50 flex h-[100dvh] w-[100vw] max-w-none flex-col overflow-hidden rounded-none select-none",
        isLandscape ? "gap-1 p-1" : "gap-0 p-0",
        isMestre && "glow-ring",
      )}
    >
      {/* REGIÃO A — HEADER SUPERIOR DEFINITIVO CAD (EM MODO RETRATO: BARRA COMPACTA 48PX ESTILO LIGHTROOM) */}
      {!focus && !isLandscape && (
        <ChamferPortraitTopBar
          isDark={isDark}
          topBarHeightPx={verticalLayout.chromeHeights.topBarPx}
          viewportWidth={verticalLayout.viewportWidth}
          projectName={project?.name ?? "Projeto 26"}
          thickness={thickness}
          onThicknessChange={setThickness}
          plans={project?.plans.map((p) => ({ id: p.id, name: p.name })) ?? [{ id: planId, name: "P01" }]}
          activePlanId={planId}
          onSelectPlan={(nextPlanId) => {
            if (!project || nextPlanId === planId) return;
            const targetPlan = project.plans.find((x) => x.id === nextPlanId);
            if (!targetPlan) return;
            setProject((prev) =>
              prev
                ? {
                    ...prev,
                    plans: prev.plans.map((x) =>
                      x.id === planId
                        ? { ...x, entities, groups, dims, cad3dTreeJson, revEng: revEngData }
                        : x,
                    ),
                  }
                : prev,
            );
            setPlanId(targetPlan.id);
            const seenPlanIds = new Set<string>();
            const sanitizedPlanEntities = (targetPlan.entities ?? []).map((ent) => {
              let entId = ent.id;
              if (!entId || entId === "draft" || entId.startsWith("draft-") || seenPlanIds.has(entId)) {
                entId = uid();
              }
              seenPlanIds.add(entId);
              return ent.id === entId ? ent : { ...ent, id: entId };
            });
            setEntities(sanitizedPlanEntities);
            setGroups(targetPlan.groups ?? []);
            setDims(targetPlan.dims ?? []);
            setCad3dTreeJson(targetPlan.cad3dTreeJson);
            setRevEngData(sanitizeRevEngPlanData(targetPlan.revEng));
            setRevEngCanvasMode("none");
            setRevEngPickPoints([]);
            setRevEngFittedPreview(null);
            setSelection([]);
            past.current = [];
            future.current = [];
          }}
          onCreatePlan={() => {
            if (!project) return;
            const plan = emptyPlan(project.plans.length);
            plan.name = planLabel(project.plans.length);
            const next: Project = {
              ...project,
              plans: [
                ...project.plans.map((x) =>
                  x.id === planId
                    ? { ...x, entities, groups, dims, cad3dTreeJson, revEng: revEngData }
                    : x,
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
            setCad3dTreeJson(undefined);
            setRevEngData(createDefaultRevEngPlanData());
            setRevEngCanvasMode("none");
            setRevEngPickPoints([]);
            setRevEngFittedPreview(null);
            setSelection([]);
            toast.success(`${plan.name} criado.`);
          }}
          onOpenNewProjectDialog={() => {
            setNewProjectName(`Projeto ${Date.now().toString().slice(-4)}`);
            setNewProjectDialogOpen(true);
          }}
          saveStatus={saveStatus}
          onManualSave={handleManualSave}
          onLeaveEditor={() => {
            if (
              saveStatus === "pendente" &&
              (chamferSettings.autoSave || chamferSettings.recoveryEnabled)
            ) {
              performSave();
            }
            leaveEditor();
          }}
          activeMode={activeMode}
          onSelect2D={() => transitionTo2D()}
          onSelect3D={() => transitionTo3D("3d")}
          drawingProjection="orthographic"
          onSetDrawingProjection={() => {
            setDrawingProjection("orthographic");
            transitionTo2D();
          }}
          isoPlane={isoPlane}
          onSelectIsoPlane={(p) => {
            setIsoPlane(p);
            toast.info(`Plano Isométrico: ${ISO_PLANES[p].label}`);
          }}
          isOrbitToolActive={isOrbitToolActive}
          isOrbitTilted={orbitProjection2D.isTilted}
          onToggleOrbitTool={(next) => {
            const target = typeof next === "boolean" ? next : !isOrbitToolActive;
            setIsOrbitToolActive(target);
            if (target) {
              if (isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
                animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
              }
              toast.info("Modo Órbita 3D ativo — arraste na área de desenho para rotacionar a perspectiva.");
            }
          }}
          renderStyle3D={renderStyle3D}
          onChangeRenderStyle3D={(style) => {
            setRenderStyle3D(style);
            if (style !== "wireframe" && isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
              setIsOrbitToolActive(true);
              animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
            }
          }}
          canUndo={historyState.canUndo || pending.length > 0}
          canRedo={historyState.canRedo}
          onUndo={undo}
          onRedo={redo}
          onOpenVision={() => setVisionOpen(true)}
          onOpenIntent={() => setQuickCommandOpen(true)}
          onOpenWorkshop={() => setIntegratedWorkshopOpen(true)}
          onOpenExport={() => setExportOpen(true)}
          onOpenCnc={() => setCncOpen(true)}
          onCenterPiece={(moveGeometry) => centerPiece(moveGeometry)}
          onFitWorkspace={() => fitFrame()}
          onOpenPresets={() => setPresetsModalOpen(true)}
          onOpenTechnicalSheet={() => setTechnicalSheetModalOpen(true)}
          onOpenTopologyHealth={() => setTopologyHealthOpen(true)}
          onOpenVariables={() => setVariablesModalOpen(true)}
          onVerifyGeometry={() => {
            const found = verify(entities);
            setIssues(found);
            if (found.length) {
              toast.warning(`${found.length} problemas encontrados`);
            } else {
              toast.success("Geometria válida");
            }
          }}
          onOptimizeGeometry={() => {
            const res = optimize(entities);
            commit(res.entities);
            toast.success(`${res.removed + res.tiny} entidades limpas`);
          }}
          showDims={showDims}
          onToggleShowDims={() => setShowDims((s) => !s)}
          onToggleTheme={toggleTheme}
          focus={focus}
          onToggleFullscreen={toggleFullscreen}
          layoutPreference={verticalLayout.layoutPreference}
          onChangeLayoutPreference={(pref) => {
            verticalLayout.setLayoutPreference(pref);
            toast.info(
              pref === "compact"
                ? "Layout Vertical Compacto ativado."
                : "Layout Clássico ativado.",
            );
          }}
          activeLayer={activeLayer}
          activeStrokeColor={activeStrokeColor}
          onSelectColorAndLayer={handleSelectColorAndLayer}
          onOpenProjectSettings={() => setProjectSettingsOpen(true)}
        />
      )}

      {!focus && isLandscape && (
        <header
          ref={topBarRef}
          onPointerDown={handleTopBarPointerDown}
          onPointerMove={handleTopBarPointerMove}
          onPointerUp={handleTopBarPointerUp}
          onPointerCancel={handleTopBarPointerUp}
          onWheel={handleTopBarWheel}
          style={{
            backgroundColor: "var(--chamfer-bar-bg)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
          className={cn(
            "chamfer-theme-fade-2s flex h-12 shrink-0 w-full items-center justify-between gap-3 border-b px-3 shadow-xs backdrop-blur-md select-none",
            "overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing",
          )}
        >
          {/* LADO ESQUERDO: [ ← SAIR ] + [ CHAMFER • NOME DO PROJETO ] + [ DOSSIÊ ] */}
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
              aria-label="Sair do editor e voltar aos Projetos"
              title="Sair do editor (salvar e voltar)"
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border-strong)",
                color: "var(--chamfer-text-primary)",
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors whitespace-nowrap hover:brightness-110"
            >
              <ArrowLeft className="size-3.5 shrink-0" /> SAIR
            </button>

            <span
              style={{ backgroundColor: "var(--chamfer-border-strong)" }}
              className="h-4 w-px shrink-0"
            />

            <div className="flex items-center gap-1.5 min-w-0">
              <span
                style={{ color: "var(--chamfer-accent)" }}
                className="font-mono text-xs font-bold tracking-wider shrink-0"
              >
                CHAMFER
              </span>
              {project && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    setNewProjectName(`Projeto ${Date.now().toString().slice(-4)}`);
                    setNewProjectDialogOpen(true);
                  }}
                  style={{ textOverflow: "ellipsis", color: "var(--chamfer-text-primary)" }}
                  className="inline-block font-mono text-[11px] font-semibold transition-colors truncate whitespace-nowrap max-w-[160px] sm:max-w-[200px]"
                  title={`Documento: ${project.name} (clique para alternar/criar)`}
                >
                  • {project.name}
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
                  style={{
                    backgroundColor: "var(--chamfer-accent-soft)",
                    borderColor: "var(--chamfer-accent-border)",
                    color: "var(--chamfer-accent)",
                  }}
                  className="hidden lg:inline rounded-md px-2 py-0.5 font-mono text-[9px] tracking-wider uppercase border truncate max-w-[120px]"
                >
                  {dossier.partCode || dossier.partName}
                </button>
              )}
            </div>
          </div>

          {/* REGIÃO CENTRAL: CONTROLE PRINCIPAL DE MUDANÇA DE AMBIENTE [ 2D SKETCH | 3D SÓLIDO ] E MODO [ ORTO 2D | ISO 2D ] */}
          <div className="flex shrink-0 items-center justify-center gap-1.5">
            <div
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border-strong)",
              }}
              className="flex items-center rounded-lg border p-0.5 shadow-xs"
            >
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  transitionTo2D();
                }}
                style={
                  activeMode === "2d"
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : { color: "var(--chamfer-text-secondary)" }
                }
                className="rounded-md px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors"
              >
                2D SKETCH
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  transitionTo3D("3d");
                }}
                style={
                  activeMode === "3d"
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : { color: "var(--chamfer-text-secondary)" }
                }
                className="rounded-md px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors"
              >
                CAD 3D
              </button>
            </div>

            {/* PÍLULA INDIVIDUAL DE PROJEÇÃO: [ ORTO 2D ] (SEM BOTÃO ISO 2D) */}
            {!solidOpen && (
              <div
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-border-strong)",
                }}
                className="flex items-center rounded-lg border p-0.5 shadow-xs shrink-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setDrawingProjection("orthographic");
                    transitionTo2D();
                  }}
                  style={
                    !orbitProjection2D.isTilted && activeMode === "2d"
                      ? {
                          backgroundColor: "var(--chamfer-accent-soft)",
                          color: "var(--chamfer-text-primary)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className="rounded-md px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors"
                  title="Modo Ortogonal 2D (Eixos X/Y convencionais a 0°)"
                >
                  ORTO 2D
                </button>
              </div>
            )}

            {/* COMANDO DE BARRA SUPERIOR: ⟳ ÓRBITA 3D (ATIVO EM 2D SKETCH E CAD 3D) */}
            <ChamferOrbit3DPopover
              azimuthDeg={orbitAzimuthDeg}
              elevationDeg={orbitElevationDeg}
              activePreset={orbitPreset}
              isOrbitToolActive={isOrbitToolActive}
              onToggleOrbitTool={(next) => {
                const target = typeof next === "boolean" ? next : !isOrbitToolActive;
                setIsOrbitToolActive(target);
                if (target) {
                  if (isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
                    animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
                  }
                  toast.info(
                    "Modo Órbita 3D ativo — arraste na área de desenho para rotacionar a perspectiva.",
                  );
                }
              }}
              onSelectPreset={(presetId) => {
                if (presetId === "top") {
                  setActiveMode("2d");
                }
                handleSelectOrbitPreset(presetId);
              }}
              isDark={isDark}
              renderStyle3D={renderStyle3D}
              onChangeRenderStyle3D={setRenderStyle3D}
              wireframe3DStyle={wireframe3DStyle}
              onChangeWireframe3DStyle={setWireframe3DStyle}
            />

            {/* SELETOR DIRETO DE REPRESENTAÇÃO 3D NA BARRA SUPERIOR: [ SÓLIDO | SOMB | ARAME ] */}
            {(activeMode === "3d" || isOrbitToolActive || orbitProjection2D.isTilted) && (
              <div
                data-testid="chamfer-topbar-3d-style-selector"
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-border-strong)",
                }}
                className="flex items-center rounded-lg border p-0.5 shadow-xs"
              >
                <button
                  type="button"
                  data-testid="chamfer-topbar-style-solid-edges"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setRenderStyle3D("shaded-edges");
                    if (isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
                      setIsOrbitToolActive(true);
                      animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
                    }
                  }}
                  style={
                    renderStyle3D === "shaded-edges"
                      ? {
                          backgroundColor: "var(--chamfer-accent)",
                          color: "var(--chamfer-accent-contrast)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className="rounded-md px-2 py-1 font-mono text-[9.5px] font-bold tracking-wider uppercase transition-colors cursor-pointer"
                  title="Sólido Metálico 3D com Arestas Técnicas Visíveis"
                >
                  SÓLIDO
                </button>
                <button
                  type="button"
                  data-testid="chamfer-topbar-style-solid"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setRenderStyle3D("shaded");
                    if (isFlatTop2DView(orbitAzimuthRef.current, orbitElevationRef.current)) {
                      setIsOrbitToolActive(true);
                      animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
                    }
                  }}
                  style={
                    renderStyle3D === "shaded"
                      ? {
                          backgroundColor: "var(--chamfer-accent)",
                          color: "var(--chamfer-accent-contrast)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className="rounded-md px-2 py-1 font-mono text-[9.5px] font-bold tracking-wider uppercase transition-colors cursor-pointer"
                  title="Sólido Metálico 3D Puro (Sem Arestas)"
                >
                  SOMB
                </button>
                <button
                  type="button"
                  data-testid="chamfer-topbar-style-wireframe"
                  onClick={() => {
                    triggerHaptic("selection");
                    AudioManager.play("ui_select");
                    setRenderStyle3D("wireframe");
                  }}
                  style={
                    renderStyle3D === "wireframe"
                      ? {
                          backgroundColor: "var(--chamfer-accent)",
                          color: "var(--chamfer-accent-contrast)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className="rounded-md px-2 py-1 font-mono text-[9.5px] font-bold tracking-wider uppercase transition-colors cursor-pointer"
                  title="Wireframe Técnico 3D com Hierarquia de Arestas e Profundidade Óptica"
                >
                  ARAME
                </button>
              </div>
            )}
          </div>

          {/* LADO DIREITO: HISTÓRICO + SALVAMENTO/STATUS + FERRAMENTAS GLOBAIS */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* HISTÓRICO: [ DESFAZER | REFAZER ] */}
            <div
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border-strong)",
              }}
              className="flex items-center rounded-lg border p-0.5"
            >
              <button
                type="button"
                disabled={!historyState.canUndo && pending.length === 0}
                onClick={undo}
                title="Desfazer alteração (Ctrl+Z)"
                aria-label="Desfazer ação anterior"
                style={{
                  color:
                    historyState.canUndo || pending.length > 0
                      ? "var(--chamfer-text-primary)"
                      : "var(--chamfer-text-muted)",
                }}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[10px] font-semibold transition-colors",
                  historyState.canUndo || pending.length > 0
                    ? "hover:brightness-110 cursor-pointer"
                    : "opacity-35 cursor-not-allowed",
                )}
              >
                <Undo2 className="size-3.5" />
                <span className="hidden sm:inline">Desfazer</span>
              </button>
              <button
                type="button"
                disabled={!historyState.canRedo}
                onClick={redo}
                title="Refazer alteração (Ctrl+Y)"
                aria-label="Refazer ação desfeita"
                style={{
                  color: historyState.canRedo
                    ? "var(--chamfer-text-primary)"
                    : "var(--chamfer-text-muted)",
                }}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[10px] font-semibold transition-colors",
                  historyState.canRedo
                    ? "hover:brightness-110 cursor-pointer"
                    : "opacity-35 cursor-not-allowed",
                )}
              >
                <Redo2 className="size-3.5" />
                <span className="hidden sm:inline">Refazer</span>
              </button>
            </div>

            {/* BOTÃO SALVAR E INDICADOR DE ESTADO RESPEITANDO A CONFIGURAÇÃO */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleManualSave}
                title="Salvar documento agora (Ctrl+S)"
                style={
                  saveStatus !== "pendente"
                    ? {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border-strong)",
                        color: "var(--chamfer-text-primary)",
                      }
                    : undefined
                }
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold transition-all shadow-xs",
                  saveStatus === "pendente"
                    ? isDark
                      ? "border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#FBBF24] hover:bg-[#F59E0B]/25"
                      : "border-[#D97706]/50 bg-[#D97706]/10 text-[#D97706] hover:bg-[#D97706]/20"
                    : "hover:brightness-110",
                )}
              >
                {saveStatus === "salvando" ? (
                  <Loader2 className="size-3 animate-spin text-[#F59E0B]" />
                ) : (
                  <Check className={cn("size-3", isDark ? "text-[#34D399]" : "text-[#059669]")} />
                )}
                <span>Salvar</span>
              </button>

              {/* INDICADOR DISCRETO DO ESTADO DO DOCUMENTO */}
              <span
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-mono border font-semibold uppercase tracking-wider transition-colors",
                  saveStatus === "salvo" &&
                    (isDark
                      ? "text-[#34D399] bg-[#34D399]/10 border-[#34D399]/30"
                      : "text-[#059669] bg-[#059669]/10 border-[#059669]/30"),
                  saveStatus === "salvando" &&
                    (isDark
                      ? "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30"
                      : "text-[#D97706] bg-[#D97706]/10 border-[#D97706]/30"),
                  saveStatus === "pendente" &&
                    (isDark
                      ? "text-[#FBBF24] bg-[#F59E0B]/15 border-[#F59E0B]/50 animate-pulse"
                      : "text-[#D97706] bg-[#D97706]/15 border-[#D97706]/40"),
                )}
                title={
                  chamferSettings.autoSave
                    ? `Salvamento automático ativo (a cada ${chamferSettings.autoSaveIntervalSec}s)`
                    : "Salvamento manual ativado nas configurações do projeto"
                }
              >
                {saveStatus === "salvo" && (
                  <>
                    <span className={cn("size-1.5 rounded-full", isDark ? "bg-[#34D399]" : "bg-[#059669]")} />
                    <span>Salvo</span>
                  </>
                )}
                {saveStatus === "salvando" && (
                  <>
                    <Loader2 className="size-2.5 animate-spin text-[#F59E0B]" />
                    <span>Salvando...</span>
                  </>
                )}
                {saveStatus === "pendente" && (
                  <>
                    <span className="size-1.5 rounded-full bg-[#F59E0B] animate-ping" />
                    <span className="hidden md:inline">Alterações não salvas</span>
                    <span className="md:hidden">Não salvo</span>
                  </>
                )}
              </span>
            </div>

            <span
              style={{ backgroundColor: "var(--chamfer-border-strong)" }}
              className="h-4 w-px"
            />

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
              style={{
                backgroundColor: "var(--chamfer-accent-soft)",
                borderColor: "var(--chamfer-accent-border)",
                color: "var(--chamfer-accent)",
              }}
              className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold uppercase transition-all shadow-2xs hover:brightness-110"
            >
              <ScanEye className="size-3.5" style={{ color: "var(--chamfer-accent)" }} />
              <span className="hidden xl:inline">CHAMFER VISION</span>
              <span className="xl:hidden">VISION</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("action");
                setQuickCommandOpen(true);
              }}
              title="CHAMFER INTENT — Compilador Geométrico Paramétrico por Linguagem Natural (Atalho: Q)"
              aria-label="Abrir CHAMFER INTENT"
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-accent-border)",
                color: "var(--chamfer-accent)",
              }}
              className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold uppercase transition-all shadow-2xs hover:brightness-110"
            >
              <Sparkles className="size-3.5" style={{ color: "var(--chamfer-accent)" }} />
              <span className="hidden xl:inline">CHAMFER INTENT</span>
              <span className="xl:hidden">INTENT</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("action");
                setIntegratedWorkshopOpen(true);
              }}
              title="Oficina Digital Integrada: Catálogo Costa Ferro, Dossiê Multi-Vistas, Lista de Corte 6m, BOM e Orçamento"
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border-strong)",
                color: "var(--chamfer-text-primary)",
              }}
              className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold uppercase transition-all shadow-2xs hover:brightness-110"
            >
              <Boxes className="size-3.5" style={{ color: "var(--chamfer-accent)" }} />
              <span className="hidden xl:inline">OFICINA & CORTE</span>
              <span className="xl:hidden">CORTE/BOM</span>
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
              isDark={isDark}
            />
            <IconBtn
              label="Exportar"
              onClick={() => setExportOpen(true)}
              icon={Download}
              title="Exportar DXF, SVG, PNG, PDF"
              isDark={isDark}
            />
            <IconBtn
              label="Corte CNC"
              onClick={() => setCncOpen(true)}
              icon={Scissors}
              title="Ferramenta de Corte e Exportação DXF CNC direta"
              isDark={isDark}
            />
            <IconBtn
              label="Comando (Q)"
              onClick={() => setQuickCommandOpen(true)}
              icon={Search}
              title="Busca rápida de comandos CAD (Atalho: Q ou Ctrl+K)"
              isDark={isDark}
            />
            <IconBtn
              label="Topologia"
              onClick={() => setTopologyHealthOpen(true)}
              icon={Activity}
              title="Auditoria de topologia e Auto-Heal (saúde do desenho)"
              isDark={isDark}
            />
            <IconBtn
              label="Presets"
              onClick={() => setPresetsModalOpen(true)}
              icon={Boxes}
              title="Catálogo de presets paramétricos (Flanges, tubos, sapatas)"
              isDark={isDark}
            />
            <div className="relative">
              <IconBtn
                buttonRef={landscapeMoreTriggerRef}
                label="Mais"
                onClick={() => {
                  updateLandscapeMorePosition();
                  setMoreOpen((m) => !m);
                }}
                icon={MoreHorizontal}
                active={moreOpen}
                title="Mais opções e ferramentas avançadas"
                isDark={isDark}
              />
              {moreOpen &&
                typeof document !== "undefined" &&
                document.body &&
                createPortal(
                  <div
                    ref={landscapeMoreMenuRef}
                    data-testid="landscape-more-menu-portal"
                    role="menu"
                    aria-label="Mais opções do CHAMFER CAD"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "fixed",
                      top: landscapeMoreCoords.top,
                      right: landscapeMoreCoords.right,
                      zIndex: 9999,
                      backgroundColor: "var(--chamfer-popover-bg)",
                      borderColor: "var(--chamfer-border-strong)",
                      color: "var(--chamfer-text-primary)",
                    }}
                    className="chamfer-theme-fade-2s max-h-[calc(100dvh-64px)] w-68 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    {/* 6 ITENS OBRIGATÓRIOS EM DESTAQUE NO TOPO DO MENU */}
                    <MenuItem
                      label="👁 VISION (Engenharia Reversa 1:1)"
                      icon={ScanEye}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setVisionOpen(true);
                      }}
                    />
                    <MenuItem
                      label="✨ CHAMFER INTENT (Assistente IA)"
                      icon={Sparkles}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setQuickCommandOpen(true);
                      }}
                    />
                    <MenuItem
                      label="⚙ CORTE / BOM (Lista e Nesting)"
                      icon={Boxes}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setIntegratedWorkshopOpen(true);
                      }}
                    />
                    <MenuItem
                      label="⬇ Exportar CNC / DXF / Prancha"
                      icon={Download}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setExportOpen(true);
                      }}
                    />
                    <MenuItem
                      label="⌖ Enquadrar Peça na Tela"
                      icon={Crosshair}
                      isDark={isDark}
                      onClick={() => {
                        centerPiece(false);
                        setMoreOpen(false);
                      }}
                    />
                    <MenuItem
                      label="◐ Alternar Tema Claro / Escuro"
                      icon={isDark ? Sun : Moon}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        toggleTheme();
                      }}
                    />
                    <MenuItem
                      label="⚙ Aparência e Preferências do Projeto"
                      icon={Sliders}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setProjectSettingsOpen(true);
                      }}
                    />

                    <div
                      style={{ backgroundColor: "var(--chamfer-border)" }}
                      className="my-1.5 h-px"
                    />

                    {verticalLayout.isVerticalViewport && (
                      <MenuItem
                        label="Modo Vertical Compacto"
                        icon={Maximize}
                        isDark={isDark}
                        onClick={() => {
                          setMoreOpen(false);
                          verticalLayout.setLayoutPreference("compact");
                          toast.info("Layout Vertical Compacto ativado.");
                        }}
                      />
                    )}
                    <MenuItem
                      label="Folha Técnica e Legenda"
                      icon={FileText}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setTechnicalSheetModalOpen(true);
                      }}
                    />
                    <MenuItem
                      label="Tabela de Variáveis"
                      icon={Sliders}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setVariablesModalOpen(true);
                      }}
                    />
                    <MenuItem
                      label="Novo projeto CHAMFER"
                      icon={FolderPlus}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        setNewProjectName(`Projeto ${Date.now().toString().slice(-4)}`);
                        setNewProjectDialogOpen(true);
                      }}
                    />
                    <MenuItem
                      label="Projetos salvos"
                      icon={FolderOpen}
                      isDark={isDark}
                      onClick={() => {
                        setMoreOpen(false);
                        leaveEditor();
                      }}
                    />
                    <div className={cn("my-1.5 h-px", isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]")} />
                    <MenuItem
                      label="Centralizar peça na prancheta"
                      icon={Crosshair}
                      isDark={isDark}
                      onClick={() => {
                        centerPiece(true);
                        setMoreOpen(false);
                      }}
                    />
                    <MenuItem
                      label="Enquadrar área de trabalho"
                      icon={Frame}
                      isDark={isDark}
                      onClick={() => {
                        fitFrame();
                        setMoreOpen(false);
                      }}
                    />
                    <div className={cn("my-1.5 h-px", isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]")} />
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
                    <div className={cn("my-1.5 h-px", isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]")} />
                    <MenuItem
                      label={showDims ? "Ocultar medidas" : "Mostrar medidas"}
                      icon={Ruler}
                      isDark={isDark}
                      onClick={() => {
                        setShowDims((s) => !s);
                        setMoreOpen(false);
                      }}
                    />
                    <MenuItem
                      label="Verificar geometria"
                      icon={Triangle}
                      isDark={isDark}
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
                      isDark={isDark}
                      onClick={() => {
                        const res = optimize(entities);
                        commit(res.entities);
                        toast.success(`${res.removed + res.tiny} entidades limpas`);
                        setMoreOpen(false);
                      }}
                    />
                    {imageLayer && (
                      <>
                        <MenuItem
                          label={imageLayer.visible ? "Ocultar imagem" : "Mostrar imagem"}
                          icon={ImageIcon}
                          isDark={isDark}
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
                  </div>,
                  document.body,
                )}
            </div>

            <IconBtn
              label={isDark ? "Tema Claro" : "Tema Escuro"}
              onClick={toggleTheme}
              icon={isDark ? Sun : Moon}
              title={isDark ? "Mudar para Tema Claro" : "Mudar para Tema Escuro"}
              isDark={isDark}
            />
            <IconBtn
              label="Tela Cheia"
              onClick={toggleFullscreen}
              icon={focus ? Minimize : Maximize}
              title="Alternar modo tela cheia / foco"
              isDark={isDark}
            />
          </div>
        </header>
      )}

      {/* CORPO DO WORKSPACE CAD: EM MODO CAD 3D A BARRA ESQUERDA FICA VISÍVEL E O CANVAS OCUPA 100% DA DIREITA E BASE */}
      <div className={cn("flex min-h-0 min-w-0 flex-1", isLandscape || activeMode === "3d" ? "gap-1.5 p-1 pt-0" : "gap-0 p-0")}>
        {/* REGIÃO B — TOOLBAR VERTICAL ESQUERDA (VISÍVEL NO MODO PAISAGEM OU SEMPRE QUE CAD 3D ESTIVER ATIVO) */}
        {!focus && (isLandscape || activeMode === "3d") && (
          <ChamferCadToolbar
            tool={tool}
            onPickTool={pickTool}
            activeMode={activeMode}
            onModeChange={(m) => {
              triggerHaptic("selection");
              if (m === "3d" || m === "flanges") {
                transitionTo3D(m);
              } else {
                transitionTo2D();
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
            onDeleteSelection={() => {
              if (selection.length === 0) return;
              commit((list) => list.filter((e) => !selection.includes(e.id)));
              setSelection([]);
              toast.success("Seleção removida.");
            }}
            onArrayLinear={handleArrayLinear}
            onArrayPolar={handleArrayPolar}
            onOpenQuickCommand={() => setQuickCommandOpen(true)}
            onOpenTopologyHealth={() => setTopologyHealthOpen(true)}
            onOpenPresets={() => setPresetsModalOpen(true)}
            onOpenTechnicalSheet={() => setTechnicalSheetModalOpen(true)}
            onOpenVariables={() => setVariablesModalOpen(true)}
            onOpenClipboard={() => {
              setClipboardAnchorWorld({
                x: (canvasSize.w / 2 - view.tx) / view.k,
                y: (canvasSize.h / 2 - view.ty) / view.k,
              });
              setClipboardModalOpen(true);
            }}
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
            cursorOffsetMode={cursorOffsetMode}
            onToggleCursorOffsetMode={toggleCursorOffsetMode}
            loupeMode={loupeMode}
            onCycleLoupeMode={handleCycleLoupeMode}
            nudgeHudVisible={nudgeHudVisible}
            onToggleNudgeHud={() => {
              setNudgeHudVisible((prev) => {
                const next = !prev;
                globalCADInteractionHub.toggleModifier("nudge_dpad", next);
                return next;
              });
            }}
            snapDivision={snapDivision}
            onSetSnapDivision={setSnapDivision}
            showAllSnaps={showAllSnaps}
            onToggleShowAllSnaps={() => setShowAllSnaps((v) => !v)}
            interactionGuideMode={interactionGuideMode}
            onSetInteractionGuideMode={handleSetInteractionGuideMode}
            onStartSetReferencePoint={() => {
              if (interactionGuideMode === "off") {
                handleSetInteractionGuideMode("purple_ref");
              }
              setIsSettingReferencePoint(true);
              toast.info("Toque no vértice, centro ou ponto desejado para fixar o Centro de Referência");
            }}
            temporaryOrigin={temporaryOrigin}
            onClearTemporaryOrigin={() => {
              setTemporaryOrigin(null);
              setPinnedMeetingPoints([]);
              setLockedConstraints({});
              toast.success("Ponto de referência limpo");
            }}
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
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            onDeactivateOrbitTool={() => {
              if (isOrbitToolActive) {
                setIsOrbitToolActive(false);
                orbitDragRef.current = null;
              }
            }}
            drawingProjection="orthographic"
            onToggleDrawingProjection={() => {
              setDrawingProjection("orthographic");
              transitionTo2D();
              toast.info("Modo Ortogonal 2D ativado");
            }}
            isoPlane={isoPlane}
            onSelectIsoPlane={(p) => {
              setIsoPlane(p);
              toast.info(`Plano Isométrico: ${ISO_PLANES[p].label}`);
            }}
            onOpenPieceBuilder={() => setIsoPieceBuilderOpen(true)}
            onOverkillClean={handleOverkillClean}
            onBoolean2D={handleBoolean2D}
            onCreateHatch={handleCreateHatch}
            onSetRefZero={() => {
              setTemporaryOrigin({
                id: uid(),
                p: cursor,
                label: "REF (0,0)",
                kind: "origin",
                timestamp: Date.now(),
              });
              triggerHaptic("success");
              toast.success(`REF (0,0) fixada em (${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}) mm`);
            }}
            onOpenRevEngCategory={(category: RevEngCategoryId, wizardStep?: RevEngWizardStep) => {
              setRevEngData((prev) => ({
                ...prev,
                activeCategory: category,
                activeWizardStep: wizardStep ?? prev.activeWizardStep,
              }));
              setActiveSidebarTab("eng_rev");
              setRightSidebarOpen(true);
            }}
            activeDirect3DTool={activeDirect3DTool}
            onSelectDirect3DTool={(next3DTool) => {
              setActiveDirect3DTool(next3DTool);
              if (next3DTool === "loft_3d") {
                setTool("loft_3d");
              } else if (tool === "loft_3d") {
                setTool("select");
              }
            }}
            selectionKind3D={
              subSelection3D.faceIds.length > 0
                ? "face"
                : subSelection3D.edgeIds.length > 0 ||
                    (subSelection3D.vertexIds?.length ?? 0) > 0
                  ? "edge"
                  : subSelection3D.bodyIds.length > 0
                    ? "body"
                    : "none"
            }
            onClearSelection3D={() => {
              setSelection([]);
              setSubSelection3D({
                faceIds: [],
                edgeIds: [],
                bodyIds: [],
                vertexIds: [],
                selectionScope: "auto",
                activePivot3D: null,
                activeHingeEdgeId: null,
              });
              setActiveDirect3DTool("select_3d");
            }}
            onReturnToSketch2D={transitionTo2D}
            isDark={isDark}
          />
        )}

        {/* REGIÃO C — CANVAS CAD PRINCIPAL (100% PONTA A PONTA EM MODO RETRATO) */}
        <div
          ref={canvasViewportRef}
          data-chamfer-workspace="true"
          style={{
            backgroundColor: frame.visible ? canvasOuterBgColor : canvasBgColor,
            borderColor: "var(--chamfer-border-strong)",
          }}
          className={cn(
            "relative min-h-0 min-w-0 flex-1 overflow-hidden",
            isLandscape ? "rounded-xl border shadow-inner" : "rounded-none border-0",
          )}
        >
          {bgStyle === "fluido" && (
            <div
              aria-hidden="true"
              data-paused={gesturing || solidOpen || isInPlaceSolid3DActive ? "true" : "false"}
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
              <div className="silk-light-generator-bleed">
                <div className="liquid-silk-field liquid-silk-field-1" />
                <div className="liquid-silk-field liquid-silk-field-2" />
                <div className="liquid-silk-field liquid-silk-field-3" />
              </div>
              <div className="silk-micro-dither" />
            </div>
          )}
          {bgStyle === "suave" && (
            <div
              aria-hidden="true"
              data-paused={gesturing || solidOpen || isInPlaceSolid3DActive ? "true" : "false"}
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
              <div className="fluid-aurora-veils-bleed">
                <div className="fluid-aurora-veil fluid-aurora-veil-amber" />
                <div className="fluid-aurora-veil fluid-aurora-veil-coral" />
                <div className="fluid-aurora-veil fluid-aurora-veil-cyan" />
                <div className="fluid-aurora-veil fluid-aurora-veil-violet" />
              </div>
              <div className="silk-micro-dither" />
            </div>
          )}
          {themeColors.canvasOverlayGradient !== "none" && (
            <div
              aria-hidden="true"
              style={{ background: themeColors.canvasOverlayGradient }}
              className="pointer-events-none absolute inset-[-35%] z-0"
            />
          )}
          {solidOpen && (
            <div
              className={cn(
                "absolute inset-0 z-30 size-full transition-opacity duration-75",
                morphState === "PREPARING_3D" ? "opacity-0 pointer-events-none" : "opacity-100",
              )}
            >
              <Suspense fallback={null}>
                <Cad3DStage
                  open={true}
                  onClose={transitionTo2D}
                  entities={entities}
                  thickness={thickness}
                  onThickness={setThickness}
                  title={project?.name ?? "Peça Chamfer"}
                  labProjectId={projectId}
                  selection={selection}
                  onSelectEntity={(id) => setSelection(id ? [id] : [])}
                  initialCadPanelOpen={activeMode === "flanges"}
                  view2D={view}
                  viewportSize2D={canvasSize}
                  initialTreeJson={cad3dTreeJson}
                  onTreeChange={setCad3dTreeJson}
                  morphDirection={morphDirection}
                  morphDurationMs={morphDurationMs}
                  morphStartProgress3D={morphStartProgress3D}
                  onMorphFrame0Ready={handleMorphFrame0Ready}
                  onMorphProgress={handleMorphProgress}
                  onMorphComplete={handleMorphComplete}
                  orbitCommand={orbitCommand3D}
                  orbitModeActive={isOrbitToolActive}
                  onOrbitAnglesChange={handleOrbitAnglesFrom3D}
                />
              </Suspense>
            </div>
          )}
          <div
            className={cn(
              "relative z-[2] size-full",
              solidOpen && morphState !== "PREPARING_3D" && "pointer-events-none",
            )}
          >
              {/* CAMADAS 1 E 2 (FUNDO DA PRANCHETA + GRADE TÉCNICA INTERNA/EXTERNA — RENDERIZADAS ABAIXO DO CANVAS DE PEÇAS) */}
              {(showGrid || frame.visible) && (!solidOpen || morphState === "PREPARING_3D") && (
                <svg className="pointer-events-none absolute inset-0 size-full">
                  <defs>
                    {/* CLIP PATH DA ÁREA DE TRABALHO PARA SEPARAR GRADE INTERNA DA GRADE EXTERNA */}
                    {frame.visible &&
                      Number.isFinite(frame.w) &&
                      Number.isFinite(frame.h) &&
                      frame.w > 0 &&
                      frame.h > 0 && (
                        <clipPath id="chamfer-workspace-sheet-clip">
                          <rect
                            x={0}
                            y={0}
                            width={frame.w}
                            height={frame.h}
                            transform={`translate(${view.tx} ${view.ty}) scale(${view.k})${
                              orbitProjection2D.isTilted ? ` ${orbitProjection2D.svgMatrix}` : ""
                            }`}
                          />
                        </clipPath>
                      )}

                    {/* 1A. GRID SECUNDÁRIO INTERNO (DENTRO DA ÁREA DE TRABALHO) */}
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

                    {/* 1B. GRID SECUNDÁRIO EXTERNO (FORA DA ÁREA DE TRABALHO — ~40% MAIS SUAVE) */}
                    {gridConfig.subFade > 0.02 && (
                      <pattern
                        id="chamfer-grid-secondary-ext"
                        width={Math.max(0.1, gridConfig.subStep * view.k)}
                        height={Math.max(0.1, gridConfig.subStep * view.k)}
                        patternUnits="userSpaceOnUse"
                        x={((view.tx % (gridConfig.subStep * view.k)) + (gridConfig.subStep * view.k)) % (gridConfig.subStep * view.k)}
                        y={((view.ty % (gridConfig.subStep * view.k)) + (gridConfig.subStep * view.k)) % (gridConfig.subStep * view.k)}
                      >
                        <path
                          d={`M ${gridConfig.subStep * view.k} 0 H 0 V ${gridConfig.subStep * view.k}`}
                          fill="none"
                          stroke={gridStyles.extSecondaryStroke}
                          strokeWidth={gridStyles.secondaryWidth}
                          shapeRendering="crispEdges"
                        />
                      </pattern>
                    )}

                    {/* 2A. GRID PRINCIPAL INTERNO (DENTRO DA ÁREA DE TRABALHO) */}
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

                    {/* 2B. GRID PRINCIPAL EXTERNO (FORA DA ÁREA DE TRABALHO — ~40% MAIS SUAVE) */}
                    {gridConfig.majorFade > 0.02 && (
                      <pattern
                        id="chamfer-grid-major-ext"
                        width={Math.max(0.1, gridConfig.majorStep * view.k)}
                        height={Math.max(0.1, gridConfig.majorStep * view.k)}
                        patternUnits="userSpaceOnUse"
                        x={((view.tx % (gridConfig.majorStep * view.k)) + (gridConfig.majorStep * view.k)) % (gridConfig.majorStep * view.k)}
                        y={((view.ty % (gridConfig.majorStep * view.k)) + (gridConfig.majorStep * view.k)) % (gridConfig.majorStep * view.k)}
                      >
                        <path
                          d={`M ${gridConfig.majorStep * view.k} 0 H 0 V ${gridConfig.majorStep * view.k}`}
                          fill="none"
                          stroke={gridStyles.extMajorStroke}
                          strokeWidth={gridStyles.majorWidth}
                          shapeRendering="crispEdges"
                        />
                      </pattern>
                    )}

                    {/* 3A. GRID MACRO INTERNO */}
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

                    {/* 3B. GRID MACRO EXTERNO */}
                    <pattern
                      id="chamfer-grid-macro-ext"
                      width={Math.max(0.1, gridConfig.macroStep * view.k)}
                      height={Math.max(0.1, gridConfig.macroStep * view.k)}
                      patternUnits="userSpaceOnUse"
                      x={((view.tx % (gridConfig.macroStep * view.k)) + (gridConfig.macroStep * view.k)) % (gridConfig.macroStep * view.k)}
                      y={((view.ty % (gridConfig.macroStep * view.k)) + (gridConfig.macroStep * view.k)) % (gridConfig.macroStep * view.k)}
                    >
                      <path
                        d={`M ${gridConfig.macroStep * view.k} 0 H 0 V ${gridConfig.macroStep * view.k}`}
                        fill="none"
                        stroke={gridStyles.extMacroStroke}
                        strokeWidth={gridStyles.macroWidth}
                        shapeRendering="crispEdges"
                      />
                    </pattern>

                    {/* 4. GRADE ISOMÉTRICA ESPACIAL (EIXOS A 30°, 90°, 150°) */}
                    {drawingProjection === "isometric" && (
                      <pattern
                        id="chamfer-grid-isometric"
                        width={Math.max(1, grid * Math.sqrt(3) * view.k)}
                        height={Math.max(1, grid * view.k)}
                        patternUnits="userSpaceOnUse"
                        x={
                          ((view.tx % (grid * Math.sqrt(3) * view.k)) +
                            grid * Math.sqrt(3) * view.k) %
                          (grid * Math.sqrt(3) * view.k)
                        }
                        y={((view.ty % (grid * view.k)) + grid * view.k) % (grid * view.k)}
                      >
                        {/* Linhas a 90° (verticais) */}
                        <line
                          x1={0}
                          y1={0}
                          x2={0}
                          y2={grid * view.k}
                          stroke={isDark ? "rgba(56, 189, 248, 0.09)" : "rgba(2, 132, 199, 0.12)"}
                          strokeWidth={0.8}
                        />
                        <line
                          x1={(grid * Math.sqrt(3) * view.k) / 2}
                          y1={0}
                          x2={(grid * Math.sqrt(3) * view.k) / 2}
                          y2={grid * view.k}
                          stroke={isDark ? "rgba(148, 163, 184, 0.04)" : "rgba(100, 116, 139, 0.07)"}
                          strokeWidth={0.65}
                        />
                        {/* Linhas a 30° */}
                        <line
                          x1={0}
                          y1={(grid * view.k) / 2}
                          x2={(grid * Math.sqrt(3) * view.k) / 2}
                          y2={0}
                          stroke={isDark ? "rgba(148, 163, 184, 0.04)" : "rgba(100, 116, 139, 0.07)"}
                          strokeWidth={0.65}
                        />
                        <line
                          x1={0}
                          y1={grid * view.k}
                          x2={grid * Math.sqrt(3) * view.k}
                          y2={0}
                          stroke={isDark ? "rgba(56, 189, 248, 0.09)" : "rgba(2, 132, 199, 0.14)"}
                          strokeWidth={0.85}
                        />
                        <line
                          x1={(grid * Math.sqrt(3) * view.k) / 2}
                          y1={grid * view.k}
                          x2={grid * Math.sqrt(3) * view.k}
                          y2={(grid * view.k) / 2}
                          stroke={isDark ? "rgba(148, 163, 184, 0.04)" : "rgba(100, 116, 139, 0.07)"}
                          strokeWidth={0.65}
                        />
                        {/* Linhas a 150° */}
                        <line
                          x1={0}
                          y1={(grid * view.k) / 2}
                          x2={(grid * Math.sqrt(3) * view.k) / 2}
                          y2={grid * view.k}
                          stroke={isDark ? "rgba(148, 163, 184, 0.04)" : "rgba(100, 116, 139, 0.07)"}
                          strokeWidth={0.65}
                        />
                        <line
                          x1={0}
                          y1={0}
                          x2={grid * Math.sqrt(3) * view.k}
                          y2={grid * view.k}
                          stroke={isDark ? "rgba(56, 189, 248, 0.09)" : "rgba(2, 132, 199, 0.14)"}
                          strokeWidth={0.85}
                        />
                        <line
                          x1={(grid * Math.sqrt(3) * view.k) / 2}
                          y1={0}
                          x2={grid * Math.sqrt(3) * view.k}
                          y2={(grid * view.k) / 2}
                          stroke={isDark ? "rgba(148, 163, 184, 0.04)" : "rgba(100, 116, 139, 0.07)"}
                          strokeWidth={0.65}
                        />
                      </pattern>
                    )}
                  </defs>

                  {/* PASSO 1 — Grade Externa Suave sobre a Superfície de Apoio (#DCE3EC no Claro / #060A11 no Escuro) */}
                  {showGrid &&
                    frame.visible &&
                    drawingProjection !== "isometric" && (
                      <>
                        {gridConfig.subFade > 0.02 && (
                          <rect width="100%" height="100%" fill="url(#chamfer-grid-secondary-ext)" />
                        )}
                        {gridConfig.majorFade > 0.02 && (
                          <rect width="100%" height="100%" fill="url(#chamfer-grid-major-ext)" />
                        )}
                        {gridConfig.macroStep * view.k >= 8 && (
                          <rect width="100%" height="100%" fill="url(#chamfer-grid-macro-ext)" />
                        )}
                      </>
                    )}

                  {/* PASSO 2 — Superfície Interna da Área de Trabalho (Papel Técnico #FAFBFD no Claro / Azul-Noite #0D1526 no Escuro) */}
                  {frame.visible &&
                    Number.isFinite(frame.w) &&
                    Number.isFinite(frame.h) &&
                    frame.w > 0 &&
                    frame.h > 0 && (
                      <g
                        transform={`translate(${view.tx} ${view.ty}) scale(${view.k})${
                          orbitProjection2D.isTilted ? ` ${orbitProjection2D.svgMatrix}` : ""
                        }`}
                      >
                        <rect
                          x={0}
                          y={0}
                          width={frame.w}
                          height={frame.h}
                          fill={canvasBgColor}
                          fillOpacity={bgStyle === "padrao" ? 1 : isDark ? 0.48 : 0.54}
                        />
                      </g>
                    )}

                  {/* PASSO 3 — Grade Técnica Interna Nítida (Recortada à Área de Trabalho ou em tela cheia se frame.visible=false) */}
                  {showGrid &&
                    (drawingProjection === "isometric" ? (
                      <rect width="100%" height="100%" fill="url(#chamfer-grid-isometric)" />
                    ) : (
                      <g clipPath={frame.visible ? "url(#chamfer-workspace-sheet-clip)" : undefined}>
                        {gridConfig.subFade > 0.02 && (
                          <rect width="100%" height="100%" fill="url(#chamfer-grid-secondary)" />
                        )}
                        {gridConfig.majorFade > 0.02 && (
                          <rect width="100%" height="100%" fill="url(#chamfer-grid-major)" />
                        )}
                        {gridConfig.macroStep * view.k >= 8 && (
                          <rect width="100%" height="100%" fill="url(#chamfer-grid-macro)" />
                        )}
                      </g>
                    ))}
                </svg>
              )}
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
          {/* MOTOR 3D SÓLIDO IN-PLACE ACOPLADO AO CANVAS UNIFICADO DO 2D SKETCH (LAZY-LOADED SOB DEMANDA) */}
          {(isInPlaceSolid3DActive || cad3dTreeJson !== undefined) && (
            <Suspense fallback={null}>
              <ChamferUnified3DViewport
                active={isInPlaceSolid3DActive}
                entities={drawable}
                thickness={thickness}
                edgeMode={renderStyle3D}
                view2D={view}
                viewportSize={canvasSize}
                azimuthDeg={orbitAzimuthDeg}
                elevationDeg={orbitElevationDeg}
                pivot2D={smartOrbitPivot}
                isDark={isDark}
                initialTreeJson={cad3dTreeJson}
                onTreeChange={setCad3dTreeJson}
                activeLoftPreviewMesh={activeLoftPreviewMesh}
                subSelection3D={subSelection3D}
              />
            </Suspense>
          )}
          {/* FLUXO CALDRA / PRÉVIA CNC — camada de UI, nunca exportada */}
          {!solidOpen && <canvas ref={flowRef} className="pointer-events-none absolute inset-0 size-full" />}

          <svg
            ref={svgRef}
            className={cn(
              "absolute inset-0 size-full touch-none",
              isOrbitToolActive && "cursor-grab active:cursor-grabbing",
            )}
            onTouchStart={(e) => {
              if (e.touches.length >= 2) {
                abortForMultiTouchGesture();
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length >= 2) {
                abortForMultiTouchGesture();
              }
            }}
            onTouchEnd={(e) => {
              if (isMultiTouchGestureRef.current) {
                if (e.touches.length === 0) {
                  const now = performance.now();
                  gestureCooldownUntilRef.current = now + 150;
                  gestureUntilRef.current = now + 200;
                  dragCooldownUntilRef.current = now + 200;
                  if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
                  cooldownTimerRef.current = setTimeout(() => {
                    isMultiTouchGestureRef.current = false;
                    touchInteractionStateRef.current = "IDLE";
                    setTouchInteractionState("IDLE");
                  }, 160);
                }
              }
            }}
            onTouchCancel={() => {
              if (isMultiTouchGestureRef.current) {
                const now = performance.now();
                gestureCooldownUntilRef.current = now + 150;
                if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
                cooldownTimerRef.current = setTimeout(() => {
                  isMultiTouchGestureRef.current = false;
                  touchInteractionStateRef.current = "IDLE";
                  setTouchInteractionState("IDLE");
                }, 160);
              }
            }}
            onPointerDown={(e) => {
              if (
                !isLandscape &&
                shouldAutoCollapseDrawerOnCanvasTouch({
                  drawerOpen: portraitDrawerOpen,
                  isPickingCanvasPoints: revEngCanvasMode !== "none",
                })
              ) {
                setPortraitDrawerOpen(false);
              }
              onPointerDown(e);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            onDoubleClick={(e) => {
              if (tool === "polyline") {
                finishPolyline(false);
                return;
              }
              const hit = hitTest(toWorld(e, true));
              if (hit) {
                setSelection([hit.id]);
                setActiveSidebarTab("propriedades");
                if (isLandscape) {
                  setMobileEditorOpenManual(true);
                  setRightSidebarOpen(true);
                } else {
                  setPortraitDrawerOpen(true);
                }
                triggerHaptic("action");
              }
            }}
            role="application"
            aria-label="Prancheta vetorial"
          >
            <g
              data-testid="chamfer-2d-world-group"
              transform={`translate(${view.tx} ${view.ty}) scale(${view.k})${
                orbitProjection2D.isTilted ? ` ${orbitProjection2D.svgMatrix}` : ""
              }`}
            >
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

              {/* IMAGENS DE REFERÊNCIA DA BANCADA DE ENGENHARIA REVERSA (CALIBRADAS 1:1 — NUNCA VIRAM CORTE CNC) */}
              {!solidOpen &&
                outputMode === "completo" &&
                revEngData.referenceImages
                  .filter((img) => img.visible && (img.rectifiedSrc || img.src))
                  .map((img) => {
                    const wMm = Math.max(1, img.widthMm || img.naturalWidthPx * img.mmPerPx);
                    const hMm = Math.max(1, img.heightMm || img.naturalHeightPx * img.mmPerPx);
                    const cx = img.xMm + wMm / 2;
                    const cy = img.yMm + hMm / 2;
                    return (
                      <g
                        key={`reveng-img-${img.id}`}
                        pointerEvents="none"
                        transform={
                          Math.abs(img.rotationDeg) > 1e-3
                            ? `rotate(${img.rotationDeg} ${cx} ${cy})`
                            : undefined
                        }
                      >
                        <image
                          href={img.rectifiedSrc || img.src}
                          x={img.xMm}
                          y={img.yMm}
                          width={wMm}
                          height={hMm}
                          opacity={img.opacity}
                          preserveAspectRatio="none"
                        />
                      </g>
                    );
                  })}

              {/* LINHAS DE REFERÊNCIA ORTOGONAL INFINITAS SUAVIZADAS (DESENHADAS ANTES DA MOLDURA PARA NUNCA TINGIR A BORDA SUPERIOR DE VERMELHO) */}
              {!solidOpen && showGrid && drawingProjection !== "isometric" && (
                <g pointerEvents="none" aria-hidden="true">
                  <line
                    x1={-1e5}
                    y1={0}
                    x2={1e5}
                    y2={0}
                    stroke={gridStyles.axisInfinite}
                    strokeWidth={1 / (Number.isFinite(view.k) && view.k > 0 ? view.k : 1)}
                  />
                  <line
                    x1={0}
                    y1={-1e5}
                    x2={0}
                    y2={1e5}
                    stroke={gridStyles.axisInfinite}
                    strokeWidth={1 / (Number.isFinite(view.k) && view.k > 0 ? view.k : 1)}
                  />
                </g>
              )}

              {/* CAMADA 3 — Moldura Uniforme nos 4 Lados, Cantoneiras Discretas, Margem e Cotas da Área de Trabalho */}
              {frame.visible &&
                !solidOpen &&
                Number.isFinite(frame.w) &&
                Number.isFinite(frame.h) &&
                frame.w > 0 &&
                frame.h > 0 &&
                (() => {
                  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                  const cornerLen = Math.max(12 / safeK, Math.min(frame.w, frame.h) * 0.035);
                  const marginInset = Math.min(20, Math.min(frame.w, frame.h) * 0.025);
                  const borderColor = themeColors.workAreaStroke;
                  const cornerColor = borderColor;
                  const dimOffsetPx = 18 / safeK;
                  const headerBadgeText = `⬚ ÁREA DE TRABALHO • ${Math.round(frame.w)} × ${Math.round(frame.h)} mm${frame.locked ? " 🔒" : ""}`;
                  const rawHeaderPx = headerBadgeText.length * 6.2 + 16;
                  const maxAllowedHeaderPx = Math.max(140, frame.w * safeK);
                  const badgeScale = rawHeaderPx > maxAllowedHeaderPx ? maxAllowedHeaderPx / rawHeaderPx : 1;
                  const headerFontSize = (10.5 * badgeScale) / safeK;
                  const headerPadX = (8 * badgeScale) / safeK;
                  const headerPadY = 4 / safeK;
                  const headerW = (rawHeaderPx * badgeScale) / safeK;
                  const headerH = 20 / safeK;
                  const headerY = (frame.showDims ? -52 : -28) / safeK;
                  const widthPillW = Math.min(92 / safeK, frame.w * 0.85);
                  const widthPillCenterX =
                    frame.w > headerW + widthPillW + 24 / safeK
                      ? Math.max(frame.w / 2, headerW + widthPillW / 2 + 14 / safeK)
                      : frame.w / 2;

                  return (
                    <g aria-label="Área de Trabalho CAD">
                      {/* Contorno Técnico Uniforme nos 4 Lados */}
                      <rect
                        x={0}
                        y={0}
                        width={frame.w}
                        height={frame.h}
                        fill="none"
                        stroke={borderColor}
                        strokeOpacity={isDark ? 0.92 : 0.95}
                        strokeWidth={1.6 / safeK}
                        pointerEvents="none"
                      />

                      {/* Margem operacional interna tracejada sutil (fill="none") */}
                      {frame.w > marginInset * 3 && frame.h > marginInset * 3 && (
                        <rect
                          x={marginInset}
                          y={marginInset}
                          width={frame.w - marginInset * 2}
                          height={frame.h - marginInset * 2}
                          fill="none"
                          stroke={borderColor}
                          strokeOpacity={isDark ? 0.24 : 0.28}
                          strokeWidth={1 / safeK}
                          strokeDasharray={`${6 / safeK} ${4 / safeK}`}
                          pointerEvents="none"
                        />
                      )}

                      {/* 4 Cantoneiras Técnicas Discretas e Alinhadas na Mesma Cor Técnica da Moldura */}
                      {(
                        [
                          [0, 0, 1, 1],
                          [frame.w, 0, -1, 1],
                          [0, frame.h, 1, -1],
                          [frame.w, frame.h, -1, -1],
                        ] as const
                      ).map(([cx, cy, sx, sy]) => (
                        <g key={`corner-${cx}-${cy}`} pointerEvents="none">
                          <path
                            d={`M ${cx + sx * cornerLen} ${cy} L ${cx} ${cy} L ${cx} ${cy + sy * cornerLen}`}
                            fill="none"
                            stroke={cornerColor}
                            strokeWidth={2.2 / safeK}
                            strokeLinecap="square"
                          />
                        </g>
                      ))}

                      {/* Selo Técnico Interativo da Área de Trabalho */}
                      <g
                        pointerEvents="auto"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic("selection");
                          setStatusWorkspaceMenuOpen(true);
                          setStatusPrecisionMenuOpen(false);
                          setStatusCncMenuOpen(false);
                        }}
                      >
                        <rect
                          x={0}
                          y={headerY}
                          width={headerW}
                          height={headerH}
                          rx={5 / safeK}
                          fill={themeColors.surfaceElevated}
                          stroke={themeColors.borderStrong}
                          strokeWidth={1.1 / safeK}
                        />
                        <text
                          x={headerPadX}
                          y={headerY + headerH - headerPadY - 1.5 / safeK}
                          fontSize={headerFontSize}
                          fontFamily='"JetBrains Mono", "Inter", ui-monospace, monospace'
                          fontWeight="700"
                          fill={themeColors.textPrimary}
                        >
                          {headerBadgeText}
                        </text>
                      </g>

                      {/* Cotas Totais Desobstruídas da Área de Trabalho (Largura e Altura) */}
                      {frame.showDims && (
                        <g pointerEvents="none" fontFamily='"JetBrains Mono", "Inter", ui-monospace, monospace'>
                          {/* Linha de Cota Superior (Largura Total) */}
                          <line
                            x1={0}
                            y1={-dimOffsetPx}
                            x2={frame.w}
                            y2={-dimOffsetPx}
                            stroke={borderColor}
                            strokeOpacity={0.55}
                            strokeWidth={1 / safeK}
                            strokeDasharray={`${4 / safeK} ${3 / safeK}`}
                          />
                          <line
                            x1={0}
                            y1={-4 / safeK}
                            x2={0}
                            y2={-dimOffsetPx - 4 / safeK}
                            stroke={borderColor}
                            strokeOpacity={0.7}
                            strokeWidth={1.1 / safeK}
                          />
                          <line
                            x1={frame.w}
                            y1={-4 / safeK}
                            x2={frame.w}
                            y2={-dimOffsetPx - 4 / safeK}
                            stroke={borderColor}
                            strokeOpacity={0.7}
                            strokeWidth={1.1 / safeK}
                          />
                          <rect
                            x={widthPillCenterX - widthPillW / 2}
                            y={-dimOffsetPx - 8.5 / safeK}
                            width={widthPillW}
                            height={17 / safeK}
                            rx={4 / safeK}
                            fill={themeColors.surfaceElevated}
                            stroke={themeColors.borderStrong}
                            strokeOpacity={0.85}
                            strokeWidth={1 / safeK}
                          />
                          <text
                            x={widthPillCenterX}
                            y={-dimOffsetPx + 3.5 / safeK}
                            fontSize={10.5 / safeK}
                            fontWeight="700"
                            fill={themeColors.textSecondary}
                            textAnchor="middle"
                          >
                            {frame.w.toFixed(2)} mm
                          </text>

                          {/* Linha de Cota Lateral Esquerda (Altura Total) */}
                          <line
                            x1={-dimOffsetPx}
                            y1={0}
                            x2={-dimOffsetPx}
                            y2={frame.h}
                            stroke={borderColor}
                            strokeOpacity={0.5}
                            strokeWidth={1 / safeK}
                            strokeDasharray={`${4 / safeK} ${3 / safeK}`}
                          />
                          <line
                            x1={-4 / safeK}
                            y1={0}
                            x2={-dimOffsetPx - 4 / safeK}
                            y2={0}
                            stroke={borderColor}
                            strokeOpacity={0.65}
                            strokeWidth={1.1 / safeK}
                          />
                          <line
                            x1={-4 / safeK}
                            y1={frame.h}
                            x2={-dimOffsetPx - 4 / safeK}
                            y2={frame.h}
                            stroke={borderColor}
                            strokeOpacity={0.65}
                            strokeWidth={1.1 / safeK}
                          />
                          <g transform={`translate(${-dimOffsetPx} ${frame.h / 2}) rotate(-90)`}>
                            <rect
                              x={-46 / safeK}
                              y={-9 / safeK}
                              width={92 / safeK}
                              height={18 / safeK}
                              rx={4 / safeK}
                              fill={themeColors.surfaceElevated}
                              stroke={themeColors.borderStrong}
                              strokeOpacity={0.85}
                              strokeWidth={1 / safeK}
                            />
                            <text
                              x={0}
                              y={3.5 / safeK}
                              fontSize={10.5 / safeK}
                              fontWeight="700"
                              fill={themeColors.textSecondary}
                              textAnchor="middle"
                            >
                              {frame.h.toFixed(2)} mm
                            </text>
                          </g>
                        </g>
                      )}
                    </g>
                  );
                })()}

              {/* Eixos e Tríade de Origem (0,0) Separados da Moldura (+X em #E11D48, +Y em #10B981/#059669, Origem em #DC143C) */}
              {!solidOpen && showGrid && (
                <g pointerEvents="none" aria-label="Eixos do sistema CAD">
                  {drawingProjection === "isometric" ? (
                    <>
                      {/* Eixo X Isométrico (30° - Largura) */}
                      <line
                        x1={-1e5 * Math.cos(Math.PI / 6)}
                        y1={1e5 * Math.sin(Math.PI / 6)}
                        x2={1e5 * Math.cos(Math.PI / 6)}
                        y2={-1e5 * Math.sin(Math.PI / 6)}
                        stroke="#38BDF8"
                        strokeWidth={(isoPlane === "top" || isoPlane === "right" ? 2.2 : 1.2) / view.k}
                        strokeOpacity={isoPlane === "top" || isoPlane === "right" ? 0.9 : 0.45}
                      />
                      {/* Eixo Y Isométrico (150° - Comprimento) */}
                      <line
                        x1={1e5 * Math.cos(Math.PI / 6)}
                        y1={1e5 * Math.sin(Math.PI / 6)}
                        x2={-1e5 * Math.cos(Math.PI / 6)}
                        y2={-1e5 * Math.sin(Math.PI / 6)}
                        stroke="#F59E0B"
                        strokeWidth={(isoPlane === "top" || isoPlane === "left" ? 2.2 : 1.2) / view.k}
                        strokeOpacity={isoPlane === "top" || isoPlane === "left" ? 0.9 : 0.45}
                      />
                      {/* Eixo Z Isométrico (90° Vertical - Altura) */}
                      <line
                        x1={0}
                        y1={1e5}
                        x2={0}
                        y2={-1e5}
                        stroke="#EC4899"
                        strokeWidth={(isoPlane === "left" || isoPlane === "right" ? 2.2 : 1.2) / view.k}
                        strokeOpacity={isoPlane === "left" || isoPlane === "right" ? 0.9 : 0.45}
                      />

                      {/* Rótulos dos eixos isométricos com ângulos canônicos */}
                      <text
                        x={(40 * Math.cos(Math.PI / 6)) / view.k}
                        y={(-40 * Math.sin(Math.PI / 6) - 5) / view.k}
                        fontSize={8.5 / view.k}
                        fontFamily="ui-monospace, monospace"
                        fontWeight="700"
                        fill="#38BDF8"
                      >
                        +X (30°)
                      </text>
                      <text
                        x={(-40 * Math.cos(Math.PI / 6) - 35) / view.k}
                        y={(-40 * Math.sin(Math.PI / 6) - 5) / view.k}
                        fontSize={8.5 / view.k}
                        fontFamily="ui-monospace, monospace"
                        fontWeight="700"
                        fill="#F59E0B"
                      >
                        +Y (150°)
                      </text>
                      <text
                        x={6 / view.k}
                        y={-45 / view.k}
                        fontSize={8.5 / view.k}
                        fontFamily="ui-monospace, monospace"
                        fontWeight="700"
                        fill="#EC4899"
                      >
                        +Z (90°)
                      </text>
                    </>
                  ) : (
                    <>
                      {/* Setas Curtas e Nítidas de Orientação (~90 px visuais): +X (#E11D48) e +Y (#10B981 Escuro / #059669 Claro) */}
                      <line
                        x1={0}
                        y1={0}
                        x2={84 / view.k}
                        y2={0}
                        stroke={gridStyles.axisX}
                        strokeWidth={2 / view.k}
                      />
                      <polygon
                        points={`${90 / view.k},0 ${81 / view.k},${-3.4 / view.k} ${81 / view.k},${3.4 / view.k}`}
                        fill={gridStyles.axisX}
                      />
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2={84 / view.k}
                        stroke={gridStyles.axisY}
                        strokeWidth={2 / view.k}
                      />
                      <polygon
                        points={`0,${90 / view.k} ${-3.4 / view.k},${81 / view.k} ${3.4 / view.k},${81 / view.k}`}
                        fill={gridStyles.axisY}
                      />

                      {/* Marcadores de orientação positiva +X e +Y com offset seguro */}
                      <text
                        x={95 / view.k}
                        y={-5 / view.k}
                        fontSize={9.5 / view.k}
                        fontFamily='"JetBrains Mono", ui-monospace, monospace'
                        fontWeight="700"
                        fill={gridStyles.axisX}
                      >
                        +X
                      </text>
                      <text
                        x={7 / view.k}
                        y={98 / view.k}
                        fontSize={9.5 / view.k}
                        fontFamily='"JetBrains Mono", ui-monospace, monospace'
                        fontWeight="700"
                        fill={gridStyles.axisY}
                      >
                        +Y
                      </text>
                    </>
                  )}

                  {/* Marcador Circular Pequeno e Nítido de Origem (0,0) em Vermelho Carmesim (#DC143C) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={4.5 / view.k}
                    fill="none"
                    stroke="#DC143C"
                    strokeOpacity={0.85}
                    strokeWidth={1.3 / view.k}
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={2.1 / view.k}
                    fill="#DC143C"
                  />
                  <text
                    x={8 / view.k}
                    y={14 / view.k}
                    fontSize={9 / view.k}
                    fontFamily='"JetBrains Mono", ui-monospace, monospace'
                    fontWeight="700"
                    fill="#DC143C"
                  >
                    {drawingProjection === "isometric" ? "(0,0,0) ISO" : "(0,0)"}
                  </text>
                </g>
              )}

              {/* geometria principal: pintada no canvas sob este SVG */}

              {!solidOpen && draft && <EntityShape e={draft} k={view.k} preview />}

              {/* Forma em Pré-Confirmação Editável (Draft-Then-Commit) + Grips Interativos */}
              {!solidOpen && pendingDraftShape && (
                <g>
                  <EntityShape e={pendingDraftShape.entity} k={view.k} preview />
                  {getPendingDraftShapeGrips(pendingDraftShape).map((grip) => (
                    <g key={`draft-grip-${grip.index}`}>
                      <circle
                        cx={grip.p.x}
                        cy={grip.p.y}
                        r={9 / view.k}
                        fill="rgba(16, 185, 129, 0.22)"
                        stroke="none"
                      />
                      <circle
                        cx={grip.p.x}
                        cy={grip.p.y}
                        r={4.5 / view.k}
                        fill={grip.role === "center" ? "#38BDF8" : "#10B981"}
                        stroke="#FFFFFF"
                        strokeWidth={1.6 / view.k}
                      />
                    </g>
                  ))}
                </g>
              )}

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

              {/* PRÉVIA EM TEMPO REAL DA CONVERSÃO ISOMÉTRICA (MOTOR UNIVERSAL SÓLIDO HLR) */}
              {!solidOpen && isoPreview && isoPreview.entities.length > 0 && (
                <g className="chamfer-iso-live-preview pointer-events-none" opacity={0.96}>
                  {isoPreview.entities
                    .slice()
                    .sort(
                      (a, b) =>
                        ((a.params?.depth as number) ?? 0) - ((b.params?.depth as number) ?? 0),
                    )
                    .map((pe, idx) => (
                      <EntityShape
                        key={`iso-prev-${pe.id || idx}`}
                        e={pe}
                        k={view.k}
                        preview={!pe.params?.isIsoSolidFace}
                      />
                    ))}
                </g>
              )}

              {/* PRÉVIA EM TEMPO REAL DO COMPILADOR CHAMFER INTENT (GHOST PREVIEW ANTES DO COMMIT) */}
              {!solidOpen &&
                intentPreviewPlan?.compiled?.previewEntities &&
                intentPreviewPlan.compiled.previewEntities.length > 0 && (
                  <g className="chamfer-intent-live-preview pointer-events-none" opacity={0.9}>
                    {intentPreviewPlan.compiled.previewEntities.map((pe, idx) => (
                      <EntityShape
                        key={`intent-prev-${pe.id || idx}`}
                        e={pe}
                        k={view.k}
                        preview
                      />
                    ))}
                  </g>
                )}

              {/* PRÉVIA E MARCADORES DA ENGENHARIA REVERSA (PONTOS CAPTURADOS, CALIBRAÇÃO E AJUSTE ORTOGONAL LSQ) */}
              {!solidOpen && (() => {
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                return (
                  <g className="chamfer-reveng-overlay pointer-events-none">
                    {/* Pontos de contorno capturados */}
                    {revEngData.capturedPoints.map((pt, idx) => (
                      <g key={`reveng-cap-pt-${pt.id || idx}`}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={3.5 / safeK}
                          fill="#F59E0B"
                          stroke="#0B0F14"
                          strokeWidth={1.2 / safeK}
                        />
                        <text
                          x={pt.x + 5 / safeK}
                          y={pt.y - 4 / safeK}
                          fontSize={8.5 / safeK}
                          fontFamily="ui-monospace, monospace"
                          fontWeight="700"
                          fill="#FBBF24"
                        >
                          {`P${idx + 1}`}
                        </text>
                      </g>
                    ))}

                    {/* Pontos de calibração / homografia marcados no canvas */}
                    {revEngPickPoints.length >= 2 && (
                      <polyline
                        points={[
                          ...revEngPickPoints.map((p) => `${p.x},${p.y}`),
                          ...(revEngPickPoints.length === 4
                            ? [`${revEngPickPoints[0]!.x},${revEngPickPoints[0]!.y}`]
                            : []),
                        ].join(" ")}
                        fill={revEngPickPoints.length === 4 ? "rgba(56, 189, 248, 0.08)" : "none"}
                        stroke="#38BDF8"
                        strokeWidth={1.6 / safeK}
                        strokeDasharray={`${5 / safeK} ${3 / safeK}`}
                      />
                    )}
                    {revEngPickPoints.map((pt, idx) => (
                      <g key={`reveng-pick-${idx}`}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={4.5 / safeK}
                          fill="#E11D48"
                          stroke="#FFFFFF"
                          strokeWidth={1.4 / safeK}
                        />
                        <text
                          x={pt.x + 6 / safeK}
                          y={pt.y - 5 / safeK}
                          fontSize={9.5 / safeK}
                          fontFamily="ui-monospace, monospace"
                          fontWeight="700"
                          fill="#38BDF8"
                        >
                          {revEngCanvasMode === "pick_homography_4pt" ? `C${idx + 1}` : `REF ${idx + 1}`}
                        </text>
                      </g>
                    ))}

                    {/* Prévia da primitiva ajustada por mínimos quadrados ortogonais */}
                    {revEngFittedPreview?.entityPreview && (
                      <g opacity={0.95}>
                        <EntityShape e={revEngFittedPreview.entityPreview} k={safeK} preview />
                      </g>
                    )}
                  </g>
                );
              })()}

              {!solidOpen && pending.length > 0 && tool === "polyline" && (
                <polyline
                  points={pending.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={isDark ? PREVIEW_COLOR : "#475569"}
                  strokeWidth={1.4 / view.k}
                  strokeDasharray={`${4 / view.k} ${3 / view.k}`}
                />
              )}

              {/* NÓS E GRIPS TÉCNICOS DA SELEÇÃO (□ VÉRTICES, △ MEIOS, ⊕ CENTROS - SEÇÃO 3.2) */}
              {!solidOpen && (tool === "node" || tool === "select") && (() => {
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                const gripHalf = 3.4 / safeK;
                const snapDist = 15 / safeK;

                return (
                  <g className="cad-selection-grips">
                    {/* 1. Pontos Médios de Segmentos (△ Triângulo Técnico) */}
                    {selected.flatMap((e, eIdx) =>
                      segmentsOf(e).map((seg, sIdx) => {
                        if (!seg || !seg[0] || !seg[1]) return null;
                        const mx = (seg[0].x + seg[1].x) / 2;
                        const my = (seg[0].y + seg[1].y) / 2;
                        if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
                        const r = 2.8 / safeK;
                        const ptsStr = `${mx},${my - r} ${mx - r},${my + r * 0.85} ${mx + r},${my + r * 0.85}`;
                        return (
                          <polygon
                            key={`mid-grip-${e.id || eIdx}-${sIdx}`}
                            points={ptsStr}
                            fill={isDark ? "#090d14" : "#ffffff"}
                            stroke={isDark ? "#38BDF8" : "#0284C7"}
                            strokeWidth={1.2 / safeK}
                            opacity={0.82}
                          />
                        );
                      }),
                    )}

                    {/* 2. Vértices (□ Quadrado) e Centros (⊕ Círculo com Cruz) */}
                    {selected.flatMap((e, eIdx) =>
                      entityPoints(e)
                        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
                        .map((p, i) => {
                          const isCenterGrip = (e.type === "circle" || e.type === "arc") && i === 0;
                          const isHoveredOrActive =
                            (dragNode?.id === e.id && dragNode?.index === i) ||
                            dist(p, cursor) < snapDist;
                          const strokeCol = isHoveredOrActive
                            ? "#10B981"
                            : isDark
                              ? SELECTION_COLOR
                              : "#DC2626";
                          const fillCol = isHoveredOrActive
                            ? isDark
                              ? "rgba(16, 185, 129, 0.25)"
                              : "rgba(5, 150, 105, 0.2)"
                            : isDark
                              ? "#090d14"
                              : "#ffffff";

                          if (isCenterGrip) {
                            const cr = (isHoveredOrActive ? 4.4 : 3.6) / safeK;
                            return (
                              <g key={`node-center-${e.id || "ent"}-${eIdx}-${i}`}>
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={cr}
                                  fill={fillCol}
                                  stroke={strokeCol}
                                  strokeWidth={(isHoveredOrActive ? 1.8 : 1.4) / safeK}
                                />
                                <line
                                  x1={p.x - cr * 0.7}
                                  y1={p.y}
                                  x2={p.x + cr * 0.7}
                                  y2={p.y}
                                  stroke={strokeCol}
                                  strokeWidth={1.1 / safeK}
                                />
                                <line
                                  x1={p.x}
                                  y1={p.y - cr * 0.7}
                                  x2={p.x}
                                  y2={p.y + cr * 0.7}
                                  stroke={strokeCol}
                                  strokeWidth={1.1 / safeK}
                                />
                              </g>
                            );
                          }

                          const half = isHoveredOrActive ? gripHalf * 1.25 : gripHalf;
                          return (
                            <rect
                              key={`node-${e.id || "ent"}-${eIdx}-${i}`}
                              x={p.x - half}
                              y={p.y - half}
                              width={half * 2}
                              height={half * 2}
                              fill={fillCol}
                              stroke={strokeCol}
                              strokeWidth={(isHoveredOrActive ? 1.8 : 1.45) / safeK}
                            />
                          );
                        }),
                    )}
                  </g>
                );
              })()}

              {selBox &&
                Number.isFinite(selBox.minX) &&
                Number.isFinite(selBox.minY) &&
                Number.isFinite(selBox.maxX) &&
                Number.isFinite(selBox.maxY) &&
                selBox.maxX >= selBox.minX &&
                selBox.maxY >= selBox.minY && (
                <rect
                  x={selBox.minX}
                  y={selBox.minY}
                  width={selBox.maxX - selBox.minX}
                  height={selBox.maxY - selBox.minY}
                  fill="none"
                  stroke={isDark ? SELECTION_COLOR : "#DC2626"}
                  strokeOpacity={0.65}
                  strokeWidth={1 / (Number.isFinite(view.k) && view.k > 0 ? view.k : 1)}
                  strokeDasharray={`${5 / (Number.isFinite(view.k) && view.k > 0 ? view.k : 1)} ${4 / (Number.isFinite(view.k) && view.k > 0 ? view.k : 1)}`}
                />
              )}

              {marquee &&
                marquee.a &&
                marquee.b &&
                Number.isFinite(marquee.a.x) &&
                Number.isFinite(marquee.a.y) &&
                Number.isFinite(marquee.b.x) &&
                Number.isFinite(marquee.b.y) && (() => {
                  const isCrossing = marquee.b.x < marquee.a.x;
                  const marqueeColor = isCrossing ? "#10B981" : "#38BDF8";
                  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                  return (
                    <rect
                      x={Math.min(marquee.a.x, marquee.b.x)}
                      y={Math.min(marquee.a.y, marquee.b.y)}
                      width={Math.abs(marquee.b.x - marquee.a.x)}
                      height={Math.abs(marquee.b.y - marquee.a.y)}
                      fill={marqueeColor}
                      fillOpacity={0.12}
                      stroke={marqueeColor}
                      strokeWidth={1.4 / safeK}
                      strokeDasharray={isCrossing ? `${6 / safeK} ${4 / safeK}` : undefined}
                    />
                  );
                })()}

              {/* SWIPE-TO-TRIM PREVIEW: trechos cruzados pelo arraste destacados em vermelho */}
              {swipeTrimCutPreview.length > 0 && (() => {
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                return (
                  <g pointerEvents="none" aria-label="Pré-visualização Swipe-to-Trim">
                    {swipeTrimCutPreview.map(([pA, pB], idx) => (
                      <line
                        key={`st-cut-${idx}`}
                        x1={pA.x}
                        y1={pA.y}
                        x2={pB.x}
                        y2={pB.y}
                        stroke="#EF4444"
                        strokeWidth={3.2 / safeK}
                        strokeDasharray={`${5 / safeK} ${3 / safeK}`}
                      />
                    ))}
                  </g>
                );
              })()}

              {/* FEEDBACK VISUAL TEMPORÁRIO DURANTE EDIÇÃO MOBILE (REGRA 15) */}
              {activeEditingProp && selectedEntity && (() => {
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                let badgeX = 0;
                let badgeY = 0;
                if (selectedEntity.type === "circle" || selectedEntity.type === "arc") {
                  badgeX = selectedEntity.cx;
                  badgeY = selectedEntity.cy - selectedEntity.r - 12 / safeK;
                } else if (selectedEntity.type === "line") {
                  badgeX = (selectedEntity.x1 + selectedEntity.x2) / 2;
                  badgeY = (selectedEntity.y1 + selectedEntity.y2) / 2 - 12 / safeK;
                } else if (selectedEntity.type === "point") {
                  badgeX = selectedEntity.x;
                  badgeY = selectedEntity.y - 12 / safeK;
                }
                const hasValidBadge = Number.isFinite(badgeX) && Number.isFinite(badgeY);

                return (
                  <g pointerEvents="none" className="transition-opacity duration-150">
                    {selectedEntity.type === "circle" &&
                      Number.isFinite(selectedEntity.cx) &&
                      Number.isFinite(selectedEntity.cy) &&
                      Number.isFinite(selectedEntity.r) && (
                        <circle
                          cx={selectedEntity.cx}
                          cy={selectedEntity.cy}
                          r={selectedEntity.r}
                          fill="rgba(239, 68, 68, 0.08)"
                          stroke="#EF4444"
                          strokeWidth={2.2 / safeK}
                          strokeDasharray={`${6 / safeK} ${4 / safeK}`}
                        />
                      )}
                    {selectedEntity.type === "arc" &&
                      Number.isFinite(selectedEntity.cx) &&
                      Number.isFinite(selectedEntity.cy) &&
                      Number.isFinite(selectedEntity.r) && (
                        <circle
                          cx={selectedEntity.cx}
                          cy={selectedEntity.cy}
                          r={selectedEntity.r}
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth={2.2 / safeK}
                          strokeDasharray={`${6 / safeK} ${4 / safeK}`}
                        />
                      )}
                    {selectedEntity.type === "line" &&
                      Number.isFinite(selectedEntity.x1) &&
                      Number.isFinite(selectedEntity.y1) &&
                      Number.isFinite(selectedEntity.x2) &&
                      Number.isFinite(selectedEntity.y2) && (
                        <line
                          x1={selectedEntity.x1}
                          y1={selectedEntity.y1}
                          x2={selectedEntity.x2}
                          y2={selectedEntity.y2}
                          stroke="#EF4444"
                          strokeWidth={3 / safeK}
                          strokeOpacity={0.8}
                        />
                      )}
                    {hasValidBadge && (
                      <g transform={`translate(${badgeX} ${badgeY})`}>
                        <rect
                          x={-45 / safeK}
                          y={-11 / safeK}
                          width={90 / safeK}
                          height={22 / safeK}
                          rx={6 / safeK}
                          fill="rgba(15, 23, 42, 0.95)"
                          stroke="#EF4444"
                          strokeWidth={1.2 / safeK}
                        />
                        <text
                          x={0}
                          y={0}
                          fontSize={9.5 / safeK}
                          fontFamily="ui-monospace, monospace"
                          fontWeight="bold"
                          fill="#FFFFFF"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {activeEditingProp.label}: {activeEditingProp.value.toFixed(2)} {activeEditingProp.unit}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })()}

              {/* COTAS ASSOCIATIVAS — azul técnico (#38BDF8 escuro / #0284C7 claro), sempre medidas na geometria */}
              {drawnDims.map(({ d, draw }) => {
                const on = dimSel === d.id;
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                const dimColor = isDark ? "#38BDF8" : "#0284C7";
                return (
                  <g
                    key={d.id}
                    stroke={dimColor}
                    fill={dimColor}
                    strokeWidth={(on ? 1.8 : 1.1) / safeK}
                    opacity={on ? 1 : 0.94}
                    onPointerDown={() => setDimSel(d.id)}
                  >
                    {draw.lines.map((l, i) => {
                      if (
                        !l ||
                        !l[0] ||
                        !l[1] ||
                        !Number.isFinite(l[0].x) ||
                        !Number.isFinite(l[0].y) ||
                        !Number.isFinite(l[1].x) ||
                        !Number.isFinite(l[1].y)
                      )
                        return null;
                      return <line key={`l${i}`} x1={l[0].x} y1={l[0].y} x2={l[1].x} y2={l[1].y} />;
                    })}
                    {draw.arcs.map((a, i) => {
                      if (
                        !a ||
                        !a.c ||
                        !Number.isFinite(a.c.x) ||
                        !Number.isFinite(a.c.y) ||
                        !Number.isFinite(a.r) ||
                        !Number.isFinite(a.a0) ||
                        !Number.isFinite(a.a1)
                      )
                        return null;
                      return (
                        <path
                          key={`a${i}`}
                          fill="none"
                          d={`M ${a.c.x + a.r * Math.cos(a.a0)} ${a.c.y + a.r * Math.sin(a.a0)} A ${a.r} ${a.r} 0 ${Math.abs(a.a1 - a.a0) > Math.PI ? 1 : 0} 1 ${a.c.x + a.r * Math.cos(a.a1)} ${a.c.y + a.r * Math.sin(a.a1)}`}
                        />
                      );
                    })}
                    {draw.arrows.map((ar, i) => {
                      if (
                        !ar ||
                        !ar.p ||
                        !Number.isFinite(ar.p.x) ||
                        !Number.isFinite(ar.p.y) ||
                        !Number.isFinite(ar.angle)
                      )
                        return null;
                      const s = (d.style.arrowSize || 6) / safeK;
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
                    {draw.labels.map((l, i) => {
                      if (!l || !l.p || !Number.isFinite(l.p.x) || !Number.isFinite(l.p.y)) return null;
                      const parsedVal =
                        parseFloat(l.text.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
                      const angDeg = ((l.angle ?? 0) * 180) / Math.PI;
                      const flip = angDeg > 90 || angDeg < -90 ? 180 : 0;
                      const rot = angDeg + flip;
                      const sz = (d.style.textSize || 11) / safeK;
                      const txtLen = l.text.length;
                      return (
                        <g key={`t${i}`} transform={`rotate(${rot} ${l.p.x} ${l.p.y})`}>
                          {/* Máscara de respiro ABNT para proteger a legibilidade do texto contra linhas de fundo */}
                          <rect
                            x={l.p.x - (txtLen * sz * 0.3 + 4 / safeK)}
                            y={l.p.y - sz * 1.0}
                            width={txtLen * sz * 0.6 + 8 / safeK}
                            height={sz * 1.35}
                            fill={isDark ? "#151C27" : "#FFFFFF"}
                            fillOpacity={0.96}
                            rx={3 / safeK}
                            stroke={dimColor}
                            strokeOpacity={0.55}
                            strokeWidth={0.85 / safeK}
                          />
                          <text
                            x={l.p.x}
                            y={l.p.y - 2 / safeK}
                            fontSize={sz}
                            textAnchor="middle"
                            stroke="none"
                            fill={dimColor}
                            className="font-mono cursor-pointer hover:font-bold select-none font-semibold"
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              const r = svgRef.current?.getBoundingClientRect();
                              const screenX = l.p.x * safeK + (r?.left ?? 0) + view.tx;
                              const screenY = l.p.y * safeK + (r?.top ?? 0) + view.ty;
                              setDirectDimEditor({
                                open: true,
                                dimId: d.id,
                                pos: { x: screenX, y: screenY },
                                value: parsedVal,
                                label: l.text,
                              });
                            }}
                          >
                            {l.text}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* cotas automáticas de apoio */}
              {showDims &&
                autoDimsList.map((d, i) => {
                  if (
                    !d ||
                    !d.a ||
                    !d.b ||
                    !Number.isFinite(d.a.x) ||
                    !Number.isFinite(d.a.y) ||
                    !Number.isFinite(d.b.x) ||
                    !Number.isFinite(d.b.y)
                  )
                    return null;
                  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                  const mx = (d.a.x + d.b.x) / 2;
                  const my = (d.a.y + d.b.y) / 2;
                  const ang = (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
                  const flip = ang > 90 || ang < -90 ? 180 : 0;
                  const dimColor = isDark ? "#38BDF8" : "#0284C7";
                  return (
                    <g key={`dim-${i}`} stroke={dimColor} fill={dimColor}>
                      <line
                        x1={d.a.x}
                        y1={d.a.y}
                        x2={d.b.x}
                        y2={d.b.y}
                        strokeWidth={1 / safeK}
                        strokeDasharray={
                          d.kind === "radial" ? `${4 / safeK} ${3 / safeK}` : undefined
                        }
                      />
                      <text
                        x={mx}
                        y={my - 3 / safeK}
                        transform={`rotate(${ang + flip} ${mx} ${my})`}
                        fontSize={10 / safeK}
                        textAnchor="middle"
                        stroke="none"
                        className="font-mono font-medium"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}

              {[...measures, ...(liveMeasure ? [liveMeasure] : [])].map((m, i) => {
                if (
                  !m ||
                  !m.a ||
                  !m.b ||
                  !Number.isFinite(m.a.x) ||
                  !Number.isFinite(m.a.y) ||
                  !Number.isFinite(m.b.x) ||
                  !Number.isFinite(m.b.y)
                )
                  return null;
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                const dimColor = isDark ? "#38BDF8" : "#0284C7";
                return (
                  <g key={`measure-${i}`} stroke={dimColor} fill={dimColor}>
                    <line
                      x1={m.a.x}
                      y1={m.a.y}
                      x2={m.b.x}
                      y2={m.b.y}
                      strokeWidth={1 / safeK}
                      strokeDasharray={
                        liveMeasure && i === measures.length
                          ? `${5 / safeK} ${4 / safeK}`
                          : undefined
                      }
                    />
                    <text
                      x={(m.a.x + m.b.x) / 2}
                      y={(m.a.y + m.b.y) / 2 - 6 / safeK}
                      fontSize={11 / safeK}
                      textAnchor="middle"
                      stroke="none"
                      className="font-mono font-medium"
                    >
                      {dist(m.a, m.b).toFixed(2)} mm ·{" "}
                      {(
                        ((Math.atan2(-(m.b.y - m.a.y), m.b.x - m.a.x) * 180) / Math.PI + 360) %
                        360
                      ).toFixed(1)}
                      °
                    </text>
                  </g>
                );
              })}

              {issues?.map((is, i) => {
                if (!is || !is.p || !Number.isFinite(is.p.x) || !Number.isFinite(is.p.y)) return null;
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                return (
                  <circle
                    key={`issue-${i}`}
                    cx={is.p.x}
                    cy={is.p.y}
                    r={6 / safeK}
                    fill="none"
                    stroke={WARNING_COLOR}
                    strokeWidth={1.5 / safeK}
                  />
                );
              })}

              {/*
                FLUXO CALDRA e selos de sequência agora vivem no canvas de
                overlay (`flowRef`): geometria de UI, nunca exportada.
              */}

              {shareHint &&
                Number.isFinite(shareHint.p1?.x) &&
                Number.isFinite(shareHint.p1?.y) &&
                Number.isFinite(shareHint.p2?.x) &&
                Number.isFinite(shareHint.p2?.y) && (
                  <line
                    x1={shareHint.p1.x}
                    y1={shareHint.p1.y}
                    x2={shareHint.p2.x}
                    y2={shareHint.p2.y}
                    stroke={SELECTION_COLOR}
                    strokeWidth={5 / (Number.isFinite(view.k) && view.k > 0 ? view.k : 1)}
                    strokeOpacity={0.6}
                    strokeLinecap="round"
                  />
                )}

              {/* MIRA TÉCNICA VETORIAL + CROSSHAIR DINÂMICO + HASTE GUIA ELÁSTICA (ZERO-IDLE EM REPOUSO NO TOUCH) */}
              <ChamferTechnicalCursorSvg
                visible={
                  !solidOpen &&
                  tool !== "pan" &&
                  (activePointerType === "mouse" ||
                    touchOffsetActive ||
                    nudgeHudVisible ||
                    pending.length > 0 ||
                    dragNode !== null)
                }
                cursorWorld={cursor}
                touchWorld={touchWorldPos}
                touchOffsetActive={touchOffsetActive}
                activeSnap={smartSnap ?? snapHit}
                viewK={view.k}
                drawingProjection={drawingProjection}
                isoPlane={isoPlane}
                orthoOn={orthoOn}
                basePoint={pending.length > 0 ? pending[pending.length - 1] : null}
                isDark={isDark}
              />

              {/* SMART SNAP OVERLAY CAD DE PRECISÃO */}
              {snapOn && (
                <ChamferSmartSnapOverlay
                  activeSnap={smartSnap}
                  referencePoints={relevantRefs}
                  cursor={cursor}
                  viewK={view.k}
                  unit={unit}
                  isDark={isDark}
                  showAllSnaps={showAllSnaps}
                />
              )}

              {/* OVERLAY DE COTAS VIVAS, REFERÊNCIA DE CRIAÇÃO DE LINHA (AZUL) E REFERÊNCIA DE PONTO DE ENCONTRO (ROXA) */}
              {(() => {
                const selectedSingleLine =
                  selection.length === 1 && pending.length === 0
                    ? entities.find((e) => e.id === selection[0] && e.type === "line")
                    : null;
                const activeStartPt: Vec2 | null =
                  pending.length > 0
                    ? pending[pending.length - 1]!
                    : selectedSingleLine && selectedSingleLine.type === "line"
                      ? { x: selectedSingleLine.x1, y: selectedSingleLine.y1 }
                      : temporaryOrigin?.p ?? null;
                const overlayCursor: Vec2 =
                  selectedSingleLine && selectedSingleLine.type === "line" && pending.length === 0
                    ? { x: selectedSingleLine.x2, y: selectedSingleLine.y2 }
                    : cursor;
                const effectiveConstraints: DimensionalConstraints =
                  selectedSingleLine?.params?.lockedConstraints &&
                  typeof selectedSingleLine.params.lockedConstraints === "object"
                    ? {
                        ...lockedConstraints,
                        ...(selectedSingleLine.params.lockedConstraints as DimensionalConstraints),
                      }
                    : lockedConstraints;

                return (
                  <ChamferLiveDimensionsOverlay
                    temporaryOrigin={temporaryOrigin}
                    activeEdge={activeEdge}
                    activeEdgeSide={activeEdgeSide}
                    liveDimensions={liveDimensions}
                    viewK={view.k}
                    isDark={isDark}
                    cursor={overlayCursor}
                    activeStartPoint={activeStartPt}
                    pinnedMeetingPoints={pinnedMeetingPoints}
                    entities={entities}
                    selectedIds={selection}
                    pendingShape={pendingShapeSpec}
                    interactionGuideMode={interactionGuideMode}
                    lockedConstraints={effectiveConstraints}
                    isMultitouchNavigating={
                      isMultiTouchGestureRef.current ||
                      touchInteractionState === "MULTITOUCH_NAVIGATION" ||
                      touchInteractionState === "POST_GESTURE_COOLDOWN"
                    }
                    previewGeometricMarkCandidate={previewGeometricMarkCandidate}
                    pendingGeometricMarkConfirmation={pendingGeometricMarkConfirmation}
                    onConfirmPendingGeometricMark={() => {
                      if (!pendingGeometricMarkConfirmation) return;
                      const markEntity = pendingGeometricMarkConfirmation;
                      commit((prev) => [...prev, markEntity]);
                      setPendingGeometricMarkConfirmation(null);
                      previewGeometricMarkCandidateRef.current = null;
                      setPreviewGeometricMarkCandidate(null);
                      triggerHaptic("success");
                      toast.success(
                        `✓ Marco Geométrico Associativo (${markEntity.label ?? "Marco"}) inserido em (${markEntity.x.toFixed(1)}, ${markEntity.y.toFixed(1)}) mm.`,
                      );
                    }}
                    onStartRelationalFromPendingMark={() => {
                      if (!pendingGeometricMarkConfirmation) return;
                      const markEntity = pendingGeometricMarkConfirmation;
                      const spec = getGeometricMarkSpec(markEntity);
                      commit((prev) => [...prev, markEntity]);
                      setRelationalPicks((prev) => {
                        const nextPick: RelationalPickItem = {
                          point: { x: markEntity.x, y: markEntity.y },
                          entityId: spec?.parentEntityId,
                          label: markEntity.label,
                        };
                        if (prev.length >= 2) {
                          return [prev[prev.length - 1]!, nextPick];
                        }
                        if (
                          prev.length === 1 &&
                          Math.hypot(
                            prev[0]!.point.x - nextPick.point.x,
                            prev[0]!.point.y - nextPick.point.y,
                          ) < 1e-3
                        ) {
                          return prev;
                        }
                        return [...prev, nextPick];
                      });
                      setPendingGeometricMarkConfirmation(null);
                      previewGeometricMarkCandidateRef.current = null;
                      setPreviewGeometricMarkCandidate(null);
                      triggerHaptic("action");
                      toast.info(
                        relationalPicks.length === 0
                          ? "1º ponto relacional confirmado! Deslize até o 2º ponto SNAP e confirme para dividir o vão (÷N) ou achar o ponto médio."
                          : "2º ponto relacional capturado! Escolha a operação (⌖ Ponto Médio, ✕ Interseção ou ÷N).",
                      );
                    }}
                    onCancelPendingGeometricMark={() => {
                      setPendingGeometricMarkConfirmation(null);
                      previewGeometricMarkCandidateRef.current = null;
                      setPreviewGeometricMarkCandidate(null);
                      triggerHaptic("tap");
                    }}
                    onClearAllGeometricMarks={() => {
                      const res = clearGeometricMarksFromEntities(entities, false);
                      setPendingGeometricMarkConfirmation(null);
                      previewGeometricMarkCandidateRef.current = null;
                      setPreviewGeometricMarkCandidate(null);
                      setRelationalPicks([]);
                      if (res.removedCount > 0) {
                        commit(res.cleaned);
                        triggerHaptic("action");
                        toast.success(`🧹 ${res.removedCount} Marco(s) Geométrico(s) removido(s).`);
                      } else {
                        toast.info("Nenhum Marco Geométrico para limpar.");
                      }
                    }}
                    relationalPicks={relationalPicks}
                    onTriggerRelationalSynthesis={(mode: RelationalSynthesisMode, divN?: number) => {
                      if (relationalPicks.length < 2) return;
                      const pickA = relationalPicks[0]!;
                      const pickB = relationalPicks[1]!;
                      const entA = pickA.entityId ? entities.find((e) => e.id === pickA.entityId) ?? null : null;
                      const entB = pickB.entityId ? entities.find((e) => e.id === pickB.entityId) ?? null : null;
                      const newMarks = buildRelationalGeometricMarks(
                        pickA.point,
                        pickB.point,
                        entA,
                        entB,
                        mode,
                        activeLayer,
                        divN,
                      );
                      if (newMarks.length === 0) {
                        toast.warning("As duas referências são paralelas (sem interseção virtual).");
                        return;
                      }
                      commit((prev) => [...prev, ...newMarks]);
                      setRelationalPicks([]);
                      triggerHaptic("success");
                      toast.success(
                        mode === "span_division"
                          ? `✓ Vão dividido em ÷${divN ?? 2} (${newMarks.length} Marcos Geométricos associativos criados).`
                          : mode === "virtual_intersection"
                            ? "✓ Marco Geométrico de Interseção Virtual Projetada (✕) criado."
                            : "✓ Marco Geométrico de Ponto Médio / Simetria (⌖) criado.",
                      );
                    }}
                    onClearRelationalPicks={() => setRelationalPicks([])}
                    activeDatumComponent={activeDatumComponent?.component ?? null}
                    onSelectDatumComponent={(datumId, comp, currentVal, screenPos) => {
                      const datumEnt = datumId
                        ? entities.find((e) => e.id === datumId)
                        : entities.find((e) => isPersistentDatumEntity(e));
                      if (!datumEnt) return;
                      setActiveDatumComponent({ datumId: datumEnt.id, component: comp });
                      setSelection([datumEnt.id]);
                      const spec = getPersistentDatumSpec(datumEnt);
                      if (!spec) return;
                      const dimKindMap: Record<"dx" | "dy" | "L" | "angle", LiveDimension["kind"]> = {
                        dx: "dx",
                        dy: "dy",
                        L: "length",
                        angle: "angle",
                      };
                      const labelMap: Record<"dx" | "dy" | "L" | "angle", string> = {
                        dx: "Cateto Horizontal ΔX do Datum (mm)",
                        dy: "Cateto Vertical ΔY do Datum (mm)",
                        L: "Hipotenusa L do Datum (mm)",
                        angle: "Ângulo ∠ do Datum (°)",
                      };
                      setLiveDimEditor({
                        dim: {
                          id: `pdatum-${datumEnt.id}-${comp}`,
                          kind: dimKindMap[comp],
                          value: currentVal,
                          label: labelMap[comp],
                          startPoint: spec.origin,
                          endPoint: spec.target,
                          midPoint: {
                            x: (spec.origin.x + spec.target.x) / 2,
                            y: (spec.origin.y + spec.target.y) / 2,
                          },
                          normalDir: comp === "dx" ? { x: 0, y: 1 } : { x: 1, y: 0 },
                          isEditable: true,
                          targetKey: comp === "L" ? "length" : comp,
                          entityId: datumEnt.id,
                        },
                        screenPos,
                        currentValue: currentVal,
                        label: labelMap[comp],
                        allowInvert: false,
                        measureKind: comp,
                        initialLocked: false,
                      });
                    }}
                    onConvertDatumToLines={(datumId, component, originPt, targetPt) => {
                      const datumEnt = datumId ? entities.find((e) => e.id === datumId) : undefined;
                      const spec = datumEnt ? getPersistentDatumSpec(datumEnt) : null;
                      const effOrigin = spec?.origin ?? originPt ?? temporaryOrigin?.p;
                      const effTarget = spec?.target ?? targetPt ?? cursor;
                      if (!effOrigin || !effTarget) return;
                      const lines = convertDatumToCadLines(effOrigin, effTarget, component, activeLayer);
                      if (lines.length === 0) {
                        toast.info("Medida nula neste cateto para gerar linha.");
                        return;
                      }
                      commit((prev) => [...prev, ...lines]);
                      setSelection(lines.map((l) => l.id));
                      triggerHaptic("success");
                      toast.success(
                        component === "both_legs"
                          ? `✓ 2 linhas ortogonais dos catetos (ΔX + ΔY) geradas no projeto.`
                          : `✓ Linha ${component === "dx" ? "ΔX" : component === "dy" ? "ΔY" : "L"} gerada a partir do Datum.`,
                      );
                    }}
                    onConfirmReferenceAction={(originPt, targetPt, mode) => {
                      if (mode === "blue_line") {
                        // Persiste o DATUM com projeção nos dois catetos (ΔX, ΔY) e hipotenusa (L, ∠) no projeto e no Undo/Redo (Seção 3.1)
                        const len = Math.hypot(targetPt.x - originPt.x, targetPt.y - originPt.y);
                        if (len < 0.05) {
                          toast.info("Desloque o ponto final para fixar o Vetor Datum.");
                          return;
                        }
                        const datumEntity = createPersistentDatumEntity(originPt, targetPt, activeLayer);
                        commit((prev) => [...prev, datumEntity]);
                        setSelection([datumEntity.id]);
                        setPending([]);
                        setDraft(null);
                        setTemporaryOrigin({
                          id: "ref_origin",
                          p: { x: targetPt.x, y: targetPt.y },
                          label: "REF 0,0",
                        });
                        triggerHaptic("success");
                        toast.success(
                          `✓ Datum Persistente fixado (ΔX ${(targetPt.x - originPt.x).toFixed(1)}, ΔY ${(targetPt.y - originPt.y).toFixed(1)}, L ${len.toFixed(1)} mm).`,
                        );
                      } else if (mode === "purple_ref") {
                        // Cria Marco Geométrico Associativo Violeta (+) somente sobre ponto SNAP de entidade real (PROIBIDO criar ÓRFÃO no vazio!)
                        const fixedPt: Vec2 = {
                          x: Number(targetPt.x.toFixed(4)),
                          y: Number(targetPt.y.toFixed(4)),
                        };
                        const markEnt = inferValidGeometricMarkCandidate(
                          fixedPt,
                          entities,
                          activeLayer,
                          smartSnap,
                          55 / view.k,
                        );
                        if (!markEnt) {
                          toast.info(
                            "Posicione a Mira 55px sobre um ponto real da geometria (Centro, Vértice, Ponto Médio, Interseção, Quadrante ou Tangência).",
                          );
                          return;
                        }
                        commit((prev) => [...prev, markEnt]);
                        cursorRef.current = fixedPt;
                        setCursor(fixedPt);
                        triggerHaptic("success");
                        toast.success(
                          `✓ Marco Geométrico Associativo (+) criado em (${fixedPt.x.toFixed(1)}, ${fixedPt.y.toFixed(1)}) mm.`,
                        );
                      }
                    }}
                    onCancelReferenceAction={() => {
                      setLockedConstraints({});
                      if (temporaryOrigin) {
                        const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                        const resetTarget: Vec2 = {
                          x: Number((temporaryOrigin.p.x + 80 / safeK).toFixed(2)),
                          y: Number((temporaryOrigin.p.y - 60 / safeK).toFixed(2)),
                        };
                        cursorRef.current = resetTarget;
                        setCursor(resetTarget);
                      }
                      setPending([]);
                      setDraft(null);
                      triggerHaptic("selection");
                      toast.info("Deslocamento da referência cancelado.");
                    }}
                    onEditMeasure={(kind, currentVal, screenPos) => {
                      preEditKeypadSnapshotRef.current = {
                        cursor: { ...cursor },
                        draft: draft ? { ...draft } : null,
                      };
                      const anchorPt =
                        interactionGuideMode === "purple_ref" && temporaryOrigin
                          ? temporaryOrigin.p
                          : activeStartPt ?? temporaryOrigin?.p ?? { x: 0, y: 0 };
                      const dimKindMap: Record<ConstrainableMeasureKind, LiveDimension["kind"]> = {
                        dx: "dx",
                        dy: "dy",
                        L: "length",
                        angle: "angle",
                        d: "distance",
                        offset: "offset",
                        u_along: "u_along",
                        radius: "radius",
                        diameter: "diameter",
                      };
                      const labelMap: Record<ConstrainableMeasureKind, string> = {
                        dx:
                          interactionGuideMode === "purple_ref"
                            ? "ΔX do Ponto de Encontro (mm)"
                            : "ΔX da Linha (mm)",
                        dy:
                          interactionGuideMode === "purple_ref"
                            ? "ΔY do Ponto de Encontro (mm)"
                            : "ΔY da Linha (mm)",
                        L: "Comprimento L da Linha (mm)",
                        angle: "Ângulo Livre ∠ da Linha (°)",
                        d: "Distância Diagonal d (mm)",
                        offset: "Offset (mm)",
                        u_along: "Posição Longitudinal u (mm)",
                        radius: "Raio R (mm)",
                        diameter: "Diâmetro Ø (mm)",
                      };
                      const isCurrentlyLocked =
                        (kind === "L" && effectiveConstraints.lockedL != null) ||
                        (kind === "angle" && effectiveConstraints.lockedAngle != null) ||
                        (kind === "dx" && effectiveConstraints.lockedDx != null) ||
                        (kind === "dy" && effectiveConstraints.lockedDy != null) ||
                        (kind === "d" && effectiveConstraints.lockedDist != null);

                      const targetDim: LiveDimension = {
                        id: `guide-${kind}`,
                        kind: dimKindMap[kind],
                        value: currentVal,
                        label: labelMap[kind],
                        startPoint: anchorPt,
                        endPoint: overlayCursor,
                        midPoint: {
                          x: (anchorPt.x + overlayCursor.x) / 2,
                          y: (anchorPt.y + overlayCursor.y) / 2,
                        },
                        normalDir: kind === "dx" ? { x: 0, y: 1 } : { x: 1, y: 0 },
                        isEditable: true,
                        targetKey: kind === "L" ? "length" : kind === "d" ? "distance" : kind,
                        entityId: selectedSingleLine?.id,
                      };
                      setLiveDimEditor({
                        dim: targetDim,
                        screenPos,
                        currentValue: currentVal,
                        label: labelMap[kind],
                        allowInvert: false,
                        measureKind: kind,
                        initialLocked: isCurrentlyLocked,
                      });
                    }}
                    onEditDelta={(axis, currentVal, screenPos) => {
                      preEditKeypadSnapshotRef.current = {
                        cursor: { ...cursor },
                        draft: draft ? { ...draft } : null,
                      };
                      const pStart = temporaryOrigin?.p ?? { x: 0, y: 0 };
                      const targetDim: LiveDimension = {
                        id: `ref-${axis}`,
                        kind: axis,
                        value: currentVal,
                        label: `Δ${axis.toUpperCase()}`,
                        startPoint: pStart,
                        endPoint: cursor,
                        midPoint: { x: (pStart.x + cursor.x) / 2, y: (pStart.y + cursor.y) / 2 },
                        normalDir: axis === "dx" ? { x: 0, y: 1 } : { x: 1, y: 0 },
                        isEditable: true,
                        targetKey: axis,
                      };
                      setLiveDimEditor({
                        dim: targetDim,
                        screenPos,
                        currentValue: currentVal,
                        label: `Δ${axis.toUpperCase()} a partir da REF (mm)`,
                        allowInvert: false,
                        measureKind: axis,
                        initialLocked:
                          axis === "dx"
                            ? effectiveConstraints.lockedDx != null
                            : effectiveConstraints.lockedDy != null,
                      });
                    }}
                    onDimensionClick={(dim, screenPos) => {
                      preEditKeypadSnapshotRef.current = {
                        cursor: { ...cursor },
                        draft: draft ? { ...draft } : null,
                      };
                      setLiveDimEditor({
                        dim,
                        screenPos,
                        currentValue: dim.value,
                        label: dim.label,
                        allowInvert: dim.kind === "offset",
                      });
                    }}
                    onClearTemporaryOrigin={() => {
                      setTemporaryOrigin(null);
                      setPinnedMeetingPoints([]);
                      toast.success("Vetor Datum limpo");
                    }}
                    onUnlockMeasure={(kind) => {
                      setLockedConstraints((prev) => {
                        const next = { ...prev };
                        if (kind === "L") delete next.lockedL;
                        if (kind === "angle") delete next.lockedAngle;
                        if (kind === "dx") delete next.lockedDx;
                        if (kind === "dy") delete next.lockedDy;
                        if (kind === "d") delete next.lockedDist;
                        return next;
                      });
                      if (kind === "L") {
                        setLockedDims((prev) => ({ ...prev, lockedLengthMm: null }));
                      } else if (kind === "angle") {
                        setLockedDims((prev) => ({ ...prev, lockedAngleDeg: null }));
                      }
                      triggerHaptic("tap");
                      toast.info(`Trava ${kind.toUpperCase()} destravada`);
                    }}
                    onInvertEdgeSide={() => {
                      setActiveEdgeSide((prev) => (prev === 1 ? -1 : 1));
                      triggerHaptic("selection");
                    }}
                  />
                );
              })()}

              {/* SMART TRIM SVG PREVIEW */}
              {tool === "smart_trim" && (
                <ChamferSmartTrimSvgOverlay
                  preview={smartTrimPreview}
                  viewK={view.k}
                />
              )}

              {/* PRÉ-VISUALIZAÇÃO DE CENTRALIZAR FORMAS */}
              {centerDialogOpen &&
                centerPreview &&
                centerPreview.targetCenter &&
                Number.isFinite(centerPreview.targetCenter.x) &&
                Number.isFinite(centerPreview.targetCenter.y) && (() => {
                  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                  return (
                    <g pointerEvents="none" aria-label="Pré-visualização de centralização">
                      {centerPreview.transformed.map((e) => {
                        const segs = segmentsOf(e);
                        return segs.map((s, idx) => {
                          if (!s || !s[0] || !s[1] || !Number.isFinite(s[0].x) || !Number.isFinite(s[0].y) || !Number.isFinite(s[1].x) || !Number.isFinite(s[1].y)) return null;
                          return (
                            <line
                              key={`cprev-${e.id}-${idx}`}
                              x1={s[0].x}
                              y1={s[0].y}
                              x2={s[1].x}
                              y2={s[1].y}
                              stroke="#06b6d4"
                              strokeWidth={2 / safeK}
                              strokeDasharray={`${6 / safeK},${3 / safeK}`}
                              strokeOpacity={0.85}
                            />
                          );
                        });
                      })}
                      {/* Centro Alvo */}
                      <circle
                        cx={centerPreview.targetCenter.x}
                        cy={centerPreview.targetCenter.y}
                        r={7 / safeK}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth={1.5 / safeK}
                      />
                      <line
                        x1={centerPreview.targetCenter.x - 10 / safeK}
                        y1={centerPreview.targetCenter.y}
                        x2={centerPreview.targetCenter.x + 10 / safeK}
                        y2={centerPreview.targetCenter.y}
                        stroke="#06b6d4"
                        strokeWidth={1.2 / safeK}
                      />
                      <line
                        x1={centerPreview.targetCenter.x}
                        y1={centerPreview.targetCenter.y - 10 / safeK}
                        x2={centerPreview.targetCenter.x}
                        y2={centerPreview.targetCenter.y + 10 / safeK}
                        stroke="#06b6d4"
                        strokeWidth={1.2 / safeK}
                      />
                    </g>
                  );
                })()}

              {/* PRÉ-VISUALIZAÇÃO DE FILETE */}
              {tool === "fillet" &&
                filletPreview &&
                filletPreview.corner?.corner &&
                Number.isFinite(filletPreview.corner.corner.x) &&
                Number.isFinite(filletPreview.corner.corner.y) && (() => {
                  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                  return (
                    <g pointerEvents="none" aria-label="Pré-visualização do filete">
                      <circle
                        cx={filletPreview.corner.corner.x}
                        cy={filletPreview.corner.corner.y}
                        r={7 / safeK}
                        fill="#06b6d4"
                        fillOpacity={0.25}
                        stroke="#06b6d4"
                        strokeWidth={1.8 / safeK}
                      />
                      {(() => {
                        const c = filletPreview.calc;
                        if (!c || !c.arcCenter || !Number.isFinite(c.arcCenter.x) || !Number.isFinite(c.arcCenter.y) || !Number.isFinite(c.radius)) return null;
                        const f = (n: number) => n.toFixed(3);
                        const p0 = {
                          x: c.arcCenter.x + c.radius * Math.cos(c.startAngle),
                          y: c.arcCenter.y + c.radius * Math.sin(c.startAngle),
                        };
                        const p1 = {
                          x: c.arcCenter.x + c.radius * Math.cos(c.endAngle),
                          y: c.arcCenter.y + c.radius * Math.sin(c.endAngle),
                        };
                        let sweep = c.endAngle - c.startAngle;
                        while (sweep < 0) sweep += Math.PI * 2;
                        const large = sweep > Math.PI ? 1 : 0;
                        const d = `M ${f(p0.x)} ${f(p0.y)} A ${f(c.radius)} ${f(c.radius)} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`;
                        return (
                          <path
                            d={d}
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth={2.5 / safeK}
                            strokeDasharray={`${6 / safeK},${3 / safeK}`}
                          />
                        );
                      })()}
                    </g>
                  );
                })()}

              {/* PRÉ-VISUALIZAÇÃO DE CHANFRO */}
              {tool === "chamfer" &&
                chamferPreview &&
                chamferPreview.corner?.corner &&
                Number.isFinite(chamferPreview.corner.corner.x) &&
                Number.isFinite(chamferPreview.corner.corner.y) &&
                chamferPreview.calc?.cutPointA &&
                Number.isFinite(chamferPreview.calc.cutPointA.x) &&
                Number.isFinite(chamferPreview.calc.cutPointA.y) &&
                chamferPreview.calc?.cutPointB &&
                Number.isFinite(chamferPreview.calc.cutPointB.x) &&
                Number.isFinite(chamferPreview.calc.cutPointB.y) && (() => {
                  const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                  return (
                    <g pointerEvents="none" aria-label="Pré-visualização do chanfro">
                      <circle
                        cx={chamferPreview.corner.corner.x}
                        cy={chamferPreview.corner.corner.y}
                        r={7 / safeK}
                        fill="#f59e0b"
                        fillOpacity={0.25}
                        stroke="#f59e0b"
                        strokeWidth={1.8 / safeK}
                      />
                      <line
                        x1={chamferPreview.calc.cutPointA.x}
                        y1={chamferPreview.calc.cutPointA.y}
                        x2={chamferPreview.calc.cutPointB.x}
                        y2={chamferPreview.calc.cutPointB.y}
                        stroke="#f59e0b"
                        strokeWidth={2.5 / safeK}
                        strokeDasharray={`${6 / safeK},${3 / safeK}`}
                      />
                    </g>
                  );
                })()}

              {/* PRÉ-VISUALIZAÇÃO DE PADRÃO GEOMÉTRICO (ARRAY POLAR / LINEAR ENRIQUECIDO) */}
              {activeArrayType !== null && arrayPreview && (() => {
                const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;
                const isError = !arrayValidation.isValid;
                const baseStrokeColor = isError ? "#ef4444" : "#06b6d4";
                const guides = arrayPreview.guides;
                const pcdCycle = 10 / safeK;
                const pcdDashOffset =
                  (arrayPolarParams.clockwise ? 1 : -1) *
                  computeFlowDashOffset(arrayAnimNowMs, pcdCycle, 0.025 / safeK);
                const axisCycle = 12 / safeK;
                const axisDashOffset = computeFlowDashOffset(
                  arrayAnimNowMs,
                  axisCycle,
                  0.03 / safeK,
                );

                const renderGhostEntity = (
                  inst: Entity,
                  keyPrefix: string,
                  color: string,
                  opacity: number,
                  dashed = true,
                ) => {
                  if (inst.type === "circle") {
                    return (
                      <g key={keyPrefix} opacity={opacity}>
                        <circle
                          cx={inst.cx}
                          cy={inst.cy}
                          r={inst.r}
                          fill={color}
                          fillOpacity={0.14}
                          stroke={color}
                          strokeWidth={2 / safeK}
                          strokeDasharray={dashed ? `${5 / safeK},${3 / safeK}` : undefined}
                        />
                        <circle cx={inst.cx} cy={inst.cy} r={2.2 / safeK} fill={color} />
                      </g>
                    );
                  }
                  if (inst.type === "arc") {
                    const sweep = inst.a1 - inst.a0;
                    const large = Math.abs(sweep) > Math.PI ? 1 : 0;
                    const p0x = inst.cx + inst.r * Math.cos(inst.a0);
                    const p0y = inst.cy + inst.r * Math.sin(inst.a0);
                    const p1x = inst.cx + inst.r * Math.cos(inst.a1);
                    const p1y = inst.cy + inst.r * Math.sin(inst.a1);
                    const d = `M ${p0x.toFixed(2)} ${p0y.toFixed(2)} A ${inst.r.toFixed(2)} ${inst.r.toFixed(2)} 0 ${large} 1 ${p1x.toFixed(2)} ${p1y.toFixed(2)}`;
                    return (
                      <path
                        key={keyPrefix}
                        d={d}
                        fill="none"
                        stroke={color}
                        strokeWidth={2 / safeK}
                        strokeDasharray={dashed ? `${5 / safeK},${3 / safeK}` : undefined}
                        opacity={opacity}
                      />
                    );
                  }
                  const segs = segmentsOf(inst);
                  return (
                    <g key={keyPrefix} opacity={opacity}>
                      {segs.map((s, sIdx) => {
                        if (!s || !s[0] || !s[1]) return null;
                        return (
                          <line
                            key={`${keyPrefix}-seg-${sIdx}`}
                            x1={s[0].x}
                            y1={s[0].y}
                            x2={s[1].x}
                            y2={s[1].y}
                            stroke={color}
                            strokeWidth={2 / safeK}
                            strokeDasharray={dashed ? `${5 / safeK},${3 / safeK}` : undefined}
                          />
                        );
                      })}
                    </g>
                  );
                };

                return (
                  <g pointerEvents="none" aria-label="Pré-visualização do padrão geométrico">
                    {/* CÍRCULO PCD GUIA COM ANIMAÇÃO DE FLUXO DIRECIONAL (CW / CCW) */}
                    {guides.pcdCircle && Number.isFinite(guides.pcdCircle.cx) && (
                      <circle
                        cx={guides.pcdCircle.cx}
                        cy={guides.pcdCircle.cy}
                        r={guides.pcdCircle.r}
                        fill="none"
                        stroke={baseStrokeColor}
                        strokeWidth={1.6 / safeK}
                        strokeDasharray={`${6 / safeK},${4 / safeK}`}
                        strokeDashoffset={pcdDashOffset}
                        strokeOpacity={0.78}
                      />
                    )}

                    {/* LINHAS RADIAIS (POLAR) */}
                    {guides.radialLines?.map((line, idx) => (
                      <line
                        key={`guide-rad-${idx}`}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke={baseStrokeColor}
                        strokeWidth={1 / safeK}
                        strokeDasharray={`${3 / safeK},${3 / safeK}`}
                        strokeOpacity={0.38}
                      />
                    ))}

                    {/* EIXOS DIRECIONAIS X/Y COM ANIMAÇÃO DE FLUXO DIRECIONAL (LINEAR) */}
                    {guides.axes?.map((axis, idx) => (
                      <line
                        key={`guide-axis-${idx}`}
                        x1={axis.x1}
                        y1={axis.y1}
                        x2={axis.x2}
                        y2={axis.y2}
                        stroke={baseStrokeColor}
                        strokeWidth={1.8 / safeK}
                        strokeDasharray={`${8 / safeK},${4 / safeK}`}
                        strokeDashoffset={axisDashOffset}
                        strokeOpacity={0.8}
                      />
                    ))}

                    {/* CENTROS CANDIDATOS (QUANDO CONFIANÇA MÉDIA / MÚLTIPLOS CENTROS) */}
                    {activeArrayType === "polar" &&
                      arrayHostInfo.candidateCenters.length > 1 &&
                      arrayHostInfo.candidateCenters.map((cand, cIdx) => {
                        const isSelected =
                          dist(cand.point, arrayPolarParams.center) < 0.1;
                        if (isSelected) return null;
                        return (
                          <g key={`cand-center-${cIdx}`} opacity={0.85}>
                            <circle
                              cx={cand.point.x}
                              cy={cand.point.y}
                              r={10 / safeK}
                              fill="rgba(245, 158, 11, 0.12)"
                              stroke="#f59e0b"
                              strokeWidth={1.5 / safeK}
                              strokeDasharray={`${3 / safeK},${2 / safeK}`}
                            />
                            <circle
                              cx={cand.point.x}
                              cy={cand.point.y}
                              r={2.5 / safeK}
                              fill="#f59e0b"
                            />
                          </g>
                        );
                      })}

                    {/* PIVÔ CENTRAL ARRASTÁVEL VERMELHO CARMESIM (#DC143C) DO PADRÃO POLAR */}
                    {guides.center && Number.isFinite(guides.center.x) && (
                      <g>
                        <circle
                          cx={guides.center.x}
                          cy={guides.center.y}
                          r={18 / safeK}
                          fill="rgba(220, 20, 60, 0.08)"
                          stroke={isArrayPickingCenter ? "#f59e0b" : CRIMSON_RED_RING}
                          strokeWidth={1.3 / safeK}
                          strokeDasharray={`${4 / safeK},${3 / safeK}`}
                        />
                        <circle
                          cx={guides.center.x}
                          cy={guides.center.y}
                          r={7 / safeK}
                          fill="none"
                          stroke={isArrayPickingCenter ? "#f59e0b" : CRIMSON_RED_CENTER}
                          strokeWidth={2 / safeK}
                        />
                        <circle
                          cx={guides.center.x}
                          cy={guides.center.y}
                          r={3.2 / safeK}
                          fill={isArrayPickingCenter ? "#f59e0b" : CRIMSON_RED_CENTER}
                        />
                        <line
                          x1={guides.center.x - 13 / safeK}
                          y1={guides.center.y}
                          x2={guides.center.x + 13 / safeK}
                          y2={guides.center.y}
                          stroke={isArrayPickingCenter ? "#f59e0b" : CRIMSON_RED_CENTER}
                          strokeWidth={1.5 / safeK}
                        />
                        <line
                          x1={guides.center.x}
                          y1={guides.center.y - 13 / safeK}
                          x2={guides.center.x}
                          y2={guides.center.y + 13 / safeK}
                          stroke={isArrayPickingCenter ? "#f59e0b" : CRIMSON_RED_CENTER}
                          strokeWidth={1.5 / safeK}
                        />
                      </g>
                    )}

                    {/* PRÉ-VISUALIZAÇÃO DA SEMENTE k=0 QUANDO REPOSICIONADA ([ ⌖ Centralizar na aba ] ou Auto-Fit) */}
                    {arrayPreview.repositionedOriginals?.map((origEnt, oIdx) =>
                      renderGhostEntity(
                        origEnt,
                        `repositioned-orig-${oIdx}`,
                        "#10b981",
                        0.95,
                        true,
                      ),
                    )}

                    {/* SLOTS FANTASMA (ATIVOS, OMITIDOS E COM DIAGNÓSTICO DE COLISÃO INDIVIDUAL) */}
                    {arrayPreview.ghostSlots.map((slot) => {
                      const diag = arrayValidation.slotDiagnostics[slot.index];
                      const slotColor =
                        diag?.status === "error"
                          ? "#ef4444"
                          : diag?.status === "warning"
                            ? "#f59e0b"
                            : "#06b6d4";

                      return (
                        <g key={`ghost-slot-${slot.index}`}>
                          {!slot.isOriginal &&
                            slot.entities.map((inst, eIdx) =>
                              renderGhostEntity(
                                inst,
                                `slot-${slot.index}-ent-${eIdx}`,
                                slot.isSkipped ? "#64748b" : slotColor,
                                slot.isSkipped ? 0.32 : 0.9,
                                true,
                              ),
                            )}

                          {/* Ícone ✕ discreto em instâncias omitidas pelo usuário (1-Tap Skip) */}
                          {slot.isSkipped && !slot.isOriginal && (
                            <g>
                              <circle
                                cx={slot.center.x}
                                cy={slot.center.y}
                                r={8 / safeK}
                                fill="rgba(15, 23, 42, 0.85)"
                                stroke="#64748b"
                                strokeWidth={1.2 / safeK}
                              />
                              <line
                                x1={slot.center.x - 4 / safeK}
                                y1={slot.center.y - 4 / safeK}
                                x2={slot.center.x + 4 / safeK}
                                y2={slot.center.y + 4 / safeK}
                                stroke="#94a3b8"
                                strokeWidth={1.6 / safeK}
                              />
                              <line
                                x1={slot.center.x + 4 / safeK}
                                y1={slot.center.y - 4 / safeK}
                                x2={slot.center.x - 4 / safeK}
                                y2={slot.center.y + 4 / safeK}
                                stroke="#94a3b8"
                                strokeWidth={1.6 / safeK}
                              />
                            </g>
                          )}

                          {/* Sem rótulos de texto sobrepostos no canvas: colisão indicada apenas pelo contorno tracejado vermelho/âmbar */}
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </g>
          </svg>

          {/* BOTÃO RÁPIDO [ 🧹 Limpar Marcos ] QUANDO O MARCO GEOMÉTRICO ESTÁ ATIVO OU HÁ MARCOS NO PROJETO */}
          {!solidOpen &&
            activeMode !== "3d" &&
            (interactionGuideMode === "purple_ref" ||
              entities.some((e) => isGeometricMarkEntity(e))) && (
              <div className="pointer-events-auto absolute top-8 right-3 z-30 flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="clear-geometric-marks-hud-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const res = clearGeometricMarksFromEntities(entities, false);
                    setPendingGeometricMarkConfirmation(null);
                    previewGeometricMarkCandidateRef.current = null;
                    setPreviewGeometricMarkCandidate(null);
                    setRelationalPicks([]);
                    if (res.removedCount > 0) {
                      commit(res.cleaned);
                      triggerHaptic("action");
                      toast.success(`🧹 ${res.removedCount} Marco(s) Geométrico(s) removido(s).`);
                    } else {
                      toast.info("Nenhum Marco Geométrico para limpar.");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold shadow-md transition-colors",
                    isDark
                      ? "border-purple-500/60 bg-slate-950/90 text-purple-200 hover:bg-purple-950/80"
                      : "border-purple-500/70 bg-white/95 text-purple-800 hover:bg-purple-50",
                  )}
                  title="Remover todos os Marcos Geométricos do plano atual"
                >
                  <span>🧹 Limpar Marcos</span>
                </button>
              </div>
            )}

          {activeMode !== "3d" && (
            <Rulers
              view={view}
              isDark={isDark}
              themeColors={themeColors}
              majorStep={gridConfig.majorStep}
              unit={unit}
              width={canvasSize.w}
              height={canvasSize.h}
              cursor={cursor}
              frame={frame}
              compactPortrait={!isLandscape}
              onCenterWorkspace={() => {
                triggerHaptic("selection");
                fitFrame();
                toast.info(`Área de Trabalho (${Math.round(frame.w)} × ${Math.round(frame.h)} mm) enquadrada na tela`);
              }}
            />
          )}

          {/* HOST ÚNICO DE NOTIFICAÇÕES COMPACTAS DO CHAMFER CAD (ANCORADO NO TOPO CENTRAL DO CANVAS, ~8PX ABAIXO DA RÉGUA HORIZONTAL) */}
          <ChamferCompactToastHost
            themeMode={themeColors.mode}
            accentColor={themeColors.accent}
            isLandscape={isLandscape}
            hasTopCommandBanner={
              isLandscape && (divideEditorOpen || tool === "fillet" || tool === "chamfer")
            }
          />

          {/* MICRO-PÍLULA TRANSLÚCIDA FLUTUANTE NO CANTO INFERIOR ESQUERDO DO CANVAS EM MODO RETRATO (OCULTA NO MODO CAD 3D) */}
          {!isLandscape && !focus && !solidOpen && activeMode !== "3d" && (
            <ChamferPortraitCanvasMicroPill
              isDark={isDark}
              planName={project?.plans.find((p) => p.id === planId)?.name ?? "P01"}
              plans={project?.plans.map((p) => ({ id: p.id, name: p.name })) ?? [{ id: planId, name: "P01" }]}
              activePlanId={planId}
              onSelectPlan={(nextPlanId) => {
                if (!project || nextPlanId === planId) return;
                const targetPlan = project.plans.find((x) => x.id === nextPlanId);
                if (!targetPlan) return;
                setProject((prev) =>
                  prev
                    ? {
                        ...prev,
                        plans: prev.plans.map((x) =>
                          x.id === planId
                            ? { ...x, entities, groups, dims, cad3dTreeJson, revEng: revEngData }
                            : x,
                        ),
                      }
                    : prev,
                );
                setPlanId(targetPlan.id);
                setEntities(targetPlan.entities ?? []);
                setGroups(targetPlan.groups ?? []);
                setDims(targetPlan.dims ?? []);
                setCad3dTreeJson(targetPlan.cad3dTreeJson);
                setRevEngData(sanitizeRevEngPlanData(targetPlan.revEng));
                setSelection([]);
              }}
              onCreatePlan={() => {
                if (!project) return;
                const plan = emptyPlan(project.plans.length);
                plan.name = planLabel(project.plans.length);
                const next: Project = {
                  ...project,
                  plans: [
                    ...project.plans.map((x) =>
                      x.id === planId
                        ? { ...x, entities, groups, dims, cad3dTreeJson, revEng: revEngData }
                        : x,
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
                setCad3dTreeJson(undefined);
                setRevEngData(createDefaultRevEngPlanData());
                setSelection([]);
                toast.success(`${plan.name} criado.`);
              }}
              cursor={cursor}
              snapOn={snapOn}
              onToggleSnap={() => setSnapOn((s) => !s)}
              temporaryOrigin={temporaryOrigin}
              onClearTemporaryOrigin={() => {
                setTemporaryOrigin(null);
                setPinnedMeetingPoints([]);
                setLockedConstraints({});
                toast.success("Vetor Datum limpo");
              }}
              onSetRefAtCursor={() => {
                setTemporaryOrigin({
                  id: uid(),
                  p: cursor,
                  label: "DATUM",
                  kind: "origin",
                  timestamp: Date.now(),
                });
                triggerHaptic("success");
                toast.success(`⌖ DATUM fixado em (${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}) mm`);
              }}
              onReanchorDatumHere={() => {
                const targetPt =
                  pending.length > 0
                    ? pending[pending.length - 1]!
                    : Math.hypot(lastCreatedVertexRef.current.x, lastCreatedVertexRef.current.y) > 1e-3
                      ? lastCreatedVertexRef.current
                      : cursor;
                setTemporaryOrigin({
                  id: uid(),
                  p: targetPt,
                  label: "DATUM",
                  kind: "origin",
                  timestamp: Date.now(),
                });
                triggerHaptic("action");
                toast.success(`⌖ DATUM reancorado em (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)}) mm`);
              }}
              onResetDatumZero={() => {
                setTemporaryOrigin({
                  id: uid(),
                  p: { x: 0, y: 0 },
                  label: "0,0",
                  kind: "origin",
                  timestamp: Date.now(),
                });
                triggerHaptic("action");
                toast.success("⌖ DATUM resetado para a origem (0, 0) mm");
              }}
              zoomPercent={Math.round(view.k * 100)}
              onFitPiece={() => fitTo(entities)}
              onFitWorkspace={() => fitFrame()}
              onResetZoom100={() =>
                setView((v) => ({
                  ...v,
                  k: 1,
                }))
              }
              onZoomStep={(factor) =>
                setView((v) => {
                  const nextK = Math.max(0.05, Math.min(40, v.k * factor));
                  const cx = canvasSize.w / 2;
                  const cy = canvasSize.h / 2;
                  return {
                    k: nextK,
                    tx: cx - ((cx - v.tx) / v.k) * nextK,
                    ty: cy - ((cy - v.ty) / v.k) * nextK,
                  };
                })
              }
              gridMm={grid}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((s) => !s)}
              onSelectGridMm={(mm) => {
                setGrid(mm);
                setShowGrid(() => true);
              }}
              selectedCount={selection.length}
            />
          )}

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
              <MenuItem
                label="Definir como REF (0,0)"
                icon={Target}
                onClick={() => {
                  setTemporaryOrigin({
                    id: uid(),
                    p: clipboardMenu.world,
                    label: "Ponto Selecionado",
                    kind: "origin",
                    timestamp: Date.now(),
                  });
                  triggerHaptic("success");
                  toast.success(
                    `✓ REF 0,0 fixada em (${clipboardMenu.world.x.toFixed(1)}, ${clipboardMenu.world.y.toFixed(1)}) mm`,
                  );
                  setClipboardMenu(null);
                }}
              />
              <MenuItem label="Cancelar" icon={X} onClick={() => setClipboardMenu(null)} />
            </div>
          )}

          {/* HUD DINÂMICO TOUCH CAD (OCULTO ENQUANTO O HUD DE ARRAY ESTIVER ABERTO PARA ZERO SOBREPOSIÇÃO) */}
          {activeArrayType === null && (
          <ChamferTouchDynamicHud
            activeTool={tool}
            pendingCount={pending.length}
            basePoint={pending.length > 0 ? pending[pending.length - 1]! : null}
            cursorPoint={cursor}
            isDark={isDark}
            polylineSegMode={polylineSegMode}
            onTogglePolylineSegMode={() =>
              setPolylineSegMode((prev) => (prev === "line" ? "tangent_arc" : "line"))
            }
            onUndoLastPolylineVertex={() => {
              setPending((prev) => prev.slice(0, -1));
              polylineSegModesRef.current.pop();
              triggerHaptic("tap");
            }}
            onFinishPolyline={(closed) => finishPolyline(closed)}
            rectMode={rectMode}
            onChangeRectMode={setRectMode}
            circleMode={circleMode}
            onChangeCircleMode={setCircleMode}
            polygonMode={polygonMode}
            onChangePolygonMode={setPolygonMode}
            polygonSides={polygonSides}
            onChangePolygonSides={setPolygonSides}
            polygonAcrossFlatsMm={polygonAcrossFlatsMm}
            onChangePolygonAcrossFlatsMm={setPolygonAcrossFlatsMm}
            slotMode={slotMode}
            onChangeSlotMode={setSlotMode}
            slotWidthMm={slotWidthMm}
            onChangeSlotWidthMm={setSlotWidthMm}
            gripMode={gripMode}
            onChangeGripMode={setGripMode}
            onInsertVertexOnSelected={() => {
              if (selected.length === 0) return;
              commit((list) =>
                list.map((e) =>
                  selection.includes(e.id) ? insertVertexOnEntitySegment(e, cursor) : e,
                ),
              );
              triggerHaptic("action");
              toast.success("Vértice inserido no segmento mais próximo.");
            }}
            smartTrimMode={smartTrimMode === "projected" ? "projected" : "real"}
            onToggleSmartTrimMode={() =>
              setSmartTrimMode((prev) => (prev === "real" ? "projected" : "real"))
            }
            offsetDistMm={offsetDist}
            onChangeOffsetDistMm={setOffsetDist}
            lockedDims={lockedDims}
            onChangeLockedDims={setLockedDims}
            onCommitExactPolarOrRadius={({ lengthMm, angleDeg, radiusMm }) => {
              const base = pending.length > 0 ? pending[pending.length - 1]! : cursor;
              const curAngRad =
                typeof angleDeg === "number" && Number.isFinite(angleDeg)
                  ? (angleDeg * Math.PI) / 180
                  : Math.atan2(cursor.y - base.y, cursor.x - base.x);
              const effLen =
                typeof lengthMm === "number" && Number.isFinite(lengthMm) && lengthMm > 0
                  ? lengthMm
                  : typeof radiusMm === "number" && Number.isFinite(radiusMm) && radiusMm > 0
                    ? radiusMm
                    : dist(base, cursor);
              const targetPt: Vec2 = {
                x: base.x + Math.cos(curAngRad) * effLen,
                y: base.y + Math.sin(curAngRad) * effLen,
              };

              if (tool === "polyline" || tool === "spline") {
                if (pending.length > 0) {
                  polylineSegModesRef.current.push(polylineSegMode);
                }
                setPending((q) => [...q, targetPt]);
              } else if (pending.length === 1) {
                const finalDraft = buildDraft(
                  tool,
                  pending[0]!,
                  targetPt,
                  activeLayer,
                  filletR,
                  drawingProjection,
                  isoPlane,
                  {
                    rectMode,
                    circleMode,
                    polygonMode,
                    polygonSides,
                    polygonAcrossFlatsMm,
                    slotMode,
                    slotWidthMm,
                    lockedRadiusMm: radiusMm ?? lengthMm,
                  },
                );
                if (finalDraft) {
                  commit((list) => [...list, { ...finalDraft, id: uid() }]);
                }
                setDraft(null);
                setPending([]);
                setLockedDims({ lockedLengthMm: null, lockedAngleDeg: null });
              }
              triggerHaptic("success");
            }}
            onCancelActiveCommand={() => {
              setPending([]);
              setDraft(null);
              setLockedDims({ lockedLengthMm: null, lockedAngleDeg: null });
            }}
            overlappingCandidates={overlappingCandidates}
            onPickOverlappingEntity={(id) => {
              setSelection([id]);
              setOverlappingCandidates([]);
              triggerHaptic("selection");
            }}
            onDismissOverlapping={() => setOverlappingCandidates([])}
            showPushPullZHandle={
              (drawingProjection === "isometric" ||
                orbitProjection2D.isTilted ||
                activeMode === "3d") &&
              selected.length > 0
            }
            thicknessMm={thickness}
            onChangeThicknessMm={(zMm) => {
              commit((list) =>
                list.map((e) =>
                  selection.includes(e.id)
                    ? {
                        ...e,
                        extrudeHeight: zMm,
                        params: { ...e.params, extrudeHeight: zMm, extrudeHeightMm: zMm },
                      }
                    : e,
                ),
              );
            }}
          />
          )}

          {/* BOLHA FLUTUANTE DE CONFIRMAÇÃO E EDIÇÃO RÁPIDA (DRAFT-THEN-COMMIT) */}
          {!solidOpen && activeMode === "2d" && (
            <ChamferDraftConfirmationBubble
              pendingShape={pendingDraftShape}
              view={view}
              canvasWidth={canvasSize.w}
              canvasHeight={canvasSize.h}
              isDark={isDark}
              onUpdatePendingShape={(next) => {
                setPendingDraftShape(next);
                lastCreatedVertexRef.current = next.p1;
                if (next.tool === "polygon") {
                  setPolygonSides(next.polygonSides);
                  setPolygonMode(next.polygonMode);
                  setPolygonAcrossFlatsMm(next.polygonAcrossFlatsMm);
                } else if (next.tool === "slot") {
                  setSlotWidthMm(next.slotWidthMm);
                } else if (next.tool === "rect" || next.tool === "rrect") {
                  setFilletR(next.cornerRadiusMm);
                }
              }}
              onConfirmPendingShape={() => {
                commitPendingDraftShape(pendingDraftShape);
              }}
              onCancelPendingShape={() => {
                setPendingDraftShape(null);
                setDraggingDraftGripIndex(null);
                toast.info("Forma descartada.");
              }}
            />
          )}

          {/* GIZMO 3D DE TRANSLAÇÃO (X, Y, +Z ORTHO) E MOTOR INTERATIVO LOFT 3D MULTISSEÇÃO */}
          <Chamfer3DGizmoAndLoftOverlay
            entities={entities}
            selectedIds={selectionSet}
            view={view}
            width={canvasSize.w}
            height={canvasSize.h}
            activeMode={activeMode}
            isDark={isDark}
            isIsometric={drawingProjection === "isometric"}
            isoPlane={isoPlane}
            orbitProjection={orbitProjection2D}
            is3DViewActive={orbitProjection2D.isTilted || activeMode === "3d"}
            isPortrait={!isLandscape}
            onLiveElevateSelection={(newElevationZ) => {
              setEntities((prev) =>
                prev.map((ent) =>
                  selectionSet.has(ent.id) ? setEntityElevationZ(ent, newElevationZ) : ent,
                ),
              );
            }}
            onCommitElevateSelection={(newElevationZ) => {
              commit((list) =>
                list.map((ent) =>
                  selectionSet.has(ent.id) ? setEntityElevationZ(ent, newElevationZ) : ent,
                ),
              );
            }}
            onLiveTranslateSelectionXY={(dx, dy, targetIds) => {
              if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
              const ids = targetIds && targetIds.length > 0 ? new Set(targetIds) : selectionSet;
              setEntities((prev) =>
                prev.map((ent) =>
                  ids.has(ent.id) ? translate(ent, dx, dy) : ent,
                ),
              );
            }}
            onCommitTranslateSelectionXY={(dx, dy, targetIds) => {
              if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return;
              const ids = targetIds && targetIds.length > 0 ? new Set(targetIds) : selectionSet;
              commit((list) =>
                list.map((ent) =>
                  ids.has(ent.id) ? translate(ent, dx, dy) : ent,
                ),
              );
              if (targetIds && targetIds.length > 0) {
                setSelection(targetIds);
              }
            }}
            onOpenElevationKeypad={(currentZ) => {
              setElevationKeypadState({ open: true, initialZ: currentZ });
            }}
            isLoftToolActive={tool === "loft_3d" || activeDirect3DTool === "loft_3d"}
            loftSectionIds={loftSectionIds}
            loftSurfaceMode={loftSurfaceMode}
            loftBodyMode={loftBodyMode}
            sheetThicknessMm={thickness}
            onChangeLoftSurfaceMode={setLoftSurfaceMode}
            onChangeLoftBodyMode={setLoftBodyMode}
            onToggleLoftSection={(entityId) => {
              triggerHaptic("selection");
              setLoftSectionIds((prev) =>
                prev.includes(entityId)
                  ? prev.filter((id) => id !== entityId)
                  : [...prev, entityId],
              );
            }}
            onClearLoftSections={() => setLoftSectionIds([])}
            onUpdateSectionElevationZ={(entityId, newElevationZ) => {
              commit((list) =>
                list.map((ent) =>
                  ent.id === entityId ? setEntityElevationZ(ent, newElevationZ) : ent,
                ),
              );
            }}
            onAutoSpaceLoftSectionsZ={(stepMm = 60) => {
              commit((list) =>
                list.map((ent) => {
                  const idx = loftSectionIds.indexOf(ent.id);
                  if (idx < 0) return ent;
                  return setEntityElevationZ(ent, idx * stepMm);
                }),
              );
            }}
            onRemoveLoftSection={(id) =>
              setLoftSectionIds((prev) => prev.filter((item) => item !== id))
            }
            onConfirmLoft3D={handleConfirmLoft3D}
            onCancelLoft3D={() => {
              setLoftSectionIds([]);
              setTool("select");
              if (activeDirect3DTool === "loft_3d") {
                setActiveDirect3DTool("select_3d");
              }
            }}
            onActivateLoftToolFromSelection={() => {
              triggerHaptic("selection");
              const closedSel = selected
                .filter((e) => isClosedLoftableProfile(e))
                .sort((a, b) => getEntityElevationZ(a) - getEntityElevationZ(b))
                .map((e) => e.id);
              setLoftSectionIds(closedSel);
              setTool("loft_3d");
              setActiveDirect3DTool("loft_3d");
              if (
                drawingProjection !== "isometric" &&
                !orbitProjection2D.isTilted
              ) {
                animateOrbitTo(45, ISO_CANONICAL_ELEVATION_DEG, "iso_se");
              }
            }}
            topologyScene={topologyScene3D}
            subSelection3D={subSelection3D}
            onChangeSubSelection3D={setSubSelection3D}
            activeDirect3DTool={activeDirect3DTool}
            onChangeDirect3DTool={(next3DTool) => {
              setActiveDirect3DTool(next3DTool);
              if (next3DTool === "loft_3d") {
                setTool("loft_3d");
              } else if (tool === "loft_3d") {
                setTool("select");
              }
            }}
            onSelectEntities={setSelection}
            onCommitEntities={(updater, toastMessageOrIds) => {
              commit(updater);
              if (Array.isArray(toastMessageOrIds)) {
                setSelection(toastMessageOrIds);
              } else if (typeof toastMessageOrIds === "string" && toastMessageOrIds) {
                toast.success(toastMessageOrIds);
              }
            }}
            onSwitchTo2DSketchOnFace={(face: DirectFace3D) => {
              setTemporaryOrigin({
                id: `face_workplane_${face.faceId}`,
                p: {
                  x: Number(face.centroid.x.toFixed(2)),
                  y: Number(face.centroid.y.toFixed(2)),
                },
                label: `FACE Z=${face.centroid.z.toFixed(1)}mm`,
                kind: "origin",
                timestamp: Date.now(),
              });
              transitionTo2D();
              setTool("rect");
              toast.success(
                `Plano 2D alinhado à ${face.label} (Z = ${face.centroid.z.toFixed(1)} mm) — desenhe furos, rasgos ou recortes sobre a face.`,
              );
            }}
            onDeleteSelectedEntities={(idsToDelete) => {
              const targetIds = idsToDelete && idsToDelete.length > 0 ? idsToDelete : selection;
              commit((list) => list.filter((e) => !targetIds.includes(e.id)));
              setSelection([]);
              toast.success("Corpo 3D removido.");
            }}
          />

          {/* TECLADO NUMÉRICO DIRETO DE ELEVAÇÃO +Z (GIZMO 3D) */}
          {elevationKeypadState.open && (
            <div className="pointer-events-auto absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
              <ChamferCompactNumericEditor
                property={{
                  key: "elevationZ",
                  label: "Elevação Vertical (+Z)",
                  symbol: "↕Z",
                  value: elevationKeypadState.initialZ,
                  unit: "mm",
                  defaultStep: 10,
                  stepOptions: [1, 5, 10, 20, 60],
                  allowNegative: true,
                }}
                onChange={(newZ) => {
                  const selSet = new Set(selection);
                  setEntities((prev) =>
                    prev.map((ent) =>
                      selSet.has(ent.id) ? setEntityElevationZ(ent, newZ) : ent,
                    ),
                  );
                }}
                onConfirm={(finalZ) => {
                  const selSet = new Set(selection);
                  commit((list) =>
                    list.map((ent) =>
                      selSet.has(ent.id) ? setEntityElevationZ(ent, finalZ) : ent,
                    ),
                  );
                  setElevationKeypadState({ open: false, initialZ: finalZ });
                  toast.success(`Elevação Z definida para ${finalZ.toFixed(2)} mm.`);
                }}
                onCancel={() =>
                  setElevationKeypadState((prev) => ({ ...prev, open: false }))
                }
              />
            </div>
          )}

          {/* INDICADOR INTERATIVO DE EIXOS 3D (GIZMO X Y Z) — VISÍVEL SOMENTE QUANDO ÓRBITA 3D OU CAD 3D ESTIVER ATIVO */}
          {(isOrbitToolActive || activeMode === "3d") && (
            <div
              className={cn(
                "pointer-events-none absolute left-4 z-35 flex flex-col items-start gap-1.5",
                activeMode === "3d" ? "bottom-4" : "bottom-12",
              )}
            >
              <ChamferAxesGizmo3D
                azimuthDeg={orbitAzimuthDeg}
                elevationDeg={orbitElevationDeg}
                activePreset={orbitPreset}
                isOrbitToolActive={isOrbitToolActive}
                onSelectPreset={handleSelectOrbitPreset}
                onDragOrbitDelta={handleDragOrbitDelta}
                onToggleOrbitTool={() => setIsOrbitToolActive((v) => !v)}
                isDark={isDark}
              />
            </div>
          )}

          {/* BARRA FLUTUANTE DE COMANDO / FEEDBACK CAD TÉCNICO 2D (OCULTA NO MODO CAD 3D) */}
          {activeArrayType === null && activeMode !== "3d" && (
            <div
              style={{
                backgroundColor: "var(--chamfer-bubble-bg)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-secondary)",
              }}
              className="pointer-events-none absolute bottom-3 left-4 z-20 hidden md:flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-[10px] shadow-lg backdrop-blur-md transition-colors"
            >
              <span
                style={{ color: "var(--chamfer-accent)" }}
                className="font-bold uppercase tracking-wider"
              >
                {isOrbitToolActive ? "ÓRBITA 3D" : operationFeedback.command}
              </span>
              <span style={{ color: "var(--chamfer-border-strong)" }}>|</span>
              <span style={{ color: "var(--chamfer-text-primary)" }}>
                {isOrbitToolActive
                  ? `Arraste com 1 dedo/mouse para orbitar (θ ${Math.round(orbitAzimuthDeg)}° · φ ${Math.round(orbitElevationDeg)}°)`
                  : operationFeedback.instruction}
              </span>
            </div>
          )}

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

          {/* NOVO SISTEMA DE EDIÇÃO CONTEXTUAL MOBILE DO CHAMFER (OCULTO NO MODO CAD 3D) */}
          {mobileEditorOpen && activeArrayType === null && activeMode !== "3d" && (
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
                  const item = copyToGlobalClipboard(entities, [ent.id], groups, dims);
                  const dup = translate(ent, 10, 10);
                  const dupWithNewId = { ...dup, id: crypto.randomUUID() };
                  commit((list) => [...list, dupWithNewId]);
                  setSelection([dupWithNewId.id]);
                  if (item) {
                    toast.success(`✓ "${item.title}" copiado para a Área de Transferência.`);
                  }
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
          </div>
        </div>

        {/* REGIÃO D — JANELA LATERAL DIREITA DO CHAMFER 2D (OCULTA COMPLETAMENTE NO MODO CAD 3D) */}
        {!solidOpen && !focus && isLandscape && activeMode !== "3d" && (
          activeArrayType !== null ? (
            <ChamferArrayHUD
              arrayType={activeArrayType}
              onChangeArrayType={(nextType) => {
                setActiveArrayType(nextType);
                setIsArrayPickingCenter(false);
              }}
              polarParams={arrayPolarParams}
              onChangePolarParams={setArrayPolarParams}
              linearParams={arrayLinearParams}
              onChangeLinearParams={setArrayLinearParams}
              hostInfo={arrayHostInfo}
              validation={arrayValidation}
              resolvedLinear={arrayPreview?.resolvedLinear}
              isPickingCenter={isArrayPickingCenter}
              onTogglePickCenter={() => setIsArrayPickingCenter((v) => !v)}
              onSelectCandidateCenter={(center) => {
                setArrayPolarParams((p) => {
                  const baseCenter = selected.length > 0 ? getGroupCenter(selected) : center;
                  const radius = dist(center, baseCenter);
                  return {
                    ...p,
                    center,
                    radius,
                    startAngleDeg:
                      Math.atan2(baseCenter.y - center.y, baseCenter.x - center.x) *
                      (180 / Math.PI),
                  };
                });
              }}
              onApply={handleCommitArray}
              onCancel={handleCancelArray}
              isDark={isDark}
              enclosedAssemblyCount={arraySourceAssembly.length}
            />
          ) : (
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
              onOpenArray={() => handleStartArray(arrayHostInfo.suggestedType || "polar")}
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
              renderRevEng={() => (
                <ChamferRevEngTab
                  revEng={revEngData}
                  onChangeRevEng={setRevEngData}
                  entities={entities}
                  selection={selection}
                  setSelection={setSelection}
                  commit={commit}
                  activeLayer={activeLayer}
                  thickness={thickness}
                  onThicknessChange={setThickness}
                  canvasInteractionMode={revEngCanvasMode}
                  onSetCanvasInteractionMode={setRevEngCanvasMode}
                  pendingPickPointsWorld={revEngPickPoints}
                  onClearPendingPickPoints={() => setRevEngPickPoints([])}
                  fittedPreviewCandidate={revEngFittedPreview}
                  onSetFittedPreviewCandidate={setRevEngFittedPreview}
                  onOpenVisionModal={() => setVisionOpen(true)}
                  isDark={isDark}
                />
              )}
              onHighlightCut={setShareHint}
              isDark={isDark}
            />
          )
        )}

        {/* GAVETA COMPACTA EM MODO RETRATO (OCULTA COMPLETAMENTE NO MODO CAD 3D) */}
        {!solidOpen && !focus && !isLandscape && activeMode !== "3d" && (
          <ChamferPortraitCompactDrawer
            open={portraitDrawerOpen}
            onClose={() => setPortraitDrawerOpen(false)}
            isDark={isDark}
            bottomOffsetPx={
              verticalLayout.chromeHeights.stripPx + verticalLayout.chromeHeights.dockPx
            }
            activeTab={activeSidebarTab}
            onSelectTab={setActiveSidebarTab}
          >
            <ChamferRightSidebar
              open={true}
              onToggleOpen={() => setPortraitDrawerOpen(false)}
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
              renderRevEng={() => (
                <ChamferRevEngTab
                  revEng={revEngData}
                  onChangeRevEng={setRevEngData}
                  entities={entities}
                  selection={selection}
                  setSelection={setSelection}
                  commit={commit}
                  activeLayer={activeLayer}
                  thickness={thickness}
                  onThicknessChange={setThickness}
                  canvasInteractionMode={revEngCanvasMode}
                  onSetCanvasInteractionMode={setRevEngCanvasMode}
                  pendingPickPointsWorld={revEngPickPoints}
                  onClearPendingPickPoints={() => setRevEngPickPoints([])}
                  fittedPreviewCandidate={revEngFittedPreview}
                  onSetFittedPreviewCandidate={setRevEngFittedPreview}
                  onOpenVisionModal={() => setVisionOpen(true)}
                  isDark={isDark}
                />
              )}
              onHighlightCut={setShareHint}
              isDark={isDark}
            />
          </ChamferPortraitCompactDrawer>
        )}
      </div>

      {/* REGIÃO E — EM MODO RETRATO: BARRAS INFERIORES 2D (OCULTAS COMPLETAMENTE NO MODO CAD 3D) */}
      {!focus && !isLandscape && activeMode !== "3d" && (
        <ChamferPortraitBottomBars
          isDark={isDark}
          stripHeightPx={verticalLayout.chromeHeights.stripPx}
          dockHeightPx={verticalLayout.chromeHeights.dockPx}
          tool={tool}
          onPickTool={pickTool}
          activeMode={activeMode}
          onModeChange={(m) => {
            triggerHaptic("selection");
            if (m === "3d" || m === "flanges") {
              transitionTo3D(m);
            } else {
              transitionTo2D();
            }
          }}
          hasSelection={selected.length > 0}
          selectedCount={selected.length}
          onSelectAll={() => setSelection(drawable.map((e) => e.id))}
          onInvertSelection={() =>
            setSelection(drawable.filter((e) => !selection.includes(e.id)).map((e) => e.id))
          }
          onClearSelection={() => setSelection([])}
          offsetDist={offsetDist}
          setOffsetDist={setOffsetDist}
          filletR={filletR}
          setFilletR={setFilletR}
          selectedCornersCount={selectedCorners.length}
          onApplyAllSelectionCorners={handleApplyAllSelectionCorners}
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
          onOverkillClean={handleOverkillClean}
          onBoolean2D={handleBoolean2D}
          onCreateHatch={handleCreateHatch}
          onOpenClipboard={() => {
            setClipboardAnchorWorld({
              x: (canvasSize.w / 2 - view.tx) / view.k,
              y: (canvasSize.h / 2 - view.ty) / view.k,
            });
            setClipboardModalOpen(true);
          }}
          activeArrayType={activeArrayType}
          onChangeArrayType={(nextType) => {
            setActiveArrayType(nextType);
            setIsArrayPickingCenter(false);
          }}
          arrayPolarParams={arrayPolarParams}
          onChangePolarParams={setArrayPolarParams}
          arrayLinearParams={arrayLinearParams}
          onChangeLinearParams={setArrayLinearParams}
          isArrayPickingCenter={isArrayPickingCenter}
          onTogglePickArrayCenter={() => setIsArrayPickingCenter((v) => !v)}
          onCommitArray={handleCommitArray}
          onCancelArray={handleCancelArray}
          divideEditorOpen={divideEditorOpen}
          divideParts={divideParts}
          onDividePartsChange={setDivideParts}
          onConfirmDivide={handleConfirmDivide}
          onCancelDivide={handleCancelDivide}
          snapOn={snapOn}
          setSnapOn={setSnapOn}
          snapDivision={snapDivision}
          onSetSnapDivision={setSnapDivision}
          showAllSnaps={showAllSnaps}
          onToggleShowAllSnaps={() => setShowAllSnaps((v) => !v)}
          interactionGuideMode={interactionGuideMode}
          onSetInteractionGuideMode={handleSetInteractionGuideMode}
          onStartSetReferencePoint={() => {
            if (interactionGuideMode === "off") {
              handleSetInteractionGuideMode("purple_ref");
            }
            setIsSettingReferencePoint(true);
            toast.info("Toque no vértice, centro ou ponto desejado para fixar o Centro de Referência");
          }}
          temporaryOrigin={temporaryOrigin}
          onClearTemporaryOrigin={() => {
            setTemporaryOrigin(null);
            setPinnedMeetingPoints([]);
            setLockedConstraints({});
            toast.success("Ponto de referência limpo");
          }}
          orthoOn={orthoOn}
          setOrthoOn={setOrthoOn}
          trackingOn={trackingOn}
          setTrackingOn={setTrackingOn}
          dimKind={dimKind}
          onPickDimKind={(k) => {
            setDimKind(k);
            setTool("dim");
          }}
          cursorOffsetMode={cursorOffsetMode}
          onToggleCursorOffsetMode={toggleCursorOffsetMode}
          loupeMode={loupeMode}
          onCycleLoupeMode={handleCycleLoupeMode}
          nudgeHudVisible={nudgeHudVisible}
          onToggleNudgeHud={() => {
            setNudgeHudVisible((prev) => {
              const next = !prev;
              globalCADInteractionHub.toggleModifier("nudge_dpad", next);
              return next;
            });
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
          onOpenVisionModal={() => setVisionOpen(true)}
          onOpenRevEngCategory={(category: RevEngCategoryId, wizardStep?: RevEngWizardStep) => {
            setRevEngData((prev) => ({
              ...prev,
              activeCategory: category,
              activeWizardStep: wizardStep ?? prev.activeWizardStep,
            }));
            setActiveSidebarTab("eng_rev");
            setPortraitDrawerOpen(true);
          }}
          activeLayer={activeLayer}
          setActiveLayer={(layerId) => {
            setActiveLayer(layerId);
            setActiveStrokeColor(null);
            activeStrokeColorRef.current = null;
          }}
          activeStrokeColor={activeStrokeColor}
          onSelectColorAndLayer={handleSelectColorAndLayer}
          onDeleteSelection={handleDeleteSelection}
          onUseSelectedEdge={handleUseSelectedEdge}
          onAddThread={handleAddThread}
          onAddEyelet={handleAddEyelet}
          onAddTangentBridge={handleAddTangentBridge}
          onAddSerratedTeeth={handleAddSerratedTeeth}
          onAddPocket2D={handleAddPocket2D}
          onVerifyGeometry={() => {
            const found = verify(entities);
            setIssues(found);
            if (found.length) {
              toast.warning(`${found.length} problemas encontrados`);
            } else {
              toast.success("Geometria CNC válida");
            }
          }}
          onOptimizeGeometry={() => {
            const res = optimize(entities);
            commit(res.entities);
            toast.success(`${res.removed + res.tiny} entidades limpas`);
          }}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          grid={grid}
          setGrid={setGrid}
          frame={frame}
          onUpdateFrame={updateFrame}
          onFitWorkspace={() => fitFrame()}
          onCenterPiece={(moveGeometry) => centerPiece(moveGeometry)}
          onOpenWorkspaceKeypad={(axis, screenPos) => {
            setWorkspaceKeypadEditor({
              axis,
              currentValue: axis === "w" ? frame.w : frame.h,
              screenPos,
            });
          }}
          onOpenPresets={() => setPresetsModalOpen(true)}
          onOpenTechnicalSheet={() => setTechnicalSheetModalOpen(true)}
          onOpenTopologyHealth={() => setTopologyHealthOpen(true)}
          onOpenVariables={() => setVariablesModalOpen(true)}
          onOpenPieceBuilder={() => setIsoPieceBuilderOpen(true)}
          simOn={simOn}
          onToggleSim={() => {
            setSimOn((s) => {
              const next = !s;
              setSimPlaying(next);
              setSimDist(0);
              return next;
            });
          }}
          showArrows={showArrows}
          onToggleArrows={() => setShowArrows((s) => !s)}
          portraitDrawerOpen={portraitDrawerOpen}
          onSetPortraitDrawerOpen={(open) => {
            setPortraitDrawerOpen(open);
            if (open) {
              const b = entities.length > 0 ? bbox(entities) : null;
              if (b && Number.isFinite(b.minX) && b.maxX - b.minX > 1) {
                fitBox(b);
              }
            }
          }}
          activeSidebarTab={activeSidebarTab}
          onSelectSidebarTab={setActiveSidebarTab}
        />
      )}

      {/* REGIÃO E — STATUS BAR AGRUPADA (32px) — MODO PAISAGEM (OCULTA COMPLETAMENTE NO MODO CAD 3D) */}
      {!focus && isLandscape && activeMode !== "3d" && (
        <footer
          aria-label="Barra de status do CHAMFER"
          style={{
            backgroundColor: "var(--chamfer-bar-bg)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-secondary)",
          }}
          className="relative flex h-8 shrink-0 items-center justify-between gap-2 border-t px-2.5 font-mono text-[10px] backdrop-blur-md select-none transition-colors z-30"
        >
          {/* FAIXA UNIFICADA COM SWIPE HORIZONTAL SUAVE (SEM CORTAR BOTÕES EM MODO RETRATO) */}
          <div className="flex flex-1 min-w-0 items-center justify-between gap-2 overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x whitespace-nowrap">
            {/* LADO ESQUERDO: PLANOS DO PROJETO + COORDENADAS REAIS */}
            <div className="flex shrink-0 items-center gap-2">
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
                              x.id === planId
                                ? { ...x, entities, groups, dims, cad3dTreeJson, revEng: revEngData }
                                : x,
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
                    setCad3dTreeJson(pl.cad3dTreeJson);
                    setRevEngData(sanitizeRevEngPlanData(pl.revEng));
                    setRevEngCanvasMode("none");
                    setRevEngPickPoints([]);
                    setRevEngFittedPreview(null);
                    setSelection([]);
                    past.current = [];
                    future.current = [];
                  }}
                  style={
                    pl.id === planId
                      ? {
                          backgroundColor: "var(--chamfer-accent-soft)",
                          borderColor: "var(--chamfer-accent-border)",
                          color: "var(--chamfer-accent)",
                        }
                      : { color: "var(--chamfer-text-secondary)" }
                  }
                  className={cn(
                    "shrink-0 rounded px-2 py-0.5 font-bold transition-colors",
                    pl.id === planId ? "border" : "hover:brightness-110",
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
                          x.id === planId
                            ? { ...x, entities, groups, dims, cad3dTreeJson, revEng: revEngData }
                            : x,
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
                    setCad3dTreeJson(undefined);
                    setRevEngData(createDefaultRevEngPlanData());
                    setRevEngCanvasMode("none");
                    setRevEngPickPoints([]);
                    setRevEngFittedPreview(null);
                    setSelection([]);
                    toast.success(`${plan.name} criado.`);
                  }}
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-bold transition-colors",
                    isDark ? "text-[#94A3B8] hover:text-[#E6EDF5]" : "text-[#64748B] hover:text-[#1E293B]",
                  )}
                  title="Adicionar novo plano de corte ao projeto"
                >
                  +
                </button>
              )}

              <div className={cn("mx-1 h-3.5 w-px shrink-0", isDark ? "bg-[#293444]" : "bg-[#CBD5E1]")} />

              {/* UNIDADE DE MEDIDA CANÔNICA */}
              <span
                className={cn(
                  "flex shrink-0 items-center px-1.5 py-0.2 rounded border font-mono font-bold text-[9px] tracking-wider",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#E6EDF5]"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
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
                style={
                  mobileEditorOpenManual
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        borderColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border-strong)",
                        color: "var(--chamfer-text-primary)",
                      }
                }
                className="flex shrink-0 items-center gap-1 px-2 py-0.5 rounded border font-mono font-bold text-[9px] tracking-wider transition-colors cursor-pointer"
              >
                <span>CHAPA {thickness.toFixed(1)}MM</span>
              </button>

              {/* LEITURA DE COORDENADAS E PAINEL CONTEXTUAL INTELIGENTE (REF 0,0 EM ÂMBAR TÉCNICO & BORDAS) */}
              {temporaryOrigin ? (
                <div className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px]">
                  <span
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold shrink-0",
                      isDark
                        ? "bg-[#F59E0B]/15 border-[#F59E0B]/45 text-[#F59E0B]"
                        : "bg-[#D97706]/10 border-[#D97706]/40 text-[#D97706]",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full animate-pulse",
                        isDark ? "bg-[#F59E0B]" : "bg-[#D97706]",
                      )}
                    />
                    ⌖ DATUM [{temporaryOrigin.p.x.toFixed(0)}, {temporaryOrigin.p.y.toFixed(0)}]:
                  </span>

                  {/* Pílula Interativa ΔX na Barra Inferior */}
                  <button
                    type="button"
                    onClick={(ev) => {
                      const rect = ev.currentTarget.getBoundingClientRect();
                      const dxVal = Number((cursor.x - temporaryOrigin.p.x).toFixed(2));
                      setLiveDimEditor({
                        dim: {
                          id: "datum-dx",
                          kind: "dx",
                          value: dxVal,
                          label: "ΔX do Vetor Datum (mm)",
                          startPoint: temporaryOrigin.p,
                          endPoint: cursor,
                          midPoint: {
                            x: (temporaryOrigin.p.x + cursor.x) / 2,
                            y: temporaryOrigin.p.y,
                          },
                          normalDir: { x: 0, y: 1 },
                          isEditable: true,
                          targetKey: "dx",
                        },
                        screenPos: { x: rect.left + rect.width / 2, y: rect.top - 12 },
                        currentValue: dxVal,
                        label: "ΔX do Vetor Datum (mm)",
                        allowInvert: false,
                        measureKind: "dx",
                        initialLocked: lockedConstraints.lockedDx != null,
                      });
                    }}
                    title="Clique para digitar e travar ΔX (Trilho Vertical)"
                    className={cn(
                      "flex items-center gap-0.5 px-1 py-0.5 rounded border transition-colors cursor-pointer",
                      lockedConstraints.lockedDx != null
                        ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                        : isDark
                          ? "bg-[#151C27]/80 border-[#293444] hover:border-amber-500/50"
                          : "bg-white border-slate-300 hover:border-amber-500/50",
                    )}
                  >
                    <span className={cn("font-bold", isDark ? "text-[#F59E0B]" : "text-[#D97706]")}>ΔX:</span>
                    <strong className={isDark ? "text-[#E6EDF5]" : "text-[#1E293B]"}>
                      {(cursor.x - temporaryOrigin.p.x >= 0 ? "+" : "") + (cursor.x - temporaryOrigin.p.x).toFixed(1)}
                    </strong>
                    <span className="text-[8px] opacity-80">
                      {lockedConstraints.lockedDx != null ? "🔒" : "✎"}
                    </span>
                  </button>

                  {/* Pílula Interativa ΔY na Barra Inferior */}
                  <button
                    type="button"
                    onClick={(ev) => {
                      const rect = ev.currentTarget.getBoundingClientRect();
                      const dyVal = Number((cursor.y - temporaryOrigin.p.y).toFixed(2));
                      setLiveDimEditor({
                        dim: {
                          id: "datum-dy",
                          kind: "dy",
                          value: dyVal,
                          label: "ΔY do Vetor Datum (mm)",
                          startPoint: temporaryOrigin.p,
                          endPoint: cursor,
                          midPoint: {
                            x: cursor.x,
                            y: (temporaryOrigin.p.y + cursor.y) / 2,
                          },
                          normalDir: { x: 1, y: 0 },
                          isEditable: true,
                          targetKey: "dy",
                        },
                        screenPos: { x: rect.left + rect.width / 2, y: rect.top - 12 },
                        currentValue: dyVal,
                        label: "ΔY do Vetor Datum (mm)",
                        allowInvert: false,
                        measureKind: "dy",
                        initialLocked: lockedConstraints.lockedDy != null,
                      });
                    }}
                    title="Clique para digitar e travar ΔY (Trilho Horizontal)"
                    className={cn(
                      "flex items-center gap-0.5 px-1 py-0.5 rounded border transition-colors cursor-pointer",
                      lockedConstraints.lockedDy != null
                        ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                        : isDark
                          ? "bg-[#151C27]/80 border-[#293444] hover:border-amber-500/50"
                          : "bg-white border-slate-300 hover:border-amber-500/50",
                    )}
                  >
                    <span className={cn("font-bold", isDark ? "text-[#F59E0B]" : "text-[#D97706]")}>ΔY:</span>
                    <strong className={isDark ? "text-[#E6EDF5]" : "text-[#1E293B]"}>
                      {(cursor.y - temporaryOrigin.p.y >= 0 ? "+" : "") + (cursor.y - temporaryOrigin.p.y).toFixed(1)}
                    </strong>
                    <span className="text-[8px] opacity-80">
                      {lockedConstraints.lockedDy != null ? "🔒" : "✎"}
                    </span>
                  </button>

                  {/* Pílula Interativa L (Hipotenusa) na Barra Inferior */}
                  <button
                    type="button"
                    onClick={(ev) => {
                      const rect = ev.currentTarget.getBoundingClientRect();
                      const lVal = Number(
                        Math.hypot(
                          cursor.x - temporaryOrigin.p.x,
                          cursor.y - temporaryOrigin.p.y,
                        ).toFixed(2),
                      );
                      setLiveDimEditor({
                        dim: {
                          id: "datum-L",
                          kind: "length",
                          value: lVal,
                          label: "Distância L do Vetor Datum (mm)",
                          startPoint: temporaryOrigin.p,
                          endPoint: cursor,
                          midPoint: {
                            x: (temporaryOrigin.p.x + cursor.x) / 2,
                            y: (temporaryOrigin.p.y + cursor.y) / 2,
                          },
                          normalDir: { x: 0, y: 1 },
                          isEditable: true,
                          targetKey: "length",
                        },
                        screenPos: { x: rect.left + rect.width / 2, y: rect.top - 12 },
                        currentValue: lVal,
                        label: "Distância L do Vetor Datum (mm)",
                        allowInvert: false,
                        measureKind: "L",
                        initialLocked:
                          lockedConstraints.lockedL != null || lockedConstraints.lockedDist != null,
                      });
                    }}
                    title="Clique para digitar e travar a Distância Radial L (Órbita Circular)"
                    className={cn(
                      "flex items-center gap-0.5 px-1 py-0.5 rounded border transition-colors cursor-pointer",
                      lockedConstraints.lockedL != null || lockedConstraints.lockedDist != null
                        ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                        : isDark
                          ? "bg-[#151C27]/80 border-[#293444] hover:border-sky-500/50"
                          : "bg-white border-slate-300 hover:border-sky-500/50",
                    )}
                  >
                    <span className="font-bold text-[#38BDF8]">L:</span>
                    <strong className={isDark ? "text-[#E6EDF5]" : "text-[#1E293B]"}>
                      {Math.hypot(
                        cursor.x - temporaryOrigin.p.x,
                        cursor.y - temporaryOrigin.p.y,
                      ).toFixed(1)}
                    </strong>
                    <span className="text-[8px] opacity-80">
                      {lockedConstraints.lockedL != null || lockedConstraints.lockedDist != null
                        ? "🔒"
                        : "✎"}
                    </span>
                  </button>

                  {/* Pílula Interativa ∠ (Ângulo) na Barra Inferior */}
                  <button
                    type="button"
                    onClick={(ev) => {
                      const rect = ev.currentTarget.getBoundingClientRect();
                      const rawDeg =
                        (Math.atan2(
                          cursor.y - temporaryOrigin.p.y,
                          cursor.x - temporaryOrigin.p.x,
                        ) *
                          180) /
                        Math.PI;
                      const degVal = Number((((rawDeg % 360) + 360) % 360).toFixed(1));
                      setLiveDimEditor({
                        dim: {
                          id: "datum-angle",
                          kind: "angle",
                          value: degVal,
                          label: "Ângulo ∠ do Vetor Datum (°)",
                          startPoint: temporaryOrigin.p,
                          endPoint: cursor,
                          midPoint: temporaryOrigin.p,
                          normalDir: { x: 0, y: 1 },
                          isEditable: true,
                          targetKey: "angle",
                        },
                        screenPos: { x: rect.left + rect.width / 2, y: rect.top - 12 },
                        currentValue: degVal,
                        label: "Ângulo ∠ do Vetor Datum (°)",
                        allowInvert: false,
                        measureKind: "angle",
                        initialLocked: lockedConstraints.lockedAngle != null,
                      });
                    }}
                    title="Clique para digitar e travar o Ângulo ∠ (Raio Vetor Infinito)"
                    className={cn(
                      "flex items-center gap-0.5 px-1 py-0.5 rounded border transition-colors cursor-pointer",
                      lockedConstraints.lockedAngle != null
                        ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                        : isDark
                          ? "bg-[#151C27]/80 border-[#293444] hover:border-amber-500/50"
                          : "bg-white border-slate-300 hover:border-amber-500/50",
                    )}
                  >
                    <span className="font-bold text-[#F59E0B]">∠:</span>
                    <strong className={isDark ? "text-[#E6EDF5]" : "text-[#1E293B]"}>
                      {(
                        (((Math.atan2(
                          cursor.y - temporaryOrigin.p.y,
                          cursor.x - temporaryOrigin.p.x,
                        ) *
                          180) /
                          Math.PI) %
                          360 +
                          360) %
                        360
                      ).toFixed(1)}
                      °
                    </strong>
                    <span className="text-[8px] opacity-80">
                      {lockedConstraints.lockedAngle != null ? "🔒" : "✎"}
                    </span>
                  </button>

                  {showGlobalCoordsPeek && (
                    <span className="text-[#94A3B8] text-[8.5px] ml-0.5">
                      (G: {cursor.x.toFixed(1)}, {cursor.y.toFixed(1)})
                    </span>
                  )}

                  {/* Ações Rápidas do Datum: Fixar Datum Persistente + Conversão Direta em LINE (ΔX, ΔY, L, Catetos X+Y) (Seção 3.3) */}
                  <button
                    type="button"
                    data-testid="datum-bar-persist-btn"
                    onClick={() => {
                      const datumEnt = createPersistentDatumEntity(temporaryOrigin.p, cursor, activeLayer);
                      commit((prev) => [...prev, datumEnt]);
                      setSelection([datumEnt.id]);
                      triggerHaptic("success");
                      toast.success("✓ Datum Persistente gravado no canvas com projeção nos dois catetos.");
                    }}
                    title="Fixar Vetor Datum Persistente no canvas (participa do Undo/Redo)"
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[8.5px] active:scale-95 border cursor-pointer",
                      isDark
                        ? "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300"
                        : "bg-amber-50 hover:bg-amber-100 border-amber-400 text-amber-800",
                    )}
                  >
                    📌 Fixar Datum
                  </button>

                  {(
                    [
                      { key: "dx", label: "+ Linha ΔX" },
                      { key: "dy", label: "+ Linha ΔY" },
                      { key: "L", label: "+ Linha L" },
                      { key: "both_legs", label: "↱ Catetos X+Y" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      data-testid={`datum-bar-convert-${item.key}`}
                      onClick={() => {
                        const tempSpec: PersistentDatumSpec = {
                          id: uid(),
                          origin: temporaryOrigin.p,
                          target: cursor,
                          label: "DATUM",
                          createdAt: Date.now(),
                        };
                        const lines = convertDatumToCadLines(tempSpec, item.key, activeLayer);
                        if (lines.length === 0) {
                          toast.info("Desloque o cursor para gerar linha com comprimento > 0.");
                          return;
                        }
                        commit((prev) => [...prev, ...lines]);
                        setSelection(lines.map((l) => l.id));
                        triggerHaptic("success");
                        toast.success(
                          item.key === "both_legs"
                            ? "✓ 2 linhas ortogonais dos catetos (ΔX + ΔY) criadas!"
                            : `✓ Linha ${item.label.replace("+ Linha ", "")} criada no desenho!`,
                        );
                      }}
                      className={cn(
                        "flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[8.5px] active:scale-95 border cursor-pointer",
                        isDark
                          ? "bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 text-sky-300"
                          : "bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-700",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}

                  {/* Botão Rápido: [ ⟳ Aqui ] (Reancorar no Ponto Atual / Encadeamento Rápido) */}
                  <button
                    type="button"
                    onClick={() => {
                      const targetPt =
                        pending.length > 0
                          ? pending[pending.length - 1]!
                          : Math.hypot(lastCreatedVertexRef.current.x, lastCreatedVertexRef.current.y) > 1e-3
                            ? lastCreatedVertexRef.current
                            : cursor;
                      setTemporaryOrigin({
                        id: uid(),
                        p: targetPt,
                        label: "DATUM",
                        kind: "origin",
                        timestamp: Date.now(),
                      });
                      triggerHaptic("action");
                      toast.success(
                        `⌖ DATUM reancorado em (${targetPt.x.toFixed(1)}, ${targetPt.y.toFixed(1)}) mm`,
                      );
                    }}
                    title="Reancorar o Vetor Datum no último vértice criado (Encadeamento incremental)"
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[8.5px] active:scale-95 border cursor-pointer",
                      isDark
                        ? "bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25 border-[#38BDF8]/40 text-[#38BDF8]"
                        : "bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-700",
                    )}
                  >
                    ⟳ Aqui
                  </button>

                  {/* Botão Rápido: [ 0,0 ] (Resetar para a origem absoluta da chapa) */}
                  <button
                    type="button"
                    onClick={() => {
                      setTemporaryOrigin({
                        id: uid(),
                        p: { x: 0, y: 0 },
                        label: "0,0",
                        kind: "origin",
                        timestamp: Date.now(),
                      });
                      triggerHaptic("action");
                      toast.success("⌖ DATUM resetado para a origem (0, 0) mm");
                    }}
                    title="Resetar Vetor Datum para a origem absoluta da chapa (0, 0)"
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[8.5px] active:scale-95 border cursor-pointer",
                      isDark
                        ? "bg-[#151C27] hover:bg-[#1E293B] border-[#293444] text-[#94A3B8] hover:text-[#E6EDF5]"
                        : "bg-white hover:bg-slate-100 border-slate-300 text-slate-600",
                    )}
                  >
                    0,0
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTemporaryOrigin(null);
                      setLockedConstraints({});
                      triggerHaptic("tap");
                      toast.success("Vetor Datum limpo (retornado ao 0,0 global)");
                    }}
                    title="Limpar Vetor Datum e voltar ao documento global"
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[8.5px] active:scale-95 border cursor-pointer",
                      isDark
                        ? "bg-[#1E293B] hover:bg-[#334155] border-[#334155] text-[#E2E8F0]"
                        : "bg-[#FFFFFF] hover:bg-[#F1F5F9] border-[#CBD5E1] text-[#334155]",
                    )}
                  >
                    ✕ Limpar Datum
                  </button>
                </div>
              ) : activeEdge ? (
                (() => {
                  const { u, v } = CoordinateFrameManager.worldToUV(cursor, activeEdge);
                  return (
                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px]">
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-[#38BDF8] font-bold shrink-0">
                        <span className="size-1.5 rounded-full bg-[#38BDF8] animate-pulse" />
                        BORDA [L = {activeEdge.length.toFixed(0)} mm]:
                      </span>
                      <span className="text-[#94A3B8]">u:</span>
                      <strong className={isDark ? "text-[#38BDF8]" : "text-[#0284C7]"}>{u.toFixed(1)}</strong>
                      <span className={isDark ? "text-[#293444]" : "text-[#CBD5E1]"}>|</span>
                      <span className="text-[#94A3B8]">v (afast.):</span>
                      <strong className={isDark ? "text-[#34D399]" : "text-[#059669]"}>
                        {(v >= 0 ? "+" : "") + v.toFixed(1)} mm
                      </strong>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveEdgeSide((prev) => (prev === 1 ? -1 : 1));
                          triggerHaptic("selection");
                        }}
                        title="Inverter Lado do Afastamento"
                        className="px-1.5 py-0.5 rounded bg-[#151C27] hover:bg-[#293444] border border-[#38BDF8]/40 text-[#38BDF8] font-bold text-[8.5px] active:scale-95"
                      >
                        ⇄ Lado {activeEdgeSide === 1 ? "A" : "B"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const line = GeometricConstraintResolver.createMarkingOrBendLine(
                            activeEdge,
                            activeEdgeOffset,
                            activeEdgeSide,
                            "marcacao"
                          );
                          commit((prev) => [...prev, line]);
                          triggerHaptic("action");
                          AudioManager.play("ui_select");
                          toast.success(`✓ Linha de marcação gerada a ${activeEdgeOffset} mm da borda!`);
                        }}
                        title={`Criar linha de marcação paralela a ${activeEdgeOffset} mm`}
                        className="px-1.5 py-0.5 rounded bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 border border-[#F59E0B]/40 text-[#FBBF24] font-bold text-[8.5px] active:scale-95"
                      >
                        + MAR ({activeEdgeOffset}mm)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const line = GeometricConstraintResolver.createMarkingOrBendLine(
                            activeEdge,
                            activeEdgeOffset,
                            activeEdgeSide,
                            "dobra"
                          );
                          commit((prev) => [...prev, line]);
                          triggerHaptic("action");
                          AudioManager.play("ui_select");
                          toast.success(`✓ Linha de dobra gerada a ${activeEdgeOffset} mm da borda!`);
                        }}
                        title={`Criar linha de dobra paralela a ${activeEdgeOffset} mm`}
                        className="px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-bold text-[8.5px] active:scale-95"
                      >
                        + Dobra ({activeEdgeOffset}mm)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveEdge(null);
                          setLiveDimensions([]);
                          triggerHaptic("tap");
                        }}
                        title="Desmarcar borda"
                        className="px-1.5 py-0.5 rounded bg-[#151C27] hover:bg-[#293444] text-[#94A3B8] font-bold text-[8.5px]"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="flex shrink-0 items-center gap-1 font-mono text-[9.5px]">
                  <span className={isDark ? "text-[#94A3B8]" : "text-[#64748B]"}>X:</span>
                  <strong className={isDark ? "text-[#E6EDF5]" : "text-[#1E293B]"}>{cursor.x.toFixed(2)}</strong>
                  <span className={isDark ? "text-[#94A3B8]" : "text-[#64748B]"}>Y:</span>
                  <strong className={isDark ? "text-[#E6EDF5]" : "text-[#1E293B]"}>{cursor.y.toFixed(2)}</strong>

                  <button
                    type="button"
                    onClick={() => {
                      const p = smartSnap ? smartSnap.p : { x: cursor.x, y: cursor.y };
                      const label = smartSnap ? smartSnap.label : "DATUM";
                      const kind = smartSnap ? smartSnap.kind : "origin";
                      setTemporaryOrigin({
                        id: uid(),
                        p,
                        label,
                        kind,
                        timestamp: Date.now(),
                      });
                      triggerHaptic("success");
                      AudioManager.play("ui_select");
                      toast.success(`✓ ⌖ DATUM fixado em (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm`);
                    }}
                    title="Definir ponto sob o cursor / snap como Vetor Datum (ΔXY / ∠)"
                    className={cn(
                      "ml-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold text-[8.5px] cursor-pointer active:scale-95 transition-all",
                      isSettingReferencePoint
                        ? "bg-[#DC143C]/20 border-[#DC143C] text-[#DC143C]"
                        : isDark
                          ? "bg-[#1E293B] hover:bg-[#F59E0B]/15 border-[#F59E0B]/45 text-[#F59E0B]"
                          : "bg-[#FFFFFF] hover:bg-[#D97706]/10 border-[#D97706]/45 text-[#D97706]",
                    )}
                  >
                    <span>⌖</span>
                    <span>DATUM</span>
                  </button>

                  {selection.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const selectedEntities = entities.filter((e) => selection.includes(e.id));
                        const edges = GeometricReferenceEngine.extractEdges(selectedEntities);
                        if (edges.length > 0) {
                          const bestEdge =
                            GeometricReferenceEngine.findNearestEdge(cursor, edges, 500)?.edge ?? edges[0]!;
                          setActiveEdge(bestEdge);
                          triggerHaptic("action");
                          toast.success(`✓ Borda selecionada: ${bestEdge.label} (${bestEdge.length.toFixed(1)} mm)`);
                        } else {
                          toast.info("A seleção atual não possui bordas lineares.");
                        }
                      }}
                      title="Definir borda da seleção para afastamento e cotas vivas"
                      className={cn(
                        "ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold text-[8.5px] cursor-pointer active:scale-95 transition-all",
                        isDark
                          ? "bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25 border-[#38BDF8]/40 text-[#38BDF8]"
                          : "bg-[#0284C7]/10 hover:bg-[#0284C7]/20 border-[#0284C7]/40 text-[#0284C7]",
                      )}
                    >
                      <span>📐</span>
                      <span>Usar Borda</span>
                    </button>
                  )}
                </div>
              )}

              {/* HUD DE COMPRIMENTO / ÂNGULO QUANDO DESENHANDO LINHA OU POLILINHA */}
              {pending.length >= 1 && (tool === "line" || tool === "polyline") && (
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[9.5px]",
                    isDark
                      ? "bg-[#38BDF8]/15 border-[#38BDF8]/40 text-[#38BDF8]"
                      : "bg-[#0284C7]/10 border-[#0284C7]/40 text-[#0284C7]",
                  )}
                >
                  <span>
                    L: {Math.hypot(
                      cursor.x - pending[pending.length - 1]!.x,
                      cursor.y - pending[pending.length - 1]!.y,
                    ).toFixed(1)} mm
                  </span>
                  <span>·</span>
                  <span>
                    ∠{" "}
                    {(
                      ((Math.atan2(
                        -(cursor.y - pending[pending.length - 1]!.y),
                        cursor.x - pending[pending.length - 1]!.x,
                      ) * 180) /
                        Math.PI +
                        360) %
                      360
                    ).toFixed(1)}
                    °
                  </span>
                  {tool === "polyline" && (
                    <span className="font-mono text-[9px] text-[#94A3B8]">
                      ({pending.length} {pending.length === 1 ? "vértice" : "vértices"})
                    </span>
                  )}
                </div>
              )}

              {/* BOTÕES DE FINALIZAR POLILINHA DIRETO NA TELA */}
              {tool === "polyline" && pending.length >= 2 && (
                <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("action");
                      finishPolyline(false);
                    }}
                    className={cn(
                      "rounded text-white font-mono text-[9.5px] font-bold px-2 py-0.5 shadow transition-colors flex items-center gap-1",
                      isDark ? "bg-[#34D399] hover:bg-[#10B981] text-[#0B0F14]" : "bg-[#059669] hover:bg-[#047857]",
                    )}
                    title="Concluir Polilinha aberta (Enter)"
                  >
                    <Check className="size-3" />
                    <span>Concluir</span>
                  </button>
                  {pending.length >= 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("action");
                        finishPolyline(true);
                      }}
                      className={cn(
                        "rounded font-mono text-[9.5px] font-bold px-2 py-0.5 shadow transition-colors",
                        isDark ? "bg-[#38BDF8] text-[#0B0F14] hover:bg-sky-300" : "bg-[#0284C7] text-white hover:bg-sky-700",
                      )}
                      title="Fechar Polilinha no ponto inicial (C)"
                    >
                      Fechar
                    </button>
                  )}
                </div>
              )}

              <div className={cn("mx-0.5 h-3.5 w-px shrink-0", isDark ? "bg-[#293444]" : "bg-[#CBD5E1]")} />

              {/* ESTADO DA OPERAÇÃO CAD */}
              <div className="hidden lg:flex items-center gap-1.5 text-[9.5px] truncate max-w-[260px]">
                <span
                  style={{ backgroundColor: "var(--chamfer-accent)" }}
                  className="size-1.5 rounded-full animate-pulse shrink-0"
                />
                <strong style={{ color: "var(--chamfer-accent)" }} className="uppercase">
                  {operationFeedback.command}:
                </strong>
                <span className="truncate" style={{ color: "var(--chamfer-text-secondary)" }}>
                  {operationFeedback.instruction}
                </span>
              </div>

              <div className={cn("mx-0.5 h-3.5 w-px hidden sm:block shrink-0", isDark ? "bg-[#293444]" : "bg-[#CBD5E1]")} />

              {/* INFORMAÇÕES DA SELEÇÃO */}
              <div className="hidden sm:flex shrink-0 items-center gap-1 text-[9.5px]">
                <span className={isDark ? "text-[#94A3B8]" : "text-[#64748B]"}>SEL:</span>
                <strong
                  className={cn(
                    selected.length > 0
                      ? isDark
                        ? "text-[#38BDF8] font-bold"
                        : "text-[#0284C7] font-bold"
                      : isDark
                        ? "text-[#94A3B8] font-normal"
                        : "text-[#64748B] font-normal",
                  )}
                >
                  {selectionText}
                </strong>
              </div>
            </div>

            {/* LADO DIREITO: 3 GRUPOS LÓGICOS (1. PRIMÁRIOS VISÍVEIS | 2. PRECISÃO | 3. FLUXO/CNC) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* GRUPO 1 — PRIMÁRIOS (SEMPRE VISÍVEIS NA BARRA): SNAP, ORTO, GRID, ÁREA */}
              <button
                type="button"
                onClick={() => setSnapOn((s) => !s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold whitespace-nowrap transition-colors border",
                  snapOn
                    ? isDark
                      ? "text-[#38BDF8] bg-[#38BDF8]/15 border-[#38BDF8]/45"
                      : "text-[#0284C7] bg-[#FFFFFF] border-[#0284C7]/45"
                    : isDark
                      ? "border-[#293444] text-[#94A3B8] hover:text-[#E6EDF5]"
                      : "border-[#CBD5E1] text-[#64748B] hover:text-[#1E293B]",
                )}
                title="Alternar Snap Geométrico"
              >
                SNAP: {snapOn ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                onClick={() => setOrthoOn((o) => !o)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold whitespace-nowrap transition-colors border",
                  orthoOn
                    ? isDark
                      ? "text-[#38BDF8] bg-[#38BDF8]/15 border-[#38BDF8]/45"
                      : "text-[#0284C7] bg-[#FFFFFF] border-[#0284C7]/45"
                    : isDark
                      ? "border-[#293444] text-[#94A3B8] hover:text-[#E6EDF5]"
                      : "border-[#CBD5E1] text-[#64748B] hover:text-[#1E293B]",
                )}
                title="Modo Ortogonal (0°, 90°, 180°, 270°)"
              >
                ORTO: {orthoOn ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                onClick={() => setShowGrid((s) => !s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] uppercase font-bold whitespace-nowrap transition-colors border",
                  showGrid
                    ? isDark
                      ? "bg-[#1E293B] border-[#334155] text-[#E2E8F0] hover:border-[#38BDF8]/50"
                      : "bg-[#FFFFFF] border-[#CBD5E1] text-[#334155] hover:border-[#0284C7]/50"
                    : isDark
                      ? "border-[#293444] text-[#94A3B8] hover:text-[#E6EDF5]"
                      : "border-[#CBD5E1] text-[#64748B] hover:text-[#1E293B]",
                )}
                title="Alternar visibilidade da grade"
              >
                GRID: {showGrid ? `${grid}MM` : "OFF"}
              </button>

              {/* BOTÃO DE PERSONALIZAÇÃO DA ÁREA DE TRABALHO (NEUTRO POR PADRÃO, AZUL-CIANO QUANDO SELETOR/EDITOR ABERTO) */}
              <button
                type="button"
                data-testid="status-workspace-area-button"
                onClick={() => {
                  triggerHaptic("selection");
                  setStatusWorkspaceMenuOpen((v) => !v);
                  setStatusPrecisionMenuOpen(false);
                  setStatusCncMenuOpen(false);
                }}
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold whitespace-nowrap transition-colors border cursor-pointer",
                  statusWorkspaceMenuOpen || workspaceKeypadEditor !== null
                    ? isDark
                      ? "text-[#38BDF8] bg-[#38BDF8]/20 border-[#38BDF8]/65 shadow-xs"
                      : "text-[#0284C7] bg-[#0284C7]/15 border-[#0284C7]/65 shadow-xs"
                    : frame.visible
                      ? isDark
                        ? "bg-[#1E293B] border-[#334155] text-[#E2E8F0] hover:border-[#38BDF8]/50"
                        : "bg-[#FFFFFF] border-[#CBD5E1] text-[#334155] hover:border-[#0284C7]/50"
                      : isDark
                        ? "border-[#293444] text-[#94A3B8] hover:text-[#E6EDF5]"
                        : "border-[#CBD5E1] text-[#64748B] hover:text-[#1E293B]",
                )}
                title="Personalizar Área de Trabalho (Chapa / Mesa CAD)"
              >
                {frame.visible
                  ? `⬚ ÁREA: ${Math.round(frame.w)}×${Math.round(frame.h)}MM${frame.locked ? " 🔒" : ""}`
                  : "⬚ ÁREA: OFF"}
              </button>

              <div className={cn("mx-0.5 h-3.5 w-px shrink-0", isDark ? "bg-[#293444]" : "bg-[#CBD5E1]")} />

              {/* GRUPO 2 — BOTÃO DE ABERTURA DO POPOVER PRECISÃO */}
              <button
                type="button"
                onClick={() => {
                  setStatusPrecisionMenuOpen((v) => !v);
                  setStatusWorkspaceMenuOpen(false);
                  setStatusCncMenuOpen(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] uppercase font-bold whitespace-nowrap transition-colors cursor-pointer",
                  statusPrecisionMenuOpen || nudgeHudVisible || cursorOffsetMode === "offset"
                    ? isDark
                      ? "border-[#38BDF8]/45 bg-[#38BDF8]/15 text-[#38BDF8]"
                      : "border-[#0284C7]/40 bg-[#0284C7]/10 text-[#0284C7]"
                    : isDark
                      ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:text-white"
                      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B] hover:text-[#0F172A]",
                )}
                title="Controles de Precisão: Mira, Lupa, Ajuste Fino e Quadro"
              >
                <Crosshair className="size-2.5 shrink-0" />
                <span>Precisão</span>
              </button>

              {/* GRUPO 3 — BOTÃO DE ABERTURA DO POPOVER FLUXO/CNC */}
              <button
                type="button"
                onClick={() => {
                  setStatusCncMenuOpen((v) => !v);
                  setStatusWorkspaceMenuOpen(false);
                  setStatusPrecisionMenuOpen(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] uppercase font-bold whitespace-nowrap transition-colors cursor-pointer",
                  statusCncMenuOpen || showArrows || showOrder || simOn
                    ? isDark
                      ? "border-[#E11D48]/50 bg-[#E11D48]/18 text-[#FB7185]"
                      : "border-[#E11D48]/40 bg-[#E11D48]/10 text-[#E11D48]"
                    : isDark
                      ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:text-white"
                      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B] hover:text-[#0F172A]",
                )}
                title="Fabricação e Apresentação: Fluxo, Ordem de Corte e Prévia CNC"
              >
                <Sliders className="size-2.5 shrink-0" />
                <span>Fluxo/CNC</span>
              </button>

              <div className={cn("mx-0.5 h-3.5 w-px shrink-0", isDark ? "bg-[#293444]" : "bg-[#CBD5E1]")} />

              {/* ZOOM ATUAL (SEMPRE VISÍVEL) */}
              <button
                type="button"
                onClick={() => fitTo(entities)}
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[9px] font-bold whitespace-nowrap transition-colors",
                  isDark
                    ? "border-[#293444] bg-[#151C27] text-[#38BDF8] hover:border-[#38BDF8]/50"
                    : "border-[#CBD5E1] bg-[#FFFFFF] text-[#0284C7] hover:border-[#0284C7]/50",
                )}
                title="Clique para enquadrar desenho (100%)"
              >
                {Math.round(view.k * 100)}%
              </button>
            </div>
          </div>

          {/* POPOVERS FLUTUANTES DA BARRA DE STATUS (RENDERIZADOS FORA DO CONTAINER OVERFLOW-X-AUTO PARA NUNCA CORTAR) */}
          {statusWorkspaceMenuOpen && (
            <div
              data-testid="workspace-customization-popover"
              style={{
                backgroundColor: "var(--chamfer-popover-bg)",
                borderColor: "var(--chamfer-border-strong)",
                color: "var(--chamfer-text-primary)",
              }}
              className="absolute bottom-9 right-2 z-50 flex w-72 max-w-[94vw] flex-col gap-2 rounded-xl border p-2.5 shadow-2xl backdrop-blur-md"
            >
              {/* Cabeçalho */}
              <div
                className={cn(
                  "flex items-center justify-between border-b pb-1.5 text-[9px] font-mono font-bold uppercase tracking-wider",
                  isDark ? "border-[#293444] text-[#38BDF8]" : "border-[#CBD5E1] text-[#0284C7]",
                )}
              >
                <span>⬚ Área de Trabalho (Chapa / Mesa)</span>
                <button
                  type="button"
                  onClick={() => setStatusWorkspaceMenuOpen(false)}
                  className="text-[#94A3B8] hover:text-foreground cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Chaves Rápidas: Exibir Área, Cotas da Área e Travar Limites */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    updateFrame({ visible: !frame.visible });
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer border",
                    frame.visible
                      ? "text-[#FB7185] bg-[#E11D48]/15 border-[#E11D48]/40"
                      : isDark
                        ? "border-transparent hover:bg-[#0D121B] text-[#94A3B8]"
                        : "border-transparent hover:bg-[#F1F5F9] text-[#64748B]",
                  )}
                >
                  <span>Exibir Área de Trabalho</span>
                  <span className="font-mono">{frame.visible ? "ON" : "OFF"}</span>
                </button>

                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      updateFrame({ showDims: !frame.showDims });
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-1 text-[8.5px] uppercase font-bold transition-colors cursor-pointer border",
                      frame.showDims
                        ? isDark
                          ? "text-[#38BDF8] bg-[#38BDF8]/15 border-[#38BDF8]/40"
                          : "text-[#0284C7] bg-[#0284C7]/10 border-[#0284C7]/40"
                        : isDark
                          ? "border-[#293444] bg-[#0D121B] text-[#94A3B8]"
                          : "border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]",
                    )}
                  >
                    <span>Cotas Área</span>
                    <span className="font-mono">{frame.showDims ? "ON" : "OFF"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      updateFrame({ locked: !frame.locked });
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-1 text-[8.5px] uppercase font-bold transition-colors cursor-pointer border",
                      frame.locked
                        ? "text-[#F59E0B] bg-[#F59E0B]/15 border-[#F59E0B]/40"
                        : isDark
                          ? "border-[#293444] bg-[#0D121B] text-[#94A3B8]"
                          : "border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]",
                    )}
                  >
                    <span>Travar Limites</span>
                    <span className="font-mono">{frame.locked ? "🔒 FIXA" : "LIVRE"}</span>
                  </button>
                </div>
              </div>

              {/* Presets Industriais de Chapa/Mesa (1 Toque) */}
              <div className="flex flex-col gap-1">
                <span
                  className={cn(
                    "text-[8px] font-mono font-bold uppercase tracking-wider",
                    isDark ? "text-[#94A3B8]" : "text-[#64748B]",
                  )}
                >
                  Presets Industriais (1 Toque)
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {WORKSPACE_INDUSTRIAL_PRESETS.map((preset) => {
                    const isSelected =
                      Math.abs(frame.w - preset.w) < 0.5 && Math.abs(frame.h - preset.h) < 0.5;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          if (frame.locked) {
                            toast.warning("Destrave os limites da Área de Trabalho para alterar o tamanho.");
                            return;
                          }
                          triggerHaptic("selection");
                          const nextFrame: WorkspaceFrame = {
                            ...frame,
                            w: preset.w,
                            h: preset.h,
                            visible: true,
                          };
                          updateFrame({ w: preset.w, h: preset.h, visible: true });
                          fitBox(frameBox(nextFrame));
                          toast.success(`Área de Trabalho: ${preset.label} (${preset.subtitle})`);
                        }}
                        className={cn(
                          "flex flex-col items-start rounded-lg border px-2 py-1 text-left transition-all cursor-pointer active:scale-98",
                          isSelected
                            ? isDark
                              ? "border-[#E11D48] bg-[#E11D48]/18 text-[#E6EDF5]"
                              : "border-[#E11D48] bg-[#E11D48]/10 text-[#1E293B]"
                            : isDark
                              ? "border-[#293444] bg-[#0D121B] hover:border-[#38BDF8]/50 text-[#E6EDF5]"
                              : "border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#0284C7]/50 text-[#1E293B]",
                        )}
                      >
                        <span className="font-mono text-[9.5px] font-bold leading-tight">
                          {preset.label}
                        </span>
                        <span
                          className={cn(
                            "text-[7.5px] leading-tight truncate w-full",
                            isDark ? "text-[#94A3B8]" : "text-[#64748B]",
                          )}
                        >
                          {preset.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dimensões Personalizadas (Largura X × Altura Y em mm — Teclado Numérico CAD Integrado) */}
              <div className="flex flex-col gap-1">
                <span
                  className={cn(
                    "text-[8px] font-mono font-bold uppercase tracking-wider",
                    isDark ? "text-[#94A3B8]" : "text-[#64748B]",
                  )}
                >
                  Dimensões Personalizadas (Teclado CAD)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (frame.locked) {
                        toast.warning("Destrave os limites da Área de Trabalho para editar a Largura X.");
                        return;
                      }
                      triggerHaptic("selection");
                      const rect = e.currentTarget.getBoundingClientRect();
                      setWorkspaceKeypadEditor({
                        axis: "w",
                        currentValue: frame.w,
                        screenPos: { x: rect.left, y: Math.max(180, rect.top - 150) },
                      });
                    }}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-2 py-1.5 transition-colors cursor-pointer",
                      isDark
                        ? "border-[#293444] bg-[#0D121B] hover:border-[#38BDF8] text-[#E6EDF5]"
                        : "border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#0284C7] text-[#1E293B]",
                    )}
                  >
                    <span className={cn("text-[8px] font-mono uppercase", isDark ? "text-[#94A3B8]" : "text-[#64748B]")}>
                      Largura X (mm)
                    </span>
                    <span className={cn("font-mono text-xs font-bold", isDark ? "text-[#38BDF8]" : "text-[#0284C7]")}>
                      {Math.round(frame.w)} mm
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (frame.locked) {
                        toast.warning("Destrave os limites da Área de Trabalho para editar a Altura Y.");
                        return;
                      }
                      triggerHaptic("selection");
                      const rect = e.currentTarget.getBoundingClientRect();
                      setWorkspaceKeypadEditor({
                        axis: "h",
                        currentValue: frame.h,
                        screenPos: { x: rect.left, y: Math.max(180, rect.top - 150) },
                      });
                    }}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-2 py-1.5 transition-colors cursor-pointer",
                      isDark
                        ? "border-[#293444] bg-[#0D121B] hover:border-[#38BDF8] text-[#E6EDF5]"
                        : "border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#0284C7] text-[#1E293B]",
                    )}
                  >
                    <span className={cn("text-[8px] font-mono uppercase", isDark ? "text-[#94A3B8]" : "text-[#64748B]")}>
                      Altura Y (mm)
                    </span>
                    <span className={cn("font-mono text-xs font-bold", isDark ? "text-[#38BDF8]" : "text-[#0284C7]")}>
                      {Math.round(frame.h)} mm
                    </span>
                  </button>
                </div>
              </div>

              {/* Ações Rápidas: Inverter X/Y e Enquadrar Área na Tela */}
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (frame.locked) {
                      toast.warning("Destrave os limites da Área de Trabalho para inverter X/Y.");
                      return;
                    }
                    triggerHaptic("selection");
                    const swapped: WorkspaceFrame = {
                      ...frame,
                      w: frame.h,
                      h: frame.w,
                      visible: true,
                    };
                    updateFrame({ w: swapped.w, h: swapped.h, visible: true });
                    fitBox(frameBox(swapped));
                    toast.info(`Orientação invertida: ${Math.round(swapped.w)} × ${Math.round(swapped.h)} mm`);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 font-mono text-[8.5px] font-bold uppercase transition-colors cursor-pointer",
                    isDark
                      ? "border-[#293444] bg-[#0D121B] hover:bg-[#293444] text-[#E6EDF5]"
                      : "border-[#CBD5E1] bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B]",
                  )}
                  title="Inverter Largura X e Altura Y (Paisagem / Retrato)"
                >
                  <ArrowLeftRight className="size-3 shrink-0" />
                  <span>⇄ Inverter X/Y</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    updateFrame({ visible: true });
                    fitBox(frameBox({ ...frame, visible: true }));
                    toast.info("Área de Trabalho enquadrada na tela");
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 font-mono text-[8.5px] font-bold uppercase transition-colors cursor-pointer",
                    isDark
                      ? "border-[#E11D48]/50 bg-[#E11D48]/18 hover:bg-[#E11D48]/28 text-[#FB7185]"
                      : "border-[#E11D48]/45 bg-[#E11D48]/10 hover:bg-[#E11D48]/20 text-[#E11D48]",
                  )}
                  title="Centralizar e enquadrar a Área de Trabalho na tela"
                >
                  <Crosshair className="size-3 shrink-0" />
                  <span>⌖ Enquadrar Área</span>
                </button>
              </div>
            </div>
          )}

          {statusPrecisionMenuOpen && (
            <div
              style={{
                backgroundColor: "var(--chamfer-popover-bg)",
                borderColor: "var(--chamfer-border-strong)",
                color: "var(--chamfer-text-primary)",
              }}
              className="absolute bottom-9 right-2 z-50 flex w-52 max-w-[92vw] flex-col gap-1.5 rounded-xl border p-2 shadow-2xl backdrop-blur-md"
            >
              <div className={cn("flex items-center justify-between border-b pb-1 text-[8.5px] font-bold uppercase tracking-wider", isDark ? "border-[#293444] text-[#94A3B8]" : "border-[#CBD5E1] text-[#64748B]")}>
                <span>Módulos de Precisão</span>
                <button
                  type="button"
                  onClick={() => setStatusPrecisionMenuOpen(false)}
                  className="text-[#94A3B8] hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={toggleCursorOffsetMode}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  cursorOffsetMode === "offset"
                    ? isDark
                      ? "text-[#38BDF8] bg-[#38BDF8]/15 border border-[#38BDF8]/40"
                      : "text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/40"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>MIRA</span>
                <span>{cursorOffsetMode === "offset" ? "55PX" : "DIRETA"}</span>
              </button>

              <button
                type="button"
                onClick={handleCycleLoupeMode}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  loupeMode === "pinned"
                    ? isDark
                      ? "text-[#38BDF8] bg-[#38BDF8]/15 border border-[#38BDF8]/40"
                      : "text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/40"
                    : loupeMode === "floating"
                      ? "text-[#E11D48] bg-[#E11D48]/15"
                      : isDark
                        ? "hover:bg-[#0D121B]"
                        : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>LUPA</span>
                <span>{loupeMode === "pinned" ? "FIXA" : loupeMode === "floating" ? "AUTO" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setNudgeHudVisible((prev) => {
                    const next = !prev;
                    globalCADInteractionHub.toggleModifier("nudge_dpad", next);
                    return next;
                  });
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  nudgeHudVisible
                    ? "text-[#E11D48] bg-[#E11D48]/15 border border-[#E11D48]/40"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>FINO</span>
                <span>{nudgeHudVisible ? `${nudgeStepMm}MM` : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => updateFrame({ visible: !frame.visible })}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  frame.visible
                    ? "text-[#E11D48] bg-[#E11D48]/15"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>QUADRO</span>
                <span>{frame.visible ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const opts = [0, 2, 3, 4, 6, 8, 12, 16];
                  const idx = opts.indexOf(snapDivision);
                  const next = opts[(idx + 1) % opts.length];
                  setSnapDivision(next);
                  triggerHaptic("selection");
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  snapDivision > 0
                    ? "text-[#F59E0B] bg-[#F59E0B]/15 border border-[#F59E0B]/40"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>DIVISÃO SNAP</span>
                <span>{snapDivision > 0 ? `${snapDivision}X` : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAllSnaps((v) => !v);
                  triggerHaptic("selection");
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  showAllSnaps
                    ? isDark
                      ? "text-[#34D399] bg-[#34D399]/15 border border-[#34D399]/40"
                      : "text-[#059669] bg-[#059669]/10 border border-[#059669]/40"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>TODOS OS SNAPS</span>
                <span>{showAllSnaps ? "ON" : "OFF"}</span>
              </button>
            </div>
          )}

          {statusCncMenuOpen && (
            <div
              style={{
                backgroundColor: "var(--chamfer-popover-bg)",
                borderColor: "var(--chamfer-border-strong)",
                color: "var(--chamfer-text-primary)",
              }}
              className="absolute bottom-9 right-2 z-50 flex w-48 max-w-[92vw] flex-col gap-1.5 rounded-xl border p-2 shadow-2xl backdrop-blur-md"
            >
              <div className={cn("flex items-center justify-between border-b pb-1 text-[8.5px] font-bold uppercase tracking-wider", isDark ? "border-[#293444] text-[#94A3B8]" : "border-[#CBD5E1] text-[#64748B]")}>
                <span>Fabricação & CNC</span>
                <button
                  type="button"
                  onClick={() => setStatusCncMenuOpen(false)}
                  className="text-[#94A3B8] hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowArrows((s) => !s)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  showArrows
                    ? "text-[#E11D48] bg-[#E11D48]/15"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>FLUXO</span>
                <span>{showArrows ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOrder((s) => !s)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  showOrder
                    ? "text-[#E11D48] bg-[#E11D48]/15"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>ORDEM</span>
                <span>{showOrder ? "ON" : "OFF"}</span>
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
                  "flex items-center justify-between rounded-lg px-2 py-1 text-[9px] uppercase font-bold transition-colors cursor-pointer",
                  simOn
                    ? "text-[#E11D48] bg-[#E11D48]/15"
                    : isDark
                      ? "hover:bg-[#0D121B]"
                      : "hover:bg-[#F1F5F9]",
                )}
              >
                <span>PRÉVIA CNC</span>
                <span>{simOn ? "ON" : "OFF"}</span>
              </button>
            </div>
          )}
        </footer>
      )}

      {/* PONTO ÚNICO DE EXPORTAÇÃO: DXF (três perfis), SVG, PNG e PDF. */}
      {(exportOpen || cncOpen) && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* FERRAMENTA DIVIDIR: EDITOR COMPACTO EM N PARTES IGUAIS (EM RETRATO OCORRE VIA INLINE CONTEXTUAL SWAP NA BARRA NÍVEL 1) */}
      {isLandscape && (
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
      )}

      {/* BARRA FLUTUANTE DE CONFIRMAÇÃO DA FERRAMENTA DIVIDIR (MODO PAISAGEM) */}
      {isLandscape && divideEditorOpen && divideTargetEntity && (
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
      {centerDialogOpen && (
        <Suspense fallback={null}>
          <ChamferCenterDialog
            open={centerDialogOpen}
            selectedEntities={selected}
            allEntities={entities}
            options={centerOptions}
            onOptionsChange={setCenterOptions}
            onConfirm={handleConfirmCenter}
            onCancel={handleCancelCenter}
            isDark={isDark}
            view={view}
          />
        </Suspense>
      )}

      {/* FERRAMENTA ESCALAR SELEÇÃO */}
      {scaleDialogOpen && (
        <Suspense fallback={null}>
          <ChamferScaleDialog
            open={scaleDialogOpen}
            selectedEntities={selected}
            onConfirm={handleConfirmScale}
            onCancel={() => setScaleDialogOpen(false)}
            isDark={isDark}
            view={view}
          />
        </Suspense>
      )}

      {/* CONTROLE FLUTUANTE DE FILETE E CHANFRO (MODO PAISAGEM; EM RETRATO OCORRE NA BARRA NÍVEL 1) */}
      {isLandscape && (tool === "fillet" || tool === "chamfer") && (
        <ChamferFilletChamferHUD
          tool={tool}
          value={filletR}
          onChangeValue={setFilletR}
          selectionCornersCount={selectedCorners.length}
          onApplySelectionCorners={handleApplyAllSelectionCorners}
          onClose={() => {
            setTool("select");
            setFilletPreview(null);
            setChamferPreview(null);
          }}
          isDark={isDark}
        />
      )}

      {/* BARRA CONTEXTUAL FLUTUANTE DE SELEÇÃO E AGRUPAMENTO 2D (OCULTA NO MODO CAD 3D) */}
      {selection.length > 0 && !solidOpen && activeMode !== "3d" && tool === "select" && activeArrayType === null && (
        <div
          style={{
            backgroundColor: "var(--chamfer-bubble-bg)",
            borderColor: "var(--chamfer-accent-border)",
            color: "var(--chamfer-text-primary)",
          }}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shadow-2xl backdrop-blur-md select-none pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-150",
            isLandscape ? "bottom-24 sm:bottom-28" : "bottom-[120px]",
          )}
        >
          <div
            style={{ borderColor: "var(--chamfer-border)" }}
            className="flex items-center gap-1.5 pr-2 border-r font-mono text-[11px]"
          >
            {activeGroup ? (
              <span
                style={{
                  backgroundColor: "var(--chamfer-accent-soft)",
                  borderColor: "var(--chamfer-accent-border)",
                  color: "var(--chamfer-accent)",
                }}
                className="flex items-center gap-1 font-bold px-2 py-0.5 rounded-md border"
              >
                <Boxes className="size-3.5" />
                {activeGroup.name}
              </span>
            ) : (
              <span style={{ color: "var(--chamfer-text-primary)" }} className="font-semibold">
                {selection.length} {selection.length === 1 ? "peça" : "peças"}
              </span>
            )}
          </div>

          {/* REEDIÇÃO ASSOCIATIVA DE PADRÃO (ARRAY) OU ATALHO RÁPIDO PARA MULTIPLICAR */}
          {(() => {
            const arrayOwner = selected.find((e) => getEntityArraySpec(e) !== null);
            if (arrayOwner) {
              return (
                <button
                  type="button"
                  onClick={() => handleEditExistingArray(arrayOwner)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-sm active:scale-95"
                  title="Editar Padrão (Array) existente em tempo real"
                >
                  <span>⌗ Editar Padrão (Array)</span>
                </button>
              );
            }
            return (
              <button
                type="button"
                onClick={() => {
                  const host = detectHostPart(entities, selected, temporaryOrigin?.p ?? { x: 0, y: 0 });
                  handleStartArray(host.suggestedType);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold transition-colors"
                title="Multiplicar em Padrão Circular ou Linear (Array)"
              >
                <span>⌗ Array</span>
              </button>
            );
          })()}

          {selection.length >= 2 && (
            <button
              type="button"
              onClick={handleGroupSelection}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Agrupar formas em uma única peça (Ctrl+G)"
            >
              <Boxes className="size-3.5" />
              Agrupar
            </button>
          )}

          {(activeGroup || selected.some((e) => e.group)) && (
            <button
              type="button"
              onClick={handleUngroupSelection}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white font-mono text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Desagrupar peça em formas independentes (Ctrl+Shift+G)"
            >
              <Ungroup className="size-3.5" />
              Desagrupar
            </button>
          )}

          <button
            type="button"
            onClick={() => applySelection((e) => rotate(e, center, 90))}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition-colors"
            title="Girar 90°"
          >
            <RotateCw className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsoPieceBuilderOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs transition-colors"
            title="Projetar para Isométrico"
          >
            <BoxIcon className="size-3.5" />
            <span className="hidden sm:inline">Iso</span>
          </button>

          <button
            type="button"
            onClick={() => {
              commit((e) => e.filter((x) => !selection.includes(x.id)));
              setSelection([]);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 font-mono text-xs transition-colors"
            title="Excluir seleção"
          >
            <Trash2 className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setSelection([])}
            className="ml-1 p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Limpar seleção"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {importOpen && (
        <Suspense fallback={null}>
          <ImportDialog
            open={importOpen}
            layers={layers}
            onClose={() => setImportOpen(false)}
            onConfirm={onImportConfirm}
          />
        </Suspense>
      )}
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
      {visionOpen && (
        <Suspense fallback={null}>
          <VisionDialog
            open={visionOpen}
            onOpenChange={setVisionOpen}
            onCreate={(next, image) => {
              setImageLayer(image);
              onImportConfirm(next);
            }}
          />
        </Suspense>
      )}

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
      {/* COMANDOS E MODAIS AVANÇADOS DO CAD COM IA & SEMÂNTICA (CHAMFER INTENT) */}
      {quickCommandOpen && (
        <Suspense fallback={null}>
          <ChamferSemanticPalette
            open={quickCommandOpen}
            onClose={() => {
              setQuickCommandOpen(false);
              setIntentPreviewPlan(null);
            }}
            commands={quickCommands}
            existingEntities={entities}
            existingDimensions={dims}
            selectedEntityIds={selection}
            activeLayer={activeLayer}
            projectId={project?.id ?? "default-chamfer-project"}
            sessionContext={intentSession}
            onPreviewIntentPlanChange={setIntentPreviewPlan}
            onRestoreVersionSnapshot={(snapEntities, snapDims) => {
              commit(snapEntities);
              setDims(snapDims);
              setSelection(snapEntities.map((e) => e.id));
              if (snapEntities.length > 0) {
                fitTo(snapEntities);
              }
            }}
            onTriggerUndo={undo}
            onTriggerRedo={redo}
            onTriggerExport={() => setExportOpen(true)}
            onClearSelection={() => setSelection([])}
            onExecuteIntentPlan={(plan) => {
              const tx = intentTxManagerRef.current;
              tx.setSession(intentSession);
              const res = tx.commitPlan(plan, {
                commitEntities: commit,
                setDimensions: setDims,
                setSelection,
                fitViewport: (vp) =>
                  fitBox({
                    minX: vp.x,
                    minY: vp.y,
                    maxX: vp.x + vp.width,
                    maxY: vp.y + vp.height,
                  }),
                triggerUndo: undo,
                triggerExport: () => setExportOpen(true),
              });
              setIntentSession(res.updatedSession);
              setIntentPreviewPlan(null);
              if (res.committed) {
                toast.success(plan.response_summary);
              }
            }}
            onExecutePlan={(plan) => {
              commit((prev) => [...prev, ...plan.generatedEntities]);
              if (plan.generatedDimensions && plan.generatedDimensions.length > 0) {
                setDims((prev) => [...prev, ...plan.generatedDimensions!]);
              }
              setSelection(plan.generatedEntities.map((e) => e.id));
              toast.success(`${plan.title} executado e inserido no modelo.`);
            }}
          />
        </Suspense>
      )}


      {topologyHealthOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {presetsModalOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {technicalSheetModalOpen && (
        <Suspense fallback={null}>
          <ChamferTechnicalSheetModal
            open={technicalSheetModalOpen}
            onClose={() => setTechnicalSheetModalOpen(false)}
            suggestedOrigin={{ x: 0, y: 0 }}
            onInsertSheet={(sheetEntities) => {
              commit((prev) => [...prev, ...sheetEntities]);
              toast.success("Folha técnica e legenda inseridas.");
            }}
          />
        </Suspense>
      )}

      {variablesModalOpen && (
        <Suspense fallback={null}>
          <ChamferVariablesModal
            open={variablesModalOpen}
            onClose={() => setVariablesModalOpen(false)}
            onVariablesChange={() => {
              toast.info("Tabela de variáveis atualizada.");
            }}
          />
        </Suspense>
      )}

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

      {/* MÓDULO LUPA HUD (DESMONTADO DO DOM SE DESLIGADO OU EM REPOUSO FLUTUANTE) */}
      {loupeMode !== "off" && (
        <ChamferPrecisionLoupeOverlay
          visible={loupeVisible}
          screenPos={loupeScreenPos}
          cadPos={loupeCadPos}
          activeSnap={smartSnap ?? snapHit}
          activeSnapResult={buildUnifiedSnapResult(loupeCadPos, smartSnap, snapHit, view)}
          baseCadPoint={pending.length > 0 ? pending[pending.length - 1] : null}
          temporaryOrigin={temporaryOrigin}
          activeEdge={activeEdge}
          cameraZoom={view.k}
          drawingProjection={drawingProjection}
          isoPlane={isoPlane}
          entities={entities}
          draft={draft}
          pendingPoints={pending}
          grid={grid}
          showGrid={showGrid}
          isDark={isDark}
          pinned={loupePinned}
          onTogglePinned={toggleLoupePinned}
          rightOffset={rightSidebarOpen ? 300 : undefined}
        />
      )}

      {/* MÓDULO COORDENADAS / MICRO-AJUSTE INCREMENTAL (SOB DEMANDA, LIBERA AO CONFIRMAR/FECHAR) */}
      <ChamferNudgeControlHUD
        visible={!solidOpen && nudgeHudVisible}
        stepMm={nudgeStepMm}
        onStepChange={setNudgeStepMm}
        onNudge={handleNudge}
        onConfirmPoint={handleConfirmNudgePoint}
        onSetExactCoord={(pt) => {
          setCursor(pt);
          setLoupeCadPos(pt);
          toast.success(`Mira posicionada em X: ${pt.x.toFixed(1)}, Y: ${pt.y.toFixed(1)} mm`);
        }}
        canConfirmPoint={
          tool === "line" ||
          tool === "polyline" ||
          tool === "rect" ||
          tool === "rrect" ||
          tool === "circle" ||
          tool === "ellipse" ||
          tool === "arc" ||
          tool === "polygon" ||
          tool === "slot" ||
          tool === "point" ||
          tool === "measure"
        }
        confirmLabel={pending.length === 0 ? "INÍCIO" : "FIXAR"}
        targetLabel={tool === "select" && selection.length > 0 ? "PEÇA" : "MIRA"}
        cursorPos={(smartSnap ?? snapHit)?.p ?? cursor}
        onClose={() => {
          setNudgeHudVisible(false);
          globalCADInteractionHub.deactivateModule("nudge_dpad");
        }}
        isDark={isDark}
      />

      {/* ÁREA DE TRANSFERÊNCIA GLOBAL DO CAD (SEÇÃO 17) */}
      {clipboardModalOpen && (
        <Suspense fallback={null}>
          <ChamferClipboardModal
            open={clipboardModalOpen}
            onClose={() => setClipboardModalOpen(false)}
            anchorWorldPos={clipboardAnchorWorld}
            onPasteItem={handlePasteClipboardItem}
            isDark={isDark}
          />
        </Suspense>
      )}

      {/* HUD DE CONTROLE DE PLANO ISOMÉTRICO (ETAPA DESENHO ISOMÉTRICO 2D DO CHAMFER) */}
      {drawingProjection === "isometric" && activeMode === "2d" && !solidOpen && (
        <ChamferIsoPlaneHUD
          activePlane={isoPlane}
          onSelectPlane={(p) => {
            setIsoPlane(p);
            toast.info(`Plano Isométrico Ativo: ${ISO_PLANES[p].label} (${ISO_PLANES[p].name})`);
          }}
          isoOrtho={isoOrtho}
          onToggleIsoOrtho={() => {
            const next = !isoOrtho;
            setIsoOrtho(next);
            toast.info(next ? "Orto Isométrico: Ativado" : "Orto Isométrico: Desativado");
          }}
          onOpenPieceBuilder={() => setIsoPieceBuilderOpen(true)}
          isDark={isDark}
        />
      )}

      {/* MODAL UNIVERSAL DE PROJEÇÃO E CONVERSÃO ISOMÉTRICA (ZERO TEMPLATES) */}
      {isoPieceBuilderOpen && (
        <Suspense fallback={null}>
          <ChamferIsoConvertModal
            open={isoPieceBuilderOpen}
            onClose={() => {
              setIsoPieceBuilderOpen(false);
              setIsoPreview(null);
            }}
            selectedEntities={selected}
            allEntities={entities}
            dims={dims}
            activeSheetThickness={thickness}
            onConfirm={({ updatedEntities, updatedDims, newSelectionIds }) => {
              commit(updatedEntities);
              setDims(updatedDims);
              setSelection(newSelectionIds);
              setIsoPreview(null);
              if (updatedEntities.some((e) => e.params?.isIso)) {
                setDrawingProjection("isometric");
              }
              fitTo(updatedEntities);
              toast.success("Seleção convertida para perspectiva isométrica sólida com sucesso!");
            }}
            onPreviewChange={setIsoPreview}
            isDark={isDark}
          />
        </Suspense>
      )}

      {/* EDIÇÃO DIRETA DE COTAS NO CANVAS (SEÇÃO 14) */}
      {directDimEditor && (
        <ChamferDirectDimensionEditor
          open={directDimEditor.open}
          onClose={() => setDirectDimEditor(null)}
          screenPos={directDimEditor.pos}
          currentValue={directDimEditor.value}
          label={directDimEditor.label}
          onConfirm={handleDirectDimUpdate}
        />
      )}

      {/* TECLADO NUMÉRICO CAD INTEGRADO PARA PERSONALIZAÇÃO DE LARGURA X / ALTURA Y DA ÁREA DE TRABALHO */}
      {workspaceKeypadEditor && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => setWorkspaceKeypadEditor(null)}
          screenPos={workspaceKeypadEditor.screenPos}
          currentValue={workspaceKeypadEditor.currentValue}
          label={
            workspaceKeypadEditor.axis === "w"
              ? "Largura X da Área (mm)"
              : "Altura Y da Área (mm)"
          }
          allowLock={true}
          initialLocked={Boolean(frame.locked)}
          allowNegative={false}
          unit="mm"
          presets={[
            { label: "1000", value: 1000 },
            { label: "1200", value: 1200 },
            { label: "1500", value: 1500 },
            { label: "2000", value: 2000 },
            { label: "3000", value: 3000 },
            { label: "6000", value: 6000 },
          ]}
          onConfirm={(newVal, lockMeasure) => {
            const clamped = clampSide(newVal, workspaceKeypadEditor.currentValue);
            const patch: Partial<WorkspaceFrame> =
              workspaceKeypadEditor.axis === "w"
                ? { w: clamped, visible: true, locked: Boolean(lockMeasure) }
                : { h: clamped, visible: true, locked: Boolean(lockMeasure) };
            const nextFrame: WorkspaceFrame = { ...frame, ...patch };
            updateFrame(patch);
            setWorkspaceKeypadEditor(null);
            fitBox(frameBox(nextFrame));
            toast.success(
              `Área de Trabalho ajustada para ${Math.round(nextFrame.w)} × ${Math.round(nextFrame.h)} mm`,
            );
          }}
        />
      )}

      {/* EDIÇÃO DIRETA DE COTAS VIVAS NO CANVAS (TECLADO NUMÉRICO CAD INTEGRADO + RESTRIÇÕES DIMENSIONAIS) */}
      {liveDimEditor && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => {
            if (preEditKeypadSnapshotRef.current) {
              setCursor(preEditKeypadSnapshotRef.current.cursor);
              setDraft(preEditKeypadSnapshotRef.current.draft);
              preEditKeypadSnapshotRef.current = null;
            }
            setLiveDimEditor(null);
          }}
          screenPos={liveDimEditor.screenPos}
          currentValue={liveDimEditor.currentValue}
          label={liveDimEditor.label}
          allowInvert={liveDimEditor.allowInvert}
          allowLock={Boolean(liveDimEditor.measureKind)}
          initialLocked={Boolean(liveDimEditor.initialLocked)}
          unit={liveDimEditor.measureKind === "angle" ? "°" : "mm"}
          allowNegative={
            liveDimEditor.measureKind === "dx" ||
            liveDimEditor.measureKind === "dy" ||
            liveDimEditor.measureKind === "angle"
          }
          onInvertSide={() => {
            setActiveEdgeSide((prev) => (prev === 1 ? -1 : 1));
            triggerHaptic("selection");
          }}
          onPreviewChange={(previewVal) => {
            if (!liveDimEditor.measureKind) return;
            const tempConstraints: DimensionalConstraints = { ...lockedConstraints };
            if (liveDimEditor.measureKind === "L") tempConstraints.lockedL = previewVal;
            if (liveDimEditor.measureKind === "angle") {
              tempConstraints.lockedAngle = ((previewVal % 360) + 360) % 360;
            }
            if (liveDimEditor.measureKind === "dx") {
              tempConstraints.lockedDx = Math.abs(previewVal);
              tempConstraints.signDx = previewVal >= 0 ? 1 : -1;
            }
            if (liveDimEditor.measureKind === "dy") {
              tempConstraints.lockedDy = Math.abs(previewVal);
              tempConstraints.signDy = previewVal >= 0 ? 1 : -1;
            }
            if (liveDimEditor.measureKind === "d") tempConstraints.lockedDist = previewVal;

            const anchorPt = liveDimEditor.dim.startPoint;
            const nextPt = applyDimensionalConstraintsToPoint(
              anchorPt,
              liveDimEditor.dim.endPoint,
              tempConstraints,
            );
            setCursor(nextPt);
            if (pending.length === 1) {
              setDraft(
                buildDraft(
                  tool,
                  pending[0]!,
                  nextPt,
                  activeLayer,
                  filletR,
                  drawingProjection,
                  isoPlane,
                ),
              );
            }
          }}
          onConfirm={(newVal, lockMeasure) => {
            const mKind = liveDimEditor.measureKind;
            if (mKind) {
              const anchorPt = liveDimEditor.dim.startPoint;
              const currentDelta = {
                dx: liveDimEditor.dim.endPoint.x - anchorPt.x,
                dy: liveDimEditor.dim.endPoint.y - anchorPt.y,
              };
              const validation = validateDimensionalConstraint(
                lockedConstraints,
                mKind,
                newVal,
                Boolean(lockMeasure),
                currentDelta,
              );
              if (!validation.valid) {
                toast.error(validation.conflictMessage ?? "Restrição dimensional incompatível.");
                return;
              }
              setLockedConstraints(validation.updatedConstraints);

              // Aplica o valor recém-confirmado sobre o ponto alvo (mesmo que não fique travado permanentemente)
              const oneShotValidation = validateDimensionalConstraint(
                lockedConstraints,
                mKind,
                newVal,
                true,
                currentDelta,
              );
              const constrainedPt = applyDimensionalConstraintsToPoint(
                anchorPt,
                liveDimEditor.dim.endPoint,
                oneShotValidation.valid ? oneShotValidation.updatedConstraints : validation.updatedConstraints,
              );

              setCursor(constrainedPt);
              setLoupeCadPos(constrainedPt);

              // Se há uma linha única ou um Datum Persistente selecionado, atualiza atomicamente a entidade
              if (liveDimEditor.dim.entityId) {
                const targetId = liveDimEditor.dim.entityId;
                commit((prev) =>
                  prev.map((ent) => {
                    if (ent.id !== targetId) return ent;
                    if (isPersistentDatumEntity(ent)) {
                      const prevSpec = getPersistentDatumSpec(ent);
                      if (!prevSpec) return ent;
                      const nextSpec: PersistentDatumSpec = {
                        ...prevSpec,
                        target: { x: constrainedPt.x, y: constrainedPt.y },
                      };
                      return {
                        ...ent,
                        x: constrainedPt.x,
                        y: constrainedPt.y,
                        params: {
                          ...ent.params,
                          persistentDatumSpec: nextSpec,
                        },
                      };
                    }
                    if (ent.type !== "line") return ent;
                    const prevLocked =
                      (ent.params?.lockedConstraints as DimensionalConstraints | undefined) ?? {};
                    const nextEntLocked: DimensionalConstraints = { ...prevLocked };
                    if (lockMeasure) {
                      if (mKind === "L") nextEntLocked.lockedL = newVal;
                      if (mKind === "angle") nextEntLocked.lockedAngle = ((newVal % 360) + 360) % 360;
                      if (mKind === "dx") nextEntLocked.lockedDx = newVal;
                      if (mKind === "dy") nextEntLocked.lockedDy = newVal;
                      if (mKind === "d") nextEntLocked.lockedDist = newVal;
                    } else {
                      if (mKind === "L") delete nextEntLocked.lockedL;
                      if (mKind === "angle") delete nextEntLocked.lockedAngle;
                      if (mKind === "dx") delete nextEntLocked.lockedDx;
                      if (mKind === "dy") delete nextEntLocked.lockedDy;
                      if (mKind === "d") delete nextEntLocked.lockedDist;
                    }
                    return {
                      ...ent,
                      x2: constrainedPt.x,
                      y2: constrainedPt.y,
                      params: {
                        ...ent.params,
                        lockedConstraints: nextEntLocked,
                      },
                    };
                  }),
                );
              } else if (pending.length === 1) {
                setDraft(
                  buildDraft(
                    tool,
                    pending[0]!,
                    constrainedPt,
                    activeLayer,
                    filletR,
                    drawingProjection,
                    isoPlane,
                  ),
                );
              }

              preEditKeypadSnapshotRef.current = null;
              triggerHaptic("success");
              const unitSuffix = mKind === "angle" ? "°" : " mm";
              const kindDisplay =
                mKind === "dx"
                  ? "ΔX"
                  : mKind === "dy"
                    ? "ΔY"
                    : mKind === "angle"
                      ? "∠"
                      : mKind;
              toast.success(
                lockMeasure
                  ? `🔒 ${kindDisplay} fixado em ${newVal.toFixed(1)}${unitSuffix}`
                  : `✓ ${kindDisplay} ajustado para ${newVal.toFixed(1)}${unitSuffix}`,
              );
              setLiveDimEditor(null);
              return;
            }

            const result = DimensionInteractionEngine.applyDimension({
              dim: liveDimEditor.dim,
              newValue: newVal,
              entities,
              selectedIds: selection,
              temporaryOrigin,
              activeEdge,
              activeEdgeSide,
              currentCursor: cursor,
              activeLayer,
            });

            if (result.updatedEntities && result.updatedEntities.length > 0) {
              commit(result.updatedEntities);
            }
            if (result.newCursor) {
              setCursor(result.newCursor);
              if (pending.length > 0) {
                const p0 = pending[0]!;
                const completedLine: Entity = {
                  id: uid(),
                  layer: activeLayer,
                  type: "line",
                  x1: p0.x,
                  y1: p0.y,
                  x2: result.newCursor.x,
                  y2: result.newCursor.y,
                };
                commit((prev) => [...prev.filter((e) => e.id !== completedLine.id), completedLine]);
                setPending([]);
                setDraft(null);
              }
            }
            if (liveDimEditor.dim.kind === "offset") {
              setActiveEdgeOffset(newVal);
            }
            preEditKeypadSnapshotRef.current = null;
            triggerHaptic("success");
            toast.success(`✓ ${result.message}`);
            setLiveDimEditor(null);
          }}
        />
      )}

      {/* PASSAPORTE DA PEÇA E PRONTIDÃO DE FABRICAÇÃO (SEÇÕES 34 & 35) */}
      {fabricationPassportOpen && (
        <Suspense fallback={null}>
          <ChamferFabricationPassportModal
            open={fabricationPassportOpen}
            onClose={() => setFabricationPassportOpen(false)}
            entities={entities}
            projectName={project?.name ?? "Projeto Chamfer"}
            onExportDxf={() => setExportOpen(true)}
            onExportSvg={() => downloadTracagemSvgFile(entities, project?.name ?? "Projeto Chamfer")}
          />
        </Suspense>
      )}

      {/* ESTÚDIO DA OFICINA DIGITAL INTEGRADA (CATÁLOGO COSTA FERRO + DOSSIÊ MULTI-VISTAS + CORTE 6M + BOM + ORÇAMENTO) */}
      {integratedWorkshopOpen && (
        <Suspense fallback={null}>
          <CaldraIntegratedWorkshopModal
            open={integratedWorkshopOpen}
            onClose={() => setIntegratedWorkshopOpen(false)}
            canvasEntities={entities}
            projectName={project?.name ?? "Projeto Chamfer"}
            onInsertEntitiesToCad={(newEntities, replaceAll) => {
              if (replaceAll) {
                commit(newEntities);
              } else {
                commit((prev) => [...prev, ...newEntities]);
              }
              setSelection(newEntities.map((e) => e.id));
              fitTo(newEntities);
            }}
          />
        </Suspense>
      )}

      {/* DIÁLOGO DE APARÊNCIA E PREFERÊNCIAS DO PROJETO CHAMFER */}
      <ChamferProjectSettingsDialog
        open={projectSettingsOpen}
        onOpenChange={setProjectSettingsOpen}
        projectId={project?.id ?? projectId}
        projectName={project?.name}
        onSettingsChange={(next) => {
          setChamferSettings(next);
          setShowGrid(next.showGridOnLoad);
          setSnapOn(next.snapOnLoad);
        }}
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

const IconBtn = React.memo(function IconBtn({
  label,
  onClick,
  icon: Icon,
  flat,
  active,
  title,
  buttonRef,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon: typeof Minus;
  flat?: boolean;
  active?: boolean;
  title?: string;
  isDark?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={title ?? label}
      aria-label={label}
      style={{
        backgroundColor: active
          ? "var(--chamfer-accent)"
          : flat
            ? "transparent"
            : "var(--chamfer-surface-elevated)",
        borderColor: active
          ? "var(--chamfer-accent)"
          : flat
            ? "transparent"
            : "var(--chamfer-border)",
        color: active ? "var(--chamfer-accent-contrast)" : "var(--chamfer-text-primary)",
      }}
      className="grid size-8 shrink-0 place-items-center rounded-lg border cursor-pointer active:scale-95 hover:brightness-110 transition-all"
    >
      <Icon className="size-[15px]" />
    </button>
  );
});

const ToolBtn = React.memo(function ToolBtn({
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
});

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

const MenuItem = React.memo(function MenuItem({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Minus;
  onClick: () => void;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ color: "var(--chamfer-text-primary)" }}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer hover:bg-white/[0.06]"
    >
      <Icon className="size-3.5 shrink-0" style={{ color: "var(--chamfer-accent)" }} /> {label}
    </button>
  );
});

function buildDraft(
  tool: Tool,
  a: Vec2,
  b: Vec2,
  layer: string,
  radius: number,
  drawingProjection: DrawingProjectionMode = "orthographic",
  isoPlane: IsoPlane = "top",
  opts?: {
    rectMode?: RectCreationMode;
    circleMode?: CircleCreationMode;
    polygonMode?: PolygonCreationMode;
    polygonSides?: number;
    polygonAcrossFlatsMm?: number;
    slotMode?: SlotCreationMode;
    slotWidthMm?: number;
    lockedRadiusMm?: number;
  },
): Entity | null {
  if (drawingProjection === "isometric") {
    if (tool === "rect") {
      return buildIsoParallelogram(isoPlane, a, b, layer);
    }
    if (tool === "circle" || tool === "ellipse") {
      return buildIsoCircle(isoPlane, a, opts?.lockedRadiusMm ?? dist(a, b), layer);
    }
  }
  switch (tool) {
    case "line":
      return { id: uid(), layer, type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    case "construction_line":
      return buildConstructionAxisLine(a, b, "REF");
    case "rect":
      return buildParametricRectangle(opts?.rectMode ?? "corners", [a, b], {
        layer,
        filletRadius: 0,
      });
    case "rrect":
      return buildParametricRectangle(opts?.rectMode ?? "corners", [a, b], {
        layer,
        filletRadius: Math.max(0.5, radius),
      });
    case "circle": {
      if (opts?.circleMode === "two_point") {
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        return { id: uid(), layer, type: "circle", cx, cy, r: Math.max(0.5, dist(a, b) / 2) };
      }
      const r = opts?.lockedRadiusMm ?? dist(a, b);
      return { id: uid(), layer, type: "circle", cx: a.x, cy: a.y, r };
    }
    case "polygon": {
      const r = opts?.lockedRadiusMm ?? dist(a, b);
      const rotRad = Math.atan2(b.y - a.y, b.x - a.x);
      const targetPt: Vec2 = {
        x: a.x + Math.cos(rotRad) * r,
        y: a.y + Math.sin(rotRad) * r,
      };
      return buildPolygonParametric(
        a,
        targetPt,
        opts?.polygonSides ?? 6,
        opts?.polygonMode ?? "inscribed",
        layer,
        opts?.polygonAcrossFlatsMm,
      );
    }
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
      const width = opts?.slotWidthMm ?? Math.max(12, len / 2.5);
      return buildMechanicalSlotAdvanced(a, b, width, opts?.slotMode ?? "center_to_center", layer);
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
export const EntityShape = React.memo(function EntityShape({
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
  const isDark =
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark") ||
        document.documentElement.classList.contains("amoled")
      : true;
  const style = techStyle(e.layer);
  const isCutOrWhite = style.color === "#FFFFFF" || e.layer === "corte";
  const lightSafeLayerColor =
    e.layer === "construcao" || e.layer === "referencia"
      ? "#475569"
      : e.layer === "recorte"
        ? "#B45309"
        : e.layer === "cota" || e.layer === "anotacoes"
          ? "#0284C7"
          : e.layer === "dobra"
            ? "#BE185D"
            : e.layer === "marcacao"
              ? "#1D4ED8"
              : e.layer === "auxiliar"
                ? "#7E22CE"
                : style.color;
  const stroke = preview
    ? isDark
      ? PREVIEW_COLOR
      : "#0F141A"
    : isCutOrWhite
      ? isDark
        ? "#ECEFF4"
        : "#0F141A"
      : isDark
        ? style.color
        : lightSafeLayerColor;
  const isIsoSolid = !!e.params?.isIsoSolidFace;
  const fillColor = isIsoSolid ? ((e.params?.fillColor as string) || "rgba(18, 40, 74, 0.25)") : "none";
  const customStroke =
    typeof e.params?.strokeColor === "string" && e.params.strokeColor.trim().length > 0
      ? e.params.strokeColor.trim()
      : isIsoSolid
        ? "#E8F4FF"
        : stroke;
  const customWidth = isIsoSolid
    ? (typeof e.params?.strokeWidth === "number" ? e.params.strokeWidth : 2.0) / k
    : (isCutOrWhite ? Math.max(2.1, 1.65 * style.weight) : Math.max(1.6, 1.45 * style.weight)) / k;
  const noStroke = isIsoSolid && !!e.params?.noStroke;
  const customDashArr = Array.isArray(e.params?.dash) ? (e.params.dash as number[]) : null;

  const props = {
    fill: fillColor,
    stroke: noStroke ? "none" : customStroke,
    strokeOpacity: 1,
    strokeWidth: customWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeDasharray:
      preview && !isIsoSolid
        ? `${5 / k} ${4 / k}`
        : customDashArr && customDashArr.length > 0
          ? customDashArr.map((d) => d / k).join(" ")
          : style.dash(1 / k),
  };
  const halo = selected
    ? {
        fill: "none",
        stroke: !isDark ? "#E11D48" : SELECTION_COLOR,
        strokeOpacity: !isDark ? 0.8 : 0.72,
        strokeWidth: 4.5 / k,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      }
    : null;

  const shape = (p: Record<string, unknown>, key?: string) => {
    if (e.type === "line") {
      if (!Number.isFinite(e.x1) || !Number.isFinite(e.y1) || !Number.isFinite(e.x2) || !Number.isFinite(e.y2)) return null;
      return <line key={key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...p} />;
    }
    if (e.type === "circle") {
      if (!Number.isFinite(e.cx) || !Number.isFinite(e.cy) || !Number.isFinite(e.r) || e.r <= 0) return null;
      return <circle key={key} cx={e.cx} cy={e.cy} r={e.r} {...p} />;
    }
    if (e.type === "polyline") {
      const validPts = e.pts.filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y));
      if (validPts.length < 2) return null;
      const d = validPts.map((q) => `${q.x},${q.y}`).join(" ");
      return e.closed ? (
        <polygon key={key} points={d} {...p} />
      ) : (
        <polyline key={key} points={d} {...p} />
      );
    }
    if (e.type === "arc") {
      if (
        !Number.isFinite(e.cx) ||
        !Number.isFinite(e.cy) ||
        !Number.isFinite(e.r) ||
        !Number.isFinite(e.a0) ||
        !Number.isFinite(e.a1) ||
        e.r <= 0
      )
        return null;
      const p0 = { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) };
      const p1 = { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) };
      if (!Number.isFinite(p0.x) || !Number.isFinite(p0.y) || !Number.isFinite(p1.x) || !Number.isFinite(p1.y)) return null;
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
      if (
        !Number.isFinite(e.cx) ||
        !Number.isFinite(e.cy) ||
        !Number.isFinite(e.rx) ||
        !Number.isFinite(e.ry) ||
        e.rx <= 0 ||
        e.ry <= 0
      )
        return null;
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
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return null;
      if (e.params?.isGeometricMark || e.params?.isPersistentDatum) return null;
      return (
        <g key={key}>
          <circle
            cx={e.x}
            cy={e.y}
            r={3.5 / (Number.isFinite(k) && k > 0 ? k : 1)}
            fill="var(--warn, #f59e0b)"
            stroke="var(--background)"
            strokeWidth={0.8 / (Number.isFinite(k) && k > 0 ? k : 1)}
          />
          {e.label && (
            <text
              x={e.x + 4.5 / (Number.isFinite(k) && k > 0 ? k : 1)}
              y={e.y - 4.5 / (Number.isFinite(k) && k > 0 ? k : 1)}
              fontSize={8.5 / (Number.isFinite(k) && k > 0 ? k : 1)}
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
      const validBoundary = e.boundaryPts.filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y));
      if (validBoundary.length < 3) return null;
      const d = validBoundary.map((q) => `${q.x},${q.y}`).join(" ");
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
    if (e.type === "path") {
      if (!e.start || !Number.isFinite(e.start.x) || !Number.isFinite(e.start.y)) return null;
      return <path key={key} d={pathToSvg(e.start, e.segs, e.closed)} fill="none" {...p} />;
    }
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
});

const Rulers = React.memo(function Rulers({
  view,
  isDark,
  themeColors,
  majorStep,
  unit = "mm",
  width,
  height,
  cursor,
  frame,
  compactPortrait = false,
  onCenterWorkspace,
}: {
  view: { tx: number; ty: number; k: number };
  isDark: boolean;
  themeColors?: ChamferThemeColors;
  majorStep: number;
  unit?: string;
  width: number;
  height: number;
  cursor?: Vec2;
  frame?: WorkspaceFrame;
  compactPortrait?: boolean;
  onCenterWorkspace?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vw = Math.max(1, width || (typeof window !== "undefined" ? window.innerWidth : 1920));
  const vh = Math.max(1, height || (typeof window !== "undefined" ? window.innerHeight : 1080));

  useLayoutEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    const targetW = Math.round(vw * dpr);
    const targetH = Math.round(vh * dpr);
    if (cvs.width !== targetW || cvs.height !== targetH) {
      cvs.width = targetW;
      cvs.height = targetH;
    }

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const V_RULER_W = compactPortrait ? 20 : 30;
    const H_RULER_H = compactPortrait ? 20 : 26;
    const safeK = Number.isFinite(view.k) && view.k > 0 ? view.k : 1;

    // Seleção de passo principal técnico (1, 2, 5 × 10^n) garantindo espaçamento >= 76px
    const NICE_STEPS = [
      1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000,
    ];
    let labelStep = Math.max(1, majorStep || 10);
    for (const s of NICE_STEPS) {
      if (s * safeK >= 76) {
        labelStep = s;
        break;
      }
    }
    while (labelStep * safeK < 76) {
      labelStep *= 2;
    }

    const midStep = labelStep / 2;
    const minorDivisions = labelStep * safeK >= 140 ? 10 : 5;
    const minorStep = labelStep / minorDivisions;

    const bgColor = themeColors?.rulerBg ?? (isDark ? "rgba(17, 20, 26, 0.90)" : "rgba(248, 250, 252, 0.90)");
    const borderColor = themeColors?.border ?? (isDark ? "#232A35" : "#D5DCE4");
    const majorTickColor = themeColors?.textSecondary ?? (isDark ? "#9AA4B2" : "#4B5563");
    const midTickColor = themeColors?.textMuted ?? (isDark ? "#647080" : "#6B7280");
    const minorTickColor = themeColors?.borderStrong ?? (isDark ? "#2F3847" : "#B8C2CC");
    const textColor = themeColors?.textPrimary ?? (isDark ? "#ECEFF4" : "#0F141A");
    const zeroColor = "#DC143C";
    const workspaceBandFill = themeColors?.accentSoft ?? (isDark ? "rgba(0, 102, 255, 0.14)" : "rgba(0, 102, 255, 0.10)");
    const workspaceBandEdge = themeColors?.accent ?? "#0066FF";

    /* =====================================================================
     * 1. RÉGUA HORIZONTAL SUPERIOR (Altura = 26px, Clipping x: 30..vw, y: 0..26)
     * ===================================================================== */
    ctx.save();
    ctx.beginPath();
    ctx.rect(V_RULER_W, 0, Math.max(0, vw - V_RULER_W), H_RULER_H);
    ctx.clip();

    // Fundo da régua horizontal
    ctx.fillStyle = bgColor;
    ctx.fillRect(V_RULER_W, 0, vw - V_RULER_W, H_RULER_H);

    // Faixa iluminada do intervalo da Área de Trabalho [0, frame.w]
    if (frame?.visible && Number.isFinite(frame.w) && frame.w > 0) {
      const x0 = Math.max(V_RULER_W, view.tx);
      const x1 = Math.min(vw, view.tx + frame.w * safeK);
      if (x1 > x0) {
        ctx.fillStyle = workspaceBandFill;
        ctx.fillRect(x0, 0, x1 - x0, H_RULER_H);
        ctx.fillStyle = workspaceBandEdge;
        ctx.fillRect(x0, H_RULER_H - 1.5, x1 - x0, 1.5);
      }
    }

    // Borda inferior da régua horizontal
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(V_RULER_W, H_RULER_H - 0.5);
    ctx.lineTo(vw, H_RULER_H - 0.5);
    ctx.stroke();

    // Ticks de 3 níveis + Números posicionados +5px à direita do traço principal (zero colisão)
    const minWorldX = (V_RULER_W - view.tx) / safeK;
    const maxWorldX = (vw - view.tx) / safeK;
    const startIdxX = Math.floor(minWorldX / minorStep) - 1;
    const endIdxX = Math.ceil(maxWorldX / minorStep) + 1;

    ctx.font = compactPortrait
      ? '600 9px "JetBrains Mono", "Inter", ui-monospace, monospace'
      : '600 10px "JetBrains Mono", "Inter", ui-monospace, monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = startIdxX; i <= endIdxX; i++) {
      const worldX = i * minorStep;
      const screenX = Math.round(view.tx + worldX * safeK) + 0.5;
      if (screenX < V_RULER_W - 2 || screenX > vw + 2) continue;

      const isMajor = Math.abs(worldX / labelStep - Math.round(worldX / labelStep)) < 1e-4;
      const isMid = !isMajor && Math.abs(worldX / midStep - Math.round(worldX / midStep)) < 1e-4;

      const tickLen = isMajor ? (compactPortrait ? 9 : 12) : isMid ? (compactPortrait ? 5.5 : 7) : 3.5;
      ctx.strokeStyle = isMajor ? majorTickColor : isMid ? midTickColor : minorTickColor;
      ctx.lineWidth = isMajor ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(screenX, H_RULER_H - tickLen);
      ctx.lineTo(screenX, H_RULER_H);
      ctx.stroke();

      if (isMajor) {
        const val = Math.round(worldX);
        ctx.fillStyle = val === 0 ? zeroColor : textColor;
        ctx.fillText(String(val), screenX + (compactPortrait ? 4 : 5), compactPortrait ? 2.5 : 4);
      }
    }

    // Hairline Tracker do Cursor na Régua Horizontal (#DC143C)
    if (cursor && Number.isFinite(cursor.x)) {
      const cx = view.tx + cursor.x * safeK;
      if (cx >= V_RULER_W && cx <= vw) {
        ctx.strokeStyle = "#DC143C";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H_RULER_H);
        ctx.stroke();

        ctx.fillStyle = "#DC143C";
        ctx.beginPath();
        ctx.moveTo(cx - 3.5, 0);
        ctx.lineTo(cx + 3.5, 0);
        ctx.lineTo(cx, 5);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();

    /* =====================================================================
     * 2. RÉGUA VERTICAL ESQUERDA (Largura = 30px, Clipping x: 0..30, y: 26..vh)
     * ===================================================================== */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, H_RULER_H, V_RULER_W, Math.max(0, vh - H_RULER_H));
    ctx.clip();

    // Fundo da régua vertical
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, H_RULER_H, V_RULER_W, vh - H_RULER_H);

    // Faixa iluminada do intervalo da Área de Trabalho [0, frame.h]
    if (frame?.visible && Number.isFinite(frame.h) && frame.h > 0) {
      const y0 = Math.max(H_RULER_H, view.ty);
      const y1 = Math.min(vh, view.ty + frame.h * safeK);
      if (y1 > y0) {
        ctx.fillStyle = workspaceBandFill;
        ctx.fillRect(0, y0, V_RULER_W, y1 - y0);
        ctx.fillStyle = workspaceBandEdge;
        ctx.fillRect(V_RULER_W - 1.5, y0, 1.5, y1 - y0);
      }
    }

    // Borda direita da régua vertical
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(V_RULER_W - 0.5, H_RULER_H);
    ctx.lineTo(V_RULER_W - 0.5, vh);
    ctx.stroke();

    // Ticks de 3 níveis + Números rotacionados a -90° (-Math.PI / 2) 100% legíveis sem corte
    const minWorldY = (H_RULER_H - view.ty) / safeK;
    const maxWorldY = (vh - view.ty) / safeK;
    const startIdxY = Math.floor(minWorldY / minorStep) - 1;
    const endIdxY = Math.ceil(maxWorldY / minorStep) + 1;

    ctx.font = compactPortrait
      ? '600 9px "JetBrains Mono", "Inter", ui-monospace, monospace'
      : '600 10px "JetBrains Mono", "Inter", ui-monospace, monospace';

    for (let i = startIdxY; i <= endIdxY; i++) {
      const worldY = i * minorStep;
      const screenY = Math.round(view.ty + worldY * safeK) + 0.5;
      if (screenY < H_RULER_H - 2 || screenY > vh + 2) continue;

      const isMajor = Math.abs(worldY / labelStep - Math.round(worldY / labelStep)) < 1e-4;
      const isMid = !isMajor && Math.abs(worldY / midStep - Math.round(worldY / midStep)) < 1e-4;

      const tickLen = isMajor ? (compactPortrait ? 9 : 12) : isMid ? (compactPortrait ? 5.5 : 7) : 3.5;
      ctx.strokeStyle = isMajor ? majorTickColor : isMid ? midTickColor : minorTickColor;
      ctx.lineWidth = isMajor ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(V_RULER_W - tickLen, screenY);
      ctx.lineTo(V_RULER_W, screenY);
      ctx.stroke();

      if (isMajor) {
        const val = Math.round(worldY);
        ctx.save();
        ctx.translate(compactPortrait ? 7 : 10, screenY - (compactPortrait ? 4 : 5));
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = val === 0 ? zeroColor : textColor;
        ctx.fillText(String(val), 0, 0);
        ctx.restore();
      }
    }

    // Hairline Tracker do Cursor na Régua Vertical (#DC143C)
    if (cursor && Number.isFinite(cursor.y)) {
      const cy = view.ty + cursor.y * safeK;
      if (cy >= H_RULER_H && cy <= vh) {
        ctx.strokeStyle = "#DC143C";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(V_RULER_W, cy);
        ctx.stroke();

        ctx.fillStyle = "#DC143C";
        ctx.beginPath();
        ctx.moveTo(0, cy - 3.5);
        ctx.lineTo(0, cy + 3.5);
        ctx.lineTo(5, cy);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.restore();
  }, [view.tx, view.ty, view.k, isDark, themeColors, majorStep, vw, vh, cursor?.x, cursor?.y, frame?.visible, frame?.w, frame?.h, compactPortrait]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden z-10">
      {/* Canvas de Alta Precisão para as Réguas Horizontal (20px em retrato / 26px em paisagem) e Vertical (20px em retrato / 30px em paisagem) */}
      <canvas
        ref={canvasRef}
        style={{ width: `${vw}px`, height: `${vh}px` }}
        className="pointer-events-none absolute inset-0"
      />

      {/* Bloco de Canto Interativo [ MM ]: toca para enquadrar a Área de Trabalho */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCenterWorkspace?.();
        }}
        title="Toque para centralizar e enquadrar a Área de Trabalho na tela"
        style={{
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-secondary)",
        }}
        className={cn(
          "pointer-events-auto absolute left-0 top-0 z-20 flex items-center justify-center border-b border-r font-mono font-bold uppercase transition-colors cursor-pointer active:scale-95 hover:brightness-110",
          compactPortrait ? "w-[20px] h-[20px] text-[7.5px]" : "w-[30px] h-[26px] text-[8.5px]",
        )}
      >
        {unit}
      </button>
    </div>
  );
});

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
