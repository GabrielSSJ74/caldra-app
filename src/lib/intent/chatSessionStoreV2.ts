/**
 * CALDRA — CHAMFER INTENT 2.0
 * Fase 3 (Claude §4): Gerenciador de Conversas, Histórico de Mensagens, Ramificações (Branches),
 * Versões Restauráveis (V1, V2, V3...), Formulários Dinâmicos por Operação, Comandos Rápidos (/),
 * Próximos Passos Contextuais e Feedback Local (👍/👎) com Persistência em IndexedDB + Fallback LocalStorage.
 */

import type { Entity, Dimension } from "../lab2d/core";
import type { ChamferIntentPlan } from "./schema";
import type { PartModel } from "./partModel";

// ============================================================================
// 1. TIPOS DE CONVERSA, MENSAGENS, VERSÕES E FEEDBACK (§4.2 – §4.5)
// ============================================================================

export type ChatFeedbackRating = "up" | "down";

export type ChatDownvoteReason =
  | "Posição errada"
  | "Medida incorreta"
  | "Padrão de furos"
  | "Outro";

export interface ChatFeedbackEntry {
  messageId: string;
  conversationId: string;
  prompt: string;
  rating: ChatFeedbackRating;
  reason?: ChatDownvoteReason;
  customNote?: string;
  timestamp: string;
  planSummary?: string;
}

export interface PartVersionSnapshot {
  /** Rótulo curto da versão: "V1", "V2", "V3"... */
  versionId: string;
  versionNumber: number;
  label: string;
  timestamp: string;
  sourceMessageId: string;
  prompt: string;
  entitiesSnapshot: Entity[];
  dimensionsSnapshot: Dimension[];
  partModelSnapshot?: PartModel;
  planSnapshot?: ChamferIntentPlan;
}

export interface AttachedCanvasContextChip {
  selectedCount: number;
  selectedSummary: string;
  selectedEntityIds: string[];
  versionId: string;
  activeLayer: string;
}

export interface ChatMessageBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** Contexto anexado no momento do envio (seleção ativa, versão, camada) */
  attachedContext?: AttachedCanvasContextChip;
  /** Plano compilado anexado ao Cartão de Peça (quando role === "assistant") */
  plan?: ChamferIntentPlan;
  /** Parâmetros editados no cartão antes/depois de aplicar */
  parameterOverrides?: Record<string, unknown>;
  /** Status de aplicação do cartão no canvas */
  commitState?: "pending" | "committed" | "discarded" | "undone";
  /** Versão gerada quando o plano foi aplicado (ex.: "V2") */
  committedVersionId?: string;
  /** Próximos passos sugeridos após esta resposta */
  suggestedNextSteps?: SuggestedNextStepChip[];
  /** Avaliação do usuário (👍 / 👎) */
  feedback?: {
    rating: ChatFeedbackRating;
    reason?: ChatDownvoteReason;
  };
  /** Indica se a mensagem originou uma ramificação ao ser editada */
  branchParentMessageId?: string;
}

export interface ConversationBranchArchive {
  branchId: string;
  createdAt: string;
  forkedAtMessageId: string;
  messages: ChatMessageBubble[];
  versions: PartVersionSnapshot[];
}

export type ChatRuntimeStatus =
  | "idle"
  | "understanding"
  | "planning"
  | "compiling"
  | "validating"
  | "offline"
  | "error"
  | "rate_limit";

export interface ChamferConversationThread {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageBubble[];
  versions: PartVersionSnapshot[];
  activeVersionId: string | null;
  branches: ConversationBranchArchive[];
  autoApplyWhenValidated: boolean;
}

// ============================================================================
// 2. FORMULÁRIO DINÂMICO DE PARÂMETROS DO CARTÃO DE PEÇA (§4.2)
// ============================================================================

export type DynamicParamInputKind = "number" | "select";

export interface DynamicParamFieldSpec {
  key: string;
  label: string;
  unit?: string;
  kind: DynamicParamInputKind;
  min?: number;
  max?: number;
  step?: number;
  value: number | string;
  options?: { value: string; label: string }[];
  hasError?: boolean;
}

export type DetectedOperationFormFamily =
  | "plate"
  | "flange"
  | "slot"
  | "hole_pattern"
  | "boilermaking_cone"
  | "boilermaking_cylinder"
  | "boilermaking_square_to_round"
  | "generic";

