/**
 * CALDRA CHAMFER — HUD FLUTUANTE DE ARRAYS INTELIGENTES (CAD 2D)
 *
 * Suporte a:
 * - Padrão Circular / Polar (Array Polar em Flange / PCD)
 * - Padrão Linear / Retangular (Array 1D/2D)
 *
 * Recursos:
 * - Seleção e comutação instantânea entre Polar e Linear com 1 toque
 * - Feedback dinâmico da peça hospedeira detectada (Flange concêntrico / Chapa)
 * - Chips de seleção de centro (Flange, Origem REF 0,0, Toque no Canvas)
 * - Presets industriais rápidos de furação (4, 6, 8, 12, 16 furos)
 * - Validação em tempo real (alerta de colisão com furo central ou borda)
 * - Botão de confirmação atômica e cancelamento seguro
 */

import React from "react";
import {
  RotateCw,
  Copy,
  Check,
  X,
  Target,
  AlertTriangle,
  Compass,
  ArrowRightLeft,
  CircleDot,
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
} from "@/lib/lab2d/cadArrayEngine";

export interface ChamferArrayHUDProps {
  arrayType: ArrayType;
  onChangeArrayType: (type: ArrayType) => void;

  polarParams: PolarArrayParams;
  onChangePolarParams: (params: PolarArrayParams) => void;

  linearParams: LinearArrayParams;
  onChangeLinearParams: (params: LinearArrayParams) => void;

  hostInfo: HostDetectionResult;
  validation: ArrayValidationResult;

  isPickingCenter: boolean;
  onTogglePickCenter: () => void;
  onSelectCandidateCenter: (center: Vec2) => void;

  onApply: () => void;
  onCancel: () => void;
  isDark?: boolean;
}

