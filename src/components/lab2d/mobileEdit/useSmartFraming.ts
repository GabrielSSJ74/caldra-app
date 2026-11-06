/**
 * CALDRA CHAMFER — AUTO-ENQUADRAMENTO DINÂMICO E FLUIDO DA PEÇA À ESQUERDA (SEÇÃO 4)
 *
 * Quando a janela de modificação de medidas abre à direita:
 *  1. Salva a visão atual da câmera (`previousViewportState`: panX, panY, zoom);
 *  2. Calcula o bounding box `(minX, minY, maxX, maxY)` da peça/entidade sendo criada ou modificada;
 *  3. Considera como Área Livre Disponível o retângulo entre a borda direita do `FINO • MIRA`
 *     (ou barra esquerda) e a borda esquerda da janela de medidas à direita (`right: 52px + 228px`);
 *  4. Aplica uma transição suave e fluida (`420ms cubic-bezier(0.22, 1, 0.36, 1)`) no `pan` e no `zoom`
 *     do canvas para centralizar e enquadrar a peça nessa metade esquerda da tela;
 *  5. Ao fechar (`✓ Confirmar` ou `✕ Cancelar`), retorna suavemente para a visão original (ou mantém
 *     um enquadramento limpo caso a peça tenha mudado muito de tamanho).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entity } from "@/lib/lab2d/core";

export interface ViewState {
  tx: number;
  ty: number;
  k: number;
}

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LeftSideFramingInput {
  bbox: BoundingBox2D;
  canvasWidth: number;
  canvasHeight: number;
  leftInsetPx?: number;
  rightReservedPx?: number;
  topInsetPx?: number;
  bottomInsetPx?: number;
  minZoom?: number;
  maxZoom?: number;
}

export const AUTO_FRAMING_DURATION_MS = 420;

/**
 * Curva de aceleração suave equivalente a `cubic-bezier(0.22, 1, 0.36, 1)` (easeOutQuint/Quart híbrido).
 */
export function evaluateFluidFramingEasing(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3.6);
}

/**
 * Calcula o bounding box combinado de uma lista de entidades CAD 2D.
 */
