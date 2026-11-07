/**
 * CALDRA CHAMFER — BARRA CONTEXTUAL DE 1 LINHA ROLÁVEL E CHIP UNIVERSAL DO MARCO GEOMÉTRICO / ÂNCORA (A–E)
 *
 * Implementa:
 *  - Barra contextual de 1 linha rolável:
 *      `Ciclar | Alinhar | Guias | Divisor ÷N | Radar | Eco | Tabela | Limpar`
 *  - Seletor rápido da pilha de Marcos/Âncoras (`A, B, C, D, E`) e alternador `Mundo | Âncora`
 *  - Ações relacionais quando há 2+ âncoras (`Ponto Médio A–B`, `Alinhar Eixo X' por A–B`, `Dividir Vão ÷2, ÷3, ÷4, ÷N`, `Cotar A–B`)
 *  - Chip Universal `[ Usar Âncora A ]` visível em todas as ferramentas do CAD
 */

import React, { useState } from "react";
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
  Download,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { Entity } from "@/lib/lab2d/core";
import {
  type AnchorLabel,
  type ConstructionGuideKind,
  type EchoMode,
  type GeometricAnchor,
  type ReferenceServiceState,
  ReferenceService,
} from "@/lib/lab2d/referenceService";

export interface ChamferGeometricAnchorBarProps {
  visible: boolean;
  referenceState: ReferenceServiceState;
  entities: Entity[];
  selectedIds: string[];
  isDark: boolean;
  onCycleAnchor: () => void;
  onSetAnchorAngle: (thetaDeg: number) => void;
  onOpenCustomAngleKeypad?: (currentAngle: number, screenPos: { x: number; y: number }) => void;
  onOpenCustomDivisionKeypad?: (currentN: number, screenPos: { x: number; y: number }) => void;
  onAddGuide: (kind: ConstructionGuideKind, options?: { angleDeg?: number; offsetMm?: number }) => void;
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
  referenceState,
  isDark,
  onCycleAnchor,
  onSetAnchorAngle,
  onOpenCustomAngleKeypad,
  onOpenCustomDivisionKeypad,
  onAddGuide,
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

  if (!visible && referenceState.anchors.length === 0) return null;

  const activeAnchor =
    referenceState.anchors.find((a) => a.id === referenceState.activeAnchorId) ??
    referenceState.anchors[referenceState.anchors.length - 1] ??
    null;

  const pairMetrics =
    referenceState.anchors.length >= 2
      ? ReferenceService.computeAnchorPairMetrics()
      : null;

  const toggleSub = (menu: "align" | "guides" | "divisor" | "echo" | "table") => {
    triggerHaptic("selection");
    setOpenSubMenu((prev) => (prev === menu ? null : menu));
  };

  const activeSpanDivision = referenceState.spanDivision ?? null;

