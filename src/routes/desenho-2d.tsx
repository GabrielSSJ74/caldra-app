import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Circle, Download, Minus, MousePointer2, Square, Trash2, Upload } from "lucide-react";
import { downloadDxf, importDxf, type DxfEntity } from "@/lib/dxf/dxfService";
import { FeatureGate, Panel, SectionLabel } from "@/components/chameleon/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/desenho-2d")({
  head: () => ({
    meta: [
      { title: "Desenho 2D — CHAMELEON Caldeireiro" },
      {
        name: "description",
        content: "Editor vetorial 2D com grade métrica, snap e exportação DXF para caldeiraria.",
      },
      { property: "og:title", content: "Desenho 2D — CHAMELEON Caldeireiro" },
      {
        property: "og:description",
        content: "Desenhe croquis técnicos em escala real e exporte em DXF.",
      },
    ],
  }),
  component: Lab2DPage,
});

function Lab2DPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Laboratório 2D</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Croqui vetorial em escala real: linhas, retângulos e círculos com snap na grade métrica.
        </p>
      </header>
      <FeatureGate
        feature="lab2d"
        title="Editor 2D no Modo Mestre"
        description="O laboratório vetorial faz parte do pacote Mestre. Ative com seu código de acesso para desenhar e exportar em DXF."
      >
        <Editor />
      </FeatureGate>
    </div>
  );
}

type Tool = "select" | "line" | "rect" | "circle";
type Shape =
  | { id: string; type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; type: "rect"; x: number; y: number; w: number; h: number }
  | { id: string; type: "circle"; cx: number; cy: number; r: number };

const VIEW_W = 1200;
const VIEW_H = 760;
const uid = () => Math.random().toString(36).slice(2, 9);

