/**
 * CALDRA CHAMFER — TOOLBAR VERTICAL CAD CANÔNICA (FASE UI/UX DEFINITIVA)
 *
 * Estrutura vertical compacta organizada por função / intenção:
 * 1. SELECIONAR: Ponteiro (V), Caixa de Seleção, Nós/Vértices, Pan (Mover Tela)
 * 2. CRIAR: Linha (L), Polilinha (P), Círculo (C), Arco (A), Retângulo (R),
 *           Polígono, Elipse, Ponto, Texto, Extrude (3D), Revolve (3D)
 * 3. MODIFICAR: Mover, Copiar, Girar, Espelhar, Escalar, Offset, Aparar (Trim),
 *               Estender, Filete, Chanfro, Booleana, Esticar, Quebrar, Unir, Explodir
 * 4. PRECISÃO: Coincidente, Paralelo, Perpendicular, Tangente, Fixar, Dimensão,
 *              Snap Geométrico, Grade, Orto
 * 5. MEDIR: Régua/Distância, Cota Linear, Horizontal, Vertical, Alinhada, Angular,
 *           Raio, Diâmetro, Coordenadas
 * 6. CHAPA: Flange, Dobra, Alívio, Desdobrar, Planificação, Espessura
 * 7. ESTRUTURAS: Perfil Estrutural, Corte em Ângulo, Solda
 * 8. DETALHES: Furo, Rosca, Padrão Linear (Array), Padrão Circular (Array Polar)
 */

import React, { useState, useRef, useEffect } from "react";
import {
  MousePointer2,
  Plus,
  Scissors,
  Crosshair,
  Ruler,
  Layers,
  Boxes,
  CircleDot,
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
  RotateCw,
  Move,
  Copy,
  ClipboardList,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  CornerDownRight,
  Maximize,
  Sparkles,
  Split,
  Combine,
  Divide,
  Grid,
  Magnet,
  Check,
  ChevronRight,
  Hammer,
  FoldHorizontal,
  ArrowRightLeft,
  X,
  Sliders,
  Disc,
  Flame,
  ShieldCheck,
  Pin,
  PinOff,
  AlignCenter,
  Search,
  FileText,
  Activity,
  Zap,
  Hand,
  Eye,
} from "lucide-react";
import type { Tool } from "./Lab2DEditor";
import type { DimKind } from "@/lib/lab2d/dimensions";
import type { CursorOffsetMode, LoupeHudMode } from "@/lib/lab2d/cadInteractionHub";
import type { RevEngCategoryId, RevEngWizardStep } from "@/lib/lab2d/revEngTypes";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";

/** Ícone vetorial minimalista de Nós / Vértices Interligados para o Micro-Dock */
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

export type CadCategory =
  | "none"
  | "selecionar"
  | "criar"
  | "modificar"
  | "precisao"
  | "medir"
  | "chapa"
  | "estruturas"
  | "detalhes";

interface ChamferCadToolbarProps {
  tool: Tool;
  onPickTool: (tool: Tool) => void;
  activeMode: "2d" | "3d" | "flanges";
  onModeChange: (mode: "2d" | "3d" | "flanges") => void;

  // Seleção e Modificação
  hasSelection: boolean;
  selectedCount: number;
  offsetDist: number;
  setOffsetDist: (v: number) => void;
  filletR: number;
  setFilletR: (v: number) => void;

  onMoveSelection: () => void;
  onCopySelection: () => void;
  onRotateSelection: () => void;
  onMirrorSelection: () => void;
  onScaleSelection: () => void;
  onStretchSelection: () => void;
  onBreakSelection: () => void;
  onJoinSelection: () => void;
  onExplodeSelection: () => void;
  onDivideSelection?: () => void;
  onCenterSelection?: () => void;
  onArrayLinear: () => void;
  onArrayPolar: () => void;

  // Novos comandos e ferramentas profissionais
  onOpenQuickCommand?: () => void;
  onOpenTopologyHealth?: () => void;
  onOpenPresets?: () => void;
  onOpenTechnicalSheet?: () => void;
  onOpenVariables?: () => void;
  onOpenClipboard?: () => void;

  // Precisão e Modificadores Modulares (CADInteractionHub - Seção 4)
  snapOn: boolean;
  setSnapOn: (fn: (v: boolean) => boolean) => void;
  showGrid: boolean;
  setShowGrid: (fn: (v: boolean) => boolean) => void;
  grid: number;
  setGrid: (v: number) => void;
  orthoOn: boolean;
  setOrthoOn: (fn: (v: boolean) => boolean) => void;
  trackingOn: boolean;
  setTrackingOn: (fn: (v: boolean) => boolean) => void;
  cursorOffsetMode?: CursorOffsetMode;
  onToggleCursorOffsetMode?: () => void;
  loupeMode?: LoupeHudMode;
  onCycleLoupeMode?: () => void;
  nudgeHudVisible?: boolean;
  onToggleNudgeHud?: () => void;

  // Divisão do Snap, Guias de Interação Exclusivas e Visualização Global (Upgrade PRE)
  snapDivision?: number;
  onSetSnapDivision?: (n: number) => void;
  showAllSnaps?: boolean;
  onToggleShowAllSnaps?: () => void;
  interactionGuideMode?: "off" | "purple_ref" | "blue_line";
  onSetInteractionGuideMode?: (mode: "off" | "purple_ref" | "blue_line") => void;
  onStartSetReferencePoint?: () => void;
  temporaryOrigin?: { p: { x: number; y: number }; label: string } | null;
  onClearTemporaryOrigin?: () => void;

  // Medição e Cotas
  dimKind: DimKind;
  onPickDimKind: (k: DimKind) => void;

  // Chapa Metálica
  thickness: number;
  onThicknessChange: (v: number) => void;
  onConvertToBend: () => void;
  onAddHole: () => void;
  onPlanificar: () => void;
  onOpenFlanges: () => void;
  onApplyRelief: () => void;
  onUnfold: () => void;
  onFold: () => void;

  // Modo Isométrico 2D
  drawingProjection?: "orthographic" | "isometric";
  onToggleDrawingProjection?: () => void;
  isoPlane?: "top" | "left" | "right";
  onSelectIsoPlane?: (plane: "top" | "left" | "right") => void;
  onOpenPieceBuilder?: () => void;

  activeLayer?: string;
  setActiveLayer?: (l: string) => void;
  onDeactivateOrbitTool?: () => void;

  // Comandos Unificados CADCraft -> CHAMFER CAD
  onOverkillClean?: () => void;
  onBoolean2D?: (op: "union" | "subtract" | "intersect") => void;
  onCreateHatch?: () => void;
  onSetRefZero?: () => void;
  onOpenRevEngCategory?: (category: RevEngCategoryId, wizardStep?: RevEngWizardStep) => void;

  className?: string;
  isDark?: boolean;
}