/**
 * Detecta a família de operação do plano compilado e gera dinamicamente os campos
 * editáveis do Cartão de Peça (resolvendo o problema do alpha §2 onde os 7 campos de
 * chapa eram fixos para qualquer peça).
 */
export function buildDynamicParameterFields(
  plan: ChamferIntentPlan,
  overrides: Record<string, unknown> = {},
  plateValidation?: {
    isRadiusError?: boolean;
    isMarginError?: boolean;
    isPitchCollision?: boolean;
  },
): {
  family: DetectedOperationFormFamily;
  familyLabel: string;
  fields: DynamicParamFieldSpec[];
} {
  const params: Record<string, unknown> = {
    ...plan.parameters,
    ...overrides,
  };
  const ops = plan.operations.map((o) => o.op);
  const v2Tools = plan.v2?.toolCalls.map((t) => t.name) ?? [];
  const summaryLower = `${plan.intent.summary} ${plan.intent.raw_prompt}`.toLowerCase();

  const valNum = (key: string, fallback: number): number => {
    const v = params[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };

  // 1. Caldeiraria: Quadrado-para-Redondo
  if (
    v2Tools.includes("unfold_square_to_round") ||
    params.boilermaking_Readout === "square_to_round" ||
    typeof params.square_width === "number" ||
    (summaryLower.includes("quadrado") && summaryLower.includes("redondo"))
  ) {
    return {
      family: "boilermaking_square_to_round",
      familyLabel: "Planificação Quadrado-para-Redondo (Triangulação)",
      fields: [
        {
          key: "square_width",
          label: "Base Quadrada A",
          unit: "mm",
          kind: "number",
          min: 20,
          value: valNum("square_width", valNum("width", 400)),
        },
        {
          key: "square_depth",
          label: "Base Quadrada B",
          unit: "mm",
          kind: "number",
          min: 20,
          value: valNum("square_depth", valNum("square_width", valNum("width", 400))),
        },
        {
          key: "round_diameter",
          label: "Boca Circular Ø",
          unit: "mm",
          kind: "number",
          min: 10,
          value: valNum("round_diameter", valNum("top_diameter", 250)),
        },
        {
          key: "height",
          label: "Altura H",
          unit: "mm",
          kind: "number",
          min: 10,
          value: valNum("height", 300),
        },
        {
          key: "thickness",
          label: "Espessura Chapa",
          unit: "mm",
          kind: "number",
          min: 0.5,
          step: 0.5,
          value: valNum("thickness", 3),
        },
      ],
    };
  }

  // 2. Caldeiraria: Tronco de Cone
  if (
    v2Tools.includes("unfold_truncated_cone") ||
    typeof params.base_diameter === "number" ||
    summaryLower.includes("cone")
  ) {
    return {
      family: "boilermaking_cone",
      familyLabel: "Planificação de Tronco de Cone",
      fields: [
        {
          key: "base_diameter",
          label: "Diâmetro Base Ø1",
          unit: "mm",
          kind: "number",
          min: 20,
          value: valNum("base_diameter", 500),
        },
        {
          key: "top_diameter",
          label: "Diâmetro Topo Ø2",
          unit: "mm",
          kind: "number",
          min: 10,
          value: valNum("top_diameter", 250),
        },
        {
          key: "height",
          label: "Altura H",
          unit: "mm",
          kind: "number",
          min: 10,
          value: valNum("height", 350),
        },
        {
          key: "thickness",
          label: "Espessura Chapa",
          unit: "mm",
          kind: "number",
          min: 0.5,
          step: 0.5,
          value: valNum("thickness", 3),
        },
      ],
    };
  }

  // 3. Caldeiraria: Virola Cilíndrica
  if (
    v2Tools.includes("unfold_cylinder") ||
    summaryLower.includes("virola") ||
    summaryLower.includes("cilindro")
  ) {
    return {
      family: "boilermaking_cylinder",
      familyLabel: "Planificação de Virola Cilíndrica",
      fields: [
        {
          key: "diameter",
          label: "Diâmetro Médio Ø",
          unit: "mm",
          kind: "number",
          min: 20,
          value: valNum("diameter", valNum("outer_diameter", 400)),
        },
        {
          key: "height",
          label: "Altura H",
          unit: "mm",
          kind: "number",
          min: 10,
          value: valNum("height", 500),
        },
        {
          key: "thickness",
          label: "Espessura Chapa",
          unit: "mm",
          kind: "number",
          min: 0.5,
          step: 0.5,
          value: valNum("thickness", 3),
        },
      ],
    };
  }

  // 4. Flange Circular / Anel
  if (
    ops.includes("create_circular_flange") ||
    v2Tools.includes("create_CircularFlange") ||
    typeof params.outer_diameter === "number" ||
    summaryLower.includes("flange")
  ) {
    return {
      family: "flange",
      familyLabel: "Flange Circular com PCD",
      fields: [
        {
          key: "outer_diameter",
          label: "Diâmetro Externo OD",
          unit: "mm",
          kind: "number",
          min: 20,
          value: valNum("outer_diameter", 400),
        },
        {
          key: "inner_diameter",
          label: "Furo Central ID",
          unit: "mm",
          kind: "number",
          min: 0,
          value: valNum("inner_diameter", 200),
        },
        {
          key: "pcd",
          label: "Círculo Furação PCD",
          unit: "mm",
          kind: "number",
          min: 10,
          value: valNum("pcd", 320),
        },
        {
          key: "hole_count",
          label: "Qtd. Furos (N)",
          kind: "number",
          min: 0,
          max: 64,
          value: valNum("hole_count", 8),
        },
        {
          key: "hole_diameter",
          label: "Diâmetro Furo Ø",
          unit: "mm",
          kind: "number",
          min: 1,
          value: valNum("hole_diameter", 18),
        },
      ],
    };
  }

  // 5. Chapa Retangular Paramétrica (com ou sem furos/cantos/rasgo)
  if (
    ops.includes("create_rectangular_plate") ||
    v2Tools.includes("create_base_plate") ||
    (typeof params.width === "number" && typeof params.height === "number")
  ) {
    const holeDist = String(params.hole_distribution ?? "linear_centerline_x");
    const fields: DynamicParamFieldSpec[] = [
      {
        key: "width",
        label: "Largura W",
        unit: "mm",
        kind: "number",
        min: 10,
        value: valNum("width", 400),
      },
      {
        key: "height",
        label: "Altura H",
        unit: "mm",
        kind: "number",
        min: 10,
        value: valNum("height", 250),
      },
      {
        key: "corner_radius",
        label: "Raio Canto R",
        unit: "mm",
        kind: "number",
        min: 0,
        value: valNum("corner_radius", 0),
        hasError: plateValidation?.isRadiusError,
      },
      {
        key: "corner_selector",
        label: "Cantos Alvo",
        kind: "select",
        value: String(params.corner_selector ?? "all"),
        options: [
          { value: "all", label: "Todos os 4 cantos" },
          { value: "top_two", label: "Apenas Superiores" },
          { value: "bottom_two", label: "Apenas Inferiores" },
          { value: "left_two", label: "Apenas Esquerda" },
          { value: "right_two", label: "Apenas Direita" },
          { value: "none", label: "Canto Reto (R=0)" },
        ],
      },
      {
        key: "hole_count",
        label: "Qtd. Furos (N)",
        kind: "number",
        min: 0,
        max: 100,
        value: valNum("hole_count", 0),
      },
      {
        key: "hole_diameter",
        label: "Diâmetro Ø",
        unit: "mm",
        kind: "number",
        min: 1,
        value: valNum("hole_diameter", 12),
        hasError: plateValidation?.isPitchCollision,
      },
      {
        key: "margin",
        label: "Margem Borda",
        unit: "mm",
        kind: "number",
        min: 0,
        value: valNum("margin", 25),
        hasError: plateValidation?.isMarginError,
      },
    ];

    if (holeDist === "circular_pcd") {
      fields.push({
        key: "pcd",
        label: "PCD Ø",
        unit: "mm",
        kind: "number",
        min: 5,
        value: valNum("pcd", 160),
      });
    }

    if (typeof params.slot_length === "number" || ops.includes("add_oblong_slot")) {
      fields.push(
        {
          key: "slot_length",
          label: "Compr. Rasgo",
          unit: "mm",
          kind: "number",
          min: 5,
          value: valNum("slot_length", 50),
        },
        {
          key: "slot_width",
          label: "Larg. Rasgo",
          unit: "mm",
          kind: "number",
          min: 2,
          value: valNum("slot_width", 16),
        },
      );
    }

    return {
      family: "plate",
      familyLabel: "Chapa Paramétrica 2D",
      fields,
    };
  }

  // 6. Rasgo Oblongo Isolado
  if (ops.includes("add_oblong_slot") || v2Tools.includes("add_slot_cutout")) {
    return {
      family: "slot",
      familyLabel: "Rasgo Oblongo (Estria)",
      fields: [
        {
          key: "slot_length",
          label: "Comprimento Total L",
          unit: "mm",
          kind: "number",
          min: 5,
          value: valNum("slot_length", 60),
        },
        {
          key: "slot_width",
          label: "Largura Rasgo W",
          unit: "mm",
          kind: "number",
          min: 2,
          value: valNum("slot_width", 16),
        },
        {
          key: "angle_deg",
          label: "Ângulo",
          unit: "°",
          kind: "number",
          value: valNum("angle_deg", 0),
        },
      ],
    };
  }

  // 7. Padrão de Furos / Modificação de Furação
  if (
    ops.includes("add_hole_pattern") ||
    ops.includes("modify_hole_pattern") ||
    v2Tools.includes("add_hole_pattern") ||
    typeof params.hole_diameter === "number"
  ) {
    return {
      family: "hole_pattern",
      familyLabel: "Padrão de Furação",
      fields: [
        {
          key: "hole_count",
          label: "Qtd. Furos (N)",
          kind: "number",
          min: 1,
          max: 100,
          value: valNum("hole_count", 4),
        },
        {
          key: "hole_diameter",
          label: "Diâmetro Ø",
          unit: "mm",
          kind: "number",
          min: 1,
          value: valNum("hole_diameter", 12),
        },
        {
          key: "margin",
          label: "Margem Borda",
          unit: "mm",
          kind: "number",
          min: 0,
          value: valNum("margin", 25),
        },
      ],
    };
  }

  // 8. Genérico: todos os parâmetros numéricos presentes no plano
  const genericFields: DynamicParamFieldSpec[] = Object.entries(params)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([k, v]) => ({
      key: k,
      label: k.replace(/_/g, " "),
      unit: "mm",
      kind: "number" as const,
      value: Number(v),
    }));

  return {
    family: "generic",
    familyLabel: "Parâmetros da Operação",
    fields: genericFields,
  };
}

