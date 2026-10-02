// @ts-nocheck
/**
 * CALDRA CHAMFER — AMBIENTE 3D UNIFICADO (CAD KERNEL + CAD CORE B-REP)
 *
 * Arquitetura Centralizada:
 * CALDRA -> CHAMFER -> CAD CORE -> CAD KERNEL (OCCT) -> B-REP -> THREE.JS
 *
 * Recursos:
 * - Geometria Sólida B-Rep real analítica (OpenCascade WASM)
 * - Seleção topológica unificada (Face, Aresta, Vértice, Sólido)
 * - Árvore de Recursos Paramétrica (Feature Tree DAG)
 * - Modos técnicos: SOMB, SOMB+AR, ARAME
 * - Vistas canônicas industriais: ISO, FR, LAT, SUP
 * - Indicador técnico real do status do CAD KERNEL (OCCT / B-Rep)
 * - Parâmetros técnicos de engenharia e fabricação no rodapé
 */

import { ArrowLeft, Box, Cpu, Layers, RotateCcw } from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  VIEW_PRESETS,
  EDGE_MODES,
  type ViewPresetId,
  type EdgeMode,
} from "@/lib/viz3d/cameraPresets";
import { ProjectTreePanel } from "@/components/projects/catalog/ProjectTreePanel";
import type { Entity } from "@/lib/lab2d/core";
import { planArea } from "@/lib/lab2d/solid3d";
import { buildInstances } from "@/lib/project-catalog/instances";
import { findCatalogModel } from "@/lib/project-catalog/registry";
import { findChamferLink } from "@/lib/projects/chamfer";
import { getProject } from "@/lib/projects/store";
import { cn } from "@/lib/utils";
import { ChamferKernel } from "@/lib/cad/kernel/chamferKernel";
import type { PartDocument } from "@/lib/cad/kernel/types";
import { CadBRepViewer } from "@/components/lab2d/CadBRepViewer";
import { CadKernelStatusPopover } from "@/components/lab2d/CadKernelStatusPopover";

/** Projeto canônico do dossiê vinculado (quando vem do catálogo de projetos) */
function useProjectContext(labProjectId: string | undefined) {
  return useMemo(() => {
    if (!labProjectId) return null;
    const link = findChamferLink(labProjectId);
    if (!link) return null;
    const project = getProject(link.projectId);
    if (!project) return null;
    const result = findCatalogModel(link.modelSlug);
    if (!result) return null;
    return { project, result, name: project.name, revision: project.metadata.revision };
  }, [labProjectId]);
}

/** Botão técnico estilizado com a identidade industrial CALDRA */
function Btn({
  children,
  onClick,
  active,
  title,
  "aria-label": ariaLabel,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "rounded-md border border-line px-2.5 py-1 font-mono text-[9px] tracking-wider uppercase transition-colors select-none",
        active
          ? "bg-accent/15 font-semibold text-accent border-accent/40 shadow-xs"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** ErrorBoundary para proteger o viewport 3D */
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

  componentDidCatch(error: Error) {
    console.error("[Cad3DStage] Erro no estágio 3D:", error);
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

  // Painéis auxiliares e controle de telemetria
  const [treeOpen, setTreeOpen] = useState(false);
  const [kernelPopoverOpen, setKernelPopoverOpen] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

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

  // Área 2D analítica para cálculo de peso
  const area = useMemo(() => {
    if (!entities || entities.length === 0) {
      const w = cadDoc.baseWidth || 100;
      const l = cadDoc.baseLength || 100;
      return w * l;
    }
    return planArea(entities);
  }, [entities, cadDoc.baseWidth, cadDoc.baseLength]);

  // Instâncias para visualização de projeto completo em catálogo
  const instances = useMemo(() => {
    if (!ctx) return [];
    return buildInstances(ctx.result, {
      steel: true,
      weld: true,
      dimension: false,
    });
  }, [ctx]);

  const resetView = useCallback(() => {
    setResetNonce((n) => n + 1);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background select-none"
      role="dialog"
      aria-label="Ambiente 3D CAD Core"
      aria-modal="true"
    >
      {/* CABEÇALHO TÉCNICO CALDRA */}
      <header className="relative flex items-center justify-between gap-2 border-b border-line px-3 py-2 bg-card/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
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
        </div>

        {/* TÍTULO CENTRAL */}
        <p className="truncate text-center font-mono text-[11px] font-bold tracking-widest uppercase">
          {ctx ? `${ctx.name} · REV ${ctx.revision}` : title}
        </p>

        {/* LADO DIREITO: ÁRVORE & BOTÃO CAD KERNEL COM POPOVER TÉCNICO */}
        <div className="relative flex items-center gap-2">
          {ctx && (
            <Btn active={treeOpen} onClick={() => setTreeOpen((t) => !t)} aria-label="Árvore">
              <Layers className="inline size-3 mr-1" /> ÁRVORE
            </Btn>
          )}

          <Btn
            active={kernelPopoverOpen}
            onClick={() => setKernelPopoverOpen((o) => !o)}
            aria-label="Status do CAD Kernel"
            className="border-accent/40"
          >
            <Cpu className="inline size-3 mr-1 text-accent" /> CAD KERNEL
          </Btn>

          {/* POPOVER TÉCNICO CONTEXTUAL DO CAD KERNEL */}
          <CadKernelStatusPopover
            open={kernelPopoverOpen}
            onClose={() => setKernelPopoverOpen(false)}
          />
        </div>
      </header>

      {/* VIEWPORT PRINCIPAL: AMBIENTE 3D B-REP (OCCT THREE.JS) */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <Stage3DErrorBoundary onReset={resetView}>
          <CadBRepViewer
            key={resetNonce}
            className="size-full"
            initialThickness={thickness}
            initialWidth={cadDoc.baseWidth || 100}
            initialLength={cadDoc.baseLength || 100}
          />
        </Stage3DErrorBoundary>

        {/* ÁRVORE DE COMPONENTES DO CATÁLOGO (quando em projeto montado) */}
        {treeOpen && ctx && (
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,320px)] overflow-auto border-r border-line bg-background/95 p-2 backdrop-blur z-20">
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

      {/* BARRA INFERIOR DE PARÂMETROS E ESTADO TÉCNICO */}
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
          <span>
            DIM:{" "}
            <strong className="text-foreground">
              {(cadDoc.baseWidth || 100).toFixed(1)} × {(cadDoc.baseLength || 100).toFixed(1)} × {thickness.toFixed(1)} mm
            </strong>
          </span>

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
    </div>
  );
}
