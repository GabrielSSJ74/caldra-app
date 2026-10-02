/**
 * CALDRA CAD — B-REP 3D SOLID VIEWER, GIZMO & FERRAMENTAS CAD (FASE 06)
 *
 * Interface interativa React conectando o motor ThreeBRepRenderer com o CALDRA CAD CORE.
 * Recursos integrados:
 * - FASE 03: Visualização do sólido B-Rep (OCCT WASM) e modos SOMB, SOMB+AR, ARAME
 * - FASE 04: Seleção topológica (Face, Edge, Vertex) e medição analítica tridimensional
 * - FASE 05: Árvore Paramétrica de Recursos (DAG) com Rollback e Supressão
 * - FASE 06: Ferramentas de edição B-Rep reais, Gizmo CAD 3D (Push-Pull), Undo/Redo e painel contextual
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  Maximize2,
  Download,
  ShieldCheck,
  Loader2,
  Ruler,
  XCircle,
  Wand2,
  Layers,
  Sliders,
  Undo2,
  Redo2,
  Move,
  RotateCw,
  ArrowUpRight,
  CircleDot,
  Check,
  Flame,
  Compass,
  FileText,
  Boxes,
} from "lucide-react";
import { CaldraBoilermakingDialog } from "@/components/lab2d/CaldraBoilermakingDialog";
import { CaldraFlatPatternDialog } from "@/components/lab2d/CaldraFlatPatternDialog";
import { CaldraDraftingDialog } from "@/components/lab2d/CaldraDraftingDialog";
import { CaldraWeldmentDialog } from "@/components/lab2d/CaldraWeldmentDialog";
import { ThreeBRepRenderer, type CadGizmoMode } from "@/lib/cad/renderer/ThreeBRepRenderer";
import { getCadKernel } from "@/lib/cad/core";
import { CadTopologicalNaming } from "@/lib/cad/core/CadTopologicalNaming";
import { CadFeatureTree } from "@/lib/cad/features/CadFeatureTree";
import { CadBRepEditor } from "@/lib/cad/core/CadBRepEditor";
import type { CadFeatureNode } from "@/lib/cad/features/CadFeatureModel";
import { CadFeatureTreePanel } from "@/components/lab2d/CadFeatureTreePanel";
import type { CadShape } from "@/lib/cad/core/CadShape";
import type { CadFace, CadEdge, CadVertex } from "@/lib/cad/core/CadTopology";
import type {
  CadSelectedEntity,
  CadSelectionType,
  CadMeasurementResult,
} from "@/lib/cad/core/CadSelection";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";
import type { MassProperties } from "@/lib/cad/core/CadKernel";
import {
  VIEW_PRESETS,
  EDGE_MODES,
  type ViewPresetId,
  type EdgeMode,
} from "@/lib/viz3d/cameraPresets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CadBRepViewerProps {
  className?: string;
  initialWidth?: number;
  initialLength?: number;
  initialThickness?: number;
}

export function CadBRepViewer({
  className,
  initialWidth = 100,
  initialLength = 100,
  initialThickness = 50,
}: CadBRepViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeBRepRenderer | null>(null);

  // Alternância entre Modo Rápido (Sliders) e Modo Árvore (DAG Feature Tree)
  const [controlTab, setControlTab] = useState<"quick" | "tree">("quick");

  // Motor da Árvore de Recursos e Editor B-Rep (FASE 05 & 06)
  const treeRef = useRef<CadFeatureTree>(new CadFeatureTree());
  const editorRef = useRef<CadBRepEditor>(new CadBRepEditor(treeRef.current));
  const [featuresList, setFeaturesList] = useState<readonly CadFeatureNode[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [rollbackIndex, setRollbackIndex] = useState<number>(-1);

  // Histórico de Edição B-Rep
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Gizmo CAD Interativo (FASE 06)
  const [gizmoMode, setGizmoMode] = useState<CadGizmoMode>("off");
  const [gizmoActiveDelta, setGizmoActiveDelta] = useState<{ x: number; y: number; z: number } | null>(null);

  // Modelos Paramétricos de Caldeiraria CALDRA (FASE 07)
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);

  // Planificação e Fabricação Industrial (FASE 08)
  const [flatPatternDialogOpen, setFlatPatternDialogOpen] = useState(false);

  // Drafting & Detalhamento Técnico 2D Industrial (FASE 09)
  const [draftingDialogOpen, setDraftingDialogOpen] = useState(false);

  // Estruturas Metálicas & Perfis Industriais (FASE 10)
  const [weldmentDialogOpen, setWeldmentDialogOpen] = useState(false);

  // Estados de Apresentação
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("shaded-edges");
  const [viewPreset, setViewPreset] = useState<ViewPresetId>("iso");
  const [selectionType, setSelectionType] = useState<CadSelectionType>("face");

  // Estados de Seleção e Metrologia (FASE 04)
  const [selectedEntity, setSelectedEntity] = useState<CadSelectedEntity | null>(null);
  const [multiSelection, setMultiSelection] = useState<CadSelectedEntity[]>([]);
  const [measurement, setMeasurement] = useState<CadMeasurementResult | null>(null);
  const [faceDetails, setFaceDetails] = useState<CadFace | null>(null);
  const [edgeDetails, setEdgeDetails] = useState<CadEdge | null>(null);
  const [vertexDetails, setVertexDetails] = useState<CadVertex | null>(null);
  const [adjacentFaces, setAdjacentFaces] = useState<CadFace[]>([]);

  const safeMultiSelection = Array.isArray(multiSelection) ? multiSelection : [];
  const safeAdjacentFaces = Array.isArray(adjacentFaces) ? adjacentFaces : [];

  // Parâmetros da Peça (POC 01)
  const [dimX, setDimX] = useState(initialWidth);
  const [dimY, setDimY] = useState(initialLength);
  const [dimZ, setDimZ] = useState(initialThickness);
  const [hasHole, setHasHole] = useState(false);
  const [holeRadius, setHoleRadius] = useState(15);
  const [hasFillet, setHasFillet] = useState(false);
  const [filletRadius, setFilletRadius] = useState(4);
  const [hasChamfer, setHasChamfer] = useState(false);
  const [chamferDist, setChamferDist] = useState(3);

  // Estado do Kernel e Geometria
  const [loading, setLoading] = useState(true);
  const [activeShape, setActiveShape] = useState<CadShape | null>(null);
  const [massProps, setMassProps] = useState<MassProperties | null>(null);
  const [tessData, setTessData] = useState<CadTessellatedShape | null>(null);

  // Atualiza histórico de Undo/Redo no editor
  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(editorRef.current.canUndo());
    setCanRedo(editorRef.current.canRedo());
  }, []);

  // Reconstrução via Feature Tree (FASE 05)
  const rebuildFromTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await treeRef.current.rebuild();
      if (res.success && res.activeShape && res.tessellation) {
        setActiveShape(res.activeShape);
        setTessData(res.tessellation);
        setMassProps(res.massProperties);
        rendererRef.current?.setShape(res.tessellation);
      }
      setFeaturesList([...treeRef.current.getFeatures()]);
      refreshHistoryFlags();
    } catch (err) {
      console.error("[CadBRepViewer] Erro ao reconstruir árvore:", err);
      toast.error("Erro na reconstrução da Árvore de Recursos.");
    } finally {
      setLoading(false);
    }
  }, [refreshHistoryFlags]);

  // Inicialização do ThreeBRepRenderer com suporte ao Gizmo CAD
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new ThreeBRepRenderer({
      container: containerRef.current,
      gizmoMode,
      onSelect: (entity, multi) => {
        setSelectedEntity(entity);
        setMultiSelection(Array.isArray(multi) ? multi : entity ? [entity] : []);
      },
      onMeasure: (meas) => {
        setMeasurement(meas);
      },
      onGizmoChange: (delta) => {
        setGizmoActiveDelta(delta);
      },
      onGizmoCommit: async (delta, primary) => {
        setGizmoActiveDelta(null);
        if (primary && primary.type === "face") {
          toast.info(`Atualizando geometria B-Rep via Gizmo (${delta.z >= 0 ? "+" : ""}${delta.z.toFixed(1)} mm)...`);
          await editorRef.current.applyFacePushPull(primary.index, delta, faceDetails?.normal);
          await rebuildFromTree();
          toast.success("Geometria B-Rep reconstruída com sucesso.");
        }
      },
    });

    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [gizmoMode, faceDetails?.normal, rebuildFromTree]);

  // Sincroniza modo de aresta e tipo de seleção com o renderer
  useEffect(() => {
    rendererRef.current?.setEdgeMode(edgeMode);
  }, [edgeMode]);

  useEffect(() => {
    rendererRef.current?.setSelectionType(selectionType);
  }, [selectionType]);

  useEffect(() => {
    rendererRef.current?.setGizmoMode(gizmoMode);
  }, [gizmoMode]);

  // Sincronização dos Sliders Rápidos com a Árvore de Recursos
  const syncQuickParamsToTreeAndRebuild = useCallback(async () => {
    const tree = treeRef.current;
    tree.dispose();

    // 1. Caixa Base
    tree.addFeature({
      name: "Caixa Sólida Base",
      type: "base_box",
      parameters: { width: dimX, length: dimY, height: dimZ, centered: true },
    });

    // 2. Furo Central Cilíndrico
    if (hasHole) {
      tree.addFeature({
        name: `Furo Ø${(holeRadius * 2).toFixed(0)} mm`,
        type: "hole_cut",
        parameters: {
          diameter: holeRadius * 2,
          depth: dimZ + 40,
          isThrough: true,
          position: { x: 0, y: 0, z: -dimZ / 2 },
        },
      });
    }

    // 3. Filete
    if (hasFillet) {
      tree.addFeature({
        name: `Filete R${filletRadius} mm`,
        type: "fillet",
        parameters: { radius: filletRadius, edgeIndices: [0, 1] },
      });
    }

    // 4. Chanfro
    if (hasChamfer) {
      tree.addFeature({
        name: `Chanfro ${chamferDist} mm`,
        type: "chamfer",
        parameters: { distance: chamferDist, edgeIndices: [2, 3] },
      });
    }

    await rebuildFromTree();
  }, [dimX, dimY, dimZ, hasHole, holeRadius, hasFillet, filletRadius, hasChamfer, chamferDist, rebuildFromTree]);

  // Carrega a primeira geometria ao montar
  useEffect(() => {
    void syncQuickParamsToTreeAndRebuild();
  }, [syncQuickParamsToTreeAndRebuild]);

  // Atualiza detalhes topológicos aprofundados quando a seleção muda (FASE 04)
  useEffect(() => {
    if (!activeShape || !selectedEntity) {
      setFaceDetails(null);
      setEdgeDetails(null);
      setVertexDetails(null);
      setAdjacentFaces([]);
      return;
    }

    const kernel = getCadKernel();

    if (selectedEntity.type === "face") {
      void kernel.getFaces(activeShape).then((faces) => {
        const f = faces[selectedEntity.index];
        if (f) {
          setFaceDetails(f);
          void kernel.getAdjacentFaces(activeShape, f).then((adj) => setAdjacentFaces(adj));
        }
      });
      setEdgeDetails(null);
      setVertexDetails(null);
    } else if (selectedEntity.type === "edge") {
      void kernel.getEdges(activeShape).then((edges) => {
        const e = edges[selectedEntity.index];
        if (e) setEdgeDetails(e);
      });
      setFaceDetails(null);
      setVertexDetails(null);
      setAdjacentFaces([]);
    } else if (selectedEntity.type === "vertex") {
      void kernel.getVertices(activeShape).then((vertices) => {
        const v = vertices[selectedEntity.index];
        if (v) setVertexDetails(v);
      });
      setFaceDetails(null);
      setEdgeDetails(null);
      setAdjacentFaces([]);
    }
  }, [activeShape, selectedEntity]);

  // AÇÕES B-REP DIRETAS (FASE 06)

  // 1. Extrudar / Push-Pull na Face Selecionada
  const handleExtrudeFace = async (dist = 20) => {
    if (!selectedEntity || selectedEntity.type !== "face") return;
    toast.info(`Extrudando face #${selectedEntity.index} em +${dist} mm...`);
    await editorRef.current.applyFacePushPull(
      selectedEntity.index,
      { x: 0, y: 0, z: dist },
      faceDetails?.normal,
    );
    await rebuildFromTree();
    toast.success(`Face extrudada (+${dist} mm) reconstruída no B-Rep.`);
  };

  // 2. Adicionar Furo na Face Selecionada
  const handleAddHoleOnSelectedFace = async () => {
    if (!selectedEntity || selectedEntity.type !== "face") return;
    const pt = selectedEntity.point ?? { x: 0, y: 0, z: 0 };
    await editorRef.current.addHole(20, 50, pt, true);
    await rebuildFromTree();
    toast.success(`Furo Ø20 mm criado na Face #${selectedEntity.index}.`);
  };

  // 3. Aplicar Filete na aresta selecionada
  const handleApplyFilletOnSelectedEdge = async (radius = 4) => {
    if (!selectedEntity || selectedEntity.type !== "edge") return;
    await editorRef.current.applyFillet([selectedEntity.index], radius);
    await rebuildFromTree();
    toast.success(`Filete R${radius} mm aplicado na aresta #${selectedEntity.index}.`);
  };

  // 4. Aplicar Chanfro na aresta selecionada
  const handleApplyChamferOnSelectedEdge = async (dist = 3) => {
    if (!selectedEntity || selectedEntity.type !== "edge") return;
    await editorRef.current.applyChamfer([selectedEntity.index], dist);
    await rebuildFromTree();
    toast.success(`Chanfro ${dist} mm aplicado na aresta #${selectedEntity.index}.`);
  };

  // 5. Desfazer (Undo)
  const handleUndo = async () => {
    if (!editorRef.current.canUndo()) return;
    const ok = await editorRef.current.undo();
    if (ok) {
      await rebuildFromTree();
      toast.info("Ação desfeita.");
    }
  };

  // 6. Refazer (Redo)
  const handleRedo = async () => {
    if (!editorRef.current.canRedo()) return;
    const ok = await editorRef.current.redo();
    if (ok) {
      await rebuildFromTree();
      toast.info("Ação refeita.");
    }
  };

  // 7. Limpar Seleção
  const handleClearSelection = () => {
    rendererRef.current?.clearSelection();
    setSelectedEntity(null);
    setMultiSelection([]);
    setMeasurement(null);
  };

  // 8. Exportação STEP (ISO 10303-21)
  const handleExportStep = async () => {
    if (!activeShape) return;
    try {
      const kernel = getCadKernel();
      const stepData = await kernel.exportStep(activeShape);

      const blob = new Blob([stepData], { type: "application/step" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `caldra_peca_${Date.now()}.step`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo STEP (ISO 10303-21) exportado com sucesso!");
    } catch {
      toast.error("Erro ao exportar arquivo STEP.");
    }
  };

  return (
    <div className={cn("relative flex size-full flex-col overflow-hidden bg-background", className)}>
      {/* BARRA SUPERIOR DE CONTROLES CAD */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* VISTAS E MODOS DE ARESTA */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Vistas Padrão */}
          <div className="flex rounded-md border border-line bg-card/85 p-0.5 shadow-md backdrop-blur">
            {VIEW_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setViewPreset(p.id);
                  rendererRef.current?.setView(p.id);
                }}
                className={cn(
                  "h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                  viewPreset === p.id
                    ? "bg-accent/20 text-accent border border-accent/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Modos Técnicos: SOMB, SOMB+AR, ARAME */}
          <div className="flex rounded-md border border-line bg-card/85 p-0.5 shadow-md backdrop-blur">
            {EDGE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setEdgeMode(m.id)}
                className={cn(
                  "h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                  edgeMode === m.id
                    ? "bg-accent/20 text-accent border border-accent/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Enquadramento */}
          <button
            type="button"
            onClick={() => rendererRef.current?.fitView(true)}
            title="Enquadrar modelo (Fit)"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-card/85 text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>

        {/* CONTROLES CENTRAIS: GIZMO CAD & HISTÓRICO UNDO/REDO (FASE 06) */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Alternador de Gizmo */}
          <div className="flex items-center rounded-md border border-line bg-card/85 p-0.5 shadow-md backdrop-blur">
            <span className="px-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
              GIZMO:
            </span>
            <button
              type="button"
              onClick={() => setGizmoMode("off")}
              className={cn(
                "h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                gizmoMode === "off"
                  ? "bg-accent/20 text-accent border border-accent/40"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              OFF
            </button>
            <button
              type="button"
              onClick={() => setGizmoMode("translate")}
              className={cn(
                "flex items-center gap-1 h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                gizmoMode === "translate"
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Manipulador 3D: Translação e Push-Pull de faces"
            >
              <Move className="size-3" /> Mover
            </button>
            <button
              type="button"
              onClick={() => setGizmoMode("rotate")}
              className={cn(
                "flex items-center gap-1 h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                gizmoMode === "rotate"
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Manipulador 3D: Rotação angular nos eixos"
            >
              <RotateCw className="size-3" /> Girar
            </button>
          </div>

          {/* Histórico Undo / Redo */}
          <div className="flex items-center rounded-md border border-line bg-card/85 p-0.5 shadow-md backdrop-blur">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              title="Desfazer alteração B-Rep (Undo)"
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
                canUndo ? "text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={handleRedo}
              title="Refazer alteração B-Rep (Redo)"
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
                canRedo ? "text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* TIPO DE SELEÇÃO TOPOLÓGICA, TEMPLATES DE CALDEIRARIA, PLANIFICAÇÃO & MULTI-SELEÇÃO */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Botão de Templates de Caldeiraria CALDRA (FASE 07) */}
          <button
            type="button"
            onClick={() => setTemplatesDialogOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-2.5 font-mono text-[9px] font-bold text-accent shadow-md backdrop-blur hover:bg-accent/25 transition-colors uppercase"
            title="Modelos Paramétricos de Caldeiraria CALDRA"
          >
            <Flame className="size-3 text-accent" /> Caldeiraria
          </button>

          {/* Botão de Planificação e Fabricação (FASE 08) */}
          <button
            type="button"
            onClick={() => setFlatPatternDialogOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 font-mono text-[9px] font-bold text-emerald-400 shadow-md backdrop-blur hover:bg-emerald-500/25 transition-colors uppercase"
            title="Planificar sólido 3D, exportar DXF e gerar código G para corte CNC"
          >
            <Compass className="size-3 text-emerald-400" /> Planificar
          </button>

          {/* Botão de Detalhamento Técnico 2D / Prancha ABNT (FASE 09) */}
          <button
            type="button"
            onClick={() => setDraftingDialogOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/15 px-2.5 font-mono text-[9px] font-bold text-blue-400 shadow-md backdrop-blur hover:bg-blue-500/25 transition-colors uppercase"
            title="Gerar prancha técnica de fabricação 2D ABNT / ISO com vistas ortográficas e carimbo"
          >
            <FileText className="size-3 text-blue-400" /> Detalhamento 2D
          </button>

          {/* Botão de Estruturas Metálicas & Perfis Industriais (FASE 10) */}
          <button
            type="button"
            onClick={() => setWeldmentDialogOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 font-mono text-[9px] font-bold text-amber-400 shadow-md backdrop-blur hover:bg-amber-500/25 transition-colors uppercase"
            title="Modelagem de perfis industriais normalizados, vigas W/I, tubos metalon e lista de corte"
          >
            <Boxes className="size-3 text-amber-400" /> Estruturas
          </button>

          <div className="flex items-center gap-1 rounded-md border border-line bg-card/85 p-0.5 shadow-md backdrop-blur">
            <span className="px-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
              FILTRO:
            </span>
            {(["face", "edge", "vertex"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectionType(t)}
                className={cn(
                  "h-6 px-2 font-mono text-[9px] font-bold uppercase transition-colors rounded-sm",
                  selectionType === t
                    ? "bg-accent text-accent-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "face" ? "Face" : t === "edge" ? "Aresta" : "Vértice"}
              </button>
            ))}
          </div>

          {safeMultiSelection.length > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="flex h-7 items-center gap-1 rounded-md border border-line bg-card/85 px-2 font-mono text-[9px] font-semibold text-muted-foreground shadow-md backdrop-blur hover:text-destructive"
              title="Limpar seleção ativa"
            >
              <XCircle className="size-3" /> Limpar ({safeMultiSelection.length})
            </button>
          )}
        </div>
      </div>

      {/* VIEWPORT THREE.JS */}
      <div ref={containerRef} className="relative size-full min-h-0 cursor-grab active:cursor-grabbing">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-xs">
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="font-mono text-xs font-semibold tracking-wider text-foreground uppercase">
              Calculando Topologia no OCCT...
            </p>
          </div>
        )}

        {/* FEEDBACK AO VIVO DO GIZMO CAD QUANDO ARRASTANDO (FASE 06) */}
        {gizmoActiveDelta && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none z-30 flex items-center gap-2 rounded-full border border-accent bg-card/95 px-4 py-1.5 font-mono text-[10px] font-bold text-accent shadow-2xl backdrop-blur-md animate-pulse">
            <Move className="size-3.5" />
            <span>
              DESLOCAMENTO: ΔX: {gizmoActiveDelta.x.toFixed(1)} mm · ΔY: {gizmoActiveDelta.y.toFixed(1)} mm · ΔZ: {gizmoActiveDelta.z.toFixed(1)} mm
            </span>
          </div>
        )}

        {/* BANNER DE INSTRUÇÃO MULTI-SELEÇÃO */}
        {!gizmoActiveDelta && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 pointer-events-none rounded-full border border-line/60 bg-card/70 px-3 py-1 font-mono text-[9px] text-muted-foreground shadow-sm backdrop-blur">
            Dica: Pressione <kbd className="rounded bg-muted px-1 font-semibold text-foreground">Shift</kbd> + Clique para selecionar 2 entidades e medir a distância 3D.
          </div>
        )}
      </div>

      {/* PAINEL LATERAL ESQUERDO: ALTERNÂNCIA PARÂMETROS RÁPIDOS ↔ ÁRVORE DE RECURSOS (FASE 05) */}
      <div className="absolute bottom-3 left-3 z-10 flex max-w-sm flex-col gap-2 rounded-xl border border-line bg-card/90 p-3 shadow-xl backdrop-blur-md">
        {/* ABA SELETORA */}
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center rounded-lg border border-line bg-background/60 p-0.5">
            <button
              type="button"
              onClick={() => setControlTab("quick")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase transition-colors",
                controlTab === "quick" ? "bg-accent/20 text-accent font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sliders className="size-3" /> Rápido
            </button>
            <button
              type="button"
              onClick={() => setControlTab("tree")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase transition-colors",
                controlTab === "tree" ? "bg-accent/20 text-accent font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="size-3 text-accent" /> Árvore (DAG)
            </button>
          </div>

          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-accent">
            OCCT WASM
          </span>
        </div>

        {/* CONTEÚDO DA ABA RÁPIDA (POC 01) */}
        {controlTab === "quick" ? (
          <>
            {/* DIMENSÕES DA CAIXA */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-mono text-[8.5px] uppercase text-muted-foreground">Largura (X)</label>
                <input
                  type="number"
                  value={dimX}
                  onChange={(e) => setDimX(Number(e.target.value))}
                  className="w-full rounded border border-line bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                />
              </div>
              <div>
                <label className="font-mono text-[8.5px] uppercase text-muted-foreground">Comprimento (Y)</label>
                <input
                  type="number"
                  value={dimY}
                  onChange={(e) => setDimY(Number(e.target.value))}
                  className="w-full rounded border border-line bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                />
              </div>
              <div>
                <label className="font-mono text-[8.5px] uppercase text-muted-foreground">Altura (Z)</label>
                <input
                  type="number"
                  value={dimZ}
                  onChange={(e) => setDimZ(Number(e.target.value))}
                  className="w-full rounded border border-line bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                />
              </div>
            </div>

            {/* CONTROLE DE FURO */}
            <div className="flex items-center justify-between border-t border-line/60 pt-1.5">
              <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHole}
                  onChange={(e) => setHasHole(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                Furo Central
              </label>
              {hasHole && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[8.5px] text-muted-foreground">Ø</span>
                  <input
                    type="number"
                    value={holeRadius * 2}
                    onChange={(e) => setHoleRadius(Number(e.target.value) / 2)}
                    className="w-12 rounded border border-line bg-background px-1 py-0.5 font-mono text-[9px] text-center"
                  />
                  <span className="font-mono text-[8.5px] text-muted-foreground">mm</span>
                </div>
              )}
            </div>

            {/* CONTROLE DE FILETE */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasFillet}
                  onChange={(e) => setHasFillet(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                Filete Arestas
              </label>
              {hasFillet && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[8.5px] text-muted-foreground">R</span>
                  <input
                    type="number"
                    value={filletRadius}
                    onChange={(e) => setFilletRadius(Number(e.target.value))}
                    className="w-12 rounded border border-line bg-background px-1 py-0.5 font-mono text-[9px] text-center"
                  />
                  <span className="font-mono text-[8.5px] text-muted-foreground">mm</span>
                </div>
              )}
            </div>

            {/* CONTROLE DE CHANFRO */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasChamfer}
                  onChange={(e) => setHasChamfer(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                Chanfro
              </label>
              {hasChamfer && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[8.5px] text-muted-foreground">D</span>
                  <input
                    type="number"
                    value={chamferDist}
                    onChange={(e) => setChamferDist(Number(e.target.value))}
                    className="w-12 rounded border border-line bg-background px-1 py-0.5 font-mono text-[9px] text-center"
                  />
                  <span className="font-mono text-[8.5px] text-muted-foreground">mm</span>
                </div>
              )}
            </div>
          </>
        ) : (
          /* CONTEÚDO DA ÁRVORE PARAMÉTRICA DE RECURSOS (FASE 05) */
          <CadFeatureTreePanel
            tree={treeRef.current}
            features={featuresList}
            selectedFeatureId={selectedFeatureId}
            onSelectFeature={(id) => setSelectedFeatureId(id)}
            onRebuildTree={rebuildFromTree}
            rollbackIndex={rollbackIndex}
            onRollbackChange={(idx) => {
              setRollbackIndex(idx);
              treeRef.current.setRollbackIndex(idx);
              void rebuildFromTree();
            }}
          />
        )}

        {/* BOTÃO EXPORTAR STEP */}
        <button
          type="button"
          onClick={handleExportStep}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-1.5 font-mono text-[9.5px] font-bold text-accent uppercase transition-colors hover:bg-accent/25"
        >
          <Download className="size-3" /> Exportar STEP Neutro
        </button>
      </div>

      {/* PAINEL DE PROPRIEDADES E METROLOGIA (FASE 04 & 06) */}
      <div className="absolute bottom-3 right-3 z-10 flex w-76 flex-col gap-2 rounded-xl border border-line bg-card/90 p-3 shadow-xl backdrop-blur-md font-mono text-[9.5px]">
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between border-b border-line pb-1.5 text-foreground font-bold">
          <div className="flex items-center gap-1">
            <Ruler className="size-3.5 text-accent" />
            <span className="uppercase">INSPEÇÃO B-REP</span>
          </div>

          <div className="flex items-center gap-1">
            <ShieldCheck className="size-3 text-emerald-400" />
            <span className="text-[8px] text-emerald-400 font-bold">OCCT VALID</span>
          </div>
        </div>

        {/* MEDIÇÃO TRIDIMENSIONAL ENTRE DUAS ENTIDADES (FASE 04) */}
        {measurement ? (
          <div className="flex flex-col gap-1 rounded-lg border border-accent/40 bg-accent/10 p-2 text-foreground">
            <div className="flex justify-between items-center font-bold text-accent">
              <span>DISTÂNCIA REAL:</span>
              <span className="text-xs">{measurement.distance.toFixed(2)} mm</span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1 text-[8.5px] text-muted-foreground border-t border-accent/20">
              <div>ΔX: <strong className="text-foreground">{measurement.deltaX.toFixed(2)}</strong></div>
              <div>ΔY: <strong className="text-foreground">{measurement.deltaY.toFixed(2)}</strong></div>
              <div>ΔZ: <strong className="text-foreground">{measurement.deltaZ.toFixed(2)}</strong></div>
            </div>
            <div className="text-[8px] text-muted-foreground/80 truncate">
              {measurement.type.toUpperCase()} · Shift+Clique para medir
            </div>
          </div>
        ) : null}

        {/* DETALHES DA ENTIDADE SELECIONADA E AÇÕES DE EDIÇÃO RÁPIDA (FASE 06) */}
        {selectedEntity && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-line/60 bg-background/50 p-2 text-foreground">
            <div className="flex items-center justify-between border-b border-line/40 pb-1">
              <span className="font-bold uppercase text-accent">
                {selectedEntity.type === "face" ? "Face" : selectedEntity.type === "edge" ? "Aresta" : "Vértice"} #{selectedEntity.index}
              </span>
              <span className="text-[8px] text-muted-foreground">TOPOLOGIA</span>
            </div>

            {/* SE FOR FACE */}
            {faceDetails && (
              <div className="flex flex-col gap-1 text-muted-foreground text-[9px]">
                <div>
                  Área: <span className="font-semibold text-foreground">{faceDetails.area.toFixed(1)} mm²</span>
                </div>
                <div>
                  Normal:{" "}
                  <span className="font-semibold text-foreground">
                    ({faceDetails.normal.x.toFixed(2)}, {faceDetails.normal.y.toFixed(2)}, {faceDetails.normal.z.toFixed(2)})
                  </span>{" "}
                  <span className="rounded bg-muted px-1 text-[8px] text-accent font-bold">
                    {CadTopologicalNaming.classifyNormal(faceDetails.normal)}
                  </span>
                </div>
                {safeAdjacentFaces.length > 0 && (
                  <div>
                    Faces Adjacentes: <span className="font-semibold text-foreground">{safeAdjacentFaces.length}</span>
                  </div>
                )}

                {/* AÇÕES CONTEXTUAIS DE FACE (FASE 06) */}
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 pt-1 border-t border-line/40">
                  <button
                    type="button"
                    onClick={() => handleExtrudeFace(20)}
                    className="flex items-center justify-center gap-1 rounded border border-accent/40 bg-accent/15 py-1 text-[8.5px] font-bold text-accent hover:bg-accent/25"
                    title="Extrudar face em +20 mm"
                  >
                    <ArrowUpRight className="size-2.5" /> +20mm Push
                  </button>
                  <button
                    type="button"
                    onClick={handleAddHoleOnSelectedFace}
                    className="flex items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[8.5px] font-bold text-foreground hover:bg-muted"
                    title="Criar furo passante de Ø20 mm nesta face"
                  >
                    <CircleDot className="size-2.5 text-accent" /> Furar Ø20
                  </button>
                </div>
              </div>
            )}

            {/* SE FOR ARESTA */}
            {edgeDetails && (
              <div className="flex flex-col gap-1 text-muted-foreground text-[9px]">
                <div>
                  Tipo: <span className="font-semibold text-foreground uppercase">{edgeDetails.curveType}</span>
                </div>
                <div>
                  Comprimento: <span className="font-semibold text-foreground">{typeof edgeDetails?.length === "number" ? edgeDetails.length.toFixed(2) : "0.00"} mm</span>
                </div>

                {/* AÇÕES CONTEXTUAIS DE ARESTA (FASE 06) */}
                <div className="mt-1.5 flex items-center gap-1 pt-1 border-t border-line/40">
                  <button
                    type="button"
                    onClick={() => handleApplyFilletOnSelectedEdge(4)}
                    className="flex flex-1 items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[8.5px] font-bold text-foreground hover:bg-muted"
                  >
                    <Wand2 className="size-2.5 text-accent" /> Filete R4
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyChamferOnSelectedEdge(3)}
                    className="flex flex-1 items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[8.5px] font-bold text-foreground hover:bg-muted"
                  >
                    <Wand2 className="size-2.5 text-amber-500" /> Chanfro 3
                  </button>
                </div>
              </div>
            )}

            {/* SE FOR VÉRTICE */}
            {vertexDetails && (
              <div className="flex flex-col gap-0.5 text-muted-foreground text-[9px]">
                <div>
                  Posição XYZ:{" "}
                  <span className="font-semibold text-foreground">
                    ({vertexDetails.point.x.toFixed(2)}, {vertexDetails.point.y.toFixed(2)}, {vertexDetails.point.z.toFixed(2)}) mm
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROPRIEDADES GLOBAIS DO SÓLIDO (SEÇÃO 17) */}
        {massProps && (
          <div className="flex flex-col gap-0.5 border-t border-line/60 pt-1 text-muted-foreground">
            <div>
              Dimensões: <span className="font-semibold text-foreground">{dimX} × {dimY} × {dimZ} mm</span>
            </div>
            <div>
              Volume: <span className="font-semibold text-foreground">{massProps.volume.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mm³</span>
            </div>
            <div>
              Massa (Aço A36): <span className="font-semibold text-accent">{massProps.mass.toFixed(3)} kg</span>
            </div>
            <div>
              Área Total: <span className="font-semibold text-foreground">{massProps.surfaceArea.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mm²</span>
            </div>

            {/* AÇÃO RÁPIDA DE FABRICAÇÃO & DETALHAMENTO */}
            <div className="mt-1 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setFlatPatternDialogOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 py-1 text-[8.5px] font-bold text-emerald-400 uppercase hover:bg-emerald-500/25 transition-colors"
              >
                <Compass className="size-3" /> Planificar & Gerar DXF/CNC
              </button>

              <button
                type="button"
                onClick={() => setDraftingDialogOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded border border-blue-500/40 bg-blue-500/15 py-1 text-[8.5px] font-bold text-blue-400 uppercase hover:bg-blue-500/25 transition-colors"
              >
                <FileText className="size-3" /> Prancha Técnica ABNT (2D)
              </button>

              <button
                type="button"
                onClick={() => setWeldmentDialogOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/15 py-1 text-[8.5px] font-bold text-amber-400 uppercase hover:bg-amber-500/25 transition-colors"
              >
                <Boxes className="size-3" /> Estruturas & Cut-List
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DIÁLOGO DE TEMPLATES PARAMÉTRICOS DE CALDEIRARIA CALDRA (FASE 07) */}
      <CaldraBoilermakingDialog
        open={templatesDialogOpen}
        onClose={() => setTemplatesDialogOpen(false)}
        tree={treeRef.current}
        onRebuild={rebuildFromTree}
      />

      {/* DIÁLOGO DE PLANIFICAÇÃO E FABRICAÇÃO INDUSTRIAL (FASE 08) */}
      <CaldraFlatPatternDialog
        open={flatPatternDialogOpen}
        onClose={() => setFlatPatternDialogOpen(false)}
        features={featuresList}
        fallbackDimensions={{ width: dimX, length: dimY, thickness: dimZ }}
      />

      {/* DIÁLOGO DE DETALHAMENTO TÉCNICO E PRANCHA INDUSTRIAL ABNT (FASE 09) */}
      <CaldraDraftingDialog
        open={draftingDialogOpen}
        onClose={() => setDraftingDialogOpen(false)}
        features={featuresList}
        massProps={massProps}
        dimensions={{ width: dimX, length: dimY, height: dimZ }}
      />

      {/* DIÁLOGO DE ESTRUTURAS METÁLICAS, PERFIS E CUT-LIST (FASE 10) */}
      <CaldraWeldmentDialog
        open={weldmentDialogOpen}
        onClose={() => setWeldmentDialogOpen(false)}
        tree={treeRef.current}
        onRebuild={rebuildFromTree}
      />
    </div>
  );
}