// ============================================================================
// 3. PRÓXIMOS PASSOS SUGERIDOS (CHIPS CONTEXTUAIS — §4.6)
// ============================================================================

export interface SuggestedNextStepChip {
  id: string;
  label: string;
  promptOrCommand: string;
  kind: "prompt" | "slash";
}

export function buildSuggestedNextSteps(plan: ChamferIntentPlan): SuggestedNextStepChip[] {
  const { family } = buildDynamicParameterFields(plan);
  const hasHoles = Number(plan.parameters.hole_count ?? 0) > 0;
  const hasRadius = Number(plan.parameters.corner_radius ?? 0) > 0;

  const chips: SuggestedNextStepChip[] = [];

  if (family === "plate") {
    if (!hasRadius) {
      chips.push({
        id: "round-r15",
        label: "Arredondar cantos R15",
        promptOrCommand: "Arredonde os 4 cantos com raio 15 mm",
        kind: "prompt",
      });
    }
    if (hasHoles) {
      chips.push({
        id: "enlarge-holes",
        label: "Aumentar furos para Ø16",
        promptOrCommand: "Agora aumente esses furos para 16 mm",
        kind: "prompt",
      });
    } else {
      chips.push({
        id: "add-4-holes",
        label: "Adicionar 4 furos Ø12 nos cantos",
        promptOrCommand: "Adicione 4 furos de 12 mm a 25 mm das bordas",
        kind: "prompt",
      });
    }
  } else if (family === "flange") {
    chips.push({
      id: "flange-12-holes",
      label: "Alterar para 12 furos",
      promptOrCommand: "Altere o flange para 12 furos mantendo o PCD",
      kind: "prompt",
    });
  }

  chips.push(
    {
      id: "auto-dim",
      label: "Cotar automaticamente",
      promptOrCommand: "Cotar automaticamente todas as dimensões principais",
      kind: "prompt",
    },
    {
      id: "check-dfm",
      label: "Verificar fabricação laser",
      promptOrCommand: "Verificar fabricação a laser em chapa de 3 mm",
      kind: "prompt",
    },
    {
      id: "export-dxf",
      label: "Exportar DXF",
      promptOrCommand: "/exportar",
      kind: "slash",
    },
  );

  return chips.slice(0, 5);
}

