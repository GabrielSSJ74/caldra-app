/**
 * CALDRA CHAMFER — BARRA COMPACTA DE REFERÊNCIA EM 2 MODOS (⚓ ÂNCORA X',Y' vs. 📍 MARCOS A–E)
 *                  + SUB-BARRAS EM TEMPO REAL (60 FPS) + MINI-CHIP CONCLUÍDO DISCRETO
 *
 * Implementa:
 *  1. Pílula dupla de alternância de modo: `[ ⚓ Âncora X',Y' | 📍 Marcos A–E ]`
 *  2. Modo 1 (`⚓ Âncora`): `Ciclar | Alinhar ∠ | Guias | Eco | Radar` + remoção individual `×`
 *  3. Modo 2 (`📍 Marcos A–E`): Slots em ordem alfabética fixa `[A ×] [B ×] ... [+]`,
 *     `Ponto Médio (A–B)`, `Divisor ÷N (Em Tempo Real)`, `Alinhar Âncora por A–B`, `Cotar A–B` e `Tabela (CSV)`
 *  4. Botão verde compacto `[ ✓ Concluir ]` + Botão `[ 🗑️ Limpar ]`
 *  5. Quando concluído: Mini-Chip Flutuante Discreto no canto superior esquerdo:
 *     `[ ⚓ Âncora Ativa (X',Y') | ÷4 | ✎ Editar | × Remover ]`
 */

import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Compass,
  Grid,
  Divide,
  Radar,
  Copy,
  Table2,
  Trash2,
  Anchor,
  MapPin,
  Download,
  Check,
  Plus,
  X,
  Pencil,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import {
  type AnchorLabel,
  type ConstructionGuideKind,
  type EchoMode,
  type GeometricAnchor,
  type ReferenceServiceState,
  type ReferenceToolMode,
  ANCHOR_LABELS,
  ReferenceService,
  anchorWorldToLocal,
  isValidFiniteVec2,
} from "@/lib/lab2d/referenceService";

export interface ChamferGeometricAnchorBarProps {
  visible: boolean;
  /** true quando o modo de captura/edição da ferramenta de referência está aberto */
  isEditingReference?: boolean;
  referenceState: ReferenceServiceState;
  entities: Entity[];
  selectedIds: string[];
  cursor?: Vec2;
  workspaceBounds?: { x: number; y: number; w: number; h: number };
  isDark: boolean;
  onConcludeReference?: () => void;
  onEditReference?: () => void;
  onClearAll?: () => void;
  onCycleAnchor: () => void;
  onSetAnchorAngle: (thetaDeg: number) => void;
  onOpenCustomAngleKeypad?: (currentAngle: number, screenPos: { x: number; y: number }) => void;
  onOpenCustomDivisionKeypad?: (currentN: number, screenPos: { x: number; y: number }) => void;
  onAddGuide: (
    kind: ConstructionGuideKind,
    options?: { angleDeg?: number; offsetMm?: number },
  ) => void;
  onMidpointAB: () => void;
  onAlignAxisAB: () => void;
  onDivideSpanAB: (divN: number) => void;
  onDimensionAB: () => void;
  onToggleRadar: () => void;
  onSetEchoMode: (mode: EchoMode) => void;
  onCommitEchoEntities: () => void;
  onGenerateTable: (exportCsv: boolean) => void;
  onProgressiveClear: () => void;
  onUseActiveAnchorInTool: (anchor: GeometricAnchor) => void;
}

