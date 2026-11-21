/**
 * CALDRA — CHAMFER CAD PORTRAIT UI (INSPIRAÇÃO ADOBE LIGHTROOM MOBILE)
 *
 * Arquitetura exclusiva para Tela Vertical (Modo Retrato / Portrait):
 * - Zero Barras Laterais (Canvas 100% de ponta a ponta — 100vw)
 * - 1 Barra Superior Única Compacta (height: 48px, zero corte lateral, menus em React Portal z-[60])
 * - Micro-Pílula Translúcida Flutuante no Canvas (height: 24px: P01 • X/Y • Z/G • SNAP: ON)
 * - Estritamente no máximo 2 Barras Inferiores Empilhadas:
 *   • Nível 1 (Acima do Dock — height: 60px): Carrossel Contextual Horizontal com
 *     Substituição Contextual Inline ([ ← Voltar ] + pílulas editáveis + [ ✓ Confirmar ])
 *   • Nível 2 (Base da Tela — height: 54px): Seletor de 5 Modos Estilo Lightroom Mobile
 * - Bottom Sheet Compacto sob demanda para painéis longos (Propriedades, Camadas,
 *   Corte CNC, Cotas, Engenharia Reversa 1:1) com auto-enquadramento da peça.
 */

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Undo2,
  Redo2,
  MoreVertical,
  MousePointer2,
  Hand,
  Minus,
  PenLine,
  Circle as CircleIcon,
  Compass,
  Square,
  Hexagon,
  Egg,
  Dot,
  Type,
  Box,
  Boxes,
  RotateCw,
  Move,
  Copy,
  ClipboardList,
  FlipHorizontal,
  Maximize2,
  CornerDownRight,
  Maximize,
  Sparkles,
  Split,
  Combine,
  Divide,
  Grid,
  Magnet,
  Check,
  Layers,
  FoldHorizontal,
  ArrowRightLeft,
  X,
  Sliders,
  Disc,
  Flame,
  AlignCenter,
  FileText,
  Activity,
  Eye,
  Scissors,
  Crosshair,
  Ruler,
  CircleDot,
  ScanEye,
  Download,
  Sun,
  Moon,
  Minimize,
  FolderPlus,
  Plus,
  ChevronDown,
  Lock,
  Unlock,
  Loader2,
  Delete,
  Palette,
  Trash2,
  Bug,
  CopyCheck,
  Calculator,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import {
  applyNumericKeypadKey,
  createNumericKeypadBuffer,
  parseNumericKeypadValue,
  resolvePortraitDrawerDragGesture,
  resolvePortraitDrawerDvh,
  resolveSingleSlotKind,
  type NumericKeypadBufferState,
  type PortraitDrawerHeightMode,
} from "@/lib/lab2d/useVerticalLayout";
import {
  CHAMFER_TECHNICAL_PALETTE,
  runVerticalParityMatrixAudit,
  type ChamferTechnicalColorOption,
  type VerticalParityDiagnosticReport,
} from "@/lib/lab2d/chamferCommandRegistry";
import { getWireframe3DCacheStats } from "@/lib/lab2d/chamferWireframe3D";
import { getSilkBackgroundCacheStats } from "@/lib/lab2d/canvasScene";
import { getAuroraEngineTelemetry } from "@/components/chameleon/Aurora";
import type { Tool } from "./Lab2DEditor";
import type { DimKind } from "@/lib/lab2d/dimensions";
import type { CursorOffsetMode, LoupeHudMode } from "@/lib/lab2d/cadInteractionHub";
import type { RevEngCategoryId, RevEngWizardStep } from "@/lib/lab2d/revEngTypes";
import type { WorkspaceFrame } from "@/lib/lab2d/workspace";
import { WORKSPACE_INDUSTRIAL_PRESETS } from "@/lib/lab2d/workspace";
import type { ArrayType, PolarArrayParams, LinearArrayParams } from "@/lib/lab2d/cadArrayEngine";
import type { EdgeMode } from "@/lib/viz3d/cameraPresets";
import type { ChamferSidebarTab } from "./sidebar";
import type { Vec2 } from "@/lib/geometry/types";
import {
  dispatchChamferParametricPanel,
  useChamferParametricStatus,
} from "./chamferParametricEvents";

export type PortraitDockMode =
  | "desenho"
  | "modificar"
  | "precisao"
  | "chapa_vision"
  | "inspetor";

type InlineSubPanelId =
  | "none"
  | "workspace"
  | "snap_div"
  | "grid"
  | "thickness"
  | "boolean"
  | "layer"
  | "cotar"
  | "hole"
  | "thread"
  | "eyelet"
  | "teeth"
  | "pocket";

interface InlineNumericKeypadSession {
  label: string;
  unit: string;
  bufferState: NumericKeypadBufferState;
  onCommit: (val: number) => void;
}

/** Ícone vetorial de Nós / Vértices para o carrossel */
function ControlNodesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 18L18 6" />
      <path d="M6 6h12" />
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Renderiza elemento em Portal no document.body para evitar qualquer corte por overflow/contain */
function renderInBodyPortal(node: React.ReactNode): React.ReactNode {
  if (typeof document === "undefined" || !document.body) {
    return node;
  }
  return createPortal(node, document.body);
}

export interface ChamferPortraitTopBarProps {
  isDark: boolean;
  topBarHeightPx?: number;
  viewportWidth?: number;
  projectName: string;
  thickness: number;
  onThicknessChange: (v: number) => void;
  onOpenCustomThicknessKeypad?: (screenPos: { x: number; y: number }) => void;
  plans: { id: string; name: string }[];
  activePlanId: string;
  onSelectPlan: (id: string) => void;
  onCreatePlan: () => void;
  onOpenNewProjectDialog: () => void;
  saveStatus: "salvo" | "salvando" | "pendente" | "erro";
  onManualSave: () => void;
  onLeaveEditor: () => void;

  // Cor / Camada ativa (para bolinha viva no chip • 3,0mm ▾ e seletor COR)
  activeLayer?: string;
  activeStrokeColor?: string | null;
  onSelectColorAndLayer?: (option: ChamferTechnicalColorOption) => void;

  // Modos 2D / 3D / Projeção / Órbita / Plano ISO F5
  activeMode: "2d" | "3d" | "flanges";
  onSelect2D: () => void;
  onSelect3D: () => void;
  drawingProjection: "orthographic" | "isometric";
  onSetDrawingProjection: (mode: "orthographic" | "isometric") => void;
  isoPlane?: "top" | "left" | "right";
  onSelectIsoPlane?: (plane: "top" | "left" | "right") => void;
  isOrbitToolActive: boolean;
  isOrbitTilted: boolean;
  onToggleOrbitTool: (next?: boolean) => void;
  renderStyle3D: EdgeMode;
  onChangeRenderStyle3D: (style: EdgeMode) => void;

  // Histórico
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  // Preferência de Interface (Compacta | PRUMO)
  layoutPreference?: "compact" | "prumo";
  onChangeLayoutPreference?: (pref: "compact" | "prumo") => void;

  // Ações Globais no Menu ⋮
  onOpenVision: () => void;
  onOpenIntent: () => void;
  onOpenWorkshop: () => void;
  onOpenExport: () => void;
  onOpenCnc: () => void;
  onCenterPiece: (moveGeometry: boolean) => void;
  onFitWorkspace: () => void;
  onOpenPresets: () => void;
  onOpenTechnicalSheet: () => void;
  onOpenTopologyHealth: () => void;
  onOpenVariables: () => void;
  onVerifyGeometry?: () => void;
  onOptimizeGeometry?: () => void;
  showDims: boolean;
  onToggleShowDims: () => void;
  onToggleTheme: () => void;
  focus: boolean;
  onToggleFullscreen: () => void;
  onOpenProjectSettings?: () => void;
  onToggleBenchCalc?: () => void;
  isBenchCalcOpen?: boolean;
  isBenchCalcFloating?: boolean;
}

