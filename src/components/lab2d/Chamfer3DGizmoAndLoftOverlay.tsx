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
  type SubElementSelectionState3D,
  type Vec3Mm,
} from "@/lib/lab2d/cadDirectModeling3D";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface Chamfer3DGizmoAndLoftOverlayProps {
  entities: Entity[];
  selected?: Entity[];
  selection?: string[];
  selectedIds?: Set<string>;
  view: { tx: number; ty: number; k: number };
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
  const [offsetFaceTarget, setOffsetFaceTarget] = useState<
    "top" | "bottom" | "sides" | "pos_x" | "neg_x" | "pos_y" | "neg_y" | "side_normal"
  >("top");
  const [miterEndTarget, setMiterEndTarget] = useState<"top" | "bottom">("top");
  const [miterAxis, setMiterAxis] = useState<"x" | "y">("x");
  const [copyOnTransform, setCopyOnTransform] = useState<boolean>(false);
  const [transformAxisTarget, setTransformAxisTarget] = useState<"x" | "y" | "z">("x");
  const [isPickingPivotSnap, setIsPickingPivotSnap] = useState<boolean>(false);
  const [snappedPivotLabel, setSnappedPivotLabel] = useState<string | null>(null);

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

  // Registro do último deslocamento / extrusão concluído para manter a linha tracejada e pílula de distância clicável
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
    }
  }, [subSel.faceIds.length, subSel.edgeIds.length, subSel.bodyIds.length, vertexIds.length]);

  const dragSessionRef = useRef<{
    axis: GizmoAxis;
    pointerId?: number;
    startClientX: number;
    startClientY: number;
    screenDirX: number;
    screenDirY: number;
    pixelsPerMm: number;
    totalDeltaMm: number;
    lastAppliedDeltaMm: number;
    initialValue: number;
    targetIds: string[];
    hasMoved: boolean;
    startCenter3D?: Vec3Mm;
    angleStartRad?: number;
    pivotScreen?: Vec2;
    startEntities: Entity[];
    startBody: DirectBody3D | null;
    startFace: DirectFace3D | null;
    startEdge: DirectEdge3D | null;
    startVertex: DirectVertex3D | null;
    targetEdgeIndices?: number[];
    targetBevelKeys?: string[];
    copyIdMap: Map<string, string>;
    activeResultIds: string[];
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

  const primaryBody: DirectBody3D | null = useMemo(() => {
    if (activeTargetEntityIds.length === 0) return null;
    for (const id of activeTargetEntityIds) {
      const b = scene.bodies.find((x) => x.entityId === id);
      if (b) return b;
    }
    return null;
  }, [activeTargetEntityIds, scene.bodies]);

  const primaryFace: DirectFace3D | null = useMemo(() => {
    if (subSel.faceIds.length > 0) {
      return scene.facesById.get(subSel.faceIds[0]!) ?? null;
    }
    return null;
  }, [subSel.faceIds, scene.facesById]);

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
      const matchV = e.edgeId.match(/:edge_v_(\d+)$/);
      const matchTop = e.edgeId.match(/:edge_top_(\d+)$/);
      const matchBot = e.edgeId.match(/:edge_bot_(\d+)$/);
      if (matchV) {
        vertIndices.push(Number(matchV[1]));
      } else if (matchTop) {
        bevelKeys.push(`edge_top_${matchTop[1]}`);
      } else if (matchBot) {
        bevelKeys.push(`edge_bot_${matchBot[1]}`);
      }
    }

    return {
      selectedVerticalEdgeIndices: vertIndices.length > 0 ? vertIndices : undefined,
      selectedBevelKeys: bevelKeys.length > 0 ? bevelKeys : undefined,
    };
  }, [selectionKind3D, selectionScope, vertexIds, subSel.edgeIds, scene]);

  const activeHingeEdge: DirectEdge3D | null = useMemo(() => {
    if (subSel.activeHingeEdgeId) {
      return scene.edgesById.get(subSel.activeHingeEdgeId) ?? null;
    }
    if (directTool === "rotate_axis_3d" && primaryBody) {
      return (
        primaryBody.edges.find((e) => e.role === (miterEndTarget === "bottom" ? "bottom" : "top")) ??
        primaryBody.edges[0] ??
        null
      );
    }
    return null;
  }, [subSel.activeHingeEdgeId, scene.edgesById, directTool, primaryBody, miterEndTarget]);

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

  // Calcula o centro 3D do Gizmo (respeitando pivô móvel ou sub-elemento selecionado; retorna null quando nada está selecionado!)
  const selectionCenter3D = useMemo<Vec3Mm | null>(() => {
    if (selectionKind3D === "none") return null;
    if (subSel.activePivot3D) return subSel.activePivot3D;
    if (vertexIds.length > 0 && primaryVertex) return primaryVertex.point3D;
    if (subSel.faceIds.length > 0 && primaryFace) return primaryFace.centroid;
    if (subSel.edgeIds.length > 0 && primaryEdge) return primaryEdge.midpoint;
    if (primaryBody) {
      if (
        directTool === "extrude_3d" ||
        directTool === "offset_face_3d" ||
        directTool === "rotate_axis_3d"
      ) {
        const topF = primaryBody.faces.find((f) => f.role === "top" || f.role === "miter");
        if (topF) return topF.centroid;
      }
      return primaryBody.pivot3D;
    }
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
    subSel.activePivot3D,
    subSel.faceIds.length,
    subSel.edgeIds.length,
    vertexIds.length,
    primaryVertex,
    primaryFace,
    primaryEdge,
    primaryBody,
    directTool,
    selected,
  ]);

  // Projeção dos eixos X, Y, Z na tela
  const gizmoScreen = useMemo(() => {
    if (!selectionCenter3D || (!isTilted3D && activeMode !== "3d")) return null;

    const originScreen = toScreen(selectionCenter3D);
    const axisLenPx = 64;
    const stepMm = Math.max(10, 60 / Math.max(0.1, view.k));

    const projectAxisTip = (dx: number, dy: number, dz: number) => {
      const tipScreen = toScreen({
        x: selectionCenter3D.x + dx * stepMm,
        y: selectionCenter3D.y + dy * stepMm,
        z: selectionCenter3D.z + dz * stepMm,
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
      };
    };

    const xAx = projectAxisTip(1, 0, 0);
    const yAx = projectAxisTip(0, 1, 0);
    const zAx = projectAxisTip(0, 0, 1);

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

    return {
      origin: originScreen,
      center3D: selectionCenter3D,
      x: xAx,
      y: yAx,
      z: zAx,
      planarQuad,
    };
  }, [selectionCenter3D, isTilted3D, activeMode, toScreen, view.k]);

  // Projeção da Seta Normal Bidirecional da Face Selecionada (EXCLUSIVA QUANDO FACE É CLICADA)
  const faceNormalGizmo = useMemo(() => {
    if (!primaryFace || (!isTilted3D && activeMode !== "3d")) return null;
    if (selectionKind3D !== "face") return null;
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
    const matchV = primaryEdge.edgeId.match(/:edge_v_(\d+)$/);
    const matchTop = primaryEdge.edgeId.match(/:edge_top_(\d+)$/);
    const matchBot = primaryEdge.edgeId.match(/:edge_bot_(\d+)$/);
    const vIdx = matchV ? Number(matchV[1]) : -1;
    const bevelKey = matchTop ? `edge_top_${matchTop[1]}` : matchBot ? `edge_bot_${matchBot[1]}` : null;
    const currentFilletVal =
      vIdx >= 0 && primaryBody?.cornerFilletsMm?.[vIdx] !== undefined
        ? primaryBody.cornerFilletsMm[vIdx]!
        : (primaryBody?.edgeFilletRadiusMm || 10);
    const currentChamferVal =
      bevelKey && primaryBody?.vertexBevelsMm?.[bevelKey] !== undefined
        ? primaryBody.vertexBevelsMm[bevelKey]!
        : vIdx >= 0 && primaryBody?.cornerChamfersMm?.[vIdx] !== undefined
          ? primaryBody.cornerChamfersMm[vIdx]!
          : (primaryBody?.edgeChamferDistMm || 10);

    return {
      origin: originScreen,
      midpoint3D: primaryEdge.midpoint,
      tip: { x: originScreen.x + ux * arrowLenPx, y: originScreen.y + uy * arrowLenPx },
      oppTip: { x: originScreen.x - ux * (arrowLenPx * 0.7), y: originScreen.y - uy * (arrowLenPx * 0.7) },
      ux,
      uy,
      pixelsPerMm: Math.max(0.15, 30 / 10),
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

  // Projeção do Arco de Dobradiça / Corte em Meia-Esquadria (Rotate Around Axis: Face + Aresta)
  const hingeMiterGizmo = useMemo(() => {
    if (!activeHingeEdge || (!isTilted3D && activeMode !== "3d")) return null;
    if (selectionKind3D !== "hinge") return null;
    const originScreen = toScreen(activeHingeEdge.midpoint);
    return {
      origin: originScreen,
      edge: activeHingeEdge,
      angleDeg:
        miterEndTarget === "bottom"
          ? (primaryBody?.miterCutBottomDeg ?? 0)
          : (primaryBody?.miterCutTopDeg ?? 0),
    };
  }, [
    activeHingeEdge,
    isTilted3D,
    activeMode,
    selectionKind3D,
    toScreen,
    miterEndTarget,
    primaryBody,
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
                    Math.min(primaryBody?.widthMm || 200, primaryBody?.heightMm || 200) * 0.45,
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
      onCommitEntities(
        (prev) => applyDirectExtrudeToEntities(prev, resolvedIds, parsed, booleanMode),
        resolvedIds,
      );
    } else if (param === "shellWallThickness") {
      const caps: ("top" | "bottom")[] =
        shellOpenCapsMode === "both_ends" ? ["top", "bottom"] : ["top"];
      onCommitEntities(
        (prev) => applyDirectShell3DToEntities(prev, resolvedIds, parsed, caps),
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
          if (refRole === "bottom") {
            return applyDirectOffsetFace3DToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              "bottom",
              parsed,
            );
          }
          if (refRole === "top" || refRole === "miter") {
            const nextH = Math.max(1, lastCompletedDrag.initialValue + parsed);
            return applyDirectExtrudeToEntities(
              lastCompletedDrag.startEntities,
              lastCompletedDrag.targetIds,
              nextH,
              booleanMode,
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
        if (primaryFace.role === "bottom") {
          onCommitEntities(
            (prev) => applyDirectOffsetFace3DToEntities(prev, resolvedIds, "bottom", parsed),
            resolvedIds,
          );
        } else if (primaryFace.role === "top" || primaryFace.role === "miter") {
          onCommitEntities(
            (prev) => applyDirectOffsetFace3DToEntities(prev, resolvedIds, "top", parsed),
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
          subTarget === "side_normal"
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
            ),
          resolvedIds,
        );
      }
    } else if (param === "miterAngle") {
      if (subTarget === "rx" || subTarget === "ry" || subTarget === "rz") {
        onCommitEntities((prev) => {
          const res = applyDirectTransform3DToEntities(
            prev,
            resolvedIds,
            {
              rxDeg: subTarget === "rx" ? parsed : 0,
              ryDeg: subTarget === "ry" ? parsed : 0,
              rzDeg: subTarget === "rz" ? parsed : 0,
            },
            Boolean(copyMode),
          );
          return res.updatedEntities;
        }, resolvedIds);
      } else {
        const endT = subTarget === "bottom" ? "bottom" : miterEndTarget;
        onCommitEntities(
          (prev) => applyDirectMiterCut3DToEntities(prev, resolvedIds, endT, parsed, miterAxis),
          resolvedIds,
        );
      }
    } else if (param === "moveX" || param === "moveY" || param === "moveZ") {
      const axisKey = param === "moveX" ? "x" : param === "moveY" ? "y" : "z";
      // Se veio de um arraste (ou Copy+Drag) recém-concluído, posiciona na distância EXATA a partir da peça de origem!
      if (lastCompletedDrag && lastCompletedDrag.axis === axisKey) {
        const deltaObj =
          axisKey === "x"
            ? { dx: parsed }
            : axisKey === "y"
              ? { dy: parsed }
              : { dz: parsed };
        const res = applyDirectTransform3DToEntities(
          lastCompletedDrag.startEntities,
          lastCompletedDrag.targetIds,
          deltaObj,
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
                  x: prev.startPoint3D.x + (axisKey === "x" ? parsed : 0),
                  y: prev.startPoint3D.y + (axisKey === "y" ? parsed : 0),
                  z: prev.startPoint3D.z + (axisKey === "z" ? parsed : 0),
                },
              }
            : null,
        );
      } else {
        let finalActiveIds = resolvedIds;
        onCommitEntities((prev) => {
          const deltaObj =
            axisKey === "x"
              ? { dx: parsed }
              : axisKey === "y"
                 ? { dy: parsed }
                 : { dz: parsed };
          const res = applyDirectTransform3DToEntities(
            prev,
            resolvedIds,
            deltaObj,
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
            subSel.activePivot3D ?? primaryBody?.pivot3D ?? null,
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
    shellOpenCapsMode,
    offsetFaceTarget,
    miterEndTarget,
    miterAxis,
    subSel.activePivot3D,
    lastCompletedDrag,
    setSubSel,
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
    onCommitEntities,
    booleanMode,
    openFloatingNumpad,
    primaryBody,
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
  });

  latestDragContextRef.current = {
    onLiveTranslateSelectionXY,
    onCommitTranslateSelectionXY,
    onLiveElevateSelection,
    onCommitElevateSelection,
    onCommitEntities,
    booleanMode,
    openFloatingNumpad,
    primaryBody,
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
  };

  const handleAxisPointerDown = (
    axis: GizmoAxis,
    ux: number,
    uy: number,
    pixelsPerMm: number,
    ev: React.PointerEvent,
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
        ? (primaryBody?.extrudeHeightMm ?? 500)
        : axis === "vertex_bevel"
          ? (vertexBevelGizmo?.currentBevelMm ?? 10)
          : axis === "edge_diagonal"
            ? edgeActionMode === "fillet"
              ? (edgeDiagonalGizmo?.currentFilletVal ?? primaryBody?.edgeFilletRadiusMm ?? 10)
              : edgeActionMode === "chamfer"
                ? (edgeDiagonalGizmo?.currentChamferVal ?? primaryBody?.edgeChamferDistMm ?? 10)
                : 0
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

    dragSessionRef.current = {
      axis,
      pointerId: ev.pointerId,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      screenDirX: ux,
      screenDirY: uy,
      pixelsPerMm: Math.max(0.08, pixelsPerMm),
      totalDeltaMm: 0,
      lastAppliedDeltaMm: 0,
      initialValue: initVal,
      targetIds,
      hasMoved: false,
      startCenter3D: selectionCenter3D ?? undefined,
      angleStartRad,
      pivotScreen: pivotSc,
      startEntities: entities,
      startBody: primaryBody,
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
        const bodyForPivot = session.startBody ?? ctx.primaryBody;
        if (bodyForPivot && bodyForPivot.snapCandidates.length > 0) {
          let closestCand = bodyForPivot.snapCandidates[0];
          let closestDistPx = Infinity;
          for (const cand of bodyForPivot.snapCandidates) {
            const sp = ctx.toScreen(cand.point3D);
            const d = Math.hypot(localX - sp.x, localY - sp.y);
            if (d < closestDistPx) {
              closestDistPx = d;
              closestCand = cand;
            }
          }
          if (closestDistPx < 48 && closestCand) {
            ctx.setSubSel((prev) => ({ ...prev, activePivot3D: closestCand.point3D }));
            setSnappedPivotLabel(closestCand.label);
          }
        }
        return;
      }

      if (
        session.axis === "rot_x" ||
        session.axis === "rot_y" ||
        session.axis === "rot_z" ||
        session.axis === "miter"
      ) {
        const pivotSc = session.pivotScreen ?? { x: localX, y: localY };
        const curAngleRad = Math.atan2(localY - pivotSc.y, localX - pivotSc.x);
        const startRad = session.angleStartRad ?? 0;
        let deltaDeg = Math.round(((curAngleRad - startRad) * 180) / Math.PI);
        const snapStep = 15;
        const rem = deltaDeg % snapStep;
        if (Math.abs(rem) <= 3) {
          deltaDeg -= rem;
        } else if (Math.abs(rem) >= 12) {
          deltaDeg += (deltaDeg >= 0 ? 1 : -1) * (15 - Math.abs(rem));
        }

        if (deltaDeg !== session.lastAppliedDeltaMm) {
          session.lastAppliedDeltaMm = deltaDeg;
          session.totalDeltaMm = deltaDeg;
          setDragDeltaMm(deltaDeg);

          if (session.axis === "miter" && ctx.onCommitEntities) {
            ctx.onCommitEntities(
              () =>
                applyDirectMiterCut3DToEntities(
                  session.startEntities,
                  session.targetIds,
                  ctx.miterEndTarget,
                  deltaDeg,
                  ctx.miterAxis,
                ),
              session.targetIds,
            );
          } else if (ctx.onCommitEntities) {
            const res = applyDirectTransform3DToEntities(
              session.startEntities,
              session.targetIds,
              {
                rxDeg: session.axis === "rot_x" ? deltaDeg : 0,
                ryDeg: session.axis === "rot_y" ? deltaDeg : 0,
                rzDeg: session.axis === "rot_z" ? deltaDeg : 0,
              },
              ctx.copyOnTransform,
              session.copyIdMap,
            );
            session.activeResultIds = res.activeIds;
            ctx.onCommitEntities(() => res.updatedEntities, res.activeIds);
          }
        }
        return;
      }

      if (session.axis === "planar") {
        const rawDeltaX = Math.round(dxPx / session.pixelsPerMm);
        const rawDeltaY = Math.round(-dyPx / session.pixelsPerMm);
        let effDelta: Vec3Mm = { x: rawDeltaX, y: rawDeltaY, z: 0 };

        const refBody = session.startBody ?? ctx.primaryBody;
        if (refBody) {
          const otherBodies = ctx.scene.bodies.filter(
            (b) => b.bodyId !== refBody.bodyId && !session.copyIdMap.has(b.entityId),
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

        if (effDelta.x !== session.lastAppliedDeltaMm || effDelta.y !== session.totalDeltaMm) {
          session.lastAppliedDeltaMm = effDelta.x;
          session.totalDeltaMm = effDelta.y;
          setDragDeltaMm(Math.round(Math.hypot(effDelta.x, effDelta.y)));

          if (ctx.onCommitEntities) {
            const res = applyDirectTransform3DToEntities(
              session.startEntities,
              session.targetIds,
              { dx: effDelta.x, dy: effDelta.y },
              ctx.copyOnTransform,
              session.copyIdMap,
            );
            session.activeResultIds = res.activeIds;
            ctx.onCommitEntities(() => res.updatedEntities, res.activeIds);
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
              contactHighlight: snapRes.contactHighlight,
              alignmentGuides: [],
            });
          } else {
            setActiveContactSnap(null);
          }
        }
      } else if (session.axis === "x" || session.axis === "y") {
        const refBody = session.startBody ?? ctx.primaryBody;
        if (refBody) {
          const otherBodies = ctx.scene.bodies.filter(
            (b) => b.bodyId !== refBody.bodyId && !session.copyIdMap.has(b.entityId),
          );
          const startPivot = session.startCenter3D ?? refBody.pivot3D;
          // Snap Concêntrico ao Centro Geométrico (⌖) no eixo X ou Y
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
      } else if (session.axis === "z") {
        // Trava Ortogonal Estrita em +Z (Ortho: < +Z): X e Y permanecem 100% fixos, sem interferência lateral
        setActiveContactSnap(null);
      }

      if (currentDeltaMm !== session.lastAppliedDeltaMm) {
        session.lastAppliedDeltaMm = currentDeltaMm;
        session.totalDeltaMm = currentDeltaMm;
        setDragDeltaMm(currentDeltaMm);

        if (session.axis === "extrude" && ctx.onCommitEntities) {
          const nextH = Math.max(1, session.initialValue + currentDeltaMm);
          ctx.onCommitEntities(
            () =>
              applyDirectExtrudeToEntities(
                session.startEntities,
                session.targetIds,
                nextH,
                ctx.booleanMode,
              ),
            session.targetIds,
          );
        } else if (session.axis === "face_normal" && ctx.onCommitEntities) {
          const refFace = session.startFace ?? ctx.primaryFace;
          if (refFace && refFace.role === "bottom") {
            ctx.onCommitEntities(
              () =>
                applyDirectOffsetFace3DToEntities(
                  session.startEntities,
                  session.targetIds,
                  "bottom",
                  currentDeltaMm,
                ),
              session.targetIds,
            );
          } else if (refFace && (refFace.role === "top" || refFace.role === "miter")) {
            const nextH = Math.max(1, session.initialValue + currentDeltaMm);
            ctx.onCommitEntities(
              () =>
                applyDirectExtrudeToEntities(
                  session.startEntities,
                  session.targetIds,
                  nextH,
                  ctx.booleanMode,
                ),
              session.targetIds,
            );
          } else if (refFace) {
            ctx.onCommitEntities(
              () =>
                applyDirectOffsetFace3DToEntities(
                  session.startEntities,
                  session.targetIds,
                  "side_normal",
                  currentDeltaMm,
                  refFace.normal,
                ),
              session.targetIds,
            );
          } else {
            ctx.onCommitEntities(
              () =>
                applyDirectOffsetFace3DToEntities(
                  session.startEntities,
                  session.targetIds,
                  "sides",
                  currentDeltaMm,
                ),
              session.targetIds,
            );
          }
        } else if (session.axis === "vertex_bevel" && ctx.onCommitEntities) {
          const refBody = session.startBody ?? ctx.primaryBody;
          const maxBevel = Math.max(
            5,
            Math.min(
              150,
              Math.min(
                refBody?.widthMm || 200,
                refBody?.heightMm || 200,
                refBody?.extrudeHeightMm || 200,
              ) * 0.45,
            ),
          );
          const nextB = Math.min(maxBevel, Math.max(0, session.initialValue + currentDeltaMm));
          ctx.onCommitEntities(
            () =>
              applyDirectFilletOrChamfer3DToEntities(
                session.startEntities,
                session.targetIds,
                "chamfer",
                nextB,
                undefined,
                session.targetBevelKeys,
              ),
            session.targetIds,
          );
        } else if (session.axis === "edge_diagonal" && ctx.onCommitEntities) {
          if (ctx.edgeActionMode === "transform_edge") {
            const refEdge = session.startEdge ?? ctx.primaryEdge;
            const edgePerpNormal: Vec3Mm = refEdge
              ? { x: -refEdge.dir.y, y: refEdge.dir.x, z: 0 }
              : { x: 1, y: 0, z: 0 };
            ctx.onCommitEntities(
              () =>
                applyDirectOffsetFace3DToEntities(
                  session.startEntities,
                  session.targetIds,
                  "side_normal",
                  currentDeltaMm,
                  edgePerpNormal,
                ),
              session.targetIds,
            );
          } else {
            const autoMode =
              session.initialValue <= 0.5 && currentDeltaMm < 0
                ? "chamfer"
                : ctx.filletOrChamferMode;
            const refBody = session.startBody ?? ctx.primaryBody;
            const maxCornerR = Math.max(
              5,
              Math.min(
                150,
                Math.min(refBody?.widthMm || 200, refBody?.heightMm || 200) * 0.45,
              ),
            );
            const nextR = Math.min(
              maxCornerR,
              Math.max(
                0,
                session.initialValue <= 0.5 && currentDeltaMm < 0
                  ? Math.abs(currentDeltaMm)
                  : session.initialValue + currentDeltaMm,
              ),
            );
            ctx.onCommitEntities(
              () =>
                applyDirectFilletOrChamfer3DToEntities(
                  session.startEntities,
                  session.targetIds,
                  autoMode,
                  nextR,
                  session.targetEdgeIndices,
                  session.targetBevelKeys,
                ),
              session.targetIds,
            );
          }
        } else if (session.axis === "x" || session.axis === "y" || session.axis === "z") {
          const deltaObj =
            session.axis === "x"
              ? { dx: currentDeltaMm }
              : session.axis === "y"
                ? { dy: currentDeltaMm }
                : { dz: currentDeltaMm };
          if (ctx.onCommitEntities) {
            const res = applyDirectTransform3DToEntities(
              session.startEntities,
              session.targetIds,
              deltaObj,
              ctx.copyOnTransform,
              session.copyIdMap,
            );
            session.activeResultIds = res.activeIds;
            ctx.onCommitEntities(() => res.updatedEntities, res.activeIds);
            if (ctx.copyOnTransform) {
              ctx.setSubSel((prev) => ({
                ...prev,
                bodyIds: res.activeIds.map((id) => `body_${id}`),
                activePivot3D: session.startCenter3D
                  ? {
                      x:
                        session.startCenter3D.x +
                        (session.axis === "x" ? currentDeltaMm : 0),
                      y:
                        session.startCenter3D.y +
                        (session.axis === "y" ? currentDeltaMm : 0),
                      z:
                        session.startCenter3D.z +
                        (session.axis === "z" ? currentDeltaMm : 0),
                    }
                  : null,
              }));
            }
          } else if (session.axis === "z" && ctx.onLiveElevateSelection && ctx.selected[0]) {
            ctx.onLiveElevateSelection(session.initialValue + currentDeltaMm);
          } else if (ctx.onLiveTranslateSelectionXY) {
            ctx.onLiveTranslateSelectionXY(
              session.axis === "x" ? currentDeltaMm : 0,
              session.axis === "y" ? currentDeltaMm : 0,
              session.targetIds,
            );
          }
        }
      }
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      if (session.pointerId !== undefined && ev.pointerId !== session.pointerId) return;
      setActiveContactSnap(null);
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();

      const ctx = latestDragContextRef.current;
      const distPx = Math.hypot(
        ev.clientX - session.startClientX,
        ev.clientY - session.startClientY,
      );
      const isQuickTap = !session.hasMoved && distPx < 5;

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
          valueText: `${wVal.toFixed(2).replace(/\.00$/, "")} mm`,
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
          valueText: `Copy: ${copyOnTransform ? "ON" : "OFF"}`,
        };
      case "mirror_3d":
        return {
          icon: FlipHorizontal,
          label: "Espelhar 3D",
          valueText: "Eixo X/Y/Z",
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
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 z-30 flex h-[34px] -translate-x-1/2 items-center gap-1 overflow-x-auto scrollbar-none rounded-full border px-2.5 py-0.5 shadow-md backdrop-blur-md"
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
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: [targetB.bodyId],
                      selectionScope: "body",
                      activePivot3D: targetB.pivot3D,
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.([targetB.entityId]);
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
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 z-30 flex h-[38px] -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border border-sky-500/60 px-3 py-1 shadow-lg backdrop-blur-md"
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
            maxWidth: "calc(100% - 28px)",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 z-30 flex h-[40px] -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border px-3 py-1 shadow-lg backdrop-blur-md transition-all"
        >
          <activePillMeta.icon className="size-3.5 shrink-0 text-cyan-500" />
          <span className="shrink-0 font-mono text-[11px] font-bold tracking-tight">
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
                openFloatingNumpad(
                  "DISTANCE",
                  `TRANSLADAR +${transformAxisTarget.toUpperCase()}`,
                  "mm",
                  100,
                  transformAxisTarget === "x"
                    ? "moveX"
                    : transformAxisTarget === "y"
                      ? "moveY"
                      : "moveZ",
                  targetBody.entityId,
                  undefined,
                  copyOnTransform,
                );
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

          {primaryBody && directTool === "shell_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
              <button
                type="button"
                onClick={() => {
                  setShellOpenCapsMode("both_ends");
                  onCommitEntities?.(
                    (prev) =>
                      applyDirectShell3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 4.75,
                        ["top", "bottom"],
                      ),
                    activeTargetEntityIds,
                  );
                }}
                className={pillBtnClass(shellOpenCapsMode === "both_ends")}
              >
                Tubo (2 Faces)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShellOpenCapsMode("top_only");
                  onCommitEntities?.(
                    (prev) =>
                      applyDirectShell3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 4.75,
                        ["top"],
                      ),
                    activeTargetEntityIds,
                  );
                }}
                className={pillBtnClass(shellOpenCapsMode === "top_only")}
              >
                Caixa (1 Face)
              </button>
              {[2, 3, 4.75, 6].map((wVal) => (
                <button
                  key={wVal}
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    const caps: ("top" | "bottom")[] =
                      shellOpenCapsMode === "both_ends" ? ["top", "bottom"] : ["top"];
                    onCommitEntities?.(
                      (prev) => applyDirectShell3DToEntities(prev, activeTargetEntityIds, wVal, caps),
                      activeTargetEntityIds,
                    );
                  }}
                  className={pillBtnClass(
                    Math.abs(
                      (primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 0) - wVal,
                    ) < 0.2,
                  )}
                >
                  {wVal}mm
                </button>
              ))}
            </>
          )}

          {primaryBody && directTool === "offset_face_3d" && (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-400/30" />
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
                  onClick={() => {
                    triggerHaptic("action");
                    onCommitEntities?.(
                      (prev) =>
                        applyDirectOffsetFace3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          selectionKind3D === "face" && primaryFace?.role === "side"
                            ? "side_normal"
                            : offsetFaceTarget,
                          dVal,
                          primaryFace?.normal ?? null,
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
            </>
          )}

          {primaryBody && directTool === "transform_3d" && (
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
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setIsPickingPivotSnap((p) => !p);
                }}
                className={pillBtnClass(isPickingPivotSnap)}
              >
                {isPickingPivotSnap ? "Toque Vértice..." : "Pivô Snap"}
              </button>
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

          <button
            type="button"
            onClick={() => {
              triggerHaptic("action");
              setDirectTool("select_3d");
              setNumpadSession(null);
            }}
            className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-500 px-2.5 font-mono text-[10px] font-bold text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Check className="size-3" />
            <span>Concluir</span>
          </button>

          <button
            type="button"
            aria-label="Fechar ferramenta 3D"
            onClick={() => {
              triggerHaptic("tap");
              setDirectTool("select_3d");
              setNumpadSession(null);
            }}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer",
              isDark
                ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                : "text-slate-500 hover:bg-slate-200 hover:text-slate-900",
            )}
          >
            <X className="size-3.5" />
          </button>
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
          {/* ================================================================= */}
          {scene.bodies.map((body) =>
            body.faces.map((face) => {
              if (face.polygon3D.length < 3) return null;
              const isSelected = subSel.faceIds.includes(face.faceId);
              const isBodySelected =
                subSel.faceIds.length === 0 &&
                subSel.edgeIds.length === 0 &&
                vertexIds.length === 0 &&
                subSel.bodyIds.includes(face.bodyId);
              const ptsStr = face.polygon3D
                .map((p) => {
                  const s = toScreen(p);
                  return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
                })
                .join(" ");

              return (
                <polygon
                  key={face.faceId}
                  points={ptsStr}
                  fill={
                    isSelected
                      ? "rgba(0, 180, 216, 0.34)"
                      : isBodySelected
                        ? "rgba(0, 180, 216, 0.18)"
                        : "rgba(0, 180, 216, 0.001)"
                  }
                  stroke={
                    isSelected || isBodySelected
                      ? "#00B4D8"
                      : "rgba(0, 180, 216, 0.14)"
                  }
                  strokeWidth={isSelected ? 2.6 : isBodySelected ? 2.0 : 0.8}
                  className="pointer-events-auto cursor-pointer transition-colors"
                  style={{ pointerEvents: "fill", touchAction: "none" }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
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

                    // C. Duplo-toque na peça, Curva de Perfil 3D (extrudeHeightMm <= 0.05), Escopo "Peça Inteira" OU Modo Corpo/Transformar ativo -> Reconhece o CORPO / PERFIL 3D e exibe o Gizmo +X / +Y / +Z no centroide ⌖
                    if (
                      isDoubleTapOnBody ||
                      body.extrudeHeightMm <= 0.05 ||
                      selectionScope === "body" ||
                      directTool === "transform_3d"
                    ) {
                      const currentBodies = subSel.bodyIds;
                      const nextBodyIds =
                        ev.shiftKey ||
                        (directTool === "transform_3d" &&
                          !isDoubleTapOnBody &&
                          body.extrudeHeightMm > 0.05 &&
                          currentBodies.length > 0)
                          ? currentBodies.includes(face.bodyId)
                            ? currentBodies.length > 1
                              ? currentBodies.filter((id) => id !== face.bodyId)
                              : currentBodies
                            : [...currentBodies, face.bodyId]
                          : [face.bodyId];

                      setSubSel({
                        faceIds: [],
                        edgeIds: [],
                        vertexIds: [],
                        bodyIds: nextBodyIds,
                        selectionScope: selectionScope === "body" ? "body" : "auto",
                        activePivot3D: body.pivot3D,
                        activeHingeEdgeId: null,
                      });
                      onSelectEntities?.([body.entityId]);
                      if (selectionScope !== "body") {
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
                      directTool !== "shell_3d" &&
                      directTool !== "rotate_axis_3d" &&
                      directTool !== "hole_3d"
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
            }),
          )}

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
            const isProfileCurve = body.extrudeHeightMm <= 0.05;

            return (
              <g key={`centroid_loft_${body.bodyId}`}>
                {/* Contorno destacado dos perfis 3D e seções selecionadas no Loft */}
                {(isProfileCurve || isLoftSection) &&
                  body.edges.map((edge) => {
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
                            : isBodySelected
                              ? "#00E5FF"
                              : "rgba(148, 163, 184, 0.85)"
                        }
                        strokeWidth={isLoftSection || isBodySelected ? 2.6 : 1.7}
                        style={{ pointerEvents: "none" }}
                      />
                    );
                  })}

                {/* Linha tracejada vertical de referência entre Z=0 e a altura Z do perfil */}
                {body.elevationZ > 0.25 && (
                  <g style={{ pointerEvents: "none" }}>
                    <line
                      x1={baseSc.x}
                      y1={baseSc.y}
                      x2={centerSc.x}
                      y2={centerSc.y}
                      stroke={isBodySelected || isLoftSection ? "#3B82F6" : "rgba(59, 130, 246, 0.55)"}
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

                {/* Marcador de Snap de Centro Geométrico (⌖) no centroide de cada perfil */}
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
                    setSubSel({
                      faceIds: [],
                      edgeIds: [],
                      vertexIds: [],
                      bodyIds: [body.bodyId],
                      selectionScope: "body",
                      activePivot3D: body.pivot3D,
                      activeHingeEdgeId: null,
                    });
                    onSelectEntities?.([body.entityId]);
                    setDirectTool("transform_3d");
                  }}
                >
                  <circle
                    cx={0}
                    cy={0}
                    r={8}
                    fill={isLoftSection ? "rgba(56, 189, 248, 0.28)" : "rgba(15, 23, 42, 0.65)"}
                    stroke={isLoftSection ? "#38BDF8" : isBodySelected ? "#00E5FF" : "#64748B"}
                    strokeWidth={1.5}
                  />
                  <line x1={-5} y1={0} x2={5} y2={0} stroke="#38BDF8" strokeWidth={1.2} />
                  <line x1={0} y1={-5} x2={0} y2={5} stroke="#38BDF8" strokeWidth={1.2} />
                </g>

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
                    <rect
                      x={mx - 54}
                      y={my - 22}
                      width={108}
                      height={18}
                      rx={5}
                      fill="#0B1220"
                      stroke="#00E5FF"
                      strokeWidth={1.2}
                    />
                    <text
                      x={mx}
                      y={my - 13}
                      fill="#00E5FF"
                      fontSize="9.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      0.00 mm (Encosto)
                    </text>
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
                    <text
                      x={(sp1.x + sp2.x) * 0.5}
                      y={(sp1.y + sp2.y) * 0.5 - 6}
                      fill="#38BDF8"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {guide.label}
                    </text>
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
                  if (directTool === "shell_3d") {
                    openFloatingNumpad(
                      "THICKNESS",
                      "PAREDE CASCA",
                      "mm",
                      primaryBody?.shellWallThicknessMm || 3,
                      "shellWallThickness",
                      faceNormalGizmo.face.entityId,
                    );
                  } else if (isSideFace || directTool === "offset_face_3d") {
                    openFloatingNumpad(
                      "OFFSET",
                      "DESLOCAR FACE",
                      "mm",
                      lastCompletedDrag?.axis === "face_normal"
                        ? lastCompletedDrag.deltaMm
                        : 25,
                      "offsetFaceDistance",
                      faceNormalGizmo.face.entityId,
                      isSideFace
                        ? "side_normal"
                        : faceNormalGizmo.face.role === "bottom"
                          ? "bottom"
                          : "top",
                    );
                  } else {
                    openFloatingNumpad(
                      "EXTRUSION",
                      "ALTURA EXTRUDE",
                      "mm",
                      primaryBody?.extrudeHeightMm ?? 500,
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
          {/* E2. ARCO DE INCLINAÇÃO / DOBRADIÇA (FACE + ARESTA = ROTATE AXIS)  */}
          {/* ================================================================= */}
          {hingeMiterGizmo && (
            <g
              data-testid="chamfer-gizmo-hinge-miter-arc"
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={(ev) => handleAxisPointerDown("miter", 0, 0, 1, ev)}
              onClick={(ev) => ev.stopPropagation()}
            >
              <circle
                cx={hingeMiterGizmo.origin.x}
                cy={hingeMiterGizmo.origin.y}
                r={36}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.3}
                strokeDasharray="3 3"
                opacity={0.75}
              />
              <path
                d={`M ${hingeMiterGizmo.origin.x - 28} ${hingeMiterGizmo.origin.y - 22} A 36 36 0 0 1 ${hingeMiterGizmo.origin.x + 28} ${hingeMiterGizmo.origin.y - 22}`}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={3.2}
                strokeLinecap="round"
                markerEnd="url(#gizmo-arrow-amber)"
              />
              <g
                transform={`translate(${hingeMiterGizmo.origin.x}, ${hingeMiterGizmo.origin.y - 44})`}
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
                    hingeMiterGizmo.angleDeg || 45,
                    "miterAngle",
                    hingeMiterGizmo.edge.entityId,
                    miterEndTarget,
                  );
                }}
              >
                <rect
                  x={-36}
                  y={-9}
                  width={72}
                  height={18}
                  rx={5}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#F59E0B"
                  strokeWidth={1.3}
                />
                <text
                  x={0}
                  y={1}
                  fill="#F59E0B"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {`∠ ${(activeAxis === "miter" ? dragDeltaMm : hingeMiterGizmo.angleDeg).toFixed(0)}°`}
                </text>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* F. PONTOS MAGNÉTICOS DE SNAP DO PIVÔ 3D                           */}
          {/* ================================================================= */}
          {(isPickingPivotSnap || activeAxis === "pivot") &&
            primaryBody?.snapCandidates.map((cand) => {
              const sp = toScreen(cand.point3D);
              return (
                <g
                  key={cand.id}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("action");
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
          {/* G. GIZMO DO CORPO (TRÍADE X/Y/Z + ROTAÇÃO + PIVÔ + BOTÃO COPY)    */}
          {/* Exibido EXCLUSIVAMENTE quando um CORPO está selecionado           */}
          {/* ================================================================= */}
          {gizmoScreen && selectionKind3D === "body" && (
              <g data-testid="chamfer-gizmo-body-manipulator">
                {/* Linha Tracejada de Deslocamento + Pílula Clicável de Distância em Tempo Real */}
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
                        r={5}
                        fill="#0B1220"
                        stroke={isCopyDrag ? "#10B981" : "#38BDF8"}
                        strokeWidth={2}
                      />
                      <line
                        x1={startSc.x}
                        y1={startSc.y}
                        x2={endSc.x}
                        y2={endSc.y}
                        stroke={isCopyDrag ? "#10B981" : "#38BDF8"}
                        strokeWidth={2.4}
                        strokeDasharray="6 4"
                      />
                      <circle
                        cx={endSc.x}
                        cy={endSc.y}
                        r={4.5}
                        fill={isCopyDrag ? "#10B981" : "#38BDF8"}
                        stroke="#0B1220"
                        strokeWidth={1.5}
                      />
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
                          fill="#060A12"
                          stroke={isCopyDrag ? "#10B981" : "#00B4D8"}
                          strokeWidth={1.6}
                        />
                        <text
                          x={0}
                          y={1}
                          fill={
                            linearAxis === "z"
                              ? "#60A5FA"
                              : isCopyDrag
                                ? "#34D399"
                                : "#38BDF8"
                          }
                          fontSize="10.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {linearAxis === "z"
                            ? `Ortho: ${(primaryBody?.elevationZ ?? currentDistMm).toFixed(2)} mm < +Z`
                            : `${isCopyDrag ? "⧉ " : ""}${currentDistMm >= 0 ? currentDistMm : currentDistMm} mm ✎`}
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* Linhas pontilhadas de projeção ortogonal */}
                <line
                  x1={gizmoScreen.origin.x - gizmoScreen.x.ux * 30}
                  y1={gizmoScreen.origin.y - gizmoScreen.x.uy * 30}
                  x2={gizmoScreen.origin.x + gizmoScreen.x.ux * 90}
                  y2={gizmoScreen.origin.y + gizmoScreen.x.uy * 90}
                  stroke="#EF4444"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.35}
                />
                <line
                  x1={gizmoScreen.origin.x - gizmoScreen.y.ux * 30}
                  y1={gizmoScreen.origin.y - gizmoScreen.y.uy * 30}
                  x2={gizmoScreen.origin.x + gizmoScreen.y.ux * 90}
                  y2={gizmoScreen.origin.y + gizmoScreen.y.uy * 90}
                  stroke="#22C55E"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.35}
                />
                <line
                  x1={gizmoScreen.origin.x - gizmoScreen.z.ux * 30}
                  y1={gizmoScreen.origin.y - gizmoScreen.z.uy * 30}
                  x2={gizmoScreen.origin.x + gizmoScreen.z.ux * 90}
                  y2={gizmoScreen.origin.y + gizmoScreen.z.uy * 90}
                  stroke="#00B4D8"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.35}
                />

                {/* Alça Planar (Move simultâneo em XY sem alterar Z) */}
                <polygon
                  points={`${gizmoScreen.planarQuad.p0.x},${gizmoScreen.planarQuad.p0.y} ${gizmoScreen.planarQuad.p1.x},${gizmoScreen.planarQuad.p1.y} ${gizmoScreen.planarQuad.p2.x},${gizmoScreen.planarQuad.p2.y} ${gizmoScreen.planarQuad.p3.x},${gizmoScreen.planarQuad.p3.y}`}
                  fill="rgba(245, 158, 11, 0.28)"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(ev) =>
                    handleAxisPointerDown("planar", 1, 0, gizmoScreen.x.pixelsPerMm, ev)
                  }
                  onClick={(ev) => ev.stopPropagation()}
                />

                {/* Disco Transferidor Circular com Marcadores a Cada 15° / 45° / 90° / 180° */}
                <circle
                  cx={gizmoScreen.origin.x}
                  cy={gizmoScreen.origin.y}
                  r={48}
                  fill="none"
                  stroke="#00B4D8"
                  strokeWidth={
                    activeAxis === "rot_x" || activeAxis === "rot_y" || activeAxis === "rot_z"
                      ? 2.2
                      : 1.4
                  }
                  strokeDasharray="3 3"
                  opacity={
                    activeAxis === "rot_x" || activeAxis === "rot_y" || activeAxis === "rot_z"
                      ? 0.95
                      : 0.7
                  }
                />
                {[0, 15, 30, 45, 60, 75, 90, 135, 180, 225, 270, 315].map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  const tx1 = gizmoScreen.origin.x + Math.cos(rad) * (deg % 45 === 0 ? 41 : 44);
                  const ty1 = gizmoScreen.origin.y + Math.sin(rad) * (deg % 45 === 0 ? 41 : 44);
                  const tx2 = gizmoScreen.origin.x + Math.cos(rad) * 48;
                  const ty2 = gizmoScreen.origin.y + Math.sin(rad) * 48;
                  return (
                    <line
                      key={deg}
                      x1={tx1}
                      y1={ty1}
                      x2={tx2}
                      y2={ty2}
                      stroke="#00B4D8"
                      strokeWidth={deg % 45 === 0 ? 2 : 1}
                      opacity={0.85}
                    />
                  );
                })}

                {/* 3 Arcos Curvos de Rotação (Rotacionar nos 3 Eixos: Z, X, Y) */}
                <path
                  data-testid="chamfer-gizmo-rot-z"
                  d={`M ${gizmoScreen.origin.x + gizmoScreen.x.ux * 42} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 42} A 42 42 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.y.ux * 42} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 42}`}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth={activeAxis === "rot_z" ? 4.2 : 3}
                  strokeLinecap="round"
                  markerEnd="url(#gizmo-arrow-amber)"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(ev) => handleAxisPointerDown("rot_z", 0, 0, 1, ev)}
                  onClick={(ev) => ev.stopPropagation()}
                />
                <path
                  data-testid="chamfer-gizmo-rot-x"
                  d={`M ${gizmoScreen.origin.x + gizmoScreen.y.ux * 38} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 38} A 38 38 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.z.ux * 38} ${gizmoScreen.origin.y + gizmoScreen.z.uy * 38}`}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={activeAxis === "rot_x" ? 4.2 : 2.6}
                  strokeLinecap="round"
                  markerEnd="url(#gizmo-arrow-x)"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(ev) => handleAxisPointerDown("rot_x", 0, 0, 1, ev)}
                  onClick={(ev) => ev.stopPropagation()}
                />
                <path
                  data-testid="chamfer-gizmo-rot-y"
                  d={`M ${gizmoScreen.origin.x + gizmoScreen.z.ux * 38} ${gizmoScreen.origin.y + gizmoScreen.z.uy * 38} A 38 38 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.x.ux * 38} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 38}`}
                  fill="none"
                  stroke="#22C55E"
                  strokeWidth={activeAxis === "rot_y" ? 4.2 : 2.6}
                  strokeLinecap="round"
                  markerEnd="url(#gizmo-arrow-y)"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(ev) => handleAxisPointerDown("rot_y", 0, 0, 1, ev)}
                  onClick={(ev) => ev.stopPropagation()}
                />

                {/* Eixo X (Vermelho) */}
                <g
                  data-testid="chamfer-gizmo-axis-x"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(ev) =>
                    handleAxisPointerDown(
                      "x",
                      gizmoScreen.x.ux,
                      gizmoScreen.x.uy,
                      gizmoScreen.x.pixelsPerMm,
                      ev,
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
                    strokeWidth={28}
                    style={{ pointerEvents: "stroke" }}
                  />
                  <line
                    x1={gizmoScreen.origin.x}
                    y1={gizmoScreen.origin.y}
                    x2={gizmoScreen.x.endX}
                    y2={gizmoScreen.x.endY}
                    stroke="#EF4444"
                    strokeWidth={activeAxis === "x" ? 3.75 : 2.5}
                    markerEnd="url(#gizmo-arrow-x)"
                    style={{ pointerEvents: "stroke" }}
                  />
                  <circle
                    cx={gizmoScreen.x.endX + gizmoScreen.x.ux * 10}
                    cy={gizmoScreen.x.endY + gizmoScreen.x.uy * 10}
                    r={14}
                    fill="rgba(239, 68, 68, 0.15)"
                    stroke="rgba(239, 68, 68, 0.45)"
                    strokeWidth={1}
                    style={{ pointerEvents: "all" }}
                    className="cursor-pointer"
                  />
                  <text
                    x={gizmoScreen.x.endX + gizmoScreen.x.ux * 10}
                    y={gizmoScreen.x.endY + gizmoScreen.x.uy * 10}
                    fill="#EF4444"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ pointerEvents: "none" }}
                  >
                    +X
                  </text>
                </g>

                {/* Eixo Y (Verde) */}
                <g
                  data-testid="chamfer-gizmo-axis-y"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(ev) =>
                    handleAxisPointerDown(
                      "y",
                      gizmoScreen.y.ux,
                      gizmoScreen.y.uy,
                      gizmoScreen.y.pixelsPerMm,
                      ev,
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
                    strokeWidth={28}
                    style={{ pointerEvents: "stroke" }}
                  />
                  <line
                    x1={gizmoScreen.origin.x}
                    y1={gizmoScreen.origin.y}
                    x2={gizmoScreen.y.endX}
                    y2={gizmoScreen.y.endY}
                    stroke="#22C55E"
                    strokeWidth={activeAxis === "y" ? 3.75 : 2.5}
                    markerEnd="url(#gizmo-arrow-y)"
                    style={{ pointerEvents: "stroke" }}
                  />
                  <circle
                    cx={gizmoScreen.y.endX + gizmoScreen.y.ux * 10}
                    cy={gizmoScreen.y.endY + gizmoScreen.y.uy * 10}
                    r={14}
                    fill="rgba(34, 197, 94, 0.15)"
                    stroke="rgba(34, 197, 94, 0.45)"
                    strokeWidth={1}
                    style={{ pointerEvents: "all" }}
                    className="cursor-pointer"
                  />
                  <text
                    x={gizmoScreen.y.endX + gizmoScreen.y.ux * 10}
                    y={gizmoScreen.y.endY + gizmoScreen.y.uy * 10}
                    fill="#22C55E"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ pointerEvents: "none" }}
                  >
                    +Y
                  </text>
                </g>

                {/* Eixo Z / Seta Vertical Azul de Elevação (#3B82F6 ficando Dourada #F59E0B ao arrastar) */}
                <g
                  data-testid="chamfer-gizmo-axis-z"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
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
                    strokeWidth={28}
                    style={{ pointerEvents: "stroke" }}
                  />
                  <line
                    x1={gizmoScreen.origin.x}
                    y1={gizmoScreen.origin.y}
                    x2={gizmoScreen.z.endX}
                    y2={gizmoScreen.z.endY}
                    stroke={activeAxis === "z" ? "#F59E0B" : "#3B82F6"}
                    strokeWidth={
                      activeAxis === "z" || activeAxis === "extrude" ? 4.2 : 3.0
                    }
                    markerEnd={
                      activeAxis === "z"
                        ? "url(#gizmo-arrow-amber)"
                        : "url(#gizmo-arrow-z-blue)"
                    }
                    style={{ pointerEvents: "stroke" }}
                  />
                  <circle
                    cx={gizmoScreen.z.endX + gizmoScreen.z.ux * 12}
                    cy={gizmoScreen.z.endY + gizmoScreen.z.uy * 12}
                    r={14}
                    fill={
                      activeAxis === "z"
                        ? "rgba(245, 158, 11, 0.22)"
                        : "rgba(59, 130, 246, 0.18)"
                    }
                    stroke={
                      activeAxis === "z"
                        ? "rgba(245, 158, 11, 0.75)"
                        : "rgba(59, 130, 246, 0.65)"
                    }
                    strokeWidth={1.3}
                    style={{ pointerEvents: "all" }}
                    className="cursor-pointer"
                  />
                  <text
                    x={gizmoScreen.z.endX + gizmoScreen.z.ux * 12}
                    y={gizmoScreen.z.endY + gizmoScreen.z.uy * 12}
                    fill={activeAxis === "z" ? "#F59E0B" : "#60A5FA"}
                    fontSize="10"
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

                {/* Botão Circular Flutuante de Multiplicação ("Copy") Acoplado ao Manipulador (Seção 2.1) */}
                <g
                  data-testid="chamfer-gizmo-inline-copy-btn"
                  transform={`translate(${gizmoScreen.origin.x - 52}, ${gizmoScreen.origin.y + 42})`}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    setCopyOnTransform((c) => !c);
                  }}
                >
                  <circle
                    cx={0}
                    cy={0}
                    r={15}
                    fill={copyOnTransform ? "#059669" : "#0B1220"}
                    stroke={copyOnTransform ? "#34D399" : "#00B4D8"}
                    strokeWidth={2}
                  />
                  <rect
                    x={-5.5}
                    y={-5.5}
                    width={7.5}
                    height={7.5}
                    rx={1.5}
                    fill="none"
                    stroke={copyOnTransform ? "#FFFFFF" : "#38BDF8"}
                    strokeWidth={1.5}
                  />
                  <rect
                    x={-1.5}
                    y={-1.5}
                    width={7.5}
                    height={7.5}
                    rx={1.5}
                    fill={copyOnTransform ? "#059669" : "#0B1220"}
                    stroke={copyOnTransform ? "#FFFFFF" : "#38BDF8"}
                    strokeWidth={1.5}
                  />
                  <rect
                    x={-26}
                    y={18}
                    width={52}
                    height={14}
                    rx={4}
                    fill="#060A12"
                    stroke={copyOnTransform ? "#10B981" : "rgba(0, 180, 216, 0.5)"}
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={25.5}
                    fill={copyOnTransform ? "#34D399" : "#94A3B8"}
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {copyOnTransform ? "COPY: ON" : "COPY"}
                  </text>
                </g>

                {/* Pivô Central Móvel com Esfera/Alvo e 4 Setinhas Direcionais (Seção 3.2) */}
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
                  <line
                    x1={gizmoScreen.origin.x - 13}
                    y1={gizmoScreen.origin.y}
                    x2={gizmoScreen.origin.x + 13}
                    y2={gizmoScreen.origin.y}
                    stroke={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                    strokeWidth={1.8}
                  />
                  <line
                    x1={gizmoScreen.origin.x}
                    y1={gizmoScreen.origin.y - 13}
                    x2={gizmoScreen.origin.x}
                    y2={gizmoScreen.origin.y + 13}
                    stroke={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                    strokeWidth={1.8}
                  />
                  <polygon
                    points={`${gizmoScreen.origin.x},${gizmoScreen.origin.y - 15} ${gizmoScreen.origin.x - 2.5},${gizmoScreen.origin.y - 11} ${gizmoScreen.origin.x + 2.5},${gizmoScreen.origin.y - 11}`}
                    fill={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                  />
                  <polygon
                    points={`${gizmoScreen.origin.x},${gizmoScreen.origin.y + 15} ${gizmoScreen.origin.x - 2.5},${gizmoScreen.origin.y + 11} ${gizmoScreen.origin.x + 2.5},${gizmoScreen.origin.y + 11}`}
                    fill={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                  />
                  <polygon
                    points={`${gizmoScreen.origin.x - 15},${gizmoScreen.origin.y} ${gizmoScreen.origin.x - 11},${gizmoScreen.origin.y - 2.5} ${gizmoScreen.origin.x - 11},${gizmoScreen.origin.y + 2.5}`}
                    fill={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                  />
                  <polygon
                    points={`${gizmoScreen.origin.x + 15},${gizmoScreen.origin.y} ${gizmoScreen.origin.x + 11},${gizmoScreen.origin.y - 2.5} ${gizmoScreen.origin.x + 11},${gizmoScreen.origin.y + 2.5}`}
                    fill={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                  />
                  <circle
                    cx={gizmoScreen.origin.x}
                    cy={gizmoScreen.origin.y}
                    r={6.5}
                    fill={isPickingPivotSnap || activeAxis === "pivot" ? "#F59E0B" : "#00B4D8"}
                    stroke={isDark ? "#0F172A" : "#FFFFFF"}
                    strokeWidth={2}
                  />
                </g>

                {/* Feedback de Delta / Snap do Pivô / Ortho: < +Z durante arraste */}
                {activeAxis && (
                  <g
                    transform={`translate(${gizmoScreen.origin.x}, ${gizmoScreen.origin.y - 24})`}
                  >
                    <rect
                      x={-88}
                      y={-11}
                      width={176}
                      height={20}
                      rx={6}
                      fill={isDark ? "#0B1220" : "#FFFFFF"}
                      stroke={
                        activeAxis === "z"
                          ? "#F59E0B"
                          : copyOnTransform
                            ? "#10B981"
                            : "#00B4D8"
                      }
                      strokeWidth={1.3}
                    />
                    <text
                      x={0}
                      y={1}
                      fill={isDark ? "#F8FAFC" : "#0F172A"}
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {activeAxis === "pivot"
                        ? snappedPivotLabel ?? "Pivô Móvel (Snap)"
                        : activeAxis === "z"
                          ? `Ortho: ${(primaryBody?.elevationZ ?? dragDeltaMm).toFixed(2)} mm < +Z`
                          : activeAxis === "extrude" || activeAxis === "face_normal"
                            ? `H: ${((primaryBody?.extrudeHeightMm ?? sheetThickness) + dragDeltaMm).toFixed(1)} mm`
                            : activeAxis === "rot_x" ||
                                activeAxis === "rot_y" ||
                                activeAxis === "rot_z" ||
                                activeAxis === "miter"
                              ? `∠ ${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm}°`
                              : activeAxis === "planar"
                                ? `${copyOnTransform ? "COPY " : ""}ΔXY: ${dragDeltaMm} mm`
                                : `${copyOnTransform ? "COPY " : ""}Δ${activeAxis.toUpperCase()}: ${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm} mm`}
                    </text>
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
          3. BADGE IN-CANVAS CLICÁVEL AO LADO DO ELEMENTO (ACIONA O NUMPAD COMPACTO)
          CORREÇÃO 5: Sem botões duplicados (Novo/União/Subtrair ou Copy: ON duplicado)!
          ===================================================================== */}
      {is3DEnvironment &&
        gizmoScreen &&
        primaryBody &&
        !numpadSession &&
        selectionKind3D === "body" && (
        <div
          style={{
            left: `${Math.max(16, Math.min(width - 165, gizmoScreen.z.endX + 12))}px`,
            top: `${Math.max(46, Math.min(height - 96, gizmoScreen.z.endY - 12))}px`,
          }}
          className="pointer-events-auto absolute z-30 flex items-center gap-1 select-none"
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
                  (lastCompletedDrag?.activeResultIds[0] ?? primaryBody.entityId),
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
            <span className="text-cyan-600 dark:text-cyan-300">
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
                          ? `Δ${lastCompletedDrag.axis.toUpperCase()} ${lastCompletedDrag.deltaMm} mm`
                          : `Δ${transformAxisTarget.toUpperCase()} mm`
                        : `${primaryBody.extrudeHeightMm.toFixed(1)} mm`}
            </span>
          </button>

          {/* Mirror ⇄ Tool Button & Popup */}
          <div className="relative">
            <button
              type="button"
              data-testid="chamfer-3d-gizmo-mirror-btn"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                triggerHaptic("selection");
                setMirrorPlanePopupOpen((p) => !p);
              }}
              style={mirrorPlanePopupOpen ? undefined : themeSurfaceStyle}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold shadow-md transition-all cursor-pointer",
                mirrorPlanePopupOpen ? "border-amber-400 bg-amber-600 text-white" : "border-slate-500/40",
              )}
            >
              <FlipHorizontal className="size-2.5" />
              <span>Espelhar ⇄</span>
            </button>
            {mirrorPlanePopupOpen && (
              <div
                style={themeSurfaceStyle}
                className="absolute left-0 top-full mt-1 z-40 flex items-center gap-1 rounded-lg border p-1 shadow-xl"
              >
                {(["x", "y", "z"] as const).map((pl) => (
                  <button
                    key={pl}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      setMirrorPlanePopupOpen(false);
                      onCommitEntities?.((prev) => {
                        const res = applyDirectMirror3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          pl,
                          copyOnTransform,
                          subSel.activePivot3D,
                        );
                        return res.updatedEntities;
                      }, activeTargetEntityIds);
                    }}
                    className="rounded-md bg-cyan-600 hover:bg-cyan-500 px-2 py-0.5 font-mono text-[9.5px] font-bold text-white cursor-pointer"
                  >
                    ⇄ {pl.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          3B. BARRA INFERIOR COMPACTA DE TELEMETRIA DA SELEÇÃO 3D (VÉRTICE / FACE / ARESTA / CORPO)
          ===================================================================== */}
      {is3DEnvironment &&
        tool !== "loft_3d" &&
        (subSel.faceIds.length > 0 ||
          subSel.edgeIds.length > 0 ||
          vertexIds.length > 0 ||
          subSel.bodyIds.length > 0) && (
          <div
            data-testid="chamfer-3d-selection-telemetry-bar"
            style={{
              ...themeSurfaceStyle,
              bottom: "14px",
              maxWidth: "calc(100% - 32px)",
            }}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              ev.preventDefault();
            }}
            className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-500/50 px-3.5 py-1 font-mono text-[10.5px] font-bold shadow-lg backdrop-blur-md select-none"
          >
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9.5px] font-extrabold text-cyan-400 border border-cyan-500/40">
              {selectionKind3D === "vertex"
                ? "VÉRTICE"
                : selectionKind3D === "face"
                  ? "FACE"
                  : selectionKind3D === "edge"
                    ? "ARESTA"
                    : selectionKind3D === "hinge"
                      ? "DOBRADIÇA"
                      : "PEÇA INTEIRA"}
            </span>
            <span className={cn("truncate font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>
              {formatSubElementTelemetry3D(scene, subSel)}
            </span>
            {primaryBody && selectionKind3D === "body" && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-800/95 border border-slate-700 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                {(primaryBody.volumeMm3 / 1000).toFixed(1)} cm³ ·{" "}
                {primaryBody.massGrams >= 1000
                  ? `${(primaryBody.massGrams / 1000).toFixed(2)} kg`
                  : `${primaryBody.massGrams.toFixed(0)} g`}{" "}
                · χ={primaryBody.eulerCharacteristic.chi}
              </span>
            )}
            {primaryBody && selectionKind3D !== "body" && (
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
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
                  onSelectEntities?.([primaryBody.entityId]);
                  setDirectTool("transform_3d");
                }}
                className="rounded-full bg-slate-800 hover:bg-cyan-600/30 border border-cyan-500/40 px-2 py-0.5 text-[9.5px] text-cyan-300 cursor-pointer"
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
                className="rounded-full bg-amber-600 hover:bg-amber-500 border border-amber-400/60 px-2 py-0.5 text-[9.5px] font-bold text-white cursor-pointer whitespace-nowrap"
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
                "rounded-full px-1.5 py-0.5 text-[10px] cursor-pointer",
                isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900",
              )}
              title="Limpar seleção 3D"
            >
              ✕
            </button>
          </div>
        )}

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

          {/* Visor numérico compacto no topo */}
          <div
            className={cn(
              "mb-1.5 flex h-7 items-center justify-between rounded-lg border px-2.5 font-mono",
              isDark
                ? "border-cyan-500/40 bg-slate-900/95 text-white"
                : "border-cyan-600/40 bg-slate-50 text-slate-900",
            )}
          >
            <span
              data-testid="chamfer-floating-numpad-display"
              className="truncate text-[12.5px] font-bold"
            >
              {numpadBuffer}
            </span>
            <span className="ml-1 text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
              {numpadSession.unit}
            </span>
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
