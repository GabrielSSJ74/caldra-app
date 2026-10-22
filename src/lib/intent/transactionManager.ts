/**
 * CALDRA — CHAMFER INTENT
 * Módulo 2.6 e Seção 13: Gerenciador de Transações, Pré-Visualização e Idempotência
 * (Transaction & Preview Manager)
 *
 * Responsabilidades:
 *  - Gerenciar o estado de pré-visualização (ghost entities) antes da confirmação;
 *  - Garantir idempotência estrita por plan_id (impede aplicação duplicada);
 *  - Executar commit atômico na árvore de entidades e cotas do CHAMFER CAD;
 *  - Integrar cada plano confirmado ao histórico de Undo/Redo e ao Feature Graph;
 *  - Preservar o contexto paramétrico da sessão para edições multi-turno subsequentes.
 */

import type { Entity } from "@/lib/lab2d/core";
import type { Dimension } from "@/lib/lab2d/dimensions";
import { globalFeatureGraph } from "@/lib/lab2d/cadFeatureGraph";
import type {
  ChamferIntentPlan,
  ParametricFeatureState,
  ParametricSessionContext,
} from "./schema";
import { ChamferIntentInterpreter } from "./intentInterpreter";

export interface TransactionCommitCallbacks {
  commitEntities: (next: Entity[] | ((prev: Entity[]) => Entity[])) => void;
  setDimensions?: (next: Dimension[] | ((prev: Dimension[]) => Dimension[])) => void;
  setSelection?: (ids: string[]) => void;
  fitViewport?: (viewport: { x: number; y: number; width: number; height: number }) => void;
  triggerUndo?: () => void;
  triggerExport?: (format: "dxf" | "svg" | "pdf") => void;
}

export interface TransactionCommitResult {
  committed: boolean;
  reason?: string;
  planId: string;
  appliedEntityCount: number;
  updatedSession: ParametricSessionContext;
}

export class ChamferTransactionManager {
  private executedPlanIds = new Set<string>();
  private session: ParametricSessionContext;
  private activePreviewPlan: ChamferIntentPlan | null = null;

  constructor(initialSession?: ParametricSessionContext) {
    this.session = initialSession ?? ChamferIntentInterpreter.createInitialSessionContext();
  }

  public getSession(): ParametricSessionContext {
    return this.session;
  }

  public setSession(next: ParametricSessionContext): void {
    this.session = next;
  }

  public getActivePreviewPlan(): ChamferIntentPlan | null {
    return this.activePreviewPlan;
  }

  public setPreviewPlan(plan: ChamferIntentPlan | null): void {
    this.activePreviewPlan = plan;
  }

  public hasExecuted(planId: string): boolean {
    return this.executedPlanIds.has(planId);
  }

  /**
   * Resolve uma ambiguidade pendente ou altera um parâmetro do plano em pré-visualização,
   * recompilando deterministicamente o plano antes do commit.
   */
  public refinePreviewPlan(
    patch: Record<string, unknown>,
    existingEntities: Entity[],
    selectedEntityIds: string[],
  ): ChamferIntentPlan | null {
    if (!this.activePreviewPlan) return null;

    const promptToCompile =
      (patch.preset_prompt as string | undefined) ?? this.activePreviewPlan.intent.raw_prompt;

    const cleanPatch = { ...patch };
    delete cleanPatch.preset_prompt;

    const mergedOverrides = {
      ...this.activePreviewPlan.parameters,
      ...cleanPatch,
    };

    const recompiled = ChamferIntentInterpreter.compilePrompt(promptToCompile, {
      existingEntities,
      selectedEntityIds,
      session: this.session,
      parameterOverrides: mergedOverrides,
    });

    this.activePreviewPlan = recompiled;
    return recompiled;
  }