export function ChamferPortraitTopBar({
  isDark,
  topBarHeightPx = 48,
  viewportWidth = 390,
  projectName,
  thickness,
  onThicknessChange,
  onOpenCustomThicknessKeypad,
  plans,
  activePlanId,
  onSelectPlan,
  onCreatePlan,
  onOpenNewProjectDialog,
  saveStatus,
  onManualSave,
  onLeaveEditor,
  activeLayer = "corte",
  activeStrokeColor = null,
  onSelectColorAndLayer,
  activeMode,
  onSelect2D,
  onSelect3D,
  drawingProjection,
  onSetDrawingProjection,
  isoPlane = "top",
  onSelectIsoPlane,
  isOrbitToolActive,
  isOrbitTilted,
  onToggleOrbitTool,
  renderStyle3D,
  onChangeRenderStyle3D,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  layoutPreference = "compact",
  onChangeLayoutPreference,
  onOpenVision,
  onOpenIntent,
  onOpenWorkshop,
  onOpenExport,
  onOpenCnc,
  onCenterPiece,
  onFitWorkspace,
  onOpenPresets,
  onOpenTechnicalSheet,
  onOpenTopologyHealth,
  onOpenVariables,
  onVerifyGeometry,
  onOptimizeGeometry,
  showDims,
  onToggleShowDims,
  onToggleTheme,
  focus,
  onToggleFullscreen,
  onOpenProjectSettings,
  onToggleBenchCalc,
  isBenchCalcOpen = false,
  isBenchCalcFloating = false,
}: ChamferPortraitTopBarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Refs e coordenadas calculadas via getBoundingClientRect() para os Portals (z-index: 9999)
  const portraitTopBarRef = useRef<HTMLElement | null>(null);
  const portraitTopBarSwipeRef = useRef<{
    isDragging: boolean;
    hasMoved: boolean;
    pointerId: number | null;
    startX: number;
    scrollLeft: number;
  }>({
    isDragging: false,
    hasMoved: false,
    pointerId: null,
    startX: 0,
    scrollLeft: 0,
  });

  const handlePortraitTopBarPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!portraitTopBarRef.current) return;
    portraitTopBarSwipeRef.current = {
      isDragging: true,
      hasMoved: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      scrollLeft: portraitTopBarRef.current.scrollLeft,
    };
  };

  const handlePortraitTopBarPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!portraitTopBarSwipeRef.current.isDragging || !portraitTopBarRef.current) return;
    const dx = e.clientX - portraitTopBarSwipeRef.current.startX;
    if (Math.abs(dx) > 4) {
      if (!portraitTopBarSwipeRef.current.hasMoved) {
        portraitTopBarSwipeRef.current.hasMoved = true;
        try {
          if (
            portraitTopBarSwipeRef.current.pointerId !== null &&
            !portraitTopBarRef.current.hasPointerCapture(portraitTopBarSwipeRef.current.pointerId)
          ) {
            portraitTopBarRef.current.setPointerCapture(portraitTopBarSwipeRef.current.pointerId);
          }
        } catch {
          // Ignora se o navegador não suportar pointer capture no alvo
        }
      }
      portraitTopBarRef.current.scrollLeft = portraitTopBarSwipeRef.current.scrollLeft - dx;
    }
  };

  const handlePortraitTopBarPointerUp = () => {
    if (portraitTopBarRef.current && portraitTopBarSwipeRef.current.pointerId !== null) {
      try {
        if (portraitTopBarRef.current.hasPointerCapture(portraitTopBarSwipeRef.current.pointerId)) {
          portraitTopBarRef.current.releasePointerCapture(portraitTopBarSwipeRef.current.pointerId);
        }
      } catch {
        // Ignora erro de releasePointerCapture
      }
    }
    portraitTopBarSwipeRef.current.isDragging = false;
    portraitTopBarSwipeRef.current.pointerId = null;
  };

  const handlePortraitTopBarTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch || !portraitTopBarRef.current) return;
    portraitTopBarSwipeRef.current = {
      isDragging: true,
      hasMoved: false,
      pointerId: null,
      startX: touch.clientX,
      scrollLeft: portraitTopBarRef.current.scrollLeft,
    };
  };

  const handlePortraitTopBarTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch || !portraitTopBarSwipeRef.current.isDragging || !portraitTopBarRef.current) return;
    const dx = touch.clientX - portraitTopBarSwipeRef.current.startX;
    if (Math.abs(dx) > 4) {
      portraitTopBarSwipeRef.current.hasMoved = true;
      portraitTopBarRef.current.scrollLeft = portraitTopBarSwipeRef.current.scrollLeft - dx;
    }
  };

  const handlePortraitTopBarClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    if (portraitTopBarSwipeRef.current.hasMoved) {
      e.stopPropagation();
      e.preventDefault();
      portraitTopBarSwipeRef.current.hasMoved = false;
    }
  };

  const handlePortraitTopBarWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (!portraitTopBarRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      portraitTopBarRef.current.scrollLeft += e.deltaY;
    }
  };

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const viewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  const [moreMenuCoords, setMoreMenuCoords] = useState<{ top: number; right: number }>({
    top: 52,
    right: 8,
  });
  const [projectMenuCoords, setProjectMenuCoords] = useState<{ top: number; left: number }>({
    top: 52,
    left: 8,
  });
  const [viewMenuCoords, setViewMenuCoords] = useState<{ top: number; left: number }>({
    top: 52,
    left: 120,
  });

  const updateMoreMenuPosition = () => {
    if (typeof window === "undefined" || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMoreMenuCoords({
      top: Math.max(48, Math.round(rect.bottom + 6)),
      right: Math.max(8, Math.round(window.innerWidth - rect.right)),
    });
  };

  const updateProjectMenuPosition = () => {
    if (typeof window === "undefined" || !projectTriggerRef.current) return;
    const rect = projectTriggerRef.current.getBoundingClientRect();
    setProjectMenuCoords({
      top: Math.max(48, Math.round(rect.bottom + 6)),
      left: Math.max(8, Math.round(rect.left)),
    });
  };

  const updateViewMenuPosition = () => {
    if (typeof window === "undefined" || !viewTriggerRef.current) return;
    const rect = viewTriggerRef.current.getBoundingClientRect();
    setViewMenuCoords({
      top: Math.max(48, Math.round(rect.bottom + 6)),
      left: Math.max(8, Math.min(window.innerWidth - 280, Math.round(rect.left))),
    });
  };

  // Prevenção de fechamento acidental ao clicar fora (onClickOutside com guarda explícita no triggerRef)
  useEffect(() => {
    if (!moreMenuOpen && !projectMenuOpen && !viewMenuOpen) return;

    const handleOutsidePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (moreMenuOpen) {
        if (triggerRef.current && triggerRef.current.contains(target)) {
          return; // Não executa o fechar se o clique foi no próprio botão disparador
        }
        if (moreMenuRef.current && moreMenuRef.current.contains(target)) {
          return;
        }
        setMoreMenuOpen(false);
      }

      if (projectMenuOpen) {
        if (projectTriggerRef.current && projectTriggerRef.current.contains(target)) {
          return;
        }
        if (projectMenuRef.current && projectMenuRef.current.contains(target)) {
          return;
        }
        setProjectMenuOpen(false);
      }

      if (viewMenuOpen) {
        if (viewTriggerRef.current && viewTriggerRef.current.contains(target)) {
          return;
        }
        if (viewMenuRef.current && viewMenuRef.current.contains(target)) {
          return;
        }
        setViewMenuOpen(false);
      }
    };

    const handleResizeOrScroll = () => {
      if (moreMenuOpen) updateMoreMenuPosition();
      if (projectMenuOpen) updateProjectMenuPosition();
      if (viewMenuOpen) updateViewMenuPosition();
    };

    const headerEl = portraitTopBarRef.current;
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    window.addEventListener("resize", handleResizeOrScroll);
    headerEl?.addEventListener("scroll", handleResizeOrScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      window.removeEventListener("resize", handleResizeOrScroll);
      headerEl?.removeEventListener("scroll", handleResizeOrScroll);
    };
  }, [moreMenuOpen, projectMenuOpen, viewMenuOpen]);

  // Diagnóstico de Paridade & Desempenho (DIAG_ENABLED — acionado por long-press no chip • 3,0mm ▾ ou pelo menu)
  const [diagModalOpen, setDiagModalOpen] = useState(false);
  const [diagTab, setDiagTab] = useState<"paridade" | "desempenho">("paridade");
  const [diagReport, setDiagReport] = useState<VerticalParityDiagnosticReport | null>(null);
  const [touchDebuggerOn, setTouchDebuggerOn] = useState(false);
  const [lastTouchDebugInfo, setLastTouchDebugInfo] = useState<string>("Aguardando toque...");
  const [copiedReport, setCopiedReport] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);

  const [perfTelemetry, setPerfTelemetry] = useState<{
    fps: number;
    frameP50Ms: number;
    frameP95Ms: number;
    frameMaxMs: number;
    dpr: number;
    canvasVramMb: number;
    jsHeapUsedMb: number | null;
    jsHeapTotalMb: number | null;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    silkHits: number;
    silkMisses: number;
    silkHitRate: number;
    auroraSprites: number;
  }>({
    fps: 60,
    frameP50Ms: 16.6,
    frameP95Ms: 16.7,
    frameMaxMs: 16.7,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    canvasVramMb: 0,
    jsHeapUsedMb: null,
    jsHeapTotalMb: null,
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 100,
    silkHits: 0,
    silkMisses: 0,
    silkHitRate: 100,
    auroraSprites: 0,
  });

  useEffect(() => {
    if (!diagModalOpen || diagTab !== "desempenho" || typeof window === "undefined") return;
    let rafId = 0;
    let lastTime = performance.now();
    const deltas: number[] = [];

    const sampleFrame = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      if (dt > 0 && dt < 500) {
        deltas.push(dt);
        if (deltas.length > 60) deltas.shift();
      }
      if (deltas.length % 12 === 0 && deltas.length > 0) {
        const sorted = [...deltas].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 16.6;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? p50;
        const maxDt = sorted[sorted.length - 1] ?? p95;
        const avgDt = deltas.reduce((s, x) => s + x, 0) / deltas.length;
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth || 390;
        const h = window.innerHeight || 844;
        // 3 camadas de Canvas High-DPI (Principal + Flow + 3D WebGL) em RGBA8 (4 bytes/pixel)
        const vramMb = (w * dpr * (h * dpr) * 4 * 3) / (1024 * 1024);
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
        const cStats = getWireframe3DCacheStats();
        const silkStats = getSilkBackgroundCacheStats();
        const auroraStats = getAuroraEngineTelemetry();
        setPerfTelemetry({
          fps: Math.min(120, Math.round(1000 / Math.max(1, avgDt))),
          frameP50Ms: Number(p50.toFixed(1)),
          frameP95Ms: Number(p95.toFixed(1)),
          frameMaxMs: Number(maxDt.toFixed(1)),
          dpr: Number(dpr.toFixed(2)),
          canvasVramMb: Number(vramMb.toFixed(2)),
          jsHeapUsedMb: mem ? Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(1)) : null,
          jsHeapTotalMb: mem ? Number((mem.totalJSHeapSize / (1024 * 1024)).toFixed(1)) : null,
          cacheHits: cStats.hits,
          cacheMisses: cStats.misses,
          cacheHitRate: cStats.hitRatePercent,
          silkHits: silkStats.hits,
          silkMisses: silkStats.misses,
          silkHitRate: silkStats.hitRatePercent,
          auroraSprites: auroraStats.spriteCacheSize,
        });
      }
      rafId = window.requestAnimationFrame(sampleFrame);
    };

    rafId = window.requestAnimationFrame(sampleFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [diagModalOpen, diagTab]);

  useEffect(() => {
    if (!touchDebuggerOn) return;
    const handleGlobalTouchDebug = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      const cmdBtn = target?.closest?.("[data-cmd-id]") as HTMLElement | null;
      const cmdId = cmdBtn?.getAttribute("data-cmd-id") || target?.tagName?.toLowerCase() || "desconhecido";
      setLastTouchDebugInfo(
        `cmdId: ${cmdId} | (${Math.round(ev.clientX)}, ${Math.round(ev.clientY)})`,
      );
    };
    window.addEventListener("pointerdown", handleGlobalTouchDebug, true);
    return () => window.removeEventListener("pointerdown", handleGlobalTouchDebug, true);
  }, [touchDebuggerOn]);

  const handleRunParityAudit = () => {
    const rep = runVerticalParityMatrixAudit(typeof document !== "undefined" ? document : null);
    setDiagReport(rep);
    setDiagModalOpen(true);
    setProjectMenuOpen(false);
    setViewMenuOpen(false);
    setMoreMenuOpen(false);
  };

  // Colapso determinístico por prioridade (P1 > P2 > P3 > P4) para 320..430 px (zero sobreposição!)
  const safeW = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 390;
  const mergeViewIntoModeSelector = safeW < 340;
  // Em celulares retrato (< 450px), exibe o chip compacto "● 3,0mm ▾" para nunca colidir com [2D|3D]
  const showProjectNameInChip = safeW >= 450;
  const shortViewLabel = safeW < 415;

  const fullViewLabel =
    activeMode === "3d"
      ? renderStyle3D === "shaded"
        ? "SOMB"
        : renderStyle3D === "shaded-edges"
          ? "SOMB+AR"
          : "ARAME"
      : isOrbitToolActive || isOrbitTilted
        ? "ÓRBITA 3D"
        : "ORTO 2D";

  const compactViewLabel =
    activeMode === "3d"
      ? renderStyle3D === "shaded"
        ? "SOMB"
        : renderStyle3D === "shaded-edges"
          ? "S+AR"
          : "ARAME"
      : isOrbitToolActive || isOrbitTilted
        ? "ÓRB"
        : "ORTO";

  const displayedViewLabel = shortViewLabel ? compactViewLabel : fullViewLabel;

  const formattedThickness = `${thickness.toFixed(1).replace(".", ",")} mm`;
  const compactThickness = `${thickness.toFixed(1).replace(".", ",")}mm`;

  // Cor viva exibida na bolinha do chip "• 3,0mm ▾" (dado CAD semântico legítimo)
  const activeColorHex =
    activeStrokeColor ||
    (activeLayer === "dobra"
      ? "#EC4899"
      : activeLayer === "recorte"
        ? "#F59E0B"
        : activeLayer === "marcacao"
          ? "#3B82F6"
          : isDark
            ? "#F8FAFC"
            : "#0F172A");

  const saveDotClass =
    saveStatus === "erro"
      ? "bg-[#EF4444]"
      : saveStatus === "pendente" || saveStatus === "salvando"
        ? "bg-[#F59E0B] animate-pulse"
        : "bg-[#10B981]";

  const saveStatusText =
    saveStatus === "erro"
      ? "Erro ao salvar"
      : saveStatus === "salvando"
        ? "Salvando..."
        : saveStatus === "pendente"
          ? "Alterações pendentes"
          : "Salvo";

  return (
    <>
      <header
        ref={portraitTopBarRef}
        aria-label="Barra superior CHAMFER CAD Retrato"
        data-testid="chamfer-portrait-topbar"
        onPointerDown={handlePortraitTopBarPointerDown}
        onPointerMove={handlePortraitTopBarPointerMove}
        onPointerUp={handlePortraitTopBarPointerUp}
        onPointerCancel={handlePortraitTopBarPointerUp}
        onPointerLeave={handlePortraitTopBarPointerUp}
        onTouchStart={handlePortraitTopBarTouchStart}
        onTouchMove={handlePortraitTopBarTouchMove}
        onTouchEnd={handlePortraitTopBarPointerUp}
        onClickCapture={handlePortraitTopBarClickCapture}
        onWheel={handlePortraitTopBarWheel}
        style={{
          height: topBarHeightPx,
          padding: "0 6px",
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-primary)",
        }}
        className="chamfer-theme-fade-2s relative z-30 flex w-full shrink-0 items-center justify-between gap-1 border-b backdrop-blur-md select-none overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing whitespace-nowrap"
      >
        {/* ESQUERDA: P1 [←] SAIR + P4 Chip Compacto "● 3,0mm ▾" */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-cmd-id="nav.exit"
            onClick={(e) => {
              e.stopPropagation();
              onLeaveEditor();
            }}
            aria-label="Sair do CHAMFER CAD e voltar aos Projetos"
            title="Sair do editor e voltar"
            className="group flex h-[44px] w-[36px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
          >
            <span
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="chamfer-theme-fade-2s flex size-8 items-center justify-center rounded-lg border group-active:scale-95"
            >
              <ArrowLeft className="size-4" />
            </span>
          </button>

          {/* P4: Chip Compacto "● 3,0mm ▾" (Toque abre Projeto/Chapa/Cor; Pressão longa ~750ms abre Diagnóstico) */}
          <button
            ref={projectTriggerRef}
            type="button"
            data-testid="chamfer-portrait-project-chip"
            data-cmd-id="doc.project_sheet_chip"
            aria-expanded={projectMenuOpen}
            aria-label={`Projeto ${projectName}, espessura ${formattedThickness}, estado ${saveStatusText}. Toque para trocar folha, espessura ou cor. Segure para Diagnóstico.`}
            title={`${projectName} · CHAPA ${formattedThickness} (${saveStatusText})`}
            onPointerDown={() => {
              if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = window.setTimeout(() => {
                triggerHaptic("action");
                handleRunParityAudit();
              }, 750);
            }}
            onPointerUp={() => {
              if (longPressTimerRef.current) {
                window.clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onPointerCancel={() => {
              if (longPressTimerRef.current) {
                window.clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("tap");
              updateProjectMenuPosition();
              setProjectMenuOpen((v) => !v);
              setViewMenuOpen(false);
              setMoreMenuOpen(false);
            }}
            className="group flex h-[44px] shrink-0 items-center touch-pan-x cursor-pointer"
          >
            <span
              style={
                projectMenuOpen
                  ? {
                      backgroundColor: "var(--chamfer-accent-soft)",
                      borderColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent)",
                    }
                  : {
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }
              }
              className="chamfer-theme-fade-2s flex h-8 items-center gap-1 rounded-lg border px-2 font-mono text-[10.5px] font-bold group-active:scale-95 whitespace-nowrap"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: activeColorHex }}
                className="size-2.5 shrink-0 rounded-full border border-black/20 shadow-xs"
              />
              {showProjectNameInChip && (
                <span className="max-w-[90px] truncate text-left">{projectName} ·</span>
              )}
              <span className="shrink-0 font-bold">{compactThickness}</span>
              <ChevronDown className="size-3 shrink-0 opacity-70" />
            </span>
          </button>

          {/* Chip Unificado de Salvamento [ ✓ Salvo ] (1 clique salva imediatamente) */}
          <button
            type="button"
            data-testid="chamfer-unified-save-chip"
            data-cmd-id="doc.save"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("action");
              onManualSave();
            }}
            title={`Status: ${saveStatusText} — Clique para salvar agora`}
            aria-label={`Salvar projeto (${saveStatusText})`}
            className="group flex h-[44px] shrink-0 items-center touch-pan-x cursor-pointer"
          >
            <span
              className={cn(
                "flex h-7 items-center gap-1 rounded-lg border px-1.5 font-mono text-[9.5px] font-bold transition-colors group-active:scale-95",
                saveStatus === "erro"
                  ? "border-red-500/45 bg-red-500/15 text-red-400"
                  : saveStatus === "pendente" || saveStatus === "salvando"
                    ? "border-amber-500/45 bg-amber-500/15 text-amber-300"
                    : "border-[#10B981]/40 bg-[#10B981]/12 text-[#10B981]",
              )}
            >
              <span className={cn("size-1.5 rounded-full shrink-0", saveDotClass)} />
              <span className="hidden min-[380px]:inline">
                {saveStatus === "salvando" ? "Salvando" : "✓ Salvo"}
              </span>
              <span className="min-[380px]:hidden">✓</span>
            </span>
          </button>
        </div>

        {/* CENTRO: P2 Seletor Segmentado [ 2D | 3D ] + P3 Chip de Vista ("ORTO ▾") */}
        <div className="flex shrink-0 items-center gap-1">
          <div
            role="group"
            aria-label="Seletor de Ambiente 2D ou 3D"
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
            }}
            className="chamfer-theme-fade-2s flex h-8 shrink-0 items-center rounded-lg border p-0.5"
          >
            <button
              type="button"
              data-testid="chamfer-portrait-mode-2d"
              data-cmd-id="mode.2d_sketch"
              aria-label="Ambiente 2D Sketch"
              style={
                activeMode === "2d"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : {
                      color: "var(--chamfer-text-secondary)",
                    }
              }
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                if (mergeViewIntoModeSelector && activeMode === "2d") {
                  updateViewMenuPosition();
                  setViewMenuOpen((v) => !v);
                  setProjectMenuOpen(false);
                  setMoreMenuOpen(false);
                } else {
                  onSelect2D();
                }
              }}
              className="chamfer-theme-fade-2s h-7 rounded-md px-2 font-mono text-[10px] font-bold tracking-wider uppercase touch-pan-x cursor-pointer"
            >
              {mergeViewIntoModeSelector && activeMode === "2d"
                ? `2D·${compactViewLabel}▾`
                : "2D"}
            </button>
            <button
              type="button"
              data-testid="chamfer-portrait-mode-3d"
              data-cmd-id="mode.cad_3d"
              aria-label="Ambiente CAD 3D Sólido"
              style={
                activeMode === "3d"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : {
                      color: "var(--chamfer-text-secondary)",
                    }
              }
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                if (mergeViewIntoModeSelector && activeMode === "3d") {
                  updateViewMenuPosition();
                  setViewMenuOpen((v) => !v);
                  setProjectMenuOpen(false);
                  setMoreMenuOpen(false);
                } else {
                  onSelect3D();
                }
              }}
              className="chamfer-theme-fade-2s h-7 rounded-md px-2 font-mono text-[10px] font-bold tracking-wider uppercase touch-pan-x cursor-pointer"
            >
              {mergeViewIntoModeSelector && activeMode === "3d"
                ? `3D·${compactViewLabel}▾`
                : "3D"}
            </button>
          </div>

          {!mergeViewIntoModeSelector && (
            <button
              ref={viewTriggerRef}
              type="button"
              data-testid="chamfer-portrait-view-chip"
              data-cmd-id="view.ortho_2d"
              aria-expanded={viewMenuOpen}
              aria-label={`Vista ativa: ${fullViewLabel}. Toque para configurar vista ou órbita 3D.`}
              title={`Vista: ${fullViewLabel} (toque para alternar vista ou órbita 3D)`}
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("tap");
                updateViewMenuPosition();
                setViewMenuOpen((v) => !v);
                setProjectMenuOpen(false);
                setMoreMenuOpen(false);
              }}
              className="group flex h-[44px] shrink-0 items-center touch-pan-x cursor-pointer"
            >
              <span
                style={
                  viewMenuOpen || isOrbitToolActive || isOrbitTilted
                    ? {
                        backgroundColor: "var(--chamfer-accent-soft)",
                        borderColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-secondary)",
                      }
                }
                className="chamfer-theme-fade-2s flex h-8 items-center gap-0.5 rounded-lg border px-2 font-mono text-[9.5px] font-bold tracking-wider uppercase group-active:scale-95 whitespace-nowrap"
              >
                <span>{displayedViewLabel}</span>
                <ChevronDown className="size-2.5 opacity-70" />
              </span>
            </button>
          )}
        </div>

        {/* DIREITA: P1 Histórico Direto (↶ ↷) + Foco + Tema (☀/☾) + Menu Mais Ações (⋮) + Ações Rápidas Roláveis */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-cmd-id="history.undo"
            disabled={!canUndo}
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
            aria-label="Desfazer última alteração"
            title="Desfazer (Ctrl+Z)"
            style={{ opacity: canUndo ? 1 : 0.45 }}
            className={cn(
              "group flex h-[44px] w-[32px] shrink-0 items-center justify-center touch-pan-x",
              canUndo ? "cursor-pointer" : "cursor-not-allowed",
            )}
          >
            <span
              style={
                canUndo
                  ? {
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }
                  : {
                      borderColor: "transparent",
                      color: "var(--chamfer-text-muted)",
                    }
              }
              className="chamfer-theme-fade-2s flex size-8 items-center justify-center rounded-lg border"
            >
              <Undo2 className="size-4" />
            </span>
          </button>

          <button
            type="button"
            data-cmd-id="history.redo"
            disabled={!canRedo}
            onClick={(e) => {
              e.stopPropagation();
              onRedo();
            }}
            aria-label="Refazer alteração desfeita"
            title="Refazer (Ctrl+Y)"
            style={{ opacity: canRedo ? 1 : 0.45 }}
            className={cn(
              "group flex h-[44px] w-[32px] shrink-0 items-center justify-center touch-pan-x",
              canRedo ? "cursor-pointer" : "cursor-not-allowed",
            )}
          >
            <span
              style={
                canRedo
                  ? {
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }
                  : {
                      borderColor: "transparent",
                      color: "var(--chamfer-text-muted)",
                    }
              }
              className="chamfer-theme-fade-2s flex size-8 items-center justify-center rounded-lg border"
            >
              <Redo2 className="size-4" />
            </span>
          </button>

          {/* Botão Rápido [ 🧮 Calc ] com Resgate Determinístico */}
          {activeMode === "2d" && onToggleBenchCalc && (
            <button
              type="button"
              data-testid="chamfer-portrait-calc-btn"
              data-cmd-id="global.bench_calc"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                onToggleBenchCalc();
              }}
              aria-label="Calculadora Científica e Metalúrgica de Bancada"
              title={
                isBenchCalcFloating
                  ? "Resgatar Calculadora Flutuante para a Direita"
                  : "Abrir / Fechar Calculadora de Bancada"
              }
              className="group relative flex h-[44px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
            >
              <span
                style={
                  isBenchCalcOpen
                    ? {
                        backgroundColor: "rgba(14, 165, 233, 0.22)",
                        borderColor: "#38BDF8",
                        color: isDark ? "#7DD3FC" : "#0284C7",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }
                }
                className="chamfer-theme-fade-2s relative flex h-8 items-center gap-1 rounded-lg border px-2 font-mono text-[9.5px] font-bold"
              >
                <Calculator className="size-3.5 shrink-0" />
                <span>Calc</span>
                {isBenchCalcOpen && isBenchCalcFloating && (
                  <span
                    data-testid="bench-calc-floating-dot"
                    className="size-1.5 rounded-full bg-amber-400"
                    title="Flutuando"
                  />
                )}
              </span>
            </button>
          )}

          {/* Botões Compactos Paramétricos Integrados na Barra Superior Retrato: [ fx ] [ 🔍 ] [ ✂ ] */}
          <button
            type="button"
            data-testid="chamfer-portrait-fx-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              dispatchChamferParametricPanel("parameters");
            }}
            aria-label="Parâmetros e Variantes (fx)"
            title="Parâmetros (fx), Sweep e Configurações"
            className="group flex h-[44px] w-[30px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
          >
            <span
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-accent)",
              }}
              className="chamfer-theme-fade-2s flex size-7 items-center justify-center rounded-lg border font-mono text-[10px] font-bold group-active:scale-95"
            >
              fx
            </span>
          </button>

          <button
            type="button"
            data-testid="chamfer-portrait-search-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              dispatchChamferParametricPanel("sbox");
            }}
            aria-label="Busca Rápida de Comandos"
            title="Busca Rápida de Comandos 2D/3D, Chapa e Seção"
            className="group flex h-[44px] w-[30px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
          >
            <span
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="chamfer-theme-fade-2s flex size-7 items-center justify-center rounded-lg border group-active:scale-95"
            >
              <Search className="size-3.5" />
            </span>
          </button>

          {activeMode === "3d" && (
            <button
              type="button"
              data-testid="chamfer-portrait-section-btn"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                dispatchChamferParametricPanel("section");
              }}
              aria-label="Corte em Seção 3D"
              title="Abrir Corte em Seção 3D e Massa"
              className="group flex h-[44px] w-[30px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
            >
              <span
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-accent)",
                }}
                className="chamfer-theme-fade-2s flex size-7 items-center justify-center rounded-lg border group-active:scale-95"
              >
                <Scissors className="size-3.5" />
              </span>
            </button>
          )}

          {/* Botão Rápido Modo Foco Imersivo [ ⛶ Foco ] */}
          <button
            type="button"
            data-testid="chamfer-portrait-focus-btn"
            data-cmd-id="ui.fullscreen_toggle"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              onToggleFullscreen();
            }}
            aria-label="Ativar Modo Foco Imersivo (Tela Cheia)"
            title="Modo Foco Imersivo (oculta barras e expande o canvas em 100%)"
            className="group flex h-[44px] w-[30px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
          >
            <span
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="chamfer-theme-fade-2s flex size-7 items-center justify-center rounded-lg border group-active:scale-95"
            >
              <Maximize className="size-3.5" />
            </span>
          </button>

          {/* Botão de Alternância de Tema (Sol / Lua) com alto contraste em ambos os temas */}
          <button
            type="button"
            data-testid="chamfer-portrait-theme-btn"
            data-cmd-id="ui.theme_toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTheme();
            }}
            aria-label={isDark ? "Mudar para Tema Claro" : "Mudar para Tema Escuro"}
            title={isDark ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"}
            className="group flex h-[44px] w-[30px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
          >
            <span
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="chamfer-theme-fade-2s flex size-7 items-center justify-center rounded-lg border group-active:scale-95"
            >
              {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </span>
          </button>

          <button
            ref={triggerRef}
            type="button"
            data-testid="chamfer-portrait-more-btn"
            data-cmd-id="topbar.more_menu"
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("tap");
              updateMoreMenuPosition();
              setMoreMenuOpen((v) => !v);
              setProjectMenuOpen(false);
              setViewMenuOpen(false);
            }}
            aria-label="Mais ações e configurações do CHAMFER CAD"
            title="Mais Ações (VISION, INTENT, CORTE/BOM, Exportar, Enquadrar, Tema)"
            className="group flex h-[44px] w-[36px] shrink-0 items-center justify-center touch-pan-x cursor-pointer"
          >
            <span
              style={
                moreMenuOpen
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      borderColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : {
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }
              }
              className="chamfer-theme-fade-2s flex size-8 items-center justify-center rounded-lg border group-active:scale-95"
            >
              <MoreVertical className="size-4" />
            </span>
          </button>

          {/* Ações Rápidas Roláveis ao Deslizar a Barra Superior Horizontalmente */}
          <button
            type="button"
            data-testid="chamfer-portrait-vision-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("action");
              onOpenVision();
            }}
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2 font-mono text-[9.5px] font-bold text-sky-400 touch-pan-x cursor-pointer whitespace-nowrap"
            title="CALDRA VISION — Digitalização de Rascunho/Foto para CAD"
          >
            <ScanEye className="size-3 shrink-0" />
            <span>VISION</span>
          </button>

          <button
            type="button"
            data-testid="chamfer-portrait-intent-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("action");
              onOpenIntent();
            }}
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 font-mono text-[9.5px] font-bold text-amber-400 touch-pan-x cursor-pointer whitespace-nowrap"
            title="CALDRA INTENT — Gerador Paramétrico de Peças"
          >
            <Sparkles className="size-3 shrink-0" />
            <span>INTENT</span>
          </button>

          <button
            type="button"
            data-testid="chamfer-portrait-bom-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("action");
              onOpenWorkshop();
            }}
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 font-mono text-[9.5px] font-bold text-emerald-400 touch-pan-x cursor-pointer whitespace-nowrap"
            title="CORTE / BOM — Lista de Corte e Orçamento"
          >
            <ClipboardList className="size-3 shrink-0" />
            <span>CORTE/BOM</span>
          </button>

          {onChangeLayoutPreference && (
            <button
              type="button"
              data-testid="chamfer-portrait-shell-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                onChangeLayoutPreference(layoutPreference === "compact" ? "prumo" : "compact");
              }}
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-primary)",
              }}
              className="flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 font-mono text-[9.5px] font-bold touch-pan-x cursor-pointer whitespace-nowrap"
              title="Alternar Interface (Compacta / PRUMO)"
            >
              <span>📐 {layoutPreference === "compact" ? "PRUMO" : "Compacta"}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="chamfer-portrait-export-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("action");
              onOpenExport();
            }}
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-primary)",
            }}
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 font-mono text-[9.5px] font-bold touch-pan-x cursor-pointer whitespace-nowrap"
            title="Exportar DXF / SVG / PDF"
          >
            <Download className="size-3 shrink-0" />
            <span>Exportar</span>
          </button>
        </div>
      </header>

      {/* ====================================================================
       * PORTAL 1: POPOVER DE PROJETO, FOLHAS (P01/P02), ESPESSURA E COR (COR)
       * Renderizado no document.body com position: fixed e zIndex: 9999
       * ==================================================================== */}
      {projectMenuOpen &&
        renderInBodyPortal(
          <div
            ref={projectMenuRef}
            data-testid="portrait-project-menu-portal"
            role="dialog"
            aria-label="Seletor de Folhas, Nome do Projeto, Espessura da Chapa e Cor Técnica"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: projectMenuCoords.top,
              left: projectMenuCoords.left,
              zIndex: 9999,
              backgroundColor: "var(--chamfer-popover-bg)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-primary)",
            }}
            className="chamfer-theme-fade-2s w-76 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-70px)] overflow-y-auto rounded-2xl border p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div
              style={{ borderColor: "var(--chamfer-border-subtle)" }}
              className="flex items-center justify-between border-b pb-2 mb-2.5"
            >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full shrink-0", saveDotClass)} />
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#94A3B8]">
                      {saveStatusText}
                    </p>
                  </div>
                  <p className="font-mono text-xs font-bold truncate" title={projectName}>
                    {projectName}
                  </p>
                </div>
                <button
                  type="button"
                  data-cmd-id="doc.save"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    onManualSave();
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                    isDark
                      ? "border-[#10B981]/40 bg-[#10B981]/15 text-[#34D399]"
                      : "border-[#059669]/40 bg-[#059669]/10 text-[#059669]",
                  )}
                >
                  {saveStatus === "salvando" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  <span>Salvar</span>
                </button>
              </div>

              {/* 1. Seletor de Folhas P01 / P02 / + */}
              <div className="mb-3">
                <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                  Folhas do Projeto (Planos de Corte)
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {plans.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      data-cmd-id="doc.switch_plan"
                      onClick={() => {
                        triggerHaptic("selection");
                        onSelectPlan(pl.id);
                        setProjectMenuOpen(false);
                      }}
                      className={cn(
                        "min-h-[32px] rounded-lg px-2.5 py-1 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
                        pl.id === activePlanId
                          ? "bg-[#E11D48] text-white shadow-xs"
                          : isDark
                            ? "bg-[#11141C] text-[#94A3B8] hover:text-white"
                            : "bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]",
                      )}
                    >
                      {pl.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    data-cmd-id="doc.create_plan"
                    aria-label="Criar nova folha de corte"
                    onClick={() => {
                      triggerHaptic("action");
                      onCreatePlan();
                      setProjectMenuOpen(false);
                    }}
                    className={cn(
                      "flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold cursor-pointer",
                      isDark
                        ? "border-white/[0.1] bg-[#11141C] text-[#F8FAFC]"
                        : "border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A]",
                    )}
                  >
                    <Plus className="size-3 text-[#E11D48]" /> Folha
                  </button>
                </div>
              </div>

              {/* 2. Espessura da Chapa (mm) */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Espessura CHAPA (mm)
                  </span>
                  {onOpenCustomThicknessKeypad ? (
                    <button
                      type="button"
                      data-cmd-id="chp.thickness"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setProjectMenuOpen(false);
                        onOpenCustomThicknessKeypad({ x: rect.left, y: rect.bottom + 12 });
                      }}
                      className="rounded-md border border-[#E11D48]/40 bg-[#E11D48]/12 px-2 py-0.5 font-mono text-[10px] font-bold text-[#E11D48] cursor-pointer"
                    >
                      Digitar {formattedThickness} ✎
                    </button>
                  ) : (
                    <span className="font-mono text-[10.5px] font-bold text-[#E11D48]">
                      CHAPA {formattedThickness}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[0.8, 1.0, 1.5, 2.0, 3.0, 4.75, 6.35, 9.5, 12.7].slice(0, 8).map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onThicknessChange(th);
                      }}
                      className={cn(
                        "min-h-[32px] rounded-lg py-1 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                        Math.abs(thickness - th) < 0.05
                          ? "bg-[#E11D48] text-white"
                          : isDark
                            ? "bg-[#11141C] text-[#94A3B8] hover:text-white"
                            : "bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]",
                      )}
                    >
                      {th}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Seletor Rápido de Cor Técnica & Camada (COR — incluindo Preto Técnico #0F172A) */}
              {onSelectColorAndLayer && (
                <div className="mb-3 pt-2 border-t border-white/[0.08]">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Cor Técnica & Camada (COR)
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CHAMFER_TECHNICAL_PALETTE.map((col) => {
                      const isCurrent =
                        (activeStrokeColor &&
                          activeStrokeColor.toUpperCase() === col.hex.toUpperCase()) ||
                        (!activeStrokeColor && activeLayer === col.layer && col.id !== "preto_tecnico" && col.id !== "branco_tecnico");
                      return (
                        <button
                          key={col.id}
                          type="button"
                          data-testid={`top-color-swatch-${col.id}`}
                          data-cmd-id="cor.palette"
                          onClick={() => {
                            triggerHaptic("selection");
                            onSelectColorAndLayer(col);
                            setProjectMenuOpen(false);
                          }}
                          className={cn(
                            "flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[9.5px] font-bold transition-colors cursor-pointer",
                            isCurrent
                              ? "border-[#E11D48] bg-[#E11D48]/18 text-[#E11D48]"
                              : isDark
                                ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0] hover:border-white/25"
                                : "border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:border-[#94A3B8]",
                          )}
                        >
                          <span
                            style={{ backgroundColor: col.hex }}
                            className="size-3 shrink-0 rounded-full border border-white/30 shadow-xs"
                          />
                          <span className="truncate">{col.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    onOpenNewProjectDialog();
                  }}
                  className={cn(
                    "flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border py-1.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                    isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#F8FAFC] hover:bg-[#222836]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#E2E8F0]/60",
                  )}
                >
                  <FolderPlus className="size-3.5 text-[#E11D48]" />
                  <span>Novo / Renomear</span>
                </button>
                <button
                  type="button"
                  data-testid="open-parity-diag-btn"
                  onClick={handleRunParityAudit}
                  title="Diagnóstico de Paridade Vertical × Paisagem"
                  className={cn(
                    "flex min-h-[36px] items-center justify-center gap-1 rounded-xl border px-2.5 py-1.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                    isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#38BDF8] hover:bg-[#222836]"
                      : "border-[#CBD5E1] bg-[#F8FAFC] text-[#0284C7]",
                  )}
                >
                  <Bug className="size-3.5" />
                  <span>Diag</span>
                </button>
              </div>
          </div>,
        )}

      {/* ====================================================================
       * PORTAL 2: POPOVER DE VISTA (ORTO 2D | ÓRBITA 3D + SÓLIDO/SOMB/ARAME)
       * Renderizado no document.body com position: fixed e zIndex: 9999
       * ==================================================================== */}
      {viewMenuOpen &&
        renderInBodyPortal(
          <div
            ref={viewMenuRef}
            data-testid="portrait-view-menu-portal"
            role="dialog"
            aria-label="Seletor de Vista e Estilo 3D"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: viewMenuCoords.top,
              left: viewMenuCoords.left,
              zIndex: 9999,
              backgroundColor: "var(--chamfer-popover-bg)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-primary)",
            }}
            className="chamfer-theme-fade-2s w-68 max-w-[calc(100vw-16px)] rounded-2xl border p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            <span
              style={{ color: "var(--chamfer-text-secondary)" }}
              className="block font-mono text-[9px] font-bold uppercase tracking-wider mb-1.5"
            >
              Vista & Projeção do Canvas
            </span>
            <div className="grid grid-cols-2 gap-1 mb-2">
              <button
                type="button"
                data-cmd-id="view.ortho_2d"
                onClick={() => {
                  triggerHaptic("selection");
                  onToggleOrbitTool(false);
                  onSetDrawingProjection("orthographic");
                  onSelect2D();
                  setViewMenuOpen(false);
                }}
                style={
                  activeMode === "2d" &&
                  !isOrbitToolActive &&
                  !isOrbitTilted
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        color: "var(--chamfer-text-secondary)",
                      }
                }
                className="min-h-[34px] rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer"
              >
                ORTO 2D
              </button>
              <button
                type="button"
                data-cmd-id="view.orbit_3d"
                onClick={() => {
                  triggerHaptic("selection");
                  onToggleOrbitTool(!isOrbitToolActive);
                  setViewMenuOpen(false);
                }}
                style={
                  isOrbitToolActive || isOrbitTilted
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        color: "var(--chamfer-text-secondary)",
                      }
                }
                className="min-h-[34px] rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer"
              >
                ÓRBITA 3D
              </button>
            </div>

            {/* ESTILO DE RENDERIZAÇÃO 3D: SÓLIDO | SOMBREADO | ARAME */}
            <div
              style={{ borderColor: "var(--chamfer-border-subtle)" }}
              className="pt-1.5 border-t"
            >
              <span
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="block font-mono text-[9px] font-bold uppercase tracking-wider mb-1"
              >
                Representação 3D (Somb / Somb+Ar / Arame)
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: "shaded" as EdgeMode, label: "SOMB" },
                    { id: "shaded-edges" as EdgeMode, label: "SOMB+AR" },
                    { id: "wireframe" as EdgeMode, label: "ARAME" },
                  ]
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    data-cmd-id="view.style_3d"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangeRenderStyle3D(st.id);
                      setViewMenuOpen(false);
                    }}
                    style={
                      renderStyle3D === st.id
                        ? {
                            backgroundColor: "var(--chamfer-accent)",
                            color: "var(--chamfer-accent-contrast)",
                          }
                        : {
                            backgroundColor: "var(--chamfer-surface-elevated)",
                            color: "var(--chamfer-text-secondary)",
                          }
                    }
                    className="min-h-[32px] rounded-lg py-1 font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer"
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>,
        )}

      {/* ====================================================================
       * PORTAL 3: MENU DE TRÊS PONTINHOS (⋮) — RENDERIZADO EM PORTAL NO document.body
       * position: fixed, coordenadas de getBoundingClientRect(), zIndex: 9999
       * ==================================================================== */}
      {moreMenuOpen &&
        renderInBodyPortal(
          <div
            ref={moreMenuRef}
            data-testid="portrait-more-menu-portal"
            role="menu"
            aria-label="Menu de ações globais do CHAMFER CAD"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: moreMenuCoords.top,
              right: moreMenuCoords.right,
              zIndex: 9999,
              backgroundColor: "var(--chamfer-popover-bg)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-primary)",
            }}
            className="chamfer-theme-fade-2s max-h-[calc(100dvh-64px)] w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            {/* CABEÇALHO DE DETALHES DO PROJETO + BOTÃO SALVAR */}
            <div
              style={{ backgroundColor: "var(--chamfer-surface-elevated)" }}
              className="mb-1.5 flex items-center justify-between rounded-xl px-2.5 py-2"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full shrink-0", saveDotClass)} />
                  <span
                    style={{ color: "var(--chamfer-text-secondary)" }}
                    className="font-mono text-[9px] font-bold uppercase tracking-wider"
                  >
                    {saveStatusText}
                  </span>
                </div>
                <p className="font-mono text-[11px] font-bold truncate" title={projectName}>
                  {projectName}
                </p>
              </div>
              <button
                type="button"
                data-cmd-id="doc.save"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onManualSave();
                }}
                style={{
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }}
                className="shrink-0 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold cursor-pointer"
              >
                Salvar
              </button>
            </div>

            {/* 6 ITENS OBRIGATÓRIOS EM DESTAQUE NO TOPO DO MENU DE TRÊS PONTINHOS */}
            <PortraitMenuItem
              cmdId="global.vision"
              icon={ScanEye}
              accentColor="text-[#E11D48]"
              label="👁 VISION (Engenharia Reversa 1:1)"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenVision();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="global.intent"
              icon={Sparkles}
              accentColor="text-[#38BDF8]"
              label="✨ CHAMFER INTENT (Assistente IA)"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenIntent();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="global.workshop_bom"
              icon={Boxes}
              accentColor="text-[#10B981]"
              label="⚙ CORTE / BOM (Lista e Nesting)"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenWorkshop();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="global.export"
              icon={Download}
              accentColor="text-[#F59E0B]"
              label="⬇ Exportar CNC / DXF / Prancha"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenExport();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="view.fit_piece"
              icon={Crosshair}
              accentColor="text-[#38BDF8]"
              label="⌖ Enquadrar Peça na Tela"
              onClick={() => {
                setMoreMenuOpen(false);
                onCenterPiece(false);
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="ui.theme_toggle"
              icon={isDark ? Sun : Moon}
              accentColor="text-[#FBBF24]"
              label="◐ Alternar Tema Claro / Escuro"
              onClick={() => {
                setMoreMenuOpen(false);
                onToggleTheme();
              }}
              isDark={isDark}
            />
            {onOpenProjectSettings && (
              <PortraitMenuItem
                cmdId="ui.project_settings"
                icon={Sliders}
                accentColor="text-[#38BDF8]"
                label="🎨 Aparência, Destaque, Opacidade & Prefs"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenProjectSettings();
                }}
                isDark={isDark}
              />
            )}

            <div
              style={{ backgroundColor: "var(--chamfer-border-subtle)" }}
              className="my-1.5 h-px"
            />

            {/* SELETOR DE INTERFACE DO CHAMFER: COMPACTA | PRUMO */}
            {onChangeLayoutPreference && (
              <div
                className={cn(
                  "mb-1.5 rounded-xl border px-2.5 py-1.5",
                  isDark ? "border-white/[0.06] bg-[#181C26]/60" : "border-[#E2E8F0] bg-[#F8FAFC]",
                )}
              >
                <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                  Interface do CHAMFER
                </span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    data-testid="chamfer-shell-mode-compact-btn"
                    data-cmd-id="ui.layout_mode_toggle"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangeLayoutPreference("compact");
                      setMoreMenuOpen(false);
                    }}
                    className={cn(
                      "min-h-[30px] rounded-lg font-mono text-[10px] font-bold transition-colors cursor-pointer",
                      layoutPreference === "compact"
                        ? "bg-[#E11D48] text-white"
                        : isDark
                          ? "bg-[#11141C] text-[#94A3B8] hover:text-white"
                          : "bg-white text-[#475569] hover:text-[#0F172A]",
                    )}
                  >
                    Compacta
                  </button>
                  <button
                    type="button"
                    data-testid="chamfer-shell-mode-prumo-btn"
                    data-cmd-id="ui.layout_mode_toggle"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangeLayoutPreference("prumo");
                      setMoreMenuOpen(false);
                    }}
                    className={cn(
                      "min-h-[30px] rounded-lg font-mono text-[10px] font-bold transition-colors cursor-pointer",
                      layoutPreference === "prumo"
                        ? "bg-[#E11D48] text-white"
                        : isDark
                          ? "bg-[#11141C] text-[#94A3B8] hover:text-white"
                          : "bg-white text-[#475569] hover:text-[#0F172A]",
                    )}
                  >
                    📐 PRUMO
                  </button>
                </div>
              </div>
            )}

            <PortraitMenuItem
              cmdId="global.cnc_direct"
              icon={Scissors}
              label="Plano de Corte CNC Direto"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenCnc();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="view.fit_workspace"
              icon={Maximize2}
              label="Enquadrar Área de Trabalho"
              onClick={() => {
                setMoreMenuOpen(false);
                onFitWorkspace();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="view.center_piece_in_workspace"
              icon={AlignCenter}
              label="Centralizar Peça na Área"
              onClick={() => {
                setMoreMenuOpen(false);
                onCenterPiece(true);
              }}
              isDark={isDark}
            />

            <div className={cn("my-1 h-px", isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]")} />

            <PortraitMenuItem
              cmdId="det.presets"
              icon={Boxes}
              label="Presets Paramétricos"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenPresets();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="out.technical_sheet"
              icon={FileText}
              label="Prancha 2D e Legenda (A4/A3)"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenTechnicalSheet();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="insp.topology_health"
              icon={Activity}
              label="Topologia & Auto-Heal"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenTopologyHealth();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="insp.variables"
              icon={Sliders}
              label="Tabela de Variáveis"
              onClick={() => {
                setMoreMenuOpen(false);
                onOpenVariables();
              }}
              isDark={isDark}
            />
            {onVerifyGeometry && (
              <PortraitMenuItem
                cmdId="insp.verify_geometry"
                icon={Check}
                label="Verificar Geometria p/ CNC"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onVerifyGeometry();
                }}
                isDark={isDark}
              />
            )}
            {onOptimizeGeometry && (
              <PortraitMenuItem
                cmdId="insp.optimize_vectors"
                icon={Sparkles}
                label="Otimizar Vetores"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOptimizeGeometry();
                }}
                isDark={isDark}
              />
            )}
            <PortraitMenuItem
              cmdId="insp.toggle_support_dims"
              icon={Ruler}
              label={showDims ? "Ocultar Medidas de Apoio" : "Mostrar Medidas de Apoio"}
              onClick={() => {
                setMoreMenuOpen(false);
                onToggleShowDims();
              }}
              isDark={isDark}
            />

            <div className={cn("my-1 h-px", isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]")} />

            <PortraitMenuItem
              cmdId="ui.fullscreen_toggle"
              icon={focus ? Minimize : Maximize}
              label={focus ? "Sair do Modo Tela Cheia" : "Modo Tela Cheia (Foco)"}
              onClick={() => {
                setMoreMenuOpen(false);
                onToggleFullscreen();
              }}
              isDark={isDark}
            />
            <PortraitMenuItem
              cmdId="diag.matrix"
              icon={Bug}
              accentColor="text-[#38BDF8]"
              label="Diagnóstico de Paridade 1:1"
              onClick={handleRunParityAudit}
              isDark={isDark}
            />
          </div>,
        )}

      {/* ====================================================================
       * PORTAL 4: MODAL DE DIAGNÓSTICO DE PARIDADE E DEPURADOR DE TOQUE (z-[80])
       * ==================================================================== */}
      {diagModalOpen &&
        diagReport &&
        renderInBodyPortal(
          <div
            role="dialog"
            aria-label="Diagnóstico de Paridade Vertical vs Paisagem"
            data-testid="portrait-parity-diag-modal"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
            onClick={() => setDiagModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex max-h-[82dvh] w-full max-w-md flex-col rounded-2xl border p-3.5 shadow-2xl font-mono",
                isDark
                  ? "border-white/[0.14] bg-[#11141C] text-[#F8FAFC]"
                  : "border-[#CBD5E1] bg-white text-[#0F172A]",
              )}
            >
              <div className="flex items-center justify-between border-b pb-2.5 mb-2.5 border-white/[0.08]">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#38BDF8]">
                    DIAG_ENABLED • TELEMETRIA E PARIDADE 1:1
                  </span>
                  <h3 className="text-xs font-bold">
                    {diagTab === "paridade"
                      ? `${diagReport.passedCount}/${diagReport.totalChecked} Comandos Aprovados (0 Órfãos)`
                      : `Monitor de Desempenho CAD 2D/3D (${perfTelemetry.fps} FPS)`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDiagModalOpen(false)}
                  className="rounded-lg p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Abas do Painel de Diagnóstico: [ Paridade 1:1 | Desempenho ] */}
              <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">
                <button
                  type="button"
                  data-testid="diag-tab-paridade"
                  onClick={() => setDiagTab("paridade")}
                  className={cn(
                    "rounded-lg py-1.5 text-[10px] font-bold transition-colors cursor-pointer",
                    diagTab === "paridade"
                      ? "bg-[#E11D48] text-white"
                      : "text-[#94A3B8] hover:text-white",
                  )}
                >
                  Paridade 1:1
                </button>
                <button
                  type="button"
                  data-testid="diag-tab-desempenho"
                  onClick={() => setDiagTab("desempenho")}
                  className={cn(
                    "rounded-lg py-1.5 text-[10px] font-bold transition-colors cursor-pointer",
                    diagTab === "desempenho"
                      ? "bg-[#E11D48] text-white"
                      : "text-[#94A3B8] hover:text-white",
                  )}
                >
                  ⚡ Desempenho
                </button>
              </div>

              {diagTab === "paridade" ? (
                <>
                  <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-2.5 py-2">
                    <div className="min-w-0">
                      <span className="block text-[9.5px] font-bold">Depurador de Toque em Tempo Real</span>
                      <span className="block truncate text-[9px] text-[#94A3B8]">
                        {lastTouchDebugInfo}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTouchDebuggerOn((v) => !v)}
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold cursor-pointer",
                        touchDebuggerOn
                          ? "bg-[#10B981] text-white"
                          : "bg-white/10 text-[#94A3B8]",
                      )}
                    >
                      {touchDebuggerOn ? "ON" : "OFF"}
                    </button>
                  </div>

                  <pre
                    className={cn(
                      "min-h-0 flex-1 overflow-y-auto rounded-xl border p-2.5 text-[9.5px] leading-relaxed whitespace-pre-wrap",
                      isDark
                        ? "border-white/[0.08] bg-[#0B0E14] text-[#E2E8F0]"
                        : "border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]",
                    )}
                  >
                    {diagReport.summaryText}
                  </pre>

                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      data-testid="copy-parity-report-btn"
                      onClick={() => {
                        try {
                          navigator.clipboard?.writeText(diagReport.summaryText);
                          setCopiedReport(true);
                          setTimeout(() => setCopiedReport(false), 2000);
                        } catch {
                          setCopiedReport(true);
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-[#E11D48] px-3 py-2 text-[10.5px] font-bold text-white cursor-pointer"
                    >
                      <CopyCheck className="size-3.5" />
                      <span>{copiedReport ? "Relatório Copiado!" : "📋 Copiar Relatório"}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div
                  data-testid="diag-desempenho-panel"
                  className="flex flex-col gap-2 overflow-y-auto text-[10px]"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                      <span className="block text-[8.5px] uppercase text-[#94A3B8]">Taxa de Quadros</span>
                      <span className="mt-0.5 block text-sm font-bold text-[#10B981]">
                        {perfTelemetry.fps} FPS
                      </span>
                      <span className="block text-[9px] text-[#94A3B8]">
                        P50: {perfTelemetry.frameP50Ms}ms • P95: {perfTelemetry.frameP95Ms}ms
                      </span>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                      <span className="block text-[8.5px] uppercase text-[#94A3B8]">Canvas High-DPI</span>
                      <span className="mt-0.5 block text-sm font-bold text-[#38BDF8]">
                        DPR {perfTelemetry.dpr}x
                      </span>
                      <span className="block text-[9px] text-[#94A3B8]">
                        VRAM Buffers: {perfTelemetry.canvasVramMb} MB
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                      <span className="block text-[8.5px] uppercase text-[#94A3B8]">Cache Topológico 3D</span>
                      <span className="mt-0.5 block text-sm font-bold text-[#F59E0B]">
                        {perfTelemetry.cacheHitRate}% Hit
                      </span>
                      <span className="block text-[9px] text-[#94A3B8]">
                        Hits: {perfTelemetry.cacheHits} • Miss: {perfTelemetry.cacheMisses}
                      </span>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                      <span className="block text-[8.5px] uppercase text-[#94A3B8]">Memória JS Heap</span>
                      <span className="mt-0.5 block text-sm font-bold text-[#E2E8F0]">
                        {perfTelemetry.jsHeapUsedMb !== null
                          ? `${perfTelemetry.jsHeapUsedMb} MB`
                          : "N/D (Safari/FF)"}
                      </span>
                      <span className="block text-[9px] text-[#94A3B8]">
                        {perfTelemetry.jsHeapTotalMb !== null
                          ? `Alocado: ${perfTelemetry.jsHeapTotalMb} MB`
                          : `Pico Frame: ${perfTelemetry.frameMaxMs}ms`}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8.5px] uppercase text-[#94A3B8]">
                        Cache Offscreen Fluid Aurora / Silk 2D
                      </span>
                      <span className="text-xs font-bold text-[#A855F7]">
                        {perfTelemetry.silkHitRate}% Hit
                      </span>
                    </div>
                    <span className="block text-[9px] text-[#94A3B8]">
                      Blits O(1): {perfTelemetry.silkHits} • Raster: {perfTelemetry.silkMisses} • Sprites LUT: {perfTelemetry.auroraSprites}
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2.5 text-[9.5px] leading-relaxed text-[#94A3B8]">
                    <div className="font-bold text-[#F8FAFC] mb-1">Otimizações Ativas no Ecossistema:</div>
                    <div>• Fluid Aurora Offscreen High-DPI Cache + Sprites LUT (0 alloc/frame)</div>
                    <div>• Remoção de Convolução Blur 110px Redundante em Véus Gaussianos</div>
                    <div>• KeepAlive Lazy Split (Abas & Motor 3D sob demanda)</div>
                    <div>• Suspensão Automática de rAF Offscreen (Home Hero & Aurora GPU)</div>
                    <div>• Cache O(1) de Loops Fechados e Furos na Órbita 3D 60fps</div>
                    <div>• WeakMap de Geometria de Barras e Perfis BOM Ocos</div>
                  </div>
                </div>
              )}
            </div>
          </div>,
        )}

      {/* Banner flutuante do Depurador de Toque quando ativo */}
      {touchDebuggerOn &&
        renderInBodyPortal(
          <div className="pointer-events-none fixed top-[52px] left-1/2 -translate-x-1/2 z-[75] rounded-full border border-[#38BDF8]/50 bg-[#0B0E14]/90 px-3 py-0.5 font-mono text-[9.5px] font-bold text-[#38BDF8] shadow-lg">
            🎯 {lastTouchDebugInfo}
          </div>,
        )}
    </>
  );
}

