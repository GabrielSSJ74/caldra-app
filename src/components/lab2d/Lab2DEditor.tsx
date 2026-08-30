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
  MousePointer2,
  Move3d,
  PenLine,
  Redo2,
  RotateCw,
  Ruler,
  ScanSearch,
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
import {
  emptyPlan,
  getProject,
  planLabel,
  saveProject,
  type Project,
} from "@/lib/lab2d/projects";
import { takeHandoff } from "@/lib/lab2d/handoff";
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
  const [pending, setPending] = useState<Vec2[]>([]);
  const [draft, setDraft] = useState<Entity | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [liveMeasure, setLiveMeasure] = useState<Measure | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importSrc, setImportSrc] = useState<ImportSource | null>(null);
  const [issues, setIssues] = useState<{ message: string; p: Vec2 }[] | null>(null);
  const [offsetDist, setOffsetDist] = useState(5);
  const [filletR, setFilletR] = useState(10);
  const [dragNode, setDragNode] = useState<{ id: string; index: number } | null>(null);
  const past = useRef<Entity[][]>([]);
  const future = useRef<Entity[][]>([]);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const moveRef = useRef<{ from: Vec2; ids: string[]; base: Entity[] } | null>(null);

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
    past.current = [];
    future.current = [];
  }, [projectId]);

  useEffect(() => {
    if (!project || !planId) return;
    const t = setTimeout(() => {
      const next: Project = {
        ...project,
        layers,
        lastPlanId: planId,
        plans: project.plans.map((pl) => (pl.id === planId ? { ...pl, entities } : pl)),
      };
      saveProject(next);
      setProject(next);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, layers, planId]);

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
    toast.success(`${h.name} carregado no laboratório.`);
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
  viewRef.current = view;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1);
      const r = el.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const py = ev.clientY - r.top;
      const v = viewRef.current;
      const next = Math.min(30, Math.max(0.05, v.k * Math.exp(-dy * 0.0015)));
      const ratio = next / v.k;
      setView({ k: next, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------------------------------------------------------- utilidades */
  const visible = useMemo(
    () => entities.filter((e) => layerOf(e.layer)?.visible !== false),
    [entities, layerOf],
  );

  const hitTest = useCallback(
    (p: Vec2): Entity | null => {
      const tol = 6 / view.k;
      let best: { e: Entity; d: number } | null = null;
      for (const e of visible) {
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
    [visible, view.k, layerOf],
  );

  const snapPoint = useCallback(
    (p: Vec2): Vec2 => {
      if (!snapOn) return p;
      const s = findSnap(p, visible, 10 / view.k, grid, { grid: showGrid, object: true });
      return s ? s.p : p;
    },
    [snapOn, visible, view.k, grid, showGrid],
  );

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
    const raw = toWorld(ev);
    const p = snapPoint(raw);

    if (tool === "pan" || ev.button === 1) {
      panRef.current = { x: ev.clientX, y: ev.clientY };
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
        setSelection((s) =>
          ev.shiftKey
            ? s.includes(hit.id)
              ? s.filter((i) => i !== hit.id)
              : [...s, hit.id]
            : s.includes(hit.id)
              ? s
              : [hit.id],
        );
        if (tool === "select")
          moveRef.current = {
            from: raw,
            ids: selection.includes(hit.id) ? selection : [hit.id],
            base: entities,
          };
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
    const raw = toWorld(ev);
    setCursor(raw);
    if (snapOn) {
      const s = findSnap(raw, visible, 10 / view.k, grid, { grid: showGrid, object: true });
      setSnapHit(s);
    }
    if (panRef.current) {
      const dx = ev.clientX - panRef.current.x;
      const dy = ev.clientY - panRef.current.y;
      panRef.current = { x: ev.clientX, y: ev.clientY };
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      return;
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

  const onPointerUp = () => {
    panRef.current = null;
    if (dragNode) {
      setDragNode(null);
      past.current = [...past.current, entities];
      return;
    }
    if (moveRef.current) {
      const base = moveRef.current.base;
      moveRef.current = null;
      past.current = [...past.current, base];
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
      setSelection((s) => Array.from(new Set([...s, ...hits])));
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
    commit((list) => list.map((e) => (selection.includes(e.id) ? fn(e) : e)));

  const selBox = useMemo(() => bbox(selected), [selected]);
  const center: Vec2 = selBox
    ? { x: (selBox.minX + selBox.maxX) / 2, y: (selBox.minY + selBox.maxY) / 2 }
    : { x: 0, y: 0 };

  const onImportConfirm = (next: Entity[]) => {
    commit((e) => [...e, ...next]);
    requestAnimationFrame(() => fitTo([...entities, ...next]));
  };


  const gridStep = grid * view.k < 6 ? grid * 10 : grid;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "glass relative overflow-hidden rounded-3xl",
        isMestre && "glow-ring",
        focus ? "fixed inset-0 z-50 rounded-none" : "h-[68vh] min-h-[440px]",
      )}
    >
      {/* CANVAS */}
      <svg
        ref={svgRef}
        className="size-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => tool === "polyline" && finishPolyline(false)}
        role="application"
        aria-label="Prancheta vetorial"
      >
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

        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {/* eixos */}
          <line x1={-1e4} y1={0} x2={1e4} y2={0} stroke="var(--accent)" strokeOpacity={0.18} strokeWidth={1 / view.k} />
          <line x1={0} y1={-1e4} x2={0} y2={1e4} stroke="var(--accent)" strokeOpacity={0.18} strokeWidth={1 / view.k} />

          {visible.map((e) => (
            <EntityShape
              key={e.id}
              e={e}
              color={layerOf(e.layer)?.color ?? "var(--foreground)"}
              k={view.k}
              selected={selection.includes(e.id)}
            />
          ))}

          {draft && <EntityShape e={draft} color="var(--accent)" k={view.k} selected ghost />}

          {pending.length > 0 && tool === "polyline" && (
            <polyline
              points={pending.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--accent)"
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
                  className="fill-background stroke-accent"
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
              stroke="var(--accent)"
              strokeOpacity={0.45}
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
              className={marquee.b.x < marquee.a.x ? "fill-accent2/10" : "fill-accent/10"}
              stroke="var(--accent)"
              strokeWidth={1 / view.k}
              strokeDasharray={marquee.b.x < marquee.a.x ? `${5 / view.k} ${4 / view.k}` : undefined}
            />
          )}

          {/* cotas de conferência */}
          {showDims &&
            autoDimensions(visible).map((d, i) => {
              const mx = (d.a.x + d.b.x) / 2;
              const my = (d.a.y + d.b.y) / 2;
              const ang = (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
              const flip = ang > 90 || ang < -90 ? 180 : 0;
              return (
                <g key={`dim-${i}`} stroke="var(--warn)" fill="var(--warn)">
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
            <g key={i} className="text-accent">
              <line
                x1={m.a.x}
                y1={m.a.y}
                x2={m.b.x}
                y2={m.b.y}
                stroke="currentColor"
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
                fill="currentColor"
                className="font-mono"
              >
                {dist(m.a, m.b).toFixed(2)} mm ·{" "}
                {(((Math.atan2(-(m.b.y - m.a.y), m.b.x - m.a.x) * 180) / Math.PI + 360) % 360).toFixed(
                  1,
                )}
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
              stroke="var(--warn)"
              strokeWidth={1.5 / view.k}
            />
          ))}

          {snapHit && (
            <text
              x={snapHit.p.x}
              y={snapHit.p.y + 4 / view.k}
              fontSize={12 / view.k}
              textAnchor="middle"
              fill="var(--accent)"
            >
              {SNAP_GLYPH[snapHit.kind]}
            </text>
          )}
        </g>
      </svg>

      {/* RÉGUAS */}
      <Rulers view={view} />

      {/* FERRAMENTAS */}
      {!focus && (
        <div className="glass absolute top-1/2 left-2 z-10 flex max-h-[86%] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto rounded-2xl p-1 backdrop-blur-xl">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setPending([]);
                setDraft(null);
              }}
              title={`${t.label} · ${t.key}`}
              aria-label={t.label}
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl transition-all",
                tool === t.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-[15px]" />
            </button>
          ))}
        </div>
      )}

      {/* AÇÕES */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {!focus && (
          <>
            <IconBtn label="Desfazer" onClick={undo} icon={Undo2} />
            <IconBtn label="Refazer" onClick={redo} icon={Redo2} />
            <IconBtn label="Enquadrar" onClick={() => fitTo(entities)} icon={ScanSearch} />
            <IconBtn
              label="Verificar geometria"
              onClick={() => {
                const found = verify(entities);
                setIssues(found);
                found.length
                  ? toast.warning(`${found.length} problemas encontrados`)
                  : toast.success("Geometria válida");
              }}
              icon={Triangle}
            />
            <IconBtn
              label="Otimizar"
              onClick={() => {
                const res = optimize(entities);
                commit(res.entities);
                toast.success(`${res.removed + res.tiny} entidades limpas`);
              }}
              icon={Spline}
            />
            <IconBtn label="Layers" onClick={() => setShowLayers((s) => !s)} icon={LayersIcon} />
            <IconBtn
              label={showDims ? "Ocultar medidas" : "Mostrar medidas"}
              onClick={() => setShowDims((s) => !s)}
              icon={Ruler}
            />
            <label
              title="Importar DXF/SVG"
              className="glass grid size-8 cursor-pointer place-items-center rounded-xl text-muted-foreground hover:text-foreground"
            >
              <Upload className="size-[15px]" />
              <input
                type="file"
                accept=".dxf,.svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setImportSrc({ file, layer: activeLayer });
                  e.target.value = "";
                }}
              />
            </label>
            <IconBtn label="Exportar" onClick={() => setExportOpen(true)} icon={Download} />

          </>
        )}
        <IconBtn label="Foco" onClick={() => setFocus((f) => !f)} icon={focus ? X : Maximize} />
      </div>

      {/* CONTEXTUAL */}
      {selection.length > 0 && !focus && (
        <div className="glass pop-in absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl p-1 backdrop-blur-xl">
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
        </div>
      )}

      {/* PROPRIEDADES */}
      {selected.length === 1 && !focus && (
        <Properties
          e={selected[0]!}
          onChange={(next) => commit((list) => list.map((x) => (x.id === next.id ? next : x)))}
          layers={layers}
        />
      )}

      {/* LAYERS */}
      {showLayers && !focus && (
        <div className="glass pop-in absolute top-12 right-2 z-20 w-52 rounded-2xl p-2 backdrop-blur-xl">
          {layers.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5 rounded-xl px-1.5 py-1">
              <button
                onClick={() => setActiveLayer(l.id)}
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  activeLayer === l.id && "ring-2 ring-accent/50 ring-offset-1 ring-offset-background",
                )}
                style={{ background: l.color }}
                aria-label={`Camada ativa: ${l.name}`}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">{l.name}</span>
              <button
                aria-label={l.visible ? "Ocultar" : "Mostrar"}
                onClick={() =>
                  setLayers((ls) => ls.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)))
                }
                className="text-muted-foreground hover:text-foreground"
              >
                {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
              <button
                aria-label={l.locked ? "Desbloquear" : "Bloquear"}
                onClick={() =>
                  setLayers((ls) => ls.map((x) => (x.id === l.id ? { ...x, locked: !x.locked } : x)))
                }
                className="text-muted-foreground hover:text-foreground"
              >
                {l.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BARRA INFERIOR */}
      <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span className="glass rounded-full px-2.5 py-1">
          X {cursor.x.toFixed(2)} · Y {cursor.y.toFixed(2)} mm
        </span>
        {!focus && (
          <>
            <button
              onClick={() => setSnapOn((s) => !s)}
              className={cn("glass rounded-full px-2.5 py-1", snapOn && "text-accent")}
            >
              SNAP
            </button>
            <button
              onClick={() => setShowGrid((s) => !s)}
              className={cn("glass rounded-full px-2.5 py-1", showGrid && "text-accent")}
            >
              GRID
            </button>
            <select
              value={grid}
              onChange={(e) => setGrid(Number(e.target.value))}
              aria-label="Espaçamento da grade"
              className="glass rounded-full bg-transparent px-2 py-1 outline-none"
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
                aria-label="Parâmetro da ferramenta"
                value={tool === "offset" ? offsetDist : filletR}
                onChange={(e) =>
                  tool === "offset"
                    ? setOffsetDist(Number(e.target.value))
                    : setFilletR(Number(e.target.value))
                }
                className="glass w-16 rounded-full bg-transparent px-2 py-1 text-center outline-none"
              />
            )}
          </>
        )}
        <span className="ml-auto glass rounded-full px-2.5 py-1">{Math.round(view.k * 100)}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ auxiliares */

function IconBtn({
  label,
  onClick,
  icon: Icon,
  flat,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Minus;
  flat?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:text-accent",
        !flat && "glass",
      )}
    >
      <Icon className="size-[15px]" />
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

export function EntityShape({
  e,
  color,
  k,
  selected,
  ghost,
}: {
  e: Entity;
  color: string;
  k: number;
  selected?: boolean;
  ghost?: boolean;
}) {
  const stroke = selected ? "var(--accent)" : color;
  const props = {
    fill: "none",
    stroke,
    strokeWidth: (selected ? 2 : 1.4) / k,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeDasharray: ghost ? `${5 / k} ${4 / k}` : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (e.type === "line") return <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...props} />;
  if (e.type === "circle") return <circle cx={e.cx} cy={e.cy} r={e.r} {...props} />;
  if (e.type === "polyline") {
    const d = e.pts.map((p) => `${p.x},${p.y}`).join(" ");
    return e.closed ? <polygon points={d} {...props} /> : <polyline points={d} {...props} />;
  }
  if (e.type === "arc") {
    const p0 = { x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0) };
    const p1 = { x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1) };
    let sweep = e.a1 - e.a0;
    while (sweep < 0) sweep += Math.PI * 2;
    return (
      <path
        d={`M ${p0.x} ${p0.y} A ${e.r} ${e.r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p1.x} ${p1.y}`}
        {...props}
      />
    );
  }
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

