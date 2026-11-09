import React, { useState, useCallback } from "react";
import {
  RotateCw,
  Grid,
  Check,
  X,
  Crosshair,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  Lock,
  Compass,
  ArrowLeftRight,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { Vec2 } from "@/lib/geometry/types";
import type {
  ArrayType,
  PolarArrayParams,
  LinearArrayParams,
  LinearDistributionMode,
  HostDetectionResult,
  ArrayValidationResult,
  ComputeInstancesResult,
} from "@/lib/lab2d/cadArrayEngine";
import { ChamferDirectDimensionEditor } from "./ChamferDirectDimensionEditor";
import { useExponentialHold } from "@/lib/lab2d/useExponentialHold";

interface ExponentialStepButtonProps {
  onStep: (multiplier: number) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}

const ExponentialStepButton: React.FC<ExponentialStepButtonProps> = ({
  onStep,
  className,
  title,
  children,
  "data-testid": testId,
}) => {
  const holdProps = useExponentialHold((mult) => {
    triggerHaptic("tap");
    onStep(mult);
  });
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      className={cn(className, "select-none")}
      {...holdProps}
    >
      {children}
    </button>
  );
};

export interface ChamferArrayHUDProps {
  arrayType: ArrayType;
  onChangeArrayType: (type: ArrayType) => void;
  polarParams: PolarArrayParams;
  onChangePolarParams: React.Dispatch<React.SetStateAction<PolarArrayParams>>;
  linearParams: LinearArrayParams;
  onChangeLinearParams: React.Dispatch<React.SetStateAction<LinearArrayParams>>;
  hostInfo: HostDetectionResult;
  validation: ArrayValidationResult;
  resolvedLinear?: ComputeInstancesResult["resolvedLinear"];
  isPickingCenter: boolean;
  onTogglePickCenter: () => void;
  onSelectCandidateCenter?: (center: Vec2) => void;
  autoIncludedCount?: number;
  includeAssembly?: boolean;
  onToggleIncludeAssembly?: () => void;
  autoTrim?: boolean;
  onToggleAutoTrim?: () => void;
  onApply: () => void;
  onCancel: () => void;
  isDark: boolean;
  isCanvasInteracting?: boolean;
}

type ActiveKeypadField =
  | "polar_count"
  | "polar_pcd"
  | "polar_radius"
  | "polar_angle"
  | "polar_start_angle"
  | "linear_nx"
  | "linear_ny"
  | "linear_dx"
  | "linear_dy"
  | "linear_span_x"
  | "linear_span_y"
  | "linear_margin"
  | "linear_angle";

const COUNT_PRESETS = [3, 4, 6, 8, 12, 16];
const ANGLE_PRESETS = [360, 180, 90];
const LINEAR_ANGLE_PRESETS = [0, 30, 45, 90];