export function computeEntitiesBoundingBox(entities: (Entity | null | undefined)[]): BoundingBox2D | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const ent of entities) {
    if (!ent) continue;
    if (ent.type === "circle" || ent.type === "arc") {
      minX = Math.min(minX, ent.cx - ent.r);
      maxX = Math.max(maxX, ent.cx + ent.r);
      minY = Math.min(minY, ent.cy - ent.r);
      maxY = Math.max(maxY, ent.cy + ent.r);
      found = true;
    } else if (ent.type === "ellipse") {
      const rx = Math.max(1, ent.rx);
      const ry = Math.max(1, ent.ry);
      minX = Math.min(minX, ent.cx - rx);
      maxX = Math.max(maxX, ent.cx + rx);
      minY = Math.min(minY, ent.cy - ry);
      maxY = Math.max(maxY, ent.cy + ry);
      found = true;
    } else if (ent.type === "line") {
      minX = Math.min(minX, ent.x1, ent.x2);
      maxX = Math.max(maxX, ent.x1, ent.x2);
      minY = Math.min(minY, ent.y1, ent.y2);
      maxY = Math.max(maxY, ent.y1, ent.y2);
      found = true;
    } else if ((ent.type === "polyline" || ent.type === "spline") && ent.pts.length > 0) {
      for (const p of ent.pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      found = true;
    } else if (ent.type === "point") {
      minX = Math.min(minX, ent.x - 12);
      maxX = Math.max(maxX, ent.x + 12);
      minY = Math.min(minY, ent.y - 12);
      maxY = Math.max(maxY, ent.y + 12);
      found = true;
    } else if (ent.type === "text") {
      minX = Math.min(minX, ent.x);
      maxX = Math.max(maxX, ent.x + (ent.width ?? 60));
      minY = Math.min(minY, ent.y - ent.size);
      maxY = Math.max(maxY, ent.y);
      found = true;
    }
  }

  if (!found || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Calcula o estado de câmera `{ tx, ty, k }` que centraliza e enquadra o `bbox`
 * exatamente no centro da Área Livre Disponível à esquerda da janela de medidas.
 */
export function computeLeftSideFramingView({
  bbox,
  canvasWidth,
  canvasHeight,
  leftInsetPx = 172,
  rightReservedPx = 296,
  topInsetPx = 56,
  bottomInsetPx = 76,
  minZoom = 0.08,
  maxZoom = 4.5,
}: LeftSideFramingInput): ViewState {
  const safeLeft = Math.min(leftInsetPx, Math.max(48, canvasWidth * 0.28));
  const safeRight = Math.min(rightReservedPx, Math.max(240, canvasWidth * 0.48));
  const availW = Math.max(120, canvasWidth - safeLeft - safeRight);
  const availH = Math.max(120, canvasHeight - topInsetPx - bottomInsetPx);

  const pieceW = Math.max(24, bbox.maxX - bbox.minX);
  const pieceH = Math.max(24, bbox.maxY - bbox.minY);

  // Margem respirável de 24% ao redor da peça dentro da sub-janela esquerda
  const fitScaleX = (availW * 0.76) / pieceW;
  const fitScaleY = (availH * 0.76) / pieceH;
  const targetK = Math.max(minZoom, Math.min(maxZoom, Math.min(fitScaleX, fitScaleY)));

  const pieceCenterX = (bbox.minX + bbox.maxX) / 2;
  const pieceCenterY = (bbox.minY + bbox.maxY) / 2;

  const targetScreenCenterX = safeLeft + availW / 2;
  const targetScreenCenterY = topInsetPx + availH / 2;

  const targetTx = targetScreenCenterX - pieceCenterX * targetK;
  const targetTy = targetScreenCenterY - pieceCenterY * targetK;

  return {
    tx: targetTx,
    ty: targetTy,
    k: targetK,
  };
}

interface SmartFramingOptions {
  isOpen: boolean;
  selectedEntity: Entity | null;
  targetEntities?: (Entity | null | undefined)[];
  nudgeHudVisible?: boolean;
  view: ViewState;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  canvasWidth: number;
  canvasHeight: number;
  editorWidth?: number;
  editorHeight?: number;
}

export function useSmartFraming({
  isOpen,
  selectedEntity,
  targetEntities,
  nudgeHudVisible = false,
  view,
  setView,
  canvasWidth,
  canvasHeight,
}: SmartFramingOptions) {
  const [eventEditorOpen, setEventEditorOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onMeasureEditorState = (ev: Event) => {
      const detail = (ev as CustomEvent<{ open?: boolean }>).detail;
      if (detail && typeof detail.open === "boolean") {
        setEventEditorOpen(detail.open);
      }
    };
    window.addEventListener("chamfer:measure-editor-state", onMeasureEditorState);
    return () => window.removeEventListener("chamfer:measure-editor-state", onMeasureEditorState);
  }, []);

  const effectiveOpen = Boolean(isOpen || eventEditorOpen);

  const viewRef = useRef<ViewState>(view);
  viewRef.current = view;

  const previousViewportStateRef = useRef<ViewState | null>(null);
  const initialFramedBboxDiagRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  const animRafRef = useRef<number | null>(null);

  const animateCameraTo = useCallback(
    (target: ViewState) => {
      if (animRafRef.current !== null) {
        cancelAnimationFrame(animRafRef.current);
        animRafRef.current = null;
      }

      const startView = { ...viewRef.current };
      const deltaTx = target.tx - startView.tx;
      const deltaTy = target.ty - startView.ty;
      const deltaK = target.k - startView.k;

      if (Math.abs(deltaTx) < 0.5 && Math.abs(deltaTy) < 0.5 && Math.abs(deltaK) < 1e-4) {
        setView(target);
        return;
      }

      const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / AUTO_FRAMING_DURATION_MS);
        const eased = evaluateFluidFramingEasing(progress);

        const nextView: ViewState = {
          tx: startView.tx + deltaTx * eased,
          ty: startView.ty + deltaTy * eased,
          k: startView.k + deltaK * eased,
        };
        setView(nextView);

        if (progress < 1) {
          animRafRef.current = requestAnimationFrame(step);
        } else {
          animRafRef.current = null;
        }
      };

      animRafRef.current = requestAnimationFrame(step);
    },
    [setView],
  );

  useEffect(() => {
    return () => {
      if (animRafRef.current !== null) {
        cancelAnimationFrame(animRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    const candidates =
      targetEntities && targetEntities.length > 0
        ? targetEntities
        : selectedEntity
          ? [selectedEntity]
          : [];

    // 1. TRANSIÇÃO DE FECHADO -> ABERTO: Salva previousViewportState e enquadra à esquerda
    if (effectiveOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      previousViewportStateRef.current = { ...viewRef.current };

      const bbox = computeEntitiesBoundingBox(candidates);
      if (bbox) {
        initialFramedBboxDiagRef.current = Math.hypot(
          bbox.maxX - bbox.minX,
          bbox.maxY - bbox.minY,
        );
        const leftInsetPx = nudgeHudVisible ? 174 : 56;
        const targetView = computeLeftSideFramingView({
          bbox,
          canvasWidth,
          canvasHeight,
          leftInsetPx,
          rightReservedPx: 296,
          topInsetPx: 56,
          bottomInsetPx: 76,
        });
        animateCameraTo(targetView);
      }
      return;
    }

    // 2. TRANSIÇÃO DE ABERTO -> FECHADO: Retorno suave para previousViewportState
    if (!effectiveOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      const savedView = previousViewportStateRef.current;
      previousViewportStateRef.current = null;

      if (savedView) {
        const currentBbox = computeEntitiesBoundingBox(candidates);
        const initialDiag = initialFramedBboxDiagRef.current;
        initialFramedBboxDiagRef.current = null;

        // Se a peça mudou muito de tamanho (> 65%), faz re-fit limpo centralizado no canvas inteiro
        if (currentBbox && initialDiag && initialDiag > 1) {
          const newDiag = Math.hypot(
            currentBbox.maxX - currentBbox.minX,
            currentBbox.maxY - currentBbox.minY,
          );
          if (newDiag / initialDiag > 1.65 || newDiag / initialDiag < 0.45) {
            const fullCanvasView = computeLeftSideFramingView({
              bbox: currentBbox,
              canvasWidth,
              canvasHeight,
              leftInsetPx: nudgeHudVisible ? 174 : 56,
              rightReservedPx: 64,
              topInsetPx: 56,
              bottomInsetPx: 76,
            });
            animateCameraTo(fullCanvasView);
            return;
          }
        }

        animateCameraTo(savedView);
      }
    }
  }, [effectiveOpen, selectedEntity, targetEntities, nudgeHudVisible, canvasWidth, canvasHeight, animateCameraTo]);
}

