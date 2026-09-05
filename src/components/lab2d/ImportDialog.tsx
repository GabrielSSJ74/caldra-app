import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importDxf } from "@/lib/dxf/dxfService";
import { fromDxf, type Entity, type Layer } from "@/lib/lab2d/core";
import { renderSvg } from "@/lib/lab2d/render";
import { importSvg } from "@/lib/lab2d/svgio";

export type ImportSource = { file: File; layer: string };

/** Pré-visualização antes de inserir DXF/SVG como geometria editável. */
export function ImportDialog({
  source,
  layers,
  onClose,
  onConfirm,
}: {
  source: ImportSource | null;
  layers: Layer[];
  onClose: () => void;
  onConfirm: (entities: Entity[]) => void;
}) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setEntities(null);
    setError(null);
    if (!source) return;
    (async () => {
      try {
        const text = await source.file.text();
        const isSvg = /\.svg$/i.test(source.file.name) || text.trimStart().startsWith("<");
        const next = isSvg
          ? importSvg(text, source.layer)
          : fromDxf(importDxf(text), source.layer);
        if (!alive) return;
        if (!next.length) throw new Error("Nenhuma geometria reconhecida no arquivo.");
        setEntities(next);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Arquivo inválido.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [source]);

  const preview = useMemo(
    () => (entities ? renderSvg(entities, layers, { dimensions: false, background: "white" }) : null),
    [entities, layers],
  );

  return (
    <Dialog open={!!source} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass flex max-h-[70dvh] w-[min(90vw,32rem)] max-w-none flex-col overflow-y-auto border-0">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Importar</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : preview ? (
          <>
            <div
              className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-border bg-white p-2 [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: preview.svg }}
            />
            <p className="font-mono text-[10px] text-muted-foreground">
              {source?.file.name} · {preview.count} objetos ·{" "}
              {preview.widthMm.toFixed(1)} × {preview.heightMm.toFixed(1)} mm
            </p>
          </>
        ) : (
          <p className="py-10 text-center font-mono text-[11px] text-muted-foreground">Lendo arquivo…</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            disabled={!entities}
            onClick={() => {
              if (!entities) return;
              onConfirm(entities);
              toast.success(`${entities.length} objetos inseridos no plano.`);
              onClose();
            }}
            className="brand-gradient flex-1 rounded-xl py-2.5 font-display text-sm font-semibold text-background transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            Inserir
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
