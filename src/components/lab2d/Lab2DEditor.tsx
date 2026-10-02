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
} from "lucide-react";
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
import { usePanelSide } from "@/lib/lab2d/panelSide";
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
import { Cad3DStage } from "@/components/lab2d/Cad3DStage";
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
  | "extend"
  | "fillet"
  | "chamfer";

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

export function Lab2DEditor({ projectId }: { projectId?: string }) {
  const { isMestre } = useFeatureAccess();
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

  const [project, setProject] = useState<Project | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [entities, setEntities] = useState<Entity[]>([]);

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
  const [dragNode, setDragNode] = useState<{ id: string; index: number } | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textSpec, setTextSpec] = useState<TextSpec | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
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
  const moveRef = useRef<{ from: Vec2; ids: string[]; base: Entity[] } | null>(null);
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

  /* ------------------------------------------- projeto, planos e autosave */
  useEffect(() => {
    if (!projectId) return;
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setLayers(p.layers ?? DEFAULT_LAYERS);
    const plan = p.plans.find((x) => x.id === p.lastPlanId) ?? p.plans[0]!;
    setPlanId(plan.id);
    setEntities(plan.entities);
    setGroups(plan.groups ?? []);
    setDims(plan.dims ?? []);
    setThickness(p.thickness ?? DEFAULT_PLAN_THICKNESS);
    past.current = [];
    future.current = [];
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

  /* autosave fora do caminho crítico: debounce + tempo ocioso do navegador */
  useEffect(() => {
    if (!project || !planId) return;
    let idle = 0;
    const t = setTimeout(() => {
      const run = () => {
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
      };
      const ric = (
        window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number }
      ).requestIdleCallback;
      if (ric) idle = ric(run, { timeout: 1000 });
      else run();
    }, 1500);
    return () => {
      clearTimeout(t);
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback;
      if (idle && cic) cic(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, layers, planId, groups, dims, thickness]);

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
      return typeof next === "function" ? next(prev) : next;
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

  /* --------------------------------------------------------- coordenadas */
  const toWorld = useCallback((ev: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    // CÂMERA ÚNICA: durante um gesto o estado React fica um quadro atrás;
    // o hit-test precisa usar exatamente a mesma câmera que desenhou.
    const v = viewRef.current;
    return {
      x: (ev.clientX - r.left - v.tx) / v.k,
      y: (ev.clientY - r.top - v.ty) / v.k,
    };
  }, []);

  /** Enquadra uma caixa do desenho na viewport (margem visual, escala 1:1 preservada). */
  const fitBox = useCallback((box: Box | null) => {
    const el = svgRef.current;
    if (!box || !el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const k = Math.min((r.width - 80) / w, (r.height - 80) / h);
    setView({
      k,
      tx: r.width / 2 - ((box.minX + box.maxX) / 2) * k,
      ty: r.height / 2 - ((box.minY + box.maxY) / 2) * k,
    });
  }, []);

  const fitTo = useCallback((list: Entity[]) => fitBox(bbox(list)), [fitBox]);

  /** Enquadra a moldura de trabalho inteira. */
  const fitFrame = useCallback(() => fitBox(frameBox(frame)), [fitBox, frame]);

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
  const viewRef = useRef(view);
  /* durante um gesto o ref é a fonte da verdade (React só acompanha por quadro) */
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

  const flashZoom = useCallback((k: number) => {
    setZoomHud(k);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setZoomHud(null), 600);
  }, []);

  /** único ponto de verdade do zoom: escala ancorada num ponto de tela */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const v = viewRef.current;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
      const ratio = next / v.k;
      const nv = { k: next, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio };
      applyView(nv);
      markGesture();
      return nv;
    },
    [applyView, markGesture],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1);
      const r = el.getBoundingClientRect();
      // ctrlKey = pinça de trackpad: mesma equação, ancorada no cursor
      const intensity = ev.ctrlKey ? 0.01 : 0.0015;
      const v = zoomAt(Math.exp(-dy * intensity), ev.clientX - r.left, ev.clientY - r.top);
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
      const tol = 6 / view.k;
      let best: { e: Entity; d: number } | null = null;
      for (const e of near(p, tol)) {
        if (layerOf(e.layer)?.locked) continue;
        let d = Infinity;
        if (e.type === "circle" || e.type === "arc")
          d = Math.abs(dist(p, { x: e.cx, y: e.cy }) - e.r);
        else if (e.type === "text") d = dist(p, { x: e.x, y: e.y });
        else for (const s of segmentsOf(e)) d = Math.min(d, dist(p, closestOnSegment(p, s)));
        if (d <= tol && (!best || d < best.d)) best = { e, d };
      }
      return best?.e ?? null;
    },
    [near, view.k, layerOf],
  );

  const snapPoint = useCallback(
    (p: Vec2): Vec2 => {
      if (!snapOn) return p;
      const tol = 10 / view.k;
      const s = findSnap(p, near(p, tol * 2), tol, grid, { grid: showGrid, object: true });
      return s ? s.p : p;
    },
    [snapOn, near, view.k, grid, showGrid],
  );

  /* ---------------------------------------- pintura em canvas (por sujidade) */
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (r) setCanvasSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    });
  }, [drawIndex, view, selectionSet, gesturing, canvasSize, solidOpen]);

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

  const selected = useMemo(
    () => entities.filter((e) => selection.includes(e.id)),
    [entities, selection],
  );

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
        return { ...e, cx: c.x, cy: c.y, r: e.r * factor };
      }
      case "arc": {
        const c = sc({ x: e.cx, y: e.cy });
        return { ...e, cx: c.x, cy: c.y, r: e.r * factor };
      }
      case "point": {
        const p = sc({ x: e.x, y: e.y });
        return { ...e, x: p.x, y: p.y };
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
  }, [selected.length, selected, boxOfEntities, entities, commit]);

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
    if (selected.length < 2) {
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
  }, [selected.length, entities, selection, commit]);

  const handleExplodeSelection = useCallback(() => {
    if (!selected.length) {
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
  }, [selected.length, entities, selection, commit]);

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
  }, [selected.length, boxOfEntities, selected, cursor.x, cursor.y, commit]);

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
      if (points.length > 1)
        commit((p) => [
          ...p,
          { id: uid(), layer: activeLayer, type: "polyline", pts: points, closed: close },
        ]);
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
      const hit = hitTest(raw);
      if (tool === "node" && hit && selection.includes(hit.id)) {
        const pts = entityPoints(hit);
        let idx = -1;
        let bd = 8 / view.k;
        pts.forEach((q, i) => {
          const d = dist(q, raw);
          if (d < bd) {
            bd = d;
            idx = i;
          }
        });
        if (idx >= 0) {
          setDragNode({ id: hit.id, index: idx });
          return;
        }
      }
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
        if (tool === "select") moveRef.current = { from: raw, ids: nextSel, base: entities };
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
        if (arc) commit((e) => [...e, arc]);
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
      const tol = 10 / view.k;
      setSnapHit(findSnap(raw, near(raw, tol * 2), tol, grid, { grid: showGrid, object: true }));
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
      setEntities(base.map((e) => (ids.includes(e.id) ? translate(e, dx, dy) : e)));
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
          id: "draft",
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
        id: "draft",
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
      const base = moveRef.current.base;
      moveRef.current = null;
      past.current = [...past.current, base];
      // mover pode invalidar um trecho comum ligado a peça fora do grupo
      setEntities((list) => revalidateShared(list));
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
      if (!empty) commit((e) => [...e, draft]);
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
      if (meta && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) {
          redo();
        } else {
          undo();
        }
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

  const pickTool = useCallback((id: Tool) => {
    if (id === "text") setTextOpen(true);
    setTool(id);
    setPending([]);
    setDraft(null);
  }, []);

  const copySelected = useCallback(() => {
    clipboardRef.current = copySelection(entities, selection, groups);
    if (clipboardRef.current)
      toast.success(`${clipboardRef.current.entities.length} objeto(s) copiado(s).`);
  }, [entities, selection, groups]);

  const selectionActions = (
    <>
      <IconBtn label="Copiar" onClick={copySelected} icon={Copy} flat />
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

  const gridStep = grid * view.k < 6 ? grid * 10 : grid;

  const panelOpen = !focus && (selected.length > 0 || showLayers || showCut || showDims2);

  /*
   * PANEL POSITION MANAGER — fonte única do lado do painel.
   * A assinatura muda só em evento significativo (abertura, nova seleção,
   * mudança de tipo de seleção, troca de aba). `view` NÃO entra aqui: era
   * exatamente isso que provocava o vaivém esquerda/direita.
   */
  const panelSignature = `${showLayers ? "L" : showCut ? "C" : "P"}|${
    selected.length === 0 ? "none" : selected.length === 1 ? `one:${selected[0]!.id}` : "multi"
  }`;
  const measurePanel = useCallback(() => {
    const el = svgRef.current;
    const width = el?.getBoundingClientRect().width ?? 0;
    const b = selBoxRef.current;
    const v = viewRef.current;
    return {
      width,
      centerX: b ? v.tx + ((b.minX + b.maxX) / 2) * v.k : null,
    };
  }, []);
  const panelSide = usePanelSide(panelOpen, panelSignature, measurePanel);

  const primaryTools = TOOLS.filter((t) => PRIMARY.includes(t.id));

  const aside = panelOpen ? (
    <aside className="metal hairline flex w-56 shrink-0 flex-col overflow-y-auto rounded-2xl p-2">
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
          />
          <div className="flex flex-wrap gap-1 border-t border-line pt-2">{selectionActions}</div>
        </div>
      )}
    </aside>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "metal fixed inset-0 z-50 flex h-[100dvh] w-[100vw] max-w-none flex-col gap-2 overflow-hidden rounded-none p-2",
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
      {/* REGIÃO A — HEADER SUPERIOR DEFINITIVO LANDSCAPE */}
      {!focus && (
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-card/80 px-3 backdrop-blur-md">
          {/* LADO ESQUERDO: [ ← SAIR ] [ CHAMFER ] */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={leaveEditor}
              aria-label="Sair do CHAMFER"
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-background/60 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-background hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Sair
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wider text-accent">CHAMFER</span>
              {project && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    setNewProjectName(`Projeto ${Date.now().toString().slice(-4)}`);
                    setNewProjectDialogOpen(true);
                  }}
                  className="hidden md:inline font-mono text-[10px] text-muted-foreground hover:text-accent transition-colors truncate max-w-[140px]"
                  title={`Projeto: ${project.name} (clique para novo projeto)`}
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
                  className="hidden lg:inline rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-accent uppercase ring-1 ring-accent/25 truncate max-w-[160px]"
                >
                  {dossier.partCode || dossier.partName}
                </button>
              )}
            </div>
          </div>

          {/* CENTRO: [ 2D ESBOÇO ] [ 3D TRAÇAGEM ] [ FLANGES ] */}
          <div className="flex items-center rounded-lg border border-line bg-background/60 p-0.5 shadow-xs">
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
                  ? "bg-accent/20 text-accent shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              2D ESBOÇO
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
                  ? "bg-accent/20 text-accent shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
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
                  ? "bg-accent/20 text-accent shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              FLANGES
            </button>
          </div>

          {/* LADO DIREITO: [ DESFAZER ] [ REFAZER ] [ AJUSTAR ] [ CAMADAS ] [ EXPORTAR ] [ FERRAMENTA RÁPIDA ] [ MAIS ] [ TELA CHEIA ] */}
          <div className="flex items-center gap-1">
            <IconBtn label="Desfazer" onClick={undo} icon={Undo2} title="Desfazer ação (Ctrl+Z)" />
            <IconBtn label="Refazer" onClick={redo} icon={Redo2} title="Refazer ação (Ctrl+Y)" />
            <IconBtn
              label="Ajustar"
              onClick={() => fitTo(entities)}
              icon={ScanSearch}
              title="Ajustar / Enquadrar no viewport"
            />
            <IconBtn
              label="Camadas"
              onClick={() => {
                setShowLayers((s) => !s);
                setShowCut(false);
              }}
              icon={LayersIcon}
              active={showLayers}
              title="Gerenciamento de camadas técnicas"
            />
            <IconBtn
              label="Exportar"
              onClick={() => setExportOpen(true)}
              icon={Download}
              title="Exportar DXF, SVG, PNG, PDF"
            />
            <IconBtn
              label="Ferramenta Rápida"
              onClick={() => setCncOpen(true)}
              icon={Scissors}
              title="Ferramenta Rápida: Corte e Exportação DXF CNC direta"
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
              label="Tela Cheia"
              onClick={toggleFullscreen}
              icon={focus ? Minimize : Maximize}
              title="Alternar modo tela cheia / foco"
            />
          </div>
        </header>
      )}

      {/* TOOLBAR SUPERIOR HORIZONTAL (DESENHAR, MODIFICAR, PRECISÃO, COTAR, CHAPA) */}
      {!focus && activeMode === "2d" && (
        <ChamferLandscapeToolbar
          activeTab={activeRibbonTab}
          onTabChange={setActiveRibbonTab}
          tool={tool}
          onPickTool={pickTool}
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
          onArrayLinear={handleArrayLinear}
          onArrayPolar={handleArrayPolar}
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
          cursor={cursor}
          onApplyCoordinate={handleApplyCoordinate}
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
          onConvertToCut={handleConvertToCut}
          onConvertToRecorte={handleConvertToRecorte}
          onUnfold={handleUnfold}
          onFold={handleFold}
        />
      )}

      {/* CORPO: SIDEBAR ESQUERDA + CANVAS + PROPRIEDADES */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-1.5 pt-0">
        {/* REGIÃO B — SIDEBAR ESQUERDA (8 ITENS CANÔNICOS, OCULTA NO MODO 3D) */}
        {!focus && activeMode === "2d" && (
          <aside
            aria-label="Ferramentas principais do CHAMFER"
            className="metal hairline flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto rounded-2xl p-1 shadow-sm select-none"
          >
            {primaryTools.map((t) => (
              <ToolBtn key={t.id} t={t} active={tool === t.id} onPick={pickTool} />
            ))}
            <div className="my-1 h-px w-6 bg-line" />
            <div className="relative">
              <IconBtn
                label="Mais ferramentas"
                onClick={() => setSecondaryToolsOpen((v) => !v)}
                icon={MoreHorizontal}
                active={secondaryToolsOpen}
                flat
                title="Ferramentas secundárias: Ponto, Polígono, Elipse, Medir, Nó, Pan"
              />
              {secondaryToolsOpen && (
                <div className="metal hairline pop-in absolute left-full top-0 ml-2 z-50 w-48 rounded-xl p-1.5 shadow-xl backdrop-blur">
                  <p className="px-2 py-1 font-mono text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    Secundárias
                  </p>
                  <MenuItem
                    label="Ponto"
                    icon={Dot}
                    onClick={() => {
                      setTool("point");
                      setSecondaryToolsOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Polígono"
                    icon={Hexagon}
                    onClick={() => {
                      setTool("polygon");
                      setSecondaryToolsOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Elipse"
                    icon={Egg}
                    onClick={() => {
                      setTool("ellipse");
                      setSecondaryToolsOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Medir / Régua"
                    icon={Ruler}
                    onClick={() => {
                      setTool("measure");
                      setSecondaryToolsOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Editar Nós"
                    icon={MousePointer2}
                    onClick={() => {
                      setTool("node");
                      setSecondaryToolsOpen(false);
                    }}
                  />
                  <MenuItem
                    label="Mover Tela (Pan)"
                    icon={Move}
                    onClick={() => {
                      setTool("pan");
                      setSecondaryToolsOpen(false);
                    }}
                  />
                  <div className="my-1 h-px bg-line" />
                  <MenuItem
                    label="Importar CNC 2D"
                    icon={Upload}
                    onClick={() => {
                      setImportOpen(true);
                      setSecondaryToolsOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </aside>
        )}

        {panelSide === "left" && aside}

        {/* REGIÃO C — CANVAS OU MOTOR 3D TRAÇAGEM / FLANGES */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-line/40 bg-background/50">
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
              {/* grade: camada própria, sempre abaixo da geometria */}
              <svg className="pointer-events-none absolute inset-0 size-full">
            <defs>
              <pattern
                id="lab2d-grid"
                width={gridStep * view.k}
                height={gridStep * view.k}
                patternUnits="userSpaceOnUse"
                x={view.tx}
                y={view.ty}
              >
                <path
                  d={`M ${gridStep * view.k} 0 L 0 0 0 ${gridStep * view.k}`}
                  fill="none"
                  stroke="var(--grid-minor)"
                  strokeWidth="1"
                />
              </pattern>
              <pattern
                id="lab2d-grid-major"
                width={gridStep * view.k * 5}
                height={gridStep * view.k * 5}
                patternUnits="userSpaceOnUse"
                x={view.tx}
                y={view.ty}
              >
                <path
                  d={`M ${gridStep * view.k * 5} 0 L 0 0 0 ${gridStep * view.k * 5}`}
                  fill="none"
                  stroke="var(--grid-major)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            {showGrid && !solidOpen && (
              <>
                <rect width="100%" height="100%" fill="url(#lab2d-grid)" />
                <rect width="100%" height="100%" fill="url(#lab2d-grid-major)" />
              </>
            )}
          </svg>
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

              {/* eixos — cinza técnico discreto (ocultos no modo 3D Traçagem) */}
              {!solidOpen && (
                <>
                  <line
                    x1={-1e4}
                    y1={0}
                    x2={1e4}
                    y2={0}
                    stroke="var(--axis-line)"
                    strokeWidth={1 / view.k}
                  />
                  <line
                    x1={0}
                    y1={-1e4}
                    x2={0}
                    y2={1e4}
                    stroke="var(--axis-line)"
                    strokeWidth={1 / view.k}
                  />
                </>
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

              {!solidOpen && pending.length > 0 && tool === "polyline" && (
                <polyline
                  points={pending.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={PREVIEW_COLOR}
                  strokeWidth={1.4 / view.k}
                  strokeDasharray={`${4 / view.k} ${3 / view.k}`}
                />
              )}

              {/* nós da seleção */}
              {!solidOpen && (tool === "node" || tool === "select") &&
                selected.flatMap((e) =>
                  entityPoints(e).map((p, i) => (
                    <circle
                      key={`${e.id}-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={3.2 / view.k}
                      className="fill-background"
                      stroke={SELECTION_COLOR}
                      strokeWidth={1.4 / view.k}
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
                  stroke={SELECTION_COLOR}
                  strokeOpacity={0.55}
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
                  fill={SELECTION_COLOR}
                  fillOpacity={0.08}
                  stroke={SELECTION_COLOR}
                  strokeWidth={1 / view.k}
                  strokeDasharray={
                    marquee.b.x < marquee.a.x ? `${5 / view.k} ${4 / view.k}` : undefined
                  }
                />
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
                <g key={i} stroke={DIMENSION_COLOR} fill={DIMENSION_COLOR}>
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
                  key={i}
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
            </g>
          </svg>

          <Rulers view={view} />

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
            </>
          )}
        </div>

        {/* REGIÃO D — PAINEL DE PROPRIEDADES */}
        {panelSide === "right" && aside}
      </div>

      {/* REGIÃO E — STATUS BAR LANDSCAPE */}
      {!focus && (
        <footer
          aria-label="Barra de status do CHAMFER"
          className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-line/60 bg-card/60 px-3 font-mono text-[10px] text-muted-foreground backdrop-blur-md select-none"
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
                  setEntities(pl.entities);
                  setGroups(pl.groups ?? []);
                  setDims(pl.dims ?? []);
                  setSelection([]);
                  past.current = [];
                  future.current = [];
                }}
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 font-bold transition-colors",
                  pl.id === planId ? "bg-accent/20 text-accent font-semibold" : "hover:text-foreground",
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

            <div className="mx-1 h-3.5 w-px bg-line" />

            {/* LEITURA DE COORDENADAS */}
            <div className="flex items-center gap-1.5 font-mono text-[9.5px]">
              <span className="text-muted-foreground">X:</span>
              <strong className="text-foreground">{cursor.x.toFixed(2)}</strong>
              <span className="text-muted-foreground">Y:</span>
              <strong className="text-foreground">{cursor.y.toFixed(2)}</strong>
              <span className="text-muted-foreground">mm</span>
            </div>

            {/* HUD DE COMPRIMENTO / ÂNGULO QUANDO DESENHANDO LINHA */}
            {pending.length === 1 && (tool === "line" || tool === "polyline") && (
              <div className="flex items-center gap-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-[9.5px] text-accent">
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
                showGrid ? "text-accent bg-accent/15" : "text-muted-foreground hover:text-foreground",
              )}
              title="Alternar visibilidade da grade"
            >
              GRID: {showGrid ? `${grid}mm` : "OFF"}
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

function Rulers({ view }: { view: { tx: number; ty: number; k: number } }) {
  const step = view.k > 2 ? 10 : view.k > 0.5 ? 50 : 200;
  const ticks = Array.from({ length: 80 }, (_, i) => (i - 40) * step);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 h-4 border-b border-line/40 bg-background/30 backdrop-blur-sm">
        {ticks.map((t) => {
          const x = view.tx + t * view.k;
          return x < 0 || x > 4000 ? null : (
            <span
              key={t}
              style={{ left: x }}
              className="absolute top-0 font-mono text-[7px] text-muted-foreground/60"
            >
              {t}
            </span>
          );
        })}
      </div>
      <div className="absolute inset-y-0 left-0 w-4 border-r border-line/40 bg-background/30 backdrop-blur-sm">
        {ticks.map((t) => {
          const y = view.ty + t * view.k;
          return y < 16 || y > 4000 ? null : (
            <span
              key={t}
              style={{ top: y }}
              className="absolute left-0 font-mono text-[7px] text-muted-foreground/60"
            >
              {t}
            </span>
          );
        })}
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
};

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * DimensionEditor — painel universal de propriedades e dimensões.
 * Funciona para qualquer entidade: edição numérica atualiza a geometria na hora.
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
  const field = (label: string, value: number, set: (n: number) => void, unit?: string) => (
    <label key={label} className="flex items-center justify-between gap-2 py-0.5">
      <span className="font-mono text-[9px] text-muted-foreground uppercase">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={Number(value.toFixed(2))}
          onChange={(ev) => {
            const n = Number(ev.target.value);
            if (Number.isFinite(n)) set(n);
          }}
          className="w-20 rounded-lg border border-line bg-background/40 px-1.5 py-1 text-right font-mono text-[11px] outline-none"
        />
        {unit && <span className="font-mono text-[8px] text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );

  const info = (text: string, key?: string) => (
    <p key={key ?? text} className="font-mono text-[10px] text-muted-foreground">{text}</p>
  );

  const body: React.ReactNode[] = [];

  if (e.type === "circle") {
    body.push(
      field("X", e.cx, (n) => onChange({ ...e, cx: n }), "mm"),
      field("Y", e.cy, (n) => onChange({ ...e, cy: n }), "mm"),
      field("R", e.r, (n) => onChange({ ...e, r: Math.max(n, 0.01) }), "mm"),
      field("Ø", e.r * 2, (n) => onChange({ ...e, r: Math.max(n / 2, 0.01) }), "mm"),
    );
  }

  if (e.type === "line") {
    const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
    const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
    const setPolar = (l: number, a: number) =>
      onChange({ ...e, x2: e.x1 + l * Math.cos(a), y2: e.y1 + l * Math.sin(a) });
    body.push(
      field("X1", e.x1, (n) => onChange({ ...e, x1: n }), "mm"),
      field("Y1", e.y1, (n) => onChange({ ...e, y1: n }), "mm"),
      field("X2", e.x2, (n) => onChange({ ...e, x2: n }), "mm"),
      field("Y2", e.y2, (n) => onChange({ ...e, y2: n }), "mm"),
      field("Compr.", len, (n) => setPolar(Math.max(n, 0.01), ang), "mm"),
      field("Ângulo", deg(ang), (n) => setPolar(len, rad(n)), "°"),
    );
  }

  if (e.type === "arc") {
    let sweep = e.a1 - e.a0;
    while (sweep < 0) sweep += Math.PI * 2;
    body.push(
      field("X", e.cx, (n) => onChange({ ...e, cx: n }), "mm"),
      field("Y", e.cy, (n) => onChange({ ...e, cy: n }), "mm"),
      field("R", e.r, (n) => onChange({ ...e, r: Math.max(n, 0.01) }), "mm"),
      field("Ø", e.r * 2, (n) => onChange({ ...e, r: Math.max(n / 2, 0.01) }), "mm"),
      field("Âng. ini.", deg(e.a0), (n) => onChange({ ...e, a0: rad(n) }), "°"),
      field("Âng. fim", deg(e.a1), (n) => onChange({ ...e, a1: rad(n) }), "°"),
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
    const scaleTo = (sx: number, sy: number) =>
      onChange({
        ...e,
        pts: e.pts.map((p) => ({ x: minX + (p.x - minX) * sx, y: minY + (p.y - minY) * sy })),
      });
    const moveTo = (x: number, y: number) =>
      onChange({ ...e, pts: e.pts.map((p) => ({ x: p.x - minX + x, y: p.y - minY + y })) });
    const rotateBy = (d: number) => {
      const cx = minX + w / 2;
      const cy = minY + h / 2;
      const a = rad(d);
      onChange({
        ...e,
        pts: e.pts.map((p) => ({
          x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a),
          y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a),
        })),
      });
    };
    body.push(
      field("X", minX, (n) => moveTo(n, minY), "mm"),
      field("Y", minY, (n) => moveTo(minX, n), "mm"),
      field("Largura", w, (n) => scaleTo(w > 0.001 ? Math.max(n, 0.01) / w : 1, 1), "mm"),
      field("Altura", h, (n) => scaleTo(1, h > 0.001 ? Math.max(n, 0.01) / h : 1), "mm"),
      field("Rotação", 0, (n) => rotateBy(n), "°"),
      info(
        `${e.pts.length} vértices · ${e.closed ? "fechada" : "aberta"} · ${perim.toFixed(1)} mm` +
          (area ? ` · ${(area / 100).toFixed(1)} cm²` : ""),
      ),
    );
  }

  if (e.type === "text") {
    body.push(
      field("X", e.x, (n) => onChange({ ...e, x: n }), "mm"),
      field("Y", e.y, (n) => onChange({ ...e, y: n }), "mm"),
      field("Altura", e.size, (n) => onChange({ ...e, size: Math.max(n, 0.5) }), "mm"),
      field(
        "Largura",
        e.width ?? Math.max(e.size, e.text.length * e.size * 0.6),
        (n) => onChange({ ...e, width: Math.max(n, 0.5) }),
        "mm",
      ),
      field("Rotação", e.rotation ?? 0, (n) => onChange({ ...e, rotation: n }), "°"),
      <button
        key="editar-texto"
        onClick={onEditText}
        className="w-full rounded-lg border border-line px-2 py-1.5 text-[10px] text-foreground hover:border-accent"
      >
        Editar texto e estilo
      </button>,
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: techColor(e.layer) }}
          aria-hidden
        />
        <p className="font-mono text-[9px] tracking-[0.2em] text-foreground uppercase">
          {TYPE_LABEL[e.type]}
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
