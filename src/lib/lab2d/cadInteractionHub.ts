/**
 * CALDRA CAD — CENTRAL DE INTERAÇÃO MODULAR (CADInteractionHub)
 *
 * Arquitetura modular extensível (Extensible Registry Pattern) com garantia
 * estrita de Eficiência em Repouso (Zero Overhead / Zero-Idle):
 *  - Gerencia ferramentas exclusivas ('tool': 'pointer', 'nodes', 'pan', etc.)
 *    e modificadores de precisão combináveis ('precision_modifier':
 *    'cursor_offset', 'loupe_hud', 'nudge_dpad').
 *  - Nenhum polling, setInterval ou requestAnimationFrame contínuo em repouso.
 *  - Desconexão imediata de listeners temporários e limpeza de referências via cleanup().
 *  - Matriz única de transformação do mundo CAD compartilhada por todas as ferramentas.
 */

import type { Vec2 } from "./core";
import { TOUCH_CURSOR_OFFSET_PX, TOUCH_TOP_EDGE_THRESHOLD_PX } from "@/components/lab2d/ChamferVirtualCursor";

export type CADModuleType = "tool" | "precision_modifier";

export type SelectionSubMode = "select" | "node" | "pan";
export type CursorOffsetMode = "offset" | "direct";
export type LoupeHudMode = "floating" | "pinned" | "off";

export interface CADInteractionModule {
  id: string;
  type: CADModuleType;
  label: string;
  active: boolean;
  activate: () => void;
  deactivate: () => void;
  cleanup: () => void;
}

export interface WorldTransformMatrix {
  left: number;
  top: number;
  panX: number;
  panY: number;
  zoom: number;
}

export interface ComputedCursorFrame {
  /** Coordenada exata do ponto de contato físico no mundo CAD (mm) */
  directWorld: Vec2;
  /** Coordenada ativa da mira técnica com compensação de offset (mm) */
  cursorWorld: Vec2;
  /** Coordenada na tela da mira técnica (px) */
  cursorScreen: Vec2;
  /** Deslocamento vertical aplicado em pixels de tela (-55, +55 ou 0) */
  appliedOffsetY: number;
  /** Indica se a auto-inversão de borda superior está ativa */
  invertedTopEdge: boolean;
}

export const STORAGE_KEYS = {
  CURSOR_OFFSET_MODE: "caldra_chamfer_cursor_offset_mode",
  LOUPE_HUD_MODE: "caldra_chamfer_loupe_mode",
  LOUPE_PINNED_LEGACY: "caldra_chamfer_loupe_pinned",
  NUDGE_STEP_MM: "caldra_chamfer_nudge_step_mm",
} as const;

/**
 * Lê o modo de deslocamento do cursor.
 * Padrão 1:1 direto ('direct') para que o toque coincida com o ponto exato do dedo.
 */
export function loadCursorOffsetMode(): CursorOffsetMode {
  return "direct";
}

export function saveCursorOffsetMode(mode: CursorOffsetMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.CURSOR_OFFSET_MODE, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Lê o modo da Lupa HUD salvo no localStorage ('floating' | 'pinned' | 'off').
 * Mantém compatibilidade reversa com 'caldra_chamfer_loupe_pinned'.
 */
export function loadLoupeHudMode(): LoupeHudMode {
  if (typeof window === "undefined") return "floating";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.LOUPE_HUD_MODE);
    if (raw === "floating" || raw === "pinned" || raw === "off") return raw;
    const legacyPinned = window.localStorage.getItem(STORAGE_KEYS.LOUPE_PINNED_LEGACY);
    if (legacyPinned === "1") return "pinned";
  } catch {
    /* ignore */
  }
  return "floating";
}

