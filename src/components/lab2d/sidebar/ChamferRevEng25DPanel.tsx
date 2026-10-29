import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Entity, LayerId } from "@/lib/lab2d/core";
import {
  REV_ENG_STATUS_META,
  REV_ENG_VIEW_TAG_LABELS,
  type ProjectionDihedralMode,
  type RevEngCategoryId,
  type RevEngConstraintKind,
  type RevEngCrossViewLink,
  type RevEngGeometricConstraint,
  type RevEngImageViewTag,
  type RevEngInfoStatus,
  type RevEngMaterialKey,
  type RevEngPlanData,
  type RevEngRegion25D,
  type RevEngRegion25DKind,
} from "@/lib/lab2d/revEngTypes";
import {
  compute25DVolumeAndMass,
  computeTechnicalSectionAA,
  evaluate25DConversionReadiness,
  evaluateConstraintSystemDOFAndConflicts,
  evaluateCrossViewConsistency,
  generateSectionAACadEntities,
  generateSyntheticCylinderStlAscii,
  parseStlAsciiMesh,
  REV_ENG_MATERIALS,
  REV_ENG_REGION_KIND_META,
  sliceStlMeshByPlaneZ,
  syncRegions25DFromEntities,
} from "@/lib/lab2d/revEng25D";

export interface ChamferRevEng25DPanelProps {
  revEng: RevEngPlanData;
  onChangeRevEng: (updater: (prev: RevEngPlanData) => RevEngPlanData) => void;
  entities: Entity[];
  selection: string[];
  commit: (nextEntities: Entity[], label?: string) => void;
  activeLayer: LayerId;
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
  onToggleCategory: (catId: RevEngCategoryId) => void;
  isDark: boolean;
}

type SubTab25D = "mapa_25d" | "corte_aa" | "vistas" | "restricoes_stl";

