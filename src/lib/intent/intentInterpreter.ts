/**
 * CALDRA — CHAMFER INTENT
 * Módulos 2.1 e 2.2: Interpretador de Intenção (Intent Interpreter) &
 * Compilador de Plano Paramétrico (Parametric Plan Compiler)
 *
 * Responsabilidades:
 *  - Interpretar comandos em português técnico ou informal;
 *  - Normalizar unidades (mm, cm, m, pol, graus) e expressões naturais;
 *  - Detectar parâmetros omitidos, ambiguidades e conflitos geométricos;
 *  - Manter continuidade conversacional multi-turno sobre a peça paramétrica ativa;
 *  - Gerar o plano intermediário canônico (ChamferIntentPlan v1.0.0) determinístico.
 */

import {
  bbox,
  mirror,
  rotate,
  scaleEntity,
  translate,
  uid,
  type Entity,
  type LayerId,
  type Vec2,
} from "@/lib/lab2d/core";
import { createSlotPolyline } from "@/lib/lab2d/cadGeometryCore";
import type { Dimension } from "@/lib/lab2d/dimensions";
import {
  CHAMFER_INTENT_SCHEMA_VERSION,
  type CadCommandType,
  type ChamferIntentPlan,
  type CornerSelector,
  type DistanceMeasurementMode,
  type HoleDistributionMode,
  type IntentCategory,
  type IntentOperation,
  type LinearHoleFormulaMode,
  type ParameterProvenance,
  type ParametricFeatureState,
  type ParametricHoleGroup,
  type ParametricSessionContext,
  type TypedParameter,
  type UnresolvedAmbiguity,
} from "./schema";
import {
  normalizeNaturalLanguageNumbers,
  parseCornerSelector,
  parseDistanceMeasurementMode,
  parseSpatialReferenceFrame,
} from "./unitAndReferenceParser";
import { ChamferGeometricExecutionEngine } from "./geometricExecutionEngine";
import { ChamferValidationEngine } from "./validationEngine";
import { executeAgentTurnV2Sync, type AgentStreamingCallbacks } from "./agentOrchestratorV2";
import type { PartModel } from "./partModel";

export class ChamferIntentInterpreter {
  /**
   * Cria um contexto de sessão paramétrica limpo.
   */
  public static createInitialSessionContext(): ParametricSessionContext {
    return {
      turnIndex: 0,
      activeFeature: null,
      featureHistory: [],
      lastPlan: null,
      conversationLog: [],
    };
  }

  /**
   * Ponto de entrada principal: compila um comando em linguagem natural (e possíveis patches de desambiguação)
   * em um ChamferIntentPlan completo, validado e enriquecido com o Agente V2 (DSL v2 + DFM + Premissas).
   */
  public static compilePrompt(
    rawPrompt: string,
    context: {
      existingEntities?: Entity[];
      selectedEntityIds?: string[];
      activeLayer?: LayerId;
      session?: ParametricSessionContext;
      parameterOverrides?: Record<string, unknown>;
      partModel?: PartModel;
      streamingCallbacks?: AgentStreamingCallbacks;
    } = {},
  ): ChamferIntentPlan {
    const plan = ChamferIntentInterpreter.compilePromptInternal(rawPrompt, context);
    const v2 = executeAgentTurnV2Sync(rawPrompt, {
      existingEntities: context.existingEntities,
      selectedEntityIds: context.selectedEntityIds,
      activeLayer: context.activeLayer,
      partModel: context.partModel,
      parameterOverrides: context.parameterOverrides,
      callbacks: context.streamingCallbacks,
    });
    plan.v2 = v2;

    if (v2.isRefusal && v2.refusalMessage) {
      plan.intent.summary = "Fora do escopo do Chamfer CAD";
      plan.response_summary = v2.refusalMessage;
      plan.validation = {
        status: "invalid",
        issues: [
          {
            code: "SECURITY_OR_SCOPE_REFUSAL",
            severity: "error",
            message: v2.refusalMessage,
          },
        ],
        checkedAt: Date.now(),
      };
      if (plan.compiled) {
        plan.compiled.previewEntities = [];
        plan.compiled.finalEntities = context.existingEntities ?? [];
      }
    } else if (v2.unsupportedReport) {
      plan.intent.summary = `Não suportado diretamente: ${v2.unsupportedReport.request}`;
      plan.response_summary = v2.unsupportedReport.alternative;
      plan.warnings = [
        ...plan.warnings,
        `Alternativa sugerida: ${v2.unsupportedReport.alternative}`,
      ];
    }

    return plan;
  }

  private static compilePromptInternal(
    rawPrompt: string,
    context: {
      existingEntities?: Entity[];
      selectedEntityIds?: string[];
      activeLayer?: LayerId;
      session?: ParametricSessionContext;
      parameterOverrides?: Record<string, unknown>;
    } = {},
  ): ChamferIntentPlan {
    const existingEntities = context.existingEntities ?? [];
    const selectedIds = context.selectedEntityIds ?? [];
    const activeLayer = context.activeLayer ?? "corte";
    const session = context.session ?? ChamferIntentInterpreter.createInitialSessionContext();
    const overrides = context.parameterOverrides ?? {};
    const turnIndex = session.turnIndex + 1;

    const cleanPrompt = rawPrompt.trim();
    const normalized = normalizeNaturalLanguageNumbers(cleanPrompt);
    const q = normalized.toLowerCase();

    const originMode = parseSpatialReferenceFrame(cleanPrompt, selectedIds.length > 0);
    const activePart = session.activeFeature;

    // -------------------------------------------------------------------------
    // 1. OPERAÇÃO DE DESFAZER (UNDO)
    // -------------------------------------------------------------------------
    if (
      /\b(desfa[cç]a|desfazer|undo|reverta|reverter|voltar\s+atr[aá]s)\b/i.test(q) &&
      !q.includes("chapa")
    ) {
      return ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "undo",
        opType: "undo_last_operation",
        summary: "Desfazer a última alteração aplicada no desenho",
        responseSummary: "Reverte atomicamente o último passo registrado no histórico Undo/Redo do CHAMFER.",
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
    }

    // -------------------------------------------------------------------------
    // 2. OPERAÇÃO DE EXPORTAÇÃO
    // -------------------------------------------------------------------------
    if (/\b(exporte|exportar|baixe|baixar\s+dxf|gerar\s+dxf|salvar\s+svg)\b/i.test(q)) {
      const format = q.includes("svg") ? "svg" : q.includes("pdf") ? "pdf" : "dxf";
      return ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "export",
        opType: "export_drawing",
        params: { format },
        summary: `Exportar desenho técnico em formato ${format.toUpperCase()}`,
        responseSummary: `Prepara a exportação vetorial 1:1 (${format.toUpperCase()}) da geometria ativa.`,
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
    }

    // -------------------------------------------------------------------------
    // 3. OPERAÇÃO DE CONSULTA GEOMÉTRICA (QUERY — Exemplo H §23)
    // -------------------------------------------------------------------------
    if (
      /^(qual|quais|quanto\s+mede|quantos\s+furos|calcule\s+a\s+[aá]rea|me[cç]a|informe)\b/i.test(
        q,
      )
    ) {
      const circles = existingEntities.filter(
        (e): e is Extract<Entity, { type: "circle" }> =>
          e.type === "circle" && e.layer !== "referencia" && !e.isConstruction,
      );
      const sortedCircles = [...circles].sort((a, b) => a.cx - b.cx || a.cy - b.cy);
      const measuredPitch =
        sortedCircles.length >= 2
          ? Number(
              Math.hypot(
                sortedCircles[1]!.cx - sortedCircles[0]!.cx,
                sortedCircles[1]!.cy - sortedCircles[0]!.cy,
              ).toFixed(2),
            )
          : activePart?.holeGroups[0]?.pitch ?? 0;

      const box = bbox(existingEntities.filter((e) => e.layer !== "referencia"));
      const w = box ? Number((box.maxX - box.minX).toFixed(2)) : activePart?.width ?? 0;
      const h = box ? Number((box.maxY - box.minY).toFixed(2)) : activePart?.height ?? 0;
      const holeCount = circles.length;
      const answer = `Dimensões externas: ${w} × ${h} mm | Furos de corte: ${holeCount}${
        holeCount > 0 ? ` (Ø${(circles[0]!.r * 2).toFixed(1)} mm)` : ""
      }${measuredPitch > 0 ? ` | Passo entre centros: ${measuredPitch} mm` : ""} | Total de entidades: ${existingEntities.length}.`;

      const plan = ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "query",
        opType: "query_geometry",
        params: { width: w, height: h, hole_count: holeCount, pitch: measuredPitch },
        summary: "Consulta técnica de dimensões, furação e passo",
        responseSummary: answer,
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
      plan.confirmation_required = false;
      plan.compiled = {
        previewEntities: [],
        finalEntities: existingEntities,
        generatedDimensions: [],
        replacedEntityIds: [],
        deletedEntityIds: [],
        selectedEntityIds: selectedIds,
        queryAnswer: answer,
      };
      return plan;
    }

    // -------------------------------------------------------------------------
    // 3b. ATUALIZAÇÃO DE ESPESSURA DA CHAPA (§20 — "Chapa de 3 mm", "Espessura de 6,35 mm", "Chapa de três oitavos", "Mude a espessura para 10 mm")
    // -------------------------------------------------------------------------
    const isPureThicknessCommand =
      !/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:x|×|por|\*)\s*(\d+(?:[.,]\d+)?)/i.test(q) &&
      (/\b(?:mude|altere|defina|ajust[ea])?\s*(?:a\s+)?espessura\s*(?:da\s+chapa\s*)?(?:para|de|=)?\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?/i.test(
        q,
      ) ||
        /^chapa\s+de\s+(\d+(?:[.,]\d+)?)\s*mm\b/i.test(q.trim()));

    if (isPureThicknessCommand) {
      const thMatch =
        q.match(/espessura\s*(?:da\s+chapa\s*)?(?:para|de|=)?\s*(\d+(?:[.,]\d+)?)/i) ??
        q.match(/^chapa\s+de\s+(\d+(?:[.,]\d+)?)\s*mm\b/i);
      const thicknessMm = thMatch?.[1] ? parseFloat(thMatch[1].replace(",", ".")) : 3;
      const plan = ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "modify",
        opType: "modify_feature",
        params: {
          thickness: thicknessMm,
          width: activePart?.width ?? 500,
          height: activePart?.height ?? 250,
        },
        summary: `Definir espessura CHAPA = ${thicknessMm} mm`,
        responseSummary: `Propriedade CHAPA atualizada para espessura de ${thicknessMm} mm.`,
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
      plan.compiled = {
        previewEntities: existingEntities,
        finalEntities: existingEntities,
        generatedDimensions: [],
        replacedEntityIds: [],
        deletedEntityIds: [],
        selectedEntityIds: selectedIds,
        parametricFeatureSnapshot: activePart ?? undefined,
      };
      return plan;
    }

