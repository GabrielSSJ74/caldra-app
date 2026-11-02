import React from "react";
import { Box, Check, Lock, Unlock, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { Entity } from "@/lib/lab2d/core";
import {
  analyzeEntityBarGeometry,
  applyStructuralProfileToEntity,
  canEntityHaveStructuralProfile,
  findNearestStandardSquareSection,
  getCatalogItemsForProfileKind,
  getEntityStructuralProfile,
  STANDARD_METALON_SQUARE_SECTIONS_MM,
  STANDARD_METALON_WALL_THICKNESSES_MM,
  STRUCTURAL_PROFILE_KIND_META,
  type StructuralProfileAdaptationMode,
  type StructuralProfileKind,
} from "@/lib/lab2d/structuralProfile";
import { toast } from "@/lib/lab2d/chamferNotify";

interface ChamferStructuralProfileCardProps {
  entity?: Entity | null;
  entities?: Entity[];
  onUpdateEntity: (updated: Entity) => void;
  compact?: boolean;
}

const OTHER_BOM_PROFILES: StructuralProfileKind[] = [
  "metalon_retangular",
  "tubo_redondo",
  "cantoneira",
  "perfil_u",
  "barra_chata",
];

export function ChamferStructuralProfileCard({
  entity,
  entities,
  onUpdateEntity,
  compact = false,
}: ChamferStructuralProfileCardProps) {
  const targetEntities = React.useMemo(() => {
    if (entities && entities.length > 0) {
      return entities.filter(canEntityHaveStructuralProfile);
    }
    if (entity && canEntityHaveStructuralProfile(entity)) {
      return [entity];
    }
    return [];
  }, [entity, entities]);

  const primaryEntity = targetEntities[0] ?? null;
  const geom = React.useMemo(
    () => (primaryEntity ? analyzeEntityBarGeometry(primaryEntity) : null),
    [primaryEntity],
  );
  const activeProfile = React.useMemo(
    () => (primaryEntity ? getEntityStructuralProfile(primaryEntity) : null),
    [primaryEntity],
  );

  if (!primaryEntity || !geom) return null;

  const activeKind: StructuralProfileKind = activeProfile?.kind ?? "chapa_plana";
  const isProfileActive = activeKind !== "chapa_plana";
  const adaptationMode: StructuralProfileAdaptationMode =
    activeProfile?.adaptationMode ?? "auto_drawing";
  const lockDrawingWidth = activeProfile?.lockDrawingWidth ?? false;

  const currentB = activeProfile ? activeProfile.widthB : geom.drawnWidthB;
  const currentH = activeProfile ? activeProfile.heightH : geom.drawnWidthB;
  const currentE = activeProfile ? activeProfile.wallThicknessE : 2.0;
  const currentL = activeProfile ? activeProfile.lengthL : geom.lengthL;
  const currentWeightKg = activeProfile ? activeProfile.estimatedWeightKg : 0;
  const currentLinearKgM = activeProfile ? activeProfile.linearWeightKgM : 0;

  const applyToTargets = (
    options: Parameters<typeof applyStructuralProfileToEntity>[1],
    toastMessage?: string,
  ) => {
    triggerHaptic("selection");
    for (const ent of targetEntities) {
      const next = applyStructuralProfileToEntity(ent, options);
      onUpdateEntity(next);
    }
    if (toastMessage) {
      toast.success(toastMessage);
    }
  };

  const handleSelectKind = (kind: StructuralProfileKind) => {
    if (kind === "chapa_plana") {
      applyToTargets(
        { kind: "chapa_plana" },
        targetEntities.length > 1
          ? `✓ ${targetEntities.length} peças restauradas para Chapa Plana.`
          : "✓ Geometria restaurada para Chapa Plana.",
      );
      return;
    }

    if (kind === "metalon_quadrado") {
      const nextMode = activeProfile?.adaptationMode ?? "auto_drawing";
      const nextB =
        nextMode === "auto_drawing"
          ? geom.drawnWidthB
          : findNearestStandardSquareSection(geom.drawnWidthB);
      applyToTargets(
        {
          kind: "metalon_quadrado",
          adaptationMode: nextMode,
          widthB: nextB,
          heightH: nextB,
          wallThicknessE: currentE,
          lockDrawingWidth,
        },
        `⬜ Metalão Quadrado ${nextB}×${nextB}×${currentE.toFixed(2)}mm (${geom.lengthL.toFixed(0)}mm)`,
      );
      return;
    }

    // Demais perfis do Catálogo BOM
    const catalogList = getCatalogItemsForProfileKind(kind);
    const defaultItem = catalogList[0];
    if (defaultItem && adaptationMode === "bom_catalog") {
      applyToTargets(
        {
          kind,
          adaptationMode: "bom_catalog",
          catalogMaterialId: defaultItem.id,
          widthB: defaultItem.widthMm ?? defaultItem.diameterMm ?? geom.drawnWidthB,
          heightH: defaultItem.heightMm ?? defaultItem.diameterMm ?? geom.drawnWidthB,
          wallThicknessE: defaultItem.wallThicknessMm ?? 2.0,
          lockDrawingWidth,
        },
        `✓ ${STRUCTURAL_PROFILE_KIND_META[kind].shortLabel} aplicado (${defaultItem.dimensionsMm})`,
      );
    } else {
      applyToTargets(
        {
          kind,
          adaptationMode: "auto_drawing",
          widthB: geom.drawnWidthB,
          heightH: geom.drawnWidthB,
          wallThicknessE: currentE,
          lockDrawingWidth,
        },
        `✓ ${STRUCTURAL_PROFILE_KIND_META[kind].shortLabel} auto-adaptado (${geom.drawnWidthB}mm × L ${geom.lengthL.toFixed(0)}mm)`,
      );
    }
  };

  const handleSelectAdaptationMode = (mode: StructuralProfileAdaptationMode) => {
    if (!isProfileActive) return;
    if (mode === "auto_drawing") {
      applyToTargets(
        {
          kind: activeKind,
          adaptationMode: "auto_drawing",
          widthB: geom.drawnWidthB,
          heightH: geom.drawnWidthB,
          wallThicknessE: currentE,
          lockDrawingWidth,
        },
        `✓ Auto-adaptado ao desenho: ${geom.drawnWidthB}×${geom.drawnWidthB} mm (L=${geom.lengthL.toFixed(1)} mm)`,
      );
    } else {
      const nearestB = findNearestStandardSquareSection(geom.drawnWidthB);
      const catalogItems = getCatalogItemsForProfileKind(activeKind);
      const matchedItem =
        activeKind === "metalon_quadrado"
          ? catalogItems.find(
              (m) =>
                Math.abs((m.widthMm ?? 0) - nearestB) < 0.5 &&
                Math.abs((m.wallThicknessMm ?? 0) - currentE) < 0.25,
            ) ?? catalogItems.find((m) => Math.abs((m.widthMm ?? 0) - nearestB) < 0.5)
          : catalogItems[0];

      applyToTargets(
        {
          kind: activeKind,
          adaptationMode: "bom_catalog",
          catalogMaterialId: matchedItem?.id,
          widthB: matchedItem?.widthMm ?? matchedItem?.diameterMm ?? nearestB,
          heightH: matchedItem?.heightMm ?? matchedItem?.diameterMm ?? nearestB,
          wallThicknessE: matchedItem?.wallThicknessMm ?? currentE,
          lockDrawingWidth,
        },
        `✓ Catálogo BOM: ${matchedItem?.dimensionsMm ?? `${nearestB}×${nearestB} mm`}`,
      );
    }
  };

  const handleSelectSquareSectionB = (sideB: number) => {
    const catalogItems = getCatalogItemsForProfileKind("metalon_quadrado");
    const matched =
      catalogItems.find(
        (m) =>
          Math.abs((m.widthMm ?? 0) - sideB) < 0.4 &&
          Math.abs((m.wallThicknessMm ?? 0) - currentE) < 0.2,
      ) ?? catalogItems.find((m) => Math.abs((m.widthMm ?? 0) - sideB) < 0.4);

    applyToTargets(
      {
        kind: "metalon_quadrado",
        adaptationMode: "bom_catalog",
        catalogMaterialId: matched?.id,
        widthB: sideB,
        heightH: sideB,
        wallThicknessE: matched?.wallThicknessMm ?? currentE,
        lockDrawingWidth,
      },
      `⬜ Metalão Quadrado ${sideB}×${sideB}×${(matched?.wallThicknessMm ?? currentE).toFixed(2)} mm`,
    );
  };

  const handleSelectWallThickness = (wallE: number) => {
    const catalogItems = getCatalogItemsForProfileKind(activeKind);
    const matched = catalogItems.find(
      (m) =>
        Math.abs((m.widthMm ?? m.diameterMm ?? 0) - currentB) < 0.4 &&
        Math.abs((m.heightMm ?? m.diameterMm ?? 0) - currentH) < 0.4 &&
        Math.abs((m.wallThicknessMm ?? 0) - wallE) < 0.15,
    );

    applyToTargets({
      kind: activeKind,
      adaptationMode,
      catalogMaterialId: matched?.id,
      widthB: currentB,
      heightH: currentH,
      wallThicknessE: wallE,
      lockDrawingWidth,
    });
  };

  const handleSelectCatalogItem = (materialId: string) => {
    const catalogItems = getCatalogItemsForProfileKind(activeKind);
    const chosen = catalogItems.find((m) => m.id === materialId);
    if (!chosen) return;
    applyToTargets(
      {
        kind: activeKind,
        adaptationMode: "bom_catalog",
        catalogMaterialId: chosen.id,
        widthB: chosen.widthMm ?? chosen.diameterMm ?? currentB,
        heightH: chosen.heightMm ?? chosen.diameterMm ?? currentH,
        wallThicknessE: chosen.wallThicknessMm ?? currentE,
        lockDrawingWidth,
      },
      `✓ ${chosen.name} aplicado.`,
    );
  };

  const toggleLockDrawingWidth = () => {
    const nextLock = !lockDrawingWidth;
    applyToTargets({
      kind: activeKind,
      adaptationMode,
      catalogMaterialId: activeProfile?.catalogMaterialId,
      widthB: currentB,
      heightH: currentH,
      wallThicknessE: currentE,
      lockDrawingWidth: nextLock,
    });
  };

  const bFormatted = Number.isInteger(currentB) ? `${currentB}` : currentB.toFixed(1);
  const hFormatted = Number.isInteger(currentH) ? `${currentH}` : currentH.toFixed(1);
  const eFormatted = currentE.toFixed(2);

  const sectionSummaryText = (() => {
    if (activeKind === "metalon_quadrado") {
      return `Metalão Quadrado ${bFormatted} × ${bFormatted} × ${eFormatted} mm`;
    }
    if (activeKind === "metalon_retangular") {
      return `Metalão Retang. ${hFormatted} × ${bFormatted} × ${eFormatted} mm`;
    }
    if (activeKind === "tubo_redondo") {
      return `Tubo Redondo Ø${bFormatted} × ${eFormatted} mm`;
    }
    if (activeKind === "cantoneira") {
      return `Cantoneira ${bFormatted} × ${bFormatted} × ${eFormatted} mm`;
    }
    if (activeKind === "perfil_u") {
      return `Perfil U ${hFormatted} × ${bFormatted} × ${eFormatted} mm`;
    }
    if (activeKind === "barra_chata") {
      return `Barra Chata ${bFormatted} × ${eFormatted} mm`;
    }
    return "Chapa Plana (Padrão)";
  })();

  const catalogListForKind = getCatalogItemsForProfileKind(activeKind);

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors flex flex-col gap-2",
        isProfileActive
          ? "border-cyan-500/40 bg-slate-900/80 shadow-[0_0_18px_-6px_rgba(6,182,212,0.28)]"
          : "border-slate-800/80 bg-slate-900/60",
        compact ? "p-2" : "p-2.5",
      )}
    >
      {/* Cabeçalho do Cartão */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <Box
            className={cn(
              "size-3.5 shrink-0",
              isProfileActive ? "text-cyan-400" : "text-slate-400",
            )}
          />
          <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-slate-200">
            PERFIL ESTRUTURAL • BOM
          </span>
        </div>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider border",
            isProfileActive
              ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
              : "border-slate-700/80 bg-slate-800/70 text-slate-400",
          )}
        >
          {isProfileActive ? "TUBO 3D OCO" : "CHAPA 2D"}
        </span>
      </div>

      {/* 1. Seletor Principal: [ Chapa Plana (Padrão) ] vs [ Metalão Quadrado ] */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => handleSelectKind("chapa_plana")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-sans text-[10px] font-bold transition-all cursor-pointer",
            activeKind === "chapa_plana"
              ? "border-slate-600 bg-slate-800 text-white shadow-sm"
              : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200",
          )}
        >
          <span>▭</span>
          <span className="truncate">Chapa Plana (Padrão)</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectKind("metalon_quadrado")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-sans text-[10px] font-bold transition-all cursor-pointer",
            activeKind === "metalon_quadrado"
              ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200 shadow-sm"
              : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300",
          )}
        >
          <span>⬜</span>
          <span className="truncate">Metalão Quadrado</span>
        </button>
      </div>

      {/* Seletor Rápido para os Demais Perfis do Catálogo BOM */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
            Demais Perfis do Catálogo CORTE/BOM
          </span>
          <span className="font-mono text-[9px] text-slate-500">
            {geom.orientationLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {OTHER_BOM_PROFILES.map((kindKey) => {
            const meta = STRUCTURAL_PROFILE_KIND_META[kindKey];
            const selected = activeKind === kindKey;
            return (
              <button
                key={kindKey}
                type="button"
                onClick={() => handleSelectKind(kindKey)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[9px] font-semibold transition-all cursor-pointer",
                  selected
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200",
                )}
              >
                <span>{meta.symbol}</span>
                <span>{meta.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controles Avançados quando um Perfil Estrutural está ativo */}
      {isProfileActive && (
        <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/80">
          {/* 2. Modo de Adaptação (1-Toque): Auto-Adaptar ao Desenho vs Catálogo Padrão BOM */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
              Modo de Adaptação (1-Toque)
            </span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/90 p-1 border border-slate-800/90">
              <button
                type="button"
                onClick={() => handleSelectAdaptationMode("auto_drawing")}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md py-1 px-1.5 font-sans text-[10px] font-bold transition-all cursor-pointer",
                  adaptationMode === "auto_drawing"
                    ? "bg-cyan-500/25 text-cyan-200 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {adaptationMode === "auto_drawing" && <Check className="size-3 shrink-0" />}
                <span className="truncate">Auto-Adaptar ao Desenho</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAdaptationMode("bom_catalog")}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md py-1 px-1.5 font-sans text-[10px] font-bold transition-all cursor-pointer",
                  adaptationMode === "bom_catalog"
                    ? "bg-cyan-500/25 text-cyan-200 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {adaptationMode === "bom_catalog" && <Check className="size-3 shrink-0" />}
                <span className="truncate">Catálogo Padrão BOM</span>
              </button>
            </div>
          </div>

          {/* Seletor de Bitola Comercial quando em Catálogo Padrão BOM */}
          {adaptationMode === "bom_catalog" && (
            <div className="flex flex-col gap-1.5">
              {activeKind === "metalon_quadrado" ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                      Bitola Comercial (B × B mm)
                    </span>
                    <button
                      type="button"
                      onClick={toggleLockDrawingWidth}
                      title="Travar/Destravar largura original do desenho 2D"
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] border transition-colors cursor-pointer",
                        lockDrawingWidth
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                          : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {lockDrawingWidth ? (
                        <Lock className="size-2.5" />
                      ) : (
                        <Unlock className="size-2.5" />
                      )}
                      <span>Manter largura do desenho</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {STANDARD_METALON_SQUARE_SECTIONS_MM.filter((s) => s >= 20).map(
                      (sideMm) => {
                        const isSel = Math.abs(currentB - sideMm) < 0.4;
                        return (
                          <button
                            key={sideMm}
                            type="button"
                            onClick={() => handleSelectSquareSectionB(sideMm)}
                            className={cn(
                              "rounded-md border py-1 font-mono text-[9px] font-bold transition-all cursor-pointer",
                              isSel
                                ? "border-cyan-400 bg-cyan-500/25 text-cyan-200"
                                : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200",
                            )}
                          >
                            {sideMm}×{sideMm}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                      Perfil Comercial (Catálogo Costa Ferro)
                    </span>
                    <button
                      type="button"
                      onClick={toggleLockDrawingWidth}
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] border transition-colors cursor-pointer",
                        lockDrawingWidth
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                          : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {lockDrawingWidth ? (
                        <Lock className="size-2.5" />
                      ) : (
                        <Unlock className="size-2.5" />
                      )}
                      <span>Manter largura</span>
                    </button>
                  </div>
                  <select
                    value={
                      activeProfile?.catalogMaterialId ??
                      catalogListForKind[0]?.id ??
                      ""
                    }
                    onChange={(e) => handleSelectCatalogItem(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-[10px] text-white outline-none focus:border-cyan-500"
                  >
                    {catalogListForKind.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.dimensionsMm} — {item.linearWeightKgM?.toFixed(2)} kg/m
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Seletor de Espessura da Parede (e) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                Espessura da Parede (e)
              </span>
              <span className="font-mono text-[9px] font-bold text-cyan-300">
                {currentE.toFixed(2)} mm
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {STANDARD_METALON_WALL_THICKNESSES_MM.map((wallMm) => {
                const isWallSelected = Math.abs(currentE - wallMm) < 0.08;
                return (
                  <button
                    key={wallMm}
                    type="button"
                    onClick={() => handleSelectWallThickness(wallMm)}
                    className={cn(
                      "rounded-md border py-1 font-mono text-[9px] font-bold transition-all cursor-pointer",
                      isWallSelected
                        ? "border-cyan-400 bg-cyan-500/25 text-cyan-200"
                        : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200",
                    )}
                  >
                    {wallMm.toFixed(2)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Resumo Técnico em Tempo Real no Cartão */}
          <div className="rounded-lg border border-cyan-500/25 bg-slate-950/90 p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-[10px] text-slate-400">Seção:</span>
              <span className="font-mono text-[10px] font-bold text-cyan-300 text-right">
                {sectionSummaryText}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-[10px] text-slate-400">
                Comprimento (L):
              </span>
              <span className="font-mono text-[10px] font-bold text-white">
                {currentL.toFixed(2)} mm
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-[10px] text-slate-400">
                Peso estimado:
              </span>
              <span className="font-mono text-[10px] font-bold text-emerald-400">
                {currentWeightKg.toFixed(2)} kg{" "}
                <span className="text-[9px] font-normal text-slate-400">
                  ({currentLinearKgM.toFixed(2)} kg/m)
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