  /**
   * Aplica atomicamente um ChamferIntentPlan validado ao estado do CHAMFER CAD.
   * Nunca aplica planos com status 'invalid' ou 'needs_clarification' nem planos já executados.
   */
  public commitPlan(
    plan: ChamferIntentPlan,
    callbacks: TransactionCommitCallbacks,
  ): TransactionCommitResult {
    // 1. Guarda de Idempotência
    if (this.executedPlanIds.has(plan.plan_id)) {
      return {
        committed: false,
        reason: "DUPLICATE_PLAN_ID",
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }

    // 2. Guarda de Validação e Ambiguidade
    if (plan.validation.status === "invalid") {
      return {
        committed: false,
        reason: "PLAN_INVALID",
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }
    if (plan.validation.status === "needs_clarification") {
      return {
        committed: false,
        reason: "NEEDS_CLARIFICATION",
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }

    // 3. Caso de operação de Undo
    if (plan.intent.category === "undo") {
      this.executedPlanIds.add(plan.plan_id);
      callbacks.triggerUndo?.();
      const prevFeature: ParametricFeatureState | null =
        this.session.featureHistory.length > 1
          ? this.session.featureHistory[this.session.featureHistory.length - 2]!
          : null;
      this.session = {
        ...this.session,
        turnIndex: plan.intent.turn_index,
        activeFeature: prevFeature,
        featureHistory: this.session.featureHistory.slice(0, -1),
        lastPlan: plan,
        conversationLog: [
          ...this.session.conversationLog,
          {
            turn: plan.intent.turn_index,
            prompt: plan.intent.raw_prompt,
            planId: plan.plan_id,
            summary: plan.intent.summary,
            status: plan.validation.status,
            timestamp: Date.now(),
          },
        ],
      };
      this.activePreviewPlan = null;
      return {
        committed: true,
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }

    // 4. Caso de Exportação
    if (plan.intent.category === "export") {
      this.executedPlanIds.add(plan.plan_id);
      const fmt = (plan.parameters.format as "dxf" | "svg" | "pdf") ?? "dxf";
      callbacks.triggerExport?.(fmt);
      this.activePreviewPlan = null;
      return {
        committed: true,
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }

    // 5. Caso de Consulta ou Seleção (não muta geometria)
    if (plan.intent.category === "query" || plan.intent.category === "select") {
      this.executedPlanIds.add(plan.plan_id);
      if (plan.compiled?.selectedEntityIds && callbacks.setSelection) {
        callbacks.setSelection(plan.compiled.selectedEntityIds);
      }
      this.session = {
        ...this.session,
        turnIndex: plan.intent.turn_index,
        lastPlan: plan,
        conversationLog: [
          ...this.session.conversationLog,
          {
            turn: plan.intent.turn_index,
            prompt: plan.intent.raw_prompt,
            planId: plan.plan_id,
            summary: plan.response_summary,
            status: plan.validation.status,
            timestamp: Date.now(),
          },
        ],
      };
      this.activePreviewPlan = null;
      return {
        committed: true,
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }

    // 6. Commit Atômico de Criação, Modificação ou Exclusão
    const compiled = plan.compiled;
    if (!compiled) {
      return {
        committed: false,
        reason: "MISSING_COMPILED_PAYLOAD",
        planId: plan.plan_id,
        appliedEntityCount: 0,
        updatedSession: this.session,
      };
    }

    this.executedPlanIds.add(plan.plan_id);

    callbacks.commitEntities(compiled.finalEntities);

    if (callbacks.setDimensions && compiled.generatedDimensions.length > 0) {
      if (compiled.replacedEntityIds.length > 0 && this.session.activeFeature?.dimensionIds.length) {
        const oldDimIds = new Set(this.session.activeFeature.dimensionIds);
        callbacks.setDimensions((prev) => [
          ...prev.filter((d) => !oldDimIds.has(d.id)),
          ...compiled.generatedDimensions,
        ]);
      } else {
        callbacks.setDimensions((prev) => [...prev, ...compiled.generatedDimensions]);
      }
    }

    if (callbacks.setSelection) {
      callbacks.setSelection(compiled.selectedEntityIds);
    }

    if (callbacks.fitViewport && compiled.suggestedViewport) {
      callbacks.fitViewport(compiled.suggestedViewport);
    }

    // Registra no Grafo de Recursos (Feature Graph) do CHAMFER
    globalFeatureGraph.addFeature(
      plan.intent.category === "modify" ? "fillet" : "create_rect",
      plan.intent.summary,
      plan.parameters,
      compiled.selectedEntityIds,
    );

    const nextActiveFeature = compiled.parametricFeatureSnapshot ?? this.session.activeFeature;
    const nextHistory = nextActiveFeature
      ? [...this.session.featureHistory, nextActiveFeature]
      : this.session.featureHistory;

    this.session = {
      turnIndex: plan.intent.turn_index,
      activeFeature: nextActiveFeature,
      featureHistory: nextHistory,
      lastPlan: plan,
      conversationLog: [
        ...this.session.conversationLog,
        {
          turn: plan.intent.turn_index,
          prompt: plan.intent.raw_prompt,
          planId: plan.plan_id,
          summary: plan.intent.summary,
          status: plan.validation.status,
          timestamp: Date.now(),
        },
      ],
    };

    this.activePreviewPlan = null;

    return {
      committed: true,
      planId: plan.plan_id,
      appliedEntityCount: compiled.previewEntities.length,
      updatedSession: this.session,
    };
  }
}
