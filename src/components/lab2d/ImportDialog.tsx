import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crosshair, FileSearch, LibraryBig, Minus, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/chameleon/ds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importDxf } from "@/lib/dxf/dxfService";
import { defaultValues, getGenerator } from "@/lib/cnc2d/generators";
import { PART_REGISTRY } from "@/lib/library/registry";
import { fromDxf, type Entity, type Layer } from "@/lib/lab2d/core";
import { renderSvg } from "@/lib/lab2d/render";
import { importSvg } from "@/lib/lab2d/svgio";

export type ImportSource = { file: File; layer: string };

type Origin = "menu" | "catalog" | "file";

/** Modelos CNC 2D do próprio CALDRA — geometria vetorial real, nunca imagem. */
const CATALOG = PART_REGISTRY.filter((m) => m.category === "cnc2d" && m.generator);

export function ImportDialog({ open, source, layer, layers, onSource, onClose, onConfirm }: {
  open: boolean;
  source: ImportSource | null;
  layer: string;
  layers: Layer[];
  onSource: (source: ImportSource) => void;
  onClose: () => void;
  onConfirm: (entities: Entity[]) => void;
}) {
  const [origin, setOrigin] = useState<Origin>("menu");
  const [modelId, setModelId] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const model = useMemo(() => CATALOG.find((m) => m.id === modelId) ?? null, [modelId]);

  useEffect(() => { if (open) { setOrigin(source ? "file" : "menu"); setModelId(null); } }, [open, source]);

  useEffect(() => {
    let alive = true;
    setEntities(null);
    setError(null);
    setView({ scale: 1, x: 0, y: 0 });
    if (model) {
      const gen = getGenerator(model.generator!);
      if (!gen) { setError("Modelo indisponível no catálogo."); return; }
      setEntities(gen.build(defaultValues(gen)));
      return;
    }
    if (!source) return;
    void (async () => {
      try {
        const text = await source.file.text();
        const isSvg = /\.svg$/i.test(source.file.name) || text.trimStart().startsWith("<");
        const next = isSvg ? importSvg(text, source.layer) : fromDxf(importDxf(text), source.layer);
        if (!alive) return;
        if (!next.length) throw new Error("Nenhuma geometria CNC 2D reconhecida no arquivo.");
        setEntities(next);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Arquivo inválido.");
      }
    })();
    return () => { alive = false; };
  }, [source, model]);

  const preview = useMemo(() => entities ? renderSvg(entities, layers, { dimensions: false, background: "white" }) : null, [entities, layers]);
  const layerNames = useMemo(() => [...new Set(entities?.map((entity) => layers.find((item) => item.id === entity.layer)?.name ?? entity.layer) ?? [])], [entities, layers]);
  const choose = (file?: File) => {
    if (!file) return;
    if (!/\.(dxf|svg)$/i.test(file.name)) { setError("Formato não aceito. Use DXF ou SVG vetorial."); return; }
    onSource({ file, layer });
  };
  const back = () => { setModelId(null); setEntities(null); setError(null); setOrigin("menu"); };

  const showPreview = preview && (model || source);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="metal flex max-h-[82dvh] w-[min(94vw,42rem)] max-w-none flex-col overflow-y-auto border-line">
        <DialogHeader><DialogTitle className="font-display text-lg">Importar Traçado CNC 2D</DialogTitle></DialogHeader>
        {origin === "menu" && !source ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setOrigin("catalog")} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-background/40 px-5 py-10 text-center transition-colors hover:border-accent">
              <LibraryBig className="size-6 text-accent" />
              <span className="font-medium text-foreground">Catálogo CNC 2D CALDRA</span>
              <span className="text-xs text-muted-foreground">{CATALOG.length} modelos vetoriais prontos</span>
            </button>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-background/40 px-5 py-10 text-center transition-colors hover:border-accent">
              <Upload className="size-6 text-accent" />
              <span className="font-medium text-foreground">Importar arquivo</span>
              <span className="font-mono text-[10px] text-muted-foreground">DXF · SVG VETORIAL</span>
              <span className="max-w-sm text-xs text-muted-foreground">Imagens PNG, JPG e outros formatos raster não são aceitos.</span>
              <input type="file" accept=".dxf,.svg,image/svg+xml" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        ) : origin === "catalog" && !model ? (
          <div className="space-y-3">
            <Button size="sm" onClick={back}><ArrowLeft className="size-3.5" /> Voltar</Button>
            <div className="grid max-h-[52dvh] gap-2 overflow-y-auto sm:grid-cols-2">
              {CATALOG.map((item) => (
                <button key={item.id} type="button" onClick={() => setModelId(item.id)} className="rounded-xl border border-line bg-background/40 p-3 text-left transition-colors hover:border-accent">
                  <span className="block font-medium text-foreground">{item.name}</span>
                  <span className="block font-mono text-[10px] uppercase text-accent">{item.family}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{item.summary}</span>
                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{item.specs.join(" · ")} · {item.id}</span>
                </button>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="space-y-3"><p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p><Button onClick={() => (model ? back() : onClose())}>Voltar</Button></div>
        ) : showPreview ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-foreground"><FileSearch className="size-4 text-accent" />{model ? model.name : "Análise concluída"}</span>
              <div className="flex gap-1"><Button size="sm" aria-label="Diminuir preview" onClick={() => setView((v) => ({ ...v, scale: Math.max(.5, v.scale / 1.2) }))}><Minus className="size-3.5" /></Button><Button size="sm" aria-label="Ajustar preview" onClick={() => setView({ scale: 1, x: 0, y: 0 })}><Crosshair className="size-3.5" /></Button><Button size="sm" aria-label="Ampliar preview" onClick={() => setView((v) => ({ ...v, scale: Math.min(8, v.scale * 1.2) }))}><Plus className="size-3.5" /></Button></div>
            </div>
            <div className="relative aspect-[4/3] touch-none overflow-hidden rounded-xl border border-line bg-white" onWheel={(e) => { e.preventDefault(); setView((v) => ({ ...v, scale: Math.min(8, Math.max(.5, v.scale * Math.exp(-e.deltaY * .0015))) })); }} onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }} onPointerUp={() => { drag.current = null; }}>
              <div className="grid size-full place-items-center p-3 [&_svg]:max-h-full [&_svg]:max-w-full" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} dangerouslySetInnerHTML={{ __html: preview.svg }} />
            </div>
            <div className="grid gap-1 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
              <span>{model ? `${model.family} · ${model.id}` : source?.file.name}</span><span>{preview.count} objetos</span><span>{preview.widthMm.toFixed(1)} × {preview.heightMm.toFixed(1)} mm</span><span>Layers: {layerNames.join(", ") || "—"}</span>
            </div>
            <div className="flex gap-2"><Button className="flex-1" onClick={() => (model ? back() : onClose())}>{model ? "Voltar" : "Cancelar"}</Button><Button variant="primary" className="flex-1" onClick={() => { if (!entities) return; onConfirm(entities); toast.success(`${entities.length} objetos inseridos no plano.`); onClose(); }}>Importar para o CHAMFER</Button></div>
          </>
        ) : (
          <p className="py-10 text-center font-mono text-[11px] text-muted-foreground">Analisando geometria vetorial…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
