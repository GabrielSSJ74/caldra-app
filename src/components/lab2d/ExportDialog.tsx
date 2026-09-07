import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadDxf } from "@/lib/dxf/dxfService";
import { toDxf, verify, type Entity, type Layer } from "@/lib/lab2d/core";
import { downloadSvg, renderSvg } from "@/lib/lab2d/render";
import { downloadSheetPdf, downloadSheetPng, renderSheet } from "@/lib/export/renderSheet";
import { cn } from "@/lib/utils";

type Format = "dxf" | "svg" | "png" | "pdf";
type Scope = "selection" | "plan" | "project";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "dxf", label: "DXF", hint: "CNC / CypCut" },
  { id: "svg", label: "SVG", hint: "Vetor" },
  { id: "png", label: "PNG", hint: "Imagem" },
  { id: "pdf", label: "PDF", hint: "Prancha" },
];

export function ExportDialog({
  open,
  onOpenChange,
  layers,
  scopes,
  projectName,
  planName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layers: Layer[];
  scopes: Record<Scope, Entity[]>;
  projectName: string;
  planName: string;
}) {
  const [format, setFormat] = useState<Format>("dxf");
  const [scope, setScope] = useState<Scope>("plan");
  const [dimensions, setDimensions] = useState(false);
  // curvas saem como SPLINE por padrão; achatar só para máquinas antigas
  const [flattenCurves, setFlattenCurves] = useState(false);

  const entities = scopes[scope];

  const preview = useMemo(
    () =>
      renderSvg(entities, layers, {
        dimensions,
        background: "white",
      }),
    [entities, layers, dimensions],
  );

  const issues = useMemo(() => verify(entities), [entities]);
  const filename = `${projectName}-${planName}`.replace(/\s+/g, "-").toLowerCase();

  const run = async () => {
    if (!entities.length) {
      toast.error("Nada para exportar neste escopo.");
      return;
    }
    try {
      if (format === "dxf") {
        if (issues.length) toast.warning(`${issues.length} avisos de geometria exportados assim mesmo.`);
        downloadDxf(toDxf(entities, layers, { flattenCurves }), filename);
      } else if (format === "svg") {
        downloadSvg(preview.svg, filename);
      } else {
        // PDF e PNG partem da MESMA pipeline de folha, redesenhada a partir do
        // modelo: zoom/pan da tela não influenciam o arquivo.
        const started = Date.now();
        const notify = window.setTimeout(
          () => toast.loading("Gerando folha…", { id: "sheet-export" }),
          1000,
        );
        await new Promise((r) => setTimeout(r, 0)); // libera a interface
        const plan = renderSheet(
          entities,
          layers,
          { project: projectName, plan: planName },
          { dimensions },
        );
        await new Promise((r) => setTimeout(r, 0));
        if (format === "png") await downloadSheetPng(plan);
        else await downloadSheetPdf(plan);
        window.clearTimeout(notify);
        if (Date.now() - started > 1000) toast.dismiss("sheet-export");
      }
      toast.success(`${format.toUpperCase()} gerado.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na exportação.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70dvh] w-[min(90vw,32rem)] max-w-none flex-col overflow-y-auto border border-border bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Exportar</DialogTitle>
        </DialogHeader>

        <div
          className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-border bg-white p-2 [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
          // prévia real do arquivo gerado
          dangerouslySetInnerHTML={{ __html: preview.svg }}
        />

        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={cn(
                "rounded-xl border border-border px-3 py-2 text-left transition-all active:scale-95",
                format === f.id && "border-accent/50 bg-accent/10 text-accent",
              )}
            >
              <span className="block font-mono text-[11px] tracking-widest">{f.label}</span>
              <span className="block text-[10px] text-muted-foreground">{f.hint}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
          {(["selection", "plan", "project"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              disabled={!scopes[s].length}
              className={cn(
                "rounded-full border border-border px-2.5 py-1 disabled:opacity-30",
                scope === s && "border-accent/50 text-accent",
              )}
            >
              {s === "selection" ? "Seleção" : s === "plan" ? "Plano" : "Projeto"}
            </button>
          ))}
          <button
            onClick={() => setDimensions((d) => !d)}
            className={cn(
              "rounded-full border border-border px-2.5 py-1",
              dimensions && "border-warn/60 text-warn",
            )}
          >
            Cotas
          </button>
          {format === "dxf" && entities.some((e) => e.type === "path") && (
            <button
              onClick={() => setFlattenCurves((v) => !v)}
              className={cn(
                "rounded-full border border-border px-2.5 py-1",
                flattenCurves && "border-warn/60 text-warn",
              )}
            >
              {flattenCurves ? "Curvas achatadas" : "Curvas como SPLINE"}
            </button>
          )}
        </div>

        <p className="font-mono text-[10px] text-muted-foreground">
          {projectName} · {planName} · {preview.count} objetos ·{" "}
          {preview.widthMm.toFixed(1)} × {preview.heightMm.toFixed(1)} mm · escala 1:1
        </p>

        {format === "dxf" && (
          <p className="font-mono text-[10px] text-muted-foreground">
            O DXF sai na ordem definida na aba CORTE; a direção de cada caminho é preservada.
          </p>
        )}

        {issues.length > 0 && (
          <p className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-[11px] text-warn">
            {issues.length} aviso(s): {Array.from(new Set(issues.map((i) => i.message))).join(" · ")}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={run}
            className="brand-gradient flex-1 rounded-xl py-2.5 font-display text-sm font-semibold text-background transition-transform active:scale-[0.98]"
          >
            Exportar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
