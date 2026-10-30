/**
 * CALDRA — CHAMFER CAD PORTRAIT UI (INSPIRAÇÃO ADOBE LIGHTROOM MOBILE)
 *
 * Arquitetura exclusiva para Tela Vertical (Modo Retrato / Portrait):
 * - Zero Barras Laterais (Canvas 100% de ponta a ponta — 100vw)
 * - 1 Barra Superior Única Compacta (height: 48px, zero corte lateral)
 * - Micro-Pílula Translúcida Flutuante no Canvas (height: 24px: P01 • X/Y • SNAP: ON)
 * - Estritamente no máximo 2 Barras Inferiores Empilhadas:
 *   • Nível 1 (Acima do Dock — height: 60px): Carrossel Contextual Horizontal com
 *     Substituição Contextual Inline ([ ← Voltar ] + pílulas editáveis + [ ✓ Confirmar ])
 *   • Nível 2 (Base da Tela — height: 54px): Seletor de 5 Modos Estilo Lightroom Mobile
 * - Bottom Sheet Compacto sob demanda para painéis longos (Propriedades, Camadas,
 *   Corte CNC, Cotas, Engenharia Reversa 1:1) com auto-enquadramento da peça.
 */

import React, { useState, useEffect, useRef } from "react";
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
  Search,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
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
  | "cotar";

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

export interface ChamferPortraitTopBarProps {
  isDark: boolean;
  projectName: string;
  thickness: number;
  onThicknessChange: (v: number) => void;
  plans: { id: string; name: string }[];
  activePlanId: string;
  onSelectPlan: (id: string) => void;
  onCreatePlan: () => void;
  onOpenNewProjectDialog: () => void;
  saveStatus: "salvo" | "salvando" | "pendente";
  onManualSave: () => void;
  onLeaveEditor: () => void;

  // Modos 2D / 3D / Projeção / Órbita
  activeMode: "2d" | "3d" | "flanges";
  onSelect2D: () => void;
  onSelect3D: () => void;
  drawingProjection: "orthographic" | "isometric";
  onSetDrawingProjection: (mode: "orthographic" | "isometric") => void;
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
  showDims: boolean;
  onToggleShowDims: () => void;
  onToggleTheme: () => void;
  focus: boolean;
  onToggleFullscreen: () => void;
}

