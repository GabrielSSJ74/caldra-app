/**
 * CALDRA CHAMFER — 3D CAD CORE AMBIENTE DEFINITIVO (REPRODUÇÃO DA IMAGEM DE REFERÊNCIA)
 *
 * Arquitetura de 3 Níveis:
 * NÍVEL 1 — SEMPRE VISÍVEL:
 *   - Header Superior (2D Projeto, 2D Sketch, 3D Sólido, Título CONE, Wire3D, CAD Core 3D, CAD Kernel)
 *   - Viewport 3D Central com peça enquadrada, iluminação suave e cotas técnicas sobrepostas
 *   - Barra de Vistas flutuante (ISO, FR, LAT, SUP | SOMB, SOMB+AR, ARAME + Enquadrar)
 *   - Barra de Status Inferior persistente (Espessura, Material, Dobras, Dimensões, Peso, Reset)
 *
 * NÍVEL 2 — ACESSO RÁPIDO:
 *   - Barra de Manipulação Rápida (Gizmo, Mover, Girar, Undo, Redo, Fullscreen)
 *   - Ações Principais no Chão do Viewport (Planificar, Prancha 2D, Estruturas, CNC / DXF)
 *
 * NÍVEL 3 — CONTEXTUAL / SMART FLYOUT:
 *   - Barra Lateral Esquerda de Categorias (Criar, Modificar, Detalhes, Chapa, Estruturas, Medir, Exportar)
 *   - Painel Contextual Direito (Parâmetros com mini-diagrama esquemático, Inspeção B-Rep, Filtro)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Undo2,
  Redo2,
  Move,
  RotateCw,
  Maximize2,
  Minimize2,
  Box,
  Compass,
  FileText,
  Boxes,
  Scissors,
  Layers,
  Wrench,
  Ruler,
  Download,
  Settings,
  X,
  Check,
  Flame,
  HelpCircle,
  Sliders,
  Eye,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Crosshair,
  RefreshCw,
} from "lucide-react";
import { ThreeBRepRenderer, type CadGizmoMode } from "@/lib/cad/renderer/ThreeBRepRenderer";
import { getCadKernel } from "@/lib/cad/core";
import { CadFeatureTree } from "@/lib/cad/features/CadFeatureTree";
import { CadBRepEditor } from "@/lib/cad/core/CadBRepEditor";
import type { CadFeatureNode } from "@/lib/cad/features/CadFeatureModel";
import type { CadShape } from "@/lib/cad/core/CadShape";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";
import type { MassProperties } from "@/lib/cad/core/CadKernel";
import type { CadFace, CadEdge, CadVertex } from "@/lib/cad/core/CadTopology";
import type {
  CadSelectedEntity,
  CadSelectionType,
  CadMeasurementResult,
} from "@/lib/cad/core/CadSelection";
import type { EdgeMode, ViewPresetId } from "@/lib/viz3d/cameraPresets";
import { CaldraBoilermakingDialog } from "@/components/lab2d/CaldraBoilermakingDialog";
import { CaldraFlatPatternDialog } from "@/components/lab2d/CaldraFlatPatternDialog";
import { CaldraDraftingDialog } from "@/components/lab2d/CaldraDraftingDialog";
import { CaldraWeldmentDialog } from "@/components/lab2d/CaldraWeldmentDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CadBRepViewerProps {
  className?: string;
  initialWidth?: number;
  initialLength?: number;
  initialThickness?: number;
}

type LeftCategory =
  | "none"
  | "criar"
  | "modificar"
  | "detalhes"
  | "chapa"
  | "estruturas"
  | "medir"
  | "exportar";

type RightPanelTab = "parametros" | "inspecao" | "filtro";

export function CadBRepViewer({
  className,
  initialWidth = 200,
  initialLength = 200,
  initialThickness = 3,
}: CadBRepViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeBRepRenderer | null>(null);

  // Motor da Árvore de Recursos e Editor B-Rep
  const treeRef = useRef<CadFeatureTree>(new CadFeatureTree());
  const editorRef = useRef<CadBRepEditor>(new CadBRepEditor(treeRef.current));
  const [featuresList, setFeaturesList] = useState<readonly CadFeatureNode[]>([]);

  // Histórico de Edição B-Rep
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Estados de Manipulação e Vistas (Nível 1 & 2)
  const [viewPreset, setViewPreset] = useState<ViewPresetId>("iso");
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("shaded-edges");
  const [gizmoMode, setGizmoMode] = useState<CadGizmoMode>("off");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Seleção e Metrologia
  const [selectionType, setSelectionType] = useState<CadSelectionType>("face");
  const [selectedEntity, setSelectedEntity] = useState<CadSelectedEntity | null>(null);
  const [multiSelection, setMultiSelection] = useState<CadSelectedEntity[]>([]);
  const [measurement, setMeasurement] = useState<CadMeasurementResult | null>(null);

  // Painel Esquerdo: Categoria Aberta (Subpainel Flyout que não cobre a peça)
  const [activeLeftCat, setActiveLeftCat] = useState<LeftCategory>("criar");

  // Painel Direito: Abas Contextuais
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightPanelTab>("parametros");

  // Parâmetros Paramétricos do Cone (Modelo Principal da Imagem)
  const [baseDiameterX, setBaseDiameterX] = useState(200);
  const [heightZ, setHeightZ] = useState(100);
  const [thickness, setThickness] = useState(3);
  const [material, setMaterial] = useState("Aço Carbono");

  // Opções Paramétricas
  const [optHole, setOptHole] = useState(false);
  const [optFillet, setOptFillet] = useState(false);
  const [optChamfer, setOptChamfer] = useState(false);

  // Estado do Kernel e Geometria Ativa
  const [loading, setLoading] = useState(true);
  const [activeShape, setActiveShape] = useState<CadShape | null>(null);
  const [massProps, setMassProps] = useState<MassProperties | null>(null);
  const [tessData, setTessData] = useState<CadTessellatedShape | null>(null);

  // Diálogos Especializados
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [flatPatternDialogOpen, setFlatPatternDialogOpen] = useState(false);
  const [draftingDialogOpen, setDraftingDialogOpen] = useState(false);
  const [weldmentDialogOpen, setWeldmentDialogOpen] = useState(false);

  // Atualiza flags de histórico
  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(editorRef.current.canUndo());
    setCanRedo(editorRef.current.canRedo());
  }, []);

  // Reconstrução via Feature Tree
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
      setFeaturesList(treeRef.current.getFeatures());
      refreshHistoryFlags();
    } catch (err: unknown) {
      console.error("[CadBRepViewer] Erro ao reconstruir árvore:", err);
      toast.error("Erro na reconstrução da Árvore B-Rep.");
    } finally {
      setLoading(false);
    }
  }, [refreshHistoryFlags]);

  // Inicialização do ThreeBRepRenderer
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
    });

    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [gizmoMode]);

  // Sincroniza modo de visualização e arestas
  useEffect(() => {
    rendererRef.current?.setEdgeMode(edgeMode);
  }, [edgeMode]);

  useEffect(() => {
    if (rendererRef.current) {
      if (typeof rendererRef.current.setView === "function") {
        rendererRef.current.setView(viewPreset);
      } else if (typeof rendererRef.current.setViewPreset === "function") {
        rendererRef.current.setViewPreset(viewPreset);
      }
    }
  }, [viewPreset]);

  useEffect(() => {
    rendererRef.current?.setSelectionType(selectionType);
  }, [selectionType]);

  useEffect(() => {
    rendererRef.current?.setGizmoMode(gizmoMode);
  }, [gizmoMode]);

  // Constrói o Cone B-Rep Paramétrico
  const applyParametersAndRebuild = useCallback(async () => {
    const tree = treeRef.current;
    tree.dispose();

    // 1. Cone Base de Caldeiraria
    tree.addFeature({
      name: "Cone Truncado Base",
      type: "boilermaking_cone",
      parameters: {
        D: baseDiameterX,
        d: 2, // Quase cônico pontual / cone truncado de alta definição
        height: heightZ,
        thickness,
        material,
      },
    });

    // 2. Furo Central (se ativado nas opções)
    if (optHole) {
      tree.addFeature({
        name: "Furo Central Ø25 mm",
        type: "hole_cut",
        parameters: {
          diameter: 25,
          depth: heightZ + 40,
          isThrough: true,
          position: { x: 0, y: 0, z: -heightZ / 2 },
        },
      });
    }

    // 3. Filete nas Arestas (se ativado)
    if (optFillet) {
      tree.addFeature({
        name: "Filete R4 mm",
        type: "fillet",
        parameters: { radius: 4, edgeIndices: [0] },
      });
    }

    // 4. Chanfro (se ativado)
    if (optChamfer) {
      tree.addFeature({
        name: "Chanfro 3 mm",
        type: "chamfer",
        parameters: { distance: 3, edgeIndices: [1] },
      });
    }

    await rebuildFromTree();
    toast.success("Geometria B-Rep reconstruída com sucesso!");
  }, [baseDiameterX, heightZ, thickness, material, optHole, optFillet, optChamfer, rebuildFromTree]);

  // Constrói o cone inicial ao montar o componente
  useEffect(() => {
    void applyParametersAndRebuild();
  }, [applyParametersAndRebuild]);

  // Ações de Undo / Redo
  const handleUndo = async () => {
    const res = await editorRef.current.undo();
    if (res) await rebuildFromTree();
  };

  const handleRedo = async () => {
    const res = await editorRef.current.redo();
    if (res) await rebuildFromTree();
  };

  // Enquadrar no modelo (Fit to Model)
  const handleFitToModel = () => {
    if (rendererRef.current) {
      if (typeof rendererRef.current.fitView === "function") {
        rendererRef.current.fitView();
      } else if (typeof rendererRef.current.fitToModel === "function") {
        rendererRef.current.fitToModel();
      }
    }
    toast.info("Enquadramento 3D centralizado na peça.");
  };

  return (
    <div
      className={cn(
        "relative size-full overflow-hidden select-none bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0]",
        className,
      )}
    >
      {/* 3D WEBGL CANVAS VIEWPORT */}
      <div ref={containerRef} className="size-full absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* ========================================================================= */}
      {/* COTAS TÉCNICAS SOBREPOSTAS AO VIEWPORT (EXATAMENTE COMO NA IMAGEM)       */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* COTA VERTICAL DE ALTURA (100 mm) */}
        <div className="absolute left-[34%] top-[30%] -translate-y-1/2 flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800">
          <div className="flex flex-col items-center">
            {/* Linha vertical com setas e traços */}
            <div className="h-44 w-px bg-slate-400 relative">
              <span className="absolute -top-1 -left-1 text-[8px] text-slate-600">▲</span>
              <span className="absolute -bottom-1 -left-1 text-[8px] text-slate-600">▼</span>
              {/* Linhas de extensão horizontais */}
              <div className="absolute top-0 right-0 w-8 h-px bg-slate-400" />
              <div className="absolute bottom-0 right-0 w-8 h-px bg-slate-400" />
            </div>
          </div>
          <span className="bg-white/80 px-1 py-0.5 rounded shadow-2xs -rotate-90 origin-center text-[10px] text-slate-800 font-bold whitespace-nowrap">
            {heightZ.toFixed(0)} mm
          </span>
        </div>

        {/* COTA HORIZONTAL DA BASE (Ø 200 mm) */}
        <div className="absolute left-[47%] bottom-[24%] -translate-x-1/2 flex flex-col items-center font-mono text-[11px] font-bold text-slate-800">
          <div className="w-56 h-px bg-slate-400 relative">
            <span className="absolute -left-1 -top-1.5 text-[8px] text-slate-600">◀</span>
            <span className="absolute -right-1 -top-1.5 text-[8px] text-slate-600">▶</span>
            {/* Linhas de extensão verticais */}
            <div className="absolute left-0 bottom-0 h-6 w-px bg-slate-400" />
            <div className="absolute right-0 bottom-0 h-6 w-px bg-slate-400" />
          </div>
          <span className="mt-1 bg-white/80 px-1.5 py-0.5 rounded shadow-2xs text-[10px] text-slate-800 font-bold">
            Ø {baseDiameterX.toFixed(0)} mm
          </span>
        </div>

        {/* BÚSSOLA DE COORDENADAS 3D (CANTO SUPERIOR DIREITO DO VIEWPORT) */}
        <div className="absolute top-16 right-[370px] pointer-events-none flex flex-col items-center">
          <div className="relative size-12 flex items-center justify-center">
            {/* Cubo e eixos esquemáticos */}
            <div className="size-6 border border-slate-300 bg-white/70 rounded-xs shadow-2xs opacity-80" />
            <span className="absolute -top-3 text-[10px] font-bold text-blue-600 font-mono">Z</span>
            <span className="absolute -right-3 text-[10px] font-bold text-red-600 font-mono">X</span>
            <span className="absolute -top-1.5 right-6 text-[10px] font-bold text-emerald-600 font-mono">Y</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. BARRA DE VISTAS E MODOS DE VISUALIZAÇÃO (ELEMENTO 1 NA IMAGEM)         */}
      {/* ========================================================================= */}
      <div className="absolute top-3 left-[200px] z-20 flex items-center gap-1.5 pointer-events-auto">
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200/90 bg-white p-1 shadow-md">
          {/* VISTAS ORTOGRÁFICAS */}
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
                "flex h-7 items-center gap-1 rounded-xl px-2.5 font-mono text-[9.5px] font-bold uppercase transition-all",
                viewPreset === v.id
                  ? "bg-red-50 text-red-600 border border-red-200 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50",
              )}
            >
              <Box className="size-3" /> {v.label}
            </button>
          ))}

          <span className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* MODOS DE APRESENTAÇÃO */}
          {(
            [
              { id: "shaded", label: "SOMB" },
              { id: "shaded-edges", label: "SOMB+AR" },
              { id: "wireframe", label: "ARAME" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setEdgeMode(m.id)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-xl px-2.5 font-mono text-[9.5px] font-bold uppercase transition-all",
                edgeMode === m.id
                  ? "bg-red-50 text-red-600 border border-red-200 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50",
              )}
            >
              <Box className="size-3" /> {m.label}
            </button>
          ))}
        </div>

        {/* BOTÃO EXPANDIR / FIT TO MODEL */}
        <button
          type="button"
          onClick={handleFitToModel}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-700 shadow-md hover:bg-slate-50 transition-colors"
          title="Centralizar e enquadrar no modelo 3D (Fit)"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2. FERRAMENTAS DE MANIPULAÇÃO RÁPIDA (ELEMENTO 2 NA IMAGEM)               */}
      {/* ========================================================================= */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5 pointer-events-auto">
        {/* GRUPO GIZMO | MOVER | GIRAR */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200/90 bg-white p-1 shadow-md font-mono text-[9.5px] font-bold">
          <button
            type="button"
            onClick={() => setGizmoMode((m) => (m === "off" ? "translate" : "off"))}
            className={cn(
              "flex h-7 items-center gap-1 rounded-xl px-2.5 uppercase transition-colors",
              gizmoMode !== "off"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "text-slate-700 hover:bg-slate-50",
            )}
            title="Alternar manipulador 3D (Gizmo)"
          >
            <Crosshair className="size-3" /> GIZMO {gizmoMode !== "off" ? "ON" : "▾"}
          </button>

          <span className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setGizmoMode("translate")}
            className={cn(
              "flex h-7 items-center gap-1 rounded-xl px-2.5 uppercase transition-colors",
              gizmoMode === "translate"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "text-slate-700 hover:bg-slate-50",
            )}
            title="Mover objeto ou transladar faces"
          >
            <Move className="size-3" /> MOVER
          </button>

          <button
            type="button"
            onClick={() => setGizmoMode("rotate")}
            className={cn(
              "flex h-7 items-center gap-1 rounded-xl px-2.5 uppercase transition-colors",
              gizmoMode === "rotate"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "text-slate-700 hover:bg-slate-50",
            )}
            title="Rotacionar em torno dos eixos"
          >
            <RotateCw className="size-3" /> GIRAR
          </button>
        </div>

        {/* HISTÓRICO UNDO / REDO */}
        <div className="flex items-center rounded-2xl border border-slate-200/90 bg-white p-1 shadow-md">
          <button
            type="button"
            disabled={!canUndo}
            onClick={handleUndo}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl transition-colors",
              canUndo ? "text-slate-700 hover:bg-slate-50" : "text-slate-300 cursor-not-allowed",
            )}
            title="Desfazer alteração (Undo)"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={handleRedo}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl transition-colors",
              canRedo ? "text-slate-700 hover:bg-slate-50" : "text-slate-300 cursor-not-allowed",
            )}
            title="Refazer alteração (Redo)"
          >
            <Redo2 className="size-3.5" />
          </button>
        </div>

        {/* TELA CHEIA */}
        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-700 shadow-md hover:bg-slate-50 transition-colors"
          title="Alternar tela cheia"
        >
          {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3. BARRA LATERAL DE FERRAMENTAS ESQUERDA (ELEMENTO 3 NA IMAGEM)           */}
      {/* ========================================================================= */}
      <div className="absolute top-3 left-4 z-20 flex flex-col gap-1.5 w-44 pointer-events-auto">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-2 shadow-lg backdrop-blur-xs flex flex-col gap-1.5">
          {/* CATEGORIA 1: CRIAR (SELECIONADA NA IMAGEM COM FUNDO VERMELHO SÓLIDO) */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "criar" ? "none" : "criar"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all shadow-2xs",
              activeLeftCat === "criar"
                ? "bg-[#dc2626] text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Box className="size-3.5" /> CRIAR
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "criar" && "rotate-180")} />
          </button>

          {/* CATEGORIA 2: MODIFICAR */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "modificar" ? "none" : "modificar"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "modificar"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Scissors className="size-3.5" /> MODIFICAR
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "modificar" && "rotate-180")} />
          </button>

          {/* CATEGORIA 3: DETALHES */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "detalhes" ? "none" : "detalhes"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "detalhes"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Settings className="size-3.5" /> DETALHES
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "detalhes" && "rotate-180")} />
          </button>

          {/* CATEGORIA 4: CHAPA */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "chapa" ? "none" : "chapa"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "chapa"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Layers className="size-3.5" /> CHAPA
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "chapa" && "rotate-180")} />
          </button>

          {/* CATEGORIA 5: ESTRUTURAS */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "estruturas" ? "none" : "estruturas"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "estruturas"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Boxes className="size-3.5" /> ESTRUTURAS
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "estruturas" && "rotate-180")} />
          </button>

          {/* CATEGORIA 6: MEDIR */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "medir" ? "none" : "medir"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "medir"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Ruler className="size-3.5" /> MEDIR
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "medir" && "rotate-180")} />
          </button>

          {/* CATEGORIA 7: EXPORTAR */}
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "exportar" ? "none" : "exportar"))}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl px-3 font-mono text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "exportar"
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100",
            )}
          >
            <div className="flex items-center gap-2">
              <Download className="size-3.5" /> EXPORTAR
            </div>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "exportar" && "rotate-180")} />
          </button>
        </div>

        {/* SUBPAINEL CONTEXTUAL FLYOUT ADJACENTE (NÃO COBRE A PEÇA) */}
        {activeLeftCat !== "none" && (
          <div className="absolute left-[184px] top-0 w-48 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-xs flex flex-col gap-1 font-mono text-[9px]">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 font-bold text-slate-800 uppercase">
              <span>{activeLeftCat}</span>
              <button
                type="button"
                onClick={() => setActiveLeftCat("none")}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-3" />
              </button>
            </div>

            {activeLeftCat === "criar" && (
              <>
                <button
                  type="button"
                  onClick={() => setTemplatesDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Flame className="size-3" /> Cone / Caldeiraria
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBaseDiameterX(120);
                    setHeightZ(80);
                    void applyParametersAndRebuild();
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Box className="size-3" /> Caixa Sólida
                </button>
                <button
                  type="button"
                  onClick={() => setWeldmentDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Boxes className="size-3" /> Perfis / Vigas
                </button>
              </>
            )}

            {activeLeftCat === "modificar" && (
              <>
                <button
                  type="button"
                  onClick={() => setGizmoMode("translate")}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Move className="size-3" /> Mover / Transladar
                </button>
                <button
                  type="button"
                  onClick={() => setOptHole((h) => !h)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Crosshair className="size-3" /> Furo Passante
                </button>
                <button
                  type="button"
                  onClick={() => setOptFillet((f) => !f)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Scissors className="size-3" /> Filete nas Arestas
                </button>
                <button
                  type="button"
                  onClick={() => setOptChamfer((c) => !c)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Scissors className="size-3" /> Chanfro 45°
                </button>
              </>
            )}

            {activeLeftCat === "chapa" && (
              <>
                <button
                  type="button"
                  onClick={() => setFlatPatternDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-red-600 font-bold hover:bg-red-50"
                >
                  <Compass className="size-3" /> Planificar Sólido
                </button>
                <button
                  type="button"
                  onClick={() => setDraftingDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <FileText className="size-3" /> Prancha 2D ABNT
                </button>
              </>
            )}

            {activeLeftCat === "estruturas" && (
              <>
                <button
                  type="button"
                  onClick={() => setWeldmentDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600 font-bold"
                >
                  <Boxes className="size-3" /> Perfis & Cut-List
                </button>
              </>
            )}

            {activeLeftCat === "medir" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRightTab("inspecao");
                    setRightPanelOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Ruler className="size-3" /> Metrologia B-Rep
                </button>
              </>
            )}

            {activeLeftCat === "exportar" && (
              <>
                <button
                  type="button"
                  onClick={() => setFlatPatternDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Download className="size-3" /> DXF / Código G
                </button>
                <button
                  type="button"
                  onClick={() => setDraftingDialogOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-red-50 hover:text-red-600"
                >
                  <Download className="size-3" /> Prancha Técnica DXF
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. PAINEL CONTEXTUAL DE PROPRIEDADES DIREITO (REPRODUÇÃO EXATA DA IMAGEM)   */}
      {/* ========================================================================= */}
      {rightPanelOpen && (
        <div className="absolute top-14 right-4 z-20 w-84 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xl backdrop-blur-xs flex flex-col gap-2.5 font-mono text-[10px] text-slate-800 pointer-events-auto">
          {/* BARRA DE ABAS SUPERIORES */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightTab("parametros")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 font-bold uppercase transition-colors",
                  rightTab === "parametros"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <Sliders className="size-3 text-red-600" /> PARÂMETROS
              </button>

              <button
                type="button"
                onClick={() => setRightTab("inspecao")}
                className={cn(
                  "rounded-full px-2.5 py-1 font-bold uppercase transition-colors",
                  rightTab === "inspecao"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                INSPEÇÃO
              </button>

              <button
                type="button"
                onClick={() => setRightTab("filtro")}
                className={cn(
                  "rounded-full px-2.5 py-1 font-bold uppercase transition-colors",
                  rightTab === "filtro"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                FILTRO
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRightPanelOpen(false)}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="Fechar painel"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* ABA 1: PARÂMETROS COM MINI-DIAGRAMA TÉCNICO VETORIAL */}
          {rightTab === "parametros" && (
            <div className="flex flex-col gap-2.5">
              {/* NOME DA PEÇA */}
              <div className="flex items-center gap-1.5 font-bold text-slate-900 uppercase">
                <Box className="size-3.5 text-red-600" /> CONE
              </div>

              {/* CAMPOS DE ENTRADA + DIAGRAMA TÉCNICO LADO A LADO */}
              <div className="grid grid-cols-2 gap-2 items-center">
                {/* COLUNA ESQUERDA: INPUTS NUMÉRICOS */}
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                      DIÂMETRO DA BASE (X)
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 mt-0.5">
                      <input
                        type="number"
                        value={baseDiameterX}
                        onChange={(e) => setBaseDiameterX(Number(e.target.value))}
                        className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px]"
                      />
                      <span className="text-[9px] text-slate-400">mm</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                      ALTURA (Z)
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 mt-0.5">
                      <input
                        type="number"
                        value={heightZ}
                        onChange={(e) => setHeightZ(Number(e.target.value))}
                        className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px]"
                      />
                      <span className="text-[9px] text-slate-400">mm</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                      ESPESSURA
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 mt-0.5">
                      <input
                        type="number"
                        value={thickness}
                        onChange={(e) => setThickness(Number(e.target.value))}
                        className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px]"
                      />
                      <span className="text-[9px] text-slate-400">mm</span>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA: MINI-DIAGRAMA TÉCNICO VETORIAL DO CONE (IGUAL À IMAGEM) */}
                <div className="flex items-center justify-center p-1 border border-slate-100 bg-slate-50/50 rounded-xl">
                  <svg viewBox="0 0 100 90" className="w-full h-24">
                    {/* Cota Z lateral */}
                    <line x1="12" y1="10" x2="12" y2="70" stroke="#94a3b8" strokeWidth="0.75" />
                    <line x1="8" y1="10" x2="16" y2="10" stroke="#94a3b8" strokeWidth="0.75" />
                    <line x1="8" y1="70" x2="16" y2="70" stroke="#94a3b8" strokeWidth="0.75" />
                    <text x="6" y="42" fontSize="7" fill="#475569" fontWeight="bold" textAnchor="end">Z</text>

                    {/* Sombra / Preenchimento do Cone */}
                    <polygon points="55,10 25,70 85,70" fill="#fee2e2" stroke="#dc2626" strokeWidth="1" />
                    {/* Elipse da base */}
                    <ellipse cx="55" cy="70" rx="30" ry="7" fill="#fecaca" stroke="#dc2626" strokeWidth="1" />
                    <path d="M 25 70 A 30 7 0 0 1 85 70" fill="none" stroke="#dc2626" strokeWidth="0.75" strokeDasharray="2,2" />

                    {/* Cota X inferior */}
                    <line x1="25" y1="82" x2="85" y2="82" stroke="#94a3b8" strokeWidth="0.75" />
                    <line x1="25" y1="75" x2="25" y2="85" stroke="#94a3b8" strokeWidth="0.75" />
                    <line x1="85" y1="75" x2="85" y2="85" stroke="#94a3b8" strokeWidth="0.75" />
                    <polygon points="25,82 28,80.5 28,83.5" fill="#475569" />
                    <polygon points="85,82 82,80.5 82,83.5" fill="#475569" />
                    <text x="55" y="87" fontSize="7" fill="#475569" fontWeight="bold" textAnchor="middle">X</text>
                  </svg>
                </div>
              </div>

              {/* SEÇÃO DE OPÇÕES COM CHECKBOXES */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    OPÇÕES
                  </span>
                  <label className="flex items-center gap-1.5 text-[9px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optHole}
                      onChange={(e) => setOptHole(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    FURO CENTRAL
                  </label>
                  <label className="flex items-center gap-1.5 text-[9px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optFillet}
                      onChange={(e) => setOptFillet(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    FILETE NAS ARESTAS
                  </label>
                  <label className="flex items-center gap-1.5 text-[9px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optChamfer}
                      onChange={(e) => setOptChamfer(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    CHANFRO
                  </label>
                </div>

                {/* SELEÇÃO DE MATERIAL */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    MATERIAL
                  </span>
                  <select
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[9.5px] font-bold text-slate-900 outline-none"
                  >
                    <option value="Aço Carbono">Aço Carbono</option>
                    <option value="Inox 304">Inox 304</option>
                    <option value="Alumínio 5052">Alumínio 5052</option>
                  </select>
                </div>
              </div>

              {/* BOTÃO PRINCIPAL APLICAR (VERMELHO CALDRA SÓLIDO) */}
              <button
                type="button"
                onClick={applyParametersAndRebuild}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] py-2.5 font-mono text-[11px] font-bold tracking-wider text-white shadow-xs hover:bg-[#b91c1c] active:scale-[0.99] transition-all uppercase"
              >
                <Settings className="size-4" /> APLICAR
              </button>
            </div>
          )}

          {/* ABA 2: INSPEÇÃO B-REP */}
          {rightTab === "inspecao" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="font-bold text-slate-900">INSPEÇÃO B-REP</span>
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> OCCT VALID
                </span>
              </div>

              <div className="flex flex-col gap-1 text-[9px] text-slate-600">
                <div>Dimensões: <strong className="text-slate-900">{baseDiameterX} × {baseDiameterX} × {heightZ} mm</strong></div>
                <div>Volume: <strong className="text-slate-900">{massProps ? massProps.volume.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "30.000"} mm³</strong></div>
                <div>Massa Est.: <strong className="text-red-600">{massProps ? massProps.mass.toFixed(3) : "9.030"} kg</strong></div>
                <div>Área Total: <strong className="text-slate-900">{massProps ? massProps.surfaceArea.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "21.200"} mm²</strong></div>
                <div>Topologia: <strong className="text-slate-900">{tessData?.faces.length ?? 3} faces, {tessData?.edges.length ?? 6} arestas</strong></div>
              </div>
            </div>
          )}

          {/* ABA 3: FILTRO DE SELEÇÃO TOPOLÓGICA */}
          {rightTab === "filtro" && (
            <div className="flex flex-col gap-2">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                FILTRO DE ENTIDADE
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(["face", "edge", "vertex"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectionType(t)}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-center font-bold uppercase transition-colors text-[9px]",
                      selectionType === t
                        ? "border-red-200 bg-red-50 text-red-600 shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {t === "face" ? "FACE" : t === "edge" ? "ARESTA" : "VÉRTICE"}
                  </button>
                ))}
              </div>

              {selectedEntity ? (
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[8.5px]">
                  <div className="font-bold text-slate-800">
                    {selectedEntity.type.toUpperCase()} #{selectedEntity.index}
                  </div>
                  <div className="text-slate-500">
                    Posição: ({selectedEntity.point.x.toFixed(1)}, {selectedEntity.point.y.toFixed(1)}, {selectedEntity.point.z.toFixed(1)})
                  </div>
                </div>
              ) : (
                <div className="mt-1 rounded-lg border border-dashed border-slate-200 p-2 text-center text-[8.5px] text-slate-400">
                  Clique na peça para selecionar uma {selectionType}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. AÇÕES PRINCIPAIS (APARECEM NO CHÃO DO VIEWPORT — ELEMENTO 4 NA IMAGEM) */}
      {/* ========================================================================= */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white px-2 py-1.5 shadow-lg backdrop-blur-xs pointer-events-auto">
        {/* PLANIFICAR (DESTAQUE VERMELHO SUAVE) */}
        <button
          type="button"
          onClick={() => setFlatPatternDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1 font-mono text-[10px] font-bold text-red-600 shadow-2xs hover:bg-red-100 transition-colors uppercase"
          title="Planificar sólido 3D"
        >
          <Compass className="size-3 text-red-600" /> PLANIFICAR
        </button>

        {/* PRANCHA 2D */}
        <button
          type="button"
          onClick={() => setDraftingDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 font-mono text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
          title="Desenho técnico 2D ABNT com vistas ortográficas e carimbo"
        >
          <FileText className="size-3 text-slate-600" /> PRANCHA 2D
        </button>

        {/* ESTRUTURAS */}
        <button
          type="button"
          onClick={() => setWeldmentDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 font-mono text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
          title="Estruturas metálicas, perfis industriais e lista de corte"
        >
          <Boxes className="size-3 text-slate-600" /> ESTRUTURAS
        </button>

        {/* CNC / DXF */}
        <button
          type="button"
          onClick={() => setFlatPatternDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 font-mono text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase"
          title="Exportar código G CNC e DXF para máquinas de corte"
        >
          <Crosshair className="size-3 text-slate-600" /> CNC / DXF
        </button>
      </div>

      {/* ========================================================================= */}
      {/* DIÁLOGOS DE PROCESSAMENTO REAL                                            */}
      {/* ========================================================================= */}
      <CaldraBoilermakingDialog
        open={templatesDialogOpen}
        onClose={() => setTemplatesDialogOpen(false)}
        tree={treeRef.current}
        onRebuild={rebuildFromTree}
      />

      <CaldraFlatPatternDialog
        open={flatPatternDialogOpen}
        onClose={() => setFlatPatternDialogOpen(false)}
        features={featuresList}
        fallbackDimensions={{ width: baseDiameterX, length: baseDiameterX, thickness }}
      />

      <CaldraDraftingDialog
        open={draftingDialogOpen}
        onClose={() => setDraftingDialogOpen(false)}
        features={featuresList}
        massProps={massProps}
        dimensions={{ width: baseDiameterX, length: baseDiameterX, height: heightZ }}
      />

      <CaldraWeldmentDialog
        open={weldmentDialogOpen}
        onClose={() => setWeldmentDialogOpen(false)}
        tree={treeRef.current}
        onRebuild={rebuildFromTree}
      />
    </div>
  );
}