// ============================================================================
// 4. COMANDOS RÁPIDOS DE BARRA (/ — §4.4)
// ============================================================================

export type SlashCommandId =
  | "/desfazer"
  | "/refazer"
  | "/limpar"
  | "/unidades"
  | "/exportar"
  | "/ajuda";

export interface SlashCommandSpec {
  command: SlashCommandId;
  title: string;
  description: string;
}

export const CHAMFER_SLASH_COMMANDS: SlashCommandSpec[] = [
  {
    command: "/desfazer",
    title: "Desfazer última operação",
    description: "Reverte o último commit no canvas e restaura a versão anterior da peça",
  },
  {
    command: "/refazer",
    title: "Refazer operação",
    description: "Avança para a próxima versão na linha do tempo da peça",
  },
  {
    command: "/limpar",
    title: "Limpar conversa atual",
    description: "Inicia uma nova conversa limpa mantendo o desenho atual no canvas",
  },
  {
    command: "/unidades",
    title: "Inspecionar / alternar unidades (mm)",
    description: "Exibe convenção métrica ativa (mm, graus, ponto decimal) do CHAMFER CAD",
  },
  {
    command: "/exportar",
    title: "Exportar peça / conversa (DXF / JSON)",
    description: "Abre a exportação técnica DXF ou baixa a especificação DSL/JSON da conversa",
  },
  {
    command: "/ajuda",
    title: "Guia rápido do CHAMFER INTENT 2.0",
    description: "Mostra exemplos de comandos de chaparia, furação ISO, dobras e caldeiraria",
  },
];