  return (
    <div
      data-testid="chamfer-geometric-anchor-bar"
      aria-label="Barra Contextual Marco Geométrico e Âncora A–E"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto z-30 flex flex-col gap-1 rounded-2xl border px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all max-w-[94vw]",
        isDark
          ? "bg-[#090E1A]/94 border-cyan-500/40 text-slate-100"
          : "bg-white/95 border-cyan-600/35 text-slate-900",
      )}
    >
      {/* LINHA PRINCIPAL ROLÁVEL DE 1 LINHA: [A..E] | Mundo/Âncora | Ciclar | Alinhar | Guias | Divisor ÷N | Radar | Eco | Tabela | Limpar */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none whitespace-nowrap">
        {/* Pilha de Marcos/Âncoras A–E */}
        <div className="flex items-center gap-0.5 pr-1 border-r border-cyan-500/25">
          <span
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-[9.5px] font-extrabold uppercase",
              isDark ? "bg-cyan-500/15 text-cyan-300" : "bg-cyan-100 text-cyan-900",
            )}
          >
            <Anchor className="size-3 shrink-0" />
            <span>ÂNCORA</span>
          </span>
          {referenceState.anchors.map((a) => {
            const isAct = activeAnchor?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                data-testid={`anchor-stack-btn-${a.id}`}
                onClick={() => {
                  triggerHaptic("selection");
                  ReferenceService.setActive(a.id);
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded-md font-mono text-[9.5px] font-extrabold border transition-all cursor-pointer",
                  isAct
                    ? "bg-cyan-500 text-slate-950 border-cyan-300 shadow-sm"
                    : isDark
                      ? "bg-purple-950/70 text-purple-200 border-purple-500/40 hover:bg-purple-900/70"
                      : "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200",
                )}
                title={`Selecionar Âncora ${a.id} (${a.badgeLabel})`}
              >
                {a.id}
              </button>
            );
          })}
        </div>

        {/* Alternador Numpad: Mundo | Âncora */}
        <button
          type="button"
          data-testid="anchor-coord-mode-toggle"
          onClick={() => {
            triggerHaptic("selection");
            const next =
              referenceState.coordinateInputMode === "anchor" ? "world" : "anchor";
            ReferenceService.setCoordinateInputMode(next);
          }}
          className={cn(
            "px-2 py-0.5 rounded-lg font-mono text-[9px] font-bold border transition-colors cursor-pointer",
            referenceState.coordinateInputMode === "anchor"
              ? isDark
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50"
                : "bg-cyan-100 text-cyan-900 border-cyan-500/50"
              : isDark
                ? "bg-slate-800/80 text-slate-300 border-slate-700"
                : "bg-slate-100 text-slate-700 border-slate-300",
          )}
          title="Alternar entrada numérica entre Coordenadas Globais (Mundo) e Relativas à Âncora (X', Y')"
        >
          {referenceState.coordinateInputMode === "anchor" ? "Ref: Âncora (X',Y')" : "Ref: Mundo (X,Y)"}
        </button>

        {/* Chip Universal [ Usar Âncora A ] */}
        {activeAnchor && (
          <button
            type="button"
            data-testid="use-active-anchor-chip"
            onClick={() => {
              triggerHaptic("action");
              onUseActiveAnchorInTool(activeAnchor);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-[9.5px] font-extrabold shadow-sm active:scale-95 transition-all cursor-pointer"
            title={`Usar Âncora ${activeAnchor.id} (${activeAnchor.origin.x.toFixed(1)}, ${activeAnchor.origin.y.toFixed(1)}) como origem, centro ou pivô na ferramenta ativa`}
          >
            <Check className="size-3 stroke-[2.8]" />
            <span>Usar Âncora {activeAnchor.id}</span>
          </button>
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
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
            isDark
              ? "bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border-cyan-500/35"
              : "bg-slate-100 hover:bg-slate-200 text-cyan-800 border-cyan-600/30",
          )}
          title="Percorrer candidatos notáveis da entidade vinculada (Centro, Vértices, Ponto Médio, Quadrantes)"
        >
          <RefreshCw className="size-3" />
          <span>Ciclar</span>
        </button>

        {/* 2. ALINHAR */}
        <button
          type="button"
          data-testid="anchor-action-align"
          onClick={() => toggleSub("align")}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
            openSubMenu === "align" || (activeAnchor && Math.abs(activeAnchor.thetaDeg) > 0.05)
              ? isDark
                ? "bg-cyan-500/25 text-cyan-300 border-cyan-400"
                : "bg-cyan-100 text-cyan-900 border-cyan-500"
              : isDark
                ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
          )}
          title="Rotacionar e alinhar eixo X' da Âncora ativa"
        >
          <Compass className="size-3" />
          <span>
            Alinhar{activeAnchor && Math.abs(activeAnchor.thetaDeg) > 0.05 ? ` (${activeAnchor.thetaDeg.toFixed(0)}°)` : ""}
          </span>
        </button>

        {/* 3. GUIAS */}
        <button
          type="button"
          data-testid="anchor-action-guides"
          onClick={() => toggleSub("guides")}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
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

        {/* 4. DIVISOR ÷N */}
        <button
          type="button"
          data-testid="anchor-action-divisor"
          onClick={() => toggleSub("divisor")}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
            openSubMenu === "divisor" || activeSpanDivision !== null
              ? isDark
                ? "bg-purple-500/25 text-purple-200 border-purple-400"
                : "bg-purple-100 text-purple-900 border-purple-500"
              : isDark
                ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
          )}
          title="Divisor Relacional de Vão A–B (÷2, ÷3, ÷4, ÷N), Ponto Médio A–B e Cotar A–B"
        >
          <Divide className="size-3" />
          <span>
            Divisor ÷N{activeSpanDivision ? ` (÷${activeSpanDivision.divisionsN})` : ""}
          </span>
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
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
            referenceState.radarEnabled
              ? isDark
                ? "bg-cyan-500/25 text-cyan-300 border-cyan-400"
                : "bg-cyan-100 text-cyan-900 border-cyan-500"
              : isDark
                ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
          )}
          title="Radar de Bordas: distâncias até as 4 bordas da Área de Trabalho e peças vizinhas"
        >
          <Radar className="size-3" />
          <span>Radar</span>
        </button>

        {/* 6. ECO */}
        <button
          type="button"
          data-testid="anchor-action-echo"
          onClick={() => toggleSub("echo")}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
            openSubMenu === "echo" || referenceState.echo.mode !== "off"
              ? isDark
                ? "bg-cyan-500/25 text-cyan-300 border-cyan-400"
                : "bg-cyan-100 text-cyan-900 border-cyan-500"
              : isDark
                ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
          )}
          title="Eco Vivo: Simetria em X'/Y', Repetição Radial (N=6) e Linear"
        >
          <Copy className="size-3" />
          <span>Eco{referenceState.echo.mode !== "off" ? " • ON" : ""}</span>
        </button>

        {/* 7. TABELA */}
        <button
          type="button"
          data-testid="anchor-action-table"
          onClick={() => toggleSub("table")}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[9.5px] font-bold border transition-colors cursor-pointer",
            openSubMenu === "table"
              ? isDark
                ? "bg-purple-500/25 text-purple-200 border-purple-400"
                : "bg-purple-100 text-purple-900 border-purple-500"
              : isDark
                ? "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300",
          )}
          title="Tabela de Coordenadas (ID, X', Y', Ø) na camada COTAS e exportação CSV"
        >
          <Table2 className="size-3" />
          <span>Tabela</span>
        </button>

        {/* 8. LIMPAR (2 ESTÁGIOS) */}
        <button
          type="button"
          data-testid="anchor-action-clear"
          onClick={() => {
            triggerHaptic("action");
            onProgressiveClear();
          }}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-[9.5px] font-bold transition-colors cursor-pointer",
            isDark
              ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40"
              : "bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300",
          )}
          title="1º toque limpa Guias/Eco/Divisões; 2º toque limpa as Âncoras A–E"
        >
          <Trash2 className="size-3" />
          <span>Limpar</span>
        </button>
      </div>

      {/* SUB-PAINEL CONTEXTUAL COMPACTO */}
      {openSubMenu === "align" && (
        <div
          data-testid="anchor-submenu-align"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9px]",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-cyan-400" : "text-cyan-800")}>
            Eixo X&apos;:
          </span>
          {[0, 15, 30, 45, 60, 90].map((deg) => (
            <button
              key={`ang-${deg}`}
              type="button"
              onClick={() => onSetAnchorAngle(deg)}
              className={cn(
                "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                Math.abs((activeAnchor?.thetaDeg ?? 0) - deg) < 0.1
                  ? "bg-cyan-500 text-slate-950 border-cyan-300"
                  : isDark
                    ? "bg-slate-900 text-slate-200 border-slate-700 hover:border-cyan-400"
                    : "bg-slate-100 text-slate-800 border-slate-300 hover:border-cyan-500",
              )}
            >
              {deg === 0 ? "0° (Zerar)" : `${deg}°`}
            </button>
          ))}
          {pairMetrics && (
            <button
              type="button"
              data-testid="anchor-align-by-ab-btn"
              onClick={onAlignAxisAB}
              className={cn(
                "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                isDark
                  ? "bg-purple-900/70 text-purple-200 border-purple-400/50"
                  : "bg-purple-100 text-purple-900 border-purple-400",
              )}
            >
              Alinhar {pairMetrics.fromAnchor.id}→{pairMetrics.toAnchor.id} ({pairMetrics.angleDeg.toFixed(1)}°)
            </button>
          )}
          {onOpenCustomAngleKeypad && (
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onOpenCustomAngleKeypad(activeAnchor?.thetaDeg ?? 0, { x: r.left, y: r.top });
              }}
              className={cn(
                "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                isDark
                  ? "bg-slate-800 text-cyan-300 border-cyan-500/40"
                  : "bg-cyan-50 text-cyan-800 border-cyan-400",
              )}
            >
              Digitar θ...
            </button>
          )}
        </div>
      )}

      {openSubMenu === "guides" && (
        <div
          data-testid="anchor-submenu-guides"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9px]",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-purple-300" : "text-purple-800")}>
            +Guia:
          </span>
          <button
            type="button"
            data-testid="guide-add-axis-x"
            onClick={() => onAddGuide("axis_x")}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-cyan-300 border-cyan-500/40"
                : "bg-cyan-50 text-cyan-900 border-cyan-400",
            )}
          >
            Eixo X&apos;
          </button>
          <button
            type="button"
            data-testid="guide-add-axis-y"
            onClick={() => onAddGuide("axis_y")}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-purple-300 border-purple-500/40"
                : "bg-purple-50 text-purple-900 border-purple-400",
            )}
          >
            Eixo Y&apos;
          </button>
          <button
            type="button"
            data-testid="guide-add-bisector"
            onClick={() => onAddGuide("bisector")}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-slate-200 border-slate-700"
                : "bg-slate-100 text-slate-800 border-slate-300",
            )}
          >
            Bissetriz 45°
          </button>
          <button
            type="button"
            data-testid="guide-add-angled-30"
            onClick={() => onAddGuide("angled", { angleDeg: 30 })}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-slate-200 border-slate-700"
                : "bg-slate-100 text-slate-800 border-slate-300",
            )}
          >
            ∠30°
          </button>
          <button
            type="button"
            data-testid="guide-add-parallel-25"
            onClick={() => onAddGuide("parallel_offset", { offsetMm: 25 })}
            className={cn(
              "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
              isDark
                ? "bg-slate-900 text-slate-200 border-slate-700"
                : "bg-slate-100 text-slate-800 border-slate-300",
            )}
          >
            Paralela d=25mm
          </button>
          <span className={cn("pl-1", isDark ? "text-slate-400" : "text-slate-600")}>
            Encontros:{" "}
            <strong className={isDark ? "text-cyan-300" : "text-cyan-700"}>
              {referenceState.meetings.length}
            </strong>
          </span>
        </div>
      )}

      {openSubMenu === "divisor" && (
        <div
          data-testid="anchor-submenu-divisor"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9px]",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          {pairMetrics ? (
            <>
              <span className={cn("font-bold px-1", isDark ? "text-purple-300" : "text-purple-800")}>
                {pairMetrics.fromAnchor.id}–{pairMetrics.toAnchor.id} (d={pairMetrics.distance.toFixed(1)}):
              </span>
              <button
                type="button"
                data-testid="divisor-midpoint-ab"
                onClick={onMidpointAB}
                className="px-2 py-0.5 rounded-md bg-purple-700 text-white border border-purple-400/50 font-bold cursor-pointer"
              >
                ⌖ Ponto Médio A–B
              </button>
              <button
                type="button"
                data-testid="divisor-align-ab"
                onClick={onAlignAxisAB}
                className={cn(
                  "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                  isDark
                    ? "bg-cyan-950/80 text-cyan-200 border-cyan-500/40"
                    : "bg-cyan-100 text-cyan-900 border-cyan-400",
                )}
              >
                Alinhar X&apos; A–B
              </button>
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={`div-n-${n}`}
                  type="button"
                  data-testid={`divisor-btn-${n}`}
                  onClick={() => onDivideSpanAB(n)}
                  className={cn(
                    "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                    activeSpanDivision?.divisionsN === n
                      ? "bg-cyan-500 text-slate-950 border-cyan-300"
                      : isDark
                        ? "bg-slate-900 text-purple-200 border-purple-500/40"
                        : "bg-purple-50 text-purple-900 border-purple-300",
                  )}
                >
                  ÷{n}
                </button>
              ))}
              {onOpenCustomDivisionKeypad && (
                <button
                  type="button"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    onOpenCustomDivisionKeypad(
                      activeSpanDivision?.divisionsN ?? 4,
                      { x: r.left, y: r.top },
                    );
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                    isDark
                      ? "bg-slate-800 text-cyan-300 border-cyan-500/40"
                      : "bg-cyan-50 text-cyan-900 border-cyan-400",
                  )}
                >
                  ÷N...
                </button>
              )}
              <button
                type="button"
                data-testid="divisor-dimension-ab"
                onClick={onDimensionAB}
                className={cn(
                  "px-2 py-0.5 rounded-md border font-bold cursor-pointer",
                  isDark
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                    : "bg-emerald-100 text-emerald-900 border-emerald-400",
                )}
              >
                📏 Cotar A–B
              </button>
            </>
          ) : (
            <span className={cn("px-1", isDark ? "text-slate-400" : "text-slate-600")}>
              Posicione pelo menos 2 Marcos/Âncoras (A e B) na geometria para habilitar Ponto Médio A–B, Alinhar X&apos; A–B, Dividir Vão (÷N) e Cotar A–B.
            </span>
          )}
        </div>
      )}

      {openSubMenu === "echo" && (
        <div
          data-testid="anchor-submenu-echo"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9px]",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-cyan-400" : "text-cyan-800")}>
            Eco Vivo:
          </span>
          {(
            [
              { id: "off", label: "OFF" },
              { id: "mirror_x", label: "Espelho X'" },
              { id: "mirror_y", label: "Espelho Y'" },
              { id: "mirror_xy", label: "Espelho X'+Y'" },
              { id: "radial", label: "Radial (6× 360°)" },
              { id: "linear", label: "Linear X'" },
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
          {referenceState.echo.mode !== "off" && (
            <button
              type="button"
              data-testid="echo-commit-btn"
              onClick={onCommitEchoEntities}
              className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
            >
              ✓ Aplicar Eco na Peça
            </button>
          )}
        </div>
      )}

      {openSubMenu === "table" && (
        <div
          data-testid="anchor-submenu-table"
          className={cn(
            "flex items-center gap-1 overflow-x-auto scrollbar-none pt-1 border-t font-mono text-[9px]",
            isDark ? "border-slate-800/80" : "border-slate-200",
          )}
        >
          <span className={cn("font-bold px-1", isDark ? "text-purple-300" : "text-purple-800")}>
            Tabela de Furos (X&apos;, Y&apos;, Ø):
          </span>
          <button
            type="button"
            data-testid="table-generate-cad-btn"
            onClick={() => onGenerateTable(false)}
            className="px-2 py-0.5 rounded-md bg-purple-700 hover:bg-purple-600 text-white font-bold cursor-pointer"
          >
            + Inserir Cotas na Camada COTAS
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
    </div>
  );
};

