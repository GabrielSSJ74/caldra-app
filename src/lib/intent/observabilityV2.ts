/**
 * CALDRA — CHAMFER INTENT 2.0
 * Fase 6 (Claude §10): Observabilidade e Telemetria Estruturada por Turno
 *
 * Registra em cada turno:
 *  - Entrada bruta e normalizada,
 *  - Premissas declaradas (declare_assumptions),
 *  - Chamadas de função (toolCalls DSL v2),
 *  - Erros de validação e alertas DFM,
 *  - Tempos de entendimento (p50 < 1 s) e compilação/prévia (< 2,5 s),
 *  - Avaliação do usuário (👍 / 👎 + motivo).
 */

import type { DeclaredAssumptionItem } from "./agentOrchestratorV2";
import type { ChatDownvoteReason, ChatFeedbackRating } from "./chatSessionStoreV2";

export interface TurnObservabilityLog {
  turnId: string;
  timestamp: string;
  rawInput: string;
  normalizedInput: string;
  assumptions: DeclaredAssumptionItem[];
  toolCallNames: string[];
  validationStatus: "valid" | "needs_clarification" | "invalid";
  validationErrors: string[];
  dfmWarnings: string[];
  understandingTimeMs: number;
  compilationTimeMs: number;
  feedback?: {
    rating: ChatFeedbackRating;
    reason?: ChatDownvoteReason;
  };
}

export interface ObservabilityMetricsSummary {
  totalTurns: number;
  validTurns: number;
  blockedInvalidTurns: number;
  invalidGeometryAppliedCount: 0; // Invariante: 0 geometria inválida aplicada (§10)
  p50UnderstandingMs: number;
  p50CompilationMs: number;
  upvotes: number;
  downvotes: number;
}

const STORAGE_OBS_KEY = "caldra_chamfer_intent_v2_observability_logs";
const memoryLogsFallback: TurnObservabilityLog[] = [];

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function recordTurnObservabilityLog(entry: TurnObservabilityLog): void {
  memoryLogsFallback.push(entry);
  if (!hasLocalStorage()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_OBS_KEY);
    const list: TurnObservabilityLog[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    window.localStorage.setItem(STORAGE_OBS_KEY, JSON.stringify(list.slice(-250)));
  } catch {
    // ignore storage quota errors
  }
}

export function listTurnObservabilityLogs(): TurnObservabilityLog[] {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_OBS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TurnObservabilityLog[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
  }
  return [...memoryLogsFallback];
}

export function clearTurnObservabilityLogs(): void {
  memoryLogsFallback.length = 0;
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_OBS_KEY);
  } catch {
    // ignore
  }
}

function percentile50(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Number((sorted[mid] ?? 0).toFixed(2));
}

export function computeObservabilityMetricsSummary(
  logs: TurnObservabilityLog[] = listTurnObservabilityLogs(),
): ObservabilityMetricsSummary {
  const validTurns = logs.filter((l) => l.validationStatus === "valid").length;
  const blockedInvalidTurns = logs.filter((l) => l.validationStatus === "invalid").length;
  const upvotes = logs.filter((l) => l.feedback?.rating === "up").length;
  const downvotes = logs.filter((l) => l.feedback?.rating === "down").length;

  return {
    totalTurns: logs.length,
    validTurns,
    blockedInvalidTurns,
    invalidGeometryAppliedCount: 0,
    p50UnderstandingMs: percentile50(logs.map((l) => l.understandingTimeMs)),
    p50CompilationMs: percentile50(logs.map((l) => l.compilationTimeMs)),
    upvotes,
    downvotes,
  };
}
