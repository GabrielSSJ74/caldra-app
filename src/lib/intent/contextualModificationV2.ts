/**
 * CALDRA — CHAMFER INTENT 2.0
 * Fase 5 (Claude §3 item 7, §4 Composer Referências, §9 Modificação, §11 Fase 5):
 * Modificação Contextual:
 *  - Seleção por clique no canvas ou menção `@` no composer (`@plate_1`, `@holes_1`, `@selecionado`);
 *  - Resolução determinística de dêiticos e referências ("isto", "esse furo", "esses furos",
 *    "o segundo", "o de cima", "igual ao anterior") sobre o PartModel;
 *  - Recompilação instantânea do Cartão de Peça ao editar parâmetros SEM chamar o LLM,
 *    registrando a nota de alteração manual no contexto ("usuário alterou R de 20 para 25").
 */

import type { Entity, LayerId } from "../lab2d/core";
import type { PartModel, PartModelFeatureEntity } from "./partModel";
import type { ChamferIntentPlan, ParametricSessionContext } from "./schema";
import { ChamferIntentInterpreter } from "./intentInterpreter";

// ============================================================================
// 1. AUTOCOMPLETAR E CHIPS DE REFERÊNCIA `@entidade` (§4 Composer)
// ============================================================================

export interface MentionSuggestionItem {
  token: string; // ex.: "@plate_1", "@holes_1", "@selecionado"
  entityId: string;
  label: string;
  description: string;
  featureType: PartModelFeatureEntity["type"] | "selection";
}

/**
 * Gera a lista de candidatos `@entidade` a partir do `PartModel` atual quando o usuário
 * digita `@` no composer ou clica em uma entidade do canvas.
 */
export function getAvailableMentionSuggestions(
  partModel: PartModel,
  queryAfterAt = "",
): MentionSuggestionItem[] {
  const q = queryAfterAt.trim().toLowerCase().replace(/^@/, "");
  const items: MentionSuggestionItem[] = [];

  if (partModel.selection.length > 0) {
    items.push({
      token: "@selecionado",
      entityId: "selection",
      label: `@selecionado (${partModel.selection.length})`,
      description: `Entidades selecionadas no canvas: ${partModel.selection.join(", ")}`,
      featureType: "selection",
    });
  }

  for (const feat of partModel.entities) {
    let desc = `Camada ${feat.layer}`;
    if (feat.type === "plate") {
      desc = `Chapa ${feat.params.w ?? feat.params.width ?? "?"}×${feat.params.h ?? feat.params.height ?? "?"} mm`;
    } else if (feat.type === "hole_pattern") {
      const count = feat.derived?.centers?.length ?? feat.params.count ?? "?";
      desc = `Padrão de ${count} furo(s) Ø${feat.params.d ?? feat.params.diameter ?? "?"} mm`;
    } else if (feat.type === "flange") {
      desc = `Flange Ø${feat.params.d_out ?? "?"}/Ø${feat.params.d_in ?? "?"} mm`;
    } else if (feat.type === "slot") {
      desc = `Rasgo oblongo ${feat.params.length ?? "?"}×${feat.params.width ?? "?"} mm`;
    } else if (feat.type === "circle") {
      desc = `Furo/Círculo Ø${feat.params.d ?? "?"} mm`;
    }

    items.push({
      token: `@${feat.id}`,
      entityId: feat.id,
      label: `@${feat.id}`,
      description: desc,
      featureType: feat.type,
    });
  }

  if (!q) return items;
  return items.filter(
    (it) =>
      it.token.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.entityId.toLowerCase().includes(q),
  );
}

/**
 * Detecta se o cursor no texto do composer está digitando uma menção `@...`.
 */
export function detectActiveAtMentionQuery(text: string): {
  active: boolean;
  query: string;
  startIndex: number;
} {
  const match = text.match(/(?:^|\s)@([a-zA-Z0-9_-]*)$/);
  if (!match) {
    return { active: false, query: "", startIndex: -1 };
  }
  const query = match[1] ?? "";
  const startIndex = text.lastIndexOf(`@${query}`);
  return {
    active: true,
    query,
    startIndex,
  };
}

/**
 * Insere o token `@entidade` escolhido no texto do composer.
 */
