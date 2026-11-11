/**
 * CALDRA CHAMFER — MOTOR INTERATIVO DE MODELAGEM DIRETA 3D, GIZMO 3D, TECLADO NUMÉRICO FLUTUANTE E LOFT
 *
 * Ergonomia de CAD Profissional (Canvas 90% Livre):
 * 1. Pílula de Comando Ativo no Topo Central (top: 36px, max-width: 420px, height: 40px, rounded-full)
 * 2. Dock Contextual Inferior Único e Enxuto (bottom: 14px, max-width: calc(100% - 48px), height: 42px, rounded-full)
 * 3. Teclado Numérico Flutuante Compacto (width: 196px, oculto por padrão, Viewport Clamping estrito)
 * 4. Adaptação 100% ao Tema Ativo (Claro #FFFFFF / Escuro #0B1220 / AMOLED #05080F)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Check,
  CircleDot,
  Compass,
  Copy,
  CornerDownRight,
  FileText,
  FlipHorizontal,
  Layers,
  Maximize2,
  Move,
  Palette,
  PenTool,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  bbox,
  boxOf,
  rectPolyline,
  regularPolygon,
  translate,
  uid,
  type Entity,
  type Vec2,
} from "@/lib/lab2d/core";
import type { WorkplaneOrbitProjection2D } from "@/lib/lab2d/orbit3dController";
import {
  resolveContactAndAlignmentSnaps3D,
  resolveFaceStretchContactSnap,
  type ContactSnapResult3D,
} from "@/lib/lab2d/cadContactSnapping3D";
import {
  getEntityElevationZ,
  setEntityElevationZ,
  unfoldLoft3DShellToFlatPattern2D,
  type LoftBodyMode,
  type LoftSurfaceMode,
} from "@/lib/lab2d/cadLoft3DEngine";
import {
  applyAdvancedHole3DToEntities,
  applyDirectArray3DToEntities,
  applyDirectBoolean3DBetweenBodies,
  applyDirectRevolve3DToEntities,
  applyDirectSweep3DToEntities,
  applyExplodedView3DToEntities,
  applySheetMetalEdgeFlange3DToEntities,
  applyStructuralFrame3DToEntities,
  computeExactBendAllowance,
  computeTruncatedConeDevelopment,
  evaluateSectionPlane3DCrossSection,
  executeDemoChapaCaldeiraria3D,
  generateStructuralCutListFrom3DScene,
  runAssemblyInterferenceAndClearanceCheck,
  type AdvancedHoleType3D,
  type SectionPlane3DState,
} from "@/lib/lab2d/chamfer3DMasterSuite";
import {
  HOLE_METRIC_SPECS_3D,
  applyDirectAlignFlush3DToEntities,
  applyDirectExtrudeToEntities,
  applyDirectFaceExtrude3DToEntities,
  applyDirectFilletOrChamfer3DToEntities,
  applyDirectHole3DToEntities,
  applyDirectMirror3DToEntities,
  applyDirectMiterCut3DToEntities,
  applyDirectOffsetFace3DToEntities,
  applyDirectScale3DToEntities,
  applyDirectShell3DToEntities,
  applyDirectTransform3DToEntities,
  buildDirectTopology3DScene,
  executeMetalStructure10StepBenchmark,
  formatSubElementTelemetry3D,
  generateTechnicalDrawingViews2DFrom3D,
  project3DSelectionTo2DSketch,
  projectPoint3DToCanvasViewMm,
  resolveFaceShellCapDirection3D,
  resolveShellOpenCapsFromSelection3D,
  type ActiveParametricNumpadSession,
  type BooleanMode3D,
  type DirectBody3D,
  type DirectEdge3D,
  type DirectFace3D,
  type DirectModeling3DTool,
  type DirectTopology3DScene,
  type DirectVertex3D,
  type MetricHoleThreadSize,
  type NumpadTargetParameter,
  type ParametricNumpadKind,
  type SelectionScope3D,
  type ShellOpenCap3D,
  type SubElementSelectionState3D,
  type Vec3Mm,
} from "@/lib/lab2d/cadDirectModeling3D";
import {
  buildCompassSectorPath,
  buildDoubleHeadedMiterArcSvg,
  computeExternalCompassRadiusPx,
  computeMiterDragAngleAndSnap,
  computeNonOverlappingGizmoBadgePos,
  computeRotationDragAngleAndSnap,
  computeViewAlignedRotationHandlePlacement,
  type RotationSnapResult,
} from "@/lib/lab2d/chamfer3DRotationCompass";
import {
  buildHorizontalMiterBar3DPolygons,
  computeSmartGrilleArray3D,
  computeSmartMiterFrame3D,
  detectInternalSpan3D,
  extractTubeCrossSectionFromBody3D,
  generateSmartGrilleArrayEntities3D,
  generateSmartMiterFrameEntities3D,
  getBodyIntervalAlongAxis,
  type SmartArrayAxis3D,
  type SmartArrayDivisionMode3D,
  type SmartArrayPanelTab3D,
  type SmartFrameJointMode3D,
  type SmartFrameMeasureRef3D,
  type SmartFramePlane3D,
} from "@/lib/lab2d/chamfer3DSmartArray";
import {
  applyAssemblyGroupToEntities3D,
  applyDropBodiesToBaseZ0,
  applyMultiBodyRigidTransform3D,
  applyUniformMaterialToEntities3D,
  computeMultiBodyInspectorSummary3D,
  computeMultiBodySetPivot3D,
  createInitialBaseEcholocationState3D,
  evaluateBaseSurfaceSnap3D,
  evaluateMarqueeBoxSelection3D,
  expandBodyIdsWithAssemblyGroup3D,
  findBodyFaceByReferenceFrame3D,
  getBodyLocalAxesInWCS,
  getEntityAssemblyGroupId,
  resolveFluxViewportVisibility3D,
  selectBodiesWithSameProfile3D,
  stepBaseEcholocationState3D,
  ungroupAssemblyEntities3D,
  type BaseEcholocationPulse3D,
  type BaseSurfaceSnapEvaluation3D,
  type CoordinateReferenceFrame3D,
  type MultiSelectionPivotMode3D,
} from "@/lib/lab2d/chamfer3DFluxWcsSnapMulti";
import { useExponentialHold } from "@/lib/lab2d/useExponentialHold";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface Chamfer3DGizmoAndLoftOverlayProps {
  entities: Entity[];
  selected?: Entity[];
  selection?: string[];
  selectedIds?: Set<string>;
  view: { tx: number; ty: number; k: number };
  onSetView?: (nextView: { tx: number; ty: number; k: number }) => void;
  width?: number;
  height?: number;
  isIsometric?: boolean;
  isoPlane?: string;
  isTilted3D?: boolean;
  is3DViewActive?: boolean;
  isPortrait?: boolean;
  orbitProjection: WorkplaneOrbitProjection2D;
  sheetThickness?: number;
  sheetThicknessMm?: number;
  tool?: string;
  isLoftToolActive?: boolean;

  // Estado do Loft 3D
  loftSectionIds: string[];
  loftSurfaceMode: LoftSurfaceMode;
  loftBodyMode: LoftBodyMode;
  onSetLoftSurfaceMode?: (m: LoftSurfaceMode) => void;
  onChangeLoftSurfaceMode?: (m: LoftSurfaceMode) => void;
  onSetLoftBodyMode?: (m: LoftBodyMode) => void;
  onChangeLoftBodyMode?: (m: LoftBodyMode) => void;
  onToggleLoftSection?: (entityId: string) => void;
  onClearLoftSections?: () => void;
  onCancelLoft3D?: () => void;
  onConfirmLoft3D: () => void;
  onUpdateSectionElevationZ?: (entityId: string, newElevationZ: number) => void;
  onAutoSpaceLoftSectionsZ?: (stepMm?: number) => void;
  onRemoveLoftSection?: (id: string) => void;
  onActivateLoftToolFromSelection?: () => void;

  // Callbacks de transformação 3D da seleção
  onTranslateSelection3D?: (dx: number, dy: number, dz: number) => void;
  onSetSelectionElevationZ?: (nextZ: number) => void;
  onLiveElevateSelection?: (newElevationZ: number) => void;
  onCommitElevateSelection?: (newElevationZ: number) => void;
  onLiveTranslateSelectionXY?: (dx: number, dy: number, targetIds?: string[]) => void;
  onCommitTranslateSelectionXY?: (dx: number, dy: number, targetIds?: string[]) => void;
  onOpenElevationKeypad?: (currentZ: number) => void;

  // Integração de Modelagem Direta 3D
  activeMode?: "2d" | "3d" | "flanges";
  topologyScene?: DirectTopology3DScene;
  subSelection3D?: SubElementSelectionState3D;
  onChangeSubSelection3D?: (next: SubElementSelectionState3D) => void;
  activeDirect3DTool?: DirectModeling3DTool;
  onChangeDirect3DTool?: (tool: DirectModeling3DTool) => void;
  onSelectEntities?: (ids: string[]) => void;
  onPreviewEntities?: (
    updater: Entity[] | ((prev: Entity[]) => Entity[]),
    selectedIds?: string[],
  ) => void;
  onCommitAtomicDrag?: (
    preDragEntities: Entity[],
    finalEntities: Entity[],
    toastMessageOrIds?: string | string[],
  ) => void;
  onCommitEntities?: (
    updater: Entity[] | ((prev: Entity[]) => Entity[]),
    toastMessageOrIds?: string | string[],
  ) => void;
  onSwitchTo2DSketchOnFace?: (face: DirectFace3D) => void;
  onDeleteSelectedEntities?: (idsToDelete?: string[]) => void;

  isDark?: boolean;
}

type GizmoAxis =
  | "x"
  | "y"
  | "z"
  | "extrude"
  | "face_normal"
  | "edge_diagonal"
  | "vertex_bevel"
  | "rot_x"
  | "rot_y"
  | "rot_z"
  | "miter"
  | "pivot"
  | "planar";

const DEFAULT_SUB_SELECTION: SubElementSelectionState3D = {
  faceIds: [],
  edgeIds: [],
  bodyIds: [],
  vertexIds: [],
  selectionScope: "auto",
  activePivot3D: null,
  activeHingeEdgeId: null,
};

export const Chamfer3DGizmoAndLoftOverlay: React.FC<Chamfer3DGizmoAndLoftOverlayProps> = ({
  entities,
  selected: selectedProp,
  selection: selectionProp,
  selectedIds,
  view,
  onSetView,
  width = 800,
  height = 600,
  isTilted3D: isTilted3DProp,
  is3DViewActive,
  orbitProjection,
  sheetThickness: sheetThicknessProp,
  sheetThicknessMm,
  tool: toolProp,
  isLoftToolActive,
  loftSectionIds,
  loftSurfaceMode,
  loftBodyMode,
  onSetLoftSurfaceMode: onSetLoftSurfaceModeProp,
  onChangeLoftSurfaceMode,
  onSetLoftBodyMode: onSetLoftBodyModeProp,
  onChangeLoftBodyMode,
  onToggleLoftSection,
  onClearLoftSections: onClearLoftSectionsProp,
  onCancelLoft3D,
  onConfirmLoft3D,
  onUpdateSectionElevationZ,
  onAutoSpaceLoftSectionsZ,
  onTranslateSelection3D: onTranslateSelection3DProp,
  onSetSelectionElevationZ: onSetSelectionElevationZProp,
  onLiveElevateSelection,
  onCommitElevateSelection,
  onLiveTranslateSelectionXY,
  onCommitTranslateSelectionXY,
  onOpenElevationKeypad,
  onDeleteSelectedEntities,
  activeMode: activeModeProp,
  topologyScene: externalScene,
  subSelection3D: externalSubSel,
  onChangeSubSelection3D,
  activeDirect3DTool: externalDirectTool,
  onChangeDirect3DTool,
  onSelectEntities,
  onPreviewEntities,
  onCommitAtomicDrag,
  onCommitEntities,
  onSwitchTo2DSketchOnFace,
  isDark = true,
}) => {
  const rootOverlayRef = useRef<HTMLDivElement>(null);
  const numpadRef = useRef<HTMLDivElement>(null);

  const selection = useMemo(
    () => selectionProp ?? (selectedIds ? Array.from(selectedIds) : []),
    [selectionProp, selectedIds],
  );
  const selected = useMemo(
    () => selectedProp ?? entities.filter((e) => selection.includes(e.id)),
    [selectedProp, entities, selection],
  );
  const isTilted3D = Boolean(isTilted3DProp ?? is3DViewActive ?? orbitProjection?.isTilted);
  const activeMode = activeModeProp ?? (isTilted3D ? "3d" : "2d");
  const sheetThickness = sheetThicknessProp ?? sheetThicknessMm ?? 20;
  const tool = toolProp ?? (isLoftToolActive ? "loft_3d" : "select");

  const onSetLoftSurfaceMode = useCallback(
    (m: LoftSurfaceMode) => {
      onSetLoftSurfaceModeProp?.(m);
      onChangeLoftSurfaceMode?.(m);
    },
    [onSetLoftSurfaceModeProp, onChangeLoftSurfaceMode],
  );
  const onSetLoftBodyMode = useCallback(
    (m: LoftBodyMode) => {
      onSetLoftBodyModeProp?.(m);
      onChangeLoftBodyMode?.(m);
    },
    [onSetLoftBodyModeProp, onChangeLoftBodyMode],
  );
  const onClearLoftSections = useCallback(() => {
    onClearLoftSectionsProp?.();
    onCancelLoft3D?.();
  }, [onClearLoftSectionsProp, onCancelLoft3D]);

  const onTranslateSelection3D = useCallback(
    (dx: number, dy: number, dz: number) => {
      if (onTranslateSelection3DProp) {
        onTranslateSelection3DProp(dx, dy, dz);
        return;
      }
      if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
        onCommitTranslateSelectionXY?.(dx, dy);
      }
      if (Math.abs(dz) > 1e-4 && selected[0]) {
        const curZ = getEntityElevationZ(selected[0]);
        onCommitElevateSelection?.(curZ + dz);
      }
    },
    [onTranslateSelection3DProp, onCommitTranslateSelectionXY, onCommitElevateSelection, selected],
  );

  const onSetSelectionElevationZ = useCallback(
    (nextZ: number) => {
      if (onSetSelectionElevationZProp) {
        onSetSelectionElevationZProp(nextZ);
        return;
      }
      onCommitElevateSelection?.(nextZ);
    },
    [onSetSelectionElevationZProp, onCommitElevateSelection],
  );

  const [internalSubSel, setInternalSubSel] =
    useState<SubElementSelectionState3D>(DEFAULT_SUB_SELECTION);
  const [internalDirectTool, setInternalDirectTool] =
    useState<DirectModeling3DTool>("select_3d");

  const subSel = externalSubSel ?? internalSubSel;
  const setSubSel = useCallback(
    (
      updater:
        | SubElementSelectionState3D
        | ((prev: SubElementSelectionState3D) => SubElementSelectionState3D),
    ) => {
      const next = typeof updater === "function" ? updater(subSel) : updater;
      if (onChangeSubSelection3D) {
        onChangeSubSelection3D(next);
      } else {
        setInternalSubSel(next);
      }
    },
    [subSel, onChangeSubSelection3D],
  );

  const directTool = externalDirectTool ?? internalDirectTool;
  const setDirectTool = useCallback(
    (next: DirectModeling3DTool) => {
      if (onChangeDirect3DTool) {
        onChangeDirect3DTool(next);
      } else {
        setInternalDirectTool(next);
      }
    },
    [onChangeDirect3DTool],
  );

  const isLoftActive = Boolean(
    tool === "loft_3d" || directTool === "loft_3d" || isLoftToolActive,
  );
  const [profile3DCreatorOpen, setProfile3DCreatorOpen] = useState<boolean>(false);
  const [polygonSides3D, setPolygonSides3D] = useState<number>(6);
  const [loftDropdownOpen, setLoftDropdownOpen] = useState<boolean>(false);

  // Estado de modos internos das ferramentas 3D
  const [booleanMode, setBooleanMode] = useState<BooleanMode3D>("new_body");
  const [filletOrChamferMode, setFilletOrChamferMode] = useState<"fillet" | "chamfer">("fillet");
  const [edgeActionMode, setEdgeActionMode] = useState<"fillet" | "chamfer" | "transform_edge">(
    "fillet",
  );
  const [shellOpenCapsMode, setShellOpenCapsMode] = useState<"both_ends" | "top_only">("both_ends");
  const [shellTargetFaceCap, setShellTargetFaceCap] = useState<ShellOpenCap3D>("top");
  const multiTouchPinchCooldownUntilRef = useRef<number>(0);
  const [offsetFaceTarget, setOffsetFaceTarget] = useState<
    "top" | "bottom" | "sides" | "pos_x" | "neg_x" | "pos_y" | "neg_y" | "side_normal"
  >("top");
  const [miterEndTarget, setMiterEndTarget] = useState<"top" | "bottom">("top");
  const [miterAxis, setMiterAxis] = useState<"x" | "y">("x");
  const [copyOnTransform, setCopyOnTransform] = useState<boolean>(false);
  const [transformAxisTarget, setTransformAxisTarget] = useState<"x" | "y" | "z">("x");
  const [isPickingPivotSnap, setIsPickingPivotSnap] = useState<boolean>(false);
  const [snappedPivotLabel, setSnappedPivotLabel] = useState<string | null>(null);

  // Estados Unificados FLUX + WCS/OCS + Snap Base (Z=0) + Multi-Seleção Inteligente
  const [referenceFrame3D, setReferenceFrame3D] = useState<CoordinateReferenceFrame3D>("wcs");
  const [multiSelectAddMode, setMultiSelectAddMode] = useState<boolean>(false);
  const [marqueeModeActive, setMarqueeModeActive] = useState<boolean>(false);
  const [marqueeRectState, setMarqueeRectState] = useState<{
    start: Vec2;
    current: Vec2;
    additive: boolean;
  } | null>(null);
  const [multiPivotMode, setMultiPivotMode] = useState<MultiSelectionPivotMode3D>("bbox_center");
  const [customPivot3D, setCustomPivot3D] = useState<Vec3Mm | null>(null);
  const [activeBaseSnapEval, setActiveBaseSnapEval] = useState<BaseSurfaceSnapEvaluation3D | null>(
    null,
  );
  const baseSnapLatchedRef = useRef<boolean>(false);
  const echolocationStateRef = useRef(createInitialBaseEcholocationState3D());
  const [activeEcholocationPulse, setActiveEcholocationPulse] =
    useState<BaseEcholocationPulse3D | null>(null);
  const echolocationCleanupTimerRef = useRef<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (ev: MediaQueryListEvent) => setPrefersReducedMotion(ev.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const triggerEcholocationWavePulse = useCallback((pulse: BaseEcholocationPulse3D) => {
    setActiveEcholocationPulse(pulse);
    if (echolocationCleanupTimerRef.current !== null) {
      window.clearTimeout(echolocationCleanupTimerRef.current);
    }
    echolocationCleanupTimerRef.current = window.setTimeout(() => {
      setActiveEcholocationPulse(null);
      echolocationCleanupTimerRef.current = null;
    }, 820);
  }, []);

  // Estados P1–P7 (CHAMFER 3D 2.0 Master Suite)
  const [revolveAngleDeg, setRevolveAngleDeg] = useState<number>(360);
  const [revolveAxis, setRevolveAxis] = useState<"x" | "y" | "z">("y");
  const [sweepPathPreset, setSweepPathPreset] = useState<"arc90" | "straight" | "scurve">("arc90");
  const [sweepHollow, setSweepHollow] = useState<boolean>(true);
  const [holeType3D, setHoleType3D] = useState<AdvancedHoleType3D>("through");
  const [sectionPlaneState, setSectionPlaneState] = useState<SectionPlane3DState>({
    enabled: false,
    axis: "x",
    offsetMm: 0,
    flipDirection: false,
    showHatch: true,
  });
  const [cutListModalOpen, setCutListModalOpen] = useState<boolean>(false);
  const [csvCopiedFeedback, setCsvCopiedFeedback] = useState<boolean>(false);
  const [textCopiedFeedback, setTextCopiedFeedback] = useState<boolean>(false);

  // Estado do Array 3D Inteligente / Grade para Portões e Serralheria + Quadro 45°
  const [smartArrayPanelTab, setSmartArrayPanelTab] = useState<SmartArrayPanelTab3D>("grille_span");
  const [smartArrayAxis, setSmartArrayAxis] = useState<SmartArrayAxis3D>("x");
  const [smartArrayMode, setSmartArrayMode] = useState<SmartArrayDivisionMode3D>("by_count");
  const [smartArrayCount, setSmartArrayCount] = useState<number>(5);
  const [smartArrayMaxGapMm, setSmartArrayMaxGapMm] = useState<number>(110);
  const [smartArrayManualSpanMm, setSmartArrayManualSpanMm] = useState<number | null>(null);

  // Estado do Gerador de Quadro em 45° (Esquadria Fechada)
  const [smartFrameMeasureRef, setSmartFrameMeasureRef] = useState<SmartFrameMeasureRef3D>("outer");
  const [smartFrameWidthMm, setSmartFrameWidthMm] = useState<number>(1000);
  const [smartFrameHeightMm, setSmartFrameHeightMm] = useState<number>(1000);
  const [smartFramePlane, setSmartFramePlane] = useState<SmartFramePlane3D>("xy");
  const [smartFrameJointMode, setSmartFrameJointMode] = useState<SmartFrameJointMode3D>("miter_45");
  const [smartFrameInnerDivisions, setSmartFrameInnerDivisions] = useState<number>(0);

  // Popover 2x2 de Operação Booleana ao lado da seta de Extrusão / Face Normal
  const [extrudeBooleanPopoverOpen, setExtrudeBooleanPopoverOpen] = useState<boolean>(false);

  // Sincroniza modo Fillet / Chamfer quando a ferramenta direta muda
  useEffect(() => {
    if (directTool === "fillet_3d") {
      setFilletOrChamferMode("fillet");
      setEdgeActionMode("fillet");
    } else if (directTool === "chamfer_3d") {
      setFilletOrChamferMode("chamfer");
      setEdgeActionMode("chamfer");
    }
    setExtrudeBooleanPopoverOpen(false);
  }, [directTool]);

  useEffect(() => {
    const handleToggleCutList = () => {
      setCutListModalOpen((prev) => !prev);
    };
    window.addEventListener("chamfer-toggle-cutlist-3d", handleToggleCutList);
    return () => window.removeEventListener("chamfer-toggle-cutlist-3d", handleToggleCutList);
  }, []);

  // Sessão do Teclado Numérico Flutuante In-Canvas (OCULTO POR PADRÃO)
  const [numpadSession, setNumpadSession] = useState<ActiveParametricNumpadSession | null>(null);
  const [numpadBuffer, setNumpadBuffer] = useState<string>("");
  const numpadFreshOpenRef = useRef<boolean>(false);

  // Fecha o teclado numérico ao trocar de ferramenta
  useEffect(() => {
    setNumpadSession(null);
  }, [directTool, activeMode]);

  // Fecha o teclado numérico ao tocar fora dele no canvas
  useEffect(() => {
    if (!numpadSession) return;
    const handlePointerDownOutside = (ev: PointerEvent) => {
      if (numpadRef.current && !numpadRef.current.contains(ev.target as Node)) {
        setNumpadSession(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDownOutside, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [numpadSession]);

  // Snap de contato físico suave e alinhamento colinear
  const [activeContactSnap, setActiveContactSnap] = useState<ContactSnapResult3D | null>(null);
  const [mirrorPlanePopupOpen, setMirrorPlanePopupOpen] = useState<boolean>(false);

  // Arraste interativo dos eixos do Gizmo
  const [activeAxis, setActiveAxis] = useState<GizmoAxis | null>(null);
  const [dragDeltaMm, setDragDeltaMm] = useState<number>(0);
  const [rotationSnapState, setRotationSnapState] = useState<{
    axis: GizmoAxis;
    angleStartRad: number;
    compassRadiusPx: number;
    snapResult: RotationSnapResult;
  } | null>(null);
  const [compassFadingOut, setCompassFadingOut] = useState<boolean>(false);
  const compassFadeTimerRef = useRef<number | null>(null);

  // Registro do último deslocamento / extrusão / rotação concluído para manter a pílula clicável
  const [lastCompletedDrag, setLastCompletedDrag] = useState<{
    axis: GizmoAxis;
    deltaMm: number;
    startPoint3D: Vec3Mm;
    endPoint3D: Vec3Mm;
    startEntities: Entity[];
    targetIds: string[];
    activeResultIds: string[];
    copyMode: boolean;
    copyIdMap: Map<string, string>;
    initialValue: number;
    faceRole?: DirectFace3D["role"];
    faceNormal?: Vec3Mm;
    angleStartRad?: number;
    compassRadiusPx?: number;
  } | null>(null);

  const lastFaceTapRef = useRef<{ faceId: string; bodyId: string; time: number } | null>(null);

  const vertexIds = useMemo(() => subSel.vertexIds ?? [], [subSel.vertexIds]);
  const selectionScope: SelectionScope3D = subSel.selectionScope ?? "auto";

  // Limpa a medição persistente quando o usuário limpa a seleção
  useEffect(() => {
    if (
      subSel.faceIds.length === 0 &&
      subSel.edgeIds.length === 0 &&
      subSel.bodyIds.length === 0 &&
      vertexIds.length === 0
    ) {
      setLastCompletedDrag(null);
      setRotationSnapState(null);
      setCompassFadingOut(false);
    }
  }, [subSel.faceIds.length, subSel.edgeIds.length, subSel.bodyIds.length, vertexIds.length]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chamfer-flux-drag-state", {
        detail: { isManipulating: activeAxis !== null, activeAxis },
      }),
    );
  }, [activeAxis]);

  useEffect(() => {
    return () => {
      if (compassFadeTimerRef.current !== null) {
        window.clearTimeout(compassFadeTimerRef.current);
      }
      if (echolocationCleanupTimerRef.current !== null) {
        window.clearTimeout(echolocationCleanupTimerRef.current);
      }
      window.dispatchEvent(
        new CustomEvent("chamfer-flux-drag-state", {
          detail: { isManipulating: false, activeAxis: null },
        }),
      );
    };
  }, []);

  const dragSessionRef = useRef<{
    axis: GizmoAxis;
    pointerId?: number;
    startClientX: number;
    startClientY: number;
    screenDirX: number;
    screenDirY: number;
    axisVec3D?: Vec3Mm;
    pixelsPerMm: number;
    totalDeltaMm: number;
    lastAppliedDeltaMm: number;
    initialValue: number;
    targetIds: string[];
    hasMoved: boolean;
    startCenter3D?: Vec3Mm;
    angleStartRad?: number;
    pivotScreen?: Vec2;
    compassRadiusPx?: number;
    startEntities: Entity[];
    startBody: DirectBody3D | null;
    startBodies: DirectBody3D[];
    startFace: DirectFace3D | null;
    startEdge: DirectEdge3D | null;
    startVertex: DirectVertex3D | null;
    targetEdgeIndices?: number[];
    targetBevelKeys?: string[];
    copyIdMap: Map<string, string>;
    activeResultIds: string[];
    latestPreviewEntities?: Entity[];
  } | null>(null);

  const scene = useMemo(
    () => externalScene ?? buildDirectTopology3DScene(entities, sheetThickness),
    [externalScene, entities, sheetThickness],
  );

  // Tipo de elemento reconhecido automaticamente pelo clique 3D (Vértice, Face, Aresta, Dobradiça ou Corpo)
  const selectionKind3D = useMemo<
    "none" | "vertex" | "face" | "edge" | "body" | "hinge"
  >(() => {
    const hasAnySubSelection =
      subSel.faceIds.length > 0 ||
      subSel.edgeIds.length > 0 ||
      subSel.bodyIds.length > 0 ||
      vertexIds.length > 0 ||
      selection.length > 0;

    if (!hasAnySubSelection) {
      return "none";
    }
    if (subSel.activeHingeEdgeId !== null || directTool === "rotate_axis_3d") {
      return "hinge";
    }
    if (
      vertexIds.length > 0 &&
      subSel.faceIds.length === 0 &&
      subSel.edgeIds.length === 0 &&
      directTool !== "transform_3d" &&
      directTool !== "mirror_3d"
    ) {
      return "vertex";
    }
    if (
      subSel.faceIds.length > 0 &&
      directTool !== "transform_3d" &&
      directTool !== "mirror_3d" &&
      directTool !== "scale_3d" &&
      directTool !== "align_3d"
    ) {
      return "face";
    }
    if (
      subSel.edgeIds.length > 0 &&
      subSel.faceIds.length === 0 &&
      directTool !== "transform_3d" &&
      directTool !== "mirror_3d"
    ) {
      return "edge";
    }
    if (
      subSel.bodyIds.length > 0 ||
      selection.length > 0 ||
      directTool === "transform_3d" ||
      directTool === "mirror_3d" ||
      directTool === "array_3d" ||
      directTool === "scale_3d" ||
      directTool === "align_3d"
    ) {
      return "body";
    }
    return "none";
  }, [subSel, vertexIds, selection.length, directTool]);

  // Determina os corpos/entidades alvo (EXCLUSIVAMENTE a partir da seleção ativa — sem auto-selecionar quando o usuário clicou no ar!)
  const activeTargetEntityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bId of subSel.bodyIds) {
      const b = scene.bodiesById.get(bId);
      if (b) ids.add(b.entityId);
    }
    for (const fId of subSel.faceIds) {
      const f = scene.facesById.get(fId);
      if (f) ids.add(f.entityId);
    }
    for (const eId of subSel.edgeIds) {
      const e = scene.edgesById.get(eId);
      if (e) ids.add(e.entityId);
    }
    for (const vId of vertexIds) {
      for (const b of scene.bodies) {
        if (b.vertices?.some((v) => v.vertexId === vId)) {
          ids.add(b.entityId);
        }
      }
    }
    if (ids.size === 0) {
      for (const sId of selection) {
        const b = scene.bodiesById.get(sId) ?? scene.bodies.find((x) => x.entityId === sId);
        ids.add(b ? b.entityId : sId);
      }
    }
    return Array.from(ids);
  }, [subSel.bodyIds, subSel.faceIds, subSel.edgeIds, vertexIds, scene, selection]);

  // Lista ordenada de corpos selecionados (Corpo Principal = índice 0, Corpos Adicionais = índices >= 1)
  const selectedBodiesList = useMemo<DirectBody3D[]>(() => {
    const ordered: DirectBody3D[] = [];
    const seen = new Set<string>();
    for (const bId of subSel.bodyIds) {
      const b = scene.bodiesById.get(bId);
      if (b && !seen.has(b.bodyId)) {
        seen.add(b.bodyId);
        ordered.push(b);
      }
    }
    for (const id of activeTargetEntityIds) {
      const b = scene.bodies.find((x) => x.entityId === id);
      if (b && !seen.has(b.bodyId)) {
        seen.add(b.bodyId);
        ordered.push(b);
      }
    }
    return ordered;
  }, [subSel.bodyIds, activeTargetEntityIds, scene.bodiesById, scene.bodies]);

  const primaryBody: DirectBody3D | null = useMemo(
    () => selectedBodiesList[0] ?? null,
    [selectedBodiesList],
  );

  const primaryFace: DirectFace3D | null = useMemo(() => {
    if (subSel.faceIds.length > 0) {
      return scene.facesById.get(subSel.faceIds[0]!) ?? null;
    }
    return null;
  }, [subSel.faceIds, scene.facesById]);

  // Lista completa de faces selecionadas pelo usuário (para Shell 3D na face exata e Offset Face múltiplo)
  const selectedFacesList = useMemo<DirectFace3D[]>(() => {
    const list: DirectFace3D[] = [];
    for (const fId of subSel.faceIds) {
      const f = scene.facesById.get(fId);
      if (f) list.push(f);
    }
    if (list.length === 0 && primaryFace) {
      list.push(primaryFace);
    }
    return list;
  }, [subSel.faceIds, scene.facesById, primaryFace]);

  const selectedSideFacesCount = useMemo(
    () => selectedFacesList.filter((f) => f.role === "side").length,
    [selectedFacesList],
  );

  // Sincroniza a face-alvo do Shell sempre que o usuário seleciona uma face 3D
  useEffect(() => {
    if (selectedFacesList.length > 0) {
      const detectedCap = resolveFaceShellCapDirection3D(
        selectedFacesList[0]!,
        referenceFrame3D,
        primaryBody?.rotation3D,
      );
      setShellTargetFaceCap(detectedCap);
    }
  }, [selectedFacesList, referenceFrame3D, primaryBody?.rotation3D]);

  const resolvedShellOpenCaps = useMemo<ShellOpenCap3D[]>(
    () =>
      resolveShellOpenCapsFromSelection3D(
        selectedFacesList,
        shellOpenCapsMode,
        shellTargetFaceCap,
        referenceFrame3D,
        primaryBody?.rotation3D,
      ),
    [
      selectedFacesList,
      shellOpenCapsMode,
      shellTargetFaceCap,
      referenceFrame3D,
      primaryBody?.rotation3D,
    ],
  );

  const primaryEdge: DirectEdge3D | null = useMemo(() => {
    if (subSel.edgeIds.length > 0) {
      return scene.edgesById.get(subSel.edgeIds[0]!) ?? null;
    }
    return null;
  }, [subSel.edgeIds, scene.edgesById]);

  const primaryVertex: DirectVertex3D | null = useMemo(() => {
    if (vertexIds.length === 0) return null;
    for (const b of scene.bodies) {
      const found = b.vertices?.find((v) => v.vertexId === vertexIds[0]);
      if (found) return found;
    }
    return null;
  }, [vertexIds, scene.bodies]);

  // Índices de arestas verticais e chaves de bisel 3D selecionadas (Garante escopo estrito por sub-elemento!)
  const { selectedVerticalEdgeIndices, selectedBevelKeys } = useMemo(() => {
    if (selectionKind3D === "body" || selectionScope === "body") {
      return {
        selectedVerticalEdgeIndices: undefined,
        selectedBevelKeys: undefined,
      };
    }
    const vertIndices: number[] = [];
    const bevelKeys: string[] = [];

    for (const vId of vertexIds) {
      for (const b of scene.bodies) {
        const v = b.vertices?.find((vx) => vx.vertexId === vId);
        if (v) {
          bevelKeys.push(`${v.role}_${v.cornerIndex}`);
        }
      }
    }

    for (const eId of subSel.edgeIds) {
      const e = scene.edgesById.get(eId);
      if (!e) continue;
      const matchV = e.edgeId.match(/(?:_|:)edge_vert(?:ical)?_(\d+)$|(?:_|:)edge_v_(\d+)$/);
      const matchTop = e.edgeId.match(/(?:_|:)edge_top_(\d+)$/);
      const matchBot = e.edgeId.match(/(?:_|:)edge_bot_(\d+)$/);
      const isTopLoop = e.edgeId.endsWith("_edge_top_loop");
      const isBotLoop = e.edgeId.endsWith("_edge_bot_loop");
      if (matchV) {
        const idx = Number(matchV[1] ?? matchV[2]);
        if (Number.isFinite(idx)) vertIndices.push(idx);
      } else if (matchTop) {
        bevelKeys.push(`edge_top_${matchTop[1]}`);
      } else if (matchBot) {
        bevelKeys.push(`edge_bot_${matchBot[1]}`);
      } else if (isTopLoop) {
        bevelKeys.push("edge_top_0", "edge_top_1", "edge_top_2", "edge_top_3");
      } else if (isBotLoop) {
        bevelKeys.push("edge_bot_0", "edge_bot_1", "edge_bot_2", "edge_bot_3");
      }
    }

    return {
      selectedVerticalEdgeIndices: vertIndices.length > 0 ? vertIndices : undefined,
      selectedBevelKeys: bevelKeys.length > 0 ? bevelKeys : undefined,
    };
  }, [selectionKind3D, selectionScope, vertexIds, subSel.edgeIds, scene]);

  // Sincroniza automaticamente a extremidade (Topo/Base) e o eixo (X/Y) do Corte em Grau
  // com a Face ou Aresta selecionada pelo usuário
  useEffect(() => {
    const edgeRef =
      (subSel.activeHingeEdgeId ? scene.edgesById.get(subSel.activeHingeEdgeId) : null) ??
      primaryEdge;
    if (edgeRef) {
      if (edgeRef.role === "bottom" || edgeRef.edgeId.includes("edge_bot")) {
        setMiterEndTarget("bottom");
      } else if (edgeRef.role === "top" || edgeRef.edgeId.includes("edge_top")) {
        setMiterEndTarget("top");
      }
      if (Math.abs(edgeRef.dir.x) > Math.abs(edgeRef.dir.y) + 0.15) {
        setMiterAxis("y");
      } else if (Math.abs(edgeRef.dir.y) > Math.abs(edgeRef.dir.x) + 0.15) {
        setMiterAxis("x");
      }
      return;
    }
    if (primaryFace) {
      if (primaryFace.role === "bottom") {
        setMiterEndTarget("bottom");
      } else if (primaryFace.role === "top" || primaryFace.role === "miter") {
        setMiterEndTarget("top");
      } else if (primaryFace.role === "side") {
        if (Math.abs(primaryFace.normal.y) > Math.abs(primaryFace.normal.x)) {
          setMiterAxis("y");
        } else {
          setMiterAxis("x");
        }
      }
    }
  }, [subSel.activeHingeEdgeId, scene.edgesById, primaryEdge, primaryFace]);

  const activeHingeEdge: DirectEdge3D | null = useMemo(() => {
    if (subSel.activeHingeEdgeId) {
      return scene.edgesById.get(subSel.activeHingeEdgeId) ?? null;
    }
    if (primaryEdge) {
      return primaryEdge;
    }
    if (directTool === "rotate_axis_3d" && primaryBody) {
      const targetRole =
        primaryFace?.role === "bottom" || miterEndTarget === "bottom" ? "bottom" : "top";
      return (
        primaryBody.edges.find((e) => e.role === targetRole) ??
        primaryBody.edges[0] ??
        null
      );
    }
    return null;
  }, [
    subSel.activeHingeEdgeId,
    scene.edgesById,
    primaryEdge,
    primaryFace?.role,
    directTool,
    primaryBody,
    miterEndTarget,
  ]);

  const toScreen = useCallback(
    (pt3D: Vec3Mm): Vec2 => {
      const pMm = projectPoint3DToCanvasViewMm(pt3D, orbitProjection);
      return {
        x: pMm.x * view.k + view.tx,
        y: pMm.y * view.k + view.ty,
      };
    },
    [orbitProjection, view.k, view.tx, view.ty],
  );

  // Calcula o centro 3D do Gizmo (respeitando os 5 modos de Pivô da Multi-Seleção, pivô móvel ou sub-elemento)
  const selectionCenter3D = useMemo<Vec3Mm | null>(() => {
    if (selectionKind3D === "none") return null;
    if (selectionKind3D === "vertex" && primaryVertex) return primaryVertex.point3D;
    if (selectionKind3D === "face" && primaryFace) return primaryFace.centroid;
    if (selectionKind3D === "edge" && primaryEdge) return primaryEdge.midpoint;

    if (selectionKind3D === "body" && selectedBodiesList.length > 0) {
      if (
        selectedBodiesList.length === 1 &&
        primaryBody &&
        (directTool === "extrude_3d" ||
          directTool === "offset_face_3d" ||
          directTool === "rotate_axis_3d")
      ) {
        const topF =
          findBodyFaceByReferenceFrame3D(primaryBody, "top", referenceFrame3D) ??
          primaryBody.faces.find((f) => f.role === "top" || f.role === "miter");
        if (topF) return topF.centroid;
      }

      if (multiPivotMode === "custom_draggable" && customPivot3D) {
        return customPivot3D;
      }
      if (subSel.activePivot3D && (multiPivotMode === "snap_point" || selectedBodiesList.length === 1)) {
        // Quando há apenas 1 peça e o usuário escolheu explicitamente um ponto de snap diferente do centroide
        if (
          multiPivotMode === "snap_point" ||
          (primaryBody &&
            Math.hypot(
              subSel.activePivot3D.x - primaryBody.pivot3D.x,
              subSel.activePivot3D.y - primaryBody.pivot3D.y,
              subSel.activePivot3D.z - primaryBody.pivot3D.z,
            ) > 0.25 &&
            snappedPivotLabel !== null)
        ) {
          return subSel.activePivot3D;
        }
      }

      const computedSetPivot = computeMultiBodySetPivot3D(
        selectedBodiesList,
        multiPivotMode,
        {
          primaryBody,
          snapPoint3D: subSel.activePivot3D,
          customPivot3D,
        },
      );
      if (computedSetPivot) return computedSetPivot;
    }

    if (subSel.activePivot3D) return subSel.activePivot3D;
    if (selected.length === 0) return null;
    const b = bbox(selected);
    if (!b) return null;
    const avgZ =
      selected.reduce((acc, e) => acc + getEntityElevationZ(e), 0) / selected.length;
    return {
      x: (b.minX + b.maxX) * 0.5,
      y: (b.minY + b.maxY) * 0.5,
      z: avgZ,
    };
  }, [
    selectionKind3D,
    selectedBodiesList,
    multiPivotMode,
    customPivot3D,
    snappedPivotLabel,
    referenceFrame3D,
    subSel.activePivot3D,
    primaryVertex,
    primaryFace,
    primaryEdge,
    primaryBody,
    directTool,
    selected,
  ]);

  // Projeção dos eixos X, Y, Z na tela (suporta `🌐 Global WCS` e `📦 Local OCS` da peça rotacionada!)
  const gizmoScreen = useMemo(() => {
    if (!selectionCenter3D || (!isTilted3D && activeMode !== "3d")) return null;

    const originScreen = toScreen(selectionCenter3D);
    const axisLenPx = 64;
    const stepMm = Math.max(10, 60 / Math.max(0.1, view.k));

    const localAxes =
      referenceFrame3D === "ocs" && primaryBody
        ? getBodyLocalAxesInWCS(primaryBody.rotation3D)
        : {
            axisX: { x: 1, y: 0, z: 0 },
            axisY: { x: 0, y: 1, z: 0 },
            axisZ: { x: 0, y: 0, z: 1 },
          };

    const projectAxisTip = (axisVec3D: Vec3Mm) => {
      const tipScreen = toScreen({
        x: selectionCenter3D.x + axisVec3D.x * stepMm,
        y: selectionCenter3D.y + axisVec3D.y * stepMm,
        z: selectionCenter3D.z + axisVec3D.z * stepMm,
      });
      const vx = tipScreen.x - originScreen.x;
      const vy = tipScreen.y - originScreen.y;
      const rawPxLen = Math.hypot(vx, vy) || 1;
      const ux = vx / rawPxLen;
      const uy = vy / rawPxLen;
      const pixelsPerMm = Math.max(0.15, rawPxLen / stepMm);
      return {
        endX: originScreen.x + ux * axisLenPx,
        endY: originScreen.y + uy * axisLenPx,
        ux,
        uy,
        pixelsPerMm,
        axisVec3D,
      };
    };

    const xAx = projectAxisTip(localAxes.axisX);
    const yAx = projectAxisTip(localAxes.axisY);
    const zAx = projectAxisTip(localAxes.axisZ);

    // Alça planar (quad entre os eixos X e Y)
    const pSize = 22;
    const planarQuad = {
      p0: originScreen,
      p1: { x: originScreen.x + xAx.ux * pSize, y: originScreen.y + xAx.uy * pSize },
      p2: {
        x: originScreen.x + xAx.ux * pSize + yAx.ux * pSize,
        y: originScreen.y + xAx.uy * pSize + yAx.uy * pSize,
      },
      p3: { x: originScreen.x + yAx.ux * pSize, y: originScreen.y + yAx.uy * pSize },
    };

    // Calcula o Bounding Sphere / Bounding Box projetado da peça(s) na tela para a Bússola Externa
    const partPointsScreen: Vec2[] = [];
    const targetBodies =
      selectedBodiesList.length > 0
        ? selectedBodiesList
        : primaryBody
          ? [primaryBody]
          : [];
    for (const tb of targetBodies) {
      for (const f of tb.faces) {
        for (const p3d of f.polygon3D) {
          partPointsScreen.push(toScreen(p3d));
        }
      }
      for (const vtx of tb.vertices ?? []) {
        partPointsScreen.push(toScreen(vtx.point3D));
      }
    }
    const compassMetrics = computeExternalCompassRadiusPx(
      partPointsScreen,
      originScreen,
      width,
      height,
    );

    return {
      origin: originScreen,
      center3D: selectionCenter3D,
      x: xAx,
      y: yAx,
      z: zAx,
      planarQuad,
      partRadiusPx: compassMetrics.partRadiusPx,
      compassRadiusPx: compassMetrics.compassRadiusPx,
    };
  }, [
    selectionCenter3D,
    isTilted3D,
    activeMode,
    toScreen,
    view.k,
    referenceFrame3D,
    selectedBodiesList,
    primaryBody,
    width,
    height,
  ]);

  // Vão Livre em tempo real ao longo do eixo ativo (para o HUD Consolidado FLUX Linha 1)
  const liveClearanceGapMm = useMemo<number | null>(() => {
    if (
      !activeAxis ||
      (activeAxis !== "x" && activeAxis !== "y" && activeAxis !== "z") ||
      selectedBodiesList.length === 0
    ) {
      return null;
    }
    const movingIds = new Set(selectedBodiesList.map((b) => b.bodyId));
    const others = scene.bodies.filter((b) => !movingIds.has(b.bodyId));
    if (others.length === 0) {
      if (activeAxis === "z") {
        let minZ = Infinity;
        for (const mb of selectedBodiesList) {
          if (mb.bbox3D.minZ < minZ) minZ = mb.bbox3D.minZ;
        }
        return Number.isFinite(minZ) ? Math.max(0, Number(minZ.toFixed(1))) : null;
      }
      return null;
    }

    let mMin = Infinity;
    let mMax = -Infinity;
    for (const mb of selectedBodiesList) {
      const lo =
        activeAxis === "x"
          ? mb.bbox3D.minX
          : activeAxis === "y"
            ? mb.bbox3D.minY
            : mb.bbox3D.minZ;
      const hi =
        activeAxis === "x"
          ? mb.bbox3D.maxX
          : activeAxis === "y"
            ? mb.bbox3D.maxY
            : mb.bbox3D.maxZ;
      if (lo < mMin) mMin = lo;
      if (hi > mMax) mMax = hi;
    }

    let nearestGap = Infinity;
    for (const ob of others) {
      const oLo =
        activeAxis === "x"
          ? ob.bbox3D.minX
          : activeAxis === "y"
            ? ob.bbox3D.minY
            : ob.bbox3D.minZ;
      const oHi =
        activeAxis === "x"
          ? ob.bbox3D.maxX
          : activeAxis === "y"
            ? ob.bbox3D.maxY
            : ob.bbox3D.maxZ;
      const gap =
        oLo >= mMax ? oLo - mMax : mMin >= oHi ? mMin - oHi : 0;
      if (gap < nearestGap) nearestGap = gap;
    }
    return Number.isFinite(nearestGap) ? Number(nearestGap.toFixed(1)) : null;
  }, [activeAxis, selectedBodiesList, scene.bodies]);

  // Gerenciador de Contexto de Interação "FLUX" (4 Níveis Anti-Colisão)
  const fluxState = useMemo(() => {
    const baseLabel = activeBaseSnapEval?.snapped ? activeBaseSnapEval.hudBadgeLabel : null;
    const contactLabel = activeContactSnap?.snapBadgeLabel
      ? `🎯 ${activeContactSnap.snapBadgeLabel}`
      : snappedPivotLabel
        ? `🎯 ${snappedPivotLabel}`
        : null;
    const combinedSnapLabel = baseLabel || contactLabel;

    const anchorScreen =
      activeAxis === "face_normal" && primaryFace
        ? toScreen(primaryFace.centroid)
        : gizmoScreen?.origin ?? null;

    return resolveFluxViewportVisibility3D({
      activeAxis,
      directTool,
      selectionKind3D,
      hasActiveSnap: Boolean(
        activeBaseSnapEval?.snapped ||
          activeContactSnap?.hasContactSnap ||
          activeContactSnap?.hasAlignmentSnap ||
          (activeAxis === "pivot" && snappedPivotLabel),
      ),
      snapSummaryLabel: combinedSnapLabel,
      clearanceGapMm: liveClearanceGapMm,
      copyMode: copyOnTransform,
      dragDeltaValue:
        activeAxis === "rot_x" || activeAxis === "rot_y" || activeAxis === "rot_z"
          ? (rotationSnapState?.snapResult.angleDeg ?? dragDeltaMm)
          : dragDeltaMm,
      elevationZMm: primaryBody?.elevationZ ?? 0,
      selectedBodyCount: selectedBodiesList.length,
      gizmoOriginScreen: anchorScreen,
      viewportWidth: width,
      viewportHeight: height,
    });
  }, [
    activeAxis,
    directTool,
    selectionKind3D,
    activeBaseSnapEval,
    activeContactSnap,
    snappedPivotLabel,
    liveClearanceGapMm,
    copyOnTransform,
    rotationSnapState,
    dragDeltaMm,
    primaryBody?.elevationZ,
    selectedBodiesList.length,
    primaryFace,
    toScreen,
    gizmoScreen?.origin,
    width,
    height,
  ]);

  // Projeção da Seta Normal Bidirecional da Face Selecionada (EXCLUSIVA QUANDO FACE É CLICADA, OCULTA EM SHELL E ARRAY 3D)
  const faceNormalGizmo = useMemo(() => {
    if (!primaryFace || (!isTilted3D && activeMode !== "3d")) return null;
    if (selectionKind3D !== "face") return null;
    if (directTool === "shell_3d" || directTool === "array_3d") return null;
    const originScreen = toScreen(primaryFace.centroid);
    const stepMm = Math.max(10, 60 / Math.max(0.1, view.k));
    const normal = primaryFace.normal;
    const tip3D: Vec3Mm = {
      x: primaryFace.centroid.x + normal.x * stepMm,
      y: primaryFace.centroid.y + normal.y * stepMm,
      z: primaryFace.centroid.z + normal.z * stepMm,
    };
    const tipScreen = toScreen(tip3D);
    const vx = tipScreen.x - originScreen.x;
    const vy = tipScreen.y - originScreen.y;
    const rawPxLen = Math.hypot(vx, vy) || 1;
    const ux = vx / rawPxLen;
    const uy = vy / rawPxLen;
    const arrowLenPx = 58;
    const isFreshProfile =
      (primaryBody?.extrudeHeightMm ?? sheetThickness) <= sheetThickness + 0.5 ||
      directTool === "extrude_3d";
    return {
      origin: originScreen,
      centroid3D: primaryFace.centroid,
      normal3D: normal,
      posTip: { x: originScreen.x + ux * arrowLenPx, y: originScreen.y + uy * arrowLenPx },
      negTip: { x: originScreen.x - ux * (arrowLenPx * 0.65), y: originScreen.y - uy * (arrowLenPx * 0.65) },
      ux,
      uy,
      pixelsPerMm: Math.max(0.15, rawPxLen / stepMm),
      face: primaryFace,
      isFreshProfile,
    };
  }, [primaryFace, isTilted3D, activeMode, selectionKind3D, toScreen, view.k, primaryBody, sheetThickness, directTool]);

  // Projeção da Seta Diagonal da Aresta Selecionada (EXCLUSIVA QUANDO ARESTA É CLICADA)
  const edgeDiagonalGizmo = useMemo(() => {
    if (!primaryEdge || (!isTilted3D && activeMode !== "3d")) return null;
    if (selectionKind3D !== "edge") return null;
    const originScreen = toScreen(primaryEdge.midpoint);
    const bodyCenter = primaryBody ? toScreen(primaryBody.pivot3D) : null;
    const poly = primaryEdge.polyline3D;
    const p0 = poly[0] ? toScreen(poly[0]) : originScreen;
    const p1 = poly[poly.length - 1] ? toScreen(poly[poly.length - 1]) : originScreen;
    const ex = p1.x - p0.x;
    const ey = p1.y - p0.y;
    const elen = Math.hypot(ex, ey) || 1;
    let ux = -ey / elen;
    let uy = ex / elen;
    // Aponta diagonalmente para dentro do corpo
    if (bodyCenter) {
      const toCenterX = bodyCenter.x - originScreen.x;
      const toCenterY = bodyCenter.y - originScreen.y;
      if (ux * toCenterX + uy * toCenterY < 0) {
        ux = -ux;
        uy = -uy;
      }
    }
    const arrowLenPx = 46;
    const matchV = primaryEdge.edgeId.match(/(?:_|:)edge_vert(?:ical)?_(\d+)$|(?:_|:)edge_v_(\d+)$/);
    const matchTop = primaryEdge.edgeId.match(/(?:_|:)edge_top_(\d+)$/);
    const matchBot = primaryEdge.edgeId.match(/(?:_|:)edge_bot_(\d+)$/);
    const isTopLoop = primaryEdge.edgeId.endsWith("_edge_top_loop");
    const isBotLoop = primaryEdge.edgeId.endsWith("_edge_bot_loop");
    const vIdx = matchV ? Number(matchV[1] ?? matchV[2]) : -1;
    const bevelKey = matchTop
      ? `edge_top_${matchTop[1]}`
      : matchBot
        ? `edge_bot_${matchBot[1]}`
        : isTopLoop
          ? "edge_top_0"
          : isBotLoop
            ? "edge_bot_0"
            : null;
    const currentFilletVal =
      vIdx >= 0 && primaryBody?.cornerFilletsMm?.[vIdx] !== undefined
        ? primaryBody.cornerFilletsMm[vIdx]!
        : bevelKey && primaryBody?.vertexBevelsMm?.[bevelKey] !== undefined
          ? primaryBody.vertexBevelsMm[bevelKey]!
          : (primaryBody?.edgeFilletRadiusMm || 0);
    const currentChamferVal =
      bevelKey && primaryBody?.vertexBevelsMm?.[bevelKey] !== undefined
        ? primaryBody.vertexBevelsMm[bevelKey]!
        : vIdx >= 0 && primaryBody?.cornerChamfersMm?.[vIdx] !== undefined
          ? primaryBody.cornerChamfersMm[vIdx]!
          : (primaryBody?.edgeChamferDistMm || 0);

    return {
      origin: originScreen,
      midpoint3D: primaryEdge.midpoint,
      tip: { x: originScreen.x + ux * arrowLenPx, y: originScreen.y + uy * arrowLenPx },
      oppTip: { x: originScreen.x - ux * (arrowLenPx * 0.7), y: originScreen.y - uy * (arrowLenPx * 0.7) },
      ux,
      uy,
      pixelsPerMm: Math.max(0.35, 30 / 10),
      edge: primaryEdge,
      currentFilletVal,
      currentChamferVal,
    };
  }, [primaryEdge, primaryBody, isTilted3D, activeMode, selectionKind3D, toScreen]);

  // Projeção da Seta de Bisel de Vértice 3D (EXCLUSIVA QUANDO UM VÉRTICE / QUINA 3D É CLICADO)
  const vertexBevelGizmo = useMemo(() => {
    if (!primaryVertex || (!isTilted3D && activeMode !== "3d")) return null;
    if (selectionKind3D !== "vertex") return null;
    const originScreen = toScreen(primaryVertex.point3D);
    const bodyCenter = primaryBody ? toScreen(primaryBody.pivot3D) : null;
    let ux = 0.707;
    let uy = 0.707;
    if (bodyCenter) {
      const dx = bodyCenter.x - originScreen.x;
      const dy = bodyCenter.y - originScreen.y;
      const len = Math.hypot(dx, dy) || 1;
      ux = dx / len;
      uy = dy / len;
    }
    const arrowLenPx = 44;
    const bevelKey = `${primaryVertex.role}_${primaryVertex.cornerIndex}`;
    const currentBevelMm = primaryBody?.vertexBevelsMm?.[bevelKey] ?? 10;
    return {
      origin: originScreen,
      vertex: primaryVertex,
      bevelKey,
      currentBevelMm,
      tip: { x: originScreen.x + ux * arrowLenPx, y: originScreen.y + uy * arrowLenPx },
      ux,
      uy,
      pixelsPerMm: Math.max(0.15, 30 / 10),
    };
  }, [primaryVertex, primaryBody, isTilted3D, activeMode, selectionKind3D, toScreen]);

  // Projeção da Seta Curva Bidirecional de Corte em Grau / Meia-Esquadria (Rotate Around Axis: Face / Aresta)
  const hingeMiterGizmo = useMemo(() => {
    if ((!isTilted3D && activeMode !== "3d") || !primaryBody) return null;
    if (selectionKind3D !== "hinge" && directTool !== "rotate_axis_3d") return null;
    const anchor3D =
      primaryFace?.centroid ??
      activeHingeEdge?.midpoint ??
      primaryEdge?.midpoint ??
      primaryBody.faces.find(
        (f) => f.role === (miterEndTarget === "bottom" ? "bottom" : "top"),
      )?.centroid ??
      primaryBody.pivot3D;
    const originScreen = toScreen(anchor3D);
    const savedAngleDeg =
      miterEndTarget === "bottom"
        ? (primaryBody.miterCutBottomDeg ?? 0)
        : (primaryBody.miterCutTopDeg ?? 0);
    const liveAngleDeg = activeAxis === "miter" ? dragDeltaMm : savedAngleDeg;
    const arcSvg = buildDoubleHeadedMiterArcSvg(originScreen, 42, liveAngleDeg);
    return {
      origin: originScreen,
      anchor3D,
      edge: activeHingeEdge ?? primaryBody.edges[0] ?? null,
      face: primaryFace,
      angleDeg: savedAngleDeg,
      liveAngleDeg,
      arcSvg,
    };
  }, [
    activeHingeEdge,
    primaryFace,
    primaryEdge,
    isTilted3D,
    activeMode,
    selectionKind3D,
    directTool,
    toScreen,
    miterEndTarget,
    primaryBody,
    activeAxis,
    dragDeltaMm,
  ]);

  // ============================================================================
  // TECLADO NUMÉRICO FLUTUANTE COMPACTO (196px + VIEWPORT CLAMPING OBRIGATÓRIO)
  // ============================================================================

  const openFloatingNumpad = useCallback(
    (
      kind: ParametricNumpadKind,
      title: string,
      unit: "mm" | "°" | "×",
      initialValue: number,
      targetParameter: NumpadTargetParameter = "extrudeHeight",
      targetEntityId?: string,
      subTarget?: ActiveParametricNumpadSession["subTarget"],
      copyModeOverride?: boolean,
    ) => {
      const resolvedTargetIds =
        activeTargetEntityIds.length > 0
          ? activeTargetEntityIds
          : primaryBody
            ? [primaryBody.entityId]
            : scene.bodies[0]
              ? [scene.bodies[0].entityId]
              : [];
      if (resolvedTargetIds.length === 0) return;
      triggerHaptic("selection");

      const primaryId = targetEntityId || resolvedTargetIds[0];
      const safeInitial =
        targetParameter === "filletRadius" || targetParameter === "chamferDistance"
          ? Math.max(
              0,
              Math.min(
                initialValue,
                Math.max(
                  5,
                  Math.min(
                    150,
                    Math.min(primaryBody?.deltaX || 200, primaryBody?.deltaY || 200) * 0.45,
                  ),
                ),
              ),
            )
          : initialValue;

      numpadFreshOpenRef.current = true;
      setNumpadSession({
        kind,
        targetParameter,
        targetEntityId: primaryId,
        title,
        unit,
        initialValue: Number(safeInitial.toFixed(2)),
        screenPos: { x: 0, y: 0 },
        targetEntityIds: resolvedTargetIds,
        subTarget,
        copyMode: copyModeOverride ?? copyOnTransform,
      });
      setNumpadBuffer(String(Number(safeInitial.toFixed(2))));
    },
    [activeTargetEntityIds, primaryBody, scene.bodies, copyOnTransform],
  );

  const commitFloatingNumpad = useCallback(() => {
    if (!numpadSession || !onCommitEntities) {
      setNumpadSession(null);
      return;
    }
    const parsed = parseFloat(numpadBuffer.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setNumpadSession(null);
      return;
    }

    const {
      kind,
      targetParameter,
      targetEntityId,
      targetEntityIds,
      subTarget,
      copyMode,
    } = numpadSession;
    triggerHaptic("action");

    const resolvedIds =
      targetEntityIds && targetEntityIds.length > 0
        ? targetEntityIds
        : targetEntityId
          ? [targetEntityId]
          : primaryBody
            ? [primaryBody.entityId]
            : [];

    if (resolvedIds.length === 0) {
      setNumpadSession(null);
      return;
    }

    const param =
      targetParameter ??
      (kind === "EXTRUSION"
        ? "extrudeHeight"
        : kind === "THICKNESS"
          ? "shellWallThickness"
          : kind === "RADIUS"
            ? "filletRadius"
            : kind === "CHAMFER"
              ? "chamferDistance"
              : kind === "OFFSET"
                ? "offsetFaceDistance"
                : kind === "ANGLE"
                  ? "miterAngle"
                  : kind === "HOLE_DIAMETER"
                    ? "holeDiameter"
                    : "moveX");

    if (param === "extrudeHeight") {
      if (
        booleanMode === "new_body" &&
        selectionKind3D === "face" &&
        primaryFace &&
        (primaryFace.role === "top" || primaryFace.role === "miter")
      ) {
        let nextActiveIds = resolvedIds;
        onCommitEntities((prev) => {
          const res = applyDirectFaceExtrude3DToEntities(
            prev,
            resolvedIds,
            parsed,
            "new_body",
          );
          nextActiveIds = res.activeIds;
          return res.updatedEntities;
        }, nextActiveIds);
        setSubSel((prev) => ({
          ...prev,
          bodyIds: nextActiveIds.map((id) => `body_${id}`),
          faceIds: nextActiveIds.map((id) => `body_${id}_face_top`),
        }));
      } else {
        onCommitEntities(
          (prev) => applyDirectExtrudeToEntities(prev, resolvedIds, parsed, booleanMode),
          resolvedIds,
        );
      }
    } else if (param === "shellWallThickness") {
      onCommitEntities(
        (prev) =>
          applyDirectShell3DToEntities(
            prev,
            resolvedIds,
            parsed,
            resolvedShellOpenCaps,
          ),
        resolvedIds,
      );
    } else if (param === "filletRadius") {
      onCommitEntities(
        (prev) =>
          applyDirectFilletOrChamfer3DToEntities(
            prev,
            resolvedIds,
            "fillet",
            parsed,
            selectedVerticalEdgeIndices,
            selectedBevelKeys,
          ),
        resolvedIds,
      );
    } else if (param === "chamferDistance") {
      onCommitEntities(
        (prev) =>
          applyDirectFilletOrChamfer3DToEntities(
            prev,
            resolvedIds,
            "chamfer",
            parsed,
            selectedVerticalEdgeIndices,
            selectedBevelKeys,
          ),
        resolvedIds,
      );
    } else if (param === "holeDiameter") {
      onCommitEntities((prev) => {
        const res = applyDirectHole3DToEntities(prev, resolvedIds, {
          customDiameterMm: Math.max(1, parsed),
          holeType: "through",
        });
        return res.updatedEntities;
      }, resolvedIds);
    } else if (param === "offsetFaceDistance") {
      if (
        lastCompletedDrag &&
        (lastCompletedDrag.axis === "face_normal" || lastCompletedDrag.axis === "extrude")
      ) {
        const refRole = lastCompletedDrag.faceRole ?? "top";
        onCommitEntities(() => {
          if (refRole === "inner_side") {
            return applyDirectOffsetFace3DToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              "inner_cavity",
              Math.abs(parsed),
            );
          }
          if (refRole === "bottom") {
            return applyDirectOffsetFace3DToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              "bottom",
              parsed,
            );
          }
          if (refRole === "top" || refRole === "miter") {
            if (booleanMode === "new_body") {
              const res = applyDirectFaceExtrude3DToEntities(
                lastCompletedDrag.startEntities,
                lastCompletedDrag.targetIds,
                parsed,
                "new_body",
                lastCompletedDrag.copyIdMap,
              );
              return res.updatedEntities;
            }
            const nextH = Math.max(1, lastCompletedDrag.initialValue + parsed);
            return applyDirectExtrudeToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              nextH,
              booleanMode,
            );
          }
          if (selectedSideFacesCount >= 2 || offsetFaceTarget === "sides") {
            return applyDirectOffsetFace3DToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              "sides",
              parsed,
            );
          }
          if (lastCompletedDrag.faceNormal) {
            return applyDirectOffsetFace3DToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              "side_normal",
              parsed,
              lastCompletedDrag.faceNormal,
            );
          }
          return applyDirectOffsetFace3DToEntities(
            lastCompletedDrag.startEntities,
            lastCompletedDrag.targetIds,
            "sides",
            parsed,
          );
        }, lastCompletedDrag.targetIds);
        setLastCompletedDrag((prev) =>
          prev
            ? {
                ...prev,
                deltaMm: parsed,
                endPoint3D: prev.faceNormal
                  ? {
                      x: prev.startPoint3D.x + prev.faceNormal.x * parsed,
                      y: prev.startPoint3D.y + prev.faceNormal.y * parsed,
                      z: prev.startPoint3D.z + prev.faceNormal.z * parsed,
                    }
                  : prev.endPoint3D,
              }
            : null,
        );
      } else if (selectionKind3D === "face" && primaryFace) {
        if (primaryFace.role === "inner_side") {
          onCommitEntities(
            (prev) =>
              applyDirectOffsetFace3DToEntities(
                prev,
                resolvedIds,
                "inner_cavity",
                Math.abs(parsed),
              ),
            resolvedIds,
          );
        } else if (primaryFace.role === "bottom") {
          onCommitEntities(
            (prev) => applyDirectOffsetFace3DToEntities(prev, resolvedIds, "bottom", parsed),
            resolvedIds,
          );
        } else if (primaryFace.role === "top" || primaryFace.role === "miter") {
          onCommitEntities(
            (prev) => applyDirectOffsetFace3DToEntities(prev, resolvedIds, "top", parsed),
            resolvedIds,
          );
        } else if (selectedSideFacesCount >= 2 || offsetFaceTarget === "sides") {
          onCommitEntities(
            (prev) => applyDirectOffsetFace3DToEntities(prev, resolvedIds, "sides", parsed),
            resolvedIds,
          );
        } else {
          onCommitEntities(
            (prev) =>
              applyDirectOffsetFace3DToEntities(
                prev,
                resolvedIds,
                "side_normal",
                parsed,
                primaryFace.normal,
              ),
            resolvedIds,
          );
        }
      } else {
        const faceT =
          subTarget === "top" ||
          subTarget === "bottom" ||
          subTarget === "sides" ||
          subTarget === "pos_x" ||
          subTarget === "neg_x" ||
          subTarget === "pos_y" ||
          subTarget === "neg_y" ||
          subTarget === "side_normal" ||
          subTarget === "inner_cavity"
            ? subTarget
            : offsetFaceTarget;
        onCommitEntities(
          (prev) =>
            applyDirectOffsetFace3DToEntities(
              prev,
              resolvedIds,
              faceT,
              parsed,
              primaryFace?.normal ?? null,
              referenceFrame3D,
            ),
          resolvedIds,
        );
      }
    } else if (param === "miterAngle") {
      if (subTarget === "rx" || subTarget === "ry" || subTarget === "rz") {
        const rotAxisKey =
          subTarget === "rx" ? "rot_x" : subTarget === "ry" ? "rot_y" : "rot_z";
        if (lastCompletedDrag && lastCompletedDrag.axis === rotAxisKey) {
          const startScene = buildDirectTopology3DScene(
            lastCompletedDrag.startEntities,
            sheetThickness,
          );
          const res = applyMultiBodyRigidTransform3D(
            lastCompletedDrag.startEntities,
            lastCompletedDrag.targetIds,
            startScene,
            {
              rxDeg: subTarget === "rx" ? parsed : 0,
              ryDeg: subTarget === "ry" ? parsed : 0,
              rzDeg: subTarget === "rz" ? parsed : 0,
            },
            lastCompletedDrag.startPoint3D,
            lastCompletedDrag.copyMode,
            lastCompletedDrag.copyIdMap,
          );
          onCommitEntities(() => res.updatedEntities, res.activeIds);
          setLastCompletedDrag((prev) =>
            prev ? { ...prev, deltaMm: parsed, activeResultIds: res.activeIds } : null,
          );
        } else {
          onCommitEntities((prev) => {
            const curScene = buildDirectTopology3DScene(prev, sheetThickness);
            const res = applyMultiBodyRigidTransform3D(
              prev,
              resolvedIds,
              curScene,
              {
                rxDeg: subTarget === "rx" ? parsed : 0,
                ryDeg: subTarget === "ry" ? parsed : 0,
                rzDeg: subTarget === "rz" ? parsed : 0,
              },
              selectionCenter3D,
              Boolean(copyMode),
            );
            return res.updatedEntities;
          }, resolvedIds);
        }
      } else {
        const endT = subTarget === "bottom" ? "bottom" : miterEndTarget;
        onCommitEntities(
          (prev) => applyDirectMiterCut3DToEntities(prev, resolvedIds, endT, parsed, miterAxis),
          resolvedIds,
        );
      }
    } else if (param === "moveX" || param === "moveY" || param === "moveZ") {
      const axisKey = param === "moveX" ? "x" : param === "moveY" ? "y" : "z";
      const localAxes =
        referenceFrame3D === "ocs" && primaryBody
          ? getBodyLocalAxesInWCS(primaryBody.rotation3D)
          : null;
      const axVec =
        localAxes
          ? axisKey === "x"
            ? localAxes.axisX
            : axisKey === "y"
              ? localAxes.axisY
              : localAxes.axisZ
          : axisKey === "x"
            ? { x: 1, y: 0, z: 0 }
            : axisKey === "y"
              ? { x: 0, y: 1, z: 0 }
              : { x: 0, y: 0, z: 1 };
      const deltaObj = {
        dx: Number((axVec.x * parsed).toFixed(3)),
        dy: Number((axVec.y * parsed).toFixed(3)),
        dz: Number((axVec.z * parsed).toFixed(3)),
      };

      if (lastCompletedDrag && lastCompletedDrag.axis === axisKey) {
        const startScene = buildDirectTopology3DScene(
          lastCompletedDrag.startEntities,
          sheetThickness,
        );
        const res = applyMultiBodyRigidTransform3D(
          lastCompletedDrag.startEntities,
          lastCompletedDrag.targetIds,
          startScene,
          deltaObj,
          lastCompletedDrag.startPoint3D,
          lastCompletedDrag.copyMode,
          lastCompletedDrag.copyIdMap,
        );
        onCommitEntities(() => res.updatedEntities, res.activeIds);
        setSubSel((prev) => ({
          ...prev,
          bodyIds: res.activeIds.map((id) => `body_${id}`),
        }));
        setLastCompletedDrag((prev) =>
          prev
            ? {
                ...prev,
                deltaMm: parsed,
                activeResultIds: res.activeIds,
                endPoint3D: {
                  x: prev.startPoint3D.x + deltaObj.dx,
                  y: prev.startPoint3D.y + deltaObj.dy,
                  z: prev.startPoint3D.z + deltaObj.dz,
                },
              }
            : null,
        );
      } else {
        let finalActiveIds = resolvedIds;
        onCommitEntities((prev) => {
          const curScene = buildDirectTopology3DScene(prev, sheetThickness);
          const res = applyMultiBodyRigidTransform3D(
            prev,
            resolvedIds,
            curScene,
            deltaObj,
            selectionCenter3D,
            Boolean(copyMode),
          );
          finalActiveIds = res.activeIds;
          return res.updatedEntities;
        }, finalActiveIds);
        if (copyMode) {
          setSubSel((prev) => ({
            ...prev,
            bodyIds: finalActiveIds.map((id) => `body_${id}`),
          }));
        }
      }
    } else if (param === "scaleFactor" || kind === "SCALE") {
      onCommitEntities(
        (prev) =>
          applyDirectScale3DToEntities(
            prev,
            resolvedIds,
            parsed,
            selectionCenter3D ?? subSel.activePivot3D ?? primaryBody?.pivot3D ?? null,
          ),
        resolvedIds,
      );
    }

    setNumpadSession(null);
  }, [
    numpadSession,
    numpadBuffer,
    onCommitEntities,
    primaryBody,
    primaryFace,
    selectionKind3D,
    selectedVerticalEdgeIndices,
    selectedBevelKeys,
    booleanMode,
    resolvedShellOpenCaps,
    selectedSideFacesCount,
    offsetFaceTarget,
    miterEndTarget,
    miterAxis,
    subSel.activePivot3D,
    selectionCenter3D,
    referenceFrame3D,
    sheetThickness,
    lastCompletedDrag,
    setSubSel,
  ]);

  const handleNumpadStep = useCallback((delta: number) => {
    numpadFreshOpenRef.current = false;
    setNumpadBuffer((prev) => {
      const curr = parseFloat(prev.replace(",", "."));
      const base = Number.isFinite(curr) ? curr : 0;
      const next = Math.round((base + delta) * 100) / 100;
      return String(next);
    });
  }, []);

  const numpadMinusHold = useExponentialHold((mult) => handleNumpadStep(-1 * mult));
  const numpadPlusHold = useExponentialHold((mult) => handleNumpadStep(1 * mult));

  // Cálculo em tempo real do Array 3D Inteligente / Grade para Portões e Serralheria
  const selectedFacesForSpan = useMemo(() => {
    if (subSel.faceIds.length < 2) return [];
    const faces: DirectFace3D[] = [];
    for (const fid of subSel.faceIds) {
      for (const b of scene.bodies) {
        const found = b.faces.find((f) => f.faceId === fid);
        if (found) faces.push(found);
      }
    }
    return faces;
  }, [subSel.faceIds, scene.bodies]);

  const smartArraySourceBody = primaryBody ?? scene.bodies[0] ?? null;

  const smartSpanDetection = useMemo(
    () =>
      detectInternalSpan3D(
        smartArraySourceBody,
        scene.bodies,
        smartArrayAxis,
        selectedFacesForSpan,
      ),
    [smartArraySourceBody, scene.bodies, smartArrayAxis, selectedFacesForSpan],
  );

  const effectiveSmartSpanMm = smartArrayManualSpanMm ?? smartSpanDetection.spanMm;

  const smartArrayCalc = useMemo(
    () =>
      computeSmartGrilleArray3D({
        mode: smartArrayMode,
        spanMm: effectiveSmartSpanMm,
        tubeWidthMm: smartSpanDetection.tubeWidthMm,
        count: smartArrayCount,
        maxClearGapMm: smartArrayMaxGapMm,
        startInnerCoordMm: smartSpanDetection.startInnerCoordMm,
        axis: smartArrayAxis,
        perpInnerStartMm: smartSpanDetection.perpInnerStartMm,
        perpInnerEndMm: smartSpanDetection.perpInnerEndMm,
        perpSpanMm: smartSpanDetection.perpSpanMm,
      }),
    [
      smartArrayMode,
      effectiveSmartSpanMm,
      smartSpanDetection.tubeWidthMm,
      smartArrayCount,
      smartArrayMaxGapMm,
      smartSpanDetection.startInnerCoordMm,
      smartArrayAxis,
      smartSpanDetection.perpInnerStartMm,
      smartSpanDetection.perpInnerEndMm,
      smartSpanDetection.perpSpanMm,
    ],
  );

  const handleSmartArrayStep = useCallback(
    (dir: -1 | 1, mult: number) => {
      triggerHaptic("tap");
      if (smartArrayMode === "by_count") {
        const step = mult >= 10 ? 5 : mult >= 5 ? 2 : 1;
        setSmartArrayCount((prev) => Math.max(1, Math.min(80, prev + dir * step)));
      } else {
        setSmartArrayMaxGapMm((prev) =>
          Math.max(10, Math.min(1000, Math.round(prev + dir * mult))),
        );
      }
    },
    [smartArrayMode],
  );

  const smartArrayMinusHold = useExponentialHold((mult) => handleSmartArrayStep(-1, mult));
  const smartArrayPlusHold = useExponentialHold((mult) => handleSmartArrayStep(1, mult));

  // Extração fiel da seção transversal (W x H_z), espessura de parede e raio de canto do tubo base para o Quadro 45°
  const smartFrameExtractedProfile = useMemo(
    () =>
      extractTubeCrossSectionFromBody3D(
        smartArraySourceBody,
        Math.min(smartFrameWidthMm, smartFrameHeightMm),
      ),
    [smartArraySourceBody, smartFrameWidthMm, smartFrameHeightMm],
  );

  const smartFrameProfileCrossMm = smartFrameExtractedProfile.profileWidthMm;

  const smartMiterFrameCalc = useMemo(
    () =>
      computeSmartMiterFrame3D({
        measureRef: smartFrameMeasureRef,
        inputWidthMm: smartFrameWidthMm,
        inputHeightMm: smartFrameHeightMm,
        profileWidthMm: smartFrameExtractedProfile.profileWidthMm,
        profileCrossSectionMm: smartFrameExtractedProfile.profileWidthMm,
        profileDepthMm: smartFrameExtractedProfile.profileDepthMm,
        wallThicknessMm: smartFrameExtractedProfile.wallThicknessMm,
        isHollowTube: smartFrameExtractedProfile.isHollowTube,
        cornerFilletRadiusMm: smartFrameExtractedProfile.cornerFilletRadiusMm,
        plane: smartFramePlane,
        jointMode: smartFrameJointMode,
        innerDivisionsCount: smartFrameInnerDivisions,
        center3D: smartArraySourceBody
          ? {
              x: smartArraySourceBody.pivot3D.x,
              y: smartArraySourceBody.pivot3D.y,
              z: smartArraySourceBody.elevationZ || 0,
            }
          : { x: 0, y: 0, z: 0 },
      }),
    [
      smartFrameMeasureRef,
      smartFrameWidthMm,
      smartFrameHeightMm,
      smartFrameExtractedProfile,
      smartFramePlane,
      smartFrameJointMode,
      smartFrameInnerDivisions,
      smartArraySourceBody,
    ],
  );

  // Ao ativar a ferramenta SHELL (`shell_3d`), aplica a cavidade vazada na FACE SELECIONADA
  // (ou na face-alvo ativa) respeitando "Caixa (1 Face)" vs "Tubo (2 Faces)".
  const prevDirectToolForShellRef = useRef<DirectModelingTool3D>(directTool);
  useEffect(() => {
    const justEnteredShell =
      directTool === "shell_3d" && prevDirectToolForShellRef.current !== "shell_3d";
    prevDirectToolForShellRef.current = directTool;
    if (directTool !== "shell_3d" || !onCommitEntities) return;
    const targetBody = primaryBody ?? scene.bodies[0] ?? null;
    if (!targetBody) return;
    const targetIds =
      activeTargetEntityIds.length > 0 ? activeTargetEntityIds : [targetBody.entityId];
    const currentT = targetBody.shellWallThicknessMm || targetBody.shellThicknessMm || 0;
    const detectedFaceCap =
      selectedFacesList.length > 0
        ? resolveFaceShellCapDirection3D(selectedFacesList[0]!)
        : shellTargetFaceCap;
    const nextCaps = resolveShellOpenCapsFromSelection3D(
      selectedFacesList,
      shellOpenCapsMode,
      detectedFaceCap,
    );
    const sameCaps =
      targetBody.shellOpenCaps.length === nextCaps.length &&
      nextCaps.every((c) => targetBody.shellOpenCaps.includes(c));
    if (currentT <= 0.1 || (justEnteredShell && !sameCaps)) {
      const nextT = currentT > 0.1 ? currentT : 4.75;
      onCommitEntities(
        (prev) => applyDirectShell3DToEntities(prev, targetIds, nextT, nextCaps),
        targetIds,
      );
    }
  }, [
    directTool,
    primaryBody,
    scene.bodies,
    activeTargetEntityIds,
    selectedFacesList,
    shellOpenCapsMode,
    shellTargetFaceCap,
    onCommitEntities,
  ]);

  // Cancela imediatamente qualquer arraste 3D em andamento quando o 2º dedo toca a tela (Pinça de Zoom)
  useEffect(() => {
    const handleCancelForPinch = () => {
      multiTouchPinchCooldownUntilRef.current = performance.now() + 220;
      const session = dragSessionRef.current;
      if (session) {
        if (session.hasMoved) {
          onPreviewEntities?.(session.startEntities);
        }
        dragSessionRef.current = null;
        setActiveAxis(null);
        setDragDeltaMm(0);
        setActiveContactSnap(null);
        setRotationSnapState(null);
      }
    };
    window.addEventListener("chamfer-cancel-3d-drag-for-pinch", handleCancelForPinch);
    return () =>
      window.removeEventListener("chamfer-cancel-3d-drag-for-pinch", handleCancelForPinch);
  }, [onPreviewEntities]);

  const smartFrameWMinusHold = useExponentialHold((mult) =>
    setSmartFrameWidthMm((prev) => Math.max(100, Math.min(12000, Math.round(prev - 10 * mult)))),
  );
  const smartFrameWPlusHold = useExponentialHold((mult) =>
    setSmartFrameWidthMm((prev) => Math.max(100, Math.min(12000, Math.round(prev + 10 * mult)))),
  );
  const smartFrameHMinusHold = useExponentialHold((mult) =>
    setSmartFrameHeightMm((prev) => Math.max(100, Math.min(12000, Math.round(prev - 10 * mult)))),
  );
  const smartFrameHPlusHold = useExponentialHold((mult) =>
    setSmartFrameHeightMm((prev) => Math.max(100, Math.min(12000, Math.round(prev + 10 * mult)))),
  );

  // Auto-Enquadramento Inteligente à Esquerda da Tela quando o usuário altera medidas do Array 3D / Quadro 45°
  useEffect(() => {
    if (directTool !== "array_3d" || !onSetView) return;
    const pts3D: Vec3Mm[] = [];
    if (smartArrayPanelTab === "miter_frame") {
      for (const m of smartMiterFrameCalc.members ?? []) {
        pts3D.push(
          { x: m.minX, y: m.minY, z: m.elevationZ },
          { x: m.maxX, y: m.maxY, z: m.elevationZ + m.extrudeHeightMm },
          { x: m.minX, y: m.maxY, z: m.elevationZ },
          { x: m.maxX, y: m.minY, z: m.elevationZ + m.extrudeHeightMm },
        );
      }
    } else if (smartArraySourceBody) {
      const bb = smartArraySourceBody.bbox3D;
      const halfTube = (smartArrayCalc.tubeWidthMm || 30) * 0.5;
      pts3D.push(
        { x: bb.minX, y: bb.minY, z: bb.minZ },
        { x: bb.maxX, y: bb.maxY, z: bb.maxZ },
      );
      for (const c of smartArrayCalc.centerCoordsMm ?? []) {
        if (smartArrayAxis === "x") {
          pts3D.push(
            { x: c - halfTube, y: bb.minY, z: bb.minZ },
            { x: c + halfTube, y: bb.maxY, z: bb.maxZ },
          );
        } else if (smartArrayAxis === "y") {
          pts3D.push(
            { x: bb.minX, y: c - halfTube, z: bb.minZ },
            { x: bb.maxX, y: c + halfTube, z: bb.maxZ },
          );
        } else {
          pts3D.push(
            { x: bb.minX, y: bb.minY, z: c - halfTube },
            { x: bb.maxX, y: bb.maxY, z: c + halfTube },
          );
        }
      }
    }
    if (pts3D.length < 2) return;

    let minProjX = Infinity;
    let maxProjX = -Infinity;
    let minProjY = Infinity;
    let maxProjY = -Infinity;
    for (const p of pts3D) {
      const pm = projectPoint3DToCanvasViewMm(p, orbitProjection);
      if (pm.x < minProjX) minProjX = pm.x;
      if (pm.x > maxProjX) maxProjX = pm.x;
      if (pm.y < minProjY) minProjY = pm.y;
      if (pm.y > maxProjY) maxProjY = pm.y;
    }

    const spanX = Math.max(120, maxProjX - minProjX);
    const spanY = Math.max(120, maxProjY - minProjY);
    const usableLeftW = Math.max(220, width - 320);
    const usableH = Math.max(220, height - 160);
    const targetK = Math.max(
      0.12,
      Math.min(2.2, Math.min((usableLeftW * 0.72) / spanX, (usableH * 0.72) / spanY)),
    );
    const centerProjX = (minProjX + maxProjX) * 0.5;
    const centerProjY = (minProjY + maxProjY) * 0.5;
    const leftAreaCenterX = Math.max(160, (width - 304) * 0.48);
    const leftAreaCenterY = height * 0.52;

    onSetView({
      k: Number(targetK.toFixed(3)),
      tx: Math.round(leftAreaCenterX - centerProjX * targetK),
      ty: Math.round(leftAreaCenterY - centerProjY * targetK),
    });
  }, [
    directTool,
    smartArrayPanelTab,
    smartFrameWidthMm,
    smartFrameHeightMm,
    smartFrameMeasureRef,
    smartFramePlane,
    smartFrameInnerDivisions,
    smartArrayCount,
    smartArrayMaxGapMm,
    effectiveSmartSpanMm,
    smartArrayAxis,
  ]);

  const handleNumpadKey = useCallback((key: string) => {
    triggerHaptic("tap");
    const isFresh = numpadFreshOpenRef.current;
    numpadFreshOpenRef.current = false;

    if (key === "C") {
      setNumpadBuffer("0");
      return;
    }
    if (key === "BACK") {
      if (isFresh) {
        setNumpadBuffer("0");
        return;
      }
      setNumpadBuffer((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
      return;
    }
    if (key === "+/-") {
      setNumpadBuffer((prev) => (prev.startsWith("-") ? prev.slice(1) : `-${prev}`));
      return;
    }
    if (key === ".") {
      if (isFresh) {
        setNumpadBuffer("0.");
        return;
      }
      setNumpadBuffer((prev) => (prev.includes(".") ? prev : `${prev}.`));
      return;
    }
    if (isFresh) {
      setNumpadBuffer(key);
      return;
    }
    setNumpadBuffer((prev) => (prev === "0" ? key : `${prev}${key}`));
  }, []);

  // Suporte a teclado físico quando o Floating Parametric Numpad está aberto
  useEffect(() => {
    if (!numpadSession) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key >= "0" && ev.key <= "9") {
        ev.preventDefault();
        handleNumpadKey(ev.key);
      } else if (ev.key === "." || ev.key === ",") {
        ev.preventDefault();
        handleNumpadKey(".");
      } else if (ev.key === "-") {
        ev.preventDefault();
        handleNumpadKey("+/-");
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        handleNumpadKey("BACK");
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        commitFloatingNumpad();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        setNumpadSession(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [numpadSession, handleNumpadKey, commitFloatingNumpad]);

  // ============================================================================
  // AÇÕES RÁPIDAS DE SUB-ELEMENTOS E MODELAGEM DIRETA 3D
  // ============================================================================

  const handleSelectAllVerticalEdges = useCallback(() => {
    const targetB = primaryBody ?? scene.bodies[0] ?? null;
    if (!targetB) return;
    const vertIds = targetB.edges
      .filter((e) => e.role === "vertical")
      .map((e) => e.edgeId);
    triggerHaptic("selection");
    setSubSel((prev) => ({
      ...prev,
      edgeIds: vertIds,
      faceIds: [],
      bodyIds: [],
      vertexIds: [],
    }));
  }, [primaryBody, scene.bodies, setSubSel]);

  const handleSelectTopAndBottomFacesForTube = useCallback(() => {
    const targetB = primaryBody ?? scene.bodies[0] ?? null;
    if (!targetB) return;
    const endFaceIds = targetB.faces
      .filter((f) => f.role === "top" || f.role === "bottom" || f.role === "miter")
      .map((f) => f.faceId);
    triggerHaptic("selection");
    setShellOpenCapsMode("both_ends");
    setSubSel((prev) => ({
      ...prev,
      faceIds: endFaceIds,
      edgeIds: [],
      bodyIds: [],
      vertexIds: [],
    }));
  }, [primaryBody, scene.bodies, setSubSel]);

  // ============================================================================
  // CRIAÇÃO E ALINHAMENTO CONCÊNTRICO DE PERFIS 3D (RETÂNGULO / POLÍGONO / CÍRCULO) NO MODO CAD 3D
  // ============================================================================
  const getReferenceCenterXY = useCallback((): Vec2 => {
    if (primaryBody) {
      return { x: primaryBody.pivot3D.x, y: primaryBody.pivot3D.y };
    }
    if (scene.bodies.length > 0) {
      const b0 = scene.bodies[0]!;
      return { x: b0.pivot3D.x, y: b0.pivot3D.y };
    }
    return { x: 0, y: 0 };
  }, [primaryBody, scene.bodies]);

  const handleCreate3DProfileCurve = useCallback(
    (
      kind: "rectangle" | "polygon" | "circle" | "kit_3_profiles",
      customSides?: number,
      elevationZ = 0,
    ) => {
      if (!onCommitEntities) return;
      triggerHaptic("action");
      const refCenter = getReferenceCenterXY();

      if (kind === "kit_3_profiles") {
        // Cria as 3 seções concêntricas clássicas do AutoCAD 3D (Retângulo Z=0, Hexágono Z=60, Círculo Z=120)
        const rectEnt: Entity = {
          ...rectPolyline(
            refCenter.x - 50,
            refCenter.y - 50,
            refCenter.x + 50,
            refCenter.y + 50,
            "corte",
          ),
          elevationZ: 0,
          extrudeHeight: 0,
          params: {
            is3DProfileCurve: true,
            isLoftSection3D: true,
            extrudeHeightMm: 0,
            elevationZ: 0,
            bodyName: "Seção [1] Retângulo (Z=0 mm)",
          },
        };
        const hexEnt: Entity = {
          ...regularPolygon(refCenter, 36, 6, 0, "corte"),
          elevationZ: 60,
          extrudeHeight: 0,
          params: {
            is3DProfileCurve: true,
            isLoftSection3D: true,
            isPolygon3D: true,
            polygonSides: 6,
            extrudeHeightMm: 0,
            elevationZ: 60,
            bodyName: "Seção [2] Hexágono (Z=60 mm)",
          },
        };
        const circEnt: Entity = {
          id: uid(),
          layer: "corte",
          type: "circle",
          cx: refCenter.x,
          cy: refCenter.y,
          r: 32,
          elevationZ: 120,
          extrudeHeight: 0,
          params: {
            is3DProfileCurve: true,
            isLoftSection3D: true,
            extrudeHeightMm: 0,
            elevationZ: 120,
            bodyName: "Seção [3] Círculo (Z=120 mm)",
          },
        };
        onCommitEntities(
          (prev) => [...prev, rectEnt, hexEnt, circEnt],
          [rectEnt.id, hexEnt.id, circEnt.id],
        );
        setSubSel({
          faceIds: [],
          edgeIds: [],
          vertexIds: [],
          bodyIds: [`body_${hexEnt.id}`],
          selectionScope: "body",
          activePivot3D: { x: refCenter.x, y: refCenter.y, z: 60 },
          activeHingeEdgeId: null,
        });
        setProfile3DCreatorOpen(false);
        return;
      }

      let newEnt: Entity;
      if (kind === "rectangle") {
        newEnt = {
          ...rectPolyline(
            refCenter.x - 50,
            refCenter.y - 50,
            refCenter.x + 50,
            refCenter.y + 50,
            "corte",
          ),
          elevationZ,
          extrudeHeight: 0,
          params: {
            is3DProfileCurve: true,
            isLoftSection3D: true,
            extrudeHeightMm: 0,
            elevationZ,
            bodyName: `Retângulo 3D (Z=${elevationZ} mm)`,
          },
        };
      } else if (kind === "polygon") {
        const sides = Math.max(3, Math.min(12, customSides ?? polygonSides3D));
        newEnt = {
          ...regularPolygon(refCenter, 36, sides, 0, "corte"),
          elevationZ,
          extrudeHeight: 0,
          params: {
            is3DProfileCurve: true,
            isLoftSection3D: true,
            isPolygon3D: true,
            polygonSides: sides,
            extrudeHeightMm: 0,
            elevationZ,
            bodyName: `Polígono ${sides}L 3D (Z=${elevationZ} mm)`,
          },
        };
      } else {
        newEnt = {
          id: uid(),
          layer: "corte",
          type: "circle",
          cx: refCenter.x,
          cy: refCenter.y,
          r: 32,
          elevationZ,
          extrudeHeight: 0,
          params: {
            is3DProfileCurve: true,
            isLoftSection3D: true,
            extrudeHeightMm: 0,
            elevationZ,
            bodyName: `Círculo 3D (Z=${elevationZ} mm)`,
          },
        };
      }

      onCommitEntities((prev) => [...prev, newEnt], [newEnt.id]);
      setSubSel({
        faceIds: [],
        edgeIds: [],
        vertexIds: [],
        bodyIds: [`body_${newEnt.id}`],
        selectionScope: "body",
        activePivot3D: { x: refCenter.x, y: refCenter.y, z: elevationZ },
        activeHingeEdgeId: null,
      });
      if (!isLoftActive) {
        setDirectTool("transform_3d");
      }
      setProfile3DCreatorOpen(false);
    },
    [
      onCommitEntities,
      getReferenceCenterXY,
      polygonSides3D,
      setSubSel,
      isLoftActive,
      setDirectTool,
    ],
  );

  // Alinhamento concêntrico 1-clique (Centro Geométrico ⌖ de todos os perfis no mesmo eixo X,Y)
  const handleCenterProfilesConcentrically = useCallback(() => {
    if (!onCommitEntities || scene.bodies.length === 0) return;
    triggerHaptic("action");
    const refBody =
      [...scene.bodies].sort((a, b) => b.totalAreaMm2 - a.totalAreaMm2)[0] ??
      scene.bodies[0]!;
    const refCx = refBody.pivot3D.x;
    const refCy = refBody.pivot3D.y;

    onCommitEntities((prev) =>
      prev.map((ent) => {
        const b = boxOf(ent);
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        const dx = refCx - cx;
        const dy = refCy - cy;
        const translated =
          Math.hypot(dx, dy) > 1e-3 ? translate(ent, dx, dy) : ent;
        return {
          ...translated,
          extrudeHeight: 0,
          params: {
            ...(translated.params ?? {}),
            is3DProfileCurve: true,
            isLoftSection3D: true,
            extrudeHeightMm: 0,
            extrudeHeight: 0,
          },
        };
      }),
    );
  }, [onCommitEntities, scene.bodies]);

  // Define elevação absoluta Z (+Z Ortho) do perfil/corpo selecionado
  const handleSetPrimaryBodyElevationZ = useCallback(
    (targetZ: number) => {
      if (!onCommitEntities || !primaryBody) return;
      triggerHaptic("action");
      const targetId = primaryBody.entityId;
      onCommitEntities(
        (prev) =>
          prev.map((ent) =>
            ent.id === targetId ? setEntityElevationZ(ent, targetZ) : ent,
          ),
        [targetId],
      );
      setSubSel((prev) => ({
        ...prev,
        activePivot3D: {
          x: primaryBody.pivot3D.x,
          y: primaryBody.pivot3D.y,
          z: targetZ,
        },
      }));
    },
    [onCommitEntities, primaryBody, setSubSel],
  );

  // Alterna entre Curva de Seção 3D (Z) e Sólido Extrudado no perfil selecionado
  const handleToggle3DProfileCurveMode = useCallback(() => {
    if (!onCommitEntities || !primaryBody) return;
    triggerHaptic("selection");
    const isCurrentlyCurve = primaryBody.extrudeHeightMm <= 0.05;
    const targetId = primaryBody.entityId;
    const nextH = isCurrentlyCurve ? Math.max(10, sheetThickness) : 0;
    onCommitEntities(
      (prev) =>
        prev.map((ent) =>
          ent.id === targetId
            ? {
                ...ent,
                extrudeHeight: nextH,
                params: {
                  ...(ent.params ?? {}),
                  is3DProfileCurve: isCurrentlyCurve ? false : true,
                  isLoftSection3D: isCurrentlyCurve ? false : true,
                  extrudeHeightMm: nextH,
                  extrudeHeight: nextH,
                },
              }
            : ent,
        ),
      [targetId],
    );
  }, [onCommitEntities, primaryBody, sheetThickness]);

  // Escuta filtros rápidos de sub-seleção 3D disparados pelo menu lateral 'SEL'
  useEffect(() => {
    const onSubSelPreset = (ev: Event) => {
      const targetB = primaryBody ?? scene.bodies[0] ?? null;
      if (!targetB) return;
      const preset = (ev as CustomEvent<{ preset?: string }>).detail?.preset;
      if (!preset) return;
      if (preset === "body") {
        setSubSel({
          bodyIds: [targetB.bodyId],
          faceIds: [],
          edgeIds: [],
          vertexIds: [],
          selectionScope: "body",
          activePivot3D: targetB.pivot3D,
          activeHingeEdgeId: null,
        });
      } else if (preset === "top_face") {
        const topF =
          targetB.faces.find((f) => f.role === "top" || f.role === "miter") ??
          targetB.faces[0];
        if (topF) {
          setSubSel({
            faceIds: [topF.faceId],
            edgeIds: [],
            bodyIds: [],
            vertexIds: [],
            selectionScope: "face",
            activePivot3D: topF.centroid,
            activeHingeEdgeId: null,
          });
        }
      } else if (preset === "both_faces") {
        handleSelectTopAndBottomFacesForTube();
      } else if (preset === "vertical_edges") {
        handleSelectAllVerticalEdges();
      } else if (preset === "all_faces") {
        setSubSel({
          faceIds: targetB.faces.map((f) => f.faceId),
          edgeIds: [],
          bodyIds: [],
          vertexIds: [],
          selectionScope: "face",
          activePivot3D: targetB.pivot3D,
          activeHingeEdgeId: null,
        });
      } else if (preset === "all_edges") {
        setSubSel({
          edgeIds: targetB.edges.map((e) => e.edgeId),
          faceIds: [],
          bodyIds: [],
          vertexIds: [],
          selectionScope: "edge",
          activePivot3D: targetB.pivot3D,
          activeHingeEdgeId: null,
        });
      }
    };
    window.addEventListener("chamfer-3d-subselection-preset", onSubSelPreset);
    return () => window.removeEventListener("chamfer-3d-subselection-preset", onSubSelPreset);
  }, [
    primaryBody,
    scene.bodies,
    setSubSel,
    handleSelectTopAndBottomFacesForTube,
    handleSelectAllVerticalEdges,
  ]);

  // ============================================================================
  // ARRASTE INTERATIVO DAS SETAS 3D NO CANVAS (EXTRUDE / OFFSET / TRANSFORM)
  // CORREÇÃO 1: setPointerCapture + Listener de Janela Estável sem re-bind no meio do arrasto!
  // ============================================================================

  const latestDragContextRef = useRef({
    onLiveTranslateSelectionXY,
    onCommitTranslateSelectionXY,
    onLiveElevateSelection,
    onCommitElevateSelection,
    onPreviewEntities,
    onCommitAtomicDrag,
    onCommitEntities,
    booleanMode,
    openFloatingNumpad,
    primaryBody,
    selectedBodiesList,
    primaryFace,
    primaryEdge,
    primaryVertex,
    selected,
    scene,
    toScreen,
    setSubSel,
    subSel,
    miterEndTarget,
    miterAxis,
    copyOnTransform,
    edgeActionMode,
    filletOrChamferMode,
    selectedVerticalEdgeIndices,
    selectedBevelKeys,
    selectionKind3D,
    directTool,
    resolvedShellOpenCaps,
    selectedSideFacesCount,
    offsetFaceTarget,
    referenceFrame3D,
    triggerEcholocationWavePulse,
  });

  latestDragContextRef.current = {
    onLiveTranslateSelectionXY,
    onCommitTranslateSelectionXY,
    onLiveElevateSelection,
    onCommitElevateSelection,
    onPreviewEntities,
    onCommitAtomicDrag,
    onCommitEntities,
    booleanMode,
    openFloatingNumpad,
    primaryBody,
    selectedBodiesList,
    primaryFace,
    primaryEdge,
    primaryVertex,
    selected,
    scene,
    toScreen,
    setSubSel,
    subSel,
    miterEndTarget,
    miterAxis,
    copyOnTransform,
    edgeActionMode,
    filletOrChamferMode,
    selectedVerticalEdgeIndices,
    selectedBevelKeys,
    selectionKind3D,
    directTool,
    resolvedShellOpenCaps,
    selectedSideFacesCount,
    offsetFaceTarget,
    referenceFrame3D,
    triggerEcholocationWavePulse,
  };

  const handleAxisPointerDown = (
    axis: GizmoAxis,
    ux: number,
    uy: number,
    pixelsPerMm: number,
    ev: React.PointerEvent,
    axisVec3D?: Vec3Mm,
  ) => {
    ev.stopPropagation();
    ev.preventDefault();
    try {
      (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    } catch {
      // fallback: window pointermove listener handles tracking
    }
    triggerHaptic("selection");

    const targetIds =
      activeTargetEntityIds.length > 0
        ? activeTargetEntityIds
        : primaryBody
          ? [primaryBody.entityId]
          : [];

    const initVal =
      axis === "extrude" || axis === "face_normal"
        ? directTool === "shell_3d"
          ? (primaryBody?.shellWallThicknessMm ?? primaryBody?.shellThicknessMm ?? 3)
          : (primaryBody?.extrudeHeightMm ?? 500)
        : axis === "vertex_bevel"
          ? (vertexBevelGizmo?.currentBevelMm ?? 10)
          : axis === "edge_diagonal"
            ? edgeActionMode === "fillet"
              ? (edgeDiagonalGizmo?.currentFilletVal ?? primaryBody?.edgeFilletRadiusMm ?? 0)
              : edgeActionMode === "chamfer"
                ? (edgeDiagonalGizmo?.currentChamferVal ?? primaryBody?.edgeChamferDistMm ?? 0)
                : 0
            : axis === "miter"
              ? miterEndTarget === "bottom"
                ? (primaryBody?.miterCutBottomDeg ?? 0)
                : (primaryBody?.miterCutTopDeg ?? 0)
              : axis === "z"
                ? (primaryBody?.elevationZ ?? 0)
                : 0;

    const rect = rootOverlayRef.current?.getBoundingClientRect();
    const localStartX = rect ? ev.clientX - rect.left : ev.clientX;
    const localStartY = rect ? ev.clientY - rect.top : ev.clientY;
    const pivotSc =
      axis === "miter" && hingeMiterGizmo
        ? hingeMiterGizmo.origin
        : (gizmoScreen?.origin ?? { x: localStartX, y: localStartY });
    const angleStartRad = Math.atan2(localStartY - pivotSc.y, localStartX - pivotSc.x);
    const compassRadiusPx = gizmoScreen?.compassRadiusPx ?? 140;

    if (compassFadeTimerRef.current !== null) {
      window.clearTimeout(compassFadeTimerRef.current);
      compassFadeTimerRef.current = null;
    }
    setCompassFadingOut(false);

    if (axis === "rot_x" || axis === "rot_y" || axis === "rot_z") {
      setRotationSnapState({
        axis,
        angleStartRad,
        compassRadiusPx,
        snapResult: {
          rawAngleDeg: 0,
          angleDeg: 0,
          snapped: true,
          snappedKeyDeg: 0,
          isFineOuterZone: false,
          currentAngleRad: angleStartRad,
        },
      });
    } else {
      setRotationSnapState(null);
    }

    const startBodies =
      selectedBodiesList.length > 0
        ? selectedBodiesList
        : primaryBody
          ? [primaryBody]
          : [];

    // Inicializa estado de histerese do Snap Base Z=0 no início do arraste
    const initEntitiesById = new Map(entities.map((e) => [e.id, e]));
    const initBaseSnap = evaluateBaseSurfaceSnap3D(
      startBodies,
      0,
      false,
      0,
      initEntitiesById,
    );
    baseSnapLatchedRef.current = initBaseSnap.snapped;
    echolocationStateRef.current = {
      ...echolocationStateRef.current,
      isInBaseContact: initBaseSnap.snapped,
      armed: !initBaseSnap.snapped,
    };
    setActiveBaseSnapEval(null);

    dragSessionRef.current = {
      axis,
      pointerId: ev.pointerId,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      screenDirX: ux,
      screenDirY: uy,
      axisVec3D,
      pixelsPerMm: Math.max(0.08, pixelsPerMm),
      totalDeltaMm: 0,
      lastAppliedDeltaMm: 0,
      initialValue: initVal,
      targetIds,
      hasMoved: false,
      startCenter3D: selectionCenter3D ?? undefined,
      angleStartRad,
      pivotScreen: pivotSc,
      compassRadiusPx,
      startEntities: entities,
      startBody: primaryBody,
      startBodies,
      startFace: primaryFace,
      startEdge: primaryEdge,
      startVertex: primaryVertex,
      targetEdgeIndices: selectedVerticalEdgeIndices,
      targetBevelKeys: selectedBevelKeys,
      copyIdMap: new Map<string, string>(),
      activeResultIds: targetIds,
    };
    setActiveAxis(axis);
    setDragDeltaMm(0);
    setActiveContactSnap(null);
  };

  useEffect(() => {
    if (!activeAxis) return;

    const handlePointerMove = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      if (session.pointerId !== undefined && ev.pointerId !== session.pointerId) return;
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();

      const ctx = latestDragContextRef.current;
      const dxPx = ev.clientX - session.startClientX;
      const dyPx = ev.clientY - session.startClientY;
      if (Math.hypot(dxPx, dyPx) > 3) {
        session.hasMoved = true;
      }

      const rect = rootOverlayRef.current?.getBoundingClientRect();
      const localX = rect ? ev.clientX - rect.left : ev.clientX;
      const localY = rect ? ev.clientY - rect.top : ev.clientY;

      if (session.axis === "pivot") {
        const allCands = (session.startBodies.length > 0
          ? session.startBodies
          : session.startBody
            ? [session.startBody]
            : []
        ).flatMap((b) => b.snapCandidates);
        let closestCand = allCands[0];
        let closestDistPx = Infinity;
        for (const cand of allCands) {
          const sp = ctx.toScreen(cand.point3D);
          const d = Math.hypot(localX - sp.x, localY - sp.y);
          if (d < closestDistPx) {
            closestDistPx = d;
            closestCand = cand;
          }
        }
        if (closestDistPx < 30 && closestCand) {
          setMultiPivotMode("snap_point");
          ctx.setSubSel((prev) => ({ ...prev, activePivot3D: closestCand.point3D }));
          setSnappedPivotLabel(closestCand.label);
        } else if (session.startCenter3D) {
          const freePivot: Vec3Mm = {
            x: Number((session.startCenter3D.x + dxPx / session.pixelsPerMm).toFixed(2)),
            y: Number((session.startCenter3D.y - dyPx / session.pixelsPerMm).toFixed(2)),
            z: session.startCenter3D.z,
          };
          setMultiPivotMode("custom_draggable");
          setCustomPivot3D(freePivot);
          ctx.setSubSel((prev) => ({ ...prev, activePivot3D: freePivot }));
          setSnappedPivotLabel(
            `Pivô (${freePivot.x.toFixed(0)}, ${freePivot.y.toFixed(0)}, ${freePivot.z.toFixed(0)})`,
          );
        }
        return;
      }

      const applyLivePreview = (nextEntities: Entity[], activeIds?: string[]) => {
        session.latestPreviewEntities = nextEntities;
        if (ctx.onPreviewEntities) {
          ctx.onPreviewEntities(() => nextEntities, activeIds);
        } else if (ctx.onCommitEntities) {
          ctx.onCommitEntities(() => nextEntities, activeIds);
        }
      };

      if (
        session.axis === "rot_x" ||
        session.axis === "rot_y" ||
        session.axis === "rot_z" ||
        session.axis === "miter"
      ) {
        const pivotSc = session.pivotScreen ?? { x: localX, y: localY };
        const startRad = session.angleStartRad ?? 0;
        const compassR = session.compassRadiusPx ?? 140;

        if (session.axis === "miter") {
          const miterSnap = computeMiterDragAngleAndSnap(
            { x: localX, y: localY },
            pivotSc,
            startRad,
            session.initialValue,
            2.0,
          );
          const nextMiterDeg = miterSnap.angleDeg;
          if (nextMiterDeg !== session.lastAppliedDeltaMm) {
            if (miterSnap.snapped) {
              triggerHaptic("selection");
            }
            session.lastAppliedDeltaMm = nextMiterDeg;
            session.totalDeltaMm = nextMiterDeg;
            setDragDeltaMm(nextMiterDeg);

            const nextEntities = applyDirectMiterCut3DToEntities(
              session.startEntities,
              session.targetIds,
              ctx.miterEndTarget,
              nextMiterDeg,
              ctx.miterAxis,
            );
            applyLivePreview(nextEntities, session.targetIds);
          }
          return;
        }

        const snapRes = computeRotationDragAngleAndSnap(
          { x: localX, y: localY },
          pivotSc,
          startRad,
          compassR,
          2.5,
        );
        const deltaDeg = snapRes.angleDeg;

        setRotationSnapState({
          axis: session.axis,
          angleStartRad: startRad,
          compassRadiusPx: compassR,
          snapResult: snapRes,
        });

        if (deltaDeg !== session.lastAppliedDeltaMm) {
          if (snapRes.snapped) {
            triggerHaptic("selection");
          }
          session.lastAppliedDeltaMm = deltaDeg;
          session.totalDeltaMm = deltaDeg;
          setDragDeltaMm(deltaDeg);

          const res = applyMultiBodyRigidTransform3D(
            session.startEntities,
            session.targetIds,
            ctx.scene,
            {
              rxDeg: session.axis === "rot_x" ? deltaDeg : 0,
              ryDeg: session.axis === "rot_y" ? deltaDeg : 0,
              rzDeg: session.axis === "rot_z" ? deltaDeg : 0,
            },
            session.startCenter3D ?? null,
            ctx.copyOnTransform,
            session.copyIdMap,
          );
          session.activeResultIds = res.activeIds;
          applyLivePreview(res.updatedEntities, res.activeIds);
        }
        return;
      }

      if (session.axis === "planar") {
        const rawDeltaX = Math.round(dxPx / session.pixelsPerMm);
        const rawDeltaY = Math.round(-dyPx / session.pixelsPerMm);
        let effDelta: Vec3Mm = { x: rawDeltaX, y: rawDeltaY, z: 0 };

        const refBody = session.startBody ?? ctx.primaryBody;
        const movingSet = new Set(session.targetIds);
        if (refBody) {
          const otherBodies = ctx.scene.bodies.filter(
            (b) => !movingSet.has(b.entityId) && !session.copyIdMap.has(b.entityId),
          );
          const snapRes = resolveContactAndAlignmentSnaps3D(
            refBody,
            otherBodies,
            effDelta,
            session.pixelsPerMm,
            6.0,
            session.startCenter3D ?? ctx.subSel.activePivot3D,
          );
          // Snap Concêntrico ao Centro Geométrico (⌖) de outros perfis 3D (tolerância 8mm)
          const startPivot = session.startCenter3D ?? refBody.pivot3D;
          let matchedCentroidBody: DirectBody3D | null = null;
          let minCentroidDist = 8.0;
          for (const ob of otherBodies) {
            const distXY = Math.hypot(
              startPivot.x + effDelta.x - ob.pivot3D.x,
              startPivot.y + effDelta.y - ob.pivot3D.y,
            );
            if (distXY <= minCentroidDist) {
              minCentroidDist = distXY;
              matchedCentroidBody = ob;
            }
          }
          if (matchedCentroidBody) {
            effDelta = {
              x: Math.round(matchedCentroidBody.pivot3D.x - startPivot.x),
              y: Math.round(matchedCentroidBody.pivot3D.y - startPivot.y),
              z: 0,
            };
            setSnappedPivotLabel("⌖ Centro Geométrico");
            setActiveContactSnap(null);
          } else if (snapRes.hasContactSnap || snapRes.hasAlignmentSnap) {
            effDelta = snapRes.snappedDelta;
            setActiveContactSnap(snapRes);
          } else {
            setActiveContactSnap(null);
          }
        }

        // Verifica deslize horizontal mantendo contato com Z=0 (Edge-Triggered: NÃO re-dispara ecolocalização!)
        if (session.startBodies.length > 0) {
          const entById = new Map(session.startEntities.map((e) => [e.id, e]));
          const baseEvalXY = evaluateBaseSurfaceSnap3D(
            session.startBodies,
            0,
            baseSnapLatchedRef.current,
            0,
            entById,
            { dx: effDelta.x, dy: effDelta.y },
          );
          const echoStep = stepBaseEcholocationState3D(
            echolocationStateRef.current,
            baseEvalXY,
            performance.now(),
            0,
          );
          echolocationStateRef.current = echoStep.nextState;
          if (echoStep.triggeredNewPulse && echoStep.nextState.activePulse) {
            ctx.triggerEcholocationWavePulse(echoStep.nextState.activePulse);
          }
          setActiveBaseSnapEval(baseEvalXY.snapped ? baseEvalXY : null);
        }

        if (effDelta.x !== session.lastAppliedDeltaMm || effDelta.y !== session.totalDeltaMm) {
          session.lastAppliedDeltaMm = effDelta.x;
          session.totalDeltaMm = effDelta.y;
          setDragDeltaMm(Math.round(Math.hypot(effDelta.x, effDelta.y)));

          if (ctx.onPreviewEntities || ctx.onCommitEntities) {
            const res = applyMultiBodyRigidTransform3D(
              session.startEntities,
              session.targetIds,
              ctx.scene,
              { dx: effDelta.x, dy: effDelta.y },
              session.startCenter3D ?? null,
              ctx.copyOnTransform,
              session.copyIdMap,
            );
            session.activeResultIds = res.activeIds;
            applyLivePreview(res.updatedEntities, res.activeIds);
            if (ctx.copyOnTransform) {
              ctx.setSubSel((prev) => ({
                ...prev,
                bodyIds: res.activeIds.map((id) => `body_${id}`),
                activePivot3D: session.startCenter3D
                  ? {
                      x: session.startCenter3D.x + effDelta.x,
                      y: session.startCenter3D.y + effDelta.y,
                      z: session.startCenter3D.z,
                    }
                  : null,
              }));
            }
          } else if (ctx.onLiveTranslateSelectionXY) {
            ctx.onLiveTranslateSelectionXY(effDelta.x, effDelta.y, session.targetIds);
          }
        }
        return;
      }

      const projectedPx = dxPx * session.screenDirX + dyPx * session.screenDirY;
      const rawMm = projectedPx / session.pixelsPerMm;
      let currentDeltaMm = Math.round(rawMm);

      // Vetor 3D real do eixo ativo (WCS padrão ou OCS local quando `📦 Local` está selecionado!)
      const activeAxisVec3D: Vec3Mm =
        session.axisVec3D ??
        (session.axis === "x"
          ? { x: 1, y: 0, z: 0 }
          : session.axis === "y"
            ? { x: 0, y: 1, z: 0 }
            : { x: 0, y: 0, z: 1 });
      const isWorldAlignedAxis =
        (session.axis === "x" && Math.abs(activeAxisVec3D.x - 1) < 1e-3) ||
        (session.axis === "y" && Math.abs(activeAxisVec3D.y - 1) < 1e-3) ||
        (session.axis === "z" && Math.abs(activeAxisVec3D.z - 1) < 1e-3);

      if (session.axis === "face_normal") {
        const refFace = session.startFace ?? ctx.primaryFace;
        if (refFace) {
          const snapRes = resolveFaceStretchContactSnap(
            refFace,
            currentDeltaMm,
            ctx.scene.bodies,
            session.pixelsPerMm,
            6.0,
          );
          if (snapRes.hasSnap) {
            currentDeltaMm = snapRes.snappedOffsetMm;
            setActiveContactSnap({
              snappedDelta: {
                x: refFace.normal.x * currentDeltaMm,
                y: refFace.normal.y * currentDeltaMm,
                z: refFace.normal.z * currentDeltaMm,
              },
              hasContactSnap: true,
              hasAlignmentSnap: false,
              snapBadgeLabel: snapRes.contactHighlight?.label,
              contactHighlight: snapRes.contactHighlight,
              alignmentGuides: [],
            });
          } else {
            setActiveContactSnap(null);
          }
        }
      } else if ((session.axis === "x" || session.axis === "y") && isWorldAlignedAxis) {
        const refBody = session.startBody ?? ctx.primaryBody;
        const movingSet = new Set(session.targetIds);
        if (refBody) {
          const otherBodies = ctx.scene.bodies.filter(
            (b) => !movingSet.has(b.entityId) && !session.copyIdMap.has(b.entityId),
          );
          const startPivot = session.startCenter3D ?? refBody.pivot3D;
          let snappedToCentroid = false;
          for (const ob of otherBodies) {
            if (
              session.axis === "x" &&
              Math.abs(startPivot.x + currentDeltaMm - ob.pivot3D.x) <= 7.0
            ) {
              currentDeltaMm = Math.round(ob.pivot3D.x - startPivot.x);
              setSnappedPivotLabel("⌖ Centro Geométrico (X)");
              snappedToCentroid = true;
              break;
            }
            if (
              session.axis === "y" &&
              Math.abs(startPivot.y + currentDeltaMm - ob.pivot3D.y) <= 7.0
            ) {
              currentDeltaMm = Math.round(ob.pivot3D.y - startPivot.y);
              setSnappedPivotLabel("⌖ Centro Geométrico (Y)");
              snappedToCentroid = true;
              break;
            }
          }
          if (!snappedToCentroid) {
            setSnappedPivotLabel(null);
            const rawVec: Vec3Mm = {
              x: session.axis === "x" ? currentDeltaMm : 0,
              y: session.axis === "y" ? currentDeltaMm : 0,
              z: 0,
            };
            const snapRes = resolveContactAndAlignmentSnaps3D(
              refBody,
              otherBodies,
              rawVec,
              session.pixelsPerMm,
              6.0,
              session.startCenter3D ?? ctx.subSel.activePivot3D,
            );
            if (snapRes.hasContactSnap || snapRes.hasAlignmentSnap) {
              currentDeltaMm =
                session.axis === "x"
                  ? snapRes.snappedDelta.x
                  : snapRes.snappedDelta.y;
              setActiveContactSnap(snapRes);
            } else {
              setActiveContactSnap(null);
            }
          }
        }
      } else if (
        session.axis === "z" ||
        Math.abs(activeAxisVec3D.z) > 0.15
      ) {
        // 1. Snap Magnético de Superfície Base (Z = 0.00 mm) com Histerese (3.5mm / 5.5mm) + Ecolocalização Azul Edge-Triggered!
        const candidateDz = activeAxisVec3D.z * currentDeltaMm;
        const candidateDx = activeAxisVec3D.x * currentDeltaMm;
        const candidateDy = activeAxisVec3D.y * currentDeltaMm;
        const entById = new Map(session.startEntities.map((e) => [e.id, e]));
        const baseSnap = evaluateBaseSurfaceSnap3D(
          session.startBodies,
          candidateDz,
          baseSnapLatchedRef.current,
          0,
          entById,
          { dx: candidateDx, dy: candidateDy },
        );
        baseSnapLatchedRef.current = baseSnap.latched;

        const echoStep = stepBaseEcholocationState3D(
          echolocationStateRef.current,
          baseSnap,
          performance.now(),
          0,
        );
        echolocationStateRef.current = echoStep.nextState;
        if (echoStep.triggeredNewPulse && echoStep.nextState.activePulse) {
          triggerHaptic("selection");
          ctx.triggerEcholocationWavePulse(echoStep.nextState.activePulse);
        }

        if (baseSnap.snapped && Math.abs(activeAxisVec3D.z) > 0.5) {
          currentDeltaMm = Number(
            (baseSnap.snappedDeltaZMm / activeAxisVec3D.z).toFixed(2),
          );
          setActiveBaseSnapEval(baseSnap);
          setActiveContactSnap(null);
        } else {
          setActiveBaseSnapEval(null);
          // 2. Snap 3D entre corpos no Eixo Z (Base-Topo, Topo-Base, Topo-Topo, Base-Base)
          const refBody = session.startBody ?? ctx.primaryBody;
          const movingSet = new Set(session.targetIds);
          if (refBody && isWorldAlignedAxis) {
            const otherBodies = ctx.scene.bodies.filter(
              (b) => !movingSet.has(b.entityId) && !session.copyIdMap.has(b.entityId),
            );
            const rawVecZ: Vec3Mm = { x: 0, y: 0, z: currentDeltaMm };
            const snapResZ = resolveContactAndAlignmentSnaps3D(
              refBody,
              otherBodies,
              rawVecZ,
              session.pixelsPerMm,
              6.5,
              session.startCenter3D ?? ctx.subSel.activePivot3D,
            );
            if (snapResZ.hasContactSnap || snapResZ.hasAlignmentSnap) {
              currentDeltaMm = Math.round(snapResZ.snappedDelta.z * 100) / 100;
              setActiveContactSnap(snapResZ);
            } else {
              setActiveContactSnap(null);
            }
          } else {
            setActiveContactSnap(null);
          }
        }
      }

      if (currentDeltaMm !== session.lastAppliedDeltaMm) {
        session.lastAppliedDeltaMm = currentDeltaMm;
        session.totalDeltaMm = currentDeltaMm;
        setDragDeltaMm(currentDeltaMm);

        if (session.axis === "extrude") {
          if (ctx.booleanMode === "new_body") {
            const res = applyDirectFaceExtrude3DToEntities(
              session.startEntities,
              session.targetIds,
              Math.max(1, Math.abs(currentDeltaMm)),
              "new_body",
              session.copyIdMap,
            );
            session.activeResultIds = res.activeIds;
            applyLivePreview(res.updatedEntities, res.activeIds);
          } else {
            const nextH = Math.max(1, session.initialValue + currentDeltaMm);
            const nextEntities = applyDirectExtrudeToEntities(
              session.startEntities,
              session.targetIds,
              nextH,
              ctx.booleanMode,
            );
            applyLivePreview(nextEntities, session.targetIds);
          }
        } else if (session.axis === "face_normal") {
          const refFace = session.startFace ?? ctx.primaryFace;
          if (ctx.directTool === "shell_3d") {
            const nextWall = Math.max(
              0.5,
              Math.min(80, Math.round((session.initialValue + Math.abs(currentDeltaMm) * 0.25) * 100) / 100),
            );
            const nextEntities = applyDirectShell3DToEntities(
              session.startEntities,
              session.targetIds,
              nextWall,
              ctx.resolvedShellOpenCaps,
            );
            applyLivePreview(nextEntities, session.targetIds);
          } else if (refFace && refFace.role === "inner_side") {
            const inwardMm = Math.max(0, Math.abs(currentDeltaMm));
            const nextEntities = applyDirectOffsetFace3DToEntities(
              session.startEntities,
              session.targetIds,
              "inner_cavity",
              inwardMm,
            );
            applyLivePreview(nextEntities, session.targetIds);
          } else if (refFace && refFace.role === "bottom") {
            const nextEntities = applyDirectOffsetFace3DToEntities(
              session.startEntities,
              session.targetIds,
              "bottom",
              currentDeltaMm,
              refFace.normal,
              "ocs",
            );
            applyLivePreview(nextEntities, session.targetIds);
          } else if (refFace && (refFace.role === "top" || refFace.role === "miter")) {
            if (ctx.booleanMode === "new_body" && currentDeltaMm > 0) {
              const res = applyDirectFaceExtrude3DToEntities(
                session.startEntities,
                session.targetIds,
                currentDeltaMm,
                "new_body",
                session.copyIdMap,
              );
              session.activeResultIds = res.activeIds;
              applyLivePreview(res.updatedEntities, res.activeIds);
            } else {
              const nextEntities = applyDirectOffsetFace3DToEntities(
                session.startEntities,
                session.targetIds,
                "top",
                currentDeltaMm,
                refFace.normal,
                "ocs",
              );
              applyLivePreview(nextEntities, session.targetIds);
            }
          } else if (ctx.selectedSideFacesCount >= 2 || ctx.offsetFaceTarget === "sides") {
            const nextEntities = applyDirectOffsetFace3DToEntities(
              session.startEntities,
              session.targetIds,
              "sides",
              currentDeltaMm,
            );
            applyLivePreview(nextEntities, session.targetIds);
          } else if (refFace) {
            const nextEntities = applyDirectOffsetFace3DToEntities(
              session.startEntities,
              session.targetIds,
              "side_normal",
              currentDeltaMm,
              refFace.normal,
            );
            applyLivePreview(nextEntities, session.targetIds);
          } else {
            const nextEntities = applyDirectOffsetFace3DToEntities(
              session.startEntities,
              session.targetIds,
              "sides",
              currentDeltaMm,
            );
            applyLivePreview(nextEntities, session.targetIds);
          }
        } else if (session.axis === "vertex_bevel") {
          const refBody = session.startBody ?? ctx.primaryBody;
          const maxBevel = Math.max(
            5,
            Math.min(
              150,
              Math.min(
                refBody?.deltaX || 200,
                refBody?.deltaY || 200,
                refBody?.extrudeHeightMm || 200,
              ) * 0.45,
            ),
          );
          const nextB = Math.min(maxBevel, Math.max(0, session.initialValue + currentDeltaMm));
          const nextEntities = applyDirectFilletOrChamfer3DToEntities(
            session.startEntities,
            session.targetIds,
            "chamfer",
            nextB,
            undefined,
            session.targetBevelKeys,
          );
          applyLivePreview(nextEntities, session.targetIds);
        } else if (session.axis === "edge_diagonal") {
          if (ctx.edgeActionMode === "transform_edge") {
            const refEdge = session.startEdge ?? ctx.primaryEdge;
            const edgePerpNormal: Vec3Mm = refEdge
              ? { x: -refEdge.dir.y, y: refEdge.dir.x, z: 0 }
              : { x: 1, y: 0, z: 0 };
            const nextEntities = applyDirectOffsetFace3DToEntities(
              session.startEntities,
              session.targetIds,
              "side_normal",
              currentDeltaMm,
              edgePerpNormal,
            );
            applyLivePreview(nextEntities, session.targetIds);
          } else {
            const activeFilletChamferMode: "fillet" | "chamfer" =
              ctx.directTool === "chamfer_3d" || ctx.edgeActionMode === "chamfer"
                ? "chamfer"
                : ctx.directTool === "fillet_3d" || ctx.edgeActionMode === "fillet"
                  ? "fillet"
                  : ctx.filletOrChamferMode;
            const refBody = session.startBody ?? ctx.primaryBody;
            const maxCornerR = Math.max(
              5,
              Math.min(
                150,
                Math.min(
                  refBody?.deltaX || 200,
                  refBody?.deltaY || 200,
                  refBody?.extrudeHeightMm || 200,
                ) * 0.45,
              ),
            );
            const rawTargetVal =
              session.initialValue <= 0.5
                ? Math.abs(currentDeltaMm)
                : session.initialValue + currentDeltaMm;
            const nextR = Math.min(maxCornerR, Math.max(0, Math.round(rawTargetVal * 10) / 10));
            const nextEntities = applyDirectFilletOrChamfer3DToEntities(
              session.startEntities,
              session.targetIds,
              activeFilletChamferMode,
              nextR,
              session.targetEdgeIndices,
              session.targetBevelKeys,
            );
            applyLivePreview(nextEntities, session.targetIds);
          }
        } else if (session.axis === "x" || session.axis === "y" || session.axis === "z") {
          const deltaObj = {
            dx: Number((activeAxisVec3D.x * currentDeltaMm).toFixed(3)),
            dy: Number((activeAxisVec3D.y * currentDeltaMm).toFixed(3)),
            dz: Number((activeAxisVec3D.z * currentDeltaMm).toFixed(3)),
          };
          if (ctx.onPreviewEntities || ctx.onCommitEntities) {
            const res = applyMultiBodyRigidTransform3D(
              session.startEntities,
              session.targetIds,
              ctx.scene,
              deltaObj,
              session.startCenter3D ?? null,
              ctx.copyOnTransform,
              session.copyIdMap,
            );
            session.activeResultIds = res.activeIds;
            applyLivePreview(res.updatedEntities, res.activeIds);
            if (ctx.copyOnTransform) {
              ctx.setSubSel((prev) => ({
                ...prev,
                bodyIds: res.activeIds.map((id) => `body_${id}`),
                activePivot3D: session.startCenter3D
                  ? {
                      x: session.startCenter3D.x + deltaObj.dx,
                      y: session.startCenter3D.y + deltaObj.dy,
                      z: session.startCenter3D.z + deltaObj.dz,
                    }
                  : null,
              }));
            }
          } else if (session.axis === "z" && ctx.onLiveElevateSelection && ctx.selected[0]) {
            ctx.onLiveElevateSelection(session.initialValue + currentDeltaMm);
          } else if (ctx.onLiveTranslateSelectionXY) {
            ctx.onLiveTranslateSelectionXY(deltaObj.dx, deltaObj.dy, session.targetIds);
          }
        }
      }
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      if (session.pointerId !== undefined && ev.pointerId !== session.pointerId) return;
      setActiveContactSnap(null);
      setActiveBaseSnapEval(null);
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();

      const ctx = latestDragContextRef.current;
      const distPx = Math.hypot(
        ev.clientX - session.startClientX,
        ev.clientY - session.startClientY,
      );
      const isQuickTap = !session.hasMoved && distPx < 5;

      // COMMIT ATÔMICO NO HISTÓRICO (UNDO/REDO): grava apenas 1 snapshot ao soltar o dedo
      if (!isQuickTap && session.hasMoved && session.latestPreviewEntities && ctx.onCommitAtomicDrag) {
        ctx.onCommitAtomicDrag(
          session.startEntities,
          session.latestPreviewEntities,
          session.activeResultIds,
        );
      }

      if (
        session.axis === "rot_x" ||
        session.axis === "rot_y" ||
        session.axis === "rot_z"
      ) {
        setCompassFadingOut(true);
        if (compassFadeTimerRef.current !== null) {
          window.clearTimeout(compassFadeTimerRef.current);
        }
        compassFadeTimerRef.current = window.setTimeout(() => {
          setCompassFadingOut(false);
          setRotationSnapState(null);
          compassFadeTimerRef.current = null;
        }, 180);
      }

      if (isQuickTap) {
        triggerHaptic("selection");
        if (session.axis === "x") {
          ctx.openFloatingNumpad("DISTANCE", "DESLOCAMENTO +X", "mm", 0, "moveX", session.targetIds[0]);
        } else if (session.axis === "y") {
          ctx.openFloatingNumpad("DISTANCE", "DESLOCAMENTO +Y", "mm", 0, "moveY", session.targetIds[0]);
        } else if (session.axis === "extrude" || session.axis === "face_normal") {
          const refFace = session.startFace ?? ctx.primaryFace;
          if (refFace && refFace.role !== "top" && refFace.role !== "miter") {
            ctx.openFloatingNumpad(
              "OFFSET",
              "OFFSET FACE",
              "mm",
              25,
              "offsetFaceDistance",
              session.targetIds[0],
              refFace.role === "bottom" ? "bottom" : "side_normal",
            );
          } else {
            ctx.openFloatingNumpad(
              "EXTRUSION",
              "EXTRUDE / OFFSET",
              "mm",
              ctx.primaryBody?.extrudeHeightMm ?? 500,
              "extrudeHeight",
              session.targetIds[0],
            );
          }
        } else if (session.axis === "vertex_bevel") {
          ctx.openFloatingNumpad(
            "CHAMFER",
            "BISEL DO VÉRTICE (45°)",
            "mm",
            session.initialValue || 10,
            "chamferDistance",
            session.targetIds[0],
          );
        } else if (session.axis === "edge_diagonal") {
          if (ctx.edgeActionMode === "transform_edge") {
            ctx.openFloatingNumpad(
              "OFFSET",
              "MOVER ARESTA",
              "mm",
              25,
              "offsetFaceDistance",
              session.targetIds[0],
              "side_normal",
            );
          } else {
            ctx.openFloatingNumpad(
              ctx.filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
              ctx.filletOrChamferMode === "fillet" ? "RAIO DA ARESTA" : "CHANFRO DA ARESTA (45°)",
              "mm",
              session.initialValue || 10,
              ctx.filletOrChamferMode === "fillet" ? "filletRadius" : "chamferDistance",
              session.targetIds[0],
            );
          }
        } else if (session.axis === "z") {
          ctx.openFloatingNumpad(
            "DISTANCE",
            "DESLOCAMENTO +Z",
            "mm",
            0,
            "moveZ",
            session.targetIds[0],
          );
        } else if (
          session.axis === "rot_x" ||
          session.axis === "rot_y" ||
          session.axis === "rot_z" ||
          session.axis === "miter"
        ) {
          const subRot =
            session.axis === "rot_x"
              ? "rx"
              : session.axis === "rot_y"
                ? "ry"
                : session.axis === "rot_z"
                  ? "rz"
                  : ctx.miterEndTarget;
          ctx.openFloatingNumpad(
            "ANGLE",
            session.axis === "miter" ? "CORTE ESQUADRIA" : `ROTAÇÃO ${subRot.toUpperCase()}`,
            "°",
            45,
            "miterAngle",
            session.targetIds[0],
            subRot,
          );
        }
      } else {
        triggerHaptic("action");
        if (
          (session.axis === "rot_x" ||
            session.axis === "rot_y" ||
            session.axis === "rot_z") &&
          session.startCenter3D
        ) {
          setLastCompletedDrag({
            axis: session.axis,
            deltaMm: session.lastAppliedDeltaMm,
            startPoint3D: session.startCenter3D,
            endPoint3D: session.startCenter3D,
            startEntities: session.startEntities,
            targetIds: session.targetIds,
            activeResultIds: session.activeResultIds,
            copyMode: ctx.copyOnTransform,
            copyIdMap: new Map(session.copyIdMap),
            initialValue: session.initialValue,
            angleStartRad: session.angleStartRad ?? 0,
            compassRadiusPx: session.compassRadiusPx ?? 140,
          });
        } else if (
          (session.axis === "x" ||
            session.axis === "y" ||
            session.axis === "z" ||
            session.axis === "face_normal" ||
            session.axis === "extrude") &&
          Math.abs(session.lastAppliedDeltaMm) > 0 &&
          session.startCenter3D
        ) {
          const dVal = session.lastAppliedDeltaMm;
          const refFace = session.startFace ?? ctx.primaryFace;
          const startPt =
            (session.axis === "face_normal" || session.axis === "extrude") && refFace
              ? refFace.centroid
              : session.startCenter3D;
          const endPt: Vec3Mm =
            (session.axis === "face_normal" || session.axis === "extrude") && refFace
              ? {
                  x: startPt.x + refFace.normal.x * dVal,
                  y: startPt.y + refFace.normal.y * dVal,
                  z: startPt.z + refFace.normal.z * dVal,
                }
              : {
                  x: startPt.x + (session.axis === "x" ? dVal : 0),
                  y: startPt.y + (session.axis === "y" ? dVal : 0),
                  z: startPt.z + (session.axis === "z" ? dVal : 0),
                };

          setLastCompletedDrag({
            axis: session.axis,
            deltaMm: dVal,
            startPoint3D: startPt,
            endPoint3D: endPt,
            startEntities: session.startEntities,
            targetIds: session.targetIds,
            activeResultIds: session.activeResultIds,
            copyMode: ctx.copyOnTransform,
            copyIdMap: new Map(session.copyIdMap),
            initialValue: session.initialValue,
            faceRole: refFace?.role,
            faceNormal: refFace?.normal,
          });
        }
      }

      dragSessionRef.current = null;
      setActiveAxis(null);
      setDragDeltaMm(0);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerUp, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [activeAxis]);

  const is3DEnvironment = activeMode === "3d" || isTilted3D;

  // Metadados enxutos da Pílula de Comando Ativo no Topo Central (Seção 3)
  const activePillMeta = useMemo(() => {
    const hVal = primaryBody?.extrudeHeightMm ?? sheetThickness;
    const rVal =
      edgeDiagonalGizmo?.currentFilletVal ?? primaryBody?.edgeFilletRadiusMm ?? 10;
    const dVal =
      vertexBevelGizmo?.currentBevelMm ??
      edgeDiagonalGizmo?.currentChamferVal ??
      primaryBody?.edgeChamferDistMm ??
      10;
    const wVal = primaryBody?.shellThicknessMm || 6;
    const angVal =
      miterEndTarget === "top"
        ? (primaryBody?.miterCutTopDeg || 45)
        : (primaryBody?.miterCutBottomDeg || 45);

    switch (directTool) {
      case "extrude_3d":
        return {
          icon: Box,
          label: "Extrude 3D",
          valueText: `${hVal.toFixed(1)} mm`,
        };
      case "fillet_3d":
      case "chamfer_3d":
        return {
          icon: Sparkles,
          label: filletOrChamferMode === "fillet" ? "Fillet 3D" : "Chamfer 3D",
          valueText:
            filletOrChamferMode === "fillet"
              ? `R ${rVal.toFixed(1)} mm`
              : `D ${dVal.toFixed(1)} mm`,
        };
      case "shell_3d":
        return {
          icon: Layers,
          label: "Shell / Casca 3D",
          valueText: `${(primaryBody?.shellThicknessMm || primaryBody?.shellWallThicknessMm || 4.75).toFixed(2).replace(/\.00$/, "")} mm`,
        };
      case "offset_face_3d":
        return {
          icon: CornerDownRight,
          label: "Offset Face 3D",
          valueText: "+25.0 mm",
        };
      case "rotate_axis_3d":
        return {
          icon: Compass,
          label: "Corte 45° (Esquadria)",
          valueText: `${angVal.toFixed(0)}°`,
        };
      case "transform_3d":
        return {
          icon: Move,
          label: "Mover / Girar 3D",
          valueText:
            lastCompletedDrag &&
            (lastCompletedDrag.axis === "rot_x" ||
              lastCompletedDrag.axis === "rot_y" ||
              lastCompletedDrag.axis === "rot_z")
              ? `${lastCompletedDrag.deltaMm >= 0 ? `+${lastCompletedDrag.deltaMm}` : lastCompletedDrag.deltaMm}°`
              : `${lastCompletedDrag?.deltaMm ?? "0.0"} mm`,
        };
      case "mirror_3d":
        return {
          icon: FlipHorizontal,
          label: "Espelhar 3D",
          valueText: "Eixo X/Y/Z",
        };
      case "array_3d":
        return smartArrayPanelTab === "miter_frame"
          ? {
              icon: Layers,
              label: "Array 3D / Quadro 45°",
              valueText: `${smartMiterFrameCalc.members.length} Peças (${smartFrameWidthMm} × ${smartFrameHeightMm})`,
            }
          : {
              icon: Layers,
              label: "Array 3D / Grade",
              valueText: `${smartArrayCount} Tubos`,
            };
      case "scale_3d":
      case "align_3d":
        return {
          icon: Maximize2,
          label: "Escalar / Alinhar 3D",
          valueText: "1.00×",
        };
      case "color_material_3d":
        return {
          icon: Palette,
          label: "Inspecionar / Seção / BOM",
          valueText: sectionPlaneState.enabled
            ? `Seção ${sectionPlaneState.axis.toUpperCase()}=${sectionPlaneState.offsetMm}mm`
            : `${scene.bodies.length} Peça(s)`,
        };
      case "sketch_on_face_3d":
        return {
          icon: PenTool,
          label: "Sketch na Face",
          valueText: `Z=${(primaryFace?.centroid.z ?? hVal).toFixed(0)}mm`,
        };
      case "revolve_3d":
        return {
          icon: RotateCw,
          label: "Revolve 3D",
          valueText: `${revolveAngleDeg}° (${revolveAxis.toUpperCase()})`,
        };
      case "sweep_3d":
        return {
          icon: Compass,
          label: "Sweep 3D",
          valueText: sweepPathPreset === "arc90" ? "Arco 90° R120" : sweepPathPreset === "straight" ? "Reto 250mm" : "Curva S",
        };
      case "hole_3d":
        return {
          icon: CircleDot,
          label: "Furação ISO 3D",
          valueText: holeType3D.toUpperCase(),
        };
      case "project_3d":
        return {
          icon: Layers,
          label: "Project 3D → 2D",
          valueText: "Esboço 2D",
        };
      case "create_drawing_3d":
        return {
          icon: FileText,
          label: "Vistas Técnicas 2D",
          valueText: "4 Vistas + Cotas",
        };
      default:
        return null;
    }
  }, [
    directTool,
    primaryBody,
    sheetThickness,
    filletOrChamferMode,
    miterEndTarget,
    copyOnTransform,
    primaryFace,
    edgeDiagonalGizmo,
    vertexBevelGizmo,
    revolveAngleDeg,
    revolveAxis,
    sweepPathPreset,
    holeType3D,
    sectionPlaneState.enabled,
    sectionPlaneState.axis,
    sectionPlaneState.offsetMm,
    scene.bodies.length,
    lastCompletedDrag,
    smartArrayPanelTab,
    smartMiterFrameCalc.members.length,
    smartFrameWidthMm,
    smartFrameHeightMm,
    smartArrayCount,
  ]);

  // Estilos adaptados 100% ao Tema Ativo (Claro #FFFFFF / Escuro #0B1220 / AMOLED #05080F)
  const themeSurfaceStyle: React.CSSProperties = {
    backgroundColor: "var(--chamfer-popover-bg, " + (isDark ? "#0B1220" : "#FFFFFF") + ")",
    borderColor: "var(--chamfer-border, " + (isDark ? "#1E293B" : "#CBD5E1") + ")",
    color: "var(--chamfer-text-primary, " + (isDark ? "#F8FAFC" : "#0F172A") + ")",
  };

  const pillBtnClass = (isActive: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1 font-mono text-[10.5px] font-bold transition-colors cursor-pointer whitespace-nowrap",
      isActive
        ? "border-cyan-500 bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 shadow-2xs"
        : isDark
          ? "border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-slate-600 hover:text-white"
          : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-950",
    );

  return (
    <div
      ref={rootOverlayRef}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      className="pointer-events-none absolute inset-0 z-25 overflow-hidden select-none"
    >
      {/* =====================================================================
          0. PÍLULA SUPERIOR DISCRETA NO MODO SELEÇÃO 3D (ESCOPO + CRIADOR DE PERFIS 3D)
          ===================================================================== */}
      {is3DEnvironment && directTool === "select_3d" && !isLoftActive && (
        <div
          data-testid="chamfer-3d-select-quick-bar"
          style={{
            ...themeSurfaceStyle,
            top: activeMode === "3d" ? "10px" : "34px",
            maxWidth: "calc(100% - 28px)",
          }}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            const el = ev.currentTarget;
            el.dataset.dragStartX = String(ev.clientX);
            el.dataset.dragStartScroll = String(el.scrollLeft);
            el.dataset.isDragging = "1";
          }}
          onPointerMove={(ev) => {
            const el = ev.currentTarget;
            if (el.dataset.isDragging !== "1") return;
            const dx = ev.clientX - Number(el.dataset.dragStartX || 0);
            if (Math.abs(dx) > 4) {
              el.scrollLeft = Number(el.dataset.dragStartScroll || 0) - dx;
            }
          }}
          onPointerUp={(ev) => {
            ev.currentTarget.dataset.isDragging = "0";
          }}
          onPointerCancel={(ev) => {
            ev.currentTarget.dataset.isDragging = "0";
          }}
          onClick={(ev) => ev.stopPropagation()}
          className={cn(
            "pointer-events-auto absolute left-1/2 z-30 flex h-[34px] -translate-x-1/2 items-center gap-1 overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing rounded-full border px-2.5 py-0.5 shadow-md backdrop-blur-md transition-opacity duration-150",
            fluxState.isManipulating && "opacity-0 pointer-events-none",
          )}
        >
          <span className="shrink-0 font-mono text-[9.5px] font-bold text-cyan-400">
            SEL 3D:
          </span>
          {(
            [
              { id: "vertex" as const, label: "Vértice" },
              { id: "edge" as const, label: "Aresta" },
              { id: "face" as const, label: "Face" },
              { id: "body" as const, label: "Peça Inteira" },
            ] as const
          ).map((sc) => {
            const isActiveScope =
              selectionScope === sc.id ||
              (selectionScope === "auto" && selectionKind3D === sc.id);
            return (
              <button
                key={sc.id}
                type="button"
                data-testid={`chamfer-3d-scope-${sc.id}`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  triggerHaptic("selection");
                  const targetB = primaryBody ?? scene.bodies[0] ?? null;
                  if (sc.id === "body" && targetB) {
                    const expandedIds = expandBodyIdsWithAssemblyGroup3D(
                      subSel.bodyIds.length > 0 ? subSel.bodyIds : [targetB.bodyId],
                      scene,
                      entities,
                    ).bodyIds;
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: expandedIds,
                      selectionScope: "body",
                      activePivot3D: targetB.pivot3D,
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.(
                      expandedIds.map((bId) => bId.replace(/^body_/, "")),
                    );
                  } else {
                    setSubSel((prev) => ({
                      ...prev,
                      selectionScope: prev.selectionScope === sc.id ? "auto" : sc.id,
                    }));
                  }
                }}
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold transition-colors cursor-pointer whitespace-nowrap",
                  isActiveScope
                    ? "border-cyan-400 bg-cyan-500/25 text-cyan-300"
                    : "border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:text-white",
                )}
              >
                {sc.label}
              </button>
            );
          })}
          <span className="mx-0.5 h-3 w-px shrink-0 bg-slate-500/30" />
          {/* Atalhos Táteis Mobile-First de Multi-Seleção Inteligente */}
          <button
            type="button"
            data-testid="chamfer-3d-multiselect-toggle-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setMultiSelectAddMode((m) => !m);
            }}
            title="Modo Adição Tátil (+ Multi): Toque em vários corpos 3D para acumular ou alternar na seleção sem precisar de Shift"
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold transition-colors cursor-pointer whitespace-nowrap",
              multiSelectAddMode
                ? isDark
                  ? "border-sky-400 bg-sky-500/30 text-sky-200"
                  : "border-sky-600 bg-sky-600 text-white"
                : isDark
                  ? "border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-sky-400 hover:text-white"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:border-sky-500 hover:text-slate-900",
            )}
          >
            + Multi
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-marquee-box-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setMarqueeModeActive((m) => !m);
              setMarqueeRectState(null);
            }}
            title="Seleção em Caixa (⬚ Caixa): Arraste Esq➔Dir para Janela (100% dentro) ou Dir➔Esq para Cruzamento (tocados)"
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold transition-colors cursor-pointer whitespace-nowrap",
              marqueeModeActive
                ? isDark
                  ? "border-cyan-400 bg-cyan-500/30 text-cyan-200"
                  : "border-cyan-600 bg-cyan-600 text-white"
                : isDark
                  ? "border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-cyan-400 hover:text-white"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:border-cyan-500 hover:text-slate-900",
            )}
          >
            ⬚ Caixa
          </button>
          {scene.bodies.length >= 2 && (
            <button
              type="button"
              data-testid="chamfer-3d-same-profile-btn"
              onClick={(ev) => {
                ev.stopPropagation();
                triggerHaptic("action");
                const refBody = primaryBody ?? scene.bodies[0]!;
                const rawSameIds = selectBodiesWithSameProfile3D(
                  refBody,
                  scene.bodies,
                  new Map(entities.map((e) => [e.id, e])),
                ).map((b) => b.bodyId);
                const expandedIds = expandBodyIdsWithAssemblyGroup3D(
                  rawSameIds,
                  scene,
                  entities,
                ).bodyIds;
                setSubSel({
                  faceIds: [],
                  edgeIds: [],
                  vertexIds: [],
                  bodyIds: expandedIds,
                  selectionScope: "body",
                  activePivot3D: refBody.pivot3D,
                  activeHingeEdgeId: null,
                });
                onSelectEntities?.(expandedIds.map((bId) => bId.replace(/^body_/, "")));
              }}
              title="Selecionar automaticamente todos os corpos com a mesma seção transversal e espessura de parede"
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer whitespace-nowrap",
                isDark
                  ? "border-sky-500/45 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300"
                  : "border-sky-600/45 bg-sky-500/15 hover:bg-sky-500/25 text-sky-800",
              )}
            >
              ≈ Mesmo Perfil
            </button>
          )}
          {scene.bodies.length >= 1 && (
            <button
              type="button"
              data-testid="chamfer-3d-select-all-bodies-btn"
              onClick={(ev) => {
                ev.stopPropagation();
                triggerHaptic("selection");
                const allBodyIds = scene.bodies.map((b) => b.bodyId);
                setSubSel({
                  faceIds: [],
                  edgeIds: [],
                  vertexIds: [],
                  bodyIds: allBodyIds,
                  selectionScope: "body",
                  activePivot3D: scene.bodies[0]?.pivot3D ?? { x: 0, y: 0, z: 0 },
                  activeHingeEdgeId: null,
                });
                onSelectEntities?.(scene.bodies.map((b) => b.entityId));
              }}
              title="Selecionar todos os corpos 3D da cena"
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer whitespace-nowrap",
                isDark
                  ? "border-slate-700/70 bg-slate-900/70 hover:border-cyan-400 text-slate-200"
                  : "border-slate-300 bg-slate-100 hover:border-cyan-600 text-slate-800",
              )}
            >
              ☑️ Tudo
            </button>
          )}
          {(subSel.bodyIds.length > 0 ||
            subSel.faceIds.length > 0 ||
            subSel.edgeIds.length > 0 ||
            vertexIds.length > 0) && (
            <button
              type="button"
              data-testid="chamfer-3d-clear-selection-btn"
              onClick={(ev) => {
                ev.stopPropagation();
                triggerHaptic("tap");
                setLastCompletedDrag(null);
                setSubSel({
                  faceIds: [],
                  edgeIds: [],
                  vertexIds: [],
                  bodyIds: [],
                  selectionScope: "auto",
                  activePivot3D: null,
                  activeHingeEdgeId: null,
                });
                onSelectEntities?.([]);
              }}
              title="Limpar seleção ativa"
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer whitespace-nowrap",
                isDark
                  ? "border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300"
                  : "border-rose-500/45 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700",
              )}
            >
              ✕ Limpar
            </button>
          )}
          <span className="mx-0.5 h-3 w-px shrink-0 bg-slate-500/30" />
          <button
            type="button"
            data-testid="chamfer-3d-add-profile-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setProfile3DCreatorOpen((o) => !o);
            }}
            title="Criar e Alinhar Perfis 3D Fechados no Plano Z (Retângulo, Polígono 3..12 lados, Círculo)"
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer whitespace-nowrap transition-colors",
              profile3DCreatorOpen
                ? "border-sky-400 bg-sky-500/30 text-sky-200"
                : "border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300",
            )}
          >
            + Perfil 3D ⌖
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-demo-structure-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("action");
              const benchmark = executeMetalStructure10StepBenchmark(10);
              onCommitEntities?.(
                () => benchmark.entities,
                benchmark.entities.map((e) => e.id),
              );
              const firstBody = benchmark.scene.bodies[0];
              if (firstBody) {
                setSubSel({
                  faceIds: [],
                  edgeIds: [],
                  vertexIds: [],
                  bodyIds: [firstBody.bodyId],
                  selectionScope: "body",
                  activePivot3D: firstBody.pivot3D,
                  activeHingeEdgeId: null,
                });
              }
            }}
            title="Construir Estrutura Metálica Industrial Completa (10 Passos: Colunas Metalon 100×50×490, Fillet R10, Shell 6mm, Quadro 45°, Mãos-Francesas e 4 Sapatas)"
            className="shrink-0 rounded-full border border-cyan-500/50 bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-cyan-300 cursor-pointer whitespace-nowrap"
          >
            ▶ Demo 10 Passos
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-demo-sheetmetal-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("action");
              const chapaDemo = executeDemoChapaCaldeiraria3D(2, 2, 0.33);
              onCommitEntities?.(
                () => chapaDemo.entities3D,
                chapaDemo.entities3D.map((e) => e.id),
              );
              const firstEntity = chapaDemo.entities3D[0];
              if (firstEntity) {
                setSubSel({
                  faceIds: [],
                  edgeIds: [],
                  vertexIds: [],
                  bodyIds: [`body_${firstEntity.id}`],
                  selectionScope: "body",
                  activePivot3D: { x: 0, y: 0, z: 40 },
                  activeHingeEdgeId: null,
                });
              }
            }}
            title="▶ Demo Chapa: Suporte Dobrado 90° em Chapa #14 (t=2mm, R=2mm, K=0.33, BA=4.178mm) com Furação e Planificação"
            className="shrink-0 rounded-full border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-300 cursor-pointer whitespace-nowrap"
          >
            ▶ Demo Chapa
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-quick-section-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setSectionPlaneState((s) => ({ ...s, enabled: !s.enabled }));
              setDirectTool("color_material_3d");
            }}
            title="Ativar / Desativar Plano de Corte em Seção (Section Plane X/Y/Z) com Hachura ao Vivo"
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer whitespace-nowrap",
              sectionPlaneState.enabled
                ? "border-rose-400 bg-rose-500/25 text-rose-200"
                : "border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300",
            )}
          >
            ✂ Seção
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-quick-cutlist-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setCutListModalOpen((o) => !o);
            }}
            title="Abrir Lista de Corte Estrutural, BOM 3D, Interferência e Caldeiraria (BA / Tronco de Cone)"
            className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 px-2 py-0.5 font-mono text-[9.5px] font-bold text-violet-300 cursor-pointer whitespace-nowrap"
          >
            📋 BOM / Corte
          </button>
          {scene.bodies.length > 0 && (
            <button
              type="button"
              data-testid="chamfer-3d-quick-drawing-btn"
              onClick={(ev) => {
                ev.stopPropagation();
                triggerHaptic("action");
                const views = generateTechnicalDrawingViews2DFrom3D(scene);
                if (views.length > 0) {
                  onCommitEntities?.(
                    (prev) => [...prev, ...views],
                    views.map((v) => v.id),
                  );
                }
              }}
              title="Create Drawing / Projetar Vistas Técnicas Padronizadas no 2D"
              className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-0.5 font-mono text-[9.5px] font-bold text-emerald-300 cursor-pointer whitespace-nowrap"
            >
              Vistas 2D
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          0A-MULTI. BARRA CONTEXTUAL DE MULTI-SELEÇÃO DE CORPOS E MONTAGEM LÓGICA
          ===================================================================== */}
      {is3DEnvironment &&
        directTool === "select_3d" &&
        !isLoftActive &&
        selectedBodiesList.length >= 2 &&
        !fluxState.isManipulating && (() => {
          const selectedEntIds = selectedBodiesList.map((b) => b.entityId);
          const groupIds = new Set(
            selectedBodiesList
              .map((b) => {
                const ent = entities.find((e) => e.id === b.entityId);
                return ent ? getEntityAssemblyGroupId(ent) : null;
              })
              .filter(Boolean),
          );
          const hasSharedAssemblyGroup =
            groupIds.size === 1 &&
            selectedBodiesList.every((b) => {
              const ent = entities.find((e) => e.id === b.entityId);
              return Boolean(ent && getEntityAssemblyGroupId(ent));
            });

          return (
            <div
              data-testid="chamfer-3d-multiselect-action-bar"
              style={{
                ...themeSurfaceStyle,
                top: activeMode === "3d" ? "48px" : "72px",
                maxWidth: "calc(100% - 28px)",
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => ev.stopPropagation()}
              className="pointer-events-auto absolute left-1/2 z-30 flex h-[34px] -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none touch-pan-x rounded-full border border-sky-500/55 px-3 py-0.5 shadow-lg backdrop-blur-md"
            >
              <span className="shrink-0 font-mono text-[10px] font-extrabold text-sky-400 whitespace-nowrap">
                {selectedBodiesList.length} CORPOS
              </span>
              <span className="h-3 w-px shrink-0 bg-slate-500/35" />
              <button
                type="button"
                data-testid="chamfer-3d-multiselect-move-btn"
                onClick={() => {
                  triggerHaptic("selection");
                  setCopyOnTransform(false);
                  setDirectTool("transform_3d");
                }}
                className={pillBtnClass(false)}
              >
                Mover / Girar
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-multiselect-copy-btn"
                onClick={() => {
                  triggerHaptic("selection");
                  setCopyOnTransform(true);
                  setDirectTool("transform_3d");
                }}
                className={pillBtnClass(copyOnTransform)}
              >
                Copiar Conjunto
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-multiselect-group-btn"
                onClick={() => {
                  triggerHaptic("action");
                  if (hasSharedAssemblyGroup) {
                    onCommitEntities?.(
                      (prev) => ungroupAssemblyEntities3D(prev, selectedEntIds).updatedEntities,
                      selectedEntIds,
                    );
                  } else {
                    onCommitEntities?.(
                      (prev) =>
                        applyAssemblyGroupToEntities3D(
                          prev,
                          selectedEntIds,
                          `Subconjunto (${selectedBodiesList.length} peças)`,
                        ).updatedEntities,
                      selectedEntIds,
                    );
                  }
                }}
                title="Agrupar Montagem Lógica (Assembly Group): mantém cada peça individual na Lista de Corte / BOM!"
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap",
                  hasSharedAssemblyGroup
                    ? isDark
                      ? "border-amber-400/70 bg-amber-500/20 text-amber-200"
                      : "border-amber-600/60 bg-amber-500/15 text-amber-800"
                    : isDark
                      ? "border-sky-400/70 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30"
                      : "border-sky-600/60 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25",
                )}
              >
                {hasSharedAssemblyGroup ? "🔗 Desagrupar" : "🔗 Agrupar"}
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-multiselect-boolean-union-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const primaryId = selectedEntIds[0]!;
                  onCommitEntities?.((prev) => {
                    const res = applyDirectBoolean3DBetweenBodies(prev, selectedEntIds, "union");
                    return res.updatedEntities;
                  }, [primaryId]);
                  setSubSel({
                    faceIds: [],
                    edgeIds: [],
                    vertexIds: [],
                    bodyIds: [`body_${primaryId}`],
                    selectionScope: "body",
                    activePivot3D: primaryBody?.pivot3D ?? { x: 0, y: 0, z: 0 },
                    activeHingeEdgeId: null,
                  });
                }}
                title="União Booleana Real (Boolean Union): funde os sólidos selecionados em 1 único corpo"
                className={pillBtnClass(false)}
              >
                ⊕ Unir
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-multiselect-drop-base-btn"
                onClick={() => {
                  triggerHaptic("action");
                  let droppedSnap: BaseSurfaceSnapEvaluation3D | null = null;
                  onCommitEntities?.((prev) => {
                    const prevScene = buildDirectTopology3DScene(prev, sheetThickness);
                    const res = applyDropBodiesToBaseZ0(prev, selectedEntIds, prevScene);
                    droppedSnap = res.snapEval;
                    return res.updatedEntities;
                  }, selectedEntIds);
                  if (droppedSnap) {
                    const step = stepBaseEcholocationState3D(
                      {
                        isInBaseContact: false,
                        armed: true,
                        pulseCounter: echolocationStateRef.current.pulseCounter,
                        activePulse: null,
                      },
                      { ...(droppedSnap as BaseSurfaceSnapEvaluation3D), snapped: true },
                      performance.now(),
                    );
                    echolocationStateRef.current = step.nextState;
                    if (step.triggeredNewPulse && step.nextState.activePulse) {
                      triggerEcholocationWavePulse(step.nextState.activePulse);
                    }
                  }
                }}
                title="Pousar conjunto selecionado exatamente sobre o plano Base Z = 0.00 mm"
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold cursor-pointer whitespace-nowrap transition-colors",
                  isDark
                    ? "border-cyan-400/60 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200"
                    : "border-sky-600/60 bg-sky-500/15 hover:bg-sky-500/25 text-sky-800",
                )}
              >
                ⤓ Base
              </button>
            </div>
          );
        })()}

      {/* =====================================================================
          0A-MARQUEE. OVERLAY INTERATIVO DE SELEÇÃO EM CAIXA (WINDOW vs CROSSING)
          ===================================================================== */}
      {is3DEnvironment && marqueeModeActive && (
        <div
          data-testid="chamfer-3d-marquee-overlay"
          style={{ touchAction: "none" }}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            const rect = rootOverlayRef.current?.getBoundingClientRect();
            const x = ev.clientX - (rect?.left ?? 0);
            const y = ev.clientY - (rect?.top ?? 0);
            setMarqueeRectState({
              start: { x, y },
              current: { x, y },
              additive: multiSelectAddMode || ev.shiftKey,
            });
          }}
          onPointerMove={(ev) => {
            if (!marqueeRectState) return;
            ev.stopPropagation();
            const rect = rootOverlayRef.current?.getBoundingClientRect();
            const x = ev.clientX - (rect?.left ?? 0);
            const y = ev.clientY - (rect?.top ?? 0);
            setMarqueeRectState((prev) =>
              prev ? { ...prev, current: { x, y } } : null,
            );
          }}
          onPointerUp={(ev) => {
            if (!marqueeRectState) return;
            ev.stopPropagation();
            const res = evaluateMarqueeBoxSelection3D(
              marqueeRectState.start,
              marqueeRectState.current,
              scene.bodies,
              toScreen,
            );
            const expandedHitIds = expandBodyIdsWithAssemblyGroup3D(
              res.matchedBodyIds,
              scene,
              entities,
            ).bodyIds;
            const finalBodyIds = marqueeRectState.additive
              ? Array.from(new Set([...subSel.bodyIds, ...expandedHitIds]))
              : expandedHitIds;
            setSubSel({
              faceIds: [],
              edgeIds: [],
              vertexIds: [],
              bodyIds: finalBodyIds,
              selectionScope: "body",
              activePivot3D:
                scene.bodiesById.get(finalBodyIds[0] ?? "")?.pivot3D ?? null,
              activeHingeEdgeId: null,
            });
            onSelectEntities?.(finalBodyIds.map((bId) => bId.replace(/^body_/, "")));
            setMarqueeRectState(null);
            setMarqueeModeActive(false);
            triggerHaptic("action");
          }}
          className="pointer-events-auto absolute inset-0 z-40 cursor-crosshair select-none"
        >
          <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full border border-cyan-400/60 bg-slate-950/85 px-3 py-1 font-mono text-[10px] font-bold text-cyan-200 shadow-lg">
            ⬚ Arraste Esq➔Dir: Janela (100% dentro) · Dir➔Esq: Cruzamento (tocados)
          </div>
          {marqueeRectState && (() => {
            const isWindow = marqueeRectState.current.x >= marqueeRectState.start.x;
            const left = Math.min(marqueeRectState.start.x, marqueeRectState.current.x);
            const top = Math.min(marqueeRectState.start.y, marqueeRectState.current.y);
            const w = Math.max(2, Math.abs(marqueeRectState.current.x - marqueeRectState.start.x));
            const h = Math.max(2, Math.abs(marqueeRectState.current.y - marqueeRectState.start.y));
            return (
              <div
                data-testid="chamfer-3d-marquee-box-rect"
                style={{ left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` }}
                className={cn(
                  "pointer-events-none absolute rounded-xs",
                  isWindow
                    ? "border-2 border-sky-400 bg-sky-500/15"
                    : "border-2 border-dashed border-cyan-300 bg-cyan-400/15",
                )}
              >
                <span className="absolute -top-5 left-0 whitespace-nowrap font-mono text-[9.5px] font-bold text-sky-300">
                  {isWindow ? "Janela (100% Dentro)" : "Cruzamento (Tocados)"}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* =====================================================================
          0B. BANNER SUPERIOR DO COMANDO "LOFT" NO MODO CAD 3D (SELEÇÃO SEQUENCIAL 1 ➔ 2 ➔ 3)
          ===================================================================== */}
      {is3DEnvironment && isLoftActive && (
        <div
          data-testid="chamfer-3d-loft-top-prompt"
          style={{
            ...themeSurfaceStyle,
            top: activeMode === "3d" ? "10px" : "34px",
            maxWidth: "calc(100% - 24px)",
          }}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            const el = ev.currentTarget;
            el.dataset.dragStartX = String(ev.clientX);
            el.dataset.dragStartScroll = String(el.scrollLeft);
            el.dataset.isDragging = "1";
          }}
          onPointerMove={(ev) => {
            const el = ev.currentTarget;
            if (el.dataset.isDragging !== "1") return;
            const dx = ev.clientX - Number(el.dataset.dragStartX || 0);
            if (Math.abs(dx) > 4) {
              el.scrollLeft = Number(el.dataset.dragStartScroll || 0) - dx;
            }
          }}
          onPointerUp={(ev) => {
            ev.currentTarget.dataset.isDragging = "0";
          }}
          onPointerCancel={(ev) => {
            ev.currentTarget.dataset.isDragging = "0";
          }}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 z-30 flex h-[38px] -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing rounded-full border border-sky-500/60 px-3 py-1 shadow-lg backdrop-blur-md"
        >
          <span className="shrink-0 font-mono text-[10px] font-bold text-sky-300 whitespace-nowrap">
            LOFT | Selecione as seções transversais na ordem da transição (Clique 1 ➔ 2 ➔ 3...)
          </span>
          <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-500/40" />
          <button
            type="button"
            data-testid="chamfer-3d-loft-open-profiles-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setProfile3DCreatorOpen((o) => !o);
            }}
            className="shrink-0 rounded-full border border-sky-400/50 bg-sky-500/20 hover:bg-sky-500/30 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-sky-200 cursor-pointer whitespace-nowrap"
          >
            + Perfil 3D ⌖
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-loft-kit-3-profiles-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              handleCreate3DProfileCurve("kit_3_profiles");
            }}
            title="Criar e elevar automaticamente: [1] Retângulo (Z=0) ➔ [2] Hexágono (Z=60) ➔ [3] Círculo (Z=120)"
            className="shrink-0 rounded-full border border-amber-400/50 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-200 cursor-pointer whitespace-nowrap"
          >
            ✦ Kit 3 Perfis (0/60/120)
          </button>
          {scene.bodies.length >= 2 && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                handleCenterProfilesConcentrically();
              }}
              className="shrink-0 rounded-full border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 px-2 py-0.5 font-mono text-[9.5px] font-bold text-cyan-300 cursor-pointer whitespace-nowrap"
            >
              ⌖ Centralizar
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          0C. POPOVER FLUTUANTE DE CRIAÇÃO E ALINHAMENTO CONCÊNTRICO DE PERFIS 3D (ETAPA 1 E 2)
          ===================================================================== */}
      {is3DEnvironment && profile3DCreatorOpen && (
        <div
          data-testid="chamfer-3d-profile-creator-popover"
          style={{
            ...themeSurfaceStyle,
            top: activeMode === "3d" ? "50px" : "74px",
            maxWidth: "calc(100% - 24px)",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 z-40 flex flex-wrap items-center justify-center gap-1.5 -translate-x-1/2 rounded-2xl border border-sky-500/50 px-3 py-2 shadow-2xl backdrop-blur-xl"
        >
          <span className="font-mono text-[9.5px] font-bold text-sky-400 uppercase">
            Perfis 3D (Z=0 ⌖):
          </span>
          <button
            type="button"
            data-testid="chamfer-3d-create-profile-rect"
            onClick={() => handleCreate3DProfileCurve("rect")}
            className="rounded-full border border-slate-600 bg-slate-800/90 hover:border-sky-400 hover:text-sky-300 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-200 cursor-pointer"
          >
            ▭ Retângulo (Base)
          </button>
          <div className="flex items-center gap-0.5 rounded-full border border-slate-600 bg-slate-800/90 px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setPolygonSides3D((s) => Math.max(3, s - 1))}
              className="px-1 font-mono text-[10px] font-bold text-slate-400 hover:text-white cursor-pointer"
              title="Diminuir número de lados (mín. 3)"
            >
              -
            </button>
            <button
              type="button"
              data-testid="chamfer-3d-create-profile-polygon"
              onClick={() => handleCreate3DProfileCurve("polygon")}
              className="px-1.5 font-mono text-[9.5px] font-bold text-sky-300 hover:text-white cursor-pointer"
            >
              ⬡ Polígono ({polygonSides3D}L)
            </button>
            <button
              type="button"
              onClick={() => setPolygonSides3D((s) => Math.min(12, s + 1))}
              className="px-1 font-mono text-[10px] font-bold text-slate-400 hover:text-white cursor-pointer"
              title="Aumentar número de lados (máx. 12)"
            >
              +
            </button>
          </div>
          <button
            type="button"
            data-testid="chamfer-3d-create-profile-circle"
            onClick={() => handleCreate3DProfileCurve("circle")}
            className="rounded-full border border-slate-600 bg-slate-800/90 hover:border-sky-400 hover:text-sky-300 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-200 cursor-pointer"
          >
            ◯ Círculo (Topo)
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-center-profiles-btn"
            onClick={handleCenterProfilesConcentrically}
            title="Alinhar todos os perfis concentricamente pelo Centro Geométrico (⌖)"
            className="rounded-full border border-cyan-500/50 bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-cyan-300 cursor-pointer"
          >
            ⌖ Centralizar (Snap)
          </button>
          <button
            type="button"
            data-testid="chamfer-3d-create-kit-3-profiles"
            onClick={() => handleCreate3DProfileCurve("kit_3_profiles")}
            title="Gerar Retângulo (Z=0), Hexágono (Z=60) e Círculo (Z=120) alinhados no centro ⌖"
            className="rounded-full border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-200 cursor-pointer"
          >
            ✦ Kit 3 Perfis (Z=0/60/120)
          </button>
          {primaryBody && (
            <>
              <span className="mx-0.5 h-3.5 w-px bg-slate-600" />
              <button
                type="button"
                data-testid="chamfer-3d-toggle-curve-mode"
                onClick={handleToggle3DProfileCurveMode}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer",
                  primaryBody.extrudeHeightMm <= 0.05
                    ? "border-sky-400 bg-sky-500/25 text-sky-200"
                    : "border-slate-600 bg-slate-800 text-slate-300",
                )}
              >
                {primaryBody.extrudeHeightMm <= 0.05 ? "● Curva 3D (Z)" : "○ Sólido Extrudado"}
              </button>
              {[0, 60, 120].map((zPreset) => (
                <button
                  key={zPreset}
                  type="button"
                  data-testid={`chamfer-3d-preset-z-${zPreset}`}
                  onClick={() => handleSetPrimaryBodyElevationZ(zPreset)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold cursor-pointer",
                    Math.abs((primaryBody.elevationZ || 0) - zPreset) < 0.5
                      ? "border-blue-400 bg-blue-500/30 text-blue-200"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-blue-400",
                  )}
                >
                  Z={zPreset}
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            onClick={() => setProfile3DCreatorOpen(false)}
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* =====================================================================
          1. PÍLULA COMPACTA DE COMANDO ATIVO NO TOPO CENTRAL (ÚNICO HUD NO CANVAS 3D)
          ===================================================================== */}
      {is3DEnvironment && directTool !== "select_3d" && !isLoftActive && activePillMeta && (
        <div
          data-testid="chamfer-3d-contextual-guide-banner"
          style={{
            ...themeSurfaceStyle,
            top: activeMode === "3d" ? "12px" : "36px",
            maxWidth: "calc(100% - 24px)",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 z-30 flex h-[40px] -translate-x-1/2 items-center justify-between gap-1.5 overflow-hidden rounded-full border pl-3 pr-1.5 shadow-lg backdrop-blur-md transition-all"
        >
          <div
            onPointerDown={(ev) => {
              ev.stopPropagation();
              const el = ev.currentTarget;
              el.dataset.dragStartX = String(ev.clientX);
              el.dataset.dragStartScroll = String(el.scrollLeft);
              el.dataset.isDragging = "1";
            }}
            onPointerMove={(ev) => {
              const el = ev.currentTarget;
              if (el.dataset.isDragging !== "1") return;
              const dx = ev.clientX - Number(el.dataset.dragStartX || 0);
              if (Math.abs(dx) > 4) {
                el.scrollLeft = Number(el.dataset.dragStartScroll || 0) - dx;
              }
            }}
            onPointerUp={(ev) => {
              ev.currentTarget.dataset.isDragging = "0";
            }}
            onPointerCancel={(ev) => {
              ev.currentTarget.dataset.isDragging = "0";
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain py-1 pr-1 cursor-grab active:cursor-grabbing"
          >
            <activePillMeta.icon className="size-3.5 shrink-0 text-cyan-500" />
            <span className="shrink-0 font-mono text-[11px] font-bold tracking-tight whitespace-nowrap">
              {activePillMeta.label}
            </span>

          {/* Cota / Valor Atual (clicável para abrir o teclado numérico universal) */}
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              const targetBody = primaryBody ?? scene.bodies[0] ?? null;
              if (!targetBody) return;
              if (directTool === "extrude_3d") {
                openFloatingNumpad(
                  "EXTRUSION",
                  "EXTRUDE",
                  "mm",
                  targetBody.extrudeHeightMm,
                  "extrudeHeight",
                  targetBody.entityId,
                );
              } else if (directTool === "fillet_3d" || directTool === "chamfer_3d") {
                const isVertexOrHoriz = selectionKind3D === "vertex" || Boolean(selectedBevelKeys?.length);
                openFloatingNumpad(
                  filletOrChamferMode === "fillet" && !isVertexOrHoriz ? "RADIUS" : "CHAMFER",
                  isVertexOrHoriz
                    ? "BISEL LOCALIZADO (mm)"
                    : filletOrChamferMode === "fillet"
                      ? "RAIO FILLET (mm)"
                      : "CHANFRO 45° (mm)",
                  "mm",
                  isVertexOrHoriz
                    ? (vertexBevelGizmo?.currentBevelMm ?? edgeDiagonalGizmo?.currentChamferVal ?? 10)
                    : filletOrChamferMode === "fillet"
                      ? (edgeDiagonalGizmo?.currentFilletVal ?? targetBody.edgeFilletRadiusMm ?? 10)
                      : (edgeDiagonalGizmo?.currentChamferVal ?? targetBody.edgeChamferDistMm ?? 10),
                  filletOrChamferMode === "fillet" && !isVertexOrHoriz ? "filletRadius" : "chamferDistance",
                  targetBody.entityId,
                );
              } else if (directTool === "shell_3d") {
                openFloatingNumpad(
                  "THICKNESS",
                  "PAREDE CASCA",
                  "mm",
                  targetBody.shellWallThicknessMm || targetBody.shellThicknessMm || 4.75,
                  "shellWallThickness",
                  targetBody.entityId,
                );
              } else if (directTool === "offset_face_3d") {
                openFloatingNumpad(
                  "OFFSET",
                  "OFFSET FACE",
                  "mm",
                  25,
                  "offsetFaceDistance",
                  targetBody.entityId,
                  offsetFaceTarget,
                );
              } else if (directTool === "rotate_axis_3d") {
                openFloatingNumpad(
                  "ANGLE",
                  "ÂNGULO CORTE",
                  "°",
                  45,
                  "miterAngle",
                  targetBody.entityId,
                  miterEndTarget,
                );
              } else if (directTool === "transform_3d") {
                if (
                  lastCompletedDrag &&
                  (lastCompletedDrag.axis === "rot_x" ||
                    lastCompletedDrag.axis === "rot_y" ||
                    lastCompletedDrag.axis === "rot_z")
                ) {
                  const subRot =
                    lastCompletedDrag.axis === "rot_x"
                      ? "rx"
                      : lastCompletedDrag.axis === "rot_y"
                        ? "ry"
                        : "rz";
                  openFloatingNumpad(
                    "ANGLE",
                    `ROTAÇÃO ${subRot.toUpperCase()}`,
                    "°",
                    lastCompletedDrag.deltaMm || 45,
                    "miterAngle",
                    targetBody.entityId,
                    subRot,
                  );
                } else {
                  openFloatingNumpad(
                    "DISTANCE",
                    `TRANSLADAR +${transformAxisTarget.toUpperCase()}`,
                    "mm",
                    lastCompletedDrag?.deltaMm || 100,
                    transformAxisTarget === "x"
                      ? "moveX"
                      : transformAxisTarget === "y"
                        ? "moveY"
                        : "moveZ",
                    targetBody.entityId,
                    undefined,
                    copyOnTransform,
                  );
                }
              } else if (directTool === "scale_3d" || directTool === "align_3d") {
                openFloatingNumpad(
                  "SCALE",
                  "FATOR ESCALA 3D",
                  "×",
                  1.5,
                  "scaleFactor",
                  targetBody.entityId,
                );
              } else if (directTool === "hole_3d") {
                openFloatingNumpad(
                  "HOLE_DIAMETER",
                  "DIÂMETRO FURO Ø (mm)",
                  "mm",
                  12,
                  "holeDiameter",
                  targetBody.entityId,
                );
              }
            }}
            title="Toque para digitar o valor exato"
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
              isDark
                ? "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:border-cyan-400"
                : "border-cyan-600/35 bg-cyan-50 text-cyan-700 hover:border-cyan-600",
            )}
          >
            {activePillMeta.valueText} ⌨️
          </button>

          {/* OPÇÕES RÁPIDAS INLINE DA FERRAMENTA 3D ATIVA */}
          {primaryBody && directTool === "extrude_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(
                [
                  { id: "new_body", label: "Novo Corpo" },
                  { id: "union", label: "União" },
                  { id: "subtract", label: "Subtrair" },
                  { id: "intersect", label: "Interseção" },
                ] as const
              ).map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setBooleanMode(bm.id);
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectExtrudeToEntities(
                          prev,
                          activeTargetEntityIds,
                          primaryBody.extrudeHeightMm,
                          bm.id,
                        ),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(booleanMode === bm.id)}
                >
                  {bm.label}
                </button>
              ))}
            </>
          )}

          {primaryBody && (directTool === "fillet_3d" || directTool === "chamfer_3d") && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <span className="shrink-0 rounded-full bg-cyan-500/15 border border-cyan-500/35 px-2 py-0.5 font-mono text-[9.5px] font-bold text-cyan-300">
                {selectionKind3D === "vertex"
                  ? "Escopo: 1 Vértice"
                  : selectionKind3D === "edge"
                    ? `Escopo: ${subSel.edgeIds.length} Aresta(s)`
                    : "Escopo: Peça Inteira"}
              </span>
              {selectionKind3D !== "body" && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: [primaryBody.bodyId],
                      selectionScope: "body",
                      activePivot3D: primaryBody.pivot3D,
                      activeHingeEdgeId: null,
                    });
                  }}
                  className={pillBtnClass(false)}
                  title="Aplicar em todas as quinas da Peça Inteira"
                >
                  Peça Inteira
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setFilletOrChamferMode("fillet");
                  setDirectTool("fillet_3d");
                }}
                className={pillBtnClass(filletOrChamferMode === "fillet")}
              >
                Fillet (R)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilletOrChamferMode("chamfer");
                  setDirectTool("chamfer_3d");
                }}
                className={pillBtnClass(filletOrChamferMode === "chamfer")}
              >
                Chamfer (45°)
              </button>
              {[0, 5, 10, 20].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectFilletOrChamfer3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          filletOrChamferMode,
                          val,
                          selectedVerticalEdgeIndices,
                          selectedBevelKeys,
                        ),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(
                    (filletOrChamferMode === "fillet"
                      ? (edgeDiagonalGizmo?.currentFilletVal ?? primaryBody.edgeFilletRadiusMm)
                      : (vertexBevelGizmo?.currentBevelMm ??
                          edgeDiagonalGizmo?.currentChamferVal ??
                          primaryBody.edgeChamferDistMm)) === val,
                  )}
                >
                  {val === 0 ? "Reto" : `${filletOrChamferMode === "fillet" ? "R" : "D"}${val}`}
                </button>
              ))}
            </>
          )}

          {(primaryBody ?? scene.bodies[0]) && directTool === "shell_3d" && (() => {
            const shellBody = (primaryBody ?? scene.bodies[0])!;
            const shellTargetIds =
              activeTargetEntityIds.length > 0 ? activeTargetEntityIds : [shellBody.entityId];
            const currentShellT =
              shellBody.shellWallThicknessMm || shellBody.shellThicknessMm || 4.75;
            const SHELL_FACE_CAP_OPTIONS: { id: ShellOpenCap3D; label: string }[] = [
              { id: "top", label: "Topo (+Z)" },
              { id: "bottom", label: "Base (-Z)" },
              { id: "right", label: "Dir (+X)" },
              { id: "left", label: "Esq (-X)" },
              { id: "front", label: "Frente (+Y)" },
              { id: "back", label: "Trás (-Y)" },
            ];
            return (
              <>
                <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
                <button
                  type="button"
                  data-testid="chamfer-3d-shell-frame-toggle"
                  onClick={() => {
                    triggerHaptic("selection");
                    setReferenceFrame3D((f) => (f === "wcs" ? "ocs" : "wcs"));
                  }}
                  title="Alternar Referencial de Face Alvo: 🌐 Global (WCS) vs 📦 Local da Peça (OCS)"
                  className={pillBtnClass(referenceFrame3D === "ocs")}
                >
                  {referenceFrame3D === "wcs" ? "🌐 Global" : "📦 Local"}
                </button>
                <button
                  type="button"
                  data-testid="chamfer-3d-shell-mode-tube"
                  onClick={() => {
                    triggerHaptic("action");
                    setShellOpenCapsMode("both_ends");
                    const nextCaps = resolveShellOpenCapsFromSelection3D(
                      selectedFacesList,
                      "both_ends",
                      shellTargetFaceCap,
                      referenceFrame3D,
                      shellBody.rotation3D,
                    );
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectShell3DToEntities(
                          prev,
                          shellTargetIds,
                          currentShellT,
                          nextCaps,
                        ),
                      shellTargetIds,
                    );
                  }}
                  className={pillBtnClass(shellOpenCapsMode === "both_ends")}
                >
                  Tubo (2 Faces)
                </button>
                <button
                  type="button"
                  data-testid="chamfer-3d-shell-mode-box"
                  onClick={() => {
                    triggerHaptic("action");
                    setShellOpenCapsMode("top_only");
                    const nextCaps = resolveShellOpenCapsFromSelection3D(
                      selectedFacesList,
                      "top_only",
                      shellTargetFaceCap,
                      referenceFrame3D,
                      shellBody.rotation3D,
                    );
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectShell3DToEntities(
                          prev,
                          shellTargetIds,
                          currentShellT,
                          nextCaps,
                        ),
                      shellTargetIds,
                    );
                  }}
                  className={pillBtnClass(shellOpenCapsMode === "top_only")}
                >
                  Caixa (1 Face)
                </button>
                <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
                <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-400">
                  Face Alvo:
                </span>
                {SHELL_FACE_CAP_OPTIONS.map((fOpt) => {
                  const isCapActive =
                    shellTargetFaceCap === fOpt.id ||
                    shellBody.shellOpenCaps.includes(fOpt.id);
                  return (
                    <button
                      key={fOpt.id}
                      type="button"
                      data-testid={`chamfer-3d-shell-face-${fOpt.id}`}
                      onClick={() => {
                        triggerHaptic("selection");
                        setShellTargetFaceCap(fOpt.id);
                        const matchingFace = findBodyFaceByReferenceFrame3D(
                          shellBody,
                          fOpt.id,
                          referenceFrame3D,
                        );
                        setSubSel((prev) => ({
                          ...prev,
                          faceIds: matchingFace ? [matchingFace.faceId] : [],
                        }));
                        const nextCaps = resolveShellOpenCapsFromSelection3D(
                          matchingFace ? [matchingFace] : [],
                          shellOpenCapsMode,
                          fOpt.id,
                          referenceFrame3D,
                          shellBody.rotation3D,
                        );
                        onCommitEntities?.(
                          (prev) =>
                            applyDirectShell3DToEntities(
                              prev,
                              shellTargetIds,
                              currentShellT,
                              nextCaps,
                            ),
                          shellTargetIds,
                        );
                      }}
                      className={pillBtnClass(isCapActive)}
                    >
                      {fOpt.label}
                    </button>
                  );
                })}
                <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
                {[2, 3, 4.75, 6].map((wVal) => (
                  <button
                    key={wVal}
                    type="button"
                    data-testid={`chamfer-3d-shell-thickness-${wVal}`}
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.(
                        (prev) =>
                          applyDirectShell3DToEntities(
                            prev,
                            shellTargetIds,
                            wVal,
                            resolvedShellOpenCaps,
                          ),
                        shellTargetIds,
                      );
                    }}
                    className={pillBtnClass(Math.abs(currentShellT - wVal) < 0.2)}
                  >
                    {wVal}mm
                  </button>
                ))}
              </>
            );
          })()}
          {(primaryBody ?? scene.bodies[0]) && directTool === "shell_3d" && (
            <>
              <button
                type="button"
                data-testid="chamfer-3d-edge-flange-btn"
                onClick={() => {
                  triggerHaptic("action");
                  onCommitEntities?.(
                    (prev) =>
                      applySheetMetalEdgeFlange3DToEntities(prev, activeTargetEntityIds, {
                        thicknessMm: sheetThickness || 2.0,
                        bendRadiusMm: 2.0,
                        kFactor: 0.33,
                        angleDeg: 90,
                        flangeLengthMm: 65,
                        edgeSides: ["left", "right"],
                      }),
                    activeTargetEntityIds,
                  );
                }}
                title="Gerar Aba Dobrada Real (Edge Flange 90° com Raio de Dobra R=2mm)"
                className="shrink-0 rounded-full bg-amber-600 hover:bg-amber-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer"
              >
                + Edge Flange 90°
              </button>
            </>
          )}

          {primaryBody && directTool === "offset_face_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                data-testid="chamfer-3d-offset-frame-toggle"
                onClick={() => {
                  triggerHaptic("selection");
                  setReferenceFrame3D((f) => (f === "wcs" ? "ocs" : "wcs"));
                }}
                title="Alternar Referencial Geométrico: 🌐 Global (WCS) vs 📦 Local da Peça (OCS)"
                className={pillBtnClass(referenceFrame3D === "ocs")}
              >
                {referenceFrame3D === "wcs" ? "🌐 Global" : "📦 Local"}
              </button>
              {(
                [
                  { id: "top" as const, label: "Topo (+Z)" },
                  { id: "bottom" as const, label: "Base (-Z)" },
                  { id: "pos_x" as const, label: "Face +X" },
                  { id: "neg_x" as const, label: "Face -X" },
                  { id: "pos_y" as const, label: "Face +Y" },
                  { id: "neg_y" as const, label: "Face -Y" },
                  { id: "sides" as const, label: "4 Laterais" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`chamfer-3d-offset-target-${t.id}`}
                  onClick={() => setOffsetFaceTarget(t.id)}
                  className={pillBtnClass(offsetFaceTarget === t.id)}
                >
                  {t.label}
                </button>
              ))}
              {[-25, 25, 50, 100].map((dVal) => (
                <button
                  key={dVal}
                  type="button"
                  data-testid={`chamfer-3d-offset-preset-${dVal}`}
                  onClick={() => {
                    triggerHaptic("action");
                    const targetMode =
                      selectionKind3D === "face" && primaryFace?.role === "inner_side"
                        ? "inner_cavity"
                        : selectedSideFacesCount >= 2 || offsetFaceTarget === "sides"
                          ? "sides"
                          : selectionKind3D === "face" && primaryFace?.role === "side"
                            ? "side_normal"
                            : offsetFaceTarget;
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectOffsetFace3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          targetMode,
                          targetMode === "inner_cavity" ? Math.abs(dVal) : dVal,
                          primaryFace?.normal ?? null,
                          referenceFrame3D,
                        ),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  {dVal > 0 ? `+${dVal}` : `${dVal}`}mm
                </button>
              ))}
            </>
          )}

          {primaryBody && directTool === "rotate_axis_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                onClick={() => setMiterEndTarget("top")}
                className={pillBtnClass(miterEndTarget === "top")}
              >
                Topo
              </button>
              <button
                type="button"
                onClick={() => setMiterEndTarget("bottom")}
                className={pillBtnClass(miterEndTarget === "bottom")}
              >
                Base
              </button>
              <button
                type="button"
                onClick={() => setMiterAxis((a) => (a === "x" ? "y" : "x"))}
                className={pillBtnClass(true)}
              >
                Eixo {miterAxis.toUpperCase()}
              </button>
              {[-45, 0, 45].map((ang) => (
                <button
                  key={ang}
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectMiterCut3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          miterEndTarget,
                          ang,
                          miterAxis,
                        ),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(
                    (miterEndTarget === "top"
                      ? primaryBody.miterCutTopDeg
                      : primaryBody.miterCutBottomDeg) === ang,
                  )}
                >
                  {ang > 0 ? `+${ang}°` : `${ang}°`}
                </button>
              ))}
              <button
                type="button"
                data-testid="chamfer-3d-frame-generator-btn"
                onClick={() => {
                  triggerHaptic("action");
                  onCommitEntities?.(
                    (prev) =>
                      applyStructuralFrame3DToEntities(prev, activeTargetEntityIds, {
                        widthMm: 80,
                        heightMm: 50,
                        wallMm: 3.0,
                        miterStartDeg: 45,
                        miterEndDeg: 45,
                        gussetStart: true,
                      }),
                    activeTargetEntityIds,
                  );
                }}
                title="Converter em Tubo Metalon 80×50×3mm com Corte Bissetor Miter 45° e Mão Francesa (Gusset)"
                className="shrink-0 rounded-full bg-cyan-600 hover:bg-cyan-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer"
              >
                + Frame Metalon 45°
              </button>
            </>
          )}

          {primaryBody && directTool === "transform_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                data-testid="chamfer-3d-transform-copy-toggle"
                onClick={() => {
                  triggerHaptic("selection");
                  setCopyOnTransform((c) => !c);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap",
                  copyOnTransform
                    ? "border-emerald-400 bg-emerald-600 text-white"
                    : pillBtnClass(false),
                )}
              >
                Copy: {copyOnTransform ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-transform-frame-toggle"
                onClick={() => {
                  triggerHaptic("selection");
                  setReferenceFrame3D((f) => (f === "wcs" ? "ocs" : "wcs"));
                }}
                title="Alternar Referencial do Gizmo: 🌐 Global (WCS) vs 📦 Local da Peça (OCS)"
                className={pillBtnClass(referenceFrame3D === "ocs")}
              >
                {referenceFrame3D === "wcs" ? "🌐 Global" : "📦 Local"}
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-drop-to-base-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const ids =
                    activeTargetEntityIds.length > 0
                      ? activeTargetEntityIds
                      : [primaryBody.entityId];
                  let droppedSnap: BaseSurfaceSnapEvaluation3D | null = null;
                  onCommitEntities?.((prev) => {
                    const prevScene = buildDirectTopology3DScene(prev, sheetThickness);
                    const res = applyDropBodiesToBaseZ0(prev, ids, prevScene);
                    droppedSnap = res.snapEval;
                    return res.updatedEntities;
                  }, ids);
                  if (droppedSnap) {
                    setActiveBaseSnapEval(droppedSnap);
                    const step = stepBaseEcholocationState3D(
                      {
                        isInBaseContact: false,
                        armed: true,
                        pulseCounter: echolocationStateRef.current.pulseCounter,
                        activePulse: null,
                      },
                      {
                        ...(droppedSnap as BaseSurfaceSnapEvaluation3D),
                        snapped: true,
                      },
                      performance.now(),
                    );
                    echolocationStateRef.current = step.nextState;
                    if (step.triggeredNewPulse && step.nextState.activePulse) {
                      triggerEcholocationWavePulse(step.nextState.activePulse);
                    }
                  }
                }}
                title="Pousar peça/conjunto selecionado exatamente na superfície Base Z = 0.00 mm"
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold cursor-pointer whitespace-nowrap transition-colors",
                  isDark
                    ? "border-cyan-400/60 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200"
                    : "border-sky-600/60 bg-sky-500/15 hover:bg-sky-500/25 text-sky-800",
                )}
              >
                ⤓ Base
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-pivot-snap-btn"
                onClick={() => {
                  triggerHaptic("selection");
                  setIsPickingPivotSnap((p) => !p);
                }}
                className={pillBtnClass(isPickingPivotSnap)}
              >
                {isPickingPivotSnap ? "Toque Vértice..." : "Pivô Snap"}
              </button>
              {selectedBodiesList.length >= 2 && (
                <button
                  type="button"
                  data-testid="chamfer-3d-pivot-mode-cycle-btn"
                  onClick={() => {
                    triggerHaptic("selection");
                    const modes: MultiSelectionPivotMode3D[] = [
                      "bbox_center",
                      "mass_centroid",
                      "primary_body",
                      "snap_point",
                      "custom_draggable",
                    ];
                    const nextIdx = (modes.indexOf(multiPivotMode) + 1) % modes.length;
                    setMultiPivotMode(modes[nextIdx]!);
                  }}
                  title="Alternar modo de Pivô do Conjunto (BBox, Centroide de Massa, Corpo Principal, Snap, Livre)"
                  className={pillBtnClass(multiPivotMode !== "bbox_center")}
                >
                  Pivô:{" "}
                  {multiPivotMode === "bbox_center"
                    ? "Centro"
                    : multiPivotMode === "mass_centroid"
                      ? "Massa"
                      : multiPivotMode === "primary_body"
                        ? "Principal"
                        : multiPivotMode === "snap_point"
                          ? "Snap"
                          : "Livre"}
                </button>
              )}
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(["x", "y", "z"] as const).map((pl) => (
                <button
                  key={pl}
                  type="button"
                  data-testid={`chamfer-3d-transform-mirror-${pl}`}
                  onClick={() => {
                    triggerHaptic("action");
                    let nextSel = activeTargetEntityIds;
                    onCommitEntities?.((prev) => {
                      const res = applyDirectMirror3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        pl,
                        copyOnTransform,
                        selectionCenter3D ?? primaryBody.pivot3D,
                      );
                      if (res.activeIds.length > 0) {
                        nextSel = res.activeIds;
                      }
                      return res.updatedEntities;
                    }, nextSel);
                  }}
                  title={`Espelhar no plano ${pl.toUpperCase()}`}
                  className={pillBtnClass(false)}
                >
                  ⇄ {pl.toUpperCase()}
                </button>
              ))}
            </>
          )}

          {primaryBody && directTool === "mirror_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setCopyOnTransform((c) => !c);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap",
                  copyOnTransform
                    ? "border-emerald-400 bg-emerald-600 text-white"
                    : pillBtnClass(false),
                )}
              >
                Copy: {copyOnTransform ? "ON" : "OFF"}
              </button>
              {(["x", "y", "z"] as const).map((pl) => (
                <button
                  key={pl}
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    let nextSel = activeTargetEntityIds;
                    onCommitEntities?.((prev) => {
                      const res = applyDirectMirror3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        pl,
                        copyOnTransform,
                        subSel.activePivot3D ?? primaryFace?.centroid ?? null,
                      );
                      if (res.activeIds.length > 0) {
                        nextSel = res.activeIds;
                      }
                      return res.updatedEntities;
                    }, nextSel);
                  }}
                  className={pillBtnClass(false)}
                >
                  ⇄ {pl.toUpperCase()}
                </button>
              ))}
              {primaryFace && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    const nx = Math.abs(primaryFace.normal.x);
                    const ny = Math.abs(primaryFace.normal.y);
                    const nz = Math.abs(primaryFace.normal.z);
                    const facePlane: "x" | "y" | "z" =
                      nx >= ny && nx >= nz ? "x" : ny >= nx && ny >= nz ? "y" : "z";
                    let nextSel = activeTargetEntityIds;
                    onCommitEntities?.((prev) => {
                      const res = applyDirectMirror3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        facePlane,
                        copyOnTransform,
                        primaryFace.centroid,
                      );
                      if (res.activeIds.length > 0) {
                        nextSel = res.activeIds;
                      }
                      return res.updatedEntities;
                    }, nextSel);
                  }}
                  className="shrink-0 rounded-full border border-cyan-400/80 bg-cyan-600/85 hover:bg-cyan-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  ⇄ Face ({primaryFace.label})
                </button>
              )}
            </>
          )}

          {primaryBody && (directTool === "scale_3d" || directTool === "align_3d") && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {[0.5, 1.25, 1.5, 2.0].map((factor) => (
                <button
                  key={factor}
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectScale3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          factor,
                          subSel.activePivot3D ?? primaryBody.pivot3D,
                        ),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  {factor}×
                </button>
              ))}
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(["x", "y", "z"] as const).map((ax) => (
                <button
                  key={ax}
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectAlignFlush3DToEntities(prev, activeTargetEntityIds, ax),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(false)}
                  title={`Alinhar e encostar face-a-face no eixo ${ax.toUpperCase()}`}
                >
                  Encostar {ax.toUpperCase()}
                </button>
              ))}
              {scene.bodies.length >= 2 && (
                <>
                  <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
                  {(
                    [
                      { op: "union" as const, label: "∪ Unir" },
                      { op: "subtract" as const, label: "− Subtrair" },
                      { op: "intersect" as const, label: "∩ Intersectar" },
                    ] as const
                  ).map((bBtn) => (
                    <button
                      key={bBtn.op}
                      type="button"
                      data-testid={`chamfer-3d-boolean-${bBtn.op}-btn`}
                      onClick={() => {
                        triggerHaptic("action");
                        const ids =
                          activeTargetEntityIds.length >= 2
                            ? activeTargetEntityIds
                            : scene.bodies.slice(0, 2).map((b) => b.entityId);
                        onCommitEntities?.((prev) => {
                          const res = applyDirectBoolean3DBetweenBodies(prev, ids, bBtn.op);
                          return res.updatedEntities;
                        }, [ids[0]!]);
                      }}
                      className={pillBtnClass(false)}
                    >
                      {bBtn.label}
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {(primaryBody ?? scene.bodies[0]) && directTool === "hole_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(
                [
                  { id: "through", label: "Passante" },
                  { id: "blind", label: "Cego" },
                  { id: "counterbore", label: "Rebaixado" },
                  { id: "countersink", label: "Escareado" },
                  { id: "spotface", label: "Alojam." },
                  { id: "threaded", label: "Roscado" },
                ] as { id: AdvancedHoleType3D; label: string }[]
              ).map((ht) => (
                <button
                  key={ht.id}
                  type="button"
                  data-testid={`chamfer-3d-hole-type-${ht.id}`}
                  onClick={() => setHoleType3D(ht.id)}
                  className={pillBtnClass(holeType3D === ht.id)}
                >
                  {ht.label}
                </button>
              ))}
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(["M6", "M8", "M10", "M12", "M16", "M20"] as MetricHoleThreadSize[]).map((tCode) => {
                const spec = HOLE_METRIC_SPECS_3D[tCode];
                const targetIds =
                  activeTargetEntityIds.length > 0
                    ? activeTargetEntityIds
                    : scene.bodies[0]
                      ? [scene.bodies[0].entityId]
                      : [];
                return (
                  <button
                    key={tCode}
                    type="button"
                    data-testid={`chamfer-3d-hole-size-${tCode}`}
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.((prev) => {
                        const res = applyAdvancedHole3DToEntities(prev, targetIds, {
                          holeType: holeType3D,
                          threadSize: tCode,
                          depthMm: holeType3D === "blind" ? 18 : undefined,
                          targetFace: primaryFace ?? null,
                        });
                        return res.updatedEntities;
                      }, targetIds);
                    }}
                    title={`Inserir Furo ${holeType3D.toUpperCase()} ${tCode} (Broca Rosca Ø${spec.tapDrillDiameterMm}mm / Passante Ø${spec.clearanceDiameterMm}mm)`}
                    className={pillBtnClass(false)}
                  >
                    {tCode} (Ø{spec.clearanceDiameterMm})
                  </button>
                );
              })}
              <button
                type="button"
                data-testid="chamfer-3d-hole-polar-array-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const targetIds =
                    activeTargetEntityIds.length > 0
                      ? activeTargetEntityIds
                      : scene.bodies[0]
                        ? [scene.bodies[0].entityId]
                        : [];
                  onCommitEntities?.((prev) => {
                    const res = applyDirectArray3DToEntities(prev, targetIds, {
                      mode: "polar",
                      polarCount: 6,
                      polarTotalAngleDeg: 360,
                      polarCenter3D: primaryBody?.pivot3D ?? { x: 0, y: 0, z: 0 },
                    });
                    return res.updatedEntities;
                  }, targetIds);
                }}
                className={pillBtnClass(false)}
                title="Repetir em Padrão Polar 3D (6× em 360°)"
              >
                Array Polar 6×
              </button>
            </>
          )}

          {directTool === "revolve_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(["x", "y", "z"] as const).map((ax) => (
                <button
                  key={ax}
                  type="button"
                  data-testid={`chamfer-3d-revolve-axis-${ax}`}
                  onClick={() => setRevolveAxis(ax)}
                  className={pillBtnClass(revolveAxis === ax)}
                >
                  Eixo {ax.toUpperCase()}
                </button>
              ))}
              {[90, 180, 270, 360].map((ang) => (
                <button
                  key={ang}
                  type="button"
                  data-testid={`chamfer-3d-revolve-angle-${ang}`}
                  onClick={() => setRevolveAngleDeg(ang)}
                  className={pillBtnClass(revolveAngleDeg === ang)}
                >
                  {ang}°
                </button>
              ))}
              <button
                type="button"
                data-testid="chamfer-3d-revolve-apply-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const targetIds =
                    activeTargetEntityIds.length > 0
                      ? activeTargetEntityIds
                      : scene.bodies[0]
                        ? [scene.bodies[0].entityId]
                        : [];
                  onCommitEntities?.((prev) => {
                    const res = applyDirectRevolve3DToEntities(prev, targetIds, {
                      axis: revolveAxis,
                      angleDeg: revolveAngleDeg,
                      direction: "ccw",
                      operation: "new_body",
                    });
                    return res.updatedEntities;
                  }, targetIds);
                }}
                className="shrink-0 rounded-full bg-cyan-600 hover:bg-cyan-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer"
              >
                ✓ Revolucionar
              </button>
            </>
          )}

          {directTool === "sweep_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              {(
                [
                  { id: "arc90" as const, label: "Arco 90° (R120)" },
                  { id: "straight" as const, label: "Reto (250mm)" },
                  { id: "scurve" as const, label: "Curva S" },
                ] as const
              ).map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  data-testid={`chamfer-3d-sweep-path-${sp.id}`}
                  onClick={() => setSweepPathPreset(sp.id)}
                  className={pillBtnClass(sweepPathPreset === sp.id)}
                >
                  {sp.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSweepHollow((h) => !h)}
                className={pillBtnClass(sweepHollow)}
              >
                {sweepHollow ? "Tubo Oco (3mm)" : "Maciço"}
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-sweep-apply-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const targetIds =
                    activeTargetEntityIds.length > 0
                      ? activeTargetEntityIds
                      : scene.bodies[0]
                        ? [scene.bodies[0].entityId]
                        : [];
                  const pathPts: Vec3Mm[] =
                    sweepPathPreset === "straight"
                      ? [
                          { x: 0, y: 0, z: 0 },
                          { x: 0, y: 0, z: 125 },
                          { x: 0, y: 0, z: 250 },
                        ]
                      : sweepPathPreset === "scurve"
                        ? [
                            { x: 0, y: 0, z: 0 },
                            { x: 30, y: 0, z: 80 },
                            { x: 80, y: 0, z: 150 },
                            { x: 110, y: 0, z: 230 },
                          ]
                        : Array.from({ length: 7 }, (_, idx) => {
                            const t = (idx / 6) * (Math.PI / 2);
                            const R = 120;
                            return {
                              x: R * (1 - Math.cos(t)),
                              y: 0,
                              z: R * Math.sin(t),
                            };
                          });
                  onCommitEntities?.((prev) => {
                    const res = applyDirectSweep3DToEntities(prev, targetIds, {
                      pathPoints3D: pathPts,
                      profileRadiusMm: 25,
                      wallThicknessMm: sweepHollow ? 3 : 0,
                      orientation: "follow_path",
                    });
                    return res.updatedEntities;
                  }, targetIds);
                }}
                className="shrink-0 rounded-full bg-cyan-600 hover:bg-cyan-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer"
              >
                ✓ Varrer (Sweep)
              </button>
            </>
          )}

          {directTool === "color_material_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                data-testid="chamfer-3d-section-toggle-btn"
                onClick={() =>
                  setSectionPlaneState((s) => ({ ...s, enabled: !s.enabled }))
                }
                className={pillBtnClass(sectionPlaneState.enabled)}
              >
                ✂ Seção: {sectionPlaneState.enabled ? "ON" : "OFF"}
              </button>
              {(["x", "y", "z"] as const).map((ax) => (
                <button
                  key={ax}
                  type="button"
                  data-testid={`chamfer-3d-section-axis-${ax}`}
                  onClick={() =>
                    setSectionPlaneState((s) => ({
                      ...s,
                      enabled: true,
                      axis: ax,
                    }))
                  }
                  className={pillBtnClass(
                    sectionPlaneState.enabled && sectionPlaneState.axis === ax,
                  )}
                >
                  Plano {ax.toUpperCase()}
                </button>
              ))}
              {[-80, 0, 80].map((off) => (
                <button
                  key={off}
                  type="button"
                  onClick={() =>
                    setSectionPlaneState((s) => ({
                      ...s,
                      enabled: true,
                      offsetMm: off,
                    }))
                  }
                  className={pillBtnClass(
                    sectionPlaneState.enabled && sectionPlaneState.offsetMm === off,
                  )}
                >
                  {off >= 0 ? `+${off}` : off}mm
                </button>
              ))}
              <button
                type="button"
                data-testid="chamfer-3d-exploded-view-btn"
                onClick={() => {
                  triggerHaptic("action");
                  onCommitEntities?.((prev) => applyExplodedView3DToEntities(prev, 0.35));
                }}
                className={pillBtnClass(false)}
                title="Aplicar Vista Explodida Radial (Exploded View) na Montagem 3D"
              >
                💥 Explodir
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-open-cutlist-btn"
                onClick={() => setCutListModalOpen(true)}
                className="shrink-0 rounded-full bg-violet-600 hover:bg-violet-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer"
              >
                📋 Lista Corte / BOM
              </button>
            </>
          )}

          {directTool === "project_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                data-testid="chamfer-3d-project-ref-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const projected = project3DSelectionTo2DSketch(scene, subSel, true);
                  if (projected.length > 0) {
                    onCommitEntities?.(
                      (prev) => [...prev, ...projected],
                      projected.map((p) => p.id),
                    );
                  }
                }}
                className={pillBtnClass(true)}
              >
                Projetar Referência 2D
              </button>
              <button
                type="button"
                data-testid="chamfer-3d-project-cut-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const projected = project3DSelectionTo2DSketch(scene, subSel, false);
                  if (projected.length > 0) {
                    onCommitEntities?.(
                      (prev) => [...prev, ...projected],
                      projected.map((p) => p.id),
                    );
                  }
                }}
                className={pillBtnClass(false)}
              >
                Projetar Linha de Corte 2D
              </button>
            </>
          )}

          {directTool === "create_drawing_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                data-testid="chamfer-3d-generate-views-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const views = generateTechnicalDrawingViews2DFrom3D(scene);
                  if (views.length > 0) {
                    onCommitEntities?.(
                      (prev) => [...prev, ...views],
                      views.map((v) => v.id),
                    );
                  }
                }}
                className={pillBtnClass(true)}
              >
                Gerar Vistas Ortográficas + Cotas 2D
              </button>
            </>
          )}

          </div>

          {/* Ações Primárias Fixas à Direita (Nunca cortadas em nenhuma largura de viewport) */}
          <div className="flex shrink-0 items-center gap-1 border-l border-slate-500/30 pl-1.5">
            <button
              type="button"
              data-testid="chamfer-3d-active-pill-confirm-btn"
              onClick={() => {
                triggerHaptic("action");
                if (directTool === "array_3d") {
                  if (smartArrayPanelTab === "miter_frame" && smartMiterFrameCalc.valid) {
                    let createdIds: string[] = [];
                    onCommitEntities?.(
                      (prev) => {
                        const res = generateSmartMiterFrameEntities3D(
                          prev,
                          smartArraySourceBody?.entityId ?? null,
                          smartArraySourceBody,
                          smartMiterFrameCalc,
                        );
                        createdIds = res.createdIds;
                        return res.updatedEntities;
                      },
                      createdIds,
                    );
                    if (createdIds.length > 0) {
                      setSubSel({
                        faceIds: [],
                        edgeIds: [],
                        vertexIds: [],
                        bodyIds: createdIds.map((id) => `body_${id}`),
                        selectionScope: "body",
                        activePivot3D: { x: 0, y: 0, z: 0 },
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.(createdIds);
                    }
                  } else if (
                    smartArrayPanelTab === "grille_span" &&
                    smartArraySourceBody &&
                    smartArrayCalc.valid
                  ) {
                    let createdIds: string[] = [];
                    onCommitEntities?.(
                      (prev) => {
                        const res = generateSmartGrilleArrayEntities3D(
                          prev,
                          smartArraySourceBody.entityId,
                          smartArraySourceBody,
                          smartArrayCalc,
                          scene.bodies,
                        );
                        createdIds = res.createdIds;
                        return res.updatedEntities;
                      },
                      createdIds.length > 0 ? createdIds : [smartArraySourceBody.entityId],
                    );
                    if (createdIds.length > 0) {
                      setSubSel({
                        faceIds: [],
                        edgeIds: [],
                        vertexIds: [],
                        bodyIds: createdIds.map((id) => `body_${id}`),
                        selectionScope: "body",
                        activePivot3D: { x: 0, y: 0, z: 0 },
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.(createdIds);
                    }
                  }
                } else if (directTool === "shell_3d") {
                  const shellBody = primaryBody ?? scene.bodies[0] ?? null;
                  if (shellBody) {
                    const shellTargetIds =
                      activeTargetEntityIds.length > 0
                        ? activeTargetEntityIds
                        : [shellBody.entityId];
                    const tVal =
                      shellBody.shellWallThicknessMm || shellBody.shellThicknessMm || 4.75;
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectShell3DToEntities(
                          prev,
                          shellTargetIds,
                          tVal,
                          resolvedShellOpenCaps,
                        ),
                      shellTargetIds,
                    );
                  }
                }
                setDirectTool("select_3d");
                setNumpadSession(null);
              }}
              className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-500 px-2.5 font-mono text-[10px] font-bold text-white shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Check className="size-3" />
              <span>Concluir</span>
            </button>

            <button
              type="button"
              aria-label="Fechar ferramenta 3D"
              data-testid="chamfer-3d-active-pill-cancel-btn"
              onClick={() => {
                triggerHaptic("tap");
                setDirectTool("select_3d");
                setNumpadSession(null);
              }}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer",
                isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
              )}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. CAMADA SVG DE DESTAQUE CIANO TÉCNICO (#00B4D8) E GIZMO 3D INTERATIVO
          ===================================================================== */}
      {is3DEnvironment && (
        <svg
          data-testid="chamfer-3d-gizmo-svg"
          style={{ touchAction: "none", userSelect: "none" }}
          className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible select-none"
        >
          <defs>
            <marker
              id="gizmo-arrow-x"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#EF4444" />
            </marker>
            <marker
              id="gizmo-arrow-y"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#22C55E" />
            </marker>
            <marker
              id="gizmo-arrow-z"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#00B4D8" />
            </marker>
            <marker
              id="gizmo-arrow-cyan"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#00B4D8" />
            </marker>
            <marker
              id="gizmo-arrow-cyan-start"
              viewBox="0 0 10 10"
              refX="3"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 10 1 L 0 5 L 10 9 z" fill="#00B4D8" />
            </marker>
            <marker
              id="gizmo-arrow-bright-cyan"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#00E5FF" />
            </marker>
            <marker
              id="gizmo-arrow-amber"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B" />
            </marker>
            <marker
              id="gizmo-arrow-amber-start"
              viewBox="0 0 10 10"
              refX="3"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 10 1 L 0 5 L 10 9 z" fill="#F59E0B" />
            </marker>
            <marker
              id="gizmo-arrow-z-blue"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3B82F6" />
            </marker>
          </defs>

          {/* ================================================================= */}
          {/* A. HIT-TARGETS INTERATIVOS PARA TODAS AS FACES 3D DA CENA        */}
          {/*    Ordenados por profundidade e sem vazamento X-ray nas faces     */}
          {/*    traseiras para que sólidos fechados jamais pareçam "ocos".     */}
          {/* ================================================================= */}
          {(() => {
            const azRad = ((orbitProjection.azimuthDeg ?? 45) * Math.PI) / 180;
            const elRad = ((orbitProjection.elevationDeg ?? 35.26438968) * Math.PI) / 180;
            const camDir = {
              x: Math.cos(elRad) * Math.sin(azRad),
              y: Math.cos(elRad) * Math.cos(azRad),
              z: Math.sin(elRad),
            };

            return scene.bodies.map((body) => {
              const sortedFaces = [...body.faces].sort((fa, fb) => {
                const da =
                  fa.centroid.x * camDir.x +
                  fa.centroid.y * camDir.y +
                  fa.centroid.z * camDir.z;
                const db =
                  fb.centroid.x * camDir.x +
                  fb.centroid.y * camDir.y +
                  fb.centroid.z * camDir.z;
                return da - db;
              });

              return sortedFaces.map((face) => {
                if (face.polygon3D.length < 3) return null;
                const isSelected = subSel.faceIds.includes(face.faceId);
                const facingDot =
                  face.normal.x * camDir.x +
                  face.normal.y * camDir.y +
                  face.normal.z * camDir.z;
                // Evita que faces traseiras ocultas de peças maciças interceptem cliques ou vazem por cima do topo
                if (
                  !isSelected &&
                  body.extrudeHeightMm > 0.05 &&
                  body.shellThicknessMm <= 0.1 &&
                  facingDot < -0.15
                ) {
                  return null;
                }
                const ptsStr = face.polygon3D
                  .map((p) => {
                    const s = toScreen(p);
                    return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
                  })
                  .join(" ");

                const showFaceSelectionHighlight =
                  isSelected && directTool !== "shell_3d" && directTool !== "array_3d";
                return (
                  <polygon
                    key={face.faceId}
                    points={ptsStr}
                    fill={
                      showFaceSelectionHighlight
                        ? "rgba(0, 180, 216, 0.30)"
                        : "rgba(0, 180, 216, 0.001)"
                    }
                    stroke={showFaceSelectionHighlight ? "#00B4D8" : "none"}
                    strokeWidth={showFaceSelectionHighlight ? 2.5 : 0}
                    className="pointer-events-auto cursor-pointer transition-colors"
                    style={{ pointerEvents: "fill", touchAction: "none" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (performance.now() < multiTouchPinchCooldownUntilRef.current) {
                      return;
                    }
                    triggerHaptic("selection");
                    setLastCompletedDrag(null);
                    const now = performance.now();
                    const prevTap = lastFaceTapRef.current;
                    const isDoubleTapOnBody =
                      prevTap !== null &&
                      prevTap.bodyId === face.bodyId &&
                      now - prevTap.time < 350;
                    lastFaceTapRef.current = {
                      faceId: face.faceId,
                      bodyId: face.bodyId,
                      time: now,
                    };

                    // Modo LOFT 3D ativo: clicar em qualquer seção transversal adiciona/alterna na fila [1] ➔ [2] ➔ [3]
                    if (isLoftActive) {
                      onToggleLoftSection?.(body.entityId);
                      return;
                    }

                    // Se a ferramenta SHELL 3D estiver ativa, clicar em qualquer face aplica o Shell diretamente nessa face!
                    if (directTool === "shell_3d") {
                      const clickedCap = resolveFaceShellCapDirection3D(
                        face,
                        referenceFrame3D,
                        body.rotation3D,
                      );
                      setShellTargetFaceCap(clickedCap);
                      setSubSel({
                        faceIds: [face.faceId],
                        edgeIds: [],
                        vertexIds: [],
                        bodyIds: [],
                        selectionScope,
                        activePivot3D: face.centroid,
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.([face.entityId]);
                      const currentT =
                        body.shellWallThicknessMm || body.shellThicknessMm || 4.75;
                      const nextCaps = resolveShellOpenCapsFromSelection3D(
                        [face],
                        shellOpenCapsMode,
                        clickedCap,
                        referenceFrame3D,
                        body.rotation3D,
                      );
                      onCommitEntities?.(
                        (prev) =>
                          applyDirectShell3DToEntities(
                            prev,
                            [face.entityId],
                            currentT,
                            nextCaps,
                          ),
                        [face.entityId],
                      );
                      return;
                    }

                    // C. Duplo-toque na peça, Modo + Multi, Curva de Perfil 3D, Escopo "Peça Inteira" OU Modo Corpo/Transformar ativo -> Reconhece o CORPO / MONTAGEM LÓGICA
                    const clickedEnt = entities.find((e) => e.id === body.entityId);
                    const hasAssemblyGroup = Boolean(
                      clickedEnt && getEntityAssemblyGroupId(clickedEnt),
                    );
                    if (
                      isDoubleTapOnBody ||
                      multiSelectAddMode ||
                      hasAssemblyGroup ||
                      body.extrudeHeightMm <= 0.05 ||
                      selectionScope === "body" ||
                      directTool === "transform_3d"
                    ) {
                      const clickedGroupMembers = expandBodyIdsWithAssemblyGroup3D(
                        [face.bodyId],
                        scene,
                        entities,
                      ).bodyIds;
                      const currentBodies = subSel.bodyIds;
                      const isAdditive =
                        multiSelectAddMode ||
                        ev.shiftKey ||
                        (directTool === "transform_3d" &&
                          !isDoubleTapOnBody &&
                          body.extrudeHeightMm > 0.05 &&
                          currentBodies.length > 0);
                      const alreadySelected = clickedGroupMembers.every((id) =>
                        currentBodies.includes(id),
                      );
                      const nextBodyIds = isAdditive
                        ? alreadySelected
                          ? currentBodies.length > clickedGroupMembers.length
                            ? currentBodies.filter((id) => !clickedGroupMembers.includes(id))
                            : currentBodies
                          : Array.from(new Set([...currentBodies, ...clickedGroupMembers]))
                        : clickedGroupMembers;

                      setSubSel({
                        faceIds: [],
                        edgeIds: [],
                        vertexIds: [],
                        bodyIds: nextBodyIds,
                        selectionScope:
                          selectionScope === "body" || multiSelectAddMode || hasAssemblyGroup
                            ? "body"
                            : "auto",
                        activePivot3D: body.pivot3D,
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.(nextBodyIds.map((bId) => bId.replace(/^body_/, "")));
                      if (
                        selectionScope !== "body" &&
                        !multiSelectAddMode &&
                        directTool === "select_3d" &&
                        isDoubleTapOnBody
                      ) {
                        setDirectTool("transform_3d");
                      }
                      return;
                    }

                    // A. 1 Toque em uma FACE -> Reconhece APENAS esta FACE, destaca em Ciano (#00B4D8) e exibe APENAS a seta perpendicular
                    const nextFaceIds = ev.shiftKey
                      ? isSelected
                        ? subSel.faceIds.filter((id) => id !== face.faceId)
                        : [...subSel.faceIds, face.faceId]
                      : [face.faceId];

                    const clickedCap = resolveFaceShellCapDirection3D(
                      face,
                      referenceFrame3D,
                      body.rotation3D,
                    );
                    setShellTargetFaceCap(clickedCap);

                    setSubSel({
                      faceIds: nextFaceIds,
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: [],
                      selectionScope,
                      activePivot3D: face.centroid,
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.([face.entityId]);

                    if (
                      directTool !== "rotate_axis_3d" &&
                      directTool !== "hole_3d" &&
                      directTool !== "array_3d"
                    ) {
                      if (body.extrudeHeightMm <= sheetThickness + 0.5) {
                        setDirectTool("extrude_3d");
                      } else {
                        setOffsetFaceTarget(
                          face.role === "top"
                            ? "top"
                            : face.role === "bottom"
                              ? "bottom"
                              : "side_normal",
                        );
                        setDirectTool("offset_face_3d");
                      }
                    }
                  }}
                />
              );
            });
          });
        })()}

          {/* ================================================================= */}
          {/* B. HIT-TARGETS INTERATIVOS PARA TODAS AS ARESTAS 3D DA CENA      */}
          {/* ================================================================= */}
          {scene.bodies.map((body) =>
            body.edges.map((edge) => {
              if (edge.polyline3D.length < 2) return null;
              const isSelected = subSel.edgeIds.includes(edge.edgeId);
              const isHinge = subSel.activeHingeEdgeId === edge.edgeId;
              const ptsStr = edge.polyline3D
                .map((p) => {
                  const s = toScreen(p);
                  return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
                })
                .join(" ");

              return (
                <g key={edge.edgeId}>
                  <polyline
                    points={ptsStr}
                    fill="none"
                    stroke="rgba(0,0,0,0.001)"
                    strokeWidth={16}
                    className="pointer-events-auto cursor-pointer"
                    style={{ pointerEvents: "stroke", touchAction: "none" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("selection");
                      setLastCompletedDrag(null);

                      if (isLoftActive) {
                        onToggleLoftSection?.(body.entityId);
                        return;
                      }

                      if (selectionScope === "body" || body.extrudeHeightMm <= 0.05) {
                        setSubSel({
                          faceIds: [],
                          edgeIds: [],
                          vertexIds: [],
                          bodyIds: [body.bodyId],
                          selectionScope: selectionScope === "body" ? "body" : "auto",
                          activePivot3D: body.pivot3D,
                          activeHingeEdgeId: null,
                        });
                        onSelectEntities?.([body.entityId]);
                        if (body.extrudeHeightMm <= 0.05) {
                          setDirectTool("transform_3d");
                        }
                        return;
                      }

                      // Se uma Face da mesma peça estiver selecionada e o usuário tocar numa Aresta dessa face -> vira dobradiça (Rotate Around Axis / Esquadria 45°)
                      const hasFaceOnSameBody =
                        subSel.faceIds.length > 0 &&
                        subSel.faceIds.some((fid) =>
                          fid.startsWith(`${edge.bodyId}:`),
                        );
                      if (
                        hasFaceOnSameBody &&
                        subSel.edgeIds.length === 0 &&
                        !ev.shiftKey
                      ) {
                        setSubSel((prev) => ({
                          ...prev,
                          edgeIds: [edge.edgeId],
                          vertexIds: [],
                          bodyIds: [],
                          activeHingeEdgeId: edge.edgeId,
                          activePivot3D: edge.midpoint,
                        }));
                        setDirectTool("rotate_axis_3d");
                        return;
                      }

                      // CORREÇÃO 2: Toque simples em 1 ARESTA seleciona APENAS essa aresta (Shift+Clique permite multi-seleção)
                      const sameBodyEdges = subSel.edgeIds.filter((id) =>
                        id.startsWith(`${edge.bodyId}:`),
                      );
                      const nextEdgeIds = ev.shiftKey
                        ? isSelected
                          ? sameBodyEdges.length > 1
                            ? sameBodyEdges.filter((id) => id !== edge.edgeId)
                            : []
                          : [...sameBodyEdges, edge.edgeId]
                        : [edge.edgeId];

                      setSubSel({
                        faceIds: [],
                        edgeIds: nextEdgeIds,
                        vertexIds: [],
                        bodyIds: [],
                        selectionScope,
                        activePivot3D: edge.midpoint,
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.([edge.entityId]);
                      if (
                        directTool !== "fillet_3d" &&
                        directTool !== "chamfer_3d"
                      ) {
                        setDirectTool("fillet_3d");
                      }
                    }}
                  />
                  {(isSelected || isHinge) && (
                    <polyline
                      points={ptsStr}
                      fill="none"
                      stroke={isHinge ? "#F59E0B" : "#00B4D8"}
                      strokeWidth={3.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                </g>
              );
            }),
          )}

          {/* ================================================================= */}
          {/* B2. HIT-TARGETS INTERATIVOS PARA TODOS OS VÉRTICES 3D DA CENA    */}
          {/* ================================================================= */}
          {scene.bodies.map((body) =>
            (body.vertices ?? []).map((vtx) => {
              const isSelected = vertexIds.includes(vtx.vertexId);
              const sp = toScreen(vtx.point3D);
              return (
                <g key={vtx.vertexId}>
                  <circle
                    data-testid={`chamfer-3d-vertex-hit-${vtx.role}-${vtx.cornerIndex}`}
                    cx={sp.x}
                    cy={sp.y}
                    r={11}
                    fill="rgba(0,0,0,0.001)"
                    className="pointer-events-auto cursor-pointer"
                    style={{ pointerEvents: "all", touchAction: "none" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("selection");
                      setLastCompletedDrag(null);
                      const nextVertexIds = ev.shiftKey
                        ? isSelected
                          ? vertexIds.filter((id) => id !== vtx.vertexId)
                          : [...vertexIds, vtx.vertexId]
                        : [vtx.vertexId];

                      setSubSel({
                        faceIds: [],
                        edgeIds: [],
                        bodyIds: [],
                        vertexIds: nextVertexIds,
                        selectionScope,
                        activePivot3D: vtx.point3D,
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.([vtx.entityId]);
                      setFilletOrChamferMode("chamfer");
                      setEdgeActionMode("chamfer");
                      setDirectTool("chamfer_3d");
                    }}
                  />
                  {isSelected && (
                    <circle
                      cx={sp.x}
                      cy={sp.y}
                      r={5.5}
                      fill="#00E5FF"
                      stroke="#0B1220"
                      strokeWidth={2}
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                </g>
              );
            }),
          )}

          {/* ================================================================= */}
          {/* B3. CENTRO GEOMÉTRICO (⌖), LINHA VERTICAL DE ELEVAÇÃO Z E BADGES [1] ➔ [2] ➔ [3] DO LOFT */}
          {/* ================================================================= */}
          {scene.bodies.map((body) => {
            const centerSc = toScreen(body.pivot3D);
            const baseSc = toScreen({ x: body.pivot3D.x, y: body.pivot3D.y, z: 0 });
            const loftOrderIdx = loftSectionIds.indexOf(body.entityId);
            const isLoftSection = loftOrderIdx >= 0;
            const isBodySelected = subSel.bodyIds.includes(body.bodyId);
            const isPrimarySelectedBody = primaryBody?.bodyId === body.bodyId && isBodySelected;
            const isProfileCurve = body.extrudeHeightMm <= 0.05;
            const bodyEnt = entities.find((e) => e.id === body.entityId);
            const isGroupedMember = Boolean(bodyEnt && getEntityAssemblyGroupId(bodyEnt));

            return (
              <g key={`centroid_loft_${body.bodyId}`}>
                {/* Contorno diferenciado: Corpo Principal (#0EA5E9 contínuo intenso) vs. Corpos Adicionais (#38BDF8 tracejado coordenado) */}
                {(isProfileCurve || isLoftSection || isBodySelected) &&
                  body.edges
                    .filter(
                      (edge) =>
                        isProfileCurve ||
                        isLoftSection ||
                        edge.role === "top_perimeter" ||
                        edge.role === "bottom_perimeter" ||
                        edge.role === "vertical",
                    )
                    .map((edge) => {
                      const pts = edge.polyline3D
                        .map((p) => {
                          const s = toScreen(p);
                          return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
                        })
                        .join(" ");
                      return (
                        <polyline
                          key={`profile_outline_${edge.edgeId}`}
                          points={pts}
                          fill="none"
                          stroke={
                            isLoftSection
                              ? "#38BDF8"
                              : isPrimarySelectedBody
                                ? "#0EA5E9"
                                : isBodySelected
                                  ? "#38BDF8"
                                  : "rgba(148, 163, 184, 0.85)"
                          }
                          strokeWidth={
                            isPrimarySelectedBody
                              ? 2.6
                              : isLoftSection || isBodySelected
                                ? 2.0
                                : 1.7
                          }
                          strokeDasharray={
                            isBodySelected && !isPrimarySelectedBody && !isLoftSection
                              ? "5 3"
                              : undefined
                          }
                          style={{ pointerEvents: "none" }}
                        />
                      );
                    })}

                {/* Linha tracejada vertical de referência entre Z=0 e a altura Z — VISÍVEL APENAS NA PEÇA SELECIONADA */}
                {(isBodySelected || isLoftSection) && body.elevationZ > 0.25 && (
                  <g style={{ pointerEvents: "none" }}>
                    <line
                      x1={baseSc.x}
                      y1={baseSc.y}
                      x2={centerSc.x}
                      y2={centerSc.y}
                      stroke="#3B82F6"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                    />
                    <circle
                      cx={baseSc.x}
                      cy={baseSc.y}
                      r={3}
                      fill="#1E293B"
                      stroke="#3B82F6"
                      strokeWidth={1.4}
                    />
                  </g>
                )}

                {/* Marcador de Snap de Centro Geométrico (⌖) — VISÍVEL APENAS NA PEÇA SELECIONADA OU EM LOFT */}
                {(isBodySelected || isLoftActive) && !fluxState.isManipulating && (
                  <g
                    data-testid={`chamfer-3d-centroid-marker-${body.entityId}`}
                    transform={`translate(${centerSc.x}, ${centerSc.y})`}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("selection");
                      if (isLoftActive) {
                        onToggleLoftSection?.(body.entityId);
                        return;
                      }
                      const expandedIds = expandBodyIdsWithAssemblyGroup3D(
                        [body.bodyId],
                        scene,
                        entities,
                      ).bodyIds;
                      setSubSel({
                        faceIds: [],
                        edgeIds: [],
                        vertexIds: [],
                        bodyIds: expandedIds,
                        selectionScope: "body",
                        activePivot3D: body.pivot3D,
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.(expandedIds.map((bId) => bId.replace(/^body_/, "")));
                      setDirectTool("transform_3d");
                    }}
                  >
                    <circle
                      cx={0}
                      cy={0}
                      r={8}
                      fill={isLoftSection ? "rgba(56, 189, 248, 0.28)" : "rgba(15, 23, 42, 0.65)"}
                      stroke={isPrimarySelectedBody ? "#0EA5E9" : "#38BDF8"}
                      strokeWidth={1.6}
                    />
                    <line x1={-5} y1={0} x2={5} y2={0} stroke="#38BDF8" strokeWidth={1.2} />
                    <line x1={0} y1={-5} x2={0} y2={5} stroke="#38BDF8" strokeWidth={1.2} />
                    {isGroupedMember && (
                      <text
                        x={11}
                        y={-9}
                        fill="#38BDF8"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="monospace"
                        style={{ pointerEvents: "none" }}
                      >
                        🔗
                      </text>
                    )}
                  </g>
                )}

                {/* Badge Numérico Sequencial do Loft: [1], [2], [3] */}
                {isLoftSection && (
                  <g
                    data-testid={`chamfer-3d-loft-badge-${loftOrderIdx + 1}`}
                    transform={`translate(${centerSc.x + 18}, ${centerSc.y - 14})`}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onToggleLoftSection?.(body.entityId);
                    }}
                  >
                    <rect
                      x={-16}
                      y={-11}
                      width={32}
                      height={22}
                      rx={6}
                      fill="#0284C7"
                      stroke="#E0F2FE"
                      strokeWidth={1.6}
                    />
                    <text
                      x={0}
                      y={1}
                      fill="#FFFFFF"
                      fontSize="10.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {`[${loftOrderIdx + 1}]`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ================================================================= */}
          {/* B4. ECOLOCALIZAÇÃO AZUL EDGE-TRIGGERED NO PLANO BASE (Z = 0.00mm) */}
          {/*     3 anéis concêntricos finos projetados em perspectiva 3D       */}
          {/* ================================================================= */}
          {activeEcholocationPulse && (() => {
            const cPt = activeEcholocationPulse.contactPoint3D;
            const centerScreen = toScreen({ x: cPt.x, y: cPt.y, z: 0.05 });
            const baseR = Math.max(24, activeEcholocationPulse.pieceHorizontalRadiusMm);
            const buildProjectedRingPath = (radiusMm: number) => {
              const segs = 32;
              const pts: string[] = [];
              for (let i = 0; i <= segs; i++) {
                const ang = (i / segs) * Math.PI * 2;
                const sc = toScreen({
                  x: cPt.x + Math.cos(ang) * radiusMm,
                  y: cPt.y + Math.sin(ang) * radiusMm,
                  z: 0.05,
                });
                pts.push(`${i === 0 ? "M" : "L"} ${(sc.x - centerScreen.x).toFixed(1)} ${(sc.y - centerScreen.y).toFixed(1)}`);
              }
              return `${pts.join(" ")} Z`;
            };
            const unitRingPath = buildProjectedRingPath(baseR);

            return (
              <g
                key={`echo_pulse_${activeEcholocationPulse.pulseId}`}
                data-testid="chamfer-3d-base-echolocation"
                transform={`translate(${centerScreen.x.toFixed(1)}, ${centerScreen.y.toFixed(1)})`}
                style={{ pointerEvents: "none" }}
              >
                <style>
                  {`@keyframes chamferBaseEchoWave {
                    0% { transform: scale(0.15); opacity: 0.85; }
                    100% { transform: scale(2.2); opacity: 0; }
                  }`}
                </style>
                <circle cx={0} cy={0} r={3.5} fill="#38BDF8" opacity={0.9} />
                {prefersReducedMotion ? (
                  <path
                    d={unitRingPath}
                    fill="rgba(56, 189, 248, 0.08)"
                    stroke="#38BDF8"
                    strokeWidth={1.8}
                    opacity={0.75}
                  />
                ) : (
                  [0, 90, 180].map((delayMs, rIdx) => (
                    <path
                      key={rIdx}
                      d={unitRingPath}
                      fill={rIdx === 0 ? "rgba(14, 165, 233, 0.08)" : "none"}
                      stroke={rIdx === 0 ? "#38BDF8" : "#0EA5E9"}
                      strokeWidth={rIdx === 0 ? 2.1 : 1.5}
                      style={{
                        transformOrigin: "0px 0px",
                        animation: `chamferBaseEchoWave 520ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms forwards`,
                        opacity: 0,
                      }}
                    />
                  ))
                )}
              </g>
            );
          })()}

          {/* ================================================================= */}
          {/* C. VISUALIZAÇÃO DE SNAP DE ENCOSTO SUAVE E GUIAS COLINEARES       */}
          {/* ================================================================= */}
          {activeContactSnap && (
            <g>
              {activeContactSnap.contactHighlight && (() => {
                const sp1 = toScreen(activeContactSnap.contactHighlight.pointStart);
                const sp2 = toScreen(activeContactSnap.contactHighlight.pointEnd);
                const mx = (sp1.x + sp2.x) * 0.5;
                const my = (sp1.y + sp2.y) * 0.5;
                return (
                  <g>
                    <line
                      x1={sp1.x}
                      y1={sp1.y}
                      x2={sp2.x}
                      y2={sp2.y}
                      stroke="#00E5FF"
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                    <circle cx={mx} cy={my} r={4} fill="#00E5FF" />
                  </g>
                );
              })()}

              {activeContactSnap.alignmentGuides.map((guide, idx) => {
                const sp1 = toScreen(guide.startPt);
                const sp2 = toScreen(guide.endPt);
                return (
                  <g key={idx}>
                    <line
                      x1={sp1.x}
                      y1={sp1.y}
                      x2={sp2.x}
                      y2={sp2.y}
                      stroke="#38BDF8"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* ================================================================= */}
          {/* D. SETA NORMAL BIDIRECIONAL NA FACE (DIRECT MANIPULATION DA FACE) */}
          {/* ================================================================= */}
          {faceNormalGizmo && (
            <g
              data-testid="chamfer-gizmo-face-normal"
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={(ev) =>
                handleAxisPointerDown(
                  "face_normal",
                  faceNormalGizmo.ux,
                  faceNormalGizmo.uy,
                  faceNormalGizmo.pixelsPerMm,
                  ev,
                )
              }
              onClick={(ev) => ev.stopPropagation()}
            >
              {((activeAxis === "face_normal" &&
                dragSessionRef.current?.startCenter3D) ||
                lastCompletedDrag?.axis === "face_normal") &&
                (() => {
                  const startPt =
                    activeAxis === "face_normal" &&
                    dragSessionRef.current?.startCenter3D
                      ? toScreen(dragSessionRef.current.startCenter3D)
                      : toScreen(lastCompletedDrag!.startPoint3D);
                  const endPt = faceNormalGizmo.origin;
                  return (
                    <g>
                      <line
                        x1={startPt.x}
                        y1={startPt.y}
                        x2={endPt.x}
                        y2={endPt.y}
                        stroke="#00E5FF"
                        strokeWidth={2.2}
                        strokeDasharray="5 4"
                      />
                      <circle
                        cx={startPt.x}
                        cy={startPt.y}
                        r={4}
                        fill="#0B1220"
                        stroke="#00E5FF"
                        strokeWidth={2}
                      />
                    </g>
                  );
                })()}
              <line
                x1={faceNormalGizmo.negTip.x}
                y1={faceNormalGizmo.negTip.y}
                x2={faceNormalGizmo.posTip.x}
                y2={faceNormalGizmo.posTip.y}
                stroke="rgba(0,0,0,0.001)"
                strokeWidth={28}
                style={{ pointerEvents: "stroke" }}
              />
              <line
                x1={faceNormalGizmo.negTip.x}
                y1={faceNormalGizmo.negTip.y}
                x2={faceNormalGizmo.posTip.x}
                y2={faceNormalGizmo.posTip.y}
                stroke="#00B4D8"
                strokeWidth={3.2}
                markerStart="url(#gizmo-arrow-cyan-start)"
                markerEnd="url(#gizmo-arrow-cyan)"
                style={{ pointerEvents: "stroke" }}
              />
              <circle
                cx={faceNormalGizmo.origin.x}
                cy={faceNormalGizmo.origin.y}
                r={5.5}
                fill="#00B4D8"
                stroke="#FFFFFF"
                strokeWidth={1.6}
              />
              <g
                transform={`translate(${faceNormalGizmo.posTip.x + faceNormalGizmo.ux * 18}, ${faceNormalGizmo.posTip.y + faceNormalGizmo.uy * 18})`}
                className="cursor-pointer"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  const isSideFace = faceNormalGizmo.face.role === "side";
                  const isInnerCavityFace = faceNormalGizmo.face.role === "inner_side";
                  if (directTool === "shell_3d") {
                    openFloatingNumpad(
                      "THICKNESS",
                      "PAREDE CASCA",
                      "mm",
                      primaryBody?.shellWallThicknessMm || 3,
                      "shellWallThickness",
                      faceNormalGizmo.face.entityId,
                    );
                  } else if (isInnerCavityFace) {
                    openFloatingNumpad(
                      "OFFSET",
                      "FECHAR FURO INTERNO",
                      "mm",
                      lastCompletedDrag?.axis === "face_normal"
                        ? Math.abs(lastCompletedDrag.deltaMm)
                        : 25,
                      "offsetFaceDistance",
                      faceNormalGizmo.face.entityId,
                      "inner_cavity",
                    );
                  } else if (isSideFace || directTool === "offset_face_3d") {
                    openFloatingNumpad(
                      "OFFSET",
                      selectedSideFacesCount >= 2 ? "EXPANDIR 4 LATERAIS (SAPATA)" : "DESLOCAR FACE",
                      "mm",
                      lastCompletedDrag?.axis === "face_normal"
                        ? lastCompletedDrag.deltaMm
                        : 25,
                      "offsetFaceDistance",
                      faceNormalGizmo.face.entityId,
                      selectedSideFacesCount >= 2
                        ? "sides"
                        : isSideFace
                          ? "side_normal"
                          : faceNormalGizmo.face.role === "bottom"
                            ? "bottom"
                            : "top",
                    );
                  } else {
                    openFloatingNumpad(
                      "EXTRUSION",
                      booleanMode === "new_body" ? "EXTRUDE (NEW BODY)" : "ALTURA EXTRUDE",
                      "mm",
                      booleanMode === "new_body" ? 6 : (primaryBody?.extrudeHeightMm ?? 500),
                      "extrudeHeight",
                      faceNormalGizmo.face.entityId,
                    );
                  }
                }}
              >
                <rect
                  x={-44}
                  y={-10}
                  width={88}
                  height={20}
                  rx={5}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#00B4D8"
                  strokeWidth={1.4}
                />
                <text
                  x={0}
                  y={1}
                  fill="#00B4D8"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {activeAxis === "face_normal" && dragDeltaMm !== 0
                    ? `${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm} mm`
                    : lastCompletedDrag?.axis === "face_normal"
                      ? `${lastCompletedDrag.deltaMm >= 0 ? `+${lastCompletedDrag.deltaMm}` : lastCompletedDrag.deltaMm} mm ✎`
                      : "0.00 mm"}
                </text>
              </g>

              {/* Ícone Circular de Operação Booleana ao lado da Seta de Extrusão / Face Normal */}
              <g
                data-testid="chamfer-3d-extrude-boolean-trigger"
                transform={`translate(${faceNormalGizmo.posTip.x + faceNormalGizmo.ux * 18 + 58}, ${faceNormalGizmo.posTip.y + faceNormalGizmo.uy * 18})`}
                className="cursor-pointer pointer-events-auto"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  triggerHaptic("selection");
                  setExtrudeBooleanPopoverOpen((prev) => !prev);
                }}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={11}
                  fill={
                    booleanMode === "new_body"
                      ? "#0284C7"
                      : booleanMode === "union"
                        ? "#059669"
                        : booleanMode === "subtract"
                          ? "#E11D48"
                          : "#7C3AED"
                  }
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                <text
                  x={0}
                  y={0.5}
                  fill="#FFFFFF"
                  fontSize="8.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {booleanMode === "new_body"
                    ? "NB"
                    : booleanMode === "union"
                      ? "U+"
                      : booleanMode === "subtract"
                        ? "S−"
                        : "I∩"}
                </text>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* E. SETA DIAGONAL NA ARESTA SELECIONADA (FILLET / CHAMFER / MOVER) */}
          {/* ================================================================= */}
          {edgeDiagonalGizmo && (
            <g
              data-testid="chamfer-gizmo-edge-diagonal"
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={(ev) =>
                handleAxisPointerDown(
                  "edge_diagonal",
                  edgeDiagonalGizmo.ux,
                  edgeDiagonalGizmo.uy,
                  edgeDiagonalGizmo.pixelsPerMm,
                  ev,
                )
              }
              onClick={(ev) => ev.stopPropagation()}
            >
              <line
                x1={edgeDiagonalGizmo.origin.x}
                y1={edgeDiagonalGizmo.origin.y}
                x2={edgeDiagonalGizmo.tip.x}
                y2={edgeDiagonalGizmo.tip.y}
                stroke="rgba(0,0,0,0.001)"
                strokeWidth={26}
                style={{ pointerEvents: "stroke" }}
              />
              <line
                x1={edgeDiagonalGizmo.origin.x}
                y1={edgeDiagonalGizmo.origin.y}
                x2={edgeDiagonalGizmo.tip.x}
                y2={edgeDiagonalGizmo.tip.y}
                stroke="#00E5FF"
                strokeWidth={3}
                markerEnd="url(#gizmo-arrow-bright-cyan)"
                style={{ pointerEvents: "stroke" }}
              />
              <circle
                cx={edgeDiagonalGizmo.origin.x}
                cy={edgeDiagonalGizmo.origin.y}
                r={4}
                fill="#00E5FF"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              <g
                transform={`translate(${edgeDiagonalGizmo.tip.x + edgeDiagonalGizmo.ux * 16}, ${edgeDiagonalGizmo.tip.y + edgeDiagonalGizmo.uy * 16})`}
                className="pointer-events-auto"
              >
                <rect
                  x={-84}
                  y={-11}
                  width={168}
                  height={22}
                  rx={11}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#00E5FF"
                  strokeWidth={1.35}
                />
                <g
                  className="cursor-pointer"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (edgeActionMode === "transform_edge") {
                      openFloatingNumpad(
                        "OFFSET",
                        "MOVER ARESTA",
                        "mm",
                        25,
                        "offsetFaceDistance",
                        edgeDiagonalGizmo.edge.entityId,
                        "side_normal",
                      );
                    } else {
                      openFloatingNumpad(
                        filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                        filletOrChamferMode === "fillet" ? "RAIO DA ARESTA" : "CHANFRO DA ARESTA 45°",
                        "mm",
                        filletOrChamferMode === "fillet"
                          ? edgeDiagonalGizmo.currentFilletVal
                          : edgeDiagonalGizmo.currentChamferVal,
                        filletOrChamferMode === "fillet" ? "filletRadius" : "chamferDistance",
                        edgeDiagonalGizmo.edge.entityId,
                      );
                    }
                  }}
                >
                  <rect
                    x={-84}
                    y={-11}
                    width={78}
                    height={22}
                    rx={11}
                    fill="transparent"
                  />
                  <text
                    x={-44}
                    y={0.5}
                    fill="#00E5FF"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {edgeActionMode === "transform_edge"
                      ? `Δ ${dragDeltaMm} mm`
                      : filletOrChamferMode === "fillet"
                        ? `R ${edgeDiagonalGizmo.currentFilletVal.toFixed(1)} mm`
                        : `D ${edgeDiagonalGizmo.currentChamferVal.toFixed(1)} mm`}
                  </text>
                </g>
                <text
                  x={-4}
                  y={0.5}
                  fill="#64748B"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ pointerEvents: "none" }}
                >
                  •
                </text>
                <g
                  className="cursor-pointer"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    if (edgeActionMode === "fillet") {
                      setEdgeActionMode("chamfer");
                      setFilletOrChamferMode("chamfer");
                      setDirectTool("chamfer_3d");
                    } else if (edgeActionMode === "chamfer") {
                      setEdgeActionMode("transform_edge");
                    } else {
                      setEdgeActionMode("fillet");
                      setFilletOrChamferMode("fillet");
                      setDirectTool("fillet_3d");
                    }
                  }}
                >
                  <rect
                    x={0}
                    y={-11}
                    width={84}
                    height={22}
                    rx={11}
                    fill="transparent"
                  />
                  <text
                    x={42}
                    y={0.5}
                    fill="#38BDF8"
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {edgeActionMode === "fillet"
                      ? "Raio (Fillet)"
                      : edgeActionMode === "chamfer"
                        ? "Chanfro 45°"
                        : "Mover Aresta"}
                  </text>
                </g>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* E1. SETA DE BISEL LOCALIZADO NO VÉRTICE 3D SELECIONADO            */}
          {/* ================================================================= */}
          {vertexBevelGizmo && (
            <g
              data-testid="chamfer-gizmo-vertex-bevel"
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={(ev) =>
                handleAxisPointerDown(
                  "vertex_bevel",
                  vertexBevelGizmo.ux,
                  vertexBevelGizmo.uy,
                  vertexBevelGizmo.pixelsPerMm,
                  ev,
                )
              }
              onClick={(ev) => ev.stopPropagation()}
            >
              <line
                x1={vertexBevelGizmo.origin.x}
                y1={vertexBevelGizmo.origin.y}
                x2={vertexBevelGizmo.tip.x}
                y2={vertexBevelGizmo.tip.y}
                stroke="rgba(0,0,0,0.001)"
                strokeWidth={26}
                style={{ pointerEvents: "stroke" }}
              />
              <line
                x1={vertexBevelGizmo.origin.x}
                y1={vertexBevelGizmo.origin.y}
                x2={vertexBevelGizmo.tip.x}
                y2={vertexBevelGizmo.tip.y}
                stroke="#F59E0B"
                strokeWidth={3.2}
                markerEnd="url(#gizmo-arrow-amber)"
                style={{ pointerEvents: "stroke" }}
              />
              <circle
                cx={vertexBevelGizmo.origin.x}
                cy={vertexBevelGizmo.origin.y}
                r={5}
                fill="#F59E0B"
                stroke="#FFFFFF"
                strokeWidth={1.6}
              />
              <g
                transform={`translate(${vertexBevelGizmo.tip.x + vertexBevelGizmo.ux * 18}, ${vertexBevelGizmo.tip.y + vertexBevelGizmo.uy * 18})`}
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  openFloatingNumpad(
                    "CHAMFER",
                    "BISEL DO VÉRTICE (45°)",
                    "mm",
                    vertexBevelGizmo.currentBevelMm,
                    "chamferDistance",
                    vertexBevelGizmo.vertex.entityId,
                  );
                }}
              >
                <rect
                  x={-72}
                  y={-11}
                  width={144}
                  height={22}
                  rx={11}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#F59E0B"
                  strokeWidth={1.4}
                />
                <text
                  x={0}
                  y={0.5}
                  fill="#F59E0B"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {`Bisel 45° • D ${vertexBevelGizmo.currentBevelMm.toFixed(1)} mm ✎`}
                </text>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* E2. SETA CURVA BIDIRECIONAL INTERATIVA DE CORTE EM GRAU (ESQUADRIA)*/}
          {/* ================================================================= */}
          {hingeMiterGizmo && (
            <g
              data-testid="chamfer-gizmo-hinge-miter-arc"
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={(ev) => handleAxisPointerDown("miter", 0, 0, 1, ev)}
              onClick={(ev) => ev.stopPropagation()}
            >
              {/* Plano fantasma translúcido inclinado em tempo real pelo ângulo atual */}
              <polygon
                data-testid="chamfer-gizmo-miter-ghost-plane"
                points={hingeMiterGizmo.arcSvg.ghostPlanePoints}
                fill="rgba(245, 158, 11, 0.16)"
                stroke="#F59E0B"
                strokeWidth={1.25}
                strokeDasharray="4 3"
              />
              {/* Anel de referência tracejado suave */}
              <circle
                cx={hingeMiterGizmo.origin.x}
                cy={hingeMiterGizmo.origin.y}
                r={42}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.15}
                strokeDasharray="3 3"
                opacity={0.55}
              />
              {/* Hit-area generosa sobre o arco curvo para captura fácil no toque/mouse */}
              <path
                d={hingeMiterGizmo.arcSvg.arcPath}
                fill="none"
                stroke="rgba(0,0,0,0.001)"
                strokeWidth={24}
                strokeLinecap="round"
              />
              {/* Arco Direcional Curvo de Ponta Dupla (markerStart + markerEnd) */}
              <path
                data-testid="chamfer-gizmo-miter-curved-arrow"
                d={hingeMiterGizmo.arcSvg.arcPath}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={3.2}
                strokeLinecap="round"
                markerStart="url(#gizmo-arrow-amber-start)"
                markerEnd="url(#gizmo-arrow-amber)"
              />
              {/* Pega Circular Tátil Central no Meio do Arco */}
              <circle
                data-testid="chamfer-gizmo-miter-arc-handle"
                cx={hingeMiterGizmo.arcSvg.handlePos.x}
                cy={hingeMiterGizmo.arcSvg.handlePos.y}
                r={7}
                fill="#F59E0B"
                stroke={isDark ? "#0B1220" : "#FFFFFF"}
                strokeWidth={2}
              />
              {/* Badge Flutuante Clicável ao Vivo: ∠ -45.0° */}
              <g
                data-testid="chamfer-gizmo-miter-angle-badge"
                transform={`translate(${hingeMiterGizmo.origin.x}, ${hingeMiterGizmo.origin.y - 58})`}
                className="cursor-pointer"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  openFloatingNumpad(
                    "ANGLE",
                    "CORTE ESQUADRIA",
                    "°",
                    hingeMiterGizmo.liveAngleDeg || 45,
                    "miterAngle",
                    hingeMiterGizmo.edge?.entityId ?? primaryBody?.entityId,
                    miterEndTarget,
                  );
                }}
              >
                <rect
                  x={-44}
                  y={-11}
                  width={88}
                  height={22}
                  rx={7}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                />
                <text
                  x={0}
                  y={0.5}
                  fill="#F59E0B"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {`∠ ${hingeMiterGizmo.liveAngleDeg > 0 ? `+${hingeMiterGizmo.liveAngleDeg.toFixed(1)}` : hingeMiterGizmo.liveAngleDeg.toFixed(1)}° ✎`}
                </text>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* F. PONTOS MAGNÉTICOS DE SNAP DO PIVÔ 3D                           */}
          {/* ================================================================= */}
          {(isPickingPivotSnap || activeAxis === "pivot") &&
            (selectedBodiesList.length > 0 ? selectedBodiesList : primaryBody ? [primaryBody] : []).flatMap(
              (b) => b.snapCandidates,
            ).map((cand) => {
              const sp = toScreen(cand.point3D);
              return (
                <g
                  key={cand.id}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("action");
                    setMultiPivotMode("snap_point");
                    setCustomPivot3D(cand.point3D);
                    setSubSel((prev) => ({ ...prev, activePivot3D: cand.point3D }));
                    setSnappedPivotLabel(cand.label);
                    setIsPickingPivotSnap(false);
                  }}
                >
                  <circle
                    cx={sp.x}
                    cy={sp.y}
                    r={7}
                    fill="rgba(0, 180, 216, 0.25)"
                    stroke="#00B4D8"
                    strokeWidth={2}
                  />
                  <circle cx={sp.x} cy={sp.y} r={2.5} fill="#FFFFFF" />
                </g>
              );
            })}

          {/* ================================================================= */}
          {/* G. GIZMO DO CORPO (TRÍADE X/Y/Z + ROTAÇÃO + PIVÔ — REGRAS FLUX)   */}
          {/* ================================================================= */}
          {gizmoScreen &&
            selectionKind3D === "body" &&
            directTool !== "shell_3d" &&
            directTool !== "array_3d" && (
              <g data-testid="chamfer-gizmo-body-manipulator">
                {/* Linha Tracejada de Deslocamento + Pílula Clicável Pós-Arraste */}
                {(() => {
                  const isLiveLinear =
                    (activeAxis === "x" ||
                      activeAxis === "y" ||
                      activeAxis === "z" ||
                      activeAxis === "planar") &&
                    dragSessionRef.current?.startCenter3D != null;
                  const isCompletedLinear =
                    !activeAxis &&
                    lastCompletedDrag !== null &&
                    (lastCompletedDrag.axis === "x" ||
                      lastCompletedDrag.axis === "y" ||
                      lastCompletedDrag.axis === "z" ||
                      lastCompletedDrag.axis === "planar");

                  if (!isLiveLinear && !isCompletedLinear) return null;

                  const startSc = isLiveLinear
                    ? toScreen(dragSessionRef.current!.startCenter3D!)
                    : toScreen(lastCompletedDrag!.startPoint3D);
                  const endSc = isLiveLinear
                    ? gizmoScreen.origin
                    : toScreen(lastCompletedDrag!.endPoint3D);
                  const midX = (startSc.x + endSc.x) * 0.5;
                  const midY = (startSc.y + endSc.y) * 0.5;
                  const linearAxis = isLiveLinear
                    ? activeAxis!
                    : lastCompletedDrag!.axis;
                  const currentDistMm = isLiveLinear
                    ? dragDeltaMm
                    : lastCompletedDrag!.deltaMm;
                  const isCopyDrag = isLiveLinear
                    ? copyOnTransform
                    : lastCompletedDrag!.copyMode;
                  const targetEntityId =
                    (isCompletedLinear
                      ? lastCompletedDrag?.activeResultIds[0]
                      : primaryBody?.entityId) ??
                    primaryBody?.entityId ??
                    "";

                  return (
                    <g data-testid="chamfer-3d-displacement-dimension">
                      <circle
                        cx={startSc.x}
                        cy={startSc.y}
                        r={4.5}
                        fill="#0B1220"
                        stroke={isCopyDrag ? "#10B981" : "#38BDF8"}
                        strokeWidth={1.75}
                      />
                      <line
                        x1={startSc.x}
                        y1={startSc.y}
                        x2={endSc.x}
                        y2={endSc.y}
                        stroke={isCopyDrag ? "#10B981" : "#38BDF8"}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                      />
                      <circle
                        cx={endSc.x}
                        cy={endSc.y}
                        r={4}
                        fill={isCopyDrag ? "#10B981" : "#38BDF8"}
                        stroke="#0B1220"
                        strokeWidth={1.5}
                      />
                      {/* Durante o arraste ativo, o FLUX exibe 1 único HUD consolidado sem duplicar pílulas sobre a linha */}
                      {!isLiveLinear && (
                        <g
                          data-testid="chamfer-3d-displacement-pill"
                          transform={`translate(${midX}, ${midY - 22})`}
                          className="pointer-events-auto cursor-pointer"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            ev.preventDefault();
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            const paramKey =
                              linearAxis === "y"
                                ? "moveY"
                                : linearAxis === "z"
                                  ? "moveZ"
                                  : "moveX";
                            const axisName =
                              linearAxis === "y"
                                ? "Y"
                                : linearAxis === "z"
                                  ? "Z"
                                  : "X";
                            openFloatingNumpad(
                              "DISTANCE",
                              isCopyDrag
                                ? `CÓPIA DIST +${axisName}`
                                : `DESLOCAR +${axisName}`,
                              "mm",
                              currentDistMm || 100,
                              paramKey,
                              targetEntityId,
                              undefined,
                              isCopyDrag,
                            );
                          }}
                        >
                          <rect
                            x={-58}
                            y={-12}
                            width={116}
                            height={24}
                            rx={6}
                            fill={isDark ? "#060A12" : "#FFFFFF"}
                            stroke={isCopyDrag ? "#10B981" : "#00B4D8"}
                            strokeWidth={1.5}
                          />
                          <text
                            x={0}
                            y={1}
                            fill={
                              linearAxis === "z"
                                ? isDark
                                  ? "#60A5FA"
                                  : "#0284C7"
                                : isCopyDrag
                                  ? "#10B981"
                                  : isDark
                                    ? "#38BDF8"
                                    : "#0284C7"
                            }
                            fontSize="10.5"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {`${isCopyDrag ? "⧉ " : ""}Δ${linearAxis.toUpperCase()}: ${currentDistMm > 0 ? `+${currentDistMm}` : currentDistMm} mm ✎`}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })()}

                {/* ============================================================= */}
                {/* BÚSSOLA DE ROTAÇÃO EM RAIO EXTERNO (ESTILO SHAPR3D)           */}
                {/* ============================================================= */}
                {(() => {
                  const isLiveRotation =
                    activeAxis === "rot_x" ||
                    activeAxis === "rot_y" ||
                    activeAxis === "rot_z";
                  const isCompletedRotation =
                    !activeAxis &&
                    lastCompletedDrag !== null &&
                    (lastCompletedDrag.axis === "rot_x" ||
                      lastCompletedDrag.axis === "rot_y" ||
                      lastCompletedDrag.axis === "rot_z");

                  const showCompassRing = isLiveRotation || compassFadingOut;
                  const showAnglePill = isCompletedRotation;

                  if (!showCompassRing && !showAnglePill) return null;

                  const compassR = isLiveRotation
                    ? (dragSessionRef.current?.compassRadiusPx ?? gizmoScreen.compassRadiusPx)
                    : (lastCompletedDrag?.compassRadiusPx ?? gizmoScreen.compassRadiusPx);
                  const startAngleRad = isLiveRotation
                    ? (dragSessionRef.current?.angleStartRad ?? 0)
                    : (lastCompletedDrag?.angleStartRad ?? 0);
                  const currentDeg = isLiveRotation
                    ? (rotationSnapState?.snapResult.angleDeg ?? dragDeltaMm)
                    : (lastCompletedDrag?.deltaMm ?? 0);
                  const isSnapped = isLiveRotation
                    ? Boolean(rotationSnapState?.snapResult.snapped)
                    : currentDeg % 15 === 0;
                  const currentAngleRad = startAngleRad + (currentDeg * Math.PI) / 180;

                  const activeRotAxis = isLiveRotation
                    ? activeAxis
                    : (lastCompletedDrag?.axis ?? "rot_z");
                  const rotPlaneColor =
                    activeRotAxis === "rot_x"
                      ? "#EF4444"
                      : activeRotAxis === "rot_y"
                        ? "#22C55E"
                        : "#00B4D8";

                  const { sectorPath } = buildCompassSectorPath(
                    gizmoScreen.origin.x,
                    gizmoScreen.origin.y,
                    compassR,
                    startAngleRad,
                    currentDeg,
                  );

                  const startRimX =
                    gizmoScreen.origin.x + Math.cos(startAngleRad) * compassR;
                  const startRimY =
                    gizmoScreen.origin.y + Math.sin(startAngleRad) * compassR;
                  const activeRimX =
                    gizmoScreen.origin.x + Math.cos(currentAngleRad) * compassR;
                  const activeRimY =
                    gizmoScreen.origin.y + Math.sin(currentAngleRad) * compassR;

                  const rawPillX =
                    gizmoScreen.origin.x + Math.cos(currentAngleRad) * (compassR + 30);
                  const rawPillY =
                    gizmoScreen.origin.y + Math.sin(currentAngleRad) * (compassR + 30);
                  const pillX = Math.max(54, Math.min(width - 54, rawPillX));
                  const pillY = Math.max(58, Math.min(height - 58, rawPillY));

                  const degreeTicks = Array.from({ length: 72 }, (_, idx) => idx * 5);

                  return (
                    <g>
                      {showCompassRing && (
                        <g
                          data-testid="chamfer-3d-external-rotation-compass"
                          style={{
                            opacity: compassFadingOut && !isLiveRotation ? 0 : 1,
                            transition: "opacity 150ms ease-out",
                            pointerEvents: "none",
                          }}
                        >
                          {sectorPath && (
                            <path
                              d={sectorPath}
                              fill="rgba(0, 180, 216, 0.14)"
                              stroke="rgba(0, 180, 216, 0.38)"
                              strokeWidth={1}
                            />
                          )}
                          <circle
                            cx={gizmoScreen.origin.x}
                            cy={gizmoScreen.origin.y}
                            r={compassR + 5}
                            fill="none"
                            stroke={rotPlaneColor}
                            strokeWidth={0.75}
                            opacity={0.28}
                          />
                          <circle
                            cx={gizmoScreen.origin.x}
                            cy={gizmoScreen.origin.y}
                            r={compassR}
                            fill="none"
                            stroke={isDark ? "#F8FAFC" : "#0F172A"}
                            strokeWidth={1.35}
                            strokeDasharray="4 3"
                            opacity={0.82}
                          />
                          {degreeTicks.map((deg) => {
                            const rad = startAngleRad + (deg * Math.PI) / 180;
                            const isCardinal = deg % 90 === 0;
                            const isMajor45 = deg % 45 === 0;
                            const isMedium15 = deg % 15 === 0;
                            const tickLen = isCardinal
                              ? 11
                              : isMajor45
                                ? 8
                                : isMedium15
                                  ? 5.5
                                  : 3;
                            const innerR = compassR - tickLen;
                            const tx1 = gizmoScreen.origin.x + Math.cos(rad) * innerR;
                            const ty1 = gizmoScreen.origin.y + Math.sin(rad) * innerR;
                            const tx2 = gizmoScreen.origin.x + Math.cos(rad) * compassR;
                            const ty2 = gizmoScreen.origin.y + Math.sin(rad) * compassR;

                            return (
                              <g key={deg}>
                                <line
                                  x1={tx1}
                                  y1={ty1}
                                  x2={tx2}
                                  y2={ty2}
                                  stroke={
                                    isCardinal
                                      ? "#00B4D8"
                                      : isMajor45
                                        ? isDark
                                          ? "#F8FAFC"
                                          : "#0F172A"
                                        : isDark
                                          ? "#94A3B8"
                                          : "#475569"
                                  }
                                  strokeWidth={
                                    isCardinal ? 1.85 : isMajor45 ? 1.35 : isMedium15 ? 1 : 0.65
                                  }
                                  opacity={
                                    isCardinal ? 0.95 : isMajor45 ? 0.85 : isMedium15 ? 0.65 : 0.35
                                  }
                                />
                                {isMajor45 && (
                                  <text
                                    x={
                                      gizmoScreen.origin.x +
                                      Math.cos(rad) * (compassR - tickLen - 9)
                                    }
                                    y={
                                      gizmoScreen.origin.y +
                                      Math.sin(rad) * (compassR - tickLen - 9)
                                    }
                                    fill={
                                      isCardinal
                                        ? "#00B4D8"
                                        : isDark
                                          ? "#94A3B8"
                                          : "#64748B"
                                    }
                                    fontSize="8.5"
                                    fontWeight="bold"
                                    fontFamily="monospace"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    opacity={isCardinal ? 0.95 : 0.75}
                                  >
                                    {deg}°
                                  </text>
                                )}
                              </g>
                            );
                          })}
                          <line
                            x1={gizmoScreen.origin.x}
                            y1={gizmoScreen.origin.y}
                            x2={startRimX}
                            y2={startRimY}
                            stroke={isDark ? "#94A3B8" : "#64748B"}
                            strokeWidth={1.15}
                            strokeDasharray="3 3"
                            opacity={0.75}
                          />
                          <line
                            x1={gizmoScreen.origin.x}
                            y1={gizmoScreen.origin.y}
                            x2={activeRimX}
                            y2={activeRimY}
                            stroke={isSnapped ? "#00B4D8" : rotPlaneColor}
                            strokeWidth={1.75}
                            strokeDasharray="4 2"
                          />
                          <circle
                            cx={activeRimX}
                            cy={activeRimY}
                            r={isSnapped ? 6.5 : 5}
                            fill={isSnapped ? "#00B4D8" : rotPlaneColor}
                            stroke={isDark ? "#0F172A" : "#FFFFFF"}
                            strokeWidth={2}
                          />
                        </g>
                      )}

                      {/* Pílula Clicável Pós-Giro (Durante o giro ao vivo, o HUD Consolidado FLUX assume a leitura) */}
                      {showAnglePill && (
                        <g
                          data-testid="chamfer-3d-live-rotation-angle-pill"
                          transform={`translate(${pillX}, ${pillY})`}
                          className="pointer-events-auto cursor-pointer"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            ev.preventDefault();
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (!primaryBody) return;
                            const rotParam =
                              activeRotAxis === "rot_x"
                                ? "rx"
                                : activeRotAxis === "rot_y"
                                  ? "ry"
                                  : "rz";
                            const rotLabel =
                              activeRotAxis === "rot_x"
                                ? "GIRAR EIXO X"
                                : activeRotAxis === "rot_y"
                                  ? "GIRAR EIXO Y"
                                  : "GIRAR EIXO Z";
                            openFloatingNumpad(
                              "ANGLE",
                              rotLabel,
                              "°",
                              currentDeg || 45,
                              rotParam,
                              lastCompletedDrag?.activeResultIds[0] ?? primaryBody.entityId,
                              undefined,
                              copyOnTransform || Boolean(lastCompletedDrag?.copyMode),
                            );
                          }}
                        >
                          <rect
                            x={-42}
                            y={-13}
                            width={84}
                            height={26}
                            rx={13}
                            fill={isDark ? "#0F172A" : "#FFFFFF"}
                            stroke={isSnapped ? "#00B4D8" : rotPlaneColor}
                            strokeWidth={1.75}
                          />
                          <text
                            x={0}
                            y={0.5}
                            fill={isDark ? "#F8FAFC" : "#0F172A"}
                            fontSize="11"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {`${currentDeg > 0 ? `+${currentDeg}` : currentDeg}° ✎`}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })()}

                {/* ============================================================= */}
                {/* 3 EIXOS LINEARES (+X, +Y, +Z) — GERENCIADOS PELO FLUX         */}
                {/* ============================================================= */}
                {/* Eixo X (Vermelho) */}
                {fluxState.showAxisX && (
                  <g
                    data-testid="chamfer-gizmo-axis-x"
                    className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                    style={{ touchAction: "none" }}
                    onPointerDown={(ev) =>
                      handleAxisPointerDown(
                        "x",
                        gizmoScreen.x.ux,
                        gizmoScreen.x.uy,
                        gizmoScreen.x.pixelsPerMm,
                        ev,
                        gizmoScreen.x.axisVec3D,
                      )
                    }
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <line
                      x1={gizmoScreen.origin.x}
                      y1={gizmoScreen.origin.y}
                      x2={gizmoScreen.x.endX}
                      y2={gizmoScreen.x.endY}
                      stroke="rgba(0,0,0,0.001)"
                      strokeWidth={22}
                      style={{ pointerEvents: "stroke" }}
                    />
                    <line
                      x1={gizmoScreen.origin.x}
                      y1={gizmoScreen.origin.y}
                      x2={gizmoScreen.x.endX}
                      y2={gizmoScreen.x.endY}
                      stroke="#EF4444"
                      strokeWidth={activeAxis === "x" ? 2.85 : 1.75}
                      markerEnd="url(#gizmo-arrow-x)"
                      style={{ pointerEvents: "stroke" }}
                    />
                    <circle
                      cx={gizmoScreen.x.endX + gizmoScreen.x.ux * 14}
                      cy={gizmoScreen.x.endY + gizmoScreen.x.uy * 14}
                      r={10.5}
                      fill={isDark ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.92)"}
                      stroke="rgba(239, 68, 68, 0.65)"
                      strokeWidth={1.1}
                      style={{ pointerEvents: "all" }}
                      className="cursor-pointer"
                    />
                    <text
                      x={gizmoScreen.x.endX + gizmoScreen.x.ux * 14}
                      y={gizmoScreen.x.endY + gizmoScreen.x.uy * 14}
                      fill="#EF4444"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none" }}
                    >
                      +X
                    </text>
                  </g>
                )}

                {/* Eixo Y (Verde) */}
                {fluxState.showAxisY && (
                  <g
                    data-testid="chamfer-gizmo-axis-y"
                    className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                    style={{ touchAction: "none" }}
                    onPointerDown={(ev) =>
                      handleAxisPointerDown(
                        "y",
                        gizmoScreen.y.ux,
                        gizmoScreen.y.uy,
                        gizmoScreen.y.pixelsPerMm,
                        ev,
                        gizmoScreen.y.axisVec3D,
                      )
                    }
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <line
                      x1={gizmoScreen.origin.x}
                      y1={gizmoScreen.origin.y}
                      x2={gizmoScreen.y.endX}
                      y2={gizmoScreen.y.endY}
                      stroke="rgba(0,0,0,0.001)"
                      strokeWidth={22}
                      style={{ pointerEvents: "stroke" }}
                    />
                    <line
                      x1={gizmoScreen.origin.x}
                      y1={gizmoScreen.origin.y}
                      x2={gizmoScreen.y.endX}
                      y2={gizmoScreen.y.endY}
                      stroke="#22C55E"
                      strokeWidth={activeAxis === "y" ? 2.85 : 1.75}
                      markerEnd="url(#gizmo-arrow-y)"
                      style={{ pointerEvents: "stroke" }}
                    />
                    <circle
                      cx={gizmoScreen.y.endX + gizmoScreen.y.ux * 14}
                      cy={gizmoScreen.y.endY + gizmoScreen.y.uy * 14}
                      r={10.5}
                      fill={isDark ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.92)"}
                      stroke="rgba(34, 197, 94, 0.65)"
                      strokeWidth={1.1}
                      style={{ pointerEvents: "all" }}
                      className="cursor-pointer"
                    />
                    <text
                      x={gizmoScreen.y.endX + gizmoScreen.y.ux * 14}
                      y={gizmoScreen.y.endY + gizmoScreen.y.uy * 14}
                      fill="#22C55E"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none" }}
                    >
                      +Y
                    </text>
                  </g>
                )}

                {/* Eixo Z (Azul #3B82F6 ficando Âmbar #F59E0B ao arrastar) */}
                {fluxState.showAxisZ && (
                  <g
                    data-testid="chamfer-gizmo-axis-z"
                    className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                    style={{ touchAction: "none" }}
                    onPointerDown={(ev) =>
                      handleAxisPointerDown(
                        directTool === "extrude_3d" && selectionKind3D !== "body"
                          ? "extrude"
                          : "z",
                        gizmoScreen.z.ux,
                        gizmoScreen.z.uy,
                        gizmoScreen.z.pixelsPerMm,
                        ev,
                        gizmoScreen.z.axisVec3D,
                      )
                    }
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <line
                      x1={gizmoScreen.origin.x}
                      y1={gizmoScreen.origin.y}
                      x2={gizmoScreen.z.endX}
                      y2={gizmoScreen.z.endY}
                      stroke="rgba(0,0,0,0.001)"
                      strokeWidth={22}
                      style={{ pointerEvents: "stroke" }}
                    />
                    <line
                      x1={gizmoScreen.origin.x}
                      y1={gizmoScreen.origin.y}
                      x2={gizmoScreen.z.endX}
                      y2={gizmoScreen.z.endY}
                      stroke={activeAxis === "z" ? "#F59E0B" : "#3B82F6"}
                      strokeWidth={
                        activeAxis === "z" || activeAxis === "extrude" ? 2.85 : 1.75
                      }
                      markerEnd={
                        activeAxis === "z"
                          ? "url(#gizmo-arrow-amber)"
                          : "url(#gizmo-arrow-z-blue)"
                      }
                      style={{ pointerEvents: "stroke" }}
                    />
                    <circle
                      cx={gizmoScreen.z.endX + gizmoScreen.z.ux * 14}
                      cy={gizmoScreen.z.endY + gizmoScreen.z.uy * 14}
                      r={10.5}
                      fill={isDark ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.92)"}
                      stroke={
                        activeAxis === "z"
                          ? "rgba(245, 158, 11, 0.8)"
                          : "rgba(59, 130, 246, 0.65)"
                      }
                      strokeWidth={1.1}
                      style={{ pointerEvents: "all" }}
                      className="cursor-pointer"
                    />
                    <text
                      x={gizmoScreen.z.endX + gizmoScreen.z.ux * 14}
                      y={gizmoScreen.z.endY + gizmoScreen.z.uy * 14}
                      fill={activeAxis === "z" ? "#F59E0B" : "#3B82F6"}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: "none" }}
                    >
                      {directTool === "extrude_3d" && selectionKind3D !== "body"
                        ? "EXT"
                        : "+Z"}
                    </text>
                  </g>
                )}

                {/* ============================================================= */}
                {/* ALÇAS DE GIRO E BOTÃO TÁTIL "GIRAR ↻" (OCULTOS EM DRAG LINEAR) */}
                {/* ============================================================= */}
                {fluxState.showRotationHandles && (
                  <>
                    {(activeAxis === null || activeAxis === "rot_z") && (
                      <g
                        data-testid="chamfer-gizmo-rot-z"
                        className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                        style={{ touchAction: "none" }}
                        onPointerDown={(ev) => handleAxisPointerDown("rot_z", 0, 0, 1, ev)}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <path
                          d={`M ${gizmoScreen.origin.x + gizmoScreen.x.ux * 32} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 32} A 32 32 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.y.ux * 32} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 32}`}
                          fill="none"
                          stroke="rgba(0,0,0,0.001)"
                          strokeWidth={20}
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${gizmoScreen.origin.x + gizmoScreen.x.ux * 32} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 32} A 32 32 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.y.ux * 32} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 32}`}
                          fill="none"
                          stroke={activeAxis === "rot_z" ? "#00B4D8" : "#F59E0B"}
                          strokeWidth={activeAxis === "rot_z" ? 3.0 : 2.1}
                          strokeLinecap="round"
                          opacity={activeAxis === "rot_z" ? 1 : 0.92}
                        />
                      </g>
                    )}

                    {(activeAxis === null || activeAxis === "rot_x") && (
                      <g
                        data-testid="chamfer-gizmo-rot-x"
                        className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                        style={{ touchAction: "none" }}
                        onPointerDown={(ev) => handleAxisPointerDown("rot_x", 0, 0, 1, ev)}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <path
                          d={`M ${gizmoScreen.origin.x + gizmoScreen.y.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 27} A 27 27 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.z.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.z.uy * 27}`}
                          fill="none"
                          stroke="rgba(0,0,0,0.001)"
                          strokeWidth={18}
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${gizmoScreen.origin.x + gizmoScreen.y.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 27} A 27 27 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.z.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.z.uy * 27}`}
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth={activeAxis === "rot_x" ? 2.8 : 1.9}
                          strokeLinecap="round"
                          opacity={activeAxis === "rot_x" ? 1 : 0.88}
                        />
                      </g>
                    )}

                    {(activeAxis === null || activeAxis === "rot_y") && (
                      <g
                        data-testid="chamfer-gizmo-rot-y"
                        className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                        style={{ touchAction: "none" }}
                        onPointerDown={(ev) => handleAxisPointerDown("rot_y", 0, 0, 1, ev)}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <path
                          d={`M ${gizmoScreen.origin.x + gizmoScreen.z.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.z.uy * 27} A 27 27 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.x.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 27}`}
                          fill="none"
                          stroke="rgba(0,0,0,0.001)"
                          strokeWidth={18}
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${gizmoScreen.origin.x + gizmoScreen.z.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.z.uy * 27} A 27 27 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.x.ux * 27} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 27}`}
                          fill="none"
                          stroke="#22C55E"
                          strokeWidth={activeAxis === "rot_y" ? 2.8 : 1.9}
                          strokeLinecap="round"
                          opacity={activeAxis === "rot_y" ? 1 : 0.88}
                        />
                      </g>
                    )}

                    {(() => {
                      const rotPlacement = computeViewAlignedRotationHandlePlacement(
                        gizmoScreen.origin,
                        { x: gizmoScreen.x.endX, y: gizmoScreen.x.endY },
                        { x: gizmoScreen.y.endX, y: gizmoScreen.y.endY },
                        { x: gizmoScreen.z.endX, y: gizmoScreen.z.endY },
                        58,
                      );
                      const isRotatingAny =
                        activeAxis === "rot_z" ||
                        activeAxis === "rot_x" ||
                        activeAxis === "rot_y";
                      return (
                        <g
                          data-testid="chamfer-gizmo-rotate-handle-btn"
                          className="pointer-events-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                          style={{ touchAction: "none" }}
                          onPointerDown={(ev) => handleAxisPointerDown("rot_z", 0, 0, 1, ev)}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <path
                            d={rotPlacement.arcPath}
                            fill="none"
                            stroke="rgba(0,0,0,0.001)"
                            strokeWidth={26}
                            strokeLinecap="round"
                          />
                          <path
                            d={rotPlacement.arcPath}
                            fill="none"
                            stroke={isRotatingAny ? "#00B4D8" : "#F59E0B"}
                            strokeWidth={isRotatingAny ? 3.2 : 2.35}
                            strokeLinecap="round"
                          />
                          <circle
                            cx={rotPlacement.startTip.x}
                            cy={rotPlacement.startTip.y}
                            r={2.8}
                            fill={isRotatingAny ? "#00B4D8" : "#F59E0B"}
                          />
                          <circle
                            cx={rotPlacement.endTip.x}
                            cy={rotPlacement.endTip.y}
                            r={2.8}
                            fill={isRotatingAny ? "#00B4D8" : "#F59E0B"}
                          />
                          <circle
                            cx={rotPlacement.handlePos.x}
                            cy={rotPlacement.handlePos.y}
                            r={12.5}
                            fill={
                              isRotatingAny
                                ? "#0284C7"
                                : isDark
                                  ? "rgba(15, 23, 42, 0.94)"
                                  : "rgba(255, 255, 255, 0.96)"
                            }
                            stroke={isRotatingAny ? "#38BDF8" : "#F59E0B"}
                            strokeWidth={2}
                          />
                          <text
                            x={rotPlacement.handlePos.x}
                            y={rotPlacement.handlePos.y}
                            fill={isRotatingAny ? "#FFFFFF" : "#F59E0B"}
                            fontSize="12"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                            dominantBaseline="central"
                            style={{ pointerEvents: "none" }}
                          >
                            ↻
                          </text>
                        </g>
                      );
                    })()}
                  </>
                )}

                {/* ============================================================= */}
                {/* PIVÔ CENTRAL (12px): ANEL DUPLO CIRÚRGICO BRANCO + CIANO      */}
                {/* ============================================================= */}
                {fluxState.showPivotHandle && (
                  <g
                    data-testid="chamfer-gizmo-pivot-handle"
                    className="pointer-events-auto cursor-move"
                    style={{ touchAction: "none" }}
                    onPointerDown={(ev) =>
                      handleAxisPointerDown("pivot", 0, 0, 1, ev)
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("selection");
                      setIsPickingPivotSnap((p) => !p);
                    }}
                  >
                    <circle
                      cx={gizmoScreen.origin.x}
                      cy={gizmoScreen.origin.y}
                      r={15}
                      fill="rgba(0,0,0,0.001)"
                    />
                    <circle
                      cx={gizmoScreen.origin.x}
                      cy={gizmoScreen.origin.y}
                      r={6}
                      fill="#FFFFFF"
                      stroke={
                        isPickingPivotSnap || activeAxis === "pivot"
                          ? "#F59E0B"
                          : "#00B4D8"
                      }
                      strokeWidth={1.75}
                    />
                    <circle
                      cx={gizmoScreen.origin.x}
                      cy={gizmoScreen.origin.y}
                      r={2.8}
                      fill={
                        isPickingPivotSnap || activeAxis === "pivot"
                          ? "#F59E0B"
                          : "#00B4D8"
                      }
                    />
                  </g>
                )}
              </g>
            )}

          {/* ================================================================= */}
          {/* H. PLANO DE CORTE EM SEÇÃO 3D AO VIVO (SECTION PLANE + HACHURA)   */}
          {/* ================================================================= */}
          {sectionPlaneState.enabled &&
            (() => {
              const secRes = evaluateSectionPlane3DCrossSection(scene, sectionPlaneState);
              return (
                <g data-testid="chamfer-3d-section-plane-overlay">
                  {secRes.cutPolygons3D.map((poly, pIdx) => {
                    const pts = poly
                      .map((p) => {
                        const s = toScreen(p);
                        return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
                      })
                      .join(" ");
                    return (
                      <polygon
                        key={`sec_poly_${pIdx}`}
                        points={pts}
                        fill="rgba(244, 63, 94, 0.14)"
                        stroke="#F43F5E"
                        strokeWidth={2}
                        strokeDasharray="6 3"
                      />
                    );
                  })}
                  {secRes.hatchSegments3D.map(([a, b], hIdx) => {
                    const sa = toScreen(a);
                    const sb = toScreen(b);
                    return (
                      <line
                        key={`sec_hatch_${hIdx}`}
                        x1={sa.x}
                        y1={sa.y}
                        x2={sb.x}
                        y2={sb.y}
                        stroke="#FB7185"
                        strokeWidth={1.1}
                        opacity={0.75}
                      />
                    );
                  })}
                </g>
              );
            })()}

          {/* ================================================================= */}
          {/* H2. PREVIEW 3D EM TEMPO REAL DA PAREDE DO SHELL / TUBO VAZADO     */}
          {/* ================================================================= */}
          {directTool === "shell_3d" &&
            (() => {
              const shellBody = primaryBody ?? scene.bodies[0] ?? null;
              if (!shellBody) return null;
              const wallT =
                shellBody.shellWallThicknessMm || shellBody.shellThicknessMm || 4.75;
              const activeCaps =
                shellBody.shellOpenCaps.length > 0
                  ? shellBody.shellOpenCaps
                  : resolvedShellOpenCaps;
              const openTop = activeCaps.includes("top");
              const openBottom = activeCaps.includes("bottom");
              const ringFaces = shellBody.faces.filter((f) => {
                if (f.role === "inner_side" || f.role === "inner_bottom") return false;
                const fCap = resolveFaceShellCapDirection3D(f);
                return activeCaps.includes(fCap);
              });
              const innerMouthEdges = shellBody.edges.filter(
                (e) =>
                  (openTop && e.role === "inner_top") ||
                  (openBottom && e.role === "inner_bottom"),
              );
              const outerMouthEdges = shellBody.edges.filter(
                (e) =>
                  (openTop && e.role === "top_perimeter") ||
                  (openBottom && e.role === "bottom_perimeter"),
              );
              const topCenterSc = toScreen({
                x: shellBody.pivot3D.x,
                y: shellBody.pivot3D.y,
                z: shellBody.bbox3D.maxZ,
              });
              const capLabelsMap: Record<ShellOpenCap3D, string> = {
                top: "+Z Topo",
                bottom: "-Z Base",
                right: "+X Dir",
                left: "-X Esq",
                front: "+Y Frente",
                back: "-Y Trás",
              };
              const capsSummary = activeCaps.map((c) => capLabelsMap[c] ?? c).join(" / ");

              return (
                <g
                  data-testid="chamfer-3d-shell-live-preview"
                  style={{ pointerEvents: "none" }}
                >
                  {/* Destaque ciano translúcido nas faces de parede de espessura t nas bocas abertas */}
                  {ringFaces.map((rf) => {
                    if (!rf.polygon3D || rf.polygon3D.length < 3) return null;
                    const pts = rf.polygon3D
                      .map((p) => {
                        const sc = toScreen(p);
                        return `${sc.x.toFixed(1)},${sc.y.toFixed(1)}`;
                      })
                      .join(" ");
                    return (
                      <polygon
                        key={`shell_ring_face_${rf.faceId}`}
                        points={pts}
                        fill="rgba(0, 229, 255, 0.24)"
                        stroke="#00E5FF"
                        strokeWidth={1.3}
                      />
                    );
                  })}

                  {/* Contorno externo e anel interno da parede t em ciano técnico nítido */}
                  {outerMouthEdges.map((oe) => {
                    const pts = oe.polyline3D
                      .map((p) => {
                        const sc = toScreen(p);
                        return `${sc.x.toFixed(1)},${sc.y.toFixed(1)}`;
                      })
                      .join(" ");
                    return (
                      <polyline
                        key={`shell_outer_mouth_${oe.edgeId}`}
                        points={pts}
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth={1.8}
                      />
                    );
                  })}
                  {innerMouthEdges.map((ie) => {
                    const pts = ie.polyline3D
                      .map((p) => {
                        const sc = toScreen(p);
                        return `${sc.x.toFixed(1)},${sc.y.toFixed(1)}`;
                      })
                      .join(" ");
                    return (
                      <polyline
                        key={`shell_inner_mouth_${ie.edgeId}`}
                        points={pts}
                        fill="rgba(2, 6, 23, 0.55)"
                        stroke="#00E5FF"
                        strokeWidth={2.4}
                      />
                    );
                  })}

                  {/* Etiqueta técnica da espessura da parede e face aberta */}
                  <g transform={`translate(${topCenterSc.x}, ${topCenterSc.y - 24})`}>
                    <rect
                      x={-124}
                      y={-11}
                      width={248}
                      height={20}
                      rx={6}
                      fill={isDark ? "rgba(8, 47, 73, 0.92)" : "rgba(224, 242, 254, 0.96)"}
                      stroke="#00E5FF"
                      strokeWidth={1.2}
                    />
                    <text
                      x={0}
                      y={1}
                      fill={isDark ? "#67E8F9" : "#0369A1"}
                      fontSize="9.2"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {`t=${wallT}mm • ${shellOpenCapsMode === "both_ends" ? "Tubo" : "Caixa"} (${capsSummary})`}
                    </text>
                  </g>
                </g>
              );
            })()}

          {/* ================================================================= */}
          {/* I. PREVIEW 3D AO VIVO DO ARRAY INTELIGENTE / GRADE (TUBOS GHOST)  */}
          {/*    Sempre com pontas retas de 90° (Topo Reto) por padrão!         */}
          {/* ================================================================= */}
          {directTool === "array_3d" &&
            smartArrayPanelTab === "grille_span" &&
            smartArraySourceBody &&
            smartArrayCalc.centerCoordsMm.length > 0 &&
            (() => {
              const srcBody = smartArraySourceBody;
              const startPt3D: Vec3Mm = {
                x:
                  smartArrayAxis === "x"
                    ? smartArrayCalc.startInnerCoordMm
                    : srcBody.pivot3D.x,
                y:
                  smartArrayAxis === "y"
                    ? smartArrayCalc.startInnerCoordMm
                    : srcBody.pivot3D.y,
                z:
                  smartArrayAxis === "z"
                    ? smartArrayCalc.startInnerCoordMm
                    : srcBody.elevationZ + srcBody.extrudeHeightMm * 0.5,
              };
              const endPt3D: Vec3Mm = {
                x:
                  smartArrayAxis === "x"
                    ? smartArrayCalc.endInnerCoordMm
                    : srcBody.pivot3D.x,
                y:
                  smartArrayAxis === "y"
                    ? smartArrayCalc.endInnerCoordMm
                    : srcBody.pivot3D.y,
                z:
                  smartArrayAxis === "z"
                    ? smartArrayCalc.endInnerCoordMm
                    : srcBody.elevationZ + srcBody.extrudeHeightMm * 0.5,
              };
              const spanStartSc = toScreen(startPt3D);
              const spanEndSc = toScreen(endPt3D);
              const spanMidSc = {
                x: (spanStartSc.x + spanEndSc.x) * 0.5,
                y: (spanStartSc.y + spanEndSc.y) * 0.5 - 16,
              };

              const tubeHalfW = Math.max(2, smartArrayCalc.tubeWidthMm * 0.5);
              const hasPerpSpan =
                typeof smartArrayCalc.perpInnerStartMm === "number" &&
                typeof smartArrayCalc.perpInnerEndMm === "number" &&
                typeof smartArrayCalc.perpSpanMm === "number" &&
                smartArrayCalc.perpSpanMm > 10;
              const z0 = srcBody.elevationZ;
              const z1 = srcBody.elevationZ + Math.max(2, srcBody.extrudeHeightMm);

              return (
                <g
                  data-testid="chamfer-3d-smart-array-preview"
                  style={{ pointerEvents: "none" }}
                >
                  {/* Linha de cota do Vão Livre Detectado */}
                  <line
                    x1={spanStartSc.x}
                    y1={spanStartSc.y}
                    x2={spanEndSc.x}
                    y2={spanEndSc.y}
                    stroke="#10B981"
                    strokeWidth={1.75}
                    strokeDasharray="5 3"
                  />
                  <circle cx={spanStartSc.x} cy={spanStartSc.y} r={3.5} fill="#10B981" />
                  <circle cx={spanEndSc.x} cy={spanEndSc.y} r={3.5} fill="#10B981" />
                  <g transform={`translate(${spanMidSc.x}, ${spanMidSc.y})`}>
                    <rect
                      x={-110}
                      y={-11}
                      width={220}
                      height={20}
                      rx={6}
                      fill={isDark ? "rgba(6, 78, 59, 0.92)" : "rgba(236, 253, 245, 0.96)"}
                      stroke="#10B981"
                      strokeWidth={1.2}
                    />
                    <text
                      x={0}
                      y={1}
                      fill={isDark ? "#A7F3D0" : "#065F46"}
                      fontSize="9.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {`Vão: ${smartArrayCalc.spanMm}mm • Luz: ${smartArrayCalc.clearGapMm}mm (90°)`}
                    </text>
                  </g>

                  {/* Tubos fantasma (Ghost Preview 3D) com pontas retas de 90° em cada posição */}
                  {smartArrayCalc.centerCoordsMm.map((centerCoord, tIdx) => {
                    const bxMin =
                      smartArrayAxis === "x"
                        ? centerCoord - tubeHalfW
                        : hasPerpSpan
                          ? smartArrayCalc.perpInnerStartMm!
                          : srcBody.bbox3D.minX;
                    const bxMax =
                      smartArrayAxis === "x"
                        ? centerCoord + tubeHalfW
                        : hasPerpSpan
                          ? smartArrayCalc.perpInnerEndMm!
                          : srcBody.bbox3D.maxX;
                    const byMin =
                      smartArrayAxis === "y"
                        ? centerCoord - tubeHalfW
                        : hasPerpSpan && smartArrayAxis === "x"
                          ? smartArrayCalc.perpInnerStartMm!
                          : srcBody.bbox3D.minY;
                    const byMax =
                      smartArrayAxis === "y"
                        ? centerCoord + tubeHalfW
                        : hasPerpSpan && smartArrayAxis === "x"
                          ? smartArrayCalc.perpInnerEndMm!
                          : srcBody.bbox3D.maxY;
                    const bzMin = smartArrayAxis === "z" ? centerCoord - tubeHalfW : z0;
                    const bzMax = smartArrayAxis === "z" ? centerCoord + tubeHalfW : z1;

                    const boxFaces3D: Vec3Mm[][] = [
                      // Topo (+Z)
                      [
                        { x: bxMin, y: byMin, z: bzMax },
                        { x: bxMax, y: byMin, z: bzMax },
                        { x: bxMax, y: byMax, z: bzMax },
                        { x: bxMin, y: byMax, z: bzMax },
                      ],
                      // Base (-Z)
                      [
                        { x: bxMin, y: byMin, z: bzMin },
                        { x: bxMax, y: byMin, z: bzMin },
                        { x: bxMax, y: byMax, z: bzMin },
                        { x: bxMin, y: byMax, z: bzMin },
                      ],
                      // Frente / Trás / Esq / Dir (90° retos)
                      [
                        { x: bxMin, y: byMin, z: bzMin },
                        { x: bxMax, y: byMin, z: bzMin },
                        { x: bxMax, y: byMin, z: bzMax },
                        { x: bxMin, y: byMin, z: bzMax },
                      ],
                      [
                        { x: bxMax, y: byMin, z: bzMin },
                        { x: bxMax, y: byMax, z: bzMin },
                        { x: bxMax, y: byMax, z: bzMax },
                        { x: bxMax, y: byMin, z: bzMax },
                      ],
                      [
                        { x: bxMax, y: byMax, z: bzMin },
                        { x: bxMin, y: byMax, z: bzMin },
                        { x: bxMin, y: byMax, z: bzMax },
                        { x: bxMax, y: byMax, z: bzMax },
                      ],
                      [
                        { x: bxMin, y: byMax, z: bzMin },
                        { x: bxMin, y: byMin, z: bzMin },
                        { x: bxMin, y: byMin, z: bzMax },
                        { x: bxMin, y: byMax, z: bzMax },
                      ],
                    ];

                    return (
                      <g key={`ghost_tube_${tIdx}`}>
                        {boxFaces3D.map((poly3D, fIdx) => {
                          const pts = poly3D
                            .map((v) => {
                              const sc = toScreen(v);
                              return `${sc.x.toFixed(1)},${sc.y.toFixed(1)}`;
                            })
                            .join(" ");
                          return (
                            <polygon
                              key={`ghost_f_${tIdx}_${fIdx}`}
                              points={pts}
                              fill="rgba(16, 185, 129, 0.16)"
                              stroke="#10B981"
                              strokeWidth={1.35}
                              strokeDasharray="3 2"
                            />
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              );
            })()}

          {/* ================================================================= */}
          {/* I2. PREVIEW 3D EM TEMPO REAL DO QUADRO EM 45° (ESQUADRIA FECHADA) */}
          {/* ================================================================= */}
          {directTool === "array_3d" &&
            smartArrayPanelTab === "miter_frame" &&
            smartMiterFrameCalc.members.length > 0 &&
            (() => {
              const yawRad = ((orbitProjection?.yawDeg ?? 45) * Math.PI) / 180;
              const pitchRad = ((orbitProjection?.pitchDeg ?? 35.264) * Math.PI) / 180;
              const camDir = {
                x: Math.cos(pitchRad) * Math.sin(yawRad),
                y: -Math.cos(pitchRad) * Math.cos(yawRad),
                z: Math.sin(pitchRad),
              };

              const barMeshes = smartMiterFrameCalc.members.map((member, mIdx) => {
                const poly = buildHorizontalMiterBar3DPolygons(member);
                const sortedQuads = [...poly.quads3D].sort((qa, qb) => {
                  const ca = qa.vertices3D.reduce(
                    (acc, v) => ({ x: acc.x + v.x * 0.25, y: acc.y + v.y * 0.25, z: acc.z + v.z * 0.25 }),
                    { x: 0, y: 0, z: 0 },
                  );
                  const cb = qb.vertices3D.reduce(
                    (acc, v) => ({ x: acc.x + v.x * 0.25, y: acc.y + v.y * 0.25, z: acc.z + v.z * 0.25 }),
                    { x: 0, y: 0, z: 0 },
                  );
                  const da = ca.x * camDir.x + ca.y * camDir.y + ca.z * camDir.z;
                  const db = cb.x * camDir.x + cb.y * camDir.y + cb.z * camDir.z;
                  return da - db;
                });
                return { member, mIdx, sortedQuads, featureLines3D: poly.featureLines3D };
              });

              const bb = smartMiterFrameCalc.bbox3D;
              const topMidSc = toScreen({
                x: (bb.minX + bb.maxX) * 0.5,
                y: bb.maxY,
                z: bb.maxZ,
              });

              return (
                <g
                  data-testid="chamfer-3d-miter-frame-preview"
                  style={{ pointerEvents: "none" }}
                >
                  {barMeshes.map(({ mIdx, sortedQuads, featureLines3D }) => (
                    <g key={`miter_frame_bar_preview_${mIdx}`}>
                      {sortedQuads.map((q) => {
                        if (q.kind === "inner_wall") return null;
                        const pts = q.vertices3D
                          .map((v) => {
                            const sc = toScreen(v);
                            return `${sc.x.toFixed(1)},${sc.y.toFixed(1)}`;
                          })
                          .join(" ");
                        const fill =
                          q.kind === "top"
                            ? "rgba(16, 185, 129, 0.34)"
                            : q.kind === "miter_cap"
                              ? "rgba(56, 189, 248, 0.38)"
                              : "rgba(5, 150, 105, 0.24)";
                        return (
                          <polygon
                            key={`mf_q_${mIdx}_${q.id}`}
                            points={pts}
                            fill={fill}
                            stroke="none"
                          />
                        );
                      })}
                      {featureLines3D.map(([p0, p1], lIdx) => {
                        const s0 = toScreen(p0);
                        const s1 = toScreen(p1);
                        const isMiterDiagonal = lIdx % 3 !== 0;
                        return (
                          <line
                            key={`mf_line_${mIdx}_${lIdx}`}
                            x1={s0.x}
                            y1={s0.y}
                            x2={s1.x}
                            y2={s1.y}
                            stroke={isMiterDiagonal ? "#38BDF8" : "#10B981"}
                            strokeWidth={isMiterDiagonal ? 2.1 : 1.5}
                          />
                        );
                      })}
                    </g>
                  ))}

                  {/* Etiqueta técnica flutuante do Quadro 45° */}
                  <g transform={`translate(${topMidSc.x}, ${topMidSc.y - 22})`}>
                    <rect
                      x={-148}
                      y={-11}
                      width={296}
                      height={20}
                      rx={6}
                      fill={isDark ? "rgba(6, 78, 59, 0.94)" : "rgba(236, 253, 245, 0.96)"}
                      stroke="#10B981"
                      strokeWidth={1.2}
                    />
                    <text
                      x={0}
                      y={1}
                      fill={isDark ? "#A7F3D0" : "#065F46"}
                      fontSize="9.2"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {`Quadro 45° • Ext: ${smartMiterFrameCalc.outerWidthMm}×${smartMiterFrameCalc.outerHeightMm}mm • Vão: ${smartMiterFrameCalc.innerWidthMm}×${smartMiterFrameCalc.innerHeightMm}mm`}
                    </text>
                  </g>
                </g>
              );
            })()}
        </svg>
      )}

      {/* Overlay invisível anti-hijacking da Órbita 3D durante o arraste de qualquer eixo */}
      {activeAxis && (
        <div
          data-testid="chamfer-gizmo-drag-overlay"
          className="fixed inset-0 z-50 pointer-events-auto cursor-grabbing select-none"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        />
      )}

      {/* =====================================================================
          3-FLUX. ÚNICO HUD CONTEXTUAL CONSOLIDADO DURANTE MANIPULAÇÃO ATIVA
          Zero sobreposição: posicionado >= 48px acima do pivô com clamping no viewport
          ===================================================================== */}
      {is3DEnvironment && fluxState.consolidatedHud.visible && (
        <div
          data-testid="chamfer-3d-flux-consolidated-hud"
          style={{
            left: `${fluxState.consolidatedHud.screenX}px`,
            top: `${fluxState.consolidatedHud.screenY}px`,
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)",
            borderColor: copyOnTransform ? "#10B981" : "#38BDF8",
          }}
          className="pointer-events-none absolute z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-xl border px-3 py-1.5 font-mono shadow-xl transition-opacity duration-150 select-none"
        >
          <span
            className={cn(
              "whitespace-nowrap text-[11px] font-extrabold tabular-nums",
              isDark ? "text-slate-50" : "text-slate-900",
            )}
          >
            {fluxState.consolidatedHud.primaryLine}
          </span>
          {fluxState.consolidatedHud.secondarySnapLine && (
            <span className="whitespace-nowrap text-[10px] font-bold text-sky-400 tabular-nums">
              {fluxState.consolidatedHud.secondarySnapLine}
            </span>
          )}
        </div>
      )}

      {/* =====================================================================
          3. BADGE IN-CANVAS CLICÁVEL AO LADO DO ELEMENTO (ACIONA O NUMPAD COMPACTO)
          Oculto durante manipulação ativa (FLUX) e sem botão Espelhar solto!
          ===================================================================== */}
      {is3DEnvironment &&
        gizmoScreen &&
        primaryBody &&
        !numpadSession &&
        !fluxState.isManipulating &&
        selectionKind3D === "body" &&
        directTool !== "shell_3d" &&
        directTool !== "array_3d" &&
        (() => {
          const badgePos = computeNonOverlappingGizmoBadgePos({
            origin: gizmoScreen.origin,
            xTip: {
              x: gizmoScreen.x.endX + gizmoScreen.x.ux * 14,
              y: gizmoScreen.x.endY + gizmoScreen.x.uy * 14,
            },
            yTip: {
              x: gizmoScreen.y.endX + gizmoScreen.y.ux * 14,
              y: gizmoScreen.y.endY + gizmoScreen.y.uy * 14,
            },
            zTip: {
              x: gizmoScreen.z.endX + gizmoScreen.z.ux * 14,
              y: gizmoScreen.z.endY + gizmoScreen.z.uy * 14,
            },
            canvasWidth: width,
            canvasHeight: height,
          });
          return (
            <div
              style={{
                left: `${badgePos.left}px`,
                top: `${badgePos.top}px`,
              }}
              className="pointer-events-auto absolute z-30 flex items-center gap-1.5 select-none transition-opacity duration-150"
            >
              <button
                type="button"
                data-testid="chamfer-3d-live-dimension-badge"
                style={themeSurfaceStyle}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (directTool === "fillet_3d" || directTool === "chamfer_3d") {
                    openFloatingNumpad(
                      filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                      filletOrChamferMode === "fillet" ? "RAIO FILLET" : "CHANFRO 45°",
                      "mm",
                      filletOrChamferMode === "fillet"
                        ? primaryBody.edgeFilletRadiusMm || 10
                        : primaryBody.edgeChamferDistMm || 10,
                      filletOrChamferMode === "fillet" ? "filletRadius" : "chamferDistance",
                      primaryBody.entityId,
                    );
                  } else if (directTool === "shell_3d") {
                    openFloatingNumpad(
                      "THICKNESS",
                      "PAREDE CASCA",
                      "mm",
                      primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 4.75,
                      "shellWallThickness",
                      primaryBody.entityId,
                    );
                  } else if (directTool === "offset_face_3d") {
                    openFloatingNumpad(
                      "OFFSET",
                      "OFFSET FACE",
                      "mm",
                      lastCompletedDrag?.axis === "face_normal"
                        ? lastCompletedDrag.deltaMm
                        : 25,
                      "offsetFaceDistance",
                      primaryBody.entityId,
                      offsetFaceTarget,
                    );
                  } else if (directTool === "rotate_axis_3d") {
                    openFloatingNumpad(
                      "ANGLE",
                      "ÂNGULO CORTE",
                      "°",
                      primaryBody.miterCutTopDeg || 45,
                      "miterAngle",
                      primaryBody.entityId,
                      miterEndTarget,
                    );
                  } else if (directTool === "hole_3d") {
                    openFloatingNumpad(
                      "HOLE_DIAMETER",
                      "DIÂMETRO FURO Ø (mm)",
                      "mm",
                      12,
                      "holeDiameter",
                      primaryBody.entityId,
                    );
                  } else if (
                    directTool === "transform_3d" ||
                    selectionKind3D === "body"
                  ) {
                    if (
                      lastCompletedDrag?.axis === "rot_x" ||
                      lastCompletedDrag?.axis === "rot_y" ||
                      lastCompletedDrag?.axis === "rot_z"
                    ) {
                      const rotAxis = lastCompletedDrag.axis;
                      openFloatingNumpad(
                        "ANGLE",
                        rotAxis === "rot_x"
                          ? "GIRAR EIXO X"
                          : rotAxis === "rot_y"
                            ? "GIRAR EIXO Y"
                            : "GIRAR EIXO Z",
                        "°",
                        lastCompletedDrag.deltaMm || 45,
                        rotAxis === "rot_x" ? "rx" : rotAxis === "rot_y" ? "ry" : "rz",
                        lastCompletedDrag.activeResultIds[0] ?? primaryBody.entityId,
                        undefined,
                        copyOnTransform || Boolean(lastCompletedDrag.copyMode),
                      );
                      return;
                    }
                    const defaultAxis =
                      lastCompletedDrag?.axis === "y"
                        ? "y"
                        : lastCompletedDrag?.axis === "z"
                          ? "z"
                          : transformAxisTarget;
                    openFloatingNumpad(
                      "DISTANCE",
                      copyOnTransform || lastCompletedDrag?.copyMode
                        ? `CÓPIA DIST +${defaultAxis.toUpperCase()}`
                        : `TRANSLADAR +${defaultAxis.toUpperCase()}`,
                      "mm",
                      lastCompletedDrag?.deltaMm || 100,
                      defaultAxis === "x"
                        ? "moveX"
                        : defaultAxis === "y"
                          ? "moveY"
                          : "moveZ",
                      lastCompletedDrag?.activeResultIds[0] ?? primaryBody.entityId,
                      undefined,
                      copyOnTransform || Boolean(lastCompletedDrag?.copyMode),
                    );
                  } else {
                    openFloatingNumpad(
                      "EXTRUSION",
                      "EXTRUDE",
                      "mm",
                      primaryBody.extrudeHeightMm,
                      "extrudeHeight",
                      primaryBody.entityId,
                    );
                  }
                }}
                className="flex items-center gap-1 rounded-full border border-cyan-500/60 px-2.5 py-0.5 font-mono text-[10.5px] font-bold shadow-md transition-all hover:scale-105 cursor-pointer"
                title="Toque para digitar medida exata"
              >
                <span className="text-cyan-600 dark:text-cyan-300 tabular-nums">
                  {directTool === "fillet_3d" || directTool === "chamfer_3d"
                    ? filletOrChamferMode === "fillet"
                      ? `R ${(primaryBody.edgeFilletRadiusMm || 10).toFixed(1)} mm`
                      : `D ${(primaryBody.edgeChamferDistMm || 10).toFixed(1)} mm`
                    : directTool === "shell_3d"
                      ? `${(primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 4.75).toFixed(1)} mm`
                      : directTool === "offset_face_3d"
                        ? lastCompletedDrag?.axis === "face_normal"
                          ? `${lastCompletedDrag.deltaMm >= 0 ? "+" : ""}${lastCompletedDrag.deltaMm} mm`
                          : `+25.0 mm`
                        : directTool === "rotate_axis_3d"
                          ? `∠ ${(primaryBody.miterCutTopDeg || 45).toFixed(0)}°`
                          : directTool === "transform_3d" || selectionKind3D === "body"
                            ? lastCompletedDrag
                              ? lastCompletedDrag.axis.startsWith("rot_")
                                ? `∠ ${lastCompletedDrag.deltaMm > 0 ? `+${lastCompletedDrag.deltaMm}` : lastCompletedDrag.deltaMm}°`
                                : `Δ${lastCompletedDrag.axis.toUpperCase()} ${lastCompletedDrag.deltaMm} mm`
                              : `0.0 mm`
                            : `${primaryBody.extrudeHeightMm.toFixed(1)} mm`}
                </span>
              </button>
            </div>
          );
        })()}

      {/* =====================================================================
          3B. BARRA INFERIOR COMPACTA DE TELEMETRIA E INSPETOR MULTI-CORPOS
          Suavemente ocultada durante arraste ativo pelo Gerenciador FLUX (150ms)
          ===================================================================== */}
      {is3DEnvironment &&
        tool !== "loft_3d" &&
        (subSel.faceIds.length > 0 ||
          subSel.edgeIds.length > 0 ||
          vertexIds.length > 0 ||
          subSel.bodyIds.length > 0) && (() => {
          const multiSummary =
            selectionKind3D === "body" && selectedBodiesList.length >= 2
              ? computeMultiBodyInspectorSummary3D(selectedBodiesList)
              : null;

          return (
            <div
              data-testid="chamfer-3d-selection-telemetry-bar"
              style={{
                ...themeSurfaceStyle,
                bottom: "14px",
              }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              className={cn(
                "pointer-events-auto absolute left-[118px] right-2 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-[calc(100%-240px)] z-30 flex items-center gap-2 overflow-x-auto scrollbar-none rounded-full border border-cyan-500/50 px-3 py-1 font-mono text-[10.5px] font-bold shadow-lg backdrop-blur-md select-none transition-opacity duration-150",
                fluxState.showBottomTelemetryBar
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none",
              )}
            >
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold border whitespace-nowrap",
                  isDark
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                    : "bg-sky-500/15 text-sky-800 border-sky-600/40",
                )}
              >
                {multiSummary
                  ? `${multiSummary.bodyCount} CORPOS SELECIONADOS`
                  : selectionKind3D === "vertex"
                    ? "VÉRTICE"
                    : selectionKind3D === "face"
                      ? "FACE"
                      : selectionKind3D === "edge"
                        ? "ARESTA"
                        : selectionKind3D === "hinge"
                          ? "DOBRADIÇA"
                          : "PEÇA INTEIRA"}
              </span>

              {multiSummary ? (
                <>
                  <span
                    className={cn(
                      "shrink-0 font-semibold whitespace-nowrap tabular-nums",
                      isDark ? "text-slate-100" : "text-slate-800",
                    )}
                  >
                    {`${Math.round(multiSummary.deltaXMm)}×${Math.round(multiSummary.deltaYMm)}×${Math.round(multiSummary.deltaZMm)} mm · ${multiSummary.totalVolumeCm3} cm³ · ${
                      multiSummary.totalMassGrams >= 1000
                        ? `${multiSummary.totalMassKg.toFixed(2)} kg`
                        : `${Math.round(multiSummary.totalMassGrams)} g`
                    }`}
                  </span>
                  <span
                    className={cn(
                      "hidden md:inline-flex shrink-0 items-center gap-1 text-[9.5px] font-bold whitespace-nowrap",
                      isDark ? "text-sky-300" : "text-sky-800",
                    )}
                  >
                    {multiSummary.materialSummaryLabel} · {multiSummary.wallThicknessSummaryLabel}
                  </span>
                  {multiSummary.isMaterialMixed && (
                    <button
                      type="button"
                      data-testid="chamfer-3d-unify-material-btn"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        triggerHaptic("action");
                        const targetMat =
                          primaryBody?.materialName || "Aço Carbono";
                        const targetIds = selectedBodiesList.map((b) => b.entityId);
                        onCommitEntities?.(
                          (prev) =>
                            applyUniformMaterialToEntities3D(
                              prev,
                              targetIds,
                              targetMat,
                              primaryBody?.colorHex,
                            ),
                          targetIds,
                        );
                      }}
                      title="Padronizar material de todos os corpos selecionados igual ao Corpo Principal"
                      className="shrink-0 rounded-full border border-amber-400/60 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 text-[9.5px] font-bold text-amber-200 cursor-pointer whitespace-nowrap"
                    >
                      Padronizar Mat.
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      "truncate font-semibold",
                      isDark ? "text-slate-100" : "text-slate-800",
                    )}
                  >
                    {formatSubElementTelemetry3D(scene, subSel)}
                  </span>
                  {primaryBody && selectionKind3D === "body" && (
                    <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800/95 border border-slate-700 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300 whitespace-nowrap tabular-nums">
                      {(primaryBody.volumeMm3 / 1000).toFixed(1)} cm³ ·{" "}
                      {primaryBody.massGrams >= 1000
                        ? `${(primaryBody.massGrams / 1000).toFixed(2)} kg`
                        : `${primaryBody.massGrams.toFixed(0)} g`}{" "}
                      · χ={primaryBody.eulerCharacteristic.chi}
                    </span>
                  )}
                </>
              )}

              {primaryBody && selectionKind3D !== "body" && (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    const expandedIds = expandBodyIdsWithAssemblyGroup3D(
                      [primaryBody.bodyId],
                      scene,
                      entities,
                    ).bodyIds;
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: expandedIds,
                      selectionScope: "body",
                      activePivot3D: primaryBody.pivot3D,
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.(expandedIds.map((bId) => bId.replace(/^body_/, "")));
                    setDirectTool("transform_3d");
                  }}
                  className="shrink-0 rounded-full bg-slate-800 hover:bg-cyan-600/30 border border-cyan-500/40 px-2 py-0.5 text-[9.5px] text-cyan-300 cursor-pointer whitespace-nowrap"
                >
                  Peça Inteira
                </button>
              )}
              {entities.some((e) => e.type === "loft3d") && (
                <button
                  type="button"
                  data-testid="chamfer-3d-telemetry-unfold-loft-btn"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("action");
                    const loftEnt = entities.find((e) => e.type === "loft3d");
                    if (!loftEnt) return;
                    const unfolded = unfoldLoft3DShellToFlatPattern2D(loftEnt, {
                      seamIndex: 0,
                      thicknessMm: sheetThickness || 2,
                      kFactor: 0.33,
                      origin2D: { x: 260, y: 0 },
                    });
                    if (unfolded && unfolded.flatEntities.length > 0) {
                      onCommitEntities?.(
                        (prev) => [...prev, ...unfolded.flatEntities],
                        unfolded.flatEntities.map((fe) => fe.id),
                      );
                    }
                  }}
                  title="Planificar Casca 3D (Unfold por Triangulação em Verdadeira Grandeza)"
                  className="shrink-0 rounded-full bg-amber-600 hover:bg-amber-500 border border-amber-400/60 px-2 py-0.5 text-[9.5px] font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  📐 Unfold 2D
                </button>
              )}
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setLastCompletedDrag(null);
                  setSubSel({
                    faceIds: [],
                    edgeIds: [],
                    vertexIds: [],
                    bodyIds: [],
                    selectionScope: "auto",
                    activePivot3D: null,
                    activeHingeEdgeId: null,
                  });
                  onSelectEntities?.([]);
                  setDirectTool("select_3d");
                }}
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] cursor-pointer",
                  isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900",
                )}
                title="Limpar seleção 3D"
              >
                ✕
              </button>
            </div>
          );
        })()}

      {/* =====================================================================
          4. TECLADO NUMÉRICO FLUTUANTE COMPACTO (196px — CENTRALIZADO E PROTEGIDO)
          ===================================================================== */}
      {numpadSession && (
        <div
          ref={numpadRef}
          data-testid="chamfer-floating-parametric-numpad"
          style={{
            ...themeSurfaceStyle,
            top: "50%",
            transform: "translateY(-50%)",
            right: (width ?? 500) > 480 ? "56px" : "12px",
            width: "196px",
            padding: "8px",
            borderRadius: "14px",
            maxHeight: "calc(100% - 24px)",
          }}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            ev.preventDefault();
          }}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute z-60 border shadow-2xl backdrop-blur-xl select-none"
        >
          {/* Cabeçalho compacto com título do parâmetro e botão ✕ */}
          <div
            style={{
              borderColor: isDark ? "rgba(51, 65, 85, 0.6)" : "rgba(203, 213, 225, 0.8)",
            }}
            className="mb-1 flex items-center justify-between border-b pb-1"
          >
            <span className="font-mono text-[9.5px] font-bold tracking-wider text-cyan-600 dark:text-cyan-400 uppercase truncate pr-1">
              {numpadSession.title}
            </span>
            <button
              type="button"
              aria-label="Fechar teclado numérico"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                setNumpadSession(null);
              }}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer",
                isDark
                  ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                  : "text-slate-500 hover:bg-slate-200 hover:text-slate-900",
              )}
            >
              <X className="size-3" />
            </button>
          </div>

          {/* Visor numérico compacto no topo + botões [-] e [+] com aceleração exponencial */}
          <div className="mb-1.5 flex items-center gap-1">
            <button
              type="button"
              data-testid="chamfer-floating-numpad-minus"
              aria-label="Diminuir valor"
              {...numpadMinusHold}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[13px] font-bold transition-colors cursor-pointer select-none",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300"
                  : "border-slate-300 bg-slate-100 text-slate-800 hover:border-cyan-600/50 hover:text-cyan-700",
              )}
              title="Diminuir (segure para acelerar 1× → 2× → 5× → 15×)"
            >
              -
            </button>
            <div
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center justify-between rounded-lg border px-2 font-mono",
                isDark
                  ? "border-cyan-500/40 bg-slate-900/95 text-white"
                  : "border-cyan-600/40 bg-slate-50 text-slate-900",
              )}
            >
              <span
                data-testid="chamfer-floating-numpad-display"
                className="truncate text-[12px] font-bold"
              >
                {numpadBuffer}
              </span>
              <span className="ml-1 text-[9.5px] font-bold text-cyan-600 dark:text-cyan-400">
                {numpadSession.unit}
              </span>
            </div>
            <button
              type="button"
              data-testid="chamfer-floating-numpad-plus"
              aria-label="Aumentar valor"
              {...numpadPlusHold}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[13px] font-bold transition-colors cursor-pointer select-none",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300"
                  : "border-slate-300 bg-slate-100 text-slate-800 hover:border-cyan-600/50 hover:text-cyan-700",
              )}
              title="Aumentar (segure para acelerar 1× → 2× → 5× → 15×)"
            >
              +
            </button>
          </div>

          {/* Grid compacto 3×4 + linha de ação (botões de 28px de altura com stopPropagation total) */}
          <div className="grid grid-cols-3 gap-1 font-mono text-[12px] font-bold">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3", "+/-", "0", "."].map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`chamfer-numpad-key-${k}`}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleNumpadKey(k);
                }}
                className={cn(
                  "flex h-[28px] items-center justify-center rounded-lg border text-[12px] transition-colors cursor-pointer",
                  isDark
                    ? "border-slate-800 bg-slate-900/90 text-slate-100 hover:bg-slate-800"
                    : "border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200",
                )}
              >
                {k}
              </button>
            ))}

            <button
              type="button"
              data-testid="chamfer-numpad-key-BACK"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                handleNumpadKey("BACK");
              }}
              className={cn(
                "flex h-[28px] items-center justify-center rounded-lg border text-[11px] transition-colors cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-700"
                  : "border-slate-300 bg-slate-200/80 text-slate-700 hover:bg-slate-300",
              )}
              title="Apagar dígito"
            >
              ⌫
            </button>
            <button
              type="button"
              data-testid="chamfer-numpad-key-C"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                handleNumpadKey("C");
              }}
              className={cn(
                "flex h-[28px] items-center justify-center rounded-lg border text-[11px] transition-colors cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-700"
                  : "border-slate-300 bg-slate-200/80 text-slate-700 hover:bg-slate-300",
              )}
              title="Zerar valor"
            >
              C
            </button>
            <button
              type="button"
              data-testid="chamfer-numpad-confirm"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                commitFloatingNumpad();
              }}
              className="flex h-[28px] items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition-colors cursor-pointer"
              title="Confirmar medida (Enter)"
            >
              <Check className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. BARRA FLUTUANTE E MENU CONTEXTUAL "SOMENTE SEÇÕES TRANSVERSAIS" (LOFT 3D)
          ===================================================================== */}
      {isLoftActive && (
        <>
          {/* Botão e Seta Azul (▼) de Confirmação do Loft Próximo ao Topo da Peça no Canvas 3D */}
          {loftSectionIds.length >= 2 &&
            (() => {
              const lastSectionId = loftSectionIds[loftSectionIds.length - 1];
              const topBody =
                scene.bodies.find((b) => b.entityId === lastSectionId) ??
                scene.bodies[scene.bodies.length - 1];
              const topAnchorSc = topBody
                ? toScreen({
                    x: topBody.pivot3D.x,
                    y: topBody.pivot3D.y,
                    z: topBody.pivot3D.z + 18,
                  })
                : { x: width * 0.5, y: height * 0.28 };
              const clampedLeft = Math.max(24, Math.min(width - 250, topAnchorSc.x + 28));
              const clampedTop = Math.max(54, Math.min(height - 190, topAnchorSc.y - 16));

              return (
                <div
                  style={{ left: `${clampedLeft}px`, top: `${clampedTop}px` }}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => ev.stopPropagation()}
                  className="pointer-events-auto absolute z-45 flex flex-col items-start gap-1 select-none"
                >
                  <div className="flex items-center gap-1 rounded-full border border-sky-400/80 bg-slate-950/90 px-2 py-1 shadow-xl backdrop-blur-md">
                    <button
                      type="button"
                      data-testid="chamfer-loft-3d-canvas-confirm-btn"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        triggerHaptic("action");
                        setLoftDropdownOpen(false);
                        onConfirmLoft3D();
                      }}
                      className="rounded-full bg-sky-600 hover:bg-sky-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer"
                    >
                      ✓ Loft ({loftSectionIds.length} seções)
                    </button>
                    <button
                      type="button"
                      data-testid="chamfer-loft-3d-canvas-dropdown-trigger"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        triggerHaptic("selection");
                        setLoftDropdownOpen((o) => !o);
                      }}
                      title="Abrir opções de transição Loft 3D (Somente seções transversais / Guias / Caminho)"
                      className="flex size-6 items-center justify-center rounded-full border border-sky-400 bg-sky-500/25 hover:bg-sky-500/40 font-mono text-[11px] font-bold text-sky-300 cursor-pointer"
                    >
                      ▼
                    </button>
                  </div>

                  {loftDropdownOpen && (
                    <div
                      data-testid="chamfer-loft-3d-context-menu"
                      style={themeSurfaceStyle}
                      className="w-64 rounded-xl border border-sky-500/50 p-1.5 shadow-2xl backdrop-blur-xl font-mono text-[10.5px]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSetLoftSurfaceMode("smooth");
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-slate-800/80 cursor-pointer"
                      >
                        <span>Guias (Guides)</span>
                        <span className="text-[9px] text-slate-500">Auto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetLoftSurfaceMode("smooth");
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-slate-800/80 cursor-pointer"
                      >
                        <span>Caminho (Path)</span>
                        <span className="text-[9px] text-slate-500">Eixo Z</span>
                      </button>
                      <button
                        type="button"
                        data-testid="chamfer-loft-3d-cross-sections-only-btn"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          triggerHaptic("action");
                          setLoftDropdownOpen(false);
                          onConfirmLoft3D();
                        }}
                        className="my-0.5 flex w-full items-center justify-between rounded-lg border border-sky-500/50 bg-sky-500/20 hover:bg-sky-500/35 px-2.5 py-1.5 text-left font-bold text-sky-200 cursor-pointer"
                      >
                        <span>● Somente seções transversais</span>
                        <span className="text-[9px] text-sky-300">ENTER</span>
                      </button>
                      <div className="mt-1 border-t border-slate-700/60 pt-1">
                        <div className="px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">
                          Configurações (Settings)
                        </div>
                        <div className="flex items-center gap-1 px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => onSetLoftSurfaceMode("smooth")}
                            className={pillBtnClass(loftSurfaceMode === "smooth")}
                          >
                            Suave (Smooth Fit)
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetLoftSurfaceMode("ruled")}
                            className={pillBtnClass(loftSurfaceMode === "ruled")}
                          >
                            Reto (Ruled)
                          </button>
                        </div>
                        <div className="flex items-center gap-1 px-1.5 pb-1">
                          <button
                            type="button"
                            onClick={() => onSetLoftBodyMode("solid")}
                            className={pillBtnClass(loftBodyMode === "solid")}
                          >
                            Sólido
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetLoftBodyMode("shell")}
                            className={pillBtnClass(loftBodyMode === "shell")}
                          >
                            Casca ({sheetThickness}mm)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Barra Inferior do Loft 3D */}
          <div
            data-testid="chamfer-loft-3d-panel"
            style={{
              ...themeSurfaceStyle,
              bottom: "14px",
              maxWidth: "calc(100% - 32px)",
              height: "42px",
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => ev.stopPropagation()}
            className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border border-sky-500/50 px-3 shadow-lg backdrop-blur-md"
          >
            <span className="shrink-0 px-1.5 font-mono text-[10.5px] font-bold text-sky-500">
              Loft 3D ({loftSectionIds.length} perfis)
            </span>
            <button
              type="button"
              onClick={() => onSetLoftSurfaceMode("smooth")}
              className={pillBtnClass(loftSurfaceMode === "smooth")}
            >
              Suave (Smooth)
            </button>
            <button
              type="button"
              onClick={() => onSetLoftSurfaceMode("ruled")}
              className={pillBtnClass(loftSurfaceMode === "ruled")}
            >
              Reto (Ruled)
            </button>
            <button
              type="button"
              onClick={() => onSetLoftBodyMode("solid")}
              className={pillBtnClass(loftBodyMode === "solid")}
            >
              Sólido
            </button>
            <button
              type="button"
              onClick={() => onSetLoftBodyMode("shell")}
              className={pillBtnClass(loftBodyMode === "shell")}
            >
              Casca ({sheetThickness}mm)
            </button>
            {entities.some((e) => e.type === "loft3d") && (
              <button
                type="button"
                data-testid="chamfer-loft-3d-unfold-btn"
                onClick={() => {
                  triggerHaptic("action");
                  const loftEnt = entities.find((e) => e.type === "loft3d");
                  if (!loftEnt) return;
                  const unfolded = unfoldLoft3DShellToFlatPattern2D(loftEnt, {
                    seamIndex: 0,
                    thicknessMm: sheetThickness || 2,
                    kFactor: 0.33,
                    origin2D: { x: 260, y: 0 },
                  });
                  if (unfolded && unfolded.flatEntities.length > 0) {
                    onCommitEntities?.(
                      (prev) => [...prev, ...unfolded.flatEntities],
                      unfolded.flatEntities.map((fe) => fe.id),
                    );
                  }
                }}
                title="Planificar Casca 3D do Loft (Unfold por Triangulação em Verdadeira Grandeza para Laser DXF)"
                className="shrink-0 rounded-full border border-amber-400/60 bg-amber-600 hover:bg-amber-500 px-2.5 py-0.5 font-mono text-[10px] font-bold text-white cursor-pointer whitespace-nowrap"
              >
                📐 Planificar Casca (Unfold 2D)
              </button>
            )}
            {loftSectionIds.length >= 2 && onAutoSpaceLoftSectionsZ && (
              <button
                type="button"
                onClick={() => onAutoSpaceLoftSectionsZ(60)}
                title="Espaçar perfis selecionados em Z=0, Z=60, Z=120mm"
                className={pillBtnClass(false)}
              >
                Z: 0/60/120
              </button>
            )}
            {loftSectionIds.length > 0 && (
              <button
                type="button"
                onClick={onClearLoftSections}
                className={pillBtnClass(false)}
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              data-testid="chamfer-loft-3d-confirm-bar-btn"
              disabled={loftSectionIds.length < 2}
              onClick={() => {
                setLoftDropdownOpen(false);
                onConfirmLoft3D();
              }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 font-mono text-[10.5px] font-bold transition-all whitespace-nowrap",
                loftSectionIds.length >= 2
                  ? "bg-sky-600 text-white hover:bg-sky-500 cursor-pointer shadow-sm"
                  : "bg-slate-500/20 text-slate-400 cursor-not-allowed",
              )}
            >
              ● Somente seções transversais ✓
            </button>
          </div>
        </>
      )}

      {/* =====================================================================
          6A-POP. POPOVER 2x2 DE OPERAÇÃO BOOLEANA AO LADO DA SETA DE EXTRUSÃO
          ===================================================================== */}
      {is3DEnvironment && faceNormalGizmo && extrudeBooleanPopoverOpen && (
        <div
          data-testid="chamfer-3d-extrude-boolean-popover"
          style={{
            left: `${Math.max(16, Math.min(width - 210, faceNormalGizmo.posTip.x + faceNormalGizmo.ux * 18 + 30))}px`,
            top: `${Math.max(64, Math.min(height - 130, faceNormalGizmo.posTip.y + faceNormalGizmo.uy * 18 + 16))}px`,
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
            borderColor: isDark ? "rgba(56, 189, 248, 0.5)" : "rgba(2, 132, 199, 0.45)",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute z-50 grid w-48 grid-cols-2 gap-1 rounded-xl border p-1.5 shadow-2xl backdrop-blur-xl font-mono text-[10px]"
        >
          {(
            [
              { id: "union" as const, label: "Union", sub: "Fundir" },
              { id: "new_body" as const, label: "New Body", sub: "Novo Corpo" },
              { id: "subtract" as const, label: "Subtract", sub: "Recortar" },
              { id: "intersect" as const, label: "Intersect", sub: "Interseção" },
            ] as const
          ).map((bOpt) => (
            <button
              key={bOpt.id}
              type="button"
              data-testid={`chamfer-3d-boolean-popover-${bOpt.id}`}
              onClick={() => {
                triggerHaptic("selection");
                setBooleanMode(bOpt.id);
                setExtrudeBooleanPopoverOpen(false);
              }}
              className={cn(
                "flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition-all cursor-pointer",
                booleanMode === bOpt.id
                  ? "border-sky-400 bg-sky-600 text-white shadow-sm"
                  : isDark
                    ? "border-slate-700/80 bg-slate-800/85 text-slate-200 hover:border-sky-500/50"
                    : "border-slate-200 bg-slate-100 text-slate-800 hover:border-sky-500",
              )}
            >
              <span className="font-extrabold leading-tight">{bOpt.label}</span>
              <span className="text-[8.5px] opacity-80">{bOpt.sub}</span>
            </button>
          ))}
        </div>
      )}

      {/* =====================================================================
          6B. PAINEL LATERAL COMPACTO: ARRAY 3D INTELIGENTE / GRADE & QUADRO 45°
          ===================================================================== */}
      {is3DEnvironment && directTool === "array_3d" && (
        <div
          data-testid="chamfer-3d-smart-array-panel"
          style={{
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
            borderColor: isDark ? "rgba(16, 185, 129, 0.55)" : "rgba(5, 150, 105, 0.45)",
            top: "64px",
            bottom: "16px",
            right: "14px",
            width: "min(290px, calc(100% - 28px))",
            maxHeight: "calc(100% - 80px)",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute z-45 flex flex-col overflow-hidden rounded-2xl border p-2.5 shadow-2xl backdrop-blur-xl font-mono text-[10.5px]"
        >
          {/* Cabeçalho Fixo */}
          <div className="shrink-0 flex items-center justify-between border-b border-slate-500/25 pb-1.5 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[9.5px] font-extrabold text-white uppercase">
                ARRAY 3D / ESQUADRIA
              </span>
              {smartArrayPanelTab === "grille_span" && (
                <span
                  className={cn(
                    "text-[9px] font-bold",
                    smartSpanDetection.isAutoDetected ? "text-emerald-400" : "text-amber-400",
                  )}
                >
                  {selectedFacesForSpan.length >= 2
                    ? "● 2 Faces"
                    : smartSpanDetection.isAutoDetected
                      ? "● Auto-Vão"
                      : "○ Vão Livre"}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDirectTool("select_3d")}
              className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-slate-500/20 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Seletor de Modo Superior: [ ⊞ Grade / Vão ] | [ ⬚ Quadro 45° ] */}
          <div className="shrink-0 grid grid-cols-2 gap-1 mb-2">
            <button
              type="button"
              data-testid="chamfer-3d-array-tab-grille"
              onClick={() => {
                triggerHaptic("selection");
                setSmartArrayPanelTab("grille_span");
              }}
              className={cn(
                "rounded-xl border px-2 py-1.5 text-center text-[9.5px] font-extrabold transition-colors cursor-pointer",
                smartArrayPanelTab === "grille_span"
                  ? "border-emerald-400 bg-emerald-600 text-white"
                  : isDark
                    ? "border-slate-700 bg-slate-800/80 text-slate-300"
                    : "border-slate-300 bg-slate-100 text-slate-700",
              )}
            >
              ⊞ Grade / Vão
            </button>
            <button
              type="button"
              data-testid="chamfer-3d-array-tab-miter-frame"
              onClick={() => {
                triggerHaptic("selection");
                setSmartArrayPanelTab("miter_frame");
              }}
              className={cn(
                "rounded-xl border px-2 py-1.5 text-center text-[9.5px] font-extrabold transition-colors cursor-pointer",
                smartArrayPanelTab === "miter_frame"
                  ? "border-emerald-400 bg-emerald-600 text-white"
                  : isDark
                    ? "border-slate-700 bg-slate-800/80 text-slate-300"
                    : "border-slate-300 bg-slate-100 text-slate-700",
              )}
            >
              ⬚ Quadro 45°
            </button>
          </div>

          {/* Corpo Central Rolável */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-2">
            {smartArrayPanelTab === "grille_span" ? (
              <>
                {/* Seletor de Eixo (X, Y, Z) */}
                <div className="flex items-center justify-between gap-1">
                  <span className={cn("text-[9.5px] font-bold", isDark ? "text-slate-300" : "text-slate-700")}>
                    Direção do Vão:
                  </span>
                  <div className="flex items-center gap-1">
                    {(["x", "y", "z"] as SmartArrayAxis3D[]).map((ax) => (
                      <button
                        key={ax}
                        type="button"
                        data-testid={`chamfer-3d-smart-array-axis-${ax}`}
                        onClick={() => {
                          triggerHaptic("selection");
                          setSmartArrayAxis(ax);
                          setSmartArrayManualSpanMm(null);
                        }}
                        className={cn(
                          "rounded-lg border px-2 py-0.5 text-[9.5px] font-bold uppercase cursor-pointer transition-colors",
                          smartArrayAxis === ax
                            ? "border-emerald-400 bg-emerald-600 text-white"
                            : isDark
                              ? "border-slate-700 bg-slate-800/90 text-slate-300 hover:border-emerald-500/50"
                              : "border-slate-300 bg-slate-100 text-slate-700 hover:border-emerald-500",
                        )}
                      >
                        Eixo {ax.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campo de Vão Livre Detectado */}
                <div className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-500/25 bg-slate-500/10 px-2.5 py-1.5">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase text-slate-400">Vão Total Detectado</span>
                    <span className={cn("text-[11px] font-extrabold", isDark ? "text-white" : "text-slate-900")}>
                      {smartArrayCalc.spanMm} mm
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      data-testid="chamfer-3d-smart-array-span-input"
                      aria-label="Vão livre total em milímetros"
                      value={effectiveSmartSpanMm}
                      onChange={(ev) => {
                        const val = Number(ev.target.value);
                        if (Number.isFinite(val) && val > 0) {
                          setSmartArrayManualSpanMm(val);
                        }
                      }}
                      className={cn(
                        "w-20 rounded-lg border px-2 py-1 text-right font-mono text-[10.5px] font-bold outline-none",
                        isDark
                          ? "border-slate-700 bg-slate-900 text-emerald-300"
                          : "border-slate-300 bg-white text-emerald-700",
                      )}
                    />
                    {smartArrayManualSpanMm !== null && (
                      <button
                        type="button"
                        onClick={() => setSmartArrayManualSpanMm(null)}
                        title="Restaurar detecção automática do vão entre colunas"
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-1 text-[9px] font-bold text-emerald-400 cursor-pointer"
                      >
                        Auto
                      </button>
                    )}
                  </div>
                </div>

                {/* 2 Modos de Divisão de Serralheria */}
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    data-testid="chamfer-3d-smart-array-mode-count"
                    onClick={() => {
                      triggerHaptic("selection");
                      setSmartArrayMode("by_count");
                    }}
                    className={cn(
                      "rounded-xl border px-2 py-1.5 text-center text-[9.5px] font-bold transition-colors cursor-pointer",
                      smartArrayMode === "by_count"
                        ? "border-emerald-400 bg-emerald-600 text-white"
                        : isDark
                          ? "border-slate-700 bg-slate-800/80 text-slate-300"
                          : "border-slate-300 bg-slate-100 text-slate-700",
                    )}
                  >
                    Modo A: N Tubos
                  </button>
                  <button
                    type="button"
                    data-testid="chamfer-3d-smart-array-mode-gap"
                    onClick={() => {
                      triggerHaptic("selection");
                      setSmartArrayMode("by_max_gap");
                    }}
                    className={cn(
                      "rounded-xl border px-2 py-1.5 text-center text-[9.5px] font-bold transition-colors cursor-pointer",
                      smartArrayMode === "by_max_gap"
                        ? "border-emerald-400 bg-emerald-600 text-white"
                        : isDark
                          ? "border-slate-700 bg-slate-800/80 text-slate-300"
                          : "border-slate-300 bg-slate-100 text-slate-700",
                    )}
                  >
                    Modo B: Vão Máx (mm)
                  </button>
                </div>

                {/* Controle Interativo (- / +) */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-500/25 bg-slate-500/10 px-2.5 py-1.5">
                  <span className={cn("text-[9.5px] font-bold", isDark ? "text-slate-200" : "text-slate-700")}>
                    {smartArrayMode === "by_count" ? "Qtd. Tubos (N):" : "Vão Máx. Livre:"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="chamfer-3d-smart-array-minus-btn"
                      {...smartArrayMinusHold}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-lg border font-mono text-sm font-extrabold select-none cursor-pointer",
                        isDark
                          ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
                      )}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      data-testid="chamfer-3d-smart-array-value-input"
                      aria-label={
                        smartArrayMode === "by_count"
                          ? "Quantidade de tubos internos"
                          : "Vão máximo livre entre tubos em milímetros"
                      }
                      value={smartArrayMode === "by_count" ? smartArrayCount : smartArrayMaxGapMm}
                      onChange={(ev) => {
                        const v = Number(ev.target.value);
                        if (!Number.isFinite(v)) return;
                        if (smartArrayMode === "by_count") {
                          setSmartArrayCount(Math.max(1, Math.min(80, Math.round(v))));
                        } else {
                          setSmartArrayMaxGapMm(Math.max(10, Math.min(1000, Math.round(v))));
                        }
                      }}
                      className={cn(
                        "w-16 rounded-lg border px-1.5 py-1 text-center font-mono text-[11px] font-extrabold outline-none",
                        isDark
                          ? "border-slate-700 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-900",
                      )}
                    />
                    <button
                      type="button"
                      data-testid="chamfer-3d-smart-array-plus-btn"
                      {...smartArrayPlusHold}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-lg border font-mono text-sm font-extrabold select-none cursor-pointer",
                        isDark
                          ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
                      )}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Telemetria Exata de Serralheria ao Vivo */}
                <div
                  data-testid="chamfer-3d-smart-array-telemetry"
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border p-2 text-[9.5px]",
                    isDark
                      ? "border-emerald-500/35 bg-slate-900/90 text-slate-200"
                      : "border-emerald-500/35 bg-emerald-50/70 text-slate-800",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Vão Total Detectado:</span>
                    <span className="font-bold">{smartArrayCalc.spanMm} mm</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Largura do Perfil (d):</span>
                    <span className="font-bold">{smartArrayCalc.tubeWidthMm} mm</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Quantidade:</span>
                    <span className="font-bold text-emerald-400">{smartArrayCalc.count} tubos</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Vão Livre (Luz entre tubos):</span>
                    <span
                      className={cn(
                        "font-extrabold",
                        smartArrayCalc.valid ? "text-cyan-400" : "text-rose-400",
                      )}
                    >
                      {smartArrayCalc.clearGapMm} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Passo (Centro a Centro):</span>
                    <span className="font-bold text-amber-400">
                      {smartArrayCalc.pitchCenterToCenterMm} mm
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 3 Modos de Referência de Medida do Quadro 45° */}
                <div className="flex flex-col gap-1">
                  <span className={cn("text-[9px] font-bold uppercase", isDark ? "text-slate-400" : "text-slate-600")}>
                    Referência da Medida (L × A):
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: "inner" as const, label: "Interna", sub: "Vão Livre" },
                        { id: "mid" as const, label: "Média", sub: "Centro" },
                        { id: "outer" as const, label: "Externa", sub: "Fora a Fora" },
                      ] as const
                    ).map((refOpt) => (
                      <button
                        key={refOpt.id}
                        type="button"
                        data-testid={`chamfer-3d-frame-ref-${refOpt.id}`}
                        onClick={() => {
                          triggerHaptic("selection");
                          setSmartFrameMeasureRef(refOpt.id);
                        }}
                        className={cn(
                          "flex flex-col items-center rounded-lg border px-1.5 py-1 text-center transition-colors cursor-pointer",
                          smartFrameMeasureRef === refOpt.id
                            ? "border-emerald-400 bg-emerald-600 text-white"
                            : isDark
                              ? "border-slate-700 bg-slate-800/80 text-slate-300"
                              : "border-slate-300 bg-slate-100 text-slate-700",
                        )}
                      >
                        <span className="text-[9px] font-extrabold">{refOpt.label}</span>
                        <span className="text-[7.5px] opacity-80">{refOpt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Largura do Quadro (L) */}
                <div className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-500/25 bg-slate-500/10 px-2 py-1.5">
                  <span className={cn("text-[9.5px] font-bold", isDark ? "text-slate-200" : "text-slate-700")}>
                    Largura (L):
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      {...smartFrameWMinusHold}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border font-mono text-xs font-extrabold cursor-pointer",
                        isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      data-testid="chamfer-3d-frame-width-input"
                      aria-label="Largura do quadro em milímetros"
                      value={smartFrameWidthMm}
                      onChange={(ev) => {
                        const v = Number(ev.target.value);
                        if (Number.isFinite(v) && v > 0) setSmartFrameWidthMm(v);
                      }}
                      className={cn(
                        "w-16 rounded-md border px-1.5 py-0.5 text-center font-mono text-[10.5px] font-extrabold outline-none",
                        isDark ? "border-slate-700 bg-slate-900 text-emerald-300" : "border-slate-300 bg-white text-emerald-700",
                      )}
                    />
                    <button
                      type="button"
                      {...smartFrameWPlusHold}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border font-mono text-xs font-extrabold cursor-pointer",
                        isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Altura / Comprimento do Quadro (A) */}
                <div className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-500/25 bg-slate-500/10 px-2 py-1.5">
                  <span className={cn("text-[9.5px] font-bold", isDark ? "text-slate-200" : "text-slate-700")}>
                    Altura / Comp. (A):
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      {...smartFrameHMinusHold}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border font-mono text-xs font-extrabold cursor-pointer",
                        isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      data-testid="chamfer-3d-frame-height-input"
                      aria-label="Altura ou comprimento do quadro em milímetros"
                      value={smartFrameHeightMm}
                      onChange={(ev) => {
                        const v = Number(ev.target.value);
                        if (Number.isFinite(v) && v > 0) setSmartFrameHeightMm(v);
                      }}
                      className={cn(
                        "w-16 rounded-md border px-1.5 py-0.5 text-center font-mono text-[10.5px] font-extrabold outline-none",
                        isDark ? "border-slate-700 bg-slate-900 text-emerald-300" : "border-slate-300 bg-white text-emerald-700",
                      )}
                    />
                    <button
                      type="button"
                      {...smartFrameHPlusHold}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border font-mono text-xs font-extrabold cursor-pointer",
                        isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Plano do Quadro + Tipo de Junta */}
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: "xy" as const, label: "XY Deitado" },
                      { id: "xz" as const, label: "XZ Frontal" },
                      { id: "yz" as const, label: "YZ Lateral" },
                    ] as const
                  ).map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      data-testid={`chamfer-3d-frame-plane-${pl.id}`}
                      onClick={() => setSmartFramePlane(pl.id)}
                      className={cn(
                        "rounded-lg border px-1.5 py-1 text-center text-[9px] font-bold cursor-pointer",
                        smartFramePlane === pl.id
                          ? "border-emerald-400 bg-emerald-600 text-white"
                          : isDark
                            ? "border-slate-700 bg-slate-800 text-slate-300"
                            : "border-slate-300 bg-slate-100 text-slate-700",
                      )}
                    >
                      {pl.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    data-testid="chamfer-3d-frame-joint-miter45"
                    onClick={() => setSmartFrameJointMode("miter_45")}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-center text-[9px] font-bold cursor-pointer",
                      smartFrameJointMode === "miter_45"
                        ? "border-emerald-400 bg-emerald-600 text-white"
                        : isDark
                          ? "border-slate-700 bg-slate-800 text-slate-300"
                          : "border-slate-300 bg-slate-100 text-slate-700",
                    )}
                  >
                    ⬚ Corte 45° (Esquadria)
                  </button>
                  <button
                    type="button"
                    data-testid="chamfer-3d-frame-joint-butt90"
                    onClick={() => setSmartFrameJointMode("butt_90")}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-center text-[9px] font-bold cursor-pointer",
                      smartFrameJointMode === "butt_90"
                        ? "border-emerald-400 bg-emerald-600 text-white"
                        : isDark
                          ? "border-slate-700 bg-slate-800 text-slate-300"
                          : "border-slate-300 bg-slate-100 text-slate-700",
                    )}
                  >
                    ⊞ Topo Reto 90°
                  </button>
                </div>

                {/* Divisões Internas Opcionais (Tubos de Grade dentro do Quadro) */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-500/25 bg-slate-500/10 px-2 py-1.5">
                  <span className={cn("text-[9px] font-bold", isDark ? "text-slate-200" : "text-slate-700")}>
                    Divisões Internas (N):
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="chamfer-3d-frame-div-minus"
                      onClick={() => setSmartFrameInnerDivisions((n) => Math.max(0, n - 1))}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border font-mono text-xs font-extrabold cursor-pointer",
                        isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                    >
                      −
                    </button>
                    <span
                      data-testid="chamfer-3d-frame-div-count"
                      className="w-8 text-center font-mono text-[10.5px] font-extrabold"
                    >
                      {smartFrameInnerDivisions}
                    </span>
                    <button
                      type="button"
                      data-testid="chamfer-3d-frame-div-plus"
                      onClick={() => setSmartFrameInnerDivisions((n) => Math.min(40, n + 1))}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md border font-mono text-xs font-extrabold cursor-pointer",
                        isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900",
                      )}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Telemetria Exata do Quadro 45° */}
                <div
                  data-testid="chamfer-3d-miter-frame-telemetry"
                  className={cn(
                    "flex flex-col gap-0.5 rounded-xl border p-2 text-[9px]",
                    isDark
                      ? "border-emerald-500/35 bg-slate-900/90 text-slate-200"
                      : "border-emerald-500/35 bg-emerald-50/70 text-slate-800",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Externa (Fora a Fora):</span>
                    <span className="font-extrabold text-emerald-400">
                      {smartMiterFrameCalc.outerWidthMm} × {smartMiterFrameCalc.outerHeightMm} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Interna (Vão Livre):</span>
                    <span className="font-bold text-cyan-400">
                      {smartMiterFrameCalc.innerWidthMm} × {smartMiterFrameCalc.innerHeightMm} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Média (Centro a Centro):</span>
                    <span className="font-bold text-amber-400">
                      {smartMiterFrameCalc.midWidthMm} × {smartMiterFrameCalc.midHeightMm} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Perfil (W×H) / Peças:</span>
                    <span className="font-bold">
                      {smartMiterFrameCalc.profileWidthMm}×{smartMiterFrameCalc.profileDepthMm} mm • {smartMiterFrameCalc.members.length} pçs
                    </span>
                  </div>
                  {smartFrameInnerDivisions > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Luz entre tubos:</span>
                      <span className="font-extrabold text-cyan-400">
                        {smartMiterFrameCalc.innerClearGapMm} mm
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Rodapé Fixo Sem Corte: Botões [ ✕ Cancelar ] e [ ✓ Confirmar ] Sempre Visíveis */}
          <div className="shrink-0 mt-2 pt-2 border-t border-slate-500/25 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="chamfer-3d-smart-array-cancel-btn"
              onClick={() => {
                triggerHaptic("tap");
                setDirectTool("select_3d");
              }}
              className={cn(
                "rounded-xl border py-1.5 font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              ✕ Cancelar
            </button>
            <button
              type="button"
              data-testid="chamfer-3d-smart-array-confirm-btn"
              disabled={
                smartArrayPanelTab === "grille_span"
                  ? !smartArraySourceBody || !smartArrayCalc.valid
                  : !smartMiterFrameCalc.valid
              }
              onClick={() => {
                triggerHaptic("action");
                if (smartArrayPanelTab === "miter_frame") {
                  if (!smartMiterFrameCalc.valid) return;
                  let createdIds: string[] = [];
                  onCommitEntities?.(
                    (prev) => {
                      const res = generateSmartMiterFrameEntities3D(
                        prev,
                        smartArraySourceBody?.entityId ?? null,
                        smartArraySourceBody,
                        smartMiterFrameCalc,
                      );
                      createdIds = res.createdIds;
                      return res.updatedEntities;
                    },
                    createdIds,
                  );
                  if (createdIds.length > 0) {
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: createdIds.map((id) => `body_${id}`),
                      selectionScope: "body",
                      activePivot3D: { x: 0, y: 0, z: 0 },
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.(createdIds);
                  }
                  setDirectTool("select_3d");
                } else {
                  if (!smartArraySourceBody || !smartArrayCalc.valid) return;
                  let createdIds: string[] = [];
                  onCommitEntities?.((prev) => {
                    const res = generateSmartGrilleArrayEntities3D(
                      prev,
                      smartArraySourceBody.entityId,
                      smartArraySourceBody,
                      smartArrayCalc,
                      scene.bodies,
                    );
                    createdIds = res.createdIds;
                    return res.updatedEntities;
                  }, createdIds.length > 0 ? createdIds : [smartArraySourceBody.entityId]);
                  if (createdIds.length > 0) {
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: createdIds.map((id) => `body_${id}`),
                      selectionScope: "body",
                      activePivot3D: { x: 0, y: 0, z: 0 },
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.(createdIds);
                  }
                  setDirectTool("select_3d");
                }
              }}
              className={cn(
                "rounded-xl py-1.5 font-mono text-[10px] font-extrabold uppercase tracking-wider transition-all shadow-md",
                (
                  smartArrayPanelTab === "grille_span"
                    ? Boolean(smartArraySourceBody && smartArrayCalc.valid)
                    : smartMiterFrameCalc.valid
                )
                  ? "bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                  : "bg-slate-600/30 text-slate-400 cursor-not-allowed",
              )}
            >
              {smartArrayPanelTab === "miter_frame"
                ? `✓ Confirmar (${smartMiterFrameCalc.members.length} pçs)`
                : `✓ Confirmar (${smartArrayCalc.count})`}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. MODAL DE LISTA DE CORTE ESTRUTURAL, BOM 3D, INTERFERÊNCIA & CALDEIRARIA
          ===================================================================== */}
      {is3DEnvironment && cutListModalOpen && (
        <div
          data-testid="chamfer-3d-cutlist-bom-modal"
          style={{
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
            borderColor: isDark ? "rgba(139, 92, 246, 0.55)" : "rgba(124, 58, 237, 0.45)",
            top: "52px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(620px, calc(100% - 24px))",
            maxHeight: "calc(100% - 110px)",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute z-50 flex flex-col overflow-hidden rounded-2xl border p-3 shadow-2xl backdrop-blur-xl font-mono text-[10.5px]"
        >
          {(() => {
            const cutList = generateStructuralCutListFrom3DScene(scene);
            const interferenceReport = runAssemblyInterferenceAndClearanceCheck(scene);
            const baRef = computeExactBendAllowance(90, 2, 2, 0.33);
            const coneRef = computeTruncatedConeDevelopment(400, 200, 300, 2);

            return (
              <>
                <div
                  className={cn(
                    "flex items-center justify-between border-b pb-2",
                    isDark ? "border-slate-700/70" : "border-slate-200",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                      BOM & LISTA DE CORTE 3D
                    </span>
                    <span className={cn("font-bold", isDark ? "text-slate-200" : "text-slate-800")}>
                      {cutList.totalPieces} Peça(s) · {cutList.totalMassKg.toFixed(2)} kg ·{" "}
                      {cutList.bars6mNeeded} Barra(s) 6m
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="chamfer-3d-copy-text-btn"
                      onClick={() => {
                        const summaryText = [
                          `LISTA DE CORTE 3D — CHAMFER CAD (${cutList.totalPieces} Peças | ${cutList.totalMassKg.toFixed(2)} kg | ${cutList.bars6mNeeded} Barra(s) 6m)`,
                          ...cutList.rows.map(
                            (r) =>
                              `${r.quantity}x ${r.profileDesignation} — C=${r.longPointLengthMm} mm (Corte ${r.miterTopDeg}°/${r.miterBottomDeg}°) — ${r.totalMassKg} kg`,
                          ),
                        ].join("\n");
                        navigator.clipboard?.writeText(summaryText);
                        setTextCopiedFeedback(true);
                        setTimeout(() => setTextCopiedFeedback(false), 1800);
                      }}
                      className="rounded-lg bg-violet-600 hover:bg-violet-500 px-2.5 py-0.5 text-[9.5px] font-bold text-white cursor-pointer"
                    >
                      {textCopiedFeedback ? "✓ Lista Copiada!" : "📋 Copiar Lista"}
                    </button>
                    <button
                      type="button"
                      data-testid="chamfer-3d-copy-csv-btn"
                      onClick={() => {
                        navigator.clipboard?.writeText(cutList.csvContent);
                        setCsvCopiedFeedback(true);
                        setTimeout(() => setCsvCopiedFeedback(false), 1800);
                      }}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-0.5 text-[9.5px] font-bold text-white cursor-pointer"
                    >
                      {csvCopiedFeedback ? "✓ CSV Copiado!" : "⬇ Copiar CSV"}
                    </button>
                    <button
                      type="button"
                      data-testid="chamfer-3d-close-cutlist-btn"
                      onClick={() => setCutListModalOpen(false)}
                      className={cn(
                        "rounded-lg px-2 py-0.5 font-bold cursor-pointer",
                        isDark
                          ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                          : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                      )}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex-1 overflow-y-auto space-y-2 pr-1">
                  {/* Tabela de Corte Estrutural */}
                  <div
                    className={cn(
                      "overflow-x-auto rounded-xl border",
                      isDark ? "border-slate-700/70" : "border-slate-300",
                    )}
                  >
                    <table className="w-full text-left text-[9.5px]">
                      <thead className="bg-slate-900 text-slate-200 uppercase">
                        <tr>
                          <th className="px-2 py-1">#</th>
                          <th className="px-2 py-1">Perfil</th>
                          <th className="px-2 py-1">Qtd</th>
                          <th className="px-2 py-1">L. Maior</th>
                          <th className="px-2 py-1">L. Menor</th>
                          <th className="px-2 py-1">Esquadria</th>
                          <th className="px-2 py-1">Massa</th>
                        </tr>
                      </thead>
                      <tbody
                        className={cn(
                          "divide-y",
                          isDark ? "divide-slate-800/80" : "divide-slate-200",
                        )}
                      >
                        {cutList.rows.map((row) => (
                          <tr
                            key={row.itemNumber}
                            className={isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-100"}
                          >
                            <td
                              className={cn(
                                "px-2 py-1 font-bold",
                                isDark ? "text-cyan-400" : "text-cyan-700",
                              )}
                            >
                              {row.itemNumber}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1 font-semibold",
                                isDark ? "text-slate-100" : "text-slate-900",
                              )}
                            >
                              {row.profileDesignation}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1 font-bold",
                                isDark ? "text-emerald-400" : "text-emerald-700",
                              )}
                            >
                              ×{row.quantity}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1 font-semibold",
                                isDark ? "text-slate-200" : "text-slate-800",
                              )}
                            >
                              {row.longPointLengthMm} mm
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1",
                                isDark ? "text-slate-300" : "text-slate-700",
                              )}
                            >
                              {row.shortPointLengthMm} mm
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1 font-bold",
                                isDark ? "text-amber-400" : "text-amber-700",
                              )}
                            >
                              {row.miterTopDeg}° / {row.miterBottomDeg}°
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1 font-semibold",
                                isDark ? "text-slate-200" : "text-slate-800",
                              )}
                            >
                              {row.totalMassKg} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Diagnóstico de Interferência & Caldeiraria */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900 p-2">
                      <div className="text-[9.5px] font-bold text-cyan-400 uppercase">
                        Inspeção de Montagem (Interference Check)
                      </div>
                      <div className="mt-1 text-[9.5px] text-slate-200">
                        Status:{" "}
                        <span
                          className={
                            interferenceReport.hasInterference
                              ? "text-amber-300 font-bold"
                              : "text-emerald-300 font-bold"
                          }
                        >
                          {interferenceReport.hasInterference
                            ? `${interferenceReport.collisionCount} Interferência(s) detectada(s)`
                            : "0 Colisões (Folga OK)"}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-300">
                        Folga mínima entre corpos: {interferenceReport.minClearanceMm} mm
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700/70 bg-slate-900 p-2">
                      <div className="text-[9.5px] font-bold text-amber-300 uppercase">
                        Chapa & Caldeiraria (Fórmulas Exatas)
                      </div>
                      <div className="mt-1 text-[9px] text-slate-200">
                        • Dobra 90° (t=2, R=2, K=0.33):{" "}
                        <span className="text-emerald-300 font-bold">
                          BA = {baRef.bendAllowanceMm.toFixed(3)} mm
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-200">
                        • Cone Ø400➔Ø200 H300:{" "}
                        <span className="text-sky-300 font-bold">
                          G={coneRef.slantHeightGMm}mm · R1={coneRef.outerRadiusR1Mm}mm · α=
                          {coneRef.sectorAngleDeg}°
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
