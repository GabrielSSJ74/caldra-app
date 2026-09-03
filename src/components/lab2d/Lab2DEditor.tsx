import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Circle as CircleIcon,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Layers as LayersIcon,
  Lock,
  Maximize,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Move3d,
  PenLine,
  Redo2,
  RotateCw,
  Ruler,
  ScanSearch,
  ScanEye,
  Image as ImageIcon,
  Scissors,
  Spline,
  Square,
  Trash2,
  Triangle,
  Undo2,
  Unlock,
  Upload,
  Waypoints,
  X,
} from "lucide-react";

import type { Vec2 } from "@/lib/geometry/types";
import { ExportDialog } from "@/components/lab2d/ExportDialog";
import { ImportDialog, type ImportSource } from "@/components/lab2d/ImportDialog";
import { VisionDialog, type VisionImageLayer } from "@/components/lab2d/VisionDialog";
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
  type Entity,
  type Layer,
  type Snap,
} from "@/lib/lab2d/core";
import { autoDimensions } from "@/lib/lab2d/render";
import { pathToSvg } from "@/lib/lab2d/bezier";
import {
  AXIS_COLOR,
  DIMENSION_COLOR,
  MARK_COLOR,
  WARNING_COLOR,
  PREVIEW_COLOR,
  SELECTION_COLOR,
  layerOrder,
  modeAllows,
  techColor,
  techStyle,
  type OutputMode,
} from "@/lib/lab2d/technical";
import {
  emptyPlan,
  getProject,
  planLabel,
  saveProject,
  type Project,
} from "@/lib/lab2d/projects";
import { takeHandoff } from "@/lib/lab2d/handoff";
import { buildIndex } from "@/lib/lab2d/spatialIndex";
import { drawScene } from "@/lib/lab2d/canvasScene";
import { stressEntities } from "@/lib/lab2d/stress";
import { CutPanel } from "@/components/lab2d/CutPanel";
import { expandSelection, pruneGroups, type GroupDef } from "@/lib/lab2d/groups";
import { isCutPath, setStartPoint, startPointOf, endPointOf } from "@/lib/lab2d/cutPlan";
import { revalidateShared, type ShareCandidate } from "@/lib/lab2d/sharedCut";
import { CUT_COLOR } from "@/lib/lab2d/technical";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";

import { cn } from "@/lib/utils";

type Tool =
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
  | "text"
  | "measure"
  | "offset"
  | "trim"
  | "extend"
  | "fillet"
  | "chamfer";

const TOOLS: { id: Tool; icon: typeof Minus; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Selecionar", key: "V" },
  { id: "node", icon: Waypoints, label: "Nós", key: "N" },
  { id: "pan", icon: Hand, label: "Deslocar", key: "H" },
  { id: "line", icon: Minus, label: "Linha", key: "L" },
  { id: "polyline", icon: PenLine, label: "Polilinha", key: "P" },
  { id: "circle", icon: CircleIcon, label: "Círculo", key: "C" },
  { id: "arc", icon: Spline, label: "Arco", key: "A" },
  { id: "rect", icon: Square, label: "Retângulo", key: "R" },
  { id: "polygon", icon: Triangle, label: "Polígono", key: "G" },
  { id: "offset", icon: Copy, label: "Paralela", key: "O" },
  { id: "trim", icon: Scissors, label: "Aparar", key: "T" },
  { id: "extend", icon: Move3d, label: "Prolongar", key: "E" },
  { id: "fillet", icon: CircleIcon, label: "Arredondar", key: "F" },
  { id: "measure", icon: Ruler, label: "Medir", key: "M" },
];

