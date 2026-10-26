/**
 * CALDRA — CHAMFER INTENT 2.0
 * Integração com o Endpoint Server-Side Gemini (`/api/chamfer-intent`) + Fallback Determinístico V2
 *
 * Princípio Arquitetural (§1 e §3 do Prompt Mestre Claude):
 *   1. As chamadas à API Gemini acontecem exclusivamente no servidor via `/api/chamfer-intent`
 *      usando a System Instruction literal (§9) e o catálogo completo de 46 funções (§6).
 *   2. Cada função retornada roda imediatamente em dry-run no compilador determinístico e passa
 *      pelo validador de fabricação (§8).
 *   3. Havendo erros bloqueantes no dry-run do LLM, devolvemos os erros ao endpoint para
 *      auto-correção com a menor mudança possível (máximo de 2 tentativas).
 *   4. Em modo offline, testes locais ou falha de rede, o motor determinístico V2 assume
 *      sem interromper o fluxo de trabalho do usuário.
 */

import { Type, type FunctionDeclaration, type Schema } from "@google/genai";
import type { Entity, LayerId } from "@/lib/lab2d/core";
import type { Dimension } from "@/lib/lab2d/dimensions";
import type { ChamferIntentPlan, ParametricSessionContext } from "./schema";
import { ChamferIntentInterpreter } from "./intentInterpreter";
import { CHAMFER_INTENT_V2_SYSTEM_INSTRUCTION } from "./chamferIntent.systemInstruction";
import { CHAMFER_DSL_V2_FUNCTION_DECLARATIONS, type DslV2ToolCall } from "./dslV2Schemas";
import {
  executeAgentTurnV2Sync,
  type AgentStreamingCallbacks,
} from "./agentOrchestratorV2";
import {
  buildPartModelFromCanvas,
  createEmptyPartModel,
  type PartModel,
} from "./partModel";

export const CHAMFER_INTENT_SYSTEM_INSTRUCTION = CHAMFER_INTENT_V2_SYSTEM_INSTRUCTION;

export const CHAMFER_INTENT_GEMINI_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    intent_category: {
      type: Type.STRING,
      description: "Categoria da operação: create, modify, query, select, delete, undo, export",
    },
    operation_type: {
      type: Type.STRING,
      description: "Tipo de comando CAD do catálogo",
    },
    parameters: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.NUMBER, description: "Largura em mm" },
        height: { type: Type.NUMBER, description: "Altura em mm" },
        corner_radius: { type: Type.NUMBER, description: "Raio de arredondamento dos cantos em mm" },
        corner_chamfer: { type: Type.NUMBER, description: "Distância de chanfro nos cantos em mm" },
        hole_count: { type: Type.INTEGER, description: "Quantidade de furos" },
        hole_diameter: { type: Type.NUMBER, description: "Diâmetro dos furos em mm" },
        hole_distribution: { type: Type.STRING, description: "Arranjo dos furos" },
        margin: { type: Type.NUMBER, description: "Margem até a borda em mm" },
        pitch: { type: Type.NUMBER, description: "Passo centro a centro entre furos em mm" },
        pcd: { type: Type.NUMBER, description: "Diâmetro PCD em mm" },
        outer_diameter: { type: Type.NUMBER, description: "Diâmetro externo em mm" },
        inner_diameter: { type: Type.NUMBER, description: "Diâmetro interno em mm" },
      },
    },
    summary: {
      type: Type.STRING,
      description: "Resumo técnico objetivo em português da intenção interpretada",
    },
  },
  required: ["intent_category", "operation_type", "parameters", "summary"],
};

export const CHAMFER_INTENT_FUNCTION_DECLARATIONS: FunctionDeclaration[] =
  CHAMFER_DSL_V2_FUNCTION_DECLARATIONS;

/**
 * Executa um turno do Agente Chamfer Intent 2.0 via endpoint server-side `/api/chamfer-intent`
 * com streaming, dry-run por chamada, validador DFM (§8) e loop de auto-correção (máx. 2 tentativas),
 * caindo automaticamente para o compilador determinístico local quando offline.
 */
export async function interpretWithGeminiOrDeterministic(
  prompt: string,
  context: {
    existingEntities?: Entity[];
    existingDimensions?: Dimension[];
    selectedEntityIds?: string[];
    activeLayer?: LayerId;
    session?: ParametricSessionContext;
    parameterOverrides?: Record<string, unknown>;
    partModel?: PartModel;
    streamingCallbacks?: AgentStreamingCallbacks;
    signal?: AbortSignal;
  } = {},
): Promise<ChamferIntentPlan> {
  const partModel =
    context.partModel ??
    buildPartModelFromCanvas({
      entities: context.existingEntities ?? [],
      dimensions: context.existingDimensions ?? [],
      selectedEntityIds: context.selectedEntityIds ?? [],
      previousModel: createEmptyPartModel(),
    });

  // Se estiver no navegador e online, tenta o endpoint server-side `/api/chamfer-intent` com auto-correção até 2 vezes
  if (typeof window !== "undefined" && typeof fetch === "function") {
    try {
      let dryRunErrors: string[] = [];
      const maxAutoCorrections = 2;

      for (let attempt = 0; attempt <= maxAutoCorrections; attempt++) {
        const res = await fetch("/api/chamfer-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            partModel,
            selectedEntityIds: context.selectedEntityIds ?? [],
            dryRunErrors,
            stream: false,
          }),
          signal: context.signal,
        });

        if (!res.ok) break;
        const payload = (await res.json()) as {
          ok?: boolean;
          offlineFallback?: boolean;
          understandingText?: string;
          toolCalls?: DslV2ToolCall[];
        };

        if (payload.offlineFallback || !payload.ok || !payload.toolCalls?.length) {
          break;
        }

        const v2Turn = executeAgentTurnV2Sync(prompt, {
          existingEntities: context.existingEntities,
          existingDimensions: context.existingDimensions,
          selectedEntityIds: context.selectedEntityIds,
          activeLayer: context.activeLayer,
          partModel,
          parameterOverrides: context.parameterOverrides,
          precomputedToolCalls: payload.toolCalls,
          precomputedUnderstandingText: payload.understandingText,
          callbacks: context.streamingCallbacks,
        });

        if (v2Turn.manufacturingReport.ok || attempt === maxAutoCorrections) {
          const basePlan = ChamferIntentInterpreter.compilePrompt(prompt, {
            ...context,
            partModel,
          });
          basePlan.v2 = {
            ...v2Turn,
            autoCorrectionAttempts: attempt,
          };
          return basePlan;
        }

        dryRunErrors = v2Turn.manufacturingReport.errors.map(
          (e) => `[${e.entity_id}] ${e.message} (${e.suggested_fix})`,
        );
      }
    } catch {
      // Fallback imediato para compilação determinística local V2
    }
  }

  return ChamferIntentInterpreter.compilePrompt(prompt, {
    ...context,
    partModel,
  });
}
