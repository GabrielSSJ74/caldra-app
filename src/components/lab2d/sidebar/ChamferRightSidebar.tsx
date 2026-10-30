/**
 * CALDRA CHAMFER — JANELA LATERAL DIREITA REESTRUTURADA (CHAMFER 2D)
 *
 * Reúne de forma integrada e compacta:
 * - ABA 1: PROPRIEDADES (Inspetor CAD contextual com editor numérico compacto)
 * - ABA 2: CAMADAS (Gestão completa de camadas, visibilidade, bloqueio, cores técnicas)
 * - ABA 3: CORTE (Material, Processo, Parâmetros e Preparação CNC)
 * - ABA 4: COTAS (Gestão de cotagem associativa)
 *
 * Responsividade & Canvas Priority:
 * - Permite expandir/recolher a qualquer momento.
 * - Ao recolher, o canvas recupera automaticamente todo o espaço.
 * - No mobile landscape, mantém proporções compactas sem sobrepor a peça.
 */

import React, { useState, useEffect } from "react";
import {
  Sliders,
  Layers,
  Scissors,
  Ruler,
  ChevronRight,
  ChevronLeft,
  X,
  Maximize2,
  Minimize2,
  Box,
  ScanEye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/ui/haptics";
import type { Entity, Layer } from "@/lib/lab2d/core";
import type { Dimension, DimKind } from "@/lib/lab2d/dimensions";
import type { ShareCandidate } from "@/lib/lab2d/sharedCut";
import { ChamferPropertiesTab } from "./ChamferPropertiesTab";
import { ChamferLayersTab } from "./ChamferLayersTab";
import { ChamferCutTab } from "./ChamferCutTab";

export type ChamferSidebarTab = "propriedades" | "camadas" | "corte" | "cotas" | "eng_rev";

interface ChamferRightSidebarProps {
  open: boolean;
  onToggleOpen: () => void;
  activeTab: ChamferSidebarTab;
  onTabChange: (tab: ChamferSidebarTab) => void;
  // Geometria e Seleção
  entities: Entity[];
  selection: string[];
  setSelection: (ids: string[]) => void;
  commit: (updater: Entity[] | ((prev: Entity[]) => Entity[])) => void;
  // Camadas
  layers: Layer[];
  setLayers: (layers: Layer[] | ((prev: Layer[]) => Layer[])) => void;
  activeLayer: string;
  setActiveLayer: (layerId: string) => void;
  // Propriedades do Projeto
  thickness: number;
  onThicknessChange: (th: number) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  material: string;
  onMaterialChange: (mat: string) => void;
  kFactor?: number;
  onKFactorChange?: (k: number) => void;
  bendRadius?: number;
  onBendRadiusChange?: (r: number) => void;
  finish?: string;
  onFinishChange?: (f: string) => void;
  // Cotas
  dims?: Dimension[];
  onDimsChange?: (dims: Dimension[]) => void;
  dimKind?: DimKind;
  onDimKindChange?: (k: DimKind) => void;
  dimSel?: string | null;
  onDimSelect?: (id: string | null) => void;
  renderCotas?: () => React.ReactNode;
  renderRevEng?: () => React.ReactNode;
  onDivideEntity?: (e: Entity) => void;
  // Callbacks de corte
  onHighlightCut?: (cand: ShareCandidate | null) => void;
  isDark?: boolean;
  className?: string;
}

export function ChamferRightSidebar({
  open,
  onToggleOpen,
  activeTab,
  onTabChange,
  entities,
  selection,
  setSelection,
  commit,
  layers,
  setLayers,
  activeLayer,
  setActiveLayer,
  thickness,
  onThicknessChange,
  projectName,
  onProjectNameChange,
  material,
  onMaterialChange,
  kFactor,
  onKFactorChange,
  bendRadius,
  onBendRadiusChange,
  finish,
  onFinishChange,
  dims = [],
  onDimsChange,
  dimKind = "linear",
  onDimKindChange,
  dimSel = null,
  onDimSelect,
  renderCotas,
  renderRevEng,
  onDivideEntity,
  onHighlightCut,
  isDark = true,
  className,
}: ChamferRightSidebarProps) {
  // Se a barra estiver fechada / recolhida, exibe o mini-dock lateral
  if (!open) {
    return (
      <aside
        style={{
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
          color: "var(--chamfer-text-secondary)",
        }}
        className="relative z-30 flex flex-col items-center justify-start border py-2 select-none shadow-md backdrop-blur-md transition-all w-8 sm:w-9 shrink-0 rounded-2xl"
      >
        {/* Botão de Expandir Painel */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            onToggleOpen();
          }}
          title="Expandir Janela Lateral Direita (Propriedades / Camadas / Corte / Eng. Reversa)"
          aria-label="Expandir Janela Lateral"
          style={{
            backgroundColor: "var(--chamfer-surface-elevated)",
            borderColor: "var(--chamfer-border)",
            color: "var(--chamfer-text-primary)",
          }}
          className="mb-3 flex size-7 items-center justify-center rounded-full border transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* Abas Rápidas no Mini-Dock */}
        <div className="flex flex-col gap-2">
          {/* PROPRIEDADES */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onTabChange("propriedades");
              onToggleOpen();
            }}
            title="Propriedades CAD"
            style={
              activeTab === "propriedades"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : { color: "var(--chamfer-text-secondary)" }
            }
            className="flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer"
          >
            <Sliders className="size-3.5" />
          </button>

          {/* CAMADAS */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onTabChange("camadas");
              onToggleOpen();
            }}
            title="Camadas Técnicas"
            style={
              activeTab === "camadas"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : { color: "var(--chamfer-text-secondary)" }
            }
            className="flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer"
          >
            <Layers className="size-3.5" />
          </button>

          {/* CORTE */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onTabChange("corte");
              onToggleOpen();
            }}
            title="Plano de Corte e Fabricação"
            style={
              activeTab === "corte"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : { color: "var(--chamfer-text-secondary)" }
            }
            className="flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer"
          >
            <Scissors className="size-3.5" />
          </button>

          {/* ENG. REV. (ENGENHARIA REVERSA E BANCADA MECÂNICA) */}
          {renderRevEng && (
            <button
              type="button"
              data-testid="chamfer-minidock-tab-eng-rev"
              onClick={() => {
                triggerHaptic("selection");
                onTabChange("eng_rev");
                onToggleOpen();
              }}
              title="Engenharia Reversa e Bancada Mecânica (ENG. REV.)"
              style={
                activeTab === "eng_rev"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer"
            >
              <ScanEye className="size-3.5" />
            </button>
          )}

          {/* COTAS */}
          {dims.length > 0 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onTabChange("cotas");
                onToggleOpen();
              }}
              title="Cotas"
              style={
                activeTab === "cotas"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer"
            >
              <Ruler className="size-3.5" />
            </button>
          )}
        </div>
      </aside>
    );
  }

  // -------------------------------------------------------------------------
  // JANELA LATERAL DIREITA COMPACTA EXPANDIDA (GAVETA OVERLAY NO MODO RETRATO)
  // -------------------------------------------------------------------------
  return (
    <aside
      style={{
        backgroundColor: "var(--chamfer-bar-bg)",
        borderColor: "var(--chamfer-border)",
        color: "var(--chamfer-text-primary)",
      }}
      className={cn(
        "z-40 flex w-[265px] max-w-[86vw] sm:w-[285px] shrink-0 flex-col overflow-hidden border-l select-none shadow-2xl backdrop-blur-md transition-all",
        "max-md:absolute max-md:right-1 max-md:top-1 max-md:bottom-1 max-md:rounded-2xl max-md:border md:relative",
        className,
      )}
    >
      {/* ---------------------------------------------------- */}
      {/* CABEÇALHO COM ABAS (PROPRIEDADES, CAMADAS, CORTE)    */}
      {/* ---------------------------------------------------- */}
      <div
        style={{
          backgroundColor: "var(--chamfer-surface-elevated)",
          borderColor: "var(--chamfer-border)",
        }}
        className="flex h-10 shrink-0 items-center justify-between border-b px-2"
      >
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {/* ABA PROPRIEDADES */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onTabChange("propriedades");
            }}
            style={
              activeTab === "propriedades"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : { color: "var(--chamfer-text-secondary)" }
            }
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer"
          >
            <Sliders className="size-3" />
            <span>PROPRIEDADES</span>
          </button>

          {/* ABA CAMADAS */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onTabChange("camadas");
            }}
            style={
              activeTab === "camadas"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : { color: "var(--chamfer-text-secondary)" }
            }
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer"
          >
            <Layers className="size-3" />
            <span>CAMADAS</span>
          </button>

          {/* ABA CORTE */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onTabChange("corte");
            }}
            style={
              activeTab === "corte"
                ? {
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }
                : { color: "var(--chamfer-text-secondary)" }
            }
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer"
          >
            <Scissors className="size-3" />
            <span>CORTE</span>
          </button>

          {/* ABA ENG. REV. (ENGENHARIA REVERSA E BANCADA MECÂNICA) */}
          {renderRevEng && (
            <button
              type="button"
              data-testid="chamfer-sidebar-tab-eng-rev"
              onClick={() => {
                triggerHaptic("selection");
                onTabChange("eng_rev");
              }}
              style={
                activeTab === "eng_rev"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer shrink-0"
            >
              <ScanEye className="size-3" />
              <span>ENG. REV.</span>
            </button>
          )}

          {/* ABA COTAS (quando disponível) */}
          {renderCotas && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onTabChange("cotas");
              }}
              style={
                activeTab === "cotas"
                  ? {
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }
                  : { color: "var(--chamfer-text-secondary)" }
              }
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer shrink-0"
            >
              <Ruler className="size-3" />
              <span>COTAS</span>
            </button>
          )}
        </div>

        {/* Botão de Recolher Janela */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            onToggleOpen();
          }}
          title="Recolher janela lateral (recuperar espaço do canvas)"
          aria-label="Recolher janela lateral"
          style={{ color: "var(--chamfer-text-secondary)" }}
          className="rounded-lg p-1 transition-colors cursor-pointer ml-1"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* ---------------------------------------------------- */}
      {/* CONTEÚDO SCROLLÁVEL DA ABA ATIVA                     */}
      {/* ---------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto px-2.5 pt-2.5 scrollbar-thin">
        {activeTab === "propriedades" && (
          <ChamferPropertiesTab
            entities={entities}
            selection={selection}
            setSelection={setSelection}
            layers={layers}
            thickness={thickness}
            onThicknessChange={onThicknessChange}
            onUpdateEntity={(updated) => {
              commit((list) => list.map((x) => (x.id === updated.id ? updated : x)));
            }}
            onDeleteEntity={(id) => {
              commit((list) => list.filter((x) => x.id !== id));
            }}
            onDuplicateEntity={(ent) => {
              commit((list) => [...list, ent]);
            }}
            onDivideEntity={onDivideEntity}
            projectName={projectName}
            onProjectNameChange={onProjectNameChange}
            material={material}
            onMaterialChange={onMaterialChange}
            kFactor={kFactor}
            onKFactorChange={onKFactorChange}
            bendRadius={bendRadius}
            onBendRadiusChange={onBendRadiusChange}
            isDark={isDark}
          />
        )}

        {activeTab === "camadas" && (
          <ChamferLayersTab
            layers={layers}
            setLayers={setLayers}
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            entities={entities}
            setSelection={setSelection}
            commit={commit}
            isDark={isDark}
          />
        )}

        {activeTab === "corte" && (
          <ChamferCutTab
            entities={entities}
            commit={commit}
            selection={selection}
            setSelection={setSelection}
            thickness={thickness}
            onThicknessChange={onThicknessChange}
            material={material}
            onMaterialChange={onMaterialChange}
            finish={finish}
            onFinishChange={onFinishChange}
            onHighlightCut={onHighlightCut}
            isDark={isDark}
          />
        )}

        {activeTab === "eng_rev" && renderRevEng?.()}

        {activeTab === "cotas" && (
          <div className="p-1">
            {renderCotas?.()}
          </div>
        )}
      </div>
    </aside>
  );
}
