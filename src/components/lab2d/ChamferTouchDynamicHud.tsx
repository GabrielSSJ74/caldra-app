/**
 * CALDRA — MÓDULO CHAMFER CAD
 * CAMADA MOBILE TOUCH DE ENTRADA DINÂMICA, BANNER DE CHIPS CONTEXTUAIS,
 * DESAMBIGUAÇÃO DE SOBREPOSIÇÃO E ALÇA TÁTIL PUSH/PULL Z
 *
 * Regras arquiteturais:
 *  - Zero barras permanentes novas sobre o canvas.
 *  - Todos os elementos são 100% transitórios (aparecem apenas durante comando ativo,
 *    toque em pílula dimensional, sobreposição de entidades ou edição de perfil fechado).
 *  - Zero-Idle Overhead: sem loops requestAnimationFrame em repouso.
 */

import React, { useState, useEffect } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import type {
  GripEditMode,
  PolylineSegmentMode,
  RectCreationMode,
  CircleCreationMode,
  PolygonCreationMode,
  SlotCreationMode,
} from "@/lib/lab2d/cadcraftEngine";
import { Lock, Check, X, Delete, CornerDownLeft, Sparkles } from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import { useExponentialHold } from "@/lib/lab2d/useExponentialHold";
import { cn } from "@/lib/utils";

export type DimensionalFieldKind =
  | "length"
  | "angle"
  | "radius"
  | "diameter"
  | "across_flats"
  | "sides"
  | "slot_width"
  | "offset"
  | "extrude_z";

export interface LockedDimensionsState {
  lockedLengthMm: number | null;
  lockedAngleDeg: number | null;
}

export interface ChamferTouchDynamicHudProps {
  activeTool: string;
  pendingCount: number;
  basePoint: Vec2 | null;
  cursorPoint: Vec2;
  isDark?: boolean;

  // Sub-modos paramétricos das ferramentas CRI / MOD / SEL
  polylineSegMode: PolylineSegmentMode;
  onTogglePolylineSegMode: () => void;
  onUndoLastPolylineVertex: () => void;
  onFinishPolyline: (closed: boolean) => void;

  rectMode: RectCreationMode;
  onChangeRectMode: (m: RectCreationMode) => void;

  circleMode: CircleCreationMode;
  onChangeCircleMode: (m: CircleCreationMode) => void;

  polygonMode: PolygonCreationMode;
  onChangePolygonMode: (m: PolygonCreationMode) => void;
  polygonSides: number;
  onChangePolygonSides: (n: number) => void;
  polygonAcrossFlatsMm: number;
  onChangePolygonAcrossFlatsMm: (s: number) => void;

  slotMode: SlotCreationMode;
  onChangeSlotMode: (m: SlotCreationMode) => void;
  slotWidthMm: number;
  onChangeSlotWidthMm: (w: number) => void;

  gripMode: GripEditMode;
  onChangeGripMode: (m: GripEditMode) => void;
  onInsertVertexOnSelected?: () => void;

  smartTrimMode: "real" | "projected";
  onToggleSmartTrimMode: () => void;

  offsetDistMm: number;
  onChangeOffsetDistMm: (d: number) => void;

  // Travamento de medidas dinâmicas (🔒 Travar Medida)
  lockedDims: LockedDimensionsState;
  onChangeLockedDims: React.Dispatch<React.SetStateAction<LockedDimensionsState>>;

  // Confirmação direta de ponto / medida numérica
  onCommitExactPolarOrRadius: (params: {
    lengthMm?: number;
    angleDeg?: number;
    radiusMm?: number;
    coordMode?: "abs" | "rel" | "polar";
    rawInput?: string;
  }) => void;
  onCancelActiveCommand: () => void;

  // Desambiguação de sobreposição
  overlappingCandidates: Entity[];
  onPickOverlappingEntity: (entityId: string) => void;
  onDismissOverlapping: () => void;

  // Push/Pull Z direto em perfis fechados (ISO 2D / ÓRBITA 3D / CAD 3D)
  showPushPullZHandle: boolean;
  thicknessMm: number;
  onChangeThicknessMm: (nextZ: number) => void;
  uiShellMode?: "compact" | "prumo";
}