export function ChamferPortraitTopBar({
  isDark,
  projectName,
  thickness,
  onThicknessChange,
  plans,
  activePlanId,
  onSelectPlan,
  onCreatePlan,
  onOpenNewProjectDialog,
  saveStatus,
  onManualSave,
  onLeaveEditor,
  activeMode,
  onSelect2D,
  onSelect3D,
  drawingProjection,
  onSetDrawingProjection,
  isOrbitToolActive,
  isOrbitTilted,
  onToggleOrbitTool,
  renderStyle3D,
  onChangeRenderStyle3D,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
  showDims,
  onToggleShowDims,
  onToggleTheme,
  focus,
  onToggleFullscreen,
}: ChamferPortraitTopBarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectMenuOpen && !moreMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (projectMenuOpen && projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setProjectMenuOpen(false);
      }
      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [projectMenuOpen, moreMenuOpen]);

  // Determina o rótulo e estado do Chip de Vista Ativa (1 toque alterna ORTO 2D -> ISO 2D -> ÓRBITA 3D)
  const viewChipLabel =
    isOrbitToolActive || isOrbitTilted || activeMode === "3d"
      ? "ÓRBITA 3D"
      : drawingProjection === "isometric"
        ? "ISO 2D"
        : "ORTO 2D";

  const handleCycleViewChip = () => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    if (activeMode === "3d") {
      // Em modo 3D alterna entre SÓLIDO / SOMB / ARAME com 1 toque
      const nextStyle: EdgeMode =
        renderStyle3D === "shaded-edges"
          ? "shaded"
          : renderStyle3D === "shaded"
            ? "wireframe"
            : "shaded-edges";
      onChangeRenderStyle3D(nextStyle);
      return;
    }
    if (!isOrbitToolActive && !isOrbitTilted && drawingProjection === "orthographic") {
      onSetDrawingProjection("isometric");
    } else if (!isOrbitToolActive && !isOrbitTilted && drawingProjection === "isometric") {
      onSetDrawingProjection("orthographic");
      onToggleOrbitTool(true);
    } else {
      onToggleOrbitTool(false);
      onSetDrawingProjection("orthographic");
      onSelect2D();
    }
  };

  return (
    <header
      aria-label="Barra superior CHAMFER CAD Retrato"
      style={{ height: 48, padding: "0 10px" }}
      className={cn(
        "relative z-40 flex w-full shrink-0 items-center justify-between border-b select-none transition-colors",
        isDark
          ? "border-white/[0.07] bg-[#11141C] text-[#F8FAFC]"
          : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]",
      )}
    >
      {/* ESQUERDA: Botão Voltar (←) + Botão Único Compacto do Projeto/Chapa */}
      <div className="flex min-w-0 items-center gap-1.5" ref={projectMenuRef}>
        <button
          type="button"
          onClick={onLeaveEditor}
          aria-label="Voltar ao Início"
          title="Sair do editor e voltar"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors active:scale-95",
            isDark
              ? "border-white/[0.08] bg-[#181C26] text-[#F8FAFC] hover:bg-[#222836]"
              : "border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F1F5F9]",
          )}
        >
          <ArrowLeft className="size-4" />
        </button>

        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              setProjectMenuOpen((v) => !v);
              setMoreMenuOpen(false);
            }}
            className={cn(
              "flex h-8 max-w-[132px] xs:max-w-[148px] items-center gap-1 rounded-lg border px-2 font-mono text-[10.5px] font-semibold transition-colors active:scale-98",
              isDark
                ? "border-white/[0.08] bg-[#181C26] text-[#F8FAFC] hover:border-[#38BDF8]/40"
                : "border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#0284C7]/40",
            )}
            title="Projeto, Planos (P01) e Espessura da Chapa"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                saveStatus === "pendente"
                  ? "bg-[#F59E0B] animate-pulse"
                  : saveStatus === "salvando"
                    ? "bg-[#38BDF8] animate-ping"
                    : "bg-[#10B981]",
              )}
            />
            <span className="truncate">{projectName}</span>
            <span className={cn("shrink-0 font-bold", isDark ? "text-[#38BDF8]" : "text-[#0284C7]")}>
              • {thickness.toFixed(1)}mm
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-70" />
          </button>

          {/* POPOVER RÁPIDO DE PROJETO, PLANOS E ESPESSURA */}
          {projectMenuOpen && (
            <div
              className={cn(
                "fixed top-[52px] left-2.5 z-[80] w-64 rounded-2xl border p-2.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150",
                isDark
                  ? "border-white/[0.1] bg-[#181C26]/98 text-[#F8FAFC]"
                  : "border-[#CBD5E1] bg-white/98 text-[#0F172A]",
              )}
            >
              <div className="flex items-center justify-between border-b pb-2 mb-2 border-white/[0.07]">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#94A3B8]">
                    Documento Ativo
                  </p>
                  <p className="font-mono text-xs font-bold truncate">{projectName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    onManualSave();
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold transition-colors",
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

              {/* Seletor de Planos P01 / P02 / + */}
              <div className="mb-2.5">
                <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                  Planos de Corte
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {plans.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onSelectPlan(pl.id);
                        setProjectMenuOpen(false);
                      }}
                      className={cn(
                        "rounded-lg px-2.5 py-1 font-mono text-[10.5px] font-bold transition-colors",
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
                    onClick={() => {
                      triggerHaptic("action");
                      onCreatePlan();
                      setProjectMenuOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold",
                      isDark
                        ? "border-white/[0.1] bg-[#11141C] text-[#38BDF8]"
                        : "border-[#CBD5E1] bg-[#F8FAFC] text-[#0284C7]",
                    )}
                  >
                    <Plus className="size-3" /> Plano
                  </button>
                </div>
              </div>

              {/* Espessura da Chapa */}
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Espessura da Chapa
                  </span>
                  <span className="font-mono text-[10.5px] font-bold text-[#E11D48]">
                    CHAPA {thickness.toFixed(1)}MM
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1.0, 1.5, 2.0, 3.0, 4.75, 6.35, 9.5, 12.7].map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onThicknessChange(th);
                      }}
                      className={cn(
                        "rounded-lg py-1 font-mono text-[10px] font-bold transition-colors",
                        Math.abs(thickness - th) < 0.05
                          ? "bg-[#0EA5E9] text-white"
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

              <button
                type="button"
                onClick={() => {
                  setProjectMenuOpen(false);
                  onOpenNewProjectDialog();
                }}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-xl border py-1.5 font-mono text-[10.5px] font-bold transition-colors",
                  isDark
                    ? "border-white/[0.08] bg-[#11141C] text-[#F8FAFC] hover:bg-[#222836]"
                    : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#E2E8F0]/60",
                )}
              >
                <FolderPlus className="size-3.5 text-[#E11D48]" />
                <span>Novo / Renomear Projeto</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CENTRO: Seletor Segmentado Compacto [ 2D | 3D ] + Chip da Vista Ativa */}
      <div className="flex shrink-0 items-center gap-1">
        <div
          className={cn(
            "flex items-center rounded-lg border p-0.5",
            isDark ? "border-white/[0.08] bg-[#181C26]" : "border-[#E2E8F0] bg-white",
          )}
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onSelect2D();
            }}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
              activeMode === "2d"
                ? "bg-[#E11D48] text-white shadow-xs"
                : isDark
                  ? "text-[#94A3B8] hover:text-white"
                  : "text-[#475569] hover:text-[#0F172A]",
            )}
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onSelect3D();
            }}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors",
              activeMode === "3d"
                ? "bg-[#E11D48] text-white shadow-xs"
                : isDark
                  ? "text-[#94A3B8] hover:text-white"
                  : "text-[#475569] hover:text-[#0F172A]",
            )}
          >
            3D
          </button>
        </div>

        <button
          type="button"
          onClick={handleCycleViewChip}
          title="Toque para alternar vista: ORTO 2D → ISO 2D → ÓRBITA 3D"
          className={cn(
            "flex h-7 items-center gap-1 rounded-lg border px-2 font-mono text-[9.5px] font-bold tracking-wider uppercase transition-colors active:scale-95",
            isOrbitToolActive || isOrbitTilted || drawingProjection === "isometric"
              ? isDark
                ? "border-[#0EA5E9]/50 bg-[#0EA5E9]/18 text-[#38BDF8]"
                : "border-[#0284C7]/45 bg-[#0284C7]/12 text-[#0284C7]"
              : isDark
                ? "border-white/[0.08] bg-[#181C26] text-[#94A3B8] hover:text-white"
                : "border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]",
          )}
        >
          <span>
            {activeMode === "3d"
              ? renderStyle3D === "shaded-edges"
                ? "SÓLIDO"
                : renderStyle3D === "shaded"
                  ? "SOMB"
                  : "ARAME"
              : viewChipLabel}
          </span>
        </button>
      </div>

      {/* DIREITA: Histórico Direto (↶ ↷) + Botão Mais Ações (⋮) */}
      <div className="flex shrink-0 items-center gap-1" ref={moreMenuRef}>
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          aria-label="Desfazer"
          title="Desfazer (Ctrl+Z)"
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border transition-colors",
            canUndo
              ? isDark
                ? "border-white/[0.08] bg-[#181C26] text-[#F8FAFC] hover:bg-[#222836] active:scale-95"
                : "border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F1F5F9] active:scale-95"
              : "opacity-35 cursor-not-allowed border-transparent text-[#94A3B8]",
          )}
        >
          <Undo2 className="size-4" />
        </button>

        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          aria-label="Refazer"
          title="Refazer (Ctrl+Y)"
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border transition-colors",
            canRedo
              ? isDark
                ? "border-white/[0.08] bg-[#181C26] text-[#F8FAFC] hover:bg-[#222836] active:scale-95"
                : "border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F1F5F9] active:scale-95"
              : "opacity-35 cursor-not-allowed border-transparent text-[#94A3B8]",
          )}
        >
          <Redo2 className="size-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              setMoreMenuOpen((v) => !v);
              setProjectMenuOpen(false);
            }}
            aria-label="Mais Ações"
            title="Mais Ações (Vision, Intent, Corte/BOM, Exportar, Enquadrar)"
            className={cn(
              "flex size-8 items-center justify-center rounded-lg border transition-colors active:scale-95",
              moreMenuOpen
                ? "border-[#E11D48] bg-[#E11D48] text-white"
                : isDark
                  ? "border-white/[0.08] bg-[#181C26] text-[#F8FAFC] hover:bg-[#222836]"
                  : "border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F1F5F9]",
            )}
          >
            <MoreVertical className="size-4" />
          </button>

          {moreMenuOpen && (
            <div
              className={cn(
                "fixed top-[52px] right-2.5 z-[80] w-60 rounded-2xl border p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150",
                isDark
                  ? "border-white/[0.1] bg-[#181C26]/98 text-[#F8FAFC]"
                  : "border-[#CBD5E1] bg-white/98 text-[#0F172A]",
              )}
            >
              <PortraitMenuItem
                icon={ScanEye}
                accentColor="text-[#E11D48]"
                label="VISION (Eng. Reversa 1:1)"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenVision();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Sparkles}
                accentColor="text-[#38BDF8]"
                label="CHAMFER INTENT (IA)"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenIntent();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Boxes}
                accentColor="text-[#10B981]"
                label="CORTE / BOM & Oficina"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenWorkshop();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Download}
                label="Exportar CNC / DXF / PDF"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenExport();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Scissors}
                label="Plano de Corte CNC Direto"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenCnc();
                }}
                isDark={isDark}
              />

              <div className={cn("my-1 h-px", isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]")} />

              <PortraitMenuItem
                icon={Crosshair}
                label="Enquadrar Peça na Tela"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onCenterPiece(false);
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Maximize2}
                label="Enquadrar Área de Trabalho"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onFitWorkspace();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
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
                icon={Boxes}
                label="Presets Paramétricos"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenPresets();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={FileText}
                label="Folha Técnica e Legenda"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenTechnicalSheet();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Activity}
                label="Topologia & Auto-Heal"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenTopologyHealth();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={Sliders}
                label="Tabela de Variáveis"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onOpenVariables();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
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
                icon={isDark ? Sun : Moon}
                label={isDark ? "Mudar para Tema Claro" : "Mudar para Tema Escuro"}
                onClick={() => {
                  setMoreMenuOpen(false);
                  onToggleTheme();
                }}
                isDark={isDark}
              />
              <PortraitMenuItem
                icon={focus ? Minimize : Maximize}
                label={focus ? "Sair do Modo Tela Cheia" : "Modo Tela Cheia (Foco)"}
                onClick={() => {
                  setMoreMenuOpen(false);
                  onToggleFullscreen();
                }}
                isDark={isDark}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function PortraitMenuItem({
  icon: Icon,
  label,
  onClick,
  accentColor,
  isDark,
}: {
  icon: typeof Minus;
  label: string;
  onClick: () => void;
  accentColor?: string;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-mono text-[11px] font-semibold transition-colors",
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
 * MICRO-PÍLULA FLUTUANTE DE COORDENADAS X/Y, PLANO P01 E SNAP NO CANVAS
 * ============================================================================ */
export interface ChamferPortraitCanvasMicroPillProps {
  isDark: boolean;
  planName: string;
  cursor: Vec2;
  snapOn: boolean;
  onToggleSnap: () => void;
  temporaryOrigin: { p: Vec2; label: string } | null;
  onClearTemporaryOrigin: () => void;
  onSetRefAtCursor: () => void;
}

export function ChamferPortraitCanvasMicroPill({
  isDark,
  planName,
  cursor,
  snapOn,
  onToggleSnap,
  temporaryOrigin,
  onClearTemporaryOrigin,
  onSetRefAtCursor,
}: ChamferPortraitCanvasMicroPillProps) {
  const dx = temporaryOrigin ? cursor.x - temporaryOrigin.p.x : cursor.x;
  const dy = temporaryOrigin ? cursor.y - temporaryOrigin.p.y : cursor.y;

  return (
    <div
      style={{ height: 24 }}
      className={cn(
        "pointer-events-auto absolute top-[24px] right-2 z-20 flex items-center gap-1.5 rounded-full border px-2.5 font-mono text-[9.5px] shadow-md backdrop-blur-md select-none",
        isDark
          ? "border-white/[0.09] bg-[#11141C]/88 text-[#E2E8F0]"
          : "border-[#CBD5E1]/90 bg-white/90 text-[#0F172A]",
      )}
    >
      <span
        className={cn(
          "font-bold tracking-wider",
          isDark ? "text-[#FB7185]" : "text-[#E11D48]",
        )}
      >
        {planName}
      </span>

      <span className={cn("h-2.5 w-px", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />

      {temporaryOrigin ? (
        <div className="flex items-center gap-1">
          <span className="font-bold text-[#F59E0B]">REF</span>
          <span className="tabular-nums">
            ΔX:{(dx >= 0 ? "+" : "") + dx.toFixed(1)} ΔY:{(dy >= 0 ? "+" : "") + dy.toFixed(1)}
          </span>
          <button
            type="button"
            onClick={onClearTemporaryOrigin}
            title="Limpar REF 0,0"
            className="ml-0.5 rounded px-1 text-[8.5px] font-bold text-[#F87171] hover:bg-red-500/20"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSetRefAtCursor}
          title="Toque para fixar REF (0,0) na posição atual"
          className="flex items-center gap-1 tabular-nums hover:opacity-80"
        >
          <span className="text-[#94A3B8]">X:</span>
          <strong className="font-semibold">{cursor.x.toFixed(1)}</strong>
          <span className="text-[#94A3B8] ml-0.5">Y:</span>
          <strong className="font-semibold">{cursor.y.toFixed(1)}</strong>
        </button>
      )}

      <span className={cn("h-2.5 w-px", isDark ? "bg-white/[0.12]" : "bg-[#CBD5E1]")} />

      <button
        type="button"
        onClick={() => {
          triggerHaptic("selection");
          onToggleSnap();
        }}
        className={cn(
          "flex items-center gap-1 font-bold uppercase tracking-wider transition-colors",
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
    </div>
  );
}

/* ============================================================================
 * ARQUITETURA INFERIOR ESTILO LIGHTROOM MOBILE (NÍVEL 1 CARROSSEL + NÍVEL 2 DOCK)
 * ============================================================================ */
export interface ChamferPortraitBottomBarsProps {
  isDark: boolean;
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

  // Chapa, Estrutura & Vision
  thickness: number;
  onThicknessChange: (v: number) => void;
  onConvertToBend: () => void;
  onAddHole: () => void;
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

export function ChamferPortraitBottomBars({
  isDark,
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
  thickness,
  onThicknessChange,
  onConvertToBend,
  onAddHole,
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
  onOpenWorkspaceKeypad,
  onOpenPresets,
  onOpenTechnicalSheet,
  onOpenTopologyHealth,
  onOpenVariables,
  onOpenPieceBuilder,
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

  // Fecha sub-painel inline se trocar de modo principal no Dock Nível 2
  const handleSelectDockMode = (nextMode: PortraitDockMode) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    setDockMode(nextMode);
    setInlineSubPanel("none");
  };

  const layerLabel =
    activeLayer === "dobra"
      ? "Dobra"
      : activeLayer === "recorte"
        ? "Recorte"
        : activeLayer === "marcacao"
          ? "Marcação"
          : "Corte";

  // Verifica se a Barra Nível 1 deve entrar em modo de Substituição Contextual Inline
  const isInlineArrayActive = activeArrayType !== null;
  const isInlineDivideActive = divideEditorOpen;
  const isInlineFilletChamfer = tool === "fillet" || tool === "chamfer";
  const isInlineOffset = tool === "offset";

  const renderLevel1Content = () => {
    /* 1. SUBSTITUIÇÃO INLINE: ARRAY POLAR / LINEAR */
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
                "rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase",
                activeArrayType === "polar"
                  ? "bg-[#0EA5E9] text-white"
                  : "text-[#94A3B8]",
              )}
            >
              Polar
            </button>
            <button
              type="button"
              onClick={() => onChangeArrayType("linear")}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase",
                activeArrayType === "linear"
                  ? "bg-[#0EA5E9] text-white"
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
                onChange={(v) =>
                  onChangePolarParams((p) => ({ ...p, radius: Math.max(1, v / 2) }))
                }
                isDark={isDark}
              />
              <InlineNumberInputPill
                label="Âng"
                value={arrayPolarParams.totalAngleDeg}
                unit="°"
                onChange={(v) =>
                  onChangePolarParams((p) => ({
                    ...p,
                    totalAngleDeg: Math.max(5, Math.min(360, v)),
                  }))
                }
                isDark={isDark}
              />
              <button
                type="button"
                onClick={onTogglePickArrayCenter}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 font-mono text-[10px] font-bold uppercase transition-colors",
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
                onChange={(v) => onChangeLinearParams((p) => ({ ...p, dx: v }))}
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
                onChange={(v) => onChangeLinearParams((p) => ({ ...p, dy: v }))}
                isDark={isDark}
              />
            </>
          )}

          <InlineConfirmButton onClick={onCommitArray} label="Confirmar" />
        </div>
      );
    }

    /* 2. SUBSTITUIÇÃO INLINE: DIVIDIR EM PARTES */
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
          {[2, 3, 4, 6, 8, 12].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onDividePartsChange(n)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors",
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

    /* 3. SUBSTITUIÇÃO INLINE: FILETE R / CHANFRO */
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
            onChange={(v) => setFilletR(Math.max(0.5, v))}
            isDark={isDark}
          />
          {[2, 5, 10, 15, 20, 30].map((rVal) => (
            <button
              key={rVal}
              type="button"
              onClick={() => setFilletR(rVal)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors",
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

    /* 4. SUBSTITUIÇÃO INLINE: OFFSET */
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
            onChange={(v) => setOffsetDist(Math.max(0.1, v))}
            isDark={isDark}
          />
          {[2, 5, 10, 15, 25, 50].map((dVal) => (
            <button
              key={dVal}
              type="button"
              onClick={() => setOffsetDist(dVal)}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors",
                Math.abs(offsetDist - dVal) < 0.05
                  ? "bg-[#0EA5E9] text-white"
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

    /* 5. SUB-PAINÉIS INLINE ACIONADOS PELO CARROSSEL */
    if (inlineSubPanel === "workspace") {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          <button
            type="button"
            onClick={() => onUpdateFrame({ visible: !frame.visible })}
            className={cn(
              "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase",
              frame.visible
                ? "bg-[#0EA5E9] text-white"
                : isDark
                  ? "bg-[#11141C] text-[#94A3B8]"
                  : "bg-white text-[#475569] border border-[#E2E8F0]",
            )}
          >
            {frame.visible ? "Área: ON" : "Área: OFF"}
          </button>

          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onOpenWorkspaceKeypad("w", { x: r.left, y: Math.max(160, r.top - 160) });
            }}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 font-mono text-[10px] font-bold",
              isDark
                ? "border-white/[0.1] bg-[#11141C] text-[#38BDF8]"
                : "border-[#CBD5E1] bg-white text-[#0284C7]",
            )}
          >
            <span>X: {Math.round(frame.w)}mm</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onOpenWorkspaceKeypad("h", { x: r.left, y: Math.max(160, r.top - 160) });
            }}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 font-mono text-[10px] font-bold",
              isDark
                ? "border-white/[0.1] bg-[#11141C] text-[#38BDF8]"
                : "border-[#CBD5E1] bg-white text-[#0284C7]",
            )}
          >
            <span>Y: {Math.round(frame.h)}mm</span>
          </button>

          {WORKSPACE_INDUSTRIAL_PRESETS.map((pr) => (
            <button
              key={pr.id}
              type="button"
              onClick={() => {
                onUpdateFrame({ w: pr.w, h: pr.h, visible: true });
                setTimeout(() => onFitWorkspace(), 20);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold",
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
              "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 font-mono text-[10px] font-bold",
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
              "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 font-mono text-[10px] font-bold",
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
          <span className="font-mono text-[10px] font-bold uppercase text-[#94A3B8]">
            Divisão Snap:
          </span>
          {[0, 2, 3, 4, 6, 8, 12, 16].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onSetSnapDivision(n);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors",
                snapDivision === n || (n === 0 && snapDivision < 2)
                  ? "bg-[#0EA5E9] text-white"
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
              "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase",
              showGrid
                ? "bg-[#0EA5E9] text-white"
                : isDark
                  ? "bg-[#11141C] text-[#94A3B8]"
                  : "bg-white text-[#475569] border border-[#E2E8F0]",
            )}
          >
            {showGrid ? "Grid: ON" : "Grid: OFF"}
          </button>
          {[1, 2, 5, 10, 20, 25, 50, 100].map((gVal) => (
            <button
              key={gVal}
              type="button"
              onClick={() => {
                setGrid(gVal);
                setShowGrid(() => true);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold",
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
          <span className="font-mono text-[10px] font-bold uppercase text-[#94A3B8]">
            Chapa (mm):
          </span>
          {[0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 4.75, 6.35, 9.5, 12.7, 15.8, 19.0].map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onThicknessChange(th);
              }}
              className={cn(
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold",
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
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10.5px] font-bold",
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
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10.5px] font-bold",
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
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10.5px] font-bold",
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

    if (inlineSubPanel === "layer") {
      const layerChoices = [
        { id: "corte", label: "Corte", color: isDark ? "#F8FAFC" : "#0F172A" },
        { id: "dobra", label: "Dobra", color: "#EC4899" },
        { id: "recorte", label: "Recorte", color: "#F59E0B" },
        { id: "marcacao", label: "Marcação", color: "#3B82F6" },
      ];
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-x-auto px-2.5 scrollbar-none touch-pan-x whitespace-nowrap">
          <InlineBackButton onClick={() => setInlineSubPanel("none")} isDark={isDark} label="Voltar" />
          {layerChoices.map((lc) => (
            <button
              key={lc.id}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setActiveLayer(lc.id);
              }}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10.5px] font-bold",
                activeLayer === lc.id
                  ? "border-[#E11D48] bg-[#E11D48]/20 text-white"
                  : isDark
                    ? "border-white/[0.08] bg-[#11141C] text-[#94A3B8]"
                    : "border-[#E2E8F0] bg-white text-[#475569]",
              )}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: lc.color }} />
              <span>{lc.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onSelectSidebarTab("camadas");
              onSetPortraitDrawerOpen(true);
              setInlineSubPanel("none");
            }}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#0EA5E9] px-2.5 font-mono text-[10px] font-bold text-white"
          >
            <Layers className="size-3" />
            <span>Gerenciar Camadas</span>
          </button>
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
                "h-8 shrink-0 rounded-lg px-2.5 font-mono text-[10.5px] font-bold transition-colors",
                tool === "dim" && dimKind === dc.id
                  ? "bg-[#0EA5E9] text-white"
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

    /* CARROSSEL PADRÃO DO MODO ATIVO NO DOCK */
    return (
      <div className="flex h-full w-full items-center gap-0.5 overflow-x-auto px-1.5 scrollbar-none touch-pan-x">
        {/* MODO 1: DESENHO & CRIAÇÃO (SEL + CRI + DET) */}
        {dockMode === "desenho" && (
          <>
            <CarouselToolItem
              icon={MousePointer2}
              label="Ponteiro"
              active={tool === "select"}
              onClick={() => onPickTool("select")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={ControlNodesIcon as unknown as typeof Minus}
              label="Nós"
              active={tool === "node"}
              onClick={() => onPickTool("node")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Hand}
              label="Pan"
              active={tool === "pan"}
              onClick={() => onPickTool("pan")}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={Minus}
              label="Linha"
              active={tool === "line"}
              onClick={() => onPickTool("line")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={PenLine}
              label="Polilinha"
              active={tool === "polyline"}
              onClick={() => onPickTool("polyline")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={CircleIcon}
              label="Círculo"
              active={tool === "circle"}
              onClick={() => onPickTool("circle")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Square}
              label="Retângulo"
              active={tool === "rect"}
              onClick={() => onPickTool("rect")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Compass}
              label="Arco"
              active={tool === "arc"}
              onClick={() => onPickTool("arc")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Minus}
              label="Rasgo"
              active={tool === "slot"}
              onClick={() => onPickTool("slot")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Hexagon}
              label="Polígono"
              active={tool === "polygon"}
              onClick={() => onPickTool("polygon")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Egg}
              label="Elipse"
              active={tool === "ellipse"}
              onClick={() => onPickTool("ellipse")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sparkles}
              label="Spline"
              active={tool === "spline"}
              onClick={() => onPickTool("spline")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Crosshair}
              label="Eixo XL"
              active={tool === "construction_line"}
              onClick={() => onPickTool("construction_line")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Dot}
              label="Ponto"
              active={tool === "point"}
              onClick={() => onPickTool("point")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Type}
              label="Texto"
              active={tool === "text"}
              onClick={() => onPickTool("text")}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={CircleDot}
              label="Furo Ø"
              active={false}
              onClick={onAddHole}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Boxes}
              label="Presets"
              active={false}
              onClick={onOpenPresets}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sparkles}
              label="Projeção Iso"
              active={false}
              onClick={onOpenPieceBuilder}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Box}
              label="Extrude 3D"
              active={activeMode === "3d"}
              onClick={() => onModeChange("3d")}
              isDark={isDark}
            />
          </>
        )}

        {/* MODO 2: MODIFICAR & EDIÇÃO */}
        {dockMode === "modificar" && (
          <>
            <CarouselToolItem
              icon={Scissors}
              label="Aparar"
              active={tool === "trim"}
              onClick={() => onPickTool("trim")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Scissors}
              label="Encontro"
              active={tool === "smart_trim"}
              onClick={() => onPickTool("smart_trim")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={CornerDownRight}
              label="Offset"
              active={tool === "offset"}
              onClick={() => onPickTool("offset")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sparkles}
              label="Filete R"
              active={tool === "fillet"}
              onClick={() => onPickTool("fillet")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sparkles}
              label="Chanfro"
              active={tool === "chamfer"}
              onClick={() => onPickTool("chamfer")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={RotateCw}
              label="Array Polar"
              active={activeArrayType === "polar"}
              onClick={onArrayPolar}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Copy}
              label="Array Linear"
              active={activeArrayType === "linear"}
              onClick={onArrayLinear}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={Move}
              label="Mover"
              disabled={!hasSelection}
              onClick={onMoveSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Copy}
              label="Copiar"
              disabled={!hasSelection}
              onClick={onCopySelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={ClipboardList}
              label="Colar/Clip"
              onClick={onOpenClipboard}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={RotateCw}
              label="Girar 90°"
              disabled={!hasSelection}
              onClick={onRotateSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={FlipHorizontal}
              label="Espelhar"
              disabled={!hasSelection}
              onClick={onMirrorSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Maximize2}
              label="Escalar"
              disabled={!hasSelection}
              onClick={onScaleSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={AlignCenter}
              label="Centralizar"
              disabled={!hasSelection}
              onClick={onCenterSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Divide}
              label="Dividir"
              active={tool === "divide" || divideEditorOpen}
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
              icon={Maximize}
              label="Estender"
              active={tool === "extend"}
              onClick={() => onPickTool("extend")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Combine}
              label="Unir"
              disabled={!hasSelection}
              onClick={onJoinSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Split}
              label="Quebrar"
              disabled={!hasSelection}
              onClick={onBreakSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Split}
              label="Explodir"
              disabled={!hasSelection}
              onClick={onExplodeSelection}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Combine}
              label="Booleana"
              onClick={() => setInlineSubPanel("boolean")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Layers}
              label="Hachura"
              disabled={!hasSelection}
              onClick={onCreateHatch}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sparkles}
              label="Overkill"
              onClick={onOverkillClean}
              isDark={isDark}
            />
          </>
        )}

        {/* MODO 3: PRECISÃO & MEDIÇÃO */}
        {dockMode === "precisao" && (
          <>
            <CarouselToolItem
              icon={Magnet}
              label={snapOn ? "Snap: ON" : "Snap: OFF"}
              active={snapOn}
              onClick={() => setSnapOn((s) => !s)}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Divide}
              label={snapDivision >= 2 ? `Div. ${snapDivision}p` : "Div. Snap"}
              active={snapDivision >= 2}
              onClick={() => setInlineSubPanel("snap_div")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Eye}
              label="Todos Snaps"
              active={showAllSnaps}
              onClick={onToggleShowAllSnaps}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Crosshair}
              label="Guia Azul"
              active={interactionGuideMode === "blue_line"}
              onClick={() =>
                onSetInteractionGuideMode(
                  interactionGuideMode === "blue_line" ? "off" : "blue_line",
                )
              }
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Crosshair}
              label="Guia Roxa"
              active={interactionGuideMode === "purple_ref"}
              onClick={() =>
                onSetInteractionGuideMode(
                  interactionGuideMode === "purple_ref" ? "off" : "purple_ref",
                )
              }
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Crosshair}
              label="REF 0,0"
              active={Boolean(temporaryOrigin)}
              onClick={onStartSetReferencePoint}
              isDark={isDark}
            />
            {temporaryOrigin && (
              <CarouselToolItem
                icon={X}
                label="Limpar REF"
                onClick={onClearTemporaryOrigin}
                isDark={isDark}
              />
            )}
            <CarouselToolItem
              icon={Crosshair}
              label="Orto 90°"
              active={orthoOn}
              onClick={() => setOrthoOn((o) => !o)}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Compass}
              label="Tracking"
              active={trackingOn}
              onClick={() => setTrackingOn((t) => !t)}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={Ruler}
              label="Cotar"
              active={tool === "dim"}
              onClick={() => setInlineSubPanel("cotar")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Disc}
              label="Cota Ø"
              active={tool === "dim" && dimKind === "diameter"}
              onClick={() => {
                onPickDimKind("diameter");
                onPickTool("dim");
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Compass}
              label="Cota Âng."
              active={tool === "dim" && dimKind === "angle"}
              onClick={() => {
                onPickDimKind("angle");
                onPickTool("dim");
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Ruler}
              label="Medir"
              active={tool === "measure"}
              onClick={() => onPickTool("measure")}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={Crosshair}
              label={cursorOffsetMode === "offset" ? "Mira 55px" : "Mira 1:1"}
              active={cursorOffsetMode === "offset"}
              onClick={onToggleCursorOffsetMode}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Eye}
              label={`Lupa: ${loupeMode === "off" ? "OFF" : loupeMode === "pinned" ? "Fixa" : "Auto"}`}
              active={loupeMode !== "off"}
              onClick={onCycleLoupeMode}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sliders}
              label="Nudge Fino"
              active={nudgeHudVisible}
              onClick={onToggleNudgeHud}
              isDark={isDark}
            />
          </>
        )}

        {/* MODO 4: CHAPA, ESTRUTURA & VISION */}
        {dockMode === "chapa_vision" && (
          <>
            <CarouselToolItem
              icon={Layers}
              label="Flange/Aba"
              active={activeMode === "flanges"}
              onClick={onOpenFlanges}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={FoldHorizontal}
              label="Linha Dobra"
              onClick={onConvertToBend}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sparkles}
              label="Alívio"
              onClick={onApplyRelief}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={ArrowRightLeft}
              label="Planificar"
              onClick={onPlanificar}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={FoldHorizontal}
              label="Desdobrar"
              onClick={onUnfold}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Layers}
              label="Dobrar 3D"
              onClick={onFold}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sliders}
              label={`${thickness.toFixed(1)}mm`}
              onClick={() => setInlineSubPanel("thickness")}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={ScanEye}
              label="Foto 1:1"
              onClick={onOpenVisionModal}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Compass}
              label="Eng. Rev A→F"
              active={portraitDrawerOpen && activeSidebarTab === "eng_rev"}
              onClick={() => {
                onOpenRevEngCategory("referencias", "A");
                onSelectSidebarTab("eng_rev");
                onSetPortraitDrawerOpen(true);
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Ruler}
              label="Paquímetro"
              onClick={() => {
                onOpenRevEngCategory("caderno", "B");
                onSelectSidebarTab("eng_rev");
                onSetPortraitDrawerOpen(true);
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={CircleDot}
              label="Bancada PCD"
              onClick={() => {
                onOpenRevEngCategory("furos_cadeias", "D");
                onSelectSidebarTab("eng_rev");
                onSetPortraitDrawerOpen(true);
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Boxes}
              label="Cavidades"
              onClick={() => {
                onOpenRevEngCategory("cavidades_dentes", "E");
                onSelectSidebarTab("eng_rev");
                onSetPortraitDrawerOpen(true);
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Compass}
              label="Ajuste LSQ"
              onClick={() => {
                onOpenRevEngCategory("contorno_ajuste", "C");
                onSelectSidebarTab("eng_rev");
                onSetPortraitDrawerOpen(true);
              }}
              isDark={isDark}
            />

            <CarouselDivider isDark={isDark} />

            <CarouselToolItem
              icon={Boxes}
              label="Perfil/Tubo"
              onClick={onOpenPresets}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Flame}
              label="Solda"
              onClick={() => {
                onSelectSidebarTab("propriedades");
                onSetPortraitDrawerOpen(true);
              }}
              isDark={isDark}
            />
          </>
        )}

        {/* MODO 5: INSPETOR & MESA */}
        {dockMode === "inspetor" && (
          <>
            <CarouselToolItem
              icon={Sliders}
              label="Propriedades"
              active={portraitDrawerOpen && activeSidebarTab === "propriedades"}
              onClick={() => {
                if (portraitDrawerOpen && activeSidebarTab === "propriedades") {
                  onSetPortraitDrawerOpen(false);
                } else {
                  onSelectSidebarTab("propriedades");
                  onSetPortraitDrawerOpen(true);
                }
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Layers}
              label={`Cor: ${layerLabel}`}
              onClick={() => setInlineSubPanel("layer")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Layers}
              label="Camadas"
              active={portraitDrawerOpen && activeSidebarTab === "camadas"}
              onClick={() => {
                if (portraitDrawerOpen && activeSidebarTab === "camadas") {
                  onSetPortraitDrawerOpen(false);
                } else {
                  onSelectSidebarTab("camadas");
                  onSetPortraitDrawerOpen(true);
                }
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Maximize2}
              label={`Área ${Math.round(frame.w)}×${Math.round(frame.h)}`}
              active={frame.visible}
              onClick={() => setInlineSubPanel("workspace")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Grid}
              label={`Grid: ${grid}mm`}
              active={showGrid}
              onClick={() => setInlineSubPanel("grid")}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Crosshair}
              label="Enquadrar"
              onClick={() => onCenterPiece(false)}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Scissors}
              label="Corte CNC"
              active={portraitDrawerOpen && activeSidebarTab === "corte"}
              onClick={() => {
                if (portraitDrawerOpen && activeSidebarTab === "corte") {
                  onSetPortraitDrawerOpen(false);
                } else {
                  onSelectSidebarTab("corte");
                  onSetPortraitDrawerOpen(true);
                }
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Activity}
              label="Simular CNC"
              active={simOn}
              onClick={onToggleSim}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={ArrowRightLeft}
              label="Fluxo Corte"
              active={showArrows}
              onClick={onToggleArrows}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Ruler}
              label="Painel Cotas"
              active={portraitDrawerOpen && activeSidebarTab === "cotas"}
              onClick={() => {
                if (portraitDrawerOpen && activeSidebarTab === "cotas") {
                  onSetPortraitDrawerOpen(false);
                } else {
                  onSelectSidebarTab("cotas");
                  onSetPortraitDrawerOpen(true);
                }
              }}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Activity}
              label="Topologia"
              onClick={onOpenTopologyHealth}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={Sliders}
              label="Variáveis"
              onClick={onOpenVariables}
              isDark={isDark}
            />
            <CarouselToolItem
              icon={FileText}
              label="Folha A4/A3"
              onClick={onOpenTechnicalSheet}
              isDark={isDark}
            />
          </>
        )}
      </div>
    );
  };

  const dockModes: {
    id: PortraitDockMode;
    label: string;
    icon: typeof Minus;
    accent: "crimson" | "blue";
  }[] = [
    { id: "desenho", label: "Desenho", icon: Compass, accent: "crimson" },
    { id: "modificar", label: "Modificar", icon: Scissors, accent: "crimson" },
    { id: "precisao", label: "Precisão", icon: Crosshair, accent: "blue" },
    { id: "chapa_vision", label: "Chapa & 1:1", icon: Layers, accent: "crimson" },
    { id: "inspetor", label: "Inspetor", icon: Sliders, accent: "blue" },
  ];

  return (
    <section
      aria-label="Controles Inferiores CHAMFER CAD Retrato"
      className="relative z-40 flex w-full shrink-0 flex-col select-none"
    >
      {/* BARRA INFERIOR NÍVEL 1 (Acima do Dock — Carrossel Contextual Horizontal — height: 60px) */}
      <div
        style={{ height: 60 }}
        className={cn(
          "flex w-full shrink-0 items-center border-t transition-colors",
          isDark
            ? "border-white/[0.07] bg-[#181C26] text-[#F8FAFC]"
            : "border-[#E2E8F0] bg-white text-[#0F172A]",
        )}
      >
        {renderLevel1Content()}
      </div>

      {/* BARRA INFERIOR NÍVEL 2 (Base da Tela — Seletor de 5 Modos Estilo Lightroom — height: 54px) */}
      <nav
        aria-label="Modos principais CHAMFER CAD"
        style={{ height: 54 }}
        className={cn(
          "grid w-full shrink-0 grid-cols-5 items-center border-t px-1 transition-colors",
          isDark
            ? "border-white/[0.07] bg-[#11141C] text-[#94A3B8]"
            : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]",
        )}
      >
        {dockModes.map((m) => {
          const Icon = m.icon;
          const isActive = dockMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelectDockMode(m.id)}
              className="group relative flex h-full w-full flex-col items-center justify-center cursor-pointer touch-manipulation"
            >
              <div
                style={{ width: 40, height: 34 }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl transition-all duration-150",
                  isActive
                    ? m.accent === "crimson"
                      ? "bg-[#E11D48] text-white shadow-sm shadow-[#E11D48]/30"
                      : "bg-[#0EA5E9] text-white shadow-sm shadow-[#0EA5E9]/30"
                    : isDark
                      ? "text-[#94A3B8] group-hover:text-[#F8FAFC]"
                      : "text-[#475569] group-hover:text-[#0F172A]",
                )}
              >
                <Icon className="size-4" />
              </div>
              <span
                className={cn(
                  "mt-0.5 font-mono text-[9px] font-bold tracking-tight leading-none",
                  isActive
                    ? isDark
                      ? "text-[#F8FAFC]"
                      : "text-[#0F172A]"
                    : isDark
                      ? "text-[#94A3B8]"
                      : "text-[#475569]",
                )}
              >
                {m.label}
              </span>
              {isActive && (
                <span
                  className={cn(
                    "absolute bottom-0.5 size-1 rounded-full",
                    m.accent === "crimson" ? "bg-[#E11D48]" : "bg-[#0EA5E9]",
                  )}
                />
              )}
            </button>
          );
        })}
      </nav>
    </section>
  );
}