/** Ferramentas principais na barra lateral; as demais formam o grupo secundário. */
const PRIMARY: Tool[] = [
  "select",
  "node",
  "line",
  "polyline",
  "circle",
  "arc",
  "rect",
  "polygon",
  "pan",
];

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [entities, setEntities] = useState<Entity[]>([]);
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
  const [showDims, setShowDims] = useState(false);
  const [focus, setFocus] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showCut, setShowCut] = useState(false);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [showArrows, setShowArrows] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [startPicking, setStartPicking] = useState(false);
  const [shareHint, setShareHint] = useState<ShareCandidate | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [outputMode, setOutputMode] = useState<OutputMode>("completo");
  const [pending, setPending] = useState<Vec2[]>([]);

  const [draft, setDraft] = useState<Entity | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [liveMeasure, setLiveMeasure] = useState<Measure | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importSrc, setImportSrc] = useState<ImportSource | null>(null);
  const [visionOpen, setVisionOpen] = useState(false);
  const [imageLayer, setImageLayer] = useState<VisionImageLayer | null>(null);
  const [issues, setIssues] = useState<{ message: string; p: Vec2 }[] | null>(null);
  const [offsetDist, setOffsetDist] = useState(5);
  const [filletR, setFilletR] = useState(10);
  const [dragNode, setDragNode] = useState<{ id: string; index: number } | null>(null);
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
    past.current = [];
    future.current = [];
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
          lastPlanId: planId,
          plans: project.plans.map((pl) =>
            pl.id === planId ? { ...pl, entities, groups: live } : pl,
          ),
        };
        saveProject(next);
        setProject(next);
      };
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number })
        .requestIdleCallback;
      if (ric) idle = ric(run, { timeout: 1000 });
      else run();
    }, 1500);
    return () => {
      clearTimeout(t);
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (idle && cic) cic(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, layers, planId, groups]);


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
    setEntities(h.entities);
    toast.success(`${h.name} carregado no CHAMFER.`);
    requestAnimationFrame(() => fitTo(h.entities));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- coordenadas */
  const toWorld = useCallback(
    (ev: { clientX: number; clientY: number }): Vec2 => {
      const r = svgRef.current!.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left - view.tx) / view.k,
        y: (ev.clientY - r.top - view.ty) / view.k,
      };
    },
    [view],
  );

  const fitTo = useCallback((list: Entity[]) => {
    const box = bbox(list);
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
  useEffect(() => {
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
    // redesenha apenas uma vez por quadro, quando cena/viewport mudam
    const id = requestAnimationFrame(() =>
      drawScene(ctx, {
        index: drawIndex,
        view,
        width: canvasSize.w,
        height: canvasSize.h,
        dpr,
        selection: selectionSet,
        lod: gesturing,
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [drawIndex, view, selectionSet, gesturing, canvasSize]);

  /* teste de estresse: ?stress=5000 gera milhares de entidades sintéticas */
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("stress") ?? 0);
    if (n > 0) setEntities(stressEntities(n));
  }, []);


  const selected = useMemo(
    () => entities.filter((e) => selection.includes(e.id)),
    [entities, selection],
  );

  /* --------------------------------------------------------- interações */
  const finishPolyline = useCallback(
    (close: boolean) => {
      if (pending.length > 1)
        commit((p) => [
          ...p,
          { id: uid(), layer: activeLayer, type: "polyline", pts: pending, closed: close },
        ]);
      setPending([]);
      setDraft(null);
    },
    [pending, activeLayer, commit],
  );

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    ptrsRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // segundo dedo com a ferramenta MÃO ativa: inicia pinça, sem salto
    if (tool === "pan" && ptrsRef.current.size >= 2) {
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
        if (tool === "select")
          moveRef.current = { from: raw, ids: nextSel, base: entities };
        return;
      }
      if (!ev.shiftKey) setSelection([]);
      setMarquee({ a: raw, b: raw });
      return;
    }

    if (tool === "polyline") {
      setPending((q) => [...q, p]);
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
      if (hit)
        for (const other of entities) {
          if (other.id === hit.id) continue;
          const t = trimLine(hit, other, raw);
          if (t) {
            commit((e) => e.map((x) => (x.id === t.id ? t : x)));
            break;
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
      commit((e) => [...e.map((x) => (x.id === res.a.id ? res.a : x.id === res.b.id ? res.b : x)), extra]);
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

    // ---- pinça (2 ponteiros, ferramenta MÃO) ----
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
            return dragNode.index === 0
              ? { ...e, x1: p.x, y1: p.y }
              : { ...e, x2: p.x, y2: p.y };
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
        setDraft({ id: "draft", layer: activeLayer, type: "line", x1: a.x, y1: a.y, x2: p.x, y2: p.y });
      else if (a && b) setDraft(arcFrom3(a, b, p, activeLayer));
      return;
    }
    if (tool === "measure" && pending.length === 1) {
      setLiveMeasure({ a: pending[0]!, b: snapPoint(raw) });
      return;
    }
    if (pending.length === 1 && draft) {
      setDraft(buildDraft(tool, pending[0]!, snapPoint(raw), activeLayer, filletR));
    }

  };

  const onPointerUp = (ev?: React.PointerEvent) => {
    if (ev) ptrsRef.current.delete(ev.pointerId);
    const wasPinching = pinchRef.current !== null;
    if (wasPinching && ptrsRef.current.size < 2) {
      pinchRef.current = null;
      gestureUntilRef.current = performance.now() + 350;
      // continua o pan com o dedo restante, sem salto
      const rest = [...ptrsRef.current.values()][0];
      panRef.current = rest && tool === "pan" ? { ...rest } : null;
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
        ev.shiftKey ? redo() : undo();
        return;
      }
      if (meta && ev.key.toLowerCase() === "y") return redo();
      if (meta && ev.key.toLowerCase() === "d") {
        ev.preventDefault();
        commit((e) => [...e, ...selected.map((s) => ({ ...translate(s, 10, 10), id: uid() }))]);
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
  }, [undo, redo, selection, selected, commit, tool, finishPolyline, fitTo, entities]);

  /* ------------------------------------------------------------- ações */
  const applySelection = (fn: (e: Entity) => Entity) =>
    commit((list) =>
      revalidateShared(list.map((e) => (selection.includes(e.id) ? fn(e) : e))),
    );

  const selBox = useMemo(() => bbox(selected), [selected]);
  const center: Vec2 = selBox
    ? { x: (selBox.minX + selBox.maxX) / 2, y: (selBox.minY + selBox.maxY) / 2 }
    : { x: 0, y: 0 };

  const onImportConfirm = (next: Entity[]) => {
    commit((e) => [...e, ...next]);
    requestAnimationFrame(() => fitTo([...entities, ...next]));
  };

  const pickTool = useCallback((id: Tool) => {
    setTool(id);
    setPending([]);
    setDraft(null);
  }, []);


  const selectionActions = (
    <>
      <IconBtn
        label="Duplicar"
        onClick={() =>
          commit((e) => [...e, ...selected.map((s) => ({ ...translate(s, 10, 10), id: uid() }))])
        }
        icon={Copy}
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




  const gridStep = grid * view.k < 6 ? grid * 10 : grid;

  /* posicionamento inteligente: painel do lado oposto ao objeto selecionado */
  const panelSide: "left" | "right" = useMemo(() => {
    if (!selBox || !svgRef.current) return "right";
    const w = svgRef.current.getBoundingClientRect().width || 1;
    const cx = view.tx + ((selBox.minX + selBox.maxX) / 2) * view.k;
    return cx > w * 0.58 ? "left" : "right";
  }, [selBox, view]);

  const panelOpen = !focus && (selected.length > 0 || showLayers);
  const primaryTools = TOOLS.filter((t) => PRIMARY.includes(t.id));
  const extraTools = TOOLS.filter((t) => !PRIMARY.includes(t.id));

  const aside = panelOpen ? (
    <aside className="metal hairline flex w-56 shrink-0 flex-col overflow-y-auto rounded-2xl p-2">
      <div className="mb-2 flex items-center gap-1">
        <PanelTab active={!showLayers} onClick={() => setShowLayers(false)} label="Propriedades" />
        <PanelTab active={showLayers} onClick={() => setShowLayers(true)} label="Camadas" />
        <button
          aria-label="Fechar painel"
          onClick={() => {
            setShowLayers(false);
            setSelection([]);
          }}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {showLayers ? (
        <div className="space-y-0.5">
          {[...layers]
            .sort((a, b) => layerOrder(b.id) - layerOrder(a.id))
            .map((l) => (
              <div key={l.id} className="flex items-center gap-1.5 rounded-xl px-1 py-1.5">
                <button
                  onClick={() => setActiveLayer(l.id)}
                  className={cn(
                    "size-3 shrink-0 rounded-full",
                    activeLayer === l.id &&
                      "ring-2 ring-offset-1 ring-offset-background",
                  )}
                  style={{
                    background: techColor(l.id),
                    ...(activeLayer === l.id ? { boxShadow: `0 0 0 2px ${SELECTION_COLOR}55` } : {}),
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
          layers={layers}
          actions={selectionActions}
        />
      ) : (
        <div className="space-y-2">
          <p className="tick-label text-muted-foreground">{selected.length} objetos</p>
          <div className="flex flex-wrap gap-1">{selectionActions}</div>
        </div>
      )}
    </aside>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "metal flex flex-col gap-2 overflow-hidden rounded-3xl p-2",
        isMestre && "glow-ring",
        focus ? "fixed inset-0 z-50 rounded-none" : "h-[74vh] min-h-[460px]",
      )}
    >
      {/* REGIÃO A — HEADER */}
      {!focus && (
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="tick-label shrink-0 text-accent">CHAMFER</span>
            {project && (
              <span className="tick-label truncate text-muted-foreground">{project.name}</span>
            )}
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {project?.plans.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => {
                    if (pl.id === planId) return;
                    setProject((prev) =>
                      prev
                        ? {
                            ...prev,
                            plans: prev.plans.map((x) =>
                              x.id === planId ? { ...x, entities } : x,
                            ),
                          }
                        : prev,
                    );
                    setPlanId(pl.id);
                    setEntities(pl.entities);
                    setSelection([]);
                    past.current = [];
                    future.current = [];
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-2 py-1 font-mono text-[10px] tracking-widest transition-colors",
                    pl.id === planId ? "bg-accent/15 text-accent" : "text-muted-foreground",
                  )}
                >
                  {pl.name}
                </button>
              ))}
              {project && (
                <button
                  aria-label="Novo plano"
                  onClick={() => {
                    const plan = emptyPlan(project.plans.length);
                    plan.name = planLabel(project.plans.length);
                    const next: Project = {
                      ...project,
                      plans: [
                        ...project.plans.map((x) => (x.id === planId ? { ...x, entities } : x)),
                        plan,
                      ],
                      lastPlanId: plan.id,
                    };
                    saveProject(next);
                    setProject(next);
                    setPlanId(plan.id);
                    setEntities([]);
                    setSelection([]);
                    toast.success(`${plan.name} criado.`);
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-muted-foreground hover:text-accent"
                >
                  +
                </button>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconBtn label="Desfazer" onClick={undo} icon={Undo2} />
            <IconBtn label="Refazer" onClick={redo} icon={Redo2} />
            <IconBtn label="Enquadrar" onClick={() => fitTo(entities)} icon={ScanSearch} />
            <IconBtn
              label="Camadas"
              onClick={() => setShowLayers((s) => !s)}
              icon={LayersIcon}
              active={showLayers}
            />
            <IconBtn label="Exportar" onClick={() => setExportOpen(true)} icon={Download} />
            <div className="relative">
              <IconBtn label="Mais" onClick={() => setMoreOpen((m) => !m)} icon={MoreHorizontal} active={moreOpen} />
              {moreOpen && (
                <div className="metal hairline pop-in absolute top-10 right-0 z-30 w-48 rounded-2xl p-1.5">
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
                      found.length
                        ? toast.warning(`${found.length} problemas encontrados`)
                        : toast.success("Geometria válida");
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
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground">
                    <Upload className="size-3.5" /> Importar DXF/SVG
                    <input
                      type="file"
                      accept=".dxf,.svg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setImportSrc({ file, layer: activeLayer });
                        e.target.value = "";
                        setMoreOpen(false);
                      }}
                    />
                  </label>

                </div>
              )}
            </div>
            <IconBtn label="Foco" onClick={() => setFocus(true)} icon={Maximize} />
          </div>
        </header>
      )}

      {/* CORPO: TOOLBAR + CANVAS + PROPRIEDADES */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        {/* REGIÃO B — TOOLBAR ESQUERDA */}
        {!focus && (
          <div className="metal hairline flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto rounded-2xl p-1">
            {primaryTools.map((t) => (
              <ToolBtn key={t.id} t={t} active={tool === t.id} onPick={pickTool} />
            ))}
            <div className="my-1 h-px w-6 bg-line" />
            {extraTools.map((t) => (
              <ToolBtn key={t.id} t={t} active={tool === t.id} onPick={pickTool} />
            ))}
          </div>
        )}

        {panelSide === "left" && aside}

        {/* REGIÃO C — CANVAS */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl">
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
                  stroke="var(--grid-line)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            {showGrid && <rect width="100%" height="100%" fill="url(#lab2d-grid)" />}
          </svg>
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
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
              {/* CAMADA IMAGEM — referência do CHAMFER VISION (nunca vira geometria) */}
              {imageLayer && imageLayer.visible && outputMode === "completo" && (
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

              {/* eixos — cinza técnico discreto */}
              <line x1={-1e4} y1={0} x2={1e4} y2={0} stroke={AXIS_COLOR} strokeOpacity={0.5} strokeWidth={1 / view.k} />
              <line x1={0} y1={-1e4} x2={0} y2={1e4} stroke={AXIS_COLOR} strokeOpacity={0.5} strokeWidth={1 / view.k} />

              {/* geometria principal: pintada no canvas sob este SVG */}


              {draft && <EntityShape e={draft} k={view.k} preview />}

              {pending.length > 0 && tool === "polyline" && (
                <polyline
                  points={pending.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={PREVIEW_COLOR}
                  strokeWidth={1.4 / view.k}
                  strokeDasharray={`${4 / view.k} ${3 / view.k}`}
                />
              )}

              {/* nós da seleção */}
              {(tool === "node" || tool === "select") &&
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
                  strokeDasharray={marquee.b.x < marquee.a.x ? `${5 / view.k} ${4 / view.k}` : undefined}
                />
              )}

              {/* cotas — azul técnico fixo */}
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
                        strokeDasharray={d.kind === "radial" ? `${4 / view.k} ${3 / view.k}` : undefined}
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
                      liveMeasure && i === measures.length ? `${5 / view.k} ${4 / view.k}` : undefined
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
                    {(((Math.atan2(-(m.b.y - m.a.y), m.b.x - m.a.x) * 180) / Math.PI + 360) % 360).toFixed(1)}
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

          {zoomHud !== null && (
            <div className="metal pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 font-mono text-[11px] text-accent tabular-nums">
              {Math.round(zoomHud * 100)}%
            </div>
          )}

          {focus && (
            <button
              onClick={() => setFocus(false)}
              aria-label="Sair do foco"
              className="metal absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-xl text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* REGIÃO D — PAINEL DE PROPRIEDADES */}
        {panelSide === "right" && aside}
      </div>

      {/* REGIÃO E — STATUS BAR */}
      {!focus && (
        <div className="flex h-7 shrink-0 items-center gap-1.5 overflow-x-auto font-mono text-[10px] text-muted-foreground">
          <span className="shrink-0 rounded-full bg-background/40 px-2 py-0.5">
            X {cursor.x.toFixed(2)} · Y {cursor.y.toFixed(2)}
          </span>
          <button
            onClick={() => setSnapOn((s) => !s)}
            className={cn("shrink-0 rounded-full bg-background/40 px-2 py-0.5", snapOn && "text-accent")}
          >
            SNAP
          </button>
          <button
            onClick={() => setShowGrid((s) => !s)}
            className={cn("shrink-0 rounded-full bg-background/40 px-2 py-0.5", showGrid && "text-accent")}
          >
            GRID
          </button>
          <select
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
            aria-label="Espaçamento da grade"
            className="shrink-0 rounded-full bg-background/40 px-1.5 py-0.5 outline-none"
          >
            {[1, 5, 10, 25, 50].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {(tool === "offset" || tool === "fillet" || tool === "chamfer") && (
            <input
              type="number"
              inputMode="decimal"
              aria-label="Parâmetro da ferramenta"
              value={tool === "offset" ? offsetDist : filletR}
              onChange={(e) =>
                tool === "offset"
                  ? setOffsetDist(Number(e.target.value))
                  : setFilletR(Number(e.target.value))
              }
              className="w-16 shrink-0 rounded-full bg-background/40 px-2 py-0.5 text-center outline-none"
            />
          )}
          <span className="ml-auto shrink-0 rounded-full bg-background/40 px-2 py-0.5">
            {Math.round(view.k * 100)}%
          </span>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        layers={layers}
        projectName={project?.name ?? "CALDRA"}
        planName={project?.plans.find((p) => p.id === planId)?.name ?? "P01"}
        scopes={{
          selection: selected,
          plan: drawable,
          project: project
            ? project.plans.flatMap((p) => (p.id === planId ? drawable : p.entities))
            : drawable,
        }}
      />
      <ImportDialog
        source={importSrc}
        layers={layers}
        onClose={() => setImportSrc(null)}
        onConfirm={onImportConfirm}
      />
      <VisionDialog
        open={visionOpen}
        onOpenChange={setVisionOpen}
        onCreate={(next, image) => {
          setImageLayer(image);
          onImportConfirm(next);
        }}
      />
    </div>
  );
}


/* ------------------------------------------------------------ auxiliares */

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
      return e.closed ? <polygon key={key} points={d} {...p} /> : <polyline key={key} points={d} {...p} />;
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
}: {
  e: Entity;
  onChange: (e: Entity) => void;
  layers: Layer[];
  actions?: React.ReactNode;
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

  const info = (text: string) => (
    <p className="font-mono text-[10px] text-muted-foreground">{text}</p>
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
        {layers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {actions && <div className="flex flex-wrap gap-0.5 pt-1">{actions}</div>}
    </div>
  );
}

