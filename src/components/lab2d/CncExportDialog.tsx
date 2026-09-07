/**
 * EXPORTAR DXF CNC — diálogo de pré-exportação.
 * O DXF completo continua existindo e não é afetado por este caminho.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportDxf } from "@/lib/dxf/dxfService";
import {
  DEFAULT_CNC_OPTIONS,
  buildCncDxf,
  cncCounts,
  cncCutLength,
  verifyCncDxf,
  type CncExportOptions,
} from "@/lib/dxf/cncExport";
import { CNC_LAYER_HINT, validateManufacturing, type CncLayer } from "@/lib/lab2d/manufacturing";
import type { Entity } from "@/lib/lab2d/core";
import { cn } from "@/lib/utils";
import { LxdsAnalysisDialog } from "@/components/lab2d/LxdsAnalysisDialog";

const LAYERS: CncLayer[] = ["CUT", "MARK", "BEND", "REFERENCE", "DIMENSION"];

export function CncExportDialog({
  open,
  onOpenChange,
  entities,
  filename,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entities: Entity[];
  filename: string;
}) {
  const [opts, setOpts] = useState<CncExportOptions>(DEFAULT_CNC_OPTIONS);
  const [lxdsOpen, setLxdsOpen] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof verifyCncDxf> | null>(null);

  const counts = useMemo(() => cncCounts(entities), [entities]);
  const issues = useMemo(() => validateManufacturing(entities), [entities]);
  const errors = issues.filter((i) => i.level === "error");

  const toggle = (l: CncLayer) =>
    setOpts((o) => ({ ...o, layers: { ...o.layers, [l]: !o.layers[l] } }));

  const run = () => {
    if (errors.length) {
      toast.error("Erro de fabricação — corrija antes de exportar.");
      return;
    }
    const doc = buildCncDxf(entities, opts);
    if (!doc.entities.length) {
      toast.error("Nenhuma geometria nas layers escolhidas.");
      return;
    }
    const text = exportDxf(doc);
    const check = verifyCncDxf(entities, opts, text);
    setReport(check);
    const blob = new Blob([text], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-cnc.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    if (check.ok) toast.success("DXF CNC gerado e conferido.");
    else toast.warning("DXF CNC gerado com divergências — veja a conferência.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70dvh] w-[min(90vw,32rem)] max-w-none flex-col gap-3 overflow-y-auto border border-border bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Exportar DXF CNC</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {LAYERS.map((l) => {
            const n = counts[l];
            const on = opts.layers[l];
            return (
              <button
                key={l}
                onClick={() => toggle(l)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left transition-colors",
                  on ? "border-accent/50 bg-accent/10" : "opacity-60",
                )}
              >
                <span className="font-mono text-[11px] tracking-widest">{l}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {n} {l === "CUT" ? `elementos · ${counts.contours} contornos` : "elementos"}
                </span>
                <span className="ml-auto font-mono text-[9px] text-muted-foreground uppercase">
                  {on ? "exportar" : "não exportado"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 font-mono text-[10px] tracking-wider uppercase">
          <button
            onClick={() => setOpts((o) => ({ ...o, leads: !o.leads }))}
            className={cn(
              "rounded-full border border-border px-2.5 py-1",
              opts.leads && "border-accent/50 text-accent",
            )}
          >
            Lead-in {counts.leadIn} · Lead-out {counts.leadOut}
          </button>
          <button
            onClick={() => setOpts((o) => ({ ...o, flattenCurves: !o.flattenCurves }))}
            className={cn(
              "rounded-full border border-border px-2.5 py-1",
              opts.flattenCurves && "border-warn/60 text-warn",
            )}
          >
            {opts.flattenCurves ? "Curvas achatadas" : "Curvas como SPLINE"}
          </button>
        </div>

        <p className="font-mono text-[10px] text-muted-foreground">
          mm · escala 1:1 · {cncCutLength(entities).toFixed(1)} mm de corte · ordem planejada
          preservada na estrutura do arquivo.
        </p>

        <p className="rounded-xl border border-border px-3 py-2 text-[11px] text-muted-foreground">
          Na importação, verifique o mapeamento das layers CNC:{" "}
          {LAYERS.slice(0, 3)
            .map((l) => `${l} → ${CNC_LAYER_HINT[l]}`)
            .join(" · ")}
          . A configuração da máquina prevalece.
        </p>

        {issues.length > 0 && (
          <ul className="space-y-0.5 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-[11px] text-warn">
            {issues.slice(0, 6).map((i, k) => (
              <li key={k}>
                {i.level === "error" ? "ERRO DE FABRICAÇÃO" : "Aviso"} · {i.scope}: {i.message}
              </li>
            ))}
          </ul>
        )}

        {report && (
          <div className="rounded-xl border border-border px-3 py-2 font-mono text-[10px]">
            <p className="mb-1 tracking-widest uppercase">Conferência do arquivo</p>
            {report.rows.map((r) => (
              <p key={r.field} className={r.ok ? "text-muted-foreground" : "text-warn"}>
                {r.ok ? "✓" : "✗"} {r.field}: {r.actual}
                {!r.ok && ` (esperado ${r.expected})`}
              </p>
            ))}
          </div>
        )}

        <button
          onClick={() => setLxdsOpen(true)}
          className="rounded-xl border border-border px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-secondary"
        >
          Analisar arquivo LXDS do CypCut (referência técnica, somente leitura)
        </button>
        <LxdsAnalysisDialog open={lxdsOpen} onOpenChange={setLxdsOpen} />

        <div className="flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            Fechar
          </button>
          <button
            onClick={run}
            className="brand-gradient flex-1 rounded-xl py-2.5 font-display text-sm font-semibold text-background transition-transform active:scale-[0.98]"
          >
            Exportar DXF CNC
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
