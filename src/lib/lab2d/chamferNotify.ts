export type ChamferNotificationType = "sucesso" | "informacao" | "aviso" | "erro";

export interface ChamferNotificationAction {
  rotulo: string;
  onClick: () => void;
}

export interface ChamferNotifyPayload {
  id?: string;
  tipo: ChamferNotificationType;
  titulo: string;
  mensagem?: string;
  acao?: ChamferNotificationAction;
  persistente?: boolean;
  duracaoMs?: number;
}

export const TOAST_CONFIG = {
  sucesso: 1800,
  informacao: 2000,
  aviso: 3000,
  erro: 4000,
  comAcao: 4000,
} as const;

export const CHAMFER_TOAST_TIMING = {
  entryMs: 180,
  exitMs: 170,
  reducedMotionMs: 80,
  dedupWindowMs: 800,
  priorityHoldMs: 1500,
} as const;

export interface ActiveChamferNotification {
  id: string;
  tipo: ChamferNotificationType;
  titulo: string;
  mensagem?: string;
  acao?: ChamferNotificationAction;
  persistente: boolean;
  durationMs: number;
  shownAt: number;
  lastTriggeredAt: number;
  remainingMs: number;
  paused: boolean;
  interactive: boolean;
  ariaRole: "status" | "alert";
  ariaLive: "polite" | "assertive";
  updateCount: number;
}

export interface ChamferNotificationStoreState {
  active: ActiveChamferNotification | null;
  queuedInfo: ChamferNotifyPayload | null;
}

type Listener = (state: ChamferNotificationStoreState) => void;

let currentState: ChamferNotificationStoreState = {
  active: null,
  queuedInfo: null,
};

const listeners = new Set<Listener>();
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
let priorityReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let activeTimerStartedAt = 0;
let idCounter = 0;

function nowMs(): number {
  return Date.now();
}

function emitChange(): void {
  const snapshot: ChamferNotificationStoreState = {
    active: currentState.active ? { ...currentState.active } : null,
    queuedInfo: currentState.queuedInfo ? { ...currentState.queuedInfo } : null,
  };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore isolated listener errors
    }
  });
}

function clearAutoDismissTimer(): void {
  if (autoDismissTimer !== null) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
}

function clearPriorityReleaseTimer(): void {
  if (priorityReleaseTimer !== null) {
    clearTimeout(priorityReleaseTimer);
    priorityReleaseTimer = null;
  }
}

export function resolveNotificationDuration(payload: ChamferNotifyPayload): number {
  if (payload.persistente) return Number.POSITIVE_INFINITY;
  if (typeof payload.duracaoMs === "number" && payload.duracaoMs > 0) {
    return payload.duracaoMs;
  }
  if (payload.acao) {
    return TOAST_CONFIG.comAcao;
  }
  return TOAST_CONFIG[payload.tipo];
}

export function isInteractiveNotification(payload: {
  tipo: ChamferNotificationType;
  acao?: ChamferNotificationAction;
  persistente?: boolean;
}): boolean {
  return Boolean(payload.acao || payload.tipo === "erro" || payload.persistente);
}

function scheduleAutoDismiss(durationMs: number): void {
  clearAutoDismissTimer();
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  activeTimerStartedAt = nowMs();
  autoDismissTimer = setTimeout(() => {
    autoDismissTimer = null;
    if (currentState.queuedInfo) {
      const next = currentState.queuedInfo;
      currentState.queuedInfo = null;
      presentNotificationImmediate(next);
      return;
    }
    currentState = {
      active: null,
      queuedInfo: null,
    };
    emitChange();
  }, durationMs);
}

function presentNotificationImmediate(payload: ChamferNotifyPayload): string {
  clearAutoDismissTimer();
  clearPriorityReleaseTimer();

  const ts = nowMs();
  const durationMs = resolveNotificationDuration(payload);
  const id = payload.id ?? `chamfer-toast-${++idCounter}`;
  const isError = payload.tipo === "erro";

  const nextActive: ActiveChamferNotification = {
    id,
    tipo: payload.tipo,
    titulo: payload.titulo.trim(),
    mensagem: payload.mensagem?.trim() || undefined,
    acao: payload.acao,
    persistente: Boolean(payload.persistente),
    durationMs,
    shownAt: ts,
    lastTriggeredAt: ts,
    remainingMs: durationMs,
    paused: false,
    interactive: isInteractiveNotification(payload),
    ariaRole: isError ? "alert" : "status",
    ariaLive: isError ? "assertive" : "polite",
    updateCount: (currentState.active?.updateCount ?? 0) + 1,
  };

  currentState = {
    active: nextActive,
    queuedInfo: null,
  };

  if (!nextActive.persistente) {
    scheduleAutoDismiss(durationMs);
  }

  emitChange();
  return id;
}

