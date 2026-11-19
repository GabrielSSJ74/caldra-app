/**
 * CALDRA CHAMFER — CAD 3D PARAMÉTRICO POR RECURSOS (FEATURE-BASED CAD KERNEL & ZONAS SEM COLISÃO)
 *
 * Unifica:
 * 1. Arquitetura de 5 Zonas Sem Colisão (Shapr3D / Fusion 360 Mobile & Desktop Standard):
 *    - Zona 1: Barra superior global (Lab2DEditor / Cad3DStage com alternador "2D SKETCH | CAD 3D")
 *    - Zona 2: Painel esquerdo recolhível "Categorias 3D" em coluna única (Accordion sem flyout sobreposto)
 *    - Zona 3: Cápsula superior central (34px) + Cubo de Orientação 3D (52x52px) + Pílula Contextual de Topologia
 *    - Zona 4: Gaveta direita contida "Parâmetros 3D" (top: 52px, bottom: 64px) com Editor Dinâmico de Recursos e Árvore Paramétrica (FeatureManager)
 *    - Zona 5: Barra inferior de ações de fabricação (40px, linha única: PLANIFICAR, PRANCHA 2D, ESTRUTURAS, CNC / DXF)
 *
 * 2. Modelagem Paramétrica por Recursos Combináveis (SOLIDWORKS / FreeCAD Standard):
 *    - Planos de Referência (XY, XZ, YZ, Offset de Face), Eixos e Esboços 2D Restritos
 *    - Operações Aditivas: Extrusão (Cego, Plano Médio, Passante, Draft, Parede Fina), Revolução, Sweep/Hélice, Loft, Primitivas
 *    - Operações Subtrativas: Corte Extrudado, Corte Revolucionado, Hole Wizard ISO (M3..M30 com broca de macho automática), Roscas (Cosmética ISO e Modelada 3D), Rasgo Oblongo / Chaveta DIN 6885
 *    - Modificadores e Padrões: Filete Constante, Chanfro (Simétrico, 2 Distâncias, Dist×Ângulo), Casca (Shell), Nervura (Rib), Padrão Linear, Padrão Circular, Espelhamento, Multi-Body e Mates
 *    - Reconstrução Incremental DAG (Dirty-Flag), Persistência Semântica de Topologia e Exportação STEP / STL / DXF
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
  Flame,
  Sliders,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Crosshair,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Copy,
  GitBranch,
  CircleDot,
  Grid,
  FlipHorizontal,
  Sparkles,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { CadViewCube } from "./CadViewCube";
import { ThreeBRepRenderer, type CadGizmoMode } from "@/lib/cad/renderer/ThreeBRepRenderer";
import { getCadKernel } from "@/lib/cad/core";
import { CadFeatureTree } from "@/lib/cad/features/CadFeatureTree";
import { CadBRepEditor } from "@/lib/cad/core/CadBRepEditor";
import {
  ISO_METRIC_THREADS,
  type CadFeatureNode,
  type CadFeatureType,
  type CadBooleanMode,
  type IsoThreadSize,
  type HoleWizardType,
} from "@/lib/cad/features/CadFeatureModel";
import type { CadShape } from "@/lib/cad/core/CadShape";
import type { CadTessellatedShape } from "@/lib/cad/core/CadMesh";
import type { MassProperties } from "@/lib/cad/core/CadKernel";
import type {
  CadSelectedEntity,
  CadSelectionType,
  CadMeasurementResult,
} from "@/lib/cad/core/CadSelection";
import type { EdgeMode, ViewPresetId } from "@/lib/viz3d/cameraPresets";
import type { Entity } from "@/lib/lab2d/core";
import {
  analyze2DSketchFor3D,
  compute2DTo3DCameraMatch,
  LINKED_SKETCH_FEATURE_ID,
  sync2DSketchToFeatureTree,
} from "@/lib/cad/sketch/sketch3dBridge";
import { CaldraBoilermakingDialog } from "@/components/lab2d/CaldraBoilermakingDialog";
import { CaldraFlatPatternDialog } from "@/components/lab2d/CaldraFlatPatternDialog";
import { CaldraDraftingDialog } from "@/components/lab2d/CaldraDraftingDialog";
import { CaldraWeldmentDialog } from "@/components/lab2d/CaldraWeldmentDialog";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { registerThemeBridge } from "@/lib/settings/themeTransitionEngine";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/lab2d/chamferNotify";
import { AudioManager } from "@/lib/audio/AudioManager";
import { AudioQuickControl } from "@/components/audio/AudioQuickControl";
import {
  CHAMFER_SECTION_PLANE_EVENT,
  type ChamferSectionPlaneEventDetail,
} from "./ChamferParametricOrchestrator";

export interface CadBRepViewerProps {
  className?: string;
  initialModelType?: string;
  initialModelTitle?: string;
  initialParams?: Record<string, any>;
  initialWidth?: number;
  initialLength?: number;
  initialThickness?: number;
  entities2D?: Entity[];
  view2D?: { tx: number; ty: number; k: number };
  viewportSize2D?: { w: number; h: number };
  initialTreeJson?: string;
  onTreeChange?: (serializedTreeJson: string) => void;
  morphDirection?: "to3d" | "to2d" | "idle";
  morphDurationMs?: number;
  morphStartProgress3D?: number;
  onMorphFrame0Ready?: () => void;
  onMorphProgress?: (progress3D: number) => void;
  onMorphComplete?: (direction: "to3d" | "to2d") => void;
  activeViewPreset?: ViewPresetId;
  onViewPresetChange?: (preset: ViewPresetId) => void;
  onBack?: () => void;
  onToggleMode?: (mode: "2d" | "3d") => void;
  documentTitle?: string;
  onTitleChange?: (newTitle: string) => void;
  onSave?: () => void;
  isSaved?: boolean;
  onThicknessChange?: (v: number) => void;
  onUpdate3DParam?: (key: string, val: number) => void;
  initialInspectorOpen?: boolean;
  orbitCommand?: {
    azimuthDeg: number;
    elevationDeg: number;
    pivot: { x: number; y: number; z: number };
    animate: boolean;
    nonce: number;
  } | null;
  orbitModeActive?: boolean;
  onOrbitAnglesChange?: (angles: { azimuthDeg: number; elevationDeg: number }) => void;
}

export type LeftCategory =
  | "none"
  | "esboco"
  | "criar"
  | "detalhes"
  | "modificar"
  | "chapa"
  | "estruturas"
  | "medir"
  | "exportar";

type RightPanelTab = "parametros" | "arvore" | "inspecao" | "filtro";

const FEATURE_TYPE_LABELS: Record<CadFeatureType, string> = {
  reference_plane: "Plano de Referência",
  reference_axis: "Eixo de Referência",
  sketch_2d: "Esboço 2D Restrito",
  base_box: "Bloco / Chapa Base",
  base_cylinder: "Cilindro Base",
  base_cone: "Cone / Tronco",
  base_sphere: "Esfera 3D",
  base_torus: "Toro / Anel",
  base_polygon_prism: "Prisma Poligonal",
  base_tube: "Tubo Vazado",
  extrude_sketch: "Extrusão Saliente",
  revolve_feature: "Revolução 3D",
  sweep_feature: "Varredura (Sweep)",
  loft_feature: "Transição (Loft)",
  cut_extrude: "Corte Extrudado",
  cut_revolve: "Corte Revolucionado",
  cut_sweep: "Corte por Varredura",
  hole_cut: "Furo Cilíndrico",
  hole_wizard: "Furo ISO (Hole Wizard)",
  slot_cut: "Rasgo / Chaveta DIN",
  thread_feature: "Rosca Técnica ISO",
  fillet: "Filete (Arredondamento)",
  chamfer: "Chanfro Técnico",
  shell: "Casca Oca (Shell)",
  rib: "Nervura Estrutural",
  draft: "Inclinação (Draft)",
  thicken: "Espessamento 3D",
  linear_pattern: "Padrão Linear",
  circular_pattern: "Padrão Circular",
  mirror_feature: "Espelhamento 3D",
  edge_flange: "Flange Dobrada",
  boilermaking_cone: "Cone Truncado",
  boilermaking_transition: "Quadrado → Redondo",
  boilermaking_elbow: "Curva de Gomos",
  boilermaking_branch: "Boca de Lobo / Tê",
  boilermaking_hood: "Chapéu Chinês / Coifa",
  boolean_op: "Operação Booleana",
  transform: "Transformação 3D",
};

const STORAGE_TREE_KEY = "caldra_chamfer_3d_feature_tree_v2";

export function CadBRepViewer({
  className,
  initialModelType = "boilermaking_cone",
  initialModelTitle = "Cone",
  initialParams,
  initialWidth = 200,
  initialLength = 200,
  initialThickness = 3,
  entities2D,
  view2D,
  viewportSize2D,
  initialTreeJson,
  onTreeChange,
  morphDirection = "idle",
  morphDurationMs,
  morphStartProgress3D,
  onMorphFrame0Ready,
  onMorphProgress,
  onMorphComplete,
  activeViewPreset = "iso",
  onViewPresetChange,
  documentTitle,
  onThicknessChange,
  onUpdate3DParam,
  initialInspectorOpen = false,
  orbitCommand,
  orbitModeActive = false,
  onOrbitAnglesChange,
}: CadBRepViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeBRepRenderer | null>(null);
  const { settings } = useSettings();

  // Detecta tema escuro ou claro
  const isDarkTheme = useMemo(() => {
    return (
      settings?.theme === "dark" ||
      settings?.theme === "amoled" ||
      (typeof document !== "undefined" && document.documentElement.classList.contains("dark"))
    );
  }, [settings?.theme]);

  // Modelo Ativo Inicial
  const [modelType, setModelType] = useState<string>(initialModelType);
  const [modelTitle, setModelTitle] = useState<string>(initialModelTitle);

  // Parâmetros Dinâmicos do Sólido Base
  const [paramA, setParamA] = useState<number>(initialParams?.width || initialParams?.D || initialWidth);
  const [paramB, setParamB] = useState<number>(initialParams?.length || initialParams?.d || initialLength);
  const [paramC, setParamC] = useState<number>(initialParams?.height || initialParams?.H || initialThickness || 3);
  const [paramD, setParamD] = useState<number>(initialParams?.diameter || 120);
  const [thickness, setThickness] = useState<number>(initialThickness);
  const [material, setMaterial] = useState<string>("Aço Carbono");

  // Opções Rápidas Legadas (sincronizadas com recursos na árvore)
  const [optHole, setOptHole] = useState(false);
  const [optFillet, setOptFillet] = useState(false);
  const [optChamfer, setOptChamfer] = useState(false);

  // Motor da Árvore de Recursos e Editor B-Rep
  const treeRef = useRef<CadFeatureTree>(new CadFeatureTree());
  const editorRef = useRef<CadBRepEditor>(new CadBRepEditor(treeRef.current));
  const initialTreeDeserializedRef = useRef(false);
  const [featuresList, setFeaturesList] = useState<readonly CadFeatureNode[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [lastRebuildMs, setLastRebuildMs] = useState<number>(0);
  const [recomputedCount, setRecomputedCount] = useState<number>(0);
  const [sketchStatusNotice, setSketchStatusNotice] = useState<string | null>(null);

  // Histórico de Edição B-Rep
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Estados de Manipulação e Vistas
  const [viewPreset, setViewPreset] = useState<ViewPresetId>(activeViewPreset);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("wireframe");
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

  // Arquitetura de Zonas e Revelação Progressiva
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [activeLeftCat, setActiveLeftCat] = useState<LeftCategory>("criar");
  const [rightPanelOpen, setRightPanelOpen] = useState(initialInspectorOpen);
  const [rightTab, setRightTab] = useState<RightPanelTab>("parametros");
  const [schematicOpen, setSchematicOpen] = useState(false);

  // Estado do Kernel e Geometria Ativa
  const [, setLoading] = useState(true);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [activeShape, setActiveShape] = useState<CadShape | null>(null);
  const [massProps, setMassProps] = useState<MassProperties | null>(null);
  const [tessData, setTessData] = useState<CadTessellatedShape | null>(null);

  // Diálogos Especializados
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [flatPatternDialogOpen, setFlatPatternDialogOpen] = useState(false);
  const [draftingDialogOpen, setDraftingDialogOpen] = useState(false);
  const [weldmentDialogOpen, setWeldmentDialogOpen] = useState(false);

  const openLeftCategoryPanel = useCallback((cat?: LeftCategory) => {
    setLeftPanelOpen(true);
    if (cat && cat !== "none") {
      setActiveLeftCat(cat);
    }
    setViewMenuOpen(false);
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
    if (typeof window !== "undefined" && window.innerWidth < 1100) {
      setLeftPanelOpen(false);
    }
  }, []);

  // Sincronização com a Barra Lateral Esquerda Principal (ChamferCadToolbar) no modo CAD 3D
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

  useEffect(() => {
    setViewPreset(activeViewPreset);
  }, [activeViewPreset]);

  const handleViewPresetChange = (preset: ViewPresetId) => {
    setViewPreset(preset);
    onViewPresetChange?.(preset);
  };

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(editorRef.current.canUndo());
    setCanRedo(editorRef.current.canRedo());
  }, []);

  useEffect(() => {
    AudioManager.play("cad_core_init");
  }, []);

  // Reconstrução Incremental via Feature Tree DAG
  const rebuildFromTree = useCallback(
    async (fitCamera = false) => {
      setLoading(true);
      setConversionError(null);
      AudioManager.play("kernel_loading");
      try {
        const res = await treeRef.current.rebuild();
        const currentFeatures = [...treeRef.current.getFeatures()];
        setFeaturesList(currentFeatures);
        setLastRebuildMs(Number(res.totalExecutionTimeMs ?? res.durationMs ?? 0));
        setRecomputedCount(Number(res.recomputedCount ?? res.rebuiltCount ?? 0));

        // Mantém seleção de recurso consistente
        setSelectedFeatureId((prev) => {
          if (prev && currentFeatures.some((f) => f.id === prev)) return prev;
          return currentFeatures.length > 0 ? currentFeatures[currentFeatures.length - 1]!.id : null;
        });

        // Persiste árvore paramétrica automaticamente
        const serialized = treeRef.current.serializeTree();
        onTreeChange?.(serialized);
        try {
          localStorage.setItem(STORAGE_TREE_KEY, serialized);
        } catch {
          // ignore storage quota errors
        }

        if (res.activeShape && res.tessellation) {
          setActiveShape(res.activeShape);
          setTessData(res.tessellation);
          setMassProps(res.massProperties);
          rendererRef.current?.setShape(res.tessellation, fitCamera);
          if (fitCamera) {
            rendererRef.current?.fitView(false);
          }
          AudioManager.play("kernel_success");
          if (res.errors.length > 0) {
            toast.warning(`Aviso na árvore: ${res.errors[0]}`);
          }
        } else if (res.errors.length > 0) {
          throw new Error(res.errors.join("; "));
        }
        refreshHistoryFlags();
      } catch (err: unknown) {
        console.error("[CadBRepViewer] Erro ao reconstruir árvore:", err);
        AudioManager.play("kernel_error");
        setConversionError((err as Error)?.message || "Não foi possível converter este modelo para CAD 3D.");
      } finally {
        setLoading(false);
      }
    },
    [refreshHistoryFlags, onTreeChange],
  );

  // Inicialização única do ThreeBRepRenderer
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
          setLeftPanelOpen(false);
          setViewMenuOpen(false);
        } else {
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
      onOrbitAnglesChange: (angles) => {
        onOrbitAnglesChange?.(angles);
      },
    });

    renderer.setTheme(isDarkTheme ? "dark" : "light");
    rendererRef.current = renderer;

    const handleSectionPlaneEvent = (rawEv: Event) => {
      const ev = rawEv as CustomEvent<ChamferSectionPlaneEventDetail>;
      if (!ev.detail) return;
      rendererRef.current?.setSectionPlane(ev.detail);
    };
    window.addEventListener(CHAMFER_SECTION_PLANE_EVENT, handleSectionPlaneEvent);

    return () => {
      window.removeEventListener(CHAMFER_SECTION_PLANE_EVENT, handleSectionPlaneEvent);
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    rendererRef.current?.setTheme(isDarkTheme ? "dark" : "light");
  }, [isDarkTheme]);

  useEffect(() => {
    return registerThemeBridge("chamfer-3d-brep-viewer", {
      applyTheme: (theme) => {
        rendererRef.current?.setTheme(theme === "light" ? "light" : "dark");
      },
      renderNow: () => {
        rendererRef.current?.renderImmediate();
      },
    });
  }, []);

  useEffect(() => {
    rendererRef.current?.setEdgeMode(edgeMode);
  }, [edgeMode]);

  const isFirstPresetMountRef = useRef(true);
  const initialBuildDoneRef = useRef(false);

  useEffect(() => {
    if (isFirstPresetMountRef.current) {
      isFirstPresetMountRef.current = false;
      if (view2D) return;
    }
    if (rendererRef.current) {
      if (typeof rendererRef.current.setView === "function") {
        rendererRef.current.setView(viewPreset);
      } else if (typeof rendererRef.current.setViewPreset === "function") {
        rendererRef.current.setViewPreset(viewPreset);
      }
    }
  }, [viewPreset, view2D]);

  useEffect(() => {
    rendererRef.current?.setSelectionType(selectionType);
  }, [selectionType]);

  useEffect(() => {
    rendererRef.current?.setGizmoMode(gizmoMode);
  }, [gizmoMode]);

  useEffect(() => {
    rendererRef.current?.setOrbitModeActive?.(!!orbitModeActive);
  }, [orbitModeActive]);

  useEffect(() => {
    if (!orbitCommand || !rendererRef.current) return;
    rendererRef.current.setOrbitAngles?.(
      orbitCommand.azimuthDeg,
      orbitCommand.elevationDeg,
      orbitCommand.pivot,
      orbitCommand.animate,
      350,
    );
  }, [orbitCommand]);

  const executeMorphTransition = useCallback(
    (dir: "to3d" | "to2d" | "idle" | null | undefined) => {
      if (!rendererRef.current || !view2D || !dir || dir === "idle") return;

      const w = viewportSize2D?.w || containerRef.current?.clientWidth || 800;
      const h = viewportSize2D?.h || containerRef.current?.clientHeight || 600;
      const analysis = analyze2DSketchFor3D(entities2D ?? [], thickness);
      const match = compute2DTo3DCameraMatch(view2D, w, h, 38, analysis.bounds3D);

      if (dir === "to3d") {
        if ((morphStartProgress3D ?? 0) <= 0.001) {
          rendererRef.current.setCameraTo2DMatch(match);
        }
        onMorphFrame0Ready?.();
        rendererRef.current.startMorphTransition({
          direction: "to3d",
          match,
          durationMs: morphDurationMs ?? 550,
          startProgress3D: morphStartProgress3D ?? 0,
          onProgress: onMorphProgress,
          onComplete: () => onMorphComplete?.("to3d"),
        });
      } else if (dir === "to2d") {
        rendererRef.current.startMorphTransition({
          direction: "to2d",
          match,
          durationMs: morphDurationMs ?? 500,
          startProgress3D: morphStartProgress3D ?? 1,
          onProgress: onMorphProgress,
          onComplete: () => onMorphComplete?.("to2d"),
        });
      }
    },
    [
      view2D,
      viewportSize2D,
      entities2D,
      thickness,
      morphStartProgress3D,
      morphDurationMs,
      onMorphFrame0Ready,
      onMorphProgress,
      onMorphComplete,
    ],
  );

  // Constrói ou sincroniza o Sólido Base com o Esboço 2D / Parâmetros
  const applyParametersAndRebuild = useCallback(async () => {
    const tree = treeRef.current;

    // Quando em modo extrude_sketch (sincronizado com o esboço 2D real do CHAMFER)
    if (modelType === "extrude_sketch" && entities2D !== undefined) {
      if (!initialTreeDeserializedRef.current && initialTreeJson) {
        initialTreeDeserializedRef.current = true;
        tree.deserializeTree(initialTreeJson);
      }

      const analysis = analyze2DSketchFor3D(entities2D, thickness);
      const extrudedIdSet = new Set(analysis.sourceEntityIds);
      const visibleWireframes =
        analysis.status === "VALID_SOLID"
          ? analysis.wireframes.filter((wf) => wf.isConstruction || !extrudedIdSet.has(wf.id))
          : analysis.wireframes;
      rendererRef.current?.setSketchWireframes(visibleWireframes, visibleWireframes.length > 0);

      if (analysis.bounds2D) {
        setParamA(Math.round(analysis.bounds2D.width * 10) / 10);
        setParamB(Math.round(analysis.bounds2D.height * 10) / 10);
      }
      setParamC(thickness);

      const syncRes = sync2DSketchToFeatureTree(tree, analysis);

      if (analysis.status === "VALID_SOLID" && syncRes.hasSolidFeatures) {
        setSketchStatusNotice(null);
        await rebuildFromTree(false);
      } else if (syncRes.hasSolidFeatures) {
        // Caso 4.3: Preserva sólidos 3D já existentes na árvore
        setSketchStatusNotice(analysis.status !== "VALID_SOLID" ? analysis.message || null : null);
        await rebuildFromTree(false);
      } else {
        // Caso 4.2: Esboço 2D aberto ou sem perfil fechado (nunca inventa sólido genérico!)
        setConversionError(null);
        setSketchStatusNotice(
          analysis.message ||
            "Esboço aberto no plano XY — feche o contorno na camada Corte para extrudar volume sólido.",
        );
        setActiveShape(null);
        setTessData(null);
        setMassProps(null);
        setFeaturesList([...tree.getFeatures()]);
        rendererRef.current?.setShape(null, false);
        setLoading(false);
      }

      if (!initialBuildDoneRef.current) {
        initialBuildDoneRef.current = true;
        if (morphDirection === "to3d" || morphDirection === "to2d") {
          executeMorphTransition(morphDirection);
        } else if (view2D && rendererRef.current) {
          const w = viewportSize2D?.w || containerRef.current?.clientWidth || 800;
          const h = viewportSize2D?.h || containerRef.current?.clientHeight || 600;
          const match = compute2DTo3DCameraMatch(view2D, w, h, 38, analysis.bounds3D);
          rendererRef.current.applyCameraPose(match.pose3D);
        }
      }
      return;
    }

    editorRef.current.pushUndo();
    tree.dispose();
    setSketchStatusNotice(null);

    try {
      switch (modelType) {
        case "base_box":
          tree.addFeature({
            name: modelTitle || "Bloco Paramétrico",
            type: "base_box",
            parameters: {
              width: paramA || 160,
              length: paramB || 120,
              height: paramC || 40,
              centered: true,
              material,
            },
          });
          break;

        case "extrude_sketch":
          tree.addFeature({
            name: modelTitle && modelTitle !== "Cone" ? modelTitle : "Chapa Extrudada",
            type: "extrude_sketch",
            parameters: {
              depth: thickness,
              width: paramA || 160,
              length: paramB || 120,
              endCondition: "blind",
              direction: "normal",
              booleanMode: "new_body",
              material,
            },
          });
          break;

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

        case "base_cylinder":
          tree.addFeature({
            name: "Cilindro Industrial",
            type: "base_cylinder",
            parameters: {
              radius: paramA / 2,
              height: paramC,
              centered: true,
              thickness,
              material,
            },
          });
          break;

        case "base_polygon_prism":
          tree.addFeature({
            name: "Prisma Hexagonal",
            type: "base_polygon_prism",
            parameters: {
              sides: 6,
              radius: paramA / 2,
              height: paramC,
              centered: true,
              material,
            },
          });
          break;

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

      await rebuildFromTree(true);
      initialBuildDoneRef.current = true;
    } catch (err: unknown) {
      console.error("[CadBRepViewer] Erro na criação da geometria:", err);
      setConversionError((err as Error)?.message || "Não foi possível converter este modelo para CAD 3D.");
    }
  }, [
    modelType,
    modelTitle,
    entities2D,
    initialTreeJson,
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
    morphDirection,
    executeMorphTransition,
    view2D,
    viewportSize2D,
  ]);

  // Sincroniza automaticamente quando o esboço 2D ou a espessura mudam
  useEffect(() => {
    void applyParametersAndRebuild();
  }, [entities2D, thickness, modelType]);

  // Orquestração da transição contínua de câmera 2D ↔ 3D (550 ms ida / 500 ms volta) quando já construído
  useEffect(() => {
    if (!initialBuildDoneRef.current) return;
    executeMorphTransition(morphDirection);
  }, [morphDirection, executeMorphTransition]);

  // =========================================================================
  // ADIÇÃO DE RECURSOS COMBINÁVEIS NA ÁRVORE PARAMÉTRICA
  // =========================================================================
  const addCombinableFeature = useCallback(
    async (type: CadFeatureType, customName?: string, customParams?: Record<string, any>) => {
      const tree = treeRef.current;
      const existing = tree.getFeatures();
      const lastFeature = existing[existing.length - 1];
      const selectedFaceIdx = selectedEntity?.type === "face" ? (selectedEntity.index ?? 0) : undefined;
      const selectedEdgeIdx =
        selectedEntity?.type === "edge"
          ? multiSelection.filter((e) => e.type === "edge").map((e) => e.index ?? 0)
          : [0];

      const semanticRefs =
        selectedEntity?.type === "face"
          ? [
              {
                kind: "face" as const,
                fallbackIndex: selectedEntity.index ?? 0,
                expectedNormal: selectedEntity.normal || { x: 0, y: 0, z: 1 },
                expectedCentroid: selectedEntity.point || { x: 0, y: 0, z: paramC / 2 },
              },
            ]
          : undefined;

      let defaultName = customName || FEATURE_TYPE_LABELS[type] || type;
      let defaultParams: Record<string, any> = {};

      switch (type) {
        case "reference_plane":
          defaultName = "Plano Offset Z+30 mm";
          defaultParams = {
            basePlane: "XY",
            offsetDistance: 30,
            flipNormal: false,
            origin: { x: 0, y: 0, z: 30 },
            normal: { x: 0, y: 0, z: 1 },
          };
          break;
        case "reference_axis":
          defaultName = "Eixo de Referência Z";
          defaultParams = {
            mode: "principal_Z",
            origin: { x: 0, y: 0, z: 0 },
            direction: { x: 0, y: 0, z: 1 },
          };
          break;
        case "sketch_2d":
          defaultName = selectedFaceIdx !== undefined ? `Esboço na Face #${selectedFaceIdx}` : "Esboço 2D Restrito";
          defaultParams = {
            plane: "XY",
            profileKind: "rectangle",
            width: 60,
            length: 40,
            radius: 25,
            sides: 6,
            offsetZ: selectedEntity?.point?.z ?? paramC / 2,
            centerX: selectedEntity?.point?.x ?? 0,
            centerY: selectedEntity?.point?.y ?? 0,
            constraintStatus: "FULLY_CONSTRAINED",
            degreesOfFreedom: 0,
          };
          break;
        case "extrude_sketch":
          defaultName = "Ressalto Extrudado";
          defaultParams = {
            profileKind: "circle",
            diameter: 70,
            width: 60,
            length: 60,
            depth: 25,
            direction: "normal",
            endCondition: "blind",
            draftAngleDeg: 0,
            thinWallThickness: 0,
            centerX: selectedEntity?.point?.x ?? 0,
            centerY: selectedEntity?.point?.y ?? 0,
            offsetZ: selectedEntity?.point?.z ?? 0,
            booleanMode: existing.length > 0 ? "union" : "new_body",
          };
          break;
        case "cut_extrude":
          defaultName = "Corte Extrudado";
          defaultParams = {
            profileKind: "rectangle",
            width: 45,
            length: 45,
            diameter: 40,
            depth: paramC + 40,
            direction: "both",
            endCondition: "through_all",
            draftAngleDeg: 0,
            centerX: selectedEntity?.point?.x ?? 0,
            centerY: selectedEntity?.point?.y ?? 0,
            offsetZ: 0,
          };
          break;
        case "revolve_feature":
          defaultName = "Revolução 360°";
          defaultParams = {
            axis: "Z",
            angleDeg: 360,
            profileWidth: 35,
            profileHeight: 80,
            innerRadius: 15,
            profilePreset: "stepped_shaft",
            booleanMode: existing.length > 0 ? "union" : "new_body",
          };
          break;
        case "cut_revolve":
          defaultName = "Canal Revolucionado";
          defaultParams = {
            axis: "Z",
            angleDeg: 360,
            profileWidth: 8,
            profileHeight: 12,
            innerRadius: Math.max(15, paramA / 2 - 6),
          };
          break;
        case "sweep_feature":
          defaultName = "Varredura Helicoidal 3D";
          defaultParams = {
            profileShape: "circle",
            profileRadius: 6,
            pathType: "helix",
            pathLength: 90,
            pathRadius: Math.max(30, paramA / 3),
            helixPitch: 25,
            helixTurns: 3,
            booleanMode: existing.length > 0 ? "union" : "new_body",
          };
          break;
        case "loft_feature":
          defaultName = "Transição Loft Multi-Seção";
          defaultParams = {
            bottomShape: "rectangle",
            bottomWidth: 120,
            bottomLength: 120,
            topShape: "circle",
            topDiameter: 70,
            height: 90,
            ruled: true,
            offsetZ: 0,
            booleanMode: existing.length > 0 ? "union" : "new_body",
          };
          break;
        case "hole_wizard":
          defaultName = "Furo ISO M10 (Hole Wizard)";
          defaultParams = {
            holeType: "tapped_iso",
            isoSize: "M10",
            diameter: 8.5,
            depth: paramC + 50,
            endCondition: "through_all",
            counterboreDiameter: 16,
            counterboreDepth: 10,
            countersinkDiameter: 20,
            countersinkAngleDeg: 90,
            threadDepth: 25,
            positions: [
              {
                x: selectedEntity?.point?.x ?? 0,
                y: selectedEntity?.point?.y ?? 0,
                z: selectedEntity?.point?.z ?? 0,
              },
            ],
          };
          break;
        case "hole_cut":
          defaultName = "Furo Passante Ø24 mm";
          defaultParams = {
            diameter: 24,
            depth: paramC + 40,
            isThrough: true,
            position: {
              x: selectedEntity?.point?.x ?? 0,
              y: selectedEntity?.point?.y ?? 0,
              z: -paramC / 2,
            },
          };
          break;
        case "slot_cut":
          defaultName = "Rasgo Oblongo 40×14 mm";
          defaultParams = {
            slotType: "oblong_through",
            length: 40,
            width: 14,
            depth: paramC + 40,
            isThrough: true,
            centerX: selectedEntity?.point?.x ?? 0,
            centerY: selectedEntity?.point?.y ?? 0,
            offsetZ: 0,
            angleDeg: 0,
          };
          break;
        case "thread_feature":
          defaultName = "Rosca ISO M16×2.0";
          defaultParams = {
            threadMode: "cosmetic_iso",
            isoSize: "M16",
            pitch: 2.0,
            length: 35,
            isExternal: true,
            leftHanded: false,
            nominalDiameter: 16,
            position: { x: 0, y: 0, z: paramC / 2 },
          };
          break;
        case "fillet":
          defaultName = "Filete R4 mm";
          defaultParams = {
            radius: 4,
            edgeIndices: selectedEdgeIdx.length > 0 ? selectedEdgeIdx : [0],
          };
          break;
        case "chamfer":
          defaultName = "Chanfro 3 mm × 45°";
          defaultParams = {
            chamferMode: "symmetric",
            distance: 3,
            distance2: 3,
            angleDeg: 45,
            edgeIndices: selectedEdgeIdx.length > 0 ? selectedEdgeIdx : [0],
          };
          break;
        case "shell":
          defaultName = "Casca Oca esp. 3 mm";
          defaultParams = {
            wallThickness: 3,
            openFaceIndices: selectedFaceIdx !== undefined ? [selectedFaceIdx] : [0],
            direction: "inward",
          };
          break;
        case "rib":
          defaultName = "Nervura Estrutural 10 mm";
          defaultParams = {
            thickness: 10,
            width: 65,
            height: 65,
            plane: "XZ",
            offset: 0,
            flipMaterialSide: false,
          };
          break;
        case "draft":
          defaultName = "Inclinação Draft 5°";
          defaultParams = {
            angleDeg: 5,
            pullDirection: "Z",
            faceIndices: selectedFaceIdx !== undefined ? [selectedFaceIdx] : [0],
          };
          break;
        case "thicken":
          defaultName = "Espessamento +3 mm";
          defaultParams = {
            thickness: 3,
            bothSides: false,
          };
          break;
        case "linear_pattern":
          defaultName = "Padrão Linear 3×";
          defaultParams = {
            targetFeatureId: lastFeature?.id,
            direction1: "X",
            spacing1: 45,
            count1: 3,
            direction2: "Y",
            spacing2: 45,
            count2: 1,
            patternWholeBody: false,
          };
          break;
        case "circular_pattern":
          defaultName = "Padrão Circular 6× (360°)";
          defaultParams = {
            targetFeatureId: lastFeature?.id,
            axis: "Z",
            totalAngleDeg: 360,
            count: 6,
            equalSpacing: true,
            patternWholeBody: false,
          };
          break;
        case "mirror_feature":
          defaultName = "Espelhamento Plano YZ";
          defaultParams = {
            targetFeatureId: lastFeature?.id,
            mirrorPlane: "YZ",
            planeOffset: 0,
            mergeSolids: true,
            mirrorWholeBody: false,
          };
          break;
        case "edge_flange":
          defaultName = "Flange Dobrada 90°";
          defaultParams = {
            edgeIndex: selectedEdgeIdx[0] ?? 0,
            angleDeg: 90,
            length: 45,
            bendRadius: 4,
            thickness,
          };
          break;
        default:
          defaultParams = {};
      }

      const mergedParams = { ...defaultParams, ...(customParams || {}) };
      const newId = await editorRef.current.addParametricFeature({
        name: defaultName,
        type,
        parameters: mergedParams,
        dependsOn: lastFeature ? [lastFeature.id] : [],
        semanticRefs,
      });

      setSelectedFeatureId(newId);
      setLeftPanelOpen(false);
      openRightInspector("parametros");
      await rebuildFromTree(false);
      toast.success(`Recurso "${defaultName}" adicionado à Árvore Paramétrica.`);
    },
    [selectedEntity, multiSelection, paramC, paramA, thickness, openRightInspector, rebuildFromTree],
  );

  // =========================================================================
  // SEQUÊNCIAS COMBINÁVEIS DE ENGENHARIA (VALIDAÇÃO DO KERNEL PARAMÉTRICO)
  // =========================================================================
  const loadCombinableSequence = useCallback(
    async (preset: "flange_mecanico" | "suporte_nervura" | "eixo_chaveta") => {
      const tree = treeRef.current;
      editorRef.current.pushUndo();
      tree.dispose();

      if (preset === "flange_mecanico") {
        setModelTitle("Flange Industrial ISO");
        setParamA(180);
        setParamB(180);
        setParamC(45);
        const fBase = tree.addFeature({
          name: "1. Disco Base Ø180×18 mm",
          type: "base_cylinder",
          parameters: { radius: 90, height: 18, centered: false },
        });
        const fBoss = tree.addFeature({
          name: "2. Ressalto Cubo Ø100×27 mm",
          type: "extrude_sketch",
          parameters: {
            profileKind: "circle",
            diameter: 100,
            depth: 27,
            offsetZ: 18,
            booleanMode: "union",
          },
          dependsOn: [fBase.id],
        });
        const fBore = tree.addFeature({
          name: "3. Furo Central Passante Ø56 mm",
          type: "hole_cut",
          parameters: {
            diameter: 56,
            depth: 60,
            isThrough: true,
            position: { x: 0, y: 0, z: -2 },
          },
          dependsOn: [fBoss.id],
        });
        const fBoltHole = tree.addFeature({
          name: "4. Furo ISO M12 (Raio 68 mm)",
          type: "hole_wizard",
          parameters: {
            holeType: "tapped_iso",
            isoSize: "M12",
            diameter: 10.2,
            depth: 25,
            endCondition: "through_all",
            positions: [{ x: 68, y: 0, z: 0 }],
          },
          dependsOn: [fBore.id],
        });
        tree.addFeature({
          name: "5. Padrão Circular 6× Furos M12",
          type: "circular_pattern",
          parameters: {
            targetFeatureId: fBoltHole.id,
            axis: "Z",
            totalAngleDeg: 360,
            count: 6,
            equalSpacing: true,
            patternWholeBody: false,
          },
          dependsOn: [fBoltHole.id],
        });
      } else if (preset === "suporte_nervura") {
        setModelTitle("Suporte Estrutural com Nervura");
        setParamA(140);
        setParamB(90);
        setParamC(85);
        const fBase = tree.addFeature({
          name: "1. Placa Base 140×90×14 mm",
          type: "base_box",
          parameters: { width: 140, length: 90, height: 14, centered: true },
        });
        const fWall = tree.addFeature({
          name: "2. Parede Vertical 18×90×75 mm",
          type: "extrude_sketch",
          parameters: {
            profileKind: "rectangle",
            width: 18,
            length: 90,
            depth: 75,
            centerX: -61,
            centerY: 0,
            offsetZ: 7,
            booleanMode: "union",
          },
          dependsOn: [fBase.id],
        });
        const fRib = tree.addFeature({
          name: "3. Nervura Triangular esp. 12 mm",
          type: "rib",
          parameters: {
            thickness: 12,
            width: 75,
            height: 60,
            plane: "XZ",
            offset: 0,
          },
          dependsOn: [fWall.id],
        });
        tree.addFeature({
          name: "4. Rasgo Oblongo Fixação 36×14 mm",
          type: "slot_cut",
          parameters: {
            slotType: "oblong_through",
            length: 36,
            width: 14,
            depth: 30,
            isThrough: true,
            centerX: 32,
            centerY: 0,
            offsetZ: -15,
            angleDeg: 0,
          },
          dependsOn: [fRib.id],
        });
      } else if (preset === "eixo_chaveta") {
        setModelTitle("Eixo Escalonado c/ Chaveta DIN");
        setParamA(70);
        setParamB(70);
        setParamC(130);
        const fShaft = tree.addFeature({
          name: "1. Revolução Eixo Escalonado 360°",
          type: "revolve_feature",
          parameters: {
            axis: "Z",
            angleDeg: 360,
            profileWidth: 35,
            profileHeight: 120,
            innerRadius: 0,
            profilePreset: "stepped_shaft",
            booleanMode: "new_body",
          },
        });
        const fKeyway = tree.addFeature({
          name: "2. Rasgo de Chaveta DIN 6885 (10×50 mm)",
          type: "slot_cut",
          parameters: {
            slotType: "keyway_din6885",
            length: 50,
            width: 10,
            depth: 8,
            isThrough: false,
            centerX: 18,
            centerY: 0,
            offsetZ: 60,
            angleDeg: 90,
          },
          dependsOn: [fShaft.id],
        });
        tree.addFeature({
          name: "3. Rosca Externa ISO M24×3.0 (Modelada 3D)",
          type: "thread_feature",
          parameters: {
            threadMode: "modeled_3d",
            isoSize: "M24",
            pitch: 3.0,
            length: 30,
            isExternal: true,
            nominalDiameter: 35,
            position: { x: 0, y: 0, z: 85 },
          },
          dependsOn: [fKeyway.id],
        });
      }

      await rebuildFromTree(true);
      openRightInspector("arvore");
      toast.success("Sequência paramétrica combinável construída na Árvore de Recursos!");
    },
    [rebuildFromTree, openRightInspector],
  );

  // Exportação STEP ISO 10303-21, STL e JSON Paramétrico
  const handleExportFormat = useCallback(
    async (format: "step" | "stl" | "json") => {
      try {
        const safeName = (documentTitle || modelTitle || "peca_caldra")
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "_");

        if (format === "json") {
          const json = treeRef.current.serializeTree();
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${safeName}.chamfer3d.json`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Árvore Paramétrica (.chamfer3d.json) exportada!");
          return;
        }

        if (!activeShape) {
          toast.error("Nenhum sólido B-Rep ativo para exportar.");
          return;
        }

        const kernel = await getCadKernel();
        if (format === "step") {
          const stepContent = await kernel.exportSTEP(activeShape);
          const blob = new Blob([stepContent], { type: "application/step" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${safeName}.step`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Arquivo STEP ISO 10303-21 (.step) exportado com sucesso!");
        } else if (format === "stl") {
          const stlBuffer = await kernel.exportSTL(activeShape);
          const blob = new Blob([stlBuffer], { type: "model/stl" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${safeName}.stl`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Malha 3D (.stl) exportada com sucesso!");
        }
      } catch (err: unknown) {
        toast.error(`Erro ao exportar: ${(err as Error)?.message || String(err)}`);
      }
    },
    [activeShape, documentTitle, modelTitle],
  );

  // Ações de Undo / Redo
  const handleUndo = async () => {
    AudioManager.play("cad_undo");
    const res = await editorRef.current.undo();
    if (res) await rebuildFromTree(false);
  };

  const handleRedo = async () => {
    AudioManager.play("cad_redo");
    const res = await editorRef.current.redo();
    if (res) await rebuildFromTree(false);
  };

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

  // Recurso atualmente selecionado na Árvore para Edição Dinâmica
  const activeFeatureNode = useMemo(() => {
    if (!selectedFeatureId) return featuresList[featuresList.length - 1] || null;
    return featuresList.find((f) => f.id === selectedFeatureId) || featuresList[featuresList.length - 1] || null;
  }, [featuresList, selectedFeatureId]);

  const updateActiveFeatureParam = useCallback(
    async (key: string, value: any, autoRebuild = false) => {
      if (!activeFeatureNode) return;
      treeRef.current.updateFeature(activeFeatureNode.id, {
        ...activeFeatureNode.parameters,
        [key]: value,
      });
      setFeaturesList([...treeRef.current.getFeatures()]);
      if (autoRebuild) {
        await rebuildFromTree(false);
      }
    },
    [activeFeatureNode, rebuildFromTree],
  );

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

      {/* ESTADO DE ERRO TÉCNICO */}
      {conversionError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-6">
          <div className="max-w-md rounded-2xl border border-red-300 bg-white p-6 shadow-2xl text-center font-mono">
            <AlertTriangle className="size-10 text-red-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Diagnóstico de Reconstrução CAD 3D
            </h3>
            <p className="mt-2 text-xs text-slate-600">{conversionError}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => applyParametersAndRebuild()}
                className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                Restaurar Sólido Base
              </button>
              <button
                type="button"
                onClick={() => setConversionError(null)}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Inspecionar Árvore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AVISO DISCRETO PARA ESBOÇO 2D ABERTO / SEM VOLUME SÓLIDO (CASO 4.2)       */}
      {/* ========================================================================= */}
      {sketchStatusNotice && !conversionError && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-20 max-w-lg px-4">
          <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-slate-900/90 px-3.5 py-1 text-[10px] font-mono font-bold text-amber-300 shadow-lg backdrop-blur-md">
            <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />
            <span>{sketchStatusNotice}</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COTAS TÉCNICAS SOBREPOSTAS AO VIEWPORT (EXCLUSIVO PARA CALDEIRARIA)       */}
      {/* ========================================================================= */}
      {!conversionError && modelType.startsWith("boilermaking_") && (
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
              {Number(paramC || 0).toFixed(0)} mm
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
                ? `${Number(paramA || 0).toFixed(0)} × ${Number(paramB || 0).toFixed(0)} mm`
                : `Ø ${Number(paramA || 0).toFixed(0)} mm`}
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REGIÃO 3.1 — CÁPSULA DE VISUALIZAÇÃO COMPACTA (TOPO CENTRAL, 34px)        */}
      {/* ========================================================================= */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
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
            title={
              edgeMode === "shaded"
                ? "Sombreado puro (clique para Sombreado + Arestas)"
                : "Sombreado com arestas (clique para alternar)"
            }
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
            title={
              isOrtho
                ? "Projeção Ortográfica (clique para Perspectiva)"
                : "Projeção em Perspectiva (clique para Ortográfica)"
            }
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

          {/* MENU COMPACTO "VISUALIZAÇÃO" */}
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

                <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Áudio do Sistema</span>
                  <AudioQuickControl />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PÍLULA CONTEXTUAL DE TOPOLOGIA (Aparece ao tocar numa Face ou Aresta no 3D — Padrão Shapr3D) */}
        {selectedEntity && (
          <div className="flex items-center gap-1 rounded-full border border-red-500/40 bg-slate-900/95 px-2.5 py-1 shadow-lg backdrop-blur-md font-mono text-[9px] text-white">
            <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold uppercase">
              {selectedEntity.type === "face"
                ? `FACE #${selectedEntity.index ?? 0}`
                : selectedEntity.type === "edge"
                  ? `ARESTA #${selectedEntity.index ?? 0}`
                  : `VÉRTICE #${selectedEntity.index ?? 0}`}
            </span>

            {selectedEntity.type === "face" ? (
              <>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("sketch_2d")}
                  className="rounded-full px-2 py-0.5 font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  + Esboço
                </button>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("extrude_sketch")}
                  className="rounded-full px-2 py-0.5 font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  + Extrusão
                </button>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("hole_wizard")}
                  className="rounded-full px-2 py-0.5 font-bold text-amber-300 hover:bg-slate-800 transition-colors"
                >
                  ⌖ Furo ISO
                </button>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("shell")}
                  className="rounded-full px-2 py-0.5 font-bold text-sky-300 hover:bg-slate-800 transition-colors"
                >
                  Casca
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("fillet")}
                  className="rounded-full px-2 py-0.5 font-bold text-emerald-300 hover:bg-slate-800 transition-colors"
                >
                  + Filete R4
                </button>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("chamfer")}
                  className="rounded-full px-2 py-0.5 font-bold text-amber-300 hover:bg-slate-800 transition-colors"
                >
                  + Chanfro 3mm
                </button>
                <button
                  type="button"
                  onClick={() => addCombinableFeature("edge_flange")}
                  className="rounded-full px-2 py-0.5 font-bold text-sky-300 hover:bg-slate-800 transition-colors"
                >
                  + Flange
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setSelectedEntity(null)}
              className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:text-white"
              title="Limpar seleção topológica"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* REGIÃO 3.2 — CUBO DE ORIENTAÇÃO 3D (52x52px) + EIXOS XYZ SEM COLISÃO      */}
      {/* ========================================================================= */}
      <div
        style={{
          top: rightPanelOpen ? "12px" : "52px",
          right: rightPanelOpen ? "calc(clamp(256px, 31vw, 310px) + 20px)" : "12px",
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
            title="Abrir categorias de modelagem CAD 3D (Esboço, Criar, Cortar/Furar, Modificar, Padrões, Chapa, Estruturas, Exportar)"
          >
            <Boxes className="size-3.5 text-red-600 shrink-0" />
            <span>Categorias 3D</span>
            <ChevronRight className="size-3 text-slate-500 shrink-0" />
          </button>
        </div>
      )}

      <div
        aria-hidden={!leftPanelOpen}
        style={{
          top: "12px",
          bottom: "64px",
          maxHeight: "calc(100% - 76px)",
          width: "216px",
          opacity: leftPanelOpen ? 1 : 0,
          transform: leftPanelOpen ? "translateX(0)" : "translateX(-12px)",
          pointerEvents: leftPanelOpen ? "auto" : "none",
          transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="absolute left-3 z-25 overflow-y-auto rounded-2xl border border-slate-200/95 bg-white/96 p-2 shadow-xl backdrop-blur-md flex flex-col gap-1 font-mono"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-800">
            Recursos CAD 3D
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

        {/* CATEGORIA 0: ESBOÇO & PLANOS DE REFERÊNCIA */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setActiveLeftCat((c) => (c === "esboco" ? "none" : "esboco"))}
            className={cn(
              "flex h-[32px] w-full items-center justify-between rounded-xl px-2.5 text-[10px] font-bold uppercase transition-all",
              activeLeftCat === "esboco"
                ? "bg-[#dc2626] text-white shadow-2xs"
                : "bg-slate-50/80 text-slate-700 hover:bg-slate-100 border border-slate-100",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Compass className="size-3.5 shrink-0" /> ESBOÇO & PLANOS
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "esboco" && "rotate-180")} />
          </button>
          {activeLeftCat === "esboco" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => addCombinableFeature("sketch_2d")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                <Plus className="size-3 shrink-0" /> Novo Esboço 2D no Plano
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("reference_plane")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Layers className="size-3 shrink-0" /> Plano de Referência (Offset)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("reference_axis")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Crosshair className="size-3 shrink-0" /> Eixo de Referência 3D
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 1: CRIAR VOLUME (ADITIVO + PRIMITIVAS + CALDEIRARIA) */}
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
              <Box className="size-3.5 shrink-0" /> CRIAR VOLUME
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "criar" && "rotate-180")} />
          </button>
          {activeLeftCat === "criar" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <div className="px-2 py-0.5 text-[8px] font-bold uppercase text-slate-400">
                Recursos Aditivos 3D
              </div>
              <button
                type="button"
                onClick={() => addCombinableFeature("extrude_sketch")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                <Plus className="size-3 shrink-0" /> Extrusão (Saliente/Base)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("revolve_feature")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <RotateCw className="size-3 shrink-0" /> Revolução (0°–360°)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("sweep_feature")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <GitBranch className="size-3 shrink-0" /> Varredura / Hélice 3D
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("loft_feature")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Layers className="size-3 shrink-0" /> Transição Multi-Seção (Loft)
              </button>

              <div className="mt-1 px-2 py-0.5 text-[8px] font-bold uppercase text-slate-400 border-t border-slate-100 pt-1">
                Sólidos Base & Caldeiraria
              </div>
              <button
                type="button"
                onClick={() => {
                  setModelType("base_box");
                  setModelTitle("Bloco Paramétrico");
                  setParamA(160);
                  setParamB(100);
                  setParamC(40);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Box className="size-3 shrink-0" /> Bloco / Placa Base
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("base_cylinder");
                  setModelTitle("Cilindro Industrial");
                  setParamA(140);
                  setParamC(120);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <CircleDot className="size-3 shrink-0" /> Cilindro / Tubo
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("base_polygon_prism");
                  setModelTitle("Prisma Hexagonal");
                  setParamA(120);
                  setParamC(60);
                  setLeftPanelOpen(false);
                  openRightInspector("parametros");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Boxes className="size-3 shrink-0" /> Prisma Poligonal (Hex)
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelType("boilermaking_cone");
                  setModelTitle("Cone Truncado");
                  setParamA(200);
                  setParamB(100);
                  setParamC(120);
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
            </div>
          )}
        </div>

        {/* CATEGORIA 2: CORTAR, FURAR & ROSCAS ISO (HOLE WIZARD) */}
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
              <CircleDot className="size-3.5 shrink-0" /> CORTAR & FURAR
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "detalhes" && "rotate-180")} />
          </button>
          {activeLeftCat === "detalhes" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => addCombinableFeature("hole_wizard")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                <Crosshair className="size-3 shrink-0" /> Assistente de Furo ISO (M3–M30)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("cut_extrude")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Scissors className="size-3 shrink-0" /> Corte Extrudado
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("cut_revolve")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <RotateCw className="size-3 shrink-0" /> Corte Revolucionado (Canal)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("slot_cut")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Sliders className="size-3 shrink-0" /> Rasgo Oblongo / Chaveta DIN
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("thread_feature")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Settings className="size-3 shrink-0" /> Rosca Técnica ISO (Cosm./3D)
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 3: MODIFICAR & PADRÕES */}
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
              <Scissors className="size-3.5 shrink-0" /> MODIFICAR & PADRÕES
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "modificar" && "rotate-180")} />
          </button>
          {activeLeftCat === "modificar" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => addCombinableFeature("fillet")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Scissors className="size-3 shrink-0" /> Filete Constante (Fillet)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("chamfer")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Scissors className="size-3 shrink-0" /> Chanfro (Simétrico / Ângulo)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("shell")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Box className="size-3 shrink-0" /> Casca Oca (Shell)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("rib")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Layers className="size-3 shrink-0" /> Nervura Estrutural (Rib)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("draft")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Sliders className="size-3 shrink-0" /> Inclinação de Face (Draft)
              </button>
              <div className="my-0.5 border-t border-slate-100 pt-1 px-2 text-[8px] font-bold uppercase text-slate-400">
                Padrões & Simetria
              </div>
              <button
                type="button"
                onClick={() => addCombinableFeature("linear_pattern")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Grid className="size-3 shrink-0" /> Padrão Linear (1D / 2D)
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("circular_pattern")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <RotateCw className="size-3 shrink-0" /> Padrão Circular Polar
              </button>
              <button
                type="button"
                onClick={() => addCombinableFeature("mirror_feature")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <FlipHorizontal className="size-3 shrink-0" /> Espelhar Recurso / Sólido
              </button>
              <button
                type="button"
                onClick={() => {
                  setGizmoMode("translate");
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Move className="size-3 shrink-0" /> Mover / Transladar (Gizmo)
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 4: CHAPA METÁLICA */}
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
              <Layers className="size-3.5 shrink-0" /> CHAPA & PLANIFICAÇÃO
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "chapa" && "rotate-180")} />
          </button>
          {activeLeftCat === "chapa" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => addCombinableFeature("edge_flange")}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Plus className="size-3 shrink-0" /> Flange de Aresta Dobrada
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlatPatternDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-red-600 font-bold hover:bg-red-50 transition-colors"
              >
                <Compass className="size-3 shrink-0" /> Planificar Sólido (Fator K)
              </button>
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

        {/* CATEGORIA 5: ESTRUTURAS & MONTAGEM */}
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
              <Boxes className="size-3.5 shrink-0" /> ESTRUTURAS & MATES
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
                <Boxes className="size-3 shrink-0" /> Perfis Metálicos & Cut-List
              </button>
              <button
                type="button"
                onClick={() => {
                  treeRef.current.addMate({
                    name: "Mate Concêntrico Eixo-Furo",
                    type: "CONCENTRIC",
                    bodyAId: "body_main",
                    bodyBId: "body_2",
                    isSolved: true,
                    degreesOfFreedomRemaining: 1,
                  });
                  setLeftPanelOpen(false);
                  openRightInspector("arvore");
                  toast.success("Restrição de Montagem (Mate Concêntrico) registrada na Árvore!");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <GitBranch className="size-3 shrink-0" /> + Mate de Montagem (3D)
              </button>
            </div>
          )}
        </div>

        {/* CATEGORIA 6: MEDIR & INSPECIONAR */}
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
              <Ruler className="size-3.5 shrink-0" /> MEDIR & TOPOLOGIA
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
                <Ruler className="size-3 shrink-0" /> Metrologia B-Rep (Massa/CG)
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

        {/* CATEGORIA 7: INTEROPERABILIDADE & EXPORTAÇÃO */}
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
              <Download className="size-3.5 shrink-0" /> EXPORTAR CAD
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", activeLeftCat === "exportar" && "rotate-180")} />
          </button>
          {activeLeftCat === "exportar" && (
            <div className="mt-1 ml-1 pl-1.5 border-l-2 border-red-200 flex flex-col gap-0.5 text-[9.5px]">
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(false);
                  void handleExportFormat("step");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                <Download className="size-3 shrink-0" /> Exportar STEP (.step)
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(false);
                  void handleExportFormat("stl");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Download className="size-3 shrink-0" /> Exportar Malha STL (.stl)
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(false);
                  void handleExportFormat("json");
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Download className="size-3 shrink-0" /> Árvore JSON (.chamfer3d)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlatPatternDialogOpen(true);
                  setLeftPanelOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Download className="size-3 shrink-0" /> DXF / Código G CNC
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REGIÃO 4 — INSPETOR CONTEXTUAL DE PROPRIEDADES E ÁRVORE À DIREITA         */}
      {/* ========================================================================= */}
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
          <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.2 text-[8.5px]">
            {featuresList.length}
          </span>
        </button>
      </div>

      {rightPanelOpen && (
        <aside
          aria-label="Inspetor de Propriedades e Árvore Paramétrica 3D"
          style={{
            width: "clamp(256px, 31vw, 310px)",
            top: "52px",
            bottom: "64px",
            maxHeight: "calc(100% - 116px)",
            transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          className="absolute right-3 z-25 overflow-y-auto rounded-2xl border border-slate-200/95 bg-white/98 p-3 shadow-xl backdrop-blur-md flex flex-col gap-2.5 font-mono text-[10px] text-slate-800 pointer-events-auto"
        >
          {/* ABAS DO INSPETOR + BOTÃO FECHAR (✕) */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setRightTab("parametros")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[8.5px] whitespace-nowrap",
                  rightTab === "parametros"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <Sliders className="size-2.5 text-red-600 shrink-0" /> PARÂMETROS
              </button>

              <button
                type="button"
                onClick={() => setRightTab("arvore")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[8.5px] whitespace-nowrap",
                  rightTab === "arvore"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <GitBranch className="size-2.5 text-red-600 shrink-0" /> ÁRVORE ({featuresList.length})
              </button>

              <button
                type="button"
                onClick={() => setRightTab("inspecao")}
                className={cn(
                  "rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[8.5px] whitespace-nowrap",
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
                  "rounded-full px-2 py-0.5 font-bold uppercase transition-colors text-[8.5px] whitespace-nowrap",
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

          {/* ===================================================================== */}
          {/* ABA 1: PARÂMETROS (RECURSO ATIVO + SÓLIDO BASE + ADIÇÃO RÁPIDA)       */}
          {/* ===================================================================== */}
          {rightTab === "parametros" && (
            <div className="flex flex-col gap-2">
              {/* SELETOR RÁPIDO DE RECURSO NA ÁRVORE */}
              <div className="flex flex-col gap-1 rounded-xl bg-slate-50 p-2 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                    Recurso em Edição ({featuresList.length} na árvore)
                  </span>
                  <button
                    type="button"
                    onClick={() => setRightTab("arvore")}
                    className="text-[8px] font-bold uppercase text-red-600 hover:underline"
                  >
                    Ver Árvore →
                  </button>
                </div>
                <select
                  value={activeFeatureNode?.id || ""}
                  onChange={(e) => setSelectedFeatureId(e.target.value)}
                  className="h-[28px] w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-[9.5px] font-bold text-slate-900 outline-none focus:border-red-500"
                >
                  {featuresList.map((f, idx) => (
                    <option key={f.id} value={f.id}>
                      F{idx + 1}: {f.name} [{f.status || f.state || "VALID"}]
                    </option>
                  ))}
                </select>
              </div>

              {/* BARRA DE ADIÇÃO RÁPIDA DE RECURSOS COMBINÁVEIS (1 TOQUE) */}
              <div className="flex flex-col gap-1">
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                  + Combinar Novo Recurso na Peça
                </span>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => addCombinableFeature("extrude_sketch")}
                    className="flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[8.5px] font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    + Extrusão
                  </button>
                  <button
                    type="button"
                    onClick={() => addCombinableFeature("hole_wizard")}
                    className="flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[8.5px] font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    ⌖ Furo ISO
                  </button>
                  <button
                    type="button"
                    onClick={() => addCombinableFeature("cut_extrude")}
                    className="flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[8.5px] font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    - Corte
                  </button>
                  <button
                    type="button"
                    onClick={() => addCombinableFeature("fillet")}
                    className="flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[8.5px] font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    Filete R
                  </button>
                  <button
                    type="button"
                    onClick={() => addCombinableFeature("chamfer")}
                    className="flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[8.5px] font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    Chanfro
                  </button>
                  <button
                    type="button"
                    onClick={() => addCombinableFeature("circular_pattern")}
                    className="flex h-6 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[8.5px] font-bold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    Padrão Polar
                  </button>
                </div>
              </div>

              {/* INSPETOR DINÂMICO DO RECURSO SELECIONADO (QUANDO NÃO FOR APENAS O SÓLIDO BASE) */}
              {activeFeatureNode && featuresList.indexOf(activeFeatureNode) > 0 && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-red-200 bg-red-50/30 p-2">
                  <div className="flex items-center justify-between border-b border-red-100 pb-1">
                    <span className="font-bold text-red-700 text-[9.5px] truncate">
                      {activeFeatureNode.name}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.2 text-[8px] font-bold text-slate-600 border border-slate-200">
                      {FEATURE_TYPE_LABELS[activeFeatureNode.type] || activeFeatureNode.type}
                    </span>
                  </div>

                  {activeFeatureNode.errorMessage && (
                    <div className="rounded-lg bg-red-100 p-1.5 text-[8.5px] font-bold text-red-700">
                      ⚠ {activeFeatureNode.errorMessage}
                    </div>
                  )}

                  {/* CAMPOS ESPECÍFICOS PARA HOLE WIZARD ISO */}
                  {activeFeatureNode.type === "hole_wizard" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">TIPO DE FURO</label>
                        <select
                          value={(activeFeatureNode.parameters as any).holeType || "tapped_iso"}
                          onChange={(e) => updateActiveFeatureParam("holeType", e.target.value as HoleWizardType, true)}
                          className="h-[26px] w-32 rounded-lg border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-900"
                        >
                          <option value="tapped_iso">Roscado ISO</option>
                          <option value="counterbore">Rebaixo Allen</option>
                          <option value="countersink">Escareado Cônico</option>
                          <option value="simple">Furo Simples</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">NORMA ISO</label>
                        <select
                          value={(activeFeatureNode.parameters as any).isoSize || "M10"}
                          onChange={(e) => {
                            const iso = e.target.value as IsoThreadSize;
                            const spec = ISO_METRIC_THREADS[iso];
                            treeRef.current.updateFeature(activeFeatureNode.id, {
                              ...activeFeatureNode.parameters,
                              isoSize: iso,
                              diameter: spec ? spec.tapDrillDiameter : 8.5,
                              counterboreDiameter: spec ? spec.counterboreDiameter : 16,
                              counterboreDepth: spec ? spec.counterboreDepth : 10,
                            });
                            void rebuildFromTree(false);
                          }}
                          className="h-[26px] w-32 rounded-lg border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-900"
                        >
                          {(Object.keys(ISO_METRIC_THREADS) as IsoThreadSize[]).map((k) => (
                            <option key={k} value={k}>
                              {k} (Broca Ø{ISO_METRIC_THREADS[k].tapDrillDiameter} mm)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">POSIÇÃO X / Y</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={(activeFeatureNode.parameters as any).positions?.[0]?.x ?? 0}
                            onChange={(e) => {
                              const x = Number(e.target.value);
                              const pos = [...((activeFeatureNode.parameters as any).positions || [{ x: 0, y: 0, z: 0 }])];
                              pos[0] = { ...pos[0], x };
                              void updateActiveFeatureParam("positions", pos);
                            }}
                            className="h-[26px] w-14 rounded-lg border border-slate-200 bg-white px-1.5 text-right text-[9.5px] font-bold"
                          />
                          <input
                            type="number"
                            value={(activeFeatureNode.parameters as any).positions?.[0]?.y ?? 0}
                            onChange={(e) => {
                              const y = Number(e.target.value);
                              const pos = [...((activeFeatureNode.parameters as any).positions || [{ x: 0, y: 0, z: 0 }])];
                              pos[0] = { ...pos[0], y };
                              void updateActiveFeatureParam("positions", pos);
                            }}
                            className="h-[26px] w-14 rounded-lg border border-slate-200 bg-white px-1.5 text-right text-[9.5px] font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CAMPOS ESPECÍFICOS PARA ROSCA TÉCNICA (COSMÉTICA VS MODELADA 3D) */}
                  {activeFeatureNode.type === "thread_feature" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">MODO ROSCA</label>
                        <select
                          value={(activeFeatureNode.parameters as any).threadMode || "cosmetic_iso"}
                          onChange={(e) => updateActiveFeatureParam("threadMode", e.target.value, true)}
                          className="h-[26px] w-32 rounded-lg border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-900"
                        >
                          <option value="cosmetic_iso">Modo 1: Cosmética ISO</option>
                          <option value="modeled_3d">Modo 2: Modelada 3D</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">BITOLA ISO</label>
                        <select
                          value={(activeFeatureNode.parameters as any).isoSize || "M16"}
                          onChange={(e) => {
                            const iso = e.target.value as IsoThreadSize;
                            const spec = ISO_METRIC_THREADS[iso];
                            treeRef.current.updateFeature(activeFeatureNode.id, {
                              ...activeFeatureNode.parameters,
                              isoSize: iso,
                              nominalDiameter: spec.nominalDiameter,
                              pitch: spec.pitch,
                            });
                            void rebuildFromTree(false);
                          }}
                          className="h-[26px] w-32 rounded-lg border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-900"
                        >
                          {(Object.keys(ISO_METRIC_THREADS) as IsoThreadSize[]).map((k) => (
                            <option key={k} value={k}>
                              {k} × {ISO_METRIC_THREADS[k].pitch} mm
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">COMPRIMENTO</label>
                        <input
                          type="number"
                          value={(activeFeatureNode.parameters as any).length ?? 30}
                          onChange={(e) => updateActiveFeatureParam("length", Math.max(2, Number(e.target.value)))}
                          className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                        />
                      </div>
                    </div>
                  )}

                  {/* CAMPOS GENÉRICOS PARA EXTRUSÃO / CORTE / FILETE / CHANFRO / CASCA / PADRÕES */}
                  {"depth" in activeFeatureNode.parameters && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[8.5px] font-bold text-slate-600 uppercase">PROFUNDIDADE</label>
                      <input
                        type="number"
                        value={(activeFeatureNode.parameters as any).depth ?? 25}
                        onChange={(e) => updateActiveFeatureParam("depth", Math.max(1, Number(e.target.value)))}
                        className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                      />
                    </div>
                  )}

                  {"radius" in activeFeatureNode.parameters && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[8.5px] font-bold text-slate-600 uppercase">RAIO (R)</label>
                      <input
                        type="number"
                        step={0.5}
                        value={(activeFeatureNode.parameters as any).radius ?? 4}
                        onChange={(e) => updateActiveFeatureParam("radius", Math.max(0.5, Number(e.target.value)))}
                        className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                      />
                    </div>
                  )}

                  {"distance" in activeFeatureNode.parameters && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[8.5px] font-bold text-slate-600 uppercase">DISTÂNCIA (D)</label>
                      <input
                        type="number"
                        step={0.5}
                        value={(activeFeatureNode.parameters as any).distance ?? 3}
                        onChange={(e) => updateActiveFeatureParam("distance", Math.max(0.5, Number(e.target.value)))}
                        className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                      />
                    </div>
                  )}

                  {"wallThickness" in activeFeatureNode.parameters && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[8.5px] font-bold text-slate-600 uppercase">PAREDE CASCA</label>
                      <input
                        type="number"
                        step={0.5}
                        value={(activeFeatureNode.parameters as any).wallThickness ?? 3}
                        onChange={(e) => updateActiveFeatureParam("wallThickness", Math.max(0.5, Number(e.target.value)))}
                        className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                      />
                    </div>
                  )}

                  {"count" in activeFeatureNode.parameters && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[8.5px] font-bold text-slate-600 uppercase">INSTÂNCIAS (N)</label>
                      <input
                        type="number"
                        min={2}
                        max={36}
                        value={(activeFeatureNode.parameters as any).count ?? 6}
                        onChange={(e) => updateActiveFeatureParam("count", Math.max(2, Number(e.target.value)))}
                        className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                      />
                    </div>
                  )}

                  {"count1" in activeFeatureNode.parameters && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">REPETIÇÕES X</label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={(activeFeatureNode.parameters as any).count1 ?? 3}
                          onChange={(e) => updateActiveFeatureParam("count1", Math.max(1, Number(e.target.value)))}
                          className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[8.5px] font-bold text-slate-600 uppercase">PASSO X (mm)</label>
                        <input
                          type="number"
                          value={(activeFeatureNode.parameters as any).spacing1 ?? 45}
                          onChange={(e) => updateActiveFeatureParam("spacing1", Number(e.target.value))}
                          className="h-[26px] w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-[9.5px] font-bold"
                        />
                      </div>
                    </>
                  )}

                  {"booleanMode" in activeFeatureNode.parameters && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[8.5px] font-bold text-slate-600 uppercase">OP. BOOLEANA</label>
                      <select
                        value={(activeFeatureNode.parameters as any).booleanMode || "union"}
                        onChange={(e) =>
                          updateActiveFeatureParam("booleanMode", e.target.value as CadBooleanMode, true)
                        }
                        className="h-[26px] w-28 rounded-lg border border-slate-200 bg-white px-1.5 text-[8.5px] font-bold text-slate-900"
                      >
                        <option value="union">União (Add)</option>
                        <option value="cut">Subtração (Cut)</option>
                        <option value="intersect">Interseção</option>
                        <option value="new_body">Novo Corpo</option>
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void rebuildFromTree(false)}
                    className="mt-1 flex h-[28px] w-full items-center justify-center gap-1 rounded-lg bg-red-600 text-[9px] font-bold text-white uppercase hover:bg-red-700 transition-colors"
                  >
                    <CheckCircle2 className="size-3" /> Atualizar Recurso ({Number(lastRebuildMs || 0).toFixed(0)} ms)
                  </button>
                </div>
              )}

              {/* DIMENSÕES DO SÓLIDO BASE */}
              <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 border border-slate-100">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Box className="size-3.5 text-red-600 shrink-0" />
                  <span className="font-bold text-slate-900 uppercase text-[10.5px] truncate">
                    BASE: {modelTitle.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {modelType === "boilermaking_transition" ||
                modelType === "base_box" ||
                modelType === "extrude_sketch" ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        LARGURA (X)
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={paramA}
                          readOnly={modelType === "extrude_sketch" && Boolean(entities2D?.length)}
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
                        {modelType === "boilermaking_transition" ? "DIÂMETRO (Ø)" : "COMPRIMENTO (Y)"}
                      </label>
                      <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                        <input
                          type="number"
                          value={modelType === "boilermaking_transition" ? paramD : paramB}
                          readOnly={modelType === "extrude_sketch" && Boolean(entities2D?.length)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (modelType === "boilermaking_transition") {
                              setParamD(v);
                              onUpdate3DParam?.("diameter", v);
                            } else {
                              setParamB(v);
                              onUpdate3DParam?.("length", v);
                            }
                          }}
                          className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                        />
                        <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                      </div>
                    </div>
                    {modelType !== "extrude_sketch" && (
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
                    )}
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
                    ESPESSURA (Z)
                  </label>
                  <div className="flex h-[28px] w-28 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 focus-within:border-red-500">
                    <input
                      type="number"
                      step={0.1}
                      value={thickness}
                      onChange={(e) => {
                        const v = Math.max(0.2, Number(e.target.value) || 0.2);
                        setThickness(v);
                        setParamC(v);
                        onThicknessChange?.(v);
                        onUpdate3DParam?.("thickness", v);
                      }}
                      className="w-full bg-transparent font-mono font-bold text-slate-900 outline-none text-[11px] text-right pr-1"
                    />
                    <span className="text-[8.5px] text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
              </div>

              {/* ESQUEMA DIMENSIONAL RECOLHÍVEL */}
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
                    <svg viewBox="0 0 120 64" className="w-full h-14">
                      <line x1="16" y1="8" x2="16" y2="48" stroke="#94a3b8" strokeWidth="0.75" />
                      <text x="10" y="30" fontSize="6" fill="#475569" fontWeight="bold" textAnchor="end">Z</text>
                      <polygon points="62,8 30,48 94,48" fill="#fee2e2" stroke="#dc2626" strokeWidth="0.8" />
                      <ellipse cx="62" cy="48" rx="32" ry="5" fill="#fecaca" stroke="#dc2626" strokeWidth="0.8" />
                      <line x1="30" y1="56" x2="94" y2="56" stroke="#94a3b8" strokeWidth="0.75" />
                      <text x="62" y="62" fontSize="6" fill="#475569" fontWeight="bold" textAnchor="middle">X</text>
                    </svg>
                  </div>
                )}
              </div>

              {/* OPÇÕES E MATERIAL */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    OPÇÕES BASE
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
                <Settings className="size-3.5 shrink-0" /> APLICAR BASE
              </button>
            </div>
          )}

          {/* ===================================================================== */}
          {/* ABA 2: ÁRVORE DE RECURSOS PARAMÉTRICA (FEATUREMANAGER + SEQUÊNCIAS)   */}
          {/* ===================================================================== */}
          {rightTab === "arvore" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="font-bold text-slate-900 text-[10px] uppercase">
                  Árvore Paramétrica (DAG)
                </span>
                <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {Number(lastRebuildMs || 0).toFixed(0)} ms · {recomputedCount ?? 0} rec.
                </span>
              </div>

              {/* SEQUÊNCIAS COMBINÁVEIS DE ENGENHARIA (TESTE DE COMBINABILIDADE REAL) */}
              <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                  <Sparkles className="size-2.5 text-red-600" /> Sequências Combináveis (SOLIDWORKS)
                </span>
                <div className="grid grid-cols-1 gap-1">
                  <button
                    type="button"
                    onClick={() => void loadCombinableSequence("flange_mecanico")}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-[8.5px] font-bold text-slate-800 hover:border-red-300 hover:bg-red-50 transition-colors"
                  >
                    <span>1. Flange ISO (5 Recursos + Padrão 6×)</span>
                    <ChevronRight className="size-3 text-red-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadCombinableSequence("suporte_nervura")}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-[8.5px] font-bold text-slate-800 hover:border-red-300 hover:bg-red-50 transition-colors"
                  >
                    <span>2. Suporte L + Nervura + Rasgo Oblongo</span>
                    <ChevronRight className="size-3 text-red-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadCombinableSequence("eixo_chaveta")}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-[8.5px] font-bold text-slate-800 hover:border-red-300 hover:bg-red-50 transition-colors"
                  >
                    <span>3. Eixo Revolucionado + Chaveta + Rosca</span>
                    <ChevronRight className="size-3 text-red-600" />
                  </button>
                </div>
              </div>

              {/* LISTA ORDENADA DE RECURSOS NA ÁRVORE */}
              <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto pr-0.5">
                {featuresList.map((feat, idx) => {
                  const isSelected = activeFeatureNode?.id === feat.id;
                  const rollbackIdx = treeRef.current.getRollbackIndex();
                  const isRolledBack = rollbackIdx !== -1 && idx > rollbackIdx;

                  return (
                    <div
                      key={feat.id}
                      onClick={() => {
                        setSelectedFeatureId(feat.id);
                      }}
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border p-1.5 transition-all cursor-pointer",
                        isSelected
                          ? "border-red-400 bg-red-50/60 shadow-2xs"
                          : "border-slate-200 bg-white hover:border-slate-300",
                        (feat.isSuppressed || isRolledBack) && "opacity-55",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              (feat.status || feat.state) === "VALID" && "bg-emerald-500",
                              (feat.status || feat.state) === "DIRTY" && "bg-amber-500",
                              (feat.status || feat.state) === "STALE" && "bg-amber-400",
                              (feat.status || feat.state) === "ERROR" && "bg-red-600",
                              (feat.status || feat.state) === "SUPPRESSED" && "bg-slate-400",
                            )}
                            title={`Status: ${feat.status || feat.state || "VALID"}`}
                          />
                          <span className="font-bold text-[9px] text-slate-900 truncate">
                            {idx + 1}. {feat.name}
                          </span>
                        </div>

                        {/* Ações Rápidas por Recurso */}
                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFeatureId(feat.id);
                              setRightTab("parametros");
                            }}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                            title="Editar parâmetros deste recurso"
                          >
                            <Sliders className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              editorRef.current.pushUndo();
                              treeRef.current.setSuppressed(feat.id, !feat.isSuppressed);
                              await rebuildFromTree(false);
                            }}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title={feat.isSuppressed ? "Reativar recurso (Unsuppress)" : "Suprimir recurso (Suppress)"}
                          >
                            {feat.isSuppressed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={async () => {
                              editorRef.current.pushUndo();
                              treeRef.current.moveFeature(feat.id, "up");
                              await rebuildFromTree(false);
                            }}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            title="Mover recurso para cima"
                          >
                            <ChevronUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === featuresList.length - 1}
                            onClick={async () => {
                              editorRef.current.pushUndo();
                              treeRef.current.moveFeature(feat.id, "down");
                              await rebuildFromTree(false);
                            }}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            title="Mover recurso para baixo"
                          >
                            <ChevronDown className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              editorRef.current.pushUndo();
                              treeRef.current.duplicateFeature(feat.id);
                              await rebuildFromTree(false);
                              toast.info(`Recurso "${feat.name}" duplicado.`);
                            }}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Duplicar recurso"
                          >
                            <Copy className="size-3" />
                          </button>
                          {featuresList.length > 1 && (
                            <button
                              type="button"
                              onClick={async () => {
                                const deps = treeRef.current.getDownstreamDependents(feat.id);
                                editorRef.current.pushUndo();
                                treeRef.current.removeFeature(feat.id);
                                await rebuildFromTree(false);
                                if (deps.length > 0) {
                                  toast.warning(
                                    `Recurso excluído (${deps.length} dependente(s) reavaliado(s)).`,
                                  );
                                } else {
                                  toast.info(`Recurso "${feat.name}" removido.`);
                                }
                              }}
                              className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Excluir recurso"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {feat.errorMessage && (
                        <div className="text-[8px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          ⚠ {feat.errorMessage}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* BARRA DE ROLLBACK TEMPORAL E INTEROPERABILIDADE */}
              <div className="flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    const currentRb = treeRef.current.getRollbackIndex();
                    const nextRb =
                      currentRb === -1 && featuresList.length > 1 ? featuresList.length - 2 : -1;
                    treeRef.current.setRollbackIndex(nextRb);
                    await rebuildFromTree(false);
                    toast.info(
                      nextRb === -1
                        ? "Barra de Rollback no final da Árvore."
                        : `Rollback temporal aplicado até F${nextRb + 1}.`,
                    );
                  }}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-[8.5px] font-bold text-slate-700 hover:bg-slate-100"
                >
                  <RotateCcw className="size-3 text-red-600" />
                  {treeRef.current.getRollbackIndex() === -1 ? "Rollback Anterior" : "Restaurar Final"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportFormat("step")}
                  className="flex h-7 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[8.5px] font-bold text-white hover:bg-slate-800"
                >
                  <Download className="size-3" /> STEP
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* ABA 3: INSPEÇÃO B-REP                                                 */}
          {/* ===================================================================== */}
          {rightTab === "inspecao" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="font-bold text-slate-900 text-[10.5px]">INSPEÇÃO B-REP</span>
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">
                  <span className="size-1 rounded-full bg-emerald-500" /> OCCT VALID
                </span>
              </div>

              <div className="flex flex-col gap-1 text-[9.5px] text-slate-600">
                <div>
                  Dimensões:{" "}
                  <strong className="text-slate-900">
                    {Number(paramA || 0).toFixed(0)} × {Number(paramB || 0).toFixed(0)} × {Number(paramC || 0).toFixed(0)} mm
                  </strong>
                </div>
                <div>
                  Volume:{" "}
                  <strong className="text-slate-900">
                    {massProps && typeof massProps.volume === "number"
                      ? massProps.volume.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                      : "30.000"}{" "}
                    mm³
                  </strong>
                </div>
                <div>
                  Massa Est.:{" "}
                  <strong className="text-red-600">
                    {massProps && typeof massProps.mass === "number" ? massProps.mass.toFixed(3) : "9.030"} kg
                  </strong>
                </div>
                <div>
                  Área Total:{" "}
                  <strong className="text-slate-900">
                    {massProps && typeof massProps.surfaceArea === "number"
                      ? massProps.surfaceArea.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                      : "21.200"}{" "}
                    mm²
                  </strong>
                </div>
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
                <div>
                  Corpos Sólidos:{" "}
                  <strong className="text-slate-900">
                    {treeRef.current.getBodies().length} corpo(s) · {treeRef.current.getMates().length} mate(s)
                  </strong>
                </div>
                {measurement && (
                  <div className="mt-1 rounded-lg border border-red-200 bg-red-50/70 p-1.5 text-[9px] text-slate-800">
                    <div className="font-bold text-red-600">
                      Distância: {Number(measurement.distance || 0).toFixed(2)} mm
                    </div>
                    <div className="text-[8.5px] text-slate-600">
                      ΔX {Number(measurement.deltaX || 0).toFixed(1)} · ΔY {Number(measurement.deltaY || 0).toFixed(1)} · ΔZ{" "}
                      {Number(measurement.deltaZ || 0).toFixed(1)} mm
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* ABA 4: FILTRO DE SELEÇÃO TOPOLÓGICA                                   */}
          {/* ===================================================================== */}
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
                    Posição: ({selectedEntity.point?.x?.toFixed(1) ?? "0.0"},{" "}
                    {selectedEntity.point?.y?.toFixed(1) ?? "0.0"},{" "}
                    {selectedEntity.point?.z?.toFixed(1) ?? "0.0"})
                  </div>
                </div>
              ) : (
                <div className="mt-0.5 rounded-lg border border-dashed border-slate-200 p-1.5 text-center text-[9px] text-slate-400">
                  Toque na peça para selecionar uma {selectionType} e abrir ações contextuais
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
        {/* PLANIFICAR */}
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
