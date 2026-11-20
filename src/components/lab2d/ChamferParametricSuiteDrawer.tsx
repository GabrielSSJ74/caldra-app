/**
 * CALDRA CHAMFER — GAVETA LATERAL DIREITA COMPACTA (CHAPA / SEÇÃO / RESTRIÇÕES / BUSCA)
 *
 * - Ancorada na borda direita em paisagem/desktop (`right: 8px`, `top: 48px`, `bottom: 44px`,
 *   largura compacta `316px`) e folha inferior compacta (`<= 44dvh`) em retrato — mantendo
 *   100% da peça visível no canvas ao vivo durante ajustes e testes.
 * - Aba Chapa equipada com arquitetura completa `BendTree`:
 *   Dobrar (Fold com grau explícito, expressão paramétrica, chips 30°..135°, inverter lado fixo
 *   e sentido CIMA/BAIXO), Desdobrar (Unfold + Detector Automático de Ângulo Diedro), Redobrar
 *   (Refold com restauração exata do ângulo salvo), Edge Flange, Contour Flange, Furos (inclusive
 *   em zona de dobra desdobrada) e Flat Pattern + DXF Laser Inside-Out.
 * - 100% sincronizada aos tokens dinâmicos `--chamfer-*` (Tema Claro / Escuro / AMOLED +
 *   Cor de Destaque escolhida pelo usuário), ZERO cores hardcoded.
 */

import React, { useMemo, useState } from "react";
import {
  X,
  Scissors,
  Layers,
  Search,
  Sparkles,
  Download,
  FlipHorizontal2,
  ShieldAlert,
  ArrowLeftRight,
  ArrowUpDown,
  RotateCcw,
  Maximize2,
  Pin,
  ScanSearch,
  CircleDot,
  Plus,
  Eye,
} from "lucide-react";
import {
  DEFAULT_SHEET_METAL_RULES,
  computeBendMath,
  computeBodyFlatPattern,
  exportBendTableCsv,
  exportLaserInsideOutDxf,
  type BendDirection,
  type BendPositionMode,
  type SheetMetalBody,
  type SheetMetalRule,
} from "@/chamfer/sheetMetal/bendTree";
import {
  getValidConstraintsForSelection,
  type SketchConstraintType,
} from "@/chamfer/sketch/constraintSolver";
import { CHAMFER_COMMAND_REGISTRY } from "@/lib/lab2d/chamferCommandRegistry";
import { triggerHaptic } from "@/lib/ui/haptics";

export type ParametricSuiteTab = "sheet" | "section" | "constraints" | "sbox";
export type SheetSubTab = "fold" | "tree" | "flat";

export interface SheetFoldFormPayload {
  distanceFromEdgeMm: number;
  childExternalLegMm: number;
  targetAngleDeg: number;
  angleExpression?: string;
  direction: BendDirection;
  innerRadiusMm: number;
  kFactor: number;
  bendPosition: BendPositionMode;
  invertFixedSide: boolean;
}

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
  /** Estado vivo da BendTree de Chapa Metálica */
  sheetBody: SheetMetalBody;
  sheet3DPreviewActive: boolean;
  onToggleSheet3DPreview: () => void;
  selectedBendId: string | null;
  onSelectBendId: (bendId: string | null) => void;
  detectionChipText?: string | null;
  sheetError?: string | null;
  onSheetRuleChange: (rule: SheetMetalRule) => void;
  onSheetFold: (payload: SheetFoldFormPayload) => void;
  onSheetAddEdgeFlange: (payload: {
    externalLengthMm: number;
    targetAngleDeg: number;
    direction: BendDirection;
    innerRadiusMm: number;
    kFactor: number;
    angleExpression?: string;
  }) => void;
  onSheetCreateContourFlange: (payload: {
    preset: "L" | "U" | "Z";
    legA: number;
    legB: number;
    widthMm: number;
    angleDeg: number;
  }) => void;
  onSheetUnfold: (bendIds?: string[]) => void;
  onSheetRefold: (bendIds?: string[]) => void;
  onSheetEditBend: (
    bendId: string,
    patch: { targetAngleDeg?: number; direction?: BendDirection; innerRadiusMm?: number; kFactor?: number },
  ) => void;
  onSheetSwapFixedRoot: () => void;
  onSheetAddHole: (payload: {
    diameterMm: number;
    x: number;
    y: number;
    acrossUnfoldedBend?: boolean;
  }) => void;
  onSheetDetectDihedral: () => void;
  /** Preview live angle values when editing form before confirm */
  draftFoldAngleDeg: number;
  draftFoldDirection: BendDirection;
  onDraftFoldAngleChange: (angleDeg: number) => void;
  onDraftFoldDirectionChange: (dir: BendDirection) => void;
}