function Properties({
  e,
  onChange,
  layers,
}: {
  e: Entity;
  onChange: (e: Entity) => void;
  layers: Layer[];
}) {
  const field = (label: string, value: number, set: (n: number) => void) => (
    <label key={label} className="flex items-center justify-between gap-2">
      <span className="font-mono text-[9px] text-muted-foreground uppercase">{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(2))}
        onChange={(ev) => set(Number(ev.target.value))}
        className="w-20 rounded-lg border border-line bg-background/40 px-1.5 py-0.5 text-right font-mono text-[11px] outline-none"
      />
    </label>
  );

  return (
    <div className="glass pop-in absolute right-2 bottom-10 z-10 w-44 space-y-1.5 rounded-2xl p-2.5 backdrop-blur-xl">
      <p className="font-mono text-[9px] tracking-[0.2em] text-accent uppercase">{e.type}</p>
      {e.type === "circle" && (
        <>
          {field("X", e.cx, (n) => onChange({ ...e, cx: n }))}
          {field("Y", e.cy, (n) => onChange({ ...e, cy: n }))}
          {field("R", e.r, (n) => onChange({ ...e, r: n }))}
          {field("Ø", e.r * 2, (n) => onChange({ ...e, r: n / 2 }))}
        </>
      )}
      {e.type === "line" && (
        <>
          {field("X1", e.x1, (n) => onChange({ ...e, x1: n }))}
          {field("Y1", e.y1, (n) => onChange({ ...e, y1: n }))}
          {field("X2", e.x2, (n) => onChange({ ...e, x2: n }))}
          {field("Y2", e.y2, (n) => onChange({ ...e, y2: n }))}
          <p className="text-right font-mono text-[10px] text-muted-foreground">
            {Math.hypot(e.x2 - e.x1, e.y2 - e.y1).toFixed(2)} mm ·{" "}
            {((Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180) / Math.PI).toFixed(1)}°
          </p>
        </>
      )}
      {e.type === "arc" && (
        <>
          {field("X", e.cx, (n) => onChange({ ...e, cx: n }))}
          {field("Y", e.cy, (n) => onChange({ ...e, cy: n }))}
          {field("R", e.r, (n) => onChange({ ...e, r: n }))}
        </>
      )}
      {e.type === "polyline" && (
        <p className="font-mono text-[10px] text-muted-foreground">
          {e.pts.length} nós · {e.closed ? "fechada" : "aberta"}
        </p>
      )}
      <select
        value={e.layer}
        onChange={(ev) => onChange({ ...e, layer: ev.target.value })}
        aria-label="Camada"
        className="w-full rounded-lg border border-line bg-background/40 px-1.5 py-1 font-mono text-[10px] outline-none"
      >
        {layers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
