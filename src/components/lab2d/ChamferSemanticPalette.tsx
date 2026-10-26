/**
 * CALDRA — CHAMFER INTENT 2.0 (COMPILADOR GEOMÉTRICO PARAMÉTRICO E AGENTE CONVERSACIONAL)
 *
 * Implementação unificada de Apresentação em Tela Cheia, Tema Adaptável e Prévia CAD Profissional:
 *  - §0 Escopo isolado: preserva 100% da DSL v2.0, compilador, interpretador, Gemini, voz,
 *    histórico, versões (V1, V2...), gabaritos, variáveis globais e suíte Golden;
 *  - §2 Tela cheia em Portal (`position: fixed; inset: 0`), `height: var(--vvh, 100dvh)`,
 *    adaptação ao teclado virtual via `window.visualViewport` (`--vvh` e `--kbd`), modos
 *    responsivos COMPACTO (<640px), MÉDIO (640–1023px) e EXPANDIDO (≥1024px com divisor ajustável),
 *    e modo de Prévia em Tela Cheia com botão "Conversa" e composer mínimo;
 *  - §3 Cabeçalho técnico de 1 linha (~52px), faixa de status semântica expansível/copiável
 *    (oculta quando ocioso) e composer de largura total com fonte ≥ 16px e cor de destaque do tema;
 *  - §4 Tema adaptável em tempo real via `useIntentTheme` (zero hex fora do adaptador);
 *  - §6 Parâmetros extraídos agrupados por função, com ícones/cores/textos de estado e foco
 *    bidirecional entre entidade na prévia CAD e campo de parâmetro.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  X,
  AlertTriangle,
  HelpCircle,
  Code2,
  Sliders,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
  CheckCircle2,
  History,
  Send,
  Maximize2,
  Copy,
  Edit3,
  RefreshCw,
  Undo2,
  ThumbsUp,
  ThumbsDown,
  Square,
  MessageSquarePlus,
  FolderOpen,
  Trash2,
  Download,
  Search,
  GitBranch,
  Sparkles,
  Terminal,
  WifiOff,
  Mic,
  Volume2,
  Bookmark,
  Activity,
  Paperclip,
  Settings2,
  AtSign,
  Flag,
  Play,
  MessageSquare,
  GripHorizontal,
  Info,
} from "lucide-react";
import { triggerHaptic } from "@/lib/ui/haptics";
import { AudioManager } from "@/lib/audio/AudioManager";
import {
  type SemanticIntentPlan,
} from "@/lib/lab2d/cadSemanticIntent";
import {
  ChamferIntentInterpreter,
  type ChamferIntentPlan,
  type CornerSelector,
  type HoleDistributionMode,
  type ParametricSessionContext,
  type ChamferConversationThread,
  type ChatMessageBubble,
  type ChatDownvoteReason,
  type SlashCommandSpec,
  type VoiceMicState,
  type GoldenSuiteExecutionReport,
  type SavedIntentTemplate,
  type UserIntentPreferences,
  type AttachmentParseResult,
  type DynamicParameterField,
  createConversationThread,
  appendUserAndAssistantTurn,
  commitMessageCardToVersion,
  branchConversationFromEditedUserMessage,
  restoreVersionFromThread,
  recordAssistantMessageFeedback,
  buildDynamicParameterFields,
  matchSlashCommands,
  listProjectConversations,
  saveConversationThread,
  renameConversationThread,
  deleteConversationThread,
  exportConversationPayload,
  saveComposerDraft,
  loadComposerDraft,
  normalizePtBrVoiceTranscript,
  isWebSpeechRecognitionSupported,
  isMediaRecorderSupported,
  speakAssistantResponsePtBr,
  buildPartModelFromCanvas,
  getAvailableMentionSuggestions,
  detectActiveAtMentionQuery,
  insertAtMentionToken,
  recompileCardWithoutLLM,
  recordTurnObservabilityLog,
  listTurnObservabilityLogs,
  computeObservabilityMetricsSummary,
  runGoldenSuiteV2,
  saveMisinterpretedCaseToGoldenSuite,
  loadUserIntentPreferences,
  saveUserIntentPreferences,
  loadGlobalParametricVars,
  saveGlobalParametricVars,
  evaluateParametricExpression,
  listSavedIntentTemplates,
  saveIntentTemplate,
  deleteSavedIntentTemplate,
  parseDxfTextToIntentAttachment,
  parseSketchImageToIntentAttachment,
} from "@/lib/intent";
import type { Entity, Dimension, LayerId } from "@/lib/lab2d/core";
import type { QuickCommandItem } from "./ChamferQuickCommandModal";
import {
  ChamferLiveMiniViewport,
  evaluateLivePlateValidation,
} from "./ChamferLiveMiniViewport";
import {
  useIntentTheme,
  useVisualViewportState,
  buildIntentCssVariables,
  getTechnicalLayerColor,
} from "./useIntentTheme";
import { CaldraLogo } from "@/components/caldra/Logo";
import { toast } from "sonner";

interface ChamferSemanticPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: QuickCommandItem[];
  existingEntities: Entity[];
  existingDimensions?: Dimension[];
  selectedEntityIds?: string[];
  activeLayer: LayerId;
  projectId?: string;
  onExecutePlan: (plan: SemanticIntentPlan) => void;
  sessionContext?: ParametricSessionContext;
  onExecuteIntentPlan?: (plan: ChamferIntentPlan, options?: { keepOpen?: boolean }) => void;
  onPreviewIntentPlanChange?: (plan: ChamferIntentPlan | null) => void;
  onRestoreVersionSnapshot?: (entities: Entity[], dimensions: Dimension[]) => void;
  onTriggerUndo?: () => void;
  onTriggerRedo?: () => void;
  onTriggerExport?: () => void;
  onClearSelection?: () => void;
}

const QUICK_INITIAL_PROMPTS = [
  "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente",
  "Chapa 500 x 300 com quatro furos Ø12 a 25 mm das bordas",
  "Flange externo 400 interno 200 com PCD 320 e 8 furos de 18 mm",
  "Suporte 280 por 140 mm com rasgo oblongo",
  "Transição quadrado 400 para redondo 250 altura 300",
  "Tronco de cone base 500 topo 250 altura 350",
];

const QUICK_FOLLOWUP_PROMPTS = [
  "Agora aumente esses furos para 16 mm",
  "Adicione mais dois furos com o mesmo espaçamento",
  "Aumente a chapa para 600 mm de largura",
  "Arredonde somente os dois cantos esquerdos com raio 25",
  "Espelhe o conjunto em relação ao eixo vertical",
  "Desfaça a última alteração",
];

const DOWNVOTE_REASONS: ChatDownvoteReason[] = [
  "Posição errada",
  "Medida incorreta",
  "Padrão de furos",
  "Outro",
];

type CompactPreviewStop = "min" | "default" | "expanded";
const COMPACT_STOP_STORAGE_KEY = "chamfer_intent_compact_preview_stop_v1";

function classifyParameterGroup(key: string): string {
  if (
    key === "width" ||
    key === "height" ||
    key === "outer_diameter" ||
    key === "inner_diameter" ||
    key === "thickness" ||
    key === "base_diameter" ||
    key === "top_diameter"
  ) {
    return "Dimensões Principais";
  }
  if (key.includes("corner") || key.includes("radius") || key.includes("chamfer")) {
    return "Cantos, Raios e Chanfros";
  }
  if (key.includes("hole") || key === "margin" || key === "pcd" || key.includes("pitch")) {
    return "Furação, Margens e Passo";
  }
  return "Parâmetros da Operação";
}

export function ChamferSemanticPalette({
  open,
  onClose,
  commands,
  existingEntities,
  existingDimensions = [],
  selectedEntityIds = [],
  activeLayer,
  projectId = "default-chamfer-project",
  onExecutePlan,
  sessionContext,
  onExecuteIntentPlan,
  onPreviewIntentPlanChange,
  onRestoreVersionSnapshot,
  onTriggerUndo,
  onTriggerRedo,
  onTriggerExport,
  onClearSelection,
}: ChamferSemanticPaletteProps) {
  const { tokens } = useIntentTheme();
  const viewportState = useVisualViewportState(open);

  // Estado do Composer e rascunho persistido por projeto
  const [query, setQuery] = useState("");
  const [parameterOverrides, setParameterOverrides] = useState<Record<string, unknown>>({});
  const [manualEditNotes, setManualEditNotes] = useState<string[]>([]);
  const [customPcdInput, setCustomPcdInput] = useState<string>("160");
  const [showDslInspector, setShowDslInspector] = useState(false);
  const [showCadOpsInspector, setShowCadOpsInspector] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMinimizedToSheet, setIsMinimizedToSheet] = useState(false);
  const [isPeekingCanvas, setIsPeekingCanvas] = useState(false);

  // Novos estados de layout responsivo, faixa de status, foco bidirecional e confirmação ao fechar (§2, §3, §6)
  const [compactPreviewStop, setCompactPreviewStop] = useState<CompactPreviewStop>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(COMPACT_STOP_STORAGE_KEY);
      if (saved === "min" || saved === "default" || saved === "expanded") return saved;
    }
    return "default";
  });
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [expandedLeftSplitPercent, setExpandedLeftSplitPercent] = useState(40);
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);
  const [focusedParamKey, setFocusedParamKey] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Estado da Conversa, Histórico, Gaveta de Conversas, Streaming e Edição de Mensagem (§4)
  const [thread, setThread] = useState<ChamferConversationThread>(() => {
    const existing = listProjectConversations(projectId);
    return existing[0] ?? createConversationThread(projectId, "Conversa #1");
  });
  const [activeTopDrawer, setActiveTopDrawer] = useState<
    "none" | "conversations" | "templates_vars_prefs" | "golden_observability"
  >("none");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameTitleDraft, setRenameTitleDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState("");
  const [openDownvoteMessageId, setOpenDownvoteMessageId] = useState<string | null>(null);
  const [expandedMessageDslId, setExpandedMessageDslId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStageLabel, setStreamingStageLabel] = useState<string | null>(null);
  const [networkErrorBanner, setNetworkErrorBanner] = useState<string | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [includeSelectionContext, setIncludeSelectionContext] = useState(true);

  // Fase 4 (§5): Estado do Microfone (inactive · listening · processing) + Nível de Áudio + Transcrição Parcial
  const [micState, setMicState] = useState<VoiceMicState>("inactive");
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  // Fase 6 (§10): Estado da Suíte Golden + Observabilidade
  const [goldenReport, setGoldenReport] = useState<GoldenSuiteExecutionReport | null>(null);
  const [obsRevision, setObsRevision] = useState(0);

  // Fase 7: Gabaritos, Variáveis Globais, Preferências do Usuário e Anexo (Croqui/Foto/DXF)
  const [userPrefs, setUserPrefs] = useState<UserIntentPreferences>(() =>
    loadUserIntentPreferences(),
  );
  const [globalVars, setGlobalVars] = useState<Record<string, number>>(() =>
    loadGlobalParametricVars(),
  );
  const [newVarName, setNewVarName] = useState("");
  const [newVarValue, setNewVarValue] = useState("");
  const [savedTemplates, setSavedTemplates] = useState<SavedIntentTemplate[]>(() =>
    listSavedIntentTemplates(),
  );
  const [attachedFileSummary, setAttachedFileSummary] = useState<AttachmentParseResult | null>(
    null,
  );

  const rootDialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const paramInputRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);
  const splitterDragRef = useRef<boolean>(false);

  const hasActivePart = Boolean(sessionContext?.activeFeature) || thread.versions.length > 0;

  // Constrói o PartModel compacto atual para referências `@` e contexto do agente (§7)
  const currentPartModel = useMemo(() => {
    return buildPartModelFromCanvas({
      entities: existingEntities,
      dimensions: existingDimensions,
      selectedEntityIds,
      units: userPrefs.defaultUnit,
      thickness: userPrefs.defaultThicknessMm,
      vars: globalVars,
    });
  }, [
    existingEntities,
    existingDimensions,
    selectedEntityIds,
    userPrefs.defaultUnit,
    userPrefs.defaultThicknessMm,
    globalVars,
  ]);

  // Fase 5: Detecção de menção `@` no composer (@plate_1, @holes_1, @selecionado)
  const activeAtMention = useMemo(() => {
    return detectActiveAtMentionQuery(query);
  }, [query]);

  const mentionSuggestions = useMemo(() => {
    if (!activeAtMention.active) return [];
    return getAvailableMentionSuggestions(currentPartModel, activeAtMention.query);
  }, [activeAtMention, currentPartModel]);

  // Fase 4 (§5): Motor de Voz (Web Speech API pt-BR + Fallback MediaRecorder)
  const stopVoiceCapture = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioLevelIntervalRef.current) {
      window.clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    try {
      speechRecRef.current?.stop();
    } catch {
      // ignore
    }
    speechRecRef.current = null;
    setAudioLevel(0);
    setVoiceInterimTranscript("");
    setMicState("inactive");
  }, []);

  // Carrega rascunho e conversa ativa ao abrir; trava rolagem de fundo (§2)
  useEffect(() => {
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const savedDraft = loadComposerDraft(projectId);
      setQuery(savedDraft);
      setParameterOverrides({});
      setSelectedIndex(0);
      setIsMinimizedToSheet(false);
      setIsPeekingCanvas(false);
      setShowCloseConfirm(false);
      setIncludeSelectionContext(true);
      setNetworkErrorBanner(null);
      setUserPrefs(loadUserIntentPreferences());
      setGlobalVars(loadGlobalParametricVars());
      setSavedTemplates(listSavedIntentTemplates());
      const list = listProjectConversations(projectId);
      if (list.length > 0) {
        setThread(list[0]!);
      }
      setTimeout(() => textareaRef.current?.focus(), 80);

      return () => {
        document.body.style.overflow = prevOverflow;
      };
    } else {
      onPreviewIntentPlanChange?.(null);
      stopVoiceCapture();
    }
  }, [open, projectId, onPreviewIntentPlanChange, stopVoiceCapture]);

  // Persiste rascunho no projeto e ajusta altura do textarea (1 a 5 linhas)
  useEffect(() => {
    if (!open) return;
    saveComposerDraft(projectId, query);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      const nextHeight = Math.min(116, Math.max(38, el.scrollHeight));
      el.style.height = `${nextHeight}px`;
    }
  }, [query, open, projectId]);

  // Comandos rápidos de barra (/desfazer, /refazer, /limpar, /unidades, /exportar, /ajuda)
  const matchingSlashCommands = useMemo<SlashCommandSpec[]>(() => {
    return matchSlashCommands(query);
  }, [query]);

  // Compila o plano paramétrico sempre que o prompt ou overrides mudarem (0ms local)
  const activeIntentPlan = useMemo<ChamferIntentPlan | null>(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.startsWith("/")) return null;
    return ChamferIntentInterpreter.compilePrompt(trimmed, {
      existingEntities,
      selectedEntityIds: includeSelectionContext ? selectedEntityIds : [],
      activeLayer,
      session: sessionContext,
      parameterOverrides,
      partModel: currentPartModel,
    });
  }, [
    query,
    existingEntities,
    selectedEntityIds,
    includeSelectionContext,
    activeLayer,
    sessionContext,
    parameterOverrides,
    currentPartModel,
  ]);

  // Plano exibido na prévia: usa o rascunho ativo ou o último turno da conversa (ou peça ativa da sessão)
  const latestCommittedOrTurnPlan = useMemo<ChamferIntentPlan | null>(() => {
    if (activeIntentPlan) return activeIntentPlan;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const m = thread.messages[i];
      if (m?.plan) return m.plan;
    }
    return null;
  }, [activeIntentPlan, thread.messages]);

  const previewSourcePlan = activeIntentPlan ?? latestCommittedOrTurnPlan;

  // Detecta se o plano ativo é uma chapa paramétrica (possui W e H)
  const isPlatePlan = Boolean(
    previewSourcePlan &&
      typeof previewSourcePlan.parameters.width === "number" &&
      typeof previewSourcePlan.parameters.height === "number",
  );

  // Parâmetros numéricos em tempo real acoplados aos inputs editáveis
  const liveWidth = Number(
    parameterOverrides.width ??
      previewSourcePlan?.parameters.width ??
      sessionContext?.activeFeature?.width ??
      400,
  );
  const liveHeight = Number(
    parameterOverrides.height ??
      previewSourcePlan?.parameters.height ??
      sessionContext?.activeFeature?.height ??
      250,
  );
  const liveCornerRadius = Number(
    parameterOverrides.corner_radius ??
      previewSourcePlan?.parameters.corner_radius ??
      sessionContext?.activeFeature?.cornerRadius ??
      20,
  );
  const liveCornerSelector = (parameterOverrides.corner_selector ??
    previewSourcePlan?.parameters.corner_selector ??
    sessionContext?.activeFeature?.cornerSelector ??
    "all") as CornerSelector;
  const liveHoleCount = Number(
    parameterOverrides.hole_count ??
      previewSourcePlan?.parameters.hole_count ??
      sessionContext?.activeFeature?.holeCount ??
      5,
  );
  const liveHoleDiameter = Number(
    parameterOverrides.hole_diameter ??
      previewSourcePlan?.parameters.hole_diameter ??
      sessionContext?.activeFeature?.holeDiameter ??
      12,
  );
  const liveMargin = Number(
    parameterOverrides.margin ??
      previewSourcePlan?.parameters.margin ??
      sessionContext?.activeFeature?.margin ??
      25,
  );
  const liveHoleDistribution = (parameterOverrides.hole_distribution ??
    previewSourcePlan?.parameters.hole_distribution ??
    sessionContext?.activeFeature?.holeDistribution ??
    "linear_centerline_x") as HoleDistributionMode;
  const livePcd =
    typeof (parameterOverrides.pcd ?? previewSourcePlan?.parameters.pcd) === "number"
      ? Number(parameterOverrides.pcd ?? previewSourcePlan?.parameters.pcd)
      : undefined;

  // Validação geométrica em tempo real
  const livePlateValidation = useMemo(() => {
    return evaluateLivePlateValidation({
      width: liveWidth,
      height: liveHeight,
      cornerRadius: liveCornerRadius,
      cornerSelector: liveCornerSelector,
      holeCount: liveHoleCount,
      holeDiameter: liveHoleDiameter,
      margin: liveMargin,
    });
  }, [
    liveWidth,
    liveHeight,
    liveCornerRadius,
    liveCornerSelector,
    liveHoleCount,
    liveHoleDiameter,
    liveMargin,
  ]);

  // Campos dinâmicos do formulário de parâmetros (§4.2 & §6)
  const dynamicFormSpec = useMemo(() => {
    if (!previewSourcePlan) return null;
    return buildDynamicParameterFields(previewSourcePlan, parameterOverrides, {
      isRadiusError: livePlateValidation.isRadiusError,
      isMarginError: livePlateValidation.isMarginError,
      isPitchCollision: livePlateValidation.isPitchCollision,
    });
  }, [previewSourcePlan, parameterOverrides, livePlateValidation]);

  // Agrupamento funcional dos campos dinâmicos (§6)
  const groupedParameterFields = useMemo(() => {
    if (!dynamicFormSpec || dynamicFormSpec.fields.length === 0) return [];
    const groupsMap = new Map<string, DynamicParameterField[]>();
    for (const field of dynamicFormSpec.fields) {
      const groupTitle = classifyParameterGroup(field.key);
      const list = groupsMap.get(groupTitle) ?? [];
      list.push(field);
      groupsMap.set(groupTitle, list);
    }
    return Array.from(groupsMap.entries()).map(([groupTitle, fields]) => ({
      groupTitle,
      fields,
    }));
  }, [dynamicFormSpec]);

  const hasGeometricError = isPlatePlan
    ? !livePlateValidation.isValid || activeIntentPlan?.validation.status === "invalid"
    : activeIntentPlan?.validation.status === "invalid";

  const canApplyPlan = Boolean(
    activeIntentPlan &&
      !hasGeometricError &&
      (isPlatePlan ? livePlateValidation.isValid : activeIntentPlan.validation.status === "valid"),
  );

  // Sincroniza pré-visualização viva no canvas principal do CHAMFER via rAF
  useEffect(() => {
    if (!open || !onPreviewIntentPlanChange) return;
    const rafId = window.requestAnimationFrame(() => {
      onPreviewIntentPlanChange(activeIntentPlan);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open, activeIntentPlan, onPreviewIntentPlanChange]);

  // Fechar com confirmação quando há plano pendente não aplicado (§2)
  const handleRequestClose = useCallback(() => {
    if (activeIntentPlan && query.trim().length > 0 && !showCloseConfirm) {
      setShowCloseConfirm(true);
      return;
    }
    setShowCloseConfirm(false);
    onClose();
  }, [activeIntentPlan, query, showCloseConfirm, onClose]);

  // Tecla Esc no desktop e foco preso dentro do diálogo modal (§2)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isFullscreenPreview) {
          setIsFullscreenPreview(false);
          return;
        }
        handleRequestClose();
      } else if (e.key === "Tab" && rootDialogRef.current) {
        const focusable = rootDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isFullscreenPreview, handleRequestClose]);

  // Divisor vertical ajustável no modo EXPANDIDO (≥ 1024 px — §2)
  useEffect(() => {
    if (!open) return;
    const handlePointerMove = (e: PointerEvent) => {
      if (!splitterDragRef.current) return;
      const pct = (e.clientX / Math.max(1, window.innerWidth)) * 100;
      setExpandedLeftSplitPercent(Math.min(54, Math.max(30, Math.round(pct))));
    };
    const handlePointerUp = () => {
      splitterDragRef.current = false;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [open]);

  // Filtra comandos rápidos tradicionais quando o usuário digita termos curtos de ferramenta
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.startsWith("/")) return commands.slice(0, 4);
    return commands
      .filter((cmd) => {
        if (cmd.title.toLowerCase().includes(q)) return true;
        if (cmd.description.toLowerCase().includes(q)) return true;
        return cmd.keywords.some((k) => k.toLowerCase().includes(q));
      })
      .slice(0, 4);
  }, [query, commands]);

  const persistAndSetThread = useCallback((nextThread: ChamferConversationThread) => {
    setThread(nextThread);
    saveConversationThread(nextThread);
  }, []);

  const startVoiceCapture = useCallback(() => {
    triggerHaptic("selection");
    setVoiceInterimTranscript("");

    if (isWebSpeechRecognitionSupported()) {
      const w = window as unknown as Record<
        string,
        new () => {
          lang: string;
          continuous: boolean;
          interimResults: boolean;
          onresult:
            | ((ev: {
                results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
              }) => void)
            | null;
          onerror: ((ev: { error?: string }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        }
      >;
      const SpeechRecCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SpeechRecCtor) return;

      const rec = new SpeechRecCtor();
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;

      setMicState("listening");
      audioLevelIntervalRef.current = window.setInterval(() => {
        setAudioLevel(Math.floor(25 + Math.random() * 65));
      }, 140);

      const resetSilenceTimer = (latestText: string) => {
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
        }
        // Fim automático após ~1,5 s de silêncio (§5 & §7: transcrição editável, não envia auto por padrão)
        silenceTimerRef.current = window.setTimeout(() => {
          setMicState("processing");
          try {
            rec.stop();
          } catch {
            // ignore
          }
          const normalized = normalizePtBrVoiceTranscript(latestText);
          if (normalized) {
            setQuery(normalized);
            setParameterOverrides({});
          }
          stopVoiceCapture();
        }, 1500);
      };

      rec.onresult = (ev) => {
        let combined = "";
        for (let i = 0; i < ev.results.length; i++) {
          const item = ev.results[i];
          if (item && item[0]) {
            combined += `${item[0].transcript} `;
          }
        }
        const normalizedPreview = normalizePtBrVoiceTranscript(combined);
        setVoiceInterimTranscript(normalizedPreview);
        setQuery(normalizedPreview);
        resetSilenceTimer(combined);
      };

      rec.onerror = (ev) => {
        stopVoiceCapture();
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          toast.error("Permissão de microfone negada. Verifique as permissões do navegador.");
        } else {
          toast.info("Reconhecimento de voz encerrado. Você pode digitar normalmente.");
        }
      };

      rec.onend = () => {
        stopVoiceCapture();
      };

      try {
        rec.start();
        speechRecRef.current = rec;
        resetSilenceTimer("");
      } catch {
        stopVoiceCapture();
        toast.error("Não foi possível iniciar o microfone neste dispositivo.");
      }
      return;
    }

    if (isMediaRecorderSupported()) {
      toast.info(
        "Web Speech API indisponível neste navegador: ativando fallback MediaRecorder multimodal.",
      );
      setMicState("listening");
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const recorder = new MediaRecorder(stream);
          recorder.start();
          speechRecRef.current = {
            stop: () => {
              if (recorder.state !== "inactive") recorder.stop();
              stream.getTracks().forEach((t) => t.stop());
            },
          };
          silenceTimerRef.current = window.setTimeout(() => {
            stopVoiceCapture();
            toast.info("Áudio capturado. Confirme ou edite as medidas no campo abaixo.");
          }, 3000);
        })
        .catch(() => {
          stopVoiceCapture();
          toast.error("Microfone indisponível ou permissão negada.");
        });
      return;
    }

    toast.error("Reconhecimento de voz não suportado neste navegador.");
  }, [stopVoiceCapture]);

  const handleToggleVoiceMic = () => {
    if (micState === "inactive") {
      startVoiceCapture();
    } else {
      stopVoiceCapture();
    }
  };

  // =========================================================================
  // FASE 5: EDIÇÃO DE PARÂMETROS NO CARTÃO SEM CHAMAR O LLM (§3 item 7 & §6)
  // =========================================================================
  const handleSelectCommand = (cmd: QuickCommandItem) => {
    triggerHaptic("selection");
    AudioManager.play("ui_select");
    onPreviewIntentPlanChange?.(null);
    onClose();
    cmd.action();
  };

  const handleApplyAmbiguityPatch = (patch: Record<string, unknown>) => {
    triggerHaptic("selection");
    if (typeof patch.preset_prompt === "string") {
      setQuery(patch.preset_prompt);
      setParameterOverrides({});
      return;
    }
    setParameterOverrides((prev) => ({ ...prev, ...patch }));
  };

  const handleParamChange = (key: string, val: number | string) => {
    const resolvedVal =
      typeof val === "string" && key !== "corner_selector"
        ? (evaluateParametricExpression(val, globalVars) ?? Number(val))
        : val;

    if (previewSourcePlan) {
      const oldVal = parameterOverrides[key] ?? previewSourcePlan.parameters[key] ?? 0;
      const recompiled = recompileCardWithoutLLM({
        previousPlan: previewSourcePlan,
        changedKey: key,
        oldValue: oldVal,
        newValue: resolvedVal,
        currentOverrides: parameterOverrides,
        existingEntities,
        selectedEntityIds: includeSelectionContext ? selectedEntityIds : [],
        activeLayer,
        sessionContext,
      });
      setManualEditNotes((prev) => [...prev.slice(-15), recompiled.manualEditContextNote]);
    }

    setParameterOverrides((prev) => {
      const next: Record<string, unknown> = { ...prev, [key]: resolvedVal };
      if (isPlatePlan && !next.hole_distribution) {
        next.hole_distribution = liveHoleDistribution || "linear_centerline_x";
        next.linear_formula = "margin_plus_equal_pitch";
        next.margin = key === "margin" ? resolvedVal : liveMargin;
      }
      return next;
    });
  };

  // Foco bidirecional: tocar numa entidade na prévia CAD foca o input do parâmetro (§5.6 & §6)
  const handleSelectEntityParamFromViewport = useCallback((paramKey: string) => {
    setFocusedParamKey(paramKey);
    const inputEl = paramInputRefs.current[paramKey];
    if (inputEl) {
      inputEl.focus();
      inputEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  // Alterna altura da prévia no modo COMPACTO (< 640 px) e lembra no localStorage (§2)
  const cycleCompactPreviewStop = () => {
    setCompactPreviewStop((prev) => {
      const next: CompactPreviewStop =
        prev === "default" ? "expanded" : prev === "expanded" ? "min" : "default";
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(COMPACT_STOP_STORAGE_KEY, next);
      }
      return next;
    });
  };

  const buildReadyPlanForCommit = useCallback(
    (sourcePlan: ChamferIntentPlan, sourcePrompt: string, overrides: Record<string, unknown>) => {
      let planToCommit = sourcePlan;
      const isPlate =
        typeof sourcePlan.parameters.width === "number" &&
        typeof sourcePlan.parameters.height === "number";

      if (isPlate && planToCommit.validation.status !== "valid") {
        planToCommit = ChamferIntentInterpreter.compilePrompt(sourcePrompt, {
          existingEntities,
          selectedEntityIds: includeSelectionContext ? selectedEntityIds : [],
          activeLayer,
          session: sessionContext,
          parameterOverrides: {
            width: liveWidth,
            height: liveHeight,
            corner_radius: liveCornerRadius,
            corner_selector: liveCornerSelector,
            hole_count: liveHoleCount,
            hole_diameter: liveHoleDiameter,
            margin: liveMargin,
            hole_distribution: liveHoleDistribution || "linear_centerline_x",
            linear_formula: "margin_plus_equal_pitch",
            ...(livePcd ? { pcd: livePcd } : {}),
            ...overrides,
          },
        });
      }

      const readyPlan: ChamferIntentPlan =
        planToCommit.validation.status === "valid"
          ? planToCommit
          : {
              ...planToCommit,
              unresolved: [],
              validation: {
                ...planToCommit.validation,
                status: "valid",
              },
            };
      return readyPlan;
    },
    [
      existingEntities,
      includeSelectionContext,
      selectedEntityIds,
      activeLayer,
      sessionContext,
      liveWidth,
      liveHeight,
      liveCornerRadius,
      liveCornerSelector,
      liveHoleCount,
      liveHoleDiameter,
      liveMargin,
      liveHoleDistribution,
      livePcd,
    ],
  );

  // Executa comando de barra (/desfazer, /refazer, /limpar, /unidades, /exportar, /ajuda)
  const handleExecuteSlashCommand = (cmd: SlashCommandSpec["command"]) => {
    triggerHaptic("selection");
    setQuery("");
    saveComposerDraft(projectId, "");

    switch (cmd) {
      case "/desfazer": {
        if (thread.versions.length > 1) {
          const prevVersion = thread.versions[thread.versions.length - 2]!;
          const { updatedThread, snapshot } = restoreVersionFromThread(
            thread,
            prevVersion.versionId,
          );
          persistAndSetThread(updatedThread);
          if (snapshot && onRestoreVersionSnapshot) {
            onRestoreVersionSnapshot(snapshot.entitiesSnapshot, snapshot.dimensionsSnapshot);
          } else {
            onTriggerUndo?.();
          }
          toast.success(`Restaurada versão ${prevVersion.versionId}.`);
        } else {
          onTriggerUndo?.();
          toast.info("Última operação desfeita.");
        }
        return;
      }
      case "/refazer": {
        if (thread.activeVersionId && thread.versions.length > 0) {
          const idx = thread.versions.findIndex((v) => v.versionId === thread.activeVersionId);
          if (idx >= 0 && idx < thread.versions.length - 1) {
            const nextVer = thread.versions[idx + 1]!;
            const { updatedThread, snapshot } = restoreVersionFromThread(
              thread,
              nextVer.versionId,
            );
            persistAndSetThread(updatedThread);
            if (snapshot && onRestoreVersionSnapshot) {
              onRestoreVersionSnapshot(snapshot.entitiesSnapshot, snapshot.dimensionsSnapshot);
            }
            toast.success(`Avançado para versão ${nextVer.versionId}.`);
            return;
          }
        }
        onTriggerRedo?.();
        return;
      }
      case "/limpar": {
        const fresh = createConversationThread(
          projectId,
          `Conversa #${listProjectConversations(projectId).length + 1}`,
        );
        persistAndSetThread(fresh);
        setParameterOverrides({});
        toast.success("Nova conversa iniciada (desenho do canvas preservado).");
        return;
      }
      case "/unidades": {
        toast.info(
          `Sistema Métrico Industrial Ativo: Unidade padrão ${userPrefs.defaultUnit} · Material ${userPrefs.defaultMaterial} (${userPrefs.defaultThicknessMm} mm).`,
        );
        return;
      }
      case "/exportar": {
        if (onTriggerExport) {
          onClose();
          onTriggerExport();
        } else {
          handleExportConversation("json");
        }
        return;
      }
      case "/ajuda": {
        const helpTurn = appendUserAndAssistantTurn(thread, {
          userPrompt: "/ajuda",
          assistantContent:
            "Comandos suportados no CHAMFER INTENT 2.0:\n• Chapas: 'Chapa 500x300 com 4 furos Ø12 a 25 mm das bordas'\n• Furação ISO: '6 furos para parafuso M12 passante divididos igualmente'\n• Flanges: 'Flange OD 400 ID 200 PCD 320 com 8 furos Ø18'\n• Caldeiraria: 'Tronco de cone base 500 topo 250 altura 350'\n• Referências: digite @ para citar @plate_1, @holes_1 ou @selecionado.",
          committed: false,
        });
        persistAndSetThread(helpTurn.updatedThread);
        return;
      }
    }
  };

  // Envia prompt para a conversa + registra telemetria de observabilidade (Fase 6) + TTS opcional (Fase 4/7)
  const handleSendTurn = async (options?: {
    overridePrompt?: string;
    forceCommit?: boolean;
    keepModalOpen?: boolean;
    branchParentMessageId?: string;
  }) => {
    const promptText = (options?.overridePrompt ?? query).trim();
    if (!promptText) return;

    if (promptText.startsWith("/")) {
      const matched = matchSlashCommands(promptText);
      if (matched.length > 0) {
        handleExecuteSlashCommand(matched[0]!.command);
        return;
      }
    }

    setNetworkErrorBanner(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setStreamingStageLabel("Entendendo → Planejando → Compilando → Validando");

    const t0 = performance.now();

    try {
      const currentPlan =
        options?.overridePrompt && options.overridePrompt !== query
          ? ChamferIntentInterpreter.compilePrompt(promptText, {
              existingEntities,
              selectedEntityIds: includeSelectionContext ? selectedEntityIds : [],
              activeLayer,
              session: sessionContext,
              parameterOverrides,
              partModel: currentPartModel,
            })
          : activeIntentPlan ??
            ChamferIntentInterpreter.compilePrompt(promptText, {
              existingEntities,
              selectedEntityIds: includeSelectionContext ? selectedEntityIds : [],
              activeLayer,
              session: sessionContext,
              parameterOverrides,
              partModel: currentPartModel,
            });

      const tCompiled = performance.now();

      if (controller.signal.aborted) {
        setIsStreaming(false);
        setStreamingStageLabel(null);
        return;
      }

      const shouldCommitNow = Boolean(
        options?.forceCommit || (thread.autoApplyWhenValidated && canApplyPlan),
      );

      let committedEntitiesSnapshot: Entity[] | undefined;
      let committedDimsSnapshot: Dimension[] | undefined;
      let finalPlan = currentPlan;

      if (shouldCommitNow && currentPlan && !hasGeometricError) {
        finalPlan = buildReadyPlanForCommit(currentPlan, promptText, parameterOverrides);
        const previewEnts = finalPlan.compiled?.previewEntities ?? [];
        const previewDims = finalPlan.compiled?.generatedDimensions ?? [];
        committedEntitiesSnapshot = [...existingEntities, ...previewEnts];
        committedDimsSnapshot = [...existingDimensions, ...previewDims];

        triggerHaptic("success");
        AudioManager.play("cad_core_init");

        if (onExecuteIntentPlan) {
          onExecuteIntentPlan(finalPlan, { keepOpen: options?.keepModalOpen ?? true });
        } else if (finalPlan.compiled) {
          onExecutePlan({
            id: finalPlan.plan_id,
            title: finalPlan.intent.summary,
            intentSummary: finalPlan.response_summary,
            description: finalPlan.response_summary,
            generatedEntities: finalPlan.compiled.previewEntities,
            generatedDimensions: finalPlan.compiled.generatedDimensions,
            targetAction: finalPlan.intent.category === "modify" ? "modify" : "create",
            suggestedViewport: finalPlan.compiled.suggestedViewport,
          });
        }
      }

      const attachedContext = {
        selectedCount: includeSelectionContext ? selectedEntityIds.length : 0,
        selectedSummary:
          includeSelectionContext && selectedEntityIds.length > 0
            ? `${selectedEntityIds.length} entidade(s) selecionada(s)`
            : "Sem seleção",
        selectedEntityIds: includeSelectionContext ? [...selectedEntityIds] : [],
        versionId: thread.activeVersionId ?? "V0",
        activeLayer: String(activeLayer),
      };

      const assistantReplyText =
        finalPlan?.v2?.understandingText ||
        finalPlan?.response_summary ||
        "Operação compilada.";

      const { updatedThread, assistantMessage } = appendUserAndAssistantTurn(thread, {
        userPrompt: promptText,
        attachedContext,
        assistantContent: assistantReplyText,
        plan: finalPlan ?? undefined,
        parameterOverrides,
        committed: shouldCommitNow,
        entitiesAfterCommit: committedEntitiesSnapshot,
        dimensionsAfterCommit: committedDimsSnapshot,
        partModelAfterCommit: finalPlan?.v2?.partModelAfter,
        branchParentMessageId: options?.branchParentMessageId,
      });

      // Fase 6 (§10): Grava log de observabilidade do turno
      recordTurnObservabilityLog({
        turnId: assistantMessage.id,
        timestamp: assistantMessage.timestamp,
        rawInput: promptText,
        normalizedInput: normalizePtBrVoiceTranscript(promptText),
        assumptions: finalPlan?.v2?.assumptions ?? [],
        toolCallNames: finalPlan?.v2?.toolCalls.map((tc) => tc.name) ?? [],
        validationStatus: finalPlan?.validation.status ?? "valid",
        validationErrors: finalPlan?.validation.issues.map((i) => i.message) ?? [],
        dfmWarnings:
          finalPlan?.v2?.manufacturingReport.warnings.map((w) => w.message) ?? [],
        understandingTimeMs: Number(Math.max(0.2, (tCompiled - t0) * 0.4).toFixed(2)),
        compilationTimeMs: Number(Math.max(0.5, tCompiled - t0).toFixed(2)),
      });
      setObsRevision((r) => r + 1);

      if (userPrefs.ttsEnabled) {
        speakAssistantResponsePtBr(assistantReplyText, true);
      }

      persistAndSetThread(updatedThread);
      setQuery("");
      saveComposerDraft(projectId, "");
      setParameterOverrides({});
      setAttachedFileSummary(null);
      setShowCloseConfirm(false);
      onPreviewIntentPlanChange?.(null);

      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 40);

      if (shouldCommitNow && options?.keepModalOpen === false) {
        onClose();
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setIsOfflineFallback(true);
        setNetworkErrorBanner(
          "Falha temporária de conexão com o modelo. Você pode tentar de novo preservando seu comando ou aplicar pelo compilador determinístico local.",
        );
      }
    } finally {
      setIsStreaming(false);
      setStreamingStageLabel(null);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setStreamingStageLabel(null);
    toast.info("Geração interrompida pelo usuário.");
  };

  const handleConfirmPlan = (keepModalOpen = false) => {
    if (!activeIntentPlan || !canApplyPlan) {
      triggerHaptic("error");
      return;
    }
    void handleSendTurn({
      forceCommit: true,
      keepModalOpen,
    });
  };

  const handleApplyHistoryCard = (msg: ChatMessageBubble) => {
    if (!msg.plan) return;
    const readyPlan = buildReadyPlanForCommit(
      msg.plan,
      msg.plan.intent.raw_prompt,
      msg.parameterOverrides ?? {},
    );
    triggerHaptic("success");
    AudioManager.play("cad_core_init");

    if (onExecuteIntentPlan) {
      onExecuteIntentPlan(readyPlan, { keepOpen: true });
    } else if (readyPlan.compiled) {
      onExecutePlan({
        id: readyPlan.plan_id,
        title: readyPlan.intent.summary,
        intentSummary: readyPlan.response_summary,
        description: readyPlan.response_summary,
        generatedEntities: readyPlan.compiled.previewEntities,
        generatedDimensions: readyPlan.compiled.generatedDimensions,
        targetAction: readyPlan.intent.category === "modify" ? "modify" : "create",
        suggestedViewport: readyPlan.compiled.suggestedViewport,
      });
    }

    const previewEnts = readyPlan.compiled?.previewEntities ?? [];
    const previewDims = readyPlan.compiled?.generatedDimensions ?? [];
    const { updatedThread, version } = commitMessageCardToVersion(thread, msg.id, {
      entities: [...existingEntities, ...previewEnts],
      dimensions: [...existingDimensions, ...previewDims],
      partModel: readyPlan.v2?.partModelAfter,
      plan: readyPlan,
      parameterOverrides: msg.parameterOverrides,
    });

    persistAndSetThread(updatedThread);
    toast.success(`Peça aplicada no canvas (${version.versionId}).`);
  };

  const handleSelectVersion = (versionId: string) => {
    triggerHaptic("selection");
    const { updatedThread, snapshot } = restoreVersionFromThread(thread, versionId);
    persistAndSetThread(updatedThread);
    if (snapshot && onRestoreVersionSnapshot) {
      onRestoreVersionSnapshot(snapshot.entitiesSnapshot, snapshot.dimensionsSnapshot);
      toast.success(`Versão ${snapshot.versionId} restaurada no canvas.`);
    } else {
      toast.info(`Versão ativa definida para ${versionId}.`);
    }
  };

  const handleUndoMessageOperation = (msg: ChatMessageBubble) => {
    triggerHaptic("selection");
    const verIdx = thread.versions.findIndex((v) => v.versionId === msg.committedVersionId);
    const prevVersion = verIdx > 0 ? thread.versions[verIdx - 1] : null;

    const nextMessages = thread.messages.map((m) =>
      m.id === msg.id ? { ...m, commitState: "undone" as const } : m,
    );
    const updatedThread: ChamferConversationThread = {
      ...thread,
      updatedAt: new Date().toISOString(),
      messages: nextMessages,
      activeVersionId: prevVersion ? prevVersion.versionId : null,
    };
    persistAndSetThread(updatedThread);

    if (prevVersion && onRestoreVersionSnapshot) {
      onRestoreVersionSnapshot(prevVersion.entitiesSnapshot, prevVersion.dimensionsSnapshot);
      toast.success(`Operação revertida. Restaurada versão ${prevVersion.versionId}.`);
    } else if (onRestoreVersionSnapshot && verIdx === 0) {
      onRestoreVersionSnapshot([], []);
      toast.success("Operação revertida para o estado inicial.");
    } else {
      onTriggerUndo?.();
      toast.info("Operação desfeita.");
    }
  };

  const handleConfirmEditUserMessage = (userMessageId: string) => {
    const newPrompt = editingMessageDraft.trim();
    if (!newPrompt) return;

    const branched = branchConversationFromEditedUserMessage(thread, userMessageId);
    persistAndSetThread(branched.updatedThread);

    if (branched.restoredVersion && onRestoreVersionSnapshot) {
      onRestoreVersionSnapshot(
        branched.restoredVersion.entitiesSnapshot,
        branched.restoredVersion.dimensionsSnapshot,
      );
    }

    setEditingMessageId(null);
    setEditingMessageDraft("");
    setQuery(newPrompt);

    setTimeout(() => {
      void handleSendTurn({
        overridePrompt: newPrompt,
        keepModalOpen: true,
        branchParentMessageId: userMessageId,
      });
    }, 20);
  };

  const handleRegenerateMessage = (assistantMsg: ChatMessageBubble) => {
    const idx = thread.messages.findIndex((m) => m.id === assistantMsg.id);
    const prevUser = idx > 0 ? thread.messages[idx - 1] : undefined;
    const promptToRetry = prevUser?.content ?? assistantMsg.plan?.intent.raw_prompt;
    if (!promptToRetry) return;
    triggerHaptic("selection");
    setQuery(promptToRetry);
    setParameterOverrides({});
    toast.info("Comando carregado no editor para regeneração e ajuste.");
  };

  const handleCopyText = async (text: string, label = "Texto copiado") => {
    try {
      await navigator.clipboard?.writeText(text);
      toast.success(label);
    } catch {
      toast.info(label);
    }
  };

  const handleExportConversation = (format: "json" | "dsl") => {
    const payload = exportConversationPayload(thread, format);
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${thread.title.toLowerCase().replace(/\s+/g, "-")}-${format}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Conversa exportada em formato ${format.toUpperCase()}.`);
    } catch {
      void handleCopyText(payload, `Conteúdo ${format.toUpperCase()} copiado.`);
    }
  };

  // Fase 7: Upload de Croqui / Foto / DXF no Composer
  const handleFileAttachmentChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const nameLower = file.name.toLowerCase();

    if (nameLower.endsWith(".dxf") || nameLower.endsWith(".svg")) {
      const text = await file.text();
      const parsed = parseDxfTextToIntentAttachment(text, file.name);
      setAttachedFileSummary(parsed);
      setQuery(parsed.inferredPrompt);
      setParameterOverrides({});
      toast.success(parsed.detectedSummary);
    } else {
      const parsed = parseSketchImageToIntentAttachment(file.name);
      setAttachedFileSummary(parsed);
      setQuery(parsed.inferredPrompt);
      setParameterOverrides({});
      toast.info(parsed.detectedSummary);
    }
    ev.target.value = "";
  };

  // Fase 7: Salvar Cartão de Peça atual em "Meus Gabaritos"
  const handleSaveCurrentPlanAsTemplate = () => {
    const targetPlan = activeIntentPlan ?? previewSourcePlan;
    if (!targetPlan) return;
    const params: Record<string, number | string> = {};
    for (const [k, v] of Object.entries({ ...targetPlan.parameters, ...parameterOverrides })) {
      if (typeof v === "number" || typeof v === "string") {
        params[k] = v;
      }
    }
    const created = saveIntentTemplate({
      name: targetPlan.intent.summary.slice(0, 48),
      prompt: query.trim() || targetPlan.intent.raw_prompt,
      defaultParameters: params,
    });
    setSavedTemplates(listSavedIntentTemplates());
    toast.success(`Gabarito "${created.name}" salvo em Meus Gabaritos.`);
  };

  const lastUserMessageText = useMemo(() => {
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      if (thread.messages[i]?.role === "user") {
        return thread.messages[i]!.content;
      }
    }
    return "";
  }, [thread.messages]);

  const projectConversations = useMemo(() => {
    return listProjectConversations(projectId, historySearchQuery);
  }, [projectId, historySearchQuery, thread]);

  const obsMetrics = useMemo(() => {
    void obsRevision;
    return computeObservabilityMetricsSummary();
  }, [obsRevision]);

  const obsLogs = useMemo(() => {
    void obsRevision;
    return listTurnObservabilityLogs().slice(-15).reverse();
  }, [obsRevision]);

  // Calcula faixa de status semântica (§3: "vira uma faixa de status própria, com ícone e cor semântica do tema, até 2 linhas, toque para expandir ou copiar; some quando ocioso")
  const activeStatusBanner = useMemo<{
    tone: "info" | "warning" | "danger" | "success";
    title: string;
    detail: string;
  } | null>(() => {
    if (isStreaming) {
      return {
        tone: "info",
        title: "Compilando geometria paramétrica",
        detail: streamingStageLabel ?? "Entendendo → Planejando → Compilando → Validando",
      };
    }
    if (!activeIntentPlan) return null;

    if (hasGeometricError) {
      const msg = isPlatePlan
        ? livePlateValidation.errorMessages.join(" · ") ||
          activeIntentPlan.validation.issues.map((i) => i.message).join(" · ")
        : activeIntentPlan.validation.issues.map((i) => i.message).join(" · ");
      return {
        tone: "danger",
        title: "Geometria inválida — ajuste os parâmetros destacados",
        detail: msg || activeIntentPlan.response_summary,
      };
    }

    if (activeIntentPlan.unresolved.length > 0) {
      const firstAmb = activeIntentPlan.unresolved[0]!;
      return {
        tone: "warning",
        title: "Comando requer especificação",
        detail: `${firstAmb.question} (${firstAmb.reason})`,
      };
    }

    if (
      activeIntentPlan.v2?.decisionStatus === "provisional" &&
      !parameterOverrides.premise_confirmed
    ) {
      return {
        tone: "info",
        title: "Prévia com premissa provisória explícita",
        detail:
          activeIntentPlan.v2.understandingText ||
          activeIntentPlan.response_summary ||
          "Confirme ou alterne a premissa na barra de contexto abaixo.",
      };
    }

    if (
      activeIntentPlan.v2 &&
      activeIntentPlan.v2.manufacturingReport.warnings.length > 0 &&
      canApplyPlan
    ) {
      const w = activeIntentPlan.v2.manufacturingReport.warnings[0]!;
      return {
        tone: "warning",
        title: `Validado com alerta de fabricação (${w.code})`,
        detail: `${w.message} — ${w.suggested_fix}`,
      };
    }

    if (canApplyPlan) {
      return {
        tone: "success",
        title: "Geometria validada e pronta para aplicação",
        detail:
          activeIntentPlan.v2?.understandingText ||
          activeIntentPlan.response_summary ||
          activeIntentPlan.intent.summary,
      };
    }

    return null;
  }, [
    isStreaming,
    streamingStageLabel,
    activeIntentPlan,
    hasGeometricError,
    isPlatePlan,
    livePlateValidation.errorMessages,
    parameterOverrides.premise_confirmed,
    canApplyPlan,
  ]);

  const effectiveMinimized = isMinimizedToSheet || isPeekingCanvas;

  // Altura da prévia no modo COMPACTO (<640 px): reduz para 148 px quando teclado virtual está aberto (§2)
  const compactPreviewHeightCss = useMemo(() => {
    if (viewportState.isKeyboardOpen || compactPreviewStop === "min") {
      return "148px";
    }
    if (compactPreviewStop === "expanded") {
      return "clamp(260px, 56dvh, 460px)";
    }
    return "clamp(200px, 36dvh, 340px)";
  }, [viewportState.isKeyboardOpen, compactPreviewStop]);

  const rootStyleVariables = useMemo(() => {
    return buildIntentCssVariables(tokens, {
      vvhPx: viewportState.vvhPx,
      kbdPx: viewportState.kbdPx,
    });
  }, [tokens, viewportState.vvhPx, viewportState.kbdPx]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const activeLayerColor = getTechnicalLayerColor(String(activeLayer));

  // =========================================================================
  // SUB-BLOCO REUTILIZÁVEL: PRÉVIA CAD EM TEMPO REAL
  // =========================================================================
  const renderCadPreviewViewport = () => (
    <ChamferLiveMiniViewport
      width={liveWidth}
      height={liveHeight}
      cornerRadius={liveCornerRadius}
      cornerSelector={liveCornerSelector}
      holeCount={liveHoleCount}
      holeDiameter={liveHoleDiameter}
      margin={liveMargin}
      holeDistribution={liveHoleDistribution}
      pcd={livePcd}
      isPlateMode={isPlatePlan || !previewSourcePlan}
      fallbackEntities={previewSourcePlan?.compiled?.previewEntities ?? existingEntities}
      isMinimizedToSheet={isMinimizedToSheet}
      onToggleMinimizeToSheet={() => setIsMinimizedToSheet((v) => !v)}
      onPeekCanvasStart={() => setIsPeekingCanvas(true)}
      onPeekCanvasEnd={() => setIsPeekingCanvas(false)}
      isProvisional={
        Boolean(
          activeIntentPlan?.v2?.decisionStatus === "provisional" &&
            !parameterOverrides.premise_confirmed,
        ) || Boolean(activeIntentPlan && activeIntentPlan.unresolved.length > 0)
      }
      isCompiling={isStreaming}
      activeLayerName={String(activeLayer)}
      focusedParamKey={focusedParamKey}
      onSelectEntityParam={handleSelectEntityParamFromViewport}
      isFullscreenPreview={isFullscreenPreview}
      onToggleFullscreenPreview={() => setIsFullscreenPreview((v) => !v)}
      decimalSeparator=","
    />
  );

  // =========================================================================
  // SUB-BLOCO REUTILIZÁVEL: PARÂMETROS EXTRAÍDOS AGRUPADOS POR FUNÇÃO (§6)
  // =========================================================================
  const renderExtractedParametersSection = () => {
    if (!dynamicFormSpec || groupedParameterFields.length === 0) return null;

    const assumptionFieldsSet = new Set(
      (previewSourcePlan?.v2?.assumptions ?? []).map((a) => a.field.toLowerCase()),
    );

    return (
      <section
        aria-label="Parâmetros Extraídos"
        className="rounded-lg border p-3 space-y-3"
        style={{
          backgroundColor: "var(--ci-surface)",
          borderColor: "var(--ci-border)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 shrink-0" style={{ color: "var(--ci-accent)" }} />
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--ci-text)" }}
            >
              PARÂMETROS EXTRAÍDOS · {dynamicFormSpec.familyLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {manualEditNotes.length > 0 && (
              <span
                className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text-muted)",
                }}
              >
                0ms local ({manualEditNotes[manualEditNotes.length - 1]})
              </span>
            )}
            {Object.keys(parameterOverrides).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setParameterOverrides({});
                  setManualEditNotes([]);
                }}
                className="min-h-[32px] px-2 rounded border font-mono text-[10px] flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar</span>
              </button>
            )}
          </div>
        </div>

        {groupedParameterFields.map((group) => (
          <div key={group.groupTitle} className="space-y-1.5">
            <span
              className="block font-mono text-[10px] uppercase tracking-wider"
              style={{ color: "var(--ci-text-muted)" }}
            >
              {group.groupTitle}
            </span>

            {/* §2 COMPACTO: grid repeat(auto-fit, minmax(150px, 1fr)), 2 colunas em celulares, sem cortes */}
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              }}
            >
              {group.fields.map((field) => {
                const isFocused = focusedParamKey === field.key;
                const isProvisionalField =
                  assumptionFieldsSet.has(field.key.toLowerCase()) ||
                  assumptionFieldsSet.has(field.label.toLowerCase());

                const stateTone = field.hasError
                  ? "danger"
                  : isProvisionalField
                    ? "warning"
                    : "confirmed";

                const statusText = field.hasError
                  ? "Inválido"
                  : isProvisionalField
                    ? "Premissa"
                    : "Confirmado";

                return (
                  <div
                    key={field.key}
                    className="rounded-md border p-2 transition-colors"
                    style={{
                      backgroundColor: "var(--ci-surface-2)",
                      borderColor: field.hasError
                        ? "var(--ci-danger)"
                        : isFocused
                          ? "var(--ci-accent)"
                          : isProvisionalField
                            ? "var(--ci-warning)"
                            : "var(--ci-border)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label
                        htmlFor={`ci-param-${field.key}`}
                        className="font-mono text-[10px] uppercase tracking-wider truncate"
                        style={{
                          color: field.hasError ? "var(--ci-danger)" : "var(--ci-text-muted)",
                        }}
                      >
                        {field.label}
                        {field.unit ? ` (${field.unit})` : ""}
                      </label>

                      {/* §6: Diferencia com ícone, cor E texto */}
                      <span
                        className="inline-flex items-center gap-0.5 font-mono text-[9px] font-semibold shrink-0"
                        style={{
                          color:
                            stateTone === "danger"
                              ? "var(--ci-danger)"
                              : stateTone === "warning"
                                ? "var(--ci-warning)"
                                : "var(--ci-success)",
                        }}
                      >
                        {stateTone === "danger" ? (
                          <AlertTriangle className="w-2.5 h-2.5" />
                        ) : stateTone === "warning" ? (
                          <HelpCircle className="w-2.5 h-2.5" />
                        ) : (
                          <Check className="w-2.5 h-2.5" />
                        )}
                        <span>{statusText}</span>
                      </span>
                    </div>

                    {field.kind === "select" && field.options ? (
                      <select
                        id={`ci-param-${field.key}`}
                        ref={(el) => {
                          paramInputRefs.current[field.key] = el;
                        }}
                        value={String(field.value)}
                        onFocus={() => setFocusedParamKey(field.key)}
                        onBlur={() =>
                          setFocusedParamKey((curr) => (curr === field.key ? null : curr))
                        }
                        onChange={(e) => handleParamChange(field.key, e.target.value)}
                        className="w-full rounded border px-2 py-1 font-mono text-[13px] outline-none"
                        style={{
                          backgroundColor: "var(--ci-surface)",
                          borderColor: "var(--ci-border)",
                          color: "var(--ci-text)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`ci-param-${field.key}`}
                        ref={(el) => {
                          paramInputRefs.current[field.key] = el;
                        }}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={Number(field.value)}
                        onFocus={() => setFocusedParamKey(field.key)}
                        onBlur={() =>
                          setFocusedParamKey((curr) => (curr === field.key ? null : curr))
                        }
                        onChange={(e) => handleParamChange(field.key, Number(e.target.value))}
                        className="w-full rounded border px-2 py-1 font-mono text-[13px] outline-none"
                        style={{
                          backgroundColor: "var(--ci-surface)",
                          borderColor: field.hasError
                            ? "var(--ci-danger)"
                            : isFocused
                              ? "var(--ci-accent)"
                              : "var(--ci-border)",
                          color: field.hasError ? "var(--ci-danger)" : "var(--ci-text)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Ações de confirmação do plano ativo (nunca aplica sozinho ao editar parâmetro — §6) */}
        {activeIntentPlan && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t"
            style={{ borderColor: "var(--ci-border)" }}
          >
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <button
                type="button"
                onClick={handleSaveCurrentPlanAsTemplate}
                className="min-h-[36px] px-2 rounded border flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Salvar Gabarito</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCadOpsInspector((v) => !v)}
                className="min-h-[36px] px-2 rounded border flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showCadOpsInspector ? "Ocultar Ops" : "Ops CAD"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDslInspector((v) => !v)}
                className="min-h-[36px] px-2 rounded border flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{showDslInspector ? "Ocultar DSL" : "Ver DSL"}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  saveComposerDraft(projectId, "");
                  setParameterOverrides({});
                }}
                className="min-h-[44px] px-3 rounded-lg border font-mono text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text-muted)",
                }}
              >
                Descartar
              </button>

              <button
                type="button"
                disabled={!canApplyPlan}
                onClick={() => handleConfirmPlan(true)}
                className="min-h-[44px] px-3 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: canApplyPlan ? "var(--ci-accent)" : "var(--ci-border)",
                  color: canApplyPlan ? "var(--ci-text)" : "var(--ci-text-muted)",
                }}
              >
                <Check className="w-4 h-4" />
                <span>Aplicar (Manter)</span>
              </button>

              <button
                type="button"
                disabled={!canApplyPlan}
                onClick={() => handleConfirmPlan(false)}
                className="min-h-[44px] px-4 rounded-lg font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: canApplyPlan ? "var(--ci-accent)" : "var(--ci-surface-2)",
                  color: canApplyPlan ? "var(--ci-accent-contrast)" : "var(--ci-text-muted)",
                }}
              >
                <Check className="w-4 h-4" />
                <span>
                  {activeIntentPlan.intent.category === "modify"
                    ? "Confirmar Alteração"
                    : activeIntentPlan.intent.category === "undo"
                      ? "Confirmar Desfazer"
                      : "Confirmar e Inserir no CHAMFER"}
                </span>
              </button>
            </div>
          </div>
        )}

        {showCadOpsInspector && activeIntentPlan && (
          <pre
            className="max-h-40 overflow-auto rounded-lg border p-2.5 text-[10px] font-mono"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            {JSON.stringify(
              {
                entityDelta: activeIntentPlan.v2?.entityDelta,
                toolCalls: activeIntentPlan.v2?.toolCalls ?? [],
                operations: activeIntentPlan.operations,
              },
              null,
              2,
            )}
          </pre>
        )}

        {showDslInspector && activeIntentPlan && (
          <pre
            className="max-h-44 overflow-auto rounded-lg border p-2.5 text-[10px] font-mono"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            {JSON.stringify(
              {
                plan_id: activeIntentPlan.plan_id,
                schema_version: activeIntentPlan.schema_version,
                intent: activeIntentPlan.intent,
                operations: activeIntentPlan.operations,
                parameters: activeIntentPlan.parameters,
                toolCalls: activeIntentPlan.v2?.toolCalls ?? [],
                validation: activeIntentPlan.validation,
              },
              null,
              2,
            )}
          </pre>
        )}
      </section>
    );
  };

  // =========================================================================
  // SUB-BLOCO REUTILIZÁVEL: DESAMBIGUAÇÃO, ERROS E ALERTAS DFM
  // =========================================================================
  const renderPlanDiagnosticsAndUnresolved = () => {
    if (!activeIntentPlan) return null;
    const hasUnresolved = activeIntentPlan.unresolved.length > 0;
    const hasDfmWarnings =
      activeIntentPlan.v2 && activeIntentPlan.v2.manufacturingReport.warnings.length > 0;
    const hasConflicts =
      activeIntentPlan.v2 && activeIntentPlan.v2.conflictAlternatives.length > 0;

    if (!hasUnresolved && !hasDfmWarnings && !hasConflicts) return null;

    return (
      <div className="space-y-2">
        {hasUnresolved &&
          activeIntentPlan.unresolved.map((amb) => (
            <div
              key={amb.id}
              className="rounded-lg border p-3 space-y-2"
              style={{
                backgroundColor: "var(--ci-surface)",
                borderColor: "var(--ci-warning)",
              }}
            >
              <div className="flex items-start gap-2">
                <HelpCircle
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: "var(--ci-warning)" }}
                />
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--ci-text)" }}>
                    {amb.question}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--ci-text-muted)" }}>
                    {amb.reason}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {amb.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleApplyAmbiguityPatch(opt.patch)}
                    className="flex flex-col text-left p-2.5 rounded-lg border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: "var(--ci-surface-2)",
                      borderColor: "var(--ci-border)",
                      color: "var(--ci-text)",
                    }}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[10px] mt-0.5" style={{ color: "var(--ci-text-muted)" }}>
                      {opt.description}
                    </span>
                  </button>
                ))}
              </div>

              {amb.requiresNumericInput && (
                <div
                  className="flex items-center gap-2 pt-2 border-t"
                  style={{ borderColor: "var(--ci-border)" }}
                >
                  <span className="text-[11px] font-mono" style={{ color: "var(--ci-text)" }}>
                    {amb.requiresNumericInput.label}:
                  </span>
                  <input
                    type="number"
                    value={customPcdInput}
                    onChange={(e) => setCustomPcdInput(e.target.value)}
                    className="w-24 rounded border px-2 py-1 text-xs font-mono outline-none"
                    style={{
                      backgroundColor: "var(--ci-surface-2)",
                      borderColor: "var(--ci-border)",
                      color: "var(--ci-text)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(customPcdInput);
                      if (Number.isFinite(val) && val > 0) {
                        handleApplyAmbiguityPatch({
                          hole_distribution: "circular_pcd",
                          [amb.requiresNumericInput!.paramKey]: val,
                        });
                      }
                    }}
                    className="px-3 py-1 rounded font-mono text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor: "var(--ci-accent)",
                      color: "var(--ci-accent-contrast)",
                    }}
                  >
                    Definir {amb.requiresNumericInput.unit}
                  </button>
                </div>
              )}
            </div>
          ))}

        {hasConflicts && (
          <div
            className="rounded-lg border p-2.5 space-y-1.5"
            style={{
              backgroundColor: "var(--ci-surface)",
              borderColor: "var(--ci-danger)",
            }}
          >
            <span
              className="block text-[10px] font-mono uppercase tracking-wider font-bold"
              style={{ color: "var(--ci-danger)" }}
            >
              Alternativas Numéricas Sugeridas (Auto-Correção)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {activeIntentPlan.v2!.conflictAlternatives.map((alt) => (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => handleApplyAmbiguityPatch(alt.patch)}
                  className="flex flex-col text-left p-2 rounded border cursor-pointer"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-border)",
                    color: "var(--ci-text)",
                  }}
                >
                  <span className="text-xs font-bold">{alt.label}</span>
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--ci-text-muted)" }}>
                    {alt.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasDfmWarnings &&
          activeIntentPlan.v2!.manufacturingReport.warnings.map((w, idx) => (
            <div
              key={`${w.code}-${idx}`}
              className="flex items-start gap-2 rounded-lg border p-2.5 text-xs"
              style={{
                backgroundColor: "var(--ci-surface)",
                borderColor: "var(--ci-warning)",
                color: "var(--ci-text)",
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--ci-warning)" }}
              />
              <div className="flex-1">
                <span
                  className="font-mono font-bold text-[10px] uppercase mr-1.5"
                  style={{ color: "var(--ci-warning)" }}
                >
                  [DFM · {w.entity_id}]
                </span>
                <span>{w.message}</span>
                <span
                  className="block font-mono text-[10px] mt-0.5"
                  style={{ color: "var(--ci-text-muted)" }}
                >
                  Medido: {w.measured_value} mm · Limite: {w.limit_value} mm · {w.suggested_fix}
                </span>
              </div>
            </div>
          ))}
      </div>
    );
  };

  // =========================================================================
  // SUB-BLOCO REUTILIZÁVEL: HISTÓRICO DE CONVERSA E EXEMPLOS
  // =========================================================================
  const renderConversationHistoryAndExamples = () => (
    <div className="space-y-3">
      {/* BANNER DE ERRO DE REDE / COTA COM BOTÃO "TENTAR DE NOVO" */}
      {networkErrorBanner && (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border p-3 text-xs"
          style={{
            backgroundColor: "var(--ci-surface)",
            borderColor: "var(--ci-warning)",
            color: "var(--ci-text)",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--ci-warning)" }}
            />
            <span>{networkErrorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleSendTurn({ keepModalOpen: true })}
            className="shrink-0 px-3 py-1.5 rounded font-mono text-[11px] font-bold cursor-pointer"
            style={{
              backgroundColor: "var(--ci-accent)",
              color: "var(--ci-accent-contrast)",
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* HISTÓRICO PERMANENTE DE TURNOS DA CONVERSA (§4.1 / §4.2) */}
      {thread.messages.length > 0 && (
        <div className="space-y-2.5">
          {thread.messages.map((msg, msgIndex) => {
            if (msg.role === "user") {
              const isEditingThis = editingMessageId === msg.id;
              const subsequentCommitsCount = thread.messages
                .slice(msgIndex)
                .filter((m) => Boolean(m.committedVersionId)).length;

              return (
                <div key={msg.id} className="flex flex-col items-end space-y-1">
                  <div
                    className="max-w-[92%] sm:max-w-[85%] rounded-lg border px-3 py-2 text-xs"
                    style={{
                      backgroundColor: "var(--ci-surface-2)",
                      borderColor: "var(--ci-accent)",
                      color: "var(--ci-text)",
                    }}
                  >
                    {isEditingThis ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingMessageDraft}
                          onChange={(e) => setEditingMessageDraft(e.target.value)}
                          rows={2}
                          className="w-full rounded border p-2 text-xs outline-none"
                          style={{
                            backgroundColor: "var(--ci-surface)",
                            borderColor: "var(--ci-accent)",
                            color: "var(--ci-text)",
                          }}
                        />
                        {subsequentCommitsCount > 0 && (
                          <p
                            className="text-[10px] font-mono"
                            style={{ color: "var(--ci-warning)" }}
                          >
                            Atenção: reenviar criará uma nova ramificação e arquivará{" "}
                            {subsequentCommitsCount} versão(ões) posterior(es).
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-2.5 py-1 rounded border text-[10px] font-mono cursor-pointer"
                            style={{
                              backgroundColor: "var(--ci-surface)",
                              borderColor: "var(--ci-border)",
                              color: "var(--ci-text-muted)",
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmEditUserMessage(msg.id)}
                            className="px-2.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer"
                            style={{
                              backgroundColor: "var(--ci-accent)",
                              color: "var(--ci-accent-contrast)",
                            }}
                          >
                            Confirmar Ramificação e Reenviar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        {msg.attachedContext && (
                          <div
                            className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t text-[10px] font-mono"
                            style={{
                              borderColor: "var(--ci-border)",
                              color: "var(--ci-text-muted)",
                            }}
                          >
                            <span>{msg.attachedContext.versionId}</span>
                            <span>·</span>
                            <span>Camada {msg.attachedContext.activeLayer}</span>
                            {msg.attachedContext.selectedCount > 0 && (
                              <>
                                <span>·</span>
                                <span>{msg.attachedContext.selectedSummary}</span>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!isEditingThis && (
                    <div
                      className="flex items-center gap-1 text-[10px] font-mono"
                      style={{ color: "var(--ci-text-muted)" }}
                    >
                      <button
                        type="button"
                        onClick={() => void handleCopyText(msg.content, "Comando copiado.")}
                        className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
                        title="Copiar comando"
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(msg.id);
                          setEditingMessageDraft(msg.content);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
                        title="Editar mensagem e criar ramificação da conversa"
                      >
                        <Edit3 className="w-3 h-3" /> Editar
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // Balão do Assistente + Cartão de Peça Anexado (§4.2)
            const cardPlan = msg.plan;
            const isDslExpanded = expandedMessageDslId === msg.id;
            const isDownvoteOpen = openDownvoteMessageId === msg.id;
            const dynamicCardFields = cardPlan
              ? buildDynamicParameterFields(cardPlan, msg.parameterOverrides)
              : null;

            return (
              <div key={msg.id} className="flex flex-col items-start space-y-1.5">
                <div
                  className="w-full rounded-lg border p-3 space-y-2"
                  style={{
                    backgroundColor: "var(--ci-surface)",
                    borderColor: "var(--ci-border)",
                    color: "var(--ci-text)",
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider"
                        style={{ color: "var(--ci-accent)" }}
                      >
                        CHAMFER INTENT · {dynamicCardFields?.familyLabel ?? "Resposta Técnica"}
                      </span>
                      {cardPlan && (
                        <h4 className="text-xs sm:text-sm font-bold mt-0.5">
                          {cardPlan.intent.summary}
                        </h4>
                      )}
                      <p
                        className="text-xs mt-1 whitespace-pre-wrap"
                        style={{ color: "var(--ci-text-muted)" }}
                      >
                        {msg.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {msg.committedVersionId && (
                        <span
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-bold"
                          style={{
                            backgroundColor: "var(--ci-surface-2)",
                            borderColor: "var(--ci-success)",
                            color: "var(--ci-success)",
                          }}
                        >
                          <CheckCircle2 className="w-3 h-3" /> {msg.committedVersionId}
                        </span>
                      )}
                      {cardPlan && (
                        <span
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-bold uppercase"
                          style={{
                            backgroundColor: "var(--ci-surface-2)",
                            borderColor:
                              cardPlan.validation.status === "invalid"
                                ? "var(--ci-danger)"
                                : cardPlan.v2 &&
                                    cardPlan.v2.manufacturingReport.warnings.length > 0
                                  ? "var(--ci-warning)"
                                  : "var(--ci-success)",
                            color:
                              cardPlan.validation.status === "invalid"
                                ? "var(--ci-danger)"
                                : cardPlan.v2 &&
                                    cardPlan.v2.manufacturingReport.warnings.length > 0
                                  ? "var(--ci-warning)"
                                  : "var(--ci-success)",
                          }}
                        >
                          {cardPlan.validation.status === "invalid"
                            ? "ERRO"
                            : cardPlan.v2 &&
                                cardPlan.v2.manufacturingReport.warnings.length > 0
                              ? "ALERTA"
                              : "VALIDADO"}
                        </span>
                      )}
                    </div>
                  </div>

                  {dynamicCardFields && dynamicCardFields.fields.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {dynamicCardFields.fields.map((f) => (
                        <span
                          key={f.key}
                          className="rounded border px-2 py-0.5 font-mono text-[10px]"
                          style={{
                            backgroundColor: "var(--ci-surface-2)",
                            borderColor: "var(--ci-border)",
                            color: "var(--ci-text-muted)",
                          }}
                        >
                          {f.label}:{" "}
                          <strong style={{ color: "var(--ci-text)" }}>{String(f.value)}</strong>
                          {f.unit ? ` ${f.unit}` : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  {cardPlan && (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t"
                      style={{ borderColor: "var(--ci-border)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        {msg.commitState !== "committed" && (
                          <button
                            type="button"
                            onClick={() => handleApplyHistoryCard(msg)}
                            className="px-3 py-1.5 rounded font-mono text-[11px] font-bold cursor-pointer"
                            style={{
                              backgroundColor: "var(--ci-accent)",
                              color: "var(--ci-accent-contrast)",
                            }}
                          >
                            Aplicar no Canvas
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMessageDslId(isDslExpanded ? null : msg.id)
                          }
                          className="px-2.5 py-1.5 rounded border text-[10px] font-mono cursor-pointer"
                          style={{
                            backgroundColor: "var(--ci-surface-2)",
                            borderColor: "var(--ci-border)",
                            color: "var(--ci-text)",
                          }}
                        >
                          {isDslExpanded ? "Ocultar DSL" : "Ver DSL"}
                        </button>
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-1 text-[10px] font-mono"
                        style={{ color: "var(--ci-text-muted)" }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyText(msg.content, "Resumo técnico copiado.")
                          }
                          className="p-1.5 rounded cursor-pointer"
                          title="Copiar resumo"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyText(
                              JSON.stringify(
                                cardPlan.v2?.toolCalls ?? cardPlan.operations,
                                null,
                                2,
                              ),
                              "DSL/JSON copiado.",
                            )
                          }
                          className="px-2 py-1 rounded cursor-pointer"
                          title="Copiar DSL/JSON"
                        >
                          DSL/JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerateMessage(msg)}
                          className="p-1.5 rounded cursor-pointer"
                          title="Regenerar resposta"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        {msg.commitState === "committed" && (
                          <button
                            type="button"
                            onClick={() => handleUndoMessageOperation(msg)}
                            className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
                            style={{ color: "var(--ci-warning)" }}
                            title="Desfazer esta operação"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> Desfazer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            saveMisinterpretedCaseToGoldenSuite({
                              prompt: cardPlan.intent.raw_prompt,
                              actualPlanSummary: cardPlan.intent.summary,
                            });
                            toast.info(
                              "Caso salvo na Suíte Golden local para regressão ('Interpretou errado').",
                            );
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
                          style={{ color: "var(--ci-danger)" }}
                          title="Interpretou errado — salvar este caso na Suíte Golden (§10)"
                        >
                          <Flag className="w-3 h-3" /> Interpretou errado
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const res = recordAssistantMessageFeedback(thread, msg.id, "up");
                            persistAndSetThread(res.updatedThread);
                            toast.success("Obrigado pelo feedback positivo!");
                          }}
                          className="p-1.5 rounded cursor-pointer"
                          style={{
                            color:
                              msg.feedback?.rating === "up"
                                ? "var(--ci-success)"
                                : "var(--ci-text-muted)",
                          }}
                          title="Resposta útil"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenDownvoteMessageId(isDownvoteOpen ? null : msg.id)
                          }
                          className="p-1.5 rounded cursor-pointer"
                          style={{
                            color:
                              msg.feedback?.rating === "down"
                                ? "var(--ci-danger)"
                                : "var(--ci-text-muted)",
                          }}
                          title="Reportar problema na resposta"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {isDownvoteOpen && (
                    <div
                      className="flex flex-wrap items-center gap-1.5 pt-2 border-t"
                      style={{ borderColor: "var(--ci-border)" }}
                    >
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: "var(--ci-text-muted)" }}
                      >
                        Qual foi o problema?
                      </span>
                      {DOWNVOTE_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => {
                            const res = recordAssistantMessageFeedback(
                              thread,
                              msg.id,
                              "down",
                              reason,
                            );
                            persistAndSetThread(res.updatedThread);
                            setOpenDownvoteMessageId(null);
                            toast.info(`Feedback registrado: ${reason}`);
                          }}
                          className="px-2 py-1 rounded border text-[10px] font-mono cursor-pointer"
                          style={{
                            backgroundColor: "var(--ci-surface-2)",
                            borderColor: "var(--ci-danger)",
                            color: "var(--ci-danger)",
                          }}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  )}

                  {isDslExpanded && cardPlan && (
                    <pre
                      className="max-h-36 overflow-auto rounded border p-2.5 text-[10px] font-mono"
                      style={{
                        backgroundColor: "var(--ci-surface-2)",
                        borderColor: "var(--ci-border)",
                        color: "var(--ci-text)",
                      }}
                    >
                      {JSON.stringify(
                        {
                          plan_id: cardPlan.plan_id,
                          operations: cardPlan.operations,
                          parameters: cardPlan.parameters,
                          toolCalls: cardPlan.v2?.toolCalls ?? [],
                        },
                        null,
                        2,
                      )}
                    </pre>
                  )}
                </div>

                {msg.suggestedNextSteps && msg.suggestedNextSteps.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    <span
                      className="text-[10px] font-mono flex items-center gap-1"
                      style={{ color: "var(--ci-text-muted)" }}
                    >
                      <Sparkles className="w-3 h-3" style={{ color: "var(--ci-accent)" }} />{" "}
                      Próximos passos:
                    </span>
                    {msg.suggestedNextSteps.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => {
                          if (step.kind === "slash") {
                            handleExecuteSlashCommand(
                              step.promptOrCommand as SlashCommandSpec["command"],
                            );
                          } else {
                            setQuery(step.promptOrCommand);
                            setParameterOverrides({});
                          }
                        }}
                        className="px-2.5 py-1 rounded border text-[10px] font-mono cursor-pointer"
                        style={{
                          backgroundColor: "var(--ci-surface)",
                          borderColor: "var(--ci-border)",
                          color: "var(--ci-text)",
                        }}
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* EXEMPLOS DE PEDIDOS QUANDO O CAMPO ESTÁ VAZIO (§0 & §7) */}
      {!query.trim() && (
        <div className="space-y-3">
          {hasActivePart && (
            <div>
              <div
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider mb-1.5"
                style={{ color: "var(--ci-accent)" }}
              >
                <History className="w-3.5 h-3.5" />
                <span>Continuidade Multi-Turno (Editar Peça Ativa)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_FOLLOWUP_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setQuery(p);
                      setParameterOverrides({});
                    }}
                    className="text-left text-[11px] font-mono px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: "var(--ci-surface)",
                      borderColor: "var(--ci-border)",
                      color: "var(--ci-text)",
                    }}
                  >
                    "{p}"
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p
              className="text-[10px] font-mono uppercase tracking-wider mb-1.5"
              style={{ color: "var(--ci-text-muted)" }}
            >
              Exemplos de Pedidos em Linguagem Natural (pt-BR)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {QUICK_INITIAL_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setQuery(p);
                    setParameterOverrides({});
                  }}
                  className="flex items-start gap-2 text-left text-[11px] p-2.5 rounded-md border transition-colors cursor-pointer"
                  style={{
                    backgroundColor: "var(--ci-surface)",
                    borderColor: "var(--ci-border)",
                    color: "var(--ci-text)",
                  }}
                >
                  <ChevronRight
                    className="w-3.5 h-3.5 shrink-0 mt-0.5"
                    style={{ color: "var(--ci-accent)" }}
                  />
                  <span className="line-clamp-2">{p}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ATALHOS DE FERRAMENTAS DIRETAS DO CHAMFER CAD */}
      {filteredCommands.length > 0 && !activeIntentPlan && thread.messages.length === 0 && (
        <div className="space-y-1 pt-1">
          <p
            className="text-[10px] font-mono uppercase tracking-wider px-1"
            style={{ color: "var(--ci-text-muted)" }}
          >
            Ferramentas Diretas do CHAMFER CAD
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => handleSelectCommand(cmd)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-colors cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? "var(--ci-surface-2)" : "var(--ci-surface)",
                    borderColor: isSelected ? "var(--ci-accent)" : "var(--ci-border)",
                    color: "var(--ci-text)",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: "var(--ci-surface-2)",
                      borderColor: "var(--ci-border)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold truncate">{cmd.title}</span>
                      {cmd.shortcut && (
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                          style={{
                            backgroundColor: "var(--ci-surface-2)",
                            borderColor: "var(--ci-border)",
                            color: "var(--ci-text-muted)",
                          }}
                        >
                          {cmd.shortcut}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[11px] truncate"
                      style={{ color: "var(--ci-text-muted)" }}
                    >
                      {cmd.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // =========================================================================
  // SUB-BLOCO REUTILIZÁVEL: ZONA 3 (BARRA DE CONTEXTO) + ZONA 4 (COMPOSER)
  // =========================================================================
  const renderContextAndComposerFooter = () => (
    <div
      className="shrink-0 border-t px-3 py-2 space-y-2"
      style={{
        backgroundColor: "var(--ci-surface)",
        borderColor: "var(--ci-border)",
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Menu de Autocompletar Menções `@entidade` (Fase 5) */}
      {activeAtMention.active && mentionSuggestions.length > 0 && (
        <div
          className="rounded-lg border p-1.5 space-y-1"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-accent)",
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase"
            style={{ color: "var(--ci-accent)" }}
          >
            <AtSign className="w-3 h-3" /> Referenciar Entidade ou Seleção do PartModel
          </div>
          {mentionSuggestions.map((item) => (
            <button
              key={item.token}
              type="button"
              onClick={() => {
                setQuery(insertAtMentionToken(query, item.token));
                textareaRef.current?.focus();
              }}
              className="w-full flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left cursor-pointer"
              style={{ color: "var(--ci-text)" }}
            >
              <span className="font-mono text-xs font-bold" style={{ color: "var(--ci-accent)" }}>
                {item.label}
              </span>
              <span className="text-[10px] truncate" style={{ color: "var(--ci-text-muted)" }}>
                {item.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Menu de Comandos Rápidos (/) */}
      {matchingSlashCommands.length > 0 && (
        <div
          className="rounded-lg border p-1.5 space-y-1"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-accent)",
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase"
            style={{ color: "var(--ci-accent)" }}
          >
            <Terminal className="w-3 h-3" /> Comandos Rápidos do CHAMFER INTENT
          </div>
          {matchingSlashCommands.map((sc) => (
            <button
              key={sc.command}
              type="button"
              onClick={() => handleExecuteSlashCommand(sc.command)}
              className="w-full flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left cursor-pointer"
              style={{ color: "var(--ci-text)" }}
            >
              <div>
                <span
                  className="font-mono text-xs font-bold mr-2"
                  style={{ color: "var(--ci-accent)" }}
                >
                  {sc.command}
                </span>
                <span className="text-xs font-semibold">{sc.title}</span>
              </div>
              <span
                className="text-[10px] hidden sm:inline truncate"
                style={{ color: "var(--ci-text-muted)" }}
              >
                {sc.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Indicador de Voz Ativa (Fase 4 — §5) */}
      {micState !== "inactive" && (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-warning)",
            color: "var(--ci-text)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-full animate-ping shrink-0"
              style={{ backgroundColor: "var(--ci-warning)" }}
            />
            <span className="font-bold uppercase shrink-0">
              {micState === "listening" ? "Ouvindo (pt-BR)..." : "Processando voz..."}
            </span>
            {voiceInterimTranscript && (
              <span className="truncate" style={{ color: "var(--ci-text-muted)" }}>
                "{voiceInterimTranscript}"
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className="w-16 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--ci-border)" }}
            >
              <div
                className="h-full transition-all duration-100"
                style={{
                  width: `${audioLevel}%`,
                  backgroundColor: "var(--ci-warning)",
                }}
              />
            </div>
            <span className="text-[10px]" style={{ color: "var(--ci-text-muted)" }}>
              transcrição editável
            </span>
          </div>
        </div>
      )}

      {/* ZONA 3: BARRA DE CONTEXTO (Chips Versão, Camada com amostra da cor técnica, premissas e alternativas em linha com rolagem horizontal — §2) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[10px] font-mono">
        <span
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 shrink-0"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-border)",
            color: "var(--ci-text)",
          }}
        >
          <span>Versão:</span>
          <strong style={{ color: "var(--ci-accent)" }}>{thread.activeVersionId ?? "V1"}</strong>
        </span>

        {/* Chip de Camada com amostra da cor técnica original (§2 & §4) */}
        <span
          className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 shrink-0"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-border)",
            color: "var(--ci-text)",
          }}
        >
          <span
            className="w-2.5 h-2.5 rounded-sm border shrink-0"
            style={{
              backgroundColor: activeLayerColor,
              borderColor: "var(--ci-border)",
            }}
            title={`Cor técnica da camada ${String(activeLayer)}: ${activeLayerColor}`}
          />
          <span>Camada:</span>
          <strong className="uppercase">{String(activeLayer)}</strong>
        </span>

        {selectedEntityIds.length > 0 && includeSelectionContext && (
          <span
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 shrink-0"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-accent)",
              color: "var(--ci-text)",
            }}
          >
            <span>@selecionado ({selectedEntityIds.length})</span>
            <button
              type="button"
              onClick={() => {
                setIncludeSelectionContext(false);
                onClearSelection?.();
              }}
              className="cursor-pointer"
              title="Desanexar seleção desta mensagem"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {attachedFileSummary && (
          <span
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 shrink-0"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-success)",
              color: "var(--ci-text)",
            }}
          >
            <span>{attachedFileSummary.fileName}</span>
            <button
              type="button"
              onClick={() => setAttachedFileSummary(null)}
              className="cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Premissas e alternativas em linha na barra de contexto (§2) */}
        {activeIntentPlan?.v2?.assumptions.map((assum) => (
          <div
            key={assum.id}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 shrink-0"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-warning)",
              color: "var(--ci-text)",
            }}
          >
            <span style={{ color: "var(--ci-warning)" }}>{assum.field}:</span>
            <strong>{String(assum.value)}</strong>
            {assum.alternatives?.map((alt) => (
              <button
                key={alt.label}
                type="button"
                onClick={() => handleApplyAmbiguityPatch(alt.patch)}
                className="ml-1 px-1.5 py-0.2 rounded border text-[9px] font-bold cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface)",
                  borderColor: "var(--ci-accent)",
                  color: "var(--ci-accent)",
                }}
              >
                {alt.label}
              </button>
            ))}
          </div>
        ))}

        {activeIntentPlan?.v2?.requiresPremiseConfirmation &&
          !parameterOverrides.premise_confirmed && (
            <button
              type="button"
              onClick={() =>
                setParameterOverrides((prev) => ({ ...prev, premise_confirmed: true }))
              }
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-bold shrink-0 cursor-pointer"
              style={{
                backgroundColor: "var(--ci-surface-2)",
                borderColor: "var(--ci-accent)",
                color: "var(--ci-accent)",
              }}
            >
              <Check className="w-3 h-3" /> Confirmar premissa
            </button>
          )}
      </div>

      {/* ZONA 4: COMPOSER DE LARGURA TOTAL (§3: container arredondado ~10px; textarea 1 a 5 linhas; fonte ≥ 16px; botão de enviar na cor de destaque do TEMA) */}
      <div
        className="flex items-end gap-1.5 rounded-[10px] border p-1.5"
        style={{
          backgroundColor: "var(--ci-surface-2)",
          borderColor: "var(--ci-border)",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dxf,.svg,image/*"
          onChange={handleFileAttachmentChange}
          className="hidden"
        />

        {/* Botão Anexar (alvo ≥ 44px) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar Croqui, Foto ou arquivo DXF/SVG"
          title="Anexar Croqui, Foto ou arquivo DXF/SVG"
          className="min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          style={{
            backgroundColor: "var(--ci-surface)",
            borderColor: "var(--ci-border)",
            color: "var(--ci-text)",
          }}
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Textarea que cresce de 1 a 5 linhas com fonte ≥ 16px (§3) */}
        <div className="flex-1 min-w-0 flex items-center px-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParameterOverrides({});
            }}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
                e.preventDefault();
                handleToggleVoiceMic();
                return;
              }
              if (e.key === "ArrowUp" && !query.trim() && lastUserMessageText) {
                e.preventDefault();
                setQuery(lastUserMessageText);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (query.trim().startsWith("/")) {
                  const matched = matchSlashCommands(query);
                  if (matched.length > 0) {
                    handleExecuteSlashCommand(matched[0]!.command);
                    return;
                  }
                }
                if (canApplyPlan) {
                  handleConfirmPlan(false);
                } else if (query.trim()) {
                  void handleSendTurn({ keepModalOpen: true });
                }
              }
            }}
            placeholder={
              hasActivePart
                ? "Descreva alteração (ex.: 'Aumente @holes_1 para 16 mm'), fale ou digite /..."
                : "Descreva a peça em pt-BR (ex.: 'Chapa 400x250, R20, 5 furos Ø12')..."
            }
            className="w-full max-h-[116px] resize-none bg-transparent outline-none font-sans leading-snug py-1.5"
            style={{
              fontSize: "16px",
              color: "var(--ci-text)",
            }}
          />
        </div>

        {/* Limpar texto */}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              saveComposerDraft(projectId, "");
              setParameterOverrides({});
            }}
            aria-label="Limpar campo de comando"
            title="Limpar comando"
            className="min-h-[44px] min-w-[40px] rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
            style={{ color: "var(--ci-text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Microfone com transcrição editável (alvo ≥ 44px) */}
        <button
          type="button"
          onClick={handleToggleVoiceMic}
          aria-label={
            micState === "listening"
              ? "Parar gravação de voz"
              : "Iniciar comando por voz em português"
          }
          aria-pressed={micState !== "inactive"}
          title={
            micState === "listening"
              ? "Ouvindo em pt-BR (Toque para parar)"
              : "Comando por Voz em pt-BR (Ctrl+Shift+M)"
          }
          className="min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          style={{
            backgroundColor:
              micState === "listening"
                ? "var(--ci-warning)"
                : micState === "processing"
                  ? "var(--ci-accent)"
                  : "var(--ci-surface)",
            borderColor:
              micState !== "inactive" ? "var(--ci-warning)" : "var(--ci-border)",
            color:
              micState !== "inactive" ? "var(--ci-accent-contrast)" : "var(--ci-text)",
          }}
        >
          <Mic className="w-4 h-4" />
        </button>

        {/* Enviar / Interromper (na cor de destaque do TEMA, nunca vermelho de erro — §1.f & §3) */}
        {isStreaming ? (
          <button
            type="button"
            onClick={handleStopStreaming}
            aria-label="Interromper geração"
            title="Interromper geração"
            className="min-h-[44px] min-w-[44px] px-3 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--ci-warning)",
              color: "var(--ci-accent-contrast)",
            }}
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Parar</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!query.trim()}
            onClick={() => {
              if (query.trim().startsWith("/")) {
                const matched = matchSlashCommands(query);
                if (matched.length > 0) {
                  handleExecuteSlashCommand(matched[0]!.command);
                  return;
                }
              }
              void handleSendTurn({
                forceCommit: canApplyPlan,
                keepModalOpen: true,
              });
            }}
            aria-label="Enviar comando"
            title="Enviar comando para o compilador (Enter)"
            className="min-h-[44px] min-w-[44px] px-3.5 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-opacity cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              backgroundColor: query.trim() ? "var(--ci-accent)" : "var(--ci-surface)",
              color: query.trim() ? "var(--ci-accent-contrast)" : "var(--ci-text-muted)",
              borderColor: "var(--ci-border)",
            }}
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        )}
      </div>
    </div>
  );

  // =========================================================================
  // RENDERIZAÇÃO EM PORTAL DE TELA CHEIA (§2: fixed inset-0, 100dvh, fundo opaco)
  // =========================================================================
  const portalContent = (
    <div
      ref={rootDialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="CHAMFER INTENT — Compilador Geométrico Paramétrico"
      style={{
        ...rootStyleVariables,
        backgroundColor: "var(--ci-bg)",
        color: "var(--ci-text)",
        height: effectiveMinimized ? "auto" : "var(--vvh, 100dvh)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      className={
        effectiveMinimized
          ? "fixed inset-x-0 bottom-0 z-[120] border-t flex flex-col overflow-hidden shadow-2xl"
          : "fixed inset-0 z-[120] flex flex-col overflow-hidden overscroll-contain"
      }
    >
      {/* ===================================================================== */}
      {/* ZONA 1: CABEÇALHO DE UMA LINHA (~52 px) + FAIXA DE STATUS PRÓPRIA (§3) */}
      {/* ===================================================================== */}
      <header
        className="h-[52px] min-h-[52px] px-3 border-b flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: "var(--ci-surface)",
          borderColor: "var(--ci-border)",
        }}
      >
        {/* Esquerda: Logo existente + nome "CHAMFER INTENT" + selo "DSL v2.0" neutro e discreto (nunca truncados) */}
        <div className="flex items-center gap-2 shrink-0">
          <CaldraLogo size={26} className="rounded-md shrink-0" />
          <span
            className="font-mono text-xs font-bold tracking-wider uppercase whitespace-nowrap shrink-0"
            style={{ color: "var(--ci-text)" }}
          >
            CHAMFER INTENT
          </span>
          <span
            className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap shrink-0"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-border)",
              color: "var(--ci-text-muted)",
            }}
          >
            DSL v2.0
          </span>
          {isOfflineFallback && (
            <span
              className="hidden sm:inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] shrink-0"
              style={{
                backgroundColor: "var(--ci-surface-2)",
                borderColor: "var(--ci-warning)",
                color: "var(--ci-warning)",
              }}
              title="Usando compilador geométrico determinístico local"
            >
              <WifiOff className="w-2.5 h-2.5" /> LOCAL
            </span>
          )}
        </div>

        {/* Direita: Seletor de versão (V1), Auto (ON/OFF), Ajustes, Atividade/Log, Pastas com contador e Fechar */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {/* Seletor de versão (V1, V2...) */}
          <div
            className="flex items-center gap-1 rounded-md border px-2 min-h-[36px] shrink-0"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-border)",
            }}
          >
            <GitBranch className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--ci-accent)" }} />
            {thread.versions.length > 0 ? (
              <div className="flex items-center gap-1">
                {thread.versions.slice(-3).map((ver) => {
                  const isActive = thread.activeVersionId === ver.versionId;
                  return (
                    <button
                      key={ver.versionId}
                      type="button"
                      onClick={() => handleSelectVersion(ver.versionId)}
                      title={`Restaurar ${ver.versionId}: ${ver.label}`}
                      className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold cursor-pointer"
                      style={{
                        backgroundColor: isActive ? "var(--ci-accent)" : "transparent",
                        color: isActive ? "var(--ci-accent-contrast)" : "var(--ci-text)",
                      }}
                    >
                      {ver.versionId}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="font-mono text-[10px] font-bold" style={{ color: "var(--ci-text)" }}>
                V1
              </span>
            )}
          </div>

          {/* Alternância Auto (ON/OFF) */}
          <button
            type="button"
            onClick={() => {
              const next = {
                ...thread,
                autoApplyWhenValidated: !thread.autoApplyWhenValidated,
              };
              persistAndSetThread(next);
            }}
            aria-label="Alternar aplicação automática quando validado"
            aria-pressed={thread.autoApplyWhenValidated}
            title="Aplicar automaticamente quando VALIDADO"
            className="min-h-[44px] px-2.5 rounded-md border font-mono text-[10px] font-semibold shrink-0 cursor-pointer"
            style={{
              backgroundColor: thread.autoApplyWhenValidated
                ? "var(--ci-surface-2)"
                : "transparent",
              borderColor: thread.autoApplyWhenValidated
                ? "var(--ci-success)"
                : "var(--ci-border)",
              color: thread.autoApplyWhenValidated
                ? "var(--ci-success)"
                : "var(--ci-text-muted)",
            }}
          >
            Auto: {thread.autoApplyWhenValidated ? "ON" : "OFF"}
          </button>

          {/* Ajustes, Gabaritos & Variáveis (ícone de 44px com aria-label) */}
          <button
            type="button"
            onClick={() =>
              setActiveTopDrawer((d) =>
                d === "templates_vars_prefs" ? "none" : "templates_vars_prefs",
              )
            }
            aria-label="Ajustes, gabaritos e variáveis paramétricas"
            aria-pressed={activeTopDrawer === "templates_vars_prefs"}
            title="Meus Gabaritos, Variáveis Paramétricas Globais e Preferências"
            className="min-h-[44px] min-w-[44px] rounded-md border flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor:
                activeTopDrawer === "templates_vars_prefs"
                  ? "var(--ci-surface-2)"
                  : "transparent",
              borderColor:
                activeTopDrawer === "templates_vars_prefs"
                  ? "var(--ci-accent)"
                  : "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* Atividade / Suíte Golden / Log (ícone de 44px com aria-label) */}
          <button
            type="button"
            onClick={() =>
              setActiveTopDrawer((d) =>
                d === "golden_observability" ? "none" : "golden_observability",
              )
            }
            aria-label="Atividade, log de observabilidade e suíte de testes"
            aria-pressed={activeTopDrawer === "golden_observability"}
            title="Suíte Golden e Observabilidade por Turno"
            className="min-h-[44px] min-w-[44px] rounded-md border flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor:
                activeTopDrawer === "golden_observability"
                  ? "var(--ci-surface-2)"
                  : "transparent",
              borderColor:
                activeTopDrawer === "golden_observability"
                  ? "var(--ci-accent)"
                  : "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* Pastas / Histórico de Conversas com contador (ícone de 44px com aria-label) */}
          <button
            type="button"
            onClick={() =>
              setActiveTopDrawer((d) => (d === "conversations" ? "none" : "conversations"))
            }
            aria-label="Histórico de conversas do projeto"
            aria-pressed={activeTopDrawer === "conversations"}
            title="Gerenciar histórico de conversas do projeto"
            className="min-h-[44px] min-w-[44px] px-2 rounded-md border flex items-center justify-center gap-1 shrink-0 cursor-pointer"
            style={{
              backgroundColor:
                activeTopDrawer === "conversations" ? "var(--ci-surface-2)" : "transparent",
              borderColor:
                activeTopDrawer === "conversations" ? "var(--ci-accent)" : "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            <FolderOpen className="w-4 h-4" />
            {thread.messages.length > 0 && (
              <span
                className="rounded px-1 font-mono text-[10px] font-bold"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  color: "var(--ci-accent)",
                }}
              >
                {Math.ceil(thread.messages.length / 2)}
              </span>
            )}
          </button>

          {/* Quando a prévia está em tela cheia, exibe botão "Conversa" sempre visível (§2) */}
          {isFullscreenPreview && (
            <button
              type="button"
              onClick={() => setIsFullscreenPreview(false)}
              aria-label="Voltar para a conversa"
              className="min-h-[44px] px-3 rounded-md border font-mono text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              style={{
                backgroundColor: "var(--ci-accent)",
                borderColor: "var(--ci-accent)",
                color: "var(--ci-accent-contrast)",
              }}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversa</span>
            </button>
          )}

          {/* Botão Fechar sempre visível (44px) */}
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Fechar CHAMFER INTENT"
            title="Fechar (Esc)"
            className="min-h-[44px] min-w-[44px] rounded-md border flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* CONFIRMAÇÃO AO FECHAR COM PLANO PENDENTE (§2) */}
      {showCloseConfirm && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b text-xs font-mono shrink-0"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-warning)",
            color: "var(--ci-text)",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--ci-warning)" }} />
            <span>
              Há um plano geométrico pendente não aplicado. Seu rascunho será mantido, mas a peça
              ainda não foi inserida no canvas.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCloseConfirm(false)}
              className="min-h-[36px] px-3 rounded border font-bold cursor-pointer"
              style={{
                backgroundColor: "var(--ci-surface)",
                borderColor: "var(--ci-border)",
                color: "var(--ci-text)",
              }}
            >
              Continuar editando
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCloseConfirm(false);
                onClose();
              }}
              className="min-h-[36px] px-3 rounded font-bold cursor-pointer"
              style={{
                backgroundColor: "var(--ci-danger)",
                color: "var(--ci-accent-contrast)",
              }}
            >
              Fechar mesmo assim
            </button>
          </div>
        </div>
      )}

      {/* FAIXA DE STATUS SEMÂNTICA PRÓPRIA (§3: até 2 linhas, toque para expandir ou copiar; some quando ocioso) */}
      {activeStatusBanner && !effectiveMinimized && (
        <div
          role="status"
          onClick={() => setIsStatusExpanded((v) => !v)}
          className="flex items-start justify-between gap-2 px-3 py-1.5 border-b text-xs cursor-pointer shrink-0"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor:
              activeStatusBanner.tone === "danger"
                ? "var(--ci-danger)"
                : activeStatusBanner.tone === "warning"
                  ? "var(--ci-warning)"
                  : activeStatusBanner.tone === "success"
                    ? "var(--ci-success)"
                    : "var(--ci-accent)",
            color: "var(--ci-text)",
          }}
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {activeStatusBanner.tone === "danger" ? (
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--ci-danger)" }}
              />
            ) : activeStatusBanner.tone === "warning" ? (
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--ci-warning)" }}
              />
            ) : activeStatusBanner.tone === "success" ? (
              <CheckCircle2
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--ci-success)" }}
              />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--ci-accent)" }} />
            )}

            <div className={isStatusExpanded ? "min-w-0" : "min-w-0 line-clamp-2"}>
              <span
                className="font-mono font-bold mr-1.5"
                style={{
                  color:
                    activeStatusBanner.tone === "danger"
                      ? "var(--ci-danger)"
                      : activeStatusBanner.tone === "warning"
                        ? "var(--ci-warning)"
                        : activeStatusBanner.tone === "success"
                          ? "var(--ci-success)"
                          : "var(--ci-accent)",
                }}
              >
                {activeStatusBanner.title}:
              </span>
              <span style={{ color: "var(--ci-text-muted)" }}>{activeStatusBanner.detail}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyText(
                  `${activeStatusBanner.title}: ${activeStatusBanner.detail}`,
                  "Status copiado.",
                );
              }}
              aria-label="Copiar texto completo do status"
              title="Copiar texto completo do status"
              className="p-1 rounded cursor-pointer"
              style={{ color: "var(--ci-text-muted)" }}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            {isStatusExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--ci-text-muted)" }} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--ci-text-muted)" }} />
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* GAVETAS DO CABEÇALHO (CONVERSAS · GABARITOS/VARS/PREFS · SUÍTE GOLDEN) */}
      {/* ===================================================================== */}
      {activeTopDrawer === "conversations" && !effectiveMinimized && (
        <div
          className="border-b p-3 space-y-2.5 max-h-60 overflow-y-auto shrink-0"
          style={{
            backgroundColor: "var(--ci-surface)",
            borderColor: "var(--ci-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--ci-text-muted)" }}
              />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Buscar conversas ou comandos..."
                className="w-full rounded-md border pl-8 pr-3 py-1.5 text-xs outline-none"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const fresh = createConversationThread(
                    projectId,
                    `Conversa #${projectConversations.length + 1}`,
                  );
                  persistAndSetThread(fresh);
                  setActiveTopDrawer("none");
                }}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-accent)",
                  color: "var(--ci-accent-contrast)",
                }}
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Nova Conversa</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportConversation("json")}
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-mono cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportConversation("dsl")}
                className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-mono cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-accent)",
                }}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>DSL</span>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {projectConversations.length === 0 ? (
              <p
                className="text-xs py-2 text-center font-mono"
                style={{ color: "var(--ci-text-muted)" }}
              >
                Nenhuma conversa encontrada para este filtro.
              </p>
            ) : (
              projectConversations.map((conv) => {
                const isCurrent = conv.id === thread.id;
                const isRenaming = renamingThreadId === conv.id;
                return (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between gap-2 rounded-md px-3 py-2 border"
                    style={{
                      backgroundColor: "var(--ci-surface-2)",
                      borderColor: isCurrent ? "var(--ci-accent)" : "var(--ci-border)",
                      color: "var(--ci-text)",
                    }}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={renameTitleDraft}
                          onChange={(e) => setRenameTitleDraft(e.target.value)}
                          className="flex-1 rounded border px-2 py-1 text-xs outline-none"
                          style={{
                            backgroundColor: "var(--ci-surface)",
                            borderColor: "var(--ci-accent)",
                            color: "var(--ci-text)",
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = renameConversationThread(conv.id, renameTitleDraft);
                            if (updated && updated.id === thread.id) {
                              setThread(updated);
                            }
                            setRenamingThreadId(null);
                          }}
                          className="px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                          style={{
                            backgroundColor: "var(--ci-success)",
                            color: "var(--ci-accent-contrast)",
                          }}
                        >
                          Salvar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setThread(conv);
                          setActiveTopDrawer("none");
                        }}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold truncate">{conv.title}</span>
                          <span
                            className="text-[10px] font-mono"
                            style={{ color: "var(--ci-text-muted)" }}
                          >
                            {Math.ceil(conv.messages.length / 2)} turno(s) ·{" "}
                            {conv.versions.length} vers.
                          </span>
                        </div>
                      </button>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingThreadId(conv.id);
                          setRenameTitleDraft(conv.title);
                        }}
                        className="p-1.5 rounded cursor-pointer"
                        style={{ color: "var(--ci-text-muted)" }}
                        title="Renomear conversa"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteConversationThread(conv.id);
                          const remaining = listProjectConversations(projectId);
                          if (conv.id === thread.id) {
                            setThread(
                              remaining[0] ?? createConversationThread(projectId, "Conversa #1"),
                            );
                          } else {
                            setThread({ ...thread });
                          }
                        }}
                        className="p-1.5 rounded cursor-pointer"
                        style={{ color: "var(--ci-danger)" }}
                        title="Excluir conversa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTopDrawer === "templates_vars_prefs" && !effectiveMinimized && (
        <div
          className="border-b p-3.5 space-y-3 max-h-64 overflow-y-auto shrink-0"
          style={{
            backgroundColor: "var(--ci-surface)",
            borderColor: "var(--ci-border)",
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] font-mono uppercase tracking-wider flex items-center gap-1"
                style={{ color: "var(--ci-accent)" }}
              >
                <Bookmark className="w-3 h-3" /> Meus Gabaritos (Templates Paramétricos)
              </span>
              {previewSourcePlan && (
                <button
                  type="button"
                  onClick={handleSaveCurrentPlanAsTemplate}
                  className="px-2 py-0.5 rounded border text-[10px] font-mono cursor-pointer"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-accent)",
                    color: "var(--ci-accent)",
                  }}
                >
                  + Salvar Peça Atual como Gabarito
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {savedTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(tpl.prompt);
                      setParameterOverrides({ ...tpl.defaultParameters });
                      setActiveTopDrawer("none");
                      toast.success(`Gabarito "${tpl.name}" carregado.`);
                    }}
                    className="text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <span
                      className="block text-xs font-semibold truncate"
                      style={{ color: "var(--ci-text)" }}
                    >
                      {tpl.name}
                    </span>
                    <span
                      className="block text-[10px] font-mono truncate"
                      style={{ color: "var(--ci-text-muted)" }}
                    >
                      {tpl.prompt}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSavedIntentTemplate(tpl.id);
                      setSavedTemplates(listSavedIntentTemplates());
                    }}
                    className="p-1 cursor-pointer"
                    style={{ color: "var(--ci-danger)" }}
                    title="Remover gabarito"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div
            className="space-y-1.5 pt-2 border-t"
            style={{ borderColor: "var(--ci-border)" }}
          >
            <span
              className="block text-[10px] font-mono uppercase tracking-wider"
              style={{ color: "var(--ci-success)" }}
            >
              Variáveis Paramétricas Globais (Use expressões como W/2, 2*R)
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(globalVars).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px]"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-border)",
                  }}
                >
                  <span className="font-bold" style={{ color: "var(--ci-success)" }}>
                    {k} =
                  </span>
                  <input
                    type="number"
                    value={v}
                    onChange={(e) => {
                      const updated = saveGlobalParametricVars({
                        ...globalVars,
                        [k]: Number(e.target.value),
                      });
                      setGlobalVars(updated);
                    }}
                    className="w-14 bg-transparent outline-none border-b text-center"
                    style={{
                      borderColor: "var(--ci-border)",
                      color: "var(--ci-text)",
                    }}
                  />
                </div>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value.toUpperCase())}
                  placeholder="VAR"
                  className="w-12 rounded border px-1.5 py-1 font-mono text-[10px]"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-border)",
                    color: "var(--ci-text)",
                  }}
                />
                <input
                  type="number"
                  value={newVarValue}
                  onChange={(e) => setNewVarValue(e.target.value)}
                  placeholder="mm"
                  className="w-14 rounded border px-1.5 py-1 font-mono text-[10px]"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-border)",
                    color: "var(--ci-text)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newVarName.trim().replace(/[^A-Z0-9_]/g, "");
                    const num = Number(newVarValue);
                    if (clean && Number.isFinite(num)) {
                      const updated = saveGlobalParametricVars({
                        ...globalVars,
                        [clean]: num,
                      });
                      setGlobalVars(updated);
                      setNewVarName("");
                      setNewVarValue("");
                    }
                  }}
                  className="px-2 py-1 rounded font-mono text-[10px] font-bold cursor-pointer"
                  style={{
                    backgroundColor: "var(--ci-success)",
                    color: "var(--ci-accent-contrast)",
                  }}
                >
                  + Var
                </button>
              </div>
            </div>
          </div>

          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t text-[10px] font-mono"
            style={{ borderColor: "var(--ci-border)" }}
          >
            <label className="block">
              <span style={{ color: "var(--ci-text-muted)" }}>Unidade Padrão</span>
              <select
                value={userPrefs.defaultUnit}
                onChange={(e) =>
                  setUserPrefs(
                    saveUserIntentPreferences({
                      defaultUnit: e.target.value as UserIntentPreferences["defaultUnit"],
                    }),
                  )
                }
                className="mt-0.5 w-full rounded border px-2 py-1"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <option value="mm">Milímetros (mm)</option>
                <option value="cm">Centímetros (cm)</option>
                <option value="in">Polegadas (in)</option>
              </select>
            </label>

            <label className="block">
              <span style={{ color: "var(--ci-text-muted)" }}>Material Padrão</span>
              <select
                value={userPrefs.defaultMaterial}
                onChange={(e) =>
                  setUserPrefs(saveUserIntentPreferences({ defaultMaterial: e.target.value }))
                }
                className="mt-0.5 w-full rounded border px-2 py-1"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <option value="Aço Carbono SAE 1020">Aço SAE 1020</option>
                <option value="Aço Inox AISI 304">Inox AISI 304</option>
                <option value="Alumínio Naval 5052">Alumínio 5052</option>
                <option value="Aço Corten">Aço Corten</option>
              </select>
            </label>

            <label className="block">
              <span style={{ color: "var(--ci-text-muted)" }}>Espessura (mm)</span>
              <input
                type="number"
                step={0.5}
                min={0.5}
                value={userPrefs.defaultThicknessMm}
                onChange={(e) =>
                  setUserPrefs(
                    saveUserIntentPreferences({ defaultThicknessMm: Number(e.target.value) }),
                  )
                }
                className="mt-0.5 w-full rounded border px-2 py-1"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              />
            </label>

            <div className="flex flex-col justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  setUserPrefs(saveUserIntentPreferences({ ttsEnabled: !userPrefs.ttsEnabled }))
                }
                className="flex items-center justify-center gap-1 rounded px-2 py-1 border cursor-pointer"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: userPrefs.ttsEnabled ? "var(--ci-accent)" : "var(--ci-border)",
                  color: userPrefs.ttsEnabled ? "var(--ci-accent)" : "var(--ci-text-muted)",
                }}
              >
                <Volume2 className="w-3 h-3" />
                <span>Voz TTS: {userPrefs.ttsEnabled ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTopDrawer === "golden_observability" && !effectiveMinimized && (
        <div
          className="border-b p-3.5 space-y-2.5 max-h-64 overflow-y-auto shrink-0"
          style={{
            backgroundColor: "var(--ci-surface)",
            borderColor: "var(--ci-border)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold font-mono"
                style={{ color: "var(--ci-success)" }}
              >
                Suíte Golden §10 (43 casos em pt-BR) & Telemetria
              </span>
              <span
                className="rounded border px-2 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: "var(--ci-surface-2)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text-muted)",
                }}
              >
                p50 compilação: {obsMetrics.p50CompilationMs} ms · 0 geom. inválida aplicada
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const report = runGoldenSuiteV2();
                setGoldenReport(report);
                toast.success(
                  `Suíte Golden executada: ${report.passedCases}/${report.totalCases} (${report.passRatePercent}%) aprovados · p50=${report.p50DurationMs}ms`,
                );
              }}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 font-mono text-[11px] font-bold cursor-pointer"
              style={{
                backgroundColor: "var(--ci-success)",
                color: "var(--ci-accent-contrast)",
              }}
            >
              <Play className="w-3.5 h-3.5" />
              <span>Rodar testes (43 frases)</span>
            </button>
          </div>

          {goldenReport && (
            <div
              className="rounded-md border p-2.5 space-y-1.5 text-[11px] font-mono"
              style={{
                backgroundColor: "var(--ci-surface-2)",
                borderColor: "var(--ci-success)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold" style={{ color: "var(--ci-success)" }}>
                  Resultado: {goldenReport.passedCases}/{goldenReport.totalCases} (
                  {goldenReport.passRatePercent}%) —{" "}
                  {goldenReport.meets95PercentCriterion
                    ? "CRITÉRIO ≥95% ATINGIDO"
                    : "ABAIXO DE 95%"}
                </span>
                <span style={{ color: "var(--ci-text-muted)" }}>
                  p50: {goldenReport.p50DurationMs} ms · Inválidas aplicadas:{" "}
                  {goldenReport.invalidGeometryAppliedCount}
                </span>
              </div>
            </div>
          )}

          {obsLogs.length > 0 && (
            <div className="space-y-1">
              <span
                className="block text-[10px] font-mono uppercase"
                style={{ color: "var(--ci-text-muted)" }}
              >
                Últimos Turnos Registrados (Observabilidade §10)
              </span>
              {obsLogs.slice(0, 4).map((log) => (
                <div
                  key={log.turnId}
                  className="flex items-center justify-between gap-2 rounded border px-2.5 py-1 text-[10px] font-mono"
                  style={{
                    backgroundColor: "var(--ci-surface-2)",
                    borderColor: "var(--ci-border)",
                  }}
                >
                  <span className="truncate max-w-[240px]" style={{ color: "var(--ci-text)" }}>
                    {log.rawInput}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--ci-accent)" }}>
                    {log.toolCallNames.join(", ") || "local"} · {log.compilationTimeMs} ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO MINI-SHEET QUANDO "CANVAS" (INSPECIONAR NO CANVAS PRINCIPAL) ATIVO */}
      {/* ===================================================================== */}
      {effectiveMinimized ? (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{
            backgroundColor: "var(--ci-surface)",
            color: "var(--ci-text)",
          }}
        >
          <div className="min-w-0">
            <span className="text-xs font-bold block truncate">
              {previewSourcePlan?.intent.summary ?? "Inspecionando Canvas Principal"}
            </span>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--ci-text-muted)" }}>
              Visualizando a peça diretamente sobre o Canvas Principal do CHAMFER.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsMinimizedToSheet(false);
                setIsPeekingCanvas(false);
              }}
              className="min-h-[44px] px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: "var(--ci-surface-2)",
                borderColor: "var(--ci-border)",
                color: "var(--ci-text)",
              }}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Restaurar Tela Cheia</span>
            </button>
            {activeIntentPlan && (
              <button
                type="button"
                disabled={!canApplyPlan}
                onClick={() => handleConfirmPlan(false)}
                className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: canApplyPlan ? "var(--ci-accent)" : "var(--ci-surface-2)",
                  color: canApplyPlan ? "var(--ci-accent-contrast)" : "var(--ci-text-muted)",
                }}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aplicar</span>
              </button>
            )}
          </div>
        </div>
      ) : isFullscreenPreview ? (
        /* =================================================================== */
        /* MODO PRÉVIA EXPANDIDA (TELA CHEIA DA PRÉVIA — §2):                   */
        /* Nunca bloqueia a conversa por completo: mantém botão "Conversa" no  */
        /* topo e linha mínima de composer no rodapé.                          */
        /* =================================================================== */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 p-2">{renderCadPreviewViewport()}</div>
          {renderContextAndComposerFooter()}
        </div>
      ) : viewportState.layoutMode === "compact" ? (
        /* =================================================================== */
        /* LAYOUT COMPACTO (< 640 px, retrato — §2):                           */
        /* (2) Região de trabalho: Prévia FIXA + alça de redimensionamento ≥44px */
        /* + única área rolável com PARÂMETROS EXTRAÍDOS e histórico           */
        /* (3) Barra de contexto + (4) Composer fixo no rodapé                 */
        /* =================================================================== */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Prévia CAD Fixa no topo da região de trabalho */}
          <div
            className="w-full px-2 pt-2 shrink-0 transition-[height] duration-150"
            style={{ height: compactPreviewHeightCss }}
          >
            {renderCadPreviewViewport()}
          </div>

          {/* Alça de redimensionamento com área de toque ≥ 44 px e 3 alturas (mínima, padrão, ampliada — §2) */}
          <button
            type="button"
            onClick={cycleCompactPreviewStop}
            aria-label={`Alternar altura da prévia CAD (atual: ${
              compactPreviewStop === "min"
                ? "mínima"
                : compactPreviewStop === "expanded"
                  ? "ampliada"
                  : "padrão"
            })`}
            title="Toque para alternar altura da prévia (Padrão → Ampliada → Mínima)"
            className="min-h-[44px] w-full px-3 border-b flex items-center justify-center gap-2 font-mono text-[10px] shrink-0 cursor-pointer"
            style={{
              backgroundColor: "var(--ci-surface)",
              borderColor: "var(--ci-border)",
              color: "var(--ci-text-muted)",
            }}
          >
            <GripHorizontal className="w-4 h-4" />
            <span>
              ALTURA DA PRÉVIA:{" "}
              <strong style={{ color: "var(--ci-text)" }}>
                {viewportState.isKeyboardOpen
                  ? "COMPACTA (TECLADO)"
                  : compactPreviewStop === "min"
                    ? "MÍNIMA (~148px)"
                    : compactPreviewStop === "expanded"
                      ? "AMPLIADA (~56%)"
                      : "PADRÃO"}
              </strong>
            </span>
          </button>

          {/* ÚNICA ÁREA QUE ROLA: PARÂMETROS EXTRAÍDOS + Diagnósticos + Conversa (§2) */}
          <div
            ref={chatScrollRef}
            aria-live="polite"
            className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
          >
            {renderExtractedParametersSection()}
            {renderPlanDiagnosticsAndUnresolved()}
            {renderConversationHistoryAndExamples()}
          </div>

          {/* Zonas 3 e 4 fixas no rodapé */}
          {renderContextAndComposerFooter()}
        </div>
      ) : (
        /* =================================================================== */
        /* LAYOUT MÉDIO (640–1023 px / paisagem) E EXPANDIDO (≥ 1024 px — §2): */
        /* Duas colunas: conversa e composer à esquerda (36–42%),              */
        /* prévia e parâmetros à direita (com divisor ajustável no expandido). */
        /* =================================================================== */
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Coluna Esquerda: Conversa rolável + Barra de Contexto + Composer */}
          <div
            className="flex flex-col min-h-0 h-full border-r overflow-hidden"
            style={{
              width:
                viewportState.layoutMode === "expanded"
                  ? `${expandedLeftSplitPercent}%`
                  : "40%",
              borderColor: "var(--ci-border)",
            }}
          >
            <div
              ref={chatScrollRef}
              aria-live="polite"
              className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3"
            >
              {renderPlanDiagnosticsAndUnresolved()}
              {renderConversationHistoryAndExamples()}
            </div>

            {renderContextAndComposerFooter()}
          </div>

          {/* Divisor vertical ajustável no modo EXPANDIDO (≥ 1024 px — §2) */}
          {viewportState.layoutMode === "expanded" && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar largura entre conversa e prévia CAD"
              onPointerDown={() => {
                splitterDragRef.current = true;
              }}
              className="w-2 hover:w-2.5 cursor-col-resize flex items-center justify-center shrink-0 transition-colors"
              style={{
                backgroundColor: "var(--ci-surface)",
                borderRight: "1px solid var(--ci-border)",
              }}
              title="Arraste para ajustar proporção entre Conversa e Prévia CAD"
            >
              <div
                className="w-0.5 h-10 rounded"
                style={{ backgroundColor: "var(--ci-text-muted)" }}
              />
            </div>
          )}

          {/* Coluna Direita: Prévia CAD ocupando o espaço principal + Parâmetros Extraídos */}
          <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden p-3 gap-3">
            <div className="flex-1 min-h-[220px]">{renderCadPreviewViewport()}</div>
            {dynamicFormSpec && groupedParameterFields.length > 0 && (
              <div className="max-h-[42%] overflow-y-auto shrink-0">
                {renderExtractedParametersSection()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(portalContent, document.body);
}
