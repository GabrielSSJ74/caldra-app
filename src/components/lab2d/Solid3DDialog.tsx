/**
 * CHAMFER — ESPESSURA E VISTA 3D.
 *
 * O desenho vetorial 2D é o único dado: os contornos fechados da camada CORTE
 * são extrudados pela espessura da chapa e apresentados pelo MESMO motor 3D
 * usado nos projetos do CALDRA. Nenhum modelo paralelo é criado.
 */

import { useMemo, useState } from "react";
import { Box } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Model3DViewer, type ViewKey } from "@/components/projects/catalog/Model3DViewer";
import type { Entity } from "@/lib/lab2d/core";
import { planArea, planSolids } from "@/lib/lab2d/solid3d";
import type { SolidMaterial } from "@/lib/project-catalog/instances";
import { cn } from "@/lib/utils";

const VIEWS: { id: ViewKey; label: string }[] = [
  { id: "iso", label: "ISO" },
  { id: "frontal", label: "FRENTE" },
  { id: "superior", label: "TOPO" },
  { id: "esquerda", label: "LADO" },
];

const MATERIALS: { id: SolidMaterial; label: string }[] = [
  { id: "aco", label: "Aço" },
  { id: "aco-pintado", label: "Aço pintado" },
  { id: "aluminio", label: "Alumínio" },
];

export function Solid3DDialog({
  open,
  onOpenChange,
  entities,
  thickness,
  onThickness,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entities: Entity[];
  thickness: number;
  onThickness: (v: number) => void;
}) {
  const [material, setMaterial] = useState<SolidMaterial>("aco");
  const [view, setView] = useState<ViewKey>("iso");
  const [viewNonce, setViewNonce] = useState(0);
  const [ortho, setOrtho] = useState(false);

  const instances = useMemo(
    () => (open ? planSolids(entities, thickness, material) : []),
    [open, entities, thickness, material],
  );
  const area = useMemo(() => (open ? planArea(entities) : 0), [open, entities]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] w-[min(92vw,720px)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-lg">
            <Box className="size-4 text-accent" /> Espessura e vista 3D
          </DialogTitle>
        </DialogHeader>

        {instances.length === 0 ? (
          <p className="rounded-xl border border-line bg-background/40 p-4 text-xs text-muted-foreground">
            Nenhum contorno fechado na camada CORTE. Feche o perfil da peça para gerar o sólido.
          </p>
        ) : (
          <div className="grid-bg-fine relative h-[42dvh] min-h-[220px] overflow-hidden rounded-2xl border border-line bg-background/40">
            <Model3DViewer
              instances={instances}
              selectedId={null}
              onSelect={() => {}}
              explode={0}
              hidden={new Set()}
              isolate={false}
              ghost={false}
              ortho={ortho}
              view={view}
              viewNonce={viewNonce}
              fitNonce={0}
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              Espessura
            </span>
            <input
              type="number"
              min={0.2}
              step={0.1}
              inputMode="decimal"
              aria-label="Espessura da chapa em milímetros"
              value={thickness}
              onChange={(e) => onThickness(Math.max(0.2, Number(e.target.value) || 0.2))}
              className="w-20 rounded-lg border border-line bg-background/40 px-2 py-1 text-center font-mono text-xs outline-none"
            />
            <span className="font-mono text-[10px] text-muted-foreground">mm</span>
          </label>

          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value as SolidMaterial)}
            aria-label="Aparência do material"
            className="rounded-lg border border-line bg-background/40 px-2 py-1 font-mono text-[10px] outline-none"
          >
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id);
                  setViewNonce((n) => n + 1);
                }}
                className={cn(
                  "rounded-full border border-line px-2 py-1 font-mono text-[9px] tracking-widest",
                  view === v.id && "text-accent",
                )}
              >
                {v.label}
              </button>
            ))}
            <button
              onClick={() => setOrtho((o) => !o)}
              className={cn(
                "rounded-full border border-line px-2 py-1 font-mono text-[9px] tracking-widest",
                ortho && "text-accent",
              )}
            >
              ORTO
            </button>
          </div>
        </div>

        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {instances.length} contorno(s) · área líquida {(area / 100).toFixed(1)} cm² · volume{" "}
          {((area * thickness) / 1000).toFixed(1)} cm³
        </p>
      </DialogContent>
    </Dialog>
  );
}
