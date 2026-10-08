/**
 * CALDRA CHAMFER — MENU RADIAL CONTEXTUAL TOUCH (SEÇÃO 16)
 *
 * Abre próximo ao ponto de toque longo do usuário no canvas mobile.
 * Apresenta as ferramentas contextuais mais prováveis conforme a seleção:
 *  - Círculo: Raio, Diâmetro, Mover, Espelhar, Array, Concentricidade, Apagar;
 *  - Duas Linhas: Filete, Chanfro, Trim, Extend, Unir, Paralela, Medir;
 *  - Perfil Fechado: Criar Peça, Offset, Medir Área, Validar, Fabricação;
 *  - Ponto/Vértice: Mover Nó, Coordenadas, Apagar;
 *  - Canvas Livre: Linha, Retângulo, Círculo, Smart Trim, Lupa, Desfazer.
 */

import React, { useMemo } from "react";
import {
  Circle,
  Square,
  Minus,
  Sparkles,
  Scissors,
  Copy,
  Trash2,
  Move,
  Maximize2,
  Check,
  X,
  FlipHorizontal,
  Grid,
  Ruler,
  Compass,
  FileText,
  Activity,
  Layers,
  Undo2,
  Search,
  ScanEye,
  Crosshair,
} from "lucide-react";
import type { Entity } from "@/lib/lab2d/core";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
  accent?: boolean;
}

interface ChamferRadialMenuProps {
  open: boolean;
  onClose: () => void;
  position: { x: number; y: number }; // coordenadas de tela em px
  selectedEntities: Entity[];
  onAction: (actionId: string) => void;
  isDark?: boolean;
}

export function ChamferRadialMenu({
  open,
  onClose,
  position,
  selectedEntities,
  onAction,
  isDark = true,
}: ChamferRadialMenuProps) {
  if (!open) return null;

  // Determina itens com base na geometria selecionada
  const items: RadialMenuItem[] = useMemo(() => {
    // 1. Um Círculo selecionado
    if (selectedEntities.length === 1 && selectedEntities[0].type === "circle") {
      return [
        { id: "radius", label: "Raio", icon: Circle, action: () => onAction("radius") },
        { id: "move", label: "Mover", icon: Move, action: () => onAction("move") },
        { id: "copy", label: "Copiar", icon: Copy, action: () => onAction("copy") },
        { id: "mirror", label: "Espelhar", icon: FlipHorizontal, action: () => onAction("mirror") },
        { id: "array", label: "Array Polar", icon: Grid, action: () => onAction("array") },
        { id: "measure", label: "Medir", icon: Ruler, action: () => onAction("measure") },
        { id: "delete", label: "Apagar", icon: Trash2, action: () => onAction("delete"), accent: true },
      ];
    }

    // 2. Duas Linhas ou Polilinhas
    if (
      selectedEntities.length === 2 ||
      (selectedEntities.length === 1 && selectedEntities[0].type === "polyline")
    ) {
      return [
        { id: "fillet", label: "Filete", icon: Sparkles, action: () => onAction("fillet") },
        { id: "chamfer", label: "Chanfro", icon: Minus, action: () => onAction("chamfer") },
        { id: "trim", label: "Aparar", icon: Scissors, action: () => onAction("trim") },
        { id: "extend", label: "Estender", icon: Maximize2, action: () => onAction("extend") },
        { id: "offset", label: "Offset", icon: Layers, action: () => onAction("offset") },
        { id: "measure", label: "Medir", icon: Ruler, action: () => onAction("measure") },
        { id: "delete", label: "Apagar", icon: Trash2, action: () => onAction("delete"), accent: true },
      ];
    }

    // 3. Perfil fechado
    const isClosedProfile = selectedEntities.some(
      (e) => (e.type === "polyline" && e.closed) || e.type === "circle"
    );
    if (isClosedProfile) {
      return [
        { id: "offset", label: "Offset", icon: Layers, action: () => onAction("offset") },
        { id: "area", label: "Calcular Área", icon: Ruler, action: () => onAction("area") },
        { id: "passport", label: "Fabricação", icon: FileText, action: () => onAction("passport") },
        { id: "validate", label: "Topologia", icon: Activity, action: () => onAction("validate") },
        { id: "scale", label: "Escala", icon: Maximize2, action: () => onAction("scale") },
        { id: "delete", label: "Apagar", icon: Trash2, action: () => onAction("delete"), accent: true },
      ];
    }

    // 4. Modo Livre / Sem seleção (Ações Essenciais Móveis)
    return [
      { id: "tool-line", label: "Linha", icon: Minus, action: () => onAction("tool-line") },
      { id: "tool-rect", label: "Retângulo", icon: Square, action: () => onAction("tool-rect") },
      { id: "tool-circle", label: "Círculo", icon: Circle, action: () => onAction("tool-circle") },
      { id: "tool-trim", label: "Smart Trim", icon: Scissors, action: () => onAction("tool-trim") },
      { id: "palette", label: "Busca IA", icon: Search, action: () => onAction("palette") },
      { id: "loupe", label: "Lupa", icon: ScanEye, action: () => onAction("loupe") },
      { id: "undo", label: "Desfazer", icon: Undo2, action: () => onAction("undo") },
    ];
  }, [selectedEntities, onAction]);

  // Posicionamento com clamp para não sair da tela
  const radius = 80; // raio do menu circular em px
  const count = items.length;
  const clampedX = Math.max(90, Math.min(window.innerWidth - 90, position.x));
  const clampedY = Math.max(90, Math.min(window.innerHeight - 90, position.y));

  const handleItemClick = (item: RadialMenuItem) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    item.action();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-auto touch-manipulation select-none"
      onClick={onClose}
    >
      {/* Botão Central de Cancelar / Âncora do Toque */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 animate-in zoom-in-75"
        style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="size-11 rounded-full bg-card/95 border-2 border-accent/80 text-foreground shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          aria-label="Fechar menu radial"
        >
          <X className="size-5 text-accent" />
        </button>

        {/* Círculo guia visual */}
        <div className="absolute inset-0 -m-20 size-52 rounded-full border border-accent/20 pointer-events-none" />

        {/* Itens dispostos radialmente em torno do dedo */}
        {items.map((item, idx) => {
          const angle = (idx * 2 * Math.PI) / count - Math.PI / 2;
          const ix = Math.cos(angle) * radius;
          const iy = Math.sin(angle) * radius;
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-transform duration-200"
              style={{ left: `${ix}px`, top: `${iy}px` }}
            >
              <button
                type="button"
                onClick={() => handleItemClick(item)}
                className={`size-12 rounded-full flex items-center justify-center shadow-xl border backdrop-blur-md transition-all active:scale-90 ${
                  item.accent
                    ? "bg-red-500/20 border-red-500/80 text-red-400 hover:bg-red-500 hover:text-white"
                    : "bg-card/95 border-border hover:border-accent hover:text-accent text-foreground"
                }`}
                title={item.label}
              >
                <Icon className="size-5" />
              </button>
              <span className="mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-tight bg-background/90 border border-border/60 text-foreground whitespace-nowrap shadow-sm pointer-events-none">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
