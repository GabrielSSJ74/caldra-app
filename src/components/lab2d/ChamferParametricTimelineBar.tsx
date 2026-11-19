/**
 * CALDRA CHAMFER — FAIXA HORIZONTAL ACOPLADA DA TIMELINE PARAMÉTRICA (PILAR 4)
 *
 * - Por padrão fica 100% recolhida (o botão `[ ⏱ Histórico (N) ]` mora embutido na Barra
 *   Inferior de Status e no Hub PRUMO — zero blocos pretos flutuando no meio do canvas).
 * - Quando aberta (`open === true`), expande-se como uma faixa horizontal fina (`min-h-[54px]`)
 *   acoplada logo acima da barra inferior, com chips cronológicos, alça de Rollback arrastável
 *   pelo polegar (`setPointerCapture` + `touch-action: none`), ações rápidas e botão `✕`.
 * - 100% sincronizada com os tokens `--chamfer-*` (Tema Claro / Escuro / AMOLED + Cor de Destaque).
 */

import React, { useRef, useState } from "react";
import {
  Clock,
  X,
  EyeOff,
  Eye,
  Trash2,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Link2,
  GitBranch,
  Edit3,
} from "lucide-react";
import type { TimelineFeatureNode } from "@/chamfer/core/timelineEvaluator";
import { triggerHaptic } from "@/lib/ui/haptics";

export interface ChamferParametricTimelineBarProps {
  open: boolean;
  onClose: () => void;
  features: TimelineFeatureNode[];
  rollbackIndex: number | null;
  onRollbackChange: (nextIndex: number | null) => void;
  onToggleSuppress: (nodeId: string) => void;
  onRenameFeature: (nodeId: string, newName: string) => void;
  onReorderFeature: (nodeId: string, dir: -1 | 1) => void;
  onDeleteFeature: (nodeId: string) => void;
  onSelectFeature?: (nodeId: string | null) => void;
  onReattachReference?: (nodeId: string) => void;
  getDependents?: (nodeId: string) => string[];
}

const TYPE_EMOJI: Record<string, string> = {
  sketch: "✏️",
  extrude: "🧊",
  thinExtrude: "🧱",
  pressPull: "⬆️",
  cylinder: "🛢️",
  hole: "🕳️",
  fillet: "✨",
  chamfer: "📐",
  shell: "📦",
  draft: "🔻",
  coil: "🌀",
  splitBody: "✂️",
  combine: "🔗",
  pathPattern: "⋯",
  pipe: "🪠",
  constructPlane: "▱",
  constructAxis: "╱",
  constructPoint: "•",
  sheetFlange: "🔩",
};

const stopCanvasEvent = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