function Editor() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("line");
  const [grid, setGrid] = useState(20);
  const [snap, setSnap] = useState(true);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const point = useCallback(
    (e: React.PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
      return snap
        ? { x: Math.round(x / grid) * grid, y: Math.round(y / grid) * grid }
        : { x: Math.round(x), y: Math.round(y) };
    },
    [grid, snap],
  );

  const remove = useCallback((id: string | null) => {
    if (!id) return;
    setShapes((s) => s.filter((x) => x.id !== id));
    setSelected(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected) remove(selected);
      if (e.key === "Escape") {
        setDraft(null);
        setStart(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, remove]);

  const build = (a: { x: number; y: number }, b: { x: number; y: number }): Shape => {
    if (tool === "rect")
      return {
        id: uid(),
        type: "rect",
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
      };
    if (tool === "circle")
      return { id: uid(), type: "circle", cx: a.x, cy: a.y, r: Math.hypot(b.x - a.x, b.y - a.y) };
    return { id: uid(), type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };

  const down = (e: React.PointerEvent) => {
    if (tool === "select") return;
    const p = point(e);
    setStart(p);
    setDraft(build(p, p));
  };
  const move = (e: React.PointerEvent) => {
    if (!start) return;
    setDraft(build(start, point(e)));
  };
  const up = () => {
    if (draft) {
      const empty =
        (draft.type === "line" && draft.x1 === draft.x2 && draft.y1 === draft.y2) ||
        (draft.type === "rect" && (draft.w === 0 || draft.h === 0)) ||
        (draft.type === "circle" && draft.r === 0);
      if (!empty) setShapes((s) => [...s, draft]);
    }
    setDraft(null);
    setStart(null);
  };

  const toEntities = (): DxfEntity[] =>
    shapes.map((s) =>
      s.type === "line"
        ? { type: "LINE", layer: "DESENHO", start: { x: s.x1, y: -s.y1 }, end: { x: s.x2, y: -s.y2 } }
        : s.type === "rect"
          ? {
              type: "LWPOLYLINE",
              layer: "DESENHO",
              closed: true,
              points: [
                { x: s.x, y: -s.y },
                { x: s.x + s.w, y: -s.y },
                { x: s.x + s.w, y: -(s.y + s.h) },
                { x: s.x, y: -(s.y + s.h) },
              ],
            }
          : { type: "CIRCLE", layer: "DESENHO", center: { x: s.cx, y: -s.cy }, radius: s.r },
    );

  const onImport = async (file: File) => {
    try {
      const doc = importDxf(await file.text());
      const next: Shape[] = [];
      for (const e of doc.entities) {
        if (e.type === "LINE")
          next.push({ id: uid(), type: "line", x1: e.start.x, y1: -e.start.y, x2: e.end.x, y2: -e.end.y });
        if (e.type === "CIRCLE")
          next.push({ id: uid(), type: "circle", cx: e.center.x, cy: -e.center.y, r: e.radius });
        if (e.type === "LWPOLYLINE")
          for (let i = 0; i < e.points.length - (e.closed ? 0 : 1); i++) {
            const a = e.points[i];
            const b = e.points[(i + 1) % e.points.length];
            next.push({ id: uid(), type: "line", x1: a.x, y1: -a.y, x2: b.x, y2: -b.y });
          }
      }
      setShapes((s) => [...s, ...next]);
      toast.success(`${next.length} entidades importadas.`);
    } catch {
      toast.error("Não foi possível ler este arquivo DXF.");
    }
  };

  const TOOLS: { id: Tool; icon: typeof Minus; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "Selecionar" },
    { id: "line", icon: Minus, label: "Linha" },
    { id: "rect", icon: Square, label: "Retângulo" },
    { id: "circle", icon: Circle, label: "Círculo" },
  ];

  return (
    <Panel className="p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-line bg-background/40 p-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              aria-label={t.label}
              className={cn(
                "grid size-8 place-items-center rounded-lg transition-colors",
                tool === t.id ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4" />
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-line bg-background/40 px-2.5 py-1.5">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          <span className="font-mono text-[10px] text-muted-foreground uppercase">Snap</span>
          <select
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
            className="bg-transparent font-mono text-[11px] outline-none"
          >
            {[5, 10, 20, 50].map((g) => (
              <option key={g} value={g}>
                {g} mm
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-1.5">
          <label className="glass flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 font-mono text-[11px]">
            <Upload className="size-3.5" /> DXF
            <input
              type="file"
              accept=".dxf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            />
          </label>
          <button
            onClick={() => {
              if (!shapes.length) return toast.error("Desenhe algo antes de exportar.");
              downloadDxf(
                { layers: [{ name: "DESENHO", color: 3 }], entities: toEntities() },
                "chameleon-desenho-2d",
              );
              toast.success("DXF exportado.");
            }}
            className="flex items-center gap-1.5 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent"
          >
            <Download className="size-3.5" /> Exportar
          </button>
          <button
            onClick={() => {
              setShapes([]);
              setSelected(null);
            }}
            aria-label="Limpar desenho"
            className="glass grid size-9 place-items-center rounded-xl text-muted-foreground"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="h-[420px] w-full touch-none rounded-xl border border-line bg-background/50 lg:h-[560px]"
        role="application"
        aria-label="Área de desenho vetorial"
      >
        <defs>
          <pattern id="lab-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <path
              d={`M ${grid} 0 L 0 0 0 ${grid}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth="0.7"
            />
          </pattern>
        </defs>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#lab-grid)" />
        {[...shapes, ...(draft ? [draft] : [])].map((s) => {
          const active = s.id === selected;
          const props = {
            fill: "none",
            stroke: active ? "var(--warn)" : "var(--accent)",
            strokeWidth: active ? 2.6 : 1.8,
            onPointerDown: (e: React.PointerEvent) => {
              if (tool !== "select") return;
              e.stopPropagation();
              setSelected(s.id);
            },
            style: { cursor: tool === "select" ? "pointer" : "crosshair" },
          };
          if (s.type === "line")
            return <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...props} />;
          if (s.type === "rect")
            return <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} {...props} />;
          return <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} {...props} />;
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>{shapes.length} entidades</SectionLabel>
        <p className="font-mono text-[10px] text-muted-foreground">
          Arraste para desenhar · Esc cancela · Delete remove o selecionado
        </p>
      </div>
    </Panel>
  );
}
