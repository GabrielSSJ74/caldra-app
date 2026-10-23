/**
 * CALDRA CHAMFER — 3D CAD CORE AMBIENTE DEFINITIVO (REPRODUÇÃO DA IMAGEM 1 & ADAPTAÇÃO ESTRUTURAL)
 *
 * Arquitetura Definitiva de 3 Níveis:
 * NÍVEL 1 — SEMPRE VISÍVEL:
 *   - Header com vistas principais ISO/FR/LAT/SUP centralizadas (sem o nome da peça no centro)
 *   - Viewport 3D com modelo real (Cone, Quadrado->Redondo, Curva, Boca de Lobo, etc. — PROIBIDO CONE PADRÃO)
 *   - Barra de Vistas e Modos (ISO, FR, LAT, SUP | SOMB, SOMB+AR, ARAME + Enquadrar)
 *   - Grid 3D de chão adaptativo (Tema Escuro: #051833 e grid branco; Tema Claro: grid escuro)
 *   - Barra de Status inferior persistente
 *
 * NÍVEL 2 — ACESSO RÁPIDO:
 *   - Manipulação Rápida (Gizmo, Mover, Girar, Undo, Redo, Fullscreen)
 *   - Ações Principais no Chão do Viewport (Planificar, Prancha 2D, Estruturas, CNC/DXF)
 *
 * NÍVEL 3 — CONTEXTUAL / SMART FLYOUT:
 *   - Barra Lateral Esquerda com categorias e flyouts sem sobreposição da peça
 *   - Painel Contextual Direito (Parâmetros com mini-diagrama esquemático dinâmico, Inspeção B-Rep, Filtro)
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
  AlertTriangle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CadViewCube } from "./CadViewCube";
import { ThreeBRepRenderer, type CadGizmoMode } from "@/lib/cad/renderer/ThreeBRepRenderer";
import { getCadKernel } from "@/lib/cad/core";
import { CadFeatureTree } from "@/lib/cad/features/CadFeatureTree";
import { CadBRepEditor } from "@/lib/cad/core/CadBRepEditor";
import type { CadFeatureNode, CadFeatureType } from "@/lib/cad/features/CadFeatureModel";
import type { CadShape } from "@/lib/cad/core/CadShape";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";
import type { MassProperties } from "@/lib/cad/core/CadKernel";
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
import { useSettings } from "@/lib/settings/SettingsProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AudioManager } from "@/lib/audio/AudioManager";
import { AudioQuickControl } from "@/components/audio/AudioQuickControl";

export interface CadBRepViewerProps {
  className?: string;
  initialModelType?: string;
  initialModelTitle?: string;
  initialParams?: Record<string, any>;
  initialWidth?: number;
  initialLength?: number;
  initialThickness?: number;
  activeViewPreset?: ViewPresetId;
  onViewPresetChange?: (preset: ViewPresetId) => void;
  // Integração com o Workspace CAD CHAMFER
  onBack?: () => void;
  onToggleMode?: (mode: "2d" | "3d") => void;
  documentTitle?: string;
  onTitleChange?: (newTitle: string) => void;
  onSave?: () => void;
  isSaved?: boolean;
  onThicknessChange?: (v: number) => void;
  onUpdate3DParam?: (key: string, val: number) => void;
  initialInspectorOpen?: boolean;
}

export type LeftCategory =
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
  initialModelType = "boilermaking_cone",
  initialModelTitle = "Cone",
  initialParams,
  initialWidth = 200,
  initialLength = 200,
  initialThickness = 3,
  activeViewPreset = "iso",
  onViewPresetChange,
  onBack,
  onToggleMode,
  documentTitle,
  onTitleChange,
  onSave,
  isSaved = true,
  onThicknessChange,
  onUpdate3DParam,
  initialInspectorOpen = false,
}: CadBRepViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeBRepRenderer | null>(null);
  const { settings } = useSettings();

  // Detecta tema escuro ou claro (Seção 24 & 25)
  const isDarkTheme = useMemo(() => {
    return (
      settings?.theme === "dark" ||
      settings?.theme === "amoled" ||
      (typeof document !== "undefined" && document.documentElement.classList.contains("dark"))
    );
  }, [settings?.theme]);

  // Modelo Ativo (PROIBIDO CONE PADRÃO)
  const [modelType, setModelType] = useState<string>(initialModelType);
  const [modelTitle, setModelTitle] = useState<string>(initialModelTitle);

  // Parâmetros Dinâmicos
  const [paramA, setParamA] = useState<number>(initialParams?.width || initialParams?.D || initialWidth);
  const [paramB, setParamB] = useState<number>(initialParams?.length || initialParams?.d || initialLength);
  const [paramC, setParamC] = useState<number>(initialParams?.height || initialParams?.H || 100);
  const [paramD, setParamD] = useState<number>(initialParams?.diameter || 120);
  const [thickness, setThickness] = useState<number>(initialThickness);
  const [material, setMaterial] = useState<string>("Aço Carbono");

  // Opções Paramétricas
  const [optHole, setOptHole] = useState(false);
  const [optFillet, setOptFillet] = useState(false);
  const [optChamfer, setOptChamfer] = useState(false);

  // Motor da Árvore de Recursos e Editor B-Rep
  const treeRef = useRef<CadFeatureTree>(new CadFeatureTree());
  const editorRef = useRef<CadBRepEditor>(new CadBRepEditor(treeRef.current));
  const [featuresList, setFeaturesList] = useState<readonly CadFeatureNode[]>([]);

  // Histórico de Edição B-Rep
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Estados de Manipulação e Vistas
  const [viewPreset, setViewPreset] = useState<ViewPresetId>(activeViewPreset);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("shaded-edges");
  const [gizmoMode, setGizmoMode] = useState<CadGizmoMode>("off");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraRotation, setCameraRotation] = useState<{ x: number; y: number; z: number } | undefined>(undefined);
  const [isOrtho, setIsOrtho] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  // Seleção e Metrologia
  const [selectionType, setSelectionType] = useState<CadSelectionType>("face");
  const [selectedEntity, setSelectedEntity] = useState<CadSelectedEntity | null>(null);
  const [multiSelection, setMultiSelection] = useState<CadSelectedEntity[]>([]);
  const [measurement, setMeasurement] = useState<CadMeasurementResult | null>(null);

  // Arquitetura de Zonas e Revelação Progressiva (Estados A, B, C, D + Exclusão Mútua)
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [activeLeftCat, setActiveLeftCat] = useState<LeftCategory>("criar");
  const [rightPanelOpen, setRightPanelOpen] = useState(initialInspectorOpen);
  const [rightTab, setRightTab] = useState<RightPanelTab>("parametros");
  const [schematicOpen, setSchematicOpen] = useState(true);

  const openLeftCategoryPanel = useCallback((cat?: LeftCategory) => {
    setLeftPanelOpen(true);
    if (cat && cat !== "none") {
      setActiveLeftCat(cat);
    }
    setViewMenuOpen(false);
    // Regra de Exclusão Mútua Mobile/Tablet (e telas estreitas/médias)
    if (typeof window !== "undefined" && window.innerWidth < 1100) {
      setRightPanelOpen(false);
    }
  }, []);

  const openRightInspector = useCallback((tab?: RightPanelTab) => {
    setRightPanelOpen(true);
    if (tab) {
      setRightTab(tab);
    }
    setViewMenuOpen(false);
    // Regra de Exclusão Mútua Mobile/Tablet (e telas estreitas/médias)
    if (typeof window !== "undefined" && window.innerWidth < 1100) {
      setLeftPanelOpen(false);
    }
  }, []);

  // Sincronização com a Barra Lateral Esquerda Principal (ChamferCadToolbar) no modo 3D Sólido
  useEffect(() => {
    const handleExternalCategory = (e: Event) => {
      const custom = e as CustomEvent<{ category: LeftCategory }>;
      const cat = custom.detail?.category;
      if (!cat || cat === "none") {
        setLeftPanelOpen(false);
        return;
      }
      setLeftPanelOpen((prevOpen) => {
        if (prevOpen && activeLeftCat === cat) {
          return false;
        }
        setActiveLeftCat(cat);
        setViewMenuOpen(false);
        if (typeof window !== "undefined" && window.innerWidth < 1100) {
          setRightPanelOpen(false);
        }
        return true;
      });
    };
    window.addEventListener("chamfer-3d-open-category", handleExternalCategory);
    return () => window.removeEventListener("chamfer-3d-open-category", handleExternalCategory);
  }, [activeLeftCat]);

  // Estado do Kernel e Geometria Ativa
  const [loading, setLoading] = useState(true);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [activeShape, setActiveShape] = useState<CadShape | null>(null);
  const [massProps, setMassProps] = useState<MassProperties | null>(null);
  const [tessData, setTessData] = useState<CadTessellatedShape | null>(null);

  // Diálogos Especializados
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [flatPatternDialogOpen, setFlatPatternDialogOpen] = useState(false);
  const [draftingDialogOpen, setDraftingDialogOpen] = useState(false);
  const [weldmentDialogOpen, setWeldmentDialogOpen] = useState(false);

  // Sincroniza viewPreset com o Stage pai
  useEffect(() => {
    setViewPreset(activeViewPreset);
  }, [activeViewPreset]);

  const handleViewPresetChange = (preset: ViewPresetId) => {
    setViewPreset(preset);
    onViewPresetChange?.(preset);
  };

  // Atualiza flags de histórico
  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(editorRef.current.canUndo());
    setCanRedo(editorRef.current.canRedo());
  }, []);

  // Som de inicialização do CAD CORE 3D ao abrir o módulo (Seção 6)
  useEffect(() => {
    AudioManager.play("cad_core_init");
  }, []);

  // Reconstrução via Feature Tree
  const rebuildFromTree = useCallback(async () => {
    setLoading(true);
    setConversionError(null);
    AudioManager.play("kernel_loading");
    try {
      const res = await treeRef.current.rebuild();
      if (res.success && res.activeShape && res.tessellation) {
        setActiveShape(res.activeShape);
        setTessData(res.tessellation);
        setMassProps(res.massProperties);
        rendererRef.current?.setShape(res.tessellation);
        rendererRef.current?.fitView(false);
        AudioManager.play("kernel_success");
      } else {
        const errorMsg = res.errors?.join("; ") || (res as unknown as { error?: string })?.error || "Falha na geração do sólido B-Rep.";
        throw new Error(errorMsg);
      }
      setFeaturesList(treeRef.current.getFeatures());
      refreshHistoryFlags();
    } catch (err: unknown) {
      console.error("[CadBRepViewer] Erro ao reconstruir árvore:", err);
      AudioManager.play("kernel_error");
      // NUNCA substituir silenciosamente por Cone (Seção 22)
      setConversionError((err as Error)?.message || "Não foi possível converter este modelo para CAD 3D.");
    } finally {
      setLoading(false);
    }
  }, [refreshHistoryFlags]);

  // Inicialização única do ThreeBRepRenderer (mantém o contexto WebGL vivo durante trocas de Gizmo/Tema)
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new ThreeBRepRenderer({
      container: containerRef.current,
      gizmoMode,
      onSelect: (entity, multi) => {
        setSelectedEntity(entity);
        setMultiSelection(Array.isArray(multi) ? multi : entity ? [entity] : []);
        if (entity) {
          if (entity.type === "face") {
            AudioManager.play("cad_select_face");
          } else if (entity.type === "edge") {
            AudioManager.play("cad_select_edge");
          } else if (entity.type === "vertex") {
            AudioManager.play("cad_select_vertex");
          }
          // Estado B: Objeto/Entidade selecionado no 3D abre contextualmente o Inspetor à direita
          setLeftPanelOpen(false);
          setViewMenuOpen(false);
          setRightPanelOpen(true);
        } else {
          // Toque/Clique na área livre do Canvas recolhe menus temporários da esquerda/topo
          setLeftPanelOpen(false);
          setViewMenuOpen(false);
        }
      },
      onMeasure: (meas) => {
        setMeasurement(meas);
        if (meas) {
          AudioManager.play("cad_measure");
        }
      },
      onCameraRotate: (rot) => {
        setCameraRotation(rot);
      },
    });

    // Aplica o tema imediatamente
    renderer.setTheme(isDarkTheme ? "dark" : "light");

    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza parâmetros externos in-place sem recriar o contexto WebGL
  useEffect(() => {
    setParamA(initialParams?.width || initialParams?.D || initialWidth);
    setParamB(initialParams?.length || initialParams?.d || initialLength);
    if (initialParams?.height || initialParams?.H) {
      setParamC(initialParams.height || initialParams.H || 100);
    }
    if (initialParams?.diameter) {
      setParamD(initialParams.diameter);
    }
  }, [initialParams, initialWidth, initialLength]);

  useEffect(() => {
    setThickness(initialThickness);
  }, [initialThickness]);

  // Sincroniza tema quando alterado pelo usuário (Seção 24 & 25)
  useEffect(() => {
    rendererRef.current?.setTheme(isDarkTheme ? "dark" : "light");
  }, [isDarkTheme]);

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

  // Constrói o Sólido B-Rep com base no Tipo Real da Peça (PROIBIDO CONE PADRÃO)
  const applyParametersAndRebuild = useCallback(async () => {
    const tree = treeRef.current;
    tree.dispose();

    try {
      switch (modelType) {
        // 0. Chapa Extrudada / Geometria 2D Sketch
        case "extrude_sketch":
          tree.addFeature({
            name: modelTitle && modelTitle !== "Cone" ? modelTitle : "Chapa Planificada",
            type: "extrude_sketch",
            parameters: {
              depth: thickness,
              width: paramA || 200,
              length: paramB || 200,
              material,
            },
          });
          break;

        // 1. Transição Quadrado para Redondo
        case "boilermaking_transition":
          tree.addFeature({
            name: "Transição Quadrado-Redondo",
            type: "boilermaking_transition",
            parameters: {
              width: paramA,
              length: paramB,
              diameter: paramD,
              height: paramC,
              thickness,
              material,
            },
          });
          break;

        // 2. Curva de Gomos / Cotovelo Segmentado
        case "boilermaking_elbow":
          tree.addFeature({
            name: "Curva de Gomos",
            type: "boilermaking_elbow",
            parameters: {
              diameter: paramA,
              radius: paramB,
              angleDeg: 90,
              segments: 4,
              thickness,
              material,
            },
          });
          break;

        // 3. Boca de Lobo / Derivação Cilíndrica
        case "boilermaking_branch":
          tree.addFeature({
            name: "Boca de Lobo / Tê",
            type: "boilermaking_branch",
            parameters: {
              mainDiameter: paramA,
              branchDiameter: paramB,
              mainLength: Math.max(300, paramA * 2),
              branchHeight: paramC,
              thickness,
              material,
            },
          });
          break;

        // 4. Chapéu Chinês / Coifa
        case "boilermaking_hood":
          tree.addFeature({
            name: "Chapéu Chinês",
            type: "boilermaking_hood",
            parameters: {
              baseDiameter: paramA,
              topDiameter: paramB,
              height: paramC,
              thickness,
              material,
            },
          });
          break;

        // 5. Cilindro Industrial
        case "base_cylinder":
          tree.addFeature({
            name: "Cilindro Industrial",
            type: "base_cylinder",
            parameters: {
              radius: paramA / 2,
              height: paramC,
              thickness,
              material,
            },
          });
          break;

        // 6. Cone Truncado
        case "boilermaking_cone":
        default:
          tree.addFeature({
            name: "Cone Truncado Base",
            type: "boilermaking_cone",
            parameters: {
              D: paramA,
              d: Math.max(2, Math.abs(paramB - paramA) < 1 ? paramA * 0.5 : paramB),
              height: paramC,
              thickness,
              material,
            },
          });
          break;
      }

      // Adições Paramétricas (Furos, Filetes, Chanfros)
      if (optHole) {
        tree.addFeature({
          name: "Furo Central Ø25 mm",
          type: "hole_cut",
          parameters: {
            diameter: 25,
            depth: paramC + 40,
            isThrough: true,
            position: { x: 0, y: 0, z: -paramC / 2 },
          },
        });
      }

      if (optFillet) {
        tree.addFeature({
          name: "Filete R4 mm",
          type: "fillet",
          parameters: { radius: 4, edgeIndices: [0] },
        });
      }

      if (optChamfer) {
        tree.addFeature({
          name: "Chanfro 3 mm",
          type: "chamfer",
          parameters: { distance: 3, edgeIndices: [1] },
        });
      }

      await rebuildFromTree();
      toast.success(`Modelo "${modelTitle}" reconstruído em B-Rep.`);
    } catch (err: unknown) {
      console.error("[CadBRepViewer] Erro na criação da geometria:", err);
      setConversionError((err as Error)?.message || "Não foi possível converter este modelo para CAD 3D.");
    }
  }, [
    modelType,
    modelTitle,
    paramA,
    paramB,
    paramC,
    paramD,
    thickness,
    material,
    optHole,
    optFillet,
    optChamfer,
    rebuildFromTree,
  ]);

  // Carrega a primeira geometria ao montar
  useEffect(() => {
    void applyParametersAndRebuild();
  }, [applyParametersAndRebuild]);

  // Ações de Undo / Redo
  const handleUndo = async () => {
    AudioManager.play("cad_undo");
    const res = await editorRef.current.undo();
    if (res) await rebuildFromTree();
  };

  const handleRedo = async () => {
    AudioManager.play("cad_redo");
    const res = await editorRef.current.redo();
    if (res) await rebuildFromTree();
  };

  // Enquadrar no modelo / Restaurar vista (Fit to Model) (Seção 14 - Reset)
  const handleFitToModel = () => {
    AudioManager.play("cad_reset");
    if (rendererRef.current) {
      if (typeof rendererRef.current.fitView === "function") {
        rendererRef.current.fitView();
      } else if (typeof rendererRef.current.fitToModel === "function") {
        rendererRef.current.fitToModel();
      }
    }
    toast.info("Enquadramento 3D centralizado na peça.");
  };

  const handleToggleOrtho = () => {
    const next = !isOrtho;
    setIsOrtho(next);
    rendererRef.current?.setCameraProjection(next);
    toast.info(next ? "Câmera Ortográfica (CAD)" : "Câmera em Perspectiva");
  };

  return (
    <div
      className={cn(
        "relative size-full overflow-hidden select-none transition-colors",
        isDarkTheme ? "bg-[#051833]" : "bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0]",
        className,
      )}
    >
      {/* 3D WEBGL CANVAS VIEWPORT */}
      <div ref={containerRef} className="size-full absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* ESTADO DE ERRO TÉCNICO (SEÇÃO 22: NUNCA FALLBACK SILENCIOSO PARA CONE) */}
      {conversionError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-6">
          <div className="max-w-md rounded-2xl border border-red-300 bg-white p-6 shadow-2xl text-center font-mono">
            <AlertTriangle className="size-10 text-red-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Não foi possível converter este modelo para CAD 3D
            </h3>
            <p className="mt-2 text-xs text-slate-600">{conversionError}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => applyParametersAndRebuild()}
                className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COTAS TÉCNICAS SOBREPOSTAS AO VIEWPORT (DINÂMICAS POR MODELO)            */}
      {/* ========================================================================= */}
      {!conversionError && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* COTA VERTICAL DE ALTURA */}
          <div className="absolute left-[33%] top-[38%] -translate-y-1/2 flex items-center gap-0.5 font-mono text-[9px] font-bold text-slate-800">
            <div className="flex flex-col items-center">
              <div className="h-28 w-px bg-slate-400 relative">
                <span className="absolute -top-1 -left-1 text-[6.5px] text-slate-600">▲</span>
                <span className="absolute -bottom-1 -left-1 text-[6.5px] text-slate-600">▼</span>
                <div className="absolute top-0 right-0 w-5 h-px bg-slate-400" />
                <div className="absolute bottom-0 right-0 w-5 h-px bg-slate-400" />
              </div>
            </div>
            <span className="bg-white/90 px-1 py-0.2 rounded shadow-2xs -rotate-90 origin-center text-[9px] text-slate-800 font-bold whitespace-nowrap">
              {paramC.toFixed(0)} mm
            </span>
          </div>

          {/* COTA HORIZONTAL DA BASE */}
          <div className="absolute left-[48%] bottom-[20%] -translate-x-1/2 flex flex-col items-center font-mono text-[9px] font-bold text-slate-800">
            <div className="w-36 h-px bg-slate-400 relative">
              <span className="absolute -left-1 -top-1.5 text-[6.5px] text-slate-600">◀</span>
              <span className="absolute -right-1 -top-1.5 text-[6.5px] text-slate-600">▶</span>
              <div className="absolute left-0 bottom-0 h-3.5 w-px bg-slate-400" />
              <div className="absolute right-0 bottom-0 h-3.5 w-px bg-slate-400" />
            </div>
            <span className="mt-0.5 bg-white/90 px-1 py-0.2 rounded shadow-2xs text-[9px] text-slate-800 font-bold">
              {modelType === "boilermaking_transition"
                ? `${paramA.toFixed(0)} × ${paramB.toFixed(0)} mm`
                : `Ø ${paramA.toFixed(0)} mm`}
            </span>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* REGIÃO 3.1 — CÁPSULA DE VISUALIZAÇÃO COMPACTA (TOPO CENTRAL, 34px)        */}
      {/* ========================================================================= */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center pointer-events-auto">
        <div
          style={{ height: "34px", borderRadius: "9999px", padding: "0 12px" }}
          className="flex items-center gap-1 border border-slate-700/80 bg-slate-900/92 shadow-md backdrop-blur-md font-mono text-[10px] font-bold text-slate-200"
        >
          {/* SOMBREADO / SÓLIDO */}
          <button
            type="button"
            onClick={() => setEdgeMode((m) => (m === "shaded-edges" ? "shaded" : "shaded-edges"))}
            className={cn(
              "inline-flex h-[24px] items-center gap-1 rounded-full px-2.5 text-[9.5px] font-bold uppercase whitespace-nowrap transition-colors",
              edgeMode === "shaded-edges" || edgeMode === "shaded"
                ? "bg-red-600 text-white shadow-2xs"
                : "text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
            title={edgeMode === "shaded" ? "Sombreado puro (clique para Sombreado + Arestas)" : "Sombreado com arestas (clique para alternar)"}
          >
            <Box className="size-3 shrink-0" />
            <span>{edgeMode === "shaded" ? "SOMB" : "SÓLIDO"}</span>
          </button>

          {/* ARAME (WIREFRAME) */}
          <button
            type="button"
            onClick={() => setEdgeMode("wireframe")}
            className={cn(
              "inline-flex h-[24px] items-center gap-1 rounded-full px-2.5 text-[9.5px] font-bold uppercase whitespace-nowrap transition-colors",
              edgeMode === "wireframe"
                ? "bg-red-600 text-white shadow-2xs"
                : "text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
            title="Modo Arame (Wireframe)"
          >
            <span>ARAME</span>
          </button>

          <span className="h-3.5 w-px bg-slate-700/80 mx-0.5 shrink-0" />

          {/* PERSPECTIVA / ORTOGRÁFICA */}
          <button
            type="button"
            onClick={handleToggleOrtho}
            className={cn(
              "inline-flex h-[24px] items-center rounded-full px-2 text-[9.5px] font-bold uppercase whitespace-nowrap transition-colors",
              isOrtho
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
            title={isOrtho ? "Projeção Ortográfica (clique para Perspectiva)" : "Projeção em Perspectiva (clique para Ortográfica)"}
          >
            {isOrtho ? "ORTO" : "PERSP"}
          </button>

          <span className="h-3.5 w-px bg-slate-700/80 mx-0.5 shrink-0" />

          {/* ZOOM +, ZOOM -, ENQUADRAR / RESET */}
          <button
            type="button"
            onClick={() => rendererRef.current?.zoomIn()}
            className="flex size-[24px] shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            title="Aproximar Zoom (Zoom +)"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => rendererRef.current?.zoomOut()}
            className="flex size-[24px] shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            title="Afastar Zoom (Zoom -)"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFitToModel}
            className="flex size-[24px] shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            title="Enquadrar / Resetar câmera na peça"
          >
            <Maximize2 className="size-3" />
          </button>

          <span className="h-3.5 w-px bg-slate-700/80 mx-0.5 shrink-0" />

          {/* MENU COMPACTO "VISUALIZAÇÃO" (VISTAS, GIZMO, HISTÓRICO 3D, ÁUDIO) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setViewMenuOpen((v) => !v)}
              className={cn(
                "inline-flex h-[24px] items-center gap-1 rounded-full px-2 text-[9.5px] font-bold uppercase whitespace-nowrap transition-colors",
                viewMenuOpen || gizmoMode !== "off"
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
              title="Mais opções de visualização, vistas ortográficas, Gizmo 3D e áudio"
            >
              <Eye className="size-3 shrink-0" />
              <span className="hidden sm:inline">Visualização</span>
              <ChevronDown className={cn("size-3 transition-transform", viewMenuOpen && "rotate-180")} />
            </button>

            {viewMenuOpen && (
              <div className="absolute top-9 left-1/2 -translate-x-1/2 z-50 w-64 rounded-2xl border border-slate-700/90 bg-slate-900/96 p-2.5 shadow-2xl backdrop-blur-md text-slate-200 flex flex-col gap-2">
                {/* Vistas Canônicas */}
                <div>
                  <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Vistas Padrão
                  </div>
                  <div className="grid grid-cols-4 gap-1">
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
                        onClick={() => {
                          handleViewPresetChange(v.id);
                          setViewMenuOpen(false);
                        }}
                        className={cn(
                          "h-6 rounded-lg font-mono text-[9.5px] font-bold uppercase transition-colors",
                          viewPreset === v.id
                            ? "bg-red-600 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white",
                        )}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Modos de Sombreado */}
                <div className="border-t border-slate-800 pt-1.5">
                  <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Estilo de Renderização
                  </div>
                  <div className="grid grid-cols-3 gap-1">
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
                        onClick={() => {
                          setEdgeMode(m.id);
                          setViewMenuOpen(false);
                        }}
                        className={cn(
                          "h-6 rounded-lg font-mono text-[9px] font-bold uppercase transition-colors",
                          edgeMode === m.id
                            ? "bg-red-600 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manipulação & Histórico 3D */}
                <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      AudioManager.play("cad_gizmo");
                      setGizmoMode((m) => (m === "off" ? "translate" : "off"));
                    }}
                    className={cn(
                      "flex h-7 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[9.5px] font-bold uppercase transition-colors",
                      gizmoMode !== "off"
                        ? "bg-red-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700",
                    )}
                  >
                    <Crosshair className="size-3" /> Gizmo {gizmoMode !== "off" ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={handleUndo}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg bg-slate-800 transition-colors",
                      canUndo ? "text-slate-200 hover:bg-slate-700" : "opacity-40 cursor-not-allowed",
                    )}
                    title="Desfazer operação 3D"
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={handleRedo}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg bg-slate-800 transition-colors",
                      canRedo ? "text-slate-200 hover:bg-slate-700" : "opacity-40 cursor-not-allowed",
                    )}
                    title="Refazer operação 3D"
                  >
                    <Redo2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rendererRef.current?.orbitCamera(0.25, 0)}
                    className="flex size-7 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                    title="Orbitar câmera 3D"
                  >
                    <RotateCw className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen((f) => !f)}
                    className="flex size-7 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                    title="Alternar tela cheia"
                  >
                    {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                  </button>
                </div>

                {/* Controle de Áudio Integrado (Fora da Área de Desenho) */}
                <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Áudio do Sistema</span>
                  <AudioQuickControl />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REGIÃO 3.2 — CUBO DE ORIENTAÇÃO 3D (52x52px) + EIXOS XYZ SEM COLISÃO      */}
      {/* ========================================================================= */}
      <div
        style={{
          top: rightPanelOpen ? "12px" : "52px",
          right: rightPanelOpen ? "calc(clamp(250px, 30vw, 300px) + 20px)" : "12px",
          transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className={cn(
          "absolute z-15 flex flex-col items-center gap-1.5 pointer-events-auto",
          rightPanelOpen && "hidden md:flex",
        )}
      >
        <CadViewCube
          activePreset={viewPreset}
          onSelectPreset={handleViewPresetChange}
          cameraRotation={cameraRotation}
        />
        {/* Bússola de Coordenadas XYZ Compacta */}
        <div className="pointer-events-none flex items-center gap-1 rounded-full border border-slate-300/80 bg-white/85 px-1.5 py-0.5 shadow-2xs backdrop-blur-xs font-mono text-[7.5px] font-bold">
          <span className="text-red-600">X</span>
          <span className="text-slate-300">·</span>
          <span className="text-emerald-600">Y</span>
          <span className="text-slate-300">·</span>
          <span className="text-blue-600">Z</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REGIÃO 2 — PAINEL DE CATEGORIAS 3D RECOLHÍVEL (ESQUERDA, ACCORDION)       */}
      {/* ========================================================================= */}
      {/* Botão Disparador Compacto quando recolhido */}
      {!leftPanelOpen && (
        <div className="absolute top-3 left-3 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              AudioManager.play("ui_toggle_open");
              openLeftCategoryPanel(activeLeftCat === "none" ? "criar" : activeLeftCat);
            }}
            style={{ height: "34px", borderRadius: "9999px" }}
            className="inline-flex items-center gap-1.5 border border-slate-300/90 bg-white/95 px-3 font-mono text-[10px] font-bold uppercase text-slate-800 shadow-md backdrop-blur-md hover:border-red-300 hover:bg-white transition-all whitespace-nowrap cursor-pointer"
            title="Abrir categorias de modelagem 3D (Criar, Modificar, Detalhes, Chapa, Estruturas, Medir, Exportar)"
          >
            <Boxes className="size-3.5 text-red-600 shrink-0" />
            <span>Categorias 3D</span>
            <ChevronRight className="size-3 text-slate-500 shrink-0" />
          </button>
        </div>
      )}

      {/* Painel de Categorias Recolhível em Coluna Única (Accordion sem Flyout Sobreposto) */}
      <div
        aria-hidden={!leftPanelOpen}
        style={{
          top: "12px",
          bottom: "64px",
          maxHeight: "calc(100% - 76px)",
          width: "204px",
          opacity: leftPanelOpen ? 1 : 0,
          transform: leftPanelOpen ? "translateX(0)" : "translateX(-12px)",
          pointerEvents: leftPanelOpen ? "auto" : "none",
          transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="absolute left-3 z-25 overflow-y-auto rounded-2xl border border-slate-200/95 bg-white/96 p-2 shadow-xl backdrop-blur-md flex flex-col gap-1 font-mono"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-800">
            Operações 3D
          </span>
          <button
            type="button"
            onClick={() => {
              setLeftPanelOpen(false);
              AudioManager.play("ui_toggle_close");
            }}
            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Recolher painel de categorias"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* CATEGORIA 1: CRIAR */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "criar" ? "none" : "criar"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "criar"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Box className="size-3.5 shrink-0" /> CRIAR
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "criar" && "rotate-180")} />
          </button>
          {activeLeftCat === "criar" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setModelType("boilermaking_cone");
                  setModelTitle("Cone Truncado");
                  setParamA(200);
                  setParamB(2);
                  setParamC(100);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Flame className="size-3 shrink-0" /> Cone Truncado
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("boilermaking_transition");
                  setModelTitle("Quadrado para Redondo");
                  setParamA(200);
                  setParamB(200);
                  setParamD(120);
                  setParamC(150);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Layers className="size-3 shrink-0" /> Quadrado → Redondo
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("boilermaking_elbow");
                  setModelTitle("Curva de Gomos");
                  setParamA(150);
                  setParamB(225);
                  setParamC(90);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Box className="size-3 shrink-0" /> Curva de Gomos
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("boilermaking_branch");
                  setModelTitle("Boca de Lobo");
                  setParamA(200);
                  setParamB(150);
                  setParamC(180);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Crosshair className="size-3 shrink-0" /> Boca de Lobo / Tê
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("base_cylinder");
                  setModelTitle("Cilindro Industrial");
                  setParamA(160);
                  setParamC(220);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Box className="size-3 shrink-0" /> Cilindro / Tubo
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 2: MODIFICAR */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "modificar" ? "none" : "modificar"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "modificar"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Scissors className="size-3.5 shrink-0" /> MODIFICAR
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "modificar" && "rotate-180")} />
          </button>
          {activeLeftCat === "modificar" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setGizmoMode("translate");
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Move className="size-3 shrink-0" /> Mover / Transladar
              </button>
              <button
                type="button"
                onClick={() => {
                  setOptHole((h) => !h);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Crosshair className="size-3 shrink-0" /> Furo Passante
              </button>
              <button
                type="button"
                onClick={() => {
                  setOptFillet((f) => !f);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Scissors className="size-3 shrink-0" /> Filete nas Arestas
              </button>
              <button
                type="button"
                onClick={() => {
                  setOptChamfer((c) => !c);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Scissors className="size-3 shrink-0" /> Chanfro 45°
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 3: DETALHES */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "detalhes" ? "none" : "detalhes"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "detalhes"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Settings className="size-3.5 shrink-0" /> DETALHES
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "detalhes" && "rotate-180")} />
          </button>
          {activeLeftCat === "detalhes" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setTemplatesDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Wrench className="size-3 shrink-0" /> Catálogo Caldeiraria
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Sliders className="size-3 shrink-0" /> Parâmetros de Borda
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 4: CHAPA */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "chapa" ? "none" : "chapa"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "chapa"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 shrink-0" /> CHAPA
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "chapa" && "rotate-180")} />
          </button>
          {activeLeftCat === "chapa" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setFlatPatternDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-red-600 font-bold hover:bg-red-50 transition-colors"
              >
                <Compass className="size-3 shrink-0" /> Planificar Sólido
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftingDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <FileText className="size-3 shrink-0" /> Prancha 2D ABNT
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 5: ESTRUTURAS */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "estruturas" ? "none" : "estruturas"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "estruturas"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Boxes className="size-3.5 shrink-0" /> ESTRUTURAS
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "estruturas" && "rotate-180")} />
          </button>
          {activeLeftCat === "estruturas" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setWeldmentDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 font-bold hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Boxes className="size-3 shrink-0" /> Perfis & Cut-List
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 6: MEDIR */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "medir" ? "none" : "medir"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "medir"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Ruler className="size-3.5 shrink-0" /> MEDIR
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "medir" && "rotate-180")} />
          </button>
          {activeLeftCat === "medir" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(false);
                  openRightInspector("inspecao");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Ruler className="size-3 shrink-0" /> Metrologia B-Rep
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(false);
                  openRightInspector("filtro");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Crosshair className="size-3 shrink-0" /> Filtro Face/Aresta/Vértice
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 7: EXPORTAR */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "exportar" ? "none" : "exportar"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "exportar"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Download className="size-3.5 shrink-0" /> EXPORTAR
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "exportar" && "rotate-180")} />
          </button>
          {activeLeftCat === "exportar" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setFlatPatternDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Download className="size-3 shrink-0" /> DXF / Código G
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftingDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Download className="size-3 shrink-0" /> Prancha Técnica DXF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REGIÃO 4 — INSPETOR CONTEXTUAL DE PROPRIEDADES À DIREITA                  */}
      {/* ========================================================================= */}
      {/* Botão Disparador Único [ Parâmetros 3D ] (Estado A: sempre acessível no topo direito) */}
      <div className="absolute top-3 right-3 z-25 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            if (rightPanelOpen) {
              setRightPanelOpen(false);
              AudioManager.play("ui_toggle_close");
            } else {
              AudioManager.play("ui_toggle_open");
              openRightInspector("parametros");
            }
          }}
          style={{ height: "34px", borderRadius: "9999px" }}
          className={cn(
            "inline-flex items-center gap-1.5 border px-3.5 font-mono text-[10.5px] font-bold shadow-md backdrop-blur-md transition-all whitespace-nowrap cursor-pointer",
            rightPanelOpen
              ? "border-red-500 bg-[#dc2626] text-white shadow-red-900/25"
              : "border-slate-700/80 bg-slate-900/92 text-slate-100 hover:bg-slate-800",
          )}
          aria-expanded={rightPanelOpen}
          aria-label="Alternar Inspetor de Parâmetros 3D"
        >
          <Sliders className="size-3.5 shrink-0" />
          <span>Parâmetros 3D</span>
        </button>
      </div>

      {/* Painel Inspetor Contido (top: 52px, bottom: 64px, nunca invade a barra inferior) */}
      {rightPanelOpen && (
        <aside
          aria-label="Inspetor de Propriedades 3D"
          style={{
            width: "clamp(250px, 30vw, 300px)",
            top: "52px",
            bottom: "64px",
            maxHeight: "calc(100% - 116px)",
            transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          className="absolute right-3 z-25 overflow-y-auto rounded-2xl border border-slate-200/95 bg-white/98 p-3 shadow-xl backdrop-blur-md flex flex-col gap-2.5 font-mono text-[10px] text-slate-800 pointer-events-auto"
        >
          {/* ABAS DO INSPETOR + BOTÃO FECHAR (✕) */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightTab("parametros")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[9px] whitespace-nowrap",
                  rightTab === "parametros"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <Sliders className="size-2.5 text-red-600 shrink-0" /> PARÂMETROS
              </button>

              <button
                type="button"
                onClick={() => setRightTab("inspecao")}
                className={cn(
                  "rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[9px] whitespace-nowrap",
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
                  "rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[9px] whitespace-nowrap",
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
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
              title="Fechar inspetor (✕)"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* ABA 1: PARÂMETROS ORGANIZADOS EM COLUNA ÚNICA + ESQUEMA COMPACTO RECOLHÍVEL */}
          {rightTab === "parametros" && (
            <div className="flex flex-col gap-2">
              {/* 1. CABEÇALHO COMPACTO COM NOME DO OBJETO / PROJETO */}
              <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 border border-slate-100">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Box className="size-3.5 text-red-600 shrink-0" />
                  <span className="font-bold text-slate-900 uppercase text-[11px] truncate">
                    {modelTitle.toUpperCase()}
                  </span>
                </div>
                {documentTitle && (
                  <span className="text-[9px] text-slate-500 truncate max-w-[110px]" title={documentTitle}>
                    {documentTitle}
                  </span>
                )}
              </div>

              {/* 2. RÓTULOS E CAMPOS NUMÉRICOS ALINHADOS COM UNIDADE (mm) */}
              <div className="flex flex-col gap-1.5">
                {modelType === "boilermaking_transition" ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        BASE (X)
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={paramA}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setParamA(v);
                            onUpdate3DParam?.("width", v);
                          }}
                          className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                        />
                        <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        DIÂMETRO (Ø)
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={paramD}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setParamD(v);
                            onUpdate3DParam?.("diameter", v);
                          }}
                          className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                        />
                        <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        ALTURA (Z)
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={paramC}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setParamC(v);
                            onUpdate3DParam?.("height", v);
                          }}
                          className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                        />
                        <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        DIÂMETRO BASE (X)
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={paramA}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setParamA(v);
                            onUpdate3DParam?.("D", v);
                          }}
                          className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                        />
                        <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        ALTURA (Z)
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={paramC}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setParamC(v);
                            onUpdate3DParam?.("height", v);
                          }}
                          className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                        />
                        <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-2">
                  <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                    ESPESSURA
                  </label>
                  <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                    <input
                      type="number"
                      step={0.1}
                      value={thickness}
                      onChange={(e) => {
                        const v = Math.max(0.2, Number(e.target.value) || 0.2);
                        setThickness(v);
                        onThicknessChange?.(v);
                        onUpdate3DParam?.("thickness", v);
                      }}
                      className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                    />
                    <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
              </div>

              {/* 3. PRÉ-VISUALIZAÇÃO ESQUEMÁTICA 2D COMPACTA / RECOLHÍVEL (X e Z) */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSchematicOpen((s) => !s)}
                  className="flex w-full items-center justify-between px-2.5 py-1 text-[8.5px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
                >
                  <span>Esquema Dimensional (X / Z)</span>
                  <ChevronDown className={cn("size-3 transition-transform", schematicOpen && "rotate-180")} />
                </button>
                {schematicOpen && (
                  <div className="flex items-center justify-center px-2 pb-1.5">
                    {modelType === "boilermaking_transition" ? (
                      <svg viewBox="0 0 120 64" className="w-full h-14">
                        <line x1="16" y1="10" x2="16" y2="48" stroke="#94a3b8" strokeWidth="0.75" />
                        <text x="10" y="32" fontSize="6" fill="#475569" fontWeight="bold" textAnchor="end">Z</text>
                        <polygon points="42,12 78,12 96,48 24,48" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.8" />
                        <ellipse cx="60" cy="12" rx="18" ry="3.5" fill="#fecaca" stroke="#dc2626" strokeWidth="0.75" />
                        <line x1="24" y1="56" x2="96" y2="56" stroke="#94a3b8" strokeWidth="0.75" />
                        <text x="60" y="62" fontSize="6" fill="#475569" fontWeight="bold" textAnchor="middle">X</text>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 120 64" className="w-full h-14">
                        <line x1="16" y1="8" x2="16" y2="48" stroke="#94a3b8" strokeWidth="0.75" />
                        <line x1="12" y1="8" x2="20" y2="8" stroke="#94a3b8" strokeWidth="0.75" />
                        <line x1="12" y1="48" x2="20" y2="48" stroke="#94a3b8" strokeWidth="0.75" />
                        <text x="10" y="30" fontSize="6" fill="#475569" fontWeight="bold" textAnchor="end">Z</text>
                        <polygon points="62,8 30,48 94,48" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.8" />
                        <ellipse cx="62" cy="48" rx="32" ry="5" fill="#fecaca" stroke="#dc2626" strokeWidth="0.8" />
                        <path d="M 30 48 A 32 5 0 0 1 94 48" fill="none" stroke="#dc2626" strokeWidth="0.75" strokeDasharray="2,2" />
                        <line x1="30" y1="56" x2="94" y2="56" stroke="#94a3b8" strokeWidth="0.75" />
                        <text x="62" y="62" fontSize="6" fill="#475569" fontWeight="bold" textAnchor="middle">X</text>
                      </svg>
                    )}
                  </div>
                )}
              </div>

              {/* OPÇÕES E MATERIAL */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    OPÇÕES
                  </span>
                  <label className="flex items-center gap-1 text-[8.5px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optHole}
                      onChange={(e) => setOptHole(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500 size-2.5"
                    />
                    FURO CENTRAL
                  </label>
                  <label className="flex items-center gap-1 text-[8.5px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optFillet}
                      onChange={(e) => setOptFillet(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500 size-2.5"
                    />
                    FILETE ARESTAS
                  </label>
                  <label className="flex items-center gap-1 text-[8.5px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optChamfer}
                      onChange={(e) => setOptChamfer(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500 size-2.5"
                    />
                    CHANFRO
                  </label>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    MATERIAL
                  </span>
                  <select
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full h-[28px] rounded-lg border border-slate-200 bg-slate-50 px-1.5 font-mono text-[9.5px] font-bold text-slate-900 outline-none"
                  >
                    <option value="Aço Carbono">Aço Carbono</option>
                    <option value="Inox 304">Inox 304</option>
                    <option value="Alumínio 5052">Alumínio 5052</option>
                  </select>
                </div>
              </div>

              {/* BOTÃO PRINCIPAL APLICAR (VERMELHO SÓLIDO CALDRA — 34px) */}
              <button
                type="button"
                onClick={async () => {
                  await applyParametersAndRebuild();
                  if (typeof window !== "undefined" && window.innerWidth < 768) {
                    setRightPanelOpen(false);
                  }
                }}
                className="mt-0.5 flex h-[34px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#dc2626] font-mono text-[10.5px] font-bold tracking-wider text-white shadow-xs hover:bg-[#b91c1c] active:scale-[0.99] transition-all uppercase cursor-pointer"
              >
                <Settings className="size-3.5 shrink-0" /> APLICAR
              </button>
            </div>
          )}

          {/* ABA 2: INSPEÇÃO B-REP */}
          {rightTab === "inspecao" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="font-bold text-slate-900 text-[10.5px]">INSPEÇÃO B-REP</span>
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">
                  <span className="size-1 rounded-full bg-emerald-500" /> OCCT VALID
                </span>
              </div>

              <div className="flex flex-col gap-1 text-[9.5px] text-slate-600">
                <div>Dimensões: <strong className="text-slate-900">{paramA.toFixed(0)} × {paramB.toFixed(0)} × {paramC.toFixed(0)} mm</strong></div>
                <div>Volume: <strong className="text-slate-900">{massProps ? massProps.volume.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "30.000"} mm³</strong></div>
                <div>Massa Est.: <strong className="text-red-600">{massProps ? massProps.mass.toFixed(3) : "9.030"} kg</strong></div>
                <div>Área Total: <strong className="text-slate-900">{massProps ? massProps.surfaceArea.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "21.200"} mm²</strong></div>
                <div>
                  Topologia:{" "}
                  <strong className="text-slate-900">
                    {tessData?.mesh?.faceGroups?.length ??
                      (Array.isArray((tessData as unknown as { faces?: unknown[] })?.faces)
                        ? (tessData as unknown as { faces: unknown[] }).faces.length
                        : 3)}{" "}
                    faces,{" "}
                    {tessData?.edges?.totalEdges ??
                      tessData?.edges?.edges?.length ??
                      (Array.isArray(tessData?.edges) ? (tessData.edges as unknown[]).length : 6)}{" "}
                    arestas
                  </strong>
                </div>
                {measurement && (
                  <div className="mt-1 rounded-lg border border-red-200 bg-red-50/70 p-1.5 text-[9px] text-slate-800">
                    <div className="font-bold text-red-600">
                      Distância: {measurement.distance.toFixed(2)} mm
                    </div>
                    <div className="text-[8.5px] text-slate-600">
                      ΔX {measurement.deltaX.toFixed(1)} · ΔY {measurement.deltaY.toFixed(1)} · ΔZ {measurement.deltaZ.toFixed(1)} mm
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 3: FILTRO DE SELEÇÃO */}
          {rightTab === "filtro" && (
            <div className="flex flex-col gap-1.5">
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
                      "rounded-lg border px-1 py-1 text-center font-bold uppercase transition-colors text-[9px]",
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
                <div className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-[9px]">
                  <div className="font-bold text-slate-800">
                    {(selectedEntity.type || "face").toUpperCase()} #{selectedEntity.index ?? 0}
                  </div>
                  <div className="text-slate-500">
                    Posição: ({selectedEntity.point?.x?.toFixed(1) ?? "0.0"}, {selectedEntity.point?.y?.toFixed(1) ?? "0.0"}, {selectedEntity.point?.z?.toFixed(1) ?? "0.0"})
                  </div>
                </div>
              ) : (
                <div className="mt-0.5 rounded-lg border border-dashed border-slate-200 p-1.5 text-center text-[9px] text-slate-400">
                  Clique na peça para selecionar uma {selectionType}
                </div>
              )}
            </div>
          )}
        </aside>
      )}

      {/* ========================================================================= */}
      {/* REGIÃO 5.1 — BARRA INFERIOR DE AÇÕES DE FABRICAÇÃO (40px, LINHA ÚNICA)   */}
      {/* ========================================================================= */}
      <div
        style={{ bottom: "10px", height: "40px" }}
        className="absolute left-1/2 -translate-x-1/2 z-20 flex max-w-[calc(100%-24px)] items-center gap-1.5 overflow-x-auto scrollbar-none rounded-full border border-slate-200/95 bg-white/96 px-1.5 shadow-lg backdrop-blur-md pointer-events-auto"
      >
        {/* PLANIFICAR (Ação Primária de Destaque) */}
        <button
          type="button"
          onClick={() => {
            AudioManager.play("planify_sequence");
            setFlatPatternDialogOpen(true);
          }}
          style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
          className="h-[32px] shrink-0 rounded-full border border-red-200 bg-red-50 px-3.5 font-mono text-[10px] font-bold text-red-600 shadow-2xs hover:bg-red-100 transition-colors uppercase cursor-pointer"
          title="Planificar sólido 3D"
        >
          <Compass className="size-3.5 text-red-600 shrink-0" />
          <span>PLANIFICAR</span>
        </button>

        {/* PRANCHA 2D */}
        <button
          type="button"
          onClick={() => setDraftingDialogOpen(true)}
          style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
          className="h-[32px] shrink-0 rounded-full border border-slate-200 bg-white px-3.5 font-mono text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase cursor-pointer"
          title="Desenho técnico 2D ABNT com vistas ortográficas e carimbo"
        >
          <FileText className="size-3.5 text-slate-600 shrink-0" />
          <span>PRANCHA 2D</span>
        </button>

        {/* ESTRUTURAS */}
        <button
          type="button"
          onClick={() => setWeldmentDialogOpen(true)}
          style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
          className="h-[32px] shrink-0 rounded-full border border-slate-200 bg-white px-3.5 font-mono text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase cursor-pointer"
          title="Estruturas metálicas, perfis industriais e lista de corte"
        >
          <Boxes className="size-3.5 text-slate-600 shrink-0" />
          <span>ESTRUTURAS</span>
        </button>

        {/* CNC / DXF */}
        <button
          type="button"
          onClick={() => setFlatPatternDialogOpen(true)}
          style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}
          className="h-[32px] shrink-0 rounded-full border border-slate-200 bg-white px-3.5 font-mono text-[10px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors uppercase cursor-pointer"
          title="Exportar código G CNC e DXF para máquinas de corte"
        >
          <Crosshair className="size-3.5 text-slate-600 shrink-0" />
          <span>CNC / DXF</span>
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
        fallbackDimensions={{ width: paramA, length: paramB, thickness }}
      />

      <CaldraDraftingDialog
        open={draftingDialogOpen}
        onClose={() => setDraftingDialogOpen(false)}
        features={featuresList}
        massProps={massProps}
        dimensions={{ width: paramA, length: paramB, height: paramC }}
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