export function matchSlashCommands(input: string): SlashCommandSpec[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith("/")) return [];
  return CHAMFER_SLASH_COMMANDS.filter(
    (item) =>
      item.command.startsWith(trimmed) ||
      item.title.toLowerCase().includes(trimmed.slice(1)),
  );
}

// ============================================================================
// 5. OPERAÇÕES PURAS DE CONVERSA, VERSÕES E RAMIFICAÇÃO (BRANCHING)
// ============================================================================

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createConversationThread(
  projectId = "default-chamfer-project",
  title = "Nova Conversa CAD",
): ChamferConversationThread {
  const now = new Date().toISOString();
  return {
    id: makeId("conv"),
    projectId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    versions: [],
    activeVersionId: null,
    branches: [],
    autoApplyWhenValidated: false,
  };
}

export function appendUserAndAssistantTurn(
  thread: ChamferConversationThread,
  params: {
    userPrompt: string;
    attachedContext?: AttachedCanvasContextChip;
    assistantContent: string;
    plan?: ChamferIntentPlan;
    parameterOverrides?: Record<string, unknown>;
    committed?: boolean;
    entitiesAfterCommit?: Entity[];
    dimensionsAfterCommit?: Dimension[];
    partModelAfterCommit?: PartModel;
    branchParentMessageId?: string;
  },
): {
  updatedThread: ChamferConversationThread;
  userMessage: ChatMessageBubble;
  assistantMessage: ChatMessageBubble;
  createdVersion?: PartVersionSnapshot;
} {
  const now = new Date().toISOString();
  const userMessage: ChatMessageBubble = {
    id: makeId("msg-u"),
    role: "user",
    content: params.userPrompt.trim(),
    timestamp: now,
    attachedContext: params.attachedContext,
    branchParentMessageId: params.branchParentMessageId,
  };

  let createdVersion: PartVersionSnapshot | undefined;
  let nextVersions = [...thread.versions];
  let nextActiveVersionId = thread.activeVersionId;

  if (params.committed && params.entitiesAfterCommit) {
    const nextNum = nextVersions.length + 1;
    const versionId = `V${nextNum}`;
    createdVersion = {
      versionId,
      versionNumber: nextNum,
      label: params.plan?.intent.summary || params.userPrompt.slice(0, 48),
      timestamp: now,
      sourceMessageId: userMessage.id,
      prompt: params.userPrompt,
      entitiesSnapshot: structuredClone(params.entitiesAfterCommit),
      dimensionsSnapshot: structuredClone(params.dimensionsAfterCommit ?? []),
      partModelSnapshot: params.partModelAfterCommit
        ? structuredClone(params.partModelAfterCommit)
        : undefined,
      planSnapshot: params.plan ? structuredClone(params.plan) : undefined,
    };
    nextVersions.push(createdVersion);
    nextActiveVersionId = versionId;
  }

  const assistantMessage: ChatMessageBubble = {
    id: makeId("msg-a"),
    role: "assistant",
    content: params.assistantContent,
    timestamp: now,
    plan: params.plan ? structuredClone(params.plan) : undefined,
    parameterOverrides: params.parameterOverrides
      ? { ...params.parameterOverrides }
      : undefined,
    commitState: params.committed ? "committed" : "pending",
    committedVersionId: createdVersion?.versionId,
    suggestedNextSteps: params.plan ? buildSuggestedNextSteps(params.plan) : undefined,
  };

  // Atualiza título automático da conversa no 1º turno se ainda era genérico
  const isDefaultTitle =
    thread.title === "Nova Conversa CAD" || thread.title.startsWith("Conversa #");
  const nextTitle =
    isDefaultTitle && thread.messages.length === 0
      ? params.plan?.intent.summary?.slice(0, 52) || params.userPrompt.slice(0, 52)
      : thread.title;

  const updatedThread: ChamferConversationThread = {
    ...thread,
    title: nextTitle,
    updatedAt: now,
    messages: [...thread.messages, userMessage, assistantMessage],
    versions: nextVersions,
    activeVersionId: nextActiveVersionId,
  };

  return {
    updatedThread,
    userMessage,
    assistantMessage,
    createdVersion,
  };
}