function PortraitMenuItem({
  cmdId,
  icon: Icon,
  label,
  onClick,
  accentColor,
  isDark,
}: {
  cmdId?: string;
  icon: typeof Minus;
  label: string;
  onClick: () => void;
  accentColor?: string;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-cmd-id={cmdId}
      onClick={onClick}
      className={cn(
        "flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-mono text-[11px] font-semibold transition-colors cursor-pointer",
        isDark
          ? "text-[#E2E8F0] hover:bg-[#11141C] hover:text-white"
          : "text-[#1E293B] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", accentColor ?? "text-[#94A3B8]")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/* ============================================================================
 * MICRO-PÍLULA FLUTUANTE DE COORDENADAS X/Y, ZOOM, GRADE E SNAP NO CANVAS (24PX)
 * ============================================================================ */
export interface ChamferPortraitCanvasMicroPillProps {
  isDark: boolean;
  planName: string;
  plans?: { id: string; name: string }[];
  activePlanId?: string;
  onSelectPlan?: (id: string) => void;
  onCreatePlan?: () => void;
  cursor: Vec2;
  snapOn: boolean;
  onToggleSnap: () => void;
  temporaryOrigin: { p: Vec2; label: string } | null;
  onClearTemporaryOrigin: () => void;
  onSetRefAtCursor: () => void;
  onReanchorDatumHere?: () => void;
  onResetDatumZero?: () => void;
  zoomPercent?: number;
  onFitPiece?: () => void;
  onFitWorkspace?: () => void;
  onResetZoom100?: () => void;
  onZoomStep?: (factor: number) => void;
  gridMm?: number;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  onSelectGridMm?: (mm: number) => void;
  selectedCount?: number;
}

export function ChamferPortraitCanvasMicroPill({
  isDark,
  planName,
  plans = [],
  activePlanId,
  onSelectPlan,
  onCreatePlan,
  cursor,
  snapOn,
  onToggleSnap,
  temporaryOrigin,
  onClearTemporaryOrigin,
  onSetRefAtCursor,
  onReanchorDatumHere,
  onResetDatumZero,
  zoomPercent = 100,
  onFitPiece,
  onFitWorkspace,
  onResetZoom100,
  onZoomStep,
  gridMm = 10,
  showGrid = true,
  onToggleGrid,
  onSelectGridMm,
  selectedCount = 0,
}: ChamferPortraitCanvasMicroPillProps) {
  const [zoomGridPopoverOpen, setZoomGridPopoverOpen] = useState(false);
  const [planPopoverOpen, setPlanPopoverOpen] = useState(false);
  const parametricStatus = useChamferParametricStatus();

  const dx = temporaryOrigin ? cursor.x - temporaryOrigin.p.x : cursor.x;
  const dy = temporaryOrigin ? cursor.y - temporaryOrigin.p.y : cursor.y;
  const safeZoom = Number.isFinite(zoomPercent) && zoomPercent > 0 ? Math.round(zoomPercent) : 100;

  return (
    <>
      <div
        data-testid="portrait-canvas-micro-pill"
        className="pointer-events-none absolute bottom-2 left-[24px] right-2 z-20 flex items-center select-none"
      >
        {/* Pílula compacta de 24px com pointer-events-auto apenas nos segmentos interativos */}
        <div
          style={{
            height: 24,
            paddingLeft: 8,
            paddingRight: 8,
            borderRadius: 9999,
            backgroundColor: "var(--chamfer-bubble-bg)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
          className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto scrollbar-none border font-mono text-[10px] shadow-md backdrop-blur-md tabular-nums"
        >
          {/* Segmento 1: P01 (troca rápida de folha) */}
          <button
            type="button"
            data-cmd-id="doc.switch_plan"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              setPlanPopoverOpen((v) => !v);
              setZoomGridPopoverOpen(false);
            }}
            title="Toque para alternar ou criar Folha (P01, P02...)"
            style={{ color: "var(--chamfer-accent)" }}
            className="shrink-0 font-bold tracking-wider cursor-pointer"
          >
            {planName}
          </button>

          <span className={cn("h-2.5 w-px shrink-0", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />

          {/* Segmento 2: X / Y ou ⌖ DATUM [X0, Y0] ΔX/ΔY + [ ⟳ Aqui ] [ 0,0 ] */}
          {temporaryOrigin ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="font-bold text-[#F59E0B]">
                ⌖ DATUM [{temporaryOrigin.p.x.toFixed(0)},{temporaryOrigin.p.y.toFixed(0)}]
              </span>
              <span className="tabular-nums">
                ΔX:{(dx >= 0 ? "+" : "") + dx.toFixed(1)} ΔY:{(dy >= 0 ? "+" : "") + dy.toFixed(1)}
              </span>
              {onReanchorDatumHere && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReanchorDatumHere();
                  }}
                  title="Reancorar Datum no último ponto criado (Cotagem Incremental em Cadeia)"
                  className="ml-0.5 rounded bg-sky-500/20 px-1 text-[8.5px] font-bold text-[#38BDF8] hover:bg-sky-500/30 cursor-pointer"
                >
                  ⟳ Aqui
                </button>
              )}
              {onResetDatumZero && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetDatumZero();
                  }}
                  title="Resetar Datum para a origem absoluta (0, 0)"
                  className="rounded bg-amber-500/15 px-1 text-[8.5px] font-bold text-[#FBBF24] hover:bg-amber-500/25 cursor-pointer"
                >
                  0,0
                </button>
              )}
              <button
                type="button"
                data-cmd-id="pre.ref_origin"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTemporaryOrigin();
                }}
                title="Limpar Datum"
                className="rounded px-1 text-[8.5px] font-bold text-[#F87171] hover:bg-red-500/20 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-cmd-id="pre.ref_origin"
              onClick={(e) => {
                e.stopPropagation();
                onSetRefAtCursor();
              }}
              title="Toque para fixar Vetor Datum (ΔXY / ∠) na posição atual"
              className="flex shrink-0 items-center gap-1 tabular-nums hover:opacity-80 cursor-pointer"
            >
              <span className="text-[#94A3B8]">X:</span>
              <strong className="font-semibold">{cursor.x.toFixed(1)}</strong>
              <span className="text-[#94A3B8] ml-0.5">Y:</span>
              <strong className="font-semibold">{cursor.y.toFixed(1)}</strong>
            </button>
          )}

          <span className={cn("h-2.5 w-px shrink-0", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />

          {/* Segmento 3: Z:% · G:mm */}
          <button
            type="button"
            data-cmd-id="grid.settings"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              setZoomGridPopoverOpen((v) => !v);
              setPlanPopoverOpen(false);
            }}
            title="Toque para ajustar Zoom e Passo da Grade"
            className={cn(
              "flex shrink-0 items-center gap-1 tabular-nums transition-colors cursor-pointer",
              zoomGridPopoverOpen
                ? "font-bold text-[#38BDF8]"
                : isDark
                  ? "text-[#94A3B8] hover:text-[#E2E8F0]"
                  : "text-[#475569] hover:text-[#0F172A]",
            )}
          >
            <span>Z:{safeZoom}%</span>
            <span className="opacity-50">·</span>
            <span>G:{showGrid ? `${gridMm}mm` : "OFF"}</span>
          </button>

          <span className={cn("h-2.5 w-px shrink-0", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />

          {/* Segmento Inline: ⏱ Histórico (N) embutido na micro-pílula de status */}
          <button
            type="button"
            data-testid="chamfer-portrait-timeline-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              dispatchChamferParametricPanel("timeline");
            }}
            style={
              parametricStatus.timelineOpen
                ? { color: "var(--chamfer-accent)", fontWeight: 700 }
                : { color: "var(--chamfer-text-secondary)" }
            }
            title="Expandir / Recolher Linha do Tempo Paramétrica e Rollback"
            className="flex shrink-0 items-center gap-0.5 font-bold cursor-pointer"
          >
            <span>⏱</span>
            <span>{parametricStatus.featureCount}</span>
          </button>

          <span className={cn("h-2.5 w-px shrink-0", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />

          {/* Segmento 4: ● SNAP:ON */}
          <button
            type="button"
            data-cmd-id="pre.snap_toggle"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              onToggleSnap();
            }}
            className={cn(
              "flex shrink-0 items-center gap-1 font-bold uppercase tracking-wider transition-colors cursor-pointer",
              snapOn
                ? isDark
                  ? "text-[#38BDF8]"
                  : "text-[#0284C7]"
                : "text-[#94A3B8]",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                snapOn ? "bg-[#0EA5E9]" : "bg-[#64748B]",
              )}
            />
            <span>SNAP:{snapOn ? "ON" : "OFF"}</span>
          </button>

          {selectedCount > 0 && (
            <>
              <span className={cn("h-2.5 w-px shrink-0", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />
              <span className="shrink-0 font-bold text-[#38BDF8]">SEL:{selectedCount}</span>
            </>
          )}
        </div>
      </div>

      {/* PORTAL DE TROCA RÁPIDA DE FOLHA (P01/P02/+) */}
      {planPopoverOpen &&
        plans.length > 0 &&
        renderInBodyPortal(
          <div className="fixed inset-0 z-[60]" onClick={() => setPlanPopoverOpen(false)}>
            <div
              role="dialog"
              aria-label="Seletor rápido de Folha"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "fixed bottom-[154px] left-6 z-[61] flex items-center gap-1.5 rounded-2xl border p-2 font-mono text-[10px] shadow-2xl backdrop-blur-xl",
                isDark
                  ? "border-white/[0.12] bg-[#161922]/98 text-[#F8FAFC]"
                  : "border-[#CBD5E1] bg-white/98 text-[#0F172A]",
              )}
            >
              {plans.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onSelectPlan?.(pl.id);
                    setPlanPopoverOpen(false);
                  }}
                  className={cn(
                    "rounded-lg px-2.5 py-1 font-bold transition-colors cursor-pointer",
                    pl.id === activePlanId
                      ? "bg-[#E11D48] text-white"
                      : isDark
                        ? "bg-[#11141C] text-[#94A3B8] hover:text-white"
                        : "bg-[#F1F5F9] text-[#475569]",
                  )}
                >
                  {pl.name}
                </button>
              ))}
              {onCreatePlan && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onCreatePlan();
                    setPlanPopoverOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2.5 py-1 font-bold cursor-pointer",
                    isDark
                      ? "border-white/[0.1] bg-[#11141C] text-[#F8FAFC]"
                      : "border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A]",
                  )}
                >
                  <Plus className="size-3 text-[#E11D48]" /> Folha
                </button>
              )}
            </div>
          </div>,
        )}

      {/* PORTAL DE ZOOM & GRADE DA MICRO-PÍLULA (z-[60]) */}
      {zoomGridPopoverOpen &&
        renderInBodyPortal(
          <div className="fixed inset-0 z-[60]" onClick={() => setZoomGridPopoverOpen(false)}>
            <div
              role="dialog"
              aria-label="Ajuste rápido de Zoom e Grade"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "fixed bottom-[154px] left-6 z-[61] flex w-64 max-w-[calc(100vw-32px)] flex-col gap-2 rounded-2xl border p-2.5 font-mono text-[10px] shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-1 duration-150",
                isDark
                  ? "border-white/[0.12] bg-[#161922]/98 text-[#F8FAFC]"
                  : "border-[#CBD5E1] bg-white/98 text-[#0F172A]",
              )}
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#38BDF8]">
                  Zoom ({safeZoom}%) & Grade ({showGrid ? `${gridMm}mm` : "OFF"})
                </span>
                <button
                  type="button"
                  onClick={() => setZoomGridPopoverOpen(false)}
                  className="rounded p-0.5 text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onZoomStep?.(0.8);
                  }}
                  className={cn(
                    "rounded-lg border py-1 font-bold transition-colors cursor-pointer",
                    isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0] hover:border-[#38BDF8]/40"
                      : "border-[#CBD5E1] bg-[#F1F5F9] text-[#1E293B]",
                  )}
                >
                  − Zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onResetZoom100?.();
                    setZoomGridPopoverOpen(false);
                  }}
                  className={cn(
                    "rounded-lg border py-1 font-bold transition-colors cursor-pointer",
                    isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#38BDF8] hover:border-[#38BDF8]/40"
                      : "border-[#CBD5E1] bg-[#F1F5F9] text-[#0284C7]",
                  )}
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onZoomStep?.(1.25);
                  }}
                  className={cn(
                    "rounded-lg border py-1 font-bold transition-colors cursor-pointer",
                    isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0] hover:border-[#38BDF8]/40"
                      : "border-[#CBD5E1] bg-[#F1F5F9] text-[#1E293B]",
                  )}
                >
                  + Zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onFitPiece?.();
                    setZoomGridPopoverOpen(false);
                  }}
                  className="rounded-lg border border-[#E11D48]/45 bg-[#E11D48]/18 py-1 font-bold text-[#FB7185] transition-colors cursor-pointer"
                >
                  Fit
                </button>
              </div>

              {onFitWorkspace && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onFitWorkspace();
                    setZoomGridPopoverOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border py-1 font-bold uppercase transition-colors cursor-pointer",
                    isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0] hover:border-[#38BDF8]/40"
                      : "border-[#CBD5E1] bg-[#F1F5F9] text-[#1E293B]",
                  )}
                >
                  <Maximize2 className="size-3 text-[#38BDF8]" />
                  <span>Enquadrar Área de Trabalho</span>
                </button>
              )}

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] text-[#94A3B8]">
                  <span>PASSO DA GRADE (MM)</span>
                  {onToggleGrid && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onToggleGrid();
                      }}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-bold uppercase cursor-pointer",
                        showGrid ? "bg-[#0EA5E9]/20 text-[#38BDF8]" : "bg-white/10 text-[#94A3B8]",
                      )}
                    >
                      {showGrid ? "GRADE: ON" : "GRADE: OFF"}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {[0.5, 1, 2, 5, 10, 25, 50].map((step) => {
                    const active = showGrid && Math.abs(gridMm - step) < 0.01;
                    return (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onSelectGridMm?.(step);
                        }}
                        className={cn(
                          "rounded-md border py-1 text-center text-[9px] font-bold tabular-nums transition-colors cursor-pointer",
                          active
                            ? "border-[#0EA5E9] bg-[#0EA5E9] text-white"
                            : isDark
                              ? "border-white/[0.08] bg-[#11141C] text-[#94A3B8] hover:text-white"
                              : "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
                        )}
                      >
                        {step}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
        )}
    </>
  );
}

