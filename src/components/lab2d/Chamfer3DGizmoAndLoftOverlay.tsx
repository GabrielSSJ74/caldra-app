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
  Compass,
  Copy,
  CornerDownRight,
  FlipHorizontal,
  Layers,
  Move,
  Palette,
  PenTool,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { bbox, type Entity, type Vec2 } from "@/lib/lab2d/core";
import type { WorkplaneOrbitProjection2D } from "@/lib/lab2d/orbit3dController";
import {
  resolveContactAndAlignmentSnaps3D,
  resolveFaceStretchContactSnap,
  type ContactSnapResult3D,
} from "@/lib/lab2d/cadContactSnapping3D";
import {
  getEntityElevationZ,
  type LoftBodyMode,
  type LoftSurfaceMode,
} from "@/lib/lab2d/cadLoft3DEngine";
import {
  INDUSTRIAL_3D_MATERIALS,
  applyDirectExtrudeToEntities,
  applyDirectFilletOrChamfer3DToEntities,
  applyDirectMirror3DToEntities,
  applyDirectMiterCut3DToEntities,
  applyDirectOffsetFace3DToEntities,
  applyDirectShell3DToEntities,
  applyDirectTransform3DToEntities,
  buildDirectTopology3DScene,
  projectPoint3DToCanvasViewMm,
  type ActiveParametricNumpadSession,
  type BooleanMode3D,
  type DirectBody3D,
  type DirectEdge3D,
  type DirectFace3D,
  type DirectModeling3DTool,
  type DirectTopology3DScene,
  type NumpadTargetParameter,
  type ParametricNumpadKind,
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
  onClearLoftSections: onClearLoftSectionsProp,
  onCancelLoft3D,
  onConfirmLoft3D,
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

  // Estado de modos internos das ferramentas 3D
  const [booleanMode, setBooleanMode] = useState<BooleanMode3D>("new_body");
  const [filletOrChamferMode, setFilletOrChamferMode] = useState<"fillet" | "chamfer">("fillet");
  const [shellOpenCapsMode, setShellOpenCapsMode] = useState<"both_ends" | "top_only">("both_ends");
  const [offsetFaceTarget, setOffsetFaceTarget] = useState<"top" | "bottom" | "sides">("top");
  const [miterEndTarget, setMiterEndTarget] = useState<"top" | "bottom">("top");
  const [miterAxis, setMiterAxis] = useState<"x" | "y">("x");
  const [copyOnTransform, setCopyOnTransform] = useState<boolean>(false);
  const [transformAxisTarget, setTransformAxisTarget] = useState<"x" | "y" | "z">("x");
  const [isPickingPivotSnap, setIsPickingPivotSnap] = useState<boolean>(false);

  // Sessão do Teclado Numérico Flutuante In-Canvas (OCULTO POR PADRÃO)
  const [numpadSession, setNumpadSession] = useState<ActiveParametricNumpadSession | null>(null);
  const [numpadBuffer, setNumpadBuffer] = useState<string>("");

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

  const dragSessionRef = useRef<{
    axis: GizmoAxis;
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
  } | null>(null);

  const scene = useMemo(
    () => externalScene ?? buildDirectTopology3DScene(entities, sheetThickness),
    [externalScene, entities, sheetThickness],
  );

  // Determina os corpos/entidades alvo (a partir de subSelection3D ou selection 2D/3D)
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
    if (ids.size === 0) {
      for (const sId of selection) ids.add(sId);
    }
    if (ids.size === 0 && scene.bodies.length === 1 && activeMode === "3d") {
      ids.add(scene.bodies[0]!.entityId);
    }
    return Array.from(ids);
  }, [subSel, scene, selection, activeMode]);

  const primaryBody: DirectBody3D | null = useMemo(() => {
    for (const id of activeTargetEntityIds) {
      const b = scene.bodies.find((x) => x.entityId === id);
      if (b) return b;
    }
    return scene.bodies[0] ?? null;
  }, [activeTargetEntityIds, scene.bodies]);

  const primaryFace: DirectFace3D | null = useMemo(() => {
    if (subSel.faceIds.length > 0) {
      return scene.facesById.get(subSel.faceIds[0]!) ?? null;
    }
    return primaryBody?.faces[0] ?? null;
  }, [subSel.faceIds, scene.facesById, primaryBody]);

  const primaryEdge: DirectEdge3D | null = useMemo(() => {
    if (subSel.edgeIds.length > 0) {
      return scene.edgesById.get(subSel.edgeIds[0]!) ?? null;
    }
    return primaryBody?.edges[0] ?? null;
  }, [subSel.edgeIds, scene.edgesById, primaryBody]);

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

  // Calcula o centro 3D do Gizmo (respeitando pivô móvel ou sub-elemento selecionado)
  const selectionCenter3D = useMemo<Vec3Mm | null>(() => {
    if (subSel.activePivot3D) return subSel.activePivot3D;
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
  }, [subSel, primaryFace, primaryEdge, primaryBody, directTool, selected]);

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

  // Projeção da Seta Normal Bidirecional da Face Selecionada
  const faceNormalGizmo = useMemo(() => {
    if (!primaryFace || (!isTilted3D && activeMode !== "3d")) return null;
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
    const arrowLenPx = 54;
    return {
      origin: originScreen,
      centroid3D: primaryFace.centroid,
      normal3D: normal,
      posTip: { x: originScreen.x + ux * arrowLenPx, y: originScreen.y + uy * arrowLenPx },
      negTip: { x: originScreen.x - ux * arrowLenPx, y: originScreen.y - uy * arrowLenPx },
      ux,
      uy,
      pixelsPerMm: Math.max(0.15, rawPxLen / stepMm),
      face: primaryFace,
    };
  }, [primaryFace, isTilted3D, activeMode, toScreen, view.k]);

  // Projeção da Seta Diagonal da Aresta Selecionada (Fillet / Chamfer)
  const edgeDiagonalGizmo = useMemo(() => {
    if (!primaryEdge || (!isTilted3D && activeMode !== "3d")) return null;
    const originScreen = toScreen(primaryEdge.midpoint);
    const poly = primaryEdge.polyline3D;
    const p0 = poly[0] ? toScreen(poly[0]) : originScreen;
    const p1 = poly[poly.length - 1] ? toScreen(poly[poly.length - 1]) : originScreen;
    const ex = p1.x - p0.x;
    const ey = p1.y - p0.y;
    const elen = Math.hypot(ex, ey) || 1;
    const ux = -ey / elen;
    const uy = ex / elen;
    const arrowLenPx = 42;
    return {
      origin: originScreen,
      midpoint3D: primaryEdge.midpoint,
      tip: { x: originScreen.x + ux * arrowLenPx, y: originScreen.y + uy * arrowLenPx },
      oppTip: { x: originScreen.x - ux * arrowLenPx, y: originScreen.y - uy * arrowLenPx },
      ux,
      uy,
      pixelsPerMm: Math.max(0.15, 30 / 10),
      edge: primaryEdge,
    };
  }, [primaryEdge, isTilted3D, activeMode, toScreen]);

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
            : [];
      if (resolvedTargetIds.length === 0) return;
      triggerHaptic("selection");

      const primaryId = targetEntityId || resolvedTargetIds[0];

      setNumpadSession({
        kind,
        targetParameter,
        targetEntityId: primaryId,
        title,
        unit,
        initialValue: Number(initialValue.toFixed(2)),
        screenPos: { x: 0, y: 0 },
        targetEntityIds: resolvedTargetIds,
        subTarget,
        copyMode: copyModeOverride ?? copyOnTransform,
      });
      setNumpadBuffer(String(Number(initialValue.toFixed(2))));
    },
    [activeTargetEntityIds, primaryBody, copyOnTransform],
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
        (prev) => applyDirectFilletOrChamfer3DToEntities(prev, resolvedIds, "fillet", parsed),
        resolvedIds,
      );
    } else if (param === "chamferDistance") {
      onCommitEntities(
        (prev) => applyDirectFilletOrChamfer3DToEntities(prev, resolvedIds, "chamfer", parsed),
        resolvedIds,
      );
    } else if (param === "offsetFaceDistance") {
      const faceT =
        subTarget === "top" || subTarget === "bottom" || subTarget === "sides"
          ? subTarget
          : offsetFaceTarget;
      onCommitEntities(
        (prev) => applyDirectOffsetFace3DToEntities(prev, resolvedIds, faceT, parsed),
        resolvedIds,
      );
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
    } else if (param === "moveX") {
      onCommitEntities((prev) => {
        const res = applyDirectTransform3DToEntities(
          prev,
          resolvedIds,
          { dx: parsed },
          Boolean(copyMode),
        );
        return res.updatedEntities;
      }, resolvedIds);
    } else if (param === "moveY") {
      onCommitEntities((prev) => {
        const res = applyDirectTransform3DToEntities(
          prev,
          resolvedIds,
          { dy: parsed },
          Boolean(copyMode),
        );
        return res.updatedEntities;
      }, resolvedIds);
    } else if (param === "moveZ") {
      onCommitEntities((prev) => {
        const res = applyDirectTransform3DToEntities(
          prev,
          resolvedIds,
          { dz: parsed },
          Boolean(copyMode),
        );
        return res.updatedEntities;
      }, resolvedIds);
    }

    setNumpadSession(null);
  }, [
    numpadSession,
    numpadBuffer,
    onCommitEntities,
    primaryBody,
    booleanMode,
    shellOpenCapsMode,
    offsetFaceTarget,
    miterEndTarget,
    miterAxis,
  ]);

  const handleNumpadKey = useCallback((key: string) => {
    triggerHaptic("tap");
    if (key === "C") {
      setNumpadBuffer("0");
      return;
    }
    if (key === "BACK") {
      setNumpadBuffer((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
      return;
    }
    if (key === "+/-") {
      setNumpadBuffer((prev) => (prev.startsWith("-") ? prev.slice(1) : `-${prev}`));
      return;
    }
    if (key === ".") {
      setNumpadBuffer((prev) => (prev.includes(".") ? prev : `${prev}.`));
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
    if (!primaryBody) return;
    const vertIds = primaryBody.edges
      .filter((e) => e.role === "vertical")
      .map((e) => e.edgeId);
    triggerHaptic("selection");
    setSubSel((prev) => ({
      ...prev,
      edgeIds: vertIds,
      faceIds: [],
      bodyIds: [],
    }));
  }, [primaryBody, setSubSel]);

  const handleSelectTopAndBottomFacesForTube = useCallback(() => {
    if (!primaryBody) return;
    const endFaceIds = primaryBody.faces
      .filter((f) => f.role === "top" || f.role === "bottom" || f.role === "miter")
      .map((f) => f.faceId);
    triggerHaptic("selection");
    setShellOpenCapsMode("both_ends");
    setSubSel((prev) => ({
      ...prev,
      faceIds: endFaceIds,
      edgeIds: [],
      bodyIds: [],
    }));
  }, [primaryBody, setSubSel]);

  // Escuta filtros rápidos de sub-seleção 3D disparados pelo menu lateral 'SEL'
  useEffect(() => {
    const onSubSelPreset = (ev: Event) => {
      if (!primaryBody) return;
      const preset = (ev as CustomEvent<{ preset?: string }>).detail?.preset;
      if (!preset) return;
      if (preset === "body") {
        setSubSel({
          bodyIds: [primaryBody.bodyId],
          faceIds: [],
          edgeIds: [],
          activePivot3D: primaryBody.pivot3D,
          activeHingeEdgeId: null,
        });
      } else if (preset === "top_face") {
        const topF =
          primaryBody.faces.find((f) => f.role === "top" || f.role === "miter") ??
          primaryBody.faces[0];
        if (topF) {
          setSubSel({
            faceIds: [topF.faceId],
            edgeIds: [],
            bodyIds: [],
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
          faceIds: primaryBody.faces.map((f) => f.faceId),
          edgeIds: [],
          bodyIds: [],
          activePivot3D: primaryBody.pivot3D,
          activeHingeEdgeId: null,
        });
      } else if (preset === "all_edges") {
        setSubSel({
          edgeIds: primaryBody.edges.map((e) => e.edgeId),
          faceIds: [],
          bodyIds: [],
          activePivot3D: primaryBody.pivot3D,
          activeHingeEdgeId: null,
        });
      }
    };
    window.addEventListener("chamfer-3d-subselection-preset", onSubSelPreset);
    return () => window.removeEventListener("chamfer-3d-subselection-preset", onSubSelPreset);
  }, [
    primaryBody,
    setSubSel,
    handleSelectTopAndBottomFacesForTube,
    handleSelectAllVerticalEdges,
  ]);

  // ============================================================================
  // ARRASTE INTERATIVO DAS SETAS 3D NO CANVAS (EXTRUDE / OFFSET / TRANSFORM)
  // ============================================================================

  const handleAxisPointerDown = (
    axis: GizmoAxis,
    ux: number,
    uy: number,
    pixelsPerMm: number,
    ev: React.PointerEvent,
  ) => {
    ev.stopPropagation();
    ev.preventDefault();
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
        : axis === "edge_diagonal"
          ? (filletOrChamferMode === "fillet"
              ? (primaryBody?.edgeFilletRadiusMm || 10)
              : (primaryBody?.edgeChamferDistMm || 10))
          : axis === "z"
            ? (primaryBody?.elevationZ ?? 0)
            : 0;

    const pivotSc = gizmoScreen?.origin ?? { x: ev.clientX, y: ev.clientY };
    const angleStartRad = Math.atan2(ev.clientY - pivotSc.y, ev.clientX - pivotSc.x);

    dragSessionRef.current = {
      axis,
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
      ev.stopPropagation();
      ev.preventDefault();

      const dxPx = ev.clientX - session.startClientX;
      const dyPx = ev.clientY - session.startClientY;
      if (Math.hypot(dxPx, dyPx) > 3) {
        session.hasMoved = true;
      }

      if (session.axis === "pivot") {
        if (primaryBody && primaryBody.snapCandidates.length > 0) {
          let closestCand = primaryBody.snapCandidates[0];
          let closestDistPx = Infinity;
          for (const cand of primaryBody.snapCandidates) {
            const sp = toScreen(cand.point3D);
            const d = Math.hypot(ev.clientX - sp.x, ev.clientY - sp.y);
            if (d < closestDistPx) {
              closestDistPx = d;
              closestCand = cand;
            }
          }
          if (closestDistPx < 40 && closestCand) {
            setSubSel((prev) => ({ ...prev, activePivot3D: closestCand.point3D }));
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
        const pivotSc = session.pivotScreen ?? { x: session.startClientX, y: session.startClientY };
        const curAngleRad = Math.atan2(ev.clientY - pivotSc.y, ev.clientX - pivotSc.x);
        const startRad = session.angleStartRad ?? 0;
        let deltaDeg = Math.round(((curAngleRad - startRad) * 180) / Math.PI);
        // Soft snap suave em múltiplos de 15°
        const snapStep = 15;
        const rem = deltaDeg % snapStep;
        if (Math.abs(rem) <= 3) {
          deltaDeg -= rem;
        } else if (Math.abs(rem) >= 12) {
          deltaDeg += (deltaDeg >= 0 ? 1 : -1) * (15 - Math.abs(rem));
        }

        const stepDeg = deltaDeg - session.lastAppliedDeltaMm;
        if (stepDeg !== 0) {
          session.lastAppliedDeltaMm = deltaDeg;
          session.totalDeltaMm = deltaDeg;
          setDragDeltaMm(deltaDeg);

          if (session.axis === "miter" && onCommitEntities) {
            onCommitEntities(
              (prev) => applyDirectMiterCut3DToEntities(prev, session.targetIds, miterEndTarget, deltaDeg, miterAxis),
              session.targetIds,
            );
          } else if (onCommitEntities) {
            onCommitEntities((prev) => {
              const res = applyDirectTransform3DToEntities(
                prev,
                session.targetIds,
                {
                  rxDeg: session.axis === "rot_x" ? stepDeg : 0,
                  ryDeg: session.axis === "rot_y" ? stepDeg : 0,
                  rzDeg: session.axis === "rot_z" ? stepDeg : 0,
                },
                copyOnTransform,
              );
              return res.updatedEntities;
            }, session.targetIds);
          }
        }
        return;
      }

      if (session.axis === "planar") {
        const rawDeltaX = Math.round(dxPx / session.pixelsPerMm);
        const rawDeltaY = Math.round(-dyPx / session.pixelsPerMm);
        let effDelta: Vec3Mm = { x: rawDeltaX, y: rawDeltaY, z: 0 };

        if (primaryBody) {
          const otherBodies = scene.bodies.filter((b) => b.bodyId !== primaryBody.bodyId);
          const snapRes = resolveContactAndAlignmentSnaps3D(primaryBody, otherBodies, effDelta, session.pixelsPerMm, 7.5);
          if (snapRes.hasContactSnap || snapRes.hasAlignmentSnap) {
            effDelta = snapRes.snappedDelta;
            setActiveContactSnap(snapRes);
          } else {
            setActiveContactSnap(null);
          }
        }

        const stepX = effDelta.x - session.lastAppliedDeltaMm;
        if (stepX !== 0 || effDelta.y !== session.totalDeltaMm) {
          session.lastAppliedDeltaMm = effDelta.x;
          session.totalDeltaMm = effDelta.y;
          setDragDeltaMm(Math.round(Math.hypot(effDelta.x, effDelta.y)));

          if (onLiveTranslateSelectionXY) {
            onLiveTranslateSelectionXY(effDelta.x, effDelta.y, session.targetIds);
          } else if (onCommitEntities) {
            onCommitEntities((prev) => {
              const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dx: effDelta.x, dy: effDelta.y }, copyOnTransform);
              return res.updatedEntities;
            }, session.targetIds);
          }
        }
        return;
      }

      const projectedPx = dxPx * session.screenDirX + dyPx * session.screenDirY;
      const rawMm = projectedPx / session.pixelsPerMm;
      let currentDeltaMm = Math.round(rawMm);

      if (session.axis === "face_normal") {
        if (primaryFace) {
          const snapRes = resolveFaceStretchContactSnap(primaryFace, currentDeltaMm, scene.bodies, session.pixelsPerMm, 7.5);
          if (snapRes.hasSnap) {
            currentDeltaMm = snapRes.snappedOffsetMm;
          }
        }
      } else if (session.axis === "x" || session.axis === "y" || session.axis === "z") {
        if (primaryBody) {
          const otherBodies = scene.bodies.filter((b) => b.bodyId !== primaryBody.bodyId);
          const rawVec: Vec3Mm = {
            x: session.axis === "x" ? currentDeltaMm : 0,
            y: session.axis === "y" ? currentDeltaMm : 0,
            z: session.axis === "z" ? currentDeltaMm : 0,
          };
          const snapRes = resolveContactAndAlignmentSnaps3D(primaryBody, otherBodies, rawVec, session.pixelsPerMm, 7.5);
          if (snapRes.hasContactSnap || snapRes.hasAlignmentSnap) {
            currentDeltaMm = session.axis === "x" ? snapRes.snappedDelta.x : session.axis === "y" ? snapRes.snappedDelta.y : snapRes.snappedDelta.z;
            setActiveContactSnap(snapRes);
          } else {
            setActiveContactSnap(null);
          }
        }
      }

      const stepDelta = currentDeltaMm - session.lastAppliedDeltaMm;

      if (stepDelta !== 0) {
        session.lastAppliedDeltaMm = currentDeltaMm;
        session.totalDeltaMm = currentDeltaMm;
        setDragDeltaMm(currentDeltaMm);

        if (session.axis === "extrude" && onCommitEntities) {
          const nextH = Math.max(1, session.initialValue + currentDeltaMm);
          onCommitEntities(
            (prev) => applyDirectExtrudeToEntities(prev, session.targetIds, nextH, booleanMode),
            session.targetIds,
          );
        } else if (session.axis === "face_normal" && onCommitEntities) {
          if (primaryFace && (primaryFace.role === "top" || primaryFace.role === "bottom")) {
            const nextH = Math.max(1, session.initialValue + currentDeltaMm);
            onCommitEntities(
              (prev) => applyDirectExtrudeToEntities(prev, session.targetIds, nextH, booleanMode),
              session.targetIds,
            );
          } else {
            onCommitEntities(
              (prev) => applyDirectOffsetFace3DToEntities(prev, session.targetIds, "sides", currentDeltaMm),
              session.targetIds,
            );
          }
        } else if (session.axis === "edge_diagonal" && onCommitEntities) {
          const nextR = Math.max(0, session.initialValue + currentDeltaMm);
          onCommitEntities(
            (prev) => applyDirectFilletOrChamfer3DToEntities(prev, session.targetIds, filletOrChamferMode, nextR),
            session.targetIds,
          );
        } else if (session.axis === "x") {
          if (onLiveTranslateSelectionXY) {
            onLiveTranslateSelectionXY(stepDelta, 0, session.targetIds);
          } else if (onCommitEntities) {
            onCommitEntities((prev) => {
              const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dx: stepDelta }, copyOnTransform);
              return res.updatedEntities;
            }, session.targetIds);
          }
        } else if (session.axis === "y") {
          if (onLiveTranslateSelectionXY) {
            onLiveTranslateSelectionXY(0, stepDelta, session.targetIds);
          } else if (onCommitEntities) {
            onCommitEntities((prev) => {
              const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dy: stepDelta }, copyOnTransform);
              return res.updatedEntities;
            }, session.targetIds);
          }
        } else if (session.axis === "z") {
          if (onLiveElevateSelection && selected[0]) {
            onLiveElevateSelection(session.initialValue + currentDeltaMm);
          } else if (onCommitEntities) {
            onCommitEntities((prev) => {
              const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dz: stepDelta }, copyOnTransform);
              return res.updatedEntities;
            }, session.targetIds);
          }
        }
      }
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      setActiveContactSnap(null);
      if (!session) return;
      ev.stopPropagation();
      ev.preventDefault();

      const distPx = Math.hypot(ev.clientX - session.startClientX, ev.clientY - session.startClientY);
      const isQuickTap = !session.hasMoved && distPx < 5;

      if (isQuickTap) {
        triggerHaptic("selection");
        if (session.axis === "x") {
          openFloatingNumpad("DISTANCE", "DESLOCAMENTO +X", "mm", 0, "moveX", session.targetIds[0]);
        } else if (session.axis === "y") {
          openFloatingNumpad("DISTANCE", "DESLOCAMENTO +Y", "mm", 0, "moveY", session.targetIds[0]);
        } else if (session.axis === "extrude" || session.axis === "face_normal") {
          openFloatingNumpad("EXTRUSION", "EXTRUDE / OFFSET", "mm", primaryBody?.extrudeHeightMm ?? 500, "extrudeHeight", session.targetIds[0]);
        } else if (session.axis === "edge_diagonal") {
          openFloatingNumpad(
            filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
            filletOrChamferMode === "fillet" ? "RAIO FILLET" : "CHANFRO 45°",
            "mm",
            filletOrChamferMode === "fillet" ? (primaryBody?.edgeFilletRadiusMm || 10) : (primaryBody?.edgeChamferDistMm || 10),
            filletOrChamferMode === "fillet" ? "filletRadius" : "chamferDistance",
            session.targetIds[0],
          );
        } else if (session.axis === "z") {
          openFloatingNumpad("DISTANCE", "ELEVAÇÃO +Z", "mm", primaryBody?.elevationZ ?? 0, "moveZ", session.targetIds[0]);
        } else if (session.axis === "rot_x" || session.axis === "rot_y" || session.axis === "rot_z" || session.axis === "miter") {
          openFloatingNumpad("ANGLE", "ROTAÇÃO ANGULAR", "°", 45, "miterAngle", session.targetIds[0]);
        }
      } else {
        triggerHaptic("action");
        if (session.totalDeltaMm !== 0) {
          if (session.axis === "x") {
            if (onCommitTranslateSelectionXY) {
              onCommitTranslateSelectionXY(session.totalDeltaMm, 0, session.targetIds);
            } else if (onCommitEntities) {
              onCommitEntities((prev) => {
                const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dx: session.totalDeltaMm }, copyOnTransform);
                return res.updatedEntities;
              }, session.targetIds);
            }
          } else if (session.axis === "y") {
            if (onCommitTranslateSelectionXY) {
              onCommitTranslateSelectionXY(0, session.totalDeltaMm, session.targetIds);
            } else if (onCommitEntities) {
              onCommitEntities((prev) => {
                const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dy: session.totalDeltaMm }, copyOnTransform);
                return res.updatedEntities;
              }, session.targetIds);
            }
          } else if (session.axis === "z") {
            if (onCommitElevateSelection) {
              onCommitElevateSelection(session.initialValue + session.totalDeltaMm);
            } else if (onCommitEntities) {
              onCommitEntities((prev) => {
                const res = applyDirectTransform3DToEntities(prev, session.targetIds, { dz: session.totalDeltaMm }, copyOnTransform);
                return res.updatedEntities;
              }, session.targetIds);
            }
          } else if (session.axis === "extrude" && onCommitEntities) {
            const finalH = Math.max(1, session.initialValue + session.totalDeltaMm);
            onCommitEntities(
              (prev) => applyDirectExtrudeToEntities(prev, session.targetIds, finalH, booleanMode),
              session.targetIds,
            );
          } else if (session.axis === "face_normal" && onCommitEntities) {
            const finalH = Math.max(1, session.initialValue + session.totalDeltaMm);
            onCommitEntities(
              (prev) => applyDirectExtrudeToEntities(prev, session.targetIds, finalH, booleanMode),
              session.targetIds,
            );
          } else if (session.axis === "edge_diagonal" && onCommitEntities) {
            const finalR = Math.max(0, session.initialValue + session.totalDeltaMm);
            onCommitEntities(
              (prev) => applyDirectFilletOrChamfer3DToEntities(prev, session.targetIds, filletOrChamferMode, finalR),
              session.targetIds,
            );
          }
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
  }, [
    activeAxis,
    onLiveTranslateSelectionXY,
    onCommitTranslateSelectionXY,
    onLiveElevateSelection,
    onCommitElevateSelection,
    onCommitEntities,
    booleanMode,
    openFloatingNumpad,
    primaryBody,
    selected,
  ]);

  const is3DEnvironment = activeMode === "3d" || isTilted3D;

  // Metadados enxutos da Pílula de Comando Ativo no Topo Central (Seção 3)
  const activePillMeta = useMemo(() => {
    const hVal = primaryBody?.extrudeHeightMm ?? sheetThickness;
    const rVal = primaryBody?.edgeFilletRadiusMm || 10;
    const dVal = primaryBody?.edgeChamferDistMm || 10;
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
      case "color_material_3d":
        return {
          icon: Palette,
          label: "Material 3D",
          valueText: primaryBody?.materialName?.split(" ")[0] ?? "Aço",
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
          valueText: "360°",
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
      className="pointer-events-none absolute inset-0 z-25 overflow-hidden select-none"
    >
      {/* =====================================================================
          1. PÍLULA DE COMANDO ATIVO NO TOPO CENTRAL (COMPACTA E DISCRETA — SEÇÃO 3)
          ===================================================================== */}
      {is3DEnvironment && directTool !== "select_3d" && tool !== "loft_3d" && activePillMeta && (
        <div
          data-testid="chamfer-3d-contextual-guide-banner"
          style={{
            ...themeSurfaceStyle,
            top: "36px",
          }}
          className="pointer-events-auto absolute left-1/2 z-30 flex h-[40px] max-w-[420px] -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 shadow-md backdrop-blur-md transition-all"
        >
          <activePillMeta.icon className="size-3.5 shrink-0 text-cyan-500" />
          <span className="truncate font-mono text-[11px] font-bold tracking-tight">
            {activePillMeta.label}
          </span>

          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-bold",
              isDark
                ? "border-cyan-500/40 bg-cyan-950/60 text-cyan-300"
                : "border-cyan-600/35 bg-cyan-50 text-cyan-700",
            )}
          >
            {activePillMeta.valueText}
          </span>

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
          </defs>

          {/* ================================================================= */}
          {/* A. HIT-TARGETS INTERATIVOS PARA TODAS AS FACES 3D DA CENA        */}
          {/* ================================================================= */}
          {scene.bodies.map((body) =>
            body.faces.map((face) => {
              if (face.polygon3D.length < 3) return null;
              const isSelected = subSel.faceIds.includes(face.faceId);
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
                  fill={isSelected ? "rgba(0, 180, 216, 0.28)" : "rgba(0, 180, 216, 0.001)"}
                  stroke={isSelected ? "#00B4D8" : "rgba(0, 180, 216, 0.12)"}
                  strokeWidth={isSelected ? 2.5 : 0.8}
                  className="pointer-events-auto cursor-pointer transition-colors"
                  style={{ pointerEvents: "fill" }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    setSubSel({
                      faceIds: [face.faceId],
                      edgeIds: [],
                      bodyIds: [face.bodyId],
                      activePivot3D: face.centroid,
                      activeHingeEdgeId: null,
                    });
                    if (face.role === "top" || face.role === "bottom") {
                      setDirectTool("extrude_3d");
                    } else {
                      setDirectTool("offset_face_3d");
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
                    style={{ pointerEvents: "stroke" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("selection");
                      if (subSel.faceIds.length > 0) {
                        setSubSel((prev) => ({
                          ...prev,
                          edgeIds: [edge.edgeId],
                          activeHingeEdgeId: edge.edgeId,
                          activePivot3D: edge.midpoint,
                        }));
                        setDirectTool("rotate_axis_3d");
                      } else {
                        setSubSel({
                          faceIds: [],
                          edgeIds: [edge.edgeId],
                          bodyIds: [edge.bodyId],
                          activePivot3D: edge.midpoint,
                          activeHingeEdgeId: null,
                        });
                        setDirectTool("fillet_3d");
                      }
                    }}
                  />
                  {(isSelected || isHinge) && (
                    <polyline
                      points={ptsStr}
                      fill="none"
                      stroke={isHinge ? "#F59E0B" : "#00E5FF"}
                      strokeWidth={3.5}
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
                strokeWidth={3}
                markerStart="url(#gizmo-arrow-cyan-start)"
                markerEnd="url(#gizmo-arrow-cyan)"
                style={{ pointerEvents: "stroke" }}
              />
              <circle
                cx={faceNormalGizmo.origin.x}
                cy={faceNormalGizmo.origin.y}
                r={5}
                fill="#00B4D8"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              <g
                transform={`translate(${faceNormalGizmo.posTip.x + faceNormalGizmo.ux * 14}, ${faceNormalGizmo.posTip.y + faceNormalGizmo.uy * 14})`}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  openFloatingNumpad(
                    "EXTRUSION",
                    "EXTRUDE / OFFSET",
                    "mm",
                    primaryBody?.extrudeHeightMm ?? 500,
                    "extrudeHeight",
                    faceNormalGizmo.face.entityId,
                  );
                }}
              >
                <rect
                  x={-34}
                  y={-9}
                  width={68}
                  height={18}
                  rx={5}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#00B4D8"
                  strokeWidth={1.2}
                />
                <text
                  x={0}
                  y={1}
                  fill="#00B4D8"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {dragDeltaMm !== 0
                    ? `${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm} mm`
                    : "0.00 mm"}
                </text>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* E. SETA DIAGONAL NA ARESTA SELECIONADA (FILLET / CHAMFER)         */}
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
                transform={`translate(${edgeDiagonalGizmo.tip.x + edgeDiagonalGizmo.ux * 12}, ${edgeDiagonalGizmo.tip.y + edgeDiagonalGizmo.uy * 12})`}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  openFloatingNumpad(
                    filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                    filletOrChamferMode === "fillet" ? "RAIO FILLET" : "CHANFRO 45°",
                    "mm",
                    filletOrChamferMode === "fillet"
                      ? primaryBody?.edgeFilletRadiusMm || 10
                      : primaryBody?.edgeChamferDistMm || 10,
                    filletOrChamferMode === "fillet" ? "filletRadius" : "chamferDistance",
                    edgeDiagonalGizmo.edge.entityId,
                  );
                }}
              >
                <rect
                  x={-34}
                  y={-9}
                  width={68}
                  height={18}
                  rx={5}
                  fill={isDark ? "#0B1220" : "#FFFFFF"}
                  stroke="#00E5FF"
                  strokeWidth={1.2}
                />
                <text
                  x={0}
                  y={1}
                  fill="#00E5FF"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {filletOrChamferMode === "fillet"
                    ? `R ${(primaryBody?.edgeFilletRadiusMm || 10).toFixed(1)}`
                    : `D ${(primaryBody?.edgeChamferDistMm || 10).toFixed(1)}`}
                </text>
              </g>
            </g>
          )}

          {/* ================================================================= */}
          {/* F. PONTOS MAGNÉTICOS DE SNAP DO PIVÔ 3D                           */}
          {/* ================================================================= */}
          {isPickingPivotSnap &&
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
          {/* G. GIZMO UNIVERSAL TRÍADE X/Y/Z + PLANAR + TRANSFERIDOR CIRCULAR  */}
          {/* ================================================================= */}
          {gizmoScreen && (
            <g>
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

              {/* Disco Transferidor Circular com Marcadores a Cada 15° */}
              <circle
                cx={gizmoScreen.origin.x}
                cy={gizmoScreen.origin.y}
                r={48}
                fill="none"
                stroke="#00B4D8"
                strokeWidth={1.4}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              {[0, 15, 30, 45, 60, 75, 90, 135, 180].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const tx1 = gizmoScreen.origin.x + Math.cos(rad) * 44;
                const ty1 = gizmoScreen.origin.y + Math.sin(rad) * 44;
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
                    opacity={0.8}
                  />
                );
              })}

              {/* Arco de Rotação Z no Plano XY */}
              <path
                d={`M ${gizmoScreen.origin.x + gizmoScreen.x.ux * 42} ${gizmoScreen.origin.y + gizmoScreen.x.uy * 42} A 42 42 0 0 1 ${gizmoScreen.origin.x + gizmoScreen.y.ux * 42} ${gizmoScreen.origin.y + gizmoScreen.y.uy * 42}`}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={3}
                strokeLinecap="round"
                markerEnd="url(#gizmo-arrow-amber)"
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={(ev) =>
                  handleAxisPointerDown("rot_z", 0, 0, 1, ev)
                }
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

              {/* Eixo Z / Seta de Extrusão / Push-Pull (Ciano Técnico #00B4D8) */}
              <g
                data-testid="chamfer-gizmo-axis-z"
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={(ev) =>
                  handleAxisPointerDown(
                    directTool === "extrude_3d" ? "extrude" : "z",
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
                  stroke="#00B4D8"
                  strokeWidth={
                    activeAxis === "z" || activeAxis === "extrude" ? 4 : 2.75
                  }
                  markerEnd="url(#gizmo-arrow-z)"
                  style={{ pointerEvents: "stroke" }}
                />
                <circle
                  cx={gizmoScreen.z.endX + gizmoScreen.z.ux * 12}
                  cy={gizmoScreen.z.endY + gizmoScreen.z.uy * 12}
                  r={14}
                  fill="rgba(0, 180, 216, 0.15)"
                  stroke="rgba(0, 180, 216, 0.45)"
                  strokeWidth={1}
                  style={{ pointerEvents: "all" }}
                  className="cursor-pointer"
                />
                <text
                  x={gizmoScreen.z.endX + gizmoScreen.z.ux * 12}
                  y={gizmoScreen.z.endY + gizmoScreen.z.uy * 12}
                  fill="#00B4D8"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ pointerEvents: "none" }}
                >
                  {directTool === "extrude_3d" ? "EXT" : "+Z"}
                </text>
              </g>

              {/* Pivô Central Móvel com Retículo e 4 Setas (Draggable Central Pivot) */}
              <g
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
                  x1={gizmoScreen.origin.x - 12}
                  y1={gizmoScreen.origin.y}
                  x2={gizmoScreen.origin.x + 12}
                  y2={gizmoScreen.origin.y}
                  stroke={isPickingPivotSnap ? "#F59E0B" : "#00B4D8"}
                  strokeWidth={1.8}
                />
                <line
                  x1={gizmoScreen.origin.x}
                  y1={gizmoScreen.origin.y - 12}
                  x2={gizmoScreen.origin.x}
                  y2={gizmoScreen.origin.y + 12}
                  stroke={isPickingPivotSnap ? "#F59E0B" : "#00B4D8"}
                  strokeWidth={1.8}
                />
                <circle
                  cx={gizmoScreen.origin.x}
                  cy={gizmoScreen.origin.y}
                  r={6.5}
                  fill={isPickingPivotSnap ? "#F59E0B" : "#00B4D8"}
                  stroke={isDark ? "#0F172A" : "#FFFFFF"}
                  strokeWidth={2}
                />
              </g>

              {/* Feedback de Delta durante arraste */}
              {activeAxis && (
                <g
                  transform={`translate(${gizmoScreen.origin.x}, ${gizmoScreen.origin.y - 24})`}
                >
                  <rect
                    x={-56}
                    y={-11}
                    width={112}
                    height={20}
                    rx={6}
                    fill={isDark ? "#0B1220" : "#FFFFFF"}
                    stroke="#00B4D8"
                    strokeWidth={1.2}
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
                    {activeAxis === "extrude" || activeAxis === "face_normal"
                      ? `H: ${((primaryBody?.extrudeHeightMm ?? sheetThickness) + dragDeltaMm).toFixed(1)} mm`
                      : activeAxis === "rot_x" || activeAxis === "rot_y" || activeAxis === "rot_z" || activeAxis === "miter"
                        ? `∠ ${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm}°`
                        : activeAxis === "planar"
                          ? `ΔXY: ${dragDeltaMm} mm`
                          : `Δ${activeAxis.toUpperCase()}: ${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm} mm`}
                  </text>
                </g>
              )}
            </g>
          )}
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
          ===================================================================== */}
      {is3DEnvironment && gizmoScreen && primaryBody && !numpadSession && (
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
                  25,
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
              } else if (directTool === "transform_3d") {
                openFloatingNumpad(
                  "DISTANCE",
                  `TRANSLADAR +${transformAxisTarget.toUpperCase()}`,
                  "mm",
                  100,
                  transformAxisTarget === "x" ? "moveX" : transformAxisTarget === "y" ? "moveY" : "moveZ",
                  primaryBody.entityId,
                  undefined,
                  copyOnTransform,
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
                    ? `+25.0 mm`
                    : directTool === "rotate_axis_3d"
                      ? `∠ ${(primaryBody.miterCutTopDeg || 45).toFixed(0)}°`
                      : directTool === "transform_3d"
                        ? `Δ${transformAxisTarget.toUpperCase()} mm`
                        : `${primaryBody.extrudeHeightMm.toFixed(1)} mm`}
            </span>
          </button>

          {/* Quick toggle Fillet vs Chamfer */}
          {(directTool === "fillet_3d" || directTool === "chamfer_3d") && (
            <button
              type="button"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                triggerHaptic("selection");
                setFilletOrChamferMode((m) => (m === "fillet" ? "chamfer" : "fillet"));
                setDirectTool(filletOrChamferMode === "fillet" ? "chamfer_3d" : "fillet_3d");
              }}
              style={themeSurfaceStyle}
              className="flex items-center gap-1 rounded-full border border-cyan-500/50 px-2 py-0.5 font-mono text-[10px] font-bold shadow-md cursor-pointer hover:bg-cyan-500/20"
            >
              <span>{filletOrChamferMode === "fillet" ? "Fillet (Raio)" : "Chanfro 45°"}</span>
            </button>
          )}

          {/* Quick Boolean Pills for Extrude / Face Normal */}
          {(directTool === "extrude_3d" || directTool === "offset_face_3d") && (
            <div className="flex items-center gap-0.5 rounded-full border border-slate-700/60 bg-slate-900/80 p-0.5 shadow-md">
              {(["new_body", "union", "subtract", "intersect"] as const).map((bMode) => (
                <button
                  key={bMode}
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    setBooleanMode(bMode);
                  }}
                  className={cn(
                    "rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors cursor-pointer",
                    booleanMode === bMode
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-white",
                  )}
                >
                  {bMode === "new_body" ? "Novo" : bMode === "union" ? "União" : bMode === "subtract" ? "Subtrair" : "Intersec"}
                </button>
              ))}
            </div>
          )}

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
                        const res = applyDirectMirror3DToEntities(prev, activeTargetEntityIds, pl, copyOnTransform);
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

          {/* Copy: ON/OFF Button */}
          <button
            type="button"
            data-testid="chamfer-3d-gizmo-copy-badge"
            onPointerDown={(ev) => {
              ev.stopPropagation();
              ev.preventDefault();
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              triggerHaptic("selection");
              setCopyOnTransform((c) => !c);
            }}
            style={!copyOnTransform ? themeSurfaceStyle : undefined}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold shadow-md transition-all cursor-pointer",
              copyOnTransform && "border-emerald-400 bg-emerald-600 text-white",
            )}
          >
            <Copy className="size-2.5" />
            <span>Copy: {copyOnTransform ? "ON" : "OFF"}</span>
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
          5. DOCK CONTEXTUAL INFERIOR ÚNICO E ENXUTO (SEM CORTES LATERAIS — SEÇÃO 4)
          ===================================================================== */}
      {is3DEnvironment &&
        directTool !== "select_3d" &&
        tool !== "loft_3d" &&
        primaryBody && (
          <div
            data-testid="chamfer-3d-subelement-Contextual-bar"
            style={{
              ...themeSurfaceStyle,
              bottom: "14px",
              maxWidth: "calc(100% - 48px)",
              height: "42px",
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => ev.stopPropagation()}
            className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border px-3 shadow-lg backdrop-blur-md"
          >
            {directTool === "extrude_3d" && (
              <>
                {(
                  [
                    { id: "new_body", label: "Novo Corpo" },
                    { id: "union", label: "União" },
                    { id: "subtract", label: "Subtrair" },
                  ] as const
                ).map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("selection");
                      setBooleanMode(bm.id);
                      onCommitEntities?.((prev) =>
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
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[20, 50, 100, 490].map((hVal) => (
                  <button
                    key={hVal}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectExtrudeToEntities(
                          prev,
                          activeTargetEntityIds,
                          hVal,
                          booleanMode,
                        ),
                        activeTargetEntityIds,
                      );
                    }}
                    className={pillBtnClass(
                      Math.abs(primaryBody.extrudeHeightMm - hVal) < 0.5,
                    )}
                  >
                    {hVal}mm
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openFloatingNumpad(
                      "EXTRUSION",
                      "EXTRUDE",
                      "mm",
                      primaryBody.extrudeHeightMm,
                      "extrudeHeight",
                      primaryBody.entityId,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  Digitar ⌨️
                </button>
              </>
            )}

            {(directTool === "fillet_3d" || directTool === "chamfer_3d") && (
              <>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setFilletOrChamferMode("fillet");
                    setDirectTool("fillet_3d");
                  }}
                  className={pillBtnClass(filletOrChamferMode === "fillet")}
                >
                  Fillet (R)
                </button>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setFilletOrChamferMode("chamfer");
                    setDirectTool("chamfer_3d");
                  }}
                  className={pillBtnClass(filletOrChamferMode === "chamfer")}
                >
                  Chamfer (45°)
                </button>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[0, 5, 10, 15, 20].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectFilletOrChamfer3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          filletOrChamferMode,
                          val,
                        ),
                        activeTargetEntityIds,
                      );
                    }}
                    className={pillBtnClass(
                      (filletOrChamferMode === "fillet"
                        ? primaryBody.edgeFilletRadiusMm
                        : primaryBody.edgeChamferDistMm) === val,
                    )}
                  >
                    {val === 0
                      ? "Reto"
                      : `${filletOrChamferMode === "fillet" ? "R" : "D"}${val}mm`}
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
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
                  }}
                  className={pillBtnClass(false)}
                >
                  Digitar ⌨️
                </button>
              </>
            )}

            {directTool === "shell_3d" && (
              <>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setShellOpenCapsMode("both_ends");
                    onCommitEntities?.((prev) =>
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
                  Tubo Vazado (2 Faces)
                </button>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setShellOpenCapsMode("top_only");
                    onCommitEntities?.((prev) =>
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
                  Caixa Oca (1 Face)
                </button>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[2, 3, 4.75, 6, 8].map((wVal) => (
                  <button
                    key={wVal}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      const caps: ("top" | "bottom")[] =
                        shellOpenCapsMode === "both_ends" ? ["top", "bottom"] : ["top"];
                      onCommitEntities?.((prev) =>
                        applyDirectShell3DToEntities(prev, activeTargetEntityIds, wVal, caps),
                        activeTargetEntityIds,
                      );
                    }}
                    className={pillBtnClass(
                      Math.abs((primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 0) - wVal) < 0.2,
                    )}
                  >
                    {wVal}mm
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openFloatingNumpad(
                      "THICKNESS",
                      "PAREDE CASCA",
                      "mm",
                      primaryBody.shellWallThicknessMm || primaryBody.shellThicknessMm || 4.75,
                      "shellWallThickness",
                      primaryBody.entityId,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  Digitar ⌨️
                </button>
              </>
            )}

            {directTool === "offset_face_3d" && (
              <>
                {(
                  [
                    { id: "top" as const, label: "Topo (+Z)" },
                    { id: "bottom" as const, label: "Base (-Z)" },
                    { id: "sides" as const, label: "4 Laterais" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setOffsetFaceTarget(t.id);
                    }}
                    className={pillBtnClass(offsetFaceTarget === t.id)}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[-25, 25, 50, 100, 599].map((dVal) => (
                  <button
                    key={dVal}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectOffsetFace3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          offsetFaceTarget,
                          dVal,
                        ),
                        activeTargetEntityIds,
                      );
                    }}
                    className={pillBtnClass(false)}
                  >
                    {dVal > 0 ? `+${dVal}mm` : `${dVal}mm`}
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openFloatingNumpad(
                      "OFFSET",
                      "OFFSET FACE",
                      "mm",
                      25,
                      "offsetFaceDistance",
                      primaryBody.entityId,
                      offsetFaceTarget,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  Digitar ⌨️
                </button>
              </>
            )}

            {directTool === "rotate_axis_3d" && (
              <>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setMiterEndTarget("top");
                  }}
                  className={pillBtnClass(miterEndTarget === "top")}
                >
                  Topo (+Z)
                </button>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setMiterEndTarget("bottom");
                  }}
                  className={pillBtnClass(miterEndTarget === "bottom")}
                >
                  Base (-Z)
                </button>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setMiterAxis((a) => (a === "x" ? "y" : "x"));
                  }}
                  className={pillBtnClass(true)}
                >
                  Eixo {miterAxis.toUpperCase()}
                </button>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[-45, -30, 0, 30, 45].map((ang) => (
                  <button
                    key={ang}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
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
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openFloatingNumpad(
                      "ANGLE",
                      "ÂNGULO CORTE",
                      "°",
                      45,
                      "miterAngle",
                      primaryBody.entityId,
                      miterEndTarget,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  Digitar ⌨️
                </button>
              </>
            )}

            {directTool === "transform_3d" && (
              <>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    setCopyOnTransform((c) => !c);
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 font-mono text-[10.5px] font-bold transition-colors cursor-pointer whitespace-nowrap",
                    copyOnTransform
                      ? "border-emerald-400 bg-emerald-600 text-white"
                      : pillBtnClass(false),
                  )}
                >
                  Copy: {copyOnTransform ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("selection");
                    setIsPickingPivotSnap((p) => !p);
                  }}
                  className={pillBtnClass(isPickingPivotSnap)}
                >
                  {isPickingPivotSnap ? "Toque num Vértice..." : "Pivô Snap"}
                </button>
                {(["x", "y", "z"] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setTransformAxisTarget(ax);
                    }}
                    className={pillBtnClass(transformAxisTarget === ax)}
                  >
                    Eixo {ax.toUpperCase()}
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[100, 350, 700].map((distVal) => (
                  <button
                    key={distVal}
                    type="button"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      triggerHaptic("action");
                      onCommitEntities?.((prev) => {
                        const res = applyDirectTransform3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          {
                            dx: transformAxisTarget === "x" ? distVal : 0,
                            dy: transformAxisTarget === "y" ? distVal : 0,
                            dz: transformAxisTarget === "z" ? distVal : 0,
                          },
                          copyOnTransform,
                        );
                        return res.updatedEntities;
                      }, activeTargetEntityIds);
                    }}
                    className={pillBtnClass(false)}
                  >
                    +{distVal}mm
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    triggerHaptic("action");
                    onCommitEntities?.((prev) => {
                      const res = applyDirectTransform3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        { ryDeg: 45 },
                        copyOnTransform,
                      );
                      return res.updatedEntities;
                    }, activeTargetEntityIds);
                  }}
                  className={pillBtnClass(false)}
                >
                  Girar 45°
                </button>
                <button
                  type="button"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openFloatingNumpad(
                      "DISTANCE",
                      `TRANSLADAR +${transformAxisTarget.toUpperCase()}`,
                      "mm",
                      700,
                      transformAxisTarget === "x" ? "moveX" : transformAxisTarget === "y" ? "moveY" : "moveZ",
                      primaryBody.entityId,
                      undefined,
                      copyOnTransform,
                    );
                  }}
                  className={pillBtnClass(false)}
                >
                  Digitar ⌨️
                </button>
              </>
            )}

            {directTool === "mirror_3d" && (
              <>
                {(["x", "y", "z"] as const).map((pl) => (
                  <button
                    key={pl}
                    type="button"
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.((prev) => {
                        const res = applyDirectMirror3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          pl,
                          true,
                        );
                        return res.updatedEntities;
                      });
                    }}
                    className={pillBtnClass(false)}
                  >
                    Espelhar Eixo {pl.toUpperCase()}
                  </button>
                ))}
              </>
            )}

            {directTool === "color_material_3d" && (
              <>
                {INDUSTRIAL_3D_MATERIALS.map((mat) => (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      onCommitEntities?.((prev) =>
                        prev.map((e) =>
                          activeTargetEntityIds.includes(e.id)
                            ? {
                                ...e,
                                params: {
                                  ...(e.params ?? {}),
                                  bodyColorHex: mat.colorHex,
                                  bodyMaterial: mat.name,
                                },
                              }
                            : e,
                        ),
                      );
                    }}
                    className={pillBtnClass(primaryBody.colorHex === mat.colorHex)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-full border border-slate-400/40"
                        style={{ backgroundColor: mat.colorHex }}
                      />
                      <span>{mat.name}</span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {directTool === "sketch_on_face_3d" && (
              <>
                <span className="shrink-0 px-2 font-mono text-[10.5px] font-bold">
                  {primaryFace?.label ?? "Face Superior (+Z)"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    const targetFace = primaryFace ?? primaryBody.faces[0];
                    if (targetFace && onSwitchTo2DSketchOnFace) {
                      onSwitchTo2DSketchOnFace(targetFace);
                    } else {
                      onSetSelectionElevationZ(
                        Math.round(primaryFace?.centroid.z ?? primaryBody.extrudeHeightMm),
                      );
                    }
                  }}
                  className="shrink-0 rounded-full bg-cyan-600 hover:bg-cyan-500 px-3 py-1 font-mono text-[10.5px] font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  Alinhar Plano 2D na Face
                </button>
              </>
            )}
          </div>
        )}

      {/* =====================================================================
          6. BARRA FLUTUANTE COMPACTA DE TRANSIÇÃO MULTISSEÇÃO (LOFT 3D)
          ===================================================================== */}
      {tool === "loft_3d" && (
        <div
          data-testid="chamfer-loft-3d-panel"
          style={{
            ...themeSurfaceStyle,
            bottom: "14px",
            maxWidth: "calc(100% - 48px)",
            height: "42px",
          }}
          className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border px-3 shadow-lg backdrop-blur-md"
        >
          <span className="shrink-0 px-2 font-mono text-[10.5px] font-bold text-cyan-600 dark:text-cyan-400">
            Loft 3D ({loftSectionIds.length} perfis)
          </span>
          <button
            type="button"
            onClick={() => onSetLoftSurfaceMode("ruled")}
            className={pillBtnClass(loftSurfaceMode === "ruled")}
          >
            Reto
          </button>
          <button
            type="button"
            onClick={() => onSetLoftSurfaceMode("smooth")}
            className={pillBtnClass(loftSurfaceMode === "smooth")}
          >
            Suave
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
            Chapa ({sheetThickness}mm)
          </button>
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
            disabled={loftSectionIds.length < 2}
            onClick={onConfirmLoft3D}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 font-mono text-[10.5px] font-bold transition-all whitespace-nowrap",
              loftSectionIds.length >= 2
                ? "bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                : "bg-slate-500/20 text-slate-400 cursor-not-allowed",
            )}
          >
            ✓ Gerar Loft 3D
          </button>
        </div>
      )}
    </div>
  );
};