/* ============================================================================
 * SUBCOMPONENTES DE ITEM DE CARROSSEL E SUBSTITUIÇÃO INLINE
 * ============================================================================ */
function CarouselToolItem({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  isDark,
}: {
  icon: typeof Minus;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        triggerHaptic("selection");
        onClick();
      }}
      style={{ minWidth: 64 }}
      className={cn(
        "relative flex h-[52px] shrink-0 flex-col items-center justify-center rounded-xl px-1.5 transition-all touch-manipulation cursor-pointer",
        disabled
          ? "opacity-35 cursor-not-allowed"
          : active
            ? isDark
              ? "bg-white/[0.08] text-[#F8FAFC]"
              : "bg-[#0F172A]/[0.06] text-[#0F172A]"
            : isDark
              ? "text-[#94A3B8] hover:bg-white/[0.04] hover:text-[#F8FAFC]"
              : "text-[#475569] hover:bg-[#0F172A]/[0.04] hover:text-[#0F172A]",
      )}
    >
      <Icon
        className={cn(
          "size-4 transition-transform",
          active && "scale-105 text-[#E11D48]",
        )}
      />
      <span
        style={{ fontSize: "10.5px" }}
        className={cn(
          "mt-1 font-mono leading-none tracking-tight whitespace-nowrap",
          active ? "font-bold" : "font-medium",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "mt-1 size-1 rounded-full transition-opacity",
          active ? "bg-[#E11D48] opacity-100 shadow-[0_0_6px_#E11D48]" : "opacity-0",
        )}
      />
    </button>
  );
}