/* ============================================================================
 * GAVETA COMPACTA INFERIOR EM MODO RETRATO (45% DVH PADRÃO / 70% DVH EXPANDIDA)
 * ============================================================================ */
export interface ChamferPortraitCompactDrawerProps {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  bottomOffsetPx: number;
  activeTab: ChamferSidebarTab;
  onSelectTab: (tab: ChamferSidebarTab) => void;
  children: React.ReactNode;
}

const PORTRAIT_DRAWER_TABS: Array<{ id: ChamferSidebarTab; label: string }> = [
  { id: "propriedades", label: "Propriedades" },
  { id: "camadas", label: "Camadas" },
  { id: "corte", label: "Corte CNC" },
  { id: "cotas", label: "Cotas" },
  { id: "eng_rev", label: "Eng. Reversa" },
];

export function ChamferPortraitCompactDrawer({
  open,
  onClose,
  isDark,
  bottomOffsetPx,
  activeTab,
  onSelectTab,
  children,
}: ChamferPortraitCompactDrawerProps) {
  const [heightMode, setHeightMode] = useState<PortraitDrawerHeightMode>("compact_45");
  const dragStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setHeightMode("compact_45");
    }
  }, [open]);

  if (!open) return null;

  const dvhValue = resolvePortraitDrawerDvh(open, heightMode);

  const handleDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartYRef.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleDragPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    const deltaY = e.clientY - dragStartYRef.current;
    dragStartYRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    const result = resolvePortraitDrawerDragGesture({
      currentMode: heightMode,
      deltaY,
    });
    if (!result.open) {
      triggerHaptic("selection");
      onClose();
      return;
    }
    if (result.nextMode !== heightMode) {
      triggerHaptic("selection");
      setHeightMode(result.nextMode);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Painel Inspetor do CHAMFER"
      data-testid="portrait-compact-drawer"
      data-drawer-dvh={dvhValue}
      style={{
        bottom: bottomOffsetPx,
        height: `${dvhValue}dvh`,
        maxHeight: `${dvhValue}dvh`,
        backgroundColor: "var(--chamfer-popover-bg)",
        borderColor: "var(--chamfer-border)",
        color: "var(--chamfer-text-primary)",
      }}
      className="fixed inset-x-0 z-50 flex flex-col rounded-t-2xl border-t shadow-2xl backdrop-blur-xl transition-[height,max-height] duration-180 ease-out motion-reduce:transition-none"
    >
      {/* Alça de arraste superior (36px × 4px) + Cabeçalho com alternador 45%/70% e Fechar */}
      <div
        onPointerDown={handleDragPointerDown}
        onPointerUp={handleDragPointerUp}
        style={{ borderColor: "var(--chamfer-border-subtle)" }}
        className="flex shrink-0 flex-col border-b select-none touch-none"
      >
        <div className="flex items-center justify-center pt-1.5 pb-0.5 cursor-ns-resize">
          <span
            style={{ width: 36, height: 4 }}
            className="rounded-full bg-[#64748B]/60"
          />
        </div>

        <div className="flex h-8 items-center justify-between px-3">
          <span
            style={{ color: "var(--chamfer-accent)" }}
            className="font-mono text-[10px] font-bold uppercase tracking-wider"
          >
            {activeTab === "propriedades"
              ? "Propriedades da Peça"
              : activeTab === "camadas"
                ? "Camadas Semânticas"
                : activeTab === "corte"
                  ? "Plano de Corte CNC"
                  : activeTab === "cotas"
                    ? "Cotas & Tolerâncias"
                    : "Engenharia Reversa 1:1"}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setHeightMode((prev) =>
                  prev === "compact_45" ? "expanded_70" : "compact_45",
                );
              }}
              title={
                heightMode === "compact_45"
                  ? "Expandir gaveta para 70% da tela"
                  : "Reduzir gaveta para 45% da tela"
              }
              style={
                heightMode === "expanded_70"
                  ? {
                      backgroundColor: "var(--chamfer-accent-soft)",
                      borderColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent)",
                    }
                  : {
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-secondary)",
                    }
              }
              className="flex h-6 items-center gap-1 rounded-lg border px-2 font-mono text-[9px] font-bold transition-colors cursor-pointer"
            >
              <span>{heightMode === "compact_45" ? "45% ▴" : "70% ▾"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar gaveta"
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-secondary)",
              }}
              className="flex size-6 items-center justify-center rounded-lg border transition-colors cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Barra de Abas Internas da Gaveta (Propriedades | Camadas | Corte CNC | Cotas | Eng. Reversa) */}
        <div className="flex items-center gap-1 overflow-x-auto px-2.5 pb-1.5 scrollbar-none touch-pan-x">
          {PORTRAIT_DRAWER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onSelectTab(tab.id);
                }}
                style={
                  isActive
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        borderColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-secondary)",
                      }
                }
                className="shrink-0 rounded-lg border px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wide transition-colors cursor-pointer"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Corpo rolável da gaveta */}
      <div className="min-h-0 flex-1 overflow-y-auto flex justify-center [&>aside]:!w-full [&>aside]:!border-0">
        {children}
      </div>
    </div>
  );
}

