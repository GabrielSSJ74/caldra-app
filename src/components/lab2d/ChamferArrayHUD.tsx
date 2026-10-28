/**
 * CALDRA CHAMFER — HUD COMPACTO DE ARRAYS INTELIGENTES (PADRÃO LINEAR E PADRÃO CIRCULAR / POLAR)
 *
 * Especificação Industrial:
 * - Zero Teclado Nativo do Celular: Todas as pílulas numéricas abrem o teclado numérico próprio do CAD
 *   (`ChamferDirectDimensionEditor`) com suporte a `🔒 Fixar Medida`.
 * - Detecção Topológica Real com Nível de Confiança (`ALTA`, `MÉDIA`, `BAIXA`) e seleção de centros candidatos.
 * - Chip inteligente `[ ⌖ Centralizar na aba ]` quando o furo no flange está fora do raio médio (R_médio).
 * - 4 Modos Matemáticos no Padrão Linear:
 *   1. Passo Fixo (`fixed_step`)
 *   2. Extensão Total (`total_span`)
 *   3. Adaptar à Peça / Auto-Fit (`auto_fit`)
 *   4. Preencher / Fill (`fill`)
 * - Contador dinâmico de instâncias ativas e omitidas (`skippedIndices`) + Diagnóstico de Colisões em tempo real.
 */

