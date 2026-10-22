/**
 * CALDRA — CHAMFER INTENT (COMPILADOR GEOMÉTRICO PARAMÉTRICO POR LINGUAGEM NATURAL)
 *
 * Interface Mobile-First e Desktop do Compilador Semântico do CHAMFER CAD:
 *  - Entrada em linguagem natural com suporte a português técnico e informal;
 *  - Janela de Prévia em Tempo Real (Live 2D CAD Mini-Viewport) a 60 FPS (zero latência de rede);
 *  - Continuidade multi-turno sobre a peça paramétrica ativa;
 *  - Resolução interativa de ambiguidades;
 *  - Ajuste direto de parâmetros extraídos antes do commit com validação instantânea;
 *  - Pré-visualização em tempo real (Ghost Preview) diretamente no canvas do CHAMFER;
 *  - Execução transacional idempotente integrada ao histórico Undo/Redo.
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Sparkles,
  Check,
  X,
  AlertTriangle,
  HelpCircle,
  Code2,
  Sliders,
  RotateCcw,
  ChevronRight,
  Layers,
  CheckCircle2,
  History,
  Send,
  Maximize2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import {
  CadSemanticIntentEngine,
  type SemanticIntentPlan,
} from "@/lib/lab2d/cadSemanticIntent";
import {
  ChamferIntentInterpreter,
  type ChamferIntentPlan,
  type CornerSelector,
  type HoleDistributionMode,
  type ParametricSessionContext,
} from "@/lib/intent";
import type { Entity, LayerId } from "@/lib/lab2d/core";
import type { QuickCommandItem } from "./ChamferQuickCommandModal";
import {
  ChamferLiveMiniViewport,
  evaluateLivePlateValidation,
} from "./ChamferLiveMiniViewport";
import { CaldraLogo } from "@/components/caldra/Logo";

interface ChamferSemanticPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: QuickCommandItem[];
  existingEntities: Entity[];
  selectedEntityIds?: string[];
  activeLayer: LayerId;
  onExecutePlan: (plan: SemanticIntentPlan) => void;
  sessionContext?: ParametricSessionContext;
  onExecuteIntentPlan?: (plan: ChamferIntentPlan) => void;
  onPreviewIntentPlanChange?: (plan: ChamferIntentPlan | null) => void;
}

const QUICK_INITIAL_PROMPTS = [
  "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente",
  "Chapa 500 x 300 com quatro furos Ø12 a 25 mm das bordas",
  "Flange externo 400 interno 200 com PCD 320 e 8 furos de 18 mm",
  "Suporte 280 por 140 mm com rasgo oblongo",
  "Transição quadrado 400 para redondo 250 altura 300",
  "Tronco de cone base 500 topo 250 altura 350",
];

const QUICK_FOLLOWUP_PROMPTS = [
  "Agora aumente esses furos para 16 mm",
  "Adicione mais dois furos com o mesmo espaçamento",
  "Aumente a chapa para 600 mm de largura",
  "Arredonde somente os dois cantos esquerdos com raio 25",
  "Espelhe o conjunto em relação ao eixo vertical",
  "Desfaça a última alteração",
];

export function ChamferSemanticPalette({
  open,
  onClose,
  commands,
  existingEntities,
  selectedEntityIds = [],
  activeLayer,
  onExecutePlan,
  sessionContext,
  onExecuteIntentPlan,
  onPreviewIntentPlanChange,
}: ChamferSemanticPaletteProps) {
  const [query, setQuery] = useState("");
  const [parameterOverrides, setParameterOverrides] = useState<Record<string, unknown>>({});
  const [customPcdInput, setCustomPcdInput] = useState<string>("160");
  const [showDslInspector, setShowDslInspector] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMinimizedToSheet, setIsMinimizedToSheet] = useState(false);
  const [isPeekingCanvas, setIsPeekingCanvas] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasActivePart = Boolean(sessionContext?.activeFeature);

  useEffect(() => {
    if (open) {
      setQuery("");
      setParameterOverrides({});
      setSelectedIndex(0);
      setIsMinimizedToSheet(false);
      setIsPeekingCanvas(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      onPreviewIntentPlanChange?.(null);
    }
  }, [open, onPreviewIntentPlanChange]);

  // Compila o plano paramétrico sempre que o prompt ou overrides mudarem (0ms local)
  const activeIntentPlan = useMemo<ChamferIntentPlan | null>(() => {
    if (!query.trim()) return null;
    return ChamferIntentInterpreter.compilePrompt(query, {
      existingEntities,
      selectedEntityIds,
      activeLayer,
      session: sessionContext,
      parameterOverrides,
    });
  }, [query, existingEntities, selectedEntityIds, activeLayer, sessionContext, parameterOverrides]);

  // Detecta se o plano ativo é uma chapa paramétrica (possui W e H)
  const isPlatePlan = Boolean(
    activeIntentPlan &&
      typeof activeIntentPlan.parameters.width === "number" &&
      typeof activeIntentPlan.parameters.height === "number",
  );

  // Parâmetros numéricos em tempo real acoplados aos inputs editáveis
  const liveWidth = Number(
    parameterOverrides.width ?? activeIntentPlan?.parameters.width ?? 400,
  );
  const liveHeight = Number(
    parameterOverrides.height ?? activeIntentPlan?.parameters.height ?? 250,
  );
  const liveCornerRadius = Number(
    parameterOverrides.corner_radius ?? activeIntentPlan?.parameters.corner_radius ?? 0,
  );
  const liveCornerSelector = (parameterOverrides.corner_selector ??
    activeIntentPlan?.parameters.corner_selector ??
    "all") as CornerSelector;
  const liveHoleCount = Number(
    parameterOverrides.hole_count ?? activeIntentPlan?.parameters.hole_count ?? 0,
  );
  const liveHoleDiameter = Number(
    parameterOverrides.hole_diameter ?? activeIntentPlan?.parameters.hole_diameter ?? 12,
  );
  const liveMargin = Number(
    parameterOverrides.margin ?? activeIntentPlan?.parameters.margin ?? 25,
  );
  const liveHoleDistribution = (parameterOverrides.hole_distribution ??
    activeIntentPlan?.parameters.hole_distribution ??
    "linear_centerline_x") as HoleDistributionMode;
  const livePcd =
    typeof (parameterOverrides.pcd ?? activeIntentPlan?.parameters.pcd) === "number"
      ? Number(parameterOverrides.pcd ?? activeIntentPlan?.parameters.pcd)
      : undefined;

  // Validação geométrica em tempo real (Seção 5 dos requisitos)
  const livePlateValidation = useMemo(() => {
    return evaluateLivePlateValidation({
      width: liveWidth,
      height: liveHeight,
      cornerRadius: liveCornerRadius,
      cornerSelector: liveCornerSelector,
      holeCount: liveHoleCount,
      holeDiameter: liveHoleDiameter,
      margin: liveMargin,
    });
  }, [
    liveWidth,
    liveHeight,
    liveCornerRadius,
    liveCornerSelector,
    liveHoleCount,
    liveHoleDiameter,
    liveMargin,
  ]);

  const hasGeometricError = isPlatePlan
    ? !livePlateValidation.isValid || activeIntentPlan?.validation.status === "invalid"
    : activeIntentPlan?.validation.status === "invalid";

  const canApplyPlan = Boolean(
    activeIntentPlan &&
      !hasGeometricError &&
      (isPlatePlan ? livePlateValidation.isValid : activeIntentPlan.validation.status === "valid"),
  );

  // Sincroniza pré-visualização viva no canvas principal do CHAMFER
  useEffect(() => {
    if (!open) return;
    onPreviewIntentPlanChange?.(activeIntentPlan);
  }, [open, activeIntentPlan, onPreviewIntentPlanChange]);

  // Filtra comandos rápidos tradicionais quando o usuário digita termos curtos de ferramenta
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 6);
    return commands
      .filter((cmd) => {
        if (cmd.title.toLowerCase().includes(q)) return true;
        if (cmd.description.toLowerCase().includes(q)) return true;
        return cmd.keywords.some((k) => k.toLowerCase().includes(q));
      })
      .slice(0, 5);
  }, [query, commands]);

  const handleSelectCommand = (cmd: QuickCommandItem) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    onPreviewIntentPlanChange?.(null);
    onClose();
    cmd.action();
  };

  const handleApplyAmbiguityPatch = (patch: Record<string, unknown>) => {
    triggerHaptic("selection");
    if (typeof patch.preset_prompt === "string") {
      setQuery(patch.preset_prompt);
      setParameterOverrides({});
      return;
    }
    setParameterOverrides((prev) => ({ ...prev, ...patch }));
  };

  const handleParamChange = (key: string, val: number | string) => {
    setParameterOverrides((prev) => {
      const next: Record<string, unknown> = { ...prev, [key]: val };
      // Quando o usuário edita parâmetros da chapa diretamente, garante que a distribuição
      // linear com margem de borda fique sincronizada com a prévia em tempo real.
      if (isPlatePlan && !next.hole_distribution) {
        next.hole_distribution = liveHoleDistribution || "linear_centerline_x";
        next.linear_formula = "margin_plus_equal_pitch";
        next.margin = key === "margin" ? val : liveMargin;
      }
      return next;
    });
  };

  const handleConfirmPlan = () => {
    if (!activeIntentPlan || !canApplyPlan) {
      triggerHaptic("error");
      return;
    }

    // Se for uma chapa válida na prévia mas ainda estava com status needs_clarification,
    // compila a versão final consolidada com os parâmetros da prévia (margem + passo igual).
    let planToCommit = activeIntentPlan;
    if (isPlatePlan && planToCommit.validation.status !== "valid") {
      planToCommit = ChamferIntentInterpreter.compilePrompt(query, {
        existingEntities,
        selectedEntityIds,
        activeLayer,
        session: sessionContext,
        parameterOverrides: {
          width: liveWidth,
          height: liveHeight,
          corner_radius: liveCornerRadius,
          corner_selector: liveCornerSelector,
          hole_count: liveHoleCount,
          hole_diameter: liveHoleDiameter,
          margin: liveMargin,
          hole_distribution:
            liveHoleDistribution === "circular_pcd" ? "circular_pcd" : "linear_centerline_x",
          linear_formula: "margin_plus_equal_pitch",
          ...(livePcd ? { pcd: livePcd } : {}),
          ...parameterOverrides,
        },
      });
    }

    if (planToCommit.validation.status === "invalid") {
      triggerHaptic("error");
      return;
    }

    triggerHaptic("success");
    AudioManager.play("cad_core_init");

    if (onExecuteIntentPlan) {
      // Se ainda restava needs_clarification por PCD mas os parâmetros locais são válidos, força valid para o commit
      const readyPlan: ChamferIntentPlan =
        planToCommit.validation.status === "valid"
          ? planToCommit
          : {
              ...planToCommit,
              unresolved: [],
              validation: {
                ...planToCommit.validation,
                status: "valid",
              },
            };
      onExecuteIntentPlan(readyPlan);
      onPreviewIntentPlanChange?.(null);
      setQuery("");
      setParameterOverrides({});
      onClose();
      return;
    }

    if (planToCommit.compiled) {
      onExecutePlan({
        id: planToCommit.plan_id,
        title: planToCommit.intent.summary,
        intentSummary: planToCommit.response_summary,
        description: planToCommit.response_summary,
        generatedEntities: planToCommit.compiled.previewEntities,
        generatedDimensions: planToCommit.compiled.generatedDimensions,
        targetAction: planToCommit.intent.category === "modify" ? "modify" : "create",
        suggestedViewport: planToCommit.compiled.suggestedViewport,
      });
    } else {
      const legacy = CadSemanticIntentEngine.parseIntent(query, existingEntities, activeLayer);
      if (legacy) onExecutePlan(legacy);
    }
    onPreviewIntentPlanChange?.(null);
    onClose();
  };

  const statusBadge = () => {
    if (!activeIntentPlan) return null;
    if (hasGeometricError) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/50 px-2.5 py-0.5 text-[10px] font-mono font-bold text-[#ef4444] uppercase">
          <AlertTriangle className="w-3 h-3" /> GEOMETRIA INVÁLIDA · REVISE OS PARÂMETROS
        </span>
      );
    }
    if (canApplyPlan) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400 uppercase">
          <CheckCircle2 className="w-3 h-3" /> VALIDADO · PRONTO
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 uppercase">
        <HelpCircle className="w-3 h-3" /> REQUER ESCLARECIMENTO
      </span>
    );
  };

  const effectiveMinimized = isMinimizedToSheet || isPeekingCanvas;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={`max-w-2xl p-0 overflow-hidden bg-slate-950/95 text-slate-100 backdrop-blur-2xl border border-slate-800 shadow-2xl rounded-3xl flex flex-col transition-all duration-200 ${
          effectiveMinimized
            ? "!top-auto !bottom-3 !translate-y-0 max-h-[150px] opacity-95 border-sky-500/50"
            : "max-h-[92vh]"
        }`}
      >
        <DialogTitle className="sr-only">
          CHAMFER Intent — Compilador Geométrico Paramétrico por Linguagem Natural
        </DialogTitle>

        {/* CABEÇALHO TÉCNICO DO COMPILADOR */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <CaldraLogo size={26} className="rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-white">
                  CHAMFER INTENT
                </span>
                <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[9px] text-slate-400">
                  DSL v1.0
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasActivePart && sessionContext?.activeFeature && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 text-[10px] font-mono text-sky-300">
                <Layers className="w-3 h-3 text-sky-400" />
                <span>
                  Peça Ativa: {sessionContext.activeFeature.width}×
                  {sessionContext.activeFeature.height} mm
                </span>
              </div>
            )}

            {effectiveMinimized && (
              <button
                type="button"
                onClick={() => {
                  setIsMinimizedToSheet(false);
                  setIsPeekingCanvas(false);
                }}
                className="flex items-center gap-1 rounded-lg bg-sky-500/20 border border-sky-400/50 px-2.5 py-1 font-mono text-[10px] font-bold text-sky-300 hover:bg-sky-500/30 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Expandir Painel</span>
              </button>
            )}
          </div>
        </div>

        {/* MODO MINI-SHEET COMPACTO QUANDO "VER NO CANVAS PRINCIPAL" ESTÁ ATIVO */}
        {effectiveMinimized && activeIntentPlan ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-950/95">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {statusBadge()}
                <span className="text-xs font-bold text-white truncate">
                  {activeIntentPlan.intent.summary}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Inspecionando pré-visualização diretamente no Canvas Principal do CHAMFER.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsMinimizedToSheet(false);
                  setIsPeekingCanvas(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 cursor-pointer"
              >
                Editar Parâmetros
              </button>
              <button
                type="button"
                disabled={!canApplyPlan}
                onClick={handleConfirmPlan}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                  canApplyPlan
                    ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aplicar</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* CAMPO DE ENTRADA EM LINGUAGEM NATURAL */}
            <div className="flex items-center px-4 py-3 border-b border-slate-800/80 gap-2.5 bg-slate-900/40">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setParameterOverrides({});
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canApplyPlan) {
                    e.preventDefault();
                    handleConfirmPlan();
                  }
                }}
                placeholder={
                  hasActivePart
                    ? "Descreva uma alteração na peça ativa (ex.: 'Aumente esses furos para 16 mm') ou crie outra..."
                    : "Descreva a peça em linguagem natural (ex.: 'Chapa 400x250 mm com raio 20 e 5 furos de 12 mm')..."
                }
                className="w-full bg-transparent text-white placeholder:text-slate-500 outline-none text-xs sm:text-sm font-sans"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setParameterOverrides({});
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Limpar comando"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* CORPO ROLÁVEL */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {/* SUGESTÕES RÁPIDAS QUANDO VAZIO */}
              {!query.trim() && (
                <div className="space-y-3">
                  {hasActivePart && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-sky-400 mb-2">
                        <History className="w-3.5 h-3.5" />
                        <span>Continuidade Multi-Turno (Editar Peça Ativa)</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_FOLLOWUP_PROMPTS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setQuery(p);
                              setParameterOverrides({});
                            }}
                            className="text-left text-[11px] font-mono px-2.5 py-1.5 rounded-xl bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 border border-sky-500/30 transition-colors cursor-pointer"
                          >
                            "{p}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                      Exemplos de Compilação Geométrica Paramétrica
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {QUICK_INITIAL_PROMPTS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setQuery(p);
                            setParameterOverrides({});
                          }}
                          className="flex items-start gap-2 text-left text-[11px] p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 text-slate-200 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{p}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* CARD PLANO COMPILADO */}
              {activeIntentPlan && (
                <div className="space-y-3 rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5">
                  {/* 1. CABEÇALHO DO PLANO + BADGE DE STATUS */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        Plano Compilado · Turno #{activeIntentPlan.intent.turn_index}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">
                        {isPlatePlan
                          ? `Chapa ${liveWidth} × ${liveHeight} mm${
                              liveCornerRadius > 0 && liveCornerSelector !== "none"
                                ? ` · R${liveCornerRadius} mm`
                                : ""
                            }${
                              liveHoleCount > 0
                                ? ` · ${liveHoleCount} Furos Ø${liveHoleDiameter} mm`
                                : ""
                            }`
                          : activeIntentPlan.intent.summary}
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">
                        {hasGeometricError && isPlatePlan
                          ? livePlateValidation.errorMessages[0] ?? activeIntentPlan.response_summary
                          : activeIntentPlan.response_summary}
                      </p>
                    </div>
                    {statusBadge()}
                  </div>

                  {/* 2. JANELA DE PRÉVIA EM TEMPO REAL (LIVE 2D CAD MINI-VIEWPORT) */}
                  {/* Posicionada logo abaixo do badge VALIDADO · PRONTO e acima de PARÂMETROS EXTRAÍDOS */}
                  <ChamferLiveMiniViewport
                    width={liveWidth}
                    height={liveHeight}
                    cornerRadius={liveCornerRadius}
                    cornerSelector={liveCornerSelector}
                    holeCount={liveHoleCount}
                    holeDiameter={liveHoleDiameter}
                    margin={liveMargin}
                    holeDistribution={liveHoleDistribution}
                    pcd={livePcd}
                    isPlateMode={isPlatePlan}
                    fallbackEntities={activeIntentPlan.compiled?.previewEntities ?? []}
                    isMinimizedToSheet={isMinimizedToSheet}
                    onToggleMinimizeToSheet={() => setIsMinimizedToSheet((v) => !v)}
                    onPeekCanvasStart={() => setIsPeekingCanvas(true)}
                    onPeekCanvasEnd={() => setIsPeekingCanvas(false)}
                  />

                  {/* 3. PARÂMETROS EXTRAÍDOS (EDITÁVEIS ANTES DE APLICAR) */}
                  {(isPlatePlan || Object.keys(activeIntentPlan.parameters).length > 0) && (
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          <Sliders className="w-3 h-3 text-red-400" /> Parâmetros Extraídos (Editáveis antes de Aplicar)
                        </span>
                        {Object.keys(parameterOverrides).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setParameterOverrides({})}
                            className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-white cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Restaurar original
                          </button>
                        )}
                      </div>

                      {isPlatePlan ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <label className="block">
                            <span className="text-[10px] font-mono text-slate-400">
                              Largura W (mm)
                            </span>
                            <input
                              type="number"
                              min={10}
                              value={liveWidth}
                              onChange={(e) => handleParamChange("width", Number(e.target.value))}
                              className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-400 px-2 py-1 font-mono text-xs text-white outline-none"
                            />
                          </label>

                          <label className="block">
                            <span className="text-[10px] font-mono text-slate-400">
                              Altura H (mm)
                            </span>
                            <input
                              type="number"
                              min={10}
                              value={liveHeight}
                              onChange={(e) => handleParamChange("height", Number(e.target.value))}
                              className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-400 px-2 py-1 font-mono text-xs text-white outline-none"
                            />
                          </label>

                          <label className="block">
                            <span
                              className={`text-[10px] font-mono ${
                                livePlateValidation.isRadiusError
                                  ? "text-red-400 font-bold"
                                  : "text-slate-400"
                              }`}
                            >
                              Raio Canto R (mm)
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={liveCornerRadius}
                              onChange={(e) =>
                                handleParamChange("corner_radius", Number(e.target.value))
                              }
                              className={`mt-0.5 w-full rounded-lg bg-slate-900 border px-2 py-1 font-mono text-xs text-white outline-none ${
                                livePlateValidation.isRadiusError
                                  ? "border-red-500 text-red-300"
                                  : "border-slate-700 focus:border-sky-400"
                              }`}
                            />
                          </label>

                          <label className="block">
                            <span className="text-[10px] font-mono text-slate-400">
                              Cantos Alvo
                            </span>
                            <select
                              value={liveCornerSelector}
                              onChange={(e) =>
                                handleParamChange(
                                  "corner_selector",
                                  e.target.value as CornerSelector,
                                )
                              }
                              className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-400 px-2 py-1 font-mono text-xs text-white outline-none"
                            >
                              <option value="all">Todos os 4 cantos</option>
                              <option value="top_two">Apenas Superiores</option>
                              <option value="bottom_two">Apenas Inferiores</option>
                              <option value="left_two">Apenas Esquerda</option>
                              <option value="right_two">Apenas Direita</option>
                              <option value="none">Canto Reto (R=0)</option>
                            </select>
                          </label>

                          <label className="block">
                            <span className="text-[10px] font-mono text-slate-400">
                              Qtd. Furos (N)
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={liveHoleCount}
                              onChange={(e) =>
                                handleParamChange("hole_count", Number(e.target.value))
                              }
                              className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-400 px-2 py-1 font-mono text-xs text-white outline-none"
                            />
                          </label>

                          <label className="block">
                            <span
                              className={`text-[10px] font-mono ${
                                livePlateValidation.isPitchCollision
                                  ? "text-red-400 font-bold"
                                  : "text-slate-400"
                              }`}
                            >
                              Diâmetro Ø (mm)
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={liveHoleDiameter}
                              onChange={(e) =>
                                handleParamChange("hole_diameter", Number(e.target.value))
                              }
                              className={`mt-0.5 w-full rounded-lg bg-slate-900 border px-2 py-1 font-mono text-xs text-white outline-none ${
                                livePlateValidation.isPitchCollision
                                  ? "border-red-500 text-red-300"
                                  : "border-slate-700 focus:border-sky-400"
                              }`}
                            />
                          </label>

                          <label className="block">
                            <span
                              className={`text-[10px] font-mono ${
                                livePlateValidation.isMarginError
                                  ? "text-red-400 font-bold"
                                  : "text-slate-400"
                              }`}
                            >
                              Margem Borda (mm)
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={liveMargin}
                              onChange={(e) => handleParamChange("margin", Number(e.target.value))}
                              className={`mt-0.5 w-full rounded-lg bg-slate-900 border px-2 py-1 font-mono text-xs text-white outline-none ${
                                livePlateValidation.isMarginError
                                  ? "border-red-500 text-red-300"
                                  : "border-slate-700 focus:border-sky-400"
                              }`}
                            />
                          </label>

                          {liveHoleDistribution === "circular_pcd" && (
                            <label className="block">
                              <span className="text-[10px] font-mono text-slate-400">
                                PCD Ø (mm)
                              </span>
                              <input
                                type="number"
                                min={5}
                                value={livePcd ?? 160}
                                onChange={(e) => handleParamChange("pcd", Number(e.target.value))}
                                className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-400 px-2 py-1 font-mono text-xs text-white outline-none"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {Object.entries(activeIntentPlan.parameters).map(([k, v]) => {
                            if (typeof v !== "number") return null;
                            return (
                              <label key={k} className="block">
                                <span className="text-[10px] font-mono text-slate-400">{k}</span>
                                <input
                                  type="number"
                                  value={Number(v)}
                                  onChange={(e) => handleParamChange(k, Number(e.target.value))}
                                  className="mt-0.5 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-xs text-white"
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SEÇÃO DE DESAMBIGUAÇÃO INTERATIVA (SEÇÃO 8) */}
                  {activeIntentPlan.unresolved.length > 0 && (
                    <div className="space-y-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 p-3">
                      {activeIntentPlan.unresolved.map((amb) => (
                        <div key={amb.id} className="space-y-2">
                          <div className="flex items-start gap-2">
                            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-200">{amb.question}</p>
                              <p className="text-[11px] text-amber-300/80 mt-0.5">{amb.reason}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {amb.options.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleApplyAmbiguityPatch(opt.patch)}
                                className="flex flex-col text-left p-2.5 rounded-xl bg-slate-900/90 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 transition-all cursor-pointer"
                              >
                                <span className="text-xs font-bold text-white">{opt.label}</span>
                                <span className="text-[10px] text-slate-300 mt-0.5">
                                  {opt.description}
                                </span>
                              </button>
                            ))}
                          </div>

                          {amb.requiresNumericInput && (
                            <div className="flex items-center gap-2 pt-1.5 border-t border-amber-500/20">
                              <span className="text-[11px] font-mono text-amber-200">
                                {amb.requiresNumericInput.label}:
                              </span>
                              <input
                                type="number"
                                value={customPcdInput}
                                onChange={(e) => setCustomPcdInput(e.target.value)}
                                className="w-24 rounded-lg bg-slate-950 border border-amber-500/40 px-2.5 py-1 text-xs font-mono text-white outline-none focus:border-amber-400"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = parseFloat(customPcdInput);
                                  if (Number.isFinite(val) && val > 0) {
                                    handleApplyAmbiguityPatch({
                                      hole_distribution: "circular_pcd",
                                      [amb.requiresNumericInput!.paramKey]: val,
                                    });
                                  }
                                }}
                                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold transition-colors cursor-pointer"
                              >
                                Definir {amb.requiresNumericInput.unit}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ERROS OU AVISOS DE VALIDAÇÃO GEOMÉTRICA (SEÇÃO 2.5) */}
                  {(hasGeometricError || activeIntentPlan.validation.issues.length > 0) && (
                    <div className="space-y-1.5">
                      {isPlatePlan &&
                        livePlateValidation.errorMessages.map((msg, idx) => (
                          <div
                            key={`live-err-${idx}`}
                            className="flex items-start gap-2 rounded-xl p-2.5 text-xs border bg-red-950/40 border-red-500/50 text-red-200"
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#ef4444]" />
                            <div className="flex-1">
                              <span className="font-mono font-bold text-[10px] uppercase mr-1.5 text-[#ef4444]">
                                [ERRO GEOMÉTRICO]
                              </span>
                              <span>{msg}</span>
                            </div>
                          </div>
                        ))}
                      {!isPlatePlan &&
                        activeIntentPlan.validation.issues.map((iss, idx) => (
                          <div
                            key={`${iss.code}-${idx}`}
                            className={`flex items-start gap-2 rounded-xl p-2.5 text-xs border ${
                              iss.severity === "error"
                                ? "bg-red-950/40 border-red-500/40 text-red-200"
                                : "bg-amber-950/30 border-amber-500/30 text-amber-200"
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                            <div className="flex-1">
                              <span className="font-mono font-bold text-[10px] uppercase mr-1.5">
                                [{iss.code}]
                              </span>
                              <span>{iss.message}</span>
                              {iss.mathematicalConstraint && (
                                <span className="block font-mono text-[10px] opacity-75 mt-0.5">
                                  Restrição: {iss.mathematicalConstraint}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* MÉTRICAS E INSPETOR DA REPRESENTAÇÃO INTERMEDIÁRIA (DSL JSON) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-3">
                      <span>
                        Entidades:{" "}
                        <strong className="text-white">
                          {activeIntentPlan.compiled?.previewEntities.length ?? 0}
                        </strong>
                      </span>
                      <span>
                        Cotas:{" "}
                        <strong className="text-white">
                          {activeIntentPlan.compiled?.generatedDimensions.length ?? 0}
                        </strong>
                      </span>
                      <span>
                        Operações:{" "}
                        <strong className="text-white">{activeIntentPlan.operations.length}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowDslInspector((v) => !v)}
                      className="flex items-center gap-1 text-[10px] font-mono text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>
                        {showDslInspector ? "Ocultar DSL JSON" : "Inspecionar DSL Canônica"}
                      </span>
                    </button>
                  </div>

                  {showDslInspector && (
                    <pre className="max-h-44 overflow-auto rounded-xl bg-slate-950 p-2.5 text-[10px] font-mono text-emerald-300 border border-slate-800">
                      {JSON.stringify(
                        {
                          plan_id: activeIntentPlan.plan_id,
                          schema_version: activeIntentPlan.schema_version,
                          document_context: activeIntentPlan.document_context,
                          intent: activeIntentPlan.intent,
                          operations: activeIntentPlan.operations,
                          parameters: activeIntentPlan.parameters,
                          parameter_provenance: activeIntentPlan.parameter_provenance,
                          unresolved: activeIntentPlan.unresolved.map((u) => ({
                            id: u.id,
                            parameter: u.parameter,
                            question: u.question,
                          })),
                          validation: activeIntentPlan.validation,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  )}

                  {/* BOTÕES DE AÇÃO TRANSAÇÃO */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setParameterOverrides({});
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!canApplyPlan}
                      onClick={handleConfirmPlan}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        canApplyPlan
                          ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 active:scale-95 cursor-pointer"
                          : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {activeIntentPlan.intent.category === "modify"
                          ? "Confirmar Alteração Paramétrica"
                          : activeIntentPlan.intent.category === "undo"
                            ? "Confirmar Desfazer"
                            : "Confirmar e Inserir no CHAMFER"}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* ATALHOS DE FERRAMENTAS TRADICIONAIS QUANDO RELEVANTE */}
              {filteredCommands.length > 0 && !activeIntentPlan && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-1">
                    Ferramentas Diretas do CHAMFER CAD
                  </p>
                  <div className="divide-y divide-slate-800/40">
                    {filteredCommands.map((cmd, idx) => {
                      const Icon = cmd.icon;
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          onClick={() => handleSelectCommand(cmd)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                            isSelected
                              ? "bg-slate-800/90 text-white"
                              : "hover:bg-slate-900 text-slate-300"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 text-slate-300">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold truncate">{cmd.title}</span>
                              {cmd.shortcut && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 rounded border border-slate-700 text-slate-400">
                                  {cmd.shortcut}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">{cmd.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RODAPÉ TÉCNICO */}
            <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>CHAMFER INTENT · COMPILADOR GEOMÉTRICO DETERMINÍSTICO</span>
              <span className="flex items-center gap-1">
                <Send className="w-3 h-3 text-red-400" /> Prévia 60 FPS em tempo real · ENTER para
                aplicar
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