/* ============================================================================
 * ARQUITETURA INFERIOR ESTILO LIGHTROOM MOBILE (NÍVEL 1 SLOT ÚNICO + NÍVEL 2 DOCK)
 * ============================================================================ */
export interface ChamferPortraitBottomBarsProps {
  isDark: boolean;
  stripHeightPx?: number;
  dockHeightPx?: number;
  tool: Tool;
  onPickTool: (tool: Tool) => void;
  activeMode: "2d" | "3d" | "flanges";
  onModeChange: (mode: "2d" | "3d" | "flanges") => void;

  // Seleção e Modificação
  hasSelection: boolean;
  selectedCount: number;
  onSelectAll?: () => void;
  onInvertSelection?: () => void;
  onClearSelection?: () => void;
  onDeleteSelection?: () => void;
  offsetDist: number;
  setOffsetDist: (v: number) => void;
  filletR: number;
  setFilletR: (v: number) => void;
  selectedCornersCount: number;
  onApplyAllSelectionCorners: () => void;

  onMoveSelection: () => void;
  onCopySelection: () => void;
  onRotateSelection: () => void;
  onMirrorSelection: () => void;
  onScaleSelection: () => void;
  onStretchSelection: () => void;
  onBreakSelection: () => void;
  onJoinSelection: () => void;
  onExplodeSelection: () => void;
  onDivideSelection: () => void;
  onCenterSelection: () => void;
  onArrayLinear: () => void;
  onArrayPolar: () => void;
  onOverkillClean: () => void;
  onBoolean2D: (op: "union" | "subtract" | "intersect") => void;
  onCreateHatch: () => void;
  onOpenClipboard: () => void;

  // Array Inline Parameters
  activeArrayType: ArrayType | null;
  onChangeArrayType: (type: ArrayType) => void;
  arrayPolarParams: PolarArrayParams;
  onChangePolarParams: React.Dispatch<React.SetStateAction<PolarArrayParams>>;
  arrayLinearParams: LinearArrayParams;
  onChangeLinearParams: React.Dispatch<React.SetStateAction<LinearArrayParams>>;
  isArrayPickingCenter: boolean;
  onTogglePickArrayCenter: () => void;
  onCommitArray: () => void;
  onCancelArray: () => void;

  // Divide Inline Parameters
  divideEditorOpen: boolean;
  divideParts: number;
  onDividePartsChange: (n: number) => void;
  onConfirmDivide: () => void;
  onCancelDivide: () => void;

  // Precisão & Medição
  snapOn: boolean;
  setSnapOn: (fn: (v: boolean) => boolean) => void;
  snapDivision: number;
  onSetSnapDivision: (n: number) => void;
  showAllSnaps: boolean;
  onToggleShowAllSnaps: () => void;
  interactionGuideMode: "off" | "purple_ref" | "blue_line";
  onSetInteractionGuideMode: (mode: "off" | "purple_ref" | "blue_line") => void;
  onStartSetReferencePoint: () => void;
  temporaryOrigin: { p: Vec2; label: string } | null;
  onClearTemporaryOrigin: () => void;
  onUseSelectedEdge?: () => void;
  guideModeOn?: boolean;
  onToggleGuideMode?: () => void;
  guideEntitiesCount?: number;
  orthoOn: boolean;
  setOrthoOn: (fn: (v: boolean) => boolean) => void;
  trackingOn: boolean;
  setTrackingOn: (fn: (v: boolean) => boolean) => void;
  dimKind: DimKind;
  onPickDimKind: (k: DimKind) => void;
  cursorOffsetMode: CursorOffsetMode;
  onToggleCursorOffsetMode: () => void;
  loupeMode: LoupeHudMode;
  onCycleLoupeMode: () => void;
  nudgeHudVisible: boolean;
  onToggleNudgeHud: () => void;

  // Criação Avançada, Detalhes Mecânicos e Paleta de Cores (COR)
  activeStrokeColor?: string | null;
  onSelectColorAndLayer?: (option: ChamferTechnicalColorOption) => void;
  onAddHole: (diameterMm?: number) => void;
  onAddThread?: (nominalM: number) => void;
  onAddEyelet?: (innerD: number, outerD: number) => void;
  onAddTangentBridge?: () => void;
  onAddSerratedTeeth?: (count: number, pitchMm: number, heightMm: number) => void;
  onAddPocket2D?: (w: number, h: number, r: number) => void;

  // Chapa, Estrutura & Vision
  thickness: number;
  onThicknessChange: (v: number) => void;
  onConvertToBend: () => void;
  onPlanificar: () => void;
  onOpenFlanges: () => void;
  onApplyRelief: () => void;
  onUnfold: () => void;
  onFold: () => void;
  onOpenVisionModal: () => void;
  onOpenRevEngCategory: (category: RevEngCategoryId, wizardStep?: RevEngWizardStep) => void;

  // Inspetor, Camadas & Mesa
  activeLayer: string;
  setActiveLayer: (l: string) => void;
  showGrid: boolean;
  setShowGrid: (fn: (v: boolean) => boolean) => void;
  grid: number;
  setGrid: (v: number) => void;
  frame: WorkspaceFrame;
  onUpdateFrame: (patch: Partial<WorkspaceFrame>) => void;
  onFitWorkspace: () => void;
  onCenterPiece: (moveGeometry: boolean) => void;
  onOpenWorkspaceKeypad: (axis: "w" | "h", screenPos: { x: number; y: number }) => void;
  onOpenPresets: () => void;
  onOpenTechnicalSheet: () => void;
  onOpenTopologyHealth: () => void;
  onOpenVariables: () => void;
  onOpenPieceBuilder: () => void;
  onVerifyGeometry?: () => void;
  onOptimizeGeometry?: () => void;
  showDims?: boolean;
  onToggleShowDims?: () => void;
  simOn: boolean;
  onToggleSim: () => void;
  showArrows: boolean;
  onToggleArrows: () => void;

  // Controle de Bottom Sheet para Painéis Longos (Propriedades, Camadas, Corte, Cotas, Eng. Rev.)
  portraitDrawerOpen: boolean;
  onSetPortraitDrawerOpen: (open: boolean) => void;
  activeSidebarTab: ChamferSidebarTab;
  onSelectSidebarTab: (tab: ChamferSidebarTab) => void;
}

const TOOL_LABELS_PT: Record<string, string> = {
  select: "Ponteiro",
  node: "Nós",
  pan: "Pan",
  line: "Linha",
  polyline: "Polilinha",
  circle: "Círculo",
  rect: "Retângulo",
  arc: "Arco 3P",
  slot: "Rasgo",
  polygon: "Polígono",
  ellipse: "Elipse",
  spline: "Spline",
  construction_line: "Eixo XL",
  point: "Ponto",
  text: "Texto",
  trim: "Aparar",
  smart_trim: "Aparar",
  extend: "Estender",
  offset: "Offset",
  fillet: "Filete R",
  chamfer: "Chanfro",
  divide: "Dividir",
  dim: "Cotar",
  measure: "Medir",
  polar_ref: "Ref. Polar",
  trace_part: "Traçar Peça",
  loft_3d: "Loft 3D",
};