export function ChamferTouchDynamicHud({
  activeTool,
  pendingCount,
  basePoint,
  cursorPoint,
  isDark = true,
  polylineSegMode,
  onTogglePolylineSegMode,
  onUndoLastPolylineVertex,
  onFinishPolyline,
  rectMode,
  onChangeRectMode,
  circleMode,
  onChangeCircleMode,
  polygonMode,
  onChangePolygonMode,
  polygonSides,
  onChangePolygonSides,
  polygonAcrossFlatsMm,
  onChangePolygonAcrossFlatsMm,
  slotMode,
  onChangeSlotMode,
  slotWidthMm,
  onChangeSlotWidthMm,
  gripMode,
  onChangeGripMode,
  onInsertVertexOnSelected,
  smartTrimMode,
  onToggleSmartTrimMode,
  offsetDistMm,
  onChangeOffsetDistMm,
  lockedDims,
  onChangeLockedDims,
  onCommitExactPolarOrRadius,
  onCancelActiveCommand,
  overlappingCandidates,
  onPickOverlappingEntity,
  onDismissOverlapping,
  onChangeThicknessMm,
  uiShellMode = "compact",
}: ChamferTouchDynamicHudProps) {
  const [keypadField, setKeypadField] = useState<DimensionalFieldKind | null>(null);
  const [inputVal, setInputVal] = useState<string>("");
  const [stepSize, setStepSize] = useState<0.1 | 1 | 10>(1);
  const [coordMode, setCoordMode] = useState<"rel" | "abs" | "polar">("polar");
  const [useDiameter, setUseDiameter] = useState<boolean>(false);

  // Medidas ao vivo calculadas entre basePoint e cursorPoint
  const liveDistMm = basePoint
    ? Math.hypot(cursorPoint.x - basePoint.x, cursorPoint.y - basePoint.y)
    : 0;
  const liveAngleDeg = basePoint
    ? (((Math.atan2(-(cursorPoint.y - basePoint.y), cursorPoint.x - basePoint.x) * 180) / Math.PI) +
        360) %
      360
    : 0;

  const effectiveLength = lockedDims.lockedLengthMm ?? liveDistMm;
  const effectiveAngle = lockedDims.lockedAngleDeg ?? liveAngleDeg;

  const openKeypadForField = (field: DimensionalFieldKind, initialNumber: number) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    setKeypadField(field);
    setInputVal(String(Number(initialNumber.toFixed(2))));
  };

  useEffect(() => {
    setKeypadField(null);
  }, [activeTool]);

  const handleStepIncrement = (dir: 1 | -1, multiplier = 1) => {
    triggerHaptic("tap");
    setInputVal((prev) => {
      const curr = parseFloat(prev.replace(",", ".")) || 0;
      const baseStep = keypadField === "sides" ? 1 : stepSize;
      const next = Math.max(
        keypadField === "sides" ? 3 : 0.1,
        curr + dir * baseStep * multiplier,
      );
      return String(Number(next.toFixed(2)));
    });
  };

  const minusHoldProps = useExponentialHold((mult) => handleStepIncrement(-1, mult));
  const plusHoldProps = useExponentialHold((mult) => handleStepIncrement(1, mult));

  const handleLockCurrentField = () => {
    const parsed = parseFloat(inputVal.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    triggerHaptic("action");
    if (keypadField === "length") {
      onChangeLockedDims((prev) => ({
        ...prev,
        lockedLengthMm: prev.lockedLengthMm !== null ? null : Math.max(0.1, parsed),
      }));
      setKeypadField(null);
    } else if (keypadField === "angle") {
      onChangeLockedDims((prev) => ({
        ...prev,
        lockedAngleDeg: prev.lockedAngleDeg !== null ? null : ((parsed % 360) + 360) % 360,
      }));
      setKeypadField(null);
    }
  };

  const handleConfirmKeypad = () => {
    const raw = inputVal.trim();
    const parsed = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(parsed) && !raw.includes(",") && !raw.includes("<")) {
      setKeypadField(null);
      return;
    }
    triggerHaptic("success");
    AudioManager.play("ui_select");

    if (keypadField === "sides") {
      onChangePolygonSides(Math.max(3, Math.min(64, Math.round(parsed))));
    } else if (keypadField === "across_flats") {
      onChangePolygonAcrossFlatsMm(Math.max(1, parsed));
      if (pendingCount >= 1) {
        onCommitExactPolarOrRadius({ radiusMm: parsed / 2 });
      }
    } else if (keypadField === "slot_width") {
      onChangeSlotWidthMm(Math.max(1, parsed));
    } else if (keypadField === "offset") {
      onChangeOffsetDistMm(Math.max(0.1, parsed));
    } else if (keypadField === "extrude_z") {
      onChangeThicknessMm(Math.max(0.2, Math.min(200, parsed)));
    } else if (keypadField === "radius" || keypadField === "diameter") {
      const r = keypadField === "diameter" || useDiameter ? parsed / 2 : parsed;
      onCommitExactPolarOrRadius({ radiusMm: Math.max(0.1, r) });
    } else if (keypadField === "length") {
      onCommitExactPolarOrRadius({
        lengthMm: Math.max(0.1, parsed),
        angleDeg: effectiveAngle,
        coordMode,
        rawInput: raw,
      });
    } else if (keypadField === "angle") {
      onCommitExactPolarOrRadius({
        lengthMm: Math.max(0.1, effectiveLength),
        angleDeg: parsed,
        coordMode,
        rawInput: raw,
      });
    }
    setKeypadField(null);
  };

  const hasTransientBanner =
    activeTool === "polyline" ||
    activeTool === "rect" ||
    activeTool === "circle" ||
    activeTool === "polygon" ||
    activeTool === "slot" ||
    activeTool === "node" ||
    activeTool === "smart_trim" ||
    activeTool === "trim" ||
    activeTool === "offset" ||
    activeTool === "construction_line" ||
    activeTool === "spline";

  return (
    <>
      {/* 1. PÍLULA HORIZONTAL DE LINHA ÚNICA ULTRA-COMPACTA DE SUB-MODOS (SLIM SINGLE-ROW GLASS BAR) */}
      {hasTransientBanner && (
        <div
          data-testid="chamfer-slim-submode-bar"
          style={{
            top: uiShellMode === "prumo" ? 52 : 22, // No modo PRUMO fica a 52px do topo (abaixo da Ilha Superior Esquerda e Controle de Vista Direito)
            height: 26,
            padding: "2px 6px",
            gap: 4,
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: isDark ? "rgba(10, 15, 26, 0.86)" : "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: isDark
              ? "1px solid rgba(255, 255, 255, 0.14)"
              : "1px solid rgba(15, 23, 42, 0.12)",
            boxShadow: isDark
              ? "0 4px 16px rgba(0, 0, 0, 0.28)"
              : "0 4px 14px rgba(15, 23, 42, 0.08)",
          }}
          className={cn(
            "pointer-events-auto absolute left-1/2 -translate-x-1/2 z-35 flex flex-nowrap items-center justify-start whitespace-nowrap overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain font-mono select-none max-w-[94%]",
            isDark ? "text-slate-100" : "text-slate-800",
          )}
        >
          {/* Chips para POLILINHA COMPOSTA (Linha ↔ Arco Tangente) */}
          {activeTool === "polyline" && (
            <>
              <span className="font-bold text-red-400 px-1">POLI</span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onTogglePolylineSegMode();
                }}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
                  polylineSegMode === "tangent_arc"
                    ? "bg-sky-600 text-white"
                    : isDark
                      ? "bg-slate-800/85 text-sky-300 hover:bg-slate-700"
                      : "bg-slate-200/80 text-sky-700 hover:bg-slate-300",
                )}
              >
                {polylineSegMode === "tangent_arc" ? "⌒ Arco" : "╱ Linha"}
              </button>
              {pendingCount >= 1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("tap");
                    onUndoLastPolylineVertex();
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0",
                    isDark
                      ? "bg-slate-800/85 hover:bg-slate-700 text-slate-200"
                      : "bg-slate-200/80 hover:bg-slate-300 text-slate-700",
                  )}
                >
                  ↶ Vértice
                </button>
              )}
              {pendingCount >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onFinishPolyline(false);
                  }}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  ✓ Concluir
                </button>
              )}
              {pendingCount >= 3 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onFinishPolyline(true);
                  }}
                  className="rounded-full bg-amber-600 hover:bg-amber-500 text-white px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  ◎ Fechar
                </button>
              )}
            </>
          )}

          {/* Chips para RETÂNGULO PARAMÉTRICO (Linha Única Estrita) */}
          {activeTool === "rect" && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">RET:</span>
              {(
                [
                  ["corners", "2 Cantos"],
                  ["center", "Centro"],
                  ["three_point", "3 Pontos"],
                ] as const
              ).map(([mId, label]) => (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangeRectMode(mId);
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
                    rectMode === mId
                      ? "bg-red-600 text-white shadow-xs"
                      : isDark
                        ? "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-200/75 text-slate-700 hover:bg-slate-300",
                  )}
                >
                  {label}
                </button>
              ))}
            </>
          )}

          {/* Chips para CÍRCULO TÉCNICO (Linha Única Estrita) */}
          {activeTool === "circle" && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">CÍRC:</span>
              {(
                [
                  ["center_radius", "Centro-R"],
                  ["center_diameter", "Centro-Ø"],
                  ["two_point", "2 Pts"],
                  ["three_point", "3 Pts"],
                  ["ttr", "TTR"],
                ] as const
              ).map(([mId, label]) => (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangeCircleMode(mId);
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
                    circleMode === mId
                      ? "bg-red-600 text-white shadow-xs"
                      : isDark
                        ? "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-200/75 text-slate-700 hover:bg-slate-300",
                  )}
                >
                  {label}
                </button>
              ))}
            </>
          )}

          {/* Chips para POLÍGONO REGULAR / SEXTAVADO (S mm) */}
          {activeTool === "polygon" && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">POLÍG:</span>
              {(
                [
                  ["across_flats", `S=${polygonAcrossFlatsMm}`],
                  ["inscribed", "Insc."],
                  ["circumscribed", "Circ."],
                ] as const
              ).map(([mId, label]) => (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangePolygonMode(mId);
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
                    polygonMode === mId
                      ? "bg-red-600 text-white shadow-xs"
                      : isDark
                        ? "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-200/75 text-slate-700 hover:bg-slate-300",
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openKeypadForField("sides", polygonSides)}
                className="rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                {polygonSides}L
              </button>
              <button
                type="button"
                onClick={() => openKeypadForField("across_flats", polygonAcrossFlatsMm)}
                className="rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                S:{polygonAcrossFlatsMm}
              </button>
            </>
          )}

          {/* Chips para RASGO OBLONGO MECÂNICO (SLOT RETO / CURVO) */}
          {activeTool === "slot" && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">SLOT:</span>
              {(
                [
                  ["center_to_center", "Centro-Centro"],
                  ["overall", "Total"],
                  ["curved", "Curvo"],
                ] as const
              ).map(([mId, label]) => (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangeSlotMode(mId);
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
                    slotMode === mId
                      ? "bg-red-600 text-white shadow-xs"
                      : isDark
                        ? "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-200/75 text-slate-700 hover:bg-slate-300",
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openKeypadForField("slot_width", slotWidthMm)}
                className="rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                Ø {slotWidthMm}mm
              </button>
            </>
          )}

          {/* Chips para EDITAR NÓS (GRIPS MULTI-MODO) */}
          {activeTool === "node" && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">NÓS:</span>
              {(
                [
                  ["stretch", "Esticar"],
                  ["move", "Mover"],
                  ["rotate", "Girar"],
                  ["scale", "Escalar"],
                  ["mirror", "Espelhar"],
                ] as const
              ).map(([mId, label]) => (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangeGripMode(mId);
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
                    gripMode === mId
                      ? "bg-red-600 text-white shadow-xs"
                      : isDark
                        ? "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-200/75 text-slate-700 hover:bg-slate-300",
                  )}
                >
                  {label}
                </button>
              ))}
              {onInsertVertexOnSelected && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    onInsertVertexOnSelected();
                  }}
                  className="rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  + Vértice
                </button>
              )}
            </>
          )}

          {/* Chips para APARAR (TOQUE & SWIPE-TO-TRIM) */}
          {(activeTool === "smart_trim" || activeTool === "trim") && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">APARAR:</span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onToggleSmartTrimMode();
                }}
                className="rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                {smartTrimMode === "real" ? "Encontro Real" : "Projetado"}
              </button>
            </>
          )}

          {/* Chips para OFFSET PARALELO */}
          {activeTool === "offset" && (
            <>
              <span className="font-bold text-red-400 px-1 shrink-0">OFFSET:</span>
              <button
                type="button"
                onClick={() => openKeypadForField("offset", offsetDistMm)}
                className="rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                d = {offsetDistMm} mm
              </button>
            </>
          )}

          {/* Chips para LINHA DE CONSTRUÇÃO / SPLINE */}
          {activeTool === "construction_line" && (
            <>
              <span className="font-bold text-amber-400 px-1 shrink-0">EIXO ∞:</span>
              <span className="text-slate-400 text-[10.5px] shrink-0">2 pontos</span>
            </>
          )}

          {activeTool === "spline" && (
            <>
              <span className="font-bold text-sky-400 px-1 shrink-0">SPLINE:</span>
              {pendingCount >= 2 && (
                <button
                  type="button"
                  onClick={() => onFinishPolyline(false)}
                  className="rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  ✓ Concluir
                </button>
              )}
              {pendingCount >= 3 && (
                <button
                  type="button"
                  onClick={() => onFinishPolyline(true)}
                  className="rounded-full bg-amber-600 text-white px-2 py-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  ◎ Fechar
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              onCancelActiveCommand();
            }}
            className={cn(
              "ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors cursor-pointer",
              isDark
                ? "bg-slate-800/85 hover:bg-red-900/70 text-slate-300 hover:text-white"
                : "bg-slate-200/85 hover:bg-red-100 text-slate-600 hover:text-red-700",
            )}
            title="Cancelar comando ativo (Esc)"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. PÍLULAS SECUNDÁRIAS E BARRA PUSH/PULL Z REMOVIDAS DEFINITIVAMENTE */}

      {/* 4. CHIPS DE DESAMBIGUAÇÃO DE SOBREPOSIÇÃO (QUANDO >= 2 ENTIDADES NO MESMO TOQUE) */}
      {overlappingCandidates.length >= 2 && (
        <div
          className={cn(
            "pointer-events-auto absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-[10px] shadow-2xl backdrop-blur-md select-none",
            isDark
              ? "border-amber-500/50 bg-slate-950/95 text-slate-200"
              : "border-amber-400 bg-white/95 text-slate-800",
          )}
        >
          <Sparkles className="size-3.5 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-400">Sobreposição ({overlappingCandidates.length}):</span>
          {overlappingCandidates.slice(0, 4).map((ent, idx) => (
            <button
              key={ent.id}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onPickOverlappingEntity(ent.id);
              }}
              className="rounded-lg bg-slate-800 hover:bg-amber-600 text-slate-200 hover:text-white px-2 py-0.5 font-bold transition-colors cursor-pointer"
            >
              #{idx + 1} {ent.type.toUpperCase()} ({ent.layer})
            </button>
          ))}
          <button
            type="button"
            onClick={onDismissOverlapping}
            className="rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 px-1.5 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 5. MINI-TECLADO NUMÉRICO FLUTUANTE DE ENGENHARIA (SOB DEMANDA) */}
      {keypadField !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[1px] select-none"
          onClick={() => setKeypadField(null)}
        >
          <div
            className={cn(
              "w-72 rounded-2xl border p-3 shadow-2xl font-mono text-xs animate-in zoom-in-95 duration-120",
              isDark
                ? "border-sky-500/50 bg-slate-950/96 text-slate-100"
                : "border-slate-300 bg-white/98 text-slate-900",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <span className="font-bold uppercase text-sky-400">
                {keypadField === "length" && "Comprimento (L mm)"}
                {keypadField === "angle" && "Ângulo Polar (∠ °)"}
                {keypadField === "radius" && (useDiameter ? "Diâmetro (Ø mm)" : "Raio (R mm)")}
                {keypadField === "diameter" && "Diâmetro (Ø mm)"}
                {keypadField === "across_flats" && "Medida Entre Faces (S mm)"}
                {keypadField === "sides" && "Número de Lados (N)"}
                {keypadField === "slot_width" && "Largura do Rasgo (Ø mm)"}
                {keypadField === "offset" && "Distância de Offset (mm)"}
                {keypadField === "extrude_z" && "Altura / Espessura Z (mm)"}
              </span>
              <button
                type="button"
                onClick={() => setKeypadField(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Visor numérico + incremento rápido com aceleração exponencial */}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                type="button"
                {...minusHoldProps}
                className="h-9 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:scale-95 select-none"
              >
                -{keypadField === "sides" ? 1 : stepSize}
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmKeypad();
                  if (e.key === "Escape") setKeypadField(null);
                }}
                autoFocus
                className="flex-1 h-9 rounded-xl border border-sky-500/50 bg-slate-900 px-2 text-center font-mono text-base font-bold text-sky-300 outline-none"
              />
              <button
                type="button"
                {...plusHoldProps}
                className="h-9 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:scale-95 select-none"
              >
                +{keypadField === "sides" ? 1 : stepSize}
              </button>
            </div>

            {/* Seletor de passo 0.1 | 1 | 10 mm e alternador Ø ↔ R */}
            <div className="flex items-center justify-between gap-1 mb-2 text-[10px]">
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Passo:</span>
                {([0.1, 1, 10] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStepSize(st)}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-bold",
                      stepSize === st
                        ? "bg-sky-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white",
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {(keypadField === "radius" || keypadField === "diameter") && (
                <button
                  type="button"
                  onClick={() => setUseDiameter((d) => !d)}
                  className="rounded-md bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 font-bold text-amber-300"
                >
                  Ø ↔ R
                </button>
              )}

              {(keypadField === "length" || keypadField === "angle") && (
                <div className="flex items-center gap-0.5">
                  {(["polar", "rel", "abs"] as const).map((cm) => (
                    <button
                      key={cm}
                      type="button"
                      onClick={() => setCoordMode(cm)}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 font-bold uppercase",
                        coordMode === cm
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-800 text-slate-400",
                      )}
                    >
                      {cm}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grade de teclas 0-9, ., -, Backspace */}
            <div className="grid grid-cols-4 gap-1.5 mb-2.5">
              {["7", "8", "9", "DEL", "4", "5", "6", "-", "1", "2", "3", ".", "0", "00", ",", "C"].map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      triggerHaptic("tap");
                      if (key === "DEL") {
                        setInputVal((v) => v.slice(0, -1));
                      } else if (key === "C") {
                        setInputVal("");
                      } else {
                        setInputVal((v) => v + key);
                      }
                    }}
                    className={cn(
                      "h-9 rounded-xl font-bold text-sm flex items-center justify-center active:scale-95 transition-transform cursor-pointer",
                      key === "DEL" || key === "C"
                        ? "bg-slate-800 text-amber-400 hover:bg-slate-700"
                        : "bg-slate-900 border border-slate-800 text-slate-100 hover:bg-slate-800",
                    )}
                  >
                    {key === "DEL" ? <Delete className="size-4" /> : key}
                  </button>
                ),
              )}
            </div>

            {/* Ações Finais: Travar Medida (🔒) + Confirmar (✓) */}
            <div className="flex items-center gap-1.5">
              {(keypadField === "length" || keypadField === "angle") && (
                <button
                  type="button"
                  onClick={handleLockCurrentField}
                  className={cn(
                    "flex-1 h-9 rounded-xl border font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer",
                    (keypadField === "length" && lockedDims.lockedLengthMm !== null) ||
                      (keypadField === "angle" && lockedDims.lockedAngleDeg !== null)
                      ? "border-amber-500 bg-amber-600 text-white"
                      : "border-amber-500/50 bg-amber-950/60 text-amber-300 hover:bg-amber-900/70",
                  )}
                  title="Trava a medida digitada enquanto seu dedo escolhe livremente a direção na prancheta"
                >
                  <Lock className="size-3.5" />
                  <span>Travar Medida</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirmKeypad}
                className="flex-1 h-9 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-sky-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <Check className="size-4 stroke-[2.5]" />
                <span>Confirmar</span>
                <CornerDownLeft className="size-3 opacity-75" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