export const ChamferRevEng25DPanel: React.FC<ChamferRevEng25DPanelProps> = ({
  revEng,
  onChangeRevEng,
  entities,
  selection,
  commit,
  activeLayer,
  openKeypad,
  onToggleCategory,
  isDark,
}) => {
  const [subTab, setSubTab] = useState<SubTab25D>("mapa_25d");
  const stlInputRef = useRef<HTMLInputElement | null>(null);

  const baseThicknessMm = revEng.baseThicknessMm ?? 10;
  const baseThicknessStatus = revEng.baseThicknessStatus ?? "MEDIDO";
  const materialKey = revEng.materialKey ?? "aco_carbono";
  const weighedMassGrams = revEng.weighedMassGrams ?? null;
  const projectionDihedral = revEng.projectionDihedral ?? "1_diedro";
  const sectionLineAA = revEng.sectionLineAA ?? {
    id: "sec-aa-default",
    label: "A",
    p1: { x: -10, y: 25 },
    p2: { x: 110, y: 25 },
    sightDirection: "up" as const,
    enabled: true,
  };

  // Regiões 2.5D sincronizadas com as entidades atuais do canvas
  const syncedRegions = useMemo(() => {
    const manualRegions = revEng.regions25D ?? [];
    if (entities.length === 0 && manualRegions.length > 0) {
      return manualRegions;
    }
    return syncRegions25DFromEntities({
      entities,
      baseThicknessMm,
      baseThicknessStatus,
      existingRegions: manualRegions,
    });
  }, [entities, baseThicknessMm, baseThicknessStatus, revEng.regions25D]);

  // Relatório de Prontidão 3D e Bloqueio de Profundidades DESCONHECIDAS (T14)
  const readinessReport = useMemo(() => {
    return evaluate25DConversionReadiness({
      regions: syncedRegions,
      baseThicknessMm,
      baseThicknessStatus,
    });
  }, [syncedRegions, baseThicknessMm, baseThicknessStatus]);

  // Propriedades Analíticas de Volume Líquido e Massa (T12)
  const massProps = useMemo(() => {
    return compute25DVolumeAndMass({
      regions: syncedRegions,
      baseThicknessMm,
      materialKey,
      weighedMassGrams,
    });
  }, [syncedRegions, baseThicknessMm, materialKey, weighedMassGrams]);

  // Corte Técnico A–A ao vivo (Seção 10.2 & T12)
  const sectionAAResult = useMemo(() => {
    return computeTechnicalSectionAA({
      entities,
      regions: syncedRegions,
      baseThicknessMm,
      sectionLine: sectionLineAA,
    });
  }, [entities, syncedRegions, baseThicknessMm, sectionLineAA]);

  // Consistência entre Vistas Vinculadas (Seção 10.1 & T14)
  const crossViewReport = useMemo(() => {
    return evaluateCrossViewConsistency({
      links: revEng.crossViewLinks ?? [],
      projectionDihedral,
      referenceImages: revEng.referenceImages,
    });
  }, [revEng.crossViewLinks, projectionDihedral, revEng.referenceImages]);

  // Auditoria de Restrições Geométricas, Graus de Liberdade e Conflitos (Seção 12 & T16)
  const constraintAudit = useMemo(() => {
    return evaluateConstraintSystemDOFAndConflicts({
      entities,
      constraints: revEng.constraints ?? [],
    });
  }, [entities, revEng.constraints]);

  // Estado local para criação rápida de Vínculo entre Vistas
  const [newLinkViewA, setNewLinkViewA] = useState<RevEngImageViewTag>("frontal");
  const [newLinkValA, setNewLinkValA] = useState<number>(100);
  const [newLinkViewB, setNewLinkViewB] = useState<RevEngImageViewTag>("lateral");
  const [newLinkValB, setNewLinkValB] = useState<number>(100);
  const [newLinkTol, setNewLinkTol] = useState<number>(0.25);

  // Estado local para Restrições e Fatiador STL
  const [newConstraintKind, setNewConstraintKind] = useState<RevEngConstraintKind>("distancia");
  const [newConstraintValue, setNewConstraintValue] = useState<number>(50);
  const [stlSliceZMm, setStlSliceZMm] = useState<number>(10);
  const [stlStatusText, setStlStatusText] = useState<string | null>(null);

  const handleUpdateRegion = (regId: string, patch: Partial<RevEngRegion25D>) => {
    onChangeRevEng((prev) => {
      const baseList = syncRegions25DFromEntities({
        entities,
        baseThicknessMm: prev.baseThicknessMm ?? 10,
        baseThicknessStatus: prev.baseThicknessStatus ?? "MEDIDO",
        existingRegions: prev.regions25D ?? [],
      });
      const nextList = baseList.map((r) => (r.id === regId ? { ...r, ...patch } : r));
      return {
        ...prev,
        regions25D: nextList,
        updatedAt: Date.now(),
      };
    });
  };

  /**
   * Carrega o cenário canônico do Teste T12 (Chapa 100×50×10 mm + Rebaixo Cego 2000 mm² × 4 mm + 2 Furos Passantes Ø10 mm)
   */
  const handleLoadTestCaseT12 = () => {
    const ts = Date.now();
    const outerId = `t12-plate-${ts}`;
    const pocketId = `t12-pocket-${ts}`;
    const hole1Id = `t12-hole1-${ts}`;
    const hole2Id = `t12-hole2-${ts}`;

    const newEntities: Entity[] = [
      {
        id: outerId,
        type: "polyline",
        layer: "corte",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
        params: { infoStatus: "MEDIDO", featureKind: "corpo_base" },
      },
      {
        id: pocketId,
        type: "polyline",
        layer: "recorte",
        closed: true,
        // 50 × 40 mm = 2000 mm² centrado em (50, 25)
        pts: [
          { x: 25, y: 5 },
          { x: 75, y: 5 },
          { x: 75, y: 45 },
          { x: 25, y: 45 },
        ],
        params: { infoStatus: "MEDIDO", featureKind: "auto_pocket_2d" },
      },
      {
        id: hole1Id,
        type: "circle",
        layer: "corte",
        cx: 12,
        cy: 25,
        r: 5,
        params: { infoStatus: "MEDIDO", featureKind: "furo_passante" },
      },
      {
        id: hole2Id,
        type: "circle",
        layer: "corte",
        cx: 88,
        cy: 25,
        r: 5,
        params: { infoStatus: "MEDIDO", featureKind: "furo_passante" },
      },
    ];

    const newRegions: RevEngRegion25D[] = [
      {
        id: `reg25d-${outerId}`,
        entityId: outerId,
        label: "Chapa Base 100×50 mm",
        regionKind: "corpo_base",
        depthMm: 10,
        depthStatus: "MEDIDO",
        zStartMm: 0,
        areaMm2: 5000,
      },
      {
        id: `reg25d-${pocketId}`,
        entityId: pocketId,
        label: "Rebaixo Cego 50×40 mm (h=4mm)",
        regionKind: "rebaixo_cego",
        depthMm: 4,
        depthStatus: "MEDIDO",
        zStartMm: 0,
        areaMm2: 2000,
      },
      {
        id: `reg25d-${hole1Id}`,
        entityId: hole1Id,
        label: "Furo Passante Esq Ø10 mm",
        regionKind: "furo_passante",
        depthMm: 10,
        depthStatus: "MEDIDO",
        zStartMm: 0,
        areaMm2: Math.PI * 25,
      },
      {
        id: `reg25d-${hole2Id}`,
        entityId: hole2Id,
        label: "Furo Passante Dir Ø10 mm",
        regionKind: "furo_passante",
        depthMm: 10,
        depthStatus: "MEDIDO",
        zStartMm: 0,
        areaMm2: Math.PI * 25,
      },
    ];

    commit([...entities, ...newEntities], "Carregar Peça Padrão 2.5D (T12)");
    onChangeRevEng((prev) => ({
      ...prev,
      baseThicknessMm: 10,
      baseThicknessStatus: "MEDIDO",
      materialKey: "aluminio_6061",
      regions25D: newRegions,
      sectionLineAA: {
        id: "sec-aa-t12",
        label: "A",
        p1: { x: -5, y: 25 },
        p2: { x: 105, y: 25 },
        sightDirection: "up",
        enabled: true,
      },
      updatedAt: Date.now(),
    }));
  };

  const handleInsertSectionAAInCanvas = () => {
    if (sectionAAResult.intervals.length === 0) return;
    // Posicionar o Corte A–A 25 mm abaixo do limite inferior das entidades
    let maxY = 60;
    let minX = 0;
    for (const e of entities) {
      if (e.type === "polyline") {
        for (const p of e.pts) {
          if (p.y > maxY) maxY = p.y;
          if (p.x < minX) minX = p.x;
        }
      } else if (e.type === "circle") {
        if (e.cy + e.r > maxY) maxY = e.cy + e.r;
        if (e.cx - e.r < minX) minX = e.cx - e.r;
      }
    }

    const secEntities = generateSectionAACadEntities({
      sectionResult: sectionAAResult,
      placementOrigin: { x: minX, y: maxY + 25 },
      hatchPitchMm: 3.5,
      targetCutLayer: activeLayer || "corte",
    });

    commit([...entities, ...secEntities], "Inserir Vista de Corte A-A no Canvas");
  };

  const handleAddCrossViewLink = () => {
    const newLink: RevEngCrossViewLink = {
      id: `cvlink-${Date.now()}`,
      label: `Cota ${REV_ENG_VIEW_TAG_LABELS[newLinkViewA].split(" ")[0]} × ${REV_ENG_VIEW_TAG_LABELS[newLinkViewB].split(" ")[0]}`,
      dimensionKind: "largura_x",
      viewA: newLinkViewA,
      valueAMm: newLinkValA,
      viewB: newLinkViewB,
      valueBMm: newLinkValB,
      toleranceMm: newLinkTol,
      infoStatus: "MEDIDO",
    };
    onChangeRevEng((prev) => ({
      ...prev,
      crossViewLinks: [...(prev.crossViewLinks ?? []), newLink],
      updatedAt: Date.now(),
    }));
  };

  const handleAddConstraint = () => {
    const targetIds =
      selection.length > 0
        ? selection.slice(0, 2)
        : entities[0]
          ? [entities[0].id]
          : ["ent-demo-1"];

    const newC: RevEngGeometricConstraint = {
      id: `cstr-${Date.now()}`,
      kind: newConstraintKind,
      entityIds: targetIds,
      targetValueMmOrDeg:
        newConstraintKind === "distancia" ||
        newConstraintKind === "raio" ||
        newConstraintKind === "diametro" ||
        newConstraintKind === "angulo"
          ? newConstraintValue
          : undefined,
      toleranceMmOrDeg: 0.1,
      infoStatus: "MEDIDO",
    };

    onChangeRevEng((prev) => ({
      ...prev,
      constraints: [...(prev.constraints ?? []), newC],
      updatedAt: Date.now(),
    }));
  };

  const handleSliceSyntheticCylinderT20 = () => {
    const stlText = generateSyntheticCylinderStlAscii({
      diameterMm: 40,
      heightMm: 30,
      cx: 50,
      cy: 25,
      radialSegments: 72,
    });
    const mesh = parseStlAsciiMesh(stlText);
    const slice = sliceStlMeshByPlaneZ({
      triangles: mesh.triangles,
      zPlaneMm: stlSliceZMm,
      weldToleranceMm: 0.05,
      targetLayer: "construcao",
    });
    if (slice.entities.length > 0) {
      commit([...entities, ...slice.entities], `Fatiar Malha STL Cilindro Ø40 em Z=${stlSliceZMm}mm`);
    }
    const dEst = slice.estimatedCircle?.diameterMm ?? 0;
    setStlStatusText(
      `Malha STL (${mesh.triangles.length} triângulos) fatiada em Z = ${stlSliceZMm.toFixed(1)} mm → Ø estimado = ${dEst.toFixed(3)} mm (marcado ESTIMADO, sem converter em sólido).`,
    );
  };

  const handleImportStlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const mesh = parseStlAsciiMesh(text, 300000);
    const midZ = (mesh.boundsMin.z + mesh.boundsMax.z) * 0.5;
    const zUse = Number.isFinite(midZ) ? midZ : stlSliceZMm;
    const slice = sliceStlMeshByPlaneZ({
      triangles: mesh.triangles,
      zPlaneMm: zUse,
      weldToleranceMm: 0.05,
      targetLayer: "construcao",
    });
    if (slice.entities.length > 0) {
      commit([...entities, ...slice.entities], `Fatiar STL ${file.name} em Z=${zUse.toFixed(1)}mm`);
    }
    setStlStatusText(
      `${file.name}: ${mesh.triangles.length} triângulos fatiados em Z=${zUse.toFixed(1)}mm → ${slice.loops.length} polilinha(s) [ESTIMADO].`,
    );
    e.target.value = "";
  };

  const cardClass = cn(
    "rounded-xl border p-2.5 transition-colors",
    isDark
      ? "border-[#293444] bg-[#151C27] text-[#E6EDF5]"
      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#1E293B]",
  );

  const isOpen = revEng.activeCategory === "auditoria";

  return (
    <div className={cardClass}>
      <button
        type="button"
        onClick={() => onToggleCategory("auditoria")}
        className="flex w-full items-center justify-between text-left cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Box className="size-3.5 text-[#38BDF8]" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            8. Vistas, Mapa 2.5D, Corte A-A e Restrições
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[8px] font-bold uppercase border",
              readinessReport.canConvertTo3D
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/15 text-rose-300",
            )}
          >
            {readinessReport.canConvertTo3D ? "2.5D OK" : "BLOQ 3D"}
          </span>
          {isOpen ? (
            <ChevronDown className="size-3.5 text-[#94A3B8]" />
          ) : (
            <ChevronRight className="size-3.5 text-[#94A3B8]" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-[#293444]/80 pt-2.5 text-[9.5px]">
          {/* Seletor de Sub-Abas da Fase E */}
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: "mapa_25d" as const, label: "Mapa 2.5D" },
                { id: "corte_aa" as const, label: "Corte A-A" },
                { id: "vistas" as const, label: "Vistas 1º/3º" },
                { id: "restricoes_stl" as const, label: "DOF & STL" },
              ] as const
            ).map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setSubTab(tb.id)}
                className={cn(
                  "rounded-lg border px-1.5 py-1 text-[8.5px] font-bold transition-all cursor-pointer text-center truncate",
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

          {/* =============================================================== */}
          {/* SUB-ABA 1: MAPA DE PROFUNDIDADES 2.5D, VOLUME E MASSA (T12/T14) */}
          {/* =============================================================== */}
          {subTab === "mapa_25d" && (
            <div className="flex flex-col gap-2">
              {/* Espessura Global H e Status (MEDIDO vs DESCONHECIDO) */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={(ev) =>
                    openKeypad(ev, {
                      label: "Espessura Total da Peça (H)",
                      currentValue: baseThicknessMm,
                      unit: "mm",
                      onConfirm: (val) =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          baseThicknessMm: Math.max(0.2, val),
                          baseThicknessStatus: "MEDIDO",
                          updatedAt: Date.now(),
                        })),
                    })
                  }
                  className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                >
                  <div className="text-[7.5px] text-[#94A3B8]">Espessura Global (H)</div>
                  <div className="font-mono text-[10.5px] font-bold text-[#38BDF8]">
                    {baseThicknessStatus === "DESCONHECIDO"
                      ? "DESCONHECIDO"
                      : `${baseThicknessMm.toFixed(2)} mm`}
                  </div>
                </button>

                <div className="flex flex-col justify-between rounded-lg border border-[#293444] bg-[#0D121B] p-1.5">
                  <span className="text-[7.5px] text-[#94A3B8]">Estado da Espessura H</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          baseThicknessStatus: "MEDIDO",
                          updatedAt: Date.now(),
                        }))
                      }
                      className={cn(
                        "flex-1 rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer border",
                        baseThicknessStatus !== "DESCONHECIDO"
                          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                          : "border-[#293444] text-[#94A3B8]",
                      )}
                    >
                      MEDIDO
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          baseThicknessStatus: "DESCONHECIDO",
                          updatedAt: Date.now(),
                        }))
                      }
                      className={cn(
                        "flex-1 rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer border",
                        baseThicknessStatus === "DESCONHECIDO"
                          ? "border-rose-500/60 bg-rose-500/25 text-rose-300"
                          : "border-[#293444] text-[#94A3B8]",
                      )}
                    >
                      DESCONH.
                    </button>
                  </div>
                </div>
              </div>

              {/* Material e Massa Real na Balança (g) */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col rounded-lg border border-[#293444] bg-[#0D121B] p-1.5">
                  <span className="text-[7.5px] text-[#94A3B8]">Material / Densidade (ρ)</span>
                  <select
                    value={materialKey}
                    onChange={(e) =>
                      onChangeRevEng((prev) => ({
                        ...prev,
                        materialKey: e.target.value as RevEngMaterialKey,
                        updatedAt: Date.now(),
                      }))
                    }
                    className="mt-0.5 rounded bg-[#151C27] border border-[#293444] px-1 py-0.5 text-[8.5px] font-bold text-[#E6EDF5] outline-none"
                  >
                    {Object.values(REV_ENG_MATERIALS).map((mat) => (
                      <option key={mat.key} value={mat.key}>
                        {mat.shortLabel} ({mat.densityGPerCm3.toFixed(2)} g/cm³)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={(ev) =>
                    openKeypad(ev, {
                      label: "Massa Aferida na Balança (g) [0 = limpar]",
                      currentValue: weighedMassGrams ?? Math.round(massProps.estimatedMassGrams),
                      unit: "mm",
                      onConfirm: (val) =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          weighedMassGrams: val > 0 ? val : null,
                          updatedAt: Date.now(),
                        })),
                    })
                  }
                  className="rounded-lg border border-[#293444] bg-[#0D121B] p-1.5 text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[7.5px] text-[#94A3B8]">
                    <span>Balança Real (g)</span>
                    <Scale className="size-2.5 text-amber-400" />
                  </div>
                  <div className="font-mono text-[10px] font-bold text-amber-300">
                    {weighedMassGrams ? `${weighedMassGrams.toFixed(1)} g` : "Opcional (Toque)"}
                  </div>
                </button>
              </div>

              {/* Banner de Prontidão / Bloqueio 3D (Regra Crítica T14) */}
              <div
                className={cn(
                  "rounded-lg border p-2 flex items-start gap-1.5",
                  readinessReport.canConvertTo3D
                    ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-200"
                    : "border-rose-500/50 bg-rose-950/35 text-rose-200",
                )}
              >
                {readinessReport.canConvertTo3D ? (
                  <ShieldCheck className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <ShieldAlert className="size-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div className="flex-1 text-[8.5px] leading-snug">
                  <div className="font-bold">
                    {readinessReport.canConvertTo3D
                      ? "Extrusão CAD 3D e ISO 2D Liberada"
                      : "Conversão 3D Bloqueada (Nenhum Dado 3D Inventado)"}
                  </div>
                  <div>{readinessReport.summaryMessage}</div>
                </div>
              </div>

              {/* Resumo de Volume Líquido e Massa Estimada (Teste T12) */}
              <div className="rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex flex-col gap-1.5">
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-[7.5px] text-[#94A3B8]">Volume Bruto</div>
                    <div className="font-mono font-bold text-slate-300">
                      {(massProps.grossVolumeMm3 / 1000).toFixed(2)} cm³
                    </div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-[#94A3B8]">Volume Líquido</div>
                    <div className="font-mono font-bold text-[#38BDF8]">
                      {massProps.netVolumeCm3.toFixed(3)} cm³
                    </div>
                  </div>
                  <div>
                    <div className="text-[7.5px] text-[#94A3B8]">Massa Estimada</div>
                    <div className="font-mono font-bold text-emerald-300">
                      {massProps.estimatedMassGrams.toFixed(2)} g
                    </div>
                  </div>
                </div>

                {massProps.massDiscrepancyPercent !== null && (
                  <div
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[8px] font-mono flex items-center justify-between",
                      massProps.scaleCheckCompatible
                        ? "bg-emerald-950/50 text-emerald-300"
                        : "bg-amber-950/60 text-amber-300",
                    )}
                  >
                    <span>Conferência de Balança:</span>
                    <strong>
                      ΔM = {massProps.massDiscrepancyGrams! >= 0 ? "+" : ""}
                      {massProps.massDiscrepancyGrams!.toFixed(1)} g (
                      {massProps.massDiscrepancyPercent >= 0 ? "+" : ""}
                      {massProps.massDiscrepancyPercent.toFixed(1)}%)
                    </strong>
                  </div>
                )}
              </div>

              {/* Botões de Sincronizar e Carregar Caso T12 */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onChangeRevEng((prev) => ({
                      ...prev,
                      regions25D: syncRegions25DFromEntities({
                        entities,
                        baseThicknessMm,
                        baseThicknessStatus,
                        existingRegions: prev.regions25D ?? [],
                      }),
                      updatedAt: Date.now(),
                    }))
                  }
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-[#293444] bg-[#0D121B] hover:border-[#38BDF8] py-1 px-2 text-[8.5px] font-bold text-[#E6EDF5] cursor-pointer"
                >
                  <RefreshCw className="size-3 text-[#38BDF8]" />
                  <span>Sincronizar Canvas</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadTestCaseT12}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 py-1 px-2 text-[8.5px] font-bold text-emerald-300 cursor-pointer"
                  title="Inserir chapa 100×50×10 mm com rebaixo cego 2000 mm² × 4 mm e 2 furos passantes Ø10 mm"
                >
                  <Sparkles className="size-3" />
                  <span>Peça Padrão T12</span>
                </button>
              </div>

              {/* Lista de Regiões 2.5D Individuais */}
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                {syncedRegions.length === 0 ? (
                  <p className="text-[8.5px] text-[#94A3B8] text-center py-2">
                    Nenhum contorno fechado no canvas. Desenhe ou toque em "Peça Padrão T12" acima.
                  </p>
                ) : (
                  syncedRegions.map((reg) => {
                    const isUnknown = reg.depthStatus === "DESCONHECIDO" || reg.depthMm === null;
                    const isBlind =
                      reg.regionKind === "rebaixo_cego" ||
                      reg.regionKind === "furo_cego" ||
                      reg.regionKind === "alojamento" ||
                      reg.regionKind === "cavidade" ||
                      reg.regionKind === "rasgo";
                    const floorMm =
                      isBlind && reg.depthMm !== null ? baseThicknessMm - reg.depthMm : null;

                    return (
                      <div
                        key={reg.id}
                        className={cn(
                          "rounded-lg border p-1.5 flex flex-col gap-1",
                          isUnknown
                            ? "border-rose-500/50 bg-rose-950/20"
                            : "border-[#293444] bg-[#0D121B]/80",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-[9px] truncate">{reg.label}</span>
                          <span className="text-[8px] font-mono text-[#94A3B8] shrink-0">
                            {reg.areaMm2.toFixed(0)} mm²
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1">
                          <select
                            value={reg.regionKind}
                            onChange={(e) => {
                              const nextKind = e.target.value as RevEngRegion25DKind;
                              handleUpdateRegion(reg.id, {
                                regionKind: nextKind,
                                depthMm:
                                  nextKind === "corpo_base" || nextKind === "furo_passante"
                                    ? baseThicknessMm
                                    : reg.depthMm ?? Number((baseThicknessMm * 0.4).toFixed(2)),
                                depthStatus:
                                  nextKind === "superficie_oculta" ? "DESCONHECIDO" : reg.depthStatus,
                              });
                            }}
                            className="rounded border border-[#293444] bg-[#151C27] px-1 py-0.5 text-[8px] font-bold text-[#E6EDF5]"
                          >
                            {Object.entries(REV_ENG_REGION_KIND_META).map(([k, meta]) => (
                              <option key={k} value={k}>
                                {meta.shortLabel}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(ev) =>
                                openKeypad(ev, {
                                  label: `Profundidade Z de ${reg.label} (mm)`,
                                  currentValue: reg.depthMm ?? 4,
                                  unit: "mm",
                                  onConfirm: (val) =>
                                    handleUpdateRegion(reg.id, {
                                      depthMm: Math.max(0.1, val),
                                      depthStatus: "MEDIDO",
                                    }),
                                })
                              }
                              className="flex-1 rounded border border-[#38BDF8]/40 bg-[#151C27] px-1.5 py-0.5 text-[8px] font-mono font-bold text-[#38BDF8] text-left cursor-pointer truncate"
                            >
                              {isUnknown ? "Z: ?" : `Z: ${(reg.depthMm ?? 0).toFixed(1)}mm`}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRegion(reg.id, {
                                  depthStatus: isUnknown ? "MEDIDO" : "DESCONHECIDO",
                                  depthMm: isUnknown ? Math.min(4, baseThicknessMm * 0.5) : null,
                                })
                              }
                              className={cn(
                                "rounded px-1 py-0.5 text-[7.5px] font-bold border cursor-pointer",
                                isUnknown
                                  ? "border-rose-500/60 bg-rose-500/25 text-rose-300"
                                  : "border-emerald-500/50 bg-emerald-500/20 text-emerald-300",
                              )}
                              title="Alternar entre Profundidade Medida e Desconhecida (T14)"
                            >
                              {isUnknown ? "DESC" : "MED"}
                            </button>
                          </div>
                        </div>

                        {floorMm !== null && (
                          <div
                            className={cn(
                              "text-[8px] font-mono flex items-center justify-between",
                              floorMm <= 0
                                ? "text-rose-400 font-bold"
                                : floorMm < 1.0
                                  ? "text-amber-300"
                                  : "text-[#94A3B8]",
                            )}
                          >
                            <span>Fundo remanescente (e_fundo = H - h):</span>
                            <span>{floorMm.toFixed(2)} mm</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SUB-ABA 2: GERADOR DE CORTE TÉCNICO A–A AO VIVO (SEÇÃO 10.2/T12)*/}
          {/* =============================================================== */}
          {subTab === "corte_aa" && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={(ev) =>
                    openKeypad(ev, {
                      label: "Posição Y do Plano de Corte A–A (mm)",
                      currentValue: sectionLineAA.p1.y,
                      unit: "mm",
                      allowNegative: true,
                      onConfirm: (val) =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          sectionLineAA: {
                            ...(prev.sectionLineAA ?? sectionLineAA),
                            p1: { x: sectionLineAA.p1.x, y: val },
                            p2: { x: sectionLineAA.p2.x, y: val },
                          },
                          updatedAt: Date.now(),
                        })),
                    })
                  }
                  className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] p-1.5 text-left cursor-pointer"
                >
                  <div className="text-[7.5px] text-[#94A3B8]">Linha de Corte A–A (Y)</div>
                  <div className="font-mono text-[10px] font-bold text-[#38BDF8]">
                    Y = {sectionLineAA.p1.y.toFixed(1)} mm
                  </div>
                </button>

                <div className="rounded-lg border border-[#293444] bg-[#0D121B] p-1.5">
                  <div className="text-[7.5px] text-[#94A3B8]">Área Seccionada (A-A)</div>
                  <div className="font-mono text-[10px] font-bold text-emerald-300">
                    {sectionAAResult.crossSectionSolidAreaMm2.toFixed(1)} mm²
                  </div>
                </div>
              </div>

              {/* Prévia SVG Técnica do Corte A–A com Hachura 45° ANSI/ISO */}
              <div className="rounded-xl border border-[#293444] bg-[#0B0F14] p-2">
                <div className="flex items-center justify-between text-[8px] text-[#94A3B8] mb-1">
                  <span className="font-bold text-[#E6EDF5]">
                    PRÉVIA TÉCNICA — {sectionAAResult.sectionLabel} (H = {baseThicknessMm.toFixed(1)} mm)
                  </span>
                  <span>Hachura 45° ISO</span>
                </div>

                {sectionAAResult.partIntersectedWidthMm > 0 ? (
                  <svg
                    viewBox={`-10 -8 ${Math.max(60, sectionAAResult.partIntersectedWidthMm + 20)} ${Math.max(28, baseThicknessMm + 18)}`}
                    className="w-full h-28 rounded border border-[#1E293B] bg-[#10151D]"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <pattern
                        id="chamfer-iso-hatch-45"
                        width="4"
                        height="4"
                        patternTransform="rotate(45 0 0)"
                        patternUnits="userSpaceOnUse"
                      >
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="4"
                          stroke="#38BDF8"
                          strokeWidth="0.65"
                          strokeOpacity="0.75"
                        />
                      </pattern>
                    </defs>

                    {/* Intervalos do Corte A–A */}
                    {sectionAAResult.intervals.map((it, idx) => {
                      if (it.state === "vazio_externo") return null;
                      const x = it.sStartMm - sectionAAResult.partSpanStartMm;
                      const w = it.lengthMm;
                      const H = sectionAAResult.baseThicknessMm;
                      const ySolidTop = H - it.zTopMm;
                      const hSolid = it.solidHeightMm;

                      return (
                        <g key={idx}>
                          {/* Parede de fundo para furos passantes ou rebaixos cegos */}
                          {(it.state === "furo_passante" ||
                            it.state === "rebaixo_cego" ||
                            it.state === "furo_cego") && (
                            <rect
                              x={x}
                              y={0}
                              width={w}
                              height={H}
                              fill="rgba(15, 23, 42, 0.45)"
                              stroke="#64748B"
                              strokeWidth="0.45"
                              strokeDasharray={it.state === "furo_passante" ? "none" : "1.5 1"}
                            />
                          )}

                          {/* Material sólido cortado (com hachura 45°) */}
                          {hSolid > 0.01 && (
                            <rect
                              x={x}
                              y={ySolidTop}
                              width={w}
                              height={hSolid}
                              fill="url(#chamfer-iso-hatch-45)"
                              stroke="#F8FAFC"
                              strokeWidth="0.7"
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Linhas de centro nos furos */}
                    {sectionAAResult.holeAxes.map((ax, i) => {
                      const cx = ax.sCenterMm - sectionAAResult.partSpanStartMm;
                      return (
                        <line
                          key={i}
                          x1={cx}
                          y1={-3}
                          x2={cx}
                          y2={sectionAAResult.baseThicknessMm + 3}
                          stroke="#E11D48"
                          strokeWidth="0.55"
                          strokeDasharray="3 1.2 0.8 1.2"
                        />
                      );
                    })}
                  </svg>
                ) : (
                  <div className="text-[8.5px] text-[#94A3B8] text-center py-4">
                    A linha de corte Y = {sectionLineAA.p1.y.toFixed(1)} mm não intercepta regiões fechadas.
                  </div>
                )}

                {/* Tabela compacta de trechos do Corte A–A */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {sectionAAResult.intervals
                    .filter((i) => i.state !== "vazio_externo")
                    .map((it, idx) => (
                      <span
                        key={idx}
                        className="rounded border border-[#293444] bg-[#151C27] px-1.5 py-0.5 text-[7.5px] font-mono"
                      >
                        {it.state === "macico_hachurado"
                          ? `Maciço H=${it.solidHeightMm.toFixed(1)}`
                          : it.state === "rebaixo_cego"
                            ? `Rebaixo (fundo=${it.solidHeightMm.toFixed(1)}mm)`
                            : it.state === "furo_passante"
                              ? `Furo Passante (${it.lengthMm.toFixed(1)}mm)`
                              : `Furo Cego (fundo=${it.solidHeightMm.toFixed(1)}mm)`}
                      </span>
                    ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleInsertSectionAAInCanvas}
                disabled={sectionAAResult.partIntersectedWidthMm <= 0}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-40 text-white py-1.5 px-2.5 text-[9.5px] font-bold cursor-pointer shadow-xs"
              >
                <Scissors className="size-3.5" />
                <span>Inserir Vista de Corte A–A no Canvas 2D</span>
              </button>
            </div>
          )}

          {/* =============================================================== */}
          {/* SUB-ABA 3: VISTAS VINCULADAS (1º / 3º DIEDRO) E CONSISTÊNCIA    */}
          {/* =============================================================== */}
          {subTab === "vistas" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1 rounded-lg border border-[#293444] bg-[#0D121B] p-1.5">
                <span className="text-[8.5px] font-bold text-[#94A3B8]">Método de Projeção:</span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: "1_diedro" as const, label: "1º Diedro (ISO-E)" },
                      { id: "3_diedro" as const, label: "3º Diedro (ISO-A)" },
                    ] as const
                  ).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          projectionDihedral: d.id,
                          updatedAt: Date.now(),
                        }))
                      }
                      className={cn(
                        "rounded px-2 py-0.5 text-[8px] font-bold border cursor-pointer",
                        projectionDihedral === d.id
                          ? "border-[#38BDF8] bg-[#38BDF8]/20 text-[#38BDF8]"
                          : "border-[#293444] text-[#94A3B8]",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Novo Vínculo Dimensional entre duas Vistas */}
              <div className="rounded-lg border border-[#293444] bg-[#0D121B]/80 p-2 flex flex-col gap-1.5">
                <div className="text-[8px] font-bold uppercase text-[#94A3B8]">
                  Vincular Cota Comum Entre 2 Vistas (Teste T14)
                </div>

                <div className="grid grid-cols-2 gap-1">
                  <div className="flex items-center gap-1">
                    <select
                      value={newLinkViewA}
                      onChange={(e) => setNewLinkViewA(e.target.value as RevEngImageViewTag)}
                      className="flex-1 rounded border border-[#293444] bg-[#151C27] px-1 py-0.5 text-[8px] text-[#E6EDF5]"
                    >
                      {Object.entries(REV_ENG_VIEW_TAG_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl.split(" ")[0]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: `Cota na Vista ${newLinkViewA.toUpperCase()} (mm)`,
                          currentValue: newLinkValA,
                          unit: "mm",
                          onConfirm: (val) => setNewLinkValA(Math.max(0.1, val)),
                        })
                      }
                      className="rounded border border-[#38BDF8]/40 bg-[#151C27] px-1.5 py-0.5 text-[8px] font-mono font-bold text-[#38BDF8] cursor-pointer"
                    >
                      {newLinkValA.toFixed(1)}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <select
                      value={newLinkViewB}
                      onChange={(e) => setNewLinkViewB(e.target.value as RevEngImageViewTag)}
                      className="flex-1 rounded border border-[#293444] bg-[#151C27] px-1 py-0.5 text-[8px] text-[#E6EDF5]"
                    >
                      {Object.entries(REV_ENG_VIEW_TAG_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl.split(" ")[0]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={(ev) =>
                        openKeypad(ev, {
                          label: `Cota na Vista ${newLinkViewB.toUpperCase()} (mm)`,
                          currentValue: newLinkValB,
                          unit: "mm",
                          onConfirm: (val) => setNewLinkValB(Math.max(0.1, val)),
                        })
                      }
                      className="rounded border border-[#38BDF8]/40 bg-[#151C27] px-1.5 py-0.5 text-[8px] font-mono font-bold text-[#38BDF8] cursor-pointer"
                    >
                      {newLinkValB.toFixed(1)}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Tolerância entre Vistas (± mm)",
                        currentValue: newLinkTol,
                        unit: "mm",
                        onConfirm: (val) => setNewLinkTol(Math.max(0.02, val)),
                      })
                    }
                    className="rounded border border-[#293444] bg-[#151C27] px-2 py-0.5 text-[8px] font-mono text-[#94A3B8] cursor-pointer"
                  >
                    Tol: ±{newLinkTol.toFixed(2)} mm
                  </button>

                  <button
                    type="button"
                    onClick={handleAddCrossViewLink}
                    className="flex items-center gap-1 rounded bg-[#38BDF8]/20 border border-[#38BDF8]/50 px-2 py-0.5 text-[8.5px] font-bold text-[#38BDF8] cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>Vincular Vistas</span>
                  </button>
                </div>
              </div>

              {/* Lista de Vínculos e Diagnóstico de Inconsistência */}
              {crossViewReport.items.map((item) => (
                <div
                  key={item.link.id}
                  className={cn(
                    "rounded-lg border p-1.5 text-[8.5px] flex items-center justify-between gap-1",
                    item.compatible
                      ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
                      : "border-rose-500/50 bg-rose-950/30 text-rose-200",
                  )}
                >
                  <div className="flex-1">
                    <div className="font-bold">{item.link.label}</div>
                    <div>{item.diagnosticMessage}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeRevEng((prev) => ({
                        ...prev,
                        crossViewLinks: (prev.crossViewLinks ?? []).filter(
                          (x) => x.id !== item.link.id,
                        ),
                      }))
                    }
                    className="text-rose-400 p-0.5 cursor-pointer"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}

              {crossViewReport.ambiguityWarnings.map((w, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-1.5 text-[8px] text-amber-200 flex items-start gap-1"
                >
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* =============================================================== */}
          {/* SUB-ABA 4: RESTRIÇÕES, DOF (T16) E FATIADOR DE MALHA STL (T20)  */}
          {/* =============================================================== */}
          {subTab === "restricoes_stl" && (
            <div className="flex flex-col gap-2">
              {/* Resumo de Graus de Liberdade (DOF) e Conflito Dimensional (T16) */}
              <div
                className={cn(
                  "rounded-lg border p-2 flex flex-col gap-1",
                  constraintAudit.systemState === "sobredeterminado_conflito"
                    ? "border-rose-500/60 bg-rose-950/30 text-rose-200"
                    : constraintAudit.systemState === "determinado"
                      ? "border-emerald-500/50 bg-emerald-950/25 text-emerald-200"
                      : "border-[#293444] bg-[#0D121B] text-[#E6EDF5]",
                )}
              >
                <div className="flex items-center justify-between font-bold text-[9px]">
                  <span>Estado do Esboço (Seção 12 / T16)</span>
                  <span className="font-mono text-[8px]">
                    DOF Livre: {constraintAudit.remainingDof}/{constraintAudit.totalEntitiesDof}
                  </span>
                </div>
                <div className="text-[8px] opacity-90">{constraintAudit.summaryText}</div>
              </div>

              {/* Adicionar Restrição */}
              <div className="flex items-center gap-1">
                <select
                  value={newConstraintKind}
                  onChange={(e) => setNewConstraintKind(e.target.value as RevEngConstraintKind)}
                  className="flex-1 rounded-lg border border-[#293444] bg-[#0D121B] px-1.5 py-1 text-[8.5px] font-bold text-[#E6EDF5]"
                >
                  <option value="horizontal">Horizontal (0°)</option>
                  <option value="vertical">Vertical (90°)</option>
                  <option value="paralelo">Paralelo (//)</option>
                  <option value="perpendicular">Perpendicular (⊥)</option>
                  <option value="concentrico">Concêntrico (◎)</option>
                  <option value="tangente">Tangente</option>
                  <option value="igual">Igual (=)</option>
                  <option value="simetrico">Simétrico</option>
                  <option value="distancia">Distância (mm)</option>
                  <option value="raio">Raio R (mm)</option>
                  <option value="diametro">Diâmetro Ø (mm)</option>
                  <option value="angulo">Ângulo (°)</option>
                  <option value="origem_ancorada">Ancorar Origem (0,0)</option>
                </select>

                {(newConstraintKind === "distancia" ||
                  newConstraintKind === "raio" ||
                  newConstraintKind === "diametro" ||
                  newConstraintKind === "angulo") && (
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: `Valor da Restrição (${newConstraintKind})`,
                        currentValue: newConstraintValue,
                        unit: newConstraintKind === "angulo" ? "°" : "mm",
                        onConfirm: (val) => setNewConstraintValue(val),
                      })
                    }
                    className="rounded-lg border border-[#38BDF8]/50 bg-[#0D121B] px-2 py-1 text-[8.5px] font-mono font-bold text-[#38BDF8] cursor-pointer"
                  >
                    {newConstraintValue.toFixed(1)}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddConstraint}
                  className="rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white px-2 py-1 text-[8.5px] font-bold cursor-pointer"
                >
                  + Restr.
                </button>
              </div>

              {/* Lista de Conflitos Detectados (Teste T16) */}
              {constraintAudit.conflicts.map((cf) => (
                <div
                  key={cf.id}
                  className="rounded-lg border border-rose-500/60 bg-rose-950/35 p-1.5 text-[8px] text-rose-200 flex flex-col gap-1"
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>⚠️ Conflito Dimensional / Geométrico</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeRevEng((prev) => ({
                          ...prev,
                          constraints: (prev.constraints ?? []).filter(
                            (c) => c.id !== cf.involvedConstraintIds[cf.involvedConstraintIds.length - 1],
                          ),
                        }))
                      }
                      className="rounded bg-rose-600 text-white px-1.5 py-0.5 text-[7.5px] font-bold cursor-pointer"
                    >
                      Remover Conflitante
                    </button>
                  </div>
                  <div>{cf.message}</div>
                  <div className="text-emerald-300">{cf.safeResolutionSuggestion}</div>
                </div>
              ))}

              {/* Fatiador Opcional de Malha de Scanner STL por Plano Z (Seção 10.6 & T20) */}
              <div className="mt-1 rounded-lg border border-[#293444] bg-[#0D121B]/90 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8.5px] font-bold uppercase text-amber-300">
                    Fatiador de Malha STL por Plano Z (T20)
                  </span>
                  <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[7.5px] font-bold text-amber-300">
                    ESTIMADO
                  </span>
                </div>

                <input
                  ref={stlInputRef}
                  type="file"
                  accept=".stl"
                  onChange={handleImportStlFile}
                  className="hidden"
                />

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(ev) =>
                      openKeypad(ev, {
                        label: "Altura do Plano de Corte Z (mm)",
                        currentValue: stlSliceZMm,
                        unit: "mm",
                        allowNegative: true,
                        onConfirm: (val) => setStlSliceZMm(val),
                      })
                    }
                    className="rounded border border-[#38BDF8]/40 bg-[#151C27] px-2 py-1 text-[8px] font-mono font-bold text-[#38BDF8] cursor-pointer"
                  >
                    Plano Z = {stlSliceZMm.toFixed(1)} mm
                  </button>

                  <button
                    type="button"
                    onClick={() => stlInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1 rounded border border-[#293444] bg-[#151C27] hover:border-[#38BDF8] py-1 px-1.5 text-[8px] font-bold text-[#E6EDF5] cursor-pointer"
                  >
                    <Upload className="size-2.5" />
                    <span>Importar .STL</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSliceSyntheticCylinderT20}
                    className="rounded bg-amber-600/80 hover:bg-amber-500 text-white py-1 px-2 text-[8px] font-bold cursor-pointer"
                    title="Fatiar cilindro STL Ø40 mm para validar o Teste T20"
                  >
                    Fatiar Ø40 (T20)
                  </button>
                </div>

                {stlStatusText && (
                  <div className="text-[8px] text-amber-200 bg-amber-950/30 border border-amber-500/30 rounded p-1">
                    {stlStatusText}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