export function ChamferCadToolbar({
  tool,
  onPickTool,
  activeMode,
  onModeChange,
  hasSelection,
  selectedCount,
  offsetDist,
  setOffsetDist,
  filletR,
  setFilletR,
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
  onOpenQuickCommand,
  onOpenTopologyHealth,
  onOpenPresets,
  onOpenTechnicalSheet,
  onOpenVariables,
  onOpenClipboard,
  snapOn,
  setSnapOn,
  showGrid,
  setShowGrid,
  grid,
  setGrid,
  orthoOn,
  setOrthoOn,
  trackingOn,
  setTrackingOn,
  cursorOffsetMode = "offset",
  onToggleCursorOffsetMode,
  loupeMode = "floating",
  onCycleLoupeMode,
  nudgeHudVisible = false,
  onToggleNudgeHud,
  snapDivision = 0,
  onSetSnapDivision,
  showAllSnaps = false,
  onToggleShowAllSnaps,
  interactionGuideMode = "blue_line",
  onSetInteractionGuideMode,
  onStartSetReferencePoint,
  temporaryOrigin,
  onClearTemporaryOrigin,
  dimKind,
  onPickDimKind,
  thickness,
  onThicknessChange,
  onConvertToBend,
  onAddHole,
  onPlanificar,
  onOpenFlanges,
  onApplyRelief,
  onUnfold,
  onFold,
  activeLayer = "corte",
  setActiveLayer,
  onDeactivateOrbitTool,
  drawingProjection = "orthographic",
  onToggleDrawingProjection,
  isoPlane = "top",
  onSelectIsoPlane,
  onOpenPieceBuilder,
  onOverkillClean,
  onBoolean2D,
  onCreateHatch,
  onSetRefZero,
  onOpenRevEngCategory,
  className,
  isDark = true,
}: ChamferCadToolbarProps) {
  const [openCat, setOpenCat] = useState<CadCategory>("none");
  const [isPinned, setIsPinned] = useState(false);
  const [lastUsedTool, setLastUsedTool] = useState<Record<CadCategory, string>>({
    selecionar: "select",
    criar: "line",
    modificar: "offset",
    precisao: "snap",
    medir: "measure",
    chapa: "flanges",
    estruturas: "profile",
    detalhes: "hole",
    none: "",
  });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Controle de Swipe Vertical para Mouse (toque utiliza touch-pan-y nativo a 120Hz)
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const isPointerDown = useRef(false);
  const isDragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Apenas captura arraste sintético se for mouse; toque móvel usa pan-y nativo
    if (e.pointerType !== "mouse") return;
    isPointerDown.current = true;
    isDragging.current = false;
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = scrollContainerRef.current?.scrollTop || 0;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current) return;
    const dy = e.clientY - dragStartY.current;
    if (Math.abs(dy) > 12) {
      isDragging.current = true;
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = dragStartScrollTop.current - dy;
    }
  };

  const handlePointerUp = () => {
    isPointerDown.current = false;
    setTimeout(() => {
      isDragging.current = false;
    }, 50);
  };

  const getFlyoutPosition = (cat: CadCategory): React.CSSProperties => {
    if (cat === "estruturas" || cat === "detalhes" || cat === "chapa") {
      return { bottom: "4px" };
    }
    if (cat === "selecionar" || cat === "criar") {
      return { top: "4px" };
    }
    return { top: "18%" };
  };

  // Fecha flyout / Micro-Dock ao tocar fora no canvas (Micro-Dock 'selecionar' fecha sempre)
  useEffect(() => {
    if (openCat === "none") return;
    function handlePointerOutside(e: PointerEvent | MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        if (openCat === "selecionar" || !isPinned) {
          setOpenCat("none");
        }
      }
    }
    document.addEventListener("pointerdown", handlePointerOutside, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerOutside);
  }, [isPinned, openCat]);

  const handleToggleCat = (cat: CadCategory) => {
    triggerHaptic("tap");
    onDeactivateOrbitTool?.();
    if (
      activeMode === "3d" &&
      (cat === "criar" ||
        cat === "modificar" ||
        cat === "precisao" ||
        cat === "medir" ||
        cat === "chapa" ||
        cat === "estruturas" ||
        cat === "detalhes")
    ) {
      setOpenCat("none");
      AudioManager.play("ui_toggle_open");
      window.dispatchEvent(
        new CustomEvent("chamfer-3d-open-category", {
          detail: { category: cat === "precisao" ? "esboco" : cat },
        }),
      );
      return;
    }
    setOpenCat((prev) => {
      const next = prev === cat ? "none" : cat;
      AudioManager.play(next === "none" ? "ui_toggle_close" : "ui_toggle_open");
      return next;
    });
  };

  const handleSelectTool = (t: Tool, catId?: CadCategory) => {
    triggerHaptic("selection");
    onDeactivateOrbitTool?.();
    onPickTool(t);
    if (catId) {
      setLastUsedTool((prev) => ({ ...prev, [catId]: t }));
    }
    // Micro-Dock de seleção recolhe SEMPRE imediatamente após o toque (200ms)
    if (catId === "selecionar" || !isPinned) {
      setOpenCat("none");
    }
  };

  // Identifica categoria da ferramenta ativa
  const isCatActive = (cat: CadCategory): boolean => {
    switch (cat) {
      case "selecionar":
        return tool === "select" || tool === "node" || tool === "pan";
      case "criar":
        return (
          tool === "line" ||
          tool === "construction_line" ||
          tool === "polyline" ||
          tool === "circle" ||
          tool === "arc" ||
          tool === "rect" ||
          tool === "rrect" ||
          tool === "polygon" ||
          tool === "ellipse" ||
          tool === "spline" ||
          tool === "slot" ||
          tool === "point" ||
          tool === "text"
        );
      case "modificar":
        return (
          tool === "offset" ||
          tool === "trim" ||
          tool === "extend" ||
          tool === "fillet" ||
          tool === "chamfer" ||
          tool === "divide"
        );
      case "precisao":
        return snapOn || orthoOn;
      case "medir":
        return tool === "measure" || tool === "dim";
      case "chapa":
        return activeMode === "flanges";
      default:
        return false;
    }
  };

  // Ícone dinâmico do botão SEL refletindo o submodo ativo (Ponteiro, Nós ou Pan)
  const selButtonIcon =
    tool === "pan" ? Hand : tool === "node" ? ControlNodesIcon : MousePointer2;

  // 8 Categorias Canônicas
  const categories = [
    {
      id: "selecionar" as const,
      label: "Selecionar",
      short: "SEL",
      icon: selButtonIcon,
      desc: "Ponteiro, vértices e navegação",
    },
    {
      id: "criar" as const,
      label: "Criar",
      short: "CRI",
      icon: Plus,
      desc: "Linha, círculo, arco, retângulo, 3D",
    },
    {
      id: "modificar" as const,
      label: "Modificar",
      short: "MOD",
      icon: Scissors,
      desc: "Área de Transferência, mover, girar, aparar, espelhar, offset",
    },
    {
      id: "precisao" as const,
      label: "Precisão",
      short: "PRE",
      icon: Crosshair,
      desc: "Snap, restrições, orto e grade",
    },
    {
      id: "medir" as const,
      label: "Medir",
      short: "MED",
      icon: Ruler,
      desc: "Régua, cotas lineares, ângulos e raios",
    },
    {
      id: "chapa" as const,
      label: "Chapa",
      short: "CHP",
      icon: Layers,
      desc: "Flange, dobras, alívios e planificação",
    },
    {
      id: "estruturas" as const,
      label: "Estruturas",
      short: "EST",
      icon: Boxes,
      desc: "Perfis, esquadrias e soldas",
    },
    {
      id: "detalhes" as const,
      label: "Detalhes",
      short: "DET",
      icon: CircleDot,
      desc: "Furos, roscas e padrões linear/circular",
    },
  ];

  const activeCategoryData = categories.find((c) => c.id === openCat);

  return (
    <aside
      ref={toolbarRef}
      aria-label="Barra de ferramentas CAD"
      style={{
        backgroundColor: "var(--chamfer-bar-bg)",
        borderColor: "var(--chamfer-border)",
        color: "var(--chamfer-text-secondary)",
      }}
      className={cn(
        "relative flex h-full max-h-full w-11 sm:w-12 shrink-0 flex-col items-center rounded-2xl border p-1 shadow-xl backdrop-blur-md select-none z-40 transition-colors",
        className,
      )}
    >
      {/* 8 BOTÕES PRINCIPAIS DE FUNÇÃO — ROLÁVEL POR SWIPE VERTICAL / TOUCH / POINTER */}
      <div
        ref={scrollContainerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex-1 w-full overflow-y-auto overscroll-contain touch-pan-y scrollbar-none py-1 flex flex-col items-center gap-1.5"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
      >
        {categories.map((cat) => {
          const Icon = cat.icon;
          const active = isCatActive(cat.id);
          const isOpen = openCat === cat.id;

          return (
            <div key={cat.id} className="relative w-full shrink-0 flex items-center justify-center">
              <button
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && e.button !== 0) return;
                }}
                onClick={(e) => {
                  if (isDragging.current) {
                    e.stopPropagation();
                    return;
                  }
                  triggerHaptic("selection");
                  AudioManager.play("ui_select");
                  handleToggleCat(cat.id);
                }}
                title={`${cat.label} — ${cat.desc}`}
                aria-label={cat.label}
                style={
                  isOpen
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                        borderColor: "var(--chamfer-accent)",
                      }
                    : active
                      ? {
                          backgroundColor: "var(--chamfer-accent-soft)",
                          borderColor: "var(--chamfer-accent-border)",
                          color: "var(--chamfer-accent)",
                        }
                      : {
                          borderColor: "transparent",
                          color: "var(--chamfer-text-secondary)",
                        }
                }
                className={cn(
                  "group relative flex min-h-[40px] size-10 w-full flex-col items-center justify-center rounded-xl border transition-all touch-manipulation cursor-pointer",
                  isOpen && "shadow-md scale-[1.02]",
                )}
              >
                <Icon className="size-4 transition-transform group-hover:scale-110" />
                <span className="text-[7.5px] font-mono font-bold tracking-wider mt-0.5 leading-none uppercase">
                  {cat.short}
                </span>

                {/* Indicador de ferramenta ativa no grupo */}
                {active && !isOpen && (
                  <span
                    style={{ backgroundColor: "var(--chamfer-accent)" }}
                    className="absolute top-1 right-1 size-1.5 rounded-full shadow-xs animate-pulse"
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* SELETOR RÁPIDO DE CAMADA ATIVA (CORTE, DOBRA, RECORTE, MARCAÇÃO) */}
      {setActiveLayer && (
        <div
          style={{ borderColor: "var(--chamfer-border)" }}
          className="w-full pt-1 border-t flex flex-col items-center shrink-0"
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              const order = ["corte", "dobra", "recorte", "marcacao"];
              const curIdx = order.indexOf(activeLayer ?? "corte");
              const next = order[(curIdx + 1) % order.length] ?? "corte";
              setActiveLayer(next);
            }}
            title={`Camada ativa: ${activeLayer}. Toque para alternar (Corte, Dobra, Recorte, Marcação).`}
            aria-label={`Camada ativa: ${activeLayer}`}
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-secondary)",
            }}
            className="group relative flex size-9 w-full flex-col items-center justify-center rounded-xl transition-all border cursor-pointer"
          >
            <span
              className="size-3 rounded-full border border-slate-500/50 shadow-2xs transition-transform group-hover:scale-110"
              style={{
                backgroundColor:
                  activeLayer === "dobra"
                    ? "#EC4899"
                    : activeLayer === "recorte"
                      ? "#F59E0B"
                      : activeLayer === "marcacao"
                        ? "#3B82F6"
                        : isDark
                          ? "#F3F4F6"
                          : "#111827",
              }}
            />
            <span className="text-[7px] font-mono font-bold tracking-wider mt-0.5 leading-none uppercase">
              {activeLayer === "dobra"
                ? "DOB"
                : activeLayer === "recorte"
                  ? "REC"
                  : activeLayer === "marcacao"
                    ? "MAR"
                    : "COR"}
            </span>
          </button>
        </div>
      )}

      {/* 1. MICRO-DOCK RETRÁTIL ACOPLADO AO BOTÃO 'SEL' (LARGURA ZERO QUANDO FECHADO, 200ms) */}
      <div
        role="toolbar"
        aria-label="Modos de seleção e navegação"
        aria-hidden={openCat !== "selecionar"}
        style={{
          top: "6px",
          left: "calc(100% + 6px)",
          height: "38px",
          borderRadius: "9999px",
          padding: openCat === "selecionar" ? "2px 6px" : "2px 0px",
          maxWidth: openCat === "selecionar" ? "116px" : "0px",
          opacity: openCat === "selecionar" ? 1 : 0,
          transform:
            openCat === "selecionar"
              ? "translateX(0) scale(1)"
              : "translateX(-6px) scale(0.92)",
          pointerEvents: openCat === "selecionar" ? "auto" : "none",
          transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          backgroundColor: "var(--chamfer-popover-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-primary)",
        }}
        className={cn(
          "absolute z-50 flex items-center gap-1 overflow-hidden shadow-lg select-none",
          openCat === "selecionar" ? "border" : "border-0",
        )}
      >
        {/* 1. Ponteiro (Seleção Geral + Fusão Gestual de Vértices) */}
        <button
          type="button"
          tabIndex={openCat === "selecionar" ? 0 : -1}
          aria-label="Ponteiro (Seleção Geral)"
          title="Ponteiro (Seleção Geral e Vértices Diretos)"
          onClick={() => handleSelectTool("select", "selecionar")}
          style={
            tool === "select"
              ? {
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }
              : { color: "var(--chamfer-text-secondary)" }
          }
          className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer touch-manipulation"
        >
          <MousePointer2 className="size-3.5" />
        </button>

        {/* 2. Nós (Vértices Isolados) */}
        <button
          type="button"
          tabIndex={openCat === "selecionar" ? 0 : -1}
          aria-label="Nós (Vértices Isolados)"
          title="Nós (Vértices Isolados)"
          onClick={() => handleSelectTool("node", "selecionar")}
          style={
            tool === "node"
              ? {
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }
              : { color: "var(--chamfer-text-secondary)" }
          }
          className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer touch-manipulation"
        >
          <ControlNodesIcon className="size-3.5" />
        </button>

        {/* 3. Pan (Mover Prancheta 1 Dedo) */}
        <button
          type="button"
          tabIndex={openCat === "selecionar" ? 0 : -1}
          aria-label="Pan (Mover Prancheta)"
          title="Pan (Mover Prancheta com 1 Dedo)"
          onClick={() => handleSelectTool("pan", "selecionar")}
          style={
            tool === "pan"
              ? {
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }
              : { color: "var(--chamfer-text-secondary)" }
          }
          className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer touch-manipulation"
        >
          <Hand className="size-3.5" />
        </button>
      </div>

      {/* FLYOUT CONTEXTUAL FLUTUANTE PARA AS DEMAIS CATEGORIAS (EXCETO 'selecionar') */}
      {openCat !== "none" && openCat !== "selecionar" && activeCategoryData && (
        <div
          className="absolute left-full ml-1.5 sm:ml-2 z-50 w-64 max-w-[calc(100vw-60px)] sm:max-w-[92vw] rounded-2xl border p-2 shadow-2xl backdrop-blur-lg animate-in fade-in zoom-in-95 duration-150 overflow-y-auto"
          style={{
            ...getFlyoutPosition(openCat),
            maxHeight: "calc(100% - 8px)",
            backgroundColor: "var(--chamfer-popover-bg)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
        >
          {/* CABEÇALHO DO FLYOUT */}
          <div
            style={{ borderColor: "var(--chamfer-border-subtle)" }}
            className="flex items-center justify-between border-b pb-1.5 mb-1.5"
          >
            <div className="flex items-center gap-1.5">
              <activeCategoryData.icon
                style={{ color: "var(--chamfer-accent)" }}
                className="size-3.5"
              />
              <span
                style={{ color: "var(--chamfer-text-primary)" }}
                className="font-mono text-xs font-bold uppercase tracking-wide"
              >
                {activeCategoryData.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  setIsPinned((p) => !p);
                }}
                style={
                  isPinned
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : { color: "var(--chamfer-text-secondary)" }
                }
                className="size-5 rounded-md grid place-items-center transition-colors cursor-pointer"
                title={
                  isPinned
                    ? "Menu fixado (clique para recolher automaticamente)"
                    : "Fixar menu aberto"
                }
              >
                {isPinned ? <Pin className="size-3" /> : <PinOff className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => setOpenCat("none")}
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="size-5 rounded-md grid place-items-center transition-colors cursor-pointer"
                title="Fechar menu"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

                {/* 2. GRUPO: CRIAR */}
                {openCat === "criar" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Linha"
                      keyLabel="L"
                      icon={Minus}
                      active={tool === "line"}
                      onClick={() => handleSelectTool("line", "criar")}
                      desc="Segmento de reta com entrada dinâmica (L, ∠)"
                    />
                    <FlyoutItem
                      label="Linha de Construção (Eixo)"
                      keyLabel="XL"
                      icon={Crosshair}
                      active={tool === "construction_line"}
                      onClick={() => handleSelectTool("construction_line", "criar")}
                      desc="Eixo infinito de centro ou referência projetada"
                    />
                    <FlyoutItem
                      label="Polilinha (Linha ↔ Arco)"
                      keyLabel="P"
                      icon={PenLine}
                      active={tool === "polyline"}
                      onClick={() => handleSelectTool("polyline", "criar")}
                      desc="Contorno contínuo alternando retas e arcos tangentes"
                    />
                    <FlyoutItem
                      label="Círculo (Centro / 2P / 3P / TTR)"
                      keyLabel="C"
                      icon={CircleIcon}
                      active={tool === "circle"}
                      onClick={() => handleSelectTool("circle", "criar")}
                      desc="Centro-Raio, Diâmetro, 2P, 3P ou Tangente-Tangente-R"
                    />
                    <FlyoutItem
                      label="Arco 3 Pontos"
                      keyLabel="A"
                      icon={Compass}
                      active={tool === "arc"}
                      onClick={() => handleSelectTool("arc", "criar")}
                      desc="Início, meio e fim de curvatura (≥128 seg)"
                    />
                    <FlyoutItem
                      label="Retângulo (2 Cantos / Centro / 3P)"
                      keyLabel="R"
                      icon={Square}
                      active={tool === "rect"}
                      onClick={() => handleSelectTool("rect", "criar")}
                      desc="2 cantos, pelo centro ou inclinado por 3 pontos"
                    />
                    <FlyoutItem
                      label="Polígono / Sextavado (S mm)"
                      icon={Hexagon}
                      active={tool === "polygon"}
                      onClick={() => handleSelectTool("polygon", "criar")}
                      desc="Inscrito, circunscrito ou medida entre faces S (mm)"
                    />
                    <FlyoutItem
                      label="Rasgo Oblongo (Slot Reto / Curvo)"
                      keyLabel="SL"
                      icon={Minus}
                      active={tool === "slot"}
                      onClick={() => handleSelectTool("slot", "criar")}
                      desc="Slot mecânico centro-a-centro, total ou em arco"
                    />
                    <FlyoutItem
                      label="Elipse Analítica"
                      icon={Egg}
                      active={tool === "ellipse"}
                      onClick={() => handleSelectTool("ellipse", "criar")}
                      desc="Centro e semieixos Rx/Ry (≥128 segmentos)"
                    />
                    <FlyoutItem
                      label="Spline Suave (Curva)"
                      keyLabel="SPL"
                      icon={Sparkles}
                      active={tool === "spline"}
                      onClick={() => handleSelectTool("spline", "criar")}
                      desc="Curva interpolada suave com ≥128 segmentos"
                    />
                    <FlyoutItem
                      label="Ponto de Apoio"
                      icon={Dot}
                      active={tool === "point"}
                      onClick={() => handleSelectTool("point", "criar")}
                      desc="Referência de coordenadas CAD"
                    />
                    <FlyoutItem
                      label="Texto Técnico"
                      keyLabel="X"
                      icon={Type}
                      active={tool === "text"}
                      onClick={() => handleSelectTool("text", "criar")}
                      desc="Gravação a laser ou marcação técnica"
                    />
                    {onOpenPresets && (
                      <FlyoutItem
                        label="Presets Paramétricos"
                        icon={Boxes}
                        onClick={() => {
                          onOpenPresets();
                          setOpenCat("none");
                        }}
                        desc="Flanges DIN/ANSI, bases e tubos"
                      />
                    )}
                    {onOpenTechnicalSheet && (
                      <FlyoutItem
                        label="Folha e Legenda Técnica"
                        icon={FileText}
                        onClick={() => {
                          onOpenTechnicalSheet();
                          setOpenCat("none");
                        }}
                        desc="Prancha A4/A3/A2 com carimbo CALDRA"
                      />
                    )}
                    {onOpenPieceBuilder && (
                      <FlyoutItem
                        label="Projeção Isométrica (Converter)"
                        icon={Sparkles}
                        onClick={() => {
                          onOpenPieceBuilder();
                          setOpenCat("none");
                        }}
                        desc="Transforma a seleção ativa do documento para perspectiva isométrica analítica 2D/2.5D"
                      />
                    )}
                    {onOpenRevEngCategory && (
                      <FlyoutItem
                        label="Reconstruir Peça (Eng. Reversa)"
                        keyLabel="REV"
                        badge="1:1"
                        icon={Compass}
                        onClick={() => {
                          triggerHaptic("selection");
                          onOpenRevEngCategory("referencias", "A");
                          setOpenCat("none");
                        }}
                        desc="Assistente guiado (A→F), captura de contorno e ajuste ortogonal"
                      />
                    )}

                    <div className="my-1 h-px bg-slate-800" />

                    <FlyoutItem
                      label="Extrude 3D"
                      icon={Box}
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        setOpenCat("none");
                      }}
                      badge="3D"
                      desc="Gerar sólido tridimensional por extrusão"
                    />
                    <FlyoutItem
                      label="Revolve 3D"
                      icon={RotateCw}
                      onClick={() => {
                        triggerHaptic("selection");
                        onModeChange("3d");
                        setOpenCat("none");
                      }}
                      badge="3D"
                      desc="Revolução de perfil em torno de um eixo"
                    />
                    <FlyoutItem
                      label="Loft 3D (Transição Multisseção)"
                      keyLabel="LOFT"
                      icon={Layers}
                      active={tool === "loft_3d"}
                      onClick={() => handleSelectTool("loft_3d", "criar")}
                      badge="3D"
                      desc="Transição sólida suave entre 2+ perfis em diferentes elevações Z"
                    />
                  </div>
                )}

                {/* 3. GRUPO: MODIFICAR */}
                {openCat === "modificar" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Área de Transferência"
                      keyLabel="CLIP"
                      icon={ClipboardList}
                      onClick={() => {
                        onOpenClipboard?.();
                        setOpenCat("none");
                      }}
                      desc="Painel global: formas copiadas, itens fixados (📌) e colar"
                    />
                    <FlyoutItem
                      label="Mover"
                      keyLabel="M"
                      icon={Move}
                      disabled={!hasSelection}
                      onClick={() => {
                        onMoveSelection();
                        setOpenCat("none");
                      }}
                      desc="Transladar elementos selecionados"
                    />
                    <FlyoutItem
                      label="Copiar"
                      keyLabel="CO"
                      icon={Copy}
                      disabled={!hasSelection}
                      onClick={() => {
                        onCopySelection();
                        setOpenCat("none");
                      }}
                      desc="Copiar seleção para a Área de Transferência (Ctrl+C)"
                    />
                    <FlyoutItem
                      label="Girar"
                      keyLabel="RO"
                      icon={RotateCw}
                      disabled={!hasSelection}
                      onClick={() => {
                        onRotateSelection();
                        setOpenCat("none");
                      }}
                      desc="Rotacionar em torno do centro geométrico"
                    />
                    <FlyoutItem
                      label="Espelhar"
                      keyLabel="MI"
                      icon={FlipHorizontal}
                      disabled={!hasSelection}
                      onClick={() => {
                        onMirrorSelection();
                        setOpenCat("none");
                      }}
                      desc="Refletir sobre o eixo central"
                    />
                    <FlyoutItem
                      label="Escalar"
                      keyLabel="SC"
                      icon={Maximize2}
                      disabled={!hasSelection}
                      onClick={() => {
                        onScaleSelection();
                        setOpenCat("none");
                      }}
                      desc="Ampliar ou reduzir proporcionalmente"
                    />

                    <div className="my-1 h-px bg-slate-800" />

                    <FlyoutItem
                      label="Offset (Deslocamento)"
                      keyLabel="O"
                      icon={CornerDownRight}
                      active={tool === "offset"}
                      onClick={() => handleSelectTool("offset", "modificar")}
                      desc={`Distância: ${offsetDist} mm`}
                    />
                    <FlyoutItem
                      label="Aparar (Trim)"
                      keyLabel="TR"
                      icon={Scissors}
                      active={tool === "trim"}
                      onClick={() => handleSelectTool("trim", "modificar")}
                      desc="Cortar linha em interseção com outra"
                    />
                    <FlyoutItem
                      label="Aparar até Encontro"
                      keyLabel="ATE"
                      icon={Scissors}
                      active={tool === "smart_trim"}
                      onClick={() => handleSelectTool("smart_trim", "modificar")}
                      desc="Aparar direto até a primeira interseção limite"
                    />
                    <FlyoutItem
                      label="Centralizar Formas"
                      keyLabel="CTR"
                      icon={AlignCenter}
                      active={tool === "center"}
                      disabled={!hasSelection}
                      onClick={() => {
                        if (onCenterSelection) {
                          onCenterSelection();
                          setOpenCat("none");
                        } else {
                          handleSelectTool("center", "modificar");
                        }
                      }}
                      desc="Centralizar seleção por centro geométrico ou limites"
                    />
                    <FlyoutItem
                      label="Estender (Extend)"
                      keyLabel="EX"
                      icon={Maximize}
                      active={tool === "extend"}
                      onClick={() => handleSelectTool("extend", "modificar")}
                      desc="Prolongar linha até o próximo limite"
                    />
                    <FlyoutItem
                      label="Filete (Arredondamento)"
                      keyLabel="F"
                      icon={Sparkles}
                      active={tool === "fillet"}
                      onClick={() => handleSelectTool("fillet", "modificar")}
                      desc={`Raio: R${filletR} mm`}
                    />
                    <FlyoutItem
                      label="Chanfro Angular"
                      keyLabel="CHA"
                      icon={Sparkles}
                      active={tool === "chamfer"}
                      onClick={() => handleSelectTool("chamfer", "modificar")}
                      desc="Corte chanfrado em quinas vivas"
                    />
                    <FlyoutItem
                      label="Dividir em Partes"
                      keyLabel="DIV"
                      icon={Divide}
                      active={tool === "divide"}
                      onClick={() => {
                        if (onDivideSelection && hasSelection) {
                          onDivideSelection();
                          setOpenCat("none");
                        } else {
                          handleSelectTool("divide", "modificar");
                        }
                      }}
                      desc="Dividir peça ou contorno em N partes iguais"
                    />

                    <div className="my-1 h-px bg-slate-800" />

                    <FlyoutItem
                      label="Unir (Join)"
                      icon={Combine}
                      disabled={!hasSelection}
                      onClick={() => {
                        onJoinSelection();
                        setOpenCat("none");
                      }}
                      desc="Fundir segmentos contíguos em polilinha"
                    />
                    <FlyoutItem
                      label="Quebrar (Break)"
                      icon={Split}
                      disabled={!hasSelection}
                      onClick={() => {
                        onBreakSelection();
                        setOpenCat("none");
                      }}
                      desc="Partir entidade em um ponto"
                    />
                    <FlyoutItem
                      label="Explodir (Explode)"
                      icon={Split}
                      disabled={!hasSelection}
                      onClick={() => {
                        onExplodeSelection();
                        setOpenCat("none");
                      }}
                      desc="Desmembrar polilinha ou bloco"
                    />
                    {onOverkillClean && (
                      <FlyoutItem
                        label="Overkill (Limpar Duplicatas)"
                        keyLabel="OV"
                        icon={Sparkles}
                        onClick={() => {
                          onOverkillClean();
                          setOpenCat("none");
                        }}
                        desc="Remove linhas duplicadas, nulas e sobreposições colineares"
                      />
                    )}

                    {onBoolean2D && (
                      <>
                        <div className="my-1 h-px bg-slate-800" />
                        <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider px-2 py-0.5">
                          Booleanas de Região 2D
                        </p>
                        <FlyoutItem
                          label="Unir Regiões (Union)"
                          keyLabel="UNI"
                          icon={Combine}
                          disabled={selectedCount < 2}
                          onClick={() => {
                            onBoolean2D("union");
                            setOpenCat("none");
                          }}
                          desc="Funde 2+ perfis fechados em contorno único"
                        />
                        <FlyoutItem
                          label="Subtrair Região (Subtract)"
                          keyLabel="SUB"
                          icon={Scissors}
                          disabled={selectedCount < 2}
                          onClick={() => {
                            onBoolean2D("subtract");
                            setOpenCat("none");
                          }}
                          desc="Recorta o 1º perfil pelo 2º perfil fechado"
                        />
                        <FlyoutItem
                          label="Interseção 2D (Intersect)"
                          keyLabel="INT"
                          icon={Boxes}
                          disabled={selectedCount < 2}
                          onClick={() => {
                            onBoolean2D("intersect");
                            setOpenCat("none");
                          }}
                          desc="Preserva apenas a área comum entre perfis"
                        />
                      </>
                    )}

                    {onCreateHatch && (
                      <FlyoutItem
                        label="Hachura Técnica (Com Ilhas)"
                        keyLabel="H"
                        icon={Layers}
                        disabled={!hasSelection}
                        onClick={() => {
                          onCreateHatch();
                          setOpenCat("none");
                        }}
                        desc="Preenche perfil fechado respeitando furos internos"
                      />
                    )}
                    <FlyoutItem
                      label="Loft 3D (Transição entre Seções)"
                      keyLabel="LOFT"
                      icon={Boxes}
                      active={tool === "loft_3d"}
                      onClick={() => handleSelectTool("loft_3d", "modificar")}
                      badge="3D"
                      desc="Seleciona 2+ perfis sequencialmente ([1]→[2]→[3]) com prévia 3D translúcida"
                    />

                    <div className="my-1 h-px bg-slate-800" />

                    {onOpenTopologyHealth && (
                      <FlyoutItem
                        label="Topologia & Auto-Heal"
                        icon={Activity}
                        onClick={() => {
                          onOpenTopologyHealth();
                          setOpenCat("none");
                        }}
                        desc="Diagnóstico de frestas, aberturas e duplicatas"
                      />
                    )}
                    {onOpenVariables && (
                      <FlyoutItem
                        label="Tabela de Variáveis"
                        icon={Sliders}
                        onClick={() => {
                          onOpenVariables();
                          setOpenCat("none");
                        }}
                        desc="Fórmulas e dimensões paramétricas do projeto"
                      />
                    )}
                    {onOpenQuickCommand && (
                      <FlyoutItem
                        label="Comando Rápido"
                        keyLabel="Q"
                        icon={Search}
                        onClick={() => {
                          onOpenQuickCommand();
                          setOpenCat("none");
                        }}
                        desc="Busca instantânea de comandos e operações"
                      />
                    )}
                    {onOpenRevEngCategory && (
                      <FlyoutItem
                        label="Ajustar Contorno Medido (LSQ)"
                        keyLabel="FIT"
                        icon={Compass}
                        onClick={() => {
                          triggerHaptic("selection");
                          onOpenRevEngCategory("contorno_ajuste", "C");
                          setOpenCat("none");
                        }}
                        desc="Ajuste ortogonal de reta, círculo, arco curto e polilinha RDP"
                      />
                    )}
                  </div>
                )}

                {/* 4. GRUPO: PRECISÃO / RESTRIÇÕES */}
                {openCat === "precisao" && (
                  <div className="flex flex-col gap-1 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setSnapOn((s) => !s);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        snapOn ? "bg-red-950/60 border border-red-500/40 text-red-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Magnet className="size-4" />
                        <span>Snap Geométrico</span>
                      </div>
                      <span className="font-bold">{snapOn ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    {/* DIVISÃO VIRTUAL DE FORMAS NO SNAP (NÃO-DESTRUTIVA) */}
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Divide className="size-3 text-cyan-400" />
                          Divisão do Snap (Virtual)
                        </span>
                        <span className="font-mono font-bold text-cyan-400">
                          {snapDivision && snapDivision >= 2 ? `${snapDivision} partes` : "OFF"}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight">
                        Gera pontos magnéticos virtuais em N partes iguais (linhas, arcos, círculos e polígonos) sem cortar a peça.
                      </p>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {[0, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                          <button
                            key={`snap-div-${n}`}
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onSetSnapDivision?.(n);
                            }}
                            className={cn(
                              "py-1 rounded-lg font-mono text-[10px] font-bold transition-all text-center",
                              (snapDivision === n || (n === 0 && (!snapDivision || snapDivision < 2)))
                                ? "bg-cyan-600 text-white shadow-xs"
                                : "bg-slate-800 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            {n === 0 ? "OFF" : `${n}p`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* MOSTRAR TODOS OS SNAPS DA PEÇA */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onToggleShowAllSnaps?.();
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        showAllSnaps
                          ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                      title="Exibir simultaneamente todos os pontos de snap de todas as formas existentes no canvas"
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="size-4" />
                        <span>Mostrar Todos os Snaps</span>
                      </div>
                      <span className="font-bold">{showAllSnaps ? "ON" : "OFF"}</span>
                    </button>

                    {/* SELETOR EXCLUSIVO: GUIAS DE INTERAÇÃO */}
                    <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-900/95 border border-slate-800">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-200 font-bold uppercase tracking-wider">
                          GUIAS DE INTERAÇÃO
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">Exclusivo</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {(
                          [
                            {
                              id: "off" as const,
                              label: "Desativadas",
                              activeClass: "bg-slate-700 text-white border-slate-500",
                            },
                            {
                              id: "purple_ref" as const,
                              label: "Referência de Ponto de Encontro",
                              activeClass: "bg-purple-950/80 text-purple-300 border-purple-500/60",
                            },
                            {
                              id: "blue_line" as const,
                              label: "Referência de Criação de Linha",
                              activeClass: "bg-sky-950/80 text-sky-300 border-sky-500/60",
                            },
                          ]
                        ).map((opt) => {
                          const isSelected = interactionGuideMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                triggerHaptic("selection");
                                onSetInteractionGuideMode?.(opt.id);
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold transition-all border text-left",
                                isSelected
                                  ? opt.activeClass
                                  : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200",
                              )}
                            >
                              <span>{opt.label}</span>
                              <span
                                className={cn(
                                  "size-2.5 rounded-full border",
                                  isSelected
                                    ? opt.id === "purple_ref"
                                      ? "bg-purple-400 border-purple-200"
                                      : opt.id === "blue_line"
                                        ? "bg-sky-400 border-sky-200"
                                        : "bg-slate-200 border-white"
                                    : "border-slate-600 bg-transparent",
                                )}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* PONTO DE REFERÊNCIA DINÂMICO (REF) */}
                    <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-purple-950/40 border border-purple-500/40">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-purple-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Crosshair className="size-3 text-rose-500" />
                          Ponto de Referência (REF)
                        </span>
                        {temporaryOrigin && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onClearTemporaryOrigin?.();
                            }}
                            className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase px-1.5 py-0.5 rounded bg-red-950/60 transition-colors"
                          >
                            Limpar REF
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("action");
                          if (!interactionGuideMode || interactionGuideMode === "off") {
                            onSetInteractionGuideMode?.("purple_ref");
                          }
                          onStartSetReferencePoint?.();
                          setOpenCat("none");
                        }}
                        className="mt-0.5 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-[10.5px] font-bold shadow-sm transition-all active:scale-95"
                      >
                        <Crosshair className="size-3.5" />
                        <span>{temporaryOrigin ? "Redefinir Ponto de REF" : "Definir Ponto de Referência"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setOrthoOn((o) => !o);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        orthoOn ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Crosshair className="size-4" />
                        <span>Modo Orto (0°/90°)</span>
                      </div>
                      <span className="font-bold">{orthoOn ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setTrackingOn((t) => !t);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        trackingOn ? "bg-sky-950/60 border border-sky-500/40 text-sky-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Compass className="size-4" />
                        <span>Smart Tracking (15°/30°/45°)</span>
                      </div>
                      <span className="font-bold">{trackingOn ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setShowGrid((g) => !g);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                        showGrid ? "bg-red-950/60 border border-red-500/40 text-red-300" : "bg-slate-900 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Grid className="size-4" />
                        <span>Grade Espacial ({grid} mm)</span>
                      </div>
                      <span className="font-bold">{showGrid ? "LIGADO" : "DESLIGADO"}</span>
                    </button>

                    {onSetRefZero && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("action");
                          onSetRefZero();
                          setOpenCat("none");
                        }}
                        className="flex items-center justify-between rounded-xl px-2.5 py-1.5 bg-amber-950/50 border border-amber-500/40 text-amber-300 hover:bg-amber-900/60 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Crosshair className="size-4" />
                          <span>Fixar Origem REF (0,0)</span>
                        </div>
                        <span className="font-bold">APLICAR</span>
                      </button>
                    )}

                    {onToggleDrawingProjection && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onToggleDrawingProjection();
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                          drawingProjection === "isometric"
                            ? "bg-red-950/60 border border-red-500/40 text-red-300"
                            : "bg-slate-900 text-slate-400 hover:text-slate-200",
                        )}
                        title="Alternar entre Desenho Ortogonal 2D e Isométrico 2D"
                      >
                        <div className="flex items-center gap-2">
                          <Box className="size-4" />
                          <span>Modo Isométrico 2D</span>
                        </div>
                        <span className="font-bold">
                          {drawingProjection === "isometric" ? "ATIVO" : "DESLIGADO"}
                        </span>
                      </button>
                    )}

                    {drawingProjection === "isometric" && onSelectIsoPlane && (
                      <div className="flex flex-col gap-1 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
                        <span className="text-[10px] text-muted-foreground font-semibold px-1">
                          Plano Isométrico (F5):
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {(["top", "left", "right"] as const).map((pId) => (
                            <button
                              key={pId}
                              type="button"
                              onClick={() => {
                                triggerHaptic("selection");
                                onSelectIsoPlane(pId);
                              }}
                              className={cn(
                                "py-1 rounded-lg text-[10px] font-bold uppercase transition-colors text-center",
                                isoPlane === pId
                                  ? "bg-red-600 text-white shadow-xs"
                                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                              )}
                            >
                              {pId === "top" ? "Superior" : pId === "left" ? "Esquerdo" : "Direito"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-800 pt-2 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                        Modificadores de Precisão (Touch)
                      </p>
                      <div className="flex flex-col gap-1">
                        {onToggleCursorOffsetMode && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onToggleCursorOffsetMode();
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                              cursorOffsetMode === "offset"
                                ? "bg-sky-950/60 border border-sky-500/40 text-sky-300"
                                : "bg-slate-900 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Crosshair className="size-3.5" />
                              <span>Mira Técnica</span>
                            </div>
                            <span className="font-bold uppercase">
                              {cursorOffsetMode === "offset" ? "OFFSET 55PX" : "DIRETA"}
                            </span>
                          </button>
                        )}

                        {onCycleLoupeMode && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onCycleLoupeMode();
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                              loupeMode !== "off"
                                ? "bg-cyan-950/60 border border-cyan-500/40 text-cyan-300"
                                : "bg-slate-900 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Eye className="size-3.5" />
                              <span>Lupa HUD</span>
                            </div>
                            <span className="font-bold uppercase">
                              {loupeMode === "pinned"
                                ? "FIXA"
                                : loupeMode === "floating"
                                  ? "FLUTUANTE"
                                  : "DESLIGADA"}
                            </span>
                          </button>
                        )}

                        {onToggleNudgeHud && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("selection");
                              onToggleNudgeHud();
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors",
                              nudgeHudVisible
                                ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                                : "bg-slate-900 text-slate-400 hover:text-slate-200",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Sliders className="size-3.5" />
                              <span>Coordenadas / Nudge</span>
                            </div>
                            <span className="font-bold uppercase">
                              {nudgeHudVisible ? "ATIVO" : "SOB DEMANDA"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-2 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                        Restrições Geométricas
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Coincidente</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Paralelo</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Perpendicular</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Tangente</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Horizontal</span>
                        <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-slate-300">Fixar Ponto</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. GRUPO: MEDIR */}
                {openCat === "medir" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Régua / Distância Livre"
                      keyLabel="D"
                      icon={Ruler}
                      active={tool === "measure"}
                      onClick={() => handleSelectTool("measure", "medir")}
                      desc="Medir distância e ângulo entre dois cliques"
                    />

                    <div className="my-1 h-px bg-slate-800" />
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-2 py-0.5">
                      Cotas Técnicas
                    </p>

                    <FlyoutItem
                      label="Cota Alinhada"
                      icon={Ruler}
                      active={tool === "dim" && dimKind === "aligned"}
                      onClick={() => {
                        onPickDimKind("aligned");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Dimensão paralela à entidade"
                    />
                    <FlyoutItem
                      label="Cota Horizontal"
                      icon={Ruler}
                      active={tool === "dim" && dimKind === "horizontal"}
                      onClick={() => {
                        onPickDimKind("horizontal");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Projeção no eixo X"
                    />
                    <FlyoutItem
                      label="Cota Vertical"
                      icon={Ruler}
                      active={tool === "dim" && dimKind === "vertical"}
                      onClick={() => {
                        onPickDimKind("vertical");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Projeção no eixo Y"
                    />
                    <FlyoutItem
                      label="Cota de Raio (R)"
                      icon={CircleDot}
                      active={tool === "dim" && dimKind === "radius"}
                      onClick={() => {
                        onPickDimKind("radius");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Raio de arco ou círculo"
                    />
                    <FlyoutItem
                      label="Cota de Diâmetro (Ø)"
                      icon={Disc}
                      active={tool === "dim" && dimKind === "diameter"}
                      onClick={() => {
                        onPickDimKind("diameter");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Diâmetro de furos e círculos"
                    />
                    <FlyoutItem
                      label="Cota Angular (°)"
                      icon={Compass}
                      active={tool === "dim" && dimKind === "angle"}
                      onClick={() => {
                        onPickDimKind("angle");
                        handleSelectTool("dim", "medir");
                      }}
                      desc="Ângulo entre duas retas"
                    />
                    {onOpenRevEngCategory && (
                      <>
                        <div className="my-1 h-px bg-slate-800" />
                        <FlyoutItem
                          label="Caderno de Medições & Calibração 1:1"
                          keyLabel="REV"
                          badge="ENG"
                          icon={Ruler}
                          onClick={() => {
                            triggerHaptic("selection");
                            onOpenRevEngCategory("caderno", "B");
                            setOpenCat("none");
                          }}
                          desc="Paquímetro, trena, micrômetro, incerteza ±mm e calibração multi-ref"
                        />
                      </>
                    )}
                  </div>
                )}

                {/* 6. GRUPO: CHAPA METÁLICA */}
                {openCat === "chapa" && (
                  <div className="flex flex-col gap-1 font-mono text-xs">
                    <div className="flex items-center justify-between rounded-xl bg-slate-900/90 p-2 border border-slate-800">
                      <span className="text-[11px] text-slate-300 font-bold">Espessura:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={0.1}
                          min={0.2}
                          max={30}
                          value={thickness}
                          onChange={(e) => onThicknessChange(Number(e.target.value) || 1)}
                          className="w-14 rounded-lg bg-slate-800 px-1.5 py-0.5 text-center font-bold text-red-400 outline-none"
                        />
                        <span className="text-slate-400 text-[10px]">mm</span>
                      </div>
                    </div>

                    <FlyoutItem
                      label="Modelar Flanges (Abas)"
                      icon={Layers}
                      onClick={() => {
                        onOpenFlanges();
                        setOpenCat("none");
                      }}
                      desc="Adicionar abas e dobras na borda"
                    />
                    <FlyoutItem
                      label="Converter para Linha de Dobra"
                      icon={FoldHorizontal}
                      onClick={() => {
                        onConvertToBend();
                        setOpenCat("none");
                      }}
                      desc="Transforma seleção em vinco/dobra"
                    />
                    <FlyoutItem
                      label="Aplicar Alívio de Canto"
                      icon={Sparkles}
                      onClick={() => {
                        onApplyRelief();
                        setOpenCat("none");
                      }}
                      desc="Alívio circular/retangular para prensagem"
                    />
                    <FlyoutItem
                      label="Planificação (Flat Pattern)"
                      icon={ArrowRightLeft}
                      onClick={() => {
                        onPlanificar();
                        setOpenCat("none");
                      }}
                      desc="Desenvolvimento de chapa para corte CNC"
                    />
                    <FlyoutItem
                      label="Desdobrar (Unfold)"
                      icon={FoldHorizontal}
                      onClick={() => {
                        onUnfold();
                        setOpenCat("none");
                      }}
                      desc="Visualizar peça aberta"
                    />
                    <FlyoutItem
                      label="Dobrar (Fold)"
                      icon={Layers}
                      onClick={() => {
                        onFold();
                        setOpenCat("none");
                      }}
                      desc="Recolher peça em 3D"
                    />
                    <FlyoutItem
                      label="Loft 3D (Transição Redonda/Quadrada)"
                      keyLabel="LOFT"
                      icon={Boxes}
                      active={tool === "loft_3d"}
                      onClick={() => handleSelectTool("loft_3d", "chapa")}
                      badge="3D"
                      desc="Cria transição cônica ou multisseção 3D entre perfis em diferentes Z"
                    />
                  </div>
                )}

                {/* 7. GRUPO: ESTRUTURAS / TUBOS */}
                {openCat === "estruturas" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Perfil Estrutural (Viga / Tubo)"
                      icon={Boxes}
                      onClick={() => {
                        triggerHaptic("tap");
                        setOpenCat("none");
                      }}
                      desc="Tubos redondos, quadrados, vigas I/U"
                    />
                    <FlyoutItem
                      label="Corte em Ângulo (45° / Esquadria)"
                      icon={Scissors}
                      onClick={() => {
                        triggerHaptic("tap");
                        setOpenCat("none");
                      }}
                      desc="Bisel e junta em esquadria para soldagem"
                    />
                    <FlyoutItem
                      label="Símbolo de Solda Industrial"
                      icon={Flame}
                      onClick={() => {
                        triggerHaptic("tap");
                        setOpenCat("none");
                      }}
                      desc="Chanfro em V, cordão contínuo ou intermitente"
                    />
                  </div>
                )}

                {/* 8. GRUPO: DETALHES */}
                {openCat === "detalhes" && (
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <FlyoutItem
                      label="Furo Industrial (Ø)"
                      icon={CircleDot}
                      onClick={() => {
                        onAddHole();
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Furo passante, cego ou escareado"
                    />
                    <FlyoutItem
                      label="Rosca Técnica (M)"
                      icon={Sliders}
                      onClick={() => {
                        triggerHaptic("tap");
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Especificação de rosca métrica"
                    />
                    <FlyoutItem
                      label="Padrão Linear (Array)"
                      icon={Copy}
                      onClick={() => {
                        onArrayLinear();
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Repetição de furos em linha X/Y"
                    />
                    <FlyoutItem
                      label="Padrão Circular (Array Polar)"
                      icon={RotateCw}
                      onClick={() => {
                        onArrayPolar();
                        if (!isPinned) setOpenCat("none");
                      }}
                      desc="Furação distribuída em flange circular (PCD)"
                    />
                    {onOpenRevEngCategory && (
                      <>
                        <div className="my-1 h-px bg-slate-800" />
                        <FlyoutItem
                          label="Bancada de Furos e Cadeias (Eng. Rev.)"
                          keyLabel="PCD"
                          icon={CircleDot}
                          onClick={() => {
                            triggerHaptic("selection");
                            onOpenRevEngCategory("furos_cadeias", "D");
                            if (!isPinned) setOpenCat("none");
                          }}
                          desc="Cálculo de PCD por corda, furos por borda/parede e rasgos"
                        />
                      </>
                    )}
                  </div>
                )}
        </div>
      )}
    </aside>
  );
}

function FlyoutItem({
  label,
  keyLabel,
  icon: Icon,
  active,
  disabled,
  badge,
  onClick,
  desc,
}: {
  label: string;
  keyLabel?: string;
  icon: typeof Minus;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
  desc?: string;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={
        disabled
          ? { color: "var(--chamfer-text-muted)" }
          : active
            ? {
                backgroundColor: "var(--chamfer-accent-soft)",
                borderColor: "var(--chamfer-accent-border)",
                color: "var(--chamfer-accent)",
              }
            : {
                borderColor: "transparent",
                color: "var(--chamfer-text-primary)",
              }
      }
      className={cn(
        "group flex w-full flex-col rounded-xl border px-2.5 py-1.5 text-left transition-colors cursor-pointer",
        disabled && "opacity-35 cursor-not-allowed",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            style={{
              color: active ? "var(--chamfer-accent)" : "var(--chamfer-text-secondary)",
            }}
            className="size-3.5"
          />
          <span className="font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              style={{
                backgroundColor: "var(--chamfer-accent-soft)",
                color: "var(--chamfer-accent)",
              }}
              className="rounded px-1 py-0.2 text-[8px] font-bold uppercase"
            >
              {badge}
            </span>
          )}
          {keyLabel && (
            <kbd
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
                color: "var(--chamfer-text-secondary)",
              }}
              className="rounded border px-1.5 py-0.2 text-[9px] font-bold"
            >
              {keyLabel}
            </kbd>
          )}
        </div>
      </div>
      {desc && (
        <span
          style={{ color: "var(--chamfer-text-secondary)" }}
          className="mt-0.5 text-[9px] line-clamp-1"
        >
          {desc}
        </span>
      )}
    </button>
  );
}