/**
 * Marca o Cartão de Peça de uma mensagem existente como aplicado (committed) e
 * gera uma nova versão restaurável (`V1, V2, V3...`).
 */
export function commitMessageCardToVersion(
  thread: ChamferConversationThread,
  assistantMessageId: string,
  snapshot: {
    entities: Entity[];
    dimensions: Dimension[];
    partModel?: PartModel;
    plan: ChamferIntentPlan;
    parameterOverrides?: Record<string, unknown>;
  },
): {
  updatedThread: ChamferConversationThread;
  version: PartVersionSnapshot;
} {
  const now = new Date().toISOString();
  const nextNum = thread.versions.length + 1;
  const versionId = `V${nextNum}`;
  const msgIdx = thread.messages.findIndex((m) => m.id === assistantMessageId);
  const prevUserMsg =
    msgIdx > 0 && thread.messages[msgIdx - 1]?.role === "user"
      ? thread.messages[msgIdx - 1]
      : undefined;

  const version: PartVersionSnapshot = {
    versionId,
    versionNumber: nextNum,
    label: snapshot.plan.intent.summary,
    timestamp: now,
    sourceMessageId: prevUserMsg?.id ?? assistantMessageId,
    prompt: prevUserMsg?.content ?? snapshot.plan.intent.raw_prompt,
    entitiesSnapshot: structuredClone(snapshot.entities),
    dimensionsSnapshot: structuredClone(snapshot.dimensions),
    partModelSnapshot: snapshot.partModel ? structuredClone(snapshot.partModel) : undefined,
    planSnapshot: structuredClone(snapshot.plan),
  };

  const nextMessages = thread.messages.map((m) =>
    m.id === assistantMessageId
      ? {
          ...m,
          plan: structuredClone(snapshot.plan),
          parameterOverrides: snapshot.parameterOverrides
            ? { ...snapshot.parameterOverrides }
            : m.parameterOverrides,
          commitState: "committed" as const,
          committedVersionId: versionId,
        }
      : m,
  );

  return {
    version,
    updatedThread: {
      ...thread,
      updatedAt: now,
      messages: nextMessages,
      versions: [...thread.versions, version],
      activeVersionId: versionId,
    },
  };
}

/**
 * Edita uma mensagem anterior do usuário e cria uma ramificação (branch) da conversa
 * e das versões a partir daquele ponto (§4.2).
 */