export function ChamferPortraitBottomBars({
  isDark,
  stripHeightPx = 60,
  dockHeightPx = 54,
  tool,
  onPickTool,
  activeMode,
  onModeChange,
  hasSelection,
  selectedCount,
  onSelectAll,
  onInvertSelection,
  onClearSelection,
  onDeleteSelection,
  offsetDist,
  setOffsetDist,
  filletR,
  setFilletR,
  selectedCornersCount,
  onApplyAllSelectionCorners,
  onMoveSelection,
  onCopySelection,
  onRotateSelection,
  onMirrorSelection,
  onScaleSelection,
  onStretchSelection,
  onBreakSelection,
  onJoinSelection,
  onExplodeSelection,
  onDivideSelection,
  onCenterSelection,
  onArrayLinear,
  onArrayPolar,
  onOverkillClean,
  onBoolean2D,
  onCreateHatch,
  onOpenClipboard,
  activeArrayType,
  onChangeArrayType,
  arrayPolarParams,
  onChangePolarParams,
  arrayLinearParams,
  onChangeLinearParams,
  isArrayPickingCenter,
  onTogglePickArrayCenter,
  onCommitArray,
  onCancelArray,
  divideEditorOpen,
  divideParts,
  onDividePartsChange,
  onConfirmDivide,
  onCancelDivide,
  snapOn,
  setSnapOn,
  snapDivision,
  onSetSnapDivision,
  showAllSnaps,
  onToggleShowAllSnaps,
  interactionGuideMode,
  onSetInteractionGuideMode,
  onStartSetReferencePoint,
  temporaryOrigin,
  onClearTemporaryOrigin,
  onUseSelectedEdge,
  guideModeOn = false,
  onToggleGuideMode,
  guideEntitiesCount = 0,
  orthoOn,
  setOrthoOn,
  trackingOn,
  setTrackingOn,
  dimKind,
  onPickDimKind,
  cursorOffsetMode,
  onToggleCursorOffsetMode,
  loupeMode,
  onCycleLoupeMode,
  nudgeHudVisible,
  onToggleNudgeHud,
  activeStrokeColor = null,
  onSelectColorAndLayer,
  onAddHole,
  onAddThread,
  onAddEyelet,
  onAddTangentBridge,
  onAddSerratedTeeth,
  onAddPocket2D,
  thickness,
  onThicknessChange,
  onConvertToBend,
  onPlanificar,
  onOpenFlanges,
  onApplyRelief,
  onUnfold,
  onFold,
  onOpenVisionModal,
  onOpenRevEngCategory,
  activeLayer,
  setActiveLayer,
  showGrid,
  setShowGrid,
  grid,
  setGrid,
  frame,
  onUpdateFrame,
  onFitWorkspace,
  onCenterPiece,
  onOpenPresets,
  onOpenTechnicalSheet,
  onOpenTopologyHealth,
  onOpenVariables,
  onOpenPieceBuilder,
  onVerifyGeometry,
  onOptimizeGeometry,
  showDims,
  onToggleShowDims,
  simOn,
  onToggleSim,
  showArrows,
  onToggleArrows,
  portraitDrawerOpen,
  onSetPortraitDrawerOpen,
  activeSidebarTab,
  onSelectSidebarTab,
}: ChamferPortraitBottomBarsProps) {
  const [dockMode, setDockMode] = useState<PortraitDockMode>("desenho");
  const [inlineSubPanel, setInlineSubPanel] = useState<InlineSubPanelId>("none");
  const [keypadSession, setKeypadSession] = useState<InlineNumericKeypadSession | null>(null);

  // Parâmetros locais para os subpainéis de Detalhes Mecânicos (Furo, Rosca, Olhal, Dentes, Cavidade)
  const [holeDiameterMm, setHoleDiameterMm] = useState<number>(10);
  const [threadNominalM, setThreadNominalM] = useState<number>(8);
  const [eyeletInnerMm, setEyeletInnerMm] = useState<number>(12);
  const [eyeletOuterMm, setEyeletOuterMm] = useState<number>(28);
  const [teethCount, setTeethCount] = useState<number>(8);
  const [teethPitchMm, setTeethPitchMm] = useState<number>(10);
  const [teethHeightMm, setTeethHeightMm] = useState<number>(5);
  const [pocketWidthMm, setPocketWidthMm] = useState<number>(50);
  const [pocketHeightMm, setPocketHeightMm] = useState<number>(30);
  const [pocketRadiusMm, setPocketRadiusMm] = useState<number>(4);

  // Abre a Telinha de Dígitos Própria (Estado D do Slot Único — sem teclado nativo!)
  const handleOpenInlineKeypad = (
    label: string,
    currentValue: number,
    unit: string,
    onCommit: (val: number) => void,
    min?: number,
    max?: number,
  ) => {
    triggerHaptic("tap");
    if (portraitDrawerOpen) {
      onSetPortraitDrawerOpen(false);
    }
    setKeypadSession({
      label,
      unit,
      bufferState: createNumericKeypadBuffer(currentValue, min, max),
      onCommit,
    });
  };

  // Abre subpainel inline (Estado B do Slot Único) fechando eventual gaveta (C) ou telinha (D)
  const handleOpenInlineSubPanel = (panel: InlineSubPanelId) => {
    triggerHaptic("selection");
    setKeypadSession(null);
    if (panel !== "none" && portraitDrawerOpen) {
      onSetPortraitDrawerOpen(false);
    }
    setInlineSubPanel(panel);
  };

  // Abre a Gaveta Compacta (Estado C do Slot Único) fechando subpainel (B) e telinha (D)
  const handleToggleDrawerTab = (tab: ChamferSidebarTab) => {
    triggerHaptic("selection");
    setKeypadSession(null);
    setInlineSubPanel("none");
    if (portraitDrawerOpen && activeSidebarTab === tab) {
      onSetPortraitDrawerOpen(false);
    } else {
      onSelectSidebarTab(tab);
      onSetPortraitDrawerOpen(true);
    }
  };

  const [isSubStripCollapsed, setIsSubStripCollapsed] = useState(false);

  // Fecha sub-painel inline e telinha se trocar de modo principal no Dock Nível 2
  const handleSelectDockMode = (nextMode: PortraitDockMode) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    if (dockMode === nextMode && !hasInlineParams && keypadSession === null) {
      setIsSubStripCollapsed((prev) => !prev);
    } else {
      setDockMode(nextMode);
      setIsSubStripCollapsed(false);
    }
    setInlineSubPanel("none");
    setKeypadSession(null);
  };

  const currentColorLabel =
    activeStrokeColor?.toUpperCase() === "#0F172A"
      ? "Preto"
      : activeStrokeColor?.toUpperCase() === "#F8FAFC"
        ? "Branco"
        : activeLayer === "dobra"
          ? "Dobra"
          : activeLayer === "recorte"
            ? "Recorte"
            : activeLayer === "marcacao"
              ? "Marcação"
              : "Corte";

  const activeColorHex =
    activeStrokeColor ||
    (activeLayer === "dobra"
      ? "#EC4899"
      : activeLayer === "recorte"
        ? "#F59E0B"
        : activeLayer === "marcacao"
          ? "#3B82F6"
          : isDark
            ? "#F8FAFC"
            : "#0F172A");

  // Verifica se a Barra Nível 1 deve entrar em modo de Substituição Contextual Inline (B)
  const isInlineArrayActive = activeArrayType !== null;
  const isInlineDivideActive = divideEditorOpen;
  const isInlineFilletChamfer = tool === "fillet" || tool === "chamfer";
  const isInlineOffset = tool === "offset";
  const hasInlineParams =
    isInlineArrayActive ||
    isInlineDivideActive ||
    isInlineFilletChamfer ||
    isInlineOffset ||
    inlineSubPanel !== "none";

  // Resolve estado único do Slot Contextual (A, B, C ou D)
  const singleSlotResolution = resolveSingleSlotKind({
    keypadOpen: keypadSession !== null,
    drawerOpen: portraitDrawerOpen,
    hasInlineParams,
  });

  const renderLevel1Content = () => {
    /* ESTADO D — TELINHA DE DÍGITOS PRÓPRIA (NUNCA ABRE TECLADO NATIVO DO CELULAR) */
    if (keypadSession !== null) {
      return (
        <ChamferInlineNumericKeypad
          session={keypadSession}
          isDark={isDark}
          onUpdateBuffer={(nextBuf) =>
            setKeypadSession((prev) => (prev ? { ...prev, bufferState: nextBuf } : null))
          }
          onCancel={() => {
            triggerHaptic("tap");
            setKeypadSession(null);
          }}
          onConfirm={() => {
            triggerHaptic("action");
            const finalVal = parseNumericKeypadValue(keypadSession.bufferState);
            keypadSession.onCommit(finalVal);
            setKeypadSession(null);
          }}
        />
      );
    }

    /* 1. SUBSTITUIÇÃO INLINE (B): ARRAY POLAR / LINEAR */
    if (isInlineArrayActive) {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={onCancelArray} isDark={isDark} label="Voltar" />

          <div
            className={cn(
              "flex shrink-0 items-center rounded-lg border p-0.5",
              isDark ? "border-white/[0.08] bg-[#11141C]" : "border-[#CBD5E1] bg-white",
            )}
          >
            <button
              type="button"
              onClick={() => onChangeArrayType("polar")}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase cursor-pointer",
                activeArrayType === "polar"
                  ? "bg-[#E11D48] text-white"
                  : "text-[#94A3B8]",
              )}
            >
              Polar
            </button>
            <button
              type="button"
              onClick={() => onChangeArrayType("linear")}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase cursor-pointer",
                activeArrayType === "linear"
                  ? "bg-[#E11D48] text-white"
                  : "text-[#94A3B8]",
              )}
            >
              Linear
            </button>
          </div>

          {activeArrayType === "polar" ? (
            <>
              <InlineStepperPill
                label="N"
                value={arrayPolarParams.count}
                onStep={(d) =>
                  onChangePolarParams((p) => ({ ...p, count: Math.max(2, Math.min(120, p.count + d)) }))
                }
                isDark={isDark}
              />
              <InlineNumberInputPill
                label="PCD Ø"
                value={Number(((arrayPolarParams.radius || 0) * 2).toFixed(1))}
                unit="mm"
                onOpenKeypad={() =>
                  handleOpenInlineKeypad(
                    "PCD Ø",
                    Number(((arrayPolarParams.radius || 0) * 2).toFixed(1)),
                    "mm",
                    (v) => onChangePolarParams((p) => ({ ...p, radius: Math.max(1, v / 2) })),
                    2,
                    5000,
                  )
                }
                isDark={isDark}
              />
              <InlineNumberInputPill
                label="Âng"
                value={arrayPolarParams.totalAngleDeg}
                unit="°"
                onOpenKeypad={() =>
                  handleOpenInlineKeypad(
                    "Ângulo Total",
                    arrayPolarParams.totalAngleDeg,
                    "°",
                    (v) =>
                      onChangePolarParams((p) => ({
                        ...p,
                        totalAngleDeg: Math.max(5, Math.min(360, v)),
                      })),
                    5,
                    360,
                  )
                }
                isDark={isDark}
              />
              <button
                type="button"
                onClick={onTogglePickArrayCenter}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer",
                  isArrayPickingCenter
                    ? "border-[#F59E0B] bg-[#F59E0B]/20 text-[#FBBF24]"
                    : isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0]"
                      : "border-[#CBD5E1] bg-white text-[#0F172A]",
                )}
              >
                <Crosshair className="size-3.5 text-[#E11D48]" />
                <span>Centro</span>
              </button>
            </>
          ) : (
            <>
              <InlineStepperPill
                label="Col X"
                value={arrayLinearParams.cols}
                onStep={(d) =>
                  onChangeLinearParams((p) => ({ ...p, cols: Math.max(1, Math.min(100, p.cols + d)) }))
                }
                isDark={isDark}
              />
              <InlineNumberInputPill
                label="Passo X"
                value={arrayLinearParams.dx}
                unit="mm"
                onOpenKeypad={() =>
                  handleOpenInlineKeypad(
                    "Passo X",
                    arrayLinearParams.dx,
                    "mm",
                    (v) => onChangeLinearParams((p) => ({ ...p, dx: v })),
                    -5000,
                    5000,
                  )
                }
                isDark={isDark}
              />
              <InlineStepperPill
                label="Lin Y"
                value={arrayLinearParams.rows}
                onStep={(d) =>
                  onChangeLinearParams((p) => ({ ...p, rows: Math.max(1, Math.min(100, p.rows + d)) }))
                }
                isDark={isDark}
              />
              <InlineNumberInputPill
                label="Passo Y"
                value={arrayLinearParams.dy}
                unit="mm"
                onOpenKeypad={() =>
                  handleOpenInlineKeypad(
                    "Passo Y",
                    arrayLinearParams.dy,
                    "mm",
                    (v) => onChangeLinearParams((p) => ({ ...p, dy: v })),
                    -5000,
                    5000,
                  )
                }
                isDark={isDark}
              />
            </>
          )}

          <InlineConfirmButton onClick={onCommitArray} label="Confirmar" />
        </div>
      );
    }

    /* 2. SUBSTITUIÇÃO INLINE (B): DIVIDIR EM PARTES */
    if (isInlineDivideActive) {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={onCancelDivide} isDark={isDark} label="Voltar" />
          <InlineStepperPill
            label="Partes"
            value={divideParts}
            onStep={(d) => onDividePartsChange(Math.max(2, Math.min(64, divideParts + d)))}
            isDark={isDark}
          />
          <InlineNumberInputPill
            label="N"
            value={divideParts}
            unit="p"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Dividir Partes",
                divideParts,
                "p",
                (v) => onDividePartsChange(Math.max(2, Math.min(64, Math.round(v)))),
                2,
                64,
              )
            }
            isDark={isDark}
          />
          {[2, 3, 4, 6, 8, 12].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onDividePartsChange(n)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
                divideParts === n
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {n}p
            </button>
          ))}
          <InlineConfirmButton onClick={onConfirmDivide} label={`Confirmar (${divideParts})`} />
        </div>
      );
    }

    /* 3. SUBSTITUIÇÃO INLINE (B): FILETE R / CHANFRO */
    if (isInlineFilletChamfer) {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton
            onClick={() => onPickTool("select")}
            isDark={isDark}
            label="Voltar"
          />
          <InlineNumberInputPill
            label={tool === "fillet" ? "Raio R" : "Chanfro"}
            value={filletR}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                tool === "fillet" ? "Raio R" : "Chanfro",
                filletR,
                "mm",
                (v) => setFilletR(Math.max(0.5, v)),
                0.5,
                1000,
              )
            }
            isDark={isDark}
          />
          {[2, 5, 10, 15, 20, 30].map((rVal) => (
            <button
              key={rVal}
              type="button"
              onClick={() => setFilletR(rVal)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
                Math.abs(filletR - rVal) < 0.05
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {tool === "fillet" ? `R${rVal}` : `${rVal}mm`}
            </button>
          ))}
          {selectedCornersCount > 0 && (
            <InlineConfirmButton
              onClick={onApplyAllSelectionCorners}
              label={`Aplicar (${selectedCornersCount} cantos)`}
            />
          )}
        </div>
      );
    }

    /* 4. SUBSTITUIÇÃO INLINE (B): OFFSET */
    if (isInlineOffset) {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton
            onClick={() => onPickTool("select")}
            isDark={isDark}
            label="Voltar"
          />
          <InlineNumberInputPill
            label="Offset"
            value={offsetDist}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Distância Offset",
                offsetDist,
                "mm",
                (v) => setOffsetDist(Math.max(0.1, v)),
                0.1,
                5000,
              )
            }
            isDark={isDark}
          />
          {[2, 5, 10, 15, 25, 50].map((dVal) => (
            <button
              key={dVal}
              type="button"
              onClick={() => setOffsetDist(dVal)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
                Math.abs(offsetDist - dVal) < 0.05
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {dVal}mm
            </button>
          ))}
        </div>
      );
    }

    /* 5. SUB-PAINÉIS INLINE (B) ACIONADOS PELO CARROSSEL */
    if (inlineSubPanel === "workspace") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <button
            type="button"
            onClick={() => onUpdateFrame({ visible: !frame.visible })}
            className={cn(
              "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase cursor-pointer",
              frame.visible
                ? "bg-[#E11D48] text-white"
                : isDark
                  ? "bg-[#11141C] text-[#94A3B8]"
                  : "bg-white text-[#475569] border border-[#E2E8F0]",
            )}
          >
            {frame.visible ? "Área: ON" : "Área: OFF"}
          </button>

          <InlineNumberInputPill
            label="X"
            value={Math.round(frame.w)}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Largura X da Área",
                Math.round(frame.w),
                "mm",
                (v) => onUpdateFrame({ w: Math.max(50, Math.round(v)), visible: true }),
                50,
                20000,
              )
            }
            isDark={isDark}
          />

          <InlineNumberInputPill
            label="Y"
            value={Math.round(frame.h)}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Altura Y da Área",
                Math.round(frame.h),
                "mm",
                (v) => onUpdateFrame({ h: Math.max(50, Math.round(v)), visible: true }),
                50,
                20000,
              )
            }
            isDark={isDark}
          />

          {WORKSPACE_INDUSTRIAL_PRESETS.map((pr) => (
            <button
              key={pr.id}
              type="button"
              onClick={() => {
                onUpdateFrame({ w: pr.w, h: pr.h, visible: true });
                setTimeout(() => onFitWorkspace(), 20);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold cursor-pointer",
                Math.round(frame.w) === pr.w && Math.round(frame.h) === pr.h
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {pr.w}×{pr.h}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              onUpdateFrame({ w: frame.h, h: frame.w, visible: true });
              setTimeout(() => onFitWorkspace(), 20);
            }}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 font-mono text-[10px] font-bold cursor-pointer",
              isDark
                ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0]"
                : "border-[#CBD5E1] bg-white text-[#0F172A]",
            )}
          >
            <ArrowLeftRight className="size-3" />
            <span>Inverter X/Y</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdateFrame({ locked: !frame.locked })}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 font-mono text-[10px] font-bold cursor-pointer",
              frame.locked
                ? "border-[#F59E0B] bg-[#F59E0B]/20 text-[#FBBF24]"
                : isDark
                  ? "border-white/[0.08] bg-[#11141C] text-[#94A3B8]"
                  : "border-[#CBD5E1] bg-white text-[#475569]",
            )}
          >
            {frame.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            <span>{frame.locked ? "Travada" : "Livre"}</span>
          </button>

          <InlineConfirmButton
            onClick={() => {
              onFitWorkspace();
              setInlineSubPanel("none");
            }}
            label="Enquadrar"
          />
        </div>
      );
    }

    if (inlineSubPanel === "snap_div") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineNumberInputPill
            label="Div. Snap"
            value={snapDivision}
            unit="p"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Divisão do Snap",
                snapDivision,
                "p",
                (v) => onSetSnapDivision(Math.max(0, Math.min(64, Math.round(v)))),
                0,
                64,
              )
            }
            isDark={isDark}
          />
          {[0, 2, 3, 4, 6, 8, 12, 16].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onSetSnapDivision(n);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
                snapDivision === n || (n === 0 && snapDivision < 2)
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {n === 0 ? "OFF" : `${n}p`}
            </button>
          ))}
        </div>
      );
    }

    if (inlineSubPanel === "grid") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase cursor-pointer",
              showGrid
                ? "bg-[#E11D48] text-white"
                : isDark
                  ? "bg-[#11141C] text-[#94A3B8]"
                  : "bg-white text-[#475569] border border-[#E2E8F0]",
            )}
          >
            {showGrid ? "Grid: ON" : "Grid: OFF"}
          </button>
          <InlineNumberInputPill
            label="Passo"
            value={grid}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Passo da Grade",
                grid,
                "mm",
                (v) => {
                  setGrid(Math.max(0.5, v));
                  setShowGrid(() => true);
                },
                0.5,
                1000,
              )
            }
            isDark={isDark}
          />
          {[1, 2, 5, 10, 20, 25, 50, 100].map((gVal) => (
            <button
              key={gVal}
              type="button"
              onClick={() => {
                setGrid(gVal);
                setShowGrid(() => true);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold cursor-pointer",
                grid === gVal && showGrid
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {gVal}mm
            </button>
          ))}
        </div>
      );
    }

    if (inlineSubPanel === "thickness") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineNumberInputPill
            label="Chapa"
            value={thickness}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Espessura da Chapa",
                thickness,
                "mm",
                (v) => onThicknessChange(Math.max(0.2, Math.min(100, v))),
                0.2,
                100,
              )
            }
            isDark={isDark}
          />
          {[0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 4.75, 6.35, 9.5, 12.7, 15.8, 19.0].map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onThicknessChange(th);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold cursor-pointer",
                Math.abs(thickness - th) < 0.05
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {th}mm
            </button>
          ))}
        </div>
      );
    }

    if (inlineSubPanel === "boolean") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <button
            type="button"
            disabled={selectedCount < 2}
            onClick={() => {
              onBoolean2D("union");
              setInlineSubPanel("none");
            }}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10.5px] font-bold cursor-pointer",
              selectedCount >= 2
                ? "border-[#0EA5E9]/50 bg-[#0EA5E9]/20 text-[#38BDF8]"
                : "opacity-40 cursor-not-allowed border-white/[0.08] text-[#94A3B8]",
            )}
          >
            <Combine className="size-3.5" />
            <span>Unir Regiões (Union)</span>
          </button>
          <button
            type="button"
            disabled={selectedCount < 2}
            onClick={() => {
              onBoolean2D("subtract");
              setInlineSubPanel("none");
            }}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10.5px] font-bold cursor-pointer",
              selectedCount >= 2
                ? "border-[#E11D48]/50 bg-[#E11D48]/20 text-[#FB7185]"
                : "opacity-40 cursor-not-allowed border-white/[0.08] text-[#94A3B8]",
            )}
          >
            <Scissors className="size-3.5" />
            <span>Subtrair (Subtract)</span>
          </button>
          <button
            type="button"
            disabled={selectedCount < 2}
            onClick={() => {
              onBoolean2D("intersect");
              setInlineSubPanel("none");
            }}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10.5px] font-bold cursor-pointer",
              selectedCount >= 2
                ? "border-[#10B981]/50 bg-[#10B981]/20 text-[#34D399]"
                : "opacity-40 cursor-not-allowed border-white/[0.08] text-[#94A3B8]",
            )}
          >
            <Boxes className="size-3.5" />
            <span>Interseção (Intersect)</span>
          </button>
        </div>
      );
    }

    /* SELETOR COMPLETO DE CORES TÉCNICAS E PRETO (#0F172A) + CAMADAS (COR) */
    if (inlineSubPanel === "layer") {
      return (
        <div
          data-testid="chamfer-inline-color-strip"
          className="flex h-full w-full items-center gap-1.5 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap"
        >
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          {CHAMFER_TECHNICAL_PALETTE.map((col) => {
            const isSelected =
              (activeStrokeColor && activeStrokeColor.toUpperCase() === col.hex.toUpperCase()) ||
              (!activeStrokeColor &&
                activeLayer === col.layer &&
                col.id !== "preto_tecnico" &&
                col.id !== "branco_tecnico");
            return (
              <button
                key={col.id}
                type="button"
                data-testid={`strip-color-swatch-${col.id}`}
                data-cmd-id="cor.palette"
                onClick={() => {
                  triggerHaptic("selection");
                  if (onSelectColorAndLayer) {
                    onSelectColorAndLayer(col);
                  } else {
                    setActiveLayer(col.layer);
                  }
                }}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                  isSelected
                    ? "border-[#E11D48] bg-[#E11D48]/20 text-[#E11D48]"
                    : isDark
                      ? "border-white/[0.08] bg-[#11141C] text-[#E2E8F0]"
                      : "border-[#E2E8F0] bg-white text-[#0F172A]",
                )}
              >
                <span
                  className="size-3 rounded-full border border-white/30 shadow-xs"
                  style={{ backgroundColor: col.hex }}
                />
                <span>{col.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => handleToggleDrawerTab("camadas")}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#E11D48] px-2.5 font-mono text-[10px] font-bold text-white cursor-pointer"
          >
            <Layers className="size-3" />
            <span>Camadas</span>
          </button>
        </div>
      );
    }

    /* SUB-PAINEL INLINE: FURO INDUSTRIAL (Ø) */
    if (inlineSubPanel === "hole") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineNumberInputPill
            label="Furo Ø"
            value={holeDiameterMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Diâmetro do Furo Ø",
                holeDiameterMm,
                "mm",
                (v) => setHoleDiameterMm(Math.max(0.5, Math.min(2000, v))),
                0.5,
                2000,
              )
            }
            isDark={isDark}
          />
          {[5, 6, 8, 10, 12, 16, 20, 25].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setHoleDiameterMm(d);
                onAddHole(d);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                Math.abs(holeDiameterMm - d) < 0.05
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              Ø{d}
            </button>
          ))}
          <InlineConfirmButton
            onClick={() => {
              onAddHole(holeDiameterMm);
              setInlineSubPanel("none");
            }}
            label={`Inserir Ø${holeDiameterMm}mm`}
          />
        </div>
      );
    }

    /* SUB-PAINEL INLINE: ROSCA TÉCNICA MÉTRICA (M) */
    if (inlineSubPanel === "thread") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineNumberInputPill
            label="Rosca M"
            value={threadNominalM}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Rosca Métrica M",
                threadNominalM,
                "mm",
                (v) => setThreadNominalM(Math.max(2, Math.min(100, Math.round(v)))),
                2,
                100,
              )
            }
            isDark={isDark}
          />
          {[3, 4, 5, 6, 8, 10, 12, 16, 20].map((mVal) => (
            <button
              key={mVal}
              type="button"
              onClick={() => {
                setThreadNominalM(mVal);
                onAddThread?.(mVal);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                threadNominalM === mVal
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              M{mVal}
            </button>
          ))}
          <InlineConfirmButton
            onClick={() => {
              onAddThread?.(threadNominalM);
              setInlineSubPanel("none");
            }}
            label={`Inserir M${threadNominalM}`}
          />
        </div>
      );
    }

    /* SUB-PAINEL INLINE: OLHAL CONCÊNTRICO */
    if (inlineSubPanel === "eyelet") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineNumberInputPill
            label="Ø Int"
            value={eyeletInnerMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Ø Interno do Olhal",
                eyeletInnerMm,
                "mm",
                (v) => setEyeletInnerMm(Math.max(1, v)),
                1,
                2000,
              )
            }
            isDark={isDark}
          />
          <InlineNumberInputPill
            label="Ø Ext"
            value={eyeletOuterMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Ø Externo do Olhal",
                eyeletOuterMm,
                "mm",
                (v) => setEyeletOuterMm(Math.max(eyeletInnerMm + 2, v)),
                2,
                3000,
              )
            }
            isDark={isDark}
          />
          <InlineConfirmButton
            onClick={() => {
              onAddEyelet?.(eyeletInnerMm, eyeletOuterMm);
              setInlineSubPanel("none");
            }}
            label="Criar Olhal"
          />
        </div>
      );
    }

    /* SUB-PAINEL INLINE: DENTES / SERRILHADO */
    if (inlineSubPanel === "teeth") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineStepperPill
            label="Dentes"
            value={teethCount}
            onStep={(d) => setTeethCount((c) => Math.max(2, Math.min(80, c + d)))}
            isDark={isDark}
          />
          <InlineNumberInputPill
            label="Passo"
            value={teethPitchMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Passo entre Dentes",
                teethPitchMm,
                "mm",
                (v) => setTeethPitchMm(Math.max(1, v)),
                1,
                500,
              )
            }
            isDark={isDark}
          />
          <InlineNumberInputPill
            label="Alt"
            value={teethHeightMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Altura do Dente",
                teethHeightMm,
                "mm",
                (v) => setTeethHeightMm(Math.max(0.5, v)),
                0.5,
                500,
              )
            }
            isDark={isDark}
          />
          <InlineConfirmButton
            onClick={() => {
              onAddSerratedTeeth?.(teethCount, teethPitchMm, teethHeightMm);
              setInlineSubPanel("none");
            }}
            label="Gerar Dentes"
          />
        </div>
      );
    }

    /* SUB-PAINEL INLINE: CAVIDADE 2D (POCKET) */
    if (inlineSubPanel === "pocket") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <InlineNumberInputPill
            label="Larg"
            value={pocketWidthMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Largura da Cavidade",
                pocketWidthMm,
                "mm",
                (v) => setPocketWidthMm(Math.max(4, v)),
                4,
                5000,
              )
            }
            isDark={isDark}
          />
          <InlineNumberInputPill
            label="Alt"
            value={pocketHeightMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Altura da Cavidade",
                pocketHeightMm,
                "mm",
                (v) => setPocketHeightMm(Math.max(4, v)),
                4,
                5000,
              )
            }
            isDark={isDark}
          />
          <InlineNumberInputPill
            label="Raio R"
            value={pocketRadiusMm}
            unit="mm"
            onOpenKeypad={() =>
              handleOpenInlineKeypad(
                "Raio de Canto da Cavidade",
                pocketRadiusMm,
                "mm",
                (v) => setPocketRadiusMm(Math.max(0, v)),
                0,
                1000,
              )
            }
            isDark={isDark}
          />
          <InlineConfirmButton
            onClick={() => {
              onAddPocket2D?.(pocketWidthMm, pocketHeightMm, pocketRadiusMm);
              setInlineSubPanel("none");
            }}
            label="Criar Cavidade"
          />
        </div>
      );
    }

    if (inlineSubPanel === "cotar") {
      const dimChoices: { id: DimKind; label: string }[] = [
        { id: "aligned", label: "Alinhada" },
        { id: "horizontal", label: "Horizontal" },
        { id: "vertical", label: "Vertical" },
        { id: "diameter", label: "Diâmetro Ø" },
        { id: "radius", label: "Raio R" },
        { id: "angle", label: "Ângulo °" },
        { id: "arc", label: "Arco" },
        { id: "chamfer", label: "Chanfro" },
        { id: "chain", label: "Contínua" },
        { id: "baseline", label: "Linha Base" },
      ];
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          {dimChoices.map((dc) => (
            <button
              key={dc.id}
              type="button"
              onClick={() => {
                onPickDimKind(dc.id);
                onPickTool("dim");
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
                tool === "dim" && dimKind === dc.id
                  ? "bg-[#E11D48] text-white"
                  : isDark
                    ? "bg-[#11141C] text-[#94A3B8]"
                    : "bg-white text-[#475569] border border-[#E2E8F0]",
              )}
            >
              {dc.label}
            </button>
          ))}
        </div>
      );
    }

    const activeToolLabel = tool !== "select" ? TOOL_LABELS_PT[tool] ?? tool : null;
    const itemHeightPx = stripHeightPx <= 54 ? 48 : 52;

    /* ESTADO A — CARROSSEL PADRÃO DO MODO ATIVO NO DOCK */
    return (
      <div className="relative flex h-full w-full items-center overflow-hidden">
        {/* Degradê sutil esquerdo (16px) indicando scroll horizontal */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r to-transparent",
            isDark ? "from-[#181C26]" : "from-white",
          )}
        />
        {/* Degradê sutil direito (24px) garantindo peek claro do próximo item */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l to-transparent",
            isDark ? "from-[#181C26]" : "from-white",
          )}
        />

        <div className="flex h-full w-full items-center gap-0.5 overflow-x-auto px-2 scrollbar-none touch-pan-x">
          {/* Chip de Ferramenta Contínua Ativa: permite voltar a Selecionar com 1 toque */}
          {activeToolLabel && (
            <>
              <button
                type="button"
                data-testid="chamfer-active-tool-chip"
                onClick={() => {
                  triggerHaptic("tap");
                  onPickTool("select");
                }}
                title="Toque para encerrar a ferramenta atual e voltar a Selecionar"
                className="flex h-8 shrink-0 items-center gap-1 rounded-xl border border-[#E11D48]/60 bg-[#E11D48]/16 px-2 font-mono text-[9.5px] font-bold text-[#FB7185] transition-colors active:scale-95 cursor-pointer"
              >
                <span>Ativa: {activeToolLabel}</span>
                <X className="size-3 text-[#E11D48]" />
              </button>
              <CarouselDivider isDark={isDark} />
            </>
          )}

          {/* ================================================================
           * MODO 1: DESENHO (SEL | CRI | DET | COR)
           * Organizado para mostrar Seleção + Criação + Cor logo de cara e
           * todos os detalhes mecânicos (Furo, Rosca, Rasgo, Dentes, Cavidade)
           * ================================================================ */}
          {dockMode === "desenho" && (
            <>
              {/* GRUPO SEL */}
              <CarouselToolItem
                cmdId="tool.select"
                icon={MousePointer2}
                label="Ponteiro"
                active={tool === "select"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("select")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.node"
                icon={ControlNodesIcon as unknown as typeof Minus}
                label="Editar Nós"
                active={tool === "node"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("node")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.pan"
                icon={Hand}
                label="Pan"
                active={tool === "pan"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("pan")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              {/* GRUPO CRI (Primitivas & Construção) */}
              <CarouselToolItem
                cmdId="tool.line"
                icon={Minus}
                label="Linha"
                active={tool === "line"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("line")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.rect"
                icon={Square}
                label="Retângulo"
                active={tool === "rect"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("rect")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.circle"
                icon={CircleIcon}
                label="Círculo"
                active={tool === "circle"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("circle")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.arc"
                icon={Compass}
                label="Arco 3P"
                active={tool === "arc"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("arc")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.polyline"
                icon={PenLine}
                label="Polilinha"
                active={tool === "polyline"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("polyline")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.ellipse"
                icon={Egg}
                label="Elipse"
                active={tool === "ellipse"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("ellipse")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.polygon"
                icon={Hexagon}
                label="Polígono"
                active={tool === "polygon"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("polygon")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.spline"
                icon={Sparkles}
                label="Spline"
                active={tool === "spline"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("spline")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="cri.eyelet"
                icon={Disc}
                label="Olhal"
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("eyelet")}
                isDark={isDark}
              />
              {onAddTangentBridge && (
                <CarouselToolItem
                  cmdId="cri.ttr_bridge"
                  icon={Combine}
                  label="Ponte TTR"
                  heightPx={itemHeightPx}
                  onClick={onAddTangentBridge}
                  isDark={isDark}
                />
              )}
              <CarouselToolItem
                cmdId="tool.construction_line"
                icon={Crosshair}
                label="Eixo XL"
                active={tool === "construction_line"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("construction_line")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.freehand"
                icon={PenLine}
                label="Desenho Livre"
                active={tool === "freehand"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("freehand")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.point"
                icon={Dot}
                label="Ponto"
                active={tool === "point"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("point")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.text"
                icon={Type}
                label="Texto / Nota"
                active={tool === "text"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("text")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.trace_part"
                icon={PenLine}
                label="Traçar Peça"
                active={tool === "trace_part"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("trace_part")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              {/* GRUPO DET (Detalhes Mecânicos) */}
              <CarouselToolItem
                cmdId="det.hole"
                icon={CircleDot}
                label="Furo Ø"
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("hole")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.thread"
                icon={Disc}
                label="Rosca M"
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("thread")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="tool.slot"
                icon={Minus}
                label="Rasgo"
                active={tool === "slot"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("slot")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.teeth"
                icon={Activity}
                label="Dentes"
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("teeth")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.pocket"
                icon={Square}
                label="Cavidade"
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("pocket")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.presets"
                icon={Boxes}
                label="Presets"
                heightPx={itemHeightPx}
                onClick={onOpenPresets}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.extrude_3d"
                icon={Box}
                label="Extrude 3D"
                active={activeMode === "3d"}
                heightPx={itemHeightPx}
                onClick={() => onModeChange("3d")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.revolve_3d"
                icon={RotateCw}
                label="Revolve 3D"
                heightPx={itemHeightPx}
                onClick={() => onModeChange("3d")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="det.loft_3d"
                icon={Layers}
                label="Loft 3D"
                active={tool === "loft_3d"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("loft_3d")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              {/* GRUPO COR (Paleta Técnica + Preto #0F172A) */}
              <CarouselToolItem
                cmdId="cor.palette"
                icon={Palette}
                label={`Cor: ${currentColorLabel}`}
                swatchColor={activeColorHex}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("layer")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              {/* UTILITÁRIOS DE SELEÇÃO EM LOTE */}
              {onSelectAll && (
                <CarouselToolItem
                  cmdId="sel.all"
                  icon={Maximize2}
                  label="Sel. Tudo"
                  heightPx={itemHeightPx}
                  onClick={onSelectAll}
                  isDark={isDark}
                />
              )}
              {onInvertSelection && (
                <CarouselToolItem
                  cmdId="sel.invert"
                  icon={ArrowLeftRight}
                  label="Inv. Sel."
                  heightPx={itemHeightPx}
                  onClick={onInvertSelection}
                  isDark={isDark}
                />
              )}
              {hasSelection && onClearSelection && (
                <CarouselToolItem
                  icon={X}
                  label="Limpar Sel."
                  heightPx={itemHeightPx}
                  onClick={onClearSelection}
                  isDark={isDark}
                />
              )}
            </>
          )}

          {/* ================================================================
           * MODO 2: MODIFICAR (MOD | PADRÕES | BOOLEANAS)
           * ================================================================ */}
          {dockMode === "modificar" && (
            <>
              <CarouselToolItem
                cmdId="mod.trim"
                icon={Scissors}
                label="Aparar"
                active={tool === "trim" || tool === "smart_trim"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("trim")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.extend"
                icon={Maximize}
                label="Estender"
                active={tool === "extend"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("extend")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.offset"
                icon={CornerDownRight}
                label="Offset"
                active={tool === "offset"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("offset")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.fillet"
                icon={Sparkles}
                label="Filete R"
                active={tool === "fillet"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("fillet")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.chamfer"
                icon={Sparkles}
                label="Chanfro"
                active={tool === "chamfer"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("chamfer")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.divide"
                icon={Divide}
                label="Dividir N"
                active={tool === "divide" || divideEditorOpen}
                heightPx={itemHeightPx}
                onClick={() => {
                  if (hasSelection) {
                    onDivideSelection();
                  } else {
                    onPickTool("divide");
                  }
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.break"
                icon={Split}
                label="Quebrar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onBreakSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.join"
                icon={Combine}
                label="Unir"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onJoinSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.explode"
                icon={Split}
                label="Explodir"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onExplodeSelection}
                isDark={isDark}
              />
              {onDeleteSelection && (
                <CarouselToolItem
                  cmdId="mod.delete"
                  icon={Trash2}
                  label="Apagar"
                  disabled={!hasSelection}
                  heightPx={itemHeightPx}
                  onClick={onDeleteSelection}
                  isDark={isDark}
                />
              )}

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="mod.move"
                icon={Move}
                label="Mover"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onMoveSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.copy"
                icon={Copy}
                label="Copiar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onCopySelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.clipboard"
                icon={ClipboardList}
                label="Colar/Clip"
                heightPx={itemHeightPx}
                onClick={onOpenClipboard}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.rotate"
                icon={RotateCw}
                label="Girar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onRotateSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.mirror"
                icon={FlipHorizontal}
                label="Espelhar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onMirrorSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.scale"
                icon={Maximize2}
                label="Escalar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onScaleSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.stretch"
                icon={ArrowLeftRight}
                label="Esticar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onStretchSelection}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.center"
                icon={AlignCenter}
                label="Centralizar"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onCenterSelection}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="mod.array_polar"
                icon={RotateCw}
                label="Array Polar"
                active={activeArrayType === "polar"}
                heightPx={itemHeightPx}
                onClick={onArrayPolar}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.array_linear"
                icon={Copy}
                label="Array Linear"
                active={activeArrayType === "linear"}
                heightPx={itemHeightPx}
                onClick={onArrayLinear}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="mod.boolean_2d"
                icon={Combine}
                label="Booleana 2D"
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("boolean")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.hatch"
                icon={Layers}
                label="Hachura"
                disabled={!hasSelection}
                heightPx={itemHeightPx}
                onClick={onCreateHatch}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.loft_3d"
                icon={Boxes}
                label="Loft 3D"
                active={tool === "loft_3d"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("loft_3d")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.overkill"
                icon={Sparkles}
                label="Overkill"
                heightPx={itemHeightPx}
                onClick={onOverkillClean}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="mod.fit_lsq"
                icon={Compass}
                label="Ajuste LSQ"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("contorno_ajuste", "C");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
            </>
          )}

          {/* ================================================================
           * MODO 3: PRECISÃO (PRE | MED | MIRA & LUPA)
           * ================================================================ */}
          {dockMode === "precisao" && (
            <>
              <CarouselToolItem
                cmdId="pre.snap_toggle"
                icon={Magnet}
                label={snapOn ? "Snap: ON" : "Snap: OFF"}
                active={snapOn}
                heightPx={itemHeightPx}
                onClick={() => setSnapOn((s) => !s)}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.snap_division"
                icon={Divide}
                label={snapDivision >= 2 ? `Div. ${snapDivision}p` : "Div. Snap"}
                active={snapDivision >= 2}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("snap_div")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.show_all_snaps"
                icon={Eye}
                label="Ver Snaps"
                active={showAllSnaps}
                heightPx={itemHeightPx}
                onClick={onToggleShowAllSnaps}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.ortho_lock"
                icon={Crosshair}
                label="ORTO ⊥"
                active={orthoOn}
                heightPx={itemHeightPx}
                onClick={() => setOrthoOn((o) => !o)}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.smart_tracking"
                icon={Compass}
                label="Tracking"
                active={trackingOn}
                heightPx={itemHeightPx}
                onClick={() => setTrackingOn((t) => !t)}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.interaction_guides"
                icon={Crosshair}
                label={
                  interactionGuideMode === "blue_line"
                    ? "Vetor Datum"
                    : interactionGuideMode === "purple_ref"
                      ? "Marco / Âncora"
                      : "Datum: OFF"
                }
                active={interactionGuideMode !== "off"}
                heightPx={itemHeightPx}
                onClick={() =>
                  onSetInteractionGuideMode(
                    interactionGuideMode === "blue_line"
                      ? "purple_ref"
                      : interactionGuideMode === "purple_ref"
                        ? "off"
                        : "blue_line",
                  )
                }
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.ref_origin"
                icon={Crosshair}
                label="⌖ Datum"
                active={Boolean(temporaryOrigin)}
                heightPx={itemHeightPx}
                onClick={onStartSetReferencePoint}
                isDark={isDark}
              />
              {temporaryOrigin && (
                <CarouselToolItem
                  icon={X}
                  label="Limpar Datum"
                  heightPx={itemHeightPx}
                  onClick={onClearTemporaryOrigin}
                  isDark={isDark}
                />
              )}
              {onUseSelectedEdge && (
                <CarouselToolItem
                  cmdId="pre.use_edge"
                  icon={Crosshair}
                  label="Ref. Polar"
                  active={tool === "polar_ref"}
                  heightPx={itemHeightPx}
                  onClick={onUseSelectedEdge}
                  isDark={isDark}
                />
              )}
              {onToggleGuideMode && (
                <CarouselToolItem
                  cmdId="pre.guide_mode"
                  icon={Compass}
                  label={guideModeOn ? "Gabarito: ON" : "Gabarito"}
                  active={guideModeOn}
                  heightPx={itemHeightPx}
                  onClick={onToggleGuideMode}
                  isDark={isDark}
                />
              )}
              {(guideModeOn || guideEntitiesCount > 0 || tool === "trace_part") && (
                <CarouselToolItem
                  cmdId="pre.trace_part"
                  icon={PenLine}
                  label="Traçar Peça"
                  active={tool === "trace_part"}
                  heightPx={itemHeightPx}
                  onClick={() => onPickTool("trace_part")}
                  isDark={isDark}
                />
              )}
              <CarouselToolItem
                cmdId="pre.nudge_dpad"
                icon={Sliders}
                label="Ajuste Fino"
                active={nudgeHudVisible}
                heightPx={itemHeightPx}
                onClick={onToggleNudgeHud}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="med.measure"
                icon={Ruler}
                label="Medir"
                active={tool === "measure"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("measure")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="med.cotar"
                icon={Ruler}
                label="Cotar"
                active={tool === "dim"}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("cotar")}
                isDark={isDark}
              />
              <CarouselToolItem
                icon={Disc}
                label="Cota Ø"
                active={tool === "dim" && dimKind === "diameter"}
                heightPx={itemHeightPx}
                onClick={() => {
                  onPickDimKind("diameter");
                  onPickTool("dim");
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                icon={CircleDot}
                label="Cota Raio"
                active={tool === "dim" && dimKind === "radius"}
                heightPx={itemHeightPx}
                onClick={() => {
                  onPickDimKind("radius");
                  onPickTool("dim");
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                icon={Compass}
                label="Cota Âng."
                active={tool === "dim" && dimKind === "angle"}
                heightPx={itemHeightPx}
                onClick={() => {
                  onPickDimKind("angle");
                  onPickTool("dim");
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="grid.settings"
                icon={Grid}
                label={`Grade ${grid}mm`}
                active={showGrid}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("grid")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="pre.cursor_offset"
                icon={Crosshair}
                label={cursorOffsetMode === "offset" ? "Mira 55px" : "Mira 1:1"}
                active={cursorOffsetMode === "offset"}
                heightPx={itemHeightPx}
                onClick={onToggleCursorOffsetMode}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="pre.loupe_hud"
                icon={Eye}
                label={`Lupa: ${loupeMode === "off" ? "OFF" : loupeMode === "pinned" ? "Fixa" : "Auto"}`}
                active={loupeMode !== "off"}
                heightPx={itemHeightPx}
                onClick={onCycleLoupeMode}
                isDark={isDark}
              />
            </>
          )}

          {/* ================================================================
           * MODO 4: CHAPA & 1:1 (CHP & MESA | EST | ENG. REVERSA 1:1 | SAÍDA)
           * ================================================================ */}
          {dockMode === "chapa_vision" && (
            <>
              <CarouselToolItem
                cmdId="chp.thickness"
                icon={Sliders}
                label={`Chapa ${thickness.toFixed(1)}`}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("thickness")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.workspace_area"
                icon={Maximize2}
                label={`Área ${Math.round(frame.w)}×${Math.round(frame.h)}`}
                active={frame.visible}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("workspace")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.flanges"
                icon={Layers}
                label="Flanges"
                active={activeMode === "flanges"}
                heightPx={itemHeightPx}
                onClick={onOpenFlanges}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.convert_bend"
                icon={FoldHorizontal}
                label="Linha Dobra"
                heightPx={itemHeightPx}
                onClick={onConvertToBend}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.corner_relief"
                icon={Sparkles}
                label="Alívio Canto"
                heightPx={itemHeightPx}
                onClick={onApplyRelief}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.flat_pattern"
                icon={ArrowRightLeft}
                label="Planificar"
                heightPx={itemHeightPx}
                onClick={onPlanificar}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.unfold"
                icon={FoldHorizontal}
                label="Desdobrar"
                heightPx={itemHeightPx}
                onClick={onUnfold}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.fold"
                icon={Layers}
                label="Dobrar 3D"
                heightPx={itemHeightPx}
                onClick={onFold}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="chp.loft_3d"
                icon={Boxes}
                label="Loft 3D"
                active={tool === "loft_3d"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("loft_3d")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="est.structural_profile"
                icon={Boxes}
                label="Perfil/Tubo"
                heightPx={itemHeightPx}
                onClick={onOpenPresets}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="est.miter_cut"
                icon={Scissors}
                label="Esquadria 45°"
                active={tool === "chamfer"}
                heightPx={itemHeightPx}
                onClick={() => onPickTool("chamfer")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="est.weld_symbol"
                icon={Flame}
                label="Solda"
                heightPx={itemHeightPx}
                onClick={() => handleToggleDrawerTab("propriedades")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="est.iso_converter"
                icon={Sparkles}
                label="Projeção ISO"
                heightPx={itemHeightPx}
                onClick={onOpenPieceBuilder}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="rev.vision_photo"
                icon={ScanEye}
                label="Vision 1:1"
                heightPx={itemHeightPx}
                onClick={onOpenVisionModal}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.caliper_notebook"
                icon={Ruler}
                label="Calibração 1:1"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("caderno", "B");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.Wizard_reconstruct"
                icon={Compass}
                label="Assistente A→F"
                active={portraitDrawerOpen && activeSidebarTab === "eng_rev"}
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("referencias", "A");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.holes_pcd"
                icon={CircleDot}
                label="Furos & PCD"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("furos_cadeias", "D");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.cavities_teeth"
                icon={Boxes}
                label="Cavidades"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("cavidades_dentes", "E");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.triangulator"
                icon={Compass}
                label="Triangulador"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("furos_cadeias", "D");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.chord_sagitta"
                icon={CircleIcon}
                label="Corda/Flecha"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("contorno_ajuste", "C");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="rev.capture_contour"
                icon={PenLine}
                label="Capt. Contorno"
                heightPx={itemHeightPx}
                onClick={() => {
                  setKeypadSession(null);
                  setInlineSubPanel("none");
                  onOpenRevEngCategory("contorno_ajuste", "C");
                  onSelectSidebarTab("eng_rev");
                  onSetPortraitDrawerOpen(true);
                }}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="out.technical_sheet"
                icon={FileText}
                label="Prancha 2D"
                heightPx={itemHeightPx}
                onClick={onOpenTechnicalSheet}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="out.cnc_sim"
                icon={Activity}
                label="Simular CNC"
                active={simOn}
                heightPx={itemHeightPx}
                onClick={onToggleSim}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="out.cnc_arrows"
                icon={ArrowRightLeft}
                label="Fluxo CNC"
                active={showArrows}
                heightPx={itemHeightPx}
                onClick={onToggleArrows}
                isDark={isDark}
              />
            </>
          )}

          {/* ================================================================
           * MODO 5: INSPETOR (PROPRIEDADES | CAMADAS & COR | COTAS | DIAGNÓSTICO)
           * ================================================================ */}
          {dockMode === "inspetor" && (
            <>
              <CarouselToolItem
                cmdId="insp.properties"
                icon={Sliders}
                label="Propriedades"
                active={portraitDrawerOpen && activeSidebarTab === "propriedades"}
                heightPx={itemHeightPx}
                onClick={() => handleToggleDrawerTab("propriedades")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="insp.layers_drawer"
                icon={Layers}
                label="Camadas"
                active={portraitDrawerOpen && activeSidebarTab === "camadas"}
                heightPx={itemHeightPx}
                onClick={() => handleToggleDrawerTab("camadas")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="insp.active_layer_color"
                icon={Palette}
                label={`Cor: ${currentColorLabel}`}
                swatchColor={activeColorHex}
                heightPx={itemHeightPx}
                onClick={() => handleOpenInlineSubPanel("layer")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="insp.cotas_list"
                icon={Ruler}
                label="Lista Cotas"
                active={portraitDrawerOpen && activeSidebarTab === "cotas"}
                heightPx={itemHeightPx}
                onClick={() => handleToggleDrawerTab("cotas")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="insp.cut_entities_list"
                icon={Scissors}
                label="Entidades/CNC"
                active={portraitDrawerOpen && activeSidebarTab === "corte"}
                heightPx={itemHeightPx}
                onClick={() => handleToggleDrawerTab("corte")}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="insp.rev_eng_drawer"
                icon={Compass}
                label="Painel 1:1"
                active={portraitDrawerOpen && activeSidebarTab === "eng_rev"}
                heightPx={itemHeightPx}
                onClick={() => handleToggleDrawerTab("eng_rev")}
                isDark={isDark}
              />

              <CarouselDivider isDark={isDark} />

              <CarouselToolItem
                cmdId="insp.topology_health"
                icon={Activity}
                label="Topologia"
                heightPx={itemHeightPx}
                onClick={onOpenTopologyHealth}
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="insp.variables"
                icon={Sliders}
                label="Variáveis"
                heightPx={itemHeightPx}
                onClick={onOpenVariables}
                isDark={isDark}
              />
              {onVerifyGeometry && (
                <CarouselToolItem
                  cmdId="insp.verify_geometry"
                  icon={Check}
                  label="Verificar CNC"
                  heightPx={itemHeightPx}
                  onClick={onVerifyGeometry}
                  isDark={isDark}
                />
              )}
              {onOptimizeGeometry && (
                <CarouselToolItem
                  cmdId="insp.optimize_vectors"
                  icon={Sparkles}
                  label="Otimizar"
                  heightPx={itemHeightPx}
                  onClick={onOptimizeGeometry}
                  isDark={isDark}
                />
              )}

              <CarouselDivider isDark={isDark} />

              {onToggleShowDims && (
                <CarouselToolItem
                  cmdId="insp.toggle_support_dims"
                  icon={Ruler}
                  label="Medidas Apoio"
                  active={Boolean(showDims)}
                  heightPx={itemHeightPx}
                  onClick={onToggleShowDims}
                  isDark={isDark}
                />
              )}
              <CarouselToolItem
                cmdId="insp.toggle_workspace_dims"
                icon={Ruler}
                label="Cotas Área"
                active={frame.showDimensions !== false}
                heightPx={itemHeightPx}
                onClick={() =>
                  onUpdateFrame({ showDimensions: frame.showDimensions === false ? true : false })
                }
                isDark={isDark}
              />
              <CarouselToolItem
                cmdId="insp.toggle_workspace_frame"
                icon={Maximize2}
                label="Quadro Área"
                active={frame.visible}
                heightPx={itemHeightPx}
                onClick={() => onUpdateFrame({ visible: !frame.visible })}
                isDark={isDark}
              />
              <CarouselToolItem
                icon={Crosshair}
                label="Enquadrar"
                heightPx={itemHeightPx}
                onClick={() => onCenterPiece(false)}
                isDark={isDark}
              />
              <CarouselToolItem
                icon={Maximize}
                label="Enq. Área"
                heightPx={itemHeightPx}
                onClick={onFitWorkspace}
                isDark={isDark}
              />
            </>
          )}
        </div>
      </div>
    );
  };

  const dockModes: {
    id: PortraitDockMode;
    shortCode: string;
    label: string;
    icon: typeof Minus;
    badgeCount?: number;
  }[] = [
    { id: "desenho", shortCode: "SEL·CRI", label: "Criar", icon: Compass },
    { id: "modificar", shortCode: "MOD", label: "Modificar", icon: Scissors, badgeCount: selectedCount },
    { id: "precisao", shortCode: "PRE·MED", label: "Precisão", icon: Crosshair },
    { id: "chapa_vision", shortCode: "CHP·1:1", label: "Chapa", icon: Layers },
    { id: "inspetor", shortCode: "COR·INSP", label: "Inspetor", icon: Sliders },
  ];

  const showLevel1Strip = !isSubStripCollapsed || hasInlineParams || keypadSession !== null;

  return (
    <section
      aria-label="Controles Inferiores CHAMFER CAD Retrato"
      data-single-slot-state={singleSlotResolution.activeSlot}
      className="relative z-40 flex w-full shrink-0 flex-col select-none"
    >
      {/* BARRA INFERIOR NÍVEL 1 (Slot Contextual Único — recolhível tocando na aba ativa da Doca) */}
      {showLevel1Strip && (
        <div
          data-testid="portrait-contextual-subtools-strip"
          style={{
            height: stripHeightPx,
            backgroundColor: "var(--chamfer-surface-elevated)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
          className="flex w-full shrink-0 items-center border-t backdrop-blur-md transition-colors motion-reduce:transition-none"
        >
          {renderLevel1Content()}
        </div>
      )}

      {/* BARRA INFERIOR NÍVEL 2 (Dock Principal de Categorias — 46px–54px) */}
      <nav
        aria-label="Modos principais CHAMFER CAD"
        style={{
          minHeight: dockHeightPx,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-secondary)",
        }}
        className="grid w-full shrink-0 grid-cols-5 items-center border-t px-1 backdrop-blur-md transition-colors motion-reduce:transition-none"
      >
        {dockModes.map((m) => {
          const Icon = m.icon;
          const isActive = dockMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              data-testid={`portrait-dock-tab-${m.id}`}
              data-cmd-id={`dock.${m.id}`}
              onClick={() => handleSelectDockMode(m.id)}
              style={{ height: dockHeightPx }}
              className="group relative flex w-full flex-col items-center justify-center cursor-pointer touch-manipulation"
            >
              {/* Barra superior de 2px na aba ativa (usa cor de destaque --chamfer-accent) */}
              {isActive && (
                <span
                  style={{ backgroundColor: "var(--chamfer-accent)" }}
                  className="absolute top-0 inset-x-3 h-[2px] rounded-full"
                />
              )}

              <div
                style={{
                  width: 40,
                  height: dockHeightPx <= 50 ? 28 : 32,
                  ...(isActive
                    ? {
                        backgroundColor: "var(--chamfer-accent-soft)",
                        color: "var(--chamfer-accent)",
                      }
                    : {
                        color: "var(--chamfer-text-secondary)",
                      }),
                }}
                className="relative flex items-center justify-center rounded-xl transition-all duration-150"
              >
                <Icon className="size-5" />
                {Boolean(m.badgeCount && m.badgeCount > 0) && (
                  <span
                    style={{
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }}
                    className="absolute -top-0.5 -right-0.5 flex min-w-[14px] h-[14px] items-center justify-center rounded-full px-1 font-mono text-[8.5px] font-bold"
                  >
                    {m.badgeCount}
                  </span>
                )}
              </div>
              <span
                style={{
                  color: isActive ? "var(--chamfer-accent)" : "var(--chamfer-text-secondary)",
                }}
                className="mt-0.5 font-mono text-[10px] font-bold tracking-tight leading-none whitespace-nowrap"
              >
                {m.label}
              </span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}

/* ============================================================================
 * SUBCOMPONENTES DE ITEM DE CARROSSEL, SUBSTITUIÇÃO INLINE E TELINHA NUMÉRICA (D)
 * ============================================================================ */
function CarouselToolItem({
  cmdId,
  icon: Icon,
  label,
  active,
  disabled,
  swatchColor,
  heightPx = 52,
  onClick,
}: {
  cmdId?: string;
  icon: typeof Minus;
  label: string;
  active?: boolean;
  disabled?: boolean;
  swatchColor?: string;
  heightPx?: number;
  onClick: () => void;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      data-cmd-id={cmdId}
      disabled={disabled}
      onClick={() => {
        triggerHaptic("selection");
        onClick();
      }}
      style={{
        minWidth: 60,
        height: heightPx,
        ...(disabled
          ? { borderColor: "transparent" }
          : active
            ? {
                backgroundColor: "var(--chamfer-accent-soft)",
                borderColor: "var(--chamfer-accent-border)",
                color: "var(--chamfer-accent)",
              }
            : {
                borderColor: "transparent",
                color: "var(--chamfer-text-secondary)",
              }),
      }}
      className={cn(
        "relative flex shrink-0 flex-col items-center justify-center rounded-xl px-2 transition-all touch-manipulation cursor-pointer border",
        disabled ? "opacity-35 cursor-not-allowed" : "hover:opacity-95",
      )}
    >
      <div className="relative flex items-center justify-center">
        <Icon
          style={active ? { color: "var(--chamfer-accent)" } : undefined}
          className={cn("size-5 transition-transform", active && "scale-105")}
        />
        {swatchColor && (
          <span
            style={{ backgroundColor: swatchColor }}
            className="absolute -bottom-0.5 -right-1 size-2.5 rounded-full border border-white/40 shadow-xs"
          />
        )}
      </div>
      <span
        style={{
          fontSize: "10.5px",
          color: active ? "var(--chamfer-accent)" : undefined,
        }}
        className={cn(
          "mt-1 font-mono leading-none tracking-tight whitespace-nowrap",
          active ? "font-bold" : "font-medium",
        )}
      >
        {label}
      </span>
      <span
        style={active ? { backgroundColor: "var(--chamfer-accent)" } : undefined}
        className={cn(
          "mt-0.5 size-1 rounded-full transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

function CarouselDivider({ isDark }: { isDark: boolean }) {
  return (
    <div
      style={{ backgroundColor: "var(--chamfer-border)" }}
      className={cn("mx-1 h-6 w-px shrink-0", isDark ? "opacity-60" : "opacity-80")}
    />
  );
}

function InlineBackButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic("tap");
        onClick();
      }}
      style={{
        backgroundColor: "var(--chamfer-bar-bg)",
        borderColor: "var(--chamfer-border)",
        color: "var(--chamfer-text-primary)",
      }}
      className="flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 font-mono text-[10.5px] font-bold transition-colors active:scale-95 cursor-pointer"
    >
      <ArrowLeft style={{ color: "var(--chamfer-accent)" }} className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}

function InlineConfirmButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic("action");
        onClick();
      }}
      style={{
        backgroundColor: "var(--chamfer-accent)",
        color: "var(--chamfer-accent-contrast)",
      }}
      className="flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 font-mono text-[10.5px] font-bold shadow-sm active:scale-95 cursor-pointer"
    >
      <Check className="size-3.5 stroke-[2.5]" />
      <span>{label}</span>
    </button>
  );
}

function InlineStepperPill({
  label,
  value,
  onStep,
  isDark,
}: {
  label: string;
  value: number;
  onStep: (delta: number) => void;
  isDark: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2 font-mono text-[10.5px]",
        isDark ? "border-white/[0.08] bg-[#11141C]" : "border-[#CBD5E1] bg-white",
      )}
    >
      <span className="text-[#94A3B8] font-bold">{label}:</span>
      <button
        type="button"
        onClick={() => {
          triggerHaptic("tap");
          onStep(-1);
        }}
        className="px-1.5 font-bold text-[#94A3B8] hover:text-foreground cursor-pointer"
      >
        −
      </button>
      <span className="min-w-[18px] text-center font-bold text-[#38BDF8] tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => {
          triggerHaptic("tap");
          onStep(1);
        }}
        className="px-1.5 font-bold text-[#94A3B8] hover:text-foreground cursor-pointer"
      >
        +
      </button>
    </div>
  );
}

/**
 * Pílula numérica 100% livre de campo de entrada nativo do navegador:
 * tocar abre a Telinha de Dígitos Própria do CHAMFER (Estado D do Slot Único),
 * evitando que o teclado nativo do celular empurre ou cubra o canvas.
 */
function InlineNumberInputPill({
  label,
  value,
  unit,
  onOpenKeypad,
  isDark,
}: {
  label: string;
  value: number;
  unit: string;
  onOpenKeypad: () => void;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={`chamfer-inline-num-pill-${label}`}
      onClick={onOpenKeypad}
      title={`Editar ${label} (${unit}) na telinha de dígitos do CHAMFER`}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-[10.5px] transition-colors active:scale-95 cursor-pointer",
        isDark
          ? "border-white/[0.12] bg-[#11141C] hover:border-[#E11D48]/50"
          : "border-[#CBD5E1] bg-white hover:border-[#E11D48]/50",
      )}
    >
      <span className="text-[#94A3B8] font-bold">{label}:</span>
      <span
        className={cn(
          "font-mono text-[11px] font-bold tabular-nums underline decoration-[#E11D48]/50 underline-offset-2",
          isDark ? "text-[#F8FAFC]" : "text-[#0F172A]",
        )}
      >
        {value}
      </span>
      <span className="text-[9.5px] text-[#94A3B8]">{unit}</span>
    </button>
  );
}

/**
 * ESTADO D DO SLOT ÚNICO — TELINHA DE DÍGITOS PRÓPRIA COMPACTA DO CHAMFER CAD
 * Nunca dispara o teclado virtual nativo do sistema operacional.
 */
function ChamferInlineNumericKeypad({
  session,
  isDark,
  onUpdateBuffer,
  onCancel,
  onConfirm,
}: {
  session: InlineNumericKeypadSession;
  isDark: boolean;
  onUpdateBuffer: (next: NumericKeypadBufferState) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const digitKeys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "±"] as const;

  const handleStep = (delta: number) => {
    triggerHaptic("tap");
    const current = parseNumericKeypadValue(session.bufferState);
    const nextVal = Number((current + delta).toFixed(2));
    onUpdateBuffer(
      createNumericKeypadBuffer(nextVal, session.bufferState.min, session.bufferState.max),
    );
  };

  return (
    <div
      data-testid="chamfer-inline-numeric-keypad"
      className="relative flex h-full w-full items-center gap-1.5 overflow-x-auto px-2 scrollbar-none touch-pan-x whitespace-nowrap"
    >
      {/* Botão Cancelar */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar edição numérica"
        className={cn(
          "flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2 font-mono text-[10px] font-bold cursor-pointer",
          isDark
            ? "border-white/[0.1] bg-[#11141C] text-[#94A3B8] hover:text-white"
            : "border-[#CBD5E1] bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]",
        )}
      >
        <X className="size-3.5 text-[#E11D48]" />
      </button>

      {/* Visor Digital do Parâmetro */}
      <div
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 font-mono",
          isDark
            ? "border-[#E11D48]/50 bg-[#11141C] text-[#F8FAFC]"
            : "border-[#E11D48]/50 bg-[#FFF1F2] text-[#0F172A]",
        )}
      >
        <span className="text-[9.5px] font-bold uppercase text-[#94A3B8]">{session.label}:</span>
        <span
          data-testid="chamfer-keypad-display"
          className="min-w-[40px] text-right text-[12px] font-bold tabular-nums text-[#E11D48]"
        >
          {session.bufferState.buffer}
        </span>
        <span className="text-[9.5px] font-semibold text-[#94A3B8]">{session.unit}</span>
      </div>

      {/* Teclas de Dígitos (0-9, ., ±) */}
      <div className="flex shrink-0 items-center gap-1">
        {digitKeys.map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`chamfer-keypad-key-${k}`}
            onClick={() => {
              triggerHaptic("tap");
              onUpdateBuffer(applyNumericKeypadKey(session.bufferState, k));
            }}
            className={cn(
              "flex h-9 min-w-[30px] shrink-0 items-center justify-center rounded-lg border px-2 font-mono text-[11.5px] font-bold transition-colors active:scale-95 cursor-pointer",
              isDark
                ? "border-white/[0.08] bg-[#11141C] text-[#F8FAFC] hover:bg-[#222836]"
                : "border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F1F5F9]",
            )}
          >
            {k}
          </button>
        ))}

        {/* Backspace */}
        <button
          type="button"
          data-testid="chamfer-keypad-key-backspace"
          onClick={() => {
            triggerHaptic("tap");
            onUpdateBuffer(applyNumericKeypadKey(session.bufferState, "BACKSPACE"));
          }}
          aria-label="Apagar último dígito"
          className={cn(
            "flex h-9 min-w-[32px] shrink-0 items-center justify-center rounded-lg border px-2 font-mono text-[11px] font-bold cursor-pointer",
            isDark
              ? "border-white/[0.08] bg-[#11141C] text-[#94A3B8] hover:text-white"
              : "border-[#CBD5E1] bg-white text-[#475569] hover:text-[#0F172A]",
          )}
        >
          <Delete className="size-3.5" />
        </button>

        {/* Limpar (C) */}
        <button
          type="button"
          data-testid="chamfer-keypad-key-clear"
          onClick={() => {
            triggerHaptic("tap");
            onUpdateBuffer(applyNumericKeypadKey(session.bufferState, "CLEAR"));
          }}
          className={cn(
            "flex h-9 min-w-[30px] shrink-0 items-center justify-center rounded-lg border px-2 font-mono text-[10px] font-bold cursor-pointer",
            isDark
              ? "border-white/[0.08] bg-[#11141C] text-[#FB7185]"
              : "border-[#CBD5E1] bg-white text-[#E11D48]",
          )}
        >
          C
        </button>
      </div>

      {/* Steppers Rápidos (-1, +1) */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          className={cn(
            "h-9 shrink-0 rounded-lg border px-2 font-mono text-[10px] font-bold cursor-pointer",
            isDark
              ? "border-white/[0.08] bg-[#11141C] text-[#94A3B8]"
              : "border-[#CBD5E1] bg-white text-[#475569]",
          )}
        >
          -1
        </button>
        <button
          type="button"
          onClick={() => handleStep(1)}
          className={cn(
            "h-9 shrink-0 rounded-lg border px-2 font-mono text-[10px] font-bold cursor-pointer",
            isDark
              ? "border-white/[0.08] bg-[#11141C] text-[#94A3B8]"
              : "border-[#CBD5E1] bg-white text-[#475569]",
          )}
        >
          +1
        </button>
      </div>

      {/* Confirmar Valor */}
      <InlineConfirmButton onClick={onConfirm} label="OK" />
    </div>
  );
}