export function notify(payload: ChamferNotifyPayload): string {
  const cleanTitle = (payload.titulo ?? "").trim();
  const cleanMsg = payload.mensagem?.trim() || undefined;
  const normalizedPayload: ChamferNotifyPayload = {
    ...payload,
    titulo: cleanTitle,
    mensagem: cleanMsg,
  };

  const ts = nowMs();
  const active = currentState.active;

  if (
    active &&
    active.tipo === normalizedPayload.tipo &&
    active.titulo === normalizedPayload.titulo &&
    (active.mensagem ?? "") === (normalizedPayload.mensagem ?? "") &&
    ts - active.lastTriggeredAt < CHAMFER_TOAST_TIMING.dedupWindowMs
  ) {
    const durationMs = resolveNotificationDuration(normalizedPayload);
    active.lastTriggeredAt = ts;
    active.remainingMs = durationMs;
    active.paused = false;
    active.updateCount += 1;
    if (!active.persistente) {
      scheduleAutoDismiss(durationMs);
    }
    emitChange();
    return active.id;
  }

  if (
    active &&
    (active.tipo === "aviso" || active.tipo === "erro") &&
    normalizedPayload.tipo === "informacao"
  ) {
    const elapsed = ts - active.shownAt;
    if (elapsed < CHAMFER_TOAST_TIMING.priorityHoldMs) {
      const waitMs = Math.max(1, CHAMFER_TOAST_TIMING.priorityHoldMs - elapsed);
      currentState = {
        ...currentState,
        queuedInfo: normalizedPayload,
      };
      clearPriorityReleaseTimer();
      priorityReleaseTimer = setTimeout(() => {
        priorityReleaseTimer = null;
        if (currentState.queuedInfo) {
          const pending = currentState.queuedInfo;
          currentState.queuedInfo = null;
          presentNotificationImmediate(pending);
        }
      }, waitMs);
      emitChange();
      return normalizedPayload.id ?? "queued-info";
    }
  }

  return presentNotificationImmediate(normalizedPayload);
}

export function pauseNotificationTimer(): void {
  const active = currentState.active;
  if (!active || active.paused || active.persistente) return;
  const elapsed = Math.max(0, nowMs() - activeTimerStartedAt);
  active.remainingMs = Math.max(250, active.remainingMs - elapsed);
  active.paused = true;
  clearAutoDismissTimer();
  emitChange();
}

export function resumeNotificationTimer(): void {
  const active = currentState.active;
  if (!active || !active.paused || active.persistente) return;
  active.paused = false;
  scheduleAutoDismiss(active.remainingMs);
  emitChange();
}

export function dismissNotification(id?: string): void {
  if (!currentState.active) return;
  if (id && currentState.active.id !== id) return;
  clearAutoDismissTimer();
  clearPriorityReleaseTimer();
  currentState = {
    active: null,
    queuedInfo: null,
  };
  emitChange();
}

export function clearAllNotifications(): void {
  clearAutoDismissTimer();
  clearPriorityReleaseTimer();
  if (currentState.active !== null || currentState.queuedInfo !== null) {
    currentState = {
      active: null,
      queuedInfo: null,
    };
    emitChange();
  }
}

export function getNotificationState(): ChamferNotificationStoreState {
  return currentState;
}

export function getActiveTimerCount(): number {
  return (autoDismissTimer !== null ? 1 : 0) + (priorityReleaseTimer !== null ? 1 : 0);
}

export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function parseLegacyToastMessage(
  rawTitle: string,
  options?: {
    description?: string;
    id?: string;
    duration?: number;
    action?: { label: string; onClick: () => void };
  },
): {
  id?: string;
  titulo: string;
  mensagem?: string;
  acao?: ChamferNotificationAction;
  duracaoMs?: number;
} {
  const trimmed = String(rawTitle ?? "")
    .replace(/^[✓✔⚠!ⓘ]\s*/u, "")
    .trim();

  if (/^padr[aã]o cancelado/i.test(trimmed)) {
    return {
      id: options?.id,
      titulo: "Padrão cancelado",
      mensagem: options?.description ?? "Nenhuma alteração foi gravada.",
      acao: options?.action
        ? { rotulo: options.action.label, onClick: options.action.onClick }
        : undefined,
      duracaoMs: options?.duration,
    };
  }

  let titulo = trimmed;
  let mensagem = options?.description?.trim();

  if (!mensagem) {
    const dotSplit = trimmed.match(/^([^.!?]{4,42})\.\s+(.+)$/);
    const dashSplit = trimmed.match(/^([^—–]{4,42})\s+[—–]\s+(.+)$/);
    if (dotSplit) {
      titulo = dotSplit[1]!.trim();
      mensagem = dotSplit[2]!.trim();
    } else if (dashSplit) {
      titulo = dashSplit[1]!.trim();
      mensagem = dashSplit[2]!.trim();
    }
  }

  return {
    id: options?.id,
    titulo,
    mensagem: mensagem || undefined,
    acao: options?.action
      ? { rotulo: options.action.label, onClick: options.action.onClick }
      : undefined,
    duracaoMs: options?.duration,
  };
}

export interface LegacyToastOptions {
  id?: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

function createLegacyToastAdapter() {
  const baseToast = (title: string, options?: LegacyToastOptions) => {
    const parsed = parseLegacyToastMessage(title, options);
    return notify({
      ...parsed,
      tipo: "informacao",
    });
  };

  baseToast.success = (title: string, options?: LegacyToastOptions) => {
    const parsed = parseLegacyToastMessage(title, options);
    return notify({
      ...parsed,
      tipo: "sucesso",
    });
  };

  baseToast.info = (title: string, options?: LegacyToastOptions) => {
    const parsed = parseLegacyToastMessage(title, options);
    return notify({
      ...parsed,
      tipo: "informacao",
    });
  };

  baseToast.warning = (title: string, options?: LegacyToastOptions) => {
    const parsed = parseLegacyToastMessage(title, options);
    return notify({
      ...parsed,
      tipo: "aviso",
    });
  };

  baseToast.error = (title: string, options?: LegacyToastOptions) => {
    const parsed = parseLegacyToastMessage(title, options);
    return notify({
      ...parsed,
      tipo: "erro",
    });
  };

  baseToast.dismiss = (id?: string) => {
    dismissNotification(id);
  };

  return baseToast;
}

export const toast = createLegacyToastAdapter();
export const chamferToast = toast;