export function branchConversationFromEditedUserMessage(
  thread: ChamferConversationThread,
  userMessageId: string,
): {
  updatedThread: ChamferConversationThread;
  restoredVersion: PartVersionSnapshot | null;
  discardedCommitCount: number;
} {
  const idx = thread.messages.findIndex((m) => m.id === userMessageId);
  if (idx === -1) {
    return {
      updatedThread: thread,
      restoredVersion: null,
      discardedCommitCount: 0,
    };
  }

  const keptMessages = thread.messages.slice(0, idx);
  const removedMessages = thread.messages.slice(idx);

  const removedVersionIds = new Set(
    removedMessages
      .map((m) => m.committedVersionId)
      .filter((id): id is string => Boolean(id)),
  );

  const keptVersions = thread.versions.filter((v) => !removedVersionIds.has(v.versionId));
  const discardedVersions = thread.versions.filter((v) => removedVersionIds.has(v.versionId));

  const archive: ConversationBranchArchive = {
    branchId: makeId("branch"),
    createdAt: new Date().toISOString(),
    forkedAtMessageId: userMessageId,
    messages: removedMessages,
    versions: discardedVersions,
  };

  const restoredVersion =
    keptVersions.length > 0 ? keptVersions[keptVersions.length - 1]! : null;

  return {
    updatedThread: {
      ...thread,
      updatedAt: new Date().toISOString(),
      messages: keptMessages,
      versions: keptVersions,
      activeVersionId: restoredVersion ? restoredVersion.versionId : null,
      branches: [...thread.branches, archive],
    },
    restoredVersion,
    discardedCommitCount: discardedVersions.length,
  };
}

/**
 * Restaura uma versão específica (`V1`, `V2`, `V3`...) em 1 clique (§4.1 / §4.2).
 */
export function restoreVersionFromThread(
  thread: ChamferConversationThread,
  versionId: string,
): {
  updatedThread: ChamferConversationThread;
  snapshot: PartVersionSnapshot | null;
} {
  const found = thread.versions.find((v) => v.versionId === versionId) ?? null;
  if (!found) {
    return { updatedThread: thread, snapshot: null };
  }
  return {
    updatedThread: {
      ...thread,
      updatedAt: new Date().toISOString(),
      activeVersionId: found.versionId,
    },
    snapshot: found,
  };
}

/**
 * Registra avaliação (👍 / 👎) em uma mensagem do assistente e salva no log local (§4.2).
 */
export function recordAssistantMessageFeedback(
  thread: ChamferConversationThread,
  assistantMessageId: string,
  rating: ChatFeedbackRating,
  reason?: ChatDownvoteReason,
): {
  updatedThread: ChamferConversationThread;
  entry: ChatFeedbackEntry | null;
} {
  const idx = thread.messages.findIndex((m) => m.id === assistantMessageId);
  if (idx === -1) return { updatedThread: thread, entry: null };

  const target = thread.messages[idx]!;
  const prevUser = idx > 0 ? thread.messages[idx - 1] : undefined;

  const entry: ChatFeedbackEntry = {
    messageId: assistantMessageId,
    conversationId: thread.id,
    prompt: prevUser?.content ?? target.plan?.intent.raw_prompt ?? "",
    rating,
    reason,
    timestamp: new Date().toISOString(),
    planSummary: target.plan?.intent.summary,
  };

  const nextMessages = thread.messages.map((m) =>
    m.id === assistantMessageId
      ? {
          ...m,
          feedback: { rating, reason },
        }
      : m,
  );

  saveFeedbackEntryToStorage(entry);

  return {
    updatedThread: {
      ...thread,
      updatedAt: entry.timestamp,
      messages: nextMessages,
    },
    entry,
  };
}

// ============================================================================
// 6. PERSISTÊNCIA EM INDEXEDDB + FALLBACK SÍNCRONO EM LOCALSTORAGE (§4.5)
// ============================================================================

const STORAGE_THREADS_KEY = "caldra_chamfer_intent_v2_threads";
const STORAGE_FEEDBACK_KEY = "caldra_chamfer_intent_v2_feedback_log";
const STORAGE_DRAFT_PREFIX = "caldra_chamfer_intent_v2_draft_";
const IDB_NAME = "caldra_chamfer_intent_v2_db";
const IDB_STORE_THREADS = "conversations";

const memoryThreadsFallback = new Map<string, ChamferConversationThread>();
const memoryFeedbackFallback: ChatFeedbackEntry[] = [];

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function writeThreadsToLocalCache(threads: ChamferConversationThread[]): void {
  for (const t of threads) {
    memoryThreadsFallback.set(t.id, t);
  }
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(threads));
  } catch {
    // Ignora quota exceeded no fallback secundário
  }
}

function readThreadsFromLocalCache(): ChamferConversationThread[] {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_THREADS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChamferConversationThread[];
        if (Array.isArray(parsed)) {
          for (const t of parsed) memoryThreadsFallback.set(t.id, t);
          return parsed;
        }
      }
    } catch {
      // fallback memory
    }
  }
  return Array.from(memoryThreadsFallback.values());
}

