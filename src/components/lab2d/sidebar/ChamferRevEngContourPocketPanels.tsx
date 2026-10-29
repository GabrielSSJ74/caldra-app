import React, { useMemo, useState } from "react";
import {
  Check,
  CircleDot,
  Cog,
  Compass,
  FlipHorizontal,
  Layers,
  Ruler,
  Sparkles,
  Wand2,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Entity, LayerId, Vec2 } from "@/lib/lab2d/core";
import type {
  FittedPrimitiveCandidate,
  RevEngCategoryId,
  RevEngPlanData,
} from "@/lib/lab2d/revEngTypes";
import {
  analyzeDesignIntentSuggestions,
  applyDesignIntentSuggestion,
  computeConstantWallPocket,
  detectHolePatternsPCD,
  estimateGearModuleFromMeasurement,
  evaluateVirtualRadiusGauge,
  generateLinearRackProfile,
  generateSpurGearProfile,
  ISO_54_STANDARD_MODULES,
  mirrorEntitiesAcrossAxis,
  regularizeBoltCirclePCD,
  rejectDesignIntentSuggestion,
  STANDARD_RADIUS_GAUGE_SERIES_MM,
  type AutoPocketIslandHole,
  type DesignIntentSuggestion,
} from "@/lib/lab2d/revEngContourDetails";

interface KeypadOpenFn {
  (
    e: React.MouseEvent,
    label: string,
    currentValue: number,
    unit: "mm" | "°" | "dpi" | "",
    onConfirm: (val: number) => void,
    allowNegative?: boolean,
  ): void;
}

export interface ChamferRevEngCategory3ExtrasProps {
  revEng: RevEngPlanData;
  onChangeRevEng: (next: RevEngPlanData) => void;
  entities: Entity[];
  selection: string[];
  setSelection: (ids: string[]) => void;
  commit: (nextEntities: Entity[], label?: string) => void;
  activeLayer: LayerId;
  onSetFittedPreviewCandidate: (cand: FittedPrimitiveCandidate | null) => void;
  openKeypad: KeypadOpenFn;
  isDark: boolean;
}

/**
 * Extras da Categoria 3 (Contorno e Detalhes):
 *  - Sugestor de Intenção de Projeto (Seção 12) com aceite/rejeição explícitos
 *  - Gabarito de Raio Virtual / Pente de Raios Digital R1..R150 (Seção 11.3)
 *  - Detector de Padrões: Círculo de Furação PCD + Simetria Axial (Seção 11.6 / T13)
 */
