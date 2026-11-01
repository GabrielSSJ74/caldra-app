import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "@/lib/lab2d/chamferNotify";
import { cn } from "@/lib/utils";
import type { Entity } from "@/lib/lab2d/core";
import {
  REV_ENG_STATUS_META,
  type MeasurementRecord,
  type RevEngPlanData,
} from "@/lib/lab2d/revEngTypes";
import {
  applyControlledErrorFix,
  computeRealSizeOnScreenById1Card,
  detectRevEngGeometryErrors,
  evaluateConfidenceMap,
  evaluateRevEngComparator,
  generatePrintProof1to1Svg,
  type RevEngDetectedErrorItem,
} from "@/lib/lab2d/revEngVerification";
import {
  computeBendDevelopmentKFactor,
  exportRevEngSelectiveManufacturing,
  generateRevEngTechnicalDossier,
  parseAndExecuteRevEngIntent,
} from "@/lib/lab2d/revEngClosure";

export interface ChamferRevEngVerificationPanelProps {
  revEng: RevEngPlanData;
  onChangeRevEng: (updater: (prev: RevEngPlanData) => RevEngPlanData) => void;
  entities: Entity[];
  syncedMeasurements: MeasurementRecord[];
  commit: (nextEntities: Entity[], label?: string) => void;
  openKeypad: (
    e: React.MouseEvent,
    opts: {
      label: string;
      currentValue: number;
      unit?: "mm" | "°";
      allowNegative?: boolean;
      onConfirm: (val: number) => void;
    },
  ) => void;
  isDark: boolean;
}

type VerificationSubTab =
  | "erros_t15"
  | "comparador_t17"
  | "prova_1to1_t18"
  | "confianca"
  | "dossie_cnc_g";

export const ChamferRevEngVerificationPanel: React.FC<
  ChamferRevEngVerificationPanelProps
