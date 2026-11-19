/**
 * CALDRA CHAMFER — GAVETA LATERAL DIREITA COMPACTA (CHAPA / SEÇÃO / RESTRIÇÕES / BUSCA)
 *
 * - Ancorada na borda direita em paisagem/desktop (`right: 8px`, `top: 48px`, `bottom: 44px`,
 *   largura compacta `304px`) e folha inferior compacta (`<= 44dvh`) em retrato — mantendo
 *   100% da peça visível no canvas ao vivo durante ajustes e testes.
 * - 100% sincronizada aos tokens dinâmicos `--chamfer-*` (Tema Claro / Escuro / AMOLED +
 *   Cor de Destaque escolhida pelo usuário), zero cores hardcoded.
 */

import React, { useMemo, useState } from "react";
import { X, Scissors, Layers, Search, Sparkles, Download, FlipHorizontal2, ShieldAlert } from "lucide-react";
import {
  DEFAULT_SHEET_METAL_RULES,
  computeBendMath,
  createContourFlange,
  computeFlatPattern,
  exportBendTableCsv,
  exportLaserInsideOutDxf,
  type SheetMetalRule,
} from "@/chamfer/sheetMetal/bendTree";
import {
  getValidConstraintsForSelection,
  type SketchConstraintType,
} from "@/chamfer/sketch/constraintSolver";
import { CHAMFER_COMMAND_REGISTRY } from "@/lib/lab2d/chamferCommandRegistry";
import { triggerHaptic } from "@/lib/ui/haptics";

export type ParametricSuiteTab = "sheet" | "section" | "constraints" | "sbox";

export interface ChamferParametricSuiteDrawerProps {
  open: boolean;
  initialTab?: ParametricSuiteTab;
  onClose: () => void;
  /** Section Analysis live state & callbacks */
  sectionState: { enabled: boolean; axis: "XY" | "XZ" | "YZ"; offsetMm: number; flipped: boolean };
  onSectionChange: (next: { enabled: boolean; axis: "XY" | "XZ" | "YZ"; offsetMm: number; flipped: boolean }) => void;
  /** Massa e Volume reais da peça ativa */
  massSummary: { volumeCm3: number; areaCm2: number; massKg: number; centerZMm: number };
  /** Callback de exportação Vista Atual -> DXF */
  onExportCurrentViewDxf?: (includeHidden: boolean) => void;
  /** Callbacks de Restrições 2D */
  dofInfo?: { dof: number; statusLabel: string; conflictMessage?: string };
  selectionCounts?: { points: number; lines: number; circles: number };
  onApplyConstraint?: (type: SketchConstraintType) => void;
  onAutoConstrain?: () => void;
  /** Callback de Busca Rápida S-Box */
  onRunQuickCommand?: (cmdId: string) => void;
  /** Regra de chapa sincronizada com CHAPA X.X MM */
  activeThicknessMm?: number;
  onSheetRuleThicknessChange?: (thicknessMm: number) => void;
}

const stopCanvasEvent = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

