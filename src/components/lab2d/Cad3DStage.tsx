/**
 * CHAMFER — MODO 3D (mini ambiente CAD do CALDRA).
 *
 * Não é um modal: é um MODO INTERNO do CHAMFER que ocupa a tela inteira.
 * Usa o ÚNICO motor 3D do CALDRA (`Model3DViewer`, Three.js/WebGL) e as
 * mesmas instâncias sólidas do catálogo — nada é recalculado aqui.
 *
 * Duas fontes possíveis, nunca simultâneas:
 *  · PROJETO — quando o desenho do CHAMFER está vinculado a um dossiê do
 *    catálogo, o conjunto inteiro é reconstruído do resultado canônico;
 *  · DESENHO — senão, os contornos fechados da camada CORTE viram chapa
 *    sólida com a espessura real.
 */

import { ArrowLeft, Box, Crosshair, Eye, Focus, Layers, Maximize2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Model3DViewer,
  type DisplayMode,
  type ViewKey,
} from "@/components/projects/catalog/Model3DViewer";
import { ProjectTreePanel } from "@/components/projects/catalog/ProjectTreePanel";
import type { Entity } from "@/lib/lab2d/core";
import { planArea, planSolids } from "@/lib/lab2d/solid3d";
import { buildInstances, type SolidMaterial } from "@/lib/project-catalog/instances";
import { findCatalogModel } from "@/lib/project-catalog/registry";
import type { CanonicalProject } from "@/lib/project-catalog/types";
import { findChamferLink } from "@/lib/projects/chamfer";
import { getProject } from "@/lib/projects/store";
import { cn } from "@/lib/utils";
import { ChamferCADPanel } from "@/components/lab2d/ChamferCADPanel";
import { ChamferKernel } from "@/lib/cad/kernel/chamferKernel";
import type { PartDocument } from "@/lib/cad/kernel/types";

const VIEWS: { id: ViewKey; label: string }[] = [
  { id: "iso", label: "ISO" },
  { id: "frontal", label: "FRENTE" },
  { id: "traseira", label: "TRÁS" },
  { id: "superior", label: "TOPO" },
  { id: "inferior", label: "BASE" },
  { id: "esquerda", label: "ESQ" },
  { id: "direita", label: "DIR" },
];

const MATERIALS: { id: SolidMaterial; label: string }[] = [
  { id: "aco", label: "Aço carbono" },
  { id: "aco-pintado", label: "Aço pintado" },
  { id: "aluminio", label: "Alumínio" },
];

const DISPLAYS: { id: DisplayMode; label: string }[] = [
  { id: "edges", label: "SOMBRA+ARESTA" },
  { id: "shaded", label: "SOMBREADO" },
  { id: "wireframe", label: "ARAME" },
];

/** Projeto canônico do dossiê vinculado — mesma fonte usada pelo catálogo. */
function useProjectContext(labProjectId: string | undefined) {
  return useMemo(() => {
    if (!labProjectId) return null;
    const link = findChamferLink(labProjectId);
    if (!link) return null;
    const project = getProject(link.projectId);
    const src = project?.catalogSource;
    if (!project || !src) return null;
    const model = findCatalogModel(src.modelSlug);
    if (!model?.generate) return null;
    try {
      const result: CanonicalProject = model.generate(src.parameters);
      return { result, name: `${project.code ?? project.name}`, revision: project.revision };
    } catch {
      return null;
    }
  }, [labProjectId]);
}

const Btn = ({
  active,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "shrink-0 rounded-full border border-line bg-background/60 px-2.5 py-1 font-mono text-[10px] tracking-widest whitespace-nowrap backdrop-blur transition-colors",
      active && "border-accent/50 text-accent",
      rest.className,
    )}
  >
    {children}
  </button>
);