function syncThreadToIndexedDB(thread: ChamferConversationThread): void {
  if (typeof indexedDB === "undefined") return;
  try {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_THREADS)) {
        db.createObjectStore(IDB_STORE_THREADS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE_THREADS, "readwrite");
      tx.objectStore(IDB_STORE_THREADS).put(thread);
    };
  } catch {
    // fallback silencioso para localStorage/memory
  }
}

function deleteThreadFromIndexedDB(threadId: string): void {
  if (typeof indexedDB === "undefined") return;
  try {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_THREADS)) return;
      const tx = db.transaction(IDB_STORE_THREADS, "readwrite");
      tx.objectStore(IDB_STORE_THREADS).delete(threadId);
    };
  } catch {
    // ignore
  }
}

export function listProjectConversations(
  projectId = "default-chamfer-project",
  searchQuery = "",
): ChamferConversationThread[] {
  const all = readThreadsFromLocalCache().filter((t) => t.projectId === projectId);
  const q = searchQuery.trim().toLowerCase();
  const filtered = !q
    ? all
    : all.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.messages.some((m) => m.content.toLowerCase().includes(q)),
      );
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveConversationThread(thread: ChamferConversationThread): void {
  const all = readThreadsFromLocalCache();
  const idx = all.findIndex((t) => t.id === thread.id);
  if (idx >= 0) {
    all[idx] = thread;
  } else {
    all.push(thread);
  }
  writeThreadsToLocalCache(all);
  syncThreadToIndexedDB(thread);
}

export function renameConversationThread(
  threadId: string,
  newTitle: string,
): ChamferConversationThread | null {
  const all = readThreadsFromLocalCache();
  const idx = all.findIndex((t) => t.id === threadId);
  if (idx === -1) return null;
  const updated: ChamferConversationThread = {
    ...all[idx]!,
    title: newTitle.trim() || all[idx]!.title,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeThreadsToLocalCache(all);
  syncThreadToIndexedDB(updated);
  return updated;
}

export function deleteConversationThread(threadId: string): boolean {
  const all = readThreadsFromLocalCache();
  const next = all.filter((t) => t.id !== threadId);
  const existed = next.length !== all.length || memoryThreadsFallback.has(threadId);
  memoryThreadsFallback.delete(threadId);
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  deleteThreadFromIndexedDB(threadId);
  return existed;
}

export function exportConversationPayload(
  thread: ChamferConversationThread,
  format: "json" | "dsl" = "json",
): string {
  if (format === "dsl") {
    const dslTurns = thread.messages
      .filter((m) => m.role === "assistant" && m.plan)
      .map((m, i) => ({
        turn: i + 1,
        versionId: m.committedVersionId ?? null,
        summary: m.plan!.intent.summary,
        operations: m.plan!.operations,
        parameters: m.plan!.parameters,
        toolCalls: m.plan!.v2?.toolCalls ?? [],
        assumptions: m.plan!.v2?.assumptions ?? [],
      }));
    return JSON.stringify(
      {
        schema: "chamfer_intent_dsl_v2_export",
        conversationId: thread.id,
        title: thread.title,
        exportedAt: new Date().toISOString(),
        turns: dslTurns,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      schema: "chamfer_intent_conversation_v2",
      exportedAt: new Date().toISOString(),
      conversation: thread,
    },
    null,
    2,
  );
}

export function saveFeedbackEntryToStorage(entry: ChatFeedbackEntry): void {
  memoryFeedbackFallback.push(entry);
  if (!hasLocalStorage()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_FEEDBACK_KEY);
    const list: ChatFeedbackEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    window.localStorage.setItem(STORAGE_FEEDBACK_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    // ignore
  }
}

export function listSavedFeedbackEntries(): ChatFeedbackEntry[] {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_FEEDBACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatFeedbackEntry[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
  }
  return [...memoryFeedbackFallback];
}

export function saveComposerDraft(projectId: string, draft: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(`${STORAGE_DRAFT_PREFIX}${projectId}`, draft);
  } catch {
    // ignore
  }
}

export function loadComposerDraft(projectId: string): string {
  if (!hasLocalStorage()) return "";
  try {
    return window.localStorage.getItem(`${STORAGE_DRAFT_PREFIX}${projectId}`) ?? "";
  } catch {
    return "";
  }
}