export function insertAtMentionToken(text: string, token: string): string {
  const detected = detectActiveAtMentionQuery(text);
  if (!detected.active || detected.startIndex < 0) {
    return `${text.trimEnd()} ${token} `.trimStart();
  }
  const before = text.slice(0, detected.startIndex);
  return `${before}${token} `;
}

// ============================================================================
// 2. RESOLUÇÃO DE REFERÊNCIAS DÊITICAS E POSICIONAIS (§9 Item 3)
// ============================================================================

export interface ContextualResolutionResult {
  normalizedPrompt: string;
  resolvedTargetIds: string[];
  inheritedParams: Record<string, unknown>;
  resolutionNotes: string[];
}

/**
 * Resolve menções explícitas (`@holes_1`, `@plate_1`, `@selecionado`) e expressões
 * dêiticas/posicionais ("isso", "esse furo", "esses furos", "o segundo", "o de cima",
 * "igual ao anterior") usando a seleção ativa e o `PartModel`.
 */
export function resolveContextualMentionsAndDeictics(
  rawPrompt: string,
  partModel: PartModel,
  lastTurnParameters?: Record<string, unknown>,
): ContextualResolutionResult {
  const resolvedTargetIds = new Set<string>();
  const inheritedParams: Record<string, unknown> = {};
  const resolutionNotes: string[] = [];
  let normalizedPrompt = rawPrompt;

  // 1. Menções explícitas @id ou @selecionado
  const mentionMatches = Array.from(rawPrompt.matchAll(/@([a-zA-Z0-9_-]+)/g));
  for (const m of mentionMatches) {
    const refName = m[1]!;
    if (refName.toLowerCase() === "selecionado" || refName.toLowerCase() === "selection") {
      for (const selId of partModel.selection) {
        resolvedTargetIds.add(selId);
      }
      resolutionNotes.push(
        `Menção @${refName} resolvida para a seleção ativa (${partModel.selection.join(", ") || "vazia"}).`,
      );
    } else {
      const found = partModel.entities.find(
        (e) => e.id.toLowerCase() === refName.toLowerCase(),
      );
      if (found) {
        resolvedTargetIds.add(found.id);
        resolutionNotes.push(`Menção @${found.id} resolvida para feature '${found.type}'.`);
      }
    }
  }

  const lower = rawPrompt.toLowerCase();

  // 2. Pronomes demonstrativos ("isso", "isto", "esse furo", "esses furos", "aquele")
  if (
    /\b(isso|isto|esse\s+furo|esses\s+furos|esta\s+chapa|essa\s+chapa|aquele|selecionad[oa]s?)\b/i.test(
      lower,
    )
  ) {
    if (partModel.selection.length > 0) {
      for (const id of partModel.selection) resolvedTargetIds.add(id);
      resolutionNotes.push(
        `Referência demonstrativa resolvida pela seleção ativa: [${partModel.selection.join(", ")}].`,
      );
    } else if (/furos?/i.test(lower)) {
      const holeFeat = [...partModel.entities]
        .reverse()
        .find((e) => e.type === "hole_pattern" || e.type === "circle");
      if (holeFeat) {
        resolvedTargetIds.add(holeFeat.id);
        resolutionNotes.push(
          `Referência 'esse(s) furo(s)' resolvida para '${holeFeat.id}'.`,
        );
      }
    } else {
      const plateFeat = partModel.entities.find(
        (e) => e.type === "plate" || e.type === "flange",
      );
      if (plateFeat) {
        resolvedTargetIds.add(plateFeat.id);
        resolutionNotes.push(`Referência demonstrativa resolvida para '${plateFeat.id}'.`);
      }
    }
  }

  // 3. Referências posicionais ("o de cima", "o de baixo", "o da esquerda", "o da direita", "o segundo")
  const holeFeatures = partModel.entities.filter(
    (e) => e.type === "circle" || e.type === "hole_pattern",
  );
  if (holeFeatures.length > 0) {
    if (/\bo\s+segundo\b/i.test(lower) && holeFeatures.length >= 2) {
      resolvedTargetIds.add(holeFeatures[1]!.id);
      resolutionNotes.push(`Referência posicional 'o segundo' resolvida para '${holeFeatures[1]!.id}'.`);
    } else if (/\bo\s+de\s+cima\b/i.test(lower)) {
      const sortedTop = [...holeFeatures].sort(
        (a, b) => (b.derived?.bbox?.[3] ?? 0) - (a.derived?.bbox?.[3] ?? 0),
      );
      if (sortedTop[0]) {
        resolvedTargetIds.add(sortedTop[0].id);
        resolutionNotes.push(`Referência 'o de cima' resolvida para '${sortedTop[0].id}'.`);
      }
    } else if (/\bo\s+de\s+baixo\b/i.test(lower)) {
      const sortedBottom = [...holeFeatures].sort(
        (a, b) => (a.derived?.bbox?.[1] ?? 0) - (b.derived?.bbox?.[1] ?? 0),
      );
      if (sortedBottom[0]) {
        resolvedTargetIds.add(sortedBottom[0].id);
        resolutionNotes.push(`Referência 'o de baixo' resolvida para '${sortedBottom[0].id}'.`);
      }
    }
  }

  // 4. "Igual ao anterior" (§9 Modificação)
  if (/\bigual\s+ao\s+anterior\b|\bmesmo\s+padr[ãa]o\s+anterior\b/i.test(lower)) {
    if (lastTurnParameters && Object.keys(lastTurnParameters).length > 0) {
      Object.assign(inheritedParams, lastTurnParameters);
      resolutionNotes.push(
        `Expressão 'igual ao anterior' copiou os parâmetros da última operação: ${JSON.stringify(lastTurnParameters)}.`,
      );
    }
  }

  return {
    normalizedPrompt,
    resolvedTargetIds: Array.from(resolvedTargetIds),
    inheritedParams,
    resolutionNotes,
  };
}