const stopCanvasEvent = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const QUICK_ANGLE_CHIPS = [30, 45, 60, 90, 120, 135] as const;

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
  onSheetRuleThicknessChange,
  sheetBody,
  sheet3DPreviewActive,
  onToggleSheet3DPreview,
  selectedBendId,
  onSelectBendId,
  detectionChipText,
  sheetError,
  onSheetRuleChange,
  onSheetFold,
  onSheetAddEdgeFlange,
  onSheetCreateContourFlange,
  onSheetUnfold,
  onSheetRefold,
  onSheetEditBend,
  onSheetSwapFixedRoot,
  onSheetAddHole,
  onSheetDetectDihedral,
  draftFoldAngleDeg,
  draftFoldDirection,
  onDraftFoldAngleChange,
  onDraftFoldDirectionChange,
}: ChamferParametricSuiteDrawerProps) {
  const [tab, setTab] = useState<ParametricSuiteTab>(initialTab);
  const [sheetSubTab, setSheetSubTab] = useState<SheetSubTab>("fold");

  // Formulário Dobrar (Fold) & Contour Flange
  const [distanceFromEdgeMm, setDistanceFromEdgeMm] = useState(40);
  const [childExternalLegMm, setChildExternalLegMm] = useState(30);
  const [flangeWidthMm, setFlangeWidthMm] = useState(80);
  const [angleExpression, setAngleExpression] = useState("");
  const [invertFixedSide, setInvertFixedSide] = useState(false);
  const [bendPosition, setBendPosition] = useState<BendPositionMode>("MATERIAL_INSIDE");
  const [overrideRadius, setOverrideRadius] = useState<number>(sheetBody.rule.innerRadiusMm);
  const [overrideK, setOverrideK] = useState<number>(sheetBody.rule.kFactor);

  // Formulário Furo na Chapa
  const [holeDiaMm, setHoleDiaMm] = useState(10);
  const [holeXMm, setHoleXMm] = useState(18);
  const [holeYMm, setHoleYMm] = useState(30);
  const [holeAcrossBend, setHoleAcrossBend] = useState(false);

  const [includeHiddenDxf, setIncludeHiddenDxf] = useState(false);
  const [sboxQuery, setSboxQuery] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showMoreConstraints, setShowMoreConstraints] = useState(false);

  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  React.useEffect(() => {
    setOverrideRadius(sheetBody.rule.innerRadiusMm);
    setOverrideK(sheetBody.rule.kFactor);
  }, [sheetBody.rule.id, sheetBody.rule.innerRadiusMm, sheetBody.rule.kFactor]);

  const bendsList = useMemo(() => Object.values(sheetBody.bends), [sheetBody.bends]);
  const unfoldedBendsCount = useMemo(
    () => bendsList.filter((b) => b.state === "UNFOLDED").length,
    [bendsList],
  );

  const bendPreview = useMemo(
    () =>
      computeBendMath(
        Math.max(1, Math.min(180, draftFoldAngleDeg || 90)),
        sheetBody.rule.thicknessMm,
        Math.max(0, overrideRadius),
        Math.max(0.05, Math.min(0.95, overrideK || 0.33)),
      ),
    [draftFoldAngleDeg, sheetBody.rule.thicknessMm, overrideRadius, overrideK],
  );

  const flatPattern = useMemo(() => computeBodyFlatPattern(sheetBody), [sheetBody]);

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
      { id: "sheet.fold", label: "Dobrar Chapa (Fold com Grau Explícito)", group: "Chapa" },
      { id: "sheet.unfold", label: "Desdobrar Chapa (Unfold / Auto Diedro)", group: "Chapa" },
      { id: "sheet.refold", label: "Redobrar Chapa (Refold Ângulo Salvo)", group: "Chapa" },
      { id: "sheet.edgeFlange", label: "Edge Flange (Aba de Borda)", group: "Chapa" },
      { id: "sheet.contourFlange", label: "Contour Flange (L / U / Z / Ômega)", group: "Chapa" },
      { id: "sheet.flatPattern", label: "Planificar Chapa & DXF Inside-Out", group: "Chapa" },
      { id: "solid.pressPull", label: "Press-Pull (Face 3D)", group: "3D" },
      { id: "solid.thinExtrude", label: "Thin Extrude (Parede Aberta)", group: "3D" },
      { id: "solid.hole", label: "Furo Industrial (2 Arestas / Broca 118°)", group: "3D" },
      { id: "solid.draft", label: "Draft (Ângulo de Saída 3D)", group: "3D" },
      { id: "solid.coil", label: "Coil (Mola / Hélice 3D)", group: "3D" },
      { id: "construct.planeAlongPath", label: "Plano Along Path (s ∈ [0,1])", group: "Construção" },
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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2400);
  };

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Arquivo gerado: ${filename}`);
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

      {sheetError && tab === "sheet" && (
        <div
          style={{
            borderColor: "var(--chamfer-status-error)",
            color: "var(--chamfer-status-error)",
            backgroundColor: "var(--chamfer-surface-elevated)",
          }}
          className="mx-2.5 mt-2 flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium"
        >
          <ShieldAlert className="size-3.5 shrink-0" />
          <span>{sheetError}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2.5">
        {/* ABA 1: CHAPA METÁLICA — BEND TREE, DETECTOR DIEDRO, DOBRAR/DESDOBRAR/REDOBRAR & DXF */}
        {tab === "sheet" && (
          <div className="flex flex-col gap-2.5">
            {/* Regra de Chapa + Preview 3D */}
            <div className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <label
                  style={{ color: "var(--chamfer-text-secondary)" }}
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                >
                  Regra de Chapa (T / R / K)
                </label>
                <select
                  value={sheetBody.rule.id}
                  onChange={(e) => {
                    const found = DEFAULT_SHEET_METAL_RULES.find((r) => r.id === e.target.value);
                    if (found) {
                      onSheetRuleChange(found);
                      onSheetRuleThicknessChange?.(found.thicknessMm);
                    }
                  }}
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-primary)",
                  }}
                  className="min-h-[36px] w-full rounded-xl border px-2 text-[11px] font-semibold outline-none focus:border-[var(--chamfer-accent)]"
                >
                  {DEFAULT_SHEET_METAL_RULES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · R{r.innerRadiusMm} · K{r.kFactor}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onToggleSheet3DPreview();
                }}
                style={
                  sheet3DPreviewActive
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
                title="Projetar BendTree da Chapa ao vivo no Viewport 3D (SOMB / SOMB+AR / ARAME)"
                className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl border px-2 text-[10.5px] font-bold transition cursor-pointer"
              >
                <Eye className="size-3.5" />
                <span>3D</span>
              </button>
            </div>

            {/* Botão Detector Automático de Ângulo Diedro + Chip de Confirmação */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                data-testid="sheet-detect-dihedral-btn"
                onClick={() => {
                  triggerHaptic("confirm");
                  onSheetDetectDihedral();
                  setSheetSubTab("tree");
                }}
                style={{
                  backgroundColor: "var(--chamfer-accent-soft)",
                  borderColor: "var(--chamfer-accent-border)",
                  color: "var(--chamfer-accent)",
                }}
                className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition hover:brightness-110 cursor-pointer"
              >
                <ScanSearch className="size-3.5 shrink-0" />
                <span>Detectar Dobras (Ângulo Diedro)</span>
              </button>
              {detectionChipText && (
                <div
                  data-testid="sheet-detection-chip"
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-status-success)",
                    color: "var(--chamfer-status-success)",
                  }}
                  className="rounded-xl border px-2.5 py-1.5 font-mono text-[10.5px] font-semibold"
                >
                  {detectionChipText}
                </div>
              )}
            </div>

            {/* Sub-abas da Chapa: Dobrar | BendTree (Desd./Red.) | Plano/DXF */}
            <div
              style={{
                backgroundColor: "var(--chamfer-surface-elevated)",
                borderColor: "var(--chamfer-border)",
              }}
              className="grid grid-cols-3 gap-1 rounded-xl border p-1"
            >
              {(
                [
                  { id: "fold", label: "Dobrar" },
                  { id: "tree", label: `Dobras (${bendsList.length})` },
                  { id: "flat", label: "Plano/DXF" },
                ] as const
              ).map((st) => {
                const active = sheetSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    data-testid={`sheet-subtab-${st.id}`}
                    onClick={() => setSheetSubTab(st.id)}
                    style={
                      active
                        ? {
                            backgroundColor: "var(--chamfer-accent)",
                            color: "var(--chamfer-accent-contrast)",
                          }
                        : {
                            backgroundColor: "transparent",
                            color: "var(--chamfer-text-secondary)",
                          }
                    }
                    className="min-h-[30px] rounded-lg px-1.5 text-[10.5px] font-bold transition cursor-pointer whitespace-nowrap"
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>

            {/* SUB-ABA 1: DOBRAR (FOLD), EDGE FLANGE & CONTOUR FLANGE */}
            {sheetSubTab === "fold" && (
              <div className="flex flex-col gap-2">
                {/* Grau da Dobra (Obrigatório) + Expressão Paramétrica */}
                <div
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                  }}
                  className="flex flex-col gap-1.5 rounded-xl border p-2"
                >
                  <div className="flex items-center justify-between">
                    <span
                      style={{ color: "var(--chamfer-text-secondary)" }}
                      className="text-[10px] font-bold uppercase tracking-wider"
                    >
                      Grau da Dobra (°)
                    </span>
                    <span style={{ color: "var(--chamfer-accent)" }} className="font-mono text-xs font-bold">
                      {draftFoldAngleDeg.toFixed(1)}° {draftFoldDirection === "UP" ? "CIMA" : "BAIXO"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={180}
                      step={0.5}
                      aria-label="Grau da dobra em graus"
                      data-testid="sheet-fold-angle-input"
                      value={draftFoldAngleDeg}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) onDraftFoldAngleChange(Math.max(1, Math.min(180, v)));
                      }}
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[36px] rounded-xl border px-2 font-mono text-xs font-bold outline-none focus:border-[var(--chamfer-accent)]"
                    />
                    <input
                      type="text"
                      placeholder="fx: ang_dobra"
                      aria-label="Expressão paramétrica do ângulo"
                      value={angleExpression}
                      onChange={(e) => setAngleExpression(e.target.value)}
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[36px] rounded-xl border px-2 font-mono text-[11px] outline-none focus:border-[var(--chamfer-accent)]"
                    />
                  </div>

                  {/* Chips rápidos 30° 45° 60° 90° 120° 135° */}
                  <div className="grid grid-cols-6 gap-1">
                    {QUICK_ANGLE_CHIPS.map((deg) => {
                      const isSel = Math.abs(draftFoldAngleDeg - deg) < 0.1;
                      return (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => {
                            triggerHaptic("selection");
                            onDraftFoldAngleChange(deg);
                          }}
                          style={
                            isSel
                              ? {
                                  backgroundColor: "var(--chamfer-accent)",
                                  borderColor: "var(--chamfer-accent)",
                                  color: "var(--chamfer-accent-contrast)",
                                }
                              : {
                                  backgroundColor: "var(--chamfer-bar-bg)",
                                  borderColor: "var(--chamfer-border)",
                                  color: "var(--chamfer-text-secondary)",
                                }
                          }
                          className="min-h-[28px] rounded-lg border font-mono text-[10px] font-bold transition cursor-pointer"
                        >
                          {deg}°
                        </button>
                      );
                    })}
                  </div>

                  {/* Inverter Sentido + Inverter Lado Fixo */}
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      data-testid="sheet-toggle-direction-btn"
                      onClick={() => {
                        triggerHaptic("selection");
                        onDraftFoldDirectionChange(draftFoldDirection === "UP" ? "DOWN" : "UP");
                      }}
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="flex min-h-[34px] items-center justify-center gap-1 rounded-xl border px-2 text-[10.5px] font-semibold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                    >
                      <ArrowUpDown style={{ color: "var(--chamfer-accent)" }} className="size-3.5 shrink-0" />
                      <span>{draftFoldDirection === "UP" ? "Cima (+Z)" : "Baixo (-Z)"}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="sheet-invert-fixed-btn"
                      onClick={() => {
                        triggerHaptic("selection");
                        setInvertFixedSide((v) => !v);
                      }}
                      style={
                        invertFixedSide
                          ? {
                              backgroundColor: "var(--chamfer-accent-soft)",
                              borderColor: "var(--chamfer-accent-border)",
                              color: "var(--chamfer-accent)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-bar-bg)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-primary)",
                            }
                      }
                      className="flex min-h-[34px] items-center justify-center gap-1 rounded-xl border px-2 text-[10.5px] font-semibold transition cursor-pointer"
                    >
                      <ArrowLeftRight className="size-3.5 shrink-0" />
                      <span>{invertFixedSide ? "Fixo: B" : "Fixo: A"}</span>
                    </button>
                  </div>
                </div>

                {/* Geometria da Linha de Dobra + Overrides R / K / Posição */}
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col gap-0.5">
                    <span style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px] font-semibold">
                      Dist. Borda (mm)
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={distanceFromEdgeMm}
                      onChange={(e) => setDistanceFromEdgeMm(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[34px] rounded-xl border px-2 font-mono text-xs outline-none focus:border-[var(--chamfer-accent)]"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px] font-semibold">
                      Aba Móvel (mm)
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={childExternalLegMm}
                      onChange={(e) => setChildExternalLegMm(Math.max(1, Number(e.target.value) || 1))}
                      style={{
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[34px] rounded-xl border px-2 font-mono text-xs outline-none focus:border-[var(--chamfer-accent)]"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px] font-semibold">
                      Raio R (mm)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={overrideRadius}
                      onChange={(e) => setOverrideRadius(Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[34px] rounded-xl border px-2 font-mono text-xs outline-none focus:border-[var(--chamfer-accent)]"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px] font-semibold">
                      Fator K
                    </span>
                    <input
                      type="number"
                      min={0.05}
                      max={0.95}
                      step={0.01}
                      value={overrideK}
                      onChange={(e) => setOverrideK(Math.max(0.05, Math.min(0.95, Number(e.target.value) || 0.33)))}
                      style={{
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[34px] rounded-xl border px-2 font-mono text-xs outline-none focus:border-[var(--chamfer-accent)]"
                    />
                  </label>
                </div>

                {/* Posição da Dobra */}
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: "MATERIAL_INSIDE", label: "Mat. Dentro" },
                      { id: "CENTERLINE", label: "Linha Centro" },
                      { id: "MATERIAL_OUTSIDE", label: "Mat. Fora" },
                    ] as const
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setBendPosition(pos.id)}
                      style={
                        bendPosition === pos.id
                          ? {
                              backgroundColor: "var(--chamfer-accent-soft)",
                              borderColor: "var(--chamfer-accent-border)",
                              color: "var(--chamfer-accent)",
                            }
                          : {
                              backgroundColor: "var(--chamfer-surface-elevated)",
                              borderColor: "var(--chamfer-border)",
                              color: "var(--chamfer-text-secondary)",
                            }
                      }
                      className="min-h-[28px] rounded-lg border px-1 text-[9.5px] font-semibold transition cursor-pointer"
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>

                {/* Ação Primária: Dobrar (Fold) + Edge Flange */}
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    data-testid="sheet-confirm-fold-btn"
                    onClick={() => {
                      triggerHaptic("confirm");
                      onSheetFold({
                        distanceFromEdgeMm,
                        childExternalLegMm,
                        targetAngleDeg: draftFoldAngleDeg,
                        angleExpression: angleExpression.trim() || undefined,
                        direction: draftFoldDirection,
                        innerRadiusMm: overrideRadius,
                        kFactor: overrideK,
                        bendPosition,
                        invertFixedSide,
                      });
                      showToast(`Dobra ${draftFoldAngleDeg.toFixed(1)}° aplicada na BendTree`);
                    }}
                    style={{
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }}
                    className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition hover:brightness-110 active:scale-95 cursor-pointer"
                  >
                    <span>✓ Confirmar Dobra ({draftFoldAngleDeg.toFixed(1)}°)</span>
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-testid="sheet-edge-flange-btn"
                      onClick={() => {
                        triggerHaptic("selection");
                        onSheetAddEdgeFlange({
                          externalLengthMm: childExternalLegMm,
                          targetAngleDeg: draftFoldAngleDeg,
                          direction: draftFoldDirection,
                          innerRadiusMm: overrideRadius,
                          kFactor: overrideK,
                          angleExpression: angleExpression.trim() || undefined,
                        });
                        showToast(`Edge Flange ${childExternalLegMm}mm (${draftFoldAngleDeg}°) adicionada`);
                      }}
                      style={{
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="flex min-h-[34px] items-center justify-center gap-1 rounded-xl border px-2 text-[10.5px] font-semibold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                    >
                      <Plus style={{ color: "var(--chamfer-accent)" }} className="size-3.5" />
                      <span>Edge Flange</span>
                    </button>

                    <div className="grid grid-cols-3 gap-1">
                      {(["L", "U", "Z"] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            triggerHaptic("selection");
                            onSheetCreateContourFlange({
                              preset,
                              legA: distanceFromEdgeMm,
                              legB: childExternalLegMm,
                              widthMm: flangeWidthMm,
                              angleDeg: draftFoldAngleDeg,
                            });
                            showToast(`Contour Flange ${preset} gerado`);
                          }}
                          style={{
                            backgroundColor: "var(--chamfer-surface-elevated)",
                            borderColor: "var(--chamfer-border)",
                            color: "var(--chamfer-text-primary)",
                          }}
                          title={`Gerar Perfil Contour Flange em ${preset}`}
                          className="min-h-[34px] rounded-xl border font-mono text-[11px] font-bold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Preview Matemático Instantâneo */}
                <div
                  style={{
                    backgroundColor: "var(--chamfer-accent-soft)",
                    borderColor: "var(--chamfer-accent-border)",
                  }}
                  className="grid grid-cols-3 gap-1.5 rounded-xl border p-2 font-mono text-[10px]"
                >
                  <div>
                    <div style={{ color: "var(--chamfer-text-secondary)" }}>BA</div>
                    <div style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                      {bendPreview.bendAllowanceMm.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--chamfer-text-secondary)" }}>OSSB</div>
                    <div style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                      {bendPreview.outsideSetbackMm.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--chamfer-text-secondary)" }}>BD</div>
                    <div style={{ color: "var(--chamfer-status-warning)" }} className="font-bold">
                      {bendPreview.bendDeductionMm.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-ABA 2: BEND TREE — DESDOBRAR (UNFOLD), REDOBRAR (REFOLD) & FURAR */}
            {sheetSubTab === "tree" && (
              <div className="flex flex-col gap-2">
                {/* Controles Globais Unfold / Refold / Swap Root */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    data-testid="sheet-unfold-all-btn"
                    onClick={() => {
                      triggerHaptic("confirm");
                      onSheetUnfold();
                      showToast("Dobras desdobradas (targetAngleDeg preservado)");
                    }}
                    style={{
                      backgroundColor: "var(--chamfer-accent)",
                      color: "var(--chamfer-accent-contrast)",
                    }}
                    className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold transition hover:brightness-110 cursor-pointer"
                  >
                    <Maximize2 className="size-3.5" />
                    <span>Desdobrar Todas</span>
                  </button>

                  <button
                    type="button"
                    data-testid="sheet-refold-all-btn"
                    disabled={unfoldedBendsCount === 0}
                    onClick={() => {
                      triggerHaptic("confirm");
                      onSheetRefold();
                      showToast("Dobras redobradas para o ângulo exato salvo");
                    }}
                    style={
                      unfoldedBendsCount > 0
                        ? {
                            backgroundColor: "var(--chamfer-accent-soft)",
                            borderColor: "var(--chamfer-accent-border)",
                            color: "var(--chamfer-accent)",
                          }
                        : {
                            backgroundColor: "var(--chamfer-surface-elevated)",
                            borderColor: "var(--chamfer-border)",
                            color: "var(--chamfer-text-muted)",
                            opacity: 0.55,
                          }
                    }
                    className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-bold transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>Redobrar Todas</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onSheetSwapFixedRoot();
                    showToast("Face fixa da BendTree alternada");
                  }}
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                    color: "var(--chamfer-text-primary)",
                  }}
                  className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-semibold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                >
                  <Pin style={{ color: "var(--chamfer-accent)" }} className="size-3.5" />
                  <span>Trocar Face Fixa ({sheetBody.flanges[sheetBody.rootFlangeId]?.name ?? "Raiz"})</span>
                </button>

                {/* Lista de Nós da BendTree */}
                {bendsList.length === 0 ? (
                  <div
                    style={{
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-secondary)",
                    }}
                    className="rounded-xl border p-2.5 text-center text-[11px]"
                  >
                    Nenhuma dobra cadastrada. Use <strong>Dobrar</strong> ou{" "}
                    <strong>Detectar Dobras</strong>.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {bendsList.map((bend, idx) => {
                      const isSelected = selectedBendId === bend.bendId;
                      const isUnfolded = bend.state === "UNFOLDED";
                      return (
                        <div
                          key={bend.bendId}
                          onClick={() => onSelectBendId(bend.bendId)}
                          style={{
                            backgroundColor: "var(--chamfer-surface-elevated)",
                            borderColor: isSelected
                              ? "var(--chamfer-accent)"
                              : "var(--chamfer-border)",
                          }}
                          className="flex flex-col gap-1.5 rounded-xl border p-2 transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                style={{
                                  backgroundColor: isUnfolded
                                    ? "var(--chamfer-accent-soft)"
                                    : "var(--chamfer-bar-bg)",
                                  color: isUnfolded
                                    ? "var(--chamfer-accent)"
                                    : "var(--chamfer-status-success)",
                                }}
                                className="rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase"
                              >
                                {isUnfolded ? "DESDOB." : "DOBRADA"}
                              </span>
                              <span className="truncate font-mono text-[11px] font-bold">
                                D{idx + 1} · {bend.targetAngleDeg.toFixed(1)}°{" "}
                                {bend.direction === "UP" ? "CIMA" : "BAIXO"}
                              </span>
                            </div>
                            <span
                              style={{ color: "var(--chamfer-text-secondary)" }}
                              className="shrink-0 font-mono text-[9.5px]"
                            >
                              R{bend.innerRadiusMm.toFixed(1)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSheetEditBend(bend.bendId, {
                                    targetAngleDeg: Math.max(1, bend.targetAngleDeg - 5),
                                  });
                                }}
                                style={{
                                  backgroundColor: "var(--chamfer-bar-bg)",
                                  borderColor: "var(--chamfer-border)",
                                  color: "var(--chamfer-text-primary)",
                                }}
                                className="min-h-[28px] min-w-[28px] rounded-lg border font-mono text-[10px] font-bold cursor-pointer"
                              >
                                -5°
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSheetEditBend(bend.bendId, {
                                    targetAngleDeg: Math.min(180, bend.targetAngleDeg + 5),
                                  });
                                }}
                                style={{
                                  backgroundColor: "var(--chamfer-bar-bg)",
                                  borderColor: "var(--chamfer-border)",
                                  color: "var(--chamfer-text-primary)",
                                }}
                                className="min-h-[28px] min-w-[28px] rounded-lg border font-mono text-[10px] font-bold cursor-pointer"
                              >
                                +5°
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSheetEditBend(bend.bendId, {
                                    direction: bend.direction === "UP" ? "DOWN" : "UP",
                                  });
                                }}
                                style={{
                                  backgroundColor: "var(--chamfer-bar-bg)",
                                  borderColor: "var(--chamfer-border)",
                                  color: "var(--chamfer-text-primary)",
                                }}
                                title="Inverter sentido Cima/Baixo"
                                className="min-h-[28px] rounded-lg border px-1.5 text-[10px] font-bold cursor-pointer"
                              >
                                ↕
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic("selection");
                                if (isUnfolded) {
                                  onSheetRefold([bend.bendId]);
                                } else {
                                  onSheetUnfold([bend.bendId]);
                                }
                              }}
                              style={
                                isUnfolded
                                  ? {
                                      backgroundColor: "var(--chamfer-accent)",
                                      color: "var(--chamfer-accent-contrast)",
                                    }
                                  : {
                                      backgroundColor: "var(--chamfer-accent-soft)",
                                      borderColor: "var(--chamfer-accent-border)",
                                      color: "var(--chamfer-accent)",
                                    }
                              }
                              className="min-h-[28px] rounded-lg border border-transparent px-2 text-[10.5px] font-bold cursor-pointer"
                            >
                              {isUnfolded ? "↩ Redobrar" : "⤢ Desdobrar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Furar na Chapa (com suporte a recorte sobre dobra desdobrada) */}
                <div
                  style={{
                    backgroundColor: "var(--chamfer-surface-elevated)",
                    borderColor: "var(--chamfer-border)",
                  }}
                  className="flex flex-col gap-1.5 rounded-xl border p-2"
                >
                  <div className="flex items-center justify-between">
                    <span
                      style={{ color: "var(--chamfer-text-secondary)" }}
                      className="text-[10px] font-bold uppercase tracking-wider"
                    >
                      Furar na Chapa ({sheetBody.crossBendCutouts.length} em dobra)
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <input
                      type="number"
                      min={1}
                      value={holeDiaMm}
                      onChange={(e) => setHoleDiaMm(Math.max(1, Number(e.target.value) || 6))}
                      placeholder="Ø"
                      aria-label="Diâmetro do furo em mm"
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[32px] rounded-lg border px-1.5 font-mono text-[11px] outline-none"
                    />
                    <input
                      type="number"
                      value={holeXMm}
                      onChange={(e) => setHoleXMm(Number(e.target.value) || 0)}
                      placeholder="X"
                      aria-label="Posição X do furo em mm"
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[32px] rounded-lg border px-1.5 font-mono text-[11px] outline-none"
                    />
                    <input
                      type="number"
                      value={holeYMm}
                      onChange={(e) => setHoleYMm(Number(e.target.value) || 0)}
                      placeholder="Y"
                      aria-label="Posição Y do furo em mm"
                      style={{
                        backgroundColor: "var(--chamfer-bar-bg)",
                        borderColor: "var(--chamfer-border)",
                        color: "var(--chamfer-text-primary)",
                      }}
                      className="min-h-[32px] rounded-lg border px-1.5 font-mono text-[11px] outline-none"
                    />
                  </div>
                  {unfoldedBendsCount > 0 && (
                    <label
                      style={{ color: "var(--chamfer-text-secondary)" }}
                      className="flex cursor-pointer items-center gap-1.5 text-[10.5px]"
                    >
                      <input
                        type="checkbox"
                        checked={holeAcrossBend}
                        onChange={(e) => setHoleAcrossBend(e.target.checked)}
                        style={{ accentColor: "var(--chamfer-accent)" }}
                        className="size-3.5"
                      />
                      <span>Cortar sobre zona de dobra desdobrada</span>
                    </label>
                  )}
                  <button
                    type="button"
                    data-testid="sheet-add-hole-btn"
                    onClick={() => {
                      triggerHaptic("selection");
                      onSheetAddHole({
                        diameterMm: holeDiaMm,
                        x: holeXMm,
                        y: holeYMm,
                        acrossUnfoldedBend: holeAcrossBend && unfoldedBendsCount > 0,
                      });
                      showToast(`Furo Ø${holeDiaMm}mm adicionado na chapa`);
                    }}
                    style={{
                      backgroundColor: "var(--chamfer-bar-bg)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }}
                    className="flex min-h-[34px] items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-semibold transition hover:border-[var(--chamfer-accent)] cursor-pointer"
                  >
                    <CircleDot style={{ color: "var(--chamfer-accent)" }} className="size-3.5" />
                    <span>Furar Ø{holeDiaMm}mm</span>
                  </button>
                </div>
              </div>
            )}

            {/* SUB-ABA 3: FLAT PATTERN & DXF LASER INSIDE-OUT */}
            {sheetSubTab === "flat" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10.5px]">
                    Largura da chapa (mm):
                  </span>
                  <input
                    type="number"
                    min={5}
                    value={flangeWidthMm}
                    onChange={(e) => setFlangeWidthMm(Math.max(5, Number(e.target.value) || 60))}
                    style={{
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                      color: "var(--chamfer-text-primary)",
                    }}
                    className="min-h-[30px] w-20 rounded-lg border px-2 font-mono text-xs outline-none"
                  />
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
                      BA Total
                    </div>
                    <div style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                      {flatPattern.bendTable
                        .reduce((s, b) => s + b.bendAllowanceMm, 0)
                        .toFixed(4)}{" "}
                      mm
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px]">
                      BD Total
                    </div>
                    <div style={{ color: "var(--chamfer-status-warning)" }} className="font-bold">
                      {flatPattern.bendTable
                        .reduce((s, b) => s + b.bendDeductionMm, 0)
                        .toFixed(4)}{" "}
                      mm
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--chamfer-text-secondary)" }} className="text-[10px]">
                      Dobras / Furos
                    </div>
                    <div className="font-bold">
                      {flatPattern.bendLines.length} / {flatPattern.cutEntities.length}
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

                {/* Linhas de dobra na planificação */}
                {flatPattern.bendLines.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "var(--chamfer-surface-elevated)",
                      borderColor: "var(--chamfer-border)",
                    }}
                    className="flex flex-col gap-1 rounded-xl border p-2 font-mono text-[10px]"
                  >
                    {flatPattern.bendLines.map((bl, idx) => (
                      <div key={`bl_${idx}`} className="flex items-center justify-between">
                        <span style={{ color: "var(--chamfer-accent)" }} className="font-bold">
                          {bl.layer}
                        </span>
                        <span>{bl.type === "LINE" ? bl.label ?? "DOBRA" : "DOBRA"}</span>
                        <span style={{ color: "var(--chamfer-text-secondary)" }}>
                          X={bl.type === "LINE" ? bl.x1.toFixed(1) : "0.0"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ações 1-Toque */}
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    data-testid="sheet-export-dxf-btn"
                    onClick={() => {
                      triggerHaptic("confirm");
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
                    className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition hover:opacity-85 cursor-pointer"
                  >
                    <Download className="size-3.5" />
                    <span>Tabela Dobras CSV</span>
                  </button>
                </div>
              </div>
            )}
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
                  triggerHaptic("confirm");
                  onExportCurrentViewDxf?.(includeHiddenDxf);
                  showToast("Vista ortográfica 1:1 exportada para DXF");
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
                  triggerHaptic("confirm");
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
