import { useCallback, useEffect, useRef } from "react";
import type React from "react";

export interface ExponentialHoldOptions {
  initialDelayMs?: number;
  intervalMs?: number;
}

export interface ExponentialHoldHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}

/**
 * Hook de aceleração exponencial para botões numéricos (- / +).
 * Dispara `onStep(1)` no primeiro toque/clique e acelera progressivamente
 * (1 -> 2 -> 5 -> 10) enquanto o botão permanece pressionado.
 */
export function useExponentialHold(
  onStep: (multiplier: number) => void,
  options?: ExponentialHoldOptions,
): ExponentialHoldHandlers {
  const initialDelayMs = options?.initialDelayMs ?? 340;
  const intervalMs = options?.intervalMs ?? 85;

  const callbackRef = useRef(onStep);
  callbackRef.current = onStep;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ticksRef = useRef(0);
  const handledByPointerRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    ticksRef.current = 0;
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.stopPropagation();
      clearTimers();
      handledByPointerRef.current = true;
      callbackRef.current(1);

      timeoutRef.current = setTimeout(() => {
        ticksRef.current = 0;
        intervalRef.current = setInterval(() => {
          ticksRef.current += 1;
          const t = ticksRef.current;
          const mult = t > 24 ? 10 : t > 12 ? 5 : t > 5 ? 2 : 1;
          callbackRef.current(mult);
        }, intervalMs);
      }, initialDelayMs);
    },
    [clearTimers, initialDelayMs, intervalMs],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      clearTimers();
      setTimeout(() => {
        handledByPointerRef.current = false;
      }, 50);
    },
    [clearTimers],
  );

  const onPointerLeave = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  const onPointerCancel = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  const onClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (handledByPointerRef.current) {
      handledByPointerRef.current = false;
      return;
    }
    callbackRef.current(1);
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClick,
  };
}
