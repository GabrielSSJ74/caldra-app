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
  onLiveTranslateSelectionXY?: (dx: number, dy: number) => void;
  onCommitTranslateSelectionXY?: (dx: number, dy: number) => void;
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

type GizmoAxis = "x" | "y" | "z" | "extrude" | "miter";

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
  onCommitElevateSelection,
  onCommitTranslateSelectionXY,
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
    lastAppliedSteps: number;
    initialValue: number;
    targetIds: string[];
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

    return {
      origin: originScreen,
      center3D: selectionCenter3D,
      x: projectAxisTip(1, 0, 0),
      y: projectAxisTip(0, 1, 0),
      z: projectAxisTip(0, 0, 1),
    };
  }, [selectionCenter3D, isTilted3D, activeMode, toScreen, view.k]);

  // ============================================================================
  // TECLADO NUMÉRICO FLUTUANTE COMPACTO (196px + VIEWPORT CLAMPING OBRIGATÓRIO)
  // ============================================================================

  const openFloatingNumpad = useCallback(
    (
      kind: ParametricNumpadKind,
      title: string,
      unit: "mm" | "°" | "×",
      initialValue: number,
      rawPos: { x: number; y: number },
      subTarget?: ActiveParametricNumpadSession["subTarget"],
      copyModeOverride?: boolean,
      isClientCoord = false,
    ) => {
      if (activeTargetEntityIds.length === 0) return;
      triggerHaptic("selection");

      const overlayRect = rootOverlayRef.current?.getBoundingClientRect();
      const canvasW =
        overlayRect && overlayRect.width > 50 ? overlayRect.width : Math.max(320, width);
      const canvasH =
        overlayRect && overlayRect.height > 50 ? overlayRect.height : Math.max(320, height);

      const localX =
        isClientCoord && overlayRect ? rawPos.x - overlayRect.left : rawPos.x;
      const localY =
        isClientCoord && overlayRect ? rawPos.y - overlayRect.top : rawPos.y;

      // Trava de Limites da Tela (Seção 5.3): left = Math.max(16, Math.min(clickX, canvasWidth - 212))
      const safeX = Math.max(16, Math.min(localX, Math.max(16, canvasW - 212)));
      const safeY = Math.max(40, Math.min(localY, Math.max(40, canvasH - 250)));

      setNumpadSession({
        kind,
        title,
        unit,
        initialValue: Number(initialValue.toFixed(2)),
        screenPos: { x: safeX, y: safeY },
        targetEntityIds: activeTargetEntityIds,
        subTarget,
        copyMode: copyModeOverride ?? copyOnTransform,
      });
      setNumpadBuffer(String(Number(initialValue.toFixed(2))));
    },
    [activeTargetEntityIds, width, height, copyOnTransform],
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

    const { kind, targetEntityIds, subTarget, copyMode } = numpadSession;
    triggerHaptic("action");

    if (kind === "EXTRUSION") {
      onCommitEntities((prev) =>
        applyDirectExtrudeToEntities(prev, targetEntityIds, parsed, booleanMode),
      );
    } else if (kind === "RADIUS") {
      onCommitEntities((prev) =>
        applyDirectFilletOrChamfer3DToEntities(prev, targetEntityIds, "fillet", parsed),
      );
    } else if (kind === "CHAMFER") {
      onCommitEntities((prev) =>
        applyDirectFilletOrChamfer3DToEntities(prev, targetEntityIds, "chamfer", parsed),
      );
    } else if (kind === "THICKNESS") {
      const caps: ("top" | "bottom")[] =
        shellOpenCapsMode === "both_ends" ? ["top", "bottom"] : ["top"];
      onCommitEntities((prev) =>
        applyDirectShell3DToEntities(prev, targetEntityIds, parsed, caps),
      );
    } else if (kind === "OFFSET") {
      const faceT =
        subTarget === "top" || subTarget === "bottom" || subTarget === "sides"
          ? subTarget
          : offsetFaceTarget;
      onCommitEntities((prev) =>
        applyDirectOffsetFace3DToEntities(prev, targetEntityIds, faceT, parsed),
      );
    } else if (kind === "ANGLE") {
      if (subTarget === "rx" || subTarget === "ry" || subTarget === "rz") {
        onCommitEntities((prev) => {
          const res = applyDirectTransform3DToEntities(
            prev,
            targetEntityIds,
            {
              rxDeg: subTarget === "rx" ? parsed : 0,
              ryDeg: subTarget === "ry" ? parsed : 0,
              rzDeg: subTarget === "rz" ? parsed : 0,
            },
            Boolean(copyMode),
          );
          return res.updatedEntities;
        });
      } else {
        const endT = subTarget === "bottom" ? "bottom" : miterEndTarget;
        onCommitEntities((prev) =>
          applyDirectMiterCut3DToEntities(prev, targetEntityIds, endT, parsed, miterAxis),
        );
      }
    } else if (kind === "DISTANCE") {
      const axis = subTarget === "y" ? "y" : subTarget === "z" ? "z" : "x";
      onCommitEntities((prev) => {
        const res = applyDirectTransform3DToEntities(
          prev,
          targetEntityIds,
          {
            dx: axis === "x" ? parsed : 0,
            dy: axis === "y" ? parsed : 0,
            dz: axis === "z" ? parsed : 0,
          },
          Boolean(copyMode),
        );
        return res.updatedEntities;
      });
    }

    setNumpadSession(null);
  }, [
    numpadSession,
    numpadBuffer,
    onCommitEntities,
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
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    triggerHaptic("selection");
    setActiveAxis(axis);
    setDragDeltaMm(0);

    const initVal =
      axis === "extrude"
        ? (primaryBody?.extrudeHeightMm ?? sheetThickness)
        : 0;

    dragSessionRef.current = {
      axis,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      screenDirX: ux,
      screenDirY: uy,
      pixelsPerMm,
      lastAppliedSteps: 0,
      initialValue: initVal,
      targetIds: activeTargetEntityIds,
    };
  };

  const handleAxisPointerMove = (ev: React.PointerEvent) => {
    const session = dragSessionRef.current;
    if (!session) return;
    ev.stopPropagation();

    const dxPx = ev.clientX - session.startClientX;
    const dyPx = ev.clientY - session.startClientY;
    const projectedPx = dxPx * session.screenDirX + dyPx * session.screenDirY;
    const rawMm = projectedPx / session.pixelsPerMm;
    const stepSizeMm = 1;
    const currentSteps = Math.round(rawMm / stepSizeMm);
    const stepDelta = currentSteps - session.lastAppliedSteps;

    if (stepDelta !== 0) {
      const mmIncrement = stepDelta * stepSizeMm;
      session.lastAppliedSteps = currentSteps;
      setDragDeltaMm(currentSteps * stepSizeMm);

      if (session.axis === "extrude" && onCommitEntities) {
        const nextH = Math.max(1, session.initialValue + currentSteps * stepSizeMm);
        onCommitEntities((prev) =>
          applyDirectExtrudeToEntities(prev, session.targetIds, nextH, booleanMode),
        );
      } else if (session.axis === "x") {
        onTranslateSelection3D(mmIncrement, 0, 0);
      } else if (session.axis === "y") {
        onTranslateSelection3D(0, mmIncrement, 0);
      } else if (session.axis === "z") {
        onTranslateSelection3D(0, 0, mmIncrement);
      }
    }
  };

  const handleAxisPointerUp = (ev: React.PointerEvent) => {
    if (!dragSessionRef.current) return;
    ev.stopPropagation();
    triggerHaptic("tap");
    dragSessionRef.current = null;
    setActiveAxis(null);
  };

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
          </defs>

          {/* Destaque Ciano Técnico (#00B4D8) para Faces 3D Selecionadas */}
          {subSel.faceIds.map((fId) => {
            const face = scene.facesById.get(fId);
            if (!face || face.polygon3D.length < 3) return null;
            const ptsStr = face.polygon3D
              .map((p) => {
                const s = toScreen(p);
                return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <polygon
                key={fId}
                points={ptsStr}
                fill="rgba(0, 180, 216, 0.25)"
                stroke="#00B4D8"
                strokeWidth={2.2}
              />
            );
          })}

          {/* Destaque Ciano Técnico (#38BDF8) para Arestas 3D Selecionadas */}
          {subSel.edgeIds.map((eId) => {
            const edge = scene.edgesById.get(eId);
            if (!edge || edge.polyline3D.length < 2) return null;
            const ptsStr = edge.polyline3D
              .map((p) => {
                const s = toScreen(p);
                return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <polyline
                key={eId}
                points={ptsStr}
                fill="none"
                stroke="#00B4D8"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Pontos Magnéticos de Snap do Pivô 3D */}
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

          {/* Gizmo Tríade X/Y/Z + Arco de Inclinação + Seta de Extrusão */}
          {gizmoScreen && (
            <g>
              {(directTool === "rotate_axis_3d" || directTool === "transform_3d") && (
                <circle
                  cx={gizmoScreen.origin.x}
                  cy={gizmoScreen.origin.y}
                  r={44}
                  fill="none"
                  stroke="#00B4D8"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                  opacity={0.85}
                />
              )}

              {/* Eixo X (Vermelho) */}
              <g
                data-testid="chamfer-gizmo-axis-x"
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                onPointerDown={(ev) =>
                  handleAxisPointerDown(
                    "x",
                    gizmoScreen.x.ux,
                    gizmoScreen.x.uy,
                    gizmoScreen.x.pixelsPerMm,
                    ev,
                  )
                }
                onPointerMove={handleAxisPointerMove}
                onPointerUp={handleAxisPointerUp}
                onPointerCancel={handleAxisPointerUp}
              >
                <line
                  x1={gizmoScreen.origin.x}
                  y1={gizmoScreen.origin.y}
                  x2={gizmoScreen.x.endX}
                  y2={gizmoScreen.x.endY}
                  stroke="transparent"
                  strokeWidth={18}
                />
                <line
                  x1={gizmoScreen.origin.x}
                  y1={gizmoScreen.origin.y}
                  x2={gizmoScreen.x.endX}
                  y2={gizmoScreen.x.endY}
                  stroke="#EF4444"
                  strokeWidth={activeAxis === "x" ? 3.5 : 2.25}
                  markerEnd="url(#gizmo-arrow-x)"
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
                >
                  +X
                </text>
              </g>

              {/* Eixo Y (Verde) */}
              <g
                data-testid="chamfer-gizmo-axis-y"
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                onPointerDown={(ev) =>
                  handleAxisPointerDown(
                    "y",
                    gizmoScreen.y.ux,
                    gizmoScreen.y.uy,
                    gizmoScreen.y.pixelsPerMm,
                    ev,
                  )
                }
                onPointerMove={handleAxisPointerMove}
                onPointerUp={handleAxisPointerUp}
                onPointerCancel={handleAxisPointerUp}
              >
                <line
                  x1={gizmoScreen.origin.x}
                  y1={gizmoScreen.origin.y}
                  x2={gizmoScreen.y.endX}
                  y2={gizmoScreen.y.endY}
                  stroke="transparent"
                  strokeWidth={18}
                />
                <line
                  x1={gizmoScreen.origin.x}
                  y1={gizmoScreen.origin.y}
                  x2={gizmoScreen.y.endX}
                  y2={gizmoScreen.y.endY}
                  stroke="#22C55E"
                  strokeWidth={activeAxis === "y" ? 3.5 : 2.25}
                  markerEnd="url(#gizmo-arrow-y)"
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
                >
                  +Y
                </text>
              </g>

              {/* Eixo Z / Seta de Extrusão / Push-Pull (Ciano Técnico #00B4D8) */}
              <g
                data-testid="chamfer-gizmo-axis-z"
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                onPointerDown={(ev) =>
                  handleAxisPointerDown(
                    directTool === "extrude_3d" ? "extrude" : "z",
                    gizmoScreen.z.ux,
                    gizmoScreen.z.uy,
                    gizmoScreen.z.pixelsPerMm,
                    ev,
                  )
                }
                onPointerMove={handleAxisPointerMove}
                onPointerUp={handleAxisPointerUp}
                onPointerCancel={handleAxisPointerUp}
              >
                <line
                  x1={gizmoScreen.origin.x}
                  y1={gizmoScreen.origin.y}
                  x2={gizmoScreen.z.endX}
                  y2={gizmoScreen.z.endY}
                  stroke="transparent"
                  strokeWidth={20}
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
                >
                  {directTool === "extrude_3d" ? "EXT" : "+Z"}
                </text>
              </g>

              {/* Pivô Central Móvel com Snap a Vértices/Arestas/Faces */}
              <circle
                cx={gizmoScreen.origin.x}
                cy={gizmoScreen.origin.y}
                r={6}
                fill={isPickingPivotSnap ? "#F59E0B" : "#00B4D8"}
                stroke={isDark ? "#0F172A" : "#FFFFFF"}
                strokeWidth={2}
                className="pointer-events-auto cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  triggerHaptic("selection");
                  setIsPickingPivotSnap((p) => !p);
                }}
              />

              {/* Feedback de Delta durante arraste */}
              {activeAxis && (
                <g
                  transform={`translate(${gizmoScreen.origin.x}, ${gizmoScreen.origin.y - 24})`}
                >
                  <rect
                    x={-52}
                    y={-11}
                    width={104}
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
                    {activeAxis === "extrude"
                      ? `H: ${((primaryBody?.extrudeHeightMm ?? sheetThickness) + dragDeltaMm).toFixed(1)} mm`
                      : `Δ${activeAxis.toUpperCase()}: ${dragDeltaMm >= 0 ? `+${dragDeltaMm}` : dragDeltaMm} mm`}
                  </text>
                </g>
              )}
            </g>
          )}
        </svg>
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
            onClick={(ev) => {
              ev.stopPropagation();
              const pos = { x: ev.clientX + 8, y: ev.clientY - 20 };
              if (directTool === "fillet_3d" || directTool === "chamfer_3d") {
                openFloatingNumpad(
                  filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                  filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                  "mm",
                  filletOrChamferMode === "fillet"
                    ? primaryBody.edgeFilletRadiusMm || 10
                    : primaryBody.edgeChamferDistMm || 10,
                  pos,
                  undefined,
                  undefined,
                  true,
                );
              } else if (directTool === "shell_3d") {
                openFloatingNumpad(
                  "THICKNESS",
                  "THICKNESS",
                  "mm",
                  primaryBody.shellThicknessMm || 6,
                  pos,
                  undefined,
                  undefined,
                  true,
                );
              } else if (directTool === "offset_face_3d") {
                openFloatingNumpad(
                  "OFFSET",
                  "OFFSET",
                  "mm",
                  25,
                  pos,
                  offsetFaceTarget,
                  undefined,
                  true,
                );
              } else if (directTool === "rotate_axis_3d") {
                openFloatingNumpad(
                  "ANGLE",
                  "ANGLE",
                  "°",
                  primaryBody.miterCutTopDeg || 45,
                  pos,
                  miterEndTarget,
                  undefined,
                  true,
                );
              } else if (directTool === "transform_3d") {
                openFloatingNumpad(
                  "DISTANCE",
                  "DISTANCE",
                  "mm",
                  100,
                  pos,
                  transformAxisTarget,
                  copyOnTransform,
                  true,
                );
              } else {
                openFloatingNumpad(
                  "EXTRUSION",
                  "EXTRUSION",
                  "mm",
                  primaryBody.extrudeHeightMm,
                  pos,
                  undefined,
                  undefined,
                  true,
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
                  ? `${(primaryBody.shellThicknessMm || 6).toFixed(1)} mm`
                  : directTool === "offset_face_3d"
                    ? `+25.0 mm`
                    : directTool === "rotate_axis_3d"
                      ? `∠ ${(primaryBody.miterCutTopDeg || 45).toFixed(0)}°`
                      : directTool === "transform_3d"
                        ? `Δ${transformAxisTarget.toUpperCase()} mm`
                        : `${primaryBody.extrudeHeightMm.toFixed(1)} mm`}
            </span>
          </button>

          {directTool === "transform_3d" && (
            <button
              type="button"
              data-testid="chamfer-3d-gizmo-copy-badge"
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
          )}
        </div>
      )}

      {/* =====================================================================
          4. TECLADO NUMÉRICO FLUTUANTE COMPACTO (196px — SEÇÃO 5)
          ===================================================================== */}
      {numpadSession && (
        <div
          ref={numpadRef}
          data-testid="chamfer-floating-parametric-numpad"
          style={{
            ...themeSurfaceStyle,
            left: `${numpadSession.screenPos.x}px`,
            top: `${numpadSession.screenPos.y}px`,
            width: "196px",
            padding: "10px",
            borderRadius: "14px",
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          className="pointer-events-auto absolute z-50 border shadow-2xl backdrop-blur-xl select-none"
        >
          {/* Cabeçalho compacto com título do parâmetro e botão ✕ */}
          <div
            style={{
              borderColor: isDark ? "rgba(51, 65, 85, 0.6)" : "rgba(203, 213, 225, 0.8)",
            }}
            className="mb-1.5 flex items-center justify-between border-b pb-1"
          >
            <span className="font-mono text-[9.5px] font-bold tracking-wider text-cyan-600 dark:text-cyan-400 uppercase">
              {numpadSession.title}
            </span>
            <button
              type="button"
              aria-label="Fechar teclado numérico"
              onClick={() => setNumpadSession(null)}
              className={cn(
                "flex size-5 items-center justify-center rounded-md transition-colors cursor-pointer",
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
              "mb-1.5 flex h-8 items-center justify-between rounded-lg border px-2.5 font-mono",
              isDark
                ? "border-cyan-500/40 bg-slate-900/95 text-white"
                : "border-cyan-600/40 bg-slate-50 text-slate-900",
            )}
          >
            <span
              data-testid="chamfer-floating-numpad-display"
              className="truncate text-[13px] font-bold"
            >
              {numpadBuffer}
            </span>
            <span className="ml-1 text-[10.5px] font-bold text-cyan-600 dark:text-cyan-400">
              {numpadSession.unit}
            </span>
          </div>

          {/* Grid compacto 3×4 + linha de ação (botões de 30px de altura e fonte 13px) */}
          <div className="grid grid-cols-3 gap-1 font-mono text-[13px] font-bold">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3", "+/-", "0", "."].map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`chamfer-numpad-key-${k}`}
                onClick={() => handleNumpadKey(k)}
                className={cn(
                  "flex h-[30px] items-center justify-center rounded-lg border text-[13px] transition-colors cursor-pointer",
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
              onClick={() => handleNumpadKey("BACK")}
              className={cn(
                "flex h-[30px] items-center justify-center rounded-lg border text-[12px] transition-colors cursor-pointer",
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
              onClick={() => handleNumpadKey("C")}
              className={cn(
                "flex h-[30px] items-center justify-center rounded-lg border text-[12px] transition-colors cursor-pointer",
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
              onClick={commitFloatingNumpad}
              className="flex h-[30px] items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition-colors cursor-pointer"
              title="Confirmar medida (Enter)"
            >
              <Check className="size-4" />
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
                    onClick={() => {
                      triggerHaptic("selection");
                      setBooleanMode(bm.id);
                      onCommitEntities?.((prev) =>
                        applyDirectExtrudeToEntities(
                          prev,
                          activeTargetEntityIds,
                          primaryBody.extrudeHeightMm,
                          bm.id,
                        ),
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
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectExtrudeToEntities(
                          prev,
                          activeTargetEntityIds,
                          hVal,
                          booleanMode,
                        ),
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
                  onClick={(ev) => {
                    openFloatingNumpad(
                      "EXTRUSION",
                      "EXTRUSION",
                      "mm",
                      primaryBody.extrudeHeightMm,
                      { x: ev.clientX - 98, y: ev.clientY - 245 },
                      undefined,
                      undefined,
                      true,
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
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[0, 5, 10, 15, 20].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectFilletOrChamfer3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          filletOrChamferMode,
                          val,
                        ),
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
                  onClick={(ev) => {
                    openFloatingNumpad(
                      filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                      filletOrChamferMode === "fillet" ? "RADIUS" : "CHAMFER",
                      "mm",
                      filletOrChamferMode === "fillet"
                        ? primaryBody.edgeFilletRadiusMm || 10
                        : primaryBody.edgeChamferDistMm || 10,
                      { x: ev.clientX - 98, y: ev.clientY - 245 },
                      undefined,
                      undefined,
                      true,
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
                  onClick={() => {
                    setShellOpenCapsMode("both_ends");
                    onCommitEntities?.((prev) =>
                      applyDirectShell3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        primaryBody.shellThicknessMm || 6,
                        ["top", "bottom"],
                      ),
                    );
                  }}
                  className={pillBtnClass(shellOpenCapsMode === "both_ends")}
                >
                  Tubo Vazado (2 Faces)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShellOpenCapsMode("top_only");
                    onCommitEntities?.((prev) =>
                      applyDirectShell3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        primaryBody.shellThicknessMm || 6,
                        ["top"],
                      ),
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
                    onClick={() => {
                      triggerHaptic("action");
                      const caps: ("top" | "bottom")[] =
                        shellOpenCapsMode === "both_ends" ? ["top", "bottom"] : ["top"];
                      onCommitEntities?.((prev) =>
                        applyDirectShell3DToEntities(prev, activeTargetEntityIds, wVal, caps),
                      );
                    }}
                    className={pillBtnClass(
                      Math.abs(primaryBody.shellThicknessMm - wVal) < 0.2,
                    )}
                  >
                    {wVal}mm
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(ev) => {
                    openFloatingNumpad(
                      "THICKNESS",
                      "THICKNESS",
                      "mm",
                      primaryBody.shellThicknessMm || 6,
                      { x: ev.clientX - 98, y: ev.clientY - 245 },
                      undefined,
                      undefined,
                      true,
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
                    onClick={() => setOffsetFaceTarget(t.id)}
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
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectOffsetFace3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          offsetFaceTarget,
                          dVal,
                        ),
                      );
                    }}
                    className={pillBtnClass(false)}
                  >
                    {dVal > 0 ? `+${dVal}mm` : `${dVal}mm`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(ev) => {
                    openFloatingNumpad(
                      "OFFSET",
                      "OFFSET",
                      "mm",
                      25,
                      { x: ev.clientX - 98, y: ev.clientY - 245 },
                      offsetFaceTarget,
                      undefined,
                      true,
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
                  onClick={() => setMiterEndTarget("top")}
                  className={pillBtnClass(miterEndTarget === "top")}
                >
                  Topo (+Z)
                </button>
                <button
                  type="button"
                  onClick={() => setMiterEndTarget("bottom")}
                  className={pillBtnClass(miterEndTarget === "bottom")}
                >
                  Base (-Z)
                </button>
                <button
                  type="button"
                  onClick={() => setMiterAxis((a) => (a === "x" ? "y" : "x"))}
                  className={pillBtnClass(true)}
                >
                  Eixo {miterAxis.toUpperCase()}
                </button>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-400/30" />
                {[-45, -30, 0, 30, 45].map((ang) => (
                  <button
                    key={ang}
                    type="button"
                    onClick={() => {
                      triggerHaptic("action");
                      onCommitEntities?.((prev) =>
                        applyDirectMiterCut3DToEntities(
                          prev,
                          activeTargetEntityIds,
                          miterEndTarget,
                          ang,
                          miterAxis,
                        ),
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
                  onClick={(ev) => {
                    openFloatingNumpad(
                      "ANGLE",
                      "ANGLE",
                      "°",
                      45,
                      { x: ev.clientX - 98, y: ev.clientY - 245 },
                      miterEndTarget,
                      undefined,
                      true,
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
                  onClick={() => {
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
                  onClick={() => {
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
                    onClick={() => setTransformAxisTarget(ax)}
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
                    onClick={() => {
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
                      });
                    }}
                    className={pillBtnClass(false)}
                  >
                    +{distVal}mm
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onCommitEntities?.((prev) => {
                      const res = applyDirectTransform3DToEntities(
                        prev,
                        activeTargetEntityIds,
                        { ryDeg: 45 },
                        copyOnTransform,
                      );
                      return res.updatedEntities;
                    });
                  }}
                  className={pillBtnClass(false)}
                >
                  Girar 45°
                </button>
                <button
                  type="button"
                  onClick={(ev) => {
                    openFloatingNumpad(
                      "DISTANCE",
                      "DISTANCE",
                      "mm",
                      700,
                      { x: ev.clientX - 98, y: ev.clientY - 245 },
                      transformAxisTarget,
                      copyOnTransform,
                      true,
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