export function Cad3DStage({
  open,
  onClose,
  entities,
  thickness,
  onThickness,
  title,
  labProjectId,
  selection,
  onSelectEntity,
}: {
  open: boolean;
  onClose: () => void;
  entities: Entity[];
  thickness: number;
  onThickness: (v: number) => void;
  title: string;
  labProjectId?: string | undefined;
  selection: string[];
  onSelectEntity: (id: string | null) => void;
}) {
  const ctx = useProjectContext(labProjectId);

  const [material, setMaterial] = useState<SolidMaterial>("aco");
  const [display, setDisplay] = useState<DisplayMode>("edges");
  const [view, setView] = useState<ViewKey>("iso");
  const [viewNonce, setViewNonce] = useState(0);
  const [fitNonce, setFitNonce] = useState(0);
  const [zoomSelNonce, setZoomSelNonce] = useState(0);
  const [resetNonce, setResetNonce] = useState(0);
  const [ortho, setOrtho] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [explode, setExplode] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [cadPanelOpen, setCadPanelOpen] = useState(false);
  const [cadDoc, setCadDoc] = useState<PartDocument>(() => {
    const d = ChamferKernel.createDocument(title, thickness, "Aço Carbono");
    if (entities.length > 0) {
      ChamferKernel.addSketchFromEntities(d, entities);
      ChamferKernel.extrudeBasePlate(d, 100, 100);
    }
    return d;
  });

  /* congelado enquanto fechado: sem rebuild nem perda de câmera ao voltar */
  const frozen = useRef<{ entities: Entity[]; thickness: number; material: SolidMaterial }>({
    entities,
    thickness,
    material,
  });
  if (open) frozen.current = { entities, thickness, material };
  const src = frozen.current;

  const instances = useMemo(
    () =>
      ctx ? buildInstances(ctx.result) : planSolids(src.entities, src.thickness, src.material),
    [ctx, src.entities, src.thickness, src.material],
  );
  const area = useMemo(() => (ctx ? 0 : planArea(src.entities)), [ctx, src.entities]);

  /* 2D → 3D: a peça selecionada no desenho aparece destacada no modelo */
  useEffect(() => {
    if (ctx || !open) return;
    const id = selection.find((s) => instances.some((i) => i.id === s)) ?? null;
    if (id) setSelected(id);
  }, [ctx, open, selection, instances]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selInst = instances.find((i) => i.id === selected) ?? null;

  const goView = (v: ViewKey) => {
    setView(v);
    setViewNonce((n) => n + 1);
  };

  const select = (id: string | null) => {
    setSelected(id);
    /* 3D → 2D: no modo desenho a instância é a própria entidade vetorial */
    if (!ctx) onSelectEntity(id);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex flex-col bg-background",
        !open && "pointer-events-none invisible opacity-0",
      )}
      aria-hidden={!open}
    >
      {/* CABEÇALHO */}
      <header className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] tracking-widest"
        >
          <ArrowLeft className="size-3.5" /> CHAMFER
        </button>
        <p className="flex-1 truncate text-center font-mono text-[11px] tracking-widest uppercase">
          {ctx ? `${ctx.name} · REV ${ctx.revision}` : title}
        </p>
        <Btn
          active={treeOpen}
          onClick={() => setTreeOpen((t) => !t)}
          aria-label="Árvore de componentes"
        >
          <Layers className="inline size-3" /> ÁRVORE
        </Btn>
        <Btn
          active={cadPanelOpen}
          onClick={() => setCadPanelOpen((c) => !c)}
          aria-label="Painel Paramétrico CAD"
        >
          <Box className="inline size-3 text-accent" /> CAD KERNEL
        </Btn>
      </header>

      {/* VIEWPORT */}
      <div className="relative min-h-0 flex-1">
        {instances.length === 0 ? (
          <div className="grid h-full place-items-center px-8 text-center text-xs text-muted-foreground">
            Nenhum contorno fechado na camada CORTE. Feche o perfil da peça para gerar o sólido 3D.
          </div>
        ) : (
          <Model3DViewer
            instances={instances}
            selectedId={selected}
            onSelect={select}
            explode={explode}
            hidden={hidden}
            isolate={isolate}
            ghost={ghost}
            ortho={ortho}
            view={view}
            viewNonce={viewNonce}
            fitNonce={fitNonce}
            display={display}
            zoomSelNonce={zoomSelNonce}
            resetNonce={resetNonce}
          />
        )}

        {/* ORIENTAÇÃO XYZ — toque leva à vista correspondente */}
        <div className="absolute top-2 right-2 flex gap-1">
          {(
            [
              ["X", "direita"],
              ["Y", "superior"],
              ["Z", "frontal"],
            ] as [string, ViewKey][]
          ).map(([axis, v]) => (
            <Btn key={axis} onClick={() => goView(v)} aria-label={`Vista ${axis}`}>
              {axis}
            </Btn>
          ))}
        </div>

        {/* SELEÇÃO / PROPRIEDADES RÁPIDAS */}
        {selInst && (
          <div className="absolute bottom-2 left-2 max-w-[70%] rounded-xl border border-line bg-background/85 px-3 py-2.5 backdrop-blur shadow-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-accent uppercase">
                CAD CANÔNICO
              </span>
              <p className="font-mono text-[10px] tracking-wider text-accent truncate">
                {selInst.code} · {selInst.label}
              </p>
            </div>
            <p className="font-mono text-[10px] text-foreground/90">
              {selInst.size.x.toFixed(1)} × {selInst.size.y.toFixed(1)} ×{" "}
              {selInst.size.z.toFixed(1)} mm ·{" "}
              {MATERIALS.find((m) => m.id === selInst.material)?.label}
            </p>
            {area > 0 && (
              <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                Área: {(area / 1e6).toFixed(3)} m² · Vol:{" "}
                {((area * src.thickness) / 1e3).toFixed(1)} cm³ · Peso:{" "}
                {(((area * src.thickness) / 1e6) * 7.85).toFixed(2)} kg
              </p>
            )}
          </div>
        )}

        {/* ÁRVORE DE COMPONENTES */}
        {treeOpen && (
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,320px)] overflow-auto border-r border-line bg-background/95 p-2 backdrop-blur">
            {ctx ? (
              <ProjectTreePanel
                result={ctx.result}
                instances={instances}
                selectedId={selected}
                onSelect={select}
                hidden={hidden}
                onToggleHidden={(key) =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(key)) n.delete(key);
                    else n.add(key);
                    return n;
                  })
                }
              />
            ) : (
              <ul className="space-y-1">
                <li className="t-eyebrow mb-1">{title}</li>
                {instances.map((i) => (
                  <li key={i.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => select(i.id)}
                      className={cn(
                        "flex-1 rounded px-1 py-1 text-left text-xs",
                        i.id === selected && "bg-accent/15 text-accent",
                      )}
                    >
                      <span className="font-mono text-accent">{i.code}</span> {i.label}
                    </button>
                    <button
                      type="button"
                      aria-label={hidden.has(i.partKey) ? "Mostrar peça" : "Ocultar peça"}
                      onClick={() =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(i.partKey)) n.delete(i.partKey);
                          else n.add(i.partKey);
                          return n;
                        })
                      }
                      className="text-muted-foreground"
                    >
                      <Eye className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      {/* BARRA DE FERRAMENTAS 3D */}
      <div className="flex flex-col gap-1.5 border-t border-line px-2 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {VIEWS.map((v) => (
            <Btn key={v.id} active={view === v.id} onClick={() => goView(v.id)}>
              {v.label}
            </Btn>
          ))}
          <Btn active={ortho} onClick={() => setOrtho((o) => !o)}>
            {ortho ? "ORTO" : "PERSP"}
          </Btn>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          <Btn onClick={() => setFitNonce((n) => n + 1)}>
            <Maximize2 className="inline size-3" /> FIT
          </Btn>
          <Btn onClick={() => setZoomSelNonce((n) => n + 1)} disabled={!selInst}>
            <Focus className="inline size-3" /> ZOOM SEL
          </Btn>
          <Btn
            onClick={() => {
              setExplode(0);
              setIsolate(false);
              setGhost(false);
              setHidden(new Set());
              setSelected(null);
              setResetNonce((n) => n + 1);
            }}
          >
            <RotateCcw className="inline size-3" /> RESET
          </Btn>
          <Btn active={isolate} onClick={() => setIsolate((i) => !i)} disabled={!selInst}>
            ISOLAR
          </Btn>
          <Btn
            onClick={() => selInst && setHidden((h) => new Set(h).add(selInst.partKey))}
            disabled={!selInst}
          >
            OCULTAR
          </Btn>
          <Btn onClick={() => setHidden(new Set())}>MOSTRAR TUDO</Btn>
          <Btn active={ghost} onClick={() => setGhost((g) => !g)}>
            <Crosshair className="inline size-3" /> CONTEXTO
          </Btn>
          {DISPLAYS.map((d) => (
            <Btn key={d.id} active={display === d.id} onClick={() => setDisplay(d.id)}>
              {d.label}
            </Btn>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <label className="flex items-center gap-1">
            <Box className="size-3 text-accent" /> ESPESSURA
            <input
              type="number"
              min={0.2}
              step={0.1}
              inputMode="decimal"
              aria-label="Espessura da chapa em milímetros"
              value={thickness}
              onChange={(e) => onThickness(Math.max(0.2, Number(e.target.value) || 0.2))}
              disabled={!!ctx}
              className="w-16 rounded-lg border border-line bg-background/40 px-1.5 py-0.5 text-center outline-none disabled:opacity-40"
            />
            mm
          </label>
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value as SolidMaterial)}
            aria-label="Aparência do material"
            className="rounded-lg border border-line bg-background/40 px-1.5 py-0.5 outline-none"
            disabled={!!ctx}
          >
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <label className="flex flex-1 items-center gap-2">
            EXPLODIR
            <input
              type="range"
              min={0}
              max={100}
              value={explode * 100}
              onChange={(e) => setExplode(Number(e.target.value) / 100)}
              aria-label="Vista explodida"
              className="h-1 min-w-24 flex-1 accent-[var(--accent)]"
            />
          </label>
          {!ctx && instances.length > 0 && (
            <span>
              {instances.length} peça(s) · {(area / 100).toFixed(1)} cm² ·{" "}
              {((area * thickness) / 1000).toFixed(1)} cm³
            </span>
          )}
        </div>
      </div>

      <ChamferCADPanel
        open={cadPanelOpen}
        onClose={() => setCadPanelOpen(false)}
        document={cadDoc}
        onDocumentChange={setCadDoc}
      />
    </div>
  );
}