export const ChamferRevEngCategory3Extras: React.FC<ChamferRevEngCategory3ExtrasProps> = ({
  revEng,
  entities,
  selection,
  commit,
  activeLayer,
  onSetFittedPreviewCandidate,
  openKeypad,
  isDark,
}) => {
  // Estado do Gabarito de Raio Virtual (Seção 11.3)
  const [gaugeRadiusMm, setGaugeRadiusMm] = useState<number>(10);
  const [gaugeMode, setGaugeMode] = useState<"concavo" | "convexo">("concavo");

  // Estado de Simetria Axial
  const [mirrorAxisMode, setMirrorAxisMode] = useState<"vertical_x" | "horizontal_y">("vertical_x");
  const [mirrorAxisPosMm, setMirrorAxisPosMm] = useState<number>(0);

  // Estado de PCD Nominal editável
  const [customNominalPcdMm, setCustomNominalPcdMm] = useState<number | null>(null);

  // 1. Sugestões de Intenção de Projeto (Seção 12)
  const suggestions = useMemo(() => {
    return analyzeDesignIntentSuggestions(entities);
  }, [entities]);

  const handleAcceptSuggestion = (sug: DesignIntentSuggestion) => {
    const next = applyDesignIntentSuggestion(entities, sug);
    commit(next, `Aceitar Nominal (${sug.title})`);
  };

  const handleRejectSuggestion = (sug: DesignIntentSuggestion) => {
    const next = rejectDesignIntentSuggestion(entities, sug);
    commit(next, `Manter Medido (${sug.entityId})`);
  };

  // 2. Gabarito de Raio Virtual (Seção 11.3)
  const selectedLines = useMemo(() => {
    const lines = entities.filter(
      (e): e is Extract<Entity, { type: "line" }> =>
        e.type === "line" && (selection.includes(e.id) || selection.length === 0),
    );
    return lines.length >= 2 ? ([lines[0], lines[1]] as [typeof lines[0], typeof lines[1]]) : undefined;
  }, [entities, selection]);

  const gaugeEval = useMemo(() => {
    const pts = revEng.capturedPoints.map((p) => ({ x: p.x, y: p.y }));
    return evaluateVirtualRadiusGauge({
      radiusMm: gaugeRadiusMm,
      mode: gaugeMode,
      points: pts.length >= 3 ? pts : undefined,
      cornerLines: pts.length < 3 ? selectedLines : undefined,
      targetLayer: activeLayer || "corte",
    });
  }, [gaugeRadiusMm, gaugeMode, revEng.capturedPoints, selectedLines, activeLayer]);

  const handlePreviewRadiusGauge = (rVal: number, modeVal: "concavo" | "convexo") => {
    setGaugeRadiusMm(rVal);
    setGaugeMode(modeVal);
    const pts = revEng.capturedPoints.map((p) => ({ x: p.x, y: p.y }));
    const res = evaluateVirtualRadiusGauge({
      radiusMm: rVal,
      mode: modeVal,
      points: pts.length >= 3 ? pts : undefined,
      cornerLines: pts.length < 3 ? selectedLines : undefined,
      targetLayer: activeLayer || "corte",
    });
    onSetFittedPreviewCandidate({
      id: res.entityPreview.id,
      kind: "arc",
      pointsUsed: pts.length || 2,
      rmsMm: res.rmsErrorMm,
      maxDeviationMm: res.maxDeviationMm,
      entityPreview: res.entityPreview,
      summaryLabel: res.summaryLabel,
      infoStatus: "MEDIDO",
    });
  };

  const handleCommitRadiusGauge = () => {
    commit([...entities, gaugeEval.entityPreview], `Inserir Gabarito R${gaugeEval.radiusMm}`);
    onSetFittedPreviewCandidate(null);
  };

  // 3. Detector de Padrão PCD Circular (Seção 11.6 / Teste T13)
  const candidateCircles = useMemo(() => {
    const selectedCircles = entities.filter(
      (e): e is Extract<Entity, { type: "circle" }> =>
        e.type === "circle" && !e.isConstruction && selection.includes(e.id),
    );
    if (selectedCircles.length >= 3) return selectedCircles;
    return entities.filter(
      (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle" && !e.isConstruction,
    );
  }, [entities, selection]);

  const pcdAnalysis = useMemo(() => {
    if (candidateCircles.length < 3) return null;
    return detectHolePatternsPCD(
      candidateCircles.map((c) => ({ id: c.id, x: c.cx, y: c.cy, r: c.r })),
    );
  }, [candidateCircles]);

  const effectiveNominalPcd =
    customNominalPcdMm ?? pcdAnalysis?.suggestedNominalPcdMm ?? 100;

  const handleRegularizePcd = () => {
    if (!pcdAnalysis) return;
    const next = regularizeBoltCirclePCD({
      entities,
      holeIds: candidateCircles.map((c) => c.id),
      center: pcdAnalysis.center,
      nominalPcdMm: effectiveNominalPcd,
    });
    commit(next, `Regularizar PCD Ø${effectiveNominalPcd.toFixed(1)} mm`);
  };

  const handleMirrorSelected = () => {
    const targets =
      selection.length > 0
        ? entities.filter((e) => selection.includes(e.id))
        : entities.filter((e) => !e.isConstruction);
    if (targets.length === 0) return;
    const mirrored = mirrorEntitiesAcrossAxis({
      entities: targets,
      axisMode: mirrorAxisMode,
      axisPositionMm: mirrorAxisPosMm,
    });
    commit([...entities, ...mirrored], "Espelhar por Simetria Axial");
  };

  const quickRadii = [2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 50, 80];

  return (
    <div className="mt-2 flex flex-col gap-2.5 border-t border-[#293444]/80 pt-2.5">
      {/* ================================================================= */}
      {/* BLOCO 12: SUGESTOR DE INTENÇÃO DE PROJETO (NUNCA ALTERA SOZINHO)  */}
      {/* ================================================================= */}
      <div
        className={cn(
          "rounded-xl border p-2 flex flex-col gap-1.5",
          isDark
            ? "border-purple-500/40 bg-purple-950/20"
            : "border-purple-300 bg-purple-50/60",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wand2 className="size-3.5 text-purple-400" />
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-purple-300">
              Intenção de Projeto ({suggestions.length})
            </span>
          </div>
          <span className="rounded bg-purple-500/20 border border-purple-500/40 px-1.5 py-0.5 text-[8px] font-bold text-purple-200">
            HIPÓTESE
          </span>
        </div>

        {suggestions.length === 0 ? (
          <div className="text-[8.5px] text-[#94A3B8]">
            Nenhuma divergência nominal pendente nas entidades atuais (raios, diâmetros ou ângulos já nominais ou confirmados).
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-0.5">
            {suggestions.map((sug) => (
              <div
                key={sug.id}
                className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-1.5 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9.5px] font-bold text-[#E6EDF5]">{sug.title}</span>
                  <span className="text-[8px] font-mono text-amber-300">
                    Med: {sug.measuredValue.toFixed(2)} {sug.unit}
                  </span>
                </div>
                <p className="text-[8.5px] text-[#94A3B8] leading-tight">{sug.description}</p>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => handleRejectSuggestion(sug)}
                    className="flex items-center gap-1 rounded border border-[#293444] bg-[#151C27] px-2 py-0.5 text-[8.5px] font-semibold text-[#94A3B8] hover:text-white cursor-pointer"
                  >
                    <X className="size-2.5" />
                    <span>Manter Medido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAcceptSuggestion(sug)}
                    className="flex items-center gap-1 rounded bg-teal-600 hover:bg-teal-500 px-2 py-0.5 text-[8.5px] font-bold text-white cursor-pointer"
                  >
                    <Check className="size-2.5" />
                    <span>Aceitar Nominal</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* BLOCO 11.3: GABARITO DE RAIO VIRTUAL (PENTE DE RAIOS R1..R150)    */}
      {/* ================================================================= */}
      <div
        className={cn(
          "rounded-xl border p-2 flex flex-col gap-1.5",
          isDark ? "border-[#293444] bg-[#0D121B]/70" : "border-[#CBD5E1] bg-[#F8FAFC]",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Compass className="size-3.5 text-[#38BDF8]" />
            <span className="text-[9.5px] font-bold uppercase tracking-wider">
              Pente de Raios Virtual (R1..R150)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handlePreviewRadiusGauge(gaugeRadiusMm, "concavo")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer border",
                gaugeMode === "concavo"
                  ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                  : "border-[#293444] text-[#94A3B8]",
              )}
            >
              Côncavo
            </button>
            <button
              type="button"
              onClick={() => handlePreviewRadiusGauge(gaugeRadiusMm, "convexo")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer border",
                gaugeMode === "convexo"
                  ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                  : "border-[#293444] text-[#94A3B8]",
              )}
            >
              Convexo
            </button>
          </div>
        </div>

        {/* Série rápida de raios de oficina */}
        <div className="flex flex-wrap gap-1">
          {quickRadii.map((rVal) => (
            <button
              key={rVal}
              type="button"
              onClick={() => handlePreviewRadiusGauge(rVal, gaugeMode)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[8.5px] font-mono font-bold cursor-pointer",
                Math.abs(gaugeRadiusMm - rVal) < 1e-3
                  ? "border-[#E11D48] bg-[#E11D48]/20 text-white"
                  : "border-[#293444] bg-[#151C27] text-[#94A3B8] hover:text-white",
              )}
            >
              R{rVal}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-1.5 mt-0.5">
          <button
            type="button"
            onClick={(e) =>
              openKeypad(e, "Raio do Gabarito (R)", gaugeRadiusMm, "mm", (val) => {
                if (val > 0) handlePreviewRadiusGauge(val, gaugeMode);
              })
            }
            className="flex items-center gap-1 rounded-lg border border-[#38BDF8]/50 bg-[#151C27] px-2 py-1 text-[9px] font-mono font-bold text-[#38BDF8] cursor-pointer"
          >
            <Ruler className="size-3" />
            <span>R = {gaugeRadiusMm.toFixed(2)} mm</span>
          </button>

          <select
            value={gaugeRadiusMm}
            onChange={(e) => handlePreviewRadiusGauge(Number(e.target.value), gaugeMode)}
            className="rounded-lg border border-[#293444] bg-[#151C27] px-1.5 py-1 text-[8.5px] text-[#E6EDF5]"
          >
            {STANDARD_RADIUS_GAUGE_SERIES_MM.map((rStd) => (
              <option key={rStd} value={rStd}>
                Pente R{rStd} mm
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCommitRadiusGauge}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2 py-1 text-[9px] font-bold text-white cursor-pointer"
          >
            <Check className="size-3" />
            <span>Inserir R{gaugeRadiusMm}</span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* BLOCO 11.6: DETECTOR DE PADRÃO PCD CIRCULAR E SIMETRIA (T13)      */}
      {/* ================================================================= */}
      <div
        className={cn(
          "rounded-xl border p-2 flex flex-col gap-1.5",
          isDark ? "border-[#293444] bg-[#0D121B]/70" : "border-[#CBD5E1] bg-[#F8FAFC]",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CircleDot className="size-3.5 text-emerald-400" />
            <span className="text-[9.5px] font-bold uppercase tracking-wider">
              Detector de Padrões (PCD / Simetria)
            </span>
          </div>
          <span className="text-[8px] font-mono text-[#94A3B8]">
            {candidateCircles.length} furos
          </span>
        </div>

        {pcdAnalysis ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-1.5 text-[9px]">
            <div className="font-bold text-emerald-300">{pcdAnalysis.summaryText}</div>
            <div className="grid grid-cols-3 gap-1 text-center bg-[#0D121B]/80 rounded p-1">
              <div>
                <div className="text-[7.5px] text-[#94A3B8]">PCD Medido</div>
                <div className="font-mono font-bold text-[#38BDF8]">
                  Ø{pcdAnalysis.measuredPcdMm.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[7.5px] text-[#94A3B8]">Passo Angular</div>
                <div className="font-mono font-bold text-white">
                  {pcdAnalysis.nominalAngularStepDeg.toFixed(1)}°
                </div>
              </div>
              <div>
                <div className="text-[7.5px] text-[#94A3B8]">Erro Radial RMS</div>
                <div className="font-mono font-bold text-amber-300">
                  {pcdAnalysis.radialRmsMm.toFixed(3)} mm
                </div>
              </div>
            </div>

            {pcdAnalysis.missingHoleAnglesDeg.length > 0 && (
              <div className="text-[8px] text-amber-300 flex items-center gap-1">
                <AlertTriangle className="size-3 shrink-0" />
                <span>
                  Possível furo omitido no padrão {pcdAnalysis.estimatedFullCount}× em{" "}
                  {pcdAnalysis.missingHoleAnglesDeg.map((a) => `${a.toFixed(0)}°`).join(", ")}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={(e) =>
                  openKeypad(
                    e,
                    "PCD Nominal Desejado",
                    effectiveNominalPcd,
                    "mm",
                    (val) => {
                      if (val > 0) setCustomNominalPcdMm(val);
                    },
                  )
                }
                className="rounded border border-[#38BDF8]/50 bg-[#151C27] px-2 py-1 text-[8.5px] font-mono font-bold text-[#38BDF8] cursor-pointer"
              >
                PCD Nom: Ø{effectiveNominalPcd.toFixed(1)} mm
              </button>

              <button
                type="button"
                onClick={handleRegularizePcd}
                className="flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-500 px-2.5 py-1 text-[8.5px] font-bold text-white cursor-pointer"
              >
                <Check className="size-3" />
                <span>Regularizar PCD Nominal</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[8.5px] text-[#94A3B8]">
            Insira ou selecione 3 ou mais furos para detectar automaticamente o Círculo de Furação (PCD) e o passo angular.
          </div>
        )}

        {/* Espelhamento por Simetria Axial */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#293444]/60">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setMirrorAxisMode((m) => (m === "vertical_x" ? "horizontal_y" : "vertical_x"))
              }
              className="rounded border border-[#293444] bg-[#151C27] px-1.5 py-0.5 text-[8px] font-bold text-[#E6EDF5] cursor-pointer"
            >
              {mirrorAxisMode === "vertical_x" ? "Eixo X =" : "Eixo Y ="}
            </button>
            <button
              type="button"
              onClick={(e) =>
                openKeypad(
                  e,
                  mirrorAxisMode === "vertical_x" ? "Posição Eixo X" : "Posição Eixo Y",
                  mirrorAxisPosMm,
                  "mm",
                  (val) => setMirrorAxisPosMm(val),
                  true,
                )
              }
              className="rounded border border-[#38BDF8]/40 bg-[#151C27] px-1.5 py-0.5 text-[8.5px] font-mono text-[#38BDF8] cursor-pointer"
            >
              {mirrorAxisPosMm.toFixed(1)} mm
            </button>
          </div>
          <button
            type="button"
            onClick={handleMirrorSelected}
            className="flex items-center gap-1 rounded border border-[#293444] bg-[#151C27] hover:border-[#38BDF8] px-2 py-0.5 text-[8.5px] font-bold text-[#E6EDF5] cursor-pointer"
          >
            <FlipHorizontal className="size-3 text-[#38BDF8]" />
            <span>Espelhar Simetria</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CATEGORIAS 6 (AUTO-POCKET 2D) E 7 (DENTES, CREMALHEIRA E ENGRENAGEM ISO 54)
// ============================================================================

export interface ChamferRevEngContourPocketPanelsProps {
  revEng: RevEngPlanData;
  onChangeRevEng: (next: RevEngPlanData) => void;
  entities: Entity[];
  selection: string[];
  setSelection: (ids: string[]) => void;
  commit: (nextEntities: Entity[], label?: string) => void;
  activeLayer: LayerId;
  onSetFittedPreviewCandidate: (cand: FittedPrimitiveCandidate | null) => void;
  openKeypad: KeypadOpenFn;
  onToggleCategory: (catId: RevEngCategoryId) => void;
  isDark: boolean;
}

export const ChamferRevEngContourPocketPanels: React.FC<
  ChamferRevEngContourPocketPanelsProps
> = ({
  revEng,
  entities,
  commit,
  onSetFittedPreviewCandidate,
  openKeypad,
  onToggleCategory,
  isDark,
}) => {
  // --------------------------------------------------------------------------
  // ESTADO DA CATEGORIA 6: AUTO-POCKET 2D DE PAREDE CONSTANTE (SEÇÃO 9 / T10)
  // --------------------------------------------------------------------------
  const [pocketSourceMode, setPocketSourceMode] = useState<"canvas_auto" | "parametric_oblong">(
    "canvas_auto",
  );
  const [oblongSpanMm, setOblongSpanMm] = useState<number>(120);
  const [oblongOuterR1Mm, setOblongOuterR1Mm] = useState<number>(30);
  const [oblongOuterR2Mm, setOblongOuterR2Mm] = useState<number>(25);
  const [oblongHoleD1Mm, setOblongHoleD1Mm] = useState<number>(24);
  const [oblongHoleD2Mm, setOblongHoleD2Mm] = useState<number>(20);

  const [borderWallTbMm, setBorderWallTbMm] = useState<number>(6.0);
  const [islandCollarTiMm, setIslandCollarTiMm] = useState<number>(6.0);
  const [cornerRadiusRcMm, setCornerRadiusRcMm] = useState<number>(4.0);

  // Construir polígono externo e furos internos a partir do canvas ou do oblongo paramétrico
  const autoPocketGeometry = useMemo(() => {
    const closedPolys = entities.filter(
      (e): e is Extract<Entity, { type: "polyline" }> =>
        e.type === "polyline" && e.closed && !e.isConstruction,
    );
    const circles = entities.filter(
      (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle" && !e.isConstruction,
    );

    if (pocketSourceMode === "canvas_auto" && closedPolys.length > 0) {
      // Escolher polilinha fechada de maior caixa delimitadora como contorno externo
      const outerPoly = closedPolys[0].pts;
      const islands: AutoPocketIslandHole[] = circles.map((c) => ({
        id: c.id,
        cx: c.cx,
        cy: c.cy,
        r: c.r,
      }));
      return { outerPolygon: outerPoly, islands, sourceLabel: "Contorno Fechado do Canvas" };
    }

    // Construir contorno oblongo tangente (2 olhais + 2 pontes) para bancada mecânica (Teste T10)
    const L = Math.max(20, oblongSpanMm);
    const R1 = Math.max(8, oblongOuterR1Mm);
    const R2 = Math.max(8, oblongOuterR2Mm);
    const rHole1 = Math.max(2, oblongHoleD1Mm / 2);
    const rHole2 = Math.max(2, oblongHoleD2Mm / 2);

    const sinGamma = Math.max(-0.95, Math.min(0.95, (R1 - R2) / L));
    const gamma = Math.asin(sinGamma);
    const startAng1 = Math.PI / 2 - gamma;
    const endAng1 = (3 * Math.PI) / 2 + gamma;
    const startAng2 = -Math.PI / 2 + gamma;
    const endAng2 = Math.PI / 2 - gamma;

    const outerPts: Vec2[] = [];
    const stepsArc = 24;
    for (let i = 0; i <= stepsArc; i++) {
      const a = startAng1 + ((endAng1 - startAng1) * i) / stepsArc;
      outerPts.push({ x: R1 * Math.cos(a), y: R1 * Math.sin(a) });
    }
    for (let i = 0; i <= stepsArc; i++) {
      const a = startAng2 + ((endAng2 - startAng2) * i) / stepsArc;
      outerPts.push({ x: L + R2 * Math.cos(a), y: R2 * Math.sin(a) });
    }

    const islands: AutoPocketIslandHole[] = [
      { id: "hole-left", cx: 0, cy: 0, r: rHole1 },
      { id: "hole-right", cx: L, cy: 0, r: rHole2 },
    ];

    return {
      outerPolygon: outerPts,
      islands,
      sourceLabel: `Braço Oblongo L=${L}mm (R${R1}/R${R2})`,
    };
  }, [
    entities,
    pocketSourceMode,
    oblongSpanMm,
    oblongOuterR1Mm,
    oblongOuterR2Mm,
    oblongHoleD1Mm,
    oblongHoleD2Mm,
  ]);

  const pocketResult = useMemo(() => {
    return computeConstantWallPocket({
      outerPolygon: autoPocketGeometry.outerPolygon,
      borderWallThicknessMm: borderWallTbMm,
      islandCollarThicknessMm: islandCollarTiMm,
      cornerRadiusMm: cornerRadiusRcMm,
      islands: autoPocketGeometry.islands,
      targetLayer: "recorte",
    });
  }, [autoPocketGeometry, borderWallTbMm, islandCollarTiMm, cornerRadiusRcMm]);

  const handlePreviewPocket = () => {
    if (pocketResult.entities.length === 0) return;
    onSetFittedPreviewCandidate({
      id: pocketResult.entities[0].id,
      kind: "polyline_rdp",
      pointsUsed: pocketResult.pocketLoops[0]?.length ?? 0,
      rmsMm: 0,
      maxDeviationMm: 0,
      entityPreview: pocketResult.entities[0],
      summaryLabel: `Auto-Pocket (${pocketResult.areaMm2.toFixed(0)} mm² · Fresa Ø${pocketResult.maxEndmillDiameterMm.toFixed(1)})`,
      infoStatus: "CALCULADO",
    });
  };

  const handleCommitPocket = () => {
    if (pocketResult.entities.length === 0) return;
    const extraEntities: Entity[] = [];
    // Se estiver no modo oblongo paramétrico e o canvas estiver vazio, opcionalmente adiciona o contorno externo e os furos
    if (pocketSourceMode === "parametric_oblong" && entities.length === 0) {
      extraEntities.push({
        id: `reveng-oblong-outer-${Date.now()}`,
        type: "polyline",
        layer: "corte",
        pts: autoPocketGeometry.outerPolygon,
        closed: true,
        params: { infoStatus: "CALCULADO", featureKind: "oblong_outer_envelope" },
      });
      for (const isl of autoPocketGeometry.islands) {
        extraEntities.push({
          id: `reveng-oblong-hole-${isl.id}-${Date.now()}`,
          type: "circle",
          layer: "recorte",
          cx: isl.cx,
          cy: isl.cy,
          r: isl.r,
          params: { infoStatus: "MEDIDO", featureKind: "oblong_hole" },
        });
      }
    }
    commit(
      [...entities, ...extraEntities, ...pocketResult.entities],
      `Gerar Auto-Pocket 2D (t_b=${borderWallTbMm}mm, t_i=${islandCollarTiMm}mm)`,
    );
    onSetFittedPreviewCandidate(null);
  };

  // --------------------------------------------------------------------------
  // ESTADO DA CATEGORIA 7: CREMALHEIRA LINEAR E ENGRENAGEM ISO 54 (SEÇÃO 10 / T11)
  // --------------------------------------------------------------------------
  const [toothProfileTab, setToothProfileTab] = useState<"spur_gear" | "linear_rack">("spur_gear");

  // Engrenagem Cilíndrica (10.2)
  const [gearTeethZ, setGearTeethZ] = useState<number>(20);
  const [gearMeasuredDeMm, setGearMeasuredDeMm] = useState<number>(44.1);
  const [gearPressureAngleDeg, setGearPressureAngleDeg] = useState<number>(20);
  const [gearOverrideModule, setGearOverrideModule] = useState<number | null>(null);
  const [gearCenterBoreMm, setGearCenterBoreMm] = useState<number>(12.0);

  const gearEstimation = useMemo(() => {
    return estimateGearModuleFromMeasurement({
      toothCountZ: gearTeethZ,
      measuredOuterDiameterMm: gearMeasuredDeMm,
      pressureAngleDeg: gearPressureAngleDeg,
      overrideModuleMm: gearOverrideModule ?? undefined,
    });
  }, [gearTeethZ, gearMeasuredDeMm, gearPressureAngleDeg, gearOverrideModule]);

  const handleCommitSpurGear = () => {
    const activeMod = gearOverrideModule ?? gearEstimation.suggestedIsoModuleMm;
    const generated = generateSpurGearProfile({
      toothCountZ: gearTeethZ,
      moduleMm: activeMod,
      pressureAngleDeg: gearPressureAngleDeg,
      centerBoreDiameterMm: gearCenterBoreMm,
      targetLayer: "corte",
    });
    commit(
      [...entities, ...generated.allEntities],
      `Gerar Engrenagem Z=${gearTeethZ} m=${activeMod} (Dp=${generated.estimation.pitchDiameterMm.toFixed(1)}mm)`,
    );
  };

  // Cremalheira Linear / Serrilhado (10.1)
  const [rackTeethZ, setRackTeethZ] = useState<number>(10);
  const [rackPitchMm, setRackPitchMm] = useState<number>(5.0);
  const [rackToothHeightMm, setRackToothHeightMm] = useState<number>(2.25);
  const [rackFlankAngleDeg, setRackFlankAngleDeg] = useState<number>(20);
  const [rackBaseHeightMm, setRackBaseHeightMm] = useState<number>(10.0);

  const rackOutput = useMemo(() => {
    return generateLinearRackProfile({
      toothCountZ: rackTeethZ,
      pitchMm: rackPitchMm,
      toothHeightMm: rackToothHeightMm,
      pressureAngleDeg: rackFlankAngleDeg,
      baseHeightMm: rackBaseHeightMm,
      targetLayer: "corte",
    });
  }, [rackTeethZ, rackPitchMm, rackToothHeightMm, rackFlankAngleDeg, rackBaseHeightMm]);

  const handleCommitLinearRack = () => {
    commit(
      [...entities, rackOutput.entity],
      `Gerar Cremalheira Z=${rackTeethZ} p=${rackPitchMm}mm (L=${rackOutput.exactTotalLengthMm.toFixed(1)}mm)`,
    );
  };

  const cardClass = cn(
    "rounded-xl border p-2.5 transition-colors",
    isDark
      ? "border-[#293444] bg-[#151C27] text-[#E6EDF5]"
      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
  );

  return (
    <>
      {/* =================================================================== */}
      {/* CATEGORIA 6: CAVIDADES E PAREDE CONSTANTE — AUTO-POCKET 2D (T10)    */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => onToggleCategory("cavidades_25d")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Layers className="size-3.5 text-[#38BDF8]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              6. Auto-Pocket 2D (Parede Constante)
            </span>
          </div>
          <span className="rounded bg-sky-500/20 border border-sky-500/40 px-1.5 py-0.5 text-[8px] font-bold text-sky-300">
            CALCULADO
          </span>
        </button>

        {revEng.activeCategory === "cavidades_25d" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/80 pt-2.5 text-[9.5px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPocketSourceMode("canvas_auto")}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1 text-[8.5px] font-bold cursor-pointer",
                  pocketSourceMode === "canvas_auto"
                    ? "border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]"
                    : "border-[#293444] text-[#94A3B8]",
                )}
              >
                Usar Contorno do Canvas
              </button>
              <button
                type="button"
                onClick={() => setPocketSourceMode("parametric_oblong")}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1 text-[8.5px] font-bold cursor-pointer",
                  pocketSourceMode === "parametric_oblong"
                    ? "border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]"
                    : "border-[#293444] text-[#94A3B8]",
                )}
              >
                Braço / Olhal Paramétrico
              </button>
            </div>

            {pocketSourceMode === "parametric_oblong" && (
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#293444] bg-[#0D121B]/70 p-1.5">
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypad(e, "Centro a Centro (L)", oblongSpanMm, "mm", (v) => {
                      if (v > 10) setOblongSpanMm(v);
                    })
                  }
                  className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
                >
                  <div className="text-[7.5px] text-[#94A3B8]">Passo L</div>
                  <div className="font-mono font-bold text-[#38BDF8]">
                    {oblongSpanMm.toFixed(1)} mm
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypad(e, "Raio Olhal 1 (R1)", oblongOuterR1Mm, "mm", (v) => {
                      if (v > 5) setOblongOuterR1Mm(v);
                    })
                  }
                  className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
                >
                  <div className="text-[7.5px] text-[#94A3B8]">Olhal R1/R2</div>
                  <div className="font-mono font-bold text-white">
                    R{oblongOuterR1Mm}/{oblongOuterR2Mm}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) =>
                    openKeypad(e, "Furo Interno 1 (Ø1)", oblongHoleD1Mm, "mm", (v) => {
                      if (v > 2) setOblongHoleD1Mm(v);
                    })
                  }
                  className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
                >
                  <div className="text-[7.5px] text-[#94A3B8]">Furos Ø1/Ø2</div>
                  <div className="font-mono font-bold text-emerald-300">
                    Ø{oblongHoleD1Mm}/Ø{oblongHoleD2Mm}
                  </div>
                </button>
              </div>
            )}

            {/* Parâmetros fundamentais do Auto-Pocket: t_b, t_i, r_c */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={(e) =>
                  openKeypad(e, "Parede da Borda (t_b)", borderWallTbMm, "mm", (v) => {
                    if (v > 0.2) setBorderWallTbMm(v);
                  })
                }
                className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
              >
                <div className="text-[7.5px] text-[#94A3B8]">Parede Borda (t_b)</div>
                <div className="font-mono text-[10px] font-bold text-[#38BDF8]">
                  {borderWallTbMm.toFixed(2)} mm
                </div>
              </button>

              <button
                type="button"
                onClick={(e) =>
                  openKeypad(e, "Colar dos Furos (t_i)", islandCollarTiMm, "mm", (v) => {
                    if (v > 0.2) setIslandCollarTiMm(v);
                  })
                }
                className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
              >
                <div className="text-[7.5px] text-[#94A3B8]">Colar Furos (t_i)</div>
                <div className="font-mono text-[10px] font-bold text-emerald-300">
                  {islandCollarTiMm.toFixed(2)} mm
                </div>
              </button>

              <button
                type="button"
                onClick={(e) =>
                  openKeypad(e, "Raio Canto Fresa (r_c)", cornerRadiusRcMm, "mm", (v) => {
                    if (v >= 0) setCornerRadiusRcMm(v);
                  })
                }
                className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
              >
                <div className="text-[7.5px] text-[#94A3B8]">Raio Canto (r_c)</div>
                <div className="font-mono text-[10px] font-bold text-amber-300">
                  R{cornerRadiusRcMm.toFixed(1)} mm
                </div>
              </button>
            </div>

            {/* Card de Diagnóstico Geométrico da Cavidade */}
            <div className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex flex-col gap-1.5">
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[7.5px] text-[#94A3B8]">Área Pocket</div>
                  <div className="font-mono font-bold text-emerald-300">
                    {pocketResult.areaMm2.toFixed(0)} mm²
                  </div>
                </div>
                <div>
                  <div className="text-[7.5px] text-[#94A3B8]">Fresa Máx (2·r_c)</div>
                  <div className="font-mono font-bold text-[#38BDF8]">
                    Ø{pocketResult.maxEndmillDiameterMm.toFixed(1)} mm
                  </div>
                </div>
                <div>
                  <div className="text-[7.5px] text-[#94A3B8]">Perímetro</div>
                  <div className="font-mono font-bold text-white">
                    {pocketResult.perimeterMm.toFixed(1)} mm
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "text-[8.5px] px-1.5 py-1 rounded",
                  pocketResult.status === "ok"
                    ? "bg-emerald-950/40 text-emerald-300"
                    : "bg-amber-950/50 text-amber-300",
                )}
              >
                {pocketResult.message}
              </div>

              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={handlePreviewPocket}
                  className="rounded-lg border border-[#38BDF8]/50 bg-[#151C27] px-2.5 py-1 text-[8.5px] font-bold text-[#38BDF8] cursor-pointer"
                >
                  Prévia no Canvas
                </button>
                <button
                  type="button"
                  onClick={handleCommitPocket}
                  disabled={pocketResult.entities.length === 0}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-2.5 py-1 text-[9px] font-bold text-white cursor-pointer"
                >
                  <Check className="size-3" />
                  <span>Gerar Auto-Pocket</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* CATEGORIA 7: DENTES, CREMALHEIRA E ENGRENAGEM CILÍNDRICA (T11)      */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => onToggleCategory("dentes_engrenagens")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Cog className="size-3.5 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              7. Dentes, Cremalheira e Engrenagem
            </span>
          </div>
          <span className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[8px] font-bold text-amber-300">
            ISO 54
          </span>
        </button>

        {revEng.activeCategory === "dentes_engrenagens" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/80 pt-2.5 text-[9.5px]">
            {/* Alternador Engrenagem vs Cremalheira */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setToothProfileTab("spur_gear")}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1 text-[8.5px] font-bold cursor-pointer",
                  toothProfileTab === "spur_gear"
                    ? "border-amber-400 bg-amber-500/15 text-amber-300"
                    : "border-[#293444] text-[#94A3B8]",
                )}
              >
                Engrenagem (Z + Ø Ext)
              </button>
              <button
                type="button"
                onClick={() => setToothProfileTab("linear_rack")}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1 text-[8.5px] font-bold cursor-pointer",
                  toothProfileTab === "linear_rack"
                    ? "border-amber-400 bg-amber-500/15 text-amber-300"
                    : "border-[#293444] text-[#94A3B8]",
                )}
              >
                Cremalheira / Serrilhado
              </button>
            </div>

            {toothProfileTab === "spur_gear" ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypad(e, "Nº de Dentes (Z)", gearTeethZ, "", (v) => {
                        if (v >= 6) setGearTeethZ(Math.round(v));
                      })
                    }
                    className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                  >
                    <div className="text-[7.5px] text-[#94A3B8]">Nº Dentes (Z)</div>
                    <div className="font-mono text-[10px] font-bold text-white">
                      Z = {gearTeethZ}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypad(e, "Diâmetro Externo Medido (De)", gearMeasuredDeMm, "mm", (v) => {
                        if (v > 5) {
                          setGearMeasuredDeMm(v);
                          setGearOverrideModule(null);
                        }
                      })
                    }
                    className="rounded-lg border border-emerald-500/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                  >
                    <div className="text-[7.5px] text-emerald-300">Ø Ext Medido (De)</div>
                    <div className="font-mono text-[10px] font-bold text-emerald-300">
                      Ø{gearMeasuredDeMm.toFixed(2)} mm
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypad(e, "Furo Central (Ø)", gearCenterBoreMm, "mm", (v) => {
                        if (v >= 0) setGearCenterBoreMm(v);
                      })
                    }
                    className="rounded-lg border border-[#293444] bg-[#0D121B] p-1.5 text-left cursor-pointer"
                  >
                    <div className="text-[7.5px] text-[#94A3B8]">Furo Cubo (Ø)</div>
                    <div className="font-mono text-[10px] font-bold text-[#38BDF8]">
                      Ø{gearCenterBoreMm.toFixed(1)} mm
                    </div>
                  </button>
                </div>

                {/* Diagnóstico ISO 54: m_est = De / (Z + 2) */}
                <div className="rounded-lg border border-amber-500/30 bg-[#0D121B]/90 p-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8.5px] text-[#94A3B8]">
                      m_est = De / (Z+2) ={" "}
                      <strong className="text-white font-mono">
                        {gearEstimation.estimatedModuleMm.toFixed(4)} mm
                      </strong>
                    </span>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[8.5px] font-mono font-bold text-amber-300">
                      ISO m = {gearEstimation.suggestedIsoModuleMm}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center bg-[#151C27] rounded p-1">
                    <div>
                      <div className="text-[7.5px] text-[#94A3B8]">Ø Primitivo (Dp)</div>
                      <div className="font-mono font-bold text-[#38BDF8]">
                        Ø{gearEstimation.pitchDiameterMm.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[7.5px] text-[#94A3B8]">Ø Raiz (Df)</div>
                      <div className="font-mono font-bold text-white">
                        Ø{gearEstimation.rootDiameterMm.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[7.5px] text-[#94A3B8]">
                        Wildhaber W_{gearEstimation.wildhaberSpanTeethK}
                      </div>
                      <div className="font-mono font-bold text-emerald-300">
                        {gearEstimation.wildhaberSpanLengthWkMm.toFixed(2)} mm
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <select
                      value={gearOverrideModule ?? gearEstimation.suggestedIsoModuleMm}
                      onChange={(e) => setGearOverrideModule(Number(e.target.value))}
                      className="rounded border border-[#293444] bg-[#151C27] px-1.5 py-1 text-[8.5px] text-[#E6EDF5]"
                    >
                      {ISO_54_STANDARD_MODULES.map((mIso) => (
                        <option key={mIso} value={mIso}>
                          Módulo m = {mIso} mm
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleCommitSpurGear}
                      className="flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-[9px] font-bold text-white cursor-pointer"
                    >
                      <Sparkles className="size-3" />
                      <span>Gerar Engrenagem</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypad(e, "Nº de Dentes (Z)", rackTeethZ, "", (v) => {
                        if (v >= 1) setRackTeethZ(Math.round(v));
                      })
                    }
                    className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                  >
                    <div className="text-[7.5px] text-[#94A3B8]">Nº Dentes (Z)</div>
                    <div className="font-mono text-[10px] font-bold text-white">
                      {rackTeethZ} dentes
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypad(e, "Passo Linear (p)", rackPitchMm, "mm", (v) => {
                        if (v > 0.5) setRackPitchMm(v);
                      })
                    }
                    className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                  >
                    <div className="text-[7.5px] text-[#94A3B8]">Passo (p)</div>
                    <div className="font-mono text-[10px] font-bold text-[#38BDF8]">
                      {rackPitchMm.toFixed(2)} mm
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) =>
                      openKeypad(e, "Altura do Dente (h)", rackToothHeightMm, "mm", (v) => {
                        if (v > 0.2) setRackToothHeightMm(v);
                      })
                    }
                    className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                  >
                    <div className="text-[7.5px] text-[#94A3B8]">Altura Dente (h)</div>
                    <div className="font-mono text-[10px] font-bold text-emerald-300">
                      {rackToothHeightMm.toFixed(2)} mm
                    </div>
                  </button>
                </div>

                <div className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex items-center justify-between">
                  <div>
                    <div className="text-[8px] text-[#94A3B8]">
                      Comprimento Exato L = Z · p
                    </div>
                    <div className="font-mono text-[10.5px] font-bold text-amber-300">
                      L = {rackOutput.exactTotalLengthMm.toFixed(2)} mm ({rackTeethZ} ciclos)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCommitLinearRack}
                    className="flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-[9px] font-bold text-white cursor-pointer"
                  >
                    <Check className="size-3" />
                    <span>Gerar Cremalheira</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