function CarouselDivider({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={cn(
        "mx-1 h-7 w-px shrink-0",
        isDark ? "bg-white/[0.08]" : "bg-[#E2E8F0]",
      )}
    />
  );
}

function InlineBackButton({
  onClick,
  label,
  isDark,
}: {
  onClick: () => void;
  label: string;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic("tap");
        onClick();
      }}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 font-mono text-[10.5px] font-bold transition-colors active:scale-95",
        isDark
          ? "border-white/[0.1] bg-[#11141C] text-[#F8FAFC] hover:bg-[#222836]"
          : "border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#E2E8F0]",
      )}
    >
      <ArrowLeft className="size-3.5 text-[#E11D48]" />
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
      className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-[#E11D48] px-3 font-mono text-[10.5px] font-bold text-white shadow-sm shadow-[#E11D48]/30 active:scale-95"
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
        className="px-1.5 font-bold text-[#94A3B8] hover:text-foreground"
      >
        −
      </button>
      <span className="min-w-[18px] text-center font-bold text-[#38BDF8]">{value}</span>
      <button
        type="button"
        onClick={() => {
          triggerHaptic("tap");
          onStep(1);
        }}
        className="px-1.5 font-bold text-[#94A3B8] hover:text-foreground"
      >
        +
      </button>
    </div>
  );
}

function InlineNumberInputPill({
  label,
  value,
  unit,
  onChange,
  isDark,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (val: number) => void;
  isDark: boolean;
}) {
  return (
    <label
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2 font-mono text-[10.5px]",
        isDark ? "border-white/[0.08] bg-[#11141C]" : "border-[#CBD5E1] bg-white",
      )}
    >
      <span className="text-[#94A3B8] font-bold">{label}:</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={cn(
          "w-12 bg-transparent text-center font-mono text-[10.5px] font-bold outline-none",
          isDark ? "text-[#F8FAFC]" : "text-[#0F172A]",
        )}
      />
      <span className="text-[9.5px] text-[#94A3B8]">{unit}</span>
    </label>
  );
}
