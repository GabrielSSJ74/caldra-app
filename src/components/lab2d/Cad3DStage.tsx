// @ts-nocheck
/**
 * CALDRA CHAMFER — MODO 3D COM A LINGUAGEM VISUAL EXATA DA TRAÇAGEM
 *
 * Utiliza o mesmo sistema de visualização 3D da Traçagem (Wire3D):
 * - Mesma aparência metálica / técnica (materiais OKLAB, key + fill + rim lights, faces facetadas)
 * - Vistas técnicas canônicas: ISO, FR, LAT, SUP
 * - Modos de aresta técnica: SOMB, SOMB+AR, ARAME
 * - Slider analítico de conformação 3D:
 *     0%   = Totalmente planificado (Flat Pattern)
 *     100% = Totalmente dobrado / conformado (ângulos nominais)
 *     0%..100% = Rotação rígida analítica em torno dos eixos reais de dobra
 * - Cinemática de dobras hierárquica e contínua (sem gaps, sem deformações artificiais)
 * - Espessura real com faces superiores, inferiores e bordas de corte (rims)
 */

import { ArrowLeft, Box, Layers, RotateCcw, Play, Pause } from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Wire3D } from "@/components/chameleon/Wire3D";
import {
  VIEW_PRESETS,
  EDGE_MODES,
  type ViewPresetId,
  type EdgeMode,
} from "@/lib/viz3d/cameraPresets";
import {
  Model3DViewer,
  type DisplayMode,
  type ViewKey,
} from "@/components/projects/catalog/Model3DViewer";
import { ProjectTreePanel } from "@/components/projects/catalog/ProjectTreePanel";
import type { Entity } from "@/lib/lab2d/core";
import { planArea } from "@/lib/lab2d/solid3d";
import { buildInstances, type SolidMaterial } from "@/lib/project-catalog/instances";
import { findCatalogModel } from "@/lib/project-catalog/registry";
import type { CanonicalProject } from "@/lib/project-catalog/types";
import { findChamferLink } from "@/lib/projects/chamfer";
import { getProject } from "@/lib/projects/store";
import { cn } from "@/lib/utils";
import { ChamferCADPanel } from "@/components/lab2d/ChamferCADPanel";
import { ChamferKernel } from "@/lib/cad/kernel/chamferKernel";
import type { PartDocument } from "@/lib/cad/kernel/types";

/** Projeto canônico do dossiê vinculado (quando vem do catálogo de projetos) */
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
      "shrink-0 rounded-md border border-line bg-background/80 px-2.5 py-1 font-mono text-[9px] tracking-wider uppercase backdrop-blur transition-colors",
      active
        ? "border-accent bg-accent/15 text-accent font-semibold shadow-xs"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
      rest.className,
    )}
  >
    {children}
  </button>
);