    // -------------------------------------------------------------------------
    // 3c. APARO PARCIAL DE ENTIDADES (TRIM — §12.3 e Exemplo G §23)
    // -------------------------------------------------------------------------
    if (/^(apar[ea]r?|trim|corte\s+o\s+trecho)\b/i.test(q)) {
      const lines = existingEntities.filter((e) => e.type === "line" || e.type === "polyline");
      const cutters = existingEntities.filter((e) => e.type === "circle" || e.type === "arc" || e.type === "line");

      if (lines.length === 0 || cutters.length < 2) {
        const plan = ChamferIntentInterpreter.buildControlPlan({
          rawPrompt: cleanPrompt,
          turnIndex,
          category: "modify",
          opType: "trim_entity",
          params: {},
          summary: "Esclarecer entidade e fronteira de corte para TRIM parcial",
          responseSummary:
            "Para aparar apenas o trecho pretendido, selecione ou indique a entidade a aparar e a circunferência/linha limite.",
          existingEntitiesCount: existingEntities.length,
          selectedIds,
          originMode,
          activePartId: activePart?.partId,
        });
        plan.unresolved = [
          {
            id: "amb_trim_target",
            parameter: "target_entity",
            reason: "Não há referência inequívoca ao trecho e à fronteira de aparo.",
            question: "Qual trecho e qual entidade limite devem ser usados no aparo (TRIM)?",
            options: [
              {
                id: "opt_trim_top",
                label: "Trecho superior acima da circunferência",
                description: "Apara apenas o segmento que ultrapassa o topo do círculo",
                patch: { trim_region: "top" },
              },
              {
                id: "opt_trim_bottom",
                label: "Trecho inferior abaixo da circunferência",
                description: "Apara apenas o segmento que ultrapassa a base do círculo",
                patch: { trim_region: "bottom" },
              },
            ],
          },
        ];
        plan.validation = {
          status: "needs_clarification",
          issues: [
            {
              code: "AMBIGUOUS_TRIM_TARGET",
              severity: "warning",
              message: "Especifique ou selecione a entidade a aparar e a fronteira de corte.",
            },
          ],
          checkedAt: Date.now(),
        };
        return plan;
      }

      // Quando há linha e circunferência reais no canvas, apara apenas o trecho que ultrapassa a fronteira
      const targetLine = lines[0]!;
      const circleCutter = existingEntities.find(
        (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle",
      );
      let trimmedEntities = [...existingEntities];
      const replacedIds: string[] = [];

      if (targetLine.type === "line" && circleCutter) {
        // Apara o extremo superior (maior Y ou menor Y conforme pedido) até a borda da circunferência
        const topY = circleCutter.cy + circleCutter.r;
        const bottomY = circleCutter.cy - circleCutter.r;
        const modifiedLine: Entity = {
          ...targetLine,
          y1: Math.min(targetLine.y1, topY),
          y2: Math.max(Math.min(targetLine.y2, topY), bottomY),
        };
        replacedIds.push(targetLine.id);
        trimmedEntities = existingEntities.map((e) => (e.id === targetLine.id ? modifiedLine : e));
      }

      const plan = ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "modify",
        opType: "trim_entity",
        params: { trimmed_entity_id: targetLine.id, partial_trim: true },
        summary: `Aparar parcialmente trecho de '${targetLine.id}' na fronteira circular`,
        responseSummary: `Trecho excedente aparado parcialmente em '${targetLine.id}', preservando o restante da entidade e as demais geometrias.`,
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
      plan.compiled = {
        previewEntities: trimmedEntities,
        finalEntities: trimmedEntities,
        generatedDimensions: [],
        replacedEntityIds: replacedIds,
        deletedEntityIds: [],
        selectedEntityIds: [targetLine.id],
      };
      return plan;
    }

    // -------------------------------------------------------------------------
    // 4. OPERAÇÃO DE SELEÇÃO POR CRITÉRIO
    // -------------------------------------------------------------------------
    if (/^(selecione|selecionar|marque\s+todos)\b/i.test(q)) {
      let targetEntities = existingEntities;
      if (q.includes("furo") || q.includes("círculo") || q.includes("circulo")) {
        targetEntities = existingEntities.filter(
          (e) => e.type === "circle" && e.layer !== "referencia",
        );
      } else if (q.includes("dobra")) {
        targetEntities = existingEntities.filter((e) => e.layer === "dobra");
      } else if (q.includes("contorno") || q.includes("chapa")) {
        targetEntities = existingEntities.filter((e) => e.type === "polyline");
      }
      const matchedIds = targetEntities.map((e) => e.id);
      const plan = ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "select",
        opType: "select_entities",
        params: { matched_count: matchedIds.length },
        summary: `Selecionar ${matchedIds.length} entidade(s) correspondente(s)`,
        responseSummary: `${matchedIds.length} entidade(s) selecionada(s) pelo critério semântico.`,
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
      plan.confirmation_required = false;
      plan.compiled = {
        previewEntities: [],
        finalEntities: existingEntities,
        generatedDimensions: [],
        replacedEntityIds: [],
        deletedEntityIds: [],
        selectedEntityIds: matchedIds,
      };
      return plan;
    }

    // -------------------------------------------------------------------------
    // 5. OPERAÇÃO DE REMOÇÃO / EXCLUSÃO (INCLUINDO EXCLUSÃO SELETIVA DE 1 FURO — §2.4 e §12.3)
    // -------------------------------------------------------------------------
    if (/^(remova|remover|apague|apagar|exclua|excluir|delete|deletar)\b/i.test(q)) {
      const circleEntities = existingEntities
        .filter(
          (e): e is Extract<Entity, { type: "circle" }> =>
            e.type === "circle" && e.layer !== "referencia",
        )
        .sort((a, b) => a.cx - b.cx || a.cy - b.cy);

      const wantsSingleSpecificHole =
        /\b(furo\s+do\s+meio|furo\s+central|apenas\s+o\s+furo|somente\s+o\s+furo|primeiro\s+furo|1º\s+furo|segundo\s+furo|2º\s+furo|terceiro\s+furo|3º\s+furo|[úu]ltimo\s+furo)\b/i.test(
          rawPrompt,
        );

      if (wantsSingleSpecificHole && circleEntities.length > 0) {
        let targetIdx = Math.floor(circleEntities.length / 2);
        if (/\b(primeiro|1º)\b/i.test(rawPrompt)) targetIdx = 0;
        else if (/\b(segundo|2º)\b/i.test(rawPrompt)) targetIdx = Math.min(1, circleEntities.length - 1);
        else if (/\b(terceiro|3º)\b/i.test(rawPrompt)) targetIdx = Math.min(2, circleEntities.length - 1);
        else if (/\b([úu]ltimo)\b/i.test(rawPrompt)) targetIdx = circleEntities.length - 1;

        const targetHole = circleEntities[targetIdx]!;
        const remaining = existingEntities.filter((e) => e.id !== targetHole.id);
        const remainingHoleCount = circleEntities.length - 1;

        const plan = ChamferIntentInterpreter.buildControlPlan({
          rawPrompt: cleanPrompt,
          turnIndex,
          category: "delete",
          opType: "delete_entities",
          params: {
            deleted_count: 1,
            deleted_hole_id: targetHole.id,
            hole_count: remainingHoleCount,
          },
          summary: `Remover apenas o furo selecionado (${targetHole.id} em X=${targetHole.cx.toFixed(1)}, Y=${targetHole.cy.toFixed(1)} mm)`,
          responseSummary: `Remove exclusivamente o furo referenciado (${targetHole.id}), preservando os outros ${remainingHoleCount} furo(s) e o contorno da peça.`,
          existingEntitiesCount: existingEntities.length,
          selectedIds,
          originMode,
          activePartId: activePart?.partId,
        });
        plan.compiled = {
          previewEntities: remaining,
          finalEntities: remaining,
          generatedDimensions: [],
          replacedEntityIds: [],
          deletedEntityIds: [targetHole.id],
          selectedEntityIds: [],
          parametricFeatureSnapshot: activePart
            ? {
                ...activePart,
                holeGroups: activePart.holeGroups.map((g, idx) =>
                  idx === 0
                    ? {
                        ...g,
                        count: remainingHoleCount,
                        entityIds: g.entityIds.filter((id) => id !== targetHole.id),
                      }
                    : g,
                ),
                allEntityIds: activePart.allEntityIds.filter((id) => id !== targetHole.id),
                lastUpdatedTurn: turnIndex,
              }
            : undefined,
        };
        return plan;
      }

      if ((q.includes("furo") || q.includes("furação")) && activePart && activePart.kind === "plate") {
        return ChamferIntentInterpreter.compileMultiTurnPlateModification(
          cleanPrompt,
          q,
          activePart,
          existingEntities,
          selectedIds,
          activeLayer,
          turnIndex,
          { hole_count: 0, hole_distribution: "none", ...overrides },
        );
      }
      const toDeleteIds =
        q.includes("furo") || q.includes("círculo")
          ? circleEntities.map((e) => e.id)
          : selectedIds.length > 0
            ? selectedIds
            : existingEntities.map((e) => e.id);

      const remaining = existingEntities.filter((e) => !toDeleteIds.includes(e.id));
      const plan = ChamferIntentInterpreter.buildControlPlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        category: "delete",
        opType: "delete_entities",
        params: { deleted_count: toDeleteIds.length },
        summary: `Remover ${toDeleteIds.length} entidade(s) do desenho`,
        responseSummary: `Remove ${toDeleteIds.length} entidade(s) com registro de reversão (Undo).`,
        existingEntitiesCount: existingEntities.length,
        selectedIds,
        originMode,
        activePartId: activePart?.partId,
      });
      plan.compiled = {
        previewEntities: remaining,
        finalEntities: remaining,
        generatedDimensions: [],
        replacedEntityIds: [],
        deletedEntityIds: toDeleteIds,
        selectedEntityIds: [],
      };
      return plan;
    }

    // -------------------------------------------------------------------------
    // 6. TRANSFORMAÇÕES GEOMÉTRICAS (ESPELHAR, MOVER, ROTACIONAR, ESCALAR, DUPLICAR)
    // -------------------------------------------------------------------------
    if (/\b(espelh[ea]r?|mirror|simetria)\b/i.test(q)) {
      const axis: "x" | "y" =
        q.includes("horizontal") || q.includes("eixo x") ? "y" : "x"; // espelhar em relação ao eixo vertical = inverter X (axis="x")
      const keepCopy = q.includes("cópia") || q.includes("copia") || q.includes("duplic");
      const targetPool =
        selectedIds.length > 0
          ? existingEntities.filter((e) => selectedIds.includes(e.id))
          : activePart
            ? existingEntities.filter((e) => activePart.allEntityIds.includes(e.id))
            : existingEntities;

      const fallbackPool = targetPool.length > 0 ? targetPool : existingEntities;
      const box = bbox(fallbackPool);
      const pivot: Vec2 = box
        ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
        : { x: (activePart?.width ?? 200) / 2, y: (activePart?.height ?? 100) / 2 };

      const mirrored = fallbackPool.map((e) => {
        const m = mirror(e, pivot, axis);
        return keepCopy ? { ...m, id: uid() } : m;
      });

      const targetIdSet = new Set(fallbackPool.map((e) => e.id));
      const finalEntities = keepCopy
        ? [...existingEntities, ...mirrored]
        : existingEntities.map((e) => (targetIdSet.has(e.id) ? mirrored.find((m) => m.id === e.id) ?? e : e));

      // Atualiza estado paramétrico caso haja inversão de cantos na peça ativa
      let nextFeature: ParametricFeatureState | undefined = activePart ? { ...activePart } : undefined;
      if (nextFeature && axis === "x") {
        nextFeature = {
          ...nextFeature,
          cornerRadii: {
            top_left: nextFeature.cornerRadii.top_right,
            top_right: nextFeature.cornerRadii.top_left,
            bottom_left: nextFeature.cornerRadii.bottom_right,
            bottom_right: nextFeature.cornerRadii.bottom_left,
          },
          cornerSelector:
            nextFeature.cornerSelector === "left_two"
              ? "right_two"
              : nextFeature.cornerSelector === "right_two"
                ? "left_two"
                : nextFeature.cornerSelector,
          lastUpdatedTurn: turnIndex,
        };
      }

      const axisLabel = axis === "x" ? "eixo vertical" : "eixo horizontal";
      return {
        plan_id: `plan_mirror_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
          active_part_id: activePart?.partId,
        },
        intent: {
          summary: `Espelhar conjunto em relação ao ${axisLabel}`,
          category: "modify",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_mirror_${uid()}`,
            type: "transform_mirror",
            params: { mirror_axis: axis === "x" ? "vertical" : "horizontal", pivot, keep_original: keepCopy },
            description: `Espelhamento geométrico exato em relação ao ${axisLabel} passando por (${pivot.x.toFixed(1)}, ${pivot.y.toFixed(1)}) mm.`,
          },
        ],
        parameters: { mirror_axis: axis === "x" ? "vertical" : "horizontal", keep_original: keepCopy },
        typed_parameters: {},
        parameter_provenance: { mirror_axis: "explicit" },
        constraints: [{ id: `c_sym_${uid()}`, type: "symmetric", targetIds: Array.from(targetIdSet) }],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Conjunto espelhado em relação ao ${axisLabel} (${mirrored.length} entidade(s) processada(s)).`,
        compiled: {
          previewEntities: mirrored,
          finalEntities,
          generatedDimensions: [],
          replacedEntityIds: keepCopy ? [] : Array.from(targetIdSet),
          deletedEntityIds: [],
          selectedEntityIds: mirrored.map((e) => e.id),
          parametricFeatureSnapshot: nextFeature,
        },
      };
    }

    if (/\b(rotacion[ea]r?|gir[ea]r?|rote)\b/i.test(q) && !q.includes("chapa")) {
      const angMatch = q.match(/(-?\d+(?:[.,]\d+)?)\s*(?:graus?|°|deg)?/i);
      const angleDeg = angMatch && angMatch[1] ? parseFloat(angMatch[1].replace(",", ".")) : 90;
      const targetPool =
        selectedIds.length > 0
          ? existingEntities.filter((e) => selectedIds.includes(e.id))
          : existingEntities;
      const box = bbox(targetPool);
      const pivot: Vec2 = box
        ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
        : { x: 0, y: 0 };
      const rotated = targetPool.map((e) => rotate(e, pivot, angleDeg));
      const targetIdSet = new Set(targetPool.map((e) => e.id));
      const finalEntities = existingEntities.map((e) =>
        targetIdSet.has(e.id) ? rotated.find((r) => r.id === e.id) ?? e : e,
      );

      return {
        plan_id: `plan_rotate_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
          active_part_id: activePart?.partId,
        },
        intent: {
          summary: `Rotacionar geometria em ${angleDeg}°`,
          category: "modify",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_rotate_${uid()}`,
            type: "transform_rotate",
            params: { angle_deg: angleDeg, pivot },
            description: `Rotação de ${angleDeg}° em torno de (${pivot.x.toFixed(1)}, ${pivot.y.toFixed(1)}) mm.`,
          },
        ],
        parameters: { angle_deg: angleDeg },
        typed_parameters: {},
        parameter_provenance: { angle_deg: "explicit" },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Geometria rotacionada em ${angleDeg}°.`,
        compiled: {
          previewEntities: rotated,
          finalEntities,
          generatedDimensions: [],
          replacedEntityIds: Array.from(targetIdSet),
          deletedEntityIds: [],
          selectedEntityIds: rotated.map((e) => e.id),
        },
      };
    }

    if (/\b(mov[ea]r?|desloc[ea]r?|translad[ea]r?)\b/i.test(q) && !q.includes("chapa")) {
      const nums = Array.from(q.matchAll(/(-?\d+(?:[.,]\d+)?)/g)).map((m) =>
        parseFloat(m[1]!.replace(",", ".")),
      );
      const dx = nums[0] ?? 50;
      const dy = nums[1] ?? 0;
      const targetPool =
        selectedIds.length > 0
          ? existingEntities.filter((e) => selectedIds.includes(e.id))
          : existingEntities;
      const moved = targetPool.map((e) => translate(e, dx, dy));
      const targetIdSet = new Set(targetPool.map((e) => e.id));
      const finalEntities = existingEntities.map((e) =>
        targetIdSet.has(e.id) ? moved.find((m) => m.id === e.id) ?? e : e,
      );

      return {
        plan_id: `plan_move_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
        },
        intent: {
          summary: `Mover geometria por ΔX=${dx} mm, ΔY=${dy} mm`,
          category: "modify",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_move_${uid()}`,
            type: "transform_move",
            params: { dx, dy },
            description: `Deslocamento linear de (${dx}, ${dy}) mm.`,
          },
        ],
        parameters: { dx, dy },
        typed_parameters: {},
        parameter_provenance: { dx: "explicit", dy: nums.length > 1 ? "explicit" : "default" },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Entidades deslocadas por ΔX=${dx} mm e ΔY=${dy} mm.`,
        compiled: {
          previewEntities: moved,
          finalEntities,
          generatedDimensions: [],
          replacedEntityIds: Array.from(targetIdSet),
          deletedEntityIds: [],
          selectedEntityIds: moved.map((e) => e.id),
        },
      };
    }

    if (/\b(escal[ea]r?)\b/i.test(q) && !q.includes("chapa")) {
      const numMatch = q.match(/(\d+(?:[.,]\d+)?)/);
      const factor = numMatch && numMatch[1] ? parseFloat(numMatch[1].replace(",", ".")) : 2;
      const targetPool =
        selectedIds.length > 0
          ? existingEntities.filter((e) => selectedIds.includes(e.id))
          : existingEntities;
      const box = bbox(targetPool);
      const pivot: Vec2 = box
        ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
        : { x: 0, y: 0 };
      const scaled = targetPool.map((e) => scaleEntity(e, pivot, factor));
      const targetIdSet = new Set(targetPool.map((e) => e.id));
      const finalEntities = existingEntities.map((e) =>
        targetIdSet.has(e.id) ? scaled.find((s) => s.id === e.id) ?? e : e,
      );

      return {
        plan_id: `plan_scale_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
        },
        intent: {
          summary: `Escalar geometria pelo fator ${factor}x`,
          category: "modify",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_scale_${uid()}`,
            type: "transform_scale",
            params: { scale_factor: factor },
            description: `Escala proporcional ${factor}x.`,
          },
        ],
        parameters: { scale_factor: factor },
        typed_parameters: {},
        parameter_provenance: { scale_factor: "explicit" },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Geometria escalada pelo fator ${factor}x.`,
        compiled: {
          previewEntities: scaled,
          finalEntities,
          generatedDimensions: [],
          replacedEntityIds: Array.from(targetIdSet),
          deletedEntityIds: [],
          selectedEntityIds: scaled.map((e) => e.id),
        },
      };
    }

    // -------------------------------------------------------------------------
    // 7. EDIÇÃO CONVERSACIONAL MULTI-TURNO SOBRE A PEÇA ATIVA (SEÇÃO 10)
    // -------------------------------------------------------------------------
    const isFollowUpModification =
      activePart &&
      activePart.kind === "plate" &&
      !(/\b(crie|criar|fa[cç]a|fazer|gere|gerar|nova\s+chapa|novo\s+flange)\b/i.test(q) &&
        /\d+\s*(?:x|×|por|\*)\s*\d+/i.test(q)) &&
      (/\b(agora|aumente|diminua|altere|mude|adicione|acrescente|arredonde|chanfre|esses\s+furos|mesmo\s+espa[cç]amento|somente\s+os|cantos\s+esquerdos|cantos\s+direitos|largura|altura)\b/i.test(
        q,
      ) ||
        Object.keys(overrides).length > 0);

    if (isFollowUpModification && activePart) {
      return ChamferIntentInterpreter.compileMultiTurnPlateModification(
        cleanPrompt,
        q,
        activePart,
        existingEntities,
        selectedIds,
        activeLayer,
        turnIndex,
        overrides,
      );
    }

    // -------------------------------------------------------------------------
    // 8. PEÇAS DE CALDEIRARIA E TRANSIÇÕES DESENVOLVÍVEIS (SEÇÃO 4.4)
    // -------------------------------------------------------------------------
    if (
      q.includes("transição") ||
      q.includes("transicao") ||
      (q.includes("quadrado") && q.includes("redondo"))
    ) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const sqW = (overrides.square_width as number) ?? nums[0] ?? 400;
      const roundD = (overrides.round_diameter as number) ?? nums[1] ?? 250;
      const h = (overrides.height as number) ?? nums[2] ?? 300;

      const compiled = ChamferGeometricExecutionEngine.compileSquareToRound({
        squareWidth: sqW,
        roundDiameter: roundD,
        height: h,
      });

      return {
        plan_id: `plan_sq2rd_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
        },
        intent: {
          summary: `Planificação de Transição Quadrado (${sqW} mm) → Redondo (Ø${roundD} mm), H=${h} mm`,
          category: "create",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_sq2rd_${uid()}`,
            type: "create_boilermaking_square_to_round",
            params: { square_width: sqW, round_diameter: roundD, height: h },
            layer: "corte",
            description: `Desenvolvimento planificado por triangulação com base ${sqW}×${sqW} mm, topo Ø${roundD} mm e altura ${h} mm.`,
          },
        ],
        parameters: { square_width: sqW, round_diameter: roundD, height: h },
        typed_parameters: {},
        parameter_provenance: {
          square_width: nums[0] ? "explicit" : "default",
          round_diameter: nums[1] ? "explicit" : "default",
          height: nums[2] ? "explicit" : "default",
        },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Planificação de transição quadrado-redondo (${sqW} mm → Ø${roundD} mm × H${h} mm) gerada com linhas de corte e geratrizes de dobra.`,
        compiled: {
          previewEntities: compiled.entities,
          finalEntities: [...existingEntities, ...compiled.entities],
          generatedDimensions: compiled.dimensions,
          replacedEntityIds: [],
          deletedEntityIds: [],
          selectedEntityIds: compiled.entities.map((e) => e.id),
          suggestedViewport: compiled.viewport,
        },
      };
    }

    if (
      q.includes("cone") ||
      (q.includes("redução") && q.includes("cônica")) ||
      (q.includes("desenvolvimento") && q.includes("truncado"))
    ) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const D = (overrides.base_diameter as number) ?? nums[0] ?? 500;
      const d = (overrides.top_diameter as number) ?? nums[1] ?? 250;
      const H = (overrides.height as number) ?? nums[2] ?? 350;

      const compiled = ChamferGeometricExecutionEngine.compileTruncatedCone({
        baseDiameter: D,
        topDiameter: d,
        height: H,
      });

      return {
        plan_id: `plan_cone_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
        },
        intent: {
          summary: `Planificação de Tronco de Cone Ø${D} → Ø${d} mm, H=${H} mm`,
          category: "create",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_cone_${uid()}`,
            type: "create_boilermaking_truncated_cone",
            params: { base_diameter: D, top_diameter: d, height: H },
            layer: "corte",
            description: `Desenvolvimento radial de tronco de cone com geratrizes de calandragem.`,
          },
        ],
        parameters: { base_diameter: D, top_diameter: d, height: H },
        typed_parameters: {},
        parameter_provenance: {
          base_diameter: nums[0] ? "explicit" : "default",
          top_diameter: nums[1] ? "explicit" : "default",
          height: nums[2] ? "explicit" : "default",
        },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Planificação de tronco de cone (Ø${D} → Ø${d} mm, H=${H} mm) calculada com arcos e geratrizes de dobra.`,
        compiled: {
          previewEntities: compiled.entities,
          finalEntities: [...existingEntities, ...compiled.entities],
          generatedDimensions: compiled.dimensions,
          replacedEntityIds: [],
          deletedEntityIds: [],
          selectedEntityIds: compiled.entities.map((e) => e.id),
          suggestedViewport: compiled.viewport,
        },
      };
    }

    if (q.includes("curva de gomos") || (q.includes("curva") && q.includes("gomos"))) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const diam = (overrides.diameter as number) ?? nums[0] ?? 300;
      const radius = (overrides.bend_radius as number) ?? nums[1] ?? 450;
      const angle = (overrides.angle_deg as number) ?? nums[2] ?? 90;
      const segs = (overrides.segments as number) ?? nums[3] ?? 4;

      const compiled = ChamferGeometricExecutionEngine.compileSegmentedElbow({
        diameter: diam,
        bendRadius: radius,
        angleDeg: angle,
        segments: segs,
      });

      return {
        plan_id: `plan_elbow_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
        },
        intent: {
          summary: `Planificação de Curva de Gomos Ø${diam} mm, R=${radius} mm, ${angle}° (${segs} gomos)`,
          category: "create",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_elbow_${uid()}`,
            type: "create_boilermaking_segmented_elbow",
            params: { diameter: diam, bend_radius: radius, angle_deg: angle, segments: segs },
            layer: "corte",
            description: `Desenvolvimento de gomo cilíndrico com ordenada senoidal.`,
          },
        ],
        parameters: { diameter: diam, bend_radius: radius, angle_deg: angle, segments: segs },
        typed_parameters: {},
        parameter_provenance: { diameter: nums[0] ? "explicit" : "default" },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Planificação de curva de gomos Ø${diam} mm gerada com sucesso.`,
        compiled: {
          previewEntities: compiled.entities,
          finalEntities: [...existingEntities, ...compiled.entities],
          generatedDimensions: compiled.dimensions,
          replacedEntityIds: [],
          deletedEntityIds: [],
          selectedEntityIds: compiled.entities.map((e) => e.id),
          suggestedViewport: compiled.viewport,
        },
      };
    }

    if (q.includes("boca de lobo") || (q.includes("derivação") && q.includes("tubo"))) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const mainD = (overrides.main_diameter as number) ?? nums[0] ?? 400;
      const branchD = (overrides.branch_diameter as number) ?? nums[1] ?? 250;

      const compiled = ChamferGeometricExecutionEngine.compileCylindricalBranch({
        mainDiameter: mainD,
        branchDiameter: branchD,
      });

      return {
        plan_id: `plan_branch_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
        },
        intent: {
          summary: `Planificação de Boca de Lobo: Coletor Ø${mainD} mm × Ramal Ø${branchD} mm`,
          category: "create",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_branch_${uid()}`,
            type: "create_boilermaking_cylindrical_branch",
            params: { main_diameter: mainD, branch_diameter: branchD },
            layer: "corte",
            description: `Desenvolvimento da curva de interseção cilindro-cilindro.`,
          },
        ],
        parameters: { main_diameter: mainD, branch_diameter: branchD },
        typed_parameters: {},
        parameter_provenance: {
          main_diameter: nums[0] ? "explicit" : "default",
          branch_diameter: nums[1] ? "explicit" : "default",
        },
        constraints: [],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Planificação de boca de lobo (Ø${mainD} × Ø${branchD} mm) gerada.`,
        compiled: {
          previewEntities: compiled.entities,
          finalEntities: [...existingEntities, ...compiled.entities],
          generatedDimensions: compiled.dimensions,
          replacedEntityIds: [],
          deletedEntityIds: [],
          selectedEntityIds: compiled.entities.map((e) => e.id),
          suggestedViewport: compiled.viewport,
        },
      };
    }

    // -------------------------------------------------------------------------
    // 9. FLANGE CIRCULAR COM PCD E FUROS POLARES (SEÇÃO 4.4)
    // -------------------------------------------------------------------------
    if (q.includes("flange") || (q.includes("disco") && q.includes("pcd"))) {
      return ChamferIntentInterpreter.compileFlangeIntent(
        cleanPrompt,
        q,
        existingEntities,
        selectedIds,
        activeLayer,
        originMode,
        turnIndex,
        overrides,
      );
    }

    // -------------------------------------------------------------------------
    // 10. SUPORTE MECÂNICO COM RASGO OBLONGO (SLOT)
    // -------------------------------------------------------------------------
    if (q.includes("suporte") || (q.includes("chapa") && (q.includes("rasgo") || q.includes("oblongo") || q.includes("slot")))) {
      const dimMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:x|×|por|\*)\s*(\d+(?:[.,]\d+)?)/i);
      const width = (overrides.width as number) ?? (dimMatch?.[1] ? parseFloat(dimMatch[1].replace(",", ".")) : 280);
      const height = (overrides.height as number) ?? (dimMatch?.[2] ? parseFloat(dimMatch[2].replace(",", ".")) : 140);
      const slotLength = (overrides.slot_length as number) ?? 100;
      const slotWidth = (overrides.slot_width as number) ?? 24;
      const holeDiam = (overrides.hole_diameter as number) ?? 16;

      const compiled = ChamferGeometricExecutionEngine.compileSlottedBracket({
        width,
        height,
        slotLength,
        slotWidth,
        holeDiameter: holeDiam,
        layer: activeLayer,
        turnIndex,
      });

      return {
        plan_id: `plan_bracket_${turnIndex}_${uid()}`,
        schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
        document_context: {
          units: "mm",
          origin_mode: originMode,
          active_selection_ids: selectedIds,
          existing_entities_count: existingEntities.length,
          active_part_id: compiled.featureState.partId,
        },
        intent: {
          summary: `Suporte Paramétrico ${width}×${height} mm com Rasgo Oblongo ${slotLength}×${slotWidth} mm e Furos Ø${holeDiam} mm`,
          category: "create",
          raw_prompt: cleanPrompt,
          turn_index: turnIndex,
        },
        operations: [
          {
            id: `op_bracket_${uid()}`,
            type: "create_slotted_bracket",
            params: { width, height, slot_length: slotLength, slot_width: slotWidth, hole_diameter: holeDiam },
            layer: activeLayer,
            description: `Criação de suporte simétrico com rasgo oblongo central e 2 furos laterais.`,
          },
        ],
        parameters: { width, height, slot_length: slotLength, slot_width: slotWidth, hole_diameter: holeDiam },
        typed_parameters: {},
        parameter_provenance: {
          width: dimMatch ? "explicit" : "default",
          height: dimMatch ? "explicit" : "default",
        },
        constraints: [{ id: `c_sym_${uid()}`, type: "symmetric", targetIds: compiled.entities.map((e) => e.id) }],
        dependencies: [],
        unresolved: [],
        warnings: [],
        validation: { status: "valid", issues: [], checkedAt: Date.now() },
        confirmation_required: true,
        response_summary: `Suporte ${width}×${height} mm com rasgo oblongo central (${slotLength}×${slotWidth} mm) e 2 furos laterais Ø${holeDiam} mm pronto para inserção.`,
        compiled: {
          previewEntities: compiled.entities,
          finalEntities: [...existingEntities, ...compiled.entities],
          generatedDimensions: compiled.dimensions,
          replacedEntityIds: [],
          deletedEntityIds: [],
          selectedEntityIds: compiled.entities.map((e) => e.id),
          suggestedViewport: { x: 0, y: 0, width, height },
          parametricFeatureSnapshot: compiled.featureState,
        },
      };
    }

    // -------------------------------------------------------------------------
    // 11. CHAPA / RETÂNGULO PARAMÉTRICO COM CANTOS E FURAÇÃO (SEÇÕES 6, 8, 9, 10)
    // -------------------------------------------------------------------------
    if (
      q.includes("chapa") ||
      q.includes("retângulo") ||
      q.includes("retangulo") ||
      q.includes("placa") ||
      /\d+\s*(?:mm)?\s*(?:x|×|por|\*)\s*\d+/i.test(q)
    ) {
      return ChamferIntentInterpreter.compilePlateIntent(
        cleanPrompt,
        q,
        existingEntities,
        selectedIds,
        activeLayer,
        originMode,
        turnIndex,
        overrides,
      );
    }

    // -------------------------------------------------------------------------
    // 12. FORMAS BASE ISOLADAS (CÍRCULO, ANEL, POLÍGONO, OBLONGO, LINHA)
    // -------------------------------------------------------------------------
    if (q.includes("anel") || q.includes("coroa")) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const dExt = (overrides.outer_diameter as number) ?? nums[0] ?? 200;
      const dInt = (overrides.inner_diameter as number) ?? nums[1] ?? 100;
      const eExt: Entity = { id: uid(), layer: activeLayer, type: "circle", cx: 0, cy: 0, r: dExt / 2 };
      const eInt: Entity = { id: uid(), layer: activeLayer, type: "circle", cx: 0, cy: 0, r: dInt / 2 };
      return ChamferIntentInterpreter.wrapSimpleCreatePlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        opType: "create_ring",
        summary: `Anel Concêntrico Øext=${dExt} mm × Øint=${dInt} mm`,
        params: { outer_diameter: dExt, inner_diameter: dInt },
        entities: [eExt, eInt],
        existingEntities,
        selectedIds,
        originMode,
        viewport: { x: -dExt / 2, y: -dExt / 2, width: dExt, height: dExt },
      });
    }

    if (q.includes("hexágono") || q.includes("hexagono") || q.includes("octógono") || q.includes("polígono") || q.includes("poligono")) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const sides = q.includes("hex") ? 6 : q.includes("oct") ? 8 : q.includes("pent") ? 5 : (nums[0] ?? 6);
      const radius = (overrides.radius as number) ?? (q.includes("hex") || q.includes("oct") ? nums[0] ?? 80 : nums[1] ?? 80);
      const poly = ChamferGeometricExecutionEngine.compileRegularPolygon({
        sides,
        radius,
        layer: activeLayer,
      });
      return ChamferIntentInterpreter.wrapSimpleCreatePlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        opType: "create_regular_polygon",
        summary: `Polígono Regular de ${sides} lados (R=${radius} mm)`,
        params: { sides, radius },
        entities: [poly],
        existingEntities,
        selectedIds,
        originMode,
        viewport: { x: -radius, y: -radius, width: radius * 2, height: radius * 2 },
      });
    }

    if (q.includes("rasgo") || q.includes("oblongo") || q.includes("slot")) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const len = (overrides.slot_length as number) ?? nums[0] ?? 100;
      const wid = (overrides.slot_width as number) ?? nums[1] ?? 24;
      const ang = (overrides.angle_deg as number) ?? nums[2] ?? 0;
      const slot = createSlotPolyline({ x: 0, y: 0 }, len, wid, ang, activeLayer);
      return ChamferIntentInterpreter.wrapSimpleCreatePlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        opType: "create_oblong_slot",
        summary: `Rasgo Oblongo ${len} × ${wid} mm`,
        params: { slot_length: len, slot_width: wid, angle_deg: ang },
        entities: [slot],
        existingEntities,
        selectedIds,
        originMode,
        viewport: { x: -len / 2 - wid, y: -wid, width: len + wid * 2, height: wid * 2 },
      });
    }

    if (q.includes("círculo") || q.includes("circulo") || q.includes("disco") || q.startsWith("furo")) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const isRadius = q.includes("raio") && !q.includes("diâmetro") && !q.includes("diametro");
      const rawVal = nums[0] ?? 100;
      const diameter = (overrides.diameter as number) ?? (isRadius ? rawVal * 2 : rawVal);
      const circleEnt: Entity = {
        id: uid(),
        layer: activeLayer,
        type: "circle",
        cx: 0,
        cy: 0,
        r: diameter / 2,
      };
      return ChamferIntentInterpreter.wrapSimpleCreatePlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        opType: "create_circle",
        summary: `Círculo Técnico Ø${diameter} mm (R=${diameter / 2} mm)`,
        params: { diameter, radius: diameter / 2 },
        entities: [circleEnt],
        existingEntities,
        selectedIds,
        originMode,
        viewport: { x: -diameter / 2, y: -diameter / 2, width: diameter, height: diameter },
      });
    }

    if (q.includes("linha") || q.includes("reta") || q.includes("segmento")) {
      const nums = ChamferIntentInterpreter.extractNumbers(q);
      const length = (overrides.length as number) ?? nums[0] ?? 200;
      const angleDeg = (overrides.angle_deg as number) ?? nums[1] ?? 0;
      const rad = (angleDeg * Math.PI) / 180;
      const lineEnt: Entity = {
        id: uid(),
        layer: activeLayer,
        type: "line",
        x1: 0,
        y1: 0,
        x2: Number((length * Math.cos(rad)).toFixed(4)),
        y2: Number((length * Math.sin(rad)).toFixed(4)),
      };
      return ChamferIntentInterpreter.wrapSimpleCreatePlan({
        rawPrompt: cleanPrompt,
        turnIndex,
        opType: "create_line",
        summary: `Linha Técnica L=${length} mm ∠${angleDeg}°`,
        params: { length, angle_deg: angleDeg },
        entities: [lineEnt],
        existingEntities,
        selectedIds,
        originMode,
        viewport: { x: 0, y: 0, width: Math.max(50, length), height: Math.max(50, length) },
      });
    }

    // -------------------------------------------------------------------------
    // 13. FALLBACK DE INTENÇÃO AMBÍGUA / INCOMPLETA
    // -------------------------------------------------------------------------
    return {
      plan_id: `plan_unresolved_${turnIndex}_${uid()}`,
      schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
      document_context: {
        units: "mm",
        origin_mode: originMode,
        active_selection_ids: selectedIds,
        existing_entities_count: existingEntities.length,
      },
      intent: {
        summary: "Comando requer especificação geométrica complementar",
        category: "create",
        raw_prompt: cleanPrompt,
        turn_index: turnIndex,
      },
      operations: [],
      parameters: {},
      typed_parameters: {},
      parameter_provenance: {},
      constraints: [],
      dependencies: [],
      unresolved: [
        {
          id: "amb_command_type",
          parameter: "operation",
          reason: "O comando informado não especificou a família geométrica ou dimensões básicas.",
          question: "Qual peça ou geometria você deseja construir no CHAMFER?",
          options: [
            {
              id: "opt_plate_400_250",
              label: "Chapa 400 × 250 mm com 4 furos Ø12",
              description: "Chapa retangular com furos nos cantos a 25 mm das bordas",
              patch: { preset_prompt: "Chapa de 400 por 250 mm com 4 furos de 12 mm nos cantos a 25 mm das bordas" },
            },
            {
              id: "opt_flange_pcd",
              label: "Flange Ø400 mm com PCD 320 e 8 furos",
              description: "Flange circular com furo central Ø200 mm e padrão polar",
              patch: { preset_prompt: "Flange externo 400 interno 200 com PCD 320 e 8 furos de 18 mm" },
            },
            {
              id: "opt_bracket",
              label: "Suporte 280 × 140 mm com rasgo oblongo",
              description: "Suporte mecânico com rasgo central e furos laterais",
              patch: { preset_prompt: "Suporte 280 por 140 mm com rasgo oblongo" },
            },
          ],
        },
      ],
      warnings: ["Especifique o tipo de peça e suas medidas principais em mm, cm ou m."],
      validation: {
        status: "needs_clarification",
        issues: [
          {
            code: "MISSING_GEOMETRIC_TARGET",
            severity: "info",
            message: "Descreva a peça e medidas (ex.: 'Chapa 400x250 mm com raio 20 e 4 furos Ø12 a 25 mm das bordas').",
          },
        ],
        checkedAt: Date.now(),
      },
      confirmation_required: true,
      response_summary: "Informe o tipo de peça e as dimensões desejadas ou selecione uma opção abaixo.",
    };
  }

  /**
   * Compila a criação ou configuração de uma Chapa Paramétrica (Seções 6.2, 8 e 9).
   */
  private static compilePlateIntent(
    rawPrompt: string,
    q: string,
    existingEntities: Entity[],
    selectedIds: string[],
    activeLayer: LayerId,
    originMode: ChamferIntentPlan["document_context"]["origin_mode"],
    turnIndex: number,
    overrides: Record<string, unknown>,
  ): ChamferIntentPlan {
    const provenance: Record<string, ParameterProvenance> = {};
    const typedParams: Record<string, TypedParameter> = {};

    // 1. Extração de Largura (W) e Altura (H)
    const dimMatch = q.match(
      /(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:x|×|por|\*)\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?/i,
    );
    const widthMatch = q.match(/largura\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
    const heightMatch = q.match(/altura\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);

    const rawW =
      (overrides.width as number | undefined) ??
      (dimMatch?.[1] ? parseFloat(dimMatch[1].replace(",", ".")) : undefined) ??
      (widthMatch?.[1] ? parseFloat(widthMatch[1].replace(",", ".")) : undefined);
    const rawH =
      (overrides.height as number | undefined) ??
      (dimMatch?.[2] ? parseFloat(dimMatch[2].replace(",", ".")) : undefined) ??
      (heightMatch?.[1] ? parseFloat(heightMatch[1].replace(",", ".")) : undefined);

    const width = rawW ?? 400;
    const height = rawH ?? 250;
    provenance.width = rawW !== undefined ? "explicit" : "default";
    provenance.height = rawH !== undefined ? "explicit" : "default";

    typedParams.width = { key: "width", label: "Largura (W)", value: width, unit: "mm", normalizedMm: width, provenance: provenance.width };
    typedParams.height = { key: "height", label: "Altura (H)", value: height, unit: "mm", normalizedMm: height, provenance: provenance.height };

    // 2. Extração de Raio de Canto (Fillet) ou Chanfro e Seletor de Cantos
    const radiusMatch = q.match(/\b(?:raio\s*(?:de\s*)?|r\s*)(\d+(?:[.,]\d+)?)/i);
    const chamferMatch = q.match(/\bchanfr[oa]\w*\s*(?:de\s*|em\s*)?(\d+(?:[.,]\d+)?)/i);

    const cornerRadius =
      (overrides.corner_radius as number | undefined) ??
      (radiusMatch?.[1] ? parseFloat(radiusMatch[1].replace(",", ".")) : 0);
    const cornerChamfer =
      (overrides.corner_chamfer as number | undefined) ??
      (chamferMatch?.[1] ? parseFloat(chamferMatch[1].replace(",", ".")) : 0);

    const parsedCornerSel = parseCornerSelector(q);
    const cornerSelector: CornerSelector =
      (overrides.corner_selector as CornerSelector | undefined) ??
      parsedCornerSel ??
      (cornerRadius > 0 || cornerChamfer > 0 ? "all" : "none");

    provenance.corner_radius =
      overrides.corner_radius !== undefined || radiusMatch ? "explicit" : "default";

    typedParams.corner_radius = {
      key: "corner_radius",
      label: "Raio nos Cantos (R)",
      value: cornerRadius,
      unit: "mm",
      normalizedMm: cornerRadius,
      provenance: provenance.corner_radius,
    };

    const cornerRadii = ChamferGeometricExecutionEngine.resolveCornerRadii(
      cornerRadius,
      cornerSelector,
    );

    // 3. Extração de Furação (Quantidade, Diâmetro, Margem, PCD, Padrão de Distribuição)
    const holeCountMatch = q.match(/(\d+)\s*furos?/i);
    const holeDiamMatch =
      q.match(/furos?[^.]*?(?:de|[\u00d8dDø])\s*(\d+(?:[.,]\d+)?)/i) ??
      q.match(/[\u00d8ø]\s*(\d+(?:[.,]\d+)?)/i);
    const marginMatch =
      q.match(/(?:a|margem\s*(?:de)?|afastad\w*\s*(?:de)?)\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:das?\s*bordas?|da\s*extremidade)/i) ??
      q.match(/margem\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
    const pitchMatch = q.match(/(?:passo|espa[cç]amento)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
    const pcdMatch = q.match(/pcd\s*(?:de\s*|[\u00d8ø]\s*)?(\d+(?:[.,]\d+)?)/i);

    const holeCount =
      (overrides.hole_count as number | undefined) ??
      (holeCountMatch?.[1] ? parseInt(holeCountMatch[1], 10) : q.includes("furo central") ? 1 : 0);

    const holeDiameter =
      (overrides.hole_diameter as number | undefined) ??
      (holeDiamMatch?.[1] ? parseFloat(holeDiamMatch[1].replace(",", ".")) : holeCount > 0 ? 12 : 0);

    const hasExplicitMargin = overrides.margin !== undefined || Boolean(marginMatch);
    const margin =
      (overrides.margin as number | undefined) ??
      (marginMatch?.[1] ? parseFloat(marginMatch[1].replace(",", ".")) : 25);

    const pitch =
      (overrides.pitch as number | undefined) ??
      (pitchMatch?.[1] ? parseFloat(pitchMatch[1].replace(",", ".")) : undefined);

    const pcd =
      (overrides.pcd as number | undefined) ??
      (pcdMatch?.[1] ? parseFloat(pcdMatch[1].replace(",", ".")) : undefined);

    const measurementMode: DistanceMeasurementMode =
      (overrides.measurement_mode as DistanceMeasurementMode | undefined) ??
      parseDistanceMeasurementMode(q);

    // Determinação do padrão de distribuição e detecção de ambiguidade (Seção 8)
    const unresolved: UnresolvedAmbiguity[] = [];
    const warnings: string[] = [];

    let distribution: HoleDistributionMode = "none";
    let linearFormula: LinearHoleFormulaMode = hasExplicitMargin
      ? "margin_plus_equal_pitch"
      : "equal_subdivision_including_borders";

    if (overrides.hole_distribution) {
      distribution = overrides.hole_distribution as HoleDistributionMode;
      if (overrides.linear_formula) {
        linearFormula = overrides.linear_formula as LinearHoleFormulaMode;
      }
    } else if (holeCount > 0) {
      const mentionsCorners =
        q.includes("nos cantos") ||
        q.includes("4 cantos") ||
        q.includes("quatro cantos") ||
        (holeCount === 4 && (q.includes("bordas") || q.includes("borda")));
      const mentionsHorizontalLine =
        q.includes("linha central horizontal") ||
        q.includes("eixo horizontal") ||
        q.includes("alinhados horizontalmente") ||
        q.includes("na horizontal");
      const mentionsVerticalLine =
        q.includes("linha central vertical") ||
        q.includes("eixo vertical") ||
        q.includes("alinhados verticalmente") ||
        q.includes("na vertical");
      const mentionsPcdOrCircle =
        q.includes("pcd") ||
        q.includes("em círculo") ||
        q.includes("em circulo") ||
        q.includes("circular");
      const mentionsCentralAmbiguous =
        (q.includes("furos centrais") ||
          q.includes("divididos igualmente") ||
          q.includes("espaçados igualmente")) &&
        !mentionsHorizontalLine &&
        !mentionsVerticalLine &&
        !mentionsPcdOrCircle &&
        !mentionsCorners;

      if (mentionsCorners && holeCount === 4) {
        distribution = "corner_margins";
      } else if (mentionsHorizontalLine) {
        distribution = "linear_centerline_x";
      } else if (mentionsVerticalLine) {
        distribution = "linear_centerline_y";
      } else if (mentionsPcdOrCircle) {
        distribution = "circular_pcd";
      } else if (holeCount === 1) {
        distribution = hasExplicitMargin ? "single_offset" : "single_center";
      } else if (mentionsCentralAmbiguous) {
        // Caso clássico da Seção 8.2:
        // "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente."
        // Pré-visualiza na linha central horizontal, mas exige esclarecimento explícito!
        distribution = "linear_centerline_x";
        unresolved.push({
          id: "amb_hole_distribution",
          parameter: "hole_distribution",
          reason: `A expressão '${holeCount} furos centrais divididos igualmente' admite múltiplos arranjos geométricos distintos.`,
          question: `Como os ${holeCount} furos Ø${holeDiameter} mm devem ser distribuídos na chapa de ${width}×${height} mm?`,
          options: [
            {
              id: "opt_linear_x_subdiv",
              label: "Linha central horizontal (divisão igual W/(N+1))",
              description: `${holeCount} furos alinhados em Y=${(height / 2).toFixed(1)} mm com passo igual de ${(width / (holeCount + 1)).toFixed(1)} mm`,
              patch: {
                hole_distribution: "linear_centerline_x",
                linear_formula: "equal_subdivision_including_borders",
              },
            },
            {
              id: "opt_linear_x_margin",
              label: `Linha central horizontal (margem ${margin} mm nas bordas)`,
              description: `${holeCount} furos em Y=${(height / 2).toFixed(1)} mm com extremos a ${margin} mm e passo de ${((width - 2 * margin) / Math.max(1, holeCount - 1)).toFixed(1)} mm`,
              patch: {
                hole_distribution: "linear_centerline_x",
                linear_formula: "margin_plus_equal_pitch",
                margin,
              },
            },
            {
              id: "opt_circular_pcd",
              label: "Em círculo concêntrico (PCD)",
              description: `${holeCount} furos distribuídos em um círculo de furação (PCD) centrado na chapa`,
              patch: {
                hole_distribution: "circular_pcd",
              },
            },
            {
              id: "opt_linear_y",
              label: "Linha central vertical",
              description: `${holeCount} furos alinhados no eixo vertical X=${(width / 2).toFixed(1)} mm`,
              patch: {
                hole_distribution: "linear_centerline_y",
                linear_formula: "equal_subdivision_including_borders",
              },
            },
            ...(holeCount === 5
              ? [
                  {
                    id: "opt_grid_4_plus_1",
                    label: "4 furos nos cantos + 1 furo central",
                    description: `4 furos a ${margin} mm das bordas + 1 furo no centro (${width / 2}, ${height / 2}) mm`,
                    patch: {
                      hole_distribution: "grid_4_plus_center",
                      margin,
                    },
                  },
                ]
              : []),
          ],
        });
      } else if (holeCount === 4) {
        distribution = "corner_margins";
      } else {
        distribution = "linear_centerline_x";
      }
    }

    // Se a distribuição escolhida for PCD mas o diâmetro PCD não foi informado, solicita o PCD!
    const effectivePcd = pcd ?? Math.round(Math.min(width, height) * 0.64);
    if (distribution === "circular_pcd" && pcd === undefined && overrides.pcd === undefined) {
      const maxSafePcd = Math.floor(Math.min(width, height) - holeDiameter - 16);
      const s1 = Math.round(maxSafePcd * 0.65);
      const s2 = Math.round(maxSafePcd * 0.8);
      const s3 = Math.round(maxSafePcd * 0.92);

      unresolved.push({
        id: "amb_missing_pcd_diameter",
        parameter: "pcd",
        reason: "Para distribuir os furos em círculo (PCD), é necessário definir o diâmetro do círculo primitivo de furação.",
        question: `Qual é o diâmetro do círculo de furação (PCD) para os ${holeCount} furos Ø${holeDiameter} mm?`,
        requiresNumericInput: {
          paramKey: "pcd",
          label: "Diâmetro PCD (mm)",
          unit: "mm",
          suggestedValues: [s1, s2, s3],
          min: holeDiameter * 2,
          max: maxSafePcd,
        },
        options: [
          {
            id: `opt_pcd_${s1}`,
            label: `PCD Ø${s1} mm`,
            description: `Raio primitivo de ${(s1 / 2).toFixed(1)} mm a partir do centro da chapa`,
            patch: { hole_distribution: "circular_pcd", pcd: s1 },
          },
          {
            id: `opt_pcd_${s2}`,
            label: `PCD Ø${s2} mm`,
            description: `Raio primitivo de ${(s2 / 2).toFixed(1)} mm a partir do centro da chapa`,
            patch: { hole_distribution: "circular_pcd", pcd: s2 },
          },
          {
            id: `opt_pcd_${s3}`,
            label: `PCD Ø${s3} mm`,
            description: `Raio primitivo de ${(s3 / 2).toFixed(1)} mm a partir do centro da chapa`,
            patch: { hole_distribution: "circular_pcd", pcd: s3 },
          },
        ],
      });
    }

    if (holeCount > 0) {
      provenance.hole_count = holeCountMatch || overrides.hole_count !== undefined ? "explicit" : "inferred";
      provenance.hole_diameter = holeDiamMatch || overrides.hole_diameter !== undefined ? "explicit" : "default";
      provenance.margin = hasExplicitMargin ? "explicit" : "default";
      typedParams.hole_count = { key: "hole_count", label: "Qtd. Furos", value: holeCount, unit: "count", provenance: provenance.hole_count };
      typedParams.hole_diameter = { key: "hole_diameter", label: "Diâmetro Furo (Ø)", value: holeDiameter, unit: "mm", normalizedMm: holeDiameter, provenance: provenance.hole_diameter };
      typedParams.margin = { key: "margin", label: "Margem da Borda", value: margin, unit: "mm", normalizedMm: margin, provenance: provenance.margin };
    }

    // 4. Compilação Geométrica Determinística
    const holeGroupSpec: Omit<ParametricHoleGroup, "entityIds"> | undefined =
      holeCount > 0
        ? {
            id: `hg_${uid()}`,
            distribution,
            linearFormula,
            measurementMode,
            count: holeCount,
            diameter: holeDiameter,
            margin,
            pitch,
            pcd: distribution === "circular_pcd" ? effectivePcd : pcd,
            startAngleDeg: 0,
          }
        : undefined;

    const compiled = ChamferGeometricExecutionEngine.compileParametricPlate({
      origin: { x: 0, y: 0 },
      width,
      height,
      cornerRadii,
      cornerChamfer,
      cornerSelector,
      holeGroup: holeGroupSpec,
      includeCenterlines:
        distribution === "linear_centerline_x" ||
        distribution === "linear_centerline_y" ||
        distribution === "circular_pcd" ||
        q.includes("linha de centro"),
      includeDimensions: true,
      layer: activeLayer,
      turnIndex,
    });

    // 5. Validação Matemática e Topológica
    const validation = ChamferValidationEngine.validatePlate(
      {
        width,
        height,
        origin: { x: 0, y: 0 },
        cornerRadii,
        cornerChamfer,
        holes: compiled.holes,
      },
      unresolved,
    );

    for (const issue of validation.issues) {
      if (issue.severity === "warning") warnings.push(issue.message);
    }

    // 6. Construção da lista ordenada de operações para o DSL
    const operations: IntentOperation[] = [];
    const opPlateId = "op_create_plate";
    operations.push({
      id: opPlateId,
      type: cornerRadius > 0 ? "create_rounded_rectangle" : "create_rectangle",
      params: {
        width,
        height,
        corner_radius: cornerRadius,
        corner_chamfer: cornerChamfer,
        corner_selector: cornerSelector,
      },
      layer: activeLayer,
      description:
        cornerRadius > 0
          ? `Contorno de chapa ${width}×${height} mm com filete R${cornerRadius} mm (${cornerSelector}).`
          : `Contorno de chapa retangular ${width}×${height} mm.`,
    });

    const dependencies: ChamferIntentPlan["dependencies"] = [];

    if (holeCount > 0 && holeGroupSpec) {
      const opHolesId = "op_create_holes";
      const holeOpType: CadCommandType =
        distribution === "corner_margins"
          ? "create_corner_holes"
          : distribution === "circular_pcd"
            ? "create_circular_hole_pattern_pcd"
            : distribution === "single_center" || distribution === "single_offset"
              ? "create_single_hole"
              : "create_linear_hole_pattern";

      operations.push({
        id: opHolesId,
        type: holeOpType,
        targetRef: opPlateId,
        dependsOn: [opPlateId],
        params: {
          hole_count: holeCount,
          hole_diameter: holeDiameter,
          distribution,
          linear_formula: linearFormula,
          measurement_mode: measurementMode,
          margin,
          pitch: compiled.featureState.holeGroups[0]?.pitch,
          pcd: holeGroupSpec.pcd,
        },
        layer: activeLayer,
        description: `${holeCount} furo(s) Ø${holeDiameter} mm (${distribution}).`,
      });

      dependencies.push({
        fromOperationId: opPlateId,
        toOperationId: opHolesId,
        relation: "hosts_feature",
      });
    }

    const summaryParts = [`Chapa ${width} × ${height} mm`];
    if (cornerRadius > 0) summaryParts.push(`R${cornerRadius} mm`);
    if (cornerChamfer > 0) summaryParts.push(`Chanfro ${cornerChamfer} mm`);
    if (holeCount > 0) summaryParts.push(`${holeCount} Furos Ø${holeDiameter} mm`);

    const responseSummary =
      validation.status === "invalid"
        ? `Erro geométrico detectado: ${validation.issues.find((i) => i.severity === "error")?.message}`
        : validation.status === "needs_clarification"
          ? `Pré-visualização gerada (${summaryParts.join(" · ")}). Confirme o arranjo exato abaixo antes de aplicar.`
          : `${summaryParts.join(" · ")} compilada com ${compiled.entities.length} entidades nativas e ${compiled.dimensions.length} cotas associativas.`;

    return {
      plan_id: `plan_plate_${turnIndex}_${width}x${height}_${holeCount}x${holeDiameter}_${cornerRadius}_${distribution}`,
      schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
      document_context: {
        units: "mm",
        origin_mode: originMode,
        active_selection_ids: selectedIds,
        existing_entities_count: existingEntities.length,
        active_part_id: compiled.featureState.partId,
      },
      intent: {
        summary: summaryParts.join(" com "),
        category: "create",
        raw_prompt: rawPrompt,
        turn_index: turnIndex,
      },
      operations,
      parameters: {
        width,
        height,
        corner_radius: cornerRadius,
        corner_chamfer: cornerChamfer,
        corner_selector: cornerSelector,
        hole_count: holeCount,
        hole_diameter: holeDiameter,
        hole_distribution: distribution,
        linear_formula: linearFormula,
        measurement_mode: measurementMode,
        margin,
        pitch: compiled.featureState.holeGroups[0]?.pitch,
        pcd: holeGroupSpec?.pcd,
      },
      typed_parameters: typedParams,
      parameter_provenance: provenance,
      constraints: [
        { id: "c_ortho", type: "horizontal", targetIds: compiled.featureState.contourEntityIds },
        ...(holeCount > 1
          ? [{ id: "c_eq_spacing", type: "equal_spacing" as const, targetIds: compiled.featureState.holeGroups[0]?.entityIds ?? [] }]
          : []),
      ],
      dependencies,
      unresolved,
      warnings,
      validation,
      confirmation_required: true,
      response_summary: responseSummary,
      compiled: {
        previewEntities: compiled.entities,
        finalEntities: [...existingEntities, ...compiled.entities],
        generatedDimensions: compiled.dimensions,
        replacedEntityIds: [],
        deletedEntityIds: [],
        selectedEntityIds: compiled.entities.map((e) => e.id),
        suggestedViewport: { x: 0, y: 0, width, height },
        parametricFeatureSnapshot: compiled.featureState,
      },
    };
  }

  /**
   * Compila modificações conversacionais multi-turno sobre uma Chapa Paramétrica existente (Seção 10):
   *  - "Agora aumente esses furos para 16 mm"
   *  - "Adicione mais dois furos com o mesmo espaçamento"
   *  - "Aumente a chapa para 600 mm de largura"
   *  - "Arredonde somente os dois cantos esquerdos"
   */
  private static compileMultiTurnPlateModification(
    rawPrompt: string,
    q: string,
    activePart: ParametricFeatureState,
    existingEntities: Entity[],
    selectedIds: string[],
    activeLayer: LayerId,
    turnIndex: number,
    overrides: Record<string, unknown>,
  ): ChamferIntentPlan {
    let nextWidth = (overrides.width as number | undefined) ?? activePart.width;
    let nextHeight = (overrides.height as number | undefined) ?? activePart.height;
    let nextCornerSelector: CornerSelector =
      (overrides.corner_selector as CornerSelector | undefined) ?? activePart.cornerSelector;
    let nextCornerChamfer =
      (overrides.corner_chamfer as number | undefined) ?? activePart.cornerChamfer ?? 0;

    const currentMaxR = Math.max(
      activePart.cornerRadii.top_left,
      activePart.cornerRadii.top_right,
      activePart.cornerRadii.bottom_right,
      activePart.cornerRadii.bottom_left,
    );
    let targetRadius = (overrides.corner_radius as number | undefined) ?? currentMaxR;

    const activeHoleGroup = activePart.holeGroups[0];
    let nextHoleCount =
      (overrides.hole_count as number | undefined) ?? (activeHoleGroup?.count ?? 0);
    let nextHoleDiameter =
      (overrides.hole_diameter as number | undefined) ?? (activeHoleGroup?.diameter ?? 12);
    let nextDistribution: HoleDistributionMode =
      (overrides.hole_distribution as HoleDistributionMode | undefined) ??
      (activeHoleGroup?.distribution ?? "linear_centerline_x");
    let nextFormula: LinearHoleFormulaMode =
      (overrides.linear_formula as LinearHoleFormulaMode | undefined) ??
      (activeHoleGroup?.linearFormula ?? "equal_subdivision_including_borders");
    let nextMargin = (overrides.margin as number | undefined) ?? (activeHoleGroup?.margin ?? 25);
    let nextPitch = (overrides.pitch as number | undefined) ?? activeHoleGroup?.pitch;
    let nextPcd = (overrides.pcd as number | undefined) ?? activeHoleGroup?.pcd;

    const nums = ChamferIntentInterpreter.extractNumbers(q);
    const changesSummary: string[] = [];

    // Caso 1: Alterar largura ou altura da chapa ("Aumente a chapa para 600 mm de largura")
    const widthMatch =
      q.match(/(?:largura\s*(?:para|de)?|para)\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:de\s*largura)?/i);
    const heightMatch =
      q.match(/(?:altura\s*(?:para|de)?|para)\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:de\s*altura)?/i);
    const dimPairMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(?:x|×|por|\*)\s*(\d+(?:[.,]\d+)?)/i);

    if (dimPairMatch && dimPairMatch[1] && dimPairMatch[2]) {
      nextWidth = parseFloat(dimPairMatch[1].replace(",", "."));
      nextHeight = parseFloat(dimPairMatch[2].replace(",", "."));
      changesSummary.push(`dimensões para ${nextWidth}×${nextHeight} mm`);
    } else {
      if (q.includes("largura") && (widthMatch?.[1] || nums[0])) {
        nextWidth = widthMatch?.[1] ? parseFloat(widthMatch[1].replace(",", ".")) : nums[0]!;
        changesSummary.push(`largura para ${nextWidth} mm`);
      }
      if (q.includes("altura") && (heightMatch?.[1] || nums[0])) {
        nextHeight = heightMatch?.[1] ? parseFloat(heightMatch[1].replace(",", ".")) : nums[0]!;
        changesSummary.push(`altura para ${nextHeight} mm`);
      }
    }

    // Caso 2: Alterar diâmetro dos furos ("Agora aumente esses furos para 16 mm", "mude os furos para Ø18")
    if (
      (q.includes("furo") || q.includes("diâmetro") || q.includes("diametro")) &&
      !q.includes("adicione") &&
      !q.includes("acrescente") &&
      !q.includes("mais") &&
      nums.length > 0 &&
      !q.includes("largura") &&
      !q.includes("altura")
    ) {
      nextHoleDiameter = nums[0]!;
      if (nextHoleCount === 0) nextHoleCount = 4;
      changesSummary.push(`diâmetro dos furos para Ø${nextHoleDiameter} mm`);
    }

    // Caso 3: Adicionar mais furos ("Adicione mais dois furos com o mesmo espaçamento")
    if (
      (q.includes("adicione") || q.includes("acrescente") || q.includes("mais")) &&
      q.includes("furo")
    ) {
      const delta = nums[0] ?? 1;
      const prevCount = nextHoleCount;
      nextHoleCount = prevCount + delta;

      if (q.includes("mesmo espaçamento") || q.includes("mesmo passo")) {
        // Mantém o passo (pitch) anterior se existir e couber na chapa, ou calcula passo uniforme válido entre margens
        const safeMargin = Math.max(nextMargin, nextHoleDiameter);
        const maxValidPitch =
          nextHoleCount > 1
            ? (nextWidth - 2 * safeMargin) / (nextHoleCount - 1)
            : nextWidth / 2;
        const candidatePitch =
          activeHoleGroup?.pitch ??
          (prevCount >= 2 ? (nextWidth - 2 * safeMargin) / (nextHoleCount - 1) : 60);
        const preservedPitch = Math.min(candidatePitch, maxValidPitch);
        nextPitch = Number(preservedPitch.toFixed(4));
        if (nextDistribution === "corner_margins") {
          nextDistribution = "linear_centerline_x";
        }
        changesSummary.push(
          `+${delta} furos (total ${nextHoleCount}) mantendo passo uniforme de ${preservedPitch.toFixed(1)} mm`,
        );
      } else {
        if (nextDistribution === "corner_margins" && nextHoleCount > 4) {
          nextDistribution = "linear_centerline_x";
        }
        changesSummary.push(`+${delta} furos (total ${nextHoleCount})`);
      }
    }

    // Caso 4: Arredondamento seletivo ou uniforme de cantos ("Arredonde somente os dois cantos esquerdos")
    const detectedSelector = parseCornerSelector(q);
    if (
      detectedSelector ||
      q.includes("arredond") ||
      q.includes("raio") ||
      q.includes("filete")
    ) {
      if (detectedSelector) {
        nextCornerSelector = detectedSelector;
      }
      const rMatch = q.match(/(?:raio|r|em|para)\s*(\d+(?:[.,]\d+)?)/i);
      if (rMatch && rMatch[1]) {
        targetRadius = parseFloat(rMatch[1].replace(",", "."));
      } else if (targetRadius <= 0) {
        targetRadius = 20;
      }
      nextCornerChamfer = 0;
      changesSummary.push(`cantos (${nextCornerSelector}) com R${targetRadius} mm`);
    }

    // Caso 5: Chanfrar cantos
    if (q.includes("chanfr")) {
      if (detectedSelector) {
        nextCornerSelector = detectedSelector;
      } else {
        nextCornerSelector = "all";
      }
      nextCornerChamfer = nums[0] ?? 15;
      targetRadius = 0;
      changesSummary.push(`chanfro de ${nextCornerChamfer} mm (${nextCornerSelector})`);
    }

    const nextCornerRadii = ChamferGeometricExecutionEngine.resolveCornerRadii(
      targetRadius,
      nextCornerSelector,
    );

    const holeGroupSpec: Omit<ParametricHoleGroup, "entityIds"> | undefined =
      nextHoleCount > 0 && nextDistribution !== "none"
        ? {
            id: activeHoleGroup?.id ?? `hg_${uid()}`,
            distribution: nextDistribution,
            linearFormula: nextFormula,
            measurementMode: activeHoleGroup?.measurementMode ?? "center_to_edge",
            count: nextHoleCount,
            diameter: nextHoleDiameter,
            margin: nextMargin,
            pitch: nextPitch,
            pcd: nextPcd,
            startAngleDeg: activeHoleGroup?.startAngleDeg ?? 0,
          }
        : undefined;

    const compiled = ChamferGeometricExecutionEngine.compileParametricPlate({
      partId: activePart.partId,
      origin: activePart.origin,
      width: nextWidth,
      height: nextHeight,
      cornerRadii: nextCornerRadii,
      cornerChamfer: nextCornerChamfer,
      cornerSelector: nextCornerSelector,
      holeGroup: holeGroupSpec,
      includeCenterlines: activePart.centerlineEntityIds.length > 0,
      includeDimensions: true,
      layer: activePart.layer || activeLayer,
      turnIndex,
    });

    const validation = ChamferValidationEngine.validatePlate({
      width: nextWidth,
      height: nextHeight,
      origin: activePart.origin,
      cornerRadii: nextCornerRadii,
      cornerChamfer: nextCornerChamfer,
      holes: compiled.holes,
    });

    // Substitui as entidades da peça ativa anterior mantendo entidades não relacionadas intactas!
    const oldPartEntityIds = new Set(activePart.allEntityIds);
    const unrelatedEntities = existingEntities.filter((e) => !oldPartEntityIds.has(e.id));
    const finalEntities = [...unrelatedEntities, ...compiled.entities];

    const summaryText =
      changesSummary.length > 0
        ? `Atualizar peça ativa: ${changesSummary.join(", ")}`
        : `Atualizar chapa paramétrica ${nextWidth}×${nextHeight} mm`;

    return {
      plan_id: `plan_mod_plate_${turnIndex}_${uid()}`,
      schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
      document_context: {
        units: "mm",
        origin_mode: "part_origin_bottom_left",
        active_selection_ids: selectedIds,
        existing_entities_count: existingEntities.length,
        active_part_id: activePart.partId,
      },
      intent: {
        summary: summaryText,
        category: "modify",
        raw_prompt: rawPrompt,
        turn_index: turnIndex,
      },
      operations: [
        {
          id: `op_mod_${uid()}`,
          type: "modify_active_feature",
          targetRef: activePart.partId,
          params: {
            width: nextWidth,
            height: nextHeight,
            corner_radius: targetRadius,
            corner_selector: nextCornerSelector,
            corner_chamfer: nextCornerChamfer,
            hole_count: nextHoleCount,
            hole_diameter: nextHoleDiameter,
            hole_distribution: nextDistribution,
            margin: nextMargin,
            pitch: compiled.featureState.holeGroups[0]?.pitch,
          },
          layer: activePart.layer || activeLayer,
          description: summaryText,
        },
      ],
      parameters: {
        width: nextWidth,
        height: nextHeight,
        corner_radius: targetRadius,
        corner_selector: nextCornerSelector,
        hole_count: nextHoleCount,
        hole_diameter: nextHoleDiameter,
        hole_distribution: nextDistribution,
        margin: nextMargin,
        pitch: compiled.featureState.holeGroups[0]?.pitch,
      },
      typed_parameters: {},
      parameter_provenance: {
        width: nextWidth !== activePart.width ? "explicit" : "inferred",
        height: nextHeight !== activePart.height ? "explicit" : "inferred",
      },
      constraints: [],
      dependencies: [],
      unresolved: [],
      warnings: validation.issues.filter((i) => i.severity === "warning").map((i) => i.message),
      validation,
      confirmation_required: true,
      response_summary:
        validation.status === "invalid"
          ? `Conflito geométrico na edição: ${validation.issues.find((i) => i.severity === "error")?.message}`
          : `${summaryText} (Chapa ${nextWidth}×${nextHeight} mm · ${nextHoleCount} furos Ø${nextHoleDiameter} mm).`,
      compiled: {
        previewEntities: compiled.entities,
        finalEntities,
        generatedDimensions: compiled.dimensions,
        replacedEntityIds: Array.from(oldPartEntityIds),
        deletedEntityIds: [],
        selectedEntityIds: compiled.entities.map((e) => e.id),
        suggestedViewport: { x: activePart.origin.x, y: activePart.origin.y, width: nextWidth, height: nextHeight },
        parametricFeatureSnapshot: compiled.featureState,
      },
    };
  }

  /**
   * Compila a criação de um Flange Circular com PCD.
   */
  private static compileFlangeIntent(
    rawPrompt: string,
    q: string,
    existingEntities: Entity[],
    selectedIds: string[],
    activeLayer: LayerId,
    originMode: ChamferIntentPlan["document_context"]["origin_mode"],
    turnIndex: number,
    overrides: Record<string, unknown>,
  ): ChamferIntentPlan {
    const extMatch = q.match(/(?:externo|dext|[\u00d8ø]ext)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
    const intMatch = q.match(/(?:interno|dint|[\u00d8ø]int|furo\s+central)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
    const pcdMatch = q.match(/pcd\s*(?:de\s*|[\u00d8ø]\s*)?(\d+(?:[.,]\d+)?)/i);
    const holesMatch = q.match(/(\d+)\s*furos?/i);
    const holeDMatch = q.match(/furos?\s*(?:de\s*|[\u00d8ø]\s*)(\d+(?:[.,]\d+)?)/i);

    const pcdVal =
      (overrides.pcd as number | undefined) ??
      (pcdMatch?.[1] ? parseFloat(pcdMatch[1].replace(",", ".")) : undefined);
    const outerDiam =
      (overrides.outer_diameter as number | undefined) ??
      (extMatch?.[1]
        ? parseFloat(extMatch[1].replace(",", "."))
        : pcdVal
          ? Math.round(pcdVal * 1.25)
          : 400);
    const innerDiam =
      (overrides.inner_diameter as number | undefined) ??
      (intMatch?.[1]
        ? parseFloat(intMatch[1].replace(",", "."))
        : Math.round(outerDiam * 0.5));
    const pcd = pcdVal ?? Math.round((outerDiam + innerDiam) / 2);
    const holeCount =
      (overrides.hole_count as number | undefined) ??
      (holesMatch?.[1] ? parseInt(holesMatch[1], 10) : 8);
    const holeDiam =
      (overrides.hole_diameter as number | undefined) ??
      (holeDMatch?.[1] ? parseFloat(holeDMatch[1].replace(",", ".")) : 18);

    const unresolved: UnresolvedAmbiguity[] = [];
    if (pcdVal === undefined && !extMatch) {
      unresolved.push({
        id: "amb_flange_pcd",
        parameter: "pcd",
        reason: "O diâmetro PCD não foi especificado explicitamente.",
        question: "Qual diâmetro PCD deseja utilizar para a furação do flange?",
        options: [
          {
            id: "opt_flange_320",
            label: "PCD Ø320 mm (Flange Ø400 × Ø200)",
            description: `${holeCount} furos Ø${holeDiam} mm em PCD 320 mm`,
            patch: { outer_diameter: 400, inner_diameter: 200, pcd: 320 },
          },
          {
            id: "opt_flange_240",
            label: "PCD Ø240 mm (Flange Ø300 × Ø150)",
            description: `${holeCount} furos Ø${holeDiam} mm em PCD 240 mm`,
            patch: { outer_diameter: 300, inner_diameter: 150, pcd: 240 },
          },
        ],
      });
    }

    const compiled = ChamferGeometricExecutionEngine.compileCircularFlange({
      outerDiameter: outerDiam,
      innerDiameter: innerDiam,
      pcd,
      holeCount,
      holeDiameter: holeDiam,
      layer: activeLayer,
      turnIndex,
    });

    const validation = ChamferValidationEngine.validateFlange(
      {
        outerDiameter: outerDiam,
        innerDiameter: innerDiam,
        pcd,
        holeCount,
        holeDiameter: holeDiam,
      },
      unresolved,
    );

    return {
      plan_id: `plan_flange_${turnIndex}_${outerDiam}_${pcd}_${holeCount}`,
      schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
      document_context: {
        units: "mm",
        origin_mode: originMode,
        active_selection_ids: selectedIds,
        existing_entities_count: existingEntities.length,
        active_part_id: compiled.featureState.partId,
      },
      intent: {
        summary: `Flange Circular Ø${outerDiam}×Ø${innerDiam} mm com PCD Ø${pcd} mm e ${holeCount} Furos Ø${holeDiam} mm`,
        category: "create",
        raw_prompt: rawPrompt,
        turn_index: turnIndex,
      },
      operations: [
        {
          id: `op_flange_${uid()}`,
          type: "create_circular_flange",
          params: {
            outer_diameter: outerDiam,
            inner_diameter: innerDiam,
            pcd,
            hole_count: holeCount,
            hole_diameter: holeDiam,
          },
          layer: activeLayer,
          description: `Flange concêntrico com ${holeCount} furos equidistantes (Δθ=${(360 / holeCount).toFixed(1)}°).`,
        },
      ],
      parameters: {
        outer_diameter: outerDiam,
        inner_diameter: innerDiam,
        pcd,
        hole_count: holeCount,
        hole_diameter: holeDiam,
      },
      typed_parameters: {},
      parameter_provenance: {
        pcd: pcdVal !== undefined ? "explicit" : "default",
        hole_count: holesMatch ? "explicit" : "default",
      },
      constraints: [
        { id: `c_conc_${uid()}`, type: "concentric", targetIds: compiled.featureState.contourEntityIds },
      ],
      dependencies: [],
      unresolved,
      warnings: [],
      validation,
      confirmation_required: true,
      response_summary: `Flange Ø${outerDiam} mm (furo central Ø${innerDiam} mm) com ${holeCount} furos Ø${holeDiam} mm no PCD Ø${pcd} mm.`,
      compiled: {
        previewEntities: compiled.entities,
        finalEntities: [...existingEntities, ...compiled.entities],
        generatedDimensions: compiled.dimensions,
        replacedEntityIds: [],
        deletedEntityIds: [],
        selectedEntityIds: compiled.entities.map((e) => e.id),
        suggestedViewport: {
          x: -outerDiam / 2,
          y: -outerDiam / 2,
          width: outerDiam,
          height: outerDiam,
        },
        parametricFeatureSnapshot: compiled.featureState,
      },
    };
  }

  private static buildControlPlan(args: {
    rawPrompt: string;
    turnIndex: number;
    category: IntentCategory;
    opType: CadCommandType;
    params?: Record<string, unknown>;
    summary: string;
    responseSummary: string;
    existingEntitiesCount: number;
    selectedIds: string[];
    originMode: ChamferIntentPlan["document_context"]["origin_mode"];
    activePartId?: string;
  }): ChamferIntentPlan {
    return {
      plan_id: `plan_${args.opType}_${args.turnIndex}_${uid()}`,
      schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
      document_context: {
        units: "mm",
        origin_mode: args.originMode,
        active_selection_ids: args.selectedIds,
        existing_entities_count: args.existingEntitiesCount,
        active_part_id: args.activePartId,
      },
      intent: {
        summary: args.summary,
        category: args.category,
        raw_prompt: args.rawPrompt,
        turn_index: args.turnIndex,
      },
      operations: [
        {
          id: `op_${args.opType}_${uid()}`,
          type: args.opType,
          params: args.params ?? {},
          description: args.summary,
        },
      ],
      parameters: args.params ?? {},
      typed_parameters: {},
      parameter_provenance: {},
      constraints: [],
      dependencies: [],
      unresolved: [],
      warnings: [],
      validation: { status: "valid", issues: [], checkedAt: Date.now() },
      confirmation_required: true,
      response_summary: args.responseSummary,
    };
  }

  private static wrapSimpleCreatePlan(args: {
    rawPrompt: string;
    turnIndex: number;
    opType: CadCommandType;
    summary: string;
    params: Record<string, unknown>;
    entities: Entity[];
    existingEntities: Entity[];
    selectedIds: string[];
    originMode: ChamferIntentPlan["document_context"]["origin_mode"];
    viewport: { x: number; y: number; width: number; height: number };
    dimensions?: Dimension[];
  }): ChamferIntentPlan {
    return {
      plan_id: `plan_${args.opType}_${args.turnIndex}_${uid()}`,
      schema_version: CHAMFER_INTENT_SCHEMA_VERSION,
      document_context: {
        units: "mm",
        origin_mode: args.originMode,
        active_selection_ids: args.selectedIds,
        existing_entities_count: args.existingEntities.length,
      },
      intent: {
        summary: args.summary,
        category: "create",
        raw_prompt: args.rawPrompt,
        turn_index: args.turnIndex,
      },
      operations: [
        {
          id: `op_${args.opType}_${uid()}`,
          type: args.opType,
          params: args.params,
          description: args.summary,
        },
      ],
      parameters: args.params,
      typed_parameters: {},
      parameter_provenance: {},
      constraints: [],
      dependencies: [],
      unresolved: [],
      warnings: [],
      validation: { status: "valid", issues: [], checkedAt: Date.now() },
      confirmation_required: true,
      response_summary: `${args.summary} compilado em entidades CAD editáveis.`,
      compiled: {
        previewEntities: args.entities,
        finalEntities: [...args.existingEntities, ...args.entities],
        generatedDimensions: args.dimensions ?? [],
        replacedEntityIds: [],
        deletedEntityIds: [],
        selectedEntityIds: args.entities.map((e) => e.id),
        suggestedViewport: args.viewport,
      },
    };
  }

  private static extractNumbers(s: string): number[] {
    return Array.from(s.matchAll(/(\d+(?:[.,]\d+)?)/g))
      .map((m) => parseFloat(m[1]!.replace(",", ".")))
      .filter((n) => Number.isFinite(n));
  }
}
