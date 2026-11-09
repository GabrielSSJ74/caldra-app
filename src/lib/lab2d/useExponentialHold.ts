import { useCallback, useEffect, useRef } from "react";

export interface ExponentialHoldStepConfig {
  intervalMs: number;
  multiplier: number;
}

/**
 * Calcula o intervalo de repetição (ms) e o multiplicador de passo
 * conforme o tempo de pressão contínua (t em ms) após o início da repetição:
 * - 0.3s a 1.2s (elapsed < 1200ms): intervalo 110ms, passo 1x
 * - 1.2s a 2.5s (1200ms <= elapsed < 2500ms): intervalo 65ms, passo 2x
 * - 2.5s a 4.0s (2500ms <= elapsed < 4000ms): intervalo 45ms, passo 5x
 * - > 4.0s (elapsed >= 4000ms): intervalo 35ms, passo 15x
 */
export function getExponentialHoldConfig(elapsedMs: number): ExponentialHoldStepConfig {
  if (elapsedMs < 1200) {
    return { intervalMs: 110, multiplier: 1 };
  }
  if (elapsedMs < 2500) {
    return { intervalMs: 65, multiplier: 2 };
  }
  if (elapsedMs < 4000) {
    return { intervalMs: 45, multiplier: 5 };
  }
  return { intervalMs: 35, multiplier: 15 };
}

export interface UseExponentialHoldOptions {
  initialDelayMs?: number;
  disabled?: boolean;
  onHoldStart?: () => void;
  onHoldEnd?: (didRepeat: boolean) => void;
}

export interface ExponentialHoldHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Hook reutilizável para botões +/- com aceleração progressiva/exponencial ao manter pressionado:
 * - Clique único: aplica 1x o incremento base imediatamente no pointerDown.
 * - Manter pressionado: inicia repetição após 280ms e acelera progressivamente
 *   (1x -> 2x -> 5x -> 15x) conforme o tempo segurando o botão.
 * - Para imediatamente em pointerUp, pointerLeave ou pointerCancel.
 */
export function useExponentialHold(
  onStep: (multiplier: number) => void,
  options?: UseExponentialHoldOptions
): ExponentialHoldHandlers {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const didRepeatRef = useRef(false);
  const startTimeRef = useRef(0);
  const suppressNextClickRef = useRef(false);

  const stopHold = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (activeRef.current) {
      const repeated = didRepeatRef.current;
      activeRef.current = false;
      didRepeatRef.current = false;
      optionsRef.current?.onHoldEnd?.(repeated);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const scheduleNextTick = useCallback(() => {
    if (!activeRef.current) return;
    const elapsedMs = performance.now() - startTimeRef.current;
    const { intervalMs, multiplier } = getExponentialHoldConfig(elapsedMs);
    timerRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      didRepeatRef.current = true;
      onStepRef.current(multiplier);
      scheduleNextTick();
    }, intervalMs);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (optionsRef.current?.disabled) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.stopPropagation();
      stopHold();

      activeRef.current = true;
      didRepeatRef.current = false;
      suppressNextClickRef.current = true;
      startTimeRef.current = performance.now();

      optionsRef.current?.onHoldStart?.();
      // Clique inicial imediato (1x)
      onStepRef.current(1);

      const initialDelay = optionsRef.current?.initialDelayMs ?? 280;
      timerRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        didRepeatRef.current = true;
        const elapsedMs = performance.now() - startTimeRef.current;
        const { multiplier } = getExponentialHoldConfig(elapsedMs);
        onStepRef.current(multiplier);
        scheduleNextTick();
      }, initialDelay);
    },
    [scheduleNextTick, stopHold]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      stopHold();
    },
    [stopHold]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      stopHold();
    },
    [stopHold]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      stopHold();
    },
    [stopHold]
  );

  const onClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (optionsRef.current?.disabled) return;
    onStepRef.current(1);
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClick,
  };
}
