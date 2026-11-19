/**
 * CALDRA CHAMFER — MENU RADIAL CONTEXTUAL 3D POR TOQUE LONGO 380ms (PILAR 8)
 *
 * - No 2D: permanece desativado (`return null`) preservando 100% o toque longo 2D atual.
 * - No 3D (`context3D: "face" | "edge" | "body"`): micro-anel contextual fora da sombra do dedo
 *   com alvos >= 44×44 px e 100% vinculado aos tokens dinâmicos `--chamfer-*` (Tema + Cor de Destaque).
 */

import React from "react";
import type { Entity } from "@/lib/lab2d/core";
import { triggerHaptic } from "@/lib/ui/haptics";

export type Radial3DContextKind = "face" | "edge" | "body";

export interface RadialMenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
  shortcut?: string;
  action?: () => void;
  accent?: boolean;
}

export interface ChamferRadialMenuProps {
  open?: boolean;
  onClose?: () => void;
  position?: { x: number; y: number };
  selectedEntities?: Entity[];
  context3D?: Radial3DContextKind | null;
  normalFlipped?: boolean;
  onAction?: (actionId: string) => void;
  isDark?: boolean;
}

const CONTEXT_ACTIONS: Record<Radial3DContextKind, Array<{ id: string; label: string; emoji: string; accent?: boolean }>> = {
  face: [
    { id: "normal_to_face", label: "Normal à Face", emoji: "🎯", accent: true },
    { id: "sketch_on_face", label: "Esboçar", emoji: "✏️" },
    { id: "press_pull", label: "Press-Pull", emoji: "⬆️" },
    { id: "shell", label: "Shell", emoji: "📦" },
    { id: "section_here", label: "Seção", emoji: "✂️" },
  ],
  edge: [
    { id: "fillet_edge", label: "Fillet", emoji: "✨", accent: true },
    { id: "chamfer_edge", label: "Chanfro", emoji: "📐" },
    { id: "edge_flange", label: "Edge Flange", emoji: "🔩" },
    { id: "plane_on_edge", label: "Plano Aresta", emoji: "📐" },
  ],
  body: [
    { id: "move_rotate", label: "Mover/Girar", emoji: "✥", accent: true },
    { id: "split_body", label: "Dividir", emoji: "✂️" },
    { id: "toggle_isolate", label: "Ocultar/Isolar", emoji: "👁️" },
    { id: "edit_feature", label: "Editar Etapa", emoji: "⏱️" },
  ],
};

export function ChamferRadialMenu({
  open = false,
  onClose,
  position,
  context3D = null,
  normalFlipped = false,
  onAction,
}: ChamferRadialMenuProps) {
  if (!open || !context3D || !position) return null;

  const actions = CONTEXT_ACTIONS[context3D];
  const radius = 84;
  const vw = typeof window !== "undefined" ? window.innerWidth : 412;
  const vh = typeof window !== "undefined" ? window.innerHeight : 915;
  const cx = Math.max(122, Math.min(vw - 122, position.x));
  const cy = Math.max(132, Math.min(vh - 132, position.y - 36));

  return (
    <div
      className="fixed inset-0 z-[140] touch-none select-none"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      {/* Centro de referência */}
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-lg backdrop-blur-md"
        style={{
          left: cx,
          top: cy,
          backgroundColor: "var(--chamfer-popover-bg)",
          borderColor: "var(--chamfer-accent-border)",
          color: "var(--chamfer-accent)",
        }}
      >
        {context3D === "face" ? "Face 3D" : context3D === "edge" ? "Aresta 3D" : "Corpo 3D"}
      </div>

      {/* Micro-anel contextual (alvos >= 44×44 px) */}
      {actions.map((item, idx) => {
        const angle = -Math.PI / 2 + (idx / actions.length) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const displayLabel =
          item.id === "normal_to_face" && normalFlipped ? "Normal 180°" : item.label;

        return (
          <button
            key={item.id}
            type="button"
            data-testid={`radial-3d-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              onAction?.(item.id);
              onClose?.();
            }}
            style={
              item.accent
                ? {
                    left: x,
                    top: y,
                    backgroundColor: "var(--chamfer-accent)",
                    borderColor: "var(--chamfer-accent)",
                    color: "var(--chamfer-accent-contrast)",
                    boxShadow: "var(--chamfer-toast-shadow)",
                  }
                : {
                    left: x,
                    top: y,
                    backgroundColor: "var(--chamfer-popover-bg)",
                    borderColor: "var(--chamfer-border-strong)",
                    color: "var(--chamfer-text-primary)",
                    boxShadow: "var(--chamfer-toast-shadow)",
                  }
            }
            className="absolute -translate-x-1/2 -translate-y-1/2 flex min-h-[46px] min-w-[76px] flex-col items-center justify-center gap-0.5 rounded-2xl border px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
          >
            <span className="text-sm leading-none">{item.emoji}</span>
            <span className="whitespace-nowrap text-[10px] leading-tight">{displayLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