import React, { useState } from "react";
import {
  RotateCw,
  Copy,
  Check,
  X,
  Target,
  AlertTriangle,
  ArrowRightLeft,
  CircleDot,
  Lock,
  Crosshair,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { Vec2 } from "@/lib/geometry/types";
import type {
  ArrayType,
  HostDetectionResult,
  ArrayValidationResult,
  PolarArrayParams,
  LinearArrayParams,
  LinearDistributionMode,
  PolarLockedField,
  LinearLockedField,
} from "@/lib/lab2d/cadArrayEngine";
import { ChamferDirectDimensionEditor } from "@/components/lab2d/ChamferDirectDimensionEditor";

export interface ChamferArrayHUDProps {
  arrayType: ArrayType;
  onChangeArrayType: (type: ArrayType) => void;

  polarParams: PolarArrayParams;
  onChangePolarParams: (params: PolarArrayParams) => void;

  linearParams: LinearArrayParams;
  onChangeLinearParams: (params: LinearArrayParams) => void;

  hostInfo: HostDetectionResult;
  validation: ArrayValidationResult;

  resolvedLinearInfo?: {
    cols: number;
    rows: number;
    stepX: number;
    stepY: number;
    spanX: number;
    spanY: number;
  };
  resolvedPolarInfo?: {
    count: number;
    stepAngleDeg: number;
    radius: number;
    pcd: number;
    startAngleDeg: number;
  };

  isPickingCenter: boolean;
  onTogglePickCenter: () => void;
  onSelectCandidateCenter: (center: Vec2) => void;
  onCenterOnFlangeTab?: () => void;

  isEditingExistingArray?: boolean;
  onApply: () => void;
  onCancel: () => void;
  isDark?: boolean;
}

interface ActiveKeypadField {
  id: string;
  label: string;
  value: number;
  unit: string;
  allowNegative: boolean;
  isInteger?: boolean;
  minVal?: number;
  initialLocked: boolean;
  screenPos: { x: number; y: number };
  onUpdateValue: (val: number, locked?: boolean) => void;
}

const POLAR_COUNT_PRESETS = [3, 4, 6, 8, 12, 16];
const POLAR_ANGLE_PRESETS = [360, 180, 90];

const LINEAR_MODE_LABELS: { id: LinearDistributionMode; label: string; short: string }[] = [
  { id: "fixed_step", label: "Passo Fixo", short: "Passo Fixo" },
  { id: "total_span", label: "Extensão Total", short: "Extensão" },
  { id: "auto_fit", label: "Adaptar à Peça (Auto-Fit)", short: "Auto-Fit" },
  { id: "fill", label: "Preencher (Fill)", short: "Fill" },
];

export function ChamferArrayHUD({
  arrayType,
  onChangeArrayType,
  polarParams,
  onChangePolarParams,
  linearParams,
  onChangeLinearParams,
  hostInfo,
  validation,
  resolvedLinearInfo,
  resolvedPolarInfo,
  isPickingCenter,
  onTogglePickCenter,
  onSelectCandidateCenter,
  onCenterOnFlangeTab,
  isEditingExistingArray = false,
  onApply,
  onCancel,
  isDark = true,
}: ChamferArrayHUDProps) {
  const isPolar = arrayType === "polar";
  const linearMode: LinearDistributionMode = linearParams.mode ?? "fixed_step";
  const [keypadField, setKeypadField] = useState<ActiveKeypadField | null>(null);

  const openKeypadFromButton = (
    e: React.MouseEvent<HTMLButtonElement>,
    config: Omit<ActiveKeypadField, "screenPos">,
  ) => {
    triggerHaptic("selection");
    const rect = e.currentTarget.getBoundingClientRect();
    setKeypadField({
      ...config,
      screenPos: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      },
    });
  };

  const currentRadius =
    resolvedPolarInfo?.radius ??
    polarParams.radius ??
    (hostInfo.pcd ? hostInfo.pcd / 2 : 50);
  const currentPcd = currentRadius * 2;
  const currentStartAngle =
    resolvedPolarInfo?.startAngleDeg ?? polarParams.startAngleDeg ?? 0;

  const isPolarLocked = (field: PolarLockedField) =>
    Boolean(polarParams.lockedFields?.[field]);
  const isLinearLocked = (field: LinearLockedField) =>
    Boolean(linearParams.lockedFields?.[field]);

  const confidenceBadgeColor =
    hostInfo.confidence === "high"
      ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-300"
      : hostInfo.confidence === "medium"
        ? "bg-amber-950/70 border-amber-500/40 text-amber-300"
        : "bg-slate-900 border-slate-700 text-slate-400";

  const skippedCount = validation.skippedCount;

  const handleClearSkipped = () => {
    triggerHaptic("selection");
    if (isPolar) {
      onChangePolarParams({ ...polarParams, skippedIndices: [] });
    } else {
      onChangeLinearParams({ ...linearParams, skippedIndices: [] });
    }
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Controle de Padrão Geométrico (Array)"
        className={cn(
          "pointer-events-auto fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-1.5 rounded-2xl border px-3 py-2 shadow-2xl backdrop-blur-xl transition-all select-none",
          "max-w-[calc(100vw-16px)] md:max-w-[920px] text-xs",
          isDark
            ? "border-cyan-800/60 bg-slate-950/95 text-slate-100 shadow-black/80"
            : "border-slate-300 bg-white/95 text-slate-800 shadow-slate-300/50",
        )}
      >
        {/* LINHA 1: COMUTADOR DE TIPO + CONFIANÇA DO HOSPEDEIRO + CENTRALIZAR NA ABA + SELEÇÃO DE CENTRO */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b pb-1.5 border-slate-700/50">
          <div className="flex items-center gap-1.5">
            {/* COMUTADOR DE TIPO DE ARRAY */}
            <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-xl border border-slate-700/50">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangeArrayType("polar");
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-all cursor-pointer",
                  isPolar
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white hover:bg-slate-800",
                )}
              >
                <RotateCw className="size-3.5" />
                <span>Padrão Circular</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangeArrayType("linear");
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-all cursor-pointer",
                  !isPolar
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white hover:bg-slate-800",
                )}
              >
                <Copy className="size-3.5" />
                <span>Padrão Linear</span>
              </button>
            </div>

            {isEditingExistingArray && (
              <span className="px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono text-[10px] font-bold">
                ⌗ Editando Array
              </span>
            )}
          </div>

          {/* DETECÇÃO TOPOLÓGICA DA PEÇA HOSPEDEIRA + NÍVEL DE CONFIANÇA */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-mono text-[10px]",
                confidenceBadgeColor,
              )}
              title={`Confiança da detecção topológica: ${hostInfo.confidenceLabel}`}
            >
              <CircleDot className="size-3 shrink-0" />
              <span className="font-bold uppercase">[{hostInfo.confidenceLabel}]</span>
              <span className="truncate max-w-[210px] sm:max-w-[300px]">
                {hostInfo.description}
              </span>
            </div>

            {/* CHIP INTELIGENTE: [ ⌖ Centralizar na aba ] (SEÇÃO 1.3) */}
            {isPolar &&
              hostInfo.type === "flange" &&
              hostInfo.isOffFlangeCenterline &&
              hostInfo.flangeMidPcd !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("action");
                    if (onCenterOnFlangeTab) {
                      onCenterOnFlangeTab();
                    } else if (hostInfo.flangeMidRadius !== undefined) {
                      onChangePolarParams({
                        ...polarParams,
                        radius: hostInfo.flangeMidRadius,
                        repositionOriginalToPcd: true,
                      });
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-[10px] font-bold transition-all cursor-pointer active:scale-95",
                    polarParams.repositionOriginalToPcd &&
                      Math.abs(currentPcd - hostInfo.flangeMidPcd) < 0.2
                      ? "bg-emerald-600/30 border-emerald-400 text-emerald-200"
                      : "bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/60 text-amber-200",
                  )}
                  title={`Centralizar furação na linha média da aba do flange (PCD = ${hostInfo.flangeMidPcd.toFixed(1)} mm)`}
                >
                  <Crosshair className="size-3 text-amber-300" />
                  <span>⌖ Centralizar na aba (Ø{hostInfo.flangeMidPcd.toFixed(0)})</span>
                </button>
              )}
          </div>

          {/* SELETOR INTERATIVO DE PIVÔ / CENTRO (POLAR) */}
          {isPolar && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("tap");
                  onTogglePickCenter();
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg border font-mono text-[10px] font-bold transition-all cursor-pointer",
                  isPickingCenter
                    ? "bg-rose-600 border-rose-400 text-white animate-pulse"
                    : "bg-slate-900 border-rose-500/50 text-rose-300 hover:border-rose-400 hover:text-rose-200",
                )}
                title="Toque no canvas ou arraste o pivô vermelho carmesim (#DC143C) para reposicionar o centro"
              >
                <Target className="size-3 text-rose-400" />
                <span>{isPickingCenter ? "Toque no Centro..." : "Pivô ⊕"}</span>
              </button>

              {hostInfo.candidateCenters.length > 1 && (
                <div className="flex items-center gap-1">
                  {hostInfo.candidateCenters.slice(0, 3).map((cand, idx) => {
                    const isSelected =
                      Math.hypot(
                        cand.point.x - polarParams.center.x,
                        cand.point.y - polarParams.center.y,
                      ) < 0.5;
                    return (
                      <button
                        key={`cand-chip-${idx}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onSelectCandidateCenter(cand.point);
                        }}
                        className={cn(
                          "px-1.5 py-0.5 rounded-md border font-mono text-[9.5px] transition-colors cursor-pointer",
                          isSelected
                            ? "border-cyan-400 bg-cyan-950/80 text-cyan-200 font-bold"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:text-white",
                        )}
                        title={cand.label}
                      >
                        C{idx + 1} ({cand.point.x.toFixed(0)},{cand.point.y.toFixed(0)})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SUB-LINHA DE MODOS MATEMÁTICOS (APENAS PARA PADRÃO LINEAR — SEÇÃO 1.2) */}
        {!isPolar && (
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b pb-1.5 border-slate-800/80">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-slate-400 uppercase font-bold mr-1">
                Modo Linear:
              </span>
              {LINEAR_MODE_LABELS.map((m) => {
                const active = linearMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangeLinearParams({
                        ...linearParams,
                        mode: m.id,
                        marginX: linearParams.marginX ?? 15,
                        marginY: linearParams.marginY ?? 15,
                        spanX:
                          linearParams.spanX ??
                          Math.abs(linearParams.dx) * Math.max(1, linearParams.cols - 1),
                        spanY:
                          linearParams.spanY ??
                          Math.abs(linearParams.dy) * Math.max(1, linearParams.rows - 1),
                      });
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded-lg border font-mono text-[10px] font-bold transition-all cursor-pointer",
                      active
                        ? "border-cyan-500 bg-cyan-600/30 text-cyan-200 shadow-2xs"
                        : "border-slate-800 bg-slate-900/90 text-slate-400 hover:text-slate-200",
                    )}
                    title={m.label}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>

            {resolvedLinearInfo && (
              <span className="font-mono text-[10px] text-cyan-300/90">
                Passo efetivo: {Math.abs(resolvedLinearInfo.stepX).toFixed(1)} mm · Extensão:{" "}
                {resolvedLinearInfo.spanX.toFixed(1)} mm
              </span>
            )}
          </div>
        )}

        {/* LINHA 2: PÍLULAS NUMÉRICAS INTERATIVAS (TECLADO CAD INTEGRADO SEM <input> NATIVO) */}
        <div className="flex flex-wrap items-center gap-2">
          {isPolar ? (
            <>
              {/* QUANTIDADE DE ITENS NO POLAR (N) */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">Qtd N:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "polar-count",
                      label: "Quantidade de Furos / Itens (N)",
                      value: polarParams.count,
                      unit: "un",
                      allowNegative: false,
                      isInteger: true,
                      minVal: 1,
                      initialLocked: isPolarLocked("count"),
                      onUpdateValue: (val, locked) => {
                        const n = Math.max(1, Math.round(val));
                        onChangePolarParams({
                          ...polarParams,
                          count: n,
                          lockedFields: { ...polarParams.lockedFields, count: locked },
                        });
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 min-w-[44px] justify-center rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 transition-colors cursor-pointer",
                    isPolarLocked("count")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : isDark
                        ? "border-slate-700 bg-slate-900 hover:border-cyan-500"
                        : "border-slate-300 bg-white",
                  )}
                  title="Toque para digitar a quantidade N no teclado numérico CAD"
                >
                  {isPolarLocked("count") && <Lock className="size-2.5 text-amber-400" />}
                  <span>{polarParams.count}</span>
                </button>
              </div>

              {/* PRESETS DE QUANTIDADE POLAR */}
              <div className="flex items-center gap-0.5">
                {POLAR_COUNT_PRESETS.map((p) => (
                  <button
                    key={`polar-count-${p}`}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangePolarParams({ ...polarParams, count: p });
                    }}
                    className={cn(
                      "px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-medium transition-colors cursor-pointer",
                      polarParams.count === p
                        ? "border-cyan-500 bg-cyan-600/30 text-cyan-300 font-bold"
                        : isDark
                          ? "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                          : "border-slate-200 bg-slate-100 text-slate-600 hover:text-black",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-700/60 hidden sm:block" />

              {/* PCD (DIÂMETRO DO CÍRCULO PRIMITIVO) */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">PCD:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "polar-pcd",
                      label: "Diâmetro do Círculo de Furação — PCD (mm)",
                      value: Number(currentPcd.toFixed(2)),
                      unit: "mm",
                      allowNegative: false,
                      initialLocked: isPolarLocked("pcd"),
                      onUpdateValue: (dia, locked) => {
                        if (dia > 0) {
                          onChangePolarParams({
                            ...polarParams,
                            radius: dia / 2,
                            repositionOriginalToPcd: true,
                            lockedFields: {
                              ...polarParams.lockedFields,
                              pcd: locked,
                              radius: locked,
                            },
                          });
                        }
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 transition-colors cursor-pointer",
                    isPolarLocked("pcd")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : isDark
                        ? "border-slate-700 bg-slate-900 hover:border-cyan-500"
                        : "border-slate-300 bg-white",
                  )}
                  title="Toque para editar o PCD (Ø = 2R) no teclado CAD"
                >
                  {isPolarLocked("pcd") && <Lock className="size-2.5 text-amber-400" />}
                  <span>Ø {currentPcd.toFixed(1)} mm</span>
                </button>
              </div>

              {/* RAIO (R = PCD / 2) */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">Raio:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "polar-radius",
                      label: "Raio do Círculo de Furação — R (mm)",
                      value: Number(currentRadius.toFixed(2)),
                      unit: "mm",
                      allowNegative: false,
                      initialLocked: isPolarLocked("radius"),
                      onUpdateValue: (r, locked) => {
                        if (r > 0) {
                          onChangePolarParams({
                            ...polarParams,
                            radius: r,
                            repositionOriginalToPcd: true,
                            lockedFields: {
                              ...polarParams.lockedFields,
                              radius: locked,
                              pcd: locked,
                            },
                          });
                        }
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 transition-colors cursor-pointer",
                    isPolarLocked("radius")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : isDark
                        ? "border-slate-700 bg-slate-900 hover:border-cyan-500"
                        : "border-slate-300 bg-white",
                  )}
                  title="Toque para editar o Raio R no teclado CAD"
                >
                  <span>R {currentRadius.toFixed(1)}</span>
                </button>
              </div>

              <div className="h-4 w-px bg-slate-700/60 hidden sm:block" />

              {/* ÂNGULO TOTAL */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">Ângulo:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "polar-total-angle",
                      label: "Ângulo Total de Distribuição (°)",
                      value: Number(polarParams.totalAngleDeg.toFixed(1)),
                      unit: "°",
                      allowNegative: false,
                      initialLocked: isPolarLocked("totalAngleDeg"),
                      onUpdateValue: (ang, locked) => {
                        const clamped = Math.max(1, Math.min(360, ang));
                        onChangePolarParams({
                          ...polarParams,
                          totalAngleDeg: clamped,
                          lockedFields: { ...polarParams.lockedFields, totalAngleDeg: locked },
                        });
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 transition-colors cursor-pointer",
                    isPolarLocked("totalAngleDeg")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : isDark
                        ? "border-slate-700 bg-slate-900 hover:border-cyan-500"
                        : "border-slate-300 bg-white",
                  )}
                >
                  {isPolarLocked("totalAngleDeg") && <Lock className="size-2.5 text-amber-400" />}
                  <span>{polarParams.totalAngleDeg.toFixed(0)}°</span>
                </button>
              </div>

              {/* PRESETS DE ÂNGULO POLAR */}
              <div className="hidden sm:flex items-center gap-0.5">
                {POLAR_ANGLE_PRESETS.map((ang) => (
                  <button
                    key={`polar-ang-${ang}`}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangePolarParams({ ...polarParams, totalAngleDeg: ang });
                    }}
                    className={cn(
                      "px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-medium transition-colors cursor-pointer",
                      Math.abs(polarParams.totalAngleDeg - ang) < 0.1
                        ? "border-cyan-500 bg-cyan-600/30 text-cyan-300 font-bold"
                        : isDark
                          ? "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                          : "border-slate-200 bg-slate-100 text-slate-600 hover:text-black",
                    )}
                  >
                    {ang}°
                  </button>
                ))}
              </div>

              {/* ÂNGULO INICIAL (θ0) */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">θ₀:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "polar-start-angle",
                      label: "Ângulo Inicial θ₀ (°)",
                      value: Number(currentStartAngle.toFixed(1)),
                      unit: "°",
                      allowNegative: true,
                      initialLocked: isPolarLocked("startAngleDeg"),
                      onUpdateValue: (ang, locked) => {
                        onChangePolarParams({
                          ...polarParams,
                          startAngleDeg: ang,
                          repositionOriginalToPcd: true,
                          lockedFields: { ...polarParams.lockedFields, startAngleDeg: locked },
                        });
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-200 transition-colors cursor-pointer",
                    isPolarLocked("startAngleDeg")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                  )}
                  title="Ângulo inicial θ₀ em relação ao centro (+X = 0°)"
                >
                  <span>{currentStartAngle.toFixed(0)}°</span>
                </button>
              </div>

              {/* SENTIDO (HORÁRIO / ANTI-HORÁRIO) */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangePolarParams({
                    ...polarParams,
                    clockwise: !polarParams.clockwise,
                  });
                }}
                className={cn(
                  "px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer",
                  polarParams.clockwise
                    ? "bg-amber-950/60 border-amber-500/50 text-amber-300"
                    : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white",
                )}
                title="Alternar sentido: Anti-Horário (CCW) ou Horário (CW)"
              >
                <ArrowRightLeft className="size-3" />
                <span>{polarParams.clockwise ? "CW (Horário)" : "CCW"}</span>
              </button>

              {/* GIRAR ITENS: ON / OFF (PARA SLOTS, RETÂNGULOS, POLÍGONOS, GRUPOS) */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onChangePolarParams({
                    ...polarParams,
                    rotateItems: !(polarParams.rotateItems ?? true),
                  });
                }}
                className={cn(
                  "px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer",
                  (polarParams.rotateItems ?? true)
                    ? "bg-cyan-950/60 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white",
                )}
                title="Girar orientação própria de rasgos oblongos (slots), retângulos e polígonos ao longo do círculo"
              >
                <RotateCw className="size-3" />
                <span>Girar itens: {(polarParams.rotateItems ?? true) ? "ON" : "OFF"}</span>
              </button>
            </>
          ) : (
            <>
              {/* MODO LINEAR: COLUNAS X (EXCETO NO MODO FILL ONDE N É CALCULADO AUTOMATICAMENTE) */}
              {linearMode !== "fill" ? (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase">Col X (N):</span>
                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypadFromButton(e, {
                        id: "linear-cols",
                        label: "Quantidade de Colunas em X (Nx)",
                        value: linearParams.cols,
                        unit: "un",
                        allowNegative: false,
                        isInteger: true,
                        minVal: 1,
                        initialLocked: isLinearLocked("cols"),
                        onUpdateValue: (val, locked) => {
                          onChangeLinearParams({
                            ...linearParams,
                            cols: Math.max(1, Math.round(val)),
                            lockedFields: { ...linearParams.lockedFields, cols: locked },
                          });
                        },
                      })
                    }
                    className={cn(
                      "flex items-center gap-1 min-w-[40px] justify-center rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                      isLinearLocked("cols")
                        ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                        : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                    )}
                  >
                    {isLinearLocked("cols") && <Lock className="size-2.5 text-amber-400" />}
                    <span>{linearParams.cols}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/50 border border-cyan-500/30 font-mono text-[10px] text-cyan-300">
                  <span>Auto Nx:</span>
                  <strong>{resolvedLinearInfo?.cols ?? linearParams.cols}</strong>
                </div>
              )}

              {/* CONTROLE ESPECÍFICO DE EIXO X CONFORME O MODO */}
              {(linearMode === "fixed_step" || linearMode === "fill") && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase">Passo X:</span>
                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypadFromButton(e, {
                        id: "linear-dx",
                        label: "Passo entre Centros no Eixo X (mm)",
                        value: Number(linearParams.dx.toFixed(2)),
                        unit: "mm",
                        allowNegative: true,
                        initialLocked: isLinearLocked("dx"),
                        onUpdateValue: (val, locked) => {
                          onChangeLinearParams({
                            ...linearParams,
                            dx: val,
                            dirX: val < 0 ? -1 : 1,
                            lockedFields: { ...linearParams.lockedFields, dx: locked },
                          });
                        },
                      })
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                      isLinearLocked("dx")
                        ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                        : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                    )}
                  >
                    {isLinearLocked("dx") && <Lock className="size-2.5 text-amber-400" />}
                    <span>{linearParams.dx.toFixed(1)} mm</span>
                  </button>
                </div>
              )}

              {linearMode === "total_span" && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase">Extensão X:</span>
                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypadFromButton(e, {
                        id: "linear-span-x",
                        label: "Extensão Total Lx do 1º ao Último Centro (mm)",
                        value: Number(
                          (
                            linearParams.spanX ??
                            Math.abs(linearParams.dx) * Math.max(1, linearParams.cols - 1)
                          ).toFixed(2),
                        ),
                        unit: "mm",
                        allowNegative: false,
                        initialLocked: isLinearLocked("spanX"),
                        onUpdateValue: (val, locked) => {
                          onChangeLinearParams({
                            ...linearParams,
                            spanX: val,
                            lockedFields: { ...linearParams.lockedFields, spanX: locked },
                          });
                        },
                      })
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                      isLinearLocked("spanX")
                        ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                        : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                    )}
                  >
                    {isLinearLocked("spanX") && <Lock className="size-2.5 text-amber-400" />}
                    <span>
                      {(
                        linearParams.spanX ??
                        Math.abs(linearParams.dx) * Math.max(1, linearParams.cols - 1)
                      ).toFixed(1)}{" "}
                      mm
                    </span>
                  </button>
                </div>
              )}

              {(linearMode === "auto_fit" || linearMode === "fill") && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase">Margem:</span>
                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypadFromButton(e, {
                        id: "linear-margin-x",
                        label: "Margem às Bordas da Peça Hospedeira (mm)",
                        value: Number((linearParams.marginX ?? 15).toFixed(2)),
                        unit: "mm",
                        allowNegative: false,
                        initialLocked: isLinearLocked("marginX"),
                        onUpdateValue: (val, locked) => {
                          onChangeLinearParams({
                            ...linearParams,
                            marginX: val,
                            marginY: val,
                            lockedFields: { ...linearParams.lockedFields, marginX: locked },
                          });
                        },
                      })
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                      isLinearLocked("marginX")
                        ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                        : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                    )}
                  >
                    {isLinearLocked("marginX") && <Lock className="size-2.5 text-amber-400" />}
                    <span>{(linearParams.marginX ?? 15).toFixed(1)} mm</span>
                  </button>
                </div>
              )}

              <div className="h-4 w-px bg-slate-700/60 hidden sm:block" />

              {/* EIXO SECUNDÁRIO Y (LINHAS Y E PASSO Y) */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">Lin Y:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "linear-rows",
                      label: "Quantidade de Linhas em Y (Ny)",
                      value: linearParams.rows,
                      unit: "un",
                      allowNegative: false,
                      isInteger: true,
                      minVal: 1,
                      initialLocked: isLinearLocked("rows"),
                      onUpdateValue: (val, locked) => {
                        onChangeLinearParams({
                          ...linearParams,
                          rows: Math.max(1, Math.round(val)),
                          lockedFields: { ...linearParams.lockedFields, rows: locked },
                        });
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 min-w-[38px] justify-center rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                    isLinearLocked("rows")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                  )}
                >
                  {isLinearLocked("rows") && <Lock className="size-2.5 text-amber-400" />}
                  <span>{resolvedLinearInfo?.rows ?? linearParams.rows}</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">Passo Y:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "linear-dy",
                      label: "Passo entre Centros no Eixo Y (mm)",
                      value: Number(linearParams.dy.toFixed(2)),
                      unit: "mm",
                      allowNegative: true,
                      initialLocked: isLinearLocked("dy"),
                      onUpdateValue: (val, locked) => {
                        onChangeLinearParams({
                          ...linearParams,
                          dy: val,
                          dirY: val < 0 ? -1 : 1,
                          lockedFields: { ...linearParams.lockedFields, dy: locked },
                        });
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                    isLinearLocked("dy")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                  )}
                >
                  {isLinearLocked("dy") && <Lock className="size-2.5 text-amber-400" />}
                  <span>{(resolvedLinearInfo?.stepY ?? linearParams.dy).toFixed(1)} mm</span>
                </button>
              </div>

              {/* ÂNGULO DE INCLINAÇÃO DO PADRÃO LINEAR */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase">∠:</span>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypadFromButton(e, {
                      id: "linear-angle",
                      label: "Ângulo de Inclinação da Matriz Linear (°)",
                      value: Number((linearParams.angleDeg ?? 0).toFixed(1)),
                      unit: "°",
                      allowNegative: true,
                      initialLocked: isLinearLocked("angleDeg"),
                      onUpdateValue: (val, locked) => {
                        onChangeLinearParams({
                          ...linearParams,
                          angleDeg: val,
                          lockedFields: { ...linearParams.lockedFields, angleDeg: locked },
                        });
                      },
                    })
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 cursor-pointer",
                    isLinearLocked("angleDeg")
                      ? "border-amber-500/70 bg-amber-950/40 text-amber-300"
                      : "border-slate-700 bg-slate-900 hover:border-cyan-500",
                  )}
                >
                  <span>{(linearParams.angleDeg ?? 0).toFixed(0)}°</span>
                </button>
              </div>
            </>
          )}

          {/* CONTADOR DE INSTÂNCIAS ATIVAS / OMITIDAS */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900/90 border border-slate-700/80 font-mono text-[10px] text-slate-300"
            title="Toque em qualquer cópia fantasma (k >= 1) no canvas para omitir ou reativar essa posição"
          >
            <span>
              {validation.totalPositionsCount} pos = 1 orig +{" "}
              <strong className="text-cyan-300">{validation.activeCopiesCount}</strong> cópias
            </span>
            {skippedCount > 0 && (
              <>
                <span className="text-amber-300 font-bold">
                  ({skippedCount} omitida{skippedCount > 1 ? "s" : ""})
                </span>
                <button
                  type="button"
                  onClick={handleClearSkipped}
                  className="ml-1 p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300"
                  title="Restaurar todas as cópias omitidas"
                >
                  <RefreshCw className="size-2.5" />
                </button>
              </>
            )}
          </div>

          {/* FEEDBACK DE VALIDAÇÃO / COLISÃO EM TEMPO REAL */}
          {!validation.isValid && validation.errors.length > 0 && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 font-mono text-[10px]"
              title={validation.errors.join(" | ")}
            >
              <AlertTriangle className="size-3 text-red-400 shrink-0" />
              <span className="truncate max-w-[210px]">{validation.errors[0]}</span>
            </div>
          )}

          {validation.isValid && validation.warnings.length > 0 && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-200 font-mono text-[10px]"
              title={validation.warnings.join(" | ")}
            >
              <AlertTriangle className="size-3 text-amber-400 shrink-0" />
              <span className="truncate max-w-[210px]">{validation.warnings[0]}</span>
            </div>
          )}

          {/* AÇÕES DE CONFIRMAÇÃO (CONFIRMAR EM 1 TRANSAÇÃO ATÔMICA OU CANCELAR) */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("action");
                onApply();
              }}
              disabled={validation.activeCopiesCount < 1 && !polarParams.repositionOriginalToPcd}
              className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-xl font-mono text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95",
                validation.isValid
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-amber-600 hover:bg-amber-500 text-white",
              )}
              title="Confirmar e gravar instâncias no projeto CAD (1 transação atômica de Undo)"
            >
              <Check className="size-3.5" />
              <span>✓ Confirmar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                onCancel();
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-xl border font-mono text-[11px] transition-colors cursor-pointer",
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800"
                  : "border-slate-200 bg-slate-100 text-slate-600 hover:text-black",
              )}
              title="Cancelar e descartar prévia"
            >
              <X className="size-3.5" />
              <span className="hidden sm:inline">Cancelar</span>
            </button>
          </div>
        </div>
      </div>

      {/* TECLADO NUMÉRICO CAD INTEGRADO (ZERO TECLADO NATIVO DO CELULAR) */}
      {keypadField && (
        <ChamferDirectDimensionEditor
          open={true}
          onClose={() => setKeypadField(null)}
          screenPos={keypadField.screenPos}
          currentValue={keypadField.value}
          label={keypadField.label}
          unit={keypadField.unit}
          allowLock={true}
          initialLocked={keypadField.initialLocked}
          allowNegative={keypadField.allowNegative}
          onPreviewChange={(previewVal) => {
            const normalized = keypadField.isInteger
              ? Math.max(keypadField.minVal ?? 1, Math.round(previewVal))
              : previewVal;
            keypadField.onUpdateValue(normalized, keypadField.initialLocked);
          }}
          onConfirm={(finalVal, lockMeasure) => {
            const normalized = keypadField.isInteger
              ? Math.max(keypadField.minVal ?? 1, Math.round(finalVal))
              : finalVal;
            keypadField.onUpdateValue(normalized, lockMeasure);
            setKeypadField(null);
          }}
        />
      )}
    </>
  );
}