export function ChamferArrayHUD({
  arrayType,
  onChangeArrayType,
  polarParams,
  onChangePolarParams,
  linearParams,
  onChangeLinearParams,
  hostInfo,
  validation,
  isPickingCenter,
  onTogglePickCenter,
  onSelectCandidateCenter,
  onApply,
  onCancel,
  isDark = true,
}: ChamferArrayHUDProps) {
  const isPolar = arrayType === "polar";
  const POLAR_COUNT_PRESETS = [4, 6, 8, 12, 16];
  const POLAR_ANGLE_PRESETS = [360, 180, 90];

  return (
    <div
      role="toolbar"
      aria-label="Controle de Padrão Geométrico (Array)"
      className={cn(
        "pointer-events-auto fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-1.5 rounded-2xl border px-3 py-2 shadow-2xl backdrop-blur-xl transition-all select-none",
        "max-w-[calc(100vw-24px)] md:max-w-[850px] text-xs",
        isDark
          ? "border-cyan-800/60 bg-slate-950/95 text-slate-100 shadow-black/80"
          : "border-slate-300 bg-white/95 text-slate-800 shadow-slate-300/50",
      )}
    >
      {/* LINHA 1: TIPO DE PADRÃO + DETECÇÃO HOSPEDEIRA + SELEÇÃO DE CENTRO */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1.5 border-slate-700/50">
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
            <span>Circular (Polar PCD)</span>
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
            <span>Linear (Grade X/Y)</span>
          </button>
        </div>

        {/* INFORMAÇÃO DA PEÇA HOSPEDEIRA DETECTADA */}
        {hostInfo.type !== "unknown" && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono text-[10px]">
            <CircleDot className="size-3 shrink-0 text-cyan-400" />
            <span className="truncate max-w-[220px] sm:max-w-none">{hostInfo.description}</span>
          </div>
        )}

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
                  ? "bg-amber-600 border-amber-400 text-white animate-pulse"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-300",
              )}
              title="Clique no canvas para escolher o centro do círculo de furação"
            >
              <Target className="size-3" />
              <span>{isPickingCenter ? "Toque no Centro..." : "Mudar Centro"}</span>
            </button>

            {hostInfo.candidateCenters.length > 1 && (
              <select
                aria-label="Candidatos de Centro"
                value={`${polarParams.center.x.toFixed(1)},${polarParams.center.y.toFixed(1)}`}
                onChange={(e) => {
                  const [cx, cy] = e.target.value.split(",").map(Number);
                  if (Number.isFinite(cx) && Number.isFinite(cy)) {
                    triggerHaptic("selection");
                    onSelectCandidateCenter({ x: cx!, y: cy! });
                  }
                }}
                className={cn(
                  "rounded-lg border px-1.5 py-1 font-mono text-[10px] outline-none cursor-pointer max-w-[130px]",
                  isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-300 bg-white text-slate-800",
                )}
              >
                {hostInfo.candidateCenters.map((cand, idx) => (
                  <option
                    key={`cand-${idx}`}
                    value={`${cand.point.x.toFixed(1)},${cand.point.y.toFixed(1)}`}
                  >
                    {cand.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* LINHA 2: CONTROLES NUMÉRICOS PARAMÉTRICOS */}
      <div className="flex flex-wrap items-center gap-2">
        {isPolar ? (
          <>
            {/* QUANTIDADE DE ITENS NO POLAR */}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Furos:</span>
              <input
                type="number"
                min={2}
                max={120}
                step={1}
                value={polarParams.count}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isNaN(val) && val >= 1) {
                    onChangePolarParams({ ...polarParams, count: val });
                  }
                }}
                className={cn(
                  "w-12 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                  isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                )}
              />
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

            {/* PCD (DIÂMETRO DO CÍRCULO DE FURAÇÃO) */}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">PCD (Ø):</span>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  min={1}
                  max={5000}
                  step={0.5}
                  value={
                    polarParams.radius !== undefined
                      ? (polarParams.radius * 2).toFixed(1)
                      : hostInfo.pcd
                        ? hostInfo.pcd.toFixed(1)
                        : ""
                  }
                  onChange={(e) => {
                    const dia = parseFloat(e.target.value);
                    if (!Number.isNaN(dia) && dia > 0) {
                      onChangePolarParams({ ...polarParams, radius: dia / 2 });
                    }
                  }}
                  className={cn(
                    "w-16 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                    isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                  )}
                />
                <span className="font-mono text-[10px] text-muted-foreground">mm</span>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-700/60 hidden sm:block" />

            {/* ÂNGULO TOTAL */}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Ângulo:</span>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  min={1}
                  max={360}
                  step={5}
                  value={polarParams.totalAngleDeg}
                  onChange={(e) => {
                    const ang = parseFloat(e.target.value);
                    if (!Number.isNaN(ang) && ang > 0) {
                      onChangePolarParams({ ...polarParams, totalAngleDeg: ang });
                    }
                  }}
                  className={cn(
                    "w-14 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                    isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                  )}
                />
                <span className="font-mono text-[10px] text-muted-foreground">°</span>
              </div>
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
                "p-1 rounded-lg border text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer",
                polarParams.clockwise
                  ? "bg-amber-950/60 border-amber-500/50 text-amber-300"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white",
              )}
              title="Inverter sentido da distribuição"
            >
              <ArrowRightLeft className="size-3" />
              <span>{polarParams.clockwise ? "Horário" : "Anti-Horário"}</span>
            </button>
          </>
        ) : (
          <>
            {/* PARÂMETROS LINEARES: COLUNAS X E LINHAS Y */}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Colunas X:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={linearParams.cols}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isNaN(val) && val >= 1) {
                    onChangeLinearParams({ ...linearParams, cols: val });
                  }
                }}
                className={cn(
                  "w-12 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                  isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                )}
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Passo X:</span>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  step={1}
                  value={linearParams.dx}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) {
                      onChangeLinearParams({ ...linearParams, dx: val });
                    }
                  }}
                  className={cn(
                    "w-16 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                    isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                  )}
                />
                <span className="font-mono text-[10px] text-muted-foreground">mm</span>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-700/60 hidden sm:block" />

            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Linhas Y:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={linearParams.rows}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isNaN(val) && val >= 1) {
                    onChangeLinearParams({ ...linearParams, rows: val });
                  }
                }}
                className={cn(
                  "w-12 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                  isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                )}
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Passo Y:</span>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  step={1}
                  value={linearParams.dy}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) {
                      onChangeLinearParams({ ...linearParams, dy: val });
                    }
                  }}
                  className={cn(
                    "w-16 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                    isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                  )}
                />
                <span className="font-mono text-[10px] text-muted-foreground">mm</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground uppercase">Ângulo:</span>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  step={5}
                  value={linearParams.angleDeg ?? 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) {
                      onChangeLinearParams({ ...linearParams, angleDeg: val });
                    }
                  }}
                  className={cn(
                    "w-14 rounded-lg border px-1.5 py-0.5 text-center font-mono text-xs font-bold text-cyan-400 outline-none",
                    isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white",
                  )}
                />
                <span className="font-mono text-[10px] text-muted-foreground">°</span>
              </div>
            </div>
          </>
        )}

        {/* FEEDBACK DE VALIDAÇÃO (ERRO OU AVISO) */}
        {!validation.isValid && validation.errors.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-950/70 border border-red-500/50 text-red-300 font-mono text-[10px]">
            <AlertTriangle className="size-3 text-red-400 shrink-0" />
            <span className="truncate max-w-[200px]">{validation.errors[0]}</span>
          </div>
        )}

        {validation.isValid && validation.warnings.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/70 border border-amber-500/50 text-amber-300 font-mono text-[10px]">
            <AlertTriangle className="size-3 text-amber-400 shrink-0" />
            <span className="truncate max-w-[200px]">{validation.warnings[0]}</span>
          </div>
        )}

        {/* AÇÕES DE CONFIRMAÇÃO (APLICAR EM 1 TRANSAÇÃO OU CANCELAR) */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("action");
              onApply();
            }}
            disabled={!validation.isValid}
            className={cn(
              "flex items-center gap-1 px-3 py-1 rounded-xl font-mono text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95",
              validation.isValid
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-slate-800 text-slate-500 cursor-not-allowed",
            )}
            title="Aplicar padrão na peça (1 transação atômica de Undo)"
          >
            <Check className="size-3.5" />
            <span>Aplicar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("tap");
              onCancel();
            }}
            className={cn(
              "p-1 rounded-xl border transition-colors cursor-pointer",
              isDark
                ? "border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
                : "border-slate-200 bg-slate-100 text-slate-600 hover:text-black",
            )}
            title="Cancelar e descartar prévia"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