export const ChamferGeometricAnchorBar: React.FC<ChamferGeometricAnchorBarProps> = ({
  visible,
  isEditingReference = true,
  referenceState,
  entities,
  cursor,
  workspaceBounds = { x: 0, y: 0, w: 1500, h: 1000 },
  isDark,
  onConcludeReference,
  onEditReference,
  onClearAll,
  onCycleAnchor,
  onSetAnchorAngle,
  onMidpointAB,
  onAlignAxisAB,
  onDivideSpanAB,
  onDimensionAB,
  onToggleRadar,
  onSetEchoMode,
  onCommitEchoEntities,
  onGenerateTable,
  onProgressiveClear,
  onUseActiveAnchorInTool,
}) => {
  const [openSubMenu, setOpenSubMenu] = useState<
    "align" | "guides" | "divisor" | "echo" | "table" | null
  >(null);
  const [editingCustomN, setEditingCustomN] = useState(false);
  const [customNInput, setCustomNInput] = useState("4");
  const [editingCustomAngle, setEditingCustomAngle] = useState(false);
  const [customAngleInput, setCustomAngleInput] = useState("0");
  const [editingCustomOffset, setEditingCustomOffset] = useState(false);
  const [customOffsetInput, setCustomOffsetInput] = useState("25");

  const mode: ReferenceToolMode = referenceState.referenceMode ?? "anchor";
  const localAnchor =
    referenceState.localAnchor && isValidFiniteVec2(referenceState.localAnchor.origin)
      ? referenceState.localAnchor
      : null;
  const landmarks = (referenceState.landmarks ?? []).filter(
    (l) => l && isValidFiniteVec2(l.origin),
  );
  const activeSpanDivision = referenceState.spanDivision ?? null;
  const midpointAB = referenceState.midpointAB ?? null;

  const hasAnyActiveReference = Boolean(
    localAnchor ||
      landmarks.length > 0 ||
      referenceState.guides.length > 0 ||
      activeSpanDivision ||
      midpointAB,
  );

  useEffect(() => {
    if (activeSpanDivision) {
      setCustomNInput(String(activeSpanDivision.divisionsN));
    }
  }, [activeSpanDivision?.divisionsN]);

  if (!visible && !hasAnyActiveReference) return null;

  const activeAnchor =
    localAnchor ??
    landmarks.find((a) => a.id === referenceState.activeLandmarkId) ??
    landmarks[landmarks.length - 1] ??
    null;

  const pairMetrics =
    landmarks.length >= 2 ? ReferenceService.computeAnchorPairMetrics() : null;

  const radarData =
    referenceState.radarEnabled && activeAnchor
      ? ReferenceService.computeEdgeRadar(entities, workspaceBounds, activeAnchor)
      : null;

  const handleModeSwitch = (nextMode: ReferenceToolMode) => {
    triggerHaptic("selection");
    ReferenceService.setReferenceMode(nextMode);
    if (nextMode === "anchor" && (openSubMenu === "divisor" || openSubMenu === "table")) {
      setOpenSubMenu(null);
    }
    if (nextMode === "landmarks" && (openSubMenu === "guides" || openSubMenu === "echo")) {
      setOpenSubMenu(null);
    }
  };

  const toggleSub = (menu: "align" | "guides" | "divisor" | "echo" | "table") => {
    triggerHaptic("selection");
    setOpenSubMenu((prev) => {
      const next = prev === menu ? null : menu;
      if (next === "divisor" && landmarks.length >= 2 && !activeSpanDivision) {
        onDivideSpanAB(4);
      }
      if (next === "guides" && activeAnchor) {
        const hasLivePar = referenceState.guides.some((g) => g.kind === "parallel_offset");
        if (!hasLivePar) {
          ReferenceService.setParallelGuideOffsetLive(
            referenceState.parallelGuideOffsetMm ?? 25,
            entities,
          );
        }
      }
      return next;
    });
  };

  const handleClearAllNow = () => {
    triggerHaptic("action");
    setOpenSubMenu(null);
    if (onClearAll) {
      onClearAll();
    } else {
      ReferenceService.clearAll();
      onProgressiveClear();
    }
  };

  // ============================================================================
  // ESTADO CONCLUÍDO: MINI-CHIP FLUTUANTE DISCRETO NO CANTO SUPERIOR ESQUERDO
  // `[ ⚓ Âncora Ativa (X',Y') | ÷4 | ✎ Editar | × Remover ]`
  // ============================================================================
  if (!isEditingReference) {
    if (!hasAnyActiveReference) return null;

    const summaryParts: string[] = [];
    if (localAnchor) {
      summaryParts.push(
        `⚓ Âncora Ativa (X',Y'${Math.abs(localAnchor.thetaDeg) > 0.05 ? ` ∠${localAnchor.thetaDeg.toFixed(0)}°` : ""})`,
      );
    } else if (landmarks.length > 0) {
      summaryParts.push(`📍 Marcos ${landmarks.map((l) => l.id).join(",")}`);
    } else {
      summaryParts.push("⚓ Referência Ativa");
    }
    if (activeSpanDivision) {
      summaryParts.push(`÷${activeSpanDivision.divisionsN}`);
    }
    if (referenceState.guides.length > 0) {
      summaryParts.push(`${referenceState.guides.length} Guia(s)`);
    }

    return (
      <div
        data-testid="concluded-reference-mini-chip"
        aria-label="Mini-Chip de Referência Concluída Ativa"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-lg backdrop-blur-md font-mono text-[10px] select-none transition-all",
          isDark
            ? "bg-[#090E1A]/92 border-cyan-500/45 text-slate-100"
            : "bg-white/95 border-cyan-600/40 text-slate-900",
        )}
      >
        <span className="flex items-center gap-1 font-extrabold text-cyan-400">
          <Anchor className="size-3 shrink-0" />
          <span>{summaryParts.join(" | ")}</span>
        </span>

        {activeAnchor && (
          <button
            type="button"
            data-testid="use-active-anchor-chip"
            onClick={() => {
              triggerHaptic("action");
              onUseActiveAnchorInTool(activeAnchor);
            }}
            className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 font-bold cursor-pointer"
            title="Aplicar coordenadas da Âncora na ferramenta atual"
          >
            Usar Origem
          </button>
        )}

        <span className="opacity-30">|</span>

        <button
          type="button"
          data-testid="concluded-reference-edit-btn"
          onClick={() => {
            triggerHaptic("selection");
            onEditReference?.();
          }}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full font-bold border transition-colors cursor-pointer",
            isDark
              ? "bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border-slate-600"
              : "bg-slate-100 hover:bg-slate-200 text-cyan-900 border-slate-300",
          )}
          title="Reabrir barra de edição da Âncora / Marcos"
        >
          <Pencil className="size-2.5" />
          <span>✎ Editar</span>
        </button>

        <button
          type="button"
          data-testid="concluded-reference-remove-btn"
          onClick={handleClearAllNow}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full font-bold border transition-colors cursor-pointer",
            isDark
              ? "bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border-rose-500/40"
              : "bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300",
          )}
          title="Remover Âncora, Marcos, Divisões e Guias"
        >
          <X className="size-2.5" />
          <span>× Remover</span>
        </button>
      </div>
    );
  }

  // Telemetria consolidada na barra (substitui qualquer caixa flutuante no canvas!)
  const liveTelemetryText = (() => {
    if (mode === "anchor" && localAnchor && cursor && isValidFiniteVec2(cursor)) {
      const loc = anchorWorldToLocal(cursor, localAnchor.origin, localAnchor.thetaDeg);
      const d = Math.hypot(loc.x, loc.y);
      return `ΔX':${loc.x.toFixed(1)} ΔY':${loc.y.toFixed(1)} d:${d.toFixed(1)}mm`;
    }
    if (mode === "landmarks" && pairMetrics) {
      return `${pairMetrics.fromAnchor.id}→${pairMetrics.toAnchor.id}: ${pairMetrics.distance.toFixed(1)}mm ∠${pairMetrics.angleDeg.toFixed(1)}°`;
    }
    return null;
  })();

  const usedLandmarkSet = new Set(landmarks.map((l) => l.id));
  const nextAvailableSlot = ANCHOR_LABELS.find((lbl) => !usedLandmarkSet.has(lbl)) ?? null;
  const currentSpanN = activeSpanDivision?.divisionsN ?? 4;
  const currentSpanStepMm = activeSpanDivision
    ? activeSpanDivision.stepMm
    : pairMetrics
      ? pairMetrics.distance / currentSpanN
      : 0;

  return (
    <div
      data-testid="chamfer-geometric-anchor-bar"
      aria-label="Barra Contextual Marco Geométrico e Âncora A–E"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto z-30 flex flex-col gap-1 rounded-2xl border px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all max-w-[95vw]",
        isDark
          ? "bg-[#090E1A]/94 border-cyan-500/40 text-slate-100"
          : "bg-white/95 border-cyan-600/35 text-slate-900",
      )}
    >
      {/* =====================================================================
          LINHA 1: PÍLULA DUPLA DE MODO + CONTROLES DO MODO ATIVO + LIMPAR + CONCLUIR
          ===================================================================== */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none touch-pan-x overscroll-x-contain whitespace-nowrap">
        {/* PÍLULA DUPLA DE ALTERNÂNCIA DE MODO: [ ⚓ Âncora X',Y' | 📍 Marcos A–E ] */}
        <div
          className={cn(
            "flex items-center rounded-xl p-0.5 border shrink-0",
            isDark ? "bg-slate-950/90 border-slate-700/80" : "bg-slate-100 border-slate-300",
          )}
        >
          <button
            type="button"
            data-testid="reference-mode-anchor-btn"
            onClick={() => handleModeSwitch("anchor")}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-extrabold transition-all cursor-pointer",
              mode === "anchor"
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : isDark
                  ? "text-slate-300 hover:text-white"
                  : "text-slate-700 hover:text-slate-950",
            )}
            title="Modo 1: Origem Local Única (X', Y') e Simetria/Guias"
          >
            <Anchor className="size-3 shrink-0" />
            <span>⚓ Âncora X&apos;,Y&apos;</span>
          </button>
          <button
            type="button"
            data-testid="reference-mode-landmarks-btn"
            onClick={() => handleModeSwitch("landmarks")}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-extrabold transition-all cursor-pointer",
              mode === "landmarks"
                ? "bg-purple-500 text-white shadow-sm"
                : isDark
                  ? "text-slate-300 hover:text-white"
                  : "text-slate-700 hover:text-slate-950",
            )}
            title="Modo 2: Marcos Estratégicos (A–E) e Divisor de Vão (÷N)"
          >
            <MapPin className="size-3 shrink-0" />
            <span>📍 Marcos A–E</span>
          </button>
        </div>

        {/* =====================================================================
            CONTEÚDO EXCLUSIVO DO MODO 1: ⚓ ÂNCORA (ORIGEM LOCAL X', Y')
            ===================================================================== */}
        {mode === "anchor" && (
          <>
            {/* Chip da Âncora Única + Botão Individual `×` */}
            {localAnchor ? (
              <div
                data-testid="active-local-anchor-chip"
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-lg border font-mono text-[9.5px] font-bold shrink-0",
                  isDark
                    ? "bg-cyan-950/70 text-cyan-200 border-cyan-500/45"
                    : "bg-cyan-50 text-cyan-900 border-cyan-400",
                )}
              >
                <span>
                  ⚓ ({localAnchor.origin.x.toFixed(1)}, {localAnchor.origin.y.toFixed(1)})
                </span>
                <button
                  type="button"
                  data-testid="remove-local-anchor-btn"
                  onClick={() => {
                    triggerHaptic("action");
                    ReferenceService.removeLocalAnchor();
                  }}
                  className="ml-0.5 px-1 rounded hover:bg-rose-500/30 text-rose-400 font-extrabold cursor-pointer"
                  title="Remover esta Âncora"
                >
                  ×
                </button>
              </div>
            ) : (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-lg font-mono text-[9px] font-semibold border border-dashed shrink-0",
                  isDark
                    ? "text-cyan-300/90 border-cyan-500/40 bg-cyan-950/30"
                    : "text-cyan-800 border-cyan-400 bg-cyan-50/60",
                )}
              >
                Toque num ponto ou aresta para posicionar ⚓
              </span>
            )}

            {/* 1. CICLAR */}
            <button
              type="button"
              data-testid="anchor-action-cycle"
              onClick={() => {
                triggerHaptic("selection");
                onCycleAnchor();
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                isDark
                  ? "bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border-cyan-500/35"
                  : "bg-slate-100 hover:bg-slate-200 text-cyan-800 border-cyan-600/30",
              )}
              title="Alternar entre Centro, Vértice, Ponto Médio e Quadrante da entidade tocada"
            >
              <RefreshCw className="size-3" />
              <span>Ciclar</span>
            </button>

            {/* 2. ALINHAR ∠ */}
            <button
              type="button"
              data-testid="anchor-action-align"
              onClick={() => toggleSub("align")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                openSubMenu === "align" || (localAnchor && Math.abs(localAnchor.thetaDeg) > 0.05)
                  ? isDark
                    ? "bg-cyan-500/25 text-cyan-300 border-cyan-400"
                    : "bg-cyan-100 text-cyan-900 border-cyan-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
              )}
              title="Ajuste em tempo real do ângulo θ dos eixos X', Y'"
            >
              <Compass className="size-3" />
              <span>
                Alinhar ∠
                {localAnchor && Math.abs(localAnchor.thetaDeg) > 0.05
                  ? ` (${localAnchor.thetaDeg.toFixed(0)}°)`
                  : ""}
              </span>
            </button>

            {/* 3. GUIAS */}
            <button
              type="button"
              data-testid="anchor-action-guides"
              onClick={() => toggleSub("guides")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                openSubMenu === "guides" || referenceState.guides.length > 0
                  ? isDark
                    ? "bg-purple-500/25 text-purple-200 border-purple-400"
                    : "bg-purple-100 text-purple-900 border-purple-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
              )}
              title="Guias Infinitas de Construção e Encontros Magnéticos"
            >
              <Grid className="size-3" />
              <span>
                Guias{referenceState.guides.length > 0 ? ` (${referenceState.guides.length})` : ""}
              </span>
            </button>

            {/* 4. ECO */}
            <button
              type="button"
              data-testid="anchor-action-echo"
              onClick={() => toggleSub("echo")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                openSubMenu === "echo" || referenceState.echo.mode !== "off"
                  ? isDark
                    ? "bg-cyan-500/25 text-cyan-300 border-cyan-400"
                    : "bg-cyan-100 text-cyan-900 border-cyan-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
              )}
              title="Simetria em tempo real ancorada em (X', Y')"
            >
              <Copy className="size-3" />
              <span>Eco{referenceState.echo.mode !== "off" ? " • ON" : ""}</span>
            </button>

            {/* 5. RADAR */}
            <button
              type="button"
              data-testid="anchor-action-radar"
              onClick={() => {
                triggerHaptic("selection");
                onToggleRadar();
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                referenceState.radarEnabled
                  ? isDark
                    ? "bg-cyan-500/25 text-cyan-300 border-cyan-400"
                    : "bg-cyan-100 text-cyan-900 border-cyan-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
              )}
              title="Distâncias da Âncora até as 4 bordas da chapa"
            >
              <Radar className="size-3" />
              <span>Radar</span>
            </button>
          </>
        )}

        {/* =====================================================================
            CONTEÚDO EXCLUSIVO DO MODO 2: 📍 MARCOS (A–E & DIVISOR DE VÃO ÷N)
            ===================================================================== */}
        {mode === "landmarks" && (
          <>
            {/* Chips de Marcos existentes em ordem alfabética estrita A, B, C, D, E + botão `×` individual + botão `[ + ]` */}
            <div className="flex items-center gap-1 pr-1 border-r border-purple-500/25 shrink-0">
              {landmarks.map((lm) => {
                const isSelected = referenceState.activeLandmarkId === lm.id;
                return (
                  <div
                    key={lm.id}
                    className={cn(
                      "flex items-center rounded-md border font-mono text-[9.5px] font-extrabold transition-all",
                      isSelected
                        ? "bg-cyan-500 text-slate-950 border-cyan-300 shadow-sm"
                        : isDark
                          ? "bg-purple-950/75 text-purple-200 border-purple-500/40"
                          : "bg-purple-100 text-purple-900 border-purple-300",
                    )}
                  >
                    <button
                      type="button"
                      data-testid={`anchor-stack-btn-${lm.id}`}
                      onClick={() => {
                        triggerHaptic("selection");
                        ReferenceService.selectLandmarkSlotForEdit(lm.id);
                      }}
                      className="px-1.5 py-0.5 cursor-pointer"
                      title={`Selecionar Marco ${lm.id} (${lm.origin.x.toFixed(1)}, ${lm.origin.y.toFixed(1)}) para editar`}
                    >
                      {lm.id}
                    </button>
                    <button
                      type="button"
                      data-testid={`remove-landmark-btn-${lm.id}`}
                      onClick={() => {
                        triggerHaptic("action");
                        ReferenceService.removeLandmark(lm.id);
                      }}
                      className={cn(
                        "px-1 py-0.5 border-l cursor-pointer hover:bg-rose-500/30",
                        isSelected
                          ? "border-slate-950/20 text-slate-950"
                          : "border-purple-500/30 text-rose-300",
                      )}
                      title={`Remover Marco ${lm.id}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {/* Indicador do slot aguardando toque (ex.: A ou B) */}
              {referenceState.pendingLandmarkSlot &&
                !usedLandmarkSet.has(referenceState.pendingLandmarkSlot) && (
                  <span
                    data-testid={`pending-landmark-slot-${referenceState.pendingLandmarkSlot}`}
                    className={cn(
                      "px-1.5 py-0.5 rounded-md font-mono text-[9px] font-bold border border-dashed",
                      isDark
                        ? "bg-purple-950/40 text-purple-300 border-purple-400/60"
                        : "bg-purple-50 text-purple-800 border-purple-400",
                    )}
                  >
                    Toque: {referenceState.pendingLandmarkSlot}
                  </span>
                )}

              {/* Botão compacto `[ + ]` para adicionar o próximo marco (C, D, E) apenas quando desejado */}
              {nextAvailableSlot &&
                referenceState.pendingLandmarkSlot !== nextAvailableSlot && (
                  <button
                    type="button"
                    data-testid="add-next-landmark-btn"
                    onClick={() => {
                      triggerHaptic("selection");
                      ReferenceService.requestNextLandmarkSlot();
                    }}
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-mono text-[9.5px] font-extrabold border transition-colors cursor-pointer",
                      isDark
                        ? "bg-slate-900 hover:bg-purple-950/70 text-purple-300 border-purple-500/40"
                        : "bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300",
                    )}
                    title={`Adicionar Marco ${nextAvailableSlot}`}
                  >
                    <Plus className="size-2.5" />
                    <span>{nextAvailableSlot}</span>
                  </button>
                )}
            </div>

            {/* 1. PONTO MÉDIO (A–B) + CONVERSÃO EM ⚓ ÂNCORA */}
            <button
              type="button"
              data-testid="divisor-midpoint-ab"
              disabled={!pairMetrics}
              onClick={() => {
                triggerHaptic("action");
                onMidpointAB();
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors shrink-0",
                !pairMetrics
                  ? "opacity-40 cursor-not-allowed border-slate-700 text-slate-500"
                  : midpointAB
                    ? "bg-purple-600 text-white border-purple-300 cursor-pointer"
                    : isDark
                      ? "bg-slate-900/90 hover:bg-slate-800 text-purple-200 border-purple-500/40 cursor-pointer"
                      : "bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300 cursor-pointer",
              )}
              title="Criar ponto de snap exato no Ponto Médio entre os 2 marcos ativos"
            >
              <span>⌖ Ponto Médio</span>
            </button>

            {pairMetrics && (
              <button
                type="button"
                data-testid="promote-midpoint-to-anchor-btn"
                onClick={() => {
                  triggerHaptic("action");
                  ReferenceService.promoteMidpointABToLocalAnchor(entities);
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded-lg font-mono text-[9px] font-bold border transition-colors cursor-pointer shrink-0",
                  isDark
                    ? "bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border-cyan-500/40"
                    : "bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border-cyan-400",
                )}
                title="Converter Ponto Médio A–B na ⚓ Âncora Local (X', Y')"
              >
                Meio → ⚓
              </button>
            )}

            {/* 2. DIVISOR ÷N (EM TEMPO REAL) */}
            <button
              type="button"
              data-testid="anchor-action-divisor"
              onClick={() => toggleSub("divisor")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                openSubMenu === "divisor" || activeSpanDivision !== null
                  ? isDark
                    ? "bg-purple-500/25 text-purple-200 border-purple-400"
                    : "bg-purple-100 text-purple-900 border-purple-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
              )}
              title="Dividir o vão A–B ou uma linha tocada em N partes iguais em tempo real"
            >
              <Divide className="size-3" />
              <span>
                Divisor ÷N{activeSpanDivision ? ` (÷${activeSpanDivision.divisionsN})` : ""}
              </span>
            </button>

            {/* 3. ALINHAR ÂNCORA POR A–B */}
            <button
              type="button"
              data-testid="divisor-align-ab"
              disabled={!pairMetrics}
              onClick={() => {
                triggerHaptic("action");
                onAlignAxisAB();
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors shrink-0",
                !pairMetrics
                  ? "opacity-40 cursor-not-allowed border-slate-700 text-slate-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border-cyan-500/35 cursor-pointer"
                    : "bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border-cyan-300 cursor-pointer",
              )}
              title="Posicionar a ⚓ Âncora em A com o eixo X' apontando para B"
            >
              <Compass className="size-3" />
              <span>Alinhar A→B</span>
            </button>

            {/* 4. COTAR A–B & TABELA (CSV) */}
            <button
              type="button"
              data-testid="divisor-dimension-ab"
              disabled={!pairMetrics}
              onClick={() => {
                triggerHaptic("action");
                onDimensionAB();
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors shrink-0",
                !pairMetrics
                  ? "opacity-40 cursor-not-allowed border-slate-700 text-slate-500"
                  : isDark
                    ? "bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border-emerald-500/40 cursor-pointer"
                    : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 cursor-pointer",
              )}
              title="Gerar cota direta entre A e B"
            >
              <Ruler className="size-3" />
              <span>Cotar A–B</span>
            </button>

            <button
              type="button"
              data-testid="anchor-action-table"
              onClick={() => toggleSub("table")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer shrink-0",
                openSubMenu === "table"
                  ? isDark
                    ? "bg-purple-500/25 text-purple-200 border-purple-400"
                    : "bg-purple-100 text-purple-900 border-purple-500"
                  : isDark
                    ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
              )}
              title="Gerar Tabela de Coordenadas e exportar CSV"
            >
              <Table2 className="size-3" />
              <span>Tabela</span>
            </button>
          </>
        )}

        {/* PÍLULA CONSOLIDADA DE TELEMETRIA INTEGRADA NA BARRA (ZERO CAIXAS NO DESENHO) */}
        {liveTelemetryText && (
          <span
            data-testid="bar-consolidated-telemetry"
            className={cn(
              "px-2 py-0.5 rounded-lg font-mono text-[9px] font-bold border shrink-0",
              isDark
                ? "bg-slate-900/90 text-cyan-300 border-slate-700"
                : "bg-slate-100 text-cyan-900 border-slate-300",
            )}
          >
            {liveTelemetryText}
          </span>
        )}

        {/* BOTÃO COMPACTO `🗑️ Limpar` (REMOVE TUDO DE UMA VEZ) */}
        <button
          type="button"
          data-testid="anchor-action-clear"
          onClick={handleClearAllNow}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-[9.5px] font-bold transition-colors cursor-pointer shrink-0",
            isDark
              ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40"
              : "bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300",
          )}
          title="Remover todas as âncoras, marcos, divisões e guias de uma só vez"
        >
          <Trash2 className="size-3" />
          <span>🗑️ Limpar</span>
        </button>

        {/* BOTÃO VERDE COMPACTO `[ ✓ Concluir ]` SEMPRE VISÍVEL */}
        <button
          type="button"
          data-testid="anchor-action-conclude"
          onClick={() => {
            triggerHaptic("success");
            setOpenSubMenu(null);
            onConcludeReference?.();
          }}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-[9.5px] font-extrabold shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
          title="Concluir edição de referência e voltar ao desenho mantendo o SNAP magnético ativo (Enter)"
        >
          <Check className="size-3 stroke-[2.8]" />
          <span>✓ Concluir</span>
        </button>
      </div>

      {/* =====================================================================
          SUB-BARRA 1: DIVISOR DE VÃO (÷N) EM TEMPO REAL
          `Dividir em: [ - ] [ N = 4 ✎ ] [ + ] | Atalhos: [2] [3] [4] [5] [6] [8] [10] | Passo: 75.0 mm | [ ✓ Fixar Nós ]`
          ===================================================================== */}
      {openSubMenu === "divisor" && (
        <div
          data-testid="anchor-submenu-divisor"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9.5px] whitespace-nowrap",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-purple-300" : "text-purple-800")}>
            Dividir em:
          </span>

          <button
            type="button"
            data-testid="divisor-step-minus"
            onClick={() => {
              triggerHaptic("selection");
              const nextN = Math.max(2, currentSpanN - 1);
              onDivideSpanAB(nextN);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
              isDark
                ? "bg-slate-900 hover:bg-slate-800 text-cyan-300 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-cyan-900 border-slate-300",
            )}
            title="Diminuir número de divisões (-1)"
          >
            -
          </button>

          {editingCustomN ? (
            <input
              type="number"
              min={2}
              max={100}
              data-testid="divisor-custom-n-input"
              value={customNInput}
              autoFocus
              onChange={(e) => {
                setCustomNInput(e.target.value);
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed) && parsed >= 2 && parsed <= 100) {
                  onDivideSpanAB(Math.round(parsed));
                }
              }}
              onBlur={() => setEditingCustomN(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const parsed = Number(customNInput);
                  if (Number.isFinite(parsed) && parsed >= 2) {
                    onDivideSpanAB(Math.max(2, Math.min(100, Math.round(parsed))));
                  }
                  setEditingCustomN(false);
                }
              }}
              className={cn(
                "w-14 px-1.5 py-0.5 rounded-md border font-bold text-center",
                isDark
                  ? "bg-slate-950 text-cyan-300 border-cyan-400"
                  : "bg-white text-cyan-950 border-cyan-500",
              )}
            />
          ) : (
            <button
              type="button"
              data-testid="divisor-current-n-pill"
              onClick={() => {
                setCustomNInput(String(currentSpanN));
                setEditingCustomN(true);
              }}
              className={cn(
                "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
                isDark
                  ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/50"
                  : "bg-cyan-50 text-cyan-900 border-cyan-400",
              )}
              title="Toque para digitar qualquer número N (2 a 100)"
            >
              N = {currentSpanN} ✎
            </button>
          )}

          <button
            type="button"
            data-testid="divisor-step-plus"
            onClick={() => {
              triggerHaptic("selection");
              const nextN = Math.min(100, currentSpanN + 1);
              onDivideSpanAB(nextN);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
              isDark
                ? "bg-slate-900 hover:bg-slate-800 text-cyan-300 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-cyan-900 border-slate-300",
            )}
            title="Aumentar número de divisões (+1)"
          >
            +
          </button>

          <span className="opacity-30 px-0.5">|</span>
          <span className={cn("text-[9px]", isDark ? "text-slate-400" : "text-slate-600")}>
            Atalhos:
          </span>

          {[2, 3, 4, 5, 6, 8, 10].map((n) => (
            <button
              key={`div-n-${n}`}
              type="button"
              data-testid={`divisor-btn-${n}`}
              onClick={() => {
                triggerHaptic("selection");
                onDivideSpanAB(n);
              }}
              className={cn(
                "px-1.5 py-0.5 rounded-md border font-bold cursor-pointer",
                currentSpanN === n && activeSpanDivision
                  ? "bg-cyan-500 text-slate-950 border-cyan-300"
                  : isDark
                    ? "bg-slate-900 text-purple-200 border-purple-500/40 hover:border-cyan-400"
                    : "bg-purple-50 text-purple-900 border-purple-300 hover:border-cyan-500",
              )}
            >
              {n}
            </button>
          ))}

          <span className="opacity-30 px-0.5">|</span>

          <span
            data-testid="divisor-live-step-readout"
            className={cn(
              "px-2 py-0.5 rounded-md border font-extrabold",
              isDark
                ? "bg-slate-900/90 text-cyan-300 border-cyan-500/35"
                : "bg-cyan-50 text-cyan-900 border-cyan-300",
            )}
          >
            Passo: {currentSpanStepMm.toFixed(1)} mm
          </span>

          <button
            type="button"
            data-testid="divisor-pick-line-btn"
            onClick={() => {
              triggerHaptic("selection");
              ReferenceService.setDivisorPickSegmentMode(
                !referenceState.divisorPickSegmentMode,
              );
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              referenceState.divisorPickSegmentMode
                ? "bg-amber-500 text-slate-950 border-amber-300"
                : isDark
                  ? "bg-slate-900 text-slate-200 border-slate-700"
                  : "bg-slate-100 text-slate-800 border-slate-300",
            )}
            title="Toque diretamente em qualquer linha ou aresta da peça para dividi-la em N partes"
          >
            📏 Tocar Aresta
          </button>

          <button
            type="button"
            data-testid="divisor-pin-nodes-btn"
            onClick={() => {
              triggerHaptic("success");
              if (!activeSpanDivision && pairMetrics) {
                onDivideSpanAB(currentSpanN);
              }
              ReferenceService.pinSpanDivision();
              setOpenSubMenu(null);
            }}
            className="px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold cursor-pointer"
            title="Confirmar e fixar os nós de divisão para captura de SNAP"
          >
            ✓ Fixar Nós
          </button>
        </div>
      )}

      {/* =====================================================================
          SUB-BARRA 2: ALINHAMENTO ANGULAR (Alinhar ∠) EM TEMPO REAL
          `Eixo X': [ -15° ] [ 0° ] [ 30° ] [ 45° ] [ 90° ] [ +15° ] | [ ∠ {θ}° ✎ ] | [ 📏 Tocar Aresta ]`
          ===================================================================== */}
      {openSubMenu === "align" && (
        <div
          data-testid="anchor-submenu-align"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9.5px] whitespace-nowrap",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-cyan-400" : "text-cyan-800")}>
            Eixo X&apos;:
          </span>

          <button
            type="button"
            data-testid="align-step-minus-15"
            onClick={() => {
              triggerHaptic("selection");
              const cur = activeAnchor?.thetaDeg ?? 0;
              onSetAnchorAngle(cur - 15);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-cyan-300 border-slate-700 hover:border-cyan-400"
                : "bg-slate-100 text-cyan-900 border-slate-300",
            )}
          >
            -15°
          </button>

          {[0, 30, 45, 90].map((deg) => (
            <button
              key={`ang-${deg}`}
              type="button"
              data-testid={`align-preset-${deg}`}
              onClick={() => {
                triggerHaptic("selection");
                onSetAnchorAngle(deg);
              }}
              className={cn(
                "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                Math.abs((activeAnchor?.thetaDeg ?? 0) - deg) < 0.1
                  ? "bg-cyan-500 text-slate-950 border-cyan-300"
                  : isDark
                    ? "bg-slate-900 text-slate-200 border-slate-700 hover:border-cyan-400"
                    : "bg-slate-100 text-slate-800 border-slate-300 hover:border-cyan-500",
              )}
            >
              {deg}°
            </button>
          ))}

          <button
            type="button"
            data-testid="align-step-plus-15"
            onClick={() => {
              triggerHaptic("selection");
              const cur = activeAnchor?.thetaDeg ?? 0;
              onSetAnchorAngle(cur + 15);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-cyan-300 border-slate-700 hover:border-cyan-400"
                : "bg-slate-100 text-cyan-900 border-slate-300",
            )}
          >
            +15°
          </button>

          <span className="opacity-30 px-0.5">|</span>

          {editingCustomAngle ? (
            <input
              type="number"
              step="1"
              data-testid="align-custom-angle-input"
              value={customAngleInput}
              autoFocus
              onChange={(e) => {
                setCustomAngleInput(e.target.value);
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed)) {
                  ReferenceService.setActiveAnchorAngle(parsed, false, entities);
                }
              }}
              onBlur={() => setEditingCustomAngle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const parsed = Number(customAngleInput);
                  if (Number.isFinite(parsed)) {
                    onSetAnchorAngle(parsed);
                  }
                  setEditingCustomAngle(false);
                }
              }}
              className={cn(
                "w-16 px-1.5 py-0.5 rounded-md border font-bold text-center",
                isDark
                  ? "bg-slate-950 text-cyan-300 border-cyan-400"
                  : "bg-white text-cyan-950 border-cyan-500",
              )}
            />
          ) : (
            <button
              type="button"
              data-testid="align-current-theta-pill"
              onClick={() => {
                setCustomAngleInput(String(Number((activeAnchor?.thetaDeg ?? 0).toFixed(1))));
                setEditingCustomAngle(true);
              }}
              className={cn(
                "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
                isDark
                  ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/50"
                  : "bg-cyan-50 text-cyan-900 border-cyan-400",
              )}
            >
              ∠ {(activeAnchor?.thetaDeg ?? 0).toFixed(1)}° ✎
            </button>
          )}

          <span className="opacity-30 px-0.5">|</span>

          <button
            type="button"
            data-testid="align-pick-edge-btn"
            onClick={() => {
              triggerHaptic("selection");
              ReferenceService.setAlignPickEdgeMode(!referenceState.alignPickEdgeMode);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              referenceState.alignPickEdgeMode
                ? "bg-amber-500 text-slate-950 border-amber-300"
                : isDark
                  ? "bg-slate-900 text-slate-200 border-slate-700"
                  : "bg-slate-100 text-slate-800 border-slate-300",
            )}
            title="Toque em qualquer aresta da peça para alinhar o eixo X' ao ângulo dela"
          >
            📏 Tocar Aresta
          </button>
        </div>
      )}

      {/* =====================================================================
          SUB-BARRA 3: GUIAS INFINITAS E OFFSET PARALELO (d) EM TEMPO REAL
          `[ Eixo X' ] [ Eixo Y' ] [ Bissetriz ] | Paralela d: [ - ] [ {d} mm ✎ ] [ + ] ([10] [20] [30] [50]) | [ + Fixar Guia ]`
          ===================================================================== */}
      {openSubMenu === "guides" && (
        <div
          data-testid="anchor-submenu-guides"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9.5px] whitespace-nowrap",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <button
            type="button"
            data-testid="guide-add-axis-x"
            onClick={() => {
              triggerHaptic("selection");
              ReferenceService.toggleGuideKind("axis_x", entities);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              referenceState.guides.some((g) => g.kind === "axis_x")
                ? "bg-cyan-500 text-slate-950 border-cyan-300"
                : isDark
                  ? "bg-slate-900 text-cyan-300 border-cyan-500/40"
                  : "bg-cyan-50 text-cyan-900 border-cyan-400",
            )}
          >
            Eixo X&apos;
          </button>

          <button
            type="button"
            data-testid="guide-add-axis-y"
            onClick={() => {
              triggerHaptic("selection");
              ReferenceService.toggleGuideKind("axis_y", entities);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              referenceState.guides.some((g) => g.kind === "axis_y")
                ? "bg-purple-500 text-white border-purple-300"
                : isDark
                  ? "bg-slate-900 text-purple-300 border-purple-500/40"
                  : "bg-purple-50 text-purple-900 border-purple-400",
            )}
          >
            Eixo Y&apos;
          </button>

          <button
            type="button"
            data-testid="guide-add-bisector"
            onClick={() => {
              triggerHaptic("selection");
              ReferenceService.toggleGuideKind("bisector", entities);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              referenceState.guides.some((g) => g.kind === "bisector")
                ? "bg-cyan-500 text-slate-950 border-cyan-300"
                : isDark
                  ? "bg-slate-900 text-slate-200 border-slate-700"
                  : "bg-slate-100 text-slate-800 border-slate-300",
            )}
          >
            Bissetriz
          </button>

          <span className="opacity-30 px-0.5">|</span>
          <span className={cn("font-bold", isDark ? "text-purple-300" : "text-purple-800")}>
            Paralela d:
          </span>

          <button
            type="button"
            data-testid="guide-parallel-step-minus"
            onClick={() => {
              triggerHaptic("selection");
              const nextD = (referenceState.parallelGuideOffsetMm ?? 25) - 5;
              ReferenceService.setParallelGuideOffsetLive(nextD, entities);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
              isDark
                ? "bg-slate-900 text-cyan-300 border-slate-700"
                : "bg-slate-100 text-cyan-900 border-slate-300",
            )}
          >
            -
          </button>

          {editingCustomOffset ? (
            <input
              type="number"
              step="1"
              data-testid="guide-custom-offset-input"
              value={customOffsetInput}
              autoFocus
              onChange={(e) => {
                setCustomOffsetInput(e.target.value);
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed)) {
                  ReferenceService.setParallelGuideOffsetLive(parsed, entities);
                }
              }}
              onBlur={() => setEditingCustomOffset(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const parsed = Number(customOffsetInput);
                  if (Number.isFinite(parsed)) {
                    ReferenceService.setParallelGuideOffsetLive(parsed, entities);
                  }
                  setEditingCustomOffset(false);
                }
              }}
              className={cn(
                "w-16 px-1.5 py-0.5 rounded-md border font-bold text-center",
                isDark
                  ? "bg-slate-950 text-cyan-300 border-cyan-400"
                  : "bg-white text-cyan-950 border-cyan-500",
              )}
            />
          ) : (
            <button
              type="button"
              data-testid="guide-current-offset-pill"
              onClick={() => {
                setCustomOffsetInput(String(referenceState.parallelGuideOffsetMm ?? 25));
                setEditingCustomOffset(true);
              }}
              className={cn(
                "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
                isDark
                  ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/50"
                  : "bg-cyan-50 text-cyan-900 border-cyan-400",
              )}
            >
              {(referenceState.parallelGuideOffsetMm ?? 25).toFixed(1)} mm ✎
            </button>
          )}

          <button
            type="button"
            data-testid="guide-parallel-step-plus"
            onClick={() => {
              triggerHaptic("selection");
              const nextD = (referenceState.parallelGuideOffsetMm ?? 25) + 5;
              ReferenceService.setParallelGuideOffsetLive(nextD, entities);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
              isDark
                ? "bg-slate-900 text-cyan-300 border-slate-700"
                : "bg-slate-100 text-cyan-900 border-slate-300",
            )}
          >
            +
          </button>

          {[10, 20, 30, 50].map((dVal) => (
            <button
              key={`par-d-${dVal}`}
              type="button"
              data-testid={`guide-parallel-preset-${dVal}`}
              onClick={() => {
                triggerHaptic("selection");
                ReferenceService.setParallelGuideOffsetLive(dVal, entities);
              }}
              className={cn(
                "px-1.5 py-0.5 rounded-md border font-bold cursor-pointer",
                Math.abs((referenceState.parallelGuideOffsetMm ?? 25) - dVal) < 0.1
                  ? "bg-cyan-500 text-slate-950 border-cyan-300"
                  : isDark
                    ? "bg-slate-900 text-slate-200 border-slate-700"
                    : "bg-slate-100 text-slate-800 border-slate-300",
              )}
            >
              {dVal}
            </button>
          ))}

          <button
            type="button"
            data-testid="guide-pin-parallel-btn"
            onClick={() => {
              triggerHaptic("action");
              ReferenceService.pinActiveParallelGuide(entities);
            }}
            className="px-2 py-0.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
          >
            + Fixar Guia
          </button>

          <span className={cn("pl-1", isDark ? "text-slate-400" : "text-slate-600")}>
            Encontros:{" "}
            <strong
              data-testid="guide-meetings-count"
              className={isDark ? "text-cyan-300" : "text-cyan-700"}
            >
              {referenceState.meetings.length}
            </strong>
          </span>
        </div>
      )}

      {/* =====================================================================
          SUB-BARRA 4: ECO DE SIMETRIA E REPETIÇÃO EM TEMPO REAL
          `Modo Eco: [ Desligado ] [ Espelho X' ] [ Espelho Y' ] [ X'+Y' ] [ Radial ] | Cópias N: [ - ] [ {N} ] [ + ]`
          ===================================================================== */}
      {openSubMenu === "echo" && (
        <div
          data-testid="anchor-submenu-echo"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9.5px] whitespace-nowrap",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-cyan-400" : "text-cyan-800")}>
            Modo Eco:
          </span>
          {(
            [
              { id: "off", label: "Desligado" },
              { id: "mirror_x", label: "Espelho X'" },
              { id: "mirror_y", label: "Espelho Y'" },
              { id: "mirror_xy", label: "X'+Y'" },
              { id: "radial", label: "Radial" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`echo-mode-${m.id}`}
              onClick={() => onSetEchoMode(m.id)}
              className={cn(
                "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                referenceState.echo.mode === m.id
                  ? "bg-cyan-500 text-slate-950 border-cyan-300"
                  : isDark
                    ? "bg-slate-900 text-slate-200 border-slate-700"
                    : "bg-slate-100 text-slate-800 border-slate-300",
              )}
            >
              {m.label}
            </button>
          ))}

          {referenceState.echo.mode === "radial" && (
            <>
              <span className="opacity-30 px-0.5">|</span>
              <span className={cn("font-bold", isDark ? "text-cyan-300" : "text-cyan-800")}>
                Cópias N:
              </span>
              <button
                type="button"
                data-testid="echo-radial-minus"
                onClick={() => {
                  triggerHaptic("selection");
                  ReferenceService.setEchoConfig({
                    radialCount: Math.max(2, (referenceState.echo.radialCount || 6) - 1),
                  });
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
                  isDark
                    ? "bg-slate-900 text-cyan-300 border-slate-700"
                    : "bg-slate-100 text-cyan-900 border-slate-300",
                )}
              >
                -
              </button>
              <span
                data-testid="echo-radial-count"
                className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold"
              >
                {referenceState.echo.radialCount || 6}
              </span>
              <button
                type="button"
                data-testid="echo-radial-plus"
                onClick={() => {
                  triggerHaptic("selection");
                  ReferenceService.setEchoConfig({
                    radialCount: Math.min(36, (referenceState.echo.radialCount || 6) + 1),
                  });
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md border font-extrabold cursor-pointer",
                  isDark
                    ? "bg-slate-900 text-cyan-300 border-slate-700"
                    : "bg-slate-100 text-cyan-900 border-slate-300",
                )}
              >
                +
              </button>
            </>
          )}

          {referenceState.echo.mode !== "off" && (
            <button
              type="button"
              data-testid="echo-commit-btn"
              onClick={onCommitEchoEntities}
              className="px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold cursor-pointer"
            >
              ✓ Aplicar Eco
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-BARRA 5: TABELA DE COORDENADAS E EXPORTAÇÃO CSV
          ===================================================================== */}
      {openSubMenu === "table" && (
        <div
          data-testid="anchor-submenu-table"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9.5px] whitespace-nowrap",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-purple-300" : "text-purple-800")}>
            Tabela de Coordenadas (X&apos;, Y&apos;, Ø):
          </span>
          <button
            type="button"
            data-testid="table-generate-cad-btn"
            onClick={() => onGenerateTable(false)}
            className="px-2 py-0.5 rounded-md bg-purple-700 hover:bg-purple-600 text-white font-bold cursor-pointer"
          >
            + Inserir na Camada COTAS
          </button>
          <button
            type="button"
            data-testid="table-export-csv-btn"
            onClick={() => onGenerateTable(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-bold cursor-pointer"
          >
            <Download className="size-3" />
            <span>Exportar CSV</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          FAIXA LIMPA DO RADAR INTEGRADA NA BARRA (ZERO POLUIÇÃO SOBRE A PEÇA)
          ===================================================================== */}
      {radarData && (
        <div
          data-testid="anchor-radar-clean-strip"
          className={cn(
            "flex items-center gap-2 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9px] whitespace-nowrap",
            isDark ? "border-slate-800/80 text-cyan-300" : "border-slate-200 text-cyan-900",
          )}
        >
          <span className="font-extrabold uppercase">Radar Bordas:</span>
          {radarData.workspaceChips.map((chip) => (
            <span
              key={chip.id}
              className={cn(
                "px-1.5 py-0.5 rounded border",
                isDark
                  ? "bg-slate-900/90 border-cyan-500/30"
                  : "bg-cyan-50 border-cyan-300",
              )}
            >
              {chip.directionLabel}: <strong>{chip.distanceMm.toFixed(1)} mm</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