export const ChamferArrayHUD: React.FC<ChamferArrayHUDProps> = ({
  arrayType,
  onChangeArrayType,
  polarParams,
  onChangePolarParams,
  linearParams,
  onChangeLinearParams,
  hostInfo,
  validation,
  resolvedLinear,
  isPickingCenter,
  onTogglePickCenter,
  onSelectCandidateCenter,
  autoIncludedCount = 0,
  includeAssembly = true,
  onToggleIncludeAssembly,
  autoTrim,
  onToggleAutoTrim,
  onApply,
  onCancel,
  isDark,
}) => {
  const [keypadState, setKeypadState] = useState<{
    field: ActiveKeypadField;
    label: string;
    value: number;
    screenPos: { x: number; y: number };
    allowInvert?: boolean;
    initialLocked?: boolean;
  } | null>(null);

  const safePolarRadius = Number.isFinite(polarParams.radius) ? (polarParams.radius ?? 50) : 50;
  const pcdValue = Number((safePolarRadius * 2).toFixed(2));
  const radiusValue = Number(safePolarRadius.toFixed(2));
  const startAngleValue = Number((polarParams.startAngleDeg ?? 0).toFixed(1));
  const linearMode: LinearDistributionMode =
    linearParams.mode ?? linearParams.modeX ?? "fixed_step";
  const linearAngleValue = Number((linearParams.angleDeg ?? 0).toFixed(1));
  const marginValue = Number((linearParams.marginX ?? 15).toFixed(1));
  const spanXValue = Number((linearParams.spanX ?? 160).toFixed(1));
  const spanYValue = Number((linearParams.spanY ?? 100).toFixed(1));

  const effectiveCols = resolvedLinear?.cols ?? linearParams.cols ?? 1;
  const effectiveRows = resolvedLinear?.rows ?? linearParams.rows ?? 1;
  const effectiveStepX = Number(
    (resolvedLinear?.stepX ?? linearParams.dx ?? 40).toFixed(1),
  );
  const effectiveStepY = Number(
    (resolvedLinear?.stepY ?? linearParams.dy ?? 40).toFixed(1),
  );

  const openNumericKeypad = useCallback(
    (
      ev: React.MouseEvent<HTMLElement>,
      field: ActiveKeypadField,
      label: string,
      value: number,
      allowInvert = false,
      initialLocked = false,
    ) => {
      ev.stopPropagation();
      triggerHaptic("selection");
      const rect = ev.currentTarget.getBoundingClientRect();
      const safeX =
        typeof window !== "undefined"
          ? Math.max(160, Math.min(window.innerWidth - 180, rect.left - 145))
          : rect.left;
      const safeY =
        typeof window !== "undefined"
          ? Math.max(150, Math.min(window.innerHeight - 190, rect.top))
          : rect.top;
      setKeypadState({
        field,
        label,
        value,
        screenPos: { x: safeX, y: safeY },
        allowInvert,
        initialLocked,
      });
    },
    [],
  );

  const applyKeypadValue = useCallback(
    (rawVal: number, isFinal: boolean) => {
      if (!keypadState || !Number.isFinite(rawVal)) return;
      const f = keypadState.field;

      if (f === "polar_count") {
        const nextCount = Math.max(2, Math.min(360, Math.round(Math.abs(rawVal))));
        onChangePolarParams((p) => ({ ...p, count: nextCount }));
      } else if (f === "polar_pcd") {
        const nextPcd = Math.max(1, Math.abs(rawVal));
        onChangePolarParams((p) => ({ ...p, radius: nextPcd / 2 }));
      } else if (f === "polar_radius") {
        const nextR = Math.max(0.5, Math.abs(rawVal));
        onChangePolarParams((p) => ({ ...p, radius: nextR }));
      } else if (f === "polar_angle") {
        const nextAng = Math.max(1, Math.min(360, Math.abs(rawVal)));
        onChangePolarParams((p) => ({ ...p, totalAngleDeg: nextAng }));
      } else if (f === "polar_start_angle") {
        onChangePolarParams((p) => ({ ...p, startAngleDeg: rawVal }));
      } else if (f === "linear_nx") {
        const nextNx = Math.max(1, Math.min(200, Math.round(Math.abs(rawVal))));
        onChangeLinearParams((p) => ({
          ...p,
          mode: p.mode === "fill" ? "fixed_step" : p.mode,
          modeX: p.modeX === "fill" ? "fixed_step" : p.modeX,
          cols: nextNx,
        }));
      } else if (f === "linear_ny") {
        const nextNy = Math.max(1, Math.min(200, Math.round(Math.abs(rawVal))));
        onChangeLinearParams((p) => ({ ...p, rows: nextNy }));
      } else if (f === "linear_dx") {
        onChangeLinearParams((p) => ({
          ...p,
          dx: rawVal,
          dirX: rawVal < 0 ? -1 : 1,
        }));
      } else if (f === "linear_dy") {
        onChangeLinearParams((p) => ({
          ...p,
          dy: rawVal,
          dirY: rawVal < 0 ? -1 : 1,
        }));
      } else if (f === "linear_span_x") {
        onChangeLinearParams((p) => ({ ...p, spanX: Math.max(1, Math.abs(rawVal)) }));
      } else if (f === "linear_span_y") {
        onChangeLinearParams((p) => ({ ...p, spanY: Math.max(0, Math.abs(rawVal)) }));
      } else if (f === "linear_margin") {
        const nextMargin = Math.max(0, Math.abs(rawVal));
        onChangeLinearParams((p) => ({
          ...p,
          marginX: nextMargin,
          marginY: nextMargin,
        }));
      } else if (f === "linear_angle") {
        onChangeLinearParams((p) => ({ ...p, angleDeg: rawVal }));
      }

      if (isFinal) {
        setKeypadState(null);
      }
    },
    [keypadState, onChangePolarParams, onChangeLinearParams],
  );

  const primaryDiagnostic =
    validation.errors[0] ??
    validation.warnings[0] ??
    (validation.collidingCount > 0
      ? "Colisão entre furos: ajuste o passo ou o raio."
      : null);

  const cardClass = cn(
    "rounded-xl border p-2.5 transition-colors",
    isDark
      ? "border-slate-800/90 bg-slate-900/55"
      : "border-slate-200 bg-slate-50/90",
  );

  const rowClass = cn(
    "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
    isDark
      ? "border-slate-800/80 bg-slate-950/65"
      : "border-slate-200/90 bg-white",
  );

  const stepBtnClass = cn(
    "flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold transition-colors cursor-pointer",
    isDark
      ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/50 hover:text-white"
      : "border-slate-300 bg-slate-100 text-slate-700 hover:border-cyan-500 hover:text-slate-950",
  );

  const valuePillClass = cn(
    "min-w-[68px] rounded-md border px-2 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums transition-colors cursor-pointer",
    isDark
      ? "border-cyan-500/35 bg-cyan-950/40 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900/50"
      : "border-cyan-400 bg-cyan-50 text-cyan-800 hover:bg-cyan-100",
  );

  return (
    <>
      <aside
        id="chamfer-array-right-panel"
        aria-label="Janela Lateral Direita de Padrão de Repetição (Array)"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className={cn(
          "z-40 flex h-full w-[285px] sm:w-[310px] max-w-[86vw] shrink-0 flex-col overflow-hidden border-l select-none shadow-2xl backdrop-blur-md transition-all",
          "max-sm:absolute max-sm:right-1 max-sm:top-1 max-sm:bottom-1 max-sm:rounded-2xl max-sm:border sm:relative",
          isDark
            ? "border-[#293444] bg-[#151C27]/98 text-[#E6EDF5]"
            : "border-[#CBD5E1] bg-[#FFFFFF]/98 text-[#1E293B]",
        )}
      >
        {/* ================================================================= */}
        {/* CABEÇALHO FIXO DA JANELA DIREITA                                   */}
        {/* ================================================================= */}
        <div
          className={cn(
            "flex shrink-0 flex-col gap-2 border-b px-3 py-2.5",
            isDark
              ? "border-[#293444] bg-[#0D121B]"
              : "border-[#CBD5E1] bg-[#F1F5F9]",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className={cn("size-3.5 shrink-0", isDark ? "text-[#38BDF8]" : "text-[#0284C7]")} />
              <span className="truncate font-mono text-[10px] font-bold uppercase tracking-wider">
                PADRÃO DE REPETIÇÃO (ARRAY)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("tap");
                onCancel();
              }}
              title="Fechar e Cancelar Padrão"
              aria-label="Fechar janela de Array"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer",
                isDark
                  ? "border-[#293444] bg-[#151C27] text-[#94A3B8] hover:border-[#E11D48] hover:text-white"
                  : "border-[#CBD5E1] bg-[#FFFFFF] text-[#64748B] hover:border-[#E11D48] hover:text-[#E11D48]",
              )}
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Seletor Segmentado de 3 Modos Completos: Linear, Retangular e Polar */}
          <div
            className={cn(
              "grid grid-cols-3 gap-1 rounded-xl border p-1",
              isDark
                ? "border-[#293444] bg-[#151C27]"
                : "border-[#CBD5E1] bg-[#FFFFFF]",
            )}
          >
            <button
              type="button"
              data-testid="array-mode-linear"
              onClick={() => {
                triggerHaptic("selection");
                onChangeArrayType("linear");
                onChangeLinearParams((p) => ({ ...p, rows: 1 }));
              }}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                arrayType === "linear" && (linearParams.rows ?? 1) <= 1
                  ? "bg-cyan-500 text-slate-950 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <ArrowLeftRight className="size-3" />
              <span>Linear</span>
            </button>
            <button
              type="button"
              data-testid="array-mode-rectangular"
              onClick={() => {
                triggerHaptic("selection");
                onChangeArrayType("linear");
                onChangeLinearParams((p) => ({
                  ...p,
                  rows: Math.max(2, p.rows || 2),
                  cols: Math.max(2, p.cols || 2),
                }));
              }}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                arrayType === "linear" && (linearParams.rows ?? 1) > 1
                  ? "bg-cyan-500 text-slate-950 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Grid className="size-3" />
              <span>Retangular</span>
            </button>
            <button
              type="button"
              data-testid="array-mode-polar"
              onClick={() => {
                triggerHaptic("selection");
                onChangeArrayType("polar");
              }}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                arrayType === "polar"
                  ? "bg-cyan-500 text-slate-950 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <RotateCw className="size-3" />
              <span>Polar</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* CORPO VERTICAL ORGANIZADO EM CARTÕES LIMPOS (ZERO SOBREPOSIÇÃO)    */}
        {/* ================================================================= */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5 scrollbar-thin">
          {/* --------------------------------------------------------------- */}
          {/* SEÇÃO 1 — STATUS E HOSPEDEIRO / PIVÔ                            */}
          {/* --------------------------------------------------------------- */}
          <div className={cardClass}>
            <div className="mb-1.5 flex items-center justify-between gap-1.5">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                1. Status e Hospedeiro / Pivô
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
                  hostInfo.confidence === "high"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : hostInfo.confidence === "medium"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-slate-500/20 text-slate-400",
                )}
              >
                {hostInfo.confidenceLabel}
              </span>
            </div>

            <div
              className={cn(
                "rounded-lg border px-2.5 py-1.5 font-mono text-[10px] leading-snug",
                isDark
                  ? "border-slate-800 bg-slate-950/70 text-slate-300"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              {hostInfo.description}
            </div>

            {arrayType === "polar" && (
              <div className="mt-2 space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onTogglePickCenter();
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                    isPickingCenter
                      ? "border-amber-400 bg-amber-500 text-slate-950 shadow-sm"
                      : isDark
                        ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300"
                        : "border-slate-300 bg-white text-slate-800 hover:border-cyan-500",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Crosshair className="size-3.5 text-rose-500" />
                    <span>
                      {isPickingCenter
                        ? "Toque no canvas para fixar..."
                        : "Definir Pivô / Centro ⊕"}
                    </span>
                  </span>
                  <span className="font-mono text-[9px] opacity-80 tabular-nums">
                    ({polarParams.center.x.toFixed(0)}, {polarParams.center.y.toFixed(0)})
                  </span>
                </button>

                {hostInfo.isOffFlangeCenterline && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("action");
                      onChangePolarParams((p) => {
                        const nextActive = !p.repositionOriginalToPcd;
                        return {
                          ...p,
                          repositionOriginalToPcd: nextActive,
                          ...(hostInfo.flangeMidRadius && nextActive
                            ? { radius: hostInfo.flangeMidRadius }
                            : {}),
                        };
                      });
                    }}
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                      polarParams.repositionOriginalToPcd
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25",
                    )}
                  >
                    <Compass className="size-3.5" />
                    <span>
                      ⌖ Centralizar na Aba:{" "}
                      {polarParams.repositionOriginalToPcd ? "ATIVO" : "APLICAR"}
                    </span>
                  </button>
                )}

                {hostInfo.candidateCenters.length > 1 && onSelectCandidateCenter && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <span className="font-mono text-[9px] text-slate-400 mr-1">
                      Centros:
                    </span>
                    {hostInfo.candidateCenters.map((cand, idx) => (
                      <button
                        key={`${cand.source}-${cand.point.x.toFixed(2)}-${cand.point.y.toFixed(2)}-${idx}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onSelectCandidateCenter(cand.point);
                        }}
                        title={cand.label}
                        className={cn(
                          "rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold transition-colors cursor-pointer",
                          Math.hypot(
                            cand.point.x - polarParams.center.x,
                            cand.point.y - polarParams.center.y,
                          ) < 0.5
                            ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                            : isDark
                              ? "border-slate-700 bg-slate-900 text-slate-400 hover:text-white"
                              : "border-slate-300 bg-white text-slate-700",
                        )}
                      >
                        C{idx + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SEÇÃO 2 — MODO DE DISTRIBUIÇÃO (LINEAR) OU ÂNGULO (POLAR)        */}
          {/* --------------------------------------------------------------- */}
          <div className={cardClass}>
            {arrayType === "linear" ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    2. Modo de Distribuição
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: "fixed_step", label: "Passo Fixo" },
                      { id: "total_span", label: "Extensão" },
                      { id: "auto_fit", label: "Auto-Fit (Adaptar)" },
                      { id: "fill", label: "Fill (Preencher)" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onChangeLinearParams((p) => ({
                          ...p,
                          mode: m.id,
                          modeX: m.id,
                          modeY: m.id,
                        }));
                      }}
                      className={cn(
                        "flex items-center justify-center rounded-lg border px-2 py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                        linearMode === m.id
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-xs"
                          : isDark
                            ? "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    2. Ângulo Total e Sentido
                  </span>
                </div>
                <div className="space-y-2">
                  <div className={rowClass}>
                    <span className="font-mono text-[10px] font-semibold">
                      Ângulo Total (°)
                    </span>
                    <div className="flex items-center gap-1">
                      <ExponentialStepButton
                        onStep={(mult) =>
                          onChangePolarParams((p) => ({
                            ...p,
                            totalAngleDeg: Math.max(15, p.totalAngleDeg - 15 * mult),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        -
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openNumericKeypad(
                            ev,
                            "polar_angle",
                            "Ângulo Total do Padrão (°)",
                            polarParams.totalAngleDeg,
                          )
                        }
                        className={valuePillClass}
                      >
                        {polarParams.totalAngleDeg}°
                      </button>
                      <ExponentialStepButton
                        onStep={(mult) =>
                          onChangePolarParams((p) => ({
                            ...p,
                            totalAngleDeg: Math.min(360, p.totalAngleDeg + 15 * mult),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        +
                      </ExponentialStepButton>
                    </div>
                  </div>

                  {/* Atalhos 360°, 180°, 90° + Sentido CCW/CW */}
                  <div className="grid grid-cols-4 gap-1">
                    {ANGLE_PRESETS.map((ang) => (
                      <button
                        key={ang}
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onChangePolarParams((p) => ({ ...p, totalAngleDeg: ang }));
                        }}
                        className={cn(
                          "rounded-lg border py-1 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                          polarParams.totalAngleDeg === ang
                            ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                            : isDark
                              ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                              : "border-slate-200 bg-white text-slate-700",
                        )}
                      >
                        {ang}°
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onChangePolarParams((p) => ({ ...p, clockwise: !p.clockwise }));
                      }}
                      title="Alternar sentido de giro (Anti-horário CCW / Horário CW)"
                      className={cn(
                        "rounded-lg border py-1 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                        polarParams.clockwise
                          ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                          : "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
                      )}
                    >
                      {polarParams.clockwise ? "↻ CW" : "↺ CCW"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SEÇÃO 3 — PARÂMETROS DIMENSIONAIS E QUANTIDADES (LINHAS LIMPAS)  */}
          {/* --------------------------------------------------------------- */}
          <div className={cardClass}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                3. Parâmetros Dimensionais
              </span>
            </div>

            {arrayType === "polar" ? (
              <div className="space-y-1.5">
                {/* Linha 1: Quantidade (N) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Quantidade (N)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      data-testid="array-polar-count-minus"
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          count: Math.max(2, p.count - 1 * mult),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "polar_count",
                          "Quantidade de Furos / Cópias (N)",
                          polarParams.count,
                        )
                      }
                      className={valuePillClass}
                    >
                      {polarParams.count} un
                    </button>
                    <ExponentialStepButton
                      data-testid="array-polar-count-plus"
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          count: Math.min(360, p.count + 1 * mult),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>

                {/* Presets rápidos de quantidade */}
                <div className="grid grid-cols-6 gap-1">
                  {COUNT_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onChangePolarParams((p) => ({ ...p, count: n }));
                      }}
                      className={cn(
                        "rounded-md border py-1 font-mono text-[9px] font-bold transition-colors cursor-pointer",
                        polarParams.count === n
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                          : isDark
                            ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                            : "border-slate-200 bg-white text-slate-600",
                      )}
                    >
                      {n}x
                    </button>
                  ))}
                </div>

                {/* Linha 2: Diâmetro PCD (mm) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Diâmetro PCD (mm)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          radius: Math.max(1, Number(((p.radius ?? 50) - 2.5 * mult).toFixed(2))),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "polar_pcd",
                          "Diâmetro Primitivo PCD (mm)",
                          pcdValue,
                        )
                      }
                      className={valuePillClass}
                    >
                      Ø {pcdValue}
                    </button>
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          radius: Number(((p.radius ?? 50) + 2.5 * mult).toFixed(2)),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>

                {/* Linha 3: Raio (mm) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Raio (mm)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          radius: Math.max(0.5, Number(((p.radius ?? 50) - 1 * mult).toFixed(2))),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "polar_radius",
                          "Raio do Padrão Circular (mm)",
                          radiusValue,
                        )
                      }
                      className={valuePillClass}
                    >
                      R {radiusValue}
                    </button>
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          radius: Number(((p.radius ?? 50) + 1 * mult).toFixed(2)),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>

                {/* Linha 4: Ângulo Inicial (θ₀) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Ângulo Inicial (θ₀)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          startAngleDeg: Number(((p.startAngleDeg ?? 0) - 15 * mult).toFixed(1)),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "polar_start_angle",
                          "Ângulo Inicial θ₀ (°)",
                          startAngleValue,
                        )
                      }
                      className={valuePillClass}
                    >
                      {startAngleValue}°
                    </button>
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangePolarParams((p) => ({
                          ...p,
                          startAngleDeg: Number(((p.startAngleDeg ?? 0) + 15 * mult).toFixed(1)),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Linha 1: Colunas (Nx) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    {linearMode === "fill" ? "Colunas (Auto Nx)" : "Colunas (Nx)"}
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      data-testid="array-linear-cols-minus"
                      onStep={(mult) =>
                        onChangeLinearParams((p) => ({
                          ...p,
                          mode: p.mode === "fill" ? "fixed_step" : p.mode,
                          modeX: p.modeX === "fill" ? "fixed_step" : p.modeX,
                          cols: Math.max(1, (p.cols ?? 1) - 1 * mult),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "linear_nx",
                          "Colunas / Quantidade em X (Nx)",
                          effectiveCols,
                        )
                      }
                      className={valuePillClass}
                    >
                      {effectiveCols} un
                    </button>
                    <ExponentialStepButton
                      data-testid="array-linear-cols-plus"
                      onStep={(mult) =>
                        onChangeLinearParams((p) => ({
                          ...p,
                          mode: p.mode === "fill" ? "fixed_step" : p.mode,
                          modeX: p.modeX === "fill" ? "fixed_step" : p.modeX,
                          cols: Math.min(200, (p.cols ?? 1) + 1 * mult),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>

                {/* Linha 2: Passo X (mm) ou Extensão X (mm) */}
                {linearMode === "total_span" ? (
                  <div className={rowClass}>
                    <span className="font-mono text-[10px] font-semibold">
                      Extensão X (mm)
                    </span>
                    <div className="flex items-center gap-1">
                      <ExponentialStepButton
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            spanX: Math.max(5, Number(((p.spanX ?? 160) - 10 * mult).toFixed(1))),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        -
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openNumericKeypad(
                            ev,
                            "linear_span_x",
                            "Extensão Total X (mm)",
                            spanXValue,
                          )
                        }
                        className={valuePillClass}
                      >
                        {spanXValue} mm
                      </button>
                      <ExponentialStepButton
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            spanX: Number(((p.spanX ?? 160) + 10 * mult).toFixed(1)),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        +
                      </ExponentialStepButton>
                    </div>
                  </div>
                ) : (
                  <div className={rowClass}>
                    <span className="font-mono text-[10px] font-semibold">
                      Passo X (mm)
                    </span>
                    <div className="flex items-center gap-1">
                      <ExponentialStepButton
                        data-testid="array-linear-dx-minus"
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            dx: Number((p.dx - 5 * mult).toFixed(2)),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        -
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openNumericKeypad(
                            ev,
                            "linear_dx",
                            "Passo X entre Centros (mm)",
                            effectiveStepX,
                            true,
                            linearMode === "fill",
                          )
                        }
                        className={cn(
                          valuePillClass,
                          linearMode === "fill" &&
                            "border-amber-500/45 bg-amber-500/15 text-amber-300",
                        )}
                      >
                        {linearMode === "fill" && (
                          <Lock className="mr-1 inline size-2.5" />
                        )}
                        {effectiveStepX.toFixed(1)}
                      </button>
                      <ExponentialStepButton
                        data-testid="array-linear-dx-plus"
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            dx: Number((p.dx + 5 * mult).toFixed(2)),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        +
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onChangeLinearParams((p) => ({
                            ...p,
                            dx: -p.dx,
                            dirX: (p.dirX ?? 1) === 1 ? -1 : 1,
                          }));
                        }}
                        title="Inverter direção X (±)"
                        className={stepBtnClass}
                      >
                        <ArrowLeftRight className="size-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Linha 3: Linhas (Ny) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Linhas (Ny)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      data-testid="array-linear-rows-minus"
                      onStep={(mult) =>
                        onChangeLinearParams((p) => ({
                          ...p,
                          rows: Math.max(1, (p.rows ?? 1) - 1 * mult),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "linear_ny",
                          "Linhas / Quantidade em Y (Ny)",
                          effectiveRows,
                        )
                      }
                      className={valuePillClass}
                    >
                      {effectiveRows} un
                    </button>
                    <ExponentialStepButton
                      data-testid="array-linear-rows-plus"
                      onStep={(mult) =>
                        onChangeLinearParams((p) => ({
                          ...p,
                          rows: Math.min(200, (p.rows ?? 1) + 1 * mult),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>

                {/* Linha 4: Passo Y (mm) ou Extensão Y (mm) */}
                {linearMode === "total_span" ? (
                  <div className={rowClass}>
                    <span className="font-mono text-[10px] font-semibold">
                      Extensão Y (mm)
                    </span>
                    <div className="flex items-center gap-1">
                      <ExponentialStepButton
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            spanY: Math.max(0, Number(((p.spanY ?? 100) - 10 * mult).toFixed(1))),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        -
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openNumericKeypad(
                            ev,
                            "linear_span_y",
                            "Extensão Total Y (mm)",
                            spanYValue,
                          )
                        }
                        className={valuePillClass}
                      >
                        {spanYValue} mm
                      </button>
                      <ExponentialStepButton
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            spanY: Number(((p.spanY ?? 100) + 10 * mult).toFixed(1)),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        +
                      </ExponentialStepButton>
                    </div>
                  </div>
                ) : (
                  <div className={rowClass}>
                    <span className="font-mono text-[10px] font-semibold">
                      Passo Y (mm)
                    </span>
                    <div className="flex items-center gap-1">
                      <ExponentialStepButton
                        data-testid="array-linear-dy-minus"
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            dy: Number((p.dy - 5 * mult).toFixed(2)),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        -
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openNumericKeypad(
                            ev,
                            "linear_dy",
                            "Passo Y entre Linhas (mm)",
                            effectiveStepY,
                            true,
                          )
                        }
                        className={valuePillClass}
                      >
                        {effectiveStepY.toFixed(1)}
                      </button>
                      <ExponentialStepButton
                        data-testid="array-linear-dy-plus"
                        onStep={(mult) =>
                          onChangeLinearParams((p) => ({
                            ...p,
                            dy: Number((p.dy + 5 * mult).toFixed(2)),
                          }))
                        }
                        className={stepBtnClass}
                      >
                        +
                      </ExponentialStepButton>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("selection");
                          onChangeLinearParams((p) => ({
                            ...p,
                            dy: -p.dy,
                            dirY: (p.dirY ?? 1) === 1 ? -1 : 1,
                          }));
                        }}
                        title="Inverter direção Y (±)"
                        className={stepBtnClass}
                      >
                        <ArrowUpDown className="size-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Linha 5: Inclinação (∠°) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Inclinação (∠°)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangeLinearParams((p) => ({
                          ...p,
                          angleDeg: Number(((p.angleDeg ?? 0) - 15 * mult).toFixed(1)),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "linear_angle",
                          "Ângulo de Inclinação da Grade (°)",
                          linearAngleValue,
                        )
                      }
                      className={valuePillClass}
                    >
                      {linearAngleValue}°
                    </button>
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangeLinearParams((p) => ({
                          ...p,
                          angleDeg: Number(((p.angleDeg ?? 0) + 15 * mult).toFixed(1)),
                        }))
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>

                {/* Atalhos rápidos de inclinação */}
                <div className="grid grid-cols-4 gap-1">
                  {LINEAR_ANGLE_PRESETS.map((ang) => (
                    <button
                      key={ang}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onChangeLinearParams((p) => ({ ...p, angleDeg: ang }));
                      }}
                      className={cn(
                        "rounded-md border py-1 font-mono text-[9px] font-bold transition-colors cursor-pointer",
                        linearAngleValue === ang
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                          : isDark
                            ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                            : "border-slate-200 bg-white text-slate-600",
                      )}
                    >
                      {ang}°
                    </button>
                  ))}
                </div>

                {/* Linha 6: Margem (mm) */}
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Margem (mm)
                  </span>
                  <div className="flex items-center gap-1">
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangeLinearParams((p) => {
                          const next = Math.max(
                            0,
                            Number(((p.marginX ?? 15) - 2.5 * mult).toFixed(1)),
                          );
                          return { ...p, marginX: next, marginY: next };
                        })
                      }
                      className={stepBtnClass}
                    >
                      -
                    </ExponentialStepButton>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openNumericKeypad(
                          ev,
                          "linear_margin",
                          "Margem da Borda (mm)",
                          marginValue,
                        )
                      }
                      className={valuePillClass}
                    >
                      {marginValue} mm
                    </button>
                    <ExponentialStepButton
                      onStep={(mult) =>
                        onChangeLinearParams((p) => {
                          const next = Number(((p.marginX ?? 15) + 2.5 * mult).toFixed(1));
                          return { ...p, marginX: next, marginY: next };
                        })
                      }
                      className={stepBtnClass}
                    >
                      +
                    </ExponentialStepButton>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SEÇÃO 4 — OPÇÕES E DIAGNÓSTICO ÚNICO                            */}
          {/* --------------------------------------------------------------- */}
          <div className={cardClass}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                4. Opções e Diagnóstico
              </span>
            </div>

            <div className="space-y-1.5">
              {/* Toggle [ ⚡ Auto-Trim / Unir Contorno ] */}
              {(() => {
                const isAutoTrimActive =
                  autoTrim ??
                  (arrayType === "polar"
                    ? Boolean(polarParams.autoTrim)
                    : Boolean(linearParams.autoTrim));
                return (
                  <button
                    type="button"
                    data-testid="array-autotrim-toggle"
                    onClick={() => {
                      triggerHaptic("selection");
                      if (onToggleAutoTrim) {
                        onToggleAutoTrim();
                      } else if (arrayType === "polar") {
                        onChangePolarParams((p) => ({ ...p, autoTrim: !p.autoTrim }));
                      } else {
                        onChangeLinearParams((p) => ({ ...p, autoTrim: !p.autoTrim }));
                      }
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer",
                      isAutoTrimActive
                        ? "border-amber-400 bg-amber-500/20 text-amber-200 shadow-xs"
                        : isDark
                          ? "border-slate-800 bg-slate-950/75 text-slate-300 hover:border-amber-500/40"
                          : "border-slate-200 bg-white text-slate-700 hover:border-amber-400",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>⚡ Auto-Trim / Unir Contorno</span>
                    </span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-mono text-[9px] font-bold",
                        isAutoTrimActive
                          ? "bg-amber-400 text-slate-950"
                          : isDark
                            ? "bg-slate-800 text-slate-400"
                            : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {isAutoTrimActive ? "ON" : "OFF"}
                    </span>
                  </button>
                );
              })()}

              {/* Conjunto Geométrico Automático (Furos e Geometrias Internas) */}
              {(autoIncludedCount > 0 || onToggleIncludeAssembly) && (
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Conjunto Interno ({autoIncludedCount} item{autoIncludedCount === 1 ? "" : "s"})
                  </span>
                  <button
                    type="button"
                    data-testid="array-assembly-toggle"
                    onClick={() => {
                      triggerHaptic("selection");
                      onToggleIncludeAssembly?.();
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                      includeAssembly
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                        : isDark
                          ? "border-slate-700 bg-slate-900 text-slate-400"
                          : "border-slate-300 bg-slate-100 text-slate-600",
                    )}
                  >
                    {includeAssembly ? "INCLUÍDO" : "SÓ BORDA"}
                  </button>
                </div>
              )}

              {arrayType === "polar" && (
                <div className={rowClass}>
                  <span className="font-mono text-[10px] font-semibold">
                    Girar itens junto ao arco
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      onChangePolarParams((p) => ({
                        ...p,
                        rotateItems: !p.rotateItems,
                      }));
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors cursor-pointer",
                      polarParams.rotateItems
                        ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                        : isDark
                          ? "border-slate-700 bg-slate-900 text-slate-400"
                          : "border-slate-300 bg-slate-100 text-slate-600",
                    )}
                  >
                    {polarParams.rotateItems ? "ON" : "OFF"}
                  </button>
                </div>
              )}

              {/* Resumo de posições geradas */}
              <div className={rowClass}>
                <span className="font-mono text-[10px] text-slate-400">
                  Resumo do Padrão
                </span>
                <span className="font-mono text-[10px] font-bold tabular-nums">
                  {validation.totalPositionsCount} pos = 1 orig +{" "}
                  <span className="text-cyan-400">{validation.activeCopiesCount}</span>{" "}
                  cópias
                </span>
              </div>

              {validation.skippedCount > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5">
                  <span className="font-mono text-[10px] text-amber-300">
                    {validation.skippedCount} posição(ões) omitida(s)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      if (arrayType === "polar") {
                        onChangePolarParams((p) => ({ ...p, skippedIndices: [] }));
                      } else {
                        onChangeLinearParams((p) => ({ ...p, skippedIndices: [] }));
                      }
                    }}
                    className="flex items-center gap-1 rounded border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                  >
                    <RotateCcw className="size-2.5" />
                    <span>Restaurar</span>
                  </button>
                </div>
              )}

              {/* 1 ÚNICO CARD LIMPO DE AVISO / COLISÃO */}
              {primaryDiagnostic ? (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-2.5 py-2 font-mono text-[10px] leading-snug",
                    !validation.isValid
                      ? "border-red-500/50 bg-red-950/55 text-red-200"
                      : "border-amber-500/50 bg-amber-950/50 text-amber-200",
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      !validation.isValid ? "text-red-400" : "text-amber-400",
                    )}
                  />
                  <span>{primaryDiagnostic}</span>
                </div>
              ) : (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[10px]",
                    isDark
                      ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800",
                  )}
                >
                  <Check className="size-3.5 shrink-0 text-emerald-400" />
                  <span>Geometria válida e sem colisões detectadas.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RODAPÉ FIXO DA JANELA DIREITA                                      */}
        {/* ================================================================= */}
        <div
          className={cn(
            "grid shrink-0 grid-cols-2 gap-2 border-t px-3 py-2.5",
            isDark
              ? "border-[#293444] bg-[#0D121B]"
              : "border-[#CBD5E1] bg-[#F1F5F9]",
          )}
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              onCancel();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border py-2 font-mono text-[11px] font-bold transition-colors cursor-pointer",
              isDark
                ? "border-[#293444] bg-[#151C27] text-[#E6EDF5] hover:border-[#94A3B8] hover:text-white"
                : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B] hover:bg-[#F8FAFC]",
            )}
          >
            <X className="size-3.5" />
            <span>Cancelar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("success");
              onApply();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 font-mono text-[11px] font-bold shadow-md transition-all cursor-pointer",
              !validation.isValid
                ? "bg-[#F59E0B] text-[#0B0F14] hover:bg-amber-400"
                : isDark
                  ? "bg-[#34D399] text-[#0B0F14] hover:bg-emerald-300"
                  : "bg-[#059669] text-white hover:bg-emerald-700",
            )}
          >
            <Check className="size-3.5 stroke-[2.5]" />
            <span>Confirmar</span>
          </button>
        </div>
      </aside>

      {/* TECLADO NUMÉRICO PRÓPRIO DO CHAMFER CAD */}
      {keypadState && (
        <ChamferDirectDimensionEditor
          open={true}
          label={keypadState.label}
          currentValue={keypadState.value}
          screenPos={keypadState.screenPos}
          allowInvert={keypadState.allowInvert}
          initialLocked={keypadState.initialLocked}
          onPreviewChange={(val) => applyKeypadValue(val, false)}
          onConfirm={(val) => applyKeypadValue(val, true)}
          onClose={() => setKeypadState(null)}
        />
      )}
    </>
  );
};