class Stage3DErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Erro interno no motor 3D do Chamfer:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center select-none">
          <p className="font-mono text-xs font-semibold text-accent uppercase">
            Recuperação do Motor 3D do Chamfer
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Ocorreu uma instabilidade na renderização 3D. Clique abaixo para reiniciar a visualização de forma segura.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
            className="rounded-md border border-accent bg-accent/15 px-3.5 py-1.5 font-mono text-[10px] font-bold text-accent uppercase transition-colors hover:bg-accent/25"
          >
            Reinicializar Viewport 3D
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Cad3DStage({
  open,
  onClose,
  entities,
  thickness,
  onThickness,
  title,
  labProjectId,
  selection: _selection,
  onSelectEntity: _onSelectEntity,
  cadDoc: externalDoc,
  onCadDocChange: externalDocChange,
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
  cadDoc?: PartDocument;
  onCadDocChange?: (doc: PartDocument) => void;
}) {
  const ctx = useProjectContext(labProjectId);

  // Controles de apresentação idênticos à Traçagem
  const [viewPreset, setViewPreset] = useState<ViewPresetId>("iso");
  const [viewNonce, setViewNonce] = useState(0);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("shaded-edges");

  // Painéis auxiliares
  const [treeOpen, setTreeOpen] = useState(false);
  const [cadPanelOpen, setCadPanelOpen] = useState(false);

  // Documento CAD unificado com fallback seguro
  const [internalCadDoc, setInternalCadDoc] = useState<PartDocument>(() => {
    const d = ChamferKernel.createDocument(title, thickness, "Aço Carbono");
    if (entities && entities.length > 0) {
      try {
        ChamferKernel.addSketchFromEntities(d, entities);
        ChamferKernel.extrudeBasePlate(d, 120, 100);
      } catch (err) {
        console.warn("Aviso: inicialização geométrica preliminar em 3D:", err);
      }
    }
    return d;
  });

  const cadDoc = externalDoc || internalCadDoc;
  const docRef = useRef(cadDoc);
  docRef.current = cadDoc;

  const setCadDoc = useCallback(
    (updater: PartDocument | ((prev: PartDocument) => PartDocument)) => {
      if (externalDocChange) {
        const next = typeof updater === "function" ? updater(docRef.current) : updater;
        externalDocChange(next);
      } else {
        setInternalCadDoc((prev) => (typeof updater === "function" ? updater(prev) : updater));
      }
    },
    [externalDocChange],
  );

  // Slider de conformação analítica: 0 = Planificado (0%), 1 = 100% Dobrado
  const [foldProgress, setFoldProgress] = useState(
    cadDoc.activeState === "2D_FLAT" ? 0.0 : (cadDoc.foldProgress ?? 1.0),
  );
  const [isFoldingAnimated, setIsFoldingAnimated] = useState(false);
  const foldProgressRef = useRef(foldProgress);
  foldProgressRef.current = foldProgress;

  // Sincronização de animação contínua
  useEffect(() => {
    if (!isFoldingAnimated) return;
    let animId: number;
    let dir = 1;
    const tick = () => {
      let curr = foldProgressRef.current + 0.015 * dir;
      if (curr >= 1) {
        curr = 1;
        dir = -1;
      } else if (curr <= 0) {
        curr = 0;
        dir = 1;
      }
      setFoldProgress(curr);
      setCadDoc((prev) => ChamferKernel.setFoldProgress({ ...prev }, curr));
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isFoldingAnimated, setCadDoc]);

  // Sincronização 2D → 3D: atualiza documento canônico quando entidades 2D ou espessura mudam
  const lastSyncRef = useRef<{ count: number; thickness: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const count = entities?.length ?? 0;
    const last = lastSyncRef.current;
    if (last && last.count === count && last.thickness === thickness) {
      return;
    }
    lastSyncRef.current = { count, thickness };

    setInternalCadDoc((prev) => {
      try {
        if (entities && entities.length > 0) {
          ChamferKernel.addSketchFromEntities(prev, entities);
        }
        prev.thickness = thickness;
        prev.innerRadius = thickness;
      } catch (err) {
        console.warn("Aviso ao sincronizar entidades para o modelo 3D:", err);
      }
      return { ...prev };
    });
  }, [open, entities, thickness]);

  // Modelo 3D canônico da Traçagem (WireModel) construído pelo SheetMetalWireBuilder
  const wireModel = useMemo(() => {
    try {
      const model = ChamferKernel.buildWireModel(cadDoc, foldProgress);
      if (model && model.faces && model.edges && model.bounds) {
        return model;
      }
    } catch (err) {
      console.warn("Aviso ao gerar wireModel 3D do documento:", err);
    }
    try {
      const fallbackDoc = ChamferKernel.createDocument(
        title || "CHAMFER",
        thickness,
        "Aço Carbono",
      );
      return ChamferKernel.buildWireModel(fallbackDoc, foldProgress);
    } catch {
      // Objeto mínimo de emergência estritamente garantido
      return {
        faces: [],
        edges: [],
        refLines: [],
        size: 100,
        bounds: { min: { x: -50, y: -50, z: -1 }, max: { x: 50, y: 50, z: 1 } },
      };
    }
  }, [cadDoc, foldProgress, title, thickness]);

  // Instâncias para dossiers de catálogo legados (caso projeto exista)
  const instances = useMemo(() => {
    if (ctx) return buildInstances(ctx.result);
    return [];
  }, [ctx]);

  const area = useMemo(() => (ctx ? 0 : planArea(entities)), [ctx, entities]);

  // Tecla ESC para voltar ao modo 2D
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const resetView = () => {
    setViewPreset("iso");
    setViewNonce((n) => n + 1);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex flex-col bg-background select-none",
        !open && "pointer-events-none invisible opacity-0",
      )}
      aria-hidden={!open}
    >
      {/* CABEÇALHO TÉCNICO CALDRA */}
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 bg-card/60 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-mono text-[9px] tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors uppercase"
        >
          <ArrowLeft className="size-3.5" /> 2D PROJETO
        </button>

        {/* ALTERNÂNCIA 2D ↔ 3D */}
        <div className="flex items-center rounded-lg border border-line bg-background/60 p-0.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-0.5 font-mono text-[9px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            2D SKETCH
          </button>
          <button
            type="button"
            className="rounded-md bg-accent/15 px-2.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-accent uppercase"
          >
            3D SÓLIDO
          </button>
        </div>

        <p className="flex-1 truncate text-center font-mono text-[11px] font-bold tracking-widest uppercase">
          {ctx ? `${ctx.name} · REV ${ctx.revision}` : title}
        </p>

        {ctx && (
          <Btn active={treeOpen} onClick={() => setTreeOpen((t) => !t)} aria-label="Árvore">
            <Layers className="inline size-3 mr-1" /> ÁRVORE
          </Btn>
        )}

        <Btn
          active={cadPanelOpen}
          onClick={() => setCadPanelOpen((c) => !c)}
          aria-label="Painel Paramétrico CAD"
        >
          <Box className="inline size-3 mr-1 text-accent" /> CAD KERNEL
        </Btn>
      </header>

      {/* VIEWPORT PRINCIPAL: RENDERIZADOR DA TRAÇAGEM (Wire3D) */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        {/* SLIDER CINEMÁTICO DE CONFORMAÇÃO 3D (0% Planificado ↔ 100% Dobrado) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-line bg-background/90 px-4 py-1.5 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setFoldProgress(0.0);
              setCadDoc((prev) => ChamferKernel.setFoldProgress({ ...prev }, 0.0));
            }}
            className={cn(
              "font-mono text-[9px] font-bold tracking-wider uppercase transition-colors",
              foldProgress <= 0.01 ? "text-accent" : "text-muted-foreground hover:text-foreground",
            )}
            title="Clique para planificar completamente (0%)"
          >
            PLANIFICADO
          </button>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(foldProgress * 100)}
            onChange={(e) => {
              const p = Number(e.target.value) / 100;
              setFoldProgress(p);
              setCadDoc((prev) => ChamferKernel.setFoldProgress({ ...prev }, p));
            }}
            aria-label="Controle de conformação: Planificado para Dobrado"
            className="h-1.5 w-36 cursor-pointer accent-[var(--accent)]"
            title="Arraste para articular cada dobra progressivamente no seu eixo matemático"
          />

          <button
            type="button"
            onClick={() => {
              setFoldProgress(1.0);
              setCadDoc((prev) => ChamferKernel.setFoldProgress({ ...prev }, 1.0));
            }}
            className={cn(
              "font-mono text-[9px] font-bold tracking-wider uppercase transition-colors",
              foldProgress >= 0.99 ? "text-accent" : "text-muted-foreground hover:text-foreground",
            )}
            title="Clique para conformar completamente a 100%"
          >
            DOBRADO
          </button>

          <span className="min-w-10 text-right font-mono text-[10px] font-bold text-accent">
            {(foldProgress * 100).toFixed(0)}%
          </span>

          <button
            type="button"
            onClick={() => setIsFoldingAnimated((a) => !a)}
            className={cn(
              "flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[8.5px] tracking-wider uppercase transition-colors",
              isFoldingAnimated
                ? "bg-accent text-accent-foreground font-semibold"
                : "bg-muted/40 text-muted-foreground hover:text-foreground",
            )}
            title="Animar cinemática de dobra contínua"
          >
            {isFoldingAnimated ? (
              <>
                <Pause className="size-2.5" /> Pausar
              </>
            ) : (
              <>
                <Play className="size-2.5" /> Animar
              </>
            )}
          </button>
        </div>

        {/* CONTROLES SUPERIORES ESQUERDOS: VISTAS (ISO, FR, LAT, SUP) & MODOS (SOMB, SOMB+AR, ARAME) */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
          {/* VISTAS DA TRAÇAGEM: ISO, FR, LAT, SUP */}
          <div
            className="flex rounded-md border border-line bg-background/85 p-0.5 shadow-sm backdrop-blur"
            role="group"
            aria-label="Vistas técnicas padrão"
          >
            {VIEW_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.title}
                onClick={() => {
                  setViewPreset(preset.id);
                  setViewNonce((n) => n + 1);
                }}
                className={cn(
                  "h-6 min-w-8 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                  viewPreset === preset.id
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* MODOS DE APARÊNCIA DA TRAÇAGEM: SOMB, SOMB+AR, ARAME */}
          <div
            className="flex rounded-md border border-line bg-background/85 p-0.5 shadow-sm backdrop-blur"
            role="group"
            aria-label="Modos de renderização"
          >
            {EDGE_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.title}
                onClick={() => setEdgeMode(item.id)}
                className={cn(
                  "h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                  edgeMode === item.id
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* RENDERIZADOR 3D PROTEGIDO: SE PROJETO DE CATÁLOGO LEGADO EXISTE E NÃO HÁ DESENHO 2D, USA MODEL3DVIEWER; SENÃO USA WIRE3D */}
        <Stage3DErrorBoundary onReset={resetView}>
          {ctx && (!entities || entities.length === 0) ? (
            <Model3DViewer
              instances={instances}
              selectedId={null}
              onSelect={() => {}}
              explode={0}
              hidden={new Set()}
              isolate={false}
              ghost={false}
              ortho={false}
              view={
                viewPreset === "front"
                  ? "frontal"
                  : viewPreset === "side"
                    ? "direita"
                    : viewPreset === "top"
                      ? "superior"
                      : "iso"
              }
              viewNonce={viewNonce}
              fitNonce={0}
              display={
                edgeMode === "wireframe" ? "wireframe" : edgeMode === "shaded" ? "shaded" : "edges"
              }
            />
          ) : (
            <Wire3D
              interactive
              unfold={0} // Geometria já conformada analiticamente com rotação rígida nos eixos reais
              model={wireModel}
              view={viewPreset}
              viewNonce={viewNonce}
              edgeMode={edgeMode}
              className="size-full text-foreground/80"
            />
          )}
        </Stage3DErrorBoundary>

        {/* ÁRVORE DE COMPONENTES DO CATÁLOGO (quando em projeto montado) */}
        {treeOpen && ctx && (
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,320px)] overflow-auto border-r border-line bg-background/95 p-2 backdrop-blur">
            <ProjectTreePanel
              result={ctx.result}
              instances={instances}
              selectedId={null}
              onSelect={() => {}}
              hidden={new Set()}
              onToggleHidden={() => {}}
            />
          </aside>
        )}
      </div>

      {/* BARRA INFERIOR DE PARÂMETROS E ESTADO */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2 bg-card/60 font-mono text-[10px] text-muted-foreground backdrop-blur-md">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 font-bold text-foreground">
            <Box className="size-3 text-accent" /> ESPESSURA:
            <input
              type="number"
              min={0.2}
              max={30}
              step={0.1}
              inputMode="decimal"
              aria-label="Espessura da chapa em milímetros"
              value={thickness}
              onChange={(e) => {
                const val = Math.max(0.2, Number(e.target.value) || 0.2);
                onThickness(val);
                setCadDoc((prev) => {
                  prev.thickness = val;
                  prev.innerRadius = val;
                  return { ...prev };
                });
              }}
              className="w-16 rounded-md border border-line bg-background/60 px-1.5 py-0.5 text-center font-mono font-bold text-accent outline-none"
            />
            mm
          </label>

          <span className="text-line">|</span>

          <span>
            MATERIAL:{" "}
            <strong className="text-foreground">{cadDoc.material || "Aço Carbono"}</strong>
          </span>

          <span className="text-line">|</span>

          <span>
            DOBRAS: <strong className="text-accent">{cadDoc.flanges?.length ?? 0}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {wireModel.bounds && (
            <span>
              DIM:{" "}
              <strong className="text-foreground">
                {(wireModel.bounds.max.x - wireModel.bounds.min.x).toFixed(1)} ×{" "}
                {(wireModel.bounds.max.y - wireModel.bounds.min.y).toFixed(1)} ×{" "}
                {(wireModel.bounds.max.z - wireModel.bounds.min.z).toFixed(1)} mm
              </strong>
            </span>
          )}

          {area > 0 && (
            <span>
              · PESO:{" "}
              <strong className="text-foreground">
                {(((area * thickness) / 1e6) * (cadDoc.density ?? 7.85)).toFixed(2)} kg
              </strong>
            </span>
          )}

          <Btn onClick={resetView} title="Redefinir enquadramento e câmera">
            <RotateCcw className="inline size-3 mr-1" /> RESET
          </Btn>
        </div>
      </footer>

      {/* PAINEL PARAMÉTRICO COMPLETO CAD KERNEL */}
      <ChamferCADPanel
        open={cadPanelOpen}
        onClose={() => setCadPanelOpen(false)}
        document={cadDoc}
        onDocumentChange={setCadDoc}
      />
    </div>
  );
}
