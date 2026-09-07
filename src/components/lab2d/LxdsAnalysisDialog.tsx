/**
 * MODO ANÁLISE LXDS — inspeciona um arquivo .lxds real do CypCut.
 * Somente leitura: nada é importado no desenho e nada é escrito em LXDS.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { analyzeLxds, lxdsSize, type LxdsAnalysis } from "@/lib/lxds/lxdsAnalyzer";
import { compareToGolden, CYPCT_GOLDEN_SAMPLE_01 } from "@/lib/lxds/goldenSample";

export function LxdsAnalysisDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [a, setA] = useState<LxdsAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (file: File) => {
    setBusy(true);
    try {
      setA(await analyzeLxds(await file.arrayBuffer()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const size = a ? lxdsSize(a) : null;
  const rows = a ? compareToGolden(a) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70dvh] w-[min(90vw,34rem)] max-w-none flex-col gap-3 overflow-y-auto border border-border bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Analisar arquivo LXDS</DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground">
          Leitura de referência de um projeto do CypCut. O LXDS guarda geometria{" "}
          <em>e</em> parâmetros de processo — o DXF só carrega geometria. Nada é
          importado nem alterado.
        </p>

        <label className="cursor-pointer rounded-xl border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground hover:bg-secondary">
          {busy ? "Lendo…" : "Escolher arquivo .lxds"}
          <input
            type="file"
            accept=".lxds"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
            }}
          />
        </label>

        {a && (
          <div className="space-y-3 font-mono text-[10px]">
            <div className="rounded-xl border border-border px-3 py-2">
              <p className="mb-1 tracking-widest uppercase">Contêiner</p>
              <p className="text-muted-foreground">
                {a.app} {a.appVersion} · {a.docType} · {a.parts.length} partes ·{" "}
                {a.savedAt}
              </p>
              {size && (
                <p className="text-muted-foreground">
                  Extensões: {size.w.toFixed(1)} × {size.h.toFixed(1)} mm
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border px-3 py-2">
              <p className="mb-1 tracking-widest uppercase">Layers ({a.layers.length})</p>
              {a.layers.map((l) => (
                <p key={l.handle} className="text-muted-foreground">
                  {l.name} · handle {l.handle} · cor {l.color}
                </p>
              ))}
            </div>

            <div className="rounded-xl border border-border px-3 py-2">
              <p className="mb-1 tracking-widest uppercase">Entidades ({a.shapes.length})</p>
              {a.shapes.map((s) => (
                <p key={s.handle} className="text-muted-foreground">
                  {s.klass} · {s.layer} · handle {s.handle} · data {s.dataAddr} / geo{" "}
                  {s.geoAddr}
                </p>
              ))}
            </div>

            {a.technicalHighlights.length > 0 && (
              <div className="rounded-xl border border-border px-3 py-2">
                <p className="mb-1 tracking-widest uppercase">Processo (não vai no DXF)</p>
                {a.technicalHighlights.map((t) => (
                  <p key={t.key} className="text-muted-foreground">
                    {t.key} = {t.value}
                  </p>
                ))}
                <p className="mt-1 text-muted-foreground">
                  Blocos: {a.technicalBlocks.slice(0, 12).join(" · ")}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border px-3 py-2">
              <p className="mb-1 tracking-widest uppercase">
                Comparação com {CYPCT_GOLDEN_SAMPLE_01.id}
              </p>
              {rows.map((r) => (
                <p key={r.field} className={r.ok ? "text-muted-foreground" : "text-warn"}>
                  {r.ok ? "✓" : "≠"} {r.field}: {r.actual}
                  {!r.ok && ` (referência ${r.expected})`}
                </p>
              ))}
            </div>

            {a.warnings.length > 0 && (
              <ul className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-warn">
                {a.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          onClick={() => onOpenChange(false)}
          className="rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
        >
          Fechar
        </button>
      </DialogContent>
    </Dialog>
  );
}
