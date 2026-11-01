/**
 * CALDRA CHAMFER CAD — PAINÉIS DE BANCADA MECÂNICA (FASE C)
 * Categorias 4 ("4. Furos, Corda+Flecha e Cadeias") e 5 ("5. Olhais, Pontes Tangentes TTR")
 *
 * Todos os campos numéricos abrem exclusivamente o ChamferDirectDimensionEditor (openKeypad),
 * sem jamais acionar o teclado nativo do sistema operacional móvel.
 */

import React, { useState, useMemo } from "react";
import {
  CircleDot,
  Crosshair,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  Network,
  Compass,
  Scissors,
  Sparkles,
} from "lucide-react";
import { toast } from "@/lib/lab2d/chamferNotify";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import { uid, type Entity, type Vec2 } from "@/lib/lab2d/core";
import type {
  RevEngPlanData,
  RevEngCategoryId,
  FittedPrimitiveCandidate,
} from "@/lib/lab2d/revEngTypes";
import {
  computeHoleByCaliper,
  buildHoleCadEntities,
  solveTrilateration2D,
  solveHoleNetworkGaussNewton,
  evaluateDimensionChain,
  computeRadiusFromChordSagitta,
  generateOrdinateStationPoints,
  type CaliperHoleMeasurementMode,
  type HoleNetworkNode,
  type HoleNetworkEdge,
} from "@/lib/lab2d/revEngBench";
import {
  buildConcentricEye,
  solveTangentBridge,
  computeEyeTrimPreview,
  TANGENT_BRIDGE_KIND_LABELS,
  type ConcentricEyeSizingMode,
  type TangentBridgeKind,
} from "@/lib/lab2d/revEngTangentBridges";

export interface KeypadTriggerFn {
  (
    ev: React.MouseEvent | React.PointerEvent,
    req: {
      label: string;
      currentValue: number;
      unit: "mm" | "°";
      allowNegative?: boolean;
      onConfirm: (val: number) => void;
    },
  ): void;
}

export interface ChamferRevEngBenchPanelsProps {
  revEng: RevEngPlanData;
  onChangeRevEng: (updater: RevEngPlanData | ((prev: RevEngPlanData) => RevEngPlanData)) => void;
  entities: Entity[];
  selection: string[];
  setSelection: (ids: string[]) => void;
  commit: (updater: Entity[] | ((prev: Entity[]) => Entity[])) => void;
  activeLayer: string;
  onSetFittedPreviewCandidate: (cand: FittedPrimitiveCandidate | null) => void;
  openKeypad: KeypadTriggerFn;
  onToggleCategory: (catId: RevEngCategoryId) => void;
  isDark: boolean;
}

type Cat4SubTab = "paquimetro" | "trilateracao" | "rede_lsq" | "cadeia" | "corda_ordenadas";
type Cat5SubTab = "olhal" | "ponte_ttr";

