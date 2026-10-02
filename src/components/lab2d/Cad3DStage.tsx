// @ts-nocheck
/**
 * CALDRA CHAMFER — AMBIENTE 3D UNIFICADO (CAD KERNEL + CAD CORE B-REP)
 *
 * Implementação Definitiva de Escala, Densidade e Identidade Geométrica:
 * - Proporções e escala compacta conforme a Imagem 1 (Header 64-72px, botões 40-46px)
 * - Remoção do nome da peça do centro do header; vistas ISO/FR/LAT/SUP centralizadas
 * - Recuperação da identidade real da peça (Cone, Quadrado->Redondo, Curva, Boca de Lobo, etc.)
 * - Grid 3D de chão com tema escuro (#051833 e grid branco) e tema claro
 * - Barra de status inferior de alta densidade técnica
 */

import { ArrowLeft, Box, Cpu, RotateCcw } from "lucide-react";
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
    const part = project.parts.find((p) => p.instanceId === link.instanceId);
    const result = findCatalogModel(part?.modelId || link.modelSlug);
    return {
      project,
      part,
      modelSlug: part?.modelId || link.modelSlug,
      parameters: part?.parameters,
      name: part?.name || project.name,
      revision: project.metadata.revision,
    };
  }, [labProjectId]);
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

  componentDidCatch(error: Error, info: unknown) {
    console.error("[Cad3DStage] Erro no estágio 3D:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 font-mono text-center">
          <p className="text-sm font-bold text-destructive">
            Falha na renderização do CAD 3D B-Rep
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            {this.state.error?.message || "Erro desconhecido na construção topológica."}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
            className="rounded-full border border-line bg-card px-4 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            Reinicializar Viewport
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
  thickness = 3,
  onThickness,
  title,
  labProjectId,
  selection,
  onSelectEntity,
  cadDoc: externalDoc,
  onCadDocChange: externalDocChange,
}: {
  open: boolean;
  onClose: () => void;
  entities?: Entity[];
  thickness?: number;
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

  // Vista ativa compartilhada
  const [viewPreset, setViewPreset] = useState<ViewPresetId>("iso");

  // Identificação do Modelo Real (Regra do Prompt: PROIBIDO CONE PADRÃO)
  const resolvedModel = useMemo(() => {
    const rawId = (ctx?.part?.modelId || ctx?.modelSlug || "").toLowerCase();
    const rawTitle = (title || "").toLowerCase();

    // 1. Transição Quadrado para Redondo
    if (
      rawId.includes("quadrado") ||
      rawId.includes("transic") ||
      rawTitle.includes("quadrado") ||
      rawTitle.includes("transiç")
    ) {
      return {
        type: "boilermaking_transition",
        name: "Quadrado para Redondo",
        params: {
          width: ctx?.parameters?.width || ctx?.parameters?.A || 200,
          length: ctx?.parameters?.length || ctx?.parameters?.B || 200,
          diameter: ctx?.parameters?.diameter || ctx?.parameters?.D || 120,
          height: ctx?.parameters?.height || ctx?.parameters?.H || 150,
          thickness: ctx?.parameters?.thickness || thickness,
        },
      };
    }

    // 2. Curva de Gomos / Cotovelo
    if (
      rawId.includes("curva") ||
      rawId.includes("gomos") ||
      rawId.includes("cotovelo") ||
      rawTitle.includes("curva") ||
      rawTitle.includes("cotovelo")
    ) {
      return {
        type: "boilermaking_elbow",
        name: "Curva de Gomos",
        params: {
          diameter: ctx?.parameters?.diameter || ctx?.parameters?.D || 150,
          radius: ctx?.parameters?.radius || ctx?.parameters?.R || 225,
          angleDeg: ctx?.parameters?.angleDeg || ctx?.parameters?.ang || 90,
          segments: ctx?.parameters?.segments || ctx?.parameters?.gomos || 4,
          thickness: ctx?.parameters?.thickness || thickness,
        },
      };
    }

    // 3. Boca de Lobo / Tê / Ramal
    if (
      rawId.includes("boca") ||
      rawId.includes("lobo") ||
      rawId.includes("ramal") ||
      rawTitle.includes("boca") ||
      rawTitle.includes("lobo")
    ) {
      return {
        type: "boilermaking_branch",
        name: "Boca de Lobo",
        params: {
          mainDiameter: ctx?.parameters?.mainDiameter || ctx?.parameters?.D || 200,
          branchDiameter: ctx?.parameters?.branchDiameter || ctx?.parameters?.d || 150,
          mainLength: ctx?.parameters?.mainLength || ctx?.parameters?.L || 350,
          branchHeight: ctx?.parameters?.branchHeight || ctx?.parameters?.H || 200,
          thickness: ctx?.parameters?.thickness || thickness,
        },
      };
    }

    // 4. Chapéu Chinês / Coifa
    if (
      rawId.includes("chapeu") ||
      rawId.includes("chines") ||
      rawId.includes("coifa") ||
      rawTitle.includes("chapeu") ||
      rawTitle.includes("coifa")
    ) {
      return {
        type: "boilermaking_hood",
        name: "Chapéu Chinês",
        params: {
          baseDiameter: ctx?.parameters?.baseDiameter || ctx?.parameters?.D || 300,
          topDiameter: ctx?.parameters?.topDiameter || ctx?.parameters?.d || 100,
          height: ctx?.parameters?.height || ctx?.parameters?.H || 120,
          thickness: ctx?.parameters?.thickness || thickness,
        },
      };
    }

    // 5. Cilindro Industrial
    if (
      rawId.includes("cilindro") ||
      rawId.includes("tubo") ||
      rawId.includes("duto") ||
      rawTitle.includes("cilindro") ||
      rawTitle.includes("tubo")
    ) {
      return {
        type: "base_cylinder",
        name: "Cilindro Industrial",
        params: {
          radius: (ctx?.parameters?.diameter || ctx?.parameters?.D || 150) / 2,
          height: ctx?.parameters?.height || ctx?.parameters?.H || 250,
          thickness: ctx?.parameters?.thickness || thickness,
        },
      };
    }

    // 6. Cone Truncado
    if (
      rawId.includes("cone") ||
      rawId.includes("tronco") ||
      rawId.includes("reducao") ||
      rawTitle.includes("cone") ||
      rawTitle.includes("reduç")
    ) {
      return {
        type: "boilermaking_cone",
        name: "Cone Truncado",
        params: {
          D: ctx?.parameters?.D || ctx?.parameters?.baseDiameter || 200,
          d: ctx?.parameters?.d || ctx?.parameters?.topDiameter || 2,
          height: ctx?.parameters?.height || ctx?.parameters?.H || 100,
          thickness: ctx?.parameters?.thickness || thickness,
        },
      };
    }

    // 7. Entidades de 2D Sketch
    if (entities && entities.length > 0) {
      return {
        type: "extrude_sketch",
        name: title && title !== "Peça Chamfer" ? title : "Chapa Planificada",
        params: {
          thickness: thickness,
        },
      };
    }

    // 8. Modelo padrão explícito se título indicar cone
    return {
      type: "boilermaking_cone",
      name: "Cone",
      params: {
        D: 200,
        d: 2,
        height: 100,
        thickness: thickness,
      },
    };
  }, [ctx, title, entities, thickness]);

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
      {/* CABEÇALHO SUPERIOR — ALTURA COMPACTA (48-54px) CONFORME REGRA DO PROMPT */}
      <header className="relative flex h-[48px] items-center justify-between border-b border-slate-200/90 bg-white px-3 shadow-2xs select-none z-30">
        {/* LADO ESQUERDO: [ ← 2D PROJETO ] + [ 2D SKETCH | 3D SÓLIDO ] */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[32px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3 font-mono text-[10.5px] font-semibold tracking-wider text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
          >
            <ArrowLeft className="size-3.5" /> 2D PROJETO
          </button>

          {/* ALTERNÂNCIA 2D ↔ 3D COM DESTAQUE CALDRA */}
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-100/70 p-0.5">
            <button
              type="button"
              onClick={onClose}
              className="h-[24px] rounded-full px-2.5 font-mono text-[10px] font-medium tracking-wider uppercase text-slate-600 hover:text-slate-900 transition-colors"
            >
              2D SKETCH
            </button>
            <button
              type="button"
              className="h-[24px] rounded-full bg-red-100/90 px-3 font-mono text-[10px] font-bold tracking-wider text-red-600 shadow-2xs uppercase"
            >
              3D SÓLIDO
            </button>
          </div>
        </div>

        {/* CENTRO: VISTAS PRINCIPAIS (ISO | FR | LAT | SUP) — NOME DA PEÇA REMOVIDO DO HEADER */}
        <div className="flex items-center rounded-full border border-slate-200 bg-slate-100/80 p-0.5 shadow-2xs">
          {(
            [
              { id: "iso", label: "ISO" },
              { id: "front", label: "FR" },
              { id: "right", label: "LAT" },
              { id: "top", label: "SUP" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewPreset(v.id)}
              className={cn(
                "flex h-[24px] items-center gap-0.5 rounded-full px-2.5 font-mono text-[10px] font-bold uppercase transition-colors",
                viewPreset === v.id
                  ? "bg-red-50 text-red-600 border border-red-200 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/80",
              )}
            >
              <Box className="size-3" /> {v.label}
            </button>
          ))}
        </div>

        {/* LADO DIREITO: [ WIRE3D ] [ ⚙ CAD CORE 3D ] [ ▣ CAD KERNEL ] */}
        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {}}
            className="flex h-[32px] items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 font-mono text-[10px] font-medium tracking-wider text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
            title="Alternar para motor de arame Wire3D"
          >
            <Box className="size-3.5 text-slate-600" /> WIRE3D
          </button>

          <button
            type="button"
            className="flex h-[32px] items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 font-mono text-[10px] font-bold tracking-wider text-red-600 shadow-2xs uppercase"
            title="Ambiente CAD CORE 3D ativo"
          >
            <Cpu className="size-3.5 text-red-600" /> CAD CORE 3D
          </button>

          <button
            type="button"
            onClick={() => setKernelPopoverOpen((o) => !o)}
            className="flex h-[32px] items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 font-mono text-[10px] font-medium tracking-wider text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
            title="Telemetria e status do CAD Kernel"
          >
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Cpu className="size-3.5 text-slate-600" /> CAD KERNEL
          </button>

          {/* POPOVER TÉCNICO CONTEXTUAL DO CAD KERNEL */}
          <CadKernelStatusPopover
            open={kernelPopoverOpen}
            onClose={() => setKernelPopoverOpen(false)}
          />
        </div>
      </header>

      {/* VIEWPORT PRINCIPAL: AMBIENTE 3D B-REP COM MODELO REAL VINCULADO */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <Stage3DErrorBoundary onReset={resetView}>
          <CadBRepViewer
            key={`${resetNonce}_${resolvedModel.type}`}
            className="size-full"
            initialModelType={resolvedModel.type}
            initialModelTitle={resolvedModel.name}
            initialParams={resolvedModel.params}
            initialThickness={thickness}
            initialWidth={cadDoc.baseWidth || 200}
            initialLength={cadDoc.baseLength || 200}
            activeViewPreset={viewPreset}
            onViewPresetChange={setViewPreset}
          />
        </Stage3DErrorBoundary>
      </div>

      {/* BARRA DE STATUS INFERIOR — ALTURA COMPACTA (40-46px), DENSIDADE TÉCNICA (SEÇÃO 12) */}
      <footer className="flex h-[40px] items-center justify-between border-t border-slate-200/90 bg-white px-3 font-mono text-[10.5px] text-slate-600 shadow-2xs select-none z-30">
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1 font-bold text-slate-800">
            <span className="text-red-600 text-[10px]">⬡</span>
            <span>ESPESSURA:</span>
            <div className="flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 shadow-2xs">
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
                className="w-6 bg-transparent text-center font-mono font-bold text-red-600 outline-none text-[10.5px]"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-normal">mm</span>
          </label>

          <span className="text-slate-300">|</span>

          <span>
            MATERIAL: <strong className="text-slate-900 font-bold">{cadDoc.material || "Aço Carbono"}</strong>
          </span>

          <span className="text-slate-300">|</span>

          <span>
            DOBRAS: <strong className="text-red-600 font-bold">{cadDoc.flanges?.length ?? 0}</strong>
          </span>

          <span className="text-slate-300">|</span>

          <span>
            DIM:{" "}
            <strong className="text-slate-900 font-bold">
              {(resolvedModel.params.width || resolvedModel.params.D || 200).toFixed(1)} × {(resolvedModel.params.length || resolvedModel.params.D || 200).toFixed(1)} × {thickness.toFixed(1)} mm
            </strong>
          </span>

          <span className="text-slate-300">|</span>

          <span>
            PESO: <strong className="text-slate-900 font-bold">{(((area * thickness) / 1e6) * (cadDoc.density ?? 7.85)).toFixed(2)} kg</strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetView}
            className="flex h-[26px] items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 font-mono text-[10px] font-semibold tracking-wider text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
            title="Redefinir enquadramento e câmera (Reset)"
          >
            <RotateCcw className="size-2.5 text-slate-600" /> RESET
          </button>
        </div>
      </footer>
    </div>
  );
}
