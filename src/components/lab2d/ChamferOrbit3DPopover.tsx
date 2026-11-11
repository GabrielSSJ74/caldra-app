/**
 * CHAMFER CAD — COMANDO DE BARRA SUPERIOR "⟳ ÓRBITA 3D" E PAINEL FLUTUANTE DE PERSPECTIVA
 *
 * Especificação visual e técnica:
 * - Incorporado na barra superior ao lado de [ ORTO 2D | ISO 2D ], ativo tanto em 2D SKETCH quanto em CAD 3D.
 * - Popover compacto em estilo técnico escuro translúcido (Glassmorphism):
 *   background: rgba(15, 23, 42, 0.94), backdrop-filter: blur(12px),
 *   border: 1px solid rgba(148, 163, 184, 0.18), border-radius: 10px, z-index: 60.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Compass, Rotate3d } from "lucide-react";
import {
  ORBIT_PRESETS,
  getOrbitPresetDefinition,
  isFlatTop2DView,
  type OrbitPresetId,
} from "@/lib/lab2d/orbit3dController";
import {
  DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
  type ChamferWireframe3DStyleConfig,
} from "@/lib/lab2d/chamferWireframe3D";
import {
  loadZoomSensitivityConfig,
  saveZoomSensitivityConfig,
  ZOOM_SENSITIVITY_PRESETS,
  type ZoomSensitivityConfig,
  type ZoomSensitivityPresetId,
} from "@/lib/lab2d/chamferAdaptiveZoom";
import {
  loadBRepWireframeLayerConfig,
  saveBRepWireframeLayerConfig,
  type BRepWireframeLayerConfig,
} from "@/lib/lab2d/chamferBRepWireframe3D";
import type { EdgeMode } from "@/lib/viz3d/cameraPresets";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";

export interface ChamferOrbit3DPopoverProps {
  azimuthDeg: number;
  elevationDeg: number;
  activePreset: OrbitPresetId;
  isOrbitToolActive: boolean;
  onToggleOrbitTool: (nextActive?: boolean) => void;
  onSelectPreset: (presetId: OrbitPresetId) => void;
  isDark?: boolean;
  renderStyle3D?: EdgeMode;
  onChangeRenderStyle3D?: (mode: EdgeMode) => void;
  wireframe3DStyle?: ChamferWireframe3DStyleConfig;
  onChangeWireframe3DStyle?: (next: ChamferWireframe3DStyleConfig) => void;
  zoomSensitivity?: ZoomSensitivityConfig;
  onChangeZoomSensitivity?: (next: ZoomSensitivityConfig) => void;
  brepWireframeLayers?: BRepWireframeLayerConfig;
  onChangeBrepWireframeLayers?: (next: BRepWireframeLayerConfig) => void;
}

/** Ícone técnico vetorial de Órbita 3D com anel elíptico e tríade de eixos */
function TechnicalOrbit3DIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Anel orbital elíptico */}
      <ellipse
        cx="10"
        cy="10.5"
        rx="8"
        ry="4.2"
        transform="rotate(-18 10 10.5)"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="2.5 1.5"
      />
      {/* Eixo Z vertical */}
      <path d="M10 10.5V3" stroke="#38BDF8" strokeWidth="1.6" strokeLinecap="round" />
      {/* Eixo X direita */}
      <path d="M10 10.5L16.2 13.8" stroke="#EF4444" strokeWidth="1.6" strokeLinecap="round" />
      {/* Eixo Y esquerda */}
      <path d="M10 10.5L4 13.8" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" />
      {/* Centro */}
      <circle cx="10" cy="10.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export const ChamferOrbit3DPopover = React.memo(function ChamferOrbit3DPopover({
  azimuthDeg,
  elevationDeg,
  activePreset,
  isOrbitToolActive,
  onToggleOrbitTool,
  onSelectPreset,
  isDark = true,
  renderStyle3D = "shaded-edges",
  onChangeRenderStyle3D,
  wireframe3DStyle = DEFAULT_CHAMFER_WIREFRAME_3D_STYLE,
  onChangeWireframe3DStyle,
  zoomSensitivity: zoomSensitivityProp,
  onChangeZoomSensitivity,
  brepWireframeLayers: brepWireframeLayersProp,
  onChangeBrepWireframeLayers,
}: ChamferOrbit3DPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [localZoomSens, setLocalZoomSens] = useState<ZoomSensitivityConfig>(() =>
    loadZoomSensitivityConfig(),
  );
  const [localBrepLayers, setLocalBrepLayers] = useState<BRepWireframeLayerConfig>(() =>
    loadBRepWireframeLayerConfig(),
  );

  const effectiveZoomSens = zoomSensitivityProp ?? localZoomSens;
  const effectiveBrepLayers = brepWireframeLayersProp ?? localBrepLayers;

  const updateZoomSens = (next: ZoomSensitivityConfig) => {
    const saved = saveZoomSensitivityConfig(next);
    setLocalZoomSens(saved);
    onChangeZoomSensitivity?.(saved);
  };

  const updateBrepLayers = (next: BRepWireframeLayerConfig) => {
    const saved = saveBRepWireframeLayerConfig(next);
    setLocalBrepLayers(saved);
    onChangeBrepWireframeLayers?.(saved);
  };

  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  const presetDef = getOrbitPresetDefinition(activePreset);
  const isTilted = !isFlatTop2DView(azimuthDeg, elevationDeg);
  const activeBadgeLabel =
    activePreset === "free"
      ? isTilted
        ? "LIVRE"
        : "SUP 2D"
      : presetDef.shortLabel;

  const updateAnchorPosition = () => {
    const el = triggerWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuWidth = Math.min(276, window.innerWidth - 16);
    const clampedLeft = Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8));
    setAnchorRect({
      left: clampedLeft,
      top: r.bottom + 6,
      width: r.width,
    });
  };

  useEffect(() => {
    if (!popoverOpen) return;
    updateAnchorPosition();
    const handleResizeOrScroll = () => updateAnchorPosition();
    const handlePointerDownOutside = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (triggerWrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setPopoverOpen(false);
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setPopoverOpen(false);
      }
    };

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    document.addEventListener("pointerdown", handlePointerDownOutside, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen]);

  const handleMainButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    if (!isOrbitToolActive) {
      onToggleOrbitTool(true);
      setPopoverOpen(true);
    } else if (!popoverOpen) {
      setPopoverOpen(true);
    } else {
      onToggleOrbitTool(false);
      setPopoverOpen(false);
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("tap");
    AudioManager.play("ui_toggle_open");
    setPopoverOpen((prev) => !prev);
  };

  const handlePickPreset = (presetId: OrbitPresetId) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    onSelectPreset(presetId);
    setPopoverOpen(false);
  };

  return (
    <div ref={triggerWrapRef} className="relative flex shrink-0 items-center">
      <div
        className={cn(
          "flex items-center rounded-lg border p-0.5 shadow-xs transition-colors",
          isOrbitToolActive
            ? "border-[#38BDF8] bg-[rgba(14,165,233,0.22)] ring-1 ring-[#38BDF8]/30"
            : isTilted
              ? isDark
                ? "border-[#38BDF8]/55 bg-[#232E45]"
                : "border-sky-400/60 bg-sky-50"
              : isDark
                ? "border-[#334361] bg-[#232E45]"
                : "border-slate-200 bg-slate-100",
        )}
      >
        {/* Botão principal: ⟳ ÓRBITA 3D */}
        <button
          type="button"
          onClick={handleMainButtonClick}
          data-testid="chamfer-orbit3d-btn"
          aria-pressed={isOrbitToolActive}
          aria-expanded={popoverOpen}
          title="Órbita 3D: rotacionar perspectiva livremente ou selecionar vista predefinida"
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap",
            isOrbitToolActive
              ? "bg-[rgba(14,165,233,0.22)] text-[#F8FAFC] shadow-xs"
              : isTilted
                ? isDark
                  ? "bg-[rgba(14,165,233,0.18)] text-[#7DD3FC] hover:bg-[rgba(14,165,233,0.28)] hover:text-white"
                  : "bg-sky-600 text-white"
                : isDark
                  ? "text-[#E2E8F0] hover:bg-[#2D3B55] hover:text-white"
                  : "text-slate-700 hover:bg-slate-200 hover:text-slate-950",
          )}
        >
          <TechnicalOrbit3DIcon className="size-3.5 shrink-0" />
          <span>⟳ ÓRBITA 3D</span>
          <span
            data-testid="chamfer-orbit3d-active-badge"
            className={cn(
              "rounded px-1 py-0.2 font-mono text-[8.5px] font-extrabold tracking-tight",
              isOrbitToolActive
                ? "bg-[#162A42] text-[#7DD3FC] border border-[#38BDF8]/50"
                : isTilted
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                  : isDark
                    ? "bg-[#1B2436] text-[#CBD5E1] border border-[#334361]"
                    : "bg-slate-200 text-slate-600",
            )}
          >
            {activeBadgeLabel}
          </span>
        </button>

        {/* Seta de abertura rápida do painel suspenso PERSPECTIVA */}
        <button
          type="button"
          onClick={handleChevronClick}
          data-testid="chamfer-orbit3d-dropdown-trigger"
          aria-label="Abrir painel de perspectivas 3D"
          title="Escolher perspectiva predefinida (Superior, Isométrica, Frontal, Lateral...)"
          className={cn(
            "ml-0.5 flex h-6 w-5 items-center justify-center rounded-md transition-colors cursor-pointer",
            popoverOpen
              ? "bg-cyan-500/25 text-cyan-300"
              : isDark
                ? "text-[#CBD5E1] hover:bg-[#2D3B55] hover:text-white"
                : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
          )}
        >
          <ChevronDown
            className={cn("size-3 transition-transform duration-150", popoverOpen && "rotate-180")}
          />
        </button>
      </div>

      {/* PAINEL FLUTUANTE DE PERSPECTIVAS, SENSIBILIDADE DE ZOOM E ARAME B-REP */}
      {popoverOpen &&
        anchorRect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="PERSPECTIVA — Vistas 3D, Zoom Adaptativo e Arame B-Rep"
            data-testid="chamfer-orbit3d-popover"
            onWheel={(ev) => ev.stopPropagation()}
            onTouchStart={(ev) => ev.stopPropagation()}
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{
              position: "fixed",
              left: `${anchorRect.left}px`,
              top: `${anchorRect.top}px`,
              width: "276px",
              maxWidth: "94vw",
              maxHeight: "calc(100dvh - 76px)",
              overflowY: "auto",
              background: "rgba(15, 23, 42, 0.96)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "10px",
              zIndex: 60,
            }}
            className="p-2 text-slate-100 shadow-2xl select-none animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Cabeçalho do Popover */}
            <div className="mb-1.5 flex items-center justify-between border-b border-slate-800/80 pb-1.5 px-1">
              <div className="flex items-center gap-1.5">
                <Compass className="size-3.5 text-cyan-400" />
                <span className="font-mono text-[10px] font-bold tracking-widest text-slate-200 uppercase">
                  PERSPECTIVA
                </span>
              </div>
              <span className="font-mono text-[9px] text-cyan-400 tabular-nums">
                θ {Math.round(azimuthDeg)}° · φ {Math.round(elevationDeg)}°
              </span>
            </div>

            {/* Alternador rápido de Arraste de Órbita por Toque */}
            <div className="mb-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onToggleOrbitTool(!isOrbitToolActive);
                  setPopoverOpen(false);
                }}
                data-testid="chamfer-orbit3d-toggle-free-drag"
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                  isOrbitToolActive
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200 shadow-xs"
                    : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Rotate3d className="size-3.5 text-cyan-400" />
                  <span>Livre / Órbita por Toque</span>
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[8.5px] uppercase",
                    isOrbitToolActive
                      ? "bg-cyan-500 text-slate-950 font-extrabold"
                      : "bg-slate-800 text-slate-400",
                  )}
                >
                  {isOrbitToolActive ? "ATIVO" : "ATIVAR"}
                </span>
              </button>
            </div>

            {/* SELETOR DE REPRESENTAÇÃO VISUAL 3D (SÓLIDO / SOMB / ARAME) */}
            {onChangeRenderStyle3D && (
              <div className="mb-1.5 rounded-lg border border-slate-800/90 bg-slate-900/60 p-1">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="font-mono text-[8.5px] font-bold tracking-wider text-slate-400 uppercase">
                    ESTILO DE VISUALIZAÇÃO 3D
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    data-testid="chamfer-orbit3d-style-solid-edges"
                    onClick={() => {
                      triggerHaptic("selection");
                      AudioManager.play("ui_select");
                      onChangeRenderStyle3D("shaded-edges");
                    }}
                    className={cn(
                      "rounded px-1.5 py-1 font-mono text-[9px] font-bold uppercase transition-colors cursor-pointer text-center",
                      renderStyle3D === "shaded-edges"
                        ? "bg-cyan-600 text-white shadow-xs"
                        : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                    )}
                    title="Sólido Metálico 3D com Arestas Técnicas Visíveis"
                  >
                    SÓLIDO
                  </button>
                  <button
                    type="button"
                    data-testid="chamfer-orbit3d-style-solid"
                    onClick={() => {
                      triggerHaptic("selection");
                      AudioManager.play("ui_select");
                      onChangeRenderStyle3D("shaded");
                    }}
                    className={cn(
                      "rounded px-1.5 py-1 font-mono text-[9px] font-bold uppercase transition-colors cursor-pointer text-center",
                      renderStyle3D === "shaded"
                        ? "bg-cyan-600 text-white shadow-xs"
                        : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                    )}
                    title="Sombreamento Técnico de Engenharia (Matcap Técnico)"
                  >
                    SOMB
                  </button>
                  <button
                    type="button"
                    data-testid="chamfer-orbit3d-style-wireframe"
                    onClick={() => {
                      triggerHaptic("selection");
                      AudioManager.play("ui_select");
                      onChangeRenderStyle3D("wireframe");
                    }}
                    className={cn(
                      "rounded px-1.5 py-1 font-mono text-[9px] font-bold uppercase transition-colors cursor-pointer text-center",
                      renderStyle3D === "wireframe"
                        ? "bg-cyan-600 text-white shadow-xs"
                        : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                    )}
                    title="Arame Técnico B-Rep 3D Invariante em Espaço de Tela"
                  >
                    ARAME
                  </button>
                </div>
              </div>
            )}

            {/* SENSIBILIDADE DO ZOOM ADAPTATIVO + ANTI-ESBARRÃO */}
            <div
              data-testid="chamfer-orbit3d-zoom-sensitivity-section"
              className="mb-1.5 rounded-lg border border-slate-800/90 bg-slate-900/60 p-1.5"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[8.5px] font-bold tracking-wider text-slate-300 uppercase">
                  Sensibilidade do Zoom
                </span>
                <span
                  data-testid="chamfer-orbit3d-zoom-sensitivity-value"
                  className="font-mono text-[9px] font-extrabold text-cyan-400 tabular-nums"
                >
                  {effectiveZoomSens.multiplier.toFixed(2)}×
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 mb-1.5">
                {(["low", "medium", "high"] as Array<Exclude<ZoomSensitivityPresetId, "custom">>).map(
                  (presetKey) => {
                    const mult = ZOOM_SENSITIVITY_PRESETS[presetKey];
                    const label =
                      presetKey === "low"
                        ? "Baixa (0.6×)"
                        : presetKey === "medium"
                          ? "Média (1.0×)"
                          : "Alta (1.4×)";
                    const active =
                      effectiveZoomSens.preset === presetKey ||
                      Math.abs(effectiveZoomSens.multiplier - mult) < 0.02;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        data-testid={`chamfer-zoom-sens-${presetKey}`}
                        onClick={() => {
                          triggerHaptic("selection");
                          updateZoomSens({ preset: presetKey, multiplier: mult });
                        }}
                        className={cn(
                          "rounded px-1 py-1 font-mono text-[8.5px] font-bold transition-colors cursor-pointer whitespace-nowrap text-center",
                          active
                            ? "bg-cyan-600 text-white shadow-xs"
                            : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                        )}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </div>
              <div className="flex items-center gap-2 px-0.5">
                <span className="font-mono text-[8px] text-slate-400 tabular-nums">0.3×</span>
                <input
                  type="range"
                  min={0.3}
                  max={2.0}
                  step={0.05}
                  aria-label="Multiplicador fino de sensibilidade do zoom"
                  data-testid="chamfer-zoom-sens-slider"
                  value={effectiveZoomSens.multiplier}
                  onChange={(ev) => {
                    const val = Number(ev.target.value);
                    if (!Number.isFinite(val)) return;
                    const matchedPreset: ZoomSensitivityPresetId =
                      Math.abs(val - 0.6) < 0.02
                        ? "low"
                        : Math.abs(val - 1.0) < 0.02
                          ? "medium"
                          : Math.abs(val - 1.4) < 0.02
                            ? "high"
                            : "custom";
                    updateZoomSens({ preset: matchedPreset, multiplier: val });
                  }}
                  className="h-1.5 flex-1 cursor-pointer accent-cyan-500"
                />
                <span className="font-mono text-[8px] text-slate-400 tabular-nums">2.0×</span>
              </div>
            </div>

            {/* Lista de Vistas Predefinidas */}
            <div className="space-y-0.5 max-h-[210px] overflow-y-auto pr-0.5">
              {ORBIT_PRESETS.filter((p) => p.id !== "free").map((preset) => {
                const isSelected =
                  activePreset === preset.id ||
                  (preset.id === "top" && !isTilted && activePreset !== "free");
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`chamfer-orbit-preset-${preset.id}`}
                    onClick={() => handlePickPreset(preset.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left font-mono text-[10px] transition-colors cursor-pointer",
                      isSelected
                        ? "bg-cyan-500/18 text-cyan-300 font-bold border border-cyan-500/35"
                        : "text-slate-300 hover:bg-slate-800/75 hover:text-white border border-transparent",
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{preset.label}</span>
                      <span className="text-[8.5px] text-slate-400 font-normal truncate">
                        {preset.description}
                      </span>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1">
                      <span className="rounded bg-slate-900/90 px-1.5 py-0.5 text-[8.5px] text-slate-400 border border-slate-800">
                        {preset.shortLabel}
                      </span>
                      {isSelected && <Check className="size-3.5 text-cyan-400 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Camadas B-Rep do Modo ARAME Técnico */}
            {renderStyle3D === "wireframe" && (
              <div className="mt-1.5 border-t border-slate-800/80 pt-1.5 space-y-1">
                <div className="flex items-center justify-between px-1">
                  <span className="font-mono text-[8.5px] font-bold tracking-wider text-slate-300 uppercase">
                    CAMADAS ARAME B-REP
                  </span>
                  {onChangeWireframe3DStyle && (
                    <button
                      type="button"
                      data-testid="chamfer-orbit3d-reset-style"
                      onClick={() => {
                        triggerHaptic("selection");
                        onChangeWireframe3DStyle({ ...DEFAULT_CHAMFER_WIREFRAME_3D_STYLE });
                        updateBrepLayers({
                          showContours: true,
                          showHiddenXRay: true,
                          showAxesCenters: true,
                          showDimensions: true,
                        });
                      }}
                      className="font-mono text-[8px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Restaurar Padrão
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { key: "showContours" as const, label: "Contornos" },
                      { key: "showHiddenXRay" as const, label: "Ocultas (Raio-X)" },
                      { key: "showAxesCenters" as const, label: "Eixos/Centros" },
                      { key: "showDimensions" as const, label: "Cotas/Espessura" },
                    ] as const
                  ).map((layerOpt) => {
                    const isOn = effectiveBrepLayers[layerOpt.key];
                    return (
                      <button
                        key={layerOpt.key}
                        type="button"
                        data-testid={`chamfer-orbit3d-arame-${layerOpt.key}`}
                        onClick={() => {
                          triggerHaptic("tap");
                          updateBrepLayers({
                            ...effectiveBrepLayers,
                            [layerOpt.key]: !isOn,
                          });
                        }}
                        className={cn(
                          "flex items-center justify-between rounded border px-1.5 py-1 font-mono text-[8.5px] font-bold transition-colors cursor-pointer",
                          isOn
                            ? "border-cyan-500/45 bg-cyan-950/60 text-cyan-200"
                            : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200",
                        )}
                      >
                        <span className="truncate">{layerOpt.label}</span>
                        <span className="ml-1 text-[8px]">{isOn ? "ON" : "OFF"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rodapé informativo */}
            <div className="mt-1.5 border-t border-slate-800/80 pt-1.5 px-1 flex items-center justify-between text-[8.5px] font-mono text-slate-400">
              <span>
                {activePreset === "free" ? "Vista: Personalizada / Livre" : `Vista: ${presetDef.label}`}
              </span>
              {isTilted && (
                <button
                  type="button"
                  onClick={() => handlePickPreset("top")}
                  className="text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer"
                >
                  Reset 2D (0°)
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});