// ============================================================================
// 3. EDIÇÃO DE PARÂMETROS NO CARTÃO SEM CHAMAR O LLM (§3 Item 7)
// ============================================================================

const PARAM_HUMAN_NAMES: Record<string, string> = {
  width: "Largura W",
  height: "Altura H",
  corner_radius: "R",
  corner_selector: "Cantos",
  hole_count: "Qtd. Furos",
  hole_diameter: "Ø",
  margin: "Margem",
  pcd: "PCD",
  outer_diameter: "OD",
  inner_diameter: "ID",
  slot_length: "Compr. Rasgo",
  slot_width: "Larg. Rasgo",
  base_diameter: "Ø Base",
  top_diameter: "Ø Topo",
  thickness: "Espessura",
};

/**
 * Recompila o Cartão de Peça localmente a 0ms quando o usuário edita um parâmetro no formulário,
 * SEM realizar nenhuma chamada ao LLM (§3 item 7), e retorna a nota de contexto
 * (ex.: "usuário alterou R de 20 para 25").
 */
export function recompileCardWithoutLLM(params: {
  previousPlan: ChamferIntentPlan;
  changedKey: string;
  oldValue: unknown;
  newValue: unknown;
  currentOverrides: Record<string, unknown>;
  existingEntities: Entity[];
  selectedEntityIds: string[];
  activeLayer: LayerId;
  sessionContext?: ParametricSessionContext;
}): {
  recompiledPlan: ChamferIntentPlan;
  nextOverrides: Record<string, unknown>;
  manualEditContextNote: string;
  usedLLM: false;
} {
  const nextOverrides: Record<string, unknown> = {
    ...params.currentOverrides,
    [params.changedKey]: params.newValue,
  };

  const shortName = PARAM_HUMAN_NAMES[params.changedKey] ?? params.changedKey;
  const manualEditContextNote = `usuário alterou ${shortName} de ${String(params.oldValue)} para ${String(params.newValue)}`;

  const recompiledPlan = ChamferIntentInterpreter.compilePrompt(
    params.previousPlan.intent.raw_prompt,
    {
      existingEntities: params.existingEntities,
      selectedEntityIds: params.selectedEntityIds,
      activeLayer: params.activeLayer,
      session: params.sessionContext,
      parameterOverrides: nextOverrides,
    },
  );

  return {
    recompiledPlan,
    nextOverrides,
    manualEditContextNote,
    usedLLM: false,
  };
}