export function ChamferRevEngBenchPanels({
  revEng,
  onChangeRevEng,
  entities,
  selection,
  setSelection,
  commit,
  onSetFittedPreviewCandidate,
  openKeypad,
  onToggleCategory,
  isDark,
}: ChamferRevEngBenchPanelsProps) {
  const [cat4Tab, setCat4Tab] = useState<Cat4SubTab>("paquimetro");
  const [cat5Tab, setCat5Tab] = useState<Cat5SubTab>("ponte_ttr");

  // ---------------------------------------------------------------------------
  // 4.1 Estado: Furo por Paquímetro
  // ---------------------------------------------------------------------------
  const [calMode, setCalMode] = useState<CaliperHoleMeasurementMode>("parede_a_parede");
  const [calRefX, setCalRefX] = useState<number>(0);
  const [calRefY, setCalRefY] = useState<number>(0);
  const [calRefDia, setCalRefDia] = useState<number>(20);
  const [calTargetDia, setCalTargetDia] = useState<number>(30);
  const [calReadingMm, setCalReadingMm] = useState<number>(87.4);
  const [calAngleDeg, setCalAngleDeg] = useState<number>(0);
  const [calEdgeX, setCalEdgeX] = useState<number>(12.0);
  const [calEdgeY, setCalEdgeY] = useState<number>(18.5);
  const [calCenterlines, setCalCenterlines] = useState<boolean>(true);

  // ---------------------------------------------------------------------------
  // 4.2 Estado: Trilateração de 2 Furos-Base
  // ---------------------------------------------------------------------------
  const [triP1X, setTriP1X] = useState<number>(0);
  const [triP1Y, setTriP1Y] = useState<number>(0);
  const [triD1, setTriD1] = useState<number>(20);
  const [triP2X, setTriP2X] = useState<number>(100);
  const [triP2Y, setTriP2Y] = useState<number>(0);
  const [triD2, setTriD2] = useState<number>(20);
  const [triTargetD, setTriTargetD] = useState<number>(16);
  const [triL1, setTriL1] = useState<number>(60);
  const [triMode1, setTriMode1] = useState<"centro_a_centro" | "parede_a_parede" | "fora_a_fora">(
    "centro_a_centro",
  );
  const [triL2, setTriL2] = useState<number>(80);
  const [triMode2, setTriMode2] = useState<"centro_a_centro" | "parede_a_parede" | "fora_a_fora">(
    "centro_a_centro",
  );
  const [triChosenBranch, setTriChosenBranch] = useState<"A" | "B">("A");

  // ---------------------------------------------------------------------------
  // 4.3 Estado: Rede de Medidas por Gauss–Newton (Teste T5)
  // ---------------------------------------------------------------------------
  const [netNodes, setNetNodes] = useState<HoleNetworkNode[]>([
    { id: "F1", label: "Furo 1 (Origem)", diameterMm: 12, x: 0, y: 0 },
    { id: "F2", label: "Furo 2 (Eixo X)", diameterMm: 12, x: 100, y: 0 },
    { id: "F3", label: "Furo 3 (Sup Dir)", diameterMm: 12 },
    { id: "F4", label: "Furo 4 (Sup Esq)", diameterMm: 12 },
  ]);
  const [netEdges, setNetEdges] = useState<HoleNetworkEdge[]>([
    { id: "E12", fromId: "F1", toId: "F2", readingMm: 100.05, mode: "centro_a_centro", uncertaintyMm: 0.1 },
    { id: "E23", fromId: "F2", toId: "F3", readingMm: 59.95, mode: "centro_a_centro", uncertaintyMm: 0.1 },
    { id: "E34", fromId: "F3", toId: "F4", readingMm: 100.04, mode: "centro_a_centro", uncertaintyMm: 0.1 },
    { id: "E41", fromId: "F4", toId: "F1", readingMm: 60.03, mode: "centro_a_centro", uncertaintyMm: 0.1 },
    { id: "E13", fromId: "F1", toId: "F3", readingMm: 116.65, mode: "centro_a_centro", uncertaintyMm: 0.1 },
    { id: "E24", fromId: "F2", toId: "F4", readingMm: 116.58, mode: "centro_a_centro", uncertaintyMm: 0.1 },
  ]);

  // ---------------------------------------------------------------------------
  // 4.4 Estado: Fechamento de Cadeia de Cotas (Teste T6)
  // ---------------------------------------------------------------------------
  const [chainPartials, setChainPartials] = useState<number[]>([30, 30, 35, 40, 10, 5]);
  const [chainTotalMeasured, setChainTotalMeasured] = useState<number>(150.4);
  const [chainTol, setChainTol] = useState<number>(0.2);
  const [chainDistribute, setChainDistribute] = useState<boolean>(false);
  const [chainHoleDia, setChainHoleDia] = useState<number>(10);

  // ---------------------------------------------------------------------------
  // 4.5 Estado: Calculadora Universal Corda + Flecha (Teste T7) e Ordenadas
  // ---------------------------------------------------------------------------
  const [csChord, setCsChord] = useState<number>(100);
  const [csSagitta, setCsSagitta] = useState<number>(10);
  const [csUncC, setCsUncC] = useState<number>(0.05);
  const [csUncF, setCsUncF] = useState<number>(0.05);
  const [ordSpacing, setOrdSpacing] = useState<number>(20);
  const [ordOffsets, setOrdOffsets] = useState<number[]>([0, 8.5, 14.2, 16.0, 14.2, 8.5, 0]);

  // ---------------------------------------------------------------------------
  // 5.1 Estado: Olhal Concêntrico
  // ---------------------------------------------------------------------------
  const [eyeCenterX, setEyeCenterX] = useState<number>(0);
  const [eyeCenterY, setEyeCenterY] = useState<number>(0);
  const [eyeHoleDia, setEyeHoleDia] = useState<number>(20);
  const [eyeSizingMode, setEyeSizingMode] = useState<ConcentricEyeSizingMode>("outer_radius");
  const [eyeOuterR, setEyeOuterR] = useState<number>(20);
  const [eyeWallE, setEyeWallE] = useState<number>(10);
  const [showEyeChordCalc, setShowEyeChordCalc] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // 5.2 Estado: Ponte Tangente TTR (Teste T9) e Aparar Olhais
  // ---------------------------------------------------------------------------
  const [brC1X, setBrC1X] = useState<number>(0);
  const [brC1Y, setBrC1Y] = useState<number>(0);
  const [brR1, setBrR1] = useState<number>(20);
  const [brC2X, setBrC2X] = useState<number>(132.4);
  const [brC2Y, setBrC2Y] = useState<number>(0);
  const [brR2, setBrR2] = useState<number>(35);
  const [brKind, setBrKind] = useState<TangentBridgeKind>("arc_concave");
  const [brRadius, setBrRadius] = useState<number>(120);
  const [brBranch, setBrBranch] = useState<"A" | "B">("A");
  const [showBrChordCalc, setShowBrChordCalc] = useState<boolean>(false);
  const [trimPreviewActive, setTrimPreviewActive] = useState<boolean>(false);

  // Círculos selecionados no canvas (para autopreencher furos-base / olhais)
  const selectedCircles = useMemo(
    () =>
      selection
        .map((id) => entities.find((e) => e.id === id))
        .filter((e): e is Extract<Entity, { type: "circle" }> => !!e && e.type === "circle"),
    [selection, entities],
  );

  // Avaliações reativas
  const caliperEval = useMemo(() => {
    try {
      return computeHoleByCaliper({
        mode: calMode,
        refX: calRefX,
        refY: calRefY,
        refDiameterMm: calRefDia,
        targetDiameterMm: calTargetDia,
        measuredDistanceMm: calReadingMm,
        angleDeg: calAngleDeg,
        edgeDistXMm: calEdgeX,
        edgeDistYMm: calEdgeY,
        signX: 1,
        signY: 1,
      });
    } catch {
      return null;
    }
  }, [
    calMode,
    calRefX,
    calRefY,
    calRefDia,
    calTargetDia,
    calReadingMm,
    calAngleDeg,
    calEdgeX,
    calEdgeY,
  ]);

  const trilatEval = useMemo(
    () =>
      solveTrilateration2D({
        p1: { x: triP1X, y: triP1Y },
        p2: { x: triP2X, y: triP2Y },
        d1Mm: triD1,
        d2Mm: triD2,
        targetDiameterMm: triTargetD,
        reading1Mm: triL1,
        mode1: triMode1,
        reading2Mm: triL2,
        mode2: triMode2,
      }),
    [triP1X, triP1Y, triP2X, triP2Y, triD1, triD2, triTargetD, triL1, triMode1, triL2, triMode2],
  );

  const networkEval = useMemo(() => {
    try {
      return solveHoleNetworkGaussNewton(netNodes, netEdges, netNodes[0]?.id, netNodes[1]?.id);
    } catch {
      return null;
    }
  }, [netNodes, netEdges]);

  const chainEval = useMemo(() => {
    try {
      return evaluateDimensionChain({
        partialsMm: chainPartials,
        totalMeasuredMm: chainTotalMeasured,
        closureToleranceMm: chainTol,
        distributeError: chainDistribute,
      });
    } catch {
      return null;
    }
  }, [chainPartials, chainTotalMeasured, chainTol, chainDistribute]);

  const chordSagittaEval = useMemo(() => {
    try {
      return computeRadiusFromChordSagitta({
        chordMm: csChord,
        sagittaMm: csSagitta,
        chordUncertaintyMm: csUncC,
        sagittaUncertaintyMm: csUncF,
      });
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Flecha inválida.",
      } as const;
    }
  }, [csChord, csSagitta, csUncC, csUncF]);

  const eyeEval = useMemo(() => {
    try {
      return buildConcentricEye({
        center: { x: eyeCenterX, y: eyeCenterY },
        holeDiameterMm: eyeHoleDia,
        sizingMode: eyeSizingMode,
        outerRadiusMm: eyeOuterR,
        wallThicknessMm: eyeWallE,
        existingHoleEntityId: selectedCircles[0]?.id,
      });
    } catch {
      return null;
    }
  }, [eyeCenterX, eyeCenterY, eyeHoleDia, eyeSizingMode, eyeOuterR, eyeWallE, selectedCircles]);

  const bridgeEval = useMemo(() => {
    try {
      return solveTangentBridge({
        circle1: {
          id: selectedCircles[0]?.id,
          center: { x: brC1X, y: brC1Y },
          radiusMm: brR1,
        },
        circle2: {
          id: selectedCircles[1]?.id,
          center: { x: brC2X, y: brC2Y },
          radiusMm: brR2,
        },
        kind: brKind,
        bridgeRadiusMm: brRadius,
      });
    } catch {
      return null;
    }
  }, [brC1X, brC1Y, brR1, brC2X, brC2Y, brR2, brKind, brRadius, selectedCircles]);

  const cardClass = cn(
    "rounded-xl border p-2.5 transition-all",
    isDark
      ? "border-[#293444] bg-[#0D121B]/90 text-[#E6EDF5]"
      : "border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B]",
  );

  const numBtnClass = cn(
    "inline-flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10.5px] font-bold transition-colors cursor-pointer",
    isDark
      ? "border-[#38BDF8]/40 bg-[#151C27] text-[#38BDF8] hover:border-[#38BDF8] hover:bg-[#1E293B]"
      : "border-[#0284C7]/40 bg-[#FFFFFF] text-[#0284C7] hover:border-[#0284C7]",
  );

  return (
    <>
      {/* =================================================================== */}
      {/* CATEGORIA 4: FUROS, PAQUÍMETRO, TRILATERAÇÃO, REDE E CADEIAS        */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => onToggleCategory("furos_cadeias")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <CircleDot className="size-3.5 text-[#38BDF8]" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              4. Furos, Corda+Flecha e Cadeias
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8.5px] font-bold text-emerald-400">
              Ativo
            </span>
            {revEng.activeCategory === "furos_cadeias" ? (
              <ChevronDown className="size-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="size-3.5 text-[#94A3B8]" />
            )}
          </div>
        </button>

        {revEng.activeCategory === "furos_cadeias" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/60 pt-2">
            {/* Sub-abas da Categoria 4 */}
            <div className="grid grid-cols-5 gap-1">
              {(
                [
                  { id: "paquimetro" as const, label: "Paquím." },
                  { id: "trilateracao" as const, label: "Trilat." },
                  { id: "rede_lsq" as const, label: "Rede LSQ" },
                  { id: "cadeia" as const, label: "Cadeia" },
                  { id: "corda_ordenadas" as const, label: "Corda/Ord" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setCat4Tab(t.id);
                  }}
                  className={cn(
                    "rounded-lg py-1 px-1 text-[9px] font-bold border text-center truncate cursor-pointer transition-all",
                    cat4Tab === t.id
                      ? "border-[#E11D48] bg-[#E11D48] text-white"
                      : isDark
                        ? "border-[#293444] bg-[#151C27] text-[#94A3B8] hover:text-white"
                        : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 4.1 SUB-ABA: FURO POR PAQUÍMETRO (TESTE T3)                   */}
            {/* ------------------------------------------------------------- */}
            {cat4Tab === "paquimetro" && (
              <div className="flex flex-col gap-2">
                {selectedCircles.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const c = selectedCircles[0]!;
                      setCalRefX(Number(c.cx.toFixed(2)));
                      setCalRefY(Number(c.cy.toFixed(2)));
                      setCalRefDia(Number((c.r * 2).toFixed(2)));
                      toast.success(
                        `Furo-base capturado da seleção: Ø${(c.r * 2).toFixed(1)} mm em (${c.cx.toFixed(1)}; ${c.cy.toFixed(1)}).`,
                      );
                    }}
                    className="flex items-center justify-center gap-1 rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 py-1 px-2 text-[9.5px] font-bold text-[#38BDF8] cursor-pointer"
                  >
                    <Crosshair className="size-3" />
                    <span>
                      Usar Círculo Selecionado como Base (Ø{(selectedCircles[0]!.r * 2).toFixed(1)})
                    </span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: "parede_a_parede" as const, label: "Parede → Parede" },
                      { id: "fora_a_fora" as const, label: "Fora → Fora" },
                      { id: "centro_a_centro" as const, label: "Centro → Centro" },
                      { id: "borda_a_borda" as const, label: "Borda → Borda" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCalMode(m.id)}
                      className={cn(
                        "rounded-lg px-2 py-1 text-[9.5px] font-bold border cursor-pointer",
                        calMode === m.id
                          ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                          : isDark
                            ? "border-[#293444] bg-[#151C27] text-[#94A3B8]"
                            : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Diagrama Técnico SVG do Paquímetro */}
                <div className="rounded-lg border border-[#293444] bg-[#0B0F14] p-2">
                  <svg viewBox="0 0 240 56" className="w-full h-13">
                    {/* Linha de centro */}
                    <line
                      x1="16"
                      y1="28"
                      x2="224"
                      y2="28"
                      stroke="#64748B"
                      strokeWidth="1"
                      strokeDasharray="4 2"
                    />
                    {/* Furo de Referência */}
                    <circle
                      cx="52"
                      cy="28"
                      r="16"
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="1.5"
                    />
                    {/* Novo Furo */}
                    <circle
                      cx="184"
                      cy="28"
                      r="20"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="1.5"
                    />
                    {/* Cota destacada segundo o modo */}
                    {calMode === "parede_a_parede" && (
                      <>
                        <line x1="68" y1="10" x2="164" y2="10" stroke="#F59E0B" strokeWidth="2" />
                        <line x1="68" y1="6" x2="68" y2="28" stroke="#F59E0B" strokeWidth="1" />
                        <line x1="164" y1="6" x2="164" y2="28" stroke="#F59E0B" strokeWidth="1" />
                        <text x="116" y="8" textAnchor="middle" fill="#F59E0B" fontSize="8" fontWeight="bold">
                          d_int = {calReadingMm.toFixed(1)} mm
                        </text>
                      </>
                    )}
                    {calMode === "fora_a_fora" && (
                      <>
                        <line x1="36" y1="10" x2="204" y2="10" stroke="#F59E0B" strokeWidth="2" />
                        <line x1="36" y1="6" x2="36" y2="28" stroke="#F59E0B" strokeWidth="1" />
                        <line x1="204" y1="6" x2="204" y2="28" stroke="#F59E0B" strokeWidth="1" />
                        <text x="120" y="8" textAnchor="middle" fill="#F59E0B" fontSize="8" fontWeight="bold">
                          d_ext = {calReadingMm.toFixed(1)} mm
                        </text>
                      </>
                    )}
                    {(calMode === "centro_a_centro" || calMode === "borda_a_borda") && (
                      <>
                        <line x1="52" y1="10" x2="184" y2="10" stroke="#38BDF8" strokeWidth="2" />
                        <text x="118" y="8" textAnchor="middle" fill="#38BDF8" fontSize="8" fontWeight="bold">
                          L = {caliperEval?.centerToCenterMm.toFixed(1) ?? calReadingMm.toFixed(1)} mm
                        </text>
                      </>
                    )}
                  </svg>
                </div>

                {/* Campos numéricos via Teclado Chamfer */}
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Ref X (mm)",
                        currentValue: calRefX,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setCalRefX,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Ref X:</span>
                    <span>{calRefX.toFixed(2)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Ref Y (mm)",
                        currentValue: calRefY,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setCalRefY,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Ref Y:</span>
                    <span>{calRefY.toFixed(2)}</span>
                  </button>
                </div>

                {calMode === "borda_a_borda" ? (
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Borda X → Parede (bx mm)",
                          currentValue: calEdgeX,
                          unit: "mm",
                          allowNegative: true,
                          onConfirm: setCalEdgeX,
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">bx:</span>
                      <span>{calEdgeX.toFixed(1)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Borda Y → Parede (by mm)",
                          currentValue: calEdgeY,
                          unit: "mm",
                          allowNegative: true,
                          onConfirm: setCalEdgeY,
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">by:</span>
                      <span>{calEdgeY.toFixed(1)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Diâmetro do Furo Ø (mm)",
                          currentValue: calTargetDia,
                          unit: "mm",
                          onConfirm: (v) => setCalTargetDia(Math.max(0.5, v)),
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">Ø:</span>
                      <span>{calTargetDia.toFixed(1)}</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Diâmetro Furo Referência Ø_ref (mm)",
                            currentValue: calRefDia,
                            unit: "mm",
                            onConfirm: (v) => setCalRefDia(Math.max(0, v)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span className="text-[8.5px] text-[#94A3B8]">Ø_ref:</span>
                        <span>{calRefDia.toFixed(2)} mm</span>
                      </button>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Diâmetro Novo Furo Ø (mm)",
                            currentValue: calTargetDia,
                            unit: "mm",
                            onConfirm: (v) => setCalTargetDia(Math.max(0.5, v)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span className="text-[8.5px] text-[#94A3B8]">Novo Ø:</span>
                        <span>{calTargetDia.toFixed(2)} mm</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Leitura do Paquímetro (mm)",
                            currentValue: calReadingMm,
                            unit: "mm",
                            onConfirm: (v) => setCalReadingMm(Math.max(0.1, v)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span className="text-[8.5px] text-[#94A3B8]">Leitura:</span>
                        <span>{calReadingMm.toFixed(2)} mm</span>
                      </button>
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Ângulo Direcional (°)",
                            currentValue: calAngleDeg,
                            unit: "°",
                            allowNegative: true,
                            onConfirm: setCalAngleDeg,
                          })
                        }
                        className={numBtnClass}
                      >
                        <span className="text-[8.5px] text-[#94A3B8]">Ângulo:</span>
                        <span>{calAngleDeg.toFixed(1)}°</span>
                      </button>
                    </div>
                  </>
                )}

                {caliperEval && (
                  <div
                    className={cn(
                      "rounded-lg border p-2 text-[9.5px] flex flex-col gap-1",
                      caliperEval.wallTearError
                        ? "border-rose-500/60 bg-rose-950/35 text-rose-200"
                        : "border-emerald-500/40 bg-emerald-950/25 text-emerald-200",
                    )}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>
                        Centro: ({caliperEval.centerX.toFixed(2)}; {caliperEval.centerY.toFixed(2)}) mm
                      </span>
                      <span className="text-[#38BDF8]">
                        C-C: {caliperEval.centerToCenterMm.toFixed(2)} mm
                      </span>
                    </div>
                    <div className="text-[8.5px] opacity-90">{caliperEval.formulaSummary}</div>
                    {caliperEval.wallTearError && (
                      <div className="flex items-center gap-1 text-rose-400 font-bold">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>{caliperEval.wallTearError}</span>
                      </div>
                    )}
                    {caliperEval.thinWallWarning && !caliperEval.wallTearError && (
                      <div className="flex items-center gap-1 text-amber-300 font-semibold">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>{caliperEval.thinWallWarning}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1 text-[9.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calCenterlines}
                      onChange={(e) => setCalCenterlines(e.target.checked)}
                      className="accent-[#E11D48]"
                    />
                    <span>Eixos de centro</span>
                  </label>

                  <button
                    type="button"
                    disabled={!caliperEval || !caliperEval.valid}
                    onClick={() => {
                      if (!caliperEval || !caliperEval.valid) return;
                      const newEnts = buildHoleCadEntities(
                        { x: caliperEval.centerX, y: caliperEval.centerY },
                        caliperEval.diameterMm,
                        caliperEval.infoStatus,
                        calCenterlines,
                      );
                      commit((prev) => [...prev, ...newEnts]);
                      setSelection([newEnts[0]!.id]);
                      triggerHaptic("success");
                      toast.success(
                        `Furo Ø${caliperEval.diameterMm.toFixed(1)} inserido em (${caliperEval.centerX.toFixed(2)}; ${caliperEval.centerY.toFixed(2)}) mm.`,
                      );
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-bold cursor-pointer",
                      caliperEval?.valid
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed",
                    )}
                  >
                    <Check className="size-3.5" />
                    <span>Inserir Furo no CAD</span>
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 4.2 SUB-ABA: TRILATERAÇÃO DE 2 FUROS-BASE (TESTE T4)          */}
            {/* ------------------------------------------------------------- */}
            {cat4Tab === "trilateracao" && (
              <div className="flex flex-col gap-2">
                {selectedCircles.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const c1 = selectedCircles[0]!;
                      const c2 = selectedCircles[1]!;
                      setTriP1X(Number(c1.cx.toFixed(2)));
                      setTriP1Y(Number(c1.cy.toFixed(2)));
                      setTriD1(Number((c1.r * 2).toFixed(2)));
                      setTriP2X(Number(c2.cx.toFixed(2)));
                      setTriP2Y(Number(c2.cy.toFixed(2)));
                      setTriD2(Number((c2.r * 2).toFixed(2)));
                      toast.success("Furos-base P1 e P2 capturados da seleção no canvas.");
                    }}
                    className="flex items-center justify-center gap-1 rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 py-1 px-2 text-[9.5px] font-bold text-[#38BDF8] cursor-pointer"
                  >
                    <Crosshair className="size-3" />
                    <span>Capturar 2 Círculos Selecionados como Bases P1 e P2</span>
                  </button>
                )}

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Base P1 · X (mm)",
                        currentValue: triP1X,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setTriP1X,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">P1.X:</span>
                    <span>{triP1X.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Base P1 · Y (mm)",
                        currentValue: triP1Y,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setTriP1Y,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">P1.Y:</span>
                    <span>{triP1Y.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Diâmetro Base 1 Ø1 (mm)",
                        currentValue: triD1,
                        unit: "mm",
                        onConfirm: (v) => setTriD1(Math.max(0, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Ø1:</span>
                    <span>{triD1.toFixed(1)}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Base P2 · X (mm)",
                        currentValue: triP2X,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setTriP2X,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">P2.X:</span>
                    <span>{triP2X.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Base P2 · Y (mm)",
                        currentValue: triP2Y,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setTriP2Y,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">P2.Y:</span>
                    <span>{triP2Y.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Diâmetro Base 2 Ø2 (mm)",
                        currentValue: triD2,
                        unit: "mm",
                        onConfirm: (v) => setTriD2(Math.max(0, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Ø2:</span>
                    <span>{triD2.toFixed(1)}</span>
                  </button>
                </div>

                {/* Distâncias L1 e L2 + Modos */}
                <div className="grid grid-cols-2 gap-1">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Distância de P1 até Novo Furo (L1 mm)",
                          currentValue: triL1,
                          unit: "mm",
                          onConfirm: (v) => setTriL1(Math.max(0.1, v)),
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">L1:</span>
                      <span>{triL1.toFixed(2)} mm</span>
                    </button>
                    <select
                      value={triMode1}
                      onChange={(e) =>
                        setTriMode1(
                          e.target.value as "centro_a_centro" | "parede_a_parede" | "fora_a_fora",
                        )
                      }
                      className="rounded border border-[#293444] bg-[#151C27] px-1.5 py-0.5 text-[8.5px] text-[#94A3B8]"
                    >
                      <option value="centro_a_centro">L1: Centro a Centro</option>
                      <option value="parede_a_parede">L1: Parede a Parede</option>
                      <option value="fora_a_fora">L1: Fora a Fora</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Distância de P2 até Novo Furo (L2 mm)",
                          currentValue: triL2,
                          unit: "mm",
                          onConfirm: (v) => setTriL2(Math.max(0.1, v)),
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">L2:</span>
                      <span>{triL2.toFixed(2)} mm</span>
                    </button>
                    <select
                      value={triMode2}
                      onChange={(e) =>
                        setTriMode2(
                          e.target.value as "centro_a_centro" | "parede_a_parede" | "fora_a_fora",
                        )
                      }
                      className="rounded border border-[#293444] bg-[#151C27] px-1.5 py-0.5 text-[8.5px] text-[#94A3B8]"
                    >
                      <option value="centro_a_centro">L2: Centro a Centro</option>
                      <option value="parede_a_parede">L2: Parede a Parede</option>
                      <option value="fora_a_fora">L2: Fora a Fora</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9.5px] text-[#94A3B8]">Novo Furo Ø3:</span>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Diâmetro do 3º Furo Ø3 (mm)",
                        currentValue: triTargetD,
                        unit: "mm",
                        onConfirm: (v) => setTriTargetD(Math.max(0.5, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span>Ø {triTargetD.toFixed(2)} mm</span>
                  </button>
                </div>

                {/* Diagnóstico da Trilateração */}
                {!trilatEval.valid ? (
                  <div className="rounded-lg border border-rose-500/60 bg-rose-950/35 p-2 text-[9px] text-rose-200 flex items-start gap-1.5">
                    <AlertTriangle className="size-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-300">Trilateração Sem Solução</div>
                      <p>{trilatEval.message}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/25 p-2 text-[9.5px] flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setTriChosenBranch("A")}
                        className={cn(
                          "rounded-lg border p-1.5 text-left cursor-pointer",
                          triChosenBranch === "A"
                            ? "border-[#38BDF8] bg-[#38BDF8]/20 text-white"
                            : "border-[#293444] bg-[#0D121B] text-[#94A3B8]",
                        )}
                      >
                        <div className="text-[8.5px] font-bold text-[#38BDF8]">Solução A (+n)</div>
                        <div className="font-bold">
                          ({trilatEval.solutionA!.x.toFixed(2)}; {trilatEval.solutionA!.y.toFixed(2)})
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTriChosenBranch("B")}
                        className={cn(
                          "rounded-lg border p-1.5 text-left cursor-pointer",
                          triChosenBranch === "B"
                            ? "border-[#38BDF8] bg-[#38BDF8]/20 text-white"
                            : "border-[#293444] bg-[#0D121B] text-[#94A3B8]",
                        )}
                      >
                        <div className="text-[8.5px] font-bold text-[#38BDF8]">Solução B (−n)</div>
                        <div className="font-bold">
                          ({trilatEval.solutionB!.x.toFixed(2)}; {trilatEval.solutionB!.y.toFixed(2)})
                        </div>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const chosen =
                          triChosenBranch === "A" ? trilatEval.solutionA! : trilatEval.solutionB!;
                        const newEnts = buildHoleCadEntities(
                          chosen,
                          triTargetD,
                          "CALCULADO",
                          true,
                        );
                        commit((prev) => [...prev, ...newEnts]);
                        setSelection([newEnts[0]!.id]);
                        triggerHaptic("success");
                        toast.success(
                          `Furo Ø${triTargetD.toFixed(1)} inserido por Trilateração (Solução ${triChosenBranch}: ${chosen.x.toFixed(2)}; ${chosen.y.toFixed(2)}).`,
                        );
                      }}
                      className="w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 text-[10px] font-bold cursor-pointer"
                    >
                      <Check className="size-3.5" />
                      <span>Inserir Solução {triChosenBranch} no CAD</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 4.3 SUB-ABA: REDE DE MEDIDAS GAUSS–NEWTON (TESTE T5)          */}
            {/* ------------------------------------------------------------- */}
            {cat4Tab === "rede_lsq" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9.5px] font-bold text-[#38BDF8]">
                    Rede Gauss–Newton ({netNodes.length} furos · {netEdges.length} medidas)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      // Simula o cenário T5 com diagonal suspeita (+2 mm) para inspeção rápida
                      setNetEdges((prev) =>
                        prev.map((e, idx) =>
                          idx === 4 ? { ...e, readingMm: 118.62 } : e,
                        ),
                      );
                      toast.info("Simulado erro grosseiro de +2,0 mm na diagonal F1–F3.");
                    }}
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[8.5px] font-bold text-amber-300 cursor-pointer"
                    title="Testar detecção de medida suspeita (+2 mm na diagonal)"
                  >
                    Testar +2mm Diagonal
                  </button>
                </div>

                {/* Lista de Arestas Medidas com Edição no Teclado Numérico */}
                <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-0.5">
                  {netEdges.map((edge) => {
                    const resItem = networkEval?.edgeResiduals.find((r) => r.edgeId === edge.id);
                    const isSuspect = Boolean(resItem?.isSuspect);
                    return (
                      <div
                        key={edge.id}
                        className={cn(
                          "flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[9px]",
                          isSuspect
                            ? "border-rose-500 bg-rose-950/40 text-rose-200"
                            : "border-[#293444] bg-[#151C27]/80",
                        )}
                      >
                        <span className="font-bold">
                          {edge.fromId}↔{edge.toId}
                        </span>
                        <button
                          type="button"
                          onClick={(ev) =>
                            openKeypad(ev, {
                              label: `Distância ${edge.fromId} ↔ ${edge.toId} (mm)`,
                              currentValue: edge.readingMm,
                              unit: "mm",
                              onConfirm: (val) =>
                                setNetEdges((prev) =>
                                  prev.map((x) =>
                                    x.id === edge.id ? { ...x, readingMm: Math.max(0.5, val) } : x,
                                  ),
                                ),
                            })
                          }
                          className={numBtnClass}
                        >
                          <span>{edge.readingMm.toFixed(2)} mm</span>
                        </button>
                        {resItem && (
                          <span
                            className={cn(
                              "font-bold",
                              isSuspect ? "text-rose-400" : "text-emerald-400",
                            )}
                          >
                            r={resItem.residualMm >= 0 ? "+" : ""}
                            {resItem.residualMm.toFixed(2)}
                            {isSuspect ? " ⚠" : ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {networkEval && (
                  <div className="rounded-lg border border-[#293444] bg-[#0B0F14] p-2 text-[9px] flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase text-[#38BDF8]">
                        Estado: {networkEval.determinacy} (GL: {networkEval.degreesOfFreedom})
                      </span>
                      <span>RMS: {networkEval.rmsResidualMm.toFixed(3)} mm</span>
                    </div>
                    {networkEval.suspectEdgeId && (
                      <div className="text-rose-400 font-bold">
                        ⚠ Medida suspeita destacada: {networkEval.suspectEdgeId}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-[#293444]/50">
                      {networkEval.nodes.map((nd) => (
                        <div key={nd.id} className="text-[8.5px] text-[#94A3B8]">
                          <strong className="text-white">{nd.id}:</strong> ({nd.x.toFixed(2)};{" "}
                          {nd.y.toFixed(2)})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!networkEval || !networkEval.valid}
                  onClick={() => {
                    if (!networkEval) return;
                    const created: Entity[] = [];
                    for (const nd of networkEval.nodes) {
                      created.push(
                        ...buildHoleCadEntities(
                          { x: nd.x, y: nd.y },
                          nd.diameterMm,
                          "AJUSTADO",
                          true,
                        ),
                      );
                    }
                    commit((prev) => [...prev, ...created]);
                    triggerHaptic("success");
                    toast.success(
                      `${networkEval.nodes.length} furos da rede inseridos no CAD com estado AJUSTADO.`,
                    );
                  }}
                  className="w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 text-[10px] font-bold cursor-pointer"
                >
                  <Network className="size-3.5" />
                  <span>Inserir Rede Ajustada no CAD</span>
                </button>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 4.4 SUB-ABA: FECHAMENTO DE CADEIA DE COTAS (TESTE T6)         */}
            {/* ------------------------------------------------------------- */}
            {cat4Tab === "cadeia" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9.5px] text-[#94A3B8]">Cota Total Medida:</span>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Comprimento Total Medido da Cadeia (mm)",
                        currentValue: chainTotalMeasured,
                        unit: "mm",
                        onConfirm: (v) => setChainTotalMeasured(Math.max(0.1, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span>{chainTotalMeasured.toFixed(2)} mm</span>
                  </button>
                </div>

                {/* Chips das cotas parciais editáveis via Teclado Numérico */}
                <div className="flex flex-wrap gap-1">
                  {chainPartials.map((part, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#293444] bg-[#151C27] px-1.5 py-0.5 text-[9.5px]"
                    >
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: `Cota Parcial #${idx + 1} (mm)`,
                            currentValue: part,
                            unit: "mm",
                            onConfirm: (val) =>
                              setChainPartials((prev) =>
                                prev.map((x, i) => (i === idx ? Math.max(0.1, val) : x)),
                              ),
                          })
                        }
                        className="font-bold text-[#38BDF8] cursor-pointer"
                      >
                        {part.toFixed(1)}
                      </button>
                      {chainPartials.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setChainPartials((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: `Nova Cota Parcial #${chainPartials.length + 1} (mm)`,
                        currentValue: 20,
                        unit: "mm",
                        onConfirm: (val) =>
                          setChainPartials((prev) => [...prev, Math.max(0.1, val)]),
                      })
                    }
                    className="inline-flex items-center gap-0.5 rounded-lg border border-dashed border-[#38BDF8]/50 px-2 py-0.5 text-[9px] font-bold text-[#38BDF8] cursor-pointer"
                  >
                    <Plus className="size-3" /> Cota
                  </button>
                </div>

                {chainEval && (
                  <div
                    className={cn(
                      "rounded-lg border p-2 text-[9px] flex flex-col gap-1",
                      chainEval.hasClosureAlert && !chainEval.distributed
                        ? "border-amber-500/60 bg-amber-950/30 text-amber-200"
                        : "border-emerald-500/40 bg-emerald-950/20 text-emerald-200",
                    )}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>Soma: {chainEval.sumPartialsMm.toFixed(2)} mm</span>
                      <span>
                        Fecho: {chainEval.closureErrorMm >= 0 ? "+" : ""}
                        {chainEval.closureErrorMm.toFixed(2)} mm
                      </span>
                    </div>
                    <div className="text-[8.5px] opacity-90">
                      Acúmulo incerteza: Pior caso ±{chainEval.worstCaseStackToleranceMm.toFixed(2)}{" "}
                      mm · RSS ±{chainEval.rssStackToleranceMm.toFixed(2)} mm
                    </div>

                    {/* Botão explícito de distribuição de fechamento (Seção 5: só por ação explícita) */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#293444]/50">
                      <span className="text-[8.5px]">
                        Estado: <strong>{chainEval.infoStatus}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("action");
                          setChainDistribute((d) => !d);
                        }}
                        className={cn(
                          "rounded px-2 py-0.5 text-[8.5px] font-bold border cursor-pointer",
                          chainDistribute
                            ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                            : "border-amber-400/50 bg-amber-500/15 text-amber-200",
                        )}
                      >
                        {chainDistribute
                          ? "✓ Erro Distribuído (Desfazer)"
                          : "Distribuir Erro Proporcionalmente"}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!chainEval}
                  onClick={() => {
                    if (!chainEval) return;
                    const created: Entity[] = [];
                    for (const st of chainEval.steps) {
                      created.push(
                        ...buildHoleCadEntities(
                          { x: st.accumulatedFinalMm, y: 0 },
                          chainHoleDia,
                          chainEval.infoStatus,
                          false,
                        ),
                      );
                    }
                    commit((prev) => [...prev, ...created]);
                    triggerHaptic("success");
                    toast.success(
                      `${chainEval.steps.length} posições da cadeia geradas no eixo X (${chainEval.infoStatus}).`,
                    );
                  }}
                  className="w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 text-[10px] font-bold cursor-pointer"
                >
                  <GitCommitHorizontal className="size-3.5" />
                  <span>Gerar Furos da Cadeia no CAD</span>
                </button>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 4.5 SUB-ABA: CORDA + FLECHA (TESTE T7) E TABELA DE ORDENADAS  */}
            {/* ------------------------------------------------------------- */}
            {cat4Tab === "corda_ordenadas" && (
              <div className="flex flex-col gap-2.5">
                <div className="rounded-lg border border-[#293444] bg-[#151C27]/60 p-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-[9.5px] font-bold text-[#38BDF8]">
                    <Calculator className="size-3.5" />
                    <span>Calculadora Universal: Corda (c) + Flecha (f)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Corda do Arco c (mm)",
                          currentValue: csChord,
                          unit: "mm",
                          onConfirm: (v) => setCsChord(Math.max(0.1, v)),
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">Corda c:</span>
                      <span>{csChord.toFixed(2)} mm</span>
                    </button>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Flecha / Sagita f (mm)",
                          currentValue: csSagitta,
                          unit: "mm",
                          allowNegative: true,
                          onConfirm: setCsSagitta,
                        })
                      }
                      className={numBtnClass}
                    >
                      <span className="text-[8.5px] text-[#94A3B8]">Flecha f:</span>
                      <span>{csSagitta.toFixed(3)} mm</span>
                    </button>
                  </div>

                  {chordSagittaEval.valid ? (
                    <div className="rounded bg-[#0D121B] border border-emerald-500/40 p-1.5 text-[9px] flex flex-col gap-1">
                      <div className="flex items-center justify-between font-bold text-emerald-300">
                        <span>R = {chordSagittaEval.radiusMm.toFixed(2)} mm</span>
                        <span>Ø = {chordSagittaEval.diameterMm.toFixed(2)} mm</span>
                      </div>
                      <div className="text-[8.5px] text-[#94A3B8]">
                        {chordSagittaEval.formulaSummary}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const R = chordSagittaEval.radiusMm;
                          const f = chordSagittaEval.sagittaMm;
                          // Cria o arco centrado na origem com topo em y = 0
                          const cy = -(R - f);
                          const halfAngle = Math.asin(Math.min(1, csChord / (2 * R)));
                          const a0 = Math.PI / 2 - halfAngle;
                          const a1 = Math.PI / 2 + halfAngle;
                          const arcEnt: Entity = {
                            id: uid(),
                            layer: "corte",
                            type: "arc",
                            cx: 0,
                            cy: Number(cy.toFixed(4)),
                            r: Number(R.toFixed(4)),
                            a0: Number(a0.toFixed(6)),
                            a1: Number(a1.toFixed(6)),
                            params: {
                              revEngRole: "corte_externo",
                              revEngStatus: "CALCULADO",
                              chordMm: csChord,
                              sagittaMm: csSagitta,
                            },
                          };
                          commit((prev) => [...prev, arcEnt]);
                          setSelection([arcEnt.id]);
                          triggerHaptic("success");
                          toast.success(`Arco R${R.toFixed(2)} mm (CALCULADO) inserido no CAD.`);
                        }}
                        className="mt-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white py-1 text-[9.5px] font-bold cursor-pointer"
                      >
                        Inserir Arco R{chordSagittaEval.radiusMm.toFixed(1)} no CAD
                      </button>
                    </div>
                  ) : (
                    <div className="rounded bg-rose-950/40 border border-rose-500/50 p-1.5 text-[9px] text-rose-300 font-bold">
                      {chordSagittaEval.error}
                    </div>
                  )}
                </div>

                {/* Tabela de Ordenadas / Estações */}
                <div className="rounded-lg border border-[#293444] bg-[#151C27]/60 p-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-bold text-[#38BDF8]">
                      Tabela de Ordenadas (Estações)
                    </span>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Espaçamento das Estações Δs (mm)",
                          currentValue: ordSpacing,
                          unit: "mm",
                          onConfirm: (v) => setOrdSpacing(Math.max(1, v)),
                        })
                      }
                      className={numBtnClass}
                    >
                      <span>Δs = {ordSpacing.toFixed(1)} mm</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {ordOffsets.map((off, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: `Afastamento Y na Estação X=${(idx * ordSpacing).toFixed(0)} mm`,
                            currentValue: off,
                            unit: "mm",
                            allowNegative: true,
                            onConfirm: (val) =>
                              setOrdOffsets((prev) => prev.map((x, i) => (i === idx ? val : x))),
                          })
                        }
                        className="rounded border border-[#293444] bg-[#0D121B] px-1.5 py-0.5 text-[8.5px] text-[#E6EDF5] cursor-pointer"
                      >
                        <span className="text-[#94A3B8]">S{idx}:</span> {off.toFixed(1)}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const pts = generateOrdinateStationPoints({
                        origin: { x: 0, y: 0 },
                        axisAngleDeg: 0,
                        stationSpacingMm: ordSpacing,
                        offsetsMm: ordOffsets,
                      });
                      onChangeRevEng((prev) => ({
                        ...prev,
                        capturedPoints: [...prev.capturedPoints, ...pts],
                        activeCategory: "contorno_ajuste",
                        updatedAt: Date.now(),
                      }));
                      triggerHaptic("success");
                      toast.success(
                        `${pts.length} estações enviadas para Captura de Contorno (Seção 3).`,
                      );
                    }}
                    className="rounded-lg bg-[#38BDF8]/20 border border-[#38BDF8]/50 text-[#38BDF8] py-1 text-[9.5px] font-bold cursor-pointer"
                  >
                    Enviar {ordOffsets.length} Estações para Ajuste de Contorno
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* CATEGORIA 5: OLHAIS CONCÊNTRICOS E PONTES TANGENTES (TTR · T9)      */}
      {/* =================================================================== */}
      <div className={cardClass}>
        <button
          type="button"
          onClick={() => onToggleCategory("olhais_pontes")}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Compass className="size-3.5 text-[#E11D48]" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              5. Olhais e Pontes Tangentes (TTR)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8.5px] font-bold text-emerald-400">
              Ativo
            </span>
            {revEng.activeCategory === "olhais_pontes" ? (
              <ChevronDown className="size-3.5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="size-3.5 text-[#94A3B8]" />
            )}
          </div>
        </button>

        {revEng.activeCategory === "olhais_pontes" && (
          <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/60 pt-2">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setCat5Tab("olhal")}
                className={cn(
                  "rounded-lg py-1 text-[9.5px] font-bold border cursor-pointer",
                  cat5Tab === "olhal"
                    ? "border-[#E11D48] bg-[#E11D48] text-white"
                    : isDark
                      ? "border-[#293444] bg-[#151C27] text-[#94A3B8]"
                      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                )}
              >
                Olhal Concêntrico
              </button>
              <button
                type="button"
                onClick={() => setCat5Tab("ponte_ttr")}
                className={cn(
                  "rounded-lg py-1 text-[9.5px] font-bold border cursor-pointer",
                  cat5Tab === "ponte_ttr"
                    ? "border-[#E11D48] bg-[#E11D48] text-white"
                    : isDark
                      ? "border-[#293444] bg-[#151C27] text-[#94A3B8]"
                      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                )}
              >
                Ponte Tangente (TTR)
              </button>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 5.1 SUB-ABA: OLHAL CONCÊNTRICO (FURO + COLAR EXTERNO)         */}
            {/* ------------------------------------------------------------- */}
            {cat5Tab === "olhal" && (
              <div className="flex flex-col gap-2">
                {selectedCircles.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const c = selectedCircles[0]!;
                      setEyeCenterX(Number(c.cx.toFixed(2)));
                      setEyeCenterY(Number(c.cy.toFixed(2)));
                      setEyeHoleDia(Number((c.r * 2).toFixed(2)));
                      toast.success("Furo selecionado vinculado ao gerador de Olhal.");
                    }}
                    className="rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 py-1 px-2 text-[9.5px] font-bold text-[#38BDF8] cursor-pointer"
                  >
                    Vincular ao Furo Selecionado (Ø{(selectedCircles[0]!.r * 2).toFixed(1)} mm)
                  </button>
                )}

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Centro X do Olhal (mm)",
                        currentValue: eyeCenterX,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setEyeCenterX,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">X:</span>
                    <span>{eyeCenterX.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Centro Y do Olhal (mm)",
                        currentValue: eyeCenterY,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setEyeCenterY,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Y:</span>
                    <span>{eyeCenterY.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Diâmetro do Furo Interno Ø (mm)",
                        currentValue: eyeHoleDia,
                        unit: "mm",
                        onConfirm: (v) => setEyeHoleDia(Math.max(1, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Ø_furo:</span>
                    <span>{eyeHoleDia.toFixed(1)}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setEyeSizingMode("outer_radius")}
                    className={cn(
                      "rounded-lg py-1 text-[9px] font-bold border cursor-pointer",
                      eyeSizingMode === "outer_radius"
                        ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                        : "border-[#293444] text-[#94A3B8]",
                    )}
                  >
                    Por Raio Externo (R)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEyeSizingMode("wall_thickness")}
                    className={cn(
                      "rounded-lg py-1 text-[9px] font-bold border cursor-pointer",
                      eyeSizingMode === "wall_thickness"
                        ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                        : "border-[#293444] text-[#94A3B8]",
                    )}
                  >
                    Por Parede (R = r + e)
                  </button>
                </div>

                {eyeSizingMode === "outer_radius" ? (
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] text-[#94A3B8]">Raio Externo R:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(ev) =>
                          openKeypad(ev, {
                            label: "Raio Externo do Olhal R (mm)",
                            currentValue: eyeOuterR,
                            unit: "mm",
                            onConfirm: (v) => setEyeOuterR(Math.max(1, v)),
                          })
                        }
                        className={numBtnClass}
                      >
                        <span>R {eyeOuterR.toFixed(2)} mm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowEyeChordCalc((s) => !s)}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-1.5 py-1 text-[8.5px] font-bold text-amber-300 cursor-pointer"
                        title="Calcular Raio por Corda + Flecha"
                      >
                        📐 Corda+Flecha
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] text-[#94A3B8]">Parede Radial e:</span>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: "Parede Radial do Olhal e (mm)",
                          currentValue: eyeWallE,
                          unit: "mm",
                          onConfirm: (v) => setEyeWallE(Math.max(0.5, v)),
                        })
                      }
                      className={numBtnClass}
                    >
                      <span>e = {eyeWallE.toFixed(2)} mm</span>
                    </button>
                  </div>
                )}

                {showEyeChordCalc && chordSagittaEval.valid && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-1.5 text-[9px] flex items-center justify-between">
                    <span>
                      Corda {csChord} + Flecha {csSagitta} →{" "}
                      <strong>R = {chordSagittaEval.radiusMm.toFixed(2)} mm</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEyeSizingMode("outer_radius");
                        setEyeOuterR(Number(chordSagittaEval.radiusMm.toFixed(3)));
                        setShowEyeChordCalc(false);
                        toast.success(`Raio R=${chordSagittaEval.radiusMm.toFixed(2)} mm aplicado ao Olhal.`);
                      }}
                      className="rounded bg-amber-500 text-slate-950 px-2 py-0.5 font-bold cursor-pointer"
                    >
                      Usar R
                    </button>
                  </div>
                )}

                {eyeEval && (
                  <div
                    className={cn(
                      "rounded-lg border p-2 text-[9px]",
                      eyeEval.valid
                        ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-200"
                        : "border-rose-500/60 bg-rose-950/35 text-rose-200",
                    )}
                  >
                    <div className="font-bold">{eyeEval.summaryLabel}</div>
                    {eyeEval.errorMessage && (
                      <div className="text-rose-300 mt-0.5">{eyeEval.errorMessage}</div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!eyeEval || !eyeEval.valid}
                  onClick={() => {
                    if (!eyeEval || !eyeEval.valid) return;
                    commit((prev) => {
                      const hasHole = prev.some((e) => e.id === eyeEval.holeEntity.id);
                      const next = hasHole ? [...prev] : [...prev, eyeEval.holeEntity];
                      return [...next, eyeEval.outerEyeEntity, ...eyeEval.centerlineEntities];
                    });
                    setSelection([eyeEval.outerEyeEntity.id]);
                    triggerHaptic("success");
                    toast.success(`${eyeEval.summaryLabel} criado e vinculado no CAD.`);
                  }}
                  className={cn(
                    "w-full flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-bold cursor-pointer",
                    eyeEval?.valid
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed",
                  )}
                >
                  <Check className="size-3.5" />
                  <span>Criar Olhal Concêntrico no CAD</span>
                </button>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 5.2 SUB-ABA: PONTE TANGENTE TTR (TESTE T9) + APARAR OLHAIS    */}
            {/* ------------------------------------------------------------- */}
            {cat5Tab === "ponte_ttr" && (
              <div className="flex flex-col gap-2">
                {selectedCircles.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const c1 = selectedCircles[0]!;
                      const c2 = selectedCircles[1]!;
                      setBrC1X(Number(c1.cx.toFixed(2)));
                      setBrC1Y(Number(c1.cy.toFixed(2)));
                      setBrR1(Number(c1.r.toFixed(2)));
                      setBrC2X(Number(c2.cx.toFixed(2)));
                      setBrC2Y(Number(c2.cy.toFixed(2)));
                      setBrR2(Number(c2.r.toFixed(2)));
                      toast.success(
                        `Olhais R1=${c1.r.toFixed(1)} e R2=${c2.r.toFixed(1)} capturados da seleção.`,
                      );
                    }}
                    className="rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 py-1 px-2 text-[9.5px] font-bold text-[#38BDF8] cursor-pointer"
                  >
                    Usar 2 Círculos/Olhais Selecionados no Canvas
                  </button>
                )}

                {/* Olhal 1 e Olhal 2 */}
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Olhal 1 · Centro X1 (mm)",
                        currentValue: brC1X,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setBrC1X,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">X1:</span>
                    <span>{brC1X.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Olhal 1 · Centro Y1 (mm)",
                        currentValue: brC1Y,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setBrC1Y,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Y1:</span>
                    <span>{brC1Y.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Olhal 1 · Raio R1 (mm)",
                        currentValue: brR1,
                        unit: "mm",
                        onConfirm: (v) => setBrR1(Math.max(0.5, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">R1:</span>
                    <span>{brR1.toFixed(1)}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Olhal 2 · Centro X2 (mm)",
                        currentValue: brC2X,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setBrC2X,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">X2:</span>
                    <span>{brC2X.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Olhal 2 · Centro Y2 (mm)",
                        currentValue: brC2Y,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: setBrC2Y,
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">Y2:</span>
                    <span>{brC2Y.toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Olhal 2 · Raio R2 (mm)",
                        currentValue: brR2,
                        unit: "mm",
                        onConfirm: (v) => setBrR2(Math.max(0.5, v)),
                      })
                    }
                    className={numBtnClass}
                  >
                    <span className="text-[8.5px] text-[#94A3B8]">R2:</span>
                    <span>{brR2.toFixed(1)}</span>
                  </button>
                </div>

                {/* Seletor de Modo de Ponte Tangente (A, B, C, D) */}
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(TANGENT_BRIDGE_KIND_LABELS) as TangentBridgeKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBrKind(k)}
                      className={cn(
                        "rounded-lg px-1.5 py-1 text-[9px] font-bold border truncate cursor-pointer",
                        brKind === k
                          ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                          : isDark
                            ? "border-[#293444] bg-[#151C27] text-[#94A3B8]"
                            : "border-[#CBD5E1] bg-[#FFFFFF] text-[#475569]",
                      )}
                    >
                      {TANGENT_BRIDGE_KIND_LABELS[k].shortLabel}
                    </button>
                  ))}
                </div>

                {/* Campo de Raio R da Ponte + Botão [📐 Calcular por Corda + Flecha] */}
                {brKind !== "line_external" && brKind !== "line_internal" && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9.5px] text-[#94A3B8]">Raio da Ponte R:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(ev) =>
                            openKeypad(ev, {
                              label: "Raio da Ponte Tangente R (mm)",
                              currentValue: brRadius,
                              unit: "mm",
                              onConfirm: (v) => setBrRadius(Math.max(0.5, v)),
                            })
                          }
                          className={numBtnClass}
                        >
                          <span>R {brRadius.toFixed(2)} mm</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBrChordCalc((s) => !s)}
                          className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-1.5 py-1 text-[8.5px] font-bold text-amber-300 cursor-pointer"
                          title="Calcular Raio da Ponte por Corda + Flecha"
                        >
                          📐 Corda+Flecha
                        </button>
                      </div>
                    </div>

                    {showBrChordCalc && chordSagittaEval.valid && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-1.5 text-[9px] flex items-center justify-between">
                        <span>
                          c={csChord}, f={csSagitta} →{" "}
                          <strong>R = {chordSagittaEval.radiusMm.toFixed(2)} mm</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setBrRadius(Number(chordSagittaEval.radiusMm.toFixed(3)));
                            setShowBrChordCalc(false);
                            toast.success(
                              `Raio R=${chordSagittaEval.radiusMm.toFixed(2)} mm aplicado na Ponte Tangente.`,
                            );
                          }}
                          className="rounded bg-amber-500 text-slate-950 px-2 py-0.5 font-bold cursor-pointer"
                        >
                          Usar R
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Diagnóstico Analítico da Ponte Tangente */}
                {bridgeEval && !bridgeEval.valid && (
                  <div className="rounded-lg border border-rose-500/60 bg-rose-950/35 p-2 text-[9px] text-rose-200 flex flex-col gap-1.5">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="size-4 shrink-0 text-rose-400 mt-0.5" />
                      <div>{bridgeEval.reasonIfInvalid}</div>
                    </div>
                    {bridgeEval.suggestedRadiusMm && (
                      <button
                        type="button"
                        onClick={() => setBrRadius(bridgeEval.suggestedRadiusMm!)}
                        className="self-end rounded bg-rose-500/30 border border-rose-400 px-2 py-0.5 text-[8.5px] font-bold text-white cursor-pointer"
                      >
                        Aplicar R Mínimo Sugerido ({bridgeEval.suggestedRadiusMm.toFixed(1)} mm)
                      </button>
                    )}
                  </div>
                )}

                {bridgeEval && bridgeEval.valid && bridgeEval.solutions.length >= 2 && (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/25 p-2 text-[9px] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[8.5px] text-[#94A3B8]">
                      <span>D = {bridgeEval.centerDistanceMm.toFixed(2)} mm</span>
                      <span>
                        R_mín Cônc: {bridgeEval.minConcaveRadiusMm.toFixed(1)} · Conv:{" "}
                        {bridgeEval.minConvexRadiusMm.toFixed(1)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      {bridgeEval.solutions.map((sol) => (
                        <button
                          key={sol.branchId}
                          type="button"
                          onClick={() => {
                            setBrBranch(sol.branchId);
                            onSetFittedPreviewCandidate({
                              id: `bridge-prev-${sol.branchId}`,
                              kind: sol.bridgeEntity.type === "line" ? "line" : "arc",
                              pointsUsed: 2,
                              rmsMm: sol.tangencyErrorMm,
                              maxDeviationMm: sol.tangencyErrorMm,
                              entityPreview: sol.bridgeEntity,
                              summaryLabel: sol.label,
                              infoStatus: "CALCULADO",
                            });
                          }}
                          className={cn(
                            "rounded-lg border p-1.5 text-left cursor-pointer",
                            brBranch === sol.branchId
                              ? "border-[#38BDF8] bg-[#38BDF8]/20 text-white"
                              : "border-[#293444] bg-[#0D121B] text-[#94A3B8]",
                          )}
                        >
                          <div className="font-bold text-[#38BDF8]">Lado {sol.branchId}</div>
                          <div className="text-[8px]">
                            T1({sol.t1.x.toFixed(1)}; {sol.t1.y.toFixed(1)})
                          </div>
                          <div className="text-[8px]">
                            T2({sol.t2.x.toFixed(1)}; {sol.t2.y.toFixed(1)})
                          </div>
                        </button>
                      ))}
                    </div>

                    {(() => {
                      const activeSol =
                        bridgeEval.solutions.find((s) => s.branchId === brBranch) ??
                        bridgeEval.solutions[0]!;
                      return (
                        <div className="text-[8.5px] text-emerald-300 flex items-center justify-between">
                          <span>
                            {activeSol.arcCenter
                              ? `Cc: (${activeSol.arcCenter.x.toFixed(3)}; ${activeSol.arcCenter.y.toFixed(3)})`
                              : "Segmento reto tangente T1 → T2"}
                          </span>
                          <span>Erro tang.: {activeSol.tangencyErrorMm.toExponential(1)} mm</span>
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const activeSol =
                            bridgeEval.solutions.find((s) => s.branchId === brBranch) ??
                            bridgeEval.solutions[0]!;
                          // Se os olhais ainda não existem no canvas, cria-os junto com a ponte
                          const hasSelCircles = selectedCircles.length >= 2;
                          const newEntities: Entity[] = [];
                          if (!hasSelCircles) {
                            newEntities.push(
                              {
                                id: uid(),
                                layer: "corte",
                                type: "circle",
                                cx: brC1X,
                                cy: brC1Y,
                                r: brR1,
                                params: { revEngRole: "corte_externo", revEngStatus: "CALCULADO" },
                              },
                              {
                                id: uid(),
                                layer: "corte",
                                type: "circle",
                                cx: brC2X,
                                cy: brC2Y,
                                r: brR2,
                                params: { revEngRole: "corte_externo", revEngStatus: "CALCULADO" },
                              },
                            );
                          }
                          newEntities.push({
                            ...activeSol.bridgeEntity,
                            id: uid(),
                          });
                          commit((prev) => [...prev, ...newEntities]);
                          onSetFittedPreviewCandidate(null);
                          triggerHaptic("success");
                          toast.success(
                            `Ponte Tangente (${TANGENT_BRIDGE_KIND_LABELS[brKind].shortLabel} · Lado ${brBranch}) criada entre T1 e T2.`,
                          );
                        }}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 text-[9.5px] font-bold cursor-pointer"
                      >
                        <Check className="size-3.5" />
                        <span>Inserir Ponte (Lado {brBranch})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrimPreviewActive((p) => !p)}
                        className={cn(
                          "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold cursor-pointer",
                          trimPreviewActive
                            ? "border-amber-400 bg-amber-500/20 text-amber-200"
                            : "border-[#293444] bg-[#0D121B] text-[#94A3B8] hover:text-white",
                        )}
                        title="Aparar sobras internas dos olhais com prévia e preservação de construção"
                      >
                        <Scissors className="size-3" />
                        <span>Aparar Olhais</span>
                      </button>
                    </div>

                    {/* Prévia de Aparar Olhais (Seção 7: mostra partes removidas antes de confirmar) */}
                    {trimPreviewActive && bridgeEval.solutions.length >= 2 && (
                      <div className="mt-1 rounded-lg border border-amber-500/50 bg-amber-950/30 p-2 text-[9px] flex flex-col gap-1.5">
                        <div className="font-bold text-amber-300 flex items-center gap-1">
                          <Sparkles className="size-3.5" />
                          <span>Prévia de Apara dos Olhais (Lados A + B)</span>
                        </div>
                        <p className="text-[8.5px] text-amber-100/90">
                          Ao confirmar, os arcos internos entre T_A e T_B serão aparados para fechar o contorno externo, e os círculos originais serão preservados na camada Construção (restaurável por Undo).
                        </p>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setTrimPreviewActive(false)}
                            className="rounded border border-[#293444] bg-[#0D121B] px-2 py-1 text-[8.5px] text-[#94A3B8] cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const solA = bridgeEval.solutions[0]!;
                              const solB = bridgeEval.solutions[1]!;
                              const c1Ent: Extract<Entity, { type: "circle" }> =
                                selectedCircles[0] ?? {
                                  id: uid(),
                                  layer: "corte",
                                  type: "circle",
                                  cx: brC1X,
                                  cy: brC1Y,
                                  r: brR1,
                                };
                              const c2Ent: Extract<Entity, { type: "circle" }> =
                                selectedCircles[1] ?? {
                                  id: uid(),
                                  layer: "corte",
                                  type: "circle",
                                  cx: brC2X,
                                  cy: brC2Y,
                                  r: brR2,
                                };
                              const trim1 = computeEyeTrimPreview(c1Ent, solA.t1, solB.t1, {
                                x: brC2X,
                                y: brC2Y,
                              });
                              const trim2 = computeEyeTrimPreview(c2Ent, solA.t2, solB.t2, {
                                x: brC1X,
                                y: brC1Y,
                              });

                              commit((prev) => {
                                const filtered = prev.filter(
                                  (e) => e.id !== c1Ent.id && e.id !== c2Ent.id,
                                );
                                return [
                                  ...filtered,
                                  trim1.auxiliaryOriginalCircle,
                                  trim2.auxiliaryOriginalCircle,
                                  trim1.keptOuterArc,
                                  trim2.keptOuterArc,
                                  { ...solA.bridgeEntity, id: uid() },
                                  { ...solB.bridgeEntity, id: uid() },
                                ];
                              });
                              setTrimPreviewActive(false);
                              triggerHaptic("success");
                              toast.success(
                                "Olhais aparados e unidos pelas pontes A e B (círculos originais preservados em Construção · Undo disponível).",
                              );
                            }}
                            className="rounded bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-[9px] font-bold cursor-pointer"
                          >
                            Confirmar Apara + Fechar Contorno
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