> = ({
  revEng,
  onChangeRevEng,
  entities,
  syncedMeasurements,
  commit,
  openKeypad,
  isDark,
}) => {
  const [subTab, setSubTab] = useState<VerificationSubTab>("erros_t15");
  const [severityFilter, setSeverityFilter] = useState<
    "todos" | "critico" | "aviso" | "sugestao"
  >("todos");

  // Estado de Caldeiraria / Dobra com Fator K (Seção 11.3 — Fase G)
  const [bendThicknessMm, setBendThicknessMm] = useState<number>(2.0);
  const [bendInnerRadiusMm, setBendInnerRadiusMm] = useState<number>(2.0);
  const [bendAngleDeg, setBendAngleDeg] = useState<number>(90);
  const [bendKFactor, setBendKFactor] = useState<number>(0.44);
  const [flange1OuterMm, setFlange1OuterMm] = useState<number>(50);
  const [flange2OuterMm, setFlange2OuterMm] = useState<number>(40);
  const [has3DConeTransition, setHas3DConeTransition] = useState<boolean>(false);

  const closingToleranceMm = revEng.closingToleranceMm ?? 2.0;
  const fabricationToleranceMm = revEng.fabricationToleranceMm ?? 0.15;
  const showConfidenceMap = revEng.showConfidenceMap ?? false;
  const id1CardWidthPx = revEng.id1CardWidthPx ?? 320;

  // 1. Auditoria de Erros Geométricos e Fechamento Controlado (Seção 13.1 & T15)
  const errorReport = useMemo(() => {
    return detectRevEngGeometryErrors({
      entities,
      measurements: syncedMeasurements,
      closingToleranceMm,
      fabricationToleranceMm,
    });
  }, [entities, syncedMeasurements, closingToleranceMm, fabricationToleranceMm]);

  const filteredErrors = useMemo(() => {
    if (severityFilter === "todos") return errorReport.items;
    return errorReport.items.filter((i) => i.severity === severityFilter);
  }, [errorReport.items, severityFilter]);

  // 2. Comparador Multi-Nível (Seção 13.2 & T17)
  const comparatorReport = useMemo(() => {
    return evaluateRevEngComparator({
      entities,
      measurements: syncedMeasurements,
      capturedPoints: revEng.capturedPoints,
      pointToleranceMm: fabricationToleranceMm,
    });
  }, [entities, syncedMeasurements, revEng.capturedPoints, fabricationToleranceMm]);

  // 3. Prova de Impressão 1:1 (Seção 13.3 & T18)
  const proof1to1 = useMemo(() => {
    return generatePrintProof1to1Svg({
      entities,
      partTitle: "PROVA 1:1 CHAMFER CAD",
      marginMm: 20,
    });
  }, [entities]);

  const id1ScreenCal = useMemo(() => {
    return computeRealSizeOnScreenById1Card(id1CardWidthPx);
  }, [id1CardWidthPx]);

  // 4. Mapa Visual Qualitativo de Confiança (Seção 13.4)
  const confidenceReport = useMemo(() => {
    return evaluateConfidenceMap({
      entities,
      measurements: syncedMeasurements,
      regions25D: revEng.regions25D ?? [],
      referenceImages: revEng.referenceImages,
    });
  }, [entities, syncedMeasurements, revEng.regions25D, revEng.referenceImages]);

  // 5. Fase G: Caldeiraria Fator K, Exportação Seletiva e Dossiê Técnico
  const bendDevelopment = useMemo(() => {
    return computeBendDevelopmentKFactor({
      thicknessMm: bendThicknessMm,
      innerRadiusMm: bendInnerRadiusMm,
      bendAngleDeg,
      kFactor: bendKFactor,
      flange1OuterMm,
      flange2OuterMm,
      stripWidthMm: 30,
      has3DTransitionConeOrReduction: has3DConeTransition,
    });
  }, [
    bendThicknessMm,
    bendInnerRadiusMm,
    bendAngleDeg,
    bendKFactor,
    flange1OuterMm,
    flange2OuterMm,
    has3DConeTransition,
  ]);

  const selectiveExport = useMemo(() => {
    return exportRevEngSelectiveManufacturing(entities, {
      includeCutLayer: true,
      includeBendLayer: true,
      includeMarkLayer: true,
      includeAuxiliaryRevEng: false,
    });
  }, [entities]);

  const handleApplySafeFix = (errItem: RevEngDetectedErrorItem) => {
    const res = applyControlledErrorFix({
      entities,
      errorItem: errItem,
    });
    if (res.applied) {
      commit(res.nextEntities, res.undoLabel);
      toast.success(`Correção aplicada: ${res.undoLabel} (Desfazer disponível).`);
    }
  };

  const handleInsertOpenContourDemoT15 = () => {
    const ts = Date.now();
    // Contorno quase fechado de 80 × 50 mm com lacuna de 0,85 mm no último vértice (Teste T15)
    const openPoly: Entity = {
      id: `t15-open-contour-${ts}`,
      type: "polyline",
      layer: "corte",
      closed: false,
      pts: [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 50 },
        { x: 0, y: 50 },
        { x: 0, y: 0.85 },
      ],
      params: { infoStatus: "MEDIDO", featureKind: "open_contour_t15" },
    };
    commit([...entities, openPoly], "Inserir Contorno Aberto com Lacuna 0,85mm (T15)");
  };

  const handleDownloadProof1to1Svg = () => {
    const blob = new Blob([proof1to1.svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chamfer_prova_1para1_100mm_${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Prova 1:1 (SVG) com barra de 100,000 mm exportada.");
  };

  const handleInsertDevelopedBend = () => {
    commit(
      [...entities, ...bendDevelopment.entities],
      `Inserir Chapa Planificada K=${bendKFactor.toFixed(2)} (L=${bendDevelopment.developedFlatLengthMm.toFixed(2)}mm)`,
    );
    toast.success(
      `Planificação inserida: L_plano = ${bendDevelopment.developedFlatLengthMm.toFixed(2)} mm (Camadas CORTE + DOBRA).`,
    );
  };

  const handleDownloadCleanDxf = () => {
    const blob = new Blob([selectiveExport.dxfContent], {
      type: "application/dxf;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chamfer_fabricacao_limpa_${Date.now()}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      `DXF exportado (${selectiveExport.exportedEntities.length} ent. fabricação; ${selectiveExport.excludedAuxiliaryCount} auxiliares excluídas).`,
    );
  };

  const handleDownloadDossierMd = () => {
    const dossier = generateRevEngTechnicalDossier({
      partName: "Peça Reconstruída — CHAMFER CAD",
      entities,
      revEng: {
        ...revEng,
        measurements: syncedMeasurements,
      },
    });
    const blob = new Blob([dossier.markdownReport], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossie_engenharia_reversa_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Dossiê Técnico completo (.MD) gerado com dados reais da peça.");
  };

  const handleExecuteT21IntentDemo = () => {
    const res = parseAndExecuteRevEngIntent(
      "Crie um olhal R20 no furo Ø20 e ligue com ponte côncava R120 ao olhal R35 do furo Ø30 a 132,4 mm",
      entities,
    );
    if (res.status === "ok" && res.entities.length > 0) {
      commit([...entities, ...res.entities], "CHAMFER INTENT (T21): Olhais + Ponte R120");
      toast.success(res.messagePtBr);
    } else {
      toast.error(res.clarificationQuestionPtBr ?? res.messagePtBr);
    }
  };

  return (
    <div className="mt-2.5 flex flex-col gap-2 border-t border-[#293444]/90 pt-2.5 text-[9.5px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileCheck2 className="size-3.5 text-emerald-400" />
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-300">
            Verificação, Prova 1:1, Caldeiraria & Dossiê (Fases F & G)
          </span>
        </div>
        <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300">
          F & G
        </span>
      </div>

      {/* Sub-abas das Fases F & G */}
      <div className="grid grid-cols-5 gap-1">
        {(
          [
            { id: "erros_t15" as const, label: `Erros (${errorReport.totalCount})` },
            { id: "comparador_t17" as const, label: "Comparador" },
            { id: "prova_1to1_t18" as const, label: "Prova 1:1" },
            { id: "confianca" as const, label: "Confiança" },
            { id: "dossie_cnc_g" as const, label: "Dossiê/CNC" },
          ] as const
        ).map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setSubTab(tb.id)}
            className={cn(
              "rounded-lg border px-1 py-1 text-[8px] font-bold transition-all cursor-pointer truncate text-center",
              subTab === tb.id
                ? "border-[#E11D48] bg-[#E11D48]/20 text-white"
                : isDark
                  ? "border-[#293444] bg-[#0D121B] text-[#94A3B8]"
                  : "border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* =================================================================== */}
      {/* SUB-ABA 1: DETECTOR DE ERROS E FECHAMENTO CONTROLADO (SEÇÃO 13.1/T15)*/}
      {/* =================================================================== */}
      {subTab === "erros_t15" && (
        <div className="flex flex-col gap-2">
          {/* Tolerâncias separadas: Fechamento Geométrico vs Fabricação */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={(ev) =>
                openKeypad(ev, {
                  label: "Tolerância de Fechamento de Contorno (mm)",
                  currentValue: closingToleranceMm,
                  unit: "mm",
                  onConfirm: (val) =>
                    onChangeRevEng((prev) => ({
                      ...prev,
                      closingToleranceMm: Math.max(0.05, val),
                      updatedAt: Date.now(),
                    })),
                })
              }
              className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
            >
              <div className="text-[7.5px] text-[#94A3B8]">Tol. Fechamento (T15)</div>
              <div className="font-mono text-[10px] font-bold text-[#38BDF8]">
                {closingToleranceMm.toFixed(2)} mm
              </div>
            </button>

            <button
              type="button"
              onClick={(ev) =>
                openKeypad(ev, {
                  label: "Tolerância Dimensional de Fabricação (mm)",
                  currentValue: fabricationToleranceMm,
                  unit: "mm",
                  onConfirm: (val) =>
                    onChangeRevEng((prev) => ({
                      ...prev,
                      fabricationToleranceMm: Math.max(0.01, val),
                      updatedAt: Date.now(),
                    })),
                })
              }
              className="rounded-lg border border-[#293444] bg-[#0D121B] p-1.5 text-left cursor-pointer"
            >
              <div className="text-[7.5px] text-[#94A3B8]">Tol. Fabricação</div>
              <div className="font-mono text-[10px] font-bold text-amber-300">
                ±{fabricationToleranceMm.toFixed(2)} mm
              </div>
            </button>
          </div>

          {/* Filtros por gravidade + botão de teste rápido T15 */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: "todos" as const, label: `Todos (${errorReport.totalCount})` },
                  { id: "critico" as const, label: `Crít (${errorReport.criticalCount})` },
                  { id: "aviso" as const, label: `Avisos (${errorReport.warningCount})` },
                  { id: "sugestao" as const, label: `Sug (${errorReport.suggestionCount})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSeverityFilter(f.id)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[7.5px] font-bold border cursor-pointer",
                    severityFilter === f.id
                      ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                      : "border-[#293444] text-[#94A3B8]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleInsertOpenContourDemoT15}
              className="rounded border border-amber-500/40 bg-amber-950/30 px-1.5 py-0.5 text-[7.5px] font-bold text-amber-300 cursor-pointer"
              title="Inserir polilinha aberta com lacuna de 0,85 mm para testar fechamento controlado e Undo (T15)"
            >
              + Caso T15
            </button>
          </div>

          {/* Lista de Ocorrências Detectadas */}
          {filteredErrors.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-2 text-[8.5px] text-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              <span>
                Nenhuma ocorrência pendente para o filtro selecionado. Contornos fechados e prontos para fabricação.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
              {filteredErrors.map((err) => (
                <div
                  key={err.id}
                  className={cn(
                    "rounded-lg border p-1.5 flex flex-col gap-1 text-[8.5px]",
                    err.severity === "critico"
                      ? "border-rose-500/50 bg-rose-950/30 text-rose-100"
                      : err.severity === "aviso"
                        ? "border-amber-500/50 bg-amber-950/25 text-amber-100"
                        : "border-purple-500/40 bg-purple-950/20 text-purple-100",
                  )}
                >
                  <div className="flex items-center justify-between gap-1 font-bold">
                    <span className="truncate">{err.title}</span>
                    <span className="uppercase text-[7.5px] px-1 py-0.2 rounded bg-black/30">
                      {err.severity}
                    </span>
                  </div>
                  <p className="text-[8px] opacity-90 leading-snug">{err.description}</p>
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    <span className="text-[7.5px] font-mono opacity-75">
                      Pos: ({err.location.x.toFixed(1)}; {err.location.y.toFixed(1)}) mm
                    </span>
                    {err.canApplySafeFix && (
                      <button
                        type="button"
                        onClick={() => handleApplySafeFix(err)}
                        className="flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[8px] font-bold cursor-pointer"
                      >
                        <Wrench className="size-2.5" />
                        <span>{err.possibleFixLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-ABA 2: COMPARADOR MEDIDO × DESENHADO E PONTO × GEOMETRIA (T17)  */}
      {/* =================================================================== */}
      {subTab === "comparador_t17" && (
        <div className="flex flex-col gap-2">
          {/* Bloco de Desvio Ponto Medido × Geometria (RMS, Médio, Máximo e Pior Ponto) */}
          <div className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[8px] font-bold text-[#94A3B8]">
              <span>DESVIO PONTOS CAPTURADOS × GEOMETRIA (T12/T17)</span>
              <span>{comparatorReport.pointCount} pts</span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="rounded bg-[#151C27] p-1">
                <div className="text-[7px] text-[#94A3B8]">RMS</div>
                <div className="font-mono font-bold text-[#38BDF8]">
                  {comparatorReport.rmsDeviationMm.toFixed(3)} mm
                </div>
              </div>
              <div className="rounded bg-[#151C27] p-1">
                <div className="text-[7px] text-[#94A3B8]">Médio</div>
                <div className="font-mono font-bold text-emerald-300">
                  {comparatorReport.meanDeviationMm.toFixed(3)} mm
                </div>
              </div>
              <div className="rounded bg-[#151C27] p-1">
                <div className="text-[7px] text-[#94A3B8]">Máximo</div>
                <div className="font-mono font-bold text-amber-300">
                  {comparatorReport.maxDeviationMm.toFixed(3)} mm
                </div>
              </div>
            </div>

            {comparatorReport.worstPoint && (
              <div className="text-[8px] font-mono text-amber-200 flex items-center justify-between border-t border-[#293444]/60 pt-1">
                <span>
                  Pior região: ({comparatorReport.worstPoint.point.x.toFixed(1)};{" "}
                  {comparatorReport.worstPoint.point.y.toFixed(1)}) mm
                </span>
                <strong>Δmáx = {comparatorReport.worstPoint.deviationMm.toFixed(3)} mm</strong>
              </div>
            )}
          </div>

          {/* Tabela Medido × Desenhado × Diferença */}
          <div className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[8px] font-bold text-[#94A3B8]">
              <span>TABELA MEDIDO × DESENHADO × DIFERENÇA (T17)</span>
              <span>
                {comparatorReport.compatibleMeasurementsCount} OK /{" "}
                {comparatorReport.divergentMeasurementsCount} Div
              </span>
            </div>

            {comparatorReport.measurementRows.length === 0 ? (
              <div className="text-[8px] text-[#94A3B8] py-2 text-center">
                Registre medições no Caderno (Categoria 2) para comparar com a geometria desenhada.
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                {comparatorReport.measurementRows.map((row) => (
                  <div
                    key={row.measurementId}
                    className={cn(
                      "rounded border px-1.5 py-1 text-[8px] flex items-center justify-between gap-1",
                      row.withinTolerance === false
                        ? "border-rose-500/50 bg-rose-950/25 text-rose-200"
                        : "border-[#293444] bg-[#151C27]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-[#38BDF8] mr-1">{row.code}</span>
                      <span className="truncate">{row.label}</span>
                    </div>
                    <div className="font-mono text-right shrink-0">
                      <span>Med: {row.measuredValue.toFixed(2)}</span>
                      {row.drawnValue !== null && (
                        <>
                          {" | "}
                          <span>CAD: {row.drawnValue.toFixed(2)}</span>
                          {" | "}
                          <strong
                            className={
                              row.withinTolerance === false ? "text-rose-400" : "text-emerald-400"
                            }
                          >
                            Δ {row.signedDiff! >= 0 ? "+" : ""}
                            {row.signedDiff!.toFixed(2)}
                          </strong>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-ABA 3: PROVA DE IMPRESSÃO 1:1 (T18) E TAMANHO REAL NA TELA      */}
      {/* =================================================================== */}
      {subTab === "prova_1to1_t18" && (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-2 flex flex-col gap-1.5 text-[8.5px]">
            <div className="font-bold text-emerald-300 flex items-center justify-between">
              <span>GABARITO DE PROVA 1:1 (TESTE T18)</span>
              <span className="font-mono">Barra = {proof1to1.verificationBarLengthMm.toFixed(3)} mm</span>
            </div>

            <div className="grid grid-cols-2 gap-1 font-mono text-[8px] bg-[#0D121B]/80 rounded p-1.5">
              <div>
                <div className="text-[#94A3B8]">Cruzes Canto (ΔX)</div>
                <div className="font-bold text-white">
                  {proof1to1.cornerCrossSpanXMm.toFixed(3)} mm
                </div>
              </div>
              <div>
                <div className="text-[#94A3B8]">Cruzes Canto (ΔY)</div>
                <div className="font-bold text-white">
                  {proof1to1.cornerCrossSpanYMm.toFixed(3)} mm
                </div>
              </div>
            </div>

            <p className="text-[8px] text-[#E6EDF5] leading-snug">
              {proof1to1.instructionsPtBr}
            </p>

            <button
              type="button"
              onClick={handleDownloadProof1to1Svg}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-2.5 text-[9px] font-bold cursor-pointer shadow-xs"
            >
              <Download className="size-3.5" />
              <span>Exportar Prova 1:1 (SVG com Barra 100,000 mm)</span>
            </button>
          </div>

          {/* Calibração "Tamanho Real na Tela" por Cartão ID-1 (85,60 × 53,98 mm) */}
          <div className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex flex-col gap-1.5 text-[8.5px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 font-bold text-[#38BDF8]">
                <CreditCard className="size-3.5" />
                <span>Tamanho Real na Tela (Cartão ID-1)</span>
              </div>
              <span className="font-mono text-[8px] text-[#94A3B8]">85,60 × 53,98 mm</span>
            </div>

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Largura do Cartão ID-1 na Tela (px)",
                    currentValue: id1CardWidthPx,
                    unit: "mm",
                    onConfirm: (val) =>
                      onChangeRevEng((prev) => ({
                        ...prev,
                        id1CardWidthPx: Math.max(80, Math.round(val)),
                        updatedAt: Date.now(),
                      })),
                  })
                }
                className="rounded border border-[#38BDF8]/50 bg-[#151C27] px-2 py-1 text-[8px] font-mono font-bold text-[#38BDF8] cursor-pointer"
              >
                Cartão: {id1CardWidthPx} px
              </button>

              <span className="font-mono text-[8px] text-emerald-300">
                {id1ScreenCal.pxPerMm.toFixed(2)} px/mm (~{id1ScreenCal.screenDpiEstimate.toFixed(0)}{" "}
                PPI)
              </span>
            </div>

            <div className="rounded bg-amber-950/40 border border-amber-500/30 p-1 text-[7.5px] text-amber-200 leading-tight">
              {id1ScreenCal.safetyWarningPtBr}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-ABA 4: MAPA VISUAL QUALITATIVO DE CONFIANÇA (SEÇÃO 13.4)        */}
      {/* =================================================================== */}
      {subTab === "confianca" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg border border-[#293444] bg-[#0D121B] p-1.5">
            <span className="text-[8.5px] font-bold">Mapa Visual de Confiança (Ocultável):</span>
            <button
              type="button"
              onClick={() =>
                onChangeRevEng((prev) => ({
                  ...prev,
                  showConfidenceMap: !showConfidenceMap,
                  updatedAt: Date.now(),
                }))
              }
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[8px] font-bold border cursor-pointer",
                showConfidenceMap
                  ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                  : "border-[#293444] bg-[#151C27] text-[#94A3B8]",
              )}
            >
              {showConfidenceMap ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
              <span>{showConfidenceMap ? "Visível" : "Oculto"}</span>
            </button>
          </div>

          {/* Contadores Qualitativos (Sem Porcentagem Arbitrária) */}
          <div className="grid grid-cols-3 gap-1 text-center text-[8px]">
            {(Object.keys(REV_ENG_STATUS_META) as Array<keyof typeof REV_ENG_STATUS_META>).map(
              (st) => {
                const count = confidenceReport.countsByStatus[st] ?? 0;
                const meta = REV_ENG_STATUS_META[st];
                return (
                  <div
                    key={st}
                    className="rounded border border-[#293444] bg-[#0D121B]/80 p-1 flex flex-col items-center"
                  >
                    <span className="text-[7px] font-bold" style={{ color: meta.strokeColor }}>
                      {meta.shortLabel}
                    </span>
                    <span className="font-mono font-bold text-white">{count} ent.</span>
                  </div>
                );
              },
            )}
          </div>

          <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
            {confidenceReport.entries.map((entry) => (
              <div
                key={entry.entityId}
                className="rounded border border-[#293444] bg-[#0D121B]/90 p-1.5 text-[8px] flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="truncate">{entry.entityId}</span>
                  <span
                    className="px-1.5 py-0.2 rounded text-[7.5px]"
                    style={{
                      backgroundColor: `${entry.strokeColorHex}22`,
                      color: entry.strokeColorHex,
                      border: `1px solid ${entry.strokeColorHex}66`,
                    }}
                  >
                    {entry.badgeLabel}
                  </span>
                </div>
                <div className="text-[7.5px] text-[#94A3B8]">{entry.criteriaJustification}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-ABA 5: FASE G — CALDEIRARIA (FATOR K), EXPORTAÇÃO & DOSSIÊ      */}
      {/* =================================================================== */}
      {subTab === "dossie_cnc_g" && (
        <div className="flex flex-col gap-2">
          {/* 1. Caldeiraria / Dobra com Fator K (Seção 11.3) */}
          <div className="rounded-lg border border-[#38BDF8]/40 bg-[#0D121B]/90 p-2 flex flex-col gap-1.5 text-[8px]">
            <div className="flex items-center justify-between font-bold text-[#38BDF8]">
              <span>CALDEIRARIA & DOBRA — FATOR K (SEÇÃO 11.3)</span>
              <span className="font-mono text-emerald-300">
                L_plano = {bendDevelopment.developedFlatLengthMm.toFixed(2)} mm
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Espessura da Chapa t (mm)",
                    currentValue: bendThicknessMm,
                    unit: "mm",
                    onConfirm: (v) => setBendThicknessMm(Math.max(0.2, v)),
                  })
                }
                className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
              >
                <div className="text-[7px] text-[#94A3B8]">Espessura t</div>
                <div className="font-mono font-bold text-white">
                  {bendThicknessMm.toFixed(2)} mm
                </div>
              </button>

              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Raio Interno de Dobra Ri (mm)",
                    currentValue: bendInnerRadiusMm,
                    unit: "mm",
                    onConfirm: (v) => setBendInnerRadiusMm(Math.max(0.1, v)),
                  })
                }
                className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
              >
                <div className="text-[7px] text-[#94A3B8]">Raio Int. Ri</div>
                <div className="font-mono font-bold text-white">
                  {bendInnerRadiusMm.toFixed(2)} mm
                </div>
              </button>

              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Fator K da Linha Neutra (0.10 a 0.90)",
                    currentValue: bendKFactor,
                    unit: "mm",
                    onConfirm: (v) => setBendKFactor(Math.max(0.1, Math.min(0.9, v))),
                  })
                }
                className="rounded border border-[#38BDF8]/50 bg-[#151C27] p-1 text-left cursor-pointer"
              >
                <div className="text-[7px] text-[#94A3B8]">Fator K</div>
                <div className="font-mono font-bold text-[#38BDF8]">
                  {bendKFactor.toFixed(2)}
                </div>
              </button>

              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Ângulo de Dobra α (°)",
                    currentValue: bendAngleDeg,
                    unit: "°",
                    onConfirm: (v) => setBendAngleDeg(Math.max(5, Math.min(175, v))),
                  })
                }
                className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
              >
                <div className="text-[7px] text-[#94A3B8]">Ângulo ∠</div>
                <div className="font-mono font-bold text-amber-300">
                  {bendAngleDeg.toFixed(1)}°
                </div>
              </button>

              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Comprimento Externo Aba 1 (mm)",
                    currentValue: flange1OuterMm,
                    unit: "mm",
                    onConfirm: (v) => setFlange1OuterMm(Math.max(5, v)),
                  })
                }
                className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
              >
                <div className="text-[7px] text-[#94A3B8]">Aba 1 (L1)</div>
                <div className="font-mono font-bold text-white">
                  {flange1OuterMm.toFixed(1)} mm
                </div>
              </button>

              <button
                type="button"
                onClick={(ev) =>
                  openKeypad(ev, {
                    label: "Comprimento Externo Aba 2 (mm)",
                    currentValue: flange2OuterMm,
                    unit: "mm",
                    onConfirm: (v) => setFlange2OuterMm(Math.max(5, v)),
                  })
                }
                className="rounded border border-[#293444] bg-[#151C27] p-1 text-left cursor-pointer"
              >
                <div className="text-[7px] text-[#94A3B8]">Aba 2 (L2)</div>
                <div className="font-mono font-bold text-white">
                  {flange2OuterMm.toFixed(1)} mm
                </div>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded bg-[#151C27]/80 p-1 font-mono text-[7.5px] text-center">
              <div>
                <span className="text-[#94A3B8]">BA: </span>
                <strong className="text-emerald-300">
                  {bendDevelopment.bendAllowanceMm.toFixed(2)}mm
                </strong>
              </div>
              <div>
                <span className="text-[#94A3B8]">BD: </span>
                <strong className="text-amber-300">
                  {bendDevelopment.bendDeductionMm.toFixed(2)}mm
                </strong>
              </div>
              <div>
                <span className="text-[#94A3B8]">Rn: </span>
                <strong className="text-[#38BDF8]">
                  {bendDevelopment.neutralRadiusMm.toFixed(2)}mm
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setHas3DConeTransition((p) => !p)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[7.5px] font-bold cursor-pointer",
                  has3DConeTransition
                    ? "border-amber-500/60 bg-amber-950/40 text-amber-300"
                    : "border-[#293444] bg-[#151C27] text-[#94A3B8]",
                )}
              >
                {has3DConeTransition ? "Transição 3D (Cone): SIM" : "Transição 3D: NÃO"}
              </button>

              <button
                type="button"
                onClick={handleInsertDevelopedBend}
                className="rounded bg-[#38BDF8] hover:bg-[#0284C7] text-slate-950 font-bold px-2 py-0.5 text-[8px] cursor-pointer"
              >
                + Inserir Planificação (CORTE + DOBRA)
              </button>
            </div>

            {bendDevelopment.transition3DWarningPtBr && (
              <div className="rounded border border-amber-500/50 bg-amber-950/30 p-1 text-[7.5px] text-amber-200 leading-tight">
                {bendDevelopment.transition3DWarningPtBr}
              </div>
            )}
          </div>

          {/* 2. Exportação Seletiva de Fabricação & Dossiê Técnico (Seção 11.5 & 14) */}
          <div className="rounded-lg border border-emerald-500/40 bg-[#0D121B]/90 p-2 flex flex-col gap-1.5 text-[8px]">
            <div className="flex items-center justify-between font-bold text-emerald-300">
              <span>EXPORTAÇÃO SELETIVA CNC & DOSSIÊ (SEÇÃO 11.5 / 14)</span>
              <span className="font-mono text-[7.5px]">
                {selectiveExport.exportedEntities.length} CNC /{" "}
                {selectiveExport.excludedAuxiliaryCount} Aux Excluídas
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 text-center font-mono text-[7.5px]">
              <div className="rounded bg-[#151C27] p-1">
                <div className="text-[#94A3B8]">CORTE</div>
                <div className="font-bold text-white">{selectiveExport.cutCount}</div>
              </div>
              <div className="rounded bg-[#151C27] p-1">
                <div className="text-[#94A3B8]">DOBRA</div>
                <div className="font-bold text-amber-300">{selectiveExport.bendCount}</div>
              </div>
              <div className="rounded bg-[#151C27] p-1">
                <div className="text-[#94A3B8]">MARCA</div>
                <div className="font-bold text-[#38BDF8]">{selectiveExport.markCount}</div>
              </div>
              <div className="rounded bg-rose-950/30 border border-rose-500/30 p-1">
                <div className="text-rose-300">AUX (BLOQ)</div>
                <div className="font-bold text-rose-300">
                  {selectiveExport.excludedAuxiliaryCount}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleDownloadCleanDxf}
                className="flex items-center justify-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-2 font-bold cursor-pointer"
              >
                <Download className="size-3" />
                <span>DXF Limpo (Sem Aux)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadDossierMd}
                className="flex items-center justify-center gap-1 rounded bg-[#E11D48] hover:bg-rose-600 text-white py-1.5 px-2 font-bold cursor-pointer"
              >
                <Download className="size-3" />
                <span>Dossiê Técnico (.MD)</span>
              </button>
            </div>

            <p className="text-[7px] text-[#94A3B8] leading-tight">
              {selectiveExport.parametricLossWarningPtBr}
            </p>
          </div>

          {/* 3. Integração CHAMFER INTENT Tipada (Seção 15 / Teste T21) */}
          <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-2 flex items-center justify-between gap-1.5 text-[8px]">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-purple-300">
                CHAMFER INTENT Tipado (Teste T21)
              </div>
              <div className="text-[7.5px] text-[#94A3B8] truncate">
                &ldquo;Crie um olhal R20 no furo Ø20 e ligue com ponte côncava R120 ao olhal R35...&rdquo;
              </div>
            </div>
            <button
              type="button"
              onClick={handleExecuteT21IntentDemo}
              className="flex items-center gap-1 rounded bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 font-bold shrink-0 cursor-pointer"
            >
              <Sparkles className="size-3" />
              <span>Executar T21</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