export function ChamferParametricTimelineBar({
  open,
  onClose,
  features,
  rollbackIndex,
  onRollbackChange,
  onToggleSuppress,
  onRenameFeature,
  onReorderFeature,
  onDeleteFeature,
  onSelectFeature,
  onReattachReference,
  getDependents,
}: ChamferParametricTimelineBarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dependentsInfo, setDependentsInfo] = useState<string[] | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  if (!open) return null;

  const effectiveRollback = rollbackIndex === null ? features.length : rollbackIndex;
  const activeNode = features.find((f) => f.id === activeId) ?? null;

  const updateRollbackFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || features.length === 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const idx = Math.round(ratio * features.length);
    onRollbackChange(idx >= features.length ? null : idx);
  };

  return (
    <div
      data-testid="chamfer-timeline-expanded"
      role="region"
      aria-label="Timeline Paramétrica e Rollback"
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
      className="fixed bottom-[134px] left-2 right-2 z-[114] flex flex-col gap-1.5 rounded-2xl border px-2.5 py-1.5 select-none transition-colors sm:bottom-[40px] sm:left-[64px] sm:right-3"
    >
      {/* Faixa horizontal fina (54px) acoplada acima da barra inferior */}
      <div className="flex min-h-[42px] items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          <Clock style={{ color: "var(--chamfer-accent)" }} className="size-3.5 shrink-0" />
          <span className="font-mono text-[10.5px] font-bold whitespace-nowrap">
            Histórico ({features.length})
          </span>
          <span
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-secondary)",
            }}
            className="hidden rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] sm:inline-block"
          >
            {effectiveRollback}/{features.length}
          </span>
        </div>

        {/* Trilha cronológica horizontal + Alça de Rollback arrastável */}
        <div
          ref={trackRef}
          className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 touch-pan-x"
        >
          {features.length === 0 ? (
            <span style={{ color: "var(--chamfer-text-muted)" }} className="text-[11px]">
              Nenhuma etapa paramétrica registrada ainda.
            </span>
          ) : (
            features.map((feat, idx) => {
              const isAfterRollback = idx >= effectiveRollback;
              const isSelected = activeId === feat.id;
              return (
                <React.Fragment key={feat.id}>
                  {idx === effectiveRollback && (
                    <div
                      role="slider"
                      aria-label="Marcador de Rollback"
                      aria-valuemin={0}
                      aria-valuemax={features.length}
                      aria-valuenow={effectiveRollback}
                      tabIndex={0}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        draggingRef.current = true;
                      }}
                      onPointerMove={(e) => {
                        if (!draggingRef.current) return;
                        e.stopPropagation();
                        updateRollbackFromClientX(e.clientX);
                      }}
                      onPointerUp={(e) => {
                        draggingRef.current = false;
                        try {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        }
                      }}
                      style={{
                        borderColor: "var(--chamfer-status-warning)",
                        backgroundColor: "var(--chamfer-surface-elevated)",
                        color: "var(--chamfer-status-warning)",
                      }}
                      className="flex h-[36px] w-[36px] shrink-0 cursor-ew-resize items-center justify-center rounded-xl border-2 font-mono text-xs font-bold touch-none select-none"
                      title="Arraste para mover o Rollback"
                    >
                      ‖
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      const next = isSelected ? null : feat.id;
                      setActiveId(next);
                      setDependentsInfo(null);
                      setRenamingId(null);
                      onSelectFeature?.(next);
                    }}
                    style={
                      isSelected
                        ? {
                            backgroundColor: "var(--chamfer-accent)",
                            borderColor: "var(--chamfer-accent)",
                            color: "var(--chamfer-accent-contrast)",
                          }
                        : {
                            backgroundColor: "var(--chamfer-surface-elevated)",
                            borderColor: "var(--chamfer-border)",
                            color:
                              feat.suppressed || isAfterRollback
                                ? "var(--chamfer-text-muted)"
                                : "var(--chamfer-text-primary)",
                          }
                    }
                    className={`relative flex h-[36px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-left text-[11px] font-semibold transition cursor-pointer ${
                      feat.suppressed || isAfterRollback ? "line-through opacity-60" : ""
                    }`}
                  >
                    <span>{TYPE_EMOJI[feat.type] ?? "◆"}</span>
                    <span className="max-w-[110px] truncate">{feat.name}</span>
                    {feat.missingReferenceWarning && (
                      <AlertTriangle
                        style={{ color: "var(--chamfer-status-warning)" }}
                        className="size-3.5 shrink-0"
                      />
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}

          {effectiveRollback >= features.length && features.length > 0 && (
            <div
              role="slider"
              aria-label="Marcador de Rollback"
              aria-valuemin={0}
              aria-valuemax={features.length}
              aria-valuenow={effectiveRollback}
              tabIndex={0}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                draggingRef.current = true;
              }}
              onPointerMove={(e) => {
                if (!draggingRef.current) return;
                e.stopPropagation();
                updateRollbackFromClientX(e.clientX);
              }}
              onPointerUp={(e) => {
                draggingRef.current = false;
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  // ignore
                }
              }}
              style={{
                borderColor: "var(--chamfer-status-warning)",
                backgroundColor: "var(--chamfer-surface-elevated)",
                color: "var(--chamfer-status-warning)",
              }}
              className="flex h-[36px] w-[36px] shrink-0 cursor-ew-resize items-center justify-center rounded-xl border-2 font-mono text-xs font-bold touch-none select-none"
              title="Arraste para voltar no tempo (Rollback)"
            >
              ‖
            </div>
          )}
        </div>

        {/* Botões finais: Ir ao Fim + Fechar */}
        <div className="flex shrink-0 items-center gap-1">
          {rollbackIndex !== null && rollbackIndex < features.length && (
            <button
              type="button"
              onClick={() => onRollbackChange(null)}
              style={{
                borderColor: "var(--chamfer-status-warning)",
                backgroundColor: "var(--chamfer-surface-elevated)",
                color: "var(--chamfer-status-warning)",
              }}
              className="h-[34px] rounded-lg border px-2 text-[10px] font-bold cursor-pointer"
            >
              Fim
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveId(null);
              onSelectFeature?.(null);
              onClose();
            }}
            aria-label="Recolher linha do tempo"
            style={{
              backgroundColor: "var(--chamfer-surface-elevated)",
              borderColor: "var(--chamfer-border)",
              color: "var(--chamfer-text-secondary)",
            }}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-xl border transition hover:opacity-80 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Ações rápidas da etapa selecionada (compactas) */}
      {activeNode && (
        <div
          style={{
            backgroundColor: "var(--chamfer-surface-elevated)",
            borderColor: "var(--chamfer-border)",
          }}
          className="flex flex-col gap-1.5 rounded-xl border p-2"
        >
          {activeNode.missingReferenceWarning && (
            <div
              style={{
                borderColor: "var(--chamfer-status-warning)",
                color: "var(--chamfer-status-warning)",
                backgroundColor: "var(--chamfer-bar-bg-solid)",
              }}
              className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[11px]"
            >
              <span>{activeNode.missingReferenceWarning}</span>
              {onReattachReference && (
                <button
                  type="button"
                  onClick={() => onReattachReference(activeNode.id)}
                  style={{
                    backgroundColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                  }}
                  className="flex min-h-[30px] shrink-0 items-center gap-1 rounded-lg px-2 font-semibold cursor-pointer"
                >
                  <Link2 className="size-3" />
                  <span>Re-apontar</span>
                </button>
              )}
            </div>
          )}

          {renamingId === activeNode.id ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="min-h-[34px] flex-1 rounded-lg border px-2.5 text-xs outline-none focus:border-[var(--chamfer-accent)]"
                placeholder="Novo nome da etapa"
              />
              <button
                type="button"
                onClick={() => {
                  if (renameDraft.trim()) onRenameFeature(activeNode.id, renameDraft.trim());
                  setRenamingId(null);
                }}
                style={{
                  backgroundColor: "var(--chamfer-accent)",
                  color: "var(--chamfer-accent-contrast)",
                }}
                className="min-h-[34px] rounded-lg px-3 text-xs font-bold cursor-pointer"
              >
                OK
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleSuppress(activeNode.id)}
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold cursor-pointer"
              >
                {activeNode.suppressed ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                <span>{activeNode.suppressed ? "Reativar" : "Suprimir"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenamingId(activeNode.id);
                  setRenameDraft(activeNode.name);
                }}
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold cursor-pointer"
              >
                <Edit3 className="size-3" />
                <span>Renomear</span>
              </button>
              <button
                type="button"
                onClick={() => setDependentsInfo(getDependents ? getDependents(activeNode.id) : [])}
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold cursor-pointer"
              >
                <GitBranch className="size-3" />
                <span>Dependentes</span>
              </button>
              <button
                type="button"
                onClick={() => onReorderFeature(activeNode.id, -1)}
                aria-label="Mover etapa para trás"
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border cursor-pointer"
              >
                <ArrowLeft className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onReorderFeature(activeNode.id, 1)}
                aria-label="Mover etapa para frente"
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-border)",
                  color: "var(--chamfer-text-primary)",
                }}
                className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border cursor-pointer"
              >
                <ArrowRight className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteFeature(activeNode.id);
                  setActiveId(null);
                }}
                style={{
                  backgroundColor: "var(--chamfer-bar-bg-solid)",
                  borderColor: "var(--chamfer-status-error)",
                  color: "var(--chamfer-status-error)",
                }}
                className="ml-auto flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[10.5px] font-semibold cursor-pointer"
              >
                <Trash2 className="size-3" />
                <span>Excluir</span>
              </button>
            </div>
          )}

          {dependentsInfo !== null && (
            <div
              style={{
                backgroundColor: "var(--chamfer-bar-bg-solid)",
                color: "var(--chamfer-accent)",
              }}
              className="rounded-lg px-2 py-1 font-mono text-[10.5px]"
            >
              {dependentsInfo.length === 0
                ? "Nenhuma etapa futura depende diretamente deste nó."
                : `Dependentes (${dependentsInfo.length}): ${dependentsInfo.join(", ")}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