export function saveLoupeHudMode(mode: LoupeHudMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.LOUPE_HUD_MODE, mode);
    window.localStorage.setItem(STORAGE_KEYS.LOUPE_PINNED_LEGACY, mode === "pinned" ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Cicla entre os 3 estados do Módulo Lupa HUD:
 * Flutuante -> Fixa -> Desligada -> Flutuante
 */
export function cycleLoupeHudMode(current: LoupeHudMode): LoupeHudMode {
  if (current === "floating") return "pinned";
  if (current === "pinned") return "off";
  return "floating";
}

/**
 * Cálculo Geométrico Único (Seção 2.2):
 * Matriz única de transformação do mundo CAD compartilhada por todas as ferramentas,
 * miras e lupa sem recálculos duplicados de coordenadas (1:1 direto com o toque).
 */
export function computeUnifiedCursorFrame(
  clientX: number,
  clientY: number,
  matrix: WorldTransformMatrix,
  _useTouchOffset = false,
): ComputedCursorFrame {
  const safeZoom = Number.isFinite(matrix.zoom) && matrix.zoom > 0 ? matrix.zoom : 1;
  const localX = clientX - matrix.left;
  const localY = clientY - matrix.top;

  const directWorld: Vec2 = {
    x: (localX - matrix.panX) / safeZoom,
    y: (localY - matrix.panY) / safeZoom,
  };

  return {
    directWorld,
    cursorWorld: directWorld,
    cursorScreen: { x: clientX, y: clientY },
    appliedOffsetY: 0,
    invertedTopEdge: false,
  };
}

/**
 * Infraestrutura Central de Interação Modular (CADInteractionHub)
 */
export class CADInteractionHub {
  private modules = new Map<string, CADInteractionModule>();
  private activeToolId: string | null = "pointer";
  private isTouchActive = false;
  private trackedRafIds = new Set<number>();
  private trackedTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private trackedDisposers = new Set<() => void>();
  private lastCursorFrame: ComputedCursorFrame | null = null;

  constructor() {
    this.registerDefaultModules();
  }

  private registerDefaultModules(): void {
    const defaultTools: Array<{ id: string; label: string; active: boolean }> = [
      { id: "pointer", label: "Ponteiro (Seleção e Fusão Gestual)", active: true },
      { id: "nodes", label: "Nós (Vértices Isolados)", active: false },
      { id: "pan", label: "Pan (Mover Prancheta 1 Dedo)", active: false },
    ];

    for (const t of defaultTools) {
      this.registerModule({
        id: t.id,
        type: "tool",
        label: t.label,
        active: t.active,
        activate: () => {},
        deactivate: () => {},
        cleanup: () => {},
      });
    }

    const offsetMode = loadCursorOffsetMode();
    const loupeMode = loadLoupeHudMode();

    this.registerModule({
      id: "cursor_offset",
      type: "precision_modifier",
      label: "Cursor Offset 55px",
      active: offsetMode === "offset",
      activate: () => saveCursorOffsetMode("offset"),
      deactivate: () => saveCursorOffsetMode("direct"),
      cleanup: () => {},
    });

    this.registerModule({
      id: "loupe_hud",
      type: "precision_modifier",
      label: "Lupa de Precisão HUD",
      active: loupeMode !== "off",
      activate: () => {},
      deactivate: () => saveLoupeHudMode("off"),
      cleanup: () => {},
    });

    this.registerModule({
      id: "nudge_dpad",
      type: "precision_modifier",
      label: "Micro-Ajuste Incremental (Nudge)",
      active: false,
      activate: () => {},
      deactivate: () => {},
      cleanup: () => {},
    });
  }

  /**
   * Registra ou atualiza um módulo seguindo o Extensible Registry Pattern (Seção 2.1).
   */
  public registerModule(module: CADInteractionModule): void {
    this.modules.set(module.id, module);
    if (module.type === "tool" && module.active) {
      this.activeToolId = module.id;
    }
  }

  public getModule(id: string): CADInteractionModule | undefined {
    return this.modules.get(id);
  }

  public getAllModules(): CADInteractionModule[] {
    return Array.from(this.modules.values());
  }

  public isModuleActive(id: string): boolean {
    return this.modules.get(id)?.active ?? false;
  }

  public getActiveToolId(): string | null {
    return this.activeToolId;
  }

  /**
   * Ativa um módulo pelo ID.
   * Se for do tipo 'tool', desativa e limpa automaticamente a ferramenta anterior.
   */
  public activateModule(id: string): void {
    const target = this.modules.get(id);
    if (!target) return;

    if (target.type === "tool") {
      for (const [modId, mod] of this.modules.entries()) {
        if (mod.type === "tool" && modId !== id && mod.active) {
          mod.active = false;
          mod.deactivate();
          mod.cleanup();
        }
      }
      this.activeToolId = id;
    }

    if (!target.active) {
      target.active = true;
      target.activate();
    }
  }

  /**
   * Desativa um módulo específico e dispara imediatamente seu cleanup().
   */
  public deactivateModule(id: string): void {
    const target = this.modules.get(id);
    if (!target || !target.active) return;

    target.active = false;
    target.deactivate();
    target.cleanup();

    if (target.type === "tool" && this.activeToolId === id) {
      this.activeToolId = null;
    }
  }

  /**
   * Alterna um modificador de precisão ('cursor_offset', 'loupe_hud', 'nudge_dpad').
   */
  public toggleModifier(id: string, forceState?: boolean): boolean {
    const target = this.modules.get(id);
    if (!target) return false;
    const nextState = forceState ?? !target.active;
    if (nextState) {
      this.activateModule(id);
    } else {
      this.deactivateModule(id);
    }
    return nextState;
  }

  /**
   * Registra um requestAnimationFrame gerenciado pelo Hub (cancelado automaticamente em cleanup/idle).
   */
  public scheduleFrame(cb: FrameRequestCallback): number {
    if (typeof requestAnimationFrame === "undefined") return 0;
    const id = requestAnimationFrame((t) => {
      this.trackedRafIds.delete(id);
      cb(t);
    });
    this.trackedRafIds.add(id);
    return id;
  }

  /**
   * Registra um timer temporário gerenciado pelo Hub (limpo em cleanup/idle).
   */
  public scheduleTimeout(cb: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.trackedTimeouts.delete(timer);
      cb();
    }, ms);
    this.trackedTimeouts.add(timer);
    return timer;
  }

  /**
   * Registra um listener de DOM temporário que será desconectado ao entrar em repouso.
   */
  public registerTransientDisposer(dispose: () => void): void {
    this.trackedDisposers.add(dispose);
  }

  /**
   * Inicia estado de interação física ativa (toque/arraste em andamento).
   */
  public beginActiveInteraction(frame?: ComputedCursorFrame): void {
    this.isTouchActive = true;
    if (frame) {
      this.lastCursorFrame = frame;
    }
  }

  public updateCursorFrame(frame: ComputedCursorFrame): void {
    this.lastCursorFrame = frame;
  }

  public getLastCursorFrame(): ComputedCursorFrame | null {
    return this.lastCursorFrame;
  }

  /**
   * Regra Estrita de Eficiência em Repouso (Zero Overhead / Zero-Idle - Seção 2.2):
   * Cancela todos os rAFs pendentes, limpa timers transitórios e desconecta listeners.
   */
  public enterIdleState(): void {
    this.isTouchActive = false;

    if (typeof cancelAnimationFrame !== "undefined") {
      for (const rafId of this.trackedRafIds) {
        cancelAnimationFrame(rafId);
      }
    }
    this.trackedRafIds.clear();

    for (const timer of this.trackedTimeouts) {
      clearTimeout(timer);
    }
    this.trackedTimeouts.clear();

    for (const dispose of this.trackedDisposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    this.trackedDisposers.clear();
  }

  /**
   * Limpeza completa de todos os módulos e recursos (chamado ao desmontar o editor).
   */
  public cleanupAll(): void {
    this.enterIdleState();
    for (const mod of this.modules.values()) {
      mod.cleanup();
    }
    this.lastCursorFrame = null;
  }

  /**
   * Diagnóstico de consumo em repouso (Zero-Idle Verification).
   */
  public getIdleDiagnostics(): {
    isIdle: boolean;
    activeRafCount: number;
    activeTimerCount: number;
    activeTransientListeners: number;
    activeToolId: string | null;
  } {
    return {
      isIdle: !this.isTouchActive,
      activeRafCount: this.trackedRafIds.size,
      activeTimerCount: this.trackedTimeouts.size,
      activeTransientListeners: this.trackedDisposers.size,
      activeToolId: this.activeToolId,
    };
  }
}

export const globalCADInteractionHub = new CADInteractionHub();