export function ChamferParametricSuiteDrawer({
  open,
  initialTab = "sheet",
  onClose,
  sectionState,
  onSectionChange,
  massSummary,
  onExportCurrentViewDxf,
  dofInfo,
  selectionCounts = { points: 0, lines: 2, circles: 0 },
  onApplyConstraint,
  onAutoConstrain,
  onRunQuickCommand,
  activeThicknessMm = 3.0,
  onSheetRuleThicknessChange,
}: ChamferParametricSuiteDrawerProps) {
  const [tab, setTab] = useState<ParametricSuiteTab>(initialTab);
  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    DEFAULT_SHEET_METAL_RULES.find((r) => Math.abs(r.thicknessMm - activeThicknessMm) < 0.2)?.id ?? "ac_11",
  );
  const [legA, setLegA] = useState(40);
  const [legB, setLegB] = useState(30);
  const [bendAngle, setBendAngle] = useState(90);
  const [flangeWidth, setFlangeWidth] = useState(80);
  const [includeHiddenDxf, setIncludeHiddenDxf] = useState(false);
  const [sboxQuery, setSboxQuery] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showMoreConstraints, setShowMoreConstraints] = useState(false);

  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const activeRule: SheetMetalRule =
    DEFAULT_SHEET_METAL_RULES.find((r) => r.id === selectedRuleId) ?? DEFAULT_SHEET_METAL_RULES[4]!;

  const bendPreview = useMemo(
    () => computeBendMath(bendAngle, activeRule.thicknessMm, activeRule.innerRadiusMm, activeRule.kFactor),
    [bendAngle, activeRule],
  );

  const flatPattern = useMemo(() => {
    const part = createContourFlange({
      name: `Chapa L ${legA}x${legB}`,
      extrudeWidthMm: flangeWidth,
      externalLegsMm: [legA, legB],
      bendAnglesDeg: [bendAngle],
      rule: activeRule,
      holesOnRoot: [{ id: "f1", x: Math.min(legA * 0.4, 15), y: flangeWidth / 2, diameterMm: 10 }],
    });
    return computeFlatPattern(part);
  }, [legA, legB, bendAngle, flangeWidth, activeRule]);

  const smartConstraints = useMemo(
    () =>
      getValidConstraintsForSelection({
        pointIds: Array.from({ length: selectionCounts.points }, (_, i) => `p${i}`),
        lineIds: Array.from({ length: selectionCounts.lines }, (_, i) => `l${i}`),
        circleIds: Array.from({ length: selectionCounts.circles }, (_, i) => `c${i}`),
      }),
    [selectionCounts],
  );

  const quickCommands = useMemo(() => {
    const q = sboxQuery.trim().toLowerCase();
    const extra = [
      { id: "solid.pressPull", label: "Press-Pull (Face 3D)", group: "3D" },
      { id: "solid.thinExtrude", label: "Thin Extrude (Parede Aberta)", group: "3D" },
      { id: "solid.hole", label: "Furo Industrial (2 Arestas / Broca 118°)", group: "3D" },
      { id: "solid.draft", label: "Draft (Ângulo de Saída 3D)", group: "3D" },
      { id: "solid.coil", label: "Coil (Mola / Hélice 3D)", group: "3D" },
      { id: "solid.split", label: "Split Body / Face 3D", group: "3D" },
      { id: "solid.combine", label: "Combine (União / Subtração / Interseção)", group: "3D" },
      { id: "construct.planeAlongPath", label: "Plano Along Path (s ∈ [0,1])", group: "Construção" },
      { id: "sheet.contourFlange", label: "Contour Flange (L / U / Z / Ômega)", group: "Chapa" },
      { id: "sheet.flatPattern", label: "Planificar Chapa & DXF Inside-Out", group: "Chapa" },
      { id: "inspect.section", label: "Section Analysis (Corte Hachurado)", group: "Inspeção" },
      { id: "inspect.viewToDxf", label: "Vista Atual -> DXF 1:1", group: "Inspeção" },
      { id: "parameters.open", label: "fx Parâmetros & Configurações", group: "Paramétrico" },
      { id: "timeline.open", label: "⏱ Histórico & Rollback", group: "Paramétrico" },
    ];
    const base = CHAMFER_COMMAND_REGISTRY.slice(0, 45).map((c) => ({
      id: c.id,
      label: c.fullLabel || c.label,
      group: c.verticalCategory,
    }));
    const merged = [...extra, ...base];
    return q
      ? merged
          .filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
          .slice(0, 16)
      : merged.slice(0, 14);
  }, [sboxQuery]);

  if (!open) return null;

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setToastMsg(`Arquivo gerado: ${filename}`);
    setTimeout(() => setToastMsg(null), 2400);
  };

  return (
    <aside
      role="dialog"
      aria-label="Suite Paramétrica CHAMFER"
      data-testid="chamfer-parametric-suite-drawer"
      onPointerDown={stopCanvasEvent}
      onWheel={stopCanvasEvent}
      onClick={stopCanvasEvent}
      style={{
        backgroundColor: "var(--chamfer-popover-bg)",
        borderColor: "var(--chamfer-border-strong)",
        color: "var(--chamfer-text-primary)",
        boxShadow: "var(--chamfer-toast-shadow)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
      className="fixed bottom-2 left-2 right-2 z-[115] flex max-h-[44dvh] flex-col overflow-hidden rounded-2xl border select-none transition-colors sm:bottom-[44px] sm:left-auto sm:right-2 sm:top-[48px] sm:max-h-none sm:w-[316px]"
    >
      {/* Header & Abas */}
      <div
        style={{
          backgroundColor: "var(--chamfer-bar-bg)",
          borderColor: "var(--chamfer-border)",
        }}
        className="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-1.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {(
            [
              { id: "sheet", label: "Chapa", icon: Layers },
              { id: "section", label: "Seção", icon: Scissors },
              { id: "constraints", label: "Restr.", icon: Sparkles },
              { id: "sbox", label: "Busca", icon: Search },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={
                  active
                    ? {
                        backgroundColor: "var(--chamfer-accent)",
                        borderColor: "var(--chamfer-accent)",
                        color: "var(--chamfer-accent-contrast)",
                      }
                    : {
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-secondary)",
                      }
                }
                className="flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-xl border px-1.5 text-[10px] font-semibold transition cursor-pointer whitespace-nowrap"
              >
                <Icon className="size-3 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar suite paramétrica"
          style={{ color: "var(--chamfer-text-secondary)" }}
          className="flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-xl transition hover:opacity-80 cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {toastMsg && (
        <div
          style={{
            borderColor: "var(--chamfer-status-success)",
            color: "var(--chamfer-status-success)",
            backgroundColor: "var(--chamfer-surface-elevated)",
          }}
          className="mx-2.5 mt-2 rounded-xl border px-2.5 py-1 text-[11px] font-medium"
        >
          {toastMsg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2.5">
        {/* ABA 1: CHAPA METÁLICA INDUSTRIAL & DXF INSIDE-OUT */}
        {tab === "sheet" && (
          <div className="flex flex-col gap-2.5">
            <div>
              <label
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
              >
                Regra de Chapa (T / R interno / Fator K)
              </label>
              <select
                value={selectedRuleId}
                onChange={(e) => {
                  setSelectedRuleId(e.target.value);
                  const found = DEFAULT_SHEET_METAL_RULES.find((r) => r.id === e.target.value);
                  if (found) onSheetRuleThicknessChange?.(found.thicknessMm);
                }}
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="min-h-[38px] w-full rounded-xl border px-2.5 text-xs font-semibold outline-none focus:border-[var(--chamfer-accent)]"
              >
                {DEFAULT_SHEET_METAL_RULES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · R={r.innerRadiusMm}mm · K={r.kFactor}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Aba A (mm)", val: legA, set: setLegA },
                { label: "Aba B (mm)", val: legB, set: setLegB },
                { label: "Ângulo (°)", val: bendAngle, set: setBendAngle },
                { label: "Largura (mm)", val: flangeWidth, set: setFlangeWidth },
              ].map((f) => (
                <label key={f.label} className="flex flex-col gap-0.5">
                  <span
                    style={{ color: "var(--chamfer-text-secondary)" }}
                    className="text-[10px] font-semibold"
                  >
                    {f.label}
                  </span>
                  <input
                    type="number"
                    value={f.val}
                    onChange={(e) => f.set(Math.max(1, Number(e.target.value) || 1))}
                    style={{
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }}
                    className="min-h-[36px] rounded-xl border px-2 font-mono text-xs outline-none focus:border-[var(--chamfer-accent)]"
                  />
                </label>
              ))}
            </div>

            {/* Resumo Matemático ABNT/ISO */}
            <div
              style={{
                backgroundColor: "var(--chamfer-accent-soft)",
                borderColor: "var(--chamfer-accent-border)",
              }}
              className="grid grid-cols-2 gap-2 rounded-xl border p-2 font-mono text-[11px]"
            >
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px]">
                  BA
                </div>
                <div style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                  {bendPreview.bendAllowanceMm.toFixed(4)} mm
                </div>
              </div>
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px]">
                  OSSB
                </div>
                <div style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                  {bendPreview.outsideSetbackMm.toFixed(4)} mm
                </div>
              </div>
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px]">
                  BD
                </div>
                <div style={{ color: "var(--chamfer-status-warning)" }} className="font-bold">
                  {bendPreview.bendDeductionMm.toFixed(4)} mm
                </div>
              </div>
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px]">
                  L Planificado
                </div>
                <div style={{ color: "var(--chamfer-status-success)" }} className="font-bold">
                  {flatPattern.developedLengthMm.toFixed(4)} mm
                </div>
              </div>
            </div>

            {/* Ações 1-Toque */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("heavy");
                  const dxf = exportLaserInsideOutDxf(flatPattern);
                  triggerDownload("chapa_planificada_laser_inside_out.dxf", dxf, "application/dxf");
                }}
                style={{
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }}
                className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition hover:brightness-110 active:scale-95 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Planificar & DXF Inside-Out</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  const csv = exportBendTableCsv(flatPattern.bendTable);
                  triggerDownload("tabela_dobras.csv", csv, "text/csv;charset=utf-8");
                }}
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition hover:opacity-85 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Tabela Dobras CSV</span>
              </button>
            </div>
          </div>
        )}

        {/* ABA 2: SECTION ANALYSIS COM HACHURA 45° + MASSA + VISTA -> DXF */}
        {tab === "section" && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                {(["XY", "XZ", "YZ"] as const).map((ax) => {
                  const isAx = sectionState.enabled && sectionState.axis === ax;
                  return (
                    <button
                      key={ax}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onSectionChange({ ...sectionState, enabled: true, axis: ax });
                      }}
                      style={
                        isAx
                          ? {
                              backgroundColor: "var(--chamfer-accent)",
                              borderColor: "var(--chamfer-accent)",
                              color: "var(--chamfer-accent-contrast)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-surface-elevated)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-secondary)",
                            }
                      }
                      className="min-h-[38px] min-w-[46px] rounded-xl border font-mono text-xs font-bold transition cursor-pointer"
                    >
                      {ax}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onSectionChange({
                      ...sectionState,
                      enabled: true,
                      flipped: !sectionState.flipped,
                    })
                  }
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-primary)",
                  }}
                  className="flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition hover:opacity-85 cursor-pointer"
                >
                  <FlipHorizontal2 style={{ color: "var(--chamfer-accent)" }} className="size-3.5" />
                  <span>Inverter</span>
                </button>
                {sectionState.enabled && (
                  <button
                    type="button"
                    onClick={() => onSectionChange({ ...sectionState, enabled: false })}
                    style={{
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-status-error)",
                      color: "var(--chamfer-status-error)",
                    }}
                    className="min-h-[38px] rounded-xl border px-2.5 text-[11px] font-semibold cursor-pointer"
                  >
                    Off
                  </button>
                )}
              </div>
            </div>

            {/* Slider tátil + distância exata */}
            <div
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
              }}
              className="flex flex-col gap-1.5 rounded-xl border p-2.5"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--chamfer-text-secondary)" }}>Distância do Plano</span>
                <span style={{ color: "var(--chamfer-accent)" }} className="font-mono font-bold">
                  {sectionState.offsetMm.toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min={-150}
                max={150}
                step={0.5}
                value={sectionState.offsetMm}
                onChange={(e) =>
                  onSectionChange({
                    ...sectionState,
                    enabled: true,
                    offsetMm: Number(e.target.value),
                  })
                }
                style={{ accentColor: "var(--chamfer-accent)" }}
                className="h-3 w-full cursor-pointer touch-none"
              />
            </div>

            {/* Propriedades de Massa */}
            <div
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
              }}
              className="grid grid-cols-3 gap-1.5 rounded-xl border p-2 font-mono text-[10.5px]"
            >
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[9.5px]">
                  Volume
                </div>
                <div className="font-bold">{massSummary.volumeCm3.toFixed(2)} cm³</div>
              </div>
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[9.5px]">
                  Massa
                </div>
                <div style={{ color: "var(--chamfer-status-success)" }} className="font-bold">
                  {massSummary.massKg.toFixed(3)} kg
                </div>
              </div>
              <div>
                <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[9.5px]">
                  CG Z
                </div>
                <div style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                  {massSummary.centerZMm.toFixed(1)} mm
                </div>
              </div>
            </div>

            {/* Vista Atual -> DXF */}
            <div className="flex flex-col gap-1.5">
              <label
                style={{ color: "var(--chamfer-text-secondary)" }}
                className="flex min-h-[34px] cursor-pointer items-center gap-2 text-[11px]"
              >
                <input
                  type="checkbox"
                  checked={includeHiddenDxf}
                  onChange={(e) => setIncludeHiddenDxf(e.target.checked)}
                  style={{ accentColor: "var(--chamfer-accent)" }}
                  className="size-4"
                />
                <span>Tracejar arestas ocultas (HIDDEN)</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("heavy");
                  onExportCurrentViewDxf?.(includeHiddenDxf);
                  setToastMsg("Vista ortográfica 1:1 exportada para DXF");
                  setTimeout(() => setToastMsg(null), 2200);
                }}
                style={{
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }}
                className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition hover:brightness-110 active:scale-95 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>Vista Atual → DXF</span>
              </button>
            </div>
          </div>
        )}

        {/* ABA 3: PÍLULA INTELIGENTE DE RESTRIÇÕES 2D & DOF */}
        {tab === "constraints" && (
          <div className="flex flex-col gap-2.5">
            <div
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
              }}
              className="flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  style={{
                    backgroundColor: dofInfo?.conflictMessage
                      ? "var(--chamfer-status-error)"
                      : dofInfo?.dof === 0
                        ? "var(--chamfer-status-success)"
                        : "var(--chamfer-accent)",
                  }}
                  className="inline-block size-2.5 shrink-0 rounded-full"
                />
                <span className="truncate text-[11px] font-bold">
                  {dofInfo?.statusLabel ?? "Livre (esboço pronto)"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic("heavy");
                  onAutoConstrain?.();
                }}
                style={{
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }}
                className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-xl px-2.5 text-[11px] font-bold transition hover:brightness-110 cursor-pointer"
              >
                <Sparkles className="size-3" />
                <span>Auto</span>
              </button>
            </div>

            {dofInfo?.conflictMessage && (
              <div
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-status-error)",
                  color: "var(--chamfer-status-error)",
                }}
                className="flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px]"
              >
                <ShieldAlert className="size-4 shrink-0" />
                <span>{dofInfo.conflictMessage}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {smartConstraints.primary.map((chip) => (
                <button
                  key={chip.type}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onApplyConstraint?.(chip.type);
                  }}
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-primary)",
                  }}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                >
                  <span style={{ color: "var(--chamfer-accent)" }} className="font-mono">
                    {chip.icon}
                  </span>
                  <span>{chip.shortLabel}</span>
                </button>
              ))}
              {smartConstraints.more.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMoreConstraints((v) => !v)}
                  style={{
                    backgroundColor: "var(--chamfer-accent-soft)",
                    borderColor: "var(--chamfer-accent-border)",
                    color: "var(--chamfer-accent)",
                  }}
                  className="min-h-[38px] rounded-xl border px-2.5 text-[11px] font-semibold cursor-pointer"
                >
                  {showMoreConstraints ? "Menos" : `Mais (+${smartConstraints.more.length})`}
                </button>
              )}
            </div>

            {showMoreConstraints && smartConstraints.more.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {smartConstraints.more.map((chip) => (
                  <button
                    key={chip.type}
                    type="button"
                    onClick={() => onApplyConstraint?.(chip.type)}
                    style={{
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold cursor-pointer"
                  >
                    <span style={{ color: "var(--chamfer-accent)" }} className="font-mono">
                      {chip.icon}
                    </span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 4: BUSCA RÁPIDA DE COMANDOS (S-BOX MOBILE) */}
        {tab === "sbox" && (
          <div className="flex flex-col gap-2">
            <div className="relative flex items-center">
              <Search
                style={{ color: "var(--chamfer-text-muted)" }}
                className="pointer-events-none absolute left-2.5 size-3.5"
              />
              <input
                type="text"
                value={sboxQuery}
                onChange={(e) => setSboxQuery(e.target.value)}
                placeholder="Buscar comando 2D, 3D, Chapa, Seção..."
                style={{
                  backgroundColor: "var(--chamfer-surface-elevated)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="min-h-[38px] w-full rounded-xl border pl-8 pr-2.5 text-xs outline-none focus:border-[var(--chamfer-accent)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              {quickCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onRunQuickCommand?.(cmd.id);
                    onClose();
                  }}
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-primary)",
                  }}
                  className="flex min-h-[38px] items-center justify-between rounded-xl border px-2.5 text-left text-[11px] font-semibold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                >
                  <span className="truncate">{cmd.label}</span>
                  <span
                    style={{
                      backgroundColor: "var(--chamfer-accent-soft)",
                      color: "var(--chamfer-accent)",
                    }}
                    className="ml-2 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase"
                  >
                    {cmd.group}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
